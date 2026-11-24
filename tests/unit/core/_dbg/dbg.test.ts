import { it } from 'vitest';
import { CamRig, analyse } from '../../entities/camfix-harness';
import { SCENARIOS } from '../../entities/camfix-scenarios';
it('dbg', () => {
  for (const s of SCENARIOS) for (const fps of [30, 60, 144]) {
    const r = new CamRig({ fps, ...s.opts, style: 'classic' });
    s.run(r);
    const a = analyse(r.frames);
    if (a.turnRate > 150 || a.relStep > 0.5) (globalThis as any).process.stderr.write(`${s.name} ${fps} turn ${a.turnRate.toFixed(0)} rel ${a.relStep.toFixed(2)} yawStep ${a.yawStep.toFixed(1)}\n`);
  }
});
