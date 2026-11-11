import { describe, it, expect } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { Graph, GridModel } from '@/world/types';
import { headingFromVec, angleDiff } from '@/core/Math2';

const grid: GridModel = buildGrid(loadBedstuyData());

function bfs(g: Graph, start: string, reverse = false): Set<string> {
  const adj: Record<string, string[]> = {};
  for (const id of Object.keys(g.nodes)) adj[id] = [];
  for (const e of g.edges) {
    if (reverse) adj[e.to].push(e.from);
    else adj[e.from].push(e.to);
  }
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const n = q.pop()!;
    for (const m of adj[n]) if (!seen.has(m)) { seen.add(m); q.push(m); }
  }
  return seen;
}

describe('Grid counts', () => {
  it('has 45 blocks, 60 intersections, 104 segments (WBURG: four rows north of Hart; B1: three avenues east of the original ten blocks, see grid-east.test.ts)', () => {
    expect(grid.blocks).toHaveLength(45);
    expect(grid.intersections).toHaveLength(60);
    expect(grid.segments).toHaveLength(104);
    expect(grid.seed).toBe(1988);
  });

  it('intersection ids and extents follow the street widths', () => {
    const i = grid.intersections.find((x) => x.id === 'throop|kosciuszko')!;
    expect(i).toBeDefined();
    expect(i.center).toEqual({ x: 0, z: 0 });
    expect(i.halfX).toBe(7);
    expect(i.halfZ).toBe(5);
    expect(i.nsStreetId).toBe('throop');
    expect(i.ewStreetId).toBe('kosciuszko');
    const l = grid.intersections.find((x) => x.id === 'garvey|lafayette')!;
    expect(l.halfZ).toBe(6.5);
  });

  it('segments are trimmed to intersection edges', () => {
    const s = grid.segments.find((x) => x.streetId === 'throop' && x.fromIntersection === 'throop|kosciuszko')!;
    expect(s.toIntersection).toBe('throop|lafayette');
    expect(s.a).toEqual({ x: 0, z: 5 });
    expect(s.b).toEqual({ x: 0, z: 93.5 });
    expect(s.width).toBe(14);
    const e = grid.segments.find((x) => x.streetId === 'hart' && x.fromIntersection === 'tompkins|hart')!;
    expect(e.a).toEqual({ x: -243, z: -200 });
    expect(e.b).toEqual({ x: -7, z: -200 });
  });

  it('has one crosswalk per intersection approach, 3 m wide', () => {
    // 104 segments x 2 ends
    expect(grid.crosswalks).toHaveLength(208);
    for (const c of grid.crosswalks) expect(c.width).toBe(3);
    const c = grid.crosswalks.find((x) => x.intersectionId === 'throop|kosciuszko' && x.side === 'E')!;
    // crosses the ew street east of the intersection, spanning its roadway (z -5..5)
    expect(Math.abs(c.a.z - c.b.z)).toBeCloseTo(10, 6);
    expect(c.a.x).toBeCloseTo(c.b.x, 6);
    expect(c.a.x).toBeGreaterThan(7);
  });
});

describe('Blocks', () => {
  it('r2c0 curb range matches the spec', () => {
    const b = grid.blockById('r2c0');
    const xs = b.curb.map((p) => p.x);
    const zs = b.curb.map((p) => p.z);
    expect(Math.min(...xs)).toBeCloseTo(-250 + 7);
    expect(Math.max(...xs)).toBeCloseTo(0 - 7);
    // block r2 lies between Kosciuszko (z=0, half 5) and Lafayette (z=100, half 6.5)
    expect(Math.min(...zs)).toBeCloseTo(0 + 5);
    expect(Math.max(...zs)).toBeCloseTo(100 - 6.5);
  });

  it('curb and building line corners are ordered NW NE SE SW', () => {
    for (const b of grid.blocks) {
      for (const poly of [b.curb, b.buildingLine]) {
        expect(poly).toHaveLength(4);
        const [nw, ne, se, sw] = poly;
        expect(nw.x).toBeLessThan(ne.x);
        expect(nw.z).toBeCloseTo(ne.z);
        expect(se.z).toBeGreaterThan(ne.z);
        expect(se.x).toBeCloseTo(ne.x);
        expect(sw.x).toBeCloseTo(nw.x);
        expect(sw.z).toBeCloseTo(se.z);
      }
    }
  });

  it('building line is the curb inset by the adjacent sidewalk width', () => {
    const b = grid.blockById('r2c0');
    // N: kosciuszko sw 3.5, S: lafayette sw 4, W: tompkins 4, E: throop 4
    expect(b.buildingLine[0].x).toBeCloseTo(-243 + 4);
    expect(b.buildingLine[0].z).toBeCloseTo(5 + 3.5);
    expect(b.buildingLine[2].x).toBeCloseTo(-7 - 4);
    expect(b.buildingLine[2].z).toBeCloseTo(93.5 - 4);
  });

  it('has four faces with left-to-right ordering and outward normals', () => {
    const b = grid.blockById('r2c0');
    expect(b.faces.map((f) => f.side).sort()).toEqual(['E', 'N', 'S', 'W']);
    const f = (s: string) => b.faces.find((x) => x.side === s)!;
    // N face: street to the north, facing south => left is east
    expect(f('N').streetId).toBe('kosciuszko');
    expect(f('N').outward).toEqual({ x: 0, z: -1 });
    expect(f('N').a.x).toBeGreaterThan(f('N').b.x);
    // S face: facing north => left is west
    expect(f('S').streetId).toBe('lafayette');
    expect(f('S').outward).toEqual({ x: 0, z: 1 });
    expect(f('S').a.x).toBeLessThan(f('S').b.x);
    // E face: facing west => left is south
    expect(f('E').streetId).toBe('throop');
    expect(f('E').outward).toEqual({ x: 1, z: 0 });
    expect(f('E').a.z).toBeGreaterThan(f('E').b.z);
    // W face: facing east => left is north
    expect(f('W').streetId).toBe('tompkins');
    expect(f('W').outward).toEqual({ x: -1, z: 0 });
    expect(f('W').a.z).toBeLessThan(f('W').b.z);
    // curb line sits outward of the building line
    for (const face of b.faces) {
      const d = (face.curbA.x - face.a.x) * face.outward.x + (face.curbA.z - face.a.z) * face.outward.z;
      expect(d).toBeGreaterThan(3);
    }
  });

  it('lookups throw on unknown ids', () => {
    expect(() => grid.blockById('r9c9')).toThrow();
    expect(() => grid.streetById('nope')).toThrow();
    expect(grid.streetById('hart').oneWay).toBe(1);
  });
});

describe('Road queries', () => {
  it('isOnRoad', () => {
    expect(grid.isOnRoad({ x: 0, z: 0 })).toBe(true);
    expect(grid.isOnRoad({ x: 0, z: 50 })).toBe(true); // Throop segment
    expect(grid.isOnRoad({ x: -100, z: 0 })).toBe(true); // Kosciuszko segment
    expect(grid.isOnRoad({ x: -125, z: 50 })).toBe(false); // centre of r2c0
    expect(grid.isOnRoad({ x: -125, z: 6.5 })).toBe(false); // sidewalk
    expect(grid.isOnRoad({ x: -125, z: 4.9 })).toBe(true);
    expect(grid.isOnRoad({ x: 1100, z: 0 })).toBe(false); // east of Malcolm X Blvd
  });

  it('nearestStreet picks the closest street', () => {
    expect(grid.nearestStreet({ x: 1, z: 50 }).id).toBe('throop');
    expect(grid.nearestStreet({ x: -100, z: -1 }).id).toBe('kosciuszko');
    expect(grid.nearestStreet({ x: 240, z: 301 }).id).toBe('greene');
  });
});

describe('Lane graph', () => {
  const lanes = grid.lanes;
  const ids = Object.keys(lanes.nodes);

  it('is strongly connected', () => {
    expect(ids.length).toBeGreaterThan(100);
    for (const start of [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]]) {
      expect(bfs(lanes, start).size).toBe(ids.length);
      expect(bfs(lanes, start, true).size).toBe(ids.length);
    }
  });

  it('adjacency matches edges and edge lengths are positive', () => {
    for (const id of ids) expect(lanes.adjacency[id]).toBeDefined();
    lanes.edges.forEach((e, idx) => {
      expect(lanes.nodes[e.from]).toBeDefined();
      expect(lanes.nodes[e.to]).toBeDefined();
      expect(e.length).toBeGreaterThan(0);
      expect(lanes.adjacency[e.from]).toContain(idx);
    });
  });

  it('one-way street hart (+1) only has eastbound lanes at centre', () => {
    const hart = ids.map((i) => lanes.nodes[i]).filter((n) => n.streetId === 'hart');
    expect(hart.length).toBeGreaterThan(10);
    for (const n of hart) {
      expect(Math.abs(angleDiff(n.heading, Math.PI / 2))).toBeLessThan(1e-6);
      expect(n.pos.z).toBeCloseTo(-200);
    }
  });

  it('one-way street pulaski (-1) only has westbound lanes', () => {
    const p = ids.map((i) => lanes.nodes[i]).filter((n) => n.streetId === 'pulaski');
    expect(p.length).toBeGreaterThan(10);
    for (const n of p) expect(Math.abs(angleDiff(n.heading, -Math.PI / 2))).toBeLessThan(1e-6);
  });

  it('two-way streets use right-hand lanes offset 2 m from centre', () => {
    const throop = ids.map((i) => lanes.nodes[i]).filter((n) => n.streetId === 'throop');
    const north = throop.filter((n) => Math.abs(angleDiff(n.heading, 0)) < 1e-6);
    const south = throop.filter((n) => Math.abs(angleDiff(n.heading, Math.PI)) < 1e-6);
    expect(north.length).toBeGreaterThan(5);
    expect(south.length).toBeGreaterThan(5);
    expect(north.length + south.length).toBe(throop.length);
    for (const n of north) expect(n.pos.x).toBeCloseTo(2); // east side when heading north
    for (const n of south) expect(n.pos.x).toBeCloseTo(-2);
    const laf = ids.map((i) => lanes.nodes[i]).filter((n) => n.streetId === 'lafayette');
    for (const n of laf) {
      if (Math.abs(angleDiff(n.heading, Math.PI / 2)) < 1e-6) expect(n.pos.z).toBeCloseTo(102);
      else { expect(Math.abs(angleDiff(n.heading, -Math.PI / 2))).toBeLessThan(1e-6); expect(n.pos.z).toBeCloseTo(98); }
    }
  });

  it('node heading is consistent with the direction to the next node on the same street', () => {
    for (const e of lanes.edges) {
      const a = lanes.nodes[e.from];
      const b = lanes.nodes[e.to];
      if (a.stopLine && !b.stopLine && a.streetId !== b.streetId) continue; // turn
      if (a.stopLine) continue; // crossing edge
      const h = headingFromVec({ x: b.pos.x - a.pos.x, z: b.pos.z - a.pos.z });
      expect(Math.abs(angleDiff(a.heading, h))).toBeLessThan(0.01);
    }
  });

  it('node spacing along segments is at most 15 m', () => {
    for (const e of lanes.edges) {
      const a = lanes.nodes[e.from];
      if (a.stopLine) continue;
      expect(e.length).toBeLessThanOrEqual(15.0001);
    }
  });

  it('stop-line nodes carry an intersection id and sit just before the intersection', () => {
    const stops = ids.map((i) => lanes.nodes[i]).filter((n) => n.stopLine);
    expect(stops.length).toBeGreaterThanOrEqual(40);
    for (const n of stops) {
      expect(n.intersectionId).toBeDefined();
      const inter = grid.intersections.find((x) => x.id === n.intersectionId)!;
      expect(inter).toBeDefined();
      const dx = Math.abs(n.pos.x - inter.center.x) - inter.halfX;
      const dz = Math.abs(n.pos.z - inter.center.z) - inter.halfZ;
      const outside = Math.max(dx, dz);
      expect(outside).toBeGreaterThan(1);
      expect(outside).toBeLessThan(10);
      // every stop-line node has at least one outgoing edge into the intersection
      expect(lanes.adjacency[n.id].length).toBeGreaterThan(0);
    }
    // non-stop nodes have no intersectionId
    for (const n of ids.map((i) => lanes.nodes[i])) if (!n.stopLine) expect(n.intersectionId).toBeUndefined();
  });

  it('does not allow driving against a one-way street via intersection edges', () => {
    for (const e of lanes.edges) {
      const b = lanes.nodes[e.to];
      const st = grid.streetById(b.streetId);
      if (st.oneWay === 0) continue;
      const expected = st.axis === 'ew' ? (st.oneWay === 1 ? Math.PI / 2 : -Math.PI / 2) : (st.oneWay === 1 ? Math.PI : 0);
      expect(Math.abs(angleDiff(b.heading, expected))).toBeLessThan(1e-6);
    }
  });

  it('nearestLaneNode returns a node within 10 m of a point on Throop', () => {
    const p = { x: 0, z: 37 };
    const n = grid.nearestLaneNode(p);
    expect(Math.hypot(n.pos.x - p.x, n.pos.z - p.z)).toBeLessThan(10);
    expect(n.streetId).toBe('throop');
    const m = grid.nearestLaneNode({ x: -3000, z: -3000 });
    expect(m).toBeDefined();
  });
});

describe('Sidewalk graph', () => {
  const sw = grid.sidewalks;
  const ids = Object.keys(sw.nodes);

  it('is connected in both directions', () => {
    expect(ids.length).toBeGreaterThan(40);
    expect(bfs(sw, ids[0]).size).toBe(ids.length);
    expect(bfs(sw, ids[0], true).size).toBe(ids.length);
    // symmetric edges
    const set = new Set(sw.edges.map((e) => `${e.from}>${e.to}`));
    for (const e of sw.edges) expect(set.has(`${e.to}>${e.from}`)).toBe(true);
  });

  it('adjacency is consistent', () => {
    sw.edges.forEach((e, idx) => {
      expect(sw.adjacency[e.from]).toContain(idx);
      expect(e.length).toBeGreaterThan(0);
    });
  });

  it('every block has a corner node on its sidewalk and no node sits on a roadway', () => {
    for (const id of ids) expect(grid.isOnRoad(sw.nodes[id].pos)).toBe(false);
    for (const b of grid.blocks) {
      const mid = { x: (b.curb[0].x + b.buildingLine[0].x) / 2, z: (b.curb[0].z + b.buildingLine[0].z) / 2 };
      const n = grid.nearestSidewalkNode(mid);
      expect(Math.hypot(n.pos.x - mid.x, n.pos.z - mid.z)).toBeLessThan(1);
    }
  });

  it('sidewalk edges along faces and across crosswalks have sane lengths', () => {
    const maxLen = Math.max(...sw.edges.map((e) => e.length));
    expect(maxLen).toBeLessThan(30);
    // mid-face nodes exist on long faces
    const b = grid.blockById('r2c0');
    const inside = ids.filter((i) => {
      const p = sw.nodes[i].pos;
      return p.x > b.curb[0].x && p.x < b.curb[1].x && p.z > b.curb[0].z && p.z < b.curb[3].z;
    });
    expect(inside.length).toBeGreaterThanOrEqual(8 + 4);
  });

  it('nearestSidewalkNode returns the closest node', () => {
    const target = sw.nodes[ids[7]];
    expect(grid.nearestSidewalkNode(target.pos).id).toBe(target.id);
  });
});

describe('Determinism', () => {
  it('building twice yields identical structure', () => {
    const g2 = buildGrid(loadBedstuyData());
    expect(Object.keys(g2.lanes.nodes)).toEqual(Object.keys(grid.lanes.nodes));
    expect(g2.sidewalks.edges.length).toBe(grid.sidewalks.edges.length);
  });
});
