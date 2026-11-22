/** GAIT: foot slide through every speed change at 30, 60 and 144 steps a second (bounds tighten as the work lands). Set GAIT_OUT=<file> to dump the table. */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { slideTable } from './gait-slide';

describe('foot slide through speed changes', () => {
  const all: Record<string, unknown> = {};
  for (const fps of [30, 60, 144]) {
    const t = slideTable(fps);
    all[String(fps)] = t;
    it(`at ${fps} steps a second`, () => {
      for (const [k, r] of Object.entries(t)) { expect(r.n, k).toBeGreaterThan(0); expect(r.mean, `${k} mean`).toBeLessThanOrEqual(1.5); expect(r.max, `${k} max`).toBeLessThanOrEqual(4); }
    });
  }
  it('dump', () => { if (process.env.GAIT_OUT) writeFileSync(process.env.GAIT_OUT, JSON.stringify(all, null, 1)); });
});
