import type {
  Effect,
  RGBA,
  TextStyle as IRTextStyle,
} from "@html2figma/shared";

/** Figma 스타일명("Semi Bold", "Extra Light" 등)을 CSS font-weight 숫자로 변환 */
export function weightOfStyleName(style: string): number {
  const s = style.toLowerCase().replace(/[\s_-]+/g, "");
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("semibold") || s.includes("demibold") || s.includes("demi")) return 600;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  if (s.includes("medium")) return 500;
  if (s.includes("light")) return 300;
  if (s.includes("bold")) return 700;
  return 400;
}

/** 가족 내 실제 스타일 중 이탤릭 여부가 같고 무게가 가장 가까운 스타일 선택(동률이면 더 두꺼운 쪽) */
export function pickClosestStyle(
  styles: FontName[],
  desired: number,
  italic: boolean
): FontName | null {
  const match = (want: boolean) =>
    styles.filter((f) => /italic|oblique/i.test(f.style) === want);
  let pool = match(italic);
  if (pool.length === 0) pool = styles;
  let best: FontName | null = null;
  let bestScore = Infinity;
  let bestWeight = -1;
  for (const f of pool) {
    const w = weightOfStyleName(f.style);
    const d = Math.abs(w - desired);
    if (d < bestScore || (d === bestScore && w > bestWeight)) {
      best = f;
      bestScore = d;
      bestWeight = w;
    }
  }
  return best;
}

export function solid(color: RGBA): SolidPaint {
  return { type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
}

type Effect_ = DropShadowEffect | InnerShadowEffect;

export function toFigmaEffect(e: Effect): Effect_ {
  return {
    type: e.type === "inner-shadow" ? "INNER_SHADOW" : "DROP_SHADOW",
    color: { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a },
    offset: { x: e.offsetX, y: e.offsetY },
    radius: e.blur,
    // CSS box-shadow 의 spread 는 음수가 가능하지만 Figma 는 음수를 받지 않는다.
    spread: Math.max(0, e.spread),
    visible: true,
    blendMode: "NORMAL",
  };
}

export function mapTextAlign(
  v: IRTextStyle["textAlign"]
): "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" {
  switch (v) {
    case "center":
      return "CENTER";
    case "right":
      return "RIGHT";
    case "justify":
      return "JUSTIFIED";
    default:
      return "LEFT";
  }
}

export function mapDecoration(v: IRTextStyle["textDecoration"]): TextDecoration {
  if (v === "underline") return "UNDERLINE";
  if (v === "strikethrough") return "STRIKETHROUGH";
  return "NONE";
}

export function mapTextCase(v: IRTextStyle["textCase"]): TextCase {
  switch (v) {
    case "upper":
      return "UPPER";
    case "lower":
      return "LOWER";
    case "title":
      return "TITLE";
    default:
      return "ORIGINAL";
  }
}

export function gradientTransform(angleDeg: number): Transform {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.sin(a);
  const sin = -Math.cos(a);
  const tx = 0.5 - 0.5 * cos + 0.5 * sin;
  const ty = 0.5 - 0.5 * sin - 0.5 * cos;
  return [
    [cos, -sin, tx],
    [sin, cos, ty],
  ];
}
