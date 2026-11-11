/**
 * Real street-furniture positions (REAL PATH ONLY). `public/data/realmap-furniture.json` is written by
 * scripts/fetch-real-furniture.mjs and fetched lazily here; it is never imported, so the single-file artifact does not contain it
 * (there the fetch fails and the loader returns null).
 *
 * Coordinates are the sources' true positions in the REAL_FRAME grid (metres, +x east, +z south), stored as integer decimetres in the
 * file and returned here as metres. Nothing is snapped to a kerb: the consumer (propsReal.ts) clips to the sidewalk band.
 */
import { SPECIES_CLASSES } from '@/world/data/streetTrees';

export interface FurnitureJson {
  v: 1;
  unit: 'dm';
  hydrants: number[];
  busStops: number[];
  bikeDocks: number[];
  litter: number[];
  linknyc: number[];
  trees: number[];
}

export interface RealFurniture {
  /** x,z pairs in metres */
  hydrants: Float32Array;
  busStops: Float32Array;
  litter: Float32Array;
  linknyc: Float32Array;
  /** x,z,capacity triples (capacity in docks) */
  bikeDocks: Float32Array;
  /** x,z pairs in metres plus parallel per-tree arrays */
  trees: { xz: Float32Array; dbhIn: Uint8Array; species: Uint8Array };
}

const pairs = (a: readonly number[]): Float32Array => { const o = new Float32Array(a.length - (a.length % 2)); for (let i = 0; i < o.length; i++) o[i] = a[i] / 10; return o; };

export function decodeFurniture(j: FurnitureJson): RealFurniture {
  const dock = new Float32Array(j.bikeDocks.length - (j.bikeDocks.length % 3));
  for (let i = 0; i < dock.length; i += 3) { dock[i] = j.bikeDocks[i] / 10; dock[i + 1] = j.bikeDocks[i + 1] / 10; dock[i + 2] = j.bikeDocks[i + 2]; }
  const n = Math.floor(j.trees.length / 3);
  const xz = new Float32Array(n * 2), dbhIn = new Uint8Array(n), species = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    xz[2 * i] = j.trees[3 * i] / 10; xz[2 * i + 1] = j.trees[3 * i + 1] / 10;
    const packed = j.trees[3 * i + 2];
    dbhIn[i] = Math.min(255, packed >> 4); species[i] = Math.min(SPECIES_CLASSES.length - 1, packed & 15);
  }
  return { hydrants: pairs(j.hydrants), busStops: pairs(j.busStops), litter: pairs(j.litter), linknyc: pairs(j.linknyc), bikeDocks: dock, trees: { xz, dbhIn, species } };
}

let cached: Promise<RealFurniture | null> | null = null;
/** One fetch per page; null when the file is absent (single-file artifact) or malformed. */
export function loadRealFurniture(fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined, baseUrl?: string): Promise<RealFurniture | null> {
  if (cached) return cached;
  if (!fetcher) return Promise.resolve(null);
  const base = baseUrl ?? (() => { try { return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'; } catch { return '/'; } })();
  cached = fetcher(`${base}data/realmap-furniture.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: FurnitureJson | null) => (j && j.v === 1 && j.unit === 'dm' && Array.isArray(j.hydrants) && Array.isArray(j.trees) ? decodeFurniture(j) : null))
    .catch(() => null);
  return cached;
}
export function resetFurnitureCache(): void { cached = null; }
