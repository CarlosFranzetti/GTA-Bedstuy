/**
 * The wardrobe (PEOPLE6). A person is a set of SLOTS (top, optional layer over it, bottom, shoes, hair, headwear, accessories, bag) and every slot has a pool of
 * garments. A pedestrian draws each slot from the pools, weighted by a LOOK (work, street, smart, sport, church, elder, teen, service uniform, night out), by age and
 * sex, by a SEASON hint and by compatibility rules (no sandals in a puffer, no hood with a tie, a pencil skirt only with dress tops ...), all from one seeded stream:
 * the same seed is always the same person. Each garment also has COLOURWAYS (a pool of colours and a trim rule).
 *
 * The result is an ordinary PedSpec (so the geometry and the painters need no second path): `top.kind` and `bottom.kind` are the FAMILY of the garment
 * (the shape and paint code that exists), `top.style` / `bottom.cut` / `shoes.kind` the cut inside it. Generated people are registered after the named roster
 * (ped.ts registerSpec); a person's id is a hash of everything visible about them, so two people with the same combination share one texture bake, and the
 * number of bakes alive at once is capped (`pickWardrobeVariant` snaps new people onto an existing one of the same group, sex and age when the cap is reached).
 * No lettering, no logos, no numbers on any garment.
 */
import { outfitWeights, type Outfit, type Way } from './pedOutfits';
export { OUTFITS } from './pedOutfits';
import { Rng } from '@/core/Rng';
import { BODY_POOLS, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { PED_SPECS, registerSpec, type BottomCut, type HairStyle, type HatStyle, type PedSpec, type PopGroup, type ShoeKind, type TopStyle } from './ped';
import { PALETTE } from './pedRoster';

export type Look = 'work' | 'street' | 'smart' | 'sport' | 'church' | 'elder' | 'teen' | 'service' | 'night';
export type Season = 'cold' | 'mild' | 'warm';
export const LOOKS: readonly Look[] = ['work', 'street', 'smart', 'sport', 'church', 'elder', 'teen', 'service', 'night'];
const LK: Record<string, Look> = { w: 'work', s: 'street', m: 'smart', p: 'sport', c: 'church', e: 'elder', t: 'teen', u: 'service', n: 'night' };
type Age = 'kid' | 'teen' | 'adult' | 'old';
/** true while it rains (setWardrobeWeather): rain gear is likelier, sandals and slides are not worn */
let WET = false;
type Top = PedSpec['top'];
type Bottom = PedSpec['bottom'];

// ---------------------------------------------------------------- colourways (grounded, slightly desaturated city colour; saturated colour is an accent)

const P = (s: string): string[] => s.split(' ');
export const COLOURWAYS: Record<string, string[]> = {
  tee: P('#b4b0a4 #9c9a94 #7c8088 #3a3f48 #1c1c20 #a8a290 #bdb49c #6a8098 #8a5a52 #4a5a48 #4a5a78 #7a5a42 #5a5448 #6f7f8c'),
  smartShirt: P('#b8b8b0 #a8b4be #98a8b8 #b4a8a8 #b8b09a #98a4b0 #a8a8b4 #8c9ca4'),
  knit: P('#a89e88 #2f3a58 #3a4a40 #5a2a34 #8a7048 #7c8088 #4a3a30 #b0aca0 #54424e'),
  denim: P('#4d6c98 #34506f #232b3b #1f2a3a #5a7494 #2e3848 #151a22 #667f9a'),
  dark: P('#1c1c20 #2a2c32 #34363e #121216 #2f3442 #3a3e4a'),
  suit: P('#2f3442 #2d2638 #1c1c24 #3a3e4a #4a4a52 #243a52 #3a3028 #5a5348'),
  chino: P('#a89a78 #7a6a4a #3a4a3a #4a4a40 #6a5f48 #c8bca0 #2f3a48 #8a6a4a'),
  work: P('#6a5f48 #4a4a40 #3a4a3a #5b4a30 #2f3442 #7a7a72 #8a6a2a #3a3f48'),
  bright: P('#8a4a52 #3a5078 #8a5a38 #3a5a46 #5a3a6a #9a8040 #3a6a7a #7a4a32 #3a6a68 #7a3a3a'),
  pastel: P('#b4a0a2 #a0aab4 #a8b0a0 #b4aa94 #a8a2b2 #a0b0aa #b8a898'),
  team: P('#8a3228 #2a4a7a #2d5a3a #9a5a2a #5a3a6a #b4b4b4 #14161a #9a8040 #3a5a88'),
  coat: P('#7a6a4c #2f3442 #1c1c20 #3a4a5a #5a5a40 #6a5c4c #5a3434 #8a8478'),
  puffer: P('#1c1c20 #3a4a30 #2f3a58 #7a3028 #a8582a #9a8040 #6c7078 #aaa69a #34586e'),
  scrub: P('#3a6a74 #2f3a58 #7a9ca8 #6a2a36 #4a6a4c #5a4a70 #3a7066'),
  floral: P('#8a4a58 #9a8040 #3a6074 #5a3a6a #3a5a46 #a8582a #aaa69a #7a4a32'),
  trackTrim: P('#aaa69a #a8582a #9a8040 #8a3228 #2a4a7a #14161a'),
  white: P('#b8b8b2 #aaa8a2 #1c1c20 #98968f'),
  skirt: P('#1c1c20 #2f3442 #6c7078 #5a2a34 #34483a #7a6a4c #b0aa96 #3a3248'),
  shoeDark: P('#161616 #1c1c20 #2a2220 #3a2a22'),
  shoeBrown: P('#5b3a24 #7a4a2a #8a6a3a #3a2418 #6a2a2a'),
  shoeTan: P('#98804e #7a5e36 #8a6a48 #a89870'),
  shoeWhite: P('#b8b8b4 #aaa6a0 #b4b4b0 #98968f'),
  shoeBright: P('#aaa8a2 #2a4a7a #8a3228 #a8582a #2d5a3a #6c7078 #14161a #9a8040'),
  shoeNude: P('#a89078 #1c1c20 #5a2a34 #98806a #2f3442'),
  // PEOPLE7
  rain: P('#a89228 #a8582a #2f3a58 #3a5a74 #1c1c20 #36583e #7a3028'),
  rainBoot: P('#a89228 #2d4a3a #1c1c20 #2f3a58 #7a3028 #3a3f48'),
  varsity: P('#2a3a5a #5a2030 #1f3a2c #1c1c20 #46285a #8a7040'),
  lab: P('#b8b8b2 #aaa8a2 #a8b4be #b0a894'),
  fleece: P('#3a4a40 #2f3a58 #6a4e34 #6c7078 #8a7040 #7a3028 #1c1c20 #46607a'),
  leather: P('#1c1c20 #2a1c18 #4a2a1c #3a2a22 #5b3a24'),
  cord: P('#7a5a3a #4a5a3a #6a3a3a #a89a78 #3a3a48 #8a6a2a'),
  camp: P('#6a8098 #9a8040 #3a5a46 #8a4a58 #b0aa96 #3a6074 #7a4a32 #54406a'),
  flannel: P('#7a3028 #2f4a6a #34503a #8a6a2a #4a3228 #3a3f48 #5a2a34'),
  tennis: P('#b8b8b2 #2f3a58 #1c1c20 #34483a #8a4a58 #b0aa96'),
  workDark: P('#2f3442 #3a3f48 #4a4a40 #5b4a30 #1c1c20'),
};
const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const rgbOf = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const shade = (h: string, k: number): string => { const c = rgbOf(h); return `#${c.map((x) => hex2(x * k)).join('')}`; };
const dist = (a: string, b: string): number => { const p = rgbOf(a), q = rgbOf(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

// ---------------------------------------------------------------- the garments

interface G<T> {
  /** weights by look, e.g. 'w3 s1' (w work, s street, m smart, p sport, c church, e elder, t teen, u service, n night) */
  k: string;
  /** warmth: 0 light, 1 mid, 2 heavy */
  w: 0 | 1 | 2;
  /** colour pool, and the pool of the trim / print colour (default: a darker shade of the colour) */
  c: string; tr?: string;
  /** fields written to the spec */
  p: Partial<T>;
  /** ages (a adult, o old, t teen, k kid; default 'ato'), sex ('m' / 'f': default both) */
  a?: string; sx?: 'm' | 'f';
  /** headwear this garment brings (a hood) */
  hat?: HatStyle;
  /** a bottom that must go with it, and layers (outer garments over a base top) */
  only?: string;
  /** PEOPLE7: weight multiplier [in dry weather, in rain] (rain gear, sandals) */
  wx?: [number, number];
}
const top = (k: string, w: 0 | 1 | 2, c: string, p: Partial<Top>, o: Partial<G<Top>> = {}): G<Top> => ({ k, w, c, p, ...o });
const T0 = { print: 'none', printColor: '#ffffff' } as const;

/** base tops: worn alone or under a layer (then only their colour shows) */
export const BASE_TOPS: Record<string, G<Top>> = {
  tee: top('s3 t3 p1 w1 n1 e1 u1', 0, 'tee', { kind: 'tee', sleeves: 'short', ...T0 }, { a: 'atok' }),
  pocketTee: top('s2 w3 e1 u1', 0, 'tee', { kind: 'tee', sleeves: 'short', style: 'pocket', ...T0 }),
  longTee: top('s2 t2 w1 n1 p1', 1, 'tee', { kind: 'tee', sleeves: 'long', ...T0 }, { a: 'atok' }),
  polo: top('w2 m2 u2 e2 s1', 0, 'tee', { kind: 'tee', sleeves: 'short', style: 'polo', ...T0 }),
  shirt: top('m2 w2 c3 e2 n1 s1', 1, 'smartShirt', { kind: 'blouse', sleeves: 'long', style: 'shirt', ...T0 }),
  dressShirt: top('m3 w1 c3 e1', 1, 'smartShirt', { kind: 'blouse', sleeves: 'long', style: 'shirt', ...T0 }, { sx: 'm', a: 'ato' }),
  blouse: top('m2 w2 c2 e2 n2 s1', 1, 'pastel', { kind: 'blouse', sleeves: 'short', ...T0 }, { sx: 'f' }),
  tank: top('p2 s1 n1 t1', 0, 'tee', { kind: 'tee', sleeves: 'none', ...T0 }, { a: 'at' }),
  sweater: top('s2 e3 m1 w1 c1 t1', 1, 'knit', { kind: 'tee', sleeves: 'long', style: 'sweater', fabric: 'knit', pattern: 'heather', ...T0 }),
  hoodieUp: top('s3 t3 p1 w1', 1, 'tee', { kind: 'hoodie', sleeves: 'long', zip: false, pattern: 'heather', ...T0 }, { hat: 'hood', a: 'atk' }),
  hoodieDown: top('s3 t3 p1 w1', 1, 'tee', { kind: 'hoodie', sleeves: 'long', zip: false, pattern: 'heather', ...T0 }, { hat: 'hoodDown', a: 'atk' }),
  zipHoodie: top('s2 t2 p2 w1', 1, 'dark', { kind: 'hoodie', sleeves: 'long', zip: true, ...T0 }, { hat: 'hoodDown' }),
  bballJersey: top('p2 t2 s1', 0, 'team', { kind: 'jersey', sleeves: 'none', ...T0 }, { sx: 'm', a: 'atk' }),
  footballShirt: top('p2 t2 s1', 0, 'team', { kind: 'jersey', sleeves: 'short', style: 'football', print: 'stripes', printColor: '#e8e8ec' }, { a: 'atk' }),
  crewSweat: top('s3 t3 p2 w1 e1', 1, 'tee', { kind: 'tee', sleeves: 'long', fabric: 'fleece', pattern: 'heather', ...T0 }, { a: 'atok' }),
  campShirt: top('s2 e2 n1 m1', 0, 'camp', { kind: 'blouse', sleeves: 'short', style: 'shirt', pattern: 'stripe', ...T0 }, { sx: 'm', a: 'ato' }),
  flannel: top('s3 w3 t1', 1, 'flannel', { kind: 'blouse', sleeves: 'long', style: 'workshirt', fabric: 'canvas', pattern: 'plaid', ...T0 }, { tr: 'tee' }),
  knitPolo: top('m2 e3 c1', 1, 'knit', { kind: 'tee', sleeves: 'short', style: 'polo', fabric: 'knit', ...T0 }, { sx: 'm', a: 'ao' }),
  scrubs: top('u3', 0, 'scrub', { kind: 'scrubs', sleeves: 'short', ...T0 }, { only: 'scrubs' }),
};
/** layers: outer garments over a base top (the base shows in the opening, or in the collar) */
export const LAYERS: Record<string, G<Top>> = {
  shirtOpen: top('s3 w3 t2', 1, 'tee', { kind: 'jacket', sleeves: 'long', open: true, fabric: 'canvas', style: 'workshirt', pattern: 'plaid', ...T0 }, { tr: 'tee' }),
  cardigan: top('e5 m2 w1 c3 s1', 1, 'knit', { kind: 'cardigan', sleeves: 'long', ...T0 }, { a: 'ato' }),
  cardiganOpen: top('e2 m1 s1 w1', 1, 'knit', { kind: 'cardigan', sleeves: 'long', open: true, ...T0 }),
  trackJacket: top('p3 s1 t1 e1', 1, 'dark', { kind: 'tracksuit', sleeves: 'long', zip: true, style: 'track', ...T0 }, { tr: 'trackTrim', a: 'at' }),
  denimJacket: top('s3 t2 n1 w1', 1, 'denim', { kind: 'jacket', sleeves: 'long', open: true, fabric: 'denim', style: 'denim', ...T0 }),
  denimClosed: top('s2 t1 w1', 1, 'denim', { kind: 'jacket', sleeves: 'long', fabric: 'denim', style: 'denim', zip: true, ...T0 }),
  bomber: top('s3 t3 n2', 1, 'dark', { kind: 'jacket', sleeves: 'long', open: true, fabric: 'leather', style: 'bomber', ...T0 }),
  bomberNylon: top('s2 t3 p1', 1, 'puffer', { kind: 'jacket', sleeves: 'long', open: true, fabric: 'canvas', style: 'bomber', ...T0 }, { a: 'atk' }),
  pufferShort: top('s3 t3 w2 p1', 2, 'puffer', { kind: 'puffer', sleeves: 'long', ...T0 }, { a: 'atk' }),
  pufferLong: top('s2 e2 m1 w1', 2, 'puffer', { kind: 'puffer', sleeves: 'long', long: true, ...T0 }, { wx: [1, 1.5] }),
  overcoat: top('m3 e2 c2 n1 w1', 2, 'coat', { kind: 'jacket', sleeves: 'long', long: true, fabric: 'wool', style: 'overcoat', ...T0 }),
  trench: top('m2 s1 w1 e1', 1, 'coat', { kind: 'jacket', sleeves: 'long', long: true, fabric: 'canvas', style: 'trench', ...T0 }, { wx: [1, 2] }),
  parka: top('s2 w2 t1 e1', 2, 'puffer', { kind: 'puffer', sleeves: 'long', long: true, style: 'parka', ...T0 }, { hat: 'hood', wx: [1, 2] }),
  blazer: top('m3 w1 c3 n2 s1 e3', 1, 'suit', { kind: 'jacket', sleeves: 'long', style: 'blazer', ...T0 }),
  workVest: top('w3 u2', 1, 'work', { kind: 'vest', sleeves: 'long', pattern: 'none', ...T0 }, { tr: 'trackTrim' }),
  fleece: top('s2 w3 e2 p1', 1, 'fleece', { kind: 'jacket', sleeves: 'long', zip: true, fabric: 'fleece', style: 'track', ...T0 }, { wx: [1, 1] }),
  windbreaker: top('p3 s2 t2 w1', 1, 'puffer', { kind: 'tracksuit', sleeves: 'long', zip: true, style: 'track', ...T0 }, { tr: 'tee', wx: [1, 2.2] }),
  varsity: top('t3 s2 p1', 1, 'varsity', { kind: 'jacket', sleeves: 'long', zip: true, fabric: 'wool', style: 'bomber', pattern: 'block', ...T0 }, { tr: 'white', a: 'atk' }),
  peacoat: top('m3 e2 c2 n2 s1', 2, 'coat', { kind: 'jacket', sleeves: 'long', fabric: 'wool', style: 'blazer', ...T0 }),
  leatherCoat: top('n3 s1 m1', 2, 'leather', { kind: 'jacket', sleeves: 'long', long: true, fabric: 'leather', style: 'trench', ...T0 }, { sx: 'm', a: 'a' }),
  workJacket: top('w3 u1 s1', 1, 'work', { kind: 'jacket', sleeves: 'long', zip: true, fabric: 'canvas', style: 'workshirt', ...T0 }, { sx: 'm' }),
  rainSlicker: top('s1 w2 u2 e1', 1, 'rain', { kind: 'jacket', sleeves: 'long', long: true, fabric: 'canvas', style: 'trench', ...T0 }, { hat: 'hood', wx: [0.12, 7] }),
  labCoat: top('u2', 0, 'lab', { kind: 'jacket', sleeves: 'long', long: true, fabric: 'canvas', style: 'trench', ...T0 }, { only: 'scrubs' }),
  apron: top('u3 w1', 0, 'work', { kind: 'apron', sleeves: 'short', ...T0 }),
};
/** one-piece garments (a dress, a tunic, a boiler suit, a tracksuit set): they fill the top and the bottom slot */
export interface OnePiece { k: string; w: 0 | 1 | 2; c: string; top: Partial<Top>; bottom: Partial<Bottom>; a?: string; sx?: 'm' | 'f'; tr?: string }
export const ONE_PIECE: Record<string, OnePiece> = {
  sundress: { k: 's3 t3 n1 p0', w: 0, c: 'floral', top: { kind: 'dress', sleeves: 'none', pattern: 'print' }, bottom: { kind: 'skirt', cut: 'knee' }, a: 'atk', sx: 'f' },
  shirtDress: { k: 'm2 w2 c2 e3 s1', w: 1, c: 'pastel', top: { kind: 'dress', sleeves: 'short', style: 'shirtdress' }, bottom: { kind: 'skirt', cut: 'knee' }, sx: 'f' },
  wrapDress: { k: 'm2 n3 c1 s1', w: 1, c: 'bright', top: { kind: 'dress', sleeves: 'long', style: 'wrap' }, bottom: { kind: 'skirt', cut: 'wrap' }, a: 'at', sx: 'f' },
  kaftan: { k: 'c2 e2 s2 m1', w: 0, c: 'floral', top: { kind: 'dress', sleeves: 'short', style: 'kaftan', pattern: 'print' }, bottom: { kind: 'skirt', long: true, cut: 'maxi' }, a: 'ao', sx: 'f' },
  boilerSuit: { k: 'w3 u2', w: 1, c: 'work', top: { kind: 'uniform', sleeves: 'long', style: 'boiler', zip: true }, bottom: { kind: 'cargo', cut: 'patch' }, a: 'at' },
  trackSet: { k: 'p3 s2 e2 t1', w: 1, c: 'dark', top: { kind: 'tracksuit', sleeves: 'long', zip: true, style: 'track' }, bottom: { kind: 'sweats', cut: 'stripe' }, tr: 'trackTrim' },
};
/** a long tunic over leggings or trousers (top.long on a non-dress top is the coat cut) */
const TUNIC: G<Top> = top('c2 e2 s2 m1', 0, 'floral', { kind: 'blouse', sleeves: 'short', long: true, style: 'kaftan', pattern: 'print', ...T0 }, { sx: 'f', a: 'ato' });

const bot = (k: string, w: 0 | 1 | 2, c: string, p: Partial<Bottom>, o: Partial<G<Bottom>> = {}): G<Bottom> => ({ k, w, c, p, ...o });
export const BOTTOMS: Record<string, G<Bottom>> = {
  jeansStraight: bot('s3 w2 t1 e1 n1', 1, 'denim', { kind: 'jeans', cut: 'straight' }, { a: 'atok' }),
  jeansSlim: bot('s3 t3 n2 m1', 1, 'denim', { kind: 'jeans', cut: 'slim' }, { a: 'at' }),
  jeansBaggy: bot('s2 t3 p1', 1, 'denim', { kind: 'jeans', cut: 'baggy' }, { a: 'atk' }),
  jeansCropped: bot('s2 t2 n1 m1', 1, 'denim', { kind: 'jeans', cut: 'crop' }, { sx: 'f', a: 'at' }),
  chinos: bot('s2 w2 m2 e3 u1', 1, 'chino', { kind: 'trousers', cut: 'straight' }),
  suitTrousers: bot('m3 c3 w1 n2 e4', 1, 'suit', { kind: 'trousers', cut: 'straight' }, { a: 'ato' }),
  cargo: bot('w3 s2 t1', 1, 'work', { kind: 'cargo', cut: 'pocket' }, { sx: 'm' }),
  cargoF: bot('w1 s2 t1', 1, 'work', { kind: 'cargo', cut: 'pocket' }, { sx: 'f' }),
  sweatsCuffed: bot('s2 p2 t2 e1', 1, 'dark', { kind: 'sweats', cut: 'cuffed' }, { a: 'atok' }),
  trackPants: bot('p3 s1 t1', 1, 'dark', { kind: 'sweats', cut: 'stripe' }, { tr: 'trackTrim' }),
  workTrousers: bot('w3 u1', 1, 'work', { kind: 'trousers', cut: 'patch' }, { sx: 'm' }),
  bballShorts: bot('p3 s1 t2', 0, 'team', { kind: 'shorts', cut: 'long' }, { a: 'atk', sx: 'm' }),
  cargoShorts: bot('s2 w1 t1', 0, 'chino', { kind: 'shorts', cut: 'pocket' }, { a: 'atk' }),
  denimShorts: bot('s2 t2 n1', 0, 'denim', { kind: 'shorts', cut: 'short', denim: true }, { sx: 'f' }),
  runShorts: bot('p3 t1', 0, 'team', { kind: 'shorts', cut: 'run' }, { a: 'at' }),
  leggings: bot('s2 p2 t2 n1', 1, 'dark', { kind: 'leggings' }, { sx: 'f', a: 'atk' }),
  pencil: bot('m3 w2 c1 n2', 1, 'skirt', { kind: 'skirt', cut: 'pencil' }, { sx: 'f', a: 'ato' }),
  pleated: bot('m1 c2 e4 t1 u1 s1', 1, 'skirt', { kind: 'skirt', cut: 'pleated' }, { sx: 'f' }),
  denimSkirt: bot('s2 t2 n1', 0, 'denim', { kind: 'skirt', cut: 'mini', denim: true }, { sx: 'f', a: 'atk' }),
  jeansFlare: bot('s2 n2 t1', 1, 'denim', { kind: 'jeans', cut: 'flare' }, { sx: 'f', a: 'at' }),
  trousersSlim: bot('m3 n2 s1 w1', 1, 'suit', { kind: 'trousers', cut: 'slim' }, { a: 'at' }),
  cordTrousers: bot('s2 e4 m1 w1', 1, 'cord', { kind: 'trousers', cut: 'straight' }, { a: 'ao' }),
  workDark: bot('w3 u2', 1, 'workDark', { kind: 'trousers', cut: 'straight' }, { sx: 'm' }),
  chinoShorts: bot('s3 w1 t2 p1', 0, 'chino', { kind: 'shorts', cut: 'knee' }, { a: 'atk' }),
  sweatShorts: bot('p2 s2 t2', 0, 'dark', { kind: 'shorts', cut: 'short' }, { a: 'atk' }),
  tennisSkirt: bot('p2 t3 s1', 0, 'tennis', { kind: 'skirt', cut: 'pleated' }, { sx: 'f', a: 'atk' }),
  denimMaxi: bot('s2 c1 e1', 1, 'denim', { kind: 'skirt', long: true, cut: 'maxi', denim: true }, { sx: 'f', a: 'at' }),
  midiSkirt: bot('m2 c3 e2 n1 s1', 1, 'skirt', { kind: 'skirt', cut: 'knee' }, { sx: 'f', a: 'ato' }),
  maxiSkirt: bot('c2 e2 s2 m1', 1, 'skirt', { kind: 'skirt', long: true, cut: 'maxi' }, { sx: 'f', a: 'ato' }),
};

const shoe = (k: string, w: 0 | 1 | 2, c: string, kind: ShoeKind, o: Partial<G<PedSpec['shoes']>> = {}): G<PedSpec['shoes']> => ({ k, w, c, p: { kind }, ...o });
export const SHOES: Record<string, G<PedSpec['shoes']>> = {
  sneakerLow: shoe('s3 t2 p1 w1 e2 u2 n1', 1, 'shoeWhite', 'sneakerLow', { a: 'atok' }),
  sneakerDark: shoe('s2 w2 t1 u1 e1', 1, 'shoeDark', 'sneakerLow', { a: 'atok' }),
  sneakerHigh: shoe('s2 t3 n1 p1', 1, 'shoeBright', 'sneakerHigh', { a: 'atk' }),
  runner: shoe('p3 s2 t1', 1, 'shoeBright', 'runner', { a: 'at' }),
  workBoot: shoe('w3 u1 s1', 2, 'shoeBrown', 'workBoot', { a: 'ato' }),
  tallBoot: shoe('s1 n2 m1', 2, 'shoeDark', 'tallBoot', { sx: 'f', a: 'at' }),
  loafer: shoe('m2 e4 w1 c1', 1, 'shoeBrown', 'loafer', { a: 'ato' }),
  dressShoe: shoe('m3 c3 n1 w1 e3', 1, 'shoeDark', 'dressShoe', { a: 'ato' }),
  flat: shoe('m2 c2 w2 e5 s1 u2', 1, 'shoeNude', 'flat', { sx: 'f' }),
  heel: shoe('m1 c2 n3', 1, 'shoeNude', 'heel', { sx: 'f', a: 'a' }),
  sandal: shoe('s2 c1', 0, 'shoeTan', 'sandal', { a: 'ato', wx: [1, 0.05] }),
  rainBoot: shoe('s1 w1 t1 u1', 1, 'rainBoot', 'tallBoot', { a: 'at', wx: [0.06, 9] }),
  ankleBoot: shoe('s2 n3 m1 t1', 1, 'shoeDark', 'workBoot', { sx: 'f', a: 'at' }),
  tanBoot: shoe('s3 t2 w2', 2, 'shoeTan', 'workBoot', { sx: 'm', a: 'at' }),
  flipFlop: shoe('s1 t2', 0, 'shoeBright', 'slide', { a: 'atk', wx: [1, 0.02] }),
  canvasLow: shoe('s2 t3 p1 u1', 1, 'shoeBright', 'sneakerLow', { a: 'atk' }),
  slide: shoe('s2 t3 p1', 0, 'shoeDark', 'slide', { a: 'atok', wx: [1, 0.05] }),
};

// ---------------------------------------------------------------- weights and the compatibility rules

const wOf = (k: string): Partial<Record<Look, number>> => { const o: Partial<Record<Look, number>> = {}; for (const m of k.matchAll(/([a-z])(\d)/g)) o[LK[m[1]]] = Number(m[2]); return o; };
const cache = new Map<string, Partial<Record<Look, number>>>();
const look = (k: string, l: Look): number => { let m = cache.get(k); if (!m) { m = wOf(k); cache.set(k, m); } return m[l] ?? 0; };
const ageCode = (a: Age): string => (a === 'kid' ? 'k' : a === 'teen' ? 't' : a === 'old' ? 'o' : 'a');
const seasonK = (w: number, s: Season): number => (s === 'cold' ? [0.35, 1.5, 3][w] : s === 'warm' ? [3, 0.6, 0.05][w] : [1, 1.5, 0.4][w]);
interface Who { age: Age; sex: 'm' | 'f' | 'x'; look: Look; season: Season }
function gW<T>(g: G<T>, who: Who, extra = 1): number {
  if (!(g.a ?? 'ato').includes(ageCode(who.age))) return 0;
  if (g.sx && who.sex !== 'x' && g.sx !== who.sex) return 0;
  if (g.sx && who.sex === 'x') extra *= 0.3;
  if (g.wx) extra *= g.wx[WET ? 1 : 0];
  return look(g.k, who.look) * seasonK(g.w, who.season) * extra;
}
function wpick<T>(rng: Rng, items: Array<[T, number]>): T | null {
  let tot = 0; for (const [, w] of items) tot += w;
  if (tot <= 0) return null;
  let r = rng.next() * tot;
  for (const [it, w] of items) { if (w <= 0) continue; r -= w; if (r < 0) return it; }
  return items[items.length - 1][0];
}
const pickOf = <T,>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng.next() * a.length)];
/** a base top and a bottom that go together: a skirt needs a top that is not a hoodie or a jersey, a pencil skirt a smart top, shorts a light one ... */
function goes(topId: string, botId: string): number {
  const b = BOTTOMS[botId], t = BASE_TOPS[topId];
  if (!t || !b) return 1;
  const smartTop = ['shirt', 'dressShirt', 'blouse', 'polo', 'sweater'].includes(topId), sporty = ['bballJersey', 'footballShirt', 'tank', 'hoodieUp', 'hoodieDown', 'zipHoodie'].includes(topId);
  const bc = b.p.cut;
  if (b.p.kind === 'skirt') return bc === 'pencil' ? (smartTop ? 2 : 0.05) : sporty ? 0.15 : 1;
  if (bc === 'long' || bc === 'run') return sporty || topId === 'tee' || topId === 'longTee' ? 2 : 0.4;       // basketball and running shorts: with a jersey or a tee
  if (botId === 'suitTrousers') return smartTop ? 2.5 : topId === 'tee' || sporty ? 0.15 : 0.6;
  if (botId === 'leggings') return smartTop && topId !== 'sweater' ? 0.3 : 1.6;
  return 1;
}
/** a layer with a bottom and a base top: no blazer over a jersey, no puffer with shorts in cold weather, a tie only under a closed jacket */
function layerOk(layerId: string, topId: string, botId: string): number {
  const b = BOTTOMS[botId], formal = ['blazer', 'overcoat', 'trench'].includes(layerId), sporty = ['bballJersey', 'footballShirt', 'tank'].includes(topId);
  if (formal) { if (sporty || ['hoodieUp', 'hoodieDown', 'zipHoodie'].includes(topId)) return 0.04; if (['sweatsCuffed', 'trackPants', 'bballShorts', 'runShorts', 'denimShorts', 'cargoShorts'].includes(botId)) return 0.04; }
  if (layerId === 'trackJacket' && !['sweatsCuffed', 'trackPants', 'jeansStraight', 'jeansSlim', 'jeansBaggy', 'leggings', 'runShorts', 'bballShorts'].includes(botId)) return 0.4;
  if (['hoodieUp', 'hoodieDown'].includes(topId) && ['bomber', 'bomberNylon', 'denimJacket', 'cardigan', 'cardiganOpen', 'blazer', 'shirtOpen', 'workVest', 'apron'].includes(layerId)) return layerId === 'denimJacket' || layerId === 'bomber' || layerId === 'bomberNylon' || layerId === 'workVest' ? 0.5 : 0.05;
  if (b && b.p.kind === 'shorts' && ['pufferLong', 'parka', 'overcoat', 'trench'].includes(layerId)) return 0.1;
  return 1;
}
function shoeOk(shoeId: string, botId: string | null, topId: string, sex: 'm' | 'f' | 'x', season: Season, age: Age): number {
  const ALIAS: Record<string, string> = { rainBoot: 'tallBoot', ankleBoot: 'workBoot', tanBoot: 'workBoot', flipFlop: 'slide', canvasLow: 'sneakerLow' };
  const shoeKey = shoeId; shoeId = ALIAS[shoeId] ?? shoeId;
  const b = botId ? BOTTOMS[botId] : null, bk = b?.p.kind, cut = b?.p.cut;
  let w = 1;
  if (shoeKey === 'rainBoot' && (bk === 'skirt' && cut !== 'mini' && cut !== 'pleated' || cut === 'pencil')) w *= 0.5;
  if (['sandal', 'slide'].includes(shoeId)) { if (season === 'cold') return 0; if (bk && !['shorts', 'sweats', 'leggings', 'skirt'].includes(bk) && bk !== 'jeans') return 0.2; if (topId === 'sweater' && season !== 'warm') w *= 0.3; }
  if (shoeId === 'slide' && (bk === 'skirt' && cut !== 'mini' || cut === 'pencil')) return 0;
  if (shoeId === 'tallBoot') { if (bk === 'shorts' || bk === 'cargo' || bk === 'sweats') return 0; if (season === 'warm') w *= 0.2; if (cut === 'baggy' || cut === 'crop') w *= 0.2; }
  if (shoeId === 'heel') { if (bk === 'sweats' || bk === 'shorts' || bk === 'cargo') return 0; if (age !== 'adult') return 0; }
  if (['dressShoe', 'loafer'].includes(shoeId)) { if (bk === 'sweats' || bk === 'shorts' || cut === 'baggy' || cut === 'long' || bk === 'leggings') return 0.1; if (['tank', 'hoodieUp', 'hoodieDown', 'bballJersey', 'footballShirt'].includes(topId)) return 0.1; }
  if (shoeId === 'workBoot') { if (bk === 'skirt' || bk === 'shorts' && season === 'warm') w *= 0.3; if (['suitTrousers'].includes(botId ?? '')) return 0.05; }
  if (shoeId === 'flat' && (bk === 'cargo' && cut === 'patch')) return 0.3;
  if (shoeId === 'runner' && (botId === 'suitTrousers' || cut === 'pencil')) return 0.05;
  if (cut === 'crop' && ['sneakerHigh', 'workBoot'].includes(shoeId)) w *= 0.3;
  return w;
}

// ---------------------------------------------------------------- hair, headwear, face, bags

const HAIR_NAT_M: Array<[HairStyle, number]> = [['fade', 3], ['short', 2], ['crop', 1], ['afro', 1.4], ['locs', 1.4], ['braids', 1], ['twists', 1], ['bald', 1], ['curly', 0.5]];
const HAIR_NAT_F: Array<[HairStyle, number]> = [['braids', 3], ['locs', 1.4], ['afro', 1.2], ['puff', 1.5], ['bun', 1.5], ['bob', 1], ['twists', 1.5], ['short', 1], ['long', 1.5], ['curly', 1.2], ['ponytail', 1]];
const HAIR_M: Array<[HairStyle, number]> = [['short', 3], ['fade', 2], ['crop', 1.5], ['curly', 1], ['waves', 1], ['bald', 1], ['thinning', 0.5], ['ponytail', 0.2], ['bun', 0.2]];
const HAIR_F: Array<[HairStyle, number]> = [['long', 3], ['bob', 1.5], ['bun', 1.5], ['ponytail', 1.5], ['curly', 1.5], ['short', 1], ['waves', 1.5]];
const HAIR_EA_M: Array<[HairStyle, number]> = [['short', 3], ['crop', 2], ['fade', 1], ['bald', 0.5]];
const HAIR_EA_F: Array<[HairStyle, number]> = [['long', 3], ['bob', 2], ['bun', 1], ['ponytail', 1.5], ['short', 1]];
const HAIR_OLD_M: Array<[HairStyle, number]> = [['short', 2], ['thinning', 2], ['bald', 1.5], ['crop', 1], ['fade', 1]];
const HAIR_OLD_F: Array<[HairStyle, number]> = [['bun', 2], ['short', 2], ['bob', 1.5], ['waves', 1.5], ['curly', 1]];
const HAIR_KID_M: Array<[HairStyle, number]> = [['short', 2], ['fade', 2], ['crop', 1]];
const HAIR_KID_F: Array<[HairStyle, number]> = [['ponytail', 2], ['bun', 1], ['long', 1.5], ['bob', 1]];
const BIG_HAIR = new Set<HairStyle>(['afro', 'puff', 'locs', 'braids', 'twists', 'long', 'bun']);
const HAT_STYLED = new Set<HatStyle>(['cap', 'snapback', 'beanie', 'hardhat', 'fedora', 'flat', 'church', 'durag', 'helmet', 'bucket', 'headwrap']);
function hairFor(rng: Rng, g: PopGroup, sex: 'm' | 'f' | 'x', age: Age, hat: HatStyle): HairStyle {
  const nat = g === 'ba' || g === 'ca' || g === 'mx', f = sex === 'f' || (sex === 'x' && rng.next() < 0.5);
  let pool = age === 'kid' ? (f ? HAIR_KID_F : HAIR_KID_M) : age === 'old' ? (f ? HAIR_OLD_F : HAIR_OLD_M) : nat ? (f ? HAIR_NAT_F : HAIR_NAT_M) : g === 'ea' ? (f ? HAIR_EA_F : HAIR_EA_M) : (f ? HAIR_F : HAIR_M);
  if (age === 'kid' && nat) pool = f ? [['puff', 2], ['braids', 2], ['twists', 1], ['bun', 1]] : [['fade', 2], ['short', 2], ['crop', 1]];
  if (age === 'teen' && !f && nat) pool = [['fade', 3], ['short', 2], ['afro', 1.5], ['braids', 1.5], ['locs', 1], ['twists', 1]];
  if (HAT_STYLED.has(hat)) pool = pool.filter(([h]) => !BIG_HAIR.has(h) || h === 'bun');
  if (hat === 'hood' || hat === 'hoodDown') pool = pool.filter(([h]) => h !== 'afro' && h !== 'puff');
  return wpick(rng, pool) ?? 'short';
}
const GREY = ['#c8c8cc', '#b8b8bc', '#d0d0d4', '#a8a8ac'];
/** hat by look and season; hood comes from the garment */
function hatFor(rng: Rng, l: Look, season: Season, sex: 'm' | 'f' | 'x', g: PopGroup, age: Age, brought: HatStyle | undefined): { hat: HatStyle; color: string } {
  const none = { hat: 'none' as HatStyle, color: '#222222' };
  if (brought) return { hat: brought, color: '#222222' };
  const warm = season === 'warm', cold = season === 'cold';
  const pool: Array<[HatStyle, number]> = [['none', l === 'smart' ? 8 : l === 'church' ? 3 : 6]];
  if (l === 'street' || l === 'teen' || l === 'sport' || l === 'night') pool.push(['cap', 2], ['snapback', l === 'teen' ? 2 : 1], [cold ? 'beanie' : 'bucket', cold ? 3 : warm ? 1.2 : 0.7]);
  if (l === 'street' && !warm) pool.push(['beanie', cold ? 3 : 1]);
  if (l === 'work') pool.push(['cap', 2], ['hardhat', 1.2], ['beanie', cold ? 3 : 0.4]);
  if (l === 'service') pool.push(['cap', 1]);
  if (l === 'elder') pool.push(['flat', sex !== 'f' ? 1.6 : 0.2], ['cap', 0.6], ['bucket', warm ? 1 : 0]);
  if (l === 'smart') pool.push(['fedora', sex === 'f' ? 0.2 : 0.5], ['flat', 0.5], ['beanie', cold ? 1.5 : 0]);
  if (l === 'church') pool.push(['church', sex === 'f' ? 4 : 0], ['fedora', sex === 'f' ? 0 : 1], ['flat', 0.5]);
  if ((g === 'ba' || g === 'ca') && sex !== 'f' && age !== 'kid' && l !== 'smart' && l !== 'church') pool.push(['durag', 0.5]);
  if ((g === 'ba' || g === 'ca') && sex === 'f' && l !== 'work' && l !== 'smart') pool.push(['headwrap', 0.5]);
  if (age === 'kid') return rng.next() < 0.3 ? { hat: 'cap', color: pickOf(rng, COLOURWAYS.bright) } : none;
  const h = wpick(rng, pool) ?? 'none';
  const col = h === 'church' ? pickOf(rng, ['#c9a2e0', '#3b2a52', '#e8d8dc', '#2d2638', '#d8b84a']) : h === 'hardhat' ? pickOf(rng, ['#f4f4f0', '#f4d03f', '#e0702a']) : h === 'fedora' || h === 'flat' ? pickOf(rng, ['#2f3442', '#3a3028', '#5a5348', '#101014']) : pickOf(rng, [...COLOURWAYS.dark, ...COLOURWAYS.bright.slice(0, 4), '#e8e6e0']);
  return { hat: h, color: col };
}
function gearFor(rng: Rng, l: Look, sex: 'm' | 'f' | 'x', age: Age, hasLayerLong: boolean): { gear: PedSpec['gear']; color: string } {
  const bags: Array<[PedSpec['gear'], number]> = [['none', age === 'kid' ? 4 : 7]];
  if (age === 'kid') bags.push(['backpack', 4]);
  else if (l === 'teen') bags.push(['backpack', 5], ['messenger', 1]);
  else if (l === 'work') bags.push(['backpack', 2], ['messenger', 1.5], ['tote', 0.6]);
  else if (l === 'smart') bags.push(['messenger', 1.5], ['bag', sex === 'f' ? 3 : 0.8], ['tote', 1]);
  else if (l === 'street') bags.push(['tote', 1.4], ['messenger', 1.2], ['backpack', 1.2], ['bag', sex === 'f' ? 1.2 : 0.3]);
  else if (l === 'church') bags.push(['bag', sex === 'f' ? 4 : 0.2]);
  else if (l === 'elder') bags.push(['bag', 1.5], ['tote', 1.5]);
  else if (l === 'night') bags.push(['bag', sex === 'f' ? 2 : 0.2]);
  else if (l === 'sport') bags.push(['backpack', 1.5]);
  else bags.push(['messenger', 0.6]);
  void hasLayerLong;
  // PEOPLE9: elders carry a handbag or a shopping tote, not a rucksack or a crossbody; the young carry the rucksack, tote and crossbody
  const kept = age === 'old' ? bags.filter(([g]) => g !== 'backpack' && g !== 'messenger') : age === 'teen' || age === 'adult' ? bags.map(([g, w]) => [g, g === 'bag' && sex === 'm' ? w * 0.5 : w] as [PedSpec['gear'], number]) : bags;
  if (age === 'old' && !kept.some(([g]) => g === 'bag')) kept.push(['bag', 1]);
  const gear = wpick(rng, kept) ?? 'none';
  return { gear, color: pickOf(rng, ['#3a3a40', '#3a4a3a', '#5b3a24', '#7a4a32', '#c8b890', '#1c1c20', '#d8c8a0', '#2f3a58', '#8a2a3a']) };
}
function faceFor(rng: Rng, sex: 'm' | 'f' | 'x', age: Age, g: PopGroup, mask: number): PedSpec['face'] {
  const female = sex === 'f' || (sex === 'x' && rng.next() < 0.4);
  const f: PedSpec['face'] = { eyes: pickOf(rng, ['dot', 'wide', 'sleepy'] as const), brows: female ? pickOf(rng, ['arched', 'thin'] as const) : pickOf(rng, ['thick', 'thick', 'thin'] as const), mouth: pickOf(rng, ['smile', 'flat', 'flat', 'smile', 'grin'] as const) };
  if (female) { f.lashes = true; f.eyes = rng.next() < 0.6 ? 'wide' : f.eyes; f.lips = pickOf(rng, ['#a8484f', '#8a3a3a', '#9a4a52', '#b0505a', '#7d2c33']); }
  else if (age !== 'kid') {
    const r = rng.next(), grown = age === 'adult' || age === 'old';
    if (grown && r < 0.18) f.beard = true; else if (grown && r < 0.3) f.stubble = true; else if (grown && r < 0.37) f.mustache = true;
    if (age === 'old' && r > 0.85) f.beard = true;
  }
  if (age !== 'kid' && rng.next() < (age === 'old' ? 0.4 : age === 'teen' ? 0.08 : 0.17)) f.glasses = pickOf(rng, ['#2a2a2a', '#3a2a22', '#6a3a22', '#8a6a3a', '#1c2a4a']);
  if (mask > 0 && rng.next() < mask) f.mask = true;
  void g;
  return f;
}

// ---------------------------------------------------------------- composing a person

export interface WardrobeOpts { look?: Look; /** PEOPLE7: a district's weights over the looks (see DISTRICT_LOOKS), used when no look is given */ bias?: Partial<Record<Look, number>>; season?: Season; /** probability of a face mask (a few percent) */ mask?: number; sunday?: boolean; /** CLOTHES: false/omitted = about half the people wear a whole outfit (pedOutfits.ts); true keeps the random pools only */ noOutfit?: boolean }
let SEASON: Season = 'mild';
/** the season hint for every person drawn from now on (the game may set it from its date; the same seed + season is always the same person) */
export function setWardrobeSeason(s: Season): void { SEASON = s; }
export function getWardrobeSeason(): Season { return SEASON; }
/**
 * PEOPLE7: the weather the people on the street dress for. Pass Weather.kind (src/game/Weather.ts) whenever it changes; while it rains, people spawned from then on
 * wear slickers, trench coats, parkas with the hood up, rain boots and no sandals. People already on the street keep their clothes. Unknown kinds count as dry.
 */
export function setWardrobeWeather(kind: string): void { WET = kind === 'lightRain' || kind === 'heavyRain' || kind === 'thunderstorm'; }
export function isWardrobeWet(): boolean { return WET; }
/** a hint for the season from the weather kind and a temperature of the day if the game has one (0 cold .. 1 hot); rain and wind never read as "warm" */
export function seasonForWeather(kind: string, warmth = 0.5): Season { const s: Season = warmth < 0.3 ? 'cold' : warmth > 0.7 ? 'warm' : 'mild'; return s === 'warm' && (kind === 'heavyRain' || kind === 'thunderstorm' || kind === 'windy') ? 'mild' : s; }
/** PEOPLE7: how a district tilts the looks, so a block reads as a place (pass as WardrobeOpts.bias; the keys are zone names the world may use) */
export const DISTRICT_LOOKS: Record<string, Partial<Record<Look, number>>> = {
  brownstone: { smart: 1.6, elder: 1.4, work: 0.8, night: 0.5, teen: 0.9 },
  strip: { street: 1.4, teen: 1.5, night: 1.6, service: 1.4, elder: 0.7 },
  park: { sport: 3, teen: 1.3, elder: 1.2, work: 0.4, smart: 0.5, night: 0.3 },
  church: { church: 6, smart: 1.8, elder: 1.5, sport: 0.3, night: 0.2 },
  industrial: { work: 3, service: 1.6, smart: 0.3, night: 0.3, church: 0.2 },
  transit: { work: 1.6, smart: 1.5, service: 1.8, sport: 0.6 },
};

const LOOK_BY_AGE: Record<Age, Array<[Look, number]>> = {
  adult: [['street', 30], ['work', 16], ['smart', 12], ['sport', 11], ['night', 6], ['service', 7], ['church', 2]],
  teen: [['teen', 62], ['sport', 18], ['street', 20]],
  old: [['elder', 60], ['church', 6], ['street', 18], ['smart', 10], ['work', 2]],
  kid: [['teen', 100]],
};
export function pickLook(rng: Rng, age: Age, sunday = false, bias?: Partial<Record<Look, number>>): Look {
  const pool = LOOK_BY_AGE[age].map(([l, w]) => [l, (l === 'church' && sunday ? w * 8 : w) * (bias?.[l] ?? 1)] as [Look, number]);
  return wpick(rng, pool) ?? 'street';
}

const pickG = <T,>(rng: Rng, rec: Record<string, G<T>>, who: Who, mult?: (id: string) => number): string | null =>
  wpick(rng, Object.keys(rec).map((id) => [id, gW(rec[id], who, mult ? mult(id) : 1)] as [string, number]));
const colour = (rng: Rng, pool: string): string => pickOf(rng, COLOURWAYS[pool]);
/** a colour that does not vanish against `other` */
const distinct = (rng: Rng, pool: string, other: string[], min = 60): string => { let c = colour(rng, pool); for (let i = 0; i < 8 && other.some((o) => dist(c, o) < min); i++) c = colour(rng, pool);
  if (other.some((o) => dist(c, o) < min)) c = other.some((o) => dist(o, '#1c1c20') < 120) ? '#e8e6e0' : '#1c1c20';
  return c; };

export interface Slots { top: string; layer?: string; bottom: string; shoes: string; onePiece?: string }

/** the person a seed makes, dressed from the pools. `base` gives who they are (group, sex, age); nothing else of it is kept. */
export function composeSpec(seed: number, base: Pick<PedSpec, 'group' | 'sex' | 'age'>, opts: WardrobeOpts = {}): PedSpec {
  const rng = new Rng(seed);
  const group = (base.group ?? 'wh') as PopGroup, sex = base.sex ?? 'm', age = (base.age ?? 'adult') as Age;
  const season = opts.season ?? SEASON, lk = opts.look ?? pickLook(rng, age, opts.sunday, opts.bias);
  const who: Who = { age, sex, look: lk, season };
  // CLOTHES: about half of the people wear a whole outfit (pedOutfits.ts: garments and colours that belong together), drawn from a stream of its own so the rest of the draw is unchanged
  const oRng = new Rng((seed * 7919 + 13) >>> 0), ofw = outfitWeights(age, sex, lk, season);
  const OFT: Outfit | null = !opts.noOutfit && oRng.next() < 0.55 ? wpick(oRng, ofw) : null;
  const WAY: Way | null = OFT ? OFT.ways[Math.floor(oRng.next() * OFT.ways.length) % OFT.ways.length] : null;
  // the body
  const pool = BODY_POOLS[`${age}-${sex}`] ?? BODY_POOLS['adult-m'];
  const body = wpick(rng, pool.map(([b, w]) => [b, w] as [BodyTypeId, number])) ?? 'avg';
  // the skin and hair colour
  const pal = PALETTE[group], skin = pickOf(rng, pal.skin);
  const kidOld = age === 'old', skinJ = jitter(skin, rng);
  // the garments: a one-piece, or top (+ layer) and bottom
  let topSpec: Top, botSpec: Bottom, hatBrought: HatStyle | undefined, botId: string | null = null, topId = '', layerId = '';
  const onePieceP = (sex === 'f' ? 0.18 : 0.04) * (lk === 'night' || lk === 'church' || lk === 'elder' ? 1.8 : lk === 'work' ? 0.5 : 1) * (age === 'kid' ? 1.4 : 1);
  const op = Object.keys(ONE_PIECE).map((id) => { const o = ONE_PIECE[id]; return [id, (o.a ?? 'ato').includes(ageCode(age)) && (!o.sx || o.sx === sex || sex === 'x') ? look(o.k, lk) * seasonK(o.w, season) : 0] as [string, number]; });
  const opTot = op.reduce((a, [, w]) => a + w, 0);
  let sets: PedSpec['top'] | null = null;
  if (!OFT && opTot > 0 && rng.next() < onePieceP * (1 + Math.min(2, opTot / 6))) {
    const id = wpick(rng, op)!, o = ONE_PIECE[id], c = o.c === 'dark' ? colour(rng, 'dark') : colour(rng, o.c);
    const tc = o.tr ? colour(rng, o.tr) : shade(c, 0.72);
    sets = { kind: 'dress', color: c, trim: tc, sleeves: 'short', print: 'none', printColor: tc, ...o.top } as Top;
    topSpec = sets; topId = id; layerId = '';
    botSpec = { kind: 'skirt', color: c, trim: shade(c, 0.78), ...o.bottom } as Bottom;
    if (id === 'sundress' || id === 'kaftan') topSpec.pattern = rng.next() < 0.6 ? 'print' : 'none';
    if (topSpec.pattern === 'print') topSpec.printColor = colour(rng, 'floral');
    if (id === 'trackSet') botSpec.trim = tc;
    if (id === 'wrapDress' || id === 'shirtDress') topSpec.trim = shade(c, 0.8);
    if (id === 'sundress') botSpec.trim = '#f4e8e0';
    botId = id === 'boilerSuit' ? 'cargo' : id === 'trackSet' ? 'trackPants' : id === 'wrapDress' || id === 'shirtDress' ? 'pleated' : 'pleated';
  } else {
    // bottom first (it decides the shoes), then the base top, then a layer
    const bId = OFT ? OFT.bottom : pickG(rng, BOTTOMS, who)!;
    const tId = OFT ? OFT.top : pickG(rng, BASE_TOPS, who, (id) => goes(id, bId) * (BASE_TOPS[id].only ? 0.3 : 1))!;
    botId = bId; topId = tId;
    const bg = BOTTOMS[bId], tg = BASE_TOPS[tId];
    const bc = WAY ? WAY.bottom : colour(rng, bg.c);
    botSpec = { kind: 'jeans', color: bc, trim: bg.tr ? colour(rng, bg.tr) : shade(bc, 0.72), ...bg.p } as Bottom;
    if (bg.p.cut === 'long' || bg.p.cut === 'run') botSpec.trim = distinct(rng, 'trackTrim', [bc]);
    const tc = WAY ? WAY.top : distinct(rng, tg.c, [bc], 50);
    const tt = tg.tr ? colour(rng, tg.tr) : shade(tc, 0.72);
    topSpec = { kind: 'tee', color: tc, trim: tt, sleeves: 'short', print: 'none', printColor: '#ffffff', ...tg.p } as Top;
    hatBrought = tg.hat;
    if (tId === 'tee' && rng.next() < 0.18) { topSpec.pattern = 'stripe'; topSpec.trim = distinct(rng, 'tee', [tc], 90); }
    if (tId === 'sweater') topSpec.trim = shade(tc, 0.8);
    if (tId === 'bballJersey') { topSpec.trim = distinct(rng, 'trackTrim', [tc], 90); if (bg.c === 'team') botSpec.color = tc; topSpec.pattern = 'none'; }
    if (tId === 'footballShirt') { topSpec.printColor = distinct(rng, 'trackTrim', [tc], 90); }
    if (tId === 'shirt' || tId === 'dressShirt') { if (lk === 'smart' || lk === 'church') topSpec.tie = tId === 'dressShirt' && rng.next() < 0.7 ? colour(rng, 'bright') : undefined; }
    // layer
    const cold = season === 'cold' ? 0.9 : season === 'warm' ? 0.07 : 0.42, wantLayer = tg.only && !OFT ? 0 : cold * (lk === 'smart' ? 1.4 : lk === 'sport' ? 0.7 : 1);
    if (OFT ? !!OFT.layer && (season !== 'warm' || OFT.season[2] > 0.5) : rng.next() < wantLayer) {
      const lId = OFT ? OFT.layer : pickG(rng, LAYERS, who, (id) => layerOk(id, tId, bId));
      if (lId) {
        layerId = lId;
        const lg = LAYERS[lId], lc = WAY?.layer ?? (lg.c === 'tee' ? distinct(rng, 'tee', [tc, bc], 55) : distinct(rng, lg.c, [bc], 45));
        const under = tc;
        topSpec = { kind: 'jacket', color: lc, trim: lg.tr ? colour(rng, lg.tr) : shade(lc, 0.72), sleeves: 'long', print: 'none', printColor: '#ffffff', ...lg.p, under } as Top;
        if (lId === 'shirtOpen') { topSpec.pattern = pickOf(rng, ['plaid', 'plaid', 'check', 'none'] as const); topSpec.trim = distinct(rng, 'tee', [lc], 70); }
        if (lId === 'apron' || lId === 'workVest') topSpec.under = tg.p.sleeves === 'none' ? '#e8e6e0' : tc;
        if (topSpec.kind === 'jacket' && lg.p.fabric === 'wool' && tg.p.style === 'shirt' && rng.next() < 0.5) topSpec.tie = colour(rng, 'bright');
        if (lId === 'blazer' && rng.next() < 0.5 && !topSpec.tie) topSpec.tie = colour(rng, 'bright');
        if (lId === 'cardigan' || lId === 'cardiganOpen' || lId === 'trackJacket' || lId === 'pufferShort' || lId === 'pufferLong' || lId === 'parka') delete topSpec.open;
        if (lId === 'cardiganOpen') topSpec.open = true;
        hatBrought = lg.hat ?? (tg.hat === 'hoodDown' ? 'hoodDown' : undefined);
      }
    }
    // a long tunic over leggings or trousers
    if (!layerId && (bId === 'leggings' || bg.p.kind === 'trousers' || bg.p.kind === 'jeans') && sex === 'f' && age !== 'kid' && gW(TUNIC, who) > 0 && rng.next() < 0.07 * gW(TUNIC, who)) {
      const c2 = colour(rng, 'floral');
      topSpec = { ...topSpec, ...TUNIC.p, kind: 'blouse', color: c2, trim: shade(c2, 0.75), printColor: colour(rng, 'floral'), under: undefined } as Top;
      topId = 'tunic'; hatBrought = undefined;
    }
  }
  // the shoes
  const sId = (OFT ? OFT.shoes : null) ?? wpick(rng, Object.keys(SHOES).map((id) => [id, gW(SHOES[id], who, shoeOk(id, botId, topId, sex, season, age))] as [string, number])) ?? 'sneakerLow';
  const sg = SHOES[sId], sc = WAY ? WAY.shoes : colour(rng, sg.c);
  const shoes: PedSpec['shoes'] = { color: sc, sole: sg.p.kind === 'sneakerLow' || sg.p.kind === 'sneakerHigh' || sg.p.kind === 'runner' ? shade(sc, 0.82) : shade(sc, 0.35), accent: sg.p.kind === 'runner' || sg.p.kind === 'sneakerHigh' ? colour(rng, 'bright') : shade(sc, 0.7), kind: sg.p.kind };
  if (sg.p.kind === 'sneakerHigh') shoes.high = true;
  if (sg.p.kind === 'workBoot' || sg.p.kind === 'tallBoot') shoes.high = true;
  if (sg.p.kind === 'slide') shoes.sock = rng.next() < 0.7 ? '#f0f0ee' : '#1c1c20';
  if (sg.p.kind === 'sandal' || sg.p.kind === 'slide') { /* bare foot */ }
  // headwear, hair, face, bag
  const hw = OFT && OFT.hat !== undefined && !(layerId && LAYERS[layerId]?.hat && OFT.hat === 'none') ? { hat: OFT.hat as HatStyle, color: WAY?.hat ?? '#222222' } : hatFor(rng, lk, season, sex, group, age, hatBrought);
  const hair = hairFor(rng, group, sex, age, hw.hat);
  const hairColor = kidOld && rng.next() < (group === 'wh' ? 0.85 : 0.6) ? pickOf(rng, GREY) : hair === 'bald' ? pal.hair[0] : pickOf(rng, pal.hair);
  const gear = OFT && OFT.gear ? { gear: OFT.gear as PedSpec['gear'], color: WAY?.gear ?? '#2a2c32' } : gearFor(rng, lk, sex, age, !!topSpec.long);
  const face = faceFor(rng, sex, age, group, opts.mask ?? 0.03);
  const spec: PedSpec = {
    id: '', role: 'civilian', group, sex, age, skin: skinJ,
    hair, hairColor, hat: hw.hat, hatColor: hw.color, hatTrim: shade(hw.color, 0.7), hatLogo: '',
    face, top: topSpec, bottom: botSpec, shoes, gear: gear.gear, gearColor: gear.color,
    build: age === 'kid' ? 'kid' : 'avg', body, weight: 0,
  };
  if (hw.hat === 'hood' || hw.hat === 'hoodDown') { spec.hatColor = topSpec.color; spec.hatTrim = topSpec.trim; }
  if (hw.hat === 'hood' && layerId === 'parka') spec.hatTrim = '#e8e4dc';
  spec.id = specId(spec, topId, layerId, botId ?? '');
  return spec;
}
function jitter(hex: string, rng: Rng): string {
  const k = (rng.next() - 0.5) * 0.1, w = (rng.next() - 0.5) * 0.04, c = rgbOf(hex);
  return `#${c.map((x, i) => hex2(x * (1 + k) + (i === 0 ? 255 * w : i === 2 ? -255 * w : 0))).join('')}`;
}
const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** everything the eye can tell apart goes into the id, so equal combinations are one person (one texture bake) */
function specId(s: PedSpec, topId: string, layerId: string, botId: string): string {
  const key = JSON.stringify([s.group, s.sex, s.age, s.skin, s.hair, s.hairColor, s.hat, s.hatColor, s.face, s.top, s.bottom, s.shoes, s.gear, s.gearColor, s.body]);
  return `g-${s.group}-${s.sex}${(s.age ?? 'a')[0]}-${[topId, layerId, botId].filter(Boolean).join('+')}-${fnv(key).toString(36)}`;
}

// ---------------------------------------------------------------- the street: picking a variant for a pedestrian, with a cap on distinct bakes

/** how many different people may be alive at once (each is one texture bake: 512 px on desktop, 256 on phone) */
const CAP = { hi: 72, phone: 14 };
const alive = new Map<number, true>();
const aliveBy = new Map<string, number[]>();
let capOverride: number | null = null;
/** for the tests and the showcase: an explicit cap (null = the tier's) */
export function setWardrobeCap(n: number | null): void { capOverride = n; }
export function wardrobeAlive(): number { return alive.size; }
export function resetWardrobe(): void { alive.clear(); aliveBy.clear(); }
/** Locked outfits keep their named person (religious dress and uniforms worn by the people who wear them). */
const LOCKED = /hasidic|hijabi|church|nurse|transit|site|delivery|^hj-/;
const FRESH = 0.82;
/**
 * The variant (index into PED_SPECS) of a pedestrian. `named` is the roster pick the street mix made (it carries group, sex and age); about four in five become
 * a person of their own, dressed from the pools with the pedestrian's own random stream, the rest stay the named person. Always consumes two rng draws.
 */
export function pickWardrobeVariant(rng: Rng, named: number, phone: boolean, opts: WardrobeOpts = {}): number {
  const seed = Math.floor(rng.next() * 4294967296) >>> 0, roll = rng.next();
  const nb = PED_SPECS[named], cap = capOverride ?? (phone ? CAP.phone : CAP.hi);
  const keep = LOCKED.test(nb.id) || nb.group === 'hj' || nb.role !== 'civilian' || roll >= FRESH;
  let v = named;
  if (!keep) v = registerSpec(composeSpec(seed, nb, opts));
  if (!alive.has(v) && alive.size >= cap) {
    // the cap is reached: this person becomes one of the people already alive (same group, sex and age first)
    const key = `${nb.group}-${nb.sex}-${nb.age}`, sameAll = aliveBy.get(key), pool = sameAll && sameAll.length ? sameAll : [...alive.keys()];
    v = pool[seed % pool.length];
  } else if (!alive.has(v)) {
    alive.set(v, true);
    const key = `${nb.group}-${nb.sex}-${nb.age}`, l = aliveBy.get(key) ?? []; l.push(v); aliveBy.set(key, l);
  }
  return v;
}

// ---------------------------------------------------------------- the player's wardrobe (data-driven)

/** a wardrobe entry: garment ids from the pools above and the colours worn (what a shop would sell); `hat` is a HatStyle */
export interface WardrobeEntry {
  top?: [id: string, color: string, trim?: string]; layer?: [id: string, color: string, under?: string, trim?: string];
  bottom?: [id: string, color: string, trim?: string]; shoes?: [id: string, color: string, sole?: string, accent?: string]; hat?: HatStyle; hatColor?: string;
}
/** the patch of a PedSpec that a wardrobe entry makes (applied over the person's own spec) */
export function dress(e: WardrobeEntry): Partial<PedSpec> {
  const out: Partial<PedSpec> = {};
  const fromBase = (id: string, c: string, tr?: string): Top => { const g = BASE_TOPS[id]; return { kind: 'tee', color: c, trim: tr ?? shade(c, 0.72), sleeves: 'short', print: 'none', printColor: '#ffffff', ...g.p } as Top; };
  if (e.top) out.top = fromBase(e.top[0], e.top[1], e.top[2]);
  if (e.layer) { const g = LAYERS[e.layer[0]], under = e.layer[2] ?? out.top?.color; out.top = { kind: 'jacket', color: e.layer[1], trim: e.layer[3] ?? shade(e.layer[1], 0.72), sleeves: 'long', print: 'none', printColor: '#ffffff', ...g.p, under } as Top; }
  if (e.bottom) { const g = BOTTOMS[e.bottom[0]]; out.bottom = { kind: 'jeans', color: e.bottom[1], trim: e.bottom[2] ?? shade(e.bottom[1], 0.72), ...g.p } as Bottom; }
  if (e.shoes) { const g = SHOES[e.shoes[0]]; out.shoes = { color: e.shoes[1], sole: e.shoes[2] ?? shade(e.shoes[1], 0.8), accent: e.shoes[3] ?? shade(e.shoes[1], 0.7), ...g.p, ...(g.p.kind === 'sneakerHigh' || g.p.kind === 'workBoot' || g.p.kind === 'tallBoot' ? { high: true } : {}) }; }
  if (e.hat) { const hood = e.hat === 'hood' || e.hat === 'hoodDown'; out.hat = e.hat; out.hatColor = e.hatColor ?? (hood && out.top ? out.top.color : '#222222'); out.hatTrim = shade(out.hatColor, 0.7); }
  return out;
}
/** counts for the report and the tests */
export const WARDROBE_COUNTS = (): Record<string, number> => ({
  tops: Object.keys(BASE_TOPS).length + Object.keys(LAYERS).length + 1, onePieces: Object.keys(ONE_PIECE).length, bottoms: Object.keys(BOTTOMS).length, shoes: Object.keys(SHOES).length,
});
export type { TopStyle, BottomCut };
