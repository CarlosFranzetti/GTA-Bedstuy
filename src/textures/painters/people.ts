import type * as THREE from 'three';
import type { Painter } from '../canvas';
import { auxSpeckle, gray, hsl, speckle, withAlpha } from './util';

/**
 * Fabric painters for people. All 256 px, tileable-ish, drawn with fillRect / lines / arcs only.
 * UV conventions (default BoxGeometry UVs, canvas row 0 = v 1):
 *  - clothHoodie: uniform fleece.
 *  - clothDenim: v runs top -> bottom of a leg box; the faded knee band sits around v ~ 0.5 (canvas rows 38-60 %).
 *  - clothVarsity: top half of the canvas (v 0.5..1) is the wool body, bottom half (v 0..0.5) is the leather sleeve.
 *    Use varsityUV() to squeeze a geometry into one half.
 *  - clothSneaker: top 72 % (v 0.28..1) is the white leather upper, bottom 28 % (v 0..0.28) the rubber sole.
 */

// ---------------------------------------------------------------- hoodie (heathered fleece)

/** [hue, saturation %, lightness %] */
export const HOODIE_BASES: readonly (readonly [number, number, number])[] = [
  [215, 5, 56],   // heather grey
  [220, 6, 28],   // charcoal
  [222, 38, 22],  // navy
  [350, 36, 27],  // maroon
  [150, 28, 22],  // forest
  [240, 6, 10],   // black
  [38, 24, 66],   // oatmeal
  [28, 62, 44],   // rust
];
export const HOODIE_VARIANTS = HOODIE_BASES.length;

export const hoodiePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const [hue, sat, lig] = HOODIE_BASES[((variant % HOODIE_VARIANTS) + HOODIE_VARIANTS) % HOODIE_VARIANTS];
  ctx.fillStyle = hsl(hue, sat, lig);
  ctx.fillRect(0, 0, w, h);
  if (aux) { aux.height.fillStyle = gray(128); aux.height.fillRect(0, 0, w, h); }
  // heathering: two-tone fibre flecks
  const light = hsl(hue, sat * 0.8, lig + 14);
  const dark = hsl(hue, sat * 1.1, lig - 10);
  speckle(ctx, w, h, rng, 2600, [light, dark], 1, 2.5, 0.5);
  speckle(ctx, w, h, rng, 700, [hsl(hue, sat * 0.4, Math.min(92, lig + 28))], 1, 1.6, 0.35);
  // soft brushed knit columns
  for (let x = 0; x < w; x += 5) {
    withAlpha(ctx, 0.07, () => {
      ctx.fillStyle = (x / 5) % 2 === 0 ? '#000000' : '#ffffff';
      ctx.fillRect(x, 0, 2, h);
    });
    if (aux) { aux.height.fillStyle = gray((x / 5) % 2 === 0 ? 120 : 138); aux.height.fillRect(x, 0, 2, h); }
  }
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, 1400, [112, 122, 134, 144], 1, 2, 0.6);
};

// ---------------------------------------------------------------- denim

/** [hue, saturation %, lightness %] of the indigo wash. */
export const DENIM_BASES: readonly (readonly [number, number, number])[] = [
  [216, 46, 24],  // raw indigo
  [214, 40, 33],  // dark wash
  [211, 38, 44],  // classic mid wash
  [207, 34, 56],  // light wash
  [220, 8, 14],   // black
  [214, 12, 38],  // grey wash
];
export const DENIM_VARIANTS = DENIM_BASES.length;
/** Canvas-row band (fractions of height) where the knees fade. */
export const DENIM_KNEE_BAND: readonly [number, number] = [0.38, 0.6];

export const denimPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const [hue, sat, lig] = DENIM_BASES[((variant % DENIM_VARIANTS) + DENIM_VARIANTS) % DENIM_VARIANTS];
  ctx.fillStyle = hsl(hue, sat, lig);
  ctx.fillRect(0, 0, w, h);
  if (aux) { aux.height.fillStyle = gray(128); aux.height.fillRect(0, 0, w, h); }
  // warp threads (vertical, indigo) and white weft flecks
  for (let x = 0; x < w; x += 2) {
    withAlpha(ctx, rng.range(0.04, 0.12), () => {
      ctx.fillStyle = rng.chance(0.5) ? hsl(hue, sat, lig - 8) : hsl(hue, sat * 0.6, lig + 8);
      ctx.fillRect(x, 0, 1, h);
    });
  }
  speckle(ctx, w, h, rng, 900, [hsl(hue, sat * 0.3, Math.min(90, lig + 26))], 1, 1.5, 0.3);
  // diagonal twill ribs
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hsl(hue, sat, lig + 6);
  ctx.globalAlpha = 0.16;
  for (let d = -h; d < w; d += 4) {
    ctx.beginPath();
    ctx.moveTo(d, h);
    ctx.lineTo(d + h, 0);
    ctx.stroke();
  }
  ctx.restore();
  if (aux) {
    aux.height.save();
    aux.height.lineWidth = 1;
    aux.height.strokeStyle = gray(146);
    aux.height.globalAlpha = 0.6;
    for (let d = -h; d < w; d += 4) {
      aux.height.beginPath();
      aux.height.moveTo(d, h);
      aux.height.lineTo(d + h, 0);
      aux.height.stroke();
    }
    aux.height.restore();
  }
  // faded knee band: stepped soft edges, lighter and slightly desaturated
  const [b0, b1] = DENIM_KNEE_BAND;
  const steps = 7;
  const y0 = h * b0;
  const bh = h * (b1 - b0);
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const a = 0.34 * Math.sin(Math.PI * t * 0.5);
    // widest strip first, narrowing toward the centre so the middle is the most worn
    const inset = (bh / 2) * (1 - t) * 0.95;
    withAlpha(ctx, a / 2, () => {
      ctx.fillStyle = hsl(hue, sat * 0.5, Math.min(86, lig + 24));
      ctx.fillRect(0, y0 + inset, w, bh - inset * 2);
    });
  }
  // whiskers / creases behind the knee
  for (let i = 0; i < 9; i++) {
    const x = rng.range(w * 0.1, w * 0.9);
    const y = rng.range(y0 + bh * 0.15, y0 + bh * 0.85);
    const len = rng.range(10, 26);
    withAlpha(ctx, rng.range(0.1, 0.2), () => {
      ctx.fillStyle = hsl(hue, sat * 0.4, Math.min(90, lig + 30));
      ctx.fillRect(x, y, len, 1);
    });
    if (aux) { aux.height.fillStyle = gray(112); aux.height.fillRect(x, y + 1, len, 1); }
  }
  // outer seams with a double stitch line
  for (const x of [3, w - 5]) {
    ctx.fillStyle = hsl(hue, sat, lig - 12);
    ctx.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = '#b98a2d';
      ctx.fillRect(x + (x < w / 2 ? 3 : -2), y, 1, 5);
    }
    if (aux) { aux.height.fillStyle = gray(150); aux.height.fillRect(x, 0, 2, h); }
  }
  // fade near the hem (bottom)
  withAlpha(ctx, 0.12, () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, h * 0.94, w, h * 0.06); });
};

// ---------------------------------------------------------------- varsity jacket

/** Wool body colour and leather sleeve colour (plus rib trim) per variant. */
export const VARSITY_SCHEMES: readonly { wool: string; leather: string; trim: string }[] = [
  { wool: '#1d2b4f', leather: '#e9e2cf', trim: '#b8232f' },
  { wool: '#15161a', leather: '#f0f0ec', trim: '#d6a21f' },
  { wool: '#6b1f2c', leather: '#e7dcc2', trim: '#1d1d1d' },
  { wool: '#1f4a35', leather: '#efefe6', trim: '#d9c14a' },
  { wool: '#1a4f9c', leather: '#f2f2f0', trim: '#e8591c' },
  { wool: '#4b4e55', leather: '#17181c', trim: '#c9ced6' },
];
export const VARSITY_VARIANTS = VARSITY_SCHEMES.length;

/** Which half of the clothVarsity texture a mesh uses. */
export type VarsityPart = 'body' | 'sleeve';

/**
 * Remaps a geometry's UV v into the varsity texture half for `part` (body = v 0.5..1, sleeve = v 0..0.5), in place.
 * Only touches the `uv` attribute.
 */
export function varsityUV(geo: THREE.BufferGeometry, part: VarsityPart): THREE.BufferGeometry {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    const v = Math.min(1, Math.max(0, uv.getY(i)));
    uv.setY(i, part === 'body' ? 0.5 + v * 0.5 : v * 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

export const varsityPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const sc = VARSITY_SCHEMES[((variant % VARSITY_VARIANTS) + VARSITY_VARIANTS) % VARSITY_VARIANTS];
  const half = h / 2;
  if (aux) { aux.height.fillStyle = gray(128); aux.height.fillRect(0, 0, w, h); }
  // wool body (upper half = v 0.5..1)
  ctx.fillStyle = sc.wool;
  ctx.fillRect(0, 0, w, half);
  speckle(ctx, w, half, rng, 1800, ['#ffffff', '#000000'], 1, 2, 0.1);
  for (let y = 0; y < half; y += 3) {
    withAlpha(ctx, 0.06, () => { ctx.fillStyle = '#000000'; ctx.fillRect(0, y, w, 1); });
  }
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, half, 1200, [118, 126, 134, 142], 1, 2, 0.6);
  // rib-knit trim along the top and bottom of the body
  for (const y of [0, half - 12]) {
    ctx.fillStyle = sc.trim;
    ctx.fillRect(0, y, w, 12);
    for (let x = 0; x < w; x += 4) {
      withAlpha(ctx, 0.28, () => { ctx.fillStyle = '#000000'; ctx.fillRect(x, y, 1.5, 12); });
      if (aux) { aux.height.fillStyle = gray(x % 8 === 0 ? 112 : 140); aux.height.fillRect(x, y, 2, 12); }
    }
  }
  // leather sleeve (lower half = v 0..0.5)
  ctx.fillStyle = sc.leather;
  ctx.fillRect(0, half, w, half);
  // pebbled grain
  withAlpha(ctx, 0.18, () => {
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = rng.chance(0.5) ? '#000000' : '#ffffff';
      const x = rng.range(0, w);
      const y = half + rng.range(0, half);
      ctx.beginPath();
      ctx.arc(x, y, rng.range(0.7, 1.4), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  if (aux) auxSpeckle(aux.height, aux.rng, 0, half, w, half, 900, [110, 120, 138, 148], 1, 2, 0.7);
  // gloss band down the arm
  withAlpha(ctx, 0.12, () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.3, half, w * 0.12, half); });
  // sleeve cuff rib at the bottom
  ctx.fillStyle = sc.trim;
  ctx.fillRect(0, h - 14, w, 14);
  for (let x = 0; x < w; x += 4) {
    withAlpha(ctx, 0.28, () => { ctx.fillStyle = '#000000'; ctx.fillRect(x, h - 14, 1.5, 14); });
  }
  // seam where wool meets leather
  ctx.fillStyle = '#000000';
  withAlpha(ctx, 0.5, () => ctx.fillRect(0, half - 1, w, 2));
  if (aux) { aux.height.fillStyle = gray(96); aux.height.fillRect(0, half - 1, w, 2); }
};

// ---------------------------------------------------------------- sneakers

/** Upper / accent / sole colours per variant. */
export const SNEAKER_SCHEMES: readonly { upper: string; accent: string; sole: string }[] = [
  { upper: '#f1f0ec', accent: '#f1f0ec', sole: '#e8e6df' },
  { upper: '#f1f0ec', accent: '#c4262e', sole: '#e8e6df' },
  { upper: '#f1f0ec', accent: '#1b1b1d', sole: '#d9d6cb' },
  { upper: '#e6dcc4', accent: '#7b5a35', sole: '#b98e57' },
  { upper: '#1c1c1f', accent: '#f1f0ec', sole: '#f1f0ec' },
  { upper: '#a9adb3', accent: '#f1f0ec', sole: '#ecebe6' },
];
export const SNEAKER_VARIANTS = SNEAKER_SCHEMES.length;
/** Fraction of the canvas height (from the bottom) that is rubber sole. */
export const SNEAKER_SOLE = 0.28;

export const sneakerPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const sc = SNEAKER_SCHEMES[((variant % SNEAKER_VARIANTS) + SNEAKER_VARIANTS) % SNEAKER_VARIANTS];
  const soleY = h * (1 - SNEAKER_SOLE);
  if (aux) { aux.height.fillStyle = gray(128); aux.height.fillRect(0, 0, w, h); }
  // leather upper
  ctx.fillStyle = sc.upper;
  ctx.fillRect(0, 0, w, soleY);
  withAlpha(ctx, 0.08, () => {
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rng.chance(0.5) ? '#000000' : '#ffffff';
      ctx.beginPath();
      ctx.arc(rng.range(0, w), rng.range(0, soleY), rng.range(0.8, 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, soleY, 500, [118, 126, 136, 142], 1, 2, 0.5);
  // toe-box perforations
  ctx.fillStyle = '#00000040';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const x = w * 0.58 + c * 6 + (r % 2) * 3;
      const y = h * 0.1 + r * 6;
      ctx.fillRect(x, y, 2, 2);
      if (aux) { aux.height.fillStyle = gray(96); aux.height.fillRect(x, y, 2, 2); }
    }
  }
  // overlay panel + side stripe in the accent colour
  ctx.fillStyle = sc.accent;
  ctx.fillRect(w * 0.2, h * 0.28, w * 0.5, 10);
  ctx.fillRect(0, soleY - 14, w, 6);
  if (aux) { aux.height.fillStyle = gray(144); aux.height.fillRect(w * 0.2, h * 0.28, w * 0.5, 10); }
  // laces: zig-zag cross bars up the middle
  for (let i = 0; i < 5; i++) {
    const y = h * 0.1 + i * 12;
    ctx.fillStyle = sc.upper === '#1c1c1f' ? '#d9d9d9' : '#ffffff';
    ctx.fillRect(w * 0.2, y, w * 0.28, 3);
    withAlpha(ctx, 0.3, () => { ctx.fillStyle = '#000000'; ctx.fillRect(w * 0.2, y + 3, w * 0.28, 1); });
    if (aux) { aux.height.fillStyle = gray(152); aux.height.fillRect(w * 0.2, y, w * 0.28, 3); }
  }
  // stitching along the panel
  ctx.fillStyle = '#00000050';
  for (let x = w * 0.2; x < w * 0.7; x += 6) ctx.fillRect(x, h * 0.28 + 12, 3, 1);
  // rubber sole with a darker tread-groove ladder
  ctx.fillStyle = sc.sole;
  ctx.fillRect(0, soleY, w, h - soleY);
  for (let x = 0; x < w; x += 10) {
    ctx.fillStyle = '#00000030';
    ctx.fillRect(x, soleY + 12, 4, h - soleY - 12);
    if (aux) { aux.height.fillStyle = gray(104); aux.height.fillRect(x, soleY + 12, 4, h - soleY - 12); }
  }
  ctx.fillStyle = '#00000040';
  ctx.fillRect(0, soleY, w, 2);
  // scuffs
  speckle(ctx, w, h, rng, 120, ['#8a8579', '#6d675c'], 1, 3, 0.2);
};
