import * as THREE from 'three';
import { it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficSystem } from '@/game/TrafficSystem';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { realPhysics, proxyMaterials, stubMaterials, DT } from './harness';

for (const seed of [7, 21]) it('traffic explore ' + seed, () => {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const events = new EventBus();
  let seq = 0;
  const scene = new THREE.Scene();
  const mk = (type: any, pos: any, heading: number, color: string) => new Vehicle(`veh${seq++}`, { ...VEHICLE_SPECS[type as 'sedan'], color }, pos, heading, stubMaterials, events);
  const traffic = new TrafficSystem(grid, physics, events, new Rng(seed), scene, proxyMaterials(), mk as any, undefined, undefined, world.lots);
  const player = { x: 0, z: 50 };
  const entities = new Map<string, any>();
  const hist = new Map<string, { t: number; x: number; z: number }[]>();
  let impacts = 0; const imp: any[] = [];
  events.on('impact', (e: any) => { impacts++; imp.push({ ...e, t: +(simT).toFixed(1) }); });
  let simT = 0;
  for (let step = 0; step < 60 * 300; step++) {
    simT = step / 60; traffic.update(DT, player);
    entities.clear();
    for (const v of traffic.vehicles) { v.update(DT); entities.set(v.body.id, v); }
    for (const p of traffic.peds) { p.update(DT); entities.set(p.body.id, p); }
    const contacts = physics.step(DT);
    for (const c of contacts) { entities.get(c.a.id)?.onContact?.(c, c.b); entities.get(c.b.id)?.onContact?.(c, c.a); }
    if (step % 60 === 0) {
      const t = step / 60;
      for (const v of traffic.vehicles) if (v.driver === 'traffic') { let h = hist.get(v.id); if (!h) hist.set(v.id, h = []); h.push({ t, x: v.body.pos.x, z: v.body.pos.z }); }
    }
  }
  // windows
  let worst = Infinity; const bad: string[] = []; let windows = 0;
  for (const [id, h] of hist) {
    for (let i = 0; i < h.length; i++) {
      const a = h[i]; const j = h.findIndex((q) => q.t === a.t + 60);
      if (j < 0 || h[j].t - a.t !== 60 || j - i !== 60) continue; // contiguous
      windows++;
      const d = Math.hypot(h[j].x - a.x, h[j].z - a.z);
      let path = 0; for (let k = i + 1; k <= j; k++) path += Math.hypot(h[k].x - h[k-1].x, h[k].z - h[k-1].z);
      worst = Math.min(worst, d);
      if (d < 10) bad.push(`${id}@${a.t} net=${d.toFixed(1)} path=${path.toFixed(1)} at ${a.x.toFixed(0)},${a.z.toFixed(0)}`);
    }
  }
  console.log('seed', seed, 'agents seen', hist.size, 'windows', windows, 'worst net', worst.toFixed(1), 'bad', bad.length, 'impacts', impacts);
  console.log(bad.slice(0, 25).join('\n'));
  const byPair = new Map<string, number>();
  for (const e of imp) { const k = (e.a.startsWith('veh') ? 'veh' : e.a.replace(/[0-9#]+.*/, '')) + '|' + (e.b.startsWith('veh') ? 'veh' : e.b.replace(/[0-9#]+.*/, '')); byPair.set(k, (byPair.get(k) ?? 0) + 1); }
  console.log('impact kinds', JSON.stringify([...byPair]));
  imp.sort((a, b) => b.strength - a.strength);
  console.log('top', JSON.stringify(imp.slice(0, 8)));
  const ids = new Map<string, number>(); for (const e of imp) { const k = e.a + '>' + e.b; ids.set(k, (ids.get(k) ?? 0) + 1); }
  console.log('repeat', JSON.stringify([...ids].sort((a, b) => b[1] - a[1]).slice(0, 8)));
}, 600_000);

