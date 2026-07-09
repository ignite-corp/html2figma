from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
ICON = "packages/extension/icons/icon-128.png"
UI_SHOT = "docs/store-assets/raw-plugin-ui-2.png"
OUT = "docs/store-assets"
W, H = 1920, 1080
OFF_Y = 60  # 기존 1920x960 레이아웃을 세로 중앙 유지하며 1080 높이로 확장


def font(sz):
    return ImageFont.truetype(FONT, sz, index=0)


def bg_gradient(w, h, c0, c1):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        t = y / h
        row = (
            int(c0[0] + (c1[0] - c0[0]) * t),
            int(c0[1] + (c1[1] - c0[1]) * t),
            int(c0[2] + (c1[2] - c0[2]) * t),
        )
        for x in range(w):
            px[x, y] = row
    return im


def rounded_shadow(size, radius, blur=40, alpha=100, offset=(0, 24)):
    w, h = size
    pad = blur * 3
    layer = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], radius=radius, fill=(30, 27, 90, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer, pad


def plugin_card(shot_path, crop_box, target_w, radius=20):
    shot = Image.open(shot_path).convert("RGBA").crop(crop_box)
    sw, sh = shot.size
    scale = target_w / sw
    shot = shot.resize((target_w, int(sh * scale)), Image.LANCZOS)
    cw, ch = shot.size
    m = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    out.paste(shot, (0, 0), m)
    return out


def dtext(d, xy, t, f, fill, bold=0, anchor="la", spacing=14):
    d.multiline_text(xy, t, font=f, fill=fill, anchor=anchor, stroke_width=bold, stroke_fill=fill, spacing=spacing)


im = bg_gradient(W, H, (238, 240, 255), (210, 216, 255)).convert("RGBA")
d = ImageDraw.Draw(im)

# brand tag (icon + wordmark) top-left
icon = Image.open(ICON).convert("RGBA").resize((72, 72), Image.LANCZOS)
im.paste(icon, (140, 108 + OFF_Y), icon)
dtext(d, (228, 128 + OFF_Y), "html2figma", font(42), (40, 34, 120), bold=1)

headline = "웹페이지를 캡처해\n편집 가능한 Figma로"
dtext(d, (140, 340 + OFF_Y), headline, font(78), (26, 23, 66), bold=1, spacing=16)
hb = d.multiline_textbbox((140, 340 + OFF_Y), headline, font=font(78), spacing=16)
y = hb[3] + 40
sub = "레이아웃 · 텍스트 · 이미지 · SVG를 그대로 재현합니다.\nhtml2figma 크롬 익스텐션에서 보낸 캡처를 이 플러그인이 바로 그려줍니다."
dtext(d, (140, y), sub, font(30), (68, 72, 118), spacing=13)

sb = d.multiline_textbbox((140, y), sub, font=font(30), spacing=13)
cy = sb[3] + 46
cx = 140
cf = font(27)
for c in ["6자리 페어링 코드", ".h2f 드롭 · 붙여넣기", "Auto Layout", "Local styles"]:
    tb = d.textbbox((0, 0), c, font=cf)
    cw = tb[2] - tb[0] + 44
    d.rounded_rectangle([cx, cy, cx + cw, cy + 54], radius=27, fill=(255, 255, 255, 235))
    d.text((cx + 22, cy + 27), c, font=cf, fill=(76, 91, 255), anchor="lm")
    cx += cw + 16

# plugin UI card on the right (real UI screenshot, cropped to header+pairing card+options)
card = plugin_card(UI_SHOT, (0, 0, 420, 434), target_w=560)
cw, ch = card.size
px = W - cw - 170
py = (H - ch) // 2
sh, pad = rounded_shadow((cw, ch), 24)
im.alpha_composite(sh, (px - pad, py - pad + 8))
im.alpha_composite(card, (px, py))

im.convert("RGB").save(os.path.join(OUT, "figma-cover-1920x1080.jpg"), quality=95)
print("wrote figma-cover-1920x1080.jpg", im.size)
