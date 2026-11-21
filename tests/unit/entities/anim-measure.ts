/**
 * ANIM2 measurement harness (no browser): plays a person through the AnimController at a fixed time step and measures what the eye
 * sees as bad motion. Foot slide, foot height at contact, the largest joint jump in one frame across each transition, time to settle,
 * idle repeat and cost. The same scenarios run before and after a change; numbers go in docs/swarm/tasks/ANIM2.md.
 */
import * as THREE from 'three';
import { decodePack, BONES } from '@/entities/anim/clipPack';
import { ClipLibrary } from '@/entities/anim/library';
import { readFileSync } from 'node:fs';
import { AnimController, type AnimInput, type PoseTarget } from '@/entities/anim/controller';
import { makeGait, PLAYER_GAIT, type Gait } from '@/entities/anim/gait';
import { SCENARIOS } from './anim-scenarios';

export const THIGH = 0.4, SHIN = 0.345, HIP_Y = 0.82, ANKLE_H = 0.075;
export const fullLib = (): ClipLibrary => { const l = ClipLibrary.fromCore(); l.add(decodePack(new Uint8Array(readFileSync('public/anim/street.bin')))); return l; };

export interface Rig { group: THREE.Group; target: PoseTarget; heel: THREE.Object3D[]; ball: THREE.Object3D[]; toe: THREE.Object3D[]; bones: THREE.Object3D[] }
/** a person with the reference proportions; `ankles` = whether the skeleton has ankle bones (the shoe then follows the foot) */
export function makeRig(ankles: boolean, extra?: (t: PoseTarget, root: THREE.Object3D) => void): Rig {
  const o = (): THREE.Object3D => new THREE.Object3D();
  const group = new THREE.Group();
  const t: PoseTarget = { hips: o(), torso: o(), head: o(), rig: o(), arms: [o(), o()], elbows: [o(), o()], legs: [o(), o()], knees: [o(), o()], group } as PoseTarget;
  t.legs[0].position.set(0.09, HIP_Y, 0); t.legs[1].position.set(-0.09, HIP_Y, 0);
  t.knees.forEach((k) => k.position.set(0, -THIGH, 0));
  t.torso.position.set(0, 0.84, 0); t.head.position.set(0, 1.67, 0);
  group.add(t.rig);
  t.rig.add(t.hips, t.torso, t.head, t.legs[0], t.legs[1]);
  t.legs.forEach((l, i) => l.add(t.knees[i]));
  t.arms.forEach((a, i) => { t.torso.add(a); a.position.set(i ? -0.18 : 0.18, 0.5, 0); a.add(t.elbows[i]); t.elbows[i].position.set(0, -0.3, 0); });
  const heel: THREE.Object3D[] = [], ball: THREE.Object3D[] = [], toe: THREE.Object3D[] = [];
  if (ankles) t.ankles = [o(), o()];
  for (let i = 0; i < 2; i++) {
    let parent: THREE.Object3D = t.knees[i];
    if (ankles) { const a = t.ankles![i]; a.position.set(0, -SHIN, 0); t.knees[i].add(a); parent = a; }
    const base = ankles ? 0 : -SHIN;                      // without an ankle bone the shoe is fixed on the shin
    for (const [arr, z] of [[heel, 0.07], [ball, -0.12], [toe, -0.2]] as const) { const m = o(); m.position.set(0, base - ANKLE_H, z); parent.add(m); arr.push(m); }
  }
  extra?.(t, group);
  const bones = [t.hips, t.torso, t.head, t.arms[0], t.elbows[0], t.arms[1], t.elbows[1], t.legs[0], t.knees[0], t.legs[1], t.knees[1], t.ankles?.[0] ?? o(), t.ankles?.[1] ?? o()];
  return { group, target: t, heel, ball, toe, bones };
}

export interface Frame { t: number; z: number; ball: THREE.Vector3[]; heel: THREE.Vector3[]; toe: THREE.Vector3[]; q: THREE.Quaternion[]; rigY: number }
export interface Sample { frames: Frame[]; dt: number }

/** Plays `input(t)` through a controller for `seconds`; the entity travels along -z at the commanded speed (as the game's entities do). */
export function play(opts: { seconds: number; dt?: number; speed: (t: number) => number; extra?: (t: number) => Partial<AnimInput>; ankles?: boolean; gait?: Gait; lib?: ClipLibrary; setup?: (c: AnimController, rig: Rig) => void; onFrame?: (c: AnimController, t: number) => void; makeController?: (t: PoseTarget, g: Gait, l: ClipLibrary) => AnimController }): Sample {
  const dt = opts.dt ?? 1 / 60, lib = opts.lib ?? fullLib();
  const rig = makeRig(opts.ankles ?? true);
  const c = opts.makeController ? opts.makeController(rig.target, opts.gait ?? PLAYER_GAIT, lib) : new AnimController(rig.target, opts.gait ?? PLAYER_GAIT, lib);
  opts.setup?.(c, rig);
  const frames: Frame[] = [];
  let z = 0, x = 0, heading = 0;
  const n = Math.round(opts.seconds / dt);
  for (let i = 0; i < n; i++) {
    const t = i * dt, sp = opts.speed(t), ex = opts.extra?.(t) ?? {};
    heading += (ex.yawRate ?? 0) * dt;                                   // the entity turns and travels the way it faces
    x -= Math.sin(heading) * sp * dt; z -= Math.cos(heading) * sp * dt;
    rig.group.position.set(x, 0, z); rig.group.rotation.y = heading;
    c.update(dt, { speed: sp, ...ex });
    opts.onFrame?.(c, t);
    rig.group.updateMatrixWorld(true);
    const w = (arr: THREE.Object3D[]): THREE.Vector3[] => arr.map((m) => m.getWorldPosition(new THREE.Vector3()));
    frames.push({ t, z, ball: w(rig.ball), heel: w(rig.heel), toe: w(rig.toe), q: rig.bones.map((b) => b.quaternion.clone()), rigY: rig.target.rig.position.y });
  }
  return { frames, dt };
}

/** Foot slide: for each stance (ball of the foot within `h` of the ground) the horizontal distance the ball travels from touchdown to lift-off. Metres. */
export function footSlide(s: Sample, h = 0.03): { perStance: number[]; mean: number; max: number; stances: number; contactY: number[] } {
  const per: number[] = [], contactY: number[] = [];
  for (let side = 0; side < 2; side++) {
    let start = -1;
    // the foot's own stance level: its lowest ball height over the run (a foot that digs in or floats is judged by its own contact, so slide and float are separate numbers)
    let floor = 9; for (const f of s.frames) floor = Math.min(floor, f.ball[side].y);
    const close = (end: number): void => {
      if (start < 0 || end - start < 3) { start = -1; return; }
      const a = s.frames[start].ball[side], b = s.frames[end].ball[side];
      per.push(Math.hypot(b.x - a.x, b.z - a.z));
      let ymin = 9; for (let k = start; k <= end; k++) ymin = Math.min(ymin, s.frames[k].toe[side].y, s.frames[k].heel[side].y, s.frames[k].ball[side].y);
      contactY.push(ymin); start = -1;
    };
    for (let i = 0; i < s.frames.length; i++) {
      const low = s.frames[i].ball[side].y < floor + h;
      if (low && start < 0) start = i; else if (!low && start >= 0) close(i - 1);
    }
    start = -1;
  }
  const skip = 1; const use = per.slice(skip, per.length - 1);
  const m = use.length ? use.reduce((a, b) => a + b, 0) / use.length : NaN;
  return { perStance: use, mean: m, max: use.length ? Math.max(...use) : NaN, stances: use.length, contactY };
}

/** Lowest sole point over both feet, per frame: how far the body floats above or sinks into the ground. */
export function floatSink(s: Sample, from = 0): { mean: number; min: number; max: number } {
  let sum = 0, mn = 9, mx = -9, n = 0;
  for (let i = Math.round(from / s.dt); i < s.frames.length; i++) {
    const f = s.frames[i]; let low = 9;
    for (let k = 0; k < 2; k++) low = Math.min(low, f.heel[k].y, f.ball[k].y, f.toe[k].y);
    sum += low; mn = Math.min(mn, low); mx = Math.max(mx, low); n++;
  }
  return { mean: sum / n, min: mn, max: mx };
}

/** Largest rotation change of any bone in one frame (degrees) and which bone, between frame indices [a, b). */
export function maxJump(s: Sample, a = 1, b = s.frames.length): { deg: number; bone: string; at: number } {
  let best = { deg: 0, bone: '', at: 0 };
  for (let i = Math.max(1, a); i < Math.min(b, s.frames.length); i++) {
    for (let k = 0; k < s.frames[i].q.length; k++) {
      const d = (2 * Math.acos(Math.min(1, Math.abs(s.frames[i].q[k].dot(s.frames[i - 1].q[k])))) * 180) / Math.PI;
      if (d > best.deg) best = { deg: d, bone: BONES[k], at: i * s.dt };
    }
  }
  return best;
}

/** Whole-body angular speed per frame (sum over bones, degrees). */
export function motionTrace(s: Sample): number[] {
  const out: number[] = [0];
  for (let i = 1; i < s.frames.length; i++) {
    let sum = 0;
    for (let k = 0; k < s.frames[i].q.length; k++) sum += (2 * Math.acos(Math.min(1, Math.abs(s.frames[i].q[k].dot(s.frames[i - 1].q[k])))) * 180) / Math.PI;
    out.push(sum);
  }
  return out;
}

/** Seconds after `t0` until the windowed mean of the motion trace stays within `tol` of `target` (window = `win` seconds). */
export function settleTime(trace: number[], dt: number, t0: number, target: number, tol = 0.2, win = 0.5, upperOnly = false): number {
  const w = Math.round(win / dt), i0 = Math.round(t0 / dt);
  let lastBad = i0;
  for (let i = i0; i + w < trace.length; i++) {
    let m = 0; for (let k = 0; k < w; k++) m += trace[i + k]; m /= w;
    if ((upperOnly ? m - target : Math.abs(m - target)) > Math.max(tol * target, 0.15)) lastBad = i + w;
  }
  return (lastBad - i0) * dt;
}


export interface Report { [k: string]: number | string }
export function runAll(opts: { ankles?: boolean; makeController?: Parameters<typeof play>[0]['makeController']; lib?: ClipLibrary } = {}): Report {
  const R: Report = {};
  const base = { ankles: opts.ankles ?? true, makeController: opts.makeController, lib: opts.lib };
  // steady gaits: slide and float at walk, jog, sprint
  for (const [name, v] of [['walk', 1.4], ['jog', 2.8], ['sprint', 5.2]] as const) {
    const s = play({ ...base, seconds: 8, speed: () => v });
    const sl = footSlide({ frames: s.frames.slice(120), dt: s.dt });
    const fs = floatSink({ frames: s.frames.slice(120), dt: s.dt });
    R[`${name}.slide.mean_cm`] = +(sl.mean * 100).toFixed(1);
    R[`${name}.slide.max_cm`] = +(sl.max * 100).toFixed(1);
    R[`${name}.stances`] = sl.stances;
    R[`${name}.contactY.mean_cm`] = +((sl.contactY.reduce((a, b) => a + b, 0) / Math.max(1, sl.contactY.length)) * 100).toFixed(1);
    R[`${name}.lowest.mean_cm`] = +(fs.mean * 100).toFixed(1);
    R[`${name}.lowest.minmax_cm`] = `${(fs.min * 100).toFixed(1)}..${(fs.max * 100).toFixed(1)}`;
    R[`${name}.steadyJump_deg`] = +maxJump({ frames: s.frames.slice(120), dt: s.dt }).deg.toFixed(2);
  }
  // transitions: biggest jump in one frame
  const sc: Record<string, () => Sample> = {};
  for (const [k, v] of Object.entries(SCENARIOS)) {
    if (['walk', 'jog', 'sprint', 'idle'].includes(k)) continue;
    sc[k] = () => play({ ...base, seconds: v.seconds, speed: v.speed, extra: v.extra, onFrame: v.idleAt ? (c, t) => { if (Math.abs(t - v.idleAt![0]) < 1e-3) c.setIdle(v.idleAt![1]); } : undefined });
  }
  const worst: Array<[string, number]> = [];
  for (const [k, f] of Object.entries(sc)) {
    const s = f(); const j = maxJump(s);
    R[`jump.${k}_deg`] = +j.deg.toFixed(1); R[`jump.${k}_bone`] = j.bone;
    worst.push([k, j.deg]);
  }
  R['jump.worst_deg'] = +Math.max(...worst.map((w) => w[1])).toFixed(1);
  // settle: after a start (walk) and a stop (from walk), see motionTrace
  {
    const st = play({ ...base, seconds: 7, speed: (t) => (t < 1 ? 0 : 1.4) });
    const tr = motionTrace(st);
    const steady = tr.slice(300, 420).reduce((a, b) => a + b, 0) / 120;
    R['settle.start_walk_s'] = +settleTime(tr, st.dt, 1, steady, 0.25).toFixed(2);
    const sp = play({ ...base, seconds: 7, speed: (t) => (t < 2 ? 1.4 : 0) });
    const tp = motionTrace(sp);
    const still = tp.slice(360, 420).reduce((a, b) => a + b, 0) / 60;
    // stopped = the windowed motion stays under 1.6 x the standing idle's own motion
    R['settle.stop_walk_s'] = +settleTime(tp, sp.dt, 2, still, 0.6, 0.3, true).toFixed(2);
    R['settle.idle_motion_deg_per_frame'] = +still.toFixed(3);
  }
  // idle repeat: clip periods and how far apart a crowd of ten is at the same instant
  {
    const lib = opts.lib ?? fullLib();
    for (const n of ['idle', 'idle2', 'phone']) R[`idle.${n}_period_s`] = +(lib.get(n)?.duration ?? 0).toFixed(2);
    const poses: THREE.Quaternion[][] = [];
    for (let i = 0; i < 10; i++) {
      const s = play({ ...base, seconds: 3, speed: () => 0, gait: makeGait(i * 7 + 1, 'adult') });
      poses.push(s.frames[s.frames.length - 1].q);
    }
    let d = 0, n = 0;
    for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) { for (let k = 0; k < 13; k++) d += (2 * Math.acos(Math.min(1, Math.abs(poses[a][k].dot(poses[b][k])))) * 180) / Math.PI; n++; }
    R['idle.crowd_mean_pose_diff_deg_per_bone'] = +(d / n / 13).toFixed(2);
  }
  // cost: 100 people, 300 frames of walking, relative number (ms on this box)
  {
    const lib = opts.lib ?? fullLib();
    const people = Array.from({ length: 100 }, (_, i) => { const r = makeRig(opts.ankles ?? true); const c = opts.makeController ? opts.makeController(r.target, makeGait(i + 3), lib) : new AnimController(r.target, makeGait(i + 3), lib); return { r, c }; });
    for (const p of people) for (let f = 0; f < 20; f++) p.c.update(1 / 60, { speed: 1.4 });
    const t0 = performance.now();
    for (let f = 0; f < 200; f++) for (const p of people) p.c.update(1 / 60, { speed: 1.4 });
    R['cost.ms_per_100_people_per_frame'] = +((performance.now() - t0) / 200).toFixed(3);
  }
  return R;
}
