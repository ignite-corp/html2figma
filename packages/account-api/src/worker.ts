/**
 * html2figma 계정/구독 API — Cloudflare Workers + SQLite Durable Object.
 *
 * 역할:
 *  - Figma OAuth code 교환 (client secret 은 여기에만 존재) → 자체 세션 토큰 발급
 *  - 구독 상태 조회 (GET /me)
 *  - Paddle 웹훅 수신 → 구독을 Figma 계정에 연결/동기화
 *
 * 무료 쿼터는 클라이언트(익스텐션)가 관리하므로 이 서버는 유료 사용자
 * (로그인한 사용자)의 최소 정보만 저장한다. 캡처 데이터는 다루지 않는다.
 *
 * 배포: pnpm --filter @html2figma/account-api deploy
 */
import { signToken, verifyToken } from "./token.js";
import { parseSubscriptionEvent, verifyPaddleSignature } from "./paddle.js";

export interface Env {
  ACCOUNT: DurableObjectNamespace;
  FIGMA_CLIENT_ID: string;
  FIGMA_CLIENT_SECRET: string;
  PADDLE_WEBHOOK_SECRET: string;
  SESSION_SIGNING_KEY: string;
}

const SESSION_TTL_SEC = 90 * 24 * 60 * 60; // 90일
const CHECKOUT_TTL_SEC = 10 * 60; // 10분

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

interface UserRow extends Record<string, SqlStorageValue> {
  figma_user_id: string;
  email: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  plan_status: string;
}

export class AccountDO implements DurableObject {
  private readonly sql: SqlStorage;

  constructor(state: DurableObjectState, private readonly env: Env) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        figma_user_id TEXT PRIMARY KEY,
        email TEXT,
        paddle_customer_id TEXT,
        paddle_subscription_id TEXT UNIQUE,
        plan_status TEXT NOT NULL DEFAULT 'free',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS webhook_events (
        event_id TEXT PRIMARY KEY,
        received_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/auth/callback") {
        return await this.authCallback(request);
      }
      if (request.method === "GET" && url.pathname === "/me") {
        return await this.me(request);
      }
      if (request.method === "POST" && url.pathname === "/paddle/webhook") {
        return await this.paddleWebhook(request);
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error("account-api error:", e);
      return json({ error: "internal" }, 500);
    }
  }

  /* ---------------- Figma OAuth ---------------- */

  private async authCallback(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      code?: string;
      verifier?: string;
      redirectUri?: string;
    };
    if (!body.code || !body.redirectUri) return json({ error: "bad request" }, 400);

    // 1) code → access token (PKCE + client secret)
    const basic = btoa(`${this.env.FIGMA_CLIENT_ID}:${this.env.FIGMA_CLIENT_SECRET}`);
    const form = new URLSearchParams({
      redirect_uri: body.redirectUri,
      code: body.code,
      grant_type: "authorization_code",
    });
    if (body.verifier) form.set("code_verifier", body.verifier);

    const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!tokenRes.ok) return json({ error: "oauth exchange failed" }, 401);
    const token = (await tokenRes.json()) as { access_token: string };

    // 2) 신원 조회 후 Figma 토큰은 폐기한다 (저장하지 않음)
    const meRes = await fetch("https://api.figma.com/v1/me", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) return json({ error: "figma /me failed" }, 401);
    const me = (await meRes.json()) as { id: string; email?: string };

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO users (figma_user_id, email, plan_status, created_at, updated_at)
       VALUES (?, ?, 'free', ?, ?)
       ON CONFLICT(figma_user_id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`,
      me.id, me.email ?? null, now, now
    );
    const row = this.getUser(me.id);

    const session = await signToken(
      { sub: me.id, use: "session", email: me.email },
      this.env.SESSION_SIGNING_KEY,
      SESSION_TTL_SEC
    );
    return json({ session, email: me.email, plan: toPlan(row) });
  }

  /* ---------------- 구독 상태 ---------------- */

  private async me(request: Request): Promise<Response> {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const payload = await verifyToken(token, this.env.SESSION_SIGNING_KEY, "session");
    if (!payload) return json({ error: "unauthorized" }, 401);

    const row = this.getUser(payload.sub);
    const plan = toPlan(row);
    const email = row?.email ?? payload.email;

    if (plan === "pro") return json({ plan, email });

    // 무료 사용자에게는 결제 페이지로 넘길 계정 연결 토큰을 함께 발급
    const checkoutToken = await signToken(
      { sub: payload.sub, use: "checkout", email },
      this.env.SESSION_SIGNING_KEY,
      CHECKOUT_TTL_SEC
    );
    return json({ plan, email, checkoutToken });
  }

  /* ---------------- Paddle 웹훅 ---------------- */

  private async paddleWebhook(request: Request): Promise<Response> {
    const rawBody = await request.text();
    const ok = await verifyPaddleSignature(
      rawBody,
      request.headers.get("paddle-signature"),
      this.env.PADDLE_WEBHOOK_SECRET
    );
    if (!ok) return json({ error: "bad signature" }, 401);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: "bad body" }, 400);
    }
    const evt = parseSubscriptionEvent(parsed);
    if (!evt) return json({ ok: true, ignored: true }); // 관심 없는 이벤트는 무시(200 응답 필수)

    // 리플레이/중복 전송 방지
    const dup = this.sql
      .exec("SELECT 1 AS x FROM webhook_events WHERE event_id = ?", evt.eventId)
      .toArray();
    if (dup.length > 0) return json({ ok: true, duplicate: true });
    this.sql.exec(
      "INSERT INTO webhook_events (event_id, received_at) VALUES (?, ?)",
      evt.eventId, Date.now()
    );

    // 계정 결정: 체크아웃 토큰(신규 결제) 우선, 없으면 기존 구독 ID 로 조회
    let figmaUserId: string | undefined;
    let email: string | undefined;
    if (evt.checkoutToken) {
      const ct = await verifyToken(evt.checkoutToken, this.env.SESSION_SIGNING_KEY, "checkout");
      if (ct) {
        figmaUserId = ct.sub;
        email = ct.email;
      }
    }
    if (!figmaUserId) {
      const found = this.sql
        .exec<UserRow>(
          "SELECT * FROM users WHERE paddle_subscription_id = ?",
          evt.subscriptionId
        )
        .toArray();
      figmaUserId = found[0]?.figma_user_id;
    }
    if (!figmaUserId) {
      // 연결할 계정을 못 찾음 — 수동 조치가 필요하므로 로그만 남기고 성공 응답
      console.error("paddle webhook: 계정 미연결", evt.eventType, evt.subscriptionId);
      return json({ ok: true, unlinked: true });
    }

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO users (figma_user_id, email, paddle_customer_id, paddle_subscription_id, plan_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(figma_user_id) DO UPDATE SET
         paddle_customer_id = excluded.paddle_customer_id,
         paddle_subscription_id = excluded.paddle_subscription_id,
         plan_status = excluded.plan_status,
         updated_at = excluded.updated_at`,
      figmaUserId, email ?? null, evt.customerId ?? null, evt.subscriptionId, evt.planStatus, now, now
    );
    return json({ ok: true });
  }

  private getUser(figmaUserId: string): UserRow | undefined {
    return this.sql
      .exec<UserRow>("SELECT * FROM users WHERE figma_user_id = ?", figmaUserId)
      .toArray()[0];
  }
}

function toPlan(row: UserRow | undefined): "free" | "pro" {
  return row?.plan_status === "active" ? "pro" : "free";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: CORS_HEADERS });
    }
    // 모든 상태는 단일 DO 에 있다 (현 규모에서 충분, 릴레이와 동일 패턴)
    const id = env.ACCOUNT.idFromName("global");
    return env.ACCOUNT.get(id).fetch(request);
  },
};
