import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTitleMusic } from '@/render/TitleMusic';

function theme() {
  return { start: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), playing: false };
}
function fakeCtx(state = 'running') {
  return { state, destination: {}, resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) } as unknown as AudioContext & { resume: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); });

describe('TitleMusic wrapper', () => {
  it('lazy-loads the theme on start, builds a context and starts the tune', async () => {
    const th = theme(); const factory = vi.fn(() => th); const ctx = fakeCtx();
    const load = vi.fn(async () => ({ createTitleTheme: factory }));
    const m = createTitleMusic({ load, makeContext: () => ctx, unlockTarget: null });
    expect(load).not.toHaveBeenCalled();
    m.start(); m.start();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(th.start).toHaveBeenCalledTimes(1);
  });
  it('stop fades the theme, closes the context after the fade, and the music can start again', async () => {
    vi.useFakeTimers();
    const th = theme(); const ctxs = [fakeCtx(), fakeCtx()];
    const m = createTitleMusic({ load: async () => ({ createTitleTheme: () => th }), makeContext: () => ctxs.shift()!, unlockTarget: null });
    m.start(); await flush();
    m.stop(3);
    expect(th.stop).toHaveBeenCalledWith(3);
    vi.advanceTimersByTime(2000);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(vi.getTimerCount()).toBe(0);
    m.start(); await flush();
    expect(th.start).toHaveBeenCalledTimes(2);
  });
  it('a stop that arrives while the module loads means the tune never starts', async () => {
    const th = theme(); let release: (v: { createTitleTheme: unknown }) => void = () => undefined;
    const makeContext = vi.fn(() => fakeCtx());
    const m = createTitleMusic({ load: () => new Promise((r) => { release = r; }), makeContext, unlockTarget: null });
    m.start(); m.stop(0);
    release({ createTitleTheme: () => th });
    await flush();
    expect(th.start).not.toHaveBeenCalled();
    expect(makeContext).not.toHaveBeenCalled();
  });
  it('is silent and safe without Web Audio, with a broken module, or when the factory throws', async () => {
    for (const o of [
      { load: async () => ({ createTitleTheme: () => theme() }), makeContext: () => null },
      { load: async () => ({}), makeContext: () => fakeCtx() },
      { load: async () => { throw new Error('boom'); }, makeContext: () => fakeCtx() },
      { load: async () => ({ createTitleTheme: () => { throw new Error('boom'); } }), makeContext: () => fakeCtx() },
    ]) {
      const m = createTitleMusic({ ...o, unlockTarget: null });
      expect(() => m.start()).not.toThrow();
      await flush();
      expect(m.playing).toBe(false);
      expect(() => m.stop(0)).not.toThrow();
    }
  });
  it('resumes a locked context on the first gesture and removes its listeners afterwards', async () => {
    const ctx = fakeCtx('suspended'); const th = theme();
    const handlers = new Map<string, () => void>();
    const target = { addEventListener: vi.fn((e: string, f: () => void) => { handlers.set(e, f); }), removeEventListener: vi.fn((e: string) => { handlers.delete(e); }) };
    const m = createTitleMusic({ load: async () => ({ createTitleTheme: () => th }), makeContext: () => ctx, unlockTarget: target });
    m.start(); await flush();
    expect(th.start).toHaveBeenCalled(); // never throws while locked
    expect(handlers.size).toBeGreaterThan(0);
    (ctx as unknown as { state: string }).state = 'running';
    handlers.get('pointerdown')!();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(handlers.size).toBe(0);
  });
  it('passes the volume option to the theme', async () => {
    const th = theme(); const factory = vi.fn(() => th);
    const m = createTitleMusic({ volume: 0.3, load: async () => ({ createTitleTheme: factory }), makeContext: () => fakeCtx(), unlockTarget: null });
    m.start(); await flush();
    expect((factory.mock.calls[0] as unknown[])[2]).toMatchObject({ volume: 0.3 });
  });
});
