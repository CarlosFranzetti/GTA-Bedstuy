import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { heightToNormal } from '../normalmap';
import { auxSpeckle, fitFont, gray, speckle, withAlpha } from './util';

/**
 * Vehicle painters: car-paint detail maps (flake normal, roughness, dirt/colour modulation), tyre sidewall + tread,
 * licence plate. Only basic 2D calls (fillRect, arc, moveTo/lineTo, fillText...) so the test fake canvas works.
 */

type CanvasMaker = (w: number, h: number) => HTMLCanvasElement;

// ---------------------------------------------------------------- car paint detail

/** Edge length of the shared car paint detail tile. */
export const CAR_PAINT_SIZE = 512;
/** Fraction of the tile (from the bottom, v = 0 upward) that collects road dirt. */
export const CAR_DIRT_BAND = 0.25;
/** Suggested material.normalScale for the flake normal map. */
export const CAR_FLAKE_NORMAL_SCALE = 0.3;

const DIRT_STEPS = 16;
const DIRT_COLOR = '#6a5a46';
const DIRT_MAX_ALPHA = 0.42;

interface Scratch { x: number; y: number; angle: number; len: number; }

/** A handful of fine scratches, mostly in the lower two thirds. Consumes a fixed number of rng draws. */
function makeScratches(rng: Rng, w: number, h: number): Scratch[] {
  const out: Scratch[] = [];
  for (let i = 0; i < 7; i++) {
    out.push({
      x: rng.range(0, w),
      y: rng.range(h * 0.3, h),
      angle: rng.range(-0.35, 0.35) + (rng.chance(0.3) ? Math.PI / 2 : 0),
      len: rng.range(w * 0.06, w * 0.22),
    });
  }
  return out;
}

/** Draws one scratch as a thin polyline with a slight kink in the middle. */
function strokeScratch(ctx: CanvasRenderingContext2D, s: Scratch, color: string, width: number, alpha: number): void {
  const mx = s.x + Math.cos(s.angle) * s.len * 0.5;
  const my = s.y + Math.sin(s.angle) * s.len * 0.5 + 1.5;
  const ex = s.x + Math.cos(s.angle) * s.len;
  const ey = s.y + Math.sin(s.angle) * s.len;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(mx, my);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();
}

/** Dirt accumulation step table: [y, height, alpha] per strip, densest at the bottom edge. */
function dirtStrips(h: number): [number, number, number][] {
  const y0 = h * (1 - CAR_DIRT_BAND);
  const sh = (h - y0) / DIRT_STEPS;
  const out: [number, number, number][] = [];
  for (let i = 0; i < DIRT_STEPS; i++) {
    const t = (i + 1) / DIRT_STEPS;
    out.push([y0 + i * sh, sh + 0.5, t * t]);
  }
  return out;
}

/**
 * Dirt / colour-modulation map, multiplied into the paint colour (so it is white where the paint is clean):
 * a brownish band over the lower 25 % that darkens the paint slightly, splashes, thin road-spray streaks and
 * scratches that show the lighter primer. Scratches are placed with `scratches`.
 */
function paintDirt(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, scratches: readonly Scratch[]): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // faint overall film of dust on the whole panel
  speckle(ctx, w, h, rng, 300, ['#e9e4da', '#f3efe6'], 1, 3, 0.35);
  for (const [y, sh, a] of dirtStrips(h)) {
    withAlpha(ctx, DIRT_MAX_ALPHA * a, () => {
      ctx.fillStyle = DIRT_COLOR;
      ctx.fillRect(0, y, w, sh);
    });
  }
  const y0 = h * (1 - CAR_DIRT_BAND);
  // splashes thrown up by the wheels
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, w);
    const y = rng.range(y0, h);
    const r = rng.range(1.5, 7);
    const depth = (y - y0) / (h - y0);
    withAlpha(ctx, rng.range(0.04, 0.14) * (0.4 + depth), () => {
      ctx.fillStyle = rng.chance(0.6) ? '#4e4132' : '#7a6a54';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // thin spray streaks rising from the bottom edge
  for (let i = 0; i < 22; i++) {
    const x = rng.range(0, w);
    const len = rng.range(h * 0.04, h * 0.2);
    withAlpha(ctx, rng.range(0.05, 0.12), () => {
      ctx.fillStyle = DIRT_COLOR;
      ctx.fillRect(x, h - len, rng.range(1, 3), len);
    });
  }
  for (const s of scratches) strokeScratch(ctx, s, '#cfc9bd', 1, 0.55);
}

/** Painter form of the dirt map (white base, so the library's `map` multiplies it into the colour). */
export const carPaintDirtPainter: Painter = (ctx, w, h, rng) => {
  paintDirt(ctx, w, h, rng, makeScratches(rng, w, h));
};

/**
 * Roughness map (green channel; absolute values, use with material.roughness = 1): glossy base around 0.35, tiny
 * metallic flake sparkles that are smoother/rougher, dirt raising roughness toward the bottom, scratches rougher.
 */
function paintRoughness(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, scratches: readonly Scratch[]): void {
  ctx.fillStyle = gray(90);
  ctx.fillRect(0, 0, w, h);
  const levels = [62, 72, 80, 104, 116, 128];
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = gray(levels[Math.floor(rng.next() * levels.length)]);
    const s = rng.chance(0.8) ? 1 : 2;
    ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
  }
  for (const [y, sh, a] of dirtStrips(h)) {
    withAlpha(ctx, a * 0.85, () => {
      ctx.fillStyle = gray(205);
      ctx.fillRect(0, y, w, sh);
    });
  }
  for (const s of scratches) strokeScratch(ctx, s, gray(215), 1, 0.9);
}

export const carPaintRoughnessPainter: Painter = (ctx, w, h, rng) => {
  paintRoughness(ctx, w, h, rng, makeScratches(rng, w, h));
};

/**
 * Metallic flake height field (row 0 = top). 2 px flake cells at random heights, a sparse set of tall flakes and
 * the scratches carved in as grooves. Plain numbers, no canvas needed.
 */
export function carPaintHeightField(rng: Rng, size: number, scratches: readonly Scratch[]): Float32Array {
  const hf = new Float32Array(size * size);
  const cells = size >> 1;
  const cell = new Float32Array(cells * cells);
  for (let i = 0; i < cell.length; i++) cell[i] = 0.5 + (rng.next() - 0.5) * 0.45 + (rng.next() < 0.04 ? 0.35 : 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) hf[y * size + x] = cell[(y >> 1) * cells + (x >> 1)];
  }
  for (const s of scratches) {
    const steps = Math.ceil(s.len);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const kink = t < 0.5 ? t * 3 : (1 - t) * 3;
      const x = Math.round(s.x + Math.cos(s.angle) * s.len * t);
      const y = Math.round(s.y + Math.sin(s.angle) * s.len * t + Math.min(1.5, kink));
      const xx = ((x % size) + size) % size;
      const yy = ((y % size) + size) % size;
      hf[yy * size + xx] = 0.05;
    }
  }
  return hf;
}

export interface CarPaintMaps {
  /** tangent-space flake + scratch normal map (DataTexture, no colour space) */
  normalMap: THREE.DataTexture;
  /** absolute roughness (green channel), canvas texture, no colour space */
  roughnessMap: THREE.CanvasTexture;
  /** white-based colour modulation (dirt band, scratches); canvas texture, sRGB. Assign to material.map. */
  dirtMap: THREE.CanvasTexture;
}

/**
 * Builds the shared car paint detail maps (one 512 px tile for every colour). The roughness and dirt maps are painted
 * onto canvases from `makeCanvas`; the normal map is computed from a numeric flake height field, so it exists even
 * when the canvas is a recording fake. Deterministic for a given `rng` state.
 */
export function carPaintMaps(makeCanvas: CanvasMaker, rng: Rng, anisotropy = 8): CarPaintMaps {
  const size = CAR_PAINT_SIZE;
  const scratches = makeScratches(rng, size, size);

  const paintTo = (fn: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
    const c = makeCanvas(size, size);
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('carPaintMaps: 2D context unavailable');
    fn(ctx);
    return c;
  };
  const dirtCanvas = paintTo((ctx) => paintDirt(ctx, size, size, new Rng(Math.floor(rng.next() * 0xffffffff) >>> 0), scratches));
  const roughCanvas = paintTo((ctx) => paintRoughness(ctx, size, size, new Rng(Math.floor(rng.next() * 0xffffffff) >>> 0), scratches));

  const dirtMap = new THREE.CanvasTexture(dirtCanvas);
  dirtMap.wrapS = THREE.RepeatWrapping;
  dirtMap.wrapT = THREE.RepeatWrapping;
  dirtMap.colorSpace = THREE.SRGBColorSpace;
  dirtMap.anisotropy = anisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = anisotropy;

  const hf = carPaintHeightField(new Rng(Math.floor(rng.next() * 0xffffffff) >>> 0), size, scratches);
  const n = heightToNormal(hf, size, size, 0.9);
  // canvas / field row 0 is the top (v = 1); DataTexture row 0 is v = 0, so flip rows
  const out = new Uint8Array(size * size * 4);
  const rowBytes = size * 4;
  for (let y = 0; y < size; y++) out.set(n.subarray(y * rowBytes, (y + 1) * rowBytes), (size - 1 - y) * rowBytes);
  const normalMap = new THREE.DataTexture(out, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.generateMipmaps = true;
  normalMap.anisotropy = anisotropy;
  normalMap.needsUpdate = true;

  return { normalMap, roughnessMap, dirtMap };
}

// ---------------------------------------------------------------- tyre sidewall + tread

/** Text raised on the sidewall ring. */
export const TIRE_TEXT = 'BEDSTUY RADIAL';

/**
 * 1024x256 tyre texture for the LatheGeometry tyre of carModel (u around the circumference, v along the profile from
 * the inner edge of the near sidewall over the tread at v = 0.5 to the far sidewall). Layout in canvas rows (0 = v 1):
 * 0-30 % far sidewall, 30-43 % shoulder, 43-57 % tread, then mirrored. "BEDSTUY RADIAL" is printed twice around
 * the ring on each sidewall in raised rubber lettering; the tread carries a staggered block pattern.
 */
export const tireSidewallPainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  const hc = aux?.height;
  const ar = aux?.rng;
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, w, h);
  if (hc) { hc.fillStyle = gray(128); hc.fillRect(0, 0, w, h); }

  // moulded concentric ribs on both sidewalls
  for (const side of [0, 1]) {
    const base = side === 0 ? 0 : h * 0.7;
    for (let i = 0; i < 9; i++) {
      const y = base + h * 0.03 * i + (i % 3) * 0.5;
      withAlpha(ctx, 0.5, () => { ctx.fillStyle = i % 3 === 0 ? '#262626' : '#101010'; ctx.fillRect(0, y, w, 1.5); });
      if (hc) { hc.fillStyle = gray(i % 3 === 0 ? 150 : 112); hc.fillRect(0, y, w, 1.5); }
    }
  }

  // raised lettering: two copies around the ring on each sidewall
  const textH = h * 0.075;
  const copyW = w / 2 - 36;
  const px = fitFont(ctx, TIRE_TEXT, copyW, textH, 'bold', 'Arial, Helvetica, sans-serif', 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rows = [h * 0.17, h * 0.83];
  for (const y of rows) {
    for (let k = 0; k < 2; k++) {
      const cx = w * (0.25 + 0.5 * k);
      // shadow underneath then the lettering a bit lighter than the rubber
      ctx.fillStyle = '#050505';
      ctx.fillText(TIRE_TEXT, cx + 1, y + 1);
      ctx.fillStyle = '#4a4a4a';
      ctx.fillText(TIRE_TEXT, cx, y);
      if (hc) {
        hc.font = ctx.font;
        hc.textAlign = 'center';
        hc.textBaseline = 'middle';
        hc.fillStyle = gray(205);
        hc.fillText(TIRE_TEXT, cx, y);
      }
    }
  }
  // size code under the lettering
  ctx.font = `bold ${Math.max(7, Math.round(px * 0.7))}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = '#3c3c3c';
  ctx.fillText('215/55 R17', w * 0.5, h * 0.25);
  ctx.fillText('215/55 R17', w * 0.5, h * 0.75);

  // tread: staggered blocks with circumferential grooves
  const t0 = h * 0.43;
  const t1 = h * 0.57;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, t0, w, t1 - t0);
  if (hc) { hc.fillStyle = gray(150); hc.fillRect(0, t0, w, t1 - t0); }
  const cw = 14;
  for (let x = 0; x < w; x += cw) {
    for (let r = 0; r < 3; r++) {
      const y = t0 + 2 + r * ((t1 - t0 - 4) / 3);
      const off = (r % 2) * (cw / 2);
      const bh = (t1 - t0 - 4) / 3 - 3;
      ctx.fillStyle = r === 1 ? '#272727' : '#222222';
      ctx.fillRect(x + off + 1, y, cw - 3, bh);
      if (hc) { hc.fillStyle = gray(176); hc.fillRect(x + off + 1, y, cw - 3, bh); }
    }
  }
  // groove lines
  for (const g of [0.465, 0.535]) {
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, h * g, w, 2);
    if (hc) { hc.fillStyle = gray(70); hc.fillRect(0, h * g, w, 2); }
  }

  speckle(ctx, w, h, rng, 900, ['#000000', '#303030', '#3a3a3a'], 1, 2, 0.5);
  // faint road-grey dusting near the tread shoulders
  withAlpha(ctx, 0.12, () => {
    ctx.fillStyle = '#8a8070';
    ctx.fillRect(0, h * 0.4, w, h * 0.03);
    ctx.fillRect(0, h * 0.57, w, h * 0.03);
  });
  if (hc && ar) auxSpeckle(hc, ar, 0, 0, w, h, 700, [118, 124, 134, 140], 1, 2, 0.5);

  // hubcap band (carBodies/carModel map the wheel's flat outer face here, so tyre + wheel are ONE mesh and one draw call):
  // v 0..0.012 = centre cap, v 0.012..0.04 = five spokes (bright wedges, dark gaps) running out to the rim lip.
  // Drawn last so it overwrites the sidewall ribs; the mirrored band at the bottom serves the other face.
  for (const flip of [false, true]) {
    const y0 = flip ? h * 0.96 : 0;
    const bandH = h * 0.04;
    ctx.fillStyle = '#1c1d20';
    ctx.fillRect(0, y0, w, bandH);
    const capY = flip ? h - h * 0.012 : 0;
    ctx.fillStyle = '#c9cdd2';
    ctx.fillRect(0, capY, w, h * 0.012);
    const spokeY = flip ? y0 : h * 0.012;
    const spokeH = bandH - h * 0.012;
    const period = w / 5;
    ctx.fillStyle = '#aab0b8';
    for (let k = 0; k < 5; k++) ctx.fillRect(k * period + period * 0.12, spokeY, period * 0.5, spokeH);
    ctx.fillStyle = '#8c929a';
    for (let k = 0; k < 5; k++) ctx.fillRect(k * period + period * 0.12, spokeY, period * 0.5, 2);
  }
  if (hc) { hc.fillStyle = gray(128); hc.fillRect(0, 0, w, h * 0.04); hc.fillRect(0, h * 0.96, w, h * 0.04); }
};

// ---------------------------------------------------------------- licence plate

const PLATE_TEXTS = ['BK-STUY', 'BK-1623', 'STUY-90', 'BKLYN-7'] as const;
export const PLATE_VARIANTS = PLATE_TEXTS.length;
/** Registration text of plate variant `variant` (what the plate mesh of that car reads). */
export const plateText = (variant: number): string => PLATE_TEXTS[((Math.floor(variant) % PLATE_VARIANTS) + PLATE_VARIANTS) % PLATE_VARIANTS];
const PLATE_BLUE = '#1c3f94';
const PLATE_GOLD = '#c9a227';

/**
 * 256x128 parody New York style plate (2:1, matches the 0.34 x 0.17 m plane): white field, blue top band with
 * "BROOKLYN", big blue registration (default "BK-STUY"), gold bottom band reading "DO OR DIE - BED-STUY".
 * No state seal. Variant selects the registration text.
 */
export const platePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const hc = aux?.height;
  const text = PLATE_TEXTS[((Math.floor(variant) % PLATE_VARIANTS) + PLATE_VARIANTS) % PLATE_VARIANTS];
  ctx.fillStyle = '#f4f2ea';
  ctx.fillRect(0, 0, w, h);
  if (hc) { hc.fillStyle = gray(128); hc.fillRect(0, 0, w, h); }

  // bands
  ctx.fillStyle = PLATE_BLUE;
  ctx.fillRect(0, 0, w, h * 0.2);
  ctx.fillStyle = PLATE_GOLD;
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  // embossed border
  ctx.strokeStyle = PLATE_BLUE;
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  if (hc) { hc.strokeStyle = gray(170); hc.lineWidth = 3; hc.strokeRect(5, 5, w - 10, h - 10); }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'BROOKLYN', w * 0.5, h * 0.13, 'bold', 'Arial, Helvetica, sans-serif', 6);
  ctx.fillStyle = '#f4f2ea';
  ctx.fillText('BROOKLYN', w / 2, h * 0.105);

  // main registration, raised
  fitFont(ctx, text, w * 0.82, h * 0.44, 'bold', 'Arial Black, Arial, Helvetica, sans-serif', 10);
  const font = ctx.font;
  ctx.fillStyle = '#cfcbbd';
  ctx.fillText(text, w / 2 + 1.5, h * 0.52 + 1.5);
  ctx.fillStyle = PLATE_BLUE;
  ctx.fillText(text, w / 2, h * 0.52);
  if (hc) {
    hc.font = font;
    hc.textAlign = 'center';
    hc.textBaseline = 'middle';
    hc.fillStyle = gray(200);
    hc.fillText(text, w / 2, h * 0.52);
  }

  fitFont(ctx, 'DO OR DIE - BED-STUY', w * 0.8, h * 0.11, 'bold', 'Arial, Helvetica, sans-serif', 6);
  ctx.fillStyle = PLATE_BLUE;
  ctx.fillText('DO OR DIE - BED-STUY', w / 2, h * 0.91);

  // bolt holes
  for (const x of [w * 0.1, w * 0.9]) {
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(x, h * 0.12, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // age: a little road grime and chips
  speckle(ctx, w, h, rng, 120, ['#7c7568', '#b8b3a4', '#9b9588'], 1, 2, 0.28);
};

// ---------------------------------------------------------------- cargo box liveries

export const CARGO_LIVERY_W = 1024;
export const CARGO_LIVERY_H = 512;
/** 0 plain white, 1 produce wholesaler, 2 laundry service, 3 movers. The car's plate variant (seed % 4) picks one. */
export const CARGO_LIVERY_VARIANTS = 4;
/** Invented local businesses (no real brands): [name, tagline]. */
export const CARGO_LIVERY_TEXT: readonly (readonly [string, string] | null)[] = [
  null,
  ['STOOP & SPROUT PRODUCE', 'FRESH TO THE DOOR - WHOLESALE'],
  ['SUDS & SONS LAUNDRY', 'WASH - FOLD - DELIVER'],
  ['STEADY HANDS MOVING', 'LOCAL & LONG HAUL - BK 5-5019'],
];
/** v fraction (from the top of the canvas) of the strip that stays the plain base colour; roof, ends and underside sample it. */
export const CARGO_PLAIN_STRIP = 0.03;
const CARGO_BASE = ['#f4f4f4', '#f1ead3', '#eef3f7', '#f3efe4'] as const;

/**
 * 1024x512 livery for the cargo box sides (2:1, box length x height). Layout in canvas rows: the top 3 % is plain base colour
 * (CARGO_PLAIN_STRIP, used by every face that is not a side), the art sits between 8 % and 90 %, the bottom 10 % is road grime.
 * Variant 0 is plain white with panel seams only.
 */
export const cargoLiveryPainter: Painter = (ctx, w, h, rng, variant) => {
  const v = ((Math.floor(variant) % CARGO_LIVERY_VARIANTS) + CARGO_LIVERY_VARIANTS) % CARGO_LIVERY_VARIANTS;
  ctx.fillStyle = CARGO_BASE[v];
  ctx.fillRect(0, 0, w, h);
  const lines = CARGO_LIVERY_TEXT[v];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lines) {
    const [name, tag] = lines;
    if (v === 1) {
      // produce: green lower band, tomato-and-leaf mark on the left, bold name
      ctx.fillStyle = '#2f7d3a'; ctx.fillRect(0, h * 0.72, w, h * 0.18);
      ctx.fillStyle = '#e2b13c'; ctx.fillRect(0, h * 0.70, w, h * 0.02);
      ctx.fillStyle = '#d23a2a'; ctx.beginPath(); ctx.arc(w * 0.17, h * 0.4, h * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d9a47'; ctx.fillRect(w * 0.17 - h * 0.1, h * 0.4 - h * 0.2, h * 0.2, h * 0.05);
      fitFont(ctx, name, w * 0.58, h * 0.14, 'bold', 'Arial Black, Arial, Helvetica, sans-serif', 10);
      ctx.fillStyle = '#1f5a29'; ctx.fillText(name, w * 0.62, h * 0.36);
      fitFont(ctx, tag, w * 0.58, h * 0.07, 'bold', 'Arial, Helvetica, sans-serif', 8);
      ctx.fillStyle = '#7a5a12'; ctx.fillText(tag, w * 0.62, h * 0.52);
      ctx.fillStyle = '#f1ead3'; ctx.fillText('BK - NY', w * 0.5, h * 0.81);
    } else if (v === 2) {
      // laundry: blue wave bands with bubbles, white name on blue
      ctx.fillStyle = '#1d5fa8'; ctx.fillRect(0, h * 0.22, w, h * 0.34);
      ctx.fillStyle = '#6fb2e6'; ctx.fillRect(0, h * 0.6, w, h * 0.05); ctx.fillRect(0, h * 0.68, w, h * 0.03);
      for (let k = 0; k < 9; k++) {
        ctx.fillStyle = k % 2 ? '#bfe0f6' : '#e8f3fb';
        ctx.beginPath(); ctx.arc(w * (0.06 + 0.11 * k), h * (0.8 + 0.04 * Math.sin(k * 1.7)), h * (0.03 + 0.012 * (k % 3)), 0, Math.PI * 2); ctx.fill();
      }
      fitFont(ctx, name, w * 0.84, h * 0.17, 'bold', 'Arial Black, Arial, Helvetica, sans-serif', 10);
      ctx.fillStyle = '#ffffff'; ctx.fillText(name, w * 0.5, h * 0.34);
      fitFont(ctx, tag, w * 0.6, h * 0.08, 'bold', 'Arial, Helvetica, sans-serif', 8);
      ctx.fillStyle = '#d6ecfa'; ctx.fillText(tag, w * 0.5, h * 0.48);
    } else {
      // movers: deep red lower half-band, arrow-on-a-box mark, big name
      ctx.fillStyle = '#9c2b27'; ctx.fillRect(0, h * 0.66, w, h * 0.24);
      ctx.fillStyle = '#e3b43a'; ctx.fillRect(0, h * 0.64, w, h * 0.02);
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(w * 0.07, h * 0.24, h * 0.26, h * 0.22);
      ctx.fillStyle = '#e3b43a'; ctx.fillRect(w * 0.07 + h * 0.11, h * 0.24, h * 0.04, h * 0.22);
      fitFont(ctx, name, w * 0.6, h * 0.15, 'bold', 'Arial Black, Arial, Helvetica, sans-serif', 10);
      ctx.fillStyle = '#9c2b27'; ctx.fillText(name, w * 0.64, h * 0.32);
      fitFont(ctx, tag, w * 0.6, h * 0.075, 'bold', 'Arial, Helvetica, sans-serif', 8);
      ctx.fillStyle = '#4a3a2a'; ctx.fillText(tag, w * 0.64, h * 0.46);
      ctx.fillStyle = '#f3efe4'; ctx.fillText('INSURED - BONDED - FAMILY OWNED', w * 0.5, h * 0.78);
    }
  }
  // panel seams (box sheet joints) and rivet-line shadows, on every variant
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let k = 1; k < 6; k++) ctx.fillRect(Math.round((w * k) / 6), h * CARGO_PLAIN_STRIP * 2, 2, h * 0.88);
  ctx.fillRect(0, h * 0.07, w, 2);
  // road grime climbing the bottom edge, speckle on top
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = `rgba(80,66,48,${(0.04 + 0.025 * k).toFixed(3)})`;
    ctx.fillRect(0, h * (0.9 + 0.0125 * k), w, h * 0.0125 + 1);
  }
  speckle(ctx, w, h, rng, 300, ['#8a8a82', '#ffffff'], 1, 2, 0.08);
  // keep the plain strip plain (roof, ends and underside sample it)
  ctx.fillStyle = CARGO_BASE[v];
  ctx.fillRect(0, 0, w, h * CARGO_PLAIN_STRIP);
};
export * from './vehicleSkin';
