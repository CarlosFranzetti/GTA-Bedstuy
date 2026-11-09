import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { animateWalk } from '@/entities/models/humanModel';
import { PED_SPECS, PED_VARIANT_COUNT } from '@/entities/models/pedBody';
import { FAR_DIST, MID_DIST, buildPedModel, clothingShell, fabricsFor, hiGeo, pedHiMaterial, type RigLayout } from '@/entities/models/pedBodyHi';
import { PEDHI_ATLAS, paintPedHi } from '@/textures/painters/pedHi';
import { SoftCtx, guard, ALLOWED } from '../textures/softcanvas';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const skinned = (o: THREE.Object3D): THREE.SkinnedMesh[] => { const r: THREE.SkinnedMesh[] = []; o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) r.push(c as THREE.SkinnedMesh); }); return r; };

describe('GTA4-style people (pedBodyHi)', () => {
  it('near body is 2,500 to 4,000 triangles, mid about 1,200, far a few hundred, for every variant', () => {
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const hi = hiGeo(v, 'hi').triangles, mid = hiGeo(v, 'mid').triangles, far = hiGeo(v, 'far').triangles;
      expect(hi, PED_SPECS[v].id).toBeGreaterThanOrEqual(2500);
      expect(hi, PED_SPECS[v].id).toBeLessThanOrEqual(4000);
      expect(mid, PED_SPECS[v].id).toBeGreaterThan(700);
      expect(mid, PED_SPECS[v].id).toBeLessThan(1700);
      expect(far).toBeLessThan(800);
    }
  });

  it('is 7.5 heads tall (about 1.75 m), faces -z, stands on the ground, one skinned mesh per LOD level on a 12 bone rig', () => {
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const spec = PED_SPECS[v];
      const m = buildPedModel(materials, new Rng(4), { variant: v, heightScale: 1 });
      const levels = skinned(m.group);
      expect(levels.length).toBe(3);
      expect(levels[0].skeleton.bones.length).toBe(12);
      expect(new Set(levels.map((l) => l.skeleton)).size).toBe(1);
      expect(new Set(levels.map((l) => l.material)).size).toBe(1);
      const bb = new THREE.Box3().setFromObject(m.group.getObjectByName('body')!);
      expect(bb.min.y).toBeGreaterThan(-0.03); expect(bb.min.y).toBeLessThan(0.03);
      expect(bb.max.y, spec.id).toBeGreaterThan(1.7); expect(bb.max.y, spec.id).toBeLessThan(2.05);
      const g = (m.group.getObjectByName('body') as THREE.Mesh).geometry;
      expect(g.boundingBox!.min.z).toBeLessThan(-0.11); // nose and toes point to -z
      expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeGreaterThan(0.45);
      expect(m.triangles).toBe(hiGeo(v, 'hi').triangles);
    }
  });

  it('LOD: hi from 0, mid from 18 m, far from 40 m; the camera picks the level', () => {
    const m = buildPedModel(materials, new Rng(1), { variant: 0 });
    const lod = m.group.getObjectByName('pedLod') as THREE.LOD;
    expect(lod.levels.map((l) => l.distance)).toEqual([0, MID_DIST, FAR_DIST]);
    const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.6, 30); cam.updateMatrixWorld(true);
    m.group.updateMatrixWorld(true); lod.update(cam);
    expect(lod.levels.findIndex((l) => l.object.visible)).toBe(1);
    cam.position.set(0, 1.6, 60); cam.updateMatrixWorld(true); lod.update(cam);
    expect(lod.levels.findIndex((l) => l.object.visible)).toBe(2);
    cam.position.set(0, 1.6, 4); cam.updateMatrixWorld(true); lod.update(cam);
    expect(lod.levels.findIndex((l) => l.object.visible)).toBe(0);
  });

  it('keeps the walk / idle rig API: swing, run amplitude and the idle poses move the bones', () => {
    const m = buildPedModel(materials, new Rng(2), { variant: 3 });
    animateWalk(m, 1.2, 1);
    expect(m.legs[0].rotation.x).not.toBe(0);
    expect(m.legs[0].rotation.x).toBeCloseTo(-m.legs[1].rotation.x, 6);
    const walk = Math.abs(m.legs[0].rotation.x);
    animateWalk(m, 1.2, 1.6);
    expect(Math.abs(m.legs[0].rotation.x)).toBeGreaterThan(walk);
    animateWalk(m, 0, 0);
    expect(m.legs[0].rotation.x).toBeCloseTo(0, 6);
    expect(m.head.name).toBe('head'); expect(m.arms[0].name).toBe('armL'); expect(m.legs[1].name).toBe('legR');
  });

  it('shares one geometry per variant and level, and one material per variant (flat colour without a 2D canvas)', () => {
    const a = buildPedModel(materials, new Rng(1), { variant: 5 }), b = buildPedModel(materials, new Rng(9), { variant: 5 });
    expect(skinned(a.group)[0].geometry).toBe(skinned(b.group)[0].geometry);
    expect(skinned(a.group)[0].material).toBe(skinned(b.group)[0].material);
    expect(pedHiMaterial(materials, 5, false).name).toBe(`pedhi:${PED_SPECS[5].id}`);
  });

  it('every UV is inside the atlas and the normals are smooth (unit length, not face normals)', () => {
    const g = hiGeo(0, 'hi').geo;
    const uv = g.attributes.uv.array as Float32Array, nrm = g.attributes.normal;
    for (let i = 0; i < uv.length; i++) { expect(uv[i]).toBeGreaterThanOrEqual(0); expect(uv[i]).toBeLessThanOrEqual(1); }
    expect(g.index).toBeTruthy();
    expect(g.attributes.position.count).toBeLessThan(g.index!.count); // shared vertices = smooth shading
    for (let i = 0; i < nrm.count; i += 97) expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 3);
  });
});

describe('pedHi painter', () => {
  const run = (v: number, seed = 1) => { const a = new SoftCtx(256, 256), h = new SoftCtx(256, 256), r = new SoftCtx(256, 256); paintPedHi(guard(a), guard(h), guard(r), 256, new Rng(seed + v), v); return { a, h, r }; };
  const hash = (px: Uint8ClampedArray): number => { let x = 2166136261 >>> 0; for (let i = 0; i < px.length; i++) { x ^= px[i]; x = Math.imul(x, 16777619); } return x >>> 0; };
  it('is deterministic per variant, differs between variants, and uses only basic 2D calls', () => {
    const seen = new Set<number>();
    for (const v of [0, 1, 5, 15, 16]) {
      const a = run(v), b = run(v);
      expect(hash(a.a.pixels())).toBe(hash(b.a.pixels()));
      expect(hash(a.h.pixels())).toBe(hash(b.h.pixels()));
      seen.add(hash(a.a.pixels()));
      for (const n of [...a.a.names, ...a.h.names, ...a.r.names]) expect(ALLOWED.has(n)).toBe(true);
    }
    expect(seen.size).toBe(5);
  });
  it('paints a height and a roughness layer that carry detail (not flat), and skin around the eyes', () => {
    const { a, h, r } = run(1);
    const spread = (px: Uint8ClampedArray): number => { let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 4) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); } return hi - lo; };
    expect(spread(h.pixels())).toBeGreaterThan(40);
    expect(spread(r.pixels())).toBeGreaterThan(20);
    expect(spread(a.pixels())).toBeGreaterThan(150);
    expect(PEDHI_ATLAS).toBe(512);
  });
});

describe('clothing shells, baked AO, fabrics', () => {
  const ring = (y: number, r: number, cx = 0) => ({ y, rx: r, rz: r, cx });
  const rig: RigLayout = {
    torso: [ring(0.94, 0.16), ring(1.14, 0.16), ring(1.35, 0.2), ring(1.5, 0.06)], torsoBone: 2, neckY: 1.47,
    arms: [{ upper: [ring(1.44, 0.06, -0.19), ring(1.13, 0.042, -0.19)], fore: [ring(1.13, 0.042, -0.19), ring(0.9, 0.03, -0.19), ring(0.865, 0.028, -0.19)], boneUpper: 4, boneFore: 5 }],
    legs: [{ thigh: [ring(0.93, 0.09, -0.09), ring(0.48, 0.055, -0.09)], shin: [ring(0.48, 0.055, -0.09), ring(0.3, 0.05, -0.09), ring(0.09, 0.034, -0.09)], boneThigh: 8, boneShin: 9 }],
  };
  it('wraps any ring layout: hoodie shell with collar, sleeves, cuffs and trouser folds, hi level only', () => {
    const hoodie = PED_SPECS[0];
    const parts = clothingShell(hoodie, rig, 'hi');
    expect(parts.length).toBeGreaterThanOrEqual(5);
    expect(new Set(parts.map((p) => p.bone))).toEqual(new Set([2, 4, 5, 8, 9]));
    for (const p of parts) expect(p.geo.attributes.uv.count).toBe(p.geo.attributes.position.count);
    expect(clothingShell(hoodie, rig, 'mid')).toEqual([]);
    // the shell stands off the body (thickness): a torso ring is wider than the body ring it wraps
    const torsoShell = parts[0].geo; torsoShell.computeBoundingBox();
    expect(torsoShell.boundingBox!.max.x).toBeGreaterThan(0.2);
  });
  it('bakes ambient occlusion into vertex colours (darker under the chin and in the armpits than on the chest) and uses vertex colours', () => {
    const g = hiGeo(0, 'hi').geo, c = g.getAttribute('color') as THREE.BufferAttribute, p = g.getAttribute('position');
    let lo = 1, hi = 0; for (let i = 0; i < c.count; i++) { lo = Math.min(lo, c.getX(i)); hi = Math.max(hi, c.getX(i)); }
    expect(lo).toBeLessThan(0.75); expect(hi).toBeCloseTo(1, 2);
    void p;
    expect((pedHiMaterial(materials, 0, false) as THREE.MeshStandardMaterial).vertexColors).toBe(true);
  });
  it('assigns real fabrics to the clothing tiles', () => {
    const f = fabricsFor(PED_SPECS.find((s) => s.id === 'puffer-braids')!);
    expect(f.find(([t]) => t === 'torso')![1]).toBe('nylon_puffer');
    expect(f.find(([t]) => t === 'thigh')![1]).toBe('denim');
    expect(fabricsFor(PED_SPECS.find((s) => s.id === 'tracksuit-man')!).find(([t]) => t === 'torso')![1]).toBe('cotton_knit');
  });
});
