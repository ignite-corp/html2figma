import { parseAllDocuments, parseSnapshot, type CaptureSnapshotResult } from "../src/capture/snapshot.js";
import { buildIR } from "../src/capture/builder.js";
import { mapStyle } from "../src/capture/style.js";
import { COMPUTED_STYLES } from "../src/capture/styleProps.js";
import { parseCssColor } from "@html2figma/shared";

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
const findText = (n: import("@html2figma/shared").H2FNode): import("@html2figma/shared").H2FNode | null => {
  if (n.type === "text") return n;
  if (n.type === "frame") for (const c of n.children) { const r = findText(c); if (r) return r; }
  return null;
};
const phText = built4.root ? findText(built4.root) : null;
assert(
  !!phText && phText.type === "text" && phText.characters === "무엇이 궁금하신가요?",
  "input placeholder 가 텍스트 노드로 합성됨"
);
assert(
  !!phText && phText.type === "text" && phText.layout.x === 20,
  "placeholder 텍스트가 padding-left 만큼 안쪽으로 배치됨"
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

console.log(failures === 0 ? "\n✅ 모든 테스트 통과" : `\n❌ ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);