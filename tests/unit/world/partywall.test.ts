import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildBuildings } from '@/world/BuildingGen';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { loadMats } from '@/world/buildings/facade';
import { lotLook, wallDecalMaterial } from '@/world/buildings/partyWall';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';

class Stub {
  private c = new Map<string, THREE.Material>();
  private mk(k: string) { let m = this.c.get(k); if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.c.set(k, m); } return m; }
  get(key: MaterialKey, v = 0) { return this.mk(`${key}:${v}`); }
  awning(c: string, t: string) { return this.mk(`awning:${c}:${t}`); }
  sign(t: string, b = '', f = '') { return this.mk(`sign:${t}:${b}:${f}`); }
  carPaint(c: string) { return this.mk(c); }
  setNight() { /* noop */ }
}

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));

describe('party walls and roofs differ per lot', () => {
  it('lotLook is stable per lot id and spreads over brick and tar variants', () => {
    const m = loadMats(new Stub() as unknown as IMaterialLibrary);
    const party = new Set<string>(), roof = new Set<string>();
    for (const l of lots) {
      const a = lotLook(m, l), b = lotLook(m, l);
      expect(a.party).toBe(b.party);
      expect(a.roof).toBe(b.roof);
      party.add(a.party.name); roof.add(a.roof.name);
    }
    expect(party.size).toBe(4);
    expect(roof.size).toBe(3);
  });

  it('the built city uses every tar roof variant and every party-wall brick', () => {
    const res = buildBuildings(lots, new Stub() as unknown as IMaterialLibrary, new Rng(data.seed).fork('buildings'));
    const names = new Set<string>();
    res.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) names.add(((o as THREE.Mesh).material as THREE.Material).name); });
    for (const v of [0, 1, 2]) expect(names.has(`tarRoof:${v}`), `tarRoof:${v}`).toBe(true);
    for (const v of [0, 1, 2, 3]) expect(names.has(`brickRed:${v}`), `brickRed:${v}`).toBe(true);
  });

  it('without a DOM canvas the decal atlas is skipped and the build still succeeds', () => {
    expect(wallDecalMaterial(new Stub() as unknown as IMaterialLibrary)).toBeNull();
  });
});
