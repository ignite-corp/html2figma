import type { H2FDocument, Theme } from "@html2figma/shared";
import type { ViewportPreset } from "@html2figma/shared";

/** popup → background 캡처 요청 */
export interface CaptureRequest {
  kind: "capture";
  tabId: number;
  viewport: ViewportPreset;
  theme: Theme;
}

/** background → popup 진행률 */
export interface CaptureProgress {
  kind: "progress";
  step: string;
  ratio: number; // 0..1
}

/** background → popup 완료 */
export interface CaptureDone {
  kind: "done";
  doc: H2FDocument;
}

/** background → popup 실패 */
export interface CaptureError {
  kind: "error";
  message: string;
}

export type PopupToBackground = CaptureRequest;
export type BackgroundToPopup = CaptureProgress | CaptureDone | CaptureError;
