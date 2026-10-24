#!/usr/bin/env python3
"""Turn your own surface photos into tileable PBR texture sets for GTA Bed-Stuy.

Usage:
    python3 scripts/photo-to-pbr.py photos/            # every *.jpg|*.png in the folder
    python3 scripts/photo-to-pbr.py photos/brownstone.jpg --strength 3 --size 1024

Input file names decide which material they replace (see docs/PHOTO-TEXTURES.md):
    <key>.jpg            e.g. brownstone.jpg, sidewalk.jpg, asphalt.jpg
    <key>.<variant>.jpg  e.g. brickRed.1.jpg (variant 1 = brown brick)
Output: src/assets/textures/user/<key>.<variant>_{color,normal,rough}.jpg
Requires Pillow + numpy (both available in this repo's environment).
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageOps, ImageFilter

def to_square(im, size):
    im = ImageOps.exif_transpose(im).convert('RGB')
    w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return im.resize((size, size), Image.LANCZOS)

def arr(im): return np.asarray(im).astype(np.float32) / 255.0
def img(a): return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))

def flatten_lighting(c, radius):
    """Remove the slow lighting gradient (one side of a photo is always darker): high-pass each channel."""
    blur = arr(img(c).filter(ImageFilter.GaussianBlur(radius)))
    mean = c.mean(axis=(0, 1), keepdims=True)
    return np.clip(c - blur + mean, 0, 1)

def make_tileable(c, feather):
    """Offset by half and blend the cross-shaped seam with a feathered mask of the original."""
    h, w = c.shape[:2]
    shifted = np.roll(np.roll(c, h // 2, axis=0), w // 2, axis=1)
    y, x = np.mgrid[0:h, 0:w]
    dy = np.minimum(np.abs(y - h / 2), np.abs(y - h / 2)) / (h / 2)
    dx = np.minimum(np.abs(x - w / 2), np.abs(x - w / 2)) / (w / 2)
    d = np.minimum(dy, dx)                     # 0 on the seam cross, 1 at the far edges
    m = np.clip(d / feather, 0, 1)             # 1 away from the seam: keep shifted; 0 on the seam: use original
    m = m * m * (3 - 2 * m)
    out = shifted * m[..., None] + c * (1 - m[..., None])
    # second pass: roll back so the image content matches the original framing
    return np.roll(np.roll(out, -h // 2, axis=0), -w // 2, axis=1)

def height_from_color(c, invert):
    lum = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    hp = lum - arr(img(np.repeat(lum[..., None], 3, 2)).filter(ImageFilter.GaussianBlur(24)))[..., 0]
    hp = (hp - hp.min()) / (hp.max() - hp.min() + 1e-6)
    return 1 - hp if invert else hp

def normal_from_height(h, strength):
    h = arr(img(np.repeat(h[..., None], 3, 2)).filter(ImageFilter.GaussianBlur(1.2)))[..., 0]
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1); gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], 2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5

def roughness_from_color(c, base):
    lum = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    local = np.abs(lum - arr(img(np.repeat(lum[..., None], 3, 2)).filter(ImageFilter.GaussianBlur(6)))[..., 0])
    r = base - 0.25 * (lum - lum.mean()) + 0.6 * local      # bright/flat = smoother, busy/dark = rougher
    return np.clip(r, 0.35, 1.0)

def process(path, out_dir, size, strength, feather, invert, base_rough, flatten):
    name = os.path.splitext(os.path.basename(path))[0]
    key, variant = (name.split('.', 1) + ['0'])[:2]
    c = arr(to_square(Image.open(path), size))
    if flatten: c = flatten_lighting(c, size // 6)
    c = make_tileable(c, feather)
    h = height_from_color(c, invert)
    n = normal_from_height(h, strength)
    r = roughness_from_color(c, base_rough)
    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.join(out_dir, f'{key}.{variant}')
    img(c).save(stem + '_color.jpg', quality=82, optimize=True)
    img(n).save(stem + '_normal.jpg', quality=85, optimize=True)
    img(np.repeat(r[..., None], 3, 2)).convert('L').resize((size // 2, size // 2)).save(stem + '_rough.jpg', quality=75, optimize=True)
    print(f'{path} -> {stem}_{{color,normal,rough}}.jpg')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('input'); ap.add_argument('--out', default='src/assets/textures/user')
    ap.add_argument('--size', type=int, default=1024); ap.add_argument('--strength', type=float, default=2.5)
    ap.add_argument('--feather', type=float, default=0.35, help='seam blend width, 0..1 of half the tile')
    ap.add_argument('--invert', action='store_true', help='treat bright as recessed (default: dark = recessed, right for mortar/joints)')
    ap.add_argument('--rough', type=float, default=0.85); ap.add_argument('--no-flatten', action='store_true')
    a = ap.parse_args()
    paths = [os.path.join(a.input, f) for f in sorted(os.listdir(a.input))] if os.path.isdir(a.input) else [a.input]
    paths = [p for p in paths if p.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
    if not paths: sys.exit('no images found')
    for p in paths: process(p, a.out, a.size, a.strength, a.feather, a.invert, a.rough, not a.no_flatten)
