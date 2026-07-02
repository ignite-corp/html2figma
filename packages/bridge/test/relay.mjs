/**
 * RelayHub 룸/페어링/격리 단위 테스트.
 * 전송 계층 없이 mock RelayConn 으로 검증한다.
 *   실행: pnpm --filter @html2figma/bridge test
 */
import { RelayHub, RELAY_MAX_PAYLOAD_BYTES } from "@html2figma/shared";

let fail = 0;
const A = (cond, msg) => (cond ? console.log("  ✓ " + msg) : (console.error("  ✗ " + msg), fail++));

/** 받은 메시지를 기록하는 mock 소켓. */
function mkConn() {
  const inbox = [];
  return { inbox, send: (m) => inbox.push(m), last: () => inbox[inbox.length - 1] };
}
const send = (hub, conn, obj) => hub.handleMessage(conn, JSON.stringify(obj));
const doc = (title) => ({ version: "0.1.0", meta: { title }, root: { type: "frame" }, assets: {} });

console.log("페어링 + 룸 격리:");
{
  const hub = new RelayHub();

  // 룸 A: figmaA 가 방 생성 → 코드 발급
  const figmaA = mkConn();
  send(hub, figmaA, { type: "create-room" });
  const roomMsgA = figmaA.last();
  A(roomMsgA.type === "room" && typeof roomMsgA.code === "string", "figmaA 코드 발급");
  A(roomMsgA.code.length === 6, "코드는 6자리");
  const codeA = roomMsgA.code;

  // 룸 B: figmaB 가 별도 방 생성
  const figmaB = mkConn();
  send(hub, figmaB, { type: "create-room" });
  const codeB = figmaB.last().code;
  A(codeA !== codeB, "두 방의 코드는 서로 다름");
  A(hub.roomCount === 2, "룸 2개 존재");

  // extA 가 코드A 로 참여
  const extA = mkConn();
  send(hub, extA, { type: "join", code: codeA });
  A(extA.last().type === "joined", "extA 참여 성공");
  A(figmaA.last().type === "peer-joined", "figmaA 에 peer-joined 통지");

  // extA 가 캡처 전송 → figmaA 만 받고 figmaB 는 못 받아야 함(격리)
  send(hub, extA, { type: "h2f", payload: doc("A") });
  A(extA.last().type === "ack" && extA.last().delivered === 1, "extA ack delivered=1");
  const gotA = figmaA.inbox.find((m) => m.type === "h2f");
  A(gotA && gotA.payload.meta.title === "A", "figmaA 가 A 페이로드 수신");
  A(!figmaB.inbox.some((m) => m.type === "h2f"), "figmaB 는 A 페이로드 수신 안 함(격리)");
}

console.log("에러 처리:");
{
  const hub = new RelayHub();
  // 없는 코드로 join
  const ext = mkConn();
  send(hub, ext, { type: "join", code: "ZZZZZZ" });
  A(ext.last().type === "error" && ext.last().reason === "no-room", "없는 코드 → no-room 에러");

  // 참여 없이 h2f 전송
  const ext2 = mkConn();
  send(hub, ext2, { type: "h2f", payload: doc("x") });
  A(ext2.last().type === "error", "미참여 상태 h2f → 에러");

  // 잘못된 JSON
  const ext3 = mkConn();
  hub.handleMessage(ext3, "not json{");
  A(ext3.last().reason === "bad-message", "잘못된 JSON → bad-message");

  // 과대 페이로드
  const figma = mkConn();
  send(hub, figma, { type: "create-room" });
  const code = figma.last().code;
  const ext4 = mkConn();
  send(hub, ext4, { type: "join", code });
  hub.handleMessage(ext4, JSON.stringify({ type: "h2f", payload: doc("big") }), RELAY_MAX_PAYLOAD_BYTES + 1);
  A(ext4.last().reason === "too-large", "과대 페이로드 → too-large");
}

console.log("연결 종료 처리:");
{
  const hub = new RelayHub();
  const figma = mkConn();
  send(hub, figma, { type: "create-room" });
  A(hub.roomCount === 1, "룸 생성됨");
  hub.handleClose(figma);
  A(hub.roomCount === 0, "figma 종료 시 룸 폐기");
}

console.log(fail === 0 ? "\n✅ 릴레이 허브 테스트 통과" : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
