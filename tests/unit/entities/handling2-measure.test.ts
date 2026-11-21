import { it } from 'vitest';
import { Vehicle } from '@/entities/Vehicle';
import type { VehicleType } from '@/world/types';
import { DT, input, make, radius, stop } from './handlingMeasure';
import { writeFileSync } from 'node:fs';
import { Sim, makeVehicle, slipAngleDeg } from '../sim/harness';

const DEG = 180 / Math.PI;
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function turn2s(type: VehicleType, kmh: number, secs = 2) {
  const v = make(type, kmh / 3.6); let tot = 0, prev = v.body.heading, minSp = 99;
  for (let i = 0; i < secs * 60; i++) {
    const sp = Math.hypot(v.body.vel.x, v.body.vel.z);
    v.setInput(input({ throttle: sp < kmh / 3.6 ? Math.min(1, 0.2 + (kmh / 3.6 - sp) * 0.5) : 0, steer: 1 }));
    v.update(DT); tot += wrap(v.body.heading - prev); prev = v.body.heading; minSp = Math.min(minSp, sp);
  }
  return Math.abs(tot) * DEG;
}
function hb(type: VehicleType, grip: number, kmh = 60, steer = 0.5, hold = 0.5) {
  const v = makeVehicle(type, 0, 0, 0); v.driver = 'player'; v.grip = grip; v.body.vel = { x: 0, z: -kmh / 3.6 };
  const sim = new Sim(); sim.add(v);
  let mx = 0;
  v.setInput(input({ steer, handbrake: true }));
  sim.run(hold, () => { mx = Math.max(mx, slipAngleDeg(v)); });
  v.setInput(input({ throttle: 0.5 }));
  let rec = -1;
  sim.run(4, (t) => { if (rec < 0 && slipAngleDeg(v) < 3) rec = t - hold; });
  return { mx, rec };
}
it('table', () => {
  const rows: string[] = [];
  for (const mode of [false, true]) {
    Vehicle.playerHandling = mode;
    for (const t of ['sedan', 'hatch', 'suv', 'cargovan', 'bus'] as VehicleType[]) {
      const r30 = radius(t, 30 / 3.6, 1, 5);
      const d = hb(t, 1), w = hb(t, 0.5);
      rows.push([mode ? 'new' : 'old', t, turn2s(t, 30).toFixed(0), turn2s(t, 50).toFixed(0), r30.radius.toFixed(1), d.mx.toFixed(0), w.mx.toFixed(0), d.rec.toFixed(2), stop(t, 20).dist.toFixed(1)].join(' | '));
    }
  }
  Vehicle.playerHandling = true;
  const out = 'mode | type | turn2s@30 | turn2s@50 | R30 | hbDry | hbWet | recov | stop72\n' + rows.join('\n');
  console.log(out);
  writeFileSync(process.env.OUT ?? '/dev/null', out);
});
