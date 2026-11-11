// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { savePosition, loadPosition, clearPosition, flushPosition, watchPagehide, SAVE_KEY } from '@/ui/SaveState';
import { Menu } from '@/ui/Menu';

const P = { x: 12.5, z: -40, heading: 1.2, hour: 17.25 };

describe('SaveState', () => {
  beforeEach(() => { localStorage.clear(); clearPosition(); });

  it('round-trips a position and uses the documented key', () => {
    savePosition(P, 0);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!)).toEqual(P);
    expect(loadPosition()).toEqual(P);
  });

  it('throttles to one write per 5 s and flush writes the latest', () => {
    savePosition(P, 0);
    savePosition({ ...P, x: 99 }, 4999);
    expect(loadPosition()!.x).toBe(12.5);
    savePosition({ ...P, x: 50 }, 5000);
    expect(loadPosition()!.x).toBe(50);
    savePosition({ ...P, x: 77 }, 5100);
    expect(loadPosition()!.x).toBe(50);
    flushPosition();
    expect(loadPosition()!.x).toBe(77);
  });

  it('pagehide flushes the latest state', () => {
    savePosition(P, 0);
    const off = watchPagehide(() => ({ ...P, z: 8 }));
    window.dispatchEvent(new Event('pagehide'));
    expect(loadPosition()!.z).toBe(8);
    off();
    window.dispatchEvent(new Event('pagehide'));
  });

  it('clearPosition removes it and drops pending state', () => {
    savePosition(P, 0);
    savePosition({ ...P, x: 1 }, 10);
    clearPosition();
    expect(loadPosition()).toBeNull();
    flushPosition();
    expect(loadPosition()).toBeNull();
  });

  it('rejects corrupt, partial or non-finite data', () => {
    localStorage.setItem(SAVE_KEY, '{oops');
    expect(loadPosition()).toBeNull();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ x: 1, z: 2 }));
    expect(loadPosition()).toBeNull();
    savePosition({ ...P, x: Number.NaN }, 0);
    expect(localStorage.getItem(SAVE_KEY)).toBe(JSON.stringify({ x: 1, z: 2 }));
  });

  it('never throws when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const rem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => { savePosition(P, 0); flushPosition(); clearPosition(); }).not.toThrow();
    expect(loadPosition()).toBeNull();
    get.mockRestore(); set.mockRestore(); rem.mockRestore();
  });

  it('menu Reset position clears the saved position', () => {
    savePosition(P, 0);
    const parent = document.createElement('div'); document.body.appendChild(parent);
    const onReset = vi.fn();
    const menu = new Menu(parent, { onReset }, { storage: null });
    menu.open();
    // Game category, Reset position row: the first press arms it, the second confirms
    const row = menu.root.querySelector<HTMLElement>('.gp-list [data-id="reset"]')!;
    row.click();
    expect(onReset).not.toHaveBeenCalled();
    row.click();
    expect(onReset).toHaveBeenCalled();
    expect(loadPosition()).toBeNull();
    parent.remove();
  });
});
