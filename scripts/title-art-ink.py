#!/usr/bin/env python3
"""CREDITS lane: turn a render of OUR OWN world into an inked illustration panel (public/art/*.webp).
Median-smoothed colour, hard-edged tone bands (3 per surface), a confident dark line from luminance + colour edges, warm grade, paper grain.
Usage: title-art-ink.py <in.png> <out.webp> [--crop x0,y0,x1,y1] [--size 1600x900] [--flip] [--q 62] [--seed 7]"""
import sys, argparse
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--crop'); ap.add_argument('--size', default='1600x900'); ap.add_argument('--flip', action='store_true')
ap.add_argument('--q', type=int, default=62); ap.add_argument('--seed', type=int, default=7); ap.add_argument('--warm', type=float, default=1.0)
ap.add_argument('--line', type=float, default=1.0)
a = ap.parse_args()
img = Image.open(a.src).convert('RGB')
if a.crop: img = img.crop(tuple(int(v) for v in a.crop.split(',')))
W, H = (int(v) for v in a.size.split('x'))
if a.flip: img = img.transpose(Image.FLIP_LEFT_RIGHT)
img = img.resize((W, H), Image.LANCZOS)
rng = np.random.default_rng(a.seed)

# 1. flatten: edge-preserving-ish smoothing (median passes) so surfaces become shapes
sm = img.filter(ImageFilter.GaussianBlur(1.4)).filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.GaussianBlur(0.8))
rgb = np.asarray(sm).astype(np.float32) / 255.0

# 2. tone bands: split luminance into four hard steps, keep hue, lift saturation
lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
bands = np.array([0.10, 0.30, 0.56, 0.86], np.float32)
edges = np.array([0.17, 0.38, 0.64], np.float32)
idx = np.digitize(lum, edges)
target = bands[idx]
chroma = rgb / np.maximum(lum[..., None], 0.02)
chroma = np.clip(chroma, 0, 3.0)
tone = np.clip(chroma * target[..., None], 0, 1)
tone = 0.5 * tone + 0.5 * rgb  # a little of the original gradient survives so skies do not band like a poster
hsv = Image.fromarray((tone * 255).astype(np.uint8)).convert('HSV')
h, s, v = [np.asarray(c).astype(np.float32) for c in hsv.split()]
s = np.clip(s * 1.12, 0, 255)
tone = np.asarray(Image.merge('HSV', [Image.fromarray(c.astype(np.uint8)) for c in (h, s, v)]).convert('RGB')).astype(np.float32) / 255.0

# 3. warm grade: push highlights amber, shadows cold teal-blue
w = a.warm
hi = np.clip((lum - 0.45) * 2.0, 0, 1)[..., None]; sh = np.clip((0.35 - lum) * 2.6, 0, 1)[..., None]
tone = tone * (1 + hi * np.array([0.14, 0.04, -0.12], np.float32) * w) + sh * np.array([-0.02, 0.01, 0.07], np.float32) * w
tone = np.clip(tone, 0, 1)

# 4. ink: Sobel on a lightly blurred luminance + colour distance, thickened
g = np.asarray(img.filter(ImageFilter.GaussianBlur(1.6)).convert('L')).astype(np.float32) / 255.0
c = np.asarray(img.filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255.0
def sobel(x):
    gx = (x[:-2, 2:] + 2 * x[1:-1, 2:] + x[2:, 2:]) - (x[:-2, :-2] + 2 * x[1:-1, :-2] + x[2:, :-2])
    gy = (x[2:, :-2] + 2 * x[2:, 1:-1] + x[2:, 2:]) - (x[:-2, :-2] + 2 * x[:-2, 1:-1] + x[:-2, 2:])
    return np.pad(np.hypot(gx, gy), 1)
e = sobel(g) + 0.5 * sum(sobel(c[..., k]) for k in range(3)) / 3.0
thr = np.percentile(e, 96.5) * (1.0 / a.line)
ink = (e > thr).astype(np.uint8) * 255
inkimg = Image.fromarray(ink).filter(ImageFilter.GaussianBlur(0.9))
m = (np.asarray(inkimg).astype(np.float32) / 255.0)
m = np.clip((m - 0.3) * 1.9, 0, 0.88)[..., None]
inkc = np.array([0.045, 0.035, 0.06], np.float32)
out = tone * (1 - m) + inkc * m

# 5. vignette + grain
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
out *= (1 - 0.5 * np.clip(r - 0.4, 0, 1) ** 1.4)[..., None]
grain = rng.normal(0, 0.03, (H, W, 1)).astype(np.float32)
out = np.clip(out + grain, 0, 1)
Image.fromarray((out * 255).astype(np.uint8)).save(a.dst, 'WEBP', quality=a.q, method=6)
import os; print(a.dst, os.path.getsize(a.dst) // 1024, 'kB')
