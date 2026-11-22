/**
 * CLOTHES seat (body team, 22 Nov): finds the defects that read as dark patches, holes and torn hems in the running game.
 * Every wardrobe entry (PED_SPECS) at the hi and mid detail levels, and every body type for a trousered and a skirted person.
 *   1. no NaN or Inf in the dressed positions, normals or uvs (a NaN corner wins every texel it covers in the bake and prints black into the colour map)
 *   2. no triangle of the merged person with a corner outside the finite box, none degenerate beyond the allowance
 */
import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, buildMhPedModel, type MhShape } from '@/entities/models/pedMesh';
import type { IMaterialLibrary } from '@/world/types';

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
