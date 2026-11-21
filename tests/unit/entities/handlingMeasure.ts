// CARS3: scripted driving manoeuvres on a headless Vehicle, shared by the handling tests and the report (HANDLING_REPORT=<file>).
import * as THREE from 'three';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import type { IMaterialLibrary, VehicleInput, VehicleType } from '@/world/types';

const mat = () => new THREE.MeshBasicMaterial();
const stubMaterials: IMaterialLibrary = { get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {} };
export const input = (o: Partial<VehicleInput> = {}): VehicleInput => ({ throttle: 0, steer: 0, brake: false, handbrake: false, horn: false, ...o });
export const DT = 1 / 60;
const DEG = 180 / Math.PI;
export function make(type: VehicleType, speed = 0, driver: 'player' | 'traffic' | 'cop' = 'player'): Vehicle {
  const v = new Vehicle('m-' + type, VEHICLE_SPECS[type], { x: 0, z: 0 }, 0, stubMaterials, new EventBus());
  v.driver = driver;
  v.body.vel = { x: 0, z: -speed }; // heading 0 faces -z
  return v;
}
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** angle between heading and velocity, degrees */
export const slipDeg = (v: Vehicle) => Math.abs(Math.atan2(v.lateralSpeed, Math.max(Math.abs(v.speed), 0.5))) * DEG;

export function launch(type: VehicleType) {
  const v = make(type);
  v.setInput(input({ throttle: 1 }));
  let t93 = Infinity, t100 = Infinity, spin = 0;
  for (let i = 1; i <= 60 * 40; i++) {
    v.update(DT);
    spin = Math.max(spin, v.handling.wheelspin);
    if (t100 === Infinity && v.speed >= 100 / 3.6) t100 = i * DT;
    if (v.speed >= 0.93 * v.spec.maxSpeed) { t93 = i * DT; break; }
  }
  return { t93, t100, spin };
}
export function stop(type: VehicleType, v0: number, o: Partial<VehicleInput> = {}) {
  const v = make(type, v0);
  v.setInput(input({ brake: true, ...o }));
  let dist = 0, time = 0, maxPitch = 0, maxSlip = 0;
  for (let i = 0; i < 60 * 15 && v.speed > 0.05; i++) {
    const s = v.speed; v.update(DT); dist += s * DT; time += DT; maxSlip = Math.max(maxSlip, slipDeg(v));
    maxPitch = Math.max(maxPitch, Math.abs(v.object3D.children[0]?.rotation.x ?? 0));
  }
  return { dist, time, maxSlip, maxPitch, endSpeed: v.speed, endLat: v.lateralSpeed };
}
/** hold full lock (keys) at a constant speed (cruise via throttle) for `secs`; report the steady radius, lateral g, slip */
export function radius(type: VehicleType, v0: number, steer = 1, secs = 4) {
  const v = make(type, v0);
  let yaw = 0, prev = v.body.heading, latA = 0, slip = 0, rollMax = 0;
  for (let i = 0; i < secs * 60; i++) {
    const sp = Math.hypot(v.body.vel.x, v.body.vel.z);
    v.setInput(input({ throttle: sp < v0 ? Math.min(1, 0.2 + (v0 - sp) * 0.5) : 0, steer }));
    v.update(DT);
    yaw = wrap(v.body.heading - prev) / DT; prev = v.body.heading;
    slip = slipDeg(v);
    rollMax = Math.max(rollMax, Math.abs(v.object3D.children[0]?.rotation.z ?? 0));
  }
  const sp = Math.hypot(v.body.vel.x, v.body.vel.z);
  latA = sp * Math.abs(yaw);
  return { radius: sp / Math.max(1e-3, Math.abs(yaw)), latG: latA / 9.81, slip, speed: sp, rollDeg: rollMax * DEG };
}
/** 90 degree corner at `kmh`: speed held with light throttle, full lock held until the heading has turned 90 degrees (or 6 s) */
export function corner90(type: VehicleType, kmh = 40, steer = 1) {
  const v = make(type, kmh / 3.6);
  const h0 = v.body.heading;
  let t = 0, maxSlip = 0, rollMax = 0, pitchMax = 0, yawMax = 0, prev = h0;
  const x0 = { x: 0, z: 0 };
  for (; t < 6; t += DT) {
    const sp = Math.hypot(v.body.vel.x, v.body.vel.z);
    v.setInput(input({ throttle: sp < kmh / 3.6 ? Math.min(1, 0.15 + (kmh / 3.6 - sp) * 0.4) : 0, steer }));
    v.update(DT);
    maxSlip = Math.max(maxSlip, slipDeg(v));
    rollMax = Math.max(rollMax, Math.abs(v.object3D.children[0]?.rotation.z ?? 0));
    pitchMax = Math.max(pitchMax, Math.abs(v.object3D.children[0]?.rotation.x ?? 0));
    yawMax = Math.max(yawMax, Math.abs(wrap(v.body.heading - prev) / DT)); prev = v.body.heading;
    if (Math.abs(wrap(v.body.heading - h0)) >= Math.PI / 2) break;
  }
  const dx = Math.abs(v.body.pos.x - x0.x), dz = Math.abs(v.body.pos.z - x0.z);
  return { time: t, exitKmh: v.speedKmh, maxSlip, rollDeg: rollMax * DEG, pitchDeg: pitchMax * DEG, yawMax, sweep: Math.max(dx, dz), turned: Math.abs(wrap(v.body.heading - h0)) * DEG };
}
/** handbrake turn: at v0 turn in (steer .8) with the handbrake for `hb` s, then release both and steer 0, throttle 0 */
export function handbrakeTurn(type: VehicleType, v0 = 15, hb = 0.7, steer = 0.8) {
  const v = make(type, v0);
  const h0 = v.body.heading;
  let maxSlip = 0, t = 0, settle = Infinity;
  for (; t < 8; t += DT) {
    const on = t < hb;
    v.setInput(input({ steer: on ? steer : 0, handbrake: on, throttle: 0 }));
    v.update(DT);
    maxSlip = Math.max(maxSlip, slipDeg(v));
    if (!on && settle === Infinity && Math.abs(v.lateralSpeed) < 1.2 && Math.abs(v.handling.alphaR) < 0.1 && Math.abs(v.yawRateRad) < 0.25) settle = t - hb;
  }
  return { turnedDeg: Math.abs(wrap(v.body.heading - h0)) * DEG, maxSlip, settle, endSpeed: v.speed, endLat: Math.abs(v.lateralSpeed) };
}
/** lift-off: cornering at v0 under throttle, then lift: extra yaw rate (rad/s) after 0.5 s vs holding the throttle */
export function liftOff(type: VehicleType, v0: number, steer = 0.5) {
  const run = (lift: boolean) => {
    const v = make(type, v0);
    for (let i = 0; i < 120; i++) { v.setInput(input({ throttle: 0.7, steer })); v.update(DT); }
    const y0 = v.yawRateRad;
    let slipMax = 0;
    for (let i = 0; i < 40; i++) { v.setInput(input({ throttle: lift ? 0 : 0.7, steer })); v.update(DT); slipMax = Math.max(slipMax, slipDeg(v)); }
    return { y0, y1: v.yawRateRad, slipMax };
  };
  const a = run(true), b = run(false);
  return { yawGainLift: a.y1 - a.y0, yawGainHold: b.y1 - b.y0, slipLift: a.slipMax, slipHold: b.slipMax };
}
/** a spin: give the car a sideways slide and yaw, release everything, and report seconds and metres until it is straight and slow in slip */
export function spinRecovery(type: VehicleType, v0 = 20) {
  const v = make(type, v0);
  v.setInput(input({ steer: 1, handbrake: true }));
  for (let i = 0; i < 40; i++) v.update(DT);
  let maxYaw = 0;
  v.setInput(input());
  let t = 0, dist = 0, settle = Infinity;
  for (; t < 10; t += DT) {
    const s = Math.hypot(v.body.vel.x, v.body.vel.z); v.update(DT); dist += s * DT;
    maxYaw = Math.max(maxYaw, Math.abs(v.yawRateRad));
    if (settle === Infinity && Math.abs(v.yawRateRad) < 0.15 && slipDeg(v) < 6) { settle = t; }
  }
  return { settle, dist, maxYaw, endSpeed: Math.hypot(v.body.vel.x, v.body.vel.z), endYaw: v.yawRateRad };
}
