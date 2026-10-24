import type { Painter } from '../canvas';
import { blotches, crack, hsl, speckle, withAlpha, wrapVariant } from './util';

/** Variant 0 fresh dark asphalt; variant 1 worn: lighter, more cracks and patches. 512px. */
export const asphaltPainter: Painter = (ctx, w, h, rng, variant) => {
  const worn = wrapVariant(variant, 2) === 1;
  ctx.fillStyle = worn ? '#55575b' : '#33353a';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, worn ? 7000 : 6000,
    worn ? ['#6a6c70', '#46484c', '#7c7e82', '#3c3e42'] : ['#44464b', '#26282c', '#52545a', '#1e2024'], 1, 2.5, 0.7);
  blotches(ctx, w, h, rng, worn ? 24 : 10, worn ? '#2a2b2e' : '#1c1d20', 0.12, 20, 70);
  // patches
  const patches = worn ? 6 : 2;
  for (let i = 0; i < patches; i++) {
    const pw = rng.range(50, 150);
    const ph = rng.range(30, 90);
    const px = rng.range(0, w - pw);
    const py = rng.range(0, h - ph);
    ctx.fillStyle = hsl(220, 4, worn ? rng.range(26, 36) : rng.range(15, 20));
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#0d0d0f';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
  }
  const cracks = worn ? 14 : 5;
  for (let i = 0; i < cracks; i++) {
    crack(ctx, rng, rng.range(0, w), rng.range(0, h), rng.int(10, 26), rng.range(6, 14), 'rgba(8,8,10,0.75)', rng.range(1, 2.2));
  }
};

/** 256px tile = 3 m: 2x2 slabs (1.5 m joints). Variant 0 sidewalk (light, stains); variant 1 darker ground plane. */
export const concretePainter: Painter = (ctx, w, h, rng, variant) => {
  const dark = wrapVariant(variant, 2) === 1;
  const slab = w / 2;
  ctx.fillStyle = dark ? '#5d5c58' : '#a9a7a0';
  ctx.fillRect(0, 0, w, h);
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      ctx.fillStyle = hsl(40, 4, (dark ? 36 : 66) + rng.range(-3, 3));
      ctx.fillRect(sx * slab + 2, sy * slab + 2, slab - 4, slab - 4);
    }
  }
  speckle(ctx, w, h, rng, 2500, dark ? ['#2e2d2a', '#7a7974'] : ['#8a8881', '#c6c4bc', '#74726c'], 1, 2, 0.5);
  blotches(ctx, w, h, rng, dark ? 8 : 12, dark ? '#1a1916' : '#4b4338', 0.1, 6, 26);
  // gum spots
  if (!dark) speckle(ctx, w, h, rng, 20, ['#58554f'], 2, 3.5, 0.6);
  // joint lines
  ctx.fillStyle = dark ? '#1f1e1c' : '#5f5d57';
  ctx.fillRect(0, 0, w, 2);
  ctx.fillRect(0, 0, 2, h);
  ctx.fillRect(0, slab - 1, w, 2);
  ctx.fillRect(slab - 1, 0, 2, h);
  withAlpha(ctx, 0.4, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 2, w, 1);
  });
};

/** 256px: asphalt with white zebra bars across the tile (4 bars per tile, bars run along v). */
export const crosswalkPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#33353a';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, 1500, ['#44464b', '#26282c'], 1, 2, 0.6);
  const bar = w / 8;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#e9e7df';
    ctx.fillRect(i * 2 * bar + bar * 0.15, 0, bar * 0.7 + bar * 0.15, h);
  }
  // wear
  speckle(ctx, w, h, rng, 400, ['#33353a', '#55575b'], 1, 4, 0.5);
};

/** 512px: tar roof with gravel speckle and seams. */
export const roofPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#2d2c2b';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, rng, 14, '#1a1918', 0.2, 14, 50);
  speckle(ctx, w, h, rng, 5000, ['#555250', '#6b675f', '#3b3a38', '#7e786b', '#1d1c1b'], 1, 3, 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < 4; i++) ctx.fillRect(0, (i * h) / 4, w, 2);
};
