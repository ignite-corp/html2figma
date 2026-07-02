import type { H2FNode, FrameNode, TextNode, ImageNode, Layout } from "@html2figma/shared";
import type { RawNode } from "./snapshot.js";
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

export interface BuildResult {
  root: H2FNode | null;
  imageUrls: Set<string>;
}

export function buildIR(rawRoot: RawNode): BuildResult {
  const imageUrls = new Set<string>();
  let idCounter = 0;
  const nextId = () => `n${idCounter++}`;

  function layoutOf(node: RawNode): Layout | null {
    if (!node.layout) return null;
    const [x, y, width, height] = node.layout.bounds;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  function isRendered(node: RawNode): boolean {
    if (!node.layout) return false;
    if (node.layout.styles["visibility"] === "hidden") return false;
    if (node.layout.styles["display"] === "none") return false;
    return true;
  }

  /** 요소의 직접 자식 텍스트를 하나의 문자열로 수집 */
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
      }
    }
    if (!parts.length) return null;
    return { text: parts.join("").trim(), bounds: textLayout };
  }

  function buildText(parent: RawNode, text: string, tl: RawNode["layout"]): TextNode | null {
    const layout = tl ? layoutFromRawLayout(tl) : layoutOf(parent);
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

  function layoutFromRawLayout(rl: NonNullable<RawNode["layout"]>): Layout | null {
    const [x, y, width, height] = rl.bounds;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  function buildImage(node: RawNode): ImageNode | null {
    const layout = layoutOf(node);
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

  /** 노드를 IR로. 렌더 안 되는 노드는 자식만 hoist */
  function build(node: RawNode): H2FNode[] {
    if (node.nodeType === 3) return []; // 텍스트는 부모가 처리
    if (node.nodeType !== 1) {
      // document 등: 자식만
      return node.children.flatMap(build);
    }
    if (SKIP_TAGS.has(node.nodeName)) return [];
    if (!isRendered(node)) {
      // display:contents 등 → 자식 hoist
      if (node.layout) return [];
      return node.children.flatMap(build);
    }

    const layout = layoutOf(node);
    if (!layout) return node.children.flatMap(build);

    if (node.nodeName === "IMG") {
      const img = buildImage(node);
      return img ? [img] : [];
    }

    const style = mapStyle(node.layout!.styles);
    const autoLayout = mapAutoLayout(node.layout!.styles);
    if (autoLayout) layout.autoLayout = autoLayout;

    const children: H2FNode[] = [];

    // 직접 텍스트
    const dt = directText(node);
    if (dt) {
      const t = buildText(node, dt.text, dt.bounds);
      if (t) children.push(t);
    }

    // 자식 요소
    for (const c of node.children) {
      if (c.nodeType === 1) children.push(...build(c));
    }

    const hasVisibleStyle =
      !!style.fills?.length ||
      !!style.strokes?.length ||
      !!style.effects?.length ||
      !!style.cornerRadius;

    // 빈 투명 리프는 노이즈 → 제거
    if (children.length === 0 && !hasVisibleStyle) return [];

    const frame: FrameNode = {
      id: nextId(),
      name: node.nodeName.toLowerCase(),
      type: "frame",
      layout,
      style,
      children,
    };
    return [frame];
  }

  const built = build(rawRoot);
  // 최상위가 여러 개면 하나의 페이지 프레임으로 감쌈
  let root: H2FNode | null;
  if (built.length === 1) {
    root = built[0];
  } else if (built.length > 1) {
    const bounds = unionBounds(built);
    root = {
      id: nextId(),
      name: "page",
      type: "frame",
      layout: bounds,
      style: {},
      children: built,
    } as FrameNode;
  } else {
    root = null;
  }

  return { root, imageUrls };
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
