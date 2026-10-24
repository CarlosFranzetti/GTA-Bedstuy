import type { Painter } from '../canvas';
import { blotches, hsl, speckle, wrapVariant } from './util';

export const LEAF_VARIANTS = 3;

/** 256px mottled greens. Variants: summer green, deep green, yellow-green. */
export const treeLeavesPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, LEAF_VARIANTS);
  const hue = [105, 120, 82][v];
  ctx.fillStyle = hsl(hue, 38, v === 1 ? 17 : 24);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = hsl(hue + rng.range(-18, 18), rng.range(30, 55), rng.range(14, 40));
    ctx.beginPath();
    ctx.arc(rng.range(0, w), rng.range(0, h), rng.range(2, 7), 0, Math.PI * 2);
    ctx.fill();
  }
  blotches(ctx, w, h, rng, 12, '#000000', 0.12, 10, 30);
};

/** 256px bark. */
export const treeTrunkPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = hsl(28, 18, 22);
  ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) {
    ctx.fillStyle = hsl(28 + rng.range(-4, 4), 16, rng.range(12, 30));
    ctx.fillRect(x, 0, rng.range(1, 4), h);
  }
  speckle(ctx, w, h, rng, 500, ['#000000', '#6b5a48'], 1, 3, 0.2);
};

export const SKIN_TONES: readonly string[] = ['#f1c9a5', '#e0ac82', '#c68642', '#a06a3c', '#7a4a2a', '#4f301d'];
export const CLOTH_COLORS: readonly string[] = [
  '#c0392b', '#2c3e50', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1', '#e67e22', '#16a085',
  '#34495e', '#d35400', '#7f8c8d', '#e84393',
];
