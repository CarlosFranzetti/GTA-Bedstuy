// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Credits } from '@/ui/Credits';
import { Hud } from '@/ui/Hud';
import { allPeople } from '@/ui/creditsData';

describe('Credits roll', () => {
  let parent: HTMLElement;
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent); });
  afterEach(() => { parent.remove(); });
  const key = (code: string, target: EventTarget = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));

  it('starts hidden, lists everyone, and opens / closes with callbacks', () => {
    const onOpen = vi.fn(), onClose = vi.fn();
    const c = new Credits(parent, { onOpen, onClose });
    expect(c.root.hidden).toBe(true);
    c.open();
    expect(c.isOpen).toBe(true);
    expect(c.root.hidden).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
    for (const p of allPeople()) expect(c.root.textContent, p.name).toContain(p.name);
    expect(c.root.textContent).toContain('AI agents');
    c.close();
    expect(c.root.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    c.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and Backspace, eats the key, and ignores keys while closed', () => {
    const c = new Credits(parent);
    const spy = vi.fn();
    window.addEventListener('keydown', spy);
    key('Escape');
    expect(spy).toHaveBeenCalledTimes(1); // closed: the key passes on to the pause menu
    c.open();
    key('Escape');
    expect(c.isOpen).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1); // swallowed while open
    c.open();
    key('Backspace');
    expect(c.isOpen).toBe(false);
    window.removeEventListener('keydown', spy);
  });

  it('closes with the close button and with gamepad B; other pad input is eaten while open', () => {
    const c = new Credits(parent);
    expect(c.navigate('back')).toBe(false);
    c.open();
    c.root.querySelector<HTMLButtonElement>('.cr-x')!.click();
    expect(c.isOpen).toBe(false);
    c.open();
    expect(c.navigate('down')).toBe(true);
    expect(c.isOpen).toBe(true);
    expect(c.navigate('back')).toBe(true);
    expect(c.isOpen).toBe(false);
  });

  it('does not let a press reach the overlay (it would start the game)', () => {
    const c = new Credits(parent);
    const seen = vi.fn();
    parent.addEventListener('pointerdown', seen);
    c.open();
    c.root.querySelector('.cr-x')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
  });

  it('is a plain list under reduced motion (no auto scroll)', () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    window.matchMedia = mm as never;
    const c = new Credits(parent);
    c.open();
    expect(c.root.classList.contains('cr-still')).toBe(true);
    expect(c.root.classList.contains('cr-auto')).toBe(false);
    c.dispose();
  });
});

describe('title screen hooks', () => {
  it('shows byline, PRESS START and a CREDITS button that does not start the game', () => {
    const root = document.createElement('div');
    const hud = new Hud(root);
    const onCredits = vi.fn(), onSplash = vi.fn(), start = vi.fn();
    hud.onCredits = onCredits; hud.onSplash = onSplash;
    root.addEventListener('pointerdown', start);
    const btn = root.querySelector<HTMLButtonElement>('.hud-credits')!;
    expect(root.querySelector('.hud-splash')!.textContent).toContain('Carlos Franzetti presents');
    btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    btn.click();
    expect(start).not.toHaveBeenCalled();
    expect(onCredits).toHaveBeenCalledTimes(1);
    hud.hideSplash();
    expect(onSplash).toHaveBeenLastCalledWith(false);
    hud.showSplash();
    expect(onSplash).toHaveBeenLastCalledWith(true);
  });
});
