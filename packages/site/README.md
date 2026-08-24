# html2figma 랜딩 사이트

정적 페이지 (빌드 불필요). Cloudflare Pages 등 아무 정적 호스팅에 이 폴더를 그대로 배포한다.

Paddle 판매자 심사 요건이므로 **결제 오픈 전에 반드시 라이브 상태**여야 한다:
약관(terms) / 개인정보(privacy) / 환불(refunds) 페이지 포함.

## 배포 전 교체할 값

| 위치 | 값 |
|---|---|
| 모든 페이지 | `CONTACT_EMAIL_REPLACE_ME` → 실제 문의 이메일 |
| `index.html` | 크롬 웹스토어 / Figma Community 실제 URL |
| `upgrade.html` | `PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_ID` (Paddle 대시보드 발급), 라이브 전환 시 `PADDLE_SANDBOX = false` |

## 배포 (Cloudflare Pages)

```sh
npx wrangler pages deploy packages/site --project-name html2figma
```

배포 URL 이 정해지면 `packages/extension/src/config.ts` 의 `UPGRADE_URL` 도 갱신할 것.
