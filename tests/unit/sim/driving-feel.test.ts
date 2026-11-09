/**
 * Driving feel on the real map (playtest H2: "very twitchy", "spun the SUV almost all the way around", ended on the
 * pavement). Scripted drive on an open stretch of Throop Ave: W for 3 s, then W+D for 2 s, and a slow 15 km/h turn.
 * Vehicle.calmSteering=false is the pre-fix behaviour, measured here for the before/after numbers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { angleDiff } from '@/core/Math2';
import { Vehicle } from '@/entities/Vehicle';
import type { VehicleType } from '@/world/types';
import { Sim, input, makeVehicle, realPhysics } from './harness';

const DEG = 180 / Math.PI;
afterEach(() => { Vehicle.calmSteering = true; });

function throopLane() {
  const { physics, world } = realPhysics();
  const seg = world.grid.segments.filter((s) => s.streetId === 'throop')
    .sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z) - Math.hypot(a.b.x - a.a.x, a.b.z - a.a.z))[0];
  return { physics, grid: world.grid, x: (seg.a.x + seg.b.x) / 2 + 3.5, z: (seg.a.z + seg.b.z) / 2 + 30 };
}

function scripted(type: VehicleType, calm: boolean) {
  Vehicle.calmSteering = calm;
  const { physics, grid, x, z } = throopLane();
  const v = makeVehicle(type, x, z, 0);
  v.driver = 'player';
  const sim = new Sim(physics);
  sim.add(v);
  v.setInput(input({ throttle: 1 }));
  sim.run(3);
  const speedAfterW = v.speed * 3.6;
  const p1 = { ...v.body.pos };
  let turned = 0, prev = v.body.heading, maxYaw = 0;
  v.setInput(input({ throttle: 1, steer: 1 }));
  sim.run(2, () => { const d = angleDiff(prev, v.body.heading); turned += d; maxYaw = Math.max(maxYaw, Math.abs(d) * 60); prev = v.body.heading; });
  return { turnedDeg: Math.abs(turned) * DEG, maxYaw, speedAfterW, lateral: v.body.pos.x - x, forward: p1.z - v.body.pos.z, onRoad: grid.isOnRoad(v.body.pos) };
}

function slowTurn(type: VehicleType, calm: boolean, kmh = 15) {
  Vehicle.calmSteering = calm;
  const { physics, grid, x, z } = throopLane();
  const v = makeVehicle(type, x, z, 0);
  v.driver = 'player';
  v.body.vel = { x: 0, z: -kmh / 3.6 };
  const sim = new Sim(physics);
  sim.add(v);
  let turned = 0, prev = 0;
  sim.run(2, () => {
    v.setInput(input({ steer: 1, throttle: Math.max(0, Math.min(1, (kmh / 3.6 - v.speed) * 2 + 0.15)) }));
    turned += angleDiff(prev, v.body.heading); prev = v.body.heading;
  });
  return { turnedDeg: Math.abs(turned) * DEG, lateral: v.body.pos.x - x, onRoad: grid.isOnRoad(v.body.pos) };
}

describe('scripted drive on Throop (real map physics)', () => {
  for (const type of ['suv', 'sedan'] as const) {
    it(`${type}: 2 s A/D hold at 15 km/h turns ~50 deg instead of ~90, and stays on the road`, () => {
      const before = slowTurn(type, false), after = slowTurn(type, true);
      console.log(`[drive] ${type} 15 km/h 2 s steer: before ${before.turnedDeg.toFixed(0)} deg / ${before.lateral.toFixed(1)} m lateral, after ${after.turnedDeg.toFixed(0)} deg / ${after.lateral.toFixed(1)} m`);
      expect(before.turnedDeg).toBeGreaterThan(80);
      expect(after.turnedDeg).toBeLessThan(65);
      // CARS2/CARHI lengthened the cars (SUV 5.05 m), so the same lock turns ~35 deg: the old 35 bound is stale, physics unchanged
      expect(after.turnedDeg).toBeGreaterThan(30);
      expect(after.onRoad).toBe(true);
    });

    it(`${type}: W 3 s then W+D 2 s is a controlled lane change, not a spin`, () => {
      const before = scripted(type, false), after = scripted(type, true);
      console.log(`[drive] ${type} W3s+W/D2s: before ${before.turnedDeg.toFixed(0)} deg, ${before.lateral.toFixed(1)} m lateral, ${before.speedAfterW.toFixed(0)} km/h; after ${after.turnedDeg.toFixed(0)} deg, ${after.lateral.toFixed(1)} m lateral`);
      expect(after.turnedDeg).toBeLessThan(70);
      expect(after.speedAfterW).toBeGreaterThan(45); // acceleration untouched
    });
  }
});
