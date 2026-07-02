import type { H2FDocument, Theme, ViewportPreset } from "@html2figma/shared";
import type { BackgroundToPopup, CaptureRequest } from "../messages.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const viewportSel = $<HTMLSelectElement>("viewport");
const themeSel = $<HTMLSelectElement>("theme");
const captureBtn = $<HTMLButtonElement>("capture");
const statusEl = $<HTMLDivElement>("status");
const progressEl = $<HTMLSpanElement>("progress");
const exportsEl = $<HTMLDivElement>("exports");
const downloadBtn = $<HTMLButtonElement>("download");
const copyBtn = $<HTMLButtonElement>("copy");

let captured: H2FDocument | null = null;

function setStatus(text: string, ratio?: number) {
  statusEl.textContent = text;
  if (ratio != null) progressEl.style.width = `${Math.round(ratio * 100)}%`;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

captureBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("활성 탭을 찾을 수 없습니다.");
    return;
  }
  captured = null;
  exportsEl.style.display = "none";
  captureBtn.disabled = true;
  setStatus("시작…", 0);

  const port = chrome.runtime.connect({ name: "capture" });
  const req: CaptureRequest = {
    kind: "capture",
    tabId: tab.id,
    viewport: viewportSel.value as ViewportPreset,
    theme: themeSel.value as Theme,
  };
  port.postMessage(req);

  port.onMessage.addListener((msg: BackgroundToPopup) => {
    if (msg.kind === "progress") {
      setStatus(msg.step, msg.ratio);
    } else if (msg.kind === "done") {
      captured = msg.doc;
      const count = countNodes(msg.doc.root);
      setStatus(`완료 — 노드 ${count}개, 에셋 ${Object.keys(msg.doc.assets).length}개`, 1);
      exportsEl.style.display = "block";
      captureBtn.disabled = false;
      port.disconnect();
    } else if (msg.kind === "error") {
      setStatus(`오류: ${msg.message}`, 0);
      captureBtn.disabled = false;
      port.disconnect();
    }
  });
});

downloadBtn.addEventListener("click", () => {
  if (!captured) return;
  const blob = new Blob([JSON.stringify(captured)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(captured.meta.title || "capture")}.h2f`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

copyBtn.addEventListener("click", async () => {
  if (!captured) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(captured));
    setStatus("클립보드에 복사됨 — Figma 플러그인에 붙여넣기", 1);
  } catch (e) {
    setStatus(`복사 실패: ${e instanceof Error ? e.message : e}`);
  }
});

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "capture";
}

function countNodes(node: H2FDocument["root"]): number {
  let n = 1;
  if ("children" in node && node.children) {
    for (const c of node.children) n += countNodes(c);
  }
  return n;
}
