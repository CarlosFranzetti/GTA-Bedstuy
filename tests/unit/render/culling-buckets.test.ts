import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { loadBedstuyData, buildGrid } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildFurniture, LAMP_HEAD_NAME } from '@/world/FurnitureGen';
import { RenderProxies } from '@/render/AoProxy';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';

function stubLibrary(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const named = (n: string): THREE.Material => { let m = cache.get(n); if (!m) { m = new THREE.MeshBasicMaterial({ name: n }); cache.set(n, m); } return m; };
  return { get: (k) => named(k), awning: (c, t) => named(`awning:${c}:${t}`), sign: (t) => named(`sign:${t}`), carPaint: (c) => named(`car:${c}`), setNight: () => {} };
}

function buildOnce() {
  const data = loadBedstuyData();
  const grid = buildGrid(data);
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
  return buildFurniture(grid, lots, stubLibrary(), new Rng(data.seed).fork('furniture'));
}

describe('furniture instancing buckets (real map)', () => {
  const a = buildOnce();
  const b = buildOnce();

  it('bucket keys and their order are deterministic', () => {
    expect([...a.instanced.keys()]).toEqual([...b.instanced.keys()]);
    for (const [k, bucket] of a.instanced) {
      expect(bucket.matrices).toEqual(b.instanced.get(k)!.matrices);
    }
  });

  it('every kind is one InstancedMesh whose count matches its matrices', () => {
    expect(a.group.children.length).toBe(a.instanced.size);
    for (const c of a.group.children) {
      const im = c as THREE.InstancedMesh;
      expect(im.isInstancedMesh).toBe(true);
      const key = c.name === LAMP_HEAD_NAME ? LAMP_HEAD_NAME : c.name.replace('furniture:', '');
      expect(im.count).toBe(a.instanced.get(key)!.matrices.length / 16);
      expect(im.count).toBeGreaterThan(0);
    }
  });

  it('city-wide draw budget: at most 8 + one per street sign text', () => {
    const signs = [...a.instanced.keys()].filter((k) => k.startsWith('sign:')).length;
    expect(a.group.children.length).toBeLessThanOrEqual(8 + signs);
    expect(a.group.children.length).toBeLessThanOrEqual(20);
  });

  it('one lamp and one lamp head per reported lamp spot; matrices are finite and sit inside the map', () => {
    expect(a.instanced.get('lamp')!.matrices.length / 16).toBe(a.lamps.length);
    expect(a.instanced.get(LAMP_HEAD_NAME)!.matrices.length / 16).toBe(a.lamps.length);
    for (const bucket of a.instanced.values()) {
      for (let i = 0; i < bucket.matrices.length; i += 16) {
        for (let j = 0; j < 16; j++) expect(Number.isFinite(bucket.matrices[i + j])).toBe(true);
        expect(Math.abs(bucket.matrices[i + 12])).toBeLessThan(1000);
        expect(Math.abs(bucket.matrices[i + 14])).toBeLessThan(1000);
      }
    }
  });

  it('proxy expansion of the whole furniture group keeps every instanced triangle', () => {
    let expected = 0;
    for (const bucket of a.instanced.values()) {
      const g = bucket.geometry;
      expected += (g.index ? g.index.count : g.getAttribute('position').count) / 3 * (bucket.matrices.length / 16);
    }
    const root = new THREE.Group();
    root.add(a.group);
    const proxies = new RenderProxies();
    const build = proxies.addStatic([root], 100, 100);
    expect(build.triangles).toBe(expected);
    for (const p of build.proxies) {
      const bb = p.geometry.boundingBox!;
      const sphere = p.geometry.boundingSphere!;
      expect(sphere.radius).toBeGreaterThan(0);
      expect(bb.max.y).toBeLessThan(12); // lamps are 8 m, tree canopies ~5.6 m
    }
  });
});
