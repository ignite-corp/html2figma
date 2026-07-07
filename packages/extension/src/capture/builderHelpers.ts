import type { H2FNode, FrameNode, Layout } from "@html2figma/shared";
import type { RawNode } from "./snapshot.js";
import { parsePx } from "@html2figma/shared";

export function isSvgUrl(url: string): boolean {
  return /^data:image\/svg\+xml/i.test(url) || /\.svg(\?|#|$)/i.test(url);
}

/** background-size/position 을 반영해 배경 이미지가 그려질 박스를 요소 박스 안에서 계산 */
export function bgImageLayout(styles: Record<string, string>, box: Layout): Layout {
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

export function alignPos(
  token: string | undefined,
  boxSize: number,
  itemSize: number,
  vertical = false
): number {
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
export function sortByOrder(nodes: H2FNode[]): H2FNode[] {
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
export function hasOpaqueFill(node: H2FNode): boolean {
  if (node.type !== "frame") return false;
  const fills = (node as FrameNode).style.fills;
  if (!fills || fills.length === 0) return false;
  return fills.some((f) => (f.type === "solid" && f.color.a >= 1) || f.type === "image");
}

export function unionBounds(nodes: H2FNode[]): Layout {
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

export function layoutOf(node: RawNode, ox: number, oy: number): Layout | null {
  if (!node.layout) return null;
  const [x, y, width, height] = node.layout.bounds;
  if (width <= 0 || height <= 0) return null;
  return { x: x + ox, y: y + oy, width, height, order: node.layout.paintOrder };
}

export function layoutFromRawLayout(rl: NonNullable<RawNode["layout"]>, ox: number, oy: number): Layout | null {
  const [x, y, width, height] = rl.bounds;
  if (width <= 0 || height <= 0) return null;
  return { x: x + ox, y: y + oy, width, height, order: rl.paintOrder };
}

export function isRendered(node: RawNode): boolean {
  if (!node.layout) return false;
  if (node.layout.styles["visibility"] === "hidden") return false;
  if (node.layout.styles["display"] === "none") return false;
  // opacity:0 요소는 브라우저에서 보이지 않는다. DOMSnapshot 은 ::before/::after 의사요소를
  // 실제 노드로 포함하는데, opacity:0 툴팁(.help::after 등)이 렌더되면 자기 배경(예: 어두운
  // 상자)이나 오토레이아웃 자식으로 남아 원본에 없는 회색/검정 박스가 생긴다. 투명 요소는
  // 서브트리째 건너뛴다(opacity 는 자손에 곱해지므로 자식도 함께 숨겨진다).
  if (parseFloat(node.layout.styles["opacity"] ?? "1") === 0) return false;
  return true;
}
