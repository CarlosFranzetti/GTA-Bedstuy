/**
 * POSE seat (BODY team, 22 Nov): the upper body and the standing person, as pure functions on the 42-channel pose.
 *
 * `applyBodyLayers(p, s, st)` is called by the animation controller once per person per frame, on the pose AFTER the clip blend and the
 * per-person gait and BEFORE the pelvis height and the foot lock. It only ADDS to the hips, torso, head, arm and elbow channels (and the
 * rig's sideways sway, for a person standing); it never writes the legs, knees, ankles or the rig's height and surge: those are the gait's
 * and the foot lock depends on them. No scene, no allocation, no state beyond the numbers in `BodyLayerState` (one small object per person).
 *
 * Conventions (clipPack.ts): Euler XYZ in radians in the parent's frame; forward is -z; an arm swung forward has positive x; for the LEFT arm
 * (at -x) a negative z lifts it away from the body, for the RIGHT arm a positive z does. Elbow flexion is positive x; elbow y turns the forearm.
 *
 * Layers (each is off while something else poses the body: `off`, and for the arms `armsBusy`):
 *   1 arms:    the upper arm hangs a few degrees clear of the torso and the coat (more for a wide chest or a thick garment: `splay`), the elbow
 *              never locks straight and bends on the forward swing, the forearm turns so the palm faces the thigh;
 *   2 trunk:   in a walk the ribcage tips a little over the leg that carries the weight (the clips carry the counter-rotation of shoulders and
 *              hips already: measured, so it is not added again);
 *   3 standing (idleW > 0, near levels only): weight on one leg with the hip out and the ribcage tipping back over it, changing sides every 5 to
 *              12 s (kids 2 to 5, elders slower); small head turns; teenagers slouch; a hand in a pocket now and then. Per person from a seed.
 * The far level (`cheap`) gets layer 1 only.
 */
import { boneChannel, RIG_CH } from './clipPack';

export type BodyAge = 'kid' | 'teen' | 'adult' | 'old';

/** What the controller passes each frame. The first group is the gait seat's list (agreed on the channel); the second is POSE's additions. */
export interface BodyLayerIn {
  dt: number;
  /** ground speed in the clips' proportions (m/s), eased */
  speed: number;
  /** 1 standing .. 0 moving */
  idleW: number;
  /** rad/s, three's sense (positive = turning left) */
  yawRate: number;
  age: BodyAge;
  armSwing: number;
  sway: number;
  phase0: number;
  accel?: number;
  phase?: number;
  stride?: number;
  yawLead?: number;
  turnInPlace?: number;
  startT?: number;
  stopT?: number;
  /** 0..1: something else poses the whole body (an action, a vault, a jump, sit, stand, stumble, a hold): the layers fade out */
  off?: number;
  /** 0..1: something poses the ARMS (crossed arms, leaning, phone, talk, eating, a carried load, a held bag): arm layers and gestures fade out */
  armsBusy?: number;
  /** a whole number that is this person's own (their gait seed or a hash of their id) */
  seed?: number;
  /** the smallest arm clearance this body and its clothes need (rad of abduction): `group.userData.splay` */
  splay?: number;
  /** the forward lean baked into this body's rest pose (rad, negative = forward: `torso.userData.stoopBaked`; 0 or absent for none) */
  stoop?: number;
  /** the far level of detail: arms only */
  cheap?: boolean;
}

/** One per person: a few numbers for easing and for the timers of the standing layer. Plain numbers only (no allocation per frame). */
export interface BodyLayerState {
  ready: boolean;
  rng: number;
  t: number;
  w: number;
  aw: number;
  // standing: weight shift
  side: number; shiftU: number; shiftTarget: number; shiftIn: number; shiftAmp: number; shiftMin: number; shiftMax: number;
  // standing: head
  hYaw: number; hPitch: number; hTYaw: number; hTPitch: number; hIn: number; hBusy: number;
  // standing: slouch and gesture
  slouch: number; gestKind: number; gestU: number; gestOn: boolean; gestIn: number; gestSide: number; gestChance: number;
}

export function makeBodyLayerState(seed = 1): BodyLayerState {
  return {
    ready: false, rng: (seed | 0) || 1, t: 0, w: 0, aw: 0,
    side: 1, shiftU: 0, shiftTarget: 0, shiftIn: 0, shiftAmp: 1, shiftMin: 5, shiftMax: 12,
    hYaw: 0, hPitch: 0, hTYaw: 0, hTPitch: 0, hIn: 2, hBusy: 1,
    slouch: 0, gestKind: 0, gestU: 0, gestOn: false, gestIn: 6, gestSide: 1, gestChance: 0.5,
  };
}

const C_HIPS = boneChannel('hips'), C_TORSO = boneChannel('torso'), C_HEAD = boneChannel('head');
const C_ARM_L = boneChannel('armL'), C_ARM_R = boneChannel('armR'), C_ELB_L = boneChannel('elbowL'), C_ELB_R = boneChannel('elbowR');
const C_KNEE_L = boneChannel('kneeL'), C_KNEE_R = boneChannel('kneeR');

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** xorshift32 on the state: a number in [0, 1) */
function rnd(st: BodyLayerState): number {
  let x = st.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  st.rng = x | 0;
  return ((x >>> 0) % 1048576) / 1048576;
}

/** Arm hang constants (rad). Values the arms are moved to by the correction of the clips (posture.ts) and the clearance added here. */
export const ARM = {
  /** the least abduction of a hanging upper arm */
  abdMin: 0.07,
  /** the abduction the corrected clips already carry (posture.ts: 4 to 6 degrees) */
  clipAbd: 0.075,
  /** what is added to the body's own clearance (`splay`) */
  abdAdd: 0.05,
  /** the least elbow flexion standing / walking */
  elbowStand: 0.1,
  elbowWalk: 0.12,
  /** extra flexion per radian of forward arm swing */
  elbowSwing: 0.2,
  /** how much of the chest's forward pitch the upper arms give back, so they hang from the shoulder and do not swing back with the lean */
  hangBack: 0.85,
  /** forearm turn so the palm faces the thigh (rad, about the forearm's axis; mirrored by side) */
  pronate: 0,
} as const;

function initState(st: BodyLayerState, s: BodyLayerIn): void {
  if (s.seed !== undefined) st.rng = (Math.imul(s.seed | 0, 0x9e3779b1) ^ 0x85ebca6b) | 0 || 1;
  else st.rng = (Math.imul(Math.floor(s.phase0 * 1e6) | 1, 0x9e3779b1) ^ 0x85ebca6b) | 0 || 1;
  for (let i = 0; i < 4; i++) rnd(st);
  st.ready = true;
  const age = s.age;
  const r = rnd(st);
  st.side = rnd(st) < 0.5 ? -1 : 1;
  st.shiftU = st.side * 0.4;
  st.shiftTarget = st.side;
  st.shiftAmp = (age === 'kid' ? 0.7 : age === 'teen' ? 1.25 : age === 'old' ? 0.75 : 1) * (0.7 + 0.6 * r);
  st.shiftMin = age === 'kid' ? 2 : age === 'teen' ? 4 : age === 'old' ? 7 : 5;
  st.shiftMax = age === 'kid' ? 5 : age === 'teen' ? 9 : age === 'old' ? 16 : 12;
  st.shiftIn = rnd(st) * (st.shiftMax - st.shiftMin);
  st.hBusy = age === 'kid' ? 2 : age === 'teen' ? 1.1 : age === 'old' ? 0.6 : 0.8;
  st.hIn = 1 + rnd(st) * 4;
  st.slouch = age === 'teen' ? 0.5 + 0.5 * rnd(st) : age === 'adult' ? 0.35 * rnd(st) : age === 'old' ? 0.2 * rnd(st) : 0;
  st.gestChance = age === 'kid' ? 0.05 : age === 'teen' ? 0.6 : age === 'old' ? 0.3 : 0.5;
  st.gestIn = 2 + rnd(st) * 10;
  st.gestSide = rnd(st) < 0.5 ? -1 : 1;
}

/** Layer 1: arms. aw = weight 0..1. */
function arms(p: Float32Array, s: BodyLayerIn, aw: number): void {
  const idle = clamp(s.idleW, 0, 1);
  const walkW = (1 - idle) * (1 - sstep(2.6, 4.2, s.speed));
  // clearance: the clips' mean abduction is set in posture.ts; this adds what this body and its clothes need on top
  const want = Math.max(ARM.abdMin, (s.splay ?? 0.03) + ARM.abdAdd);
  const extra = Math.max(0, want - ARM.clipAbd) * aw;
  p[C_ARM_L + 2] -= extra; p[C_ARM_R + 2] += extra;
  // and never inward: whatever a walk style does (a limp throws the arms out, an angry one crosses them in), the upper arm stays off the torso and the coat
  const floorAbd = Math.max(0.06, want * 0.75);
  if (p[C_ARM_L + 2] > -floorAbd) p[C_ARM_L + 2] += (-floorAbd - p[C_ARM_L + 2]) * aw;
  if (p[C_ARM_R + 2] < floorAbd) p[C_ARM_R + 2] += (floorAbd - p[C_ARM_R + 2]) * aw;
  // the arms hang from the shoulder: a leaning chest (the clip's, and an elder's stoop baked into the mesh) must not swing them back behind the body
  const lean = -(p[C_TORSO] + (s.stoop ?? 0));
  if (lean > 0) { const g = ARM.hangBack * Math.min(lean, 0.35) * aw; p[C_ARM_L] += g; p[C_ARM_R] += g; }
  // the elbow never locks straight; more bent on the forward swing
  const floor = ARM.elbowStand * idle + ARM.elbowWalk * walkW;
  for (let i = 0; i < 2; i++) {
    const ec = i ? C_ELB_R : C_ELB_L, ac = i ? C_ARM_R : C_ARM_L;
    let e = p[ec];
    if (e < floor) e += (floor - e) * 0.85 * aw;
    e += ARM.elbowSwing * Math.max(0, p[ac]) * walkW * aw;
    p[ec] = e;
    p[ec + 1] += (i ? -1 : 1) * ARM.pronate * aw;
  }
}

/** Layer 2: in a walk the ribcage tips over the leg that carries the weight (the leg whose knee is straighter). */
function trunk(p: Float32Array, s: BodyLayerIn, w: number): void {
  const gate = (1 - clamp(s.idleW, 0, 1)) * (1 - sstep(3, 5, s.speed)) * sstep(0.3, 0.9, s.speed) * w;
  if (gate < 0.001) return;
  const kd = clamp((p[C_KNEE_L] - p[C_KNEE_R]) / 0.8, -1, 1); // + = left leg straighter = left stance
  p[C_TORSO + 2] += 0.03 * kd * gate;
}

/** Layer 3: the standing person. sw = idle weight times the master weight. */
function standing(p: Float32Array, s: BodyLayerIn, st: BodyLayerState, dt: number, sw: number, aw: number): void {
  // weight shift: change sides now and then, ease over about a second
  st.shiftIn -= dt;
  if (st.shiftIn <= 0) {
    st.side = -st.side;
    st.shiftTarget = st.side * (0.55 + 0.45 * rnd(st));
    st.shiftIn = st.shiftMin + rnd(st) * (st.shiftMax - st.shiftMin);
  }
  st.shiftU += (st.shiftTarget - st.shiftU) * (1 - Math.exp(-dt * 2.2));
  const u = st.shiftU * st.shiftAmp * sw; // + = weight on the right leg (+x)
  p[RIG_CH] += 0.024 * u;                  // the pelvis moves over the loaded foot (the foot lock keeps the shoes put)
  p[C_HIPS + 2] += 0.075 * u;              // the unloaded hip drops
  const tz = -0.035 * u;                   // the ribcage tips back over the loaded leg
  p[C_TORSO + 2] += tz;
  p[C_HEAD + 2] -= tz * 0.7;               // the head stays nearly level
  p[C_TORSO + 1] += 0.02 * u;              // a hint of twist with the hip

  // slouch (teenagers mostly): chest and head forward, shoulders rolled in
  const sl = st.slouch * sw;
  p[C_TORSO] -= 0.07 * sl; p[C_HEAD] -= 0.05 * sl;
  p[C_ARM_L] -= 0.06 * sl * aw; p[C_ARM_R] -= 0.06 * sl * aw;

  // the head turns a little now and then, eased
  st.hIn -= dt;
  if (st.hIn <= 0) {
    const big = rnd(st) < 0.25;
    st.hTYaw = (rnd(st) * 2 - 1) * (big ? 0.38 : 0.15) * (st.hBusy > 1 ? 1.35 : 1);
    st.hTPitch = (rnd(st) * 2 - 1) * 0.07;
    st.hIn = (1.2 + rnd(st) * 5) / st.hBusy;
  }
  const hk = 1 - Math.exp(-dt * 3.2);
  st.hYaw += (st.hTYaw - st.hYaw) * hk; st.hPitch += (st.hTPitch - st.hPitch) * hk;
  p[C_HEAD + 1] += st.hYaw * sw; p[C_HEAD] += st.hPitch * sw;
  { // nobody stands with the head turned right round: the captured clip's own sweep and the turns above together stay under about 45 degrees
    const hy = p[C_HEAD + 1], a = Math.abs(hy);
    if (a > 0.6) p[C_HEAD + 1] = (hy < 0 ? -1 : 1) * (0.6 + 0.2 * (1 - Math.exp(-(a - 0.6) / 0.2)));
  }
  p[C_TORSO + 1] += st.hYaw * 0.12 * sw;

  // a hand in a pocket: held for a while, then let go
  st.gestIn -= dt;
  if (st.gestIn <= 0) {
    if (st.gestOn) { st.gestOn = false; st.gestIn = 5 + rnd(st) * 15; }
    else if (rnd(st) < st.gestChance) { st.gestOn = true; st.gestKind = 1; st.gestSide = rnd(st) < 0.5 ? -1 : 1; st.gestIn = 8 + rnd(st) * 20; }
    else st.gestIn = 4 + rnd(st) * 10;
  }
  st.gestU += ((st.gestOn ? 1 : 0) - st.gestU) * (1 - Math.exp(-dt * 3));
  const g = st.gestU * sw * aw;
  if (g > 0.003) pocket(p, st.gestSide, g);
}

/** One hand in the trouser pocket: the arm eased from its hang to a back-and-in pose (side: -1 left arm, +1 right arm). */
function pocket(p: Float32Array, side: number, g: number): void {
  const ac = side < 0 ? C_ARM_L : C_ARM_R, ec = side < 0 ? C_ELB_L : C_ELB_R, o = side; // o: sign of the outward roll for this arm
  p[ac] += (-0.1 - p[ac]) * g;
  p[ac + 1] += (o * -0.5 - p[ac + 1]) * g;
  p[ac + 2] += (o * 0.05 - p[ac + 2]) * g;
  p[ec] += (0.75 - p[ec]) * g;
  p[ec + 1] += (0 - p[ec + 1]) * g;
}

/**
 * The entry point. `p` is the pose (clipPack channels) after the clip blend and the per-person gait, before the pelvis height and the foot
 * lock. Cost: a few dozen multiplies, one exp per timer, no allocation.
 */
export function applyBodyLayers(p: Float32Array, s: BodyLayerIn, st: BodyLayerState): void {
  const dt = clamp(s.dt, 0, 0.1);
  if (!st.ready) initState(st, s);
  st.t += dt;
  const tw = 1 - clamp(s.off ?? 0, 0, 1);
  if (tw < st.w) st.w = tw; else st.w += (tw - st.w) * Math.min(1, dt * 6);
  const ta = tw * (1 - clamp(s.armsBusy ?? 0, 0, 1));
  if (ta < st.aw) st.aw = ta; else st.aw += (ta - st.aw) * Math.min(1, dt * 6);
  if (st.w < 0.002 && st.aw < 0.002) return;
  arms(p, s, st.aw);
  if (s.cheap) return;
  trunk(p, s, st.w);
  const idle = clamp(s.idleW, 0, 1);
  if (idle > 0.002) standing(p, s, st, dt, st.w * idle, st.aw);
}
