/**
 * HMAC-SHA256 서명 토큰 (JWT compact 형식, HS256).
 *
 * 용도:
 *  - 세션 토큰: 익스텐션이 보관하는 로그인 증명 (기본 90일)
 *  - 체크아웃 토큰: 결제 페이지 → Paddle custom_data 로 전달되는 단기 계정 연결 증명 (10분)
 *
 * WebCrypto 만 사용하므로 Workers 와 Node(테스트) 양쪽에서 동작한다.
 */

export interface TokenPayload {
  /** Figma user id */
  sub: string;
  /** 토큰 용도 구분 — 세션 토큰을 체크아웃 토큰으로 재사용하는 것을 막는다 */
  use: "session" | "checkout";
  email?: string;
  iat: number; // seconds
  exp: number; // seconds
}

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(
  payload: Omit<TokenPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds: number,
  nowMs: number = Date.now()
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const full: TokenPayload = { ...payload, iat, exp: iat + ttlSeconds };
  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(encoder.encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

/** 서명·만료 검증. 실패 시 null. */
export async function verifyToken(
  token: string,
  secret: string,
  expectedUse: TokenPayload["use"],
  nowMs: number = Date.now()
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;

  let sigBytes: Uint8Array;
  try {
    sigBytes = Uint8Array.from(b64urlDecode(sig), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    encoder.encode(`${header}.${body}`)
  );
  if (!valid) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body)) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (payload.use !== expectedUse) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= nowMs) return null;
  return payload;
}
