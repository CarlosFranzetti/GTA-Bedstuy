/**
 * GRID9 phase B1: the grid grows east (Lewis Ave 500, Stuyvesant Ave 750, Malcolm X Blvd 1000) at real avenue spacing, the
 * six east-west rows continue to x = 1000. The original ten blocks, every POI and the spawn must not move.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData, CORE_NS_STREETS } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { checkAgainstGrid } from '@/world/data/schema';
import { chunkKeyOf, chunkLayout, chunkRangeFor } from '@/render/Culling';
import { RING_START, planSkyline } from '@/world/Skyline';
import { createPointerRouter } from '@/game/missions/PointerRoute';
import type { Graph } from '@/world/types';

// the project has no @types/node: read main.ts with a dynamic import
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(p: string, enc: string): string };

const data = loadBedstuyData();
const grid = buildGrid(data);
const ORIGINAL = ['r0c0', 'r0c1', 'r1c0', 'r1c1', 'r2c0', 'r2c1', 'r3c0', 'r3c1', 'r4c0', 'r4c1'];
const isOriginal = (id: string): boolean => ORIGINAL.includes(id);

/** FNV-1a over a string. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}
const r3 = (n: number): string => (Math.round(n * 1000) / 1000 + 0).toFixed(3);

function bfs(g: Graph, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const n = q.pop()!;
    for (const ei of g.adjacency[n]) { const m = g.edges[ei].to; if (!seen.has(m)) { seen.add(m); q.push(m); } }
  }
  return seen;
}

describe('B1 streets and bounds', () => {
  it('has twelve streets: Lewis, Stuyvesant and Malcolm X added as two-way avenues like Marcus Garvey', () => {
    expect(grid.streets).toHaveLength(12);
    const garvey = grid.streetById('garvey');
    for (const [id, name, x] of [['lewis', 'Lewis Ave', 500], ['stuyvesant', 'Stuyvesant Ave', 750], ['malcolmx', 'Malcolm X Blvd', 1000]] as const) {
      const s = grid.streetById(id);
      expect(s.name).toBe(name);
      expect(s.signName).toBe(name);
      expect(s.axis).toBe('ns');
      expect(s.offset).toBe(x);
      expect(s.class).toBe('avenue');
      expect(s.oneWay).toBe(0);
      expect(s.roadWidth).toBe(garvey.roadWidth);
      expect(s.sidewalkWidth).toBe(garvey.sidewalkWidth);
    }
    expect(grid.streets.filter((s) => s.axis === 'ns')).toHaveLength(6);
    expect(grid.streets.filter((s) => s.axis === 'ew')).toHaveLength(6);
    expect(CORE_NS_STREETS).toBe(3);
  });

  it('bounds run from Tompkins to the outer edge of Malcolm X (+ sidewalk is outside the road edge)', () => {
    expect(grid.bounds).toEqual({ minX: -257, maxX: 1007, minZ: -205, maxZ: 306.5 });
  });

  it('has 25 blocks, 36 intersections, 60 segments and one crosswalk per approach', () => {
    expect(grid.blocks).toHaveLength(25);
    expect(grid.intersections).toHaveLength(36);
    expect(grid.segments).toHaveLength(60);
    expect(grid.crosswalks).toHaveLength(120);
  });

  it('adds 15 new blocks r0..r4 x c2..c4 east of the original ten', () => {
    const fresh = grid.blocks.filter((b) => !isOriginal(b.id));
    expect(fresh).toHaveLength(15);
    for (const b of fresh) { expect(b.col).toBeGreaterThanOrEqual(2); expect(b.row).toBeLessThanOrEqual(4); }
    // the original ten come first in build order, so every sequential random stream over them is unchanged
    expect(grid.blocks.slice(0, 10).map((b) => b.id).sort()).toEqual([...ORIGINAL].sort());
    expect(grid.intersections.slice(0, 18).every((i) => ['tompkins', 'throop', 'garvey'].includes(i.nsStreetId))).toBe(true);
    // real avenue spacing: blocks between avenues are 250 m pitch (236 m of curb to curb)
    const b = grid.blockById('r2c3');
    expect(b.curb[0].x).toBeCloseTo(500 + 7);
    expect(b.curb[1].x).toBeCloseTo(750 - 7);
  });

  it('the lane graph and the sidewalk graph reach the new blocks and stay connected', () => {
    const lanes = Object.keys(grid.lanes.nodes);
    expect(bfs(grid.lanes, lanes[0]).size).toBe(lanes.length);
    const sw = Object.keys(grid.sidewalks.nodes);
    expect(bfs(grid.sidewalks, sw[0]).size).toBe(sw.length);
    expect(lanes.some((id) => grid.lanes.nodes[id].streetId === 'malcolmx')).toBe(true);
    expect(lanes.some((id) => grid.lanes.nodes[id].pos.x > 900)).toBe(true);
    expect(sw.some((id) => grid.sidewalks.nodes[id].pos.x > 900)).toBe(true);
    for (const id of sw) expect(grid.isOnRoad(grid.sidewalks.nodes[id].pos)).toBe(false);
  });

  it('the east-west rows continue to Malcolm X; queries work out there', () => {
    expect(grid.isOnRoad({ x: 900, z: 0 })).toBe(true);
    expect(grid.isOnRoad({ x: 1000, z: 150 })).toBe(true);
    expect(grid.isOnRoad({ x: 625, z: 50 })).toBe(false);
    expect(grid.nearestStreet({ x: 748, z: 150 }).id).toBe('stuyvesant');
    expect(grid.nearestStreet({ x: 900, z: 1 }).id).toBe('kosciuszko');
    const n = grid.nearestLaneNode({ x: 1002, z: 50 });
    expect(n.streetId).toBe('malcolmx');
  });

  it('every new face has placeholder data keyed to its block, none unmatched', () => {
    const { unmatched, missing } = checkAgainstGrid(grid, getBedstuyFaces());
    expect(unmatched).toEqual([]);
    expect(missing).toEqual([]);
    expect(getBedstuyFaces().faces).toHaveLength(100);
  });
});

describe('B1 leaves the original ten blocks, the POIs and the spawn exactly as they were', () => {
  const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces());
  const old = lots.filter((l) => isOriginal(l.blockId));

  it('the original blocks keep their curbs and building lines', () => {
    const sig = grid.blocks.filter((b) => isOriginal(b.id)).sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => `${b.id}:${[...b.curb, ...b.buildingLine].map((p) => `${r3(p.x)},${r3(p.z)}`).join(';')}`).join('|');
    expect(hash(sig)).toBe('94d41318');
  });

  it('the lots of the original blocks keep their ids, positions and depths', () => {
    expect(old.length).toBeGreaterThan(700);
    const sig = old.map((l) => `${l.id}:${r3(l.frontA.x)},${r3(l.frontA.z)}:${r3(l.frontB.x)},${r3(l.frontB.z)}:${r3(l.depth)}`).sort().join('|');
    expect(old.length).toBe(EXPECT_OLD_LOTS);
    expect(hash(sig)).toBe(EXPECT_OLD_LOT_HASH);
  });

  it('every POI sits on the same block, face and lot position', () => {
    expect(data.pois).toHaveLength(15);
    const placed = data.pois.map((p) => {
      const l = lots.find((x) => x.poi?.id === p.id);
      expect(l, p.id).toBeDefined();
      expect(isOriginal(p.block), p.id).toBe(true);
      return `${p.id}:${p.block}:${p.face}:${p.t}:${l!.id}:${r3((l!.frontA.x + l!.frontB.x) / 2)},${r3((l!.frontA.z + l!.frontB.z) / 2)}`;
    }).sort().join('|');
    expect(hash(placed)).toBe(EXPECT_POI_HASH);
  });

  it('the spawn is still (9, 20) on the Throop sidewalk, inside the original ten blocks', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/const SPAWN = \{ x: 9, z: 20 \};/);
    expect(grid.nearestStreet({ x: 9, z: 20 }).id).toBe('throop');
    expect(grid.isOnRoad({ x: 9, z: 20 })).toBe(false);
    expect(old.some((l) => l.blockId === 'r2c1')).toBe(true);
  });
});

describe('B1 mission pointer router on the larger grid', () => {
  const route = createPointerRouter(grid);
  const clearOf = (a: { x: number; z: number }, b: { x: number; z: number }): boolean => {
    for (const bl of grid.blocks) {
      const xs = bl.buildingLine.map((p) => p.x), zs = bl.buildingLine.map((p) => p.z);
      const box = { x0: Math.min(...xs) + 0.4, x1: Math.max(...xs) - 0.4, z0: Math.min(...zs) + 0.4, z1: Math.max(...zs) - 0.4 };
      for (let i = 0; i <= 200; i++) {
        const x = a.x + ((b.x - a.x) * i) / 200, z = a.z + ((b.z - a.z) * i) / 200;
        if (x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1) return false;
      }
    }
    return true;
  };

  it('aims across the east blocks at a sidewalk corner in clear view, never at a wall', () => {
    const goal = { x: 900, z: 150 }; // inside block r3c4
    const from = { x: 9, z: 20 };
    const aim = { ...route(from, goal) };
    expect(Number.isFinite(aim.x + aim.z)).toBe(true);
    expect(aim).not.toEqual(goal);
    expect(clearOf(from, aim)).toBe(true);
  });

  it('walking the aim point reaches the far side of the grid', () => {
    const goal = { x: 1004, z: 250 }; // Malcolm X sidewalk at the south end
    const p = { x: 9, z: 20 };
    for (let step = 0; step < 4000 && Math.hypot(goal.x - p.x, goal.z - p.z) > 6; step++) {
      const a = route(p, goal);
      const d = Math.hypot(a.x - p.x, a.z - p.z) || 1;
      const k = Math.min(1, 1.5 / d); // 1.5 m steps
      p.x += (a.x - p.x) * k; p.z += (a.z - p.z) * k;
    }
    expect(Math.hypot(goal.x - p.x, goal.z - p.z)).toBeLessThanOrEqual(6);
  });
});

describe('B1 skyline ring', () => {
  it('is re-centred on the new bounds and starts beyond the outer edge: no proxy tower stands on a real block', () => {
    const plan = planSkyline(grid.bounds, new Rng(1));
    expect(plan.length).toBeGreaterThan(600);
    const b = grid.bounds;
    for (const k of plan) {
      const outside = Math.max(b.minX - k.x, k.x - b.maxX, b.minZ - k.z, k.z - b.maxZ);
      expect(outside).toBeGreaterThan(RING_START - 10 - 20); // jitter +-4 and half a block of width
    }
    // east of Malcolm X the ring is there (it used to start east of Garvey)
    expect(plan.some((k) => k.x > b.maxX + RING_START)).toBe(true);
  });
});

describe('B1 chunks', () => {
  const layout = chunkLayout(grid.streets);

  it('are 2 x 2 blocks (two 250 x 200 m render cells), anchored at the north-west street corner so chunk edges are street centrelines', () => {
    expect(layout).toEqual({ cellX: 250, cellZ: 200, chunkX: 500, chunkZ: 200, originX: -250, originZ: -200 });
  });

  it('give every block exactly one chunk and no chunk more than 2 x 2 blocks', () => {
    const byChunk = new Map<string, string[]>();
    for (const b of grid.blocks) {
      const cx = (b.curb[0].x + b.curb[1].x) / 2, cz = (b.curb[0].z + b.curb[3].z) / 2;
      const k = chunkKeyOf(layout, cx, cz);
      byChunk.set(k, [...(byChunk.get(k) ?? []), b.id]);
    }
    expect([...byChunk.values()].flat().sort()).toEqual(grid.blocks.map((b) => b.id).sort());
    for (const ids of byChunk.values()) {
      expect(ids.length).toBeLessThanOrEqual(4);
      const rows = new Set(ids.map((id) => grid.blockById(id).row)), cols = new Set(ids.map((id) => grid.blockById(id).col));
      expect(rows.size).toBeLessThanOrEqual(2);
      expect(cols.size).toBeLessThanOrEqual(2);
    }
    // r0c0 r0c1 r1c0 r1c1 share chunk 0_0; the Malcolm X column (c4) starts chunk column 2
    expect(byChunk.get('0_0')!.sort()).toEqual(['r0c0', 'r0c1', 'r1c0', 'r1c1']);
    expect(byChunk.get('1_0')!.sort()).toEqual(['r0c2', 'r0c3', 'r1c2', 'r1c3']);
    expect(byChunk.get('2_2')).toEqual(['r4c4']);
    expect(byChunk.size).toBe(9);
  });

  it('are hidden by distance per tier: phone about a block beyond the fog, low two, medium three', () => {
    expect(chunkRangeFor("phone")).toBe(100);
    expect(chunkRangeFor('low')).toBe(420);
    expect(chunkRangeFor('medium')).toBe(520);
    expect(chunkRangeFor('phone')).toBeLessThan(chunkRangeFor('low'));
    expect(chunkRangeFor('low')).toBeLessThan(chunkRangeFor('medium'));
  });
});

// expected signatures of the ten original blocks as the ten-block world builds them (captured before B1)
const EXPECT_OLD_LOTS = 794;
const EXPECT_OLD_LOT_HASH = '9d02921e';
const EXPECT_POI_HASH = 'cc4dc053';
