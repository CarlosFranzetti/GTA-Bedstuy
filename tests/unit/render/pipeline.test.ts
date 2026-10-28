import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyShadowFlags, setupShadows, updateShadowCamera } from '@/render/Shadows';
import { DOF_SHADER, GRADING_SHADER } from '@/render/Pipeline';
import { SunFlare } from '@/render/LensFlare';

function fakeRenderer(): THREE.WebGLRenderer {
  return { shadowMap: { enabled: false, type: 0, autoUpdate: false, needsUpdate: false } } as unknown as THREE.WebGLRenderer;
}

describe('applyShadowFlags', () => {
  it('sets flags on every mesh recursively and ignores non-meshes', () => {
    const root = new THREE.Group();
    const child = new THREE.Group();
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    const light = new THREE.PointLight();
    root.add(a, child, light);
    child.add(b);
    applyShadowFlags(root, true, false);
    expect(a.castShadow).toBe(true);
    expect(a.receiveShadow).toBe(false);
    expect(b.castShadow).toBe(true);
    expect(b.receiveShadow).toBe(false);
    applyShadowFlags(root, false, true);
    expect(b.castShadow).toBe(false);
    expect(b.receiveShadow).toBe(true);
  });
});

describe('setupShadows', () => {
  it('configures map size, box and bias by quality', () => {
    const r = fakeRenderer();
    const high = new THREE.DirectionalLight();
    setupShadows(r, high, 'high');
    expect(r.shadowMap.enabled).toBe(true);
    expect(r.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(high.castShadow).toBe(true);
    expect(high.shadow.mapSize.x).toBe(4096);
    expect(high.shadow.camera.right).toBe(100);
    expect(high.shadow.camera.far).toBe(400);
    expect(high.shadow.bias).toBe(-0.00015);
    expect(high.shadow.normalBias).toBe(0.04);
    expect(high.shadow.radius).toBe(3);

    const low = new THREE.DirectionalLight();
    setupShadows(r, low, 'low');
    expect(low.shadow.mapSize.x).toBe(1024);
    expect(low.shadow.mapSize.y).toBe(1024);
    expect(low.shadow.camera.right).toBe(60);

    const med = new THREE.DirectionalLight();
    setupShadows(r, med, 'medium');
    expect(med.shadow.mapSize.x).toBe(2048);
    expect(med.shadow.camera.right).toBe(80);
    expect(med.shadow.radius).toBe(2);
  });

  it('keeps the normal bias at about one shadow texel (audit rig: no acne down to 0 at 11-17 deg sun) and far under the old 0.5 m (a 0.15 m curb must still cast)', () => {
    const r = fakeRenderer();
    for (const q of ['low', 'medium', 'high'] as const) {
      const l = new THREE.DirectionalLight();
      setupShadows(r, l, q);
      const texel = (2 * l.shadow.camera.right) / l.shadow.mapSize.x;
      expect(l.shadow.normalBias).toBeGreaterThanOrEqual(texel * 0.5);
      expect(l.shadow.normalBias).toBeLessThanOrEqual(texel * 1.2);
      expect(l.shadow.normalBias).toBeLessThan(0.15);
      expect(l.shadow.bias).toBeLessThan(0);
    }
  });
});

describe('updateShadowCamera', () => {
  function makeSun(): THREE.DirectionalLight {
    const sun = new THREE.DirectionalLight();
    sun.position.set(120, 140, 60);
    setupShadows(fakeRenderer(), sun, 'medium');
    return sun;
  }

  it('follows the target and keeps the sun direction', () => {
    const sun = makeSun();
    const dir0 = sun.position.clone().sub(sun.target.position).normalize();
    updateShadowCamera(sun, { x: 123.4, z: -57.8 });
    const dir1 = sun.position.clone().sub(sun.target.position).normalize();
    expect(dir1.distanceTo(dir0)).toBeLessThan(1e-6);
    expect(sun.position.distanceTo(sun.target.position)).toBeCloseTo(180, 5);
    expect(sun.target.position.x).toBeCloseTo(123.4, 0);
    expect(sun.target.position.z).toBeCloseTo(-57.8, 0);
    expect(sun.target.position.y).toBe(0);
    // second call (position untouched by DayNight) keeps the same direction
    updateShadowCamera(sun, { x: -40, z: 200 });
    const dir2 = sun.position.clone().sub(sun.target.position).normalize();
    expect(dir2.distanceTo(dir0)).toBeLessThan(1e-6);
  });

  it('re-derives the direction when DayNight rewrites the position (origin-relative)', () => {
    const sun = makeSun();
    updateShadowCamera(sun, { x: 300, z: 300 });
    sun.position.set(-100, 150, 20); // what DayNight does each frame
    updateShadowCamera(sun, { x: 300, z: 300 });
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    expect(dir.distanceTo(new THREE.Vector3(-100, 150, 20).normalize())).toBeLessThan(1e-6);
  });

  it('snaps the target to the texel grid (nearby targets give identical sun.target)', () => {
    const sun = makeSun();
    const texel = (2 * sun.shadow.camera.right) / sun.shadow.mapSize.x;
    updateShadowCamera(sun, { x: 10.123, z: 33.456 });
    const snapped = sun.target.position.clone();
    updateShadowCamera(sun, { x: snapped.x + 0.3 * texel, z: snapped.z - 0.3 * texel });
    expect(sun.target.position.distanceTo(snapped)).toBeLessThan(1e-6);
    // a move of several texels does change it
    updateShadowCamera(sun, { x: snapped.x + 5 * texel, z: snapped.z });
    expect(sun.target.position.distanceTo(snapped)).toBeGreaterThan(texel);
  });

  it('lifts a below-horizon (night) sun above the ground', () => {
    const sun = makeSun();
    sun.position.set(100, -150, 30);
    updateShadowCamera(sun, { x: 0, z: 0 });
    expect(sun.position.y - sun.target.position.y).toBeGreaterThan(0);
  });
});

describe('GRADING_SHADER', () => {
  it('declares the grading uniforms and uses them in the fragment shader', () => {
    for (const name of ['tDiffuse', 'time', 'contrast', 'saturation', 'vignette', 'grain', 'splitStrength', 'highlightTint', 'shadowTint']) {
      expect(GRADING_SHADER.uniforms).toHaveProperty(name);
      expect(GRADING_SHADER.fragmentShader).toContain(name);
    }
    expect(GRADING_SHADER.uniforms.contrast.value).toBeCloseTo(1.08);
    expect(GRADING_SHADER.uniforms.saturation.value).toBeCloseTo(1.12);
    expect(GRADING_SHADER.uniforms.vignette.value).toBeCloseTo(0.35);
    expect(GRADING_SHADER.uniforms.grain.value).toBeCloseTo(0.025);
  });
});

describe('GRADING_SHADER LUT support', () => {
  it('has tLut / useLut uniforms and only declares sampler3D behind USE_LUT', () => {
    expect(GRADING_SHADER.uniforms).toHaveProperty('tLut');
    expect(GRADING_SHADER.uniforms).toHaveProperty('useLut');
    expect(GRADING_SHADER.fragmentShader).toContain('tLut');
    expect(GRADING_SHADER.fragmentShader).toContain('useLut');
    const src = GRADING_SHADER.fragmentShader;
    const first = src.indexOf('sampler3D');
    expect(first).toBeGreaterThan(-1);
    expect(src.lastIndexOf('#ifdef USE_LUT', first)).toBeGreaterThan(-1);
    // the analytic fallback must exist outside the LUT block
    expect(src).toContain('mathGrade');
    expect(src).toContain('precision');
  });
});

describe('DOF_SHADER', () => {
  it('exposes focusDistance and aperture uniforms (default focus 7 m) and uses them', () => {
    expect(DOF_SHADER.uniforms).toHaveProperty('focusDistance');
    expect(DOF_SHADER.uniforms).toHaveProperty('aperture');
    expect(DOF_SHADER.uniforms).toHaveProperty('tDepth');
    expect(DOF_SHADER.uniforms.focusDistance.value).toBe(7);
    expect(DOF_SHADER.fragmentShader).toContain('focusDistance');
    expect(DOF_SHADER.fragmentShader).toContain('aperture');
    expect(DOF_SHADER.fragmentShader).toContain('precision');
    expect(DOF_SHADER.fragmentShader).toContain('DOF_TAPS 16');
    expect(DOF_SHADER.fragmentShader).not.toContain('sampler3D');
  });
});

describe('SunFlare', () => {
  it('adds itself to the scene, hides at night and shows at midday', () => {
    const scene = new THREE.Scene();
    const flare = new SunFlare(scene);
    const obj = scene.getObjectByName('SunFlare')!;
    expect(obj).toBeDefined();
    flare.update(new THREE.Vector3(0.3, 0.9, 0.2), 1);
    expect(obj.visible).toBe(true);
    expect(obj.position.length()).toBeCloseTo(900, 3);
    flare.update(new THREE.Vector3(0.3, -0.5, 0.2), 1);
    expect(obj.visible).toBe(false);
    flare.update(new THREE.Vector3(0.3, 0.9, 0.2), 0);
    expect(obj.visible).toBe(false);
    flare.dispose();
    expect(scene.getObjectByName('SunFlare')).toBeUndefined();
  });
});
