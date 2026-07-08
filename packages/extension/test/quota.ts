/**
 * 무료 쿼터 순수 로직 테스트 (chrome API 불필요).
 * 실행: pnpm --filter @html2figma/extension test
 */
import { currentMonthUTC, resolveQuota } from "../src/quota.js";

let failures = 0;
function assert(cond: boolean, name: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

console.log("quota:");

assert(currentMonthUTC(new Date("2026-07-08T12:00:00Z")) === "2026-07", "UTC 월 계산");
assert(
  currentMonthUTC(new Date("2026-12-31T23:59:59Z")) === "2026-12",
  "연말 경계 (UTC)"
);

const fresh = resolveQuota(undefined, "2026-07");
assert(fresh.used === 0 && fresh.remaining === 5 && fresh.limit === 5, "저장값 없음 → 5회");

const mid = resolveQuota({ month: "2026-07", count: 3 }, "2026-07");
assert(mid.used === 3 && mid.remaining === 2, "같은 달 3회 사용 → 잔여 2");

const exhausted = resolveQuota({ month: "2026-07", count: 5 }, "2026-07");
assert(exhausted.remaining === 0, "5회 소진 → 잔여 0");

const over = resolveQuota({ month: "2026-07", count: 9 }, "2026-07");
assert(over.remaining === 0, "초과 저장값이어도 잔여 음수 없음");

const rollover = resolveQuota({ month: "2026-06", count: 5 }, "2026-07");
assert(rollover.used === 0 && rollover.remaining === 5, "월 바뀌면 리셋 (전월 소진 → 새 달 5회)");

const negative = resolveQuota({ month: "2026-07", count: -2 }, "2026-07");
assert(negative.used === 0 && negative.remaining === 5, "음수 저장값 방어");

if (failures > 0) {
  console.error(`\n${failures}개 실패`);
  process.exit(1);
}
console.log("\n모든 테스트 통과");
