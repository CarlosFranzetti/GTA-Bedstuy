import { beforeAll, describe, it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';
import { fullLib } from './anim-measure';
import { makeGait } from '@/entities/anim/gait';
import { AnimController } from '@/entities/anim/controller';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const OUT = process.env.POSE_OUT ?? '';
const shapes = new Map<string, MhShape>();
describe('probe', () => {
  beforeAll(async () => {
    const fs = await import('node:fs');
    clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      registerShape(s); shapes.set(s.name, s);
    }
  });
  it('arm angles', () => {
    const lib = fullLib();
    const rows: string[] = [];
    const D = 180 / Math.PI;
    const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    const meas = (m: NonNullable<ReturnType<typeof buildMhPedModel>>, i: number) => {
      const sh = shapes.get(m.group.userData.pedShape as string)!;
      const wl = V(sh.rig.wristL as number[]).sub(V(sh.rig.elbowL as number[]));
      if (i === 1) wl.x *= -1;
      m.group.updateMatrixWorld(true);
      const a = new THREE.Vector3(), e = new THREE.Vector3(); m.arms[i].getWorldPosition(a); m.elbows[i].getWorldPosition(e);
      const w = m.elbows[i].localToWorld(wl.clone());
      const up = e.clone().sub(a).normalize(), fo = w.clone().sub(e).normalize();
      return { out: Math.atan2(Math.abs(up.x), -up.y) * D, fwd: Math.atan2(-up.z, -up.y) * D, flex: Math.acos(Math.max(-1, Math.min(1, up.dot(fo)))) * D, wz: w.z - a.z, wy: w.y, wx: Math.abs(w.x) };
    };
    const ids = (process.env.POSE_IDS ?? 'la-delivery,ba-work,wh-elder,ea-kid,ba-puffer-braids,hj-man,ba-church-lady,la-denim,wh-tote').split(',');
    for (const id of ids) {
      const spec = PED_SPECS.find((s) => s.id === id)!;
      const m = buildMhPedModel(materials, new Rng(5), { variant: spec.id }); if (!m) continue;
      const gait = makeGait(7, spec.age ?? 'adult');
      const ctl = new AnimController(m, gait, lib); ctl.bodyLayersOn = process.env.LAYERS !== '0';
      const rest = meas(m, 0);
      for (let i = 0; i < 60; i++) ctl.update(1 / 30, { speed: 0 });
      let o0 = 99, o1 = -99, f0 = 99, f1 = -99, x0 = 99, x1 = -99, z0 = 99, z1 = -99;
      const idleA = meas(m, 0), idleB = meas(m, 1);
      for (let i = 0; i < 90; i++) { ctl.update(1 / 30, { speed: 1.4 }); for (const k of [0, 1]) { const a = meas(m, k); o0 = Math.min(o0, a.out); o1 = Math.max(o1, a.out); f0 = Math.min(f0, a.flex); f1 = Math.max(f1, a.flex); x0 = Math.min(x0, a.fwd); x1 = Math.max(x1, a.fwd); z0 = Math.min(z0, a.wz); z1 = Math.max(z1, a.wz); } }
      rows.push(`${id.padEnd(18)} rest out ${rest.out.toFixed(1)} flex ${rest.flex.toFixed(1)} | idle L out ${idleA.out.toFixed(1)} fwd ${idleA.fwd.toFixed(1)} flex ${idleA.flex.toFixed(0)} R out ${idleB.out.toFixed(1)} fwd ${idleB.fwd.toFixed(1)} flex ${idleB.flex.toFixed(0)} | walk out ${o0.toFixed(1)}..${o1.toFixed(1)} swing ${x0.toFixed(0)}..${x1.toFixed(0)} flex ${f0.toFixed(0)}..${f1.toFixed(0)} handZ ${z0.toFixed(2)}..${z1.toFixed(2)}`);
    }
    if (OUT) writeFileSync(OUT, rows.join('\n'));
  });
});
