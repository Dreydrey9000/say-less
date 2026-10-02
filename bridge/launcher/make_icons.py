#!/usr/bin/env python3
"""Draw the four Say Less launcher icons and pack each into an .icns.

Usage: python3 make_icons.py --out /abs/dir
Writes, per app slug (titleideas, image, recordings, screens):
  <out>/<slug>-1024.png   the master 1024x1024 artwork (for review)
  <out>/<slug>.icns       built with /usr/bin/iconutil

Needs Pillow (python3 -m pip install Pillow) and /usr/bin/iconutil.
"""
import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    sys.stderr.write(
        "make_icons.py: Pillow is not installed for this python3.\n"
        "Install it with:  python3 -m pip install Pillow\n"
    )
    sys.exit(2)

BG = (0x10, 0x11, 0x14, 255)
LIME = (0xB8, 0xFF, 0x65, 255)
WHITE = (0xF4, 0xF5, 0xF7, 255)
SS = 2            # supersampling factor
CANVAS = 1024 * SS


def s(v):
    """Scale a 1024-space number to the supersampled canvas."""
    return int(round(v * SS))


def pts(seq):
    return [(s(x), s(y)) for x, y in seq]


def base_tile():
    """macOS-style rounded square with near-black fill and a soft top-left glow."""
    tile = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    body = Image.new("RGBA", (CANVAS, CANVAS), BG)

    # Soft glow, top-left.
    grad = Image.radial_gradient("L").resize((s(1300), s(1300)), Image.BICUBIC)
    grad = grad.point(lambda v: max(0, int(255 - v * 1.5)))  # bright centre, fully dark before the edge
    lime_glow = Image.new("RGBA", grad.size, (0xB8, 0xFF, 0x65, 0))
    lime_glow.putalpha(grad.point(lambda v: int(v * 0.17)))
    white_glow = Image.new("RGBA", grad.size, (255, 255, 255, 0))
    white_glow.putalpha(grad.point(lambda v: int(v * 0.07)))
    body.alpha_composite(lime_glow, (s(-420), s(-420)))
    body.alpha_composite(white_glow, (s(-360), s(-360)))

    # Rounded-square mask (Big Sur proportions: 824 body on a 1024 canvas).
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([s(100), s(100), s(924), s(924)], radius=s(185), fill=255)

    # Drop shadow for depth.
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shadow_mask = Image.new("L", (CANVAS, CANVAS), 0)
    sd = ImageDraw.Draw(shadow_mask)
    sd.rounded_rectangle([s(100), s(116), s(924), s(940)], radius=s(185), fill=150)
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(s(14)))
    shadow.putalpha(shadow_mask)
    tile.alpha_composite(shadow)

    body.putalpha(mask)
    tile.alpha_composite(body)

    # Hairline inner highlight.
    edge = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rounded_rectangle([s(101), s(101), s(923), s(923)], radius=s(184),
                         outline=(255, 255, 255, 26), width=s(2))
    tile.alpha_composite(edge)
    return tile


def round_line(d, a, b, width, fill):
    d.line([(s(a[0]), s(a[1])), (s(b[0]), s(b[1]))], fill=fill, width=s(width))
    for p in (a, b):
        r = width / 2
        d.ellipse([s(p[0] - r), s(p[1] - r), s(p[0] + r), s(p[1] + r)], fill=fill)


def glyph_titleideas(d):
    # Rounded text box outline.
    d.rounded_rectangle([s(262), s(312), s(762), s(712)], radius=s(78), outline=WHITE, width=s(38))
    # Bold T (lime): bar + stem.
    d.rounded_rectangle([s(382), s(402), s(642), s(466)], radius=s(18), fill=LIME)
    d.rounded_rectangle([s(480), s(402), s(544), s(626)], radius=s(18), fill=LIME)


def glyph_image(d):
    # Frame.
    d.rounded_rectangle([s(252), s(292), s(772), s(732)], radius=s(62), outline=WHITE, width=s(38))
    # Interior picture clipped to the frame inner area via a mask.
    inner = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    idr.ellipse([s(596 - 46), s(418 - 46), s(596 + 46), s(418 + 46)], fill=LIME)
    idr.polygon(pts([(272, 724), (430, 480), (588, 724)]), fill=WHITE)
    idr.polygon(pts([(470, 724), (612, 556), (754, 724)]), fill=(0xB8, 0xFF, 0x65, 255))
    clip = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(clip).rounded_rectangle([s(290), s(330), s(734), s(694)], radius=s(30), fill=255)
    inner.putalpha(Image.composite(inner.getchannel("A"), Image.new("L", (CANVAS, CANVAS), 0), clip))
    return inner


def glyph_recordings(d):
    # Screen.
    d.rounded_rectangle([s(242), s(282), s(782), s(650)], radius=s(66), outline=WHITE, width=s(38))
    # Play triangle (lime), optically centred.
    d.polygon(pts([(462, 380), (462, 552), (618, 466)]), fill=LIME)
    # Stand.
    round_line(d, (512, 650), (512, 730), 36, WHITE)
    round_line(d, (410, 744), (614, 744), 36, WHITE)


def glyph_screens(d):
    # Viewfinder brackets.
    L, T, R, B = 246, 246, 778, 778
    arm = 150
    w = 42
    for (cx, cy, dx, dy) in ((L, T, 1, 1), (R, T, -1, 1), (L, B, 1, -1), (R, B, -1, -1)):
        round_line(d, (cx, cy), (cx + dx * arm, cy), w, WHITE)
        round_line(d, (cx, cy), (cx, cy + dy * arm), w, WHITE)
    # Eye: almond with pupil.
    cx, cy = 512, 512
    half_w, half_h = 170, 92
    top, bottom = [], []
    n = 60
    for i in range(n + 1):
        t = i / n
        x = cx - half_w + 2 * half_w * t
        y = half_h * 1.0 * math.sin(math.pi * t)
        top.append((x, cy - y))
        bottom.append((x, cy + y))
    poly = top + list(reversed(bottom))
    d.polygon(pts(poly), fill=LIME)
    d.ellipse([s(cx - 52), s(cy - 52), s(cx + 52), s(cy + 52)], fill=BG)
    d.ellipse([s(cx - 16), s(cy - 34), s(cx + 12), s(cy - 6)], fill=WHITE)


GLYPHS = {
    "titleideas": glyph_titleideas,
    "image": glyph_image,
    "recordings": glyph_recordings,
    "screens": glyph_screens,
}


def render(slug):
    tile = base_tile()
    layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    extra = GLYPHS[slug](d)
    tile.alpha_composite(layer)
    if extra is not None:
        tile.alpha_composite(extra)
    return tile.resize((1024, 1024), Image.LANCZOS)


ICONSET = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
]


def build_icns(master, icns_path):
    tmp = tempfile.mkdtemp(prefix="sl-iconset-")
    try:
        iconset = os.path.join(tmp, "AppIcon.iconset")
        os.makedirs(iconset)
        for name, px in ICONSET:
            master.resize((px, px), Image.LANCZOS).save(os.path.join(iconset, name))
        subprocess.run(["/usr/bin/iconutil", "-c", "icns", iconset, "-o", icns_path], check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="absolute output directory")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    for slug in GLYPHS:
        master = render(slug)
        png = os.path.join(out, f"{slug}-1024.png")
        master.save(png)
        build_icns(master, os.path.join(out, f"{slug}.icns"))
        print(f"icon: {slug} -> {out}/{slug}.icns")


if __name__ == "__main__":
    main()
