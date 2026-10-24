// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hud } from '@/ui/Hud';
import type { HudState } from '@/world/types';

const base: HudState = {
  stars: 0,
  speedKmh: 0,
  inVehicle: false,
  radioStation: 'WBED 88.9 — Brownstone Boom-Bap',
  prompt: '',
  timeOfDay: 17.5,
  streetName: 'Throop Ave',
  fps: 60,
};

function el(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

describe('Hud', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it('shows 2 filled stars for stars: 2', () => {
    const hud = new Hud(root);
    hud.update({ ...base, stars: 2 });
    expect(root.querySelectorAll('.hud-star').length).toBe(3);
    expect(root.querySelectorAll('.hud-star.on').length).toBe(2);
    expect(el(root, '.hud-stars').textContent).toBe('★★☆');
  });

  it('hides the speed readout when not in a vehicle', () => {
    const hud = new Hud(root);
    hud.update({ ...base, inVehicle: false, speedKmh: 50 });
    expect(el(root, '.hud-speed').hidden).toBe(true);
  });

  it('shows the speed in km/h when in a vehicle', () => {
    const hud = new Hud(root);
    hud.update({ ...base, inVehicle: true, speedKmh: 50.4 });
    const speed = el(root, '.hud-speed');
    expect(speed.hidden).toBe(false);
    expect(speed.textContent).toContain('50');
    expect(speed.textContent).toContain('km/h');
  });

  it('shows the radio station only in a vehicle', () => {
    const hud = new Hud(root);
    hud.update({ ...base, inVehicle: false });
    expect(el(root, '.hud-radio').hidden).toBe(true);
    hud.update({ ...base, inVehicle: true });
    expect(el(root, '.hud-radio').hidden).toBe(false);
    expect(el(root, '.hud-radio').textContent).toContain('WBED 88.9');
  });

  it('shows the street name in the location label', () => {
    const hud = new Hud(root);
    hud.update({ ...base, streetName: 'Kosciuszko St' });
    expect(el(root, '.hud-location').textContent).toContain('Kosciuszko St');
  });

  it('hides the prompt when empty and shows it otherwise', () => {
    const hud = new Hud(root);
    hud.update({ ...base, prompt: '' });
    expect(el(root, '.hud-prompt').hidden).toBe(true);
    hud.update({ ...base, prompt: 'F  Enter car' });
    expect(el(root, '.hud-prompt').hidden).toBe(false);
    expect(el(root, '.hud-prompt').textContent).toBe('F  Enter car');
  });

  it('shows a tiny FPS readout', () => {
    const hud = new Hud(root);
    hud.update({ ...base, fps: 59.6 });
    expect(el(root, '.hud-fps').textContent).toContain('60');
  });

  it('does not throw from update() when the root is not attached to the document', () => {
    const detached = document.createElement('div');
    const hud = new Hud(detached);
    expect(() => hud.update({ ...base, stars: 3, inVehicle: true, speedKmh: 12 })).not.toThrow();
    expect(() => hud.showSplash()).not.toThrow();
    expect(() => hud.hideSplash()).not.toThrow();
  });

  it('renders the splash title, subtitle, controls and start prompt', () => {
    new Hud(root);
    const splash = el(root, '.hud-splash');
    expect(splash.textContent).toContain('GTA BED-STUY');
    expect(splash.textContent).toContain('a fan tribute · not affiliated with Rockstar Games or Take-Two');
    expect(splash.textContent).toContain('WASD move');
    expect(splash.textContent).toContain('Shift run');
    expect(splash.textContent).toContain('F enter/exit car');
    expect(splash.textContent).toContain('Space brake');
    expect(splash.textContent).toContain('H horn');
    expect(splash.textContent).toContain('E radio');
    expect(splash.textContent).toContain('mouse look');
    expect(splash.textContent).toContain('click or tap to start');
  });

  it('hides the splash 400 ms after hideSplash()', () => {
    vi.useFakeTimers();
    const hud = new Hud(root);
    const splash = el(root, '.hud-splash');
    hud.hideSplash();
    expect(splash.style.display).not.toBe('none');
    vi.advanceTimersByTime(399);
    expect(splash.style.display).not.toBe('none');
    vi.advanceTimersByTime(1);
    expect(splash.style.display).toBe('none');
  });

  it('showSplash() brings the splash back after it was hidden', () => {
    vi.useFakeTimers();
    const hud = new Hud(root);
    const splash = el(root, '.hud-splash');
    hud.hideSplash();
    vi.advanceTimersByTime(400);
    expect(splash.style.display).toBe('none');
    hud.showSplash();
    expect(splash.style.display).not.toBe('none');
  });
});
