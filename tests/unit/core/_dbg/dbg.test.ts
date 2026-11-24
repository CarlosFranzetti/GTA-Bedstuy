import { it } from 'vitest';
import { CamRig } from '../../entities/camfix-harness';
import { SCENARIOS } from '../../entities/camfix-scenarios';
it('dbg', () => {
  const s = SCENARIOS.find((x) => x.name === 'vault-walk-into-hood')!;
  const r = new CamRig({ fps: 144, ...s.opts, style: 'classic' });
  s.run(r);
  for (const f of r.frames) if (f.t > 2.30 && f.t < 2.42) process.stderr.write([f.t.toFixed(3), (f.yaw*57.3).toFixed(1), (f.bh*57.3).toFixed(1), f.camCut, f.view, f.mode, f.px.toFixed(2), f.pz.toFixed(2)].join(" ") + "\n");
});
