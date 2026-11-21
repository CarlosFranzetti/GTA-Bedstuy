// CARS3: AI-driven cars (driver 'traffic' / 'cop') must keep the trajectories they had BEFORE the player handling profile existed.
// The fixture was recorded from the unmodified Vehicle.ts on 21 Nov 2026. Regenerate it only on purpose: UPDATE_AI_TRAJ=1.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import type { IMaterialLibrary, VehicleInput, VehicleType } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const stubMaterials: IMaterialLibrary = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} };
const FIXTURE = new URL('./fixtures/ai-trajectory.json', import.meta.url).pathname;
const TYPES: VehicleType[] = ['sedan', 'suv', 'bus', 'cab', 'pony', 'coupe911', 'exotic', 'muscle', 'boxtruck', 'hothatch', 'wedgetruck', 'cop', 'beater', 'pickup', 'garbage'];

/** a fixed 24 s script: launch, slalom, brake, reverse, handbrake turn, coast, throttle + lock */
function script(t: number): VehicleInput {
  const n = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };
  if (t < 5) return { ...n, throttle: 1 };
  if (t < 9) return { ...n, throttle: 0.6, steer: Math.sin((t - 5) * 2.2) };
  if (t < 11) return { ...n, brake: true, steer: 0.3 };
  if (t < 14) return { ...n, throttle: -1, steer: -0.5 };
  if (t < 15) return { ...n, throttle: 1 };
  if (t < 17) return { ...n, throttle: 0.5, steer: 1, handbrake: true };
  if (t < 20) return { ...n, steer: -0.4 };
  return { ...n, throttle: 1, steer: 1 };
}

function record(type: VehicleType, driver: 'traffic' | 'cop'): number[][] {
  const v = new Vehicle('traj-' + type, VEHICLE_SPECS[type], { x: 0, z: 0 }, 0.3, stubMaterials, new EventBus());
  v.driver = driver;
  const out: number[][] = [];
  const r = (x: number) => Math.round(x * 1e5) / 1e5 + 0; // + 0 turns -0 into 0 (JSON drops the sign)
  for (let i = 0; i < 24 * 60; i++) {
    v.setInput(script(i / 60));
    v.update(1 / 60);
    if (i % 20 === 19) out.push([r(v.body.pos.x), r(v.body.pos.z), r(v.body.heading), r(v.body.vel.x), r(v.body.vel.z), r(v.slip), r(v.steering)]);
  }
  return out;
}

describe('AI-driven cars keep their pre-CARS3 trajectories', () => {
  const all: Record<string, number[][]> = {};
  for (const t of TYPES) all[t] = record(t, t === 'cop' ? 'cop' : 'traffic');
  if (process.env.UPDATE_AI_TRAJ === '1') writeFileSync(FIXTURE, JSON.stringify(all));
  const ref = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, number[][]>) : null;
  for (const t of TYPES) {
    it(`${t}: identical to the recorded trajectory`, () => {
      expect(ref, 'fixture missing').not.toBeNull();
      expect(all[t]).toEqual(ref![t]);
    });
  }
});
