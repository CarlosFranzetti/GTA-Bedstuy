/**
 * STUCK regression tests (27 Nov 2026). The cases are trials of the soak (stuck-soak-lib.ts) on the grid map's real colliders that, before the
 * World2D backstops (rescue of a body overlapped for half a second, wedge relief for a driven car), ended hard-stuck (no reverse, forward
 * or turn moved the car a metre) or overlapped for seconds. Each is reproduced alone from its index (same random numbers as in the soak).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESCUE_AFTER, World2D } from '@/physics/World2D';
import { Sim, DT, makeVehicle } from './harness';
import { footSlide, brakeSteer, analogStep, steerRow } from './stuck-controls-lib';
import { gridWorld, replayTrial, type SoakWorld } from './stuck-soak-lib';

let w: SoakWorld;
beforeAll(() => { World2D.rescueEnabled = true; w = gridWorld(1); }, 120000);
afterAll(() => { World2D.rescueEnabled = true; });
const quiet = (): void => undefined;

describe('car wedged in a notch (a pole against an areaway fence, a stoop against a wall) always frees', () => {
  for (const idx of [955, 1955, 2143, 2150, 2217, 2504, 2734]) {
    it(`soak car trial ${idx}: some input moves it a metre, and it is not left overlapped`, () => {
      const r = replayTrial(w, 'car', 1, idx, quiet)!;
      expect(r.hard).toBe(false);
      expect(r.ovRun).toBeLessThan(0.75);
    }, 60000);
  }
  it('the same trial is hard-stuck without the backstops (the test discriminates)', () => {
    World2D.rescueEnabled = false;
    try {
      const r = replayTrial(w, 'car', 1, 955, quiet)!;
      expect(r.hard).toBe(true);
      expect(replayTrial(w, 'car', 1, 26, quiet)!.ovRun).toBeGreaterThan(1);
    } finally { World2D.rescueEnabled = true; }
  }, 60000);
});

describe('car held on a body overlapped for seconds is moved clear', () => {
  for (const idx of [26, 1689, 2769]) {
    it(`soak car trial ${idx}: overlap ends inside RESCUE_AFTER + a little`, () => {
      const r = replayTrial(w, 'car', 1, idx, quiet)!;
      expect(r.ovRun).toBeLessThan(RESCUE_AFTER + 0.25);
    }, 60000);
  }
});

describe('a person pressed between a driven car and a wall is not left inside the car', () => {
  for (const idx of [61, 348, 665]) {
    it(`soak walker trial ${idx}`, () => {
      const r = replayTrial(w, 'walker', 1, idx, quiet)!;
      expect(r.ovRun).toBeLessThan(RESCUE_AFTER + 0.25);
      expect(r.hard).toBe(false);
    }, 60000);
  }
  it('rescue unit: a person overlapped by a parked car in a gap too narrow for him ends on free ground inside 0.7 s', () => {
    const world = new World2D(12);
    world.addStatic({ kind: 'polygon', points: [{ x: -10, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 3 }, { x: -10, z: 3 }] }, { x: 0, z: 0 }, 'wall');
    const sim = new Sim(world);
    const car = makeVehicle('sedan', 0, -1.2, Math.PI / 2); // a parked car 0.3 m off the wall, long side along it
    car.driver = null;
    sim.add(car);
    const body = { id: 'p', kind: 'player' as const, shape: { kind: 'circle' as const, r: 0.4 }, pos: { x: 0, z: -0.25 }, vel: { x: 0, z: 0 }, heading: 0, mass: 80 };
    world.addBody(body);
    for (let i = 0; i < Math.round(0.7 / DT); i++) sim.step(DT);
    expect(world.rescues).toBeGreaterThanOrEqual(1);
    expect(world.deepestOverlap(body).depth).toBe(0);
  });
});

describe('controls (measured numbers, docs/swarm/tasks/STUCK.md)', () => {
  it('hard braking with the wheel held bends the line, it does not spin the car', () => {
    for (const t of ['sedan', 'suv', 'pickup'] as const) for (const st of [0.5, 1]) expect(brakeSteer(t, st).headingDeg).toBeLessThan(46); // CARFIT: the in-between feel (was 52 for the quick set)
    for (const st of [0.5, 1]) expect(brakeSteer('hothatch', st).headingDeg).toBeLessThan(66);
  });
  it('a stick step reaches 90 percent in under 0.26 s (in-between feel: 0.23 s; quick 0.20, weighty 0.28)', () => {
    expect(analogStep('sedan', 12)).toBeLessThan(0.26);
    expect(analogStep('bus', 0)).toBeLessThan(0.26);
    expect(analogStep('sedan', 12)).toBeGreaterThan(0.2);
  });
  it('keys: full lock in the in-between window at 4 and 28 m/s, centre in about 0.2 s (CARFIT)', () => {
    const lo = steerRow('sedan', 4), hi = steerRow('sedan', 28);
    expect(lo.fullSteerS).toBeGreaterThan(0.24); expect(lo.fullSteerS).toBeLessThan(0.3);   // quick 0.22, weighty 0.35
    expect(hi.fullSteerS).toBeGreaterThan(0.4); expect(hi.fullSteerS).toBeLessThan(0.47);   // quick 0.35, weighty 0.57
    expect(lo.returnS).toBeGreaterThan(0.18); expect(lo.returnS).toBeLessThan(0.25);        // quick 0.17, weighty 0.28
  });
  it('sprinting along a wall at 45 or 70 degrees keeps its speed (no braking for a wall that is only grazed)', () => {
    expect(footSlide(45, true).share).toBeGreaterThan(0.95);
    expect(footSlide(70, true).share).toBeGreaterThan(0.95);
  });
});
