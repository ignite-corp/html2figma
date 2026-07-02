import type { H2FBundle, H2FDocument, Theme } from "@html2figma/shared";
import type { ViewportPreset } from "@html2figma/shared";

/** popup → background 단일 캡처 요청 */
export interface CaptureRequest {
  kind: "capture";
  tabId: number;
  viewport: ViewportPreset;
  theme: Theme;
  /** 캡처 후 릴레이로 자동 전송 */
  sendToBridge?: boolean;
  /** 페어링 코드(플러그인이 발급) */
  bridgeCode?: string;
  /** 릴레이 URL(미지정 시 저장값/기본값) */
  relayUrl?: string;
}

/** popup → background 벌크 캡처 요청 */
export interface BulkRequest {
  kind: "bulk";
  urls: string[];
  viewport: ViewportPreset;
  theme: Theme;
  sendToBridge?: boolean;
  bridgeCode?: string;
  relayUrl?: string;
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

/** background → popup 벌크 완료 */
export interface BulkDone {
  kind: "bulk-done";
  bundle: H2FBundle;
  errors: { url: string; message: string }[];
  bridgeSent?: boolean;
}

/** background → popup 실패 */
export interface CaptureError {
  kind: "error";
  message: string;
}

export type PopupToBackground = CaptureRequest | BulkRequest;
export type BackgroundToPopup = CaptureProgress | CaptureDone | BulkDone | CaptureError;
