/**
 * MOVE2 part 2: foot skate by speed, with the foot lock on and off, through steady speeds and through the player's own acceleration curve.
 * Slide = how far the ball of the foot travels over the ground between touchdown and lift-off (cm), per stance, binned by the ground speed
 * at mid-stance. Writes JSON to $MOVE2_OUT.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { play, footSlide, type Sample } from './anim-measure';
import type { AnimController } from '@/entities/anim/controller';

/** The player's own speed curve (Player.ts): accel 9 falling to 4.6 with speed, sprint ramp 0.8 s, jog 3 and sprint 6.5. */
function playerSpeed(target: (t: number) => number): (t: number) => number {
  let v = 0, last = 0;
  const cache = new Map<number, number>();
  return (t: number) => {
    const k = Math.round(t * 600);
    if (cache.has(k)) return cache.get(k)!;
    const dt = 1 / 60;
    for (let tt = last; tt < t - 1e-9; tt += dt) {
      const want = target(tt), frac = Math.min(1, v / 6.5);
      const a = want > v ? 9 + (4.6 - 9) * frac : 12 + (17 - 12) * frac;
      v += Math.sign(want - v) * Math.min(Math.abs(want - v), a * dt);
    }
    last = t; cache.set(k, v); return v;
  };
}

interface Row { speed: number; slide: number }
function stances(s: Sample): Row[] {
  const out: Row[] = [];
  for (let side = 0; side < 2; side++) {
    let start = -1;
    const close = (end: number): void => {
      if (start >= 0 && end - start >= 3) {
        const a = s.frames[start].ball[side], b = s.frames[end].ball[side];
        const mid = s.frames[Math.round((start + end) / 2)], nxt = s.frames[Math.min(s.frames.length - 1, Math.round((start + end) / 2) + 1)];
        out.push({ speed: Math.abs(nxt.z - mid.z) / s.dt, slide: Math.hypot(b.x - a.x, b.z - a.z) });
      }
      start = -1;
    };
    for (let i = 0; i < s.frames.length; i++) {
      const low = s.frames[i].ball[side].y < 0.02;
      if (low && start < 0) start = i; else if (!low && start >= 0) close(i - 1);
    }
  }
  return out.slice(1);
}
const stat = (r: Row[]): { n: number; mean: number; max: number } => ({ n: r.length, mean: r.length ? +(100 * r.reduce((a, b) => a + b.slide, 0) / r.length).toFixed(1) : NaN, max: r.length ? +(100 * Math.max(...r.map((x) => x.slide))).toFixed(1) : NaN });

export function gaitReport(lockOn: boolean): Record<string, unknown> {
  const R: Record<string, unknown> = {};
  const setup = (c: AnimController): void => { c.footLockOn = lockOn; };
  for (const [name, v] of [['walk1.6', 1.6], ['jog3', 3.0], ['run4.5', 4.5], ['sprint6.5', 6.5]] as const) {
    const s = play({ seconds: 8, speed: () => v, setup });
    R[`steady.${name}`] = stat(stances({ frames: s.frames.slice(120), dt: s.dt }));
  }
  // the player's own acceleration: from rest to a jog, from rest to a sprint (Shift held), a jog to a sprint, a sprint back to a jog
  const scen: Record<string, (t: number) => number> = {
    startJog: (t) => (t < 0.5 ? 0 : 3.0),
    startSprint: (t) => (t < 0.5 ? 0 : t < 1.0 ? 3.0 : 6.5),
    jogToSprint: (t) => (t < 2 ? 3.0 : 6.5),
    sprintToJog: (t) => (t < 3 ? 6.5 : 3.0),
    sprintToStop: (t) => (t < 3 ? 6.5 : 0),
  };
  for (const [k, target] of Object.entries(scen)) {
    const s = play({ seconds: 8, speed: playerSpeed(target), setup });
    const rows = stances(s);
    R[`accel.${k}`] = stat(rows);
    // by speed band
    const bands: Array<[string, number, number]> = [['0-1.5', 0, 1.5], ['1.5-3', 1.5, 3], ['3-5', 3, 5], ['5+', 5, 9]];
    R[`accel.${k}.bands`] = Object.fromEntries(bands.map(([n, lo, hi]) => [n, stat(rows.filter((r) => r.speed >= lo && r.speed < hi))]));
  }
  return R;
}

describe("gait measure (MOVE2)", () => {
  it('foot skate, lock on and off', () => {
    const out = { lockOn: gaitReport(true), lockOff: gaitReport(false) };
    const f = process.env.MOVE2_OUT;
    if (f) writeFileSync(f, JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out));
    expect(Number.isFinite((out.lockOn['steady.jog3'] as { mean: number }).mean)).toBe(true);
  });
});
