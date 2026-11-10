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
  it('prints', () => {
    for (const tier of ['high', 'low'] as const) {
      setCarPaintTier(tier);
      for (const t of types) { const n = nearCost(t); console.log(tier, t, 'near', Math.round(n.tris), n.draws, 'far', farTris(t)); }
    }
    expect(true).toBe(true);
  });
});
