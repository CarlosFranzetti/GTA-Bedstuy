// CARS3: HANDLING_REPORT=<file> npx vitest run tests/unit/entities/handling-report.test.ts  writes the measured table (markdown).
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { HANDLING_OF } from '@/entities/handling';
import { launch, stop, radius, corner90, handbrakeTurn, spinRecovery } from './handlingMeasure';
import type { VehicleType } from '@/world/types';

const f = (x: number, n = 1) => (Number.isFinite(x) ? x.toFixed(n) : '-');
it.skipIf(!process.env.HANDLING_REPORT)('writes the handling report', () => {
  const rows = ['| type | class | 0-93% top (s) | stop 20 m/s (m) | lat g at 17 m/s | 90deg at 40 km/h exit km/h | roll deg | handbrake turn deg | spin settles (s) |', '|---|---|---|---|---|---|---|---|---|'];
  for (const t of Object.keys(VEHICLE_SPECS) as VehicleType[]) {
    const L = launch(t), s = stop(t, Math.min(20, VEHICLE_SPECS[t].maxSpeed)), r = radius(t, 17), c = corner90(t, 40), h = handbrakeTurn(t), sp = spinRecovery(t);
    rows.push(`| ${t} | ${HANDLING_OF[t]} | ${f(L.t93)} | ${f(s.dist)} | ${f(r.latG, 2)} | ${f(c.exitKmh, 0)} | ${f(r.rollDeg)} | ${f(h.turnedDeg, 0)} | ${f(sp.settle)} |`);
  }
  writeFileSync(process.env.HANDLING_REPORT!, rows.join('\n') + '\n');
});
