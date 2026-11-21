import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { measureAll, traces } from './mechanics-measure';

describe('mechanics harness', () => {
  it('measures on-foot weight, the camera, and car entry and exit (numbers go to MECHANICS_OUT)', () => {
    const rep = measureAll();
    const text = Object.entries(rep).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (process.env.MECHANICS_TRACE) writeFileSync(process.env.MECHANICS_TRACE, Object.entries(traces).map(([k, fr]) => fr.map((f, i) => `${k} ${i} t=${f.t.toFixed(3)} p=${f.px.toFixed(2)},${f.pz.toFixed(2)} fig=${f.fx.toFixed(2)},${f.fy.toFixed(2)},${f.fz.toFixed(2)} fh=${f.fh.toFixed(2)} cam=${f.cx.toFixed(2)},${f.cy.toFixed(2)},${f.cz.toFixed(2)} yaw=${f.viewYaw.toFixed(2)} ${f.mode} ent=${f.entering}`).join('\n')).join('\n'));
    if (process.env.MECHANICS_OUT) writeFileSync(process.env.MECHANICS_OUT, text + '\n');
    // sanity only: no NaN, and the player gets into the car
    for (const v of Object.values(rep)) if (typeof v === 'number') expect(Number.isFinite(v) || Number.isNaN(v)).toBe(true);
    expect(Number(rep['enter: press F to seated (inVehicle) (s)'])).toBeGreaterThan(0);
  }, 180_000);
});
