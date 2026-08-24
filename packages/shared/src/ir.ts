/**
 * .h2f 중간표현(IR) 스펙
 *
 * 크롬 익스텐션(캡처)과 Figma 플러그인(렌더)이 공유하는 직렬화 가능한 문서 포맷.
 * 모든 좌표는 페이지 기준 절대좌표(px). 색상은 0..1 정규화 RGBA.
 */

export const H2F_VERSION = "0.1.0" as const;

export interface H2FDocument {
  version: string;
  meta: CaptureMeta;
  /** 캡처된 루트 노드 (보통 페이지 프레임) */
  root: H2FNode;
  /** id -> 에셋(이미지/폰트) */
  assets: AssetMap;
}

/** .h2f 파일에 담길 수 있는 최상위 형태 (단일 문서) */
export type H2FFile = H2FDocument;

export interface CaptureMeta {
  url: string;
  title: string;
  /** ISO 8601 */
  capturedAt: string;
  viewport: Viewport;
}

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
  /** 사전 정의 프리셋 이름 (예: 'desktop', 'tablet', 'mobile') */
  preset?: string;
}

/* ------------------------------------------------------------------ */
/* 노드                                                                */
/* ------------------------------------------------------------------ */

export type H2FNodeType = "frame" | "text" | "image" | "vector";

export type H2FNode = FrameNode | TextNode | ImageNode | VectorNode;

export interface BaseNode {
  id: string;
  name: string;
  type: H2FNodeType;
  layout: Layout;
  style: Style;
}

export interface FrameNode extends BaseNode {
  type: "frame";
  children: H2FNode[];
}

export interface TextNode extends BaseNode {
  type: "text";
  characters: string;
  text: TextStyle;
  /**
   * 인라인 서식(<b>/<span> 등)이 섞인 텍스트에서, 기본 스타일(text)과 다른 구간만
   * range 스타일로 표현한다. start/end 는 characters 기준 문자 오프셋(end 는 배타적).
   * 지정 시 플러그인이 setRange* 로 해당 구간에 개별 스타일을 적용한다.
   */
  segments?: TextSegment[];
}

export interface TextSegment {
  start: number;
  end: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: number;
  fontSize?: number;
  letterSpacing?: number;
  color?: RGBA;
  textDecoration?: "none" | "underline" | "strikethrough";
}

export interface ImageNode extends BaseNode {
  type: "image";
  assetId: string;
}

/** 인라인 SVG를 벡터로 렌더 (assetId → SvgAsset) */
export interface VectorNode extends BaseNode {
  type: "vector";
  assetId: string;
}

/* ------------------------------------------------------------------ */
/* 레이아웃                                                            */
/* ------------------------------------------------------------------ */

export interface Layout {
  /** 페이지 기준 절대좌표(px) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** flex/grid → Auto Layout 매핑 (Phase 9) */
  autoLayout?: AutoLayout;
  /**
   * 스태킹(paint) 순서. 값이 작을수록 먼저(아래) 그려진다.
   * DOMSnapshot 의 paintOrders 에서 유래하며, z-index/absolute 로 인해
   * DOM 순서와 다를 수 있으므로 렌더 시 이 값으로 형제를 정렬한다.
   */
  order?: number;
}

export interface AutoLayout {
  direction: "horizontal" | "vertical";
  gap: number;
  padding: EdgeInsets;
  primaryAlign: "min" | "center" | "max" | "space-between";
  counterAlign: "min" | "center" | "max";
}

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/* ------------------------------------------------------------------ */
/* 스타일                                                              */
/* ------------------------------------------------------------------ */

export interface Style {
  opacity?: number;
  /** 배경 (여러 겹 가능) */
  fills?: Paint[];
  /** 테두리 */
  strokes?: Stroke[];
  cornerRadius?: CornerRadius;
  /** box-shadow */
  effects?: Effect[];
  clipsContent?: boolean;
  /** local style 참조 (Phase 10). 존재하면 fills 대신 스타일 매칭에 사용 */
  fillStyleKey?: string;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type Paint = SolidPaint | GradientPaint | ImagePaint;

export interface SolidPaint {
  type: "solid";
  color: RGBA;
}

export interface GradientPaint {
  type: "gradient-linear" | "gradient-radial";
  stops: GradientStop[];
  /** linear 기준 각도(도). 0=위→아래 (CSS 기준) */
  angle?: number;
}

export interface GradientStop {
  position: number; // 0..1
  color: RGBA;
}

export interface ImagePaint {
  type: "image";
  assetId: string;
  scaleMode: "fill" | "fit" | "tile" | "stretch";
}

export interface Stroke {
  color: RGBA;
  weight: number;
  align?: "inside" | "outside" | "center";
  /** 상/우/하/좌 개별 두께 (비대칭 border 대응) */
  perSide?: EdgeInsets;
}

export interface CornerRadius {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

export interface Effect {
  type: "drop-shadow" | "inner-shadow";
  color: RGBA;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

/* ------------------------------------------------------------------ */
/* 텍스트                                                              */
/* ------------------------------------------------------------------ */

export interface TextStyle {
  fontFamily: string;
  /** 'Regular' | 'Bold' | 'Italic' 등 Figma 스타일명 (플러그인에서 최종 매핑) */
  fontStyle: string;
  fontWeight: number;
  fontSize: number;
  /** px, 미지정 시 auto */
  lineHeight?: number;
  /** px */
  letterSpacing?: number;
  color: RGBA;
  textAlign?: "left" | "center" | "right" | "justify";
  textDecoration?: "none" | "underline" | "strikethrough";
  textCase?: "original" | "upper" | "lower" | "title";
  /** local text style 참조 (Phase 10) */
  textStyleKey?: string;
}

/* ------------------------------------------------------------------ */
/* 에셋                                                                */
/* ------------------------------------------------------------------ */

export interface AssetMap {
  [id: string]: Asset;
}

export type Asset = ImageAsset | FontAsset | SvgAsset;

export interface ImageAsset {
  kind: "image";
  mime: string;
  /** data:... 없이 base64 페이로드만 */
  dataBase64: string;
  width?: number;
  height?: number;
}

export interface FontAsset {
  kind: "font";
  family: string;
  weight?: number;
  style?: string;
  src?: string;
  dataBase64?: string;
}

export interface SvgAsset {
  kind: "svg";
  /** <svg>...</svg> 원본 마크업 */
  markup: string;
}
