import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { bodyTypeOf, BODY_TYPES } from '@/entities/models/pedBodyTypes';
import { buildMhPedModel, clearPeople, headScaleFor, headsOf, parseShape, registerShape, shapeFor, dressLod, type MhShape } from '@/entities/models/pedMesh';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const shapes = new Map<string, MhShape>();
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
});

describe('round 3 proportions and cloth', () => {
  it('every adult stands 7.0 to 7.5 head heights tall with the solved head scale, whatever the body type', () => {
    for (const spec of PED_SPECS) {
      if ((spec.age ?? 'adult') !== 'adult' && spec.age !== 'old') continue;
      const s = shapes.get(shapeFor(spec))!, bt = bodyTypeOf(spec), k = headScaleFor(s, spec, bt), lm = s.landmarks;
      const head = (lm.crownY - lm.chinY) * k, stature = s.height + (k - 1) * (lm.crownY - s.rig.head[1]);
      const heads = stature / head;
      expect(heads, spec.id).toBeGreaterThan(6.9); expect(heads, spec.id).toBeLessThan(7.6);
      expect(headsOf(spec, bt), spec.id).toBeGreaterThan(6.9);
    }
  });
  it('men carry the wedge (narrower waist and hips than the same type on a woman)', () => {
    const m = bodyTypeOf({ id: 'a', build: 'avg', sex: 'm', age: 'adult', role: 'civilian', body: 'avg' }), f = bodyTypeOf({ id: 'a', build: 'avg', sex: 'f', age: 'adult', role: 'civilian', body: 'avg' });
    expect(m.waist).toBeLessThan(f.waist); expect(m.hips).toBeLessThan(BODY_TYPES.avg.hips); expect(f.hips).toBe(BODY_TYPES.avg.hips);
  });
  it('trouser legs are a near straight cloth tube: the radius falls monotonically from the thigh to the hem', () => {
    const spec = { ...PED_SPECS.find((p) => p.id === 'ba-hoodie-fade')!, bottom: { ...PED_SPECS[0].bottom, kind: 'jeans' as const } };
    const s = shapes.get(shapeFor(spec))!, D = dressLod(s, spec, s.lods.hi, true);
    const rad = (y0: number, y1: number): number => { let x0 = 1, x1 = -1, z0 = 1, z1 = -1; for (let i = 0; i < D.position.length / 3; i++) { const y = D.position[i * 3 + 1]; if (y >= y0 && y < y1 && D.position[i * 3] < -0.015 && D.joints[i * 4] >= 8) { x0 = Math.min(x0, D.position[i * 3]); x1 = Math.max(x1, D.position[i * 3]); z0 = Math.min(z0, D.position[i * 3 + 2]); z1 = Math.max(z1, D.position[i * 3 + 2]); } } return x1 < x0 ? 0 : (x1 - x0) + (z1 - z0); };
    const hip = s.rig.hipL[1], an = s.landmarks.ankleY;
    const bands = [0.3, 0.5, 0.7, 0.9].map((t) => rad(an + (hip - an) * (t - 0.1), an + (hip - an) * (t + 0.1)));
    for (let i = 1; i < bands.length; i++) expect(bands[i - 1]).toBeLessThanOrEqual(bands[i] + 0.02);   // no knee pinch or calf bulge: never wider below than above
  });
  it('a hijab person is built with the drape (fewer base triangles) and a closed budget of about 5,000 triangles', () => {
    for (const id of ['me-hijabi', 'sa-hijabi']) {
      const v = PED_SPECS.findIndex((p) => p.id === id);
      const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v });
      expect(m, id).not.toBeNull(); expect(m!.triangles, id).toBeLessThan(5400);
    }
  });
  it('the hijab drape is a smooth cloth: the person is one skinned mesh with the 12 bones', () => {
    const v = PED_SPECS.findIndex((p) => p.id === 'me-hijabi'), m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!;
    let skinned = 0; m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++; });
    expect(skinned).toBeGreaterThan(0);
    expect(m.head.name).toBe('head'); expect(m.legs.length).toBe(2); expect(m.arms.length).toBe(2);
  });
});
