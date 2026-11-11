import { describe, it, expect } from 'vitest';
import pipeline from '../../../src/render/Pipeline.ts?raw';
import perf from '../../../src/render/Perf.ts?raw';
import game from '../../../src/core/Game.ts?raw';
import camera from '../../../src/core/Camera.ts?raw';
import culling from '../../../src/render/Culling.ts?raw';
import traffic from '../../../src/game/TrafficSystem.ts?raw';
import { deriveGraphics, presetFor, GRAPHICS_KEYS } from '@/ui/GraphicsSettings';

/** The engine entry points the DerivedGraphics numbers are applied to (see the FOR FABLE lines of lane MENU). */
describe('graphics engine hooks exist', () => {
  it('post switches, auto drop, frame cap, fov offset, cull ranges and traffic density', () => {
    expect(pipeline).toMatch(/setPostOptions\(o: Partial<PostOptions>\)/);
    expect(perf).toMatch(/setAutoDrop\(on: boolean\)/);
    expect(game).toMatch(/maxFps = 0/);
    expect(camera).toMatch(/fovOffset = 0/);
    expect(culling).toMatch(/setMaxDist\(/);
    expect(culling).toMatch(/setRange\(/);
    expect(traffic).toMatch(/setDensity\(/);
  });
  it('every graphics setting reaches some derived engine number', () => {
    const a = deriveGraphics('high', presetFor('high'), { devicePixelRatio: 2, cssWidth: 1280 });
    const env = { devicePixelRatio: 2, cssWidth: 1280 };
    const change: Record<string, () => unknown> = {
      resolution: () => deriveGraphics('high', { ...presetFor('high'), resolution: 0.5 }, env).pixelRatio,
      nativeDpr: () => deriveGraphics('high', { ...presetFor('high'), nativeDpr: true }, { devicePixelRatio: 3, cssWidth: 1280 }).pixelRatio,
      shadows: () => deriveGraphics('high', { ...presetFor('high'), shadows: 'off' }, env).shadowMap,
      drawDistance: () => deriveGraphics('high', { ...presetFor('high'), drawDistance: 0.5 }, env).cullDistance,
      treeRange: () => deriveGraphics('high', { ...presetFor('high'), treeRange: 0.5 }, env).instanceDistance,
      crowd: () => deriveGraphics('high', { ...presetFor('high'), crowd: 0.5 }, env).traffic.peds,
      traffic: () => deriveGraphics('high', { ...presetFor('high'), traffic: 0.5 }, env).traffic.maxMoving,
      aa: () => deriveGraphics('high', { ...presetFor('high'), aa: 'off' }, env).post.aa,
      ao: () => deriveGraphics('high', { ...presetFor('high'), ao: false }, env).post.ao,
      bloom: () => deriveGraphics('high', { ...presetFor('high'), bloom: false }, env).post.bloom,
      dof: () => deriveGraphics('high', { ...presetFor('high'), dof: false }, env).post.dof,
      vignette: () => deriveGraphics('high', { ...presetFor('high'), vignette: false }, env).post.vignette,
      grain: () => deriveGraphics('high', { ...presetFor('high'), grain: false }, env).post.grain,
      textures: () => deriveGraphics('high', { ...presetFor('high'), textures: 'low' }, env).normalMaps,
      fpsCap: () => deriveGraphics('high', { ...presetFor('high'), fpsCap: 30 }, env).maxFps,
      fov: () => deriveGraphics('high', { ...presetFor('high'), fov: 80 }, env).fovOffset,
      showFps: () => deriveGraphics('high', { ...presetFor('high'), showFps: true }, env).showFps,
    };
    for (const k of GRAPHICS_KEYS) expect(change[k], `no probe for ${k}`).toBeTypeOf('function');
    // each probe differs from the preset's value for that field
    const preset = { resolution: a.pixelRatio, shadows: a.shadowMap, drawDistance: a.cullDistance, treeRange: a.instanceDistance, crowd: a.traffic.peds, traffic: a.traffic.maxMoving, aa: a.post.aa, ao: a.post.ao, bloom: a.post.bloom, dof: a.post.dof, vignette: a.post.vignette, grain: a.post.grain, textures: a.normalMaps, fpsCap: a.maxFps, fov: a.fovOffset, showFps: a.showFps } as Record<string, unknown>;
    for (const [k, v] of Object.entries(preset)) expect(change[k](), k).not.toEqual(v);
    expect(change.nativeDpr()).toBe(3);
  });
});
