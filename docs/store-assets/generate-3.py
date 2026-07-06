from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
ICON = "packages/extension/icons/icon-128.png"
OUT = "docs/store-assets"
W, H = 1280, 800
def font(sz): return ImageFont.truetype(FONT, sz, index=0)
def bg_gradient(w,h,c0,c1):
    im=Image.new("RGB",(w,h)); px=im.load()
    for y in range(h):
        t=y/h; row=(int(c0[0]+(c1[0]-c0[0])*t),int(c0[1]+(c1[1]-c0[1])*t),int(c0[2]+(c1[2]-c0[2])*t))
        for x in range(w): px[x,y]=row
    return im
def rounded_shadow(size,radius,blur=28,alpha=90):
    w,h=size; pad=blur*3
    layer=Image.new("RGBA",(w+pad*2,h+pad*2),(0,0,0,0))
    ImageDraw.Draw(layer).rounded_rectangle([pad,pad,pad+w,pad+h],radius=radius,fill=(30,27,90,alpha))
    return layer.filter(ImageFilter.GaussianBlur(blur)),pad
def card_fit_h(shot_path,target_h,radius=22):
    shot=Image.open(shot_path).convert("RGBA"); sw,sh=shot.size
    scale=target_h/sh; nw=int(sw*scale)
    shot=shot.resize((nw,target_h),Image.LANCZOS)
    m=Image.new("L",(nw,target_h),0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,nw-1,target_h-1],radius=radius,fill=255)
    out=Image.new("RGBA",(nw,target_h),(0,0,0,0)); out.paste(shot,(0,0),m)
    return out
def dtext(d,xy,t,f,fill,bold=0,anchor="la",spacing=12):
    d.multiline_text(xy,t,font=f,fill=fill,anchor=anchor,stroke_width=bold,stroke_fill=fill,spacing=spacing)

im=bg_gradient(W,H,(238,240,255),(214,220,255)).convert("RGBA")
d=ImageDraw.Draw(im)
icon=Image.open(ICON).convert("RGBA").resize((56,56),Image.LANCZOS)
im.paste(icon,(96,74),icon); dtext(d,(166,88),"html2figma",font(34),(40,34,120),bold=1)

dtext(d,(96,250),"Figma 플러그인이\n받아서 바로 렌더",font(62),(28,25,70),bold=1,spacing=14)
hb=d.multiline_textbbox((96,250),"Figma 플러그인이\n받아서 바로 렌더",font=font(62),spacing=14)
y=hb[3]+34
sub="익스텐션이 보낸 캡처를 플러그인이 자동으로\n편집 가능한 디자인으로 그려줍니다."
dtext(d,(96,y),sub,font(27),(70,74,120),spacing=12)
sb=d.multiline_textbbox((96,y),sub,font=font(27),spacing=12)
cy=sb[3]+40; cx=96; cf=font(24)
for c in ["6자리 페어링 코드","드롭·붙여넣기","자동 렌더"]:
    tb=d.textbbox((0,0),c,font=cf); cw=tb[2]-tb[0]+40
    d.rounded_rectangle([cx,cy,cx+cw,cy+50],radius=25,fill=(255,255,255,235))
    d.text((cx+20,cy+25),c,font=cf,fill=(76,91,255),anchor="lm"); cx+=cw+14

card=card_fit_h("/var/folders/s7/sg52cg3s35sbtqj8lp30tznr0000gn/T/copilot-image-198141.png",664)
cw,ch=card.size; px=W-cw-110; py=(H-ch)//2
sh,pad=rounded_shadow((cw,ch),22)
im.alpha_composite(sh,(px-pad,py-pad+6)); im.alpha_composite(card,(px,py))
im.convert("RGB").save(os.path.join(OUT,"screenshot-3.png"),quality=95)
print("wrote screenshot-3.png",im.size)
