import { it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildProps } from '@/world/PropsGen';
it('probe', () => {
  const data = loadBedstuyData(); const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
  const c = new Map<string, THREE.Material>();
  const lib: any = { get: (k: string, v = 0) => { const n = k + v; if (!c.has(n)) c.set(n, new THREE.MeshBasicMaterial()); return c.get(n); }, awning: () => new THREE.MeshBasicMaterial(), sign: () => new THREE.MeshBasicMaterial(), carPaint: () => new THREE.MeshBasicMaterial(), setNight() {} };
  const o = buildProps(grid, lots, lib, new Rng(1234));
  const kinds: Record<string, number> = {}; for (const p of o.clutter.placements) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
  const meshes: string[] = []; o.group.traverse((m) => { if ((m as THREE.Mesh).isMesh) { const g = (m as THREE.Mesh).geometry; meshes.push(m.name + ' ' + (g.index ? g.index.count / 3 : 0)); } });
  console.log(JSON.stringify({ faces: grid.blocks.length * 4, lots: lots.length, bodega: lots.filter((l) => l.poi?.archetype === 'bodega').length, mixed: lots.filter(l=>l.type==='mixeduse').length, kinds, tris: o.clutter.tris, meshes }, null, 1));
});
