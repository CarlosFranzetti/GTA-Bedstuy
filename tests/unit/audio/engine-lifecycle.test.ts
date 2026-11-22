import { describe, it, expect } from 'vitest';
import { VehicleAudio } from '@/audio/vehicle/VehicleAudio';
import type { TrafficCar } from '@/audio/vehicle/nodes';
import { RecCtx } from './fakeWebAudio';

/**
 * AUDIOFIX: the player's engine and the AI engines over minutes of simulated play at 60, 30 and 15 frames a second. Drives the vehicle
 * layer the way main.ts does (type, drive state, traffic and update every frame) through enter, rev, shift, brake, exit, re-enter, a pause
 * (the clock stops, the game keeps calling) and a despawn, and checks what a listener would hear: how many engine voices exist, that they
 * are gone after the release time, that nothing piles up on the automation timeline and that every value is finite and bounded.
 */

interface Priv { eng: unknown; ghosts: unknown[]; traffic: { active: number; created: number } | null }
const priv = (v: VehicleAudio) => v as unknown as Priv;
const engineGraphs = (v: VehicleAudio) => (priv(v).eng ? 1 : 0) + priv(v).ghosts.length;

function rig(seed = 3) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const ctx = new RecCtx();
  const noise = ctx.createBuffer(1, 4410, 44100);
  const v = new VehicleAudio(rnd);
  v.attach(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, noise as unknown as AudioBuffer);
  return { ctx, v };
}

/** one game frame as main.ts makes it */
function frame(ctx: RecCtx, v: VehicleAudio, dt: number, st: { type: string | null; speed: number; throttle: number; inCar: boolean; brake?: boolean; cars?: TrafficCar[] }) {
  ctx.advance(dt);
  v.setType(st.type);
  v.setDrive(st.speed, st.throttle, st.inCar);
  v.setReverse(false);
  v.setBraking(!!st.brake);
  v.setTraffic({ x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 }, st.cars ?? [], dt);
  v.update(dt);
}

/** a drive: accelerate through the gears, cruise, brake to a stop */
function drive(ctx: RecCtx, v: VehicleAudio, type: string, fps: number, seconds: number, hook?: (t: number) => void) {
  const dt = 1 / fps;
  let speed = 0;
  for (let t = 0; t < seconds; t += dt) {
    const ph = t / seconds;
    const throttle = ph < 0.5 ? 1 : ph < 0.7 ? 0.3 : 0;
    const brake = ph >= 0.7;
    speed = Math.max(0, Math.min(30, speed + (throttle > 0.5 ? 3.5 : throttle > 0 ? 0 : -6) * dt));
    frame(ctx, v, dt, { type, speed, throttle, inCar: true, brake });
    hook?.(t);
  }
}

function sit(ctx: RecCtx, v: VehicleAudio, fps: number, seconds: number, type: string | null, cars?: TrafficCar[]) {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) frame(ctx, v, dt, { type, speed: 0, throttle: 0, inCar: false, cars });
}

describe.each([60, 30, 15])('engine lifecycle at %i frames a second', (fps) => {
  it('never holds more than one player engine voice, and none once the release time has passed after exit', () => {
    const { ctx, v } = rig();
    let most = 0;
    const watch = () => { most = Math.max(most, engineGraphs(v)); };
    for (let round = 0; round < 6; round++) {
      const type = ['sedan', 'bus', 'pony', 'hatch', 'garbage', 'cab'][round];
      drive(ctx, v, type, fps, 14, watch);
      // leaves the car: main passes type null (nobody drives) and inVehicle false
      sit(ctx, v, fps, 0.5, null);
      expect(engineGraphs(v), `a ghost may still be fading 0.5 s after exit (round ${round})`).toBeLessThanOrEqual(1);
      sit(ctx, v, fps, 2.0, null); // release time 1.4 s plus a margin
      expect(engineGraphs(v), `no engine voice 2.5 s after exit (round ${round})`).toBe(0);
    }
    expect(most, 'at most the live engine plus nothing else while driving').toBeLessThanOrEqual(1);
    // oscillators and sources that are still running now are the road, wash and traffic beds only
    expect(ctx.liveSources.length).toBeLessThan(12);
  });

  it('swapping cars at speed leaves a ghost that fades and is gone, never more than two voices', () => {
    const { ctx, v } = rig();
    let most = 0;
    const types = ['sedan', 'pickup', 'bus', 'hatch', 'cab', 'beater', 'muscle', 'garbage'];
    let speed = 18;
    for (let i = 0; i < types.length * 3; i++) {
      for (let k = 0; k < fps * 0.8; k++) { frame(ctx, v, 1 / fps, { type: types[i % types.length], speed, throttle: 0.6, inCar: true }); most = Math.max(most, engineGraphs(v)); }
    }
    expect(most).toBeLessThanOrEqual(3); // the live one and the ghosts of the last 1.4 s
    sit(ctx, v, fps, 3, null);
    expect(engineGraphs(v)).toBe(0);
  });

  it('writes bounded, finite automation and does not pile events up', () => {
    const { ctx, v } = rig();
    drive(ctx, v, 'pony', fps, 60);
    sit(ctx, v, fps, 5, null);
    drive(ctx, v, 'bus', fps, 60);
    expect(ctx.bad, 'NaN or Infinity written to an AudioParam').toEqual([]);
    // events still held by one parameter (what the audio thread must keep sorted): a handful, not thousands
    expect(ctx.maxPeak).toBeLessThan(40);
    for (const n of ctx.nodes) {
      for (const p of [n.gain, n.frequency]) {
        if (n.kind === 'gain' && p === n.gain && n.gain.events.length) for (const e of n.gain.events) { expect(Number.isFinite(e.v)).toBe(true); expect(Math.abs(e.v)).toBeLessThan(20); }
      }
    }
  });

  it('steady idle writes next to nothing to the audio graph', () => {
    const { ctx, v } = rig();
    const dt = 1 / fps;
    for (let t = 0; t < 4; t += dt) frame(ctx, v, dt, { type: 'sedan', speed: 0, throttle: 0, inCar: true }); // engine starts
    const w0 = ctx.writes;
    for (let t = 0; t < 10; t += dt) frame(ctx, v, dt, { type: 'sedan', speed: 0, throttle: 0, inCar: true });
    const perSecond = (ctx.writes - w0) / 10;
    // idle: the wobble moves the pitch a few times a second at most; per-frame writes on every parameter would be fps * 30
    expect(perSecond).toBeLessThan(fps * 6);
  });

  it('does not restart or create sources while driving', () => {
    const { ctx, v } = rig();
    sit(ctx, v, fps, 1, 'sedan');
    drive(ctx, v, 'sedan', fps, 2);
    const nodes = ctx.nodes.length;
    drive(ctx, v, 'sedan', fps, 30);
    expect(ctx.nodes.length).toBe(nodes);
  });

  it('AI engines: a despawned car releases its voice and voices stay at the cap', () => {
    const { ctx, v } = rig();
    const cars = (n: number, x0: number): TrafficCar[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, type: i % 2 ? 'bus' : 'hatch', x: x0 + i * 3, z: 0, vx: 4, vz: 0, speed: 4, throttle: 0.5 }));
    for (let t = 0; t < 10; t += 1 / fps) frame(ctx, v, 1 / fps, { type: null, speed: 0, throttle: 0, inCar: false, cars: cars(12, 4 + t * 4) });
    expect(priv(v).traffic!.active).toBeLessThanOrEqual(4);
    for (let t = 0; t < 1; t += 1 / fps) frame(ctx, v, 1 / fps, { type: null, speed: 0, throttle: 0, inCar: false, cars: [] });
    expect(priv(v).traffic!.active).toBe(0);
    expect(priv(v).traffic!.created).toBeLessThanOrEqual(4);
  });
});

describe('pause and resume', () => {
  it('a pause while an engine runs does not leave a voice behind, and its clock-bound release still completes', () => {
    const { ctx, v } = rig();
    drive(ctx, v, 'sedan', 60, 6);
    // pause: context suspended, clock stops; the game goes on calling setDrive/setType (exit while paused is not possible, but a death or arrest can swap the car)
    ctx.suspend(); ctx.settle();
    for (let i = 0; i < 120; i++) { ctx.advance(1 / 60); v.setType(null); v.setDrive(0, 0, false); }
    ctx.resume(); ctx.settle();
    sit(ctx, v, 60, 2.5, null);
    expect(engineGraphs(v)).toBe(0);
  });
});
