import type { H2FNode, VectorNode, Layout } from "@html2figma/shared";
import type { RawNode } from "./snapshot.js";
import type { BuildCtx } from "./builderTypes.js";
import { mapStyle } from "./style.js";
import { isSvgUrl, bgImageLayout, layoutOf } from "./builderHelpers.js";

export function buildImage(ctx: BuildCtx, node: RawNode, ox: number, oy: number): H2FNode | null {
  const layout = layoutOf(node, ox, oy);
  if (!layout) return null;
  const rawUrl = node.currentSourceURL || node.attributes["src"];
  if (!rawUrl) return null;
  const url = ctx.resolveUrl(rawUrl);

  // SVG 이미지는 래스터로 못 그리므로(figma.createImage 는 PNG/JPG 전용) 벡터로 처리
  if (isSvgUrl(url)) {
    const id = ctx.nextId();
    const assetId = `svgimg:${id}`;
    ctx.svgUrlRequests.push({ assetId, url });
    return {
      id,
      name: node.attributes["alt"]?.slice(0, 24) || "image",
      type: "vector",
      layout,
      style: {},
      assetId,
    };
  }

  ctx.imageUrls.add(url);
  return {
    id: ctx.nextId(),
    name: node.attributes["alt"]?.slice(0, 24) || "image",
    type: "image",
    layout,
    style: mapStyle(node.layout!.styles),
    assetId: url,
  };
}

export function buildSvg(ctx: BuildCtx, node: RawNode, ox: number, oy: number): VectorNode | null {
  const layout = layoutOf(node, ox, oy);
  if (!layout) return null;
  if (node.backendNodeId < 0) return null;
  const assetId = `svg:${node.backendNodeId}`;
  ctx.svgRequests.push({ assetId, backendNodeId: node.backendNodeId });
  return {
    id: ctx.nextId(),
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
 * - SVG url → fill 에서 제거하고 벡터 자식 노드로 분리
 */
export function extractBackgroundImages(
  ctx: BuildCtx,
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
      const id = ctx.nextId();
      const assetId = `svgbg:${id}`;
      ctx.svgUrlRequests.push({ assetId, url });
      vectors.push({
        id,
        name: "bg-icon",
        type: "vector",
        layout: bgImageLayout(styles, box),
        style: {},
        assetId,
      });
    } else {
      ctx.imageUrls.add(url);
      kept.push(paint);
    }
  }
  style.fills = kept.length ? kept : undefined;
  return vectors;
}
