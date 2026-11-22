/**
 * COMBAT2: hand-keyed upper-body poses for the new weapons and for being hit. Written over the standing or walking pose like the
 * punches in controller.ts (the controller calls `keyCombatPose` for these kinds). Our own keying: nothing is taken from any game.
 * Forward is -z; a positive torso y turns to the figure's left; a negative torso x leans forward; a positive elbow x folds the forearm up.
 *   swingR / swingL  a two-handed club swing: wound up on one side, driven through across the body, eased back (the hit lands at k about 0.45)
 *   smash            an overhead blow: both hands high, then down and forward with the whole body
 *   longgun          a long gun braced at the shoulder in both hands; `recoil` kicks it; k below 1 is the pump (the fore-hand slides and returns)
 *   hurt             staggered or knocked about: head snapped back, arms flung out, knees going (k 0..1 is how bad)
 */
import type { ActionPose } from './controller';
import { RIG_CH, boneChannel } from './clipPack';

export const COMBAT_POSES = ['swingR', 'swingL', 'smash', 'longgun', 'hurt'] as const;
export type CombatPoseKind = (typeof COMBAT_POSES)[number];
export const isCombatPose = (kind: ActionPose['kind']): kind is CombatPoseKind => (COMBAT_POSES as readonly string[]).includes(kind);

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Where a club swing is, -1 (wound up) to +1 (through), 0 at rest at both ends. */
export function swingPhase(k: number): number {
  const wind = sstep(0, 0.3, k), through = sstep(0.3, 0.55, k), recover = sstep(0.6, 1, k);
  return (-wind + 2 * through) * (1 - recover);
}

export function keyCombatPose(p: Float32Array, a: ActionPose): void {
  const set = (b: Parameters<typeof boneChannel>[0], x: number, y: number, z: number): void => { const o = boneChannel(b); p[o] = x; p[o + 1] = y; p[o + 2] = z; };
  const add = (b: Parameters<typeof boneChannel>[0], x: number, y: number, z: number): void => { const o = boneChannel(b); p[o] += x; p[o + 1] += y; p[o + 2] += z; };
  const k = Math.min(1, Math.max(0, a.k));
  switch (a.kind) {
    case 'swingR': case 'swingL': {
      const side = a.kind === 'swingR' ? 1 : -1;
      const s = swingPhase(k) * side;
      set('armR', 1.1, -0.25 + 0.1 * s, 0.22); set('elbowR', 0.55 - 0.15 * Math.abs(s), 0, 0);
      set('armL', 0.95, 0.35 + 0.1 * s, -0.1); set('elbowL', 0.7, 0, 0);
      add('torso', -0.08 - 0.06 * Math.abs(s), 0.85 * s, 0.05 * s);
      add('hips', 0, 0.45 * s, 0);
      add('head', -0.06, -0.25 * s, 0);
      add('legL', 0.15, 0, 0); add('kneeL', -0.2, 0, 0); add('legR', -0.12, -0.2 * s, 0); add('kneeR', -0.25, 0, 0);
      break;
    }
    case 'smash': {
      const cock = sstep(0, 0.4, k) * (1 - sstep(0.4, 0.55, k)), drive = sstep(0.4, 0.6, k) * (1 - sstep(0.75, 1, k));
      set('armR', 2.95 * cock + 1.25 * drive + 0.1, -0.1, 0.1); set('elbowR', 1.1 * cock + 0.3 * drive, 0, 0);
      set('armL', 2.7 * cock + 1.15 * drive + 0.1, 0.15, -0.1); set('elbowL', 1.2 * cock + 0.35 * drive, 0, 0);
      add('torso', 0.3 * cock - 0.55 * drive, 0, 0);
      add('head', 0.1 * cock - 0.2 * drive, 0, 0);
      add('legL', 0.2 * drive, 0, 0); add('kneeL', -0.35 * drive, 0, 0);
      p[RIG_CH + 2] -= 0.1 * drive;
      break;
    }
    case 'longgun': {
      const r = Math.min(1, Math.max(0, a.recoil ?? 0));
      const pump = k < 1 ? Math.sin(k * Math.PI) : 0;
      set('armR', 1.35 + 0.15 * r, -0.12, 0.05); set('elbowR', 1.05 + 0.3 * r, 0, 0);
      set('armL', 1.3 - 0.1 * pump, 0.42, -0.06); set('elbowL', 0.55 - 0.35 * pump + 0.15 * r, 0, 0);
      add('torso', -0.06 + 0.09 * r, -0.28, 0);
      add('head', 0.04 - 0.04 * r, 0.2, 0);
      p[RIG_CH + 2] += 0.04 * r;
      break;
    }
    case 'hurt': {
      const h = sstep(0, 0.25, k) * (1 - sstep(0.7, 1, k));
      set('armL', 0.4 * h, 0.1, -0.95 * h); set('armR', 0.4 * h, -0.1, 0.95 * h); set('elbowL', 0.6 * h, 0, 0); set('elbowR', 0.6 * h, 0, 0);
      add('torso', 0.45 * h, 0.2 * h, 0.12 * h); add('head', -0.45 * h, 0, 0);
      add('legL', 0.2 * h, 0, 0); add('kneeL', -0.5 * h, 0, 0); add('legR', -0.1 * h, 0, 0); add('kneeR', -0.55 * h, 0, 0);
      p[RIG_CH + 1] -= 0.12 * h;
      break;
    }
  }
}
