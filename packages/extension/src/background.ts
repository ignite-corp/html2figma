import { capturePage } from "./capture/index.js";
import type { BackgroundToPopup, PopupToBackground } from "./messages.js";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "capture") return;

  port.onMessage.addListener(async (msg: PopupToBackground) => {
    if (msg.kind !== "capture") return;
    const post = (m: BackgroundToPopup) => {
      try {
        port.postMessage(m);
      } catch {
        /* 포트가 닫힘 */
      }
    };
    try {
      const doc = await capturePage(msg.tabId, {
        viewport: msg.viewport,
        theme: msg.theme,
        onProgress: (step, ratio) => post({ kind: "progress", step, ratio }),
      });
      post({ kind: "done", doc });
    } catch (e) {
      post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  });
});
