/**
 * Realistic (GTA4-style) people: painted albedo + height (for the normal map) + roughness, one set per variant, drawn on 512 px
 * canvases (canonical coordinates; every call scales with size / 512, so a 1024 player or a 256 phone atlas is the same drawing).
 * The variants are the PED_SPECS of ped.ts. Only basic 2D calls (fillRect, arc, moveTo/lineTo/quadraticCurveTo, fill, stroke,
 * save/restore, globalAlpha); deterministic. All art is invented.
 *
 * Atlas (canonical 512 x 512), cylindrical tiles wrap u around the part with the FRONT at u = 0.5 (the middle of the tile):
 *   head 0,0 256x256 (planar front view)   hair 256,0 128x128   hat 384,0 128x128
 *   torso 256,128 256x128 (shirt, hem at the bottom)
 *   upper arm 0,256 128x128   forearm 128,256 128x128   hand 256,256 128x64   neck 384,256 128x64
 *   thigh 0,384   shin 128,384   pelvis / skirt 256,384   shoe 384,384 (all 128x128; the sole is the bottom 22 % of the shoe)
 */
import type { Rng } from '@/core/Rng';
import { peopleMode } from './pedMode';
import { PED_SPECS, mixHex, type PedSpec, type PxRect } from './ped';

export const PEDHI_ATLAS = 512;
export type HiTile = 'gear' | 'head' | 'hair' | 'hat' | 'torso' | 'upperArm' | 'foreArm' | 'hand' | 'neck' | 'thigh' | 'shin' | 'pelvis' | 'shoe';
export const HI_RECTS: Record<HiTile, PxRect> = {
  gear: { x: 256, y: 320, w: 256, h: 64 },
  head: { x: 0, y: 0, w: 256, h: 256 }, hair: { x: 256, y: 0, w: 128, h: 128 }, hat: { x: 384, y: 0, w: 128, h: 128 },
  torso: { x: 256, y: 128, w: 256, h: 128 },
  upperArm: { x: 0, y: 256, w: 128, h: 128 }, foreArm: { x: 128, y: 256, w: 128, h: 128 }, hand: { x: 256, y: 256, w: 128, h: 64 }, neck: { x: 384, y: 256, w: 128, h: 64 },
  thigh: { x: 0, y: 384, w: 128, h: 128 }, shin: { x: 128, y: 384, w: 128, h: 128 }, pelvis: { x: 256, y: 384, w: 128, h: 128 }, shoe: { x: 384, y: 384, w: 128, h: 128 },
};
/** head tile: half width of the head in metres that spans the tile, chin and crown heights (bind pose), see pedBodyHi */
export const HEAD_MAP = { halfW: 0.09, yMin: 1.52, yMax: 1.775 };

const dk = (c: string, t: number): string => mixHex(c, '#000000', t);
const lt = (c: string, t: number): string => mixHex(c, '#ffffff', t);

/** Three layers drawn at once: albedo colour, height (grey, 128 = flat) and roughness (grey, 255 = rough). */
class L {
  constructor(readonly a: CanvasRenderingContext2D, readonly h: CanvasRenderingContext2D | null, readonly r: CanvasRenderingContext2D | null, readonly k: number, readonly ox = 0, readonly oy = 0, readonly bw = Infinity, readonly bh = Infinity, readonly sy = 1, readonly yo = 0) {}
  /** a tile; (sy, yo) maps the painter's design rows onto the tile's rows (row = y * sy + yo): the garment painters are drawn in a design space and fitted to where the body's UV puts the garment */
  get raw(): L { return new L(this.a, this.h, this.r, this.k, this.ox, this.oy, this.bw, this.bh); }
  at(r: PxRect, sy = 1, yo = 0): L { return new L(this.a, this.h, this.r, this.k, r.x, r.y, r.w, r.h, sy, yo); }
  private fill(ctx: CanvasRenderingContext2D | null, c: string, al: number, f: (k: number) => void): void {
    if (!ctx) return;
    ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = c; ctx.strokeStyle = c; f(this.k); ctx.restore();
  }
  rect(x: number, y: number, w: number, h: number, c: string, al = 1, hv?: number, rv?: number): void {
    y = y * this.sy + this.yo; h *= this.sy;
    // clipped to the tile: nothing a painter draws may leak into a neighbouring tile
    const x1 = Math.min(this.bw, x + w), y1 = Math.min(this.bh, y + h); x = Math.max(0, x); y = Math.max(0, y); w = x1 - x; h = y1 - y;
    if (w <= 0 || h <= 0) return;
    const k = this.k, X = (this.ox + x) * k, Y = (this.oy + y) * k;
    this.fill(this.a, c, al, () => this.a.fillRect(X, Y, w * k, h * k));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => this.h!.fillRect(X, Y, w * k, h * k));
    if (rv !== undefined) this.fill(this.r, gray(rv), al, () => this.r!.fillRect(X, Y, w * k, h * k));
  }
  /** polygon clipped to the tile (Sutherland-Hodgman) */
  private clipPoly(pts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
    let out = pts.map((p) => [p[0], p[1]] as [number, number]);
    if (!Number.isFinite(this.bw)) return out;
    const fs: Array<(p: [number, number]) => number> = [(p) => p[0], (p) => this.bw - p[0], (p) => p[1], (p) => this.bh - p[1]];
    for (const f of fs) {
      const inp = out; out = [];
      for (let i = 0; i < inp.length; i++) {
        const A = inp[i], B = inp[(i + 1) % inp.length], fa = f(A), fb = f(B);
        if (fa >= 0) out.push(A);
        if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
    }
    return out;
  }
  poly(pts: ReadonlyArray<readonly [number, number]>, c: string, al = 1, hv?: number, rv?: number): void {
    const k = this.k, q = this.clipPoly(pts.map(([x, y]) => [x, y * this.sy + this.yo] as const));
    if (q.length < 3) return;
    const path = (ctx: CanvasRenderingContext2D): void => { ctx.beginPath(); q.forEach(([x, y], i) => (i === 0 ? ctx.moveTo((this.ox + x) * k, (this.oy + y) * k) : ctx.lineTo((this.ox + x) * k, (this.oy + y) * k))); ctx.closePath(); ctx.fill(); };
    this.fill(this.a, c, al, () => path(this.a));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => path(this.h!));
    if (rv !== undefined) this.fill(this.r, gray(rv), al, () => path(this.r!));
  }
  disc(x: number, y: number, r: number, c: string, al = 1, hv?: number): void {
    y = y * this.sy + this.yo;
    const k = this.k;
    const path = (ctx: CanvasRenderingContext2D): void => { ctx.beginPath(); ctx.arc((this.ox + x) * k, (this.oy + y) * k, r * k, 0, Math.PI * 2); ctx.fill(); };
    this.fill(this.a, c, al, () => path(this.a));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => path(this.h!));
  }
  /** a soft blob: stacked translucent discs */
  soft(x: number, y: number, r: number, c: string, al: number, steps = 5): void {
    for (let i = 0; i < steps; i++) this.disc(x, y, r * (1 - i / steps), c, al / steps);
  }
  /** line segment clipped to the tile (Liang-Barsky) */
  line(x0: number, y0: number, x1: number, y1: number, c: string, w = 1, al = 1, hv?: number): void {
    y0 = y0 * this.sy + this.yo; y1 = y1 * this.sy + this.yo;
    if (Number.isFinite(this.bw)) {
      let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
      for (const [p, q] of [[-dx, x0], [dx, this.bw - x0], [-dy, y0], [dy, this.bh - y0]] as const) {
        if (p === 0) { if (q < 0) return; continue; }
        const r = q / p; if (p < 0) { if (r > t1) return; if (r > t0) t0 = r; } else { if (r < t0) return; if (r < t1) t1 = r; }
      }
      [x0, y0, x1, y1] = [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
    }
    const k = this.k;
    const path = (ctx: CanvasRenderingContext2D): void => { ctx.lineWidth = w * k; ctx.beginPath(); ctx.moveTo((this.ox + x0) * k, (this.oy + y0) * k); ctx.lineTo((this.ox + x1) * k, (this.oy + y1) * k); ctx.stroke(); };
    this.fill(this.a, c, al, () => path(this.a));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => path(this.h!));
  }
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, c: string, w = 1, al = 1): void {
    y0 = y0 * this.sy + this.yo; cy = cy * this.sy + this.yo; y1 = y1 * this.sy + this.yo;
    const k = this.k;
    this.fill(this.a, c, al, () => { this.a.lineWidth = w * k; this.a.beginPath(); this.a.moveTo((this.ox + x0) * k, (this.oy + y0) * k); this.a.quadraticCurveTo((this.ox + cx) * k, (this.oy + cy) * k, (this.ox + x1) * k, (this.oy + y1) * k); this.a.stroke(); });
  }
  noise(w: number, h: number, rng: Rng, n: number, cols: readonly string[], al: number, sz = 1): void {
    for (let i = 0; i < n; i++) this.rect(rng.range(0, w), rng.range(0, h), sz, sz, cols[Math.floor(rng.next() * cols.length)], al);
  }
}
const gray = (v: number): string => { const h = Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return `#${h}${h}${h}`; };

// ---------------------------------------------------------------- face

const hashStr = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** iris colour: mostly brown, a spread of hazel / green / blue / grey where the group makes them plausible; deterministic per person */
function irisColor(s: PedSpec): string {
  const r = hashStr(s.id + ':iris'), g = s.group ?? 'wh';
  if (g === 'wh' || g === 'hj') return r < 0.3 ? '#4a3220' : r < 0.55 ? '#3f6f9a' : r < 0.72 ? '#5b7f4e' : r < 0.88 ? '#7a5a2e' : '#6f7f88';
  if (g === 'me' || g === 'la' || g === 'mx') return r < 0.72 ? '#43291a' : r < 0.9 ? '#7a5a2e' : '#5b7f4e';
  return r < 0.9 ? '#2e1c12' : '#43291a';
}

function paintHead(t: L, s: PedSpec, rng: Rng): void {
  const f = s.face, W = 256;
  const X = (m: number): number => 128 + (m / HEAD_MAP.halfW) * 128;
  const Y = (m: number): number => (1 - (m - HEAD_MAP.yMin) / (HEAD_MAP.yMax - HEAD_MAP.yMin)) * 256;
  const skin = s.skin, age = s.age ?? 'adult', fem = s.sex === 'f', old = age === 'old';
  const shade = (x: number, y: number, r: number, c: string, al: number): void => t.soft(x, y, r, c, al, 12);
  t.rect(0, 0, W, W, skin, 1, 128, 140);
  // smooth tone: a cool/warm gradient from forehead to chin, darker at the sides and under the jaw, light on forehead, cheek bones, nose bridge
  const light = parseInt(skin.slice(1, 3), 16) > 190, side = light ? '#7a3a2a' : '#000000';   // black at low alpha keeps the hue: darkening the saturated tone itself turns dark skin maroon
  for (let i = 0; i < 26; i++) { const a = light ? 0.006 : 0.0075, w = 54 - i * 2; t.rect(0, 0, w, W, side, a); t.rect(W - w, 0, w, W, side, a); }
  for (let i = 0; i < 40; i++) t.rect(0, Y(1.57) + i * 1.6, W, 256, side, 0.007);
  shade(128, Y(1.73), 80, lt(skin, 0.3), 0.16);
  for (const sx of [-1, 1]) {
    shade(X(sx * 0.054), Y(1.62), 34, lt(skin, 0.18), 0.12);                                                    // cheekbone light
    shade(X(sx * 0.07), Y(1.6), 30, side, 0.05);                                                        // hollow under it
    shade(X(sx * 0.046), Y(1.595), 28, mixHex(skin, '#c4605a', 0.55), fem ? 0.18 : 0.1);                       // warm cheek, makeup blush on some faces
    shade(X(sx * 0.028), Y(1.545), 22, side, 0.04);                                                    // jaw line
  }
  shade(128, Y(1.628), 14, mixHex(skin, '#c4605a', 0.5), 0.12);                                                 // nose tip warmth
  // pores and fine grain, freckles on some
  t.noise(W, W, rng, 900, [dk(skin, 0.2), lt(skin, 0.14)], 0.1, 1);
  if (hashStr(s.id + ':frk') < 0.18 && (s.group === 'wh' || s.group === 'hj' || s.group === 'la')) for (let i = 0; i < 70; i++) shade(X(rng.range(-0.05, 0.05)), Y(rng.range(1.61, 1.645)), rng.range(0.8, 1.7), mixHex(skin, '#6a3a20', 0.6), 0.3);
  // hairline: the hair shell covers the top; this keeps a feathered edge under caps and for fades
  if (s.hair !== 'bald') {
    const hl = Y(1.738);
    t.rect(0, 0, W, hl - 8, s.hairColor, 1, 150);
    for (let i = 0; i < 12; i++) t.rect(0, hl - 8 + i, W, 1, s.hairColor, 0.9 - i * 0.075);
    for (let i = 0; i < 160; i++) t.line(rng.range(20, 236), hl - 6 + rng.range(0, 8), rng.range(20, 236), hl - 2 + rng.range(2, 10), s.hairColor, 0.8, 0.5);
  }
  // eye sockets, lids and eyes
  const ey = Y(1.664), iris = irisColor(s), shadow = fem && hashStr(s.id + ':mk') < 0.55 ? mixHex(skin, hashStr(s.id + ':mk2') < 0.5 ? '#7a5a7a' : '#8a6a4a', 0.55) : dk(skin, 0.35);
  for (const sx of [-1, 1]) {
    const cx = X(sx * 0.034);
    shade(cx, ey - 1, 34, dk(skin, 0.4), 0.14);                                                                 // socket
    shade(cx, ey - 7, 22, shadow, fem ? 0.26 : 0.1);                                                            // lid colour
    const ew = f.eyes === 'wide' ? 16 : 14.5, eh = f.eyes === 'sleepy' ? 3.8 : f.eyes === 'wide' ? 5.6 : 4.6;
    const eye = [[cx - ew, ey + 0.5], [cx - ew * 0.55, ey - eh * 0.85], [cx, ey - eh], [cx + ew * 0.55, ey - eh * 0.85], [cx + ew, ey + 0.5], [cx + ew * 0.55, ey + eh * 0.65], [cx, ey + eh * 0.75], [cx - ew * 0.55, ey + eh * 0.65]] as Array<[number, number]>;
    t.poly(eye, dk('#e4dfd8', 0.12));
    t.poly(eye.map(([x, y]) => [cx + (x - cx) * 0.98, y + 0.5] as [number, number]), '#e9e4dc', 0.9);
    for (const k of [0.34, 0.42]) t.rect(cx - ew, ey - eh, ew * 2, eh * k, '#000000', 0.07);                         // upper lid shadow on the white
    t.rect(cx + (sx > 0 ? ew * 0.45 : -ew), ey - eh * 0.4, ew * 0.55, eh * 1.2, '#d86a62', 0.06);                  // caruncle side
    const ix = cx - sx * 0.8, ir = eh * 0.9;
    t.disc(ix, ey - 0.3, ir, dk(iris, 0.55));                                                                   // limbal ring
    t.disc(ix, ey - 0.3, ir * 0.86, iris);
    t.disc(ix, ey + 0.8, ir * 0.62, lt(iris, 0.28), 0.5);                                                        // lighter lower iris
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; t.line(ix + Math.cos(a) * ir * 0.35, ey - 0.3 + Math.sin(a) * ir * 0.35, ix + Math.cos(a) * ir * 0.8, ey - 0.3 + Math.sin(a) * ir * 0.8, dk(iris, 0.4), 0.7, 0.35); }
    t.disc(ix, ey - 0.3, ir * 0.42, '#0c0806');                                                                  // pupil
    t.disc(ix + 1.2, ey - 1.4, 0.8, '#ffffff', 0.9);                  // specular
    t.poly([[cx - ew - 1, ey + 1], [cx - ew * 0.55, ey - eh * 0.9], [cx, ey - eh - 1.2], [cx + ew * 0.55, ey - eh * 0.9], [cx + ew + 1, ey + 1], [cx + ew * 0.55, ey - eh * 0.15], [cx, ey - eh * 0.3], [cx - ew * 0.55, ey - eh * 0.15]], skin, 0.95);   // upper lid over the eye
    t.curve(cx - ew, ey + 0.5, cx, ey - eh * 2 - 1, cx + ew, ey + 0.5, dk(s.hairColor, 0.3), 1.1, 0.55);                    // lash line
    if (f.lashes || fem) t.curve(cx - ew, ey - 0.5, cx, ey - eh * 2 - 1.5, cx + ew, ey - 0.5, '#1c1210', 1.5, 0.55);
    t.curve(cx - ew * 0.9, ey + 2.5, cx, ey + eh * 0.9 + 1, cx + ew * 0.9, ey + 2.5, dk(skin, 0.4), 1.2, 0.4);   // lower lid
    t.curve(cx - ew * 0.9, ey - eh * 1.9, cx, ey - eh * 2.7, cx + ew * 0.9, ey - eh * 1.9, dk(skin, 0.5), 1.2, 0.3);  // lid crease
    if (old) { for (let i = 0; i < 3; i++) t.line(cx + sx * (ew + 2), ey - 2 + i * 3.5, cx + sx * (ew + 12), ey - 5 + i * 6, dk(skin, 0.5), 0.9, 0.3); t.soft(cx, ey + 8, 14, dk(skin, 0.4), 0.14, 6); }
    // brows: tapered strokes, thicker towards the nose
    const arch = f.brows === 'arched', by = Y(1.682) - (arch ? 3 : 0), bw = f.brows === 'thin' ? 2.6 : f.brows === 'thick' ? 6 : 4.2;
    const bc = mixHex(s.hair === 'bald' ? '#2a1e16' : dk(s.hairColor, 0.1), skin, old ? 0.45 : 0.22);
    for (let i = 0; i < 38; i++) {
      const u = i / 37, x = cx - sx * 0 + (-22 + u * 44) * 1, rise = arch ? -Math.sin(u * Math.PI) * 6 - 0 : -u * 3 * sx * -1 * 0 - Math.sin(u * Math.PI) * 2.5;
      const thick = bw * (1 - Math.pow(Math.abs(u - (sx < 0 ? 0.75 : 0.25)) * 1.2, 2) * 0.7);
      const yy = by + rise + (sx < 0 ? u * 2.2 - 1.1 : (1 - u) * 2.2 - 1.1) * (arch ? 0 : 1) + rng.range(-0.6, 0.6);
      t.line(x, yy + thick / 2, x + 2.4 * sx * -1, yy - thick / 2, bc, 1.1, 0.34);
    }
    if (f.glasses) { const gc = f.glasses; for (const [a, b, c2, d] of [[-27, -15, 27, -15], [-27, 15, 27, 15], [-27, -15, -27, 15], [27, -15, 27, 15]]) t.line(cx + a, ey + b, cx + c2, ey + d, gc, 2.2); t.rect(cx - 26, ey - 14, 52, 28, '#cfe3ee', 0.12); t.line(cx - 22, ey - 12, cx - 8, ey + 4, '#ffffff', 1.6, 0.25); }
  }
  if (f.glasses) t.line(X(-0.01), ey - 6, X(0.01), ey - 6, f.glasses, 2.2);
  // nose: bridge light, shaded side planes, alar creases, nostrils, tip
  t.rect(X(-0.004), Y(1.69), 8, Y(1.63) - Y(1.69), lt(skin, 0.3), 0.28);
  for (const sx of [-1, 1]) {
    t.poly([[X(sx * 0.026), Y(1.628)], [X(sx * 0.008), Y(1.678)], [X(sx * 0.013), Y(1.634)]], dk(skin, 0.3), 0.12);
    shade(X(sx * 0.014), Y(1.627), 5.5, '#2a120e', 0.5);
    t.curve(X(sx * 0.018), Y(1.634), X(sx * 0.03), Y(1.628), X(sx * 0.024), Y(1.619), dk(skin, 0.45), 1.3, 0.35);
    t.curve(X(sx * 0.03), Y(1.612), X(sx * 0.036), Y(1.59), X(sx * 0.034), Y(1.572), dk(skin, 0.4), old ? 1.8 : 1.1, old ? 0.34 : 0.14);   // nasolabial fold
  }
  shade(128, Y(1.628), 9, lt(skin, 0.4), 0.22);
  // mouth: shaded upper lip, fuller lower lip with a highlight, corners, philtrum
  const my = Y(1.585), lipc = f.lips ?? mixHex(skin, rng.chance(0.5) ? '#8a3a3a' : '#9a4a4a', 0.38 + rng.range(-0.08, 0.14));
  const grin = f.mouth === 'grin' ? 9 : f.mouth === 'smile' ? 5 : f.mouth === 'frown' ? -5 : 0;
  shade(128, my - 12, 12, dk(skin, 0.3), 0.09);                                                                  // philtrum
  t.poly([[X(-0.027), my + grin * 0.2], [X(-0.012), my - 8], [X(-0.004), my - 6.5], [128, my - 5], [X(0.004), my - 6.5], [X(0.012), my - 8], [X(0.027), my + grin * 0.2], [128, my + 1]], dk(lipc, 0.14));
  t.poly([[X(-0.027), my + grin * 0.2], [128, my + 1], [X(0.027), my + grin * 0.2], [X(0.018), my + 11], [X(0.008), my + 14], [128, my + 14.5], [X(-0.008), my + 14], [X(-0.018), my + 11]], lipc);
  shade(128, my + 8, 9, lt(lipc, 0.5), 0.3);
  t.curve(X(-0.028), my + grin * 0.2, 128, my + 2 - grin * 0.4, X(0.028), my + grin * 0.2, '#2a1210', 1.7, 0.75);
  if (f.mouth === 'grin') { t.rect(X(-0.02), my + 0.5, 40, 5, '#efe9e2', 0.9); t.rect(X(-0.02), my + 0.5, 40, 1.4, '#000000', 0.15); }
  shade(128, my + 21, 12, dk(skin, 0.4), 0.14);                                                                  // under the lip
  for (const sx of [-1, 1]) shade(X(sx * 0.03), my + grin * 0.2, 4, dk(skin, 0.5), 0.2);                         // mouth corners
  if (old) for (let i = 0; i < 4; i++) t.line(X(-0.05), Y(1.742) + i * 4.5, X(0.05), Y(1.742) + i * 4.5 + rng.range(-1, 1), dk(skin, 0.45), 1.1, 0.16);   // forehead lines
  if (age === 'adult' && hashStr(s.id + ':ln') < 0.5) t.line(X(-0.012), Y(1.7), X(-0.012), Y(1.712), dk(skin, 0.4), 1, 0.16);
  const hairc = s.hair === 'bald' ? '#241a14' : dk(s.hairColor, 0.12);
  if (f.mustache) for (let i = 0; i < 120; i++) { const x = rng.range(-0.034, 0.034); t.line(X(x), my - rng.range(6, 15), X(x * 1.1 + rng.range(-0.004, 0.004)), my - rng.range(1, 8), hairc, 1.2, 0.55); }
  // stubble: a shadow that fades out upwards from the jaw, chin and upper lip, plus single hairs
  if (f.stubble) {
    for (let i = 0; i < 16; i++) { const y0 = Y(1.536) - 6 + i * 4.4; t.rect(X(-0.07) + i * 1.2, y0, 2 * (X(0.07) - X(-0.07) - i * 2.4) / 2, 4.4, '#000000', 0.006 + 0.008 * (1 - i / 16)); }
    for (let i = 0; i < 1100; i++) { const x = rng.range(-0.075, 0.075), y = rng.range(1.53, 1.618), fall = (y - 1.53) / 0.088; if (rng.next() < fall * 0.85) continue; t.rect(X(x), Y(y), 1.1, 1.8, hairc, 0.4); }
  }
  // beard: feathered, three layers (soft fill, lighter edge, strands), the lips and a skin gap stay clear
  if (f.beard) {
    const bc = s.hair === 'bald' ? '#241a14' : s.hairColor;
    const outline = (k: number): Array<[number, number]> => [[X(-0.083 * k), Y(1.645)], [X(-0.074 * k), Y(1.585)], [X(-0.042 * k), Y(1.53 - (k - 1) * 0.1)], [X(0.042 * k), Y(1.53 - (k - 1) * 0.1)], [X(0.074 * k), Y(1.585)], [X(0.083 * k), Y(1.645)], [X(0.062 * k), Y(1.572)], [X(0.032), my + 19], [X(-0.032), my + 19], [X(-0.062 * k), Y(1.572)]];
    for (const [k, a] of [[1.06, 0.22], [1.03, 0.3], [1, 0.38]] as const) t.poly(outline(k), bc, a);
    for (let i = 0; i < 700; i++) { const x = rng.range(-0.08, 0.08), y = rng.range(1.535, 1.64), e = Math.abs(x) / 0.08; if (y > 1.6 && e < 0.45) continue; if (y > 1.572 && Math.abs(x) < 0.03) continue; t.line(X(x), Y(y), X(x * 1.01), Y(y) + rng.range(2, 4.5), rng.chance(0.2) ? lt(bc, 0.25) : bc, 1.1, 0.35); }
    t.poly([[X(-0.027), my - 2], [X(0.027), my - 2], [X(0.021), my + 14], [X(-0.021), my + 14]], lipc, 0.95);
    t.rect(X(-0.026), my - 2, X(0.026) - X(-0.026), 2, '#2a1210', 0.4);
  }
  // surgical mask: pleated, over nose and mouth, ear loops to the sides
  if (f.mask) {
    const mc = '#cfe0ea';
    t.poly([[X(-0.066), Y(1.608)], [X(-0.03), Y(1.646)], [X(0.03), Y(1.646)], [X(0.066), Y(1.608)], [X(0.07), Y(1.566)], [X(0.04), Y(1.52)], [X(-0.04), Y(1.52)], [X(-0.07), Y(1.566)]], mc, 0.97, 138, 235);
    for (let i = 1; i < 5; i++) { const yy = Y(1.64) + i * ((Y(1.527) - Y(1.64)) / 5); t.line(X(-0.066), yy, X(0.066), yy + 1.5, dk(mc, 0.22), 1.4, 0.55, 110); t.line(X(-0.066), yy + 2, X(0.066), yy + 3.5, '#ffffff', 1, 0.5, 150); }
    t.line(X(-0.066), Y(1.608), X(-0.086), Y(1.6), '#e8eef2', 1.2, 0.9); t.line(X(0.066), Y(1.608), X(0.086), Y(1.6), '#e8eef2', 1.2, 0.9);
    t.line(X(-0.03), Y(1.646), X(0.03), Y(1.646), '#8aa0b0', 1.6, 0.8, 120);
  }
  // the outer columns of the planar map are stretched over the sides and back of the head: plain slightly darker skin (no ear colour there)
  t.rect(0, 0, 4, W, dk(skin, 0.12), 1, 128, 150); t.rect(W - 4, 0, 4, W, dk(skin, 0.12), 1, 128, 150);
  if (s.hair !== 'bald') { t.rect(0, 0, 4, Y(1.69), s.hairColor); t.rect(W - 4, 0, 4, Y(1.69), s.hairColor); }
  // earrings / studs
}

function folds(t: L, w: number, h: number, c: string, rng: Rng, n: number): void {
  for (let i = 0; i < n; i++) { const x = rng.range(0, w), y = rng.range(0, h - 20); const len = rng.range(14, 34); t.line(x, y, x + rng.range(-6, 6), y + len, dk(c, 0.5), rng.range(1.5, 3.5), 0.22, 100); t.line(x + 2, y, x + 2 + rng.range(-5, 5), y + len, lt(c, 0.25), 1.5, 0.15, 150); }
}
// ---------------------------------------------------------------- cloth kit
// Real clothes read as real through a handful of cues: believable fabric (weave / rib / twill), seams with top-stitching, hems and cuffs that
// differ from the body, pockets with flaps, closures (zips, buttons), creases where the body bends, a little dirt at the hem. No lettering.

type Fab = 'knit' | 'jersey' | 'denim' | 'canvas' | 'nylon' | 'wool' | 'fleece' | 'leather' | 'poplin' | 'satin';
/** roughness (255 = rough). Cloth stays >= 170 so the shader's cloth mask (rough > 0.62) finds it; leather and satin are glossier and get no fabric micro-normal. */
const FAB_ROUGH: Record<Fab, number> = { knit: 246, jersey: 236, denim: 230, canvas: 242, nylon: 178, wool: 242, fleece: 250, leather: 112, poplin: 226, satin: 108 };

function speck(t: L, x: number, y: number, w: number, h: number, c: string, rng: Rng, n: number, al = 0.3): void {
  for (let i = 0; i < n; i++) t.rect(x + rng.range(0, w), y + rng.range(0, h), rng.range(0.8, 1.8), rng.range(0.8, 1.6), rng.chance(0.5) ? lt(c, 0.3) : dk(c, 0.3), al);
}
/** base fill of a fabric with its weave in colour, height and roughness */
function fabric(t: L, x: number, y: number, w: number, h: number, c: string, fab: Fab, rng: Rng): void {
  t.rect(x, y, w, h, c, 1, 128, FAB_ROUGH[fab]);
  switch (fab) {
    case 'knit': for (let i = 0; i < w; i += 3) { t.rect(x + i, y, 1.2, h, dk(c, 0.2), 0.3, 110); t.rect(x + i + 1.5, y, 1, h, lt(c, 0.1), 0.2, 146); } speck(t, x, y, w, h, c, rng, Math.round(w * h / 90), 0.22); break;
    case 'jersey': for (let i = 0; i < w; i += 2) t.rect(x + i, y, 0.7, h, dk(c, 0.1), 0.16, 120); speck(t, x, y, w, h, c, rng, Math.round(w * h / 160), 0.12); break;
    case 'denim': {
      for (let i = 0; i < w; i += 2) t.rect(x + i, y, 0.8, h, rng.chance(0.5) ? dk(c, 0.2) : lt(c, 0.12), 0.14, 124);      // warp streaks
      for (let i = -h; i < w; i += 4) t.line(x + i, y + h, x + i + h * 0.55, y, lt(c, 0.12), 0.8, 0.1, 140);              // twill diagonal
      speck(t, x, y, w, h, c, rng, Math.round(w * h / 70), 0.22);
      break;
    }
    case 'canvas': for (let i = 0; i < w; i += 3) t.rect(x + i, y, 0.8, h, dk(c, 0.2), 0.14, 118); for (let j = 0; j < h; j += 3) t.rect(x, y + j, w, 0.8, lt(c, 0.1), 0.12, 140); speck(t, x, y, w, h, c, rng, Math.round(w * h / 40), 0.3); break;
    case 'nylon': for (let i = 0; i < w; i += 9) t.rect(x + i, y, 0.7, h, dk(c, 0.2), 0.08, 120); for (let j = 0; j < h; j += 9) t.rect(x, y + j, w, 0.7, dk(c, 0.2), 0.08, 120); break;
    case 'wool': for (let j = 0; j < h; j += 2) t.rect(x, y + j, w, 0.7, dk(c, 0.18), 0.12, 120); speck(t, x, y, w, h, c, rng, Math.round(w * h / 60), 0.22); break;
    case 'fleece': speck(t, x, y, w, h, c, rng, Math.round(w * h / 18), 0.2); break;
    case 'leather': speck(t, x, y, w, h, dk(c, 0.1), rng, Math.round(w * h / 22), 0.28); break;
    case 'poplin': for (let i = 0; i < w; i += 2) t.rect(x + i, y, 0.6, h, dk(c, 0.1), 0.1, 124); for (let j = 0; j < h; j += 2) t.rect(x, y + j, w, 0.6, lt(c, 0.08), 0.08, 134); break;
    case 'satin': for (let j = 0; j < h; j += 3) t.rect(x, y + j, w, 1, lt(c, 0.12), 0.1); break;
  }
}
function stitch(t: L, x0: number, y0: number, x1: number, y1: number, c: string, al = 0.85, step = 3.4): void {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / step);
  if (n < 1) return;
  const ux = (x1 - x0) / d, uy = (y1 - y0) / d;
  for (let i = 0; i < n; i++) { const px = x0 + ux * i * step, py = y0 + uy * i * step; t.line(px, py, px + ux * step * 0.62, py + uy * step * 0.62, c, 0.9, al, 142); }
}
function seam(t: L, x0: number, y0: number, x1: number, y1: number, c: string, st?: string): void {
  t.line(x0, y0, x1, y1, dk(c, 0.5), 1.5, 0.5, 96);
  t.line(x0 + 1.2, y0, x1 + 1.2, y1, lt(c, 0.16), 0.9, 0.22, 148);
  if (st) { stitch(t, x0 - 2, y0, x1 - 2, y1, st, 0.8); stitch(t, x0 + 3, y0, x1 + 3, y1, st, 0.8); }
}
function rib(t: L, x: number, y: number, w: number, h: number, c: string, vertical = true): void {
  t.rect(x, y, w, h, dk(c, 0.06), 1, 126, 250);
  if (vertical) for (let i = 0; i < w; i += 3) { t.rect(x + i, y, 1.3, h, dk(c, 0.3), 0.55, 98); t.rect(x + i + 1.5, y, 1.2, h, lt(c, 0.12), 0.3, 156); }
  else for (let j = 0; j < h; j += 3) { t.rect(x, y + j, w, 1.3, dk(c, 0.3), 0.55, 98); t.rect(x, y + j + 1.5, w, 1.2, lt(c, 0.12), 0.3, 156); }
  t.rect(x, y, w, 1.2, '#000000', 0.25, 90);
}
function button(t: L, x: number, y: number, c: string, r = 2.7): void {
  t.disc(x, y, r + 0.6, dk(c, 0.45), 0.8, 96); t.disc(x, y, r, lt(c, 0.12), 1, 150);
  t.disc(x - 0.8, y - 0.8, 0.45, dk(c, 0.5)); t.disc(x + 0.8, y - 0.8, 0.45, dk(c, 0.5)); t.disc(x - 0.8, y + 0.8, 0.45, dk(c, 0.5)); t.disc(x + 0.8, y + 0.8, 0.45, dk(c, 0.5));
}
function zipper(t: L, x: number, y0: number, y1: number, tape: string, pull = true): void {
  t.rect(x - 2.6, y0, 5.2, y1 - y0, tape, 1, 118, 220);
  for (let y = y0; y < y1; y += 2.6) { t.rect(x - 1.5, y, 1.4, 1.3, '#c8c8cc', 1, 168, 70); t.rect(x + 0.1, y + 1.3, 1.4, 1.3, '#9a9aa0', 1, 150, 70); }
  if (pull) { t.rect(x - 1.4, y0 + 1, 2.8, 7, '#b8b8c0', 1, 178, 60); t.rect(x - 0.7, y0 + 8, 1.4, 5, '#8a8a92', 1, 170, 60); }
}
function eyelet(t: L, x: number, y: number): void { t.disc(x, y, 1.8, '#b0b0b6', 1, 170, ); t.disc(x, y, 0.8, '#101010'); }
/** pocket with a flap, a button and top-stitching */
function flapPocket(t: L, x: number, y: number, w: number, h: number, c: string, st: string): void {
  t.rect(x, y, w, h, dk(c, 0.1), 0.55, 112);
  t.rect(x, y, w, h * 0.34, lt(c, 0.06), 1, 150);
  t.rect(x, y + h * 0.34, w, 1.6, '#000000', 0.35, 88);
  stitch(t, x + 1, y + h * 0.34 + 3, x + w - 1, y + h * 0.34 + 3, st, 0.7);
  stitch(t, x, y + 2, x, y + h, st, 0.6); stitch(t, x + w, y + 2, x + w, y + h, st, 0.6);
  button(t, x + w / 2, y + h * 0.2, c, 2);
}
/** soft crease: a short dark curve with a light edge */
function crease(t: L, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, c: string, al = 0.22): void {
  t.curve(x0, y0, cx, cy, x1, y1, dk(c, 0.55), 2.2, al); t.curve(x0, y0 + 2, cx, cy + 2, x1, y1 + 2, lt(c, 0.25), 1.4, al * 0.6);
}
function hemDirt(t: L, x: number, y: number, w: number, h: number, rng: Rng, al = 0.05): void {
  for (let i = 0; i < 7; i++) t.rect(x, y + h - 2 - i * 1.6, w, 1.6, '#4a3a28', al * (1 - i / 7));
  for (let i = 0; i < Math.round(w / 6); i++) t.rect(x + rng.range(0, w), y + h - rng.range(2, 9), rng.range(1, 3), rng.range(1, 3), '#3a2c1c', 0.14);
}
function baffles(t: L, w: number, h: number, c: string, step: number, y0 = 0): void {
  for (let y = y0; y < h; y += step) {
    t.rect(0, y, w, 2.4, dk(c, 0.6), 0.85, 62, 235);                      // the pinched seam
    const n = 6; for (let i = 0; i < n; i++) { const f = Math.sin(((i + 0.5) / n) * Math.PI); t.rect(0, y + 2.4 + (i * (step - 4.8)) / n, w, (step - 4.8) / n + 0.6, lt(c, 0.2 * f), 0.38, 136 + 40 * f, 150); }   // soft, rounded puff
    t.rect(0, y + step - 3.6, w, 2.6, dk(c, 0.22), 0.4, 112);
  }
}
function plaid(t: L, w: number, h: number, c: string, alt = '#e8d8a0'): void {
  for (let x = 6; x < w; x += 22) { t.rect(x, 0, 9, h, dk(c, 0.5), 0.42, 118); t.rect(x + 13, 0, 1.2, h, alt, 0.45); }
  for (let y = 4; y < h; y += 22) { t.rect(0, y, w, 9, dk(c, 0.5), 0.42, 118); t.rect(0, y + 13, w, 1.2, alt, 0.45); }
}
function checks(t: L, w: number, h: number, c: string, sz = 8): void {
  for (let y = 0; y < h; y += sz * 2) for (let x = 0; x < w; x += sz * 2) { t.rect(x, y, sz, sz, dk(c, 0.22), 0.5); t.rect(x + sz, y + sz, sz, sz, lt(c, 0.12), 0.35); }
}
function stripesH(t: L, w: number, h: number, c: string, pitch: number, thick: number): void { for (let y = 3; y < h; y += pitch) t.rect(0, y, w, thick, c, 0.95, 134); }
/** abstract screen-print motifs only: no words, no logos */
function motif(t: L, kind: PedSpec['top']['print'], cx: number, cy: number, big: number, c: string, rng: Rng): void {
  switch (kind) {
    case 'star': { const pts: Array<[number, number]> = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = (i % 2 ? 0.4 : 1) * big * 0.32; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } t.poly(pts, c, 0.9, 134); break; }
    case 'bolt': t.poly([[cx + 5, cy - 18], [cx - 11, cy + 3], [cx - 1, cy + 3], [cx - 6, cy + 18], [cx + 11, cy - 4], [cx + 1, cy - 4]], c, 0.9, 134); break;
    case 'heart': t.disc(cx - 5, cy - 3, 6, c, 0.9, 134); t.disc(cx + 5, cy - 3, 6, c, 0.9, 134); t.poly([[cx - 10.5, cy - 0.5], [cx + 10.5, cy - 0.5], [cx, cy + 11]], c, 0.9, 134); break;
    case 'bars': for (let i = 0; i < 5; i++) { const hh = [8, 16, 24, 14, 8][i]; t.rect(cx - 24 + i * 10, cy + 12 - hh, 7, hh + 4, c, 0.9, 134); } break;
    case 'badge': t.poly([[cx, cy - 10], [cx + 9, cy - 4], [cx + 6.5, cy + 8], [cx - 6.5, cy + 8], [cx - 9, cy - 4]], c, 0.95, 140); t.poly([[cx, cy - 6], [cx + 5, cy - 2], [cx + 3.5, cy + 4], [cx - 3.5, cy + 4], [cx - 5, cy - 2]], dk(c, 0.3), 0.8); break;
    default:
  }
  // cracked print: a few specks of the shirt colour break up the ink
  for (let i = 0; i < 14; i++) t.rect(cx + rng.range(-big * 0.4, big * 0.4), cy + rng.range(-big * 0.3, big * 0.3), 1.2, 1.2, '#000000', 0.1);
}

function outerFabric(s: PedSpec): Fab {
  const p = s.top;
  if (p.fabric) return ({ canvas: 'canvas', denim: 'denim', leather: 'leather', wool: 'wool', fleece: 'fleece', knit: 'knit' } as const)[p.fabric];
  if (p.kind === 'puffer' || p.kind === 'vest') return 'nylon';
  if (p.kind === 'hoodie') return 'fleece';
  if (p.kind === 'tracksuit') return 'satin';
  if (p.kind === 'cardigan') return 'knit';
  if (p.kind === 'uniform') return 'poplin';
  if (p.kind === 'jacket') { if (p.tie || p.long) return 'wool'; if (p.pattern === 'plaid') return 'poplin'; return parseInt(p.color.slice(5, 7), 16) > parseInt(p.color.slice(1, 3), 16) + 10 ? 'denim' : 'canvas'; }
  if (p.kind === 'tee' || p.kind === 'jersey') return p.kind === 'jersey' ? 'jersey' : 'jersey';
  return 'poplin';
}
function bottomFabric(s: PedSpec): Fab {
  const k = s.bottom.kind;
  return k === 'jeans' ? 'denim' : k === 'cargo' ? 'canvas' : k === 'sweats' ? 'fleece' : k === 'leggings' ? 'jersey' : k === 'trousers' ? 'wool' : k === 'skirt' ? 'poplin' : 'canvas';
}
/** body-colour weave under every garment of a person, so the top and bottom of an outfit are not the same cloth */
export function pedFabrics(s: PedSpec): { top: Fab; bottom: Fab } { return { top: outerFabric(s), bottom: bottomFabric(s) }; }

function paintTorso(t: L, s: PedSpec, rng: Rng): void {
  const p = s.top, W = 256, H = 128, c = p.color, cx = 128, fab = outerFabric(s);
  const isVest = p.kind === 'vest', isApron = p.kind === 'apron';
  const baseC = isVest ? (p.under ?? '#222') : isApron ? (p.under ?? '#2d7a4a') : c;
  const st = lt(mixHex(baseC, '#c89a4a', 0.5), 0.1);              // top-stitch colour that reads on this cloth
  const formal = p.kind === 'jacket' || p.kind === 'uniform';
  fabric(t, 0, 0, W, H, baseC, isVest || isApron ? 'jersey' : fab, rng);
  if (p.pattern === 'heather' || p.kind === 'hoodie' || p.kind === 'tee') speck(t, 0, 0, W, H, baseC, rng, 520, p.pattern === 'heather' ? 0.4 : 0.14);
  // the chest takes the light, the flanks and the hem fall off; creases where the body folds
  t.soft(cx, 50, 58, lt(baseC, 0.22), 0.2);
  t.rect(0, 0, 26, H, '#000000', 0.1); t.rect(W - 26, 0, 26, H, '#000000', 0.1);
  for (let i = 0; i < 5; i++) crease(t, 20 + rng.range(0, 216), 70 + rng.range(0, 40), 40 + rng.range(0, 176), 66 + rng.range(0, 40), 60 + rng.range(0, 160), 74 + rng.range(0, 40), baseC, 0.16);   // sag folds at the waist
  for (const sx of [64, W - 64]) t.rect(sx - 0.6, 6, 1.2, H - 6, dk(baseC, 0.5), 0.18, 112);                                                                                                    // side seams
  t.rect(0, 0, 1.4, H, dk(baseC, 0.5), 0.3, 108); t.rect(W - 1.4, 0, 1.4, H, dk(baseC, 0.5), 0.3, 108);                                                                              // centre-back seam
  const neckHole = (w0: number, depth: number): void => { t.poly([[cx - w0, 0], [cx + w0, 0], [cx + w0 * 0.7, depth * 0.55], [cx, depth], [cx - w0 * 0.7, depth * 0.55]], s.skin, 1, 128, 150); };
  switch (p.kind) {
    case 'hoodie': {
      // hood bunched round the neck, drawcords with aglets, kangaroo pocket, ribbed hem
      t.poly([[cx - 52, 0], [cx + 52, 0], [cx + 30, 26], [cx, 34], [cx - 30, 26]], dk(c, 0.28), 1, 96, 250);
      for (let i = 0; i < 7; i++) t.line(cx - 44 + i * 14.5, 0, cx - 30 + i * 10, 26 + (i % 2) * 5, dk(c, 0.55), 2, 0.3, 88);
      t.curve(cx - 34, 24, cx, 40, cx + 34, 24, dk(c, 0.6), 2.4, 0.5);
      for (const sx of [-1, 1]) { eyelet(t, cx + sx * 11, 30); t.line(cx + sx * 11, 32, cx + sx * 12.5, 60, '#d8d4c8', 1.6, 0.95, 148); t.rect(cx + sx * 12.5 - 1.2, 60, 2.4, 6, '#b8b8c0', 1, 170, 60); }
      if (p.zip) { zipper(t, cx, 34, H - 12, dk(c, 0.15)); }
      else {
        t.poly([[cx - 52, 82], [cx + 52, 82], [cx + 62, 112], [cx - 62, 112]], dk(c, 0.1), 0.85, 112);
        t.line(cx - 52, 82, cx - 62, 112, dk(c, 0.55), 1.5, 0.6, 92); t.line(cx + 52, 82, cx + 62, 112, dk(c, 0.55), 1.5, 0.6, 92); t.rect(cx - 52, 81, 104, 1.6, dk(c, 0.6), 0.7, 86);
        stitch(t, cx - 50, 85, cx + 50, 85, lt(c, 0.25), 0.55); stitch(t, cx - 62, 110, cx + 62, 110, lt(c, 0.2), 0.4);
      }
      rib(t, 0, H - 13, W, 13, c);
      break;
    }
    case 'puffer': {
      baffles(t, W, H - 14, c, 20, 4);
      rib(t, 0, H - 11, W, 11, dk(c, 0.1));
      t.poly([[cx - 40, 0], [cx + 40, 0], [cx + 34, 16], [cx - 34, 16]], dk(c, 0.3), 1, 110, 190); t.rect(cx - 40, 14, 80, 2, '#000000', 0.3, 86);   // standing collar
      t.rect(cx - 4.5, 0, 9, H - 11, lt(c, 0.06), 1, 138, 190); zipper(t, cx, 6, H - 11, dk(c, 0.2));                                                       // storm placket + zip
      for (const sx of [-1, 1]) { t.line(cx + sx * 64, 76, cx + sx * 54, 104, '#0a0a0a', 2, 0.55, 80); stitch(t, cx + sx * 66, 76, cx + sx * 56, 104, '#8a8a90', 0.5); }
      break;
    }
    case 'jersey': {
      // sports shirt in contrast panels: shoulders, side panels, trim at neck and hem; mesh holes in the relief
      t.poly([[0, 0], [58, 0], [70, H], [0, H]], p.trim, 0.95, 128, 236); t.poly([[W, 0], [W - 58, 0], [W - 70, H], [W, H]], p.trim, 0.95, 128, 236);
      if (p.pattern === 'block') { t.poly([[cx - 46, 0], [cx + 46, 0], [cx + 18, H - 20], [cx - 74, H - 20]], dk(c, 0.18), 0.9, 128); }
      for (let y = 4; y < H - 16; y += 5) for (let x = (y / 5) % 2 ? 2 : 0; x < W; x += 5) t.rect(x, y, 1.4, 1.4, '#000000', 0.22, 80);
      rib(t, 0, 0, W, 8, p.trim, false); t.rect(0, H - 24, W, 3, p.trim, 0.9); t.rect(0, H - 19, W, 1.6, p.trim, 0.8); rib(t, 0, H - 13, W, 13, c, false);
      break;
    }
    case 'vest': {
      // high-visibility vest over a dark shirt: mesh fabric, reflective tape (grey, micro-prism dots) in two bands and braces, zip, pockets
      t.rect(0, 12, W, H - 12, c, 1, 132, 215);
      for (let y = 12; y < H; y += 3) for (let x = (y / 3) % 2 ? 0 : 1.5; x < W; x += 3) t.rect(x, y, 1, 1, dk(c, 0.2), 0.3, 112);
      const tape = (x: number, y: number, w: number, h: number): void => {
        t.rect(x, y, w, h, '#cfd2d6', 1, 150, 70); t.rect(x, y, w, 1, '#80848a', 0.8); t.rect(x, y + h - 1, w, 1, '#80848a', 0.8);
        for (let j = 1.5; j < h - 1; j += 2.4) for (let i = (Math.round(j / 2.4) % 2) * 1.2; i < w; i += 2.4) t.rect(x + i, y + j, 1, 1, '#f4f6f8', 0.8, 182, 40);
      };
      for (const y of [50, 88]) tape(0, y, W, 9);
      for (const sx of [-1, 1]) tape(cx + sx * 34 - 4.5, 12, 9, 38);
      t.rect(cx - 2, 12, 4, H - 12, dk(c, 0.3), 0.6, 100); zipper(t, cx, 14, H - 4, dk(c, 0.1), false);
      for (const sx of [-1, 1]) { t.rect(cx + sx * 50 - 17, 100, 34, 22, dk(c, 0.1), 1, 118); stitch(t, cx + sx * 50 - 17, 101, cx + sx * 50 + 17, 101, '#7a7020', 0.6); t.rect(cx + sx * 50 - 17, 97, 34, 5, lt(c, 0.05), 1, 148); }
      t.rect(0, 0, W, 12, '#1d2026', 1, 128, 232);                                                                                                       // collar of the dark shirt
      t.rect(0, 0, W, 5, '#2b2f36', 1, 142, 236);
      break;
    }
    case 'jacket': case 'cardigan': {
      const knit = p.kind === 'cardigan', denim = fab === 'denim', canvas = fab === 'canvas', leather = fab === 'leather';
      const vEnd = p.long ? 14 : knit ? 70 : p.open ? H : 56;
      const underC = p.under ?? '#f4f4f4';
      if (p.open) {
        // worn open: the shirt (and its ribbed collar) shows down the front between the two jacket fronts
        t.rect(cx - 25, 0, 50, H, underC, 1, 128, 232); speck(t, cx - 25, 0, 50, H, underC, rng, 90, 0.14);
        t.rect(cx - 25, 0, 50, 7, dk(underC, 0.12), 1, 120); crease(t, cx - 20, 60, cx, 70, cx + 20, 62, underC, 0.14);
        for (const sx of [-1, 1]) { t.rect(cx + sx * 25 - (sx > 0 ? 0 : 5), 0, 5, H, dk(c, 0.14), 1, 168, 190); t.line(cx + sx * 25, 0, cx + sx * 25, H, '#000000', 1.6, 0.5, 86); stitch(t, cx + sx * 28, 0, cx + sx * 28, H, st, 0.6); }
      } else {
        t.rect(cx - 42, 0, 84, H, dk(c, 0.03), 1, 122);
        t.poly([[cx - (p.long ? 11 : 20), 0], [cx + (p.long ? 11 : 20), 0], [cx + 2, vEnd], [cx - 2, vEnd]], underC, 1, 128, 232);
        if (p.tie) t.poly([[cx - 4, 4], [cx + 4, 4], [cx + 5, 18], [cx + 2, vEnd - 4], [cx, vEnd], [cx - 2, vEnd - 4], [cx - 5, 18]], p.tie, 1, 150);
        t.rect(cx - 1, vEnd, 2, H - vEnd, dk(c, 0.5), 0.9, 96);
        for (let y = vEnd + 6; y < (p.long ? 124 : 118); y += p.long ? 30 : 24) button(t, cx + 5, y, dk(c, 0.3), 2.4);
      }
      // lapels / collar
      if (denim) { t.poly([[cx - 40, 0], [cx - 16, 0], [cx - 6, 26], [cx - 34, 20]], lt(c, 0.1), 1, 150, 230); t.poly([[cx + 40, 0], [cx + 16, 0], [cx + 6, 26], [cx + 34, 20]], lt(c, 0.1), 1, 150, 230); }
      else if (canvas) { t.poly([[cx - 44, 0], [cx - 14, 0], [cx - 4, 22], [cx - 38, 18]], mixHex(c, '#3a2410', 0.5), 1, 146, 245); t.poly([[cx + 44, 0], [cx + 14, 0], [cx + 4, 22], [cx + 38, 18]], mixHex(c, '#3a2410', 0.5), 1, 146, 245); }
      else { t.poly([[cx - 42, 0], [cx - 18, 0], [cx - 3, vEnd > 20 ? Math.min(vEnd - 8, 48) : 12], [cx - 28, 28]], lt(c, 0.14), 1, 156); t.poly([[cx + 42, 0], [cx + 18, 0], [cx + 3, vEnd > 20 ? Math.min(vEnd - 8, 48) : 12], [cx + 28, 28]], lt(c, 0.14), 1, 156); t.line(cx - 28, 28, cx - 3, vEnd > 20 ? Math.min(vEnd - 8, 48) : 12, '#000000', 1.2, 0.35, 90); t.line(cx + 28, 28, cx + 3, vEnd > 20 ? Math.min(vEnd - 8, 48) : 12, '#000000', 1.2, 0.35, 90); }
      t.rect(0, 0, W, 5, dk(c, 0.25), 0.9, 108);                                                                       // collar stand round the neck
      if (knit) { for (let x = 0; x < W; x += 3) t.rect(x, 0, 1.1, H, dk(c, 0.25), 0.25, 108); rib(t, 0, H - 12, W, 12, c); t.rect(cx - 36, 82, 24, 24, dk(c, 0.1), 0.7, 118); stitch(t, cx - 36, 82, cx - 12, 82, lt(c, 0.25), 0.5); }
      else if (denim) {
        t.curve(0, 26, cx, 34, W, 26, dk(c, 0.4), 1.8, 0.6); stitch(t, 0, 29, W, 29, '#d8a050', 0.8); stitch(t, 0, 23, W, 23, '#d8a050', 0.8);   // yoke
        for (const sx of [-1, 1]) { flapPocket(t, cx + sx * 40 - 14, 44, 28, 26, c, '#d8a050'); t.line(cx + sx * 20, 34, cx + sx * 22, H - 18, dk(c, 0.45), 1.4, 0.5, 98); stitch(t, cx + sx * 22 + 3, 34, cx + sx * 24 + 3, H - 18, '#d8a050', 0.8); }
        rib(t, 0, H - 16, W, 16, c, false); stitch(t, 0, H - 18, W, H - 18, '#d8a050', 0.8);
        speck(t, 0, 0, W, H, lt(c, 0.4), rng, 140, 0.14);
      } else if (canvas) {
        t.rect(cx - 46, 40, 36, 28, dk(c, 0.1), 0.9, 120); stitch(t, cx - 46, 41, cx - 10, 41, st, 0.7); stitch(t, cx - 46, 67, cx - 10, 67, st, 0.7); t.rect(cx - 46, 36, 36, 6, dk(c, 0.2), 1, 150);
        for (const sx of [-1, 1]) { t.rect(cx + sx * 52 - 15, 82, 30, 26, dk(c, 0.1), 0.9, 120); stitch(t, cx + sx * 52 - 15, 83, cx + sx * 52 + 15, 83, st, 0.7); }
        rib(t, 0, H - 14, W, 14, mixHex(c, '#3a2410', 0.4)); hemDirt(t, 0, 0, W, H, rng, 0.06); seam(t, cx + 60, 6, cx + 64, H - 14, c, st);
      } else if (leather) {
        t.rect(0, 0, W, H, c, 0.0); for (let i = 0; i < 6; i++) crease(t, 30 + rng.range(0, 190), 60 + rng.range(0, 40), 60 + rng.range(0, 140), 56 + rng.range(0, 40), 70 + rng.range(0, 160), 66 + rng.range(0, 40), c, 0.3);
        for (const sx of [-1, 1]) { t.line(cx + sx * 56, 74, cx + sx * 48, 106, '#000000', 2, 0.6, 84); stitch(t, cx + sx * 58, 74, cx + sx * 50, 106, lt(c, 0.25), 0.5); }
        rib(t, 0, H - 10, W, 10, dk(c, 0.15), false);
        for (let i = 0; i < 40; i++) t.rect(rng.range(0, W), rng.range(0, H), rng.range(1, 3), 1, lt(c, 0.5), 0.25, 170, 90);                         // wear: light edges and scuffs
      } else {
        // suit / blazer / overcoat: princess seams, breast welt, flap pockets, hem, vent seam
        for (const sx of [-1, 1]) { seam(t, cx + sx * 44, 18, cx + sx * 50, H - 6, c); t.curve(cx + sx * 44, 18, cx + sx * 54, 50, cx + sx * 50, H - 6, '#000000', 1, 0.1); }
        t.rect(cx + 22, 38, 20, 3, '#000000', 0.38, 86); t.rect(cx + 22, 36, 20, 2, lt(c, 0.14), 0.6, 150);
        for (const sx of [-1, 1]) { t.rect(cx + sx * 36 - 13, p.long ? 92 : 84, 26, 3, '#000000', 0.45, 86); t.rect(cx + sx * 36 - 13, (p.long ? 92 : 84) - 5, 26, 6, lt(c, 0.06), 1, 148); }
        t.rect(0, H - 6, W, 6, dk(c, 0.2), 1, 142); t.rect(0, 0, 1.6, H, '#000000', 0.35, 84);
        if (p.pattern === 'check') checks(t, W, H, c, 6); else for (let x = 8; x < W; x += 16) t.rect(x, 0, 0.8, H, lt(c, 0.28), 0.1);   // faint pinstripe
      }
      if (p.pattern === 'plaid') plaid(t, W, H, c);
      break;
    }
    case 'uniform': {
      // service shirt: collar, tie, epaulettes, two flap pockets, a plain shield patch and a name plate with no letters, duty belt
      t.poly([[cx - 26, 0], [cx + 26, 0], [cx + 16, 24], [cx, 34], [cx - 16, 24]], '#f1efe6', 1, 128, 230);
      t.poly([[cx - 30, 0], [cx - 6, 0], [cx, 36], [cx - 22, 26]], dk(c, 0.08), 1, 156); t.poly([[cx + 30, 0], [cx + 6, 0], [cx, 36], [cx + 22, 26]], dk(c, 0.08), 1, 156);
      if (p.tie) { t.poly([[cx - 4, 12], [cx + 4, 12], [cx + 4.5, 80], [cx, 86], [cx - 4.5, 80]], p.tie, 1, 148); t.rect(cx - 4, 12, 8, 4, dk(p.tie, 0.3)); }
      for (const sx of [-1, 1]) { t.rect(cx + sx * 40 - 17, 38, 34, 28, dk(c, 0.1), 1, 140); t.rect(cx + sx * 40 - 17, 38, 34, 9, lt(c, 0.06), 1, 156); t.rect(cx + sx * 40 - 17, 47, 34, 1.6, '#000000', 0.4, 86); button(t, cx + sx * 40, 43, p.printColor, 2); stitch(t, cx + sx * 40 - 17, 51, cx + sx * 40 + 17, 51, lt(c, 0.3), 0.5); }
      motif(t, 'badge', cx + 40, 62, 22, p.printColor, rng);
      t.rect(cx - 52, 40, 24, 5, '#e8e8e8', 0.9, 140); t.rect(cx - 52, 40, 24, 1, '#7a7a80', 0.7);   // blank name plate
      for (const sx of [-1, 1]) { t.rect(cx + sx * 66 - 7, 0, 14, 6, dk(c, 0.25), 1, 156); t.disc(cx + sx * 66, 6, 1.6, p.printColor, 1, 170, ); }
      t.rect(0, 106, W, 14, '#10141c', 1, 150, 90); t.rect(cx - 9, 106, 18, 14, '#c8b04a', 1, 172, 60); stitch(t, 0, 109, W, 109, '#3a4258', 0.5);
      t.rect(0, 120, W, 8, dk(c, 0.1), 1, 126);
      break;
    }
    case 'scrubs': {
      neckHole(16, 30); t.poly([[cx - 34, 0], [cx - 22, 0], [cx, 36]], dk(c, 0.15), 1, 150, 226); t.poly([[cx + 34, 0], [cx + 22, 0], [cx, 36]], dk(c, 0.15), 1, 150, 226);
      t.line(cx - 28, 0, cx, 38, lt(c, 0.5), 1.6, 0.8); t.line(cx + 28, 0, cx, 38, lt(c, 0.5), 1.6, 0.8);
      t.rect(cx - 62, 66, 36, 30, dk(c, 0.1), 1, 134); t.rect(cx - 62, 66, 36, 2, dk(c, 0.5), 0.8, 92); stitch(t, cx - 60, 71, cx - 28, 71, lt(c, 0.3), 0.5); stitch(t, cx - 62, 94, cx - 26, 94, lt(c, 0.3), 0.4);
      t.rect(cx + 28, 90, 30, 28, dk(c, 0.1), 1, 134); stitch(t, cx + 28, 94, cx + 58, 94, lt(c, 0.3), 0.5);
      t.rect(0, H - 6, W, 6, dk(c, 0.12), 1, 126); stitch(t, 0, H - 8, W, H - 8, lt(c, 0.3), 0.5);
      break;
    }
    case 'blouse': case 'dress': {
      neckHole(18, 20); t.poly([[cx - 36, 0], [cx - 18, 0], [cx - 8, 28]], dk(c, 0.12), 1, 154, 226); t.poly([[cx + 36, 0], [cx + 18, 0], [cx + 8, 28]], dk(c, 0.12), 1, 154, 226);
      if (p.kind === 'dress') { t.rect(0, 70, W, 4, dk(c, 0.25), 1, 150); t.rect(0, 74, W, 2, '#000000', 0.12); }                                          // waist seam
      else { for (let y = 34; y < H - 10; y += 22) button(t, cx, y, lt(c, 0.3), 2.1); t.rect(cx - 1, 28, 2, H - 28, dk(c, 0.2), 0.6, 112); }               // button band
      for (const sx of [-1, 1]) { t.line(cx + sx * 40, 36, cx + sx * 44, 72, dk(c, 0.5), 1.2, 0.3, 100); }                                               // bust darts
      if (p.pattern === 'print' || p.print === 'heart') { for (let i = 0; i < 80; i++) { const x = rng.range(0, W), y = rng.range(12, H - 8); t.disc(x, y, 1.6, lt(c, 0.6), 0.8, 134); t.disc(x + 3, y + 1, 1.2, lt(c, 0.45), 0.7, 134); } }
      t.rect(0, H - 7, W, 7, p.trim, 0.9, 140); stitch(t, 0, H - 9, W, H - 9, lt(p.trim, 0.3), 0.5);
      break;
    }
    case 'tracksuit': {
      // zip-through track top: contrast collar stand, shoulder yoke, side stripes with piping, rib hem
      t.poly([[cx - 36, 0], [cx + 36, 0], [cx + 28, 14], [cx - 28, 14]], p.trim, 1, 140, 200);
      t.rect(0, 0, W, 22, dk(c, 0.1), 1, 130, 176);
      zipper(t, cx, 8, H - 12, p.trim);
      for (const sx of [64, W - 64]) { t.rect(sx - 8, 0, 16, H - 12, p.trim, 1, 134, 176); t.rect(sx - 9.5, 0, 1.4, H - 12, dk(p.trim, 0.3), 0.7); t.rect(sx + 8, 0, 1.4, H - 12, dk(p.trim, 0.3), 0.7); }
      for (const sx of [-1, 1]) { t.line(cx + sx * 44, 78, cx + sx * 40, 108, '#000000', 1.6, 0.5, 90); }
      rib(t, 0, H - 13, W, 13, p.trim);
      break;
    }
    case 'apron': {
      t.rect(0, 0, W, H, baseC, 1, 128, 236);
      t.poly([[cx - 56, 6], [cx + 56, 6], [cx + 64, H], [cx - 64, H]], c, 1, 124, 238); speck(t, cx - 60, 6, 120, H - 6, c, rng, 120, 0.2);
      t.rect(cx - 62, 0, 9, 16, c); t.rect(cx + 53, 0, 9, 16, c);
      t.poly([[cx - 26, 0], [cx + 26, 0], [cx + 16, 18], [cx - 16, 18]], s.skin, 1, 128, 150);
      t.rect(cx - 38, 76, 76, 34, dk(c, 0.1), 1, 120); t.rect(cx - 38, 76, 76, 2, dk(c, 0.5), 0.8, 90); stitch(t, cx - 36, 80, cx + 36, 80, lt(c, 0.3), 0.6); t.line(cx, 78, cx, 110, dk(c, 0.4), 1.2, 0.5, 100);
      for (let i = 0; i < 12; i++) t.disc(cx + rng.range(-50, 50), rng.range(30, H - 6), rng.range(1, 2.4), dk(c, 0.3), 0.18);    // flour and paint
      stitch(t, cx - 56, 8, cx - 64, H - 4, lt(c, 0.3), 0.5); stitch(t, cx + 56, 8, cx + 64, H - 4, lt(c, 0.3), 0.5);
      break;
    }
    default: {
      // tee: ribbed round neck, side seams, double-stitched hem, optional breton stripes / colour block / abstract print
      if (p.pattern === 'stripe' || p.print === 'stripes') stripesH(t, W, H - 10, p.printColor, 16, 6);
      t.curve(cx - 27, 0, cx, 30, cx + 27, 0, dk(c, 0.34), 4, 0.9); t.curve(cx - 24, 0, cx, 26, cx + 24, 0, lt(c, 0.14), 2, 0.5);
      t.rect(0, H - 12, W, 12, dk(c, 0.04), 1, 120); stitch(t, 0, H - 10, W, H - 10, lt(c, 0.3), 0.55); stitch(t, 0, H - 6, W, H - 6, lt(c, 0.3), 0.45);
      if (p.pattern === 'block') { t.poly([[0, 0], [W, 0], [W, 44], [0, 44]], p.trim, 0.9, 130); }
    }
  }
  if (p.pattern === 'plaid' && p.kind !== 'jacket' && p.kind !== 'cardigan') plaid(t, W, H, c);
  if (p.pattern === 'check' && formal === false && p.kind !== 'jacket') checks(t, W, H, c, 7);
  if (!isVest && !formal && p.kind !== 'cardigan' && p.print !== 'stripes' && p.print !== 'none' && p.kind !== 'jersey') motif(t, p.print, cx, p.kind === 'hoodie' ? 62 : 60, 60, p.printColor, rng);
  // the garment sags: dirt and wear at the hem, shadow under the arms and the collar
  hemDirt(t, 0, 0, W, H, rng, 0.03);
  t.rect(0, 0, W, 4, '#000000', 0.2); t.rect(0, H - 10, W, 10, '#000000', 0.12);
}

function sleeve(t: L, s: PedSpec, rng: Rng, lower: boolean): void {
  const p = s.top, W = 128, H = 128, fab = outerFabric(s);
  const c = p.kind === 'vest' ? (p.under ?? '#222') : p.kind === 'apron' ? (p.under ?? '#2d7a4a') : p.color;
  const underOpen = p.open && (p.kind === 'jacket' || p.kind === 'cardigan');
  t.rect(0, 0, W, H, s.skin, 1, 128, 140);
  speck(t, 0, 0, W, H, s.skin, rng, 260, 0.1);
  t.rect(0, 0, 24, H, '#000000', 0.1); t.rect(W - 24, 0, 24, H, '#000000', 0.1);
  const cover = p.sleeves === 'long' ? (lower ? (peopleMode() === 'skin' ? 124 : 106) : 128) : p.sleeves === 'short' ? (lower ? 0 : 74) : p.kind === 'jersey' ? (lower ? 0 : 18) : 0;
  if (cover > 0) {
    fabric(t, 0, 0, W, cover, c, p.kind === 'vest' || p.kind === 'apron' ? 'jersey' : fab, rng);
    if (p.pattern === 'heather' || p.kind === 'tee' || p.kind === 'hoodie') speck(t, 0, 0, W, cover, c, rng, 220, p.pattern === 'heather' ? 0.4 : 0.14);
    if (p.kind === 'puffer') baffles(t, W, cover, c, 20, 2);
    if (p.kind === 'tracksuit') { t.rect(46, 0, 22, cover, p.trim, 1, 134, 176); t.rect(44.5, 0, 1.3, cover, dk(p.trim, 0.3), 0.7); t.rect(68, 0, 1.3, cover, dk(p.trim, 0.3), 0.7); }
    if (p.kind === 'jersey' || p.pattern === 'block') t.rect(0, 0, W, 16, p.trim, 0.9, 130);
    if ((p.pattern === 'stripe' || p.print === 'stripes') && p.kind !== 'jersey' && p.kind !== 'tracksuit' && p.kind !== 'vest') stripesH(t, W, cover, p.printColor, 16, 6);
    if (p.pattern === 'plaid') plaid(t, W, cover, c);
    if (p.pattern === 'check') checks(t, W, cover, c, 6);
    if (p.kind === 'vest') { /* dark undershirt sleeve */ }
    if (p.kind === 'uniform' && !lower) { t.rect(30, 24, 34, 30, p.printColor, 0.0); motif(t, 'badge', 48, 38, 16, p.printColor, rng); }
    // seams down the underside, sleeve-head seam, elbow creases and a cuff
    t.rect(31.5, 0, 1.2, cover, dk(c, 0.5), 0.2, 112); t.rect(95.5, 0, 1.2, cover, dk(c, 0.5), 0.2, 112);
    if (!lower) { for (let i = 0; i < 3; i++) crease(t, 8 + i * 4, cover - 18 + i * 6, 64, cover - 12 + i * 6, 120 - i * 4, cover - 18 + i * 6, c, 0.26); }
    else { for (let i = 0; i < 3; i++) crease(t, 10 + i * 4, 6 + i * 5, 64, 2 + i * 5, 118 - i * 4, 6 + i * 5, c, 0.24); }
    if (lower) {
      const cuffC = p.kind === 'tracksuit' ? p.trim : underOpen ? c : dk(c, 0.18);
      if (p.kind === 'hoodie' || p.kind === 'tracksuit' || p.kind === 'puffer' || p.kind === 'jersey') rib(t, 0, cover - 14, W, 14, cuffC);
      else if (p.kind === 'jacket' || p.kind === 'uniform' || p.kind === 'blouse' || p.kind === 'cardigan') { t.rect(0, cover - 8, W, 8, dk(c, 0.1), 1, 146); stitch(t, 0, cover - 6, W, cover - 6, lt(c, 0.3), 0.5); for (const bx of [30, 98]) button(t, bx, cover - 14, c, 1.8); }
      else { t.rect(0, cover - 8, W, 8, dk(c, 0.1), 1, 126); stitch(t, 0, cover - 6, W, cover - 6, lt(c, 0.3), 0.5); }
      if (p.under && (p.kind === 'jacket' || p.kind === 'cardigan')) { t.rect(0, cover, W, 8, p.under, 1, 128, 232); t.rect(0, cover, W, 1.5, '#000000', 0.25); }
      hemDirt(t, 0, 0, W, cover, rng, 0.03);
    } else if (p.sleeves === 'short') { t.rect(0, cover - 8, W, 8, dk(c, 0.1), 1, 120); stitch(t, 0, cover - 6, W, cover - 6, lt(c, 0.3), 0.55); }
    t.rect(0, cover - 3, W, 3, '#000000', 0.25);
  }
  t.rect(0, 0, W, 8, '#000000', 0.22); // shadow where the arm leaves the shoulder
}

function paintHand(t: L, s: PedSpec, rng: Rng): void {
  t.rect(0, 0, 128, 64, s.skin, 1, 128, 140);
  speck(t, 0, 0, 128, 64, s.skin, rng, 200, 0.12);
  // four fingers and a thumb: dark gaps with a groove in the relief so the hand does not read as a mitten, nails at the tips, knuckle creases
  for (let i = 1; i < 4; i++) { const x = i * 32 - 16 + 16; t.rect(x - 1.5, 26, 3, 38, dk(s.skin, 0.5), 0.7, 70); t.rect(x - 0.5, 26, 1, 38, '#2a1410', 0.4, 60); }
  for (let i = 0; i < 4; i++) { const x = i * 32 + 16; t.rect(x - 6, 54, 12, 8, mixHex(s.skin, '#e8c8c0', 0.5), 0.55, 148); t.rect(x - 6, 54, 12, 1, dk(s.skin, 0.4), 0.5); for (let j = 0; j < 2; j++) t.rect(x - 7, 38 + j * 6, 14, 1.2, dk(s.skin, 0.4), 0.3, 110); }
  t.rect(0, 24, 128, 2, dk(s.skin, 0.35), 0.5, 100); t.rect(0, 0, 128, 8, dk(s.skin, 0.2), 0.4);
  t.rect(0, 0, 18, 64, '#000000', 0.1); t.rect(110, 0, 18, 64, '#000000', 0.1);
}
function paintNeck(t: L, s: PedSpec, rng: Rng): void {
  t.rect(0, 0, 128, 64, s.skin, 1, 128, 140);
  speck(t, 0, 0, 128, 64, s.skin, rng, 120, 0.12);
  t.rect(0, 0, 128, 16, '#000000', 0.12); t.rect(0, 48, 128, 16, '#000000', 0.28); // under the jaw shadow at the top (v up), collar shadow at the bottom
}

function legCloth(s: PedSpec, lower: boolean): string | null {
  const k = s.bottom.kind;
  if (k === 'skirt') return null;
  if (k === 'shorts') return lower ? null : s.bottom.color;
  return s.bottom.color;
}
function paintLeg(t: L, s: PedSpec, rng: Rng, lower: boolean): void {
  const W = 128, H = 128, k = s.bottom.kind, c = legCloth(s, lower), fab = bottomFabric(s);
  t.rect(0, 0, W, H, s.skin, 1, 128, 140);
  speck(t, 0, 0, W, H, s.skin, rng, 260, 0.1);
  if (k === 'skirt' && lower && s.top.kind === 'dress') t.rect(0, 0, W, 38, s.bottom.color);
  if (c) {
    const len = k === 'shorts' && !lower ? 92 : H;
    const denim = k === 'jeans', st = '#d8a050';
    fabric(t, 0, 0, W, len, c, fab, rng);
    if (denim) {
      // wash: faded thighs and knees, darker towards the hem and seams; whiskers at the hip; honeycomb behind the knee; contrast stitching
      if (!lower) { t.soft(64, 50, 36, lt(c, 0.38), 0.3, 8); t.soft(64, 100, 26, lt(c, 0.3), 0.22, 6); for (let i = 0; i < 7; i++) t.line(34 + i * 7, 2, 40 + i * 6, 18 + rng.range(0, 14), lt(c, 0.5), 0.9, 0.22); }
      else { t.soft(64, 14, 24, lt(c, 0.36), 0.28, 8); for (let y = 6; y < 28; y += 6) for (let x = 2; x < 22; x += 6) t.line(x, y, x + 3, y + 3, lt(c, 0.5), 0.8, 0.2); }
      t.rect(31, 0, 1, len, dk(c, 0.5), 0.5, 100); t.rect(96, 0, 1, len, dk(c, 0.5), 0.5, 100); stitch(t, 28, 0, 28, len, st, 0.75); stitch(t, 35, 0, 35, len, st, 0.75); stitch(t, 93, 0, 93, len, st, 0.75); stitch(t, 100, 0, 100, len, st, 0.75);
      if (lower) { t.rect(0, 104, W, 24, lt(c, 0.1), 1, 140, 236); stitch(t, 0, 106, W, 106, st, 0.8); hemDirt(t, 0, 0, W, H, rng, 0.07); }
    } else {
      t.rect(31, 0, 1, len, dk(c, 0.45), 0.4, 104); t.rect(96, 0, 1, len, dk(c, 0.45), 0.4, 104);
    }
    // knees and thighs crease where the leg bends
    if (!lower) for (let i = 0; i < 3; i++) crease(t, 4, 96 + i * 8, 64, 92 + i * 8, 124, 96 + i * 8, c, 0.18);
    else for (let i = 0; i < 3; i++) crease(t, 6, 8 + i * 6, 64, 4 + i * 6, 122, 8 + i * 6, c, 0.18);
    t.rect(0, 0, 22, len, '#000000', 0.1); t.rect(W - 22, 0, 22, len, '#000000', 0.1);
    if (k === 'trousers') { t.rect(62, 0, 4, len, lt(c, 0.18), 0.3, 150); t.rect(63.4, 0, 1.2, len, dk(c, 0.4), 0.3, 104); if (s.bottom.trim !== c && rng.chance(0.4)) for (let x = 6; x < W; x += 12) t.rect(x, 0, 0.8, len, lt(c, 0.3), 0.14); if (lower) { t.rect(0, 108, W, 20, dk(c, 0.1), 1, 134, 238); stitch(t, 0, 110, W, 110, lt(c, 0.2), 0.4); hemDirt(t, 0, 0, W, H, rng, 0.05); } }
    if (k === 'sweats') { for (const x of [28, 100]) { t.rect(x - 4, 0, 8, len, s.bottom.trim, 1, 134, 176); t.rect(x - 5, 0, 1, len, dk(s.bottom.trim, 0.3), 0.6); t.rect(x + 4, 0, 1, len, dk(s.bottom.trim, 0.3), 0.6); } if (lower) rib(t, 0, 100, W, 28, s.bottom.color); }
    if (k === 'cargo') {
      if (!lower) for (const x of [14, 82]) { t.rect(x, 50, 32, 40, dk(c, 0.1), 1, 134, 240); t.rect(x, 50, 32, 12, lt(c, 0.06), 1, 152); t.rect(x, 62, 32, 1.6, '#000000', 0.4, 86); stitch(t, x + 1, 66, x + 31, 66, lt(c, 0.3), 0.6); stitch(t, x, 52, x, 90, lt(c, 0.3), 0.5); stitch(t, x + 32, 52, x + 32, 90, lt(c, 0.3), 0.5); button(t, x + 16, 56, c, 2.2); }
      else { t.rect(0, 100, W, 28, dk(c, 0.18), 1, 140, 238); t.rect(0, 100, W, 2, '#000000', 0.3, 90); hemDirt(t, 0, 0, W, H, rng, 0.07); }
    }
    if (k === 'leggings') { for (const x of [31, 96]) t.rect(x, 0, 1.2, len, '#000000', 0.25, 110); t.rect(0, 0, W, len, lt(c, 0.2), 0.0); }
    if (k === 'shorts' && !lower) { t.rect(0, 84, W, 8, dk(s.bottom.trim, 0.1), 1, 140); stitch(t, 0, 86, W, 86, lt(s.bottom.trim, 0.3), 0.6); }
  }
  // below shorts and skirts: ribbed socks with a cuff stripe
  if (lower && (k === 'shorts' || k === 'skirt')) { rib(t, 0, 92, W, 36, '#f0f0ee'); t.rect(0, 92, W, 6, s.shoes.accent, 0.9, 150); t.rect(0, 100, W, 2, s.shoes.accent, 0.5); }
  t.rect(0, 0, W, 6, '#000000', 0.15);
}
function paintPelvis(t: L, s: PedSpec, rng: Rng): void {
  const b = s.bottom, c = b.color, W = 128, H = 128, fab = bottomFabric(s), st = b.kind === 'jeans' ? '#d8a050' : lt(c, 0.25);
  fabric(t, 0, 0, W, H, c, fab, rng);
  if (b.kind === 'jeans') { t.soft(64, 70, 30, lt(c, 0.3), 0.2, 6); }
  for (let i = 0; i < 4; i++) crease(t, 10, 40 + rng.range(0, 60), 64, 38 + rng.range(0, 60), 118, 44 + rng.range(0, 60), c, 0.16);
  if (b.kind === 'skirt') {
    for (let x = 4; x < W; x += 8) { t.rect(x, 12, 1.6, 116, dk(c, 0.4), 0.5, 100); t.rect(x + 1.6, 12, 3, 116, lt(c, 0.08), 0.3, 148); }
    t.rect(0, 0, W, 12, dk(c, 0.15), 1, 120); stitch(t, 0, 10, W, 10, st, 0.5);
    if (s.top.kind !== 'dress' && s.top.pattern !== 'plaid' && (s.top.color.length === 7) && s.bottom.trim !== c && rng.chance(0.0)) checks(t, W, H, c);
  } else {
    // waistband, belt loops, button, fly and front pockets
    t.rect(0, 0, W, 12, dk(c, 0.18), 1, 116, 236); stitch(t, 0, 3, W, 3, st, 0.7); stitch(t, 0, 10, W, 10, st, 0.7);
    t.rect(0, 12, W, 6, b.kind === 'jeans' ? '#5a3c22' : '#161616', 0.0);
    for (const x of [18, 44, 84, 110]) t.rect(x, 0, 4, 18, dk(c, 0.3), 1, 150, 235);
    t.rect(58, 6, 12, 8, '#c8b04a', 1, 172, 60); button(t, 64, 10, '#b8b8c0', 2);
    t.line(64, 14, 64, 56, dk(c, 0.5), 1.4, 0.6, 94); t.curve(64, 56, 56, 56, 52, 40, dk(c, 0.45), 1.2, 0.5); if (b.kind === 'jeans') stitch(t, 60, 18, 56, 52, st, 0.8);
    for (const sx of [-1, 1]) { t.curve(64 + sx * 24, 14, 64 + sx * 36, 40, 64 + sx * 34, 62, dk(c, 0.5), 1.4, 0.55); if (b.kind === 'jeans') { stitch(t, 64 + sx * 24 + 2, 14, 64 + sx * 36 + 2, 40, st, 0.8); t.disc(64 + sx * 24, 15, 1.4, '#b8b8c0', 1, 170); } }
    if (b.kind === 'cargo') { t.rect(2, 50, 18, 30, dk(c, 0.12), 1, 150); t.rect(108, 50, 18, 30, dk(c, 0.12), 1, 150); }
    // back pockets (the tile wraps: the back is at the edges)
    for (const [x0, w0] of [[3, 20], [105, 20]]) { t.poly([[x0, 40], [x0 + w0, 40], [x0 + w0, 62], [x0 + w0 / 2, 70], [x0, 62]], dk(c, 0.08), 0.5, 118); if (b.kind === 'jeans') { t.curve(x0 + 2, 42, x0 + w0 / 2, 58, x0 + w0 - 2, 42, st, 1, 0.8); stitch(t, x0, 40, x0 + w0, 40, st, 0.8); } }
  }
  t.rect(0, 0, 20, H, '#000000', 0.08); t.rect(W - 20, 0, 20, H, '#000000', 0.08); t.rect(0, 118, W, 10, '#000000', 0.2);
}
function paintShoe(t: L, s: PedSpec, rng: Rng): void {
  const sh = s.shoes, W = 128, H = 128;
  const leather = sh.sole === '#1a1a1a' || sh.color === '#101010' || sh.color === '#161616' || sh.color === '#3a2a1c' || sh.color === '#5b3a24' || sh.color === '#8a5a2a';
  const boot = !!sh.high;
  t.rect(0, 0, W, H, sh.color, 1, 128, leather ? 96 : 205);
  if (leather) { speck(t, 0, 0, W, 100, dk(sh.color, 0.1), rng, 220, 0.22); for (let i = 0; i < 6; i++) crease(t, 30 + rng.range(0, 20), 54 + i * 3, 64, 50 + i * 3, 98 - rng.range(0, 20), 54 + i * 3, sh.color, 0.28); }
  else { for (let y = 0; y < 100; y += 3) for (let x = (y / 3) % 2 ? 0 : 1.5; x < W; x += 3) t.rect(x, y, 1, 1, dk(sh.color, 0.2), 0.25, 112); }   // knit / mesh upper
  t.rect(0, 0, W, 18, lt(sh.color, 0.08), 0.4); t.rect(0, 0, W, 8, dk(sh.color, 0.3), 0.7, 112, 235);                  // padded collar
  // toe cap and heel counter are separate panels with stitched seams (logo-free)
  t.poly([[10, 100], [118, 100], [112, 74], [64, 66], [16, 74]], leather ? dk(sh.color, 0.08) : lt(sh.color, 0.08), 0.8, 132);
  t.curve(16, 74, 64, 64, 112, 74, '#000000', 1.4, 0.4); stitch(t, 18, 77, 110, 77, lt(sh.color, 0.35), 0.5);
  t.rect(0, 20, 22, 80, dk(sh.color, 0.14), 0.9, 126); t.rect(W - 22, 20, 22, 80, dk(sh.color, 0.14), 0.9, 126);
  t.poly([[30, 30], [98, 36], [98, 52], [30, 46]], sh.accent, 0.9, 140);                                              // side panel in the accent colour
  t.rect(30, 46, 68, 1.4, '#000000', 0.25);
  // tongue and laces: crossed lace pairs with eyelets
  t.rect(48, 6, 32, 62, lt(sh.color, 0.14), 0.7, 142, 205);
  for (let y = 12; y < 62; y += 9) { t.line(50, y, 78, y + 4, '#f0f0ee', 1.5, 0.95, 156); t.line(78, y, 50, y + 4, '#e4e4e2', 1.5, 0.95, 152); eyelet(t, 46, y + 2); eyelet(t, 82, y + 2); }
  if (boot) { t.rect(0, 8, W, 3, dk(sh.color, 0.4), 0.6, 96); }
  // midsole stripe, outsole with tread, heel wear
  t.rect(0, 94, W, 6, lt(sh.sole, 0.35), 1, 150, 200);
  t.rect(0, 100, W, 28, sh.sole, 1, 160, 235);
  t.rect(0, 100, W, 2, dk(sh.sole, 0.35), 1, 96);
  for (let x = 0; x < W; x += 5) t.rect(x, 110, 2.4, 12, dk(sh.sole, 0.35), 0.5, 100);
  t.rect(0, 122, W, 6, dk(sh.sole, 0.3), 1, 104);
  t.rect(0, 100, 24, 28, dk(sh.sole, 0.18), 0.4); hemDirt(t, 0, 0, W, 100, rng, 0.1);
  t.rect(0, 0, 18, H, '#000000', 0.1); t.rect(W - 18, 0, 18, H, '#000000', 0.1);
}

function paintGear(t: L, s: PedSpec, rng: Rng): void {
  const gc = s.gearColor;
  fabric(t, 0, 0, 256, 64, gc, 'canvas', rng); folds(t, 256, 64, gc, rng, 5);
  t.rect(0, 0, 256, 8, lt(gc, 0.15), 0.4);
  t.rect(88, 18, 80, 30, dk(gc, 0.12), 1, 142); t.rect(88, 18, 80, 2, dk(gc, 0.5), 0.8, 90); stitch(t, 90, 24, 166, 24, lt(gc, 0.3), 0.6); zipper(t, 128, 6, 18, dk(gc, 0.2));
  t.rect(28, 0, 8, 64, dk(gc, 0.3), 1, 150, 235); t.rect(220, 0, 8, 64, dk(gc, 0.3), 1, 150, 235); stitch(t, 31, 0, 31, 64, lt(gc, 0.3), 0.5);   // straps
  t.rect(0, 54, 256, 10, '#000000', 0.2);
}

function paintHair(t: L, s: PedSpec, rng: Rng): void {
  const c = s.hairColor, curly = s.hair === 'afro' || s.hair === 'puff' || s.hair === 'locs' || s.hair === 'braids', old = s.age === 'old';
  const base = old ? mixHex(c, '#b8b8b4', 0.45) : c;
  t.rect(0, 0, 128, 128, base, 1, 140, 130);
  // root to tip: darker at the roots, lighter / warmer at the ends
  for (let i = 0; i < 16; i++) t.rect(0, i * 8, 128, 8, i < 4 ? dk(base, 0.25) : lt(base, 0.02 * i), 0.18);
  if (curly) {
    for (let i = 0; i < 420; i++) { const x = rng.range(0, 128), y = rng.range(0, 128); t.disc(x, y, rng.range(1.2, 3), rng.chance(0.5) ? dk(base, 0.5) : lt(base, 0.18), 0.35, rng.chance(0.5) ? 100 : 175); }
    for (let i = 0; i < 40; i++) t.soft(rng.range(0, 128), rng.range(10, 90), rng.range(8, 16), lt(base, 0.25), 0.1, 4);
  } else {
    // flowing strands, slightly wavy, with a few grey / lighter ones
    for (let i = 0; i < 240; i++) {
      const x = rng.range(0, 128), dx = rng.range(-6, 6), mid = x + dx * 0.5 + rng.range(-3, 3), col = rng.chance(0.55) ? dk(base, 0.4) : lt(base, rng.chance(0.15) ? 0.5 : 0.25);
      t.curve(x, 0, mid, 64, x + dx, 128, col, rng.range(0.6, 1.4), 0.34);
    }
    // anisotropic sheen: a bright band across the strands (where the light slides along them) and a soft second one
    t.rect(0, 22, 128, 11, lt(base, 0.55), 0.2); t.rect(0, 26, 128, 4, lt(base, 0.7), 0.16); t.rect(0, 62, 128, 7, lt(base, 0.35), 0.1);
    for (let i = 0; i < 90; i++) t.line(rng.range(0, 128), 20, rng.range(0, 128), 36, lt(base, 0.6), 0.6, 0.12);
  }
  t.rect(0, 104, 128, 24, '#000000', 0.12);
}
/** The hat tile wraps round the dome (front at x = 64, apex at the top): panels, stitching, bands, no lettering. */
function paintHat(t: L, s: PedSpec, rng: Rng): void {
  const c = s.hatColor, W = 128, H = 128;
  const fab: Fab = s.hat === 'beanie' ? 'knit' : s.hat === 'durag' ? 'satin' : s.hat === 'hijab' ? 'jersey' : s.hat === 'cop' || s.hat === 'church' || s.hat === 'fedora' || s.hat === 'flat' ? 'wool' : s.hat === 'hardhat' || s.hat === 'helmet' ? 'nylon' : 'canvas';
  fabric(t, 0, 0, W, H, c, fab, rng);
  if (s.hat === 'hardhat' || s.hat === 'helmet') { t.rect(0, 0, W, H, c, 1, 150, 150); for (const x of [30, 64, 98]) { t.rect(x - 1.5, 0, 3, 90, dk(c, 0.2), 0.9, 108, 160); t.rect(x + 1.5, 0, 2, 90, lt(c, 0.25), 0.5, 170, 120); } t.rect(0, 84, W, 6, dk(c, 0.25), 1, 112, 170); }
  if (s.hat === 'cap' || s.hat === 'flat' || s.hat === 'cop') {
    for (let i = 0; i < 6; i++) { const x = 10.7 + i * 21.3; t.rect(x - 0.7, 0, 1.4, 100, dk(c, 0.5), 0.55, 98); stitch(t, x - 2.6, 0, x - 2.6, 100, lt(c, 0.3), 0.35); stitch(t, x + 2.6, 0, x + 2.6, 100, lt(c, 0.3), 0.35); }   // panel seams
    t.disc(64, 2, 3.4, dk(c, 0.2), 1, 120); eyelet(t, 40, 14); eyelet(t, 88, 14);                                                                            // crown button, vents
    t.rect(0, 94, W, 6, dk(c, 0.3), 1, 112, 238); stitch(t, 0, 92, W, 92, lt(c, 0.3), 0.5);                                                                 // sweatband seam
    if (s.hat === 'cap') { t.rect(40, 36, 48, 36, dk(c, 0.04), 0.6, 132); }                                                                                    // stiffened front panel
  }
  t.rect(0, 0, W, 10, lt(c, 0.12), 0.4);
  if (s.hat === 'headwrap') {
    // wax-print cloth: bold abstract blocks and rings, tied in folds
    for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) { if (((x + y) / 16) % 2 === 0) t.poly([[x + 8, y + 2], [x + 14, y + 8], [x + 8, y + 14], [x + 2, y + 8]], s.hatTrim, 0.95, 146); else { t.disc(x + 8, y + 8, 4.2, '#f4f1e0', 0.95, 146); t.disc(x + 8, y + 8, 1.8, s.hatTrim, 1, 140); } }
    for (let i = 0; i < 8; i++) crease(t, 0, 10 + i * 14, 64, 4 + i * 14 + rng.range(-4, 4), 128, 12 + i * 14, c, 0.3);
  }
  if (s.hat === 'beanie') { rib(t, 0, 66, W, 62, c); t.rect(0, 66, W, 2, dk(c, 0.45), 0.7, 90); for (let x = 0; x < W; x += 6) t.rect(x, 0, 1.3, 66, dk(c, 0.3), 0.5, 106); }
  if (s.hat === 'durag') { for (let i = 0; i < 4; i++) t.line(10 + i * 34, 0, 20 + i * 34, 100, lt(c, 0.5), 2, 0.2, 150); seam(t, 0, 54, W, 54, c); }
  if (s.hat === 'church') { t.rect(0, 80, W, 12, s.hatTrim, 1, 150, 150); t.rect(0, 80, W, 1.5, dk(s.hatTrim, 0.4), 0.7); t.rect(0, 91, W, 1.5, dk(s.hatTrim, 0.4), 0.7); t.poly([[56, 78], [74, 78], [80, 98], [50, 98]], lt(s.hatTrim, 0.2), 0.9, 160); }
  if (s.hat === 'fedora') { t.rect(0, 84, W, 12, s.hatTrim, 1, 150, 150); t.rect(0, 84, W, 1.5, dk(s.hatTrim, 0.4), 0.7); t.curve(8, 30, 64, 44, 120, 30, dk(c, 0.5), 3, 0.5); }
  if (s.hat === 'cop') { t.rect(0, 80, W, 10, s.hatTrim, 0.9, 150, 140); if (s.hatLogo === '*') { const pts: Array<[number, number]> = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; pts.push([64 + Math.cos(a) * (i % 2 ? 4 : 9), 58 + Math.sin(a) * (i % 2 ? 4 : 9)]); } t.poly(pts, s.hatTrim, 1, 156, 90); } }
  if (s.hat === 'hijab') { for (let i = 0; i < 11; i++) { const x0 = i * 12 - 10; t.curve(x0, 0, x0 + 14 + rng.range(-6, 6), 60, x0 - 8, 128, dk(c, 0.5), 3.2, 0.2); t.curve(x0 + 4, 0, x0 + 18 + rng.range(-6, 6), 60, x0 - 4, 128, lt(c, 0.35), 2.2, 0.16); } for (let x = 0; x < W; x += 2) t.rect(x, 0, 0.7, H, lt(c, 0.1), 0.05); }
  t.rect(0, 112, W, 16, '#000000', 0.16);
}


// ---------------------------------------------------------------- clothes on one clean body (skin mode)
// The body's UV islands (scripts/people-pipeline.mjs) span fixed heights of the MakeHuman body: torso tile from y 1.56 (shoulder top) to 0.96,
// upper arm 1.52 to 1.12, forearm 1.24 to 0.89, thigh 1.07 to 0.49, shin 0.58 to 0.08, pelvis 1.09 to 0.86 (male shape; the female one sits ~7 cm
// lower, the fit is close enough at a hem line). The garment painters above draw in a "design" space (hem to neck, elbow to shoulder ...);
// each tile gets an affine (rows = design * sy + yo) that lands the design on those heights, plus a pre-fill for the rows outside it.
const NECK_BASE = 1.482, TORSO_TOP = 1.56, TORSO_H = 0.6, PELVIS_TOP = 1.093, PELVIS_H = 0.237, HEM_Y = 1.007;
function hangOf(s: PedSpec): number {
  const k = s.top.kind;
  if (s.top.long) return 0.1;
  return ['puffer', 'hoodie', 'jacket', 'cardigan'].includes(k) ? 0.09 : k === 'tee' || k === 'blouse' || k === 'jersey' ? 0 : 0.04;
}
function paintClothesOnSkin(T: (n: HiTile, sy?: number, yo?: number) => L, s: PedSpec, rng: Rng): void {
  const p = s.top, b = s.bottom, tb = bottomFabric(s), fab = outerFabric(s);
  const baseTop = p.kind === 'vest' ? (p.under ?? '#222') : p.kind === 'apron' ? (p.under ?? '#2d7a4a') : p.color;
  const hemTop = HEM_Y - hangOf(s), sy = (NECK_BASE - hemTop) / TORSO_H, yo = ((TORSO_TOP - NECK_BASE) / TORSO_H) * 128;
  // torso: the top's cloth everywhere first (collar and shoulder rows above the design), then the design
  const tt = T('torso');
  fabric(tt, 0, 0, 256, 128, baseTop, p.kind === 'vest' || p.kind === 'apron' ? 'jersey' : fab, rng);
  paintTorso(T('torso', sy, yo), s, rng);
  const hemRow = yo + 128 * sy;
  if (hemRow < 126) {
    // a short top ends above the bottom of the tile: the waistband and belt of the trousers show below it
    fabric(tt, 0, hemRow, 256, 128 - hemRow, b.color, tb, rng);
    if (b.kind !== 'skirt' && b.kind !== 'leggings') { tt.rect(0, hemRow + 2, 256, 5, b.kind === 'jeans' ? '#5a3c22' : '#161616', 1, 150, 120); tt.rect(120, hemRow + 2, 16, 5, '#c8b04a', 1, 172, 60); }
    tt.rect(0, hemRow, 256, 3, '#000000', 0.3);
  }
  // arms: sleeves from the shoulder to the wrist (skin where short sleeves end)
  const longSl = p.sleeves === 'long', clothC = baseTop;
  for (const [tile, ssy, syo, lower] of [['upperArm', 0.759, 11.3, false], ['foreArm', 0.8, 22.6, true]] as const) {
    const raw = T(tile);
    if (longSl) fabric(raw, 0, 0, 128, 128, clothC, p.kind === 'vest' || p.kind === 'apron' ? 'jersey' : fab, rng); else raw.rect(0, 0, 128, 128, s.skin, 1, 128, 140);
    sleeve(T(tile, ssy, syo), s, rng, lower);
  }
  paintHand(T('hand'), s, rng);
  paintNeck(T('neck'), s, rng);
  // legs
  const kind = b.kind;
  for (const [tile, ssy, syo, lower] of [['thigh', 0.766, 18.1, false], ['shin', 0.88, 7.4, true]] as const) {
    const raw = T(tile);
    raw.rect(0, 0, 128, 128, s.skin, 1, 128, 140);
    if (kind !== 'skirt' && !(kind === 'shorts' && lower)) {
      if (kind === 'shorts') fabric(raw, 0, 0, 128, 20, b.color, tb, rng); else fabric(raw, 0, 0, 128, 128, b.color, tb, rng);
    }
    paintLeg(T(tile, ssy, syo), s, rng, lower);
  }
  // pelvis: trousers or skirt, with the top's hem hanging over the first rows
  const pr = T('pelvis');
  fabric(pr, 0, 0, 128, 40, b.color, tb, rng);
  paintPelvis(T('pelvis', 1.101, 35.6), s, rng);
  const rows = Math.min(128, Math.max(0, ((PELVIS_TOP - hemTop) / PELVIS_H) * 128));
  if (rows > 2 && !(p.long && p.kind !== 'dress' && false)) {
    const hc = p.color, isRib = ['hoodie', 'puffer', 'jersey', 'tracksuit'].includes(p.kind);
    fabric(pr, 0, 0, 128, rows, baseTop, p.kind === 'vest' || p.kind === 'apron' ? 'jersey' : fab, rng);
    if (p.kind === 'puffer') baffles(pr.at({ x: HI_RECTS.pelvis.x, y: HI_RECTS.pelvis.y, w: 128, h: Math.max(1, Math.round(rows)) }), 128, rows, hc, 20, 2);
    if (p.pattern === 'plaid') plaid(pr.at({ x: HI_RECTS.pelvis.x, y: HI_RECTS.pelvis.y, w: 128, h: Math.max(1, Math.round(rows)) }), 128, rows, hc);
    if (isRib) rib(pr, 0, Math.max(0, rows - 11), 128, Math.min(11, rows), p.kind === 'tracksuit' ? p.trim : hc);
    else { pr.rect(0, rows - 7, 128, 7, dk(hc, 0.08), 1, 124); stitch(pr, 0, rows - 5, 128, rows - 5, lt(hc, 0.3), 0.55); }
    pr.rect(0, rows, 128, 4, '#000000', 0.3); pr.rect(0, rows + 4, 128, 3, '#000000', 0.12);
  }
  // a long coat carries on down the thighs
  if (p.long && p.kind !== 'dress') {
    for (const [tile] of [['thigh'], ['shin']] as const) { const th = T(tile); if (tile === 'thigh') { fabric(th, 0, 0, 128, 128, p.color, fab, rng); th.rect(0, 112, 128, 16, dk(p.color, 0.18), 1, 138); stitch(th, 0, 114, 128, 114, lt(p.color, 0.3), 0.5); th.rect(63, 0, 2, 112, '#000000', 0.3, 96); } }
  }
}

// ---------------------------------------------------------------- the whole atlas

export function pedHiSpec(variant: number): PedSpec {
  return PED_SPECS[((Math.floor(variant) % PED_SPECS.length) + PED_SPECS.length) % PED_SPECS.length];
}

/**
 * Paint all three maps of a variant. `height` and `rough` may be null (phone tier: albedo only). All canvases are size x size.
 */
export function paintPedHi(albedo: CanvasRenderingContext2D, height: CanvasRenderingContext2D | null, rough: CanvasRenderingContext2D | null, size: number, rng: Rng, variant: number): void {
  const s = pedHiSpec(variant);
  const k = size / PEDHI_ATLAS;
  const root = new L(albedo, height, rough, k);
  const T = (n: HiTile, sy = 1, yo = 0): L => root.at(HI_RECTS[n], sy, yo);
  const full = PEDHI_ATLAS * k;
  if (height) { height.fillStyle = '#808080'; height.fillRect(0, 0, full, full); }
  if (rough) { rough.fillStyle = '#d8d8d8'; rough.fillRect(0, 0, full, full); }
  albedo.fillStyle = '#808080'; albedo.fillRect(0, 0, full, full);
  paintHead(T('head'), s, rng);
  paintGear(T('gear'), s, rng);
  paintHair(T('hair'), s, rng);
  paintHat(T('hat'), s, rng);
  if (peopleMode() === 'skin') paintClothesOnSkin(T, s, rng); else {
    paintTorso(T('torso'), s, rng);
    sleeve(T('upperArm'), s, rng, false);
    sleeve(T('foreArm'), s, rng, true);
    paintHand(T('hand'), s, rng);
    paintNeck(T('neck'), s, rng);
    paintLeg(T('thigh'), s, rng, false);
    paintLeg(T('shin'), s, rng, true);
    paintPelvis(T('pelvis'), s, rng);
  }
  paintShoe(T('shoe'), s, rng);
}
