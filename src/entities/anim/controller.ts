/**
 * Drives one character's bones from the captured clips: speed-blended locomotion (idle, walk style, jog, run), street idles,
 * turn in place, one-shots (stop, start, stumble, sit down, stand up) and the jump. Everything is cross-faded; nothing snaps.
 * It only writes rotations and rig.position of the existing bones (rig, hips, torso, head, arms, elbows, legs, knees and,
 * where a body has them, ankles). Heading and travel belong to the entity.
 */
import * as THREE from 'three';
import { BONES, NCH, RIG_CH, boneChannel, mirrorPose, sampleClip, type Clip } from './clipPack';
import { chainBlend, cycleFrequency, idleWeight, jumpTime, rateFor, smooth, type Blend } from './locomotion';
import type { Gait } from './gait';
import { clipLibrary, type ClipLibrary } from './library';

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
}

interface OneShot { amp: number; clip: Clip; t: number; end: number; rate: number; mirror: boolean; fadeIn: number; fadeOut: number }

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
  }

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
    this.shot = { amp: o.amp ?? 1, clip, t: (o.from ?? 0) * clip.duration, end: (o.to ?? 1) * clip.duration, rate: o.rate ?? 1, mirror: o.mirror ?? false, fadeIn: o.fadeIn ?? 0.12, fadeOut: o.fadeOut ?? 0.2 };
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
    const speed = Math.max(0, inp.speed) / this.legScale; // in the clips' proportions
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
      this.phase = (this.phase + cycleFrequency(speed, chain, b, g.cadence) * dt) % 1;
      sampleClip(chain[b.lo], this.phase * chain[b.lo].duration, this.loco);
      if (b.hi !== b.lo) { sampleClip(chain[b.hi], this.phase * chain[b.hi].duration, this.tmp); for (let k = 0; k < NCH; k++) this.loco[k] += (this.tmp[k] - this.loco[k]) * b.t; }
      this.lastRatio = rateFor(speed, chain[b.t > 0.5 ? b.hi : b.lo]);
      this.applyGait(this.loco, speed);
      for (let k = 0; k < NCH; k++) this.base[k] += (this.loco[k] - this.base[k]) * (1 - iw);
    }

    // start / stop, detected from the speed history (entities ramp speed over several frames, so look back a little)
    this.recentMax = Math.max(speed, this.recentMax - 2.5 * dt);
    this.sinceStill = speed < 0.3 ? 0 : this.sinceStill + dt;
    if (!this.shot && !(inp.jump && inp.jump.phase !== 'ground')) {
      if (speed < 0.35 && this.recentMax > 1.2) {
        this.playOnce(this.recentMax > 2.6 ? 'stopRun' : 'stopWalk', { from: this.recentMax > 2.6 ? 0.4 : 0.45, fadeIn: 0.1, fadeOut: 0.25 });
        this.recentMax = 0;
      } else if (speed > 2.0 && this.sinceStill < 0.4 && !this.startedRun) { this.playOnce('startRun', { to: 0.55, fadeIn: 0.05, fadeOut: 0.3 }); this.startedRun = true; }
    }
    if (speed < 0.3) this.startedRun = false;
    if (this.shot && speed > 0.9 && this.shot.clip.name.startsWith('stop')) this.cancelOnce(0.12);

    // turn in place
    const turn = this.lib.get('turn');
    const wantTurn = !!turn && speed < 0.5 && Math.abs(inp.yawRate ?? 0) > 0.9 && !this.shot;
    this.turnW += ((wantTurn ? 1 : 0) - this.turnW) * Math.min(1, dt * 9);
    if (turn && this.turnW > 0.01) {
      const yaw = inp.yawRate ?? 0;
      const rate = Math.min(2.5, Math.max(0.4, Math.abs(yaw) / (Math.abs(turn.turn) / turn.duration)));
      this.turnT += dt * rate;
      if (this.turnT > 0.92 * turn.duration) this.turnT = 0.08 * turn.duration;
      sampleClip(turn, Math.max(this.turnT, 0.08 * turn.duration), this.tmp);
      if ((yaw > 0) !== (turn.turn > 0)) mirrorPose(this.tmp);
      this.mix(this.base, this.tmp, this.turnW);
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
      const w = Math.min(1, s.t / Math.max(0.001, s.fadeIn), (s.end - s.t) / Math.max(0.001, s.fadeOut));
      if (s.t >= s.end) this.shot = null;
      else { sampleClip(s.clip, s.t, this.tmp2); if (s.mirror) mirrorPose(this.tmp2); this.mix(this.base, this.tmp2, Math.max(0, w) * s.amp); }
    }

    // jump
    const j = inp.jump;
    const jumpClip = this.lib.get('jump');
    const jumping = !!j && j.phase !== 'ground' && !!jumpClip;
    this.jumpW += ((jumping ? 1 : 0) - this.jumpW) * Math.min(1, dt * (jumping ? 30 : 12));
    if (jumpClip && j && this.jumpW > 0.01) {
      const ph = j.phase === 'ground' ? 'land' : j.phase;
      const airtime = (2 * Math.max(1, j.vy)) / JUMP_TIMES.gravity;
      const t = j.phase === 'ground' ? jumpClip.duration : jumpTime(jumpClip, ph, j.t, JUMP_TIMES.takeoff, ph === 'air' ? Math.max(airtime, j.t + Math.max(0.05, j.vy / JUMP_TIMES.gravity)) : airtime, JUMP_TIMES.land);
      sampleClip(jumpClip, t, this.tmp);
      this.mix(this.base, this.tmp, this.jumpW);
    }

    this.write(this.base, inp.yawRate ?? 0, speed);
    return true;
  }

  /** Per-person modifiers on the locomotion pose. */
  private applyGait(p: Float32Array, speed: number): void {
    const g = this.gait;
    const stride = g.stride * Math.pow(Math.min(1.6, Math.max(0.7, this.lastRatio)), 0.3) / Math.pow(g.cadence, 0.5);
    const hipL = boneChannel('legL'), hipR = boneChannel('legR');
    p[hipL] *= stride; p[hipR] *= stride;
    p[boneChannel('kneeL')] *= 1 + (stride - 1) * 0.5; p[boneChannel('kneeR')] *= 1 + (stride - 1) * 0.5;
    p[boneChannel('armL')] *= g.armSwing; p[boneChannel('armR')] *= g.armSwing;
    p[boneChannel('elbowL')] *= 0.6 + 0.4 * g.armSwing; p[boneChannel('elbowR')] *= 0.6 + 0.4 * g.armSwing;
    const walkiness = 1 - smooth(1.6, 3.0, speed); // posture quirks fade out when running
    const own = this.stoopBaked > 0.02 ? 0.3 : 1; // a stoop already baked into this body's rest pose is not added again
    // forward is negative x (a captured run leans to about -12 degrees), so a forward lean subtracts
    p[boneChannel('torso')] -= g.lean * walkiness * own;
    p[boneChannel('head')] -= (g.headDrop * walkiness - g.lean * 0.4 * walkiness) * own;
    p[RIG_CH] *= g.sway; p[RIG_CH + 2] *= g.sway; p[RIG_CH + 1] *= 0.8 + 0.2 * g.sway;
  }

  private mix(into: Float32Array, over: Float32Array, w: number): void { for (let k = 0; k < NCH; k++) into[k] += (over[k] - into[k]) * w; }

  /** Ankle height above its rest height for a pose, the lower of the two feet, for legs of the given proportions. */
  private lowFoot(p: Float32Array, thigh: number, shin: number): number {
    let low = 9;
    for (const [lc, kc] of [[boneChannel('legL'), boneChannel('kneeL')], [boneChannel('legR'), boneChannel('kneeR')]]) {
      this.qA.setFromEuler(this.eul.set(p[lc], p[lc + 1], p[lc + 2]));
      this.qB.setFromEuler(this.eul.set(p[kc], p[kc + 1], p[kc + 2])).premultiply(this.qA);
      const y = -thigh * (1 - 2 * (this.qA.x * this.qA.x + this.qA.z * this.qA.z)) - shin * (1 - 2 * (this.qB.x * this.qB.x + this.qB.z * this.qB.z));
      // y of the rotated (0, -len, 0) vectors: -len * (1 - 2(x^2 + z^2))
      low = Math.min(low, y + thigh + shin);
    }
    return low;
  }

  private write(p: Float32Array, yawRate: number, speed: number): void {
    // walking turns: the head and shoulders lead the body round a corner, the body leans into it
    const lead = Math.min(1, speed / 1.2) * Math.max(-3, Math.min(3, yawRate));
    this.yawLead += (lead - this.yawLead) * 0.2;
    p[boneChannel('head')] += 0; p[boneChannel('head') + 1] += this.yawLead * 0.13;
    p[boneChannel('torso') + 1] += this.yawLead * 0.07; p[boneChannel('torso') + 2] += -this.yawLead * 0.02 * Math.min(1.5, speed / 2);
    // feet on the ground for THIS body: lowest ankle at the height the capture says, in this body's proportions
    const ref = this.lowFoot(p, REF.thigh, REF.shin);
    const real = this.lowFoot(p, this.dims.thigh, this.dims.shin);
    const dyRef = p[RIG_CH + 1];
    p[RIG_CH + 1] = (dyRef + ref) * (this.fp / (REF.thigh + REF.shin)) - real;
    for (let b = 0; b < BONES.length; b++) {
      const o = this.bones[b];
      if (o) o.rotation.set(p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
    }
    const sc = this.fp / (REF.thigh + REF.shin);
    this.target.rig.position.set(p[RIG_CH] * sc, p[RIG_CH + 1], p[RIG_CH + 2] * sc);
    // the head rides on the torso (it is a child of the rig here): lean, duck and lie down take it along
    const th = boneChannel('torso');
    this.qA.setFromEuler(this.eul.set(p[th], p[th + 1], p[th + 2]));
    this.target.head.position.copy(this.headRel).applyQuaternion(this.qA).add(this.torsoRest);
  }
}
