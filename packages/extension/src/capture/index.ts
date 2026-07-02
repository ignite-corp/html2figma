import {
  H2F_VERSION,
  getViewport,
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

/** 문서 전체 높이(CSS px)와 device px 배율(DPR)을 측정. 실패 시 fallback. 폭주 방지 상한. */
const MAX_PAGE_HEIGHT = 30000;
async function measurePage(
  session: CdpSession,
  fallbackHeight: number
): Promise<{ cssHeight: number; scale: number }> {
  try {
    const m = await session.send<{
      cssContentSize?: { width: number; height: number };
      contentSize?: { width: number; height: number };
    }>("Page.getLayoutMetrics");
    const cssH = m?.cssContentSize?.height ?? m?.contentSize?.height ?? fallbackHeight;
    const cssHeight = Math.min(Math.max(Math.ceil(cssH), fallbackHeight), MAX_PAGE_HEIGHT);
    // DOMSnapshot bounds 는 device px(레티나면 ×DPR)로 오는데 font-size 는 CSS px 이다.
    // 두 값을 일치시키기 위해 배율을 구해 좌표를 CSS px 로 정규화한다.
    let scale = 1;
    const devH = m?.contentSize?.height;
    const cssContentH = m?.cssContentSize?.height;
    if (devH && cssContentH && cssContentH > 0) {
      scale = devH / cssContentH;
    }
    if (!Number.isFinite(scale) || scale < 1) scale = 1;
    return { cssHeight, scale };
  } catch {
    return { cssHeight: fallbackHeight, scale: 1 };
  }
}

interface PseudoIcon {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  svg: boolean;
}

/**
 * ::before/::after 의사요소의 background-image(또는 content url)를 수집.
 * DOMSnapshot 은 의사요소를 포함하지 않아 아이콘이 유실되므로 페이지에서 직접 측정한다.
 * 좌표는 document 기준 CSS px (스냅샷 정규화 좌표와 동일 단위).
 */
async function collectPseudoIcons(session: CdpSession): Promise<PseudoIcon[]> {
  const collector = function () {
    const out: {
      url: string;
      x: number;
      y: number;
      w: number;
      h: number;
      svg: boolean;
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
        if (!url) continue;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        let w = parseFloat(cs.width);
        let h = parseFloat(cs.height);
        if (!(w > 0)) w = rect.width;
        if (!(h > 0)) h = rect.height;
        // 아이콘 용도만 대상 (거대한 장식 배경 오버레이 제외)
        if (w > 600 || h > 600) continue;
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        const x = rect.left + sx + (rect.width - w) / 2;
        const y = rect.top + sy + (rect.height - h) / 2;
        const svg = /^data:image\/svg\+xml/i.test(url) || /\.svg(\?|$)/i.test(url);
        out.push({ url, x, y, w, h, svg });
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
  assetsOut: AssetMap
): Promise<void> {
  if (root.type !== "frame") return;
  const frame = root as FrameNode;
  let n = 0;
  for (const p of icons) {
    const layout = { x: p.x, y: p.y, width: p.w, height: p.h };
    if (p.svg) {
      const markup = await fetchSvgMarkup(p.url);
      if (!markup) continue;
      const assetId = `pseudo-svg:${n}`;
      assetsOut[assetId] = { kind: "svg", markup };
      frame.children.push({
        id: `pseudo${n}`,
        name: "icon",
        type: "vector",
        layout,
        style: {},
        assetId,
      });
    } else {
      imageUrls.add(p.url);
      frame.children.push({
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
    const { cssHeight: fullHeight, scale } = await measurePage(session, vp.height);
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

    const { root, imageUrls, svgRequests } = buildIR(parsed);
    if (!root) throw new Error("변환할 노드가 없습니다.");

    // DOMSnapshot 에 없는 ::before/::after 아이콘을 페이지에서 수집해 root 에 얹는다.
    onProgress?.("아이콘 수집", 0.55);
    const pseudoIcons = await collectPseudoIcons(session);
    const pseudoSvgAssets: AssetMap = {};
    await applyPseudoIcons(pseudoIcons, root, imageUrls, pseudoSvgAssets);

    onProgress?.("이미지 수집", 0.6);
    const assets = await collectImageAssets(imageUrls, (done, total) => {
      const ratio = 0.6 + (total ? (done / total) * 0.2 : 0.2);
      onProgress?.(`이미지 ${done}/${total}`, ratio);
    });
    Object.assign(assets, pseudoSvgAssets);

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
