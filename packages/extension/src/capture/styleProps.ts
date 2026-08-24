/**
 * DOMSnapshot.captureSnapshot 에 요청할 computed style 목록.
 * 순서가 곧 응답 styles 배열의 인덱스가 된다.
 */
export const COMPUTED_STYLES = [
  "display",
  "visibility",
  "opacity",
  "overflow",
  "overflow-x",
  "overflow-y",

  // 배경
  "background-color",
  "background-image",
  "background-size",
  "background-repeat",

  // 테두리
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",

  // 그림자
  "box-shadow",

  // 레이아웃 (Auto Layout 매핑용)
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "row-gap",
  "column-gap",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",

  // 텍스트
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration-line",
  "text-transform",

  // 폼 컨트롤(radio/checkbox) accent 색 재구성용
  "accent-color",
  // appearance:none 커스텀 컨트롤은 브라우저가 네이티브 외형을 그리지 않으므로
  // 합성(검은 링 등)을 건너뛰기 위한 판별용
  "appearance",
  "-webkit-appearance",
] as const;

export type ComputedStyleName = (typeof COMPUTED_STYLES)[number];
export type ComputedStyleMap = Partial<Record<ComputedStyleName, string>>;
