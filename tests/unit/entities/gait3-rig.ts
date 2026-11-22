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
