/**
 * Speed-driven blending of the locomotion cycles. All cycles start at the same event (the left foot passing the right going
 * forward), so one shared phase can drive them and neighbours blend without the feet crossing over.
 */
import type { Clip } from './clipPack';

export interface Blend {
  /** index of the lower and upper clip in the chain, and the weight of the upper one */
  lo: number;
  hi: number;
  t: number;
}

/** smoothstep */
export const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Weight of the standing idle against the walking chain. */
export function idleWeight(speed: number): number { return 1 - smooth(0.12, 0.65, speed); }

/** Which two cycles to mix for a ground speed. `chain` is ordered by natural speed. Below the first and above the last only one plays. */
export function chainBlend(speed: number, chain: ReadonlyArray<{ speed: number }>): Blend {
  const n = chain.length;
  if (n === 1 || speed <= chain[0].speed) return { lo: 0, hi: 0, t: 0 };
  if (speed >= chain[n - 1].speed) return { lo: n - 1, hi: n - 1, t: 0 };
  let i = 0;
  while (speed > chain[i + 1].speed) i++;
  const a = chain[i].speed, b = chain[i + 1].speed;
  return { lo: i, hi: i + 1, t: smooth(0, 1, (speed - a) / (b - a)) };
}

/** How fast to run a cycle relative to its capture so the feet keep up with the ground: speed over natural speed, held to a sane range. */
export function rateFor(speed: number, clip: { speed: number }): number {
  return Math.min(1.5, Math.max(0.55, speed / Math.max(0.2, clip.speed)));
}

/** Cycles per second of the blended chain (each clip at its own rate, weighted), times the person's cadence. */
export function cycleFrequency(speed: number, chain: ReadonlyArray<Clip>, b: Blend, cadence = 1): number {
  const f = (c: Clip): number => rateFor(speed, c) / c.duration;
  return ((1 - b.t) * f(chain[b.lo]) + b.t * f(chain[b.hi])) * cadence;
}

/**
 * Where in a jump clip to sample: the crouch is squeezed into the take-off, the clip's flight spread over the real airtime
 * (so the legs extend as the character comes down), and the landing absorb into the recovery. `marks` = [leave, land] as clip fractions.
 */
export function jumpTime(clip: { duration: number; marks: number[] }, phase: 'takeoff' | 'air' | 'land', t: number, takeoff: number, airtime: number, land: number): number {
  const leave = clip.marks[0] ?? 0.4, down = clip.marks[1] ?? 0.7;
  const u = phase === 'takeoff' ? Math.min(1, t / takeoff) * leave
    : phase === 'air' ? leave + Math.min(1, t / Math.max(0.05, airtime)) * (down - leave)
      : down + Math.min(1, t / land) * (1 - down);
  return u * clip.duration;
}
