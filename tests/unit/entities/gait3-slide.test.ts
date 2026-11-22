/**
 * GAIT3: foot slide on REAL built people (six body types the reviewer used), measured at the heel and the ball of the foot in world space, every frame at 60 Hz.
 * A foot is planted while its ball is within 1.5 cm of the ground and not rising; slide = how far that ball travels over the ground in one stance.
 * Steady walks at 1.0, 1.4, 1.9 m/s; starts and stops. `pedSet` = a pedestrian: the simulation's speed changes at once (as the game does), the animation layer eases.
 * Set GAIT3_OUT=<file> to dump the table (markdown).
 */
import { describe, expect, it, beforeAll } from 'vitest';
// @ts-ignore the project's node typings lack writeFileSync
import { writeFileSync } from 'node:fs';
import { loadShapes, buildPerson, runFrames, stances, stat, SIX } from './gait3-rig';

beforeAll(async () => { await loadShapes(); });

const SCEN: Record<string, { seconds: number; speed: (t: number) => number; steady?: boolean; fromStart?: boolean }> = {
  'steady1.0': { seconds: 8, speed: () => 1.0, steady: true },
  'steady1.4': { seconds: 8, speed: () => 1.4, steady: true },
  'steady1.9': { seconds: 8, speed: () => 1.9, steady: true },
  'startWalk (instant 1.4)': { seconds: 5, speed: (t) => (t < 1 ? 0 : 1.4), fromStart: true },
  'startFast (instant 1.9)': { seconds: 5, speed: (t) => (t < 1 ? 0 : 1.9), fromStart: true },
  'stopWalk (instant)': { seconds: 5, speed: (t) => (t < 2.5 ? 1.4 : 0) },
  'startJog (instant 3.0)': { seconds: 5, speed: (t) => (t < 1 ? 0 : 3.0), fromStart: true },
  'stopJog (instant)': { seconds: 6, speed: (t) => (t < 3 ? 3.0 : 0) },
};

describe('foot slide on real bodies', () => {
  const rows: string[] = ['| person | scenario | ball cm mean / max (n) | heel-skim cm max | worst ball stance at |', '|---|---|---|---|---|'];
  for (const id of SIX) {
    it(id, () => {
      for (const [name, sc] of Object.entries(SCEN)) {
        const p = buildPerson(id), fr = runFrames(p, sc.speed, sc.seconds);
        const skip = sc.steady ? 90 : 0;
        const ball = stances(fr, (q) => q.meshBall).filter((s) => s.i0 >= skip), heel = stances(fr, (q) => q.meshHeel).filter((s) => s.i0 >= skip);
        const b = stat(ball.map((s) => s.slide)), h = stat(heel.map((s) => s.slide));
        const worst = ball.reduce((a, s) => (s.slide > a.slide ? s : a), ball[0] ?? { slide: 0, i0: 0 });
        rows.push(`| ${id} | ${name} | ${b.mean} / ${b.max} (${b.n}) | ${h.max} | ${(worst.i0 / 60).toFixed(2)} s |`);
        expect(b.n, `${id} ${name}`).toBeGreaterThan(0);
        expect(b.max, `${id} ${name} ball max`).toBeLessThanOrEqual(sc.steady ? 3 : 6);
      }
    }, 300000);
  }
  it('dump', () => { if (process.env.GAIT3_OUT) writeFileSync(process.env.GAIT3_OUT, rows.join('\n') + '\n'); });
});
