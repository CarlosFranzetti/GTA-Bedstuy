import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { buildBuildings } from '@/world/BuildingGen';
import type { SpecLot } from '@/world/BuildingGen';
import { atlasUV, registerFacadeAtlas, resetFacadeAtlases } from '@/world/buildings/facadeTexture';
import type { IMaterialLibrary } from '@/world/types';

function mats(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const named = (n: string): THREE.Material => { let m = cache.get(n); if (!m) { m = new THREE.MeshBasicMaterial({ name: n }); cache.set(n, m); } return m; };
  return { get: (k, v) => named(`${k}:${v ?? 0}`), awning: (c, t) => named(`a${c}${t}`), sign: (t) => named(t), carPaint: (c) => named(c), setNight: () => {} };
}

const lot = (facadeTexture?: string): SpecLot => ({
  id: 'L1', blockId: 'b', side: 'N', frontA: { x: 0, z: 0 }, frontB: { x: 6, z: 0 }, width: 6, depth: 14, outward: { x: 0, z: 1 },
  type: 'brownstone', corner: false,
  spec: { floors: 3, widthM: 6, family: 'brownstone', stoop: { present: true, heightM: 1.5 }, cornice: 'bracket', use: 'residential', facadeTexture },
});

afterEach(() => resetFacadeAtlases());

describe('facade photo atlas', () => {
  it('maps the atlas once across the front wall (no tiling)', () => {
    const mat = new THREE.MeshStandardMaterial({ name: 'facade:facade-L1' });
    registerFacadeAtlas({ meta: { texture: 'facade-L1', floors: 3, groundShare: 0.35, widthM: 6, heightM: 12, atlasPx: 2048 }, color: 'x.jpg' }, mat);
    const { group } = buildBuildings([lot('facade-L1')], mats(), new Rng(1));
    const mesh = group.children.find((c) => c.name === 'buildings:facade:facade-L1') as THREE.Mesh | undefined;
    expect(mesh).toBeDefined();
    const uv = mesh!.geometry.getAttribute('uv');
    let umin = 9, umax = -9, vmin = 9, vmax = -9;
    for (let i = 0; i < uv.count; i++) { umin = Math.min(umin, uv.getX(i)); umax = Math.max(umax, uv.getX(i)); vmin = Math.min(vmin, uv.getY(i)); vmax = Math.max(vmax, uv.getY(i)); }
    expect(umin).toBeGreaterThanOrEqual(0); expect(umax).toBeLessThanOrEqual(1); expect(umax).toBeGreaterThan(0.9);
    expect(vmin).toBeGreaterThanOrEqual(0); expect(vmax).toBeLessThanOrEqual(1); expect(vmax).toBeGreaterThan(0.5);
    for (let i = 0; i < uv.count; i++) expect(Number.isFinite(uv.getX(i) + uv.getY(i))).toBe(true);
  });

  it('keeps the procedural facade when the atlas is missing', () => {
    const { group } = buildBuildings([lot('facade-nope')], mats(), new Rng(1));
    expect(group.children.some((c) => c.name.startsWith('buildings:facade:'))).toBe(false);
    expect(group.children.some((c) => c.name.startsWith('buildings:brownstone'))).toBe(true);
  });

  it('atlasUV runs 0..1 across width and photo height', () => {
    const f = atlasUV({ texture: 't', floors: 3, groundShare: 0.3, widthM: 6, heightM: 10 }, 6);
    expect(f(0, 0)).toEqual([0, 0]);
    expect(f(6, 10)).toEqual([1, 1]);
    expect(f(3, 5)).toEqual([0.5, 0.5]);
  });
});
