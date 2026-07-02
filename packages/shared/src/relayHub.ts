/**
 * 전송 계층에 독립적인 릴레이 허브.
 *
 * node의 `ws`, Cloudflare Durable Object의 WebSocket 등 어떤 소켓이든
 * `RelayConn` 인터페이스로 감싸 넘기면 동일한 룸/페어링 로직을 재사용한다.
 */
import {
  RELAY_MAX_PAYLOAD_BYTES,
  RELAY_ROOM_TTL_MS,
  isValidCode,
  makeRoomCode,
  normalizeCode,
  type RelayClientMsg,
  type RelayServerMsg,
} from "./relay.js";

/** 릴레이가 다루는 최소 소켓 추상화. */
export interface RelayConn {
  send(msg: RelayServerMsg): void;
}

interface Room {
  figma: Set<RelayConn>;
  ext: Set<RelayConn>;
  last: number;
}

interface ConnInfo {
  role: "figma" | "ext";
  code: string;
  /** rate limit 용 최근 h2f 타임스탬프 목록. */
  hits: number[];
}

const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 30;

export class RelayHub {
  private rooms = new Map<string, Room>();
  private info = new Map<RelayConn, ConnInfo>();

  get roomCount(): number {
    return this.rooms.size;
  }

  /**
   * 소켓에서 받은 원문 메시지를 처리한다.
   * @param sizeBytes 페이로드 바이트 크기(전송 계층에서 계산해 전달). 없으면 문자열 길이로 근사.
   */
  handleMessage(conn: RelayConn, raw: string, sizeBytes?: number): void {
    let msg: RelayClientMsg;
    try {
      msg = JSON.parse(raw) as RelayClientMsg;
    } catch {
      conn.send({ type: "error", reason: "bad-message", message: "JSON 파싱 실패" });
      return;
    }

    switch (msg.type) {
      case "create-room":
        return this.createRoom(conn);
      case "join":
        return this.join(conn, msg.code);
      case "h2f":
        return this.relay(conn, msg, sizeBytes ?? raw.length);
      default:
        conn.send({ type: "error", reason: "bad-message", message: "알 수 없는 메시지" });
    }
  }

  handleClose(conn: RelayConn): void {
    const info = this.info.get(conn);
    this.info.delete(conn);
    if (!info) return;
    const room = this.rooms.get(info.code);
    if (!room) return;
    room.figma.delete(conn);
    room.ext.delete(conn);
    // Figma(방장)가 모두 나가면 룸을 폐기한다.
    if (room.figma.size === 0) this.rooms.delete(info.code);
  }

  /** TTL이 지난 유휴 룸을 정리한다. */
  sweep(now: number = Date.now()): void {
    for (const [code, room] of this.rooms) {
      if (now - room.last > RELAY_ROOM_TTL_MS) this.rooms.delete(code);
    }
  }

  private createRoom(conn: RelayConn): void {
    let code = makeRoomCode();
    let guard = 0;
    while (this.rooms.has(code) && guard++ < 50) code = makeRoomCode();
    this.rooms.set(code, { figma: new Set([conn]), ext: new Set(), last: Date.now() });
    this.info.set(conn, { role: "figma", code, hits: [] });
    conn.send({ type: "room", code });
  }

  private join(conn: RelayConn, rawCode: string): void {
    const code = normalizeCode(String(rawCode ?? ""));
    if (!isValidCode(code)) {
      conn.send({ type: "error", reason: "no-room", message: "코드 형식이 올바르지 않습니다." });
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      conn.send({ type: "error", reason: "no-room", message: "해당 코드의 세션을 찾을 수 없습니다." });
      return;
    }
    room.ext.add(conn);
    room.last = Date.now();
    this.info.set(conn, { role: "ext", code, hits: [] });
    conn.send({ type: "joined" });
    for (const f of room.figma) f.send({ type: "peer-joined" });
  }

  private relay(conn: RelayConn, msg: Extract<RelayClientMsg, { type: "h2f" }>, sizeBytes: number): void {
    const info = this.info.get(conn);
    if (!info || info.role !== "ext") {
      conn.send({ type: "error", reason: "no-room", message: "먼저 코드로 세션에 참여하세요." });
      return;
    }
    if (sizeBytes > RELAY_MAX_PAYLOAD_BYTES) {
      conn.send({ type: "error", reason: "too-large", message: "페이로드가 너무 큽니다." });
      return;
    }
    if (this.rateLimited(info)) {
      conn.send({ type: "error", reason: "rate-limited", message: "전송이 너무 잦습니다." });
      return;
    }
    const room = this.rooms.get(info.code);
    if (!room || room.figma.size === 0) {
      conn.send({ type: "error", reason: "no-peer", message: "연결된 Figma 플러그인이 없습니다." });
      return;
    }
    room.last = Date.now();
    let delivered = 0;
    for (const f of room.figma) {
      f.send({ type: "h2f", payload: msg.payload });
      delivered++;
    }
    conn.send({ type: "ack", delivered });
  }

  private rateLimited(info: ConnInfo): boolean {
    const now = Date.now();
    info.hits = info.hits.filter((t) => now - t < RATE_WINDOW_MS);
    if (info.hits.length >= RATE_MAX) return true;
    info.hits.push(now);
    return false;
  }
}
