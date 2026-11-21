import { describe, expect, it } from 'vitest';
import { HOUR_KEYS, gradeWith, type RGB } from '@/render/lut';

const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c: RGB): number => { const l = luma(c); return Math.hypot(c[0] - l, c[1] - l, c[2] - l); };
const key = (n: string) => HOUR_KEYS.find((k) => k.name === n)!.params;

describe('ART hour-key LUT tables', () => {
  it('every key is monotone in luminance on greys and stays in [0, 1]', () => {
    for (const k of HOUR_KEYS) {
      let prev = -1;
      for (let i = 0; i <= 256; i++) {
        const v = i / 256;
        const o = gradeWith([v, v, v], k.params);
        for (const ch of o) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(1); }
        expect(luma(o), k.name).toBeGreaterThan(prev);
        prev = luma(o);
      }
    }
  });

  it('saturation is bounded: no key more than doubles the chroma of a muted colour, none leaves a grey coloured', () => {
    const muted: RGB = [0.5, 0.4, 0.35];
    for (const k of HOUR_KEYS) {
      expect(k.params.saturation).toBeGreaterThan(0.85);
      expect(k.params.saturation).toBeLessThan(1.35);
      expect(chroma(gradeWith(muted, k.params)), k.name).toBeLessThan(chroma(muted) * 2);
      const grey = gradeWith([0.5, 0.5, 0.5], k.params);
      expect(chroma(grey), k.name).toBeLessThan(0.06);
    }
  });

  it('blacks lift slightly but never crush: black stays within 0.015..0.04, no key clips white', () => {
    for (const k of HOUR_KEYS) {
      const l = luma(gradeWith([0, 0, 0], k.params));
      expect(l, k.name).toBeGreaterThan(0.015);
      expect(l, k.name).toBeLessThan(0.04);
      expect(luma(gradeWith([0.98, 0.98, 0.98], k.params)), k.name).toBeLessThanOrEqual(1);
    }
  });

  it('noon and afternoon: Stoop Light pulls saturation below neutral (was boosted 1.22+), highlights stay warm', () => {
    for (const n of ['noon', 'afternoon']) {
      const p = key(n);
      expect(p.saturation).toBeLessThanOrEqual(1.0); // DIRECTION.md: saturation down 10 to 15 percent (the old keys were 1.26)
      expect(p.saturation).toBeGreaterThanOrEqual(0.85);
      const hi = gradeWith([0.85, 0.85, 0.85], p);
      expect(hi[0], n).toBeGreaterThan(hi[2] + 0.02); // warm highlights
      const mid = gradeWith([0.3, 0.3, 0.3], p);
      expect(mid[0]).toBeGreaterThanOrEqual(mid[2] - 0.005); // mids not blue
    }
    // a gentle shoulder: some S-curve, but softer than the old 0.32 to 0.4
    expect(key('noon').curve).toBeGreaterThanOrEqual(0.2);
    expect(key('noon').curve).toBeLessThanOrEqual(0.32);
  });

  it('golden hour is amber over cool shadows; night is cool-blue shadows under sodium highlights', () => {
    for (const n of ['golden', 'dusk', 'night']) {
      const p = key(n);
      const sh = gradeWith([0.06, 0.06, 0.06], p);
      expect(sh[2], n + ' shadow').toBeGreaterThan(sh[0]);
      const hi = gradeWith([0.9, 0.9, 0.9], p);
      expect(hi[0], n + ' highlight').toBeGreaterThan(hi[2] + 0.08);
    }
  });

  it('soft chroma cap: emerald green is pulled to olive, neutral and brown surfaces and warm accents are barely touched', () => {
    const p = key('afternoon');
    const emerald = gradeWith([0.1, 0.7, 0.2], p);
    const mx = Math.max(...emerald), mn = Math.min(...emerald);
    expect((mx - mn) / mx, 'emerald lawn saturation').toBeLessThan(0.6);
    expect(emerald[0], 'olive: red lifted towards yellow').toBeGreaterThan(0.1 + 0.05);
    const brick = gradeWith([0.42, 0.2, 0.15], p);
    expect(brick[0]).toBeGreaterThan(brick[1] + 0.12);
    const taxi = gradeWith([0.9, 0.7, 0.1], p);
    expect(taxi[0]).toBeGreaterThan(taxi[2] + 0.4);
  });
});
