// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoadingScreen, BOOT_STEPS, PANEL_MS, TIP_MS, LOADING_TIPS } from '@/render/Loading';
import { PANELS } from '@/render/loadingArt';

let parent: HTMLElement;
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); parent = document.createElement('div'); document.body.appendChild(parent); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); parent.remove(); });

describe('LoadingScreen stages', () => {
  it('shows the active stage with n/total and tracks progress', () => {
    const ld = new LoadingScreen(parent);
    expect(ld.progress).toBe(0);
    expect(ld.stageLabel).toBe('Streets');
    ld.begin('materials');
    expect(ld.stageLabel).toBe('Streets');
    expect(ld.progress).toBeCloseTo(0.5 / 13);
    expect(ld.percent).toBe(4);
    ld.done('materials'); ld.begin('textures');
    expect(ld.stageLabel).toBe('Signs & paint');
    for (const s of BOOT_STEPS) ld.done(s.id);
    expect(ld.progress).toBe(1);
    expect(ld.stageLabel).toBe('Ready');
    expect(ld.root.getAttribute('aria-valuenow')).toBe('100');
    expect((ld.root.querySelector('.ld-fill') as HTMLElement).style.width).toBe('100%');
  });
  it('shows a warning line for skipped steps', () => {
    const ld = new LoadingScreen(parent);
    ld.skip('textures', 'Textures are still loading');
    expect(ld.stateOf('textures')).toBe('skipped');
    expect(ld.root.querySelector('.ld-note')?.textContent).toBe('Textures are still loading');
  });
});

describe('LoadingScreen panels and tips', () => {
  it('shows three distinct diagonal panels and swaps one slot at a time', () => {
    const ld = new LoadingScreen(parent);
    expect(PANELS.length).toBeGreaterThanOrEqual(4);
    expect(PANELS.length).toBeLessThanOrEqual(6);
    expect(ld.drawnPanels).toBe(3);
    expect(new Set(ld.visiblePanels).size).toBe(3);
    vi.advanceTimersByTime(PANEL_MS / 3);
    expect(ld.visiblePanels).toEqual([3, 1, 2]);
    const on = [...parent.querySelectorAll('.ld-panel.on')];
    expect(on.length).toBe(3); // one front canvas per slot
    vi.advanceTimersByTime(PANEL_MS * 3);
    expect(new Set(ld.visiblePanels).size).toBe(3);
    expect(ld.percent).toBe(0);
  });
  it('rotates tips', () => {
    const ld = new LoadingScreen(parent);
    expect(ld.tipText).toBe(LOADING_TIPS[0]);
    vi.advanceTimersByTime(TIP_MS);
    expect(ld.tipText).toBe(LOADING_TIPS[1]);
  });
  it('keeps the fan-tribute disclaimer', () => {
    new LoadingScreen(parent);
    expect(parent.querySelector('.ld-disclaimer')?.textContent).toMatch(/fan tribute.*Rockstar Games.*Take-Two/s);
  });
});

describe('LoadingScreen hooks', () => {
  it('fires onShow at once, onFirstGesture once on the first input (hiding the sound chip), onHide on hide', async () => {
    const onShow = vi.fn(); const onFirstGesture = vi.fn(); const onHide = vi.fn();
    const ld = new LoadingScreen(parent, BOOT_STEPS, document, { onShow, onFirstGesture, onHide });
    expect(onShow).toHaveBeenCalledTimes(1);
    const chip = parent.querySelector('.ld-sound') as HTMLElement;
    expect(chip.textContent).toBe('Click for sound');
    expect(chip.hidden).toBe(false);
    expect(ld.soundUnlocked).toBe(false);
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(onFirstGesture).toHaveBeenCalledTimes(1);
    expect(chip.hidden).toBe(true);
    expect(ld.soundUnlocked).toBe(true);
    const done = ld.hide(200);
    expect(onHide).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    await done;
    expect(document.getElementById('loading')).toBeNull();
    // timers stopped: nothing throws or rotates after removal
    vi.advanceTimersByTime(PANEL_MS * 3);
    expect(ld.panelIndex).toBe(0);
  });
  it('clicking the chip counts as the gesture', () => {
    const onFirstGesture = vi.fn();
    new LoadingScreen(parent, BOOT_STEPS, document, { onFirstGesture });
    (parent.querySelector('.ld-sound') as HTMLElement).click();
    expect(onFirstGesture).toHaveBeenCalledTimes(1);
  });
});
