import type { Painter } from '../canvas';
import { gray, hsl, withAlpha, wrapVariant } from './util';

export const WINDOW_VARIANTS = 4;
export const STOREFRONT_VARIANTS = 2;

type Pane = readonly [number, number, number, number];

interface WindowLayout {
  fh: number;
  m: number;
  mid: number;
  rail: number;
  panes: readonly [Pane, Pane];
}

/** Shared geometry for the window colour and emissive maps so both always agree. */
function windowLayout(w: number, h: number): WindowLayout {
  const sill = h * 0.08;
  const fh = h - sill;
  const m = w * 0.09;
  const mid = fh * 0.48;
  const rail = 8;
  return {
    fh, m, mid, rail,
    panes: [
      [m, m, w - 2 * m, mid - m - rail / 2],
      [m, mid + rail / 2, w - 2 * m, fh - m - mid - rail / 2],
    ],
  };
}

const CURTAIN_COLORS = ['#8a4b4b', '#4b6b8a', '#8a7a4b', '#5b4b6b', '#4b7a5e', '#b09a78'] as const;

/**
 * 256px: pale frame, two sashes, a sill along the bottom.
 * Variants: 0 clear glass with blinds half down, 1 curtains, 2 dark, 3 lit warm with a visible ceiling line.
 * Night glow (see windowEmissivePainter): only 0 and 3.
 */
export const windowPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, WINDOW_VARIANTS);
  const { fh, m, mid, rail, panes } = windowLayout(w, h);
  const sill = h - fh;
  ctx.fillStyle = '#d6d1c4';
  ctx.fillRect(0, 0, w, fh);
  // sill + shadow
  ctx.fillStyle = '#8b867a';
  ctx.fillRect(0, fh, w, 3);
  ctx.fillStyle = '#c9c3b4';
  ctx.fillRect(0, fh + 3, w, sill - 3);

  for (const [x, y, pw, ph] of panes) {
    if (v === 0) ctx.fillStyle = hsl(205 + rng.range(-4, 4), 18, 26 + rng.range(-1.5, 1.5));
    else if (v === 1) ctx.fillStyle = hsl(212 + rng.range(-4, 4), 22, 17 + rng.range(-1.5, 1.5));
    else if (v === 2) ctx.fillStyle = hsl(214 + rng.range(-4, 4), 24, 8 + rng.range(-1.5, 1.5));
    else ctx.fillStyle = hsl(36 + rng.range(-3, 3), 62, 62 + rng.range(-2, 2));
    ctx.fillRect(x, y, pw, ph);
  }

  if (v === 3) {
    // lit interior: ceiling band with a visible ceiling/wall line, warm wall, lamp glow, darker floor edge
    const [x0, y0, pw0, ph0] = panes[0];
    const ceilH = ph0 * 0.16;
    ctx.fillStyle = hsl(40, 34, 80);
    ctx.fillRect(x0, y0, pw0, ceilH);
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(x0, y0 + ceilH, pw0, 1.5);
    withAlpha(ctx, 0.22, () => {
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.ellipse(x0 + pw0 * 0.62, y0 + ph0 * 0.55, pw0 * 0.3, ph0 * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    const [x1, y1, pw1, ph1] = panes[1];
    withAlpha(ctx, 0.2, () => {
      ctx.fillStyle = '#6a4a22';
      ctx.fillRect(x1, y1 + ph1 * 0.8, pw1, ph1 * 0.2);
    });
    withAlpha(ctx, 0.35, () => {
      ctx.fillStyle = '#4a3418';
      ctx.fillRect(x1 + pw1 * 0.12, y1 + ph1 * 0.5, pw1 * 0.3, ph1 * 0.3);
    });
  }

  if (v === 0) {
    // blinds half down: slatted blind over the top half of the whole opening
    const bx = m, by = m, bw = w - 2 * m;
    const bh = (fh - 2 * m) * 0.5;
    ctx.fillStyle = '#d9d3c0';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = by + 4; y < by + bh - 4; y += 5) ctx.fillRect(bx, y, bw, 1.5);
    ctx.fillStyle = '#b5ad94';
    ctx.fillRect(bx, by + bh - 3, bw, 3);
    ctx.fillStyle = '#8a846f';
    ctx.fillRect(bx + bw * 0.8, by + bh, 1.5, 14);
    ctx.fillRect(bx + bw * 0.8 - 2, by + bh + 14, 5, 4);
  } else if (v === 1) {
    // curtains drawn to the sides with fold lines and a rod
    const col = CURTAIN_COLORS[Math.floor(rng.next() * CURTAIN_COLORS.length)];
    for (const [x, y, pw, ph] of panes) {
      const cw = pw * 0.3;
      for (const cx of [x, x + pw - cw]) {
        withAlpha(ctx, 0.92, () => {
          ctx.fillStyle = col;
          ctx.fillRect(cx, y, cw, ph);
        });
        withAlpha(ctx, 0.25, () => {
          ctx.fillStyle = '#000000';
          for (let f = 0.15; f < 1; f += 0.3) ctx.fillRect(cx + cw * f, y, cw * 0.1, ph);
        });
        withAlpha(ctx, 0.15, () => {
          ctx.fillStyle = '#ffffff';
          for (let f = 0.3; f < 1; f += 0.3) ctx.fillRect(cx + cw * f, y, cw * 0.06, ph);
        });
      }
      ctx.fillStyle = '#5a5448';
      ctx.fillRect(x, y, pw, 2);
    }
  }

  // sky reflection streak on every pane (strongest on dark glass, faint on lit glass)
  const refl = v === 2 ? 0.15 : v === 3 ? 0.06 : 0.11;
  for (const [x, y, pw, ph] of panes) {
    withAlpha(ctx, refl, () => {
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

  // meeting rail + outer frame lines
  ctx.fillStyle = '#e4dfd2';
  ctx.fillRect(m, mid - rail / 2, w - 2 * m, rail);
  ctx.strokeStyle = '#7f7a6e';
  ctx.lineWidth = 2;
  ctx.strokeRect(m, m, w - 2 * m, fh - 2 * m);
  ctx.strokeRect(1, 1, w - 2, fh - 2);
};

/**
 * Emissive map for the window: black frame, lit glass shaped like the colour map. Only variant 0 (lit blinds over
 * a lit room) and variant 3 (warm lit room) glow; curtained (1) and dark (2) windows stay black.
 */
export const windowEmissivePainter: Painter = (ctx, w, h, _rng, variant) => {
  const v = wrapVariant(variant, WINDOW_VARIANTS);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const { fh, m, panes } = windowLayout(w, h);
  if (v === 0) {
    for (const [x, y, pw, ph] of panes) {
      ctx.fillStyle = gray(150);
      ctx.fillRect(x, y, pw, ph);
    }
    // the blind diffuses the light, so it reads brighter than the clear glass below it
    const bh = (fh - 2 * m) * 0.5;
    ctx.fillStyle = gray(235);
    ctx.fillRect(m, m, w - 2 * m, bh);
    ctx.fillStyle = gray(120);
    ctx.fillRect(m, m + bh - 3, w - 2 * m, 3);
  } else if (v === 3) {
    const [x0, y0, pw0, ph0] = panes[0];
    ctx.fillStyle = gray(255);
    ctx.fillRect(x0, y0, pw0, ph0);
    const ceilH = ph0 * 0.16;
    ctx.fillStyle = gray(205);
    ctx.fillRect(x0, y0, pw0, ceilH);
    ctx.fillStyle = gray(140);
    ctx.fillRect(x0, y0 + ceilH, pw0, 1.5);
    const [x1, y1, pw1, ph1] = panes[1];
    ctx.fillStyle = gray(255);
    ctx.fillRect(x1, y1, pw1, ph1);
    ctx.fillStyle = gray(215);
    ctx.fillRect(x1, y1 + ph1 * 0.8, pw1, ph1 * 0.2);
  }
};

const POSTER_COLORS = ['#e8d34a', '#e9edf0', '#d94a4a', '#4aa3d9', '#58b86a', '#f08a2e'] as const;

interface PosterSpec { fx: number; fy: number; fw: number; fh: number; color: number }

/** Fixed poster layouts (fractions of the glass), so the emissive map can mirror them without sharing an rng. */
const POSTERS: readonly (readonly PosterSpec[])[] = [
  [
    { fx: 0.06, fy: 0.12, fw: 0.09, fh: 0.24, color: 0 },
    { fx: 0.3, fy: 0.5, fw: 0.1, fh: 0.2, color: 2 },
    { fx: 0.63, fy: 0.1, fw: 0.08, fh: 0.18, color: 3 },
  ],
  [
    { fx: 0.05, fy: 0.1, fw: 0.09, fh: 0.26, color: 0 },
    { fx: 0.16, fy: 0.4, fw: 0.07, fh: 0.18, color: 1 },
    { fx: 0.3, fy: 0.12, fw: 0.1, fh: 0.2, color: 2 },
    { fx: 0.54, fy: 0.5, fw: 0.09, fh: 0.22, color: 4 },
    { fx: 0.66, fy: 0.1, fw: 0.1, fh: 0.24, color: 3 },
    { fx: 0.84, fy: 0.46, fw: 0.08, fh: 0.2, color: 5 },
  ],
];

/** Abstract "we accept EBT" style notice: small white card, blue header strip, two grey text-line bars. No lettering. */
function notice(ctx: CanvasRenderingContext2D, x: number, y: number, emissive: boolean): void {
  ctx.fillStyle = emissive ? gray(255) : '#f1f3f4';
  ctx.fillRect(x, y, 34, 22);
  ctx.fillStyle = emissive ? gray(170) : '#1f4e8c';
  ctx.fillRect(x, y, 34, 6);
  ctx.fillStyle = emissive ? gray(190) : '#9aa0a6';
  ctx.fillRect(x + 4, y + 10, 26, 2);
  ctx.fillRect(x + 4, y + 15, 18, 2);
}

/** 512x256: aluminium mullions, lighter glass with diagonal reflections, taped posters, dark bulkhead; variant 1 adds grille shadows. */
export const storefrontPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, STOREFRONT_VARIANTS);
  ctx.fillStyle = '#b9bec2';
  ctx.fillRect(0, 0, w, h);
  const bulk = h * 0.2;
  const m = 10;
  const gx = m, gy = m, gw = w - 2 * m, gh = h - bulk - m;
  ctx.fillStyle = hsl(200 + rng.range(-5, 5), 24, 43);
  ctx.fillRect(gx, gy, gw, gh);
  // a darker interior toward the floor, stepped
  for (let i = 0; i < 4; i++) {
    withAlpha(ctx, 0.05, () => {
      ctx.fillStyle = '#10161a';
      ctx.fillRect(gx, gy + gh * (0.55 + i * 0.1), gw, gh * (0.45 - i * 0.1));
    });
  }
  // posters taped to the inside of the glass: plain rectangles, a darker inner band, two tape bits
  for (const p of POSTERS[v]) {
    const px = gx + gw * p.fx, py = gy + gh * p.fy, pw = gw * p.fw, ph = gh * p.fh;
    withAlpha(ctx, 0.92, () => {
      ctx.fillStyle = POSTER_COLORS[p.color];
      ctx.fillRect(px, py, pw, ph);
    });
    withAlpha(ctx, 0.25, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(px + pw * 0.1, py + ph * 0.55, pw * 0.8, ph * 0.3);
    });
    withAlpha(ctx, 0.7, () => {
      ctx.fillStyle = '#e9e2c8';
      ctx.fillRect(px - 2, py - 1, 6, 4);
      ctx.fillRect(px + pw - 4, py - 1, 6, 4);
    });
  }
  notice(ctx, gx + gw * 0.46, gy + gh * 0.08, false);
  // diagonal reflections over everything inside the glass
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
  withAlpha(ctx, 0.08, () => {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 2; i++) {
      const x = gx + gw * (0.24 + i * 0.4);
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + 14, gy);
      ctx.lineTo(x - 56, gy + gh);
      ctx.lineTo(x - 70, gy + gh);
      ctx.closePath();
      ctx.fill();
    }
  });
  if (v === 1) {
    // security grille shadow: vertical links, horizontal rods, and a soft offset copy
    for (const [dx, dy, a] of [[0, 0, 0.26], [4, 3, 0.1]] as const) {
      withAlpha(ctx, a, () => {
        ctx.fillStyle = '#05080a';
        for (let x = gx + 6; x < gx + gw; x += 24) ctx.fillRect(x + dx, gy, 2, gh);
        for (let y = gy + 5; y < gy + gh; y += 12) ctx.fillRect(gx, y + dy, gw, 1.2);
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

export const storefrontEmissivePainter: Painter = (ctx, w, h, _rng, variant) => {
  const v = wrapVariant(variant, STOREFRONT_VARIANTS);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const bulk = h * 0.2;
  const m = 10;
  const gx = m, gy = m, gw = w - 2 * m, gh = h - bulk - m;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(gx, gy, gw, gh);
  // paper posters are lit from behind but dimmer than open glass
  for (const p of POSTERS[v]) {
    ctx.fillStyle = gray(170);
    ctx.fillRect(gx + gw * p.fx, gy + gh * p.fy, gw * p.fw, gh * p.fh);
  }
  notice(ctx, gx + gw * 0.46, gy + gh * 0.08, true);
  if (v === 1) {
    ctx.fillStyle = gray(70);
    for (let x = gx + 6; x < gx + gw; x += 24) ctx.fillRect(x, gy, 2, gh);
  }
  ctx.fillStyle = '#000000';
  for (let i = 1; i < 4; i++) ctx.fillRect(gx + (gw * i) / 4 - 3, gy, 6, gh);
};
