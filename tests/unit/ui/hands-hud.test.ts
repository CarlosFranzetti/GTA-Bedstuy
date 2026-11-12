// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Hud } from '@/ui/Hud';
import { HAND_ICONS } from '@/game/combat/icons';
import { HAND_ORDER } from '@/game/combat/items';

describe('the hands widget', () => {
  const setup = () => { const root = document.createElement('div'); document.body.appendChild(root); const hud = new Hud(root); return { root, hud, el: root.querySelector('.hud-hands') as HTMLElement }; };

  it('is hidden until it has something to show, and hidden again in a car', () => {
    const { hud, el } = setup();
    expect(el.hidden).toBe(true);
    hud.setHands({ item: 'fists', count: null, reserve: null, reloading: false });
    expect(el.hidden).toBe(false);
    hud.setHands(null);
    expect(el.hidden).toBe(true);
  });
  it('shows a drawn icon and the count; the pistol shows rounds over spares', () => {
    const { hud, el } = setup();
    hud.setHands({ item: 'bottle', count: 3, reserve: null, reloading: false });
    expect(el.querySelector('svg')).toBeTruthy();
    expect(el.querySelector('.hud-hands-count')!.textContent).toBe('3');
    hud.setHands({ item: 'pistol', count: 9, reserve: 12, reloading: false });
    expect(el.querySelector('.hud-hands-count')!.textContent).toBe('9/12');
    hud.setHands({ item: 'pistol', count: 0, reserve: 0, reloading: false });
    expect(el.classList.contains('empty')).toBe(true);
    hud.setHands({ item: 'fists', count: null, reserve: null, reloading: false });
    expect(el.querySelector('.hud-hands-count')!.textContent).toBe('');
  });
  it('a tap asks for the next item', () => {
    const { hud, el } = setup();
    const f = vi.fn(); hud.onCycleHands = f;
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('every item has its own drawn icon with no lettering', () => {
    const seen = new Set<string>();
    for (const k of HAND_ORDER) { expect(HAND_ICONS[k]).toContain('<svg'); expect(HAND_ICONS[k]).not.toContain('<text'); seen.add(HAND_ICONS[k]); }
    expect(seen.size).toBe(HAND_ORDER.length);
  });
});
