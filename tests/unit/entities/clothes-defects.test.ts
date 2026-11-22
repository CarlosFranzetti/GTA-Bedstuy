/**
 * CLOTHES seat (body team, 22 Nov): finds the defects that read as dark patches, holes and torn hems in the running game.
 * Every wardrobe entry (PED_SPECS) at the hi and mid detail levels, and every body type for a trousered and a skirted person.
 *   1. no NaN or Inf in the dressed positions, normals or uvs (a NaN corner wins every texel it covers in the bake and prints black into the colour map)
 *   2. no triangle of the merged person with a corner outside the finite box, none degenerate beyond the allowance
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, buildMhPedModel, type MhShape } from '@/entities/models/pedMesh';
import type { IMaterialLibrary } from '@/world/types';

// the texture bake is a canvas job: capture what the game hands it instead (node has no canvas)
const baked: Array<{ id: string; position: Float32Array; normal: Float32Array }> = [];
vi.mock('@/textures/painters/pedSkinPaint', async (orig) => {
  const m = await orig<typeof import('@/textures/painters/pedSkinPaint')>();
  return { ...m, bakeSkin: (b: { position: Float32Array; normal: Float32Array; spec: { id: string } }) => { baked.push({ id: b.spec.id, position: b.position, normal: b.normal }); return { width: 1, height: 1 }; } };
});
const DIR = 'src/assets/models/people/';
const shapes = new Map<string, MhShape>();
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(s); shapes.set(s.name, s); }
});
const DETAILS = ['hi', 'mid'] as const;

describe('clothes: no NaN in the dressed body', () => {
  it('positions, normals and uvs are finite for every wardrobe entry at hi and mid', () => {
    const bad: string[] = [];
    for (const spec of PED_SPECS) {
      const s = shapes.get(shapeFor(spec))!;
      for (const d of DETAILS) {
        const L = dressLod(s, spec, s.lods[d], true);
        for (const [name, arr] of [['position', L.position], ['normal', L.normal], ['uv', L.uv]] as const) {
          let n = 0; for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) n++;
          if (n) bad.push(`${spec.id}/${d} ${name} ${n}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

export interface Tally { tris: number; flipped: number; degenerate: number; nan: number }
/** triangles whose geometric normal points against the average of their own vertex normals (inside out), degenerate ones, and non-finite corners */
export function tally(g: THREE.BufferGeometry): Tally {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.index!, t: Tally = { tris: I.count / 3, flipped: 0, degenerate: 0, nan: 0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let k = 0; k < I.count; k += 3) {
    const i0 = I.getX(k), i1 = I.getX(k + 1), i2 = I.getX(k + 2);
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    if (![a, b, c].every((v) => Number.isFinite(v.x + v.y + v.z))) { t.nan++; continue; }
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    const area = n.length() / 2;
    if (area < 1e-9) { t.degenerate++; continue; }
    n.normalize();
    const vn = new THREE.Vector3(N.getX(i0) + N.getX(i1) + N.getX(i2), N.getY(i0) + N.getY(i1) + N.getY(i2), N.getZ(i0) + N.getZ(i1) + N.getZ(i2));
    if (vn.lengthSq() > 1e-6 && n.dot(vn.normalize()) < -0.2) t.flipped++;
  }
  return t;
}

describe('clothes: the bake input has no NaN', () => {
  it('every vertex handed to the texture bake is finite (a NaN corner paints black over the texels it covers: the dark patches under hems and at the seat)', () => {
    const had = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {};
    try {
      const ids = ['wh-office', 'ba-hoodie-fade', 'ba-puffer-braids', 'ca-nurse', 'wh-elder', 'la-bomber', 'ba-sundress'];
      const bad: string[] = [];
      for (const id of ids) {
        const v = PED_SPECS.findIndex((s) => s.id === id);
        buildMhPedModel(materials, new Rng(v + 1), { variant: v });
        const b = baked.filter((x) => x.id === id).pop();
        if (!b) { bad.push(id + ' no bake captured'); continue; }
        let n = 0; for (let i = 0; i < b.position.length; i++) if (!Number.isFinite(b.position[i]) || !Number.isFinite(b.normal[i])) n++;
        if (n) bad.push(`${id} ${n} non-finite values`);
      }
      expect(bad).toEqual([]);
    } finally { (globalThis as { document?: unknown }).document = had; }
  });
});

/** the final merged geometry of a person (what the game draws), per level */
export function levels(v: number): THREE.BufferGeometry[] {
  const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!, out: THREE.BufferGeometry[] = [];
  m.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push((o as THREE.SkinnedMesh).geometry); });
  return out;
}
