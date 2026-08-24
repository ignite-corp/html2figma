/**
 * 사내 배포 빌드용 캡처 게이트 스텁.
 *
 * 사내 빌드는 쿼터·구독 개념이 없으므로 항상 통과시키고 정산도 하지 않는다.
 * 덕분에 쿼터 안내 문구와 Pro 조회 코드가 사내 번들에 포함되지 않는다.
 */
import type * as real from "./captureGate.js";

export type { GateDecision } from "./captureGate.js";

export async function checkCaptureAllowed(): Promise<{ allowed: true; unlimited: true }> {
  return { allowed: true, unlimited: true };
}

export async function settleCapture(): Promise<null> {
  return null;
}

/**
 * 실제 모듈과 export 시그니처가 어긋나면 typecheck 에서 잡히도록 하는 컴파일 타임 계약.
 * (런타임 코드가 아니며 번들에서 제거된다)
 */
const _contract: typeof real = { checkCaptureAllowed, settleCapture };
void _contract;
