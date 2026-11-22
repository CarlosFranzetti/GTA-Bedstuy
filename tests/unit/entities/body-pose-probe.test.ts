import { beforeAll, describe, it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';
import { decodePack } from '@/entities/anim/clipPack';
import { fullLib } from './anim-measure';
import { makeGait } from '@/entities/anim/gait';
import { AnimController } from '@/entities/anim/controller';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const OUT = process.env.POSE_OUT ?? '';
describe('probe', () => {
  beforeAll(async () => {
    const fs = await import('node:fs');
    clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
  });
  it('arm angles', () => {
    const lib = fullLib();
    const rows: string[] = [];
    const D = 180 / Math.PI;
    const ang = (m: ReturnType<typeof buildMhPedModel> & object, i: number) => {
      m.group.updateMatrixWorld(true);
      const a = new THREE.Vector3(), e = new THREE.Vector3(); m.arms[i].getWorldPosition(a); m.elbows[i].getWorldPosition(e);
      const v = e.sub(a).normalize(); // forward is -z
      const out = Math.atan2(Math.abs(v.x), -v.y) * D, fwd = Math.atan2(-v.z, -v.y) * D;
      return { out, fwd, total: Math.acos(-v.y) * D };
    };
    let n = 0;
    for (const spec of PED_SPECS) {
      const m = buildMhPedModel(materials, new Rng(5), { variant: spec.id }); if (!m) continue;
      const rest = ang(m, 0);
      const ctl = new AnimController(m, makeGait(n * 13 + 1, spec.age ?? 'adult'), lib);
      for (let i = 0; i < 60; i++) ctl.update(1 / 30, { speed: 0 });
      const idle = ang(m, 0);
      // rest of the elbow
      let minO = 99, maxO = -99, minF = 99, maxF = -99;
      for (let i = 0; i < 90; i++) { ctl.update(1 / 30, { speed: 1.4 }); const a = ang(m, 0); minO = Math.min(minO, a.out); maxO = Math.max(maxO, a.out); minF = Math.min(minF, a.fwd); maxF = Math.max(maxF, a.fwd); }
      rows.push([spec.id, spec.build, spec.age, spec.top.kind, 'rest out', rest.out.toFixed(1), 'fwd', rest.fwd.toFixed(1), '| idle out', idle.out.toFixed(1), 'fwd', idle.fwd.toFixed(1), '| walk out', minO.toFixed(1), maxO.toFixed(1), 'fwd', minF.toFixed(1), maxF.toFixed(1), 'splay', (m.group.userData.splay as number).toFixed(2)].join(' '));
      n++;
    }
    if (OUT) writeFileSync(OUT, rows.join('\n'));
  });
});
