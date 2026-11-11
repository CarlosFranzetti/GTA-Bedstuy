import { it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLotsDetailed } from '@/world/roadnet/lotsReal';
import { buildRealBuildings } from '@/world/roadnet/buildingsReal';
import { chunkLayoutFromBounds } from '@/world/roadnet/chunksReal';
import { chunkKeyOf } from '@/render/Culling';
class Stub implements IMaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private mk(k: string) { let m = this.cache.get(k); if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.cache.set(k, m); } return m; }
  get(key: MaterialKey, v = 0) { return this.mk(key + ':' + v); }
  awning(c: string, t: string) { return this.mk('awning:' + c + ':' + t); }
  sign(t: string, b = '', f = '') { return this.mk('sign:' + t + ':' + b + ':' + f); }
  carPaint(c: string) { return this.mk('car:' + c); }
  setNight() {}
}
it('explore', async () => {
  const out: string[] = [];
  const core = (await import('@/world/data/roadnet-core.json')).default as any;
  const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as any;
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net);
  const placed = placeLotsDetailed(net, d, blockFaces(net, d), lotsJson).lots.filter((l) => l.ph === 'R1');
  const layout = chunkLayoutFromBounds(net.bounds);
  const by = new Map<string, any[]>();
  for (const l of placed) { const k = chunkKeyOf(layout, (l.frontA.x + l.frontB.x) / 2, (l.frontA.z + l.frontB.z) / 2); (by.get(k) ?? by.set(k, []).get(k)!).push(l); }
  out.push('lots ' + placed.length + ' chunks ' + by.size + ' sizes ' + [...by.values()].map((v) => v.length).sort((a, b) => b - a).slice(0, 10).join(','));
  const big = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const big2 = layout;
  const huge = { ...layout, cellX: 1e6, cellZ: 1e6 };
  const t0 = performance.now();
  const r = buildRealBuildings(big[1], new Stub(), new Rng(7), { layout: huge });
  out.push('chunk ' + big[0] + ' lots ' + big[1].length + ' ms ' + (performance.now() - t0).toFixed(0) + ' tris ' + r.stats.triangles + ' meshes ' + r.stats.meshes + ' colliders ' + r.colliders.length);
  // joint vs single-lot builds: per-material triangle counts and position checksums
  const sum = (g: THREE.Object3D) => { const m = new Map<string, string>(); g.traverse((o: any) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; let sx = 0, sz = 0, sy = 0; for (let i = 0; i < pos.count; i++) { sx += pos.getX(i); sy += pos.getY(i); sz += pos.getZ(i); } const k = o.name; const prev = m.get(k); m.set(k, (prev ? prev + '+' : '') + pos.count + ':' + sx.toFixed(1) + ':' + sy.toFixed(1) + ':' + sz.toFixed(1)); }); return m; };
  const joint = sum(r.group);
  const accum = new Map<string, number[]>();
  const t1 = performance.now(); let nmesh = 0;
  const sm = new Stub();
  for (const l of big[1]) { const rr = buildRealBuildings([l], sm, new Rng(7), { layout: huge }); rr.group.traverse((o: any) => { if (!o.isMesh) return; nmesh++; const pos = o.geometry.attributes.position; let sx = 0, sy = 0, sz = 0; for (let i = 0; i < pos.count; i++) { sx += pos.getX(i); sy += pos.getY(i); sz += pos.getZ(i); } const a2 = accum.get(o.name) ?? [0, 0, 0, 0]; a2[0] += pos.count; a2[1] += sx; a2[2] += sy; a2[3] += sz; accum.set(o.name, a2); }); }
  out.push('single-lot builds ms ' + (performance.now() - t1).toFixed(0) + ' meshes ' + nmesh);
  let diff = 0;
  for (const [k, v] of joint) { const jv = v.split(':'); const a2 = accum.get(k); if (!a2) { out.push('missing ' + k); diff++; continue; } const same = Number(jv[0]) === a2[0] && Math.abs(Number(jv[1]) - a2[1]) < 0.5 && Math.abs(Number(jv[3]) - a2[3]) < 0.5; if (!same) { diff++; out.push('DIFF ' + k + ' joint ' + v + ' single ' + a2.map((n) => n.toFixed(1)).join(':')); } }
  out.push('materials differing ' + diff + ' of ' + joint.size);
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/explore.txt', out.join('\n'));
}, 600000);
