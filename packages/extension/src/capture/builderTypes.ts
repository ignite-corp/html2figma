import type { H2FNode, FrameNode } from "@html2figma/shared";

export interface SvgRequest {
  assetId: string;
  backendNodeId: number;
}

/** background-image 로 지정된 SVG(url). 벡터 자식으로 렌더하기 위해 마크업을 별도로 받는다. */
export interface SvgUrlRequest {
  assetId: string;
  url: string;
}

export interface BuildResult {
  root: H2FNode | null;
  imageUrls: Set<string>;
  svgRequests: SvgRequest[];
  svgUrlRequests: SvgUrlRequest[];
  /** data-h2f-el 속성값 → 해당 요소의 프레임 노드. 의사요소 아이콘을 호스트 안에 넣기 위함. */
  hostFrames: Map<string, FrameNode>;
}

export interface BuildCtx {
  nextId(): string;
  resolveUrl(url: string): string;
  imageUrls: Set<string>;
  svgRequests: SvgRequest[];
  svgUrlRequests: SvgUrlRequest[];
  hostFrames: Map<string, FrameNode>;
}
