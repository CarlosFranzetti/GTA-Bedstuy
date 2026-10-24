import { describe, it, expect } from 'vitest';
import { forwardFromHeading, headingFromVec, angleDiff } from '@/core/Math2';

describe('Math2 heading convention', () => {
  it('heading 0 faces north (-z)', () => {
    const f = forwardFromHeading(0); expect(f.x).toBeCloseTo(0); expect(f.z).toBeCloseTo(-1);
  });
  it('heading PI/2 faces east (+x)', () => {
    const f = forwardFromHeading(Math.PI / 2); expect(f.x).toBeCloseTo(1); expect(f.z).toBeCloseTo(0);
  });
  it('headingFromVec inverts forwardFromHeading', () => {
    for (const h of [0, 0.7, Math.PI / 2, 2.5, -1.2]) expect(angleDiff(headingFromVec(forwardFromHeading(h)), h)).toBeCloseTo(0);
  });
});
