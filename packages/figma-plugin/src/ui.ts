import type { H2FFile, RelayServerMsg } from "@html2figma/shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const autolayout = $<HTMLInputElement>("autolayout");
const styles = $<HTMLInputElement>("styles");
const statusEl = $<HTMLDivElement>("status");
const bridgeConnectBtn = $<HTMLButtonElement>("bridge-connect");
const bridgeStatus = $<HTMLSpanElement>("bridge-status");
const bridgeDot = $<HTMLSpanElement>("bridge-dot");
const codeBox = $<HTMLDivElement>("code-box");
const codeEl = $<HTMLDivElement>("code");
const copyCodeBtn = $<HTMLButtonElement>("copy-code");

const DEFAULT_RELAY_URL = "wss://html2figma-relay.onrender.com";
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

/* ---------------- 릴레이 페어링 (Figma로 바로 받기) ---------------- */

type DotState = "off" | "wait" | "on";

function setBridgeState(dot: DotState, text: string, btnLabel?: string, btnActive?: boolean) {
  bridgeDot.classList.toggle("on",   dot === "on");
  bridgeDot.classList.toggle("wait", dot === "wait");
  bridgeStatus.textContent = text;
  if (btnLabel !== undefined) bridgeConnectBtn.textContent = btnLabel;
  if (btnActive !== undefined) bridgeConnectBtn.classList.toggle("active", btnActive);
}

let copyTimer: ReturnType<typeof setTimeout> | null = null;

function flashCopied() {
  copyCodeBtn.textContent = "복사됨!";
  copyCodeBtn.classList.add("copied");
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyCodeBtn.textContent = "복사";
    copyCodeBtn.classList.remove("copied");
  }, 2000);
}

copyCodeBtn.addEventListener("click", () => {
  const code = codeEl.textContent?.trim();
  if (!code) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(flashCopied).catch(() => copyFallback(code));
  } else {
    copyFallback(code);
  }
});

function copyFallback(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); flashCopied(); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

function disconnect() {
  if (ws) { ws.close(); ws = null; }
  codeBox.classList.add("hidden");
  codeEl.textContent = "";
  setBridgeState("off", "연결 해제됨", "연결하기", false);
}

bridgeConnectBtn.addEventListener("click", () => {
  if (ws) { disconnect(); return; }

  setBridgeState("wait", "연결 중…", "연결 중…", false);
  bridgeConnectBtn.disabled = true;

  try {
    ws = new WebSocket(DEFAULT_RELAY_URL);
  } catch {
    bridgeConnectBtn.disabled = false;
    setBridgeState("off", "연결 실패 — 주소를 확인하세요", "연결하기", false);
    return;
  }

  ws.onopen = () => {
    bridgeConnectBtn.disabled = false;
    ws?.send(JSON.stringify({ type: "create-room" }));
    setBridgeState("wait", "코드 생성 중…", "연결 해제", true);
  };
  ws.onmessage = (ev: MessageEvent) => {
    let msg: RelayServerMsg;
    try { msg = JSON.parse(String(ev.data)) as RelayServerMsg; } catch { return; }

    if (msg.type === "room") {
      codeEl.textContent = msg.code;
      codeBox.classList.remove("hidden");
      setBridgeState("wait", "익스텐션에 코드를 입력하세요");
    } else if (msg.type === "peer-joined") {
      setBridgeState("on", "익스텐션 연결됨 — 캡처 대기 중");
    } else if (msg.type === "h2f" && msg.payload) {
      setStatus("수신 완료 — 임포트 중…");
      doImport(msg.payload as H2FFile);
    } else if (msg.type === "h2f-chunk") {
      receiveChunk(msg);
    } else if (msg.type === "error") {
      setStatus(`릴레이 오류: ${msg.message}`);
    }
  };
  ws.onclose = () => {
    ws = null;
    bridgeConnectBtn.disabled = false;
    codeBox.classList.add("hidden");
    setBridgeState("off", "연결 끊김", "연결하기", false);
  };
  ws.onerror = () => {
    setBridgeState("off", "오류 — 릴레이 서버를 확인하세요");
  };
});

/* ---------------- 청크 재조립 (큰 페이로드 수신) ---------------- */

interface ChunkBuf {
  parts: string[];
  received: number;
  total: number;
}
const chunkBufs = new Map<string, ChunkBuf>();

function receiveChunk(msg: Extract<RelayServerMsg, { type: "h2f-chunk" }>) {
  let buf = chunkBufs.get(msg.id);
  if (!buf) {
    buf = { parts: new Array(msg.total), received: 0, total: msg.total };
    chunkBufs.set(msg.id, buf);
  }
  if (buf.parts[msg.seq] === undefined) {
    buf.parts[msg.seq] = msg.data;
    buf.received++;
  }
  setStatus(`릴레이 수신 중… (${buf.received}/${buf.total})`);
  if (buf.received >= buf.total) {
    chunkBufs.delete(msg.id);
    try {
      const parsed = JSON.parse(buf.parts.join("")) as H2FFile;
      setStatus("릴레이 수신 완료 — 임포트 중…");
      doImport(parsed);
    } catch {
      setStatus("수신 데이터 파싱 실패");
    }
  }
}

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (msg?.type === "status") setStatus(msg.text);
};
