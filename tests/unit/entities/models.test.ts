import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel } from '@/entities/models/carModel';
import { animateWalk, buildHumanModel } from '@/entities/models/humanModel';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const materials: IMaterialLibrary = {
  get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {},
};

const bbox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
const size = (o: THREE.Object3D) => bbox(o).getSize(new THREE.Vector3());
const countMeshes = (o: THREE.Object3D) => { let n = 0; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; }); return n; };

describe('buildCarModel', () => {
  it.each(['sedan', 'suv', 'boxtruck', 'cop'] as const)('%s: matches the spec footprint, has wheels and lights, stays under 40 meshes', (type) => {
    const spec = VEHICLE_SPECS[type];
    const m = buildCarModel(type, spec, materials);
    const s = size(m.group);
    expect(Math.abs(s.z - spec.length)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(s.x - spec.width)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(s.y - spec.height)).toBeLessThanOrEqual(0.3);
    expect(bbox(m.group).min.y).toBeGreaterThanOrEqual(-0.01);
    expect(m.wheels.length).toBeGreaterThanOrEqual(4);
    expect(m.steerPivots.length).toBe(2);
    expect(m.headlights.length).toBe(2);
    expect(m.taillights.length).toBe(2);
    expect(countMeshes(m.group)).toBeLessThanOrEqual(40);
  });

  it('front is -z: headlights are in front of taillights', () => {
    const m = buildCarModel('sedan', VEHICLE_SPECS.sedan, materials);
    expect(m.headlights[0].position.z).toBeLessThan(0);
    expect(m.taillights[0].position.z).toBeGreaterThan(0);
    expect(m.steerPivots[0].position.z).toBeLessThan(0);
  });

  it('cop has a lightbar, others do not', () => {
    const cop = buildCarModel('cop', VEHICLE_SPECS.cop, materials);
    expect(cop.lightbar).toBeTruthy();
    expect(cop.lightbar!.red.name).toBe('lightbarA');
    expect(cop.lightbar!.blue.name).toBe('lightbarB');
    expect(cop.lightbar!.red.material).not.toBe(cop.lightbar!.blue.material);
    for (const t of ['sedan', 'suv', 'boxtruck'] as const) {
      expect(buildCarModel(t, VEHICLE_SPECS[t], materials).lightbar).toBeUndefined();
    }
  });

  it('three distinct silhouettes: truck taller than SUV taller than sedan', () => {
    const h = (t: 'sedan' | 'suv' | 'boxtruck') => size(buildCarModel(t, VEHICLE_SPECS[t], materials).group).y;
    expect(h('boxtruck')).toBeGreaterThan(h('suv'));
    expect(h('suv')).toBeGreaterThan(h('sedan'));
  });

  it('two sedans share wheel and body geometry; light materials are per car', () => {
    const a = buildCarModel('sedan', VEHICLE_SPECS.sedan, materials);
    const b = buildCarModel('sedan', VEHICLE_SPECS.sedan, materials);
    const geoOf = (o: THREE.Object3D) => (o.children[0] as THREE.Mesh).geometry;
    expect(geoOf(a.wheels[0])).toBe(geoOf(b.wheels[0]));
    expect(geoOf(a.wheels[0])).toBe(geoOf(a.wheels[3]));
    expect(a.paintMeshes[0].geometry).toBe(b.paintMeshes[0].geometry);
    expect(a.headlights[0].material).not.toBe(b.headlights[0].material);
  });
});

describe('Vehicle lights and damage', () => {
  const make = (type: keyof typeof VEHICLE_SPECS = 'sedan') =>
    new Vehicle('v', VEHICLE_SPECS[type], { x: 0, z: 0 }, 0, materials, new EventBus());
  const emissive = (o: THREE.Object3D, name: string) =>
    (o.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;

  it('headlights toggle head 4.0 / tail 1.5', () => {
    const v = make();
    expect(emissive(v.object3D, 'headlight').emissiveIntensity).toBe(0);
    v.headlights = true;
    expect(v.headlights).toBe(true);
    expect(emissive(v.object3D, 'headlight').emissiveIntensity).toBe(4);
    expect(emissive(v.object3D, 'taillight').emissiveIntensity).toBe(1.5);
    v.headlights = false;
    expect(emissive(v.object3D, 'headlight').emissiveIntensity).toBe(0);
    expect(emissive(v.object3D, 'taillight').emissiveIntensity).toBe(0);
  });

  it('brake lights go to 3.0 while braking, even in daylight', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -10 };
    v.setInput({ throttle: 0, steer: 0, brake: true, handbrake: false, horn: false });
    v.update(1 / 60);
    expect(emissive(v.object3D, 'taillight').emissiveIntensity).toBe(3);
    v.setInput({ throttle: 0, steer: 0, brake: false, handbrake: false, horn: false });
    v.update(1 / 60);
    expect(emissive(v.object3D, 'taillight').emissiveIntensity).toBe(0);
  });

  it('heavy damage lifts the hood and darkens the paint without touching the shared material', () => {
    const v = make();
    const hood = v.object3D.getObjectByName('hoodPivot')!;
    const body = v.object3D.getObjectByName('body') as THREE.Mesh;
    const original = body.material;
    v.update(1 / 60);
    expect(hood.rotation.x).toBe(0);
    v.damage = 0.9;
    v.update(1 / 60);
    expect(hood.rotation.x).toBeGreaterThan(0.05);
    expect(body.material).not.toBe(original);
    v.damage = 0;
    v.update(1 / 60);
    expect(body.material).toBe(original);
    expect(hood.rotation.x).toBe(0);
  });
});

describe('buildHumanModel', () => {
  it('is about 1.75 m tall and faces -z', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const h = buildHumanModel(materials, new Rng(seed));
      const bb = bbox(h.group);
      expect(bb.max.y).toBeGreaterThan(1.65);
      expect(bb.max.y).toBeLessThan(1.85);
      expect(bb.min.y).toBeGreaterThan(-0.01);
      expect(bb.min.y).toBeLessThan(0.02);
      expect(h.legs.length).toBe(2);
      expect(h.arms.length).toBe(2);
      expect(countMeshes(h.group)).toBeLessThanOrEqual(24);
    }
    const h = buildHumanModel(materials, new Rng(3), { heightScale: 1, accessory: 'none' });
    expect(bbox(h.group).max.y).toBeCloseTo(1.75, 1);
    expect(h.head.position.y).toBeGreaterThan(1.5);
  });

  it('has outfit variety across seeds', () => {
    const names = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const h = buildHumanModel(materials, new Rng(seed * 7919));
      h.group.traverse((c) => { if (['hoodie', 'cap', 'hair', 'backpack', 'bag'].includes(c.name)) names.add(c.name); });
    }
    expect(names.size).toBeGreaterThanOrEqual(4);
  });

  it('shares geometry between people', () => {
    const a = buildHumanModel(materials, new Rng(1), { outfit: 'tee' });
    const b = buildHumanModel(materials, new Rng(2), { outfit: 'tee' });
    const thigh = (h: ReturnType<typeof buildHumanModel>) => (h.legs[0].getObjectByName('thigh') as THREE.Mesh).geometry;
    expect(thigh(a)).toBe(thigh(b));
  });

  it('animateWalk swings legs and arms in opposition, bends knees, and rests at amplitude 0', () => {
    const h = buildHumanModel(materials, new Rng(5));
    const rest = h.legs.map((l) => l.rotation.x);
    animateWalk(h, 1.0, 1);
    expect(h.legs[0].rotation.x).not.toBeCloseTo(rest[0], 2);
    expect(h.legs[0].rotation.x).toBeCloseTo(-h.legs[1].rotation.x);
    expect(h.arms[0].rotation.x).toBeCloseTo(-h.legs[0].rotation.x * 0.9 / 1, 5);
    let maxKnee = 0;
    for (let p = 0; p < Math.PI * 2; p += 0.1) {
      animateWalk(h, p, 1);
      maxKnee = Math.max(maxKnee, -h.knees[0].rotation.x);
      expect(h.knees[0].rotation.x).toBeLessThanOrEqual(0); // knees only bend backwards
    }
    expect(maxKnee).toBeGreaterThan(0.6);
    animateWalk(h, 1.0, 0);
    expect(h.legs[0].rotation.x).toBeCloseTo(0);
    expect(h.knees[1].rotation.x).toBeCloseTo(0);
    expect(h.rig.position.y).toBeCloseTo(0);
  });
});
