/**
 * REVIEW (body team): measures every built person and writes a table. No assertions on the numbers (this is the team's ruler, not a gate):
 * it only asserts that every figure was measured. Output: $BODY_REVIEW_OUT (a directory; default the review scratch folder), files
 * `<tag>-people.md`, `<tag>-people.json`, `<tag>-gait.json` where tag = $BODY_REVIEW_TAG (default "now").
 *   BODY_REVIEW_TAG=before npx vitest run tests/unit/entities/body-review-measure.test.ts --maxWorkers=1
 * Standing = the pose the game gives a pedestrian waiting (AnimController idle, then Pedestrian.reactionPose's arm splay).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
// @ts-ignore the project's node typings lack mkdirSync
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { pickPedVariant } from '@/entities/models/pedBody';
import { pickWardrobeVariant } from '@/textures/painters/pedWardrobe';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, topHemY, buildMhPedModel, type MhShape, type MhLod } from '@/entities/models/pedMesh';
import { bodyTypeId } from '@/entities/models/pedBodyTypes';
import { notArm } from '@/entities/models/pedCuts';
import { AnimController } from '@/entities/anim/controller';
import { makeGait } from '@/entities/anim/gait';
import { fullLib } from './anim-measure';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const OUT = process.env.BODY_REVIEW_OUT ?? '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/measure';
const TAG = process.env.BODY_REVIEW_TAG ?? 'now';
const shapes = new Map<string, MhShape>();
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
});

const TYPE_ORDER = ['slim', 'athletic', 'heavy', 'tall-thin', 'short-stocky', 'broad', 'pear', 'petite', 'elder', 'teen', 'avg', 'kid'];
function line12(): string[] {
  const by: Record<string, string[]> = {};
  for (const sp of PED_SPECS) if (sp.role === 'civilian') (by[bodyTypeId(sp)] ??= []).push(sp.id);
  return TYPE_ORDER.map((t, i) => (by[t] ?? [])[i % 2] ?? (by[t] ?? [])[0]).filter(Boolean);
}
const deg = (r: number): number => (r * 180) / Math.PI;
const ageBand = (a?: string): 'kid' | 'teen' | 'adult' | 'old' => (a === 'kid' ? 'kid' : a === 'teen' ? 'teen' : a === 'old' ? 'old' : 'adult');
const r1 = (x: number): number => Math.round(x * 10) / 10, r2 = (x: number): number => Math.round(x * 100) / 100, r3 = (x: number): number => Math.round(x * 1000) / 1000;
const W = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());

interface Posed { lodTris: number[]; m: ReturnType<typeof buildMhPedModel> & object; mesh: THREE.SkinnedMesh; ctl: AnimController; shape: MhShape; id: string }
function build(id: string, lib: ReturnType<typeof fullLib>): Posed {
  const v = PED_SPECS.findIndex((s) => s.id === id), spec = PED_SPECS[v];
  const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!;
  const levels: THREE.SkinnedMesh[] = []; m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) levels.push(o as THREE.SkinnedMesh); });
  const ctl = new AnimController(m, makeGait(v * 7 + 3, ageBand(spec.age)), lib);
  return { lodTris: levels.map((l) => (l.geometry.getIndex()?.count ?? 0) / 3), m, mesh: levels[0], ctl, shape: shapes.get(shapeFor(spec))!, id };
}
const splay = (p: Posed): void => { const sp = (p.m.group.userData.splay as number) ?? 0; p.m.arms[0].rotation.z = -sp; p.m.arms[1].rotation.z = sp; };
/** world positions of every vertex of the close-level skin in the current pose, with each vertex's dominant bone */
function skinVerts(p: Posed): { pos: THREE.Vector3[]; bone: number[] } {
  p.m.group.updateMatrixWorld(true); p.mesh.skeleton.update();
  const g = p.mesh.geometry, n = g.getAttribute('position').count, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
  const pos: THREE.Vector3[] = [], bone: number[] = [], t = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.mesh.getVertexPosition(i, t); pos.push(t.clone().applyMatrix4(p.mesh.matrixWorld));
    let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    bone.push(best);
  }
  return { pos, bone };
}
const ext = (vs: THREE.Vector3[], pick: (v: THREE.Vector3) => number): [number, number] => { let lo = 9, hi = -9; for (const v of vs) { const x = pick(v); lo = Math.min(lo, x); hi = Math.max(hi, x); } return [lo, hi]; };
const ARM_B = [4, 5, 6, 7], HAND_B = [5, 7], FOOT_B = [12, 13];

function armAngles(p: Posed): { total: number; out: number; fwd: number; elbow: number } {
  const res = { total: 0, out: 0, fwd: 0, elbow: 0 }; const body = p.m.group;
  const sh = [W(p.m.arms[0]), W(p.m.arms[1])], el = [W(p.m.elbows[0]), W(p.m.elbows[1])];
  const { pos, bone } = skinVerts(p);
  for (let s = 0; s < 2; s++) {
    const d = el[s].clone().sub(sh[s]), L = d.length(), side = Math.sign(sh[s].x - body.position.x) || 1;
    res.total += deg(Math.acos(Math.min(1, Math.max(-1, -d.y / L)))) / 2;
    res.out += deg(Math.atan2(d.x * side, -d.y)) / 2;
    res.fwd += deg(Math.atan2(-d.z, -d.y)) / 2;                        // model faces -z: forward is -z
    const hand = pos.filter((_, i) => bone[i] === HAND_B[s] || (bone[i] === HAND_B[1 - s] && false));
    let tip = el[s], far = -1; for (const v of hand) { const dd = v.distanceTo(el[s]); if (dd > far && Math.sign(v.x - body.position.x) === side) { far = dd; tip = v; } }
    const f = tip.clone().sub(el[s]);
    res.elbow += deg(d.angleTo(f)) / 2;
  }
  return res;
}

function measure(p: Posed): Record<string, number | string> {
  const { m, shape: sh } = p, spec = m.spec, lm = sh.landmarks, gs = m.group.scale.y, hs = m.head.scale.y, R: Record<string, number | string> = {};
  m.group.updateMatrixWorld(true);
  // rest pose (bind): the proportions of the body as built
  const hy = W(m.head).y, chin = hy + (lm.chinY - sh.rig.head[1]) * hs * gs, crown = hy + (lm.crownY - sh.rig.head[1]) * hs * gs, headLen = crown - chin, stature = crown;
  const bind = skinVerts(p);
  const wristY = lm.wristY * gs;
  const handBind = bind.pos.filter((_, i) => HAND_B.includes(bind.bone[i]));
  const handTipY = Math.min(...handBind.map((v) => v.y));
  const armsB = armAngles(p);
  // stand
  p.ctl.setIdle(null, false); for (let k = 0; k < 60; k++) p.ctl.update(1 / 30, { speed: 0 });
  const clipOnly = armAngles(p); splay(p);
  const game = armAngles(p);
  const { pos, bone } = skinVerts(p), hip = (W(m.legs[0]).y + W(m.legs[1]).y) / 2, knee = (W(m.knees[0]).y + W(m.knees[1]).y) / 2, shY = (W(m.arms[0]).y + W(m.arms[1]).y) / 2;
  const [ylo, yhi] = ext(pos, (v) => v.y);
  const headV = pos.filter((v, i) => bone[i] === 3 && v.y > chin + 0.01 && v.y < crown - 0.02);
  const [hx0, hx1] = ext(headV, (v) => v.x), headW = hx1 - hx0;
  const shV = pos.filter((v) => Math.abs(v.y - shY) < 0.05), [sx0, sx1] = ext(shV, (v) => v.x);
  const hipV = pos.filter((v, i) => Math.abs(v.y - (hip + 0.02)) < 0.04 && !ARM_B.includes(bone[i])), [px0, px1] = ext(hipV, (v) => v.x);
  const handV = pos.filter((_, i) => HAND_B.includes(bone[i])), tipY = Math.min(...handV.map((v) => v.y));
  const footV = pos.filter((_, i) => FOOT_B.includes(bone[i])), [fz0, fz1] = ext(footV, (v) => v.z), [, fy1] = ext(footV, (v) => v.y);
  const sho = Math.abs(W(m.arms[0]).x - W(m.arms[1]).x);
  Object.assign(R, {
    id: spec.id, type: bodyTypeId(spec), sex: spec.sex ?? '', age: spec.age ?? 'adult', top: spec.top.kind + (spec.top.long ? '+long' : ''),
    stature_m: r2(stature), meshHeight_m: r2(yhi - ylo), heads: r1(stature / headLen), headLen_cm: r1(headLen * 100), headW_cm: r1(headW * 100),
    shoulderMesh_cm: r1((sx1 - sx0) * 100), shoulderJoint_cm: r1(sho * 100), shoulder_over_headW: r2((sx1 - sx0) / headW), shoulder_over_headLen: r2((sx1 - sx0) / headLen),
    hipW_cm: r1((px1 - px0) * 100), hip_over_shoulder: r2((px1 - px0) / (sx1 - sx0)),
    hipJointY_over_H: r3(hip / stature), kneeY_over_H: r3(knee / stature), neck_chin_to_shoulder_cm: r1((chin - shY) * 100),
    fingertipY_over_H: r3(tipY / stature), fingertip_down_thigh: r2((hip - tipY) / (hip - knee)),
    armLen_over_H: r3(Math.max(...handV.map((v) => v.distanceTo(W(m.arms[v.x < (W(m.arms[0]).x + W(m.arms[1]).x) / 2 ? 0 : 1])))) / stature),
    handLen_cm: r1((wristY - handTipY) * 100), handLen_over_H: r3((wristY - handTipY) / stature), footLen_cm: r1((fz1 - fz0) * 100), footLen_over_H: r3((fz1 - fz0) / stature), footTop_cm: r1(fy1 * 100),
    armAngleBind_deg: r1(armsB.total), armAngleStandClip_deg: r1(clipOnly.total), armAngleStandGame_deg: r1(game.total), armOutStandGame_deg: r1(game.out), armFwdStandGame_deg: r1(game.fwd),
    elbowBendStandGame_deg: r1(game.elbow), splay_deg: r1(deg((m.group.userData.splay as number) ?? 0)),
  });
  // widths and depths as a share of stature, at the survey's landmark heights (arm-weighted vertices left out; skin and cloth as drawn). Real (ANSUR, P50 men / women):
  // bideltoid .290/.276, chest breadth .165, chest depth .145/.151, waist breadth .186/.183, waist depth .134/.128, hip breadth .196/.217, buttock depth .140/.142, head breadth .088/.091
  {
    const band = (y: number): { w: number; d: number } => { const vs = pos.filter((v, i) => Math.abs(v.y - y) < 0.015 && !ARM_B.includes(bone[i])); if (!vs.length) return { w: NaN, d: NaN }; const [a, b] = ext(vs, (v) => v.x), [c, d] = ext(vs, (v) => v.z); return { w: b - a, d: d - c }; };
    const ch = band(0.735 * stature), wa = band(0.602 * stature), hp = band(0.512 * stature - 0.0), bt = band(0.49 * stature);
    Object.assign(R, { bideltoid_over_H: r3((sx1 - sx0) / stature), chestW_over_H: r3(ch.w / stature), chestD_over_H: r3(ch.d / stature), waistW_over_H: r3(wa.w / stature), waistD_over_H: r3(wa.d / stature), hipW_over_H: r3(Math.max(hp.w, bt.w) / stature), buttD_over_H: r3(Math.max(hp.d, bt.d) / stature), headW_over_H: r3(headW / stature) });
  }
  // knee bend at rest
  { let kb = 0; for (let s = 0; s < 2; s++) { const a = W(m.legs[s]), k = W(m.knees[s]), an = W(m.ankles![s]); kb += deg(k.clone().sub(a).angleTo(an.clone().sub(k))) / 2; } R.kneeBendStand_deg = r1(kb); }
  // walking: arm angles over one stride
  { const lib = (p.ctl as unknown as { lib: unknown }).lib; void lib; let tot = 0, out = 0, fwd = 0, mx = 0, n = 0, elb = 0, outMax = -99;
    for (let k = 0; k < 90; k++) { p.ctl.update(1 / 30, { speed: 1.4 }); if (k >= 30) { splay(p); const a = armAngles(p); tot += a.total; out += a.out; fwd += Math.abs(a.fwd); mx = Math.max(mx, a.total); outMax = Math.max(outMax, a.out); elb += a.elbow; n++; } }
    R.armAngleWalkMean_deg = r1(tot / n); R.armOutWalkMean_deg = r1(out / n); R.armOutWalkMax_deg = r1(outMax); R.armFwdWalkAbs_deg = r1(fwd / n); R.elbowBendWalk_deg = r1(elb / n); }
  // garment thickness: dressed against undressed close level, rest pose, slices on the torso (arms excluded)
  {
    const D = dressLod(sh, spec, sh.lods.hi, true), U = dressLod(sh, spec, sh.lods.hi, false), hem = topHemY(sh, spec);
    const slice = (L: MhLod, y: number): [number, number] => { const use = notArm(L); let x0 = 9, x1 = -9, z0 = 9, z1 = -9; for (let i = 0; i < L.position.length / 3; i++) { if (Math.abs(L.position[i * 3 + 1] - y) > 0.012 || !use(i)) continue; x0 = Math.min(x0, L.position[i * 3]); x1 = Math.max(x1, L.position[i * 3]); z0 = Math.min(z0, L.position[i * 3 + 2]); z1 = Math.max(z1, L.position[i * 3 + 2]); } return [x1 - x0, z1 - z0]; };
    const H = sh.height, ys: Array<[string, number]> = [['chest', H * 0.72], ['waist', H * 0.62], ['hem', hem - 0.01]];
    for (const [k, y] of ys) { const d = slice(D, y), u = slice(U, y); R[`cloth_${k}_side_cm`] = d[0] > 0 && u[0] > 0 ? r1(((d[0] - u[0]) / 2) * gs * 100) : 'na'; R[`cloth_${k}_front_cm`] = d[1] > 0 && u[1] > 0 ? r1(((d[1] - u[1]) / 2) * gs * 100) : 'na'; }
    R.hemY_over_H = r3(hem / H);
  }
  // mesh sanity at the close level: inverted triangles (face normal against the vertex normals) and zero-area ones
  {
    const g = p.mesh.geometry, idx = g.getIndex()!, P = g.getAttribute('position'), N = g.getAttribute('normal'); let inv = 0, zero = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) { const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2); a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2); fn.crossVectors(b.sub(a), c.sub(a.fromBufferAttribute(P, i0))); const area = fn.length(); if (area < 1e-10) { zero++; continue; } fn.divideScalar(area); vn.set(0, 0, 0); for (const i of [i0, i1, i2]) vn.x += N.getX(i), vn.y += N.getY(i), vn.z += N.getZ(i); if (fn.dot(vn.normalize()) < -0.2) inv++; }
    R.trisHi = p.lodTris[0]; R.trisMid = p.lodTris[1]; R.trisFar = p.lodTris[2]; R.trisPersonAllLevels = p.lodTris.reduce((a, b) => a + b, 0); R.trisInverted = inv; R.trisZeroArea = zero;
  }
  return R;
}

// ---------------------------------------------------------------- foot slide on a real body (the ankle bone, in stance)
function playerSpeed(target: (t: number) => number): (t: number) => number {
  let v = 0, last = 0; const cache = new Map<number, number>();
  return (t: number) => { const k = Math.round(t * 600); if (cache.has(k)) return cache.get(k)!; for (let tt = last; tt < t - 1e-9; tt += 1 / 60) { const want = target(tt), fr = Math.min(1, v / 6.5), a = want > v ? 9 + (4.6 - 9) * fr : 12 + (17 - 12) * fr; v += Math.sign(want - v) * Math.min(Math.abs(want - v), a * (1 / 60)); } last = t; cache.set(k, v); return v; };
}
function slideRun(p: Posed, speed: (t: number) => number, seconds: number): { clearance_cm: number; n: number; mean: number; max: number; byBand: Record<string, { n: number; mean: number; max: number }> } {
  const m = p.m, dt = 1 / 60; m.group.position.set(0, 0, 0); m.group.rotation.y = 0;
  const frames: Array<{ a: THREE.Vector3[]; v: number }> = []; let z = 0;
  const rest = Math.min(...[0, 1].map((s) => { m.group.updateMatrixWorld(true); return W(m.ankles![s]).y; }));
  for (let i = 0; i < seconds / dt; i++) { const v = speed(i * dt); z -= v * dt; m.group.position.z = z; p.ctl.update(dt, { speed: v }); m.group.updateMatrixWorld(true); frames.push({ a: [0, 1].map((s) => W(m.ankles![s])), v }); }
  void rest; const thr = Math.min(...frames.slice(30).flatMap((f) => [f.a[0].y, f.a[1].y])) + 0.03, rows: Array<{ s: number; v: number }> = [];
  for (let side = 0; side < 2; side++) { let st = -1; const close = (e: number): void => { if (st >= 0 && e - st >= 3) { const a = frames[st].a[side], b = frames[e].a[side]; rows.push({ s: Math.hypot(b.x - a.x, b.z - a.z), v: frames[Math.round((st + e) / 2)].v }); } st = -1; }; for (let i = 0; i < frames.length; i++) { const low = frames[i].a[side].y < thr; if (low && st < 0) st = i; else if (!low && st >= 0) close(i - 1); } }
  const use = rows.slice(2), stat = (r: typeof rows): { n: number; mean: number; max: number } => ({ n: r.length, mean: r.length ? r1((100 * r.reduce((q, x) => q + x.s, 0)) / r.length) : NaN, max: r.length ? r1(100 * Math.max(...r.map((x) => x.s))) : NaN });
  const bands: Array<[string, number, number]> = [['0-1.5', 0, 1.5], ['1.5-3', 1.5, 3], ['3-5', 3, 5], ['5+', 5, 9]];
  const lowY = thr - 0.03, clearance = Math.max(...frames.slice(30).flatMap((f) => [f.a[0].y, f.a[1].y])) - lowY;
  return { clearance_cm: r1(clearance * 100), ...stat(use), byBand: Object.fromEntries(bands.map(([n, lo, hi]) => [n, stat(use.filter((r) => r.v >= lo && r.v < hi))])) };
}

describe('body review: measurements', () => {
  it('measures the twelve line-up people', () => {
    const lib = fullLib(), ids = line12(), rows = ids.map((id) => measure(build(id, lib)));
    expect(rows.length).toBe(12);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${TAG}-people.json`, JSON.stringify(rows, null, 1));
    const keys = Object.keys(rows[0]);
    writeFileSync(`${OUT}/${TAG}-people.md`, ['| ' + keys.join(' | ') + ' |', '|' + keys.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + keys.map((k) => String(r[k])).join(' | ') + ' |')].join('\n') + '\n');
    // transposed too: a column per person is easier to read
    writeFileSync(`${OUT}/${TAG}-people-T.md`, ['| metric | ' + rows.map((r) => String(r.id).slice(0, 12)).join(' | ') + ' |', '|---|' + rows.map(() => '---').join('|') + '|', ...keys.slice(1).map((k) => '| ' + k + ' | ' + rows.map((r) => String(r[k])).join(' | ') + ' |')].join('\n') + '\n');
  }, 300000);

  it('aggregates proportions over the street mix (300 pedestrian draws as the game picks them)', () => {
    const lib = fullLib(), cache = new Map<string, Record<string, number | string>>(), draws: string[] = [];
    for (let i = 0; i < 300; i++) { const rng = new Rng(Rng.hash(`ped-1-${i}`)); draws.push(PED_SPECS[pickWardrobeVariant(rng, pickPedVariant(rng), false)].id); }
    for (const id of new Set(draws)) { const sp = PED_SPECS.find((q) => q.id === id)!; if (sp.role !== 'civilian') continue; cache.set(id, measure(build(id, lib))); }
    const rows = draws.map((d) => cache.get(d)).filter((r): r is Record<string, number | string> => !!r);
    const adults = rows.filter((r) => r.age === 'adult' || r.age === 'old'), res: Record<string, unknown> = { draws: rows.length, adults: adults.length, uniqueSpecs: cache.size };
    const q = (xs: number[], f: number): number => { const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
    for (const k of ['stature_m', 'heads', 'bideltoid_over_H', 'chestW_over_H', 'chestD_over_H', 'waistW_over_H', 'waistD_over_H', 'hipW_over_H', 'buttD_over_H', 'headW_over_H', 'fingertipY_over_H', 'footLen_over_H', 'handLen_over_H', 'elbowBendStandGame_deg', 'kneeBendStand_deg', 'armAngleStandGame_deg', 'armAngleWalkMean_deg', 'trisInverted']) {
      const xs = adults.map((r) => Number(r[k])).filter((x) => Number.isFinite(x)); res[k] = { p5: r3(q(xs, 0.05)), p50: r3(q(xs, 0.5)), p95: r3(q(xs, 0.95)), mean: r3(xs.reduce((a, b) => a + b, 0) / xs.length) };
    }
    const men = adults.filter((r) => r.sex === 'm').map((r) => Number(r.stature_m)), wom = adults.filter((r) => r.sex === 'f').map((r) => Number(r.stature_m));
    res.statureMen = { n: men.length, p5: r2(q(men, 0.05)), p50: r2(q(men, 0.5)), p95: r2(q(men, 0.95)), max: r2(Math.max(...men)) };
    res.statureWomen = { n: wom.length, p5: r2(q(wom, 0.05)), p50: r2(q(wom, 0.5)), p95: r2(q(wom, 0.95)), max: r2(Math.max(...wom)) };
    const bt: Record<string, number> = {}; for (const r of rows) bt[String(r.type)] = (bt[String(r.type)] ?? 0) + 1; res.bodyTypeCounts = bt;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${TAG}-aggregate.json`, JSON.stringify(res, null, 1));
    expect(rows.length).toBeGreaterThan(100);
  }, 600000);

  it('foot slide on real bodies, steady and through speed changes', () => {
    const lib = fullLib(), res: Record<string, unknown> = {};
    for (const id of ['ba-hoodie-fade', 'wh-office', 'ba-elder']) {
      const r: Record<string, unknown> = {};
      for (const [n, v] of [['walk1.4', 1.4], ['jog3', 3.0], ['sprint6.5', 6.5]] as const) r[`steady.${n}`] = slideRun(build(id, lib), () => v, 8);
      r['accel.startJog'] = slideRun(build(id, lib), playerSpeed((t) => (t < 0.5 ? 0 : 3.0)), 6);
      r['accel.startSprint'] = slideRun(build(id, lib), playerSpeed((t) => (t < 0.5 ? 0 : t < 1.0 ? 3.0 : 6.5)), 8);
      r['accel.sprintToStop'] = slideRun(build(id, lib), playerSpeed((t) => (t < 3 ? 6.5 : 0)), 7);
      res[id] = r;
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${TAG}-gait.json`, JSON.stringify(res, null, 1));
    expect(Object.keys(res).length).toBe(3);
  }, 600000);
});
