/**
 * 결제/계정 서버 설정 — **스토어(결제용) 빌드 전용**.
 *
 * 이 모듈은 account.ts 와 popup/monetization.ts 에서만 import 한다. 둘 다 사내 빌드에서
 * 스텁으로 치환되므로, 여기 값들은 사내 번들과 그 소스맵에 포함되지 않는다.
 * 결제 관련 상수를 config.ts 에 두면 사내 빌드 소스맵에 원본이 실려버린다 —
 * 새로 추가할 결제 설정도 config.ts 가 아니라 이 파일에 둘 것.
 *
 * 배포 전 채워야 하는 값:
 *  - ACCOUNT_API_URL: packages/account-api 를 `wrangler deploy` 한 뒤 발급되는 Worker URL
 *  - GOOGLE_CLIENT_ID: Google Cloud 콘솔에서 OAuth 웹 클라이언트 등록 후 발급
 *    (승인된 리디렉션 URI 에 `https://<확장ID>.chromiumapp.org/` 등록 필요)
 *  - UPGRADE_URL: packages/site 배포 주소의 결제 페이지
 */
export const ACCOUNT_API_URL = "https://html2figma-account.doscmdev.workers.dev";
export const GOOGLE_CLIENT_ID =
  "58872917568-mg7vvbht3ca7rci5slen410q0np29eus.apps.googleusercontent.com";
export const UPGRADE_URL = "https://html2figma.pages.dev/upgrade";

/** Pro 상태 확인 실패(서버 장애 등) 시 최근 확인값을 신뢰하는 유예 기간 */
export const PRO_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
