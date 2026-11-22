// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu } from '@/ui/Menu';
import { chooseMap, currentMap, mapSwitchUrl } from '@/world/mapChoice';

describe('chooseMap', () => {
  it('hosted and native builds open the real streets unless asked otherwise', () => {
    expect(chooseMap(true, null)).toBe('real');
    expect(chooseMap(true, '')).toBe('real');
    expect(chooseMap(true, 'real')).toBe('real');
    expect(chooseMap(true, 'nonsense')).toBe('real');
    expect(chooseMap(true, 'grid')).toBe('grid');
    expect(chooseMap(true, 'classic')).toBe('grid');
  });
  it('a phone with no ?map= stays on the grid; an explicit ?map=real on a phone is honoured; desktop is unchanged', () => {
    expect(chooseMap(true, null, true)).toBe('grid');
    expect(chooseMap(true, '', true)).toBe('grid');
    expect(chooseMap(true, 'real', true)).toBe('real');
    expect(chooseMap(true, 'grid', true)).toBe('grid');
    expect(chooseMap(true, null, false)).toBe('real');
    expect(chooseMap(false, 'real', true)).toBe('grid');
  });
  it('the single-file build is always the grid, whatever the address says', () => {
    for (const p of [null, 'real', 'grid', 'classic']) expect(chooseMap(false, p)).toBe('grid');
  });
  it('reads a location search string', () => {
    expect(currentMap(true, '')).toBe('real');
    expect(currentMap(true, '?q=low&map=grid')).toBe('grid');
    expect(currentMap(true, '?map=real')).toBe('real');
    expect(currentMap(false, '?map=real')).toBe('grid');
    expect(currentMap(true, '', true)).toBe('grid');
    expect(currentMap(true, '?map=real', true)).toBe('real');
  });
});

describe('mapSwitchUrl', () => {
  it('sets or clears ?map= and keeps everything else', () => {
    expect(mapSwitchUrl('https://x.test/?q=low', 'grid')).toBe('https://x.test/?q=low&map=grid');
    expect(mapSwitchUrl('https://x.test/?q=low&map=grid#a', 'real')).toBe('https://x.test/?q=low#a');
    expect(mapSwitchUrl('https://x.test/', 'real')).toBe('https://x.test/');
    expect(mapSwitchUrl('https://x.test/?q=phone&map=grid', 'real', true)).toBe('https://x.test/?q=phone&map=real');
    expect(mapSwitchUrl('https://x.test/?map=real', 'grid')).toBe('https://x.test/?map=grid');
  });
});

describe('Menu "Map" row', () => {
  let parent: HTMLElement;
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent); });
  afterEach(() => { parent.remove(); });
  const row = (m: Menu) => m.root.querySelector<HTMLElement>('.gp-pane-settings .gp-list [data-id="map"]')!;

  it('is hidden where the real map is not built (the single-file build)', () => {
    const menu = new Menu(parent, {}, { storage: null, mapSwitch: { available: false, current: 'grid', go: () => undefined } });
    expect(row(menu).hidden).toBe(true);
  });
  it('is hidden in a test build with no hosted flag by default', () => {
    expect(row(new Menu(parent, {}, { storage: null })).hidden).toBe(true);
  });
  it('shows the current map and goes to the other one after a second press', () => {
    const go = vi.fn();
    const menu = new Menu(parent, {}, { storage: null, mapSwitch: { available: true, current: 'real', go } });
    menu.showGroup('map');
    expect(row(menu).hidden).toBe(false);
    expect(row(menu).textContent).toContain('Map');
    expect(row(menu).textContent).toContain('Real streets');
    row(menu).click();
    expect(go).not.toHaveBeenCalled();
    expect(row(menu).textContent).toContain('PRESS AGAIN for Classic grid');
    row(menu).click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0][0]).toMatch(/[?&]map=grid/);
  });
  it('on the grid it offers the real streets and drops ?map=', () => {
    const go = vi.fn();
    const menu = new Menu(parent, {}, { storage: null, mapSwitch: { available: true, current: 'grid', go } });
    expect(row(menu).textContent).toContain('Classic grid');
    row(menu).click(); row(menu).click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0][0]).not.toContain('map=');
  });
  it('reads the map in play from main.ts (a phone on the grid offers the real streets with an explicit ?map=real)', () => {
    (window as unknown as { __gtaMap?: unknown }).__gtaMap = { name: 'grid', handheld: true };
    try {
      const go = vi.fn();
      const menu = new Menu(parent, {}, { storage: null, mapSwitch: { available: true, current: 'grid', go, handheld: true } });
      row(menu).click(); row(menu).click();
      expect(go.mock.calls[0][0]).toContain('map=real');
    } finally { delete (window as unknown as { __gtaMap?: unknown }).__gtaMap; }
  });
});
