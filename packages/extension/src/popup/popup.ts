import { normalizeCode } from "@html2figma/shared";
import type { BackgroundToPopup, CaptureRequest } from "../messages.js";
// 플랜/쿼터/결제 UI. 사내 빌드에서는 build.mjs 가 monetization.internal.ts 로 치환한다.
import { applyCaptureResult, initPlanUi, showQuotaExceeded } from "./monetization.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const codeEl        = $<HTMLInputElement>("code");
const captureBtn    = $<HTMLButtonElement>("capture");
const statusEl      = $<HTMLDivElement>("status");
const progressEl    = $<HTMLSpanElement>("progress");
const figmaPluginLink = $<HTMLAnchorElement>("figma-plugin-link");

const FIGMA_PLUGIN_URL = "https://www.figma.com/community/plugin/1657063496726706112";

let codeOk = false;
let quotaOk = true;

function applyCaptureEnabled() {
  captureBtn.disabled = !(codeOk && quotaOk);
}

function setStatus(text: string, type: "normal" | "success" | "error" = "normal", ratio?: number) {
  statusEl.textContent = text;
  statusEl.className = type === "normal" ? "" : type;
  if (ratio != null) progressEl.style.width = `${Math.round(ratio * 100)}%`;
}

figmaPluginLink.addEventListener("click", () => void chrome.tabs.create({ url: FIGMA_PLUGIN_URL }));

/* ---------------- 캡처 ---------------- */

// 저장된 코드 복원
chrome.storage.local.get("bridgeCode").then((s) => {
  if (typeof s.bridgeCode === "string") {
    codeEl.value = s.bridgeCode;
    codeOk = codeEl.value.length === 6;
    applyCaptureEnabled();
  }
});

initPlanUi({
  setStatus: (text, type) => setStatus(text, type),
  setQuotaOk: (ok) => {
    quotaOk = ok;
    applyCaptureEnabled();
  },
});

codeEl.addEventListener("input", () => {
  codeEl.value = normalizeCode(codeEl.value).slice(0, 6);
  chrome.storage.local.set({ bridgeCode: codeEl.value });
  codeOk = codeEl.value.length === 6;
  applyCaptureEnabled();
});

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

captureBtn.addEventListener("click", async () => {
  const bridgeCode = normalizeCode(codeEl.value);
  if (bridgeCode.length !== 6) {
    setStatus("6자리 코드를 입력하세요.", "error");
    return;
  }

  captureBtn.disabled = true;
  setStatus("시작…", "normal", 0);

  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("활성 탭을 찾을 수 없습니다.", "error");
    applyCaptureEnabled();
    return;
  }

  const port = chrome.runtime.connect({ name: "capture" });
  const req: CaptureRequest = {
    kind: "capture",
    tabId: tab.id,
    sendToBridge: true,
    bridgeCode,
  };
  port.postMessage(req);

  port.onMessage.addListener((msg: BackgroundToPopup) => {
    if (msg.kind === "progress") {
      setStatus(msg.step, "normal", msg.ratio);
    } else if (msg.kind === "done") {
      const count = countNodes(msg.doc.root);
      setStatus(
        `완료 — 노드 ${count}개${msg.bridgeSent ? " · Figma 전송됨 ✓" : ""}`,
        "success",
        1,
      );
      applyCaptureResult(msg.remaining);
      applyCaptureEnabled();
      port.disconnect();
    } else if (msg.kind === "error") {
      if (msg.code === "quota-exceeded") {
        setStatus(msg.message, "error", 0);
        showQuotaExceeded();
      } else {
        setStatus(`오류: ${msg.message}`, "error", 0);
        applyCaptureEnabled();
      }
      port.disconnect();
    }
  });
});

function countNodes(node: { type: string; children?: unknown[] }): number {
  let n = 1;
  if (node.type === "frame" && Array.isArray(node.children)) {
    for (const c of node.children) n += countNodes(c as { type: string; children?: unknown[] });
  }
  return n;
}
