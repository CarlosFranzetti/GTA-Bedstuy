import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { FULL_DENSITY, TrafficSystem } from '@/game/TrafficSystem';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { TIER_CONFIG } from '@/render/QualityTier';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { Body2D, IMaterialLibrary, IVehicle, IWorld2D } from '@/world/types';

const grid = buildGrid(loadBedstuyData());
const materials = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;

class FakeWorld implements IWorld2D {
  bodies_: Body2D[] = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody(b: Body2D) { this.bodies_.push(b); }
  removeBody(id: string) { this.bodies_ = this.bodies_.filter((b) => b.id !== id); }
  step() { return []; }
  queryCircle() { return []; }
  raycast() { return null; }
  bodies() { return this.bodies_; }
}

function fakeCar(id: string, x: number, z: number, heading: number): IVehicle {
  const body: Body2D = { id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400 };
  const v = {
    id, object3D: new THREE.Group(), body,
    spec: { type: 'sedan' as const, length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
    speed: 0, damage: 0, driver: 'traffic' as IVehicle['driver'], siren: false,
    setSpeed() {}, setInput() {}, doorPos() { return { x, z }; }, update() {}, dispose() {},
  };
  body.userData = v;
  return v as unknown as IVehicle;
}

function make(density?: Parameters<typeof Object.assign>[1]) {
  const world = new FakeWorld();
  let n = 0;
  const sys = new TrafficSystem(grid, world, new EventBus(), new Rng(5), new THREE.Scene(), materials,
    (_t, pos, heading) => fakeCar(`c${n++}`, pos.x, pos.z, heading), undefined, undefined, undefined, density);
  return { sys, world };
}

const parked = (s: TrafficSystem) => s.vehicles.filter((v) => v.driver === null).length;

describe('traffic density per tier', () => {
  it('the default density is the old full density (low/medium/high unchanged)', () => {
    expect(FULL_DENSITY).toEqual({ maxMoving: 30, peds: 40, parkOccupancy: 0.65 });
    const { sys } = make();
    expect(sys.peds).toHaveLength(40);
  });

  it('phone spawns 14 peds, fewer parked cars, and at most 10 moving cars', () => {
    const full = make();
    const phone = make(TIER_CONFIG.phone.traffic);
    expect(phone.sys.peds).toHaveLength(14);
    expect(parked(phone.sys)).toBeLessThan(parked(full.sys) * 0.6);
    for (let t = 0; t < 60; t += 0.25) phone.sys.update(0.25, { x: 0, z: 150 });
    expect(phone.sys.agentCount).toBeLessThanOrEqual(10);
    expect(phone.sys.agentCount).toBeGreaterThan(3);
    for (let t = 0; t < 60; t += 0.25) full.sys.update(0.25, { x: 0, z: 150 });
    expect(full.sys.agentCount).toBeGreaterThan(10);
  });

  it('setDensity thins peds and parked cars at runtime and can add peds back', () => {
    const { sys, world } = make();
    const parked0 = parked(sys);
    const bodies0 = world.bodies().length;
    sys.setDensity(TIER_CONFIG.phone.traffic);
    expect(sys.peds).toHaveLength(14);
    expect(parked(sys)).toBeLessThan(parked0 * 0.6);
    expect(world.bodies().length).toBeLessThan(bodies0 - 26); // removed peds and cars also left the physics world
    sys.setDensity({ peds: 20 });
    expect(sys.peds).toHaveLength(20);
    expect(new Set(sys.peds.map((p) => p.id)).size).toBe(20); // ids stay unique after removals
  });
});

describe('cop patrols per tier', () => {
  it('setPatrolCount limits how many patrol cars the system keeps', () => {
    const world = new FakeWorld();
    let n = 0;
    const cops = new CopSystem(grid, world, new EventBus(), new Rng(3), new THREE.Scene(),
      (_t, pos, heading) => fakeCar(`k${n++}`, pos.x, pos.z, heading), new WantedSystem(new EventBus()), { patrolCount: 2 });
    cops.setPatrolCount(TIER_CONFIG.phone.traffic.cops);
    for (let t = 0; t < 300; t += 0.5) cops.update(0.5, { x: 0, z: 150 });
    expect(cops.cops.length).toBeLessThanOrEqual(1);
    expect(cops.cops.length).toBe(1);
  });
});
