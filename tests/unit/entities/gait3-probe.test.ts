import { describe, it, beforeAll } from 'vitest';
import { loadShapes, buildPerson, runFrames, stances, reviewerStances, SIX } from './gait3-rig';
beforeAll(async () => { await loadShapes(); });
const f = (x: number) => (x * 100).toFixed(1);
describe('gait3 probe', () => {
  for (const id of SIX) it(id, () => {
    for (const v of [1.0, 1.4, 1.9]) {
      const p = buildPerson(id), fr = runFrames(p, () => v, 8).slice(90);
      const miny = (k: 'meshBall' | 'meshHeel' | 'ankle') => Math.min(...fr.flatMap((q) => [q.pts[k][0].y, q.pts[k][1].y]));
      const rv = reviewerStances(fr), bs = stances(fr, (q) => q.meshBall), bs2 = stances(fr, (q) => q.meshBall, miny('meshBall') + 0.015);
      const rs = rv.st.map((s) => s.slide);
      console.log(`${id} v${v} scale ${p.m.group.scale.y.toFixed(3)} minBall ${f(miny('meshBall'))} minHeel ${f(miny('meshHeel'))} minAnkle ${f(miny('ankle'))} | revStances ${rs.length} meanSlide ${f(rs.reduce((a, b) => a + b, 0) / (rs.length || 1))} maxSlide ${f(Math.max(0, ...rs))} clear ${f(rv.clearance)} | ball0 n${bs.length} max ${f(Math.max(0, ...bs.map((s) => s.slide)))} | ballRel n${bs2.length} max ${f(Math.max(0, ...bs2.map((s) => s.slide)))}`);
    }
  }, 300000);
});
