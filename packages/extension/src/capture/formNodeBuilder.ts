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
  const isRange = type === "range";
  if (!isCheckbox && !isRadio && !isRange) return [];

  const layout = layoutOf(node, ox, oy);
  if (!layout) return [];

  // range 슬라이더의 thumb(핸들)은 ::-webkit-slider-thumb 의사요소라 DOM 캡처에 잡히지 않는다.
  // value/min/max 로 위치를 계산해 흰 원형 knob 을 합성한다(트랙·채움 div 는 형제로 별도 렌더).
  if (isRange) return buildRangeThumb(ctx, node, layout);

  // appearance:none 은 커스텀 스타일드 컨트롤로, 브라우저가 네이티브 외형(원형 테두리 등)을
  // 그리지 않는다. 실제 외형은 요소 자신의 배경/테두리나 ::before SVG 로 그려지므로 여기서
  // 네이티브 링을 합성하면 원본에 없는 검은 테두리가 생긴다. 합성을 건너뛰고 일반 프레임으로
  // 빌드되게 한다(자신의 CSS 배경/테두리 + 의사요소 아이콘이 실제 모습을 표현).
  const csStyles = node.layout?.styles ?? {};
  const appearance = (csStyles["appearance"] ?? csStyles["-webkit-appearance"] ?? "").toLowerCase();
  if (appearance === "none") return [];

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

/** range INPUT 을 흰 원형 thumb(핸들)로 합성한다. value/min/max 로 트랙 내 위치를 계산한다. */
function buildRangeThumb(
  ctx: BuildCtx,
  node: RawNode,
  layout: { x: number; y: number; width: number; height: number; order?: number }
): H2FNode[] {
  const num = (k: string, d: number): number => {
    const v = parseFloat(node.attributes[k] ?? "");
    return Number.isFinite(v) ? v : d;
  };
  const min = num("min", 0);
  const max = num("max", 100);
  const val = num("value", min);
  const f = max > min ? Math.min(1, Math.max(0, (val - min) / (max - min))) : 0;

  const d = Math.min(18, Math.max(12, Math.round(layout.height)));
  const r = d / 2;
  // thumb 중심이 트랙 양끝을 벗어나지 않도록 [r, width-r] 범위로 인셋한다(네이티브 동작).
  const cx = layout.x + r + f * Math.max(0, layout.width - d);
  const cy = layout.y + layout.height / 2;
  const order = (layout.order ?? 0) + 2;

  const white = { r: 1, g: 1, b: 1, a: 1 };
  const styles = node.layout?.styles ?? {};
  const border =
    (styles["accent-color"] && styles["accent-color"] !== "auto"
      ? parseCssColor(styles["accent-color"])
      : null) ?? { r: 0.02, g: 0.078, b: 0.122, a: 1 };

  const thumb: FrameNode = {
    id: ctx.nextId(),
    name: "thumb",
    type: "frame",
    layout: { x: cx - r, y: cy - r, width: d, height: d, order },
    style: {
      fills: [{ type: "solid", color: white }],
      strokes: [{ color: border, weight: 1.5, align: "inside" }],
      cornerRadius: { tl: r, tr: r, br: r, bl: r },
      clipsContent: false,
    },
    children: [],
  };
  return [thumb];
}
