import { parseSnapshot, type CaptureSnapshotResult } from "../src/capture/snapshot.js";
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

const { root } = buildIR(parsed.root!);
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

console.log(failures === 0 ? "\n✅ 모든 테스트 통과" : `\n❌ ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
