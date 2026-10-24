import { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { fitFont, sootStreak, speckle, withAlpha } from './util';

export type AwningStyle = 'vinyl' | 'metal';

/** Deterministic awning style from the sign text: vinyl valance or corrugated-metal bodega awning. */
export function awningStyle(text: string): AwningStyle {
  return ((Rng.hash(text) >>> 16) & 1) === 0 ? 'vinyl' : 'metal';
}

const VINYL_FONT = 'Arial Narrow, "Helvetica Neue", Arial, sans-serif';
const METAL_FONT = 'Impact, "Arial Black", Arial, sans-serif';

type SpacedCtx = CanvasRenderingContext2D & { letterSpacing?: string };

function hasSpacing(ctx: CanvasRenderingContext2D): boolean {
  return 'letterSpacing' in ctx;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if (hasSpacing(ctx)) (ctx as SpacedCtx).letterSpacing = `${Math.max(0, Math.round(px * 10) / 10)}px`;
}

/** fitFont, then (where the canvas supports letterSpacing) widen tracking and shrink until the spaced text still fits. */
function fitSpaced(
  ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, frac: number,
  weight = 'bold', family = 'Arial, Helvetica, sans-serif', minPx = 6,
): number {
  setSpacing(ctx, 0);
  let px = fitFont(ctx, text, maxW, maxH, weight, family, minPx);
  if (!hasSpacing(ctx)) return px;
  for (let i = 0; i < 60; i++) {
    setSpacing(ctx, px * frac);
    if (px <= minPx || ctx.measureText(text).width <= maxW) break;
    px -= 1;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

interface Hsl { h: number; s: number; l: number }

/** Parse #rgb / #rrggbb into HSL (h in degrees, s and l in 0..1). Other CSS colour syntaxes return null. */
function parseHex(c: string): Hsl | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((d) => d + d).join('');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Split 'KING DELI · GROCERY · ATM' into the main name and the small secondary line, if a '·' is present. */
function splitSecondary(label: string): { main: string; secondary: string | null } {
  const i = label.indexOf('·');
  if (i < 0) return { main: label, secondary: null };
  const main = label.slice(0, i).trim();
  const secondary = label.slice(i + 1).trim();
  if (!main || !secondary) return { main: label.replace(/\s*·\s*/g, ' ').trim() || label, secondary: null };
  return { main, secondary };
}

/** Draw the main (and optional secondary) lines centred in the valance band [top, bottom]. */
function valanceText(
  ctx: CanvasRenderingContext2D, w: number, top: number, bottom: number, main: string, secondary: string | null,
  family: string, fill: string, outline: string, outlineFrac: number, secondaryFill: string,
): void {
  const vh = bottom - top;
  const maxW = w * 0.9;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const mainH = secondary ? vh * 0.46 : vh * 0.7;
  const mainY = secondary ? top + vh * 0.36 : top + vh * 0.5 + 1;
  const px = fitFont(ctx, main, maxW, mainH, 'bold', family);
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(2, px * outlineFrac);
  ctx.strokeText(main, w / 2, mainY);
  ctx.fillStyle = fill;
  ctx.fillText(main, w / 2, mainY);
  if (secondary) {
    const spx = fitFont(ctx, secondary, maxW * 0.8, vh * 0.24, 'bold', family);
    const sy = top + vh * 0.76;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.5, spx * outlineFrac);
    ctx.strokeText(secondary, w / 2, sy);
    ctx.fillStyle = secondaryFill;
    ctx.fillText(secondary, w / 2, sy);
  }
}

/** Vinyl awning: weave, sun-faded top, scalloped valance with grime, white condensed text. */
function paintVinyl(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, color: string, main: string, secondary: string | null,
): void {
  const valTop = h * 0.72;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  // woven vinyl: faint thread grid + grain
  withAlpha(ctx, 0.045, () => {
    ctx.fillStyle = '#000000';
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
  speckle(ctx, w, h, rng, 500, ['#000000', '#ffffff'], 1, 2, 0.06);
  // panel seams
  const stripes = 8;
  for (let i = 0; i < stripes; i += 2) {
    withAlpha(ctx, 0.1, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect((i * w) / stripes, 0, w / stripes, valTop);
    });
  }
  // sun-faded top band, stepped so it fades out downward
  for (let i = 0; i < 5; i++) {
    withAlpha(ctx, 0.07, () => {
      ctx.fillStyle = '#f2ead6';
      ctx.fillRect(0, 0, w, h * 0.22 * (1 - i / 5));
    });
  }
  // valance: lighter band
  withAlpha(ctx, 0.3, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, valTop, w, h - valTop);
  });
  // scalloped bottom edge
  const sc = 8;
  const r = w / sc / 2;
  const base = h - r * 0.55;
  ctx.fillStyle = color;
  ctx.fillRect(0, base, w, h - base);
  for (let i = 0; i < sc; i++) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(r + i * 2 * r, base, r, 0, Math.PI);
    ctx.fill();
    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(r + i * 2 * r, base, r, 0, Math.PI);
      ctx.fill();
    });
  }
  // grime collects at the lowest point of each scallop and along its rim
  for (let i = 0; i < sc; i++) {
    const cx = r + i * 2 * r;
    withAlpha(ctx, rng.range(0.1, 0.22), () => {
      ctx.fillStyle = '#1c150d';
      ctx.beginPath();
      ctx.arc(cx, base + r * 0.7, r * rng.range(0.35, 0.55), 0, Math.PI * 2);
      ctx.fill();
    });
    withAlpha(ctx, 0.3, () => {
      ctx.strokeStyle = '#1a140c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, base, r - 1, 0.15, Math.PI - 0.15);
      ctx.stroke();
    });
    if (rng.chance(0.6)) sootStreak(ctx, cx - 4, valTop + 4, rng.range(4, 9), (base - valTop) * rng.range(0.5, 1), 0.12, '#1c150d');
  }
  withAlpha(ctx, 0.25, () => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, valTop, w, 2);
  });
  valanceText(ctx, w, valTop, base, main, secondary, VINYL_FONT, '#ffffff', 'rgba(0,0,0,0.6)', 0.07, '#f3f3ee');
}

/** Corrugated-metal bodega awning: bright yellow or red ridges, rivet rows, red/blue lettering with a black outline. */
function paintMetal(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, color: string, text: string, main: string, secondary: string | null,
): void {
  const valTop = h * 0.72;
  const hsl = parseHex(color);
  const hashBit = (Rng.hash(text) >>> 17) & 1;
  let ground: string;
  let yellow: boolean;
  if (hsl && hsl.s > 0.35 && hsl.l > 0.25 && hsl.h >= 35 && hsl.h <= 70) {
    ground = color;
    yellow = true;
  } else if (hsl && hsl.s > 0.35 && hsl.l > 0.2 && (hsl.h <= 18 || hsl.h >= 340)) {
    ground = color;
    yellow = false;
  } else {
    yellow = hashBit === 1;
    ground = yellow ? '#e7b52e' : '#c4252b';
  }
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  // vertical corrugation (ridges run down the slope)
  const period = 14;
  for (let x = 0; x < w; x += period) {
    withAlpha(ctx, 0.17, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 2, 0, 3, valTop);
    });
    withAlpha(ctx, 0.2, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 9, 0, 3, valTop);
    });
  }
  // lettering board
  ctx.fillStyle = yellow ? ground : '#f1c232';
  ctx.fillRect(0, valTop, w, h - valTop);
  if (yellow) {
    withAlpha(ctx, 0.2, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, valTop, w, h - valTop);
    });
  }
  for (let x = 0; x < w; x += period) {
    withAlpha(ctx, 0.06, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 9, valTop, 3, h - valTop);
    });
  }
  // fold line / edge trim
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, valTop - 1, w, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, valTop + 2, w, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, h - 5, w, 5);
  // rivet rows: top edge, along the fold, along the bottom
  const rivets = (y: number): void => {
    for (let x = 14; x < w; x += 28) {
      ctx.fillStyle = '#34322f';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      withAlpha(ctx, 0.7, () => {
        ctx.fillStyle = '#e0ddd5';
        ctx.beginPath();
        ctx.arc(x - 0.7, y - 0.7, 1, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };
  rivets(7);
  rivets(valTop - 7);
  rivets(h - 9);
  // sun-fade at the top, grime drips and rust flecks near the edges
  for (let i = 0; i < 4; i++) {
    withAlpha(ctx, 0.06, () => {
      ctx.fillStyle = '#fff6dc';
      ctx.fillRect(0, 0, w, h * 0.16 * (1 - i / 4));
    });
  }
  for (let i = 0; i < 7; i++) sootStreak(ctx, rng.range(0, w), 0, rng.range(5, 13), rng.range(valTop * 0.3, valTop), 0.12, '#1a120a');
  speckle(ctx, w, h, rng, 60, ['#7a3a1a', '#5a2a12'], 1, 3, 0.35);
  speckle(ctx, w, h, rng, 350, ['#000000', '#ffffff'], 1, 2, 0.05);
  valanceText(ctx, w, valTop + 2, h - 5, main, secondary, METAL_FONT, yellow ? '#c4161c' : '#1d3f8f', '#000000', 0.16, yellow ? '#1d3f8f' : '#c4161c');
}

/**
 * Awning texture 512x256. The style is picked from the text hash: (a) vinyl with a scalloped valance and white
 * condensed text, or (b) corrugated-metal bodega awning with red/blue lettering. The name sits in the bottom band;
 * text containing a '·' gets a small secondary line (everything after the first '·').
 */
export function awningPainter(color: string, text: string): Painter {
  return (ctx, w, h, rng) => {
    const label = text.toUpperCase();
    const { main, secondary } = splitSecondary(label);
    if (awningStyle(text) === 'vinyl') paintVinyl(ctx, w, h, rng, color, main, secondary);
    else paintMetal(ctx, w, h, rng, color, text, main, secondary);
  };
}

/**
 * Sign board 512x128, backlit lightbox look: brighter centre, darker rim, thin metal frame, tracked-out text
 * (wraps to two lines if one line would be tiny) and, for some texts, a second-colour stripe along the bottom.
 */
export function signPainter(text: string, bg: string, fg: string): Painter {
  return (ctx, w, h, rng) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // uneven backlight: stepped glow around a slightly off-centre hot spot
    const hx = w * rng.range(0.42, 0.58);
    for (let k = 0; k < 7; k++) {
      withAlpha(ctx, 0.028, () => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(hx, h / 2, w * (0.5 - k * 0.06), h * (0.62 - k * 0.07), 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // darker rim where the tube light falls off
    for (let k = 0; k < 4; k++) {
      withAlpha(ctx, 0.06, () => {
        ctx.fillStyle = '#000000';
        const t = 2 + k * 2;
        ctx.fillRect(0, 0, w, t);
        ctx.fillRect(0, h - t, w, t);
        ctx.fillRect(0, 0, t, h);
        ctx.fillRect(w - t, 0, t, h);
      });
    }
    // optional second-colour stripe
    const hash = Rng.hash(`${text}|${bg}|${fg}`);
    const stripe = hash % 3 === 0;
    const sh = h * 0.1;
    const stripeY = h - 5 - sh;
    if (stripe) {
      const cols = ['#d62828', '#f2b21b', '#1f6bd6'];
      const col = cols[(hash >>> 8) % cols.length];
      ctx.fillStyle = col === bg || col === fg ? '#d62828' : col;
      ctx.fillRect(5, stripeY, w - 10, sh);
      withAlpha(ctx, 0.2, () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(5, stripeY, w - 10, sh / 2);
      });
    }
    // thin frame
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    withAlpha(ctx, 0.6, () => {
      ctx.strokeStyle = '#0d0d0d';
      ctx.lineWidth = 1;
      ctx.strokeRect(4.5, 4.5, w - 9, h - 9);
    });
    // text
    const areaTop = 6;
    const areaBot = stripe ? stripeY - 1 : h - 6;
    const cy = (areaTop + areaBot) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    const maxW = w * 0.86;
    const maxH = (areaBot - areaTop) * (stripe ? 0.8 : 0.72);
    const frac = 0.06;
    const px = fitSpaced(ctx, text, maxW, maxH, frac);
    const sp = text.indexOf(' ', Math.floor(text.length / 2) - 4);
    if (px < maxH * 0.5 && sp > 0 && text.includes(' ')) {
      const a = text.slice(0, sp).trim();
      const b = text.slice(sp + 1).trim();
      fitSpaced(ctx, a.length >= b.length ? a : b, maxW, (areaBot - areaTop) * 0.42, frac);
      ctx.fillText(a, w / 2, areaTop + (areaBot - areaTop) * 0.28);
      ctx.fillText(b, w / 2, areaTop + (areaBot - areaTop) * 0.72);
    } else {
      ctx.fillText(text, w / 2, cy + 1);
    }
    setSpacing(ctx, 0);
  };
}

/** Abstract door shield: pointed crest with an inner field and a small round device. */
function shield(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const path = (k: number): void => {
    const hw = s * 0.42 * k;
    const top = cy - s * 0.5 * k;
    ctx.beginPath();
    ctx.moveTo(cx - hw, top);
    ctx.lineTo(cx + hw, top);
    ctx.lineTo(cx + hw, cy + s * 0.08 * k);
    ctx.quadraticCurveTo(cx + hw, cy + s * 0.38 * k, cx, cy + s * 0.5 * k);
    ctx.quadraticCurveTo(cx - hw, cy + s * 0.38 * k, cx - hw, cy + s * 0.08 * k);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#0a1d45';
  path(1.08);
  ctx.fillStyle = '#d9b24a';
  path(1);
  ctx.fillStyle = '#1d4fa6';
  path(0.76);
  ctx.fillStyle = '#d9b24a';
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.04, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f2f6b';
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.04, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

/** Police car side livery 512x256: white body, blue stripe with reflective trim, door shield, parody text "BPD". */
export const copLiveryPainter: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#f1f3f5';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, 400, ['#9aa0a6', '#ffffff'], 1, 2, 0.12);
  const y = h * 0.36;
  const sh = h * 0.3;
  ctx.fillStyle = '#1d4fa6';
  ctx.fillRect(0, y, w, sh);
  ctx.fillStyle = '#0f2f6b';
  ctx.fillRect(0, y + sh, w, 4);
  ctx.fillStyle = '#7fa6e6';
  ctx.fillRect(0, y - 6, w, 3);
  // thin reflective stripe: pale sheeting under the blue band, with a prismatic facet pattern
  const ry = y + sh + 8;
  ctx.fillStyle = '#c9d4de';
  ctx.fillRect(0, ry, w, 5);
  ctx.fillStyle = '#f4fbff';
  ctx.fillRect(0, ry, w, 1.5);
  withAlpha(ctx, 0.45, () => {
    ctx.fillStyle = '#8fa3b5';
    for (let x = 0; x < w; x += 6) ctx.fillRect(x, ry + 1.5, 3, 3.5);
  });
  // door shield
  shield(ctx, w * 0.17, y + sh / 2, sh * 0.82);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'BPD', w * 0.4, sh * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BPD', w / 2, y + sh / 2 + 2);
};
