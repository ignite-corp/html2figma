# html2figma

웹페이지를 캡처해 **편집 가능한 Figma 디자인**으로 변환하는 도구.
크롬 익스텐션(캡처) + Figma 플러그인(렌더)의 조합이며, 자체 중간 포맷 `.h2f`(JSON)로 두 단계를 분리한다.

## 구조 (pnpm 모노레포)

```
packages/
  shared/        # .h2f IR 타입 + CSS→Figma 매핑 공용 유틸 (색상/뷰포트)
  extension/     # 크롬 MV3: CDP 캡처 → IR 직렬화 → .h2f 다운로드 / 클립보드
  figma-plugin/  # Figma: .h2f 파싱 → 노드 렌더 + local styles 생성
```

### 캡처 파이프라인 (extension)
`chrome.debugger`(CDP) 로 `DOMSnapshot.captureSnapshot` 을 호출해 DOM·레이아웃·computed style 을
한 번에 추출 → 이미지 base64 인라인 → `.h2f` IR 빌드.

### 렌더 파이프라인 (figma-plugin)
`.h2f` 를 읽어 Frame/Text/Image 노드로 재구성. 배경/그라디언트/보더/라운드/그림자/불투명도 매핑,
폰트 로드(실패 시 Inter fallback), 선택적 Auto Layout 및 local styles 생성.

## 빌드

```bash
pnpm install
pnpm run build          # 3개 패키지 모두 빌드
pnpm run typecheck      # 타입 검사
pnpm --filter @html2figma/extension test   # 캡처 파이프라인 단위 테스트
```

## 크롬 익스텐션 로드

1. `pnpm run build:extension`
2. Chrome → `chrome://extensions` → 개발자 모드 ON
3. **압축해제된 확장 프로그램을 로드** → `packages/extension/dist` 선택
4. 캡처할 페이지에서 툴바 아이콘 클릭 → 뷰포트/테마 선택 → **캡처**
5. `.h2f` 다운로드 또는 클립보드 복사

> 캡처 중에는 Chrome 이 "이 확장 프로그램이 디버깅하고 있습니다" 배너를 표시한다(CDP 사용).

## Figma 플러그인 로드

1. `pnpm run build:plugin`
2. Figma 데스크톱 → Plugins → Development → **Import plugin from manifest…**
3. `packages/figma-plugin/dist/manifest.json` 선택
4. 플러그인 실행 → `.h2f` 파일 드롭(또는 클립보드 JSON 붙여넣기) → **임포트**

## 기능 범위 / 옵션

- 레이아웃(절대좌표), 텍스트, 이미지, 배경색/그라디언트/이미지 배경
- 보더(비대칭 두께 포함), border-radius, box-shadow, opacity, overflow clip
- 다중 뷰포트(desktop/tablet/mobile), 다중 테마(light/dark)
- 플러그인 옵션: **Auto Layout 사용**, **Local styles 생성** (기본 on)

## 알려진 한계 / 이후 과제

- iframe / shadow DOM / `<canvas>` / 인라인 SVG 는 아직 미지원
- 그라디언트 각도는 근사 변환
- Figma "direct send" 로컬 브릿지는 미구현 (파일/클립보드로 전달)
- 폰트 라이선스/미설치 폰트는 Inter 로 대체
