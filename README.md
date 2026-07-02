# html2figma

웹페이지를 캡처해 **편집 가능한 Figma 디자인**으로 변환하는 도구.
크롬 익스텐션(캡처) + Figma 플러그인(렌더)의 조합이며, 자체 중간 포맷 `.h2f`(JSON)로 두 단계를 분리한다.

## 구조 (pnpm 모노레포)

```
packages/
  shared/        # .h2f IR 타입 + CSS→Figma 매핑 공용 유틸 + 릴레이 프로토콜/허브
  extension/     # 크롬 MV3: CDP 캡처 → IR 직렬화 → .h2f 다운로드 / 클립보드 / direct-send
  figma-plugin/  # Figma: .h2f 파싱 → 노드 렌더 + local styles 생성 + 페어링 수신
  bridge/        # 로컬 릴레이(자체호스팅/개발): 룸+페어링 코드 WebSocket 중계
  relay-cf/      # 공개 릴레이: Cloudflare Workers + Durable Objects (룸 격리)
```

### 캡처 파이프라인 (extension)
`chrome.debugger`(CDP) 로 `DOMSnapshot.captureSnapshot` 을 호출해 DOM·레이아웃·computed style 을
한 번에 추출 → **전체 문서(iframe/shadow DOM 포함)** 파싱 → 이미지 base64 인라인 →
인라인 SVG 는 `DOM.getOuterHTML` 로 마크업 수집 → `.h2f` IR 빌드.

### 렌더 파이프라인 (figma-plugin)
`.h2f` 를 읽어 Frame/Text/Image/Vector 노드로 재구성. 배경/그라디언트/보더/라운드/그림자/불투명도 매핑,
인라인 SVG 는 `figma.createNodeFromSvg` 로 벡터 렌더, 폰트 로드(실패 시 Inter fallback),
선택적 Auto Layout 및 local styles 생성. 번들(`.h2f` bundle)은 여러 페이지를 가로로 나란히 배치.

## 빌드

```bash
pnpm install
pnpm run build          # 5개 패키지 모두 빌드
pnpm run typecheck      # 타입 검사
pnpm --filter @html2figma/extension test   # 캡처 파이프라인 단위 테스트
pnpm --filter @html2figma/bridge test      # 릴레이 룸/페어링/격리 단위 테스트
```

## 크롬 익스텐션 로드

1. `pnpm run build:extension`
2. Chrome → `chrome://extensions` → 개발자 모드 ON
3. **압축해제된 확장 프로그램을 로드** → `packages/extension/dist` 선택
4. 캡처할 페이지에서 툴바 아이콘 클릭
   - **단일** 탭: 현재 페이지 캡처 (뷰포트/테마 선택)
   - **벌크** 탭: 여러 URL 을 줄바꿈으로 입력 → 백그라운드 탭에서 순차 캡처 → 번들 export
5. `.h2f` 다운로드 / 클립보드 복사 / **Figma 로 전송**(브릿지 실행 시)

> 캡처 중에는 Chrome 이 "이 확장 프로그램이 디버깅하고 있습니다" 배너를 표시한다(CDP 사용).

## Figma 플러그인 로드

1. `pnpm run build:plugin`
2. Figma 데스크톱 → Plugins → Development → **Import plugin from manifest…**
3. `packages/figma-plugin/dist/manifest.json` 선택
4. 플러그인 실행 → `.h2f` 파일 드롭(또는 클립보드 JSON 붙여넣기) → **임포트**
   - 번들(`.h2f` bundle) 파일도 자동 감지해 여러 페이지를 나란히 렌더

## Figma로 direct send (페어링 릴레이)

파일/클립보드 없이 익스텐션 → 플러그인으로 곧바로 보낸다. **룸+페어링 코드**로 격리되어
여러 사용자가 같은 릴레이를 써도 캡처가 섞이지 않는다.

### 로컬(자체 호스팅/개발)
1. `pnpm --filter @html2figma/bridge build` (최초 1회)
2. 릴레이 실행: `pnpm --filter @html2figma/bridge start` → `ws://localhost:8787`
3. Figma 플러그인 UI 에서 **연결 (코드 받기)** → 표시된 **6자리 코드** 확인
4. 익스텐션 팝업에서 **캡처 후 Figma로 바로 전송** 체크 → 코드 입력 → 캡처
5. 플러그인이 자동 렌더

### 공개(불특정 다수) — Cloudflare Workers
- `packages/relay-cf`를 배포하면 로컬 서버 없이도 누구나 페어링으로 사용 가능.
- 배포·설정 절차는 [docs/PUBLISHING.md](docs/PUBLISHING.md) 참고. 플러그인/익스텐션의
  **릴레이 서버 설정**에 배포된 `wss://…` 주소를 입력하면 된다.
- 릴레이는 무저장(ephemeral) · 룸 격리 · payload 크기 제한 · TTL · rate limit 을 적용한다.

> direct-send를 쓰지 않으면 릴레이가 전혀 필요 없다. 파일/클립보드만으로 모든 기능을 쓸 수 있다.

## 공개 배포

- 크롬 익스텐션: `pnpm --filter @html2figma/extension package` → `html2figma-extension.zip`을 Chrome Web Store에 업로드
- Figma 플러그인: Figma 데스크톱에서 Publish → Figma Community
- 상세 절차·개인정보 처리방침: [docs/PUBLISHING.md](docs/PUBLISHING.md), [docs/PRIVACY.md](docs/PRIVACY.md)

## 기능 범위 / 옵션

- 레이아웃(절대좌표), 텍스트, 이미지, 배경색/그라디언트/이미지 배경
- 보더(비대칭 두께 포함), border-radius, box-shadow, opacity, overflow clip
- **iframe / shadow DOM** 병합 캡처, **인라인 SVG → 벡터** 렌더
- **벌크 임포트**(다중 URL → 번들), **direct send**(페어링 릴레이)
- 다중 뷰포트(desktop/tablet/mobile), 다중 테마(light/dark)
- 플러그인 옵션: **Auto Layout 사용**, **Local styles 생성** (기본 on)

## 알려진 한계 / 이후 과제

- `<canvas>` 픽셀 콘텐츠는 미지원(요소 박스만 캡처)
- 그라디언트 각도는 근사 변환
- 폰트 라이선스/미설치 폰트는 Inter 로 대체
- cross-origin iframe 은 CDP 접근 범위에 따라 일부 제한될 수 있음
