import { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';
import { auxSpeckle, gray, hsl, sootStreak, speckle, wrapVariant } from './util';

/*
 * Masonry painters: brick (4 variants), brownstone (2), limestone, pressed-metal cornice.
 *
 * Conventions shared by every painter here:
 *  - All pixel constants scale with k = w / 512, so the same code serves 512 and 1024 px tiles.
 *  - Every feature is wrapped: anything that crosses the right/bottom (or left/top) edge is drawn again
 *    shifted by one tile, so the tile repeats seamlessly. Features are painted through `placed`, which gives
 *    each feature its own private Rng (seeded from the main one), so every wrapped copy is identical and the
 *    main rng consumption never depends on whether relief (aux) layers exist.
 *  - Relief (aux) is drawn from the feature geometry plus `aux.rng` only. The brick relief is SHARED by all four
 *    brick variants (MaterialLibrary `share: 'brick'`), so brick geometry and every aux draw there are
 *    independent of the variant and of the main rng.
 */

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
interface Pad { l: number; r: number; t: number; b: number }

const mod = (a: number, n: number): number => ((a % n) + n) % n;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const sq = (p: number): Pad => ({ l: p, r: p, t: p, b: p });

/**
 * Top-left positions at which a rect (x, y, rw, rh), plus the padding its decorations may spill into, must be
 * drawn so it appears wrapped on a w x h tile. The first entry is always the normalised position.
 */
function copies(x: number, y: number, rw: number, rh: number, w: number, h: number, pad: Pad = sq(0)): Pt[] {
  const nx = mod(x, w);
  const ny = mod(y, h);
  const out: Pt[] = [];
  for (const dy of [0, -h, h]) {
    for (const dx of [0, -w, w]) {
      const px = nx + dx;
      const py = ny + dy;
      if (px + rw + pad.r > 0 && px - pad.l < w && py + rh + pad.b > 0 && py - pad.t < h) out.push([px, py]);
    }
  }
  return out;
}

/** Run fn once per wrapped copy with an identical private Rng, so all copies of a feature look the same. */
function placed(
  rng: Rng, x: number, y: number, rw: number, rh: number, w: number, h: number, pad: Pad,
  fn: (r: Rng, px: number, py: number) => void,
): void {
  const seed = Math.floor(rng.next() * 4294967296);
  for (const [px, py] of copies(x, y, rw, rh, w, h, pad)) fn(new Rng(seed), px, py);
}

/** Wrapped fillRect in the current fillStyle. */
function fillW(c: Ctx, x: number, y: number, rw: number, rh: number, w: number, h: number): void {
  for (const [px, py] of copies(x, y, rw, rh, w, h)) c.fillRect(px, py, rw, rh);
}

function blob(c: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, rot, 0, TAU);
  c.fill();
}

function dot(c: Ctx, cx: number, cy: number, r: number): void {
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.fill();
}

/** Full-width horizontal bands whose alpha grows toward the bottom (soot, no gradients). */
function bottomRamp(c: Ctx, w: number, h: number, steps: number, maxA: number, color: string, power: number): void {
  c.save();
  c.fillStyle = color;
  const sh = h / steps;
  for (let i = 0; i < steps; i++) {
    c.globalAlpha = maxA * Math.pow((i + 0.5) / steps, power);
    c.fillRect(0, i * sh, w, Math.min(sh, h - i * sh));
  }
  c.restore();
}

/** Fraction (0..1) through the tile of a rect's vertical centre. */
const tileT = (y: number, rh: number, h: number): number => mod(y + rh / 2, h) / h;

// ===================================================================================================== brick

interface BrickPal {
  h: number; s: number; l: number;
  /** per-brick lightness jitter on top of the tone palette */
  jl: number;
  /** small palette of (dHue, dSat, dLight) offsets; one is picked per brick */
  tones: ReadonlyArray<readonly [number, number, number]>;
  mH: number; mS: number; mL: number;
  painted: boolean;
  iron: boolean;
  /** chance per brick of a rust-streaked spot / an efflorescence run */
  rust: number;
  eff: number;
  grime: string;
}

const RED_TONES: BrickPal['tones'] = [[0, 0, 0], [-3, 4, 3], [3, -5, -3], [-2, 3, 6], [4, -3, -5]];
const BROWN_TONES: BrickPal['tones'] = [[0, 0, 0], [-3, 3, 3], [3, -3, -3], [2, 4, 5], [-2, -3, -4]];
const PAINT_TONES: BrickPal['tones'] = [[0, 0, 0], [2, 2, 2.5], [-2, -1, -3], [0, 3, 4], [1, -1, -1.5]];

const BRICK_PALS: BrickPal[] = [
  { h: 8, s: 52, l: 35, jl: 3, tones: RED_TONES, mH: 36, mS: 12, mL: 66, painted: false, iron: false, rust: 0.05, eff: 0.08, grime: '#000000' },
  { h: 20, s: 32, l: 28, jl: 3, tones: BROWN_TONES, mH: 34, mS: 12, mL: 56, painted: false, iron: true, rust: 0.07, eff: 0.06, grime: '#000000' },
  { h: 44, s: 9, l: 82, jl: 2, tones: PAINT_TONES, mH: 44, mS: 8, mL: 71, painted: true, iron: false, rust: 0, eff: 0, grime: '#3a342c' },
  { h: 212, s: 6, l: 54, jl: 2, tones: PAINT_TONES, mH: 212, mS: 6, mL: 42, painted: true, iron: false, rust: 0, eff: 0, grime: '#1c1e22' },
];

const BRICK_ROWS = 18; // header course every 6th row: 3 per tile (tile height = 18 courses)
const BRICK_PER = 7; // stretchers per row (225 mm each)

interface Brick { x: number; y: number; w: number; h: number; jl: number; jr: number; jt: number; jb: number }

/**
 * Brick geometry. Variant independent (own fixed Rng), so the shared relief matches every variant's colour map.
 * Rows sit on a vertical phase so the bottom course straddles the tile edge; odd rows are offset half a brick so
 * bricks straddle the right edge. Each face gets a little joint-thickness jitter.
 */
function brickLayout(w: number, h: number, k: number): Brick[] {
  const L = new Rng(0x0b51c4);
  const bw = w / BRICK_PER;
  const rh = h / BRICK_ROWS;
  const j = 1.5 * k;
  const phase = rh * 0.4;
  const out: Brick[] = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    const header = r % 6 === 5;
    const unit = header ? bw / 2 : bw;
    const count = header ? BRICK_PER * 2 : BRICK_PER;
    const off = header ? bw / 4 : (r % 2) * (bw / 2);
    for (let i = 0; i < count; i++) {
      out.push({
        x: i * unit - off,
        y: r * rh + phase,
        w: unit,
        h: rh,
        jl: j + L.range(-0.45, 0.45) * k,
        jr: j + L.range(-0.45, 0.45) * k,
        jt: j + L.range(-0.45, 0.45) * k,
        jb: j + L.range(-0.45, 0.45) * k,
      });
    }
  }
  return out;
}

/** Paint one brick (and everything that drips off it) with its top-left at (px, py). */
function paintBrick(c: Ctx, r: Rng, pal: BrickPal, b: Brick, px: number, py: number, k: number): void {
  const fx = px + b.jl;
  const fy = py + b.jt;
  const fw = b.w - b.jl - b.jr;
  const fh = b.h - b.jt - b.jb;
  c.save();

  // ---- body colour: small palette, 15% outliers (dark clinkers / pale underfired)
  const tone = r.pick(pal.tones);
  let hh = pal.h + tone[0] + r.range(-1.5, 1.5);
  let ss = pal.s + tone[1] + r.range(-3, 3);
  let ll = pal.l + tone[2] + r.range(-pal.jl, pal.jl);
  if (r.chance(0.15)) {
    if (pal.painted) {
      ll += r.chance(0.6) ? -r.range(5, 9) : r.range(2, 4);
    } else if (r.chance(0.6)) {
      ll -= r.range(8, 13);
      ss -= r.range(4, 9);
      hh += r.range(2, 7);
    } else {
      ll += r.range(7, 11);
      ss += 3;
      hh += r.range(4, 8);
    }
  }
  c.fillStyle = hsl(hh, ss, ll);
  c.fillRect(fx, fy, fw, fh);

  // kiln-burnt end: one side of the face a shade off
  if (r.chance(0.55)) {
    const fr = r.range(0.25, 0.6);
    c.globalAlpha = 0.35;
    c.fillStyle = hsl(hh + r.range(-3, 3), ss + r.range(-5, 5), ll + r.range(-5, 5));
    if (r.chance(0.5)) c.fillRect(fx, fy, fw * fr, fh);
    else c.fillRect(fx + fw * (1 - fr), fy, fw * fr, fh);
  }

  // thin paint: a faint warm cast of the old brick under it
  if (pal.painted && r.chance(0.25)) {
    c.globalAlpha = 0.1;
    c.fillStyle = hsl(8, 25, 46);
    c.fillRect(fx, fy, fw, fh);
  }

  // arrises and the shadow cast into the recessed joint underneath
  c.globalAlpha = pal.painted ? 0.2 : 0.14;
  c.fillStyle = '#ffffff';
  c.fillRect(fx, fy, fw, 1.2 * k);
  c.globalAlpha = 0.2;
  c.fillStyle = '#000000';
  c.fillRect(fx, fy + fh - 1.6 * k, fw, 1.6 * k);
  c.globalAlpha = 0.12;
  c.fillRect(fx + fw - 1.2 * k, fy, 1.2 * k, fh);
  c.globalAlpha = 0.3;
  c.fillRect(fx, fy + fh, fw, 1.3 * k);

  // pitting: dark pinholes, a few pale grains, faint drag marks
  c.globalAlpha = 0.5;
  c.fillStyle = hsl(hh - 4, ss, ll - 14);
  for (let i = r.int(4, 8); i > 0; i--) {
    const s = r.range(0.7, 1.6) * k;
    c.fillRect(fx + r.range(0, fw - s), fy + r.range(0, fh - s), s, s);
  }
  c.globalAlpha = 0.35;
  c.fillStyle = hsl(hh + 4, ss - 6, ll + 10);
  for (let i = r.int(2, 4); i > 0; i--) {
    const s = r.range(0.7, 1.4) * k;
    c.fillRect(fx + r.range(0, fw - s), fy + r.range(0, fh - s), s, s);
  }
  for (let i = 0; i < 2; i++) {
    c.globalAlpha = 0.06;
    c.fillStyle = i === 0 ? '#000000' : '#ffffff';
    const len = fw * r.range(0.4, 0.9);
    c.fillRect(fx + r.range(0, fw - len), fy + fh * r.range(0.2, 0.8), len, 0.6 * k);
  }

  // iron-spot brick: dark specks with a rusty halo
  if (pal.iron) {
    for (let i = r.int(3, 7); i > 0; i--) {
      const sx = fx + r.range(0.08, 0.92) * fw;
      const sy = fy + r.range(0.1, 0.9) * fh;
      const sr = r.range(0.6, 1.5) * k;
      c.globalAlpha = 0.25;
      c.fillStyle = hsl(22, 60, 40);
      dot(c, sx, sy, sr * 1.7);
      c.globalAlpha = 0.75;
      c.fillStyle = hsl(12, 45, 10);
      dot(c, sx, sy, sr);
    }
  }

  // efflorescence run: pale salt streak from the joint above, and a crust on the joint below
  if (pal.eff > 0 && r.chance(pal.eff)) {
    const ex = fx + r.range(0.1, 0.85) * fw;
    const sw = r.range(2, 5) * k;
    sootStreak(c, ex, py, sw, b.h * r.range(0.8, 1.7), r.range(0.22, 0.34), hsl(44, 14, 86));
    c.globalAlpha = 0.35;
    c.fillStyle = hsl(44, 14, 86);
    c.fillRect(ex - sw * 0.5, fy + fh, sw * 2.5, 1.2 * k);
  }

  // rust stain under an occasional spot (cut nail / iron inclusion)
  if (pal.rust > 0 && r.chance(pal.rust)) {
    const rx = fx + r.range(0.15, 0.85) * fw;
    const ry = fy + r.range(0.1, 0.55) * fh;
    c.globalAlpha = 0.85;
    c.fillStyle = hsl(18, 70, 26);
    dot(c, rx, ry, r.range(1.1, 2.2) * k);
    sootStreak(c, rx - 1.2 * k, ry, r.range(1.8, 3.4) * k, b.h * r.range(0.9, 1.9), r.range(0.3, 0.45), hsl(20, 65, 30));
  }

  // painted brick: paint chipped at the arrises, revealing the red brick below
  if (pal.painted) {
    if (r.chance(0.3)) {
      const cw = r.range(2, 7) * k;
      const ch = r.range(1.5, 4) * k;
      const cx = r.chance(0.5) ? fx : fx + fw - cw;
      const cy = r.chance(0.5) ? fy : fy + fh - ch;
      c.globalAlpha = 0.9;
      c.fillStyle = hsl(8, 42, 28);
      c.fillRect(cx, cy, cw, ch);
      c.globalAlpha = 0.6;
      c.fillStyle = hsl(10, 35, 40);
      c.fillRect(cx + (cx === fx ? cw : -cw * 0.5), cy, cw * 0.5, ch * 0.5);
    }
    if (r.chance(0.07)) {
      const cw = r.range(6, 16) * k;
      const ch = r.range(3, 8) * k;
      const cx = r.chance(0.5) ? fx : fx + fw - cw;
      c.globalAlpha = 0.85;
      c.fillStyle = hsl(8, 45, 30);
      c.fillRect(cx, fy, cw, ch);
      c.fillStyle = hsl(14, 40, 22);
      c.fillRect(cx + cw * 0.3, fy + ch * 0.6, cw * 0.5, ch * 0.5);
    }
  }
  c.restore();
}

/**
 * 1024px tile (works at any size: all pixel constants scale with w/512): 18 courses x 7 stretchers, running bond,
 * every 6th course a header course. The tile covers roughly 1.5 m. Variants: 0 red common brick, 1 brown iron-spot,
 * 2 painted white, 3 painted grey (paint thin, brick texture showing, chipped at the arrises).
 * Relief (aux): mortar recessed, each brick chamfered with a slight per-brick bump (aux rng only, geometry fixed, so
 * the normal map is identical for every variant and can be shared).
 */
export const brickPainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const pal = BRICK_PALS[wrapVariant(variant, 4)];
  const k = w / 512;
  const rh = h / BRICK_ROWS;
  const bricks = brickLayout(w, h, k);

  ctx.fillStyle = hsl(pal.mH, pal.mS, pal.mL);
  ctx.fillRect(0, 0, w, h);
  // sandy grain in the mortar (bricks cover most of it)
  speckle(ctx, w, h, rng, Math.round(650 * k * k), [hsl(pal.mH, pal.mS, pal.mL + 10), hsl(pal.mH, pal.mS, pal.mL - 12)], 0.8 * k, 2 * k, 0.55);

  for (const b of bricks) {
    placed(rng, b.x, b.y, b.w, b.h, w, h, { l: 4 * k, r: 4 * k, t: 2 * k, b: 2 * rh }, (r, px, py) => paintBrick(ctx, r, pal, b, px, py, k));
  }

  // old soot / run-off streaks down the wall
  for (let i = 0; i < 9; i++) {
    const sw = rng.range(5, 22) * k * 0.5;
    const len = rng.range(0.3, 0.7) * h;
    const a = rng.range(0.05, pal.painted ? 0.12 : 0.1);
    placed(rng, rng.range(0, w), rng.range(0, 0.4) * h, sw, len, w, h, { l: 0, r: 0, t: 0, b: 0 }, (_r, px, py) => {
      sootStreak(ctx, px, py, sw, len, a, pal.grime);
    });
  }
  speckle(ctx, w, h, rng, Math.round(500 * k * k), ['#000000', '#ffffff'], 1, 2 * k, 0.06);

  if (aux) {
    aux.height.fillStyle = gray(55);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(245);
      aux.rough.fillRect(0, 0, w, h);
    }
    for (const b of bricks) {
      const a = aux.rng.next();
      const fx = b.x + b.jl;
      const fy = b.y + b.jt;
      const fw = b.w - b.jl - b.jr;
      const fh = b.h - b.jt - b.jb;
      aux.height.fillStyle = gray(112 + a * 30);
      fillW(aux.height, fx, fy, fw, fh, w, h);
      aux.height.fillStyle = gray(150 + a * 30);
      fillW(aux.height, fx + 2.2 * k, fy + 2.2 * k, fw - 4.4 * k, fh - 4.4 * k, w, h);
      if (aux.rough) {
        aux.rough.fillStyle = gray(212 + a * 22);
        fillW(aux.rough, fx, fy, fw, fh, w, h);
      }
    }
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(2500 * k * k), [90, 100, 175, 190], 1, 2 * k, 0.5);
  }
};

// ============================================================================================== brownstone

interface StonePal {
  h: number; s: number; l: number;
  tones: ReadonlyArray<readonly [number, number, number]>;
  /** per-block chances / counts */
  repoint: number;
  spallBlock: number;
  spallMax: number;
  /** darkest soot alpha under joints and for the bottom-of-tile ramp */
  sootMax: number;
  rampMax: number;
  grit: number;
  gritMax: number;
}

const STONE_TONES: StonePal['tones'] = [[0, 0, 0], [-2, 3, 2.5], [2, -3, -2.5], [-4, -4, 4.5], [3, 4, -4]];

const STONE_PALS: StonePal[] = [
  // v0 mid chocolate ashlar
  { h: 16, s: 34, l: 36, tones: STONE_TONES, repoint: 0.22, spallBlock: 0.12, spallMax: 1, sootMax: 0.22, rampMax: 0.2, grit: 700, gritMax: 2.4 },
  // v1 dark, weathered, spalling (stoop)
  { h: 14, s: 26, l: 25, tones: STONE_TONES, repoint: 0.07, spallBlock: 0.9, spallMax: 3, sootMax: 0.28, rampMax: 0.24, grit: 2300, gritMax: 3.2 },
];

const COURSE_MUL = [1.1, 0.9, 1.0, 1.15, 0.85, 1.0]; // sums to 6 so the courses tile vertically

interface Block { x: number; y: number; w: number; h: number; t: number }

/** Course/block layout from the main rng. Course heights vary a little; each course has its own random cuts. */
function stoneLayout(
  rng: Rng, w: number, h: number, mul: readonly number[], phaseFrac: number, nMin: number, nMax: number,
): Block[] {
  const rows = mul.length;
  const rh0 = h / rows;
  const out: Block[] = [];
  let y = rh0 * phaseFrac;
  for (let r = 0; r < rows; r++) {
    const bh = rh0 * mul[r];
    const n = rng.int(nMin, nMax);
    const start = rng.range(0, w);
    const cuts: number[] = [];
    for (let i = 0; i < n; i++) cuts.push(start + (i * w) / n + rng.range(-w / (n * 4), w / (n * 4)));
    for (let i = 0; i < n; i++) {
      const x0 = cuts[i];
      const x1 = i + 1 < n ? cuts[i + 1] : cuts[0] + w;
      out.push({ x: x0, y, w: x1 - x0, h: bh, t: tileT(y, bh, h) });
    }
    y += bh;
  }
  return out;
}

/** One stone block: face, bedding, tooling, soot under the bed joint, spalls, repointed joints (and relief). */
function paintBlock(
  c: Ctx, r: Rng, pal: StonePal, b: Block, px: number, py: number, k: number,
  hCtx: Ctx | null, rCtx: Ctx | null, v: number,
): void {
  const j = 1.1 * k;
  const fx = px + j;
  const fy = py + j;
  const fw = b.w - 2 * j;
  const fh = b.h - 2 * j;
  c.save();

  // ---- face colour: palette tone + 15% outliers (pinker/lighter fresh stone, or dark iron-rich block)
  const tone = r.pick(pal.tones);
  let hh = pal.h + tone[0] + r.range(-1.5, 1.5);
  let ss = pal.s + tone[1] + r.range(-2, 2);
  let ll = pal.l + tone[2] + r.range(-2, 2);
  if (r.chance(0.15)) {
    if (r.chance(0.5)) { ll += r.range(5, 8); ss += 4; hh -= 4; } else { ll -= r.range(5, 8); ss -= 3; hh += 2; }
  }
  c.fillStyle = hsl(hh, ss, ll);
  c.fillRect(fx, fy, fw, fh);

  // mottling and sandstone bedding laminae (horizontal, faint)
  for (let i = r.int(2, 3); i > 0; i--) {
    const mw = fw * r.range(0.3, 0.7);
    const mh = fh * r.range(0.3, 0.8);
    c.globalAlpha = 0.07;
    c.fillStyle = hsl(hh + r.range(-3, 3), ss, ll + (r.chance(0.5) ? 5 : -5));
    c.fillRect(fx + r.range(0, fw - mw), fy + r.range(0, fh - mh), mw, mh);
  }
  const lam: Array<[number, number, number, boolean]> = [];
  for (let i = r.int(3, 4); i > 0; i--) {
    const len = fw * r.range(0.3, 0.7);
    lam.push([fx + r.range(0, fw - len), fy + fh * r.range(0.12, 0.92), len, r.chance(0.5)]);
  }
  for (const [lx, ly, len, dark] of lam) {
    c.globalAlpha = 0.08;
    c.fillStyle = dark ? '#000000' : '#ffd9b0';
    c.fillRect(lx, ly, len, r.range(0.8, 1.4) * k);
  }

  // ---- tooling: fine vertical chisel lines, dark and light, never covering the full height
  const nl = Math.max(4, Math.round(fw / (3.2 * k)));
  const lines: Array<{ x: number; y: number; len: number; wd: number; a: number; dark: boolean }> = [];
  for (let i = 0; i < nl; i++) {
    const len = fh * r.range(0.45, 1);
    lines.push({
      x: fx + (i + r.range(0.1, 0.9)) * (fw / nl),
      y: fy + r.range(0, fh - len),
      len,
      wd: r.range(0.5, 1.1) * k,
      a: r.range(0.05, 0.15),
      dark: i % 2 === 0,
    });
  }
  for (const pass of [true, false]) {
    c.fillStyle = pass ? hsl(hh - 2, ss + 2, ll - 11) : hsl(hh + 2, ss - 6, ll + 10);
    for (const L of lines) {
      if (L.dark !== pass) continue;
      c.globalAlpha = pass ? L.a : L.a * 0.7;
      c.fillRect(L.x, L.y, L.wd, L.len);
    }
  }

  // bevel: light on the top/left arris, dark on the bottom/right
  c.globalAlpha = 0.16;
  c.fillStyle = hsl(25, 45, 70);
  c.fillRect(fx, fy, fw, 1.5 * k);
  c.fillRect(fx, fy, 1.5 * k, fh);
  c.globalAlpha = 0.28;
  c.fillStyle = '#000000';
  c.fillRect(fx, fy + fh - 2 * k, fw, 2 * k);
  c.fillRect(fx + fw - 2 * k, fy, 2 * k, fh);

  // ---- soot hanging under the bed joint, heavier toward the bottom of the tile
  const sootA = pal.sootMax * (0.3 + 0.7 * b.t) * r.range(0.6, 1.1);
  const sh = fh * 0.05;
  c.fillStyle = '#0c0806';
  for (let i = 0; i < 4; i++) {
    c.globalAlpha = sootA * Math.pow(1 - i / 4, 1.5);
    c.fillRect(fx, fy + i * sh, fw, sh);
  }

  // ---- grit: sand grains lifting out of the face
  const ng = Math.round((fw * fh) / (pal.grit > 1500 ? 260 * k * k : 900 * k * k));
  for (let i = 0; i < ng; i++) {
    const s = r.range(1, pal.gritMax) * k * 0.6;
    c.globalAlpha = 0.4;
    c.fillStyle = r.chance(0.5) ? hsl(hh + 2, ss - 4, ll + 14) : hsl(hh - 2, ss + 2, ll - 14);
    c.fillRect(fx + r.range(0, fw - s), fy + r.range(0, fh - s), s, s);
  }

  // ---- spalls: flaked patches with a fresh, lighter interior and a shadowed upper lip
  const nsp = r.chance(pal.spallBlock) ? r.int(1, pal.spallMax) : 0;
  const spalls: Array<{ cx: number; cy: number; rx: number; ry: number; rot: number }> = [];
  for (let i = 0; i < nsp; i++) {
    const rx = r.range(3, 12) * k;
    const ry = rx * r.range(0.45, 0.9);
    spalls.push({
      cx: fx + rx * 1.3 + r.next() * Math.max(0, fw - rx * 2.6),
      cy: fy + ry * 1.3 + r.next() * Math.max(0, fh - ry * 2.6),
      rx, ry, rot: r.range(-0.5, 0.5),
    });
  }
  for (const sp of spalls) {
    c.globalAlpha = 0.55;
    c.fillStyle = hsl(hh - 2, ss, ll - 12);
    blob(c, sp.cx, sp.cy, sp.rx * 1.15, sp.ry * 1.15, sp.rot);
    c.globalAlpha = 0.9;
    c.fillStyle = hsl(hh - 4, ss + 4, ll + 13);
    blob(c, sp.cx + sp.rx * 0.08, sp.cy + sp.ry * 0.15, sp.rx * 0.8, sp.ry * 0.78, sp.rot);
    c.globalAlpha = 0.35;
    c.fillStyle = '#000000';
    blob(c, sp.cx, sp.cy - sp.ry * 0.4, sp.rx * 0.75, sp.ry * 0.35, sp.rot);
    c.globalAlpha = 0.5;
    c.fillStyle = hsl(hh + 2, ss - 4, ll + 18);
    for (let q = 0; q < 3; q++) {
      const s = r.range(0.8, 1.8) * k;
      c.fillRect(sp.cx + r.range(-1.6, 1.6) * sp.rx, sp.cy + sp.ry * r.range(1.1, 1.6), s, s);
    }
  }

  // ---- repointed joints: lighter, flush mortar over the old dark joint
  const repointTop = r.chance(pal.repoint);
  const repointLeft = r.chance(pal.repoint * 0.6);
  if (repointTop) {
    c.globalAlpha = 0.88;
    c.fillStyle = hsl(32, 14, 54);
    c.fillRect(px - j, py - j, b.w + 2 * j, 2 * j);
  }
  if (repointLeft) {
    c.globalAlpha = 0.88;
    c.fillStyle = hsl(32, 14, 52);
    c.fillRect(px - j, py, 2 * j, b.h);
  }
  c.restore();

  // ---- relief: proud face with a chamfer, faint chisel lines, depressed spalls, flush repointing
  if (hCtx) {
    const n = r.next();
    hCtx.fillStyle = gray(112 + n * 14);
    hCtx.fillRect(fx, fy, fw, fh);
    hCtx.fillStyle = gray(140 + n * 20);
    hCtx.fillRect(fx + 3 * k, fy + 3 * k, fw - 6 * k, fh - 6 * k);
    hCtx.save();
    hCtx.fillStyle = gray(124);
    hCtx.globalAlpha = 0.28;
    for (const L of lines) hCtx.fillRect(L.x, L.y, L.wd, L.len);
    hCtx.restore();
    for (const sp of spalls) {
      hCtx.fillStyle = gray(150);
      blob(hCtx, sp.cx, sp.cy, sp.rx * 1.2, sp.ry * 1.2, sp.rot);
      hCtx.fillStyle = gray(88 + n * 10);
      blob(hCtx, sp.cx, sp.cy, sp.rx * 0.9, sp.ry * 0.85, sp.rot);
    }
    if (repointTop) {
      hCtx.fillStyle = gray(76);
      hCtx.fillRect(px - j, py - j, b.w + 2 * j, 2 * j);
    }
    if (repointLeft) {
      hCtx.fillStyle = gray(76);
      hCtx.fillRect(px - j, py, 2 * j, b.h);
    }
    if (rCtx) {
      rCtx.fillStyle = gray((v === 0 ? 200 : 218) + n * 14);
      rCtx.fillRect(fx, fy, fw, fh);
      for (const sp of spalls) {
        rCtx.fillStyle = gray(212);
        blob(rCtx, sp.cx, sp.cy, sp.rx * 1.1, sp.ry * 1.1, sp.rot);
      }
    }
  }
}

/**
 * 1024px (or 512px) tile = 2 m x 2 m: six ashlar courses (~0.33 m) of 2-3 blocks, thin recessed dark joints,
 * fine vertical chisel tooling on every face, faint sandstone bedding. Soot hangs under every bed joint and
 * deepens toward the bottom of the tile; a few joints have been repointed in lighter mortar.
 * v0 mid chocolate; v1 darker, spalling, gritty (stoops).
 */
export const brownstonePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const v = wrapVariant(variant, 2);
  const pal = STONE_PALS[v];
  const k = w / 512;
  ctx.fillStyle = hsl(18, 18, 11);
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(52);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(245);
      aux.rough.fillRect(0, 0, w, h);
    }
  }

  const blocks = stoneLayout(rng, w, h, COURSE_MUL, 0.45, 2, 3);
  for (const b of blocks) {
    placed(rng, b.x, b.y, b.w, b.h, w, h, sq(2 * k), (r, px, py) => {
      paintBlock(ctx, r, pal, b, px, py, k, aux?.height ?? null, aux?.rough ?? null, v);
    });
  }

  // general darkening toward the bottom of the tile (gentle: the tile repeats vertically)
  bottomRamp(ctx, w, h, 16, pal.rampMax, '#0c0806', 1.8);

  // soot running down from sill ledges
  for (let i = rng.int(2, 3); i > 0; i--) {
    const sw = rng.range(22, 44) * k;
    const len = rng.range(0.3, 0.5) * h;
    const sa = rng.range(0.16, 0.26);
    placed(rng, rng.range(0, w), rng.range(0.12, 0.4) * h, sw, len, w, h, sq(2 * k), (_r, px, py) => {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000000';
      ctx.fillRect(px - 2 * k, py - 2 * k, sw + 4 * k, 2 * k);
      ctx.restore();
      sootStreak(ctx, px, py, sw, len, sa);
    });
  }
  // fine vertical grime lines
  for (let i = 0; i < 12; i++) {
    const sw = rng.range(2, 9) * k;
    const len = rng.range(0.25, 0.8) * h;
    const a = rng.range(0.06, 0.14);
    placed(rng, rng.range(0, w), rng.range(0, 0.5) * h, sw, len, w, h, sq(0), (_r, px, py) => {
      sootStreak(ctx, px, py, sw, len, a, '#0c0806');
    });
  }
  // soft stains: dark damp patches and a few sun-bleached pinkish ones
  for (let i = 0; i < 12; i++) {
    const dark = i < 9;
    const rad = rng.range(10, 36) * k;
    const a = rng.range(0.03, dark ? 0.08 : 0.06);
    placed(rng, rng.range(0, w) - rad, rng.range(0, h) - rad, 2 * rad, 2 * rad, w, h, sq(0), (_r, px, py) => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = dark ? '#000000' : '#d8a58a';
      dot(ctx, px + rad, py + rad, rad);
      ctx.restore();
    });
  }
  speckle(ctx, w, h, rng, Math.round((v === 0 ? 800 : 1500) * k * k), ['#000000', '#e0b890'], 1, 2.5 * k, 0.08);

  if (aux) {
    auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(3000 * k * k), [95, 108, 150, 165], 1, 2.5 * k, 0.5);
    // rustication pits, thickest in the weathered lower courses
    const by = h * 0.72;
    auxSpeckle(aux.height, aux.rng, 0, by, w, h - by, Math.round((v === 0 ? 1400 : 2600) * k * k), [70, 85], 1.5 * k, 4 * k, 0.6);
  }
};

// ============================================================================================== limestone

const LIME_TONES: StonePal['tones'] = [[0, 0, 0], [2, 3, 2.5], [-2, -3, -2.5], [1, -4, 4], [-3, 3, -4]];

function paintLimeBlock(
  c: Ctx, r: Rng, b: Block, px: number, py: number, k: number, hCtx: Ctx | null, rCtx: Ctx | null,
): void {
  const j = 0.9 * k;
  const fx = px + j;
  const fy = py + j;
  const fw = b.w - 2 * j;
  const fh = b.h - 2 * j;
  c.save();
  const tone = r.pick(LIME_TONES);
  let hh = 40 + tone[0] + r.range(-1.5, 1.5);
  let ss = 20 + tone[1] + r.range(-2, 2);
  let ll = 77 + tone[2] + r.range(-2, 2);
  if (r.chance(0.15)) {
    if (r.chance(0.5)) { ll -= r.range(6, 9); ss += 6; hh += 3; } else { ll += r.range(3, 5); ss -= 5; }
  }
  c.fillStyle = hsl(hh, ss, ll);
  c.fillRect(fx, fy, fw, fh);

  // gentle mottling
  for (let i = r.int(2, 3); i > 0; i--) {
    const mw = fw * r.range(0.25, 0.6);
    const mh = fh * r.range(0.3, 0.8);
    c.globalAlpha = 0.06;
    c.fillStyle = hsl(hh + r.range(-4, 4), ss, ll + (r.chance(0.5) ? 5 : -5));
    c.fillRect(fx + r.range(0, fw - mw), fy + r.range(0, fh - mh), mw, mh);
  }
  // bevelled arrises
  c.globalAlpha = 0.2;
  c.fillStyle = '#fff6e4';
  c.fillRect(fx, fy, fw, 1.4 * k);
  c.globalAlpha = 0.13;
  c.fillStyle = '#1a140c';
  c.fillRect(fx, fy + fh - 1.8 * k, fw, 1.8 * k);
  c.fillRect(fx + fw - 1.4 * k, fy, 1.4 * k, fh);
  // soot hung under the bed joint
  c.fillStyle = '#2a241c';
  const sh = fh * 0.05;
  for (let i = 0; i < 3; i++) {
    c.globalAlpha = 0.09 * (0.3 + 0.7 * b.t) * Math.pow(1 - i / 3, 1.5);
    c.fillRect(fx, fy + i * sh, fw, sh);
  }

  // fossil speckle: dark flecks, pale-brown pits, a few shell sections
  const nf = Math.round((fw * fh) / (600 * k * k));
  c.fillStyle = hsl(36, 14, 40);
  for (let i = 0; i < nf; i++) {
    const s = r.range(0.7, 2) * k;
    c.globalAlpha = r.range(0.25, 0.5);
    c.fillRect(fx + r.range(0, fw - s), fy + r.range(0, fh - s), s, s);
  }
  c.fillStyle = hsl(34, 18, 58);
  for (let i = 0; i < 12; i++) {
    const s = r.range(1, 2) * k;
    c.globalAlpha = 0.4;
    c.fillRect(fx + r.range(0, fw - s), fy + r.range(0, fh - s), s, s);
  }
  const shells: Array<{ x: number; y: number; rx: number; ry: number; rot: number }> = [];
  for (let i = r.int(0, 3); i > 0; i--) {
    const rx = r.range(2, 5) * k;
    shells.push({ x: fx + rx + r.next() * (fw - 2 * rx), y: fy + 3 * k + r.next() * (fh - 6 * k), rx, ry: rx * r.range(0.25, 0.4), rot: r.range(-0.6, 0.6) });
  }
  for (const s of shells) {
    c.globalAlpha = 0.24;
    c.fillStyle = hsl(34, 16, 38);
    blob(c, s.x, s.y, s.rx, s.ry, s.rot);
    c.globalAlpha = 0.5;
    c.fillStyle = hsl(42, 22, 88);
    blob(c, s.x, s.y, s.rx * 0.62, s.ry * 0.5, s.rot);
  }
  c.restore();

  if (hCtx) {
    const n = r.next();
    hCtx.fillStyle = gray(138 + n * 8);
    hCtx.fillRect(fx, fy, fw, fh);
    hCtx.fillStyle = gray(150 + n * 10);
    hCtx.fillRect(fx + 2 * k, fy + 2 * k, fw - 4 * k, fh - 4 * k);
    hCtx.fillStyle = gray(112);
    for (const s of shells) blob(hCtx, s.x, s.y, s.rx, s.ry, s.rot);
    if (rCtx) {
      rCtx.fillStyle = gray(180 + n * 10); // glossier than brownstone
      rCtx.fillRect(fx, fy, fw, fh);
    }
  }
}

/**
 * 512px tile = 2 m: pale warm limestone in 0.5 m courses of 2-3 big blocks, hairline pale-grey joints, subtle
 * fossil speckle and shell sections, grey soot streaks in vertical lines. Relief is smooth (low chamfer, shells
 * and pits only) and the roughness is lower (glossier) than brownstone.
 */
export const limestonePainter: Painter = (ctx, w, h, rng, _variant, aux) => {
  const k = w / 512;
  ctx.fillStyle = hsl(38, 8, 58);
  ctx.fillRect(0, 0, w, h);
  if (aux) {
    aux.height.fillStyle = gray(70);
    aux.height.fillRect(0, 0, w, h);
    if (aux.rough) {
      aux.rough.fillStyle = gray(235);
      aux.rough.fillRect(0, 0, w, h);
    }
  }
  const mul = [1, 1, 1, 1];
  const blocks = stoneLayout(rng, w, h, mul, 0.35, 2, 3);
  for (const b of blocks) {
    placed(rng, b.x, b.y, b.w, b.h, w, h, sq(2 * k), (r, px, py) => {
      paintLimeBlock(ctx, r, b, px, py, k, aux?.height ?? null, aux?.rough ?? null);
    });
  }
  // grey soot streaks in vertical lines, running down across joints
  for (let i = 0; i < 8; i++) {
    const sw = rng.range(3, 11) * k;
    const len = rng.range(0.35, 0.85) * h;
    const a = rng.range(0.08, 0.16);
    placed(rng, rng.range(0, w), rng.range(0, 0.55) * h, sw, len, w, h, sq(0), (_r, px, py) => {
      sootStreak(ctx, px, py, sw, len, a, '#3a342b');
    });
  }
  for (let i = 0; i < 10; i++) {
    const len = rng.range(0.2, 0.7) * h;
    const a = rng.range(0.05, 0.1);
    placed(rng, rng.range(0, w), rng.range(0, h), 1.2 * k, len, w, h, sq(0), (_r, px, py) => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#2e2922';
      ctx.fillRect(px, py, 1.2 * k, len);
      ctx.restore();
    });
  }
  bottomRamp(ctx, w, h, 12, 0.08, '#2a241c', 1.6);
  speckle(ctx, w, h, rng, Math.round(700 * k * k), ['#000000', '#ffffff'], 1, 2 * k, 0.07);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(1500 * k * k), [110, 125, 165, 180], 1, 2 * k, 0.4);
};

// ================================================================================================= cornice

type Shape = 'l' | 's' | 'x' | 'v';
/** Moulding profile as (t, height 0..1, shape) control points, t down the tile; periodic (ends at the start value). */
const PROFILE: ReadonlyArray<readonly [number, number, Shape]> = [
  [0.06, 0.86, 'l'], // top fillet
  [0.19, 0.34, 's'], // cyma
  [0.21, 0.34, 'l'],
  [0.225, 0.5, 'l'], // step up to the bead band
  [0.35, 0.5, 'l'],
  [0.365, 0.6, 'l'],
  [0.395, 0.6, 'l'], // fillet
  [0.405, 0.3, 'l'], // drop to the dentil band
  [0.52, 0.3, 'l'],
  [0.53, 0.46, 'l'],
  [0.62, 0.82, 'x'], // ovolo
  [0.65, 0.82, 'l'], // fillet
  [0.9, 0.4, 'v'], // big cove
  [1, 0.86, 's'], // back up to the lip
];
/** Fractions of the tile height where the profile has a ridge or step (paint wears through here first). */
const CORNICE_EDGES = [0, 0.06, 0.19, 0.225, 0.35, 0.365, 0.395, 0.405, 0.53, 0.62, 0.65];

function prof(tIn: number): number {
  const t = mod(tIn, 1);
  let t0 = 0;
  let v0 = 0.86;
  for (const [t1, v1, shape] of PROFILE) {
    if (t <= t1) {
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      const f = shape === 's' ? u * u * (3 - 2 * u) : shape === 'x' ? Math.sin((u * Math.PI) / 2) : shape === 'v' ? 1 - Math.cos((u * Math.PI) / 2) : u;
      return v0 + (v1 - v0) * f;
    }
    t0 = t1;
    v0 = v1;
  }
  return v0;
}

const CORNICE_PALS = [
  { h: 150, s: 16, l: 9 }, // near-black green
  { h: 22, s: 26, l: 10 }, // near-black brown
];

/**
 * 512px cornice: pressed sheet metal painted near-black (v0 green, v1 brown) with a horizontal moulding
 * profile: lip fillet, cyma, bead-and-reel band, dentils, ovolo, fluted cove. Shading follows the profile slope
 * (top-lit, paint has a faint sheen on upward-facing surfaces); paint has flaked along every ridge to show rust
 * lines, with rust runs below the rivet heads. Height (aux) carries the profile itself.
 */
export const cornicePainter: Painter = (ctx, w, h, rng, variant, aux) => {
  const pal = CORNICE_PALS[wrapVariant(variant, 2)];
  const k = w / 512;
  const step = Math.max(1, Math.round(h / 512));
  const e = step / h;

  // ---- profile shading, one strip per step; aux height gets the profile itself
  for (let y = 0; y < h; y += step) {
    const t = (y + step / 2) / h;
    const d = (prof(t + e) - prof(t - e)) / (2 * e) / h; // slope per pixel
    const s = clamp(d * 40, -1, 1);
    ctx.fillStyle = hsl(pal.h, pal.s + (s > 0 ? 4 * s : 0), pal.l + (s > 0 ? 22 * s : 5 * s) + (prof(t) - 0.5) * 4);
    ctx.fillRect(0, y, w, step);
    if (aux) {
      aux.height.fillStyle = gray(40 + prof(t) * 190);
      aux.height.fillRect(0, y, w, step);
    }
  }
  if (aux?.rough) {
    aux.rough.fillStyle = gray(150); // semi-gloss paint
    aux.rough.fillRect(0, 0, w, h);
  }
  const hCtx = aux?.height ?? null;
  const edgeY = (t: number): number => t * h;

  // ---- pressed-sheet seams
  for (const sx of [0.28, 0.77]) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#000000';
    ctx.fillRect(sx * w, 0, 1.3 * k, h);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = hsl(pal.h, 10, 40);
    ctx.fillRect(sx * w + 1.3 * k, 0, 0.8 * k, h);
    ctx.restore();
    if (hCtx) {
      hCtx.fillStyle = gray(70);
      hCtx.fillRect(sx * w, 0, 1.3 * k, h);
    }
  }

  // ---- bead-and-reel band: alternating round beads and narrow discs
  {
    const n = 16;
    const sp = w / n;
    const y0 = edgeY(0.225);
    const bandH = edgeY(0.35) - y0;
    const cy = y0 + bandH / 2;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.85) * sp;
      const bead = i % 2 === 0;
      const rx = bead ? sp * 0.36 : sp * 0.14;
      const ry = bead ? sp * 0.36 : bandH * 0.4;
      for (const [px] of copies(cx - rx, cy - ry, 2 * rx, 2 * ry, w, h)) {
        const ox = px + rx;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#000000';
        blob(ctx, ox + 1.5 * k, cy + 2 * k, rx, ry);
        ctx.globalAlpha = 1;
        ctx.fillStyle = hsl(pal.h, pal.s, pal.l + 7);
        blob(ctx, ox, cy, rx, ry);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = hsl(pal.h, pal.s - 4, pal.l + 26);
        blob(ctx, ox - rx * 0.3, cy - ry * 0.4, rx * 0.35, ry * 0.25);
        ctx.restore();
        if (hCtx) {
          hCtx.fillStyle = gray(bead ? 205 : 215);
          blob(hCtx, ox, cy, rx, ry);
          hCtx.fillStyle = gray(bead ? 232 : 238);
          blob(hCtx, ox - rx * 0.1, cy - ry * 0.15, rx * 0.55, ry * 0.55);
        }
      }
    }
  }

  // ---- dentils
  {
    const n = 20;
    const sp = w / n;
    const dw = sp * 0.5;
    const y0 = edgeY(0.41);
    const dh = edgeY(0.52) - y0;
    for (let i = 0; i < n; i++) {
      const dx = (i + 0.6) * sp;
      for (const [px, py] of copies(dx, y0, dw + 5 * k, dh, w, h)) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#000000';
        ctx.fillRect(px + dw, py + 2 * k, 4 * k, dh); // shadow cast on the band behind
        ctx.globalAlpha = 1;
        ctx.fillStyle = hsl(pal.h, pal.s, pal.l + 6);
        ctx.fillRect(px, py, dw, dh);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = hsl(pal.h, pal.s - 3, pal.l + 24);
        ctx.fillRect(px, py, dw, 2 * k);
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#000000';
        ctx.fillRect(px + dw - 2.5 * k, py, 2.5 * k, dh);
        ctx.restore();
        if (hCtx) {
          hCtx.fillStyle = gray(168);
          hCtx.fillRect(px, py, dw, dh);
          hCtx.fillStyle = gray(182);
          hCtx.fillRect(px + 1.5 * k, py + 1.5 * k, dw - 3 * k, dh - 3 * k);
        }
      }
    }
  }

  // ---- flutes pressed into the cove
  {
    const n = 16;
    const sp = w / n;
    const y0 = edgeY(0.67);
    const fh = edgeY(0.88) - y0;
    for (let i = 0; i < n; i++) {
      const fx = (i + 0.15) * sp;
      const fw = sp * 0.34;
      for (const [px, py] of copies(fx, y0, fw, fh, w, h)) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = hsl(pal.h, 10, 36);
        ctx.fillRect(px, py, 2 * k, fh);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#000000';
        ctx.fillRect(px + fw - 2.5 * k, py, 2.5 * k, fh);
        ctx.restore();
        if (hCtx) {
          hCtx.save();
          hCtx.globalAlpha = 0.45;
          hCtx.fillStyle = gray(190);
          hCtx.fillRect(px, py, fw, fh);
          hCtx.restore();
        }
      }
    }
  }

  // ---- rivet row on the top fillet, some weeping rust
  {
    const n = 16;
    const sp = w / n;
    const cy = edgeY(0.03);
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * sp;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#000000';
      dot(ctx, cx + k, cy + 1.2 * k, 2.4 * k);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hsl(pal.h, pal.s, pal.l + 10);
      dot(ctx, cx, cy, 2.2 * k);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = hsl(pal.h, pal.s - 4, pal.l + 28);
      dot(ctx, cx - 0.7 * k, cy - 0.7 * k, 0.8 * k);
      ctx.restore();
      if (hCtx) {
        hCtx.fillStyle = gray(210);
        dot(hCtx, cx, cy, 2.2 * k);
      }
      if (rng.chance(0.4)) {
        const len = rng.range(14, 40) * k;
        const sw = rng.range(1.6, 3.2) * k;
        const a = rng.range(0.25, 0.45);
        sootStreak(ctx, cx - sw / 2, cy + 2 * k, sw, len, a, hsl(20, 62, 28));
      }
    }
  }

  // ---- paint flaked away along every ridge, showing rust
  for (const ef of CORNICE_EDGES) {
    const ye = edgeY(ef);
    for (let i = rng.int(3, 7); i > 0; i--) {
      const rw = rng.range(6, 60) * k;
      const rh = rng.range(1.2, 3.6) * k;
      placed(rng, rng.range(0, w), ye - rh / 2, rw, rh, w, h, sq(2 * k), (r, px, py) => {
        ctx.save();
        ctx.globalAlpha = r.range(0.7, 0.95);
        ctx.fillStyle = hsl(r.range(14, 26), r.range(62, 78), r.range(24, 38));
        ctx.fillRect(px, py, rw, rh);
        for (let q = r.int(2, 4); q > 0; q--) {
          ctx.fillRect(px + r.range(0, rw), py - r.range(0.5, 1.5) * k, r.range(2, 6) * k, r.range(0.5, 1.5) * k);
          ctx.fillRect(px + r.range(0, rw), py + rh, r.range(2, 6) * k, r.range(0.5, 1.5) * k);
        }
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = hsl(10, 55, 14);
        ctx.fillRect(px + rw * 0.1, py + rh, rw * 0.8, 0.8 * k);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = hsl(30, 20, 45);
        for (let q = r.int(2, 3); q > 0; q--) ctx.fillRect(px + r.range(0, rw), py + r.range(0, rh), k, k);
        ctx.restore();
        if (hCtx) {
          hCtx.save();
          hCtx.globalAlpha = 0.5;
          hCtx.fillStyle = gray(80);
          hCtx.fillRect(px, py, rw, rh);
          hCtx.restore();
        }
        if (aux?.rough) {
          aux.rough.fillStyle = gray(238);
          aux.rough.fillRect(px, py, rw, rh);
        }
      });
    }
  }
  // flecks and curls of paint lifting beside the ridges
  const nFlecks = Math.round(220 * k * k);
  for (let i = 0; i < nFlecks; i++) {
    const ye = edgeY(rng.pick(CORNICE_EDGES)) + rng.range(-5, 5) * k;
    const s = rng.range(0.8, 2.6) * k;
    const x = rng.range(0, w);
    const roll = rng.next();
    ctx.save();
    ctx.globalAlpha = roll < 0.7 ? rng.range(0.6, 0.9) : 0.5;
    ctx.fillStyle = roll < 0.7 ? hsl(rng.range(14, 26), rng.range(60, 78), rng.range(22, 36)) : roll < 0.85 ? hsl(30, 18, 48) : hsl(pal.h, pal.s, pal.l + 14);
    for (const [px, py] of copies(x, ye, s, s, w, h)) ctx.fillRect(px, py, s, s);
    ctx.restore();
    if (hCtx && roll < 0.7) {
      hCtx.save();
      hCtx.globalAlpha = 0.4;
      hCtx.fillStyle = gray(80);
      fillW(hCtx, x, ye, s, s, w, h);
      hCtx.restore();
    }
  }
  // dusty run-off streaks and fine paint grain
  for (let i = 0; i < 6; i++) {
    const sw = rng.range(3, 12) * k;
    const len = rng.range(0.25, 0.6) * h;
    const a = rng.range(0.05, 0.09);
    placed(rng, rng.range(0, w), rng.range(0, 0.5) * h, sw, len, w, h, sq(0), (_r, px, py) => {
      sootStreak(ctx, px, py, sw, len, a, hsl(34, 12, 46));
    });
  }
  speckle(ctx, w, h, rng, Math.round(500 * k * k), ['#000000', hsl(pal.h, pal.s, pal.l + 12)], 0.8 * k, 1.8 * k, 0.25);
  if (aux) auxSpeckle(aux.height, aux.rng, 0, 0, w, h, Math.round(1500 * k * k), [100, 150], 1, 2 * k, 0.25);
};
