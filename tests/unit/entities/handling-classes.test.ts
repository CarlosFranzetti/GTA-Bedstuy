import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import type { IMaterialLibrary, VehicleInput, VehicleType } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const stubMaterials: IMaterialLibrary = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} };
const input = (o: Partial<VehicleInput> = {}): VehicleInput => ({ throttle: 0, steer: 0, brake: false, handbrake: false, horn: false, ...o });
const make = (type: VehicleType) => {
  const v = new Vehicle('v1', VEHICLE_SPECS[type], { x: 0, z: 0 }, 0, stubMaterials, new EventBus());
  v.driver = 'player';
  return v;
};

const NEW = ['coupe911', 'exotic', 'jdmcoupe', 'hothatch', 'muscle', 'wedgetruck', 'evsedan'] as const;

/** seconds of full throttle to reach 0.93 x top speed (the spec's "0-100 km/h" scaled to the sim) */
const launch = (type: VehicleType): number => {
  const v = make(type);
  v.setInput(input({ throttle: 1 }));
  for (let i = 1; i <= 60 * 40; i++) { v.update(1 / 60); if (v.speed >= 0.93 * v.spec.maxSpeed) return i / 60; }
  return Infinity;
};
/** steady-state turn radius (m) at 15 m/s: coast at 15 m/s, full lock, measure yaw rate */
const turnRadius = (type: VehicleType, throttle = 0): number => {
  const v = make(type);
  v.body.vel = { x: 0, z: -15 };
  v.setInput(input({ throttle, steer: 1 }));
  let yaw = 0, prev = v.body.heading;
  for (let i = 0; i < 180; i++) {
    const spd = v.speed;
    if (throttle === 0 && spd < 15) v.setInput(input({ throttle: 0.18, steer: 1 })); else v.setInput(input({ throttle, steer: 1 }));
    v.update(1 / 60);
    const h = v.body.heading; let d = h - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    yaw = d * 60; prev = h;
  }
  return 15 / Math.max(1e-3, Math.abs(yaw));
};

describe('CARS14 handling classes', () => {
  it('0-100 ordering: exotic < evsedan < muscle < coupe911 < jdmcoupe < wedgetruck < hothatch', () => {
    const t = Object.fromEntries(NEW.map((k) => [k, launch(k)]));
    const order = ['exotic', 'evsedan', 'muscle', 'coupe911', 'jdmcoupe', 'wedgetruck', 'hothatch'] as const;
    for (let i = 1; i < order.length; i++) expect(t[order[i - 1]], `${order[i - 1]} vs ${order[i]}`).toBeLessThan(t[order[i]]);
  });
  it('top speed ordering: exotic > coupe911 > muscle > hothatch > jdmcoupe > evsedan > wedgetruck', () => {
    const order = ['exotic', 'coupe911', 'muscle', 'hothatch', 'jdmcoupe', 'evsedan', 'wedgetruck'] as const;
    for (let i = 1; i < order.length; i++) expect(VEHICLE_SPECS[order[i - 1]].maxSpeed).toBeGreaterThan(VEHICLE_SPECS[order[i]].maxSpeed);
  });
  it('turn radius at 15 m/s: exotic tightest, wedge truck widest, muscle wider than hothatch', () => {
    const r = Object.fromEntries(NEW.map((k) => [k, turnRadius(k)]));
    for (const k of NEW) if (k !== 'exotic') expect(r.exotic).toBeLessThan(r[k]);
    for (const k of NEW) if (k !== 'wedgetruck') expect(r.wedgetruck).toBeGreaterThan(r[k]);
    expect(r.muscle).toBeGreaterThan(r.hothatch);
  });
  it('under throttle a rear-driven car rotates more than a front-driven one (same steer, same speed)', () => {
    const rwd = turnRadius('jdmcoupe', 1), fwd = turnRadius('hothatch', 1);
    expect(rwd).toBeLessThan(fwd);
  });
  it('electric cars flag electric and keep torque flat: evsedan reaches 85% of top speed sooner after 50% than a combustion car would at the same A', () => {
    const t = (type: VehicleType, a: number, b: number) => {
      const v = make(type); v.setInput(input({ throttle: 1 })); let ta = 0;
      for (let i = 1; i <= 60 * 40; i++) { v.update(1 / 60); const f = v.speed / v.spec.maxSpeed; if (!ta && f >= a) ta = i / 60; if (f >= b) return i / 60 - ta; }
      return Infinity;
    };
    // flat torque: the 50%->85% stretch is a small multiple of 0->50%, while a squared drag curve stretches it much more
    const ev = t('evsedan', 0.5, 0.85) / t('evsedan', 0, 0.5);
    const ice = t('muscle', 0.5, 0.85) / t('muscle', 0, 0.5);
    expect(VEHICLE_SPECS.evsedan.electric && VEHICLE_SPECS.wedgetruck.electric).toBe(true);
    expect(ev).toBeLessThan(ice);
  });
  it('old types carry no drivetrain (behaviour unchanged)', () => {
    for (const k of ['sedan', 'pony', 'suv', 'cop'] as const) expect(VEHICLE_SPECS[k].drivetrain).toBeUndefined();
  });
});
