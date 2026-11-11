import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLotsDetailed, type RealLot } from '@/world/roadnet/lotsReal';
import { buildRealBuildings, fitFootprint, specForRealLot } from '@/world/roadnet/buildingsReal';
import { chunkLayoutFromBounds } from '@/world/roadnet/chunksReal';

class StubMaterials implements IMaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private mk(k: string): THREE.Material {
    let m = this.cache.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.cache.set(k, m); }
    return m;
  }
  get(key: MaterialKey, variant = 0): THREE.Material { return this.mk(`${key}:${variant}`); }
  awning(color: string, text: string): THREE.Material { return this.mk(`awning:${color}:${text}`); }
  sign(text: string, bg = '', fg = ''): THREE.Material { return this.mk(`sign:${text}:${bg}:${fg}`); }
  carPaint(color: string): THREE.Material { return this.mk(`car:${color}`); }
  setNight(): void { /* noop */ }
}

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as { lots: unknown[] };
const net = RoadNet.fromJson(core);
const d = deriveGeometry(net);
const faces = blockFaces(net, d);
const placed = placeLotsDetailed(net, d, faces, lotsJson).lots;
const r1 = placed.filter((l) => l.ph === 'R1');
const layout = chunkLayoutFromBounds(net.bounds);

describe('buildRealBuildings on the real network', () => {
  const t0 = Date.now();
  const res = buildRealBuildings(r1, new StubMaterials(), new Rng(7), { layout });
  const ms = Date.now() - t0;
  it('stands buildings on R1 and reports triangles and draw calls', () => {
    const s = res.stats;
    const per = Object.values(s.perChunk);
    const maxTri = Math.max(...per.map((c) => c.triangles));
    const maxDraw = Math.max(...per.map((c) => c.draws));
    console.log('BLDG R1', JSON.stringify({ ms, lots: s.lots, built: s.built, skipped: s.skipped, triangles: s.triangles, meshes: s.meshes, chunks: s.chunks, cells: s.cells, colliders: s.colliders, maxTriPerChunk: maxTri, maxDrawsPerChunk: maxDraw }));
    expect(s.built).toBeGreaterThan(r1.length * 0.9);
    expect(s.triangles).toBeGreaterThan(10000);
    expect(res.chunkMeshes.length).toBeGreaterThan(10);
  });
  it('tags every cell mesh with a cell and a chunk', () => {
    for (const m of res.chunkMeshes) {
      expect(typeof m.userData.cell).toBe('string');
      expect(typeof m.userData.chunk).toBe('string');
    }
  });
  it('colliders are polygons and segments with finite coordinates, one per building body at least', () => {
    expect(res.colliders.length).toBeGreaterThanOrEqual(res.stats.built);
    for (const c of res.colliders) {
      if (c.shape.kind === 'polygon') { expect(c.shape.points.length).toBeGreaterThanOrEqual(3); for (const p of c.shape.points) expect(Number.isFinite(p.x + p.z)).toBe(true); }
    }
  });
  it('wedge vacants and skipped lots are not built; footprints stay inside lot polygons', () => {
    expect(res.stats.skipped.wedge ?? 0).toBe(r1.filter((l) => l.wedge).length);
    for (const l of r1.slice(0, 600)) {
      if (l.wedge) continue;
      const fp = fitFootprint(l);
      if (!fp) continue;
      expect(fp.xr - fp.xl).toBeLessThanOrEqual(l.width + 1e-6);
      expect(fp.depth).toBeLessThanOrEqual(l.depth + 1e-6);
    }
  });
  it('is deterministic', () => {
    const again = buildRealBuildings(r1.slice(0, 80), new StubMaterials(), new Rng(7), { layout });
    const again2 = buildRealBuildings(r1.slice(0, 80), new StubMaterials(), new Rng(7), { layout });
    expect(again.stats.triangles).toBe(again2.stats.triangles);
  });
  it('looks hook overrides the derived spec', () => {
    const l = r1.find((x) => !x.wedge && x.type === 'rowhouse')!;
    expect(specForRealLot(l).use).toBe('residential');
    const a = buildRealBuildings([l], new StubMaterials(), new Rng(1), { layout });
    const b = buildRealBuildings([l], new StubMaterials(), new Rng(1), { layout, looks: () => ({ floors: 6 }) });
    expect(b.stats.triangles).not.toBe(a.stats.triangles);
  });
});

describe('buildRealBuildings on the grid adapter', () => {
  it('builds rectangular lots made from a grid face (no PLUTO facts: derived defaults)', () => {
    const grid = buildGrid(loadBedstuyData());
    const gnet = roadNetFromGrid(grid);
    const gd = deriveGeometry(gnet);
    const gf = blockFaces(gnet, gd);
    const f = gf[0][0];
    const len = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
    const mk = (k: number): RealLot => {
      const w = len / 4;
      const fa = { x: f.a.x + ((f.b.x - f.a.x) / len) * w * k, z: f.a.z + ((f.b.z - f.a.z) / len) * w * k };
      const fb = { x: f.a.x + ((f.b.x - f.a.x) / len) * w * (k + 1), z: f.a.z + ((f.b.z - f.a.z) / len) * w * (k + 1) };
      const inw = { x: -f.outward.x, z: -f.outward.z };
      const poly = [fa, fb, { x: fb.x + inw.x * 14, z: fb.z + inw.z * 14 }, { x: fa.x + inw.x * 14, z: fa.z + inw.z * 14 }];
      return { id: `30000000${k}0`, bbl: `30000000${k}0`, blockId: f.blockId, side: f.side, frontA: fa, frontB: fb, width: w, depth: 14, outward: f.outward, type: 'rowhouse', corner: false, poly, block: 0, face: 0, scale: 1 };
    };
    const lots = [0, 1, 2, 3].map(mk);
    const res = buildRealBuildings(lots, new StubMaterials(), new Rng(3), { layout: chunkLayoutFromBounds(gnet.bounds) });
    expect(res.stats.built).toBe(4);
    expect(res.stats.triangles).toBeGreaterThan(100);
    expect(res.colliders.length).toBeGreaterThanOrEqual(4);
  });
});
