/**
 * Drives one character's bones from the captured clips: speed-blended locomotion (idle, walk style, jog, run), street idles,
 * turn in place, one-shots (stop, start, stumble, sit down, stand up) and the jump. Everything is cross-faded; nothing snaps.
 * It only writes rotations and rig.position of the existing bones (rig, hips, torso, head, arms, elbows, legs, knees and,
 * where a body has them, ankles). Heading and travel belong to the entity.
 */
import * as THREE from 'three';
import { BONES, NCH, RIG_CH, boneChannel, mirrorPose, sampleClip, type Clip } from './clipPack';
import { chainBlend, idleWeight, jumpTime, matchedFrequency, rateFor, smooth, type Blend } from './locomotion';
import type { Gait } from './gait';
import { clipLibrary, type ClipLibrary } from './library';
import { FootLock, soleRel, type LegDims } from './footlock';
import { isCombatPose, keyCombatPose } from './combatPoses';
import { applyBodyLayers, makeBodyLayerState, type BodyLayerIn } from './bodyLayers';

export interface PoseTarget {
  hips: THREE.Object3D; torso: THREE.Object3D; head: THREE.Object3D; rig: THREE.Object3D;
  arms: THREE.Object3D[]; elbows: THREE.Object3D[]; legs: THREE.Object3D[]; knees: THREE.Object3D[];
  ankles?: THREE.Object3D[];
  /** the figure's root (its scale gives the body size) */
  group?: THREE.Object3D;
}

export interface AnimInput {
  /** ground speed (m/s) */
  speed: number;
  /** turning rate (rad/s, the sense of three's rotation.y: positive = turning left); only matters when standing */
  yawRate?: number;
  /** the entity's jump state, when it has one */
  jump?: { phase: 'ground' | 'takeoff' | 'air' | 'land'; t: number; vy: number };
  /** an on-foot action (punch, throw, aim) layered over the upper body; null or absent for none */
  action?: ActionPose | null;
  /** where the person is looking, relative to where the body faces (rad: yaw positive = to their left, pitch positive = up); absent = straight ahead */
  look?: { yaw: number; pitch?: number } | null;
  /** MOVE2: vaulting over a car: progress k 0..1 through the vault and which side the legs swing over (+1 / -1); null or absent for none */
  vault?: { k: number; side: number } | null;
}

interface OneShot { amp: number; clip: Clip; t: number; t0: number; end: number; rate: number; mirror: boolean; fadeIn: number; fadeOut: number }

/**
 * Hand-keyed street idles layered on the captured standing idle (the data we may use has no arms-crossed or leaning take).
 * `side` flips which leg takes the weight and which way the body leans.
 */
export function keyIdle(p: Float32Array, kind: 'crossed' | 'lean', side: number): void {
  const set = (b: Parameters<typeof boneChannel>[0], x: number, y: number, z: number): void => { const o = boneChannel(b); p[o] = x; p[o + 1] = y; p[o + 2] = z; };
  const add = (b: Parameters<typeof boneChannel>[0], x: number, y: number, z: number): void => { const o = boneChannel(b); p[o] += x; p[o + 1] += y; p[o + 2] += z; };
  if (kind === 'crossed') {
    // forearms folded across the belly: shoulders twisted inward about the arm axis, elbows bent past a right angle
    set('armL', 0.3, -1.0, 0.12); set('armR', 0.3, 1.0, -0.12);
    set('elbowL', 1.75, 0, 0); set('elbowR', 1.75, 0, 0);
    add('torso', 0.02, 0, 0); add('head', 0.04, 0, 0);
  } else {
    // leaning back on a wall: the whole body tilts back about the heels, one knee soft, hands low
    const lean = 0.26;
    add('torso', lean * 0.8, 0.05 * side, 0.04 * side); add('head', -0.1, 0, 0); add('hips', lean * 0.4, 0, 0.05 * side);
    set('legL', lean, 0, 0); set('legR', lean, 0, 0);
    set(side > 0 ? 'kneeR' : 'kneeL', -0.45, 0, 0); set(side > 0 ? 'kneeL' : 'kneeR', -0.06, 0, 0);
    set('armL', -0.1, 0, 0.1); set('armR', -0.1, 0, -0.1); set('elbowL', 0.45, 0, 0); set('elbowR', 0.45, 0, 0);
    p[RIG_CH] += 0.03 * side; p[RIG_CH + 1] -= 0.03; p[RIG_CH + 2] += 0.1;
  }
}

/**
 * An on-foot action layered on the upper body (the captured clips have no punch, throw or aim). `k` is the progress 0..1 through the
 * move; for 'aim' it is how far the arms are up (0 hanging, 1 levelled) and `recoil` (0..1) kicks the gun arm back after a shot.
 * Torso, head, shoulders and elbows are written; a punch also adds a stance and a step to the hips, legs and knees (added onto the walk, so it keeps going underneath).
 */
export interface ActionPose { kind: 'punchL' | 'punchR' | 'heavy' | 'throw' | 'aim' | 'grab' | 'held' | 'swingR' | 'swingL' | 'smash' | 'longgun' | 'hurt'; k: number; recoil?: number }

/** The bones an action may write: the upper body and, for a punch's stance and step, the hips, legs and knees (added onto whatever they are doing). */
const ACTION_CH = ['hips', 'torso', 'head', 'armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'legR', 'kneeR'] as const;
const ease = (w: number): number => w * w * (3 - 2 * w);
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 -> 1 over [a, b], then back to 0 over [b, c]: a hump. */
const hump = (a: number, b: number, c: number, x: number): number => sstep(a, b, x) * (1 - sstep(b, c, x));

/**
 * How far a punching arm is out, through a swing of progress `k` (0..1) that lands at `hit`: -0.3 (drawn back a touch), 1 (fully out), 0
 * (back at the guard). Fast out (a cubic ease-out over about 0.2 of the swing), a short hold at the hit, a slower smooth return.
 */
export function swingCurve(k: number, hit: number): number {
  const wind = hit * 0.45, hold = hit + 0.06;
  if (k <= 0) return 0;
  if (k < wind) return -0.3 * sstep(0, wind, k);
  if (k < hit) { const t = (k - wind) / (hit - wind); return -0.3 + 1.3 * (1 - (1 - t) ** 3); }
  if (k < hold) return 1;
  return 1 - sstep(hold, 1, k);
}

/**
 * Hand-keyed upper-body poses, written over a standing/walking pose. Forward is -z in the figure's space, so a positive shoulder x
 * swings the arm forward and up; a positive elbow x folds the forearm up; a negative torso x leans forward; a positive torso y turns
 * to the figure's left; a positive shoulder z swings the arm out sideways (then a positive y sweeps it forward); a positive leg x
 * swings the leg forward.
 *
 * Punches are boxed from an orthodox guard (left foot forward, shoulders bladed, both fists up by the chin, chin tucked): the left
 * jab and the right cross alternate, and the heavy third hit is a right hook with a lunge. The hips turn a beat ahead of the
 * shoulders, the rear foot pivots, the lead foot steps in, and the body surges and leans into the blow.
 */
export function keyAction(p: Float32Array, a: ActionPose): void {
  if (isCombatPose(a.kind)) { keyCombatPose(p, a); return; } // COMBAT2: club swings, the long gun and being hit live in combatPoses.ts
  const set = (b: Parameters<typeof boneChannel>[0], x: number, y: number, z: number): void => { const o = boneChannel(b); p[o] = x; p[o + 1] = y; p[o + 2] = z; };
  const add = (b: Parameters<typeof boneChannel>[0], x: number, y: number, z: number): void => { const o = boneChannel(b); p[o] += x; p[o + 1] += y; p[o + 2] += z; };
  const k = Math.min(1, Math.max(0, a.k));
  if (a.kind === 'punchL' || a.kind === 'punchR' || a.kind === 'heavy') {
    const heavy = a.kind === 'heavy', jab = a.kind === 'punchL';
    const hit = heavy ? 0.5 : 0.4;
    const e = swingCurve(k, hit);                       // the striking arm: -0.3 .. 1
    const ep = Math.max(0, e);
    const lead = swingCurve(Math.min(1, k + 0.06), hit); // the hips are a beat ahead
    // both fists at the guard, the striking one then goes out: shoulder x / elbow x as functions of the extension
    const sh = 0.95 + 0.52 * e, el = e >= 0 ? 1.95 - 1.85 * e : 1.95 - 0.9 * e;
    if (jab) {
      set('armL', sh, -0.3 + 0.28 * ep, -0.1); set('elbowL', el, 0, 0);
      set('armR', 0.95, 0.3, 0.1); set('elbowR', 1.95, 0, 0);
    } else if (!heavy) {
      set('armR', sh, 0.3 - 0.28 * ep, 0.1); set('elbowR', el, 0, 0);
      set('armL', 0.95, -0.3, -0.1); set('elbowL', 1.95, 0, 0);
    } else {
      // a hook: the arm out to the side and swept round in a flat arc, elbow bent
      set('armR', 0.35 + 0.2 * ep, 0.1 + 0.95 * e, 1.1 + 0.25 * e); set('elbowR', 1.55 - 0.2 * e, 0, 0);
      set('armL', 0.95, -0.3, -0.1); set('elbowL', 1.95, 0, 0);
    }
    // the body: bladed in the guard, turned into the blow (jab: a little more shoulder; cross: hips then shoulders square up and past; hook: all of it)
    const twT = jab ? -0.3 - 0.1 * e : heavy ? -0.4 + 1.0 * e : -0.3 + 0.6 * e;
    const twH = jab ? -0.2 - 0.05 * lead : heavy ? -0.25 + 0.65 * lead : -0.2 + 0.4 * lead;
    const lean = jab ? -0.1 : heavy ? -0.28 : -0.14;
    add('torso', -0.05 + lean * ep, twT, heavy ? -0.1 * ep : 0.03 * ep);
    add('hips', 0.0, twH, 0);
    add('head', -0.1 + 0.35 * lean * ep, 0.2 * twT, 0);
    // the legs: staggered stance, the lead foot steps in on the blow, the rear foot pivots and drives
    const stepIn = jab ? 0.16 : heavy ? 0.2 : 0.05;
    add('legL', 0.17 + stepIn * ep, -0.12, 0); add('kneeL', -0.22 + (jab ? 0.1 * ep : heavy ? -0.16 * ep : -0.12 * ep), 0, 0);
    add('legR', -0.1 - (jab ? 0.06 : heavy ? 0.1 : 0.06) * ep, -0.4 + (jab ? 0 : 0.4) * ep, 0); add('kneeR', -0.26 + (jab ? 0.12 * ep : heavy ? 0.08 * ep : -0.18 * ep), 0, 0);
    p[RIG_CH + 2] -= (jab ? 0.04 : heavy ? 0.14 : 0.07) * ep;
  } else if (a.kind === 'throw') {
    // overhand with the right: arm cocked up and back, torso arched, then whipped through and down
    const cock = hump(0, 0.38, 0.5, k);
    const whip = sstep(0.38, 0.55, k) * (1 - sstep(0.62, 1, k));
    set('armR', 2.9 * cock + 1.5 * whip + 0.2, -0.1, -0.35 * cock);
    set('elbowR', 1.9 * cock + 0.25 * whip, 0, 0);
    set('armL', 0.9 * cock + 0.4, 0.2, 0.2 * cock); set('elbowL', 0.5 * cock + 0.3, 0, 0);
    add('torso', 0.2 * cock - 0.3 * whip, 0.5 * whip - 0.35 * cock, 0);
    add('head', 0.04 - 0.08 * whip, 0, 0);
  } else if (a.kind === 'grab') {
    // POLICE2, an officer taking hold: both arms reach forward and a little out, hands open, shoulders squared, leaning in; k is how far in
    const r = sstep(0, 0.35, k);
    set('armL', 1.25 * r, -0.2 * r, -0.18 * r); set('elbowL', 0.55 * r, 0, 0);
    set('armR', 1.25 * r, 0.2 * r, 0.18 * r); set('elbowR', 0.55 * r, 0, 0);
    add('torso', -0.14 * r, 0, 0); add('head', 0.05 * r, 0, 0);
  } else if (a.kind === 'held') {
    // POLICE2, the player held: both arms drawn back and in behind, shoulders rolled forward, head down
    const r = sstep(0, 0.3, k);
    set('armL', -0.55 * r, 0.35 * r, 0.12 * r); set('elbowL', 0.35 * r, 0, 0);
    set('armR', -0.55 * r, -0.35 * r, -0.12 * r); set('elbowR', 0.35 * r, 0, 0);
    add('torso', -0.12 * r, 0, 0); add('head', 0.22 * r, 0, 0);
  } else {
    // pistol held out at arm's length in both hands; the shot kicks the gun arm up and back
    const up = sstep(0, 1, k), r = Math.min(1, Math.max(0, a.recoil ?? 0));
    set('armR', 0.1 + 1.38 * up + 0.2 * r, -0.04 * up, 0.04 * up);
    set('elbowR', 0.15 * up + 0.4 * r, 0, 0);
    set('armL', 0.1 + 1.12 * up + 0.1 * r, 0.5 * up, -0.08 * up); set('elbowL', 0.2 + 0.85 * up, 0, 0);
    add('torso', -0.04 * up + 0.07 * r, -0.2 * up, 0);
    add('head', 0.02 * up - 0.03 * r, 0.12 * up, 0);
  }
}

/**
 * The vault (hood slide), hand-keyed: no captured vault, climb or hurdle clip is in the pack (it holds walks, runs, jump, stumble, sit, stand,
 * turns and idles). Five poses, blended smoothly: the run's last stride (k 0), the plant (0.2: lead knee up, one hand reaching for the hood,
 * trail leg driving), the crossing (0.5: weight on the planted hand, hips rolled over it, both legs swung through to the side), the landing
 * (0.78: two feet down, knees taking it, arms out) and the first recovery stride (1.0). `side` is which way the legs swing (mirrored for -1).
 * Forward is -z; a negative torso x leans forward; knees bend to negative x; a positive elbow x folds the forearm up.
 */
export const VAULT_KEYS: ReadonlyArray<{ k: number; v: Readonly<Record<string, readonly [number, number, number]>>; dy: number; surge: number }> = [
  { k: 0.0, dy: 0, surge: 0, v: { hips: [0.05, 0, 0], torso: [-0.28, 0, 0], head: [0.15, 0, 0], armL: [-0.5, 0, 0.1], elbowL: [1.2, 0, 0], armR: [0.7, 0, -0.1], elbowR: [1.3, 0, 0], legL: [0.55, 0, 0], kneeL: [-0.9, 0, 0], legR: [-0.35, 0, 0], kneeR: [-0.7, 0, 0] } },
  { k: 0.2, dy: 0.03, surge: -0.04, v: { hips: [0.1, 0.1, 0.05], torso: [-0.62, 0.1, -0.05], head: [0.45, 0, 0], armL: [0.55, 0, 0.1], elbowL: [0.55, 0, 0], armR: [1.2, 0, -0.1], elbowR: [0.15, 0, 0], legL: [1.25, 0, 0.08], kneeL: [-1.45, 0, 0], legR: [-0.4, 0, 0], kneeR: [-0.35, 0, 0] } },
  { k: 0.5, dy: 0.1, surge: -0.1, v: { hips: [0.15, 0.2, 0.45], torso: [-0.72, 0.12, -0.28], head: [0.5, 0.1, 0], armL: [0.1, 0, 0.35], elbowL: [0.75, 0, 0], armR: [1.05, 0, -0.1], elbowR: [0.1, 0, 0], legL: [0.95, 0, 0.3], kneeL: [-1.15, 0, 0], legR: [0.7, 0, 0.18], kneeR: [-1.05, 0, 0] } },
  { k: 0.78, dy: 0.0, surge: -0.03, v: { hips: [0.2, 0, 0.08], torso: [-0.34, 0, -0.04], head: [0.2, 0, 0], armL: [0.45, 0, 0.55], elbowL: [0.55, 0, 0], armR: [0.35, 0, -0.55], elbowR: [0.6, 0, 0], legL: [0.55, 0, 0.05], kneeL: [-0.85, 0, 0], legR: [0.3, 0, 0.03], kneeR: [-0.75, 0, 0] } },
  { k: 1.0, dy: 0, surge: 0, v: { hips: [0.05, 0, 0], torso: [-0.22, 0, 0], head: [0.1, 0, 0], armL: [0.5, 0, 0.1], elbowL: [1.1, 0, 0], armR: [-0.4, 0, -0.1], elbowR: [1.2, 0, 0], legL: [-0.4, 0, 0], kneeL: [-0.7, 0, 0], legR: [0.5, 0, 0], kneeR: [-0.9, 0, 0] } },
];

/** Write the vault pose at progress `k` (absolute, all bones; the controller mixes it over the run by a weight). */
export function keyVault(p: Float32Array, k: number, side: number): void {
  const K = VAULT_KEYS, x = Math.min(1, Math.max(0, k));
  let i = 0;
  while (i < K.length - 2 && x > K[i + 1].k) i++;
  const a = K[i], b = K[i + 1], u = sstep(a.k, b.k, x);
  for (const name of BONES) {
    const o = boneChannel(name);
    const va = a.v[name], vb = b.v[name];
    if (va && vb) for (let c = 0; c < 3; c++) p[o + c] = va[c] + (vb[c] - va[c]) * u; // (every bone is keyed; an unkeyed one keeps the pose under it)
  }
  p[RIG_CH] = 0; p[RIG_CH + 1] = a.dy + (b.dy - a.dy) * u; p[RIG_CH + 2] = a.surge + (b.surge - a.surge) * u;
  if (side < 0) mirrorPose(p);
}

/** the skeleton the clips were cut for (scripts/anim/retarget.mjs OUR) and the ankle's height above the sole */
const REF = { thigh: 0.4, shin: 0.345 };
const ANKLE_H = 0.075;

/**
 * One-shots the pedestrians play, with the amounts that suit a person on the pavement. The flinch is captured from someone ducking a
 * thrown object (a deep crouch, spine bent past 70 degrees): played whole on a startled walker it bent them double, so it is only a
 * fraction. The get-up clip is a lying-down take and is NOT used on pedestrians (they are not lying down when it would play).
 */
export const PED_ONESHOTS = { flinch: { amp: 0.12, from: 0.12, to: 0.75, rate: 1.7, fadeIn: 0.06, fadeOut: 0.2 } } as const;

export const JUMP_TIMES = { takeoff: 0.07, land: 0.2, gravity: 17 };

export class AnimController {
  private phase: number;
  private idleT: number;
  private idleName = 'idle';
  private idleW = -1;
  private idleMirror = false;
  private keyed: 'crossed' | 'lean' | null = null;
  private prevIdle = 'idle';
  private prevIdleMirror = false;
  private prevIdleT = 0;
  private idleFade = 0;
  private walkTurnCool = 0;
  private shot: OneShot | null = null;
  private turnT = 0;
  private turnW = 0;
  private jumpW = 0;
  private jumpTouched = false;
  private actionW = 0;
  private lastAction: ActionPose | null = null;
  private recentMax = 0;
  private sinceStill = 9;
  private startedRun = false;
  private readonly base = new Float32Array(NCH);
  private readonly loco = new Float32Array(NCH);
  private readonly tmp = new Float32Array(NCH);
  private readonly tmp2 = new Float32Array(NCH);
  private readonly bones: Array<THREE.Object3D | undefined>;
  /** the speed ratio of the last frame, for stride length */
  private lastRatio = 1;
  private readonly dims: { thigh: number; shin: number };
  /** this body's leg length over the reference skeleton's (the clips are cut to the reference): stride and speed scale with it */
  private readonly legScale: number;
  private readonly fp: number;
  private readonly torsoRest = new THREE.Vector3();
  private readonly headRel = new THREE.Vector3();
  private readonly stoopBaked: number;
  private readonly qA = new THREE.Quaternion();
  private readonly qB = new THREE.Quaternion();
  private readonly eul = new THREE.Euler();
  private readonly v3 = new THREE.Vector3();
  private yawLead = 0;
  /** the entity's acceleration (m/s2, clip proportions, eased) and seconds since a start from rest or a stop began (-1 when none): inputs to the body layers */
  private accelS = 0;
  private startT = -1;
  private stopT = -1;
  private stillFor = 0;
  private startPeak = 0;
  /** the speed the blends use: the entity's speed with its rate of change limited, so an input that snaps cannot snap the pose */
  private speedS = -1;
  private turnDir = 1;
  private actionU = 0;
  private jumpU = 0;
  private vaultU = 0;
  private vaultLast: { k: number; side: number } | null = null;
  private vaultTouched = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private aliveT: number;
  private readonly lock: FootLock;
  /** the POSE seat's upper-body layers: one small state and one reused input per person */
  private readonly bls = makeBodyLayerState();
  private readonly bli: BodyLayerIn;
  /** 0 turns the body layers off (tests) */
  bodyLayersOn = true;
  private readonly rigV = new THREE.Vector3();
  private readonly refDims: LegDims;
  private readonly realDims: LegDims;
  private readonly lockQ = { leg: [new THREE.Quaternion(), new THREE.Quaternion()], knee: [new THREE.Quaternion(), new THREE.Quaternion()], ankle: [new THREE.Quaternion(), new THREE.Quaternion()] };
  /** arm swing left over for a hand that is carrying something: [left, right] (1 = free swing) */
  private readonly armLoad = [1, 1];
  /** the far level of detail: no foot lock, no breathing or look-at (a cheaper update for crowds and the phone tier) */
  cheap = false;
  /** tests and the showcase: false measures the clips' own foot skate with the lock off */
  footLockOn = true;
  /** 0 turns the lean into a turn off (tests); 1 is the shipped amount */
  leanGain = 1;
  /** the foot lock's weights (0 free, 1 held) for tests and the showcase */
  get footLock(): readonly number[] { return this.lock.w; }

  constructor(private readonly target: PoseTarget, private gait: Gait, private readonly lib: ClipLibrary = clipLibrary()) {
    this.phase = gait.phase;
    this.idleT = gait.idleOffset;
    const t = target;
    // this body's own proportions (the bind pose of the rig): hip height, thigh, shin to the ankle, and where the head sits against the torso
    const hipY = t.legs[0].position.y, thigh = Math.max(0.2, -t.knees[0].position.y);
    this.dims = { thigh, shin: Math.max(0.2, hipY - thigh - ANKLE_H) };
    const sy = t.group?.scale.y ?? 1;
    this.legScale = ((this.dims.thigh + this.dims.shin) * sy) / (REF.thigh + REF.shin);
    this.fp = this.dims.thigh + this.dims.shin;
    this.torsoRest.copy(t.torso.position);
    this.headRel.copy(t.head.position).sub(t.torso.position);
    this.stoopBaked = (t.torso.userData.stoopBaked as number | undefined) ?? 0;
    this.bones = [t.hips, t.torso, t.head, t.arms[0], t.elbows[0], t.arms[1], t.elbows[1], t.legs[0], t.knees[0], t.legs[1], t.knees[1], t.ankles?.[0], t.ankles?.[1]];
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    this.refDims = { hip: [V(0.09, 0.82, 0), V(-0.09, 0.82, 0)], knee: [V(0, -REF.thigh, 0), V(0, -REF.thigh, 0)], ankle: [V(0, -REF.shin, 0), V(0, -REF.shin, 0)], hasAnkle: true };
    const hasAnkle = !!t.ankles;
    this.realDims = {
      hip: [t.legs[0].position.clone(), t.legs[1].position.clone()], knee: [t.knees[0].position.clone(), t.knees[1].position.clone()],
      ankle: [0, 1].map((i) => (t.ankles && t.ankles[i].position.length() > 0.1 ? t.ankles[i].position.clone() : V(0, -this.dims.shin, 0))) as [THREE.Vector3, THREE.Vector3], hasAnkle,
    };
    this.lock = new FootLock(this.realDims);
    this.aliveT = gait.phase * 40;
    this.bls.rng = (gait.seed | 0) || 1;
    this.bli = { dt: 0, speed: 0, idleW: 1, yawRate: 0, age: gait.age, armSwing: gait.armSwing, sway: gait.sway, phase0: gait.phase, seed: gait.seed, splay: (t.group?.userData.splay as number | undefined) ?? 0, startT: -1, stopT: -1 };
  }

  /** What a person carries: a bag in a hand takes the swing out of that arm. `arm` 0 = left, 1 = right, `free` 0..1 of the normal swing. */
  setCarry(arm: 0 | 1, free: number): void { this.armLoad[arm] = free; }

  setGait(g: Gait): void { this.gait = g; }
  get busy(): boolean { return this.shot !== null; }
  hasClip(name: string): boolean { return this.lib.has(name); }

  /** Street idle: 'idle' | 'idle2' | 'phone' (clips) or null for the default standing idle. `mirror` swaps the hand. */
  setIdle(name: string | null, mirror = false): void {
    this.keyed = name === 'crossed' || name === 'lean' ? name : null; // hand-keyed street poses, no capture of these exists in the data we may use
    const next = name && !this.keyed && this.lib.has(name) ? name : 'idle';
    if (next !== this.idleName || mirror !== this.idleMirror) { this.prevIdle = this.idleName; this.prevIdleMirror = this.idleMirror; this.prevIdleT = this.idleT; this.idleFade = 1; }
    this.idleName = next;
    this.idleMirror = mirror;
  }
  get idleClipName(): string { return this.idleName; }

  /** Play a one-shot clip over whatever is going on. Returns false when the clip is not loaded. */
  playOnce(name: string, o: { amp?: number; rate?: number; mirror?: boolean; from?: number; to?: number; fadeIn?: number; fadeOut?: number } = {}): boolean {
    const clip = this.lib.get(name);
    if (!clip) return false;
    this.shot = { amp: o.amp ?? 1, clip, t: (o.from ?? 0) * clip.duration, t0: (o.from ?? 0) * clip.duration, end: (o.to ?? 1) * clip.duration, rate: o.rate ?? 1, mirror: o.mirror ?? false, fadeIn: o.fadeIn ?? 0.12, fadeOut: o.fadeOut ?? 0.2 };
    return true;
  }
  cancelOnce(fade = 0.15): void { if (this.shot) { this.shot.end = Math.min(this.shot.end, this.shot.t + fade); this.shot.fadeOut = fade; } }

  private chain(): Clip[] | null {
    const walk = this.lib.get(this.gait.walkClip) ?? this.lib.get('walk');
    const jog = this.lib.get('jog'), run = this.lib.get('run');
    if (!walk || !jog || !run) return null;
    return walk.speed < jog.speed ? [walk, jog, run] : [jog, run];
  }

  /** Advance and pose. Returns false when the core clips are missing (caller falls back to the procedural walk). */
  update(dt: number, inp: AnimInput): boolean {
    const chain = this.chain();
    const idle = this.lib.get(this.idleName) ?? this.lib.get('idle');
    if (!chain || !idle) return false;
    const raw = Math.max(0, inp.speed) / this.legScale; // in the clips' proportions
    // an input that jumps (a pedestrian stopped dead, a car door) is eased: at most 16 m/s^2 up and 22 down, so the blends below never see a step
    const prevS = this.speedS;
    this.speedS = this.speedS < 0 ? raw : this.speedS + Math.max(-22 * dt, Math.min(16 * dt, raw - this.speedS));
    const speed = this.speedS;
    if (prevS >= 0 && dt > 0) this.accelS += ((speed - prevS) / dt - this.accelS) * Math.min(1, dt * 8);
    const g = this.gait;

    // idle layer
    this.idleT += dt;
    sampleClip(idle, this.idleT, this.base);
    if (this.idleMirror) mirrorPose(this.base);
    if (this.idleFade > 0.01) { // changing idles: cross-fade from the old one
      const old = this.lib.get(this.prevIdle);
      this.prevIdleT += dt;
      this.idleFade = Math.max(0, this.idleFade - dt / 0.35);
      if (old) { sampleClip(old, this.prevIdleT, this.tmp); if (this.prevIdleMirror) mirrorPose(this.tmp); this.mix(this.base, this.tmp, this.idleFade * this.idleFade); }
    }
    if (this.keyed) keyIdle(this.base, this.keyed, this.idleMirror ? -1 : 1);

    // locomotion layer
    // the stand is upright and the walk has bent knees, so the change between them is spread over a fifth of a second even when the
    // speed snaps (a first frame takes the weight as it is)
    const iwT = idleWeight(speed);
    this.idleW = this.idleW < 0 ? iwT : this.idleW + Math.max(-dt / 0.2, Math.min(dt / 0.2, iwT - this.idleW));
    const iw = this.idleW;
    if (iw < 1) {
      const b: Blend = chainBlend(speed, chain);
      // GAIT: the phase advances so the planted foot travels back at the ground speed (locomotion.ts matchedFrequency), stepped at the midpoint of the frame
      const sf = this.strideFactor();
      const fMid = matchedFrequency(speed, chain, b, this.phase + 0.5 * dt * matchedFrequency(speed, chain, b, this.phase, sf), sf);
      this.phase = (this.phase + Math.max(fMid, 0.55 / chain[b.lo].duration) * dt) % 1;
      sampleClip(chain[b.lo], this.phase * chain[b.lo].duration, this.loco);
      if (b.hi !== b.lo) { sampleClip(chain[b.hi], this.phase * chain[b.hi].duration, this.tmp); for (let k = 0; k < NCH; k++) this.loco[k] += (this.tmp[k] - this.loco[k]) * b.t; }
      this.lastRatio = rateFor(speed, chain[b.t > 0.5 ? b.hi : b.lo]);
      this.applyGait(this.loco, speed);
      for (let k = 0; k < NCH; k++) this.base[k] += (this.loco[k] - this.base[k]) * (1 - iw);
    }

    // GAIT: the clock of a start from rest (short first steps and a lean while it runs: 0.35 s walking, up to 0.6 s to a run) and of a stop (steps that shorten)
    this.stillFor = raw < 0.3 ? this.stillFor + dt : 0;
    if (this.startT < 0 && raw > 0.3 && this.sinceStill < 0.2 && this.stillFor === 0 && this.stopT < 0 && prevS >= 0 && this.recentMax < 0.9) { this.startT = 0; this.startPeak = raw; }
    if (this.startT >= 0) {
      this.startT += dt; this.startPeak = Math.max(this.startPeak, raw);
      if (this.startT > this.startLen() || raw < 0.2) this.startT = -1;
    }
    if (this.stopT >= 0) { this.stopT += dt; if (this.stopT > 1 || raw > 0.9) this.stopT = -1; }
    else if (raw < 0.35 && this.recentMax > 1.0 && this.startT < 0) this.stopT = 0;
    // start / stop, detected from the speed history (entities ramp speed over several frames, so look back a little)
    this.recentMax = Math.max(raw, this.recentMax - 2.5 * dt);
    this.sinceStill = raw < 0.3 ? 0 : this.sinceStill + dt;
    if (!this.shot && !(inp.jump && inp.jump.phase !== 'ground')) {
      if (raw < 0.35 && this.recentMax > 1.2) {
        this.playOnce(this.recentMax > 2.6 ? 'stopRun' : 'stopWalk', { from: this.recentMax > 2.6 ? 0.4 : 0.45, fadeIn: 0.1, fadeOut: 0.25 });
        this.recentMax = 0;
      } else if (raw > 2.0 && this.sinceStill < 0.4 && !this.startedRun) { this.playOnce('startRun', { to: 0.55, fadeIn: 0.05, fadeOut: 0.3 }); this.startedRun = true; }
    }
    if (raw < 0.3) this.startedRun = false;
    if (this.shot && raw > 0.9 && this.shot.clip.name.startsWith('stop')) this.cancelOnce(0.12);

    // turn in place. The direction is latched when the turn starts: it used to follow the rate's sign every frame, so the mirrored pose flipped in
    // (a 137 degree jump in the head) the frame the rate fell to zero while the turn was still fading out.
    const turn = this.lib.get('turn');
    const yawIn = inp.yawRate ?? 0;
    const wantTurn = !!turn && speed < 0.5 && Math.abs(yawIn) > 0.9 && !this.shot;
    if (wantTurn && this.turnW < 0.05) this.turnDir = yawIn > 0 ? 1 : -1;
    else if (wantTurn && Math.abs(yawIn) > 1.5 && (yawIn > 0 ? 1 : -1) !== this.turnDir && this.turnW < 0.5) this.turnDir = yawIn > 0 ? 1 : -1;
    this.turnW += ((wantTurn ? 1 : 0) - this.turnW) * Math.min(1, dt * 9);
    if (turn && this.turnW > 0.01) {
      const rate = Math.min(2.5, Math.max(0.4, Math.abs(wantTurn ? yawIn : this.turnDir * 1.9) / (Math.abs(turn.turn) / turn.duration)));
      this.turnT += dt * rate;
      const lo = 0.08 * turn.duration, hi = 0.92 * turn.duration, span = hi - lo, fz = 0.14 * span;
      if (this.turnT > hi) this.turnT -= span;
      const tt = Math.max(this.turnT, lo);
      sampleClip(turn, tt, this.tmp);
      // a turn longer than the capture loops: the last stretch cross-fades into the first, so the wrap is seamless
      if (tt > hi - fz) { sampleClip(turn, tt - span, this.tmp2); this.mix(this.tmp, this.tmp2, ease((tt - (hi - fz)) / fz)); }
      if ((this.turnDir > 0) !== (turn.turn > 0)) mirrorPose(this.tmp);
      this.mix(this.base, this.tmp, ease(this.turnW));
    } else this.turnT = 0;

    // a corner while walking: the captured walking turn, mirrored for the other way
    this.walkTurnCool -= dt;
    const wt = this.lib.get('walkTurn');
    if (wt && !this.shot && this.walkTurnCool <= 0 && speed > 0.7 && speed < 2.4 && Math.abs(inp.yawRate ?? 0) > 1.8) {
      const yaw = inp.yawRate ?? 0;
      this.playOnce('walkTurn', { mirror: (yaw > 0) !== (wt.turn > 0), rate: Math.min(2, Math.max(0.8, Math.abs(yaw) / (Math.abs(wt.turn) / wt.duration))), from: 0.2, to: 0.9, fadeIn: 0.15, fadeOut: 0.25 });
      this.walkTurnCool = 1.2;
    }

    // one-shots
    if (this.shot) {
      const s = this.shot;
      s.t += dt * s.rate;
      // the fade-in runs from where the shot STARTED (a shot that starts part way through its clip used to begin at full weight: a pop)
      const w = Math.min(1, (s.t - s.t0) / Math.max(0.001, s.fadeIn * s.rate), (s.end - s.t) / Math.max(0.001, s.fadeOut * s.rate));
      if (s.t >= s.end) this.shot = null;
      else { sampleClip(s.clip, s.t, this.tmp2); if (s.mirror) mirrorPose(this.tmp2); this.mix(this.base, this.tmp2, ease(Math.max(0, w)) * s.amp); }
    }

    // jump
    const j = inp.jump;
    const jumpClip = this.lib.get('jump');
    const jumping = !!j && j.phase !== 'ground' && !!jumpClip;
    this.jumpU = Math.max(0, Math.min(1, this.jumpU + (jumping ? dt / 0.06 : -dt / 0.16)));
    this.jumpW = ease(this.jumpU);
    if (jumpClip && j && this.jumpW > 0.01) {
      const ph = j.phase === 'ground' ? 'land' : j.phase;
      const airtime = (2 * Math.max(1, j.vy)) / JUMP_TIMES.gravity;
      const t = j.phase === 'ground' ? jumpClip.duration : jumpTime(jumpClip, ph, j.t, JUMP_TIMES.takeoff, ph === 'air' ? Math.max(airtime, j.t + Math.max(0.05, j.vy / JUMP_TIMES.gravity)) : airtime, JUMP_TIMES.land);
      sampleClip(jumpClip, t, this.tmp);
      this.mix(this.base, this.tmp, this.jumpW);
    }
    this.jumpTouched = this.jumpW > 0.01;

    // vault over a car: the hand-keyed whole body over the run, faded in over a tenth of a second and out over a quarter
    if (inp.vault) this.vaultLast = inp.vault;
    this.vaultU = Math.max(0, Math.min(1, this.vaultU + (inp.vault ? dt / 0.1 : -dt / 0.25)));
    const vaultW = ease(this.vaultU);
    if (this.vaultLast && vaultW > 0.01) {
      this.tmp.set(this.base);
      keyVault(this.tmp, this.vaultLast.k, this.vaultLast.side);
      this.mix(this.base, this.tmp, vaultW);
    } else if (!inp.vault) this.vaultLast = null;
    this.vaultTouched = vaultW > 0.01;

    // an on-foot action (punch, throw, aim): the hand-keyed upper body, faded in and out so the arms never snap
    if (inp.action) this.lastAction = inp.action;
    this.actionU = Math.max(0, Math.min(1, this.actionU + (inp.action ? dt / (inp.action.kind === 'aim' || inp.action.kind === 'longgun' ? 0.18 : inp.action.kind === 'hurt' ? 0.05 : 0.09) : -dt / 0.2)));
    this.actionW = ease(this.actionU);
    if (this.lastAction && this.actionW > 0.01) {
      this.tmp.set(this.base);
      keyAction(this.tmp, this.lastAction);
      for (const name of ACTION_CH) { const o = boneChannel(name); for (let c = 0; c < 3; c++) this.base[o + c] += (this.tmp[o + c] - this.base[o + c]) * this.actionW; }
      this.base[RIG_CH + 2] += (this.tmp[RIG_CH + 2] - this.base[RIG_CH + 2]) * this.actionW;
    } else if (!inp.action) this.lastAction = null;

    this.write(this.base, inp.yawRate ?? 0, speed, dt, inp, raw);
    return true;
  }

  /** how much this person's leg swing is scaled: their own stride, a little more when the clip is played fast, less for a quick cadence (short quick steps) */
  private strideFactor(): number {
    const g = this.gait;
    // a start takes short first steps that grow over the start's length; a stop's last steps shorten
    const startG = this.startT >= 0 ? 0.55 + 0.45 * ease(Math.min(1, this.startT / this.startLen())) : 1;
    const stopG = this.stopT >= 0 ? 1 - 0.35 * sstep(0, 0.45, this.stopT) : 1;
    return g.stride * Math.pow(Math.min(1.6, Math.max(0.7, this.lastRatio)), 0.3) / g.cadence * startG * stopG;
  }
  /** seconds a start takes to reach pace: 0.35 walking, longer toward a run (the key still answers at once; the weight is in the pose and the entity's ramp) */
  private startLen(): number { return 0.35 + 0.25 * sstep(2, 4, this.startPeak); }

  /** Per-person modifiers on the locomotion pose. */
  private applyGait(p: Float32Array, speed: number): void {
    const g = this.gait;
    const stride = this.strideFactor();
    const hipL = boneChannel('legL'), hipR = boneChannel('legR');
    p[hipL] *= stride; p[hipR] *= stride;
    p[boneChannel('kneeL')] *= 1 + (stride - 1) * 0.5; p[boneChannel('kneeR')] *= 1 + (stride - 1) * 0.5;
    p[boneChannel('armL')] *= g.armSwing * this.armLoad[0]; p[boneChannel('armR')] *= g.armSwing * this.armLoad[1];
    p[boneChannel('elbowL')] *= 0.6 + 0.4 * g.armSwing; p[boneChannel('elbowR')] *= 0.6 + 0.4 * g.armSwing;
    const walkiness = 1 - smooth(1.6, 3.0, speed); // posture quirks fade out when running
    const own = this.stoopBaked > 0.02 ? 0.3 : 1; // a stoop already baked into this body's rest pose is not added again
    // forward is negative x (a captured run leans to about -12 degrees), so a forward lean subtracts
    p[boneChannel('torso')] -= g.lean * walkiness * own;
    p[boneChannel('head')] -= (g.headDrop * walkiness - g.lean * 0.4 * walkiness) * own;
    p[RIG_CH] *= g.sway; p[RIG_CH + 2] *= g.sway; p[RIG_CH + 1] *= 0.8 + 0.2 * g.sway;
  }

  private mix(into: Float32Array, over: Float32Array, w: number): void { for (let k = 0; k < NCH; k++) into[k] += (over[k] - into[k]) * w; }

  /**
   * Write the pose to the bones. Order: what the body does on top of the clips (walking lead, breathing, look-at), the pelvis height from the SOLES
   * (so a planted shoe stands on the ground), the rotations, then the foot lock, which may bend the legs to hold a planted foot (footlock.ts).
   */
  private write(p: Float32Array, yawRate: number, speed: number, dt: number, inp: AnimInput, rawSpeed: number): void {
    // walking turns: the head and shoulders lead the body round a corner, the body leans into it
    const lead = Math.min(1, speed / 1.2) * Math.max(-3, Math.min(3, yawRate));
    this.yawLead += (lead - this.yawLead) * Math.min(1, dt * 12);
    p[boneChannel('head')] += 0; p[boneChannel('head') + 1] += this.yawLead * 0.13;
    p[boneChannel('torso') + 1] += this.yawLead * 0.07;
    // the body leans into a turn the faster it goes (a lean of about 11 degrees at a sprint turning at 3 rad/s, none standing): hips and chest roll together
    const leanZ = Math.max(-0.2, Math.min(0.2, -this.yawLead * Math.min(speed, 6.5) * 0.0105 * this.leanGain));
    p[boneChannel('torso') + 2] += leanZ * 0.6; p[boneChannel('hips') + 2] += leanZ * 0.4;
    // weight: the body leans into a start and back into a brake (up to about 10 degrees forward, 11 back), head kept level; none when the speed is steady
    const fw = Math.max(-0.2, Math.min(0.17, this.accelS * 0.011)) * Math.min(1, speed / 0.6 + 0.4);
    p[boneChannel('torso')] -= fw * 0.65; p[boneChannel('hips')] -= fw * 0.35; p[boneChannel('head')] += fw * 0.5;
    if (this.bodyLayersOn) this.layers(p, dt, speed, yawRate, inp);
    if (!this.cheap) this.alive(p, dt, inp);
    // the pelvis: the capture says how high its lowest sole was above the ground (0 for a foot on the floor, more in a stride's flight or a jump);
    // this body's own legs are then placed so THEIR lowest sole is at that height. The old rule used the ankle, so a rolling foot dug in.
    const sc = this.fp / (REF.thigh + REF.shin);
    const dyRef = p[RIG_CH + 1];
    const cRef = REF.thigh + REF.shin + ANKLE_H + dyRef + soleRel(p, this.refDims, true);
    const clear = cRef * sc * sstep(0.004, 0.03, cRef);
    const real = soleRel(p, this.realDims, true);
    p[RIG_CH + 1] = clear - real - this.target.legs[0].position.y;
    for (let b = 0; b < BONES.length; b++) {
      const o = this.bones[b];
      if (o) o.rotation.set(p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
    }
    this.target.rig.position.set(p[RIG_CH] * sc, p[RIG_CH + 1], p[RIG_CH + 2] * sc);
    // the head rides on the torso (it is a child of the rig here): lean, duck and lie down take it along
    const th = boneChannel('torso');
    this.qA.setFromEuler(this.eul.set(p[th], p[th + 1], p[th + 2]));
    this.target.head.position.copy(this.headRel).applyQuaternion(this.qA).add(this.torsoRest);
    // the foot lock, off while sitting, falling, jumping or turning on the spot
    if (this.cheap) { this.lock.reset(); return; }
    const sitting = !!this.shot && /^(sit|stand|stumble|flinch)/.test(this.shot.clip.name);
    const turning = Math.abs(yawRate) > 1.4 && speed < 1;
    const enable = !this.footLockOn || sitting || this.jumpTouched || this.vaultTouched || turning ? 0 : 1;
    const gz = this.target.group?.scale.z ?? 1;
    this.rigV.set(p[RIG_CH] * sc, p[RIG_CH + 1], p[RIG_CH + 2] * sc);
    const lq = this.lockQ;
    const hit = this.lock.solve(p, this.rigV, dt, rawSpeed * this.legScale / (gz || 1), yawRate, enable, lq.leg, lq.knee, lq.ankle);
    this.target.rig.position.copy(this.rigV);     // the lock may have sunk the pelvis a little to reach a held foot
    for (let i = 0; i < 2; i++) if (hit[i]) {
      this.bones[7 + i * 2]?.quaternion.copy(lq.leg[i]);
      this.bones[8 + i * 2]?.quaternion.copy(lq.knee[i]);
      if (this.target.ankles) this.bones[11 + i]?.quaternion.copy(lq.ankle[i]);
    }
  }

  /** The POSE seat's upper-body layers (bodyLayers.ts): arms that hang, the ribcage over the weight, standing weight shift and head. They only add to the upper body. */
  private layers(p: Float32Array, dt: number, speed: number, yawRate: number, inp: AnimInput): void {
    const i = this.bli, s = this.shot;
    const busy = !!s && /^(sit|stand|stumble|flinch)/.test(s.clip.name);
    i.dt = dt; i.speed = speed; i.idleW = Math.max(0, this.idleW); i.yawRate = yawRate; i.age = this.gait.age; i.armSwing = this.gait.armSwing; i.sway = this.gait.sway;
    i.accel = this.accelS; i.phase = this.phase; i.stride = this.strideFactor(); i.yawLead = this.yawLead; i.turnInPlace = this.turnW;
    i.startT = this.startT; i.stopT = this.stopT;
    i.off = busy ? 1 : Math.max(this.actionW, this.jumpW, ease(this.vaultU));
    i.armsBusy = this.keyed || /^(phone|talk|eat)/.test(this.idleName) ? 1 : Math.max(this.armLoad[0] < 1 ? 1 - this.armLoad[0] : 0, this.armLoad[1] < 1 ? 1 - this.armLoad[1] : 0);
    i.cheap = this.cheap;
    applyBodyLayers(p, i, this.bls);
  }

  /**
   * A body that is alive on top of the clips: breathing in the chest, the weight easing from one foot to the other while standing, and a head that
   * looks (the head turns most, the shoulders a little, the eyes' work is left to the face). Small, slow, and different for each person
   * (the phase comes from the gait's seed), so a standing crowd is not in step.
   */
  private alive(p: Float32Array, dt: number, inp: AnimInput): void {
    this.aliveT += dt;
    const t = this.aliveT, ph = this.gait.phase * 6.283;
    const breathe = Math.sin(t * 2 * Math.PI * (0.24 + 0.05 * this.gait.sway) + ph);
    const tc = boneChannel('torso'), hc = boneChannel('head');
    p[tc] += 0.011 * breathe; p[hc] -= 0.006 * breathe;
    p[boneChannel('armL') + 2] += 0.008 * breathe; p[boneChannel('armR') + 2] -= 0.008 * breathe;
    // (the weight shift while standing is the POSE seat's now: bodyLayers.ts)
    // look: yaw/pitch toward a target, eased (a critically damped follow, no snap); head 65 %, upper body 20 % of the turn
    const L = inp.look, ty = L ? Math.max(-1.3, Math.min(1.3, L.yaw)) : 0, tp = L ? Math.max(-0.5, Math.min(0.5, L.pitch ?? 0)) : 0;
    const k = Math.min(1, dt * (L ? 7 : 4));
    this.lookYaw += (ty - this.lookYaw) * k; this.lookPitch += (tp - this.lookPitch) * k;
    p[hc + 1] += 0.65 * this.lookYaw; p[tc + 1] += 0.2 * this.lookYaw; p[hc] -= 0.6 * this.lookPitch;
  }
}
