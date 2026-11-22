import { describe, it, beforeAll } from 'vitest';
import { loadShapes, buildPerson, runFrames, stances } from './gait3-rig';
beforeAll(async () => { await loadShapes(); });
describe('gait3 probe', () => {
  it('heel glide', () => {
    const p = buildPerson('ba-hoodie-fade'), fr = runFrames(p, () => 1.4, 8);
    for (const s of stances(fr, (q) => q.meshHeel).filter((q) => q.i0 > 90).slice(0, 5)) {
      const row: string[] = [];
      for (let i = s.i0 - 3; i <= s.i1 + 3; i += 2) { const f = fr[i].pts, sd = s.side; row.push(`${i}:h${(f.meshHeel[sd].y * 100).toFixed(1)}/b${(f.meshBall[sd].y * 100).toFixed(1)}/z${((f.meshHeel[sd].z - fr[i].pts.meshHeel[sd].z) * 100).toFixed(0)}`); }
      console.log('stance side', s.side, 'slide', (s.slide * 100).toFixed(1), row.join(' '));
    }
  });
});
