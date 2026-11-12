/**
 * REALWORLD: assembles a walkable world on the real street network (`?map=real`). DYNAMIC-IMPORT ONLY: nothing on the default
 * path may import this file (it pulls in the whole roadnet stack and the shipped network JSON).
 *
 *   const rw = await buildRealWorld({ materials, rng, tier });
 *   rw.group / rw.colliders / rw.spawn / rw.chunkMeshes / rw.lots / rw.notice
 *
 * Pieces, in the order they land in the group (each one is swapped for a plain stand-in if it throws, and the swap is recorded
 * in `rw.standIns`, so the build never fails for want of one piece):
 *   ground      one dull plane under everything (so a gap in the meshes is grey, not sky)
 *   roads       WP4 meshRoads: asphalt ribbons, junction polygons, sidewalks, curbs, markings (stand-in: flat grey ribbons)
 *   buildings   WP5 faces + lots on the real frontages -> BuildingGen (stand-in: extruded boxes from the building rings)
 *   el          WP10 elReal / elStructureReal: J/Z on Broadway and M on Myrtle, columns with colliders
 *   sidewalks   WP3 graph (returned, not drawn: pedestrians are off in this mode)
 * Traffic lanes and signals (WP2) come from `buildRealLanes(rw)` for when the traffic system is moved over; nothing in the
 * world uses them yet.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { IMaterialLibrary, LaneGraph, Lot, StaticCollider } from '@/world/types';
import type { Quality } from '@/render/Shadows';
import { FINE_CELLS, chunkKeyOfCell, splitMeshesIntoCells, type ChunkLayout } from '@/render/Culling';
import { buildBuildings } from '@/world/BuildingGen';
import { SIDEWALK_HEIGHT } from '@/world/WorldBuilder';
import { loadRoadNet } from './MapSource';
import type { RoadNet } from './RoadNet';
import { deriveGeometry, type Derived } from './derive';
import { buildRoadMeshes } from './meshRoads';
import { chunkLayoutFromBounds, ROAD_CHUNK_PREFIX } from './chunksReal';
import { buildSidewalkGraph, type SidewalkNet } from './sidewalks';
import { blockFaces } from './faces';
import { placeLots } from './lotsReal';
import { allColumnSpots, buildElPaths } from './elReal';
import { buildElStructureReal } from './elStructureReal';
import { RealTrains } from './elTrainsReal';
import { RealBuildingStreamer, type ColliderHost, type StreamRanges } from './buildingStream';
import type { RealLot } from './lotsReal';
import { pointInPolygon, signedArea } from './geom';
import type { LampSpot } from '@/world/FurnitureGen';
import type { RealProps } from './propsReal';
import type { RealPlaces, PlacesTable } from './placesReal';

export interface RealWorld {
  net: RoadNet;
  derived: Derived;
  group: THREE.Group;
  colliders: StaticCollider[];
  lots: Lot[];
  /** building and road meshes with `userData.cell` / `userData.chunk`, for a ChunkCuller */
  chunkMeshes: THREE.Mesh[];
  chunks: ChunkLayout;
  sidewalks: SidewalkNet;
  /** player start on a sidewalk, and the heading (radians, 0 = north) along the street there */
  spawn: Vec2;
  spawnHeading: number;
  /** the streamed buildings (root is inside `group`) */
  streamer: RealBuildingStreamer | null;
  /** attach (or replace) the physics collider host: replays every collider currently standing */
  setColliderHost: (h: ColliderHost) => void;
  /** per frame: streams buildings around (px, pz), runs the el trains. cam = camera position. */
  update: (dt: number, px: number, pz: number, cam: { x: number; y: number; z: number }, night: boolean) => void;
  trains: RealTrains | null;
  /** one line for the screen */
  notice: string;
  /** blocks left without lots and boxes because their building ring leaves the kerb ring */
  badBlocks: number[];
  /** pieces that fell back to a stand-in, with the reason */
  standIns: string[];
  /** the el: station list for the timetable hook-up later */
  el: ReturnType<typeof buildElPaths>;
  /** street furniture (lamps, signals, signs, trees, hydrants); null when it fell back. main: world.lamps = rw.lamps, world.furnitureGroup = rw.furnitureGroup */
  props: RealProps | null;
  lamps: LampSpot[];
  furnitureGroup: THREE.Group;
  /** the places table over the real lots; null when it fell back */
  places: RealPlaces | null;
  /** player start outside HOME's door (equals spawn / spawnHeading when places fell back) */
  homeSpawn: { x: number; z: number; heading: number };
  /** moves HOME / deli / club doors and nav targets onto the real lots; call once before the interiors are built (no-op without places) */
  applyDoors: () => void;
  stats: { meshes: number; triangles: number; lots: number; colliders: number; ms: Record<string, number> };
}

export interface RealWorldOptions {
  materials: IMaterialLibrary;
  rng: Rng;
  tier?: Quality;
  /** where the streamer hands building colliders (can also be set later with `rw.setColliderHost`) */
  colliders?: ColliderHost;
  /** override the streamer's ranges (renders: far = 1e5 shows boxes over the whole map) */
  streamRanges?: Partial<StreamRanges>;
  /** build the near ring around the spawn for up to this many ms before returning (default 2500); the rest streams in `update` */
  warmMs?: number;
  /** force the stand-ins (tests, and to compare against the real pieces) */
  forceStandIns?: boolean;
}

export const REAL_NOTICE = 'Real-map preview: walk only. No traffic, missions or saving yet.';

const triCount = (m: THREE.Mesh): number => {
  const g = m.geometry;
  const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
  return n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
};

/** Triangles and mesh (= draw) counts of everything below `root`, optionally only meshes whose bounding sphere reaches `radius` of `centre`. */
export function measureWorld(root: THREE.Object3D, centre?: Vec2, radius = Infinity): { meshes: number; triangles: number } {
  let meshes = 0, triangles = 0;
  const c = new THREE.Vector3(), s = new THREE.Sphere();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    if (centre && radius < Infinity) {
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      s.copy(g.boundingSphere!).applyMatrix4(m.matrixWorld);
      if ((m as THREE.InstancedMesh).isInstancedMesh) { meshes++; triangles += triCount(m); return; } // whole-line instanced kinds are counted whole
      c.set(centre.x, s.center.y, centre.z);
      if (c.distanceTo(s.center) > radius + s.radius) return;
    }
    meshes++;
    triangles += triCount(m);
  });
  return { meshes, triangles };
}

/** Flat grey ribbons from the derived legs plus one grey polygon per node polygon: the stand-in for meshRoads. */
function standInRoads(net: RoadNet, d: Derived, mats: IMaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roads-standin';
  const pos: number[] = [];
  const quad = (a: Vec2, b: Vec2, c: Vec2, dd: Vec2): void => {
    for (const p of [a, b, c, a, c, dd]) pos.push(p.x, 0.02, p.z);
  };
  net.edges.forEach((E, e) => {
    if (E.level !== 0) return;
    const L = net.lengths[e];
    const c0 = d.cuts[e].cutA, c1 = L - d.cuts[e].cutB;
    if (c1 - c0 < 0.05) return;
    for (let k = 0; k < E.pts.length - 1; k++) {
      const a = E.pts[k], b = E.pts[k + 1];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (-(b.z - a.z) / l) * (E.width / 2), nz = ((b.x - a.x) / l) * (E.width / 2);
      quad({ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz }, { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz });
    }
  });
  for (const poly of d.nodePolys) {
    for (let i = 1; i < poly.length - 1; i++) for (const p of [poly[0], poly[i], poly[i + 1]]) pos.push(p.x, 0.02, p.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = mats.get('asphalt', 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'roadway';
  g.add(mesh);
  return g;
}

/** Box buildings from the building rings (height by block hash 8..20 m): the stand-in for faces + lots + BuildingGen. */
function standInBuildings(net: RoadNet, d: Derived, mats: IMaterialLibrary, skipBlocks?: ReadonlySet<number>): { group: THREE.Group; colliders: StaticCollider[] } {
  const group = new THREE.Group();
  group.name = 'buildings-standin';
  const pos: number[] = [];
  const colliders: StaticCollider[] = [];
  d.buildingRings.forEach((ring, i) => {
    if (ring.length < 3 || skipBlocks?.has(i)) return;
    const h = 8 + ((i * 2654435761) >>> 0) % 13;
    const pts = signedArea(ring) > 0 ? ring : ring.slice().reverse();
    const n = pts.length;
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n];
      pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, h, b.z, a.x, 0, a.z, b.x, h, b.z, a.x, h, a.z);
    }
    for (let k = 1; k < n - 1; k++) for (const p of [pts[0], pts[k], pts[k + 1]]) pos.push(p.x, h, p.z);
    colliders.push({ shape: { kind: 'polygon', points: pts.map((p) => ({ x: p.x, z: p.z })) }, pos: { x: 0, z: 0 }, id: `standin-bld-${i}` });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mats.get('brickRed', 0));
  mesh.name = 'brickRed';
  group.add(mesh);
  return { group, colliders };
}

/**
 * Blocks whose building ring leaves the kerb ring (derive.ts defect: a ring vertex outside the kerb polygon; Lena listed 27, 46,
 * 64, 65, 176, 184). They get no stand-in box and no lots until derive.ts is fixed.
 */
export function badBlocks(net: RoadNet, d: Derived): Set<number> {
  const bad = new Set<number>();
  net.blocks.forEach((_, i) => {
    const ring = d.buildingRings[i], curb = d.curbRings[i];
    if (!ring || ring.length < 3) return;
    if (!curb || curb.length < 3 || ring.some((p) => !pointInPolygon(p, curb))) bad.add(i);
  });
  return bad;
}

/** nearest sidewalk-graph node to p, and the heading of the nearest street there */
function spawnNear(net: RoadNet, sw: SidewalkNet, p: Vec2): { spawn: Vec2; heading: number } {
  let best: Vec2 | null = null, bd = Infinity;
  for (const n of Object.values(sw.graph.nodes)) {
    const dd = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
    if (dd < bd) { bd = dd; best = n.pos; }
  }
  const at = best ?? p;
  const h = net.nearestEdge(at, 200);
  const heading = h ? Math.atan2(h.dir.x, -h.dir.z) : 0;
  return { spawn: { x: at.x, z: at.z }, heading };
}

export async function buildRealWorld(opts: RealWorldOptions): Promise<RealWorld> {
  const { materials: mats, rng } = opts;
  const tier: Quality = opts.tier ?? 'high';
  const ms: Record<string, number> = {};
  const standIns: string[] = [];
  const t = (name: string, t0: number): void => { ms[name] = Math.round(performance.now() - t0); };

  let t0 = performance.now();
  const net = await loadRoadNet();
  const derived = deriveGeometry(net);
  t('net+derive', t0);

  const group = new THREE.Group();
  group.name = 'world-real';
  const colliders: StaticCollider[] = [];
  const chunkMeshes: THREE.Mesh[] = [];
  const fine = FINE_CELLS[tier];
  const chunks = chunkLayoutFromBounds(net.bounds, fine);

  // ground
  {
    const b = net.bounds, pad = 400;
    const g = new THREE.PlaneGeometry(b.maxX - b.minX + 2 * pad, b.maxZ - b.minZ + 2 * pad);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x4b4f47, roughness: 1 }));
    m.position.set((b.minX + b.maxX) / 2, -0.06, (b.minZ + b.maxZ) / 2);
    m.name = 'ground-real';
    m.receiveShadow = true;
    group.add(m);
  }

  // sidewalk graph (also feeds the road zebra bands)
  t0 = performance.now();
  const sidewalks = buildSidewalkGraph(net, derived);
  t('sidewalks', t0);

  // roads
  t0 = performance.now();
  let roads: THREE.Group;
  try {
    if (opts.forceStandIns) throw new Error('forced');
    roads = buildRoadMeshes(net, derived, mats, { tier, crosswalks: sidewalks.crosswalks });
    roads.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && typeof m.userData.chunk === 'string') chunkMeshes.push(m); });
  } catch (e) {
    standIns.push(`roads: ${(e as Error).message}`);
    roads = standInRoads(net, derived, mats);
  }
  group.add(roads);
  t('roads', t0);

  let { spawn, heading } = spawnNear(net, sidewalks, { x: 0, z: 0 });

  const bad = badBlocks(net, derived);

  // buildings: streamed by 128 m chunk around the player (WP4 buildingStream), far boxes beyond; stand-in boxes if it throws
  t0 = performance.now();
  let lots: Lot[] = [];
  let places: RealPlaces | null = null;
  let applyDoors: () => void = () => undefined;
  let homeSpawn = { x: spawn.x, z: spawn.z, heading };
  let streamer: RealBuildingStreamer | null = null;
  const held = new Map<string, StaticCollider>();
  let host: ColliderHost | undefined = opts.colliders;
  const proxyHost: ColliderHost = {
    add: (cs) => { for (const c of cs) if (c.id) held.set(c.id, c); host?.add(cs); },
    remove: (ids) => { for (const id of ids) held.delete(id); host?.remove(ids); },
  };
  try {
    if (opts.forceStandIns) throw new Error('forced');
    const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown;
    const faces = blockFaces(net, derived);
    lots = (placeLots(net, derived, faces, lotsJson) as Array<Lot & { block?: number }>).filter((l) => !bad.has(l.block ?? -1));
    // places (Gus): the POI lots carry their shop sign; the home door gives the spawn. Soft: without it the lots stay plain.
    try {
      if (opts.forceStandIns) throw new Error('forced');
      const { RealPlaces, applyRealDoors } = await import('./placesReal');
      const table = (await import('@/world/data/places-real.json')).default as unknown as PlacesTable;
      const { loadBedstuyData } = await import('@/world/Grid');
      const pl = new RealPlaces({ net, derived, faces, lots: lots as RealLot[], table, pois: loadBedstuyData().pois });
      const withPois = pl.lotsWithPois();
      const hs = pl.homeSpawn();
      if (![hs.x, hs.z, hs.heading].every(Number.isFinite)) throw new Error('home spawn not finite');
      applyDoors = () => applyRealDoors(pl);
      places = pl; lots = withPois; homeSpawn = hs; spawn = { x: hs.x, z: hs.z }; heading = hs.heading;
    } catch (e) { standIns.push(`places: ${(e as Error).message}`); }
    let looks: ((bbl: string) => never) | undefined;
    try { looks = (await import('@/world/data/facadeObserved')).observedLook as never; } catch (e) { standIns.push(`looks: ${(e as Error).message}`); }
    streamer = new RealBuildingStreamer({ lots: lots as RealLot[], materials: mats, rng: rng.fork('buildings'), layout: chunks, tier, colliders: proxyHost, ranges: opts.streamRanges, looks });
    group.add(streamer.root);
    const end = performance.now() + (opts.warmMs ?? 2500);
    while (performance.now() < end) {
      streamer.update(spawn.x, spawn.z, 0, 250);
      const st = streamer.stats();
      if (st.queued === 0 && st.building === 0) break;
    }
  } catch (e) {
    standIns.push(`buildings: ${(e as Error).message}`);
    const bld = standInBuildings(net, derived, mats, bad);
    bld.group.position.y = SIDEWALK_HEIGHT;
    group.add(bld.group);
    colliders.push(...bld.colliders);
  }
  t('buildings', t0);

  // the el
  t0 = performance.now();
  const el = buildElPaths(net);
  let elSpots: Array<{ p: Vec2 }> = [];
  try {
    const spots = allColumnSpots(el.paths, derived, net);
    elSpots = spots;
    group.add(buildElStructureReal(el.paths, spots, mats, el.stations));
    spots.forEach((s, i) => colliders.push({ shape: { kind: 'circle', r: 0.4 }, pos: { x: s.p.x, z: s.p.z }, id: `el-real-col-${i}` }));
  } catch (e) {
    standIns.push(`el: ${(e as Error).message}`);
  }
  t('el', t0);

  let trains: RealTrains | null = null;
  try { trains = new RealTrains(el.paths, el.stations); group.add(trains.group); } catch (e) { standIns.push(`trains: ${(e as Error).message}`); }
  // street furniture (June): lamps, signals, signs, trees, hydrants, bins
  let props: RealProps | null = null;
  const furnitureGroup = new THREE.Group();
  t0 = performance.now();
  try {
    if (opts.forceStandIns) throw new Error('forced');
    const { buildRealProps } = await import('./propsReal');
    const { nodeControl } = await import('./signalPhases');
    const controlsJson = (await import('@/world/data/roadnet-controls.json')).default as unknown;
    props = buildRealProps({ net, derived, sidewalks, materials: mats, rng: rng.fork('props'), layout: chunks, tier, controls: nodeControl(net, controlsJson), avoid: elSpots.map((s) => s.p) });
    group.add(props.group);
    colliders.push(...props.colliders);
    chunkMeshes.push(...props.chunkMeshes);
  } catch (e) { standIns.push(`props: ${(e as Error).message}`); props = null; }
  t('props', t0);

  const update: RealWorld['update'] = (dt, px, pz, cam, night) => { streamer?.update(px, pz, cam.y); trains?.update(dt, cam, night); };
  const setColliderHost = (h: ColliderHost): void => { host = h; if (held.size) h.add([...held.values()]); };
  const stats = { ...measureWorld(group), lots: lots.length, colliders: colliders.length, ms };
  void ROAD_CHUNK_PREFIX;
  return { net, derived, group, colliders, lots, chunkMeshes, chunks, sidewalks, spawn, spawnHeading: heading, badBlocks: [...bad].sort((a, b) => a - b), streamer, setColliderHost, update, trains, notice: REAL_NOTICE, standIns, el, props, lamps: props?.lamps ?? [], furnitureGroup: props?.group ?? furnitureGroup, places, homeSpawn, applyDoors, stats };
}

/** WP2 lane graph of a built real world (async only to keep lanes.ts out of the first chunk). */
export async function buildRealLanes(rw: RealWorld): Promise<LaneGraph> {
  const { buildLaneGraph } = await import('./lanes');
  return buildLaneGraph(rw.net, rw.derived);
}
