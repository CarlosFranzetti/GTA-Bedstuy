/**
 * Geo helpers for the real-blocks importer (scripts/import-osm.mjs). Pure functions, no THREE, no '@' imports, no I/O.
 *
 * What lives here
 *   - projection: WGS84 lat/lon <-> grid metres (+x east, +z south, same frame as Grid.ts) with a configurable origin
 *     and a bearing, plus fitBearing() which estimates that bearing from building footprints;
 *   - face frames: the 40 block faces of the grid expressed as 1-D coordinates (`s` metres from the `from` end of the
 *     building line), derived from the street list exactly the way Grid.ts derives blocks;
 *   - footprint assignment: which face a footprint fronts and where along it;
 *   - lot derivation from OSM tags (+ optional PLUTO row): floors, use, storefront, family hint, confidence, source note;
 *   - face layout (overlaps, gaps -> vacant lots) and merge over existing hand-authored lots.
 *
 * Data sources are OpenStreetMap (c) OpenStreetMap contributors, ODbL, and NYC Open Data (MapPLUTO). No Google data.
 */

// ---------------------------------------------------------------- constants

/**
 * Throop Ave / Kosciuszko St intersection, WGS84.
 * APPROXIMATE, VERIFY: this was written from memory of the neighbourhood, not read from a map or a dataset in this
 * sandbox (the map hosts are blocked). It is only the anchor of the local projection: wrong by a few hundred metres
 * simply means the grid is anchored at the wrong spot, so check it against the real intersection (e.g. click the
 * corner on openstreetmap.org and read the coordinates) and pass `--origin lat,lon` to the importer.
 */
export const ORIGIN_LATLON: LatLon = { lat: 40.6935, lon: -73.9420 };
/** Fallback bearing (degrees clockwise from true north of the grid's "north" = -z). Unknown; the importer fits it from footprints. */
export const DEFAULT_BEARING_DEG = 0;
/** Mean earth radius (m) used by the equirectangular local projection (error well under 0.1% over 1 km). */
export const EARTH_RADIUS_M = 6371008.8;
/** Metres of floor-to-floor height used to turn an OSM `height` into a storey count. */
export const STOREY_M = 3.1;
/** Gaps between consecutive footprints at least this wide become vacant lots; smaller gaps are absorbed by the neighbours. */
export const MIN_VACANT_M = 3.5;
/** Footprints narrower than this along the face are sheds/garages in the yard and are skipped. */
export const MIN_LOT_M = 3;
/** Widest lot the schema allows; wider footprints are split into equal lots. */
export const MAX_LOT_M = 40;
/** Assumed depth of the corner lots on an N/S face (E/W faces own the corners), used to place existing lots when merging. */
export const NOMINAL_CORNER_M = 15;
/** Distance by which E/W (avenue) faces win a tie against N/S faces for corner buildings. */
export const AVENUE_BIAS_M = 6;
/** Marker that opens every note written by the importer; notes without it are treated as hand-written. */
export const IMPORT_MARK = '[import]';
/** Notes written by the generators of earlier lanes: they carry no human knowledge, so they do not protect a lot. */
export const AUTO_NOTE = /^(typology default|W2 density pass|filler)/;

// ---------------------------------------------------------------- types

export interface LatLon { lat: number; lon: number }
export interface Pt { x: number; z: number }
export type Tags = Record<string, string>;
export type Side = 'N' | 'S' | 'E' | 'W';

export interface StreetLite {
  id: string;
  name?: string;
  signName?: string;
  axis: 'ns' | 'ew';
  class?: string;
  offset: number;
  roadWidth: number;
  sidewalkWidth: number;
}

/** Shape of a lot as written to bedstuy.json (a subset of schema.ts RawLot, kept structural so this file has no imports). */
export interface LotJson {
  widthM: number;
  floors?: number;
  family?: string;
  stoop?: boolean;
  stoopHeightM?: number;
  cornice?: string;
  bays?: number;
  use?: string;
  storefront?: string;
  trees?: number;
  scaffold?: boolean;
  depthM?: number;
  confidence: 'H' | 'M' | 'L';
  note?: string;
  sign?: string;
  awningColor?: string;
}

// ---------------------------------------------------------------- projection

export interface Projection {
  origin: LatLon;
  bearingDeg: number;
  toGrid(ll: LatLon): Pt;
  toLatLon(p: Pt): LatLon;
}

const RAD = Math.PI / 180;

/**
 * Local tangent-plane projection. `bearingDeg` is the compass bearing (clockwise from true north) of the grid's
 * "north" direction, i.e. the direction in which grid z DEcreases. With bearing 0 the grid is true north/east.
 * The origin maps to (0, 0) (the Throop/Kosciuszko intersection when the default origin is used).
 */
export function makeProjection(origin: LatLon = ORIGIN_LATLON, bearingDeg: number = DEFAULT_BEARING_DEG): Projection {
  const kLat = EARTH_RADIUS_M * RAD; // metres per degree of latitude
  const kLon = EARTH_RADIUS_M * RAD * Math.cos(origin.lat * RAD);
  const th = bearingDeg * RAD;
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  return {
    origin,
    bearingDeg,
    toGrid(ll) {
      const e = (ll.lon - origin.lon) * kLon;
      const n = (ll.lat - origin.lat) * kLat;
      // u = along grid north, v = along grid east (perpendicular, clockwise)
      const u = e * sin + n * cos;
      const v = e * cos - n * sin;
      return { x: v, z: -u };
    },
    toLatLon(p) {
      const u = -p.z;
      const v = p.x;
      const e = u * sin + v * cos;
      const n = u * cos - v * sin;
      return { lat: origin.lat + n / kLat, lon: origin.lon + e / kLon };
    },
  };
}

/** Parse "lat,lon" (as printed by openstreetmap.org share links). Throws on bad input. */
export function parseLatLon(text: string): LatLon {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) throw new Error(`expected "lat,lon", got ${JSON.stringify(text)}`);
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`lat/lon out of range: ${text}`);
  return { lat, lon };
}

// ---------------------------------------------------------------- polygon helpers

export function ringCentroid(ring: readonly Pt[]): Pt {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const f = p.x * q.z - q.x * p.z;
    a += f; cx += (p.x + q.x) * f; cz += (p.z + q.z) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, ring.length);
    return { x: ring.reduce((s, p) => s + p.x, 0) / n, z: ring.reduce((s, p) => s + p.z, 0) / n };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export function ringArea(ring: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/** Ray-casting point-in-polygon on any consistent planar coordinates. */
export function pointInRing(p: { x: number; z: number }, ring: readonly { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- bearing fit

export interface BearingFit {
  /** compass bearing (deg, in (-45, 45]) of the grid's "north" axis */
  bearingDeg: number;
  /** 0..1, how consistent the edge directions are (1 = a perfect rectilinear grid) */
  strength: number;
  /** number of polygon edges that contributed */
  edges: number;
}

/**
 * Estimate the street-grid bearing from building footprints. Building edges of a rowhouse block lie along two
 * perpendicular directions, so every edge bearing is folded modulo 90 degrees (multiplying the angle by 4 turns the
 * four equivalent directions into one) and averaged, weighted by edge length. The result is ambiguous modulo 90, so
 * it is returned in (-45, 45]; pass the importer `--bearing` if the true grid is rotated further than that.
 */
export function fitBearing(rings: readonly (readonly LatLon[])[], origin: LatLon = ORIGIN_LATLON): BearingFit {
  const kLat = EARTH_RADIUS_M * RAD;
  const kLon = kLat * Math.cos(origin.lat * RAD);
  let sx = 0, sy = 0, sw = 0, edges = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const e = (q.lon - p.lon) * kLon;
      const n = (q.lat - p.lat) * kLat;
      const len = Math.hypot(e, n);
      if (len < 2) continue; // ignore tiny jogs
      const th = Math.atan2(e, n); // compass bearing
      sx += len * Math.cos(4 * th);
      sy += len * Math.sin(4 * th);
      sw += len;
      edges++;
    }
  }
  if (!sw) return { bearingDeg: DEFAULT_BEARING_DEG, strength: 0, edges: 0 };
  let b = (Math.atan2(sy, sx) / 4) / RAD;
  if (b <= -45) b += 90;
  return { bearingDeg: b, strength: Math.hypot(sx, sy) / sw, edges };
}

/**
 * Two-pass fit that follows the task wording "fit the bearing from building footprints along Throop": fit on all
 * footprints, project, keep the ones whose centroid lies within `halfWidthM` of the street's x offset, refit on those.
 * Falls back to the first fit when fewer than 4 footprints are near the street.
 */
export function fitBearingAlongStreet(
  rings: readonly (readonly LatLon[])[],
  origin: LatLon = ORIGIN_LATLON,
  streetOffsetX = 0,
  halfWidthM = 45,
): BearingFit {
  const first = fitBearing(rings, origin);
  const proj = makeProjection(origin, first.bearingDeg);
  const near = rings.filter((r) => {
    const c = ringCentroid(r.map((p) => proj.toGrid(p)));
    return Math.abs(c.x - streetOffsetX) <= halfWidthM;
  });
  if (near.length < 4) return first;
  return fitBearing(near, origin);
}

// ---------------------------------------------------------------- face frames

export interface FaceFrame {
  /** `${street}|${side}|${from}|${to}` (schema face key) */
  key: string;
  blockId: string;
  street: string;
  side: Side;
  from: string;
  to: string;
  /** axis of the along-face coordinate: 'x' for N/S faces, 'z' for E/W faces */
  alongAxis: 'x' | 'z';
  /** grid coordinate of the building line on the other axis (z for N/S faces, x for E/W faces) */
  lineCoord: number;
  /** grid coordinate (on alongAxis) of the `from` end of the building line; s = coord - s0 */
  s0: number;
  /** face length along the building line, metres */
  length: number;
  /** unit step from the building line toward the street, on the line axis (-1 or +1) */
  outwardSign: 1 | -1;
  avenue: boolean;
  /** cell bounds of the block (curb lines) in grid metres */
  cell: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Faces of the grid in the same arrangement Grid.ts builds blocks (r{row}c{col}, N/S/E/W). Pure, derived from streets only. */
export function buildFaceFrames(streets: readonly StreetLite[]): FaceFrame[] {
  const nss = streets.filter((s) => s.axis === 'ns').sort((a, b) => a.offset - b.offset);
  const ews = streets.filter((s) => s.axis === 'ew').sort((a, b) => a.offset - b.offset);
  const out: FaceFrame[] = [];
  for (let row = 0; row < ews.length - 1; row++) {
    for (let col = 0; col < nss.length - 1; col++) {
      const north = ews[row], south = ews[row + 1], west = nss[col], east = nss[col + 1];
      const minX = west.offset + west.roadWidth / 2;
      const maxX = east.offset - east.roadWidth / 2;
      const minZ = north.offset + north.roadWidth / 2;
      const maxZ = south.offset - south.roadWidth / 2;
      const blMinX = minX + west.sidewalkWidth, blMaxX = maxX - east.sidewalkWidth;
      const blMinZ = minZ + north.sidewalkWidth, blMaxZ = maxZ - south.sidewalkWidth;
      const blockId = `r${row}c${col}`;
      const cell = { minX, maxX, minZ, maxZ };
      const mk = (side: Side, street: StreetLite, from: StreetLite, to: StreetLite, f: Partial<FaceFrame>): FaceFrame => ({
        key: `${street.id}|${side}|${from.id}|${to.id}`,
        blockId, street: street.id, side, from: from.id, to: to.id, cell,
        avenue: street.axis === 'ns' || street.class === 'avenue',
        ...(f as Omit<FaceFrame, 'key' | 'blockId' | 'street' | 'side' | 'from' | 'to' | 'cell' | 'avenue'>),
      });
      out.push(mk('N', north, west, east, { alongAxis: 'x', lineCoord: blMinZ, s0: blMinX, length: blMaxX - blMinX, outwardSign: -1 }));
      out.push(mk('S', south, west, east, { alongAxis: 'x', lineCoord: blMaxZ, s0: blMinX, length: blMaxX - blMinX, outwardSign: 1 }));
      out.push(mk('E', east, north, south, { alongAxis: 'z', lineCoord: blMaxX, s0: blMinZ, length: blMaxZ - blMinZ, outwardSign: 1 }));
      out.push(mk('W', west, north, south, { alongAxis: 'z', lineCoord: blMinX, s0: blMinZ, length: blMaxZ - blMinZ, outwardSign: -1 }));
    }
  }
  return out;
}

/** Normalised street-name key: lower case, punctuation stripped, suffixes abbreviated ("Throop Avenue" == "throop ave"). */
export function streetKey(name: string): string {
  return name.toLowerCase()
    .replace(/[.,']/g, '')
    .replace(/\b(avenue|av)\b/g, 'ave')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\bkosciusko\b/g, 'kosciuszko')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Assignment {
  frame: FaceFrame;
  /** metres from the face's `from` end to the footprint centre */
  s: number;
  /** extent of the footprint along the face */
  s0: number;
  s1: number;
  /** extent of the footprint perpendicular to the face (depth into the block) */
  depthM: number;
}

/**
 * Pick the face a footprint fronts. The footprint centroid decides the block cell; inside it the face whose building
 * line is nearest wins (avenue faces get a few metres of bias so corner buildings join the E/W faces, which own the
 * corners). When the address names one of the four streets of the cell, only those faces compete.
 * Returns null when the footprint lies outside every block (in the roadway, or off the grid).
 */
export function assignFootprint(frames: readonly FaceFrame[], streets: readonly StreetLite[], ring: readonly Pt[], addrStreet?: string): Assignment | null {
  if (ring.length < 3) return null;
  const c = ringCentroid(ring);
  const here = frames.filter((f) => c.x >= f.cell.minX && c.x <= f.cell.maxX && c.z >= f.cell.minZ && c.z <= f.cell.maxZ);
  if (!here.length) return null;
  let cands = here;
  if (addrStreet) {
    const want = streetKey(addrStreet);
    const ids = new Set(streets.filter((s) => streetKey(s.name ?? '') === want || streetKey(s.signName ?? '') === want || streetKey(s.id) === want).map((s) => s.id));
    const named = here.filter((f) => ids.has(f.street));
    if (named.length) cands = named;
  }
  let best: FaceFrame | null = null;
  let bestD = Infinity;
  for (const f of cands) {
    // distance from the building line into the block, along the line axis
    const coord = f.alongAxis === 'x' ? c.z : c.x;
    const d = Math.abs(coord - f.lineCoord) - (f.side === 'E' || f.side === 'W' ? AVENUE_BIAS_M : 0);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) return null;
  const along = (p: Pt): number => (best!.alongAxis === 'x' ? p.x : p.z) - best!.s0;
  const across = (p: Pt): number => (best!.alongAxis === 'x' ? p.z : p.x);
  let a0 = Infinity, a1 = -Infinity, d0 = Infinity, d1 = -Infinity;
  for (const p of ring) {
    a0 = Math.min(a0, along(p)); a1 = Math.max(a1, along(p));
    d0 = Math.min(d0, across(p)); d1 = Math.max(d1, across(p));
  }
  return { frame: best, s: (a0 + a1) / 2, s0: a0, s1: a1, depthM: d1 - d0 };
}

// ---------------------------------------------------------------- PLUTO

export interface PlutoRow {
  address: string;
  yearBuilt?: number;
  landUse?: string;
  numFloors?: number;
  bldgClass?: string;
  bbl?: string;
}

/** Minimal RFC-4180 CSV parser (quotes, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Normalise "442 Throop Avenue" / "442 THROOP AVE" / "442 Throop Ave." to one key. */
export function addressKey(housenumber: string, street: string): string {
  return `${housenumber.trim().toLowerCase().replace(/\s+/g, '')} ${streetKey(street)}`;
}

/** Parse a MapPLUTO CSV export (columns are matched case-insensitively: Address, YearBuilt, LandUse, NumFloors, BldgClass, BBL). */
export function parsePluto(csv: string): Map<string, PlutoRow> {
  const rows = parseCsv(csv);
  const out = new Map<string, PlutoRow>();
  if (!rows.length) return out;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string): number => head.indexOf(n.toLowerCase());
  const ia = col('address'), iy = col('yearbuilt'), il = col('landuse'), inf = col('numfloors'), ib = col('bldgclass'), ibbl = col('bbl');
  if (ia < 0) throw new Error('PLUTO csv has no "Address" column');
  for (const r of rows.slice(1)) {
    const addr = (r[ia] ?? '').trim();
    const m = /^(\S+)\s+(.+)$/.exec(addr);
    if (!m) continue;
    const num = (i: number): number | undefined => {
      if (i < 0) return undefined;
      const v = Number.parseFloat(r[i] ?? '');
      return Number.isFinite(v) && v > 0 ? v : undefined;
    };
    const row: PlutoRow = { address: addr };
    const y = num(iy); if (y !== undefined) row.yearBuilt = Math.round(y);
    const nf = num(inf); if (nf !== undefined) row.numFloors = nf;
    if (il >= 0 && r[il]) row.landUse = String(Number.parseInt(r[il], 10)).padStart(2, '0');
    if (ib >= 0 && r[ib]) row.bldgClass = r[ib].trim();
    if (ibbl >= 0 && r[ibbl]) row.bbl = r[ibbl].trim();
    out.set(addressKey(m[1], m[2]), row);
  }
  return out;
}

// ---------------------------------------------------------------- tags -> lot

const SHOP_TO_STOREFRONT: Record<string, string> = {
  convenience: 'bodega', supermarket: 'bodega', grocery: 'bodega', greengrocer: 'bodega', deli: 'deli', butcher: 'deli',
  laundry: 'laundromat', dry_cleaning: 'laundromat', hairdresser: 'barber', barber: 'barber', beauty: 'braiding',
  alcohol: 'liquor', wine: 'liquor', chemist: 'pharmacy', pharmacy: 'pharmacy', mobile_phone: 'cellphone', electronics: 'cellphone',
  variety_store: 'dollar', general: 'dollar', department_store: 'dollar', funeral_directors: 'funeral', car_repair: 'autorepair',
  tyres: 'autorepair', car: 'autorepair', bakery: 'deli', pizza: 'pizza',
};
const AMENITY_TO_STOREFRONT: Record<string, string> = {
  restaurant: 'restaurant', fast_food: 'restaurant', cafe: 'restaurant', bar: 'restaurant', pub: 'restaurant', pharmacy: 'pharmacy',
  car_wash: 'autorepair', car_repair: 'autorepair', childcare: 'daycare', kindergarten: 'daycare', bank: 'generic',
  post_office: 'generic', clinic: 'generic', dentist: 'generic', doctors: 'generic', laundry: 'laundromat',
};
const WORSHIP_BUILDING = new Set(['church', 'chapel', 'cathedral', 'synagogue', 'mosque', 'temple', 'religious']);
const COMMERCIAL_BUILDING = new Set(['retail', 'commercial', 'shop', 'supermarket', 'kiosk']);
const GARAGE_BUILDING = new Set(['garage', 'garages', 'parking', 'carport', 'service']);
const SCHOOL_BUILDING = new Set(['school', 'kindergarten', 'college', 'university']);

const COLOUR_FAMILY: Record<string, string> = {
  brown: 'brownstone', brownstone: 'brownstone', red: 'brickRed', brick: 'brickRed', tan: 'brickTan', beige: 'brickTan', yellow: 'brickTan',
  white: 'brickPainted', grey: 'brickPainted', gray: 'brickPainted', cream: 'limestone',
};

export interface DerivedLot {
  lot: LotJson;
  /** where the storey count came from */
  floorsFrom: 'levels' | 'height' | 'pluto' | 'default';
  /** true when the lot is vacant ground (no building) */
  vacant: boolean;
}

const parseNum = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const v = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
};

/** Street + housenumber from OSM `addr:*` tags, if both exist. */
export function addressOf(tags: Tags): { housenumber: string; street: string } | undefined {
  const h = tags['addr:housenumber'];
  const s = tags['addr:street'];
  return h && s ? { housenumber: h, street: s } : undefined;
}

function plutoUse(p: PlutoRow): string | undefined {
  const bc = p.bldgClass ?? '';
  if (bc.startsWith('M')) return 'church';
  if (bc.startsWith('W')) return 'school';
  if (bc.startsWith('G')) return 'garage';
  switch (p.landUse) {
    case '04': case '05': return 'mixed';
    case '10': return 'garage';
    case '11': return 'vacant';
    default: return undefined;
  }
}

/**
 * Turn the tags of one footprint (merged with any shop/amenity point inside it) plus an optional PLUTO row into a lot.
 * Fields are only set when the data says something; the schema fills the rest (style hints are inherited by the merge).
 * Confidence: 'H' when OSM gives a footprint AND a storey count (levels, height or PLUTO), 'M' when the storey count is
 * defaulted.
 */
export function deriveLot(tags: Tags, widthM: number, depthM: number, pluto: PlutoRow | undefined, osmRef: string, defaultFloors = 3): DerivedLot {
  const b = (tags.building ?? 'yes').toLowerCase();
  const amenity = tags.amenity ?? '';
  const shop = tags.shop ?? '';
  const cuisine = (tags.cuisine ?? '').toLowerCase();

  let use = 'residential';
  let storefront: string | undefined;
  let family: string | undefined;

  const worship = WORSHIP_BUILDING.has(b) || amenity === 'place_of_worship';
  if (worship) { use = 'church'; family = 'church'; storefront = 'church'; }
  else if (SCHOOL_BUILDING.has(b) || amenity === 'school' || amenity === 'college') { use = 'school'; storefront = 'daycare'; }
  else if (GARAGE_BUILDING.has(b) || amenity === 'parking') { use = 'garage'; }
  else if (shop || AMENITY_TO_STOREFRONT[amenity] || COMMERCIAL_BUILDING.has(b)) {
    use = 'mixed';
    storefront = SHOP_TO_STOREFRONT[shop] ?? AMENITY_TO_STOREFRONT[amenity] ?? 'generic';
    if (storefront === 'restaurant') {
      if (cuisine.includes('pizza')) storefront = 'pizza';
      else if (cuisine.includes('chinese')) storefront = 'chinese';
      else if (/caribbean|jamaican|haitian|trinidad/.test(cuisine)) storefront = 'caribbean';
    }
    if (shop === 'convenience' && /deli/i.test(tags.name ?? '')) storefront = 'deli';
  } else if (pluto) {
    const pu = plutoUse(pluto);
    if (pu) use = pu;
    if (use === 'mixed') storefront = 'generic';
    if (use === 'church') { family = 'church'; storefront = 'church'; }
    if (use === 'school') storefront = 'daycare';
  }
  if (b === 'garage' && !shop) storefront = undefined;
  if (use === 'vacant') family = 'vacant';

  const mat = (tags['building:material'] ?? '').toLowerCase();
  if (!family) {
    if (mat === 'brick') family = 'brickRed';
    else if (mat === 'stone') family = 'limestone';
    else if (mat === 'wood') family = 'frame';
    else if (tags['building:colour']) family = COLOUR_FAMILY[tags['building:colour'].toLowerCase()];
    if (!family && pluto?.yearBuilt && pluto.yearBuilt >= 1990 && use === 'residential') family = 'newBuild';
  }

  let floors: number;
  let floorsFrom: DerivedLot['floorsFrom'];
  const levels = parseNum(tags['building:levels']);
  const height = parseNum(tags.height);
  if (levels !== undefined && levels >= 1) { floors = Math.round(levels); floorsFrom = 'levels'; }
  else if (height !== undefined && height > 0) { floors = Math.max(1, Math.round(height / STOREY_M)); floorsFrom = 'height'; }
  else if (pluto?.numFloors !== undefined) { floors = Math.max(1, Math.round(pluto.numFloors)); floorsFrom = 'pluto'; }
  else { floors = defaultFloors; floorsFrom = 'default'; }
  floors = Math.min(8, Math.max(1, floors));
  if (use === 'garage') floors = Math.min(floors, 2);

  const bits: string[] = [osmRef];
  bits.push(`${floors} fl (${floorsFrom})`);
  if (pluto) bits.push(`PLUTO ${[pluto.yearBuilt ? `built ${pluto.yearBuilt}` : '', pluto.landUse ? `LU ${pluto.landUse}` : '', pluto.bldgClass ?? ''].filter(Boolean).join(' ')}`.trim());
  const ad = addressOf(tags);
  if (ad) bits.push(`${ad.housenumber} ${ad.street}`);
  if (tags.name) bits.push(`"${tags.name}"`);

  const lot: LotJson = {
    widthM: round1(widthM),
    floors,
    use,
    confidence: floorsFrom === 'default' ? 'M' : 'H',
    note: `${IMPORT_MARK} ${bits.join(' · ')}`,
  };
  if (family) lot.family = family;
  if (storefront) lot.storefront = storefront;
  if (tags.construction !== undefined || b === 'construction') lot.scaffold = true;
  // depth is reported only when it looks like a real building depth
  if (depthM >= 4 && depthM <= 40) lot.depthM = round1(depthM);
  if (use === 'church') lot.storefront = 'church';
  return { lot, floorsFrom, vacant: false };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function vacantLot(widthM: number, why: string): LotJson {
  return { widthM: round1(widthM), floors: 0, family: 'vacant', use: 'vacant', confidence: 'M', note: `${IMPORT_MARK} ${why}` };
}

// ---------------------------------------------------------------- face layout

export interface FootprintItem {
  /** extent along the face (metres from the `from` end) */
  s0: number;
  s1: number;
  lot: LotJson;
  /** the derived lot's width is recomputed from the (de-overlapped) extent */
  ref: string;
}

export interface FaceLayout {
  /** lots in from -> to order with matching `[s0, s1]` intervals */
  items: Array<{ s0: number; s1: number; lot: LotJson }>;
  skippedTooNarrow: number;
  vacantGaps: number;
  split: number;
}

/**
 * Lay footprints along a face: sort, trim overlaps at the midpoint, turn gaps of at least MIN_VACANT_M into vacant lots,
 * share smaller gaps between the neighbours, split anything wider than MAX_LOT_M. Leading/trailing space is NOT filled
 * (the schema fits and fills the ends of a face itself).
 */
export function layoutFace(inItems: readonly FootprintItem[]): FaceLayout {
  const layout: FaceLayout = { items: [], skippedTooNarrow: 0, vacantGaps: 0, split: 0 };
  const items = inItems
    .filter((i) => {
      const ok = i.s1 - i.s0 >= MIN_LOT_M;
      if (!ok) layout.skippedTooNarrow++;
      return ok;
    })
    .map((i) => ({ s0: i.s0, s1: i.s1, lot: { ...i.lot } }))
    .sort((a, b) => (a.s0 + a.s1) - (b.s0 + b.s1));

  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i], b = items[i + 1];
    const gap = b.s0 - a.s1;
    if (gap < 0) { const mid = (a.s1 + b.s0) / 2; a.s1 = mid; b.s0 = mid; }
    else if (gap > 0 && gap < MIN_VACANT_M) { const mid = (a.s1 + b.s0) / 2; a.s1 = mid; b.s0 = mid; }
  }
  const out: FaceLayout['items'] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      const gap = it.s0 - prev.s1;
      if (gap >= MIN_VACANT_M) {
        layout.vacantGaps++;
        pushSplit(out, prev.s1, it.s0, vacantLot(gap, 'no OSM building in this gap'), layout);
      }
    }
    pushSplit(out, it.s0, it.s1, it.lot, layout);
  }
  layout.items = out;
  return layout;
}

function pushSplit(out: FaceLayout['items'], s0: number, s1: number, lot: LotJson, layout: FaceLayout): void {
  const w = s1 - s0;
  const n = Math.max(1, Math.ceil(w / MAX_LOT_M));
  if (n > 1) layout.split++;
  for (let k = 0; k < n; k++) {
    const a = s0 + (w * k) / n, b = s0 + (w * (k + 1)) / n;
    out.push({ s0: a, s1: b, lot: { ...lot, widthM: round1(b - a) } });
  }
}

// ---------------------------------------------------------------- merge

/** A lot is protected (kept on merge) when a human wrote something about it: any note that is not an auto/import note, or H/M confidence not set by the importer. */
export function isProtected(lot: Partial<LotJson>): boolean {
  const note = (lot.note ?? '').trim();
  if (note.startsWith(IMPORT_MARK)) return false;
  if (note && !AUTO_NOTE.test(note)) return true;
  if (lot.confidence === 'H' || lot.confidence === 'M') return true;
  return false;
}

export interface MergeStats { kept: number; replaced: number; added: number; styleInherited: number }

const STYLE_KEYS = ['family', 'stoop', 'stoopHeightM', 'cornice', 'bays', 'trees'] as const;

/**
 * Merge imported items over the existing lots of one face. Existing lots are laid onto the face proportionally
 * (their widths are fitted to the nominal span), protected ones always survive and push overlapping imported lots
 * out; unprotected ones are replaced by imported lots that overlap them, inheriting the style fields (family, stoop,
 * cornice, bays, trees) the OSM data does not know. With `overwrite` nothing is protected and nothing is inherited.
 */
export function mergeFace(
  existing: readonly LotJson[],
  imported: FaceLayout['items'],
  frame: Pick<FaceFrame, 'side' | 'length'>,
  overwrite: boolean,
): { lots: LotJson[]; stats: MergeStats } {
  const stats: MergeStats = { kept: 0, replaced: 0, added: 0, styleInherited: 0 };
  if (!imported.length) return { lots: existing.map((l) => ({ ...l })), stats };

  const ew = frame.side === 'E' || frame.side === 'W';
  let lo = ew ? 0 : NOMINAL_CORNER_M;
  let hi = ew ? frame.length : frame.length - NOMINAL_CORNER_M;
  const sum = existing.reduce((s, l) => s + l.widthM, 0) || 1;
  // Prefer the span the imported lots actually cover when the existing row is about as long: re-importing the importer's
  // own output (or a hand row that was fitted to the same frontage) then maps every lot back onto itself.
  const impLo = Math.min(...imported.map((i) => i.s0));
  const impHi = Math.max(...imported.map((i) => i.s1));
  if (sum >= 0.75 * (impHi - impLo) && sum <= 1.33 * (impHi - impLo)) { lo = impLo; hi = impHi; }
  const placed: Array<{ s0: number; s1: number; lot: LotJson; prot: boolean }> = [];
  let acc = 0;
  for (const l of existing) {
    const a = lo + (acc / sum) * (hi - lo);
    acc += l.widthM;
    const b = lo + (acc / sum) * (hi - lo);
    const prot = !overwrite && isProtected(l);
    // A hand note that starts with an address ("226 Hart: ...") pins the lot to the footprint carrying that address.
    const am = prot ? /^\s*(\d+[A-Za-z]?)\s+([A-Za-z]+)/.exec(l.note ?? '') : null;
    const hit = am ? imported.find((i) => (i.lot.note ?? '').toLowerCase().includes(`${am[1]} ${am[2]}`.toLowerCase())) : undefined;
    placed.push(hit ? { s0: hit.s0, s1: hit.s1, lot: l, prot } : { s0: a, s1: b, lot: l, prot });
  }

  const chosen: Array<{ s0: number; s1: number; lot: LotJson }> = [];
  for (const p of placed) if (p.prot) { chosen.push({ s0: p.s0, s1: p.s1, lot: { ...p.lot } }); stats.kept++; }

  const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  for (const imp of imported) {
    const w = imp.s1 - imp.s0;
    const blocked = chosen.some((c) => overlap(imp.s0, imp.s1, c.s0, c.s1) > 0.35 * Math.min(w, c.s1 - c.s0));
    if (blocked) continue;
    const lot: LotJson = { ...imp.lot };
    // overlapping unprotected existing lot supplies style
    let best: (typeof placed)[number] | undefined;
    let bestO = 0;
    for (const p of placed) {
      if (p.prot) continue;
      const o = overlap(imp.s0, imp.s1, p.s0, p.s1);
      if (o > bestO) { bestO = o; best = p; }
    }
    if (best) stats.replaced++; else stats.added++;
    if (!overwrite && best && lot.use !== 'vacant' && lot.use !== 'church' && best.lot.use !== 'vacant' && best.lot.use !== 'church') {
      let inherited = false;
      for (const k of STYLE_KEYS) {
        if (lot[k] === undefined && best.lot[k] !== undefined) { (lot as unknown as Record<string, unknown>)[k] = best.lot[k]; inherited = true; }
      }
      if (inherited) stats.styleInherited++;
    }
    chosen.push({ s0: imp.s0, s1: imp.s1, lot });
  }
  chosen.sort((a, b) => (a.s0 + a.s1) - (b.s0 + b.s1));
  const lots = chosen.map((c) => c.lot);

  // keep the row inside the face: scale down uniformly when it is longer than the nominal span
  const span = (ew ? frame.length : frame.length - 2 * NOMINAL_CORNER_M);
  const total = lots.reduce((s, l) => s + l.widthM, 0);
  if (total > span + 0.5 && span > 0) {
    const k = span / total;
    for (const l of lots) l.widthM = Math.max(3, round1(l.widthM * k));
  }
  return { lots, stats };
}

// ---------------------------------------------------------------- serializer

const indent = (text: string, pad: string): string => text.split('\n').map((l, i) => (i === 0 ? l : pad + l)).join('\n');

/**
 * Write bedstuy.json in the layout it already has (standard 2-space JSON for streets/pois, one face header line and one
 * lot per line for `faces`), so an importer run changes only the lines that really changed. A file read with
 * JSON.parse and written back with this function is byte-identical.
 */
export function formatBedstuyJson(root: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(root)) {
    if (k !== 'faces' || !Array.isArray(v)) {
      parts.push(`  ${JSON.stringify(k)}: ${indent(JSON.stringify(v, null, 2), '  ')}`);
      continue;
    }
    const faces = (v as Array<Record<string, unknown>>).map((f) => {
      const head = Object.entries(f).filter(([fk]) => fk !== 'lots' && fk !== 'pins')
        .map(([fk, fv]) => `${JSON.stringify(fk)}: ${JSON.stringify(fv)}`).join(', ');
      const lines = [`      ${head}`.replace(/^ {6}/, '      ')];
      const tail: string[] = [];
      if (Array.isArray(f.lots)) {
        tail.push(`      "lots": [\n${(f.lots as unknown[]).map((l) => `        ${JSON.stringify(l)}`).join(',\n')}\n      ]`);
      }
      if (Array.isArray(f.pins)) tail.push(`      "pins": ${indent(JSON.stringify(f.pins, null, 2), '      ')}`);
      return `    {\n${lines[0]}${tail.length ? ',\n' + tail.join(',\n') : ''}\n    }`;
    });
    parts.push(`  "faces": [\n${faces.join(',\n')}\n  ]`);
  }
  return `{\n${parts.join(',\n')}\n}\n`;
}
