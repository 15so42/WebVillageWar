"""Chroma-key removal + card-art post-processing for low-poly ImageGen assets.

Workflow (see docs/CARD_ART_STYLE.md):
  1. Generate card art on a solid magenta (#ff00ff) chroma-key background.
  2. Run this script to key out the background, remove the magenta spill on the
     edges, drop the corner watermark, crop to the subject's alpha bounds,
     center it on a transparent 512x288 canvas and lightly quantize the colors.

Usage:
  python scripts/remove_chroma_key.py <source.png> <output.png>

The background is keyed by the magenta signature (both red and blue far above
green), which is robust to the soft gradient ImageGen produces and does not
touch the brown staff, tan skin or teal/green robes (all low blue channel).
"""

from __future__ import annotations

import sys

from PIL import Image, ImageFilter


def load_rgb(path: str) -> Image.Image:
    image = Image.open(path).convert("RGB")
    return image


def key_and_process(
    source_path: str,
    output_path: str,
    canvas_size=(512, 288),
    fill_ratio=0.9,
    margin_g=40,
    min_blue=90,
):
    rgb = load_rgb(source_path)
    width, height = rgb.size
    pixels = rgb.load()

    # Pass 1: build an alpha mask from the magenta signature and decontaminate
    # the pink spill on the remaining pixels.
    alpha = Image.new("L", (width, height), 0)
    alpha_pixels = alpha.load()
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            is_background = (r > g + margin_g) and (b > g + margin_g) and (b > min_blue)
            if is_background:
                alpha_pixels[x, y] = 0
                continue
            alpha_pixels[x, y] = 255
            # Despill: pull red/blue back toward green only where blue is high
            # (magenta fringe). Brown/skin have low blue and stay untouched.
            if b > g + 24:
                excess = (min(r, b) - g) * 0.7
                if excess > 0:
                    r = int(max(0, min(255, r - excess)))
                    b = int(max(0, min(255, b - excess * 1.25)))
                    pixels[x, y] = (r, g, b)

    # Soften the matte edge so anti-aliased borders fade instead of jaggies.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))

    # Pass 2: erase the bottom-right watermark corner (pure background anyway).
    alpha_pixels = alpha.load()
    cut_x = int(width * 0.78)
    cut_y = int(height * 0.9)
    for y in range(cut_y, height):
        for x in range(cut_x, width):
            alpha_pixels[x, y] = 0

    rgba = rgb.copy()
    rgba.putalpha(alpha)

    # Crop to the subject's alpha bounds (ignore near-transparent noise).
    bounds = _alpha_bounds(alpha, threshold=16)
    if bounds:
        rgba = rgba.crop(bounds)

    # Center on a transparent canvas, preserving aspect with padding.
    canvas_w, canvas_h = canvas_size
    inner_w = int(canvas_w * fill_ratio)
    inner_h = int(canvas_h * fill_ratio)
    subject_w, subject_h = rgba.size
    scale = min(inner_w / subject_w, inner_h / subject_h)
    new_w = max(1, int(round(subject_w * scale)))
    new_h = max(1, int(round(subject_h * scale)))
    rgba = rgba.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    paste_x = (canvas_w - new_w) // 2
    paste_y = (canvas_h - new_h) // 2
    canvas.paste(rgba, (paste_x, paste_y), rgba)

    _quantize(canvas, levels=24)
    canvas.save(output_path)
    return canvas.size


def _alpha_bounds(alpha: Image.Image, threshold: int = 16):
    width, height = alpha.size
    pixels = alpha.load()
    min_x, min_y, max_x, max_y = width, height, -1, -1
    for y in range(height):
        for x in range(width):
            if pixels[x, y] >= threshold:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if max_x < 0 or max_y < 0:
        return None
    return (min_x, min_y, max_x + 1, max_y + 1)


def _quantize(rgba: Image.Image, levels: int = 24) -> None:
    """Posterize the RGB channels in place to keep the flat low-poly read."""
    step = 255 // max(1, levels - 1)
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            r = min(255, round(r / step) * step)
            g = min(255, round(g / step) * step)
            b = min(255, round(b / step) * step)
            pixels[x, y] = (r, g, b, a)


def main(argv):
    if len(argv) < 3:
        print("usage: python scripts/remove_chroma_key.py <source.png> <output.png>")
        return 1
    source_path, output_path = argv[1], argv[2]
    size = key_and_process(source_path, output_path)
    print(f"wrote {output_path} ({size[0]}x{size[1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
