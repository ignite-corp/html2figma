import type { H2FNode, FrameNode, TextNode, VectorNode, Layout } from "@html2figma/shared";
import type { RawNode, ParsedDocument, ParsedSnapshot } from "./snapshot.js";
import { mapStyle, mapAutoLayout, mapTextStyle } from "./style.js";
import { parsePx } from "@html2figma/shared";
import {
  isSvgUrl,
  bgImageLayout,
  sortByOrder,
  hasOpaqueFill,
  unionBounds,
} from "./builderHelpers.js";
import {
  type Clip,
  NO_CLIP,
  clipsOverflow,
  edgesOf,
  intersectClip,
  intersectClipBox,
  isOutsideClip,
} from "./clip.js";

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
  /** data-h2f-el 속성값 → 해당 요소의 프레임 노드. 의사요소 아이콘을 호스트 안에 넣기 위함. */
  hostFrames: Map<string, FrameNode>;
}

export function buildIR(snapshot: ParsedSnapshot): BuildResult {
  const imageUrls = new Set<string>();
  const svgRequests: SvgRequest[] = [];
  const svgUrlRequests: SvgUrlRequest[] = [];
  const hostFrames = new Map<string, FrameNode>();
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

  // 직접 텍스트 자식들을 각자 자기 조각 bounds 위치에 개별 텍스트 노드로 만든다.
  // 조각들을 하나로 합치면(예: <br> 로 \n 결합) 사이에 낀 인라인 요소(<strong> 등)
  // 뒤의 텍스트가 인라인 요소 위에 겹쳐 렌더된다. 각 조각을 자기 위치에 두면 겹치지 않는다.
  // 단일 텍스트 노드가 여러 줄로 흐른 경우는 조각이 하나뿐이라 buildText 의 폭 확장이 처리한다.
  function buildDirectTexts(node: RawNode, ox: number, oy: number): TextNode[] {
    const out: TextNode[] = [];
    for (const c of node.children) {
      if (c.nodeType !== 3) continue;
      const text = (c.layout?.text ?? c.nodeValue).replace(/\s+/g, " ").trim();
      if (!text) continue;
      const t = buildText(node, text, c.layout, ox, oy);
      if (t) out.push(t);
    }
    return out;
  }

  function layoutFromRawLayout(rl: NonNullable<RawNode["layout"]>, ox: number, oy: number): Layout | null {
    const [x, y, width, height] = rl.bounds;
    if (width <= 0 || height <= 0) return null;
    return { x: x + ox, y: y + oy, width, height, order: rl.paintOrder };
  }

  function buildText(parent: RawNode, text: string, tl: RawNode["layout"], ox: number, oy: number): TextNode | null {
    const frag = tl ? layoutFromRawLayout(tl, ox, oy) : null;
    const box = layoutOf(parent, ox, oy);
    const base = frag ?? box;
    if (!base) return null;
    const styleSource = parent.layout?.styles ?? {};
    // 줄바꿈 폭은 부모 요소의 콘텐츠 박스 폭을 쓴다(브라우저가 실제로 텍스트를 흘린 폭).
    // 텍스트 조각 bounds 만 쓰면 첫 줄 조각 폭(예: 48px)으로 좁아져, 여러 줄 텍스트가
    // 한두 글자씩 세로로 줄바꿈되며 깨진다. 위치(x/y)는 조각 기준을 유지해
    // 단일 줄·가운데 정렬 텍스트에는 영향이 없다.
    let width = base.width;
    if (box) {
      const padR = parsePx(styleSource["padding-right"]);
      // 텍스트 시작 x 에서 부모 콘텐츠 박스 오른쪽 끝까지의 가용 폭.
      const avail = box.x + box.width - padR - base.x;
      if (avail > width) width = avail;
    }
    const layout: Layout = {
      x: base.x,
      y: base.y,
      width: Math.max(1, width),
      height: base.height,
      order: base.order,
    };
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

  function buildImage(node: RawNode, ox: number, oy: number): H2FNode | null {
    const layout = layoutOf(node, ox, oy);
    if (!layout) return null;
    const url = node.currentSourceURL || node.attributes["src"];
    if (!url) return null;

    // SVG 이미지는 래스터로 못 그리므로(figma.createImage 는 PNG/JPG 전용) 벡터로 처리
    if (isSvgUrl(url)) {
      const id = nextId();
      const assetId = `svgimg:${id}`;
      svgUrlRequests.push({ assetId, url });
      return {
        id,
        name: node.attributes["alt"]?.slice(0, 24) || "image",
        type: "vector",
        layout,
        style: {},
        assetId,
      };
    }

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

  function build(node: RawNode, ox: number, oy: number, clip: Clip): H2FNode[] {
    if (node.nodeType === 3) return [];
    if (node.nodeType !== 1) return node.children.flatMap((c) => build(c, ox, oy, clip));
    if (SKIP_TAGS.has(node.nodeName)) return [];

    const rl = node.layout;
    // 오버플로 클리핑: 조상이 overflow hidden/clip/scroll/auto 로 잘라내는 영역 밖이면 서브트리 제거.
    // (예: height:0; overflow:hidden 로 접힌 드롭다운/아코디언은 브라우저에서 안 보인다)
    if (rl && isOutsideClip(edgesOf(rl, ox, oy), clip)) return [];

    // 이 요소가 오버플로를 자르면 자손 클립 영역을 자신의 박스로 좁힌다.
    let childClip = clip;
    if (rl && clipsOverflow(rl.styles)) {
      childClip = intersectClip(clip, edgesOf(rl, ox, oy), rl.styles);
    }

    if (!isRendered(node)) {
      if (node.layout) return [];
      return node.children.flatMap((c) => build(c, ox, oy, childClip));
    }

    const layout = layoutOf(node, ox, oy);
    if (!layout) return node.children.flatMap((c) => build(c, ox, oy, childClip));

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

    const dt = buildDirectTexts(node, ox, oy);
    for (const t of dt) children.push(t);

    const it = buildInputText(node, ox, oy);
    if (it) children.push(it);

    for (const c of node.children) {
      if (c.nodeType === 1) children.push(...build(c, ox, oy, childClip));
    }

    // iframe 내용 문서 병합 (자식 좌표를 iframe 절대 위치만큼 오프셋)
    if (node.nodeName === "IFRAME" && node.contentDocumentIndex != null) {
      const inner = docs[node.contentDocumentIndex];
      if (inner?.root) {
        // iframe 은 자기 박스로 내용을 자른다.
        const iframeClip = intersectClipBox(childClip, edgesOf(node.layout!, ox, oy));
        for (const m of buildDocRoot(inner, layout.x, layout.y, iframeClip)) children.push(m);
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
    const hostId = node.attributes?.["data-h2f-el"];
    if (hostId) hostFrames.set(hostId, frame);
    return [frame];
  }

  /** 문서 root의 렌더 가능한 최상위 노드들을 offset 적용해 빌드 */
  function buildDocRoot(doc: ParsedDocument, ox: number, oy: number, clip: Clip): H2FNode[] {
    if (!doc.root) return [];
    return build(doc.root, ox, oy, clip);
  }

  const built = buildDocRoot(docs[0], 0, 0, NO_CLIP);

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

  return { root, imageUrls, svgRequests, svgUrlRequests, hostFrames };
}
