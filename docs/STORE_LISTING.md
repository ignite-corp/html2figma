# Chrome Web Store 등록 정보 (html2figma)

Chrome Web Store 개발자 대시보드(https://chrome.google.com/webstore/devconsole)의
각 입력란에 아래 내용을 그대로 복사해 넣으면 됩니다. 한국어(기본) + 영어 두 벌을 준비했습니다.

---

## 1. Product details (스토어 등록정보)

### 항목 이름 (Item name, 최대 45자)
```
html2figma – 웹페이지를 Figma 디자인으로
```
영어:
```
html2figma – Web page to editable Figma
```

### 요약 (Summary, 최대 132자)
```
어떤 웹페이지든 캡처해 편집 가능한 Figma 디자인으로 변환합니다. 레이아웃·텍스트·이미지·SVG를 그대로 재현합니다.
```
영어:
```
Capture any web page and turn it into an editable Figma design — layout, text, images and SVG faithfully reproduced.
```

### 카테고리 (Category)
```
개발자 도구 (Developer Tools)
```
> 대안: 생산성(Productivity). 디자인/개발 도구 성격이므로 Developer Tools 권장.

### 언어 (Language)
```
한국어 (Korean) — 기본
English 추가 권장
```

### 자세한 설명 (Detailed description, 최대 16,000자)
```
html2figma는 웹페이지를 "편집 가능한" Figma 디자인으로 바꿔주는 도구입니다.
스크린샷 이미지가 아니라, 실제 프레임·텍스트·이미지·벡터 노드로 재구성되므로
Figma 안에서 색상, 글자, 레이아웃을 바로 수정할 수 있습니다.

■ 이렇게 동작합니다
1. 캡처할 웹페이지에서 확장 프로그램 아이콘을 클릭합니다.
2. 현재 페이지의 DOM·스타일·레이아웃을 정확히 읽어 .h2f 파일(JSON)로 만듭니다.
3. Figma에서 html2figma 플러그인을 열어 파일을 불러오면(드롭/붙여넣기/바로 전송)
   페이지가 편집 가능한 디자인으로 그려집니다.

■ 무엇을 재현하나요
• 레이아웃(정확한 위치·크기), 텍스트(폰트·두께·색·정렬)
• 이미지, 배경색·그라디언트·배경 이미지
• 보더(비대칭 두께 포함), 라운드 코너, 그림자, 투명도, overflow 클리핑
• iframe / shadow DOM 병합 캡처
• 인라인 SVG → 편집 가능한 벡터
• 대용량 페이지는 자동으로 나눠 전송(청크)

■ Figma 플러그인 옵션
• Auto Layout 자동 구성
• Local styles(색상/텍스트 스타일) 자동 생성

■ 세 가지 전달 방식
• .h2f 파일 다운로드 → Figma 플러그인에 드롭
• 클립보드 복사 → 플러그인에 붙여넣기
• direct-send: 6자리 페어링 코드로 익스텐션 → Figma 플러그인으로 즉시 전송(선택)

■ 개인정보
• 개인정보를 수집·저장·판매하지 않습니다. 분석/트래킹/광고 식별자를 사용하지 않습니다.
• 캡처 데이터는 기본적으로 사용자의 기기 안에서만 처리됩니다.
• direct-send를 켠 경우에만 데이터가 릴레이 서버를 "통과"하며(저장하지 않고 즉시 중계 후 폐기),
  페어링 코드로 연결된 당사자끼리만 주고받습니다. 전송 구간은 TLS(wss://)로 보호됩니다.

■ 권한 안내
정확한 스타일/레이아웃 추출을 위해 Chrome DevTools Protocol(chrome.debugger)로
현재 탭의 DOM 스냅샷을 읽습니다. 이때 Chrome이 "이 확장 프로그램이 디버깅하고 있습니다"
배너를 표시하며, 캡처가 끝나면 즉시 해제됩니다. 읽은 데이터는 외부로 전송되지 않습니다.

필요한 것: 이 확장 프로그램 + Figma용 html2figma 플러그인.
```

영어:
```
html2figma converts any web page into an EDITABLE Figma design — not a flat
screenshot. Pages are rebuilt as real frames, text, images and vector nodes,
so you can tweak colors, copy and layout right inside Figma.

■ How it works
1. Open the page you want to capture and click the extension icon.
2. It reads the page's DOM, styles and layout accurately and builds a .h2f file (JSON).
3. Open the html2figma plugin in Figma and load the file (drop / paste / direct-send)
   to render the page as an editable design.

■ What it reproduces
• Layout (exact position & size), text (font, weight, color, alignment)
• Images, background colors / gradients / background images
• Borders (incl. asymmetric widths), rounded corners, shadows, opacity, overflow clip
• Merged capture across iframes / shadow DOM
• Inline SVG → editable vectors
• Large pages are streamed in chunks automatically

■ Figma plugin options
• Auto Layout generation
• Local styles (color / text) generation

■ Three delivery methods
• Download a .h2f file → drop into the Figma plugin
• Copy to clipboard → paste into the plugin
• direct-send: instant extension → plugin transfer via a 6-digit pairing code (optional)

■ Privacy
• No personal data is collected, stored or sold. No analytics/tracking/ad IDs.
• Capture data is processed on your device by default.
• Only when you enable direct-send does data PASS THROUGH a relay (never stored;
  relayed and discarded immediately), exchanged only between parties sharing the
  pairing code, over TLS (wss://).

■ Permissions
To extract accurate styles/layout it uses the Chrome DevTools Protocol
(chrome.debugger) to read a DOM snapshot of the current tab. Chrome shows a
"being debugged" banner during capture and it is released as soon as capture ends.
The data read is never sent anywhere.

Requires: this extension + the html2figma plugin for Figma.
```

---

## 2. Privacy practices (개인정보 보호 관행 탭)

### 단일 목적 설명 (Single purpose description)
```
html2figma는 사용자가 선택한 웹페이지를 캡처해 편집 가능한 Figma 디자인 파일(.h2f)로
변환하는 단일 목적을 가진 확장 프로그램입니다.
```
영어:
```
html2figma has a single purpose: to capture a web page chosen by the user and
convert it into an editable Figma design file (.h2f).
```

### 권한 사유 (Permission justifications)
각 권한 입력란에 아래 사유를 넣으세요.

- **debugger**
```
Chrome DevTools Protocol(DOMSnapshot)로 현재 탭의 DOM·computed style·레이아웃을
정확히 추출하기 위해 필요합니다. 이 데이터가 있어야 페이지를 Figma에서 편집 가능한
노드로 충실히 재구성할 수 있습니다. 캡처가 끝나면 debugger를 즉시 해제하며,
읽은 데이터를 외부로 전송하지 않습니다.
```
영어:
```
Required to accurately extract the current tab's DOM, computed styles and layout
via the Chrome DevTools Protocol (DOMSnapshot). This data is what lets us rebuild
the page as editable Figma nodes. The debugger is detached immediately after
capture, and the extracted data is not sent anywhere.
```

- **activeTab**
```
사용자가 아이콘을 클릭한 현재 활성 탭에 한해 캡처를 시작하기 위해 필요합니다.
```
영어:
```
Needed to initiate capture on the currently active tab only, when the user
clicks the extension icon.
```

- **scripting**
```
캡처 전 페이지에서 실제 뷰포트 크기·요소 식별·의사요소(::before/::after) 아이콘 등
렌더에 필요한 정보를 읽기 위해 최소한의 스크립트를 실행합니다.
```
영어:
```
Runs minimal scripts in the page before capture to read information needed for
rendering, such as the real viewport size, element identifiers and pseudo-element
(::before/::after) icons.
```

- **storage**
```
페어링 코드와 "캡처 후 전송" on/off 설정을 로컬(chrome.storage.local)에 저장하기
위해 사용합니다. 원격으로 전송되지 않습니다.
```
영어:
```
Stores the pairing code and the "send after capture" on/off preference locally
(chrome.storage.local). Nothing is sent remotely.
```

- **downloads**
```
캡처 결과인 .h2f 파일을 사용자가 직접 저장할 수 있도록 하기 위해 필요합니다.
```
영어:
```
Allows the user to save the resulting .h2f capture file to their computer.
```

- **tabs**
```
활성 탭 정보(제목·ID)를 확인해 캡처 대상과 저장 파일명을 결정하기 위해 사용합니다.
```
영어:
```
Reads active tab info (title/ID) to determine the capture target and the saved
file name.
```

- **host permissions `<all_urls>`**
```
사용자가 어떤 웹페이지에서든 그 페이지를 캡처할 수 있어야 하므로 모든 URL에 대한
접근이 필요합니다. 접근은 사용자가 명시적으로 캡처를 실행할 때만 사용됩니다.
```
영어:
```
Users must be able to capture whichever page they are on, so access to all URLs
is required. Access is only exercised when the user explicitly triggers a capture.
```

### 원격 코드 사용 (Remote code)
```
아니요 (No). 모든 코드는 확장 프로그램 패키지에 포함되어 있으며 원격 코드를
불러오거나 실행하지 않습니다.
```

### 데이터 사용 공개 (Data usage disclosures / 인증 체크박스)
데이터 유형 선택 화면에서 **아무 항목도 선택하지 않습니다**(수집·전송 안 함). 아래 인증에 체크:
```
[v] 판매자의 승인된 사용 사례를 위해서만 데이터를 사용합니다.
[v] 데이터를 제3자에게 판매하지 않습니다.
[v] 신용도 판단·대출 목적의 데이터 사용/전송을 하지 않습니다.
```
> direct-send는 데이터를 "저장 없이 중계"만 하므로 수집·판매에 해당하지 않습니다.
> 심사 코멘트가 필요하면 "direct-send는 사용자가 명시적으로 켤 때만 동작하며 릴레이는 무저장"임을 기재.

### 개인정보 처리방침 URL (Privacy policy URL) — **필수**
`docs/PRIVACY.md`를 공개 URL로 게시한 뒤 그 주소를 입력하세요. 예:
```
https://github.com/ignite-corp/html2figma/blob/main/docs/PRIVACY.md
```
> raw 페이지보다 렌더된 페이지 URL이 심사에 유리. GitHub Pages로 올려도 됩니다.

---

## 3. Graphic assets (그래픽 자산)

| 자산 | 규격 | 상태 |
|---|---|---|
| 스토어 아이콘 | 128×128 PNG | 준비됨 (`packages/extension/icons/icon-128.png`) — 인디고 그라디언트 `</>` 마크 |
| 아이콘 마스터 | 512×512 PNG | 준비됨 (`packages/extension/icons/icon-512.png`) — 프로모 타일 제작용 |
| 스크린샷 | 1280×800 또는 640×400 PNG/JPG, 최소 1장(최대 5장) | 준비됨 (`docs/store-assets/screenshot-1.png`, `screenshot-2.png`, 1280×800) |
| 소형 프로모 타일 | 440×280 PNG | 선택 |
| 마키(Marquee) | 1400×560 PNG | 선택 |

### 스크린샷 캡션 제안 (1280×800 5장)
1. `클릭 한 번으로 현재 웹페이지를 캡처` — 제작됨: `docs/store-assets/screenshot-1.png`
2. `Figma로 바로 전송 / 파일·클립보드로 저장` — 제작됨: `docs/store-assets/screenshot-2.png`
3. `Figma 플러그인이 받아서 바로 렌더` — 제작됨: `docs/store-assets/screenshot-3.png`
4. `Auto Layout + Local styles 자동 생성`
5. `6자리 코드로 Figma에 바로 전송 (선택)`

> 제작 스크립트: `docs/store-assets/generate.py`, `generate-3.py` (Pillow, AppleSDGothicNeo). 팝업 캡처
> 이미지 경로만 바꿔 재생성 가능. 4~5번은 실제 웹페이지↔Figma 결과 비교 화면을 추가하면 전환율에 좋습니다.

---

## 4. 제출 전 체크리스트
- [ ] `pnpm --filter @html2figma/extension package`로 최신 zip 생성
- [ ] `manifest.json` version 확인/증가 (현재 0.0.1)
- [ ] 개인정보 처리방침을 공개 URL로 게시하고 대시보드에 입력
- [ ] 스크린샷 1장 이상(1280×800) 업로드
- [ ] 권한 사유 전부 입력 (특히 debugger, <all_urls>)
- [ ] 데이터 사용 인증 3개 체크
- [ ] 개발자 등록비 $5 결제(최초 1회)
- [ ] 제출 → 심사 (debugger 권한으로 인해 수일 소요 가능)
