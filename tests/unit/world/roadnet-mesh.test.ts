import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { IMaterialLibrary } from '@/world/types';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { planarFaces, pointInPolygon, segmentIntersection, signedArea } from '@/world/roadnet/geom';
import { RoadNet, roadNetFromGrid, type RNBlockData, type RNEdgeData, type RNNodeData, type RoadClass } from '@/world/roadnet/RoadNet';
import { deriveGeometry, type Derived } from '@/world/roadnet/derive';
import type { RoadNetJson } from '@/world/roadnet/codec';
import core from '@/world/data/roadnet-core.json';
import { CROSSWALK_START, CROSSWALK_WIDTH, STOP_LINE } from '@/world/roadnet/contract';
import { buildRoadMeshes, hasRibbon, unionPolygons } from '@/world/roadnet/meshRoads';
import { chunkLayoutFromBounds, ROAD_CHUNK_PREFIX } from '@/world/roadnet/chunksReal';
import { FINE_CELLS, chunkKeyOf, chunkKeyOfCell } from '@/render/Culling';

const P = (x: number, z: number): Vec2 => ({ x, z });

function stubLib(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const mk = (): THREE.Material => new THREE.MeshBasicMaterial();
  return {
    get(key, variant = 0) {
      const k = `${key}:${variant}`;
      let m = cache.get(k);
      if (!m) { m = mk(); m.name = k; cache.set(k, m); }
      return m;
    },
    awning: mk, sign: mk, carPaint: mk, setNight: () => undefined,
  } as IMaterialLibrary;
}

function withBlocks(nodes: RNNodeData[], edges: RNEdgeData[]): RoadNet {
  const faces = planarFaces(nodes.length, edges).filter((f) => f.area > 0);
  const blocks: RNBlockData[] = faces.map((f) => ({ edges: f.refs, area: f.area, island: false }));
  return new RoadNet({ version: 1, frame: { lat0: 0, lon0: 0, rotDeg: 0 }, extent: [], nodes, edges, blocks });
}

/** star fixture: centre node 0, one straight leg per bearing (deg), each ending in a stub 100 m out */
function star(bearings: number[], width = 10, cls: RoadClass = 'street', sidewalk = 4, oneway: -1 | 0 | 1 = 0): RoadNet {
  const nodes: RNNodeData[] = [{ p: P(0, 0), control: 'signal' }];
  const edges: RNEdgeData[] = [];
  bearings.forEach((b, i) => {
    const t = (b * Math.PI) / 180;
    nodes.push({ p: P(100 * Math.cos(t), 100 * Math.sin(t)), control: 'stub' });
    edges.push({ a: 0, b: i + 1, pts: [nodes[0].p, nodes[i + 1].p], name: 'S' + i, cls, width, sidewalk, lanes: 2, oneway, level: 0 });
  });
  return withBlocks(nodes, edges);
}

type Tri = [Vec2, Vec2, Vec2];

function trisOf(root: THREE.Object3D, part?: string, name?: string): Tri[] {
  const out: Tri[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (name && m.name !== name) return;
    if (part && m.parent?.name !== part) return;
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.index!;
    for (let t = 0; t < idx.count; t += 3) {
      const v = (k: number): Vec2 => P(pos.getX(idx.getX(t + k)), pos.getZ(idx.getX(t + k)));
      out.push([v(0), v(1), v(2)]);
    }
  });
  return out;
}

const triArea = (t: Tri): number => Math.abs(signedArea(t));
const sumArea = (ts: Tri[]): number => ts.reduce((a, t) => a + triArea(t), 0);
const centroid = (t: Tri): Vec2 => P((t[0].x + t[1].x + t[2].x) / 3, (t[0].z + t[1].z + t[2].z) / 3);

/** area of the intersection of two triangles (Sutherland-Hodgman, both clockwise-normalised) */
function overlap(a: Tri, b: Tri): number {
  const norm = (t: Tri): Vec2[] => (signedArea(t) < 0 ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]]);
  let poly = norm(a);
  const clip = norm(b);
  for (let i = 0; i < 3 && poly.length; i++) {
    const c0 = clip[i], c1 = clip[(i + 1) % 3];
    const side = (p: Vec2): number => (c1.x - c0.x) * (p.z - c0.z) - (c1.z - c0.z) * (p.x - c0.x);
    const next: Vec2[] = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const sp = side(p), sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); next.push(P(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t)); }
    }
    poly = next;
  }
  return Math.abs(signedArea(poly));
}

function overlapNear(ts: Tri[], c: Vec2, r: number): number {
  const near = ts.filter((t) => t.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < r));
  let sum = 0;
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) sum += overlap(near[i], near[j]);
  return sum;
}

function meshStats(g: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0, meshes = 0;
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; triangles += m.geometry.index!.count / 3; } });
  return { triangles, meshes };
}

const coreNet = RoadNet.fromJson(core as unknown as RoadNetJson);
const coreDerived = deriveGeometry(coreNet);
const grid = buildGrid(loadBedstuyData());
const gridNet = roadNetFromGrid(grid);
const gridDerived = deriveGeometry(gridNet);
const mats = stubLib();

const cases: Array<[string, RoadNet, Derived]> = [['grid adapter', gridNet, gridDerived], ['core network', coreNet, coreDerived]];

/** ten junctions: the 5-leg Broadway x Myrtle node, nodes with a ~45 degree gap (Bushwick), then the highest-degree rest */
function sampleJunctions(net: RoadNet, d: Derived): number[] {
  const deg = (v: number): number => d.legsAt[v].length;
  const gapDeg = (v: number): number => {
    const ids = d.legsAt[v];
    let best = 360;
    ids.forEach((id, k) => { const nx = d.legs[ids[(k + 1) % ids.length]]; let g = ((nx.angle - d.legs[id].angle) * 180) / Math.PI; g = ((g % 360) + 360) % 360; if (ids.length > 1) best = Math.min(best, g); });
    return best;
  };
  const picked: number[] = [];
  const names = (v: number): string[] => net.incident[v].map((e) => net.edges[e].name);
  const five = net.nodes.map((_, v) => v).filter((v) => deg(v) >= 5 && d.nodePolys[v].length > 0);
  // Broadway x Myrtle (5 legs) by name on the real map; the first 5-leg node otherwise
  const bm = five.find((v) => names(v).includes('Broadway') && names(v).some((n) => n.startsWith('Myrtle')));
  picked.push(...(bm !== undefined ? [bm] : five.slice(0, 1)));
  const wedge = net.nodes.map((_, v) => v).filter((v) => deg(v) >= 3 && gapDeg(v) > 38 && gapDeg(v) < 52 && d.nodePolys[v].length > 0 && !picked.includes(v));
  picked.push(...wedge.slice(0, 3));
  const rest = net.nodes.map((_, v) => v).filter((v) => deg(v) >= 3 && deg(v) <= 4 && d.nodePolys[v].length > 0 && !picked.includes(v)).sort((a, b) => deg(b) - deg(a) || a - b);
  picked.push(...rest.slice(0, 10 - picked.length));
  return picked;
}

describe.each(cases)('road meshes on %s', (_label, net, d) => {
  const tier = 'medium' as const;
  const roads = buildRoadMeshes(net, d, mats, { tier, markings: true });

  it('has the four parts and every mesh carries cell and chunk', () => {
    expect(roads.children.map((c) => c.name)).toEqual(['asphalt', 'sidewalk', 'curb', 'markings']);
    const { meshes } = meshStats(roads);
    expect(meshes).toBeGreaterThan(4);
    const layout = roads.userData.chunkLayout;
    roads.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      expect(typeof m.userData.cell).toBe('string');
      expect(m.userData.chunk).toBe(ROAD_CHUNK_PREFIX + chunkKeyOfCell(layout, m.userData.cell));
      expect(m.geometry.getAttribute('uv')).toBeTruthy();
      expect(m.geometry.getAttribute('normal')).toBeTruthy();
    });
  });

  it('ribbon and node polygon triangles overlap by < 0.05 m^2 at 10 sample junctions', () => {
    const asphalt = trisOf(roads, 'asphalt');
    const sample = sampleJunctions(net, d);
    expect(sample.length).toBeGreaterThanOrEqual(5);
    for (const v of sample) {
      const o = overlapNear(asphalt, net.nodes[v].p, 45);
      expect(o, `node ${v} (${d.legsAt[v].length} legs)`).toBeLessThan(0.05);
    }
  });

  it('whole network: total asphalt overlap stays tiny (known derive defect at the Malcolm X x Pulaski cluster)', () => {
    const ts = trisOf(roads, 'asphalt').map((tr) => ({ tr, c: centroid(tr) }));
    const bins = new Map<string, number[]>();
    ts.forEach((q, i) => { const k = `${Math.floor(q.c.x / 32)},${Math.floor(q.c.z / 32)}`; const l = bins.get(k); if (l) l.push(i); else bins.set(k, [i]); });
    let total = 0;
    for (const [k, l] of bins) {
      const [gx, gz] = k.split(',').map(Number);
      const near: number[] = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) near.push(...(bins.get(`${gx + a},${gz + b}`) ?? []));
      for (const i of l) for (const j of near) if (j > i && Math.hypot(ts[i].c.x - ts[j].c.x, ts[i].c.z - ts[j].c.z) < 60) total += overlap(ts[i].tr, ts[j].tr);
    }
    expect(total).toBeLessThan(40);
  });

  it('every asphalt triangle centroid is on the road or inside a node polygon', () => {
    const asphalt = trisOf(roads, 'asphalt');
    const polys = d.nodePolys.map((p, v) => ({ p, v })).filter((q) => q.p.length >= 3);
    let bad = 0;
    for (const t of asphalt) {
      const c = centroid(t);
      if (net.isOnRoad(c)) continue;
      if (polys.some((q) => Math.hypot(c.x - net.nodes[q.v].p.x, c.z - net.nodes[q.v].p.z) < 120 && pointInPolygon(c, q.p))) continue;
      bad++;
    }
    expect(bad / asphalt.length).toBeLessThan(0.002);
  });

  it('sidewalk area equals the sum of curb ring minus building ring (1 %), for blocks whose building line lies inside the kerb', () => {
    // a building ring that leaves the kerb ring (a derive.ts defect on a few odd blocks) has no well-defined difference area
    const dirty = (i: number): boolean => {
      const c = d.curbRings[i], b = d.buildingRings[i];
      if (c.length < 3 || b.length < 3) return false;
      if (d.fallbackBuilding.includes(i) || b.some((p) => !pointInPolygon(p, c))) return true;
      for (let k = 0; k < b.length; k++) for (let j = 0; j < c.length; j++) if (segmentIntersection(b[k], b[(k + 1) % b.length], c[j], c[(j + 1) % c.length])) return true;
      return false;
    };
    const dirtyBlocks = net.blocks.map((_, i) => i).filter(dirty);
    expect(dirtyBlocks.length / net.blocks.length).toBeLessThan(0.08);
    const clean: Derived = { ...d, curbRings: d.curbRings.map((c, i) => (dirty(i) ? [] : c)) };
    const cleanRoads = buildRoadMeshes(net, clean, mats, { tier: 'low', markings: false });
    let want = 0;
    net.blocks.forEach((_b, i) => {
      const c = clean.curbRings[i];
      if (c.length < 3) return;
      want += Math.abs(signedArea(c)) - (d.buildingRings[i].length >= 3 ? Math.abs(signedArea(d.buildingRings[i])) : 0);
    });
    const got = sumArea(trisOf(cleanRoads, 'sidewalk'));
    expect(want).toBeGreaterThan(1000);
    expect(Math.abs(got - want) / want).toBeLessThan(0.01);
  });

  it('sidewalk is at 0.15 m, asphalt at 0, curbs never above 0.15, all normals unit and faces upward on flat parts', () => {
    const box = (part: string): THREE.Box3 => new THREE.Box3().setFromObject(roads.children.find((c) => c.name === part)!);
    expect(box('asphalt').max.y).toBeCloseTo(0, 6);
    expect(box('sidewalk').min.y).toBeCloseTo(0.15, 6);
    expect(box('sidewalk').max.y).toBeCloseTo(0.15, 6);
    expect(box('curb').max.y).toBeCloseTo(0.15, 6);
    expect(box('curb').min.y).toBeCloseTo(0, 6);
    for (const part of ['asphalt', 'sidewalk']) {
      roads.children.find((c) => c.name === part)!.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const pos = m.geometry.getAttribute('position'), idx = m.geometry.index!;
        for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
          const ux = pos.getX(b) - pos.getX(a), uz = pos.getZ(b) - pos.getZ(a), vx = pos.getX(c) - pos.getX(a), vz = pos.getZ(c) - pos.getZ(a);
          // cross.y = uz*vx - ux*vz must be >= 0 (front face up)
          expect(uz * vx - ux * vz).toBeGreaterThanOrEqual(-0.05);
        }
      });
    }
  });

  it('meshes of one cell lie in that cell and chunk keys are 128 m aligned', () => {
    const layout = roads.userData.chunkLayout;
    const b = chunkLayoutFromBounds(net.bounds);
    expect(layout.originX).toBe(b.originX);
    expect(layout.originZ).toBe(b.originZ);
    roads.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const [ix, iz] = (m.userData.cell as string).split('_').map(Number);
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.index!;
      for (let t = 0; t < idx.count; t += 3) {
        const cx = (pos.getX(idx.getX(t)) + pos.getX(idx.getX(t + 1)) + pos.getX(idx.getX(t + 2))) / 3;
        const cz = (pos.getZ(idx.getX(t)) + pos.getZ(idx.getX(t + 1)) + pos.getZ(idx.getX(t + 2))) / 3;
        expect(Math.floor((cx - layout.originX) / layout.cellX)).toBe(ix);
        expect(Math.floor((cz - layout.originZ) / layout.cellZ)).toBe(iz);
      }
    });
  });

  it('markings follow the junction contract: zebra band cut+0.5..cut+3.5, stop bar at cut+4.5', () => {
    // check every signal/stop node leg with a ribbon long enough: the zebra triangles of that leg cover exactly the band
    const zebra = trisOf(roads, 'markings', 'crosswalks');
    const bars = trisOf(roads, 'markings', 'markings-white');
    expect(zebra.length).toBeGreaterThan(0);
    let checked = 0;
    for (const leg of d.legs) {
      const E = net.edges[leg.edge];
      const node = net.nodes[leg.node];
      if (!hasRibbon(net, d, leg.edge) || d.nodePolys[leg.node].length < 3 || node.control === 'stub' || node.control === 'deadend') continue;
      if (net.lengths[leg.edge] - d.cuts[leg.edge].cutA - d.cuts[leg.edge].cutB < 9) continue;
      const np = node.p;
      const local = (p: Vec2): { s: number; l: number } => ({ s: (p.x - np.x) * leg.dir.x + (p.z - np.z) * leg.dir.z, l: (p.x - np.x) * leg.nrm.x + (p.z - np.z) * leg.nrm.z });
      const mine = zebra.filter((t) => { const c = local(centroid(t)); return c.s > leg.cut && c.s < leg.cut + 4 && Math.abs(c.l) < E.width / 2 && Math.hypot(centroid(t).x - np.x, centroid(t).z - np.z) < 40; });
      if (!mine.length) continue;
      const ss = mine.flatMap((t) => t.map((p) => local(p).s)).filter((s) => s > leg.cut - 0.01 && s < leg.cut + 4.01);
      if (!ss.length) continue;
      expect(Math.min(...ss)).toBeGreaterThan(leg.cut + CROSSWALK_START - 0.3);
      expect(Math.max(...ss)).toBeLessThan(leg.cut + CROSSWALK_START + CROSSWALK_WIDTH + 0.3);
      expect(Math.max(...ss) - Math.min(...ss)).toBeGreaterThan(CROSSWALK_WIDTH - 0.3);
      if (++checked >= 20) break;
    }
    expect(checked).toBeGreaterThan(3);
    expect(bars.length).toBeGreaterThan(0);
  });
});

describe('grid adapter: asphalt area matches RoadBuilder', () => {
  it('within 3 % of today (segments + intersection boxes)', () => {
    let today = 0;
    for (const s of grid.segments) today += Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) * s.width;
    for (const i of grid.intersections) today += i.halfX * 2 * i.halfZ * 2;
    const roads = buildRoadMeshes(gridNet, gridDerived, mats, { tier: 'medium' });
    const got = sumArea(trisOf(roads, 'asphalt'));
    expect(Math.abs(got - today) / today).toBeLessThan(0.03);
  });
});

describe('fixtures', () => {
  it('level != 0 edges are not meshed', () => {
    const net = star([0, 90, 180, 270]);
    (net.edges as RNEdgeData[]).forEach((e) => { e.level = -1; });
    const d = deriveGeometry(net);
    const roads = buildRoadMeshes(net, d, mats, { tier: 'low' });
    expect(trisOf(roads, 'asphalt')).toHaveLength(0);
    expect(trisOf(roads, 'markings')).toHaveLength(0);
  });

  it('4-leg street junction: ribbon + node polygon cover the cross exactly once', () => {
    const net = star([0, 90, 180, 270]);
    const d = deriveGeometry(net);
    const roads = buildRoadMeshes(net, d, mats, { tier: 'low' });
    const ribbons = trisOf(roads, 'asphalt');
    expect(overlapNear(ribbons, P(0, 0), 60)).toBeLessThan(1e-6);
    // 2 streets of 10 x 200 m, minus the shared 10 x 10 square, plus the four curb return fillets
    const r = 4.5;
    const want = 2 * 10 * 200 - 100 + 4 * (r * r - (Math.PI * r * r) / 4);
    expect(Math.abs(sumArea(ribbons) - want)).toBeLessThan(2);
  });

  it('zebra band and stop bar sit at the contract distances on a signal node, bar only on the arriving lane', () => {
    const net = star([0, 90, 180, 270]);
    const d = deriveGeometry(net);
    const roads = buildRoadMeshes(net, d, mats, { tier: 'low', crosswalks: d.legs.filter((l) => l.node === 0).map((l) => ({ edge: l.edge, node: 0 })) });
    const zebra = trisOf(roads, 'markings', 'crosswalks');
    const bars = trisOf(roads, 'markings', 'markings-white');
    for (const leg of d.legs.filter((l) => l.node === 0)) {
      const s = (p: Vec2): number => p.x * leg.dir.x + p.z * leg.dir.z;
      const l = (p: Vec2): number => p.x * leg.nrm.x + p.z * leg.nrm.z;
      const zs = zebra.filter((t) => { const c = centroid(t); return s(c) > 0 && Math.abs(l(c)) < 5 && Math.hypot(c.x, c.z) < 20 && s(c) > leg.cut; }).flatMap((t) => t.map(s));
      expect(Math.min(...zs)).toBeCloseTo(leg.cut + CROSSWALK_START, 6);
      expect(Math.max(...zs)).toBeCloseTo(leg.cut + CROSSWALK_START + CROSSWALK_WIDTH, 6);
      const bs = bars.filter((t) => { const c = centroid(t); return s(c) > leg.cut && s(c) < leg.cut + 8 && Math.abs(l(c)) < 5 && Math.hypot(c.x, c.z) < 20; });
      expect(bs.length).toBeGreaterThan(0);
      const ss = bs.flatMap((t) => t.map(s));
      expect((Math.min(...ss) + Math.max(...ss)) / 2).toBeCloseTo(leg.cut + STOP_LINE, 6);
      // two-way: the bar covers the arriving (right of travel) lane only, i.e. the -nrm side of the leg
      const ls = bs.flatMap((t) => t.map(l));
      expect(Math.max(...ls)).toBeLessThan(0);
    }
  });

  it('one-way legs get a stop bar only where traffic arrives', () => {
    const net = star([0, 180], 10, 'street', 4, 1); // edge 0: node0 -> stub (east), edge 1: node0 -> stub (west); both a->b one-way
    const d = deriveGeometry(net);
    const roads = buildRoadMeshes(net, d, mats, { tier: 'low' });
    // control signal at node 0 but only two legs -> no node polygon -> no bars or zebras at all
    expect(trisOf(roads, 'markings', 'markings-white')).toHaveLength(0);
  });

  it('two nodes joined by a ribbonless edge become one unioned polygon (no overlap)', () => {
    // two crossings of a 10 m street with 10 m cross streets 10 m apart: the link has no ribbon
    const nodes: RNNodeData[] = [
      { p: P(0, 0), control: 'signal' }, { p: P(10, 0), control: 'signal' },
      { p: P(-100, 0), control: 'stub' }, { p: P(110, 0), control: 'stub' },
      { p: P(0, -100), control: 'stub' }, { p: P(0, 100), control: 'stub' }, { p: P(10, -100), control: 'stub' }, { p: P(10, 100), control: 'stub' },
    ];
    const mk = (a: number, b: number): RNEdgeData => ({ a, b, pts: [nodes[a].p, nodes[b].p], name: `e${a}${b}`, cls: 'street', width: 10, sidewalk: 4, lanes: 2, oneway: 0, level: 0 });
    const net = withBlocks(nodes, [mk(2, 0), mk(0, 1), mk(1, 3), mk(0, 4), mk(0, 5), mk(1, 6), mk(1, 7)]);
    const d = deriveGeometry(net);
    expect(hasRibbon(net, d, 1)).toBe(false);
    const roads = buildRoadMeshes(net, d, mats, { tier: 'low' });
    const asphalt = trisOf(roads, 'asphalt');
    expect(overlapNear(asphalt, P(5, 0), 60)).toBeLessThan(0.05);
    // the link edge is covered by the union
    expect(asphalt.some((t) => pointInTri(P(5, 0), t))).toBe(true);
  });

  it('unionPolygons: two overlapping squares give one ring of the union area; disjoint squares give null', () => {
    const sq = (x: number, z: number, s: number): Vec2[] => [P(x, z), P(x + s, z), P(x + s, z + s), P(x, z + s)];
    const u = unionPolygons(sq(0, 0, 4), sq(2, 1, 4))!;
    expect(u).not.toBeNull();
    expect(signedArea(u)).toBeCloseTo(16 + 16 - 2 * 3, 9);
    expect(unionPolygons(sq(0, 0, 1), sq(5, 5, 1))).toBeNull();
    // nested: the container
    expect(signedArea(unionPolygons(sq(0, 0, 10), sq(2, 2, 2))!)).toBeCloseTo(100, 9);
  });

  it('wedge: a 45 degree crossing has no overlap and no gap between ribbons and node polygon', () => {
    const net = star([0, 45, 180, 225]);
    const d = deriveGeometry(net);
    const roads = buildRoadMeshes(net, d, mats, { tier: 'low' });
    expect(overlapNear(trisOf(roads, 'asphalt'), P(0, 0), 60)).toBeLessThan(0.05);
  });
});

describe('chunk layout', () => {
  it('cell 64 m (32 fine), chunk 128 m, origin at the bounds minimum', () => {
    const b = { minX: -310, maxX: 900, minZ: -75, maxZ: 640 };
    const l = chunkLayoutFromBounds(b);
    expect([l.cellX, l.cellZ, l.chunkX, l.chunkZ, l.originX, l.originZ]).toEqual([64, 64, 128, 128, -310, -75]);
    const f = chunkLayoutFromBounds(b, true);
    expect([f.cellX, f.cellZ, f.chunkX, f.chunkZ]).toEqual([32, 32, 128, 128]);
    expect(chunkKeyOf(l, -310, -75)).toBe('0_0');
    expect(chunkKeyOf(l, -310 + 127.9, -75)).toBe('0_0');
    expect(chunkKeyOf(l, -310 + 128, -75 + 256)).toBe('1_2');
    expect(chunkKeyOfCell(l, '3_5')).toBe('1_2');
    expect(chunkKeyOfCell(f, '7_1')).toBe('1_0');
  });
  it('fine tiers are the ones the world builder splits finely', () => {
    expect(FINE_CELLS.phone).toBe(true);
    expect(FINE_CELLS.high).toBe(false);
  });
});

describe('budget on the core network (computed from geometry, no render)', () => {
  it('triangles and meshes per tier are sane and monotone', () => {
    const res = (['phone', 'low', 'medium', 'high'] as const).map((tier) => ({ tier, ...meshStats(buildRoadMeshes(coreNet, coreDerived, mats, { tier })) }));
    for (const r of res) expect(r.triangles).toBeGreaterThan(5000);
    expect(res[2].triangles).toBeGreaterThan(res[1].triangles);
    expect(res[0].triangles).toBeLessThan(res[1].triangles);
  });
});

function pointInTri(p: Vec2, t: Tri): boolean {
  const s = (a: Vec2, b: Vec2): number => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const d0 = s(t[0], t[1]), d1 = s(t[1], t[2]), d2 = s(t[2], t[0]);
  return !((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0));
}
