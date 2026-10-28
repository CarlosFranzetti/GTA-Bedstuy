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
  for (const e of (cops as any).entries) {
    const a = e.agent; const v = e.vehicle;
    console.log('COP', v.id, 'pos', v.body.pos.x.toFixed(1), v.body.pos.z.toFixed(1), 'h', v.body.heading.toFixed(2), 'speed', v.speed.toFixed(2), 'pursuing', a.pursuing, 'offDuty state', a.offDuty.state, 'target', a.offDuty.targetNodeId, 'prev', a.offDuty.previousNodeId, 'laneState', a.lane.state, 'patrol', e.patrol, 'dmg', v.damage.toFixed(2), 'driver', v.driver);
    const ag = a.offDuty as any;
    console.log('  agent', 'stuckTime', ag.stuckTime?.toFixed(1), 'retries', ag.stuckRetries, 'blockedTime', ag.blockedTime?.toFixed(1), 'input', JSON.stringify(ag.input), 'dTarget', ag.target ? Math.hypot(ag.target.pos.x - v.body.pos.x, ag.target.pos.z - v.body.pos.z).toFixed(1) : 'none', 'tpos', ag.target ? ag.target.pos.x.toFixed(0)+','+ag.target.pos.z.toFixed(0) : '', 'lights', !!ag.lights);
    const near: string[] = [];
    for (const b of physics.bodies()) { const d = Math.hypot(b.pos.x - v.body.pos.x, b.pos.z - v.body.pos.z); if (b.shape.kind === 'circle' && d < 6 && b !== v.body) near.push(`${b.id}:${b.kind}@${d.toFixed(1)}`); }
    console.log('  near circles', near.join(' '));
    const walls = world.colliders.filter((c: any) => { const sh = c.shape; if (sh.kind === 'segment') { return Math.min(Math.hypot(sh.a.x - v.body.pos.x, sh.a.z - v.body.pos.z), Math.hypot(sh.b.x - v.body.pos.x, sh.b.z - v.body.pos.z)) < 12; } if (sh.kind === 'polygon') return sh.points.some((p: any) => Math.hypot(p.x - v.body.pos.x, p.z - v.body.pos.z) < 12); return false; }).map((c: any) => c.id + ':' + c.shape.kind);
    console.log('  near walls', walls.join(' '));
    const ahead = physics.raycast({ x: v.body.pos.x, z: v.body.pos.z }, { x: Math.sin(v.body.heading), z: -Math.cos(v.body.heading) }, 15, v.body.id);
    console.log('  ray ahead', ahead ? `${ahead.body.id} kind=${ahead.body.kind} d=${ahead.dist.toFixed(1)}` : 'none');
  }
}, 300_000);
