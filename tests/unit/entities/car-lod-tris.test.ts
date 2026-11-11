import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { CarLod } from '@/render/CarLod';
import { setCarPaintTier } from '@/render/CarPaintFx';
import type { IMaterialLibrary } from '@/world/types';
import type { VehicleType } from '@/world/types';

const mat = () => new THREE.MeshStandardMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as unknown as IMaterialLibrary;
const triOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
/** triangles of everything a near car draws (meshes + instanced wheel sets) and its draw calls */
function nearCost(type: VehicleType): { tris: number; draws: number } {
  const m = buildCarModel(type, VEHICLE_SPECS[type], materials);
  let tris = 0, draws = 0;
  m.group.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || !me.geometry.getAttribute('position') || me.geometry.getAttribute('position').count === 0) return;
    const n = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
    tris += triOf(me.geometry) * n; draws++;
  });
  return { tris, draws };
}
function farTris(type: VehicleType): number {
  const lod = new CarLod(materials, { buildModel: (t) => buildCarModel(t as VehicleType, VEHICLE_SPECS[t as VehicleType], materials) });
  const hull = lod.hullFor(type);
  return hull ? triOf(hull) : -1;
}

describe('car detail levels', () => {
  const types = Object.keys(VEHICLE_SPECS) as VehicleType[];
  it('lite near models (phone / low) stay under 4.5 k triangles and 6 draws; full detail keeps more', () => {
    for (const t of types) {
      setCarPaintTier('high');
      const full = nearCost(t);
      setCarPaintTier('low');
      const lite = nearCost(t);
      expect(lite.tris, `${t} lite`).toBeLessThanOrEqual(4500);
      expect(lite.draws, `${t} draws`).toBeLessThanOrEqual(6);
      expect(lite.tris, `${t} lite < full`).toBeLessThan(full.tris);
    }
  });
  it('CARS14 types: near models stay <= 9 k triangles on high, <= 4.5 k on low, <= 6 draws', () => {
    for (const t of ['coupe911', 'exotic', 'jdmcoupe', 'hothatch', 'muscle', 'wedgetruck', 'evsedan'] as VehicleType[]) {
      setCarPaintTier('high'); const full = nearCost(t);
      setCarPaintTier('medium'); const med = nearCost(t);
      setCarPaintTier('low'); const lite = nearCost(t);
      expect(full.tris, `${t} high`).toBeLessThanOrEqual(9000);
      expect(med.tris, `${t} medium`).toBeLessThanOrEqual(9000);
      expect(lite.tris, `${t} low`).toBeLessThanOrEqual(4500);
      expect(full.draws, `${t} draws`).toBeLessThanOrEqual(6);
    }
  });
  it('far proxies are under 1.2 k triangles per car (paint + glass + dark + 8-gon wheels)', () => {
    for (const t of types) expect(farTris(t), t).toBeLessThanOrEqual(1200);
  });
  it('the far proxy of the lite and the full model are the same (built from the coarsest level)', () => {
    setCarPaintTier('high'); const a = farTris('sedan');
    setCarPaintTier('low'); const b = farTris('sedan');
    expect(a).toBe(b);
  });
});
