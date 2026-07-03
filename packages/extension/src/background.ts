import { capturePage } from "./capture/index.js";
import { getRelayUrl, sendToRelay } from "./bridge.js";
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

    const relay = async (file: import("@html2figma/shared").H2FFile): Promise<boolean> => {
      if (!msg.sendToBridge || !msg.bridgeCode) return false;
      const url = await getRelayUrl();
      const res = await sendToRelay(file, msg.bridgeCode, url, { onProgress });
      if (!res.ok) post({ kind: "progress", step: `Figma 전송 실패: ${res.message ?? ""}`, ratio: 1 });
      return res.ok;
    };

    try {
      if (msg.kind === "capture") {
        const doc = await capturePage(msg.tabId, { onProgress });
        const bridgeSent = await relay(doc);
        post({ kind: "done", doc, bridgeSent });
      }
    } catch (e) {
      post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  });
});
