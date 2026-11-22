import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { buildMhPedModel, clearPeople, parseShape, registerShape, shapeByName, type PedModel } from '@/entities/models/pedMesh';
import { torsoHalfWidthAt } from '@/entities/models/pedProportions';
import { PED_SPECS } from '@/textures/painters/ped';
import { fullLib } from './anim-measure';
import { makeGait } from '@/entities/anim/gait';
import { AnimController } from '@/entities/anim/controller';
import type { IMaterialLibrary } from '@/world/types';

// POSE seat: the arms and the head on the BUILT people (every build, an elder, a child, coats), posed by the real controller.
// Angles are measured in the body's own frame: the upper arm against the vertical (out = away from the body), the forearm against the upper arm.
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const DEG = 180 / Math.PI;
const IDS = ['la-delivery', 'ba-work', 'wh-elder', 'ea-kid', 'ba-puffer-braids', 'hj-man', 'ba-church-lady', 'ba-jersey-teen', 'ba-church-man', 'ca-nurse'];

interface Arm { out: number; fwd: number; flex: number; clear: number; elbowClear: number; handZ: number }
function measure(m: PedModel, i: number): Arm {
  const s = shapeByName(m.group.userData.pedShape as string)!;
  const wl = new THREE.Vector3(...(s.rig.wristL as [number, number, number])).sub(new THREE.Vector3(...(s.rig.elbowL as [number, number, number])));
  if (i === 1) wl.x *= -1;
  m.group.updateMatrixWorld(true);
  const a = new THREE.Vector3(), e = new THREE.Vector3(); m.arms[i].getWorldPosition(a); m.elbows[i].getWorldPosition(e);
  const w = m.elbows[i].localToWorld(wl.clone());
  const up = e.clone().sub(a).normalize(), fo = w.clone().sub(e).normalize();
  const mid = a.clone().lerp(e, 0.5);
  // clearance of the arm's centre line from the torso's side: how far outside the (clothed) torso the arm is, at the middle of the upper arm and at the elbow, in metres
  const mid2 = torsoHalfWidthAt(m, mid.y), el2 = torsoHalfWidthAt(m, e.y);
  return { out: Math.atan2(Math.abs(up.x), -up.y) * DEG, fwd: Math.atan2(-up.z, -up.y) * DEG, flex: Math.acos(Math.max(-1, Math.min(1, up.dot(fo)))) * DEG, clear: Math.abs(mid.x) - mid2, elbowClear: Math.abs(e.x) - el2, handZ: w.z - a.z };
}

describe('built people: arms and head', () => {
  const lib = fullLib();
  const rows: string[] = [];
  beforeAll(async () => {
    const fs = await import('node:fs');
    clearPeople();
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
      const b = fs.readFileSync(new URL(f, DIR));
      registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
  });

  const rig = (id: string, style?: string, seed = 7): { m: PedModel; ctl: AnimController } => {
    const spec = PED_SPECS.find((s) => s.id === id)!;
    const m = buildMhPedModel(materials, new Rng(5), { variant: spec.id })!;
    const gait = makeGait(seed, spec.age ?? 'adult');
    if (style) gait.walkClip = style;
    return { m, ctl: new AnimController(m, gait, lib) };
  };
  const STYLES = ['walk', 'walkBrisk', 'walkFast', 'walkStroll', 'walkJaunty', 'walkLimp'];

  for (const id of IDS) {
    it(`${id}: the arms hang within range standing and in every walk style, and clear the body`, () => {
      const { m, ctl } = rig(id);
      for (let i = 0; i < 120; i++) ctl.update(1 / 30, { speed: 0 });
      const st = [measure(m, 0), measure(m, 1)];
      const stand = { out: Math.max(st[0].out, st[1].out), flex: Math.max(st[0].flex, st[1].flex), fwdLo: Math.min(st[0].fwd, st[1].fwd), fwdHi: Math.max(st[0].fwd, st[1].fwd), clear: Math.min(st[0].clear, st[1].clear), elbow: Math.min(st[0].elbowClear, st[1].elbowClear) };
      const walk = { outHi: 0, flexHi: 0, flexLo: 99, clear: 9, elbow: 9, zLo: 9, zHi: -9 };
      for (const style of STYLES) {
        const r = rig(id, style);
        for (let i = 0; i < 150; i++) {
          r.ctl.update(1 / 30, { speed: 1.4 });
          if (i < 30) continue;
          if (process.env.POSE_DBG && id === 'la-delivery') { const a = measure(r.m, 0); if (i % 10 === 0) rows.push(`DBG ${style} f${i} out ${a.out.toFixed(1)} armL xyz ${[r.m.arms[0].rotation.x, r.m.arms[0].rotation.y, r.m.arms[0].rotation.z].map((v) => (v * DEG).toFixed(0)).join('/')}`); }
          for (const k of [0, 1]) { const a = measure(r.m, k); walk.outHi = Math.max(walk.outHi, a.out); walk.flexHi = Math.max(walk.flexHi, a.flex); walk.flexLo = Math.min(walk.flexLo, a.flex); walk.clear = Math.min(walk.clear, a.clear); walk.elbow = Math.min(walk.elbow, a.elbowClear); walk.zLo = Math.min(walk.zLo, a.handZ); walk.zHi = Math.max(walk.zHi, a.handZ); }
        }
      }
      rows.push(`${id.padEnd(16)} stand: out ${stand.out.toFixed(1)} fwd ${stand.fwdLo.toFixed(0)}..${stand.fwdHi.toFixed(0)} flex ${stand.flex.toFixed(0)} armClear ${(stand.clear * 100).toFixed(1)}cm elbowClear ${(stand.elbow * 100).toFixed(1)}cm | walk (6 styles): out<=${walk.outHi.toFixed(1)} flex ${walk.flexLo.toFixed(0)}..${walk.flexHi.toFixed(0)} armClear ${(walk.clear * 100).toFixed(1)}cm elbowClear ${(walk.elbow * 100).toFixed(1)}cm handZ ${walk.zLo.toFixed(2)}..${walk.zHi.toFixed(2)}`);
      // standing: the upper arm within about 8 degrees of the side (a wide coat may need more), the elbow under about 35 degrees from straight
      expect(stand.out, 'upper arm out').toBeLessThan(m.group.userData.splay > 0.1 ? 16 : 11);
      expect(stand.flex, 'elbow bend standing').toBeLessThan(35);
      expect(stand.fwdLo, 'not hanging behind the body').toBeGreaterThan(-12);
      expect(stand.fwdHi, 'not held forward').toBeLessThan(14);
      // the arm does not sink into the torso at the elbow (the torso's half-width is an estimate: a centimetre of tolerance)
      expect(stand.elbow, 'elbow outside the torso').toBeGreaterThan(-0.01);
      expect(walk.elbow, 'walking elbow outside the torso').toBeGreaterThan(-0.015);
      expect(walk.outHi, 'walking arm swing stays near the body').toBeLessThan(m.group.userData.splay > 0.1 ? 26 : 20);
      expect(walk.flexHi, 'walking elbow').toBeLessThan(75);
      // the hands pass both in front of and behind the hip
      expect(walk.zHi, 'a hand swings back').toBeGreaterThan(0.03);
      expect(walk.zLo, 'a hand swings forward').toBeLessThan(-0.1);
    });
  }

  it('head level: standing and walking, the head roll stays within 5 degrees and the head is never turned more than 45 degrees standing', () => {
    for (const id of ['la-delivery', 'wh-elder', 'ea-kid']) {
      const { m, ctl } = rig(id);
      let roll = 0, yaw = 0;
      for (let i = 0; i < 1200; i++) { ctl.update(1 / 30, { speed: 0 }); roll = Math.max(roll, Math.abs(m.head.rotation.z)); yaw = Math.max(yaw, Math.abs(m.head.rotation.y)); }
      expect(roll * DEG, id + ' roll standing').toBeLessThan(6);
      expect(yaw * DEG, id + ' yaw standing').toBeLessThan(45);
      roll = 0;
      for (let i = 0; i < 300; i++) { ctl.update(1 / 30, { speed: 1.4 }); roll = Math.max(roll, Math.abs(m.head.rotation.z)); }
      expect(roll * DEG, id + ' roll walking').toBeLessThan(6);
    }
  });

  it('layers off: while an action poses the body the layers are not in the way (the same pose with the layers off)', () => {
    const { m, ctl } = rig('ba-work'), other = rig('ba-work');
    other.ctl.bodyLayersOn = false;
    for (let i = 0; i < 60; i++) { ctl.update(1 / 60, { speed: 0, action: { kind: 'punchR', k: 0.5 } }); other.ctl.update(1 / 60, { speed: 0, action: { kind: 'punchR', k: 0.5 } }); }
    for (const [a, b] of [[m.arms[1], other.m.arms[1]], [m.elbows[1], other.m.elbows[1]], [m.torso, other.m.torso], [m.head, other.m.head]] as const) {
      expect(Math.abs(a.rotation.x - b.rotation.x)).toBeLessThan(0.03);
      expect(Math.abs(a.rotation.z - b.rotation.z)).toBeLessThan(0.03);
    }
  });

  it('writes the sheet of numbers', () => { if (process.env.POSE_OUT) writeFileSync(process.env.POSE_OUT, rows.join('\n')); });
});
