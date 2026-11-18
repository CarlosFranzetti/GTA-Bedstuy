/**
 * Headless physics scenarios for the PHYSICS lane: the real World2D with real Vehicle / Player / Pedestrian objects stepped like
 * src/main.ts does. Each function returns plain numbers so the tests can assert on them and a script can print them.
 */
import { Sim, makeVehicle, input, DT, stubMaterials } from '../sim/harness';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { forwardFromHeading, perpRight } from '@/core/Math2';
import type { Body2D, VehicleInput, VehicleType } from '@/world/types';

export { Sim, makeVehicle, input, DT, stubMaterials };

export const speedOf = (b: Body2D): number => Math.hypot(b.vel.x, b.vel.z);
export const f1 = (n: number): string => n.toFixed(2);

/** Make a vehicle with a driver kind so it integrates like a driven car. */
export function driven(type: VehicleType, x: number, z: number, heading: number, id: string, driver: 'traffic' | 'player' | null = 'traffic'): Vehicle {
  const v = makeVehicle(type, x, z, heading, undefined, id);
  v.driver = driver;
  v.setInput(input());
  return v;
}

export function launch(v: Vehicle, speed: number): void {
  const f = forwardFromHeading(v.body.heading);
  v.body.vel.x = f.x * speed; v.body.vel.z = f.z * speed;
}

/** Worst corner penetration (m) of an OBB body into a vertical wall plane x = wx on the +x side (wall at x = wx, car approaching from -x). */
export function maxCornerX(b: Body2D): number {
  const s = b.shape as { halfW: number; halfL: number };
  const f = forwardFromHeading(b.heading), r = perpRight(f);
  let m = -Infinity;
  for (const sl of [-1, 1]) for (const sw of [-1, 1]) m = Math.max(m, b.pos.x + f.x * s.halfL * sl + r.x * s.halfW * sw);
  return m;
}

export interface WallResult {
  /** speed just before the first contact, m/s */
  impactSpeed: number;
  /** most speed the car had pointing away from the wall after the hit (rebound), m/s */
  reboundSpeed: number;
  /** deepest the car's body went past the wall plane (m, > 0 means tunnelled or sunk) */
  maxPenetration: number;
  /** x-movement range over the last second, cm (jitter while pressed against the wall) */
  jitterCm: number;
  /** speed along the wall, at the end, and its fraction of the entry tangential speed */
  endSpeed: number;
  tangentialKept: number;
  /** heading change in degrees over the whole run */
  yawChangeDeg: number;
  impacts: number;
  damage: number;
}

/** Drive into a wall along x = 0 (the car comes from -x). `approachDeg` 0 = head-on, 60 = shallow. Throttle held when `throttle`. */
export function wallRun(type: VehicleType, speed: number, approachDeg: number, opts: { throttle?: number; seconds?: number } = {}): WallResult {
  const sim = new Sim();
  sim.world.addStatic({ kind: 'segment', a: { x: 0, z: -400 }, b: { x: 0, z: 400 } }, { x: 0, z: 0 }, 'wall');
  const h = Math.PI / 2 + (approachDeg * Math.PI) / 180;
  const v = driven(type, -(speed * 0.06 + 3), 0, h, 'c');
  const thr = opts.throttle ?? 0;
  v.setInput(input({ throttle: thr }));
  sim.add(v);
  launch(v, speed);
  let impacts = 0;
  (v as unknown as { events: { on(t: string, f: () => void): void } }).events.on('impact', () => { impacts++; });
  let impactSpeed = 0, rebound = 0, maxPen = -Infinity, hit = false, tangEntry = 0;
  const xs: number[] = [];
  const h0 = v.body.heading;
  const n = Math.round((opts.seconds ?? 5) / DT);
  for (let i = 0; i < n; i++) {
    const pre = speedOf(v.body), preZ = Math.abs(v.body.vel.z);
    sim.step();
    const b = v.body;
    if (!hit && sim.contactsLastStep.length) { hit = true; impactSpeed = pre; tangEntry = preZ; }
    if (hit) rebound = Math.max(rebound, -b.vel.x);
    maxPen = Math.max(maxPen, maxCornerX(b));
    xs.push(b.pos.x);
  }
  const last = xs.slice(-60);
  return {
    impactSpeed, reboundSpeed: rebound, maxPenetration: maxPen,
    jitterCm: (Math.max(...last) - Math.min(...last)) * 100,
    endSpeed: speedOf(v.body), tangentialKept: tangEntry > 0.1 ? Math.abs(v.body.vel.z) / tangEntry : 0,
    yawChangeDeg: Math.abs((((v.body.heading - h0) * 180) / Math.PI + 540) % 360 - 180),
    impacts, damage: v.damage,
  };
}

export interface PairResult {
  /** speeds (m/s, along +x) of each car 0.5 s after contact began, and the total momentum before and after (kg m/s) */
  vA: number; vB: number; momBefore: number; momAfter: number;
  /** deepest overlap depth seen after 0.5 s (m) */
  residualOverlap: number;
  /** highest speed any car reached after the hit (m/s) */
  peakSpeed: number;
  /** largest yaw rate (rad/s equivalent: heading change per second) either car showed */
  peakSpin: number;
  separatedAt: number;
  endGap: number;
}

import { overlap } from '@/physics/Collider2D';

/**
 * Car `a` (moving, driver traffic) drives into car `b`. Cars lie on the x axis facing +x (heading 90 deg) unless `bHeading` /
 * `offsetZ` say otherwise. `bDriver` null = parked. Returns momentum and settling numbers.
 */
export function carCar(typeA: VehicleType, typeB: VehicleType, speedA: number, opts: { bHeading?: number; offsetZ?: number; speedB?: number; bDriver?: 'traffic' | null; aHeading?: number } = {}): PairResult & { a: Vehicle; b: Vehicle; sim: Sim; spinTotal: number } {
  const sim = new Sim();
  const a = driven(typeA, -(speedA * 0.06 + 1.5 + (VEHICLE_SPECS[typeA].length + VEHICLE_SPECS[typeB].length) / 2), 0, opts.aHeading ?? Math.PI / 2, 'A');
  const bh = opts.bHeading ?? Math.PI / 2;
  const b = driven(typeB, 0, opts.offsetZ ?? 0, bh, 'B', opts.bDriver === undefined ? null : opts.bDriver);
  sim.add(a); sim.add(b);
  launch(a, speedA);
  if (opts.speedB) launch(b, opts.speedB);
  const mom = (): number => a.body.mass * a.body.vel.x + b.body.mass * b.body.vel.x;
  const momBefore = mom();
  let t0 = -1, peak = 0, peakSpin = 0, resid = 0, sepAt = -1, spinTotal = 0, vA = 0, vB = 0, momAfter = 0;
  const h = { a: a.body.heading, b: b.body.heading };
  sim.run(4, (t) => {
    if (t0 < 0 && sim.contactsLastStep.length) t0 = t;
    peak = Math.max(peak, speedOf(a.body), speedOf(b.body));
    const sa = Math.abs(a.body.heading - h.a) / DT, sb = Math.abs(b.body.heading - h.b) / DT;
    peakSpin = Math.max(peakSpin, sa, sb);
    h.a = a.body.heading; h.b = b.body.heading;
    if (t0 >= 0 && t - t0 > 0.5) {
      const o = overlap(a.body, b.body);
      if (o) resid = Math.max(resid, o.depth);
      if (!o && sepAt < 0) sepAt = t - t0;
    }
    if (t0 >= 0 && Math.abs(t - t0 - 0.5) < DT / 2) { vA = a.body.vel.x; vB = b.body.vel.x; momAfter = mom(); }
  });
  spinTotal = Math.abs(a.body.heading - Math.PI / 2) + Math.abs(b.body.heading - bh);
  const o = overlap(a.body, b.body);
  return { vA, vB, momBefore, momAfter, residualOverlap: resid, peakSpeed: peak, peakSpin, separatedAt: sepAt, endGap: o ? -o.depth : 0.01, a, b, sim, spinTotal };
}

// ------------------------------------------------------------------------------------------------ handling

export interface Handling {
  type: VehicleType; v: number;
  /** steady turning radius at full steering held (m), or NaN when the car cannot reach the speed */
  radius: number;
  /** seconds and metres to stop from v with the brake held */
  stopT: number; stopD: number;
  /** peak slip angle (deg) during a 0.7 s handbrake turn, and seconds after release until slip < 6 deg again */
  hbSlip: number; hbRecover: number;
  /** peak slip angle (deg) when a 0.2 steering input is held for 2 s at speed (should stay small) */
  smallSteerSlip: number;
  /** peak slip angle (deg) in a 1 s left / right slalom, and the sideways swing (m) */
  slalomSlip: number; slalomSwing: number;
  /** peak slip angle after lifting the throttle in a held half-lock turn */
  liftSlip: number;
}

function cruiser(type: VehicleType, v: number, id: string): { sim: Sim; car: Vehicle; hold: (thr?: number) => void } {
  const sim = new Sim();
  const car = driven(type, 0, 0, 0, id, 'player');
  sim.add(car);
  launch(car, v);
  const hold = (): void => { /* placeholder */ };
  return { sim, car, hold };
}

export function slipDeg(v: Vehicle): number {
  const lon = v.speed, lat = v.lateralSpeed;
  if (Math.hypot(lon, lat) < 1) return 0;
  return Math.abs((Math.atan2(lat, Math.abs(lon)) * 180) / Math.PI);
}

export function measureHandling(type: VehicleType, v: number): Handling | null {
  const spec = VEHICLE_SPECS[type];
  if (v > spec.maxSpeed * 0.92) return null;
  const drive = (car: Vehicle, sim: Sim, seconds: number, steer: (t: number) => number, extra: (t: number) => Partial<VehicleInput> = () => ({}), onStep?: (t: number) => void): void => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      const err = v - car.speed;
      const e = extra(t);
      car.setInput(input({ throttle: Math.max(-1, Math.min(1, err * 0.8 + (v / spec.maxSpeed) ** 2)), steer: steer(t), ...e }));
      sim.step();
      onStep?.(t);
    }
  };
  // turning circle
  let radius: number;
  { const { sim, car } = cruiser(type, v, 'r');
    drive(car, sim, 4, () => 1);
    const h0 = car.body.heading;
    drive(car, sim, 2, () => 1);
    const dh = Math.abs(((car.body.heading - h0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    radius = Math.hypot(car.body.vel.x, car.body.vel.z) / Math.max(dh / 2, 1e-3); }
  // stop
  let stopT = 0, stopD = 0;
  { const { sim, car } = cruiser(type, v, 's'); const x0 = car.body.pos.z;
    for (let i = 0; i < 60 * 20; i++) { car.setInput(input({ brake: true })); sim.step(); if (Math.hypot(car.body.vel.x, car.body.vel.z) < 0.1) { stopT = i * DT; break; } stopT = i * DT; }
    stopD = Math.abs(car.body.pos.z - x0); }
  // handbrake turn
  let hbSlip = 0, hbRecover = 0;
  { const { sim, car } = cruiser(type, v, 'h');
    drive(car, sim, 1, () => 0);
    drive(car, sim, 0.7, () => 1, () => ({ handbrake: true }), () => { hbSlip = Math.max(hbSlip, slipDeg(car)); });
    let rec = -1;
    drive(car, sim, 4, () => 0, () => ({ throttle: 0 } as Partial<VehicleInput>), (t) => { hbSlip = Math.max(hbSlip, slipDeg(car)); if (rec < 0 && slipDeg(car) < 6) rec = t; });
    hbRecover = rec < 0 ? 4 : rec; }
  let smallSteerSlip = 0;
  { const { sim, car } = cruiser(type, v, 'm'); drive(car, sim, 3, () => 0.2, undefined, () => { smallSteerSlip = Math.max(smallSteerSlip, slipDeg(car)); }); }
  let slalomSlip = 0, slalomSwing = 0;
  { const { sim, car } = cruiser(type, v, 'sl'); let minX = 0, maxX = 0;
    drive(car, sim, 6, (t) => (Math.floor(t) % 2 === 0 ? 1 : -1), undefined, () => { slalomSlip = Math.max(slalomSlip, slipDeg(car)); minX = Math.min(minX, car.body.pos.x); maxX = Math.max(maxX, car.body.pos.x); });
    slalomSwing = maxX - minX; }
  let liftSlip = 0;
  { const { sim, car } = cruiser(type, v, 'l'); drive(car, sim, 1.5, () => 0.5);
    for (let i = 0; i < 180; i++) { car.setInput(input({ throttle: 0, steer: 0.5 })); sim.step(); liftSlip = Math.max(liftSlip, slipDeg(car)); } }
  return { type, v, radius, stopT, stopD, hbSlip, hbRecover, smallSteerSlip, slalomSlip, slalomSwing, liftSlip };
}

// ------------------------------------------------------------------------------------------------ on foot
import { Player } from '@/entities/Player';
import { EventBus } from '@/core/Events';
import type { Input } from '@/core/Input';

/** Scriptable keys: `dir` is the held move direction as (right, forward) axes relative to camera yaw 0 (forward = -z). */
export function fakeKeys(): { keys: Set<string>; input: Input } {
  const keys = new Set<string>();
  const input = {
    axis: (neg: string[], pos: string[]) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0),
    isDown: (k: string) => keys.has(k),
    consume: (k: string) => { const had = keys.has('!' + k); keys.delete('!' + k); return had; },
    caps: false,
  } as unknown as Input;
  return { keys, input };
}

export function footSim(x: number, z: number): { sim: Sim; player: Player; keys: Set<string>; walk: (seconds: number, dir?: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW') => void } {
  const sim = new Sim();
  const player = new Player('player', { x, z }, stubMaterials, new EventBus());
  const { keys, input: inp } = fakeKeys();
  sim.add(player);
  const walk = (seconds: number, dir: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' = 'N'): void => {
    keys.clear();
    if (dir.includes('N')) keys.add('KeyW');
    if (dir === 'S') keys.add('KeyS');
    if (dir.includes('E')) keys.add('KeyD');
    if (dir.includes('W')) keys.add('KeyA');
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) { player.control(inp, 0); sim.step(); }
    keys.clear();
  };
  return { sim, player, keys, walk };
}
