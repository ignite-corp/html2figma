import type { H2FFile, RelayServerMsg } from "@html2figma/shared";

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
const codeBox = $<HTMLDivElement>("code-box");
const codeEl = $<HTMLDivElement>("code");
const relayUrlEl = $<HTMLInputElement>("relay-url");

const DEFAULT_RELAY_URL = "ws://localhost:8787";
let file: H2FFile | null = null;
let ws: WebSocket | null = null;

// 저장된 릴레이 URL 로드.
parent.postMessage({ pluginMessage: { type: "get-config" } }, "*");
relayUrlEl.addEventListener("input", () => {
  parent.postMessage({ pluginMessage: { type: "save-config", relayUrl: relayUrlEl.value.trim() } }, "*");
});

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

/* ---------------- 릴레이 페어링 (Figma로 바로 받기) ---------------- */

function setBridgeState(connected: boolean, text: string) {
  bridgeDot.classList.toggle("on", connected);
  bridgeStatus.textContent = text;
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  codeBox.classList.add("hidden");
  codeEl.textContent = "";
  bridgeConnectBtn.textContent = "연결 (코드 받기)";
  setBridgeState(false, "Figma로 바로 받기: 연결 해제됨");
}

bridgeConnectBtn.addEventListener("click", () => {
  if (ws) {
    disconnect();
    return;
  }
  const url = relayUrlEl.value.trim() || DEFAULT_RELAY_URL;
  setBridgeState(false, "연결 중…");
  try {
    ws = new WebSocket(url);
  } catch {
    setBridgeState(false, "연결 실패 (주소 확인)");
    return;
  }
  ws.onopen = () => {
    ws?.send(JSON.stringify({ type: "create-room" }));
    bridgeConnectBtn.textContent = "연결 해제";
  };
  ws.onmessage = (ev: MessageEvent) => {
    let msg: RelayServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as RelayServerMsg;
    } catch {
      return;
    }
    if (msg.type === "room") {
      codeEl.textContent = msg.code;
      codeBox.classList.remove("hidden");
      setBridgeState(true, "코드 대기 중 — 익스텐션에 입력하세요");
    } else if (msg.type === "peer-joined") {
      setBridgeState(true, "익스텐션 연결됨 — 캡처를 기다리는 중");
    } else if (msg.type === "h2f" && msg.payload) {
      setStatus("릴레이 수신 — 임포트 중…");
      doImport(msg.payload as H2FFile);
    }
  };
  ws.onclose = () => {
    ws = null;
    codeBox.classList.add("hidden");
    bridgeConnectBtn.textContent = "연결 (코드 받기)";
    setBridgeState(false, "연결 끊김");
  };
  ws.onerror = () => {
    setBridgeState(false, "오류 (릴레이 실행/주소 확인)");
  };
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (msg?.type === "status") {
    setStatus(msg.text);
    if (msg.text === "완료!") importBtn.disabled = false;
  } else if (msg?.type === "config") {
    if (typeof msg.relayUrl === "string") relayUrlEl.value = msg.relayUrl;
  }
};
