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
import type { GridModel, GraphNode, LaneGraph, RoadSegment, StreetDef } from '@/world/types';
import { clusterId, clusterIndexOfNode, junctionClusters } from './clusters';
import type { Derived } from './derive';
import { buildLaneGraph } from './lanes';
import { RealTrafficLights } from './lightsReal';
import type { RoadNet } from './RoadNet';
import { buildPedCrossingsReal, type SidewalkNet } from './sidewalks';
import { nodeControl } from './signalPhases';

export interface RealTraffic {
  /** hand this to TrafficSystem (and the pedestrian factory) in place of the grid */
  grid: GridModel;
  lights: RealTrafficLights;
  lanes: LaneGraph;
  sidewalks: SidewalkNet;
  /** ids of the sidewalk nodes at crosswalk ends (Pedestrian's `crosswalkNodes`) */
  crosswalkNodes: Set<string>;
}

const PARK_MIN_LENGTH = 25;
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

export function makeRealTraffic(net: RoadNet, d: Derived, sidewalks: SidewalkNet, controlsJson: unknown, startTime = 0): RealTraffic {
  const lanes = buildLaneGraph(net, d);
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
    segments.push({ id: `rs${i}`, streetId: net.streetIdOf(i), fromIntersection: `n${e.a}`, toIntersection: `n${e.b}`, a, b, width: e.width });
  });

  const laneList = Object.values(lanes.nodes);
  const swList = Object.values(sidewalks.graph.nodes);
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
    sidewalks: sidewalks.graph,
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

  return { grid, lights, lanes, sidewalks, crosswalkNodes: sidewalks.crosswalkNodes };
}

/** Async loader for the preview branch: pulls in the controls data only when the real map is on. */
export async function loadRealTraffic(rw: { net: RoadNet; derived: Derived; sidewalks: SidewalkNet }): Promise<RealTraffic> {
  const controls = (await import('@/world/data/roadnet-controls.json')).default as unknown;
  return makeRealTraffic(rw.net, rw.derived, rw.sidewalks, controls);
}
