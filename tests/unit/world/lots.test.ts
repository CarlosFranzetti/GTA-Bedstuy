import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { dist, sub, len } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { Block, BlockFace, GridModel, PoiDef, Side, Lot } from '@/world/types';
import { subdivideLots } from '@/world/LotSubdivider';

/** Hand-built block: building line x in [-240,-10], z in [-95,-5]  (230 x 90 m, like a real Bed-Stuy block). */
function fakeBlock(id = 'r0c0', dx = 0, dz = 0): Block {
  const p = (x: number, z: number): Vec2 => ({ x: x + dx, z: z + dz });
  const NW = p(-240, -95), NE = p(-10, -95), SE = p(-10, -5), SW = p(-240, -5);
  const cNW = p(-244, -99), cNE = p(-6, -99), cSE = p(-6, -1), cSW = p(-244, -1);
  const face = (side: Side, a: Vec2, b: Vec2, ca: Vec2, cb: Vec2, outward: Vec2, streetId: string): BlockFace =>
    ({ blockId: id, side, streetId, a, b, curbA: ca, curbB: cb, outward });
  return {
    id, row: 0, col: 0,
    curb: [cNW, cNE, cSE, cSW],
    buildingLine: [NW, NE, SE, SW],
    faces: [
      face('N', NE, NW, cNE, cNW, { x: 0, z: -1 }, 'hart'),
      face('S', SW, SE, cSW, cSE, { x: 0, z: 1 }, 'pulaski'),
      face('E', SE, NE, cSE, cNE, { x: 1, z: 0 }, 'throop'),
      face('W', NW, SW, cNW, cSW, { x: -1, z: 0 }, 'tompkins'),
    ],
  };
}
function fakeGrid(blocks: Block[] = [fakeBlock()]): GridModel {
  return {
    blocks,
    blockById: (id: string) => blocks.find((b) => b.id === id)!,
    streetById: (id: string) => ({ id, name: id, signName: id, axis: 'ns', offset: 0, class: 'street', roadWidth: 10, sidewalkWidth: 3.5, oneWay: 0 }),
  } as unknown as GridModel;
}
const POIS: PoiDef[] = [
  { id: 'bodega', block: 'r0c0', face: 'W', t: 0.08, archetype: 'bodega', sign: 'DELI', awningColor: '#d62828' },
  { id: 'church', block: 'r0c0', face: 'S', t: 0.5, archetype: 'church', sign: 'TABERNACLE', awningColor: '#5a2d82' },
  { id: 'condo', block: 'r0c0', face: 'W', t: 0.5, archetype: 'condo', sign: 'CONDOS', awningColor: '#e8e2d6' },
  { id: 'rx', block: 'r0c0', face: 'E', t: 0.1, archetype: 'pharmacy', sign: 'RX', awningColor: '#0a7f5a' },
  { id: 'funeral', block: 'r0c0', face: 'N', t: 0.5, archetype: 'funeral', sign: 'FUNERAL', awningColor: '#2b2b2b' },
];
const faceOf = (g: GridModel, lot: Lot) => g.blockById(lot.blockId).faces.find((f) => f.side === lot.side)!;
const lotsOn = (lots: Lot[], side: Side) => lots.filter((l) => l.side === side);

describe('subdivideLots', () => {
  const grid = fakeGrid();
  const lots = subdivideLots(grid, POIS, new Rng(1988));

  it('is deterministic', () => {
    const again = subdivideLots(grid, POIS, new Rng(1988));
    expect(JSON.stringify(again)).toBe(JSON.stringify(lots));
  });

  it('has no lot narrower than 4 m and unique ids', () => {
    for (const l of lots) expect(l.width).toBeGreaterThanOrEqual(4);
    expect(new Set(lots.map((l) => l.id)).size).toBe(lots.length);
  });

  it('lot width equals the front edge length', () => {
    for (const l of lots) expect(dist(l.frontA, l.frontB)).toBeCloseTo(l.width, 2);
  });

  it('lots tile each face exactly (street faces start after the corner lot depth)', () => {
    for (const side of ['N', 'S', 'E', 'W'] as Side[]) {
      const ls = lotsOn(lots, side);
      const face = faceOf(grid, ls[0]);
      const faceLen = dist(face.a, face.b);
      const sum = ls.reduce((s, l) => s + l.width, 0);
      const startGap = dist(face.a, ls[0].frontA);
      const endGap = dist(face.b, ls[ls.length - 1].frontB);
      expect(sum + startGap + endGap).toBeCloseTo(faceLen, 1);
      if (side === 'E' || side === 'W') { expect(startGap).toBeLessThan(0.01); expect(endGap).toBeLessThan(0.01); }
      // consecutive lots touch
      for (let i = 1; i < ls.length; i++) expect(dist(ls[i - 1].frontB, ls[i].frontA)).toBeLessThan(0.01);
    }
  });

  it('street faces start after the adjoining corner lot depth', () => {
    const ew = lots.filter((l) => l.corner);
    const maxCornerDepth = Math.max(...ew.map((l) => l.depth));
    for (const side of ['N', 'S'] as Side[]) {
      const ls = lotsOn(lots, side);
      const face = faceOf(grid, ls[0]);
      expect(dist(face.a, ls[0].frontA)).toBeGreaterThanOrEqual(14 - 0.01);
      expect(dist(face.a, ls[0].frontA)).toBeLessThanOrEqual(maxCornerDepth + 0.01);
    }
  });

  it('corner lots are mixeduse, on E/W faces only, 9-12 m wide, two per avenue face', () => {
    const corners = lots.filter((l) => l.corner);
    expect(corners.length).toBe(4);
    for (const c of corners) {
      expect(['E', 'W']).toContain(c.side);
      expect(c.type).toBe('mixeduse');
      expect(c.width).toBeGreaterThanOrEqual(9 - 0.01);
      expect(c.width).toBeLessThanOrEqual(12 + 0.01);
    }
  });

  it('depths and widths follow the plan', () => {
    for (const l of lots) {
      if (l.type === 'church') continue;
      if (l.side === 'E' || l.side === 'W') {
        expect(l.depth).toBeGreaterThanOrEqual(14 - 0.01);
        expect(l.depth).toBeLessThanOrEqual(18 + 0.01);
      } else {
        expect(l.depth).toBeGreaterThanOrEqual(12 - 0.01);
        expect(l.depth).toBeLessThanOrEqual(16 + 0.01);
      }
    }
    for (const l of lots.filter((x) => !x.corner && !x.poi && x.type !== 'church')) {
      const max = l.side === 'E' || l.side === 'W' ? 9 + 4.5 : 7.5 + 4.5; // closing lot may absorb a remainder
      expect(l.width).toBeLessThanOrEqual(max);
    }
  });

  it('outward is a unit normal pointing away from the block', () => {
    for (const l of lots) {
      expect(len(l.outward)).toBeCloseTo(1, 5);
      const face = faceOf(grid, l);
      expect(l.outward).toEqual(face.outward);
    }
  });

  it('assigns every POI exactly once with the right lot type', () => {
    for (const poi of POIS) {
      const hits = lots.filter((l) => l.poi?.id === poi.id);
      expect(hits.length, poi.id).toBe(1);
      const lot = hits[0];
      expect(lot.blockId).toBe(poi.block);
      expect(lot.side).toBe(poi.face);
      const expected = poi.archetype === 'church' ? 'church' : poi.archetype === 'condo' ? 'apartment' : 'mixeduse';
      expect(lot.type, poi.id).toBe(expected);
    }
    expect(lots.filter((l) => l.poi).length).toBe(POIS.length);
  });

  it('POI lot contains the t position along its face (corner/church lots may shift)', () => {
    for (const poi of POIS) {
      const lot = lots.find((l) => l.poi?.id === poi.id)!;
      const face = faceOf(grid, lot);
      const s = poi.t * dist(face.a, face.b);
      const s0 = dist(face.a, lot.frontA), s1 = dist(face.a, lot.frontB);
      expect(s).toBeGreaterThanOrEqual(s0 - 12);
      expect(s).toBeLessThanOrEqual(s1 + 12);
    }
  });

  it('church lots are wide enough for a 9 m nave', () => {
    const c = lots.find((l) => l.poi?.id === 'church')!;
    expect(c.width).toBeGreaterThanOrEqual(12.4);
  });

  it('lot footprints stay inside the building line', () => {
    const bl = grid.blocks[0].buildingLine;
    const minX = Math.min(...bl.map((p) => p.x)), maxX = Math.max(...bl.map((p) => p.x));
    const minZ = Math.min(...bl.map((p) => p.z)), maxZ = Math.max(...bl.map((p) => p.z));
    for (const l of lots) {
      for (const f of [l.frontA, l.frontB]) {
        const back = { x: f.x - l.outward.x * l.depth, z: f.z - l.outward.z * l.depth };
        for (const p of [f, back]) {
          expect(p.x).toBeGreaterThanOrEqual(minX - 0.01); expect(p.x).toBeLessThanOrEqual(maxX + 0.01);
          expect(p.z).toBeGreaterThanOrEqual(minZ - 0.01); expect(p.z).toBeLessThanOrEqual(maxZ + 0.01);
        }
      }
    }
  });

  it('lot rectangles of one block never overlap', () => {
    const rect = (l: Lot) => {
      const b1 = { x: l.frontA.x - l.outward.x * l.depth, z: l.frontA.z - l.outward.z * l.depth };
      const b2 = { x: l.frontB.x - l.outward.x * l.depth, z: l.frontB.z - l.outward.z * l.depth };
      const xs = [l.frontA.x, l.frontB.x, b1.x, b2.x], zs = [l.frontA.z, l.frontB.z, b1.z, b2.z];
      return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    };
    const rs = lots.map(rect);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      expect(ox > 0.05 && oz > 0.05, `${lots[i].id} overlaps ${lots[j].id}`).toBe(false);
    }
  });

  it('type mix over many blocks is roughly the plan percentages', () => {
    const blocks: Block[] = [];
    for (let i = 0; i < 12; i++) blocks.push(fakeBlock(`r${i}c0`, 0, i * 200));
    const big = fakeGrid(blocks);
    const ls = subdivideLots(big, [], new Rng(7));
    const street = ls.filter((l) => l.side === 'N' || l.side === 'S');
    const frac = (t: string) => street.filter((l) => l.type === t).length / street.length;
    expect(frac('brownstone')).toBeGreaterThan(0.5);
    expect(frac('brownstone')).toBeLessThan(0.8);
    expect(frac('rowhouse')).toBeGreaterThan(0.12);
    expect(frac('rowhouse')).toBeLessThan(0.38);
    expect(frac('vacant')).toBeLessThan(0.1);
    const ave = ls.filter((l) => (l.side === 'E' || l.side === 'W') && !l.corner);
    const af = (t: string) => ave.filter((l) => l.type === t).length / ave.length;
    expect(af('mixeduse')).toBeGreaterThan(0.5);
    expect(af('apartment')).toBeGreaterThan(0.03);
    // sanity on the sub helper
    expect(len(sub({ x: 3, z: 4 }, { x: 0, z: 0 }))).toBe(5);
  });
});
