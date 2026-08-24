/**
 * 빌드 공통 설정.
 *
 * 결제/계정 서버 관련 값은 여기 두지 않는다 — 사내 빌드도 이 모듈을 import 하므로
 * 번들 소스맵에 원본이 실린다. 그런 값은 billingConfig.ts 에 둘 것.
 */

/**
 * 사내 배포 빌드 여부. build.mjs 가 esbuild define 으로 주입한다
 * (`--internal` 이면 true). 테스트 번들처럼 define 없이 빌드되는 경로에서는
 * typeof 가드로 false 가 된다. true 면 쿼터/결제 게이트가 전부 꺼진다.
 */
declare const __INTERNAL__: boolean | undefined;
export const INTERNAL_BUILD = typeof __INTERNAL__ !== "undefined" && __INTERNAL__ === true;

/** 무료 플랜: 월 변환 횟수 상한 */
export const FREE_MONTHLY_LIMIT = 5;
