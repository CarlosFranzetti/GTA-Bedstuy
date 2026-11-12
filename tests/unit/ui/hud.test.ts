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

  it('appends the now-playing track to the station name and draws talk progress', () => {
    const hud = new Hud(root);
    hud.update({ ...base, inVehicle: true, radioStation: 'Bed-Stuy Pop FM', radioTrack: 'My Song', talkProgress: 0.4 });
    expect(el(root, '.hud-radio').textContent).toContain('Bed-Stuy Pop FM');
    expect(el(root, '.hud-radio').textContent).toContain('My Song');
    expect((el(root, '.hud-radio') as HTMLElement).style.getPropertyValue('--talk')).toBe('0.400');
    hud.update({ ...base, inVehicle: true, radioStation: 'Bed-Stuy Pop FM' });
    expect((el(root, '.hud-radio') as HTMLElement).dataset.talk).toBeUndefined();
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
    expect(splash.textContent).toContain('Shift sprint');
    expect(splash.textContent).toContain('F enter/exit car');
    expect(splash.textContent).toContain('Space brake');
    expect(splash.textContent).toContain('H horn');
    expect(splash.textContent).toContain('E radio');
    expect(splash.textContent).toContain('mouse look');
    expect(splash.textContent).toContain('press start')
    expect(splash.textContent).toContain('Carlos Franzetti presents');
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
  describe('input mode glyphs', () => {
    it('defaults to the keyboard glyph F', () => {
      const hud = new Hud(root);
      hud.update({ ...base, prompt: 'F  Enter car' });
      expect(el(root, '.hud-prompt').textContent).toBe('F  Enter car');
      expect(el(root, '.hud-key').textContent).toBe('F');
    });

    it('swaps F for A when the gamepad is active, and re-renders the current prompt', () => {
      const hud = new Hud(root);
      hud.update({ ...base, prompt: 'F  Exit car' });
      hud.setInputMode('gamepad');
      expect(el(root, '.hud-prompt').textContent).toBe('A  Exit car');
      expect(el(root, '.hud-prompt').dataset.mode).toBe('gamepad');
      hud.update({ ...base, prompt: 'F  Enter car' });
      expect(el(root, '.hud-key').textContent).toBe('A');
      hud.setInputMode('keyboard');
      expect(el(root, '.hud-prompt').textContent).toBe('F  Enter car');
      hud.setInputMode('touch');
      expect(el(root, '.hud-key').textContent).toBe('CAR');
    });

    it('leaves prompts with other keys and plain prompts alone', () => {
      const hud = new Hud(root);
      hud.setInputMode('gamepad');
      hud.update({ ...base, prompt: 'E  Radio' });
      expect(el(root, '.hud-prompt').textContent).toBe('E  Radio');
      hud.update({ ...base, prompt: 'Busted' });
      expect(el(root, '.hud-prompt').textContent).toBe('Busted');
    });
  });

  describe('polish', () => {
    it('pulses the stars only when the wanted level changes', () => {
      const hud = new Hud(root);
      const stars = el(root, '.hud-stars');
      hud.update({ ...base, stars: 0 });
      expect(stars.classList.contains('pulse')).toBe(false);
      hud.update({ ...base, stars: 2 });
      expect(stars.classList.contains('pulse')).toBe(true);
      stars.classList.remove('pulse');
      hud.update({ ...base, stars: 2 });
      expect(stars.classList.contains('pulse')).toBe(false);
      hud.update({ ...base, stars: 0 });
      expect(stars.classList.contains('pulse')).toBe(true);
    });

    it('renders the speed as fixed-width digit cells', () => {
      const hud = new Hud(root);
      hud.update({ ...base, inVehicle: true, speedKmh: 107 });
      const digits = root.querySelectorAll('.hud-digit');
      expect([...digits].map((d) => d.textContent)).toEqual(['1', '0', '7']);
      hud.update({ ...base, inVehicle: true, speedKmh: 9 });
      expect(root.querySelectorAll('.hud-digit').length).toBe(1);
    });

    it('shows the Welcome to Bed-Stuy card once on first hideSplash, then fades it out', () => {
      vi.useFakeTimers();
      const hud = new Hud(root);
      const card = el(root, '.hud-card');
      expect(card.hidden).toBe(true);
      hud.hideSplash();
      expect(card.hidden).toBe(false);
      expect(card.textContent).toContain('Welcome to Bed-Stuy');
      vi.advanceTimersByTime(3700);
      expect(card.classList.contains('out')).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(card.hidden).toBe(true);
      hud.showSplash(); hud.hideSplash();
      expect(card.hidden).toBe(true);
    });

    it('showToast displays a message and removes it', () => {
      vi.useFakeTimers();
      const hud = new Hud(root);
      const toast = el(root, '.hud-toast');
      expect(toast.hidden).toBe(true);
      hud.showToast('Controller connected', 1000);
      expect(toast.hidden).toBe(false);
      expect(toast.textContent).toBe('Controller connected');
      vi.advanceTimersByTime(1400);
      expect(toast.hidden).toBe(true);
    });
  });
});

// @ts-ignore node types are not installed in this repo; vitest runs in node
import { readFileSync as readCss } from 'node:fs';
describe('H7: radio caption never sits under the prompt at 640x360', () => {
  it('small viewports keep the location block left of the centred prompt', () => {
    const css: string = readCss('src/ui/hud.css', 'utf8');
    const small = css.slice(css.indexOf('@media (max-height: 480px), (max-width: 700px)'));
    expect(small).toMatch(/\.hud-location\s*{[^}]*max-width:\s*calc\(50% - 1\d\dpx\)/);
    expect(small).toMatch(/\.hud-prompt\s*{\s*bottom:/);
  });
});
