import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, shapeByName } from '@/entities/models/pedMesh';
import type { PedModel } from '@/entities/models/pedBody';
import { PED_SPECS } from '@/textures/painters/ped';
import { ClipLibrary } from '@/entities/anim/library';
import { decodePack } from '@/entities/anim/clipPack';
import { makeGait } from '@/entities/anim/gait';
import { AnimController } from '@/entities/anim/controller';
import { fullLib } from './anim-measure';
import { settlePosture as settleBefore } from './fixtures/posture-before';
import type { IMaterialLibrary } from '@/world/types';

// POSE seat: the arm angle at rest and walking, BEFORE (the committed posture correction, the layers off, and the game's old rewrite of the arm roll to
// `splay` after the controller: fixtures/posture-before.ts is that module as it was) against AFTER (the corrected clips and the layers).
// The table goes to POSE_OUT when it is set. The assertions are on the AFTER side and on the improvement.
type Fs = { readFileSync(p: URL | string): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }; readdirSync(p: URL): string[]; writeFileSync(p: string, d: string): void };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const DEG = 180 / Math.PI;
const IDS: Array<[string, string]> = [['la-delivery', 'slim adult'], ['ba-work', 'stocky, jacket'], ['ba-puffer-braids', 'average, puffer'], ['hj-man', 'average, long jacket'], ['ba-church-lady', 'average, dress'], ['wh-elder', 'stocky elder'], ['ea-kid', 'child']];
const STYLES = ['walk', 'walkBrisk', 'walkFast', 'walkStroll', 'walkJaunty'];

function arm(m: PedModel, i: number): { out: number; flex: number; fwd: number } {
  const s = shapeByName(m.group.userData.pedShape as string)!;
  const wl = new THREE.Vector3(...(s.rig.wristL as [number, number, number])).sub(new THREE.Vector3(...(s.rig.elbowL as [number, number, number])));
  if (i === 1) wl.x *= -1;
  m.group.updateMatrixWorld(true);
  const a = new THREE.Vector3(), e = new THREE.Vector3(); m.arms[i].getWorldPosition(a); m.elbows[i].getWorldPosition(e);
  const w = m.elbows[i].localToWorld(wl.clone()), up = e.clone().sub(a).normalize(), fo = w.clone().sub(e).normalize();
  return { out: Math.atan2(Math.abs(up.x), -up.y) * DEG, fwd: Math.atan2(-up.z, -up.y) * DEG, flex: Math.acos(Math.max(-1, Math.min(1, up.dot(fo)))) * DEG };
}

describe('arm angle before and after', () => {
  let before: ClipLibrary;
  const after = fullLib();
  beforeAll(async () => {
    const fs = await nodeFs();
    clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
    before = new ClipLibrary([]);
    const map = (before as unknown as { clips: Map<string, unknown> }).clips;
    for (const f of ['core.bin', 'street.bin']) for (const c of decodePack(new Uint8Array(fs.readFileSync(`public/anim/${f}`).buffer.slice(0) as ArrayBuffer))) map.set(c.name, settleBefore(c));
  });

  function run(id: string, lib: ClipLibrary, layers: boolean): { stand: { out: number; flex: number; fwd: number }; walk: { outLo: number; outHi: number; flexLo: number; flexHi: number; fwdLo: number; fwdHi: number } } {
    const spec = PED_SPECS.find((s) => s.id === id)!;
    const sp = (m: PedModel): void => { const z = (m.group.userData.splay as number | undefined) ?? 0; m.arms[0].rotation.z = -z; m.arms[1].rotation.z = z; };
    const st = { out: 0, flex: 0, fwd: 0 }, w = { outLo: 99, outHi: 0, flexLo: 99, flexHi: 0, fwdLo: 99, fwdHi: -99 };
    // standing: the mean of 40 s of idle (the weight shifts and the head turns come and go)
    {
      const m = buildMhPedModel(materials, new Rng(5), { variant: spec.id })!, ctl = new AnimController(m, makeGait(11, spec.age ?? 'adult'), lib);
      ctl.bodyLayersOn = layers;
      ctl.update(1 / 30, { speed: 0 });
      (ctl as unknown as { bls: { gestChance: number } }).bls.gestChance = 0; // the hand-in-pocket gesture is not the rest pose (tested on its own)
      let n = 0;
      for (let i = 0; i < 1200; i++) {
        ctl.update(1 / 30, { speed: 0 }); if (!layers) sp(m);
        if (i < 60 || i % 6) continue;
        for (const k of [0, 1]) { const a = arm(m, k); st.out += a.out; st.flex += a.flex; st.fwd += a.fwd; n++; }
      }
      st.out /= n; st.flex /= n; st.fwd /= n;
    }
    for (const style of STYLES) {
      const m = buildMhPedModel(materials, new Rng(5), { variant: spec.id })!, g = makeGait(11, spec.age ?? 'adult'); g.walkClip = style;
      const ctl = new AnimController(m, g, lib); ctl.bodyLayersOn = layers;
      for (let i = 0; i < 150; i++) {
        ctl.update(1 / 30, { speed: 1.4 }); if (!layers) sp(m);
        if (i < 30) continue;
        for (const k of [0, 1]) { const a = arm(m, k); w.outLo = Math.min(w.outLo, a.out); w.outHi = Math.max(w.outHi, a.out); w.flexLo = Math.min(w.flexLo, a.flex); w.flexHi = Math.max(w.flexHi, a.flex); w.fwdLo = Math.min(w.fwdLo, a.fwd); w.fwdHi = Math.max(w.fwdHi, a.fwd); }
      }
    }
    return { stand: st, walk: w };
  }

  it('standing and walking: the forearm is straighter and the upper arm hangs clear, for every build', async () => {
    const rows: string[] = ['build                  | standing mean: upper arm out, forearm bend, swing   | walking (5 styles): out, forearm bend, swing', ''];
    for (const [id, label] of IDS) {
      const b = run(id, before, false), a = run(id, after, true);
      const f = (r: ReturnType<typeof run>): string => `${r.stand.out.toFixed(1).padStart(5)} ${r.stand.flex.toFixed(0).padStart(4)} ${r.stand.fwd.toFixed(0).padStart(4)} | ${r.walk.outLo.toFixed(0)}..${r.walk.outHi.toFixed(0)} ${r.walk.flexLo.toFixed(0)}..${r.walk.flexHi.toFixed(0)} ${r.walk.fwdLo.toFixed(0)}..${r.walk.fwdHi.toFixed(0)}`;
      rows.push(`${label.padEnd(22)} BEFORE ${f(b)}`, `${''.padEnd(22)} AFTER  ${f(a)}`);
      expect(a.stand.flex, id + ' standing forearm bend').toBeLessThan(b.stand.flex - 6);
      expect(a.stand.flex, id + ' standing forearm bend').toBeLessThan(35);
      expect(a.walk.flexLo, id + ' walking elbow never locked straight').toBeGreaterThan(b.walk.flexLo - 1);
      if (id !== 'ea-kid') expect(a.stand.out, id + ' upper arm clear of the body').toBeGreaterThan(b.stand.out);
    }
    if (process.env.POSE_OUT) (await nodeFs()).writeFileSync(process.env.POSE_OUT, rows.join('\n'));
  }, 120000);
});
