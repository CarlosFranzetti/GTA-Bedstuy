/**
 * REALTRAFFIC2: the headless runner behind tests/unit/sim/realtraffic-5min.test.ts (not a test file).
 *
 * The unchanged TrafficSystem on the real street network (adapter: src/world/roadnet/trafficReal.ts). Real Vehicle physics,
 * real pedestrians, real RealTrafficLights; no buildings (their colliders need the GPU-side build), so "through a building" is
 * measured as a vehicle or pedestrian centre inside a building ring.
 *
 * Gates it measures:
 *   stuck        a driving car that stands (< 0.3 m/s) for more than STILL_MAX seconds with no red or yellow signal ahead of it
 *                on its route (a car waiting for red, or queued behind one, is excused; time spent waiting there is not counted)
 *   redViolations  a car crossing a signalised stop line, aligned and moving, more than 0.5 s into red, that had NOT been within
 *                  ARMED_RANGE of that line while its light was green (a car already in the box crawling out is not running it)
 *   offRoad      moving-car centres inside a block's kerb ring (and not on a roadway), and inside a building ring
 *   peds         pedestrian centres on a roadway away from every crosswalk, inside a building ring, and pedKnockedDown events
 */
import * as THREE from 'three';
import { EventBus } from '@/core/Events';
import { angleDiff, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { TrafficSystem } from '@/game/TrafficSystem';
import { World2D } from '@/physics/World2D';
import core from '@/world/data/roadnet-core.json';
import controls from '@/world/data/roadnet-controls.json';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import { closestOnSegment, pointInPolygon } from '@/world/roadnet/geom';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { buildSidewalkGraph } from '@/world/roadnet/sidewalks';
import { makeRealTraffic } from '@/world/roadnet/trafficReal';
import type { IVehicle, LaneNode, VehicleType } from '@/world/types';
import { DT, proxyMaterials, stubMaterials } from './harness';

export const STILL_MAX = 60;
const ARMED_RANGE = 8;
const CROSSWALK_SLACK = 3.2;

export const net = RoadNet.fromJson(core as unknown as RoadNetJson);
export const derived = deriveGeometry(net);
export const sidewalks = buildSidewalkGraph(net, derived);

export interface RealRun {
  seed: number;
  seconds: number;
  agentsSeen: number;
  maxAgents: number;
  minAgentsAfterWarmup: number;
  pedTarget: number;
  pedMin: number;
  pedMax: number;
  parked: number;
  crossings: number;
  signals: number;
  stuck: string[];
  worstStill: number;
  stopPasses: number;
  redViolations: string[];
  nonFinite: string[];
  carSamples: number;
  carOnKerb: number;
  carInBuilding: number;
  carDetail: string[];
  pedSamples: number;
  pedOnRoad: number;
  pedInBuilding: number;
  pedDetail: string[];
  pedStarts: number;
  pedBadStarts: string[];
  knockedDown: string[];
  hardAi: number;
  traceLog: string[];
}

interface ActiveAgent {
  agent: { state: string; target: LaneNode | null };
  vehicle: IVehicle;
}

export function runReal(seed: number, seconds: number, trace?: ReadonlySet<string>, traceFrom = 0, traceTo = Infinity): RealRun {
  const rt = makeRealTraffic(net, derived, sidewalks, controls);
  const grid = rt.grid;
  const physics = new World2D(12);
  const events = new EventBus();
  const scene = new THREE.Scene();
  let seq = 0;
  const makeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle =>
    new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
  const mid = { x: (net.bounds.minX + net.bounds.maxX) / 2, z: (net.bounds.minZ + net.bounds.maxZ) / 2 };
  const player = grid.nearestSidewalkNode(mid).pos;
  const traffic = new TrafficSystem(grid, physics, events, new Rng(seed), scene, proxyMaterials(), makeVehicle, undefined, rt.lights, undefined, {}, player);
  const active = (): ActiveAgent[] => (traffic as unknown as { active: ActiveAgent[] }).active;

  const run: RealRun = {
    seed, seconds, agentsSeen: 0, maxAgents: 0, minAgentsAfterWarmup: Infinity, pedTarget: traffic.pedTarget, pedMin: Infinity, pedMax: 0,
    parked: traffic.vehicles.filter((v) => v.driver === null).length, crossings: grid.pedCrossings?.size ?? 0, signals: rt.lights.intersectionIds.length,
    stuck: [], worstStill: 0, stopPasses: 0, redViolations: [], nonFinite: [], carSamples: 0, carOnKerb: 0, carInBuilding: 0, carDetail: [],
    pedSamples: 0, pedOnRoad: 0, pedInBuilding: 0, pedDetail: [], pedStarts: 0, pedBadStarts: [], knockedDown: [], hardAi: 0, traceLog: [],
  };
  let t = 0;
  const driverOf = new Map<string, string | null>();
  events.on('pedKnockedDown', (e) => {
    const near = traffic.vehicles.map((v) => ({ v, d: Math.hypot(v.body.pos.x - e.pos.x, v.body.pos.z - e.pos.z) })).sort((a, b) => a.d - b.d)[0];
    run.knockedDown.push(`${e.id}@${t.toFixed(0)} at ${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)} ${net.streetNameAt(e.pos)} nearest ${near ? `${near.v.id} ${near.d.toFixed(1)}m sp${near.v.speed.toFixed(1)} ${near.v.driver ?? 'parked'}` : '-'}`);
  });
  events.on('impact', (e) => {
    if (e.strength >= 3 && driverOf.get(e.a) === 'traffic' && driverOf.get(e.b) === 'traffic') run.hardAi++;
  });

  const signalGoverned = (n: LaneNode): boolean => !!n.stopLine && !!n.intersectionId && rt.lights.hasSignal(n.intersectionId);
  const stopNodes = Object.values(grid.lanes.nodes).filter((n) => signalGoverned(n));
  // spatial buckets of signalised stop nodes, so the per-car checks stay cheap
  const CELL = 16;
  const bucket = new Map<string, LaneNode[]>();
  for (const n of stopNodes) { const k = `${Math.floor(n.pos.x / CELL)},${Math.floor(n.pos.z / CELL)}`; const l = bucket.get(k); if (l) l.push(n); else bucket.set(k, [n]); }
  const stopsNear = (p: Vec2, r: number): LaneNode[] => {
    const out: LaneNode[] = [];
    const c0 = Math.floor((p.x - r) / CELL), c1 = Math.floor((p.x + r) / CELL), r0 = Math.floor((p.z - r) / CELL), r1 = Math.floor((p.z + r) / CELL);
    for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) { const l = bucket.get(`${i},${j}`); if (l) for (const n of l) if (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) <= r) out.push(n); }
    return out;
  };
  /** the next signalised stop line within `range` m of lane graph ahead of a target node, and whether its light is not green */
  const redAhead = (target: LaneNode | null, range = 90): boolean => {
    let n = target;
    let travelled = 0;
    for (let g = 0; n && g < 40 && travelled < range; g++) {
      if (signalGoverned(n)) return rt.lights.phaseFor(n.intersectionId!, n.streetId) !== 'green';
      const adj = grid.lanes.adjacency[n.id];
      if (!adj || !adj.length) return false;
      const e = grid.lanes.edges[adj[0]];
      travelled += e.length;
      n = grid.lanes.nodes[e.to];
    }
    return false;
  };

  const redSince = new Map<string, number>();
  const armed = new Map<string, number>(); // `${veh}@${node}` -> last time the car was in range while the light was not red
  const stillFor = new Map<string, number>();
  const flagged = new Set<string>();
  const counted = new Set<string>();
  const lastPedKey = new Map<string, string>();
  const seen = new Set<string>();

  const boxOf = (ring: readonly Vec2[]): readonly [number, number, number, number] => {
    let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
    for (const p of ring) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); e = Math.max(e, p.z); }
    return [a, b, c, e];
  };
  const curbs = derived.curbRings.filter((r) => r.length > 2).map((ring) => ({ ring, box: boxOf(ring) }));
  const buildings = derived.buildingRings.filter((r) => r.length > 2).map((ring) => ({ ring, box: boxOf(ring) }));
  const inAny = (set: Array<{ ring: readonly Vec2[]; box: readonly [number, number, number, number] }>, p: Vec2): boolean => {
    for (const q of set) if (p.x >= q.box[0] && p.x <= q.box[2] && p.z >= q.box[1] && p.z <= q.box[3] && pointInPolygon(p, q.ring)) return true;
    return false;
  };
  const onKerb = (p: Vec2): boolean => !net.isOnRoad(p) && inAny(curbs, p);
  const nearCrosswalk = (p: Vec2): boolean => {
    for (const c of sidewalks.crosswalks) {
      if (Math.abs(c.a.x + c.b.x - 2 * p.x) > 40 || Math.abs(c.a.z + c.b.z - 2 * p.z) > 40) continue;
      if (closestOnSegment(p, c.a, c.b).d2 < CROSSWALK_SLACK * CROSSWALK_SLACK) return true;
    }
    return false;
  };
  const total = Math.round(seconds / DT);
  for (let step = 0; step < total; step++) {
    t = step * DT;
    traffic.update(DT, player);
    driverOf.clear();
    const movers: IVehicle[] = [];
    const ents = new Map<string, { onContact?: (c: never, o: never) => void }>();
    for (const v of traffic.vehicles) { v.update(DT); ents.set(v.body.id, v as never); driverOf.set(v.body.id, v.driver); if (v.driver === 'traffic') movers.push(v); }
    for (const p of traffic.peds) { p.update(DT); ents.set(p.body.id, p as never); driverOf.set(p.body.id, 'ped'); }
    for (const c of physics.step(DT)) {
      ents.get(c.a.id)?.onContact?.(c as never, c.b as never);
      ents.get(c.b.id)?.onContact?.(c as never, c.a as never);
    }
    run.maxAgents = Math.max(run.maxAgents, movers.length);
    if (t > 60) run.minAgentsAfterWarmup = Math.min(run.minAgentsAfterWarmup, movers.length);
    if (t > 30 && step % 60 === 0) { run.pedMin = Math.min(run.pedMin, traffic.peds.length); run.pedMax = Math.max(run.pedMax, traffic.peds.length); }

    if (step % 3 !== 0) continue;
    const dt3 = DT * 3;
    // red clocks of every signalised approach near a car (only the ones that matter are looked up)
    const act = active();
    const agentOf = new Map<IVehicle, ActiveAgent>();
    for (const a of act) agentOf.set(a.vehicle, a);
    for (const v of movers) {
      const p = v.body.pos;
      seen.add(v.id);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { run.nonFinite.push(`${v.id}@${t.toFixed(1)}`); continue; }
      const ag = agentOf.get(v);
      if (trace && trace.has(v.id) && step % 15 === 0 && t >= traceFrom && t <= traceTo) run.traceLog.push(`${v.id} t${t.toFixed(1)} ${p.x.toFixed(1)},${p.z.toFixed(1)} h${v.body.heading.toFixed(2)} sp${v.speed.toFixed(1)} ${ag?.agent.state} tgt=${ag?.agent.target?.id} (${ag?.agent.target ? `${ag.agent.target.pos.x.toFixed(1)},${ag.agent.target.pos.z.toFixed(1)}` : ''}) near=[${traffic.vehicles.filter((o) => o !== v && Math.hypot(o.body.pos.x - p.x, o.body.pos.z - p.z) < 8).map((o) => `${o.id}(${(o.body.pos.x - p.x).toFixed(1)},${(o.body.pos.z - p.z).toFixed(1)} h${o.body.heading.toFixed(2)} sp${o.speed.toFixed(1)} ${o.driver ?? 'parked'})`).join(' ')}]`);
      // stuck: standing still with nothing but a green (or no signal) ahead
      if (v.speed < 0.3 && !(ag && redAhead(ag.agent.target))) {
        const s = (stillFor.get(v.id) ?? 0) + dt3;
        stillFor.set(v.id, s);
        if (s > run.worstStill) run.worstStill = s;
        if (s > STILL_MAX && !flagged.has(v.id)) {
          flagged.add(v.id);
          const tg = ag?.agent.target;
          run.stuck.push(`${v.id}@${t.toFixed(0)}s still ${s.toFixed(0)}s at ${p.x.toFixed(0)},${p.z.toFixed(0)} ${net.streetNameAt(p)} state=${ag?.agent.state} tgt=${tg?.id}`);
        }
      } else if (v.speed >= 0.3) stillFor.set(v.id, 0);

      // red-light running at signalised stop lines within reach
      for (const n of stopsNear(p, ARMED_RANGE)) {
        const key = `${v.id}@${n.id}`;
        const i = n.intersectionId!;
        const phase = rt.lights.phaseFor(i, n.streetId);
        const dd = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
        if (phase !== 'red') armed.set(key, t);
        if (dd > 1.5 || counted.has(key)) continue;
        if (Math.abs(angleDiff(v.body.heading, n.heading)) > 0.8 || v.speed < 1) continue;
        counted.add(key);
        run.stopPasses++;
        if (phase !== 'red') continue;
        const since = redSince.get(`${i}|${n.streetId}`);
        const lastOk = armed.get(key);
        if (since !== undefined && t - since > 0.5 && !(lastOk !== undefined && t - lastOk < 8)) run.redViolations.push(`${v.id}@${t.toFixed(1)}s ${n.id} red for ${(t - since).toFixed(1)}s at ${v.speed.toFixed(1)} m/s`);
      }
      if (step % 30 === 0) {
        run.carSamples++;
        if (onKerb(p)) { run.carOnKerb++; if (run.carDetail.length < 40) run.carDetail.push(`kerb ${v.id}@${t.toFixed(0)} ${p.x.toFixed(0)},${p.z.toFixed(0)} ${net.streetNameAt(p)} sp${v.speed.toFixed(1)}`); }
        if (inAny(buildings, p)) { run.carInBuilding++; if (run.carDetail.length < 40) run.carDetail.push(`building ${v.id}@${t.toFixed(0)} ${p.x.toFixed(0)},${p.z.toFixed(0)} ${net.streetNameAt(p)} sp${v.speed.toFixed(1)}`); }
      }
    }
    // red clocks (after the checks, so a car crossing the very frame the light changes is judged on the old state)
    for (const n of stopNodes) {
      const rk = `${n.intersectionId}|${n.streetId}`;
      if (traffic.lights.phaseFor(n.intersectionId!, n.streetId) === 'red') { if (!redSince.has(rk)) redSince.set(rk, t); } else redSince.delete(rk);
    }
    // pedestrians
    for (const p of traffic.peds) {
      if (trace && trace.has(p.id) && step % 15 === 0 && t >= traceFrom && t <= traceTo) {
        const pn = p.previousNodeId ? grid.sidewalks.nodes[p.previousNodeId] : undefined, tn = p.targetNodeId ? grid.sidewalks.nodes[p.targetNodeId] : undefined;
        run.traceLog.push(`${p.id} t${t.toFixed(1)} ${p.body.pos.x.toFixed(1)},${p.body.pos.z.toFixed(1)} ${p.state} prev=${p.previousNodeId}(${pn ? `${pn.pos.x.toFixed(1)},${pn.pos.z.toFixed(1)}` : ''}) tgt=${p.targetNodeId}(${tn ? `${tn.pos.x.toFixed(1)},${tn.pos.z.toFixed(1)}` : ''})`);
      }
      if (step % 30 === 0 && p.state === 'walking') {
        run.pedSamples++;
        const q = p.body.pos;
        if (net.isOnRoad(q) && !nearCrosswalk(q)) { run.pedOnRoad++; if (run.pedDetail.length < 40) run.pedDetail.push(`road ${p.id}@${t.toFixed(0)} ${q.x.toFixed(0)},${q.z.toFixed(0)} ${net.streetNameAt(q)}`); }
        if (inAny(buildings, q)) { run.pedInBuilding++; if (run.pedDetail.length < 40) run.pedDetail.push(`building ${p.id}@${t.toFixed(0)} ${q.x.toFixed(0)},${q.z.toFixed(0)} ${net.streetNameAt(q)}`); }
      }
      // a pedestrian steps off a signalised corner only on WALK
      if (p.groupLeader) { lastPedKey.delete(p.id); continue; }
      const key = `${p.previousNodeId}>${p.targetNodeId}`;
      const info = grid.pedCrossings?.get(key);
      if (!info || p.state !== 'walking') { if (!info) lastPedKey.delete(p.id); continue; }
      if (lastPedKey.get(p.id) === key) continue;
      const from = grid.sidewalks.nodes[p.previousNodeId!];
      if (Math.hypot(p.body.pos.x - from.pos.x, p.body.pos.z - from.pos.z) < 0.9) {
        lastPedKey.set(p.id, key);
        run.pedStarts++;
        if (rt.lights.hasSignal(info.intersectionId) && !rt.lights.walkFor(info.intersectionId, info.crossedStreetId)) run.pedBadStarts.push(`${p.id}@${t.toFixed(0)} ${key}`);
      }
    }
  }
  run.agentsSeen = seen.size;
  return run;
}
