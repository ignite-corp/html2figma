from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
ICON = "packages/extension/icons/icon-128.png"
OUT = "docs/store-assets"
W, H = 1280, 800

def font(sz): return ImageFont.truetype(FONT, sz, index=0)

def bg_gradient(w, h, c0, c1):
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        t = y / h
        row = (int(c0[0]+(c1[0]-c0[0])*t), int(c0[1]+(c1[1]-c0[1])*t), int(c0[2]+(c1[2]-c0[2])*t))
        for x in range(w): px[x, y] = row
    return im

def rounded_shadow(size, radius, blur=28, alpha=90, offset=(0, 18)):
    w, h = size
    pad = blur * 3
    layer = Image.new("RGBA", (w + pad*2, h + pad*2), (0,0,0,0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([pad, pad, pad+w, pad+h], radius=radius, fill=(30, 27, 90, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer, pad

def browser_card(shot_path, inner_w, crop_bottom=0):
    shot = Image.open(shot_path).convert("RGBA")
    if crop_bottom:
        shot = shot.crop((0, 0, shot.size[0], shot.size[1]-crop_bottom))
    sw, sh = shot.size
    scale = inner_w / sw
    shot = shot.resize((inner_w, int(sh*scale)), Image.LANCZOS)
    bar = 46
    cw, ch = inner_w, bar + shot.size[1]
    card = Image.new("RGBA", (cw, ch), (0,0,0,0))
    m = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,cw-1,ch-1], radius=22, fill=255)
    # top bar
    barimg = Image.new("RGBA", (cw, bar), (24, 24, 28, 255))
    bd = ImageDraw.Draw(barimg)
    for i, col in enumerate([(255,95,86),(255,189,46),(39,201,63)]):
        cx = 24 + i*26
        bd.ellipse([cx-7, bar//2-7, cx+7, bar//2+7], fill=col)
    card.paste(barimg, (0,0))
    card.paste(shot, (0, bar))
    out = Image.new("RGBA", (cw, ch), (0,0,0,0))
    out.paste(card, (0,0), m)
    return out

def draw_text(d, xy, text, f, fill, bold=0, anchor="la", spacing=10):
    d.multiline_text(xy, text, font=f, fill=fill, anchor=anchor,
                     stroke_width=bold, stroke_fill=fill, spacing=spacing)

def compose(shot_path, headline, sub, chips, out_name, inner_w=520, crop_bottom=0):
    im = bg_gradient(W, H, (238, 240, 255), (214, 220, 255)).convert("RGBA")
    d = ImageDraw.Draw(im)

    # brand tag (icon + name) top-left
    icon = Image.open(ICON).convert("RGBA").resize((56,56), Image.LANCZOS)
    im.paste(icon, (96, 74), icon)
    draw_text(d, (166, 88), "html2figma", font(34), (40, 34, 120), bold=1)

    # headline + sub (left column)
    draw_text(d, (96, 250), headline, font(62), (28, 25, 70), bold=1, spacing=14)
    hb = d.multiline_textbbox((96, 250), headline, font=font(62), spacing=14)
    y = hb[3] + 34
    draw_text(d, (96, y), sub, font(27), (70, 74, 120), spacing=12)

    # feature chips
    sb = d.multiline_textbbox((96, y), sub, font=font(27), spacing=12)
    cy = sb[3] + 40
    cx = 96
    cf = font(24)
    for c in chips:
        tb = d.textbbox((0,0), c, font=cf)
        cw = tb[2]-tb[0] + 40
        d.rounded_rectangle([cx, cy, cx+cw, cy+50], radius=25, fill=(255,255,255,235))
        d.text((cx+20, cy+25), c, font=cf, fill=(76, 91, 255), anchor="lm")
        cx += cw + 14

    # popup card on the right with shadow
    card = browser_card(shot_path, inner_w, crop_bottom)
    cw, ch = card.size
    px = W - cw - 100
    py = (H - ch)//2
    sh, pad = rounded_shadow((cw, ch), 22)
    im.alpha_composite(sh, (px - pad, py - pad + 6))
    im.alpha_composite(card, (px, py))

    im.convert("RGB").save(os.path.join(OUT, out_name), quality=95)
    print("wrote", out_name, im.size)

S1 = "/var/folders/s7/sg52cg3s35sbtqj8lp30tznr0000gn/T/copilot-image-a128ae.png"
S2 = "/var/folders/s7/sg52cg3s35sbtqj8lp30tznr0000gn/T/copilot-image-9e1e22.png"

compose(S1,
    "웹페이지를\n클릭 한 번으로\n캡처",
    "현재 페이지의 레이아웃·텍스트·이미지·SVG를\n그대로 읽어 편집 가능한 Figma 디자인으로.",
    ["iframe · shadow DOM", "인라인 SVG → 벡터", "정확한 폰트·색"],
    "screenshot-1.png", inner_w=520, crop_bottom=30)

compose(S2,
    "Figma로 바로\n전송하거나\n파일로 저장",
    ".h2f 다운로드 · 클립보드 복사\n6자리 코드로 즉시 전송.",
    ["노드 1,538 · 에셋 73", "Auto Layout", "Local styles"],
    "screenshot-2.png", inner_w=470)
