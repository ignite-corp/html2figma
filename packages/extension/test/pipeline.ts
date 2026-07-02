import { parseAllDocuments, parseSnapshot, type CaptureSnapshotResult } from "../src/capture/snapshot.js";
import { buildIR } from "../src/capture/builder.js";
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

console.log(failures === 0 ? "\n✅ 모든 테스트 통과" : `\n❌ ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
