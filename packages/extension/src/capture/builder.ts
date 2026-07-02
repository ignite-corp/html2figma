import type { H2FNode, FrameNode, TextNode, ImageNode, VectorNode, Layout } from "@html2figma/shared";
import type { RawNode, ParsedDocument, ParsedSnapshot } from "./snapshot.js";
import { mapStyle, mapAutoLayout, mapTextStyle } from "./style.js";
import { parsePx } from "@html2figma/shared";

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

/** background-image 로 지정된 SVG(url). 벡터 자식으로 렌더하기 위해 마크업을 별도로 받는다. */
export interface SvgUrlRequest {
  assetId: string;
  url: string;
}

export interface BuildResult {
  root: H2FNode | null;
  imageUrls: Set<string>;
  svgRequests: SvgRequest[];
  svgUrlRequests: SvgUrlRequest[];
}

export function buildIR(snapshot: ParsedSnapshot): BuildResult {
  const imageUrls = new Set<string>();
  const svgRequests: SvgRequest[] = [];
  const svgUrlRequests: SvgUrlRequest[] = [];
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

  /** input/textarea 의 value 또는 placeholder 를 텍스트 노드로 합성 (내부 자식 텍스트가 없으므로 유실 방지) */
  function buildInputText(node: RawNode, ox: number, oy: number): TextNode | null {
    if (node.nodeName !== "INPUT" && node.nodeName !== "TEXTAREA") return null;
    const value = node.attributes["value"];
    const placeholder = node.attributes["placeholder"];
    const hasValue = !!value && value.trim().length > 0;
    const text = hasValue ? value : placeholder;
    if (!text || !text.trim()) return null;

    const box = layoutOf(node, ox, oy);
    if (!box) return null;
    const styles = node.layout!.styles;
    const padL = parsePx(styles["padding-left"]);
    const padR = parsePx(styles["padding-right"]);
    const padT = parsePx(styles["padding-top"]);
    const padB = parsePx(styles["padding-bottom"]);
    const ts = mapTextStyle(styles);
    // placeholder 는 보통 흐린 회색(::placeholder). 별도 캡처가 어려우므로 근사값 사용.
    const color = hasValue ? ts.color : { r: 0.46, g: 0.46, b: 0.46, a: 1 };

    return {
      id: nextId(),
      name: text.slice(0, 24) || "text",
      type: "text",
      layout: {
        x: box.x + padL,
        y: box.y + padT,
        width: Math.max(1, box.width - padL - padR),
        height: Math.max(1, box.height - padT - padB),
        order: box.order,
      },
      style: {},
      characters: text,
      text: { ...ts, color },
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

  /**
   * style.fills 의 background-image(image paint)를 처리한다.
   * - raster url → fetch 대상(imageUrls)에 등록하고 fill 로 유지
   * - SVG url → fill 에서 제거하고 벡터 자식 노드로 분리(background-size/position 반영, 요소 뒤에 배치)
   */
  function extractBackgroundImages(
    node: RawNode,
    style: ReturnType<typeof mapStyle>,
    box: Layout
  ): VectorNode[] {
    if (!style.fills?.length) return [];
    const vectors: VectorNode[] = [];
    const kept: typeof style.fills = [];
    const styles = node.layout!.styles;
    for (const paint of style.fills) {
      if (paint.type !== "image") {
        kept.push(paint);
        continue;
      }
      const url = paint.assetId;
      if (isSvgUrl(url)) {
        const id = nextId();
        const assetId = `svgbg:${id}`;
        svgUrlRequests.push({ assetId, url });
        vectors.push({
          id,
          name: "bg-icon",
          type: "vector",
          layout: bgImageLayout(styles, box),
          style: {},
          assetId,
        });
      } else {
        imageUrls.add(url);
        kept.push(paint);
      }
    }
    style.fills = kept.length ? kept : undefined;
    return vectors;
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

    // background-image 처리: raster url 은 fetch 대상에 등록, SVG url 은 벡터 자식으로 분리.
    const bgVectors = extractBackgroundImages(node, style, layout);
    for (const v of bgVectors) children.push(v);

    const dt = directText(node);
    if (dt) {
      const t = buildText(node, dt.text, dt.bounds, ox, oy);
      if (t) children.push(t);
    }

    const it = buildInputText(node, ox, oy);
    if (it) children.push(it);

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

  return { root, imageUrls, svgRequests, svgUrlRequests };
}

/** url 이 SVG 인지(확장자 또는 data:image/svg+xml) */
function isSvgUrl(url: string): boolean {
  return /^data:image\/svg\+xml/i.test(url) || /\.svg(\?|#|$)/i.test(url);
}

/** background-size/position 을 반영해 배경 이미지가 그려질 박스를 요소 박스 안에서 계산 */
function bgImageLayout(styles: Record<string, string>, box: Layout): Layout {
  const sizeRaw = (styles["background-size"] || "").trim();
  const posRaw = (styles["background-position"] || "center").trim();

  let w = box.width;
  let h = box.height;
  const sizeParts = sizeRaw.split(/\s+/);
  const sw = parsePx(sizeParts[0]);
  const sh = parsePx(sizeParts[1] ?? sizeParts[0]);
  if (sw > 0 && sw <= box.width) w = sw;
  if (sh > 0 && sh <= box.height) h = sh;

  // position: center / left / right / top / bottom / px 근사 (기본 center)
  const posParts = posRaw.split(/\s+/);
  const px = alignPos(posParts[0], box.width, w);
  const py = alignPos(posParts[1] ?? posParts[0] ?? "center", box.height, h, true);

  return { x: box.x + px, y: box.y + py, width: w, height: h, order: box.order };
}

function alignPos(token: string | undefined, boxSize: number, itemSize: number, vertical = false): number {
  const t = (token || "center").toLowerCase();
  if (t === "center") return (boxSize - itemSize) / 2;
  if (!vertical && t === "left") return 0;
  if (!vertical && t === "right") return boxSize - itemSize;
  if (vertical && t === "top") return 0;
  if (vertical && t === "bottom") return boxSize - itemSize;
  if (t.endsWith("%")) return ((boxSize - itemSize) * parseFloat(t)) / 100;
  const n = parsePx(t);
  if (!Number.isNaN(n) && /px$/.test(t)) return n;
  return (boxSize - itemSize) / 2;
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
