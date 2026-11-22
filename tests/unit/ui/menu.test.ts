// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Mixer } from '@/audio/Mixer';
import { Menu, SETTINGS_KEY, MENU_TABS, missionLogOf, type MenuCallbacks, type MapEmbed, type MenuTab } from '@/ui/Menu';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

function cbs() {
  return {
    onPause: vi.fn(), onQuality: vi.fn(), onMasterVolume: vi.fn(), onRadioVolume: vi.fn(), onRadioLibrary: vi.fn(), onInvertLookY: vi.fn(), onReset: vi.fn(), onAuto: vi.fn(), onGraphics: vi.fn(), onCredits: vi.fn(),
  } satisfies Required<MenuCallbacks>;
}

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

describe('Menu (open-world pause layout)', () => {
  let parent: HTMLElement;
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent); });
  afterEach(() => { parent.remove(); document.body.className = ''; });

  const press = (code: string, opts: KeyboardEventInit = {}) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...opts }));
  const row = (m: Menu, id: string) => m.root.querySelector<HTMLElement>(`.gp-pane-settings .gp-list [data-id="${id}"]`)!;
  const rows = (m: Menu) => [...m.root.querySelectorAll<HTMLElement>('.gp-pane-settings .gp-list .gp-row')].filter((r) => !r.hidden);
  const hi = (m: Menu) => m.root.querySelector<HTMLElement>('.gp-pane-settings .gp-list .gp-row.hi')!;
  /** shows the group a row lives in (settings are grouped: only one group's rows are on screen) */
  const show = (m: Menu, id: string) => { const g = m.groupOfRow(id); if (g && m.settingsGroup !== g) m.showGroup(g); return row(m, id); };
  /** goes to a row with the arrow keys / navigate and returns it */
  const goto = (m: Menu, id: string) => { show(m, id); for (let i = 0; i < 80 && hi(m)?.dataset.id !== id; i++) m.navigate('down'); return row(m, id); };
  const enter = (m: Menu, id?: string) => { m.open(); if (id) goto(m, id); };
  const val = (m: Menu, id: string) => row(m, id).querySelector('.gp-text')!.textContent;

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

  it('Escape toggles the menu; the back arrow resumes', () => {
    const menu = new Menu(parent, {}, { storage: null });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menu.isOpen).toBe(true);
    parent.querySelector<HTMLButtonElement>('.gp-resume')!.click();
    expect(menu.isOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menu.isOpen).toBe(false);
  });

  it('is a labelled modal dialog and focuses the first selectable row on open', () => {
    const menu = new Menu(parent, {}, { storage: null });
    menu.open();
    expect(menu.root.getAttribute('role')).toBe('dialog');
    expect(menu.root.getAttribute('aria-modal')).toBe('true');
    expect(menu.root.hasAttribute('data-ui-modal')).toBe(true);
    expect(document.activeElement).toBe(hi(menu));
  });

  describe('header and tabs', () => {
    it('lists MAP, MISSIONS, STATS, SETTINGS, CONTROLS, SAVE, RADIO in a tablist; MAP and SAVE only with their parts', () => {
      const menu = new Menu(parent, {}, { storage: null });
      const tablist = menu.root.querySelector('nav.menu-tabs[role="tablist"]')!;
      const btns = [...tablist.querySelectorAll<HTMLButtonElement>(':scope > button.menu-tab')];
      expect(btns.map((b) => b.textContent)).toEqual(MENU_TABS.map((t) => t.label));
      expect(btns.map((b) => b.dataset.tab)).toEqual(['map', 'missions', 'stats', 'settings', 'controls', 'save', 'radio']);
      expect(btns.filter((b) => b.hidden).map((b) => b.dataset.tab)).toEqual(['map', 'save']);
      expect(btns.find((b) => b.dataset.tab === 'settings')!.getAttribute('aria-selected')).toBe('true');
    });

    it('Q / E, PageUp / PageDown, tab() and a click switch tabs, skipping hidden ones, wrapping around', () => {
      const menu = new Menu(parent, {}, { storage: null });
      menu.open();
      expect(menu.tabName).toBe('settings');
      press('KeyE'); expect(menu.tabName).toBe('controls');
      press('KeyE'); expect(menu.tabName).toBe('radio');
      press('KeyE'); expect(menu.tabName).toBe('missions'); // map is not shown: wraps to the first visible tab
      press('KeyQ'); expect(menu.tabName).toBe('radio');
      press('PageUp'); expect(menu.tabName).toBe('controls');
      menu.tab(-1); expect(menu.tabName).toBe('settings');
      menu.root.querySelector<HTMLButtonElement>('.menu-tab[data-tab="radio"]')!.click();
      expect(menu.tabName).toBe('radio');
      expect(menu.root.querySelector<HTMLElement>('.gp-pane-radio')!.hidden).toBe(false);
      expect(menu.root.querySelector<HTMLElement>('.gp-pane-settings')!.hidden).toBe(true);
      expect(menu.root.querySelector('.menu-tab.on')!.textContent).toBe('Radio');
    });

    it('hint glyphs follow the input device (Q E, LB RB, arrows)', () => {
      const menu = new Menu(parent, {}, { storage: null });
      const l = () => menu.root.querySelector('.gp-tabhint.l')!.textContent;
      expect(l()).toBe('Q');
      menu.setInputMode('gamepad'); expect(l()).toBe('LB');
      expect(menu.root.querySelector('.gp-foot')!.textContent).toContain('Start');
      menu.setInputMode('touch'); expect(l()).toBe('‹');
    });

    it('shows cash, day, time and street from the info callback and refreshes while open', () => {
      let cash = 1250;
      const menu = new Menu(parent, {}, { storage: null, info: () => ({ cash, hour: 14.5, day: 2, street: 'Throop Ave' }) });
      menu.open();
      expect(menu.root.querySelector('.gp-cash')!.textContent).toBe('$1,250');
      expect(menu.root.querySelector('.gp-when')!.textContent).toContain('2:30pm');
      expect(menu.root.querySelector('.gp-when')!.textContent).toContain('Day 3');
      expect(menu.root.querySelector('.gp-street')!.textContent).toBe('Throop Ave');
      cash = 90;
      menu.close(); menu.open();
      expect(menu.root.querySelector('.gp-cash')!.textContent).toBe('$90');
    });

    it('without an info callback the player block stays empty (nothing invented)', () => {
      const menu = new Menu(parent, {}, { storage: null });
      expect(menu.root.querySelector<HTMLElement>('.gp-cash')!.hidden).toBe(true);
    });
  });

  describe('settings: grouped, every change applies at once', () => {
    it('has the groups Game, Controls, Audio, Graphics, Map as chips, one group on screen at a time, and a visible Back and Resume', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null, mixer: new Mixer(null) });
      expect([...menu.root.querySelectorAll('.gp-chip')].map((n) => n.textContent)).toEqual(['Game', 'Controls', 'Audio', 'Graphics', 'Map']);
      expect(menu.root.querySelector('.gp-act')).toBeNull(); // no Apply / Defaults stack any more
      expect(menu.root.querySelector('.gp-resume')!.textContent).toBe('Resume');
      expect(menu.root.querySelector('.gp-foot-back')!.textContent).toBe('Back');
      expect(menu.root.querySelector('.menu-title')!.textContent).toBe('Settings');
      menu.open();
      expect(menu.settingsGroup).toBe('game');
      expect(rows(menu).map((r) => r.dataset.id)).toEqual(expect.arrayContaining(['radiolib', 'reset']));
      expect(rows(menu).map((r) => r.dataset.id)).not.toContain('master');
      menu.root.querySelector<HTMLButtonElement>('.gp-chip[data-group="audio"]')!.click();
      expect(menu.settingsGroup).toBe('audio');
      expect(rows(menu).map((r) => r.dataset.id)).toEqual(expect.arrayContaining(['master', 'engineon', 'enginevol']));
      expect(menu.root.querySelector('.gp-chip.on')!.textContent).toBe('Audio');
    });

    it('up / down walk the rows of the group; Up from the first row reaches the chips, Left / Right change group, Down returns', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null, initialQuality: 'medium' });
      menu.open(); menu.showGroup('graphics');
      expect(hi(menu).dataset.id).toBe('quality'); // window mode is hidden without full screen support
      press('ArrowDown'); expect(hi(menu).dataset.id).toBe('autodetect');
      press('ArrowUp'); press('ArrowUp');
      expect(menu.focusZone).toBe('chips');
      press('ArrowRight'); expect(menu.settingsGroup).toBe('map');
      press('ArrowLeft'); press('ArrowLeft'); expect(menu.settingsGroup).toBe('audio');
      press('ArrowDown');
      expect(menu.focusZone).toBe('list');
      expect(hi(menu).dataset.id).toBe('master');
    });

    it('left / right change a segmented row, a slider and a toggle and each reaches the host and the store at once', () => {
      const cb = cbs();
      const store = memStore();
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'quality');
      press('ArrowRight');
      expect(val(menu, 'quality')).toBe('High');
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
      goto(menu, 'master'); press('ArrowLeft');
      expect(val(menu, 'master')).toBe('95%');
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.95);
      goto(menu, 'invert'); press('ArrowRight');
      expect(val(menu, 'invert')).toBe('ON');
      expect(cb.onInvertLookY).toHaveBeenLastCalledWith(true);
      expect(JSON.parse(store.data[SETTINGS_KEY])).toMatchObject({ quality: 'high', auto: false, master: 0.95, radio: 1, invertY: true });
    });

    it('arrows, a click on a row and Enter on the keyboard all edit the value at once', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', fullscreen: null });
      menu.open();
      show(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(val(menu, 'master')).toBe('95%');
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.95);
      show(menu, 'quality').click(); // click cycles a segmented row
      expect(val(menu, 'quality')).toBe('High');
      goto(menu, 'invert'); press('Enter');
      expect(val(menu, 'invert')).toBe('ON');
      expect(cb.onInvertLookY).toHaveBeenLastCalledWith(true);
    });

    it('a slider drags with the pointer and steps with clicks on its end arrows', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, fullscreen: null });
      menu.open();
      const bar = show(menu, 'master').querySelector<HTMLElement>('.gp-bar')!;
      bar.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 10, right: 300, bottom: 10, x: 100, y: 0, toJSON() { return {}; } }) as DOMRect;
      const ev = (type: string, x: number) => { const e = new Event(type, { bubbles: true }) as Event & { clientX: number; pointerId: number }; e.clientX = x; e.pointerId = 1; bar.dispatchEvent(e); };
      ev('pointerdown', 200); expect(val(menu, 'master')).toBe('50%');
      ev('pointermove', 160); expect(val(menu, 'master')).toBe('30%');
      ev('pointerup', 160); ev('pointermove', 280); expect(val(menu, 'master')).toBe('30%'); // released: no more dragging
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.3);
      show(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.r')!.click();
      expect(val(menu, 'master')).toBe('35%');
    });

    it('Reset to defaults is the last row of a group, asks once, and Back cancels the question', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: memStore(), initialQuality: 'medium', fullscreen: null });
      menu.graphics.set('shadows', 'off'); menu.graphics.set('crowd', 0.5);
      menu.open(); menu.showGroup('graphics');
      expect(val(menu, 'g:shadows')).toBe('Off');
      const r = row(menu, 'reset:graphics');
      expect(r.querySelector('.gp-lab')!.textContent).toBe('Reset Graphics to defaults');
      r.click();
      expect(r.textContent).toContain('PRESS AGAIN');
      expect(val(menu, 'g:shadows')).toBe('Off'); // asked, not done
      menu.back();
      expect(menu.isOpen).toBe(true); // the first Back only cancels the question
      expect(r.textContent).not.toContain('PRESS AGAIN');
      r.click(); r.click();
      expect(val(menu, 'g:shadows')).toBe('Medium');
      expect(val(menu, 'g:crowd')).toBe('100%');
      expect(menu.graphics.hasOverrides).toBe(false);
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'medium', crowd: 1 }), expect.any(Array));
      // another group is untouched
      menu.showGroup('audio'); expect(row(menu, 'reset:audio')).toBeTruthy();
    });

    it('Audio reset puts the sliders back to 100% and the engine On', () => {
      const mixer = new Mixer(null);
      const menu = new Menu(parent, {}, { storage: null, mixer, fullscreen: null });
      menu.open(); menu.showGroup('audio');
      mixer.set('sfx', 0.2); mixer.set('engine', 0);
      row(menu, 'reset:audio').click(); row(menu, 'reset:audio').click();
      expect(mixer.get('sfx')).toBe(1);
      expect(mixer.get('engine')).toBe(1);
    });

    it('Auto Detect Settings and the preset: choosing a preset turns Auto off', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', auto: true, fullscreen: null });
      enter(menu, 'autodetect');
      expect(val(menu, 'autodetect')).toBe('ON');
      press('ArrowLeft'); // off
      expect(menu.settings.auto).toBe(false);
      press('ArrowUp'); press('ArrowRight'); // back up to the preset, medium -> high
      expect(menu.settings).toMatchObject({ auto: false, quality: 'high' });
      expect(cb.onAuto).toHaveBeenLastCalledWith(false);
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
    });

    it('each graphics row maps to a real setting and changes it at once', () => {
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'high', fullscreen: null });
      menu.open(); menu.showGroup('graphics');
      const ids = rows(menu).map((r) => r.dataset.id);
      expect(ids).toEqual(expect.arrayContaining(['g:fpsCap', 'g:resolution', 'g:nativeDpr', 'g:showFps', 'quality', 'autodetect', 'g:shadows', 'g:drawDistance', 'g:treeRange', 'g:crowd', 'g:traffic', 'g:aa', 'g:textures', 'g:ao', 'g:bloom', 'g:dof', 'g:vignette', 'g:grain', 'g:fov']));
      row(menu, 'g:ao').click(); row(menu, 'g:dof').click(); row(menu, 'g:bloom').click();
      row(menu, 'g:traffic').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(menu.graphics.effective('high')).toMatchObject({ ao: false, dof: false, bloom: false, traffic: 0.75 });
    });

    it('Reset position needs a second press', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, fullscreen: null });
      menu.open();
      goto(menu, 'reset').click();
      expect(cb.onReset).not.toHaveBeenCalled();
      expect(row(menu, 'reset').textContent).toContain('PRESS AGAIN');
      row(menu, 'reset').click();
      expect(cb.onReset).toHaveBeenCalledTimes(1);
      expect(menu.isOpen).toBe(false);
    });

    it('Back (Esc, the button, a right click) first cancels a "press again" question, then resumes', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null });
      menu.open();
      row(menu, 'reset').click();
      expect(menu.asking).toBe(true);
      menu.root.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); // right click
      expect(menu.asking).toBe(false);
      expect(menu.isOpen).toBe(true);
      menu.root.querySelector<HTMLButtonElement>('.gp-foot-back')!.click();
      expect(menu.isOpen).toBe(false);
      menu.open();
      row(menu, 'reset').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(menu.isOpen).toBe(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(menu.isOpen).toBe(false);
    });

    it('Radio library reaches the host at once (it is an action, not a setting)', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null });
      menu.open();
      row(menu, 'radiolib').click();
      expect(cb.onRadioLibrary).toHaveBeenCalledTimes(1);
    });

    it('hover moves the one focus only when the mouse moves, never when the list scrolls under a still pointer', () => {
      const menu = new Menu(parent, {}, { storage: null, mixer: new Mixer(null) });
      menu.open(); menu.showGroup('audio');
      const pm = (el: Element, x: number, y: number) => { const e = new Event('pointermove', { bubbles: true }) as Event & { clientX: number; clientY: number; pointerType: string }; e.clientX = x; e.clientY = y; e.pointerType = 'mouse'; el.dispatchEvent(e); };
      pm(row(menu, 'sfxvol'), 10, 10);
      expect(hi(menu).dataset.id).toBe('sfxvol');
      press('ArrowDown'); // the keyboard moves the focus on
      expect(hi(menu).dataset.id).toBe('engineon');
      pm(row(menu, 'sfxvol'), 10, 10); // same coordinates: the list scrolled under a still pointer, nothing moves
      expect(hi(menu).dataset.id).toBe('engineon');
      pm(row(menu, 'sfxvol'), 12, 10); // a real move
      expect(hi(menu).dataset.id).toBe('sfxvol');
    });
  });

  describe('gamepad', () => {
    it('navigate(): up / down select, left / right change, confirm cycles, back resumes', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', fullscreen: null });
      menu.navigate('down');
      expect(cb.onQuality).not.toHaveBeenCalled(); // closed: inert
      menu.open();
      goto(menu, 'quality');
      menu.navigate('right');
      expect(val(menu, 'quality')).toBe('High');
      menu.navigate('left'); menu.navigate('left');
      expect(val(menu, 'quality')).toBe('Low');
      expect(cb.onQuality).toHaveBeenLastCalledWith('low');
      menu.navigate('back');
      expect(menu.isOpen).toBe(false);
    });

    it('bumpers switch tabs through tab()', () => {
      const menu = new Menu(parent, {}, { storage: null });
      menu.open();
      menu.tab(1); expect(menu.tabName).toBe('controls');
      menu.tab(-1); expect(menu.tabName).toBe('settings');
    });
  });

  describe('persistence', () => {
    it('restores saved settings into the UI and pushes them to the game on construction', () => {
      const cb = cbs();
      const store = memStore({ [SETTINGS_KEY]: JSON.stringify({ quality: 'low', master: 0.3, radio: 0.8, invertY: true }) });
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'high' });
      expect(menu.settings).toMatchObject({ auto: false, quality: 'low', master: 0.3, radio: 0.8, invertY: true });
      expect(cb.onQuality).toHaveBeenCalledWith('low');
      expect(cb.onMasterVolume).toHaveBeenCalledWith(0.3);
      expect(cb.onRadioVolume).toHaveBeenCalledWith(0.8);
      expect(cb.onInvertLookY).toHaveBeenCalledWith(true);
      menu.open();
      expect(val(menu, 'master')).toBe('30%');
      expect(val(menu, 'invert')).toBe('ON');
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
      const menu = new Menu(parent, {}, { storage: throwing, fullscreen: null });
      enter(menu, 'quality');
      expect(() => press('ArrowLeft')).not.toThrow();
      expect(menu.settings.quality).toBe('low');
    });

    it('graphics overrides persist and merge over the tier preset on the next start', () => {
      const store = memStore();
      const a = new Menu(parent, {}, { storage: store, initialQuality: 'medium', fullscreen: null });
      a.open();
      row(a, 'g:shadows').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      row(a, 'g:shadows').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      row(a, 'g:crowd').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(JSON.parse(store.data['gta-bedstuy.graphics.v1']).overrides).toEqual({ shadows: 'blob', crowd: 0.75 });
      a.dispose();
      const cb = cbs();
      const b = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      expect(b.graphics.effective('medium')).toMatchObject({ shadows: 'blob', crowd: 0.75, ao: true });
      expect(cb.onGraphics).toHaveBeenCalledWith(expect.objectContaining({ shadows: 'blob', crowd: 0.75 }), expect.arrayContaining(['shadows', 'crowd']));
    });
  });

  describe('tier rows, full screen, install, FPS', () => {
    it('hides rows the tier cannot do and follows the live tier on open', () => {
      let live: 'phone' | 'high' = 'high';
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'high', fullscreen: null, getQuality: () => live });
      menu.open(); menu.showGroup('graphics');
      expect(row(menu, 'g:ao').hidden).toBe(false);
      menu.close();
      live = 'phone'; menu.open();
      for (const id of ['g:ao', 'g:dof', 'g:aa', 'g:nativeDpr']) expect(row(menu, id).hidden, id).toBe(true);
      expect(row(menu, 'g:shadows').querySelector('.gp-text')!.textContent).toBe('Blob');
    });

    it('Window Mode toggles full screen at once; Esc out of full screen opens the pause menu', () => {
      const { fs, esc } = fakeFs();
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: fs, openOnPointerUnlock: false });
      menu.open(); menu.showGroup('graphics');
      expect(val(menu, 'windowmode')).toBe('Windowed');
      row(menu, 'windowmode').click();
      expect((fs as { toggle: unknown }).toggle).toHaveBeenCalled();
      expect(val(menu, 'windowmode')).toBe('Full screen');
      menu.close();
      esc();
      expect(menu.isOpen).toBe(true);
    });

    it('Window Mode is hidden where the browser cannot do full screen', () => {
      const { fs } = fakeFs();
      (fs as { supported: boolean }).supported = false;
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: fs });
      menu.open(); menu.showGroup('graphics');
      expect(row(menu, 'windowmode').hidden).toBe(true);
    });

    it('the install hint shows only when installable (hosted build)', () => {
      const hosted = new Menu(parent, {}, { storage: null, installable: true, fullscreen: null });
      hosted.open();
      expect(show(hosted, 'install').hidden).toBe(false);
      const plain = document.createElement('div'); document.body.appendChild(plain);
      const artifact = new Menu(plain, {}, { storage: null, installable: false, fullscreen: null });
      artifact.open();
      expect(artifact.root.querySelector<HTMLElement>('.gp-pane-settings [data-id="install"]')!.hidden).toBe(true);
      plain.remove();
    });

    it('Show FPS toggles the counter at once', () => {
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: null });
      menu.open(); menu.showGroup('graphics');
      const counter = parent.querySelector<HTMLElement>('.fps-counter')!;
      expect(counter.hidden).toBe(true);
      row(menu, 'g:showFps').click();
      expect(counter.hidden).toBe(false);
    });
  });

  describe('description panel', () => {
    const desc = (m: Menu) => m.root.querySelector('.gp-pane-settings .gp-desc')!;
    it('describes the highlighted option and shows GPU load bars for graphics options only', () => {
      const menu = new Menu(parent, {}, { storage: null, initialQuality: 'high', fullscreen: null });
      enter(menu, 'g:shadows');
      expect(desc(menu).querySelector('.gp-desc-title')!.textContent).toBe('Shadows');
      expect(desc(menu).querySelector('.gp-desc-text')!.textContent).toContain('sun shadows');
      expect(desc(menu).querySelector<HTMLElement>('.gp-gpu')!.hidden).toBe(false);
      const own = () => parseInt(desc(menu).querySelector<HTMLElement>('.gp-meter.thin i')!.style.width, 10);
      expect(own()).toBe(100);
      goto(menu, 'master');
      expect(desc(menu).querySelector<HTMLElement>('.gp-gpu')!.hidden).toBe(true);
      expect(desc(menu).querySelector('.gp-desc-title')!.textContent).toBe('Master Volume');
    });
  });

  describe('MAP, MISSIONS, STATS, RADIO, SAVE', () => {
    function fakeMap(): MapEmbed & { opens: number; closes: number } {
      const root = document.createElement('div'); root.className = 'map-root'; root.hidden = true;
      parent.appendChild(root);
      const m = {
        root, opens: 0, closes: 0, isOpen: false, onOpen: null as (() => void) | null, onClose: null as (() => void) | null,
        open() { if (m.isOpen) return; m.onOpen?.(); m.isOpen = true; root.hidden = false; m.opens++; },
        close() { if (!m.isOpen) return; m.isOpen = false; root.hidden = true; m.closes++; m.onClose?.(); },
      };
      return m;
    }

    it('MAP embeds the map in the tab while the menu is open and gives it back afterwards', () => {
      const map = fakeMap();
      const menu = new Menu(parent, {}, { storage: null, map, fullscreen: null });
      menu.open();
      menu.showTab('map');
      expect(map.root.parentElement!.classList.contains('gp-maphost')).toBe(true);
      expect(map.isOpen).toBe(true);
      menu.showTab('stats');
      expect(map.isOpen).toBe(false);
      expect(map.root.parentElement).toBe(parent);
      expect(menu.isOpen).toBe(true); // leaving the tab does not close the menu
      menu.showTab('map');
      menu.close();
      expect(map.isOpen).toBe(false);
      expect(map.root.parentElement).toBe(parent);
    });

    it('closing the map inside the tab (its Esc / M) closes the menu', () => {
      const map = fakeMap();
      const menu = new Menu(parent, {}, { storage: null, map, fullscreen: null });
      menu.open(); menu.showTab('map');
      map.close();
      expect(menu.isOpen).toBe(false);
    });

    it('MISSIONS lists the log sorted by act and state; without a log it says so', () => {
      const log = () => [
        { id: 'b', title: 'Second Act Job', state: 'open' as const, act: 2 },
        { id: 'a2', title: 'Done Job', state: 'done' as const, act: 1 },
        { id: 'a1', title: 'Active Job', state: 'active' as const, act: 1, objective: 'Bring the crate' },
      ];
      const menu = new Menu(parent, {}, { storage: null, missionLog: log });
      menu.open(); menu.showTab('missions');
      const pane = menu.root.querySelector('.gp-pane-missions')!;
      expect([...pane.querySelectorAll('.gp-lab')].map((n) => n.textContent)).toEqual(['Active Job', 'Done Job', 'Second Act Job']);
      expect(pane.querySelector('.gp-row[data-state="active"] .gp-text')!.textContent).toBe('In progress');
      expect(pane.querySelector('.gp-desc-text')!.textContent).toContain('Bring the crate');
      const plain = document.createElement('div'); document.body.appendChild(plain);
      const bare = new Menu(plain, {}, { storage: null });
      bare.open(); bare.showTab('missions');
      expect(bare.root.querySelector('.gp-pane-missions .gp-lab')!.textContent).toContain('No mission log');
      plain.remove();
    });

    it('missionLogOf maps a MissionSystem-like object', () => {
      const sys = {
        missions: [{ id: 'x', title: 'X', act: 1 }, { id: 'y', title: 'Y' }, { id: 'z', title: 'Z' }],
        statusOf: (id: string) => (id === 'x' ? 'complete' : id === 'y' ? 'active' : null),
        isOffered: () => false,
      };
      expect(missionLogOf(sys).map((e) => e.state)).toEqual(['done', 'active', 'locked']);
    });

    it('STATS shows real counters only: the host values plus time played and pauses', () => {
      const menu = new Menu(parent, {}, { storage: null, info: () => ({ cash: 700, day: 1, stats: [['Records owned', '3']] }) });
      menu.open(); menu.close(); menu.open();
      menu.showTab('stats');
      const text = [...menu.root.querySelectorAll('.gp-pane-stats .gp-row')].map((r) => r.textContent);
      expect(text).toEqual(expect.arrayContaining([expect.stringContaining('$700'), expect.stringContaining('Day 2'), expect.stringContaining('Records owned3'), expect.stringContaining('Time played'), expect.stringContaining('Times paused2')]));
    });

    it('RADIO shows the station and the volume slider; the library button reaches the host', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, info: () => ({ station: 'Throop Funk 101' }) });
      menu.open(); menu.showTab('radio');
      const pane = menu.root.querySelector('.gp-pane-radio')!;
      expect(pane.querySelector('[data-id="station"] .gp-text')!.textContent).toBe('Throop Funk 101');
      press('ArrowDown'); press('ArrowLeft');
      expect(cb.onRadioVolume).toHaveBeenLastCalledWith(0.95);
      press('ArrowDown'); press('Enter');
      expect(cb.onRadioLibrary).toHaveBeenCalled();
    });
  });

  it('shows the touch pause button only in touch mode, hides it while open', () => {
    const menu = new Menu(parent, {}, { storage: null, touch: true });
    expect(menu.pauseButton.hidden).toBe(false);
    menu.pauseButton.click();
    expect(menu.isOpen).toBe(true);
    expect(menu.pauseButton.hidden).toBe(true);
    expect(menu.root.dataset.input).toBe('touch');
    menu.close();
    expect(menu.pauseButton.hidden).toBe(false);
    const desktop = new Menu(parent, {}, { storage: null });
    expect(desktop.pauseButton.hidden).toBe(true);
  });

  it('on touch every control is a tap: groups, rows, arrows, Back and Resume', () => {
    const menu = new Menu(parent, {}, { storage: null, touch: true });
    menu.open();
    expect(menu.root.dataset.input).toBe('touch');
    menu.root.querySelector<HTMLButtonElement>('.gp-chip[data-group="audio"]')!.click();
    row(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
    expect(val(menu, 'master')).toBe('95%');
    menu.root.querySelector<HTMLButtonElement>('.gp-foot-back')!.click();
    expect(menu.isOpen).toBe(false);
    menu.pauseButton.click();
    menu.root.querySelector<HTMLButtonElement>('.gp-resume')!.click();
    expect(menu.isOpen).toBe(false);
  });

  it('opens when pointer lock is released', () => {
    const menu = new Menu(parent, {}, { storage: null });
    let lock: Element | null = parent;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lock });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(menu.isOpen).toBe(false);
    lock = null;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(menu.isOpen).toBe(true);
    delete (document as unknown as Record<string, unknown>).pointerLockElement;
  });

  it('every tab id is reachable', () => {
    const root = document.createElement('div'); parent.appendChild(root);
    const map: MapEmbed = { root, isOpen: false, open() { this.root.hidden = false; }, close() { this.root.hidden = true; }, onOpen: null, onClose: null };
    const menu = new Menu(parent, {}, { storage: null, map, fullscreen: null });
    menu.open();
    const seen: MenuTab[] = [];
    for (let i = 0; i < 8; i++) { seen.push(menu.tabName); menu.tab(1); }
    expect(new Set(seen)).toEqual(new Set<MenuTab>(['map', 'missions', 'stats', 'settings', 'controls', 'radio']));
  });

  describe('desktop shell and HD voices', () => {
    afterEach(() => { delete (globalThis as { gtaNative?: unknown }).gtaNative; });
    const native = () => {
      const n = { isNative: true as const, platform: 'darwin', version: '1', setFullscreen: vi.fn(), quit: vi.fn(), saveFile: vi.fn(async () => true) };
      (globalThis as { gtaNative?: unknown }).gtaNative = n;
      return n;
    };

    it('in a browser there is no Quit row; in the shell Quit needs two presses and the install hint is hidden', () => {
      const plain = new Menu(parent, {}, { storage: null, fullscreen: null, installable: true });
      plain.open(); plain.showGroup('game');
      expect(row(plain, 'quit').hidden).toBe(true);
      expect(row(plain, 'install').hidden).toBe(false);
      plain.dispose();
      const n = native();
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null, installable: true });
      menu.open();
      expect(row(menu, 'install').hidden).toBe(true);
      show(menu, 'quit');
      row(menu, 'quit').click();
      expect(n.quit).not.toHaveBeenCalled();
      row(menu, 'quit').click();
      expect(n.quit).toHaveBeenCalledTimes(1);
    });

    it('Window Mode goes through gtaNative.setFullscreen when present', () => {
      const n = native();
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null });
      menu.open(); menu.showGroup('graphics');
      expect(row(menu, 'windowmode').hidden).toBe(false);
      row(menu, 'windowmode').click();
      expect(n.setFullscreen).toHaveBeenLastCalledWith(true);
      expect(val(menu, 'windowmode')).toBe('Full screen');
    });

    it('HD voices row appears only with the host switch and changes it at once', () => {
      const bare = new Menu(parent, {}, { storage: null, fullscreen: null });
      bare.open(); bare.showGroup('audio');
      expect(row(bare, 'hdvoices').hidden).toBe(true);
      bare.dispose();
      let on = false;
      const set = vi.fn((v: boolean) => { on = v; });
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null, hdVoices: { get: () => on, set } });
      menu.open(); menu.showGroup('audio');
      expect(row(menu, 'hdvoices').hidden).toBe(false);
      row(menu, 'hdvoices').click();
      expect(set).toHaveBeenCalledWith(true);
      expect(val(menu, 'hdvoices')).toBe('ON');
    });
  });
});
