/**
 * REALBLOCKS: style by data. One place that turns a lot's recorded facts (year built, building class, frontage, floors, footprint
 * roof height, tax-lot number) into the style of the row house or walk-up the generators draw, so a block's rhythm follows the real
 * block: rows built in one year by one developer share a family, a cornice and a stoop height; doors pair up along the row;
 * a wood-frame house (class A) is siding. Both maps use it (`specForRealLot` and `specFromData`); nothing here is random.
 *
 * Source of the rules: LPC historic district designation reports (Bedford, Expanded Stuyvesant Heights) as summarised in
 * docs/reference/block-faces.md and bedstuy-surfaces.md: Italianate to about 1875, neo-Grec 1875 to 1889, Romanesque Revival and
 * Queen Anne 1885 to 1900, neo-Renaissance and plain walk-ups to 1930. The numbers are style rules of thumb, not measurements.
 *
 * PLUTO writes 1931 for a building whose year it does not know, so 1931 means "pre-1931, unknown" and keeps the older odds.
 */
import type { CorniceKind, LotSpec, MaterialFamily } from './facade';

export type StyleName = 'italianate' | 'neoGrec' | 'romanesque' | 'walkup' | 'prewar' | 'postwar' | 'modern' | 'frame' | 'other';

export interface EraFacts {
  /** NYC tax lot id, 10 digits: borough + block (5) + lot (4) */
  bbl?: string;
  yr?: number | null;
  cls?: string;
  /** PLUTO number of floors and building-footprint roof height (m) */
  fl?: number | null;
  rf?: number | null;
}

const STOREY = 3.1;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Same block and same year: one number, so a row built in one go shares its material. */
export function rowKey(bbl: string | undefined, yr: number): number {
  return hash01(`${(bbl ?? '').slice(0, 6)}:${yr}`);
}

/** tax-lot number (last 4 digits of the BBL), or -1 */
export function lotNumber(bbl: string | undefined): number {
  const n = bbl && bbl.length >= 10 ? Number.parseInt(bbl.slice(6, 10), 10) : NaN;
  return Number.isFinite(n) ? n : -1;
}

export function styleOf(f: EraFacts): StyleName {
  const yr = f.yr ?? 0;
  const c0 = (f.cls ?? '').toUpperCase()[0] ?? '';
  if (yr >= 1990) return 'modern';
  if (c0 === 'A' && (!yr || yr < 1935)) return 'frame';
  if (yr && yr < 1876) return 'italianate';
  if (yr && yr < 1888) return 'neoGrec';
  if (yr && yr < 1901) return 'romanesque';
  if (yr === 1931 || !yr) return 'prewar';
  if (yr < 1931) return 'walkup';
  if (yr < 1990) return 'postwar';
  return 'other';
}

/**
 * Floors from the record. PLUTO's floor count is wrong now and then on small buildings (a 6 "floor" row house under an 11 m roof);
 * where the footprint roof height says the building is at least two storeys lower, and the class is a house or walk-up (not an
 * elevator apartment block, whose roof height is often a bulkhead), the roof height wins.
 */
export function reconcileFloors(fl: number, f: EraFacts): number {
  const c0 = (f.cls ?? '').toUpperCase()[0] ?? '';
  if (!f.rf || f.rf < 5 || !'ABCS'.includes(c0)) return fl;
  const byRoof = Math.max(2, Math.round(f.rf / STOREY));
  return fl - byRoof >= 2 ? byRoof : fl;
}

function pick(u: number, table: ReadonlyArray<[MaterialFamily, number]>): MaterialFamily {
  let t = u;
  for (const [fam, w] of table) { t -= w; if (t < 0) return fam; }
  return table[table.length - 1][0];
}

/**
 * Style a residential, mixed or apartment spec from its facts. Never touches vacant lots, churches or institutions, floors that
 * the record gives, the shop of a mixed-use lot, or a family the observed-facade layer decides (the caller merges that after).
 */
export function applyEraStyle(spec: LotSpec, f: EraFacts, opts: { keepFamily?: boolean } = {}): LotSpec {
  if (spec.use !== 'residential' && spec.use !== 'mixed' && spec.use !== 'apartment') return spec;
  const yr = f.yr ?? 0;
  const style = styleOf(f);
  const u = rowKey(f.bbl, yr);
  const out: LotSpec = { ...spec };
  const row = spec.use === 'residential';
  if (spec.floors > 0) out.floors = reconcileFloors(spec.floors, f);
  const narrow = spec.widthM <= 5.4;
  const wide = spec.widthM >= 7.4;

  if (!opts.keepFamily && spec.look !== 'newBuild') {
    let fam: MaterialFamily | null = null;
    switch (style) {
      case 'italianate': fam = pick(u, [['brownstone', 0.82], ['limestone', 0.08], ['brick', 0.1]]); break;
      case 'neoGrec': fam = pick(u, [['brownstone', 0.7], ['brick', 0.2], ['limestone', 0.1]]); break;
      case 'romanesque': fam = pick(u, [['brownstone', 0.5], ['brick', 0.3], ['tanBrick', 0.12], ['limestone', 0.08]]); break;
      case 'walkup': fam = pick(u, [['brick', 0.5], ['tanBrick', 0.22], ['limestone', 0.14], ['brownstone', 0.14]]); break;
      case 'postwar': fam = pick(u, [['tanBrick', 0.6], ['brick', 0.28], ['paintedBrick', 0.12]]); break;
      case 'frame': fam = 'paintedBrick'; out.look = 'frame'; break;
      default: break;
    }
    if (fam) out.family = fam;
  }

  const family = out.family;
  if (row || spec.use === 'mixed') {
    const bound: CorniceKind = style === 'italianate' || style === 'neoGrec' ? 'bracket' : style === 'romanesque' ? 'dentil'
      : style === 'walkup' || (style === 'prewar' && yr !== 1931) ? 'plain' : style === 'prewar' ? (spec.cornice === 'none' ? 'plain' : spec.cornice) : 'none';
    out.cornice = style === 'frame' || style === 'modern' || style === 'postwar' ? 'none' : bound;
  }
  if (row && spec.stoop.present) {
    // raised-basement rows: the older and grander the row, the higher the parlour floor
    const base = style === 'italianate' ? 1.95 : style === 'neoGrec' ? 1.8 : style === 'romanesque' ? 1.65 : style === 'frame' ? 1.0 : 1.3;
    const jitter = (hash01(`${f.bbl ?? ''}:stoop`) - 0.5) * 0.12; // a row shares its height to within a few centimetres
    out.stoop = { present: true, heightM: Math.round((base + jitter + (wide ? 0.05 : 0)) * 100) / 100 };
    // brownstone and Romanesque parlour windows: round arches on the oldest rows and half the 1890s ones
    if (family === 'brownstone') out.arched = style === 'italianate' || (style === 'romanesque' && u < 0.55) || (style === 'neoGrec' && u < 0.2);
    // paired doors: odd and even tax lots mirror each other, so the doors meet in twos along the row
    const n = lotNumber(f.bbl);
    if (n >= 0) out.doorLeft = n % 2 === 1;
  }
  if (spec.bays === undefined && (row || spec.use === 'mixed')) out.bays = narrow ? 2 : style === 'italianate' && wide ? 4 : 3;
  return out;
}
