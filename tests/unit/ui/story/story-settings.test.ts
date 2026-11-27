// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { intimateOn, intimateRows, onIntimateChange, resetIntimateCache, setIntimate } from '@/ui/story/storySettings';

beforeEach(() => { localStorage.clear(); resetIntimateCache(); });
describe('Intimate scenes setting', () => {
  it('is On by default and remembers Off', () => {
    expect(intimateOn()).toBe(true);
    setIntimate(false);
    expect(intimateOn()).toBe(false);
    expect(localStorage.getItem('gta-bedstuy.intimate.v1')).toBe('0');
    resetIntimateCache();
    expect(intimateOn()).toBe(false); // read back from storage
    setIntimate(true); resetIntimateCache(); expect(intimateOn()).toBe(true);
  });
  it('works when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    resetIntimateCache();
    expect(intimateOn()).toBe(true);
    expect(() => setIntimate(false)).not.toThrow();
    expect(intimateOn()).toBe(false);
    spy.mockRestore(); set.mockRestore();
  });
  it('the Settings row is a toggle labelled "Intimate scenes", default On, that writes the setting and tells listeners', () => {
    const [row] = intimateRows();
    expect(row.label).toBe('Intimate scenes'); expect(row.kind).toBe('toggle'); expect(row.def?.()).toBe(true);
    const seen: boolean[] = []; const off = onIntimateChange((v) => seen.push(v));
    (row.set as (v: boolean) => void)(false);
    expect(row.get?.()).toBe(false); expect(seen).toEqual([false]);
    off(); (row.set as (v: boolean) => void)(true); expect(seen).toEqual([false]);
  });
});

import { ensureStoryStyle } from '@/ui/story/storyStyle';
describe('story stylesheet', () => {
  it('is put in the page once, as a style tag (not a CSS import, so it leaves the single-file build with the story switch off)', () => {
    ensureStoryStyle(document); ensureStoryStyle(document);
    expect(document.querySelectorAll('style#story-ui-style').length).toBe(1);
  });
});
