/**
 * direct-send 릴레이 프로토콜 (공개 배포용).
 *
 * 기존 브로드캐스트 방식은 접속한 모든 Figma 클라이언트에게 전달되어
 * 다수 사용자 환경에서 캡처가 서로 섞이는 문제가 있었다. 이를 해결하기 위해
 * **룸(room) + 페어링 코드** 방식으로 격리한다.
 *
 * 흐름:
 *  1. Figma 플러그인이 접속 → { type: "create-room" } 전송
 *  2. 서버가 6자리 코드를 발급 → { type: "room", code } 응답, 플러그인이 코드 표시
 *  3. 사용자가 익스텐션에 코드 입력 → { type: "join", code } 전송
 *  4. 서버가 룸 확인 → 익스텐션엔 { type: "joined" }, 플러그인엔 { type: "peer-joined" }
 *  5. 익스텐션이 { type: "h2f", payload } 전송 → 같은 룸의 플러그인에게만 전달
 *  6. 서버가 익스텐션에 { type: "ack", delivered } 응답
 */
import type { H2FFile } from "./ir.js";

/** 페어링 코드 길이. */
export const RELAY_CODE_LEN = 6;

/**
 * 페어링 코드 문자셋. 혼동하기 쉬운 문자(0/O, 1/I/L)를 제외한다.
 */
export const RELAY_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 릴레이가 허용하는 최대 페이로드 크기(바이트). 개별 메시지(청크 포함) 프레임 상한. */
export const RELAY_MAX_PAYLOAD_BYTES = 40 * 1024 * 1024;

/**
 * 청크 전송 시 한 청크에 담는 최대 문자 수.
 * Cloudflare Durable Object 의 WS 메시지 상한(1MiB)과 JSON 이스케이프 여유를 고려해
 * 넉넉히 작게 잡는다(대부분 base64 ASCII 라 문자 수≈바이트 수).
 */
export const RELAY_CHUNK_CHARS = 256 * 1024;

/** 청크 전송 전체(재조립본) 상한. 남용 방지용 안전장치. */
export const RELAY_MAX_TOTAL_BYTES = 300 * 1024 * 1024;

/** 활동 없는 룸을 정리하기까지의 시간(ms). */
export const RELAY_ROOM_TTL_MS = 60 * 60 * 1000;

/** 클라이언트 → 서버 메시지. */
export type RelayClientMsg =
  | { type: "create-room" }
  | { type: "join"; code: string }
  | { type: "h2f"; payload: H2FFile }
  | { type: "h2f-chunk"; id: string; seq: number; total: number; data: string };

/** 서버 → 클라이언트 메시지. */
export type RelayServerMsg =
  | { type: "room"; code: string }
  | { type: "peer-joined" }
  | { type: "joined" }
  | { type: "h2f"; payload: H2FFile }
  | { type: "h2f-chunk"; id: string; seq: number; total: number; data: string }
  | { type: "ack"; delivered: number }
  | { type: "error"; reason: RelayErrorReason; message: string };

export type RelayErrorReason =
  | "no-room"
  | "bad-message"
  | "too-large"
  | "no-peer"
  | "rate-limited";

/** 암호학적으로 안전한 6자리 페어링 코드를 생성한다(Node/브라우저/Workers 공용). */
export function makeRoomCode(len: number = RELAY_CODE_LEN): string {
  const chars = RELAY_CODE_CHARS;
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
  const getRandomValues = g.crypto?.getRandomValues?.bind(g.crypto);
  let out = "";
  if (getRandomValues) {
    const buf = getRandomValues(new Uint32Array(len));
    for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** 입력 코드를 정규화한다(대문자, 공백/하이픈 제거). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 코드 형식 검증. */
export function isValidCode(code: string): boolean {
  if (code.length !== RELAY_CODE_LEN) return false;
  for (const ch of code) if (!RELAY_CODE_CHARS.includes(ch)) return false;
  return true;
}
