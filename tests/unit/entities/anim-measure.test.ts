import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runAll } from './anim-measure';

// ANIM2 harness run. Prints the table and writes it to $ANIM2_OUT (default: scratch dir). Limits tighten as the lane lands its work.
describe('anim measure', () => {
  it('measures slide, float, jumps, settle, idle and cost', () => {
    const r = runAll({ ankles: process.env.ANIM2_ANKLES !== '0' });
    const out = process.env.ANIM2_OUT;
    if (out) { writeFileSync(out, JSON.stringify(r, null, 1)); }
    console.log(JSON.stringify(r, null, 1));
    expect(Number.isFinite(r['walk.slide.mean_cm'] as number)).toBe(true);
  });
});
