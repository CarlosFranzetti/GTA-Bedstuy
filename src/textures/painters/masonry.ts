import type { Painter } from '../canvas';
import { auxSpeckle, blotches, gray, grimeStreaks, hsl, sootStreak, speckle, withAlpha, wrapVariant } from './util';

interface BrickPal { h: number; s: number; l: number; jl: number; mortar: string; painted: boolean; }
const BRICK_PALS: BrickPal[] = [
  { h: 8, s: 46, l: 36, jl: 7, mortar: '#b4aa9c', painted: false },   // red
  { h: 21, s: 34, l: 26, jl: 6, mortar: '#a39786', painted: false },  // brown
  { h: 42, s: 12, l: 84, jl: 2, mortar: '#b7b2a6', painted: true },   // painted white
  { h: 215, s: 7, l: 54, jl: 2, mortar: '#6f7276', painted: true },   // painted grey
];

/**
 * 1024px tile (works at any size: all pixel constants scale with w/512), 16 courses x 6 bricks, running bond.
 * Tile covers roughly 1.3 m. Variants: red/brown/white/grey; a few replaced lighter bricks on the unpainted ones.
 * Relief (aux): mortar recessed, each brick chamfered with a slight per-brick bump (aux rng only, so the normal
 * map is identical for every variant and can be shared).
 */
export const brickPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const pal = BRICK_PALS[wrapVariant(variant, 4)];
  const k = w / 512;
  const j = 1.5 * k;
  ctx.fillStyle = pal.mortar;
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(55);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(245);
      aux.rough.fillRect(0, 0, w, h);
    }
  }
  const rows = 16;
  const per = 6;
  const rh = h / rows;
  const bw = w / per;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw / 2);
    for (let i = 0; i <= per; i++) {
      const x = i * bw - off;
      const hue = pal.h + rng.range(-4, 4);
      let l = pal.l + rng.range(-pal.jl, pal.jl);
      let s = pal.s + rng.range(-5, 5);
      let hh = hue;
      const replaced = rng.chance(0.03);
      if (replaced && !pal.painted) {
        l += rng.range(9, 14);
        s += 6;
        hh += 5;
      }
      ctx.fillStyle = hsl(hh, s, l);
      ctx.fillRect(x + j, r * rh + j, bw - 2 * j, rh - 2 * j);
      withAlpha(ctx, 0.18, () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + j, r * rh + rh - 4 * k, bw - 2 * j, 2.5 * k);
      });
      if (aux) {
        const a = aux.rng.next();
        aux.height.fillStyle = gray(112 + a * 30);
        aux.height.fillRect(x + j, r * rh + j, bw - 2 * j, rh - 2 * j);
        aux.height.fillStyle = gray(150 + a * 30);
        aux.height.fillRect(x + j + 2.2 * k, r * rh + j + 2.2 * k, bw - 2 * j - 4.4 * k, rh - 2 * j - 4.4 * k);
        if (aux.rough) {
          aux.rough.fillStyle = gray(212 + a * 22);
          aux.rough.fillRect(x + j, r * rh + j, bw - 2 * j, rh - 2 * j);
        }
      }
    }
  }
  if (pal.painted) {
    // peeling paint showing old red brick
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0.5, 0.85);
      const px = rng.range(0, w);
      const py = rng.range(0, h);
      const pw = rng.range(8, 36);
      const ph = rng.range(4, 18);
      withAlpha(ctx, a, () => {
        ctx.fillStyle = hsl(8 + rng.range(-4, 4), 42, 32);
        ctx.fillRect(px, py, pw, ph);
      });
      if (aux) {
        withAlpha(aux.height, a * 0.7, () => {
          aux.height.fillStyle = gray(92);
          aux.height.fillRect(px, py, pw, ph);
        });
        if (aux.rough) {
          withAlpha(aux.rough, a, () => {
            aux.rough!.fillStyle = gray(250);
            aux.rough!.fillRect(px, py, pw, ph);
          });
        }
      }
    }
  }
  grimeStreaks(ctx, w, h, rng, 10, pal.painted ? 0.1 : 0.08);
  speckle(ctx, w, h, rng, Math.round(500 * k * k), ['#000000', '#ffffff'], 1, 2 * k, 0.06);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(2500 * k * k), [90, 100, 175, 190], 1, 2 * k, 0.5);
};

/**
 * 1024px tile = 2 m x 2 m: four ashlar courses of varied block widths, warm chocolate with grime.
 * The bottom course is darker (weathered base course) and sooty streaks run down from sill lines.
 */
export const brownstonePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, 2);
  const k = w / 512;
  const baseH = v === 0 ? 17 : 14;
  const baseS = v === 0 ? 36 : 44;
  const baseL = v === 0 ? 25 : 31;
  ctx.fillStyle = '#2a1a13';
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(52);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(245);
      aux.rough.fillRect(0, 0, w, h);
    }
  }
  const rows = 4;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const baseCourse = r === rows - 1;
    const n = rng.int(2, 3);
    const cuts: number[] = [];
    const start = rng.range(0, w);
    for (let i = 0; i < n; i++) cuts.push(start + (i * w) / n + rng.range(-w / (n * 4), w / (n * 4)));
    for (let i = 0; i < n; i++) {
      const x0 = cuts[i];
      const x1 = i + 1 < n ? cuts[i + 1] : cuts[0] + w;
      const bwid = x1 - x0;
      ctx.fillStyle = hsl(
        baseH + rng.range(-3, 3),
        baseS + rng.range(-4, 4) - (baseCourse ? 4 : 0),
        baseL + rng.range(-3.5, 3.5) - (baseCourse ? 5 : 0),
      );
      const rough = rng.range(0, 1);
      for (const dx of [0, -w, w]) {
        const bx = x0 + dx;
        if (bx + bwid < 0 || bx > w) continue;
        ctx.fillRect(bx + 2 * k, r * rh + 2 * k, bwid - 4 * k, rh - 4 * k);
        withAlpha(ctx, 0.22, () => {
          ctx.fillStyle = '#ffd9b0';
          ctx.fillRect(bx + 2 * k, r * rh + 2 * k, bwid - 4 * k, 2 * k);
          ctx.fillRect(bx + 2 * k, r * rh + 2 * k, 2 * k, rh - 4 * k);
        });
        withAlpha(ctx, 0.3, () => {
          ctx.fillStyle = '#000000';
          ctx.fillRect(bx + 2 * k, r * rh + rh - 5 * k, bwid - 4 * k, 3 * k);
          ctx.fillRect(bx + bwid - 5 * k, r * rh + 2 * k, 3 * k, rh - 4 * k);
        });
        if (aux) {
          aux.height.fillStyle = gray(112 + rough * 14);
          aux.height.fillRect(bx + 2 * k, r * rh + 2 * k, bwid - 4 * k, rh - 4 * k);
          aux.height.fillStyle = gray(140 + rough * 20);
          aux.height.fillRect(bx + 5 * k, r * rh + 5 * k, bwid - 10 * k, rh - 10 * k);
          if (aux.rough) {
            aux.rough.fillStyle = gray((baseCourse ? 222 : 200) + rough * 14);
            aux.rough.fillRect(bx + 2 * k, r * rh + 2 * k, bwid - 4 * k, rh - 4 * k);
          }
        }
      }
    }
  }
  grimeStreaks(ctx, w, h, rng, 14, 0.16, '#0c0806');
  // sooty streaks running down from sill ledges
  const sills = rng.int(2, 3);
  for (let i = 0; i < sills; i++) {
    const sw = rng.range(22, 44) * k;
    const sx = rng.range(0, w - sw);
    const sy = rng.range(0.12, 0.4) * h;
    const len = rng.range(0.3, 0.5) * h;
    withAlpha(ctx, 0.35, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(sx - 2 * k, sy - 2 * k, sw + 4 * k, 2 * k);
    });
    sootStreak(ctx, sx, sy, sw, len, rng.range(0.16, 0.26));
  }
  blotches(ctx, w, h, rng, 10, '#000000', 0.08, 10 * k, 36 * k);
  speckle(ctx, w, h, rng, Math.round(800 * k * k), ['#000000', '#e0b890'], 1, 2.5 * k, 0.08);
  if (aux) {
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(3000 * k * k), [95, 108, 150, 165], 1, 2.5 * k, 0.5);
    // rustication pits on the base course
    auxSpeckle(aux.height, aux.rng, 0, rh * (rows - 1), w, rh, Math.round(1400 * k * k), [70, 85], 1.5 * k, 4 * k, 0.6);
  }
};

/** 1024px or 512px tile = 2 m: pale limestone ashlar with thin joints. */
export const limestonePainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  const k = w / 512;
  ctx.fillStyle = '#a79f8d';
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(70);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(240);
      aux.rough.fillRect(0, 0, w, h);
    }
  }
  const rows = 4;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const n = rng.int(2, 3);
    const start = rng.range(0, w);
    for (let i = 0; i < n; i++) {
      const x0 = start + (i * w) / n;
      ctx.fillStyle = hsl(42 + rng.range(-3, 3), 20 + rng.range(-3, 3), 78 + rng.range(-4, 4));
      for (const dx of [0, -w, w]) {
        ctx.fillRect(x0 + dx + k, r * rh + k, w / n - 2 * k, rh - 2 * k);
        if (aux) {
          aux.height.fillStyle = gray(138);
          aux.height.fillRect(x0 + dx + k, r * rh + k, w / n - 2 * k, rh - 2 * k);
          aux.height.fillStyle = gray(150);
          aux.height.fillRect(x0 + dx + 3 * k, r * rh + 3 * k, w / n - 6 * k, rh - 6 * k);
          if (aux.rough) {
            aux.rough.fillStyle = gray(205);
            aux.rough.fillRect(x0 + dx + k, r * rh + k, w / n - 2 * k, rh - 2 * k);
          }
        }
      }
    }
  }
  grimeStreaks(ctx, w, h, rng, 8, 0.07, '#3a3226');
  speckle(ctx, w, h, rng, Math.round(700 * k * k), ['#000000', '#ffffff'], 1, 2 * k, 0.07);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(1500 * k * k), [110, 125, 165, 180], 1, 2 * k, 0.4);
};

/**
 * 512px cornice: limestone colour with a horizontal moulding profile (ridges). Light from above: rising profile
 * lightens, falling darkens. Height (aux) carries the profile itself.
 */
export const cornicePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  limestonePainter(ctx, w, h, rng, variant);
  const prof = (t: number): number =>
    0.5 + 0.34 * Math.sin(2 * Math.PI * (2 * t + 0.1)) + 0.14 * Math.sin(2 * Math.PI * 6 * t);
  const step = Math.max(1, Math.round(h / 256));
  const e = 1 / h;
  for (let y = 0; y < h; y += step) {
    const t = (y + step / 2) / h;
    const d = (prof(t + e) - prof(t - e)) / (2 * e) / h; // slope per pixel, ~[-0.03,0.03]
    const a = Math.min(0.32, Math.abs(d) * 14);
    if (a > 0.01) {
      withAlpha(ctx, a, () => {
        ctx.fillStyle = d > 0 ? '#ffffff' : '#1a140c';
        ctx.fillRect(0, y, w, step);
      });
    }
    if (aux) {
      aux.height.fillStyle = gray(40 + prof(t) * 190);
      aux.height.fillRect(0, y, w, step);
    }
  }
  if (aux) {
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 1500, [100, 150], 1, 2, 0.3);
    if (aux.rough) {
      aux.rough.fillStyle = gray(225);
      aux.rough.fillRect(0, 0, w, h);
    }
  }
};
