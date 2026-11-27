/**
 * STUCK: measured control response (not a test file). Keyboard (steer exactly -1/0/1), analog (pad / touch, fractional) and on foot.
 * Every number is read from the real Vehicle / Player stepped at 60 Hz with no obstacles.
 */
import { EventBus } from '@/core/Events';
import { Player, RUN_SPEED, WALK_SPEED } from '@/entities/Player';
import type { VehicleType } from '@/world/types';
import { DT, Sim, input, makeVehicle, slipAngleDeg, stubMaterials } from './harness';

export interface CarRow {
  type: string; v0: number;
  halfSteerS: number; fullSteerS: number; yawT63: number; yawSteady: number; radius: number; returnS: number; yawStopS: number;
}

function cruise(target: number, u: number): number { return Math.max(-1, Math.min(1, 0.5 + (target - u) * 0.6)); }

/** key D pressed from straight running at v0 (cruise held), then released after 2 s */
export function steerRow(type: VehicleType, v0: number, steer = 1): CarRow {
  const sim = new Sim();
  const car = makeVehicle(type, 0, 0, 0);
  car.driver = 'player'; sim.add(car);
  car.body.vel.x = 0; car.body.vel.z = -v0; // heading 0 = north (-z)
  const sample = () => car.handling.steerNorm;
  // settle 1 s straight
  for (let i = 0; i < 60; i++) { car.setInput(input({ throttle: v0 < 0.5 ? 0 : cruise(v0, car.speed) })); sim.step(DT); }
  let tHalf = NaN, tFull = NaN, t = 0;
  const yaws: number[] = [];
  for (; t < 2; t += DT) {
    car.setInput(input({ throttle: v0 < 0.5 ? 0.35 : cruise(v0, car.speed), steer }));
    sim.step(DT);
    const s = Math.abs(sample());
    if (Number.isNaN(tHalf) && s >= 0.5 * Math.abs(steer)) tHalf = t + DT;
    if (Number.isNaN(tFull) && s >= 0.98 * Math.abs(steer)) tFull = t + DT;
    yaws.push(Math.abs(car.yawRateRad));
  }
  const steady = yaws.slice(-20).reduce((a, b) => a + b, 0) / 20;
  let t63 = NaN; yaws.forEach((y, i) => { if (Number.isNaN(t63) && y >= 0.63 * steady) t63 = (i + 1) * DT; });
  const speed = Math.hypot(car.body.vel.x, car.body.vel.z);
  // release
  let tRet = NaN, tYaw = NaN;
  for (let k = 0; k < 240; k++) {
    car.setInput(input({ throttle: v0 < 0.5 ? 0.35 : cruise(v0, car.speed), steer: 0 }));
    sim.step(DT);
    if (Number.isNaN(tRet) && Math.abs(sample()) < 0.05) tRet = (k + 1) * DT;
    if (Number.isNaN(tYaw) && Math.abs(car.yawRateRad) < 0.1 * Math.max(steady, 0.05)) tYaw = (k + 1) * DT;
  }
  return { type, v0, halfSteerS: tHalf, fullSteerS: tFull, yawT63: t63, yawSteady: steady, radius: steady > 0.02 ? speed / steady : Infinity, returnS: tRet, yawStopS: tYaw };
}

/** analog stick: step to `a` (fractional), seconds to 90 percent of it */
export function analogStep(type: VehicleType, v0: number, a = 0.6): number {
  const sim = new Sim(); const car = makeVehicle(type, 0, 0, 0); car.driver = 'player'; sim.add(car);
  car.body.vel.z = -v0;
  for (let i = 0; i < 60; i++) { car.setInput(input({ throttle: cruise(v0, car.speed) })); sim.step(DT); }
  for (let t = 0; t < 2; t += DT) { car.setInput(input({ throttle: cruise(v0, car.speed), steer: a })); sim.step(DT); if (Math.abs(car.handling.steerNorm) >= 0.9 * a) return t + DT; }
  return NaN;
}

export interface PedalRow { type: string; zeroTo50: number; zeroTo100: number; thrHalfAccelS: number; stop15S: number; stop15M: number; brakeSpinYaw: number; brakeSlipDeg: number; hbTurnDeg: number; hbPeakSlip: number; hbRecoverS: number; altYawPP: number; altSlip: number }

export function pedalRow(type: VehicleType): PedalRow {
  // 0 to 50 / 100 km/h
  let z50 = NaN, z100 = NaN, half = NaN;
  {
    const sim = new Sim(); const car = makeVehicle(type, 0, 0, 0); car.driver = 'player'; sim.add(car);
    let a0 = 0;
    for (let t = 0; t < 30; t += DT) {
      car.setInput(input({ throttle: 1 })); sim.step(DT);
      const v = Math.abs(car.speed);
      if (Number.isNaN(half) && t > 0.01) { const a = v / (t + DT); if (t < 1 && a0 === 0) a0 = a; }
      if (Number.isNaN(z50) && v >= 13.89) z50 = t + DT;
      if (Number.isNaN(z100) && v >= 27.78) z100 = t + DT;
      if (t > 0.5 && Number.isNaN(half)) half = v / (t + DT);
      if (!Number.isNaN(z100)) break;
    }
    // time for the velocity to reach 50 percent of the 1 s mean acceleration: report speed after 0.25 s as a share of speed after 1 s
    const s2 = new Sim(); const c2 = makeVehicle(type, 0, 0, 0); c2.driver = 'player'; s2.add(c2);
    let v25 = 0, v100 = 0;
    for (let t = 0; t < 1; t += DT) { c2.setInput(input({ throttle: 1 })); s2.step(DT); if (t + DT >= 0.25 && v25 === 0) v25 = Math.abs(c2.speed); }
    v100 = Math.abs(c2.speed);
    half = v100 > 0 ? v25 / v100 : NaN; // 0.25 would be a linear ramp; a delayed throttle reads below it
  }
  // stop from 15 m/s with Space
  let stopS = NaN, stopM = NaN, spinYaw = 0, slipDeg = 0;
  {
    const sim = new Sim(); const car = makeVehicle(type, 0, 0, 0); car.driver = 'player'; sim.add(car);
    car.body.vel.z = -15;
    for (let i = 0; i < 20; i++) { car.setInput(input({ throttle: cruise(15, car.speed) })); sim.step(DT); }
    const z0 = car.body.pos.z; let t = 0;
    for (; t < 10; t += DT) { car.setInput(input({ brake: true })); sim.step(DT); if (Math.abs(car.speed) < 0.2) break; }
    stopS = t; stopM = Math.abs(car.body.pos.z - z0);
  }
  // hard brake while steering half left from 20 m/s: does it spin?
  {
    const sim = new Sim(); const car = makeVehicle(type, 0, 0, 0); car.driver = 'player'; sim.add(car);
    car.body.vel.z = -20;
    for (let i = 0; i < 40; i++) { car.setInput(input({ throttle: cruise(20, car.speed) })); sim.step(DT); }
    for (let t = 0; t < 2.5; t += DT) { car.setInput(input({ brake: true, steer: t < 1.5 ? 0.5 : 1 })); sim.step(DT); spinYaw = Math.max(spinYaw, Math.abs(car.yawRateRad)); slipDeg = Math.max(slipDeg, slipAngleDeg(car)); }
  }
  // handbrake turn: 12 m/s, steer right + handbrake 0.7 s, then release and centre
  let hbTurn = 0, hbPeak = 0, hbRec = NaN;
  {
    const sim = new Sim(); const car = makeVehicle(type, 0, 0, 0); car.driver = 'player'; sim.add(car);
    car.body.vel.z = -12;
    for (let i = 0; i < 40; i++) { car.setInput(input({ throttle: cruise(12, car.speed) })); sim.step(DT); }
    const h0 = car.body.heading; let hmax = 0;
    for (let t = 0; t < 0.7; t += DT) { car.setInput(input({ steer: 1, handbrake: true, throttle: 0.3 })); sim.step(DT); hbPeak = Math.max(hbPeak, slipAngleDeg(car)); hmax = Math.max(hmax, Math.abs(Math.atan2(Math.sin(car.body.heading - h0), Math.cos(car.body.heading - h0)))); }
    for (let t = 0; t < 4; t += DT) { car.setInput(input({ steer: 0, throttle: 0.6 })); sim.step(DT); hmax = Math.max(hmax, Math.abs(Math.atan2(Math.sin(car.body.heading - h0), Math.cos(car.body.heading - h0)))); if (Number.isNaN(hbRec) && slipAngleDeg(car) < 5 && Math.abs(car.yawRateRad) < 0.15) hbRec = t + DT; }
    hbTurn = hmax * 180 / Math.PI;
  }
  // alternating left / right every 0.3 s at 15 m/s
  let ypp = 0, aslip = 0;
  {
    const sim = new Sim(); const car = makeVehicle(type, 0, 0, 0); car.driver = 'player'; sim.add(car);
    car.body.vel.z = -15;
    for (let i = 0; i < 60; i++) { car.setInput(input({ throttle: cruise(15, car.speed) })); sim.step(DT); }
    let lo = 1e9, hi = -1e9;
    for (let t = 0; t < 3; t += DT) { car.setInput(input({ throttle: cruise(15, car.speed), steer: Math.floor(t / 0.3) % 2 ? 1 : -1 })); sim.step(DT); lo = Math.min(lo, car.yawRateRad); hi = Math.max(hi, car.yawRateRad); aslip = Math.max(aslip, slipAngleDeg(car)); }
    ypp = hi - lo;
  }
  return { type, zeroTo50: z50, zeroTo100: z100, thrHalfAccelS: half, stop15S: stopS, stop15M: stopM, brakeSpinYaw: spinYaw, brakeSlipDeg: slipDeg, hbTurnDeg: hbTurn, hbPeakSlip: hbPeak, hbRecoverS: hbRec, altYawPP: ypp, altSlip: aslip };
}

export interface FootRow { t50: number; t90: number; run90: number; stopS: number; stopM: number; reverseS: number; turn90S: number; turn180Walk: number; setOffM1s: number }

function fakeKeys(fwd: number, right: number, run = false): never {
  return { caps: false, axis: (neg: string[]) => (neg[0] === 'KeyS' ? fwd : right), isDown: (c: string) => run && c === 'ShiftLeft', consume: () => false } as never;
}

export function footRow(): FootRow {
  const mk = (): { sim: Sim; p: Player } => { const sim = new Sim(); const p = new Player('mp', { x: 0, z: 0 }, stubMaterials, new EventBus()); sim.add(p); return { sim, p }; };
  const spd = (p: Player): number => Math.hypot(p.body.vel.x, p.body.vel.z);
  let t50 = NaN, t90 = NaN, run90 = NaN, stopS = NaN, stopM = NaN, rev = NaN, t90turn = NaN, t180 = NaN, d1 = 0;
  { // start walking north (W), facing north
    const { sim, p } = mk(); p.body.heading = 0;
    for (let t = 0; t < 3; t += DT) { p.control(fakeKeys(1, 0), 0); sim.step(DT); const s = spd(p); if (Number.isNaN(t50) && s >= 0.5 * WALK_SPEED) t50 = t + DT; if (Number.isNaN(t90) && s >= 0.9 * WALK_SPEED) t90 = t + DT; if (Math.abs(t + DT - 1) < DT / 2) d1 = Math.hypot(p.body.pos.x, p.body.pos.z); }
    // release
    const z0 = { x: p.body.pos.x, z: p.body.pos.z };
    for (let t = 0; t < 3; t += DT) { p.control(fakeKeys(0, 0), 0); sim.step(DT); if (spd(p) < 0.1) { stopS = t + DT; break; } }
    stopM = Math.hypot(p.body.pos.x - z0.x, p.body.pos.z - z0.z);
  }
  { // sprint
    const { sim, p } = mk(); p.body.heading = 0;
    for (let t = 0; t < 6; t += DT) { p.control(fakeKeys(1, 0, true), 0); sim.step(DT); if (spd(p) >= 0.9 * RUN_SPEED) { run90 = t + DT; break; } }
  }
  { // reverse: walking north then press S: time until the velocity points south
    const { sim, p } = mk(); p.body.heading = 0;
    for (let t = 0; t < 2; t += DT) { p.control(fakeKeys(1, 0), 0); sim.step(DT); }
    for (let t = 0; t < 3; t += DT) { p.control(fakeKeys(-1, 0), 0); sim.step(DT); if (p.body.vel.z > 0.5) { rev = t + DT; break; } }
  }
  { // turn on the spot: from standing facing north press D (east): time to face within 10 deg of east; and a 180
    const { sim, p } = mk(); p.body.heading = 0;
    for (let t = 0; t < 2; t += DT) { p.control(fakeKeys(0, 1), 0); sim.step(DT); if (Math.abs(Math.atan2(Math.sin(p.body.heading - Math.PI / 2), Math.cos(p.body.heading - Math.PI / 2))) < 0.17) { t90turn = t + DT; break; } }
    const b = mk(); b.p.body.heading = 0;
    for (let t = 0; t < 2; t += DT) { b.p.control(fakeKeys(1, 0), 0); b.sim.step(DT); }
    for (let t = 0; t < 3; t += DT) { b.p.control(fakeKeys(-1, 0), 0); b.sim.step(DT); if (Math.abs(Math.atan2(Math.sin(b.p.body.heading - Math.PI), Math.cos(b.p.body.heading - Math.PI))) < 0.17) { t180 = t + DT; break; } }
  }
  return { t50, t90, run90, stopS, stopM, reverseS: rev, turn90S: t90turn, turn180Walk: t180, setOffM1s: d1 };
}

export function controlsReport(): { steer: CarRow[]; analog: Array<{ type: string; v0: number; s90: number }>; pedals: PedalRow[]; foot: FootRow } {
  const types: VehicleType[] = ['sedan', 'suv', 'hothatch', 'bus'];
  const steer: CarRow[] = [];
  for (const t of types) for (const v of [0, 4, 10, 18, 28]) steer.push(steerRow(t, v));
  const analog = (['sedan', 'bus'] as VehicleType[]).flatMap((t) => [0, 12].map((v) => ({ type: t, v0: v, s90: analogStep(t, v) })));
  const pedals = (['sedan', 'suv', 'hothatch', 'bus', 'pickup'] as VehicleType[]).map(pedalRow);
  return { steer, analog, pedals, foot: footRow() };
}
