import type { H2FNode, FrameNode, TextNode, ImageNode, VectorNode, Layout } from "@html2figma/shared";
import type { RawNode, ParsedDocument, ParsedSnapshot } from "./snapshot.js";
import { mapStyle, mapAutoLayout, mapTextStyle } from "./style.js";

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "HEAD",
  "META",
  "LINK",
  "TITLE",
  "NOSCRIPT",
  "BR",
  "TEMPLATE",
]);

export interface SvgRequest {
  assetId: string;
  backendNodeId: number;
}

export interface BuildResult {
  root: H2FNode | null;
  imageUrls: Set<string>;
  svgRequests: SvgRequest[];
}

export function buildIR(snapshot: ParsedSnapshot): BuildResult {
  const imageUrls = new Set<string>();
  const svgRequests: SvgRequest[] = [];
  const docs = snapshot.documents;
  let idCounter = 0;
  const nextId = () => `n${idCounter++}`;

  function layoutOf(node: RawNode, ox: number, oy: number): Layout | null {
    if (!node.layout) return null;
    const [x, y, width, height] = node.layout.bounds;
    if (width <= 0 || height <= 0) return null;
    return { x: x + ox, y: y + oy, width, height, order: node.layout.paintOrder };
  }

  function isRendered(node: RawNode): boolean {
    if (!node.layout) return false;
    if (node.layout.styles["visibility"] === "hidden") return false;
    if (node.layout.styles["display"] === "none") return false;
    return true;
  }

  function directText(node: RawNode): { text: string; bounds: RawNode["layout"] } | null {
    const parts: string[] = [];
    let textLayout: RawNode["layout"] | undefined;
    for (const c of node.children) {
      if (c.nodeType === 3) {
        const v = (c.layout?.text ?? c.nodeValue).replace(/\s+/g, " ");
        if (v.trim()) {
          parts.push(v);
          textLayout = textLayout ?? c.layout;
        }
      } else if (c.nodeType === 1 && c.nodeName === "BR") {
        parts.push("\n");
      }
    }
    if (!parts.join("").trim()) return null;
    return { text: parts.join("").replace(/^\n+|\n+$/g, ""), bounds: textLayout };
  }

  function layoutFromRawLayout(rl: NonNullable<RawNode["layout"]>, ox: number, oy: number): Layout | null {
    const [x, y, width, height] = rl.bounds;
    if (width <= 0 || height <= 0) return null;
    return { x: x + ox, y: y + oy, width, height, order: rl.paintOrder };
  }

  function buildText(parent: RawNode, text: string, tl: RawNode["layout"], ox: number, oy: number): TextNode | null {
    const layout = tl ? layoutFromRawLayout(tl, ox, oy) : layoutOf(parent, ox, oy);
    if (!layout) return null;
    const styleSource = parent.layout?.styles ?? {};
    return {
      id: nextId(),
      name: text.slice(0, 24) || "text",
      type: "text",
      layout,
      style: {},
      characters: text,
      text: mapTextStyle(styleSource),
    };
  }

  function buildImage(node: RawNode, ox: number, oy: number): ImageNode | null {
    const layout = layoutOf(node, ox, oy);
    if (!layout) return null;
    const url = node.currentSourceURL || node.attributes["src"];
    if (!url) return null;
    imageUrls.add(url);
    return {
      id: nextId(),
      name: node.attributes["alt"]?.slice(0, 24) || "image",
      type: "image",
      layout,
      style: mapStyle(node.layout!.styles),
      assetId: url,
    };
  }

  function buildSvg(node: RawNode, ox: number, oy: number): VectorNode | null {
    const layout = layoutOf(node, ox, oy);
    if (!layout) return null;
    if (node.backendNodeId < 0) return null;
    const assetId = `svg:${node.backendNodeId}`;
    svgRequests.push({ assetId, backendNodeId: node.backendNodeId });
    return {
      id: nextId(),
      name: "svg",
      type: "vector",
      layout,
      style: {},
      assetId,
    };
  }

  function build(node: RawNode, ox: number, oy: number): H2FNode[] {
    if (node.nodeType === 3) return [];
    if (node.nodeType !== 1) return node.children.flatMap((c) => build(c, ox, oy));
    if (SKIP_TAGS.has(node.nodeName)) return [];

    if (!isRendered(node)) {
      if (node.layout) return [];
      return node.children.flatMap((c) => build(c, ox, oy));
    }

    const layout = layoutOf(node, ox, oy);
    if (!layout) return node.children.flatMap((c) => build(c, ox, oy));

    if (node.nodeName === "IMG") {
      const img = buildImage(node, ox, oy);
      return img ? [img] : [];
    }

    // 인라인 SVG → 벡터 리프 (자식 무시)
    if (node.nodeName.toLowerCase() === "svg") {
      const svg = buildSvg(node, ox, oy);
      return svg ? [svg] : [];
    }

    const style = mapStyle(node.layout!.styles);
    const autoLayout = mapAutoLayout(node.layout!.styles);
    if (autoLayout) layout.autoLayout = autoLayout;

    const children: H2FNode[] = [];

    const dt = directText(node);
    if (dt) {
      const t = buildText(node, dt.text, dt.bounds, ox, oy);
      if (t) children.push(t);
    }

    for (const c of node.children) {
      if (c.nodeType === 1) children.push(...build(c, ox, oy));
    }

    // iframe 내용 문서 병합 (자식 좌표를 iframe 절대 위치만큼 오프셋)
    if (node.nodeName === "IFRAME" && node.contentDocumentIndex != null) {
      const inner = docs[node.contentDocumentIndex];
      if (inner?.root) {
        for (const m of buildDocRoot(inner, layout.x, layout.y)) children.push(m);
      }
    }

    const hasVisibleStyle =
      !!style.fills?.length ||
      !!style.strokes?.length ||
      !!style.effects?.length ||
      !!style.cornerRadius;

    if (children.length === 0 && !hasVisibleStyle) return [];

    if (node.nodeName === "IFRAME") style.clipsContent = true;

    const frame: FrameNode = {
      id: nextId(),
      name: node.nodeName.toLowerCase(),
      type: "frame",
      layout,
      style,
      children: sortByOrder(children),
    };
    return [frame];
  }

  /** 문서 root의 렌더 가능한 최상위 노드들을 offset 적용해 빌드 */
  function buildDocRoot(doc: ParsedDocument, ox: number, oy: number): H2FNode[] {
    if (!doc.root) return [];
    return build(doc.root, ox, oy);
  }

  const built = buildDocRoot(docs[0], 0, 0);

  let root: H2FNode | null;
  if (built.length === 1) {
    root = built[0];
  } else if (built.length > 1) {
    root = {
      id: nextId(),
      name: "page",
      type: "frame",
      layout: unionBounds(built),
      style: {},
      children: sortByOrder(built),
    } as FrameNode;
  } else {
    root = null;
  }

  // 브라우저는 투명한 페이지 배경을 흰색 캔버스로 렌더한다.
  // 루트에 불투명 배경이 없으면 흰색을 깔아 Figma 다크 캔버스가 비치는 것을 막는다.
  if (root && root.type === "frame" && !hasOpaqueFill(root)) {
    const f = root as FrameNode;
    f.style = {
      ...f.style,
      fills: [{ type: "solid", color: { r: 1, g: 1, b: 1, a: 1 } }, ...(f.style.fills ?? [])],
    };
  }

  return { root, imageUrls, svgRequests };
}

/**
 * 형제 노드를 스태킹(paint) 순서로 정렬한다. order 가 작을수록 먼저(아래) 그려진다.
 * z-index/absolute 로 DOM 순서와 스태킹이 다른 경우에도 올바르게 겹치도록 한다.
 * 안정 정렬이므로 order 가 같으면 DOM(삽입) 순서를 유지한다.
 */
function sortByOrder(nodes: H2FNode[]): H2FNode[] {
  return nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const oa = a.n.layout.order ?? 0;
      const ob = b.n.layout.order ?? 0;
      return oa === ob ? a.i - b.i : oa - ob;
    })
    .map((x) => x.n);
}

/** 루트 프레임에 캔버스를 완전히 가리는 불투명 배경이 있는지 */
function hasOpaqueFill(node: H2FNode): boolean {
  if (node.type !== "frame") return false;
  const fills = (node as FrameNode).style.fills;
  if (!fills || fills.length === 0) return false;
  return fills.some((f) => (f.type === "solid" && f.color.a >= 1) || f.type === "image");
}

function unionBounds(nodes: H2FNode[]): Layout {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.layout.x);
    minY = Math.min(minY, n.layout.y);
    maxX = Math.max(maxX, n.layout.x + n.layout.width);
    maxY = Math.max(maxY, n.layout.y + n.layout.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
