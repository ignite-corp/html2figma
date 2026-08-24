/**
 * 사내 배포 빌드용 account 스텁.
 *
 * build.mjs 가 `--internal` 일 때 `./account.js` 임포트를 이 모듈로 치환한다.
 * 덕분에 사내 번들에는 Google OAuth 흐름·account-api 엔드포인트·세션 토큰 처리가
 * 아예 들어가지 않는다(스토어 빌드와 코드가 실제로 구분되는 지점).
 */
import type * as real from "./account.js";

export type { AccountState, AccountStatus } from "./account.js";

/** 사내 빌드는 계정 개념이 없다. */
export async function getAccount(): Promise<undefined> {
  return undefined;
}

export async function signOut(): Promise<void> {
  /* 계정이 없으므로 할 일 없음 */
}

export async function signIn(): Promise<never> {
  throw new Error("사내 빌드에는 로그인 기능이 없습니다.");
}

export async function fetchStatus(): Promise<undefined> {
  return undefined;
}

/** 사내 빌드는 항상 무제한. 캡처 게이트는 INTERNAL_BUILD 로 이미 통과하지만 방어적으로 true. */
export async function isPro(): Promise<boolean> {
  return true;
}

/**
 * 실제 모듈과 export 시그니처가 어긋나면 typecheck 에서 잡히도록 하는 컴파일 타임 계약.
 * (런타임 코드가 아니며 번들에서 제거된다)
 */
const _contract: typeof real = { getAccount, signOut, signIn, fetchStatus, isPro };
void _contract;
