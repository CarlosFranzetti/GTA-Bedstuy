import * as THREE from 'three';
import { it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { Sim, realPhysics, stubMaterials, DT, makeVehicle, input } from './harness';

it('pursuit', () => {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const events = new EventBus();
  const sim = new Sim(physics);
  const wanted = new WantedSystem(events);
  let seq = 0;
  const mk = (type: any, pos: any, heading: number, color: string) => { const v = new Vehicle(`cop${seq++}`, { ...VEHICLE_SPECS[type as 'sedan'], color }, pos, heading, stubMaterials, events); sim.add(v); return v; };
  const cops = new CopSystem(grid, physics, events, new Rng(5), new THREE.Scene(), mk as any, wanted, {});
  // fleeing player on a lane
  const startSeg = grid.segments.find((s) => s.streetId === 'throop')!;
  const startId = `ln:${startSeg.id}:f:0`;
  const sn = grid.lanes.nodes[startId];
  const pv = makeVehicle('sedan', sn.pos.x, sn.pos.z, sn.heading, events, 'player-car');
  pv.driver = 'player';
  sim.add(pv);
  const flee = { update(_: number) {} } as any; pv.body.pos.x = 9; pv.body.pos.z = 20; pv.body.heading = 0; pv.setInput(input());
  let crimes = 0; events.on('crime', (c: any) => { crimes++; if (c.type === 'hitCop') log.push(`hitCop@${simT.toFixed(0)}`); });
  const log: string[] = [];
  let simT = 0;
  events.emit('crime', { type: 'hitPed', pos: pv.body.pos }); events.emit('crime', { type: 'hitPed', pos: pv.body.pos }); events.emit('crime', { type: 'hitPed', pos: pv.body.pos });
  for (let step = 0; step < 60 * 240; step++) {
    simT = step / 60;
    flee.update(DT);
    cops.update(DT, pv.body.pos, pv.body);
    wanted.update(DT);
    sim.step(DT);
    if (step % 300 === 0) {
      const d = cops.cops.map((c) => Math.hypot(c.body.pos.x - pv.body.pos.x, c.body.pos.z - pv.body.pos.z).toFixed(0)).join(',');
      console.log(`t=${simT.toFixed(0)} stars=${wanted.stars} cops=${cops.cops.length} dist=[${d}] pv speed=${pv.speed.toFixed(1)} pos=${pv.body.pos.x.toFixed(0)},${pv.body.pos.z.toFixed(0)} crimes=${crimes} dmg=${pv.damage.toFixed(2)} sirens=${cops.cops.filter((c)=>c.siren).length}`);
    }
  }
  console.log(log.join(' '));
}, 300_000);
