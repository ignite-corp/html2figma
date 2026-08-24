import {
  H2F_VERSION,
  type AssetMap,
  type H2FDocument,
} from "@html2figma/shared";
import { CdpSession } from "./cdp.js";
import { COMPUTED_STYLES } from "./styleProps.js";
import { parseAllDocuments, type CaptureSnapshotResult } from "./snapshot.js";
import { buildIR, type SvgRequest } from "./builder.js";
import { collectImageAssets } from "./assets.js";
import type { H2FNode, FrameNode } from "@html2figma/shared";
import {
  tagElements,
  collectPseudoIcons,
  applyPseudoIcons,
  fetchSvgMarkup,
} from "./pseudo.js";

export interface CaptureOptions {
  onProgress?: (step: string, ratio: number) => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 문서 전체 크기(CSS px)와 device px 배율(DPR)을 측정. 실패 시 fallback. 폭주 방지 상한. */
const MAX_PAGE_HEIGHT = 30000;
const MAX_PAGE_WIDTH = 10000;
/**
 * 탭의 실제 CSS 뷰포트 크기를 읽는다.
 * 캡처를 고정 폭이 아니라 사용자가 실제로 보고 있는 창 폭에 맞춰,
 * 반응형 그리드의 컬럼 수(예: 1440=3열 vs 1600↑=4열)가 사용자 화면과
 * 달라지는 문제를 막는다.
 */
async function readRealViewport(
  session: CdpSession
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await session.send<{ result?: { value?: string } }>(
      "Runtime.evaluate",
      {
        expression:
          "JSON.stringify({w:window.innerWidth,h:window.innerHeight})",
        returnByValue: false,
      }
    );
    const raw = res?.result?.value;
    if (!raw) return null;
    const v = JSON.parse(raw) as { w?: number; h?: number };
    if (!v.w || !v.h) return null;
    return { width: Math.round(v.w), height: Math.round(v.h) };
  } catch {
    return null;
  }
}

async function measurePage(
  session: CdpSession,
  fallbackWidth: number,
  fallbackHeight: number
): Promise<{ cssWidth: number; cssHeight: number; scale: number }> {
  try {
    const m = await session.send<{
      cssContentSize?: { width: number; height: number };
      contentSize?: { width: number; height: number };
    }>("Page.getLayoutMetrics");
    const cssH = m?.cssContentSize?.height ?? m?.contentSize?.height ?? fallbackHeight;
    const cssHeight = Math.min(Math.max(Math.ceil(cssH), fallbackHeight), MAX_PAGE_HEIGHT);
    const cssW = m?.cssContentSize?.width ?? m?.contentSize?.width ?? fallbackWidth;
    const cssWidth = Math.min(Math.max(Math.ceil(cssW), fallbackWidth), MAX_PAGE_WIDTH);
    // DOMSnapshot bounds 는 device px(레티나면 ×DPR)로 오는데 font-size 는 CSS px 이다.
    // 두 값을 일치시키기 위해 배율을 구해 좌표를 CSS px 로 정규화한다.
    let scale = 1;
    const devH = m?.contentSize?.height;
    const cssContentH = m?.cssContentSize?.height;
    if (devH && cssContentH && cssContentH > 0) {
      scale = devH / cssContentH;
    }
    if (!Number.isFinite(scale) || scale < 1) scale = 1;
    return { cssWidth, cssHeight, scale };
  } catch {
    return { cssWidth: fallbackWidth, cssHeight: fallbackHeight, scale: 1 };
  }
}

/**
 * IR 트리에서 가장 넓은 노드의 폭을 구한다.
 * 대개 full-width 레이아웃 컨테이너(body/.wrap 등)의 폭이며, 좁게 삐져나온
 * bleed 요소(가로 캐러셀 등)는 폭 자체가 작아 자연스럽게 제외된다.
 */
function maxWidthOf(node: H2FNode): number {
  let w = node.layout?.width ?? 0;
  const kids = (node as { children?: H2FNode[] }).children;
  if (Array.isArray(kids)) {
    for (const c of kids) {
      const cw = maxWidthOf(c);
      if (cw > w) w = cw;
    }
  }
  return w;
}

/**
 * 실제로 보이는(클립 안 된) "블록형" 콘텐츠의 최대 우측 끝(x+width)을 구한다.
 * 사이드바 등으로 우측으로 밀린 넓은 테이블처럼, 폭 자체는 루트보다 좁아도 우측으로
 * 삐져나온 콘텐츠의 오른쪽 끝을 흰 배경이 덮게 하기 위함이다. minWidth 미만의 작은
 * 오버레이(툴팁·드롭다운)는 제외해 폭이 불필요하게 커지는 것을 막는다. overflow 를
 * 자르는 subtree 는 빌더에서 이미 제거되므로 오프스크린 bleed 는 자연히 빠진다.
 */
function maxBlockRight(node: H2FNode, minWidth: number): number {
  let r = -Infinity;
  if (node.layout && node.layout.width >= minWidth) {
    r = node.layout.x + node.layout.width;
  }
  const kids = (node as { children?: H2FNode[] }).children;
  if (Array.isArray(kids)) {
    for (const c of kids) {
      const cr = maxBlockRight(c, minWidth);
      if (cr > r) r = cr;
    }
  }
  return r;
}

/**
 * 프레임 폭을 자식들을 담을 수 있도록 넓힌다(bottom-up).
 * body 나 wrapper 처럼 자기보다 넓은 자손(min-width 고정 레이아웃 등)을 가진 컨테이너가
 * 실제로는 배경이 전체 폭을 덮는데도 좁게(뷰포트-스크롤바) 잡히는 문제를 바로잡는다.
 * 좌표는 절대값. maxRight(대개 루트 우측)로 상한을 두어 가로 bleed 로 폭주하지 않게 한다.
 * overflow 를 자르는 프레임(clipsContent)은 의도적으로 자식을 가두므로 확장하지 않는다.
 */
/**
 * 뷰포트를 꽉 덮는 `position: fixed` 오버레이를 루트 박스까지 늘린다.
 *
 * fixed 요소는 뷰포트 기준이라 스냅샷 bounds 가 뷰포트 크기다. 전체 페이지 캡처는 문서
 * 전체를 한 장으로 펼치므로, 모달 딤드처럼 화면을 덮는 오버레이가 문서의 우측/하단을
 * 덮지 못해 밝은 띠가 남는다(브라우저에서는 fixed 가 스크롤을 따라다녀 보이지 않는 틈).
 *
 * 뷰포트의 90% 이상을 덮는 것만 대상으로 삼아 sticky 헤더·플로팅 버튼 같은 일반 fixed
 * 요소는 건드리지 않는다. x/y 는 그대로 두고 크기만 늘려 자식 좌표에 영향을 주지 않는다.
 */
function stretchViewportOverlays(
  frames: FrameNode[],
  root: FrameNode,
  vpWidth: number,
  vpHeight: number
): void {
  const right = root.layout.x + root.layout.width;
  const bottom = root.layout.y + root.layout.height;
  for (const f of frames) {
    if (f.layout.width < vpWidth * 0.9 || f.layout.height < vpHeight * 0.9) continue;
    const width = Math.max(f.layout.width, right - f.layout.x);
    const height = Math.max(f.layout.height, bottom - f.layout.y);
    if (width === f.layout.width && height === f.layout.height) continue;
    f.layout = { ...f.layout, width, height };
  }
}

function expandToFitChildren(node: H2FNode, maxRight: number): void {
  if (node.type !== "frame") return;
  const frame = node as FrameNode;
  for (const c of frame.children) expandToFitChildren(c, maxRight);
  if (frame.style.clipsContent) return;
  let childRight = -Infinity;
  for (const c of frame.children) {
    if (!c.layout) continue;
    // 프레임과 비슷하거나 더 넓은 "블록형" 자식만 확장 기준으로 삼는다.
    // (작은 절대배치 오버레이·툴팁·드롭다운이 프레임을 부풀리는 것을 방지)
    if (c.layout.width < frame.layout.width * 0.9) continue;
    const r = c.layout.x + c.layout.width;
    if (r > childRight) childRight = r;
  }
  if (childRight === -Infinity) return;
  const desired = childRight - frame.layout.x;
  const capped = Math.min(Math.max(frame.layout.width, desired), maxRight - frame.layout.x);
  if (capped > frame.layout.width) {
    frame.layout = { ...frame.layout, width: capped };
  }
}

async function collectSvgAssets(
  session: CdpSession,
  requests: SvgRequest[]
): Promise<AssetMap> {
  const map: AssetMap = {};
  for (const req of requests) {
    try {
      const res = await session.send<{ outerHTML: string }>("DOM.getOuterHTML", {
        backendNodeId: req.backendNodeId,
      });
      if (res?.outerHTML && /<svg[\s>]/i.test(res.outerHTML)) {
        map[req.assetId] = { kind: "svg", markup: res.outerHTML };
      }
    } catch {
      /* 개별 실패는 무시 */
    }
  }
  return map;
}

export async function capturePage(
  tabId: number,
  opts: CaptureOptions
): Promise<H2FDocument> {
  const { onProgress } = opts;
  // 항상 사용자가 실제로 보고 있는 창 크기로 캡처한다(desktop 기준, DPR 1).
  const vp = { width: 1440, height: 900, deviceScaleFactor: 1 };
  const session = new CdpSession(tabId);

  onProgress?.("연결 중", 0.05);
  await session.connect();

  try {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    await session.send("Page.enable");
    await session.send("DOMSnapshot.enable");

    onProgress?.("뷰포트 설정", 0.15);
    const real = await readRealViewport(session);
    if (real && real.width >= 320) {
      vp.width = real.width;
      vp.height = Math.max(real.height, vp.height);
    }
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.deviceScaleFactor,
      mobile: false,
    });

    await delay(400);

    // 전체 페이지(스크롤 영역 포함)를 캡처하기 위해 문서 실제 높이만큼 뷰포트를 확장.
    // 고정 뷰포트로만 스냅샷을 뜨면 접힌 영역(footer 등)이 잘린다.
    const { cssWidth: fullWidth, cssHeight: fullHeight, scale } = await measurePage(
      session,
      vp.width,
      vp.height
    );
    if (fullHeight > vp.height) {
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: fullHeight,
        deviceScaleFactor: vp.deviceScaleFactor,
        mobile: false,
      });
      await delay(300);
    }

    onProgress?.("페이지 캡처", 0.3);
    // 의사요소 아이콘을 호스트 프레임 안에 넣기 위해, 스냅샷 전에 각 요소에 식별자를 부여한다.
    await tagElements(session);
    const snapshot = await session.send<CaptureSnapshotResult>(
      "DOMSnapshot.captureSnapshot",
      {
        computedStyles: COMPUTED_STYLES,
        includePaintOrder: true,
        includeDOMRects: true,
      }
    );

    onProgress?.("트리 분석", 0.5);
    const parsed = parseAllDocuments(snapshot, scale);
    if (!parsed.documents[0]?.root) throw new Error("캡처된 노드가 없습니다.");

    // DOMSnapshot 에 없는 ::before/::after 아이콘을 페이지에서 먼저 수집한다.
    // 빌더가 "아이콘이 달린 호스트"를 알아야 그 요소를 프루닝하지 않고 남길 수 있다
    // (프루닝되면 아이콘이 호스트를 잃고 루트로 올라가 모달 위로 떠오른다).
    onProgress?.("아이콘 수집", 0.45);
    const pseudoIcons = await collectPseudoIcons(session);
    const pseudoHostIds = new Set(
      pseudoIcons.map((p) => p.hostId).filter((id): id is string => !!id)
    );

    const {
      root,
      imageUrls,
      svgRequests,
      svgUrlRequests,
      hostFrames,
      fixedFrames,
      bodyClipsX,
    } = buildIR(parsed, pseudoHostIds);
    if (!root) throw new Error("변환할 노드가 없습니다.");

    // 루트 프레임 폭을 "실제 레이아웃 폭"에 맞춘다.
    //  - cssContentSize.width(fullWidth)는 가로로 삐져나온 캐러셀 등 오프스크린 bleed 까지
    //    포함해 실제 레이아웃보다 넓어져, footer 처럼 width:100% 인 요소가 우측 끝까지
    //    안 채워지는 것처럼 보인다.
    //  - 반대로 뷰포트 폭만 쓰면 min-width 고정 레이아웃(예: min-width:1600)이 뷰포트보다
    //    넓을 때 콘텐츠가 잘린다.
    // 해결: 트리에서 가장 넓은 노드 폭(대개 full-width 레이아웃 컨테이너)을 레이아웃 폭으로 보고
    //       뷰포트와 스크롤 폭(bleed 상한) 사이로 클램프한다. 좁은 bleed 요소는 폭이 작아 제외됨.
    //  - 추가: 사이드바 등으로 우측으로 밀린 넓은 테이블은 폭(width) 자체는 루트보다 좁아도
    //    오른쪽 끝(x+width)이 루트를 넘어설 수 있다. 이 경우 흰 배경이 못 덮어 캔버스(검정)가
    //    비치므로, 넓은 블록형 콘텐츠의 최대 우측 끝까지 루트 폭을 넓힌다(fullWidth 상한).
    if (root.type === "frame") {
      const maxNodeWidth = maxWidthOf(root);
      const contentRight = maxBlockRight(root, root.layout.width * 0.3);
      const contentWidth =
        contentRight > -Infinity ? contentRight - root.layout.x : 0;
      const layoutWidth = Math.min(Math.max(maxNodeWidth, contentWidth), fullWidth);
      // body 가 가로를 잘라내면(overflow-x: hidden|clip) 뷰포트 밖 콘텐츠는 스크롤로도
      // 볼 수 없다. 이때 콘텐츠 폭까지 넓히면 아무 요소도 닿지 않는 유령 영역이 생겨
      // 모달 딤드 같은 뷰포트 오버레이가 그 부분을 덮지 못한다. 뷰포트 폭을 진실로 둔다.
      root.layout = {
        ...root.layout,
        width: bodyClipsX
          ? vp.width
          : Math.max(root.layout.width, vp.width, layoutWidth),
        height: Math.max(root.layout.height, fullHeight),
      };
      // body/wrapper 등 자기보다 넓은 자손을 가진 컨테이너를 루트 폭까지 넓혀 정렬을 맞춘다.
      expandToFitChildren(root, root.layout.x + root.layout.width);
      // 모달 딤드처럼 화면을 덮는 fixed 오버레이를 문서 전체로 늘린다.
      stretchViewportOverlays(fixedFrames, root, vp.width, vp.height);
    }

    // 위에서 수집한 의사요소 아이콘을 호스트 프레임(없으면 root)에 얹는다.
    onProgress?.("아이콘 배치", 0.55);
    const pseudoSvgAssets: AssetMap = {};
    await applyPseudoIcons(pseudoIcons, root, imageUrls, pseudoSvgAssets, hostFrames);

    onProgress?.("이미지 수집", 0.6);
    const assets = await collectImageAssets(imageUrls, (done, total) => {
      const ratio = 0.6 + (total ? (done / total) * 0.2 : 0.2);
      onProgress?.(`이미지 ${done}/${total}`, ratio);
    });
    Object.assign(assets, pseudoSvgAssets);

    // background-image 로 지정된 SVG 를 마크업으로 받아 벡터 에셋으로 등록
    for (const req of svgUrlRequests) {
      const markup = await fetchSvgMarkup(req.url);
      if (markup) assets[req.assetId] = { kind: "svg", markup };
    }

    onProgress?.("SVG 수집", 0.85);
    const svgAssets = await collectSvgAssets(session, svgRequests);
    Object.assign(assets, svgAssets);

    const doc: H2FDocument = {
      version: H2F_VERSION,
      meta: {
        url: parsed.url,
        title: parsed.title,
        capturedAt: new Date().toISOString(),
        viewport: vp,
      },
      root,
      assets,
    };

    onProgress?.("완료", 1);
    return doc;
  } finally {
    try {
      await session.send("Emulation.clearDeviceMetricsOverride");
    } catch {
      /* ignore */
    }
    await session.disconnect();
  }
}
