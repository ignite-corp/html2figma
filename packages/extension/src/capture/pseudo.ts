import { parseCssColor, type AssetMap } from "@html2figma/shared";
import type { H2FNode, FrameNode } from "@html2figma/shared";
import { CdpSession } from "./cdp.js";

export interface PseudoIcon {
  url?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  svg: boolean;
  hostId?: string;
  /** 아이콘이 아닌 단색 박스(밑줄·구분선 등)의 배경색 CSS 문자열 */
  bg?: string;
  /** border-radius (px) */
  radius?: number;
  /** border 만 있는 pseudo(테두리 오버레이) 의 색/두께 */
  borderColor?: string;
  borderWidth?: number;
}

/**
 * 스냅샷 전에 모든 요소에 data-h2f-el 식별자를 부여한다.
 * 이후 의사요소 아이콘을 그 호스트 프레임 안에 정확히 넣기 위한 매칭 키로 쓰인다.
 */
export async function tagElements(session: CdpSession): Promise<void> {
  const tagger = function () {
    const els = document.querySelectorAll("*");
    for (let i = 0; i < els.length; i++) {
      els[i].setAttribute("data-h2f-el", String(i));
    }
  };
  try {
    await session.send("Runtime.evaluate", {
      expression: `(${tagger.toString()})()`,
    });
  } catch {
    /* 태깅 실패 시 아이콘은 루트에 얹힌다(폴백) */
  }
}

/**
 * ::before/::after 의사요소의 background-image(또는 content url)를 수집.
 * DOMSnapshot 은 의사요소를 포함하지 않아 아이콘이 유실되므로 페이지에서 직접 측정한다.
 * 좌표는 document 기준 CSS px (스냅샷 정규화 좌표와 동일 단위).
 */
export async function collectPseudoIcons(session: CdpSession): Promise<PseudoIcon[]> {
  const collector = function () {
    const out: {
      url?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      svg: boolean;
      hostId?: string;
      bg?: string;
      radius?: number;
      borderColor?: string;
      borderWidth?: number;
    }[] = [];
    const els = document.querySelectorAll("*");
    const MAX = 400;
    // 호스트가 overflow hidden/clip/scroll 조상에 의해 잘려 실제로는 안 보이는지 판정한다.
    // (예: max-height:0; overflow:hidden 으로 접힌 아코디언 안의 항목) 빌더는 이런 요소를
    // 클립으로 제거하지만, 의사요소는 페이지에서 클립과 무관하게 수집되므로 여기서 걸러야
    // 유령 아이콘(접힌 트림 목록의 체크 아이콘 등)이 루트에 얹히는 것을 막을 수 있다.
    const isClippedAway = function (el: Element): boolean {
      const box = el.getBoundingClientRect();
      let node = el.parentElement;
      while (node) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden") return true;
        const clip = /hidden|clip|scroll|auto/;
        const cx = clip.test(cs.overflowX || cs.overflow);
        const cy = clip.test(cs.overflowY || cs.overflow);
        if (cx || cy) {
          const nr = node.getBoundingClientRect();
          if ((cx && nr.width <= 0) || (cy && nr.height <= 0)) return true;
          if (cy && (box.bottom <= nr.top || box.top >= nr.bottom)) return true;
          if (cx && (box.right <= nr.left || box.left >= nr.right)) return true;
        }
        node = node.parentElement;
      }
      return false;
    };
    for (let i = 0; i < els.length && out.length < MAX; i++) {
      const el = els[i] as Element;
      if (isClippedAway(el)) continue;
      for (const p of ["::before", "::after"]) {
        const cs = getComputedStyle(el, p);
        if (!cs || cs.display === "none") continue;
        if (parseFloat(cs.opacity) === 0) continue;
        if (cs.visibility === "hidden") continue;
        if (cs.content === "none" || cs.content === "normal" || !cs.content) continue;
        let url: string | null = null;
        // url("...") 안의 값을 안전하게 추출한다. URL 인코딩된 SVG data URL 은 내부에
        // 작은따옴표(xmlns='...')를 포함하므로 [^"')]+ 로 뽑으면 첫 따옴표에서 잘린다.
        // 따옴표 종류에 맞춰 닫는 따옴표까지 통째로 캡처한다.
        const extractUrl = (v: string): string | null => {
          if (!v) return null;
          let m = v.match(/url\(\s*"([^"]*)"\s*\)/);
          if (m) return m[1];
          m = v.match(/url\(\s*'([^']*)'\s*\)/);
          if (m) return m[1];
          m = v.match(/url\(\s*([^)]*?)\s*\)/);
          return m ? m[1] : null;
        };
        if (cs.backgroundImage && cs.backgroundImage !== "none") url = extractUrl(cs.backgroundImage);
        if (!url) url = extractUrl(cs.content);
        // 아이콘(background-image/content url)이 없으면 눈에 보이는 단색 배경
        // (밑줄·구분선 등) 또는 테두리(버튼 border 를 ::before content:"" 로 그리는 패턴)
        // 인지 확인한다. 배경/테두리 모두 없으면(clearfix 등) 건너뛴다.
        let solidBg: string | null = null;
        let radius = 0;
        let borderColor: string | null = null;
        let borderWidth = 0;
        if (!url) {
          const bc = cs.backgroundColor;
          const am = bc && bc.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (am) {
            const parts = am[1].split(",").map((s) => parseFloat(s));
            if (parts.length >= 4) alpha = parts[3];
          }
          const bgVisible = !!bc && bc !== "transparent" && alpha > 0;
          if (bgVisible) solidBg = bc;
          // 테두리 감지(4변 동일 가정: 대표로 top 사용)
          const bw = parseFloat(cs.borderTopWidth) || 0;
          const bCol = cs.borderTopColor;
          const bam = bCol && bCol.match(/rgba?\(([^)]+)\)/);
          let bAlpha = 1;
          if (bam) {
            const bparts = bam[1].split(",").map((s) => parseFloat(s));
            if (bparts.length >= 4) bAlpha = bparts[3];
          }
          const borderVisible =
            bw > 0 && cs.borderTopStyle !== "none" && bCol !== "transparent" && bAlpha > 0;
          if (borderVisible) {
            borderColor = bCol;
            borderWidth = bw;
          }
          if (!bgVisible && !borderVisible) continue;
          radius = parseFloat(cs.borderTopLeftRadius) || 0;
        }
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        let w = parseFloat(cs.width);
        let h = parseFloat(cs.height);
        if (!(w > 0)) w = rect.width;
        if (!(h > 0)) h = rect.height;
        // 아이콘은 거대한 장식 배경 오버레이 제외. 단색 박스(밑줄)는 얇고 넓을 수
        // 있으므로 면적이 아주 큰 전면 오버레이만 제외한다.
        if (url) {
          if (w > 600 || h > 600) continue;
        } else {
          if (w * h > 600 * 600) continue;
        }
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        // ::before/::after 는 대개 position:absolute 로 특정 위치(오른쪽 화살표 등)에 놓인다.
        // 호스트 박스 중앙에 두면 위치가 어긋나므로, 절대 오프셋(left/right/top/bottom)과
        // transform translate 를 반영해 실제 위치를 계산한다. 오프셋이 없으면 중앙 정렬로 폴백.
        const num = (v: string) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };
        const isAuto = (v: string) => !v || v === "auto";
        const posT = cs.position;
        const left = num(cs.left),
          right = num(cs.right),
          top = num(cs.top),
          bottom = num(cs.bottom);
        let x: number, y: number;
        if (posT === "absolute" || posT === "fixed") {
          if (!isAuto(cs.left) && left != null) x = rect.left + sx + left;
          else if (!isAuto(cs.right) && right != null)
            x = rect.left + rect.width + sx - right - w;
          else x = rect.left + sx + (rect.width - w) / 2;
          if (!isAuto(cs.top) && top != null) y = rect.top + sy + top;
          else if (!isAuto(cs.bottom) && bottom != null)
            y = rect.top + rect.height + sy - bottom - h;
          else y = rect.top + sy + (rect.height - h) / 2;
        } else {
          // 정적/상대 배치 의사요소는 인라인 흐름의 시작(콘텐츠 앞)에 온다(예: 좋아요 하트,
          // 메뉴 불릿). 첫 줄 라인박스에 얹히는데, 호스트가 flex align-items:center 등으로
          // 콘텐츠를 세로 중앙 정렬하면 첫 줄이 호스트 상단이 아니라 중앙에 온다. lineHeight
          // 만으로 rect.top 기준 중앙을 잡으면 불릿이 위로 치우치므로(메뉴 dot 이 텍스트보다
          // 위로 뜸), 호스트의 실제 텍스트 첫 줄 rect(Range)로 세로 위치를 맞춘다.
          const hostCs = getComputedStyle(el);
          const padL = parseFloat(hostCs.paddingLeft) || 0;
          const lhNum = parseFloat(hostCs.lineHeight);
          const lineH = Number.isFinite(lhNum) ? lhNum : rect.height;
          let lineTop = rect.top;
          let lineBoxH = Math.min(lineH, rect.height);
          try {
            const rng = document.createRange();
            rng.selectNodeContents(el);
            const rs = rng.getClientRects();
            if (rs && rs.length > 0 && rs[0].height > 0) {
              lineTop = rs[0].top;
              lineBoxH = rs[0].height;
            }
          } catch {
            /* Range 실패 시 lineHeight 기반 폴백 */
          }
          x = rect.left + sx + padL;
          y = lineTop + sy + Math.max(0, (lineBoxH - h) / 2);
          if (posT === "relative") {
            if (!isAuto(cs.left) && left != null) x += left;
            if (!isAuto(cs.top) && top != null) y += top;
          }
        }
        // transform 의 translate 성분 반영(matrix / matrix3d)
        const tm = cs.transform;
        if (tm && tm !== "none") {
          const m2 = tm.match(/matrix\(([^)]+)\)/);
          if (m2) {
            const parts = m2[1].split(",").map((s) => parseFloat(s));
            if (parts.length >= 6) {
              x += parts[4];
              y += parts[5];
            }
          } else {
            const m3 = tm.match(/matrix3d\(([^)]+)\)/);
            if (m3) {
              const parts = m3[1].split(",").map((s) => parseFloat(s));
              if (parts.length >= 14) {
                x += parts[12];
                y += parts[13];
              }
            }
          }
        }
        const svg = !!url && (/^data:image\/svg\+xml/i.test(url) || /\.svg(\?|$)/i.test(url));
        const hostId = (el as HTMLElement).getAttribute("data-h2f-el") || undefined;
        out.push({
          url: url || undefined,
          x,
          y,
          w,
          h,
          svg,
          hostId,
          bg: solidBg || undefined,
          radius: radius || undefined,
          borderColor: borderColor || undefined,
          borderWidth: borderWidth || undefined,
        });
      }
    }
    return JSON.stringify(out);
  };
  try {
    const res = await session.send<{ result?: { value?: string } }>("Runtime.evaluate", {
      expression: `(${collector.toString()})()`,
      returnByValue: true,
    });
    const json = res?.result?.value;
    return json ? (JSON.parse(json) as PseudoIcon[]) : [];
  } catch {
    return [];
  }
}

/** SVG url(data: 또는 원격)을 마크업 텍스트로 변환 */
export async function fetchSvgMarkup(url: string): Promise<string | null> {
  try {
    let text: string;
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      const meta = url.slice(5, comma);
      const data = url.slice(comma + 1);
      text = /;base64/i.test(meta) ? atob(data) : decodeURIComponent(data);
    } else {
      const res = await fetch(url);
      if (!res.ok) return null;
      text = await res.text();
    }
    return /<svg[\s>]/i.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** 수집한 의사요소 아이콘을 IR 노드로 만들어 root 에 얹는다(맨 위). svg 에셋은 assetsOut 에 채운다. */
export async function applyPseudoIcons(
  icons: PseudoIcon[],
  root: H2FNode,
  imageUrls: Set<string>,
  assetsOut: AssetMap,
  hostFrames: Map<string, FrameNode>
): Promise<void> {
  if (root.type !== "frame") return;
  const rootFrame = root as FrameNode;
  let n = 0;
  for (const p of icons) {
    const layout = { x: p.x, y: p.y, width: p.w, height: p.h };
    // 아이콘을 호스트 요소의 프레임 안에 넣는다(예: 버튼의 화살표). 좌표는 절대값이며
    // 렌더 시 부모 기준으로 상대화되므로 부모만 바꿔 넣으면 된다. 호스트가 없으면 루트에 얹는다.
    const target = (p.hostId && hostFrames.get(p.hostId)) || rootFrame;
    if (!p.url && (p.bg || p.borderWidth)) {
      // 아이콘이 아닌 단색 박스(밑줄·구분선) 또는 테두리 오버레이(::before content:"" 로
      // 버튼 border 를 그리는 패턴). 배경 fill + border stroke 를 프레임으로 렌더한다.
      const style: H2FNode["style"] = {};
      if (p.bg) {
        const color = parseCssColor(p.bg);
        if (color && color.a > 0) style.fills = [{ type: "solid", color }];
      }
      if (p.borderWidth && p.borderColor) {
        const bColor = parseCssColor(p.borderColor);
        if (bColor && bColor.a > 0) {
          style.strokes = [{ color: bColor, weight: p.borderWidth, align: "inside" }];
        }
      }
      if (!style.fills && !style.strokes) continue;
      if (p.radius) {
        style.cornerRadius = { tl: p.radius, tr: p.radius, br: p.radius, bl: p.radius };
      }
      target.children.push({
        id: `pseudo${n}`,
        name: style.strokes ? "border" : "line",
        type: "frame",
        layout,
        style,
        children: [],
      });
    } else if (p.svg && p.url) {
      const markup = await fetchSvgMarkup(p.url);
      if (!markup) continue;
      const assetId = `pseudo-svg:${n}`;
      assetsOut[assetId] = { kind: "svg", markup };
      target.children.push({
        id: `pseudo${n}`,
        name: "icon",
        type: "vector",
        layout,
        style: {},
        assetId,
      });
    } else if (p.url) {
      imageUrls.add(p.url);
      target.children.push({
        id: `pseudo${n}`,
        name: "icon",
        type: "image",
        layout,
        style: {},
        assetId: p.url,
      });
    }
    n++;
  }
}
