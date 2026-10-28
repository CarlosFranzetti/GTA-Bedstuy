import { it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildBuildings } from '@/world/BuildingGen';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
class Stub implements IMaterialLibrary {
  private c = new Map<string, THREE.Material>();
  private mk(k: string) { let m = this.c.get(k); if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.c.set(k, m); } return m; }
  get(key: MaterialKey, v = 0) { return this.mk(`${key}:${v}`); }
  awning(c: string, t: string) { return this.mk(`awning:${c}:${t}`); }
  sign(t: string, a = '', b = '') { return this.mk(`sign:${t}:${a}:${b}`); }
  carPaint(c: string) { return this.mk(`car:${c}`); }
  setNight() {}
}
it('measure', async () => {
  const data = loadBedstuyData();
  const g = buildGrid(data);
  let faces: any = undefined;
  try { const sch: any = await import('@/world/data/schema'); faces = sch.loadFaces(data); } catch {}
  for (const useFaces of [false, true]) {
    if (useFaces && !faces) continue;
    const lots = (subdivideLots as any)(g, data.pois, new Rng(data.seed).fork('lots'), useFaces ? faces : undefined);
    const res = buildBuildings(lots, new Stub(), new Rng(data.seed).fork('buildings'));
    const per = new Map<string, number>(); let tot = 0, meshes = 0;
    res.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const n = m.geometry.getAttribute('position').count / 3; per.set((m.material as THREE.Material).name, n); tot += n; meshes++; } });
    const types = new Map<string, number>(); for (const l of lots) types.set(l.type, (types.get(l.type) ?? 0) + 1);
    (await import('node:fs')).appendFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/measure.out', JSON.stringify({ useFaces, lots: lots.length, tris: Math.round(tot), meshes, types: [...types], per: [...per].map(([k, v]) => `${k}=${Math.round(v)}`).join(' ') }));
  }
});
