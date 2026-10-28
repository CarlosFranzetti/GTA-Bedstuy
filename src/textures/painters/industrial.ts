import type { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { auxSpeckle, gray, hsl, sootStreak, wrapVariant } from './util';

/**
 * Procedural painters for the surfaces R1 could not source as CC0 photo sets: corrugated galvanized steel, chain-link
 * fabric (+ top rail), granite curb, cast-iron areaway / stoop railing, tar and aluminium-coated roll roofing, and a
 * graffiti decal layer. Look notes and sources: docs/reference/bedstuy-surfaces.md section 8.
 *
 * House rules (same as the other painters): only fillRect / strokeRect / arc / path calls (no gradients, no ellipse,
 * no clearRect, no pixel access); every random draw comes from the main rng so the colour map is identical with or
 * without `aux`; relief-only noise uses aux.rng. Tileable painters draw anything that crosses an edge twice (wrap
 * helpers below) and use periodic functions with integer cycle counts for gradients.
 */

const TAU = Math.PI * 2;

const rgb = (r: number, g: number, b: number): string => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/** Wrap offsets so a shape spanning [lo, hi) on an axis of length n is also drawn where it crosses the far edge. */
function offsets(lo: number, hi: number, n: number): number[] {
  const o = [0];
  if (hi > n) o.push(-n);
  if (lo < 0) o.push(n);
  return o;
}

/** fillRect with toroidal wrap. */
function rectWrap(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, rw: number, rh: number): void {
  for (const ox of offsets(x, x + rw, w)) {
    for (const oy of offsets(y, y + rh, h)) ctx.fillRect(x + ox, y + oy, rw, rh);
  }
}

/** Filled disc with toroidal wrap. */
function discWrap(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, r: number): void {
  for (const ox of offsets(x - r, x + r, w)) {
    for (const oy of offsets(y - r, y + r, h)) {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, TAU);
      ctx.fill();
    }
  }
}

/** speckle() with toroidal wrap; optionally restricted to a horizontal band of the tile. */
function speckleWrap(
  ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng,
  count: number, colors: readonly string[], minSize: number, maxSize: number, alpha: number,
  y0 = 0, y1 = h,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    const s = rng.range(minSize, maxSize);
    const x = Math.floor(rng.range(0, w));
    const y = Math.floor(rng.range(y0, y1));
    rectWrap(ctx, w, h, x, y, s, s);
  }
  ctx.restore();
}

function alphaFill(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
}

// ---------------------------------------------------------------------------------------------- corrugated steel

export const CORRUGATED_VARIANTS = 3;
const RIB_PX = 32; // one 76 mm pitch rib; 512 px = 16 ribs = ~1.22 m

/**
 * 512px, tiles both ways. Vertical ribs, 76 mm pitch (32 px, 16 ribs, so 1 px ~ 2.4 mm): sine profile lit from the
 * left, sheet laps every 8 ribs, fastener rows on the crests every 0.6 m with rust streaks running down from the
 * washers. Variants: 0 galvanized with zinc spangle, 1 faded painted sheet (green / blue / red) with peeled patches,
 * 2 heavily rusted. Relief: the corrugation profile + fastener heads (normal map shows the ribs).
 */
export const corrugatedSteelPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, CORRUGATED_VARIANTS);
  const H = aux?.height;
  const ribs = Math.round(w / RIB_PX);
  const rib = w / ribs;
  const sheetRibs = Math.max(1, Math.round(ribs / 2));
  const nSheets = Math.max(1, Math.round(ribs / sheetRibs));
  const tone: number[] = [];
  for (let i = 0; i < nSheets; i++) tone.push(rng.range(-4, 4));

  let hue = 205, sat = 6, lit = 60;
  if (v === 1) {
    const pick = rng.int(0, 2);
    [hue, sat, lit] = [[150, 22, 30], [208, 28, 34], [4, 38, 31]][pick];
  } else if (v === 2) {
    [hue, sat, lit] = [20, 50, 30];
  }

  // corrugation profile, one column at a time (periodic: trough at both tile edges)
  for (let c = 0; c < w; c++) {
    const r = Math.floor(c / rib);
    const t = ((c % rib) + 0.5) / rib;
    const hp = (1 - Math.cos(TAU * t)) / 2;
    const slope = Math.sin(TAU * t);
    const ao = (1 - hp) * (1 - hp);
    const sheet = Math.min(nSheets - 1, Math.floor(r / sheetRibs));
    ctx.fillStyle = hsl(hue, sat, lit + 15 * slope + 6 * (hp - 0.5) - 5 * ao + tone[sheet]);
    ctx.fillRect(c, 0, 1, h);
    if (H) {
      H.fillStyle = gray(70 + 130 * hp);
      H.fillRect(c, 0, 1, h);
    }
  }

  // sheet laps: dark overlap shadow, pale edge
  for (let s = 0; s < nSheets; s++) {
    const x = Math.round(s * sheetRibs * rib);
    ctx.save();
    alphaFill(ctx, '#000000', 0.45);
    rectWrap(ctx, w, h, x - 1, 0, 3, h);
    alphaFill(ctx, '#ffffff', 0.18);
    rectWrap(ctx, w, h, x + 2, 0, 1, h);
    ctx.restore();
  }

  // very faint periodic dirt banding (integer cycle count so it tiles)
  const bands = 24;
  ctx.save();
  ctx.fillStyle = '#1a1612';
  for (let i = 0; i < bands; i++) {
    const y0 = Math.round((i * h) / bands);
    const y1 = Math.round(((i + 1) * h) / bands);
    ctx.globalAlpha = 0.07 * (0.5 + 0.5 * Math.sin((TAU * (i + 0.5) * 3) / bands + 0.6));
    ctx.fillRect(0, y0, w, y1 - y0);
  }
  ctx.restore();

  if (v === 0) {
    speckleWrap(ctx, w, h, rng, 2200, ['#eef2f4', '#aab2b7', '#7d868c', '#c9d0d4'], 1, 3, 0.2);
    speckleWrap(ctx, w, h, rng, 150, ['#ffffff', '#9aa3a8'], 3, 6, 0.08);
  } else if (v === 1) {
    speckleWrap(ctx, w, h, rng, 700, ['#000000', '#ffffff'], 1, 2, 0.07);
    // chalking: pale vertical streaks
    for (let i = 0; i < 10; i++) {
      ctx.save();
      alphaFill(ctx, '#e8e8e0', rng.range(0.04, 0.09));
      rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), 0, Math.floor(rng.range(3, 10)), h);
      ctx.restore();
    }
    // peeled paint: galvanized showing through, rusty rim, mostly on crests and low down
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rng.range(0, w));
      const lowBias = rng.chance(0.5);
      const y = Math.floor(lowBias ? rng.range(h * 0.6, h) : rng.range(0, h));
      const pw = Math.floor(rng.range(2, 9));
      const ph = Math.floor(rng.range(3, 22));
      ctx.save();
      alphaFill(ctx, '#7a3d1c', 0.7);
      rectWrap(ctx, w, h, x - 1, y - 1, pw + 2, ph + 2);
      alphaFill(ctx, rng.chance(0.5) ? '#b4bbbf' : '#8f979c', 0.95);
      rectWrap(ctx, w, h, x, y, pw, ph);
      ctx.restore();
    }
  } else {
    // rust mottle plus a few galvanized remnants
    const cols = ['#7a3a16', '#9b4f1f', '#5c2a10', '#b86a2c', '#43200d'];
    for (let i = 0; i < 260; i++) {
      ctx.save();
      alphaFill(ctx, cols[Math.floor(rng.next() * cols.length)], rng.range(0.16, 0.38));
      discWrap(ctx, w, h, rng.range(0, w), rng.range(0, h), rng.range(3, 16));
      ctx.restore();
    }
    speckleWrap(ctx, w, h, rng, 1400, ['#2a1408', '#c7803a', '#6b3213'], 1, 3, 0.4);
    speckleWrap(ctx, w, h, rng, 220, ['#aab2b7', '#c9d0d4'], 1, 3, 0.35);
    if (H) auxSpeckle(H, aux!.rng, 0, 0, w, h, 3500, [95, 110, 150], 1, 3, 0.35);
  }

  // fastener rows on the crests (every second rib, staggered per row) + rust streaks below each washer
  const rows = [Math.round(h * 0.125), Math.round(h * 0.625)];
  const rustP = [0.55, 0.7, 1][v];
  const streakCol = v === 2 ? '#4a210c' : '#82421c';
  rows.forEach((fy, ri) => {
    for (let r = ri % 2; r < ribs; r += 2) {
      const fx = Math.round(r * rib + rib / 2);
      const streak = rng.chance(rustP);
      const len = rng.range(40, 150);
      const sw = rng.range(4, 7);
      if (streak) {
        for (const dy of [0, -h]) {
          if (dy === 0 || fy + 3 + len > h) {
            sootStreak(ctx, fx - sw / 2, fy + 3 + dy, sw, len, 0.55, streakCol);
            sootStreak(ctx, fx - sw, fy + 3 + dy, sw * 2, len * 0.6, 0.12, streakCol);
          }
        }
      }
      ctx.fillStyle = '#25272a';
      ctx.beginPath();
      ctx.arc(fx, fy, 3.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = v === 2 ? '#7d4a28' : '#9aa0a4';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.4, 0, TAU);
      ctx.fill();
      if (H) {
        H.fillStyle = gray(215);
        H.beginPath();
        H.arc(fx, fy, 3.4, 0, TAU);
        H.fill();
      }
    }
  });
};

// ---------------------------------------------------------------------------------------------- chain link

export const CHAINLINK_FENCE_VARIANTS = 3;
export const CHAINLINK_RAIL_VARIANTS = 2;

/**
 * 256px, tiles both ways, alpha-tested (transparent between wires). 2 in (50 mm) mesh: wires run at slope 2:1 so a
 * diamond is 32 px wide x 64 px tall and the perpendicular wire-to-wire pitch is 28.6 px = 50 mm, i.e. 1 px ~ 1.75 mm
 * and the tile is ~0.45 m square. Wire 9 gauge (~3.8 mm = 2.2 px); the vinyl-coated variant is thicker.
 * Variants: 0 galvanized, 1 green vinyl-coated, 2 galvanized with rust flecks. Wire coverage is ~16-25 % of the tile.
 */
export const chainlinkFencePainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, CHAINLINK_FENCE_VARIANTS);
  const P = w / 8; // horizontal wire spacing
  const dx = (h / 2); // run of one wire across the tile height (slope 2:1)
  const vinyl = v === 1;
  const body = vinyl ? '#25522f' : '#aeb4b9';
  const light = vinyl ? '#5b9a68' : '#eef1f3';
  const dark = vinyl ? 'rgba(8,24,12,0.8)' : 'rgba(44,48,52,0.8)';
  const wireW = vinyl ? 3.3 : 2.3;

  const family = (sign: 1 | -1, offX: number, lw: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    if (sign === 1) {
      for (let c = -dx; c <= w; c += P) {
        ctx.moveTo(c + offX, 0);
        ctx.lineTo(c + dx + offX, h);
      }
    } else {
      for (let c = 0; c <= w + dx; c += P) {
        ctx.moveTo(c + offX, 0);
        ctx.lineTo(c - dx + offX, h);
      }
    }
    ctx.stroke();
  };
  // under-shadow, body, highlight (light from the upper left)
  family(1, 0.7, wireW + 0.9, dark);
  family(-1, 0.7, wireW + 0.9, dark);
  family(1, 0, wireW, body);
  family(-1, 0, wireW, body);
  family(1, -0.45, vinyl ? 1.0 : 0.8, light);
  family(-1, -0.45, vinyl ? 1.0 : 0.8, light);

  // knuckles: every crossing is a bend where two wires hook together
  ctx.fillStyle = dark;
  for (let y = 0; y < h; y += P) {
    for (let x = (y / P) % 2 === 0 ? 0 : P / 2; x < w; x += P) {
      rectWrap(ctx, w, h, x - 1.6, y - 1.6, 3.4, 3.4);
    }
  }
  ctx.fillStyle = vinyl ? '#3d7a4c' : '#c9ced2';
  for (let y = 0; y < h; y += P) {
    for (let x = (y / P) % 2 === 0 ? 0 : P / 2; x < w; x += P) {
      rectWrap(ctx, w, h, x - 1.2, y - 1.4, 2.2, 2.2);
    }
  }

  if (v === 2 || v === 0) {
    // rust flecks and a little grime sitting on the wires
    const n = v === 2 ? 130 : 22;
    const rust = ['#8a4b24', '#a35a2a', '#6e3a1c'];
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(rng.range(0, w / P)) * P;
      const y = rng.range(0, h);
      const sign = rng.chance(0.5) ? 1 : -1;
      const x = sign === 1 ? cx + y / 2 : cx - y / 2 + w;
      ctx.save();
      alphaFill(ctx, rust[Math.floor(rng.next() * rust.length)], rng.range(0.45, 0.85));
      rectWrap(ctx, w, h, ((x % w) + w) % w - 1, y - 1, rng.range(1.6, 3.6), rng.range(1.6, 3.6));
      ctx.restore();
    }
  }
};

/**
 * 256x64 strip, tiles horizontally, transparent above and below: a 1-3/8 in (42 mm) top rail, 26 px tall
 * (1 px ~ 1.75 mm), with a sleeve joint and a tie-wire loop. Variants: 0 galvanized, 1 green vinyl.
 */
export const chainlinkRailPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, CHAINLINK_RAIL_VARIANTS);
  const d = 26;
  const y0 = Math.round((h - d) / 2);
  const [hue, sat, base] = v === 0 ? [205, 5, 56] : [140, 34, 22];
  for (let r = 0; r < d; r++) {
    const t = (r + 0.5) / d;
    const l = base - 10 + 28 * Math.cos(Math.PI * (t - 0.32));
    ctx.fillStyle = hsl(hue, sat, l);
    ctx.fillRect(0, y0 + r, w, 1);
  }
  // specular line
  ctx.save();
  alphaFill(ctx, '#ffffff', v === 0 ? 0.5 : 0.28);
  ctx.fillRect(0, y0 + 5, w, 1.5);
  ctx.restore();
  // sleeve joint (slightly larger collar) and tie wire loop
  const sx = Math.round(w * 0.75);
  ctx.save();
  alphaFill(ctx, '#000000', 0.25);
  ctx.fillRect(sx, y0 - 1, 12, d + 2);
  ctx.fillStyle = hsl(hue, sat, base + 6);
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sx + 1, y0 - 1, 3, d + 2);
  ctx.restore();
  const tx = Math.round(w * 0.5);
  ctx.fillStyle = '#4a4e52';
  ctx.fillRect(tx, y0 - 5, 2, d + 10);
  ctx.fillRect(tx + 4, y0 - 4, 2, d + 8);
  ctx.fillStyle = '#9ea3a7';
  ctx.fillRect(tx, y0 - 5, 1, d + 10);
  if (v === 0) {
    for (let i = 0; i < 40; i++) {
      ctx.save();
      alphaFill(ctx, i % 2 ? '#8a4b24' : '#6e3a1c', rng.range(0.3, 0.7));
      rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), y0 + Math.floor(rng.range(0, d)), rng.range(1, 3), rng.range(1, 2));
      ctx.restore();
    }
  }
};

// ---------------------------------------------------------------------------------------------- granite curb

export const GRANITE_CURB_VARIANTS = 2;

/**
 * 512x128, tiles horizontally (one 1.2 m stone, joint centred on the tile edge so it is 3 px of dark line across the
 * seam). 1 px ~ 2.4 mm. Rows: 0..0.48 flat top (6 in = 15 cm, worn pale), 0.48..0.54 chamfer (bright bevel), 0.54..0.92
 * vertical face (tyre scuffs, soot toward the foot), 0.92..1 gutter (dark asphalt grit and silt). Variants: 0 grey
 * salt-and-pepper granite, 1 warmer pink-grey weathered stone. Relief: chamfer ramp, joint groove, gutter low.
 */
export const graniteCurbPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, GRANITE_CURB_VARIANTS);
  const H = aux?.height;
  const yTop = Math.round(h * 0.48);
  const yCham = Math.round(h * 0.54);
  const yFace = Math.round(h * 0.92);
  const top = v === 0 ? [142, 141, 139] : [152, 142, 137];
  const cham = v === 0 ? [178, 177, 174] : [186, 174, 167];
  const face = v === 0 ? [112, 111, 110] : [122, 111, 106];

  ctx.fillStyle = rgb(top[0], top[1], top[2]);
  ctx.fillRect(0, 0, w, yTop);
  ctx.fillStyle = rgb(cham[0], cham[1], cham[2]);
  ctx.fillRect(0, yTop, w, yCham - yTop);
  ctx.fillStyle = rgb(face[0], face[1], face[2]);
  ctx.fillRect(0, yCham, w, yFace - yCham);
  ctx.fillStyle = rgb(64, 59, 53);
  ctx.fillRect(0, yFace, w, h - yFace);
  if (H) {
    H.fillStyle = gray(136);
    H.fillRect(0, 0, w, yTop);
    for (let i = 0; i < yCham - yTop; i++) {
      H.fillStyle = gray(136 - (34 * (i + 0.5)) / (yCham - yTop));
      H.fillRect(0, yTop + i, w, 1);
    }
    H.fillStyle = gray(102);
    H.fillRect(0, yCham, w, yFace - yCham);
    H.fillStyle = gray(70);
    H.fillRect(0, yFace, w, h - yFace);
  }

  // soft tonal patches across the stone
  for (let i = 0; i < 18; i++) {
    ctx.save();
    alphaFill(ctx, i % 2 === 0 ? 'rgb(196,168,160)' : 'rgb(58,56,58)', rng.range(0.04, 0.09));
    rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), Math.floor(rng.range(0, yFace - 10)), rng.range(30, 120), rng.range(8, 30));
    ctx.restore();
  }
  // salt and pepper: black biotite, white quartz, pink feldspar
  const cols = v === 0
    ? ['#3a3838', '#2c2b2b', '#d2cbc7', '#e6e0db', '#b0a6a2', '#645f5e', '#7d7776']
    : ['#3a3636', '#2c2929', '#dcd0c8', '#e6dcd2', '#b98f88', '#a27d77', '#6d6260'];
  speckleWrap(ctx, w, h, rng, 4600, cols, 1, 2.6, 0.62, 0, yFace);
  speckleWrap(ctx, w, h, rng, 26, ['#2a2929', '#e8e0da', '#b58a82'], 2.5, 4.5, 0.9, 0, yFace);
  if (H) auxSpeckle(H, aux!.rng, 0, 0, w, yFace, 3600, [96, 112, 140, 158], 1, 3, 0.5);

  // traffic wear: pale polished streaks on the top, dark tyre scuffs on the face
  for (let i = 0; i < 34; i++) {
    ctx.save();
    alphaFill(ctx, '#f2eee8', rng.range(0.04, 0.1));
    rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), Math.floor(rng.range(2, yTop - 2)), rng.range(30, 160), rng.range(1, 3));
    ctx.restore();
  }
  for (let i = 0; i < 46; i++) {
    ctx.save();
    alphaFill(ctx, '#0c0b0a', rng.range(0.1, 0.26));
    rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), Math.floor(rng.range(yCham + 2, yFace - 6)), rng.range(10, 70), rng.range(2, 6));
    ctx.restore();
  }
  // soot / road grime thickening toward the foot of the face
  const sootN = 16;
  ctx.fillStyle = '#0a0907';
  for (let i = 0; i < sootN; i++) {
    const a = 0.36 * (1 - i / sootN) * (1 - i / sootN);
    ctx.globalAlpha = a;
    ctx.fillRect(0, yFace - 1 - i, w, 1);
  }
  ctx.globalAlpha = 1;
  // chips along the front arris
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rng.range(0, w));
    ctx.save();
    alphaFill(ctx, '#4a4745', 0.7);
    rectWrap(ctx, w, h, x, yTop + 1, Math.floor(rng.range(2, 6)), 2);
    alphaFill(ctx, '#d6d2cc', 0.7);
    rectWrap(ctx, w, h, x + 1, yTop - 2, Math.floor(rng.range(2, 5)), 1);
    ctx.restore();
  }

  // gutter silt spilling up onto the foot of the face (periodic wavy edge, 4 px columns)
  const ph1 = rng.range(0, TAU);
  const ph2 = rng.range(0, TAU);
  for (let x = 0; x < w; x += 4) {
    const e = 4 + 2.6 * Math.sin((TAU * 3 * x) / w + ph1) + 1.8 * Math.sin((TAU * 11 * x) / w + ph2);
    ctx.save();
    alphaFill(ctx, 'rgb(74,67,58)', 0.9);
    ctx.fillRect(x, yFace - e, 4, e);
    ctx.restore();
  }
  speckleWrap(ctx, w, h, rng, 900, ['#2a2723', '#8a8176', '#4a443c', '#b4aa9a'], 1, 2.4, 0.7, yFace - 3, h);
  // the stone joint: dark seam, 3 px, centred on the tile edge
  ctx.save();
  alphaFill(ctx, '#161412', 0.9);
  rectWrap(ctx, w, h, -1, 0, 3, yFace);
  alphaFill(ctx, '#c9c4bc', 0.35);
  rectWrap(ctx, w, h, 2, 0, 1, yFace);
  ctx.restore();
  if (H) {
    H.fillStyle = gray(36);
    rectWrap(H, w, h, -1, 0, 3, yFace);
  }
};

// ---------------------------------------------------------------------------------------------- cast iron

export const CAST_IRON_VARIANTS = 3;

/** Fill a polygon given as flat [x, y, x, y, ...]. */
function poly(ctx: CanvasRenderingContext2D, pts: readonly number[], dx = 0): void {
  ctx.beginPath();
  ctx.moveTo(pts[0] + dx, pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] + dx, pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * 256x256 strip texture for areaway fences and stoop railings, alpha-tested, tiles horizontally (period 128 px).
 * 1 px ~ 3.6 mm, so the tile is ~0.91 m x 0.91 m (a 1 m fence height): pickets on 114 mm centres, 18 mm square
 * bars. NOT tileable vertically (finials at the top, picket feet at the bottom edge): map v once across the height.
 * Variants: 0 areaway fence with spear finials and ball-top posts; 1 stoop railing with a flat handrail and a band
 * of interlocking ring scrolls; 2 older rusty fleur-de-lis pattern. Black iron, thin light edge on the left of each
 * bar, a little rust at the joints.
 */
export const castIronFencePainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, CAST_IRON_VARIANTS);
  const sp = w / 8; // picket spacing, 32 px
  const iron = v === 2 ? '#201d1b' : '#17181a';
  const edge = v === 2 ? '#5a524c' : '#4c4f55';
  const topRailY = v === 1 ? 44 : 56;
  const topRailH = v === 1 ? 10 : 8;
  const botRailY = 214;
  const pw = v === 1 ? 4 : 5;
  const feet = h;

  const bar = (x: number, y: number, bw: number, bh: number): void => {
    ctx.fillStyle = iron;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, 1, bh);
  };

  // pickets run from under the finial to the bottom edge
  for (let i = 0; i < 8; i++) {
    const cx = i * sp + sp / 2;
    const post = i % 4 === 0;
    const bw = post ? pw + 5 : pw;
    bar(cx - bw / 2, v === 1 ? topRailY : 30, bw, feet - (v === 1 ? topRailY : 30));
  }
  // rails
  bar(0, topRailY, w, topRailH);
  bar(0, botRailY, w, 7);
  ctx.fillStyle = edge;
  ctx.fillRect(0, topRailY, w, 1);
  ctx.fillRect(0, botRailY, w, 1);

  for (let i = 0; i < 8; i++) {
    const cx = i * sp + sp / 2;
    const post = i % 4 === 0;
    ctx.fillStyle = iron;
    if (v === 0) {
      if (post) {
        // ball-top post
        ctx.beginPath();
        ctx.arc(cx, 16, 8, 0, TAU);
        ctx.fill();
        ctx.fillRect(cx - 5, 22, 10, 10);
        ctx.fillStyle = edge;
        ctx.fillRect(cx - 4, 12, 2, 3);
      } else {
        // spear head: collar + leaf
        poly(ctx, [cx, 4, cx + 5.5, 22, cx + 1.5, 26, cx - 1.5, 26, cx - 5.5, 22]);
        poly(ctx, [cx - 3.5, 27, cx + 3.5, 27, cx + 2.5, 33, cx - 2.5, 33]);
        ctx.fillStyle = edge;
        ctx.fillRect(cx - 1, 8, 1, 14);
      }
    } else if (v === 1) {
      if (post) {
        ctx.beginPath();
        ctx.arc(cx, 28, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = edge;
        ctx.fillRect(cx - 5, 24, 2, 3);
      } else {
        poly(ctx, [cx, 32, cx + 4, 42, cx - 4, 42]);
      }
    } else {
      // fleur-de-lis: central leaf, two curling petals, binding band
      poly(ctx, [cx, 2, cx + 4.5, 18, cx + 1.5, 28, cx - 1.5, 28, cx - 4.5, 18]);
      ctx.strokeStyle = iron;
      ctx.lineWidth = 2.6;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + sgn * 1.5, 26);
        ctx.quadraticCurveTo(cx + sgn * 12, 26, cx + sgn * 10, 14);
        ctx.quadraticCurveTo(cx + sgn * 8.5, 9, cx + sgn * 5.5, 12);
        ctx.stroke();
      }
      ctx.fillStyle = iron;
      ctx.fillRect(cx - 6, 29, 12, 4);
      ctx.fillStyle = edge;
      ctx.fillRect(cx - 6, 29, 12, 1);
      ctx.fillRect(cx - 1, 6, 1, 14);
    }
  }

  if (v === 1) {
    // interlocking ring scrolls between the pickets, centred on the gaps (so they cross the tile edge once)
    ctx.strokeStyle = iron;
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const gx = i * sp;
      for (const ox of offsets(gx - 14, gx + 14, w)) {
        ctx.beginPath();
        ctx.arc(gx + ox, 134, 14, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const gx = i * sp;
      for (const ox of offsets(gx - 14, gx + 14, w)) {
        ctx.beginPath();
        ctx.arc(gx + ox - 0.5, 133.5, 14, Math.PI * 0.95, Math.PI * 1.55);
        ctx.stroke();
      }
    }
  }

  // rust: orange flecks only where there is iron (rails and pickets), more at the joints; drips on the old pattern
  const nRust = v === 2 ? 170 : v === 0 ? 40 : 55;
  const rust = ['#8a4b24', '#a35a2a', '#6e3a1c', '#5a2c14'];
  for (let i = 0; i < nRust; i++) {
    const onRail = rng.chance(0.55);
    const pick = Math.floor(rng.range(0, 8));
    const cx = pick * sp + sp / 2;
    const x = onRail ? rng.range(0, w) : cx + rng.range(-pw / 2, pw / 2);
    const y = onRail ? (rng.chance(0.5) ? topRailY + rng.range(0, topRailH) : botRailY + rng.range(0, 7)) : rng.range(60, 250);
    ctx.save();
    alphaFill(ctx, rust[Math.floor(rng.next() * rust.length)], rng.range(0.5, 0.9));
    rectWrap(ctx, w, h, Math.floor(x), Math.floor(y), rng.range(1, 3), rng.range(1, 3));
    ctx.restore();
  }
  if (v === 2) {
    for (let i = 0; i < 14; i++) {
      const pick = Math.floor(rng.range(0, 8));
      const x = pick * sp + sp / 2 - pw / 2 + rng.range(0, pw - 1);
      ctx.save();
      alphaFill(ctx, '#7a3a16', rng.range(0.4, 0.7));
      ctx.fillRect(Math.floor(x), topRailY + topRailH, 1.5, rng.range(8, 50));
      ctx.restore();
    }
  }
};

// ---------------------------------------------------------------------------------------------- tar / roll roofing

export const TAR_ROOF_VARIANTS = 3;

/** Irregular quad with jittered corners, optionally filled. */
function ragged(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, rw: number, rh: number, jit: number): number[] {
  const pts = [
    x + rng.range(0, jit), y + rng.range(0, jit),
    x + rw / 2 + rng.range(-jit, jit), y + rng.range(-jit * 0.4, jit * 0.6),
    x + rw - rng.range(0, jit), y + rng.range(0, jit),
    x + rw - rng.range(0, jit * 0.6), y + rh / 2 + rng.range(-jit, jit),
    x + rw - rng.range(0, jit), y + rh - rng.range(0, jit),
    x + rw / 2 + rng.range(-jit, jit), y + rh - rng.range(-jit * 0.4, jit * 0.6),
    x + rng.range(0, jit), y + rh - rng.range(0, jit),
    x + rng.range(0, jit * 0.6), y + rh / 2 + rng.range(-jit, jit),
  ];
  poly(ctx, pts);
  return pts;
}

/**
 * 512px, tiles both ways. Roll roofing in 0.9 m (36 in) widths: the tile is two strips (1 px ~ 3.5 mm, 512 px = 1.8 m),
 * lap seams with a black sealant bead at x = 0 and x = 256 (so "every 0.9 m"), staggered end laps. Variants: 0 black
 * granule-surfaced asphalt with silver aluminium-paint patches, 1 fully aluminium-coated (dirty silver, black where the
 * coating has peeled), 2 aged: faded dark grey with blisters, alligator cracks and pooled dirt rings from ponding.
 */
export const tarRoofPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, TAR_ROOF_VARIANTS);
  const H = aux?.height;
  const strip = w / 2;
  const base = v === 0 ? [38, 36, 34] : v === 1 ? [122, 126, 129] : [56, 53, 49];

  for (let s = 0; s < 2; s++) {
    const dt = rng.range(-4, 4);
    ctx.fillStyle = rgb(base[0] + dt, base[1] + dt, base[2] + dt);
    ctx.fillRect(s * strip, 0, strip, h);
  }
  // mineral granules / grit
  const grit = v === 1
    ? ['#a4a9ac', '#6e7377', '#b9bdc0', '#5c6064']
    : ['#55524e', '#2a2826', '#6a655e', '#1e1c1b', '#7a746a'];
  speckleWrap(ctx, w, h, rng, v === 1 ? 5200 : 9500, grit, 1, 2.2, v === 1 ? 0.28 : 0.5);
  if (H) auxSpeckle(H, aux!.rng, 0, 0, w, h, 6000, [104, 118, 140, 152], 1, 2, 0.4);

  // lap seams: sealant bead (dark), pale selvage edge, soft step shadow; end laps staggered per strip
  for (let s = 0; s < 2; s++) {
    const x = s * strip;
    ctx.save();
    alphaFill(ctx, v === 1 ? '#404346' : '#0e0d0c', 0.85);
    rectWrap(ctx, w, h, x - 2, 0, 4, h);
    alphaFill(ctx, v === 1 ? '#c3c7ca' : '#4a4743', 0.6);
    rectWrap(ctx, w, h, x + 2, 0, 1, h);
    alphaFill(ctx, '#000000', 0.22);
    rectWrap(ctx, w, h, x + 3, 0, 3, h);
    ctx.restore();
    if (H) {
      H.fillStyle = gray(176);
      rectWrap(H, w, h, x - 2, 0, 4, h);
      H.fillStyle = gray(144);
      rectWrap(H, w, h, x + 2, 0, 3, h);
    }
    const ey = Math.round(h * (s === 0 ? 0.33 : 0.78));
    ctx.save();
    alphaFill(ctx, v === 1 ? '#404346' : '#0e0d0c', 0.7);
    ctx.fillRect(x, ey, strip, 3);
    alphaFill(ctx, v === 1 ? '#c3c7ca' : '#4a4743', 0.5);
    ctx.fillRect(x, ey + 3, strip, 1);
    ctx.restore();
    if (H) {
      H.fillStyle = gray(160);
      H.fillRect(x, ey, strip, 4);
    }
  }

  if (v === 0) {
    // aluminium-paint patches over old repairs: brushed silver, ragged edge, streaky strokes
    for (let i = 0; i < 6; i++) {
      const pw = rng.range(50, 150);
      const ph = rng.range(30, 90);
      const px = rng.range(8, w - pw - 8);
      const py = rng.range(8, h - ph - 8);
      ctx.save();
      ctx.globalAlpha = rng.range(0.7, 0.9);
      ctx.fillStyle = rgb(150 + rng.range(-8, 8), 154 + rng.range(-8, 8), 157 + rng.range(-8, 8));
      ragged(ctx, rng, px, py, pw, ph, 8);
      ctx.restore();
      for (let k = 0; k < 26; k++) {
        ctx.save();
        alphaFill(ctx, k % 2 ? '#d4d8da' : '#707579', rng.range(0.12, 0.3));
        ctx.fillRect(px + rng.range(4, pw - 30), py + rng.range(4, ph - 4), rng.range(14, 60), rng.range(1, 2.4));
        ctx.restore();
      }
      if (H) {
        H.fillStyle = gray(140);
        H.fillRect(px + 4, py + 4, pw - 8, ph - 8);
      }
    }
    // pitted dirt in the low spots
    for (let i = 0; i < 4; i++) {
      ctx.save();
      alphaFill(ctx, 'rgb(98,88,72)', 0.07);
      discWrap(ctx, w, h, rng.range(60, w - 60), rng.range(60, h - 60), rng.range(18, 44));
      ctx.restore();
    }
  } else if (v === 1) {
    // brush streaks of aluminium coat
    for (let i = 0; i < 160; i++) {
      ctx.save();
      alphaFill(ctx, i % 2 ? '#d6dadc' : '#5d6165', rng.range(0.05, 0.14));
      rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), Math.floor(rng.range(0, h)), rng.range(40, 200), rng.range(1, 3));
      ctx.restore();
    }
    // coating peeled back to black asphalt
    for (let i = 0; i < 4; i++) {
      const pw = rng.range(25, 70);
      const ph = rng.range(20, 50);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = rgb(30, 29, 28);
      ragged(ctx, rng, rng.range(10, w - pw - 10), rng.range(10, h - ph - 10), pw, ph, 7);
      ctx.restore();
    }
    // rain-run dirt streaks down the roof slope
    for (let i = 0; i < 18; i++) {
      ctx.save();
      alphaFill(ctx, '#2c2a26', rng.range(0.04, 0.1));
      rectWrap(ctx, w, h, Math.floor(rng.range(0, w)), Math.floor(rng.range(0, h)), rng.range(3, 12), rng.range(40, 160));
      ctx.restore();
    }
  } else {
    // blisters: raised domes, lit top-left
    for (let i = 0; i < 38; i++) {
      const bx = rng.range(6, w - 6);
      const by = rng.range(6, h - 6);
      const br = rng.range(3, 9);
      ctx.save();
      alphaFill(ctx, '#0e0d0c', 0.45);
      discWrap(ctx, w, h, bx + 1.2, by + 1.2, br);
      alphaFill(ctx, rgb(70, 67, 62), 0.85);
      discWrap(ctx, w, h, bx, by, br);
      alphaFill(ctx, '#8a847a', 0.35);
      discWrap(ctx, w, h, bx - br * 0.3, by - br * 0.3, br * 0.4);
      ctx.restore();
      if (H) {
        H.fillStyle = gray(166);
        discWrap(H, w, h, bx, by, br);
      }
    }
    // alligator cracks
    for (let i = 0; i < 26; i++) {
      let x = rng.range(24, w - 24);
      let y = rng.range(24, h - 24);
      let a = rng.range(0, TAU);
      ctx.save();
      ctx.strokeStyle = 'rgba(14,13,12,0.75)';
      ctx.lineWidth = rng.range(1, 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        a += rng.range(-0.9, 0.9);
        x += Math.cos(a) * rng.range(5, 12);
        y += Math.sin(a) * rng.range(5, 12);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    // ponding: concentric dirt rings with a dark tar rim, and wet-grey silt inside
    for (let i = 0; i < 3; i++) {
      const R = rng.range(44, 84);
      const cx = rng.range(R + 6, w - R - 6);
      const cy = rng.range(R + 6, h - R - 6);
      ctx.save();
      for (let k = 0; k < 5; k++) {
        alphaFill(ctx, 'rgb(128,114,92)', 0.09);
        ctx.beginPath();
        ctx.arc(cx + rng.range(-3, 3), cy + rng.range(-3, 3), R * (1 - k * 0.15), 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(14,13,12,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
      ctx.restore();
      speckleWrap(ctx, w, h, rng, 120, ['#8a7a60', '#3b362e', '#a89a80'], 1, 2.4, 0.5, cy - R * 0.7, cy + R * 0.7);
      if (H) {
        H.fillStyle = gray(118);
        H.beginPath();
        H.arc(cx, cy, R, 0, TAU);
        H.fill();
      }
    }
  }
};

// ---------------------------------------------------------------------------------------------- graffiti decals

export const GRAFFITI_VARIANTS = 6;

/** Spray palette: magenta, cyan, yellow, blue, lime, red (plus black / white outlines). */
export const GRAFFITI_COLORS: readonly string[] = ['#e0289a', '#18c4d8', '#f2c21b', '#2f6df0', '#8fe03a', '#e8523a'];

/**
 * Abstract glyph strokes (unit box). Deliberately NOT an alphabet: they are loops, bolts and waves so the pieces read
 * as lettering-like writing without spelling anything (no real names or crews).
 */
const GLYPHS: readonly (readonly [number, number][])[] = [
  [[0.1, 0.8], [0.15, 0.2], [0.6, 0.1], [0.85, 0.4], [0.55, 0.75], [0.3, 0.5], [0.5, 0.35]],
  [[0.2, 0.1], [0.7, 0.15], [0.35, 0.5], [0.8, 0.55], [0.3, 0.95]],
  [[0.05, 0.9], [0.15, 0.15], [0.4, 0.6], [0.55, 0.1], [0.7, 0.6], [0.95, 0.12], [0.95, 0.9]],
  [[0.2, 0.1], [0.2, 0.7], [0.45, 0.95], [0.8, 0.8], [0.85, 0.4]],
  [[0.05, 0.5], [0.25, 0.15], [0.45, 0.85], [0.65, 0.15], [0.85, 0.8], [0.95, 0.5]],
  [[0.5, 0.5], [0.65, 0.4], [0.7, 0.6], [0.45, 0.8], [0.2, 0.55], [0.3, 0.2], [0.7, 0.12], [0.9, 0.45]],
  [[0.1, 0.5], [0.8, 0.5], [0.55, 0.2], [0.8, 0.5], [0.55, 0.8]],
];

/** Smooth stroke through points (quadratic curves through the midpoints). */
function stroke(
  ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], width: number, color: string, alpha = 1, dx = 0, dy = 0,
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0] + dx, pts[i][1] + dy, mx + dx, my + dy);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0] + dx, last[1] + dy);
  ctx.stroke();
  ctx.restore();
}

function glyphPts(rng: Rng, g: number, x: number, y: number, gw: number, gh: number): [number, number][] {
  return GLYPHS[g % GLYPHS.length].map(([u, v]) => [x + (u + rng.range(-0.05, 0.05)) * gw, y + (v + rng.range(-0.05, 0.05)) * gh] as [number, number]);
}

function drip(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x - 1.1, y, 2.2, len);
  ctx.beginPath();
  ctx.arc(x, y + len, 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Overspray halo along a polyline: tiny low-alpha dots. */
function overspray(ctx: CanvasRenderingContext2D, rng: Rng, pts: readonly (readonly [number, number])[], color: string, count: number, spread: number): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const p = pts[Math.floor(rng.next() * pts.length)];
    ctx.globalAlpha = rng.range(0.15, 0.4);
    const s = rng.range(1, 2.2);
    ctx.fillRect(p[0] + rng.range(-spread, spread), p[1] + rng.range(-spread, spread), s, s);
  }
  ctx.restore();
}

/**
 * 512x256 alpha decal for walls, gates and shutters (transparent where there is no paint; margins >= 16 px so nothing
 * is clipped). Six pieces in a 6-colour spray palette, no readable text. Variants: 0 marker tag with underline swoosh,
 * 1 bubble throw-up (outline, fill, highlight, drips), 2 block piece with drop shadow and two-colour fill, 3 sticker
 * cluster, 4 big drippy paint tag, 5 grey-brown roller "buff" patch painted over old graffiti (mostly opaque, with ghosts
 * of the old colours at the edges). Alpha coverage is 2-60 % (the buff patch is the largest).
 */
export const graffitiPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = wrapVariant(variant, GRAFFITI_VARIANTS);
  const ca = GRAFFITI_COLORS[rng.int(0, GRAFFITI_COLORS.length - 1)];
  let cb = GRAFFITI_COLORS[rng.int(0, GRAFFITI_COLORS.length - 1)];
  if (cb === ca) cb = GRAFFITI_COLORS[(GRAFFITI_COLORS.indexOf(ca) + 3) % GRAFFITI_COLORS.length];
  const dark = '#101012';

  if (v === 0) {
    // marker tag: fast scrawl of three glyphs joined, shadow offset, swoosh underline, star
    const all: [number, number][] = [];
    for (let i = 0; i < 3; i++) all.push(...glyphPts(rng, rng.int(0, 6), 40 + i * 120, 40 + rng.range(-8, 8), 130, 120));
    stroke(ctx, all, 9, dark, 0.85, 2.5, 2.5);
    stroke(ctx, all, 7, ca, 1);
    stroke(ctx, all, 1.6, '#ffffff', 0.45, -1, -1);
    const sw: [number, number][] = [[50, 190], [170, 205], [300, 188], [440, 200]];
    stroke(ctx, sw, 5, dark, 0.8, 2, 2);
    stroke(ctx, sw, 4, ca, 1);
    ctx.fillStyle = ca;
    for (const [sx, sy] of [[460, 60], [478, 74], [452, 82]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, TAU);
      ctx.fill();
    }
  } else if (v === 1) {
    // throw-up: three fat bubble glyphs
    for (let i = 0; i < 3; i++) {
      const pts = glyphPts(rng, rng.int(0, 6), 24 + i * 156, 40 + rng.range(-10, 10), 150, 150);
      stroke(ctx, pts, 34, dark, 1);
      stroke(ctx, pts, 24, i === 1 ? cb : ca, 1);
      stroke(ctx, pts, 4, '#ffffff', 0.65, -4, -4);
      overspray(ctx, rng, pts, i === 1 ? cb : ca, 90, 24);
      for (let k = 0; k < 2; k++) {
        const p = pts[Math.floor(rng.range(1, pts.length))];
        drip(ctx, p[0] + rng.range(-6, 6), p[1] + 12, rng.range(14, 50), i === 1 ? cb : ca);
      }
    }
  } else if (v === 2) {
    // block piece: heavy drop shadow, dark outline, two-colour stripe
    for (let i = 0; i < 4; i++) {
      const pts = glyphPts(rng, rng.int(0, 6), 22 + i * 118, 34 + (i % 2) * 14 + rng.range(-6, 6), 112, 150);
      stroke(ctx, pts, 36, '#000000', 0.5, 7, 7);
      stroke(ctx, pts, 32, dark, 1);
      stroke(ctx, pts, 22, ca, 1);
      stroke(ctx, pts, 8, cb, 1, -2, -2);
      stroke(ctx, pts, 2.4, '#ffffff', 0.55, -5, -5);
    }
  } else if (v === 3) {
    // slap stickers and a tiny tag
    for (let i = 0; i < 9; i++) {
      const sw = rng.range(40, 92);
      const sh = rng.range(28, 62);
      const x = 18 + (i % 3) * 164 + rng.range(0, 40);
      const y = 18 + Math.floor(i / 3) * 78 + rng.range(0, 10);
      const c1 = GRAFFITI_COLORS[rng.int(0, 5)];
      const c2 = GRAFFITI_COLORS[rng.int(0, 5)];
      ctx.fillStyle = '#f2f2ee';
      poly(ctx, [x, y + rng.range(0, 3), x + sw, y + rng.range(0, 3), x + sw - rng.range(0, 3), y + sh, x + rng.range(0, 3), y + sh - rng.range(0, 2)]);
      ctx.fillStyle = c1;
      ctx.fillRect(x + 3, y + 3, sw - 6, sh - 6);
      ctx.fillStyle = c2;
      const style = rng.int(0, 2);
      if (style === 0) {
        for (let k = 0; k < sw - 8; k += 12) poly(ctx, [x + 4 + k, y + sh - 4, x + 10 + k, y + sh - 4, x + 16 + k, y + 4, x + 10 + k, y + 4]);
      } else if (style === 1) {
        ctx.beginPath();
        ctx.arc(x + sw / 2, y + sh / 2, Math.min(sw, sh) * 0.28, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillRect(x + 6, y + sh / 2 - 3, sw - 12, 6);
      }
    }
    stroke(ctx, glyphPts(rng, rng.int(0, 6), 380, 160, 100, 70), 5, dark, 0.9);
  } else if (v === 4) {
    // big drippy paint tag: single colour, wide stroke, many runs
    const all: [number, number][] = [];
    for (let i = 0; i < 3; i++) all.push(...glyphPts(rng, rng.int(0, 6), 28 + i * 150, 28 + rng.range(-6, 6), 160, 120));
    stroke(ctx, all, 20, dark, 0.55, 3, 3);
    stroke(ctx, all, 15, cb, 1);
    stroke(ctx, all, 3, '#ffffff', 0.5, -3, -3);
    overspray(ctx, rng, all, cb, 140, 20);
    for (let i = 0; i < 12; i++) {
      const p = all[Math.floor(rng.next() * all.length)];
      drip(ctx, p[0] + rng.range(-6, 6), p[1] + 8, rng.range(18, 100), cb);
    }
  } else {
    // buff patch: off-tone roller paint, vertical roller lanes, ghosts of old colours poking out at the edges
    const tones = [[122, 114, 102], [86, 92, 88], [140, 128, 112]];
    const t = tones[rng.int(0, 2)];
    for (let i = 0; i < 8; i++) {
      const gx = i < 4 ? rng.range(20, 70) : rng.range(430, 490);
      stroke(ctx, glyphPts(rng, rng.int(0, 6), gx - 30, rng.range(30, 150), 80, 70), 9, GRAFFITI_COLORS[rng.int(0, 5)], 0.7);
    }
    ctx.fillStyle = rgb(t[0], t[1], t[2]);
    ragged(ctx, rng, 58, 24, 396, 200, 12);
    const lane = 14;
    for (let x = 62; x < 450; x += lane) {
      ctx.save();
      alphaFill(ctx, rng.chance(0.5) ? '#ffffff' : '#000000', rng.range(0.03, 0.09));
      ctx.fillRect(x, 28, lane - 1, 192);
      ctx.restore();
    }
    for (let i = 0; i < 60; i++) {
      ctx.save();
      alphaFill(ctx, '#000000', rng.range(0.04, 0.12));
      ctx.fillRect(rng.range(62, 440), rng.range(28, 218), rng.range(6, 40), 1.4);
      ctx.restore();
    }
  }
};
