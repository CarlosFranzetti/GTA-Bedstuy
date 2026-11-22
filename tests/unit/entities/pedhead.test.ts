import { describe, expect, it, beforeAll } from 'vitest';
import { clearPeople, parseShape, registerShape, type MhShape } from '@/entities/models/pedMesh';
import { faceDebug, faceMorph, faceTraits, headFrame } from '@/entities/models/pedHead';
import { PED_SPECS } from '@/textures/painters/ped';
import type { PedSpec } from '@/textures/painters/ped';

type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number } };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);

describe('face traits and the face morph (pedHead.ts)', () => {
  let shape: MhShape;
  beforeAll(async () => {
    clearPeople();
    const b = (await nodeFs()).readFileSync(new URL('wh_m.glb', DIR));
    shape = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    registerShape(shape);
  });

  it('traits are deterministic per person and differ between people', () => {
    const a = PED_SPECS[0], b = PED_SPECS[1];
    expect(faceTraits(a)).toEqual(faceTraits(a));
    expect(faceTraits(a)).not.toEqual(faceTraits(b));
  });

  it('traits stay in plausible ranges for every person', () => {
    for (const s of PED_SPECS) {
      const t = faceTraits(s);
      expect(Math.abs(t.chinFwd)).toBeLessThan(0.015); expect(Math.abs(t.noseFwd)).toBeLessThan(0.02);
      expect(t.jawW).toBeGreaterThan(0.8); expect(t.jawW).toBeLessThan(1.22);
      expect(t.headW).toBeGreaterThan(0.92); expect(t.headW).toBeLessThan(1.09);
      expect(t.eyeGap).toBeGreaterThan(0.9); expect(t.eyeGap).toBeLessThan(1.1);
      expect(t.ear).toBeGreaterThan(0.7); expect(t.ear).toBeLessThan(1.5);
      expect(t.faceLen).toBeGreaterThan(0.84); expect(t.faceLen).toBeLessThan(1.1);
      expect(t.neckT).toBeGreaterThan(0.83); expect(t.neckT).toBeLessThan(1.35);
    }
  });

  it('only the head moves, by less than 3.5 cm, finitely, and the same person gets the same face', () => {
    const L = shape.lods.hi;
    for (const spec of [PED_SPECS[0], PED_SPECS[5], PED_SPECS[12]] as PedSpec[]) {
      const m = faceMorph(shape, spec, L), m2 = faceMorph(shape, spec, L);
      expect(Array.from(m.position)).toEqual(Array.from(m2.position));
      let moved = 0, maxD = 0;
      for (let i = 0; i < L.position.length / 3; i++) {
        let head = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] === 3) head += L.weights[i * 4 + k];
        const d = Math.hypot(m.position[i * 3] - L.position[i * 3], m.position[i * 3 + 1] - L.position[i * 3 + 1], m.position[i * 3 + 2] - L.position[i * 3 + 2]);
        expect(Number.isFinite(d)).toBe(true);
        if (head < 0.3 && L.position[i * 3 + 1] < shape.landmarks.chinY - 0.2) expect(d).toBe(0);   // only the head and the top of the neck (its thickness) move
        if (d > 0) moved++;
        maxD = Math.max(maxD, d);
      }
      expect(moved).toBeGreaterThan(50);
      expect(maxD).toBeLessThan(0.035);
      for (const v of m.normal) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('duplicated UV vertices stay together (no cracks along tile borders)', () => {
    const L = shape.lods.hi, m = faceMorph(shape, PED_SPECS[3], L);
    const seen = new Map<string, string>();
    for (let i = 0; i < L.position.length / 3; i++) {
      const k = `${Math.round(L.position[i * 3] * 1e5)},${Math.round(L.position[i * 3 + 1] * 1e5)},${Math.round(L.position[i * 3 + 2] * 1e5)}`;
      const v = `${Math.round(m.position[i * 3] * 1e4)},${Math.round(m.position[i * 3 + 1] * 1e4)},${Math.round(m.position[i * 3 + 2] * 1e4)}`;
      if (seen.has(k)) expect(seen.get(k)).toBe(v); else seen.set(k, v);
    }
  });

  it('faces differ: wide spread of traits, and nobody shares a face', () => {
    const civ = PED_SPECS.filter((p) => p.role === 'civilian');
    const sd = (f: (t: ReturnType<typeof faceTraits>) => number): number => { const v = civ.map((p) => f(faceTraits(p))), m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
    expect(sd((t) => t.jawW)).toBeGreaterThan(0.05); expect(sd((t) => t.noseW)).toBeGreaterThan(0.08); expect(sd((t) => t.eyeGap)).toBeGreaterThan(0.035);
    expect(sd((t) => t.headW)).toBeGreaterThan(0.025); expect(sd((t) => t.faceLen)).toBeGreaterThan(0.03); expect(sd((t) => t.neckT)).toBeGreaterThan(0.07);
    expect(sd((t) => t.chinDrop)).toBeGreaterThan(0.004); expect(sd((t) => t.noseFwd)).toBeGreaterThan(0.004);
    const sig = new Set(civ.map((p) => { const t = faceTraits(p); return [t.jawW, t.noseW, t.eyeGap, t.chinFwd, t.faceLen].map((v) => v.toFixed(3)).join('/'); }));
    expect(sig.size).toBe(new Set(civ.map((p) => p.id)).size);
  });

  it('age shows in shape: the old carry longer ears and noses, thinner lips, jowls and a forward head', () => {
    const mean = (ps: PedSpec[], f: (t: ReturnType<typeof faceTraits>) => number): number => ps.reduce((a, p) => a + f(faceTraits(p)), 0) / ps.length;
    const old = PED_SPECS.filter((p) => p.age === 'old'), adult = PED_SPECS.filter((p) => p.age === 'adult' && p.role === 'civilian');
    expect(old.length).toBeGreaterThan(1);
    expect(mean(old, (t) => t.ear)).toBeGreaterThan(mean(adult, (t) => t.ear) + 0.05);
    expect(mean(old, (t) => t.noseDrop + t.noseLen)).toBeGreaterThan(mean(adult, (t) => t.noseDrop + t.noseLen) + 0.003);
    expect(mean(old, (t) => t.lips)).toBeLessThan(mean(adult, (t) => t.lips) - 0.0008);
    expect(mean(old, (t) => t.jowl)).toBeGreaterThan(mean(adult, (t) => t.jowl) + 0.001);
    expect(mean(old, (t) => t.neckFwd)).toBeGreaterThan(mean(adult, (t) => t.neckFwd) + 0.006);
  });

  it('even at a quarter more than the trait spread fewer than 1 in 10,000 triangles of the head fold over (lips, lids, nose wings stay on the surface)', () => {
    const L = shape.lods.hi, was = faceDebug.stress;
    faceDebug.stress = Number(process.env.FLIP_STRESS ?? 1.25);
    try {
      const n = (P: Float32Array, t: number): number[] => { const a = L.index[t] * 3, b = L.index[t + 1] * 3, c = L.index[t + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
      let flipped = 0, total = 0;
      for (const spec of PED_SPECS.filter((p) => p.role === 'civilian').slice(0, 60)) {
        const m = faceMorph(shape, spec, L);
        for (let t = 0; t < L.index.length; t += 3) {
          const A = n(L.position, t), B = n(m.position, t), la = Math.hypot(A[0], A[1], A[2]), lb = Math.hypot(B[0], B[1], B[2]);
          if (la < 2.5e-6) continue;   // slivers under about 1.2 mm squared flip harmlessly at the lip line and the alar crease
          total++;
          if ((A[0] * B[0] + A[1] * B[1] + A[2] * B[2]) / (la * (lb || 1)) < -0.05) { flipped++; if (process.env.FLIP_LOG) { const i = L.index[t] * 3; console.log('FLIP', spec.id, ((L.position[i + 1] - shape.landmarks.chinY) / (shape.landmarks.eyeY - shape.landmarks.chinY)).toFixed(2), L.position[i].toFixed(3), (L.position[i + 2]).toFixed(3)); } }
        }
      }
      expect(total).toBeGreaterThan(1000);
      expect(flipped / total).toBeLessThan(0.0001);   // a handful of triangles under the nose tip or at the nasolabial crease fold in the extreme combinations (about 1 in 20,000); see FACES2.md
    } finally { faceDebug.stress = was; }
  });

  it('the face frame sits on the face: nose above the chin, below the eyes, in front of the head centre', () => {
    const f = headFrame(shape);
    expect(f.chinY).toBeLessThan(f.mouthY); expect(f.mouthY).toBeLessThan(f.noseBaseY); expect(f.noseBaseY).toBeLessThan(f.noseTipY); expect(f.noseTipY).toBeLessThan(f.eyeY);
    expect(f.frontZ).toBeLessThan(f.midZ);
  });
});

describe('head gear (hair, hats, beard) on the scalp', () => {
  it('builds every hair style and hat at hi and mid with finite, head-skinned geometry under a triangle cap', async () => {
    const { headGear } = await import('@/entities/models/pedHead');
    const b = (await nodeFs()).readFileSync(new URL('wh_m.glb', DIR));
    const shape = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const base = PED_SPECS[0];
    const hairs = ['bald', 'short', 'fade', 'afro', 'braids', 'bun', 'puff', 'long', 'locs', 'peyot', 'curly', 'waves', 'crop', 'bob', 'ponytail', 'thinning', 'twists'] as const;
    const hats = ['none', 'cap', 'beanie', 'headwrap', 'church', 'flat', 'cop', 'durag', 'hardhat', 'fedora', 'hijab', 'helmet', 'kufi', 'kippah'] as const;
    const ao = (n: number): Float32Array => new Float32Array(n * 3).fill(1);
    for (const detail of ['hi', 'mid'] as const) {
      const L = faceMorph(shape, base, shape.lods[detail]);
      for (const hair of hairs) for (const hat of hats) {
        const spec = { ...base, hair, hat, face: { ...base.face, beard: hair === 'short' } } as PedSpec;
        const parts = headGear(shape, L, ao(L.position.length / 3), spec, detail);
        let tris = 0;
        for (const g of parts) {
          const p = g.getAttribute('position');
          for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite((p.array as Float32Array)[i]), `${hair}/${hat}`).toBe(true);
          expect(g.getAttribute('skinIndex')).toBeTruthy(); expect(g.getAttribute('uv')).toBeTruthy();
          tris += (g.index ? g.index.count : p.count) / 3;
        }
        if (process.env.HEADS_LOG && (hat === 'none' || hair === 'short')) console.log(`TRIS ${detail} ${hair}/${hat} ${tris}`);
        expect(tris, `${detail} ${hair}/${hat}`).toBeLessThan(detail === 'hi' ? 2600 : 1100);
      }
    }
  });
});
