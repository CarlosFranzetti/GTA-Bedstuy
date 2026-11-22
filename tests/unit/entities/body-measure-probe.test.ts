// BODY seat probe: measures the built people against survey numbers. Writes a JSON table when BODY_OUT is set. Not an assertion test.
import { beforeAll, describe, it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, dressLod, shapeFor, type MhShape, type MhLod } from '@/entities/models/pedMesh';
import { PED_SPECS, registerSpec, type PedSpec } from '@/textures/painters/ped';
import { BODY_TYPES, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const OUT = process.env.BODY_OUT ?? '';
const shapes = new Map<string, MhShape>();
const base = PED_SPECS.find((s) => s.top.kind === 'tee' && s.bottom.kind === 'jeans') ?? PED_SPECS[0];

export interface Measure { [k: string]: number }
/** measure the bare body (dress false) of a spec, in metres, after the person's scale */
export function measure(spec: PedSpec, seed = 1): Measure {
  const m = buildMhPedModel(materials, new Rng(seed), { variant: registerSpec(spec) })!;
  const s = shapes.get(shapeFor(spec))!;
  const L = dressLod(s, spec, s.lods.hi, false);
  const gs = m.group.scale, hs = m.head.scale.x;
  const R = s.rig;
  const nv = L.position.length / 3;
  const P = (i: number): [number, number, number] => [L.position[i * 3] * gs.x, L.position[i * 3 + 1] * gs.y, L.position[i * 3 + 2] * gs.z];
  const wsum = (i: number, set: number[]) => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };
  const out: Measure = {};
  // joints after body type, scaled: use built bones
  m.group.updateMatrixWorld(true);
  const wp = (o: THREE.Object3D) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
  const sh = wp(m.arms[0]), el = wp(m.elbows[0]), hipJ = wp(m.legs[0]), kn = wp(m.knees[0]), an = wp(m.ankles[0]), shR = wp(m.arms[1]);
  const wrist = s.rig.wristL ? new THREE.Vector3(R.wristL[0] * gs.x, R.wristL[1] * gs.y, R.wristL[2] * gs.z) : null;
  void wrist;
  const lm = s.landmarks;
  // head: chin to crown after head scale (head bone scales about the head joint)
  const hj = R.head[1];
  const crown = (hj + (lm.crownY - hj) * hs) * gs.y, chin = (hj + (lm.chinY - hj) * hs) * gs.y;
  // stature = max y of the skin
  let ymax = 0; for (let i = 0; i < nv; i++) ymax = Math.max(ymax, P(i)[1]);
  const stature = Math.max(crown, ymax);
  out.stature = stature; out.headH = crown - chin; out.heads = stature / (crown - chin);
  out.shoulderY = sh.y; out.shoulderSpan = Math.abs(sh.x - shR.x); out.elbowY = el.y; out.hipJointY = hipJ.y; out.kneeY = kn.y; out.ankleY = an.y;
  const armW = [4, 5, 6, 7], torsoW = [1, 2], legW = [8, 9, 10, 11, 12, 13];
  // widths at heights
  const band = (y: number, h: number, pred: (i: number) => boolean) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < nv; i++) { const p = P(i); if (Math.abs(p[1] - y) > h || !pred(i)) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); } return { w: x1 - x0, d: z1 - z0, ok: x1 > x0 }; };
  const any = () => true;
  const bideltoid = band(sh.y - 0.03 * stature / 1.75, 0.03, any); out.bideltoid = bideltoid.w;
  const tOnly = (i: number) => wsum(i, [1, 2, 3]) > 0.5;
  const chestY = sh.y - 0.14 * stature / 1.75;
  const chest = band(chestY, 0.02, tOnly); out.chestW = chest.w; out.chestD = chest.d;
  const waistY = hipJ.y + 0.14 * stature / 1.75;
  const waist = band(waistY, 0.02, tOnly); out.waistW = waist.w; out.waistD = waist.d;
  const hipB = band(hipJ.y - 0.03, 0.02, any); out.hipW = hipB.w; out.hipD = hipB.d;
  // crotch: highest y where the two legs separate (x gap at centre)
  let crotch = 0; for (let i = 0; i < nv; i++) { const p = P(i); if (wsum(i, [8, 9, 10, 11]) > 0.5 && Math.abs(p[0]) < 0.02) crotch = Math.max(crotch, 0); }
  let cy = hipJ.y; for (let y = hipJ.y; y > an.y; y -= 0.005) { const b = band(y, 0.0075, (i) => Math.abs(P(i)[0]) < 0.03); if (!b.ok) { cy = y; break; } cy = y; }
  out.crotchY = cy;
  // arms: fingertip = lowest y of arm-weighted verts
  let tip = 9, tipz = 0, wristY = 0; for (let i = 0; i < nv; i++) { if (wsum(i, armW) > 0.5 && P(i)[0] < 0) { const p = P(i); if (p[1] < tip) { tip = p[1]; tipz = p[2]; } } }
  out.fingertipY = tip;
  out.armLen = Math.hypot(sh.x - el.x, sh.y - el.y, sh.z - el.z);   // shoulder joint to elbow
  void wristY; void tipz;
  out.wristY = R.wristL[1] * gs.y; out.handLen = out.wristY - tip; out.foreArm = Math.hypot(el.x - R.wristL[0] * gs.x, el.y - out.wristY, el.z - R.wristL[2] * gs.z);
  out.chinY = chin; out.crownY = crown; out.hipY = hipJ.y;
  // foot: z extent of leg-weighted verts below ankle
  let fz0 = 9, fz1 = -9, fx0 = 9, fx1 = -9; for (let i = 0; i < nv; i++) { const p = P(i); if (p[0] < 0 && p[1] < 0.05 * stature && wsum(i, [8, 9, 10, 11]) > 0.3) { fz0 = Math.min(fz0, p[2]); fz1 = Math.max(fz1, p[2]); fx0 = Math.min(fx0, p[0]); fx1 = Math.max(fx1, p[0]); } }
  out.footLen = fz1 - fz0; out.footW = fx1 - fx0;
  // neck: width at chin - 0.025
  const nk = band(chin - 0.03, 0.01, (i) => P(i)[1] < chin && wsum(i, [3, 2]) > 0.2); out.neckW = nk.w; out.neckD = nk.d;
  // thigh at crotch-0.06
  const th = band(cy - 0.08, 0.01, (i) => P(i)[0] < 0 && wsum(i, [8, 9]) > 0.5); out.thighW = th.w; out.thighD = th.d;
  const ca = band((kn.y + an.y) / 2 + 0.05, 0.01, (i) => P(i)[0] < 0); out.calfW = ca.w;
  // bicep
  const bi = band((sh.y + el.y) / 2, 0.01, (i) => P(i)[0] < 0 && wsum(i, armW) > 0.5); out.bicepW = bi.w; out.bicepD = bi.d;
  out.headW = 0; { const hb = band((crown + chin) / 2, 0.01, (i) => wsum(i, [3]) > 0.8); out.headW = hb.w; out.headD = hb.d; }
  return out;
}

const rows: Array<{ key: string; m: Measure }> = [];
describe('body measure probe', () => {
  beforeAll(async () => {
    const fs = await import('node:fs');
    clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      const sh = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      registerShape(sh); shapes.set(sh.name, sh);
    }
  });
  it('table', () => {
    const cases: Array<[string, Partial<PedSpec>]> = [];
    const ids = Object.keys(BODY_TYPES) as BodyTypeId[];
    for (const sex of ['m', 'f'] as const) for (const id of ids) cases.push([`adult-${sex}-${id}`, { sex, age: 'adult', body: id }]);
    for (const sex of ['m', 'f'] as const) cases.push([`old-${sex}-elder`, { sex, age: 'old', body: 'elder' }]);
    for (const sex of ['m', 'f'] as const) cases.push([`teen-${sex}-teen`, { sex, age: 'teen', body: 'teen' }]);
    for (const sex of ['m', 'f'] as const) cases.push([`kid-${sex}-kid`, { sex, age: 'kid', body: 'kid' }]);
    let n = 0;
    for (const [key, o] of cases) {
      const spec: PedSpec = { ...base, id: `probe-${key}-${n++}`, group: 'wh', role: 'civilian', build: o.age === 'kid' ? 'kid' : 'avg', ...o } as PedSpec;
      const ms: Measure[] = [];
      for (const seed of [1, 2, 3]) ms.push(measure(spec, seed));
      const avg: Measure = {}; for (const k of Object.keys(ms[0])) avg[k] = ms.reduce((a, b) => a + b[k], 0) / ms.length;
      rows.push({ key, m: avg });
    }
    if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
  }, 600000);
});
void ({} as MhLod);
