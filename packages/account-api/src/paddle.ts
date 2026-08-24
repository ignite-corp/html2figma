/**
 * Paddle Billing 웹훅 — 서명 검증과 이벤트 해석.
 * https://developer.paddle.com/webhooks/signature-verification
 */

const encoder = new TextEncoder();

/** 서명 헤더 `ts=...;h1=...` 를 rawBody 에 대해 검증한다. */
export async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs: number = Date.now(),
  maxAgeMs: number = 5 * 60 * 1000
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(";").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    })
  );
  const ts = parts.get("ts");
  const h1 = parts.get("h1");
  if (!ts || !h1) return false;

  // 리플레이 방지: 타임스탬프가 오래된 요청 거부
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > maxAgeMs) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}:${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // 고정 시간 비교
  if (expected.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

export interface PaddleSubscriptionEvent {
  eventId: string;
  eventType: string;
  subscriptionId: string;
  customerId?: string;
  /** Paddle 구독 status → 내부 plan_status */
  planStatus: "active" | "past_due" | "canceled";
  /** 체크아웃 시 custom_data 로 넘긴 계정 연결 토큰 */
  checkoutToken?: string;
  email?: string;
}

/**
 * 구독 관련 이벤트만 해석해 반환한다. 관심 없는 이벤트는 null.
 * (subscription.created / activated / updated / resumed / paused / past_due / canceled)
 */
export function parseSubscriptionEvent(body: unknown): PaddleSubscriptionEvent | null {
  const evt = body as {
    event_id?: string;
    event_type?: string;
    data?: {
      id?: string;
      status?: string;
      customer_id?: string;
      custom_data?: { checkoutToken?: string } | null;
    };
  };
  if (!evt?.event_id || !evt.event_type?.startsWith("subscription.") || !evt.data?.id) return null;

  const status = evt.data.status ?? "";
  let planStatus: PaddleSubscriptionEvent["planStatus"];
  if (status === "active" || status === "trialing") planStatus = "active";
  else if (status === "past_due") planStatus = "past_due";
  else planStatus = "canceled"; // canceled / paused / 그 외 → 비활성 취급

  return {
    eventId: evt.event_id,
    eventType: evt.event_type,
    subscriptionId: evt.data.id,
    customerId: evt.data.customer_id,
    planStatus,
    checkoutToken: evt.data.custom_data?.checkoutToken,
  };
}
