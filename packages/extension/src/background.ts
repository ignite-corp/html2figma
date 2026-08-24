import { capturePage } from "./capture/index.js";
import { getRelayUrl, sendToRelay } from "./bridge.js";
import { isPro } from "./account.js";
import { INTERNAL_BUILD } from "./config.js";
import { consumeQuota, getQuota } from "./quota.js";
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
        // 과금 게이트: 사내 빌드·Pro 는 무제한, 무료는 월 5회. 쿼터 소진 시 캡처를 시작하지 않는다.
        const pro = INTERNAL_BUILD || (await isPro());
        if (!pro && (await getQuota()).remaining <= 0) {
          post({
            kind: "error",
            code: "quota-exceeded",
            message: "이번 달 무료 변환 5회를 모두 사용했어요.",
          });
          return;
        }

        const doc = await capturePage(msg.tabId, { onProgress });
        const bridgeSent = await relay(doc);
        // 실제로 Figma 에 전달된 경우에만 무료 횟수를 소비한다.
        const remaining = pro ? null : bridgeSent ? await consumeQuota() : undefined;
        post({ kind: "done", doc, bridgeSent, remaining });
      }
    } catch (e) {
      post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  });
});
