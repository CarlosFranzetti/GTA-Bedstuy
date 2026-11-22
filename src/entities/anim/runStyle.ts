/**
 * GAIT seat (BODY team, second shift): how a person carries the arms, the trunk and the swing knee in a jog and a sprint.
 *
 * Why: the captured jog and run take the forearm up in front of the chest and barely swing the upper arm forward (jog shoulder -22..+4 degrees, run -30..+10,
 * elbow 90 to 126): on a person it reads as praying hands that never drive. Real running: elbows about 90 degrees, the hand swinging from the hip (behind it
 * at a sprint) to chest height (cheek height at a sprint) opposite to the legs, a forward lean of the whole body, and a swing knee that lifts.
 *
 * Ownership (agreed with POSE on the channel): below about 2 m/s the arm bones are bodyLayers.ts's; this blends the arms, the extra lean and the knee lift in
 * from 1.7 to 2.7 m/s and owns them by a jog. The arm swing is read from the legs of the same pose (the left arm goes forward as the right thigh does), so it
 * keeps the phase of whatever the clips and the stride matching have produced, at every speed and through a blend. Pure function on the 42-channel pose; no allocation.
 */
import { boneChannel } from './clipPack';

const C_HIPS = boneChannel('hips'), C_TORSO = boneChannel('torso'), C_HEAD = boneChannel('head');
const C_ARM_L = boneChannel('armL'), C_ARM_R = boneChannel('armR'), C_ELB_L = boneChannel('elbowL'), C_ELB_R = boneChannel('elbowR');
const C_LEG_L = boneChannel('legL'), C_LEG_R = boneChannel('legR'), C_KNEE_L = boneChannel('kneeL'), C_KNEE_R = boneChannel('kneeR');

const sstep = (a: number, b: number, x: number): number => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

/** the numbers, in radians, for tests and tuning */
export const RUN = {
  /** shoulder swing amplitude: jog .. sprint */
  swingJog: 0.55, swingSprint: 0.86,
  /** where the swing is centred (the upper arm's mean forward angle): jog .. sprint */
  centreJog: 0.02, centreSprint: 0.04,
  /** elbow flexion mean, and how much more it folds as the arm comes forward: jog .. sprint */
  elbowJog: 1.5, elbowSprint: 1.56, elbowFold: 0.14,
  /** forward lean added to the clip's own (rad, split between chest and pelvis): jog, sprint */
  leanJog: 0.03, leanSprint: 0.17,
  /** extra thigh lift and knee fold of the swing leg at a sprint */
  kneeLift: 0.3, kneeFold: 0.16,
} as const;

/**
 * Apply the run style to pose `p` (clip channels, after the gait and the body layers). `speed` is the eased ground speed in the clips' proportions,
 * `w` 0..1 the weight (0 while an action, a vault, a jump or a carried load poses the arms), `lean` the weight of the lean and the knee (0 when the whole body is posed).
 * Returns nothing. Cost: about forty multiplies.
 */
export function applyRunStyle(p: Float32Array, speed: number, w: number, lean: number): void {
  const a = sstep(1.7, 2.7, speed);
  if (a < 0.002) return;
  const q = sstep(3.0, 6.2, speed);
  // the arm swing follows the opposite thigh: the left arm forward while the right thigh is forward
  const d = p[C_LEG_L] - p[C_LEG_R];
  const ref = 0.85 + 0.3 * q;
  const n = d < -1.1 * ref ? -1.1 : d > 1.1 * ref ? 1.1 : d / ref; // + = left thigh forward
  const amp = RUN.swingJog + (RUN.swingSprint - RUN.swingJog) * q;
  const mid = RUN.centreJog + (RUN.centreSprint - RUN.centreJog) * q;
  const e0 = RUN.elbowJog + (RUN.elbowSprint - RUN.elbowJog) * q;
  const wa = a * w;
  if (wa > 0.002) {
    const xl = mid - amp * n, xr = mid + amp * n; // the right arm is forward when the left thigh is
    const fl = (xl - mid) / amp, fr = (xr - mid) / amp; // -1 .. 1, +1 = fully forward
    p[C_ARM_L] += (xl - p[C_ARM_L]) * wa; p[C_ARM_R] += (xr - p[C_ARM_R]) * wa;
    p[C_ELB_L] += (e0 + RUN.elbowFold * fl - p[C_ELB_L]) * wa; p[C_ELB_R] += (e0 + RUN.elbowFold * fr - p[C_ELB_R]) * wa;
  }
  const wl = a * lean;
  if (wl > 0.002) {
    const l = (RUN.leanJog + (RUN.leanSprint - RUN.leanJog) * q) * wl;
    p[C_TORSO] -= l * 0.7; p[C_HIPS] -= l * 0.3; p[C_HEAD] += l * 0.5; // forward is negative x; the head stays up and the eyes forward
    if (q > 0.002) {
      // the swing leg (knee folded) lifts its thigh and folds the heel toward the seat; the planted leg (knee near straight) is left to the stride matching and the foot lock
      const k = q * wl;
      const sl = sstep(0.5, 1.3, -p[C_KNEE_L]) * k, sr = sstep(0.5, 1.3, -p[C_KNEE_R]) * k;
      p[C_LEG_L] += RUN.kneeLift * sl; p[C_KNEE_L] -= RUN.kneeFold * sl;
      p[C_LEG_R] += RUN.kneeLift * sr; p[C_KNEE_R] -= RUN.kneeFold * sr;
    }
  }
}
