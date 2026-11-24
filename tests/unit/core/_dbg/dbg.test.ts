import { it } from 'vitest';
import { CamRig, analyse } from '../../entities/camfix-harness';
import { SCENARIOS } from '../../entities/camfix-scenarios';
it('dbg', () => {
  const s = SCENARIOS.find((x) => x.name === 'vault-walk-into-hood')!;
  for (const style of ['modern', 'classic'] as const) for (const fps of [60, 144]) {
    const r = new CamRig({ fps, ...s.opts, style });
    s.run(r);
    const a = analyse(r.frames);
    process.stderr.write(`${style} ${fps} turn ${a.turnRate.toFixed(0)} at ${a.turnRateAt.toFixed(2)} rel ${a.relStep.toFixed(2)}\n`);
  }
});
