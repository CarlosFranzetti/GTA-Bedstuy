import { describe, it, beforeAll } from 'vitest';
import { loadShapes, buildPerson, footPoints, SIX } from './gait3-rig';
beforeAll(async () => { await loadShapes(); });
describe('gait3 probe', () => {
  it('prints foot geometry', () => {
    for (const id of SIX) {
      const p = buildPerson(id);
      p.ctl.update(1 / 60, { speed: 0 });
      const f = footPoints(p), gs = p.m.group.scale.y;
      console.log(id, 'groupScale', gs.toFixed(3), 'ankleY', f.ankle[0].y.toFixed(3), 'lockBallY', f.lockBall[0].y.toFixed(3), 'meshBallY', f.meshBall[0].y.toFixed(3), 'meshHeelY', f.meshHeel[0].y.toFixed(3), 'soleLocalY', p.soleY[0].toFixed(3),
        'ballL', p.ballL[0].toArray().map((x) => x.toFixed(3)).join(','), 'heelL', p.heelL[0].toArray().map((x) => x.toFixed(3)).join(','));
    }
  });
});
