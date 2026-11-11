import { describe, it, expect } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import {
  REAL_FRAME, clipPolyline, makeFrameProjection, planarFaces, signedArea, simplifyPolyline, snapPoints,
} from '@/world/roadnet/geom';
import { buildRoadNet, classify, displayName, type CenterlineFeature } from '@/world/roadnet/build';
import { decodeRoadNet, encodeRoadNet } from '@/world/roadnet/codec';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';

const P = (x: number, z: number): Vec2 => ({ x, z });

describe('roadnet projection', () => {
  const proj = makeFrameProjection(REAL_FRAME);
  it('puts the origin (Throop x Kosciuszko) at 0,0 and round-trips', () => {
    const o = proj.toGrid(REAL_FRAME.lon0, REAL_FRAME.lat0);
    expect(Math.abs(o.x) + Math.abs(o.z)).toBeLessThan(1e-9);
    const p = { x: 1234.5, z: -987.6 };
    const [lon, lat] = proj.toLonLat(p);
    const q = proj.toGrid(lon, lat);
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(1e-6);
  });
  it('maps the measured Tompkins/Greene and Malcolm X/Greene corners onto one east-west line (grid z = 247)', () => {
    // CSCL vertices, 11 Nov 2026
    const tg = proj.toGrid(-73.94506, 40.68911);
    const mg = proj.toGrid(-73.93062, 40.69077);
    expect(Math.abs(tg.z - mg.z)).toBeLessThan(3);
    expect(tg.z).toBeGreaterThan(240);
    expect(tg.z).toBeLessThan(255);
    expect(mg.x - tg.x).toBeGreaterThan(1225); // Tompkins -242 to Malcolm X 990 (EXPANSION.md)
    expect(mg.x - tg.x).toBeLessThan(1240);
  });
  it('north is -z: a point due north has negative z, a point due east has positive x', () => {
    expect(proj.toGrid(REAL_FRAME.lon0, REAL_FRAME.lat0 + 0.001).z).toBeLessThan(-100);
    expect(proj.toGrid(REAL_FRAME.lon0 + 0.001, REAL_FRAME.lat0).x).toBeGreaterThan(80);
  });
});

describe('roadnet geometry kernel', () => {
  it('snaps endpoints within tolerance into one node (chained, deterministic)', () => {
    const s = snapPoints([P(0, 0), P(0.8, 0), P(1.5, 0), P(10, 10), P(10.2, 10.1)], 1);
    expect(s.index).toEqual([0, 0, 0, 1, 1]);
    expect(s.centres[0].x).toBeCloseTo(0.7667, 3);
    expect(s.centres[1]).toEqual({ x: 10.1, z: 10.05 });
  });
  it('simplifies a straight run to its ends but keeps a bend', () => {
    expect(simplifyPolyline([P(0, 0), P(5, 0.1), P(10, 0)], 0.3)).toHaveLength(2);
    expect(simplifyPolyline([P(0, 0), P(5, 3), P(10, 0)], 0.3)).toHaveLength(3);
  });
  it('clips a polyline to a polygon and flags the cut ends', () => {
    const sq = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
    const r = clipPolyline([P(50, 50), P(150, 50)], sq);
    expect(r).toHaveLength(1);
    expect(r[0].pts[1].x).toBeCloseTo(100);
    expect(r[0]).toMatchObject({ cutA: false, cutB: true });
    const through = clipPolyline([P(-50, 20), P(150, 20)], sq);
    expect(through[0]).toMatchObject({ cutA: true, cutB: true });
  });
  it('extracts the bounded faces of a 2x1 grid with a dead end, positive area inside', () => {
    // nodes: 0..5 grid corners, 6 = dead end poking into the left cell
    const n = [P(0, 0), P(100, 0), P(200, 0), P(0, 80), P(100, 80), P(200, 80), P(50, 40)];
    const E = (a: number, b: number) => ({ a, b, pts: [n[a], n[b]] });
    const edges = [E(0, 1), E(1, 2), E(3, 4), E(4, 5), E(0, 3), E(1, 4), E(2, 5), E(0, 6)];
    const faces = planarFaces(n.length, edges);
    const inner = faces.filter((f) => f.area > 0);
    expect(inner).toHaveLength(2);
    expect(inner.map((f) => f.area).sort()).toEqual([8000, 8000]);
    expect(faces.filter((f) => f.area < 0)).toHaveLength(1);
    // the dead end is walked twice inside the left cell
    const left = inner.find((f) => f.refs.some((r) => Math.abs(r) === 8))!;
    expect(left.refs.filter((r) => Math.abs(r) === 8)).toHaveLength(2);
    expect(signedArea(left.ring)).toBe(8000);
  });
});

describe('roadnet build pipeline (fixture)', () => {
  // three east-west streets and two avenues, plus a diagonal; CSCL-like features in lon/lat around the origin
  const proj = makeFrameProjection(REAL_FRAME);
  const feat = (name: string, pts: Vec2[], extra: Partial<CenterlineFeature> = {}): CenterlineFeature => ({
    full_street_name: name, rw_type: '1', status: '2', trafdir: 'TW', streetwidth: '30', number_travel_lanes: '1',
    from_level_code: '13', to_level_code: '13', physicalid: name + pts[0].x,
    the_geom: { type: 'MultiLineString', coordinates: [pts.map((p) => proj.toLonLat(p))] }, ...extra,
  });
  const features: CenterlineFeature[] = [];
  // E-W streets split per block like CSCL (noded at the avenues)
  for (const z of [0, 82, 164]) {
    features.push(feat('KOSCIUSZKO ST', [P(-50, z), P(0, z)]), feat('KOSCIUSZKO ST', [P(0, z), P(250, z)]), feat('KOSCIUSZKO ST', [P(250, z), P(300, z)]));
  }
  for (const x of [0, 250]) features.push(feat('THROOP AVE', [P(x, -40), P(x, 0)]), feat('THROOP AVE', [P(x, 0), P(x, 82)], { trafdir: 'FT', streetwidth: '34', post_type: 'AVE' }), feat('THROOP AVE', [P(x, 82), P(x, 164)], { trafdir: 'FT', streetwidth: '34', post_type: 'AVE' }), feat('THROOP AVE', [P(x, 164), P(x, 200)]));
  // a diagonal whose ends sit mid-block on the outer streets (T-junctions) and that crosses the middle street unnoded
  features.push(feat('BROADWAY', [P(100, 0), P(180, 164)], { streetwidth: '60', carto_display_level: '20' }));
  // an alley and a path that must be dropped
  features.push(feat('ALLEY', [P(10, 10), P(20, 10)], { rw_type: '10' }), feat('PATH', [P(10, 20), P(20, 20)], { rw_type: '6' }));
  const extent = [P(-30, -30), P(280, -30), P(280, 190), P(-30, 190)];
  const { data, report } = buildRoadNet(features, { frame: REAL_FRAME, extent });

  it('drops paths and alleys, clips to the extent and marks stubs', () => {
    expect(data.edges.some((e) => e.name === 'Alley' || e.name === 'Path')).toBe(false);
    expect(data.nodes.filter((n) => n.control === 'stub').length).toBe(10); // 6 street ends + 4 avenue ends
  });
  it('splits the diagonal at its unnoded crossing and merges same-attribute chains', () => {
    expect(report.splitsAtCrossings).toBeGreaterThanOrEqual(2);
    const bway = data.edges.filter((e) => e.name === 'Broadway');
    expect(bway).toHaveLength(2);
    // the two-way avenue stubs (TW) do not merge with the one-way blocks (FT)
    expect(data.edges.filter((e) => e.name === 'Throop Ave' && e.oneway === 1)).toHaveLength(4);
  });
  it('finds 4 blocks (the diagonal cuts both blocks in two), all positive', () => {
    const real = data.blocks.filter((b) => !b.island);
    expect(real).toHaveLength(4);
    expect(data.blocks.every((b) => b.area > 0)).toBe(true);
  });
  it('classifies and controls intersections', () => {
    expect(data.edges.find((e) => e.name === 'Broadway')!.cls).toBe('arterial');
    expect(data.edges.find((e) => e.name === 'Throop Ave' && e.oneway === 1)!.cls).toBe('avenue');
    expect(data.nodes.filter((n) => n.control === 'signal').length).toBeGreaterThan(0);
  });
  it('round-trips through the compact codec within 0.05 m', () => {
    const back = decodeRoadNet(JSON.parse(JSON.stringify(encodeRoadNet(data))));
    expect(back.edges).toHaveLength(data.edges.length);
    expect(back.blocks.map((b) => b.edges)).toEqual(data.blocks.map((b) => b.edges));
    data.edges.forEach((e, i) => e.pts.forEach((p, k) => {
      expect(Math.abs(back.edges[i].pts[k].x - p.x)).toBeLessThan(0.051);
      expect(Math.abs(back.edges[i].pts[k].z - p.z)).toBeLessThan(0.051);
    }));
  });
  it('queries: nearest street name, edge at point, block at point', () => {
    const net = new RoadNet(data);
    expect(net.streetNameAt(P(120, 3))).toBe('Kosciuszko St');
    expect(net.streetNameAt(P(3, 120))).toBe('Throop Ave');
    expect(net.edgeAt(P(120, 3))).not.toBeNull();
    expect(net.edgeAt(P(60, 30))).toBeNull();
    expect(net.blockAt(P(60, 30))).toBeGreaterThanOrEqual(0);
    expect(net.blockAt(P(-20, 30))).toBe(-1);
  });
  it('helpers', () => {
    expect(displayName('MALCOLM X BLVD')).toBe('Malcolm X Blvd');
    expect(displayName('S  1 ST')).toBe('S 1 St');
    expect(classify({ the_geom: { type: 'LineString', coordinates: [] }, rw_type: '2' })).toBe('highway');
  });
});

describe('GridModel -> RoadNet adapter', () => {
  const grid = buildGrid(loadBedstuyData());
  const net = roadNetFromGrid(grid);
  it('has one node per intersection, one edge per segment and recovers every grid block', () => {
    expect(net.nodes).toHaveLength(grid.intersections.length);
    expect(net.edges).toHaveLength(grid.segments.length);
    expect(net.blocks).toHaveLength(grid.blocks.length);
    expect(new Set(net.blocks.map((b) => b.ref)).size).toBe(grid.blocks.length);
  });
  it('derives curb polygons that match the grid blocks', () => {
    for (let i = 0; i < net.blocks.length; i++) {
      const gb = grid.blockById(net.blocks[i].ref!);
      const curb = net.blockOutline(i);
      const xs = curb.map((p) => p.x), zs = curb.map((p) => p.z);
      const gx = gb.curb.map((p) => p.x), gz = gb.curb.map((p) => p.z);
      expect(Math.min(...xs)).toBeCloseTo(Math.min(...gx), 1);
      expect(Math.max(...xs)).toBeCloseTo(Math.max(...gx), 1);
      expect(Math.min(...zs)).toBeCloseTo(Math.min(...gz), 1);
      expect(Math.max(...zs)).toBeCloseTo(Math.max(...gz), 1);
    }
  });
  it('answers the same street-name and on-road queries as the grid', () => {
    const probes = [P(5, 30), P(120, 1), P(-100, -60), P(400, 210)];
    for (const p of probes) expect(net.streetNameAt(p)).toBe(grid.nearestStreet(p).name);
    for (const s of grid.segments.slice(0, 20)) {
      const mid = { x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 };
      expect(net.isOnRoad(mid)).toBe(grid.isOnRoad(mid));
    }
  });
});

describe('roadnet-core.json (R1+R2 import, NYC Centerline)', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
  const { phaseOf } = await import('@/world/roadnet/extents');
  const net = RoadNet.fromJson(core);
  it('has the real Bed-Stuy and Bushwick streets with sane counts', () => {
    const names = new Set(net.edges.map((e) => e.name));
    for (const n of ['Throop Ave', 'Kosciuszko St', 'Dekalb Ave', 'Broadway', 'Bushwick Ave', 'Knickerbocker Ave', 'Myrtle Ave', 'Flushing Ave', 'Malcolm X Blvd', 'Marcus Garvey Blvd']) {
      expect(names.has(n), n).toBe(true);
    }
    expect(net.edges.length).toBeGreaterThan(450);
    expect(net.blocks.filter((b) => !b.island).length).toBeGreaterThan(150);
    expect(net.blocks.every((b) => b.area > 0)).toBe(true);
  });
  it('puts the origin on Throop x Kosciuszko and Broadway at 45 degrees to the grid', () => {
    expect(net.streetNameAt(P(2, 40))).toBe('Throop Ave');
    expect(net.streetNameAt(P(120, 1))).toBe('Kosciuszko St');
    const b = net.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.name === 'Broadway');
    expect(b.every(({ e }) => e.cls === 'arterial')).toBe(true);
    const longest = b.sort((x, y) => net.lengths[y.i] - net.lengths[x.i])[0];
    const d = net.pointAt(longest.i, net.lengths[longest.i] / 2).dir;
    expect(Math.abs(Math.abs(Math.atan2(d.z, d.x) * 180 / Math.PI) - 135) < 4 || Math.abs(Math.abs(Math.atan2(d.z, d.x) * 180 / Math.PI) - 45) < 4).toBe(true);
  });
  it('assigns phases: Throop/Kosciuszko is R1, Bushwick Ave/Central is R2', () => {
    expect(phaseOf(P(0, 0))).toBe('R1');
    expect(phaseOf(P(1600, -150))).toBe('R2');
    expect(phaseOf(P(5000, 5000))).toBeNull();
  });
});
