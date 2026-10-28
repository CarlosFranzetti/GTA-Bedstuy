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

  it('the true sun is high at noon and below the horizon at midnight; the key light is the moon at night', () => {
    const { materials } = fakeMaterials();
    const noon = new DayNight(new Scene(), materials, { startHour: 12 });
    const midnight = new DayNight(new Scene(), materials, { startHour: 0 });
    expect(noon.sunDirection.y).toBeGreaterThan(0.8);
    expect(noon.sunDirection.y).toBeLessThan(0.9); // ~60 degree peak, not a zenith sun
    expect(midnight.sunDirection.y).toBeLessThan(0);
    expect(noon.sun.position.y).toBeGreaterThan(0);
    expect(midnight.sun.position.y).toBeGreaterThan(0); // moon, never a light from under the ground
    expect(noon.sun.intensity).toBeGreaterThan(midnight.sun.intensity * 4);
    expect(midnight.sun.intensity).toBeGreaterThan(0.2); // moonlight keeps facades readable
    expect(midnight.sun.color.b).toBeGreaterThan(midnight.sun.color.r); // cool moon
  });

  it('sun colour is warm at dawn and dusk and the sun gives no light at the horizon', () => {
    const { materials } = fakeMaterials();
    for (const h of [7, 18.5]) {
      const dn = new DayNight(new Scene(), materials, { startHour: h });
      expect(dn.sun.color.r).toBeGreaterThan(dn.sun.color.b * 1.3);
    }
    for (const h of [6, 19.5]) {
      const dn = new DayNight(new Scene(), materials, { startHour: h });
      expect(dn.sunDirection.y).toBeCloseTo(0, 1);
      expect(dn.sun.intensity).toBeLessThan(0.05); // sun and moon both off: no pop at the hand-over
    }
  });

  it('sun intensity rises towards noon and the dusk shadow fill is cool', () => {
    const { materials } = fakeMaterials();
    const at = (h: number) => new DayNight(new Scene(), materials, { startHour: h });
    expect(at(12).sun.intensity).toBeGreaterThan(at(17).sun.intensity);
    expect(at(17).sun.intensity).toBeGreaterThan(at(18.8).sun.intensity);
    const dusk = at(18.5).hemi.color;
    expect(dusk.b).toBeGreaterThan(dusk.r);
  });

  it('key light direction and intensity are continuous across the whole day (no pops)', () => {
    const { materials } = fakeMaterials();
    const dn = new DayNight(new Scene(), materials, { startHour: 0 });
    let prevI = -1;
    const prevPos = dn.sun.position.clone();
    for (let h = 0; h <= 24.001; h += 0.05) {
      dn.timeOfDay = h % 24;
      dn.update(0);
      if (prevI >= 0) {
        expect(Math.abs(dn.sun.intensity - prevI)).toBeLessThan(0.25);
        // direction may re-aim (sun -> moon) only while the light is essentially off
        if (dn.sun.position.distanceTo(prevPos) > 60) expect(Math.max(dn.sun.intensity, prevI)).toBeLessThan(0.3);
      }
      prevI = dn.sun.intensity;
      prevPos.copy(dn.sun.position);
    }
  });

  it('fog distances follow the time cycle (closer and hazier at dusk than at noon)', () => {
    const scene = new Scene();
    const { materials } = fakeMaterials();
    const dn = new DayNight(scene, materials, { startHour: 12 });
    const noonFar = (scene.fog as { far: number }).far;
    dn.timeOfDay = 19;
    dn.update(0);
    expect((scene.fog as { far: number }).far).toBeLessThan(noonFar);
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
