import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TIME_CYCLE, newTimeCycle, timeCycleAt } from '@/render/LightingConfig';
import { SkyDome } from '@/render/SkyDome';
import { SunFlare } from '@/render/LensFlare';
import { sunDirectionAt, moonDirectionAt } from '@/game/DayNight';

describe('time cycle', () => {
  it('wraps at 24 and every key is finite', () => {
    expect(timeCycleAt(24).moonI).toBeCloseTo(timeCycleAt(0).moonI, 9);
    expect(timeCycleAt(-1).hemiI).toBeCloseTo(timeCycleAt(23).hemiI, 9);
    for (const k of TIME_CYCLE) {
      for (const v of Object.values(k)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
    expect(TIME_CYCLE[0].hour).toBe(0);
    expect(TIME_CYCLE[TIME_CYCLE.length - 1].hour).toBe(24);
  });

  it('has no hard steps: every value changes by a bounded amount per 3 game minutes', () => {
    const a = newTimeCycle();
    const b = newTimeCycle();
    let prev = { ...timeCycleAt(0, a), sunColor: a.sunColor.clone(), hemiSky: a.hemiSky.clone() };
    for (let h = 0.05; h <= 24; h += 0.05) {
      const cur = timeCycleAt(h, b);
      expect(Math.abs(cur.sunI - prev.sunI)).toBeLessThan(0.4);
      expect(Math.abs(cur.moonI - prev.moonI)).toBeLessThan(0.7);
      expect(Math.abs(cur.hemiI - prev.hemiI)).toBeLessThan(0.5);
      expect(Math.abs(cur.exposure - prev.exposure)).toBeLessThan(0.05);
      expect(Math.abs(cur.bloomThreshold - prev.bloomThreshold)).toBeLessThan(0.3);
      expect(Math.abs(cur.env - prev.env)).toBeLessThan(0.3);
      prev = { ...cur, sunColor: cur.sunColor.clone(), hemiSky: cur.hemiSky.clone() };
    }
  });

  it('sun is off at sunrise/sunset and the moon only shines at night', () => {
    expect(timeCycleAt(6).sunI).toBe(0);
    expect(timeCycleAt(19.5).sunI).toBe(0);
    for (const h of [7, 9, 12, 15, 18]) {
      expect(timeCycleAt(h).moonI).toBe(0);
      expect(timeCycleAt(h).sunI).toBeGreaterThan(0.5);
    }
    for (const h of [20, 22, 0, 3]) expect(timeCycleAt(h).moonI).toBeGreaterThan(1);
  });

  it('bloom threshold stays above sky radiance by day and drops only at night (no dusk haze)', () => {
    expect(timeCycleAt(12).bloomThreshold).toBeGreaterThanOrEqual(2);
    expect(timeCycleAt(12).bloomStrength).toBeLessThanOrEqual(0.15);
    expect(timeCycleAt(18).bloomThreshold).toBeGreaterThan(timeCycleAt(21).bloomThreshold);
    expect(timeCycleAt(21).bloomStrength).toBeLessThanOrEqual(0.6);
  });

  it('exposure stays in a sane band (no 1.35x night over-exposure)', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const e = timeCycleAt(h).exposure;
      expect(e).toBeGreaterThan(0.9);
      expect(e).toBeLessThan(1.25);
    }
  });

  it('dusk and dawn fill is cool (blue >= red) while the sun is warm', () => {
    for (const h of [18, 19, 19.5]) {
      const tc = timeCycleAt(h);
      expect(tc.hemiSky.b).toBeGreaterThan(tc.hemiSky.r);
    }
    for (const h of [7, 18, 19]) {
      const tc = timeCycleAt(h);
      expect(tc.sunColor.r).toBeGreaterThan(tc.sunColor.b);
    }
  });
});

describe('sun and moon path', () => {
  it('peaks near 60 degrees, is on the horizon at 06:00 and 19:30 and below it at night', () => {
    const peak = Math.max(...Array.from({ length: 48 }, (_, i) => sunDirectionAt(6 + i * 0.25).y));
    expect(Math.asin(peak) * (180 / Math.PI)).toBeGreaterThan(55);
    expect(Math.asin(peak) * (180 / Math.PI)).toBeLessThan(62);
    expect(sunDirectionAt(6).y).toBeCloseTo(0, 3);
    expect(sunDirectionAt(19.5).y).toBeCloseTo(0, 3);
    for (const h of [20, 22, 0, 3, 5]) expect(sunDirectionAt(h).y).toBeLessThan(0);
  });

  it('is a unit vector and the moon sits opposite the sun azimuth, above the horizon, <= 40 degrees', () => {
    for (let h = 20; h < 29; h += 0.5) {
      const s = sunDirectionAt(h % 24);
      const m = moonDirectionAt(h % 24);
      expect(s.length()).toBeCloseTo(1, 6);
      expect(m.length()).toBeCloseTo(1, 6);
      expect(m.y).toBeGreaterThan(0.2);
      expect(Math.asin(m.y) * (180 / Math.PI)).toBeLessThan(41);
      expect(m.x * s.x + m.z * s.z).toBeLessThan(0); // opposite side of the sky
    }
  });
});

describe('SkyDome sun source', () => {
  function fakeRenderer(): THREE.WebGLRenderer {
    return {} as unknown as THREE.WebGLRenderer; // PMREM capture fails and is caught (warn), which is fine here
  }

  it('uses the true sun direction handed over by DayNight, not the (lifted/mirrored) argument, and drives environmentIntensity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = new THREE.Scene();
    const dome = new SkyDome(scene, fakeRenderer(), { setNight: () => {} } as never);
    dome.setSunDirection(new THREE.Vector3(0.2, -0.8, 0.1));
    // main.ts used to pass the shadow-lifted light position: well above the horizon at night.
    dome.update(0, new THREE.Vector3(0.2, 0.9, 0.1), true);
    const u = (dome.sky.material as THREE.ShaderMaterial).uniforms;
    expect((u.sunPosition.value as THREE.Vector3).y).toBeLessThan(0);
    expect(dome.stars.visible).toBe(true);
    expect(scene.environmentIntensity).toBeCloseTo(timeCycleAt(0).env, 6);
    dome.update(12, new THREE.Vector3(0, 1, 0), false);
    expect(scene.environmentIntensity).toBeCloseTo(timeCycleAt(12).env, 6);
    warn.mockRestore();
  });

  it('caps the dome radiance so the dusk sun lobe cannot bloom into the street', () => {
    const dome = new SkyDome(new THREE.Scene(), fakeRenderer(), { setNight: () => {} } as never);
    const frag = (dome.sky.material as THREE.ShaderMaterial).fragmentShader;
    expect(frag).toContain('SKY_MAX_RADIANCE');
    expect(frag).toContain('min( texColor');
  });
});

describe('SunFlare vs override-material passes', () => {
  it('draws nothing while the scene has an override material (GTAO normal/depth pass), so the flare never lands in the G-buffer', () => {
    const scene = new THREE.Scene();
    const flare = new SunFlare(scene);
    flare.update(new THREE.Vector3(0.3, 0.9, 0.2), 1);
    const lens = scene.getObjectByName('SunFlare')!.children[0] as THREE.Object3D;
    const boom = new Proxy({}, { get: () => { throw new Error('renderer must not be touched'); } }) as unknown as THREE.WebGLRenderer;
    scene.overrideMaterial = new THREE.MeshNormalMaterial();
    const camera = new THREE.PerspectiveCamera();
    expect(() => lens.onBeforeRender(boom, scene, camera, new THREE.BufferGeometry(), new THREE.Material(), {} as never)).not.toThrow();
    scene.overrideMaterial = null;
    expect(() => lens.onBeforeRender(boom, scene, camera, new THREE.BufferGeometry(), new THREE.Material(), {} as never)).toThrow(/renderer must not be touched/);
    flare.dispose();
  });
});
