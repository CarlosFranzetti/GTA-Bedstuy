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
  const cat = (m: Menu, id: string) => m.root.querySelector<HTMLElement>(`.gp-cats [data-id="cat:${id}"]`)!;
  const row = (m: Menu, id: string) => m.root.querySelector<HTMLElement>(`.gp-pane-settings .gp-opts [data-id="${id}"]`)!;
  const rows = (m: Menu) => [...m.root.querySelectorAll<HTMLElement>('.gp-pane-settings .gp-opts .gp-row')].filter((r) => !r.hidden);
  const hi = (m: Menu) => m.root.querySelector<HTMLElement>('.gp-pane-settings .gp-opts .gp-row.hi')!;
  /** opens the menu on a settings category with the focus in the options column */
  const enter = (m: Menu, id: string) => { m.open(); cat(m, id).click(); };

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

  it('is a labelled modal dialog and focuses the highlighted category on open', () => {
    const menu = new Menu(parent, {}, { storage: null });
    menu.open();
    expect(menu.root.getAttribute('role')).toBe('dialog');
    expect(menu.root.getAttribute('aria-modal')).toBe('true');
    expect(menu.root.hasAttribute('data-ui-modal')).toBe(true);
    expect(document.activeElement).toBe(cat(menu, 'display'));
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

  describe('settings: keyboard', () => {
    it('lists the eight categories', () => {
      const menu = new Menu(parent, {}, { storage: null });
      expect([...menu.root.querySelectorAll('.gp-cats .gp-lab')].map((n) => n.textContent)).toEqual(['Display', 'Graphics', 'Advanced Graphics', 'Audio', 'Controls', 'Camera', 'Radio / Voices', 'Game']);
    });

    it('up / down moves through categories (the options follow), right enters the options, Backspace returns', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null });
      menu.open();
      expect(menu.category).toBe('display');
      press('ArrowDown'); expect(menu.category).toBe('graphics');
      expect(row(menu, 'g:shadows')).not.toBeNull();
      expect(menu.focusColumn).toBe('cats');
      press('ArrowRight');
      expect(menu.focusColumn).toBe('opts');
      expect(hi(menu).dataset.id).toBe('quality');
      press('ArrowDown'); expect(hi(menu).dataset.id).toBe('g:shadows');
      press('ArrowUp'); press('ArrowUp'); expect(hi(menu).dataset.id).toBe('g:aa'); // wraps
      press('Backspace');
      expect(menu.focusColumn).toBe('cats');
      expect(menu.isOpen).toBe(true);
      press('Backspace'); // at the top level Backspace resumes
      expect(menu.isOpen).toBe(false);
    });

    it('left / right changes a segmented row, a slider and a toggle, calls the host and persists', () => {
      const cb = cbs();
      const store = memStore();
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'graphics');
      expect(hi(menu).dataset.id).toBe('quality');
      press('ArrowRight');
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
      expect(menu.settings.quality).toBe('high');
      press('ArrowLeft'); press('ArrowLeft');
      expect(cb.onQuality).toHaveBeenLastCalledWith('low');
      cat(menu, 'audio').click();
      press('ArrowLeft'); // master 100 -> 95
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.95);
      expect(row(menu, 'master').querySelector('.gp-text')!.textContent).toBe('95%');
      cat(menu, 'camera').click();
      press('ArrowDown'); // invert look Y
      expect(hi(menu).dataset.id).toBe('invert');
      expect(row(menu, 'invert').querySelector('.gp-text')!.textContent).toBe('OFF');
      press('ArrowRight');
      expect(cb.onInvertLookY).toHaveBeenLastCalledWith(true);
      expect(row(menu, 'invert').querySelector('.gp-text')!.textContent).toBe('ON');
      press('Enter'); // Enter toggles back
      expect(cb.onInvertLookY).toHaveBeenLastCalledWith(false);
      expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ quality: 'low', auto: false, master: 0.95, radio: 1, invertY: false });
    });

    it('the value arrows and a click on a row change values with the pointer', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'audio');
      row(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(0.95);
      row(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.r')!.click();
      expect(cb.onMasterVolume).toHaveBeenLastCalledWith(1);
      expect(row(menu, 'master').querySelector<HTMLButtonElement>('.gp-arrow.r')!.disabled).toBe(true);
      cat(menu, 'graphics').click();
      row(menu, 'quality').click(); // click cycles a segmented row
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
    });

    it('the highlighted row is marked (.hi) and the options list is the active column', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null });
      enter(menu, 'graphics');
      expect(hi(menu).dataset.id).toBe('quality');
      expect(menu.root.querySelector('.gp-opts.active')).not.toBeNull();
      expect(menu.root.querySelector('.gp-cats.active')).toBeNull();
      expect(menu.root.querySelector('.gp-cats.dim')).not.toBeNull();
    });

    it('Controls lists the controls of the device in use and follows a device change', () => {
      const menu = new Menu(parent, {}, { storage: null });
      menu.open();
      cat(menu, 'controls').click();
      expect(rows(menu).some((r) => r.textContent!.includes('Enter / exit car'))).toBe(true);
      expect(rows(menu).some((r) => r.textContent!.includes('LT'))).toBe(false);
      menu.setInputMode('gamepad');
      expect(rows(menu).some((r) => r.textContent!.includes('Throttle'))).toBe(true);
    });

    it('Reset position needs a second press and then calls onReset and closes', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null });
      enter(menu, 'game');
      row(menu, 'reset').click();
      expect(cb.onReset).not.toHaveBeenCalled();
      expect(row(menu, 'reset').textContent).toContain('PRESS AGAIN');
      row(menu, 'reset').click();
      expect(cb.onReset).toHaveBeenCalledTimes(1);
      expect(menu.isOpen).toBe(false);
    });

    it('Radio library calls the host', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null });
      enter(menu, 'radio');
      row(menu, 'radiolib').click();
      expect(cb.onRadioLibrary).toHaveBeenCalledTimes(1);
    });
  });

  describe('gamepad', () => {
    it('navigate(): up / down select, right enters, left / right change, confirm accepts, back steps out then resumes', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', fullscreen: null });
      menu.navigate('down'); // closed: inert
      expect(menu.category).toBe('display');
      menu.open();
      menu.navigate('down');
      expect(menu.category).toBe('graphics');
      menu.navigate('right');
      expect(menu.focusColumn).toBe('opts');
      menu.navigate('right');
      expect(cb.onQuality).toHaveBeenLastCalledWith('high');
      menu.navigate('left');
      expect(cb.onQuality).toHaveBeenLastCalledWith('medium');
      menu.navigate('down');
      menu.navigate('confirm'); // shadows cycles
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'high' }), ['shadows']);
      menu.navigate('back');
      expect(menu.focusColumn).toBe('cats');
      menu.navigate('confirm');
      expect(menu.focusColumn).toBe('opts');
      menu.navigate('back'); menu.navigate('back');
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
      menu.open(); cat(menu, 'audio').click();
      expect(row(menu, 'master').querySelector('.gp-text')!.textContent).toBe('30%');
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
      enter(menu, 'graphics');
      expect(() => press('ArrowLeft')).not.toThrow();
      expect(menu.settings.quality).toBe('low');
    });

    it('graphics overrides persist and merge over the tier preset on the next start', () => {
      const store = memStore();
      const a = new Menu(parent, {}, { storage: store, initialQuality: 'medium', fullscreen: null });
      a.graphics.set('shadows', 'off');
      a.graphics.set('crowd', 0.5);
      a.dispose();
      const cb = cbs();
      const b = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      expect(b.graphics.effective('medium')).toMatchObject({ shadows: 'off', crowd: 0.5, ao: true });
      expect(cb.onGraphics).toHaveBeenCalledWith(expect.objectContaining({ shadows: 'off', crowd: 0.5 }), expect.arrayContaining(['shadows', 'crowd']));
    });
  });

  describe('advanced graphics, auto, full screen', () => {
    it('applies a change live through onGraphics, persists it, marks the row and Reset clears it', () => {
      const cb = cbs();
      const store = memStore();
      const menu = new Menu(parent, cb, { storage: store, initialQuality: 'medium', fullscreen: null });
      enter(menu, 'graphics');
      expect(row(menu, 'g:shadows').classList.contains('is-custom')).toBe(false);
      row(menu, 'g:shadows').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click(); // medium -> low
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'low' }), ['shadows']);
      expect(JSON.parse(store.data['gta-bedstuy.graphics.v1']).overrides).toEqual({ shadows: 'low' });
      expect(row(menu, 'g:shadows').classList.contains('is-custom')).toBe(true);
      cat(menu, 'camera').click();
      press('ArrowRight'); // fov 64 -> 66
      expect(menu.graphics.effective('medium').fov).toBe(66);
      cat(menu, 'advanced').click();
      const reset = row(menu, 'gfxreset');
      expect(reset.textContent).toContain('2 changed');
      reset.click();
      expect(menu.graphics.hasOverrides).toBe(false);
      expect(cb.onGraphics).toHaveBeenLastCalledWith(expect.objectContaining({ shadows: 'medium', fov: 64 }), expect.arrayContaining(['shadows', 'fov']));
    });

    it('each advanced row maps to a real setting', () => {
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'high', fullscreen: null });
      enter(menu, 'advanced');
      const ids = rows(menu).map((r) => r.dataset.id);
      expect(ids).toEqual(['g:drawDistance', 'g:treeRange', 'g:crowd', 'g:traffic', 'g:ao', 'g:bloom', 'g:dof', 'g:vignette', 'g:grain', 'gfxreset']);
      row(menu, 'g:ao').click(); row(menu, 'g:dof').click(); row(menu, 'g:bloom').click();
      expect(menu.graphics.effective('high')).toMatchObject({ ao: false, dof: false, bloom: false });
      row(menu, 'g:traffic').querySelector<HTMLButtonElement>('.gp-arrow.l')!.click();
      expect(menu.graphics.effective('high').traffic).toBe(0.75);
    });

    it('hides rows the tier cannot do and follows the live tier on open', () => {
      let live: 'phone' | 'high' = 'high';
      const menu = new Menu(parent, cbs(), { storage: null, initialQuality: 'high', fullscreen: null, getQuality: () => live });
      menu.open(); cat(menu, 'advanced').click();
      expect(row(menu, 'g:ao').hidden).toBe(false);
      menu.close();
      live = 'phone'; menu.open();
      expect(row(menu, 'g:ao').hidden).toBe(true);
      expect(row(menu, 'g:dof').hidden).toBe(true);
      cat(menu, 'graphics').click();
      expect(row(menu, 'g:aa').hidden).toBe(true);
    });

    it('Auto selects the device tier and reports onAuto; a tier choice turns it off', () => {
      const cb = cbs();
      const menu = new Menu(parent, cb, { storage: null, initialQuality: 'medium', auto: true, fullscreen: null });
      enter(menu, 'graphics');
      const q = row(menu, 'quality');
      expect(q.querySelector('.gp-text')!.textContent).toBe('Auto (Medium)');
      press('ArrowRight');
      expect(cb.onAuto).toHaveBeenLastCalledWith(false);
      expect(menu.settings.auto).toBe(false);
      expect(cb.onQuality).toHaveBeenLastCalledWith('phone'); // the options run Auto, Phone, Low, Medium, High
      press('ArrowLeft');
      expect(menu.settings.auto).toBe(true);
      expect(cb.onAuto).toHaveBeenLastCalledWith(true);
      expect(cb.onQuality).toHaveBeenLastCalledWith('medium');
    });

    it('Full screen row toggles the control; Esc out of full screen opens the pause menu', () => {
      const { fs, esc } = fakeFs();
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: fs, openOnPointerUnlock: false });
      menu.open();
      const r = row(menu, 'fullscreen');
      expect(r.hidden).toBe(false);
      expect(r.querySelector('.gp-text')!.textContent).toBe('OFF');
      r.click();
      expect((fs as { toggle: unknown }).toggle).toHaveBeenCalled();
      expect(row(menu, 'fullscreen').querySelector('.gp-text')!.textContent).toBe('ON');
      menu.close();
      expect(menu.isOpen).toBe(false);
      esc();
      expect(menu.isOpen).toBe(true);
    });

    it('the Full screen row is hidden where the browser cannot do it', () => {
      const { fs } = fakeFs();
      (fs as { supported: boolean }).supported = false;
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: fs });
      menu.open();
      expect(row(menu, 'fullscreen').hidden).toBe(true);
    });

    it('the install hint shows only when installable (hosted build) and not already standalone', () => {
      const hostedMenu = new Menu(parent, {}, { storage: null, installable: true, fullscreen: null });
      hostedMenu.open();
      expect(row(hostedMenu, 'install').hidden).toBe(false);
      const plain = document.createElement('div'); document.body.appendChild(plain);
      const artifact = new Menu(plain, {}, { storage: null, installable: false, fullscreen: null });
      artifact.open();
      expect(artifact.root.querySelector<HTMLElement>('.gp-pane-settings .gp-opts [data-id="install"]')!.hidden).toBe(true);
      plain.remove();
    });

    it('Show FPS row toggles the counter', () => {
      const menu = new Menu(parent, cbs(), { storage: null, fullscreen: null });
      enter(menu, 'display');
      const counter = parent.querySelector<HTMLElement>('.fps-counter')!;
      expect(counter.hidden).toBe(true);
      row(menu, 'g:showFps').click();
      expect(counter.hidden).toBe(false);
      row(menu, 'g:showFps').click();
      expect(counter.hidden).toBe(true);
    });
  });

  describe('description panel', () => {
    const desc = (m: Menu) => m.root.querySelector('.gp-pane-settings .gp-desc')!;
    it('describes the highlighted option and shows GPU load bars for graphics options only', () => {
      const menu = new Menu(parent, {}, { storage: null, initialQuality: 'high', fullscreen: null });
      enter(menu, 'graphics');
      press('ArrowDown'); // Shadows
      expect(desc(menu).querySelector('.gp-desc-title')!.textContent).toBe('Shadows');
      expect(desc(menu).querySelector('.gp-desc-text')!.textContent).toContain('sun shadows');
      expect(desc(menu).querySelector<HTMLElement>('.gp-gpu')!.hidden).toBe(false);
      const own = () => parseInt(desc(menu).querySelector<HTMLElement>('.gp-meter.thin i')!.style.width, 10);
      const total = () => parseInt(desc(menu).querySelector<HTMLElement>('.gp-meter:not(.thin) i')!.style.width, 10);
      const before = total();
      expect(own()).toBe(100); // high shadows: the heaviest value of this setting
      press('ArrowLeft'); press('ArrowLeft'); press('ArrowLeft'); press('ArrowLeft'); // high -> off
      expect(own()).toBe(0);
      expect(total()).toBeLessThan(before);
      cat(menu, 'audio').click();
      expect(desc(menu).querySelector<HTMLElement>('.gp-gpu')!.hidden).toBe(true);
      expect(desc(menu).querySelector('.gp-desc-title')!.textContent).toBe('Master volume');
    });

    it('category rows describe the category (and graphics categories show the total load)', () => {
      const menu = new Menu(parent, {}, { storage: null, fullscreen: null });
      menu.open();
      press('ArrowDown'); press('ArrowDown');
      expect(desc(menu).querySelector('.gp-desc-title')!.textContent).toBe('Advanced Graphics');
      expect(desc(menu).querySelector<HTMLElement>('.gp-gpu')!.hidden).toBe(false);
      press('ArrowDown');
      expect(desc(menu).querySelector<HTMLElement>('.gp-gpu')!.hidden).toBe(true);
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

  it('on touch the settings are one column: tapping a category shows its options, the back arrow returns', () => {
    const menu = new Menu(parent, {}, { storage: null, touch: true });
    menu.open();
    const pane = menu.root.querySelector<HTMLElement>('.gp-pane-settings')!;
    expect(pane.dataset.view).toBe('cats');
    cat(menu, 'audio').click();
    expect(pane.dataset.view).toBe('opts');
    expect(menu.root.querySelector<HTMLElement>('.gp-back')!.dataset.mode).toBe('back');
    menu.root.querySelector<HTMLButtonElement>('.gp-back')!.click();
    expect(pane.dataset.view).toBe('cats');
    expect(menu.isOpen).toBe(true);
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
