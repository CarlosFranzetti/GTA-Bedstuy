import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BAR_CHORDS, BAR_PLANS, BAR_SEC, BASS, CHORDS, CHOP, HOOK, INTRO_PLANS, INTRO_SEC, INTRO_STEPS, KEY_PCS, LOOP_BARS, LOOP_SEC, LOOP_STEPS, SCRATCH,
  STEP_SEC, SWING, TITLE_BPM, ceilingCurve, createTitleTheme, makeCrackle, makeVowel, planForBar, rnd, satCurve, stepPosition, stepTime,
} from '@/audio/titleTheme';

class Param {
  value = 0;
  constructor(private ctx: FakeCtx) {}
  private at(t: number, what: string) { if (t < this.ctx.currentTime - 1e-9) this.ctx.late.push(`${what}@${t.toFixed(4)}<${this.ctx.currentTime.toFixed(4)}`); }
  setValueAtTime(v: number, t: number) { this.at(t, 'set'); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.at(t, 'lin'); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.at(t, 'exp'); this.value = v; return this; }
  setTargetAtTime(v: number, t: number) { this.at(t, 'tgt'); this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  conns = 0; disconnected = 0; starts: number[] = []; stops: number[] = [];
  onended: (() => void) | null = null;
  constructor(public ctx: FakeCtx) { ctx.nodes.push(this); }
  connect(d: unknown) { this.conns++; return d; }
  disconnect() { this.disconnected++; }
  start(t = 0) { if (t < this.ctx.currentTime - 1e-9) this.ctx.late.push(`start@${t}`); this.starts.push(t); }
  stop(t = 0) { if (t < this.ctx.currentTime - 1e-9) this.ctx.late.push(`stop@${t}`); this.stops.push(t); }
  setPeriodicWave() { /* noop */ }
}
class FakeCtx {
  nodes: Node[] = []; late: string[] = [];
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new Node(this);
  private mk(extra: Record<string, unknown>) { const n = new Node(this) as Node & Record<string, unknown>; Object.assign(n, extra); return n; }
  createOscillator() { return this.mk({ type: 'sine', frequency: new Param(this), detune: new Param(this), playbackRate: new Param(this) }); }
  createGain() { return this.mk({ gain: new Param(this) }); }
  createBiquadFilter() { return this.mk({ type: 'lowpass', frequency: new Param(this), Q: new Param(this), gain: new Param(this) }); }
  createBufferSource() { return this.mk({ buffer: null, loop: false, playbackRate: new Param(this) }); }
  createWaveShaper() { return this.mk({ curve: null, oversample: 'none' }); }
  createDynamicsCompressor() { return this.mk({ threshold: new Param(this), knee: new Param(this), ratio: new Param(this), attack: new Param(this), release: new Param(this) }); }
  createConvolver() { return this.mk({ buffer: null }); }
  createDelay() { return this.mk({ delayTime: new Param(this) }); }
  createStereoPanner() { return this.mk({ pan: new Param(this) }); }
  createPeriodicWave() { return {}; }
  createBuffer(ch: number, len: number) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { length: len, getChannelData: (c: number) => d[c] }; }
  resume = vi.fn(async () => undefined);
}
function setup(opts = {}) {
  const ctx = new FakeCtx();
  const dest = new Node(ctx);
  const th = createTitleTheme(ctx as unknown as AudioContext, dest as unknown as AudioNode, opts);
  return { ctx, dest, th };
}
const inKey = (m: number) => KEY_PCS.includes(((m % 12) + 12) % 12);
afterEach(() => { vi.useRealTimers(); });

describe('timing math', () => {
  it('sits at 86..94 BPM with swung sixteenths and derives loop length from the grid', () => {
    expect(TITLE_BPM).toBeGreaterThanOrEqual(86);
    expect(TITLE_BPM).toBeLessThanOrEqual(94);
    expect(STEP_SEC).toBeCloseTo(60 / TITLE_BPM / 4, 9);
    expect(BAR_SEC).toBeCloseTo(STEP_SEC * 16, 9);
    expect([16, 32]).toContain(LOOP_BARS as number);
    expect(LOOP_SEC).toBeCloseTo(LOOP_STEPS * STEP_SEC, 9);
    expect(INTRO_SEC).toBeCloseTo(INTRO_STEPS * STEP_SEC, 9);
    expect(LOOP_SEC).toBeGreaterThan(60);
    expect(SWING).toBeGreaterThan(0.1);
    expect(SWING).toBeLessThan(0.34);
    expect(stepTime(1, 16)).toBeCloseTo(1 + BAR_SEC, 9);
  });
  it('plays the intro once then wraps the loop', () => {
    expect(stepPosition(0)).toEqual({ intro: true, bar: 0, step: 0, loop: -1 });
    expect(stepPosition(INTRO_STEPS - 1)).toEqual({ intro: true, bar: 3, step: 15, loop: -1 });
    expect(stepPosition(INTRO_STEPS)).toEqual({ intro: false, bar: 0, step: 0, loop: 0 });
    expect(stepPosition(INTRO_STEPS + LOOP_STEPS - 1)).toEqual({ intro: false, bar: LOOP_BARS - 1, step: 15, loop: 0 });
    expect(stepPosition(INTRO_STEPS + LOOP_STEPS)).toEqual({ intro: false, bar: 0, step: 0, loop: 1 });
    expect(stepPosition(INTRO_STEPS + LOOP_STEPS * 2 + 40)).toEqual({ intro: false, bar: 2, step: 8, loop: 2 });
  });
});

describe('arrangement and note data', () => {
  it('has a chord and a plan for each loop bar and the four intro bars', () => {
    expect(BAR_CHORDS).toHaveLength(LOOP_BARS);
    expect(BAR_PLANS).toHaveLength(LOOP_BARS);
    expect(INTRO_PLANS).toHaveLength(4);
    expect(planForBar(LOOP_BARS + 5)).toEqual(planForBar(5));
    expect(INTRO_PLANS[0].kick).toEqual([]);
    expect(INTRO_PLANS[3].kick.length).toBeGreaterThan(0);
    expect(INTRO_PLANS[3].scratch).toBeGreaterThanOrEqual(0);
  });
  it('varies across the loop: hook only in some sections, breakdown without snare, scratches on turnarounds, stop-time at the end', () => {
    expect(BAR_PLANS[0].hook).toBe(0);
    expect(BAR_PLANS[4].hook).toBe(1);
    expect(BAR_PLANS[20].hook).toBe(2);
    expect(BAR_PLANS.slice(16, 20).every((p) => !p.snare)).toBe(true);
    expect(BAR_PLANS[19].roll).toBe(true);
    for (const b of [11, 15, 19, 27, 31]) expect(BAR_PLANS[b].scratch, `bar ${b}`).toBeGreaterThanOrEqual(0);
    expect(BAR_PLANS[31].end).toBeLessThan(16);
    expect(new Set(BAR_PLANS.map((p) => p.kick.join())).size).toBeGreaterThanOrEqual(3);
    expect(new Set(BAR_PLANS.map((p) => p.bass)).size).toBeGreaterThanOrEqual(3);
  });
  it('keeps every chord, bass note and the hook in key, in range, never overlapping', () => {
    for (const c of Object.values(CHORDS)) for (const m of c.keys) expect(inKey(m)).toBe(true);
    for (const pat of BASS) {
      let end = 0;
      for (const [step, off, len] of pat) {
        expect(step).toBeGreaterThanOrEqual(end);
        end = step + len;
        expect(end).toBeLessThanOrEqual(16);
        for (const c of Object.values(CHORDS)) { const m = c.root + off; expect(inKey(m)).toBe(true); expect(m).toBeGreaterThanOrEqual(28); expect(m).toBeLessThanOrEqual(56); }
      }
    }
    expect(BASS.some((p) => p.some((n) => n[3] === 1))).toBe(true); // slides exist
    expect(HOOK).toHaveLength(4);
    HOOK.forEach((bar, i) => {
      let end = 0;
      for (const [s, m, len] of bar) { expect(inKey(m)).toBe(true); expect(m).toBeGreaterThanOrEqual(60); expect(m).toBeLessThanOrEqual(84); expect(s).toBeGreaterThanOrEqual(end); end = s + len; expect(end).toBeLessThanOrEqual(16); }
      const longest = [...bar].sort((a, b) => b[2] - a[2])[0];
      expect(Object.values(CHORDS)[i].keys.length).toBeGreaterThan(0);
      expect(longest[1]).toBeGreaterThan(0);
    });
    for (const pat of CHOP) for (const [s, g, v] of pat) { expect(s + g).toBeLessThanOrEqual(16); expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
    for (const g of SCRATCH) for (const [s, l, r0, r1] of g) { expect(s + l).toBeLessThanOrEqual(16.001); expect(r0).toBeGreaterThan(0); expect(r1).toBeGreaterThan(0); }
  });
});

describe('pure DSP helpers', () => {
  it('ceiling never exceeds -1 dBFS; saturation stays inside full scale', () => {
    expect(Math.max(...Array.from(ceilingCurve()).map(Math.abs))).toBeLessThan(0.8913);
    expect(Math.max(...Array.from(satCurve()).map(Math.abs))).toBeLessThanOrEqual(1.0001);
  });
  it('builds deterministic, finite crackle and vowel buffers', () => {
    const a = makeCrackle(8000, 1), b = makeCrackle(8000, 1);
    expect(Array.from(a.slice(0, 50))).toEqual(Array.from(b.slice(0, 50)));
    expect(a.every(Number.isFinite)).toBe(true);
    const v = makeVowel(8000, 0.2);
    expect(v.every(Number.isFinite)).toBe(true);
    expect(Math.max(...Array.from(v).map(Math.abs))).toBeLessThanOrEqual(1.0001);
    expect(v[0]).toBeCloseTo(0, 3);
    const r = rnd(5);
    expect(r).toBe(rnd(5));
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });
});

describe('scheduler', () => {
  it('schedules about 100 ms ahead on a 25 ms timer and never in the past, even after a long stall', () => {
    vi.useFakeTimers();
    const { ctx, th } = setup();
    th.start();
    expect(th.playing).toBe(true);
    expect(Math.max(...ctx.nodes.flatMap((n) => n.starts))).toBeLessThanOrEqual(ctx.currentTime + 0.1 + 0.5);
    for (let i = 0; i < 40; i++) { ctx.currentTime += 0.025; vi.advanceTimersByTime(25); }
    ctx.currentTime += 4.2; vi.advanceTimersByTime(25);
    for (let i = 0; i < 20; i++) { ctx.currentTime += 0.025; vi.advanceTimersByTime(25); }
    expect(ctx.late).toEqual([]);
    th.stop(0);
  });
  it('lands the step-0 kick on the beat grid and wraps the loop without a gap', () => {
    const { ctx, th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(INTRO_SEC + LOOP_SEC + 8);
    // kicks are sine voices of 0.45 s whose frequency starts at 150 Hz
    const kicks = ctx.nodes.filter((n) => (n as unknown as { type?: string }).type === 'sine' && n.stops.length && Math.abs(n.stops[0] - n.starts[0] - 0.45) < 1e-6).map((n) => n.starts[0]);
    expect(kicks.length).toBeGreaterThan(100);
    const beat = (t: number) => (t - 0.06) / (BAR_SEC / 4);
    const onBar = kicks.filter((t) => Math.abs(beat(t) / 4 - Math.round(beat(t) / 4)) < 1e-6); // step 0 kicks
    expect(onBar.length).toBeGreaterThan(30);
    const loopStart = 0.06 + INTRO_SEC + LOOP_SEC;
    expect(onBar.some((t) => Math.abs(t - loopStart) < 1e-6)).toBe(true); // bar 0 of the second pass has its kick right on the wrap
    expect(ctx.late).toEqual([]);
    th.stop(0);
  });
  it('swings the off-beat kicks late by SWING of a step', () => {
    const { ctx, th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(INTRO_SEC + 2 * BAR_SEC);
    const kicks = ctx.nodes.filter((n) => (n as unknown as { type?: string }).type === 'sine' && n.stops.length && Math.abs(n.stops[0] - n.starts[0] - 0.45) < 1e-6).map((n) => n.starts[0]);
    const offs = kicks.map((t) => (t - 0.06) / STEP_SEC).map((s) => s - Math.round(s)).filter((x) => x > 0.01);
    expect(offs.length).toBeGreaterThan(0);
    for (const o of offs) expect(o).toBeCloseTo(SWING, 3);
    th.stop(0);
  });
  it('keeps the node count per bar moderate', () => {
    const { th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(0.06 + INTRO_SEC + LOOP_SEC);
    expect(th.nodesCreated / (LOOP_BARS + 4)).toBeLessThan(230);
    th.stop(0);
  });
});

describe('start / stop', () => {
  it('fades in, clamps setVolume, and starts at most once', () => {
    const { ctx, th } = setup({ volume: 0.5, manual: true });
    th.start(); th.start();
    expect(ctx.nodes.length).toBeGreaterThan(30);
    th.setVolume(2); th.setVolume(Number.NaN); th.setVolume(0.4);
    expect(th.playing).toBe(true);
    th.stop(0);
  });
  it('stop clears the interval, fades, then disconnects every node and leaves none active', () => {
    vi.useFakeTimers();
    const { ctx, th } = setup();
    th.start();
    expect(th.activeNodes).toBeGreaterThan(30);
    th.stop(0.5);
    expect(th.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(1); // only the finalize timeout
    const before = ctx.nodes.flatMap((n) => n.starts).length;
    vi.advanceTimersByTime(100); ctx.currentTime += 0.1; vi.advanceTimersByTime(100);
    expect(ctx.nodes.flatMap((n) => n.starts).length).toBe(before);
    expect(th.activeNodes).toBeGreaterThan(0);
    vi.advanceTimersByTime(800);
    expect(th.activeNodes).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const mine = ctx.nodes.filter((n) => n !== ctx.destination);
    expect(mine.filter((n) => n.conns > 0 && n.disconnected === 0).length).toBeLessThan(3);
  });
  it('stop(0) frees everything at once and the theme restarts cleanly', () => {
    vi.useFakeTimers();
    const { th } = setup();
    th.start();
    th.stop(0);
    expect(th.activeNodes).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    th.stop(0);
    th.start();
    expect(th.playing).toBe(true);
    th.stop(0);
    expect(th.activeNodes).toBe(0);
  });
  it('frees one-shot voices when their sources end', () => {
    const { ctx, th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(4);
    const alive = th.activeNodes;
    for (const n of ctx.nodes) if (n.onended) n.onended();
    expect(th.activeNodes).toBeLessThan(alive);
    th.stop(0);
    expect(th.activeNodes).toBe(0);
  });
  it('stops every persistent oscillator and source on finalize', () => {
    const { ctx, th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(1);
    th.stop(0);
    const open = ctx.nodes.filter((n) => n.starts.length > 0 && n.stops.length === 0 && n.disconnected === 0);
    expect(open).toEqual([]);
  });
});
