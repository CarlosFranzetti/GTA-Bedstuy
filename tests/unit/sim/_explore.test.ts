import * as THREE from 'three';
import { it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficSystem } from '@/game/TrafficSystem';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { realPhysics, proxyMaterials, stubMaterials, DT } from './harness';

for (const seed of [21]) it('traffic crash explore ' + seed, () => {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const events = new EventBus();
  let seq = 0;
  const scene = new THREE.Scene();
  const mk = (type: any, pos: any, heading: number, color: string) => new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type as 'sedan'], color }, pos, heading, stubMaterials, events);
  const traffic = new TrafficSystem(grid, physics, events, new Rng(seed), scene, proxyMaterials(), mk as any, undefined, undefined, world.lots);
  const player = { x: 0, z: 50 };
  const entities = new Map<string, any>();
  let simT = 0;
  const agents = () => (traffic as any).active as { agent: any; vehicle: any }[];
  const ints = grid.intersections;
  events.on('impact', (e: any) => {
    if (e.strength < 3) return;
    const A = entities.get(e.a), B = entities.get(e.b);
    if (!A || !B || !(A instanceof Vehicle) || !(B instanceof Vehicle)) return;
    const near = ints.map((i: any) => ({ i, d: Math.hypot(i.pos.x - e.pos.x, i.pos.z - e.pos.z) })).sort((a: any, b: any) => a.d - b.d)[0];
    const st = (v: any) => { const ag = agents().find((q) => q.vehicle === v); return `${v.id}[${v.driver} h${v.body.heading.toFixed(2)} v${v.speed.toFixed(1)} ${ag ? ag.agent.state : 'parked'} dmg${v.damage.toFixed(2)}]`; };
    console.log(`CRASH t=${simT.toFixed(1)} str=${e.strength.toFixed(1)} at ${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)} nearest ${near.i.id} d=${near.d.toFixed(0)} ns=${traffic.lights.phaseFor(near.i.id, near.i.nsStreetId)} ew=${traffic.lights.phaseFor(near.i.id, near.i.ewStreetId)} | ${st(A)} vs ${st(B)}`);
  });
  for (let step = 0; step < 60 * 300; step++) {
    simT = step / 60; traffic.update(DT, player);
    entities.clear();
    for (const v of traffic.vehicles) { v.update(DT); entities.set(v.body.id, v); }
    for (const p of traffic.peds) { p.update(DT); entities.set(p.body.id, p); }
    const contacts = physics.step(DT);
    for (const c of contacts) { entities.get(c.a.id)?.onContact?.(c, c.b); entities.get(c.b.id)?.onContact?.(c, c.a); }
  }
}, 600_000);
