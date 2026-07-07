import type { H2FNode, FrameNode } from "@html2figma/shared";
import type { RawNode, ParsedDocument, ParsedSnapshot } from "./snapshot.js";
import { mapStyle, mapAutoLayout } from "./style.js";
import {
  sortByOrder,
  hasOpaqueFill,
  unionBounds,
  layoutOf,
  isRendered,
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
import type { BuildCtx } from "./builderTypes.js";
import { buildDirectTexts, buildInputText, buildSelectText } from "./textNodeBuilder.js";
import { buildFormControl } from "./formNodeBuilder.js";
import { buildImage, buildSvg, extractBackgroundImages } from "./mediaNodeBuilder.js";

export type { SvgRequest, SvgUrlRequest, BuildResult } from "./builderTypes.js";

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

export function buildIR(snapshot: ParsedSnapshot) {
  const imageUrls = new Set<string>();
  const svgRequests: import("./builderTypes.js").SvgRequest[] = [];
  const svgUrlRequests: import("./builderTypes.js").SvgUrlRequest[] = [];
  const hostFrames = new Map<string, FrameNode>();
  const docs = snapshot.documents;
  let idCounter = 0;
  const baseUrl = docs[0]?.url || "";

  const ctx: BuildCtx = {
    nextId: () => `n${idCounter++}`,
    resolveUrl(url: string): string {
      if (!url || /^(https?:|data:|blob:)/i.test(url)) return url;
      try {
        return new URL(url, baseUrl).href;
      } catch {
        return url;
      }
    },
    imageUrls,
    svgRequests,
    svgUrlRequests,
    hostFrames,
  };

  function build(node: RawNode, ox: number, oy: number, clip: Clip): H2FNode[] {
    if (node.nodeType === 3) return [];
    if (node.nodeType !== 1) return node.children.flatMap((c) => build(c, ox, oy, clip));
    if (SKIP_TAGS.has(node.nodeName)) return [];

    const rl = node.layout;
    // 오버플로 클리핑: 조상이 overflow hidden/clip/scroll/auto 로 잘라내는 영역 밖이면 서브트리 제거.
    if (rl) {
      const [, , bw, bh] = rl.bounds;
      const hasArea = bw > 0 && bh > 0;
      if (hasArea && isOutsideClip(edgesOf(rl, ox, oy), clip)) {
        const confinesChildren = clipsOverflow(rl.styles);
        const hasElementChildren = node.children.some((c) => c.nodeType === 1);
        if (confinesChildren || !hasElementChildren) return [];
        return node.children.flatMap((c) => build(c, ox, oy, clip));
      }
    }

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
      const img = buildImage(ctx, node, ox, oy);
      return img ? [img] : [];
    }

    if (node.nodeName.toLowerCase() === "svg") {
      const svg = buildSvg(ctx, node, ox, oy);
      return svg ? [svg] : [];
    }

    const style = mapStyle(node.layout!.styles);
    const autoLayout = mapAutoLayout(node.layout!.styles);
    if (autoLayout) layout.autoLayout = autoLayout;

    const children: H2FNode[] = [];

    for (const v of extractBackgroundImages(ctx, node, style, layout)) children.push(v);
    for (const t of buildDirectTexts(ctx, node, ox, oy)) children.push(t);
    const it = buildInputText(ctx, node, ox, oy);
    if (it) children.push(it);
    for (const st of buildSelectText(ctx, node, ox, oy)) children.push(st);

    // checkbox / radio 체크 마크 합성 (이미 프레임+자식까지 반환하므로 early-return)
    const fc = buildFormControl(ctx, node, ox, oy);
    if (fc.length > 0) return fc;

    for (const c of node.children) {
      if (c.nodeType === 1) children.push(...build(c, ox, oy, childClip));
    }

    // iframe 내용 문서 병합 (자식 좌표를 iframe 절대 위치만큼 오프셋)
    if (node.nodeName === "IFRAME" && node.contentDocumentIndex != null) {
      const inner = docs[node.contentDocumentIndex];
      if (inner?.root) {
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
      id: ctx.nextId(),
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
      id: ctx.nextId(),
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
  if (root && root.type === "frame" && !hasOpaqueFill(root)) {
    const f = root as FrameNode;
    f.style = {
      ...f.style,
      fills: [{ type: "solid", color: { r: 1, g: 1, b: 1, a: 1 } }, ...(f.style.fills ?? [])],
    };
  }

  return { root, imageUrls, svgRequests, svgUrlRequests, hostFrames };
}
