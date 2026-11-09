import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { animateWalk } from '@/entities/models/humanModel';
import {
  CIVILIAN_COUNT, PED_SPECS, PED_VARIANT_COUNT, buildPedModel, paintPedCanvas, pedMaterial, pickPedVariant, setPedDayContext, variantGeo,
} from '@/entities/models/pedBody';
import { ProceduralCharacterSource, resolveCharacterSource, GltfCharacterSource } from '@/entities/models/gltf/CharacterSource';
import { Pedestrian } from '@/entities/Pedestrian';
import { Player } from '@/entities/Player';
import type { IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshStandardMaterial(), carPaint: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
const meshes = (o: THREE.Object3D): THREE.Mesh[] => { const out: THREE.Mesh[] = []; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh); }); return out; };

describe('GTA3 people (pedBody)', () => {
  it('every variant is chunky low poly: 600 to 900 triangles, 11 meshes, one material', () => {
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const m = buildPedModel(materials, new Rng(v + 1), { variant: v, heightScale: 1 });
      const ms = meshes(m.group);
      const tris = ms.reduce((n, x) => n + x.geometry.attributes.position.count / 3, 0);
      expect(tris, PED_SPECS[v].id).toBeGreaterThanOrEqual(600);
      expect(tris, PED_SPECS[v].id).toBeLessThanOrEqual(900);
      expect(m.triangles).toBe(tris);
      expect(ms.length).toBe(11);
      expect(new Set(ms.map((x) => x.material)).size).toBe(1);
    }
  });

  it('stands on the ground, 1.6 to 1.95 m for adults, kids shorter, forward is -z, shoulders wider than hips', () => {
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const spec = PED_SPECS[v];
      const m = buildPedModel(materials, new Rng(3), { variant: v });
      const bb = new THREE.Box3().setFromObject(m.group);
      expect(bb.min.y).toBeGreaterThan(-0.02);
      expect(bb.min.y).toBeLessThan(0.03);
      if (spec.build === 'kid') expect(bb.max.y).toBeLessThan(1.5); else { expect(bb.max.y, spec.id).toBeGreaterThan(1.6); expect(bb.max.y, spec.id).toBeLessThan(2.0); }
      expect(m.legs.length).toBe(2); expect(m.arms.length).toBe(2); expect(m.knees.length).toBe(2); expect(m.elbows.length).toBe(2);
      // nose and toes point to -z: the head and shoe boxes extend further toward -z than +z around their centres
      const skull = m.head.getObjectByName('skull') as THREE.Mesh;
      skull.geometry.computeBoundingBox();
      expect(skull.geometry.boundingBox!.min.z).toBeLessThan(-0.1);
      const shoeBox = new THREE.Box3().setFromObject(m.knees[0]);
      expect(Math.abs(shoeBox.min.z)).toBeGreaterThan(Math.abs(shoeBox.max.z));
      const chest = new THREE.Box3().setFromObject(m.torso.getObjectByName('chest')!);
      const hips = new THREE.Box3().setFromObject(m.hips);
      if (spec.bottom.kind !== 'skirt') expect(chest.max.x - chest.min.x).toBeGreaterThan((hips.max.x - hips.min.x) * 0.95);
      expect(m.arms[0].position.x).toBeLessThan(0);
    }
  });

  it('big hands and blocky shoes: the hand is wider than a 5 cm wrist and the shoe is longer than 25 cm', () => {
    const m = buildPedModel(materials, new Rng(5), { variant: 0, heightScale: 1 });
    const hand = new THREE.Box3().setFromObject(m.elbows[1].getObjectByName('handR')!);
    expect(hand.max.y - hand.min.y).toBeGreaterThan(0.38);
    const shoe = new THREE.Box3().setFromObject(m.knees[0].getObjectByName('shin')!);
    expect(shoe.max.z - shoe.min.z).toBeGreaterThan(0.25);
  });

  it('shares geometry per variant and keeps the walk and idle rig API (animateWalk, pivots)', () => {
    const a = buildPedModel(materials, new Rng(1), { variant: 2 });
    const b = buildPedModel(materials, new Rng(9), { variant: 2 });
    expect(a.hips.children.length + (a.hips as THREE.Mesh).geometry.id).toBe(b.hips.children.length + (b.hips as THREE.Mesh).geometry.id);
    expect((a.torso.getObjectByName('chest') as THREE.Mesh).geometry).toBe((b.torso.getObjectByName('chest') as THREE.Mesh).geometry);
    expect(variantGeo(2)).toBe(variantGeo(2));
    animateWalk(a, 1.2, 1);
    expect(a.legs[0].rotation.x).not.toBe(0);
    expect(a.legs[0].rotation.x).toBeCloseTo(-a.legs[1].rotation.x, 6);
    expect(a.arms[0].rotation.x).toBeCloseTo(-a.legs[0].rotation.x * 0.9, 5);
    // the feet stay above the ground while walking
    a.group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(a.group).min.y).toBeGreaterThan(-0.1);
  });

  it('textures the body from the atlas UVs (all inside 0..1) and paints a canvas atlas', () => {
    const m = buildPedModel(materials, new Rng(1), { variant: 5 });
    for (const x of meshes(m.group)) {
      const uv = x.geometry.attributes.uv.array as Float32Array;
      for (let i = 0; i < uv.length; i++) { expect(uv[i]).toBeGreaterThanOrEqual(0); expect(uv[i]).toBeLessThanOrEqual(1); }
      expect(x.geometry.attributes.normal.count).toBe(x.geometry.attributes.position.count);
    }
    // without a 2D canvas (jsdom) the variant falls back to a flat colour but keeps its name
    const mat = pedMaterial(materials, 5);
    expect(mat.name).toBe(`ped:${PED_SPECS[5].id}`);
    expect(paintPedCanvas(5, () => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).toBeNull();
  });

  it('picks civilians only, favours church clothes on a Sunday late morning', () => {
    const n = 4000;
    const church = PED_SPECS.map((s, i) => (s.sunday ? i : -1)).filter((i) => i >= 0);
    const count = (hour: number): number => { const r = new Rng(77); let c = 0; for (let i = 0; i < n; i++) { const v = pickPedVariant(r, hour, true); expect(v).toBeLessThan(CIVILIAN_COUNT); if (church.includes(v)) c++; } return c; };
    expect(count(11)).toBeGreaterThan(count(20) * 2.2);
    const r2 = new Rng(77); let c2 = 0; for (let i = 0; i < n; i++) if (church.includes(pickPedVariant(r2, 11, false))) c2++;
    expect(c2).toBeLessThan(count(11) / 2);
    setPedDayContext(12, true);
    const a = new Rng(5), b = new Rng(5);
    expect(pickPedVariant(a)).toBe(pickPedVariant(b, 12, true));
  });
});

describe('default people and the VITE_GLTF_PEDS gate', () => {
  it('pedestrians, the player and the fallback source are the GTA3 people by default', () => {
    expect(Pedestrian.characterSource).toBeNull();
    expect(Player.characterSource).toBeNull();
    const proc = new ProceduralCharacterSource(materials, new Rng(1));
    const rig = proc.instantiate(3);
    expect(rig.group.userData.pedVariant).toBe(PED_SPECS[3].id);
    expect(rig.height).toBeGreaterThan(1.5);
  });

  it('resolveCharacterSource gives the procedural people unless VITE_GLTF_PEDS=1 bundles the glTF files', async () => {
    expect(import.meta.env.VITE_GLTF_PEDS).toBeUndefined();
    const src = await resolveCharacterSource(materials, new Rng(1));
    expect(src).toBeInstanceOf(ProceduralCharacterSource);
    expect(src).not.toBeInstanceOf(GltfCharacterSource);
  });

  it('mirrors the Kenney car gate: the glob sits behind the flag so the .glb files are not bundled otherwise', async () => {
    const spec: string = 'node:fs';
    const fs = (await import(/* @vite-ignore */ spec)) as { readFileSync(p: URL, enc: string): string };
    const text = fs.readFileSync(new URL('../../../src/entities/models/gltf/CharacterSource.ts', import.meta.url), 'utf8');
    expect(text).toMatch(/VITE_GLTF_PEDS === '1'\s*\n?\s*\? import\.meta\.glob\('@\/assets\/models\/character\*\.glb'/);
    expect(text).toMatch(/:\s*\{\}\)\s*as Record<string, string>/);
  });
});
