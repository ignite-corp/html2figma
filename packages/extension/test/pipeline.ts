import { parseAllDocuments, parseSnapshot, type CaptureSnapshotResult } from "../src/capture/snapshot.js";
import { buildIR } from "../src/capture/builder.js";
import { mapStyle } from "../src/capture/style.js";
import { COMPUTED_STYLES } from "../src/capture/styleProps.js";
import { parseCssColor } from "@html2figma/shared";
import { applyPseudoIcons, type PseudoIcon } from "../src/capture/pseudo.js";
import type { FrameNode, H2FNode } from "@html2figma/shared";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("  ✗ " + msg);
    failures++;
  } else {
    console.log("  ✓ " + msg);
  }
}

const strings: string[] = [""];
const intern = (s: string) => {
  const i = strings.indexOf(s);
  if (i >= 0) return i;
  strings.push(s);
  return strings.length - 1;
};

function styleRow(map: Record<string, string>): number[] {
  return COMPUTED_STYLES.map((name) => intern(map[name] ?? ""));
}

const divStyles = {
  "display": "block",
  "background-color": "rgb(255, 0, 0)",
  "color": "rgb(0, 0, 255)",
  "font-size": "16px",
  "font-family": "Arial, sans-serif",
  "font-weight": "400",
  "border-top-left-radius": "8px",
  "border-top-right-radius": "8px",
  "border-bottom-right-radius": "8px",
  "border-bottom-left-radius": "8px",
};

const snapshot: CaptureSnapshotResult = {
  strings,
  documents: [
    {
      documentURL: intern("https://example.com"),
      title: intern("Test Page"),
      nodes: {
        parentIndex: [-1, 0],
        nodeType: [1, 3],
        nodeName: [intern("DIV"), intern("#text")],
        nodeValue: [intern(""), intern("Hello")],
        backendNodeId: [1, 2],
        attributes: [[], []],
      },
      layout: {
        nodeIndex: [0, 1],
        styles: [styleRow(divStyles), styleRow({})],
        bounds: [
          [0, 0, 200, 100],
          [10, 10, 180, 20],
        ],
        text: [intern(""), intern("Hello")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

console.log("parseCssColor:");
const red = parseCssColor("rgb(255, 0, 0)");
assert(red?.r === 1 && red?.g === 0 && red?.b === 0, "rgb(255,0,0) -> r=1,g=0,b=0");
assert(parseCssColor("#00ff00")?.g === 1, "#00ff00 -> g=1");
assert(parseCssColor("transparent")?.a === 0, "transparent -> a=0");

console.log("parseSnapshot + buildIR:");
const parsed = parseSnapshot(snapshot);
assert(parsed.title === "Test Page", "문서 제목 파싱");
assert(parsed.root?.nodeName === "DIV", "루트 노드는 DIV");

const { root } = buildIR(parseAllDocuments(snapshot));
assert(root?.type === "frame", "루트 IR 노드는 frame");

if (root && root.type === "frame") {
  const frame = root;
  assert(frame.layout.width === 200 && frame.layout.height === 100, "프레임 크기 200x100");
  assert(!!frame.style.fills?.length, "프레임에 배경 fill 존재");
  const fill = frame.style.fills![0];
  assert(fill.type === "solid" && fill.color.r === 1 && fill.color.b === 0, "배경은 빨간색 solid");
  assert(frame.style.cornerRadius?.tl === 8, "corner radius 8px");

  assert(frame.children.length === 1, "자식 1개(텍스트)");
  const text = frame.children[0];
  assert(text.type === "text", "자식은 text 노드");
  if (text.type === "text") {
    assert(text.characters === "Hello", 'characters === "Hello"');
    assert(text.text.fontFamily === "Arial", "fontFamily === Arial");
    assert(text.text.fontSize === 16, "fontSize === 16");
    assert(text.text.color.b === 1 && text.text.color.r === 0, "텍스트 색은 파랑");
    assert(text.layout.x === 10 && text.layout.y === 10, "텍스트 좌표 x=10,y=10");
  }
}

console.log(failures === 0 ? "\n(1차 통과)" : `\n❌ ${failures}개 실패`);

/* ---------------- iframe + SVG 케이스 ---------------- */
console.log("iframe + SVG:");

const s2: string[] = [""];
const intern2 = (s: string) => {
  const i = s2.indexOf(s);
  if (i >= 0) return i;
  s2.push(s);
  return s2.length - 1;
};
const styleRow2 = (map: Record<string, string>) =>
  COMPUTED_STYLES.map((name) => intern2(map[name] ?? ""));

const shown = { display: "block" };

// 메인 문서: BODY > [IFRAME(content doc 1), svg]
const snapshot2: CaptureSnapshotResult = {
  strings: s2,
  documents: [
    {
      documentURL: intern2("https://main.com"),
      title: intern2("Main"),
      nodes: {
        parentIndex: [-1, 0, 0],
        nodeType: [1, 1, 1],
        nodeName: [intern2("BODY"), intern2("IFRAME"), intern2("svg")],
        nodeValue: [intern2(""), intern2(""), intern2("")],
        backendNodeId: [1, 2, 99],
        attributes: [[], [], []],
        contentDocumentIndex: { index: [1], value: [1] },
      },
      layout: {
        nodeIndex: [0, 1, 2],
        styles: [styleRow2(shown), styleRow2(shown), styleRow2(shown)],
        bounds: [
          [0, 0, 800, 600],
          [100, 50, 300, 200],
          [10, 10, 24, 24],
        ],
        text: [intern2(""), intern2(""), intern2("")],
      },
    },
    // iframe 내용 문서: DIV (빨강)
    {
      documentURL: intern2("https://inner.com"),
      title: intern2("Inner"),
      nodes: {
        parentIndex: [-1],
        nodeType: [1],
        nodeName: [intern2("DIV")],
        nodeValue: [intern2("")],
        backendNodeId: [50],
        attributes: [[]],
      },
      layout: {
        nodeIndex: [0],
        styles: [styleRow2({ display: "block", "background-color": "rgb(255,0,0)" })],
        bounds: [[5, 5, 200, 100]],
        text: [intern2("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const built2 = buildIR(parseAllDocuments(snapshot2));
assert(built2.root?.type === "frame", "메인 루트는 frame(BODY)");
assert(built2.svgRequests.length === 1, "SVG 요청 1건 수집");
assert(built2.svgRequests[0]?.backendNodeId === 99, "SVG backendNodeId=99");

const flat: string[] = [];
const walk = (n: import("@html2figma/shared").H2FNode) => {
  flat.push(n.type);
  if (n.type === "frame") n.children.forEach(walk);
};
if (built2.root) walk(built2.root);
assert(flat.includes("vector"), "vector(svg) 노드 존재");

// iframe 내부 DIV가 오프셋되어 절대좌표(100+5, 50+5)에 배치됐는지
let iframeChildFound = false;
const findRed = (n: import("@html2figma/shared").H2FNode) => {
  if (n.type === "frame") {
    const f = n.style.fills?.[0];
    if (f && f.type === "solid" && f.color.r === 1 && n.layout.x === 105 && n.layout.y === 55) {
      iframeChildFound = true;
    }
    n.children.forEach(findRed);
  }
};
if (built2.root) findRed(built2.root);
assert(iframeChildFound, "iframe 내부 DIV가 절대좌표(105,55)로 병합됨");

/* ---------------- paint order(z-index 스태킹) 케이스 ---------------- */
console.log("\npaint order:");

const s3: string[] = [""];
const intern3 = (s: string) => {
  const i = s3.indexOf(s);
  if (i >= 0) return i;
  s3.push(s);
  return s3.length - 1;
};
const styleRow3 = (map: Record<string, string>) =>
  COMPUTED_STYLES.map((name) => intern3(map[name] ?? ""));

// BODY > [P(텍스트, 위에 와야 함), DIV(불투명 배경, DOM상 나중이지만 아래에 깔림)]
// DOM 순서: P 먼저, overlay 나중. 하지만 paintOrder 는 overlay(2) < P(5) 이므로
// overlay 가 아래에 깔려야 한다. sortByOrder 후 children[0]=overlay, 마지막=P.
const snapshot3: CaptureSnapshotResult = {
  strings: s3,
  documents: [
    {
      documentURL: intern3("https://z.com"),
      title: intern3("Z"),
      nodes: {
        parentIndex: [-1, 0, 1, 0],
        nodeType: [1, 1, 3, 1],
        nodeName: [intern3("BODY"), intern3("P"), intern3("#text"), intern3("DIV")],
        nodeValue: [intern3(""), intern3(""), intern3("위에"), intern3("")],
        backendNodeId: [1, 2, 3, 4],
        attributes: [[], [], [], []],
      },
      layout: {
        nodeIndex: [0, 1, 2, 3],
        styles: [
          styleRow3({ display: "block" }),
          styleRow3({ display: "block", color: "rgb(0,0,0)", "font-size": "16px" }),
          styleRow3({}),
          styleRow3({ display: "block", "background-color": "rgb(0,0,0)" }),
        ],
        bounds: [
          [0, 0, 400, 200],
          [20, 40, 200, 30],
          [20, 40, 200, 30],
          [0, 0, 400, 200],
        ],
        text: [intern3(""), intern3(""), intern3("위에"), intern3("")],
        paintOrders: [0, 5, 6, 2],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const built3 = buildIR(parseAllDocuments(snapshot3));
const bodyKids = built3.root?.type === "frame" ? built3.root.children : [];
assert(bodyKids.length === 2, "BODY 자식 2개");
const first = bodyKids[0];
const last = bodyKids[bodyKids.length - 1];
assert(
  first?.type === "frame" && (first.layout.order ?? 0) < (last?.layout.order ?? 0),
  "낮은 paintOrder(불투명 overlay)가 먼저(아래)로 정렬됨"
);
// 마지막(위에 그려지는) 노드는 텍스트를 품은 P 여야 함
const hasText = (n: import("@html2figma/shared").H2FNode): boolean =>
  n.type === "text" ? true : n.type === "frame" ? n.children.some(hasText) : false;
assert(!!last && hasText(last), "텍스트가 맨 위(마지막)로 와서 가려지지 않음");

/* ---------------- 투명 루트 배경 → 흰색 기본값 케이스 ---------------- */
// snapshot3 의 BODY 는 background 가 없다. 브라우저는 흰 캔버스로 보여주므로
// 루트 프레임엔 불투명 흰색 배경이 깔려야 Figma 다크 캔버스가 비치지 않는다.
const rootFills =
  built3.root?.type === "frame" ? built3.root.style.fills ?? [] : [];
const bottomFill = rootFills[0];
assert(
  bottomFill?.type === "solid" &&
    bottomFill.color.r === 1 &&
    bottomFill.color.g === 1 &&
    bottomFill.color.b === 1 &&
    bottomFill.color.a === 1,
  "투명 루트에 흰색 불투명 배경이 기본으로 깔림"
);

// 반대로 루트가 이미 불투명 배경을 가지면(첫 케이스의 빨간 DIV) 흰색을 덮어쓰지 않는다.
const redRootFills =
  root?.type === "frame" ? root.style.fills ?? [] : [];
assert(
  redRootFills.some(
    (f) => f.type === "solid" && f.color.r === 1 && f.color.g === 0 && f.color.b === 0
  ),
  "이미 불투명 배경이 있으면 원래 색을 유지(흰색으로 덮지 않음)"
);

/* ---------------- input placeholder → 텍스트 노드 합성 케이스 ---------------- */
console.log("\ninput placeholder:");
const s4: string[] = [""];
const intern4 = (s: string) => {
  const i = s4.indexOf(s);
  if (i >= 0) return i;
  s4.push(s);
  return s4.length - 1;
};
const styleRow4 = (map: Record<string, string>) =>
  COMPUTED_STYLES.map((name) => intern4(map[name] ?? ""));

const snapshot4: CaptureSnapshotResult = {
  strings: s4,
  documents: [
    {
      documentURL: intern4("https://i.com"),
      title: intern4("I"),
      nodes: {
        parentIndex: [-1, 0],
        nodeType: [1, 1],
        nodeName: [intern4("BODY"), intern4("INPUT")],
        nodeValue: [intern4(""), intern4("")],
        backendNodeId: [1, 2],
        attributes: [[], [intern4("placeholder"), intern4("무엇이 궁금하신가요?")]],
      },
      layout: {
        nodeIndex: [0, 1],
        styles: [
          styleRow4({ display: "block" }),
          styleRow4({ display: "block", color: "rgb(0,0,0)", "font-size": "16px", "padding-left": "20px" }),
        ],
        bounds: [
          [0, 0, 800, 80],
          [0, 20, 700, 48],
        ],
        text: [intern4(""), intern4("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const built4 = buildIR(parseAllDocuments(snapshot4));
const findTextNode = (n: import("@html2figma/shared").H2FNode): import("@html2figma/shared").H2FNode | null => {
  if (n.type === "text") return n;
  if (n.type === "frame") for (const c of n.children) { const r = findTextNode(c); if (r) return r; }
  return null;
};
const phText = built4.root ? findTextNode(built4.root) : null;
assert(
  !!phText && phText.type === "text" && phText.characters === "무엇이 궁금하신가요?",
  "input placeholder 가 텍스트 노드로 합성됨"
);
assert(
  !!phText && phText.type === "text" && phText.layout.x === 20,
  "placeholder 텍스트가 padding-left 만큼 안쪽으로 배치됨"
);

/* ---------------- range slider(input[type=range]) → thumb 합성 케이스 ---------------- */
console.log("\nrange slider thumb:");
const s5: string[] = [""];
const intern5 = (s: string) => {
  const i = s5.indexOf(s);
  if (i >= 0) return i;
  s5.push(s);
  return s5.length - 1;
};
const styleRow5 = (map: Record<string, string>) =>
  COMPUTED_STYLES.map((name) => intern5(map[name] ?? ""));

const snapshot5: CaptureSnapshotResult = {
  strings: s5,
  documents: [
    {
      documentURL: intern5("https://r.com"),
      title: intern5("R"),
      nodes: {
        parentIndex: [-1, 0, 1],
        nodeType: [1, 1, 1],
        nodeName: [intern5("BODY"), intern5("DIV"), intern5("INPUT")],
        nodeValue: [intern5(""), intern5(""), intern5("")],
        backendNodeId: [1, 2, 3],
        attributes: [
          [],
          [],
          [
            intern5("type"), intern5("range"),
            intern5("min"), intern5("18"),
            intern5("max"), intern5("27"),
            intern5("value"), intern5("18"),
          ],
        ],
      },
      layout: {
        nodeIndex: [0, 1, 2],
        styles: [
          styleRow5({ display: "block" }),
          styleRow5({ display: "block", "background-color": "rgb(218,219,220)" }),
          styleRow5({ display: "block" }),
        ],
        bounds: [
          [0, 0, 240, 60],
          [0, 40, 220, 4],
          [0, 31, 220, 22],
        ],
        text: [intern5(""), intern5(""), intern5("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const built5 = buildIR(parseAllDocuments(snapshot5));
const collect5 = (n: import("@html2figma/shared").H2FNode, out: import("@html2figma/shared").H2FNode[]) => {
  out.push(n);
  if (n.type === "frame") for (const c of n.children) collect5(c, out);
};
const all5: import("@html2figma/shared").H2FNode[] = [];
if (built5.root) collect5(built5.root, all5);
assert(
  !all5.some((n) => n.type === "text" && (n.characters === "18" || n.characters === "27")),
  "range input 의 value(18) 가 텍스트로 렌더되지 않음"
);
const thumb = all5.find((n) => n.type === "frame" && n.name === "thumb");
assert(!!thumb, "range input 에 thumb(핸들) 프레임이 합성됨");
assert(
  !!thumb && thumb.type === "frame" && thumb.layout.x === 0 && thumb.layout.width === 18,
  "thumb 가 value=min 위치(트랙 좌측 끝)에 배치됨"
);

/* ---------------- 커스텀 라디오(appearance:none) → 네이티브 링 합성 안 함 ---------------- */
console.log("\ncustom radio (appearance:none):");
const buildRadioSnapshot = (map: Record<string, string>): CaptureSnapshotResult => {
  const ss: string[] = [""];
  const it = (s: string) => {
    const i = ss.indexOf(s);
    if (i >= 0) return i;
    ss.push(s);
    return ss.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((name) => it(m[name] ?? ""));
  return {
    strings: ss,
    documents: [
      {
        documentURL: it("https://x.com"),
        title: it("X"),
        nodes: {
          parentIndex: [-1, 0],
          nodeType: [1, 1],
          nodeName: [it("BODY"), it("INPUT")],
          nodeValue: [it(""), it("")],
          backendNodeId: [1, 2],
          attributes: [[], [it("type"), it("radio"), it("checked"), it("")]],
        },
        layout: {
          nodeIndex: [0, 1],
          styles: [row({ display: "block" }), row(map)],
          bounds: [
            [0, 0, 240, 60],
            [10, 10, 24, 24],
          ],
          text: [it(""), it("")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
};
const collectAll = (n: import("@html2figma/shared").H2FNode, out: import("@html2figma/shared").H2FNode[]) => {
  out.push(n);
  if (n.type === "frame") for (const c of n.children) collectAll(c, out);
};

const customRadio = buildIR(
  parseAllDocuments(
    buildRadioSnapshot({ display: "block", appearance: "none", color: "rgb(5,20,31)" })
  )
);
const customNodes: import("@html2figma/shared").H2FNode[] = [];
if (customRadio.root) collectAll(customRadio.root, customNodes);
assert(
  !customNodes.some((n) => n.type === "frame" && n.name === "radio"),
  "appearance:none 커스텀 라디오는 네이티브 'radio' 링 프레임을 합성하지 않음(검은 테두리 방지)"
);

const nativeRadio = buildIR(
  parseAllDocuments(buildRadioSnapshot({ display: "block", color: "rgb(5,20,31)" }))
);
const nativeNodes: import("@html2figma/shared").H2FNode[] = [];
if (nativeRadio.root) collectAll(nativeRadio.root, nativeNodes);
assert(
  nativeNodes.some((n) => n.type === "frame" && n.name === "radio"),
  "appearance 미지정 네이티브 라디오는 기존대로 'radio' 프레임을 합성함"
);

/* ---------------- device px → CSS px 배율 정규화 케이스 ---------------- */
console.log("\nscale 정규화:");
const scaled = parseAllDocuments(snapshot4, 2); // DPR 2 가정
const bodyNode = scaled.documents[0].root;
assert(
  !!bodyNode?.layout && bodyNode.layout.bounds[2] === 400,
  "scale=2 일 때 bounds(800)가 CSS px(400)로 정규화됨"
);
const noScale = parseAllDocuments(snapshot4);
assert(
  noScale.documents[0].root?.layout?.bounds[2] === 800,
  "scale 기본값 1 이면 bounds 그대로(800)"
);

/* ---------------- overflow → clipsContent 매핑 케이스 ---------------- */
console.log("\nclipsContent 매핑:");
assert(
  mapStyle({ overflow: "visible" }).clipsContent === false,
  "overflow:visible → clipsContent=false (넘치는 자식 안 자름)"
);
assert(
  mapStyle({}).clipsContent === false,
  "overflow 미지정(기본 visible) → clipsContent=false"
);
assert(
  mapStyle({ overflow: "hidden" }).clipsContent === true,
  "overflow:hidden → clipsContent=true"
);
assert(
  mapStyle({ "overflow-x": "auto" }).clipsContent === true,
  "overflow-x:auto → clipsContent=true"
);

/* ---------------- SVG img → 벡터 + 루트 오버플로 확장/흰배경 케이스 ---------------- */
console.log("\nSVG 이미지 + 루트 오버플로:");
const blk = { display: "block" };
const wideBlk = { display: "block", "background-color": "rgb(200, 200, 200)" };
const ovSnap: CaptureSnapshotResult = {
  strings,
  documents: [
    {
      documentURL: intern("https://example.com"),
      title: intern("ov"),
      nodes: {
        parentIndex: [-1, 0, 0],
        nodeType: [1, 1, 1],
        nodeName: [intern("DIV"), intern("IMG"), intern("DIV")],
        nodeValue: [intern(""), intern(""), intern("")],
        backendNodeId: [1, 2, 3],
        attributes: [[], [intern("src"), intern("https://x/logo.svg")], []],
      },
      layout: {
        nodeIndex: [0, 1, 2],
        styles: [styleRow(blk), styleRow(blk), styleRow(wideBlk)],
        // 루트 100x100 인데 자식 DIV 가 x+width=300 으로 오른쪽으로 오버플로
        bounds: [
          [0, 0, 100, 100],
          [0, 0, 50, 20],
          [0, 0, 300, 50],
        ],
        text: [intern(""), intern(""), intern("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const ov = buildIR(parseAllDocuments(ovSnap));
const ovRoot = ov.root as import("@html2figma/shared").FrameNode | null;
const svgVec = ovRoot?.children.find((c) => c.type === "vector");
assert(
  !!svgVec && svgVec.type === "vector" && svgVec.assetId.startsWith("svgimg:"),
  "SVG <img> 는 벡터 노드로 변환됨"
);
assert(
  ov.svgUrlRequests.some((r) => r.url === "https://x/logo.svg"),
  "SVG <img> url 이 svgUrlRequests 에 등록됨"
);
const rootFill = ovRoot?.style.fills?.[0];
assert(
  !!rootFill && rootFill.type === "solid" && rootFill.color.a >= 1,
  "루트에 불투명(흰색) 배경이 깔림"
);

/* ---------------- overflow:hidden + height:0 로 접힌 콘텐츠 클립 케이스 ---------------- */
console.log("\n오버플로 클립(접힌 드롭다운):");
function clipSnap(subMenuOverflow: string): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("clip"),
        nodes: {
          parentIndex: [-1, 0, 1],
          nodeType: [1, 1, 1],
          nodeName: [it("DIV"), it("DIV"), it("DIV")],
          nodeValue: [it(""), it(""), it("")],
          backendNodeId: [1, 2, 3],
          attributes: [[], [], []],
        },
        layout: {
          nodeIndex: [0, 1, 2],
          styles: [
            row({ display: "block", "background-color": "rgb(255, 255, 255)" }),
            row({ display: "block", overflow: subMenuOverflow }),
            row({ display: "block", "background-color": "rgb(18, 20, 22)" }),
          ],
          // 루트 300x200, sub-menu 300x0(접힘), inner 300x150(내용)
          bounds: [
            [0, 0, 300, 200],
            [0, 0, 300, 0],
            [0, 0, 300, 150],
          ],
          text: [it(""), it(""), it("")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}

const countNodes = (n: import("@html2figma/shared").H2FNode | null): number => {
  if (!n) return 0;
  let c = 1;
  const kids = (n as { children?: import("@html2figma/shared").H2FNode[] }).children;
  if (Array.isArray(kids)) for (const ch of kids) c += countNodes(ch);
  return c;
};

const clipped = buildIR(parseAllDocuments(clipSnap("hidden")));
assert(
  countNodes(clipped.root) === 1,
  "height:0; overflow:hidden 의 자식(내용)이 클립되어 제거됨(루트 프레임만 남음)"
);
const notClipped = buildIR(parseAllDocuments(clipSnap("visible")));
assert(
  countNodes(notClipped.root) >= 2,
  "overflow:visible 면 접힌 컨테이너의 내용이 유지됨(회귀 방지)"
);

/* ---------------- 의사요소 아이콘을 호스트 프레임에 매핑 ---------------- */
console.log("\n의사요소 호스트 매핑:");
function hostSnap(): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("host"),
        nodes: {
          parentIndex: [-1, 0],
          nodeType: [1, 1],
          nodeName: [it("DIV"), it("BUTTON")],
          nodeValue: [it(""), it("")],
          backendNodeId: [1, 2],
          // 두 번째 노드(button)에 data-h2f-el="7" 부여
          attributes: [[], [it("data-h2f-el"), it("7")]],
        },
        layout: {
          nodeIndex: [0, 1],
          styles: [
            row({ display: "block", "background-color": "rgb(255,255,255)" }),
            row({ display: "block", "background-color": "rgb(0,0,0)" }),
          ],
          bounds: [
            [0, 0, 300, 200],
            [10, 10, 100, 40],
          ],
          text: [it(""), it("")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}
const hostIR = buildIR(parseAllDocuments(hostSnap()));
const hostFrame = hostIR.hostFrames.get("7");
assert(!!hostFrame && hostFrame.type === "frame", "data-h2f-el 요소가 hostFrames 에 등록됨");
assert(
  !!hostFrame && hostFrame.layout.width === 100 && hostFrame.layout.height === 40,
  "hostFrames 가 올바른(호스트) 프레임을 가리킴"
);

/* ---------------- 여러 줄 텍스트 줄바꿈 폭(세로로 깨짐 방지) ---------------- */
console.log("\n텍스트 줄바꿈 폭:");
function textWrapSnap(): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("wrap"),
        nodes: {
          parentIndex: [-1, 0, 1],
          nodeType: [1, 1, 3],
          nodeName: [it("DIV"), it("H2"), it("#text")],
          nodeValue: [it(""), it(""), it("긴 제목 텍스트 여러 줄")],
          backendNodeId: [1, 2, 3],
          attributes: [[], [], []],
        },
        layout: {
          nodeIndex: [0, 1, 2],
          styles: [row({ display: "block" }), row({ display: "block" }), row({})],
          bounds: [
            [0, 0, 300, 200],
            [0, 0, 288, 84], // h2 박스: 288 폭, 3줄(84 높이)
            [0, 2, 48, 364], // 텍스트 조각 bounds: 첫 줄 조각처럼 좁게(48) 잡힘
          ],
          text: [it(""), it(""), it("긴 제목 텍스트 여러 줄")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}
const wrapIR = buildIR(parseAllDocuments(textWrapSnap()));
function findTextDeep(n: import("@html2figma/shared").H2FNode | null): import("@html2figma/shared").H2FNode | null {
  if (!n) return null;
  if (n.type === "text") return n;
  const kids = (n as { children?: import("@html2figma/shared").H2FNode[] }).children;
  if (Array.isArray(kids)) for (const c of kids) {
    const f = findTextDeep(c);
    if (f) return f;
  }
  return null;
}
const wrapText = findTextDeep(wrapIR.root);
assert(
  !!wrapText && wrapText.type === "text" && wrapText.layout.width === 288,
  "여러 줄 텍스트 폭이 부모 h2 콘텐츠 폭(288)으로 확장됨(조각 폭 48 아님)"
);

/* ---------------- 인라인 요소 뒤 텍스트가 겹치지 않음 ---------------- */
console.log("\n인라인 요소 사이 텍스트 조각:");
function inlineSplitSnap(): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  // <h3>200가지 테스트를 통과한 <br><strong>제조사 무사고 인증차량</strong>입니다</h3>
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("split"),
        nodes: {
          parentIndex: [-1, 0, 1, 1, 1, 4, 1],
          nodeType: [1, 1, 3, 1, 1, 3, 3],
          nodeName: [it("DIV"), it("H3"), it("#text"), it("BR"), it("STRONG"), it("#text"), it("#text")],
          nodeValue: [it(""), it(""), it("200가지 테스트를 통과한 "), it(""), it(""), it("제조사 무사고 인증차량"), it("입니다")],
          backendNodeId: [1, 2, 3, 4, 5, 6, 7],
          attributes: [[], [], [], [], [], [], []],
        },
        layout: {
          nodeIndex: [0, 1, 2, 4, 5, 6],
          styles: [row({ display: "block" }), row({ display: "block" }), row({}), row({ display: "inline", "font-weight": "700" }), row({}), row({})],
          bounds: [
            [0, 0, 700, 150],
            [0, 0, 700, 147],
            [0, 82, 300, 34], // "200가지..." 첫 줄
            [0, 116, 228, 28], // <strong> 둘째 줄 시작
            [0, 116, 237, 34], // strong 내부 텍스트
            [228, 116, 60, 34], // "입니다" strong 뒤
          ],
          text: [it(""), it(""), it("200가지 테스트를 통과한 "), it(""), it(""), it("입니다")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}
const splitIR = buildIR(parseAllDocuments(inlineSplitSnap()));
function collectTexts(n: import("@html2figma/shared").H2FNode | null, acc: import("@html2figma/shared").H2FNode[] = []) {
  if (!n) return acc;
  if (n.type === "text") acc.push(n);
  const kids = (n as { children?: import("@html2figma/shared").H2FNode[] }).children;
  if (Array.isArray(kids)) for (const c of kids) collectTexts(c, acc);
  return acc;
}
const splitTexts = collectTexts(splitIR.root);
const merged = splitTexts.find(
  (t) => (t as { characters?: string }).characters?.includes("200가지") && (t as { characters?: string }).characters?.includes("입니다")
);
assert(!!merged, "인라인 요소가 섞인 텍스트가 하나의 노드로 병합됨(조각 분리 아님)");
{
  const segs = (merged as { segments?: { start: number; end: number; fontWeight?: number }[] }).segments;
  const chars = (merged as { characters?: string }).characters ?? "";
  const bold = segs?.find((sg) => (sg.fontWeight ?? 400) >= 700);
  assert(!!bold, "굵은 <strong> 구간이 bold segment 로 표시됨");
  assert(
    !!bold && chars.slice(bold.start, bold.end) === "제조사 무사고 인증차량",
    "bold segment 범위가 <strong> 내부 텍스트를 정확히 덮음"
  );
}

/* -------- 인라인 <b> 앞뒤 공백 보존 (버튼 "…완료) 166 건" 붙음 방지) -------- */
function inlineSpaceSnap(): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  // <div>전시준비중(탁송 완료) <b>166</b> 건</div>
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("space"),
        nodes: {
          parentIndex: [-1, 0, 0, 2, 0],
          nodeType: [1, 3, 1, 3, 3],
          nodeName: [it("DIV"), it("#text"), it("B"), it("#text"), it("#text")],
          nodeValue: [it(""), it("전시준비중(탁송 완료) "), it(""), it("166"), it(" 건")],
          backendNodeId: [1, 2, 3, 4, 5],
          attributes: [[], [], [], [], []],
        },
        layout: {
          nodeIndex: [0, 1, 2, 3, 4],
          styles: [row({ display: "block" }), row({}), row({ display: "inline", "font-weight": "700" }), row({}), row({})],
          bounds: [
            [0, 0, 200, 40],
            [10, 10, 118, 20], // "전시준비중(탁송 완료) " (끝 공백 포함)
            [128, 10, 24, 20], // <b> 166
            [128, 10, 24, 20], // 166 텍스트
            [152, 10, 20, 20], // " 건" (앞 공백 포함) — 박스는 <b> 오른쪽 끝(152)에서 시작
          ],
          text: [it(""), it("전시준비중(탁송 완료) "), it(""), it("166"), it(" 건")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}
const spaceTexts = collectTexts(buildIR(parseAllDocuments(inlineSpaceSnap())).root);
const spaceMerged = spaceTexts.find((t) => (t as { characters?: string }).characters?.includes("전시준비중"));
assert(
  (spaceMerged as { characters?: string })?.characters === "전시준비중(탁송 완료) 166 건",
  "인라인 <b> 가 섞인 버튼 텍스트가 공백 보존된 하나의 노드로 병합됨(완료)166 붙음 방지)"
);
{
  const chars = (spaceMerged as { characters?: string }).characters ?? "";
  const segs = (spaceMerged as { segments?: { start: number; end: number; fontWeight?: number }[] }).segments;
  const bold = segs?.find((sg) => (sg.fontWeight ?? 400) >= 700);
  assert(!!bold, "<b>166</b> 이 bold segment 로 표시됨");
  assert(!!bold && chars.slice(bold.start, bold.end) === "166", "bold segment 범위가 '166' 을 정확히 덮음");
}

/* ---------------- 상대 이미지 URL → 절대 URL 해석 케이스 ---------------- */
console.log("\n상대 이미지 URL 해석:");
const relSnap: CaptureSnapshotResult = {
  strings,
  documents: [
    {
      documentURL: intern("https://cpo.kia.com/products/detail/?id=1"),
      title: intern("rel"),
      nodes: {
        parentIndex: [-1, 0, 0],
        nodeType: [1, 1, 1],
        nodeName: [intern("DIV"), intern("IMG"), intern("IMG")],
        nodeValue: [intern(""), intern(""), intern("")],
        backendNodeId: [1, 2, 3],
        // lazy 이미지: currentSourceURL 없이 상대 src 만 존재
        attributes: [
          [],
          [intern("src"), intern("/assets/images/svg/icon.svg")],
          [intern("src"), intern("/assets/images/photo.png")],
        ],
      },
      layout: {
        nodeIndex: [0, 1, 2],
        styles: [
          styleRow({ display: "block" }),
          styleRow({ display: "block" }),
          styleRow({ display: "block" }),
        ],
        bounds: [
          [0, 0, 100, 100],
          [0, 0, 50, 50],
          [0, 60, 50, 30],
        ],
        text: [intern(""), intern(""), intern("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const relIR = buildIR(parseAllDocuments(relSnap));
assert(
  relIR.svgUrlRequests.some((r) => r.url === "https://cpo.kia.com/assets/images/svg/icon.svg"),
  "상대 경로 SVG <img> src 가 페이지 기준 절대 URL 로 해석됨"
);
assert(
  relIR.imageUrls.has("https://cpo.kia.com/assets/images/photo.png"),
  "상대 경로 래스터 <img> src 가 페이지 기준 절대 URL 로 해석됨"
);

/* ---------------- 0×0 인라인 래퍼로 감싼 절대배치 이미지 클립 케이스 ---------------- */
// overflow:hidden 카드(DIV) 안에서 <a> 가 position:absolute 이미지만 감싸 0×0 로 접히면,
// 접힌 <a> 박스가 클립 좌상단 모서리에 걸려(box.right<=clip.left) 서브트리가 통째로
// 잘려나가 이미지가 사라지는 회귀(기아 CPO 추천차량 카드). 이미지는 살아남아야 한다.
console.log("\n0×0 인라인 래퍼 안 절대배치 이미지:");
const absImgSnap: CaptureSnapshotResult = {
  strings,
  documents: [
    {
      documentURL: intern("https://cpo.kia.com/"),
      title: intern("abs"),
      nodes: {
        parentIndex: [-1, 0, 1],
        nodeType: [1, 1, 1],
        nodeName: [intern("DIV"), intern("A"), intern("IMG")],
        nodeValue: [intern(""), intern(""), intern("")],
        backendNodeId: [1, 2, 3],
        attributes: [
          [],
          [],
          [intern("src"), intern("https://cpo-cdn.kia.com/public/model/CAR.png")],
        ],
      },
      layout: {
        nodeIndex: [0, 1, 2],
        styles: [
          styleRow({ display: "block", overflow: "hidden", "overflow-x": "hidden", "overflow-y": "hidden" }),
          styleRow({ display: "inline" }),
          styleRow({ display: "block", position: "absolute" }),
        ],
        bounds: [
          [0, 0, 364, 230], // 클립 카드
          [0, 0, 0, 0], // 접힌 인라인 <a> (좌상단 0×0)
          [0, 12, 364, 205], // 절대배치 이미지 (카드 안)
        ],
        text: [intern(""), intern(""), intern("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const absImgIR = buildIR(parseAllDocuments(absImgSnap));
assert(
  absImgIR.imageUrls.has("https://cpo-cdn.kia.com/public/model/CAR.png"),
  "0×0 인라인 <a> 로 감싼 절대배치 이미지가 오버플로 클립 안에서 유지됨"
);

/* ---------------- 인접 텍스트 노드 병합 (조각 겹침 방지) ---------------- */
// <strong>{"20,000"}{"km / "}{"1년"}</strong> 처럼 사이에 요소가 없는 연속 텍스트 노드는
// 하나로 병합돼야 한다(각 조각을 개별 노드로 두면 Figma 폰트 대체 시 폭이 달라 겹침).
console.log("\n인접 텍스트 노드 병합:");
function adjTextSnap(): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("adj"),
        nodes: {
          parentIndex: [-1, 0, 0, 0],
          nodeType: [1, 3, 3, 3],
          nodeName: [it("STRONG"), it("#text"), it("#text"), it("#text")],
          nodeValue: [it(""), it("20,000"), it("km / "), it("1년")],
          backendNodeId: [1, 2, 3, 4],
          attributes: [[], [], [], []],
        },
        layout: {
          nodeIndex: [0, 1, 2, 3],
          styles: [row({ display: "block" }), row({}), row({}), row({})],
          bounds: [
            [0, 0, 116, 19],
            [0, 0, 56, 19],
            [56, 0, 38, 19],
            [94, 0, 22, 19],
          ],
          text: [it(""), it("20,000"), it("km / "), it("1년")],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}
const adjTexts = collectTexts(buildIR(parseAllDocuments(adjTextSnap())).root);
assert(adjTexts.length === 1, "연속 텍스트 노드 3개가 1개로 병합됨");
assert(
  (adjTexts[0] as { characters?: string }).characters === "20,000km / 1년",
  "병합 텍스트가 '20,000km / 1년' (조각 사이 공백 보존)"
);

/* ---------------- transform 으로 이동된 트랙(swiper) 밖 박스의 클립 케이스 ---------------- */
// swiper 캐러셀: .swiper(overflow:hidden 클립창)=x355..635, 그 안의 .swiper-wrapper 는
// translateX(-280) 때문에 bounds 가 x75..355(클립 왼쪽 밖)로 잡힌다. wrapper 는 자식을
// 자기 박스에 가두지 않으므로(overflow:visible), wrapper 박스가 클립 밖이라고 서브트리를
// 통째로 버리면 실제로 보이는 활성 슬라이드 이미지까지 사라진다(기아 CPO 광고 배너).
// → 숨은 슬라이드(x75) 이미지는 제거, 활성 슬라이드(x355) 이미지는 유지돼야 한다.
console.log("\ntransform 이동 트랙(swiper) 밖 박스 클립:");
const swiperSnap: CaptureSnapshotResult = {
  strings,
  documents: [
    {
      documentURL: intern("https://cpo.kia.com/"),
      title: intern("swiper"),
      nodes: {
        parentIndex: [-1, 0, 1, 2, 1, 4],
        nodeType: [1, 1, 1, 1, 1, 1],
        nodeName: [
          intern("DIV"), // 0 swiper (clip)
          intern("DIV"), // 1 swiper-wrapper (translated track)
          intern("DIV"), // 2 slide-next (off-screen left)
          intern("IMG"), // 3 img-next (dropped)
          intern("DIV"), // 4 slide-active (visible)
          intern("IMG"), // 5 img-active (kept)
        ],
        nodeValue: [intern(""), intern(""), intern(""), intern(""), intern(""), intern("")],
        backendNodeId: [1, 2, 3, 4, 5, 6],
        attributes: [
          [],
          [],
          [],
          [intern("src"), intern("https://cpo-cdn.kia.com/public/banner/HIDDEN.png")],
          [],
          [intern("src"), intern("https://cpo-cdn.kia.com/public/banner/ACTIVE.png")],
        ],
      },
      layout: {
        nodeIndex: [0, 1, 2, 3, 4, 5],
        styles: [
          styleRow({ display: "block", overflow: "hidden", "overflow-x": "hidden", "overflow-y": "hidden" }),
          styleRow({ display: "flex" }), // wrapper: overflow visible
          styleRow({ display: "block" }),
          styleRow({ display: "block", position: "absolute" }),
          styleRow({ display: "block" }),
          styleRow({ display: "block", position: "absolute" }),
        ],
        bounds: [
          [355, 760, 280, 343], // swiper 클립창
          [75, 760, 280, 343], // wrapper (translateX -280) → 클립 왼쪽 밖
          [75, 760, 280, 343], // slide-next (off-screen)
          [75, 723, 280, 415], // img-next → 제거 대상
          [355, 760, 280, 343], // slide-active (visible)
          [355, 723, 280, 415], // img-active → 유지 대상
        ],
        text: [intern(""), intern(""), intern(""), intern(""), intern(""), intern("")],
      },
    },
  ],
} as unknown as CaptureSnapshotResult;

const swiperIR = buildIR(parseAllDocuments(swiperSnap));
assert(
  swiperIR.imageUrls.has("https://cpo-cdn.kia.com/public/banner/ACTIVE.png"),
  "translateX 로 이동된 트랙 밖이어도 클립 안 활성 슬라이드 이미지는 유지됨"
);
assert(
  !swiperIR.imageUrls.has("https://cpo-cdn.kia.com/public/banner/HIDDEN.png"),
  "클립 밖 숨은 슬라이드 이미지는 제거됨"
);

/* ---------------- ::before content:"" border 오버레이 → border 프레임 합성 ---------------- */
console.log("\npseudo border overlay:");
const pseudoRoot: FrameNode = {
  id: "root", name: "root", type: "frame",
  layout: { x: 0, y: 0, width: 200, height: 100 },
  style: {}, children: [],
};
const btnFrame: FrameNode = {
  id: "btn", name: "button", type: "frame",
  layout: { x: 4, y: 4, width: 52, height: 37 },
  style: { fills: [{ type: "solid", color: { r: 1, g: 1, b: 1, a: 1 } }] }, children: [],
};
pseudoRoot.children.push(btnFrame);
const borderIcon: PseudoIcon = {
  x: 4, y: 4, w: 52, h: 37, svg: false, hostId: "btn",
  borderColor: "rgb(230, 231, 233)", borderWidth: 1, radius: 4,
};
const hostFrames = new Map<string, FrameNode>([["btn", btnFrame]]);
await applyPseudoIcons([borderIcon], pseudoRoot, new Set<string>(), {}, hostFrames);
const borderFrame = btnFrame.children.find((c: H2FNode) => c.type === "frame" && c.name === "border");
assert(!!borderFrame, "border-only ::before 가 border 프레임으로 합성됨");
assert(
  !!borderFrame && borderFrame.type === "frame" &&
    !!borderFrame.style.strokes && borderFrame.style.strokes[0].weight === 1,
  "border 프레임에 stroke(weight 1) 가 적용됨"
);
assert(
  !!borderFrame && borderFrame.type === "frame" &&
    !!borderFrame.style.cornerRadius && borderFrame.style.cornerRadius.tl === 4,
  "border 프레임에 cornerRadius(4) 가 적용됨"
);

/* ---------------- line-height:0 래퍼(높이 0) 안의 텍스트 ---------------- */
// 실제 사례(DEALERS_BO Domain Setting 표): td(높이 40) > div.cell_text(line-height:0 → 높이 0)
// > 텍스트. 래퍼 박스가 0 이면 layoutOf 가 null 이라 프레임을 못 만드는데, 그때 자식으로
// 재귀하면 텍스트 노드(nodeType 3)가 버려져 셀 값이 통째로 사라졌다(행까지 프루닝됨).
// 텍스트 조각은 자기 bounds(높이 17)를 갖고 있으므로 그것으로 복원돼야 한다.
console.log("\nline-height:0 래퍼 안 텍스트:");
function zeroHeightWrapSnap(): CaptureSnapshotResult {
  const s: string[] = [""];
  const it = (v: string) => {
    const i = s.indexOf(v);
    if (i >= 0) return i;
    s.push(v);
    return s.length - 1;
  };
  const row = (m: Record<string, string>) => COMPUTED_STYLES.map((n) => it(m[n] ?? ""));
  const VALUE = "http://www.hyundaiusa.com";
  return {
    strings: s,
    documents: [
      {
        documentURL: it("https://example.com"),
        title: it("zero-height wrapper"),
        nodes: {
          parentIndex: [-1, 0, 1],
          nodeType: [1, 1, 3],
          nodeName: [it("TD"), it("DIV"), it("#text")],
          nodeValue: [it(""), it(""), it(VALUE)],
          backendNodeId: [1, 2, 3],
          attributes: [[], [], []],
        },
        layout: {
          nodeIndex: [0, 1, 2],
          styles: [
            row({ "display": "table-cell", "line-height": "0px", "font-size": "14px" }),
            row({ "display": "block", "line-height": "0px", "font-size": "14px" }),
            row({}),
          ],
          bounds: [
            [438, 292, 392, 40],
            [454, 312, 360, 0], // line-height:0 → 높이 0
            [454, 304, 171, 17], // 텍스트 조각은 실제 글자 박스를 가진다
          ],
          text: [it(""), it(""), it(VALUE)],
        },
      },
    ],
  } as unknown as CaptureSnapshotResult;
}
const zeroWrapTexts = collectTexts(buildIR(parseAllDocuments(zeroHeightWrapSnap())).root);
assert(zeroWrapTexts.length === 1, "높이 0 래퍼 안 텍스트가 유실되지 않음");
assert(
  (zeroWrapTexts[0] as { characters?: string }).characters === "http://www.hyundaiusa.com",
  "셀 값 문자열이 그대로 복원됨"
);
assert(
  !!zeroWrapTexts[0] && zeroWrapTexts[0].layout.height === 17 && zeroWrapTexts[0].layout.y === 304,
  "좌표/높이를 텍스트 조각의 bounds 에서 가져옴 (y=304, h=17)"
);
assert(
  (zeroWrapTexts[0] as { text?: { lineHeight?: number } }).text?.lineHeight === undefined,
  "line-height:0 은 지정 없음으로 취급 (Figma 텍스트 박스 붕괴 방지)"
);

console.log(failures === 0 ? "\n✅ 모든 테스트 통과" : `\n❌ ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);