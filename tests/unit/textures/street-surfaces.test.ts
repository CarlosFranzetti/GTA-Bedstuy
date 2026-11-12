import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TREE_FORMS, treeFormOf, treePartsFor, treeStyleFor } from '@/world/data/streetTrees';
import { junctionVertexInfo, roadClassCode, roadVertexInfo, seedOf, setUniformRoadInfo, sidewalkVertexInfo } from '@/textures/roadInfo';
import { ASPHALT_GLSL, SIDEWALK_GLSL } from '@/textures/streetShader';

describe('street tree forms', () => {
  it('maps the census species onto four distinct forms', () => {
    expect(new Set([1, 2, 3, 4].map((s) => treeFormOf(s).name)).size).toBe(4);
    expect(TREE_FORMS.map((f) => f.name)).toEqual(['plane', 'honeylocust', 'pinoak', 'pear']);
  });
  it('never draws more than three canopy clouds (the old model drew two or three)', () => {
    for (let sp = 0; sp < 9; sp++) for (let u = 0; u < 1; u += 0.1) {
      const style = { dbhIn: 12, species: sp, scale: 1, canopy: 1 };
      expect(treePartsFor(style, 1.4, u, 0.3).clouds.length).toBeLessThanOrEqual(3);
      expect(treePartsFor(style, 1.4, u, 0.3).clouds.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('forms differ in silhouette: pear is taller and narrower than honey locust', () => {
    const st = (species: number) => ({ dbhIn: 12, species, scale: 1, canopy: 1 });
    const pear = treePartsFor(st(3), 1.4, 0.9, 0.5), hl = treePartsFor(st(2), 1.4, 0.9, 0.5);
    expect(pear.clouds[0][4]).toBeGreaterThan(hl.clouds[0][4] * 1.5);
    expect(pear.trunk[0]).toBeLessThan(hl.trunk[0]);
  });
  it('is deterministic with the census style', () => {
    const a = treeStyleFor('hart', 0.3, 0.6, 0.2), b = treeStyleFor('hart', 0.3, 0.6, 0.2);
    expect(a).toEqual(b);
  });
});

describe('road vertex info', () => {
  it('encodes class and seed in one value and keeps them separable', () => {
    const i = roadVertexInfo(6, roadClassCode('avenue'), 0.42, 0, 100);
    expect(Math.floor(i[1])).toBe(1);
    expect(i[1] - 1).toBeCloseTo(0.42, 5);
    expect(roadClassCode('highway')).toBe(2);
    expect(junctionVertexInfo(0, 0.2)[0]).toBe(0);
    expect(sidewalkVertexInfo(2, 0.5)[0]).toBe(1);
    const s = seedOf('hart:1');
    expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(1);
  });
  it('writes a 4-float colour attribute for every vertex', () => {
    const g = setUniformRoadInfo(new THREE.PlaneGeometry(1, 1), [6, 0.3, 0, 50]);
    const c = g.getAttribute('color');
    expect(c.itemSize).toBe(4);
    expect(c.count).toBe(4);
    expect(c.getX(3)).toBe(6);
  });
  it('shader blocks only use road space when the vertex alpha channel exists', () => {
    expect(ASPHALT_GLSL).toContain('#ifdef USE_COLOR_ALPHA');
    expect(SIDEWALK_GLSL).toContain('#ifdef USE_COLOR_ALPHA');
  });
});
