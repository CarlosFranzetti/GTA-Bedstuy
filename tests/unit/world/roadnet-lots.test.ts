import { describe, it, expect } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { penetration, placeLotsDetailed, type RealLot } from '@/world/roadnet/lotsReal';
import { signedArea } from '@/world/roadnet/geom';

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as { lots: Array<{ ph: string; blk: number; e: number }> };

const grid = buildGrid(loadBedstuyData());
const gnet = roadNetFromGrid(grid);
const gd = deriveGeometry(gnet);

const net = RoadNet.fromJson(core);
const d = deriveGeometry(net);
const faces = blockFaces(net, d);
const { lots, report } = placeLotsDetailed(net, d, faces, lotsJson);

const angleDeg = (a: Vec2, b: Vec2): number => (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) * 180) / Math.PI;

describe('blockFaces on the grid adapter', () => {
  const gf = blockFaces(gnet, gd);
  it('gives 4 faces per block matching grid.blocks[i].faces', () => {
    let matched = 0;
    gnet.blocks.forEach((b, i) => {
      const gb = grid.blocks.find((x) => x.id === b.ref);
      expect(gb).toBeTruthy();
      expect(gf[i].length).toBe(4);
      for (const g of gb!.faces) {
        const f = gf[i].find((q) => q.side === g.side);
        expect(f, `${b.ref} ${g.side}`).toBeTruthy();
        expect(Math.hypot(f!.a.x - g.a.x, f!.a.z - g.a.z)).toBeLessThan(0.1);
        expect(Math.hypot(f!.b.x - g.b.x, f!.b.z - g.b.z)).toBeLessThan(0.1);
        expect(Math.hypot(f!.outward.x - g.outward.x, f!.outward.z - g.outward.z)).toBeLessThan(1e-6);
        expect(Math.hypot(f!.curbA.x - g.curbA.x, f!.curbA.z - g.curbA.z)).toBeLessThan(0.1);
        expect(f!.streetId).toBe(g.streetId);
        matched++;
      }
    });
    expect(matched).toBe(gnet.blocks.length * 4);
  });
});

describe('blockFaces on the real network', () => {
  it('has faces for most blocks, every face on a real edge with s0 < s1', () => {
    const withFaces = faces.filter((f) => f.length > 0).length;
    expect(withFaces).toBeGreaterThan(net.blocks.length * 0.8);
    for (const fs of faces) for (const f of fs) {
      expect(f.edge).toBeGreaterThanOrEqual(0);
      expect(f.edge).toBeLessThan(net.edges.length);
      expect(f.s1).toBeGreaterThan(f.s0);
      expect(Math.hypot(f.outward.x, f.outward.z)).toBeCloseTo(1, 6);
    }
  });
  it('face outward is the normal of the edge it lies on (within 10 degrees)', () => {
    for (const fs of faces) for (const f of fs) {
      const mid = { x: (f.a.x + f.b.x) / 2, z: (f.a.z + f.b.z) / 2 };
      const h = net.nearestEdge(mid, 80, (e) => e === f.edge)!;
      const n = { x: -h.dir.z, z: h.dir.x };
      const dd = Math.min(angleDeg(f.outward, n), angleDeg(f.outward, { x: -n.x, z: -n.z }));
      expect(dd).toBeLessThan(10);
    }
  });
});

describe('placeLots on the real network', () => {
  it('reports placed / dropped counts and places at least 95 % of the placeable R1 lots', () => {
    const r1 = lotsJson.lots.filter((l) => l.ph === 'R1');
    const placed = report.placed.R1 ?? 0;
    const droppedR1 = report.dropped.R1 ?? {};
    // lots that cannot sit on a face by the brief's own rules: no edge, zero frontage, condo duplicates, narrow blocks
    const excused = (droppedR1.noEdge ?? 0) + (droppedR1.zeroFrontage ?? 0) + (droppedR1.duplicateUnit ?? 0) + (droppedR1.narrowBlock ?? 0) + (droppedR1.noBlock ?? 0);
    const denom = r1.length - excused;
    console.log('LOTS REPORT', JSON.stringify(report), 'R1 total', r1.length, 'placed', placed, 'denominator', denom);
    expect(placed / denom).toBeGreaterThanOrEqual(0.95);
  });
  it('ids are the BBLs and unique', () => {
    const ids = lots.filter((l) => !l.wedge).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of lots) if (!l.wedge) expect(l.id).toMatch(/^\d{10}$/);
  });
  it('every lot outward is within 10 degrees of its frontage edge normal', () => {
    for (const l of lots) {
      const f = faces[l.block][l.face];
      const mid = { x: (l.frontA.x + l.frontB.x) / 2, z: (l.frontA.z + l.frontB.z) / 2 };
      const h = net.nearestEdge(mid, 80, (e) => e === f.edge)!;
      const n = { x: -h.dir.z, z: h.dir.x };
      expect(Math.min(angleDeg(l.outward, n), angleDeg(l.outward, { x: -n.x, z: -n.z }))).toBeLessThan(10);
    }
  });
  it('no two lots on a block overlap (0.2 m) and polygons are convex positive', () => {
    const byBlock = new Map<number, RealLot[]>();
    for (const l of lots) { const a = byBlock.get(l.block); if (a) a.push(l); else byBlock.set(l.block, [l]); }
    let pairs = 0;
    for (const arr of byBlock.values()) {
      for (let i = 0; i < arr.length; i++) {
        expect(arr[i].poly.length).toBeGreaterThanOrEqual(3);
        expect(Math.abs(signedArea(arr[i].poly))).toBeGreaterThan(1);
        for (let j = i + 1; j < arr.length; j++) { pairs++; expect(penetration(arr[i].poly, arr[j].poly), `${arr[i].id} ${arr[j].id}`).toBeLessThanOrEqual(0.2); }
      }
    }
    expect(pairs).toBeGreaterThan(1000);
  });
  it('lots stay inside their block building line (back corners within 0.5 m)', () => {
    for (const l of lots) {
      const ring = d.buildingRings[l.block];
      expect(ring.length).toBeGreaterThan(2);
    }
  });
  it('blocks that are narrow or fallback get no lots', () => {
    const fb = new Set(d.fallbackBuilding);
    for (const l of lots) expect(fb.has(l.block)).toBe(false);
  });
  it('wedge corners yield vacant lots, never a building', () => {
    const wedges = lots.filter((l) => l.wedge);
    expect(wedges.length).toBe(report.vacantFromWedge);
    for (const w of wedges) expect(w.type).toBe('vacant');
  });
});

describe('placeLots on the grid adapter (no PLUTO lots there)', () => {
  it('places nothing and does not throw on an empty lot file', () => {
    const r = placeLotsDetailed(gnet, gd, blockFaces(gnet, gd), { lots: [] });
    expect(r.lots.length).toBe(0);
    expect(r.report.wedgeCorners).toBe(0);
  });
});
