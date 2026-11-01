// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu, SETTINGS_KEY, type MenuCallbacks } from '@/ui/Menu';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

function cbs() {
  return {
    onPause: vi.fn(), onQuality: vi.fn(), onMasterVolume: vi.fn(), onRadioVolume: vi.fn(), onRadioLibrary: vi.fn(), onInvertLookY: vi.fn(), onReset: vi.fn(),
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
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ quality: 'high', master: 0.4, radio: 0.15, invertY: true });
  });

  it('restores saved settings into the UI and pushes them to the game on construction', () => {
    const cb = cbs();
    const store = memStore({ [SETTINGS_KEY]: JSON.stringify({ quality: 'low', master: 0.3, radio: 0.8, invertY: true }) });
    const menu = new Menu(parent, cb, { storage: store, initialQuality: 'high' });
    expect(menu.settings).toEqual({ quality: 'low', master: 0.3, radio: 0.8, invertY: true });
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
});
