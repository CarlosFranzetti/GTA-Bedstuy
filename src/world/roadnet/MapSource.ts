/**
 * WP0: the `?map=real` switch (docs/swarm/plans/realmap.md section 7).
 *
 * `mapKindFromSearch(location.search)` reads the flag; `loadMapSource(search, grid)` returns the street model the consumers
 * should use: on the default grid map the RoadNet is the grid adapter (built lazily, so the default boot does no extra work),
 * on `?map=real` it is the NYC-centreline network decoded from `roadnet-core.json`.
 *
 * The core JSON is a dynamic import: the default code path never touches it. The single-file artifact inlines the chunk
 * (30 kB raw, allowed by realmap.md section 5); the hosted build emits a separate lazy chunk fetched only on `?map=real`.
 */
import type { GridModel } from '@/world/types';
import { RoadNet, roadNetFromGrid } from './RoadNet';
import type { RoadNetJson } from './codec';

export type MapKind = 'grid' | 'real';

export interface MapSource {
  kind: MapKind;
  /** the street network: the grid adapter on 'grid', the real centrelines on 'real' */
  readonly net: RoadNet;
  /** the stylised grid, when the caller has one (always on 'grid'; on 'real' only while consumers still need it) */
  grid?: GridModel;
}

/** 'real' only for `?map=real` (case-insensitive value); everything else, including a missing or unknown value, is the grid. */
export function mapKindFromSearch(search: string): MapKind {
  try {
    const v = new URLSearchParams(search).get('map');
    return v !== null && v.toLowerCase() === 'real' ? 'real' : 'grid';
  } catch { return 'grid'; }
}

/** 'r123' is the game's map (R1+R2 plus the seven-block ring R3, roadnet-r123.json); 'r1r2' is the first two rings only (roadnet-core.json, kept for the tests that pin its counts). */
export type RealExtent = 'r123' | 'r1r2';
const realNets: Partial<Record<RealExtent, Promise<RoadNet>>> = {};

/** Decode a shipped network (default: the whole real map). Cached; safe to call twice. */
export function loadRoadNet(extent: RealExtent = 'r123'): Promise<RoadNet> {
  return (realNets[extent] ??= (extent === 'r123' ? import('@/world/data/roadnet-r123.json') : import('@/world/data/roadnet-core.json'))
    .then((m) => RoadNet.fromJson((m.default ?? m) as unknown as RoadNetJson)));
}

/** The grid as a MapSource; the RoadNet adapter is built on first use of `.net`. */
export function gridMapSource(grid: GridModel): MapSource {
  let net: RoadNet | null = null;
  return { kind: 'grid', grid, get net(): RoadNet { return (net ??= roadNetFromGrid(grid)); } };
}

/**
 * Pick the map for this page load. `grid` is the already built grid world (main.ts has it before this point); it is passed
 * through on both maps so unmigrated consumers keep working.
 */
export async function loadMapSource(search: string, grid: GridModel): Promise<MapSource> {
  if (mapKindFromSearch(search) === 'grid') return gridMapSource(grid);
  return { kind: 'real', net: await loadRoadNet(), grid };
}
