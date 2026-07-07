import { normalizeCode } from "@html2figma/shared";
import type { BackgroundToPopup, CaptureRequest } from "../messages.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const codeEl     = $<HTMLInputElement>("code");
const captureBtn = $<HTMLButtonElement>("capture");
const statusEl   = $<HTMLDivElement>("status");
const progressEl = $<HTMLSpanElement>("progress");

// 저장된 코드 복원
chrome.storage.local.get("bridgeCode").then((s) => {
  if (typeof s.bridgeCode === "string") {
    codeEl.value = s.bridgeCode;
    captureBtn.disabled = codeEl.value.length !== 6;
  }
});

codeEl.addEventListener("input", () => {
  codeEl.value = normalizeCode(codeEl.value).slice(0, 6);
  chrome.storage.local.set({ bridgeCode: codeEl.value });
  captureBtn.disabled = codeEl.value.length !== 6;
});

function setStatus(text: string, type: "normal" | "success" | "error" = "normal", ratio?: number) {
  statusEl.textContent = text;
  statusEl.className = type === "normal" ? "" : type;
  if (ratio != null) progressEl.style.width = `${Math.round(ratio * 100)}%`;
}

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
    captureBtn.disabled = false;
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
      captureBtn.disabled = false;
      port.disconnect();
    } else if (msg.kind === "error") {
      setStatus(`오류: ${msg.message}`, "error", 0);
      captureBtn.disabled = false;
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
