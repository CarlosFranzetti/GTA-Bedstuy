import type { Painter } from '../canvas';
import { hsl, withAlpha, wrapVariant } from './util';

export const WINDOW_VARIANTS = 4;
export const STOREFRONT_VARIANTS = 2;

/** 256px: pale frame, two sashes of dark blue-grey glass, a sill along the bottom. */
export const windowPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, WINDOW_VARIANTS);
  const sill = h * 0.08;
  const fh = h - sill;
  ctx.fillStyle = '#d6d1c4';
  ctx.fillRect(0, 0, w, fh);
  // sill + shadow
  ctx.fillStyle = '#8b867a';
  ctx.fillRect(0, fh, w, 3);
  ctx.fillStyle = '#c9c3b4';
  ctx.fillRect(0, fh + 3, w, sill - 3);
  const m = w * 0.09;
  const mid = fh * 0.48;
  const rail = 8;
  const panes: [number, number, number, number][] = [
    [m, m, w - 2 * m, mid - m - rail / 2],
    [m, mid + rail / 2, w - 2 * m, fh - m - mid - rail / 2],
  ];
  for (const [x, y, pw, ph] of panes) {
    ctx.fillStyle = hsl(212 + rng.range(-4, 4), 22, 15 + (v === 3 ? 6 : 0) + rng.range(-1.5, 1.5));
    ctx.fillRect(x, y, pw, ph);
    withAlpha(ctx, v === 3 ? 0.2 : 0.11, () => {
      ctx.fillStyle = '#cfe3f5';
      ctx.beginPath();
      ctx.moveTo(x + pw * 0.15, y);
      ctx.lineTo(x + pw * 0.45, y);
      ctx.lineTo(x + pw * 0.2, y + ph);
      ctx.lineTo(x, y + ph);
      ctx.lineTo(x, y + ph * 0.5);
      ctx.closePath();
      ctx.fill();
    });
  }
  const low = panes[1];
  if (v === 1) {
    // pulled blind on the lower sash
    withAlpha(ctx, 0.85, () => {
      ctx.fillStyle = '#cdc5ac';
      ctx.fillRect(low[0], low[1], low[2], low[3] * 0.7);
    });
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = low[1] + 6; y < low[1] + low[3] * 0.7; y += 7) ctx.fillRect(low[0], y, low[2], 1.5);
  } else if (v === 2) {
    // curtains
    const col = hsl(rng.range(0, 360), 35, 38);
    for (const [x, y, pw, ph] of panes) {
      withAlpha(ctx, 0.9, () => {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, pw * 0.28, ph);
        ctx.fillRect(x + pw * 0.72, y, pw * 0.28, ph);
      });
    }
  }
  // meeting rail + outer frame lines
  ctx.fillStyle = '#e4dfd2';
  ctx.fillRect(m, mid - rail / 2, w - 2 * m, rail);
  ctx.strokeStyle = '#7f7a6e';
  ctx.lineWidth = 2;
  ctx.strokeRect(m, m, w - 2 * m, fh - 2 * m);
  ctx.strokeRect(1, 1, w - 2, fh - 2);
};

/** Emissive map for the window: black frame, lit glass at a per-variant brightness. */
export const windowEmissivePainter: Painter = (ctx, w, h, _rng, variant) => {
  const v = wrapVariant(variant, WINDOW_VARIANTS);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const sill = h * 0.08;
  const fh = h - sill;
  const m = w * 0.09;
  const mid = fh * 0.48;
  const rail = 8;
  const lvl = [[255, 255], [255, 110], [200, 200], [70, 70]][v];
  const shade = (n: number): string => `rgb(${n},${n},${n})`;
  ctx.fillStyle = shade(lvl[0]);
  ctx.fillRect(m, m, w - 2 * m, mid - m - rail / 2);
  ctx.fillStyle = shade(lvl[1]);
  ctx.fillRect(m, mid + rail / 2, w - 2 * m, fh - m - mid - rail / 2);
};

/** 512x256: aluminium mullions, lighter glass with reflections, dark bulkhead; variant 1 has paper posters. */
export const storefrontPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, STOREFRONT_VARIANTS);
  ctx.fillStyle = '#b9bec2';
  ctx.fillRect(0, 0, w, h);
  const bulk = h * 0.2;
  const m = 10;
  const gx = m, gy = m, gw = w - 2 * m, gh = h - bulk - m;
  ctx.fillStyle = hsl(200 + rng.range(-5, 5), 24, 43);
  ctx.fillRect(gx, gy, gw, gh);
  withAlpha(ctx, 0.16, () => {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const x = gx + gw * (0.1 + i * 0.33);
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + 40, gy);
      ctx.lineTo(x - 30, gy + gh);
      ctx.lineTo(x - 70, gy + gh);
      ctx.closePath();
      ctx.fill();
    }
  });
  if (v === 1) {
    const cols = ['#e8d34a', '#e9edf0', '#d94a4a', '#4aa3d9'];
    for (let i = 0; i < 6; i++) {
      withAlpha(ctx, 0.9, () => {
        ctx.fillStyle = cols[Math.floor(rng.next() * cols.length)];
        ctx.fillRect(gx + rng.range(10, gw - 70), gy + rng.range(10, gh - 60), rng.range(30, 60), rng.range(30, 50));
      });
    }
  }
  // mullions
  ctx.fillStyle = '#9da2a6';
  for (let i = 1; i < 4; i++) ctx.fillRect(gx + (gw * i) / 4 - 3, gy, 6, gh);
  // bulkhead
  ctx.fillStyle = '#2a2b2e';
  ctx.fillRect(gx, gy + gh + 4, gw, bulk - 4 - 2);
  ctx.strokeStyle = '#6c7074';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);
};

export const storefrontEmissivePainter: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const bulk = h * 0.2;
  const m = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(m, m, w - 2 * m, h - bulk - m);
  ctx.fillStyle = '#000000';
  for (let i = 1; i < 4; i++) ctx.fillRect(m + ((w - 2 * m) * i) / 4 - 3, m, 6, h - bulk - m);
};
