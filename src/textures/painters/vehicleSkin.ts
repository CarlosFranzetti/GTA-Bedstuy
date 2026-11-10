/**
 * Baked car skins (re-exported from vehicle.ts): the albedo of the procedural car bodies, one atlas per body style and trim
 * pack, painted instead of flat paint. Two layers share one canvas size so the paint colour stays a material property:
 *
 *   colour layer  opaque RGB. On paint pixels it is a SHADING multiplier (0.9 grey = clean paint, white = highlight, dark = grime,
 *                 panel gaps, window rubber); on fixed pixels (chrome, lamps, plate, decals) it is the real colour.
 *   mask layer    white = paint (the shader multiplies the paint colour in), black = fixed colour (used as is).
 *
 * carSkin.ts packs the two into one RGBA DataTexture (alpha = the mask) and SkinCarPaint mixes them in the fragment shader.
 *
 * Atlas (512 x 256 canonical; every painter coordinate scales with w / 512):
 *   left flank   0,0   256x112     right flank 256,0  256x112   (nose at the viewer's side that faces forward, text reads right)
 *   top        0,112   256x80      front      256,112 128x80     rear 384,112 128x80
 *   under      0,192   512x64
 * Flank u runs along the car, v up from the paint's lowest edge; front / rear u run across the car, v up.
 *
 * Only basic 2D calls (fillRect, arc, moveTo/lineTo, fill, stroke, save/restore). Deterministic. All decals are invented.
 */
import type { Rng } from '@/core/Rng';
import { PIXEL_FONT } from './ped';

export const SKIN_W = 512;
export const SKIN_H = 256;
/** shading value of clean paint on the colour layer (the shader divides it out so clean paint shows the exact colour) */
export const SKIN_PAINT_BASE = 0.9;

export interface SkinRect { x: number; y: number; w: number; h: number }
export const SKIN_RECTS = {
  left: { x: 0, y: 0, w: 256, h: 112 },
  right: { x: 256, y: 0, w: 256, h: 112 },
  top: { x: 0, y: 112, w: 256, h: 80 },
  front: { x: 256, y: 112, w: 128, h: 80 },
  rear: { x: 384, y: 112, w: 128, h: 80 },
  under: { x: 0, y: 192, w: 512, h: 64 },
} as const satisfies Record<string, SkinRect>;
export type SkinRegion = keyof typeof SKIN_RECTS;

/** `van` is the box truck's cab; `cargo` the Transit-type cargo van */
export type SkinStyle = 'sedan' | 'coupe' | 'suv' | 'van' | 'cargo' | 'hatch' | 'beater' | 'bus';

/** Everything the painter needs to know about the body (fractions of the paint's bounding box; length fractions run nose 0 -> tail 1). */
export interface SkinLayout {
  style: SkinStyle;
  /** metres of the paint bounding box */
  L: number; W: number; H: number;
  /** door gaps and handles (n along the length) */
  seams: number[]; handles: number[];
  /** window openings seen from the side: [n0, n1] (door glass) and the two screens */
  doorGlass: Array<[number, number]>;
  windshield: [number, number]; rearGlass: [number, number];
  /** belt line height (v) */
  belt: number;
  /** wheel arch centres (n), their v centre and radii in v and n units */
  axles: number[]; archV: number; archRV: number; archRN: number;
  /** end of the hood and start of the boot lid (n) */
  hoodEnd: number; bootStart: number;
  /** bumper band (v0, v1) */
  bumper: [number, number];
  /** lamp centres on the end faces: across fraction from the centre (0..0.5) and v */
  headLamp: { x: number; v: number }; tailLamp: { x: number; v: number };
  /** invented model badge */
  badge: string;
  /** 0 plain, 1 cream double stripe, 2 two-tone silver lower body */
  pack?: number;
}

export interface Colorway { name: string; color: string; pack: 0 | 1 | 2 }

/** Saturated GTA3-style solids, 4 per body (the pack is the trim package of that colourway). */
export const CAR_COLORWAYS: Record<SkinStyle, readonly Colorway[]> = {
  sedan: [
    { name: 'signal red', color: '#d6322a', pack: 0 },
    { name: 'harbour blue', color: '#2468c4', pack: 2 },
    { name: 'bodega white', color: '#ece8da', pack: 0 },
    { name: 'bottle green', color: '#2f9a58', pack: 0 },
  ],
  coupe: [
    { name: 'lagoon teal', color: '#16a8a0', pack: 1 },
    { name: 'plum purple', color: '#8a3aa8', pack: 0 },
    { name: 'sunset orange', color: '#e0621a', pack: 1 },
    { name: 'night black', color: '#1b1c20', pack: 0 },
  ],
  suv: [
    { name: 'navy', color: '#233a6a', pack: 0 },
    { name: 'forest green', color: '#2a7a4a', pack: 0 },
    { name: 'brick red', color: '#a8332b', pack: 0 },
    { name: 'pearl silver', color: '#b4bac0', pack: 1 },
  ],
  hatch: [
    { name: 'tangerine', color: '#e8791c', pack: 0 },
    { name: 'sky blue', color: '#3b8fd0', pack: 0 },
    { name: 'lime', color: '#8cc43a', pack: 0 },
    { name: 'candy red', color: '#c8283a', pack: 0 },
  ],
  // faded, tired paints (the rust and the odd primer panel are painted over them, see weather())
  beater: [
    { name: 'faded tan', color: '#8c7a5a', pack: 0 },
    { name: 'bleached blue', color: '#5f7a8c', pack: 0 },
    { name: 'tired maroon', color: '#7b3a34', pack: 0 },
    { name: 'dull silver', color: '#9ea09a', pack: 0 },
  ],
  cargo: [
    { name: 'trade white', color: '#ecf0f1', pack: 0 },
    { name: 'fleet blue', color: '#2a4f86', pack: 0 },
    { name: 'depot grey', color: '#8d9298', pack: 0 },
  ],
  bus: [{ name: 'transit white', color: '#f0f0ec', pack: 0 }],
  van: [
    { name: 'work white', color: '#ebebe4', pack: 0 },
    { name: 'safety orange', color: '#e0701a', pack: 1 },
    { name: 'depot blue', color: '#2f5a8a', pack: 2 },
  ],
};

/** Tint helpers on #rrggbb. */
function hex(c: string): [number, number, number] { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function h2(v: number): string { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }
export function skinMix(a: string, b: string, t: number): string {
  const x = hex(a), y = hex(b);
  return `#${h2(x[0] + (y[0] - x[0]) * t)}${h2(x[1] + (y[1] - x[1]) * t)}${h2(x[2] + (y[2] - x[2]) * t)}`;
}

const PAINT_SHADE = skinMix('#000000', '#ffffff', SKIN_PAINT_BASE);

/** Draw helper over the two layers; coordinates are canonical 512 x 256 px, `k` scales them to the actual canvas. */
class Sk {
  constructor(readonly col: CanvasRenderingContext2D, readonly mask: CanvasRenderingContext2D, readonly k: number) {}
  private fill(ctx: CanvasRenderingContext2D, c: string, a: number, f: () => void): void {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    f();
    ctx.restore();
  }
  /** shading on the colour layer only (the mask is left as it is) */
  shade(x: number, y: number, w: number, h: number, c: string, a = 1): void {
    const k = this.k;
    this.fill(this.col, c, a, () => this.col.fillRect(x * k, y * k, w * k, h * k));
  }
  /** a fixed colour (chrome, lamp, decal): colour layer = the colour, mask = black */
  solid(x: number, y: number, w: number, h: number, c: string): void {
    const k = this.k;
    this.fill(this.col, c, 1, () => this.col.fillRect(x * k, y * k, w * k, h * k));
    this.fill(this.mask, '#000000', 1, () => this.mask.fillRect(x * k, y * k, w * k, h * k));
  }
  paint(x: number, y: number, w: number, h: number): void {
    const k = this.k;
    this.fill(this.col, PAINT_SHADE, 1, () => this.col.fillRect(x * k, y * k, w * k, h * k));
    this.fill(this.mask, '#ffffff', 1, () => this.mask.fillRect(x * k, y * k, w * k, h * k));
  }
  private path(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>): void {
    const k = this.k;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * k, y * k) : ctx.lineTo(x * k, y * k)));
    ctx.closePath();
    ctx.fill();
  }
  polyShade(pts: ReadonlyArray<readonly [number, number]>, c: string, a = 1): void { this.fill(this.col, c, a, () => this.path(this.col, pts)); }
  polySolid(pts: ReadonlyArray<readonly [number, number]>, c: string): void {
    this.fill(this.col, c, 1, () => this.path(this.col, pts));
    this.fill(this.mask, '#000000', 1, () => this.path(this.mask, pts));
  }
  text(str: string, x: number, y: number, s: number, c: string): void {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = PIXEL_FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '#') this.solid(cx + q * s, y + r * s, s, s, c);
      cx += 4 * s;
    }
  }
}

/** Ellipse polygon clipped at the bottom of a rectangle (wheel arches reach below the paint edge). */
function ellipse(cx: number, cy: number, rx: number, ry: number, maxY: number, n = 20): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, Math.min(maxY, cy + Math.sin(a) * ry)]); }
  return pts;
}

/** styles whose head and tail lamps are real geometry (no painted lamp patches on the end faces) */
const GEO_LAMPS: ReadonlySet<SkinStyle> = new Set<SkinStyle>(['hatch', 'beater', 'cargo', 'bus']);

function paintFlank(s: Sk, L: SkinLayout, side: 'left' | 'right', rng: Rng): void {
  if (L.style === 'bus') { paintBusFlank(s, L, side, rng); return; }
  const r = SKIN_RECTS[side];
  const X = (n: number): number => (side === 'right' ? r.x + (1 - n) * r.w : r.x + n * r.w);
  const Y = (v: number): number => r.y + (1 - v) * r.h;
  const bottom = r.y + r.h;
  const beltY = Y(L.belt);
  const pack = L.pack ?? 0;
  // body shading: light shoulder under the glass, soft shade toward the sill
  s.shade(r.x, beltY - 4, r.w, 7, '#ffffff', 0.7);
  s.shade(r.x, beltY + 7, r.w, bottom - beltY - 7, '#000000', 0.05);
  s.shade(r.x, Y(0.5), r.w, Y(0.12) - Y(0.5), '#000000', 0.05);
  // rocker panel line and sill shade
  s.shade(r.x, Y(0.13), r.w, 1.4, '#000000', 0.55);
  s.shade(r.x, Y(0.12), r.w, 1, '#ffffff', 0.35);
  s.shade(r.x, Y(0.1), r.w, Y(0) - Y(0.1), '#000000', 0.2);
  // two-tone silver lower body (pack 2): a fixed colour band under the moulding
  if (pack === 2) {
    s.solid(r.x, Y(0.34), r.w, Y(0.1) - Y(0.34), '#9aa0a8');
    s.shade(r.x, Y(0.34), r.w, 1.5, '#000000', 0.6);
    s.shade(r.x, Y(0.3), r.w, 1, '#ffffff', 0.4);
  } else {
    // side moulding
    s.shade(r.x, Y(0.37), r.w, 2.5, '#000000', 0.22);
    s.shade(r.x, Y(0.37) + 2.5, r.w, 1, '#ffffff', 0.4);
  }
  // cream double stripe (pack 1): outlined so it reads on any paint
  if (pack === 1) {
    for (const [v, t] of [[0.56, 3.5], [0.5, 1.6]] as const) {
      s.solid(r.x + 8, Y(v) - 1, r.w - 16, t + 2, '#1a1a1a');
      s.solid(r.x + 8, Y(v), r.w - 16, t, '#f0e6c8');
    }
  }
  // chrome belt moulding under the glass
  const gl = L.doorGlass;
  if (gl.length) {
    const n0 = Math.min(...gl.map((g) => Math.min(g[0], g[1]))), n1 = Math.max(...gl.map((g) => Math.max(g[0], g[1])));
    const xa = Math.min(X(n0), X(n1)) - 3, xb = Math.max(X(n0), X(n1)) + 3;
    s.solid(xa, beltY + 1, xb - xa, 1.8, '#c9ced4');
    s.solid(xa, beltY + 2.8, xb - xa, 1, '#4a4e54');
    // window rubber: a dark band round every door glass
    for (const [a, b] of gl) {
      const x0 = Math.min(X(a), X(b)), x1 = Math.max(X(a), X(b));
      s.shade(x0 - 1.5, beltY - 1, x1 - x0 + 3, 2.8, '#000000', 0.85);
      s.shade(x0 - 2, Y(1) - 0.5, 2.5, beltY - Y(1) + 1, '#000000', 0.8);
      s.shade(x1 - 0.5, Y(1) - 0.5, 2.5, beltY - Y(1) + 1, '#000000', 0.8);
    }
  }
  // door gaps (dark line with a light edge) and handles
  const archN = Math.max(...L.axles); // the rear axle (n grows toward the tail)
  L.seams.forEach((n, idx) => {
    const x = X(n);
    const gw = Math.max(0.5, 1 / s.k); // one real pixel: 9.5 mm on the 1024 atlas, 19 mm on a 512 one
    if (L.style === 'cargo' && side === 'left' && idx === 2) return; // the sliding door is on the right only
    const last = L.seams.length >= 3 && idx === L.seams.length - 1 && L.style !== 'van' && L.style !== 'cargo' && L.style !== 'bus';
    if (!last) {
      // ~8-12 mm gap with a faint light lip; it starts at the belt, not the roof
      s.shade(Math.floor(x), beltY, gw, Y(0.13) - beltY, '#000000', 0.9);
      s.shade(Math.floor(x) + gw + 0.5, beltY, gw, Y(0.14) - beltY, '#ffffff', 0.2);
      return;
    }
    // rear door trailing edge: straight down to the top of the rear wheel arch, then round its leading curve to the sill
    const cx = X(archN), cy = Y(L.archV);
    const rx = L.archRN * r.w * 1.18, ry = L.archRV * r.h * 1.2;
    const f = side === 'right' ? 1 : -1; // toward the nose in flank pixels
    const sinA = Math.max(0.05, Math.min(0.95, ((x - cx) * f) / rx));
    const a0 = Math.asin(sinA);
    const yTop = cy - ry * Math.cos(a0);
    s.shade(Math.floor(x), beltY, gw, Math.max(1, yTop - beltY), '#000000', 0.9);
    for (let a = a0; a <= Math.PI / 2; a += 0.06) {
      s.shade(Math.floor(cx + f * rx * Math.sin(a)), cy - ry * Math.cos(a), gw, gw * 1.6, '#000000', 0.9);
    }
  });
  for (const n of L.handles) {
    const x = X(n);
    s.solid(x - 4, beltY + 7, 8, 3, '#2a2c30');
    s.solid(x - 3.4, beltY + 7.6, 6.8, 1.8, '#c5cad0');
  }
  // fuel flap on the right rear quarter
  if (side === 'right') {
    const x = X(L.bootStart - 0.03);
    s.shade(x - 4, beltY + 10, 8, 8, '#000000', 0.35);
    s.shade(x - 3, beltY + 11, 6, 6, '#ffffff', 0.18);
  }
  // wheel arches: black well, dark lip, spray above it
  for (const n of L.axles) {
    const cx = X(n), cy = Y(L.archV);
    const rx = L.archRN * r.w, ry = L.archRV * r.h;
    s.polyShade(ellipse(cx, cy - 1, rx * 1.18, ry * 1.2, bottom), '#000000', 0.38);
    s.polySolid(ellipse(cx, cy, rx * 1.02, ry * 1.02, bottom), '#101216');
    s.polyShade(ellipse(cx, cy - ry * 0.4, rx * 1.5, ry * 0.9, bottom), '#5a4a36', 0.1);
  }
  // road grime climbing the sill, in steps
  for (let i = 0; i < 8; i++) {
    const v0 = 0.2 * (1 - i / 8);
    s.shade(r.x, Y(v0), r.w, Y(0) - Y(v0), '#5e4d38', 0.06);
  }
  for (let i = 0; i < 70; i++) {
    const x = rng.range(r.x, r.x + r.w), y = rng.range(Y(0.26), bottom - 1);
    s.shade(x, y, rng.range(1, 3), rng.range(1, 2.5), rng.chance(0.5) ? '#4a3c2a' : '#7a6a52', rng.range(0.15, 0.45));
  }
  // a few nicks and rust freckles near the arches
  for (let i = 0; i < 8; i++) { const n = L.axles[i % Math.max(1, L.axles.length)] ?? 0.3; s.shade(X(n) + rng.range(-14, 14), Y(L.archV) - rng.range(8, 30), 1.5, 1.5, '#6a3a1a', 0.55); }
  // (the model badge lives on the boot lid only, see paintRear)
  if (L.style === 'cargo' && side === 'right') {
    // sliding door: upper and lower track lines, a recessed grab handle, and the rail running on to the rear quarter
    const xa = X(L.seams[1]), xb = X(L.seams[2]);
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), tail = side === 'right' ? r.x : r.x + r.w;
    s.shade(x0, Y(0.2), x1 - x0, 1, '#000000', 0.5);
    s.shade(x0, Y(0.2) + 1, x1 - x0, 0.8, '#ffffff', 0.25);
    s.shade(x0 - 1, Y(0.84), (x1 - x0) + 2, 1, '#000000', 0.45);
    s.shade(Math.min(x0, tail + 4), Y(0.2), Math.max(0, x0 - tail - 4), 1, '#000000', 0.3);
    s.solid((x0 + x1) / 2 - 9, beltY + 9, 7, 3, '#2a2c30'); s.solid((x0 + x1) / 2 - 8.4, beltY + 9.6, 5.8, 1.8, '#c5cad0');
  }
  if (L.style === 'beater') weatherFlank(s, L, side, rng);
}

/** Tired-car dressing on one flank: sun-chalked upper paint, one mismatched primer panel, rust at the arch lips, sills and door bottoms. */
function weatherFlank(s: Sk, L: SkinLayout, side: 'left' | 'right', rng: Rng): void {
  const r = SKIN_RECTS[side];
  const X = (n: number): number => (side === 'right' ? r.x + (1 - n) * r.w : r.x + n * r.w);
  const Y = (v: number): number => r.y + (1 - v) * r.h;
  const beltY = Y(L.belt);
  // chalky, sun-bleached upper body and a streaked clear coat
  s.shade(r.x, beltY, r.w, Y(0.3) - beltY, '#ffffff', 0.16);
  for (let i = 0; i < 14; i++) s.shade(rng.range(r.x, r.x + r.w - 20), rng.range(beltY, Y(0.3)), rng.range(8, 30), rng.range(2, 8), '#ffffff', rng.range(0.1, 0.22));
  // mismatched panel: the rear door on the right, the front fender on the left, in grey / green primer
  const a = side === 'right' ? L.seams[1] : 0.0, b = side === 'right' ? L.seams[2] : L.seams[0];
  const xa = Math.min(X(a), X(b)), xb = Math.max(X(a), X(b));
  const primer = side === 'right' ? '#6f7864' : '#8d8f8a';
  s.solid(xa + 1.5, beltY + 1, xb - xa - 2, Y(0.15) - beltY - 1, primer);
  s.shade(xa + 1.5, beltY + 1, xb - xa - 2, 1, '#000000', 0.0);
  for (let i = 0; i < 10; i++) s.solid(xa + rng.range(2, Math.max(3, xb - xa - 6)), rng.range(beltY + 2, Y(0.18)), rng.range(2, 5), rng.range(1, 2), rng.chance(0.5) ? '#646d59' : '#838a7a');
  // rust: freckles along the sill, arch lips and the bottom of the doors, a couple of bigger blooms
  const rust = ['#7a3d1c', '#9a5326', '#5c2d14', '#b0642a'];
  for (let i = 0; i < 90; i++) {
    const n = rng.chance(0.55) ? L.axles[i % L.axles.length] + rng.range(-0.1, 0.1) : rng.range(0.05, 0.95);
    const v = rng.chance(0.6) ? rng.range(0.02, 0.17) : rng.range(L.archV - 0.02, L.archV + 0.22);
    s.solid(X(n), Y(v), rng.range(1, 3.2), rng.range(1, 2.6), rng.pick(rust));
  }
  for (let i = 0; i < 4; i++) {
    const cx = X(L.axles[i % L.axles.length] + rng.range(-0.12, 0.12)), cy = Y(rng.range(0.05, 0.14));
    for (let k = 0; k < 14; k++) s.solid(cx + rng.range(-9, 9), cy + rng.range(-4, 4), rng.range(2, 5), rng.range(1.5, 3.5), rng.pick(rust));
  }
  // dents: soft dark smudges
  for (let i = 0; i < 3; i++) s.shade(rng.range(r.x + 10, r.x + r.w - 40), rng.range(Y(0.5), Y(0.3)), rng.range(14, 30), rng.range(5, 9), '#000000', 0.16);
}

/** Bus flank: white body, a blue and a yellow stripe under the window band, the agency name, door seams, wheel wells. */
function paintBusFlank(s: Sk, L: SkinLayout, side: 'left' | 'right', rng: Rng): void {
  const r = SKIN_RECTS[side];
  const X = (n: number): number => (side === 'right' ? r.x + (1 - n) * r.w : r.x + n * r.w);
  const Y = (v: number): number => r.y + (1 - v) * r.h;
  const bottom = r.y + r.h;
  s.shade(r.x, Y(0.5), r.w, 3, '#ffffff', 0.5);
  s.shade(r.x, Y(0.12), r.w, bottom - Y(0.12), '#000000', 0.2);
  // livery: blue band with a thin yellow line above it, then a lower grey skirt
  s.solid(r.x, Y(0.43), r.w, Y(0.3) - Y(0.43), '#1b4f93');
  s.solid(r.x, Y(0.455), r.w, Y(0.435) - Y(0.455), '#f2b705');
  s.solid(r.x, Y(0.17), r.w, Y(0.12) - Y(0.17), '#7d848c');
  s.text('BKLYN TRANSIT', side === 'right' ? X(0.27) - 52 : X(0.27), Y(0.405), 1, '#ffffff');
  // door seams (front door and middle door, curb side) and panel seams
  for (const n of L.seams) {
    const x = Math.floor(X(n));
    s.shade(x, Y(0.5), 1, Y(0.12) - Y(0.5), '#000000', side === 'right' ? 0.85 : 0.35);
  }
  for (let n = 0.1; n < 0.95; n += 0.1) s.shade(Math.floor(X(n)), Y(0.5), 1, Y(0.17) - Y(0.5), '#000000', 0.18);
  for (const n of L.axles) {
    const cx = X(n), cy = Y(L.archV);
    const rx = L.archRN * r.w, ry = L.archRV * r.h;
    s.polyShade(ellipse(cx, cy - 1, rx * 1.18, ry * 1.2, bottom), '#000000', 0.38);
    s.polySolid(ellipse(cx, cy, rx * 1.02, ry * 1.02, bottom), '#101216');
  }
  for (let i = 0; i < 8; i++) s.shade(r.x, Y(0.2 * (1 - i / 8)), r.w, Y(0) - Y(0.2 * (1 - i / 8)), '#5e4d38', 0.06);
  for (let i = 0; i < 90; i++) s.shade(rng.range(r.x, r.x + r.w), rng.range(Y(0.26), bottom - 1), rng.range(1, 3), rng.range(1, 2.5), rng.chance(0.5) ? '#4a3c2a' : '#7a6a52', rng.range(0.15, 0.4));
}

function paintTop(s: Sk, L: SkinLayout, rng: Rng): void {
  const r = SKIN_RECTS.top;
  const X = (n: number): number => r.x + n * r.w;
  const pack = L.pack ?? 0;
  s.shade(r.x, r.y + r.h * 0.36, r.w, r.h * 0.28, '#ffffff', 0.15);     // light along the crown
  s.shade(r.x, r.y, r.w, 5, '#000000', 0.2); s.shade(r.x, r.y + r.h - 5, r.w, 5, '#000000', 0.2);
  // hood and boot lid outlines
  const hx = X(L.hoodEnd), bx = X(L.bootStart);
  for (const x of [hx, bx]) { s.shade(x - 0.7, r.y + 2, 1.5, r.h - 4, '#000000', 0.7); s.shade(x + 0.8, r.y + 2, 0.8, r.h - 4, '#ffffff', 0.3); }
  for (const [x0, x1] of [[r.x + 1, hx], [bx, r.x + r.w - 1]] as const) {
    s.shade(x0, r.y + 7, x1 - x0, 1.2, '#000000', 0.45);
    s.shade(x0, r.y + r.h - 8, x1 - x0, 1.2, '#000000', 0.45);
  }
  // centre crease and vents
  s.shade(r.x + 2, r.y + r.h / 2 - 0.5, hx - r.x - 4, 1, '#ffffff', 0.35);
  if (pack === 1) {
    for (const dy of [-9, 9]) {
      s.solid(r.x + 6, r.y + r.h / 2 + dy - 3, hx - r.x - 12, 6, '#1a1a1a');
      s.solid(r.x + 6, r.y + r.h / 2 + dy - 1.8, hx - r.x - 12, 3.6, '#f0e6c8');
    }
  } else if (pack === 2) {
    for (let i = 0; i < 4; i++) s.shade(hx - 30 + i * 6, r.y + 18, 3, r.h - 36, '#000000', 0.55);
  }
  // dust on the roof
  for (let i = 0; i < 90; i++) s.shade(rng.range(r.x, r.x + r.w), rng.range(r.y, r.y + r.h), rng.range(1, 2.5), 1, rng.chance(0.5) ? '#d8d2c0' : '#8a8472', 0.22);
}

function paintEnd(s: Sk, L: SkinLayout, region: 'front' | 'rear', rng: Rng): void {
  const r = SKIN_RECTS[region];
  const Y = (v: number): number => r.y + (1 - v) * r.h;
  const cx = r.x + r.w / 2;
  const bottom = r.y + r.h;
  // body shading and the bumper band
  s.shade(r.x, r.y, r.w, 4, '#ffffff', 0.35);
  s.shade(r.x, Y(L.bumper[1]), r.w, 1.2, '#000000', 0.6);
  s.shade(r.x, Y(L.bumper[0]), r.w, 1.2, '#000000', 0.5);
  s.shade(r.x, Y(L.bumper[1]) + 1.2, r.w, Y(L.bumper[0]) - Y(L.bumper[1]), '#000000', 0.07);
  s.shade(r.x, r.y, 3, r.h, '#000000', 0.16); s.shade(r.x + r.w - 3, r.y, 3, r.h, '#000000', 0.16);
  // plate recess and the lamps
  const pv = (L.bumper[0] + L.bumper[1]) / 2;
  s.solid(cx - 14, Y(pv) - 5.5, 28, 11, '#1c2024');
  if (region === 'front') {
    // grille surround and headlamp housings (the roster bodies carry real lamp geometry instead)
    if (!GEO_LAMPS.has(L.style)) {
      s.solid(cx - 22, Y(L.headLamp.v - 0.1), 44, 10, '#14171b');
      s.solid(cx - 22, Y(L.headLamp.v - 0.1), 44, 1, '#aab0b8');
    }
    for (const sx of GEO_LAMPS.has(L.style) ? [] : [-1, 1]) {
      const lx = cx + sx * L.headLamp.x * r.w;
      s.solid(lx - 12, Y(L.headLamp.v) - 5, 24, 10, '#15181c');
      s.solid(lx - 11, Y(L.headLamp.v) - 4, 22, 1, '#9aa0a8');
      s.solid(lx - 8, Y(L.headLamp.v) - 2, 16, 4, '#d8d4b8');
    }
    s.shade(cx - 0.5, r.y + 3, 1, Y(L.bumper[1]) - r.y - 5, '#ffffff', 0.25);          // hood centre crease
    s.shade(r.x + 6, r.y + 5, r.w - 12, 1, '#000000', 0.45);                              // hood front edge
  } else {
    // tail lamp reflector strip: dark red between two lamps, a lighter bar through it
    const geo = GEO_LAMPS.has(L.style);
    if (!geo) s.solid(cx - 38, Y(L.tailLamp.v) - 6, 76, 12, '#2a0c0e');
    for (const sx of geo ? [] : [-1, 1]) {
      const lx = cx + sx * L.tailLamp.x * r.w;
      s.solid(lx - 13, Y(L.tailLamp.v) - 6, 26, 12, '#8a1a1d');
      s.solid(lx - 11, Y(L.tailLamp.v) - 4.5, 22, 3, '#c8262b');
      s.solid(lx - 11, Y(L.tailLamp.v) + 1, 22, 2, '#d8a020');
    }
    if (!geo) s.solid(cx - 38, Y(L.tailLamp.v) - 1, 76, 2, '#6a1216');
    if (L.style === 'cargo') {
      // double rear doors: centre gap, hinge lines, two small handles
      s.shade(Math.floor(cx), r.y + 6, 1, Y(0.1) - r.y - 6, '#000000', 0.9);
      s.shade(r.x + 8, r.y + 6, 1, Y(0.1) - r.y - 6, '#000000', 0.6); s.shade(r.x + r.w - 9, r.y + 6, 1, Y(0.1) - r.y - 6, '#000000', 0.6);
      for (const dx of [-5, 4]) s.solid(cx + dx, Y(0.45), 2, 7, '#2a2c30');
    } else if (L.style !== 'hatch' && L.style !== 'bus') s.shade(r.x + 6, r.y + 7, r.w - 12, 1, '#000000', 0.5);  // boot lid seam
    s.text(L.badge, cx - L.badge.length * 2, Y(L.tailLamp.v) - 18, 1, '#d7dbe0');
    if (L.style !== 'bus' && L.style !== 'cargo') { s.solid(cx + 30, bottom - 9, 7, 4, '#2b2d31'); s.solid(cx + 31, bottom - 8, 5, 2, '#6a6e74'); } // exhaust
  }
  if (L.style === 'bus') { s.solid(r.x, Y(0.36), r.w, Y(0.2) - Y(0.36), '#1b4f93'); s.solid(r.x, Y(0.385), r.w, 2, '#f2b705'); if (region === 'rear') s.text('B26', cx - 6, Y(0.8), 1, '#ffffff'); }
  // grime on the valance
  for (let i = 0; i < 6; i++) s.shade(r.x, bottom - 14 + i * 2.4, r.w, 14 - i * 2.4, '#5e4d38', 0.07);
  for (let i = 0; i < 40; i++) s.shade(rng.range(r.x, r.x + r.w), rng.range(bottom - 16, bottom - 1), rng.range(1, 3), 1.5, '#4a3c2a', 0.35);
}

/**
 * Paint a whole skin. `col` and `mask` are two canvases of the same size (w x h, canonical 512 x 256 scaled by w / 512). The
 * layout carries the body's measurements; the `pack` is read from `layout.pack`.
 */
export function paintCarSkin(col: CanvasRenderingContext2D, mask: CanvasRenderingContext2D, w: number, _h: number, rng: Rng, layout: SkinLayout): void {
  void _h;
  const k = w / SKIN_W;
  const s = new Sk(col, mask, k);
  // everything starts as clean paint; the under region is plain dark road grime
  s.paint(0, 0, SKIN_W, 192);
  s.solid(0, 192, SKIN_W, 64, '#25221e');
  for (let i = 0; i < 80; i++) s.solid(rng.range(0, 510), rng.range(194, 254), rng.range(2, 6), rng.range(1, 3), rng.chance(0.5) ? '#3a342c' : '#171512');
  paintFlank(s, layout, 'left', rng);
  paintFlank(s, layout, 'right', rng);
  paintTop(s, layout, rng);
  paintEnd(s, layout, 'front', rng);
  paintEnd(s, layout, 'rear', rng);
  if (layout.style === 'beater') weatherEnds(s, layout, rng);
}

/** Beater roof / hood / boot: chalky clear-coat failure in patches, rust bubbling at the panel edges and on the bumpers. */
function weatherEnds(s: Sk, L: SkinLayout, rng: Rng): void {
  const t = SKIN_RECTS.top;
  s.shade(t.x, t.y, t.w, t.h, '#ffffff', 0.2);
  for (let i = 0; i < 16; i++) s.shade(rng.range(t.x, t.x + t.w - 30), rng.range(t.y + 4, t.y + t.h - 14), rng.range(14, 50), rng.range(8, 22), '#ffffff', rng.range(0.15, 0.3));
  const rust = ['#7a3d1c', '#9a5326', '#5c2d14', '#b0642a'];
  for (let i = 0; i < 40; i++) {
    const edge = rng.chance(0.5);
    s.solid(rng.range(t.x + 2, t.x + t.w - 3), edge ? t.y + rng.range(2, 8) : t.y + t.h - rng.range(2, 8), rng.range(1, 3), rng.range(1, 2.2), rng.pick(rust));
  }
  for (const reg of ['front', 'rear'] as const) {
    const r = SKIN_RECTS[reg];
    for (let i = 0; i < 30; i++) s.solid(rng.range(r.x + 3, r.x + r.w - 3), r.y + r.h - rng.range(2, 26), rng.range(1, 3.2), rng.range(1, 2.4), rng.pick(rust));
    s.shade(r.x, r.y, r.w, r.h * 0.5, '#ffffff', 0.14);
  }
  void L;
}
