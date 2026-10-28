import { it } from 'vitest';
import * as THREE from 'three';
import { buildWorld } from '@/world/WorldBuilder';
import { loadBedstuyData } from '@/world/Grid';
import { Rng } from '@/core/Rng';
it('measure', async () => {
  const data = loadBedstuyData(); const rng = new Rng(data.seed);
  const cache = new Map<string, THREE.Material>(); const mk = (k: string) => { let m = cache.get(k); if (!m) { m = new THREE.MeshStandardMaterial(); m.name = k; cache.set(k, m); } return m; };
  const mats = { get: (k: string, v = 0) => mk(k + v), awning: (c: string, t: string) => mk('aw' + c), sign: (t: string) => mk('sign' + t), carPaint: (c: string) => mk(c), setNight() {} };
  const t0 = performance.now();
  const { buildBuildings } = await import('@/world/BuildingGen');
  const { buildGrid } = await import('@/world/Grid');
  const { subdivideLots } = await import('@/world/LotSubdivider');
  const { splitMeshesIntoCells } = await import('@/render/Culling');
  const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, rng.fork('lots'));
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1200);
  const spots: Array<[number, number, number, number]> = [[0, 10, 0, 0], [-120, 60, 40, 0.8], [125, 60, 110, 2.5], [10, 25, -140, 4.0]];
  for (const [cx, cz] of [[1e9, 1e9], [250, 200], [250, 100], [125, 100], [125, 200]]) {
    const b = buildBuildings(lots, mats as never, rng.fork('buildings'));
    if (cx < 1e8) splitMeshesIntoCells(b.group, cx, cz);
    let draws = 0, tris = 0, n = 0;
    const f = new THREE.Frustum(), m = new THREE.Matrix4();
    for (const [x, y, z, a] of spots) {
      cam.position.set(x, y, z); cam.lookAt(x + Math.sin(a) * 50, 3, z - Math.cos(a) * 50); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); f.setFromProjectionMatrix(m);
      for (const o of b.group.children) { const me = o as THREE.Mesh; if (!me.geometry.boundingSphere) me.geometry.computeBoundingSphere(); if (f.intersectsSphere(me.geometry.boundingSphere!)) { draws++; tris += me.geometry.index ? me.geometry.index.count / 3 : me.geometry.attributes.position.count / 3; } }
      n++;
    }
    console.log('cell', cx, cz, 'avg draws', draws / n, 'avg tris', Math.round(tris / n));
  }
});
