import type { H2FFile } from "@html2figma/shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const drop = $<HTMLDivElement>("drop");
const fileInput = $<HTMLInputElement>("file");
const paste = $<HTMLTextAreaElement>("paste");
const importBtn = $<HTMLButtonElement>("import");
const autolayout = $<HTMLInputElement>("autolayout");
const styles = $<HTMLInputElement>("styles");
const statusEl = $<HTMLDivElement>("status");
const bridgeConnectBtn = $<HTMLButtonElement>("bridge-connect");
const bridgeStatus = $<HTMLSpanElement>("bridge-status");
const bridgeDot = $<HTMLSpanElement>("bridge-dot");

const BRIDGE_URL = "ws://localhost:8787";
let file: H2FFile | null = null;
let ws: WebSocket | null = null;

function setStatus(t: string) {
  statusEl.textContent = t;
}

function optionsPayload() {
  return { useAutoLayout: autolayout.checked, createStyles: styles.checked };
}

function doImport(f: H2FFile) {
  parent.postMessage(
    { pluginMessage: { type: "import", file: f, options: optionsPayload() } },
    "*"
  );
}

function loadFromText(text: string) {
  try {
    const parsed = JSON.parse(text) as H2FFile;
    const ok = "version" in parsed && ("root" in parsed || "documents" in parsed);
    if (!ok) throw new Error("올바른 .h2f 형식이 아닙니다.");
    file = parsed;
    importBtn.disabled = false;
    const label =
      "documents" in parsed ? `번들 (${parsed.documents.length}페이지)` : parsed.meta?.title || "무제";
    setStatus(`문서 로드됨 — ${label}`);
  } catch (e) {
    file = null;
    importBtn.disabled = true;
    setStatus(`파싱 실패: ${e instanceof Error ? e.message : e}`);
  }
}

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", (e: DragEvent) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e: DragEvent) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer?.files[0];
  if (f) f.text().then(loadFromText);
});

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) f.text().then(loadFromText);
});

paste.addEventListener("input", () => {
  if (paste.value.trim()) loadFromText(paste.value.trim());
});

importBtn.addEventListener("click", () => {
  if (!file) return;
  importBtn.disabled = true;
  doImport(file);
});

/* ---------------- 브릿지 자동 수신 ---------------- */

function setBridgeState(connected: boolean, text: string) {
  bridgeDot.classList.toggle("on", connected);
  bridgeStatus.textContent = text;
}

bridgeConnectBtn.addEventListener("click", () => {
  if (ws) {
    ws.close();
    ws = null;
    setBridgeState(false, "브릿지: 연결 해제됨");
    return;
  }
  setBridgeState(false, "브릿지: 연결 중…");
  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch {
    setBridgeState(false, "브릿지: 연결 실패");
    return;
  }
  ws.onopen = () => {
    ws?.send(JSON.stringify({ type: "hello", role: "figma" }));
    setBridgeState(true, "브릿지: 연결됨 (대기 중)");
  };
  ws.onmessage = (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "h2f" && msg.payload) {
        setStatus("브릿지 수신 — 임포트 중…");
        doImport(msg.payload as H2FFile);
      }
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    ws = null;
    setBridgeState(false, "브릿지: 연결 끊김");
  };
  ws.onerror = () => {
    setBridgeState(false, "브릿지: 오류 (서버 실행 확인)");
  };
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (msg?.type === "status") {
    setStatus(msg.text);
    if (msg.text === "완료!") importBtn.disabled = false;
  }
};
