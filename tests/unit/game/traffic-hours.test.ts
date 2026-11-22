import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficSystem } from '@/game/TrafficSystem';
import { AM_PEAK_CENTRE, PEAK_HALF_WIDTH, PM_PEAK_CENTRE, VehicleHours, drawDayRush, passesFourAM, vehicleHourFactor } from '@/game/trafficHours';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { Body2D, IMaterialLibrary, IWorld2D } from '@/world/types';

const grid = buildGrid(loadBedstuyData());
const materials = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;

/** true inside either rush peak's window (where the ceiling does not apply) */
function inPeak(h: number): boolean {
  const near = (c: number) => { let d = Math.abs(h - c); if (d > 12) d = 24 - d; return d < PEAK_HALF_WIDTH; };
  return near(AM_PEAK_CENTRE) || near(PM_PEAK_CENTRE);
}

describe('vehicle share by hour (TRAFFIC2)', () => {
  it('follows the owner curve at the named hours (light and heavy rush, free of peaks)', () => {
    const at = (h: number) => [vehicleHourFactor(h, 0), vehicleHourFactor(h, 1)] as const;
    for (const [h, want] of [[0, 0.3], [2, 0.3], [5, 0.3], [6, 0.5], [11, 0.7], [13, 0.7], [15, 0.7], [20, 0.6], [23, 0.4]] as const) {
      const [light, heavy] = at(h);
      expect(light).toBeCloseTo(want, 6);
      expect(heavy).toBeCloseTo(want, 6);
    }
  });

  it('never exceeds 0.75 outside the two rush peaks, even on the heaviest day', () => {
    for (let h = 0; h < 24; h += 0.05) {
      if (inPeak(h)) continue;
      expect(vehicleHourFactor(h, 1, 1)).toBeLessThanOrEqual(0.75 + 1e-9);
      expect(vehicleHourFactor(h, 0, 0)).toBeLessThanOrEqual(0.75 + 1e-9);
    }
  });

  it('peaks reach 0.80 on a light day and 1.25 (above today\'s cap) on a congested one, at the centres', () => {
    expect(vehicleHourFactor(AM_PEAK_CENTRE, 0)).toBeCloseTo(0.8, 6);
    expect(vehicleHourFactor(AM_PEAK_CENTRE, 1)).toBeCloseTo(1.25, 6);
    expect(vehicleHourFactor(PM_PEAK_CENTRE, 0)).toBeCloseTo(0.8, 6);
    expect(vehicleHourFactor(PM_PEAK_CENTRE, 1)).toBeCloseTo(1.25, 6);
    // the afternoon takes its own rush
    expect(vehicleHourFactor(AM_PEAK_CENTRE, 0, 1)).toBeCloseTo(0.8, 6);
    expect(vehicleHourFactor(PM_PEAK_CENTRE, 0, 1)).toBeCloseTo(1.25, 6);
  });

  it('is continuous: no jump above 0.05 between hours 0.05 apart, and it wraps at 24', () => {
    for (const rush of [0, 0.5, 1]) {
      for (const pm of [0, 0.4, 1]) {
        let prev = vehicleHourFactor(0, rush, pm);
        for (let h = 0.05; h <= 24.0001; h += 0.05) {
          const cur = vehicleHourFactor(h, rush, pm);
          expect(Math.abs(cur - prev)).toBeLessThanOrEqual(0.05);
          prev = cur;
        }
      }
    }
    expect(vehicleHourFactor(25, 0.3)).toBeCloseTo(vehicleHourFactor(1, 0.3), 9);
    expect(vehicleHourFactor(-1, 0.3)).toBeCloseTo(vehicleHourFactor(23, 0.3), 9);
  });

  it('draws a heavy day about 40 percent of the time over 2,000 seeded days, with the rush ranges', () => {
    const rng = new Rng(20261122);
    let heavy = 0;
    for (let i = 0; i < 2000; i++) {
      const d = drawDayRush(rng);
      if (d.heavy) { heavy++; expect(d.am).toBeGreaterThanOrEqual(0.7); expect(d.am).toBeLessThanOrEqual(1); }
      else { expect(d.am).toBeGreaterThanOrEqual(0); expect(d.am).toBeLessThanOrEqual(0.35); }
      expect(d.pm).toBeLessThanOrEqual(1);
      expect(d.pm).toBeGreaterThanOrEqual(d.am * 0.7 - 1e-12);
    }
    expect(heavy / 2000).toBeGreaterThanOrEqual(0.35);
    expect(heavy / 2000).toBeLessThanOrEqual(0.45);
  });

  it('passes 04:00 only when the hour moves forward across it', () => {
    expect(passesFourAM(3.9, 4.1)).toBe(true);
    expect(passesFourAM(23, 5)).toBe(true);
    expect(passesFourAM(4, 4.5)).toBe(false);
    expect(passesFourAM(4.5, 4.5)).toBe(false);
    expect(passesFourAM(5, 6)).toBe(false);
  });

  it('re-rolls the day each time the clock passes 04:00 and wobbles within plus or minus 10 percent', () => {
    const vh = new VehicleHours('traffic-hours-test');
    expect(vh.known).toBe(false);
    expect(vh.factor).toBe(1);
    vh.advance(3600);
    expect(vh.factor).toBe(1); // nothing moves before the first setHour
    vh.set(9);
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      vh.set(3.95); vh.set(4.05); vh.set(9); // one day passes; read the morning peak
      seen.add(Math.round(vh.factor * 1e6));
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
    let lo = 1; let hi = -1;
    for (let s = 0; s < 3600; s++) {
      vh.advance(1);
      lo = Math.min(lo, vh.wobble); hi = Math.max(hi, vh.wobble);
      expect(Math.abs(vh.wobble)).toBeLessThanOrEqual(0.1 + 1e-12);
    }
    expect(hi - lo).toBeGreaterThan(0.05);
  });
});

describe('the moving-car cap follows the hour (TRAFFIC2)', () => {
  const build = (maxMoving: number) => new TrafficSystem(grid, new FakeWorld(), new EventBus(), new Rng(5), new THREE.Scene(), materials, () => { throw new Error('no cars spawned in this test'); }, undefined, undefined, undefined, { maxMoving, peds: 0, parkOccupancy: 0 });

  class FakeWorld implements IWorld2D {
    addStatic(): Body2D { throw new Error('unused'); }
    addBody() { /* none */ }
    removeBody() { /* none */ }
    step() { return []; }
    queryCircle() { return []; }
    raycast() { return null; }
    bodies() { return []; }
  }

  it('is exactly today\'s maxMoving until setHour is called', () => {
    expect(build(30).movingCap).toBe(30);
  });

  it('is the hour\'s share of maxMoving after setHour (night 0.3, lunch 0.7, plus or minus 10 percent)', () => {
    const sys = build(30);
    sys.setHour(3, true);
    expect(sys.movingCap).toBeGreaterThanOrEqual(8);
    expect(sys.movingCap).toBeLessThanOrEqual(10);
    sys.setHour(12, true);
    expect(sys.movingCap).toBeGreaterThanOrEqual(19);
    expect(sys.movingCap).toBeLessThanOrEqual(23);
  });

  it('never goes below 2 when there are cars allowed, and stays 0 when there are none', () => {
    const few = build(3);
    few.setHour(3, true);
    expect(few.movingCap).toBe(2);
    const none = build(0);
    none.setHour(12, true);
    expect(none.movingCap).toBe(0);
  });
});
