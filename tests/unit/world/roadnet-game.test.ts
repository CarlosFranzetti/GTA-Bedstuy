/**
 * REALGAME: the game on the real map, headless. With `useRealPlaces` on, "Air Rights" (and every other mission) is built from the
 * real lots, started from its giver ring and finished by the scripted Bot; every place any mission names is reachable from HOME
 * along June's sidewalk graph; the pointer router guides a walker there on real streets; the ambient notices sit on real
 * frontages; the minimap draws real streets; a save made on either map loads on either map.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import type { PoiDef } from '@/world/types';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLots, type RealLot } from '@/world/roadnet/lotsReal';
import { buildSidewalkGraph, insetRing } from '@/world/roadnet/sidewalks';
import { buildElPaths } from '@/world/roadnet/elReal';
import { RealPlaces, type PlacesTable } from '@/world/roadnet/placesReal';
import { buildRealGame, type RealGame } from '@/world/roadnet/gameReal';
import { nodeFinder, sidewalkRoute } from '@/world/roadnet/pointerReal';
import { pointInPolygon } from '@/world/roadnet/geom';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import { useRealPlaces } from '@/game/missions/content/places';
import type { MissionDef, ObjectiveDef } from '@/game/missions/types';
import { AmbientNotices, ambientItems } from '@/game/story/AmbientNotices';
import { F } from '@/game/story/flags';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { SaveManager, SaveStore, poseOnMap, type SaveParts, type SavePose } from '@/ui/GameSave';
import { Bot, startHourFor } from '../game/missionBot';

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as { lots: Array<{ bbl: string }> };
const table = (await import('@/world/data/places-real.json')).default as unknown as PlacesTable;

const data = loadBedstuyData();
const grid = buildGrid(data);
const net = RoadNet.fromJson(core);
const d = deriveGeometry(net);
const faces = blockFaces(net, d);
const placed = placeLots(net, d, faces, lotsJson) as RealLot[];
const places = new RealPlaces({ net, derived: d, faces, lots: placed, table, pois: data.pois as PoiDef[] });
const lots = places.lotsWithPois();
const sw = buildSidewalkGraph(net, d);
const el = buildElPaths(net);
const rg: RealGame = buildRealGame({ net, derived: d, sidewalks: sw, places, el, lots: lots as never, homeSpawn: places.homeSpawn() });
afterAll(() => rg.release());

const all = buildMissions(grid, data, lots as never, rg.features);
const story = all.filter((m) => m.act !== undefined);
const byId = (id: string): MissionDef => all.find((m) => m.id === id)!;

/** every position a mission names, with a label */
function placesOf(def: MissionDef): Array<{ label: string; p: Vec2; ob: number; walk: boolean; r: number; chase?: boolean }> {
  const out: Array<{ label: string; p: Vec2; ob: number; walk: boolean; r: number; chase?: boolean }> = [{ label: `${def.id}/giver`, p: def.giver, ob: -1, walk: true, r: def.triggerRadius }];
  def.objectives.forEach((o: ObjectiveDef, i) => {
    const x = o as unknown as Record<string, unknown>;
    const walk = (x.presence ?? 'any') !== 'inVehicle';
    const push = (k: string, p: unknown, w = walk): void => { const v = p as Vec2 | undefined; if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) out.push({ label: `${def.id}/${i}.${o.kind}.${k}`, p: v, ob: i, walk: w, r: typeof x.radius === 'number' ? x.radius : 4 }); };
    push('at', x.at); push('from', x.from);
    (x.points as Vec2[] | undefined)?.forEach((p, k) => push(`pt${k}`, p));
    (x.route as Vec2[] | undefined)?.forEach((p, k) => { push(`route${k}`, p, false); if (o.kind === 'chase') out[out.length - 1].chase = true; });
    (x.options as Array<{ at: Vec2 }> | undefined)?.forEach((op, k) => push(`opt${k}`, op.at));
  });
  return out;
}

const findNode = nodeFinder(sw.graph);
const homeNode = findNode(rg.home);
const inBuilding = (p: Vec2): boolean => d.buildingRings.some((r) => r.length > 2 && pointInPolygon(p, r));
/** inside a building by more than a wall's graze (the router tolerates 0.4 m, as the grid router does) */
const wallDeep = (() => { const deep = d.buildingRings.map((r) => (r.length > 2 ? insetRing(r, 1) : [])); return (p: Vec2): boolean => deep.some((r) => r.length > 2 && pointInPolygon(p, r)); })();

describe('the real places drive the missions', () => {
  it('builds every mission, the same ids as on the grid plus nothing missing', () => {
    useRealPlaces(null);
    const onGrid = buildMissions(grid, data).map((m) => m.id);
    rg.reapply();
    expect(all.map((m) => m.id).sort()).toEqual(onGrid.sort());
    for (const id of ['notice-of-intent', 'last-call-on-throop', 'last-stop-north']) expect(story.map((m) => m.id), id).toContain(id); // the el job exists because the real el supplies stations
    expect(story.length).toBeGreaterThanOrEqual(14);
    expect(rg.stations.length).toBeGreaterThanOrEqual(2);
  });

  it('every place is finite, inside the net, not in a building, and the el job uses real stations', () => {
    const b = net.bounds;
    const bad: string[] = [];
    for (const def of all) for (const q of placesOf(def)) {
      if (q.r < 8 && inBuilding(q.p)) bad.push(q.label);
      expect(Number.isFinite(q.p.x) && Number.isFinite(q.p.z), q.label).toBe(true);
      expect(q.p.x > b.minX - 30 && q.p.x < b.maxX + 30 && q.p.z > b.minZ - 30 && q.p.z < b.maxZ + 30, `${q.label} inside the net`).toBe(true);
      // a point with a wide ring (an offset photo spot, a stakeout) may sit in a wall; the ring still reaches the street
    }
    expect(bad, 'places inside a building').toEqual([]);
    const north = byId('last-stop-north');
    const near = (p: Vec2): boolean => rg.stations.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 16);
    expect(near(north.objectives[0].kind === 'goTo' ? north.objectives[0].at : { x: 1e9, z: 0 })).toBe(true);
  });
});

/** missions whose on-foot chase route is hand-offset and not yet wrapped in `footRoute()` (content/places.ts); it must only shrink */
const chaseGaps = new Set<string>();
describe('every mission place can be walked to from HOME through the sidewalk graph', () => {
  const stats = { worst: 0, legs: 0 };
  for (const def of all) {
    it(`${def.title}: HOME -> giver -> each objective place`, () => {
      let from = homeNode;
      let walked = 0;
      for (const q of placesOf(def)) {
        const to = findNode(q.p);
        const gap = Math.hypot(to.pos.x - q.p.x, to.pos.z - q.p.z);
        // people also walk on the road: what counts is how far the place is beyond the edge of the nearest sidewalk
        const h = net.nearestEdge(q.p, 200, (e) => net.edges[e].level === 0)!;
        const e = net.edges[h.edge];
        const beyond = Math.max(0, h.dist - (e.width / 2 + e.sidewalk));
        if (q.chase) { if (beyond > q.r) chaseGaps.add(def.id); } else
        expect(beyond, `${q.label} is ${beyond.toFixed(0)} m past the nearest sidewalk (ring ${q.r} m)`).toBeLessThanOrEqual(q.r);
        expect(gap, `${q.label} is ${gap.toFixed(0)} m from the nearest sidewalk node`).toBeLessThan(45);
        stats.worst = Math.max(stats.worst, gap);
        const route = sidewalkRoute(sw.graph, from.id, to.id);
        expect(route.length, `${q.label} not connected to HOME`).toBeGreaterThan(0);
        let len = 0;
        for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].pos.x - route[i - 1].pos.x, route[i].pos.z - route[i - 1].pos.z);
        const straight = Math.hypot(to.pos.x - from.pos.x, to.pos.z - from.pos.z);
        expect(len, `${q.label}: ${len.toFixed(0)} m on foot for ${straight.toFixed(0)} m as the crow flies`).toBeLessThan(straight * 4 + 200);
        walked += len; stats.legs++;
        from = to;
      }
      expect(walked).toBeGreaterThan(0);
    });
  }
});

describe('foot chases run on walkable ground', () => {
  it('every chase route is wrapped in footRoute, except the ones listed here (a to-do for their owners)', () => {
    expect([...chaseGaps].sort()).toEqual(KNOWN_UNWRAPPED_CHASES);
  });
});
const KNOWN_UNWRAPPED_CHASES: string[] = [];

describe('the Bot starts and finishes the missions on the real map', () => {
  const prerequisitesOf = (def: MissionDef): string[] => {
    const out: string[] = [];
    const visit = (m: MissionDef): void => { for (const r of m.requires ?? []) { visit(byId(r)); if (!out.includes(r)) out.push(r); } };
    visit(def);
    return out;
  };
  const rig = (cash = 5000) => {
    const wallet = { cash };
    let bot!: Bot;
    const m = new MissionSystem(all, { raiseWanted: (n) => bot.raise(n), pay: (n) => { wallet.cash = Math.max(0, wallet.cash + n); }, spend: (n) => { if (wallet.cash < n) return false; wallet.cash -= n; return true; }, setFlag: () => undefined });
    bot = new Bot(m, { x: rg.home.x, z: rg.home.z }, 12);
    return { m, bot, wallet };
  };
  for (const def of all) {
    it(`${def.title} starts at its giver and completes`, () => {
      const r = rig();
      r.m.restore({ v: 1, completed: prerequisitesOf(def), cash: 0 });
      r.bot.hour = startHourFor(def);
      r.bot.startMission(def);
      expect(r.m.activeId, `${def.id} starts`).toBe(def.id);
      r.bot.playUntil(def);
      expect(r.m.statusOf(def.id), def.id).toBe('complete');
    });
  }

  it('the whole arc plays in order (loyalty ending) and survives a save', () => {
    const r = rig(300);
    r.bot.choices = { 'back-rent': F.ODETTE_PAID, 'repo-fork': F.TAY_RETURNED, 'alvin-fork': F.ALVIN_SPARED, ending: F.END_TRUST };
    const order = [
      'bodega-run', 'notice-of-intent', 'public-comment', 'handle-with-care', 'back-rent', 'crate-digger', 'open-decks', 'the-password', 'aftersloth-residency',
      'fleece-vest', 'open-house', 'walk-dee-home', 'laundromat-getaway', 'repo-the-repo', 'crate-expectations', 'last-stop-north',
      'night-of-the-narcan', 'smoke-signals', 'borough-hall-express', 'last-call-on-throop',
    ];
    for (const id of order) {
      const def = byId(id);
      expect(r.m.isOffered(id, startHourFor(def)), `${id} offered`).toBe(true);
      r.bot.hour = startHourFor(def); r.bot.stars = 0; r.bot.inCar = false;
      r.bot.startMission(def);
      expect(r.m.activeId, id).toBe(id);
      r.bot.playUntil(def);
      expect(r.m.isCompleted(id), id).toBe(true);
    }
    for (const f of [F.ACT1, F.ACT2, F.ACT3, F.DONE, F.END_TRUST]) expect(r.m.story.has(f), f).toBe(true);
    const copy = new MissionSystem(all);
    expect(copy.restore(JSON.parse(JSON.stringify(r.m.serialize())))).toBe(true);
    expect(copy.isCompleted('last-call-on-throop')).toBe(true);
  });
});

describe('the pointer router guides a walker along real streets', () => {
  const targets = (): Array<{ label: string; p: Vec2 }> => {
    const out: Array<{ label: string; p: Vec2 }> = [];
    for (const id of ['notice-of-intent', 'back-rent', 'open-house', 'repo-the-repo', 'last-call-on-throop', 'last-stop-north', 'soundclash', 'lost-cat']) {
      const def = byId(id);
      for (const q of placesOf(def)) if (q.walk && q.ob <= 1) out.push({ label: q.label, p: q.p });
    }
    return out;
  };
  for (const t of targets()) {
    it(`walks from HOME to ${t.label} by following the arrow`, () => {
      const aim = rg.router;
      const pos: Vec2 = { x: rg.home.x, z: rg.home.z };
      let steps = 0, travelled = 0;
      for (; steps < 4000; steps++) {
        if (Math.hypot(pos.x - t.p.x, pos.z - t.p.z) < 6) break;
        const a = aim(pos, t.p);
        expect(Number.isFinite(a.x) && Number.isFinite(a.z)).toBe(true);
        const dx = a.x - pos.x, dz = a.z - pos.z, l = Math.hypot(dx, dz);
        if (l < 1e-6) break;
        const s = Math.min(l, 2);
        // a step toward the arrow never enters a building (the arrow is in clear view of the walker)
        const np = { x: pos.x + (dx / l) * s, z: pos.z + (dz / l) * s };
        expect(wallDeep(np), `${t.label}: step ${steps} walked into a building at ${np.x.toFixed(0)},${np.z.toFixed(0)}`).toBe(false);
        travelled += s;
        pos.x = np.x; pos.z = np.z;
      }
      expect(Math.hypot(pos.x - t.p.x, pos.z - t.p.z), `${t.label}: stopped ${steps} steps in`).toBeLessThan(6);
      expect(travelled).toBeLessThan(Math.hypot(t.p.x - rg.home.x, t.p.z - rg.home.z) * 3 + 200);
    });
  }
});

describe('ambient notices and the minimap on the real map', () => {
  it('every notice sits on a real frontage, facing the street, finite and near a building line', () => {
    const items = ambientItems(grid, rg.frontage);
    expect(items.length).toBe(ambientItems(grid).length);
    for (const i of items) {
      expect(Number.isFinite(i.x) && Number.isFinite(i.z) && Number.isFinite(i.nx) && Number.isFinite(i.nz), i.id).toBe(true);
      expect(Math.hypot(i.nx, i.nz)).toBeCloseTo(1, 1);
      const h = net.nearestEdge({ x: i.x, z: i.z }, 60, (e) => net.edges[e].level === 0);
      expect(h, i.id).not.toBeNull();
      // the sign is on the building line; the street is the way it faces
      const toStreet = { x: h!.point.x - i.x, z: h!.point.z - i.z };
      expect(toStreet.x * i.nx + toStreet.z * i.nz, `${i.id} faces away from its street`).toBeGreaterThan(0);
    }
    const group = new AmbientNotices(grid, rg.frontage);
    expect(group.visibleIds({ has: () => false, test: () => true }).length).toBe(items.length);
  });

  it('realMinimapRoads draws the streets near the player and names the avenues', () => {
    const calls: string[] = [];
    let strokes = 0;
    const ctx = new Proxy({}, {
      get: (_t, k: string) => (k === 'measureText' ? () => ({ width: 10 }) : (...a: unknown[]) => { if (k === 'stroke') strokes++; if (k === 'fillText') calls.push(String(a[0])); }),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const toMap = (p: Vec2): { x: number; y: number } => ({ x: 110 + (p.x - rg.home.x) * 1.1, y: 110 + (p.z - rg.home.z) * 1.1 });
    rg.minimapRoads(ctx, toMap, rg.home, 1.1, 220);
    expect(strokes).toBeGreaterThan(4);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.length > 0)).toBe(true);
    // far off the net nothing is drawn
    strokes = 0;
    rg.minimapRoads(ctx, toMap, { x: 90_000, z: 90_000 }, 1.1, 220);
    expect(strokes).toBe(0);
  });

  it('the street name for the save slot and HUD is a real street', () => {
    expect(rg.streetName(rg.home).length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------- saves

const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };

/** What main.ts does: poses go through `poseOnMap`, the map name is saved with the pose. */
function game(here: 'grid' | 'real', start: { x: number; z: number; heading: number }, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const live = { pose: { x: start.x, z: start.z, heading: start.heading, inCar: false } as SavePose, hour: 9, street: here === 'real' ? rg.streetName(start) : 'Throop Ave' };
  const inventory = new Inventory(PROCEDURAL_RECORDS, null);
  const ms = new MissionSystem(all);
  const parts: SaveParts = {
    getPose: () => ({ ...live.pose, map: here }), setPose: (p) => { live.pose = { ...poseOnMap(p, here, start, bounds) }; },
    getHour: () => live.hour, setHour: (h) => { live.hour = h; }, getDay: () => 0, setDay: () => undefined,
    inventory, missions: ms, phone: { serialize: () => ({}), restore: () => true },
    getWanted: () => 0, setWanted: () => undefined, getWeather: () => 'dry', setWeather: () => undefined,
    getStation: () => 'x', setStation: () => undefined, getLook: () => null, setLook: () => undefined, getStreet: () => live.street,
  };
  const mgr = new SaveManager(new SaveStore(memStore()));
  mgr.bind(parts);
  return { live, ms, mgr };
}

const GRID_HOME = { x: 83.5, z: -10, heading: 1 };
describe('saving and loading on each map and across maps', () => {
  it('real -> real: pose, street label and mission progress come back', () => {
    const a = game('real', rg.home, rg.bounds);
    a.live.pose = { x: rg.home.x + 40, z: rg.home.z - 25, heading: 2.5, inCar: false };
    a.ms.restore({ v: 1, completed: ['bodega-run', 'notice-of-intent'], cash: 0 });
    expect(a.mgr.save('slot1')).toBe(true);
    expect(a.mgr.slot('slot1').street).toBe(a.live.street);
    const b = game('real', rg.home, rg.bounds);
    b.mgr.store.put('slot1', a.mgr.store.get('slot1') as never);
    expect(b.mgr.load('slot1')).toBe(true);
    expect(b.live.pose).toEqual({ x: rg.home.x + 40, z: rg.home.z - 25, heading: 2.5, inCar: false, map: 'real' });
    expect(b.ms.isCompleted('notice-of-intent')).toBe(true);
  });

  it('grid -> grid keeps the pose (and old saves without a map field count as grid)', () => {
    const a = game('grid', GRID_HOME, grid.bounds);
    a.live.pose = { x: 12, z: -33, heading: 0.5, inCar: false };
    a.mgr.save('slot2');
    const raw = JSON.parse(JSON.stringify(a.mgr.store.get('slot2')));
    delete raw.pose.map; // a save from before the field existed
    const b = game('grid', GRID_HOME, grid.bounds);
    b.mgr.store.put('slot2', raw);
    expect(b.mgr.load('slot2')).toBe(true);
    expect(b.live.pose).toMatchObject({ x: 12, z: -33, heading: 0.5 });
  });

  it('a real save on the grid goes to the grid home, and a grid save on the real map goes to the real home; progress is kept', () => {
    const real = game('real', rg.home, rg.bounds);
    real.live.pose = { x: rg.home.x + 300, z: rg.home.z + 200, heading: 1, inCar: true };
    real.ms.restore({ v: 1, completed: ['bodega-run'], cash: 0 });
    real.mgr.save('slot1');
    const onGrid = game('grid', GRID_HOME, grid.bounds);
    onGrid.mgr.store.put('slot1', real.mgr.store.get('slot1') as never);
    expect(onGrid.mgr.load('slot1')).toBe(true);
    expect(onGrid.live.pose).toEqual({ x: GRID_HOME.x, z: GRID_HOME.z, heading: GRID_HOME.heading, inCar: false, map: 'grid' });
    expect(onGrid.ms.isCompleted('bodega-run')).toBe(true);

    onGrid.live.pose = { x: 400, z: 50, heading: 0, inCar: false };
    onGrid.mgr.save('slot2');
    const back = game('real', rg.home, rg.bounds);
    back.mgr.store.put('slot2', onGrid.mgr.store.get('slot2') as never);
    expect(back.mgr.load('slot2')).toBe(true);
    expect(back.live.pose).toEqual({ x: rg.home.x, z: rg.home.z, heading: rg.home.heading, inCar: false, map: 'real' });
  });

  it('a pose outside the net is clamped to the net bounds plus 25 m', () => {
    const out = poseOnMap({ x: 1e6, z: -1e6, heading: 0, inCar: false, map: 'real' }, 'real', rg.home, rg.bounds);
    expect(out.x).toBeCloseTo(rg.bounds.maxX + 25);
    expect(out.z).toBeCloseTo(rg.bounds.minZ - 25);
  });
});
