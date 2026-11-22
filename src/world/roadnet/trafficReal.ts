/**
 * REALTRAFFIC: the adapter that lets the unchanged TrafficSystem run on the real street network.
 *
 * TrafficSystem reads a GridModel; this builds the few parts of one it actually touches from the real pieces:
 *   lanes        WP2 lane graph (lanes.ts)
 *   sidewalks    June's sidewalk graph (sidewalks.ts)
 *   crosswalks   June's crosswalks; `pedCrossings` is the signal table (keyed by cluster id and street id, so WALK follows
 *                the leg group that owns the crossed roadway)
 *   segments     straight stretches of two-way / single-lane streets, so parked cars line the real kerbs
 *   streetById   class / width / one-way of a street id, for cruise speed and parking
 * Everything else a GridModel carries (intersections, blocks, streets) is empty: cops and missions stay off on this map.
 *
 * Reachable only from `?map=real` (dynamic import) and tests.
 */
import type { Vec2 } from '@/core/Math2';
import type { PedCrossing } from '@/entities/Pedestrian';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import type { GridModel, Graph, GraphEdge, GraphNode, IVehicle, LaneGraph, RoadSegment, StreetDef, VehicleType } from '@/world/types';
import { clusterId, clusterIndexOfNode, junctionClusters } from './clusters';
import type { Derived } from './derive';
import { pointInPolygon } from './geom';
import { buildLaneGraphDetailed, type LaneBuild } from './lanes';
import { RealTrafficLights } from './lightsReal';
import type { RoadNet } from './RoadNet';
import { buildPedCrossingsReal, type SidewalkNet } from './sidewalks';
import { nodeControl } from './signalPhases';

/** ring edges (sidewalk to sidewalk) are sampled this often when the walking graph is checked against roadway and buildings (m) */
const WALK_SAMPLE = 1.5;
/** a piece of the walking graph smaller than this (nodes) is left out: nobody should be spawned on a scrap */
const WALK_MIN_PIECE = 8;

/**
 * The sidewalk graph as the pedestrians use it: a few blocks of the real network have a degenerate kerb ring (a sliver or a
 * wedge), and their walking ring then runs over the roadway or through the building line. Ring edges that do are dropped
 * (crosswalk edges are meant to cross the road and are kept; a link into a crosswalk is only checked against buildings), and
 * pieces left with fewer than WALK_MIN_PIECE nodes go with them. Everything else is passed through unchanged.
 */
export function walkableGraph(g: Graph, net: RoadNet, d: Derived): { graph: Graph; removedEdges: number; removedNodes: number } {
  const rings = d.buildingRings.filter((r) => r.length > 2).map((ring) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of ring) { x0 = Math.min(x0, q.x); z0 = Math.min(z0, q.z); x1 = Math.max(x1, q.x); z1 = Math.max(z1, q.z); }
    return { ring, x0, z0, x1, z1 };
  });
  // MAP4: grid over the ring boxes (every sample point scanned every ring: 2 s on the R4 net)
  const BCELL = 64;
  const bGrid = new Map<number, number[]>();
  rings.forEach((r, i) => {
    for (let x = Math.floor(r.x0 / BCELL); x <= Math.floor(r.x1 / BCELL); x++) for (let z = Math.floor(r.z0 / BCELL); z <= Math.floor(r.z1 / BCELL); z++) {
      const k = x * 65536 + z;
      const l = bGrid.get(k);
      if (l) l.push(i); else bGrid.set(k, [i]);
    }
  });
  const inBuilding = (p: Vec2): boolean => (bGrid.get(Math.floor(p.x / BCELL) * 65536 + Math.floor(p.z / BCELL)) ?? []).some((i) => {
    const r = rings[i];
    return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1 && pointInPolygon(p, r.ring);
  });
  const isCross = (id: string): boolean => id.startsWith('cw:');
  const good: GraphEdge[] = [];
  for (const e of g.edges) {
    const a = g.nodes[e.from], b = g.nodes[e.to];
    if (!a || !b) continue;
    if (isCross(e.from) && isCross(e.to)) { good.push(e); continue; }
    const ring = !isCross(e.from) && !isCross(e.to);
    const n = Math.max(1, Math.ceil(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) / WALK_SAMPLE));
    let bad = false;
    for (let i = 0; i <= n && !bad; i++) {
      const p = { x: a.pos.x + ((b.pos.x - a.pos.x) * i) / n, z: a.pos.z + ((b.pos.z - a.pos.z) * i) / n };
      bad = inBuilding(p) || (ring && net.isOnRoad(p));
    }
    if (!bad) good.push(e);
  }
  // connected pieces (undirected)
  const nbr = new Map<string, string[]>();
  const link = (a: string, b: string): void => { const l = nbr.get(a); if (l) l.push(b); else nbr.set(a, [b]); };
  for (const e of good) { link(e.from, e.to); link(e.to, e.from); }
  const piece = new Map<string, number>();
  const sizes: number[] = [];
  for (const id of nbr.keys()) {
    if (piece.has(id)) continue;
    const k = sizes.length;
    let size = 0;
    const stack = [id];
    piece.set(id, k);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const o of nbr.get(c) ?? []) if (!piece.has(o)) { piece.set(o, k); stack.push(o); }
    }
    sizes.push(size);
  }
  const keep = (id: string): boolean => (sizes[piece.get(id) ?? -1] ?? 0) >= WALK_MIN_PIECE;
  const graph: Graph = { nodes: {}, edges: [], adjacency: {} };
  for (const id in g.nodes) if (keep(id)) { graph.nodes[id] = g.nodes[id]; graph.adjacency[id] = []; }
  for (const e of good) {
    if (!graph.nodes[e.from] || !graph.nodes[e.to]) continue;
    graph.adjacency[e.from].push(graph.edges.length);
    graph.edges.push(e);
  }
  return { graph, removedEdges: g.edges.length - graph.edges.length, removedNodes: Object.keys(g.nodes).length - Object.keys(graph.nodes).length };
}

/** what TrafficSystem calls to make a car */
export type MakeVehicleFn = (type: VehicleType, pos: Vec2, heading: number, color: string) => IVehicle;

/**
 * Vehicles longer than this (m) are not put on the real map. The agent's turn filter (`TrafficAgent.edgesItCanTurn`) lets a vehicle
 * take any turn whose chord is within 1.2 of its turning circle; the real junctions are wider than the grid's, so a 12.5 m bus or a
 * 9.2 m refuse truck passes that filter on many corners and then cannot physically follow them (measured, tests/unit/sim/
 * realtraffic-turns.test.ts: a bus makes 11 of 443 connectors, a refuse truck 33, a 7 m box truck 440). They run as box trucks.
 */
export const MAX_REAL_VEHICLE_LENGTH = 8;

/** share of the tier's parked-car occupancy used on the real map: 0.65 x 2.7 times the kerb length is ~2,500 bodies, the grid's ~930 is the budget */
export const REAL_PARK_SHARE = 0.4;

export interface RealTraffic {
  /** hand this to TrafficSystem (and the pedestrian factory) in place of the grid */
  grid: GridModel;
  lights: RealTrafficLights;
  lanes: LaneGraph;
  sidewalks: SidewalkNet;
  /** ids of the sidewalk nodes at crosswalk ends (Pedestrian's `crosswalkNodes`) */
  crosswalkNodes: Set<string>;
  /** the lane graph builder's full result (chains, connectors) */
  laneBuild: LaneBuild;
  /** wraps TrafficSystem's car factory: vehicles longer than MAX_REAL_VEHICLE_LENGTH (buses, refuse trucks) are made as box trucks */
  fitVehicles: (make: MakeVehicleFn) => MakeVehicleFn;
  /** the quality tier's traffic numbers for this map: the same, with parked cars thinned to REAL_PARK_SHARE (the map is about 2.7 times the grid's kerb length) */
  density: <T extends { parkOccupancy: number }>(d: T) => T;
  /** the walking graph pedestrians use (`sidewalks.graph` minus ring edges over a roadway or a building) */
  walk: Graph;
}

const PARK_MIN_LENGTH = 25;
/** TrafficSystem parks a car (width / 2 - 1) m from the centreline; reporting the street this much wider puts parked wheels at the kerb, so a one-lane street keeps its lane clear (m) */
const PARK_KERB_SLACK = 0.6;
const STRAIGHT_TOL = 1;

function nearestOf<T extends GraphNode>(list: readonly T[], p: Vec2): T {
  let best = list[0];
  let bd = Infinity;
  for (const n of list) {
    const d = (n.pos.x - p.x) ** 2 + (n.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/**
 * `compact` (the game, not the tests): REALFIX2. The whole-map graphs are string-keyed object graphs, so they are what makes the heap grow with the map
 * (adjacency tables alone were 34 MB of 83 on the grown net). With it the sidewalk graph IS the walking graph (`sidewalks.graph` is replaced by the
 * filtered one, so one adjacency table instead of two, and the pointer arrow and the mission walker stop routing over a roadway or through a building
 * too), the per-node block table is emptied, and the lane builder's chains and connector lists, which only tests read, are dropped.
 */
export function makeRealTraffic(net: RoadNet, d: Derived, sidewalks: SidewalkNet, controlsJson: unknown, startTime = 0, compact = false): RealTraffic {
  const laneBuild = buildLaneGraphDetailed(net, d);
  const lanes = laneBuild.graph;
  const control = nodeControl(net, controlsJson);
  const lights = new RealTrafficLights(net, d, control, startTime);

  // crossings: June keys them `n{node}`; the controller is keyed by cluster
  const clusters = junctionClusters(net, d);
  const ci = clusterIndexOfNode(net, clusters);
  const raw = buildPedCrossingsReal(sidewalks, net);
  const pedCrossings = new Map<string, PedCrossing>();
  for (const [k, info] of raw) {
    const node = Number(info.intersectionId.slice(1));
    const c = clusters[ci[node]];
    pedCrossings.set(k, { intersectionId: c ? clusterId(c) : info.intersectionId, crossedStreetId: info.crossedStreetId });
  }

  const streetCache = new Map<string, StreetDef>();
  const streetById = (id: string): StreetDef => {
    let s = streetCache.get(id);
    if (!s) {
      const e = net.edges[net.streetEdges(id)[0] ?? 0];
      // parking: a single-lane one-way street still has kerbs to park on, so it reports as parkable
      const parkable = e.cls === 'street' && e.width >= 7;
      s = {
        id, name: e.name, signName: e.name, axis: 'ns', offset: 0, class: (e.cls === 'avenue' || e.cls === 'arterial' || e.cls === 'highway' ? 'avenue' : 'street') as StreetDef['class'],
        roadWidth: e.width, sidewalkWidth: e.sidewalk, oneWay: parkable ? 0 : e.oneway,
      };
      streetCache.set(id, s);
    }
    return s;
  };

  // straight stretches for parked cars
  const segments: RoadSegment[] = [];
  net.edges.forEach((e, i) => {
    if (e.level !== 0 || e.cls !== 'street' || e.width < 7 || e.a === e.b) return;
    const cutA = d.cuts[i].cutA, cutB = d.cuts[i].cutB;
    const L = net.lengths[i];
    if (L - cutA - cutB < PARK_MIN_LENGTH) return;
    const a = net.pointAt(i, cutA).p, b = net.pointAt(i, L - cutB).p;
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    for (const p of e.pts) if (Math.abs((p.x - a.x) * -dz + (p.z - a.z) * dx) / l > STRAIGHT_TOL && Math.hypot(p.x - a.x, p.z - a.z) > cutA + 1 && Math.hypot(p.x - b.x, p.z - b.z) > cutB + 1) return;
    segments.push({ id: `rs${i}`, streetId: net.streetIdOf(i), fromIntersection: `n${e.a}`, toIntersection: `n${e.b}`, a, b, width: e.width + PARK_KERB_SLACK });
  });

  const laneList = Object.values(lanes.nodes);
  const walk = walkableGraph(sidewalks.graph, net, d).graph;
  const swList = Object.values(walk.nodes);
  const b = net.bounds;
  const grid = {
    seed: 0,
    bounds: { ...b },
    streets: [],
    intersections: [],
    segments,
    crosswalks: sidewalks.crosswalks,
    pedCrossings,
    blocks: [],
    lanes,
    sidewalks: walk,
    streetById,
    blockById: () => { throw new Error('real map: no grid blocks'); },
    nearestLaneNode: (p: Vec2) => nearestOf(laneList, p),
    nearestSidewalkNode: (p: Vec2) => nearestOf(swList, p),
    nearestStreet: (p: Vec2) => {
      const h = net.nearestEdge(p);
      return streetById(h ? net.streetIdOf(h.edge) : net.streetIdOf(0));
    },
    isOnRoad: (p: Vec2) => net.isOnRoad(p),
  } as unknown as GridModel;

  if (compact) {
    sidewalks.graph = walk;
    (sidewalks as { blockOf: Record<string, number> }).blockOf = {};
    const lb = laneBuild as unknown as Record<string, unknown>;
    for (const k of ['chains', 'connectors', 'strandedEnds', 'orphanStarts', 'extraSinks', 'extraSources', 'clusters']) lb[k] = Array.isArray(lb[k]) ? [] : lb[k];
  }
  const fitVehicles = (make: MakeVehicleFn): MakeVehicleFn => (type, pos, heading, color) =>
    make(VEHICLE_SPECS[type].length > MAX_REAL_VEHICLE_LENGTH ? 'boxtruck' : type, pos, heading, color);
  return { grid, lights, lanes, sidewalks, crosswalkNodes: sidewalks.crosswalkNodes, laneBuild, fitVehicles, density: (d) => ({ ...d, parkOccupancy: d.parkOccupancy * REAL_PARK_SHARE }), walk };
}

/** Async loader for the preview branch: pulls in the controls data only when the real map is on. */
export async function loadRealTraffic(rw: { net: RoadNet; derived: Derived; sidewalks: SidewalkNet }): Promise<RealTraffic> {
  const controls = (await import('@/world/data/roadnet-controls.json')).default as unknown;
  return makeRealTraffic(rw.net, rw.derived, rw.sidewalks, controls);
}
