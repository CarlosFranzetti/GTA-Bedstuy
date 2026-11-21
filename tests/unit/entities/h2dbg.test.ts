import { it } from 'vitest';
import { Sim, input, makeVehicle } from '../sim/harness';
it('dbg', () => {
  const v = makeVehicle('sedan', 0, 0, 0); v.driver = 'player';
  const sim = new Sim(); sim.add(v); const rows: string[] = [];
  v.setInput(input({ throttle: 1 })); sim.run(3);
  v.setInput(input({ throttle: 1, steer: 1 }));
  sim.run(2, (t) => { if (Math.round(t*60)%10==0) rows.push(`${t.toFixed(2)} u=${v.speed.toFixed(2)} lat=${v.lateralSpeed.toFixed(2)} r=${v.yawRateRad.toFixed(2)} dl=${(v.handling.delta).toFixed(3)} sn=${v.handling.steerNorm.toFixed(2)} aF=${(v.handling.alphaF*57.3).toFixed(1)} aR=${(v.handling.alphaR*57.3).toFixed(1)} rc=${v.handling.rearCap.toFixed(2)}`); });
  console.log(rows.join('\n'));
});
