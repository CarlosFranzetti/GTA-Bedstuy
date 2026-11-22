// BODY seat (second shift): slice probe. Cuts the built bare body at survey landmark heights and takes the width and depth of the hull of the
// torso (or one leg) in the slab, as ratios of that person's stature. Not an assertion test; writes JSON when BODY_OUT is set.
import { beforeAll, describe, it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, dressLod, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS, registerSpec, type PedSpec } from '@/textures/painters/ped';
import { BODY_TYPES, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const OUT = process.env.BODY_OUT ?? '';
const TYPES = (process.env.BODY_TYPES ?? 'avg,slim,athletic,heavy,tall-thin,short-stocky,broad,pear,petite,lanky,stout,big-tall,swimmer,pregnant,elder,elder-heavy,teen,kid').split(',') as BodyTypeId[];
const shapes = new Map<string, MhShape>();
const base = PED_SPECS.find((s) => s.top.kind === 'tee' && s.bottom.kind === 'jeans') ?? PED_SPECS[0];
const ell = (w: number, d: number): number => { const a = w / 2, b = d / 2, h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); };

export function slices(spec: PedSpec, seed: number): Record<string, number> {
  const m = buildMhPedModel(materials, new Rng(seed), { variant: registerSpec(spec) })!;
  const s = shapes.get(shapeFor(spec))!;
  const L = dressLod(s, spec, s.lods.hi, false), gs = m.group.scale, nv = L.position.length / 3;
  const P = (i: number): [number, number, number] => [L.position[i * 3] * gs.x, L.position[i * 3 + 1] * gs.y, L.position[i * 3 + 2] * gs.z];
  const wsum = (i: number, set: number[]): number => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };
  const hj = s.rig.head[1], hs = m.head.scale.x;
  let H = (hj + (s.landmarks.crownY - hj) * hs) * gs.y; for (let i = 0; i < nv; i++) H = Math.max(H, P(i)[1]);
  const arms = [4, 5, 6, 7], legs = [8, 9, 10, 11, 12, 13];
  const slab = (yr: number, pred: (i: number) => boolean, _half: number) => {
    // exact: intersect every triangle edge whose two ends pass the predicate with the plane y = yr * H, take the hull's extent
    let x0 = 9, x1 = -9, z0 = 9, z1 = -9, ok = false; const y = yr * H;
    for (let t = 0; t < L.index.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = L.index[t + k], b = L.index[t + (k + 1) % 3]; if (!pred(a) || !pred(b)) continue;
      const pa = P(a), pb = P(b); if ((pa[1] - y) * (pb[1] - y) > 0 || pa[1] === pb[1]) continue;
      const u = (y - pa[1]) / (pb[1] - pa[1]), x = pa[0] + (pb[0] - pa[0]) * u, z = pa[2] + (pb[2] - pa[2]) * u;
      ok = true; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    return { w: ok ? (x1 - x0) / H : 0, d: ok ? (z1 - z0) / H : 0, zf: z0 / H, zb: z1 / H };
  };
  const trunk = (i: number): boolean => wsum(i, arms) < 0.35 && wsum(i, legs) < 0.5 && Math.abs(P(i)[0]) < 0.3;
  const out: Record<string, number> = { H };
  const put = (k: string, r: { w: number; d: number; zf: number; zb: number }, mult = 1): void => { out[k + 'W'] = r.w; out[k + 'D'] = r.d; out[k + 'G'] = ell(r.w, r.d) * mult; out[k + 'Zf'] = r.zf; out[k + 'Zb'] = r.zb; };
  // shoulder: bideltoid at the arm joint height, everything (arms included)
  const sh = (() => { m.group.updateMatrixWorld(true); const v = new THREE.Vector3(); m.arms[0].getWorldPosition(v); return v.y / H; })();
  const bd = slab(sh - 0.012, () => true, 0.012); out.bideltoid = bd.w;
  put('chest', slab(0.735, trunk, 0.012));
  put('waist', slab(0.602, trunk, 0.012));
  put('hip', slab(0.50, (i) => wsum(i, arms) < 0.35, 0.012));       // buttock: widest, legs included
  { const cy = (s.landmarks.chinY * gs.y - 0.012 * H / 1.78) / H; put('neck', slab(cy, (i) => Math.abs(P(i)[0]) < 0.075 * H / 1.78 && wsum(i, [3]) < 0.5 && P(i)[1] < s.landmarks.chinY * gs.y, 0.008)); }
  put('thigh', slab(0.44, (i) => P(i)[0] < 0 && wsum(i, legs) > 0.5, 0.01), 1);
  put('calf', slab(0.17, (i) => P(i)[0] < 0 && wsum(i, legs) > 0.5, 0.01), 1);
  put('biceps', slab(0.72, (i) => P(i)[0] < 0 && wsum(i, arms) > 0.5, 0.01), 1);
  put('forearm', slab(0.56, (i) => P(i)[0] < 0 && wsum(i, arms) > 0.5, 0.01), 1);
  out.shoulderY = sh;
  if (process.env.BODY_PROFILE) { const rowsP: string[] = []; for (let y = 0.04; y < 0.9; y += 0.03) { const lg = slab(y, (i) => P(i)[0] < 0 && wsum(i, legs) > 0.5, 0), ar = slab(y, (i) => P(i)[0] < 0 && wsum(i, arms) > 0.5, 0), tr = slab(y, trunk, 0); rowsP.push(`y=${y.toFixed(2)} leg ${lg.w.toFixed(3)}x${lg.d.toFixed(3)} arm ${ar.w.toFixed(3)}x${ar.d.toFixed(3)} trunk ${tr.w.toFixed(3)}x${tr.d.toFixed(3)} zf ${tr.zf.toFixed(3)} zb ${tr.zb.toFixed(3)}`); } writeFileSync(process.env.BODY_PROFILE + "." + spec.sex + "." + spec.body + ".txt", rowsP.join("\n")); }
  return out;
}
const rows: Array<{ key: string; m: Record<string, number> }> = [];
describe('body slice probe', () => {
  beforeAll(async () => {
    const fs = await import('node:fs'); clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) { const b = fs.readFileSync(new URL(f, DIR)); const sh = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(sh); shapes.set(sh.name, sh); }
  });
  it('table', () => {
    let n = 0;
    for (const sex of ['m', 'f'] as const) for (const id of TYPES) {
      const age = id === 'elder' || id === 'elder-heavy' ? 'old' : id === 'teen' ? 'teen' : id === 'kid' ? 'kid' : 'adult';
      const spec = { ...base, ...(process.env.BODY_BOTTOM === 'shorts' ? { bottom: { ...base.bottom, kind: 'shorts' } } : {}), id: `sp-${sex}-${id}-${n++}`, group: 'wh', role: 'civilian', build: age === 'kid' ? 'kid' : 'avg', sex, age, body: id } as PedSpec;
      const ms = [1, 2, 3, 4, 5, 6].map((sd) => slices(spec, sd)), avg: Record<string, number> = {};
      for (const k of Object.keys(ms[0])) avg[k] = ms.reduce((a, b) => a + b[k], 0) / ms.length;
      rows.push({ key: `${sex}-${id}`, m: avg });
    }
    if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
  }, 900000);
});
