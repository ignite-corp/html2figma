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
    }[] = [];
    const els = document.querySelectorAll("*");
    const MAX = 400;
    for (let i = 0; i < els.length && out.length < MAX; i++) {
      const el = els[i] as Element;
      for (const p of ["::before", "::after"]) {
        const cs = getComputedStyle(el, p);
        if (!cs || cs.display === "none") continue;
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
        // (밑줄·구분선 등)인지 확인한다. 배경도 없으면(clearfix 등) 건너뛴다.
        let solidBg: string | null = null;
        let radius = 0;
        if (!url) {
          const bc = cs.backgroundColor;
          const am = bc && bc.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (am) {
            const parts = am[1].split(",").map((s) => parseFloat(s));
            if (parts.length >= 4) alpha = parts[3];
          }
          const visible = !!bc && bc !== "transparent" && alpha > 0;
          if (!visible) continue;
          solidBg = bc;
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
          // 정적/상대 배치 의사요소는 인라인 흐름의 시작(콘텐츠 앞)에 온다(예: 좋아요 하트).
          // 호스트 박스 중앙에 두면(특히 넓은 한 줄 텍스트) 위치가 크게 어긋나므로,
          // 콘텐츠 좌측 + 첫 줄 세로 중앙으로 배치한다. relative 면 left/top 오프셋을 더한다.
          const hostCs = getComputedStyle(el);
          const padL = parseFloat(hostCs.paddingLeft) || 0;
          const lhNum = parseFloat(hostCs.lineHeight);
          const lineH = Number.isFinite(lhNum) ? lhNum : rect.height;
          x = rect.left + sx + padL;
          y = rect.top + sy + Math.max(0, (Math.min(lineH, rect.height) - h) / 2);
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
    if (!p.url && p.bg) {
      // 아이콘이 아닌 단색 박스(밑줄·구분선 등). 프레임에 solid fill 로 렌더한다.
      const color = parseCssColor(p.bg);
      if (!color || color.a === 0) continue;
      const style: H2FNode["style"] = { fills: [{ type: "solid", color }] };
      if (p.radius) {
        style.cornerRadius = { tl: p.radius, tr: p.radius, br: p.radius, bl: p.radius };
      }
      target.children.push({
        id: `pseudo${n}`,
        name: "line",
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
