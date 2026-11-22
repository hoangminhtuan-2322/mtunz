#!/usr/bin/env python3
"""Generate native mtunz icons from the *exact* website favicon.svg, not a redraw.

The website source of truth is static/favicon.svg. Run from any working dir:
  python mobile/tools/build_brand_assets.py
Requires pillow and cairosvg.
"""
from __future__ import annotations

import io
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "static" / "favicon.svg"
OUTPUT = ROOT / "mobile" / "assets"
OUTPUT.mkdir(parents=True, exist_ok=True)

source = SOURCE.read_bytes()


def original(size: int) -> Image.Image:
    # SVG stays the source of truth so Android never drifts from the web logo.
    raster = cairosvg.svg2png(bytestring=source, output_width=size, output_height=size)
    return Image.open(io.BytesIO(raster)).convert("RGBA")


def centered(canvas: Image.Image, graphic: Image.Image) -> Image.Image:
    canvas.alpha_composite(graphic, ((canvas.width - graphic.width) // 2,
                                     (canvas.height - graphic.height) // 2))
    return canvas


# Flat square background: the Android/iOS OS itself applies app-icon masks.
launcher = centered(Image.new("RGBA", (1024, 1024), "#121b36"), original(856))
launcher.convert("RGB").save(OUTPUT / "icon.png", optimize=True)

# Adaptive icon artwork stays entirely within Android's safe central region.
foreground = centered(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), original(660))
foreground.save(OUTPUT / "adaptive-icon.png", optimize=True)

# Exact transparent website icon for the app login, chat header and Admin header.
original(256).save(OUTPUT / "brand-logo.png", optimize=True)

for file in sorted(OUTPUT.glob("*.png")):
    with Image.open(file) as check:
        check.verify()
    print(f"Generated {file.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")
