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
    consume: (c: string) => p.delete(c),
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

  const stepFor = (player: Player, secs: number, dt = 1 / 60) => { for (let t = 0; t < secs - 1e-9; t += dt) player.update(dt); };

  it('W accelerates toward walking speed over several steps, not instantly', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW']), 0);
    const speeds: number[] = [];
    for (let i = 0; i < 20; i++) { player.update(1 / 60); speeds.push(Math.hypot(player.body.vel.x, player.body.vel.z)); }
    expect(speeds[0]).toBeGreaterThan(0);
    expect(speeds[0]).toBeLessThan(3);
    // strictly increasing for at least 3 steps before reaching the walk speed
    expect(speeds[1]).toBeGreaterThan(speeds[0]);
    expect(speeds[2]).toBeGreaterThan(speeds[1]);
    expect(speeds[3]).toBeGreaterThan(speeds[2]);
    expect(speeds[speeds.length - 1]).toBeCloseTo(3, 1);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(3 + 1e-9);
    expect(player.body.vel.x).toBeCloseTo(0);
    expect(player.body.vel.z).toBeLessThan(0); // north
    expect(player.body.heading).toBeCloseTo(0);
    stepFor(player, 1);
    expect(player.body.pos.z).toBeLessThan(-3);
    expect(player.body.pos.z).toBeGreaterThan(-4.5);
  });

  it('movement is relative to camera yaw; facing turns smoothly toward the move direction', () => {
    const { player } = setup();
    const yaw = Math.PI / 2; // camera looking east
    player.control(fakeInput(['KeyW']), yaw);
    player.update(1 / 60);
    expect(player.body.heading).toBeGreaterThan(0);
    expect(player.body.heading).toBeLessThan(yaw - 0.1); // not snapped
    stepFor(player, 1);
    expect(player.body.vel.x).toBeCloseTo(3, 1);
    expect(player.body.vel.z).toBeCloseTo(0, 1);
    expect(player.body.heading).toBeCloseTo(yaw, 1);
    // D strafes to the camera's right (south when looking east), heading faces motion
    player.control(fakeInput(['KeyD']), yaw);
    stepFor(player, 1.5);
    expect(player.body.vel.z).toBeCloseTo(3, 1);
    expect(player.body.vel.x).toBeCloseTo(0, 1);
    expect(player.body.heading).toBeCloseTo(Math.PI, 1);
  });

  it('shift sprints with a short ramp; diagonals are not faster', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW', 'ShiftLeft']), 0);
    stepFor(player, 0.2);
    expect(Math.hypot(player.body.vel.x, player.body.vel.z)).toBeLessThan(6.5);
    expect(player.sprint).toBeGreaterThan(0);
    expect(player.sprint).toBeLessThan(1);
    stepFor(player, 2);
    expect(player.sprint).toBe(1);
    expect(Math.hypot(player.body.vel.x, player.body.vel.z)).toBeCloseTo(6.5, 1);
    player.control(fakeInput(['KeyW', 'KeyD']), 0);
    stepFor(player, 3);
    expect(Math.hypot(player.body.vel.x, player.body.vel.z)).toBeCloseTo(3, 1);
  });

  it('decelerates to a stop quickly but not instantly when no keys held', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW']), 0);
    stepFor(player, 1);
    player.control(fakeInput([]), 0);
    player.update(1 / 60);
    const sp = Math.hypot(player.body.vel.x, player.body.vel.z);
    expect(sp).toBeGreaterThan(0.5);
    expect(sp).toBeLessThan(3);
    stepFor(player, 0.5);
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

/** Finish the walk-to-door animation so the player is actually seated. */
const seat = (player: Player) => { for (let i = 0; i < 40 && !player.inVehicle; i++) player.update(1 / 60); };

describe('Player vehicles', () => {
  it('tryEnter picks the nearest vehicle within 3 m and ignores one at 5 m', () => {
    const { player, car, log } = setup();
    const far = car('far', 5 + 1.2, 0); // door at x=5 (door is 1.2 left of centre)
    const near = car('near', 1.2 + 1.5, 0); // door at x=1.5
    const nearer = car('nearer', 1.2 + 0.5, 0);
    expect(player.tryEnter([far])).toBeNull();
    expect(player.inVehicle).toBe(false);
    expect(player.tryEnter([far, near, nearer])).toBe(nearer);
    expect(nearer.driver).toBe('player'); // claimed immediately
    expect(player.inVehicle).toBe(false);  // still walking to the door
    seat(player);
    expect(player.vehicle).toBe(nearer);
    expect(near.driver).toBeNull();
    expect(player.object3D.visible).toBe(false);
    expect(log.map((l) => l.type)).toEqual(['enterVehicle']);
  });

  it('carjack crime only when the car had a traffic/cop driver', () => {
    const a = setup();
    a.player.tryEnter([a.car('parked', 1.2, 0, null)]); seat(a.player);
    expect(a.log.some((l) => l.type === 'crime')).toBe(false);

    const b = setup();
    b.player.tryEnter([b.car('t', 1.2, 0, 'traffic')]); seat(b.player);
    expect(b.log.find((l) => l.type === 'crime')?.payload).toMatchObject({ type: 'carjack' });

    const c = setup();
    c.player.tryEnter([c.car('c', 1.2, 0, 'cop')]); seat(c.player);
    expect(c.log.filter((l) => l.type === 'crime')).toHaveLength(1);
  });

  it('control in a vehicle derives VehicleInput and calls setInput; E fires radioNext', () => {
    const { player, car, log } = setup();
    const v = car('v', 1.2, 0);
    player.tryEnter([v]); seat(player);
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
    player.tryEnter([v]); seat(player);
    player.control(fakeInput(['KeyW']), 0);
    for (let i = 0; i < 120; i++) { v.update(1 / 60); player.update(1 / 60); }
    expect(player.body.pos.z).toBeCloseTo(v.body.pos.z);
    expect(player.body.pos.z).toBeLessThan(-5);
    expect(player.body.shape).toEqual({ kind: 'circle', r: 0.01 });
    expect(player.inVehicle).toBe(true);
    expect(player.body.kind).toBe('player');
  });

  it('enter-car: walks to the door over ~0.4 s, then teleports in', () => {
    const { player, car, log } = setup();
    const v = car('v', 10, 10);
    player.body.pos = { x: 8.2, z: 10.5 };
    expect(player.tryEnter([v])).toBe(v);
    expect(player.isEntering).toBe(true);
    const door = v.doorPos();
    const start = Math.hypot(player.body.pos.x - door.x, player.body.pos.z - door.z);
    let t = 0;
    for (; t < 0.3 && !player.inVehicle; t += 1 / 60) player.update(1 / 60);
    expect(player.inVehicle).toBe(false);
    expect(log).toHaveLength(0);
    const mid = Math.hypot(player.body.pos.x - door.x, player.body.pos.z - door.z);
    expect(mid).toBeLessThan(start);
    for (; t < 0.6 && !player.inVehicle; t += 1 / 60) player.update(1 / 60);
    expect(player.inVehicle).toBe(true);
    expect(t).toBeGreaterThan(0.35);
    expect(t).toBeLessThan(0.5);
    expect(player.object3D.visible).toBe(false);
    expect(log.map((l) => l.type)).toEqual(['enterVehicle']);
  });

  it('exit places the player beside the door, facing the car; releases the car and restores the collision radius', () => {
    const { player, car, log } = setup();
    const v = car('v', 10, 10);
    player.body.pos = { x: 10, z: 10 };
    player.tryEnter([v]); seat(player);
    const door = v.doorPos();
    player.exit();
    expect(player.inVehicle).toBe(false);
    expect(v.driver).toBeNull();
    // beside the door, on the left flank, clear of the body
    expect(player.body.pos.z).toBeCloseTo(door.z);
    expect(player.body.pos.x).toBeLessThan(door.x);
    expect(10 - player.body.pos.x).toBeGreaterThan(v.spec.width / 2 + 0.4);
    // facing the car (car is east of the player -> heading PI/2)
    expect(player.body.heading).toBeCloseTo(Math.PI / 2);
    expect(player.body.shape).toEqual({ kind: 'circle', r: 0.4 });
    expect(player.object3D.visible).toBe(true);
    expect(log.map((l) => l.type)).toEqual(['enterVehicle', 'exitVehicle']);
    // exit when on foot is a no-op
    player.exit();
    expect(log).toHaveLength(2);
  });

  it('prevPos / prevHeading hold the previous step; applyInterpolated blends them', () => {
    const { player } = setup();
    player.control(fakeInput(['KeyW']), 0);
    player.update(1 / 60);
    player.update(1 / 60);
    const z1 = player.prevPos.z;
    player.update(1 / 60);
    expect(player.prevPos.z).not.toBe(z1);
    player.applyInterpolated(0.5);
    expect(player.object3D.position.z).toBeCloseTo((player.prevPos.z + player.body.pos.z) / 2, 9);
    player.body.pos.z = -500;
    player.applyInterpolated(0.5);
    expect(player.object3D.position.z).toBe(-500);
  });

  it('cannot enter a vehicle already driven by the player', () => {
    const { player, car } = setup();
    const v = car('v', 1.2, 0, 'player');
    expect(player.tryEnter([v])).toBeNull();
  });
});
