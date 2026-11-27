/** STUCK: the numbers of the alternative feel set (off unless STUCK_ALT=<file>). Default set vs "weighty": slower key steering, softer stick, calmer braking. */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { FEEL } from '@/entities/handling';
import { analogStep, brakeSteer, steerRow } from './stuck-controls-lib';

const out = process.env.STUCK_ALT;
(out ? describe : describe.skip)('stuck alternative feel', () => {
  it('measures', () => {
    const sets = { shipped: { ...FEEL }, weighty: { steerRate: 3.4, stickFollow: 8, brakeYawFrac: 0.65 } };
    const res: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(sets)) {
      Object.assign(FEEL, v);
      res[name] = {
        steer: [4, 10, 18, 28].map((s) => { const r = steerRow('sedan', s); return { v0: s, half: r.halfSteerS, full: r.fullSteerS, ret: r.returnS, yaw: r.yawSteady }; }),
        stick90: analogStep('sedan', 12),
        brake: [0.5, 1].map((st) => brakeSteer('sedan', st).headingDeg),
        hot: brakeSteer('hothatch', 1).headingDeg,
      };
    }
    Object.assign(FEEL, sets.shipped);
    writeFileSync(out!, JSON.stringify(res, null, 1));
    expect(Object.keys(res).length).toBe(2);
  }, 300000);
});
