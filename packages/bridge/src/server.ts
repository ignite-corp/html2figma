/**
 * html2figma 로컬 브릿지 서버.
 *
 * 크롬 익스텐션(캡처)과 Figma 플러그인을 중계한다.
 * - 익스텐션이 { type:"h2f", payload } 를 보내면
 * - "figma" 역할로 접속한 모든 플러그인 클라이언트에게 전달하고
 * - 보낸 쪽에는 { type:"ack" } 로 응답한다.
 *
 * 실행: pnpm --filter @html2figma/bridge start  (또는 h2f-bridge)
 */
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.H2F_BRIDGE_PORT ?? 8787);

interface Client extends WebSocket {
  role?: "figma" | "extension";
}

const wss = new WebSocketServer({ port: PORT });
const figmaClients = new Set<Client>();

wss.on("connection", (socket: Client) => {
  socket.on("message", (data) => {
    let msg: { type?: string; role?: string; payload?: unknown };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "hello" && msg.role === "figma") {
      socket.role = "figma";
      figmaClients.add(socket);
      console.log(`[bridge] Figma 플러그인 연결됨 (총 ${figmaClients.size})`);
      return;
    }

    if (msg.type === "h2f" && msg.payload != null) {
      const text = JSON.stringify({ type: "h2f", payload: msg.payload });
      let delivered = 0;
      for (const c of figmaClients) {
        if (c.readyState === WebSocket.OPEN) {
          c.send(text);
          delivered++;
        }
      }
      console.log(`[bridge] h2f 페이로드 전달 → ${delivered}개 플러그인`);
      try {
        socket.send(JSON.stringify({ type: "ack", delivered }));
      } catch {
        /* ignore */
      }
    }
  });

  socket.on("close", () => {
    figmaClients.delete(socket);
  });
});

wss.on("listening", () => {
  console.log(`[bridge] html2figma 브릿지 실행 중 → ws://localhost:${PORT}`);
  console.log("[bridge] 익스텐션에서 'Figma로 전송', 플러그인에서 '브릿지 연결'을 사용하세요.");
});
