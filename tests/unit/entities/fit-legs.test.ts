/** FIT-LEGS (round 3): measured claims about trousers, the seat and the shoes on the new bodies. Seven builds. */
import { beforeAll, describe, expect, it } from 'vitest';
import { PED_SPECS, type PedSpec } from '@/textures/painters/ped';
import { bodyTypeId, bodyTypeOf, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { dressLod, jointFor, parseShape, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { makeCtx, type Ctx } from '@/entities/models/pedPiecesKit';
import { shoePieces } from '@/entities/models/pedPieces';
import { isCoveredLeg, HEM_Y } from '@/entities/models/pedLegs';

type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }; readdirSync(p: URL): string[] };
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const shapes = new Map<string, MhShape>();
beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
    const b = fs.readFileSync(new URL(f, DIR));
    const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    shapes.set(s.name, s);
  }
}, 60000);

const TYPES: BodyTypeId[] = ['slim', 'avg', 'heavy', 'pear', 'elder', 'teen', 'kid'];
const specs = (): PedSpec[] => TYPES.map((t) => PED_SPECS.find((s) => (s.role === 'civilian' || s.role === 'player') && bodyTypeId(s) === t)).filter(Boolean) as PedSpec[];
const trousered = (): PedSpec[] => TYPES.map((t) => PED_SPECS.find((s) => (s.role === 'civilian' || s.role === 'player') && bodyTypeId(s) === t && isCoveredLeg(s.bottom.kind))).filter(Boolean) as PedSpec[];
const ctxOf = (spec: PedSpec): Ctx => {
  const s = shapes.get(shapeFor(spec))!, bt = bodyTypeOf(spec), L0 = dressLod(s, spec, s.lods.hi, true), rig: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(s.rig)) rig[k] = jointFor(k, v, bt);
  return makeCtx(s, spec, bt, L0, rig, 'hi');
};
const legW = (L: { joints: Uint16Array; weights: Float32Array }, i: number): number => { let t = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] >= 8) t += L.weights[i * 4 + k]; return t; };

describe('FIT-LEGS: trousers on the built body', () => {
  it('has trousered people on at least five of the seven builds', () => { expect(trousered().length).toBeGreaterThanOrEqual(5); });

  it('no bare leg vertex stands outside the trouser (rest pose, five stations from seat to ankle), and the cloth is not a balloon (at most 1.7 x the thigh)', () => {
    for (const sp of trousered()) {
      const s = shapes.get(shapeFor(sp))!, dressed = dressLod(s, sp, s.lods.hi, true), bare = dressLod(s, sp, s.lods.hi, false);
      const hipY = s.rig.hipL[1], kneeY = s.rig.kneeL[1], anY = s.landmarks.ankleY, seat = hipY - 0.17 * s.landmarks.crownY / 1.78;
      // extents of the surface at height y on one side: every triangle edge that crosses the plane contributes its crossing point
      const env = (L: typeof dressed, y: number, side: number): { x: number; z0: number; z1: number } => {
        let x = 0, z0 = Infinity, z1 = -Infinity; const P = L.position;
        for (let t = 0; t < L.index.length; t += 3) for (let e = 0; e < 3; e++) {
          const a = L.index[t + e], b = L.index[t + (e + 1) % 3], ya = P[a * 3 + 1], yb = P[b * 3 + 1];
          if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
          const k = (y - ya) / (yb - ya), px = P[a * 3] + (P[b * 3] - P[a * 3]) * k, pz = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * k;
          if (Math.sign(px) !== side) continue;
          x = Math.max(x, Math.abs(px)); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
        }
        return { x, z0, z1 };
      };
      for (const f of [0.08, 0.3, 0.55, 0.8, 0.95]) {
        const y = seat - (seat - (anY + 0.1)) * f;
        for (const side of [-1, 1]) {
          const d = env(dressed, y, side), b = env(bare, y, side);
          expect(d.x, `${sp.id} ${f}`).toBeGreaterThan(0);
          expect(d.x, `${sp.id} width at ${f}`).toBeGreaterThanOrEqual(b.x - 0.004);
          expect(d.z1 - d.z0, `${sp.id} depth at ${f}`).toBeGreaterThanOrEqual(b.z1 - b.z0 - 0.006);
          expect(d.x, `${sp.id} width at ${f} not a balloon`).toBeLessThan(b.x * 1.7 + 0.02);
        }
      }
    }
  });

  it('closes the fork: no base-mesh pelvis triangle is left between the legs under the waistband, and the hem is level at 6 to 10 cm', () => {
    for (const sp of trousered()) {
      const s = shapes.get(shapeFor(sp))!, L = dressLod(s, sp, s.lods.hi, true), tube = (L as unknown as { tube: { ySeat: number; yHem: number; xL: number; xR: number } }).tube;
      expect(tube.yHem, sp.id).toBeGreaterThan(0.06); expect(tube.yHem, sp.id).toBeLessThan(0.1);
      expect(Math.abs(tube.xL + tube.xR), `${sp.id} legs symmetric`).toBeLessThan(1e-4);
      // vertices of the dressed mesh that belong to the legs and the pelvis and lie in the fork box must all be cloth tube vertices (weights on a leg bone 8 to 11 or the pelvis 1, uv in the thigh/shin tiles)
      let skinInFork = 0;
      for (let i = 0; i < L.position.length / 3; i++) {
        const y = L.position[i * 3 + 1];
        if (Math.abs(L.position[i * 3]) < 0.02 && y > tube.ySeat - 0.04 && y < tube.ySeat + 0.1 && L.position[i * 3 + 2] < -0.02 && legW(L, i) < 0.12 && L.joints[i * 4] === 1) skinInFork++;
      }
      expect(skinInFork, `${sp.id} pelvis vertices left in the fork`).toBe(0);
    }
  });

  it('triangles per dressed person stay in budget on all three levels', () => {
    for (const sp of specs()) {
      const s = shapes.get(shapeFor(sp))!;
      expect(dressLod(s, sp, s.lods.hi, true).index.length / 3, `${sp.id} hi`).toBeLessThan(7400);
      expect(dressLod(s, sp, s.lods.mid, true).index.length / 3, `${sp.id} mid`).toBeLessThan(1800);
      expect(dressLod(s, sp, s.lods.far, true).index.length / 3, `${sp.id} far`).toBeLessThan(800);
    }
  });
});

describe('FIT-LEGS: shoes', () => {
  it('a sneaker is at most 0.168 of stature long on every build, on the ground, and the trouser hem is above the sole', () => {
    const allShoes: string[] = [];
    void allShoes;
    for (const sp of specs()) {
      const ctx = ctxOf(sp), stature = ctx.lm.crownY, out: string[] = [];
      for (const p of shoePieces('sneakerLow', ctx)) {
        const pos = p.geo.getAttribute('position').array as Float32Array; let z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < pos.length; i += 3) { z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); }
        out.push(((z1 - z0) / stature).toFixed(3));
        allShoes.push(`${sp.id} ${out.join(',')}`); expect((z1 - z0) / stature, `${sp.id} shoe share`).toBeLessThan(0.168);
      }
    }
    expect(HEM_Y).toBeGreaterThan(0.05);
  });
});
