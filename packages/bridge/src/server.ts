/**
 * html2figma 로컬 릴레이 서버 (자체 호스팅 / 개발용).
 *
 * 룸 + 페어링 코드 방식으로 익스텐션(캡처)과 Figma 플러그인을 격리 중계한다.
 * 공개 호스팅은 packages/relay-cf (Cloudflare Workers) 를 사용한다.
 *
 * 실행: pnpm --filter @html2figma/bridge start
 */
import { WebSocketServer, WebSocket } from "ws";
import { RelayHub, type RelayConn, type RelayServerMsg } from "@html2figma/shared";

const PORT = Number(process.env.H2F_BRIDGE_PORT ?? 8787);

const wss = new WebSocketServer({ port: PORT });
const hub = new RelayHub();

class WsConn implements RelayConn {
  constructor(private readonly socket: WebSocket) {}
  send(msg: RelayServerMsg): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }
}

wss.on("connection", (socket: WebSocket) => {
  const conn = new WsConn(socket);
  socket.on("message", (data) => {
    const raw = data.toString();
    hub.handleMessage(conn, raw, Buffer.byteLength(raw));
  });
  socket.on("close", () => hub.handleClose(conn));
  socket.on("error", () => hub.handleClose(conn));
});

setInterval(() => hub.sweep(), 60_000).unref?.();

wss.on("listening", () => {
  console.log(`[bridge] html2figma 릴레이 실행 중 → ws://localhost:${PORT}`);
  console.log("[bridge] Figma 플러그인에서 '연결'로 코드를 받고, 익스텐션에 그 코드를 입력하세요.");
});
