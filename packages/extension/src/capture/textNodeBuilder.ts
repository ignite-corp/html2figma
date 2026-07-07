import type { TextNode, Layout } from "@html2figma/shared";
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

/** input/textarea 의 value 또는 placeholder 를 텍스트 노드로 합성 */
export function buildInputText(ctx: BuildCtx, node: RawNode, ox: number, oy: number): TextNode | null {
  if (node.nodeName !== "INPUT" && node.nodeName !== "TEXTAREA") return null;
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
