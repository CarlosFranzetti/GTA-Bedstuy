import { describe, it, expect, vi } from 'vitest';
import { GraphicsStore, GRAPHICS_KEY, GRAPHICS_KEYS, presetFor, mergeGraphics, supports, deriveGraphics, parseOverrides, BASE_FOV } from '@/ui/GraphicsSettings';
import { tierConfig } from '@/render/QualityTier';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}
const env = { devicePixelRatio: 2, cssWidth: 1280 };

describe('GraphicsSettings presets and merge', () => {
  it('every tier has a typed value for every key and a supported shadow mode', () => {
    for (const t of ['phone', 'low', 'medium', 'high'] as const) {
      const p = presetFor(t);
      expect(Object.keys(p).sort()).toEqual([...GRAPHICS_KEYS].sort());
      expect(supports(t).shadows).toContain(p.shadows);
    }
  });
  it('overrides win over the tier preset, untouched keys keep following the tier', () => {
    const m = mergeGraphics('medium', { shadows: 'off', crowd: 0.5 });
    expect(m.shadows).toBe('off');
    expect(m.crowd).toBe(0.5);
    expect(m.ao).toBe(presetFor('medium').ao);
    expect(mergeGraphics('high', { crowd: 0.5 }).shadows).toBe('high');
  });
  it('invalid override values are ignored; a shadow mode the tier cannot do falls back', () => {
    expect(mergeGraphics('low', { shadows: 'ultra' as never, fov: 'x' as never }).shadows).toBe('low');
    expect(mergeGraphics('low', { resolution: 9 }).resolution).toBe(1);
    expect(mergeGraphics('phone', { shadows: 'high' }).shadows).toBe('blob');
  });
  it('hides what a tier cannot do (no AO / SMAA / grain on phone, no AO on low)', () => {
    expect(supports('phone').keys.has('ao')).toBe(false);
    expect(supports('phone').keys.has('aa')).toBe(false);
    expect(supports('low').keys.has('ao')).toBe(false);
    expect(supports('low').keys.has('aa')).toBe(true);
    expect(supports('high').keys.has('ao')).toBe(true);
  });
});

describe('GraphicsStore persistence', () => {
  it('persists only overrides and reloads them', () => {
    const s = memStore();
    const a = new GraphicsStore(s);
    expect(a.hasOverrides).toBe(false);
    const fn = vi.fn();
    a.onChange(fn);
    expect(a.set('fov', 80)).toBe(true);
    expect(a.set('fov', 80)).toBe(false);
    a.set('shadows', 'off');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(s.data[GRAPHICS_KEY]).overrides).toEqual({ fov: 80, shadows: 'off' });
    const b = new GraphicsStore(s);
    expect(b.effective('high').fov).toBe(80);
    expect(b.effective('high').shadows).toBe('off');
    expect(b.effective('high').bloom).toBe(true);
  });
  it('reset clears overrides and notifies; corrupt or blocked storage starts from presets', () => {
    const s = memStore();
    const a = new GraphicsStore(s);
    a.set('crowd', 0.25);
    a.reset();
    expect(a.hasOverrides).toBe(false);
    expect(JSON.parse(s.data[GRAPHICS_KEY]).overrides).toEqual({});
    expect(new GraphicsStore(memStore({ [GRAPHICS_KEY]: '{nope' })).hasOverrides).toBe(false);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const c = new GraphicsStore(throwing);
    expect(() => c.set('fov', 70)).not.toThrow();
    expect(c.effective('low').fov).toBe(70);
  });
  it('parseOverrides drops unknown keys and clamps numbers to their step', () => {
    expect(parseOverrides({ overrides: { bogus: 1, crowd: 9, resolution: 0.77, aa: 'fxaa', fpsCap: 60 } })).toEqual({ crowd: 1.5, resolution: 0.75, fpsCap: 60 });
  });
});

describe('deriveGraphics', () => {
  it('the preset reproduces the tier config', () => {
    for (const t of ['phone', 'low', 'medium', 'high'] as const) {
      const d = deriveGraphics(t, presetFor(t), env);
      const c = tierConfig(t);
      expect(d.cullDistance).toBe(c.cullDistance);
      expect(d.instanceDistance).toBe(c.instanceDistance);
      expect(d.traffic).toEqual(c.traffic);
      expect(d.anisotropy).toBe(c.anisotropy);
      expect(d.normalMaps).toBe(c.normalMaps);
      expect(d.blobs).toBe(c.blobShadows);
      expect(d.fovOffset).toBe(0);
      expect(d.maxFps).toBe(0);
    }
  });
  it('resolution scale multiplies the pixel ratio; native DPR lifts the tier cap; phone ignores native', () => {
    const base = deriveGraphics('high', presetFor('high'), env).pixelRatio;
    expect(base).toBe(1.75);
    expect(deriveGraphics('high', { ...presetFor('high'), resolution: 0.5 }, env).pixelRatio).toBeCloseTo(0.875);
    expect(deriveGraphics('high', { ...presetFor('high'), nativeDpr: true }, env).pixelRatio).toBe(2);
    expect(deriveGraphics('phone', { ...presetFor('phone'), nativeDpr: true }, { devicePixelRatio: 3, cssWidth: 1280 }).pixelRatio).toBeCloseTo(720 / 1280);
  });
  it('density, range, fov and cap map to engine numbers', () => {
    const d = deriveGraphics('medium', { ...presetFor('medium'), crowd: 0.5, traffic: 1.5, drawDistance: 0.5, treeRange: 2, fov: 80, fpsCap: 30, shadows: 'blob', textures: 'low', ao: false }, env);
    expect(d.traffic.peds).toBe(20);
    expect(d.traffic.maxMoving).toBe(45);
    expect(d.traffic.parkOccupancy).toBe(0.65);
    expect(d.cullDistance).toBe(110);
    expect(d.instanceDistance).toBe(340);
    expect(d.fovOffset).toBe(80 - BASE_FOV);
    expect(d.maxFps).toBe(30);
    expect(d.shadowMap).toBeNull();
    expect(d.blobs).toBe(true);
    expect(d.anisotropy).toBe(2);
    expect(d.normalMaps).toBe(false);
    expect(d.post.ao).toBe(false);
  });
  it('shadow modes pick the map quality (phone keeps its own caster map)', () => {
    expect(deriveGraphics('high', { ...presetFor('high'), shadows: 'low' }, env).shadowMap).toBe('low');
    expect(deriveGraphics('high', { ...presetFor('high'), shadows: 'off' }, env).shadowMap).toBeNull();
    expect(deriveGraphics('phone', presetFor('phone'), env).shadowMap).toBe('phone');
  });
});

describe('GPU load estimate', () => {
  it('rises with heavier settings and stays within 0..1', async () => {
    const { gpuLoad, optionLoad, loadLabel, presetFor, mergeGraphics } = await import('@/ui/GraphicsSettings');
    const high = presetFor('high');
    const heavy = gpuLoad(high, 'high');
    expect(heavy).toBeGreaterThan(0);
    expect(heavy).toBeLessThanOrEqual(1);
    expect(gpuLoad({ ...high, shadows: 'off' }, 'high')).toBeLessThan(heavy);
    expect(gpuLoad({ ...high, resolution: 0.5 }, 'high')).toBeLessThan(heavy);
    expect(gpuLoad({ ...high, ao: false, dof: false, bloom: false }, 'high')).toBeLessThan(heavy);
    expect(gpuLoad(presetFor('phone'), 'phone')).toBeLessThan(gpuLoad(presetFor('low'), 'low') + 0.3);
    const max = mergeGraphics('high', { resolution: 1, nativeDpr: true, shadows: 'high', drawDistance: 1.5, treeRange: 2, crowd: 1.5, traffic: 1.5, textures: 'high' });
    expect(gpuLoad(max, 'high')).toBeGreaterThan(0.85);
    expect(optionLoad('shadows', { ...high, shadows: 'high' })).toBe(1);
    expect(optionLoad('shadows', { ...high, shadows: 'off' })).toBe(0);
    expect(optionLoad('fpsCap', high)).toBe(0);
    expect(loadLabel(0.1)).toBe('Light');
    expect(loadLabel(0.4)).toBe('Moderate');
    expect(loadLabel(0.7)).toBe('Heavy');
    expect(loadLabel(0.95)).toBe('Very heavy');
  });
  it('ignores settings the tier cannot honour (AO on the phone tier changes nothing)', async () => {
    const { gpuLoad, presetFor } = await import('@/ui/GraphicsSettings');
    const phone = presetFor('phone');
    expect(gpuLoad({ ...phone, ao: true, dof: true }, 'phone')).toBe(gpuLoad(phone, 'phone'));
  });
});
