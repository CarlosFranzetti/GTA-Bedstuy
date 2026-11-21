import { it } from 'vitest';
import { Sim, input, makeVehicle, slipAngleDeg } from '../sim/harness';
it('dbg', () => {
  const v = makeVehicle('sedan', 0, 0, 0); v.driver = 'player'; v.body.vel = { x: 0, z: -60 / 3.6 };
  const sim = new Sim(); sim.add(v);
  v.setInput(input({ steer: 0.5, handbrake: true }));
  let mx = 0; const rows: string[] = [];
  sim.run(0.5, (t) => { mx = Math.max(mx, slipAngleDeg(v)); rows.push(`${t.toFixed(2)} sp=${v.speed.toFixed(1)} lat=${v.lateralSpeed.toFixed(2)} yaw=${v.yawRateRad.toFixed(2)} s=${slipAngleDeg(v).toFixed(1)} rc=${v.handling.rearCap.toFixed(2)} dl=${(v.handling.delta*57.3).toFixed(1)}`); });
  console.log(mx, '\n' + rows.filter((_, i) => i % 3 == 0).join('\n'));
});
