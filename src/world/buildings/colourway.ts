/**
 * Per-lot facade colourway (TEXVAR). Every lot hashes its id into a private stream and picks a wall kind (brick, vinyl /
 * aluminium siding, stucco, new-build panel cladding, dark glazed brick), a colour from the palette of its masonry family,
 * a mortar tone, a weathering amount and a UV jitter. Nothing here uses the lot's own rng stream, so facade layouts are
 * unchanged. The result is written by `LotBatch.flush` into two vertex attributes (`aTone`, `aStyle`) that the shared wall
 * materials read in `src/textures/lotTone.ts`: the city keeps one mesh (one draw call) per material while every
 * building reads differently. Pure and deterministic.
 */
import { Rng } from '@/core/Rng';
import type { Lot } from '@/world/types';
import type { LotSpec, MaterialFamily } from './facade';
import { observedFacade } from '@/world/data/facadeObserved';
import type { ObservedMaterial } from '@/world/data/facadeObserved';

export type RGB = [number, number, number];

/** Wall surface kinds; the value is what the shader branches on (`kind * KIND_STEP` is stored in `aStyle.x`). */
export const WallKind = { brick: 0, siding: 1, stucco: 2, panel: 3, glazed: 4, trim: 5, awning: 6, stripedAwning: 7, gate: 8, party: 9 } as const;
/** `kind * KIND_STEP` is the byte stored in `aStyle.x` (kinds 0..10 fit). */
export const KIND_STEP = 24;
/** the lot's roof-line height / ROOF_SCALE rides in the alpha of the `color` vertex attribute of its wall materials (stain placement in lotTone.ts) */
export const ROOF_SCALE = 64;
export type WallKindValue = (typeof WallKind)[keyof typeof WallKind];

export interface Colourway {
  /** stable label of the look, e.g. `brick:orange` (the variety metric counts these) */
  id: string;
  kind: WallKindValue;
  /** sRGB target colour (average) of the street front */
  front: RGB;
  /** paint amount 0..1: 0 keeps the texture's own brick-to-brick colour spread, 1 is one flat painted colour */
  paint: number;
  /** mortar tone 0..1 (0.5 = as photographed, below darker, above whiter) */
  mortar: number;
  /** weathering amount 0..1: soot, streaks, patches, painted-over graffiti */
  weather: number;
  seed: number;
  /** party / back wall colours by `brickRed` variant 0..3 (red, brown, cream painted, blue-grey painted) */
  party: [RGB, RGB, RGB, RGB];
  cornice: RGB;
  /** fire escape, window bars and ironwork paint */
  metal: RGB;
  /** roll-down gate paint */
  gate: RGB;
  /** limestone trim (sills, lintels, copings) */
  trim: RGB;
  /** plain shop awning and window awning fabric colours; `striped` = white-stripe pattern on the shop awning */
  awning: [RGB, RGB];
  striped: boolean;
  /** texture UV jitter applied to this lot's wall materials */
  uv: { scale: number; ou: number; ov: number; flip: boolean };
}

interface Swatch { id: string; c: string; w: number; paint?: number }

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const BRICK: Swatch[] = [
  { id: 'red', c: '#9b4a3c', w: 30 }, { id: 'deep-red', c: '#7f3a30', w: 12 }, { id: 'orange', c: '#b4623f', w: 14 },
  { id: 'brown', c: '#6f4a3d', w: 12 }, { id: 'buff', c: '#c3a574', w: 8 }, { id: 'yellow', c: '#cdb06a', w: 4 },
  { id: 'white', c: '#d8d2c4', w: 6, paint: 0.9 }, { id: 'grey', c: '#8f9396', w: 5, paint: 0.9 },
  { id: 'blue', c: '#6f8aa3', w: 3, paint: 0.9 }, { id: 'sage', c: '#8da08a', w: 2, paint: 0.9 },
  { id: 'cream', c: '#e1d4b0', w: 2, paint: 0.9 }, { id: 'maroon', c: '#5e2f2c', w: 3, paint: 0.8 },
];
const STONE: Swatch[] = [
  { id: 'classic', c: '#7a5240', w: 24 }, { id: 'chocolate', c: '#54382f', w: 18 }, { id: 'rust', c: '#8e4c34', w: 14 },
  { id: 'pink', c: '#9c6e60', w: 12 }, { id: 'plum', c: '#5c4046', w: 6 }, { id: 'tan', c: '#a28263', w: 8 },
  { id: 'limestone', c: '#9b9893', w: 6 }, { id: 'painted-cream', c: '#cfc4b0', w: 4, paint: 0.85 },
  { id: 'painted-blue', c: '#7d8791', w: 3, paint: 0.85 }, { id: 'painted-olive', c: '#8a8a68', w: 2, paint: 0.85 },
];
const TAN: Swatch[] = [
  { id: 'buff', c: '#b69b74', w: 30 }, { id: 'pale-yellow', c: '#cdb98a', w: 20 }, { id: 'cream', c: '#d9cfb2', w: 10 },
  { id: 'light-orange', c: '#c08a5c', w: 12 }, { id: 'grey-tan', c: '#a39a8a', w: 14 }, { id: 'salmon', c: '#b9806a', w: 8 },
  { id: 'dark-tan', c: '#8e7457', w: 6 },
];
const PAINTED: Swatch[] = [
  { id: 'white', c: '#d9d5c9', w: 25, paint: 0.95 }, { id: 'grey', c: '#8f9396', w: 20, paint: 0.95 }, { id: 'blue', c: '#6f8aa3', w: 10, paint: 0.95 },
  { id: 'sage', c: '#8da08a', w: 8, paint: 0.95 }, { id: 'faded-yellow', c: '#cdbb7f', w: 10, paint: 0.95 }, { id: 'pink', c: '#c79a90', w: 5, paint: 0.95 },
  { id: 'tan', c: '#b6a07e', w: 10, paint: 0.95 }, { id: 'oxide', c: '#8a4a3a', w: 5, paint: 0.95 }, { id: 'slate', c: '#4f5b66', w: 3, paint: 0.95 },
];
const LIME: Swatch[] = [
  { id: 'grey', c: '#a8a6a0', w: 30 }, { id: 'cream', c: '#d2c8b0', w: 20 }, { id: 'warm', c: '#bfae94', w: 20 },
  { id: 'white', c: '#d8d6cf', w: 10 }, { id: 'blue-grey', c: '#93999e', w: 10 }, { id: 'weathered', c: '#7d7b76', w: 10 },
];
const SIDING: Swatch[] = [
  { id: 'white', c: '#dcdad2', w: 16 }, { id: 'cream', c: '#d8cba5', w: 14 }, { id: 'light-blue', c: '#9fb4c4', w: 12 },
  { id: 'sage', c: '#98a88a', w: 12 }, { id: 'yellow', c: '#d6c27a', w: 10 }, { id: 'grey', c: '#8c9094', w: 12 },
  { id: 'tan', c: '#b5a283', w: 8 }, { id: 'red', c: '#8d4538', w: 6 }, { id: 'navy', c: '#4e6076', w: 6 }, { id: 'teal', c: '#6e9a98', w: 4 },
];
const STUCCO: Swatch[] = [
  { id: 'salmon', c: '#c99a82', w: 14 }, { id: 'cream', c: '#d9c9a2', w: 16 }, { id: 'pale-green', c: '#a9b494', w: 10 },
  { id: 'grey', c: '#c8c4ba', w: 14 }, { id: 'tan', c: '#b9a27f', w: 12 }, { id: 'terracotta', c: '#b87355', w: 10 },
  { id: 'pale-blue', c: '#a3b4be', w: 8 }, { id: 'mustard', c: '#c4a24f', w: 6 },
];
const PANEL: Swatch[] = [
  { id: 'charcoal', c: '#4b4f54', w: 22 }, { id: 'slate', c: '#7a8085', w: 18 }, { id: 'white', c: '#dcdddb', w: 16 },
  { id: 'warm-grey', c: '#9a948a', w: 14 }, { id: 'black', c: '#2f3235', w: 8 }, { id: 'terracotta', c: '#a85d44', w: 8 },
  { id: 'cedar', c: '#8c6642', w: 8 }, { id: 'blue-grey', c: '#66798a', w: 6 },
];
const GLAZED: Swatch[] = [
  { id: 'black', c: '#3a3234', w: 30 }, { id: 'navy', c: '#2f3d52', w: 20 }, { id: 'green', c: '#2f4a40', w: 20 },
  { id: 'cream', c: '#d9d2bd', w: 15 }, { id: 'maroon', c: '#5a2b2f', w: 15 },
];
const CORNICE: Swatch[] = [
  { id: 'cream', c: '#cbbfa2', w: 22 }, { id: 'white', c: '#d9d6cc', w: 18 }, { id: 'brown', c: '#5a4032', w: 14 }, { id: 'green', c: '#3e5a48', w: 10 },
  { id: 'black', c: '#2b2d30', w: 10 }, { id: 'grey', c: '#8a8c8e', w: 10 }, { id: 'rust', c: '#8a4a35', w: 6 },
  { id: 'pale-blue', c: '#8fa2b0', w: 6 }, { id: 'ochre', c: '#b69a58', w: 4 },
];
const METAL: Swatch[] = [
  { id: 'black', c: '#1f2124', w: 40 }, { id: 'green', c: '#23402f', w: 18 }, { id: 'rust', c: '#6a3a28', w: 14 }, { id: 'maroon', c: '#5a2428', w: 5 }, { id: 'deep-blue', c: '#223e5c', w: 5 },
  { id: 'silver', c: '#6d7073', w: 12 }, { id: 'navy', c: '#26334a', w: 4 }, { id: 'brown', c: '#3a2c25', w: 4 },
];
const GATE: Swatch[] = [
  { id: 'grey', c: '#7d8084', w: 30 }, { id: 'green', c: '#2e4a3a', w: 18 }, { id: 'rust', c: '#6b4430', w: 16 },
  { id: 'silver', c: '#a4a8ab', w: 16 }, { id: 'black', c: '#25272a', w: 10 }, { id: 'blue', c: '#3c5876', w: 6 }, { id: 'maroon', c: '#5e2b2d', w: 4 },
];
const AWNING: Swatch[] = [
  { id: 'green', c: '#2f6f4f', w: 14 }, { id: 'burgundy', c: '#7a2a34', w: 10 }, { id: 'navy', c: '#26354f', w: 12 }, { id: 'black', c: '#25272a', w: 8 },
  { id: 'tan', c: '#b9a37a', w: 8 }, { id: 'cream', c: '#d8ceb4', w: 8 }, { id: 'royal', c: '#2c5a9a', w: 8 }, { id: 'teal', c: '#2f7a7a', w: 6 },
  { id: 'orange', c: '#c8672a', w: 6 }, { id: 'red', c: '#b02a2a', w: 10 }, { id: 'mustard', c: '#c79b2a', w: 5 }, { id: 'grey', c: '#6e7378', w: 5 },
];
const TRIM: Swatch[] = [
  { id: 'cream', c: '#cfc6ae', w: 30 }, { id: 'grey', c: '#a9a7a1', w: 25 }, { id: 'white', c: '#dad7cd', w: 20 },
  { id: 'buff', c: '#bfae8c', w: 15 }, { id: 'warm-grey', c: '#9a958a', w: 10 },
];

function pickSwatch(r: Rng, list: readonly Swatch[]): Swatch {
  let total = 0;
  for (const s of list) total += s.w;
  let t = r.next() * total;
  for (const s of list) { t -= s.w; if (t <= 0) return s; }
  return list[list.length - 1];
}

/** +-`amt` per-channel jitter (sRGB bytes) so two lots with the same swatch still differ slightly. */
function jitter(c: RGB, r: Rng, amt = 0.07): RGB {
  const k = 1 + (r.next() - 0.5) * 2 * amt;
  const warm = (r.next() - 0.5) * amt;
  return [Math.max(0, Math.min(255, Math.round(c[0] * (k + warm)))), Math.max(0, Math.min(255, Math.round(c[1] * k))), Math.max(0, Math.min(255, Math.round(c[2] * (k - warm))))];
}

/** Subset of the lot data the colourway reads (kept structural so tests can pass plain objects). */
export interface ColourwayInput {
  id: string;
  type?: Lot['type'];
  corner?: boolean;
  spec?: Pick<LotSpec, 'family' | 'floors' | 'use' | 'stoop'> & { look?: LotSpec['look']; bbl?: string };
}

const familyOf = (lot: ColourwayInput): MaterialFamily => {
  if (lot.spec) return lot.spec.family;
  switch (lot.type) {
    case 'brownstone': return 'brownstone';
    case 'rowhouse': return 'brick';
    case 'apartment': return 'tanBrick';
    default: return 'brick';
  }
};

/** The colourway of one lot. Same id and spec always give the same answer. */
export function lotColourway(lot: ColourwayInput): Colourway {
  const r = new Rng(Rng.hash(`${lot.id}:colourway`));
  const fam = familyOf(lot);
  const look = lot.spec?.look;
  const floors = lot.spec?.floors ?? 3;
  const lowRise = floors <= 3 && (lot.spec ? lot.spec.use === 'residential' : lot.type === 'rowhouse');
  const kindRoll = r.next();

  let kind: WallKindValue = WallKind.brick;
  let pal: readonly Swatch[] = BRICK;
  let tag = 'brick';
  if (look === 'newBuild') {
    if (kindRoll < 0.72) { kind = WallKind.panel; pal = PANEL; tag = 'panel'; }
    else if (kindRoll < 0.86) { kind = WallKind.glazed; pal = GLAZED; tag = 'glazed'; }
    else { kind = WallKind.stucco; pal = STUCCO; tag = 'stucco'; }
  } else if (look === 'frame') {
    kind = WallKind.siding; pal = SIDING; tag = 'siding';
  } else {
    switch (fam) {
      case 'brownstone': pal = STONE; tag = 'stone'; break;
      case 'limestone': pal = LIME; tag = 'lime'; break;
      case 'tanBrick': pal = TAN; tag = 'tan'; if (kindRoll > 0.97) { kind = WallKind.glazed; pal = GLAZED; tag = 'glazed'; } break;
      case 'paintedBrick': pal = PAINTED; tag = 'painted'; if (kindRoll < 0.12) { kind = WallKind.stucco; pal = STUCCO; tag = 'stucco'; } break;
      default:
        pal = BRICK; tag = 'brick';
        if (lowRise && kindRoll < 0.09) { kind = WallKind.siding; pal = SIDING; tag = 'siding'; }
        else if (kindRoll < (lowRise ? 0.14 : 0.05)) { kind = WallKind.stucco; pal = STUCCO; tag = 'stucco'; }
        else if (kindRoll > 0.965) { kind = WallKind.glazed; pal = GLAZED; tag = 'glazed'; }
    }
  }
  const sw = pickSwatch(r, pal);
  const flat = kind === WallKind.siding || kind === WallKind.stucco || kind === WallKind.panel;
  const paint = flat ? 1 : sw.paint ?? (kind === WallKind.glazed ? 0.7 : 0.3 + r.next() * 0.15);
  const front = jitter(hex(sw.c), r, flat ? 0.05 : 0.08);

  // party walls: the old four brickRed variants, each re-coloured so side walls read as different buildings too
  const party: Colourway['party'] = [
    jitter(hex(pickSwatch(r, BRICK.slice(0, 4)).c), r),
    jitter(hex(pickSwatch(r, [BRICK[3], BRICK[1], STONE[1]]).c), r),
    jitter(hex(pickSwatch(r, PAINTED.slice(0, 2).concat(BRICK[10])).c), r, 0.05),
    jitter(hex(pickSwatch(r, [PAINTED[1], PAINTED[2], PAINTED[8]]).c), r, 0.05),
  ];
  const uv = { scale: 0.88 + r.next() * 0.28, ou: r.next() * 8, ov: r.next() * 8, flip: r.next() < 0.5 };
  const awning: [RGB, RGB] = [hex(pickSwatch(r, AWNING).c), hex(pickSwatch(r, AWNING).c)];
  const cw: Colourway = {
    id: `${tag}:${sw.id}`,
    kind,
    front,
    paint,
    mortar: 0.15 + r.next() * 0.8,
    weather: 0.25 + r.next() * 0.75,
    seed: r.next(),
    party,
    cornice: jitter(hex(pickSwatch(r, CORNICE).c), r, 0.05),
    metal: hex(pickSwatch(r, METAL).c),
    gate: jitter(hex(pickSwatch(r, GATE).c), r, 0.06),
    trim: jitter(hex(pickSwatch(r, TRIM).c), r, 0.05),
    awning,
    striped: r.next() < 0.3,
    uv,
  };
  return applyObserved(cw, lot.spec?.bbl);
}

/** wall kind and paint amount for each observed material class (brick-like classes keep the texture's own brick spread) */
const OBSERVED_KIND: Record<ObservedMaterial, { kind: WallKindValue; paint: number }> = {
  brownstone: { kind: WallKind.brick, paint: 0.4 }, redBrick: { kind: WallKind.brick, paint: 0.4 }, tanBrick: { kind: WallKind.brick, paint: 0.4 },
  paintedBrick: { kind: WallKind.brick, paint: 0.9 }, limestone: { kind: WallKind.brick, paint: 0.8 },
  siding: { kind: WallKind.siding, paint: 1 }, stucco: { kind: WallKind.stucco, paint: 1 }, panel: { kind: WallKind.panel, paint: 1 },
};

/**
 * Observed-facade override: when photo evidence exists for the lot's BBL (src/world/data/facade-observed.json) the wall colour,
 * wall kind and shop awning come from it. Every procedural draw above has already happened, so a lot's other looks (cornice,
 * metal, gate, party walls, weathering) and every other lot are unchanged by adding or removing observations.
 */
export function applyObserved(cw: Colourway, bbl: string | undefined, table?: Readonly<Record<string, string>>): Colourway {
  const o = observedFacade(bbl, table);
  if (!o) return cw;
  const k = OBSERVED_KIND[o.material];
  return { ...cw, id: `observed:${o.material}`, kind: k.kind, paint: k.paint, front: o.wall, awning: o.awning ? [o.awning, cw.awning[1]] : cw.awning };
}

// ---------------------------------------------------------------------------------------------- vertex tone encoding

/** Material-name prefixes that read `aTone` / `aStyle`, and how. */
const WALLS = /^(brickRed|brickPainted|brownstone):/;

export interface ToneBytes { tone: [number, number, number, number]; style: [number, number, number, number] }

const b = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const wallStyle = (cw: Colourway, kind: number, party: boolean): [number, number, number, number] =>
  [b(kind * KIND_STEP), b(cw.mortar * 255), b(cw.seed * 255), b(cw.weather * 255 * (party ? 1.15 : 1))];
const flatStyle = (cw: Colourway): [number, number, number, number] => [b(WallKind.trim * KIND_STEP), 128, b(cw.seed * 255), b(cw.weather * 120)];

/**
 * Tone for the vertices of material `name` in a lot: `frontFace` is true for street-facing quads of a front-family material
 * (or any wall of a corner lot), false for party / back walls. Returns null for materials that do not carry a tone.
 */
export function toneFor(name: string, cw: Colourway, frontFace: boolean, limestoneIsFront: boolean): ToneBytes | null {
  const v = parseInt(name.slice(name.indexOf(':') + 1), 10) || 0;
  if (WALLS.test(name)) {
    if (frontFace) return { tone: [...cw.front, b(cw.paint * 255)], style: wallStyle(cw, cw.kind, false) };
    const p = cw.party[Math.max(0, Math.min(3, v))];
    return { tone: [...p, b((v >= 2 ? 0.9 : 0.35) * 255)], style: wallStyle(cw, WallKind.party, true) };
  }
  if (name.startsWith('limestone:')) {
    if (limestoneIsFront && frontFace) return { tone: [...cw.front, b(cw.paint * 255)], style: wallStyle(cw, cw.kind === WallKind.brick ? WallKind.brick : WallKind.trim, false) };
    return { tone: [...cw.trim, 235], style: flatStyle(cw) };
  }
  if (name.startsWith('stoop:')) {
    const f = cw.front;
    const s: RGB = [b(f[0] * 0.78 + 20), b(f[1] * 0.78 + 20), b(f[2] * 0.78 + 20)];
    return { tone: [...s, 235], style: flatStyle(cw) };
  }
  if (name === 'awning:#8a3b2e|') return { tone: [...cw.awning[0], 250], style: [b((cw.striped ? WallKind.stripedAwning : WallKind.awning) * KIND_STEP), 128, b(cw.seed * 255), 0] };
  if (name === 'awning:#27303a|') return { tone: [...cw.awning[1], 250], style: [b(WallKind.awning * KIND_STEP), 128, b(cw.seed * 255), 0] };
  if (name.startsWith('cornice:')) return { tone: [...cw.cornice, 235], style: flatStyle(cw) };
  if (name.startsWith('rollGate:')) return { tone: [...cw.gate, 235], style: [b(WallKind.gate * KIND_STEP), 128, b(cw.seed * 255), b(cw.weather * 255)] };
  if (name.startsWith('metalDark:') || name.startsWith('castIronFence:')) return { tone: [...cw.metal, 245], style: flatStyle(cw) };
  return null;
}

/** Number of distinct looks among `lots` (the variety metric used by the tests). */
export function distinctLooks(lots: readonly ColourwayInput[]): number {
  return new Set(lots.map((l) => lotColourway(l).id)).size;
}
