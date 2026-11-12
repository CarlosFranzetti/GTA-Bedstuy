// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoadingScreen, BOOT_STEPS, PANEL_MS, TIP_MS, LOADING_TIPS } from '@/render/Loading';
import { BACKDROPS } from '@/ui/backdrops';

let parent: HTMLElement;
/** Stand-in for window.Image: every file whose name is in `okFiles` fires onload (async, like a real load), the rest fire onerror. */
let okFiles: Set<string>;
class FakeImage {
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  set src(url: string) { const ok = [...okFiles].some((f) => url.endsWith(`art/${f}`)); setTimeout(() => (ok ? this.onload : this.onerror)?.(), 10); }
}
beforeEach(() => { vi.useFakeTimers(); okFiles = new Set(); vi.stubGlobal('Image', FakeImage); (window as unknown as { Image: unknown }).Image = FakeImage; parent = document.createElement('div'); document.body.appendChild(parent); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); parent.remove(); });

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
  const shownFile = (ld: LoadingScreen): string | undefined => BACKDROPS[ld.shotIndex]?.file;
  const front = (): HTMLImageElement | null => parent.querySelector('.ld-shot.on');

  it('has no cartoon panels or diagonal slots', () => {
    new LoadingScreen(parent);
    expect(parent.querySelector('canvas')).toBeNull();
    expect(parent.querySelector('.ld-slot, .ld-slotwrap, .ld-caption')).toBeNull();
    expect(BACKDROPS.length).toBe(5);
  });
  it('with no art files (single-file build) shows the dark backdrop and keeps working', () => {
    const ld = new LoadingScreen(parent);
    vi.advanceTimersByTime(50);
    expect(ld.loadedShots).toBe(0);
    expect(ld.shotIndex).toBe(-1);
    expect(front()).toBeNull();
    vi.advanceTimersByTime(PANEL_MS * 3);
    expect(ld.shotIndex).toBe(-1);
    expect(parent.querySelector('.ld-logo-b')?.textContent).toBe('BED-STUY');
    expect(parent.querySelector('.ld-fill')).not.toBeNull();
  });
  it('shows the first shot that loads at once, then crossfades through the loaded ones in order', () => {
    okFiles = new Set(BACKDROPS.slice(0, 3).map((b) => b.file));
    const ld = new LoadingScreen(parent);
    vi.advanceTimersByTime(20);
    expect(ld.loadedShots).toBe(3);
    expect(shownFile(ld)).toBe(BACKDROPS[0]!.file);
    const first = front()!;
    expect(first.src).toContain(`art/${BACKDROPS[0]!.file}`);
    vi.advanceTimersByTime(PANEL_MS);
    expect(shownFile(ld)).toBe(BACKDROPS[1]!.file);
    const second = front()!;
    expect(second).not.toBe(first); // the other layer fades in over the first
    expect(first.classList.contains('on')).toBe(false);
    vi.advanceTimersByTime(PANEL_MS * 2);
    expect(shownFile(ld)).toBe(BACKDROPS[0]!.file); // wraps
  });
  it('one shot alone never swaps', () => {
    okFiles = new Set([BACKDROPS[2]!.file]);
    const ld = new LoadingScreen(parent);
    vi.advanceTimersByTime(PANEL_MS * 3);
    expect(ld.shotIndex).toBe(2);
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
    expect(ld.shotIndex).toBe(-1);
  });
  it('clicking the chip counts as the gesture', () => {
    const onFirstGesture = vi.fn();
    new LoadingScreen(parent, BOOT_STEPS, document, { onFirstGesture });
    (parent.querySelector('.ld-sound') as HTMLElement).click();
    expect(onFirstGesture).toHaveBeenCalledTimes(1);
  });
});
