// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Hud, BLOCKED_HINT } from '@/ui/Hud';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { EventBus } from '@/core/Events';
import type { HudState, IMaterialLibrary } from '@/world/types';

const base: HudState = {
  stars: 0, speedKmh: 0, inVehicle: true, radioStation: '', prompt: 'F  Exit car', timeOfDay: 12, streetName: 'Throop Ave', fps: 60,
};

describe('Hud blocked hint and speed readout', () => {
  let root: HTMLElement;
  let hud: Hud;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); hud = new Hud(root); });
  const prompt = () => root.querySelector<HTMLElement>('.hud-prompt')!;
  const speed = () => root.querySelector<HTMLElement>('.hud-speed-value')!.textContent;

  it('shows "Blocked: S to reverse, Shift handbrake" once wedged for more than 1.5 s, in place of the exit prompt', () => {
    hud.update({ ...base, blockedSeconds: 1.2 });
    expect(prompt().textContent).toBe('F  Exit car');
    hud.update({ ...base, blockedSeconds: 1.6 });
    expect(prompt().hidden).toBe(false);
    expect(prompt().textContent).toBe('Blocked: S to reverse, Shift handbrake');
    expect(BLOCKED_HINT.keyboard).toBe('Blocked: S to reverse, Shift handbrake');
    hud.update({ ...base, blockedSeconds: 0 });
    expect(prompt().textContent).toBe('F  Exit car');
  });

  it('never shows the hint on foot', () => {
    hud.update({ ...base, inVehicle: false, prompt: '', blockedSeconds: 9 });
    expect(prompt().hidden).toBe(true);
  });

  it('touch and gamepad get their own wording', () => {
    hud.setInputMode('gamepad');
    hud.update({ ...base, blockedSeconds: 2 });
    expect(prompt().textContent).toBe(BLOCKED_HINT.gamepad);
  });

  it('the speedometer reads the magnitude: reversing at 8 m/s reads 29, not negative, and never jumps', () => {
    const v = new Vehicle('r', { ...VEHICLE_SPECS.sedan }, { x: 0, z: 0 }, 0, new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary, new EventBus());
    v.body.vel = { x: 0, z: 8 }; // heading 0 faces -z, so +z is reverse
    expect(v.speed).toBeLessThan(0);
    expect(v.speedKmh).toBeGreaterThan(28);
    hud.update({ ...base, speedKmh: v.speedKmh });
    expect(speed()).toBe('29');
    v.body.vel = { x: 0, z: 0.01 };
    hud.update({ ...base, speedKmh: v.speedKmh });
    expect(speed()).toBe('0');
    hud.update({ ...base, speedKmh: -29 }); // even a signed value is shown as a magnitude
    expect(speed()).toBe('29');
  });
});
