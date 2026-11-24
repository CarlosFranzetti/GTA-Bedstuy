import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import '@/textures/painters/ped';
import { buildMhPedModel, clearPeople, parseShape, registerShape } from '@/entities/models/pedMesh';
import type { IMaterialLibrary } from '@/world/types';
import { CAST_MEMBERS } from '@/game/story/cast/cast';
import { castVariant } from '@/game/story/cast/specs';
import { OUTFIT_KEYS } from '@/game/story/cast/types';

const DIR = 'src/assets/models/people/';
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
});
const levels = (m: THREE.Group): number[] => { const o: number[] = []; m.traverse((x) => { if ((x as THREE.SkinnedMesh).isSkinnedMesh) o.push((x as THREE.SkinnedMesh).geometry.index!.count / 3); }); return o; };

describe('CAST: every named person builds on every detail level within the triangle limits', () => {
  it('all outfits of all ten people: close under 7,300, mid under 2,000, far at most 400', () => {
    const bad: string[] = [];
    let n = 0;
    for (const m of CAST_MEMBERS) for (const k of OUTFIT_KEYS) {
      if (!m.outfits[k]) continue;
      const v = castVariant(m.id, k);
      const g = buildMhPedModel(materials, new Rng(v + 1), { variant: v });
      expect(g, `${m.id}/${k} builds`).toBeTruthy();
      const L = levels(g!.group);
      n++;
      expect(L.length, `${m.id}/${k} has three levels`).toBeGreaterThanOrEqual(3);
      const [hi, mid, far] = L;
      if (hi >= 7300 || mid >= 2000 || far > 400) bad.push(`${m.id}/${k} ${hi}/${mid}/${far}`);
    }
    expect(n).toBeGreaterThanOrEqual(CAST_MEMBERS.length);
    expect(bad).toEqual([]);
  }, 120000);
});
