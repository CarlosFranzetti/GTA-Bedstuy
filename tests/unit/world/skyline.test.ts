import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import {
  FACADE_COLOURS, HIDE_BELOW_FOG_FAR, RING_END, RING_START, SKYLINE_NIGHT_INTENSITY, SkylineMesh,
  buildSkylineGeometry, createSkyline, planSkyline,
} from '@/world/Skyline';

const grid = buildGrid(loadBedstuyData());
const bounds = grid.bounds;
const plan = () => planSkyline(bounds, new Rng('sky-test'));

describe('far skyline', () => {
  it('is deterministic for a seed', () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(plan()));
  });

  it('stands only in the ring outside the modelled blocks', () => {
    for (const b of plan()) {
      const out = Math.max(Math.abs(b.x - (bounds.minX + bounds.maxX) / 2) - (bounds.maxX - bounds.minX) / 2, Math.abs(b.z - (bounds.minZ + bounds.maxZ) / 2) - (bounds.maxZ - bounds.minZ) / 2);
      expect(out).toBeGreaterThanOrEqual(RING_START - 1);
      expect(out).toBeLessThanOrEqual(RING_END + 1);
    }
  });

  it('has colour variety, towers, water tanks and masts', () => {
    const p = plan();
    expect(new Set(p.map((b) => b.colour)).size).toBeGreaterThanOrEqual(4);
    expect(FACADE_COLOURS.length).toBeGreaterThanOrEqual(4);
    expect(FACADE_COLOURS.length).toBeLessThanOrEqual(6);
    expect(p.some((b) => b.tank)).toBe(true);
    expect(p.some((b) => b.mast > 0)).toBe(true);
    expect(p.some((b) => b.h > 50)).toBe(true);
    expect(p.length).toBeGreaterThan(300);
    expect(p.length).toBeLessThan(1500);
  });

  it('is one cheap geometry with finite, in-range attributes', () => {
    const g = buildSkylineGeometry(plan(), bounds);
    const tris = g.index!.count / 3;
    expect(tris).toBeLessThan(60_000);
    for (const name of ['position', 'uv', 'color', 'normal']) {
      for (const v of g.attributes[name].array) expect(Number.isFinite(v)).toBe(true);
    }
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
  });

  it('createSkyline gives one non-shadowing mesh that hides under short fog and lights its windows with the library glass', () => {
    const glass = new THREE.MeshStandardMaterial({ emissiveIntensity: 0 });
    const lib = { get: () => glass } as never;
    const mesh = createSkyline(bounds, lib, new Rng('s'))! as SkylineMesh;
    expect(mesh).toBeInstanceOf(SkylineMesh);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    const scene = new THREE.Scene();
    scene.add(mesh);
    scene.fog = new THREE.Fog(0x888888, 30, 100);
    scene.updateMatrixWorld(true);
    expect(mesh.visible).toBe(false);
    scene.fog = new THREE.Fog(0x888888, 100, HIDE_BELOW_FOG_FAR + 100);
    scene.updateMatrixWorld(true);
    expect(mesh.visible).toBe(true);
    const m = mesh.material as THREE.MeshStandardMaterial;
    expect(m.emissiveIntensity).toBe(0);
    glass.emissiveIntensity = 0.9;
    scene.updateMatrixWorld(true);
    expect(m.emissiveIntensity).toBe(SKYLINE_NIGHT_INTENSITY);
  });
});
