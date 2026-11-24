import { it } from 'vitest';
import { CamRig } from '../../entities/camfix-harness';
import { SCENARIOS } from '../../entities/camfix-scenarios';
it('dbg', () => {
  const s = SCENARIOS.find((x) => x.name === 'vault-walk-into-hood')!;
  const r = new CamRig({ fps: 144, ...s.opts, style: 'classic' });
  const cam = r.cam as any;
  const orig = cam.dynamicLimit.bind(cam), os = cam.staticLimit.bind(cam);
  let lastD = 0, lastS = 0;
  cam.dynamicLimit = (...a: any[]) => { lastD = orig(...a); return lastD; };
  cam.staticLimit = (...a: any[]) => { lastS = os(...a); return lastS; };
  const w = r.frameDt.bind(r);
  r.frameDt = (x: number) => { w(x); if (r.now > 2.3 && r.now < 2.4) (globalThis as any).process.stderr.write(`${r.now.toFixed(3)} dyn ${lastD.toFixed(2)} stat ${lastS.toFixed(2)} reach ${cam.reach.toFixed(2)}\n`); };
  s.run(r);
});
