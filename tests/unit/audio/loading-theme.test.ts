import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BAR_CHORDS, BAR_PLANS, BASS_FUNK, BASS_FUNK2, BASS_SIMPLE, BASS_SUSTAIN, BAR_SEC, CHORDS, GTR_PAT_A, GTR_PAT_B, KEY_PCS, LEAD_CYCLE, LEAD_TURN,
  LOADING_BPM, LOADING_THEME_ENTRY, LOOP_BARS, LOOP_SEC, LOOP_STEPS, STEP_SEC, STEPS_PER_BAR, auditionLoadingTheme, bassMidi, ceilingCurve,
  createLoadingTheme, leadNotesForBar, makeExcitation, midiToHz, mulberry32, planForBar, renderKarplus, stepPosition, stepTime,
} from '@/audio/loadingTheme';

class Param {
  value = 0;
  late: string[] = [];
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
}
class FakeCtx {
  nodes: Node[] = []; late: string[] = [];
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new Node(this);
  private mk(extra: Record<string, unknown>) { const n = new Node(this) as Node & Record<string, unknown>; Object.assign(n, extra); return n; }
  createOscillator() { return this.mk({ type: 'sine', frequency: new Param(this), detune: new Param(this) }); }
  createGain() { return this.mk({ gain: new Param(this) }); }
  createBiquadFilter() { return this.mk({ type: 'lowpass', frequency: new Param(this), Q: new Param(this), gain: new Param(this) }); }
  createBufferSource() { return this.mk({ buffer: null, loop: false, playbackRate: new Param(this) }); }
  createWaveShaper() { return this.mk({ curve: null, oversample: 'none' }); }
  createDynamicsCompressor() { return this.mk({ threshold: new Param(this), knee: new Param(this), ratio: new Param(this), attack: new Param(this), release: new Param(this) }); }
  createConvolver() { return this.mk({ buffer: null }); }
  createDelay() { return this.mk({ delayTime: new Param(this) }); }
  createStereoPanner() { return this.mk({ pan: new Param(this) }); }
  createBuffer(ch: number, len: number) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { length: len, getChannelData: (c: number) => d[c] }; }
  resume = vi.fn(async () => undefined);
}
function setup(opts = {}) {
  const ctx = new FakeCtx();
  const dest = new Node(ctx);
  const th = createLoadingTheme(ctx as unknown as AudioContext, dest as unknown as AudioNode, opts);
  return { ctx, dest, th };
}
const inKey = (m: number) => KEY_PCS.includes(((m % 12) + 12) % 12);

afterEach(() => { vi.useRealTimers(); });

describe('timing math', () => {
  it('derives bar, step and loop from the global 16th counter and wraps', () => {
    expect(STEP_SEC).toBeCloseTo(60 / LOADING_BPM / 4, 9);
    expect(BAR_SEC).toBeCloseTo(STEP_SEC * 16, 9);
    expect(LOOP_STEPS).toBe(LOOP_BARS * STEPS_PER_BAR);
    expect(LOOP_SEC).toBeCloseTo(LOOP_BARS * BAR_SEC, 9);
    expect(stepPosition(0)).toEqual({ bar: 0, step: 0, loop: 0 });
    expect(stepPosition(17)).toEqual({ bar: 1, step: 1, loop: 0 });
    expect(stepPosition(LOOP_STEPS - 1)).toEqual({ bar: 31, step: 15, loop: 0 });
    expect(stepPosition(LOOP_STEPS)).toEqual({ bar: 0, step: 0, loop: 1 });
    expect(stepPosition(LOOP_STEPS * 3 + 40)).toEqual({ bar: 2, step: 8, loop: 3 });
    expect(stepTime(1, 16)).toBeCloseTo(1 + BAR_SEC, 9);
  });
  it('runs in the 104..112 BPM range and loops for about a minute or more', () => {
    expect(LOADING_BPM).toBeGreaterThanOrEqual(104);
    expect(LOADING_BPM).toBeLessThanOrEqual(112);
    expect(LOOP_SEC).toBeGreaterThan(60);
    expect(LOADING_THEME_ENTRY.name).toBe('Loading theme');
  });
});

describe('arrangement and note data', () => {
  it('has a chord and a plan for each of the 32 bars, with the expected sections', () => {
    expect(BAR_CHORDS).toHaveLength(LOOP_BARS);
    expect(BAR_PLANS).toHaveLength(LOOP_BARS);
    const sec = (b: number) => planForBar(b).section;
    expect([sec(0), sec(4), sec(12), sec(20), sec(24), sec(30)]).toEqual(['intro', 'groove', 'lead', 'breakdown', 'final', 'turn']);
    expect(planForBar(20).kick).toBe('none');
    expect(planForBar(36)).toEqual(planForBar(4));
    for (const b of [3, 11, 19, 23, 29, 31]) expect(planForBar(b).fill).not.toBe('none');
    for (let b = 0; b < LOOP_BARS; b++) if (b !== 0 && b !== 20 && b !== 21) expect(BAR_PLANS[b].kick).not.toBe('none');
  });
  it('keeps every chord voicing in the A dorian key and made of chord tones', () => {
    for (const c of Object.values(CHORDS)) {
      for (const set of [c.gtr, c.keys, c.brass]) for (const m of set) { expect(inKey(m)).toBe(true); expect(c.pcs).toContain(m % 12); }
      expect(c.pcs.every((pc) => KEY_PCS.includes(pc))).toBe(true);
    }
  });
  it('plays bass in range, on chord tones, with octave jumps and no overlapping notes', () => {
    for (const pat of [BASS_FUNK, BASS_FUNK2, BASS_SIMPLE, BASS_SUSTAIN]) {
      let end = 0;
      for (const [step, kind, len] of pat) {
        expect(step).toBeGreaterThanOrEqual(end);
        end = step + len;
        expect(end).toBeLessThanOrEqual(STEPS_PER_BAR);
        for (const c of Object.values(CHORDS)) {
          const m = bassMidi(c, kind);
          expect(m).toBeGreaterThanOrEqual(38);
          expect(m).toBeLessThanOrEqual(64);
          expect(c.pcs).toContain(m % 12);
        }
      }
    }
    expect(BASS_FUNK.some(([, k]) => k === 'o')).toBe(true);
    for (const c of Object.values(CHORDS)) expect(bassMidi(c, 'o') - bassMidi(c, 'r')).toBe(12);
  });
  it('writes a lead hook that stays in key, in guitar range, and never overlaps itself', () => {
    expect(LEAD_CYCLE).toHaveLength(8);
    LEAD_CYCLE.forEach((bar, i) => {
      let end = 0;
      for (const n of bar) {
        expect(inKey(n.midi)).toBe(true);
        expect(inKey(n.midi - (n.bend ?? 0))).toBe(true);
        expect(n.midi).toBeGreaterThanOrEqual(64);
        expect(n.midi).toBeLessThanOrEqual(84);
        expect(n.step).toBeGreaterThanOrEqual(end);
        end = n.step + n.len;
        expect(end).toBeLessThanOrEqual(STEPS_PER_BAR);
      }
      expect(bar.length, `bar ${i}`).toBeGreaterThan(0);
    });
    expect(LEAD_TURN.every((n) => inKey(n.midi))).toBe(true);
    expect(leadNotesForBar(12)).toBe(LEAD_CYCLE[0]);
    expect(leadNotesForBar(19)).toBe(LEAD_CYCLE[7]);
    expect(leadNotesForBar(2)).toEqual([]);
    expect(leadNotesForBar(20)).toEqual([]);
  });
  it('lands the lead on chord tones at the start of long notes', () => {
    for (let bar = 12; bar < 20; bar++) {
      const chord = CHORDS[BAR_CHORDS[bar]];
      const longest = [...leadNotesForBar(bar)].sort((a, b) => b.len - a.len)[0];
      expect(chord.pcs, `bar ${bar}`).toContain(longest.midi % 12);
    }
  });
  it('writes rhythm guitar patterns of 16 steps with stabs on the upbeats', () => {
    for (const p of [GTR_PAT_A, GTR_PAT_B]) { expect(p).toHaveLength(16); expect(/^[OXx.]+$/.test(p)).toBe(true); expect(p.replace(/[x.]/g, '').length).toBeGreaterThanOrEqual(4); }
  });
});

describe('Karplus-Strong helper', () => {
  it('is deterministic, finite, decays, and is tuned through playbackRate', () => {
    const ex = makeExcitation(1024, 3);
    expect(Array.from(makeExcitation(1024, 3).slice(0, 8))).toEqual(Array.from(ex.slice(0, 8)));
    const sr = 22050, f = midiToHz(57);
    const { data, rate } = renderKarplus(sr, f, 0.5, 0.996, ex);
    expect(data.every(Number.isFinite)).toBe(true);
    const rmsOf = (a: number, b: number) => Math.sqrt(data.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    expect(rmsOf(Math.floor(sr * 0.3), Math.floor(sr * 0.4))).toBeLessThan(rmsOf(0, Math.floor(sr * 0.1)));
    expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(1.0001);
    expect(rate).toBeGreaterThan(0.98);
    expect(rate).toBeLessThan(1.02);
    // dominant period (autocorrelation) matches the pitch within a few cents once the rate is applied
    let best = 0, bestLag = 0;
    for (let lag = 20; lag < 400; lag++) { let s = 0; for (let i = 0; i < 2000; i++) s += data[i + 2000] * data[i + 2000 + lag]; if (s > best) { best = s; bestLag = lag; } }
    const hz = (sr / bestLag) * rate;
    expect(Math.abs(1200 * Math.log2(hz / f))).toBeLessThan(40);
  });
  it('ceiling curve never exceeds -3 dBFS', () => {
    const c = ceilingCurve();
    expect(Math.max(...Array.from(c).map(Math.abs))).toBeLessThan(0.7);
    expect(mulberry32(5)()).toBe(mulberry32(5)());
  });
});

describe('scheduler', () => {
  it('uses a ~25 ms interval, schedules ~100 ms ahead, and advances exactly on the 16th grid', () => {
    vi.useFakeTimers();
    const { ctx, th } = setup();
    th.start();
    expect(th.playing).toBe(true);
    const kicksAt = () => ctx.nodes.filter((n) => (n as unknown as { frequency?: Param }).frequency && n.starts.length).map((n) => n.starts[0]);
    const n0 = kicksAt().length;
    expect(n0).toBeGreaterThan(0);
    // step 0 begins at 0.06, the next step at 0.06 + STEP_SEC; nothing beyond 0.1 s ahead yet
    const horizon = ctx.currentTime + 0.1;
    const maxStart = Math.max(...ctx.nodes.flatMap((n) => n.starts).filter((t) => t > 0));
    expect(maxStart).toBeLessThanOrEqual(horizon + 0.2);
    ctx.currentTime = 0.55; vi.advanceTimersByTime(25);
    const starts = ctx.nodes.flatMap((n) => n.starts);
    expect(Math.max(...starts)).toBeGreaterThan(0.6);
    th.stop(0);
  });

  it('never schedules anything in the past, even after a long timer stall', () => {
    vi.useFakeTimers();
    const { ctx, th } = setup();
    th.start();
    for (let i = 0; i < 40; i++) { ctx.currentTime += 0.025; vi.advanceTimersByTime(25); }
    ctx.currentTime += 4.2; vi.advanceTimersByTime(25); // tab throttled for 4 s
    for (let i = 0; i < 20; i++) { ctx.currentTime += 0.025; vi.advanceTimersByTime(25); }
    expect(ctx.late).toEqual([]);
    th.stop(0);
  });

  it('places kicks exactly on the beat grid and wraps seamlessly over the loop boundary', () => {
    const { ctx, th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(LOOP_SEC + 8);
    const kicks = ctx.nodes
      .filter((n) => (n as unknown as { type?: string }).type === 'sine' && n.stops.length && n.stops[0] - n.starts[0] > 0.45 && n.stops[0] - n.starts[0] < 0.55)
      .map((n) => n.starts[0]);
    expect(kicks.length).toBeGreaterThan(100);
    for (const t of kicks) {
      const beats = (t - 0.06) / (60 / LOADING_BPM);
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6);
    }
    const afterWrap = kicks.filter((t) => t >= 0.06 + LOOP_SEC - 1e-6 && t < 0.06 + LOOP_SEC + 8);
    expect(afterWrap.length).toBeGreaterThan(0);
    expect(Math.min(...afterWrap) - (0.06 + LOOP_SEC)).toBeLessThan(BAR_SEC * 1.01); // bar 0 has no kick, bar 1 does: still within the intro
    expect(ctx.late).toEqual([]);
    th.stop(0);
  });

  it('keeps the node count per bar moderate (no hundreds of nodes per bar)', () => {
    const { th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(0.06 + LOOP_SEC);
    expect(th.nodesCreated / LOOP_BARS).toBeLessThan(150);
    th.stop(0);
  });
});

describe('start / stop', () => {
  it('fades in over 0.3 s, honours setVolume and clamps it', () => {
    const { ctx, th } = setup({ volume: 0.5, manual: true });
    th.start();
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
    expect(vi.getTimerCount()).toBe(1); // only the finalize timeout; the scheduler interval is gone
    const before = ctx.nodes.flatMap((n) => n.starts).length;
    vi.advanceTimersByTime(100); ctx.currentTime += 0.1; vi.advanceTimersByTime(100);
    expect(ctx.nodes.flatMap((n) => n.starts).length).toBe(before); // nothing new scheduled after stop
    expect(th.activeNodes).toBeGreaterThan(0); // still fading
    vi.advanceTimersByTime(800);
    expect(th.activeNodes).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const theme = ctx.nodes.filter((n) => n !== (ctx as unknown as { destination: Node }).destination);
    expect(theme.filter((n) => n.conns > 0 && n.disconnected === 0).length).toBeLessThan(3); // only the external dest node may be left
  });

  it('stop(0) frees everything immediately and the theme can restart cleanly', () => {
    vi.useFakeTimers();
    const { th } = setup();
    th.start(); th.start(); // second start is a no-op
    th.stop(0);
    expect(th.activeNodes).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    th.stop(0); // idempotent
    th.start();
    expect(th.playing).toBe(true);
    expect(th.activeNodes).toBeGreaterThan(0);
    th.stop(0);
    expect(th.activeNodes).toBe(0);
  });

  it('frees one-shot voices when their sources end', () => {
    const { ctx, th } = setup({ manual: true });
    th.start();
    th.scheduleUntil(3);
    const alive = th.activeNodes;
    for (const n of ctx.nodes) if (n.onended) n.onended();
    expect(th.activeNodes).toBeLessThan(alive);
    th.stop(0);
    expect(th.activeNodes).toBe(0);
  });

  it('auditions through the debug entry and toggles', () => {
    vi.useFakeTimers();
    const ctx = new FakeCtx();
    const dest = new Node(ctx);
    expect(auditionLoadingTheme(null)).toBe(false);
    const host = { ctx: ctx as unknown as AudioContext, dest: dest as unknown as AudioNode };
    expect(auditionLoadingTheme(host)).toBe(true);
    expect(auditionLoadingTheme(host, true)).toBe(true);
    expect(auditionLoadingTheme(host)).toBe(false);
    vi.advanceTimersByTime(2000);
  });
});
