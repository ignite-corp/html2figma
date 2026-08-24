/**
 * 사내 배포 빌드용 플랜 UI 스텁.
 *
 * build.mjs 가 `--internal` 일 때 `./monetization.js` 임포트를 이 모듈로 치환한다.
 * 사내 빌드는 쿼터·결제·로그인 개념이 없으므로 "사내용" 배지만 고정 표시하고,
 * 결제 페이지 URL·OAuth 흐름은 번들에 포함되지 않는다.
 */
import type * as real from "./monetization.js";

export type { PlanUiHost } from "./monetization.js";

interface Host {
  setStatus(text: string, type?: "normal" | "success" | "error"): void;
  setQuotaOk(ok: boolean): void;
}

export function initPlanUi(host: Host): void {
  const planPill = document.getElementById("plan-pill") as HTMLSpanElement;
  planPill.hidden = false;
  planPill.textContent = "사내용";
  planPill.className = "plan-pill pro";
  host.setQuotaOk(true);
}

/** 사내 빌드는 잔여 횟수가 없다. */
export function applyCaptureResult(): void {
  /* 표시할 잔여 횟수 없음 */
}

export function showQuotaExceeded(): void {
  /* 사내 빌드는 쿼터 게이트가 없어 도달하지 않는다 */
}

/**
 * 실제 모듈과 export 시그니처가 어긋나면 typecheck 에서 잡히도록 하는 컴파일 타임 계약.
 * (런타임 코드가 아니며 번들에서 제거된다)
 */
const _contract: typeof real = { initPlanUi, applyCaptureResult, showQuotaExceeded };
void _contract;
