/** CARENTRY: writes the sweep table to $CARENTRY_OUT (a JSON file) when set; otherwise skipped. */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { APPROACHES, TYPES, runCase } from './carentry-sweep';

const OUT = process.env.CARENTRY_OUT;
describe.skipIf(!OUT)('carentry measure', () => {
  it('writes the table', () => {
    const rows: unknown[] = [];
    for (const style of ['classic', 'modern'] as const) for (const type of TYPES) for (const approach of APPROACHES) for (const fps of [30, 60, 144]) {
      const r = runCase({ type, approach, style, fps });
      rows.push({ style, type, approach, fps, ...r.m, iEnter: r.iEnter, iDrive: r.iDrive, iExit: r.iExit, iOut: r.iOut });
    }
    writeFileSync(OUT!, JSON.stringify(rows));
  }, 900000);
});
