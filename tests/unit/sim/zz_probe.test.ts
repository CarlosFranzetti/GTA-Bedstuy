import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
import { driveTurns, MAX_DEV } from './realtraffic-turn-run';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
it('turns', () => {
  const out: Record<string, unknown> = {};
  for (const type of Object.keys(VEHICLE_SPECS)) {
    const r = driveTurns(type as 'sedan', 2, true);
    const bad = r.filter((t) => t.maxDev > MAX_DEV || !t.finished || t.kerb > 0);
    out[type] = { len: VEHICLE_SPECS[type as 'sedan'].length, steer: VEHICLE_SPECS[type as 'sedan'].maxSteer, total: r.length, bad: bad.length, unfinished: bad.filter((t) => !t.finished).length, dev: bad.filter((t) => t.maxDev > MAX_DEV).length };
  }
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/realtraffic2/turntypes.json', JSON.stringify(out, null, 0));
}, 900000);
