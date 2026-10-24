import type { Painter } from '../canvas';
import { auxSpeckle, blotches, crack, gray, hsl, speckle, withAlpha, wrapVariant } from './util';

/**
 * Variant 0 fresh dark asphalt; variant 1 worn: lighter, more cracks and patches. 512px.
 * Two faint tyre-polish lanes (slightly darker + smoother) run along v. Relief: cracks recessed, patches raised;
 * roughness: darker patches / polished lanes are smoother.
 */
export const asphaltPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const worn = wrapVariant(variant, 2) === 1;
  ctx.fillStyle = worn ? '#55575b' : '#33353a';
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(128);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(worn ? 228 : 236);
      aux.rough.fillRect(0, 0, w, h);
    }
  }
  speckle(ctx, w, h, rng, worn ? 7000 : 6000,
    worn ? ['#6a6c70', '#46484c', '#7c7e82', '#3c3e42'] : ['#44464b', '#26282c', '#52545a', '#1e2024'], 1, 2.5, 0.7);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 6000, [92, 110, 150, 168], 1, 2.5, 0.55);
  blotches(ctx, w, h, rng, worn ? 24 : 10, worn ? '#2a2b2e' : '#1c1d20', 0.12, 20, 70,
    aux?.rough ? { ctx: aux.rough, color: gray(170) } : null);
  // tyre-polish lanes: soft-edged vertical strips (nested rects), darker and smoother
  for (const cx of [0.3, 0.7]) {
    for (const [wd, a] of [[0.16, 0.025], [0.12, 0.03], [0.08, 0.035]] as const) {
      withAlpha(ctx, a, () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(w * (cx - wd / 2), 0, w * wd, h);
      });
      if (aux?.rough) {
        withAlpha(aux.rough, 0.22, () => {
          aux.rough!.fillStyle = gray(150);
          aux.rough!.fillRect(w * (cx - wd / 2), 0, w * wd, h);
        });
      }
    }
  }
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
    if (aux) {
      aux.height.fillStyle = gray(152);
      aux.height.fillRect(px, py, pw, ph);
      aux.height.strokeStyle = gray(70);
      aux.height.lineWidth = 2.5;
      aux.height.strokeRect(px, py, pw, ph);
      if (aux.rough) {
        aux.rough.fillStyle = gray(165);
        aux.rough.fillRect(px, py, pw, ph);
      }
    }
  }
  const cracks = worn ? 14 : 5;
  for (let i = 0; i < cracks; i++) {
    const cw = rng.range(1, 2.2);
    const mirrors = aux
      ? [{ ctx: aux.height, color: gray(18), width: cw * 1.6 }, ...(aux.rough ? [{ ctx: aux.rough, color: gray(255), width: cw * 2 }] : [])]
      : undefined;
    crack(ctx, rng, rng.range(0, w), rng.range(0, h), rng.int(10, 26), rng.range(6, 14), 'rgba(8,8,10,0.75)', cw, mirrors);
  }
};

/**
 * 512px tile = 3 m: 2x2 slabs (1.5 m joints). Variant 0 sidewalk (light, stains); variant 1 darker ground plane.
 * All constants scale with w/256 so any size works. Relief: joints recessed, pebbly surface.
 */
export const concretePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const dark = wrapVariant(variant, 2) === 1;
  const k = w / 256;
  const slab = w / 2;
  ctx.fillStyle = dark ? '#5d5c58' : '#a9a7a0';
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(30);
    aux.height.fillRect(0, 0, w, h);
  }
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      ctx.fillStyle = hsl(40, 4, (dark ? 36 : 66) + rng.range(-3, 3));
      ctx.fillRect(sx * slab + 2 * k, sy * slab + 2 * k, slab - 4 * k, slab - 4 * k);
      if (aux) {
        aux.height.fillStyle = gray(120);
        aux.height.fillRect(sx * slab + 2 * k, sy * slab + 2 * k, slab - 4 * k, slab - 4 * k);
        aux.height.fillStyle = gray(136);
        aux.height.fillRect(sx * slab + 5 * k, sy * slab + 5 * k, slab - 10 * k, slab - 10 * k);
      }
    }
  }
  const kk = k * k;
  speckle(ctx, w, h, rng, Math.round(2500 * kk), dark ? ['#2e2d2a', '#7a7974'] : ['#8a8881', '#c6c4bc', '#74726c'], 1, 2 * k, 0.5);
  blotches(ctx, w, h, rng, dark ? 8 : 12, dark ? '#1a1916' : '#4b4338', 0.1, 6 * k, 26 * k);
  // gum spots
  if (!dark) speckle(ctx, w, h, rng, 20, ['#58554f'], 2 * k, 3.5 * k, 0.6);
  if (aux) {
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(9000 * kk), [105, 120, 150, 170], 1, 2.2 * k, 0.55);
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(900 * kk), [180, 190], 1.5 * k, 3 * k, 0.6);
  }
  // joint lines
  ctx.fillStyle = dark ? '#1f1e1c' : '#5f5d57';
  ctx.fillRect(0, 0, w, 2 * k);
  ctx.fillRect(0, 0, 2 * k, h);
  ctx.fillRect(0, slab - k, w, 2 * k);
  ctx.fillRect(slab - k, 0, 2 * k, h);
  withAlpha(ctx, 0.4, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2 * k, 2 * k, w, k);
  });
  if (aux) {
    aux.height.fillStyle = gray(22);
    aux.height.fillRect(0, 0, w, 2.5 * k);
    aux.height.fillRect(0, 0, 2.5 * k, h);
    aux.height.fillRect(0, slab - 1.25 * k, w, 2.5 * k);
    aux.height.fillRect(slab - 1.25 * k, 0, 2.5 * k, h);
  }
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

/** 512px: tar roof with gravel speckle and seams. Relief: gravel bumps, seams recessed. */
export const roofPainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  ctx.fillStyle = '#2d2c2b';
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(120);
    aux.height.fillRect(0, 0, w, h);
  }
  blotches(ctx, w, h, rng, 14, '#1a1918', 0.2, 14, 50);
  speckle(ctx, w, h, rng, 5000, ['#555250', '#6b675f', '#3b3a38', '#7e786b', '#1d1c1b'], 1, 3, 0.8);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 11000, [70, 100, 160, 200, 235], 1, 3, 0.85);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < 4; i++) ctx.fillRect(0, (i * h) / 4, w, 2);
  if (aux) {
    aux.height.fillStyle = gray(35);
    for (let i = 1; i < 4; i++) aux.height.fillRect(0, (i * h) / 4, w, 3);
  }
};

/** Brooklyn bluestone sidewalk flags (stub: replaced by the ground-texture pass). */
export const bluestonePainter: Painter = (ctx, w, h) => { ctx.fillStyle = '#5d6670'; ctx.fillRect(0, 0, w, h); };
/** Granite curb stone (stub). */
export const granitePainter: Painter = (ctx, w, h) => { ctx.fillStyle = '#8d8a84'; ctx.fillRect(0, 0, w, h); };
/** Cast-iron manhole cover with a generic pattern (stub). */
export const manholePainter: Painter = (ctx, w, h) => { ctx.fillStyle = '#3a3a38'; ctx.fillRect(0, 0, w, h); };
/** Storm-drain grate (stub). */
export const gratePainter: Painter = (ctx, w, h) => { ctx.fillStyle = '#2f3031'; ctx.fillRect(0, 0, w, h); };
