import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, peopleReady, type MhShape } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';
import { ClipLibrary } from '@/entities/anim/library';
import { decodePack } from '@/entities/anim/clipPack';
import { makeGait } from '@/entities/anim/gait';
import { AnimController, PED_ONESHOTS } from '@/entities/anim/controller';
import type { IMaterialLibrary } from '@/world/types';

// Every shipped person (all body types and ages), posed by the real controller: feet on the ground, thighs and spine within walking range.
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
type Fs = { readFileSync(p: URL | string): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }; readdirSync(p: URL): string[] };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);

describe('every body type through idle, walk, run and turn', () => {
  const lib = ClipLibrary.fromCore();
  beforeAll(async () => {
    clearPeople();
    const fs = await nodeFs();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
    lib.add(decodePack(new Uint8Array(fs.readFileSync('public/anim/street.bin').buffer.slice(0) as ArrayBuffer)));
  });

  const scenes: Array<{ name: string; speed: number; yaw: number; thigh: number; lift: number }> = [
    { name: 'idle', speed: 0, yaw: 0, thigh: 0.5, lift: 0.06 },
    { name: 'walk', speed: 1.2, yaw: 0, thigh: 0.95, lift: 0.08 },
    { name: 'run', speed: 4.5, yaw: 0, thigh: 1.15, lift: 0.22 },
    { name: 'turn', speed: 0, yaw: 2.6, thigh: 0.9, lift: 0.08 },
  ];

  it('the people loaded', () => { expect(peopleReady()).toBe(true); });

  for (const sc of scenes) {
    it(`${sc.name}: the lowest point of the body stays on the ground, thighs never reach hip height, hips stay a leg's length up`, () => {
      let tested = 0;
      for (const spec of PED_SPECS) {
        const m = buildMhPedModel(materials, new Rng(5), { variant: spec.id });
        if (!m) continue;
        tested++;
        const ctl = new AnimController(m, makeGait(tested * 13, spec.age ?? 'adult'), lib);
        const hipY = m.legs[0].position.y * m.group.scale.y;
        for (let i = 0; i < 90; i++) {
          ctl.update(1 / 30, { speed: sc.speed, yawRate: sc.yaw });
          if (i < 20 || i % 5) continue;
          m.group.updateMatrixWorld(true);
          // sole height: the foot sits on the knee bone's shin, ankle 0.075 above the sole in this rig
          const knee = new THREE.Vector3(); m.knees[0].getWorldPosition(knee);
          const knee2 = new THREE.Vector3(); m.knees[1].getWorldPosition(knee2);
          const low = Math.min(knee.y, knee2.y);
          const hips = new THREE.Vector3(); m.legs[0].getWorldPosition(hips);
          const kneeRestY = (m.legs[0].position.y - Math.abs(m.knees[0].position.y)) * m.group.scale.y;
          // the lower knee is never far above or below where a standing knee is (a skirt-clad woman once floated with her thighs up)
          expect(low, `${spec.id} ${sc.name} frame ${i}: knee height ${low.toFixed(2)} vs standing ${kneeRestY.toFixed(2)}`).toBeGreaterThan(kneeRestY - 0.3);
          expect(low - kneeRestY, `${spec.id} ${sc.name} lifted`).toBeLessThan(sc.lift + 0.12);
          expect(hips.y, `${spec.id} ${sc.name} hip height`).toBeGreaterThan(hipY * 0.8);
          expect(hips.y, `${spec.id} ${sc.name} hip height`).toBeLessThan(hipY * 1.08);
          for (const l of m.legs) expect(Math.abs(l.rotation.x), `${spec.id} ${sc.name} thigh pitch`).toBeLessThan(sc.thigh);
          expect(Math.abs(m.torso.rotation.x), `${spec.id} ${sc.name} spine`).toBeLessThan(sc.name === 'idle' ? 0.2 : sc.name === 'walk' ? 0.3 : 0.65); // upright: 11 degrees standing, 17 walking
          expect(Math.abs(m.hips.rotation.x), `${spec.id} ${sc.name} pelvis`).toBeLessThan(0.65);
        }
      }
      expect(tested).toBeGreaterThan(20);
    });
  }

  it('the one-shots pedestrians play (startle flinch, corner turns, stops, run starts) never bend or lift any body type out of its walking range', () => {
    let tested = 0;
    for (const spec of PED_SPECS) {
      const m = buildMhPedModel(materials, new Rng(9), { variant: spec.id });
      if (!m) continue;
      tested++;
      const ctl = new AnimController(m, makeGait(tested * 7, spec.age ?? 'adult'), lib);
      const hipY = m.legs[0].position.y * m.group.scale.y;
      const kneeRest = (m.legs[0].position.y - Math.abs(m.knees[0].position.y)) * m.group.scale.y;
      const script: Array<{ t: number; speed: number; yaw?: number; shot?: boolean }> = [];
      for (let i = 0; i < 30; i++) script.push({ t: i, speed: 0 });
      script.push({ t: 30, speed: 0, shot: true });
      for (let i = 31; i < 70; i++) script.push({ t: i, speed: 0 });
      for (let i = 70; i < 130; i++) script.push({ t: i, speed: 1.2, yaw: i % 25 < 6 ? 3 : 0 });
      for (let i = 130; i < 170; i++) script.push({ t: i, speed: 0 }); // stop
      for (let i = 170; i < 230; i++) script.push({ t: i, speed: Math.min(4.5, (i - 170) * 0.3) }); // run-up
      for (const st of script) {
        if (st.shot) expect(ctl.playOnce('flinch', PED_ONESHOTS.flinch)).toBe(true); // the captured duck, at the strength pedestrians get
        ctl.update(1 / 30, { speed: st.speed, yawRate: st.yaw ?? 0 });
        m.group.updateMatrixWorld(true);
        const k1 = new THREE.Vector3(), k2 = new THREE.Vector3(), h = new THREE.Vector3();
        m.knees[0].getWorldPosition(k1); m.knees[1].getWorldPosition(k2); m.legs[0].getWorldPosition(h);
        const low = Math.min(k1.y, k2.y);
        const where = `${spec.id} t${st.t}`;
        expect(Math.abs(m.torso.rotation.x), where + ' spine').toBeLessThan(0.65);
        expect(Math.abs(m.hips.rotation.x), where + ' pelvis').toBeLessThan(0.65);
        expect(low - kneeRest, where + ' lifted').toBeLessThan(0.34);
        expect(low - kneeRest, where + ' sunk').toBeGreaterThan(-0.3);
        expect(h.y, where + ' hips').toBeGreaterThan(hipY * 0.8);
        expect(h.y, where + ' hips').toBeLessThan(hipY * 1.08);
        for (const l of m.legs) expect(Math.abs(l.rotation.x), where + ' thigh').toBeLessThan(1.15);
      }
    }
    expect(tested).toBeGreaterThan(20);
  });

  it('and the whole captured duck would have bent a pedestrian double (why the flinch is scaled down)', () => {
    const spec = PED_SPECS[0];
    const m = buildMhPedModel(materials, new Rng(9), { variant: spec.id })!;
    const ctl = new AnimController(m, makeGait(1), lib);
    ctl.playOnce('flinch', { amp: 1, from: 0.12, to: 0.75, rate: 1.7 });
    let worst = 0;
    for (let i = 0; i < 40; i++) { ctl.update(1 / 30, { speed: 0 }); worst = Math.max(worst, Math.abs(m.torso.rotation.x)); }
    expect(worst).toBeGreaterThan(0.9);
  });
});
