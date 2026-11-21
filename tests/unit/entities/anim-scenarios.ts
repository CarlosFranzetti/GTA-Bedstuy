/** Named motion scenarios shared by the headless harness (anim-measure.ts) and the people showcase `anim` view: one definition, two uses. */
import type { AnimInput } from '@/entities/anim/controller';

export interface Scenario {
  seconds: number;
  /** ground speed the entity commands at time t (m/s) */
  speed: (t: number) => number;
  /** turning rate (rad/s) and other inputs at t */
  extra?: (t: number) => Partial<AnimInput>;
  /** idle name to switch to, and when */
  idleAt?: [number, string];
  /** the part worth looking at in a strip (seconds) */
  window: [number, number];
}

export const ramp = (t: number, t0: number, t1: number, a: number, b: number): number => (t <= t0 ? a : t >= t1 ? b : a + ((b - a) * (t - t0)) / (t1 - t0));
const jumpIn = (t: number): AnimInput['jump'] => (t < 0.5 ? { phase: 'ground', t: 0, vy: 0 } : t < 0.57 ? { phase: 'takeoff', t: t - 0.5, vy: 0 } : t < 1.2 ? { phase: 'air', t: t - 0.57, vy: 6 - 17 * (t - 0.57) } : t < 1.4 ? { phase: 'land', t: t - 1.2, vy: 0 } : { phase: 'ground', t: 0, vy: 0 });

export const SCENARIOS: Record<string, Scenario> = {
  walk: { seconds: 6, speed: () => 1.4, window: [3, 4.2] },
  jog: { seconds: 6, speed: () => 2.8, window: [3, 3.8] },
  sprint: { seconds: 6, speed: () => 5.2, window: [3, 3.7] },
  idle: { seconds: 6, speed: () => 0, window: [0, 6] },
  start: { seconds: 4, speed: (t) => ramp(t, 1, 1.4, 0, 1.4), window: [0.8, 2.4] },
  startRun: { seconds: 4, speed: (t) => ramp(t, 1, 1.5, 0, 5.2), window: [0.8, 2.2] },
  stop: { seconds: 5, speed: (t) => ramp(t, 2, 2.3, 1.4, 0), window: [1.8, 3.4] },
  stopRun: { seconds: 5, speed: (t) => ramp(t, 2, 2.5, 5.2, 0), window: [1.8, 3.4] },
  stopSnap: { seconds: 5, speed: (t) => (t < 2 ? 1.4 : 0), window: [1.8, 3.4] },
  walkJogSprint: { seconds: 9, speed: (t) => ramp(t, 2, 4, 1.4, 2.8) + ramp(t, 5, 7, 0, 2.4), window: [1.5, 8] },
  sprintToWalk: { seconds: 6, speed: (t) => ramp(t, 2, 3, 5.2, 1.4), window: [1.6, 3.8] },
  turn90: { seconds: 3, speed: () => 0, extra: (t) => ({ yawRate: t > 0.5 && t < 1.0 ? 3.14 : 0 }), window: [0.4, 1.8] },
  corner: { seconds: 4, speed: () => 1.4, extra: (t) => ({ yawRate: t > 1.5 && t < 2.1 ? 2.6 : 0 }), window: [1.3, 2.9] },
  jump: { seconds: 2, speed: () => 0, extra: (t) => ({ jump: jumpIn(t) }), window: [0.4, 1.7] },
  punch: { seconds: 2, speed: () => 0, extra: (t) => ({ action: t > 0.5 && t < 0.95 ? { kind: 'punchL', k: (t - 0.5) / 0.45 } : null }), window: [0.4, 1.4] },
  punchWalking: { seconds: 3, speed: () => 1.4, extra: (t) => ({ action: t > 1 && t < 1.45 ? { kind: 'punchR', k: (t - 1) / 0.45 } : null }), window: [0.9, 2] },
  idleChange: { seconds: 3, speed: () => 0, idleAt: [1, 'idle2'], window: [0.6, 2.2] },
};
