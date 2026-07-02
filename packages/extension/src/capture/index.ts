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

export interface CaptureOptions {
  viewport: ViewportPreset;
  theme: Theme;
  onProgress?: (step: string, ratio: number) => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 문서 전체 높이(CSS px)를 측정. 실패 시 fallback 반환. 폭주 방지를 위해 상한을 둔다. */
const MAX_PAGE_HEIGHT = 30000;
async function measureFullHeight(
  session: CdpSession,
  fallback: number
): Promise<number> {
  try {
    const m = await session.send<{
      cssContentSize?: { height: number };
      contentSize?: { height: number };
    }>("Page.getLayoutMetrics");
    const h = m?.cssContentSize?.height ?? m?.contentSize?.height ?? fallback;
    return Math.min(Math.max(Math.ceil(h), fallback), MAX_PAGE_HEIGHT);
  } catch {
    return fallback;
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
    const fullHeight = await measureFullHeight(session, vp.height);
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
    const parsed = parseAllDocuments(snapshot);
    if (!parsed.documents[0]?.root) throw new Error("캡처된 노드가 없습니다.");

    const { root, imageUrls, svgRequests } = buildIR(parsed);
    if (!root) throw new Error("변환할 노드가 없습니다.");

    onProgress?.("이미지 수집", 0.6);
    const assets = await collectImageAssets(imageUrls, (done, total) => {
      const ratio = 0.6 + (total ? (done / total) * 0.2 : 0.2);
      onProgress?.(`이미지 ${done}/${total}`, ratio);
    });

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
