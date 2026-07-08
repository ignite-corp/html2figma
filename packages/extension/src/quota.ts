/**
 * 무료 플랜 월간 쿼터 — 클라이언트 카운팅.
 *
 * 월(UTC) 이 바뀌면 자동 리셋된다. 재설치 시 초기화되는 것은 알려진
 * 트레이드오프(무로그인 온보딩과 맞바꿈, 플랜 문서 참조).
 */
import { FREE_MONTHLY_LIMIT } from "./config.js";

const STORAGE_KEY = "quota";

export interface QuotaState {
  month: string; // UTC "YYYY-MM"
  count: number;
}

export interface Quota {
  month: string;
  used: number;
  limit: number;
  remaining: number;
}

export function currentMonthUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** 저장값 + 현재 월 → 유효 쿼터. 월이 다르면 0회 사용으로 취급한다. */
export function resolveQuota(stored: QuotaState | undefined, month: string): Quota {
  const used = stored && stored.month === month ? Math.max(0, stored.count) : 0;
  return {
    month,
    used,
    limit: FREE_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_MONTHLY_LIMIT - used),
  };
}

async function readStored(): Promise<QuotaState | undefined> {
  const s = await chrome.storage.local.get(STORAGE_KEY);
  const v = s[STORAGE_KEY] as QuotaState | undefined;
  if (v && typeof v.month === "string" && typeof v.count === "number") return v;
  return undefined;
}

export async function getQuota(): Promise<Quota> {
  return resolveQuota(await readStored(), currentMonthUTC());
}

/** 변환 1회 소비(전송 성공 시에만 호출). 소비 후 잔여 횟수를 반환한다. */
export async function consumeQuota(): Promise<number> {
  const month = currentMonthUTC();
  const q = resolveQuota(await readStored(), month);
  const next: QuotaState = { month, count: q.used + 1 };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return Math.max(0, q.limit - next.count);
}
