import { capturePage } from "./capture/index.js";
import { captureUrls } from "./capture/bulk.js";
import { sendToBridge } from "./bridge.js";
import type { BackgroundToPopup, PopupToBackground } from "./messages.js";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "capture") return;

  port.onMessage.addListener(async (msg: PopupToBackground) => {
    const post = (m: BackgroundToPopup) => {
      try {
        port.postMessage(m);
      } catch {
        /* 포트가 닫힘 */
      }
    };
    const onProgress = (step: string, ratio: number) =>
      post({ kind: "progress", step, ratio });

    try {
      if (msg.kind === "capture") {
        const doc = await capturePage(msg.tabId, {
          viewport: msg.viewport,
          theme: msg.theme,
          onProgress,
        });
        let bridgeSent = false;
        if (msg.sendToBridge) bridgeSent = await sendToBridge(doc);
        post({ kind: "done", doc, bridgeSent });
      } else if (msg.kind === "bulk") {
        const { bundle, errors } = await captureUrls(msg.urls, {
          viewport: msg.viewport,
          theme: msg.theme,
          onProgress,
        });
        let bridgeSent = false;
        if (msg.sendToBridge && bundle.documents.length) {
          bridgeSent = await sendToBridge(bundle);
        }
        post({ kind: "bulk-done", bundle, errors, bridgeSent });
      }
    } catch (e) {
      post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  });
});
