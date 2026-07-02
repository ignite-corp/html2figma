import type { RGBA } from "./ir.js";

/** CSS 색상 문자열(rgb/rgba/hex/transparent)을 0..1 RGBA로 파싱 */
export function parseCssColor(input: string | undefined | null): RGBA | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s === "none") return null;

  // rgb(a)
  const rgbMatch = s.match(
    /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.%]+))?\s*\)$/
  );
  if (rgbMatch) {
    const r = clamp01(parseFloat(rgbMatch[1]) / 255);
    const g = clamp01(parseFloat(rgbMatch[2]) / 255);
    const b = clamp01(parseFloat(rgbMatch[3]) / 255);
    const a = rgbMatch[4] != null ? parseAlpha(rgbMatch[4]) : 1;
    return { r, g, b, a };
  }

  // hex
  if (s.startsWith("#")) return parseHex(s);

  return null;
}

function parseHex(hex: string): RGBA | null {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

function parseAlpha(a: string): number {
  if (a.endsWith("%")) return clamp01(parseFloat(a) / 100);
  return clamp01(parseFloat(a));
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** "12px" 같은 값에서 px 수치를 뽑아냄. 실패 시 fallback */
export function parsePx(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const m = value.match(/^(-?[0-9.]+)px$/);
  if (m) return parseFloat(m[1]);
  const n = parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
}
