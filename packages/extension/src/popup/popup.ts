import type { H2FDocument, H2FFile, Theme, ViewportPreset } from "@html2figma/shared";
import { isBundle } from "@html2figma/shared";
import type { BackgroundToPopup, BulkRequest, CaptureRequest } from "../messages.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const tabSingle = $<HTMLButtonElement>("tab-single");
const tabBulk = $<HTMLButtonElement>("tab-bulk");
const bulkPanel = $<HTMLDivElement>("bulk-panel");
const urlsEl = $<HTMLTextAreaElement>("urls");
const viewportSel = $<HTMLSelectElement>("viewport");
const themeSel = $<HTMLSelectElement>("theme");
const bridgeChk = $<HTMLInputElement>("bridge");
const captureBtn = $<HTMLButtonElement>("capture");
const statusEl = $<HTMLDivElement>("status");
const progressEl = $<HTMLSpanElement>("progress");
const exportsEl = $<HTMLDivElement>("exports");
const downloadBtn = $<HTMLButtonElement>("download");
const copyBtn = $<HTMLButtonElement>("copy");

let mode: "single" | "bulk" = "single";
let captured: H2FFile | null = null;

function setMode(m: "single" | "bulk") {
  mode = m;
  tabSingle.classList.toggle("active", m === "single");
  tabBulk.classList.toggle("active", m === "bulk");
  bulkPanel.classList.toggle("hidden", m !== "bulk");
}
tabSingle.addEventListener("click", () => setMode("single"));
tabBulk.addEventListener("click", () => setMode("bulk"));

function setStatus(text: string, ratio?: number) {
  statusEl.textContent = text;
  if (ratio != null) progressEl.style.width = `${Math.round(ratio * 100)}%`;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

captureBtn.addEventListener("click", async () => {
  captured = null;
  exportsEl.style.display = "none";
  captureBtn.disabled = true;
  setStatus("시작…", 0);

  const port = chrome.runtime.connect({ name: "capture" });
  const viewport = viewportSel.value as ViewportPreset;
  const theme = themeSel.value as Theme;
  const sendToBridge = bridgeChk.checked;

  if (mode === "single") {
    const tab = await getActiveTab();
    if (!tab?.id) {
      setStatus("활성 탭을 찾을 수 없습니다.");
      captureBtn.disabled = false;
      return;
    }
    const req: CaptureRequest = { kind: "capture", tabId: tab.id, viewport, theme, sendToBridge };
    port.postMessage(req);
  } else {
    const urls = urlsEl.value
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (!urls.length) {
      setStatus("URL을 한 개 이상 입력하세요.");
      captureBtn.disabled = false;
      return;
    }
    const req: BulkRequest = { kind: "bulk", urls, viewport, theme, sendToBridge };
    port.postMessage(req);
  }

  port.onMessage.addListener((msg: BackgroundToPopup) => {
    if (msg.kind === "progress") {
      setStatus(msg.step, msg.ratio);
    } else if (msg.kind === "done") {
      captured = msg.doc;
      const count = countNodes(msg.doc.root);
      setStatus(
        `완료 — 노드 ${count}, 에셋 ${Object.keys(msg.doc.assets).length}${msg.bridgeSent ? " · Figma 전송됨" : ""}`,
        1
      );
      exportsEl.style.display = "block";
      captureBtn.disabled = false;
      port.disconnect();
    } else if (msg.kind === "bulk-done") {
      captured = msg.bundle;
      const errNote = msg.errors.length ? ` (실패 ${msg.errors.length})` : "";
      setStatus(
        `완료 — 페이지 ${msg.bundle.documents.length}${errNote}${msg.bridgeSent ? " · Figma 전송됨" : ""}`,
        1
      );
      exportsEl.style.display = msg.bundle.documents.length ? "block" : "none";
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
  a.download = `${safeName(fileName(captured))}.h2f`;
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

function fileName(file: H2FFile): string {
  if (isBundle(file)) return file.documents[0]?.meta.title || "bundle";
  return (file as H2FDocument).meta.title || "capture";
}

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "capture";
}

function countNodes(node: H2FDocument["root"]): number {
  let n = 1;
  if (node.type === "frame") {
    for (const c of node.children) n += countNodes(c);
  }
  return n;
}
