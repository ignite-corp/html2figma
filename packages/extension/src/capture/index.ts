import {
  H2F_VERSION,
  getViewport,
  parseCssColor,
  type AssetMap,
  type H2FDocument,
  type Theme,
  type ViewportPreset,
} from "@html2figma/shared";
import { CdpSession } from "./cdp.js";
import { COMPUTED_STYLES } from "./styleProps.js";
import { parseAllDocuments, type CaptureSnapshotResult } from "./snapshot.js";
import { buildIR, type SvgRequest } from "./builder.js";
import { collectImageAssets } from "./assets.js";
import type { H2FNode, FrameNode } from "@html2figma/shared";

export interface CaptureOptions {
  viewport: ViewportPreset;
  theme: Theme;
  onProgress?: (step: string, ratio: number) => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 문서 전체 크기(CSS px)와 device px 배율(DPR)을 측정. 실패 시 fallback. 폭주 방지 상한. */
const MAX_PAGE_HEIGHT = 30000;
const MAX_PAGE_WIDTH = 10000;
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

interface PseudoIcon {
  url?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  svg: boolean;
  hostId?: string;
  /** 아이콘이 아닌 단색 박스(밑줄·구분선 등)의 배경색 CSS 문자열 */
  bg?: string;
  /** border-radius (px) */
  radius?: number;
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
 * 프레임 폭을 자식들을 담을 수 있도록 넓힌다(bottom-up).
 * body 나 wrapper 처럼 자기보다 넓은 자손(min-width 고정 레이아웃 등)을 가진 컨테이너가
 * 실제로는 배경이 전체 폭을 덮는데도 좁게(뷰포트-스크롤바) 잡히는 문제를 바로잡는다.
 * 좌표는 절대값. maxRight(대개 루트 우측)로 상한을 두어 가로 bleed 로 폭주하지 않게 한다.
 * overflow 를 자르는 프레임(clipsContent)은 의도적으로 자식을 가두므로 확장하지 않는다.
 */
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

/**
 * 스냅샷 전에 모든 요소에 data-h2f-el 식별자를 부여한다.
 * 이후 의사요소 아이콘을 그 호스트 프레임 안에 정확히 넣기 위한 매칭 키로 쓰인다.
 */
async function tagElements(session: CdpSession): Promise<void> {
  const tagger = function () {
    const els = document.querySelectorAll("*");
    for (let i = 0; i < els.length; i++) {
      els[i].setAttribute("data-h2f-el", String(i));
    }
  };
  try {
    await session.send("Runtime.evaluate", {
      expression: `(${tagger.toString()})()`,
    });
  } catch {
    /* 태깅 실패 시 아이콘은 루트에 얹힌다(폴백) */
  }
}

/**
 * ::before/::after 의사요소의 background-image(또는 content url)를 수집.
 * DOMSnapshot 은 의사요소를 포함하지 않아 아이콘이 유실되므로 페이지에서 직접 측정한다.
 * 좌표는 document 기준 CSS px (스냅샷 정규화 좌표와 동일 단위).
 */
async function collectPseudoIcons(session: CdpSession): Promise<PseudoIcon[]> {
  const collector = function () {
    const out: {
      url?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      svg: boolean;
      hostId?: string;
      bg?: string;
      radius?: number;
    }[] = [];
    const els = document.querySelectorAll("*");
    const MAX = 400;
    for (let i = 0; i < els.length && out.length < MAX; i++) {
      const el = els[i] as Element;
      for (const p of ["::before", "::after"]) {
        const cs = getComputedStyle(el, p);
        if (!cs || cs.display === "none") continue;
        if (cs.content === "none" || cs.content === "normal" || !cs.content) continue;
        let url: string | null = null;
        const bm = cs.backgroundImage && cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
        if (bm) url = bm[1];
        if (!url) {
          const cm = cs.content.match(/url\(["']?([^"')]+)["']?\)/);
          if (cm) url = cm[1];
        }
        // 아이콘(background-image/content url)이 없으면 눈에 보이는 단색 배경
        // (밑줄·구분선 등)인지 확인한다. 배경도 없으면(clearfix 등) 건너뛴다.
        let solidBg: string | null = null;
        let radius = 0;
        if (!url) {
          const bc = cs.backgroundColor;
          const am = bc && bc.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (am) {
            const parts = am[1].split(",").map((s) => parseFloat(s));
            if (parts.length >= 4) alpha = parts[3];
          }
          const visible = !!bc && bc !== "transparent" && alpha > 0;
          if (!visible) continue;
          solidBg = bc;
          radius = parseFloat(cs.borderTopLeftRadius) || 0;
        }
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        let w = parseFloat(cs.width);
        let h = parseFloat(cs.height);
        if (!(w > 0)) w = rect.width;
        if (!(h > 0)) h = rect.height;
        // 아이콘은 거대한 장식 배경 오버레이 제외. 단색 박스(밑줄)는 얇고 넓을 수
        // 있으므로 면적이 아주 큰 전면 오버레이만 제외한다.
        if (url) {
          if (w > 600 || h > 600) continue;
        } else {
          if (w * h > 600 * 600) continue;
        }
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        // ::before/::after 는 대개 position:absolute 로 특정 위치(오른쪽 화살표 등)에 놓인다.
        // 호스트 박스 중앙에 두면 위치가 어긋나므로, 절대 오프셋(left/right/top/bottom)과
        // transform translate 를 반영해 실제 위치를 계산한다. 오프셋이 없으면 중앙 정렬로 폴백.
        const num = (v: string) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };
        const isAuto = (v: string) => !v || v === "auto";
        const posT = cs.position;
        const left = num(cs.left),
          right = num(cs.right),
          top = num(cs.top),
          bottom = num(cs.bottom);
        let x: number, y: number;
        if (posT === "absolute" || posT === "fixed") {
          if (!isAuto(cs.left) && left != null) x = rect.left + sx + left;
          else if (!isAuto(cs.right) && right != null)
            x = rect.left + rect.width + sx - right - w;
          else x = rect.left + sx + (rect.width - w) / 2;
          if (!isAuto(cs.top) && top != null) y = rect.top + sy + top;
          else if (!isAuto(cs.bottom) && bottom != null)
            y = rect.top + rect.height + sy - bottom - h;
          else y = rect.top + sy + (rect.height - h) / 2;
        } else {
          x = rect.left + sx + (rect.width - w) / 2;
          y = rect.top + sy + (rect.height - h) / 2;
        }
        // transform 의 translate 성분 반영(matrix / matrix3d)
        const tm = cs.transform;
        if (tm && tm !== "none") {
          const m2 = tm.match(/matrix\(([^)]+)\)/);
          if (m2) {
            const parts = m2[1].split(",").map((s) => parseFloat(s));
            if (parts.length >= 6) {
              x += parts[4];
              y += parts[5];
            }
          } else {
            const m3 = tm.match(/matrix3d\(([^)]+)\)/);
            if (m3) {
              const parts = m3[1].split(",").map((s) => parseFloat(s));
              if (parts.length >= 14) {
                x += parts[12];
                y += parts[13];
              }
            }
          }
        }
        const svg = !!url && (/^data:image\/svg\+xml/i.test(url) || /\.svg(\?|$)/i.test(url));
        const hostId = (el as HTMLElement).getAttribute("data-h2f-el") || undefined;
        out.push({
          url: url || undefined,
          x,
          y,
          w,
          h,
          svg,
          hostId,
          bg: solidBg || undefined,
          radius: radius || undefined,
        });
      }
    }
    return JSON.stringify(out);
  };
  try {
    const res = await session.send<{ result?: { value?: string } }>("Runtime.evaluate", {
      expression: `(${collector.toString()})()`,
      returnByValue: true,
    });
    const json = res?.result?.value;
    return json ? (JSON.parse(json) as PseudoIcon[]) : [];
  } catch {
    return [];
  }
}

/** SVG url(data: 또는 원격)을 마크업 텍스트로 변환 */
async function fetchSvgMarkup(url: string): Promise<string | null> {
  try {
    let text: string;
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      const meta = url.slice(5, comma);
      const data = url.slice(comma + 1);
      text = /;base64/i.test(meta) ? atob(data) : decodeURIComponent(data);
    } else {
      const res = await fetch(url);
      if (!res.ok) return null;
      text = await res.text();
    }
    return /<svg[\s>]/i.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** 수집한 의사요소 아이콘을 IR 노드로 만들어 root 에 얹는다(맨 위). svg 에셋은 assetsOut 에 채운다. */
async function applyPseudoIcons(
  icons: PseudoIcon[],
  root: H2FNode,
  imageUrls: Set<string>,
  assetsOut: AssetMap,
  hostFrames: Map<string, FrameNode>
): Promise<void> {
  if (root.type !== "frame") return;
  const rootFrame = root as FrameNode;
  let n = 0;
  for (const p of icons) {
    const layout = { x: p.x, y: p.y, width: p.w, height: p.h };
    // 아이콘을 호스트 요소의 프레임 안에 넣는다(예: 버튼의 화살표). 좌표는 절대값이며
    // 렌더 시 부모 기준으로 상대화되므로 부모만 바꿔 넣으면 된다. 호스트가 없으면 루트에 얹는다.
    const target = (p.hostId && hostFrames.get(p.hostId)) || rootFrame;
    if (!p.url && p.bg) {
      // 아이콘이 아닌 단색 박스(밑줄·구분선 등). 프레임에 solid fill 로 렌더한다.
      const color = parseCssColor(p.bg);
      if (!color || color.a === 0) continue;
      const style: H2FNode["style"] = { fills: [{ type: "solid", color }] };
      if (p.radius) {
        style.cornerRadius = { tl: p.radius, tr: p.radius, br: p.radius, bl: p.radius };
      }
      target.children.push({
        id: `pseudo${n}`,
        name: "line",
        type: "frame",
        layout,
        style,
        children: [],
      });
    } else if (p.svg && p.url) {
      const markup = await fetchSvgMarkup(p.url);
      if (!markup) continue;
      const assetId = `pseudo-svg:${n}`;
      assetsOut[assetId] = { kind: "svg", markup };
      target.children.push({
        id: `pseudo${n}`,
        name: "icon",
        type: "vector",
        layout,
        style: {},
        assetId,
      });
    } else if (p.url) {
      imageUrls.add(p.url);
      target.children.push({
        id: `pseudo${n}`,
        name: "icon",
        type: "image",
        layout,
        style: {},
        assetId: p.url,
      });
    }
    n++;
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
  const { viewport: preset, theme, onProgress } = opts;
  const vp = getViewport(preset);
  const session = new CdpSession(tabId);

  onProgress?.("연결 중", 0.05);
  await session.connect();

  try {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    await session.send("Page.enable");
    await session.send("DOMSnapshot.enable");

    onProgress?.("뷰포트 설정", 0.15);
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.deviceScaleFactor,
      mobile: preset === "mobile",
    });

    if (theme !== "default") {
      await session.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: theme }],
      });
    }

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
        mobile: preset === "mobile",
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

    const { root, imageUrls, svgRequests, svgUrlRequests, hostFrames } = buildIR(parsed);
    if (!root) throw new Error("변환할 노드가 없습니다.");

    // 루트 프레임 폭을 "실제 레이아웃 폭"에 맞춘다.
    //  - cssContentSize.width(fullWidth)는 가로로 삐져나온 캐러셀 등 오프스크린 bleed 까지
    //    포함해 실제 레이아웃보다 넓어져, footer 처럼 width:100% 인 요소가 우측 끝까지
    //    안 채워지는 것처럼 보인다.
    //  - 반대로 뷰포트 폭만 쓰면 min-width 고정 레이아웃(예: min-width:1600)이 뷰포트보다
    //    넓을 때 콘텐츠가 잘린다.
    // 해결: 트리에서 가장 넓은 노드 폭(대개 full-width 레이아웃 컨테이너)을 레이아웃 폭으로 보고
    //       뷰포트와 스크롤 폭(bleed 상한) 사이로 클램프한다. 좁은 bleed 요소는 폭이 작아 제외됨.
    if (root.type === "frame") {
      const maxNodeWidth = maxWidthOf(root);
      const layoutWidth = Math.min(maxNodeWidth, fullWidth);
      root.layout = {
        ...root.layout,
        width: Math.max(root.layout.width, vp.width, layoutWidth),
        height: Math.max(root.layout.height, fullHeight),
      };
      // body/wrapper 등 자기보다 넓은 자손을 가진 컨테이너를 루트 폭까지 넓혀 정렬을 맞춘다.
      expandToFitChildren(root, root.layout.x + root.layout.width);
    }

    // DOMSnapshot 에 없는 ::before/::after 아이콘을 페이지에서 수집해 root 에 얹는다.
    onProgress?.("아이콘 수집", 0.55);
    const pseudoIcons = await collectPseudoIcons(session);
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
        theme,
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
