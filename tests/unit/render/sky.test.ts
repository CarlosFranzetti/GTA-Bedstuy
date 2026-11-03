import { describe, it, expect } from 'vitest';
import { skyParamsAt, horizonColorAt, cloudParamsAt } from '@/render/SkyDome';

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

describe('cloudParamsAt (ART cloud / sun / haze / dusk uniforms)', () => {
  const SUN: [number, number, number] = [1, 0.85, 0.7];
  it('keeps every uniform inside its documented bounds for all sun elevations and rain levels', () => {
    for (let e = -1; e <= 1.001; e += 0.05) {
      for (const o of [0, 0.25, 0.5, 0.75, 1]) {
        const p = cloudParamsAt(e, o, SUN);
        expect(p.cover).toBeGreaterThanOrEqual(0.25);
        expect(p.cover).toBeLessThanOrEqual(0.95);
        expect(p.density).toBeGreaterThanOrEqual(0.5);
        expect(p.density).toBeLessThanOrEqual(1);
        for (const c of [...p.lit, ...p.shade]) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(0.9); }
        expect(p.sunDisc).toBeGreaterThanOrEqual(0);
        expect(p.sunDisc).toBeLessThanOrEqual(1);
        expect(p.haze).toBeGreaterThanOrEqual(0);
        expect(p.haze).toBeLessThanOrEqual(0.9);
        expect(p.dusk).toBeGreaterThanOrEqual(0);
        expect(p.dusk).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rain thickens and darkens the cloud layer and hides the sun disc', () => {
    const dry = cloudParamsAt(0.8, 0, SUN);
    const wet = cloudParamsAt(0.8, 1, SUN);
    expect(wet.cover).toBeGreaterThan(dry.cover);
    expect(wet.density).toBeGreaterThan(dry.density);
    expect(wet.lit[1]).toBeLessThan(dry.lit[1]);
    expect(wet.sunDisc).toBeLessThan(dry.sunDisc);
  });

  it('the sun disc exists by day and not at night; the dusk ramp peaks with the sun on the horizon', () => {
    expect(cloudParamsAt(0.8, 0, SUN).sunDisc).toBeGreaterThan(0.9);
    expect(cloudParamsAt(-0.4, 0, SUN).sunDisc).toBe(0);
    expect(cloudParamsAt(0, 0, SUN).dusk).toBeGreaterThan(cloudParamsAt(0.6, 0, SUN).dusk);
    expect(cloudParamsAt(0, 0, SUN).dusk).toBeGreaterThan(cloudParamsAt(-0.6, 0, SUN).dusk);
  });

  it('clouds are bright by day, near black at night, and warm (red over blue) near the horizon sun', () => {
    const day = cloudParamsAt(0.8, 0, SUN);
    const night = cloudParamsAt(-0.6, 0, SUN);
    expect(day.lit[1]).toBeGreaterThan(night.lit[1] * 5);
    const low = cloudParamsAt(0.05, 0, SUN);
    expect(low.lit[0]).toBeGreaterThan(low.lit[2]);
  });
});
