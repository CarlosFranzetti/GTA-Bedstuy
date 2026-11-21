import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { PALETTES, lookFor } from '@/entities/models/carLook';
import { HANDLING_OF } from '@/entities/handling';
import { ENGINE_VOICES } from '@/audio/vehicle/engineModel';
import { HORNS } from '@/audio/vehicle/hornModel';
import { DOOR_CLASS } from '@/audio/vehicle/fx';
import { setCarPaintTier } from '@/render/CarPaintFx';
import type { IMaterialLibrary, VehicleType } from '@/world/types';

const mat = () => new THREE.MeshStandardMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as unknown as IMaterialLibrary;
const NEW = ['hearse', 'livery', 'schoolbus', 'towtruck', 'flatbed', 'foodtruck', 'sweeper', 'bucket'] as VehicleType[];

const count = (root: THREE.Object3D): { tris: number; meshes: number } => {
  let tris = 0, meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || !m.geometry.getAttribute('position')) return;
    meshes++;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3 * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return { tris, meshes };
};

describe('CARS4 new vehicle types', () => {
  it('each has a spec, a handling class, a palette, an engine voice, a horn and a door class', () => {
    for (const t of NEW) {
      expect(VEHICLE_SPECS[t].type, t).toBe(t);
      expect(HANDLING_OF[t], t).toBeTruthy();
      expect(PALETTES[t].length, t).toBeGreaterThanOrEqual(1);
      expect(ENGINE_VOICES[t], t).toBeTruthy();
      expect(HORNS[t], t).toBeTruthy();
      expect(DOOR_CLASS[t], t).toBeTruthy();
    }
  });
  it('builds a model with the near-car draw count and a bounded triangle count, wheels in place and inside the spec size', () => {
    setCarPaintTier('high');
    for (const t of NEW) {
      const spec = VEHICLE_SPECS[t];
      const m = buildCarModel(t, spec, materials, 0, undefined, false, lookFor(t, spec.color, 5), 5);
      const { tris, meshes } = count(m.group);
      expect(tris, `${t} triangles`).toBeLessThanOrEqual(9000);
      expect(meshes, `${t} meshes`).toBeLessThanOrEqual(7);
      expect(m.wheels.length, t).toBeGreaterThanOrEqual(4);
      const box = new THREE.Box3().setFromObject(m.group);
      const size = box.getSize(new THREE.Vector3());
      expect(size.z, `${t} length`).toBeLessThanOrEqual(spec.length + 0.8);
      expect(size.z, `${t} length`).toBeGreaterThanOrEqual(spec.length - 0.8);
      expect(size.x, `${t} width`).toBeLessThanOrEqual(spec.width + 0.45);
      expect(size.y, `${t} height`).toBeLessThanOrEqual(spec.height + 0.35);
      expect(box.min.y, `${t} ground`).toBeGreaterThanOrEqual(-0.05);
    }
  });
  it('the far (split) model builds too', () => {
    setCarPaintTier('high');
    for (const t of NEW) {
      const spec = VEHICLE_SPECS[t];
      const m = buildCarModel(t, spec, materials, 0, undefined, true, lookFor(t, spec.color, 9), 9);
      expect(count(m.group).tris, t).toBeGreaterThan(500);
    }
  });
});
