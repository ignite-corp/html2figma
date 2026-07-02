import type { H2FFile } from "@html2figma/shared";

/** 로컬 브릿지 서버 주소 (packages/bridge). */
export const BRIDGE_URL = "ws://localhost:8787";

/**
 * 브릿지 서버로 .h2f 페이로드를 1회 전송한다.
 * 서버가 없으면 조용히 실패(false)한다.
 */
export function sendToBridge(payload: H2FFile, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(BRIDGE_URL);
    } catch {
      done(false);
      return;
    }

    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      done(false);
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "h2f", payload }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "ack") {
          clearTimeout(timer);
          ws.close();
          done(true);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done(false);
    };
  });
}
