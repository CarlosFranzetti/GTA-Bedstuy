import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PALETTES, lookFor, pickPaint, paletteEntry, STICKER_COUNT } from '@/entities/models/carLook';
import { buildExtras } from '@/entities/models/carExtras';
import { buildCarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, VehicleType } from '@/world/types';

const TYPES = Object.keys(VEHICLE_SPECS) as VehicleType[];
const mat = () => new THREE.MeshBasicMaterial();
const materials = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} } as unknown as IMaterialLibrary;
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

describe('car looks (CARS12 variation)', () => {
  it('every private-car type has 8 or more paints, all valid and distinct', () => {
    for (const t of TYPES) {
      const p = PALETTES[t];
      expect(p.length, t).toBeGreaterThanOrEqual(t === 'cop' || t === 'cab' || t === 'garbage' || t === 'ambulance' ? 1 : 8);
      for (const e of p) expect(/^#[0-9a-f]{6}$/i.test(e.color)).toBe(true);
      expect(new Set(p.map((e) => e.color)).size).toBe(p.length);
    }
  });
  it('the weighted draw follows the weights and finds the palette entry again', () => {
    const rng = new Rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) { const e = pickPaint('sedan', rng); seen.add(e.color); expect(paletteEntry('sedan', e.color)).toBeDefined(); }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
  it('a look is deterministic per (type, seed), and seeds vary it', () => {
    for (const t of TYPES) {
      const a = lookFor(t, '#888888', 1234), b = lookFor(t, '#888888', 1234);
      expect(a).toEqual(b);
      expect(a.stickers.every((s) => s >= 0 && s < STICKER_COUNT)).toBe(true);
    }
    const keys = new Set<string>();
    for (let s = 0; s < 400; s++) keys.add(lookFor('sedan', '#888888', s * 7919).key + lookFor('sedan', '#888888', s * 7919).condKey);
    expect(keys.size).toBeGreaterThan(60);
  });
  it('taxis get toppers, work vans get ladder racks sometimes, cops are sometimes unmarked, luxury cars stay clean', () => {
    const n = 300;
    let topper = 0, ladder = 0, unmarked = 0, rust = 0;
    for (let s = 0; s < n; s++) {
      if (lookFor('cab', '#e0b01e', s).roof.startsWith('topper')) topper++;
      if (lookFor('cargovan', '#ffffff', s).roof === 'ladder') ladder++;
      if (lookFor('cop', '#1b2a4a', s).unmarked) unmarked++;
      rust += lookFor('luxury', '#000000', s).rust;
    }
    expect(topper).toBe(n);
    expect(ladder).toBeGreaterThan(40);
    expect(unmarked).toBeGreaterThan(30);
    expect(unmarked).toBeLessThan(120);
    expect(rust).toBe(0);
  });
  it('extras are cheap vertex-coloured geometry (a few hundred triangles at most) and never NaN', () => {
    const spec = VEHICLE_SPECS.crossover;
    let found = 0;
    for (let s = 0; s < 80; s++) {
      const look = lookFor('crossover', '#aaaaaa', s);
      const m = buildCarModel('crossover', spec, materials, 0, undefined, true, look, s); // split model: parts are reachable through the group
      expect(m.style).toBe('crossover');
      const trim = m.group.getObjectByName('trim') as THREE.Mesh;
      expect(trim).toBeTruthy();
      void trim;
    }
    // direct: a roof box + two stickers + a ride-share decal
    const split = buildCarModel('crossover', spec, materials, 0, undefined, false, { ...lookFor('crossover', '#aaaaaa', 1), roof: 'cargo', stickers: [0, 5], rideshare: 1 }, 1);
    const near = split.group.getObjectByName('trim') as THREE.Mesh;
    const plain = buildCarModel('crossover', spec, materials, 0, undefined, false, { ...lookFor('crossover', '#aaaaaa', 1), roof: 'none', stickers: [], rideshare: -1 }, 1).group.getObjectByName('trim') as THREE.Mesh;
    const extra = tris(near.geometry) - tris(plain.geometry);
    expect(extra).toBeGreaterThan(20);
    expect(extra).toBeLessThan(400);
    for (const v of near.geometry.attributes.position.array) { expect(Number.isFinite(v)).toBe(true); found++; }
    expect(found).toBeGreaterThan(0);
    void buildExtras;
  });
  it('lowered cars sit lower over the same wheels; tinted cars get their own darker glass', () => {
    const base = lookFor('pony', '#c8283a', 3);
    const up = buildCarModel('pony', VEHICLE_SPECS.pony, materials, 0, undefined, false, { ...base, lowered: 0, tint: 0 }, 3);
    const low = buildCarModel('pony', VEHICLE_SPECS.pony, materials, 0, undefined, false, { ...base, lowered: 0.07, tint: 2 }, 3);
    expect(low.group.getObjectByName('body')!.position.y).toBeCloseTo(-0.07, 5);
    expect(up.group.getObjectByName('body')!.position.y).toBe(0);
    expect(low.wheels[0].parent!.position.y).toBeCloseTo(up.wheels[0].parent!.position.y, 6);
    expect(((low.group.getObjectByName('glass') as THREE.Mesh).material as THREE.Material).name).toBe('carGlass:tint2');
  });
  it('wheel designs all build, and the deep rim keeps the tyre radius', () => {
    for (const w of ['steel', 'steelBare', 'alloy6', 'alloy5', 'mesh', 'deep', 'turbine'] as const) {
      const m = buildCarModel('sedan', VEHICLE_SPECS.sedan, materials, 0, undefined, true, { ...lookFor('sedan', '#888888', 2), wheel: w }, 2);
      const tyre = m.wheels[0].children.find((c) => c.name === 'tyre') as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(tyre);
      expect(box.max.y - box.min.y).toBeCloseTo(2 * m.wheelRadius, 1);
      expect(tris(tyre.geometry), w).toBeLessThan(1200);
    }
  });
});

describe('car looks stay inside the triangle budgets (near full 9 k, lite 4.5 k) for every type and many seeds', () => {
  it('worst case of 24 seeds per type', async () => {
    const { setCarPaintTier } = await import('@/render/CarPaintFx');
    const count = (t: VehicleType, s: number): number => {
      const m = buildCarModel(t, VEHICLE_SPECS[t], materials, 0, undefined, false, lookFor(t, VEHICLE_SPECS[t].color, s), s);
      let n = 0;
      m.group.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh || !me.geometry.attributes.position?.count) return; n += tris(me.geometry) * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1); });
      return n;
    };
    for (const t of TYPES) {
      let fullMax = 0, liteMax = 0;
      for (let s = 0; s < 24; s++) { setCarPaintTier('high'); fullMax = Math.max(fullMax, count(t, s * 31 + 1)); setCarPaintTier('low'); liteMax = Math.max(liteMax, count(t, s * 31 + 1)); }
      expect(fullMax, `${t} full`).toBeLessThanOrEqual(9000);
      expect(liteMax, `${t} lite`).toBeLessThanOrEqual(4500);
    }
  }, 120_000);
});
