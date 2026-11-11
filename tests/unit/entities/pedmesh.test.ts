import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { PED_VARIANT_COUNT } from '@/entities/models/pedBody';
import { HEAD_MAP, HI_RECTS, PEDHI_ATLAS } from '@/textures/painters/pedHi';
import { clearPeople, buildMhPedModel, buildPerson, parseShape, peopleReady, registerShape, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';
import type { IMaterialLibrary } from '@/world/types';
// @ts-expect-error plain ESM script without types
import * as P from '../../../scripts/people-pipeline.mjs';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number; length: number }; readdirSync(p: URL): string[] };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const file = (f: string): URL => new URL(f, DIR);

// a 2 x 1 quad strip (6 vertices) in the body group plus a helper triangle that must be dropped
const OBJ = `# fixture
v 0 0 0
v 1 0 0
v 2 0 0
v 0 1 0
v 1 1 0
v 2 1 0
v 5 5 5
vt 0 0
vt 1 0
vt 0 1
vt 1 1
g body
f 1/1 2/2 5/4 4/3
f 2/1 3/2 6/4 5/3
g helper-hair
f 1/1 2/2 7/3
`;

describe('people pipeline (scripts/people-pipeline.mjs)', () => {
  it('parses quads of the body group only and drops helper geometry', () => {
    const o = P.parseObj(OBJ);
    expect(o.positions.length).toBe(7 * 3);
    expect(o.quads.length).toBe(8);
    expect([...o.quads.slice(0, 4)]).toEqual([0, 1, 4, 3]);
    expect(o.uvs.length).toBe(8);
  });

  it('triangulates quads and applies sparse target offsets', () => {
    const o = P.parseObj(OBJ);
    const tris = P.triangulate(o.quads, o.positions);
    expect(tris.length).toBe(12);
    const t = P.parseTarget('# c\n4 0 0.5 0\n5 0.25 0 0\n99 1 1 1\n', 100);
    expect([...t.idx]).toEqual([4, 5, 99]);
    const out = P.applyTargets(o.positions, [{ target: t, weight: 2 }].map((x) => ({ ...x, target: P.parseTarget('4 0 0.5 0\n5 0.25 0 0', 100) })));
    expect(out[4 * 3 + 1]).toBeCloseTo(2);
    expect(out[5 * 3]).toBeCloseTo(2.5);
    expect(o.positions[4 * 3 + 1]).toBe(1); // input untouched
  });

  it('maps MakeHuman bones to the 12 bone rig (left = armL / legL)', () => {
    const R = P.RIG as string[];
    expect(R[P.rigIndexOf('upperarm01.L')]).toBe('armL');
    expect(R[P.rigIndexOf('wrist.R')]).toBe('elbowR');
    expect(R[P.rigIndexOf('finger3-2.L')]).toBe('elbowL');
    expect(R[P.rigIndexOf('upperleg02.R')]).toBe('legR');
    expect(R[P.rigIndexOf('toe1-1.L')]).toBe('kneeL');
    expect(R[P.rigIndexOf('neck02')]).toBe('head');
    expect(R[P.rigIndexOf('spine03')]).toBe('torso');
    expect(R[P.rigIndexOf('pelvis.L')]).toBe('hips');
    const w = P.rigWeights({ weights: { 'upperarm01.L': [[0, 0.5], [1, 1]], 'spine03': [[0, 0.5]] } }, 3);
    expect(w[0 * 12 + 4]).toBeCloseTo(0.5); expect(w[0 * 12 + 2]).toBeCloseTo(0.5);
    expect(w[2 * 12 + 1]).toBe(1); // unweighted vertex falls to the hips
  });

  it('decimates a grid with meshoptimizer and keeps the bone weights', async () => {
    const { MeshoptSimplifier } = await import('meshoptimizer');
    await MeshoptSimplifier.ready;
    const N = 20, pos: number[] = [], w: number[] = [], idx: number[] = [];
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) { pos.push(x * 0.05, y * 0.05, Math.sin(x * 0.2) * 0.02); const t = y / N; const row = new Array(12).fill(0); row[1] = 1 - t; row[2] = t; w.push(...row); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = y * (N + 1) + x; idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1); }
    const body = { positions: Float32Array.from(pos), w12: Float32Array.from(w), indices: Uint32Array.from(idx) };
    const out = P.decimate(MeshoptSimplifier, body, 100);
    expect(out.indices.length / 3).toBeLessThanOrEqual(130);
    expect(out.indices.length / 3).toBeGreaterThan(20);
    for (let v = 0; v < out.positions.length / 3; v++) {
      expect(out.w12[v * 12 + 1] + out.w12[v * 12 + 2]).toBeCloseTo(1, 3);
      expect(out.w12[v * 12 + 2]).toBeCloseTo(out.positions[v * 3 + 1] / 1, 1); // weight follows height
    }
  });

  it('projects UVs into PEDHI atlas tiles (same rects as the painters)', () => {
    for (const [k, r] of Object.entries(P.TILES) as Array<[string, { x: number; y: number; w: number; h: number }]>) {
      if (k === 'gear' || k in HI_RECTS) expect(HI_RECTS[k as keyof typeof HI_RECTS], k).toEqual(r);
    }
    expect(P.ATLAS).toBe(PEDHI_ATLAS);
    // the painter's eye line is 0.034 m of the 0.09 m half width, and its landmark heights are fractions of the tile
    expect(P.FACE.eyeFrac).toBeCloseTo(0.034 / HEAD_MAP.halfW / 2, 2);
    expect(P.FACE.t.eye).toBeCloseTo((1.664 - HEAD_MAP.yMin) / (HEAD_MAP.yMax - HEAD_MAP.yMin), 2);
    const [u, v] = P.tileUV(P.TILES.torso, 0.5, 1);
    expect(u).toBeGreaterThan(P.TILES.torso.x / PEDHI_ATLAS); expect(v).toBeLessThan(1 - P.TILES.torso.y / PEDHI_ATLAS);
  });

  it('classifies triangles by bone weights and height', () => {
    const lm = { chinY: 1.5, hemY: 1.0, ankleY: 0.07, wristY: 0.95 };
    const w = (i: number): Float32Array => { const a = new Float32Array(12); a[i] = 1; return a; };
    expect(P.regionOf(w(3), 1.7, lm)).toBe('head');
    expect(P.regionOf(w(3), 1.4, lm)).toBe('neck');
    expect(P.regionOf(w(2), 1.2, lm)).toBe('torso');
    expect(P.regionOf(w(2), 0.9, lm)).toBe('pelvis');
    expect(P.regionOf(w(5), 0.8, lm)).toBe('hand');
    expect(P.regionOf(w(9), 0.05, lm)).toBe('shoe');
    expect(P.regionOf(w(10), 0.6, lm)).toBe('thigh');
  });
});

describe('shipped people glbs', () => {
  const shapes: MhShape[] = [];
  beforeAll(async () => {
    clearPeople();
    const fs = await nodeFs();
    for (const f of fs.readdirSync(DIR).filter((n: string) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(file(f));
      shapes.push(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
    for (const s of shapes) registerShape(s);
  });

  it('ships 6 to 30 shapes under 3 MB in total', async () => {
    const fs = await nodeFs();
    expect(shapes.length).toBeGreaterThanOrEqual(6);
    expect(shapes.length).toBeLessThanOrEqual(30);
    const bytes = fs.readdirSync(DIR).filter((n: string) => n.endsWith('.glb')).reduce((a: number, f: string) => a + fs.readFileSync(file(f)).length, 0);
    expect(bytes).toBeLessThan(3_000_000);
  });

  it('every shape has hi ~4k, mid ~1.5k, far ~400 triangles, stands on y = 0 at its height, front at -z, weights sum to 1', () => {
    for (const s of shapes) {
      expect(s.lods.hi.index.length / 3, s.name).toBeGreaterThan(2000); expect(s.lods.hi.index.length / 3).toBeLessThanOrEqual(2800);   // 2.7k, ~1k of them in the head
      expect(s.lods.mid.index.length / 3).toBeGreaterThan(1100); expect(s.lods.mid.index.length / 3).toBeLessThanOrEqual(1600);
      expect(s.lods.far.index.length / 3).toBeGreaterThan(250); expect(s.lods.far.index.length / 3).toBeLessThanOrEqual(450);
      const b = new THREE.Box3().setFromArray(s.lods.hi.position);
      expect(b.min.y, s.name).toBeGreaterThan(-0.02); expect(b.min.y).toBeLessThan(0.02);
      expect(b.max.y, s.name).toBeCloseTo(s.height, 1);
      // the nose / toes point to -z: the front extends further than the back at head height
      let zmin = 0;
      for (let i = 0; i < s.lods.hi.position.length; i += 3) if (s.lods.hi.position[i + 1] > s.landmarks.eyeY - 0.02 && s.lods.hi.position[i + 1] < s.landmarks.eyeY + 0.02) zmin = Math.min(zmin, s.lods.hi.position[i + 2]);
      expect(zmin, s.name).toBeLessThan(-0.05);
      for (let v = 0; v < s.lods.hi.weights.length; v += 4) expect(s.lods.hi.weights[v] + s.lods.hi.weights[v + 1] + s.lods.hi.weights[v + 2] + s.lods.hi.weights[v + 3]).toBeCloseTo(1, 2);
      for (const u of s.lods.hi.uv) { expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1); }
    }
  });

  it('flag on and shapes loaded: people are ready and every variant maps to a shape', () => {
    expect(peopleReady()).toBe(true);
    const names = new Set(shapes.map((s) => s.name));
    for (const spec of PED_SPECS) expect(names.has(shapeFor(spec)), spec.id).toBe(true);
  });

  it('draw count: one skinned mesh per LOD on 12 bones, one shared material per variant, <= 3 draws near', () => {
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const m = buildMhPedModel(materials, new Rng(5), { variant: v, heightScale: 1 })!;
      expect(m, PED_SPECS[v].id).not.toBeNull();
      const meshes: THREE.SkinnedMesh[] = [];
      m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
      expect(meshes.length).toBe(3);
      const lod = m.group.getObjectByName('pedLod') as THREE.LOD;
      expect(lod.levels.length).toBe(3);
      for (const l of lod.levels) expect(l.object.type).toBe('SkinnedMesh');
      expect(new Set(meshes.map((x) => x.material)).size).toBe(1);
      expect(meshes[0].skeleton.bones.length).toBe(12);
      expect(m.triangles).toBeGreaterThan(2500);
      expect(m.triangles).toBeLessThan(6500); // ~4k body + hair / hat caps + PEDHI clothing shells
      const box = new THREE.Box3().setFromObject(m.group);
      expect(box.max.y).toBeGreaterThan(1.4); expect(box.max.y).toBeLessThan(2.1);
    }
  });

  it('triangle budget per LOD over all variants: far <= 600, mid <= 2.1k, hi <= 6.5k', () => {
    const max = [0, 0, 0];
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const m = buildMhPedModel(materials, new Rng(5), { variant: v, heightScale: 1 })!;
      const lod = m.group.getObjectByName('pedLod') as THREE.LOD;
      lod.levels.forEach((l, i) => { const g = (l.object as THREE.Mesh).geometry; max[i] = Math.max(max[i], g.index!.count / 3); });
    }
    console.log('PEDLOD hi mid far', max.join(' '));
    expect(max[2]).toBeLessThanOrEqual(600);
    expect(max[1]).toBeLessThanOrEqual(2100);
    expect(max[0]).toBeLessThanOrEqual(6500);
  });

  it('buildPerson uses the people shapes when loaded and PEDHI otherwise', () => {
    const a = buildPerson(materials, new Rng(9), { variant: 0 });
    expect(a.group.userData.pedShape).toBeTruthy();
    clearPeople();
    expect(peopleReady()).toBe(false);
    const b = buildPerson(materials, new Rng(9), { variant: 0 });
    expect(b.group.userData.pedShape).toBeUndefined();
    for (const s of shapes) registerShape(s);
  });
});
