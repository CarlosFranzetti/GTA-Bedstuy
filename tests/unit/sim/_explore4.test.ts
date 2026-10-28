import * as THREE from 'three';
import { it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficSystem } from '@/game/TrafficSystem';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { realPhysics, proxyMaterials, stubMaterials, DT } from './harness';

it('rear end detail', () => {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const events = new EventBus();
  let seq = 0;
  const mk = (type: any, pos: any, heading: number, color: string) => new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type as 'sedan'], color }, pos, heading, stubMaterials, events);
  const traffic = new TrafficSystem(grid, physics, events, new Rng(21), new THREE.Scene(), proxyMaterials(), mk as any, undefined, undefined, world.lots);
  const player = { x: 0, z: 50 };
  const entities = new Map<string, any>();
  const agents = () => (traffic as any).active as { agent: any; vehicle: any }[];
  const ids = ['veh304', 'veh297'];
  const buf: string[] = [];
  let simT = 0;
  events.on('impact', (e: any) => { if (e.a === 'veh304' && e.b === 'veh297' || e.a === 'veh297' && e.b === 'veh304') { console.log('IMPACT', simT.toFixed(2), e.strength.toFixed(1)); console.log(buf.slice(-30).join('\n')); throw new Error('stop'); } });
  try {
  for (let step = 0; step < 60 * 300; step++) {
    simT = step / 60;
    traffic.update(DT, player);
    entities.clear();
    for (const v of traffic.vehicles) { v.update(DT); entities.set(v.body.id, v); }
    for (const p of traffic.peds) { p.update(DT); entities.set(p.body.id, p); }
    const contacts = physics.step(DT);
    for (const c of contacts) { entities.get(c.a.id)?.onContact?.(c, c.b); entities.get(c.b.id)?.onContact?.(c, c.a); }
    if (step % 6 === 0) {
      const f = traffic.vehicles.find((v) => v.id === 'veh304'), l = traffic.vehicles.find((v) => v.id === 'veh297');
      if (f && l) {
        const fa = agents().find((q) => q.vehicle === f)?.agent, la = agents().find((q) => q.vehicle === l)?.agent;
        const gap = Math.hypot(f.body.pos.x - l.body.pos.x, f.body.pos.z - l.body.pos.z);
        const fi = fa?.input, li = la?.input;
        buf.push(`t=${simT.toFixed(2)} gap=${gap.toFixed(1)} F: v=${f.speed.toFixed(1)} lat=${fa?.lat?.toFixed(1)} st=${fa?.state} thr=${fi?.throttle?.toFixed(2)} brk=${fi?.brake} blockT=${fa?.blockedTime?.toFixed(1)} grace=${fa?.blockGrace?.toFixed(1)} pass=${!!fa?.passBody} | L: v=${l.speed.toFixed(1)} lat=${la?.lat?.toFixed(1)} st=${la?.state} thr=${li?.throttle?.toFixed(2)} brk=${li?.brake} pass=${!!la?.passBody} pos=${l.body.pos.x.toFixed(0)},${l.body.pos.z.toFixed(1)} F.pos=${f.body.pos.x.toFixed(0)},${f.body.pos.z.toFixed(1)}`);
      }
    }
  }
  } catch (e) { if ((e as Error).message !== 'stop') throw e; }
}, 300_000);
