import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
// @ts-ignore the project's node typings lack mkdirSync
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS } from '@/textures/painters/ped';
import { pickPedVariant } from '@/entities/models/pedBody';
import { pickWardrobeVariant } from '@/textures/painters/pedWardrobe';
import { clearPeople, parseShape, registerShape, shapeFor, dressLod, topHemY, buildMhPedModel, type MhShape, type MhLod } from '@/entities/models/pedMesh';
import { bodyTypeId } from '@/entities/models/pedBodyTypes';
import { notArm } from '@/entities/models/pedCuts';
import { AnimController } from '@/entities/anim/controller';
import { makeGait } from '@/entities/anim/gait';
import { fullLib } from './anim-measure';
import type { IMaterialLibrary } from '@/world/types';
const DIR = 'src/assets/models/people/';
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
});
const TYPES = ['slim', 'heavy', 'short-stocky', 'elder', 'kid'];
export function pick(): string[] {
  const by: Record<string, string[]> = {};
  for (const sp of PED_SPECS) if (sp.role === 'civilian') (by[bodyTypeId(sp)] ??= []).push(sp.id);
  return TYPES.map((t) => (by[t] ?? [])[0]).filter(Boolean);
}
const deg = (r: number): number => (r * 180) / Math.PI;
const ageBand = (a?: string): 'kid' | 'teen' | 'adult' | 'old' => (a === 'kid' ? 'kid' : a === 'teen' ? 'teen' : a === 'old' ? 'old' : 'adult');
const W = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());
export function standKnee(id: string, lock: boolean): { knee: number; bone: number; sole: number } {
  const lib = fullLib();
  const v = PED_SPECS.findIndex((s) => s.id === id), spec = PED_SPECS[v];
  const m = buildMhPedModel(materials, new Rng(v + 1), { variant: v })!;
  const ctl = new AnimController(m, makeGait(v * 7 + 3, ageBand(spec.age)), lib);
  ctl.footLockOn = lock; ctl.setIdle(null, false);
  for (let k = 0; k < 90; k++) ctl.update(1 / 30, { speed: 0 });
  m.group.updateMatrixWorld(true);
  let kb = 0, bone = 0, sole = 0;
  for (let s = 0; s < 2; s++) { const a = W(m.legs[s]), k = W(m.knees[s]), an = W(m.ankles![s]); kb += deg(k.clone().sub(a).angleTo(an.clone().sub(k))) / 2; bone += -deg(m.knees[s].rotation.x) / 2; sole += (W(m.ankles![s]).y) / 2; }
  return { knee: kb, bone, sole };
}
describe('GAIT second shift: standing legs', () => {
  it('a standing person has nearly straight knees with the foot lock on (was 21 degrees)', () => {
    const rows: number[] = [];
    for (const id of pick()) { const a = standKnee(id, true); rows.push(a.knee); expect(a.knee, id).toBeLessThan(10); }
    expect(rows.reduce((x, y) => x + y, 0) / rows.length).toBeLessThan(8);
  });
});
