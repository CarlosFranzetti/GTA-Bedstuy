/**
 * Per-person gait: a crowd that walks in step looks like a parade, so every character gets its own walk style (a captured clip),
 * cadence, stride, arm swing, posture and starting phase from a seed. Pure and deterministic.
 */
export interface Gait {
  /** name of the walk clip this person uses (falls back to 'walk' when the street pack is not loaded) */
  walkClip: string;
  /** playback-rate multiplier of the walk cycle (steps per minute follow it) */
  cadence: number;
  /** leg swing multiplier */
  stride: number;
  /** arm swing multiplier (0 = hands in pockets) */
  armSwing: number;
  /** extra forward lean of the torso (rad) and head drop (rad) */
  lean: number;
  headDrop: number;
  /** pelvis sway and bounce multiplier */
  sway: number;
  /** where in the cycle this person starts (0..1) and where in the idle (s) */
  phase: number;
  idleOffset: number;
  /** factor on the pedestrian walking speed (a hobble is slower, a stride quicker) */
  speedScale: number;
}

export type AgeBand = 'kid' | 'teen' | 'adult' | 'old';

/** small fast seeded generator (mulberry32) */
function rng(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Walk styles by age band: [clip name, weight, speed factor]. Names are resolved against the library at play time. */
const STYLES: Record<AgeBand, ReadonlyArray<readonly [string, number, number]>> = {
  adult: [['walk', 30, 1], ['walkBrisk', 14, 1.12], ['walkHeavy', 14, 0.92], ['walkStroll', 10, 0.82], ['walkFast', 12, 1.08], ['walkJaunty', 8, 0.95], ['walkAngry', 6, 0.88], ['walkHobble', 2, 0.7]],
  teen: [['walk', 18, 1], ['walkBrisk', 26, 1.12], ['walkFast', 20, 1.1], ['walkJaunty', 18, 0.98], ['walkStroll', 10, 0.85], ['walkAngry', 8, 0.9]],
  kid: [['walkBrisk', 40, 1.1], ['walkFast', 30, 1.12], ['walkJaunty', 20, 1], ['walk', 10, 1]],
  old: [['walkHobble', 34, 0.7], ['walkStroll', 30, 0.8], ['walkHeavy', 16, 0.78], ['walk', 20, 0.9]],
};

export function makeGait(seed: number, age: AgeBand = 'adult'): Gait {
  const r = rng(seed);
  const styles = STYLES[age];
  let total = 0;
  for (const s of styles) total += s[1];
  let pick = r() * total;
  let style = styles[0];
  for (const s of styles) { pick -= s[1]; if (pick <= 0) { style = s; break; } }
  const spread = (lo: number, hi: number): number => lo + (hi - lo) * r();
  const elder = age === 'old';
  return {
    walkClip: style[0],
    cadence: spread(0.9, 1.12) * (age === 'kid' ? 1.1 : elder ? 0.93 : 1),
    stride: spread(0.9, 1.1) * (elder ? 0.9 : 1),
    armSwing: spread(0.45, 1.35) * (elder ? 0.7 : 1),
    lean: spread(-0.03, 0.07) + (elder ? 0.1 : 0),
    headDrop: spread(-0.04, 0.1) + (elder ? 0.08 : 0),
    sway: spread(0.75, 1.35),
    phase: r(),
    idleOffset: spread(0, 5),
    speedScale: style[2] * spread(0.95, 1.05),
  };
}

/** The player's own walk: the plain clip, neutral settings. */
export const PLAYER_GAIT: Gait = { walkClip: 'walk', cadence: 1, stride: 1, armSwing: 1, lean: 0, headDrop: 0, sway: 1, phase: 0, idleOffset: 0, speedScale: 1 };
