import { describe, it, expect } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import type { PoiDef, Side } from '@/world/types';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLots } from '@/world/roadnet/lotsReal';
import { buildSidewalkGraph } from '@/world/roadnet/sidewalks';
import { NAV_TARGETS } from '@/game/missions/NavTargets';
import { RealPlaces, applyRealDoors, matchGridBlock, slug, type PlacesTable } from '@/world/roadnet/placesReal';
import { INTERIORS, doorTrigger, type InteriorId } from '@/world/interiors/defs';

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as { lots: Array<{ bbl: string }> };
const table = (await import('@/world/data/places-real.json')).default as unknown as PlacesTable;
const sources = import.meta.glob('/src/game/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const data = loadBedstuyData();
const grid = buildGrid(data);
const net = RoadNet.fromJson(core);
const d = deriveGeometry(net);
const faces = blockFaces(net, d);
const lots = placeLots(net, d, faces, lotsJson) as import('@/world/roadnet/lotsReal').RealLot[];
const places = new RealPlaces({ net, derived: d, faces, lots, table, pois: data.pois as PoiDef[] });
const sw = buildSidewalkGraph(net, d);

const finite = (p: Vec2): boolean => Number.isFinite(p.x) && Number.isFinite(p.z);
/** the sidewalk strip of the nearest edge: between the kerb and the building line, off the roadway */
function onSidewalk(p: Vec2): boolean {
  if (net.isOnRoad(p)) return false;
  const h = net.nearestEdge(p, 40, (e) => net.edges[e].level === 0);
  if (!h) return false;
  const e = net.edges[h.edge];
  return h.dist >= e.width / 2 - 0.3 && h.dist <= e.width / 2 + e.sidewalk + 0.6;
}
function facesStreet(p: Vec2, out: Vec2): boolean {
  const h = net.nearestEdge(p, 40, (e) => net.edges[e].level === 0);
  if (!h) return false;
  const dx = h.point.x - p.x, dz = h.point.z - p.z;
  const l = Math.hypot(dx, dz) || 1;
  return (dx * out.x + dz * out.z) / l > 0.5;
}

const text = Object.values(sources).join('\n');
const cornerPairs = new Set<string>(), midTriples = new Set<string>(), poiIds = new Set<string>();
for (const m of text.matchAll(/corner\(grid, '(\w+)', '(\w+)'\)/g)) cornerPairs.add(`${m[1]}/${m[2]}`);
for (const m of text.matchAll(/streetMid\(grid, '(\w+)', '(\w+)', '(\w+)'\)/g)) midTriples.add(`${m[1]}/${m[2]}/${m[3]}`);
for (const m of text.matchAll(/poiSpot\(ctx, '([\w-]+)'/g)) poiIds.add(m[1]);

describe('places table', () => {
  it('maps the grid blocks the game uses (columns 0..1, rows 0..4) onto real block chains whose streets match', () => {
    for (const b of grid.blocks) {
      const row = table.blocks[b.id];
      expect(row, b.id).toBeTruthy();
      expect(row.real).toEqual(matchGridBlock(net, d, faces, row) ?? []);
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) expect(table.blocks[`r${r}c${c}`].real.length, `r${r}c${c}`).toBeGreaterThan(0);
    // Pulaski to Kosciuszko is two real blocks (Dekalb Ave runs between them)
    expect(table.blocks.r1c0.real.length).toBe(2);
  });
  it('is small and real-path only', () => {
    expect(JSON.stringify(table).length).toBeLessThan(40_000);
  });
});

describe('places on the real map', () => {
  it('every POI and every interior has a real lot, a door position and a facing', () => {
    expect(Object.keys(table.pois).sort()).toEqual(data.pois.map((p) => p.id).sort());
    for (const id of poiIds) expect(table.pois[id], id).toBeTruthy();
    for (const id of Object.keys(INTERIORS) as InteriorId[]) {
      const door = places.interiorDoor(id);
      expect(finite(door)).toBe(true);
      expect(Math.hypot(door.outX, door.outZ)).toBeCloseTo(1, 6);
      expect(door.radius).toBe(INTERIORS[id].door.radius);
    }
    for (const p of data.pois) { expect(finite(places.poiSpot(p.id))).toBe(true); expect(finite(places.poiSpot(p.id, 14))).toBe(true); }
  });
  it('every door is on a sidewalk and faces a street', () => {
    for (const id of Object.keys(INTERIORS) as InteriorId[]) {
      const door = places.interiorDoor(id);
      const trig = doorTrigger({ ...INTERIORS[id], door });
      expect(onSidewalk(trig), `${id} trigger`).toBe(true);
      expect(facesStreet({ x: door.x, z: door.z }, { x: door.outX, z: door.outZ }), `${id} faces`).toBe(true);
    }
    for (const p of data.pois) {
      const s = places.poiSpot(p.id);
      expect(onSidewalk(s), `${p.id} spot`).toBe(true);
      const lot = places.lotOfPoi(p.id);
      expect(facesStreet(s, lot.outward), `${p.id} faces`).toBe(true);
    }
  });
  it('no two places share a lot, and every one is a lot the generator can build on', () => {
    const all = [...Object.entries(table.pois), ...Object.entries(table.interiors)].map(([, e]) => e.bbl);
    expect(new Set(all).size).toBe(all.length);
    for (const b of all) {
      const l = places.byBbl.get(b)!;
      expect(l, b).toBeTruthy();
      expect(l.type).not.toBe('vacant');
    }
    expect(places.byBbl.get(table.pois.church.bbl)!.type).toBe('church');
  });
  it('every mission and ambient spot resolves to a point on a sidewalk', () => {
    expect(table.anchors.length).toBeGreaterThan(60);
    for (const [block, side, t, bbl] of table.anchors) {
      const p = places.facePoint(block, side as Side, t);
      expect(finite(p), `${block}/${side}/${t}`).toBe(true);
      expect(onSidewalk(p), `${block}/${side}/${t}`).toBe(true);
      expect(places.byBbl.has(bbl), `${block}/${side}/${t} lot`).toBe(true);
      const f = places.frontage(block, side as Side, t);
      expect(Math.hypot(f.n.x, f.n.z)).toBeCloseTo(1, 6);
    }
  });
  it('face points keep the grid ordering: t runs left to right along the face', () => {
    for (const [block, side] of [['r1c0', 'E'], ['r2c1', 'W'], ['r1c1', 'S'], ['r0c1', 'N']] as Array<[string, Side]>) {
      const a = places.facePoint(block, side, 0.05), b = places.facePoint(block, side, 0.95);
      const gf = grid.blockById(block).faces.find((f) => f.side === side)!;
      const gd = { x: gf.b.x - gf.a.x, z: gf.b.z - gf.a.z };
      // the real frame is turned 8.6 degrees from the grid: direction must agree within 20 degrees
      const dot = ((b.x - a.x) * gd.x + (b.z - a.z) * gd.z) / (Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(gd.x, gd.z));
      expect(dot, `${block}/${side}`).toBeGreaterThan(Math.cos((20 * Math.PI) / 180));
    }
  });
  it('every corner and street middle the content uses exists', () => {
    expect(cornerPairs.size).toBeGreaterThan(8);
    expect(midTriples.size).toBeGreaterThan(5);
    for (const k of cornerPairs) {
      const [a, b] = k.split('/');
      const p = places.corner(a, b);
      expect(finite(p), k).toBe(true);
      // the crossing lies on both streets' centrelines
      for (const s of [a, b]) {
        const h = net.nearestEdge(p, 60, (e) => slug(net.edges[e].name) === slug(table.streets[s]));
        expect(h && h.dist < 15, `${k} on ${s}`).toBe(true);
      }
    }
    for (const k of midTriples) {
      const [s, f, t] = k.split('/');
      const p = places.streetMid(s, f, t);
      expect(finite(p), k).toBe(true);
      const h = net.nearestEdge(p, 30, (e) => slug(net.edges[e].name) === slug(table.streets[s]));
      expect(h && h.dist < 3, k).toBe(true);
    }
  });
  it('the walking graph connects HOME to every mission place', () => {
    const nodes = Object.values(sw.graph.nodes);
    const nearest = (p: Vec2): string => nodes.reduce((m, n) => (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < Math.hypot(m.pos.x - p.x, m.pos.z - p.z) ? n : m), nodes[0]).id;
    const home = places.homeSpawn();
    const seen = new Set<string>();
    const stack = [nearest(home)];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const ei of sw.graph.adjacency[id] ?? []) stack.push(sw.graph.edges[ei].to);
    }
    const targets: Array<[string, Vec2]> = [];
    for (const [block, side, t] of table.anchors) targets.push([`${block}/${side}/${t}`, places.facePoint(block, side as Side, t)]);
    for (const p of data.pois) targets.push([p.id, places.poiSpot(p.id)]);
    for (const id of Object.keys(INTERIORS) as InteriorId[]) targets.push([id, doorTrigger({ ...INTERIORS[id], door: places.interiorDoor(id) })]);
    for (const k of cornerPairs) { const [a, b] = k.split('/'); targets.push([`corner ${k}`, places.corner(a, b)]); }
    const lost = targets.filter(([, p]) => !seen.has(nearest(p))).map(([k]) => k);
    expect(lost).toEqual([]);
  });
  it('lotsWithPois attaches the parody POIs to the table lots only', () => {
    const w = places.lotsWithPois();
    const withPoi = w.filter((l) => l.poi);
    expect(withPoi.length).toBe(Object.keys(table.pois).length);
    for (const l of withPoi) expect(table.pois[l.poi!.id].bbl).toBe(l.bbl);
    expect(places.mapPlaces().length).toBe(Object.keys(table.pois).length);
  });
  it('onStreet snaps a point to the street centreline (replaces the content literals)', () => {
    const near = places.facePoint('r0c1', 'S', 0.3);
    const p = places.onStreet('pulaski', near);
    const h = net.nearestEdge(p, 5, (e) => slug(net.edges[e].name) === 'pulaski-st');
    expect(h && h.dist < 0.01).toBe(true);
    expect(Math.hypot(p.x - near.x, p.z - near.z)).toBeLessThan(30);
  });
  it('applyRealDoors moves the shared door table and the nav targets in place', () => {
    applyRealDoors(places);
    for (const id of ['home', 'deli'] as const) {
      const want = doorTrigger(INTERIORS[id]);
      const t = NAV_TARGETS.find((n) => n.id === id)!;
      expect(t.x).toBeCloseTo(want.x, 9);
      expect(t.z).toBeCloseTo(want.z, 9);
      expect(onSidewalk(want)).toBe(true);
    }
    const sp = places.homeSpawn();
    expect(onSidewalk(sp)).toBe(true);
  });
});

describe('places on the grid adapter agree with the grid', () => {
  const gnet = roadNetFromGrid(grid);
  const gd = deriveGeometry(gnet);
  const gf = blockFaces(gnet, gd);
  const gtable: PlacesTable = { meta: { v: 1, core: '', note: 'grid adapter' }, streets: {}, blocks: {}, pois: {}, interiors: {}, anchors: [] };
  for (const s of grid.streets) gtable.streets[s.id] = s.name;
  for (const b of grid.blocks) {
    const nm = (side: Side): string => grid.streetById(b.faces.find((f) => f.side === side)!.streetId).name;
    const names = { n: nm('N'), s: nm('S'), e: nm('E'), w: nm('W') };
    gtable.blocks[b.id] = { ...names, real: matchGridBlock(gnet, gd, gf, names) ?? [] };
  }
  const gp = new RealPlaces({ net: gnet, derived: gd, faces: gf, lots: [], table: gtable, pois: [] });
  it('every grid block maps to exactly itself', () => {
    gnet.blocks.forEach((b, i) => { if (b.ref) expect(gtable.blocks[b.ref].real).toEqual([i]); });
  });
  it('facePoint, corner and streetMid equal places.ts on the grid', async () => {
    const pl = await import('@/game/missions/content/places');
    for (const [block, side, t] of table.anchors) {
      const a = gp.facePoint(block, side as Side, t), b = pl.facePoint(grid, block, side as Side, t);
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${block}/${side}/${t}`).toBeLessThan(0.15);
    }
    for (const k of cornerPairs) {
      const [a, b] = k.split('/');
      const p = gp.corner(a, b), q = pl.corner(grid, a, b);
      expect(Math.hypot(p.x - q.x, p.z - q.z), k).toBeLessThan(0.1);
    }
    for (const k of midTriples) {
      const [s, f, t] = k.split('/');
      const p = gp.streetMid(s, f, t), q = pl.streetMid(grid, s, f, t);
      expect(Math.hypot(p.x - q.x, p.z - q.z), k).toBeLessThan(0.5);
    }
  });
});
