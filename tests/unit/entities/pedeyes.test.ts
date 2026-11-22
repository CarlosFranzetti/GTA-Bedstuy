import { describe, expect, it, beforeAll } from 'vitest';
import { clearPeople, dressLod, parseShape, registerShape, type MhShape } from '@/entities/models/pedMesh';
import { buildEyePatch } from '@/entities/models/pedEyes';
import { PED_SPECS, CIVILIAN_COUNT } from '@/textures/painters/ped';
import { EYE_RECTS, eyeEdges, eyeShapeOf, exprOf, wearOf } from '@/textures/painters/pedEyeShape';
import { makeLook } from '@/textures/painters/pedPaintShared';

type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number } };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);

describe('FACES4 eye patch (pedEyes.ts)', () => {
  let shape: MhShape;
  beforeAll(async () => {
    clearPeople();
    const b = (await nodeFs()).readFileSync(new URL('wh_m.glb', DIR));
    shape = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    registerShape(shape);
  });

  it('the opening is a closed curve with the lid above the lower edge, for every person', () => {
    for (const s of PED_SPECS.slice(0, CIVILIAN_COUNT)) {
      const e = eyeShapeOf(s);
      for (let u = -0.95; u <= 0.95; u += 0.05) { const { yu, yl } = eyeEdges(e, u); expect(yu).toBeGreaterThan(yl); }
      expect(e.bUp).toBeGreaterThan(0.004); expect(e.bUp).toBeLessThan(0.0095); expect(e.ri).toBeLessThan(0.0072);
      expect(eyeEdges(e, 1).yu).toBeCloseTo(eyeEdges(e, 1).yl, 9);
    }
  });

  it('the shared expression and wear draws are the painter\'s own', () => {
    const lm = shape.landmarks;
    for (const s of PED_SPECS.slice(0, 40)) {
      const K = makeLook({ spec: s, landmarks: lm, rig: shape.rig as never, headRings: shape.headRings as number[][], topHem: 1, position: new Float32Array(0), normal: new Float32Array(0), uv: new Float32Array(0), index: new Uint32Array(0), joints: new Uint16Array(0), weights: new Float32Array(0) } as never);
      expect(exprOf(s)).toBe(K.expr); expect(wearOf(s)).toBeCloseTo(K.wear, 9); expect(eyeShapeOf(s).eyeK).toBeCloseTo(K.eyeK, 9);
    }
  });

  it('builds a finite, outward facing patch inside the atlas rectangles and drops the skin under it', () => {
    for (const i of [0, 3, 11, 25]) {
      const spec = PED_SPECS[i], L = dressLod(shape, spec, shape.lods.hi, true), p = buildEyePatch(shape, spec, L);
      expect(p).not.toBeNull();
      const q = p!, nv = q.position.length / 3;
      expect(nv).toBe(2 * (1 + 9 * 20)); expect(q.index.length / 3).toBe(2 * (20 + 8 * 40));
      for (const a of [q.position, q.normal, q.position0, q.normal0, q.uv]) for (const v of a) expect(Number.isFinite(v)).toBe(true);
      for (let v = 0; v < nv; v++) {
        const r = EYE_RECTS[v < nv / 2 ? 0 : 1], u = q.uv[v * 2] * 512, w = (1 - q.uv[v * 2 + 1]) * 512;
        expect(u).toBeGreaterThanOrEqual(r.x - 0.5); expect(u).toBeLessThanOrEqual(r.x + r.w + 0.5); expect(w).toBeGreaterThanOrEqual(r.y - 0.5); expect(w).toBeLessThanOrEqual(r.y + r.h + 0.5);
        expect(Math.hypot(q.normal[v * 3], q.normal[v * 3 + 1], q.normal[v * 3 + 2])).toBeCloseTo(1, 3);
      }
      // faces out like the skin: the mean of the patch normals agrees with the skin's
      let dot = 0; for (let v = 0; v < nv; v++) dot += q.normal[v * 3] * q.normal0[v * 3] + q.normal[v * 3 + 1] * q.normal0[v * 3 + 1] + q.normal[v * 3 + 2] * q.normal0[v * 3 + 2];
      expect(dot / nv).toBeGreaterThan(0.6);
      expect(q.hide.size).toBeGreaterThan(10); expect(q.hide.size).toBeLessThan(400);
    }
  });
});
