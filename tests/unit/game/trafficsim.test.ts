import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { TrafficLights } from '@/game/TrafficLights';
import { buildPedCrossings, buildStoopSpots, TrafficSystem } from '@/game/TrafficSystem';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import type { Body2D, IMaterialLibrary, IVehicle, IWorld2D, VehicleInput } from '@/world/types';

const grid = buildGrid(loadBedstuyData());
const materials = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;

class EmptyWorld implements IWorld2D {
  added: Body2D[] = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody(b: Body2D) { this.added.push(b); }
  removeBody() {}
  step() { return []; }
  queryCircle() { return []; }
  raycast() { return null; }
  bodies() { return this.added; }
}

function car(id: string, x: number, z: number, heading: number) {
  let speed = 0;
  const body: Body2D = {
    id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
    pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
  };
  const v = {
    id, object3D: new THREE.Group(), body,
    spec: { type: 'sedan' as const, length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
    get speed() { return speed; },
    damage: 0, driver: 'traffic' as IVehicle['driver'], siren: false,
    last: null as VehicleInput | null,
    setSpeed(s: number) { speed = s; },
    setInput(i: VehicleInput) { v.last = { ...i }; },
    doorPos() { return { x: body.pos.x, z: body.pos.z }; },
    update() {}, dispose() {},
  };
  body.userData = v;
  return v;
}

describe('signals on the real Bed-Stuy grid', () => {
  it('cars never enter a signalised intersection on a red light (14 drivers, 5 minutes each)', () => {
    let passes = 0;
    const violations: string[] = [];
    for (let seed = 1; seed <= 14; seed++) {
      const lights = new TrafficLights(grid, seed * 11);
      // start on the first node of a southbound Throop lane
      const startSeg = grid.segments.find((s) => s.streetId === 'throop')!;
      const startId = `ln:${startSeg.id}:f:0`;
      const startNode = grid.lanes.nodes[startId];
      const v = car(`v${seed}`, startNode.pos.x, startNode.pos.z, startNode.heading);
      v.setSpeed(8);
      const agent = new TrafficAgent(v as unknown as IVehicle, grid.lanes, new EmptyWorld(), new Rng(seed), {
        startNodeId: startId, lights, speedForStreet: (sid) => (grid.streetById(sid).class === 'avenue' ? 13 : 11),
      });
      const stops = Object.values(grid.lanes.nodes).filter((n) => n.stopLine && n.intersectionId);
      const near = new Set<string>();
      const dt = 1 / 30;
      for (let t = 0; t < 300; t += dt) {
        agent.update(dt);
        const i = v.last!;
        let sp = v.speed;
        if (i.brake) sp = Math.max(0, sp - 10 * dt); else sp = Math.max(0, sp + i.throttle * 6 * dt);
        v.setSpeed(sp);
        const b = v.body;
        b.heading += (sp / 2.6) * Math.tan(i.steer * 0.5) * dt;
        b.pos.x += Math.sin(b.heading) * sp * dt;
        b.pos.z += -Math.cos(b.heading) * sp * dt;
        b.vel.x = Math.sin(b.heading) * sp;
        b.vel.z = -Math.cos(b.heading) * sp;
        lights.update(dt);
        for (const n of stops) {
          const d = Math.hypot(n.pos.x - b.pos.x, n.pos.z - b.pos.z);
          if (d < 1.5 && sp > 1) {
            if (!near.has(n.id)) {
              near.add(n.id);
              passes++;
              if (lights.phaseFor(n.intersectionId!, n.streetId) === 'red') violations.push(`${seed}@${t.toFixed(0)} ${n.id} sp=${sp.toFixed(1)} local=${lights.localTime(n.intersectionId!).toFixed(1)} state=${agent.state} d=${d.toFixed(1)}`);
            }
          } else if (d > 6) near.delete(n.id);
        }
      }
    }
    expect(passes).toBeGreaterThan(8);
    expect(violations).toEqual([]);
  });

  it('pedestrians only step off a corner on WALK (10 minutes, 40 pedestrians)', () => {
    const world = new EmptyWorld();
    const events = new EventBus();
    let n = 0;
    const sys = new TrafficSystem(grid, world, events, new Rng(21), new THREE.Scene(), materials,
      (type, pos, heading) => car(`c${n++}`, pos.x, pos.z, heading) as unknown as IVehicle);
    const crossings = buildPedCrossings(grid);
    expect(crossings.size).toBeGreaterThan(40);
    let started = 0;
    const bad: string[] = [];
    const last = new Map<string, string>();
    const dt = 0.1;
    for (let t = 0; t < 600; t += dt) {
      sys.update(dt, { x: 0, z: 150 });
      for (const p of sys.peds) {
        p.update(dt);
        // a group follower walks beside its leader and keeps a stale own edge: the leader's gate is what counts
        if (p.groupLeader) { last.delete(p.id); continue; }
        const key = `${p.previousNodeId}>${p.targetNodeId}`;
        const info = crossings.get(key);
        if (!info || p.state !== 'walking') { if (!info) last.delete(p.id); continue; }
        if (last.get(p.id) === key) continue;
        const from = grid.sidewalks.nodes[p.previousNodeId!];
        const d = Math.hypot(p.body.pos.x - from.pos.x, p.body.pos.z - from.pos.z);
        if (d < 0.9) {
          last.set(p.id, key);
          started++;
          if (!sys.lights.walkFor(info.intersectionId, info.crossedStreetId)) bad.push(`${p.id}@${t.toFixed(0)} ${key}`);
        }
      }
    }
    expect(started).toBeGreaterThan(3);
    expect(bad).toEqual([]);
  });

  it('stoop spots come from brownstone lots only, in front of the building line', () => {
    const lot = (type: string, x: number) => ({
      id: 'l', blockId: 'r0c0', side: 'N', frontA: { x, z: 0 }, frontB: { x: x + 6, z: 0 }, width: 6, depth: 20,
      outward: { x: 0, z: -1 }, type, corner: false,
    });
    const spots = buildStoopSpots([lot('brownstone', 0), lot('apartment', 10), lot('brownstone', 20)] as never);
    expect(spots).toHaveLength(2);
    expect(spots[0].pos.x).toBeCloseTo(3, 5);
    expect(spots[0].pos.z).toBeLessThan(0);
  });
});
