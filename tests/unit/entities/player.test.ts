import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus, type GameEvents } from '@/core/Events';
import type { Input } from '@/core/Input';
import type { IMaterialLibrary, IVehicle } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const stubMaterials: IMaterialLibrary = {
  get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {},
};

function fakeInput(down: string[] = [], pressed: string[] = []): Input {
  const d = new Set(down), p = new Set(pressed);
  return {
    isDown: (c: string) => d.has(c),
    pressed: (c: string) => p.has(c),
    axis: (neg: string[], pos: string[]) => (pos.some((c) => d.has(c)) ? 1 : 0) - (neg.some((c) => d.has(c)) ? 1 : 0),
    mouseDX: 0, mouseDY: 0, wheel: 0,
  } as unknown as Input;
}

function setup() {
  const events = new EventBus();
  const log: { type: string; payload: unknown }[] = [];
  for (const t of ['enterVehicle', 'exitVehicle', 'crime', 'radioNext'] as (keyof GameEvents)[]) {
    events.on(t, (payload) => log.push({ type: t, payload }));
  }
  const player = new Player('player', { x: 0, z: 0 }, stubMaterials, events);
  const car = (id: string, x: number, z: number, driver: IVehicle['driver'] = null) => {
    const v = new Vehicle(id, VEHICLE_SPECS.sedan, { x, z }, 0, stubMaterials, events);
    v.driver = driver;
    return v;
  };
  return { events, log, player, car };
}

describe('Player on foot', () => {
  it('has circle r 0.4, mass 80, kind player', () => {
    const { player } = setup();
    expect(player.body.shape).toEqual({ kind: 'circle', r: 0.4 });
    expect(player.body.mass).toBe(80);
    expect(player.body.kind).toBe('player');
  });

  it('W moves away from the camera at walking speed', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW']), 0);
    expect(player.body.vel.x).toBeCloseTo(0);
    expect(player.body.vel.z).toBeCloseTo(-3);
    expect(player.body.heading).toBeCloseTo(0);
    player.update(1);
    expect(player.body.pos.z).toBeCloseTo(-3);
  });

  it('movement is relative to camera yaw; heading = cameraYaw when pressing W', () => {
    const { player } = setup();
    const yaw = Math.PI / 2; // camera looking east
    player.control(fakeInput(['KeyW']), yaw);
    expect(player.body.vel.x).toBeCloseTo(3);
    expect(player.body.vel.z).toBeCloseTo(0);
    expect(player.body.heading).toBeCloseTo(yaw);
    // D strafes to the camera's right (south when looking east), heading faces motion
    player.control(fakeInput(['KeyD']), yaw);
    expect(player.body.vel.z).toBeCloseTo(3);
    expect(player.body.heading).toBeCloseTo(Math.PI);
  });

  it('shift runs; diagonals are not faster', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW', 'ShiftLeft']), 0);
    expect(Math.hypot(player.body.vel.x, player.body.vel.z)).toBeCloseTo(6.5);
    player.control(fakeInput(['KeyW', 'KeyD']), 0);
    expect(Math.hypot(player.body.vel.x, player.body.vel.z)).toBeCloseTo(3);
  });

  it('stops when no keys held', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW']), 0);
    player.control(fakeInput([]), 0);
    expect(player.body.vel).toEqual({ x: 0, z: 0 });
  });

  it('swings legs while moving and rests when idle', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW']), 0);
    for (let i = 0; i < 10; i++) player.update(1 / 30);
    const legs = [player.object3D.getObjectByName('legL')!, player.object3D.getObjectByName('legR')!];
    expect(Math.abs(legs[0].rotation.x)).toBeGreaterThan(0.05);
    expect(legs[0].rotation.x).toBeCloseTo(-legs[1].rotation.x);
    player.control(fakeInput([]), 0);
    for (let i = 0; i < 60; i++) player.update(1 / 30);
    expect(Math.abs(legs[0].rotation.x)).toBeLessThan(0.01);
  });
});

describe('Player vehicles', () => {
  it('tryEnter picks the nearest vehicle within 3 m and ignores one at 5 m', () => {
    const { player, car, log } = setup();
    const far = car('far', 5 + 1.2, 0); // door at x=5 (door is 1.2 left of centre)
    const near = car('near', 1.2 + 1.5, 0); // door at x=1.5
    const nearer = car('nearer', 1.2 + 0.5, 0);
    expect(player.tryEnter([far])).toBeNull();
    expect(player.inVehicle).toBe(false);
    expect(player.tryEnter([far, near, nearer])).toBe(nearer);
    expect(player.vehicle).toBe(nearer);
    expect(nearer.driver).toBe('player');
    expect(near.driver).toBeNull();
    expect(player.object3D.visible).toBe(false);
    expect(log.map((l) => l.type)).toEqual(['enterVehicle']);
  });

  it('carjack crime only when the car had a traffic/cop driver', () => {
    const a = setup();
    a.player.tryEnter([a.car('parked', 1.2, 0, null)]);
    expect(a.log.some((l) => l.type === 'crime')).toBe(false);

    const b = setup();
    b.player.tryEnter([b.car('t', 1.2, 0, 'traffic')]);
    expect(b.log.find((l) => l.type === 'crime')?.payload).toMatchObject({ type: 'carjack' });

    const c = setup();
    c.player.tryEnter([c.car('c', 1.2, 0, 'cop')]);
    expect(c.log.filter((l) => l.type === 'crime')).toHaveLength(1);
  });

  it('control in a vehicle derives VehicleInput and calls setInput; E fires radioNext', () => {
    const { player, car, log } = setup();
    const v = car('v', 1.2, 0);
    player.tryEnter([v]);
    player.control(fakeInput(['KeyW', 'KeyD', 'Space', 'ShiftLeft', 'KeyH'], ['KeyE']), 0);
    expect(player.lastVehicleInput).toEqual({ throttle: 1, steer: 1, brake: true, handbrake: true, horn: true });
    expect(log.some((l) => l.type === 'radioNext')).toBe(true);
    v.update(1 / 60); // input arrived at the vehicle
    expect(v.body.vel.z).toBeLessThan(0.0001);
    player.control(fakeInput(['KeyS', 'KeyA']), 0);
    expect(player.lastVehicleInput).toMatchObject({ throttle: -1, steer: -1, brake: false });
  });

  it('driving moves the vehicle and the player body follows it', () => {
    const { player, car } = setup();
    const v = car('v', 1.2, 0);
    player.tryEnter([v]);
    player.control(fakeInput(['KeyW']), 0);
    for (let i = 0; i < 120; i++) { v.update(1 / 60); player.update(1 / 60); }
    expect(player.body.pos.z).toBeCloseTo(v.body.pos.z);
    expect(player.body.pos.z).toBeLessThan(-5);
    expect(player.body.shape).toEqual({ kind: 'circle', r: 0.01 });
    expect(player.inVehicle).toBe(true);
    expect(player.body.kind).toBe('player');
  });

  it('exit places the player at the door, releases the car and restores the collision radius', () => {
    const { player, car, log } = setup();
    const v = car('v', 10, 10);
    player.body.pos = { x: 10, z: 10 };
    player.tryEnter([v]);
    const door = v.doorPos();
    player.exit();
    expect(player.inVehicle).toBe(false);
    expect(v.driver).toBeNull();
    expect(player.body.pos.x).toBeCloseTo(door.x);
    expect(player.body.pos.z).toBeCloseTo(door.z);
    expect(player.body.shape).toEqual({ kind: 'circle', r: 0.4 });
    expect(player.object3D.visible).toBe(true);
    expect(log.map((l) => l.type)).toEqual(['enterVehicle', 'exitVehicle']);
    // exit when on foot is a no-op
    player.exit();
    expect(log).toHaveLength(2);
  });

  it('cannot enter a vehicle already driven by the player', () => {
    const { player, car } = setup();
    const v = car('v', 1.2, 0, 'player');
    expect(player.tryEnter([v])).toBeNull();
  });
});
