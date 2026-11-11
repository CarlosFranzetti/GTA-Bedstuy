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
    expect(ld.stageLabel).toBe('Materials (1/6)');
    ld.begin('materials');
    expect(ld.stageLabel).toBe('Materials (1/6)');
    expect(ld.progress).toBeCloseTo(0.5 / BOOT_STEPS.length);
    ld.done('materials'); ld.begin('textures');
    expect(ld.stageLabel).toBe('Textures (2/6)');
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
  it('draws only the first panel (and the next one a moment later), rotates every PANEL_MS, wraps', () => {
    const ld = new LoadingScreen(parent);
    expect(PANELS.length).toBeGreaterThanOrEqual(4);
    expect(PANELS.length).toBeLessThanOrEqual(6);
    expect(ld.panelIndex).toBe(0);
    expect(ld.drawnPanels).toBe(1);
    vi.advanceTimersByTime(700);
    expect(ld.drawnPanels).toBe(2);
    vi.advanceTimersByTime(PANEL_MS - 700);
    expect(ld.panelIndex).toBe(1);
    const canvases = [...parent.querySelectorAll('.ld-panel')];
    expect(canvases[1]?.classList.contains('on')).toBe(true);
    expect(canvases[0]?.classList.contains('out')).toBe(true);
    expect(canvases.filter((c) => c.classList.contains('on')).length).toBe(1);
    vi.advanceTimersByTime(PANEL_MS * (PANELS.length - 1));
    expect(ld.panelIndex).toBe(0);
    expect(ld.drawnPanels).toBe(PANELS.length);
    expect(parent.querySelector('.ld-cap-title')?.textContent).toBe(PANELS[0]?.caption);
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
