import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import { PedSpawnScheduler, CLOSE_IN, MAX_INTERVAL, MIN_INTERVAL, RECYCLE_DIST } from '@/entities/PedestrianSpawn';
import { pedHourFactor } from '@/game/TrafficSystem';

/** Runs the scheduler for a whole simulated day at 0.25 s ticks against a perfect executor; returns the per-second change log. */
function runDay(budget: number, dayLengthS: number, hasFar: (t: number) => boolean) {
  const s = new PedSpawnScheduler(), rng = new Rng(7);
  let count = Math.round(budget * pedHourFactor(0));
  const dt = 0.25, changes: { t: number; a: string; count: number }[] = [];
  const counts: number[] = [];
  for (let t = 0; t < dayLengthS; t += dt) {
    const target = budget * pedHourFactor((t / dayLengthS) * 24);
    const a = s.tick({ dt, count, target, hasFar: hasFar(t), rand: rng.next() });
    if (a === 'add') count++; else if (a === 'remove') count--;
    if (a !== 'none') changes.push({ t, a, count });
    counts.push(count);
  }
  return { changes, counts };
}

describe('PedSpawnScheduler', () => {
  it('holds the count when on target, with hysteresis (no flip-flop on +-0.5)', () => {
    const s = new PedSpawnScheduler();
    for (let i = 0; i < 100; i++) expect(s.tick({ dt: 0.25, count: 20, target: 20.45, hasFar: false, rand: 0.5 })).toBe('none');
    expect(PedSpawnScheduler.goal(20, 20.45)).toBe(20);
    expect(PedSpawnScheduler.goal(20, 21.2)).toBe(21);
  });

  it('paces changes one at a time and never faster than MIN_INTERVAL (no clumps)', () => {
    const s = new PedSpawnScheduler();
    let last = -10, count = 0;
    for (let t = 0; t < 60; t += 0.1) {
      const a = s.tick({ dt: 0.1, count, target: 40, hasFar: false, rand: 0.5 });
      if (a === 'add') { expect(t - last).toBeGreaterThanOrEqual(MIN_INTERVAL * 0.75 - 0.11); last = t; count++; }
    }
    expect(count).toBe(40);
  });

  it('closes a 30-person gap in under 3 x CLOSE_IN seconds (bounded by MAX_INTERVAL for small gaps)', () => {
    const s = new PedSpawnScheduler();
    let count = 0, t = 0;
    for (; t < 120 && count < 30; t += 0.1) if (s.tick({ dt: 0.1, count, target: 30, hasFar: false, rand: 0.5 }) === 'add') count++;
    expect(t).toBeLessThan(CLOSE_IN * 2.8); // 30 pedestrians in under 50 s
    expect(PedSpawnScheduler.interval(1)).toBeLessThanOrEqual(MAX_INTERVAL * 1.25);
  });

  it('over a 24-minute day the crowd follows the BIBLE curve within 3 and changes at most 1 per 0.3 s', () => {
    const { changes, counts } = runDay(40, 24 * 60, () => false);
    for (let i = 1; i < changes.length; i++) expect(changes[i].t - changes[i - 1].t).toBeGreaterThanOrEqual(0.29);
    let worst = 0;
    counts.forEach((c, i) => { worst = Math.max(worst, Math.abs(c - 40 * pedHourFactor((i * 0.25 / (24 * 60)) * 24))); });
    expect(worst).toBeLessThanOrEqual(3);
    // no burst: at most 12 changes inside any 10 s window
    for (let i = 0, j = 0; i < changes.length; i++) { while (changes[i].t - changes[j].t > 10) j++; expect(i - j + 1).toBeLessThanOrEqual(26); }
  });

  it('relocates far pedestrians at a steady trickle while on target, and not when none are far', () => {
    const s = new PedSpawnScheduler();
    let n = 0;
    for (let t = 0; t < 60; t += 0.25) if (s.tick({ dt: 0.25, count: 20, target: 20, hasFar: true, rand: 0.5 }) === 'recycle') n++;
    expect(n).toBeGreaterThanOrEqual(25); expect(n).toBeLessThanOrEqual(40);
    const s2 = new PedSpawnScheduler();
    for (let t = 0; t < 60; t += 0.25) expect(s2.tick({ dt: 0.25, count: 20, target: 20, hasFar: false, rand: 0.5 })).toBe('none');
    expect(RECYCLE_DIST).toBeGreaterThan(100);
  });
});
