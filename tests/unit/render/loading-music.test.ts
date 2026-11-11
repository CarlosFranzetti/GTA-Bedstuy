// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLoadingMusic } from '@/render/LoadingMusic';

const fakeCtx = () => ({ destination: {} as AudioNode, resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('createLoadingMusic', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts the theme on the first gesture, once, and stops it with a fade, then frees the context', async () => {
    const theme = { start: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), playing: true };
    const factory = vi.fn(() => theme);
    const ctx = fakeCtx();
    const m = createLoadingMusic({ load: async () => ({ createLoadingTheme: factory }), makeContext: () => ctx as unknown as AudioContext, volume: 0.7 });
    m.start(); m.start();
    await flush();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(ctx, ctx.destination, expect.objectContaining({ volume: 0.7 }));
    expect(theme.start).toHaveBeenCalledTimes(1);
    expect(m.playing).toBe(true);
    m.stop(0.8);
    expect(theme.stop).toHaveBeenCalledWith(0.8);
    vi.advanceTimersByTime(1200);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the theme module is missing or incomplete', async () => {
    const make = vi.fn();
    const a = createLoadingMusic({ load: async () => ({}), makeContext: make });
    a.start(); await flush();
    expect(a.available).toBe(false);
    expect(make).not.toHaveBeenCalled();
    const b = createLoadingMusic({ load: async () => { throw new Error('missing'); }, makeContext: make });
    expect(() => b.start()).not.toThrow();
    await flush();
    expect(b.playing).toBe(false);
    expect(() => b.stop()).not.toThrow();
  });

  it('does nothing without Web Audio', async () => {
    const factory = vi.fn();
    const m = createLoadingMusic({ load: async () => ({ createLoadingTheme: factory }), makeContext: () => null });
    m.start(); await flush();
    expect(factory).not.toHaveBeenCalled();
  });

  it('a stop that arrives before the module has loaded means the tune never starts', async () => {
    const factory = vi.fn();
    const ctx = fakeCtx();
    const m = createLoadingMusic({ load: async () => ({ createLoadingTheme: factory }), makeContext: () => ctx as unknown as AudioContext });
    m.start();
    m.stop();
    await flush();
    expect(factory).not.toHaveBeenCalled();
    m.start(); await flush();
    expect(factory).not.toHaveBeenCalled();
  });

  it('survives a theme that throws', async () => {
    const ctx = fakeCtx();
    const m = createLoadingMusic({ load: async () => ({ createLoadingTheme: () => { throw new Error('boom'); } }), makeContext: () => ctx as unknown as AudioContext });
    expect(() => m.start()).not.toThrow();
    await flush();
    vi.advanceTimersByTime(500);
    expect(ctx.close).toHaveBeenCalled();
    expect(m.playing).toBe(false);
  });
});
