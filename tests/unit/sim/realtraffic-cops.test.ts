/**
 * REALTRAFFIC2: the unchanged CopSystem and Cop agents on the real street network (adapter: roadnet/trafficReal.ts), headless.
 * Patrol cars cruise the real lanes while nobody is wanted; with stars up, cops are dispatched, reach a parked player car, and
 * go off duty when the stars decay. Cars stay on the roadway (no kerb, no building ring), nothing goes non-finite.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { World2D } from '@/physics/World2D';
import controls from '@/world/data/roadnet-controls.json';
import { pointInPolygon } from '@/world/roadnet/geom';
import { makeRealTraffic } from '@/world/roadnet/trafficReal';
import type { IVehicle, VehicleType } from '@/world/types';
import { DT, Sim, input, stubMaterials } from './harness';
import { derived, net, sidewalks } from './realtraffic-run';

interface CopRun { maxOnDuty: number; spawned: number; closest: number; closeAt: number; travelled: number; kerb: number; building: number; samples: number; nonFinite: number; sirensOffAt: number; zeroAt: number; stuck: string[] }

const box = (ring: readonly Vec2[]): readonly [number, number, number, number] => {
  let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
  for (const p of ring) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); e = Math.max(e, p.z); }
  return [a, b, c, e];
};
const curbs = derived.curbRings.filter((r) => r.length > 2).map((ring) => ({ ring, b: box(ring) }));
const buildings = derived.buildingRings.filter((r) => r.length > 2).map((ring) => ({ ring, b: box(ring) }));
const inside = (set: typeof curbs, p: Vec2): boolean => set.some((q) => p.x >= q.b[0] && p.x <= q.b[2] && p.z >= q.b[1] && p.z <= q.b[3] && pointInPolygon(p, q.ring));

function run(mode: 'patrol' | 'pursuit', seed: number, seconds: number): CopRun {
  const rt = makeRealTraffic(net, derived, sidewalks, controls);
  const grid = rt.grid;
  const events = new EventBus();
  const physics = new World2D(12);
  const sim = new Sim(physics);
  const wanted = new WantedSystem(events);
  let seq = 0;
  const makeCop = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle => {
    const v = new Vehicle(`cop${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
    sim.add(v);
    return v;
  };
  const cops = new CopSystem(grid, physics, events, new Rng(seed), new THREE.Scene(), makeCop, wanted, { lights: rt.lights, patrolCount: mode === 'patrol' ? 3 : 0 });
  // the player's car stands on a lane near the middle of the map
  const mid = { x: (net.bounds.minX + net.bounds.maxX) / 2, z: (net.bounds.minZ + net.bounds.maxZ) / 2 };
  const lane = grid.nearestLaneNode(mid);
  const pv = new Vehicle('player-car', { ...VEHICLE_SPECS.sedan }, { x: lane.pos.x, z: lane.pos.z }, lane.heading, stubMaterials, events);
  pv.driver = 'player';
  pv.setInput(input());
  sim.add(pv);
  const p0 = { x: pv.body.pos.x, z: pv.body.pos.z };
  const r: CopRun = { maxOnDuty: 0, spawned: 0, closest: Infinity, closeAt: -1, travelled: 0, kerb: 0, building: 0, samples: 0, nonFinite: 0, sirensOffAt: -1, zeroAt: -1, stuck: [] };
  if (mode === 'pursuit') wanted.raiseTo(2);
  const seen = new Set<string>();
  const last = new Map<string, Vec2>();
  const still = new Map<string, number>();
  let t = 0;
  const total = Math.round(seconds / DT);
  for (let step = 0; step < total; step++) {
    t = step * DT;
    // the player drives off in a flash (a long way from any cop) so the pursuit can only end by the stars decaying
    if (mode === 'pursuit' && step === Math.round(15 / DT)) { const far = grid.nearestLaneNode({ x: net.bounds.minX + 200, z: net.bounds.maxZ - 200 }); pv.body.pos.x = far.pos.x; pv.body.pos.z = far.pos.z; }
    rt.lights.update(DT); // main clocks the signals through TrafficSystem.update; there is none here
    cops.update(DT, pv.body.pos, pv.body);
    wanted.update(DT);
    sim.step(DT);
    if (mode === 'pursuit' && wanted.stars === 0 && r.zeroAt < 0) r.zeroAt = t;
    const onDuty = cops.cops.filter((c) => c.driver === 'cop' && c.siren).length;
    r.maxOnDuty = Math.max(r.maxOnDuty, onDuty);
    if (mode === 'pursuit' && wanted.stars === 0 && r.sirensOffAt < 0 && !cops.cops.some((c) => c.siren)) r.sirensOffAt = t;
    for (const c of cops.cops) {
      if (!seen.has(c.id)) { seen.add(c.id); r.spawned++; }
      const p = c.body.pos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { r.nonFinite++; continue; }
      const d = Math.hypot(p.x - pv.body.pos.x, p.z - pv.body.pos.z);
      if (d < r.closest) { r.closest = d; r.closeAt = t; }
      const l = last.get(c.id);
      if (l) r.travelled += Math.hypot(p.x - l.x, p.z - l.z);
      last.set(c.id, { x: p.x, z: p.z });
      if (step % 30 === 0) {
        r.samples++;
        if (!net.isOnRoad(p) && inside(curbs, p)) r.kerb++;
        if (inside(buildings, p)) r.building++;
        // a cop that is driving (not parked at the player) and stands still for 90 s
        if (c.speed < 0.3 && d > 14 && c.siren !== undefined) {
          const s = (still.get(c.id) ?? 0) + 0.5;
          still.set(c.id, s);
          if (s === 90.5) r.stuck.push(`${c.id}@${t.toFixed(0)}s at ${p.x.toFixed(0)},${p.z.toFixed(0)} ${net.streetNameAt(p)}`);
        } else still.set(c.id, 0);
      }
    }
  }
  return r;
}

describe('cops on the real map', () => {
  let patrol: CopRun;
  let chase: CopRun;
  beforeAll(() => { patrol = run('patrol', 3, 150); chase = run('pursuit', 5, 110); }, 600_000);

  it('patrol cars spawn on the real lanes and cruise them', () => {
    expect(patrol.spawned).toBeGreaterThanOrEqual(2);
    expect(patrol.travelled).toBeGreaterThan(300);
    expect(patrol.nonFinite).toBe(0);
  });

  it('two stars dispatch two cops (a third only if they ram the car and the stars climb), and one reaches the player', () => {
    expect(chase.maxOnDuty).toBeGreaterThanOrEqual(2);
    expect(chase.maxOnDuty).toBeLessThanOrEqual(3);
    expect(chase.closest).toBeLessThan(25);
    expect(chase.nonFinite).toBe(0);
  });

  it('the pursuit ends when the stars decay: sirens off within a second of zero stars', () => {
    expect(chase.zeroAt).toBeGreaterThan(0);
    expect(chase.sirensOffAt - chase.zeroAt).toBeLessThanOrEqual(1.5);
  });

  // pursuit cops steer straight at the player once close, and this headless world has no building colliders to stop them: only
  // the lane-following patrol cars are held to the roadway
  it('patrol cars stay on the roadway and out of buildings, and no cop sits still for 90 s away from the player', () => {
    expect(patrol.samples).toBeGreaterThan(50);
    expect(patrol.building).toBe(0);
    expect(patrol.kerb / patrol.samples).toBeLessThan(0.02);
    expect(patrol.stuck).toEqual([]);
    expect(chase.stuck).toEqual([]);
  });
});
