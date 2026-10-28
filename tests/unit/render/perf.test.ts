import { describe, it, expect } from 'vitest';
import { FrameRing, PerfMonitor, heapGrowthMBPerMin, onePercentLowFps } from '@/render/Perf';
import { LoadingScreen, loadingProgress, withTimeout } from '@/render/Loading';

describe('FrameRing / onePercentLowFps', () => {
  it('is 0 when empty', () => { expect(onePercentLowFps(new FrameRing(10))).toBe(0); });
  it('steady 60 fps gives 60', () => {
    const r = new FrameRing(600);
    for (let i = 0; i < 600; i++) r.push(1000 / 60);
    expect(onePercentLowFps(r)).toBeCloseTo(60, 3);
  });
  it('averages the slowest 1% of frames', () => {
    const r = new FrameRing(600);
    for (let i = 0; i < 594; i++) r.push(10);  // 100 fps
    for (let i = 0; i < 6; i++) r.push(100);   // six 10 fps hitches = exactly 1%
    expect(onePercentLowFps(r)).toBeCloseTo(10, 3);
  });
  it('uses at least one frame and overwrites oldest samples', () => {
    const r = new FrameRing(4);
    for (const ms of [100, 10, 10, 10, 10]) r.push(ms); // the 100 ms frame has been overwritten
    expect(r.length).toBe(4);
    expect(onePercentLowFps(r)).toBeCloseTo(100, 3);
    r.push(50);
    expect(onePercentLowFps(r)).toBeCloseTo(20, 3);
  });
});

describe('PerfMonitor', () => {
  const make = (q: 'low' | 'medium' | 'high', autoDrop = true) => {
    let quality = q; const logs: string[] = [];
    const m = new PerfMonitor({ getQuality: () => quality, setQuality: (x) => { quality = x; }, autoDrop, log: (s) => logs.push(s) });
    return { m, logs, get q() { return quality; } };
  };
  it('drops medium to low once after 8 s when the 1% low is under 40 fps', () => {
    const t = make('medium');
    for (let i = 0; i < 400; i++) t.m.frame(1 / 30); // 13 s at 30 fps
    expect(t.q).toBe('low');
    expect(t.logs).toHaveLength(1);
    expect(t.m.droppedQuality).toBe(true);
  });
  it('does not drop before 8 s, at low/high, when disabled, or when fast enough', () => {
    const early = make('medium'); for (let i = 0; i < 200; i++) early.m.frame(1 / 30); expect(early.q).toBe('medium'); // 6.7 s
    const low = make('low'); for (let i = 0; i < 400; i++) low.m.frame(1 / 30); expect(low.q).toBe('low'); expect(low.logs).toHaveLength(0);
    const off = make('medium', false); for (let i = 0; i < 400; i++) off.m.frame(1 / 30); expect(off.q).toBe('medium');
    const fast = make('medium'); for (let i = 0; i < 900; i++) fast.m.frame(1 / 60); expect(fast.q).toBe('medium');
    expect(fast.m.fps1pctLow).toBeCloseTo(60, 0);
  });
  it('ignores multi-second stalls (tab switches)', () => {
    const t = make('medium');
    for (let i = 0; i < 700; i++) t.m.frame(i === 300 ? 5 : 1 / 60);
    expect(t.q).toBe('medium');
  });
});

describe('heapGrowthMBPerMin', () => {
  const MB = 1024 * 1024;
  it('needs two full windows', () => { expect(heapGrowthMBPerMin([{ t: 0, bytes: 1 }, { t: 10, bytes: 2 }])).toBe(0); });
  it('reports growth of the window floor, ignoring GC saw-teeth', () => {
    const flat = [], leak = [];
    for (let t = 0; t <= 60; t += 2) {
      const saw = (t % 10) * 5 * MB; // 0..45 MB saw-tooth
      flat.push({ t, bytes: 100 * MB + saw });
      leak.push({ t, bytes: 100 * MB + saw + t * 2 * MB }); // +2 MB/s = 120 MB/min
    }
    expect(Math.abs(heapGrowthMBPerMin(flat))).toBeLessThan(5);
    expect(heapGrowthMBPerMin(leak)).toBeGreaterThan(100);
  });
});

describe('Loading helpers', () => {
  it('progress counts done steps and half of the active one', () => {
    expect(loadingProgress(['done', 'active', 'pending', 'pending'])).toBeCloseTo(0.375, 6);
    expect(loadingProgress(['done', 'skipped'])).toBe(1);
  });
  it('withTimeout falls back after the delay and on rejection', async () => {
    expect(await withTimeout(new Promise<number>(() => {}), 20, -1)).toBe(-1);
    expect(await withTimeout(Promise.resolve(3), 20, -1)).toBe(3);
    expect(await withTimeout(Promise.reject(new Error('x')), 20, -1)).toBe(-1);
  });
  it('LoadingScreen type is constructible lazily (DOM only needed at construction)', () => {
    expect(typeof LoadingScreen).toBe('function');
  });
});
