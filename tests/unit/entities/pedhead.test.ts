import { describe, expect, it, beforeAll } from 'vitest';
import { clearPeople, parseShape, registerShape, type MhShape } from '@/entities/models/pedMesh';
import { faceMorph, faceTraits, headFrame } from '@/entities/models/pedHead';
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
      expect(t.jawW).toBeGreaterThan(0.85); expect(t.jawW).toBeLessThan(1.15);
      expect(t.headW).toBeGreaterThan(0.95); expect(t.headW).toBeLessThan(1.05);
      expect(t.eyeGap).toBeGreaterThan(0.9); expect(t.eyeGap).toBeLessThan(1.1);
      expect(t.ear).toBeGreaterThan(0.75); expect(t.ear).toBeLessThan(1.35);
    }
  });

  it('only the head moves, by less than 2.5 cm, finitely, and the same person gets the same face', () => {
    const L = shape.lods.hi;
    for (const spec of [PED_SPECS[0], PED_SPECS[5], PED_SPECS[12]] as PedSpec[]) {
      const m = faceMorph(shape, spec, L), m2 = faceMorph(shape, spec, L);
      expect(Array.from(m.position)).toEqual(Array.from(m2.position));
      let moved = 0, maxD = 0;
      for (let i = 0; i < L.position.length / 3; i++) {
        let head = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] === 3) head += L.weights[i * 4 + k];
        const d = Math.hypot(m.position[i * 3] - L.position[i * 3], m.position[i * 3 + 1] - L.position[i * 3 + 1], m.position[i * 3 + 2] - L.position[i * 3 + 2]);
        expect(Number.isFinite(d)).toBe(true);
        if (head < 0.3) expect(d).toBe(0);
        if (d > 0) moved++;
        maxD = Math.max(maxD, d);
      }
      expect(moved).toBeGreaterThan(50);
      expect(maxD).toBeLessThan(0.025);
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
