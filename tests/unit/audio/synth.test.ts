import { describe, it, expect } from 'vitest';
import { engineFrequency, hornFrequencies, impactGain, pinkNoise } from '@/audio/synth';
import { Rng } from '@/core/Rng';

describe('engineFrequency', () => {
  it('idles at 55 Hz when stopped with no throttle', () => {
    expect(engineFrequency(0, 0)).toBeCloseTo(55, 5);
  });

  it('rises monotonically with speed', () => {
    let prev = -Infinity;
    for (let v = 0; v <= 40; v += 2) {
      const f = engineFrequency(v, 0.3);
      expect(f).toBeGreaterThan(prev - 1e-9);
      prev = f;
    }
    expect(engineFrequency(20, 0)).toBeGreaterThan(engineFrequency(5, 0));
  });

  it('rises with throttle at a given speed', () => {
    expect(engineFrequency(10, 1)).toBeGreaterThan(engineFrequency(10, 0));
  });

  it('stays within the 55..220 Hz band', () => {
    for (const v of [0, 10, 30, 100, 1e6]) {
      for (const t of [0, 0.5, 1, 7]) {
        const f = engineFrequency(v, t);
        expect(f).toBeGreaterThanOrEqual(55);
        expect(f).toBeLessThanOrEqual(220);
      }
    }
  });

  it('treats negative and non-finite inputs as safe values', () => {
    expect(engineFrequency(-5, -1)).toBeCloseTo(55, 5);
    expect(Number.isFinite(engineFrequency(Number.NaN, Number.NaN))).toBe(true);
  });
});

describe('hornFrequencies', () => {
  it('returns two detuned tones near 400 and 500 Hz', () => {
    const [a, b] = hornFrequencies();
    expect(a).toBeGreaterThanOrEqual(380);
    expect(a).toBeLessThanOrEqual(420);
    expect(b).toBeGreaterThanOrEqual(480);
    expect(b).toBeLessThanOrEqual(520);
    expect(a).not.toBe(b);
  });
});

describe('impactGain', () => {
  it('is zero for no impact and grows with strength', () => {
    expect(impactGain(0)).toBe(0);
    expect(impactGain(3)).toBeLessThan(impactGain(8));
  });

  it('saturates at 1 from 15 m/s upward', () => {
    expect(impactGain(15)).toBeCloseTo(1, 5);
    expect(impactGain(40)).toBe(1);
  });

  it('clamps negative and NaN strength to 0', () => {
    expect(impactGain(-4)).toBe(0);
    expect(impactGain(Number.NaN)).toBe(0);
  });
});

describe('pinkNoise', () => {
  it('returns the requested length with samples in [-1, 1]', () => {
    const rng = new Rng('pink');
    const buf = pinkNoise(4096, () => rng.next());
    expect(buf.length).toBe(4096);
    for (const s of buf) {
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('is roughly zero-mean', () => {
    const rng = new Rng('mean');
    const buf = pinkNoise(20000, () => rng.next());
    const mean = buf.reduce((acc, s) => acc + s, 0) / buf.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it('is deterministic for the same random source', () => {
    const r1 = new Rng(9), r2 = new Rng(9);
    expect(Array.from(pinkNoise(256, () => r1.next()))).toEqual(Array.from(pinkNoise(256, () => r2.next())));
  });
});
