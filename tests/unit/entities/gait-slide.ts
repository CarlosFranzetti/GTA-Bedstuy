/**
 * GAIT (body team): foot slide through every speed change, at several frame rates. Slide = how far the ball of the foot moves over the ground between
 * touchdown and lift-off (cm), per stance, where a stance is a run of frames with the ball within 2 cm of the ground. `drift` is the stricter number: the
 * largest distance the ball ever strays from where it touched down. The entity follows the player's own speed curve (Player.ts: accel 9 falling to 4.6,
 * brake 12 rising to 17), stepped at the frame rate under test.
 */
import { play, type Sample } from './anim-measure';
import type { AnimController } from '@/entities/anim/controller';
import type { Gait } from '@/entities/anim/gait';

/** the player's speed curve, stepped once per call (play() calls it once per frame, in order) */
export function playerCurve(target: (t: number) => number, dt: number): (t: number) => number {
  let v = 0;
  return (t: number) => {
    const want = target(t), frac = Math.min(1, v / 6.5);
    const a = want > v ? 9 + (4.6 - 9) * frac : 12 + (17 - 12) * frac;
    v += Math.sign(want - v) * Math.min(Math.abs(want - v), a * dt);
    return v;
  };
}

export interface Stance { side: number; t0: number; t1: number; speed: number; slide: number; drift: number }
export function stancesOf(s: Sample, skip = 1): Stance[] {
  const out: Stance[] = [];
  for (let side = 0; side < 2; side++) {
    let start = -1;
    const close = (end: number): void => {
      if (start >= 0 && end - start >= 2) {
        const a = s.frames[start].ball[side], b = s.frames[end].ball[side];
        let drift = 0;
        for (let k = start; k <= end; k++) drift = Math.max(drift, Math.hypot(s.frames[k].ball[side].x - a.x, s.frames[k].ball[side].z - a.z));
        const mid = Math.round((start + end) / 2), nx = Math.min(s.frames.length - 1, mid + 1);
        out.push({ side, t0: s.frames[start].t, t1: s.frames[end].t, speed: Math.abs(s.frames[nx].z - s.frames[mid].z) / s.dt, slide: Math.hypot(b.x - a.x, b.z - a.z), drift });
      }
      start = -1;
    };
    for (let i = 0; i < s.frames.length; i++) {
      const low = s.frames[i].ball[side].y < 0.02;
      if (low && start < 0) start = i; else if (!low && start >= 0) close(i - 1);
    }
  }
  return out.sort((a, b) => a.t0 - b.t0).slice(skip);
}

export const SCEN: Record<string, { seconds: number; target: (t: number) => number }> = {
  startWalk: { seconds: 5, target: (t) => (t < 0.5 ? 0 : 1.6) },
  startJog: { seconds: 6, target: (t) => (t < 0.5 ? 0 : 3.0) },
  startSprint: { seconds: 8, target: (t) => (t < 0.5 ? 0 : t < 1.0 ? 3.0 : 6.5) },
  walkToJog: { seconds: 6, target: (t) => (t < 2 ? 1.6 : 3.0) },
  jogToRun: { seconds: 6, target: (t) => (t < 2 ? 3.0 : 4.5) },
  jogToSprint: { seconds: 8, target: (t) => (t < 2 ? 3.0 : 6.5) },
  sprintToJog: { seconds: 8, target: (t) => (t < 3 ? 6.5 : 3.0) },
  sprintToWalk: { seconds: 8, target: (t) => (t < 3 ? 6.5 : 1.6) },
  walkToStop: { seconds: 6, target: (t) => (t < 2 ? 1.6 : 0) },
  jogToStop: { seconds: 6, target: (t) => (t < 2 ? 3.0 : 0) },
  sprintToStop: { seconds: 8, target: (t) => (t < 3 ? 6.5 : 0) },
};

export function slideTable(fps: number, opts: { gait?: Gait; setup?: (c: AnimController) => void } = {}): Record<string, { n: number; mean: number; max: number; driftMax: number; worstAt: number; worstSpeed: number }> {
  const dt = 1 / fps, R: Record<string, { n: number; mean: number; max: number; driftMax: number; worstAt: number; worstSpeed: number }> = {};
  for (const [k, sc] of Object.entries(SCEN)) {
    const s = play({ seconds: sc.seconds, dt, speed: playerCurve(sc.target, dt), gait: opts.gait, setup: opts.setup });
    const st = stancesOf(s);
    const worst = st.reduce((a, b) => (b.slide > a.slide ? b : a), st[0] ?? { slide: 0, t0: 0, speed: 0, drift: 0 } as Stance);
    R[k] = { n: st.length, mean: +(100 * st.reduce((a, b) => a + b.slide, 0) / Math.max(1, st.length)).toFixed(1), max: +(100 * worst.slide).toFixed(1), driftMax: +(100 * Math.max(0, ...st.map((x) => x.drift))).toFixed(1), worstAt: +worst.t0.toFixed(2), worstSpeed: +worst.speed.toFixed(1) };
  }
  return R;
}
