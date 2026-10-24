import type { Painter } from '../canvas';
import { blotches, grimeStreaks, hsl, speckle, withAlpha, wrapVariant } from './util';

interface BrickPal { h: number; s: number; l: number; jl: number; mortar: string; painted: boolean; }
const BRICK_PALS: BrickPal[] = [
  { h: 8, s: 46, l: 36, jl: 7, mortar: '#b4aa9c', painted: false },   // red
  { h: 21, s: 34, l: 26, jl: 6, mortar: '#a39786', painted: false },  // brown
  { h: 42, s: 12, l: 84, jl: 2, mortar: '#b7b2a6', painted: true },   // painted white
  { h: 215, s: 7, l: 54, jl: 2, mortar: '#6f7276', painted: true },   // painted grey
];

/** 512px tile, 16 courses x 6 bricks, running bond. Tile covers roughly 1.3 m. Variants: red/brown/white/grey. */
export const brickPainter: Painter = (ctx, w, h, rng, variant) => {
  const pal = BRICK_PALS[wrapVariant(variant, 4)];
  ctx.fillStyle = pal.mortar;
  ctx.fillRect(0, 0, w, h);
  const rows = 16;
  const per = 6;
  const rh = h / rows;
  const bw = w / per;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw / 2);
    for (let i = 0; i <= per; i++) {
      const x = i * bw - off;
      const hue = pal.h + rng.range(-4, 4);
      const l = pal.l + rng.range(-pal.jl, pal.jl);
      ctx.fillStyle = hsl(hue, pal.s + rng.range(-5, 5), l);
      ctx.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3);
      withAlpha(ctx, 0.18, () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 1.5, r * rh + rh - 4, bw - 3, 2.5);
      });
    }
  }
  if (pal.painted) {
    // peeling paint showing old red brick
    for (let i = 0; i < 9; i++) {
      withAlpha(ctx, rng.range(0.5, 0.85), () => {
        ctx.fillStyle = hsl(8 + rng.range(-4, 4), 42, 32);
        ctx.fillRect(rng.range(0, w), rng.range(0, h), rng.range(8, 36), rng.range(4, 18));
      });
    }
  }
  grimeStreaks(ctx, w, h, rng, 10, pal.painted ? 0.1 : 0.08);
  speckle(ctx, w, h, rng, 500, ['#000000', '#ffffff'], 1, 2, 0.06);
};

/** 512px tile = 2 m x 2 m: four ashlar courses of varied block widths, warm chocolate with grime. */
export const brownstonePainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, 2);
  const baseH = v === 0 ? 17 : 14;
  const baseS = v === 0 ? 36 : 44;
  const baseL = v === 0 ? 25 : 31;
  ctx.fillStyle = '#2a1a13';
  ctx.fillRect(0, 0, w, h);
  const rows = 4;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const n = rng.int(2, 3);
    const cuts: number[] = [];
    const start = rng.range(0, w);
    for (let i = 0; i < n; i++) cuts.push(start + (i * w) / n + rng.range(-w / (n * 4), w / (n * 4)));
    for (let i = 0; i < n; i++) {
      const x0 = cuts[i];
      const x1 = i + 1 < n ? cuts[i + 1] : cuts[0] + w;
      const bwid = x1 - x0;
      ctx.fillStyle = hsl(baseH + rng.range(-3, 3), baseS + rng.range(-4, 4), baseL + rng.range(-3.5, 3.5));
      for (const dx of [0, -w, w]) {
        const bx = x0 + dx;
        if (bx + bwid < 0 || bx > w) continue;
        ctx.fillRect(bx + 2, r * rh + 2, bwid - 4, rh - 4);
        withAlpha(ctx, 0.22, () => {
          ctx.fillStyle = '#ffd9b0';
          ctx.fillRect(bx + 2, r * rh + 2, bwid - 4, 2);
          ctx.fillRect(bx + 2, r * rh + 2, 2, rh - 4);
        });
        withAlpha(ctx, 0.3, () => {
          ctx.fillStyle = '#000000';
          ctx.fillRect(bx + 2, r * rh + rh - 5, bwid - 4, 3);
          ctx.fillRect(bx + bwid - 5, r * rh + 2, 3, rh - 4);
        });
      }
    }
  }
  grimeStreaks(ctx, w, h, rng, 14, 0.16, '#0c0806');
  blotches(ctx, w, h, rng, 10, '#000000', 0.08, 10, 36);
  speckle(ctx, w, h, rng, 800, ['#000000', '#e0b890'], 1, 2.5, 0.08);
};

/** 512px tile = 2 m: pale limestone ashlar with thin joints. */
export const limestonePainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#a79f8d';
  ctx.fillRect(0, 0, w, h);
  const rows = 4;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const n = rng.int(2, 3);
    const start = rng.range(0, w);
    for (let i = 0; i < n; i++) {
      const x0 = start + (i * w) / n;
      ctx.fillStyle = hsl(42 + rng.range(-3, 3), 20 + rng.range(-3, 3), 78 + rng.range(-4, 4));
      for (const dx of [0, -w, w]) ctx.fillRect(x0 + dx + 1, r * rh + 1, w / n - 2, rh - 2);
    }
  }
  grimeStreaks(ctx, w, h, rng, 8, 0.07, '#3a3226');
  speckle(ctx, w, h, rng, 700, ['#000000', '#ffffff'], 1, 2, 0.07);
};
