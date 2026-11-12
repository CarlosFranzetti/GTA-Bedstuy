import { describe, expect, it } from 'vitest';
import { FIST, FistCombo, inFistArc } from '@/game/combat/fists';
import { forwardFromHeading } from '@/core/Math2';

/** Run the combo for `secs`, collecting impacts with the time they landed. */
function run(c: FistCombo, secs: number, t0 = 0, dt = 1 / 120): Array<{ t: number; swing: string }> {
  const out: Array<{ t: number; swing: string }> = [];
  for (let t = 0; t < secs - 1e-9; t += dt) { const i = c.update(dt); if (i) out.push({ t: t0 + t + dt, swing: i.swing }); }
  return out;
}

describe('FistCombo timing', () => {
  it('a jab takes 0.35 s and lands at 40 percent of it', () => {
    const c = new FistCombo();
    c.press();
    expect(c.swing).toBe('L');
    const hits = run(c, 0.5);
    expect(hits).toHaveLength(1);
    expect(hits[0].t).toBeCloseTo(0.35 * FIST.impactAt, 1);
    expect(c.swing).toBeNull();
  });

  it('alternates left and right', () => {
    const c = new FistCombo();
    c.press(); expect(c.swing).toBe('L'); run(c, 0.4);
    c.press(); expect(c.swing).toBe('R'); run(c, 0.4);
  });

  it('the third press inside the window is the heavy hit, which is slower', () => {
    const c = new FistCombo();
    c.press(); run(c, 0.36);
    c.press(); expect(c.swing).toBe('R'); run(c, 0.36);
    c.press(); expect(c.swing).toBe('H');
    const hits = run(c, 0.6);
    expect(hits[0].swing).toBe('H');
    expect(hits[0].t).toBeCloseTo(FIST.heavySwing * FIST.impactAt, 1);
    expect(c.duration).toBe(FIST.swing); // idle again: back to the jab duration
  });

  it('waiting past the window starts the chain over', () => {
    const c = new FistCombo();
    c.press(); run(c, 0.36);
    c.press(); run(c, 0.36);
    run(c, FIST.comboWindow + 0.2);
    c.press();
    expect(c.swing).toBe('L'); // the hands keep alternating, but the chain restarted: this would have been the heavy one
    run(c, 0.4);
    c.press();
    expect(c.swing).toBe('R'); // second of a fresh chain: still a jab
  });

  it('a press during a swing is queued and starts as it ends', () => {
    const c = new FistCombo();
    c.press(); run(c, 0.1);
    c.press();
    expect(c.swing).toBe('L');
    const hits = run(c, 0.7);
    expect(hits.map((h) => h.swing)).toEqual(['L', 'R']);
  });
});

describe('fist reach', () => {
  const o = { x: 0, z: 0 };
  const at = (heading: number, d: number, off = 0) => {
    const f = forwardFromHeading(heading + off);
    return { x: f.x * d, z: f.z * d };
  };
  it('hits within 1.2 m in front', () => {
    expect(inFistArc(o, 0, at(0, 1.1))).toBe(true);
    expect(inFistArc(o, 0, at(0, 1.3))).toBe(false);
  });
  it('the arc is 70 degrees wide: 30 degrees off is in, 40 is out', () => {
    expect(inFistArc(o, 1, at(1, 1.0, (30 * Math.PI) / 180))).toBe(true);
    expect(inFistArc(o, 1, at(1, 1.0, (-30 * Math.PI) / 180))).toBe(true);
    expect(inFistArc(o, 1, at(1, 1.0, (40 * Math.PI) / 180))).toBe(false);
  });
  it('someone behind is not hit, someone against the body is', () => {
    expect(inFistArc(o, 0, at(0, 1.0, Math.PI))).toBe(false);
    expect(inFistArc(o, 0, at(0, 0.3, Math.PI))).toBe(true);
  });
});
