import * as THREE from 'three';
import { it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficSystem } from '@/game/TrafficSystem';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import type { IVehicle, VehicleType } from '@/world/types';
import { DT, proxyMaterials, realPhysics, stubMaterials } from '../sim/harness';
const IDS = (process.env.DBG_IDS ?? 'veh309').split(',');
const T0 = Number(process.env.DBG_T0 ?? 100), T1 = Number(process.env.DBG_T1 ?? 180), EVERY = Number(process.env.DBG_EVERY ?? 60);
it('dbg', () => {
  const seed = Number(process.env.DBG_SEED ?? 21);
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
  const hits: string[] = []; let tcur = 0;
  events.on('pedKnockedDown', (e: any) => { const act = (traffic as any).active as any[]; const near = act.filter((a) => { const ped = traffic.peds.find((q) => q.id === e.id); return ped && Math.hypot(a.vehicle.body.pos.x - ped.body.pos.x, a.vehicle.body.pos.z - ped.body.pos.z) < 5; }).map((a) => `${a.vehicle.id} v${a.vehicle.speed.toFixed(1)} st=${a.agent.state} tgt=${a.agent.targetId} pedGap=${a.agent.pedGap} flank=${a.agent.pedFlank} @${a.vehicle.body.pos.x.toFixed(1)},${a.vehicle.body.pos.z.toFixed(1)}`); hits.push(`t=${tcur.toFixed(2)} ${e.id} ${near.join(' | ')}`); });
  const total = Math.round(T1 / DT);
  const out: string[] = [];
  for (let step = 0; step < total; step++) {
    const t = step * DT; tcur = t;
    traffic.update(DT, { x: 0, z: 50 });
    cops.update(DT, { x: 0, z: 50 });
    wanted.update(DT);
    for (const v of traffic.vehicles) v.update(DT);
    for (const v of cops.cops) v.update(DT);
    for (const p of traffic.peds) p.update(DT);
    const contacts = physics.step(DT);
    for (const c of contacts) {
      for (const v of [...traffic.vehicles, ...cops.cops, ...traffic.peds] as any[]) { if (v.body.id === c.a.id) (v as any).onContact?.(c, c.b); if (v.body.id === c.b.id) (v as any).onContact?.(c, c.a); }
    }
    if (t >= T0 && step % EVERY === 0) {
      const act = (traffic as any).active as { agent: any; vehicle: IVehicle }[];
      for (const a of act) {
        if (!(IDS.includes(a.vehicle.id) || (IDS[0]==='ALL' && a.vehicle.body.pos.x>-6&&a.vehicle.body.pos.x<8&&a.vehicle.body.pos.z>-70&&a.vehicle.body.pos.z<14&&a.vehicle.speed<1.5))) continue;
        const p = a.vehicle.body.pos; const ag = a.agent; const tg = ag.target;
        let ph = '';
        if (tg?.intersectionId) ph = traffic.lights.hasSignal(tg.intersectionId) ? traffic.lights.phaseFor(tg.intersectionId, tg.streetId) : 'nosig';
        const lb = ag.lastBlocker;
        out.push(`t=${t.toFixed(1)} ${a.vehicle.id} ${p.x.toFixed(1)},${p.z.toFixed(1)} v${a.vehicle.speed.toFixed(1)} h${a.vehicle.body.heading.toFixed(2)} st=${ag.state} tgt=${ag.targetId}${tg?.stopLine ? '(SL)' : ''} ph=${ph} LB=${lb ? lb.id + '@' + lb.pos.x.toFixed(1) + ',' + lb.pos.z.toFixed(1) + ' v' + Math.hypot(lb.vel.x, lb.vel.z).toFixed(1) : '-'} stuck=${ag.stuckTime.toFixed(1)} bT=${ag.blockedTime.toFixed(1)} jw=${ag.jamWait.toFixed(1)} yh=${ag.yieldHold.toFixed(1)} wt=${ag.waitTimer.toFixed(1)}`);
      }
    }
  }
  (globalThis as any).process.getBuiltinModule('node:fs').writeFileSync(process.env.DBG_OUT!, hits.join('\n')+'\n'+out.join('\n'));
}, 600000);
