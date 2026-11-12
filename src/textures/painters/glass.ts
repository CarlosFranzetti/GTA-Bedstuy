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

interface FrameStyle { frame: string; casing: string; edge: string; muntins: 'none' | 'cross' | 'six' }

/** Four frame treatments (the four glass materials): painted wood sash, white aluminium, bronze aluminium, green painted six-over-six. */
const FRAMES: readonly FrameStyle[] = [
  { frame: '#d8d3c3', casing: '#c4bead', edge: '#7f7a6e', muntins: 'cross' },
  { frame: '#e9e8e2', casing: '#d0cfc8', edge: '#8d8c86', muntins: 'none' },
  { frame: '#4a3b30', casing: '#3a2e25', edge: '#1d1713', muntins: 'cross' },
  { frame: '#8d9690', casing: '#7a837d', edge: '#444b46', muntins: 'six' },
];

function muntinRects(w: number, panes: readonly Pane[], style: FrameStyle['muntins']): Pane[] {
  const out: Pane[] = [];
  if (style === 'none') return out;
  const t = Math.max(2, w * 0.012);
  for (const [x, y, pw, ph] of panes) {
    const cols = style === 'six' ? 3 : 2;
    const rows = style === 'six' ? 2 : 1;
    for (let i = 1; i < cols; i++) out.push([x + (pw * i) / cols - t / 2, y, t, ph]);
    for (let j = 1; j <= rows - 1; j++) out.push([x, y + (ph * j) / rows - t / 2, pw, t]);
  }
  return out;
}

/**
 * 256px window: frame, sash, reveal bevel and sky reflection on the glass. The room behind the glass (blind, curtains, lamp,
 * dark) is drawn per window by windowShader.ts from a per-window seed, so this map only carries what every window shares.
 * Variants are the four frame treatments; the glass mask is the emissive map's R channel (windowEmissivePainter).
 */
export const windowPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, WINDOW_VARIANTS);
  const st = FRAMES[v];
  const { fh, m, mid, rail, panes } = windowLayout(w, h);
  const sill = h - fh;
  ctx.fillStyle = st.frame;
  ctx.fillRect(0, 0, w, fh);
  // casing: a darker outer band
  ctx.fillStyle = st.casing;
  ctx.fillRect(0, 0, w, 4);
  ctx.fillRect(0, 0, 4, fh);
  ctx.fillRect(w - 4, 0, 4, fh);
  // sill + shadow under it
  ctx.fillStyle = '#6f6a5f';
  ctx.fillRect(0, fh, w, 3);
  ctx.fillStyle = st.casing;
  ctx.fillRect(0, fh + 3, w, sill - 3);

  for (const [x, y, pw, ph] of panes) {
    // glass: a sky reflection, bright toward the top, cooler and darker toward the floor, with a soft diagonal streak
    const steps = 48; // fine, jitter-free bands: a visible quantisation would read as blind slats
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      ctx.fillStyle = hsl(208, 30 - t * 8, 70 - t * 30);
      ctx.fillRect(x, y + (ph * i) / steps, pw, ph / steps + 1);
    }
    withAlpha(ctx, 0.22, () => {
      ctx.fillStyle = '#f2f8ff';
      ctx.beginPath();
      ctx.moveTo(x + pw * 0.12, y);
      ctx.lineTo(x + pw * 0.42, y);
      ctx.lineTo(x + pw * 0.16, y + ph);
      ctx.lineTo(x, y + ph);
      ctx.lineTo(x, y + ph * 0.45);
      ctx.closePath();
      ctx.fill();
    });
    withAlpha(ctx, 0.12, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x + pw * 0.55, y);
      ctx.lineTo(x + pw * 0.64, y);
      ctx.lineTo(x + pw * 0.36, y + ph);
      ctx.lineTo(x + pw * 0.27, y + ph);
      ctx.closePath();
      ctx.fill();
    });
    // reveal bevel: shadow top and left, light bottom and right
    withAlpha(ctx, 0.4, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, pw, 4);
      ctx.fillRect(x, y, 4, ph);
    });
    withAlpha(ctx, 0.25, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + ph - 2, pw, 2);
      ctx.fillRect(x + pw - 2, y, 2, ph);
    });
  }

  // muntins
  ctx.fillStyle = st.frame;
  for (const [x, y, pw, ph] of muntinRects(w, panes, st.muntins)) ctx.fillRect(x, y, pw, ph);
  // meeting rail with a lit top edge and a shadow below
  ctx.fillStyle = st.frame;
  ctx.fillRect(m, mid - rail / 2, w - 2 * m, rail);
  withAlpha(ctx, 0.35, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(m, mid - rail / 2, w - 2 * m, 1.5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(m, mid + rail / 2 - 1.5, w - 2 * m, 1.5);
  });
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(m, m, w - 2 * m, fh - 2 * m);
  ctx.strokeRect(1, 1, w - 2, fh - 2);
};

/** Emissive map for the window: R = glass mask (panes minus the muntins), read by windowShader.ts. Black frame. */
export const windowEmissivePainter: Painter = (ctx, w, h, _rng, variant) => {
  const v = wrapVariant(variant, WINDOW_VARIANTS);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  const { panes } = windowLayout(w, h);
  ctx.fillStyle = '#ffffff';
  for (const [x, y, pw, ph] of panes) ctx.fillRect(x, y, pw, ph);
  ctx.fillStyle = '#000000';
  for (const [x, y, pw, ph] of muntinRects(w, panes, FRAMES[v].muntins)) ctx.fillRect(x, y, pw, ph);
};

/**
 * 512x256 shop glass: aluminium frame with a bevel, sky reflection on the glass (the interior behind it is drawn per bay by
 * windowShader.ts from a seed: shelves, mirror, tables, machines, paper), mullions, dark bulkhead. Variant 1 adds the shadow
 * of a security grille. The glass mask is the emissive map's R channel.
 */
export const storefrontPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, STOREFRONT_VARIANTS);
  ctx.fillStyle = '#b9bec2';
  ctx.fillRect(0, 0, w, h);
  const bulk = h * 0.2;
  const m = 10;
  const gx = m, gy = m, gw = w - 2 * m, gh = h - bulk - m;
  // glass: sky reflection, bright at the top, deeper toward the floor
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    ctx.fillStyle = hsl(204, 28 - t * 10, 66 - t * 32);
    ctx.fillRect(gx, gy + (gh * i) / steps, gw, gh / steps + 1);
  }
  // diagonal reflections over everything inside the glass
  withAlpha(ctx, 0.2, () => {
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
  withAlpha(ctx, 0.1, () => {
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
  // reveal bevel
  withAlpha(ctx, 0.35, () => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(gx, gy, gw, 5);
    ctx.fillRect(gx, gy, 4, gh);
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
  // mullions with a light edge
  ctx.fillStyle = '#9da2a6';
  for (let i = 1; i < 4; i++) ctx.fillRect(gx + (gw * i) / 4 - 3, gy, 6, gh);
  withAlpha(ctx, 0.4, () => {
    ctx.fillStyle = '#ffffff';
    for (let i = 1; i < 4; i++) ctx.fillRect(gx + (gw * i) / 4 - 3, gy, 1.5, gh);
  });
  // bulkhead (kick panel), brushed
  ctx.fillStyle = '#2a2b2e';
  ctx.fillRect(gx, gy + gh + 4, gw, bulk - 4 - 2);
  withAlpha(ctx, 0.12, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gx, gy + gh + 6, gw, 2);
  });
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
  if (v === 1) {
    ctx.fillStyle = gray(70);
    for (let x = gx + 6; x < gx + gw; x += 24) ctx.fillRect(x, gy, 2, gh);
  }
  ctx.fillStyle = '#000000';
  for (let i = 1; i < 4; i++) ctx.fillRect(gx + (gw * i) / 4 - 3, gy, 6, gh);
};
