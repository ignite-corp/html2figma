/**
 * account-api 순수 로직 테스트 (Node 에서 실행 — WebCrypto 공용).
 * 실행: pnpm --filter @html2figma/account-api test
 */
import { signToken, verifyToken } from "../src/token.js";
import { parseSubscriptionEvent, verifyPaddleSignature } from "../src/paddle.js";

let failures = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

const SECRET = "test-secret";

async function testToken() {
  console.log("token:");
  const t = await signToken({ sub: "user-1", use: "session", email: "a@b.c" }, SECRET, 60);
  const ok = await verifyToken(t, SECRET, "session");
  assert(ok?.sub === "user-1" && ok.email === "a@b.c", "세션 토큰 왕복");

  assert((await verifyToken(t, SECRET, "checkout")) === null, "용도(use) 불일치 거부");
  assert((await verifyToken(t, "other-secret", "session")) === null, "다른 키 서명 거부");

  const [h, b] = t.split(".");
  const tampered = `${h}.${b.slice(0, -2)}xx.${t.split(".")[2]}`;
  assert((await verifyToken(tampered, SECRET, "session")) === null, "본문 변조 거부");

  const expired = await signToken({ sub: "u", use: "session" }, SECRET, 60, Date.now() - 120_000);
  assert((await verifyToken(expired, SECRET, "session")) === null, "만료 토큰 거부");
}

async function paddleSig(rawBody: string, secret: string, tsSec: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${tsSec}:${rawBody}`));
  const hex = [...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `ts=${tsSec};h1=${hex}`;
}

async function testPaddleSignature() {
  console.log("paddle signature:");
  const body = '{"event_id":"evt_1"}';
  const now = Date.now();
  const ts = Math.floor(now / 1000);

  assert(
    await verifyPaddleSignature(body, await paddleSig(body, SECRET, ts), SECRET, now),
    "유효 서명 통과"
  );
  assert(
    !(await verifyPaddleSignature(body, await paddleSig(body, "wrong", ts), SECRET, now)),
    "잘못된 키 서명 거부"
  );
  assert(
    !(await verifyPaddleSignature(body, await paddleSig(body, SECRET, ts - 600), SECRET, now)),
    "5분 지난 타임스탬프 거부 (리플레이 방지)"
  );
  assert(
    !(await verifyPaddleSignature(body + " ", await paddleSig(body, SECRET, ts), SECRET, now)),
    "본문 변조 거부"
  );
  assert(!(await verifyPaddleSignature(body, null, SECRET, now)), "헤더 없음 거부");
}

function testParseEvent() {
  console.log("paddle event parse:");
  const base = {
    event_id: "evt_1",
    event_type: "subscription.created",
    data: {
      id: "sub_1",
      status: "active",
      customer_id: "ctm_1",
      custom_data: { checkoutToken: "tok" },
    },
  };
  const evt = parseSubscriptionEvent(base);
  assert(
    evt?.subscriptionId === "sub_1" && evt.planStatus === "active" && evt.checkoutToken === "tok",
    "created/active 해석"
  );
  assert(
    parseSubscriptionEvent({ ...base, data: { ...base.data, status: "past_due" } })?.planStatus === "past_due",
    "past_due 매핑"
  );
  assert(
    parseSubscriptionEvent({ ...base, data: { ...base.data, status: "paused" } })?.planStatus === "canceled",
    "paused → 비활성(canceled) 취급"
  );
  assert(
    parseSubscriptionEvent({ ...base, data: { ...base.data, status: "trialing" } })?.planStatus === "active",
    "trialing → active"
  );
  assert(
    parseSubscriptionEvent({ event_id: "e", event_type: "transaction.completed", data: { id: "txn" } }) === null,
    "구독 외 이벤트 무시"
  );
}

await testToken();
await testPaddleSignature();
testParseEvent();

if (failures > 0) {
  console.error(`\n${failures}개 실패`);
  process.exit(1);
}
console.log("\n모든 테스트 통과");
