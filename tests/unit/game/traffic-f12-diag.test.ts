/**
 * Stage 2 QA: full-density traffic on the REAL Bed-Stuy world for 5 simulated minutes (PRD 5.2: no gridlock,
 * every agent moves >= 10 m in any 60 s window, nobody runs a red light), plus the traffic quality checks that
 * fell out of the exploration (AI vs AI collisions, pedestrians struck, impact-event spam).
 *
 * Population = the TrafficSystem defaults that the medium tier runs in src/main.ts: up to 30 moving cars near the
 * player, ~240 parked cars, 40 pedestrians, 2 patrol cop cars; real Vehicle physics, World2D with all 2286+ static
 * colliders (buildings, props, signal poles), real TrafficLights. Stepped at 60 Hz exactly like main.ts.
 *
 * Defects found by these tests are kept in the suite as `it.fails` (they pass while the defect exists and go red
 * the day it is fixed; then flip them to `it`). See docs/swarm/qa-stage2.md for the ids.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { angleDiff } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { CopSystem } from '@/game/CopSystem';
import { TrafficSystem } from '@/game/TrafficSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import type { IVehicle, VehicleType } from '@/world/types';
import { DT, proxyMaterials, realPhysics, stubMaterials } from '../sim/harness';

const SIM_SECONDS = 300;
const WINDOW = 60;
const PLAYER = { x: 0, z: 50 }; // a central, stationary player: traffic spawns 90-150 m around it

interface Impact { t: number; a: string; b: string; strength: number; x: number; z: number; aDriver?: string; bDriver?: string }
interface Run {
  seed: number;
  agentsSeen: number;
  windows: number;
  stuck: string[];
  worstNet: number;
  redViolations: string[];
  stopPasses: number;
  impacts: Impact[];
  knockedDown: { t: number; id: string }[];
  pedWindows: number;
  pedStill: number;
  maxSpeedRatio: number;
  nonFinite: string[];
  outOfBounds: string[];
  maxAgents: number;
  maxPatrols: number;
}

const TRACE_: number[] | null = process.env.TRACE ? process.env.TRACE.split(',').map(Number) : null;
void TRACE_;
function runTraffic(seed: number): Run {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const events = new EventBus();
  const scene = new THREE.Scene();
  let seq = 0;
  const makeVehicle = (type: VehicleType, pos: { x: number; z: number }, heading: number, color: string): IVehicle =>
    new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
  const traffic = new TrafficSystem(grid, physics, events, new Rng(seed), scene, proxyMaterials(), makeVehicle, undefined, undefined, world.lots);
  const wanted = new WantedSystem(events);
  const cops = new CopSystem(grid, physics, events, new Rng(seed + 1000), scene, makeVehicle, wanted, { lights: traffic.lights, patrolCount: 2 });

  const run: Run = {
    seed, agentsSeen: 0, windows: 0, stuck: [], worstNet: Infinity, redViolations: [], stopPasses: 0, impacts: [], knockedDown: [],
    pedWindows: 0, pedStill: 0, maxSpeedRatio: 0, nonFinite: [], outOfBounds: [], maxAgents: 0, maxPatrols: 0,
  };
  let t = 0;
  const entities = new Map<string, { onContact?: (c: never, o: never) => void; update(dt: number): void }>();
  const driverOf = new Map<string, string | null>();
  const hist: { t: number; m: Map<string, string> }[] = [];
  events.on('impact', (e) => {
    if (process.env.DUMPHARD && e.strength >= 3 && seed === Number(process.env.DUMPHARD)) {
      log(`=== HARD t=${t.toFixed(1)} ${e.a} ${e.b} ${e.strength.toFixed(1)} @${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)}`);
      for (let k = 0; k < hist.length; k += 3) for (const id of [e.a, e.b]) { const l = hist[k].m.get(id); if (l) log(`  T${hist[k].t.toFixed(1)} ${id} ${l}`); }
    }
    driverOf.get(e.a);
    run.impacts.push({ t, a: e.a, b: e.b, strength: e.strength, x: e.pos.x, z: e.pos.z, aDriver: String(driverOf.get(e.a)), bDriver: String(driverOf.get(e.b)) });
  });
  events.on('pedKnockedDown', (e) => run.knockedDown.push({ t, id: e.id }));

  // trajectories sampled once a second: id -> [{t,x,z}]
  const trail = new Map<string, { t: number; x: number; z: number }[]>();
  const pedTrail = new Map<string, { t: number; x: number; z: number }[]>();
  // red-light tracking
  const stops = Object.values(grid.lanes.nodes).filter((n) => n.stopLine && n.intersectionId);
  const pairs = new Map<string, { i: string; s: string }>();
  for (const n of stops) pairs.set(`${n.intersectionId}|${n.streetId}`, { i: n.intersectionId!, s: n.streetId });
  const redSince = new Map<string, number>();
  const counted = new Set<string>(); // `${vehicleId}@${nodeId}` while the car is still near the node
  const b = grid.bounds;

  const total = Math.round(SIM_SECONDS / DT);
  for (let step = 0; step < total; step++) {
    t = step * DT;
    traffic.update(DT, PLAYER);
    cops.update(DT, PLAYER);
    wanted.update(DT);
    entities.clear();
    driverOf.clear();
    const movers: IVehicle[] = [];
    for (const v of traffic.vehicles) { v.update(DT); entities.set(v.body.id, v as never); driverOf.set(v.body.id, v.driver); if (v.driver === 'traffic') movers.push(v); }
    for (const v of cops.cops) { v.update(DT); entities.set(v.body.id, v as never); driverOf.set(v.body.id, v.driver); if (v.driver === 'cop') movers.push(v); }
    for (const p of traffic.peds) { p.update(DT); entities.set(p.body.id, p as never); driverOf.set(p.body.id, 'ped'); }
    const contacts = physics.step(DT);
    for (const c of contacts) {
      entities.get(c.a.id)?.onContact?.(c as never, c.b as never);
      entities.get(c.b.id)?.onContact?.(c as never, c.a as never);
    }

    if (step % 6 === 0) {
      const act = (traffic as unknown as { active: { agent: any; vehicle: IVehicle }[] }).active;
      const m = new Map<string, string>();
      for (const a of act) {
        const p = a.vehicle.body.pos; const ag = a.agent; const tn = ag.target;
        m.set(a.vehicle.id, `p=${p.x.toFixed(1)},${p.z.toFixed(1)} h=${a.vehicle.body.heading.toFixed(2)} v=${a.vehicle.speed.toFixed(1)} ${ag.state} tgt=${ag.targetId} d=${tn ? Math.hypot(tn.pos.x-p.x, tn.pos.z-p.z).toFixed(1) : '-'} lat=${ag.lat.toFixed(1)} pass=${!!ag.passBody} stuck=${ag.stuckTime.toFixed(1)} ped=${ag.pedGap === Infinity ? '-' : ag.pedGap.toFixed(1)} ${tn?.stopLine ? 'SL:' + traffic.lights.phaseFor(tn.intersectionId!, tn.streetId) : ''}`);
      }
      for (const v of cops.cops) m.set(v.id, `COP p=${v.body.pos.x.toFixed(1)},${v.body.pos.z.toFixed(1)} h=${v.body.heading.toFixed(2)} v=${v.speed.toFixed(1)}`);
      hist.push({ t, m }); if (hist.length > 25) hist.shift();
    }
    if (TRACE && seed === TRACE[0] && t >= TRACE[1] && t <= TRACE[2] && step % 6 === 0) {
      const act = (traffic as unknown as { active: { agent: any; vehicle: IVehicle }[] }).active;
      for (const a of act) {
        const p = a.vehicle.body.pos;
        if (Math.hypot(p.x - TRACE[3], p.z - TRACE[4]) > TRACE[5]) continue;
        const ag = a.agent;
        const tn = ag.target;
        if (a.vehicle.speed < 0.5 && step % 12 === 0) for (const o of physics.queryCircle(p, 4.5)) if (o.id !== a.vehicle.body.id) log(`   near ${o.id} ${o.kind} ${o.pos.x.toFixed(1)},${o.pos.z.toFixed(1)} h=${o.heading.toFixed(2)} ${JSON.stringify(o.shape)}`);
        log(`T${t.toFixed(1)} ${a.vehicle.id} p=${p.x.toFixed(1)},${p.z.toFixed(1)} h=${a.vehicle.body.heading.toFixed(2)} v=${a.vehicle.speed.toFixed(1)} ${ag.state} tgt=${ag.targetId} d=${tn ? Math.hypot(tn.pos.x-p.x, tn.pos.z-p.z).toFixed(1) : '-'} lat=${ag.lat.toFixed(1)} pass=${!!ag.passBody} stuck=${ag.stuckTime.toFixed(1)} ped=${ag.pedGap === Infinity ? '-' : ag.pedGap.toFixed(1)} ${tn?.stopLine ? 'SL:' + traffic.lights.phaseFor(tn.intersectionId!, tn.streetId) : ''}`);
      }
      for (const v of cops.cops) { const p = v.body.pos; if (Math.hypot(p.x - TRACE[3], p.z - TRACE[4]) <= TRACE[5]) log(`T${t.toFixed(1)} ${v.id} COP p=${p.x.toFixed(1)},${p.z.toFixed(1)} v=${v.speed.toFixed(1)} d=${v.driver}`); }
      for (const q of traffic.peds) { const p = q.body.pos; if (Math.hypot(p.x - TRACE[3], p.z - TRACE[4]) <= TRACE[5]) log(`T${t.toFixed(1)} ${q.id} PED p=${p.x.toFixed(1)},${p.z.toFixed(1)}`); }
    }
    // signal bookkeeping
    for (const [key, { i, s }] of pairs) {
      if (traffic.lights.phaseFor(i, s) === 'red') { if (!redSince.has(key)) redSince.set(key, t); } else redSince.delete(key);
    }

    run.maxAgents = Math.max(run.maxAgents, movers.length);
    run.maxPatrols = Math.max(run.maxPatrols, cops.cops.filter((c) => c.driver === 'cop').length);

    if (step % 3 === 0) {
      for (const v of movers) {
        const p = v.body.pos;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(v.body.heading)) run.nonFinite.push(`${v.id}@${t.toFixed(1)}`);
        else if (p.x < b.minX - 40 || p.x > b.maxX + 40 || p.z < b.minZ - 40 || p.z > b.maxZ + 40) run.outOfBounds.push(`${v.id}@${t.toFixed(0)} ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
        run.maxSpeedRatio = Math.max(run.maxSpeedRatio, Math.hypot(v.body.vel.x, v.body.vel.z) / v.spec.maxSpeed);
        for (const n of stops) {
          const dx = n.pos.x - p.x, dz = n.pos.z - p.z;
          if (dx * dx + dz * dz > 36) { counted.delete(`${v.id}@${n.id}`); continue; }
          if (dx * dx + dz * dz > 2.25) continue;
          const key = `${v.id}@${n.id}`;
          if (counted.has(key)) continue;
          if (Math.abs(angleDiff(v.body.heading, n.heading)) > 0.8 || v.speed < 1) continue;
          counted.add(key);
          run.stopPasses++;
          const since = redSince.get(`${n.intersectionId}|${n.streetId}`);
          // a car that is already past the point of no return may legitimately finish the yellow: allow 0.5 s of red
          if (since !== undefined && t - since > 0.5) run.redViolations.push(`${v.id}@${t.toFixed(1)}s ${n.id} red for ${(t - since).toFixed(1)}s at ${v.speed.toFixed(1)} m/s`);
        }
      }
      for (const p of traffic.peds) {
        if (!Number.isFinite(p.body.pos.x) || !Number.isFinite(p.body.pos.z)) run.nonFinite.push(`${p.id}@${t.toFixed(1)}`);
      }
    }
    if (step % 60 === 0) {
      for (const v of movers) {
        let h = trail.get(v.id); if (!h) trail.set(v.id, h = []);
        h.push({ t: Math.round(t), x: v.body.pos.x, z: v.body.pos.z });
      }
      for (const p of traffic.peds) {
        let h = pedTrail.get(p.id); if (!h) pedTrail.set(p.id, h = []);
        h.push({ t: Math.round(t), x: p.body.pos.x, z: p.body.pos.z });
      }
    }
  }

  run.agentsSeen = trail.size;
  // vehicles: every contiguous 60 s window must show >= 10 m net displacement
  for (const [id, h] of trail) {
    // split into contiguous runs (an id can only be absent when despawned, ids are never reused)
    for (let i = 0; i + WINDOW < h.length; i++) {
      const a = h[i], z = h[i + WINDOW];
      if (z.t - a.t !== WINDOW) continue;
      run.windows++;
      const d = Math.hypot(z.x - a.x, z.z - a.z);
      run.worstNet = Math.min(run.worstNet, d);
      if (d < 10) run.stuck.push(`${id} t=${a.t}-${z.t}s moved ${d.toFixed(1)} m at ${a.x.toFixed(0)},${a.z.toFixed(0)}`);
    }
  }
  for (const [, h] of pedTrail) {
    for (let i = 0; i + WINDOW < h.length; i += 10) {
      const a = h[i], z = h[i + WINDOW];
      if (!z || z.t - a.t !== WINDOW) continue;
      run.pedWindows++;
      if (Math.hypot(z.x - a.x, z.z - a.z) < 10) run.pedStill++;
    }
  }
  return run;
}


const TRACE: number[] | null = process.env.TRACE ? process.env.TRACE.split(',').map(Number) : null;
const OUT = process.env.OUT ?? '/tmp/f12.txt';
const log = (...a: unknown[]) => appendFileSync(OUT, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
const SEEDS2 = (process.env.SEEDS ?? '7,21').split(',').map(Number);
describe('diag', () => {
  it('dump', () => {
    writeFileSync(OUT, '');
    for (const seed of SEEDS2) {
      const r = runTraffic(seed);
      const hard = r.impacts.filter((i) => i.strength >= 3 && (i.aDriver === 'traffic' || i.aDriver === 'cop') && (i.bDriver === 'traffic' || i.bDriver === 'cop'));
      const pairs = new Map<string, number>();
      for (const i of r.impacts) { const k = `${i.a}>${i.b}@${Math.floor(i.t)}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      log(`SEED ${seed}: impacts=${r.impacts.length} hardAIAI=${hard.length} knocked=${JSON.stringify(r.knockedDown)} maxPairPerSec=${Math.max(0,...pairs.values())} stuck=${r.stuck.length} redV=${r.redViolations.length} stopPasses=${r.stopPasses}`);
      for (const h of hard) log(`  hard t=${h.t.toFixed(1)} ${h.a}(${h.aDriver}) ${h.b}(${h.bDriver}) ${h.strength.toFixed(1)} @${h.x.toFixed(0)},${h.z.toFixed(0)}`);
      log('  stuck', r.stuck.slice(0,5), 'red', r.redViolations.slice(0,5));
    }
  }, 900000);
});
