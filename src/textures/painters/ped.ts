/**
 * Hand-painted GTA3-era person atlases. One 256 x 256 canvas per variant, 4 x 4 tiles of 64 px; the procedural bodies in
 * entities/models/pedBody.ts map their faces onto these tiles (flat colour blocks, a painted face, a print, folds).
 *
 *   row 0   headFront   headBack    headSide    headCaps (top 32x32 | chin 32x32)
 *   row 1   torsoFront  torsoBack   torsoSide   torsoCaps (collar | waist)
 *   row 2   upperArm    foreArm     hand        hips
 *   row 3   thigh       shin        shoe        gear (hair | hat front | pack | hat main)
 *
 * Only basic 2D calls (fillRect, arc, moveTo/lineTo, fill, stroke, quadraticCurveTo, save/restore): the unit tests rasterise
 * with a software canvas and the fake canvases only record. Everything is deterministic given the rng and the variant.
 * No fillText: prints use a 3 x 5 pixel font drawn with rects. All art is invented (no real brands or people).
 */
import type { Rng } from '@/core/Rng';
import type { Painter } from '../canvas';

export const PED_ATLAS = 256;
export const PED_TILE = 64;

export type PedTile =
  | 'headFront' | 'headBack' | 'headSide' | 'headCaps'
  | 'torsoFront' | 'torsoBack' | 'torsoSide' | 'torsoCaps'
  | 'upperArm' | 'foreArm' | 'hand' | 'hips'
  | 'thigh' | 'shin' | 'shoe' | 'gear';

const TILE_ORDER: readonly PedTile[] = [
  'headFront', 'headBack', 'headSide', 'headCaps',
  'torsoFront', 'torsoBack', 'torsoSide', 'torsoCaps',
  'upperArm', 'foreArm', 'hand', 'hips',
  'thigh', 'shin', 'shoe', 'gear',
];

export interface PxRect { x: number; y: number; w: number; h: number }

/** Pixel rectangle of a tile (and of a 32 px quadrant of it: 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right). */
export function pedTileRect(tile: PedTile, quadrant?: 0 | 1 | 2 | 3): PxRect {
  const i = TILE_ORDER.indexOf(tile);
  const x = (i % 4) * PED_TILE, y = Math.floor(i / 4) * PED_TILE;
  if (quadrant === undefined) return { x, y, w: PED_TILE, h: PED_TILE };
  return { x: x + (quadrant % 2) * 32, y: y + (quadrant >> 1) * 32, w: 32, h: 32 };
}

// ---------------------------------------------------------------- the variants

export type HairStyle = 'bald' | 'short' | 'fade' | 'afro' | 'braids' | 'bun' | 'puff' | 'long' | 'locs';
export type HatStyle = 'none' | 'cap' | 'beanie' | 'headwrap' | 'church' | 'flat' | 'cop' | 'durag' | 'hardhat';
export type TopKind = 'tee' | 'hoodie' | 'puffer' | 'jersey' | 'vest' | 'jacket' | 'cardigan' | 'blouse' | 'uniform' | 'scrubs' | 'dress' | 'tracksuit' | 'apron';
export type BottomKind = 'jeans' | 'trousers' | 'shorts' | 'skirt' | 'leggings' | 'sweats' | 'cargo';
export type PedRole = 'civilian' | 'cop' | 'shopkeeper' | 'dj' | 'player';
export type Build = 'avg' | 'slim' | 'stocky' | 'kid' | 'tall';
export type PrintKind = 'none' | 'text' | 'star' | 'stripes' | 'bolt' | 'bars' | 'badge' | 'heart';

export interface PedSpec {
  id: string;
  role: PedRole;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  hat: HatStyle;
  hatColor: string;
  hatTrim: string;
  /** letters (or a star) on the front panel of the hat */
  hatLogo: string;
  face: {
    eyes: 'dot' | 'wide' | 'sleepy';
    brows: 'thick' | 'thin' | 'arched';
    mouth: 'smile' | 'flat' | 'grin' | 'frown';
    stubble?: boolean; beard?: boolean; mustache?: boolean; lips?: string; lashes?: boolean; glasses?: string;
  };
  top: {
    kind: TopKind; color: string; trim: string; sleeves: 'long' | 'short' | 'none';
    print: PrintKind; printText?: string; printColor: string;
    /** shirt under an open jacket / cardigan / vest */
    under?: string; tie?: string; zip?: boolean; pattern?: 'none' | 'print' | 'plaid';
  };
  bottom: { kind: BottomKind; color: string; trim: string };
  shoes: { color: string; sole: string; accent: string; high?: boolean };
  gear: 'none' | 'backpack' | 'bag';
  gearColor: string;
  build: Build;
  /** relative chance among the civilians (church clothes get extra weight on Sunday morning) */
  weight: number;
  sunday?: boolean;
}

const base = (o: Partial<PedSpec> & Pick<PedSpec, 'id' | 'skin' | 'top' | 'bottom'>): PedSpec => ({
  role: 'civilian',
  hair: 'short', hairColor: '#1b1612', hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
  face: { eyes: 'dot', brows: 'thick', mouth: 'flat' },
  shoes: { color: '#f2f2f2', sole: '#d8d8d8', accent: '#c0392b' },
  gear: 'none', gearColor: '#334455', build: 'avg', weight: 1,
  ...o,
});

/** Index order matters: civilians first (0..CIVILIAN_COUNT-1), then the named people. */
export const PED_SPECS: readonly PedSpec[] = [
  base({ // 0 fitted cap + hoodie
    id: 'hoodie-cap', skin: '#8d5a3b', hair: 'fade', hat: 'cap', hatColor: '#1c2a4a', hatTrim: '#e8e8e8', hatLogo: 'BK',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat', stubble: true },
    top: { kind: 'hoodie', color: '#2b2f36', trim: '#454b55', sleeves: 'long', print: 'text', printText: 'STUY', printColor: '#e8e8e8', zip: false },
    bottom: { kind: 'jeans', color: '#34506f', trim: '#243a52' }, shoes: { color: '#f4f4f4', sole: '#cfcfcf', accent: '#1c2a4a' }, weight: 1.4,
  }),
  base({ // 1 orange puffer + braids
    id: 'puffer-braids', skin: '#6b4226', hair: 'braids', hairColor: '#150e0a',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#7d2c33', lashes: true },
    top: { kind: 'puffer', color: '#e0702a', trim: '#b4501a', sleeves: 'long', print: 'none', printColor: '#ffffff' },
    bottom: { kind: 'jeans', color: '#1f2a3a', trim: '#141c28' }, shoes: { color: '#5b3a24', sole: '#2a1a10', accent: '#c9a36a', high: true }, build: 'avg', weight: 1.2,
  }),
  base({ // 2 headwrap auntie with tote
    id: 'headwrap-auntie', skin: '#7a4a2c', hair: 'bald', hat: 'headwrap', hatColor: '#d89420', hatTrim: '#2d7a4a',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#8a3a3a' },
    top: { kind: 'blouse', color: '#2d7a4a', trim: '#d89420', sleeves: 'short', print: 'bars', printColor: '#d89420' },
    bottom: { kind: 'skirt', color: '#7a2d4a', trim: '#d89420' }, shoes: { color: '#8a5a2a', sole: '#3a2a1a', accent: '#d89420' },
    gear: 'bag', gearColor: '#d89420', build: 'stocky', weight: 1,
  }),
  base({ // 3 Sunday suit
    id: 'church-man', skin: '#5e3b24', hair: 'fade', hairColor: '#1a1a1a', hat: 'church', hatColor: '#3b2a52', hatTrim: '#8a6bb8',
    face: { eyes: 'dot', brows: 'thick', mouth: 'smile', mustache: true },
    top: { kind: 'jacket', color: '#2d2638', trim: '#1c1824', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f1efe6', tie: '#8a3a9a' },
    bottom: { kind: 'trousers', color: '#2d2638', trim: '#1c1824' }, shoes: { color: '#161616', sole: '#0a0a0a', accent: '#444444' }, build: 'tall', weight: 0.35, sunday: true,
  }),
  base({ // 4 Sunday hat lady
    id: 'church-lady', skin: '#80522f', hair: 'bun', hairColor: '#2b2b2b', hat: 'church', hatColor: '#c9a2e0', hatTrim: '#f0e6f6',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#a8324a', lashes: true },
    top: { kind: 'dress', color: '#b58ad6', trim: '#f0e6f6', sleeves: 'short', print: 'heart', printColor: '#f0e6f6' },
    bottom: { kind: 'skirt', color: '#b58ad6', trim: '#8a5fb0' }, shoes: { color: '#f0e6f6', sole: '#b58ad6', accent: '#8a5fb0' }, gear: 'bag', gearColor: '#f0e6f6', weight: 0.35, sunday: true,
  }),
  base({ // 5 delivery rider
    id: 'delivery-vest', skin: '#c58a5c', hair: 'short', hat: 'cap', hatColor: '#111111', hatTrim: '#f4d03f', hatLogo: 'GO',
    face: { eyes: 'sleepy', brows: 'thick', mouth: 'flat', stubble: true },
    top: { kind: 'vest', color: '#e9d628', trim: '#c8b81c', sleeves: 'long', print: 'stripes', printColor: '#d8d8d8', under: '#22262c' },
    bottom: { kind: 'cargo', color: '#2d3138', trim: '#1c1f24' }, shoes: { color: '#222222', sole: '#111111', accent: '#e9d628' },
    gear: 'backpack', gearColor: '#e8601c', build: 'slim', weight: 1,
  }),
  base({ // 6 kid with a backpack
    id: 'kid-backpack', skin: '#6f4529', hair: 'puff', hairColor: '#120c08',
    face: { eyes: 'wide', brows: 'thin', mouth: 'grin' },
    top: { kind: 'tee', color: '#3a8fd9', trim: '#2a6fb0', sleeves: 'short', print: 'star', printColor: '#f4d03f' },
    bottom: { kind: 'shorts', color: '#4a4f58', trim: '#2c3036' }, shoes: { color: '#ffffff', sole: '#e4e4e4', accent: '#e84a8a' },
    gear: 'backpack', gearColor: '#d63a2a', build: 'kid', weight: 0.9,
  }),
  base({ // 7 elder in a cardigan
    id: 'elder-cardigan', skin: '#8a5a3a', hair: 'short', hairColor: '#b8b8b8', hat: 'flat', hatColor: '#5a4a3a', hatTrim: '#3a2e24',
    face: { eyes: 'sleepy', brows: 'thick', mouth: 'smile', glasses: '#2a2a2a', mustache: true },
    top: { kind: 'cardigan', color: '#7a5a3a', trim: '#5a4228', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#d9d4c4' },
    bottom: { kind: 'trousers', color: '#4a4a44', trim: '#32322e' }, shoes: { color: '#3a2a1c', sole: '#1c130c', accent: '#5a4a3a' }, build: 'stocky', weight: 0.9,
  }),
  base({ // 8 teen in a jersey
    id: 'jersey-teen', skin: '#5a3822', hair: 'afro', hairColor: '#0e0a08',
    face: { eyes: 'dot', brows: 'thick', mouth: 'grin' },
    top: { kind: 'jersey', color: '#c2392b', trim: '#f4f4f4', sleeves: 'none', print: 'text', printText: '23', printColor: '#f4f4f4' },
    bottom: { kind: 'shorts', color: '#c2392b', trim: '#f4f4f4' }, shoes: { color: '#f4f4f4', sole: '#c2392b', accent: '#c2392b', high: true }, build: 'tall', weight: 1.1,
  }),
  base({ // 9 scrubs
    id: 'scrubs-nurse', skin: '#b57a52', hair: 'bun', hairColor: '#17110d',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#8a3a3a' },
    top: { kind: 'scrubs', color: '#2aa7a0', trim: '#1f8782', sleeves: 'short', print: 'badge', printColor: '#f4f4f4' },
    bottom: { kind: 'trousers', color: '#2aa7a0', trim: '#1f8782' }, shoes: { color: '#f4f4f4', sole: '#cfcfcf', accent: '#2aa7a0' }, build: 'avg', weight: 0.9,
  }),
  base({ // 10 durag + grey tee
    id: 'durag-tee', skin: '#4f321f', hair: 'bald', hat: 'durag', hatColor: '#1c1c28', hatTrim: '#3a3a5a',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat', beard: true },
    top: { kind: 'tee', color: '#9aa0a8', trim: '#7a8088', sleeves: 'short', print: 'bolt', printColor: '#e8d03a' },
    bottom: { kind: 'cargo', color: '#6a6048', trim: '#4a4232' }, shoes: { color: '#8a5a2a', sole: '#c9b48a', accent: '#5a3a1a', high: true }, build: 'stocky', weight: 1,
  }),
  base({ // 11 denim jacket
    id: 'denim-girl', skin: '#b07a52', hair: 'long', hairColor: '#241812',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#c0505a', lashes: true },
    top: { kind: 'jacket', color: '#4a6c94', trim: '#365274', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#f4f4f4' },
    bottom: { kind: 'leggings', color: '#1a1a1e', trim: '#101014' }, shoes: { color: '#f2a0c0', sole: '#f4f4f4', accent: '#ffffff' }, build: 'slim', weight: 1.1,
  }),
  base({ // 12 tracksuit
    id: 'tracksuit-man', skin: '#7a4c30', hair: 'fade', hairColor: '#120d0a',
    face: { eyes: 'dot', brows: 'thick', mouth: 'smile', stubble: true },
    top: { kind: 'tracksuit', color: '#1f7a4a', trim: '#f4f4f4', sleeves: 'long', print: 'stripes', printColor: '#f4f4f4', zip: true },
    bottom: { kind: 'sweats', color: '#1f7a4a', trim: '#f4f4f4' }, shoes: { color: '#f4f4f4', sole: '#1f7a4a', accent: '#1f7a4a' }, build: 'avg', weight: 1,
  }),
  base({ // 13 long black puffer + beanie
    id: 'puffer-beanie', skin: '#a8734a', hair: 'short', hat: 'beanie', hatColor: '#8a2a2a', hatTrim: '#5c1a1a',
    face: { eyes: 'sleepy', brows: 'thin', mouth: 'flat' },
    top: { kind: 'puffer', color: '#1c1e22', trim: '#2e3138', sleeves: 'long', print: 'star', printColor: '#e8e8e8' },
    bottom: { kind: 'jeans', color: '#262c36', trim: '#161a20' }, shoes: { color: '#d8d0c0', sole: '#8a7a5a', accent: '#3a2a1a', high: true }, weight: 1.2,
  }),
  base({ // 14 plaid work jacket (contractor)
    id: 'work-plaid', skin: '#e0b48c', hair: 'short', hairColor: '#4a3220', hat: 'hardhat', hatColor: '#f0b020', hatTrim: '#c88a10',
    face: { eyes: 'dot', brows: 'thick', mouth: 'frown', stubble: true },
    top: { kind: 'jacket', color: '#a8392b', trim: '#2a2220', sleeves: 'long', print: 'none', printColor: '#ffffff', under: '#d9d4c4', pattern: 'plaid' },
    bottom: { kind: 'jeans', color: '#3a4a60', trim: '#28344a' }, shoes: { color: '#8a6a2a', sole: '#3a2a10', accent: '#c9a36a' }, build: 'stocky', weight: 0.8,
  }),
  base({ // 15 street cop
    id: 'cop', role: 'cop', skin: '#a8734a', hair: 'short', hairColor: '#2a1c12', hat: 'cop', hatColor: '#16213a', hatTrim: '#d8c060', hatLogo: '*',
    face: { eyes: 'dot', brows: 'thick', mouth: 'flat', mustache: true },
    top: { kind: 'uniform', color: '#2a4a8a', trim: '#16213a', sleeves: 'long', print: 'badge', printColor: '#d8c060', tie: '#16213a' },
    bottom: { kind: 'trousers', color: '#16213a', trim: '#0c1426' }, shoes: { color: '#101010', sole: '#050505', accent: '#303030' }, build: 'stocky', weight: 0,
  }),
  base({ // 16 Ms. Odette, the record shop owner
    id: 'odette', role: 'shopkeeper', skin: '#6f4529', hair: 'locs', hairColor: '#c8c8cc',
    face: { eyes: 'wide', brows: 'arched', mouth: 'smile', lips: '#a8324a', glasses: '#c0392b' },
    top: { kind: 'apron', color: '#c0392b', trim: '#8a2218', sleeves: 'long', print: 'heart', printColor: '#f4d03f', under: '#2d7a4a' },
    bottom: { kind: 'skirt', color: '#3a2d52', trim: '#241a38' }, shoes: { color: '#f4d03f', sole: '#3a2d52', accent: '#c0392b' }, build: 'stocky', weight: 0,
  }),
  base({ // 17 the DJ
    id: 'dj', role: 'dj', skin: '#5a3822', hair: 'bald', hat: 'cap', hatColor: '#d4a017', hatTrim: '#111111', hatLogo: 'DJ',
    face: { eyes: 'dot', brows: 'thick', mouth: 'grin', beard: true, glasses: '#111111' },
    top: { kind: 'hoodie', color: '#6a2a8a', trim: '#4a1c64', sleeves: 'long', print: 'bars', printColor: '#f4d03f' },
    bottom: { kind: 'jeans', color: '#161820', trim: '#0c0e14' }, shoes: { color: '#d4a017', sole: '#111111', accent: '#111111', high: true }, build: 'tall', weight: 0,
  }),
  base({ // 18 the player: red hoodie, cap, jeans
    id: 'player', role: 'player', skin: '#8d5a3b', hair: 'short', hat: 'cap', hatColor: '#111111', hatTrim: '#d63a2a', hatLogo: 'B',
    face: { eyes: 'dot', brows: 'thick', mouth: 'smile' },
    top: { kind: 'hoodie', color: '#d63a2a', trim: '#a8261b', sleeves: 'long', print: 'text', printText: 'BK', printColor: '#f4f4f4', zip: false },
    bottom: { kind: 'jeans', color: '#34506f', trim: '#243a52' }, shoes: { color: '#f4f4f4', sole: '#cfcfcf', accent: '#d63a2a' }, build: 'avg', weight: 0,
  }),
];

export const PED_VARIANT_COUNT = PED_SPECS.length;
/** variants 0..CIVILIAN_COUNT-1 are the street civilians */
export const CIVILIAN_COUNT = PED_SPECS.filter((s) => s.role === 'civilian').length;

export function pedVariantIndex(id: string): number {
  const i = PED_SPECS.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`unknown ped variant ${id}`);
  return i;
}

// ---------------------------------------------------------------- colour helpers

function parseHex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const h2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
/** Linear mix of two #rrggbb colours (t = 0 -> a, 1 -> b). */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a), y = parseHex(b);
  return `#${h2(x[0] + (y[0] - x[0]) * t)}${h2(x[1] + (y[1] - x[1]) * t)}${h2(x[2] + (y[2] - x[2]) * t)}`;
}
const dark = (c: string, t: number): string => mixHex(c, '#000000', t);
const light = (c: string, t: number): string => mixHex(c, '#ffffff', t);

// ---------------------------------------------------------------- pixel font (3 x 5)

// 3 x 5 glyphs, rows top to bottom
export const PIXEL_FONT: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
};

// ---------------------------------------------------------------- tile drawing helper

class Tile {
  constructor(readonly ctx: CanvasRenderingContext2D, readonly ox: number, readonly oy: number, readonly w = PED_TILE, readonly h = PED_TILE) {}
  rect(x: number, y: number, w: number, h: number, c: string, a = 1): void {
    const k = this.ctx;
    if (a !== 1) { k.save(); k.globalAlpha = a; }
    k.fillStyle = c;
    k.fillRect(this.ox + x, this.oy + y, w, h);
    if (a !== 1) k.restore();
  }
  poly(pts: ReadonlyArray<readonly [number, number]>, c: string, a = 1): void {
    const k = this.ctx;
    if (a !== 1) { k.save(); k.globalAlpha = a; }
    k.fillStyle = c;
    k.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? k.moveTo(this.ox + x, this.oy + y) : k.lineTo(this.ox + x, this.oy + y)));
    k.closePath();
    k.fill();
    if (a !== 1) k.restore();
  }
  disc(x: number, y: number, r: number, c: string, a = 1): void {
    const k = this.ctx;
    if (a !== 1) { k.save(); k.globalAlpha = a; }
    k.fillStyle = c;
    k.beginPath();
    k.arc(this.ox + x, this.oy + y, r, 0, Math.PI * 2);
    k.fill();
    if (a !== 1) k.restore();
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, lw = 1, a = 1): void {
    const k = this.ctx;
    k.save();
    k.globalAlpha = a; k.strokeStyle = c; k.lineWidth = lw;
    k.beginPath(); k.moveTo(this.ox + x0, this.oy + y0); k.lineTo(this.ox + x1, this.oy + y1); k.stroke();
    k.restore();
  }
  /** text in the 3 x 5 pixel font, `s` px per dot, anchored at the top-left of the first glyph */
  text(str: string, x: number, y: number, s: number, c: string): void {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = PIXEL_FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '#') this.rect(cx + q * s, y + r * s, s, s, c);
      cx += 4 * s;
    }
  }
  textWidth(str: string, s: number): number { return Math.max(0, str.length * 4 * s - s); }
  /** darkening toward the bottom edge, a cheap baked occlusion (steps of alpha) */
  bakeBottom(strength = 0.28, from = 0.55): void {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const y0 = this.h * (from + (1 - from) * (i / steps));
      this.rect(0, y0, this.w, this.h - y0, '#000000', (strength / steps) * 1.0);
    }
  }
  /** darkened vertical edge bands (so a wrapped tile reads rounded) */
  bakeEdges(strength = 0.22, wide = 6): void {
    for (let i = 0; i < 3; i++) {
      const bw = wide * (1 - i / 3);
      this.rect(0, 0, bw, this.h, '#000000', strength / 3);
      this.rect(this.w - bw, 0, bw, this.h, '#000000', strength / 3);
    }
  }
}

// ---------------------------------------------------------------- painting each tile

function paintHeadFront(t: Tile, s: PedSpec, rng: Rng): void {
  const f = s.face;
  t.rect(0, 0, 64, 64, s.skin);
  // forehead light, jaw shade
  t.rect(0, 0, 64, 20, light(s.skin, 0.08));
  t.rect(0, 52, 64, 12, dark(s.skin, 0.14));
  t.rect(0, 56, 64, 3, '#000000', 0.28); // drawn-on shadow line under the chin
  t.rect(0, 0, 4, 64, dark(s.skin, 0.12)); t.rect(60, 0, 4, 64, dark(s.skin, 0.12));
  // hairline (the hair shell covers most of it; this keeps a bald-fade look under caps)
  if (s.hair !== 'bald') {
    t.rect(0, 0, 64, 9, s.hairColor);
    t.poly([[0, 9], [64, 9], [58, 15], [48, 12], [32, 14], [16, 12], [6, 15]], s.hairColor);
  }
  // cheeks
  t.disc(14, 38, 5, light(s.skin, 0.1), 0.5); t.disc(50, 38, 5, light(s.skin, 0.1), 0.5);
  // nose: a shaded wedge
  t.poly([[29, 30], [35, 30], [38, 42], [26, 42]], dark(s.skin, 0.2), 0.8);
  t.rect(27, 41, 10, 2, dark(s.skin, 0.35), 0.8);
  // eyes
  const ey = f.eyes === 'wide' ? 27 : 28;
  for (const sx of [-1, 1]) {
    const cx = 32 + sx * 12;
    const ew = f.eyes === 'wide' ? 10 : 8, eh = f.eyes === 'sleepy' ? 3 : f.eyes === 'wide' ? 6 : 5;
    t.rect(cx - ew / 2, ey, ew, eh, '#f4f1ea');
    t.rect(cx - ew / 2, ey, ew, 1, dark(s.skin, 0.4));
    const px = cx - 1.5 + sx * -0.5;
    t.rect(px, ey + (f.eyes === 'sleepy' ? 0 : 0.5), 3.5, Math.min(eh - 0.5, 4), '#1a1410');
    if (f.lashes) { t.rect(cx - ew / 2 - 1, ey - 1, ew + 2, 1.5, '#120c08'); }
    // brows
    const bw = f.brows === 'thick' ? 12 : 10, bh = f.brows === 'thick' ? 3 : 2;
    const by = ey - 5 - (f.brows === 'arched' ? 1 : 0);
    if (f.brows === 'arched') t.poly([[cx - bw / 2, by + 2], [cx - 2 * sx, by - 1], [cx + bw / 2, by + 2], [cx + bw / 2, by + 3.5], [cx - bw / 2, by + 3.5]], s.hair === 'bald' ? '#241a14' : dark(s.hairColor, 0.1));
    else t.rect(cx - bw / 2, by, bw, bh, s.hair === 'bald' ? '#241a14' : dark(s.hairColor, 0.1));
    if (f.glasses) {
      t.rect(cx - 7, ey - 2, 14, 9, f.glasses);
      t.rect(cx - 6, ey - 1, 12, 7, '#d8e8f0', 0.35);
      t.rect(cx - ew / 2, ey, ew, eh, '#f4f1ea', 0.9);
      t.rect(px, ey + 0.5, 3.5, Math.min(eh - 0.5, 4), '#1a1410');
    }
  }
  if (f.glasses) t.rect(26, ey + 1, 12, 2, f.glasses);
  // mouth
  const my = 49;
  const lip = f.lips ?? dark(s.skin, 0.42);
  if (f.mouth === 'grin') { t.rect(22, my - 1, 20, 6, '#6a2a2a'); t.rect(23, my, 18, 3, '#f4f1ea'); t.rect(22, my - 1, 20, 1, lip); }
  else if (f.mouth === 'smile') { t.poly([[22, my - 1], [42, my - 1], [38, my + 3], [26, my + 3]], lip); t.rect(26, my + 0, 12, 1.5, '#f4f1ea', 0.9); }
  else if (f.mouth === 'frown') { t.poly([[24, my + 3], [40, my + 3], [37, my], [27, my]], lip); }
  else t.rect(24, my, 16, 2.5, lip);
  if (f.lips) t.rect(24, my + 2, 16, 2, f.lips, 0.8);
  if (f.mustache) t.rect(22, my - 5, 20, 4, s.hair === 'bald' ? '#241a14' : s.hairColor === '#b8b8b8' ? '#c0c0c0' : dark(s.hairColor, 0.1));
  if (f.stubble) { for (let i = 0; i < 90; i++) t.rect(rng.range(8, 56), rng.range(40, 62), 1, 1, '#000000', 0.28); }
  if (f.beard) {
    const bc = s.hair === 'bald' ? '#241a14' : s.hairColor;
    t.poly([[2, 36], [10, 44], [22, 53], [42, 53], [54, 44], [62, 36], [62, 64], [2, 64]], bc);
    t.rect(22, my - 1, 20, 4, lip);
    t.rect(22, my - 6, 20, 4, bc);
  }
}

function paintHeadBack(t: Tile, s: PedSpec): void {
  t.rect(0, 0, 64, 64, s.hair === 'bald' ? s.skin : s.hairColor);
  if (s.hair === 'bald') { t.rect(0, 40, 64, 24, dark(s.skin, 0.12)); return; }
  t.rect(0, 0, 64, 6, light(s.hairColor, 0.1));
  t.rect(0, 40, 64, 24, s.hair === 'fade' ? s.skin : s.hairColor);
  t.rect(0, 44, 64, 20, dark(s.skin, 0.1), s.hair === 'fade' ? 0.7 : 0);
}

function paintHeadSide(t: Tile, s: PedSpec): void {
  t.rect(0, 0, 64, 64, s.skin);
  t.rect(0, 52, 64, 12, dark(s.skin, 0.14));
  if (s.hair !== 'bald') { t.rect(0, 0, 64, 17, s.hairColor); t.rect(30, 14, 34, 10, s.hairColor); t.rect(0, 17, 16, 20, s.hair === 'fade' ? dark(s.hairColor, 0.1) : s.hairColor, 0.9); }
  // ear (front of the tile is on the right)
  t.rect(22, 25, 12, 15, dark(s.skin, 0.1));
  t.rect(24, 27, 8, 11, s.skin);
  t.rect(26, 30, 4, 5, dark(s.skin, 0.25), 0.7);
  // sideburn / beard edge
  if (s.face.beard) t.rect(40, 36, 24, 28, s.hair === 'bald' ? '#241a14' : s.hairColor);
}

function paintHeadCaps(t: Tile, s: PedSpec): void {
  t.rect(0, 0, 32, 32, s.hair === 'bald' ? s.skin : s.hairColor);
  t.rect(32, 0, 32, 32, dark(s.skin, 0.2));
  void t;
}

/** Plaid / pinstripe / fold overlays shared by cloth tiles. */
function folds(t: Tile, color: string, rng: Rng, n: number, x0 = 0, x1 = 64, y0 = 0, y1 = 64): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1);
    const y = rng.range(y0, y1 - 14);
    const len = rng.range(8, 16);
    t.line(x, y, x + rng.range(-3, 3), y + len, color, 1.5, 0.28);
  }
}

function paintPrint(t: Tile, s: PedSpec, cx: number, cy: number, maxW: number): void {
  const p = s.top;
  switch (p.print) {
    case 'text': {
      const txt = p.printText ?? '';
      const sc = Math.max(2, Math.min(4, Math.floor(maxW / Math.max(1, txt.length * 4 - 1))));
      const w = t.textWidth(txt, sc);
      t.text(txt, cx - w / 2, cy - (5 * sc) / 2, sc, p.printColor);
      break;
    }
    case 'star': {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 === 0 ? 10 : 4.5; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      t.poly(pts, p.printColor);
      break;
    }
    case 'bolt':
      t.poly([[cx + 3, cy - 12], [cx - 7, cy + 2], [cx - 1, cy + 2], [cx - 4, cy + 12], [cx + 7, cy - 3], [cx + 1, cy - 3]], p.printColor);
      break;
    case 'heart':
      t.disc(cx - 4, cy - 2, 4.5, p.printColor); t.disc(cx + 4, cy - 2, 4.5, p.printColor);
      t.poly([[cx - 8.5, cy], [cx + 8.5, cy], [cx, cy + 10]], p.printColor);
      break;
    case 'bars':
      for (let i = 0; i < 5; i++) t.rect(cx - 12 + i * 5, cy + 6 - [6, 11, 15, 9, 5][i], 4, [6, 11, 15, 9, 5][i] + 4, p.printColor);
      break;
    case 'badge':
      t.poly([[cx, cy - 7], [cx + 7, cy - 3], [cx + 5, cy + 6], [cx - 5, cy + 6], [cx - 7, cy - 3]], p.printColor);
      t.rect(cx - 2, cy - 2, 4, 5, dark(p.printColor, 0.35));
      break;
    default:
  }
}

function paintTorsoFront(t: Tile, s: PedSpec, rng: Rng): void {
  const p = s.top;
  const c = p.color;
  t.rect(0, 0, 64, 64, c);
  // chest light / hem shade, the folds that give the cloth a PS2 hand-painted look
  t.rect(0, 0, 64, 14, light(c, 0.08));
  folds(t, dark(c, 0.5), rng, 7, 6, 58, 18, 64);
  if (p.pattern === 'plaid') {
    for (let x = 4; x < 64; x += 10) t.rect(x, 0, 4, 64, dark(c, 0.45), 0.5);
    for (let y = 2; y < 64; y += 10) t.rect(0, y, 64, 4, dark(c, 0.45), 0.5);
    for (let x = 9; x < 64; x += 20) t.rect(x, 0, 1, 64, '#e8d8a0', 0.5);
  }
  const neck = s.skin;
  switch (p.kind) {
    case 'hoodie':
      t.poly([[16, 0], [48, 0], [44, 10], [32, 16], [20, 10]], dark(c, 0.3));      // hood opening
      t.poly([[24, 0], [40, 0], [37, 8], [32, 11], [27, 8]], neck);
      t.rect(14, 44, 36, 14, dark(c, 0.14)); t.rect(14, 44, 36, 1.5, dark(c, 0.4)); // kangaroo pocket
      t.line(26, 12, 26, 26, '#e8e8e8', 1.5); t.line(38, 12, 38, 26, '#e8e8e8', 1.5);  // drawstrings
      if (p.zip) t.rect(31, 14, 2, 50, '#cccccc');
      break;
    case 'puffer':
      for (let y = 10; y < 64; y += 11) { t.rect(0, y, 64, 1.8, dark(c, 0.55), 0.7); t.rect(0, y + 1.8, 64, 3, light(c, 0.1), 0.5); }
      t.rect(29, 0, 6, 64, dark(c, 0.3), 0.5);
      t.poly([[18, 0], [46, 0], [42, 7], [22, 7]], dark(c, 0.35));
      t.poly([[25, 0], [39, 0], [36, 5], [28, 5]], neck);
      t.rect(31, 8, 2, 56, '#bfbfbf');
      break;
    case 'jersey':
      t.poly([[0, 0], [14, 0], [20, 22], [0, 22]], p.trim); t.poly([[64, 0], [50, 0], [44, 22], [64, 22]], p.trim);
      t.poly([[22, 0], [42, 0], [38, 9], [32, 12], [26, 9]], neck);
      t.rect(0, 58, 64, 6, p.trim);
      break;
    case 'vest':
      t.rect(0, 0, 64, 64, p.under ?? '#222');
      t.rect(6, 0, 18, 64, c); t.rect(40, 0, 18, 64, c);
      t.rect(6, 30, 18, 6, p.printColor); t.rect(40, 30, 18, 6, p.printColor); t.rect(6, 50, 18, 5, p.printColor); t.rect(40, 50, 18, 5, p.printColor);
      t.poly([[24, 0], [40, 0], [37, 8], [32, 10], [27, 8]], neck);
      t.rect(26, 0, 12, 2, dark(p.under ?? '#222', 0.3));
      break;
    case 'jacket':
    case 'cardigan': {
      const under = p.under ?? '#f4f4f4';
      t.rect(18, 0, 28, 64, under);
      t.poly([[18, 0], [28, 0], [32, 36], [22, 64], [18, 64]], dark(c, 0.1)); t.poly([[46, 0], [36, 0], [32, 36], [42, 64], [46, 64]], dark(c, 0.1));
      t.poly([[18, 0], [26, 0], [30, 14], [22, 14]], light(c, 0.12)); t.poly([[46, 0], [38, 0], [34, 14], [42, 14]], light(c, 0.12));
      t.poly([[26, 0], [38, 0], [35, 6], [32, 8], [29, 6]], neck);
      if (p.tie) { t.poly([[30, 6], [34, 6], [35, 14], [32, 40], [29, 14]], p.tie); }
      if (p.kind === 'cardigan') for (let y = 12; y < 60; y += 12) t.disc(24, y, 2, '#e8dcc0');
      else for (let y = 36; y < 64; y += 14) t.disc(24, y, 1.8, dark(c, 0.5));
      t.rect(6, 44, 12, 2, dark(c, 0.4)); t.rect(46, 44, 12, 2, dark(c, 0.4)); // flap pockets
      break;
    }
    case 'uniform':
      t.poly([[22, 0], [42, 0], [38, 9], [32, 14], [26, 9]], p.tie ? '#f1efe6' : neck);
      t.poly([[22, 0], [30, 0], [32, 14], [24, 10]], dark(c, 0.15)); t.poly([[42, 0], [34, 0], [32, 14], [40, 10]], dark(c, 0.15));
      if (p.tie) t.poly([[30, 10], [34, 10], [34, 36], [32, 40], [30, 36]], p.tie);
      t.rect(8, 20, 14, 10, dark(c, 0.15)); t.rect(42, 20, 14, 10, dark(c, 0.15)); t.rect(8, 20, 14, 1.5, p.printColor, 0.8);
      t.rect(0, 52, 64, 5, '#16213a'); t.rect(28, 52, 8, 5, '#c8b04a'); // belt + buckle
      break;
    case 'scrubs':
      t.poly([[20, 0], [44, 0], [32, 22]], neck); t.poly([[20, 0], [24, 0], [32, 14]], dark(c, 0.2)); t.poly([[44, 0], [40, 0], [32, 14]], dark(c, 0.2));
      t.rect(8, 40, 14, 14, dark(c, 0.12)); t.rect(8, 40, 14, 1.5, dark(c, 0.4));
      t.line(26, 4, 30, 40, '#f4f4f4', 1.2, 0.7);
      break;
    case 'blouse':
    case 'dress':
      t.poly([[18, 0], [46, 0], [38, 14], [26, 14]], neck);
      t.poly([[18, 0], [24, 0], [28, 14]], dark(c, 0.15)); t.poly([[46, 0], [40, 0], [36, 14]], dark(c, 0.15));
      t.rect(0, 46, 64, 4, p.trim, 0.9);
      break;
    case 'tracksuit':
      t.poly([[20, 0], [44, 0], [40, 7], [24, 7]], dark(c, 0.15)); t.poly([[26, 0], [38, 0], [35, 5], [29, 5]], neck);
      t.rect(31, 7, 2, 57, '#e0e0e0'); t.rect(0, 0, 4, 64, p.trim); t.rect(60, 0, 4, 64, p.trim);
      break;
    case 'apron':
      t.rect(0, 0, 64, 64, p.under ?? '#2d7a4a');
      t.poly([[14, 2], [50, 2], [54, 64], [10, 64]], c);
      t.rect(14, 0, 4, 10, c); t.rect(46, 0, 4, 10, c);
      t.poly([[24, 0], [40, 0], [36, 8], [28, 8]], neck);
      t.rect(20, 40, 24, 14, dark(c, 0.15)); t.rect(20, 40, 24, 1.5, dark(c, 0.45));
      break;
    default: // tee
      t.poly([[22, 0], [42, 0], [38, 8], [32, 11], [26, 8]], neck);
      t.rect(21, 0, 22, 3, dark(c, 0.15));
  }
  if (p.kind !== 'vest' && p.kind !== 'jacket' && p.kind !== 'cardigan') {
    const py = p.kind === 'hoodie' ? 36 : p.kind === 'puffer' ? 32 : p.kind === 'uniform' ? 26 : p.kind === 'apron' ? 26 : 34;
    const px = p.kind === 'uniform' ? 47 : p.kind === 'scrubs' ? 16 : 32;
    if (p.print !== 'stripes') paintPrint(t, s, px, p.kind === 'hoodie' ? 32 : py, 36);
  }
  if (p.print === 'stripes' && p.kind !== 'vest') { t.rect(0, 40, 64, 3, p.printColor); t.rect(0, 46, 64, 3, p.printColor); }
  t.rect(0, 0, 64, 3, '#000000', 0.25); t.rect(0, 14, 64, 2, '#000000', 0.12); // shadow under the neck and the sleeve seam line
  t.bakeEdges(0.24, 7);
  t.bakeBottom(0.22);
}

function paintTorsoBack(t: Tile, s: PedSpec, rng: Rng): void {
  const p = s.top;
  const c = p.kind === 'apron' ? (p.under ?? '#2d7a4a') : p.color;
  t.rect(0, 0, 64, 64, p.kind === 'vest' ? (p.under ?? '#222') : c);
  t.rect(0, 0, 64, 12, light(c, 0.07));
  folds(t, dark(c, 0.5), rng, 7, 6, 58, 12, 64);
  if (p.kind === 'hoodie') { t.poly([[10, 0], [54, 0], [46, 20], [32, 26], [18, 20]], dark(c, 0.16)); t.line(32, 24, 32, 64, dark(c, 0.4), 1.5, 0.5); }
  else if (p.kind === 'puffer') for (let y = 10; y < 64; y += 11) { t.rect(0, y, 64, 1.8, dark(c, 0.55), 0.7); t.rect(0, y + 1.8, 64, 3, light(c, 0.1), 0.5); }
  else if (p.kind === 'vest') { t.rect(8, 0, 48, 64, p.color); t.rect(8, 28, 48, 6, p.printColor); t.rect(8, 48, 48, 5, p.printColor); t.poly([[20, 0], [32, 18], [44, 0]], p.printColor); }
  else if (p.kind === 'jersey') { t.text(p.printText ?? '', 32 - t.textWidth(p.printText ?? '', 4) / 2, 18, 4, p.printColor); t.rect(0, 58, 64, 6, p.trim); t.rect(0, 0, 14, 22, p.trim); t.rect(50, 0, 14, 22, p.trim); }
  else if (p.kind === 'tracksuit') { t.rect(0, 0, 4, 64, p.trim); t.rect(60, 0, 4, 64, p.trim); }
  else if (p.kind === 'uniform') { t.rect(0, 52, 64, 5, '#16213a'); t.text('POLICE', 32 - t.textWidth('POLICE', 2) / 2, 22, 2, '#e8e8e8'); }
  else if (p.kind === 'scrubs') { t.rect(0, 0, 64, 4, dark(c, 0.15)); }
  else if (p.pattern === 'plaid') { for (let x = 4; x < 64; x += 10) t.rect(x, 0, 4, 64, dark(c, 0.45), 0.5); for (let y = 2; y < 64; y += 10) t.rect(0, y, 64, 4, dark(c, 0.45), 0.5); }
  else if (p.kind === 'apron') { t.poly([[14, 0], [20, 0], [32, 30], [44, 0], [50, 0], [32, 40]], p.color); t.rect(8, 40, 48, 4, p.color); }
  if (p.print === 'text' && p.kind !== 'jersey' && p.kind !== 'uniform' && (p.kind === 'tee' || p.kind === 'hoodie')) {
    t.text(p.printText ?? '', 32 - t.textWidth(p.printText ?? '', 2) / 2, 38, 2, p.printColor);
  }
  t.bakeEdges(0.24, 7);
  t.bakeBottom(0.22);
}

function paintTorsoSide(t: Tile, s: PedSpec, rng: Rng): void {
  const p = s.top;
  const c = p.kind === 'vest' ? (p.under ?? '#222') : p.color;
  t.rect(0, 0, 64, 64, c);
  t.rect(0, 0, 64, 12, light(c, 0.06));
  folds(t, dark(c, 0.5), rng, 4, 8, 56, 14, 64);
  if (p.kind === 'puffer') for (let y = 10; y < 64; y += 11) { t.rect(0, y, 64, 1.8, dark(c, 0.55), 0.7); }
  if (p.kind === 'vest') { t.rect(10, 0, 44, 64, p.color, 0.0); t.rect(0, 30, 64, 6, p.printColor, 0.0); }
  if (p.kind === 'tracksuit') t.rect(28, 0, 8, 64, p.trim);
  if (p.kind === 'jersey') t.rect(0, 58, 64, 6, p.trim);
  t.bakeBottom(0.22);
}

function paintTorsoCaps(t: Tile, s: PedSpec): void {
  t.rect(0, 0, 32, 32, s.skin);                 // neck / collar top
  t.rect(32, 0, 32, 32, s.bottom.color);        // waist underside
  t.rect(0, 32, 64, 32, s.top.color);
}

/** Arm tiles: the sleeve fabric (long = whole tile, short = top part, none = skin). */
function paintUpperArm(t: Tile, s: PedSpec, rng: Rng): void {
  const p = s.top;
  const c = p.kind === 'vest' ? (p.under ?? '#222') : p.color;
  t.rect(0, 0, 64, 64, s.skin);
  t.rect(0, 40, 64, 24, dark(s.skin, 0.12));
  const cover = p.sleeves === 'long' ? 64 : p.sleeves === 'short' ? 42 : p.kind === 'jersey' ? 12 : 0;
  if (cover > 0) {
    t.rect(0, 0, 64, cover, c);
    folds(t, dark(c, 0.5), rng, 3, 8, 56, 0, cover);
    if (p.kind === 'puffer') for (let y = 8; y < cover; y += 11) { t.rect(0, y, 64, 1.8, dark(c, 0.55), 0.7); }
    if (p.kind === 'tracksuit') t.rect(26, 0, 12, cover, p.trim);
    if (p.pattern === 'plaid') { for (let x = 4; x < 64; x += 10) t.rect(x, 0, 4, cover, dark(c, 0.45), 0.5); for (let y = 2; y < cover; y += 10) t.rect(0, y, 64, 4, dark(c, 0.45), 0.5); }
    if (p.sleeves === 'short') t.rect(0, cover - 4, 64, 4, dark(c, 0.2));
    if (p.kind === 'uniform') t.rect(8, 6, 16, 12, p.printColor, 0.6);
  }
  t.rect(0, 0, 64, 3, '#000000', 0.3); // shadow where the arm leaves the shirt
  t.bakeEdges(0.25, 8);
  t.bakeBottom(0.18);
}

function paintForeArm(t: Tile, s: PedSpec, rng: Rng): void {
  const p = s.top;
  const c = p.kind === 'vest' ? (p.under ?? '#222') : p.color;
  t.rect(0, 0, 64, 64, s.skin);
  t.rect(0, 0, 64, 12, light(s.skin, 0.05));
  if (p.sleeves === 'long') {
    t.rect(0, 0, 64, 52, c);
    folds(t, dark(c, 0.5), rng, 3, 8, 56, 0, 52);
    t.rect(0, 46, 64, 6, p.kind === 'tracksuit' ? p.trim : dark(c, 0.25));            // cuff
    if (p.kind === 'puffer') for (let y = 8; y < 50; y += 11) { t.rect(0, y, 64, 1.8, dark(c, 0.55), 0.7); }
    if (p.kind === 'jacket' || p.kind === 'cardigan') { if (p.under) t.rect(0, 52, 64, 5, p.under); }
    if (p.pattern === 'plaid') { for (let x = 4; x < 64; x += 10) t.rect(x, 0, 4, 52, dark(c, 0.45), 0.5); }
  }
  t.bakeEdges(0.25, 8);
}

function paintHand(t: Tile, s: PedSpec): void {
  t.rect(0, 0, 64, 64, s.skin);
  t.rect(0, 0, 64, 14, s.top.sleeves === 'long' ? dark(s.skin, 0.08) : s.skin);
  // finger lines
  for (let i = 1; i < 4; i++) t.rect(i * 16 - 1, 30, 1.5, 34, dark(s.skin, 0.35));
  t.rect(0, 30, 64, 2, dark(s.skin, 0.25));
  t.rect(0, 52, 64, 12, dark(s.skin, 0.16));
  t.bakeEdges(0.18, 6);
}

function paintHips(t: Tile, s: PedSpec, rng: Rng): void {
  const b = s.bottom;
  const dressy = s.top.kind === 'dress';
  const c = b.color;
  t.rect(0, 0, 64, 64, c);
  t.rect(0, 0, 64, 8, dark(c, 0.14));
  folds(t, dark(c, 0.5), rng, 6, 4, 60, 12, 64);
  if (b.kind === 'skirt') {
    for (let x = 4; x < 64; x += 9) t.rect(x, 8, 1.5, 56, dark(c, 0.3), 0.55);
    t.rect(0, 58, 64, 6, b.trim, dressy ? 0.4 : 0.85);
  } else if (b.kind === 'jeans') {
    t.rect(30, 6, 3, 30, dark(c, 0.35)); t.rect(8, 8, 16, 14, dark(c, 0.14)); t.rect(40, 8, 16, 14, dark(c, 0.14));
    t.rect(0, 0, 64, 4, '#6a4a2a');
    t.rect(28, 0, 8, 4, '#c8b04a');
  } else if (b.kind === 'cargo') {
    t.rect(6, 22, 20, 18, dark(c, 0.14)); t.rect(38, 22, 20, 18, dark(c, 0.14)); t.rect(6, 22, 20, 2, dark(c, 0.4)); t.rect(38, 22, 20, 2, dark(c, 0.4));
    t.rect(0, 0, 64, 4, '#222');
  } else if (b.kind === 'sweats') {
    t.rect(0, 0, 64, 6, b.trim); t.rect(28, 6, 2, 8, '#e8e8e8'); t.rect(34, 6, 2, 8, '#e8e8e8');
  } else if (b.kind === 'shorts') {
    t.rect(0, 0, 64, 5, b.trim, 0.8);
  } else if (b.kind === 'trousers') {
    t.rect(0, 0, 64, 5, '#191919'); t.rect(30, 6, 3, 30, dark(c, 0.35)); t.rect(8, 6, 3, 18, dark(c, 0.3));
  } else {
    t.rect(0, 0, 64, 4, dark(c, 0.3));
  }
  t.bakeEdges(0.2, 6);
  t.bakeBottom(0.18);
}

function legColor(s: PedSpec, lower: boolean): string | null {
  const k = s.bottom.kind;
  if (k === 'shorts') return lower ? null : s.bottom.color;
  if (k === 'skirt') return null;
  return s.bottom.color;
}

function paintLeg(t: Tile, s: PedSpec, rng: Rng, lower: boolean): void {
  const c = legColor(s, lower);
  const k = s.bottom.kind;
  t.rect(0, 0, 64, 64, s.skin);
  t.rect(0, 40, 64, 24, dark(s.skin, 0.1));
  if (k === 'skirt' && lower && s.top.kind === 'dress') t.rect(0, 0, 64, 20, s.bottom.color);
  if (c) {
    const len = k === 'shorts' && !lower ? 52 : 64;
    t.rect(0, 0, 64, len, c);
    t.rect(0, 0, 64, 10, light(c, 0.05));
    folds(t, dark(c, 0.5), rng, 3, 6, 58, 0, len);
    t.rect(30, 0, 3, len, dark(c, 0.3), 0.45); // seam
    if (k === 'jeans') { t.rect(0, lower ? 54 : 0, 64, lower ? 10 : 0, light(c, 0.12)); if (lower) t.rect(0, 58, 64, 3, '#e8d8a0', 0.6); }
    if (k === 'trousers') { t.rect(28, 0, 8, len, light(c, 0.1), 0.35); if (lower) t.rect(0, 58, 64, 6, dark(c, 0.25)); }
    if (k === 'sweats') { if (lower) { t.rect(0, 54, 64, 10, s.bottom.trim); } t.rect(0, 0, 4, len, s.bottom.trim); t.rect(60, 0, 4, len, s.bottom.trim); }
    if (k === 'cargo' && !lower) { t.rect(8, 28, 48, 20, dark(c, 0.14)); t.rect(8, 28, 48, 2, dark(c, 0.4)); }
    if (k === 'cargo' && lower) t.rect(0, 56, 64, 8, dark(c, 0.25));
    if (k === 'shorts' && !lower) t.rect(0, 46, 64, 6, s.bottom.trim);
    if (k === 'leggings') { t.rect(0, 0, 64, 64, c); t.rect(0, 0, 64, 10, light(c, 0.1), 0.6); }
  }
  if (lower && (k === 'shorts' || k === 'skirt')) {
    // socks
    t.rect(0, 48, 64, 16, '#f4f4f4'); t.rect(0, 48, 64, 3, s.shoes.accent);
  }
  t.bakeEdges(0.22, 8);
  t.bakeBottom(0.15);
}

function paintShoe(t: Tile, s: PedSpec, rng: Rng): void {
  const sh = s.shoes;
  // t = 0 (bottom of the tile) is the sole; the opening is at the top
  t.rect(0, 0, 64, 64, sh.color);
  t.rect(0, 0, 64, 16, light(sh.color, 0.1));
  t.rect(0, 50, 64, 14, sh.sole);                // sole band at the bottom of the tile
  t.rect(0, 50, 64, 2, dark(sh.sole, 0.2));
  t.rect(0, 36, 64, 14, dark(sh.color, 0.12));   // toe cap shade
  t.rect(12, 14, 40, 3, sh.accent); t.rect(12, 20, 40, 3, sh.accent, 0.8);        // laces / strap
  t.rect(0, 22, 14, 18, sh.accent, 0.9);          // swoosh-free accent patch (heel tab)
  for (let i = 0; i < 40; i++) t.rect(rng.range(0, 62), rng.range(30, 62), 2, 1, '#000000', 0.2);
  t.bakeEdges(0.2, 6);
}

function paintGear(t: Tile, s: PedSpec, rng: Rng): void {
  // Q0 hair: flat with a highlight strip and strand lines
  const hc = s.hairColor;
  t.rect(0, 0, 32, 32, hc);
  t.rect(0, 0, 32, 6, light(hc, 0.14));
  for (let i = 0; i < 8; i++) t.rect(i * 4 + 1, 0, 1, 32, dark(hc, 0.3), 0.5);
  // Q1 hat front panel: cap colour with the logo
  t.rect(32, 0, 32, 32, s.hatColor);
  t.rect(32, 0, 32, 4, light(s.hatColor, 0.12));
  if (s.hatLogo === '*') {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 === 0 ? 9 : 4; pts.push([48 + Math.cos(a) * r, 16 + Math.sin(a) * r]); }
    t.poly(pts, s.hatTrim);
  } else if (s.hatLogo) {
    const sc = s.hatLogo.length > 2 ? 2 : 3;
    t.text(s.hatLogo, 48 - t.textWidth(s.hatLogo, sc) / 2, 16 - (5 * sc) / 2, sc, s.hatTrim);
  }
  // Q2 backpack / bag: colour, zip pocket, strap lines
  const gc = s.gearColor;
  t.rect(0, 32, 32, 32, gc);
  t.rect(0, 32, 32, 5, light(gc, 0.12));
  t.rect(4, 46, 24, 14, dark(gc, 0.14)); t.rect(4, 46, 24, 1.5, dark(gc, 0.45)); t.rect(14, 38, 4, 6, '#d8d8d8');
  t.rect(0, 60, 32, 4, dark(gc, 0.25));
  // Q3 hat main: plain colour for the crown, brim and wraps, or a printed headwrap
  t.rect(32, 32, 32, 32, s.hatColor);
  t.rect(32, 32, 32, 4, light(s.hatColor, 0.1));
  if (s.hat === 'headwrap') {
    for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) {
      if (((x + y) / 8) % 2 === 0) t.poly([[32 + x + 4, 32 + y + 1], [32 + x + 7, 32 + y + 4], [32 + x + 4, 32 + y + 7], [32 + x + 1, 32 + y + 4]], s.hatTrim);
      else t.disc(32 + x + 4, 32 + y + 4, 1.8, '#f4f1e0');
    }
  } else if (s.hat === 'church') {
    t.rect(32, 50, 32, 4, s.hatTrim);
    for (let i = 0; i < 6; i++) t.rect(32 + rng.range(0, 30), 32 + rng.range(0, 30), 2, 2, s.hatTrim, 0.5);
  } else if (s.hat === 'cop') { t.rect(32, 54, 32, 4, s.hatTrim); }
  else if (s.hat === 'beanie') { for (let x = 0; x < 32; x += 3) t.rect(32 + x, 32, 1, 32, dark(s.hatColor, 0.25), 0.7); t.rect(32, 54, 32, 8, s.hatTrim); }
  else if (s.hat === 'hardhat') { t.rect(32, 44, 32, 3, light(s.hatColor, 0.2)); }
  else if (s.hat === 'durag') { t.rect(32, 48, 32, 3, s.hatTrim); }
  else if (s.hat === 'cap') { t.rect(32, 56, 32, 4, s.hatTrim, 0.5); }
}

// ---------------------------------------------------------------- the atlas painter

/** `variant` = index into PED_SPECS (wrapped). Paints the whole 256 x 256 atlas. */
export const pedAtlasPainter: Painter = (ctx, w, h, rng, variant) => {
  const s = PED_SPECS[((Math.floor(variant) % PED_VARIANT_COUNT) + PED_VARIANT_COUNT) % PED_VARIANT_COUNT];
  void w; void h; // painted for the canonical 256 px atlas
  const T = (name: PedTile): Tile => { const r = pedTileRect(name); return new Tile(ctx, r.x, r.y); };
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  paintHeadFront(T('headFront'), s, rng);
  paintHeadBack(T('headBack'), s);
  paintHeadSide(T('headSide'), s);
  paintHeadCaps(T('headCaps'), s);
  paintTorsoFront(T('torsoFront'), s, rng);
  paintTorsoBack(T('torsoBack'), s, rng);
  paintTorsoSide(T('torsoSide'), s, rng);
  paintTorsoCaps(T('torsoCaps'), s);
  paintUpperArm(T('upperArm'), s, rng);
  paintForeArm(T('foreArm'), s, rng);
  paintHand(T('hand'), s);
  paintHips(T('hips'), s, rng);
  paintLeg(T('thigh'), s, rng, false);
  paintLeg(T('shin'), s, rng, true);
  paintShoe(T('shoe'), s, rng);
  paintGear(T('gear'), s, rng);
};

/** Church variants get extra pick weight in the late morning (Sunday service); `hour` in 0..24. */
export function pedChurchBoost(hour: number, sunday = true): number {
  if (!sunday) return 1;
  return hour >= 9 && hour <= 13.5 ? 7 : 1;
}
