import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Weather, patchWetShader } from '@/game/Weather';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';

function fakeLibrary(): { lib: IMaterialLibrary; mats: Map<string, THREE.MeshStandardMaterial> } {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const lib = {
    get(key: MaterialKey, v = 0) {
      const id = `${key}:${v % 2}`;
      let m = mats.get(id);
      if (!m) { m = new THREE.MeshStandardMaterial({ roughness: 0.9 }); m.envMapIntensity = 0.25; mats.set(id, m); }
      return m;
    },
  } as unknown as IMaterialLibrary;
  return { lib, mats };
}

const noCanvas = (): HTMLCanvasElement => { throw new Error('no canvas'); };

function make(opts = {}) {
  const { lib, mats } = fakeLibrary();
  const scene = new THREE.Scene();
  const w = new Weather(scene, lib, { canvasFactory: noCanvas, rainStreaks: 50, rainSeconds: 10, wetSeconds: 10, dryingSeconds: 10, ...opts });
  return { w, scene, mats };
}

function run(w: Weather, seconds: number, dt = 0.1): void {
  for (let t = 0; t < seconds; t += dt) w.update(dt, new THREE.Vector3());
}

describe('Weather state machine', () => {
  it('starts dry and does nothing by itself unless autoCycle is on', () => {
    const { w } = make();
    run(w, 500);
    expect(w.state).toBe('dry');
    expect(w.wetness).toBe(0);
    expect(w.rain).toBe(0);
  });

  it('goes dry -> rain -> wet -> drying -> dry', () => {
    const { w } = make({ rainSeconds: 30, wetSeconds: 30 });
    w.setState('rain');
    expect(w.state).toBe('rain');
    run(w, 9);
    expect(w.rain).toBeGreaterThan(0.9);
    expect(w.wetness).toBeGreaterThan(0.3);
    run(w, 22); // t = 31 s
    expect(w.state).toBe('wet');
    run(w, 14); // t = 45 s: rain has faded out, the street is still soaked
    expect(w.rain).toBe(0);
    expect(w.wetness).toBe(1);
    run(w, 17); // t = 62 s: the 30 s wet phase (from t = 30 s) is over
    expect(w.state).toBe('drying');
    run(w, 5);
    expect(w.wetness).toBeLessThan(0.7);
    run(w, 10);
    expect(w.state).toBe('dry');
    expect(w.wetness).toBe(0);
  });

  it('debug setter: dry clears, rain snap soaks, wet = soaked with no rain, drying from dry starts soaked', () => {
    const { w } = make();
    w.setState('rain', true);
    expect(w.wetness).toBe(1);
    expect(w.rain).toBe(1);
    w.setState('wet');
    expect(w.rain).toBe(0);
    expect(w.wetness).toBe(1);
    w.setState('dry');
    expect(w.wetness).toBe(0);
    expect(w.overcast).toBe(0);
    w.setState('drying');
    expect(w.wetness).toBe(1);
  });

  it('autoCycle starts rain after the dry gap', () => {
    const { w } = make({ autoCycle: true, dryGapSeconds: 5 });
    run(w, 4);
    expect(w.state).toBe('dry');
    run(w, 2);
    expect(w.state).toBe('rain');
  });

  it('tolerates bad dt values', () => {
    const { w } = make();
    w.setState('rain');
    for (const dt of [NaN, -1, Infinity, 0]) w.update(dt);
    expect(Number.isFinite(w.wetness)).toBe(true);
    expect(Number.isFinite(w.rain)).toBe(true);
  });
});

describe('Weather side effects', () => {
  it('patches the shared ground materials (and only once per material)', () => {
    const { mats } = make();
    expect(mats.size).toBeGreaterThan(5);
    for (const m of mats.values()) expect(m.onBeforeCompile.toString()).not.toBe(new THREE.MeshStandardMaterial().onBeforeCompile.toString());
  });

  it('raises envMapIntensity of materials that own an envMap as the ground gets wet, and restores it', () => {
    const { w, mats } = make();
    const asphalt = mats.get('asphalt:0')!;
    asphalt.envMap = new THREE.Texture();
    w.setState('wet');
    expect(asphalt.envMapIntensity).toBeCloseTo(1.0);
    w.setState('dry');
    expect(asphalt.envMapIntensity).toBeCloseTo(0.25);
  });

  it('drives DayNight overcast during rain, and shows the rain streaks only while it rains', () => {
    const { w, scene } = make();
    const dn = { overcast: 0, timeOfDay: 12, sunDirection: new THREE.Vector3(0, 1, 0), update() {} };
    w.attach({ dayNight: dn });
    const rain = scene.getObjectByName('rain')!;
    expect(rain.visible).toBe(false);
    w.setState('rain');
    run(w, 5);
    expect(rain.visible).toBe(true);
    expect(dn.overcast).toBeGreaterThan(0.2);
    w.setState('dry');
    run(w, 0.5);
    expect(rain.visible).toBe(false);
    expect(dn.overcast).toBe(0);
  });

  it('rainStreaks 0 builds no streak mesh', () => {
    const { scene } = make({ rainStreaks: 0 });
    expect(scene.getObjectByName('rain')).toBeUndefined();
  });
});

describe('patchWetShader', () => {
  it('injects the wet layer into the real MeshStandardMaterial shaders and registers the uniforms', () => {
    const std = THREE.ShaderLib.standard;
    const shader = { vertexShader: std.vertexShader, fragmentShader: std.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    const u = { uWet: { value: 0 } };
    expect(patchWetShader(shader, u)).toBe(true);
    expect(shader.vertexShader).toContain('vWetWorld');
    expect(shader.fragmentShader).toContain('wetPuddle');
    expect(shader.fragmentShader).toContain('nonPerturbedNormal');
    expect(shader.uniforms.uWet).toBe(u.uWet);
    // the albedo hook must run before the roughness hook (the puddle mask is computed there)
    expect(shader.fragmentShader.indexOf('wetPuddle = 0.0')).toBeLessThan(shader.fragmentShader.indexOf('roughnessFactor = mix( roughnessFactor, uWetRough'));
  });

  it('leaves a shader without the expected chunks untouched', () => {
    const shader = { vertexShader: 'void main(){}', fragmentShader: 'void main(){}', uniforms: {} };
    expect(patchWetShader(shader, {})).toBe(false);
    expect(shader.fragmentShader).toBe('void main(){}');
  });
});
