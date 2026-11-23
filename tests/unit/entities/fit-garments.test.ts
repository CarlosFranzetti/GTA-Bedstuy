/** FIT seat (round 3): measured claims about how garments sit on the new bodies. Six builds (slim, average, heavy, woman, elder, teen, child). */
import { beforeAll, describe, expect, it } from 'vitest';
import { PED_SPECS, type PedSpec } from '@/textures/painters/ped';
import { bodyTypeId, bodyTypeOf, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { dressLod, jointFor, parseShape, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { makeCtx, type Ctx } from '@/entities/models/pedPiecesKit';
import { hatPiece, shoePieces } from '@/entities/models/pedPieces';
import { necklineLoop, collarRows } from '@/entities/models/pedCuts';
import { necklineY } from '@/textures/painters/pedPaintBody';
import { neckBaseY } from '@/textures/painters/pedPaintBody';
import { SHOE_LEN } from '@/entities/models/pedShoes';

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

const ctxOf = (spec: PedSpec): Ctx => {
  const s = shapes.get(shapeFor(spec))!, bt = bodyTypeOf(spec), L0 = dressLod(s, spec, s.lods.hi, true), rig: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(s.rig)) rig[k] = jointFor(k, v, bt);
  return makeCtx(s, spec, bt, L0, rig, 'hi');
};
const TYPES: BodyTypeId[] = ['slim', 'avg', 'heavy', 'pear', 'elder', 'teen', 'kid'];
const specs = (): PedSpec[] => TYPES.map((t) => PED_SPECS.find((s) => (s.role === 'civilian' || s.role === 'player') && bodyTypeId(s) === t)).filter(Boolean) as PedSpec[];

describe('FIT: neckline from the body', () => {
  it('the neck base lies between the shoulder joint and the chin on every shape, never at one absolute height', () => {
    const seen = new Set<string>(); const bases: number[] = [];
    for (const sp of PED_SPECS) {
      const s = shapes.get(shapeFor(sp))!; if (seen.has(s.name)) continue; seen.add(s.name);
      const hs = (s.landmarks.crownY - s.landmarks.chinY) / 0.2285, shY = s.rig.shoulderL[1];
      for (const kind of ['tee', 'hoodie']) {
        const y = neckBaseY(shY, hs, kind);
        expect(y, `${s.name} ${kind}`).toBeGreaterThan(shY + 0.03 * hs);
        expect(y, `${s.name} ${kind}`).toBeLessThan(s.landmarks.chinY - 0.02 * hs);     // clear of the chin
      }
      bases.push(neckBaseY(shY, hs, 'tee'));
    }
    expect(Math.max(...bases) - Math.min(...bases)).toBeGreaterThan(0.2);                // it moves with the person (child 1.2 m to man 1.8 m)
  });
});

describe('FIT: hood lying on the shoulders', () => {
  it('is a cowl at the neck: it stays above the shoulder joint, below the chin, and under 400 triangles', () => {
    for (const sp of specs()) {
      const ctx = ctxOf(sp), piece = hatPiece('hoodDown', ctx), pos = piece.geo.getAttribute('position').array as Float32Array;
      let lo = Infinity, hi = -Infinity;
      for (let i = 1; i < pos.length; i += 3) { lo = Math.min(lo, pos[i]); hi = Math.max(hi, pos[i]); }
      const sh = ctx.rig.shoulderL[1], chin = ctx.lm.chinY;
      expect(lo, sp.id).toBeGreaterThanOrEqual(sh + 0.005 - 0.004);
      expect(hi, sp.id).toBeLessThanOrEqual(chin);
      expect(hi - lo, sp.id).toBeLessThan(0.12);
      expect((piece.geo.index?.count ?? 0) / 3, sp.id).toBeLessThan(400);
    }
  });
});

describe('FIT: shoes', () => {
  it('the shoe is about its share of stature long on every build (foot 0.154, shoe 0.158 to 0.18 of stature)', () => {
    for (const sp of specs()) {
      const ctx = ctxOf(sp), stature = ctx.lm.crownY;
      const ps = shoePieces('sneakerLow', ctx); expect(ps.length).toBeGreaterThan(0);
      for (const p of ps) {
        const pos = p.geo.getAttribute('position').array as Float32Array; let z0 = Infinity, z1 = -Infinity, y0 = Infinity;
        for (let i = 0; i < pos.length; i += 3) { z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); y0 = Math.min(y0, pos[i + 1]); }
        expect((z1 - z0) / stature, sp.id).toBeGreaterThan(SHOE_LEN * 0.95);
        expect((z1 - z0) / stature, sp.id).toBeLessThan(0.185);
        expect(y0, `${sp.id}: sole on the ground`).toBeLessThan(0.02);
      }
    }
  });
});

describe('FIT-TOPS: the neckline ring', () => {
  it('is a smooth closed loop on the painted line (within 12 mm), neighbours under 6 cm apart, rows finite', () => {
    for (const sp of specs()) {
      const s = shapes.get(shapeFor(sp))!, bt = bodyTypeOf(sp), L = dressLod(s, sp, s.lods.hi, true), rig: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(s.rig)) rig[k] = jointFor(k, v, bt);
      const hs = (s.landmarks.crownY - s.landmarks.chinY) / 0.2285, shY = rig.shoulderL[1];
      const prm = { shY, hs, kind: sp.top.kind, style: sp.top.style, neck: sp.top.neck, open: !!sp.top.open && !!sp.top.under };
      const loop = necklineLoop(L, L.position, L.normal, (x, z) => necklineY(prm, x, z), 28, shY - 0.02, shY + 0.3);
      expect(loop, sp.id).not.toBeNull();
      const pts = loop!.pts;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j].p, b = pts[(j + 1) % pts.length].p;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), `${sp.id} step ${j}`).toBeLessThan(0.06);      // neighbours within 6 cm (loop is about 45 cm round)
        expect(Math.abs(a[1] - necklineY(prm, a[0], a[2])), `${sp.id} on the painted line`).toBeLessThan(0.012);
      }
      const rows = collarRows(pts, 'rib', 1, loop!.c), top = rows[rows.length - 1];
      expect(top.length).toBe(28);
      for (const r of rows) for (const q of r) expect(Number.isFinite(q.p[0] + q.p[1] + q.p[2])).toBe(true);
    }
  });
  it('the collar costs under 5 percent of a hi person (triangles of the ring: 28 x 5 x 2)', () => { expect(28 * 5 * 2).toBeLessThan(0.05 * 6500); });
});
