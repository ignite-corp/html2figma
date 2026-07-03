import type { RawNode } from "./snapshot.js";

/* ---------------- 오버플로 클리핑(브라우저 overflow:hidden 재현) ---------------- */

/** 절대 좌표계의 클립 사각형(경계). 무한대는 해당 축이 잘리지 않음을 뜻한다. */
export type Clip = { left: number; top: number; right: number; bottom: number };

export const NO_CLIP: Clip = {
  left: -Infinity,
  top: -Infinity,
  right: Infinity,
  bottom: Infinity,
};

export function isClipVal(v: string | undefined): boolean {
  if (!v) return false;
  return v.includes("hidden") || v.includes("clip") || v.includes("scroll") || v.includes("auto");
}

export function clipsOverflow(styles: Record<string, string>): boolean {
  const ox = styles["overflow-x"] ?? styles["overflow"];
  const oy = styles["overflow-y"] ?? styles["overflow"];
  return isClipVal(ox) || isClipVal(oy);
}

export function edgesOf(rl: NonNullable<RawNode["layout"]>, ox: number, oy: number): Clip {
  const [x, y, w, h] = rl.bounds;
  return { left: x + ox, top: y + oy, right: x + ox + w, bottom: y + oy + h };
}

/** overflow 가 잘리는 축만 클립 경계를 요소 박스로 좁힌다. */
export function intersectClip(clip: Clip, box: Clip, styles: Record<string, string>): Clip {
  const cx = isClipVal(styles["overflow-x"] ?? styles["overflow"]);
  const cy = isClipVal(styles["overflow-y"] ?? styles["overflow"]);
  return {
    left: cx ? Math.max(clip.left, box.left) : clip.left,
    right: cx ? Math.min(clip.right, box.right) : clip.right,
    top: cy ? Math.max(clip.top, box.top) : clip.top,
    bottom: cy ? Math.min(clip.bottom, box.bottom) : clip.bottom,
  };
}

/** 두 축 모두 좁히는 클립 교차(iframe 등). */
export function intersectClipBox(clip: Clip, box: Clip): Clip {
  return {
    left: Math.max(clip.left, box.left),
    right: Math.min(clip.right, box.right),
    top: Math.max(clip.top, box.top),
    bottom: Math.min(clip.bottom, box.bottom),
  };
}

/** box 가 클립 영역 밖(또는 0크기 클립 안)이라 보이지 않는지 판정. */
export function isOutsideClip(box: Clip, clip: Clip): boolean {
  // 0(또는 음수) 크기 클립이면 그 안의 모든 것이 잘려 안 보인다(height:0; overflow:hidden 등).
  if (clip.right <= clip.left || clip.bottom <= clip.top) return true;
  return (
    box.right <= clip.left ||
    box.left >= clip.right ||
    box.bottom <= clip.top ||
    box.top >= clip.bottom
  );
}
