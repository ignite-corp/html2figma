/**
 * 캡처 과금 게이트 (스토어 빌드 전용).
 *
 * 무료는 월 5회, Pro 는 무제한. 사내 빌드에서는 build.mjs 가 이 모듈을
 * captureGate.internal.ts 로 치환하므로 쿼터 문구·Pro 조회 코드가 사내 번들에 남지 않는다.
 */
import { isPro } from "./account.js";
import { consumeQuota, getQuota } from "./quota.js";

export interface GateDecision {
  allowed: boolean;
  /** 막혔을 때 팝업에 전달할 오류 */
  error?: { code: "quota-exceeded"; message: string };
  /** 이 캡처가 무제한(Pro) 인지 — settle 단계에서 재사용 */
  unlimited: boolean;
}

/** 캡처 시작 전 검사. 쿼터가 소진됐으면 캡처를 시작하지 않는다. */
export async function checkCaptureAllowed(): Promise<GateDecision> {
  const unlimited = await isPro();
  if (!unlimited && (await getQuota()).remaining <= 0) {
    return {
      allowed: false,
      unlimited,
      error: {
        code: "quota-exceeded",
        message: "이번 달 무료 변환 5회를 모두 사용했어요.",
      },
    };
  }
  return { allowed: true, unlimited };
}

/**
 * 캡처 종료 후 정산. 실제로 Figma 에 전달된 경우에만 무료 횟수를 소비한다.
 * 반환값은 팝업에 전달할 잔여 횟수 (null = 무제한, undefined = 변동 없음).
 */
export async function settleCapture(
  decision: GateDecision,
  bridgeSent: boolean,
): Promise<number | null | undefined> {
  if (decision.unlimited) return null;
  return bridgeSent ? await consumeQuota() : undefined;
}
