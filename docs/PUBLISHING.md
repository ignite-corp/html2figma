# 공개 배포 가이드 (Publishing)

html2figma를 불특정 다수에게 배포하기 위한 절차입니다. 코드/자산은 모두 준비되어 있고,
아래 단계는 **계정·결제·게시 클릭**이 필요하므로 직접 수행해야 합니다.

---

## 1. 크롬 익스텐션 → Chrome Web Store

### 준비 (이미 완료)
- 아이콘 16/48/128 (`packages/extension/icons/`)
- 매니페스트 v3 + 권한 정당화
- 개인정보 처리방침(`docs/PRIVACY.md`)

### 배포 패키지 생성
```bash
pnpm --filter @html2figma/extension package
# → packages/extension/html2figma-extension.zip
```

### 스토어 등록
1. https://chrome.google.com/webstore/devconsole 접속 (개발자 등록 **$5 1회** 결제)
2. **새 항목** → `html2figma-extension.zip` 업로드
3. 스토어 등록정보 작성:
   - 설명, 스크린샷(1280×800 권장), 카테고리(개발자 도구/생산성)
   - **개인정보 처리방침 URL**: `docs/PRIVACY.md`를 공개 URL(예: GitHub raw/Pages)로 게시 후 입력
   - 권한 사유: `debugger`(정확한 스타일/레이아웃 추출), `<all_urls>`(임의 페이지 캡처), `downloads`(.h2f 저장) 등
4. 제출 → 심사(수일 소요). `debugger` 권한은 추가 검토 대상이므로 사유를 명확히 기재.

> 심사 리스크를 낮추려면 개인정보 처리방침에서 "데이터가 기기 밖으로 나가지 않으며 direct-send는 선택"임을 강조.

---

## 2. Figma 플러그인 → Figma Community

1. `pnpm --filter @html2figma/figma-plugin build`
2. Figma 데스크톱 → 플러그인 실행 상태에서 우클릭 → **Publish**
   (또는 Manage plugins → 해당 플러그인 → Publish)
3. 커버 이미지, 이름, 설명, 태그 작성 후 제출 (무료, 심사 있음)
4. `manifest.json`의 `networkAccess.allowedDomains`에 실제 공개 릴레이 도메인이 포함됐는지 확인.

---

## 3. direct-send 공개 릴레이

공개 릴레이는 **두 가지 형태** 중 편한 것을 고르면 됩니다. 둘 다 동일한 룸/페어링 프로토콜입니다.

- **A. Node 서버 (`packages/bridge`)** — Render/Fly/Railway/Koyeb 등 일반 호스팅. **Cloudflare가 막힌 환경 권장.**
- **B. Cloudflare Workers (`packages/relay-cf`)** — 서버리스. 단, wrangler/대시보드가 VPN에 막히면 사용 불가.

`packages/bridge`는 `PORT` 환경변수와 `GET /health` 헬스체크를 지원해 어떤 Node 호스팅에도 올라갑니다.

### A-1. Render (git 연동, CLI 불필요 — 가장 무난)
1. 코드를 GitHub 저장소에 push
2. https://render.com → New → **Blueprint** → 저장소 선택 (루트 `render.yaml` 자동 인식)
3. 무료 플랜으로 생성 → `https://html2figma-relay.onrender.com` 발급
4. 릴레이 주소: `wss://html2figma-relay.onrender.com`
   > 무료 플랜은 유휴 시 슬립 → 첫 연결에 수십 초 콜드스타트가 있을 수 있음(중계 시작되면 정상).

### A-2. Fly.io (항상 켜짐, flyctl 필요)
```bash
# 저장소 루트에서 (packages/bridge/Dockerfile + 루트 fly.toml 사용)
flyctl launch --no-deploy   # 앱 생성
flyctl deploy               # → https://html2figma-relay.fly.dev
```
- 릴레이 주소: `wss://html2figma-relay.fly.dev`
- flyctl도 막히면 Render(A-1)를 쓰세요.

### A-3. Railway / Koyeb 등
- 루트 `packages/bridge/Dockerfile`로 컨테이너 배포하거나,
- 빌드: `pnpm install && pnpm --filter @html2figma/shared build && pnpm --filter @html2figma/bridge build`,
  시작: `node packages/bridge/dist/server.js` (플랫폼이 `PORT` 주입)

### 로컬에서 Docker로 시험
```bash
docker build -f packages/bridge/Dockerfile -t h2f-relay .
docker run -p 8080:8080 h2f-relay   # ws://localhost:8080
```

### B. Cloudflare Workers (대안)
```bash
cd packages/relay-cf
npx wrangler login
npx wrangler deploy          # → https://html2figma-relay.<계정>.workers.dev
```
- 무료 플랜은 Durable Objects가 SQLite 백엔드만 지원 → `wrangler.toml`에 `new_sqlite_classes` 사용(설정 완료).
- 릴레이 주소: `wss://html2figma-relay.<계정>.workers.dev`

### 배포 후 공통
1. 발급된 `wss://…` 주소를 플러그인/익스텐션의 **릴레이 서버 설정**에 입력.
2. 플러그인 `manifest.json`의 `networkAccess.allowedDomains`에 그 도메인이 포함되는지 확인.
   - `*.workers.dev`는 이미 허용. Render/Fly 등은 해당 도메인(`wss://…onrender.com`, `wss://…fly.dev`)을 추가.
3. 원하면 소스의 `DEFAULT_RELAY_URL`(플러그인 `ui.ts`, 익스텐션 `bridge.ts`)을 배포 URL로 바꿔 기본값으로 굳힐 수 있음.

### 릴레이 보안/프라이버시 특성 (A·B 공통)
- 무저장(ephemeral): 페이로드를 디스크에 저장하지 않음.
- 룸 격리: 6자리 페어링 코드로 연결된 당사자끼리만 데이터 교환.
- payload 크기 제한(`RELAY_MAX_PAYLOAD_BYTES`), 전송 rate limit, 유휴 룸 TTL 자동 폐기.
- 전송 구간 TLS(`wss://`).

---

## 버전 올리기
- 익스텐션: `packages/extension/manifest.json`의 `version`
- 플러그인: `packages/figma-plugin/manifest.json`(필요 시)
- 배포 전 `pnpm run build && pnpm run typecheck && pnpm --filter @html2figma/extension test && pnpm --filter @html2figma/bridge test`로 검증.
