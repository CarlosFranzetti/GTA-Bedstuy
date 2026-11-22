// LIMBS seat: profile probe. Prints width x depth (shares of stature) at stations down the left leg and arm of the bare body, hi level.
// LIMBS_TYPES=avg,heavy LIMBS_SEX=m LIMBS_LOD=hi npx vitest run tests/unit/entities/limbs-profile-probe.test.ts --maxWorkers=1
import { beforeAll, describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { clearPeople, parseShape, registerShape, dressLod, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS, type PedSpec } from '@/textures/painters/ped';
import type { BodyTypeId } from '@/entities/models/pedBodyTypes';
import { limbSection, limbWeights } from '@/entities/models/pedLimbs';

void Rng;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const TYPES = (process.env.LIMBS_TYPES ?? 'avg').split(',') as BodyTypeId[];
const shapes = new Map<string, MhShape>();
const base = PED_SPECS.find((s) => s.top.kind === 'tee' && s.bottom.kind === 'jeans') ?? PED_SPECS[0];
const LEG_Y = [0.05, 0.0775, 0.11, 0.15, 0.20, 0.25, 0.278, 0.31, 0.38, 0.44, 0.465];
describe('limbs profile probe', () => {
  beforeAll(async () => {
    const fs = await import('node:fs'); clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) { const b = fs.readFileSync(new URL(f, DIR)); const sh = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); registerShape(sh); shapes.set(sh.name, sh); }
  });
  it('table', () => {
    const OUT = process.env.LIMBS_OUT ?? '/tmp/limbs-probe.txt'; writeFileSync(OUT, '');
    for (const id of TYPES) {
      const age = id === 'elder' || id === 'elder-heavy' ? 'old' : id === 'teen' ? 'teen' : id === 'kid' ? 'kid' : 'adult';
      const spec = { ...base, bottom: { ...base.bottom, kind: 'shorts', cut: 'short' }, id: `lp-${id}`, group: 'wh', role: 'civilian', build: age === 'kid' ? 'kid' : 'avg', sex: process.env.LIMBS_SEX ?? 'm', age, body: id } as unknown as PedSpec;
      const s = shapes.get(shapeFor(spec))!, H = s.landmarks.crownY;
      const L0 = process.env.LIMBS_LOD === 'mid' ? s.lods.mid : process.env.LIMBS_LOD === 'far' ? s.lods.far : s.lods.hi;
      const L = dressLod(s, spec, L0, false), wl = limbWeights(L, 'leg'), wa = limbWeights(L, 'arm');
      const out: string[] = [`== ${spec.sex} ${id} ${s.name} H=${H.toFixed(3)} knee y ${(s.rig.kneeL[1] / H).toFixed(3)} hip ${(s.rig.hipL[1] / H).toFixed(3)} sh ${(s.rig.shoulderL[1] / H).toFixed(3)} el ${(s.rig.elbowL[1] / H).toFixed(3)} wr ${(s.rig.wristL[1] / H).toFixed(3)}`];
      for (const y of LEG_Y) { const c = limbSection(L, L.position, wl, y * H); out.push(`leg y=${y.toFixed(3)} w ${((c.x1 - c.x0) / H).toFixed(3)} d ${((c.z1 - c.z0) / H).toFixed(3)} x0 ${(c.x0 / H).toFixed(3)} x1 ${(c.x1 / H).toFixed(3)} z0 ${(c.z0 / H).toFixed(3)} z1 ${(c.z1 / H).toFixed(3)}`); }
      const sh = s.rig.shoulderL[1], el = s.rig.elbowL[1], wr = s.rig.wristL[1];
      const AY = [0, 0.15, 0.31, 0.45, 0.6, 0.75, 0.88, 1].map((t) => sh + (el - sh) * t).concat([0.1, 0.28, 0.55, 0.8, 1].map((f) => el + (wr - el) * f));
      for (const y of AY) { const c = limbSection(L, L.position, wa, y); out.push(`arm y=${(y / H).toFixed(3)} w ${((c.x1 - c.x0) / H).toFixed(3)} d ${((c.z1 - c.z0) / H).toFixed(3)} x0 ${(c.x0 / H).toFixed(3)} x1 ${(c.x1 / H).toFixed(3)} z0 ${(c.z0 / H).toFixed(3)} z1 ${(c.z1 / H).toFixed(3)}`); }
      appendFileSync(OUT, out.join('\n') + '\n');
    }
  }, 600000);
});
