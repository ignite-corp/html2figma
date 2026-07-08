import type { TextNode, TextSegment, TextStyle, Layout, RGBA } from "@html2figma/shared";
import type { RawNode } from "./snapshot.js";
import type { BuildCtx } from "./builderTypes.js";
import { parsePx } from "@html2figma/shared";
import { mapTextStyle } from "./style.js";
import { layoutOf, layoutFromRawLayout } from "./builderHelpers.js";

export function buildText(
  ctx: BuildCtx,
  parent: RawNode,
  text: string,
  tl: RawNode["layout"],
  ox: number,
  oy: number
): TextNode | null {
  const frag = tl ? layoutFromRawLayout(tl, ox, oy) : null;
  const box = layoutOf(parent, ox, oy);
  const base = frag ?? box;
  if (!base) return null;
  const styleSource = parent.layout?.styles ?? {};
  // 줄바꿈 폭은 부모 요소의 콘텐츠 박스 폭을 쓴다(브라우저가 실제로 텍스트를 흘린 폭).
  let width = base.width;
  if (box) {
    const padR = parsePx(styleSource["padding-right"]);
    const avail = box.x + box.width - padR - base.x;
    if (avail > width) width = avail;
  }
  const layout: Layout = {
    x: base.x,
    y: base.y,
    width: Math.max(1, width),
    height: base.height,
    order: base.order,
  };
  return {
    id: ctx.nextId(),
    name: text.slice(0, 24) || "text",
    type: "text",
    layout,
    style: {},
    characters: text,
    text: mapTextStyle(styleSource),
  };
}

/**
 * 직접 텍스트 자식들을 텍스트 노드로 만든다. 사이에 요소(인라인 <strong>/<span>/<br> 등)가
 * 없는 "연속된" 텍스트 노드들은 하나로 병합한다.
 */
export function buildDirectTexts(ctx: BuildCtx, node: RawNode, ox: number, oy: number): TextNode[] {
  const out: TextNode[] = [];
  let parts: string[] = [];
  let firstLayout: RawNode["layout"];
  // 인라인 형제 요소(<b>/<span> 등)와 접한 쪽의 공백은 브라우저가 실제로 렌더하므로
  // 유지한다. 조각은 자기 레이아웃 박스의 좌측에 정렬되는데, 그 박스에는 인접 공백이
  // 포함돼 있어(예: " 건") 공백을 지우면 숫자·텍스트가 붙어버린다.
  let leadingElem = false;
  const flush = (trailingElem: boolean) => {
    let text = parts.join("").replace(/\s+/g, " ");
    const fl = firstLayout;
    const hadLead = leadingElem;
    parts = [];
    firstLayout = undefined;
    leadingElem = trailingElem;
    if (!hadLead) text = text.replace(/^\s+/, ""); // 부모 콘텐츠 앞쪽(소스 들여쓰기) 공백 제거
    if (!trailingElem) text = text.replace(/\s+$/, ""); // 부모 콘텐츠 뒤쪽 공백 제거
    if (!text.trim()) return; // 공백뿐인 조각은 스킵
    const t = buildText(ctx, node, text, fl, ox, oy);
    if (t) out.push(t);
  };
  for (const c of node.children) {
    if (c.nodeType === 3) {
      if (!firstLayout && c.layout) firstLayout = c.layout;
      parts.push(c.layout?.text ?? c.nodeValue);
    } else {
      flush(true);
    }
  }
  flush(false);
  return out;
}

/* ------------------------------------------------------------------ */
/* 인라인 서식(<b>/<span> 등)이 섞인 텍스트 → 단일 노드 + range 스타일     */
/* ------------------------------------------------------------------ */

// 텍스트 흐름 안의 서식 요소(phrasing). 이 안에 IMG/SVG/INPUT/SELECT/블록이 없어야 병합한다.
const INLINE_PHRASING = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "INS", "SMALL", "MARK",
  "SUB", "SUP", "SPAN", "A", "CODE", "ABBR", "CITE", "Q", "TIME", "BDI", "BDO", "WBR",
]);

function isInlinePhrasingOnly(node: RawNode): boolean {
  for (const c of node.children) {
    if (c.nodeType !== 1) continue;
    if (c.nodeName === "BR") continue;
    if (!INLINE_PHRASING.has(c.nodeName)) return false;
    if (!isInlinePhrasingOnly(c)) return false;
  }
  return true;
}

/**
 * "텍스트 + 인라인 서식 요소" 가 섞인 컨테이너인지 판단한다. 이 경우에만 하나의 텍스트 노드로
 * 병합해(굵게 등은 range 스타일) Figma 가 자연스럽게 흘리도록 한다. 조각을 절대좌표로 나눠
 * 배치하면 대체 폰트 폭 차이로 앞 텍스트가 뒤 요소를 덮어 공백이 사라지는 문제를 없앤다.
 * 순수 래퍼(<td><span>…</span>)처럼 직접 텍스트가 없으면 기존 동작을 유지한다.
 */
export function isInlineTextContainer(node: RawNode): boolean {
  if (node.nodeType !== 1) return false;
  const hasDirectText = node.children.some(
    (c) => c.nodeType === 3 && (c.layout?.text ?? c.nodeValue).trim().length > 0
  );
  if (!hasDirectText) return false;
  const hasInlineEl = node.children.some((c) => c.nodeType === 1 && INLINE_PHRASING.has(c.nodeName));
  if (!hasInlineEl) return false;
  for (const c of node.children) {
    if (c.nodeType !== 1) continue;
    if (c.nodeName === "BR") continue;
    if (!INLINE_PHRASING.has(c.nodeName)) return false;
    if (!isInlinePhrasingOnly(c)) return false;
  }
  return true;
}

function sameColor(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/** 컨테이너의 모든 텍스트/인라인 요소를 하나의 텍스트 노드로 병합(기본 스타일과 다른 구간만 segment). */
export function buildInlineText(ctx: BuildCtx, node: RawNode, ox: number, oy: number): TextNode | null {
  const baseStyle = mapTextStyle(node.layout?.styles ?? {});
  const tokens: { raw: string; br?: boolean; style: TextStyle }[] = [];
  const boxes: Layout[] = [];
  const walk = (n: RawNode, style: TextStyle) => {
    for (const c of n.children) {
      if (c.nodeType === 3) {
        const t = c.layout?.text ?? c.nodeValue;
        if (t) tokens.push({ raw: t, style });
        if (c.layout) {
          const b = layoutFromRawLayout(c.layout, ox, oy);
          if (b) boxes.push(b);
        }
      } else if (c.nodeType === 1) {
        if (c.nodeName === "BR") {
          tokens.push({ raw: "", br: true, style });
          continue;
        }
        const cs = c.layout?.styles ? mapTextStyle(c.layout.styles) : style;
        if (c.layout) {
          const b = layoutFromRawLayout(c.layout, ox, oy);
          if (b) boxes.push(b);
        }
        walk(c, cs);
      }
    }
  };
  walk(node, baseStyle);

  // HTML 인라인 공백 축약: 연속 공백 1칸, 요소 경계 공백은 1칸으로 합침, 양끝/개행 뒤 리딩 공백 제거.
  let out = "";
  let atStart = true;
  let pendingSpace = false;
  const rawSegs: { start: number; end: number; style: TextStyle }[] = [];
  for (const tk of tokens) {
    if (tk.br) {
      out += "\n";
      pendingSpace = false;
      atStart = true;
      continue;
    }
    const s = tk.raw.replace(/[ \t\r\n\f]+/g, " ");
    const lead = s.startsWith(" ");
    const trail = s.endsWith(" ");
    const core = s.trim();
    if (!core) {
      if (!atStart) pendingSpace = true;
      continue;
    }
    const prefix = (lead || pendingSpace) && !atStart ? " " : "";
    out += prefix;
    const start = out.length;
    out += core;
    rawSegs.push({ start, end: out.length, style: tk.style });
    pendingSpace = trail;
    atStart = false;
  }
  if (!out) return null;

  // 레이아웃: 조각 박스들의 합집합 좌상단을 시작점으로, 줄바꿈 폭은 컨테이너 콘텐츠 박스까지.
  const st = node.layout?.styles ?? {};
  const pad = (k: string) => parsePx((st as Record<string, string>)[k]);
  const container = layoutOf(node, ox, oy);
  let x: number, y: number, width: number, height: number, order: number | undefined;
  if (boxes.length) {
    x = Math.min(...boxes.map((b) => b.x));
    y = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    let right = Math.max(...boxes.map((b) => b.x + b.width));
    order = Math.min(...boxes.map((b) => b.order ?? 0));
    if (container) {
      const cRight =
        container.x + container.width - pad("border-right-width") - pad("padding-right");
      if (cRight > right) right = cRight;
    }
    width = Math.max(1, right - x);
    height = Math.max(1, bottom - y);
  } else if (container) {
    const bl = pad("border-left-width"), br = pad("border-right-width");
    const bt = pad("border-top-width"), bb = pad("border-bottom-width");
    x = container.x + bl + pad("padding-left");
    y = container.y + bt + pad("padding-top");
    width = Math.max(1, container.width - bl - br - pad("padding-left") - pad("padding-right"));
    height = Math.max(1, container.height - bt - bb - pad("padding-top") - pad("padding-bottom"));
    order = container.order;
  } else {
    return null;
  }

  const segments: TextSegment[] = [];
  for (const rs of rawSegs) {
    const s2 = rs.style;
    const diffWeight = s2.fontWeight !== baseStyle.fontWeight || s2.fontStyle !== baseStyle.fontStyle;
    const diffFam = s2.fontFamily !== baseStyle.fontFamily;
    const diffColor = !sameColor(s2.color, baseStyle.color);
    const diffDec = s2.textDecoration !== baseStyle.textDecoration;
    const diffSize = s2.fontSize !== baseStyle.fontSize;
    const diffLs = (s2.letterSpacing ?? null) !== (baseStyle.letterSpacing ?? null);
    if (!(diffWeight || diffFam || diffColor || diffDec || diffSize || diffLs)) continue;
    segments.push({
      start: rs.start,
      end: rs.end,
      fontFamily: diffFam ? s2.fontFamily : undefined,
      fontStyle: diffWeight || diffFam ? s2.fontStyle : undefined,
      fontWeight: diffWeight || diffFam ? s2.fontWeight : undefined,
      fontSize: diffSize ? s2.fontSize : undefined,
      letterSpacing: diffLs ? s2.letterSpacing : undefined,
      color: diffColor ? s2.color : undefined,
      textDecoration: diffDec ? s2.textDecoration : undefined,
    });
  }

  return {
    id: ctx.nextId(),
    name: out.slice(0, 24) || "text",
    type: "text",
    layout: { x, y, width, height, order },
    style: {},
    characters: out,
    text: baseStyle,
    segments: segments.length ? segments : undefined,
  };
}

/** input/textarea 의 value 또는 placeholder 를 텍스트 노드로 합성 */
const NON_TEXT_INPUT = new Set([
  "range", "checkbox", "radio", "hidden", "file", "color", "image",
]);

export function buildInputText(ctx: BuildCtx, node: RawNode, ox: number, oy: number): TextNode | null {
  if (node.nodeName !== "INPUT" && node.nodeName !== "TEXTAREA") return null;
  // range/checkbox/color 등은 value 가 화면에 보이는 텍스트가 아니므로 텍스트로 렌더하지 않는다.
  // (range 는 슬라이더 thumb, checkbox/radio 는 체크 표시로 별도 합성됨)
  if (node.nodeName === "INPUT") {
    const type = (node.attributes["type"] ?? "text").toLowerCase();
    if (NON_TEXT_INPUT.has(type)) return null;
  }
  const value = node.attributes["value"];
  const placeholder = node.attributes["placeholder"];
  const hasValue = !!value && value.trim().length > 0;
  const text = hasValue ? value : placeholder;
  if (!text || !text.trim()) return null;

  const box = layoutOf(node, ox, oy);
  if (!box) return null;
  const styles = node.layout!.styles;
  const padL = parsePx(styles["padding-left"]);
  const padR = parsePx(styles["padding-right"]);
  const padT = parsePx(styles["padding-top"]);
  const padB = parsePx(styles["padding-bottom"]);
  const ts = mapTextStyle(styles);
  // placeholder 는 보통 흐린 회색(::placeholder). 별도 캡처가 어려우므로 근사값 사용.
  const color = hasValue ? ts.color : { r: 0.46, g: 0.46, b: 0.46, a: 1 };

  return {
    id: ctx.nextId(),
    name: text.slice(0, 24) || "text",
    type: "text",
    layout: {
      x: box.x + padL,
      y: box.y + padT,
      width: Math.max(1, box.width - padL - padR),
      height: Math.max(1, box.height - padT - padB),
      order: box.order,
    },
    style: {},
    characters: text,
    text: { ...ts, color },
  };
}

/** SELECT 요소의 선택된 텍스트와 ▾ 드롭다운 화살표를 텍스트 노드로 합성 */
export function buildSelectText(ctx: BuildCtx, node: RawNode, ox: number, oy: number): TextNode[] {
  if (node.nodeName !== "SELECT") return [];

  function collectOptions(children: RawNode[]): RawNode[] {
    const opts: RawNode[] = [];
    for (const c of children) {
      if (c.nodeName === "OPTION") opts.push(c);
      else if (c.nodeName === "OPTGROUP") opts.push(...collectOptions(c.children));
    }
    return opts;
  }
  const allOptions = collectOptions(node.children);

  let text = "";
  for (const opt of allOptions) {
    if (opt.attributes["selected"] != null) {
      text = opt.children.find((t) => t.nodeType === 3)?.nodeValue?.trim() ?? "";
      break;
    }
  }
  if (!text && allOptions.length > 0) {
    text = allOptions[0].children.find((t) => t.nodeType === 3)?.nodeValue?.trim() ?? "";
  }

  const box = layoutOf(node, ox, oy);
  if (!box) return [];

  const styles = node.layout!.styles;
  const padL = parsePx(styles["padding-left"]);
  const padR = parsePx(styles["padding-right"]);
  const padT = parsePx(styles["padding-top"]);
  const padB = parsePx(styles["padding-bottom"]);
  const ts = mapTextStyle(styles);
  const h = Math.max(1, box.height - padT - padB);
  const arrowW = 14;

  const nodes: TextNode[] = [];
  if (text) {
    nodes.push({
      id: ctx.nextId(),
      name: text.slice(0, 24) || "text",
      type: "text",
      layout: {
        x: box.x + padL,
        y: box.y + padT,
        width: Math.max(1, box.width - padL - padR - arrowW),
        height: h,
        order: box.order,
      },
      style: {},
      characters: text,
      text: ts,
    });
  }
  const arrowX = Math.max(box.x + padL, box.x + box.width - padR - arrowW);
  nodes.push({
    id: ctx.nextId(),
    name: "▾",
    type: "text",
    layout: {
      x: arrowX,
      y: box.y + padT,
      width: arrowW,
      height: h,
      order: box.order,
    },
    style: {},
    characters: "▾",
    text: { ...ts, textAlign: "center" },
  });
  return nodes;
}
