import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { PALETTES, lookFor } from '@/entities/models/carLook';
import { CARS14_TRAFFIC_SHARE, CARS2_TRAFFIC_SHARE } from '@/game/TrafficSystem';
import { setCarPaintTier } from '@/render/CarPaintFx';
import type { IMaterialLibrary, VehicleType } from '@/world/types';

const mat = () => new THREE.MeshStandardMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as unknown as IMaterialLibrary;
const NEW = ['wagon', 'bigsuv', 'minitruck', 'panelvan', 'taxivan', 'limo', 'classic', 'donk', 'copsuv', 'convertible', 'stepvan', 'icecream'] as VehicleType[];

describe('CARS2 era street types', () => {
  it('each has a spec, a palette of 5+ colourways (taxi, police: 1) and builds within the triangle limits', () => {
    for (const t of NEW) {
      expect(VEHICLE_SPECS[t].type).toBe(t);
      expect(PALETTES[t].length, t).toBeGreaterThanOrEqual(t === 'taxivan' || t === 'copsuv' ? 1 : 5);
      setCarPaintTier('high');
      const m = buildCarModel(t, VEHICLE_SPECS[t], materials, 0, undefined, false, lookFor(t, VEHICLE_SPECS[t].color, 3), 3);
      let tris = 0;
      m.group.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && me.geometry.getAttribute('position')) tris += ((me.geometry.index ? me.geometry.index.count : me.geometry.getAttribute('position').count) / 3) * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1); });
      expect(tris, `${t} high`).toBeLessThanOrEqual(9000);
    }
  });
  it('traffic shares: every CARS14 and CARS2 type is in the mix and the extras stay under 25 %', () => {
    const all = { ...CARS14_TRAFFIC_SHARE, ...CARS2_TRAFFIC_SHARE };
    for (const t of NEW) expect(all[t], t).toBeGreaterThan(0);
    for (const t of Object.keys(CARS14_TRAFFIC_SHARE)) expect(all[t], t).toBeGreaterThan(0);
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBeLessThan(0.25);
  });
});
