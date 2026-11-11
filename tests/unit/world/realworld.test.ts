/** REALWORLD: the assembled real-map world builds, is walkable (spawn on a sidewalk, colliders), and measures. Stub material library. */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { buildRealWorld, measureWorld } from '@/world/roadnet/realWorld';

function stubLib(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const mk = (): THREE.Material => new THREE.MeshBasicMaterial();
  return {
    get(key, variant = 0) { const k = `${key}:${variant}`; let m = cache.get(k); if (!m) { m = mk(); m.name = k; cache.set(k, m); } return m; },
    awning: mk, sign: mk, carPaint: mk, setNight: () => undefined,
  } as IMaterialLibrary;
}

describe('buildRealWorld', () => {
  it('assembles roads, buildings, el and a spawn; reports counts', async () => {
    const rw = await buildRealWorld({ materials: stubLib(), rng: new Rng(7), tier: 'high' });
    console.log('[realworld]', JSON.stringify({ standIns: rw.standIns, stats: rw.stats, spawn: rw.spawn, lots: rw.lots.length, chunkMeshes: rw.chunkMeshes.length }));
    for (const r of [64, 128, 256, 512]) console.log(`[realworld] radius ${r}`, JSON.stringify(measureWorld(rw.group, rw.spawn, r)));
    expect(rw.group.getObjectByName('roads-real')).toBeTruthy();
    expect(rw.stats.triangles).toBeGreaterThan(100000);
    expect(rw.colliders.length).toBeGreaterThan(100);
    expect(rw.sidewalks.graph.nodes).toBeTruthy();
    expect(Number.isFinite(rw.spawn.x)).toBe(true);
  }, 120000);

  it('falls back to stand-ins when asked and still builds', async () => {
    const rw = await buildRealWorld({ materials: stubLib(), rng: new Rng(7), forceStandIns: true });
    expect(rw.standIns.length).toBe(2);
    expect(rw.group.getObjectByName('roads-standin')).toBeTruthy();
    expect(rw.colliders.length).toBeGreaterThan(100);
  }, 120000);
});
