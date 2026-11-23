// @ts-ignore
import { appendFileSync } from 'node:fs';
import { describe, it, beforeAll } from 'vitest';
import { loadShapes, buildPerson, runFrames } from './gait3-rig';
beforeAll(async () => { await loadShapes(); });
describe('gait3 probe', () => {
  it('trace', () => {
    const [id, t0, t1] = (process.env.P_ARGS ?? 'ba-hoodie-fade,2.4,3.4').split(',');
    const stopAt = Number(process.env.P_STOP ?? 2.5), v0 = Number(process.env.P_V ?? 1.4);
    const p = buildPerson(id), fr = runFrames(p, (t) => (process.env.P_START ? (t < 1 ? 0 : v0) : (t < stopAt ? v0 : 0)), 5, 1 / 60, (c) => { c.rampUp = 16; c.startClip = false; if (process.env.P_NOSHOT) (c as any).playOnce = () => false; });
    const L: string[] = []; let tot = [0, 0]; const rr = (n: number) => n;
    for (let i = Math.round(Number(t0) * 60); i < Math.round(Number(t1) * 60); i += 2) {
      const f = fr[i], b = f.pts.meshBall, w = f.w;
      L.push(`${(i / 60).toFixed(2)} v${f.v} ballL y${(b[0].y * 100).toFixed(1)} z${(b[0].z * 100).toFixed(0)} w${w[0].toFixed(2)} | ballR y${(b[1].y * 100).toFixed(1)} z${(b[1].z * 100).toFixed(0)} w${w[1].toFixed(2)}`);
    }
    appendFileSync(process.env.P_OUT ?? '/dev/null', L.join('\n') + '\n');
  });
});
