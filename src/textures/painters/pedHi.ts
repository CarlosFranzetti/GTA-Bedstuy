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
import { PED_SPECS, PIXEL_FONT, mixHex, type PedSpec, type PxRect } from './ped';

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
  constructor(readonly a: CanvasRenderingContext2D, readonly h: CanvasRenderingContext2D | null, readonly r: CanvasRenderingContext2D | null, readonly k: number, readonly ox = 0, readonly oy = 0) {}
  at(r: PxRect): L { return new L(this.a, this.h, this.r, this.k, r.x, r.y); }
  private fill(ctx: CanvasRenderingContext2D | null, c: string, al: number, f: (k: number) => void): void {
    if (!ctx) return;
    ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = c; ctx.strokeStyle = c; f(this.k); ctx.restore();
  }
  rect(x: number, y: number, w: number, h: number, c: string, al = 1, hv?: number, rv?: number): void {
    const k = this.k, X = (this.ox + x) * k, Y = (this.oy + y) * k;
    this.fill(this.a, c, al, () => this.a.fillRect(X, Y, w * k, h * k));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => this.h!.fillRect(X, Y, w * k, h * k));
    if (rv !== undefined) this.fill(this.r, gray(rv), al, () => this.r!.fillRect(X, Y, w * k, h * k));
  }
  poly(pts: ReadonlyArray<readonly [number, number]>, c: string, al = 1, hv?: number): void {
    const k = this.k;
    const path = (ctx: CanvasRenderingContext2D): void => { ctx.beginPath(); pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo((this.ox + x) * k, (this.oy + y) * k) : ctx.lineTo((this.ox + x) * k, (this.oy + y) * k))); ctx.closePath(); ctx.fill(); };
    this.fill(this.a, c, al, () => path(this.a));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => path(this.h!));
  }
  disc(x: number, y: number, r: number, c: string, al = 1, hv?: number): void {
    const k = this.k;
    const path = (ctx: CanvasRenderingContext2D): void => { ctx.beginPath(); ctx.arc((this.ox + x) * k, (this.oy + y) * k, r * k, 0, Math.PI * 2); ctx.fill(); };
    this.fill(this.a, c, al, () => path(this.a));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => path(this.h!));
  }
  /** a soft blob: stacked translucent discs */
  soft(x: number, y: number, r: number, c: string, al: number, steps = 5): void {
    for (let i = 0; i < steps; i++) this.disc(x, y, r * (1 - i / steps), c, al / steps);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, w = 1, al = 1, hv?: number): void {
    const k = this.k;
    const path = (ctx: CanvasRenderingContext2D): void => { ctx.lineWidth = w * k; ctx.beginPath(); ctx.moveTo((this.ox + x0) * k, (this.oy + y0) * k); ctx.lineTo((this.ox + x1) * k, (this.oy + y1) * k); ctx.stroke(); };
    this.fill(this.a, c, al, () => path(this.a));
    if (hv !== undefined) this.fill(this.h, gray(hv), al, () => path(this.h!));
  }
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, c: string, w = 1, al = 1): void {
    const k = this.k;
    this.fill(this.a, c, al, () => { this.a.lineWidth = w * k; this.a.beginPath(); this.a.moveTo((this.ox + x0) * k, (this.oy + y0) * k); this.a.quadraticCurveTo((this.ox + cx) * k, (this.oy + cy) * k, (this.ox + x1) * k, (this.oy + y1) * k); this.a.stroke(); });
  }
  noise(w: number, h: number, rng: Rng, n: number, cols: readonly string[], al: number, sz = 1): void {
    for (let i = 0; i < n; i++) this.rect(rng.range(0, w), rng.range(0, h), sz, sz, cols[Math.floor(rng.next() * cols.length)], al);
  }
  text(str: string, x: number, y: number, s: number, c: string): void {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = PIXEL_FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '#') this.rect(cx + q * s, y + r * s, s, s, c, 1, 150);
      cx += 4 * s;
    }
  }
}
const gray = (v: number): string => { const h = Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return `#${h}${h}${h}`; };

// ---------------------------------------------------------------- face

function paintHead(t: L, s: PedSpec, rng: Rng): void {
  const f = s.face, W = 256;
  const X = (m: number): number => 128 + (m / HEAD_MAP.halfW) * 128;
  const Y = (m: number): number => (1 - (m - HEAD_MAP.yMin) / (HEAD_MAP.yMax - HEAD_MAP.yMin)) * 256;
  const skin = s.skin;
  t.rect(0, 0, W, W, skin, 1, 128, 140);
  // form shading: darker toward the sides and under the jaw, light on the forehead, cheek bones and nose bridge
  for (let i = 0; i < 18; i++) { const a = 0.03; t.rect(0, 0, 40 - i * 2.2, W, '#000000', a); t.rect(W - (40 - i * 2.2), 0, 40 - i * 2.2, W, '#000000', a); }
  for (let i = 0; i < 24; i++) t.rect(0, Y(1.56) + i * 2, W, 256, '#000000', 0.022);
  t.soft(128, Y(1.725), 70, lt(skin, 0.5), 0.35);
  t.soft(X(-0.05), Y(1.62), 26, lt(skin, 0.45), 0.3); t.soft(X(0.05), Y(1.62), 26, lt(skin, 0.45), 0.3);
  t.soft(X(-0.052), Y(1.6), 22, '#b03030', 0.12); t.soft(X(0.052), Y(1.6), 22, '#b03030', 0.12);
  // pores and fine grain
  t.noise(W, W, rng, 1400, [dk(skin, 0.22), lt(skin, 0.15)], 0.16, 1);
  // hairline: the hair cap covers the top, this keeps a believable edge under caps and for fades
  if (s.hair !== 'bald') { t.rect(0, 0, W, Y(1.738), s.hairColor); for (let i = 0; i < 14; i++) t.rect(X(-0.07) + i * 9, Y(1.738) - 2 + rng.range(-3, 5), 8, 8, s.hairColor, 0.7); }
  // eye sockets, lids and eyes
  const ey = Y(1.664);
  for (const sx of [-1, 1]) {
    const cx = X(sx * 0.034);
    t.soft(cx, ey - 2, 30, dk(skin, 0.55), 0.5, 8);
    const ew = f.eyes === 'wide' ? 22 : 20, eh = f.eyes === 'sleepy' ? 6 : f.eyes === 'wide' ? 11 : 9;
    t.poly([[cx - ew, ey], [cx - ew * 0.4, ey - eh], [cx + ew * 0.4, ey - eh], [cx + ew, ey], [cx + ew * 0.4, ey + eh * 0.6], [cx - ew * 0.4, ey + eh * 0.6]], '#efe9e2');
    t.disc(cx - sx * 1.5, ey - 0.5, eh * 0.62, '#4a3220'); t.disc(cx - sx * 1.5, ey - 0.5, eh * 0.4, '#16100c'); t.disc(cx - sx * 1.5 - 2, ey - 3, 1.8, '#ffffff', 0.9);
    t.curve(cx - ew, ey, cx, ey - eh - 4, cx + ew, ey, '#1a1210', 2.4, 0.9);                 // upper lid line
    t.curve(cx - ew * 0.8, ey + 2, cx, ey + eh * 0.7, cx + ew * 0.8, ey + 2, dk(skin, 0.4), 1.3, 0.55);
    if (f.lashes) t.curve(cx - ew, ey - 1, cx, ey - eh - 6, cx + ew, ey - 1, '#0c0806', 3, 0.9);
    // brows: many fine strokes
    const by = Y(1.682) - (f.brows === 'arched' ? 3 : 0), bw = f.brows === 'thin' ? 4 : 8;
    const bc = s.hair === 'bald' ? '#2a1e16' : dk(s.hairColor, 0.1);
    for (let i = 0; i < 26; i++) { const x = cx - 22 + i * 1.75; const yy = by + (f.brows === 'arched' ? -Math.sin((i / 26) * Math.PI) * 6 : -((i / 26) * 3 * -sx)) + rng.range(-1, 1); t.line(x, yy + bw / 2, x + 2 * sx, yy - bw / 2, bc, 2.2, 0.9); }
    if (f.glasses) { t.rect(cx - 26, ey - 15, 52, 30, f.glasses, 0.0); t.line(cx - 26, ey - 15, cx + 26, ey - 15, f.glasses, 2.4); t.line(cx - 26, ey + 15, cx + 26, ey + 15, f.glasses, 2.4); t.line(cx - 26, ey - 15, cx - 26, ey + 15, f.glasses, 2.4); t.line(cx + 26, ey - 15, cx + 26, ey + 15, f.glasses, 2.4); t.rect(cx - 25, ey - 14, 50, 28, '#cfe3ee', 0.14); }
  }
  if (f.glasses) t.line(X(-0.01), ey - 6, X(0.01), ey - 6, f.glasses, 2.4);
  // nose: bridge light, shaded side planes, nostrils, tip
  t.rect(X(-0.004), Y(1.69), 8, Y(1.63) - Y(1.69), lt(skin, 0.3), 0.35);
  t.poly([[X(-0.024), Y(1.632)], [X(-0.008), Y(1.675)], [X(-0.012), Y(1.635)]], dk(skin, 0.4), 0.35);
  t.poly([[X(0.024), Y(1.632)], [X(0.008), Y(1.675)], [X(0.012), Y(1.635)]], dk(skin, 0.4), 0.35);
  t.soft(X(-0.013), Y(1.627), 6, '#20100c', 0.55); t.soft(X(0.013), Y(1.627), 6, '#20100c', 0.55);
  t.soft(128, Y(1.628), 9, lt(skin, 0.4), 0.3); t.rect(X(-0.014), Y(1.62), 36, 3, dk(skin, 0.5), 0.3);
  // mouth: upper and lower lip, dark line, small highlight
  const my = Y(1.585), lipc = f.lips ?? mixHex(skin, '#7a3a3a', 0.45);
  const grin = f.mouth === 'grin' ? 9 : f.mouth === 'smile' ? 5 : f.mouth === 'frown' ? -5 : 0;
  t.poly([[X(-0.026), my + grin * 0.2], [X(-0.01), my - 8], [128, my - 5], [X(0.01), my - 8], [X(0.026), my + grin * 0.2], [128, my + 1]], dk(lipc, 0.1));
  t.poly([[X(-0.026), my + grin * 0.2], [128, my + 1], [X(0.026), my + grin * 0.2], [X(0.017), my + 12], [128, my + 15], [X(-0.017), my + 12]], lipc);
  t.soft(128, my + 9, 8, lt(lipc, 0.45), 0.35);
  if (f.mouth === 'grin') t.rect(X(-0.02), my + 1, 40, 5, '#efe9e2', 0.9);
  t.curve(X(-0.028), my + grin * 0.2, 128, my + 2 - grin * 0.4, X(0.028), my + grin * 0.2, '#2a1210', 2, 0.85);
  t.soft(128, my + 22, 11, dk(skin, 0.45), 0.2);   // chin dimple shadow
  if (f.mustache) for (let i = 0; i < 90; i++) t.line(X(rng.range(-0.03, 0.03)), my - rng.range(6, 14), X(rng.range(-0.03, 0.03)), my - rng.range(3, 9), s.hair === 'bald' ? '#241a14' : dk(s.hairColor, 0.15), 1.4, 0.6);
  if (f.stubble) t.noise(W, W, rng, 900, ['#000000'], 0.25, 1.3);
  if (f.stubble) t.rect(0, 0, W, Y(1.6), s.skin, 0.0);
  if (f.beard) { const bc = s.hair === 'bald' ? '#1e1610' : s.hairColor; t.poly([[X(-0.085), Y(1.64)], [X(-0.07), Y(1.58)], [X(-0.04), Y(1.535)], [X(0.04), Y(1.535)], [X(0.07), Y(1.58)], [X(0.085), Y(1.64)], [X(0.06), Y(1.57)], [X(0.03), my + 18], [X(-0.03), my + 18], [X(-0.06), Y(1.57)]], bc, 0.92); for (let i = 0; i < 400; i++) t.rect(rng.range(30, 226), rng.range(Y(1.6), Y(1.535)), 1.5, 3, lt(bc, 0.2), 0.3); t.poly([[X(-0.026), my - 2], [X(0.026), my - 2], [X(0.02), my + 14], [X(-0.02), my + 14]], lipc); }
  // ear hints on the side (the planar map stretches the sides)
  t.soft(4, Y(1.65), 14, dk(skin, 0.3), 0.4); t.soft(W - 4, Y(1.65), 14, dk(skin, 0.3), 0.4);
}

// ---------------------------------------------------------------- cloth helpers

function weave(t: L, w: number, h: number, c: string, spacing: number, al: number): void {
  for (let y = 0; y < h; y += spacing) t.rect(0, y, w, 0.7, dk(c, 0.35), al, 118);
  for (let x = 0; x < w; x += spacing) t.rect(x, 0, 0.7, h, lt(c, 0.12), al * 0.7, 138);
}
function folds(t: L, w: number, h: number, c: string, rng: Rng, n: number): void {
  for (let i = 0; i < n; i++) { const x = rng.range(0, w), y = rng.range(0, h - 20); const len = rng.range(14, 34); t.line(x, y, x + rng.range(-6, 6), y + len, dk(c, 0.5), rng.range(1.5, 3.5), 0.22, 100); t.line(x + 2, y, x + 2 + rng.range(-5, 5), y + len, lt(c, 0.25), 1.5, 0.15, 150); }
}
function baffles(t: L, w: number, h: number, c: string, step: number, y0 = 0): void {
  for (let y = y0; y < h; y += step) { t.rect(0, y, w, 2.2, dk(c, 0.55), 0.8, 70, 230); t.rect(0, y + 2.2, w, 5, lt(c, 0.14), 0.45, 175, 150); t.rect(0, y + step - 7, w, 5, dk(c, 0.18), 0.4, 108); }
}
function plaid(t: L, w: number, h: number, c: string): void {
  for (let x = 6; x < w; x += 20) { t.rect(x, 0, 8, h, dk(c, 0.5), 0.45, 120); t.rect(x + 12, 0, 1.2, h, '#e8d8a0', 0.5); }
  for (let y = 4; y < h; y += 20) { t.rect(0, y, w, 8, dk(c, 0.5), 0.45, 120); t.rect(0, y + 12, w, 1.2, '#e8d8a0', 0.5); }
}
function printFront(t: L, s: PedSpec, cx: number, cy: number, big: number): void {
  const p = s.top;
  switch (p.print) {
    case 'text': { const txt = p.printText ?? ''; const sc = Math.max(2, Math.min(7, Math.floor(big / Math.max(1, txt.length * 4 - 1)))); t.text(txt, cx - (txt.length * 4 * sc - sc) / 2, cy - (5 * sc) / 2, sc, p.printColor); break; }
    case 'star': { const pts: Array<[number, number]> = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 7 : 17; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } t.poly(pts, p.printColor); break; }
    case 'bolt': t.poly([[cx + 5, cy - 18], [cx - 11, cy + 3], [cx - 1, cy + 3], [cx - 6, cy + 18], [cx + 11, cy - 4], [cx + 1, cy - 4]], p.printColor); break;
    case 'heart': t.disc(cx - 8, cy - 4, 9, p.printColor); t.disc(cx + 8, cy - 4, 9, p.printColor); t.poly([[cx - 17, cy - 1], [cx + 17, cy - 1], [cx, cy + 18]], p.printColor); break;
    case 'bars': for (let i = 0; i < 5; i++) { const hh = [8, 16, 24, 14, 8][i]; t.rect(cx - 24 + i * 10, cy + 12 - hh, 7, hh + 4, p.printColor); } break;
    case 'badge': t.poly([[cx, cy - 12], [cx + 11, cy - 5], [cx + 8, cy + 10], [cx - 8, cy + 10], [cx - 11, cy - 5]], p.printColor); t.rect(cx - 3, cy - 3, 6, 8, dk(p.printColor, 0.4)); break;
    default:
  }
}

function paintTorso(t: L, s: PedSpec, rng: Rng): void {
  const p = s.top, W = 256, H = 128, c = p.color, cx = 128;
  const isVest = p.kind === 'vest', isApron = p.kind === 'apron';
  const baseC = isVest ? (p.under ?? '#222') : isApron ? (p.under ?? '#2d7a4a') : c;
  t.rect(0, 0, W, H, baseC, 1, 128, p.kind === 'puffer' ? 150 : 235);
  weave(t, W, H, baseC, 3, 0.1);
  folds(t, W, H, baseC, rng, 16);
  t.rect(0, 0, W, 10, lt(baseC, 0.06), 0.5);
  // the chest: a soft light, the flanks and the hem darker
  t.soft(cx, 52, 56, lt(baseC, 0.25), 0.25);
  t.rect(0, 0, 26, H, '#000000', 0.12); t.rect(W - 26, 0, 26, H, '#000000', 0.12); t.rect(96, 0, 64, 3, '#000000', 0.0);
  switch (p.kind) {
    case 'hoodie': t.poly([[cx - 40, 0], [cx + 40, 0], [cx + 22, 22], [cx, 30], [cx - 22, 22]], dk(c, 0.3), 1, 100); t.rect(cx - 36, 82, 72, 36, dk(c, 0.12), 0.7, 112); t.rect(cx - 36, 82, 72, 2, dk(c, 0.5), 0.8, 90); t.line(cx - 12, 24, cx - 13, 52, '#e8e8e8', 2.5); t.line(cx + 12, 24, cx + 13, 52, '#e8e8e8', 2.5); break;
    case 'puffer': baffles(t, W, H, c, 18, 6); t.rect(cx - 1.5, 0, 3, H, '#bdbdbd', 0.9, 160, 120); t.poly([[cx - 36, 0], [cx + 36, 0], [cx + 30, 10], [cx - 30, 10]], dk(c, 0.35)); break;
    case 'jersey': t.poly([[0, 0], [52, 0], [64, 60], [0, 60]], p.trim); t.poly([[W, 0], [W - 52, 0], [W - 64, 60], [W, 60]], p.trim); t.rect(0, H - 14, W, 14, p.trim); t.rect(0, H - 22, W, 3, p.trim, 0.8); break;
    case 'vest': t.rect(30, 0, 70, H, c); t.rect(W - 100, 0, 70, H, c); for (const y of [50, 92]) { t.rect(30, y, 70, 9, '#dadada', 1, 160, 130); t.rect(W - 100, y, 70, 9, '#dadada', 1, 160, 130); } t.rect(cx - 2, 0, 4, H, '#444'); break;
    case 'jacket': case 'cardigan': t.rect(cx - 34, 0, 68, H, p.under ?? '#f4f4f4', 1, 128); t.poly([[cx - 42, 0], [cx - 4, 0], [cx - 8, 50], [cx - 22, 128], [cx - 42, 128]], dk(c, 0.04), 1, 120); t.poly([[cx + 42, 0], [cx + 4, 0], [cx + 8, 50], [cx + 22, 128], [cx + 42, 128]], dk(c, 0.04), 1, 120); t.poly([[cx - 42, 0], [cx - 18, 0], [cx - 4, 36], [cx - 24, 30]], lt(c, 0.12), 1, 150); t.poly([[cx + 42, 0], [cx + 18, 0], [cx + 4, 36], [cx + 24, 30]], lt(c, 0.12), 1, 150); if (p.tie) t.poly([[cx - 5, 6], [cx + 5, 6], [cx + 7, 22], [cx + 3, 70], [cx, 78], [cx - 3, 70], [cx - 7, 22]], p.tie, 1, 150); if (p.kind === 'cardigan') for (let y = 20; y < 120; y += 22) t.disc(cx - 14, y, 3.5, '#e8dcc0', 1, 170); else for (let y = 70; y < 128; y += 26) t.disc(cx - 14, y, 3, dk(c, 0.5), 1, 90); if (p.pattern === 'plaid') plaid(t, W, H, c); break;
    case 'uniform': t.poly([[cx - 26, 0], [cx + 26, 0], [cx + 16, 24], [cx, 34], [cx - 16, 24]], '#f1efe6'); t.poly([[cx - 26, 0], [cx - 6, 0], [cx, 34], [cx - 20, 24]], dk(c, 0.12), 1, 150); t.poly([[cx + 26, 0], [cx + 6, 0], [cx, 34], [cx + 20, 24]], dk(c, 0.12), 1, 150); if (p.tie) t.poly([[cx - 4, 10], [cx + 4, 10], [cx + 4, 70], [cx, 76], [cx - 4, 70]], p.tie); t.rect(0, 108, W, 12, '#10141c', 1, 150, 90); t.rect(cx - 9, 108, 18, 12, '#c8b04a', 1, 170, 60); t.rect(cx + 42, 40, 34, 26, dk(c, 0.18), 1, 140); t.rect(cx + 42, 40, 34, 2, p.printColor, 0.8); t.text('POLICE', 0 + 6, 60, 1.6, '#e8e8e8'); break;
    case 'scrubs': t.poly([[cx - 28, 0], [cx + 28, 0], [cx, 44]], s.skin); t.poly([[cx - 28, 0], [cx - 18, 0], [cx, 28]], dk(c, 0.2), 1, 150); t.poly([[cx + 28, 0], [cx + 18, 0], [cx, 28]], dk(c, 0.2), 1, 150); t.rect(cx - 62, 70, 36, 30, dk(c, 0.12), 1, 130); t.line(cx - 14, 8, cx - 4, 78, '#f4f4f4', 1.6, 0.8); break;
    case 'blouse': case 'dress': t.poly([[cx - 36, 0], [cx + 36, 0], [cx + 18, 26], [cx - 18, 26]], s.skin); t.poly([[cx - 36, 0], [cx - 18, 0], [cx - 8, 28]], dk(c, 0.15), 1, 150); t.poly([[cx + 36, 0], [cx + 18, 0], [cx + 8, 28]], dk(c, 0.15), 1, 150); t.rect(0, 92, W, 6, p.trim, 0.9, 140); break;
    case 'tracksuit': t.poly([[cx - 36, 0], [cx + 36, 0], [cx + 28, 12], [cx - 28, 12]], dk(c, 0.15), 1, 150); t.rect(cx - 1.5, 12, 3, H, '#e0e0e0', 1, 160, 110); t.rect(0, 0, 8, H, p.trim); t.rect(W - 8, 0, 8, H, p.trim); break;
    case 'apron': t.poly([[cx - 54, 6], [cx + 54, 6], [cx + 62, H], [cx - 62, H]], c, 1, 120); t.rect(cx - 56, 0, 10, 14, c); t.rect(cx + 46, 0, 10, 14, c); t.poly([[cx - 26, 0], [cx + 26, 0], [cx + 16, 18], [cx - 16, 18]], s.skin); t.rect(cx - 36, 78, 72, 30, dk(c, 0.15), 1, 112); t.rect(cx - 36, 78, 72, 2, dk(c, 0.5), 0.8, 90); break;
    default: // tee: round neck
      t.poly([[cx - 26, 0], [cx + 26, 0], [cx + 18, 16], [cx, 22], [cx - 18, 16]], s.skin); t.curve(cx - 26, 0, cx, 30, cx + 26, 0, dk(c, 0.3), 3, 0.8);
  }
  if (p.pattern === 'plaid' && p.kind !== 'jacket') plaid(t, W, H, c);
  if (!isVest && p.kind !== 'jacket' && p.kind !== 'cardigan' && p.print !== 'stripes' && p.print !== 'none') printFront(t, s, p.kind === 'uniform' ? cx + 59 : p.kind === 'scrubs' ? cx - 44 : cx, p.kind === 'hoodie' ? 62 : p.kind === 'uniform' ? 52 : 60, p.kind === 'uniform' ? 28 : 60);
  if (p.print === 'stripes' && !isVest) { t.rect(0, 80, W, 5, p.printColor); t.rect(0, 92, W, 5, p.printColor); }
  // back print (hoodie / tee / jersey number)
  if ((p.kind === 'hoodie' || p.kind === 'tee') && p.print === 'text') t.text(p.printText ?? '', 0 + 10, 70, 2, p.printColor);
  if (p.kind === 'jersey') t.text(p.printText ?? '', 4, 40, 4, p.printColor);
  // drawn-on shadow under the arms and the collar
  t.rect(0, 0, W, 4, '#000000', 0.2); t.rect(0, 118, W, 10, '#000000', 0.16);
}

function sleeve(t: L, s: PedSpec, rng: Rng, lower: boolean): void {
  const p = s.top, W = 128, H = 128;
  const c = p.kind === 'vest' ? (p.under ?? '#222') : p.kind === 'apron' ? (p.under ?? '#2d7a4a') : p.color;
  t.rect(0, 0, W, H, s.skin, 1, 128, 150);
  t.noise(W, H, rng, 500, [dk(s.skin, 0.2), lt(s.skin, 0.12)], 0.14);
  t.rect(0, 0, 24, H, '#000000', 0.1); t.rect(W - 24, 0, 24, H, '#000000', 0.1);
  const cover = p.sleeves === 'long' ? (lower ? 106 : 128) : p.sleeves === 'short' ? (lower ? 0 : 74) : p.kind === 'jersey' ? (lower ? 0 : 18) : 0;
  if (cover > 0) {
    t.rect(0, 0, W, cover, c, 1, p.kind === 'puffer' ? 150 : 128, p.kind === 'puffer' ? 160 : 235);
    weave(t, W, cover, c, 3, 0.1); folds(t, W, cover, c, rng, 7);
    if (p.kind === 'puffer') baffles(t, W, cover, c, 18, 4);
    if (p.kind === 'tracksuit') t.rect(52, 0, 24, cover, p.trim);
    if (p.pattern === 'plaid') plaid(t, W, cover, c);
    if (p.kind === 'uniform' && !lower) { t.rect(24, 30, 40, 30, p.printColor, 0.5); }
    if (lower) { t.rect(0, cover - 12, W, 12, p.kind === 'tracksuit' ? p.trim : dk(c, 0.25), 1, 150); if (p.under && (p.kind === 'jacket' || p.kind === 'cardigan')) t.rect(0, cover, W, 8, p.under); }
    else if (p.sleeves === 'short') t.rect(0, cover - 8, W, 8, dk(c, 0.2), 1, 150);
    t.rect(0, cover - 3, W, 3, '#000000', 0.25);
  }
  t.rect(0, 0, W, 8, '#000000', 0.22); // shadow where the arm leaves the shoulder
}

function paintHand(t: L, s: PedSpec, rng: Rng): void {
  t.rect(0, 0, 128, 64, s.skin, 1, 128, 150);
  t.noise(128, 64, rng, 300, [dk(s.skin, 0.22), lt(s.skin, 0.14)], 0.15);
  for (let i = 1; i < 4; i++) t.line(i * 32, 30, i * 32, 64, dk(s.skin, 0.4), 1.5, 0.5);
  t.rect(0, 28, 128, 2, dk(s.skin, 0.35), 0.5); t.rect(0, 0, 128, 8, dk(s.skin, 0.2), 0.4);
  t.rect(0, 0, 18, 64, '#000000', 0.1); t.rect(110, 0, 18, 64, '#000000', 0.1);
}
function paintNeck(t: L, s: PedSpec, rng: Rng): void {
  t.rect(0, 0, 128, 64, s.skin, 1, 128, 150);
  t.noise(128, 64, rng, 200, [dk(s.skin, 0.22), lt(s.skin, 0.12)], 0.14);
  t.rect(0, 0, 128, 16, '#000000', 0.12); t.rect(0, 48, 128, 16, '#000000', 0.28); // under the jaw shadow at the top (v up), collar shadow at the bottom
  t.rect(0, 0, 128, 4, '#000000', 0.0);
}

function legCloth(s: PedSpec, lower: boolean): string | null {
  const k = s.bottom.kind;
  if (k === 'skirt') return null;
  if (k === 'shorts') return lower ? null : s.bottom.color;
  return s.bottom.color;
}
function paintLeg(t: L, s: PedSpec, rng: Rng, lower: boolean): void {
  const W = 128, H = 128, k = s.bottom.kind, c = legCloth(s, lower);
  t.rect(0, 0, W, H, s.skin, 1, 128, 150);
  t.noise(W, H, rng, 500, [dk(s.skin, 0.22), lt(s.skin, 0.12)], 0.14);
  if (k === 'skirt' && lower && s.top.kind === 'dress') t.rect(0, 0, W, 38, s.bottom.color);
  if (c) {
    const len = k === 'shorts' && !lower ? 92 : H;
    const denim = k === 'jeans';
    t.rect(0, 0, W, len, c, 1, 128, denim ? 215 : k === 'leggings' ? 215 : 235);
    if (denim) { weave(t, W, len, c, 2.5, 0.22); for (let i = 0; i < 9; i++) t.soft(rng.range(10, 118), rng.range(10, len - 10), rng.range(8, 16), lt(c, 0.3), 0.18); }
    else weave(t, W, len, c, 3, 0.1);
    folds(t, W, len, c, rng, 10);
    t.rect(0, 0, 22, len, '#000000', 0.1); t.rect(W - 22, 0, 22, len, '#000000', 0.1);
    t.rect(63, 0, 2, len, dk(c, 0.5), 0.6, 95); // outer seam (also catches light)
    if (denim) { t.rect(61, 0, 1, len, '#d8b060', 0.5); t.rect(66, 0, 1, len, '#d8b060', 0.5); if (lower) t.rect(0, 112, W, 16, lt(c, 0.12), 1, 160); }
    if (k === 'trousers') { t.rect(56, 0, 16, len, lt(c, 0.1), 0.3, 150); if (lower) t.rect(0, 108, W, 20, dk(c, 0.25), 1, 140); }
    if (k === 'sweats') { t.rect(0, 0, 6, len, s.bottom.trim); t.rect(W - 6, 0, 6, len, s.bottom.trim); if (lower) t.rect(0, 104, W, 24, s.bottom.trim, 1, 160, 235); }
    if (k === 'cargo') { if (!lower) { t.rect(20, 54, 88, 40, dk(c, 0.13), 1, 150); t.rect(20, 54, 88, 3, dk(c, 0.5), 0.8, 90); } else t.rect(0, 108, W, 20, dk(c, 0.22), 1, 140); }
    if (k === 'shorts' && !lower) t.rect(0, 84, W, 8, s.bottom.trim, 1, 150);
  }
  if (lower && (k === 'shorts' || k === 'skirt')) { t.rect(0, 92, W, 36, '#f4f4f4', 1, 150, 235); t.rect(0, 92, W, 7, s.shoes.accent); }
  t.rect(0, 0, W, 6, '#000000', 0.15);
}
function paintPelvis(t: L, s: PedSpec, rng: Rng): void {
  const b = s.bottom, c = b.color, W = 128, H = 128;
  const denim = b.kind === 'jeans';
  t.rect(0, 0, W, H, c, 1, 128, denim ? 215 : 235);
  if (denim) weave(t, W, H, c, 2.5, 0.22); else weave(t, W, H, c, 3, 0.1);
  folds(t, W, H, c, rng, 14);
  t.rect(0, 0, W, 6, dk(c, 0.3), 1, 110);
  if (b.kind === 'skirt') for (let x = 4; x < W; x += 9) { t.rect(x, 8, 2, 120, dk(c, 0.3), 0.55, 105); t.rect(x + 2, 8, 2, 120, lt(c, 0.1), 0.35, 150); }
  else { t.rect(0, 6, W, 8, b.kind === 'jeans' ? '#5a3c22' : '#161616', 0.9, 160, 120); t.rect(60, 4, 8, 12, '#c8b04a', 1, 175, 50); t.rect(58, 18, 2, 40, dk(c, 0.45), 0.8, 95); t.rect(68, 18, 2, 40, dk(c, 0.45), 0.8, 95); }
  if (b.kind === 'jeans') { t.poly([[8, 14], [40, 14], [38, 44], [10, 44]], dk(c, 0.1), 0.5, 120); t.poly([[88, 14], [120, 14], [118, 44], [90, 44]], dk(c, 0.1), 0.5, 120); }
  if (b.kind === 'cargo') { t.rect(6, 50, 26, 34, dk(c, 0.14), 1, 150); t.rect(96, 50, 26, 34, dk(c, 0.14), 1, 150); }
  t.rect(0, 0, 20, H, '#000000', 0.1); t.rect(W - 20, 0, 20, H, '#000000', 0.1); t.rect(0, 118, W, 10, '#000000', 0.2);
}
function paintShoe(t: L, s: PedSpec, rng: Rng): void {
  const sh = s.shoes, W = 128, H = 128;
  const leather = sh.sole === '#1a1a1a' || sh.color === '#101010' || sh.color === '#161616' || sh.color === '#3a2a1c';
  t.rect(0, 0, W, H, sh.color, 1, 128, leather ? 90 : 200);
  folds(t, W, H, sh.color, rng, 8);
  t.noise(W, 100, rng, 300, [dk(sh.color, 0.25), lt(sh.color, 0.2)], 0.15);
  t.rect(0, 0, W, 20, lt(sh.color, 0.08), 0.4);
  t.rect(0, 74, W, 30, dk(sh.color, 0.1), 0.6);                       // toe box
  t.rect(48, 8, 32, 62, lt(sh.color, 0.12), 0.5, 140);                // tongue / lace panel at the front
  for (let y = 12; y < 66; y += 9) { t.rect(50, y, 28, 2, '#f0f0f0', 0.9, 150); t.rect(50, y + 2, 28, 1, '#000000', 0.25, 105); }
  t.rect(0, 40, W, 5, sh.accent, 0.9); t.rect(0, 46, W, 2, sh.accent, 0.6);   // side stripe
  t.rect(0, 100, W, 28, sh.sole, 1, 160, 235);                         // sole
  t.rect(0, 100, W, 3, dk(sh.sole, 0.3), 1, 100); t.rect(0, 120, W, 8, dk(sh.sole, 0.25), 1, 110);
  t.rect(0, 0, 18, H, '#000000', 0.12); t.rect(W - 18, 0, 18, H, '#000000', 0.12);
}

function paintGear(t: L, s: PedSpec, rng: Rng): void {
  const gc = s.gearColor;
  t.rect(0, 0, 256, 64, gc, 1, 128, 200);
  weave(t, 256, 64, gc, 3, 0.12); folds(t, 256, 64, gc, rng, 6);
  t.rect(0, 0, 256, 8, lt(gc, 0.15), 0.5);
  t.rect(96, 20, 64, 30, dk(gc, 0.14), 1, 150); t.rect(96, 20, 64, 2, dk(gc, 0.5), 0.8, 90); t.rect(124, 8, 8, 12, '#d0d0d0', 1, 170, 60);
  t.rect(0, 54, 256, 10, '#000000', 0.2);
}

function paintHair(t: L, s: PedSpec, rng: Rng): void {
  const c = s.hairColor;
  t.rect(0, 0, 128, 128, c, 1, 140, 150);
  for (let i = 0; i < 150; i++) { const x = rng.range(0, 128); t.line(x, 0, x + rng.range(-2, 2), 128, rng.chance(0.5) ? dk(c, 0.45) : lt(c, 0.28), rng.range(0.7, 1.6), 0.4, rng.chance(0.5) ? 100 : 170); }
  t.soft(64, 20, 50, lt(c, 0.4), 0.18);
  t.rect(0, 100, 128, 28, '#000000', 0.12);
}
function paintHat(t: L, s: PedSpec, rng: Rng): void {
  const c = s.hatColor, W = 128, H = 128;
  t.rect(0, 0, W, H, c, 1, 128, s.hat === 'cop' || s.hat === 'church' ? 150 : 215);
  weave(t, W, H, c, 3, 0.12); folds(t, W, H, c, rng, 5);
  t.rect(0, 0, W, 10, lt(c, 0.12), 0.4);
  t.rect(0, 112, W, 16, '#000000', 0.16);
  if (s.hat === 'headwrap') for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) { if (((x + y) / 16) % 2 === 0) t.poly([[x + 8, y + 2], [x + 14, y + 8], [x + 8, y + 14], [x + 2, y + 8]], s.hatTrim, 0.95, 150); else t.disc(x + 8, y + 8, 3.5, '#f4f1e0', 0.95, 150); }
  if (s.hat === 'beanie') for (let x = 0; x < W; x += 5) t.rect(x, 0, 1.6, H, dk(c, 0.3), 0.6, 110);
  if (s.hat === 'church') { t.rect(0, 84, W, 8, s.hatTrim); }
  if (s.hat === 'cop') { t.rect(0, 84, W, 8, s.hatTrim, 0.9); }
  if (s.hat === 'hardhat') t.rect(0, 70, W, 5, lt(c, 0.2), 0.7);
  // front logo (the front of a dome is the middle of the tile)
  if (s.hatLogo === '*') { const pts: Array<[number, number]> = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; pts.push([64 + Math.cos(a) * (i % 2 ? 6 : 14), 52 + Math.sin(a) * (i % 2 ? 6 : 14)]); } t.poly(pts, s.hatTrim, 1, 150); }
  else if (s.hatLogo) { const sc = s.hatLogo.length > 2 ? 3 : 4; t.text(s.hatLogo, 64 - (s.hatLogo.length * 4 * sc - sc) / 2, 52 - (5 * sc) / 2, sc, s.hatTrim); }
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
  const T = (n: HiTile): L => root.at(HI_RECTS[n]);
  const full = PEDHI_ATLAS * k;
  if (height) { height.fillStyle = '#808080'; height.fillRect(0, 0, full, full); }
  if (rough) { rough.fillStyle = '#d8d8d8'; rough.fillRect(0, 0, full, full); }
  albedo.fillStyle = '#808080'; albedo.fillRect(0, 0, full, full);
  paintHead(T('head'), s, rng);
  paintGear(T('gear'), s, rng);
  paintHair(T('hair'), s, rng);
  paintHat(T('hat'), s, rng);
  paintTorso(T('torso'), s, rng);
  sleeve(T('upperArm'), s, rng, false);
  sleeve(T('foreArm'), s, rng, true);
  paintHand(T('hand'), s, rng);
  paintNeck(T('neck'), s, rng);
  paintLeg(T('thigh'), s, rng, false);
  paintLeg(T('shin'), s, rng, true);
  paintPelvis(T('pelvis'), s, rng);
  paintShoe(T('shoe'), s, rng);
}
