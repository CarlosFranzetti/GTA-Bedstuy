/**
 * STUCK: parked cars on street faces keep real alternate-side-parking spacing so a player who enters one is never
 * boxed in nose to tail. Uses the real Bed-Stuy grid with unit-sized car stand-ins.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { dist, forwardFromHeading } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { PARK_MIN_GAP, PLAYER_SPAWN, SPAWN_CAR_CLEAR, TrafficSystem } from '@/game/TrafficSystem';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { Body2D, IMaterialLibrary, IVehicle, IWorld2D, VehicleType } from '@/world/types';

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

function car(id: string, type: VehicleType, x: number, z: number, heading: number): IVehicle {
  const spec = { ...VEHICLE_SPECS[type] };
  const body: Body2D = { id, kind: 'vehicle', shape: { kind: 'obb', halfW: spec.width / 2, halfL: spec.length / 2 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400 };
  const v = { id, object3D: new THREE.Group(), body, spec, speed: 0, damage: 0, driver: 'traffic', siren: false, setSpeed() {}, setInput() {}, doorPos() { return { x, z }; }, update() {}, dispose() {} };
  body.userData = v;
  return v as unknown as IVehicle;
}

function parkedCars(seed: number): IVehicle[] {
  let n = 0;
  const sys = new TrafficSystem(grid, new FakeWorld(), new EventBus(), new Rng(seed), new THREE.Scene(), materials,
    (t, pos, h) => car(`c${n++}`, t, pos.x, pos.z, h));
  return sys.vehicles.filter((v) => v.driver === null);
}

const half = (v: IVehicle) => v.spec.length / 2;

describe('parked car placement', () => {
  for (const seed of [1, 5, 99]) {
    it(`seed ${seed}: every pair of parked cars on one kerb is >= ${PARK_MIN_GAP} m bumper to bumper`, () => {
      const cars = parkedCars(seed);
      expect(cars.length).toBeGreaterThan(40);
      let worst = Infinity;
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i], b = cars[j];
          // same kerb = same heading (or opposite) and laterally within a car width of each other
          const f = forwardFromHeading(a.body.heading);
          const dx = b.body.pos.x - a.body.pos.x, dz = b.body.pos.z - a.body.pos.z;
          const along = Math.abs(dx * f.x + dz * f.z);
          const lateral = Math.abs(-dx * f.z + dz * f.x);
          if (lateral > 1.5) continue;
          const gap = along - half(a) - half(b);
          worst = Math.min(worst, gap);
        }
      }
      expect(worst).toBeGreaterThanOrEqual(PARK_MIN_GAP - 1e-6);
    });
  }

  it('is sparser than the old 11 m slots (fewer cars per kerb metre)', () => {
    const n = parkedCars(5).length;
    // the old 11 m placement put 241 cars on the ten-block map with seed 5 (195 with the sparser slots); scaled to the 25 blocks since B1
    expect(n).toBeLessThan(215 * (grid.blocks.length / 10));
  });

  it('corners stay clear: no parked bumper within 8 m of an intersection edge along its street', () => {
    const cars = parkedCars(5);
    let checked = 0;
    for (const seg of grid.segments) {
      const L = dist(seg.a, seg.b);
      const f = { x: (seg.b.x - seg.a.x) / L, z: (seg.b.z - seg.a.z) / L };
      for (const v of cars) {
        const dx = v.body.pos.x - seg.a.x, dz = v.body.pos.z - seg.a.z;
        const along = dx * f.x + dz * f.z;
        const lateral = Math.abs(-dx * f.z + dz * f.x);
        if (lateral > seg.width / 2 || along < 0 || along > L) continue;
        checked++;
        expect(along - half(v)).toBeGreaterThanOrEqual(8);
        expect(L - along - half(v)).toBeGreaterThanOrEqual(8);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('the spawn car exists near the spawn point and nothing else is parked within 7 m of it', () => {
    for (const seed of [1, 5, 99]) {
      const cars = parkedCars(seed);
      const spawnCar = cars.reduce((a, b) => (dist(a.body.pos, PLAYER_SPAWN) <= dist(b.body.pos, PLAYER_SPAWN) ? a : b));
      expect(dist(spawnCar.body.pos, PLAYER_SPAWN)).toBeLessThan(40);
      for (const c of cars) if (c !== spawnCar) expect(dist(c.body.pos, spawnCar.body.pos)).toBeGreaterThanOrEqual(SPAWN_CAR_CLEAR);
    }
  });
});
