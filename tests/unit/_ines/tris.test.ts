// TEMPORARY probe (PEOPLE3): triangles per person at hi LOD. Deleted before the final report.
import { describe, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { parseShape, registerShape, buildMhPedModel } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';
import { bodyTypeId } from '@/entities/models/pedBodyTypes';
import type { IMaterialLibrary } from '@/world/types';
const DIR = '/home/user/GTA-Bedstuy/src/assets/models/people/';
describe('tris', () => {
  it('counts', async () => {
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
    const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
    const rows: Array<[number, string]> = [];
    for (let v = 0; v < PED_SPECS.length; v++) { const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v }); if (m) rows.push([m.triangles, `${PED_SPECS[v].id} ${bodyTypeId(PED_SPECS[v])} hat=${PED_SPECS[v].hat} hair=${PED_SPECS[v].hair} gear=${PED_SPECS[v].gear} bottom=${PED_SPECS[v].bottom.kind}`]); }
    rows.sort((a, b) => b[0] - a[0]);
    const t = rows.map((r) => r[0]);
    console.log(`\nn=${rows.length} min ${Math.min(...t)} median ${t[Math.floor(t.length / 2)]} max ${Math.max(...t)} over5000: ${t.filter((x) => x > 5000).length}\n` + rows.slice(0, 25).map((r) => `${r[0]} ${r[1]}`).join('\n'));
  });
});
