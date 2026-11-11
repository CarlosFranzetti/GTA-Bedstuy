/**
 * Schema v2 for bedstuy.json: per-block-face lot lists.
 *
 * bedstuy.json gets an OPTIONAL top-level `faces` array. Each entry describes one block face (the building
 * frontage of one block on one street) as an ordered list of lots (width, floors, material family, stoop, cornice,
 * bays, use, storefront archetype, trees, scaffold, confidence, note). Anything missing is filled with defaults, so
 * the file may be as sparse as `{ "street": "throop", "side": "E", "from": "hart", "to": "pulaski" }`.
 *
 * Face key
 *   `${street}|${side}|${from}|${to}`
 *   street : id of the street the face fronts (BlockFace.streetId)
 *   side   : the BLOCK's side that faces that street (BlockFace.side: 'N' | 'S' | 'E' | 'W')
 *   from,to: the two cross streets that bound the face; `from` is the west end (N/S faces) or north end (E/W faces),
 *            i.e. the lower offset. `lots` are authored in from -> to order. (BlockFace.a -> b runs the other way on
 *            N and E faces; lotsForFace() reverses for you, its output is always ordered a -> b like Lot.frontA -> frontB.)
 *
 * Corner convention: E/W faces (which front the north-south avenues) include their corner lots at both ends.
 * N/S faces list only the frontage BETWEEN those corner buildings; lotsForFace() insets them by the neighbouring
 * corner lots' depth automatically (same idea as LotSubdivider's end inset).
 *
 * A face may instead (or additionally) name a `typology` preset plus `pins`: the preset generates a deterministic
 * default row (seeded from grid.seed + face key + face `seed`), and pins override single lots (a church, a corner
 * bodega, a vacant lot). Explicit `lots` win over `typology`. With neither, a default typology for the street class
 * is used, so lotsForFace() always returns something drawable.
 *
 * Pure data + math: no THREE, deterministic.
 */
import { add, dist, norm, scale, sub } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { Archetype, BlockFace, GridModel, Side } from '@/world/types';

// ---------------------------------------------------------------- enums

export const SCHEMA_VERSION = 2;

export const FAMILIES = ['brownstone', 'brickRed', 'brickTan', 'brickPainted', 'limestone', 'frame', 'church', 'vacant', 'newBuild'] as const;
export const CORNICES = ['bracketed', 'plain', 'none'] as const;
export const USES = ['residential', 'mixed', 'church', 'school', 'vacant', 'garage'] as const;
export const STOREFRONTS = [
  'bodega', 'laundromat', 'barber', 'deli', 'liquor', 'pharmacy', 'church', 'daycare', 'restaurant', 'cellphone', 'generic',
  // additions that keep 1:1 parity with the 15 POI archetypes in types.ts
  'braiding', 'pizza', 'chinese', 'caribbean', 'dollar', 'funeral', 'autorepair',
  // WBURG: Flushing Ave warehouses and workshops (built by buildings/warehouse.ts through the mixed-use entry)
  'warehouse',
] as const;
export const CONFIDENCES = ['H', 'M', 'L'] as const;
export const TYPOLOGY_NAMES = ['streetRow', 'avenueMixed', 'avenueRow'] as const;

export type Family = (typeof FAMILIES)[number];
export type Cornice = (typeof CORNICES)[number];
export type LotUse = (typeof USES)[number];
export type StorefrontKind = (typeof STOREFRONTS)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type TypologyName = (typeof TYPOLOGY_NAMES)[number];

/** Storefront kinds mapped onto the frozen types.ts Archetype union (for code that still speaks Archetype). */
export const STOREFRONT_TO_ARCHETYPE: Record<StorefrontKind, Archetype> = {
  bodega: 'bodega', laundromat: 'laundromat', barber: 'barbershop', deli: 'bodega', liquor: 'liquor', pharmacy: 'pharmacy',
  church: 'church', daycare: 'daycare', restaurant: 'caribbean', cellphone: 'dollar', generic: 'dollar',
  braiding: 'braiding', pizza: 'pizza', chinese: 'chinese', caribbean: 'caribbean', dollar: 'dollar', funeral: 'funeral',
  autorepair: 'autorepair', warehouse: 'autorepair',
};

// ---------------------------------------------------------------- types

/** Fully resolved lot: no optional fields except `storefront`, `sign`, `awningColor`. */
export interface LotSpec {
  widthM: number;
  /** total storeys above the street INCLUDING the ground floor (a mixed-use lot has `floors - 1` residential floors over the shop); 0 only for vacant lots */
  floors: number;
  family: Family;
  stoop: boolean;
  /** height of the stoop (street to parlour floor) in metres; 0 when `stoop` is false */
  stoopHeightM: number;
  cornice: Cornice;
  /** window bays across the facade */
  bays: number;
  use: LotUse;
  /** set when use is 'mixed', or for a church/school/daycare ground floor */
  storefront?: StorefrontKind;
  /** street trees in front of the lot (0..3) */
  trees: number;
  scaffold: boolean;
  /** lot depth from the building line, metres */
  depthM: number;
  confidence: Confidence;
  note: string;
  /** optional parody sign text / awning colour carried through from a POI */
  sign?: string;
  awningColor?: string;
}

/** What an author may write in JSON for a lot (everything optional except where a rule below says otherwise). */
export type RawLot = Partial<LotSpec>;

export type PinAt = 'from' | 'to' | number;
export interface PinSpec { at: PinAt; lot: RawLot; }

export interface FaceDef {
  key: string;
  street: string;
  side: Side;
  from: string;
  to: string;
  typology?: TypologyName;
  /** extra seed mixed into the generator (default 0) */
  seed: number;
  /** explicit lots in from -> to order; empty means "generate from the typology" */
  lots: LotSpec[];
  pins: PinSpec[];
  confidence: Confidence;
  note: string;
  /** true when the street's class (or the side) makes this an avenue face; used for defaults */
  avenue: boolean;
}

export interface FaceSet {
  version: 2;
  faces: FaceDef[];
  byKey: ReadonlyMap<string, FaceDef>;
}

/** Output of lotsForFace(): a LotSpec with its place on the face. Ordered a -> b like Lot.frontA -> frontB. */
export interface PlacedLot extends LotSpec {
  /** same id scheme as LotSubdivider: `${blockId}-${side}-${index}` */
  id: string;
  blockId: string;
  side: Side;
  index: number;
  /** distance from face.a to this lot's frontA along the face (includes the inset) */
  offsetM: number;
  frontA: Vec2;
  frontB: Vec2;
  center: Vec2;
  /** unit normal from the lot toward the street */
  outward: Vec2;
  /** first/last lot of an E/W face (a building on a street corner) */
  corner: boolean;
  /** which end of the face the corner is at ('a' | 'b'), set when corner is true */
  cornerEnd?: 'a' | 'b';
  /** cross street id at that corner (set when corner is true and the grid knows it) */
  cornerStreetId?: string;
  /** false for lots synthesised by the typology generator or the filler, true for lots from explicit `faces[].lots` */
  fromData: boolean;
}

export interface LotsOptions {
  /** metres to skip at face.a / face.b. Default: auto for N/S faces (neighbouring corner depth), 0 for E/W. */
  insetA?: number;
  insetB?: number;
  /** false disables the automatic corner inset on N/S faces */
  autoInset?: boolean;
}

export class SchemaError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`bedstuy.json faces: ${issues.length} problem(s)\n  - ${issues.join('\n  - ')}`);
    this.name = 'SchemaError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------- validation

const LOT_KEYS = new Set([
  'widthM', 'floors', 'family', 'stoop', 'stoopHeightM', 'cornice', 'bays', 'use', 'storefront', 'trees', 'scaffold',
  'depthM', 'confidence', 'note', 'sign', 'awningColor',
]);
const FACE_KEYS = new Set(['street', 'side', 'from', 'to', 'typology', 'seed', 'lots', 'pins', 'confidence', 'note']);

export const LIMITS = {
  widthM: [3, 40] as const,
  floors: [0, 8] as const,
  stoopHeightM: [0, 3] as const,
  bays: [0, 8] as const,
  trees: [0, 3] as const,
  depthM: [4, 40] as const,
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function checkInt(out: string[], path: string, v: unknown, [lo, hi]: readonly [number, number]): void {
  if (!isNum(v) || !Number.isInteger(v) || v < lo || v > hi) out.push(`${path}: expected integer in [${lo}, ${hi}], got ${JSON.stringify(v)}`);
}
function checkNum(out: string[], path: string, v: unknown, [lo, hi]: readonly [number, number]): void {
  if (!isNum(v) || v < lo || v > hi) out.push(`${path}: expected number in [${lo}, ${hi}], got ${JSON.stringify(v)}`);
}

/** Validate one raw lot object. `needWidth` is true for explicit lots (pins may omit width). */
export function validateLot(raw: unknown, path: string, needWidth: boolean): string[] {
  const out: string[] = [];
  if (!isObj(raw)) return [`${path}: expected an object`];
  for (const k of Object.keys(raw)) if (!LOT_KEYS.has(k)) out.push(`${path}.${k}: unknown field`);
  if (raw.widthM === undefined) {
    if (needWidth) out.push(`${path}.widthM: required`);
  } else checkNum(out, `${path}.widthM`, raw.widthM, LIMITS.widthM);
  if (raw.floors !== undefined) checkInt(out, `${path}.floors`, raw.floors, LIMITS.floors);
  if (raw.family !== undefined && !oneOf(FAMILIES, raw.family)) out.push(`${path}.family: unknown family ${JSON.stringify(raw.family)}`);
  if (raw.stoop !== undefined && typeof raw.stoop !== 'boolean') out.push(`${path}.stoop: expected boolean`);
  if (raw.stoopHeightM !== undefined) checkNum(out, `${path}.stoopHeightM`, raw.stoopHeightM, LIMITS.stoopHeightM);
  if (raw.cornice !== undefined && !oneOf(CORNICES, raw.cornice)) out.push(`${path}.cornice: unknown cornice ${JSON.stringify(raw.cornice)}`);
  if (raw.bays !== undefined) checkInt(out, `${path}.bays`, raw.bays, LIMITS.bays);
  if (raw.use !== undefined && !oneOf(USES, raw.use)) out.push(`${path}.use: unknown use ${JSON.stringify(raw.use)}`);
  if (raw.storefront !== undefined && !oneOf(STOREFRONTS, raw.storefront)) out.push(`${path}.storefront: unknown archetype ${JSON.stringify(raw.storefront)}`);
  if (raw.trees !== undefined) checkInt(out, `${path}.trees`, raw.trees, LIMITS.trees);
  if (raw.scaffold !== undefined && typeof raw.scaffold !== 'boolean') out.push(`${path}.scaffold: expected boolean`);
  if (raw.depthM !== undefined) checkNum(out, `${path}.depthM`, raw.depthM, LIMITS.depthM);
  if (raw.confidence === undefined) {
    if (needWidth) out.push(`${path}.confidence: required ('H' | 'M' | 'L')`);
  } else if (!oneOf(CONFIDENCES, raw.confidence)) out.push(`${path}.confidence: expected 'H' | 'M' | 'L'`);
  if (raw.note !== undefined && typeof raw.note !== 'string') out.push(`${path}.note: expected string`);
  if (raw.sign !== undefined && typeof raw.sign !== 'string') out.push(`${path}.sign: expected string`);
  if (raw.awningColor !== undefined && typeof raw.awningColor !== 'string') out.push(`${path}.awningColor: expected string`);
  // cross-field sanity (only when both sides are explicit)
  const use = raw.use;
  const sf = raw.storefront;
  if (sf !== undefined && (use === 'residential' || use === 'vacant')) out.push(`${path}.storefront: not allowed with use '${String(use)}'`);
  if (use === 'mixed' && raw.floors === 0) out.push(`${path}.floors: a mixed-use building needs at least 1 floor`);
  if (raw.floors === 0 && use !== 'vacant' && raw.family !== 'vacant') out.push(`${path}.floors: floors must be 1-8 (0 only for a vacant lot)`);
  if (use === 'vacant' && raw.family !== undefined && raw.family !== 'vacant') out.push(`${path}.family: use 'vacant' needs family 'vacant'`);
  if (raw.family === 'vacant' && use !== undefined && use !== 'vacant') out.push(`${path}.use: family 'vacant' needs use 'vacant'`);
  if (raw.stoop === false && isNum(raw.stoopHeightM) && raw.stoopHeightM > 0) out.push(`${path}.stoopHeightM: set but stoop is false`);
  return out;
}

interface StreetLite { id: string; axis: 'ns' | 'ew'; offset: number; class: 'avenue' | 'street' }

function streetsOf(json: Record<string, unknown>): StreetLite[] {
  if (!Array.isArray(json.streets)) return [];
  const out: StreetLite[] = [];
  for (const s of json.streets) {
    if (isObj(s) && typeof s.id === 'string' && (s.axis === 'ns' || s.axis === 'ew') && isNum(s.offset)) {
      out.push({ id: s.id, axis: s.axis, offset: s.offset, class: s.class === 'street' ? 'street' : 'avenue' });
    }
  }
  return out;
}

/** Returns a list of human-readable problems; empty means valid. Accepts the whole bedstuy.json (or any object with `faces`). */
export function validateFaces(json: unknown): string[] {
  const out: string[] = [];
  if (!isObj(json)) return ['root: expected an object'];
  if (json.schemaVersion !== undefined && json.schemaVersion !== 1 && json.schemaVersion !== 2) out.push(`schemaVersion: expected 1 or 2, got ${JSON.stringify(json.schemaVersion)}`);
  if (json.faces === undefined) return out;
  if (json.schemaVersion === 1) out.push('faces: schemaVersion 1 files carry no faces (set schemaVersion to 2)');
  if (!Array.isArray(json.faces)) return [...out, 'faces: expected an array'];
  const streets = streetsOf(json);
  const byId = new Map(streets.map((s) => [s.id, s]));
  const nss = streets.filter((s) => s.axis === 'ns').sort((a, b) => a.offset - b.offset);
  const ews = streets.filter((s) => s.axis === 'ew').sort((a, b) => a.offset - b.offset);
  const seen = new Set<string>();

  json.faces.forEach((f: unknown, i: number) => {
    const p = `faces[${i}]`;
    if (!isObj(f)) { out.push(`${p}: expected an object`); return; }
    for (const k of Object.keys(f)) if (!FACE_KEYS.has(k)) out.push(`${p}.${k}: unknown field`);
    for (const k of ['street', 'from', 'to'] as const) {
      if (typeof f[k] !== 'string' || f[k] === '') out.push(`${p}.${k}: expected a non-empty street id`);
    }
    if (!oneOf(['N', 'S', 'E', 'W'] as const, f.side)) out.push(`${p}.side: expected 'N' | 'S' | 'E' | 'W'`);
    if (typeof f.from === 'string' && f.from === f.to) out.push(`${p}: from and to must differ`);
    if (f.typology !== undefined && !oneOf(TYPOLOGY_NAMES, f.typology)) out.push(`${p}.typology: unknown typology ${JSON.stringify(f.typology)}`);
    if (f.seed !== undefined && (!isNum(f.seed) || !Number.isInteger(f.seed))) out.push(`${p}.seed: expected an integer`);
    if (f.confidence !== undefined && !oneOf(CONFIDENCES, f.confidence)) out.push(`${p}.confidence: expected 'H' | 'M' | 'L'`);
    if (f.note !== undefined && typeof f.note !== 'string') out.push(`${p}.note: expected string`);

    if (f.lots !== undefined) {
      if (!Array.isArray(f.lots)) out.push(`${p}.lots: expected an array`);
      else f.lots.forEach((l: unknown, j: number) => out.push(...validateLot(l, `${p}.lots[${j}]`, true)));
    }
    if (f.pins !== undefined) {
      if (!Array.isArray(f.pins)) out.push(`${p}.pins: expected an array`);
      else {
        f.pins.forEach((pin: unknown, j: number) => {
          const pp = `${p}.pins[${j}]`;
          if (!isObj(pin)) { out.push(`${pp}: expected an object`); return; }
          for (const k of Object.keys(pin)) if (k !== 'at' && k !== 'lot') out.push(`${pp}.${k}: unknown field`);
          const at = pin.at;
          if (!(at === 'from' || at === 'to' || (isNum(at) && at >= 0 && at <= 1))) out.push(`${pp}.at: expected 'from' | 'to' | number in [0, 1]`);
          out.push(...validateLot(pin.lot, `${pp}.lot`, false));
        });
      }
    }

    const key = `${String(f.street)}|${String(f.side)}|${String(f.from)}|${String(f.to)}`;
    if (seen.has(key)) out.push(`${p}: duplicate face ${key}`);
    seen.add(key);

    // geometry consistency against the street list, when the json carries one
    if (streets.length && typeof f.street === 'string' && typeof f.from === 'string' && typeof f.to === 'string' && oneOf(['N', 'S', 'E', 'W'] as const, f.side)) {
      const st = byId.get(f.street);
      const a = byId.get(f.from);
      const b = byId.get(f.to);
      if (!st) out.push(`${p}.street: unknown street ${f.street}`);
      if (!a) out.push(`${p}.from: unknown street ${f.from}`);
      if (!b) out.push(`${p}.to: unknown street ${f.to}`);
      if (st && a && b) {
        const ns = f.side === 'N' || f.side === 'S'; // N/S faces front east-west streets
        const wantAxis = ns ? 'ew' : 'ns';
        const crossList = ns ? nss : ews;
        const mainList = ns ? ews : nss;
        if (st.axis !== wantAxis) out.push(`${p}: side ${f.side} faces must front a${ns ? 'n east-west' : ' north-south'} street, ${st.id} is ${st.axis}`);
        else if (a.axis === st.axis || b.axis === st.axis) out.push(`${p}: from/to must be cross streets of ${st.id}`);
        else {
          const ia = crossList.indexOf(a);
          const ib = crossList.indexOf(b);
          if (ib !== ia + 1) out.push(`${p}: from/to must be adjacent cross streets in west->east / north->south order (${a.id}, ${b.id})`);
          const si = mainList.indexOf(st);
          // N face: street is the block's north edge (not the last one); S: south edge (not the first); W/E likewise
          const first = f.side === 'N' || f.side === 'W';
          if (first ? si > mainList.length - 2 : si < 1) out.push(`${p}: no block lies ${first ? 'south/east' : 'north/west'} of ${st.id} for side ${f.side}`);
        }
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------- defaults / resolution

export interface ResolveCtx { avenue: boolean }

const BRICKISH: readonly Family[] = ['brickRed', 'brickTan', 'brickPainted'];

/** Fill every missing field. Order matters: use -> family -> floors -> the rest. */
export function resolveLot(raw: RawLot, ctx: ResolveCtx): LotSpec {
  const widthM = raw.widthM ?? 6;
  let use: LotUse = raw.use
    ?? (raw.family === 'church' ? 'church' : raw.family === 'vacant' ? 'vacant' : raw.storefront && raw.storefront !== 'church' ? 'mixed' : 'residential');
  if (raw.floors === 0 && !raw.use) use = 'vacant';
  const family: Family = raw.family ?? (use === 'church' ? 'church' : use === 'vacant' ? 'vacant' : use === 'mixed' ? 'brickRed' : use === 'school' ? 'brickTan' : use === 'garage' ? 'brickPainted' : 'brownstone');
  const floors = raw.floors ?? (use === 'vacant' ? 0 : use === 'church' ? 3 : use === 'garage' ? 1 : use === 'school' ? 3 : use === 'mixed' ? (ctx.avenue ? 4 : 3) : ctx.avenue ? 4 : 3);
  const stoop = raw.stoop ?? (use === 'residential' && floors >= 2 && family !== 'newBuild' || use === 'church');
  const stoopHeightM = stoop ? (raw.stoopHeightM ?? (use === 'church' ? 1.2 : family === 'brownstone' || family === 'limestone' ? 1.5 : 1.2)) : 0;
  const cornice: Cornice = raw.cornice
    ?? (family === 'brownstone' || family === 'limestone' ? 'bracketed'
      : family === 'brickRed' && use !== 'mixed' ? 'bracketed'
        : family === 'church' || family === 'vacant' || family === 'newBuild' ? 'none' : 'plain');
  const bays = raw.bays ?? (use === 'vacant' ? 0 : use === 'church' ? 3 : Math.max(1, Math.min(6, Math.round(widthM / 2.1))));
  const storefront: StorefrontKind | undefined = raw.storefront ?? (use === 'mixed' ? 'generic' : use === 'church' ? 'church' : undefined);
  const depthM = raw.depthM ?? (use === 'church' ? 15 : use === 'school' ? 18 : use === 'mixed' ? 16 : use === 'garage' ? 12 : use === 'vacant' ? 14 : ctx.avenue ? 14 : 13);
  const spec: LotSpec = {
    widthM, floors, family, stoop, stoopHeightM, cornice, bays, use,
    trees: raw.trees ?? 0,
    scaffold: raw.scaffold ?? false,
    depthM,
    confidence: raw.confidence ?? 'L',
    note: raw.note ?? '',
  };
  if (storefront) spec.storefront = storefront;
  if (raw.sign !== undefined) spec.sign = raw.sign;
  if (raw.awningColor !== undefined) spec.awningColor = raw.awningColor;
  return spec;
}

// ---------------------------------------------------------------- typologies (default generators)

type Weighted<T> = ReadonlyArray<readonly [T, number]>;

interface Typology {
  /** lot width range (metres) for ordinary lots */
  width: readonly [number, number];
  /** corner lot width range; only used when the face has corners (E/W faces) */
  cornerWidth: readonly [number, number];
  floors: Weighted<number>;
  families: Weighted<Family>;
  /** probability an ordinary lot is mixed-use */
  mixedChance: number;
  storefronts: Weighted<StorefrontKind>;
  /** probability that the face gets one church (interior lot, 12.5-14 m wide) */
  churchChance: number;
  vacantChance: number;
  scaffoldChance: number;
  treeChance: number;
  stoopChance: number;
}

const TYPOLOGIES: Record<TypologyName, Typology> = {
  // Bed-Stuy side streets: 3-4 storey brownstone / brick rows ~6 m wide, stoops, bracketed cornices, street trees
  streetRow: {
    width: [5.2, 7.0], cornerWidth: [7, 9],
    floors: [[2, 5], [3, 55], [4, 35], [5, 5]],
    families: [['brownstone', 42], ['brickRed', 22], ['brickTan', 10], ['brickPainted', 8], ['limestone', 8], ['frame', 5], ['newBuild', 5]],
    mixedChance: 0.03,
    storefronts: [['bodega', 3], ['barber', 2], ['generic', 2], ['daycare', 1]],
    churchChance: 0.15, vacantChance: 0.04, scaffoldChance: 0.03, treeChance: 0.5, stoopChance: 0.92,
  },
  // Avenue frontage (the N-S avenues): 4-5 storey rows with mixed-use corners and a few mid-block shops, a church, a few vacant lots
  avenueMixed: {
    width: [6, 9], cornerWidth: [9, 12],
    floors: [[3, 15], [4, 45], [5, 30], [6, 10]],
    families: [['brickRed', 33], ['brickTan', 20], ['brickPainted', 15], ['brownstone', 10], ['limestone', 5], ['newBuild', 10], ['frame', 7]],
    mixedChance: 0.3, // + 2 mixed corners: about 4 shops per 10-11 lot face (Stage 3 density pass; was 0.65 = 5-9)
    storefronts: [['bodega', 20], ['laundromat', 7], ['barber', 10], ['deli', 9], ['liquor', 8], ['pharmacy', 4], ['daycare', 4], ['restaurant', 12], ['cellphone', 10], ['generic', 12]],
    churchChance: 0.1, vacantChance: 0.05, scaffoldChance: 0.04, treeChance: 0.3, stoopChance: 0.5,
  },
  // Long east-west avenues (Lafayette, Greene): mostly brownstone / brick residential rows with a storefront here and there
  avenueRow: {
    width: [5.5, 7.5], cornerWidth: [8, 10],
    floors: [[3, 40], [4, 40], [5, 20]],
    families: [['brownstone', 38], ['brickRed', 24], ['brickTan', 12], ['brickPainted', 8], ['limestone', 7], ['newBuild', 6], ['frame', 5]],
    mixedChance: 0.25,
    storefronts: [['bodega', 18], ['laundromat', 6], ['barber', 9], ['deli', 8], ['liquor', 7], ['pharmacy', 3], ['daycare', 4], ['restaurant', 12], ['cellphone', 8], ['generic', 12]],
    churchChance: 0.15, vacantChance: 0.04, scaffoldChance: 0.03, treeChance: 0.4, stoopChance: 0.85,
  },
};

export function defaultTypology(side: Side, streetIsAvenue: boolean): TypologyName {
  if (side === 'E' || side === 'W') return 'avenueMixed';
  return streetIsAvenue ? 'avenueRow' : 'streetRow';
}

function wpick<T>(rng: Rng, list: Weighted<T>): T {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rng.next() * total;
  for (const [v, w] of list) { r -= w; if (r < 0) return v; }
  return list[list.length - 1][0];
}

/** Split `total` into widths within [min, max] (last lot absorbs the remainder). */
function fillWidths(total: number, min: number, max: number, rng: Rng): number[] {
  const out: number[] = [];
  let rem = total;
  while (rem > 1e-6) {
    let w = rng.range(min, max);
    if (rem - w < min) w = rem <= max + 1 ? rem : rem / 2;
    out.push(w);
    rem -= w;
  }
  if (out.length) out[out.length - 1] += rem;
  return out;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Deterministic default row for a face of `spanM` metres, in from -> to order. `corners` adds a wider mixed-use lot at
 * both ends (E/W faces). Lots are fully resolved.
 */
export function generateFaceLots(spanM: number, typologyName: TypologyName, rng: Rng, corners: boolean, avenue: boolean): LotSpec[] {
  const ty = TYPOLOGIES[typologyName];
  const ctx: ResolveCtx = { avenue };
  if (spanM < 3) return [];
  const widths: number[] = [];
  const isCorner: boolean[] = [];
  let mid = spanM;
  let cw1 = 0;
  let cw2 = 0;
  if (corners && spanM > 3 * ty.cornerWidth[1]) {
    cw1 = Math.min(rng.range(ty.cornerWidth[0], ty.cornerWidth[1]), spanM * 0.3);
    cw2 = Math.min(rng.range(ty.cornerWidth[0], ty.cornerWidth[1]), spanM * 0.3);
    mid = spanM - cw1 - cw2;
  }
  if (cw1) { widths.push(cw1); isCorner.push(true); }
  for (const w of fillWidths(mid, ty.width[0], ty.width[1], rng)) { widths.push(w); isCorner.push(false); }
  if (cw2) { widths.push(cw2); isCorner.push(true); }

  // one church per face with some probability, in an interior position, wide enough for a nave; the other lots
  // shrink a little to make room so the row still sums to the span
  let churchAt = -1;
  if (widths.length >= 6 && rng.chance(ty.churchChance)) {
    churchAt = rng.int(2, widths.length - 3);
    const churchW = rng.range(12.5, 14);
    const others = widths.reduce((sum, w, i) => (i === churchAt ? sum : sum + w), 0);
    const k = (spanM - churchW) / others;
    for (let i = 0; i < widths.length; i++) widths[i] = i === churchAt ? churchW : widths[i] * k;
  }

  const lots: LotSpec[] = [];
  let prevVacant = false;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const corner = isCorner[i];
    const raw: RawLot = { confidence: 'L' };
    if (i === churchAt) {
      raw.use = 'church'; raw.family = 'church'; raw.floors = 3; raw.stoop = true; raw.cornice = 'none'; raw.storefront = 'church';
      raw.note = 'typology default: a church on this face';
    } else if (!corner && !prevVacant && rng.chance(ty.vacantChance)) {
      raw.use = 'vacant'; raw.family = 'vacant'; raw.floors = 0; raw.note = 'typology default: vacant lot';
    } else {
      const mixed = corner || rng.chance(ty.mixedChance);
      const floors = wpick(rng, ty.floors);
      raw.floors = mixed ? Math.max(3, floors) : floors;
      raw.family = wpick(rng, ty.families);
      if (raw.family === 'newBuild') raw.floors = Math.max(raw.floors, 4);
      if (mixed) {
        raw.use = 'mixed';
        raw.storefront = corner && rng.chance(0.4) ? 'bodega' : wpick(rng, ty.storefronts);
        raw.stoop = false;
        if (raw.family === 'frame') raw.family = 'brickRed';
      } else {
        raw.use = 'residential';
        raw.stoop = raw.family !== 'newBuild' && rng.chance(ty.stoopChance);
        if (rng.chance(0.12)) raw.cornice = rng.chance(0.5) ? 'plain' : 'none';
      }
      if (rng.chance(ty.scaffoldChance)) raw.scaffold = true;
    }
    prevVacant = raw.use === 'vacant';
    raw.trees = raw.use === 'vacant' ? 0 : rng.chance(ty.treeChance) ? 1 : 0;
    raw.widthM = round1(w);
    lots.push(resolveLot(raw, ctx));
  }
  // keep the sum exact after rounding
  const sum = lots.reduce((s, l) => s + l.widthM, 0);
  lots[lots.length - 1].widthM = round1(lots[lots.length - 1].widthM + (spanM - sum));
  return lots;
}

/** Apply pins (in from -> to order) to a lot list: each pin merges its fields into the lot at that position. */
export function applyPins(lots: LotSpec[], pins: readonly PinSpec[], ctx: ResolveCtx): LotSpec[] {
  if (!pins.length || !lots.length) return lots;
  const out = lots.slice();
  const total = out.reduce((s, l) => s + l.widthM, 0);
  for (const pin of pins) {
    let idx: number;
    if (pin.at === 'from') idx = 0;
    else if (pin.at === 'to') idx = out.length - 1;
    else {
      const x = pin.at * total;
      let acc = 0;
      idx = out.length - 1;
      for (let i = 0; i < out.length; i++) {
        if (x < acc + out[i].widthM) { idx = i; break; }
        acc += out[i].widthM;
      }
    }
    // re-resolve from the pinned fields over the lot's existing explicit values so dependent defaults follow the pin
    // (e.g. pinning use:'vacant' also zeroes floors); width defaults to the existing lot's width
    const base = out[idx];
    const merged: RawLot = { widthM: base.widthM, trees: base.trees, depthM: undefined, ...pin.lot };
    if (pin.lot.use === undefined && pin.lot.family === undefined && pin.lot.floors === undefined && pin.lot.storefront === undefined) {
      // cosmetic pin (note, scaffold, trees...): keep everything else as generated
      out[idx] = { ...base, ...(pin.lot as Partial<LotSpec>) };
    } else {
      out[idx] = resolveLot(merged, ctx);
    }
  }
  return out;
}

// ---------------------------------------------------------------- loading

/** Parse + validate + default. Throws SchemaError listing every problem. JSON without `faces` yields an empty set. */
export function loadFaces(json: unknown): FaceSet {
  const issues = validateFaces(json);
  if (issues.length) throw new SchemaError(issues);
  const root = (isObj(json) ? json : {}) as Record<string, unknown>;
  const streets = streetsOf(root);
  const classOf = new Map(streets.map((s) => [s.id, s.class]));
  const faces: FaceDef[] = [];
  const byKey = new Map<string, FaceDef>();
  const rawFaces = (Array.isArray(root.faces) ? root.faces : []) as Array<Record<string, unknown>>;
  for (const f of rawFaces) {
    const side = f.side as Side;
    const street = f.street as string;
    const avenue = classOf.get(street) ? classOf.get(street) === 'avenue' : side === 'E' || side === 'W';
    const ctx: ResolveCtx = { avenue: side === 'E' || side === 'W' ? true : avenue };
    const lots = ((f.lots ?? []) as RawLot[]).map((l) => resolveLot(l, ctx));
    const pins = ((f.pins ?? []) as Array<{ at: PinAt; lot: RawLot }>).map((p) => ({ at: p.at, lot: { ...p.lot } }));
    const def: FaceDef = {
      key: `${street}|${side}|${f.from as string}|${f.to as string}`,
      street, side, from: f.from as string, to: f.to as string,
      seed: (f.seed as number | undefined) ?? 0,
      lots, pins,
      confidence: (f.confidence as Confidence | undefined) ?? 'L',
      note: (f.note as string | undefined) ?? '',
      avenue: ctx.avenue,
    };
    if (f.typology !== undefined) def.typology = f.typology as TypologyName;
    faces.push(def);
    byKey.set(def.key, def);
  }
  return { version: 2, faces, byKey };
}

/** 1 for the original streets+pois file, 2 once it carries `schemaVersion: 2` / `faces`. */
export function schemaVersionOf(json: unknown): 1 | 2 {
  if (!isObj(json)) return 1;
  return json.schemaVersion === 2 || json.faces !== undefined ? 2 : 1;
}

/** v1 -> v2: adds `schemaVersion: 2` and an empty `faces` list; everything else is kept as is. */
export function migrateV1(json: Record<string, unknown>): Record<string, unknown> {
  if (schemaVersionOf(json) === 2 && json.schemaVersion === 2) return json;
  return { ...json, schemaVersion: 2, faces: json.faces ?? [] };
}

export function emptyFaceSet(): FaceSet {
  return { version: 2, faces: [], byKey: new Map() };
}

// ---------------------------------------------------------------- grid binding

interface FaceTopology { street: string; side: Side; from?: string; to?: string; aCross?: string; bCross?: string; avenue: boolean }

function sortedStreets(grid: GridModel, axis: 'ns' | 'ew'): Array<{ id: string; offset: number }> {
  const list = (grid.streets ?? []) as Array<{ id: string; axis: string; offset: number }>;
  return list.filter((s) => s.axis === axis).sort((a, b) => a.offset - b.offset);
}

/** Work out the (from, to) cross streets of a BlockFace and which cross street sits at its a / b end. */
function topologyOf(grid: GridModel, face: BlockFace): FaceTopology {
  let avenue = face.side === 'E' || face.side === 'W';
  try {
    if (!avenue) avenue = grid.streetById(face.streetId).class === 'avenue';
  } catch { /* fake grids */ }
  const topo: FaceTopology = { street: face.streetId, side: face.side, avenue };
  let block: { row: number; col: number } | undefined;
  try { block = grid.blockById(face.blockId); } catch { block = undefined; }
  const nss = sortedStreets(grid, 'ns');
  const ews = sortedStreets(grid, 'ew');
  if (!block || !nss.length || !ews.length) return topo;
  const base = Math.max(0, ews.findIndex((e) => e.id === 'hart')); // rows count from Hart (Grid.ROW_ZERO_STREET): north rows are negative
  const west = nss[block.col]; const east = nss[block.col + 1];
  const north = ews[block.row + base]; const south = ews[block.row + base + 1];
  if (!west || !east || !north || !south) return topo;
  if (face.side === 'N' || face.side === 'S') {
    topo.from = west.id; topo.to = east.id;
    // N: a = NE, b = NW ; S: a = SW, b = SE
    topo.aCross = face.side === 'N' ? east.id : west.id;
    topo.bCross = face.side === 'N' ? west.id : east.id;
  } else {
    topo.from = north.id; topo.to = south.id;
    // E: a = SE, b = NE ; W: a = NW, b = SW
    topo.aCross = face.side === 'E' ? south.id : north.id;
    topo.bCross = face.side === 'E' ? north.id : south.id;
  }
  return topo;
}

/** Authoring order (from -> to) is reversed relative to face.a -> face.b on N and E faces. */
const reversedOnFace = (side: Side): boolean => side === 'N' || side === 'E';

/** Data key (`street|side|from|to`) for a BlockFace, or undefined if the grid cannot tell its cross streets. */
export function faceKeyOf(grid: GridModel, face: BlockFace): string | undefined {
  const t = topologyOf(grid, face);
  return t.from && t.to ? `${t.street}|${t.side}|${t.from}|${t.to}` : undefined;
}

/** The FaceDef describing this BlockFace, if the data has one. */
export function faceFor(set: FaceSet, grid: GridModel, face: BlockFace): FaceDef | undefined {
  const t = topologyOf(grid, face);
  if (!t.from || !t.to) return undefined;
  return set.byKey.get(`${t.street}|${t.side}|${t.from}|${t.to}`);
}

/** Grid-aware validation: faces that match no block, and explicit lot rows longer than the face (+1 m). Empty = fine. */
export function validateAgainstGrid(grid: GridModel, set: FaceSet): string[] {
  const out: string[] = [];
  const { unmatched } = checkAgainstGrid(grid, set);
  for (const k of unmatched) out.push(`face ${k}: matches no block on this grid`);
  for (const block of grid.blocks) {
    for (const bf of block.faces) {
      const def = faceFor(set, grid, bf);
      if (!def || !def.lots.length) continue;
      const ins = cornerInsets(grid, bf, set);
      const len = dist(bf.a, bf.b) - ins.a - ins.b;
      const sum = def.lots.reduce((s, l) => s + l.widthM, 0);
      if (sum > len + 1) out.push(`face ${def.key}: lot widths sum to ${sum.toFixed(1)} m but the face is ${len.toFixed(1)} m (+1 m tolerance)`);
    }
  }
  return out;
}

/** Problems between a FaceSet and a concrete grid: faces that match no block, blocks whose face has no data. */
export function checkAgainstGrid(grid: GridModel, set: FaceSet): { unmatched: string[]; missing: string[] } {
  const matched = new Set<string>();
  const missing: string[] = [];
  for (const block of grid.blocks) {
    for (const bf of block.faces) {
      const def = faceFor(set, grid, bf);
      if (def) matched.add(def.key); else missing.push(`${block.id}|${bf.side}`);
    }
  }
  return { unmatched: set.faces.filter((f) => !matched.has(f.key)).map((f) => f.key), missing };
}

// ---------------------------------------------------------------- fitting

const FIT_MIN = 0.8;
const FIT_MAX = 1.25;

/**
 * Make `specs` (from -> to order) cover exactly `length` metres: drop trailing lots when the data is more than 25%
 * too long, append filler rows when more than 20% too short, then scale all widths uniformly. The last width absorbs
 * float residue. Returns new objects (inputs untouched) plus whether any lot was synthesised.
 */
export function fitLots(specs: readonly LotSpec[], length: number, ctx: ResolveCtx): { lots: LotSpec[]; synthesised: boolean[] } {
  let lots = specs.map((l) => ({ ...l }));
  let synth = lots.map(() => false);
  if (length <= 0 || !lots.length) return { lots: [], synthesised: [] };
  let sum = lots.reduce((s, l) => s + l.widthM, 0);
  while (lots.length > 1 && sum > length * FIT_MAX) {
    sum -= lots[lots.length - 1].widthM;
    lots = lots.slice(0, -1);
    synth = synth.slice(0, -1);
  }
  if (sum < length * FIT_MIN) {
    const ws = lots.map((l) => l.widthM).sort((a, b) => a - b);
    const filler = Math.max(4, ws[Math.floor(ws.length / 2)]);
    const proto = resolveLot({ widthM: filler, floors: ctx.avenue ? 4 : 3, note: 'filler: face data shorter than the block' }, ctx);
    while (sum < length * FIT_MIN) {
      lots.push({ ...proto });
      synth.push(true);
      sum += filler;
    }
  }
  const s = length / sum;
  let acc = 0;
  for (let i = 0; i < lots.length; i++) {
    lots[i].widthM = i === lots.length - 1 ? length - acc : round3(lots[i].widthM * s);
    acc += lots[i].widthM;
  }
  return { lots, synthesised: synth };
}
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- lotsForFace

function faceSeed(grid: GridModel, key: string, extra: number): number {
  return (Rng.hash(key) ^ (((grid.seed ?? 0) >>> 0) * 2654435761) ^ (extra >>> 0)) >>> 0;
}

/**
 * Lay the lots of one block face along it. Always returns lots: explicit data when the face has `lots`, otherwise a
 * deterministic typology default (same grid + data => same output). Ordered along face.a -> face.b; widths sum to
 * |a - b| - insetA - insetB. N/S faces are inset automatically by the adjoining corner lots' depth.
 */
export function lotsForFace(grid: GridModel, face: BlockFace, set: FaceSet, opts: LotsOptions = {}): PlacedLot[] {
  const topo = topologyOf(grid, face);
  const def = topo.from && topo.to ? set.byKey.get(`${topo.street}|${topo.side}|${topo.from}|${topo.to}`) : undefined;
  const ewFace = face.side === 'E' || face.side === 'W';

  let insetA = opts.insetA;
  let insetB = opts.insetB;
  if (!ewFace && opts.autoInset !== false && (insetA === undefined || insetB === undefined)) {
    const auto = cornerInsets(grid, face, set);
    insetA ??= auto.a;
    insetB ??= auto.b;
  }
  insetA ??= 0;
  insetB ??= 0;

  const total = dist(face.a, face.b);
  const length = Math.max(0, total - insetA - insetB);
  const avenue = ewFace ? true : topo.avenue;
  const ctx: ResolveCtx = { avenue };

  let specs: LotSpec[];
  let fromData = false;
  if (def && def.lots.length) {
    specs = def.lots;
    fromData = true;
  } else {
    const typology = def?.typology ?? defaultTypology(face.side, topo.avenue);
    const key = def?.key ?? `${face.blockId}|${face.side}`;
    const rng = new Rng(faceSeed(grid, key, def?.seed ?? 0));
    // generate over the nominal span; fitLots scales to the real one
    specs = generateFaceLots(length, typology, rng, ewFace, avenue);
    if (def && def.pins.length) specs = applyPins(specs, def.pins, ctx);
  }
  if (reversedOnFace(face.side)) specs = specs.slice().reverse();

  const fit = fitLots(specs, length, ctx);
  const d = norm(sub(face.b, face.a));
  const out: PlacedLot[] = [];
  let s = insetA;
  for (let i = 0; i < fit.lots.length; i++) {
    const l = fit.lots[i];
    const w = l.widthM;
    const frontA = add(face.a, scale(d, s));
    const frontB = add(face.a, scale(d, s + w));
    const placed: PlacedLot = {
      ...l,
      id: `${face.blockId}-${face.side}-${i}`,
      blockId: face.blockId,
      side: face.side,
      index: i,
      offsetM: s,
      frontA,
      frontB,
      center: scale(add(frontA, frontB), 0.5),
      outward: { x: face.outward.x, z: face.outward.z },
      corner: false,
      fromData: fromData && !fit.synthesised[i],
    };
    if (ewFace && (i === 0 || i === fit.lots.length - 1)) {
      placed.corner = true;
      placed.cornerEnd = i === 0 ? 'a' : 'b';
      const cs = i === 0 ? topo.aCross : topo.bCross;
      if (cs) placed.cornerStreetId = cs;
    }
    out.push(placed);
    s += w;
  }
  return out;
}

/** Depth of the corner lots at each end of an N/S face (taken from the adjoining E/W faces of the same block). */
export function cornerInsets(grid: GridModel, face: BlockFace, set: FaceSet): { a: number; b: number } {
  if (face.side === 'E' || face.side === 'W') return { a: 0, b: 0 };
  let block;
  try { block = grid.blockById(face.blockId); } catch { return { a: 0, b: 0 }; }
  const e = block.faces.find((f) => f.side === 'E');
  const w = block.faces.find((f) => f.side === 'W');
  if (!e || !w) return { a: 0, b: 0 };
  const eLots = lotsForFace(grid, e, set);
  const wLots = lotsForFace(grid, w, set);
  if (!eLots.length || !wLots.length) return { a: 0, b: 0 };
  // N: a = NE (E face's b end), b = NW (W face's a end). S: a = SW (W face's b end), b = SE (E face's a end).
  if (face.side === 'N') return { a: eLots[eLots.length - 1].depthM, b: wLots[0].depthM };
  return { a: wLots[wLots.length - 1].depthM, b: eLots[0].depthM };
}

/** Lots for all four faces of a block (E/W first so N/S can be inset), as one flat list. */
export function lotsForBlock(grid: GridModel, blockId: string, set: FaceSet): PlacedLot[] {
  const block = grid.blockById(blockId);
  const order: Side[] = ['E', 'W', 'N', 'S'];
  const out: PlacedLot[] = [];
  for (const side of order) {
    const f = block.faces.find((x) => x.side === side);
    if (f) out.push(...lotsForFace(grid, f, set));
  }
  return out;
}
