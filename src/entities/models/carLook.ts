/**
 * CARS12: per-vehicle variation. A `CarLook` is a small, deterministic description of one car's trim and condition (wheel design,
 * stance, glass tint, roof gear, stickers, wear, livery) derived from its seed. Pure data (no three.js), so it is unit-testable and
 * cheap to key caches with. `undefined` look = the neutral roster car (what the models looked like before CARS12).
 *
 * Palettes are era-weighted: a Ciera-type beater wears 1990s paints (teal, burgundy, champagne), a hatch wears 2010s ones, a luxury
 * car wears black / grey / white. Paint names are descriptive only.
 */
import { Rng } from '@/core/Rng';
import type { VehicleType } from '@/world/types';

export type WheelDesign = 'steel' | 'steelBare' | 'alloy6' | 'alloy5' | 'mesh' | 'deep' | 'turbine';
export type RoofGear = 'none' | 'rack' | 'bars' | 'cargo' | 'ladder' | 'topperPlain' | 'topperAd' | 'topperHail';

export interface PaintEntry { name: string; color: string; /** trim pack: 0 plain, 1 cream double stripe, 2 two-tone */ pack: 0 | 1 | 2; /** relative frequency */ w: number }
const P = (name: string, color: string, w = 1, pack: 0 | 1 | 2 = 0): PaintEntry => ({ name, color, pack, w });

/** 8 or more paints per type. Whites, silvers, greys and blacks dominate real traffic; the colours are the garnish. */
export const PALETTES: Record<VehicleType, readonly PaintEntry[]> = {
  sedan: [P('white', '#e9e9e4', 4), P('silver', '#b3b7bb', 4), P('graphite', '#4a4e54', 3), P('black', '#16181b', 4), P('blue', '#2468c4', 2, 2), P('red', '#b8302a', 2), P('green', '#2f7a58', 1), P('champagne', '#c9b99a', 2), P('slate', '#6b7480', 2), P('maroon', '#6a2a30', 1)],
  suv: [P('white', '#eceae4', 4), P('black', '#17191c', 4), P('silver', '#b4bac0', 4, 1), P('grey', '#5d636a', 3), P('navy', '#233a6a', 2), P('forest', '#2a5a42', 1), P('brick', '#a8332b', 1), P('sand', '#b09a76', 1), P('blue', '#3a6fa8', 2), P('copper', '#8a5a3a', 1)],
  hatch: [P('tangerine', '#e8791c', 2), P('sky', '#3b8fd0', 2), P('lime', '#8cc43a', 1), P('candy', '#c8283a', 2), P('white', '#eeeeea', 3), P('silver', '#b5b9bd', 3), P('black', '#1a1b1e', 2), P('teal', '#1b8f8a', 1), P('purple', '#6a3a9a', 1), P('yellow', '#e8c21c', 1)],
  beater: [P('faded tan', '#8c7a5a', 2), P('bleached blue', '#5f7a8c', 2), P('tired maroon', '#7b3a34', 2), P('dull silver', '#9ea09a', 2), P('teal 94', '#3c7a72', 2), P('burgundy', '#5a2030', 1), P('champagne', '#b8a888', 2), P('forest 92', '#3a5a40', 1), P('white', '#d8d4c4', 1), P('brown', '#5a4030', 1)],
  boxtruck: [P('work white', '#ebebe4', 6), P('safety orange', '#e0701a', 1, 1), P('depot blue', '#2f5a8a', 1, 2), P('brown', '#6a4a30', 1), P('green', '#2a5a3a', 1), P('red', '#a02a2a', 1), P('yellow', '#e0b81c', 1), P('grey', '#8a9096', 1)],
  cargovan: [P('trade white', '#ecf0f1', 6), P('fleet blue', '#2a4f86', 1), P('depot grey', '#8d9298', 2), P('brown', '#5a3e28', 1), P('red', '#a8302c', 1), P('green', '#2c6a46', 1), P('silver', '#b6bbc0', 2), P('yellow', '#e0b81c', 1)],
  bus: [P('transit white', '#f0f0ec', 6), P('airport grey', '#d7dde3', 1), P('cream', '#ece6d0', 1), P('light blue', '#cfe0ee', 1), P('mint', '#d4e6dc', 1), P('sand', '#e2d8bc', 1), P('pale yellow', '#efe9c0', 1), P('silver', '#c9ced2', 1)],
  cop: [P('white', '#f2f2f2', 1)],
  cab: [P('taxi yellow', '#e0b01e', 1)],
  pickup: [P('white', '#eceae4', 4), P('black', '#16181b', 3), P('silver', '#b0b5ba', 3), P('grey', '#5a6068', 3), P('blue', '#2a4f8a', 2), P('red', '#a8262a', 2), P('forest', '#2a5a3a', 1), P('sand', '#b8a47a', 1), P('copper', '#7a4a2a', 1), P('navy', '#1e2f50', 2)],
  crossover: [P('silver', '#b5bac0', 4), P('white', '#eeeeea', 4), P('grey', '#5c6168', 3), P('black', '#16181b', 3), P('blue', '#2f5a96', 2), P('red', '#a82a2e', 2), P('teal', '#1f6f72', 1), P('sand', '#b8a88a', 1), P('orange', '#d8641c', 1), P('green', '#3a6a4a', 1)],
  minivan: [P('silver', '#b9bdc2', 4), P('white', '#eeeeea', 3), P('grey', '#5a5f66', 3), P('black', '#16181b', 3), P('blue', '#2a4a7a', 2), P('maroon', '#6a2830', 2), P('gold', '#b8a070', 2), P('green', '#2f5a48', 1), P('teal', '#2a6a78', 1), P('red', '#9a2a2c', 1)],
  luxury: [P('black', '#14161a', 6), P('white', '#eeeeea', 4), P('grey', '#5a5f66', 4), P('silver', '#b4b8bd', 3), P('blue', '#1e3a6a', 2), P('burgundy', '#4a1c28', 1), P('brown', '#4a3828', 1), P('green', '#1f3a30', 1)],
  towncar: [P('black', '#0e0f12', 8), P('black cherry', '#2a1018', 1), P('midnight', '#141a2a', 1), P('white', '#ecebe4', 1), P('champagne', '#c8b896', 1), P('silver', '#a6aab0', 1), P('grey', '#555a60', 1), P('navy', '#1a2440', 1)],
  pony: [P('candy', '#c8283a', 3), P('blue', '#1f5fb4', 3), P('yellow', '#e8c21c', 2), P('orange', '#e0621a', 2), P('black', '#15161a', 3), P('white', '#eeeeea', 2), P('grey', '#6a7078', 2), P('green', '#1f6a3a', 1), P('purple', '#6a2a8a', 1), P('silver', '#b4b8bd', 1)],
  // CARS14: 8 colourways each
  coupe911: [P('guards red', '#b3202a', 3, 0), P('silver', '#b7bbc0', 3), P('black', '#15161a', 3), P('white', '#eeeeea', 2), P('racing yellow', '#e8c21c', 1), P('gentian blue', '#1f3f8a', 2), P('python green', '#2f5a42', 1), P('slate grey', '#5a5f66', 2)],
  exotic: [P('giallo', '#f2c200', 3, 1), P('verde', '#2f8f4e', 2, 1), P('nero', '#15161a', 3), P('bianco', '#eeeeea', 2, 1), P('arancio', '#e0621a', 2, 1), P('rosso', '#c4182a', 3), P('blu', '#1c3f9a', 2), P('grigio', '#5a5f66', 2)],
  jdmcoupe: [P('sapphire', '#2e6bd1', 3, 1), P('white', '#eeeeea', 3, 1), P('graphite', '#4a4e54', 2), P('black', '#15161a', 2), P('sunburst', '#e8a01c', 2), P('candy red', '#a8202a', 2), P('lime', '#8cc43a', 1), P('silver', '#b3b7bb', 2)],
  hothatch: [P('championship white', '#e8e8e4', 3, 1), P('rally red', '#d6322a', 3), P('black', '#15161a', 2), P('sonic blue', '#2468c4', 2, 1), P('grey', '#5c6168', 2), P('yellow', '#e8c21c', 1), P('silver', '#b3b7bb', 2), P('tangerine', '#e8791c', 1)],
  muscle: [P('tor orange', '#e0621a', 3, 1), P('plum', '#5a2a6a', 2, 1), P('black', '#15161a', 3), P('white', '#eeeeea', 2, 1), P('red', '#b8302a', 3), P('blue', '#1f5fb4', 2, 1), P('granite', '#5a5f66', 2), P('green', '#2a6a3a', 1)],
  wedgetruck: [P('steel', '#b8bcc2', 5), P('dark steel', '#6a6e74', 3), P('gunmetal', '#3e4248', 2), P('bronze', '#8a7458', 1), P('sand', '#b8aa90', 1), P('black', '#1a1b1e', 2), P('frost', '#d4d8dc', 2), P('graphite', '#505459', 2)],
  evsedan: [P('pearl', '#e8e8ea', 4), P('midnight', '#1a2230', 3), P('red multi-coat', '#a8202a', 2), P('silver', '#b3b7bb', 3), P('grey', '#5c6168', 3), P('blue', '#1f4f8a', 2), P('black', '#15161a', 3), P('teal', '#1f6f72', 1)],
  garbage: [P('sanitation white', '#eef1ec', 1)],
  ambulance: [P('white', '#f4f4f4', 1)],
  dollarvan: [P('white', '#e8eaea', 4), P('silver', '#b4b8bd', 2), P('grey', '#8a9096', 2), P('cream', '#e4dcc4', 1), P('blue', '#2a4f86', 1), P('maroon', '#6a2a30', 1), P('green', '#2f5a48', 1), P('red', '#a02a2a', 1)],
};

/** Weighted paint draw for a type (traffic uses this instead of the flat CAR_COLORS list). */
export function pickPaint(type: VehicleType, rng: Pick<Rng, 'next'>): PaintEntry {
  const list = PALETTES[type];
  let tot = 0;
  for (const e of list) tot += e.w;
  let r = rng.next() * tot;
  for (const e of list) { r -= e.w; if (r <= 0) return e; }
  return list[list.length - 1];
}

/** Trim pack of a colour in a type's palette (undefined when it is not a palette colour). */
export function paletteEntry(type: VehicleType, color: string): PaintEntry | undefined {
  const c = color.toLowerCase();
  return PALETTES[type].find((e) => e.color.toLowerCase() === c);
}

/** Parody ride-share brands and bumper stickers (shapes only: the geometry stickers are coloured plates, no real marks). */
export const RIDESHARE = [
  { name: 'HAILR', color: 0xe84a9a },
  { name: 'GLYDE', color: 0x2ab7a0 },
] as const;
export const STICKER_COUNT = 8;
/** primer / mismatched-panel zones (see carModel.conditionFor) */
export const PRIMER_ZONES = ['none', 'frontFender', 'rearDoor', 'hood', 'trunk'] as const;

export interface CarLook {
  wheel: WheelDesign;
  /** body dropped this many metres over the tyres (aftermarket coilovers) */
  lowered: number;
  /** 0 factory, 1 light privacy glass, 2 limo-dark */
  tint: 0 | 1 | 2;
  roof: RoofGear;
  /** rear bumper sticker ids (0..STICKER_COUNT-1) */
  stickers: number[];
  /** -1 none, else RIDESHARE index (windshield + rear glass decals) */
  rideshare: number;
  /** wear: dirt, rust, dents 0..3, primer zone index 0..4 */
  dirt: number; rust: number; dents: number; primer: number;
  /** box / van / cop livery id (meaning per type, see carModel) */
  livery: number;
  /** unmarked police car (no roof bar, dash and grille strobes) */
  unmarked: boolean;
  /** stable key of everything that changes the merged geometry (wheel, roof, stickers, rideshare, tint, unmarked) */
  key: string;
  /** stable key of the paint overlay (dirt, rust, dents, primer) */
  condKey: string;
}

const WHEELS_BY_TYPE: Partial<Record<VehicleType, readonly WheelDesign[]>> = {
  sedan: ['alloy6', 'alloy5', 'steel', 'mesh', 'turbine', 'alloy6', 'steel'],
  suv: ['alloy6', 'alloy5', 'mesh', 'turbine', 'alloy6'],
  hatch: ['steel', 'alloy5', 'alloy6', 'steelBare', 'mesh'],
  beater: ['steel', 'steel', 'steelBare', 'steelBare', 'alloy5'],
  luxury: ['mesh', 'turbine', 'alloy5', 'deep'],
  pony: ['deep', 'alloy5', 'turbine', 'mesh', 'deep'],
  pickup: ['alloy6', 'steelBare', 'mesh', 'alloy5'],
  crossover: ['alloy6', 'alloy5', 'turbine', 'mesh'],
  minivan: ['steel', 'alloy5', 'alloy6', 'mesh'],
  towncar: ['mesh', 'steel', 'turbine'],
  cab: ['steel', 'steel', 'steelBare'],
  cop: ['steel', 'steelBare'],
  cargovan: ['steel', 'steelBare'],
  dollarvan: ['steel', 'steelBare', 'alloy5'],
  ambulance: ['steel'],
  // CARS14: big, low-profile rims on the sports cars, flat aero discs on the electrics
  coupe911: ['alloy5', 'turbine', 'alloy6', 'deep'],
  exotic: ['alloy5', 'turbine', 'deep', 'alloy6'],
  jdmcoupe: ['mesh', 'alloy6', 'deep', 'alloy5'],
  hothatch: ['alloy5', 'alloy6', 'mesh', 'turbine'],
  muscle: ['deep', 'alloy5', 'turbine', 'mesh'],
  wedgetruck: ['turbine', 'alloy6'],
  evsedan: ['turbine', 'alloy5', 'turbine'],
};

/** Delivery livery counts: cargo van (skin packs 10..14), box truck (cargo livery canvases 1..11), cop (marked paints) */
export const CARGO_VAN_LIVERIES = 6; // 0 plain, then parcel, bakery, plumber, telecom, laundry
export const BOX_LIVERY_VARIANTS = 12; // see painters/vehicle.ts

/** Seeded look of one car. `seed` is the vehicle's own hash; the type keeps the same seed from giving every type the same dice. */
export function lookFor(type: VehicleType, color: string, seed: number): CarLook {
  const r = new Rng(`look:${type}:${seed >>> 0}`);
  const wheels = WHEELS_BY_TYPE[type];
  const wheel = wheels ? r.pick(wheels) : 'steel';
  const sporty = type === 'pony' || type === 'luxury' || type === 'hatch' || type === 'sedan' || type === 'jdmcoupe' || type === 'hothatch' || type === 'muscle' || type === 'coupe911';
  const lowered = sporty && r.chance(type === 'pony' || type === 'jdmcoupe' || type === 'hothatch' ? 0.5 : 0.14) ? (r.chance(0.5) ? 0.04 : 0.07) : 0;
  const fleet = type === 'cab' || type === 'cop' || type === 'bus' || type === 'garbage' || type === 'ambulance' || type === 'boxtruck';
  const tint: 0 | 1 | 2 = type === 'towncar' ? 2 : fleet || type === 'cargovan' ? 0 : r.chance(0.3) ? (r.chance(0.35) ? 2 : 1) : 0;
  let roof: RoofGear = 'none';
  if (type === 'cab') roof = r.pick(['topperPlain', 'topperAd', 'topperAd', 'topperHail'] as const);
  else if (type === 'suv' || type === 'crossover') roof = r.chance(0.3) ? r.pick(['rack', 'bars', 'cargo'] as const) : 'none';
  else if (type === 'minivan') roof = r.chance(0.2) ? r.pick(['bars', 'cargo'] as const) : 'none';
  else if (type === 'cargovan' || type === 'dollarvan') roof = r.chance(type === 'cargovan' ? 0.4 : 0.1) ? 'ladder' : 'none';
  else if (type === 'pickup') roof = r.chance(0.2) ? 'bars' : 'none';
  else if (type === 'sedan' || type === 'hatch' || type === 'beater') roof = r.chance(0.07) ? 'bars' : 'none';
  const nSt = fleet && type !== 'cab' ? 0 : r.chance(0.35) ? (r.chance(0.3) ? 2 : 1) : 0;
  const stickers: number[] = [];
  for (let i = 0; i < nSt; i++) stickers.push(r.int(0, STICKER_COUNT - 1));
  const rideshare = (type === 'sedan' || type === 'evsedan' || type === 'hatch' || type === 'crossover' || type === 'luxury' || type === 'minivan' || type === 'towncar') && r.chance(type === 'towncar' ? 0.35 : 0.14) ? r.int(0, RIDESHARE.length - 1) : -1;
  // wear: beaters carry it, fleet vans get dirty, luxury cars stay clean
  const tired = type === 'beater' ? 2 : type === 'luxury' ? -2 : type === 'cargovan' || type === 'boxtruck' || type === 'dollarvan' || type === 'garbage' ? 1 : 0;
  const lvl = (bias: number): number => Math.max(0, Math.min(3, Math.floor(r.next() * 2.6 + bias * 0.5 + (r.chance(0.25) ? 1 : 0) - 0.6)));
  const dirt = type === 'garbage' ? 3 : lvl(tired + 1);
  const rust = type === 'luxury' || type === 'cop' || type === 'ambulance' || type === 'exotic' || type === 'coupe911' || type === 'evsedan' ? 0 : lvl(tired - (type === 'cab' ? 1 : 0));
  const dents = r.chance(0.18 + 0.12 * Math.max(0, tired)) ? r.int(1, 3) : 0;
  const primer = (type === 'beater' ? r.chance(0.55) : type === 'luxury' || type === 'cop' || type === 'ambulance' ? false : r.chance(0.05)) ? r.int(1, 4) : 0;
  let livery = 0;
  if (type === 'cargovan') livery = r.int(0, CARGO_VAN_LIVERIES - 1);
  else if (type === 'boxtruck') livery = r.int(0, BOX_LIVERY_VARIANTS - 2); // the last variant is the garbage truck's
  else if (type === 'bus') livery = r.int(0, 3); // 0 plain, 1..3 ad wraps
  const unmarked = type === 'cop' && r.chance(0.22);
  void color;
  const key = [wheel, lowered, tint, roof, stickers.join('.'), rideshare, unmarked ? 'u' : 'm'].join('|');
  const condKey = `${dirt}.${rust}.${dents}.${primer}.${(seed >>> 0) & 7}`;
  return { wheel, lowered, tint, roof, stickers, rideshare, dirt, rust, dents, primer, livery, unmarked, key, condKey };
}
