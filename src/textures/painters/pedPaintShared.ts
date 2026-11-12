/**
 * Shared bits of the people painter (pedSkinPaint.ts and its pedPaint* parts): colour helpers, a few cheap noises, the
 * in-place pixel type the shader writes into, and `makeLook`, which turns one person (spec + body landmarks) into the
 * numbers the face and cloth painters use. Everything is deterministic by the person's id. No lettering anywhere.
 */
import type { BakeInput } from './pedSkinPaint';

export type RGB = [number, number, number];

const hexCache = new Map<string, RGB>();
export function rgb(hex: string): RGB {
  let c = hexCache.get(hex);
  if (!c) {
    const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0');
    c = [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
    hexCache.set(hex, c);
  }
  return c;
}
export const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const css = (c: RGB): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** smoothstep; a > b gives a falling edge */
export const sst = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
/** a soft bump: 1 at d = 0, about 0.37 at d = w */
export const g2 = (d: number, w: number): number => Math.exp(-(d / w) * (d / w));
/** a line profile: 1 on the line, 0 beyond w either side */
export const ln = (d: number, w: number): number => { const a = Math.abs(d) / w; return a >= 1 ? 0 : 1 - a * a * (3 - 2 * a); };
/** 1 between a and b (soft by e) */
export const band = (a: number, b: number, x: number, e: number): number => sst(a - e, a + e, x) * sst(b + e, b - e, x);
export const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
export const rnd = (i: number): number => { let h = Math.imul(i + 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

export function ihash(a: number, b: number, c: number, s: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1) ^ Math.imul(s + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** smooth value noise, 0..1 */
export function vn2(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = ihash(ix, iy, 0, s), b = ihash(ix + 1, iy, 0, s), c = ihash(ix, iy + 1, 0, s), d = ihash(ix + 1, iy + 1, 0, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function vn3(x: number, y: number, z: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(ihash(ix, iy, iz, s), ihash(ix + 1, iy, iz, s), u), l(ihash(ix, iy + 1, iz, s), ihash(ix + 1, iy + 1, iz, s), u), v),
    l(l(ihash(ix, iy, iz + 1, s), ihash(ix + 1, iy, iz + 1, s), u), l(ihash(ix, iy + 1, iz + 1, s), ihash(ix + 1, iy + 1, iz + 1, s), u), v), w);
}

/** the colour being built for one texel; every operation works in place so the bake allocates nothing per texel */
export class Px {
  r = 0; g = 0; b = 0;
  set(c: RGB): this { this.r = c[0]; this.g = c[1]; this.b = c[2]; return this; }
  copy(p: Px): this { this.r = p.r; this.g = p.g; this.b = p.b; return this; }
  mix(c: RGB, t: number): this { if (t <= 0) return this; if (t > 1) t = 1; this.r += (c[0] - this.r) * t; this.g += (c[1] - this.g) * t; this.b += (c[2] - this.b) * t; return this; }
  mixP(p: Px, t: number): this { if (t <= 0) return this; if (t > 1) t = 1; this.r += (p.r - this.r) * t; this.g += (p.g - this.g) * t; this.b += (p.b - this.b) * t; return this; }
  mul(k: number): this { this.r *= k; this.g *= k; this.b *= k; return this; }
  /** multiply by a tint (shadow colours that shift the hue a little) */
  tint(c: RGB, t: number): this { if (t <= 0) return this; this.r *= 1 + (c[0] / 255 - 1) * t; this.g *= 1 + (c[1] / 255 - 1) * t; this.b *= 1 + (c[2] / 255 - 1) * t; return this; }
  /** towards white */
  lite(t: number): this { if (t <= 0) return this; this.r += (255 - this.r) * t; this.g += (255 - this.g) * t; this.b += (255 - this.b) * t; return this; }
}

export interface Tex { x: number; y: number; z: number; nx: number; ny: number; nz: number; wh: number; wt: number; wa: number; wl: number; q: number }

export type Expr = 'neutral' | 'tired' | 'amused';
export type FabricId = 'jersey' | 'fleece' | 'knit' | 'denim' | 'leather' | 'wool' | 'nylon' | 'canvas' | 'poplin' | 'tricot' | 'mesh';
export type ShoeStyle = 'sneaker' | 'boot' | 'dress';

/** everything the painters need to know about one person, computed once per bake */
export function makeLook(b: BakeInput) {
  const s = b.spec, lm = b.landmarks, R = b.rig, top = s.top, bot = s.bottom, face = s.face, id = s.id;
  const skin = rgb(s.skin);
  const female = s.sex === 'f', old = s.age === 'old', kid = s.age === 'kid', teen = s.age === 'teen', kidish = kid || teen;
  const hs = (lm.crownY - lm.chinY) / 0.2285, wsx = lm.eyeX / 0.029, edm = (lm.eyeY - lm.chinY) / hs;
  const eyeRing = b.headRings.reduce((bb, r) => (Math.abs(r[0] - lm.eyeY) < Math.abs(bb[0] - lm.eyeY) ? r : bb));
  const grp = s.group ?? 'wh';
  const eh = hash(id + 'ex');
  let expr: Expr = eh < 0.5 ? 'neutral' : eh < 0.78 ? 'tired' : 'amused';
  if (face.mouth === 'smile' || face.mouth === 'grin') expr = hash(id + 'sm') < 0.85 ? 'amused' : 'neutral';
  if (face.mouth === 'frown' || face.eyes === 'sleepy') expr = 'tired';
  if (kidish && expr === 'tired') expr = 'neutral';
  const er = hash(id + 'eye');
  const irisC: RGB = ((): RGB => {
    const brownOnly = grp === 'ba' || grp === 'ca' || grp === 'ea' || grp === 'sa';
    const pBrown = brownOnly ? 0.94 : grp === 'wh' || grp === 'hj' ? 0.45 : 0.8;
    if (er < pBrown) return [56 + 20 * hash(id + 'e1'), 36 + 12 * hash(id + 'e1'), 24 + 8 * hash(id + 'e1')];
    if (er < pBrown + (1 - pBrown) * 0.45) return [96, 74, 40];            // hazel
    if (er < pBrown + (1 - pBrown) * 0.72) return [70, 86, 60];            // green
    return [62, 84, 112];                                                  // blue-grey
  })();
  const hairC = rgb(s.hairColor);
  const lipBase = face.lips ? mixc(skin, rgb(face.lips), 0.3) : mixc(skin, [150, 66, 66], female ? 0.4 : 0.32);
  const topC = rgb(top.color), botC = rgb(bot.color), underC = top.under ? rgb(top.under) : null;
  const k = top.kind;
  const open = !!top.open && !!underC;
  const fabric: FabricId = ((): FabricId => {
    if (top.fabric) return ({ canvas: 'canvas', denim: 'denim', leather: 'leather', wool: 'wool', fleece: 'fleece', knit: 'knit' } as const)[top.fabric];
    switch (k) {
      case 'tee': case 'dress': return 'jersey';
      case 'jersey': return 'mesh';
      case 'hoodie': return 'fleece';
      case 'puffer': return 'nylon';
      case 'jacket': return 'wool';
      case 'cardigan': return 'knit';
      case 'blouse': case 'uniform': return 'poplin';
      case 'scrubs': return 'poplin';
      case 'tracksuit': return 'tricot';
      case 'vest': case 'apron': return 'canvas';
    }
  })();
  const shoeStyle: ShoeStyle = s.shoes.high ? 'boot' : ((k === 'jacket' || k === 'uniform' || k === 'blouse') && bot.kind === 'trousers' && rgb(s.shoes.color)[0] < 60) ? 'dress' : 'sneaker';
  // how worn the clothes are (work outfits more than office ones)
  const grime = 0.25 + 0.5 * hash(id + 'gr') + (k === 'vest' || bot.kind === 'cargo' ? 0.25 : 0);
  const sh = skin;
  return {
    s, lm, R, top, bot, face, id, k, hs, wsx, edm, zc: eyeRing[2], rzH: eyeRing[3], hemTop: b.topHem,
    female, old, kid, teen, kidish, expr, grp, open, underC, fabric, shoeStyle, grime,
    skin, hairC, topC, botC,
    trimC: rgb(top.trim), botTrim: rgb(bot.trim), irisC,
    skinSh: [Math.min(255, sh[0] * 0.74 + 10), sh[1] * 0.6, sh[2] * 0.56] as RGB,
    skinHi: mixc(skin, [255, 238, 220], 0.2),
    blush: mixc(skin, [200, 92, 80], 0.38),
    skinCool: mixc(skin, [104, 76, 98], 0.3),
    skinWarm: mixc(skin, [214, 110, 90], 0.4),
    lipC: lipBase, lipDark: mulc(lipBase, 0.72), lipHi: mixc(lipBase, [255, 220, 210], 0.28),
    mouthMw: 0.0215 + 0.003 * hash(id + 'mw'), eyeK: 0.92 + 0.14 * hash(id + 'ek'),
    shY: R.shoulderL[1], shX: Math.abs(R.shoulderL[0]), elY: R.elbowL[1], knY: R.kneeL[1], wrY: R.wristL[1], anY: lm.ankleY, hipY: R.hipL[1], hipX: Math.abs(R.hipL[0]),
    torsoZ: -0.035,
    shoeTop: lm.ankleY + (s.shoes.high ? 0.13 : 0.045),
    // hand extent (filled by the bake from the mesh)
    handTipY: R.wristL[1] - 0.17, handAxis: 0 as 0 | 1,
  };
}
export type Look = ReturnType<typeof makeLook>;
