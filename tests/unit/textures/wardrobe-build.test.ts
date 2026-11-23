import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { registerSpec } from '@/textures/painters/ped';
import { OUTFITS } from '@/textures/painters/pedOutfits';
import { composeSpec } from '@/textures/painters/pedWardrobe';
import { buildMhPedModel, clearPeople, parseShape, registerShape } from '@/entities/models/pedMesh';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
});
describe('every whole outfit builds a person', () => {
  it('each outfit and way builds without error', () => {
    const bad: string[] = [];
    for (const o of OUTFITS) for (let way = 0; way < o.ways.length; way++) {
      const age = o.a === 'k' || o.a === 'kt' ? 'kid' : o.a === 't' ? 'teen' : o.a.includes('o') && !o.a.includes('a') ? 'old' : 'adult';
      try {
        const sp = composeSpec(9, { group: 'ba', sex: o.sx ?? 'f', age }, { outfit: o.id, way }); sp.id += `-b-${o.id}${way}`;
        const m = buildMhPedModel(materials, new Rng(1), { variant: registerSpec(sp) });
        if (!m) bad.push(`${o.id}/${way} null`);
      } catch (e) { bad.push(`${o.id}/${way}: ${(e as Error).message}`); }
    }
    expect(bad).toEqual([]);
  }, 240000);
});
