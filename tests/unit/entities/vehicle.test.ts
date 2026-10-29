import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import type { Contact, IMaterialLibrary, VehicleInput } from '@/world/types';
import { forwardFromHeading } from '@/core/Math2';

const mat = () => new THREE.MeshBasicMaterial();
const stubMaterials: IMaterialLibrary = {
  get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {},
};
const input = (o: Partial<VehicleInput> = {}): VehicleInput =>
  ({ throttle: 0, steer: 0, brake: false, handbrake: false, horn: false, ...o });
const make = (type: keyof typeof VEHICLE_SPECS = 'sedan', heading = 0, events = new EventBus()) =>
  new Vehicle('v1', VEHICLE_SPECS[type], { x: 0, z: 0 }, heading, stubMaterials, events);
const run = (v: Vehicle, secs: number, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) v.update(dt); };

describe('Vehicle', () => {
  it('has the specified body', () => {
    const v = make('boxtruck');
    expect(v.body.shape).toEqual({ kind: 'obb', halfW: 1.2, halfL: 3.5 });
    expect(v.body.mass).toBe(3500);
    expect(v.body.kind).toBe('vehicle');
    expect(v.body.userData).toBe(v);
    expect(make('cop').body.kind).toBe('cop');
    expect(make('sedan').body.mass).toBe(1400);
  });

  it.each(['sedan', 'suv', 'cop'] as const)('%s: full throttle 6 s reaches >= 0.8 maxSpeed, never exceeds it', (type) => {
    const v = make(type);
    v.driver = 'player';
    v.setInput(input({ throttle: 1 }));
    let max = 0;
    for (let i = 0; i < 360; i++) { v.update(1 / 60); max = Math.max(max, v.speed); }
    expect(v.speed).toBeGreaterThanOrEqual(0.8 * v.spec.maxSpeed);
    expect(max).toBeLessThanOrEqual(v.spec.maxSpeed + 1e-9);
    // heading 0 = north = -z
    expect(v.body.pos.z).toBeLessThan(0);
  });

  /** time (s) for a full-throttle launch to reach `frac` of maxSpeed */
  const launchTime = (type: keyof typeof VEHICLE_SPECS, frac: number) => {
    const v = make(type);
    v.driver = 'player';
    v.setInput(input({ throttle: 1 }));
    for (let i = 1; i <= 60 * 40; i++) { v.update(1 / 60); if (v.speed >= frac * v.spec.maxSpeed) return i / 60; }
    return Infinity;
  };

  it('0-100 km/h: sedan about 6 s, box truck about 12 s to the same fraction of its top speed', () => {
    const sedan = launchTime('sedan', 100 / 3.6 / VEHICLE_SPECS.sedan.maxSpeed);
    expect(sedan).toBeGreaterThan(5);
    expect(sedan).toBeLessThan(7);
    const truck = launchTime('boxtruck', 100 / 3.6 / VEHICLE_SPECS.sedan.maxSpeed);
    expect(truck).toBeGreaterThan(10);
    expect(truck).toBeLessThan(14);
  });

  it('torque falls with speed: getting from 50% to 90% of top speed takes longer than 0 to 50%', () => {
    const t50 = launchTime('sedan', 0.5);
    const t90 = launchTime('sedan', 0.9);
    expect(t90 - t50).toBeGreaterThan(1.5 * t50);
  });

  it('coasting sheds speed via engine braking and drag, but gently', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -20 };
    v.setInput(input());
    run(v, 1);
    expect(v.speed).toBeLessThan(18);
    expect(v.speed).toBeGreaterThan(10);
  });

  it('brake from 20 m/s stops within 3 s, but not instantly (ABS-like ramp)', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -20 };
    v.setInput(input({ brake: true }));
    v.update(1 / 60);
    expect(v.speed).toBeGreaterThan(19.5); // first frame: pedal still ramping in
    run(v, 0.5);
    expect(v.speed).toBeGreaterThan(8);
    run(v, 2.5);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
    expect(v.body.pos.z).toBeLessThan(-8); // a real braking distance
  });

  it('brake lights come on while braking', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -15 };
    const tail = (v.object3D.getObjectByName('taillightL') ?? null) as THREE.Mesh | null;
    v.setInput(input({ brake: true }));
    run(v, 0.5);
    if (tail) expect((tail.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(2);
  });

  it('steering is rate limited: no instant full lock, return-to-centre, narrower lock at speed', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -10 };
    v.setInput(input({ steer: 1, throttle: 0.3 }));
    v.update(1 / 60);
    expect(Math.abs(v.steering)).toBeGreaterThan(0);
    expect(Math.abs(v.steering)).toBeLessThan(0.1 * v.spec.maxSteer);
    run(v, 0.1);
    expect(Math.abs(v.steering)).toBeLessThan(0.6 * v.spec.maxSteer);
    run(v, 1);
    const locked = v.steering;
    expect(locked).toBeGreaterThan(0.3 * v.spec.maxSteer);
    expect(locked).toBeLessThan(v.spec.maxSteer); // shrinks with speed
    v.setInput(input({ steer: 0, throttle: 0.3 }));
    run(v, 0.15);
    expect(v.steering).toBeLessThan(locked);
    expect(v.steering).toBeGreaterThan(0);
    run(v, 1);
    expect(Math.abs(v.steering)).toBeLessThan(1e-6);
    // a hard flick never turns the body instantly
    const w = make();
    w.driver = 'player';
    w.body.vel = { x: 0, z: -25 };
    w.setInput(input({ steer: 1 }));
    w.update(1 / 60);
    expect(Math.abs(w.body.heading)).toBeLessThan(0.01);
  });

  it('cornering rolls the chassis outward and braking dips the nose', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -18 };
    v.setInput(input({ steer: 1, throttle: 0.5 }));
    run(v, 1);
    const chassis = v.object3D.children[0];
    expect(chassis.rotation.z).toBeLessThan(-0.01); // right turn: right side down
    const w = make();
    w.driver = 'player';
    w.body.vel = { x: 0, z: -20 };
    w.setInput(input({ brake: true }));
    run(w, 0.4);
    expect(w.object3D.children[0].rotation.x).toBeLessThan(-0.01);
  });

  it('impacts kick the suspension (chassis bounce) and it settles again', () => {
    const v = make();
    v.driver = 'player';
    const wall = { id: 'w', kind: 'static', shape: { kind: 'circle', r: 1 }, pos: { x: 0, z: -3 }, vel: { x: 0, z: 0 }, heading: 0, mass: Infinity } as never;
    v.body.vel = { x: 0, z: -10 };
    v.onContact({ a: v.body, b: wall, normal: { x: 0, z: -1 }, depth: 0.1, point: { x: 0, z: -2.3 }, impulse: 10 }, wall);
    let min = 0;
    for (let i = 0; i < 20; i++) { v.update(1 / 60); min = Math.min(min, v.object3D.children[0].position.y); }
    expect(min).toBeLessThan(-0.005);
    run(v, 3);
    expect(Math.abs(v.object3D.children[0].position.y)).toBeLessThan(0.002);
  });

  it('steering right at 10 m/s increases heading (clockwise)', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -10 };
    v.setInput(input({ steer: 1, throttle: 0.4 }));
    run(v, 1);
    expect(v.body.heading).toBeGreaterThan(0.05);
    // velocity follows the heading, heading east of north => +x
    expect(v.body.pos.x).toBeGreaterThan(0);
  });

  it('parked vehicle (driver null) ignores input and has zero speed', () => {
    const v = make();
    v.setInput(input({ throttle: 1, steer: 1 }));
    run(v, 2);
    expect(v.speed).toBe(0);
    expect(v.body.pos).toEqual({ x: 0, z: 0 });
    // coasting parked car stops
    v.body.vel = { x: 0, z: -5 };
    run(v, 2);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
  });

  it('parked car keeps rolling under friction after a nudge (about a metre), not zeroed at once', () => {
    const v = make();
    v.body.vel = { x: 0, z: -2.5 };
    v.update(1 / 60);
    expect(v.speed).toBeGreaterThan(2); // not zeroed in one step
    run(v, 2);
    expect(v.body.pos.z).toBeLessThan(-0.4);
    expect(v.body.pos.z).toBeGreaterThan(-2);
    expect(v.speed).toBe(0);
    // a feeble push (a walking pedestrian) does not creep the car along
    const w = make();
    w.body.vel = { x: 0, z: -0.2 };
    run(w, 1);
    expect(Math.abs(w.body.pos.z)).toBeLessThan(0.01);
  });

  it('reverse is capped at 8 m/s', () => {
    const v = make();
    v.driver = 'traffic';
    v.setInput(input({ throttle: -1 }));
    run(v, 10);
    expect(v.speed).toBeLessThan(0);
    expect(v.speed).toBeGreaterThanOrEqual(-8);
  });

  it('accepts physics nudges to body.pos / body.vel', () => {
    const v = make();
    v.driver = 'player';
    v.setInput(input({ throttle: 1 }));
    run(v, 1);
    v.body.pos = { x: 50, z: 50 };
    v.body.vel = { x: 0, z: 0 };
    v.update(1 / 60);
    expect(v.body.pos.x).toBeCloseTo(50, 1);
    expect(v.body.pos.z).toBeCloseTo(50, 1);
    expect(v.speed).toBeLessThan(1);
    expect(v.object3D.position.x).toBeCloseTo(50, 1);
  });

  it('handbrake keeps sideways momentum longer (drift)', () => {
    const lateral = (handbrake: boolean) => {
      const v = make();
      v.driver = 'player';
      v.body.vel = { x: 8, z: -8 }; // moving diagonally while facing north
      v.setInput(input({ handbrake }));
      for (let i = 0; i < 6; i++) v.update(1 / 60);
      return Math.abs(v.body.vel.x);
    };
    expect(lateral(true)).toBeLessThan(lateral(false) + 8); // sanity
    expect(lateral(false)).toBeLessThan(lateral(true));
  });

  it('handbrake + steering at speed produces real lateral slip; without it the car grips', () => {
    const slide = (handbrake: boolean) => {
      const v = make();
      v.driver = 'player';
      v.body.vel = { x: 0, z: -20 };
      v.setInput(input({ steer: 0.7, handbrake }));
      let maxLat = 0;
      for (let i = 0; i < 60; i++) { v.update(1 / 60); maxLat = Math.max(maxLat, Math.abs(v.lateralSpeed)); }
      return { maxLat, slip: v.slip };
    };
    const g = slide(false), d = slide(true);
    expect(g.maxLat).toBeLessThan(2);
    expect(d.maxLat).toBeGreaterThan(4);
    expect(d.maxLat).toBeGreaterThan(3 * g.maxLat);
  });

  it('power oversteer: flat out at high speed with hard lock slides, a lower speed does not', () => {
    const lat = (speed: number) => {
      const v = make();
      v.driver = 'player';
      v.body.vel = { x: 0, z: -speed };
      v.setInput(input({ steer: 1, throttle: 1 }));
      let maxLat = 0;
      for (let i = 0; i < 120; i++) { v.update(1 / 60); maxLat = Math.max(maxLat, Math.abs(v.lateralSpeed)); }
      return maxLat;
    };
    expect(lat(28)).toBeGreaterThan(2 * lat(8));
  });

  it('low grip understeers: same lock, less yaw', () => {
    const yaw = (grip: number) => {
      const v = make();
      v.driver = 'player';
      v.grip = grip;
      v.body.vel = { x: 0, z: -20 };
      v.setInput(input({ steer: 1, throttle: 0.4 }));
      run(v, 1.5);
      return Math.abs(v.body.heading);
    };
    expect(yaw(0.4)).toBeLessThan(yaw(1));
  });

  it('wall impacts: glancing keeps most speed, head-on loses it all and requests camera shake', () => {
    const hit = (angleDeg: number) => {
      const v = make();
      v.driver = 'player';
      const speed = 20;
      v.body.vel = { x: 0, z: -speed };
      // wall normal (from car toward wall) rotated away from the travel direction by angleDeg
      const a = (angleDeg * Math.PI) / 180;
      const n = { x: Math.sin(a), z: -Math.cos(a) };
      const wall = { id: 'w', kind: 'static', shape: { kind: 'circle', r: 1 }, pos: { x: 0, z: -5 }, vel: { x: 0, z: 0 }, heading: 0, mass: Infinity } as never;
      const closing = speed * Math.cos(a);
      // emulate World2D: remove the normal component of velocity
      const vn = v.body.vel.x * n.x + v.body.vel.z * n.z;
      v.body.vel = { x: v.body.vel.x - n.x * vn, z: v.body.vel.z - n.z * vn };
      v.onContact({ a: v.body, b: wall, normal: n, depth: 0.1, point: { x: 0, z: -2.3 }, impulse: closing }, wall);
      return { speed: Math.hypot(v.body.vel.x, v.body.vel.z), shake: v.shakeRequested };
    };
    const glance = hit(80);
    const head = hit(0);
    expect(glance.speed).toBeGreaterThan(16);
    expect(head.speed).toBeLessThan(0.5);
    expect(head.shake).toBeGreaterThan(0.8);
    expect(glance.shake).toBeLessThan(head.shake);
  });

  it('shakeRequested decays on its own when nobody consumes it', () => {
    const v = make();
    v.shakeRequested = 1;
    run(v, 2);
    expect(v.shakeRequested).toBeLessThan(0.01);
  });

  it('dents the paint hull above 0.3 damage via a cloned geometry; originals stay shared and are restored on repair', () => {
    const v = make();
    const mesh = (v as unknown as { model: { paintMeshes: THREE.Mesh[] } }).model.paintMeshes[0];
    const original = mesh.geometry;
    const before = Float32Array.from(original.getAttribute('position').array as Float32Array);
    v.damage = 0.2;
    v.update(1 / 60);
    expect(mesh.geometry).toBe(original);
    v.damage = 0.8;
    v.update(1 / 60);
    expect(mesh.geometry).not.toBe(original);
    const dented = mesh.geometry.getAttribute('position').array as Float32Array;
    let moved = 0;
    for (let i = 0; i < before.length; i++) if (Math.abs(dented[i] - before[i]) > 1e-4) moved++;
    expect(moved).toBeGreaterThan(before.length * 0.3);
    // shared geometry untouched
    const after = original.getAttribute('position').array as Float32Array;
    for (let i = 0; i < before.length; i++) expect(after[i]).toBe(before[i]);
    v.damage = 0;
    v.update(1 / 60);
    expect(mesh.geometry).toBe(original);
    v.dispose();
  });

  it('prevPos / prevHeading hold the previous step; applyInterpolated blends them', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -10 };
    v.update(1 / 60);
    const z1 = v.body.pos.z;
    v.update(1 / 60);
    expect(v.prevPos.z).toBeCloseTo(z1, 9);
    v.applyInterpolated(0.5);
    expect(v.object3D.position.z).toBeCloseTo((z1 + v.body.pos.z) / 2, 6);
    v.applyInterpolated(1);
    expect(v.object3D.position.z).toBeCloseTo(v.body.pos.z, 9);
    // teleports snap instead of sweeping
    v.body.pos.x = 500;
    v.applyInterpolated(0.5);
    expect(v.object3D.position.x).toBe(500);
  });

  it('onContact raises damage by impulse/40 and emits impact', () => {
    const events = new EventBus();
    const seen: unknown[] = [];
    events.on('impact', (e) => seen.push(e));
    const v = make('sedan', 0, events);
    const other = { id: 'wall', kind: 'static', shape: { kind: 'circle', r: 1 }, pos: { x: 0, z: -3 }, vel: { x: 0, z: 0 }, heading: 0, mass: Infinity } as const;
    const c: Contact = { a: v.body, b: other as never, normal: { x: 0, z: -1 }, depth: 0.1, point: { x: 0, z: -2 }, impulse: 10 };
    v.onContact(c, other as never);
    expect(v.damage).toBeCloseTo(0.25);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ a: 'v1', b: 'wall', strength: 10 });
    v.onContact({ ...c, impulse: 1000 }, other as never);
    expect(v.damage).toBe(1);
  });

  it('vehicle-vs-vehicle contact emits impact only from the contact.a side', () => {
    const events = new EventBus();
    let n = 0;
    events.on('impact', () => n++);
    const v1 = make('sedan', 0, events);
    const v2 = new Vehicle('v2', VEHICLE_SPECS.suv, { x: 0, z: -5 }, 0, stubMaterials, events);
    const c: Contact = { a: v1.body, b: v2.body, normal: { x: 0, z: -1 }, depth: 0.1, point: { x: 0, z: -2 }, impulse: 6 };
    v1.onContact(c, v2.body);
    v2.onContact(c, v1.body);
    expect(n).toBe(1);
    expect(v2.damage).toBeCloseTo(0.15);
  });

  it('emits horn on rising edge only', () => {
    const events = new EventBus();
    let n = 0;
    events.on('horn', () => n++);
    const v = make('sedan', 0, events);
    v.driver = 'player';
    v.setInput(input({ horn: true }));
    run(v, 0.5);
    expect(n).toBe(1);
  });

  it('doorPos is 1.2 m to the left of centre', () => {
    const v = make('sedan', 0);
    expect(v.doorPos().x).toBeCloseTo(-1.2);
    expect(v.doorPos().z).toBeCloseTo(0);
    const e = make('sedan', Math.PI / 2); // facing east -> left is north (-z)
    expect(e.doorPos().x).toBeCloseTo(0);
    expect(e.doorPos().z).toBeCloseTo(-1.2);
  });

  it('applies pose: rotation.y = -heading', () => {
    const v = make('sedan', 1);
    v.update(1 / 60);
    expect(v.object3D.rotation.y).toBeCloseTo(-v.body.heading);
    const f = forwardFromHeading(v.body.heading);
    expect(f.x).toBeGreaterThan(0);
  });

  it('cop lightbar alternates red/blue only while siren is on', () => {
    const v = make('cop');
    const a = v.object3D.getObjectByName('lightbarA') as THREE.Mesh;
    const b = v.object3D.getObjectByName('lightbarB') as THREE.Mesh;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    const em = (m: THREE.Mesh) => (m.material as THREE.MeshStandardMaterial).emissive.getHex();

    v.update(0.01);
    expect(em(a)).toBe(0); // siren off

    v.siren = true;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) { v.update(1 / 60); seen.add(`${em(a)}|${em(b)}`); }
    expect(seen.size).toBe(2);
    for (const s of seen) {
      const [x, y] = s.split('|').map(Number);
      expect(x).not.toBe(y);
      expect([0xff1010, 0x1030ff]).toContain(x);
    }

    v.siren = false;
    v.update(1 / 60);
    expect(em(a)).toBe(0);
  });

  it('non-cop vehicles have no lightbar; dispose is safe', () => {
    const v = make('sedan');
    expect(v.object3D.getObjectByName('lightbarA')).toBeUndefined();
    v.dispose();
  });

  it('tyres use the tireSidewall texture and plates use plate variants chosen per car id', () => {
    const calls: string[] = [];
    const rec: IMaterialLibrary = {
      get: (k, v) => { calls.push(`${k}:${v ?? 0}`); return mat(); },
      awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {},
    };
    const ids = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff', 'g7', 'h88'];
    for (const id of ids) new Vehicle(id, VEHICLE_SPECS.sedan, { x: 0, z: 0 }, 0, rec, new EventBus());
    expect(calls).toContain('tireSidewall:0');
    expect(calls).not.toContain('tire:0');
    const plates = new Set(calls.filter((c) => c.startsWith('plate:')));
    expect(plates.size).toBeGreaterThan(1);
    for (const p of plates) expect(Number(p.split(':')[1])).toBeLessThan(4);
  });

  it('a wall scrape (repeated weaker contacts) adds little damage and emits one impact', () => {
    const events = new EventBus();
    let n = 0;
    events.on('impact', () => n++);
    const v = make('sedan', 0, events);
    v.driver = 'player';
    const wall = { id: 'w', kind: 'static', shape: { kind: 'circle', r: 1 }, pos: { x: 3, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, mass: Infinity } as never;
    const hit = (impulse: number): Contact => ({ a: v.body, b: wall, normal: { x: 1, z: 0 }, depth: 0.05, point: { x: 1, z: 0 }, impulse });
    v.onContact(hit(8), wall);
    const first = v.damage;
    expect(first).toBeCloseTo(0.2);
    for (let i = 0; i < 30; i++) { v.update(1 / 60); v.onContact(hit(2), wall); }
    expect(n).toBe(1);
    expect(v.damage - first).toBeLessThan(0.2); // 30 scrape frames, not 30 full hits
    // a genuinely harder hit still counts in full
    v.update(1 / 60);
    const before = v.damage;
    v.onContact(hit(16), wall); // above 8 * 1.5 + 1 (the SCRAPE_ESCALATE rule), so it is a new hit
    expect(v.damage - before).toBeCloseTo(0.4);
    expect(n).toBe(2);
  });
});
