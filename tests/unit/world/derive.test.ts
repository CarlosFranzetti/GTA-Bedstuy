import { describe, it, expect } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { planarFaces, signedArea } from '@/world/roadnet/geom';
import { RoadNet, roadNetFromGrid, type RNBlockData, type RNEdgeData, type RNNodeData, type RoadClass } from '@/world/roadnet/RoadNet';
import { deriveGeometry, isSimpleRing, type Derived } from '@/world/roadnet/derive';
import { loadMapSource, mapKindFromSearch } from '@/world/roadnet/MapSource';
import type { RoadNetJson } from '@/world/roadnet/codec';

const P = (x: number, z: number): Vec2 => ({ x, z });

/** star fixture: centre node 0 at the origin, one straight leg per bearing (degrees, atan2(dz,dx)), each ending in a stub 100 m out */
function star(bearings: number[], width = 10, cls: RoadClass = 'street', sidewalk = 4): RoadNet {
  const nodes: RNNodeData[] = [{ p: P(0, 0), control: 'signal' }];
  const edges: RNEdgeData[] = [];
  bearings.forEach((b, i) => {
    const t = (b * Math.PI) / 180;
    nodes.push({ p: P(100 * Math.cos(t), 100 * Math.sin(t)), control: 'stub' });
    edges.push({ a: 0, b: i + 1, pts: [nodes[0].p, nodes[i + 1].p], name: 'S' + i, cls, width, sidewalk, lanes: 2, oneway: 0, level: 0 });
  });
  return withBlocks(nodes, edges);
}

function withBlocks(nodes: RNNodeData[], edges: RNEdgeData[]): RoadNet {
  const faces = planarFaces(nodes.length, edges).filter((f) => f.area > 0);
  const blocks: RNBlockData[] = faces.map((f) => ({ edges: f.refs, area: f.area, island: false }));
  return new RoadNet({ version: 1, frame: { lat0: 0, lon0: 0, rotDeg: 0 }, extent: [], nodes, edges, blocks });
}

const area = (r: Vec2[]): number => signedArea(r);

describe('map switch (WP0)', () => {
  it('reads ?map=real, everything else is the grid', () => {
    expect(mapKindFromSearch('?map=real')).toBe('real');
    expect(mapKindFromSearch('?q=low&map=REAL')).toBe('real');
    expect(mapKindFromSearch('')).toBe('grid');
    expect(mapKindFromSearch('?map=grid')).toBe('grid');
    expect(mapKindFromSearch('?map=')).toBe('grid');
    expect(mapKindFromSearch('?maps=real')).toBe('grid');
  });
  it('grid source adapts the grid lazily; real source loads the core network', async () => {
    const grid = buildGrid(loadBedstuyData());
    const g = await loadMapSource('', grid);
    expect(g.kind).toBe('grid');
    expect(g.grid).toBe(grid);
    expect(g.net.nodes).toHaveLength(grid.intersections.length);
    expect(g.net).toBe(g.net);
    const r = await loadMapSource('?map=real', grid);
    expect(r.kind).toBe('real');
    const core = (await import('@/world/data/roadnet-core.json')).default as unknown as RoadNetJson;
    expect(r.net.edges.length).toBe(core.e.length);
  });
});

describe('derived junction geometry: fixtures', () => {
  it('4-leg square with sharp corners equals the grid box (width 10 -> 10 x 10 m)', () => {
    const net = star([0, 90, 180, 270]);
    const d = deriveGeometry(net, { rStreet: 0 });
    const poly = d.nodePolys[0];
    expect(area(poly)).toBeCloseTo(100, 6);
    const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
    expect(Math.min(...xs)).toBeCloseTo(-5); expect(Math.max(...xs)).toBeCloseTo(5);
    expect(Math.min(...zs)).toBeCloseTo(-5); expect(Math.max(...zs)).toBeCloseTo(5);
    d.legs.filter((l) => l.node === 0).forEach((l) => expect(l.cut).toBeCloseTo(5));
  });
  it('4-leg square with curb returns: area = box + 4 (r^2 - pi r^2 / 4), arcs have the radius, tangent length r', () => {
    const net = star([0, 90, 180, 270]);
    const d = deriveGeometry(net);
    const r = 4.5;
    // the polygon includes the four 10 m wide arms out to their cuts (5 + r) and the four corner fills
    expect(Math.abs(area(d.nodePolys[0]) - (100 + 4 * 10 * r + 4 * (r * r - (Math.PI * r * r) / 4)))).toBeLessThan(1);
    const fillets = d.returns.filter((c) => c.node === 0 && c.kind === 'fillet');
    expect(fillets).toHaveLength(4);
    for (const f of fillets) {
      expect(f.radius).toBe(r);
      for (const p of f.pts.slice(1, -1)) expect(Math.hypot(p.x - f.center!.x, p.z - f.center!.z)).toBeCloseTo(r, 6);
      expect(Math.hypot(f.pts[0].x - f.apex!.x, f.pts[0].z - f.apex!.z)).toBeCloseTo(r, 6);
    }
    d.legs.filter((l) => l.node === 0).forEach((l) => expect(l.cut).toBeCloseTo(5 + r));
  });
  it('avenues use 6 m, streets 4.5 m, mixed corners take the larger', () => {
    const nodes: RNNodeData[] = [{ p: P(0, 0), control: 'signal' }, ...[P(100, 0), P(0, 100), P(-100, 0), P(0, -100)].map((p) => ({ p, control: 'stub' as const }))];
    const mk = (b: number, cls: RoadClass, width: number): RNEdgeData => ({ a: 0, b, pts: [nodes[0].p, nodes[b].p], name: 'x', cls, width, sidewalk: 4, lanes: 2, oneway: 0, level: 0 });
    const net = withBlocks(nodes, [mk(1, 'avenue', 14), mk(2, 'street', 10), mk(3, 'avenue', 14), mk(4, 'street', 10)]);
    const d = deriveGeometry(net);
    expect(d.returns.filter((c) => c.node === 0).every((c) => c.radius === 6)).toBe(true);
    const st = deriveGeometry(star([0, 90, 180, 270], 10, 'street'));
    expect(st.returns.filter((c) => c.node === 0).every((c) => c.radius === 4.5)).toBe(true);
  });
  it('T-junction: straight kerb on the through side, two returns on the stem side', () => {
    const net = star([0, 180, 90]);
    const d = deriveGeometry(net);
    const rs = d.returns.filter((c) => c.node === 0);
    expect(rs.filter((c) => c.kind === 'fillet')).toHaveLength(2);
    expect(rs.filter((c) => c.kind === 'bevel')).toHaveLength(1);
    expect(isSimpleRing(d.nodePolys[0])).toBe(true);
    expect(area(d.nodePolys[0])).toBeGreaterThan(100);
    // the straight kerb runs at z = -5 (stem points to +z): no vertex of the polygon pokes beyond it
    expect(Math.min(...d.nodePolys[0].map((p) => p.z))).toBeCloseTo(-5, 6);
  });
  it('45 degree wye (and 30, 25 degree) has simple polygons with positive area and fillets at the acute corner', () => {
    for (const a of [45, 30, 25]) {
      const net = star([0, a, 180]);
      const d = deriveGeometry(net);
      const poly = d.nodePolys[0];
      expect(isSimpleRing(poly), `wye ${a}`).toBe(true);
      expect(area(poly), `wye ${a}`).toBeGreaterThan(0);
      const acute = d.returns.find((c) => c.node === 0 && Math.abs(c.angleDeg - a) < 0.01)!;
      expect(acute.kind).toBe('fillet');
      expect(acute.radius).toBeCloseTo(4.5, 6);
      // tangent length r / tan(phi/2)
      expect(Math.hypot(acute.pts[0].x - acute.apex!.x, acute.pts[0].z - acute.apex!.z)).toBeCloseTo(4.5 / Math.tan((a * Math.PI) / 360), 6);
    }
  });
  it('5- and 6-leg junctions (regular and irregular) are simple with every leg cut at or beyond its corners', () => {
    const sets = [[0, 72, 144, 216, 288], [0, 60, 120, 180, 240, 300], [0, 40, 95, 180, 230, 300], [0, 35, 45, 135, 225, 315]];
    for (const b of sets) {
      const d = deriveGeometry(star(b));
      expect(isSimpleRing(d.nodePolys[0]), b.join()).toBe(true);
      expect(area(d.nodePolys[0]), b.join()).toBeGreaterThan(0);
      expect(d.legsAt[0]).toHaveLength(b.length);
    }
  });
  it('dead end and stub: no node polygon, ribbon ends at the node', () => {
    const d = deriveGeometry(star([0]));
    expect(d.nodePolys[0]).toEqual([]);
    expect(d.nodePolys[1]).toEqual([]);
    expect(d.cuts[0]).toEqual({ cutA: 0, cutB: 0 });
  });
  it('straight pass-through node has no polygon; a 60 degree bend has a simple one', () => {
    expect(deriveGeometry(star([0, 180])).nodePolys[0]).toEqual([]);
    const d = deriveGeometry(star([0, 120]));
    expect(isSimpleRing(d.nodePolys[0])).toBe(true);
    expect(area(d.nodePolys[0])).toBeGreaterThan(0);
  });
  it('shrinks radii on a short edge instead of overlapping, and reports it', () => {
    // two T-junctions 14 m apart on one avenue: nominal cuts 5+4.5 each exceed the 14 m link
    const nodes: RNNodeData[] = [P(0, 0), P(14, 0), P(-100, 0), P(114, 0), P(0, 100), P(14, -100)].map((p) => ({ p, control: 'signal' as const }));
    const mk = (a: number, b: number): RNEdgeData => ({ a, b, pts: [nodes[a].p, nodes[b].p], name: 'x', cls: 'street', width: 10, sidewalk: 4, lanes: 2, oneway: 0, level: 0 });
    const net = withBlocks(nodes, [mk(0, 1), mk(2, 0), mk(1, 3), mk(0, 4), mk(1, 5)]);
    const d = deriveGeometry(net);
    const link = d.cuts[0];
    expect(link.cutA + link.cutB).toBeLessThanOrEqual(14 - 1 + 1e-9);
    expect(d.returns.some((c) => c.kind === 'fillet' && c.radius < c.wanted)).toBe(true);
  });
  it('block rings: a 2 x 2 cell grid has 4 blocks with positive, simple curb and building rings; building line is inside the kerb', () => {
    const d = deriveGeometry(grid3());
    expect(d.curbRings.length).toBe(4);
    d.curbRings.forEach((r, i) => {
      expect(area(r)).toBeGreaterThan(0);
      expect(isSimpleRing(r)).toBe(true);
      expect(d.buildingRings[i].length).toBeGreaterThan(3);
      expect(area(d.buildingRings[i])).toBeLessThan(area(r));
      expect(isSimpleRing(d.buildingRings[i])).toBe(true);
    });
    // 100 m cells, width 10, sidewalk 4: kerb 90 x 90 less four corner cut-offs of r^2 (1 - pi/4)
    expect(Math.abs(area(d.curbRings[0]) - (90 * 90 - 4 * 4.5 * 4.5 * (1 - Math.PI / 4)))).toBeLessThan(1);
  });
});

function grid3(): RoadNet {
  const xs = [0, 100, 200], zs = [0, 100, 200];
  const nodes: RNNodeData[] = [];
  for (const z of zs) for (const x of xs) nodes.push({ p: P(x, z), control: 'signal' });
  const edges: RNEdgeData[] = [];
  const mk = (a: number, b: number): void => { edges.push({ a, b, pts: [nodes[a].p, nodes[b].p], name: 'x', cls: 'street', width: 10, sidewalk: 4, lanes: 2, oneway: 0, level: 0 }); };
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) mk(r * 3 + c, r * 3 + c + 1);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) mk(r * 3 + c, (r + 1) * 3 + c);
  return withBlocks(nodes, edges);
}

describe('derived geometry on the GridModel adapter', () => {
  const grid = buildGrid(loadBedstuyData());
  const net = roadNetFromGrid(grid);
  const d = deriveGeometry(net, { rStreet: 0, rAvenue: 0 });
  it('sharp node polygons of interior 4-way nodes equal the grid intersection boxes', () => {
    let checked = 0;
    net.nodes.forEach((n, v) => {
      if (d.legsAt[v].length !== 4) return;
      const it = grid.intersections.find((i) => i.id === n.ref)!;
      const poly = d.nodePolys[v];
      expect(poly.length).toBeGreaterThan(3);
      const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
      expect(Math.min(...xs)).toBeCloseTo(it.center.x - it.halfX, 4);
      expect(Math.max(...xs)).toBeCloseTo(it.center.x + it.halfX, 4);
      expect(Math.min(...zs)).toBeCloseTo(it.center.z - it.halfZ, 4);
      expect(Math.max(...zs)).toBeCloseTo(it.center.z + it.halfZ, 4);
      expect(area(poly)).toBeCloseTo(4 * it.halfX * it.halfZ, 4);
      checked++;
    });
    expect(checked).toBeGreaterThan(20);
  });
  it('sharp curb rings equal the grid block curbs', () => {
    for (let i = 0; i < net.blocks.length; i++) {
      const gb = grid.blockById(net.blocks[i].ref!);
      const r = d.curbRings[i];
      expect(Math.min(...r.map((p) => p.x))).toBeCloseTo(Math.min(...gb.curb.map((p) => p.x)), 3);
      expect(Math.max(...r.map((p) => p.x))).toBeCloseTo(Math.max(...gb.curb.map((p) => p.x)), 3);
      expect(Math.min(...r.map((p) => p.z))).toBeCloseTo(Math.min(...gb.curb.map((p) => p.z)), 3);
      expect(Math.max(...r.map((p) => p.z))).toBeCloseTo(Math.max(...gb.curb.map((p) => p.z)), 3);
      expect(area(r)).toBeCloseTo(Math.abs(area(gb.curb)), 2);
    }
  });
});

describe('derived geometry on the real R1+R2 network', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as unknown as RoadNetJson;
  const net = RoadNet.fromJson(core);
  const d: Derived = deriveGeometry(net);

  it('every edge end belongs to exactly one intersection (leg of exactly one node)', () => {
    expect(d.legs).toHaveLength(net.edges.length * 2);
    const seen = new Map<number, number>();
    d.legsAt.forEach((ids, v) => ids.forEach((id) => { seen.set(id, (seen.get(id) ?? 0) + 1); expect(d.legs[id].node).toBe(v); }));
    expect(seen.size).toBe(net.edges.length * 2);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    net.edges.forEach((e, i) => { expect(d.legs[2 * i].node).toBe(e.a); expect(d.legs[2 * i + 1].node).toBe(e.b); });
  });
  it('every node polygon is simple with positive area; all 3+ leg nodes have one', () => {
    const bad: string[] = [];
    net.nodes.forEach((n, v) => {
      const deg = d.legsAt[v].length;
      const poly = d.nodePolys[v];
      if (deg >= 3 && poly.length < 3) bad.push(`node ${v} deg ${deg} has no polygon`);
      if (poly.length && (!isSimpleRing(poly) || area(poly) <= 0)) bad.push(`node ${v} at ${n.p.x.toFixed(0)},${n.p.z.toFixed(0)} not simple/positive`);
    });
    expect(bad).toEqual([]);
  });
  it('curb radius rules: street 4.5 m, avenue/arterial 6 m, never above wanted, never below rMin; shrunk only on short edges', () => {
    const fillets = d.returns.filter((c) => c.kind === 'fillet');
    expect(fillets.length).toBeGreaterThan(500);
    for (const f of fillets) {
      expect([4.5, 6]).toContain(f.wanted);
      expect(f.radius).toBeLessThanOrEqual(f.wanted + 1e-9);
      expect(f.radius).toBeGreaterThanOrEqual(d.opts.rMin - 1e-9);
      if (f.radius < f.wanted) {
        // only short edges (two junctions closer than their return lengths) force a smaller radius
        expect(Math.min(net.lengths[d.legs[f.legA].edge], net.lengths[d.legs[f.legB].edge])).toBeLessThan(120);
      }
      // every fillet arc point lies at its radius from the centre
      for (const p of f.pts.slice(1, -1)) expect(Math.hypot(p.x - f.center!.x, p.z - f.center!.z)).toBeCloseTo(f.radius, 5);
    }
    const shrunk = fillets.filter((f) => f.radius < f.wanted).length;
    expect(shrunk / fillets.length).toBeLessThan(0.1);
  });
  it('right-angle corners of avenue x street nodes use 6 m', () => {
    const av = d.returns.filter((c) => c.kind === 'fillet' && c.wanted === 6);
    const st = d.returns.filter((c) => c.kind === 'fillet' && c.wanted === 4.5);
    expect(av.length).toBeGreaterThan(100);
    expect(st.length).toBeGreaterThan(100);
  });
  it('cuts: ribbons exist on nearly all edges; overlapping (no-ribbon) edges are the exception', () => {
    const over = net.edges.filter((_, i) => d.cuts[i].cutA + d.cuts[i].cutB >= net.lengths[i]);
    expect(over.length / net.edges.length).toBeLessThan(0.08);
  });
  it('every non-island block has a simple, positive kerb ring and building line (islands may be empty)', () => {
    const bad: string[] = [];
    net.blocks.forEach((b, i) => {
      const cr = d.curbRings[i];
      if (b.island) { if (cr.length) expect(isSimpleRing(cr) && area(cr) > 0).toBe(true); return; }
      if (cr.length < 3 || area(cr) <= 0 || !isSimpleRing(cr)) bad.push(`block ${i} kerb (area ${b.area.toFixed(0)})`);
    });
    expect(bad).toEqual([]);
    const noLine = net.blocks.map((b, i) => ({ b, i })).filter(({ b, i }) => !b.island && d.buildingRings[i].length === 0);
    expect(noLine.map(({ i }) => i)).toEqual([]);
  });
  it('kerb rings lie inside the centreline ring and building lines inside the kerb (areas shrink)', () => {
    net.blocks.forEach((b, i) => {
      if (b.island || !d.buildingRings[i].length) return;
      expect(area(d.curbRings[i])).toBeLessThan(b.area);
      expect(area(d.buildingRings[i])).toBeLessThan(area(d.curbRings[i]));
    });
  });
});
