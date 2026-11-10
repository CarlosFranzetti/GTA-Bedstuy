import type { Painter } from '../canvas';
import { blotches, hsl, speckle, withAlpha, wrapVariant } from './util';

export const LEAF_VARIANTS = 3;

/**
 * 256px leaf-cluster sprite on a TRANSPARENT background (alpha-tested leaf cards, FurnitureGen builds the canopy from them):
 * ~230 pointed leaves with a midrib, darker underneath and lighter toward the top, packed into a rounded blob. Variants:
 * summer green, deep green, yellow-green.
 */
export const treeLeavesPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, LEAF_VARIANTS);
  const hue = [105, 120, 82][v];
  const cx = w / 2, cy = h / 2, R = w * 0.46;
  const leaf = (x: number, y: number, len: number, ang: number, fill: string, rib: string): void => {
    const c = Math.cos(ang), s = Math.sin(ang), wd = len * 0.36;
    const tx = x + c * len, ty = y + s * len;
    const mx = x + c * len * 0.5, my = y + s * len * 0.5;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx - s * wd, my + c * wd, tx, ty);
    ctx.quadraticCurveTo(mx + s * wd, my - c * wd, x, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rib;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  };
  for (let i = 0; i < 230; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * R;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.92;
    const top = 1 - (y / h); // lighter toward the top of the sprite
    const l = (i < 90 ? 13 : 20) + top * 20 + rng.range(-4, 6);
    leaf(x, y, rng.range(13, 24), rng.range(0, Math.PI * 2), hsl(hue + rng.range(-14, 14), rng.range(34, 58), l), hsl(hue + 6, 30, l + 12));
  }
};

/** 256px bark: wandering vertical ridges with lit tops and dark fissures, a little moss. Tiles horizontally. */
export const treeTrunkPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = hsl(28, 18, 22);
  ctx.fillRect(0, 0, w, h);
  // draw a rect and, where it crosses the right edge, its wrapped copy
  const wrapRect = (x: number, y: number, rw: number, rh: number): void => {
    ctx.fillRect(x, y, rw, rh);
    if (x + rw > w) ctx.fillRect(x - w, y, rw, rh);
    if (x < 0) ctx.fillRect(x + w, y, rw, rh);
  };
  for (let x = 0; x < w; x += 4) {
    ctx.fillStyle = hsl(28 + rng.range(-4, 4), 16, rng.range(12, 30));
    ctx.fillRect(x, 0, rng.range(1, 4), h);
  }
  // ridges: stacked segments that drift sideways as they climb
  for (let i = 0; i < 26; i++) {
    let x = rng.range(0, w);
    const rw = rng.range(4, 9);
    const seg = 12;
    for (let y = rng.range(-20, 0); y < h; y += seg) {
      x += rng.range(-1.6, 1.6);
      ctx.fillStyle = hsl(28 + rng.range(-3, 3), 17, rng.range(24, 36));
      wrapRect(x, y, rw, seg + 1);
      withAlpha(ctx, 0.4, () => {
        ctx.fillStyle = '#a89478';
        wrapRect(x + 1, y, 1.5, seg + 1);
      });
      withAlpha(ctx, 0.7, () => {
        ctx.fillStyle = '#0c0805';
        wrapRect(x + rw, y, 2, seg + 1);
      });
    }
  }
  // cross cracks between ridges
  for (let i = 0; i < 40; i++) {
    withAlpha(ctx, rng.range(0.25, 0.55), () => {
      ctx.fillStyle = '#0c0805';
      wrapRect(rng.range(0, w), rng.range(0, h), rng.range(3, 8), 1.5);
    });
  }
  blotches(ctx, w, h, rng, 8, '#4f6a3a', 0.12, 6, 18);
  speckle(ctx, w, h, rng, 500, ['#000000', '#6b5a48'], 1, 3, 0.2);
};

/** Realistic range, light to deep. The first six keep their order; the rest are appended. */
export const SKIN_TONES: readonly string[] = [
  '#f1c9a5', '#e0ac82', '#c68642', '#a06a3c', '#7a4a2a', '#4f301d',
  '#f8dcc6', '#3b2417',
];

/** Street clothing: the original set, then hoodie greys, varsity black/grey, denim blues, and orange/blue team-adjacent. */
export const CLOTH_COLORS: readonly string[] = [
  '#c0392b', '#2c3e50', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1', '#e67e22', '#16a085',
  '#34495e', '#d35400', '#7f8c8d', '#e84393',
  // hoodie greys
  '#8a8d91', '#5b5e63', '#b9bcc0',
  // varsity black / grey
  '#15161a', '#3d4044',
  // denim blues
  '#2f4f7a', '#4f7099', '#1d2f4d',
  // orange / blue (abstract team-adjacent)
  '#f06d1f', '#1a5fa8',
];
