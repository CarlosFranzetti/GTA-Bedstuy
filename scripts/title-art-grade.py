#!/usr/bin/env python3
"""CREDITS lane: gently grade a clean in-engine frame into a title / loading panel (public/art/*.webp). No filters, no ink, no grain:
a soft S-curve, warm highlights, cool shadows, a soft vignette. Picks the highest WebP quality that stays under --kb.
Usage: title-art-grade.py <in.png> <out.webp> [--crop x0,y0,x1,y1] [--size 1600x900] [--kb 80] [--warm 1.0] [--vig 0.35]"""
import argparse, os
import numpy as np
from PIL import Image
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--crop'); ap.add_argument('--size', default='1600x900')
ap.add_argument('--kb', type=int, default=80); ap.add_argument('--warm', type=float, default=1.0); ap.add_argument('--vig', type=float, default=0.35)
a = ap.parse_args()
img = Image.open(a.src).convert('RGB')
if a.crop: img = img.crop(tuple(int(v) for v in a.crop.split(',')))
W, H = (int(v) for v in a.size.split('x'))
img = img.resize((W, H), Image.LANCZOS)
x = np.asarray(img).astype(np.float32) / 255.0
lum = (x @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
# S-curve on luminance, colour ratios kept
curve = lum * lum * (3 - 2 * lum)
lum2 = 0.55 * curve + 0.45 * lum
x = x * (lum2 / np.maximum(lum, 1e-3))
hi = np.clip((lum - 0.5) * 2, 0, 1); sh = np.clip((0.4 - lum) * 2.5, 0, 1)
x = x * (1 + hi * np.array([0.08, 0.03, -0.07], np.float32) * a.warm) + sh * np.array([-0.015, 0.008, 0.04], np.float32) * a.warm
mean = x.mean(axis=2, keepdims=True); x = mean + (x - mean) * 1.08  # a touch of saturation
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
x *= (1 - a.vig * np.clip(r - 0.5, 0, 1) ** 1.5)[..., None]
out = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))
for q in range(88, 24, -4):
    out.save(a.dst, 'WEBP', quality=q, method=6)
    if os.path.getsize(a.dst) <= a.kb * 1024: break
print(a.dst, os.path.getsize(a.dst) // 1024, 'kB', 'q', q)
