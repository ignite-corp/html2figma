/**
 * Google OAuth 계정 — Pro 구독 확인용.
 *
 * 무료 사용에는 로그인이 필요 없다. 업그레이드(결제)와 다른 기기에서의
 * Pro 활성화 시에만 Google 로그인(scope: openid email profile, 신원만)을 요구한다.
 *
 * authorization-code 교환은 account-api Worker 가 수행한다(client secret 은
 * 서버에만 존재). 익스텐션은 Worker 가 발급한 자체 세션 토큰만 보관한다.
 */
import { ACCOUNT_API_URL, GOOGLE_CLIENT_ID, PRO_OFFLINE_GRACE_MS } from "./billingConfig.js";

const STORAGE_KEY = "account";

export interface AccountState {
  session: string;
  email?: string;
  /** 최근 서버 확인 결과 캐시 (Worker 장애 시 유예 판단용) */
  plan?: "free" | "pro";
  checkedAt?: number;
}

export interface AccountStatus {
  plan: "free" | "pro";
  email?: string;
  /** 결제 페이지로 전달하는 단기 토큰 (Pro 가 아닐 때만 내려옴) */
  checkoutToken?: string;
}

async function readAccount(): Promise<AccountState | undefined> {
  const s = await chrome.storage.local.get(STORAGE_KEY);
  const v = s[STORAGE_KEY] as AccountState | undefined;
  return v && typeof v.session === "string" ? v : undefined;
}

async function writeAccount(v: AccountState | undefined): Promise<void> {
  if (v) await chrome.storage.local.set({ [STORAGE_KEY]: v });
  else await chrome.storage.local.remove(STORAGE_KEY);
}

export async function getAccount(): Promise<AccountState | undefined> {
  return readAccount();
}

export async function signOut(): Promise<void> {
  await writeAccount(undefined);
}

/* ---------------- OAuth (PKCE + state) ---------------- */

function base64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(byteLen = 32): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return base64url(buf.buffer);
}

async function sha256base64url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64url(digest);
}

/**
 * Google 로그인. 성공 시 세션을 저장하고 계정 상태를 반환한다.
 * 사용자가 창을 닫는 등 취소하면 예외를 던진다.
 */
export async function signIn(): Promise<AccountStatus> {
  const redirectUri = chrome.identity.getRedirectURL();
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await sha256base64url(verifier);

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&scope=" +
    encodeURIComponent("openid email profile") +
    `&state=${state}` +
    "&response_type=code" +
    "&prompt=select_account" +
    `&code_challenge=${challenge}` +
    "&code_challenge_method=S256";

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!resultUrl) throw new Error("로그인이 취소되었습니다.");

  const params = new URL(resultUrl).searchParams;
  if (params.get("state") !== state) throw new Error("로그인 검증에 실패했습니다 (state 불일치).");
  const code = params.get("code");
  if (!code) throw new Error(params.get("error_description") ?? "로그인에 실패했습니다.");

  const res = await fetch(`${ACCOUNT_API_URL}/auth/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, verifier, redirectUri }),
  });
  if (!res.ok) throw new Error(`로그인 처리 실패 (${res.status})`);
  const data = (await res.json()) as { session: string; email?: string; plan: "free" | "pro" };

  await writeAccount({
    session: data.session,
    email: data.email,
    plan: data.plan,
    checkedAt: Date.now(),
  });
  return { plan: data.plan, email: data.email };
}

/* ---------------- 구독 상태 ---------------- */

/**
 * 서버에서 구독 상태를 조회한다. 네트워크/서버 장애 시에는 최근 확인값을
 * PRO_OFFLINE_GRACE_MS 동안 신뢰한다(오프라인 유예). 세션이 무효(401)면
 * 로그아웃 처리 후 free 를 반환한다.
 */
export async function fetchStatus(): Promise<AccountStatus | undefined> {
  const acc = await readAccount();
  if (!acc) return undefined;

  try {
    const res = await fetch(`${ACCOUNT_API_URL}/me`, {
      headers: { authorization: `Bearer ${acc.session}` },
    });
    if (res.status === 401) {
      await writeAccount(undefined);
      return undefined;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as AccountStatus;
    await writeAccount({ ...acc, email: data.email ?? acc.email, plan: data.plan, checkedAt: Date.now() });
    return data;
  } catch {
    if (acc.plan && acc.checkedAt && Date.now() - acc.checkedAt < PRO_OFFLINE_GRACE_MS) {
      return { plan: acc.plan, email: acc.email };
    }
    return { plan: "free", email: acc.email };
  }
}

/** 캡처 게이트용: 로그인돼 있고 구독이 활성이면 true. */
export async function isPro(): Promise<boolean> {
  const status = await fetchStatus();
  return status?.plan === "pro";
}
