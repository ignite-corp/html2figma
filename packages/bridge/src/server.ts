/**
 * html2figma 릴레이 서버.
 *
 * 룸 + 페어링 코드 방식으로 익스텐션(캡처)과 Figma 플러그인을 격리 중계한다.
 * 로컬(자체 호스팅/개발)과 일반 Node 호스팅(Render/Fly/Railway/Koyeb 등) 모두에서 동작한다.
 *   - PORT 환경변수를 우선 사용(호스팅 플랫폼이 주입). 없으면 8787.
 *   - GET /health 로 헬스체크 응답, 그 외 경로는 WebSocket 업그레이드만 허용.
 *
 * 실행: pnpm --filter @html2figma/bridge start
 */
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { RelayHub, type RelayConn, type RelayServerMsg } from "@html2figma/shared";

const PORT = Number(process.env.PORT ?? process.env.H2F_BRIDGE_PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

const hub = new RelayHub();

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("html2figma relay: ok");
    return;
  }
  res.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
  res.end("Upgrade Required");
});

const wss = new WebSocketServer({ server: httpServer });

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

httpServer.listen(PORT, HOST, () => {
  console.log(`[relay] html2figma 릴레이 실행 중 → :${PORT} (host ${HOST})`);
  console.log("[relay] Figma 플러그인에서 '연결'로 코드를 받고, 익스텐션에 그 코드를 입력하세요.");
});
