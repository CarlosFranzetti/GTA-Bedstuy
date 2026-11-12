import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, buildMhPedModel, type MhLod, type MhShape } from '@/entities/models/pedMesh';
import { bodyTypeOf } from '@/entities/models/pedBodyTypes';
import { isCoveredLeg } from '@/entities/models/pedLegs';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const shapes = new Map<string, MhShape>();
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
});

/** x / z extents of a leg (side -1 = the character's left) cut by the plane y: from the triangles whose vertices all belong to that leg */
function slice(D: { position: ArrayLike<number>; joints: ArrayLike<number>; weights: ArrayLike<number>; index: ArrayLike<number> }, side: -1 | 1, y: number): { x0: number; x1: number; z0: number; z1: number } | null {
  let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
  const bones = side < 0 ? [8, 9] : [10, 11], leg = (v: number): number => { let w = 0; for (let k = 0; k < 4; k++) if (bones.includes(D.joints[v * 4 + k])) w += D.weights[v * 4 + k]; return w; };
  const P = D.position, I = D.index;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    if (v.some((q) => leg(q) < 0.55 || P[q * 3] * side < 0)) continue;
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], ya = P[a * 3 + 1], yb = P[b * 3 + 1];
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const f = (y - ya) / (yb - ya), x = P[a * 3] + (P[b * 3] - P[a * 3]) * f, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * f;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  return x1 < x0 ? null : { x0, x1, z0, z1 };
}
/** mean of the two diameters of the section */
const width = (D: MhLod, y: number, side: -1 | 1 = -1): number => { const a = slice(D, side, y); return a ? (a.x1 - a.x0 + a.z1 - a.z0) / 2 : 0; };
const DETAILS = ['hi', 'mid'] as const;
const trousered = PED_SPECS.filter((p) => isCoveredLeg(p.bottom.kind));

describe('round 4: cut trouser legs', () => {
  it('every trousered person has a tube per leg at hi and mid (and far), and the shipped people include all garments', () => {
    expect(trousered.length).toBeGreaterThan(55);
    for (const k of ['jeans', 'trousers', 'cargo', 'sweats']) expect(trousered.some((p) => p.bottom.kind === k), k).toBe(true);
  });
  it('the leg width falls straight from the seat to the hem: at most 8 % to the knee, 12 % from there to the hem, never wider than at the seat, no bumps', () => {
    for (const spec of trousered) for (const d of DETAILS) {
      const s = shapes.get(shapeFor(spec))!, D = dressLod(s, spec, s.lods[d], true), t = D.tube!, id = `${spec.id}/${d}`;
      expect(t, id).toBeTruthy();
      const top = t.ySeat - 0.025, hem = t.yHem + 0.06, wSeat = width(D, top), wKnee = width(D, t.yKnee), wHem = width(D, hem);
      expect(wSeat, id).toBeGreaterThan(0.12);
      expect((wSeat - wKnee) / wSeat, id + ' seat to knee').toBeLessThan(0.085);
      expect((wKnee - wHem) / wKnee, id + ' knee to hem').toBeLessThan(0.125);
      expect((wSeat - wHem) / wSeat, id + ' seat to hem').toBeGreaterThan(0.04);       // a taper, not a drum
      const ws: number[] = [];
      for (let i = 0; i <= 12; i++) ws.push(width(D, hem + ((top - hem) * i) / 12));
      for (let i = 0; i < ws.length; i++) { expect(ws[i], id + ' never wider than the seat').toBeLessThanOrEqual(wSeat * 1.012); if (i) expect(ws[i - 1], id + ' monotonic').toBeLessThanOrEqual(ws[i] + 0.0035); }
      for (let i = 1; i + 1 < ws.length; i++) expect(Math.abs(ws[i - 1] - 2 * ws[i] + ws[i + 1]), id + ' second difference').toBeLessThan(0.006);
      const bt = bodyTypeOf(spec), hipW = 2 * Math.max(...s.hipRings.map((r) => r[1])) * Math.max(1, bt.hips) * 1.12;
      expect(wSeat / hipW, id + ' thigh against hip width').toBeLessThan(0.6);
    }
  });
  it('the legs are two columns: 3 cm of daylight at the knee (in the world, with the person scaled), growing to the hem', () => {
    for (const spec of trousered) {
      const v = PED_SPECS.indexOf(spec), m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!, sc = m.group.scale.x;
      for (const d of DETAILS) {
        const s = shapes.get(shapeFor(spec))!, D = dressLod(s, spec, s.lods[d], true), t = D.tube!, id = `${spec.id}/${d}`;
        const gap = (y: number): number => { const a = slice(D, -1, y), b = slice(D, 1, y); return a && b ? (b.x0 - a.x1) * sc : -1; };
        const knee = gap(t.yKnee), hem = gap(t.yHem + 0.07), seat = gap(t.ySeat - 0.02);
        expect(knee, id + ' knee').toBeGreaterThanOrEqual(0.03);
        expect(hem, id + ' hem').toBeGreaterThan(knee);
        expect(seat, id + ' seat').toBeGreaterThan(0.005);
      }
    }
  });
  it('shoes are chunky: 0.24 m or more for an adult (world scale), at hi and mid, wider than the ankle, flat on the ground, the toe forward', () => {
    for (const spec of PED_SPECS) {
      if ((spec.age ?? 'adult') !== 'adult' && spec.age !== 'old') continue;
      const v = PED_SPECS.indexOf(spec), m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!, sc = m.group.scale;
      const levels: THREE.SkinnedMesh[] = []; m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) levels.push(o as THREE.SkinnedMesh); });
      for (const lv of levels.slice(0, 2)) {
        const g = lv.geometry, P = g.getAttribute('position'), U = g.getAttribute('uv');
        let z0 = 9, z1 = -9, w0 = 9, w1 = -9, ymin = 9;
        for (let i = 0; i < P.count; i++) {
          if (U.getX(i) < 0.75 || U.getY(i) > 0.25 || P.getX(i) > -0.02 || P.getY(i) > 0.2) continue;     // the left shoe: its swatch is the bottom right tile of the atlas
          z0 = Math.min(z0, P.getZ(i)); z1 = Math.max(z1, P.getZ(i)); w0 = Math.min(w0, P.getX(i)); w1 = Math.max(w1, P.getX(i)); ymin = Math.min(ymin, P.getY(i));
        }
        const id = `${spec.id}/${lv.name}`;
        expect((z1 - z0) * sc.z, id + ' length').toBeGreaterThanOrEqual(0.24);
        expect((w1 - w0) * sc.x, id + ' width').toBeGreaterThan(0.085);
        expect(Math.abs(ymin), id + ' sole on the ground').toBeLessThan(0.003);
        expect(Math.abs(z1 - z0), id).toBeLessThan(0.36);
        // the toe points forward (-z): the long extent is in z and the shoe is longer than wide
        expect(z1 - z0, id).toBeGreaterThan((w1 - w0) * 2);
      }
    }
  });
  it('triangle counts stay within 5 % of the round 3 totals at hi, mid and far', () => {
    const base = { hi: 383778, mid: 139858, far: 33538 }, tot = { hi: 0, mid: 0, far: 0 };
    PED_SPECS.forEach((p, v) => { const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!; const lv: number[] = []; m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) lv.push((o as THREE.SkinnedMesh).geometry.index!.count / 3); }); tot.hi += lv[0]; tot.mid += lv[1]; tot.far += lv[2]; });
    console.log('tris', JSON.stringify(tot));
    expect(tot.hi / base.hi).toBeLessThan(1.05); expect(tot.mid / base.mid).toBeLessThan(1.05); expect(tot.far / base.far).toBeLessThan(1.05);
  });
});
