import {
  parseCssColor,
  parsePx,
  type CornerRadius,
  type Effect,
  type Paint,
  type Stroke,
  type Style,
  type TextStyle,
  type EdgeInsets,
  type AutoLayout,
} from "@html2figma/shared";
import type { ComputedStyleMap } from "./styleProps.js";

/** 최상위 콤마로 분할 (괄호 내부 콤마 무시) */
function splitTopLevel(input: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function mapCornerRadius(s: ComputedStyleMap): CornerRadius | undefined {
  const tl = parsePx(s["border-top-left-radius"]);
  const tr = parsePx(s["border-top-right-radius"]);
  const br = parsePx(s["border-bottom-right-radius"]);
  const bl = parsePx(s["border-bottom-left-radius"]);
  if (tl || tr || br || bl) return { tl, tr, br, bl };
  return undefined;
}

function mapStrokes(s: ComputedStyleMap): Stroke[] | undefined {
  const sides = [
    { w: "border-top-width", c: "border-top-color", st: "border-top-style", key: "top" },
    { w: "border-right-width", c: "border-right-color", st: "border-right-style", key: "right" },
    { w: "border-bottom-width", c: "border-bottom-color", st: "border-bottom-style", key: "bottom" },
    { w: "border-left-width", c: "border-left-color", st: "border-left-style", key: "left" },
  ] as const;

  const parsed = sides.map((side) => {
    const width = parsePx(s[side.w]);
    const style = s[side.st] ?? "none";
    const color = parseCssColor(s[side.c]);
    const visible = width > 0 && style !== "none" && color != null && color.a > 0;
    return { key: side.key, width: visible ? width : 0, color };
  });

  const visibleSides = parsed.filter((p) => p.width > 0);
  if (visibleSides.length === 0) return undefined;

  const first = visibleSides[0];
  const uniform =
    visibleSides.length === 4 &&
    visibleSides.every(
      (p) =>
        p.width === first.width &&
        colorEq(p.color, first.color)
    );

  if (uniform && first.color) {
    return [{ color: first.color, weight: first.width, align: "inside" }];
  }

  // 비대칭 border: 대표 색 + perSide 두께
  const perSide: EdgeInsets = {
    top: parsed[0].width,
    right: parsed[1].width,
    bottom: parsed[2].width,
    left: parsed[3].width,
  };
  const color = first.color!;
  const maxWeight = Math.max(perSide.top, perSide.right, perSide.bottom, perSide.left);
  return [{ color, weight: maxWeight, align: "inside", perSide }];
}

function colorEq(
  a: { r: number; g: number; b: number; a: number } | null,
  b: { r: number; g: number; b: number; a: number } | null
): boolean {
  if (!a || !b) return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function mapEffects(s: ComputedStyleMap): Effect[] | undefined {
  const raw = s["box-shadow"];
  if (!raw || raw === "none") return undefined;
  const effects: Effect[] = [];
  for (const shadow of splitTopLevel(raw)) {
    const inset = /\binset\b/.test(shadow);
    const cleaned = shadow.replace(/\binset\b/, "").trim();
    // 색상 추출 (rgb/rgba/hex)
    const colorMatch = cleaned.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]+)/);
    const color = parseCssColor(colorMatch?.[0]) ?? { r: 0, g: 0, b: 0, a: 1 };
    const rest = colorMatch ? cleaned.replace(colorMatch[0], "").trim() : cleaned;
    const nums = rest.match(/-?[0-9.]+px/g)?.map((v) => parsePx(v)) ?? [];
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = nums;
    effects.push({
      type: inset ? "inner-shadow" : "drop-shadow",
      color,
      offsetX,
      offsetY,
      blur,
      spread,
    });
  }
  return effects.length ? effects : undefined;
}

/** linear-gradient / url() 배경을 Paint로. url()은 assetId=url 로 참조 */
function mapBackgroundImage(value: string | undefined): Paint[] {
  if (!value || value === "none") return [];
  const paints: Paint[] = [];
  for (const layer of splitTopLevel(value)) {
    if (layer.startsWith("linear-gradient")) {
      const g = parseLinearGradient(layer);
      if (g) paints.push(g);
    } else if (layer.startsWith("url(")) {
      const url = layer.slice(4, -1).replace(/^["']|["']$/g, "");
      paints.push({ type: "image", assetId: url, scaleMode: "fill" });
    }
  }
  return paints;
}

function parseLinearGradient(input: string): Paint | null {
  const inner = input.slice(input.indexOf("(") + 1, input.lastIndexOf(")"));
  const parts = splitTopLevel(inner);
  let angle = 180;
  let start = 0;
  if (parts[0] && /deg|to /.test(parts[0])) {
    const degMatch = parts[0].match(/(-?[0-9.]+)deg/);
    if (degMatch) angle = parseFloat(degMatch[1]);
    else if (parts[0].includes("to top")) angle = 0;
    else if (parts[0].includes("to right")) angle = 90;
    else if (parts[0].includes("to left")) angle = 270;
    start = 1;
  }
  const stopParts = parts.slice(start);
  const stops = stopParts.map((sp, i) => {
    const cm = sp.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]+)/);
    const color = parseCssColor(cm?.[0]) ?? { r: 0, g: 0, b: 0, a: 1 };
    const posMatch = sp.match(/([0-9.]+)%/);
    const position = posMatch
      ? parseFloat(posMatch[1]) / 100
      : i / Math.max(1, stopParts.length - 1);
    return { position, color };
  });
  if (stops.length < 2) return null;
  return { type: "gradient-linear", stops, angle };
}

export function mapStyle(s: ComputedStyleMap): Style {
  const style: Style = {};

  const fills: Paint[] = [];
  const bg = parseCssColor(s["background-color"]);
  if (bg && bg.a > 0) fills.push({ type: "solid", color: bg });
  fills.push(...mapBackgroundImage(s["background-image"]));
  if (fills.length) style.fills = fills;

  const strokes = mapStrokes(s);
  if (strokes) style.strokes = strokes;

  const radius = mapCornerRadius(s);
  if (radius) style.cornerRadius = radius;

  const effects = mapEffects(s);
  if (effects) style.effects = effects;

  const opacity = s["opacity"] != null ? parseFloat(s["opacity"]) : 1;
  if (!Number.isNaN(opacity) && opacity < 1) style.opacity = opacity;

  const overflow = s["overflow"] ?? s["overflow-x"] ?? "visible";
  if (overflow === "hidden" || overflow === "clip" || overflow === "scroll" || overflow === "auto") {
    style.clipsContent = true;
  } else {
    // overflow:visible 는 박스 밖으로 넘치는 자식도 그린다.
    // Figma createFrame() 기본값(clipsContent=true)이 이를 잘라내지 않도록 명시적으로 끈다.
    style.clipsContent = false;
  }

  return style;
}

export function mapAutoLayout(s: ComputedStyleMap): AutoLayout | undefined {
  const display = s["display"];
  if (display !== "flex" && display !== "inline-flex") return undefined;

  const dir = s["flex-direction"] ?? "row";
  const direction = dir.startsWith("column") ? "vertical" : "horizontal";

  const gap = parsePx(s["gap"]) || parsePx(s["column-gap"]) || parsePx(s["row-gap"]);

  const padding: EdgeInsets = {
    top: parsePx(s["padding-top"]),
    right: parsePx(s["padding-right"]),
    bottom: parsePx(s["padding-bottom"]),
    left: parsePx(s["padding-left"]),
  };

  const primaryAlign = mapJustify(s["justify-content"]);
  const counterAlign = mapAlign(s["align-items"]);

  return { direction, gap, padding, primaryAlign, counterAlign };
}

function mapJustify(v: string | undefined): AutoLayout["primaryAlign"] {
  switch (v) {
    case "center":
      return "center";
    case "flex-end":
    case "end":
      return "max";
    case "space-between":
    case "space-around":
    case "space-evenly":
      return "space-between";
    default:
      return "min";
  }
}

function mapAlign(v: string | undefined): AutoLayout["counterAlign"] {
  switch (v) {
    case "center":
      return "center";
    case "flex-end":
    case "end":
      return "max";
    default:
      return "min";
  }
}

export function mapTextStyle(s: ComputedStyleMap): TextStyle {
  const fontFamilyRaw = s["font-family"] ?? "Inter";
  const fontFamily = splitTopLevel(fontFamilyRaw)[0]?.replace(/^["']|["']$/g, "").trim() || "Inter";
  const fontWeight = parseInt(s["font-weight"] ?? "400", 10) || 400;
  const italic = (s["font-style"] ?? "normal").includes("italic");
  const color = parseCssColor(s["color"]) ?? { r: 0, g: 0, b: 0, a: 1 };

  const lineHeightRaw = s["line-height"];
  const lineHeight =
    lineHeightRaw && lineHeightRaw !== "normal" ? parsePx(lineHeightRaw) : undefined;

  const lsRaw = s["letter-spacing"];
  const letterSpacing = lsRaw && lsRaw !== "normal" ? parsePx(lsRaw) : undefined;

  return {
    fontFamily,
    fontStyle: figmaFontStyle(fontWeight, italic),
    fontWeight,
    fontSize: parsePx(s["font-size"], 16),
    lineHeight,
    letterSpacing,
    color,
    textAlign: mapTextAlign(s["text-align"]),
    textDecoration: mapDecoration(s["text-decoration-line"]),
    textCase: mapTextCase(s["text-transform"]),
  };
}

function figmaFontStyle(weight: number, italic: boolean): string {
  const name =
    weight >= 800
      ? "Bold"
      : weight >= 600
      ? "SemiBold"
      : weight >= 500
      ? "Medium"
      : weight <= 300
      ? "Light"
      : "Regular";
  return italic ? `${name} Italic`.replace("Regular Italic", "Italic") : name;
}

function mapTextAlign(v: string | undefined): TextStyle["textAlign"] {
  if (v === "center" || v === "right" || v === "justify") return v;
  return "left";
}

function mapDecoration(v: string | undefined): TextStyle["textDecoration"] {
  if (!v || v === "none") return "none";
  if (v.includes("underline")) return "underline";
  if (v.includes("line-through")) return "strikethrough";
  return "none";
}

function mapTextCase(v: string | undefined): TextStyle["textCase"] {
  switch (v) {
    case "uppercase":
      return "upper";
    case "lowercase":
      return "lower";
    case "capitalize":
      return "title";
    default:
      return "original";
  }
}
