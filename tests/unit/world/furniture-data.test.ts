import { describe, it, expect, beforeEach } from 'vitest';
import { decodeFurniture, loadRealFurniture, resetFurnitureCache, type FurnitureJson } from '@/world/roadnet/furnitureData';
import { observedLook } from '@/world/data/facadeObserved';
import type { LotSpec } from '@/world/buildings/facade';
import observed from '@/world/data/facade-observed.json';

const fixture: FurnitureJson = { v: 1, unit: 'dm', hydrants: [100, -250, 5, 6], busStops: [10, 20], bikeDocks: [1000, 2000, 31], litter: [], linknyc: [7, 8], trees: [300, 400, 12 * 16 + 8, 1, 2, 3 * 16 + 1] };

describe('real furniture data', () => {
  beforeEach(() => resetFurnitureCache());
  it('decodes decimetres to metres, docks with capacity, trees with size and species', () => {
    const f = decodeFurniture(fixture);
    expect(Array.from(f.hydrants)).toEqual([10, -25, 0.5, 0.6].map((v) => Math.fround(v)));
    expect(Array.from(f.bikeDocks)).toEqual([100, 200, 31]);
    expect(f.trees.dbhIn[0]).toBe(12); expect(f.trees.species[0]).toBe(8);
    expect(f.trees.dbhIn[1]).toBe(3); expect(f.trees.species[1]).toBe(1);
    expect(f.litter.length).toBe(0);
  });
  it('loads through the given fetcher and caches; null when the file is missing (single-file build) or malformed', async () => {
    let calls = 0;
    const ok = (async (u: string) => { calls++; expect(u).toBe('/x/data/realmap-furniture.json'); return { ok: true, json: async () => fixture }; }) as unknown as typeof fetch;
    const a = await loadRealFurniture(ok, '/x/');
    expect(a?.trees.dbhIn.length).toBe(2);
    await loadRealFurniture(ok, '/x/');
    expect(calls).toBe(1);
    resetFurnitureCache();
    expect(await loadRealFurniture((async () => ({ ok: false })) as unknown as typeof fetch, '/')).toBeNull();
    resetFurnitureCache();
    expect(await loadRealFurniture((async () => ({ ok: true, json: async () => ({ v: 2 }) })) as unknown as typeof fetch, '/')).toBeNull();
    resetFurnitureCache();
    expect(await loadRealFurniture((async () => { throw new Error('offline'); }) as unknown as typeof fetch, '/')).toBeNull();
  });
});

describe('observedLook plugs into the real-map looks hook', () => {
  it('returns a partial spec with family, look and bbl for an observed lot, undefined otherwise', () => {
    const bbl = Object.keys(observed.lots)[0];
    const l = observedLook(bbl);
    expect(l?.bbl).toBe(bbl);
    expect(['brownstone', 'brick', 'tanBrick', 'paintedBrick', 'limestone']).toContain(l?.family);
    expect(observedLook('0000000000')).toBeUndefined();
  });
});

// compile-time proof that it fits the hook of buildRealBuildings / RealBuildingStreamer
export const _hook: (bbl: string) => Partial<LotSpec> | undefined = observedLook;
