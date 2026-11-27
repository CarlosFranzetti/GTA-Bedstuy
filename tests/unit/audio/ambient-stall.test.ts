// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLoadingTheme } from '@/audio/loadingTheme';
import { createTitleTheme } from '@/audio/titleTheme';
import { createLoadingMusic } from '@/render/LoadingMusic';
import { TITLE_LOOKAHEAD } from '@/render/TitleMusic';

// A fake audio clock that records every start time, so a main-thread stall can be simulated: the clock keeps going, the sequencer's timer does not.
class Param {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; } linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; } setTargetAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  onended: (() => void) | null = null;
  constructor(public ctx: Clock) { ctx.nodes.push(this); }
  connect(d: unknown) { return d; } disconnect() { /* noop */ }
  start(t = 0) { this.ctx.starts.push(t); } stop() { /* noop */ } setPeriodicWave() { /* noop */ }
}
class Clock {
  nodes: Node[] = []; starts: number[] = [];
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new Node(this);
  private mk(extra: Record<string, unknown>) { return Object.assign(new Node(this), extra); }
  createOscillator() { return this.mk({ type: 'sine', frequency: new Param(), detune: new Param(), playbackRate: new Param() }); }
  createGain() { return this.mk({ gain: new Param() }); }
  createBiquadFilter() { return this.mk({ type: 'lowpass', frequency: new Param(), Q: new Param(), gain: new Param() }); }
  createBufferSource() { return this.mk({ buffer: null, loop: false, playbackRate: new Param() }); }
  createWaveShaper() { return this.mk({ curve: null, oversample: 'none' }); }
  createDynamicsCompressor() { return this.mk({ threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createConvolver() { return this.mk({ buffer: null }); }
  createDelay() { return this.mk({ delayTime: new Param() }); }
  createStereoPanner() { return this.mk({ pan: new Param() }); }
  createPeriodicWave() { return {}; }
  createBuffer(ch: number, len: number) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { length: len, duration: len / 8000, getChannelData: (c: number) => d[c] }; }
  resume = vi.fn(async () => undefined);
}

/** Runs a theme for `secs` of audio time with its timer ticking every 25 ms, except that the main thread is blocked from `stallAt` for `stallFor` seconds. Returns the biggest hole in the scheduled notes. */
function run(make: (ctx: Clock, dest: Node) => { start(): void; scheduleUntil(h: number): void }, lookAhead: number, secs: number, stallAt: number, stallFor: number): number {
  const ctx = new Clock();
  const th = make(ctx, new Node(ctx));
  th.start();
  for (let t = 0.025; t < secs; t += 0.025) {
    ctx.currentTime = t;
    if (t >= stallAt && t < stallAt + stallFor) continue; // the timer callback never ran
    th.scheduleUntil(t + lookAhead);
  }
  const s = [...new Set(ctx.starts.filter((x) => x > 0.1 && x < secs))].sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < s.length; i++) gap = Math.max(gap, s[i] - s[i - 1]);
  return gap;
}

const loading = (look: number) => (ctx: Clock, dest: Node) => createLoadingTheme(ctx as unknown as AudioContext, dest as unknown as AudioNode, { manual: true, lookAhead: look });
const title = (look: number) => (ctx: Clock, dest: Node) => createTitleTheme(ctx as unknown as AudioContext, dest as unknown as AudioNode, { manual: true, lookAhead: look });
afterEach(() => { vi.useRealTimers(); });

describe('a 2 s main-thread stall under the music sequencers', () => {
  it('opens a hole in the old loading theme at the lookaheads it had (0.1 s and 0.6 s)', () => {
    const base = run(loading(0.6), 0.6, 12, 99, 0);
    for (const look of [0.1, 0.6]) expect(run(loading(look), look, 12, 4, 2) - base).toBeGreaterThan(1);
  });
  it('leaves no hole in the title theme at the lookahead the game now uses', () => {
    const base = run(title(TITLE_LOOKAHEAD), TITLE_LOOKAHEAD, 14, 99, 0);
    expect(run(title(TITLE_LOOKAHEAD), TITLE_LOOKAHEAD, 14, 5, 2) - base).toBeLessThan(0.05);
  });
  it('still opens a hole in the title theme at the old 0.4 s lookahead (the test can see a stall)', () => {
    const base = run(title(0.4), 0.4, 14, 99, 0);
    expect(run(title(0.4), 0.4, 14, 5, 2) - base).toBeGreaterThan(1);
  });
  it('the title lookahead is at least 2.5 s', () => { expect(TITLE_LOOKAHEAD).toBeGreaterThanOrEqual(2.5); });
});

describe('loading music is silent by default', () => {
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  it('never loads the theme or makes an audio context, however many gestures', async () => {
    const load = vi.fn(async () => ({ createLoadingTheme: vi.fn() }));
    const makeContext = vi.fn(() => null);
    const m = createLoadingMusic({ load, makeContext });
    m.start(); m.start(); await flush();
    expect(load).not.toHaveBeenCalled();
    expect(makeContext).not.toHaveBeenCalled();
    expect(m.playing).toBe(false);
    expect(() => m.stop()).not.toThrow();
  });
  it('plays when asked for explicitly (the old behaviour, for comparison)', async () => {
    const theme = { start: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), playing: true };
    const m = createLoadingMusic({ enabled: true, load: async () => ({ createLoadingTheme: () => theme }), makeContext: () => ({ destination: {}, resume: async () => undefined, close: async () => undefined }) as unknown as AudioContext });
    m.start(); await flush();
    expect(theme.start).toHaveBeenCalledTimes(1);
  });
});
