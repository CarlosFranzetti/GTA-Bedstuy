/**
 * Prints the numbers behind docs/swarm/tasks/PHYSICS.md. Skipped unless PHYSICS_REPORT=<output file> is set:
 *   PHYSICS_REPORT=/tmp/physics.txt npx vitest run tests/unit/physics/report.test.ts
 */
import * as nodefs from 'node:fs';
import { it } from 'vitest';
import { carCar, f1, measureHandling, wallRun } from './scenarios';
import type { VehicleType } from '@/world/types';

const out = process.env.PHYSICS_REPORT;
it.skipIf(!out)('physics report', () => {
  const o: string[] = ['## walls (sedan)'];
  for (const s of [5, 15, 30]) for (const a of [0, 30, 60]) {
    const r = wallRun('sedan', s, a);
    o.push(`${s} m/s ${a} deg: impact ${f1(r.impactSpeed)} rebound ${f1(r.reboundSpeed)} penetration ${f1(r.maxPenetration)} jitter ${f1(r.jitterCm)} cm yaw ${f1(r.yawChangeDeg)} deg damage ${f1(r.damage)}`);
  }
  o.push('## car into parked car');
  for (const [A, B, s] of [['sedan', 'bus', 10], ['bus', 'sedan', 10], ['sedan', 'boxtruck', 12], ['boxtruck', 'sedan', 12], ['sedan', 'sedan', 15]] as const) {
    const r = carCar(A, B, s);
    o.push(`${A} -> ${B} ${s}: vA ${f1(r.vA)} vB ${f1(r.vB)} mom ${f1(r.momBefore)} -> ${f1(r.momAfter)} overlap ${f1(r.residualOverlap)} peak ${f1(r.peakSpeed)} spin ${f1(r.peakSpin)} rad/s`);
  }
  o.push('## handling: type v radius stopT stopD hbSlip hbRecover smallSteerSlip slalomSlip slalomSwing liftSlip');
  const types: VehicleType[] = ['sedan', 'hatch', 'coupe911', 'exotic', 'suv', 'pickup', 'cargovan', 'boxtruck', 'bus', 'garbage', 'cop', 'muscle'];
  for (const t of types) for (const v of [10, 20, 30]) {
    const h = measureHandling(t, v);
    o.push(h ? [h.type, h.v, ...[h.radius, h.stopT, h.stopD, h.hbSlip, h.hbRecover, h.smallSteerSlip, h.slalomSlip, h.slalomSwing, h.liftSlip].map((x) => x.toFixed(1))].join(' ') : `${t} ${v} -`);
  }
  nodefs.writeFileSync(out!, o.join('\n') + '\n');
}, 180000);
