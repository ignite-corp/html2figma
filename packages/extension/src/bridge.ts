import type { H2FFile, RelayServerMsg } from "@html2figma/shared";
import { normalizeCode } from "@html2figma/shared";

/** 기본 릴레이 주소. 공개 배포 시 chrome.storage 의 relayUrl 로 덮어쓴다. */
export const DEFAULT_RELAY_URL = "ws://localhost:8787";

/** 저장된 릴레이 URL(없으면 기본값). */
export async function getRelayUrl(): Promise<string> {
  try {
    const { relayUrl } = await chrome.storage.local.get("relayUrl");
    return (typeof relayUrl === "string" && relayUrl.trim()) || DEFAULT_RELAY_URL;
  } catch {
    return DEFAULT_RELAY_URL;
  }
}

export interface RelayResult {
  ok: boolean;
  message?: string;
}

/**
 * 페어링 코드로 릴레이 룸에 참여한 뒤 .h2f 페이로드를 1회 전송한다.
 * 서버/코드 문제가 있으면 ok:false 와 사유를 반환한다.
 */
export function sendToRelay(
  payload: H2FFile,
  code: string,
  relayUrl: string,
  timeoutMs = 8000
): Promise<RelayResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: RelayResult) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      resolve({ ok: false, message: "릴레이에 연결할 수 없습니다." });
      return;
    }

    const timer = setTimeout(() => done({ ok: false, message: "응답 시간 초과" }), timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", code: normalizeCode(code) }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: RelayServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as RelayServerMsg;
      } catch {
        return;
      }
      if (msg.type === "joined") {
        ws.send(JSON.stringify({ type: "h2f", payload }));
      } else if (msg.type === "ack") {
        clearTimeout(timer);
        done({ ok: msg.delivered > 0, message: msg.delivered > 0 ? undefined : "연결된 플러그인 없음" });
      } else if (msg.type === "error") {
        clearTimeout(timer);
        done({ ok: false, message: msg.message });
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done({ ok: false, message: "릴레이 연결 오류" });
    };
  });
}
