/**
 * GAIT second shift: what one pedestrian's animation step costs (microseconds, this shared box, best of five, 100 people at 60 Hz). Only prints; run with GAIT_COST=1.
 * Variants: all on; GAIT's run style and leg straightening off; POSE's layers off.
 */
import { describe, it } from 'vitest';
import { AnimController } from '@/entities/anim/controller';
import { makeGait } from '@/entities/anim/gait';
import { fullLib, makeRig } from './anim-measure';

function run(speed: number, far: boolean, variant: string): number {
  const lib = fullLib(), N = 100, dt = 1 / 60;
  const ctls = Array.from({ length: N }, (_, i) => { const c = new AnimController(makeRig(true).target, makeGait(i * 7 + 3, 'adult'), lib); c.cheap = far; if (variant === 'nolayers') c.bodyLayersOn = false; if (variant === 'gaitoff') { c.runStyleOn = false; c.legFixGain = 0; } return c; });
  for (const c of ctls) for (let k = 0; k < 60; k++) c.update(dt, { speed });
  let best = 1e9;
  for (let rep = 0; rep < 5; rep++) { const t0 = performance.now(); for (let f = 0; f < 120; f++) for (const c of ctls) c.update(dt, { speed }); best = Math.min(best, ((performance.now() - t0) * 1000) / (120 * N)); }
  return best;
}
describe('cost', () => {
  it.runIf(!!process.env.GAIT_COST)('table', () => {
    const rows: string[] = [];
    for (const v of ['all', 'gaitoff', 'nolayers']) for (const [n, sp, far] of [['walk 1.4', 1.4, false], ['walk 1.4 far', 1.4, true], ['stand', 0, false], ['jog 3', 3, false], ['sprint 6.5', 6.5, false]] as const) rows.push(`${v} ${n}: ${run(sp, far, v).toFixed(1)} us`);
    console.log(rows.join('\n'));
  });
});
