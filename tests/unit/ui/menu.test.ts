// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu, SETTINGS_KEY, type MenuCallbacks } from '@/ui/Menu';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

function cbs() {
  return {
    onPause: vi.fn(), onQuality: vi.fn(), onMasterVolume: vi.fn(), onRadioVolume: vi.fn(), onRadioLibrary: vi.fn(), onInvertLookY: vi.fn(), onReset: vi.fn(), onAuto: vi.fn(), onGraphics: vi.fn(),
  } satisfies Required<MenuCallbacks>;
}

describe('Menu', () => {
  let parent: HTMLElement;
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent); });
  afterEach(() => { parent.remove(); });

  const slider = (id: string) => parent.querySelector<HTMLInputElement>(`#${id}`)!;
  const setSlider = (id: string, v: number) => { const s = slider(id); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); };

  it('starts hidden (hidden attribute, not display hacks) and toggles with open/close + onPause', () => {
    const cb = cbs();
    const menu = new Menu(parent, cb, { storage: null });
    expect(menu.root.hidden).toBe(true);
    expect(menu.root.style.display).toBe('');
    menu.open();
    expect(menu.root.hidden).toBe(false);
    expect(menu.isOpen).toBe(true);
    expect(cb.onPause).toHaveBeenLastCalledWith(true);
    menu.close();
    expect(menu.root.hidden).toBe(true);
    expect(cb.onPause).toHaveBeenLastCalledWith(false);
    expect(cb.onPause).toHaveBeenCalledTimes(2);
  });

  it('Escape toggles the menu; Resume button closes it', () => {
    const menu = new Menu(parent, {}, { storage: null });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menu.isOpen).toBe(true);
    const resume = parent.querySelector<HTMLButtonElement>('.menu-primary')!;
    expect(resume.textContent).toBe('Resume');
    resume.click();
    expect(menu.isOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menu.isOpen).toBe(false);
  });

  it('focuses Resume on open and is a labelled modal dialog', () => {
    const menu = new Menu(parent, {}, { storage: null });
    menu.open();
    expect(document.activeElement).toBe(parent.querySelector('.menu-primary'));
    expect(menu.root.getAttribute('role')).toBe('dialog');
    expect(menu.root.getAttribute('aria-modal')).toBe('true');
    expect(menu.root.hasAttribute('data-ui-modal')).toBe(true);
  });

  it('emits callbacks and persists each setting', () => {
    const cb = cbs();
    const store = memStore();
    new Menu(parent, cb, { storage: store, initialQuality: 'medium' });
    parent.querySelector<HTMLButtonElement>('[data-quality="high"]')!.click();
    expect(cb.onQuality).toHaveBeenCalledWith('high');
    setSlider('menu-master', 40);
    expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.4);
    setSlider('menu-radio', 15);
    expect(cb.onRadioVolume).toHaveBeenLastCalledWith(0.15);
    const invert = slider('menu-invert');
    invert.checked = true; invert.dispatchEvent(new Event('change', { bubbles: true }));
    expect(cb.onInvertLookY).toHaveBeenCalledWith(true);
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ quality: 'high', auto: false, master: 0.4, radio: 0.15, invertY: true });
  });

  it('restores saved settings into the UI and pushes them to the game on construction', () => {
    const cb = cbs();
    const store = memStore({ [SETTINGS_KEY]: JSON.stringify({ quality: 'low', master: 0.3, radio: 0.8, invertY: true }) });
    const menu = new Menu(parent, cb, { storage: store, initialQuality: 'high' });
    expect(menu.settings).toEqual({ auto: false, quality: 'low', master: 0.3, radio: 0.8, invertY: true });
    expect(cb.onQuality).toHaveBeenCalledWith('low');
    expect(cb.onMasterVolume).toHaveBeenCalledWith(0.3);
    expect(cb.onRadioVolume).toHaveBeenCalledWith(0.8);
    expect(cb.onInvertLookY).toHaveBeenCalledWith(true);
    expect(slider('menu-master').value).toBe('30');
    expect(parent.querySelector('[data-quality="low"]')!.getAttribute('aria-checked')).toBe('true');
    expect(slider('menu-invert').checked).toBe(true);
  });

  it('ignoreSavedQuality keeps the URL/device quality', () => {
    const cb = cbs();
    const store = memStore({ [SETTINGS_KEY]: JSON.stringify({ quality: 'low' }) });
    const menu = new Menu(parent, cb, { storage: store, initialQuality: 'high', ignoreSavedQuality: true });
    expect(menu.settings.quality).toBe('high');
    expect(cb.onQuality).not.toHaveBeenCalled();
  });

  it('survives corrupt JSON and a throwing storage', () => {
    const bad = memStore({ [SETTINGS_KEY]: '{nope' });
    const other = document.createElement('div'); document.body.appendChild(other);
    expect(() => new Menu(other, {}, { storage: bad })).not.toThrow();
    other.remove();
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const menu = new Menu(parent, {}, { storage: throwing });
    expect(() => parent.querySelector<HTMLButtonElement>('[data-quality="low"]')!.click()).not.toThrow();
    expect(menu.settings.quality).toBe('low');
  });

  it('Reset position calls onReset and closes', () => {
    const cb = cbs();
    const menu = new Menu(parent, cb, { storage: null });
    menu.open();
    [...parent.querySelectorAll<HTMLButtonElement>('.menu-btn')].find((b) => b.textContent === 'Reset position')!.click();
    expect(cb.onReset).toHaveBeenCalledTimes(1);
    expect(menu.isOpen).toBe(false);
  });

  it('shows the touch pause button only in touch mode, hides it while open', () => {
    const menu = new Menu(parent, {}, { storage: null, touch: true });
    expect(menu.pauseButton.hidden).toBe(false);
    menu.pauseButton.click();
    expect(menu.isOpen).toBe(true);
    expect(menu.pauseButton.hidden).toBe(true);
    menu.close();
    expect(menu.pauseButton.hidden).toBe(false);
    const desktop = new Menu(parent, {}, { storage: null });
    expect(desktop.pauseButton.hidden).toBe(true);
  });

  it('lists keyboard, touch and gamepad controls and highlights the current device', () => {
    const menu = new Menu(parent, {}, { storage: null });
    const cols = parent.querySelectorAll('.menu-col');
    expect(cols.length).toBe(3);
    expect(parent.querySelector('.menu-controls')!.textContent).toContain('Enter / exit car');
    menu.setInputMode('gamepad');
    expect(parent.querySelector('.menu-col[data-mode="gamepad"]')!.classList.contains('current')).toBe(true);
    expect(parent.querySelector('.menu-col[data-mode="keyboard"]')!.classList.contains('current')).toBe(false);
  });

  it('keyboard: arrows move focus, left/right change quality and sliders, Tab wraps', () => {
    const cb = cbs();
    const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium' });
    menu.open();
    const key = (code: string, shiftKey = false) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { code, shiftKey, bubbles: true, cancelable: true }));
    key('ArrowDown'); // Resume -> quality (selected)
    expect((document.activeElement as HTMLElement).dataset.quality).toBe('medium');
    key('ArrowRight');
    expect(cb.onQuality).toHaveBeenLastCalledWith('high');
    expect((document.activeElement as HTMLElement).dataset.quality).toBe('high');
    key('ArrowDown');
    expect(document.activeElement).toBe(slider('menu-master'));
    menu.navigate('left');
    expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.95);
    key('ArrowUp'); key('ArrowUp');
    expect(document.activeElement).toBe(parent.querySelector('.menu-primary'));
    key('Tab', true); // wraps to last
    expect(document.activeElement).toBe([...parent.querySelectorAll<HTMLElement>('.menu-panel button')].filter((b) => b.tabIndex >= 0).at(-1));
  });

  it('navigate() is inert while closed, confirm activates, back closes', () => {
    const cb = cbs();
    const menu = new Menu(parent, cb, { storage: null });
    menu.navigate('confirm');
    expect(menu.isOpen).toBe(false);
    menu.open();
    menu.navigate('confirm'); // focus is on Resume
    expect(menu.isOpen).toBe(false);
    menu.open();
    menu.navigate('back');
    expect(menu.isOpen).toBe(false);
  });

  it('opens when pointer lock is released', () => {
    const menu = new Menu(parent, {}, { storage: null });
    let locked: Element | null = document.body;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(menu.isOpen).toBe(false);
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(menu.isOpen).toBe(true);
    delete (document as unknown as Record<string, unknown>).pointerLockElement;
  });

  describe('advanced graphics, auto and full screen', () => {
    const fakeFs = () => {
      const listeners = new Set<(on: boolean, esc?: boolean) => void>();
      let active = false;
      const fs = {
        supported: true, preferred: false,
        get active() { return active; },
        toggle: vi.fn(async () => { active = !active; listeners.forEach((f) => f(active, false)); return active; }),
        enter: vi.fn(async () => true), exit: vi.fn(), dispose: vi.fn(),
        onChange: (f: (on: boolean, esc?: boolean) => void) => { listeners.add(f); return () => listeners.delete(f); },
      };
      return { fs: fs as never, esc: () => { active = false; listeners.forEach((f) => f(false, true)); } };
    };
    const row = (key: string) => parent.querySelector<HTMLElement>(`.menu-adv-row[data-key="${key}"]`)!;

    it('lists rows by tier, applies a change live through onGraphics and persists it', () => {
      const cb = cbs();
      const store = memStore();
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      expect(row('ao').hidden).toBe(false);
      const shadow = row('shadows').querySelector<HTMLButtonElement>('[data-value="off"]')!;
      shadow.click();
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'off' }), ['shadows']);
      expect(JSON.parse(store.data['gta-bedstuy.graphics.v1']).overrides).toEqual({ shadows: 'off' });
      expect(row('shadows').classList.contains('is-custom')).toBe(true);
      const fov = row('fov').querySelector<HTMLInputElement>('input')!;
      fov.value = '80'; fov.dispatchEvent(new Event('input', { bubbles: true }));
      expect(menu.graphics.effective('medium').fov).toBe(80);
      (parent.querySelector('.menu-adv-reset') as HTMLButtonElement).click();
      expect(menu.graphics.hasOverrides).toBe(false);
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'medium', fov: 64 }), expect.arrayContaining(['shadows', 'fov']));
    });

    it('hides rows the tier cannot do and follows the live tier on open', () => {
      let live: 'phone' | 'high' = 'high';
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'high', fullscreen: null, getQuality: () => live });
      expect(row('ao').hidden).toBe(false);
      live = 'phone'; menu.open();
      expect(row('ao').hidden).toBe(true);
      expect(row('aa').hidden).toBe(true);
      expect(row('shadows').querySelector<HTMLButtonElement>('[data-value="high"]')!.hidden).toBe(true);
    });

    it('Auto selects the device tier and reports onAuto; a tier button turns it off', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', auto: true, fullscreen: null });
      const auto = parent.querySelector<HTMLButtonElement>('[data-quality="auto"]')!;
      expect(auto.getAttribute('aria-checked')).toBe('true');
      parent.querySelector<HTMLButtonElement>('[data-quality="high"]')!.click();
      expect(cb.onAuto).toHaveBeenLastCalledWith(false);
      expect(menu.settings.auto).toBe(false);
      auto.click();
      expect(cb.onAuto).toHaveBeenLastCalledWith(true);
      expect(cb.onQuality).toHaveBeenLastCalledWith('medium');
    });

    it('full screen button toggles; Esc out of full screen opens the pause menu', () => {
      const { fs, esc } = fakeFs();
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, fullscreen: fs, openOnPointerUnlock: false });
      const btn = parent.querySelector<HTMLButtonElement>('.menu-fs-btn')!;
      expect(btn.hidden).toBe(false);
      btn.click();
      expect((fs as { toggle: unknown }).toggle).toHaveBeenCalled();
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(menu.isOpen).toBe(false);
      esc();
      expect(menu.isOpen).toBe(true);
    });

    it('arrow keys move through a segmented advanced row', () => {
      const cb = cbs();
      new Menu(parent, cb, { storage: null, initialQuality: 'high', fullscreen: null }).open();
      (parent.querySelector('.menu-adv-toggle') as HTMLButtonElement).click();
      const hi = row('shadows').querySelector<HTMLButtonElement>('[data-value="high"]')!;
      hi.focus();
      hi.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'medium' }), ['shadows']);
    });
  });
});
