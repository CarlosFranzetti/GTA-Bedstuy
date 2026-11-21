import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { loadBedstuyData, buildGrid } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { buildWorld } from '@/world/WorldBuilder';
import { buildBuildings } from '@/world/BuildingGen';
import { STREAM_MESH } from '@/world/BuildingStream';
import { setBatchSkip } from '@/world/buildings/facade';
import { PHONE_HIDDEN_MESH } from '@/render/TierGeometry';
import { ChunkCuller, chunkRangeFor } from '@/render/Culling';
import type { IMaterialLibrary } from '@/world/types';

/** Materials named by their request, one per distinct call, so mesh names match the real library's (`buildings:limestone:0`). */
function namedMaterials(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  return new Proxy({}, {
    get: (_t, method) => (...args: unknown[]) => {
      const id = `${String(method)}:${args.map(String).join(':')}`;
      let m = cache.get(id);
      if (!m) { m = new THREE.MeshStandardMaterial(); m.name = String(method) === 'get' ? `${String(args[0])}:${Number(args[1] ?? 0)}` : id; cache.set(id, m); }
      return m;
    },
  }) as unknown as IMaterialLibrary;
}

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;

describe('phone tier: buildings built per cell on demand', () => {
  const data = loadBedstuyData();
  const world = buildWorld(data, namedMaterials(), new Rng(data.seed), 'phone');
  const shells = world.chunkMeshes.filter((m) => STREAM_MESH.test(m.name));

  it('boots with empty shells and no streamed geometry in memory', () => {
    expect(world.stream).not.toBeNull();
    expect(shells.length).toBeGreaterThan(20);
    for (const s of shells) {
      expect(s.geometry.attributes.position.count).toBe(0);
      expect(typeof s.userData.cell).toBe('string');
      expect(s.userData.chunk).toBe(s.userData.cell);
      expect(s.geometry.boundingBox).not.toBeNull();
    }
    expect(world.stream!.stats().resident).toBe(0);
  });

  it('keeps the colliders of the whole city', () => {
    const grid = buildGrid(data);
    const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces());
    expect(lots.length).toBeGreaterThan(100);
    expect(world.colliders.length).toBeGreaterThan(lots.length);
  });

  it('builds the same triangles per material as one city-wide build, and the same again after being freed', () => {
    const stream = world.stream!;
    const keys = [...new Set(shells.map((s) => s.userData.cell as string))];
    for (const k of keys) while (!stream.request(k, 1000)) { /* fill */ }
    const perName = new Map<string, number>();
    for (const s of shells) perName.set(s.name, (perName.get(s.name) ?? 0) + tris(s.geometry));
    expect(stream.stats().resident).toBe(keys.length);

    // reference: the whole city in one build with the same lots, seeds and skipped classes
    const grid = buildGrid(data);
    const root = new Rng(data.seed);
    root.fork('lots'); // same stream position as buildWorld
    const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces());
    const mats = namedMaterials();
    setBatchSkip((n) => PHONE_HIDDEN_MESH.test('buildings:' + n));
    const full = buildBuildings(lots, mats, new Rng(data.seed).fork('buildings'));
    setBatchSkip(null);
    const ref = new Map<string, number>();
    for (const m of full.group.children as THREE.Mesh[]) if (STREAM_MESH.test(m.name)) ref.set(m.name, tris(m.geometry));
    // the Rng stream position differs from buildWorld's (its other forks come first), so compare totals, not lot-by-lot: both are the same city
    const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
    expect(sum(perName)).toBeGreaterThan(100_000);
    expect(new Set(perName.keys())).toEqual(new Set(ref.keys()));
    expect(Math.abs(sum(perName) - sum(ref)) / sum(ref)).toBeLessThan(0.08);

    // freed cells give back their memory and come back identical
    const k0 = keys[0];
    const before = shells.filter((s) => s.userData.cell === k0).map((s) => [s.name, tris(s.geometry)] as const);
    const disposed: THREE.BufferGeometry[] = [];
    for (const s of shells.filter((x) => x.userData.cell === k0)) { const g = s.geometry; g.addEventListener('dispose', () => disposed.push(g)); }
    stream.evict(k0);
    expect(disposed.length).toBe(before.length);
    for (const s of shells.filter((x) => x.userData.cell === k0)) expect(s.geometry.attributes.position.count).toBe(0);
    expect(stream.isResident(k0)).toBe(false);
    while (!stream.request(k0, 1000)) { /* rebuild */ }
    const after = shells.filter((s) => s.userData.cell === k0).map((s) => [s.name, tris(s.geometry)] as const);
    expect(after).toEqual(before);
    for (const k of keys) stream.evict(k);
    expect(stream.stats().resident).toBe(0);
  });

  it('is time sliced: a tiny budget needs several calls and swaps nothing in until the cell is whole', () => {
    const stream = world.stream!;
    const k = [...new Set(shells.map((s) => s.userData.cell as string))][3];
    let calls = 0;
    while (!stream.request(k, 0.0001)) { calls++; expect(shells.filter((s) => s.userData.cell === k).every((s) => s.geometry.attributes.position.count === 0)).toBe(true); if (calls > 5000) throw new Error('never finished'); }
    expect(calls).toBeGreaterThan(1);
    stream.evict(k);
  });

  it('ChunkCuller builds cells near the player and frees them when he leaves', () => {
    const stream = world.stream!;
    const culler = new ChunkCuller(chunkRangeFor('phone'));
    for (const m of world.chunkMeshes) culler.add(m);
    ChunkCuller.streamBudget = 1e9;
    try {
      const home = shells[0].geometry.boundingBox!.getCenter(new THREE.Vector3());
      culler.update(home.x, home.z);
      expect(stream.stats().resident).toBeGreaterThan(0);
      const near = stream.stats().resident;
      expect(near).toBeLessThan(shells.length); // not the whole city
      // far outside the map: everything is freed
      culler.update(home.x + 5000, home.z + 5000);
      expect(stream.stats().resident).toBe(0);
      expect(stream.stats().evictions).toBeGreaterThan(0);
    } finally { ChunkCuller.streamBudget = 6; }
  });
});
