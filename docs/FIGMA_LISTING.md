# Figma Community 등록 정보 (html2figma 플러그인)

Figma 데스크톱 앱 → 플러그인 실행 상태에서 우클릭 → **Publish**(또는 Manage plugins →
해당 플러그인 → Publish)를 누르면 나오는 각 입력란에 아래 내용을 그대로 복사해 넣으면 됩니다.
전체 배포 절차는 `docs/PUBLISHING.md` 2번 항목을 참고하세요.

---

## 1. 기본 정보

### 이름 (Name)
```
html2figma
```

### 한 줄 설명 (Tagline, 목록/검색 결과에 노출)
```
Chrome 익스텐션이 캡처한 웹페이지를 편집 가능한 Figma 디자인으로 임포트
```
영어:
```
Import web pages captured by the html2figma Chrome extension as editable Figma designs
```

### 태그 (Tags, 최대 3~5개)
```
web to design, import, chrome extension, auto layout, html
```

### 카테고리
```
Import / Export, Developer tools
```

### 지원 채널 (Support contact)
```
https://html2figma.pages.dev
```
> 별도 지원 이메일이 준비되면 그 주소로 교체. 개인정보 처리방침은 스토어와 동일하게
> `docs/PRIVACY.md`(공개 Gist)를 사용.

---

## 2. 긴 설명 (Description)

Figma Community 설명란은 마크다운 서식(제목/굵게/링크/이미지)을 지원합니다.

```
html2figma는 **html2figma 크롬 익스텐션**이 캡처한 웹페이지를 이 플러그인으로
불러와 편집 가능한 Figma 디자인으로 그려주는 임포터입니다. 스크린샷이 아니라
실제 프레임·텍스트·이미지·벡터 노드로 재구성되므로 Figma 안에서 색상, 글자,
레이아웃을 바로 수정할 수 있습니다.

**이렇게 동작합니다**
1. Chrome에 html2figma 익스텐션을 설치하고 캡처할 페이지에서 아이콘을 클릭합니다.
2. 이 플러그인을 Figma에서 열고 표시된 6자리 코드를 익스텐션에 입력합니다(direct-send).
   또는 익스텐션에서 받은 .h2f 파일을 드롭하거나 클립보드 내용을 붙여넣어도 됩니다.
3. 페이지가 편집 가능한 Figma 디자인으로 즉시 렌더링됩니다.

**무엇을 재현하나요**
- 레이아웃(정확한 위치·크기), 텍스트(폰트·두께·색·정렬)
- 이미지, 배경색·그라디언트·배경 이미지
- 보더(비대칭 두께 포함), 라운드 코너, 그림자, 투명도, overflow 클리핑
- iframe / shadow DOM 병합 캡처
- 인라인 SVG → 편집 가능한 벡터
- 대용량 페이지는 자동으로 나눠 수신(청크)

**플러그인 옵션**
- Auto Layout 자동 구성
- Local styles(색상/텍스트 스타일) 자동 생성

**전달 방식 3가지**
- direct-send: 6자리 페어링 코드로 익스텐션 → 플러그인 즉시 전송
- .h2f 파일을 플러그인 창에 드롭
- 클립보드 복사 후 플러그인에 붙여넣기

**필요한 것**: [html2figma Chrome 익스텐션](https://html2figma.pages.dev) (별도 설치 필요).
이 플러그인은 익스텐션 없이 단독으로는 웹페이지를 캡처하지 못합니다.

**개인정보**: 캡처 데이터는 페어링 코드로 연결된 당사자끼리만 direct-send 릴레이를
경유하며(저장 없이 즉시 중계 후 폐기), 전송 구간은 TLS(wss://)로 보호됩니다.
자세한 내용은 개인정보 처리방침을 참고하세요.
```

영어:
```
html2figma imports web pages captured by the **html2figma Chrome extension**
into Figma as fully editable designs — not flat screenshots. Pages are
rebuilt as real frames, text, images and vector nodes, so you can tweak
colors, copy and layout right inside Figma.

**How it works**
1. Install the html2figma Chrome extension and click its icon on the page you
   want to capture.
2. Open this plugin in Figma and enter the 6-digit code it shows into the
   extension (direct-send). You can also drop a .h2f file the extension
   produced, or paste it from your clipboard.
3. The page renders instantly as an editable Figma design.

**What it reproduces**
- Layout (exact position & size), text (font, weight, color, alignment)
- Images, background colors / gradients / background images
- Borders (incl. asymmetric widths), rounded corners, shadows, opacity, overflow clip
- Merged capture across iframes / shadow DOM
- Inline SVG → editable vectors
- Large pages are streamed in automatically as chunks

**Plugin options**
- Auto Layout generation
- Local styles (color / text) generation

**Three delivery methods**
- direct-send: instant extension → plugin transfer via a 6-digit pairing code
- Drop a .h2f file into the plugin window
- Copy to clipboard, then paste into the plugin

**Requires**: the [html2figma Chrome extension](https://html2figma.pages.dev)
(installed separately). This plugin cannot capture web pages on its own.

**Privacy**: captured data passes through the direct-send relay only between
parties sharing the pairing code (never stored — relayed and discarded
immediately), over TLS (wss://). See the privacy policy for details.
```

---

## 3. 그래픽 자산

| 자산 | 규격 | 상태 |
|---|---|---|
| 플러그인 아이콘 | 128×128 PNG | 준비됨 — `packages/figma-plugin/icon.png` (manifest.json `icon` 필드에 연결, 크롬 익스텐션과 동일한 `</>` 브랜드 마크) |
| 커버 이미지 | 1920×960 | 준비됨 — `docs/store-assets/figma-cover-1920x960.jpg` |

> 커버 이미지는 실제 플러그인 UI(페어링 코드 화면)를 라이브 캡처해 합성했습니다.
> 재생성: `python3 docs/store-assets/generate-figma-cover.py` (Pillow 필요,
> 소스 스크린샷은 `docs/store-assets/raw-plugin-ui-2.png`). UI가 바뀌면 플러그인을
> 빌드한 뒤 `figma-plugin/figma-plugin/ui.html`을 로컬 서버로 띄워 재캡처하세요.

---

## 4. 제출 전 체크리스트
- [ ] `pnpm --filter @html2figma/figma-plugin build`로 최신 빌드 확인
- [ ] `manifest.json`의 `networkAccess.allowedDomains`에 실제 공개 릴레이 도메인 포함 확인
- [ ] Figma 데스크톱에서 플러그인 실행 → 우클릭 → Publish
- [ ] 이름/태그/설명(한국어) 입력, 커버 이미지 업로드(`figma-cover-1920x960.jpg`)
- [ ] 지원 채널 URL 입력
- [ ] 제출 → 심사 대기 (Figma Community 심사는 보통 크롬 웹스토어보다 짧지만 수일 소요될 수 있음)
