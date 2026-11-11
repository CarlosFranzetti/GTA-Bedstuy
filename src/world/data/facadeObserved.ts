/**
 * Observed facade facts per lot, keyed by NYC tax-lot id (BBL), derived by scripts/derive-facade-palette.mjs from openly licensed
 * street photos (Mapillary / KartaView / Wikimedia Commons; licences and authors in facade-observed.provenance.json, which is not
 * bundled). Value format in the JSON: `<rrggbb wall>:<material index>:<quality 0-100>[:<rrggbb awning>]`.
 * Lots without an entry keep the procedural per-lot colourway (src/world/buildings/colourway.ts).
 */
import observed from './facade-observed.json';
import { ENV14_ON } from './env14';

export type ObservedMaterial = 'brownstone' | 'redBrick' | 'tanBrick' | 'paintedBrick' | 'limestone' | 'siding' | 'stucco' | 'panel';
export interface ObservedFacade {
  /** wall colour, sRGB bytes */
  wall: [number, number, number];
  material: ObservedMaterial;
  /** 0..1 */
  quality: number;
  awning?: [number, number, number];
}

export const OBSERVED_MATERIALS = observed.materials as readonly ObservedMaterial[];
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

/** Parse one compact record; returns null for anything malformed. */
export function parseObserved(rec: string, materials: readonly string[] = OBSERVED_MATERIALS): ObservedFacade | null {
  const p = rec.split(':');
  if (p.length < 3 || !/^[0-9a-f]{6}$/i.test(p[0])) return null;
  const material = materials[Number(p[1])] as ObservedMaterial | undefined;
  const q = Number(p[2]);
  if (!material || !Number.isFinite(q)) return null;
  return { wall: hexRgb(p[0]), material, quality: Math.min(1, Math.max(0, q / 100)), awning: p[3] && /^[0-9a-f]{6}$/i.test(p[3]) ? hexRgb(p[3]) : undefined };
}

const cache = new Map<string, ObservedFacade | null>();
/** The observed facade of a lot, or null when no photo evidence reached the quality bar. */
export function observedFacade(bbl: string | undefined, table: Readonly<Record<string, string>> = observed.lots as Record<string, string>, minQuality = 0.45): ObservedFacade | null {
  if (!bbl || !ENV14_ON) return null;
  const hit = table[bbl];
  if (!hit) return null;
  const key = table === (observed.lots as unknown) ? bbl : `${bbl}|${hit}`;
  let o = cache.get(key);
  if (o === undefined) { o = parseObserved(hit); cache.set(key, o); }
  return o && o.quality >= minQuality ? o : null;
}

/** Wall family and look the observed material class maps onto (what the lot generators can draw). */
export const FAMILY_FOR_OBSERVED: Record<ObservedMaterial, { family: 'brownstone' | 'brick' | 'tanBrick' | 'paintedBrick' | 'limestone'; look?: 'frame' | 'newBuild' }> = {
  brownstone: { family: 'brownstone' },
  redBrick: { family: 'brick' },
  tanBrick: { family: 'tanBrick' },
  paintedBrick: { family: 'paintedBrick' },
  limestone: { family: 'limestone' },
  siding: { family: 'paintedBrick', look: 'frame' },
  stucco: { family: 'paintedBrick' },
  panel: { family: 'paintedBrick', look: 'newBuild' },
};

/**
 * `looks(bbl)` for the real-map building builder (BLDGREAL `opts.looks`): the wall family and look of an observed lot, or undefined.
 * The builder must also put `bbl` on the spec it passes to the colourway (`spec.bbl`) so the observed wall colour applies.
 */
export function observedLook(bbl: string): { family: 'brownstone' | 'brick' | 'tanBrick' | 'paintedBrick' | 'limestone'; look?: 'frame' | 'newBuild'; bbl: string } | undefined {
  const o = observedFacade(bbl);
  return o ? { ...FAMILY_FOR_OBSERVED[o.material], bbl } : undefined;
}
