/** CARFIT: the three steering feel sets side by side (off unless CARFIT_FEEL=<file>): quick, in between (shipped), weighty. */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { FEEL } from '@/entities/handling';
import { analogStep, brakeSteer, pedalRow, steerRow } from './stuck-controls-lib';

const out = process.env.CARFIT_FEEL;
(out ? describe : describe.skip)('carfit feel sets', () => {
  it('measures', () => {
    const sets = {
      quick: { steerRate: 5.6, stickFollow: 11, brakeYawFrac: 0.8 },
      between: { steerRate: 4.5, stickFollow: 9.5, brakeYawFrac: 0.72 },
      weighty: { steerRate: 3.4, stickFollow: 8, brakeYawFrac: 0.65 },
    };
    const keep = { ...FEEL };
    const res: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(sets)) {
      Object.assign(FEEL, v);
      res[name] = {
        steer: [4, 10, 18, 28].map((s) => { const r = steerRow('sedan', s); return { v0: s, half: r.halfSteerS, full: r.fullSteerS, ret: r.returnS, yaw: r.yawSteady, radius: r.radius }; }),
        stick90: analogStep('sedan', 12),
        brake: Object.fromEntries((['sedan', 'suv', 'pickup', 'hothatch'] as const).map((t) => { const b = brakeSteer(t, 1); return [t, { deg: b.headingDeg, peakYaw: b.peakYaw4, slip: b.peakSlip4 }]; })),
        handbrake: (() => { const p = pedalRow('sedan'); return { turnDeg: p.hbTurnDeg, peakSlip: p.hbPeakSlip, recoverS: p.hbRecoverS, altYawPP: p.altYawPP }; })(),
      };
    }
    Object.assign(FEEL, keep);
    writeFileSync(out!, JSON.stringify(res, null, 1));
    expect(Object.keys(res).length).toBe(3);
  }, 600000);
});
