/**
 * REALTRAFFIC2: drives one car through every turn connector of the real lane graph, alone, to see which turns a car can make
 * (not a test file). The path is the last lane nodes before the stop line, the connector, and the first nodes of the exit
 * lane; the car starts 15 m or so before the line at speed, lights are always green. A turn is a failure when the car leaves
 * the path by more than MAX_DEV m, stops on it, or ends off the roadway.
 */
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { World2D } from '@/physics/World2D';
import type { Vec2 } from '@/core/Math2';
import type { LaneGraph, LaneNode, VehicleType } from '@/world/types';
import { buildLaneGraphDetailed } from '@/world/roadnet/lanes';
import { pointInPolygon } from '@/world/roadnet/geom';
import { badKerb, derived, net } from './realtraffic-run';
import { DT, stubMaterials } from './harness';

export const MAX_DEV = 2.6;

export interface TurnResult {
  from: string;
  to: string;
  turn: number;
  maxDev: number;
  finished: boolean;
  kerb: number;
  seconds: number;
  at: Vec2;
}

const greenLights = {
  hasSignal: () => true, phaseFor: () => 'green', phaseTimeLeft: () => 99, walkFor: () => false, walkStateFor: () => 'dont',
  secondsUntilGreen: () => 0, update: () => {},
} as never;

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

export function driveTurns(type: VehicleType = 'sedan', onlyEvery = 1, fromRest = false): TurnResult[] {
  const lb = buildLaneGraphDetailed(net, derived);
  const g = lb.graph;
  const chainEndingAt = new Map(lb.chains.map((c) => [c.nodeIds[c.nodeIds.length - 1], c]));
  const chainStartingAt = new Map(lb.chains.map((c) => [c.nodeIds[0], c]));
  const curbs = derived.curbRings.filter((r, i) => r.length > 2 && !badKerb.has(i)).map((ring) => {
    let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
    for (const p of ring) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); e = Math.max(e, p.z); }
    return { ring, box: [a, b, c, e] as const };
  });
  const kerb = (p: Vec2): boolean => !net.isOnRoad(p) && curbs.some((q) => p.x >= q.box[0] && p.x <= q.box[2] && p.z >= q.box[1] && p.z <= q.box[3] && pointInPolygon(p, q.ring));
  const out: TurnResult[] = [];
  let k = 0;
  for (const c of lb.connectors) {
    if (c.uturn || k++ % onlyEvery !== 0) continue;
    const a = chainEndingAt.get(c.from), b = chainStartingAt.get(c.to);
    if (!a || !b) continue;
    const ids = [...a.nodeIds.slice(fromRest ? -1 : -4), ...c.nodeIds, ...b.nodeIds.slice(0, 5)];
    const mini: LaneGraph = { nodes: {}, edges: [], adjacency: {} };
    for (const id of ids) { mini.nodes[id] = g.nodes[id]; mini.adjacency[id] = []; }
    for (let i = 0; i + 1 < ids.length; i++) {
      const p = g.nodes[ids[i]].pos, q = g.nodes[ids[i + 1]].pos;
      mini.adjacency[ids[i]].push(mini.edges.length);
      mini.edges.push({ from: ids[i], to: ids[i + 1], length: Math.hypot(p.x - q.x, p.z - q.z), streetId: g.nodes[ids[i + 1]].streetId });
    }
    const first = g.nodes[ids[0]] as LaneNode;
    const last = g.nodes[ids[ids.length - 1]];
    const events = new EventBus();
    const world = new World2D(12);
    const v = new Vehicle('turn', { ...VEHICLE_SPECS[type] }, { x: first.pos.x, z: first.pos.z }, first.heading, stubMaterials, events);
    v.driver = 'traffic';
    world.addBody(v.body);
    if (!fromRest) { v.body.vel.x = Math.sin(first.heading) * 8; v.body.vel.z = -Math.cos(first.heading) * 8; }
    const agent = new TrafficAgent(v, mini, world, new Rng(1), { startNodeId: first.id, speedForStreet: () => 11, lights: greenLights });
    const poly = ids.map((id) => g.nodes[id].pos);
    let maxDev = 0, kerbN = 0, t = 0, finished = false, at = first.pos;
    for (; t < 40; t += DT) {
      agent.update(DT);
      v.update(DT);
      world.step(DT);
      const p = v.body.pos;
      let d = Infinity;
      for (let i = 0; i + 1 < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[i + 1]));
      if (d > maxDev) { maxDev = d; at = { x: p.x, z: p.z }; }
      if (kerb(p)) kerbN++;
      if (Math.hypot(p.x - last.pos.x, p.z - last.pos.z) < 2.5) { finished = true; break; }
    }
    out.push({ from: c.from, to: c.to, turn: Math.abs(((g.nodes[c.to].heading - g.nodes[c.from].heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI), maxDev, finished, kerb: kerbN, seconds: t, at });
  }
  return out;
}
