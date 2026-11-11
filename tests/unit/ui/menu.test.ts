// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu, SETTINGS_KEY, MENU_TABS, missionLogOf, type MenuCallbacks, type MapEmbed, type MenuTab } from '@/ui/Menu';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

function cbs() {
  return {
    onPause: vi.fn(), onQuality: vi.fn(), onMasterVolume: vi.fn(), onRadioVolume: vi.fn(), onRadioLibrary: vi.fn(), onInvertLookY: vi.fn(), onReset: vi.fn(), onAuto: vi.fn(), onGraphics: vi.fn(),
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
  afterEach(() => { parent.remove(); });

  const press = (code: string, opts: KeyboardEventInit = {}) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...opts }));
  const row = (m: Menu, id: string) => m.root.querySelector<HTMLElement>(`.gp-pane-settings .gp-list [data-id="${id}"]`)!;
  const rows = (m: Menu) => [...m.root.querySelectorAll<HTMLElement>('.gp-pane-settings .gp-list .gp-row')].filter((r) => !r.hidden);
  const hi = (m: Menu) => m.root.querySelector<HTMLElement>('.gp-pane-settings .gp-list .gp-row.hi')!;
  const act = (m: Menu, name: string) => m.root.querySelector<HTMLButtonElement>(`.gp-act-${name}`)!;
  /** goes to a row with the arrow keys / navigate and returns it */
  const goto = (m: Menu, id: string) => { for (let i = 0; i < 80 && hi(m)?.dataset.id !== id; i++) m.navigate('down'); return row(m, id); };
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
    parent.querySelector<HTMLButtonElement>('.gp-back')!.click();
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
    it('lists MAP, MISSIONS, STATS, SETTINGS, SAVE, RADIO in a tablist; MAP and SAVE only with their parts', () => {
      const menu = new Menu(parent, {}, { storage: null });
      const tablist = menu.root.querySelector('nav.menu-tabs[role="tablist"]')!;
      const btns = [...tablist.querySelectorAll<HTMLButtonElement>(':scope > button.menu-tab')];
      expect(btns.map((b) => b.textContent)).toEqual(MENU_TABS.map((t) => t.label));
      expect(btns.map((b) => b.dataset.tab)).toEqual(['map', 'missions', 'stats', 'settings', 'save', 'radio']);
      expect(btns.filter((b) => b.hidden).map((b) => b.dataset.tab)).toEqual(['map', 'save']);
      expect(btns.find((b) => b.dataset.tab === 'settings')!.getAttribute('aria-selected')).toBe('true');
    });

    it('Q / E, PageUp / PageDown, tab() and a click switch tabs, skipping hidden ones, wrapping around', () => {
      const menu = new Menu(parent, {}, { storage: null });
      menu.open();
      expect(menu.tabName).toBe('settings');
      press('KeyE'); expect(menu.tabName).toBe('radio');
      press('KeyE'); expect(menu.tabName).toBe('missions'); // map is not shown: wraps to the first visible tab
      press('KeyQ'); expect(menu.tabName).toBe('radio');
      press('PageUp'); expect(menu.tabName).toBe('settings');
      menu.tab(-1); expect(menu.tabName).toBe('stats');
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

  describe('settings: one list with pending changes', () => {
    it('is a single scrolling list with yellow sub-headers and the APPLY / DEFAULTS / BACK stack', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null });
      expect(menu.root.querySelector('.gp-cats')).toBeNull();
      expect([...menu.root.querySelectorAll('.gp-pane-settings .gp-sub')].map((n) => n.textContent)).toEqual(['Display', 'Graphics', 'Audio', 'Controls', 'Game', 'Keyboard & mouse controls', 'Minimap']);
      expect([...menu.root.querySelectorAll('.gp-act')].map((n) => n.textContent)).toEqual(['Apply', 'Defaults', 'Back']);
      expect(menu.root.querySelector('.menu-title')!.textContent).toBe('Settings');
    });

    it('up / down move through the rows and skip the sub-headers; arrows past the end reach the action stack', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null, initialQuality: 'medium' });
      menu.open();
      expect(hi(menu).dataset.id).toBe('g:fpsCap'); // window mode is hidden without full screen support; headers are never selected
      press('ArrowDown'); expect(hi(menu).dataset.id).toBe('g:resolution');
      press('ArrowUp'); press('ArrowUp');
      expect(menu.focusZone).toBe('list');
      for (let i = 0; i < 60 && menu.focusZone === 'list'; i++) press('ArrowDown');
      expect(menu.focusZone).toBe('acts');
      expect(act(menu, 'apply').classList.contains('hi')).toBe(true);
      press('ArrowDown'); expect(act(menu, 'defaults').classList.contains('hi')).toBe(true);
      press('ArrowUp'); press('ArrowUp');
      expect(menu.focusZone).toBe('list');
    });

    it('left / right change a segmented row, a slider and a toggle as PENDING: nothing reaches the host until APPLY', () => {
      const cb = cbs();
      const store = memStore();
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'quality');
      press('ArrowRight');
      expect(val(menu, 'quality')).toBe('High');
      expect(menu.pendingCount).toBe(1);
      expect(cb.onQuality).not.toHaveBeenCalled();
      goto(menu, 'master'); press('ArrowLeft');
      expect(val(menu, 'master')).toBe('95%');
      goto(menu, 'invert'); press('ArrowRight');
      expect(val(menu, 'invert')).toBe('ON');
      expect(menu.pendingCount).toBe(3);
      expect(cb.onMasterVolume).not.toHaveBeenCalled();
      expect(store.data[SETTINGS_KEY]).toBeUndefined();
      act(menu, 'apply').click();
      expect(menu.pendingCount).toBe(0);
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.95);
      expect(cb.onInvertLookY).toHaveBeenLastCalledWith(true);
      expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ quality: 'high', auto: false, master: 0.95, radio: 1, invertY: true });
      expect(val(menu, 'invert')).toBe('ON');
    });

    it('going back to the original value drops the pending change', () => {
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'quality');
      press('ArrowRight'); expect(menu.pendingCount).toBe(1);
      press('ArrowLeft'); expect(menu.pendingCount).toBe(0);
    });

    it('arrows, a click on a row and Enter on the keyboard all edit the pending value', () => {
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'medium', fullscreen: null });
      menu.open();
      row(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(val(menu, 'master')).toBe('95%');
      row(menu, 'quality').click(); // click cycles a segmented row
      expect(val(menu, 'quality')).toBe('High');
      goto(menu, 'invert'); press('Enter');
      expect(val(menu, 'invert')).toBe('ON');
      expect(menu.pendingCount).toBe(3);
    });

    it('DEFAULTS makes the preset values pending and APPLY commits them (graphics overrides are dropped)', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: memStore(), initialQuality: 'medium', fullscreen: null });
      menu.graphics.set('shadows', 'off'); menu.graphics.set('crowd', 0.5);
      menu.open();
      expect(val(menu, 'g:shadows')).toBe('Off');
      act(menu, 'defaults').click();
      expect(val(menu, 'g:shadows')).toBe('Medium');
      expect(val(menu, 'g:crowd')).toBe('100%');
      expect(menu.graphics.hasOverrides).toBe(true); // still pending
      act(menu, 'apply').click();
      expect(menu.graphics.hasOverrides).toBe(false);
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'medium', crowd: 1 }), expect.any(Array));
    });

    it('BACK with pending changes asks first (DISCARD?), a second press discards and resumes; Esc is BACK', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'master'); press('ArrowLeft');
      expect(menu.pendingCount).toBe(1);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(menu.isOpen).toBe(true);
      expect(act(menu, 'back').textContent).toBe('Discard?');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(menu.isOpen).toBe(false);
      expect(menu.pendingCount).toBe(0);
      expect(cb.onMasterVolume).not.toHaveBeenCalled();
      menu.open();
      expect(val(menu, 'master')).toBe('100%');
      act(menu, 'back').click(); // nothing pending: closes at once
      expect(menu.isOpen).toBe(false);
    });

    it('Auto Detect Settings and the preset: apply order keeps the chosen preset on top', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', auto: true, fullscreen: null });
      enter(menu, 'autodetect');
      expect(val(menu, 'autodetect')).toBe('ON');
      press('ArrowLeft'); // off
      press('ArrowUp'); press('ArrowRight'); // back up to the preset, medium -> high
      act(menu, 'apply').click();
      expect(menu.settings).toMatchObject({ auto: false, quality: 'high' });
      expect(cb.onAuto).toHaveBeenLastCalledWith(false);
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
    });

    it('each graphics row maps to a real setting and changes it on APPLY', () => {
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'high', fullscreen: null });
      menu.open();
      const ids = rows(menu).map((r) => r.dataset.id);
      expect(ids).toEqual(expect.arrayContaining(['g:fpsCap', 'g:resolution', 'g:nativeDpr', 'g:showFps', 'quality', 'autodetect', 'g:shadows', 'g:drawDistance', 'g:treeRange', 'g:crowd', 'g:traffic', 'g:aa', 'g:textures', 'g:ao', 'g:bloom', 'g:dof', 'g:vignette', 'g:grain', 'g:fov', 'master', 'radiovol', 'invert']));
      row(menu, 'g:ao').click(); row(menu, 'g:dof').click(); row(menu, 'g:bloom').click();
      row(menu, 'g:traffic').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(menu.graphics.effective('high')).toMatchObject({ ao: true, dof: true, bloom: true, traffic: 1 });
      act(menu, 'apply').click();
      expect(menu.graphics.effective('high')).toMatchObject({ ao: false, dof: false, bloom: false, traffic: 0.75 });
    });

    it('Controls reference follows the device and Reset position needs a second press', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, fullscreen: null });
      menu.open();
      expect(rows(menu).some((r) => r.textContent!.includes('Enter / exit car'))).toBe(true);
      menu.setInputMode('gamepad');
      expect(rows(menu).some((r) => r.textContent!.includes('Throttle'))).toBe(true);
      goto(menu, 'reset').click();
      expect(cb.onReset).not.toHaveBeenCalled();
      expect(row(menu, 'reset').textContent).toContain('PRESS AGAIN');
      row(menu, 'reset').click();
      expect(cb.onReset).toHaveBeenCalledTimes(1);
      expect(menu.isOpen).toBe(false);
    });

    it('Radio library reaches the host at once (it is an action, not a setting)', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null });
      menu.open();
      row(menu, 'radiolib').click();
      expect(cb.onRadioLibrary).toHaveBeenCalledTimes(1);
    });
  });

  describe('gamepad', () => {
    it('navigate(): up / down select, left / right change, confirm cycles / accepts, back asks then resumes', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', fullscreen: null });
      menu.navigate('down');
      expect(menu.pendingCount).toBe(0); // closed: inert
      menu.open();
      goto(menu, 'quality');
      menu.navigate('right');
      expect(val(menu, 'quality')).toBe('High');
      menu.navigate('left'); menu.navigate('left');
      expect(val(menu, 'quality')).toBe('Low');
      menu.navigate('down'); menu.navigate('down'); menu.navigate('confirm'); // shadows cycles to the next value
      expect(menu.pendingCount).toBe(2);
      for (let i = 0; i < 60 && menu.focusZone === 'list'; i++) menu.navigate('down');
      menu.navigate('confirm'); // APPLY
      expect(menu.pendingCount).toBe(0);
      expect(cb.onQuality).toHaveBeenLastCalledWith('low');
      menu.navigate('back');
      expect(menu.isOpen).toBe(false);
    });

    it('bumpers switch tabs through tab()', () => {
      const menu = new Menu(parent, {}, { storage: null });
      menu.open();
      menu.tab(1); expect(menu.tabName).toBe('radio');
      menu.tab(-1); expect(menu.tabName).toBe('settings');
    });
  });

  describe('persistence', () => {
    it('restores saved settings into the UI and pushes them to the game on construction', () => {
      const cb = cbs();
      const store = memStore({ [SETTINGS_KEY]: JSON.stringify({ quality: 'low', master: 0.3, radio: 0.8, invertY: true }) });
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'high' });
      expect(menu.settings).toEqual({ auto: false, quality: 'low', master: 0.3, radio: 0.8, invertY: true });
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
      press('ArrowLeft');
      expect(() => act(menu, 'apply').click()).not.toThrow();
      expect(menu.settings.quality).toBe('low');
    });

    it('graphics overrides persist and merge over the tier preset on the next start', () => {
      const store = memStore();
      const a = new Menu(parent, {}, { storage: store, initialQuality: 'medium', fullscreen: null });
      a.open();
      row(a, 'g:shadows').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      row(a, 'g:shadows').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      row(a, 'g:crowd').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      act(a, 'apply').click();
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
      menu.open();
      expect(row(menu, 'g:ao').hidden).toBe(false);
      menu.close();
      live = 'phone'; menu.open();
      for (const id of ['g:ao', 'g:dof', 'g:aa', 'g:nativeDpr']) expect(row(menu, id).hidden, id).toBe(true);
      expect(row(menu, 'g:shadows').querySelector('.gp-text')!.textContent).toBe('Blob');
    });

    it('Window Mode toggles full screen on APPLY; Esc out of full screen opens the pause menu', () => {
      const { fs, esc } = fakeFs();
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: fs, openOnPointerUnlock: false });
      menu.open();
      expect(val(menu, 'windowmode')).toBe('Windowed');
      row(menu, 'windowmode').click();
      expect(val(menu, 'windowmode')).toBe('Full screen');
      expect((fs as { toggle: unknown }).toggle).not.toHaveBeenCalled();
      act(menu, 'apply').click();
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
      menu.open();
      expect(row(menu, 'windowmode').hidden).toBe(true);
    });

    it('the install hint shows only when installable (hosted build)', () => {
      const hosted = new Menu(parent, {}, { storage: null, installable: true, fullscreen: null });
      hosted.open();
      expect(row(hosted, 'install').hidden).toBe(false);
      const plain = document.createElement('div'); document.body.appendChild(plain);
      const artifact = new Menu(plain, {}, { storage: null, installable: false, fullscreen: null });
      artifact.open();
      expect(artifact.root.querySelector<HTMLElement>('.gp-pane-settings [data-id="install"]')!.hidden).toBe(true);
      plain.remove();
    });

    it('Show FPS toggles the counter once applied', () => {
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: null });
      menu.open();
      const counter = parent.querySelector<HTMLElement>('.fps-counter')!;
      row(menu, 'g:showFps').click();
      expect(counter.hidden).toBe(true);
      act(menu, 'apply').click();
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

  it('on touch the list has 44 px arrows, the actions form a bar and the back arrow resumes', () => {
    const menu = new Menu(parent, {}, { storage: null, touch: true });
    menu.open();
    expect(menu.root.dataset.input).toBe('touch');
    expect(menu.root.querySelectorAll('.gp-act').length).toBe(3);
    row(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.r')!.click();
    menu.root.querySelector<HTMLButtonElement>('.gp-back')!.click();
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
    expect(new Set(seen)).toEqual(new Set<MenuTab>(['map', 'missions', 'stats', 'settings', 'radio']));
  });
});
