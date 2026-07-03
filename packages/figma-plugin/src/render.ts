import type {
  AssetMap,
  Effect,
  FrameNode as IRFrame,
  GradientPaint,
  H2FBundle,
  H2FDocument,
  H2FNode,
  ImageNode as IRImage,
  Paint as IRPaint,
  RGBA,
  Stroke,
  TextNode as IRText,
  TextStyle as IRTextStyle,
  VectorNode as IRVector,
} from "@html2figma/shared";

export interface RenderOptions {
  useAutoLayout: boolean;
  createStyles: boolean;
}

export class Renderer {
  private assets: AssetMap;
  private opts: RenderOptions;
  private imageHashCache = new Map<string, string>();
  private fontCache = new Map<string, FontName>();
  private paintStyleCache = new Map<string, PaintStyle>();
  private textStyleCache = new Map<string, TextStyle>();

  constructor(assets: AssetMap, opts: RenderOptions) {
    this.assets = assets;
    this.opts = opts;
  }

  async render(doc: H2FDocument): Promise<SceneNode> {
    this.assets = doc.assets;
    await this.preloadFonts(doc.root);
    const node = await this.build(doc.root, doc.root.layout.x, doc.root.layout.y);
    node.name = doc.meta.title || "html2figma";
    figma.currentPage.appendChild(node);
    return node;
  }

  /** 번들: 각 문서를 가로로 나란히 배치 */
  async renderBundle(bundle: H2FBundle): Promise<SceneNode[]> {
    const nodes: SceneNode[] = [];
    const GAP = 80;
    let cursorX = 0;
    for (const doc of bundle.documents) {
      const node = await this.render(doc);
      node.x = cursorX;
      node.y = 0;
      cursorX += ("width" in node ? node.width : doc.root.layout.width) + GAP;
      nodes.push(node);
    }
    return nodes;
  }

  /* ---------------- 폰트 사전 로드 ---------------- */

  private async preloadFonts(node: H2FNode): Promise<void> {
    const needed = new Map<string, IRText["text"]>();
    const collect = (n: H2FNode) => {
      if (n.type === "text") needed.set(`${n.text.fontFamily}__${n.text.fontStyle}`, n.text);
      if (n.type === "frame") n.children.forEach(collect);
    };
    collect(node);
    for (const ts of needed.values()) {
      await this.loadFont(ts.fontFamily, ts.fontStyle, ts.fontWeight);
    }
  }

  private availFonts: Map<string, FontName[]> | null = null;

  /** Figma 에서 실제 사용 가능한 폰트 목록을 한 번만 조회해 family → 스타일 목록으로 캐시 */
  private async ensureAvailFonts(): Promise<Map<string, FontName[]>> {
    if (this.availFonts) return this.availFonts;
    const map = new Map<string, FontName[]>();
    try {
      const list = await figma.listAvailableFontsAsync();
      for (const f of list) {
        const arr = map.get(f.fontName.family) ?? [];
        arr.push(f.fontName);
        map.set(f.fontName.family, arr);
      }
    } catch {
      /* 목록 조회 실패 시 빈 맵 */
    }
    this.availFonts = map;
    return map;
  }

  private async loadFont(family: string, style: string, weight?: number): Promise<FontName> {
    const key = `${family}__${style}`;
    const cached = this.fontCache.get(key);
    if (cached) return cached;

    const avail = await this.ensureAvailFonts();
    const italic = /italic|oblique/i.test(style);
    const desired = weight ?? weightOfStyleName(style);

    // 가족 우선순위: 원본 가족 → Inter. 각 가족 안에서는 "실제 존재하는 스타일 중
    // 같은 이탤릭 여부이면서 무게가 가장 가까운" 스타일을 고른다. 이렇게 하면 원본
    // 폰트가 600(SemiBold)을 정확히 갖지 않아도 Bold/Medium 등 가까운 두께로 매칭돼
    // 400(Regular)으로 떨어지지 않는다(특히 스타일명 표기가 다른 CJK 폰트).
    for (const fam of [family, "Inter"]) {
      const styles = avail.get(fam);
      if (styles && styles.length) {
        const best = pickClosestStyle(styles, desired, italic);
        if (best) {
          try {
            await figma.loadFontAsync(best);
            this.fontCache.set(key, best);
            return best;
          } catch {
            /* 다음 가족 */
          }
        }
      }
    }

    // 목록 조회 실패 등으로 매칭 실패 시 직접 시도.
    const candidates: FontName[] = [
      { family, style },
      { family: "Inter", style },
      { family: "Inter", style: "Regular" },
    ];
    for (const font of candidates) {
      try {
        await figma.loadFontAsync(font);
        this.fontCache.set(key, font);
        return font;
      } catch {
        /* 다음 후보 */
      }
    }
    const fallback: FontName = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(fallback);
    this.fontCache.set(key, fallback);
    return fallback;
  }

  /* ---------------- 노드 빌드 ---------------- */

  private async build(node: H2FNode, parentX: number, parentY: number): Promise<SceneNode> {
    switch (node.type) {
      case "text":
        return this.buildText(node, parentX, parentY);
      case "image":
        return this.buildImage(node, parentX, parentY);
      case "vector":
        return this.buildVector(node, parentX, parentY);
      default:
        return this.buildFrame(node, parentX, parentY);
    }
  }

  private buildVector(node: IRVector, parentX: number, parentY: number): SceneNode {
    const asset = this.assets[node.assetId];
    if (asset && asset.kind === "svg") {
      try {
        const svgNode = figma.createNodeFromSvg(asset.markup);
        svgNode.name = node.name || "svg";
        const tw = node.layout.width;
        const th = node.layout.height;
        if (tw > 0 && th > 0) {
          // createNodeFromSvg 는 SVG viewBox 크기의 프레임을 만든다. resize() 만 하면
          // 프레임만 커지고 내부 벡터 패스는 원래 크기로 남아 넘치거나 잘린다.
          // 자식 제약을 SCALE 로 두면 프레임 리사이즈에 맞춰 패스도 스케일된다.
          for (const child of svgNode.children) {
            if ("constraints" in child) {
              (child as SceneNode & { constraints: Constraints }).constraints = {
                horizontal: "SCALE",
                vertical: "SCALE",
              };
            }
          }
          // SVG 로고/아이콘은 원본 비율을 유지한다(object-fit:contain 처럼 박스 안에 맞춤).
          // 페이지 CSS 가 object-fit:fill 로 비율을 무시하더라도, 늘어난 로고보다
          // 원본 비율을 보존하는 편이 디자인 용도로 더 유용하다.
          const iw = svgNode.width;
          const ih = svgNode.height;
          if (iw > 0 && ih > 0) {
            const scale = Math.min(tw / iw, th / ih);
            const nw = Math.max(1, iw * scale);
            const nh = Math.max(1, ih * scale);
            svgNode.resize(nw, nh);
            this.position(svgNode, node, parentX, parentY);
            // 비율 유지로 남는 여백만큼 박스 중앙에 배치
            if ("x" in svgNode) {
              svgNode.x += (tw - nw) / 2;
              svgNode.y += (th - nh) / 2;
            }
          } else {
            svgNode.resize(Math.max(1, tw), Math.max(1, th));
            this.position(svgNode, node, parentX, parentY);
          }
        } else {
          this.position(svgNode, node, parentX, parentY);
        }
        return svgNode;
      } catch {
        /* 파싱 실패 시 플레이스홀더로 대체 */
      }
    }
    const rect = figma.createRectangle();
    rect.name = node.name || "vector";
    rect.resize(Math.max(1, node.layout.width), Math.max(1, node.layout.height));
    rect.fills = [];
    this.position(rect, node, parentX, parentY);
    return rect;
  }

  private position(scene: SceneNode, node: H2FNode, parentX: number, parentY: number) {
    if ("x" in scene) {
      scene.x = node.layout.x - parentX;
      scene.y = node.layout.y - parentY;
    }
  }

  private async buildFrame(node: IRFrame, parentX: number, parentY: number): Promise<FrameNode> {
    const frame = figma.createFrame();
    frame.name = node.name;
    frame.resize(Math.max(1, node.layout.width), Math.max(1, node.layout.height));
    frame.fills = [];
    // Figma 프레임 기본값은 clipsContent=true 이지만, 웹 기본값은 overflow:visible 이다.
    // 스타일에서 명시하지 않으면 넘치는 자식을 자르지 않도록 false 로 둔다.
    frame.clipsContent = false;
    this.applyStyle(frame, node);

    for (const child of node.children) {
      const c = await this.build(child, node.layout.x, node.layout.y);
      frame.appendChild(c);
    }

    if (this.opts.useAutoLayout && node.layout.autoLayout) {
      this.applyAutoLayout(frame, node);
    }

    this.position(frame, node, parentX, parentY);
    return frame;
  }

  private applyAutoLayout(frame: FrameNode, node: IRFrame) {
    const al = node.layout.autoLayout!;
    frame.layoutMode = al.direction === "vertical" ? "VERTICAL" : "HORIZONTAL";
    frame.itemSpacing = al.gap;
    frame.paddingTop = al.padding.top;
    frame.paddingRight = al.padding.right;
    frame.paddingBottom = al.padding.bottom;
    frame.paddingLeft = al.padding.left;
    frame.primaryAxisAlignItems =
      al.primaryAlign === "space-between"
        ? "SPACE_BETWEEN"
        : (al.primaryAlign.toUpperCase() as "MIN" | "CENTER" | "MAX");
    frame.counterAxisAlignItems = al.counterAlign.toUpperCase() as "MIN" | "CENTER" | "MAX";
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";
  }

  private async buildText(node: IRText, parentX: number, parentY: number): Promise<TextNode> {
    const text = figma.createText();
    const font = await this.loadFont(node.text.fontFamily, node.text.fontStyle, node.text.fontWeight);
    text.fontName = font;
    text.characters = node.characters;
    text.fontSize = node.text.fontSize;
    text.name = node.name;

    if (node.text.lineHeight != null) {
      text.lineHeight = { value: node.text.lineHeight, unit: "PIXELS" };
    }
    if (node.text.letterSpacing != null) {
      text.letterSpacing = { value: node.text.letterSpacing, unit: "PIXELS" };
    }
    text.textAlignHorizontal = mapTextAlign(node.text.textAlign);
    text.textDecoration = mapDecoration(node.text.textDecoration);
    text.textCase = mapTextCase(node.text.textCase);
    text.fills = [solid(node.text.color)];

    // 캡처된 박스 크기에 맞춤. 단일 줄 텍스트는 대체 폰트 폭 차이로 마지막 글자가
    // 줄바꿈되는 것을 막기 위해 자동 폭으로 둔다. 여러 줄(원본에서 이미 줄바꿈)만 폭 고정.
    const lh = node.text.lineHeight ?? node.text.fontSize * 1.4;
    const singleLine = !node.characters.includes("\n") && node.layout.height <= lh * 1.6;
    if (singleLine) {
      text.textAutoResize = "WIDTH_AND_HEIGHT";
    } else {
      text.textAutoResize = "HEIGHT";
      text.resize(Math.max(1, node.layout.width + 2), text.height);
    }

    if (this.opts.createStyles) {
      await this.applyTextStyle(text, node.text, font);
    }

    this.position(text, node, parentX, parentY);
    // 단일 줄 텍스트는 캡처된 박스의 세로 중심에 라인 박스를 맞춘다.
    // (line-height 가 큰 인라인 텍스트가 아래로 밀리거나, input placeholder 가
    //  세로 중앙이 아닌 상단에 붙는 이중 정렬 문제를 방지)
    if (singleLine && node.layout.height > 0) {
      const boxCenterY = node.layout.y - parentY + node.layout.height / 2;
      text.y = boxCenterY - text.height / 2;
    }
    return text;
  }

  private async buildImage(node: IRImage, parentX: number, parentY: number): Promise<SceneNode> {
    const rect = figma.createRectangle();
    rect.name = node.name;
    rect.resize(Math.max(1, node.layout.width), Math.max(1, node.layout.height));
    this.applyStyle(rect, node);

    const hash = this.getImageHash(node.assetId);
    if (hash) {
      rect.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: hash }];
    }
    this.position(rect, node, parentX, parentY);
    return rect;
  }

  /* ---------------- 스타일 적용 ---------------- */

  private applyStyle(node: FrameNode | RectangleNode, ir: H2FNode) {
    const style = ir.style;
    if (style.opacity != null) node.opacity = style.opacity;
    if (style.clipsContent != null && "clipsContent" in node) {
      (node as FrameNode).clipsContent = style.clipsContent;
    }

    if (style.fills?.length) {
      const paints = style.fills
        .map((p) => this.toFigmaPaint(p))
        .filter((p): p is Paint => p != null);
      if (paints.length) {
        node.fills = paints;
        if (this.opts.createStyles) this.applyFillStyle(node, style.fills);
      }
    }

    if (style.strokes?.length) this.applyStrokes(node, style.strokes[0]);

    if (style.cornerRadius) {
      const r = style.cornerRadius;
      node.topLeftRadius = r.tl;
      node.topRightRadius = r.tr;
      node.bottomRightRadius = r.br;
      node.bottomLeftRadius = r.bl;
    }

    if (style.effects?.length) {
      node.effects = style.effects.map(toFigmaEffect);
    }
  }

  private applyStrokes(node: FrameNode | RectangleNode, stroke: Stroke) {
    node.strokes = [solid(stroke.color)];
    node.strokeAlign = stroke.align === "outside" ? "OUTSIDE" : stroke.align === "center" ? "CENTER" : "INSIDE";
    if (stroke.perSide && "strokeTopWeight" in node) {
      node.strokeTopWeight = stroke.perSide.top;
      node.strokeRightWeight = stroke.perSide.right;
      node.strokeBottomWeight = stroke.perSide.bottom;
      node.strokeLeftWeight = stroke.perSide.left;
    } else {
      node.strokeWeight = stroke.weight;
    }
  }

  private toFigmaPaint(p: IRPaint): Paint | null {
    if (p.type === "solid") return solid(p.color);
    if (p.type === "image") {
      const hash = this.getImageHash(p.assetId);
      return hash ? { type: "IMAGE", scaleMode: "FILL", imageHash: hash } : null;
    }
    return this.toGradient(p);
  }

  private toGradient(p: GradientPaint): Paint {
    const stops: ColorStop[] = p.stops.map((s) => ({
      position: s.position,
      color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
    }));
    return {
      type: p.type === "gradient-radial" ? "GRADIENT_RADIAL" : "GRADIENT_LINEAR",
      gradientTransform: gradientTransform(p.angle ?? 180),
      gradientStops: stops,
    };
  }

  private getImageHash(assetId: string): string | null {
    const cached = this.imageHashCache.get(assetId);
    if (cached) return cached;
    const asset = this.assets[assetId];
    if (!asset || asset.kind !== "image" || !asset.dataBase64) return null;
    try {
      const bytes = figma.base64Decode(asset.dataBase64);
      const img = figma.createImage(bytes);
      this.imageHashCache.set(assetId, img.hash);
      return img.hash;
    } catch {
      return null;
    }
  }

  /* ---------------- Local styles (Phase 10) ---------------- */

  private applyFillStyle(node: FrameNode | RectangleNode, fills: IRPaint[]) {
    const solidFill = fills.find((f): f is Extract<IRPaint, { type: "solid" }> => f.type === "solid");
    if (!solidFill) return;
    const style = this.getPaintStyle(solidFill.color);
    node.fillStyleId = style.id;
  }

  private getPaintStyle(color: RGBA): PaintStyle {
    const key = colorKey(color);
    const cached = this.paintStyleCache.get(key);
    if (cached) return cached;
    const style = figma.createPaintStyle();
    style.name = `color/${key}`;
    style.paints = [solid(color)];
    this.paintStyleCache.set(key, style);
    return style;
  }

  private async applyTextStyle(node: TextNode, ts: IRTextStyle, font: FontName) {
    const key = `${font.family}/${font.style}/${ts.fontSize}/${ts.lineHeight ?? "auto"}`;
    let style = this.textStyleCache.get(key);
    if (!style) {
      style = figma.createTextStyle();
      style.name = `text/${font.family}-${font.style}-${ts.fontSize}`;
      style.fontName = font;
      style.fontSize = ts.fontSize;
      if (ts.lineHeight != null) style.lineHeight = { value: ts.lineHeight, unit: "PIXELS" };
      this.textStyleCache.set(key, style);
    }
    await node.setTextStyleIdAsync(style.id);
  }
}

/* ---------------- 헬퍼 ---------------- */

/** Figma 스타일명("Semi Bold", "Extra Light" 등)을 CSS font-weight 숫자로 변환 */
function weightOfStyleName(style: string): number {
  const s = style.toLowerCase().replace(/[\s_-]+/g, "");
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("semibold") || s.includes("demibold") || s.includes("demi")) return 600;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  if (s.includes("medium")) return 500;
  if (s.includes("light")) return 300;
  if (s.includes("bold")) return 700;
  return 400;
}

/** 가족 내 실제 스타일 중 이탤릭 여부가 같고 무게가 가장 가까운 스타일 선택(동률이면 더 두꺼운 쪽) */
function pickClosestStyle(styles: FontName[], desired: number, italic: boolean): FontName | null {
  const match = (want: boolean) =>
    styles.filter((f) => /italic|oblique/i.test(f.style) === want);
  let pool = match(italic);
  if (pool.length === 0) pool = styles;
  let best: FontName | null = null;
  let bestScore = Infinity;
  let bestWeight = -1;
  for (const f of pool) {
    const w = weightOfStyleName(f.style);
    const d = Math.abs(w - desired);
    if (d < bestScore || (d === bestScore && w > bestWeight)) {
      best = f;
      bestScore = d;
      bestWeight = w;
    }
  }
  return best;
}

function solid(color: RGBA): SolidPaint {
  return { type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
}

function toFigmaEffect(e: Effect): Effect_ {
  return {
    type: e.type === "inner-shadow" ? "INNER_SHADOW" : "DROP_SHADOW",
    color: { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a },
    offset: { x: e.offsetX, y: e.offsetY },
    radius: e.blur,
    spread: e.spread,
    visible: true,
    blendMode: "NORMAL",
  };
}

type Effect_ = DropShadowEffect | InnerShadowEffect;

function mapTextAlign(v: IRTextStyle["textAlign"]): "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" {
  switch (v) {
    case "center":
      return "CENTER";
    case "right":
      return "RIGHT";
    case "justify":
      return "JUSTIFIED";
    default:
      return "LEFT";
  }
}

function mapDecoration(v: IRTextStyle["textDecoration"]): TextDecoration {
  if (v === "underline") return "UNDERLINE";
  if (v === "strikethrough") return "STRIKETHROUGH";
  return "NONE";
}

function mapTextCase(v: IRTextStyle["textCase"]): TextCase {
  switch (v) {
    case "upper":
      return "UPPER";
    case "lower":
      return "LOWER";
    case "title":
      return "TITLE";
    default:
      return "ORIGINAL";
  }
}

function colorKey(c: RGBA): string {
  const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a) : ""}`;
}

function gradientTransform(angleDeg: number): Transform {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.sin(a);
  const sin = -Math.cos(a);
  const tx = 0.5 - 0.5 * cos + 0.5 * sin;
  const ty = 0.5 - 0.5 * sin - 0.5 * cos;
  return [
    [cos, -sin, tx],
    [sin, cos, ty],
  ];
}
