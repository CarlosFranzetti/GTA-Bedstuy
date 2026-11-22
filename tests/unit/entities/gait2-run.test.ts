/**
 * GAIT second shift: how a jog and a sprint carry the arms, the trunk and the swing knee (runStyle.ts, through the controller), on the reference rig.
 */
import { describe, it, expect } from 'vitest';
import { AnimController } from '@/entities/anim/controller';
import { PLAYER_GAIT } from '@/entities/anim/gait';
import { fullLib, makeRig } from './anim-measure';

function sample(speed: number): { armF: number; armB: number; elbMin: number; elbMax: number; lean: number; opp: number; kneeMax: number } {
  const rig = makeRig(true), c = new AnimController(rig.target, PLAYER_GAIT, fullLib());
  for (let k = 0; k < 90; k++) c.update(1 / 60, { speed });
  let armF = -9, armB = 9, elbMin = 9, elbMax = -9, lean = 0, n = 0, opp = 0, kneeMax = 0;
  for (let k = 0; k < 120; k++) {
    c.update(1 / 60, { speed });
    const a = rig.target.arms[0].rotation.x, e = rig.target.elbows[0].rotation.x, l = rig.target.legs[1].rotation.x;
    armF = Math.max(armF, a); armB = Math.min(armB, a); elbMin = Math.min(elbMin, e); elbMax = Math.max(elbMax, e);
    lean += rig.target.torso.rotation.x + rig.target.hips.rotation.x; n++; opp += a * l;
    kneeMax = Math.max(kneeMax, -rig.target.knees[0].rotation.x);
  }
  return { armF, armB, elbMin, elbMax, lean: lean / n, opp, kneeMax };
}

describe('GAIT second shift: the run', () => {
  it('a jog swings the arms from behind the hip to in front, elbows about 90 degrees, a little lean', () => {
    const r = sample(3.0);
    expect(r.armF).toBeGreaterThan(0.35); expect(r.armB).toBeLessThan(-0.35);
    expect(r.elbMin).toBeGreaterThan(1.1); expect(r.elbMax).toBeLessThan(1.95);
    expect(r.lean).toBeLessThan(-0.12); expect(r.opp).toBeGreaterThan(0); // the left arm goes forward with the RIGHT thigh
  });
  it('a sprint drives the arms harder, leans the whole body 10 to 15 degrees more and folds the swing knee', () => {
    const r = sample(6.5);
    expect(r.armF).toBeGreaterThan(0.6); expect(r.armB).toBeLessThan(-0.55);
    expect(r.elbMin).toBeGreaterThan(1.1); expect(r.elbMax).toBeLessThan(2.1);
    expect(r.lean).toBeLessThan(-0.3);
    expect(r.kneeMax).toBeGreaterThan(1.5);
  });
  it('the style is off when the person is standing or walking', () => {
    const rig = makeRig(true), c = new AnimController(rig.target, PLAYER_GAIT, fullLib());
    for (let k = 0; k < 120; k++) c.update(1 / 60, { speed: 1.2 });
    let armMax = 0; for (let k = 0; k < 60; k++) { c.update(1 / 60, { speed: 1.2 }); armMax = Math.max(armMax, rig.target.arms[0].rotation.x); }
    expect(armMax).toBeLessThan(0.55);
  });
});
