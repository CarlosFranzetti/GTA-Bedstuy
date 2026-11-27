/** STUCK controls report (off unless STUCK_CONTROLS=<file>): writes the measured table as JSON. */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { controlsReport } from './stuck-controls-lib';

const out = process.env.STUCK_CONTROLS;
(out ? describe : describe.skip)('stuck controls report', () => {
  it('measures', () => {
    const r = controlsReport();
    writeFileSync(out!, JSON.stringify(r, null, 1));
    expect(r.steer.length).toBeGreaterThan(0);
  }, 600000);
});
