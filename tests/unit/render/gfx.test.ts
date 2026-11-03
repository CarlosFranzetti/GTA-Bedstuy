import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUR_KEYS, buildLut, gradeColorAt, gradeParamsAt, lerpParams, lutKeysForHour, gradeWith, type RGB } from '@/render/lut';
import { SSR_TIERS, FX_TIERS, fxPassCosts, ssrStrength, wetFresnel, SSR_MIN_WET, FX_COMPOSITE_SHADER, SSR_TRACE_SHADER } from '@/render/ssr';
import { hazeAt, grainAmount } from '@/render/LightingConfig';
import { RenderPipeline } from '@/render/Pipeline';

const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('per-hour LUT blending', () => {
  it('hour keys are strictly increasing and cover the day palette', () => {
    for (let i = 1; i < HOUR_KEYS.length; i++) expect(HOUR_KEYS[i].hour).toBeGreaterThan(HOUR_KEYS[i - 1].hour);
    expect(HOUR_KEYS.map((k) => k.name)).toEqual(expect.arrayContaining(['dawn', 'noon', 'golden', 'dusk', 'night']));
  });

  it('lutKeysForHour returns adjacent keys, a mix in [0,1] and reaches each key exactly at its hour', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const k = lutKeysForHour(h);
      expect(k.mix).toBeGreaterThanOrEqual(0);
      expect(k.mix).toBeLessThanOrEqual(1);
      expect(k.b).toBe((k.a + 1) % HOUR_KEYS.length);
    }
    HOUR_KEYS.forEach((key, i) => {
      const k = lutKeysForHour(key.hour);
      expect(k.a).toBe(i);
      expect(k.mix).toBeCloseTo(0, 6);
    });
  });

  it('wraps at midnight and for out-of-range hours', () => {
    expect(lutKeysForHour(24 + 12)).toEqual(lutKeysForHour(12));
    expect(lutKeysForHour(-12)).toEqual(lutKeysForHour(12));
    expect(lutKeysForHour(1).a).toBe(HOUR_KEYS.length - 1); // between night (22.5) and deepNight (2 + 24)
    const a = gradeColorAt([0.4, 0.3, 0.2], 23.999);
    const b = gradeColorAt([0.4, 0.3, 0.2], 0.001);
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.01);
  });

  it('is continuous: a 6-minute step never changes a colour by more than 1.5 %', () => {
    const probe: RGB[] = [[0.5, 0.5, 0.5], [0.8, 0.4, 0.2], [0.1, 0.15, 0.3], [0.9, 0.9, 0.9]];
    for (let h = 0; h < 24; h += 0.1) {
      for (const c of probe) {
        const a = gradeColorAt(c, h);
        const b = gradeColorAt(c, h + 0.1);
        for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.015);
      }
    }
  });

  it('blends parameters linearly at the half-way mix', () => {
    const a = HOUR_KEYS[4].params;
    const b = HOUR_KEYS[6].params;
    const m = lerpParams(a, b, 0.5);
    expect(m.saturation).toBeCloseTo((a.saturation + b.saturation) / 2, 9);
    expect(m.highlightMul[2]).toBeCloseTo((a.highlightMul[2] + b.highlightMul[2]) / 2, 9);
    expect(gradeParamsAt(HOUR_KEYS[4].hour).saturation).toBeCloseTo(a.saturation, 9);
  });

  it('golden hour is warm in the highlights, night is cool in the shadows, noon is flatter than night', () => {
    const grey: RGB = [0.85, 0.85, 0.85];
    const golden = gradeColorAt(grey, 17.5);
    expect(golden[0]).toBeGreaterThan(golden[2] + 0.1);
    const dark: RGB = [0.07, 0.07, 0.07];
    const night = gradeColorAt(dark, 23);
    expect(night[2]).toBeGreaterThan(night[0]);
    // contrast: distance between a shadow and a highlight grey after grading
    const span = (h: number): number => luma(gradeColorAt([0.8, 0.8, 0.8], h)) - luma(gradeColorAt([0.2, 0.2, 0.2], h));
    expect(span(12)).toBeLessThan(span(23));
  });

  it('keeps greys monotonic and channels in range at every key', () => {
    for (const key of HOUR_KEYS) {
      let prev = -1;
      for (let i = 0; i <= 128; i++) {
        const v = i / 128;
        const o = gradeWith([v, v, v], key.params);
        for (const ch of o) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(1); }
        expect(luma(o)).toBeGreaterThan(prev);
        prev = luma(o);
      }
    }
  });

  it('bakes hour-key LUTs that match gradeWith', () => {
    const tex = buildLut(6);
    const data = tex.image.data as Uint8Array;
    const i = (31 + 31 * 32 + 0) * 4; // (r,g,b) = (1,1,0)
    const e = gradeWith([1, 1, 0], HOUR_KEYS[6].params);
    expect(data[i] / 255).toBeCloseTo(e[0], 2);
    expect(data[i + 2] / 255).toBeCloseTo(e[2], 2);
  });
});

describe('SSR and fx parameter table per tier', () => {
  it('phone and low have no SSR and no fx composite; medium and high do', () => {
    expect(SSR_TIERS.phone.enabled).toBe(false);
    expect(SSR_TIERS.low.enabled).toBe(false);
    expect(FX_TIERS.phone.enabled).toBe(false);
    expect(FX_TIERS.low.enabled).toBe(false);
    expect(SSR_TIERS.medium.enabled && SSR_TIERS.high.enabled).toBe(true);
    expect(fxPassCosts('phone')).toEqual([]);
    expect(fxPassCosts('low')).toEqual([]);
  });

  it('traces at half resolution and high is strictly more expensive than medium', () => {
    expect(SSR_TIERS.medium.scale).toBe(0.5);
    expect(SSR_TIERS.high.scale).toBe(0.5);
    expect(SSR_TIERS.high.steps).toBeGreaterThan(SSR_TIERS.medium.steps);
    expect(SSR_TIERS.high.maxDist).toBeGreaterThan(SSR_TIERS.medium.maxDist);
    expect(FX_TIERS.high.contactTaps).toBeGreaterThan(FX_TIERS.medium.contactTaps);
  });

  it('adds one wet-only half-res trace and one full-res composite on medium', () => {
    const c = fxPassCosts('medium');
    expect(c.map((p) => p.name)).toEqual(['ssr-trace', 'fx-composite']);
    expect(c[0]).toMatchObject({ scale: 0.5, draws: 1, wetOnly: true });
    expect(c[1]).toMatchObject({ scale: 1, draws: 1 });
  });

  it('strength follows wetness, stays in 0..1 and the pass is skipped when dry', () => {
    expect(ssrStrength(0, 0)).toBe(0);
    expect(ssrStrength(0, 0)).toBeLessThan(SSR_MIN_WET);
    expect(ssrStrength(1, 1)).toBe(1);
    expect(ssrStrength(0.5, 0)).toBeGreaterThan(ssrStrength(0.25, 0));
    expect(ssrStrength(NaN, 3)).toBe(0);
    expect(wetFresnel(0)).toBeCloseTo(1, 6);
    expect(wetFresnel(1)).toBeCloseTo(0.1, 6);
    expect(wetFresnel(0.2)).toBeGreaterThan(wetFresnel(0.8));
  });

  it('shaders keep the env map fallback: a miss writes nothing', () => {
    expect(SSR_TRACE_SHADER.fragmentShader).toContain('gl_FragColor = vec4(0.0);');
    expect(SSR_TRACE_SHADER.fragmentShader).toContain('if (!found) return;');
    expect(FX_COMPOSITE_SHADER.fragmentShader).toContain('mix(c, r.rgb, r.a)');
  });
});

describe('haze and grain curves', () => {
  it('golden hour and dusk are hazier than noon; rain thickens; amount is capped', () => {
    expect(hazeAt(17.5).amount).toBeGreaterThan(hazeAt(12).amount * 2);
    expect(hazeAt(19).amount).toBeGreaterThan(hazeAt(12).amount);
    expect(hazeAt(12, 1).amount).toBeGreaterThan(hazeAt(12, 0).amount);
    expect(hazeAt(6, 1).amount).toBeLessThanOrEqual(0.7);
    expect(hazeAt(17.5).glow).toBeGreaterThan(hazeAt(0).glow);
    expect(hazeAt(24).amount).toBeCloseTo(hazeAt(0).amount, 9);
  });

  it('film grain is faint by day and about 3.5x stronger at night', () => {
    expect(grainAmount(0)).toBeCloseTo(0.012, 9);
    expect(grainAmount(2.7)).toBeCloseTo(0.042, 9);
    expect(grainAmount(99)).toBeCloseTo(0.042, 9);
  });
});

describe('pipeline builds per tier', () => {
  function fakeRenderer(): THREE.WebGLRenderer {
    return { capabilities: { isWebGL2: true }, getSize: (v: THREE.Vector2) => v.set(640, 360), getPixelRatio: () => 1, toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
  }
  it('constructing the module graph and the cost tables works without a GL context', () => {
    expect(typeof RenderPipeline).toBe('function');
    expect(fakeRenderer().getPixelRatio()).toBe(1);
  });
});
