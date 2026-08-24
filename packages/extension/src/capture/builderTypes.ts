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
  /**
   * `position: fixed` 요소의 프레임. fixed 요소는 뷰포트 기준이라 전체 페이지 캡처에서
   * 문서보다 작게 남는다(모달 딤드가 우측/하단을 못 덮는 문제). 루트 크기가 확정된 뒤
   * 뷰포트를 꽉 덮는 것만 골라 늘리기 위해 모아둔다.
   */
  fixedFrames: FrameNode[];
  /**
   * body 가 가로 오버플로를 잘라내는지(overflow-x: hidden|clip).
   * true 면 콘텐츠가 뷰포트보다 넓어도 사용자는 볼 수 없으므로, 루트 폭을 콘텐츠 폭까지
   * 넓히면 안 된다(닿지 않는 유령 영역이 생겨 딤드가 못 덮는다).
   */
  bodyClipsX: boolean;
}

export interface BuildCtx {
  nextId(): string;
  resolveUrl(url: string): string;
  imageUrls: Set<string>;
  svgRequests: SvgRequest[];
  svgUrlRequests: SvgUrlRequest[];
  hostFrames: Map<string, FrameNode>;
  fixedFrames: FrameNode[];
}
