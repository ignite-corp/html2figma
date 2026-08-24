/**
 * 무료 플랜 월간 쿼터 — 클라이언트 카운팅.
 *
 * 카운터는 chrome.storage.sync에 저장한다. sync 스토리지는 크롬 프로필에 붙어
 * (동기화를 켠 경우 사용자 본인의 크롬 계정 클라우드에) 보관되므로 재설치해도
 * 유지되고, 같은 프로필의 다른 기기와도 공유된다. 동기화가 꺼져 있으면 sync는
 * local처럼 동작하므로 별도 분기가 필요 없다.
 *
 * local에도 함께 기록하고 읽을 때 둘 중 사용량이 큰 쪽을 채택한다 —
 * 구버전(local 전용) 카운터의 마이그레이션 겸, 한쪽 저장소만 초기화하는
 * 방식의 되돌리기 방지. 월(UTC)이 바뀌면 자동 리셋된다.
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

/** sync/local 두 저장값 중 이번 달 사용량이 큰 쪽을 채택한다. */
export function resolveMergedQuota(
  a: QuotaState | undefined,
  b: QuotaState | undefined,
  month: string
): Quota {
  const qa = resolveQuota(a, month);
  const qb = resolveQuota(b, month);
  return qa.used >= qb.used ? qa : qb;
}

function validate(v: unknown): QuotaState | undefined {
  const s = v as QuotaState | undefined;
  if (s && typeof s.month === "string" && typeof s.count === "number") return s;
  return undefined;
}

async function readStored(): Promise<{ sync?: QuotaState; local?: QuotaState }> {
  const [syncRes, localRes] = await Promise.all([
    // sync는 드물게 실패할 수 있다(rate limit 등) — 실패 시 local만 사용
    chrome.storage.sync.get(STORAGE_KEY).catch(() => ({}) as Record<string, unknown>),
    chrome.storage.local.get(STORAGE_KEY),
  ]);
  return { sync: validate(syncRes[STORAGE_KEY]), local: validate(localRes[STORAGE_KEY]) };
}

export async function getQuota(): Promise<Quota> {
  const { sync, local } = await readStored();
  return resolveMergedQuota(sync, local, currentMonthUTC());
}

/** 변환 1회 소비(전송 성공 시에만 호출). 소비 후 잔여 횟수를 반환한다. */
export async function consumeQuota(): Promise<number> {
  const month = currentMonthUTC();
  const { sync, local } = await readStored();
  const q = resolveMergedQuota(sync, local, month);
  const next: QuotaState = { month, count: q.used + 1 };
  await Promise.all([
    chrome.storage.sync.set({ [STORAGE_KEY]: next }).catch(() => {}),
    chrome.storage.local.set({ [STORAGE_KEY]: next }),
  ]);
  return Math.max(0, q.limit - next.count);
}
