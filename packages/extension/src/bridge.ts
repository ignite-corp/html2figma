import type { H2FFile, RelayServerMsg } from "@html2figma/shared";
import {
  normalizeCode,
  RELAY_CHUNK_CHARS,
  RELAY_MAX_TOTAL_BYTES,
} from "@html2figma/shared";

/** 공개 릴레이 주소. */
export const DEFAULT_RELAY_URL = "wss://html2figma-relay.onrender.com";

/** 릴레이 URL. */
export async function getRelayUrl(): Promise<string> {
  return DEFAULT_RELAY_URL;
}

export interface RelayResult {
  ok: boolean;
  message?: string;
}

export interface RelayOptions {
  /** 연결 + 페어링(joined) 까지 허용 시간. 무료 호스팅 콜드스타트를 고려해 넉넉히. */
  connectTimeoutMs?: number;
  /** 업로드/응답이 이 시간 동안 전혀 진척되지 않으면 실패로 판단. */
  stallTimeoutMs?: number;
  /** 진행 상황 콜백(단계 텍스트, 0~1 비율). */
  onProgress?: (step: string, ratio: number) => void;
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 페어링 코드로 릴레이 룸에 참여한 뒤 .h2f 페이로드를 1회 전송한다.
 *
 * 이미지가 많은 페이지는 페이로드가 커서 업로드에 오래 걸리므로,
 * 단일 고정 타임아웃 대신 단계별로 나눈다:
 *  - 연결/페어링 단계: connectTimeoutMs (콜드스타트 대비 넉넉히)
 *  - 업로드/응답 단계: ws.bufferedAmount 를 감시해 진척이 있으면 계속 대기하고,
 *    stallTimeoutMs 동안 전혀 진척이 없을 때만 실패 처리
 */
export function sendToRelay(
  payload: H2FFile,
  code: string,
  relayUrl: string,
  opts: RelayOptions = {}
): Promise<RelayResult> {
  const connectTimeoutMs = opts.connectTimeoutMs ?? 45000;
  const stallTimeoutMs = opts.stallTimeoutMs ?? 25000;
  const onProgress = opts.onProgress ?? (() => {});

  return new Promise((resolve) => {
    // 페이로드를 문자열로 직렬화한다. 큰 데이터는 청크로 나눠 전송하므로
    // 단일 프레임 상한이 아니라 전체 상한만 검사한다.
    const body = JSON.stringify(payload);
    const totalBytes = new TextEncoder().encode(body).length;
    if (totalBytes > RELAY_MAX_TOTAL_BYTES) {
      resolve({
        ok: false,
        message: `데이터가 너무 큽니다 (${formatMB(totalBytes)} > 최대 ${formatMB(
          RELAY_MAX_TOTAL_BYTES
        )}). 페이지를 나눠서 캡처해 주세요.`,
      });
      return;
    }
    const transferId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
    };
    const done = (r: RelayResult) => {
      if (settled) return;
      settled = true;
      clearTimers();
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

    // 1단계: 연결 + 페어링(joined) 대기
    onProgress("Figma 릴레이 연결 중…", 0);
    timer = setTimeout(
      () =>
        done({
          ok: false,
          message: "릴레이 응답 없음 (서버가 깨어나는 중일 수 있어요. 잠시 후 다시 시도)",
        }),
      connectTimeoutMs
    );

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
        // 2단계: 청크 업로드 시작 + 백프레셔/진척 감시
        if (timer) clearTimeout(timer);
        const totalChunks = Math.max(1, Math.ceil(body.length / RELAY_CHUNK_CHARS));
        let seq = 0;
        let lastProgressAt = Date.now();
        let lastBuffered = ws.bufferedAmount;
        let flushedAt = 0;
        const HIGH_WATER = 8 * 1024 * 1024;
        const ACK_WAIT_MS = 20000;
        onProgress(`Figma로 전송 중… (0/${formatMB(totalBytes)})`, 0);

        poll = setInterval(() => {
          // 백프레셔(bufferedAmount)가 낮을 때만 다음 청크들을 밀어 넣는다.
          while (seq < totalChunks && ws.bufferedAmount <= HIGH_WATER) {
            const slice = body.slice(seq * RELAY_CHUNK_CHARS, (seq + 1) * RELAY_CHUNK_CHARS);
            try {
              ws.send(
                JSON.stringify({ type: "h2f-chunk", id: transferId, seq, total: totalChunks, data: slice })
              );
            } catch {
              done({ ok: false, message: "전송 중 오류가 발생했습니다." });
              return;
            }
            seq++;
            lastProgressAt = Date.now();
            const ratio = seq / totalChunks;
            onProgress(
              `Figma로 전송 중… (${formatMB(totalBytes * ratio)}/${formatMB(totalBytes)})`,
              Math.min(0.99, ratio)
            );
          }

          const buffered = ws.bufferedAmount;
          if (buffered < lastBuffered) lastProgressAt = Date.now();
          lastBuffered = buffered;

          // 모든 청크 전송 + 버퍼 비움 완료 → ack 대기.
          if (seq >= totalChunks && buffered === 0) {
            if (flushedAt === 0) flushedAt = Date.now();
            if (Date.now() - flushedAt > ACK_WAIT_MS) {
              done({ ok: false, message: "Figma 응답이 없습니다. 플러그인 연결을 확인해 주세요." });
            }
            return;
          }
          if (Date.now() - lastProgressAt > stallTimeoutMs) {
            done({ ok: false, message: "전송이 멈췄습니다 (네트워크 지연). 다시 시도해 주세요." });
          }
        }, 200);
      } else if (msg.type === "ack") {
        done({
          ok: msg.delivered > 0,
          message: msg.delivered > 0 ? undefined : "연결된 Figma 플러그인이 없습니다.",
        });
      } else if (msg.type === "error") {
        done({ ok: false, message: msg.message });
      }
    };
    ws.onerror = () => {
      done({ ok: false, message: "릴레이 연결 오류" });
    };
    ws.onclose = () => {
      done({ ok: false, message: "릴레이 연결이 끊겼습니다." });
    };
  });
}
