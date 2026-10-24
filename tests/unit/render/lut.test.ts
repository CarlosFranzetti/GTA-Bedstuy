import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EXPOSURE_BY_PRESET, buildLut, gradeColor, presetForHour, type GradePreset, type RGB } from '@/render/lut';

const PRESETS: GradePreset[] = ['day', 'dusk', 'night'];
const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c: RGB): number => {
  const l = luma(c);
  return Math.hypot(c[0] - l, c[1] - l, c[2] - l);
};

describe('gradeColor', () => {
  it('is monotonic in luminance for greys', () => {
    for (const p of PRESETS) {
      let prev = -1;
      for (let i = 0; i <= 256; i++) {
        const v = i / 256;
        const l = luma(gradeColor([v, v, v], p));
        expect(l).toBeGreaterThan(prev);
        prev = l;
      }
    }
  });

  it('keeps every channel inside [0, 1] over the whole cube (and tolerates out-of-range input)', () => {
    for (const p of PRESETS) {
      for (let r = -0.2; r <= 1.21; r += 0.1) {
        for (let g = -0.2; g <= 1.21; g += 0.1) {
          for (let b = -0.2; b <= 1.21; b += 0.1) {
            for (const ch of gradeColor([r, g, b], p)) {
              expect(ch).toBeGreaterThanOrEqual(0);
              expect(ch).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('lifts blacks slightly (about +0.02) and keeps white near white', () => {
    const k = gradeColor([0, 0, 0], 'day');
    expect(luma(k)).toBeGreaterThan(0.015);
    expect(luma(k)).toBeLessThan(0.03);
    expect(luma(gradeColor([1, 1, 1], 'day'))).toBeGreaterThan(0.95);
  });

  it('tints shadows teal and highlights warm in daylight', () => {
    const dark = gradeColor([0.08, 0.08, 0.08], 'day');
    expect(dark[2]).toBeGreaterThan(dark[0]);
    const bright = gradeColor([0.9, 0.9, 0.9], 'day');
    expect(bright[0]).toBeGreaterThan(bright[2]);
  });

  it('saturates colours by day and desaturates (relatively) at night', () => {
    const red: RGB = [0.7, 0.25, 0.25];
    const day = chroma(gradeColor(red, 'day'));
    const night = chroma(gradeColor(red, 'night'));
    expect(day).toBeGreaterThan(chroma(red));
    expect(night).toBeLessThan(day);
    // pure red: night keeps less of it than day does
    expect(chroma(gradeColor([1, 0, 0], 'night'))).toBeLessThan(chroma(gradeColor([1, 0, 0], 'day')));
  });
});

describe('buildLut', () => {
  it('returns a 32x32x32 Data3DTexture whose texels match gradeColor', () => {
    const tex = buildLut('day');
    expect(tex).toBeInstanceOf(THREE.Data3DTexture);
    expect(tex.image.width).toBe(32);
    expect(tex.image.height).toBe(32);
    expect(tex.image.depth).toBe(32);
    const data = tex.image.data as Uint8Array;
    expect(data.length).toBe(32 * 32 * 32 * 4);
    // texel (x=31, y=0, z=0) is pure red
    const i = (31 + 0 * 32 + 0 * 32 * 32) * 4;
    const expected = gradeColor([1, 0, 0], 'day');
    expect(data[i] / 255).toBeCloseTo(expected[0], 2);
    expect(data[i + 1] / 255).toBeCloseTo(expected[1], 2);
    expect(data[i + 2] / 255).toBeCloseTo(expected[2], 2);
    expect(data[i + 3]).toBe(255);
    expect(tex.minFilter).toBe(THREE.LinearFilter);
  });
});

describe('presetForHour / exposure', () => {
  it('maps hours to presets', () => {
    expect(presetForHour(12)).toBe('day');
    expect(presetForHour(18)).toBe('dusk');
    expect(presetForHour(19.4)).toBe('dusk');
    expect(presetForHour(19.5)).toBe('night');
    expect(presetForHour(2)).toBe('night');
    expect(presetForHour(6)).toBe('dusk');
    expect(presetForHour(7)).toBe('day');
    expect(presetForHour(-6)).toBe('dusk'); // wraps to 18:00
  });

  it('has the documented exposure targets', () => {
    expect(EXPOSURE_BY_PRESET).toEqual({ day: 1.0, dusk: 1.15, night: 1.35 });
  });
});
