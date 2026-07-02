/**
 * html2figma 공개 릴레이 — Cloudflare Workers + Durable Objects.
 *
 * 모든 WebSocket 연결을 단일 Durable Object("global")로 라우팅하고,
 * shared 의 RelayHub 로 룸/페어링/격리를 처리한다. 데이터는 저장하지 않으며
 * 룸은 메모리에만 존재한다(무저장, ephemeral).
 *
 * 배포: pnpm --filter @html2figma/relay-cf deploy  (Cloudflare 계정 필요)
 */
import { RelayHub, type RelayConn, type RelayServerMsg } from "@html2figma/shared";

export interface Env {
  RELAY: DurableObjectNamespace;
}

class SocketConn implements RelayConn {
  constructor(private readonly ws: WebSocket) {}
  send(msg: RelayServerMsg): void {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* 닫힌 소켓 무시 */
    }
  }
}

export class RelayRoom implements DurableObject {
  private hub = new RelayHub();
  private conns = new WeakMap<WebSocket, SocketConn>();

  constructor(state: DurableObjectState) {
    // 주기적으로 유휴 룸 정리.
    state.blockConcurrencyWhile(async () => {
      setInterval(() => this.hub.sweep(), 60_000);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("html2figma relay: WebSocket 전용", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const conn = new SocketConn(server);
    this.conns.set(server, conn);

    server.addEventListener("message", (ev: MessageEvent) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      if (!raw) return;
      this.hub.handleMessage(conn, raw, byteLength(raw));
    });
    const cleanup = () => this.hub.handleClose(conn);
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    const id = env.RELAY.idFromName("global");
    const stub = env.RELAY.get(id);
    return stub.fetch(request);
  },
};
