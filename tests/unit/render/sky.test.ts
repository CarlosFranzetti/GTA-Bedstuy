import { describe, it, expect } from 'vitest';
import { skyParamsAt, horizonColorAt } from '@/render/SkyDome';

describe('skyParamsAt', () => {
  it('has a brighter exposure at noon than at midnight', () => {
    expect(skyParamsAt(12).exposure).toBeGreaterThan(skyParamsAt(0).exposure);
  });

  it('is hazier (more turbid) at dusk than at noon, and clearer at noon than at dawn', () => {
    expect(skyParamsAt(19.5).turbidity).toBeGreaterThan(skyParamsAt(12).turbidity);
    expect(skyParamsAt(6.5).turbidity).toBeGreaterThan(skyParamsAt(12).turbidity);
  });

  it('ramps exposure up from midnight to noon and back down to midnight', () => {
    let prev = skyParamsAt(0).exposure;
    for (let h = 0.5; h <= 12; h += 0.5) {
      const e = skyParamsAt(h).exposure;
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = e;
    }
    for (let h = 12.5; h <= 24; h += 0.5) {
      const e = skyParamsAt(h).exposure;
      expect(e).toBeLessThanOrEqual(prev + 1e-9);
      prev = e;
    }
  });

  it('wraps: hour 24 equals hour 0 and negatives wrap', () => {
    expect(skyParamsAt(24)).toEqual(skyParamsAt(0));
    expect(skyParamsAt(-1).turbidity).toBeCloseTo(skyParamsAt(23).turbidity, 9);
  });

  it('always returns finite, positive values', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const p = skyParamsAt(h);
      for (const v of Object.values(p)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
      expect(p.mieDirectionalG).toBeLessThan(1);
    }
  });
});

describe('horizonColorAt', () => {
  const lum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;

  it('is bright by day and dark blue at night', () => {
    const day = horizonColorAt(0.8);
    const night = horizonColorAt(-0.6);
    expect(lum(day)).toBeGreaterThan(lum(night) * 4);
    expect(night.b).toBeGreaterThan(night.r);
  });

  it('is warm at the sunset horizon', () => {
    const c = horizonColorAt(0);
    expect(c.r).toBeGreaterThan(c.b);
  });

  it('clamps out-of-range elevations', () => {
    expect(horizonColorAt(5).getHex()).toBe(horizonColorAt(1).getHex());
    expect(horizonColorAt(-5).getHex()).toBe(horizonColorAt(-0.3).getHex());
  });
});
