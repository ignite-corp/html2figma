import type { H2FDocument } from "@html2figma/shared";

/** popup → background 단일 캡처 요청 */
export interface CaptureRequest {
  kind: "capture";
  tabId: number;
  /** 캡처 후 릴레이로 자동 전송 */
  sendToBridge?: boolean;
  /** 페어링 코드(플러그인이 발급) */
  bridgeCode?: string;
}

/** background → popup 진행률 */
export interface CaptureProgress {
  kind: "progress";
  step: string;
  ratio: number; // 0..1
}

/** background → popup 단일 완료 */
export interface CaptureDone {
  kind: "done";
  doc: H2FDocument;
  bridgeSent?: boolean;
}

/** background → popup 실패 */
export interface CaptureError {
  kind: "error";
  message: string;
}

export type PopupToBackground = CaptureRequest;
export type BackgroundToPopup = CaptureProgress | CaptureDone | CaptureError;
