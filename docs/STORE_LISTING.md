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
1. Figma에서 html2figma 플러그인을 열고 "연결하기"를 눌러 6자리 코드를 받습니다.
2. 캡처할 웹페이지에서 확장 프로그램 아이콘을 클릭하고 그 코드를 입력합니다.
3. 캡처하기를 누르면 현재 페이지의 DOM·스타일·레이아웃을 정확히 읽어
   Figma 플러그인으로 곧바로 전송되고, 편집 가능한 디자인으로 그려집니다.

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

■ 요금
• 무료: 매달 5회 변환 (가입·로그인 불필요)
• Pro: 월 $9 — 무제한 변환, Google 계정 로그인으로 모든 기기에서 사용, 언제든 해지
• 결제는 Paddle(Merchant of Record)이 안전하게 처리합니다.

■ 개인정보
• 무료 사용자의 개인정보는 수집하지 않으며, 사용 횟수는 브라우저 안에만 기록됩니다.
• Pro 구독 시에만 Google 로그인으로 최소 정보(Google 사용자 ID·이메일)와 구독 상태를 저장합니다.
  Google 로그인은 신원 확인 전용 범위(openid email profile)만 사용합니다.
• 분석/트래킹/광고 식별자를 사용하지 않습니다.
• 캡처 데이터는 릴레이 서버를 "통과"만 하며(저장하지 않고 즉시 중계 후 폐기),
  6자리 페어링 코드로 연결된 당사자끼리만 주고받습니다. 전송 구간은 TLS(wss://)로 보호됩니다.

■ 권한 안내
정확한 스타일/레이아웃 추출을 위해 Chrome DevTools Protocol(chrome.debugger)로
현재 탭의 DOM 스냅샷을 읽습니다. 이때 Chrome이 "이 확장 프로그램이 디버깅하고 있습니다"
배너를 표시하며, 캡처가 끝나면 즉시 해제됩니다. 읽은 데이터는 Figma 플러그인으로
전송하는 용도 외에 다른 곳으로 보내지 않습니다.

필요한 것: 이 확장 프로그램 + Figma용 html2figma 플러그인.
```

영어:
```
html2figma converts any web page into an EDITABLE Figma design — not a flat
screenshot. Pages are rebuilt as real frames, text, images and vector nodes,
so you can tweak colors, copy and layout right inside Figma.

■ How it works
1. Open the html2figma plugin in Figma and click "Connect" to get a 6-digit code.
2. On the page you want to capture, click the extension icon and enter that code.
3. Hit Capture — the page's DOM, styles and layout are read accurately, sent
   straight to the Figma plugin, and rendered as an editable design.

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

■ Pricing
• Free: 5 conversions per month (no sign-up required)
• Pro: $9/month — unlimited conversions, works on all your devices via Google
  sign-in, cancel anytime. Payments are securely handled by Paddle (Merchant of Record).

■ Privacy
• No personal data is collected for free users; usage counts stay in your browser.
• Only when you subscribe to Pro do we store minimal account info (Google user ID,
  email) and subscription status via Google sign-in. The sign-in uses
  identity-only scopes (openid email profile).
• No analytics/tracking/ad IDs.
• Capture data only PASSES THROUGH a relay (never stored; relayed and discarded
  immediately), exchanged only between parties sharing the 6-digit pairing code,
  over TLS (wss://).

■ Permissions
To extract accurate styles/layout it uses the Chrome DevTools Protocol
(chrome.debugger) to read a DOM snapshot of the current tab. Chrome shows a
"being debugged" banner during capture and it is released as soon as capture ends.
The data read is only sent to your Figma plugin and nowhere else.

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

- **tabs**
```
활성 탭 정보(제목·ID)를 확인해 캡처 대상을 결정하고, 업그레이드 시 결제 페이지 탭을 열기 위해 사용합니다.
```
영어:
```
Reads active tab info (title/ID) to determine the capture target, and opens the
checkout page in a new tab on upgrade.
```

- **identity**
```
Pro 구독 구매·확인 시 Google 계정 OAuth 로그인 창(chrome.identity.launchWebAuthFlow)을
열기 위해 필요합니다. 무료 사용에는 로그인이 필요 없으며, 로그인은 사용자가
업그레이드/로그인 버튼을 누를 때만 실행됩니다.
```
영어:
```
Required to open a Google account OAuth sign-in window
(chrome.identity.launchWebAuthFlow) when purchasing or verifying a Pro
subscription. Free usage requires no sign-in; the flow only runs when the user
clicks the upgrade/sign-in button. The sign-in uses identity-only scopes
(openid email profile), and the extension never sees or stores the Google password.
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
데이터 유형 선택 화면에서 다음을 선택합니다 (Pro 로그인 기능 추가로 변경됨):
```
[v] 개인 식별 정보 (Personally identifiable information) — 이메일 주소
    (Pro 구독자의 Google 로그인 시에만, 구독 자격 확인 목적)
[v] 인증 정보 (Authentication information) — 세션 토큰
```
아래 인증에 체크:
```
[v] 판매자의 승인된 사용 사례를 위해서만 데이터를 사용합니다.
[v] 데이터를 제3자에게 판매하지 않습니다.
[v] 신용도 판단·대출 목적의 데이터 사용/전송을 하지 않습니다.
```
> 무료 사용자는 어떤 데이터도 수집되지 않습니다(사용 횟수는 로컬 저장).
> direct-send는 데이터를 "저장 없이 중계"만 하므로 수집·판매에 해당하지 않습니다.
> 심사 코멘트: "로그인은 유료 구독 확인 목적의 선택 기능이며, 무료 기능은 로그인 없이 동작"임을 기재.

### 개인정보 처리방침 URL (Privacy policy URL) — **필수**
공개 Gist로 게시 완료. 대시보드의 개인정보 처리방침 URL 란에 아래 주소를 그대로 입력하세요:
```
https://gist.github.com/zi-gae/2df62695588e3a6b4a70edc084676fc0
```
> 저장소는 Private 이므로 저장소 blob URL은 외부에서 열리지 않는다. 위 Gist는 **공개(public)**라
> 익명 접근이 가능하다(검증 완료). PRIVACY.md 내용을 수정하면 Gist도 갱신해야 한다:
> `gh gist edit 2df62695588e3a6b4a70edc084676fc0 docs/PRIVACY.md`

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
- [ ] PRIVACY.md 유료화 개정본으로 Gist 갱신: `gh gist edit 2df62695588e3a6b4a70edc084676fc0 docs/PRIVACY.md`
  (또는 랜딩 사이트 `https://<site>/privacy.html` URL 로 교체)
- [ ] `identity` 권한 사유 입력 + 데이터 수집 공개(이메일/인증 정보) 갱신
- [ ] `packages/extension/src/config.ts` 의 ACCOUNT_API_URL / FIGMA_CLIENT_ID / UPGRADE_URL 실제값 확인
- [ ] 스크린샷 1장 이상(1280×800) 업로드
- [ ] 권한 사유 전부 입력 (특히 debugger, <all_urls>)
- [ ] 데이터 사용 인증 3개 체크
- [ ] 개발자 등록비 $5 결제(최초 1회)
- [ ] 제출 → 심사 (debugger 권한으로 인해 수일 소요 가능)
