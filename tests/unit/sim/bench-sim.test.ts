/**
 * CPU cost of one fixed simulation step on the real Bed-Stuy world: World2D, traffic (cars + pedestrians), cops, the
 * player's own vehicle and the rest, per step, in node (no browser). Prints p50/p95/p99/max per system.
 *   BENCH_SIM=1 npx vitest run tests/unit/sim/bench-sim.test.ts --disableConsoleIntercept   (3000 steps; scripts/bench-sim.sh)
 * Without BENCH_SIM it runs a short smoke version with loose budgets so the suite stays fast and stable.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { CopSystem } from '@/game/CopSystem';
import { TrafficSystem } from '@/game/TrafficSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { Pedestrian } from '@/entities/Pedestrian';
import { Player } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import type { GraphNode, IVehicle, VehicleType } from '@/world/types';
import { DT, proxyMaterials, realPhysics, stubMaterials } from './harness';

declare const process: { env: Record<string, string | undefined>; memoryUsage(): { heapUsed: number } };
const FULL = !!process.env.BENCH_SIM;
const STEPS = FULL ? 3000 : 400;

const pct = (a: number[], p: number): number => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

/** BENCH_PROF=<file> writes a V8 .cpuprofile of just the stepping loop (summarise by self time per function). */
function profiler(file: string | undefined): { start(): void; stop(): void } {
  if (!file) return { start() {}, stop() {} };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req = (globalThis as unknown as { process: { getBuiltinModule(n: string): any } }).process.getBuiltinModule;
  const { Session } = req('node:inspector'); const fs = req('node:fs');
  const ses = new Session(); ses.connect();
  const post = (m: string, p?: object): any => { let out: unknown; ses.post(m, p ?? {}, (_e: unknown, r: unknown) => { out = r; }); return out; };
  return {
    start() { post('Profiler.enable'); post('Profiler.setSamplingInterval', { interval: 200 }); post('Profiler.start'); post('HeapProfiler.startSampling', { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); },
    stop() {
      const r = post('Profiler.stop'); fs.writeFileSync(file, JSON.stringify(r.profile));
      const h = post('HeapProfiler.stopSampling'); fs.writeFileSync(file + '.heap', JSON.stringify(h.profile));
    },
  };
}

export function benchSim(steps: number): { rows: Record<string, number[]>; allocKBPerStep: number } {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const events = new EventBus();
  const scene = new THREE.Scene();
  const rng = new Rng(7);
  let seq = 0;
  const makeVehicle = (type: VehicleType, pos: { x: number; z: number }, heading: number, color: string): IVehicle =>
    new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
  const crosswalkNodes = new Set<string>();
  for (const cw of grid.crosswalks) for (const p of [cw.a, cw.b]) crosswalkNodes.add(grid.nearestSidewalkNode(p).id);
  const makePed = (id: string, node: GraphNode) => new Pedestrian(id, node, grid.sidewalks, physics, proxyMaterials(), events, rng.fork(id), crosswalkNodes);
  const traffic = new TrafficSystem(grid, physics, events, rng.fork('traffic'), scene, proxyMaterials(), makeVehicle, makePed, undefined, world.lots);
  const wanted = new WantedSystem(events);
  const cops = new CopSystem(grid, physics, events, rng.fork('cops'), scene, makeVehicle, wanted, { lights: traffic.lights, patrolCount: 2 });
  const player = new Player('player', { x: 9, z: 20 }, stubMaterials, events);
  player.blockedAt = (p, r, ig) => physics.overlapsSolid(p, r, ig);
  physics.addBody(player.body);
  events.on('enterVehicle', () => physics.removeBody(player.body.id));
  events.on('exitVehicle', () => physics.addBody(player.body));
  const car = makeVehicle('sedan', { x: 9, z: 24 }, 0, '#888');
  physics.addBody(car.body);

  // allocation estimate: sum of positive heap growth between steps (a GC shows as a negative delta and is ignored)
  let allocBytes = 0, lastHeap = process.memoryUsage().heapUsed;

  const rows: Record<string, number[]> = { physics: [], traffic: [], cops: [], peds: [], vehicles: [], player: [], contacts: [], total: [] };
  const entities = new Map<string, { onContact?: (c: never, o: never) => void }>();
  const input = (k: Record<string, number>) => ({ axis: (n: string[], p: string[]) => (p.some((c) => k[c]) ? 1 : 0) - (n.some((c) => k[c]) ? 1 : 0), isDown: () => false, consume: () => false }) as never;
  const now = () => performance.now();
  const prof = profiler(process.env.BENCH_PROF);
  prof.start();
  for (let i = 0; i < steps; i++) {
    const t0 = now();
    if (i === Math.floor(steps / 2) && !player.inVehicle) { player.body.pos.x = car.body.pos.x - 1.5; player.body.pos.z = car.body.pos.z; player.tryEnter([car]); }
    const drive = i > steps / 2;
    player.control(input(drive ? { KeyW: 1, [Math.sin(i / 90) > 0 ? 'KeyD' : 'KeyA']: 1 } : { KeyW: 1 }), 0);
    const ppos = player.vehicle ? player.vehicle.body.pos : player.body.pos;
    let t = now();
    traffic.update(DT, ppos); rows.traffic.push(now() - t); t = now();
    cops.update(DT, ppos, player.vehicle ? player.vehicle.body : player.body); wanted.update(DT); rows.cops.push(now() - t); t = now();
    entities.clear();
    for (const v of traffic.vehicles) { v.update(DT); entities.set(v.body.id, v as never); }
    for (const v of cops.cops) { v.update(DT); entities.set(v.body.id, v as never); }
    car.update(DT); entities.set(car.body.id, car as never);
    rows.vehicles.push(now() - t); t = now();
    for (const p of traffic.peds) { p.update(DT); entities.set(p.body.id, p as never); }
    rows.peds.push(now() - t); t = now();
    player.update(DT); entities.set(player.body.id, player as never);
    rows.player.push(now() - t); t = now();
    const contacts = physics.step(DT);
    rows.physics.push(now() - t); t = now();
    for (const c of contacts) { entities.get(c.a.id)?.onContact?.(c as never, c.b as never); entities.get(c.b.id)?.onContact?.(c as never, c.a as never); }
    rows.contacts.push(now() - t);
    rows.total.push(now() - t0);
    if (i % 10 === 9) { const h = process.memoryUsage().heapUsed; if (h > lastHeap) allocBytes += h - lastHeap; lastHeap = h; }
  }
  prof.stop();
  return { rows, allocKBPerStep: allocBytes / 1024 / steps };
}

describe('sim step cost (node, real world)', () => {
  it(`${STEPS} steps: per-system ms`, () => {
    const warm = 60;
    const { rows, allocKBPerStep } = benchSim(STEPS);
    const lines = Object.entries(rows).map(([k, v]) => { const x = v.slice(warm); return `${k.padEnd(9)} p50 ${pct(x, .5).toFixed(3)}  p95 ${pct(x, .95).toFixed(3)}  p99 ${pct(x, .99).toFixed(3)}  max ${Math.max(...x).toFixed(2)}`; });
    const slow: string[] = [];
    rows.total.forEach((ms, i) => { if (i >= warm && ms > 8) { const top = Object.entries(rows).filter(([k]) => k !== 'total').sort((a, b) => b[1][i] - a[1][i])[0]; slow.push(`#${i} ${ms.toFixed(1)}ms (${top[0]} ${top[1][i].toFixed(1)})`); } });
    if (slow.length) lines.push(`steps > 8 ms: ${slow.length}: ${slow.slice(0, 12).join(', ')}`);
    console.log(`steps=${STEPS} alloc~${allocKBPerStep.toFixed(1)} KB/step\n` + lines.join('\n'));
    const total = rows.total.slice(warm);
    expect(pct(total, .5)).toBeLessThan(FULL ? 1.0 : 5);
    expect(Math.max(...total)).toBeLessThan(FULL ? 8 : 120);
  }, 300_000);
});
