import { describe, it } from 'vitest';
import { CamRig, analyse } from './camfix-harness';
import { SCENARIOS } from './camfix-scenarios';

describe('camfix measure', () => {
  it('prints', () => {
    const rows: string[] = [];
    for (const s of SCENARIOS) {
      for (const fps of [60]) {
        const r = new CamRig({ fps, ...s.opts });
        s.run(r);
        const a = analyse(r.frames);
        rows.push(`${s.name.padEnd(28)} ${fps} relStep ${a.relStep.toFixed(2)}@${a.relStepAt.toFixed(2)} turn ${a.turnRate.toFixed(0)}deg/s@${a.turnRateAt.toFixed(2)} fovRate ${a.fovRate.toFixed(0)} nan ${a.nan} minY ${a.minAboveGround.toFixed(2)}@${a.minAboveGroundAt.toFixed(2)} inCar ${a.insideCar}@${a.insideCarAt.toFixed(2)} lookOff ${a.lookOff.toFixed(2)} up ${a.upStep.toFixed(1)} yawStep ${a.yawStep.toFixed(1)}`);
      }
    }
    require('fs').writeFileSync(process.env.CAMFIX_OUT ?? '/dev/null', rows.join('\n') + '\n');
  });
});
