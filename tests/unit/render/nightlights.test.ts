import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NightLights } from '@/render/NightLights';

/** 30 lamps, 20 m apart along +x at z = 0. */
const lamps = Array.from({ length: 30 }, (_, i) => ({ pos: { x: i * 20, z: 0 }, height: 7.75 }));

function make(poolSize = 4) {
  const scene = new THREE.Scene();
  const nl = new NightLights(scene, lamps, { poolSize });
  return { scene, nl };
}

/** Run enough steps for fades and hand-overs to settle. */
function settle(nl: NightLights, x: number, night: boolean, steps = 6) {
  for (let i = 0; i < steps; i++) nl.update({ x, z: 5 }, night, 0.5);
}

const litX = (nl: NightLights) =>
  nl.lights.filter((l) => l.intensity > 0).map((l) => Math.round(l.position.x)).sort((a, b) => a - b);

describe('NightLights pool', () => {
  it('adds a fixed set of lights to the scene', () => {
    const { scene, nl } = make(4);
    expect(nl.lights).toHaveLength(4);
    expect(scene.children.filter((c) => (c as THREE.PointLight).isPointLight)).toHaveLength(4);
    expect(scene.children.filter((c) => (c as THREE.SpotLight).isSpotLight)).toHaveLength(2);
  });

  it('lights the 4 nearest lamps and reassigns after moving 100 m', () => {
    const { nl } = make(4);
    settle(nl, 200, true);
    // player at x=200 (lamp 10); nearest four: 200, 180, 220, then 160 or 240 (tie -> lower index)
    const first = litX(nl);
    expect(first).toHaveLength(4);
    expect(first).toEqual([160, 180, 200, 220]);

    settle(nl, 300, true);
    const second = litX(nl);
    expect(second).toHaveLength(4);
    expect(second).toEqual([260, 280, 300, 320]);
    expect(nl.litLampIndices()).toEqual([13, 14, 15, 16]);
  });

  it('places lights at lamp-head height with the configured range, decay 2, no shadows', () => {
    const scene = new THREE.Scene();
    const nl = new NightLights(scene, lamps, { poolSize: 4, range: 30 });
    settle(nl, 0, true);
    for (const l of nl.lights) {
      expect(l.distance).toBe(30);
      expect(l.decay).toBe(2);
      expect(l.castShadow).toBe(false);
      if (l.intensity > 0) {
        expect(l.position.y).toBeGreaterThan(6);
        expect(l.position.y).toBeLessThan(8);
      }
    }
  });

  it('is off (intensity 0) by day', () => {
    const { nl } = make(4);
    settle(nl, 200, false);
    expect(nl.lights.every((l) => l.intensity === 0)).toBe(true);
  });

  it('fades in over ~0.5 s and out when day returns', () => {
    const { nl } = make(4);
    nl.update({ x: 200, z: 0 }, true, 0.25);
    nl.update({ x: 200, z: 0 }, true, 0.25);
    const mid = Math.max(...nl.lights.map((l) => l.intensity));
    expect(mid).toBeGreaterThan(0);
    nl.update({ x: 200, z: 0 }, true, 0.5);
    const full = Math.max(...nl.lights.map((l) => l.intensity));
    expect(full).toBeGreaterThan(mid);
    nl.update({ x: 200, z: 0 }, false, 0.25);
    const dimmer = Math.max(...nl.lights.map((l) => l.intensity));
    expect(dimmer).toBeLessThan(full);
    nl.update({ x: 200, z: 0 }, false, 0.5);
    expect(nl.lights.every((l) => l.intensity === 0)).toBe(true);
  });

  it('does not flip lamps when the player jitters around a tie point', () => {
    const { nl } = make(4);
    settle(nl, 210, true);
    const before = nl.litLampIndices();
    for (let i = 0; i < 40; i++) nl.update({ x: 210 + (i % 2 ? 1.5 : -1.5), z: 0 }, true, 1 / 60);
    expect(nl.litLampIndices()).toEqual(before);
  });

  it('copes with fewer lamps than the pool', () => {
    const scene = new THREE.Scene();
    const nl = new NightLights(scene, lamps.slice(0, 2), { poolSize: 4 });
    settle(nl, 0, true);
    expect(nl.litLampIndices()).toEqual([0, 1]);
  });
});

describe('NightLights headlights', () => {
  it('parents two spotlights to the vehicle at the front corners, forward = -z', () => {
    const { nl } = make(4);
    const car = new THREE.Group();
    nl.attachHeadlights(car, 4.6);
    expect(nl.headlights).toHaveLength(2);
    for (const h of nl.headlights) {
      expect(h.parent).toBe(car);
      expect(Math.abs(h.position.x)).toBeCloseTo(0.7);
      expect(h.position.y).toBeCloseTo(0.7);
      expect(h.position.z).toBeCloseTo(-2.3);
      expect(h.angle).toBeCloseTo(0.45);
      expect(h.penumbra).toBeCloseTo(0.5);
      expect(h.distance).toBe(45);
      expect(h.target.parent).toBe(car);
      expect(h.target.position.z).toBeCloseTo(-2.3 - 20);
    }
  });

  it('lights only at night, honours setHeadlightsEnabled, and detaches back to the scene', () => {
    const { scene, nl } = make(4);
    const car = new THREE.Group();
    scene.add(car);
    nl.attachHeadlights(car);
    nl.update({ x: 0, z: 0 }, false, 1);
    expect(nl.headlights.every((h) => h.intensity === 0)).toBe(true);
    nl.update({ x: 0, z: 0 }, true, 1);
    expect(nl.headlights.every((h) => h.intensity > 0)).toBe(true);
    nl.setHeadlightsEnabled(false);
    nl.update({ x: 0, z: 0 }, true, 1);
    expect(nl.headlights.every((h) => h.intensity === 0)).toBe(true);
    nl.setHeadlightsEnabled(true);
    nl.update({ x: 0, z: 0 }, true, 1);
    expect(nl.headlights.every((h) => h.intensity > 0)).toBe(true);

    nl.attachHeadlights(null);
    expect(nl.headlights.every((h) => h.parent === scene && h.intensity === 0)).toBe(true);
    nl.update({ x: 0, z: 0 }, true, 1);
    expect(nl.headlights.every((h) => h.intensity === 0)).toBe(true);
  });
});
