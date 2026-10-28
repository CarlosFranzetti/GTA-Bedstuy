import { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { fitFont, sootStreak, speckle, withAlpha } from './util';
import {
  PICTOGRAM_COLOR, STICKER_SLOTS, awningGeomOfCanvas, awningStyleFor, drawPictogram, drawPlate, drawSegmentDigits,
  drawStripe, layoutAwning, layoutSign, signGeomOfCanvas,
  type AwningGeom, type AwningLayout, type AwningStyle, type PictogramKind, type SignBadge, type SignGeom, type StickerKind,
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

/** An icon on a light sticker plate. */
function plateIcon(ctx: CanvasRenderingContext2D, kind: PictogramKind, cx: number, cy: number, size: number): void {
  drawPlate(ctx, cx, cy, size + 8, size + 6, PLATE_FILL, PLATE_EDGE);
  drawPictogram(ctx, kind, cx, cy, size * 0.82, PICTOGRAM_COLOR[kind]);
}

/**
 * Draw the main (and optional secondary) lines centred in the valance band [top, bottom], with the archetype's
 * icons on stickers hugging both sides of the text (one icon is mirrored; otherwise the list is split left/right).
 */
function valanceText(
  ctx: CanvasRenderingContext2D, w: number, top: number, bottom: number, ppm: number, layout: AwningLayout,
  family: string, fill: string, outline: string, outlineFrac: number, secondaryFill: string,
): void {
  const { mainLine: main, subLine: secondary, pictograms } = layout;
  const vh = bottom - top;
  const n = pictograms.length;
  const split = Math.ceil(n / 2);
  const left = n === 1 ? pictograms : pictograms.slice(0, split);
  const right = n === 1 ? pictograms : pictograms.slice(split);
  const size = Math.min(vh * 0.8, 0.3 * ppm);
  const slot = size + 8 + 5;
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
  left.forEach((k, i) => plateIcon(ctx, k, w / 2 - blockW / 2 - 8 - slot * (left.length - i - 0.5), cy, size));
  right.forEach((k, i) => plateIcon(ctx, k, w / 2 + blockW / 2 + 8 + slot * (i + 0.5), cy, size));
}

/**
 * valanceText with the zone translate undone around it, so fillText/strokeText receive canvas-absolute y (what a
 * reader of the draw calls, or the fake-canvas test, expects) while the picture is identical.
 */
function valanceTextAbs(
  ctx: CanvasRenderingContext2D, y0: number, w: number, top: number, bottom: number, ppm: number, layout: AwningLayout,
  family: string, fill: string, outline: string, outlineFrac: number, secondaryFill: string,
): void {
  ctx.save();
  ctx.translate(0, -y0);
  valanceText(ctx, w, top + y0, bottom + y0, ppm, layout, family, fill, outline, outlineFrac, secondaryFill);
  ctx.restore();
}

/**
 * The sloped top face: archetype stripe band along the front edge (bottom of the slope image), one big icon sticker
 * and the phone number on a dark plate (seven-segment digits, so the only printed text on an awning is still the
 * name). Sizes are in metres via `ppm`; `h` is the slope zone height in px.
 */
function slopeArt(ctx: CanvasRenderingContext2D, w: number, h: number, ppm: number, layout: AwningLayout, ground: string): void {
  if (layout.stripe !== 'none') {
    const bh = Math.max(4, Math.round(0.14 * ppm));
    const by = h - Math.round(0.07 * ppm) - bh;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, by - 2, w, bh + 4);
    drawStripe(ctx, layout.stripe, 0, by, w, bh, avoidGround(ground, layout.bandColors));
  }
  const hasIcon = layout.pictograms.length > 0;
  const cy = h * 0.38;
  const isz = Math.min(h * 0.5, 0.42 * ppm);
  const dh = Math.max(5, Math.round(0.13 * ppm));
  const pw = dh * 9.6 + 10;
  const gap = 0.3 * ppm;
  const total = (hasIcon ? isz + 6 : 0) + (hasIcon && layout.phone ? gap : 0) + (layout.phone ? pw : 0);
  let x = w / 2 - total / 2;
  if (hasIcon) {
    plateIcon(ctx, layout.pictograms[0], x + (isz + 6) / 2, cy, isz);
    x += isz + 6 + (layout.phone ? gap : 0);
  }
  if (layout.phone) {
    const cx = x + pw / 2;
    drawPlate(ctx, cx, cy, pw, dh + 10, 'rgba(18,16,14,1)', '#f1c232', 0.82);
    drawSegmentDigits(ctx, layout.phone, cx, cy, dh, '#fff1b8');
  }
}

interface MetalGround { ground: string; yellow: boolean }

function metalGround(color: string, text: string): MetalGround {
  const hsl = parseHex(color);
  const hashBit = (Rng.hash(text) >>> 17) & 1;
  if (hsl && hsl.s > 0.35 && hsl.l > 0.25 && hsl.h >= 35 && hsl.h <= 70) return { ground: color, yellow: true };
  if (hsl && hsl.s > 0.35 && hsl.l > 0.2 && (hsl.h <= 18 || hsl.h >= 340)) return { ground: color, yellow: false };
  const yellow = hashBit === 1;
  return { ground: yellow ? '#e7b52e' : '#c4252b', yellow };
}

/** Everything one zone painter needs. `h` is the zone height in px; `ppm` its density. */
interface Zone {
  /** Canvas y of the zone's top edge (the caller has translated by it); text is issued in canvas coordinates. */
  y0?: number;
  w: number;
  h: number;
  ppm: number;
  rng: Rng;
  color: string;
  text: string;
  layout: AwningLayout;
}

/** Sloped top face of the awning, vinyl or corrugated metal (wall end at the top, front edge at the bottom). */
function slopeZone(ctx: CanvasRenderingContext2D, z: Zone): void {
  const { w, h, ppm, rng, color, layout } = z;
  if (layout.style === 'vinyl') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const th = Math.max(3, Math.round(ppm * 0.025));
    withAlpha(ctx, 0.045, () => {
      ctx.fillStyle = '#000000';
      for (let x = 0; x < w; x += th) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += th) ctx.fillRect(0, y, w, 1);
    });
    speckle(ctx, w, h, rng, Math.round(w * h * 0.0035), ['#000000', '#ffffff'], 1, 2, 0.06);
    // vinyl comes in ~0.8 m panels; every other one is a touch darker
    const panel = 0.8 * ppm;
    for (let x = 0, i = 0; x < w; x += panel, i++) {
      if (i % 2) continue;
      withAlpha(ctx, 0.1, () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, 0, Math.min(panel, w - x), h);
      });
    }
    slopeArt(ctx, w, h, ppm, layout, color);
    // sun-faded band along the wall end, stepped so it fades out toward the front
    for (let i = 0; i < 5; i++) {
      withAlpha(ctx, 0.07, () => {
        ctx.fillStyle = '#f2ead6';
        ctx.fillRect(0, 0, w, h * 0.3 * (1 - i / 5));
      });
    }
    return;
  }
  const { ground } = metalGround(color, z.text);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  // vertical corrugation (ridges run down the slope), ~9 cm pitch
  const period = Math.max(4, Math.round(0.09 * ppm));
  const rw = Math.max(1, Math.round(period * 0.21));
  for (let x = 0; x < w; x += period) {
    withAlpha(ctx, 0.17, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + period * 0.14, 0, rw, h);
    });
    withAlpha(ctx, 0.2, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + period * 0.64, 0, rw, h);
    });
  }
  slopeArt(ctx, w, h, ppm, layout, ground);
  // rivet rows along the wall end and the fold (~17.5 cm pitch)
  const pitch = Math.max(8, Math.round(0.175 * ppm));
  const rr = Math.max(1.2, ppm * 0.016);
  for (const y of [Math.max(4, ppm * 0.04), h - Math.max(4, ppm * 0.04)]) {
    for (let x = pitch / 2; x < w; x += pitch) {
      ctx.fillStyle = '#34322f';
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 4; i++) {
    withAlpha(ctx, 0.06, () => {
      ctx.fillStyle = '#fff6dc';
      ctx.fillRect(0, 0, w, h * 0.22 * (1 - i / 4));
    });
  }
  const nStreaks = Math.max(4, Math.round((w / ppm) * 1.4));
  for (let i = 0; i < nStreaks; i++) sootStreak(ctx, rng.range(0, w), 0, rng.range(2, 6), rng.range(h * 0.3, h), 0.12, '#1a120a');
  speckle(ctx, w, h, rng, Math.round(w * h * 0.0005), ['#7a3a1a', '#5a2a12'], 1, 3, 0.35);
}

/**
 * Front valance: the lettering band (zone `h` px tall) plus `fringe` rows at the bottom that the mesh scallops sample
 * (they only carry colour and grime). With `arcs` (legacy fixed canvases) the scallops are painted instead.
 */
function valanceZone(ctx: CanvasRenderingContext2D, z: Zone, fringe: number, pitchPx: number, arcs: boolean): void {
  const { w, h, ppm, rng, color, layout } = z;
  const textBottom0 = h - fringe;
  if (layout.style === 'vinyl') {
    const hsl = parseHex(color);
    const light = hsl ? hsl.l > 0.62 : false;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const th = Math.max(3, Math.round(ppm * 0.025));
    withAlpha(ctx, 0.045, () => {
      ctx.fillStyle = '#000000';
      for (let x = 0; x < w; x += th) ctx.fillRect(x, 0, 1, h);
    });
    speckle(ctx, w, h, rng, Math.round(w * h * 0.0035), ['#000000', '#ffffff'], 1, 2, 0.06);
    withAlpha(ctx, 0.3, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    });
    let textBottom = textBottom0;
    if (arcs) {
      const sc = 8;
      const r = w / sc / 2;
      const base = h - r * 0.55;
      textBottom = base;
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
    } else if (fringe > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(0, textBottom0, w, fringe);
      withAlpha(ctx, 0.3, () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, textBottom0, w, fringe);
      });
    }
    // grime collects below each scallop tip and streaks down the valance
    const nTips = Math.max(1, Math.round(w / pitchPx));
    for (let i = 0; i < nTips; i++) {
      const cx = (i + 0.5) * pitchPx;
      if (fringe > 0) {
        withAlpha(ctx, rng.range(0.1, 0.22), () => {
          ctx.fillStyle = '#1c150d';
          ctx.fillRect(cx - pitchPx * 0.2, textBottom0, pitchPx * 0.4, fringe);
        });
      }
      if (rng.chance(0.6)) sootStreak(ctx, cx - 2, 3, rng.range(3, 6), (textBottom - 3) * rng.range(0.5, 1), 0.12, '#1c150d');
    }
    withAlpha(ctx, 0.25, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, 2);
    });
    if (light) valanceTextAbs(ctx, z.y0 ?? 0, w, 0, textBottom, ppm, layout, VINYL_FONT, '#1a1a1a', 'rgba(255,255,255,0.75)', 0.07, '#2a2a2a');
    else valanceTextAbs(ctx, z.y0 ?? 0, w, 0, textBottom, ppm, layout, VINYL_FONT, '#ffffff', 'rgba(0,0,0,0.6)', 0.07, '#f3f3ee');
    return;
  }
  const { ground, yellow } = metalGround(color, z.text);
  const period = Math.max(4, Math.round(0.09 * ppm));
  const rw = Math.max(1, Math.round(period * 0.21));
  ctx.fillStyle = yellow ? ground : '#f1c232';
  ctx.fillRect(0, 0, w, h);
  if (yellow) {
    withAlpha(ctx, 0.2, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    });
  }
  for (let x = 0; x < w; x += period) {
    withAlpha(ctx, 0.06, () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + period * 0.64, 0, rw, h);
    });
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, 3, w, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, h - Math.max(3, fringe), w, Math.max(3, fringe));
  const pitch = Math.max(8, Math.round(0.175 * ppm));
  const rr = Math.max(1.2, ppm * 0.016);
  const ry = textBottom0 - Math.max(3, ppm * 0.03);
  for (let x = pitch / 2; x < w; x += pitch) {
    ctx.fillStyle = '#34322f';
    ctx.beginPath();
    ctx.arc(x, ry, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, w, h, rng, Math.round(w * h * 0.0005), ['#7a3a1a', '#5a2a12'], 1, 3, 0.35);
  speckle(ctx, w, h, rng, Math.round(w * h * 0.0027), ['#000000', '#ffffff'], 1, 2, 0.05);
  valanceTextAbs(ctx, z.y0 ?? 0, w, 4, textBottom0 - Math.max(3, ppm * 0.03) - 2, ppm, layout, METAL_FONT, yellow ? '#c4161c' : '#1d3f8f', '#000000', 0.16, yellow ? '#1d3f8f' : '#c4161c');
}

/** Scallop pitch in px for a valance `widthM` wide at `ppm` (the mesh hangs a zigzag every ~0.34 m). */
function scallopPitchPx(widthM: number, ppm: number): number {
  return (widthM * ppm) / Math.max(4, Math.round(widthM / 0.34));
}

/**
 * Awning texture. Layout comes from layoutAwning(text): the archetype (bodega, laundromat, barber, ...) picks the
 * stripe band, the icons beside the name and the phone number. Style is vinyl (narrow type) or, for corner-store
 * types, corrugated metal (red/blue lettering). The name sits in the bottom band; text containing a '·' gets a small
 * secondary line (everything after the first '·'). The slope carries a big icon sticker, the phone number and a
 * stripe band; the name is the only printed text.
 *
 * One image, top to bottom: slope, valance, fringe rows. `geom` says what the canvas covers in metres (see
 * awningCanvasSize); the canvas must have been sized from it so one pixel is the same length across and down.
 * Without `geom` the painter treats the canvas as true-aspect at PX_PER_M with the old 72/28 split and painted
 * scallops (MaterialLibrary's fixed 512x256 plain awnings).
 */
export function awningPainter(color: string, text: string, geom?: AwningGeom): Painter {
  return (ctx, w, h, rng) => {
    const layout = layoutAwning(text);
    const g = geom ?? awningGeomOfCanvas(w, h);
    const ppm = w / g.widthM;
    const slopeH = Math.round(g.slopeM * ppm);
    const fringe = geom ? Math.round((g.fringeM ?? 0) * ppm) : 0;
    ctx.save();
    slopeZone(ctx, { w, h: slopeH, ppm, rng, color, text, layout });
    ctx.restore();
    ctx.save();
    ctx.translate(0, slopeH);
    valanceZone(ctx, { y0: slopeH, w, h: h - slopeH, ppm, rng, color, text, layout }, fringe, scallopPitchPx(g.widthM, ppm), !geom);
    ctx.restore();
  };
}

/** Just the sloped top face: the canvas is `widthM` wide and as tall as the slope at the same density. */
export function awningSlopePainter(color: string, text: string, widthM: number, style?: AwningStyle): Painter {
  return (ctx, w, h, rng) => {
    const layout = layoutAwning(text);
    if (style) layout.style = style;
    slopeZone(ctx, { w, h, ppm: w / widthM, rng, color, text, layout });
  };
}

/**
 * Just the front valance + fringe rows (canvas = widthM x (valanceM + fringeM)). `style` overrides the style the text
 * implies, so an empty-text plain tile can match a named one.
 */
export function awningValancePainter(color: string, text: string, geom: AwningGeom, style?: AwningStyle): Painter {
  return (ctx, w, h, rng) => {
    const layout = layoutAwning(text);
    if (style) layout.style = style;
    const ppm = w / geom.widthM;
    valanceZone(ctx, { w, h, ppm, rng, color, text, layout }, Math.round((geom.fringeM ?? 0) * ppm), scallopPitchPx(geom.widthM, ppm), false);
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
 * Sign board, backlit lightbox look: brighter centre, darker rim, thin metal frame, tracked-out text (wraps to two
 * lines if one line would be tiny). Text before a '·' is the big line, the rest a smaller second line. Optional
 * extras from the text: "OPEN n HRS", "ATM" and "WE ACCEPT EBT" corner badges (corner stores get ATM/EBT stickers
 * by default), an archetype icon on the left, a second-colour stripe, and bright neon-tube lettering with a glow
 * halo for bars and liquor stores. The canvas is sized from `geom` (see signCanvasSize), one pixel being the same
 * length across and down; icons and badges are drawn at their true shape. Without `geom` the canvas is treated as
 * true-aspect at PX_PER_M.
 */
export function signPainter(text: string, bg: string, fg: string, geom?: SignGeom): Painter {
  return (ctx, w, h, rng) => {
    const layout = layoutSign(text);
    const ppm = geom ? w / geom.widthM : w / signGeomOfCanvas(w, h).widthM;
    const k = h / 128; // line-weight scale relative to the original 128 px board
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // uneven backlight: stepped glow (nested rects) around a slightly off-centre hot spot
    const hx = w * rng.range(0.42, 0.58);
    for (let q = 0; q < 7; q++) {
      withAlpha(ctx, 0.028, () => {
        ctx.fillStyle = '#ffffff';
        const hw = Math.min(w * 0.5, 2.4 * ppm) * (1 - q * 0.12);
        const hh = h * (0.62 - q * 0.07);
        ctx.fillRect(hx - hw, h / 2 - hh, hw * 2, hh * 2);
      });
    }
    // darker rim where the tube light falls off
    for (let q = 0; q < 4; q++) {
      withAlpha(ctx, 0.06, () => {
        ctx.fillStyle = '#000000';
        const t = (2 + q * 2) * k;
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
    const stripeY = h - 5 * k - sh;
    if (stripe) {
      const cols = ['#d62828', '#f2b21b', '#1f6bd6'];
      const col = layout.archetype !== 'generic' ? layout.stripeColor : cols[(hash >>> 8) % cols.length];
      ctx.fillStyle = col === bg || col === fg ? '#d62828' : col;
      ctx.fillRect(5 * k, stripeY, w - 10 * k, sh);
      withAlpha(ctx, 0.2, () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(5 * k, stripeY, w - 10 * k, sh / 2);
      });
    }
    // thin frame
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 3 * k;
    ctx.strokeRect(1.5 * k, 1.5 * k, w - 3 * k, h - 3 * k);
    withAlpha(ctx, 0.6, () => {
      ctx.strokeStyle = '#0d0d0d';
      ctx.lineWidth = 1;
      ctx.strokeRect(4.5 * k, 4.5 * k, w - 9 * k, h - 9 * k);
    });
    if (layout.neon) {
      // neon tube border: wide halo, then the bright tube
      ctx.strokeStyle = layout.neonColors[0];
      for (const [lw, a] of [[9, 0.1], [5, 0.2]] as const) {
        withAlpha(ctx, a, () => {
          ctx.lineWidth = lw * k;
          ctx.strokeRect(11 * k, 11 * k, w - 22 * k, h - 22 * k);
        });
      }
      ctx.lineWidth = 2 * k;
      ctx.strokeRect(11 * k, 11 * k, w - 22 * k, h - 22 * k);
    }

    const areaTop = 6 * k;
    const areaBot = stripe ? stripeY - 1 : h - 6 * k;
    const areaH = areaBot - areaTop;
    const badges = layout.badges;
    const icon = layout.icon;
    // icon (left) and badges (right) hug the board ends; the text stays centred with the same margin on both sides
    const margin = Math.max(8, 0.12 * ppm);
    const isz = Math.min(areaH * 0.72, 0.38 * ppm);
    const bh = badges.length ? Math.min(0.24 * ppm, (areaH - 4 * (badges.length - 1)) / badges.length) : 0;
    const bw = badges.length ? Math.min(w * 0.17, Math.max(...badges.map((b) => b.label.length * 0.34 * bh + 16))) : 0;
    const iconW = icon ? isz + 12 : 0;
    const side = icon || badges.length ? Math.max(w * 0.05, iconW + margin * 2, bw + margin * 2) : w * 0.05;
    const maxW = w - 2 * side;
    if (icon) {
      const ix = margin + iconW / 2;
      const iy = areaTop + areaH / 2;
      if (layout.neon) {
        withAlpha(ctx, 0.28, () => drawPictogram(ctx, icon, ix, iy, isz * 1.3, layout.neonColors[0]));
        drawPictogram(ctx, icon, ix, iy, isz, layout.neonColors[0]);
      } else {
        drawPlate(ctx, ix, iy, isz + 10, isz + 8, PLATE_FILL, PLATE_EDGE);
        drawPictogram(ctx, icon, ix, iy, isz * 0.82, PICTOGRAM_COLOR[icon]);
      }
    }
    if (badges.length) {
      const total = bh * badges.length + 6 * (badges.length - 1);
      const bx = w - margin - bw;
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

// ---------------------------------------------------------------------------------------------- sticker atlas

/** Bold centred line shrunk to fit; plain fill, no outline. */
function stickerText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, maxH: number, fill: string): void {
  setSpacing(ctx, 0);
  fitFont(ctx, text, maxW, maxH, 'bold', 'Arial, Helvetica, sans-serif', 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);
}

/**
 * Window-sticker atlas (STICKER_ATLAS px, slots in STICKER_SLOTS): ATM, "WE ACCEPT EBT", lotto, "24 HRS", a neon
 * OPEN sign, a camera warning, a no-loitering notice and a menu board. Generic wording only (no brands). Unpainted
 * area stays transparent so the decal quads can alpha-test it; the whole atlas doubles as the emissive map, so the
 * stickers (the neon OPEN above all) glow at night.
 */
export const stickerAtlasPainter: Painter = (ctx, _w, _h, rng) => {
  const slot = (k: StickerKind) => STICKER_SLOTS[k];
  const plate = (k: StickerKind, fill: string, edge: string): { cx: number; cy: number; w: number; h: number } => {
    const s = slot(k);
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    drawPlate(ctx, cx, cy, s.w - 8, s.h - 8, fill, edge, 1);
    return { cx, cy, w: s.w - 8, h: s.h - 8 };
  };
  let p = plate('atm', '#1f5fbf', '#ffffff');
  drawPictogram(ctx, 'atm', p.cx, p.cy - 18, 62, '#dfeaff');
  stickerText(ctx, 'ATM', p.cx, p.cy + 38, p.w - 16, 30, '#ffffff');

  p = plate('ebt', '#fff4d6', '#e07b00');
  stickerText(ctx, 'WE ACCEPT', p.cx, p.cy - 28, p.w - 14, 20, '#7a3c00');
  stickerText(ctx, 'EBT', p.cx, p.cy + 12, p.w - 14, 52, '#e07b00');
  stickerText(ctx, 'CARDS', p.cx, p.cy + 44, p.w - 14, 18, '#7a3c00');

  p = plate('lotto', '#c4161c', '#fff4d6');
  drawPictogram(ctx, 'lottery', p.cx, p.cy - 14, 56, '#ffffff');
  stickerText(ctx, 'LOTTO', p.cx, p.cy + 36, p.w - 12, 30, '#ffffff');

  p = plate('h24', '#f1c232', '#111111');
  stickerText(ctx, 'OPEN', p.cx, p.cy - 28, p.w - 14, 28, '#111111');
  stickerText(ctx, '24', p.cx, p.cy + 10, p.w - 14, 56, '#c4161c');
  stickerText(ctx, 'HOURS', p.cx, p.cy + 44, p.w - 14, 20, '#111111');

  // neon OPEN: dark board, blue tube border, red tube letters
  const so = slot('open');
  const ox = so.x + so.w / 2, oy = so.y + so.h / 2;
  drawPlate(ctx, ox, oy, so.w - 8, so.h - 8, '#06060c', '#2a2a3a', 1);
  ctx.strokeStyle = '#2ee6ff';
  for (const [lw, a] of [[9, 0.12], [5, 0.25]] as const) {
    withAlpha(ctx, a, () => {
      ctx.lineWidth = lw;
      ctx.strokeRect(so.x + 14, so.y + 14, so.w - 28, so.h - 28);
    });
  }
  ctx.lineWidth = 2.5;
  ctx.strokeRect(so.x + 14, so.y + 14, so.w - 28, so.h - 28);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setSpacing(ctx, 0);
  const opx = fitFont(ctx, 'OPEN', so.w - 70, so.h * 0.5, 'bold', 'Arial Black, Arial, sans-serif', 10);
  neonText(ctx, 'OPEN', ox, oy + 2, opx, '#ff3d4a');

  p = plate('camera', '#f4f4f0', '#111111');
  stickerText(ctx, 'SMILE', p.cx, p.cy - 30, p.w - 14, 26, '#111111');
  stickerText(ctx, "YOU'RE ON", p.cx, p.cy, p.w - 14, 22, '#111111');
  stickerText(ctx, 'CAMERA', p.cx, p.cy + 28, p.w - 14, 26, '#c4161c');

  p = plate('noloiter', '#ffffff', '#c4161c');
  stickerText(ctx, 'NO', p.cx, p.cy - 28, p.w - 14, 28, '#c4161c');
  stickerText(ctx, 'LOITERING', p.cx, p.cy + 6, p.w - 10, 22, '#111111');
  stickerText(ctx, 'THANK YOU', p.cx, p.cy + 36, p.w - 14, 16, '#444444');

  // menu board: dark green, header, ruled lines with price ticks
  p = plate('menu', '#1f3a2c', '#d9c9a0');
  stickerText(ctx, 'MENU', p.cx, p.cy - 38, p.w - 20, 24, '#f4ead0');
  for (let i = 0; i < 5; i++) {
    const y = p.cy - 14 + i * 14;
    withAlpha(ctx, 0.85, () => {
      ctx.fillStyle = '#f4ead0';
      ctx.fillRect(p.cx - p.w / 2 + 14, y, (p.w - 28) * (0.52 + rng.range(0, 0.2)), 3);
      ctx.fillRect(p.cx + p.w / 2 - 34, y, 20, 3);
    });
  }
  setSpacing(ctx, 0);
};

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
