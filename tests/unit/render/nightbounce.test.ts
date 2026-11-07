import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  NightBounce, BOUNCE_TIERS, extractBounceSources, interiorDoorSources, buildBounceBuffers, bounceKindOfMaterial,
  setBounceTier, setBounceWet, type BounceSource,
} from '@/render/NightBounce';
import { NightLights } from '@/render/NightLights';

/** A vertical quad in the XY plane at z = zc facing +z (CCW seen from +z). */
function quad(x0: number, x1: number, y0: number, y1: number, zc: number, name: string, flip = false): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  const v = [x0, y0, zc, x1, y0, zc, x1, y1, zc, x0, y1, zc];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.setIndex(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  const m = new THREE.MeshBasicMaterial(); m.name = name;
  return new THREE.Mesh(g, m);
}

const src = (o: Partial<BounceSource> = {}): BounceSource => ({ kind: 'sign', x: 0, y: 3, z: 0, nx: 0, nz: 1, w: 2, r: 1, g: 1, b: 1, s: 1, ...o });

describe('extractBounceSources', () => {
  it('classifies material names', () => {
    expect(bounceKindOfMaterial('sf:sign:0')).toBe('sign');
    expect(bounceKindOfMaterial('storefrontGlass:2')).toBe('glass');
    expect(bounceKindOfMaterial('sf:awning:0')).toBeNull();
    expect(bounceKindOfMaterial('brickRed:0')).toBeNull();
  });

  it('finds a lit sign with its outward normal and width', () => {
    const root = new THREE.Group();
    root.add(quad(10, 12.4, 3, 4, 5, 'sf:sign:1'));
    const out = extractBounceSources(root);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('sign');
    expect(out[0].nz).toBeCloseTo(1, 3);
    expect(out[0].nx).toBeCloseTo(0, 3);
    expect(out[0].w).toBeCloseTo(2.4, 1);
    expect(out[0].x).toBeCloseTo(11.2, 1);
    expect(out[0].y).toBeCloseTo(3.5, 1);
  });

  it('a back-facing winding flips the normal; world transforms are applied', () => {
    const root = new THREE.Group();
    root.position.set(0, 0.15, 0);
    root.add(quad(0, 2, 0.5, 2, 0, 'storefrontGlass:0', true));
    const [s] = extractBounceSources(root);
    expect(s.kind).toBe('glass');
    expect(s.nz).toBeCloseTo(-1, 3);
    expect(s.y).toBeCloseTo(1.25 + 0.15, 1);
  });

  it('ignores horizontal faces, other materials and instanced meshes; reads multi-material groups', () => {
    const root = new THREE.Group();
    root.add(quad(0, 2, 0, 1, 0, 'brickRed:0'));
    const flat = quad(0, 2, 0, 1, 0, 'sf:sign:0'); flat.rotation.x = -Math.PI / 2; root.add(flat);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 9, 1, 0, 9, 1, 1, 9]), 3));
    geo.addGroup(0, 3, 0); geo.addGroup(3, 3, 1);
    const a = new THREE.MeshBasicMaterial(); a.name = 'brickRed:0';
    const b = new THREE.MeshBasicMaterial(); b.name = 'sf:sign:3';
    root.add(new THREE.Mesh(geo, [a, b]));
    root.add(new THREE.InstancedMesh(quad(0, 1, 0, 1, 0, 'x').geometry, quad(0, 1, 0, 1, 0, 'sf:sign:0').material, 2));
    const out = extractBounceSources(root);
    expect(out).toHaveLength(1);
    expect(out[0].z).toBeCloseTo(9, 3);
  });

  it('caps the source count', () => {
    const root = new THREE.Group();
    for (let i = 0; i < 40; i++) root.add(quad(i * 10, i * 10 + 2, 3, 4, 0, 'sf:sign:0'));
    expect(extractBounceSources(root, 10).length).toBeLessThanOrEqual(10);
  });
});

describe('interior doors', () => {
  it('has the unmarked Aftersloth door, the deli and HOME with unit normals', () => {
    const d = interiorDoorSources();
    expect(d).toHaveLength(3);
    for (const s of d) expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 5);
    const club = d.find((s) => s.x === 70)!;
    expect(club.b).toBeGreaterThan(club.g); // violet
  });
});

describe('bounce buffers', () => {
  it('two quads per source, indices in range, tier thinning is deterministic', () => {
    const many = Array.from({ length: 50 }, (_, i) => src({ x: i * 7.3, z: i * 3.1 }));
    const full = buildBounceBuffers(many, BOUNCE_TIERS.medium);
    expect(full.count).toBe(50);
    expect(full.aC.length / 3).toBe(50 * 8);
    expect(Math.max(...full.index)).toBeLessThan(50 * 8);
    const low = buildBounceBuffers(many, BOUNCE_TIERS.low);
    expect(low.count).toBeLessThan(50);
    expect(low.count).toBeGreaterThan(20);
    expect(buildBounceBuffers(many, BOUNCE_TIERS.low).count).toBe(low.count);
  });

  it('the pool sits just above the sidewalk (0.15) and the wash on the source height', () => {
    const b = buildBounceBuffers([src({ y: 3.2 })], BOUNCE_TIERS.medium);
    expect(b.aC[1]).toBeCloseTo(3.2); expect(b.aC[3 * 4 + 1]).toBeCloseTo(0.165);
  });
});

describe('NightBounce node', () => {
  beforeEach(() => { setBounceTier('medium'); setBounceWet(0); });

  it('is one mesh (one draw call), hidden by day, visible and fading in at night', () => {
    const scene = new THREE.Scene();
    const nb = new NightBounce(scene);
    nb.setSources([src(), src({ x: 20 })]);
    nb.update(false, 0.016);
    expect(nb.group.visible).toBe(false);
    for (let i = 0; i < 20; i++) nb.update(true, 0.1);
    expect(nb.group.visible).toBe(true);
    expect(nb.group.children).toHaveLength(1);
    const mat = (nb.group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uNight.value).toBeCloseTo(1, 3);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
  });

  it('phone draws nothing; wetness reaches the shader; tier switch rebuilds without a second mesh', () => {
    const scene = new THREE.Scene();
    const nb = new NightBounce(scene);
    nb.setSources([src()]);
    setBounceTier('phone');
    for (let i = 0; i < 20; i++) nb.update(true, 0.1);
    expect(nb.group.visible).toBe(false);
    setBounceTier('medium'); setBounceWet(0.8);
    for (let i = 0; i < 20; i++) nb.update(true, 0.1);
    const mat = (nb.group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uWet.value).toBeCloseTo(0.8);
    setBounceTier('low');
    nb.update(true, 0.1);
    expect(nb.group.children).toHaveLength(1);
  });

  it('NightLights drives it and adds exactly one object to the scene for it', () => {
    const scene = new THREE.Scene();
    const before = scene.children.length;
    const nl = new NightLights(scene, [], { poolSize: 2 });
    expect(nl.bounce).toBeInstanceOf(NightBounce);
    expect(scene.children.filter((c) => c.name === 'night-bounce')).toHaveLength(1);
    expect(scene.children.length).toBeGreaterThan(before);
    nl.bounce.setSources([src()]);
    for (let i = 0; i < 30; i++) nl.update({ x: 0, z: 0 }, true, 0.1);
    expect(nl.bounce.group.visible).toBe(true);
  });
});
