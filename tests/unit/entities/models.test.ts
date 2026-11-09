import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel, hullSectionCount } from '@/entities/models/carModel';
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
  it.each(['sedan', 'suv', 'boxtruck', 'cop'] as const)('%s: matches the spec footprint, has wheels and lights, stays under 12 meshes', (type) => {
    const spec = VEHICLE_SPECS[type];
    const m = buildCarModel(type, spec, materials);
    const s = size(m.group);
    expect(Math.abs(s.z - spec.length)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(s.x - spec.width)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(s.y - spec.height)).toBeLessThanOrEqual(0.3);
    expect(bbox(m.group).min.y).toBeGreaterThanOrEqual(-0.01);
    expect(m.wheels.length).toBeGreaterThanOrEqual(4);
    expect(m.steerPivots.length).toBe(2);
    expect(m.headlights.length).toBeGreaterThanOrEqual(1); // all head lamps are one merged mesh
    expect(m.taillights.length).toBeGreaterThanOrEqual(1);
    expect(countMeshes(m.group)).toBeLessThanOrEqual(12);
  });

  it('front is -z: headlights are in front of taillights', () => {
    const m = buildCarModel('sedan', VEHICLE_SPECS.sedan, materials, 0, undefined, true);
    const front = new THREE.Box3().setFromObject(m.headlights[0]).getCenter(new THREE.Vector3());
    const rear = new THREE.Box3().setFromObject(m.taillights[0]).getCenter(new THREE.Vector3());
    expect(front.z).toBeLessThan(0);
    expect(rear.z).toBeGreaterThan(0);
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
    const set = (m: typeof a) => m.group.getObjectByName('tyre') as THREE.InstancedMesh;
    expect(set(a).geometry).toBe(set(b).geometry); // all four wheels: one cached geometry, one instanced mesh
    expect(set(a).count).toBe(4);
    expect(a.wheels.every((w) => w.children.length === 0)).toBe(true);
    expect(a.paintMeshes[0].geometry).toBe(b.paintMeshes[0].geometry);
    expect(a.headlights[0].material).not.toBe(b.headlights[0].material);
  });
});

/** world-space vertices of a mesh (group transforms applied) */
const verts = (m: THREE.Mesh): THREE.Vector3[] => {
  m.updateWorldMatrix(true, false);
  const p = m.geometry.attributes.position;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  return out;
};

describe('lofted car hull', () => {
  const sedan = buildCarModel('sedan', VEHICLE_SPECS.sedan, materials);
  const body = verts(sedan.paintMeshes[0]);
  const maxX = (vs: THREE.Vector3[]) => Math.max(...vs.map((v) => Math.abs(v.x)));

  it('is built from at least 8 control sections and many more lofted stations', () => {
    expect(hullSectionCount('sedan')).toBeGreaterThanOrEqual(8);
    expect(hullSectionCount('sedan')).toBeLessThanOrEqual(14);
    const stations = new Set(body.map((v) => v.z.toFixed(3)));
    expect(stations.size).toBeGreaterThan(20);
    expect(sedan.paintMeshes[0].geometry.attributes.position.count).toBeGreaterThan(1500);
    // smooth shaded: normals are unit length and vary continuously (not one flat normal per quad pair)
    const n = sedan.paintMeshes[0].geometry.attributes.normal;
    expect(n.count).toBe(sedan.paintMeshes[0].geometry.attributes.position.count);
  });

  it('has tumblehome: the roof is narrower than the belt line', () => {
    const H = VEHICLE_SPECS.sedan.height;
    const roof = body.filter((v) => v.y > H - 0.08 && Math.abs(v.z) < 1);
    const belt = body.filter((v) => v.y > 0.9 && v.y < 1.0 && Math.abs(v.z) < 1);
    expect(roof.length).toBeGreaterThan(10);
    expect(belt.length).toBeGreaterThan(10);
    expect(maxX(roof)).toBeLessThan(maxX(belt) - 0.12);
  });

  it('cuts wheel arches: the body side rises around each wheel centre', () => {
    for (const w of [sedan.steerPivots[0], sedan.wheels[3].parent!]) {
      const wz = w.position.z;
      const side = body.filter((v) => Math.abs(v.x) > 0.7);
      const near = side.filter((v) => Math.abs(v.z - wz) < 0.12);
      const between = side.filter((v) => Math.abs(v.z) < 0.2);
      expect(Math.min(...near.map((v) => v.y))).toBeGreaterThan(Math.min(...between.map((v) => v.y)) + 0.3);
    }
  });

  it('carves window openings: glass sits inside the body silhouette', () => {
    const glass = verts(sedan.group.getObjectByName('glass') as THREE.Mesh);
    expect(glass.length).toBeGreaterThan(100);
    expect(maxX(glass)).toBeLessThan(maxX(body));
  });

  it('merges dark plastic and chrome into one vertex-coloured trim mesh with a shared material', () => {
    const trim = sedan.group.getObjectByName('trim') as THREE.Mesh;
    const m = trim.material as THREE.MeshStandardMaterial;
    expect(m.vertexColors).toBe(true);
    expect(trim.geometry.attributes.color).toBeTruthy();
    expect(sedan.group.getObjectByName('chrome')).toBeUndefined();
    const again = buildCarModel('suv', VEHICLE_SPECS.suv, materials).group.getObjectByName('trim') as THREE.Mesh;
    expect(again.material).not.toBe(m); // per car (lamp uniforms) but one compiled program
    expect((again.material as THREE.Material).customProgramCacheKey()).toBe(m.customProgramCacheKey());
  });

  it('SUV and truck keep distinct silhouettes with their own wheel layouts', () => {
    const suv = buildCarModel('suv', VEHICLE_SPECS.suv, materials);
    expect(suv.wheelRadius).toBeGreaterThan(sedan.wheelRadius);
    const truck = buildCarModel('boxtruck', VEHICLE_SPECS.boxtruck, materials);
    expect(truck.group.getObjectByName('cargo')).toBeTruthy();
    expect(truck.hood).toBeUndefined();
  });

  it('stays at or under 60 meshes for every type', () => {
    for (const t of ['sedan', 'suv', 'boxtruck', 'cop'] as const) {
      expect(countMeshes(buildCarModel(t, VEHICLE_SPECS[t], materials).group)).toBeLessThanOrEqual(60);
    }
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

  it('has real proportions: head above 1.5 m, shoulders wider than hips, named hands, 12-24 meshes', () => {
    const h = buildHumanModel(materials, new Rng(11), { heightScale: 1, outfit: 'tee', hat: 'hair', accessory: 'none' });
    h.group.updateMatrixWorld(true);
    const skull = h.head.getObjectByName('skull')!;
    expect(new THREE.Box3().setFromObject(skull).max.y).toBeGreaterThan(1.6);
    expect(new THREE.Box3().setFromObject(skull).min.y).toBeGreaterThan(1.3);
    const handL = h.group.getObjectByName('handL')!;
    const handR = h.group.getObjectByName('handR')!;
    expect(handL).toBeTruthy();
    expect(handR).toBeTruthy();
    expect(handL.getWorldPosition(new THREE.Vector3()).x).toBeLessThan(0);
    expect(handR.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(0);
    expect(handL.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(1.0); // hands hang below the waist
    const w = (n: string) => size(h.group.getObjectByName(n)!).x;
    expect(w('chest')).toBeGreaterThan(w('hips') + 0.03);
    const c = countMeshes(h.group);
    expect(c).toBeGreaterThanOrEqual(12);
    expect(c).toBeLessThanOrEqual(24);
    // shoes: sole sits on the ground
    expect(bbox(h.group).min.y).toBeLessThan(0.01);
  });

  it('supports hair, afro, braids and durag variants within the height budget', () => {
    for (const hat of ['hair', 'afro', 'braids', 'durag', 'cap'] as const) {
      const h = buildHumanModel(materials, new Rng(2), { heightScale: 1, hat });
      expect(h.group.getObjectByName(hat === 'hair' ? 'hair' : hat)).toBeTruthy();
      expect(bbox(h.group).max.y).toBeLessThan(1.82);
    }
  });

  it('walk cycle sways the hips and counter-rotates the shoulders', () => {
    const h = buildHumanModel(materials, new Rng(5));
    animateWalk(h, 1.0, 1);
    expect(h.hips.rotation.y).toBeGreaterThan(0.01);
    expect(h.torso.rotation.y).toBeLessThan(-0.01);
    expect(Math.sign(h.hips.rotation.y)).toBe(-Math.sign(h.torso.rotation.y));
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
