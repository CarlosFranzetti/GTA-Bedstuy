#!/usr/bin/env python3
"""Turn YOUR OWN photo of a building facade into a per-lot facade texture set for GTA Bed-Stuy.

Usage:
    python3 scripts/photo-to-facade.py photo.jpg r1c1-E-3 --floors 4 \
        --corners 212,140,1710,118,1745,1380,190,1402        # TL,TR,BR,BL of the facade in the photo (pixels)
    python3 scripts/photo-to-facade.py photo.jpg r1c1-E-3 --floors 4 --auto   # crude axis-aligned auto crop

<lotId> is the lot id the game uses, "<block>-<side>-<index>", e.g. r1c1-E-3 (see docs/REAL-BLOCKS.md).
What it does
    1. rectifies the photo with a perspective transform from the 4 corner points you give (or an axis-aligned
       auto crop from edge energy with --auto, which cannot fix perspective);
    2. splits the rectified facade into the GROUND-FLOOR tile (bottom, parlour/storefront height 3.3 m) and the
       UPPER-FLOORS tile (the remaining floors, 2.9 m each), using the same storey heights as src/world/buildings/facade.ts;
    3. runs each tile through the photo-to-pbr.py conventions (lighting gradient removed, normal map from fine detail,
       roughness estimate) separately, because shop fronts and upper storeys are lit differently;
    4. writes one atlas per map (upper floors on top, ground floor below) to
       src/assets/textures/user/facade-<lotId>_{color,normal,rough}.jpg
    5. records the result in src/assets/textures/user/facades.json (the `facadeTexture` data for that lot: file stem,
       floors, ground-floor share of the atlas height, facade size in metres), see docs/REAL-BLOCKS.md.
Facade textures are NOT tiled: one image covers one lot front. Requires Pillow + numpy.
Only photos you took yourself: no Street View, no map-service imagery.
"""
import argparse, importlib.util, json, os, re, sys
import numpy as np
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
PARLOUR_H = 3.3   # src/world/buildings/facade.ts
UPPER_H = 2.9
LOT_ID = re.compile(r'^r\d+c\d+-[NSEW]-\d+$')


def load_pbr():
    """Import photo-to-pbr.py (hyphenated name) so both scripts share one set of image-processing conventions."""
    spec = importlib.util.spec_from_file_location('photo_to_pbr', os.path.join(HERE, 'photo-to-pbr.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def parse_corners(text):
    nums = [float(v) for v in re.split(r'[,; ]+', text.strip()) if v != '']
    if len(nums) != 8:
        sys.exit('--corners needs 8 numbers: x,y for top-left, top-right, bottom-right, bottom-left')
    return [(nums[i], nums[i + 1]) for i in range(0, 8, 2)]


def auto_quad(im):
    """Crude: crop to the band of rows/columns that carry edge energy (drops sky, road, blank walls). No perspective fix."""
    g = np.asarray(im.convert('L'), np.float32)
    gx = np.abs(np.diff(g, axis=1))[:-1, :]
    gy = np.abs(np.diff(g, axis=0))[:, :-1]
    e = gx + gy
    def span(profile):
        k = max(3, len(profile) // 40)
        p = np.convolve(profile, np.ones(k) / k, mode='same')
        idx = np.where(p > 0.35 * p.max())[0]
        return int(idx[0]), int(idx[-1])
    x0, x1 = span(e.mean(axis=0))
    y0, y1 = span(e.mean(axis=1))
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def perspective_coeffs(out_pts, in_pts):
    """PIL wants, for each OUTPUT pixel (x, y), the INPUT position: solve the 8 homography coefficients."""
    rows, rhs = [], []
    for (x, y), (u, v) in zip(out_pts, in_pts):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.append(u)
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.append(v)
    return np.linalg.solve(np.array(rows, np.float64), np.array(rhs, np.float64)).tolist()


def dist(a, b):
    return float(np.hypot(a[0] - b[0], a[1] - b[1]))


def rectify(im, quad, width, aspect_hw):
    """Warp the quad to a width x (width*aspect_hw) rectangle. aspect_hw = height/width."""
    height = int(round(min(2048, max(256, width * aspect_hw))))
    out_pts = [(0, 0), (width, 0), (width, height), (0, height)]
    coeffs = perspective_coeffs(out_pts, quad)
    return im.transform((width, height), Image.PERSPECTIVE, coeffs, Image.BICUBIC), height


def process_tile(pbr, tile, strength, base_rough, flatten):
    c = pbr.arr(tile)
    if flatten:
        c = pbr.flatten_lighting(c, max(8, min(tile.size) // 6))
    h = pbr.height_from_color(c, False)
    n = pbr.normal_from_height(h, strength)
    r = pbr.roughness_from_color(c, base_rough)
    return c, n, r


def main():
    ap = argparse.ArgumentParser(description='Photo of a facade -> per-lot PBR facade textures')
    ap.add_argument('photo'); ap.add_argument('lot_id', help='e.g. r1c1-E-3')
    ap.add_argument('--floors', type=int, default=3, help='storeys above the street INCLUDING the ground floor (default 3)')
    ap.add_argument('--corners', help='x,y x,y x,y x,y : top-left, top-right, bottom-right, bottom-left of the facade in the photo (pixels)')
    ap.add_argument('--auto', action='store_true', help='no corners: crude axis-aligned crop from edge energy')
    ap.add_argument('--width', type=int, default=1024, help='atlas width in pixels (default 1024)')
    ap.add_argument('--width-m', type=float, help='real facade width in metres (the lot widthM); sets the aspect ratio. Default: aspect of the corner quad')
    ap.add_argument('--strength', type=float, default=2.0, help='normal-map depth (default 2.0, facades are flatter than brick)')
    ap.add_argument('--rough', type=float, default=0.85)
    ap.add_argument('--no-flatten', action='store_true')
    ap.add_argument('--out', default='src/assets/textures/user')
    ap.add_argument('--manifest', help='facades.json path (default: <out>/facades.json)')
    ap.add_argument('--preview', help='also save the rectified facade here, to check the corners')
    ap.add_argument('--dry-run', action='store_true', help='compute and print, write nothing')
    a = ap.parse_args()

    if not LOT_ID.match(a.lot_id):
        print(f'warning: lot id {a.lot_id!r} does not look like r<row>c<col>-<N|S|E|W>-<index>; the game will not find it', file=sys.stderr)
    if a.floors < 1 or a.floors > 8:
        sys.exit('--floors must be 1..8')
    if not os.path.isfile(a.photo):
        sys.exit(f'no such photo: {a.photo}')
    if not a.corners and not a.auto:
        sys.exit('give --corners x,y x,y x,y x,y (TL TR BR BL) or --auto')

    pbr = load_pbr()
    im = ImageOps.exif_transpose(Image.open(a.photo)).convert('RGB')
    quad = parse_corners(a.corners) if a.corners else auto_quad(im)
    for (x, y) in quad:
        if not (-1 <= x <= im.width + 1 and -1 <= y <= im.height + 1):
            sys.exit(f'corner ({x:.0f},{y:.0f}) is outside the {im.width}x{im.height} photo')

    top, bot = dist(quad[0], quad[1]), dist(quad[3], quad[2])
    left, right = dist(quad[0], quad[3]), dist(quad[1], quad[2])
    quad_w, quad_h = (top + bot) / 2, (left + right) / 2
    if quad_w < 8 or quad_h < 8:
        sys.exit('the corner quad is degenerate')

    total_m = PARLOUR_H + UPPER_H * (a.floors - 1)
    if a.width_m:
        aspect = total_m / a.width_m          # real proportions beat the (perspective-distorted) quad proportions
        width_m = a.width_m
    else:
        aspect = quad_h / quad_w
        width_m = round(total_m / aspect, 2)
    rect, height = rectify(im, quad, a.width, aspect)
    ground_frac = PARLOUR_H / total_m
    split = int(round(height * (1 - ground_frac))) if a.floors > 1 else 0   # row where the ground floor starts

    color = np.zeros((height, a.width, 3), np.float32)
    normal = np.zeros_like(color)
    rough = np.zeros((height, a.width), np.float32)
    tiles = [('upper floors', 0, split), ('ground floor', split, height)] if a.floors > 1 else [('ground floor', 0, height)]
    for name, y0, y1 in tiles:
        c, n, r = process_tile(pbr, rect.crop((0, y0, a.width, y1)), a.strength, a.rough, not a.no_flatten)
        color[y0:y1], normal[y0:y1], rough[y0:y1] = c, n, r
        print(f'  tile {name}: rows {y0}-{y1} ({a.width}x{y1 - y0})')

    stem = f'facade-{a.lot_id}'
    entry = {
        'texture': stem,
        'floors': a.floors,
        'groundShare': round(ground_frac, 4),      # bottom share of the atlas height that is the ground floor
        'widthM': width_m,
        'heightM': round(total_m, 2),
        'atlasPx': [a.width, height],
        'source': 'user photo',
    }
    print(f'{a.photo} -> {a.out}/{stem}_{{color,normal,rough}}.jpg  ({a.width}x{height}, ground floor = bottom {ground_frac:.0%})')
    print('  facadeTexture:', json.dumps(entry))
    if a.dry_run:
        return
    os.makedirs(a.out, exist_ok=True)
    base = os.path.join(a.out, stem)
    pbr.img(color).save(base + '_color.jpg', quality=85, optimize=True)
    pbr.img(normal).save(base + '_normal.jpg', quality=85, optimize=True)
    pbr.img(np.repeat(rough[..., None], 3, 2)).convert('L').resize((a.width // 2, max(1, height // 2))).save(base + '_rough.jpg', quality=75, optimize=True)
    if a.preview:
        rect.save(a.preview, quality=90)
    manifest = a.manifest or os.path.join(a.out, 'facades.json')
    data = {}
    if os.path.isfile(manifest):
        with open(manifest) as f:
            data = json.load(f)
    data[a.lot_id] = entry
    with open(manifest, 'w') as f:
        json.dump(dict(sorted(data.items())), f, indent=2)
        f.write('\n')
    print(f'  recorded in {manifest}')


if __name__ == '__main__':
    main()
