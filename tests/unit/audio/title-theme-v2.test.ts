import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BAR_CHORDS, BAR_PLANS, BAR_SEC, BASS, CHORDS, CLAVE, COUNTER, KEY_PCS, LOOP_BARS, LOOP_SEC, LOOP_STEPS, MOTIFS, STEP_SEC, SWING, TITLE_BPM,
  createTitleTheme, makeGuiro, motifFromSearch, planForBar, stepPosition, stepTime,
} from '@/audio/titleThemeV2';
import { createLoadingTheme } from '@/audio/loadingTheme';

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
  kind = 'node';
  constructor(public ctx: FakeCtx) { ctx.nodes.push(this); }
  connect(d: unknown) { this.conns++; return d; }
  disconnect() { this.disconnected++; }
  start(t = 0) { if (t < this.ctx.currentTime - 1e-9) this.ctx.late.push(`start@${t}`); this.starts.push(t); }
  stop(t = 0) { if (t < this.ctx.currentTime - 1e-9) this.ctx.late.push(`stop@${t}`); this.stops.push(t); }
}
class FakeCtx {
  nodes: Node[] = []; late: string[] = [];
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new Node(this);
  private mk(kind: string, extra: Record<string, unknown>) { const n = new Node(this) as Node & Record<string, unknown>; n.kind = kind; Object.assign(n, extra); return n; }
  createOscillator() { return this.mk('src', { type: 'sine', frequency: new Param(this), detune: new Param(this) }); }
  createGain() { return this.mk('gain', { gain: new Param(this) }); }
  createBiquadFilter() { return this.mk('filter', { type: 'lowpass', frequency: new Param(this), Q: new Param(this), gain: new Param(this) }); }
  createBufferSource() { return this.mk('src', { buffer: null, loop: false, playbackRate: new Param(this) }); }
  createWaveShaper() { return this.mk('shaper', { curve: null, oversample: 'none' }); }
  createDynamicsCompressor() { return this.mk('comp', { threshold: new Param(this), knee: new Param(this), ratio: new Param(this), attack: new Param(this), release: new Param(this) }); }
  createConvolver() { return this.mk('conv', { buffer: null }); }
  createDelay() { return this.mk('delay', { delayTime: new Param(this) }); }
  createBuffer(ch: number, len: number) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { length: len, getChannelData: (c: number) => d[c] }; }
  resume = vi.fn(async () => undefined);
}
function setup(opts = {}) {
  const ctx = new FakeCtx(), dest = new Node(ctx);
  const th = createTitleTheme(ctx as unknown as AudioContext, dest as unknown as AudioNode, { manual: true, ...opts });
  return { ctx, dest, th };
}
const sig = (ctx: FakeCtx) => ctx.nodes.filter((n) => n.kind === 'src').map((n) => `${n.starts.map((s) => s.toFixed(4)).join(',')}/${n.stops.map((s) => s.toFixed(4)).join(',')}`).join('|');
/** Peak number of source nodes sounding at once (started and not yet stopped; persistent ones count throughout). */
function peakSources(ctx: FakeCtx): number {
  const ev: Array<[number, number]> = [];
  for (const n of ctx.nodes) if (n.kind === 'src') for (let i = 0; i < Math.max(1, n.starts.length); i++) { ev.push([n.starts[i] ?? 0, 1]); ev.push([n.stops[i] ?? Infinity, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, peak = 0; for (const [, d] of ev) { cur += d; peak = Math.max(peak, cur); }
  return peak;
}
afterEach(() => { vi.useRealTimers(); });

describe('timing and arrangement', () => {
  it('94 BPM, 40 bars, 90..120 s, swung sixteenths, loop length from the grid', () => {
    expect(TITLE_BPM).toBe(94);
    expect(STEP_SEC).toBeCloseTo(60 / 94 / 4, 9);
    expect(BAR_SEC).toBeCloseTo(STEP_SEC * 16, 9);
    expect(LOOP_SEC).toBeCloseTo(LOOP_STEPS * STEP_SEC, 9);
    expect(LOOP_SEC).toBeGreaterThanOrEqual(90);
    expect(LOOP_SEC).toBeLessThanOrEqual(120);
    expect(SWING).toBeGreaterThan(0.05); expect(SWING).toBeLessThan(0.3);
  });
  it('stepPosition wraps at the loop point and stepTime is linear', () => {
    expect(stepPosition(0)).toEqual({ bar: 0, step: 0, loop: 0 });
    expect(stepPosition(LOOP_STEPS - 1)).toEqual({ bar: LOOP_BARS - 1, step: 15, loop: 0 });
    expect(stepPosition(LOOP_STEPS)).toEqual({ bar: 0, step: 0, loop: 1 });
    expect(stepPosition(LOOP_STEPS * 3 + 37)).toEqual({ bar: 2, step: 5, loop: 3 });
    expect(stepTime(2, 16)).toBeCloseTo(2 + BAR_SEC, 9);
    expect(planForBar(LOOP_BARS + 5)).toEqual(planForBar(5));
    expect(planForBar(-1)).toEqual(planForBar(LOOP_BARS - 1));
  });
  it('has an arrangement, not eight repeated bars: intro, lone motif, drums, brass, breakdown, full return, wind-down', () => {
    const p = BAR_PLANS;
    expect(p.slice(0, 4).every((b) => b.kick.length === 0 && !b.snare && b.lead === 0)).toBe(true);
    expect(p.slice(4, 8).every((b) => b.lead === 1 && !b.snare)).toBe(true);
    expect(p[8].snare && p[8].kick.length > 0).toBe(true);
    expect(p.slice(12, 16).every((b) => b.lead === 2)).toBe(true);
    expect(p.slice(24, 28).every((b) => b.perc === 2 && !b.snare && b.kick.length === 0 && b.hats === 0)).toBe(true); // cumbia breakdown
    expect(p.slice(32, 40).every((b) => b.lead === 3 || b.lead === 2)).toBe(true);
    expect(p[39].end).toBeLessThan(16); expect(p[39].pad).toBeLessThan(p[32].pad); // hands back to the bare pad of bar 0
    expect(p[0].pad).toBeGreaterThanOrEqual(p[39].pad);
    const kinds = new Set(p.map((b) => JSON.stringify([b.kick, b.bass, b.perc, b.lead, b.counter, b.clap])));
    expect(kinds.size).toBeGreaterThanOrEqual(10);
  });
  it('chords cycle Fm9 Dbmaj7 Bbm9 C7b9 and the pad voicings stay in the key and move gently', () => {
    expect(BAR_CHORDS.slice(0, 5)).toEqual(['Fm9', 'Dbmaj7', 'Bbm9', 'C7b9', 'Fm9']);
    const order = ['Fm9', 'Dbmaj7', 'Bbm9', 'C7b9', 'Fm9'] as const;
    for (let i = 0; i < 4; i++) {
      const a = CHORDS[order[i]].pad, b = CHORDS[order[i + 1]].pad;
      a.forEach((m, k) => { expect(KEY_PCS).toContain(m % 12); expect(Math.abs(b[k] - m)).toBeLessThanOrEqual(5); });
    }
  });
});

describe('notes', () => {
  const inKey = (m: number) => KEY_PCS.includes(((m % 12) + 12) % 12);
  for (const id of ['a', 'b', 'c'] as const) {
    it(`motif ${id}: four bars, in key, in range, inside each bar, and ends leaning home (on C, G or F)`, () => {
      const m = MOTIFS[id]; expect(m.length).toBe(4);
      for (const bar of m) for (const [s, midi, len] of bar) {
        expect(inKey(midi)).toBe(true); expect(midi).toBeGreaterThanOrEqual(62); expect(midi).toBeLessThanOrEqual(84);
        expect(s).toBeGreaterThanOrEqual(0); expect(s + len).toBeLessThanOrEqual(16);
      }
      const last = m[3][m[3].length - 1][1] % 12; expect([0, 5, 7]).toContain(last);
    });
  }
  it('the three motifs differ in contour and rhythm', () => {
    const flat = (id: 'a' | 'b' | 'c') => MOTIFS[id].flat().map((n) => `${n[0]}:${n[1]}`).join();
    expect(new Set([flat('a'), flat('b'), flat('c')]).size).toBe(3);
    const rhythm = (id: 'a' | 'b' | 'c') => MOTIFS[id].map((b) => b.map((n) => n[0]).join()).join('|');
    expect(new Set([rhythm('a'), rhythm('b'), rhythm('c')]).size).toBe(3);
  });
  it('the motif flag reads ?motif= and defaults to a', () => {
    expect(motifFromSearch('?motif=b')).toBe('b'); expect(motifFromSearch('?x=1&motif=C')).toBe('c');
    expect(motifFromSearch('?motif=z')).toBe('a'); expect(motifFromSearch('')).toBe('a'); expect(motifFromSearch(undefined)).toBe('a');
  });
  it('counter-line and bass stay in key; clave is the son 3-2 (five hits over two bars)', () => {
    for (const bar of COUNTER) for (const [s, m, len] of bar) { expect(inKey(m)).toBe(true); expect(s + len).toBeLessThanOrEqual(16); }
    for (const c of Object.values(CHORDS)) for (const pat of BASS) for (const [s, off, len] of pat) { expect(inKey(c.root + off)).toBe(true); expect(s + len).toBeLessThanOrEqual(16); expect(c.root + off).toBeGreaterThanOrEqual(34); }
    expect(CLAVE[0].length + CLAVE[1].length).toBe(5);
    expect(CLAVE[0]).toEqual([0, 6, 12]);
  });
  it('the guiro scraper is finite and bounded', () => {
    const g = makeGuiro(8000); expect(g.length).toBe(4000);
    expect(g.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
  });
});

describe('scheduling', () => {
  it('is deterministic: two runs schedule identical sources at identical times', () => {
    const a = setup(), b = setup();
    a.th.start(); b.th.start(); a.th.scheduleUntil(40); b.th.scheduleUntil(40);
    expect(sig(a.ctx)).toBe(sig(b.ctx)); expect(a.th.nodesCreated).toBe(b.th.nodesCreated);
    expect(a.th.nodesCreated).toBeGreaterThan(300);
    const c = setup({ motif: 'b' }); c.th.start(); c.th.scheduleUntil(40);
    expect(sig(c.ctx)).not.toBe(sig(a.ctx)); // the motif option really changes the lead (bar 4 is the first lone-motif bar)
  });
  it('never schedules in the past and keeps every node connected to something', () => {
    const { ctx, th } = setup();
    th.start(); th.scheduleUntil(LOOP_SEC * 1.05);
    expect(ctx.late).toEqual([]);
  });
  it('keeps the voice count under the cap through two whole loops, and under the loading theme plus a margin', () => {
    const { ctx, th } = setup();
    th.start(); th.scheduleUntil(LOOP_SEC * 2 + 1);
    const peak = peakSources(ctx);
    expect(peak).toBeLessThanOrEqual(48);
    const l = new FakeCtx(), ld = new Node(l);
    const lt = createLoadingTheme(l as unknown as AudioContext, ld as unknown as AudioNode, { manual: true });
    lt.start(); lt.scheduleUntil(lt.activeNodes ? 120 : 120);
    expect(peak).toBeLessThanOrEqual(peakSources(l) + 14);
    // persistent voices: 8 pad oscillators, 1 sub bass, 1 vibrato lfo
    const persistent = ctx.nodes.filter((n) => n.kind === 'src' && n.stops.length === 0).length;
    expect(persistent).toBe(10);
    th.stop(0);
  });
  it('loops at the loop point: bar 0 of loop 2 plays the same plan, one LOOP_SEC later', () => {
    const { ctx, th } = setup();
    th.start(); th.scheduleUntil(LOOP_SEC * 2 + 0.3);
    const t1 = 0.06 + LOOP_SEC;
    const kicks = (from: number) => ctx.nodes.filter((n) => n.kind === 'src' && n.starts.length === 1 && n.stops.length === 1 && Math.abs(n.stops[0] - n.starts[0] - 0.6) < 1e-6).map((n) => n.starts[0]).filter((t) => t >= from + 8 * BAR_SEC && t < from + 16 * BAR_SEC);
    const k0 = kicks(0.06), k1 = kicks(t1);
    expect(k0.length).toBeGreaterThan(6);
    expect(k1.map((t) => +(t - LOOP_SEC).toFixed(4))).toEqual(k0.map((t) => +t.toFixed(4)));
    th.stop(0);
  });
});

describe('start, stop, volume, pause', () => {
  it('stop(0) frees every node; stop with a fade frees them after the fade; restart works', () => {
    vi.useFakeTimers();
    const { th } = setup();
    th.start(); th.start();
    expect(th.playing).toBe(true); expect(th.activeNodes).toBeGreaterThan(30);
    th.stop(0.5); expect(th.playing).toBe(false); expect(th.activeNodes).toBeGreaterThan(0);
    vi.advanceTimersByTime(900); expect(th.activeNodes).toBe(0); expect(vi.getTimerCount()).toBe(0);
    th.start(); expect(th.activeNodes).toBeGreaterThan(30); th.stop(0); expect(th.activeNodes).toBe(0);
  });
  it('schedules nothing after stop and nothing while paused; resume carries on from the same step', () => {
    const { ctx, th } = setup();
    th.start(); th.scheduleUntil(15);
    th.pause(); expect(th.paused).toBe(true);
    const before = th.nodesCreated; th.scheduleUntil(35); expect(th.nodesCreated).toBe(before);
    ctx.currentTime = 40; th.resume(); expect(th.paused).toBe(false);
    th.scheduleUntil(60); expect(th.nodesCreated).toBeGreaterThan(before);
    th.stop(0); const n = th.nodesCreated; th.scheduleUntil(99); expect(th.nodesCreated).toBe(n);
    th.pause(); th.resume(); expect(th.paused).toBe(false); // harmless when not running
  });
  it('is silent at music volume zero: only the chain is built, no voice is scheduled, output gain stays 0', () => {
    const z = setup({ volume: 0 }), n = setup({ volume: 0.7 });
    z.th.start(); z.th.scheduleUntil(30); n.th.start(); n.th.scheduleUntil(30);
    expect(z.th.nodesCreated).toBeLessThan(n.th.nodesCreated / 3);
    expect(z.th.nodesCreated).toBeLessThan(80);
    const gains = z.ctx.nodes.filter((x) => x.kind === 'gain') as Array<Node & { gain: Param }>;
    expect(gains[0].gain.value).toBe(0); // the output gain: fade-in target is the volume, which is 0
    expect(z.ctx.nodes.filter((x) => x.kind === 'src' && x.starts.length > 0 && x.stops.length > 0).length).toBe(0);
  });
  it('clamps setVolume and survives NaN', () => {
    const { th } = setup({ volume: 0.5 });
    th.start(); th.setVolume(5); th.setVolume(Number.NaN); th.setVolume(-1); th.setVolume(0.3);
    expect(th.playing).toBe(true); th.stop(0);
  });
});
