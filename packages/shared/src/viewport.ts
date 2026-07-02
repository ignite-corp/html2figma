import type { Viewport } from "./ir.js";

export type ViewportPreset = "desktop" | "tablet" | "mobile";

export const VIEWPORT_PRESETS: Record<ViewportPreset, Viewport> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, preset: "desktop" },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2, preset: "tablet" },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, preset: "mobile" },
};

export function getViewport(preset: ViewportPreset): Viewport {
  return { ...VIEWPORT_PRESETS[preset] };
}
