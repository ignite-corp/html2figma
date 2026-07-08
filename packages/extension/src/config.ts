/**
 * 유료화 관련 배포 설정.
 *
 * 배포 전 채워야 하는 값:
 *  - ACCOUNT_API_URL: packages/account-api 를 `wrangler deploy` 한 뒤 발급되는 Worker URL
 *  - FIGMA_CLIENT_ID: developers.figma.com 에서 OAuth 앱 등록 후 발급
 *    (redirect URI 에 `https://<확장ID>.chromiumapp.org/` 등록 필요)
 *  - UPGRADE_URL: packages/site 배포 주소의 결제 페이지
 */
export const ACCOUNT_API_URL = "https://html2figma-account.example.workers.dev";
export const FIGMA_CLIENT_ID = "REPLACE_WITH_FIGMA_CLIENT_ID";
export const UPGRADE_URL = "https://html2figma.pages.dev/upgrade";

/** 무료 플랜: 월 변환 횟수 상한 */
export const FREE_MONTHLY_LIMIT = 5;

/** Pro 상태 확인 실패(서버 장애 등) 시 최근 확인값을 신뢰하는 유예 기간 */
export const PRO_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
