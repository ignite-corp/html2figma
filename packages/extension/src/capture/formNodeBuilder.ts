import type { H2FNode, FrameNode, TextNode } from "@html2figma/shared";
import type { RawNode } from "./snapshot.js";
import type { BuildCtx } from "./builderTypes.js";
import { parseCssColor } from "@html2figma/shared";
import { layoutOf, sortByOrder } from "./builderHelpers.js";

/** checkbox / radio INPUT 을 프레임 + 자식 텍스트로 합성 */
export function buildFormControl(ctx: BuildCtx, node: RawNode, ox: number, oy: number): H2FNode[] {
  if (node.nodeName !== "INPUT") return [];
  const type = (node.attributes["type"] ?? "text").toLowerCase();
  const isCheckbox = type === "checkbox";
  const isRadio = type === "radio";
  if (!isCheckbox && !isRadio) return [];

  const layout = layoutOf(node, ox, oy);
  if (!layout) return [];

  const isChecked = node.attributes["checked"] != null;
  const order = layout.order ?? 0;
  const size = Math.min(layout.width, layout.height);

  const white = { r: 1, g: 1, b: 1, a: 1 };
  // accent 색: CSS accent-color 를 우선 사용하고, auto/미지정이면 요소 color, 그래도 없으면
  // var(--ink) 기본값(#111827)으로 폴백한다.
  const styles = node.layout?.styles ?? {};
  const accentRaw = styles["accent-color"];
  const accent =
    (accentRaw && accentRaw !== "auto" ? parseCssColor(accentRaw) : null) ??
    parseCssColor(styles["color"]) ??
    { r: 0.067, g: 0.094, b: 0.153, a: 1 };
  const ringColor = { r: 0.58, g: 0.64, b: 0.72, a: 1 }; // unchecked ring: slate-400

  const children: H2FNode[] = [];

  if (isChecked && isRadio) {
    // 네이티브 라디오(accent-color) 는 흰 배경 + accent 테두리 + accent 중앙 점의
    // 과녁(bullseye) 모양이다. 중앙 점을 accent 색 작은 원 프레임으로 그린다.
    const dotSize = Math.max(4, Math.round(size * 0.45));
    const dx = layout.x + (layout.width - dotSize) / 2;
    const dy = layout.y + (layout.height - dotSize) / 2;
    const r = dotSize / 2;
    children.push({
      id: ctx.nextId(),
      name: "dot",
      type: "frame",
      layout: { x: dx, y: dy, width: dotSize, height: dotSize, order: order + 1 },
      style: {
        fills: [{ type: "solid", color: accent }],
        cornerRadius: { tl: r, tr: r, br: r, bl: r },
        clipsContent: false,
      },
      children: [],
    } as FrameNode);
  }

  if (isChecked && isCheckbox) {
    const fontSize = Math.max(8, Math.round(size * 0.75));
    children.push({
      id: ctx.nextId(),
      name: "✓",
      type: "text",
      layout: { x: layout.x, y: layout.y, width: layout.width, height: layout.height, order: order + 1 },
      style: {},
      characters: "✓",
      text: {
        fontFamily: "Inter", fontStyle: "Regular", fontWeight: 400,
        fontSize, color: white,
        textAlign: "center", textDecoration: "none", textCase: "original",
      },
    } as TextNode);
  }

  // 네이티브 form control 의 외형(원형·사각 테두리)은 CSS 에 없으므로 명시적으로 재구성한다.
  // 라디오: 항상 흰 배경 + 테두리(선택 accent / 미선택 회색) + 중앙 accent 점(과녁 모양)
  // 체크박스: 선택 시 accent 채움 + 흰 ✓, 미선택 시 흰 배경 + 회색 테두리
  const half = size / 2;
  const bgFill = isRadio ? white : isChecked ? accent : white;
  const style: H2FNode["style"] = {
    fills: [{ type: "solid", color: bgFill }],
    strokes: [{ color: isChecked ? accent : ringColor, weight: 1.5, align: "inside" }],
    cornerRadius: isRadio
      ? { tl: half, tr: half, br: half, bl: half }
      : { tl: 2, tr: 2, br: 2, bl: 2 },
    clipsContent: false,
  };

  const frame: FrameNode = {
    id: ctx.nextId(),
    name: isRadio ? "radio" : "checkbox",
    type: "frame",
    layout,
    style,
    children: sortByOrder(children),
  };
  return [frame];
}
