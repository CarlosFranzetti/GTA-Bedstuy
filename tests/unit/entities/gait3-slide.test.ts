/**
 * GAIT3: foot slide on REAL built people (six body types), measured at the BALL of the foot in world space, every frame at 60 Hz, with this person's own shoe
 * (the mesh's lowest sole vertices, followed through the skin). Two readings of "planted" are printed:
 *   A (the lead's): the ball is within 1.5 cm of the ground and not rising; slide = how far it travels over the ground from the first to the last planted frame.
 *   B (no rising test): every run of frames with the ball below 1.5 cm; slide = the path length it travels over the ground.
 * Scenarios are what a PEDESTRIAN does: the simulation changes speed AT ONCE (the figure's position follows it exactly), the animation layer eases its own
 * pace (rampUp 3.4). Steady walks must slide under 3 cm, starts and stops under 6 cm.
 * Set GAIT3_OUT=<file> to dump the table (markdown).
 */
import { describe, expect, it, beforeAll } from 'vitest';
// @ts-ignore the project's node typings lack writeFileSync
import { writeFileSync } from 'node:fs';
import { loadShapes, buildPerson, runFrames, stances, stat, SIX, type Frame3 } from './gait3-rig';
import type { AnimController } from '@/entities/anim/controller';

beforeAll(async () => { await loadShapes(); });

const SCEN: Record<string, { seconds: number; speed: (t: number) => number; steady?: boolean }> = {
  'steady1.0': { seconds: 8, speed: () => 1.0, steady: true },
  'steady1.4': { seconds: 8, speed: () => 1.4, steady: true },
  'steady1.9': { seconds: 8, speed: () => 1.9, steady: true },
  'start1.4': { seconds: 5, speed: (t) => (t < 1 ? 0 : 1.4) },
  'start1.9': { seconds: 5, speed: (t) => (t < 1 ? 0 : 1.9) },
  'stop1.4': { seconds: 5, speed: (t) => (t < 2.5 ? 1.4 : 0) },
  'start3.0': { seconds: 5, speed: (t) => (t < 1 ? 0 : 3.0) },
  'stop3.0': { seconds: 6, speed: (t) => (t < 3 ? 3.0 : 0) },
};
const ped = (c: AnimController): void => { c.rampUp = Number(process.env.GAIT3_RAMP ?? 16); c.rampDown = Number(process.env.GAIT3_DOWN ?? 22); };
/** B: runs of frames with the ball below h, path length over the ground */
function runsB(fr: Frame3[], h = 0.015): number[] {
  const out: number[] = [];
  for (let side = 0; side < 2; side++) {
    let len = 0, n = 0;
    for (let i = 1; i <= fr.length; i++) {
      const low = i < fr.length && fr[i].pts.meshBall[side].y < h;
      if (low) { const a = fr[i - 1].pts.meshBall[side], b = fr[i].pts.meshBall[side]; if (fr[i - 1].pts.meshBall[side].y < h) len += Math.hypot(b.x - a.x, b.z - a.z); n++; }
      else { if (n >= 3) out.push(len); len = 0; n = 0; }
    }
  }
  return out;
}

describe('foot slide on real bodies (a pedestrian: the simulation instant, the animation eased)', () => {
  const rows: string[] = ['| person | scenario | A ball cm mean / max (n) | B ball cm max (n) |', '|---|---|---|---|'];
  for (const id of SIX) {
    it(id, () => {
      const fails: string[] = [];
      for (const [name, sc] of Object.entries(SCEN)) {
        const p = buildPerson(id), fr = runFrames(p, sc.speed, sc.seconds, 1 / 60, ped);
        const skip = sc.steady ? 90 : 0, cut = fr.slice(skip);
        const A = stat(stances(fr, (q) => q.meshBall).filter((s) => s.i0 >= skip).map((s) => s.slide));
        const Bs = runsB(cut), B = stat(Bs), lim = (sc.steady ? 3 : 6) / 100;
        rows.push(`| ${id} | ${name} | ${A.mean} / ${A.max} (${A.n}) | ${B.max} (${B.n}) |`);
        if (!(B.n > 0)) fails.push(`${name}: no planted stance found`);
        if (B.max / 100 > lim) fails.push(`${name}: B max ${B.max} cm`);
        if (A.n > 0 && A.max / 100 > lim) fails.push(`${name}: A max ${A.max} cm`);
      }
      expect(fails, id).toEqual([]);
    }, 300000);
  }
  it('dump', () => { if (process.env.GAIT3_OUT) writeFileSync(process.env.GAIT3_OUT, rows.join('\n') + '\n'); });
});
