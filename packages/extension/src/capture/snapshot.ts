import { COMPUTED_STYLES, type ComputedStyleMap } from "./styleProps.js";

/* CDP DOMSnapshot 원시 응답 타입 (필요한 필드만) */

interface RareStringData {
  index: number[];
  value: number[];
}

interface NodeTreeSnapshot {
  parentIndex: number[];
  nodeType: number[];
  nodeName: number[];
  nodeValue: number[];
  backendNodeId: number[];
  attributes: number[][];
  currentSourceURL?: RareStringData;
  contentDocumentIndex?: { index: number[]; value: number[] };
}

interface LayoutTreeSnapshot {
  nodeIndex: number[];
  styles: number[][];
  bounds: number[][];
  text: number[];
}

interface DocumentSnapshot {
  documentURL: number;
  title: number;
  nodes: NodeTreeSnapshot;
  layout: LayoutTreeSnapshot;
}

export interface CaptureSnapshotResult {
  documents: DocumentSnapshot[];
  strings: string[];
}

/* 정규화된 트리 */

export interface RawLayout {
  bounds: [number, number, number, number]; // x, y, w, h
  styles: ComputedStyleMap;
  text?: string;
}

export interface RawNode {
  index: number;
  parentIndex: number;
  nodeType: number; // 1=element, 3=text, 9=document
  nodeName: string; // 대문자 태그명 또는 #text
  nodeValue: string;
  attributes: Record<string, string>;
  currentSourceURL?: string;
  layout?: RawLayout;
  children: RawNode[];
}

export interface ParsedDocument {
  url: string;
  title: string;
  nodes: RawNode[]; // index 순
  root: RawNode | null; // nodeType 9 (document) 또는 첫 노드
}

function str(strings: string[], idx: number | undefined): string {
  if (idx == null || idx < 0) return "";
  return strings[idx] ?? "";
}

function rareToMap(rare: RareStringData | undefined): Map<number, number> {
  const m = new Map<number, number>();
  if (!rare) return m;
  for (let i = 0; i < rare.index.length; i++) {
    m.set(rare.index[i], rare.value[i]);
  }
  return m;
}

/** 메인 프레임(첫 document)만 파싱 */
export function parseSnapshot(result: CaptureSnapshotResult): ParsedDocument {
  const { documents, strings } = result;
  const doc = documents[0];
  if (!doc) {
    return { url: "", title: "", nodes: [], root: null };
  }

  const { nodes, layout } = doc;
  const count = nodes.parentIndex.length;

  // layout node index -> node index 역매핑
  const layoutByNode = new Map<number, number>();
  for (let li = 0; li < layout.nodeIndex.length; li++) {
    layoutByNode.set(layout.nodeIndex[li], li);
  }

  const currentSrc = rareToMap(nodes.currentSourceURL);

  const raw: RawNode[] = [];
  for (let i = 0; i < count; i++) {
    const attrs: Record<string, string> = {};
    const attrArr = nodes.attributes[i] ?? [];
    for (let a = 0; a + 1 < attrArr.length; a += 2) {
      attrs[str(strings, attrArr[a])] = str(strings, attrArr[a + 1]);
    }

    const node: RawNode = {
      index: i,
      parentIndex: nodes.parentIndex[i],
      nodeType: nodes.nodeType[i],
      nodeName: str(strings, nodes.nodeName[i]),
      nodeValue: str(strings, nodes.nodeValue[i]),
      attributes: attrs,
      children: [],
    };

    if (currentSrc.has(i)) {
      node.currentSourceURL = str(strings, currentSrc.get(i)!);
    }

    const li = layoutByNode.get(i);
    if (li != null) {
      const b = layout.bounds[li];
      const styleIdx = layout.styles[li] ?? [];
      const styles: ComputedStyleMap = {};
      for (let s = 0; s < COMPUTED_STYLES.length; s++) {
        const v = str(strings, styleIdx[s]);
        if (v) styles[COMPUTED_STYLES[s]] = v;
      }
      node.layout = {
        bounds: [b[0], b[1], b[2], b[3]],
        styles,
        text: str(strings, layout.text[li]) || undefined,
      };
    }

    raw.push(node);
  }

  // 부모-자식 연결
  let root: RawNode | null = null;
  for (const n of raw) {
    if (n.parentIndex >= 0 && raw[n.parentIndex]) {
      raw[n.parentIndex].children.push(n);
    } else {
      root = root ?? n;
    }
  }

  return {
    url: str(strings, doc.documentURL),
    title: str(strings, doc.title),
    nodes: raw,
    root,
  };
}
