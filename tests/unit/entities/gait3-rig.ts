/**
 * GAIT3: real built people for foot measurements. Heel and ball of each foot in world space, every frame, from two sources:
 *  - `lock*`: the foot model the foot lock uses (the ankle bone's frame plus FOOT.heel / FOOT.ball at FOOT.ankleH below it),
 *  - `mesh*`: the drawn shoe: the lowest vertices of the foot bones in the bind pose, found once in the ankle's frame and followed through the skin.
 */
import * as THREE from 'three';
// @ts-ignore the project's node typings lack readdirSync
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, buildMhPedModel } from '@/entities/models/pedMesh';
import { AnimController } from '@/entities/anim/controller';
import { makeGait } from '@/entities/anim/gait';
import { FOOT } from '@/entities/anim/footlock';
import { fullLib } from './anim-measure';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
export async function loadShapes(): Promise<void> {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n: string) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
}
export const SIX = ['ba-hoodie-fade', 'wh-office', 'ba-elder', 'la-hoodie-cap', 'ba-work', 'ea-kid'];
const ageBand = (a?: string): 'kid' | 'teen' | 'adult' | 'old' => (a === 'kid' ? 'kid' : a === 'teen' ? 'teen' : a === 'old' ? 'old' : 'adult');
export interface Person {
  id: string; m: NonNullable<ReturnType<typeof buildMhPedModel>>; ctl: AnimController; mesh: THREE.SkinnedMesh;
  /** foot-bone vertex indices per side and their positions in the ankle's local frame (bind pose) */
  footIdx: number[][]; heelL: THREE.Vector3[]; ballL: THREE.Vector3[]; soleY: number[];
}
export function buildPerson(id: string, lib = fullLib()): Person {
  const v = PED_SPECS.findIndex((s) => s.id === id), spec = PED_SPECS[v];
  const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!;
  const levels: THREE.SkinnedMesh[] = []; m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) levels.push(o as THREE.SkinnedMesh); });
  const mesh = levels[0], ctl = new AnimController(m, makeGait(v * 7 + 3, ageBand(spec.age)), lib);
  const p: Person = { id, m, ctl, mesh, footIdx: [[], []], heelL: [], ballL: [], soleY: [] };
  // bind pose: which vertices belong to each foot (dominant bone 12 = left ankle, 13 = right), in the ankle bone's own frame
  m.group.updateMatrixWorld(true); mesh.skeleton.update();
  const g = mesh.geometry, n = g.getAttribute('position').count, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), t = new THREE.Vector3();
  for (let i = 0; i < n; i++) { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } } if (best === 12 || best === 13) p.footIdx[best - 12].push(i); }
  for (let s = 0; s < 2; s++) {
    const inv = new THREE.Matrix4().copy(m.ankles![s].matrixWorld).invert(), loc: THREE.Vector3[] = [];
    for (const i of p.footIdx[s]) { mesh.getVertexPosition(i, t); loc.push(t.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inv)); }
    const ymin = Math.min(...loc.map((q) => q.y)); p.soleY.push(ymin);
    const sole = loc.filter((q) => q.y < ymin + 0.02), zs = sole.map((q) => q.z);
    p.heelL.push(sole.reduce((a, q) => (q.z > a.z ? q : a), sole[0]).clone());   // furthest back of the sole (forward is -z)
    const toeZ = Math.min(...loc.map((q) => q.z)), heelZ = Math.max(...zs);
    // the ball: the sole vertex nearest 0.7 of the way from heel to toe (the real ball of a foot is about 0.72 of its length from the heel)
    const target = heelZ + 0.72 * (toeZ - heelZ);
    p.ballL.push(sole.reduce((a, q) => (Math.abs(q.z - target) < Math.abs(a.z - target) ? q : a), sole[0]).clone());
  }
  return p;
}
export interface FootPts { lockHeel: THREE.Vector3[]; lockBall: THREE.Vector3[]; meshHeel: THREE.Vector3[]; meshBall: THREE.Vector3[]; ankle: THREE.Vector3[] }
const T = new THREE.Vector3();
/** world positions of the heel and ball of both feet right now (call after update) */
export function footPoints(p: Person): FootPts {
  const m = p.m; m.group.updateMatrixWorld(true);
  const R: FootPts = { lockHeel: [], lockBall: [], meshHeel: [], meshBall: [], ankle: [] };
  const gy = m.group.scale.y;
  for (let s = 0; s < 2; s++) {
    const a = m.ankles![s], mw = a.matrixWorld;
    R.ankle.push(T.setFromMatrixPosition(mw).clone());
    // the lock's model lives in the rig's units; the group scales the whole figure
    R.lockHeel.push(new THREE.Vector3(0, -FOOT.ankleH, FOOT.heel).applyMatrix4(mw));
    R.lockBall.push(new THREE.Vector3(0, -FOOT.ankleH, FOOT.ball).applyMatrix4(mw));
    void gy;
    // the drawn shoe: the same vertex in the ankle's frame, carried by the ankle bone (rigid in the foot; the skin weights are mostly the ankle's)
    R.meshHeel.push(p.heelL[s].clone().applyMatrix4(mw)); R.meshBall.push(p.ballL[s].clone().applyMatrix4(mw));
  }
  return R;
}

export interface Frame3 { v: number; pts: FootPts }
/** a run: the figure travels along -z at `speed(t)` (as the game's entities do), every frame recorded */
export function runFrames(p: Person, speed: (t: number) => number, seconds: number, dt = 1 / 60, setup?: (c: AnimController) => void): Frame3[] {
  const g = p.m.group, out: Frame3[] = []; let z = 0;
  g.position.set(0, 0, 0); g.rotation.y = 0; setup?.(p.ctl);
  for (let i = 0; i < Math.round(seconds / dt); i++) { const v = speed(i * dt); z -= v * dt; g.position.z = z; p.ctl.update(dt, { speed: v }); out.push({ v, pts: footPoints(p) }); }
  return out;
}
export interface Stance3 { side: number; i0: number; i1: number; slide: number; v: number }
/**
 * Planted = the point is within `h` of the ground and not rising (still or moving down); the stance ends when it leaves the ground or starts to rise.
 * Slide = how far the point travels over the ground (x, z) from the first planted frame to the last. Stances shorter than 3 frames are ignored.
 */
export function stances(fr: Frame3[], pick: (p: FootPts) => THREE.Vector3[], h = 0.015): Stance3[] {
  const out: Stance3[] = [];
  for (let side = 0; side < 2; side++) {
    let st = -1;
    const close = (e: number): void => { if (st >= 0 && e - st >= 3) { const a = pick(fr[st].pts)[side], b = pick(fr[e].pts)[side]; out.push({ side, i0: st, i1: e, slide: Math.hypot(b.x - a.x, b.z - a.z), v: fr[Math.round((st + e) / 2)].v }); } st = -1; };
    for (let i = 0; i < fr.length; i++) {
      const y = pick(fr[i].pts)[side].y, py = i ? pick(fr[i - 1].pts)[side].y : y, planted = y < h && y <= py + 0.0005;
      if (planted && st < 0) st = i; else if (!planted && st >= 0) close(i - 1);
    }
    if (st >= 0) st = -1;       // a stance cut off by the end of the run is dropped
  }
  return out.sort((a, b) => a.i0 - b.i0);
}
/** the reviewer's detection: a stance = the ANKLE within 3 cm of the lowest ankle height of the run (after the first 30 frames) */
export function reviewerStances(fr: Frame3[]): { st: Stance3[]; clearance: number } {
  const ank = (p: FootPts): THREE.Vector3[] => p.ankle;
  const thr = Math.min(...fr.slice(30).flatMap((f) => [f.pts.ankle[0].y, f.pts.ankle[1].y])) + 0.03, out: Stance3[] = [];
  for (let side = 0; side < 2; side++) {
    let st = -1; const close = (e: number): void => { if (st >= 0 && e - st >= 3) { const a = ank(fr[st].pts)[side], b = ank(fr[e].pts)[side]; out.push({ side, i0: st, i1: e, slide: Math.hypot(b.x - a.x, b.z - a.z), v: fr[Math.round((st + e) / 2)].v }); } st = -1; };
    for (let i = 0; i < fr.length; i++) { const low = fr[i].pts.ankle[side].y < thr; if (low && st < 0) st = i; else if (!low && st >= 0) close(i - 1); }
  }
  return { st: out, clearance: Math.max(...fr.slice(30).flatMap((f) => [f.pts.ankle[0].y, f.pts.ankle[1].y])) - (thr - 0.03) };
}
export const stat = (xs: number[]): { n: number; mean: number; max: number } => ({ n: xs.length, mean: xs.length ? +(100 * xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : NaN, max: xs.length ? +(100 * Math.max(...xs)).toFixed(1) : NaN });
