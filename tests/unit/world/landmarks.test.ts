/**
 * LANDMARKS: the table is well formed, every site matches the live real-map data (lots exist, the site lies inside its block),
 * the street names of the map do not collide with the invented names, and every builder stays inside its triangle and draw budget.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { LANDMARKS, OWNED_BBLS } from '@/world/landmarks/landmarks';
import { LANDMARKS2 } from '@/world/landmarks/landmarks2';
import { LandmarkLayer, LANDMARK_RANGES } from '@/world/landmarks/layer';
import { loadRoadNet } from '@/world/roadnet/MapSource';
import { deriveGeometry } from '@/world/roadnet/derive';
import { pointInPolygon } from '@/world/roadnet/geom';
import { fileLotSource } from './helpers/lotSource';

function stubLib(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const mk = (n: string): THREE.Material => { const m = new THREE.MeshBasicMaterial(); m.name = n; return m; };
  return {
    get(key, variant = 0) { const k = `${key}:${variant}`; let m = cache.get(k); if (!m) { m = mk(k); cache.set(k, m); } return m; },
    awning: (c: string, t: string) => { const k = `aw:${c}|${t}`; let m = cache.get(k); if (!m) { m = mk(k); cache.set(k, m); } return m; },
    sign: (t: string, b?: string, f?: string) => { const k = `sign:${t}|${b}|${f}`; let m = cache.get(k); if (!m) { m = mk(k); cache.set(k, m); } return m; },
    carPaint: () => mk('paint'), setNight: () => undefined,
  } as IMaterialLibrary;
}

const KINDS = ['park', 'pool', 'playground', 'housing', 'church', 'armory', 'school', 'hospital', 'library', 'stationhouse', 'firehouse', 'depot', 'garden', 'subway', 'plaza', 'theatre', 'brewery', 'market', 'rowhouses', 'eatery', 'mural'];

describe('landmark table', () => {
  it('has about twenty rows with unique ids and names', () => {
    expect(LANDMARKS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length);
    expect(new Set(LANDMARKS.map((l) => l.name.toLowerCase())).size).toBe(LANDMARKS.length);
  });
  for (const l of LANDMARKS) {
    it(`${l.id} is well formed`, () => {
      expect(KINDS).toContain(l.kind);
      expect(l.name.length).toBeGreaterThan(4);
      expect(l.district.length).toBeGreaterThan(3);
      expect(l.blurb.length).toBeGreaterThan(10);
      const s = l.site;
      for (const v of [s.ax, s.az, s.fx, s.fz, s.nx, s.nz, s.w, s.d]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.hypot(s.fx, s.fz)).toBeCloseTo(1, 2);
      expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 2);
      expect(s.fx * s.nx + s.fz * s.nz).toBeCloseTo(0, 1); // perpendicular
      expect(s.fx * s.nz - s.fz * s.nx).toBeGreaterThan(0.9); // right-handed, so lettering reads the right way round
      expect(s.w).toBeGreaterThan(5);
      expect(s.d).toBeGreaterThan(2);
      if (s.poly) { expect(s.poly.length).toBeGreaterThanOrEqual(8); expect(s.poly.length % 2).toBe(0); }
      for (const b of l.lots) expect(b).toMatch(/^3\d{9}$/);
      expect(l.sources.length).toBeGreaterThan(0);
      for (const src of l.sources) { expect(src.url).toMatch(/^https:\/\//); expect(src.licence.length).toBeGreaterThan(3); expect(src.what.length).toBeGreaterThan(3); }
    });
  }
  it('every subway stair is a well formed frame', () => {
    const st = LANDMARKS.find((l) => l.kind === 'subway')!;
    expect(st.entrances!.length).toBeGreaterThanOrEqual(6);
    for (const e of st.entrances!) {
      for (const v of [e.x, e.z, e.fx, e.fz, e.nx, e.nz]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.hypot(e.fx, e.fz)).toBeCloseTo(1, 2);
      expect(Math.abs(e.fx * e.nx + e.fz * e.nz)).toBeLessThan(0.05);
      expect(e.station.length).toBeGreaterThan(3);
    }
  });
  it('owned lots are unique across landmarks', () => {
    const all = LANDMARKS.flatMap((l) => l.lots);
    expect(new Set(all).size).toBe(all.length);
    expect(OWNED_BBLS.size).toBe(all.length);
  });
});

describe('landmark sites against the real-map data', async () => {
  const net = await loadRoadNet();
  const d = deriveGeometry(net);
  const src = fileLotSource();
  const idx = await src.index();
  const bbls = new Set<string>();
  for (const k of Object.keys(idx.tiles)) for (const r of (await src.tile(k)).rows) bbls.add(String(r[0]));
  const rings = d.buildingRings;

  for (const l of LANDMARKS) {
    it(`${l.id}: owned lots exist in the lot data`, () => {
      for (const b of l.lots) expect(bbls.has(b), `lot ${b}`).toBe(true);
    });
    it(`${l.id}: the site lies inside its block`, () => {
      const s = l.site;
      if (s.block < 0) return; // street furniture (subway stairs) stands on the pavement, not in a block
      // LANDMARKS2: block indices move when the map grows, so a site is checked against the ring that holds its centre
      const mid = { x: s.ax + s.fx * s.w / 2 + s.nx * s.d / 2, z: s.az + s.fz * s.w / 2 + s.nz * s.d / 2 };
      let ring = rings[s.block];
      if (!(ring && ring.length >= 3 && pointInPolygon(mid, ring))) ring = rings.find((r) => r && r.length >= 3 && pointInPolygon(mid, r)) as typeof ring;
      expect(ring && ring.length >= 3, `block holding ${l.id}`).toBe(true);
      const at = (x: number, z: number): { x: number; z: number } => ({ x: s.ax + s.fx * x + s.nx * z, z: s.az + s.fz * x + s.nz * z });
      // the corners, pulled in 1 m (corner radii of the block ring)
      const e = 1;
      const corners = [at(e, e), at(s.w - e, e), at(s.w - e, s.d - e), at(e, s.d - e)];
      let inside = 0;
      for (const c of corners) if (pointInPolygon(c, ring)) inside++;
      // a block site is the whole (sometimes slanted) block ring: its bounding box may poke out of the corners, the ring itself is baked
      if (!s.poly) expect(inside, `${l.id} corners inside block ${s.block}`).toBe(4);
      expect(pointInPolygon(at(s.w / 2, s.d / 2), ring), `${l.id} centre inside block ${s.block}`).toBe(true);
      if (s.poly) {
        // the baked ring is the block's ring
        expect(s.poly.length / 2).toBe(ring.length);
        expect(Math.hypot(s.poly[0] - ring[0].x, s.poly[1] - ring[0].z)).toBeLessThan(0.2);
      }
    });
  }
  it('no invented street-like word collides with a street of the map', () => {
    const streetWords = new Set<string>();
    for (const n of net.edges.map((e) => String(e.name ?? ''))) for (const t of n.toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 3) streetWords.add(t);
    const generic = new Set(['theatre', 'brewhouse', 'north', 'south', 'pizza', 'yard', 'park', 'pool', 'church', 'school', 'houses', 'garden', 'library', 'station', 'engine', 'medical', 'center', 'methodist', 'branch', 'playground', 'high', 'armory', 'firehouse', 'sanitation', 'garage', 'towers', 'calle', 'verde']);
    for (const l of LANDMARKS) for (const t of l.name.toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 3 && !generic.has(t)) expect(streetWords.has(t), `${l.name}: ${t}`).toBe(false);
  });
});

describe('landmark builders stay within budget', () => {
  const BUDGET: Record<string, number> = { theatre: 20000, brewery: 25000, market: 8000, rowhouses: 16000, eatery: 8000, mural: 12000, park: 60000, housing: 70000, hospital: 40000, armory: 30000, school: 30000, church: 20000, pool: 15000, playground: 20000, library: 12000, stationhouse: 12000, firehouse: 6000, depot: 12000, garden: 6000, subway: 2500 };
  for (const tier of ['phone', 'low'] as const) {
    it(`near and far builds per landmark, tier ${tier}`, () => {
      const lib = stubLib();
      const layer = new LandmarkLayer({ materials: lib, tier, ranges: { near: 1e5, far: 1e5 } });
      layer.settle(0, 0, 0);
      const st = layer.stats();
      expect(st.near).toBe(layer.rows.length);
      for (const l of layer.rows) {
        const g = layer.nearOf(l.id)!;
        let tris = 0, draws = 0;
        g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { draws++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; } });
        expect(tris, `${l.id} triangles (${tier})`).toBeGreaterThan(20);
        expect(tris, `${l.id} triangles (${tier})`).toBeLessThanOrEqual(BUDGET[l.kind] ?? 20000);
        expect(draws, `${l.id} draws (${tier})`).toBeLessThanOrEqual(18);
        for (const m of g.children) expect(Number.isFinite((m as THREE.Mesh).geometry.boundingSphere?.radius ?? 0)).toBe(true);
      }
      layer.dispose();
    });
  }
  it('far silhouettes are one draw and a few hundred triangles each', () => {
    const layer = new LandmarkLayer({ materials: stubLib(), tier: 'low', ranges: { near: 0, far: 1e5 } });
    layer.update(0, 0, 0);
    expect(layer.stats().far).toBe(layer.rows.length);
    let draws = 0;
    layer.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { draws++; const t = m.geometry.getAttribute('position').count / 3; expect(t).toBeLessThan(2500); } });
    expect(draws).toBe(layer.rows.length);
    layer.dispose();
  });
  it('builds nothing when the player is far from every landmark', () => {
    const layer = new LandmarkLayer({ materials: stubLib(), tier: 'low' });
    layer.update(100000, 100000, 0);
    expect(layer.stats()).toMatchObject({ near: 0, far: 0, triangles: 0 });
    // and builds the near ones when arriving, within a few updates of a small budget, then disposes again on leaving
    const s = LANDMARKS[0].site;
    let t = 0;
    const clock = (): number => (t += 0.5);
    const l2 = new LandmarkLayer({ materials: stubLib(), tier: 'low', now: clock });
    const cx = s.ax + s.fx * s.w / 2 + s.nx * s.d / 2, cz = s.az + s.fz * s.w / 2 + s.nz * s.d / 2;
    let calls = 0;
    while (l2.stats().near === 0 && calls < 400) { l2.update(cx, cz, 0); calls++; }
    expect(l2.stats().near).toBeGreaterThanOrEqual(1);
    expect(calls).toBeGreaterThan(1);
    l2.update(cx + 5000, cz, 0);
    expect(l2.stats()).toMatchObject({ near: 0, far: 0 });
    expect(LANDMARK_RANGES.phone.near).toBeLessThan(LANDMARK_RANGES.low.near);
  });
  it('areaAt names the site and map places carry the invented names', () => {
    const layer = new LandmarkLayer({ materials: stubLib(), tier: 'low' });
    for (const l of LANDMARKS) {
      const s = l.site;
      const p = { x: s.ax + s.fx * s.w / 2 + s.nx * s.d / 2, z: s.az + s.fz * s.w / 2 + s.nz * s.d / 2 };
      expect(layer.areaAt(p)).toBeTruthy();
    }
    const labels = layer.mapPlaces.map((m) => m.label);
    for (const l of LANDMARKS.filter((x) => x.kind !== 'subway')) expect(labels).toContain(l.name);
    expect(new Set(labels).size).toBe(labels.length);
    expect(layer.areaAt({ x: 1e6, z: 1e6 })).toBeNull();
  });
});

describe('landmarks in the real world', () => {
  it('the world builds them, the generic building is skipped on owned lots, the map and the HUD name them', async () => {
    const { buildRealWorld } = await import('@/world/roadnet/realWorld');
    const { buildRealGame } = await import('@/world/roadnet/gameReal');
    const rw = await buildRealWorld({ materials: stubLib(), rng: new Rng(7), tier: 'low', warmMs: 0, lotSource: fileLotSource() });
    expect(rw.standIns.filter((s) => s.startsWith('landmarks'))).toEqual([]);
    expect(rw.landmarks).toBeTruthy();
    // owned lots of the first two rings are in the world's lot list but not in the building streamer
    const owned = rw.lots.filter((l) => OWNED_BBLS.has((l as { bbl?: string }).bbl ?? ''));
    expect(owned.length).toBeGreaterThanOrEqual(2);
    const inStreamer = new Set<string>();
    for (const c of rw.streamer!.chunks.values()) for (const l of c.lots) inStreamer.add(l.bbl);
    for (const l of owned) expect(inStreamer.has((l as unknown as { bbl: string }).bbl), `owned lot ${(l as unknown as { bbl: string }).bbl} must not get a generic building`).toBe(false);
    expect(inStreamer.size).toBeGreaterThan(1000);
    // the layer builds around the player and hands colliders to the host
    const lib = LANDMARKS.find((l) => l.id === 'tillery-library')!;
    const s = lib.site;
    const c = { x: s.ax + s.fx * s.w / 2 + s.nx * s.d / 2, z: s.az + s.fz * s.w / 2 + s.nz * s.d / 2 };
    const added: string[] = [];
    rw.setColliderHost({ add: (cs) => { for (const x of cs) added.push(String(x.id)); }, remove: () => undefined });
    rw.landmarks!.settle(c.x, c.z, 0);
    expect(rw.landmarks!.nearOf('tillery-library')).toBeTruthy();
    expect(added.some((id) => id.startsWith('lm:tillery-library'))).toBe(true);
    // map blips and the HUD place label (through the real game's hooks)
    const rg = buildRealGame(rw);
    expect(rg.mapPlaces.some((m) => m.label === 'Tillery Branch Library')).toBe(true);
    expect(rg.streetName(c)).toBe('Tillery Branch Library');
    expect(rg.streetName({ x: c.x + 400, z: c.z + 400 })).not.toBe('Tillery Branch Library');
    rg.release();
  }, 900000);
});

describe('LANDMARKS2 rows', () => {
  it('has fourteen rows after the first twenty', () => {
    expect(LANDMARKS2.length).toBe(14);
    expect(LANDMARKS.slice(-14).map((l) => l.id)).toEqual(LANDMARKS2.map((l) => l.id));
  });
  it('every photograph a row cites carries an open licence', () => {
    for (const l of LANDMARKS2) for (const src of l.sources) {
      if (!/commons\.wikimedia\.org\/wiki\/File:/.test(src.url)) continue;
      expect(src.licence, `${l.id} ${src.url}`).toMatch(/^(CC0|CC BY 4\.0|CC BY-SA 3\.0|CC BY-SA 4\.0|Public domain)/);
    }
  });
  it('no real name leaks into a shipped row', () => {
    for (const l of LANDMARKS2) {
      const text = `${l.name} ${l.district} ${l.blurb}`.toLowerCase();
      for (const bad of ['rko', 'ulmer', 'wyckoff', 'barbara', 'hylan', 'lindsay', 'roberta', 'rugged', 'metropolitan station', '13th regiment']) expect(text.includes(bad), `${bad} in ${l.id}`).toBe(false);
    }
  });
});
