import {
  H2F_VERSION,
  getViewport,
  type H2FDocument,
  type Theme,
  type ViewportPreset,
} from "@html2figma/shared";
import { CdpSession } from "./cdp.js";
import { COMPUTED_STYLES } from "./styleProps.js";
import { parseSnapshot, type CaptureSnapshotResult } from "./snapshot.js";
import { buildIR } from "./builder.js";
import { collectImageAssets } from "./assets.js";

export interface CaptureOptions {
  viewport: ViewportPreset;
  theme: Theme;
  onProgress?: (step: string, ratio: number) => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // 리플로우/이미지 로딩 대기
    await delay(400);

    onProgress?.("페이지 캡처", 0.35);
    const snapshot = await session.send<CaptureSnapshotResult>(
      "DOMSnapshot.captureSnapshot",
      {
        computedStyles: COMPUTED_STYLES,
        includePaintOrder: true,
        includeDOMRects: true,
      }
    );

    onProgress?.("트리 분석", 0.55);
    const parsed = parseSnapshot(snapshot);
    if (!parsed.root) throw new Error("캡처된 노드가 없습니다.");

    const { root, imageUrls } = buildIR(parsed.root);
    if (!root) throw new Error("변환할 노드가 없습니다.");

    onProgress?.("에셋 수집", 0.7);
    const assets = await collectImageAssets(imageUrls, (done, total) => {
      const ratio = 0.7 + (total ? (done / total) * 0.25 : 0.25);
      onProgress?.(`에셋 ${done}/${total}`, ratio);
    });

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
