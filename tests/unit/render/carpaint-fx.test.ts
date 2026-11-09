import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAR_PAINT_TIERS, CAR_PAINT_UNIFORMS, CAR_PAINT_COAT, setCarPaintTier, setCarPaintSky, setCarPaintWet,
} from '@/render/CarPaintFx';
import { PaletteCarPaint } from '@/entities/models/gltf/PaletteCarPaint';

const sky = (env: number, night: number) => ({
  hemiSky: new THREE.Color(0x9fc9e8), horizon: new THREE.Color(0xbcd0e0), hemiGround: new THREE.Color(0x6b5a4a), env, night,
});

describe('car paint tiers', () => {
  it('phone does nothing, low is a static gradient, medium and high sample the environment', () => {
    expect(CAR_PAINT_TIERS.phone.mode).toBe(0);
    expect(CAR_PAINT_TIERS.low.mode).toBe(1);
    expect(CAR_PAINT_TIERS.medium.mode).toBe(2);
    expect(CAR_PAINT_TIERS.high.mode).toBe(2);
    expect(CAR_PAINT_TIERS.phone.coat).toBe(0);
  });

  it('setCarPaintTier writes the shared uniforms that every paint material reads', () => {
    setCarPaintTier('medium');
    expect(CAR_PAINT_UNIFORMS.cpMode.value).toBe(2);
    setCarPaintTier('phone');
    expect(CAR_PAINT_UNIFORMS.cpMode.value).toBe(0);
    expect(CAR_PAINT_UNIFORMS.cpCoat.value).toBe(0);
    setCarPaintTier('high');
    expect(CAR_PAINT_UNIFORMS.cpRoof.value).toBe(CAR_PAINT_TIERS.high.roofGloss);
  });

  it('wetness is clamped and the street term brightens at night with lamp warmth', () => {
    setCarPaintWet(3); expect(CAR_PAINT_UNIFORMS.cpWet.value).toBe(1);
    setCarPaintWet(-1); expect(CAR_PAINT_UNIFORMS.cpWet.value).toBe(0);
    setCarPaintSky(sky(0.4, 0));
    const day = CAR_PAINT_UNIFORMS.cpStreet.value.clone();
    setCarPaintSky(sky(1.9, 1));
    const night = CAR_PAINT_UNIFORMS.cpStreet.value;
    expect(night.r).toBeGreaterThan(night.b); // warm
    expect(night.r + night.g + night.b).toBeLessThan(day.r + day.g + day.b);
    for (const c of [day, night]) expect(Number.isFinite(c.r + c.g + c.b)).toBe(true);
  });
});

describe('PaletteCarPaint clear coat shader', () => {
  const compile = () => {
    const m = new PaletteCarPaint().setCell({ col: 6, row: 1 }).setPaint('#336699');
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <lights_fragment_end>\n#include <color_fragment>\nvoid main(){}',
    };
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(shader, null);
    return { m, shader };
  };

  it('injects the coat after the lights, only for paint fragments, and shares the uniform objects', () => {
    const { shader } = compile();
    const f = shader.fragmentShader;
    expect(f.indexOf('#include <lights_fragment_end>')).toBeLessThan(f.indexOf('cpMask > 0.5'));
    expect(f).toContain('float cpMask = 0.0;');
    expect(f).toContain('cpMask = 1.0;');
    expect(f).toContain('getIBLRadiance');
    expect(shader.uniforms.cpMode).toBe(CAR_PAINT_UNIFORMS.cpMode); // same object: a tier switch needs no recompile
  });

  it('keeps one program per material class (cache key unchanged) so tier switches never recompile', () => {
    expect(new PaletteCarPaint().customProgramCacheKey()).toBe('palette-car-paint');
  });

  it('the coat is a no-op when mode is 0 and uses fresnel, roof gloss and rim terms', () => {
    expect(CAR_PAINT_COAT).toContain('cpMode > 0.5');
    expect(CAR_PAINT_COAT).toMatch(/pow\( 1\.0 - cpNV, 4\.0 \)/);
    expect(CAR_PAINT_COAT).toContain('cpGloss');
    expect(CAR_PAINT_COAT).toContain('cpRim');
  });
});
