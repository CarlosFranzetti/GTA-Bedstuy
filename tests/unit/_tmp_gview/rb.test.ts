// @ts-nocheck
import { it } from 'vitest';
import * as THREE from 'three';
import { buildRoads } from '@/world/RoadBuilder';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
it('real grid', () => {
  const grid = buildGrid(loadBedstuyData());
  const cache = new Map();
  const lib = { get: (k, v = 0) => { const id = k + ':' + v; if (!cache.has(id)) cache.set(id, new THREE.MeshBasicMaterial({ name: id })); return cache.get(id); }, awning: () => new THREE.MeshBasicMaterial(), sign: () => new THREE.MeshBasicMaterial(), carPaint: () => new THREE.MeshBasicMaterial(), setNight() {} };
  const t0 = Date.now();
  const { group } = buildRoads(grid, lib);
  const names = []; group.traverse((o) => { if (o.isMesh) names.push(o.name + ':' + o.material.name + ':' + o.geometry.getAttribute('position').count); });
  console.log('meshes', names.length, Date.now() - t0, 'ms\n' + names.join('\n'));
  console.log('rows', [...new Set(grid.blocks.map((b) => b.row))]);
});
