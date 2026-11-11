/**
 * REALTRAFFIC: the unchanged TrafficSystem on the real street network (adapter: roadnet/trafficReal.ts), headless.
 * Same gates the grid traffic tests use (tests/unit/sim/traffic-5min.test.ts, game/trafficsim.test.ts): no gridlock
 * (>= 10 m in every 60 s window), nobody runs a red light, no pedestrian knocked down, pedestrians step off only on WALK,
 * and the population holds near its target. Real Vehicle physics and pedestrians, no buildings (colliders need the
 * GPU-side world build), real RealTrafficLights. Cops stay off on this map.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { angleDiff, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { FULL_DENSITY, TrafficSystem } from '@/game/TrafficSystem';
import { World2D } from '@/physics/World2D';
import core from '@/world/data/roadnet-core.json';
import controls from '@/world/data/roadnet-controls.json';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import { pointInPolygon } from '@/world/roadnet/geom';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { buildSidewalkGraph } from '@/world/roadnet/sidewalks';
import { makeRealTraffic } from '@/world/roadnet/trafficReal';
import type { IVehicle, VehicleType } from '@/world/types';
import { DT, proxyMaterials, stubMaterials } from './harness';

const SIM_SECONDS = 600;
const WINDOW = 60;

const net = RoadNet.fromJson(core as unknown as RoadNetJson);
const d = deriveGeometry(net);
const sw = buildSidewalkGraph(net, d);

interface Run {
  agentsSeen: number; windows: number; stuck: string[]; worstNet: number; redViolations: string[]; stopPasses: number;
  knockedDown: string[]; pedBadStarts: string[]; pedStarts: number; maxAgents: number; minAgentsAfterWarmup: number;
  pedMin: number; pedMax: number; pedTarget: number; parked: number; nonFinite: string[]; inBlock: number; samples: number;
  recycled: number; crossings: number; signals: number; start: Vec2; hardAi: number;
}

function runReal(seed: number): Run {
  const rt = makeRealTraffic(net, d, sw, controls);
  const grid = rt.grid;
  const physics = new World2D(12);
  const events = new EventBus();
  const scene = new THREE.Scene();
  let seq = 0;
  const makeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle =>
    new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
  // the player stands on the sidewalk node nearest the middle of the map
  const mid = { x: (net.bounds.minX + net.bounds.maxX) / 2, z: (net.bounds.minZ + net.bounds.maxZ) / 2 };
  const player = grid.nearestSidewalkNode(mid).pos;
  const traffic = new TrafficSystem(grid, physics, events, new Rng(seed), scene, proxyMaterials(), makeVehicle, undefined, rt.lights, undefined, {}, player);
  const parked = traffic.vehicles.filter((v) => v.driver === null).length;

  const run: Run = {
    agentsSeen: 0, windows: 0, stuck: [], worstNet: Infinity, redViolations: [], stopPasses: 0, knockedDown: [], pedBadStarts: [],
    pedStarts: 0, maxAgents: 0, minAgentsAfterWarmup: Infinity, pedMin: Infinity, pedMax: 0, pedTarget: traffic.pedTarget, parked,
    nonFinite: [], inBlock: 0, samples: 0, recycled: 0, crossings: grid.pedCrossings?.size ?? 0, signals: rt.lights.intersectionIds.length,
    start: player, hardAi: 0,
  };
  let t = 0;
  events.on('pedKnockedDown', (e) => run.knockedDown.push(`${e.id}@${t.toFixed(0)}`));
  const driverOf = new Map<string, string | null>();
  events.on('impact', (e) => {
    const a = driverOf.get(e.a), b = driverOf.get(e.b);
    if (e.strength >= 3 && a === 'traffic' && b === 'traffic') run.hardAi++;
  });

  const trail = new Map<string, { t: number; x: number; z: number }[]>();
  const stops = Object.values(grid.lanes.nodes).filter((n) => n.stopLine && n.intersectionId && rt.lights.hasSignal(n.intersectionId));
  const near = stops.filter((n) => Math.hypot(n.pos.x - player.x, n.pos.z - player.z) < 400);
  const redSince = new Map<string, number>();
  const pairs = new Map<string, { i: string; s: string }>();
  for (const n of near) pairs.set(`${n.intersectionId}|${n.streetId}`, { i: n.intersectionId!, s: n.streetId });
  const counted = new Set<string>();
  const curbs = d.curbRings.map((ring) => {
    let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
    for (const p of ring) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); e = Math.max(e, p.z); }
    return { ring, box: [a, b, c, e] as const };
  });
  const inBlock = (p: Vec2): boolean => !net.isOnRoad(p) && curbs.some((q) => q.ring.length > 2 && p.x >= q.box[0] && p.x <= q.box[2] && p.z >= q.box[1] && p.z <= q.box[3] && pointInPolygon(p, q.ring));
  const lastPedKey = new Map<string, string>();
  const known = new Set<string>();

  const total = Math.round(SIM_SECONDS / DT);
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
    for (const [key, { i, s }] of pairs) {
      if (traffic.lights.phaseFor(i, s) === 'red') { if (!redSince.has(key)) redSince.set(key, t); } else redSince.delete(key);
    }
    run.maxAgents = Math.max(run.maxAgents, movers.length);
    if (t > 60) run.minAgentsAfterWarmup = Math.min(run.minAgentsAfterWarmup, movers.length);
    if (t > 30 && step % 60 === 0) { run.pedMin = Math.min(run.pedMin, traffic.peds.length); run.pedMax = Math.max(run.pedMax, traffic.peds.length); }

    if (step % 3 === 0) {
      for (const v of movers) {
        const p = v.body.pos;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { run.nonFinite.push(`${v.id}@${t.toFixed(1)}`); continue; }
        if (step % 30 === 0) { run.samples++; if (inBlock(p)) run.inBlock++; }
        for (const n of near) {
          const dx = n.pos.x - p.x, dz = n.pos.z - p.z, dd = dx * dx + dz * dz;
          if (dd > 36) { counted.delete(`${v.id}@${n.id}`); continue; }
          if (dd > 2.25) continue;
          const key = `${v.id}@${n.id}`;
          if (counted.has(key)) continue;
          if (Math.abs(angleDiff(v.body.heading, n.heading)) > 0.8 || v.speed < 1) continue;
          counted.add(key);
          run.stopPasses++;
          const since = redSince.get(`${n.intersectionId}|${n.streetId}`);
          if (since !== undefined && t - since > 0.5) run.redViolations.push(`${v.id}@${t.toFixed(1)}s ${n.id} red for ${(t - since).toFixed(1)}s at ${v.speed.toFixed(1)} m/s`);
        }
      }
      // pedestrians step off a corner only on WALK
      for (const p of traffic.peds) {
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
    if (step % 60 === 0) {
      for (const v of movers) {
        let h = trail.get(v.id); if (!h) trail.set(v.id, h = []);
        h.push({ t: Math.round(t), x: v.body.pos.x, z: v.body.pos.z });
        known.add(v.id);
      }
    }
  }
  run.agentsSeen = trail.size;
  for (const [id, h] of trail) {
    for (let i = 0; i + WINDOW < h.length; i++) {
      const a = h[i], z = h[i + WINDOW];
      if (z.t - a.t !== WINDOW) continue;
      run.windows++;
      const dd = Math.hypot(z.x - a.x, z.z - a.z);
      run.worstNet = Math.min(run.worstNet, dd);
      if (dd < 10) run.stuck.push(`${id} t=${a.t}-${z.t}s moved ${dd.toFixed(1)} m at ${a.x.toFixed(0)},${a.z.toFixed(0)}`);
    }
  }
  return run;
}

let R: Run;

describe('TrafficSystem on the real map, headless 10 minutes', () => {
  beforeAll(() => { R = runReal(7); }, 900_000);

  it('builds the adapter: real crossings, signals and parked cars', () => {
    expect(R.crossings).toBeGreaterThan(100);
    expect(R.signals).toBeGreaterThan(90);
    expect(R.parked).toBeGreaterThan(40);
  });

  it('population holds: moving cars near the medium target, pedestrians at the target throughout', () => {
    expect(R.agentsSeen).toBeGreaterThan(100); // turnover as the ring refills
    expect(R.maxAgents).toBeGreaterThanOrEqual(25);
    expect(R.maxAgents).toBeLessThanOrEqual(42);
    expect(R.minAgentsAfterWarmup).toBeGreaterThanOrEqual(12);
    expect(R.pedMin).toBeGreaterThanOrEqual(Math.round(R.pedTarget * 0.9));
    expect(R.pedMax).toBeLessThanOrEqual(Math.round(R.pedTarget * 1.1) + 1);
    expect(R.pedTarget).toBe(FULL_DENSITY.peds);
  });

  it('no gridlock: every driving agent moves >= 10 m in every 60 s window', () => {
    expect(R.windows).toBeGreaterThan(300);
    expect(R.stuck).toEqual([]);
  });

  it('no red-light violations at any signalised stop line', () => {
    expect(R.stopPasses).toBeGreaterThan(40);
    expect(R.redViolations).toEqual([]);
  });

  it('no pedestrian is knocked down, and pedestrians step off a signalised corner only on WALK', () => {
    expect(R.knockedDown).toEqual([]);
    expect(R.pedStarts).toBeGreaterThan(3);
    expect(R.pedBadStarts).toEqual([]);
  });

  it('cars stay on the roadway (under 0.5 % of samples inside a block) and nothing goes non-finite', () => {
    expect(R.nonFinite).toEqual([]);
    expect(R.inBlock / R.samples).toBeLessThan(0.005);
  });

  it('reports', () => {
    // eslint-disable-next-line no-console
    console.log('REALTRAFFIC', JSON.stringify({ ...R, stuck: R.stuck.length, redViolations: R.redViolations.length, pedBadStarts: R.pedBadStarts.length }));
  });
});
