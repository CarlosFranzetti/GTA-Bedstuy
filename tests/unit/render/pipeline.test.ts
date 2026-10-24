import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyShadowFlags, setupShadows, updateShadowCamera } from '@/render/Shadows';
import { GRADING_SHADER } from '@/render/Pipeline';

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
    expect(high.shadow.camera.right).toBe(110);
    expect(high.shadow.camera.far).toBe(400);
    expect(high.shadow.bias).toBe(-0.0005);
    expect(high.shadow.normalBias).toBe(0.6);

    const low = new THREE.DirectionalLight();
    setupShadows(r, low, 'low');
    expect(low.shadow.mapSize.x).toBe(1024);
    expect(low.shadow.mapSize.y).toBe(1024);
    expect(low.shadow.camera.right).toBe(70);

    const med = new THREE.DirectionalLight();
    setupShadows(r, med, 'medium');
    expect(med.shadow.mapSize.x).toBe(2048);
    expect(med.shadow.camera.right).toBe(90);
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
