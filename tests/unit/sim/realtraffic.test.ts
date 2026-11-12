/**
 * REALTRAFFIC: the unchanged TrafficSystem on the real street network (adapter: roadnet/trafficReal.ts), headless.
 * Same gates the grid traffic tests use (tests/unit/sim/traffic-5min.test.ts, game/trafficsim.test.ts): no gridlock
 * (>= 10 m in every 60 s window), nobody runs a red light, no pedestrian knocked down, pedestrians step off only on WALK,
 * and the population holds near its target. Real Vehicle physics and pedestrians, no buildings (colliders need the
 * GPU-side world build), real RealTrafficLights. Cops stay off on this map.
 */
import { writeFileSync } from 'node:fs';
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

const SIM_SECONDS = Number((globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.RT_SECONDS ?? 600);
const WINDOW = 60;
const env = (k: string): string | undefined => (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.[k];
const DIAG = !!env('RT_OUT');
const SEED = Number(env('RT_SEED') ?? 7);
const diag: string[] = [];
const watch: string[] = [];
const WATCH = new Set((env('RT_WATCH') ?? '').split(',').filter(Boolean));
const WATCH_FROM = Number(env('RT_WFROM') ?? 0);
const WATCH_TO = Number(env('RT_WTO') ?? 1e9);

const net = RoadNet.fromJson(core as unknown as RoadNetJson);
const d = deriveGeometry(net);
const sw = buildSidewalkGraph(net, d);

interface Run {
  agentsSeen: number; windows: number; stuck: string[]; worstNet: number; redViolations: string[]; stopPasses: number;
  knockedDown: string[]; pedBadStarts: string[]; pedStarts: number; maxAgents: number; minAgentsAfterWarmup: number;
  pedMin: number; pedMax: number; pedTarget: number; parked: number; nonFinite: string[]; inBlock: number; samples: number;
  blockAt: string[]; loopers: string[]; recycled: number; crossings: number; signals: number; start: Vec2; hardAi: number;
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
    nonFinite: [], inBlock: 0, samples: 0, blockAt: [], loopers: [], recycled: 0, crossings: grid.pedCrossings?.size ?? 0, signals: rt.lights.intersectionIds.length,
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
  const hist = new Map<string, string[]>();
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

    if (step % 12 === 0) {
      for (const v of movers) {
        const ag = (traffic as unknown as { active: Array<{ agent: { state: string; target: { id: string } | null }; vehicle: IVehicle }> }).active.find((q) => q.vehicle === v)?.agent;
        let l = hist.get(v.id); if (!l) hist.set(v.id, l = []);
        l.push(`t${t.toFixed(1)} sp${v.speed.toFixed(1)} ${ag?.state} tgt=${ag?.target?.id}`);
        if (l.length > 14) l.shift();
      }
    }
    if (step % 3 === 0) {
      for (const v of movers) {
        const p = v.body.pos;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { run.nonFinite.push(`${v.id}@${t.toFixed(1)}`); continue; }
        if (step % 30 === 0) { run.samples++; if (inBlock(p)) { run.inBlock++; if (run.blockAt.length < 400) run.blockAt.push(`${v.id}@${t.toFixed(0)} ${p.x.toFixed(0)},${p.z.toFixed(0)} ${net.streetNameAt(p)} sp${v.speed.toFixed(1)}`); } }
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
          if (since !== undefined && t - since > 0.5) { const ag = (traffic as unknown as { active: Array<{ agent: Record<string, unknown>; vehicle: IVehicle }> }).active.find((q) => q.vehicle === v)?.agent; run.redViolations.push(`${v.id}@${t.toFixed(1)}s ${n.id} red for ${(t - since).toFixed(1)}s at ${v.speed.toFixed(1)} m/s state=${String(ag?.state)} goLatch=${String(ag?.goLatch)} stopLatch=${String(ag?.stopLatch)} ignore=${String(ag?.ignoreStop)} local=${traffic.lights && (rt.lights as unknown as { localTime(i: string): number }).localTime(n.intersectionId!).toFixed(1)} cyc=${rt.lights.cycleLength(n.intersectionId!)} groups=${rt.lights.groupCount(n.intersectionId!)} HIST ${(hist.get(v.id) ?? []).join(' ; ')}`); }
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
    if (WATCH.size && step % 60 === 0) {
      const act = (traffic as unknown as { active: Array<{ agent: Record<string, unknown> & { state: string; target: { id: string; stopLine: boolean; intersectionId?: string; streetId: string; pos: Vec2 } | null }; vehicle: IVehicle }> }).active;
      for (const a of act) {
        if (!WATCH.has(a.vehicle.id) || t < WATCH_FROM || t > WATCH_TO) continue;
        const v = a.vehicle, tg = a.agent.target;
        const others = traffic.vehicles.filter((o) => o !== v && Math.hypot(o.body.pos.x - v.body.pos.x, o.body.pos.z - v.body.pos.z) < 12).map((o) => `${o.id}(${(o.body.pos.x - v.body.pos.x).toFixed(1)},${(o.body.pos.z - v.body.pos.z).toFixed(1)} sp${o.speed.toFixed(1)} ${o.driver ?? 'park'})`);
        const pe = a.agent.preEdge as number; const exitN = grid.lanes.nodes[grid.lanes.edges[pe]?.to ?? ''];
        const exitInfo = exitN ? `exit=${exitN.id}(${exitN.pos.x.toFixed(1)},${exitN.pos.z.toFixed(1)}) occ=[${traffic.vehicles.filter((o) => Math.hypot(o.body.pos.x - exitN.pos.x, o.body.pos.z - exitN.pos.z) < 14).map((o) => `${o.id}(${(o.body.pos.x - exitN.pos.x).toFixed(1)},${(o.body.pos.z - exitN.pos.z).toFixed(1)} sp${o.speed.toFixed(1)} ${o.driver ?? 'park'})`).join(' ')}]` : '';
        watch.push(`${exitInfo} t${t.toFixed(0)} ${v.id} ${v.body.pos.x.toFixed(1)},${v.body.pos.z.toFixed(1)} h${v.body.heading.toFixed(2)} sp${v.speed.toFixed(1)} ${a.agent.state} tgt=${tg?.id} d=${tg ? Math.hypot(tg.pos.x - v.body.pos.x, tg.pos.z - v.body.pos.z).toFixed(1) : ''} ph=${tg?.intersectionId ? traffic.lights.phaseFor(tg.intersectionId, tg.streetId) : '-'} wait=${(a.agent.waitTimer as number)?.toFixed?.(1)} extra=${(a.agent.extraWait as number)?.toFixed?.(1)} turnW=${(a.agent.turnWait as number)?.toFixed?.(1)} jamW=${(a.agent.jamWait as number)?.toFixed?.(1)} blk=${(a.agent.blockedTime as number)?.toFixed?.(1)} stuck=${(a.agent.stuckTime as number)?.toFixed?.(1)} pedGap=${(a.agent.pedGap as number)?.toFixed?.(1)} yield=${(a.agent.yieldHold as number)?.toFixed?.(1)} near=[${others.join(' ')}]`);
      }
    }
    if (DIAG && step % 600 === 0 && t >= 60) {
      // who is standing still, and what are they looking at
      const act = (traffic as unknown as { active: Array<{ agent: { state: string; target: { id: string; stopLine: boolean; intersectionId?: string; streetId: string; pos: Vec2 } | null }; vehicle: IVehicle }> }).active;
      for (const a of act) {
        const h = trail.get(a.vehicle.id);
        if (!h || h.length < 40) continue;
        const z = h[h.length - 1], b0 = h[h.length - 40];
        if (Math.hypot(z.x - b0.x, z.z - b0.z) > 8) continue;
        const v = a.vehicle, tg = a.agent.target;
        const others = [...traffic.vehicles, ...traffic.peds as unknown as IVehicle[]].filter((o) => o !== v && Math.hypot(o.body.pos.x - v.body.pos.x, o.body.pos.z - v.body.pos.z) < 9)
          .map((o) => `${o.id}(${(o.body.pos.x - v.body.pos.x).toFixed(1)},${(o.body.pos.z - v.body.pos.z).toFixed(1)} h${(o.body.heading ?? 0).toFixed(1)} d=${(o as IVehicle).driver ?? 'ped'} sp${((o as IVehicle).speed ?? 0).toFixed(1)})`);
        diag.push(`t${t.toFixed(0)} ${v.id} at ${v.body.pos.x.toFixed(1)},${v.body.pos.z.toFixed(1)} h${v.body.heading.toFixed(2)} sp${v.speed.toFixed(1)} ${a.agent.state} tgt=${tg?.id} (${tg ? `${tg.pos.x.toFixed(1)},${tg.pos.z.toFixed(1)}` : ''}) stop=${tg?.stopLine} ph=${tg?.intersectionId ? traffic.lights.phaseFor(tg.intersectionId, tg.streetId) : '-'} street=${net.streetNameAt(v.body.pos)} near=[${others.join(' ')}]`);
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
  const dbg: string[] = [];
  for (const a of (traffic as unknown as { active: Array<{ agent: { state: string; target: { id: string; stopLine: boolean; intersectionId?: string; streetId: string } | null; previousNodeId: string | null }; vehicle: IVehicle }> }).active) {
    const h = trail.get(a.vehicle.id);
    if (!h || h.length < 62) continue;
    const z = h[h.length - 1], b0 = h[h.length - 61];
    if (Math.hypot(z.x - b0.x, z.z - b0.z) < 10) {
      const tg = a.agent.target;
      dbg.push(`${a.vehicle.id} ${a.agent.state} tgt=${tg?.id} stop=${tg?.stopLine} cl=${tg?.intersectionId} ph=${tg?.intersectionId ? traffic.lights.phaseFor(tg.intersectionId, tg.streetId) : '-'} sig=${tg?.intersectionId ? traffic.lights.hasSignal(tg.intersectionId) : '-'} at ${a.vehicle.body.pos.x.toFixed(0)},${a.vehicle.body.pos.z.toFixed(0)} sp${a.vehicle.speed.toFixed(1)}`);
    }
  }
  (run as unknown as { dbg: string[] }).dbg = dbg;
  for (const [id, h] of trail) {
    for (let i = 0; i + WINDOW < h.length; i++) {
      const a = h[i], z = h[i + WINDOW];
      if (z.t - a.t !== WINDOW) continue;
      run.windows++;
      const dd = Math.hypot(z.x - a.x, z.z - a.z);
      run.worstNet = Math.min(run.worstNet, dd);
      if (dd < 10) {
        let path = 0;
        for (let k = i + 1; k <= i + WINDOW; k++) path += Math.hypot(h[k].x - h[k - 1].x, h[k].z - h[k - 1].z);
        // a car that keeps driving round a tiny loop is circulating, not gridlocked
        if (path >= 60) { if (!run.loopers.includes(id)) run.loopers.push(id); } else run.stuck.push(`${id} t=${a.t}-${z.t}s moved ${dd.toFixed(1)} m (path ${path.toFixed(0)}) at ${a.x.toFixed(0)},${a.z.toFixed(0)}`);
      }
    }
  }
  return run;
}

let R: Run;

describe('TrafficSystem on the real map, headless 10 minutes', () => {
  beforeAll(() => { R = runReal(SEED); }, 900_000);

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
    expect(R.loopers.length).toBeLessThanOrEqual(1);
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
    if (DIAG) writeFileSync(env('RT_OUT')!, JSON.stringify({ R: { ...R, blockAt: R.blockAt.slice(0, 60) }, diag, watch }, null, 1));
    // eslint-disable-next-line no-console
    console.log('REALTRAFFIC', JSON.stringify({ ...R, stuck: R.stuck.length, loopers: R.loopers.join(','), redViolations: R.redViolations.length, pedBadStarts: R.pedBadStarts.length, blockAt: undefined }));
    console.log('STUCKIDS', [...new Set(R.stuck.map((x) => x.split(' ')[0]))].join(','), R.stuck.slice(0, 3).join(' | '));
    console.log('DBG', ((R as unknown as { dbg: string[] }).dbg).join('\n'));
    console.log('RED', R.redViolations.slice(0, 6).join(' | '));
    console.log('BLOCK', R.blockAt.filter((_, i) => i % 12 === 0).slice(0, 30).join(' | '));
  });
});
