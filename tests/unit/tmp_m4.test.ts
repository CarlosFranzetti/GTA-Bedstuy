import { it } from 'vitest';
import * as THREE from 'three';
import { buildWorld } from '@/world/WorldBuilder';
import { loadBedstuyData } from '@/world/Grid';
import { Rng } from '@/core/Rng';
import { MaterialLibrary } from '@/textures/MaterialLibrary';
it('measure', () => {
  const data = loadBedstuyData(); const rng = new Rng(data.seed);
  const mats = new MaterialLibrary(rng.fork('materials'));
  const t0 = performance.now();
  const w = buildWorld(data, mats as never, rng);
  console.log('build ms', performance.now() - t0, JSON.stringify(w.stats), w.propCells.length);
  for (const g of [w.group]) g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.parent && o.parent !== w.group) {} });
  const per: Record<string, { n: number; tris: number; maxR: number }> = {};
  w.group.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const k = o.parent!.name; const e = (per[k] ??= { n: 0, tris: 0, maxR: 0 }); e.n++; e.tris += (m.geometry.index?.count ?? 0) / 3; e.maxR = Math.max(e.maxR, m.geometry.boundingSphere?.radius ?? 0); });
  console.log(JSON.stringify(per));
});
