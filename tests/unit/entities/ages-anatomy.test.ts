// AGES seat (body team round 2): measures what pedAges.ts claims. A child, a teenager and an elder of each sex against an adult of the same
// sex, on the hi level (hull of the bare body at landmark heights, as body-slice-probe does), plus the street mix of a seeded draw.
// AGES_OUT=<file>.json writes the table; `python3 -I` or `cat` it. Not a render: numbers only.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, dressLod, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { registerSpec, type PedSpec } from '@/textures/painters/ped';
import { composeSpec } from '@/textures/painters/pedWardrobe';
import { BODY_POOLS, bodyTypeId, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const OUT = process.env.AGES_OUT ?? '';
const shapes = new Map<string, MhShape>();
const ell = (w: number, d: number): number => { if (!(w > 0) || !(d > 0)) return 0;  const a = w / 2, b = d / 2, h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); };

export type Age = 'kid' | 'teen' | 'adult' | 'old';
const BODY_OF: Record<Age, BodyTypeId> = { kid: 'kid', teen: 'teen', adult: 'avg', old: 'elder' };
export function specFor(age: Age, sex: 'm' | 'f', seed: number, body?: BodyTypeId): PedSpec {
  const spec = composeSpec(seed * 31 + (sex === 'f' ? 5 : 0), { group: 'wh', sex, age }, { look: age === 'old' ? 'elder' : 'street', noOutfit: true });
  spec.body = body ?? BODY_OF[age]; spec.id = `ag-${age}-${sex}-${seed}`; spec.bottom = { ...spec.bottom, kind: 'shorts', cut: 'run' };
  return spec;
}

/** the measures of one person (shares of that person's stature unless it says metres) */
export function measureAge(spec: PedSpec, seed: number): Record<string, number> {
  const m = buildMhPedModel(materials, new Rng(seed), { variant: registerSpec(spec) })!;
  const s = shapes.get(shapeFor(spec))!;
  const L = dressLod(s, spec, s.lods.hi, false), gs = m.group.scale, nv = L.position.length / 3;
  const P = (i: number): [number, number, number] => [L.position[i * 3] * gs.x, L.position[i * 3 + 1] * gs.y, L.position[i * 3 + 2] * gs.z];
  const wsum = (i: number, set: number[]): number => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };
  const hj = s.rig.head[1], hs = m.head.scale.x;
  const H = (hj + (s.landmarks.crownY - hj) * hs) * gs.y;
  const arms = [4, 5, 6, 7], legs = [8, 9, 10, 11, 12, 13];
  const cut = (yr: number, pred: (i: number) => boolean) => {
    let x0 = 9, x1 = -9, z0 = 9, z1 = -9, ok = false; const y = yr * H;
    for (let t = 0; t < L.index.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = L.index[t + k], b = L.index[t + (k + 1) % 3]; if (!pred(a) || !pred(b)) continue;
      const pa = P(a), pb = P(b); if ((pa[1] - y) * (pb[1] - y) > 0 || pa[1] === pb[1]) continue;
      const u = (y - pa[1]) / (pb[1] - pa[1]), x = pa[0] + (pb[0] - pa[0]) * u, z = pa[2] + (pb[2] - pa[2]) * u;
      ok = true; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    return { w: ok ? (x1 - x0) / H : 0, d: ok ? (z1 - z0) / H : 0, zf: z0 / H, zb: z1 / H, x1: x1 / H, ok };
  };
  const trunk = (i: number): boolean => wsum(i, arms) < 0.35 && wsum(i, legs) < 0.5 && Math.abs(P(i)[0]) < 0.3;
  const leg = (i: number): boolean => P(i)[0] < 0 && wsum(i, legs) > 0.5, arm = (i: number): boolean => P(i)[0] < 0 && wsum(i, arms) > 0.5;
  const out: Record<string, number> = { H };
  // heads tall: stature over the head's own height (chin to crown, scaled by the head bone)
  out.headsTall = H / ((s.landmarks.crownY - s.landmarks.chinY) * hs * gs.y);
  // the fork (crotch height): the lowest vertex on the midline of the lower body
  { let fork = 9; for (let i = 0; i < nv; i++) { const p = P(i); if (Math.abs(p[0]) < 0.004 * H && p[1] > 0.25 * H && p[1] < 0.65 * H && p[2] > -0.1 * H && wsum(i, [1, ...legs]) > 0.5) fork = Math.min(fork, p[1] / H); } out.fork = fork; out.hipJoint = m.legs[0].position.y * gs.y / H; }
  const shY = (() => { m.group.updateMatrixWorld(true); const v = new THREE.Vector3(); m.arms[0].getWorldPosition(v); return v.y / H; })();
  out.bideltoid = cut(shY - 0.012, () => true).w;
  const hipR = out.fork + 0.03, hip = cut(hipR, (i) => wsum(i, arms) < 0.35);
  out.hipW = hip.w; out.shoulderOverHip = out.bideltoid / (hip.w || 1);
  const chest = cut(0.735, trunk), waist = cut(0.602, trunk), belly = cut(0.55, trunk);
  out.chestW = chest.w; out.chestD = chest.d; out.waistW = waist.w; out.waistD = waist.d; out.bellyD = belly.d; out.bellyOverChest = belly.d / (chest.d || 1);
  out.waistToChestW = waist.w / (chest.w || 1);
  { const cy = (s.landmarks.chinY * gs.y - 0.012 * H / 1.78) / H; let nk = cut(cy, (i) => Math.abs(P(i)[0]) < 0.075 * H / 1.78 && wsum(i, [3]) < 0.5 && P(i)[1] < s.landmarks.chinY * gs.y); if (!nk.ok) nk = cut(cy, (i) => Math.abs(P(i)[0]) < 0.09 && P(i)[1] < s.landmarks.chinY * gs.y + 0.02); out.neckG = ell(nk.w, nk.d); out.neckW = nk.w; out.chinY = s.landmarks.chinY * gs.y / H; }
  { const t = cut(0.44, leg); out.thighG = ell(t.w, t.d); const c = cut(0.17, leg); out.calfG = ell(c.w, c.d); const a = cut(0.05, leg); out.ankleG = ell(a.w, a.d); }
  { const b = cut(shY - 0.07, arm); out.bicepsG = ell(b.w, b.d); const f = cut(shY - 0.21, arm); out.forearmG = ell(f.w, f.d); }
  // the back: depth of the back line at the shoulder blades (0.74 of stature) against the seat (0.52), and how far the head sits in front of the pelvis
  { const up = cut(0.76, trunk), lo = cut(0.52, (i) => wsum(i, arms) < 0.35); out.backRound = up.zb - lo.zb; out.chestFront = up.zf - lo.zf; }
  { let sz = 0, sn = 0; for (let i = 0; i < nv; i++) if (wsum(i, [3]) > 0.9) { sz += P(i)[2]; sn++; } let pz = 0, pn = 0; for (let i = 0; i < nv; i++) { const p = P(i); if (Math.abs(p[1] - 0.5 * H) < 0.02 * H && trunk(i)) { pz += p[2]; pn++; } } out.headFwd = ((pz / (pn || 1)) - (sz / (sn || 1))) / H; }
  return out;
}

const SEEDS = [1, 2, 3, 4, 5, 6];
export function table(): Array<{ key: string; m: Record<string, number> }> {
  const rows: Array<{ key: string; m: Record<string, number> }> = [];
  for (const sex of ['m', 'f'] as const) for (const age of ['adult', 'old', 'teen', 'kid'] as Age[]) {
    const ms = SEEDS.map((sd) => measureAge(specFor(age, sex, sd), sd)), avg: Record<string, number> = {};
    for (const k of Object.keys(ms[0])) avg[k] = ms.reduce((a, b) => a + b[k], 0) / ms.length;
    rows.push({ key: `${sex}-${age}`, m: avg });
  }
  return rows;
}

describe('ages anatomy', () => {
  beforeAll(async () => {
    const fs = await import('node:fs'); clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) { const b = fs.readFileSync(new URL(f, DIR)); const sh = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(sh); shapes.set(sh.name, sh); }
  });
  let rows: ReturnType<typeof table> = [];
  it('table', () => {
    rows = table();
    if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
    expect(rows.length).toBe(8);
  }, 900000);
  it('street mix of 2000 seeded people', () => {
    const rng = new Rng(2026); const n = 2000, cnt: Record<string, number> = {}, byAge: Record<string, number> = {}, build: Record<string, number> = {};
    const AGE_SHARE: Array<[Age, number]> = [['kid', 0.1], ['teen', 0.07], ['adult', 0.7], ['old', 0.13]];
    for (let i = 0; i < n; i++) {
      let r = rng.next(), age: Age = 'adult'; for (const [a, w] of AGE_SHARE) { if (r < w) { age = a; break; } r -= w; }
      const sex = rng.next() < 0.5 ? 'f' : 'm', pool = BODY_POOLS[`${age}-${sex}`];
      let t = pool.reduce((a, [, w]) => a + w, 0) * rng.next(), id = pool[0][0]; for (const [b, w] of pool) { if (t < w) { id = b; break; } t -= w; }
      cnt[id] = (cnt[id] ?? 0) + 1; byAge[age] = (byAge[age] ?? 0) + 1;
      if (age === 'adult' || age === 'old') { const g = HEAVY.includes(id) ? 'heavy/stocky' : SLIM.includes(id) ? 'slim' : 'middle'; build[g] = (build[g] ?? 0) + 1; }
    }
    if (OUT) writeFileSync(OUT.replace(/\.json$/, '') + '-mix.json', JSON.stringify({ n, byAge, cnt, build }, null, 1));
    expect(bodyTypeId({ id: 'x', build: 'avg', sex: 'm', age: 'old', role: 'civilian' })).toBe('elder');
  });
});
const HEAVY: BodyTypeId[] = ['heavy', 'short-stocky', 'big-tall', 'stout', 'elder-heavy', 'pear', 'broad'];
const SLIM: BodyTypeId[] = ['slim', 'tall-thin', 'lanky', 'petite', 'slight', 'lean-teen', 'stoop-slim'];
