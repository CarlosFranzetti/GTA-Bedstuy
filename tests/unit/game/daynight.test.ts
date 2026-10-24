import { describe, it, expect, vi } from 'vitest';
import { Color, DirectionalLight, HemisphereLight, Scene } from 'three';
import { DayNight, isNightAt, skyColorAt } from '@/game/DayNight';
import type { IMaterialLibrary } from '@/world/types';

function fakeMaterials() {
  const setNight = vi.fn();
  const materials = {
    get: vi.fn(),
    awning: vi.fn(),
    sign: vi.fn(),
    carPaint: vi.fn(),
    setNight,
  } as unknown as IMaterialLibrary;
  return { materials, setNight };
}

const brightness = (c: Color) => c.r + c.g + c.b;

describe('isNightAt', () => {
  it('is night from 19:30 until 06:00', () => {
    expect(isNightAt(23)).toBe(true);
    expect(isNightAt(0)).toBe(true);
    expect(isNightAt(5.99)).toBe(true);
    expect(isNightAt(19.5)).toBe(true);
    expect(isNightAt(12)).toBe(false);
    expect(isNightAt(6)).toBe(false);
    expect(isNightAt(19.49)).toBe(false);
  });

  it('wraps hours outside 0..24', () => {
    expect(isNightAt(25)).toBe(true);
    expect(isNightAt(-1)).toBe(true);
    expect(isNightAt(36)).toBe(false);
  });
});

describe('skyColorAt', () => {
  it('is brighter at noon than at midnight', () => {
    expect(brightness(skyColorAt(12))).toBeGreaterThan(brightness(skyColorAt(0)));
  });

  it('is deep blue at night', () => {
    const c = skyColorAt(0);
    expect(c.b).toBeGreaterThan(c.r);
    expect(c.b).toBeGreaterThan(c.g);
  });

  it('is warm (orange-pink) at dawn and dusk', () => {
    const dawn = skyColorAt(6.5);
    const dusk = skyColorAt(18);
    expect(dawn.r).toBeGreaterThan(dawn.b);
    expect(dusk.r).toBeGreaterThan(dusk.b);
  });

  it('wraps: hour 24 equals hour 0', () => {
    expect(skyColorAt(24).getHex()).toBe(skyColorAt(0).getHex());
  });
});

describe('DayNight', () => {
  it('starts at 17:30 by default and is not night', () => {
    const { materials } = fakeMaterials();
    const dn = new DayNight(new Scene(), materials);
    expect(dn.timeOfDay).toBeCloseTo(17.5, 6);
    expect(dn.isNight).toBe(false);
  });

  it('advances one game hour per real minute', () => {
    const { materials } = fakeMaterials();
    const dn = new DayNight(new Scene(), materials, { startHour: 9 });
    dn.update(60);
    expect(dn.timeOfDay).toBeCloseTo(10, 6);
    dn.update(30);
    expect(dn.timeOfDay).toBeCloseTo(10.5, 6);
  });

  it('wraps past midnight', () => {
    const { materials } = fakeMaterials();
    const dn = new DayNight(new Scene(), materials, { startHour: 23.5 });
    dn.update(60);
    expect(dn.timeOfDay).toBeCloseTo(0.5, 6);
  });

  it('honours hoursPerRealMinute', () => {
    const { materials } = fakeMaterials();
    const dn = new DayNight(new Scene(), materials, { startHour: 8, hoursPerRealMinute: 2 });
    dn.update(60);
    expect(dn.timeOfDay).toBeCloseTo(10, 6);
  });

  it('sets scene.background and scene.fog to the sky colour', () => {
    const scene = new Scene();
    const { materials } = fakeMaterials();
    const dn = new DayNight(scene, materials, { startHour: 12 });
    dn.update(0);
    const expected = skyColorAt(12).getHex();
    expect((scene.background as Color).getHex()).toBe(expected);
    expect(scene.fog).not.toBeNull();
    expect(scene.fog!.color.getHex()).toBe(expected);
  });

  it('adds a directional sun and a hemisphere light to the scene', () => {
    const scene = new Scene();
    const { materials } = fakeMaterials();
    const dn = new DayNight(scene, materials);
    expect(dn.sun).toBeInstanceOf(DirectionalLight);
    expect(dn.hemi).toBeInstanceOf(HemisphereLight);
    expect(scene.children).toContain(dn.sun);
    expect(scene.children).toContain(dn.hemi);
  });

  it('lights the sun from above at noon and below the horizon at midnight', () => {
    const { materials } = fakeMaterials();
    const noon = new DayNight(new Scene(), materials, { startHour: 12 });
    const midnight = new DayNight(new Scene(), materials, { startHour: 0 });
    expect(noon.sun.position.y).toBeGreaterThan(0);
    expect(midnight.sun.position.y).toBeLessThan(0);
    expect(noon.sun.intensity).toBeGreaterThan(midnight.sun.intensity);
  });

  it('calls materials.setNight once on construction and then only on transitions', () => {
    const { materials, setNight } = fakeMaterials();
    const dn = new DayNight(new Scene(), materials, { startHour: 17.5 });
    expect(setNight.mock.calls).toEqual([[false]]);
    // 30 s steps = 0.5 h each. 17.5 -> 19.5 is night (4 steps), 19.5 -> 30 (= 6:00) is day again (25 steps).
    for (let i = 0; i < 30; i++) dn.update(30);
    expect(setNight.mock.calls).toEqual([[false], [true], [false]]);
    expect(dn.isNight).toBe(false);
  });
});
