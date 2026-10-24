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

  it.each(['sedan', 'suv', 'boxtruck', 'cop'] as const)('%s: full throttle 6 s reaches >= 0.8 maxSpeed, never exceeds it', (type) => {
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

  it('brake from 20 m/s stops within 3 s', () => {
    const v = make();
    v.driver = 'player';
    v.body.vel = { x: 0, z: -20 };
    v.setInput(input({ brake: true }));
    run(v, 3);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
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
});
