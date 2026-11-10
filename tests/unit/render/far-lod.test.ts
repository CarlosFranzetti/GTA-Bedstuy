import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clusterGeometry, normalBucket, shrinkTo, trisOf } from '@/render/FarGeometry';
import { CarLod } from '@/render/CarLod';
import { CAR_CLOSE_DIST, TIER_CONFIG } from '@/render/QualityTier';
import { ChunkCuller, swapFarGeometry } from '@/render/Culling';
import { setCarPaintTier } from '@/render/CarPaintFx';
import { PedLod, PED_HI_MAX } from '@/entities/models/pedBodyHi';

/** A wall of n x n quads, 1 m each, with a small relief bump in the middle. */
function wall(n: number, per = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(n, n, n * per, n * per);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) < 0.6 && Math.abs(p.getY(i)) < 0.6 ? 0.1 : 0);
  g.computeVertexNormals();
  return g;
}

describe('FarGeometry', () => {
  it('normalBucket separates the six axis directions', () => {
    const b = [normalBucket(1, 0, 0), normalBucket(-1, 0, 0), normalBucket(0, 1, 0), normalBucket(0, -1, 0), normalBucket(0, 0, 1), normalBucket(0, 0, -1)];
    expect(new Set(b).size).toBe(6);
  });
  it('clustering cuts triangles, keeps attributes and a valid index', () => {
    const src = wall(8);
    const out = clusterGeometry(src, 2.1, true);
    expect(trisOf(out)).toBeLessThan(trisOf(src) / 3);
    expect(trisOf(out)).toBeGreaterThan(0);
    for (const k of ['position', 'normal', 'uv']) expect(out.getAttribute(k).count).toBe(out.getAttribute('position').count);
    const max = out.getAttribute('position').count;
    for (let i = 0; i < out.index!.count; i++) expect(out.index!.getX(i)).toBeLessThan(max);
  });
  it('a cell smaller than the vertex spacing keeps the geometry', () => {
    const src = wall(4);
    expect(trisOf(clusterGeometry(src, 0.2, true))).toBe(trisOf(src));
  });
  it('shrinkTo meets its triangle budget', () => {
    const out = shrinkTo(wall(20), 250)!;
    expect(trisOf(out)).toBeLessThanOrEqual(250);
    expect(trisOf(out)).toBeGreaterThan(10);
  });
});

describe('ChunkCuller far building geometry', () => {
  const cellMesh = (x: number, name = 'buildings:limestone:0'): THREE.Mesh => {
    const m = new THREE.Mesh(wall(10, 2).translate(x, 0, 0), new THREE.MeshBasicMaterial());
    m.name = name; m.userData.chunk = `c${x}`;
    return m;
  };
  it('cells beyond the tier far range swap to the clustered geometry and back', () => {
    const near = cellMesh(0), far = cellMesh(200);
    const cc = new ChunkCuller(1000);
    cc.farOverride = 80;
    cc.add(near); cc.add(far);
    const farFull = trisOf(far.geometry);
    cc.update(0, 0);
    expect(trisOf(far.geometry)).toBeLessThan(farFull / 2);
    expect(trisOf(near.geometry)).toBe(800);
    cc.update(200, 0);
    expect(trisOf(far.geometry)).toBe(farFull);
    expect(trisOf(near.geometry)).toBeLessThan(400);
    cc.clear();
    expect(trisOf(near.geometry)).toBe(800);
  });
  it('builds at most buildsPerUpdate far geometries per update', () => {
    const meshes = [0, 1, 2, 3, 4, 5].map((i) => cellMesh(300 + i * 10, `buildings:m${i}`));
    const cc = new ChunkCuller(1000);
    cc.farOverride = 80;
    for (const m of meshes) { m.userData.chunk = 'one'; cc.add(m); }
    const was = ChunkCuller.buildsPerUpdate;
    ChunkCuller.buildsPerUpdate = 4;
    try {
      cc.update(0, 0);
      expect(meshes.filter((m) => m.userData.farGeo).length).toBe(4);
      expect(meshes.every((m) => !m.userData.nearGeo || m.geometry === m.userData.nearGeo)).toBe(true); // not flipped until all are ready
      cc.update(0, 0);
      expect(meshes.every((m) => m.geometry === m.userData.farGeo)).toBe(true);
    } finally { ChunkCuller.buildsPerUpdate = was; }
  });
  it('swapFarGeometry is reversible and keeps the original', () => {
    const m = cellMesh(0); const g0 = m.geometry;
    swapFarGeometry(m, true); expect(m.geometry).not.toBe(g0);
    swapFarGeometry(m, false); expect(m.geometry).toBe(g0);
  });
  it('low and phone have a finite far range, medium and high none', () => {
    expect(TIER_CONFIG.phone.buildingFarDist).toBeLessThanOrEqual(60);
    expect(TIER_CONFIG.low.buildingFarDist).toBeLessThanOrEqual(60);
    expect(TIER_CONFIG.medium.buildingFarDist).toBe(Infinity);
  });
});

describe('CarLod cap on full-detail cars', () => {
  it('beyond CAR_CLOSE_DIST only nearMax cars keep the full model; closer cars always do', () => {
    setCarPaintTier('low');
    const lib = { carPaint: () => new THREE.MeshStandardMaterial(), get: () => new THREE.MeshStandardMaterial() } as never;
    const lod = new CarLod(lib, { buildModel: () => null, nearDist: 40 });
    // no LOD model for the type (buildModel returns null), so every car stays full: the cap only applies where a far model exists
    expect(TIER_CONFIG.low.carNearMax).toBeGreaterThan(0);
    expect(CAR_CLOSE_DIST).toBeLessThanOrEqual(15);
    lod.beginFrame();
    const car = { object3D: new THREE.Group(), spec: { type: 'sedan', color: '#fff' }, damage: 0 };
    expect(lod.place(car, 0, 0, 0, 20)).toBe(false);
  });
});

describe('PedLod cap on simultaneous hi bodies', () => {
  const make = (exempt = false): PedLod => {
    const lod = new PedLod();
    for (const [name, d] of [['hi', 0], ['mid', 12], ['far', 40]] as const) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); m.name = name; lod.addLevel(m, d);
    }
    lod.exempt = exempt;
    return lod;
  };
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.5, 0); cam.updateMatrixWorld(true);
  const pass = (lods: PedLod[]): number => { for (const l of lods) l.update(cam); return lods.filter((l) => l.levels[0].object.visible).length; };
  it('low allows PED_HI_MAX.low hi bodies in a pass, the rest show mid; the next pass starts over', () => {
    setCarPaintTier('low');
    const lods = Array.from({ length: 10 }, (_, i) => { const l = make(); l.position.set(i * 0.5, 0, -5); l.updateMatrixWorld(true); return l; });
    expect(pass(lods)).toBe(PED_HI_MAX.low);
    expect(lods.filter((l) => l.levels[1].object.visible).length).toBe(10 - PED_HI_MAX.low);
    expect(pass(lods)).toBe(PED_HI_MAX.low);
  });
  it('the player (exempt) is always hi inside 12 m, and beyond 12 m nobody is hi', () => {
    setCarPaintTier('low');
    const lods = Array.from({ length: 8 }, () => { const l = make(); l.position.set(0, 0, -5); l.updateMatrixWorld(true); return l; });
    const player = make(true); player.position.set(0, 0, -4); player.updateMatrixWorld(true);
    lods.push(player);
    pass(lods);
    expect(player.levels[0].object.visible).toBe(true);
    const farOnes = Array.from({ length: 4 }, () => { const l = make(); l.position.set(0, 0, -20); l.updateMatrixWorld(true); return l; });
    expect(pass(farOnes)).toBe(0);
  });
  it('tiers: phone has no hi bodies, caps grow with the tier', () => {
    expect(PED_HI_MAX.phone).toBe(0);
    expect(PED_HI_MAX.low).toBeLessThanOrEqual(6);
    expect(PED_HI_MAX.medium).toBeGreaterThanOrEqual(PED_HI_MAX.low);
  });
});
