import { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { fitFont, sootStreak, speckle, withAlpha } from './util';
import {
  PICTOGRAM_COLOR, SIGN_ASPECT, SLOPE_ASPECT, VALANCE_ASPECT, awningStyleFor, drawPictogram, drawPlate, drawSegmentDigits,
  drawStripe, layoutAwning, layoutSign,
  type AwningLayout, type AwningStyle, type PictogramKind, type SignBadge,
} from './storefront-art';

export type { AwningStyle };

/** Deterministic awning style from the sign text: vinyl valance or corrugated-metal bodega awning. */
export function awningStyle(text: string): AwningStyle {
  return awningStyleFor(text);
}

const VINYL_FONT = 'Arial Narrow, "Helvetica Neue", Arial, sans-serif';
const METAL_FONT = 'Impact, "Arial Black", Arial, sans-serif';
const PLATE_FILL = '#fff8e8';
const PLATE_EDGE = '#2a2118';

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

/** Replace band colours that would vanish into the ground colour with white or near-black. */
function avoidGround(ground: string, colors: readonly string[]): string[] {
  const g = parseHex(ground);
  if (!g) return [...colors];
  const alt = g.l > 0.5 ? '#111111' : '#ffffff';
  return colors.map((c) => {
    const k = parseHex(c);
    if (!k) return c;
    const dh = Math.min(Math.abs(k.h - g.h), 360 - Math.abs(k.h - g.h));
    const same = Math.abs(k.l - g.l) < 0.22 && (k.s < 0.2 && g.s < 0.2 ? true : dh < 25 && k.s > 0.25 && g.s > 0.25);
    return same ? alt : c;
  });
}

// ---------------------------------------------------------------------------------------------- awning

/** An icon on a light sticker plate, squeezed to cancel the texture stretch. */
function plateIcon(
  ctx: CanvasRenderingContext2D, kind: PictogramKind, cx: number, cy: number, size: number, aspect: number,
): void {
  const pw = size / aspect + 8;
  drawPlate(ctx, cx, cy, pw, size + 6, PLATE_FILL, PLATE_EDGE);
  drawPictogram(ctx, kind, cx, cy, size * 0.82, PICTOGRAM_COLOR[kind], aspect);
}

/**
 * Draw the main (and optional secondary) lines centred in the valance band [top, bottom], with the archetype's
 * icons on stickers hugging both sides of the text (one icon is mirrored; otherwise the list is split left/right).
 */
function valance(
  ctx: CanvasRenderingContext2D, w: number, top: number, bottom: number, layout: AwningLayout,
  family: string, fill: string, outline: string, outlineFrac: number, secondaryFill: string,
): void {
  const { mainLine: main, subLine: secondary, pictograms } = layout;
  const vh = bottom - top;
  const n = pictograms.length;
  const split = Math.ceil(n / 2);
  const left = n === 1 ? pictograms : pictograms.slice(0, split);
  const right = n === 1 ? pictograms : pictograms.slice(split);
  const size = Math.min(vh * 0.8, 50);
  const slot = size / VALANCE_ASPECT + 8 + 5;
  const nSide = Math.max(left.length, right.length);
  const maxW = w * 0.9 - (nSide ? nSide * 2 * slot + 12 : 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const mainH = secondary ? vh * 0.46 : vh * 0.7;
  const mainY = secondary ? top + vh * 0.36 : top + vh * 0.5 + 1;
  const px = fitFont(ctx, main, maxW, mainH, 'bold', family);
  let blockW = ctx.measureText(main).width;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(2, px * outlineFrac);
  ctx.strokeText(main, w / 2, mainY);
  ctx.fillStyle = fill;
  ctx.fillText(main, w / 2, mainY);
  if (secondary) {
    const spx = fitFont(ctx, secondary, maxW * 0.8, vh * 0.24, 'bold', family);
    blockW = Math.max(blockW, ctx.measureText(secondary).width);
    const sy = top + vh * 0.76;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.5, spx * outlineFrac);
    ctx.strokeText(secondary, w / 2, sy);
    ctx.fillStyle = secondaryFill;
    ctx.fillText(secondary, w / 2, sy);
  }
  const cy = top + vh / 2;
  left.forEach((k, i) => plateIcon(ctx, k, w / 2 - blockW / 2 - 8 - slot * (left.length - i - 0.5), cy, size, VALANCE_ASPECT));
  right.forEach((k, i) => plateIcon(ctx, k, w / 2 + blockW / 2 + 8 + slot * (i + 0.5), cy, size, VALANCE_ASPECT));
}

/**
 * The sloped top face: archetype stripe band just above the fold, one big icon sticker and the phone number on a
 * dark plate (seven-segment digits, so the only printed text on an awning is still the name).
 */
function slopeArt(
  ctx: CanvasRenderingContext2D, w: number, valTop: number, layout: AwningLayout, ground: string,
): void {
  if (layout.stripe !== 'none') {
    const bh = 22;
    const by = valTop - 10 - bh;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, by - 3, w, bh + 6);
    drawStripe(ctx, layout.stripe, 0, by, w, bh, avoidGround(ground, layout.bandColors));
  }
  const hasIcon = layout.pictograms.length > 0;
  const cy = valTop * 0.4;
  if (hasIcon) plateIcon(ctx, layout.pictograms[0], w * 0.2, cy, valTop * 0.5, SLOPE_ASPECT);
  if (layout.phone) {
    const dh = 22;
    const cx = hasIcon ? w * 0.6 : w / 2;
    const pw = 214 / SLOPE_ASPECT;
    drawPlate(ctx, cx, cy, pw + 18, dh + 16, 'rgba(18,16,14,1)', '#f1c232', 0.82);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 / SLOPE_ASPECT, 1);
    drawSegmentDigits(ctx, layout.phone, 0, 0, dh, '#fff1b8');
    ctx.restore();
  }
}

/** Vinyl awning: weave, sun-faded top, scalloped valance with grime, condensed text, icons and phone number. */
function paintVinyl(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, color: string, layout: AwningLayout): void {
  const valTop = h * 0.72;
  const hsl = parseHex(color);
  const light = hsl ? hsl.l > 0.62 : false;
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
  slopeArt(ctx, w, valTop, layout, color);
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
  if (light) valance(ctx, w, valTop, base, layout, VINYL_FONT, '#1a1a1a', 'rgba(255,255,255,0.75)', 0.07, '#2a2a2a');
  else valance(ctx, w, valTop, base, layout, VINYL_FONT, '#ffffff', 'rgba(0,0,0,0.6)', 0.07, '#f3f3ee');
}

/** Corrugated-metal bodega awning: bright yellow or red ridges, rivet rows, red/blue lettering with a black outline. */
function paintMetal(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, color: string, text: string, layout: AwningLayout,
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
  // painted slope graphics sit on the ridges, under the rivets
  slopeArt(ctx, w, valTop, layout, ground);
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
  valance(ctx, w, valTop + 2, h - 5, layout, METAL_FONT, yellow ? '#c4161c' : '#1d3f8f', '#000000', 0.16, yellow ? '#1d3f8f' : '#c4161c');
}

/**
 * Awning texture 512x256. Layout comes from layoutAwning(text): the archetype (bodega, laundromat, barber, ...)
 * picks the stripe band, the icons beside the name and the phone number. Style is vinyl (scalloped valance, narrow
 * type) or, for corner-store types, corrugated metal (red/blue lettering). The name sits in the bottom band; text
 * containing a '·' gets a small secondary line (everything after the first '·'). The slope carries a big icon
 * sticker, the phone number and a stripe band; the name is the only printed text.
 */
export function awningPainter(color: string, text: string): Painter {
  return (ctx, w, h, rng) => {
    const layout = layoutAwning(text);
    if (layout.style === 'vinyl') paintVinyl(ctx, w, h, rng, color, layout);
    else paintMetal(ctx, w, h, rng, color, text, layout);
  };
}

// ---------------------------------------------------------------------------------------------- sign board

const BADGE_STYLE: Record<SignBadge['kind'], { fill: string; edge: string }> = {
  open: { fill: '#c4161c', edge: '#ffffff' },
  atm: { fill: '#1f5fbf', edge: '#ffffff' },
  ebt: { fill: '#e07b00', edge: '#fff4d6' },
};

/** Small corner badge: filled rectangle, bright border, one line of bold text that shrinks to fit. */
function drawBadge(ctx: CanvasRenderingContext2D, badge: SignBadge, x: number, y: number, bw: number, bh: number): void {
  const st = BADGE_STYLE[badge.kind];
  if (badge.kind === 'open') {
    withAlpha(ctx, 0.18, () => {
      ctx.fillStyle = '#ff6a5c';
      ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
    });
  }
  ctx.fillStyle = st.fill;
  ctx.fillRect(x, y, bw, bh);
  withAlpha(ctx, 0.2, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, bw, bh / 2);
  });
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
  setSpacing(ctx, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, badge.label, bw - 10, bh * 0.58, 'bold', 'Arial, Helvetica, sans-serif', 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badge.label, x + bw / 2, y + bh / 2 + 1);
}

/** Neon tube lettering: wide dim halo passes, a bright coloured stroke, then a white-hot fill. */
function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string): void {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  const passes: [number, number][] = [[0.55, 0.07], [0.38, 0.12], [0.24, 0.2], [0.13, 0.45]];
  for (const [wf, a] of passes) {
    withAlpha(ctx, a, () => {
      ctx.lineWidth = px * wf;
      ctx.strokeText(text, x, y);
    });
  }
  ctx.lineWidth = Math.max(1.5, px * 0.07);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff6ee';
  ctx.fillText(text, x, y);
}

/**
 * Sign board 512x128, backlit lightbox look: brighter centre, darker rim, thin metal frame, tracked-out text
 * (wraps to two lines if one line would be tiny). Text before a '·' is the big line, the rest a smaller second
 * line. Optional extras from the text: "OPEN n HRS", "ATM" and "WE ACCEPT EBT" corner badges (corner stores get
 * ATM/EBT stickers by default), an archetype icon on the left, a second-colour stripe, and bright neon-tube
 * lettering with a glow halo for bars and liquor stores.
 */
export function signPainter(text: string, bg: string, fg: string): Painter {
  return (ctx, w, h, rng) => {
    const layout = layoutSign(text);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // uneven backlight: stepped glow (nested rects) around a slightly off-centre hot spot
    const hx = w * rng.range(0.42, 0.58);
    for (let k = 0; k < 7; k++) {
      withAlpha(ctx, 0.028, () => {
        ctx.fillStyle = '#ffffff';
        const hw = w * (0.5 - k * 0.06);
        const hh = h * (0.62 - k * 0.07);
        ctx.fillRect(hx - hw, h / 2 - hh, hw * 2, hh * 2);
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
    if (layout.neon) {
      withAlpha(ctx, 0.62, () => {
        ctx.fillStyle = '#04040a';
        ctx.fillRect(0, 0, w, h);
      });
    }
    // second-colour stripe: always on typed shops, otherwise on a third of the signs
    const hash = Rng.hash(`${text}|${bg}|${fg}`);
    const stripe = !layout.neon && (layout.archetype !== 'generic' || hash % 3 === 0);
    const sh = h * 0.1;
    const stripeY = h - 5 - sh;
    if (stripe) {
      const cols = ['#d62828', '#f2b21b', '#1f6bd6'];
      const col = layout.archetype !== 'generic' ? layout.stripeColor : cols[(hash >>> 8) % cols.length];
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
    if (layout.neon) {
      // neon tube border: wide halo, then the bright tube
      ctx.strokeStyle = layout.neonColors[0];
      for (const [lw, a] of [[9, 0.1], [5, 0.2]] as const) {
        withAlpha(ctx, a, () => {
          ctx.lineWidth = lw;
          ctx.strokeRect(11, 11, w - 22, h - 22);
        });
      }
      ctx.lineWidth = 2;
      ctx.strokeRect(11, 11, w - 22, h - 22);
    }

    const areaTop = 6;
    const areaBot = stripe ? stripeY - 1 : h - 6;
    const areaH = areaBot - areaTop;
    const badges = layout.badges;
    const icon = layout.icon;
    // text stays centred; reserve the same margin both sides when anything sits in a corner
    const side = icon || badges.length ? w * 0.19 : w * 0.07;
    const maxW = w - 2 * side;
    if (icon) {
      const isz = Math.min(areaH * 0.72, 62);
      const ix = side / 2 + 2;
      const iy = areaTop + areaH / 2;
      if (layout.neon) {
        withAlpha(ctx, 0.28, () => drawPictogram(ctx, icon, ix, iy, isz * 1.3, layout.neonColors[0], SIGN_ASPECT));
        drawPictogram(ctx, icon, ix, iy, isz, layout.neonColors[0], SIGN_ASPECT);
      } else {
        drawPlate(ctx, ix, iy, isz / SIGN_ASPECT + 10, isz + 8, PLATE_FILL, PLATE_EDGE);
        drawPictogram(ctx, icon, ix, iy, isz * 0.82, PICTOGRAM_COLOR[icon], SIGN_ASPECT);
      }
    }
    if (badges.length) {
      const bw = side - 14;
      const bh = Math.min(30, (areaH - 4 * (badges.length - 1)) / badges.length);
      const total = bh * badges.length + 6 * (badges.length - 1);
      const bx = w - side + 6;
      let by = areaTop + (areaH - total) / 2;
      for (const b of badges) {
        drawBadge(ctx, b, bx, by, bw, bh);
        by += bh + 6;
      }
    }

    // text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    setSpacing(ctx, 0);
    const frac = 0.06;
    const line = (str: string, y: number, mw: number, mh: number, neonColor?: string): void => {
      const px = fitSpaced(ctx, str, mw, mh, frac);
      if (neonColor) neonText(ctx, str, w / 2, y, px, neonColor);
      else {
        ctx.fillStyle = fg;
        ctx.fillText(str, w / 2, y);
      }
    };
    const main = layout.mainLine;
    if (layout.subLine) {
      line(main, areaTop + areaH * 0.34, maxW, areaH * 0.5, layout.neon ? layout.neonColors[0] : undefined);
      line(layout.subLine, areaTop + areaH * 0.8, maxW * 0.92, areaH * 0.26, layout.neon ? layout.neonColors[1] : undefined);
    } else {
      const maxH = areaH * (stripe ? 0.8 : 0.72);
      const cy = areaTop + areaH / 2;
      const px = fitSpaced(ctx, main, maxW, maxH, frac);
      const sp = main.indexOf(' ', Math.floor(main.length / 2) - 4);
      if (px < maxH * 0.5 && sp > 0 && main.includes(' ')) {
        const a = main.slice(0, sp).trim();
        const b = main.slice(sp + 1).trim();
        const longer = a.length >= b.length ? a : b;
        const spx = fitSpaced(ctx, longer, maxW, areaH * 0.42, frac);
        for (const [s, y, c] of [[a, areaTop + areaH * 0.28, 0], [b, areaTop + areaH * 0.72, 1]] as const) {
          ctx.font = `bold ${spx}px Arial, Helvetica, sans-serif`;
          if (layout.neon) neonText(ctx, s, w / 2, y, spx, layout.neonColors[c]);
          else ctx.fillText(s, w / 2, y);
        }
      } else if (layout.neon) {
        neonText(ctx, main, w / 2, cy + 1, px, layout.neonColors[0]);
      } else {
        ctx.fillText(main, w / 2, cy + 1);
      }
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
