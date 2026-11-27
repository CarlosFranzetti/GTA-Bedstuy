import { describe, it, expect } from 'vitest';
import { cabinKitFor, buildCabin, CABIN_STYLES, LITE_CABIN_TRIS } from '@/entities/models/carCabin';
import { buildCarModel, styleFor } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import * as THREE from 'three';
import type { CabinSpec } from '@/entities/models/carCabin';
import type { IMaterialLibrary, VehicleType } from '@/world/types';

const TYPES = Object.keys(VEHICLE_SPECS) as VehicleType[];
const styleOf = (t: VehicleType): string => (t === 'taxivan' ? 'taxivan' : styleFor(t, VEHICLE_SPECS[t].color));
const tris = (g: THREE.BufferGeometry | null): number => (g ? g.attributes.position.count / 3 : 0);

const mat = () => new THREE.MeshBasicMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as unknown as IMaterialLibrary;
const specOf = (t: VehicleType): CabinSpec | undefined => buildCarModel(t, VEHICLE_SPECS[t], materials, 0, undefined, false, undefined, 3).group.userData.cabin as CabinSpec | undefined;

describe('CARCABIN', () => {
  it('every vehicle type has a cabin profile', () => {
    for (const t of TYPES) expect(CABIN_STYLES, t).toContain(styleOf(t));
  });
  it('is deterministic per seed', () => {
    expect(cabinKitFor('sedan', 5).key).toBe(cabinKitFor('sedan', 5).key);
  });
  it('different types read differently', () => {
    const keys = new Set(TYPES.map((t) => { const k = cabinKitFor(styleOf(t), 1); return `${k.dash}|${k.seat}|${k.rim}|${k.props.join('.')}`; }));
    expect(keys.size).toBeGreaterThan(TYPES.length * 0.5);
    expect(cabinKitFor('cab', 1).props).toContain('meter');
    expect(cabinKitFor('cop', 1).props).toContain('laptop');
    expect(cabinKitFor('van', 1).props).toContain('clipboard');
    expect(cabinKitFor('bus', 1).family).toBe('bus');
  });
  it('two seeds of a private type can differ', () => {
    const ks = new Set(Array.from({ length: 40 }, (_, i) => cabinKitFor('sedan', i).key));
    expect(ks.size).toBeGreaterThan(8);
  });
  it('some private cars carry dice or a freshener, fleet cars never get dice', () => {
    const dice = Array.from({ length: 200 }, (_, i) => cabinKitFor('beater', i)).filter((k) => k.props.includes('dice')).length;
    expect(dice).toBeGreaterThan(10);
    expect(Array.from({ length: 100 }, (_, i) => cabinKitFor('cop', i)).some((k) => k.props.includes('dice'))).toBe(false);
  });
  it('every type builds a cabin within the triangle caps (near and lite), and the geometry differs between types', () => {
    const sigs = new Set<string>();
    for (const t of TYPES) {
      const spec = specOf(t);
      expect(spec, t).toBeTruthy();
      const kit = cabinKitFor(styleOf(t), 3);
      const near = buildCabin(spec!, kit, true);
      expect(near, t).toBeTruthy();
      const n = tris(near);
      expect(n, t).toBeLessThan(900);
      expect(n, t).toBeGreaterThan(60);
      expect(tris(buildCabin(spec!, kit, false)), t).toBeLessThanOrEqual(n);
      sigs.add(`${n}|${kit.key}`);
    }
    expect(sigs.size).toBeGreaterThan(TYPES.length * 0.9);
    expect(LITE_CABIN_TRIS).toBeLessThanOrEqual(300);
  });
  it('two seeds of one type give different geometry', () => {
    const spec = specOf('sedan')!;
    const a = buildCabin(spec, cabinKitFor('sedan', 1), true)!, b = buildCabin(spec, cabinKitFor('sedan', 9), true)!;
    const same = a.attributes.position.count === b.attributes.position.count && a.attributes.color.array.every((v, i) => v === b.attributes.color.array[i]);
    expect(same).toBe(false);
  });
});
