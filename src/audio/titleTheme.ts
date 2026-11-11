/**
 * "Stoop Season": an original, fully synthesized 90s New York boom-bap title theme (90 BPM, G minor, swung sixteenths).
 * Plain Web Audio nodes only: no files, no samples. Every melody, bass line and drum pattern was written for this game.
 *
 * Arrangement: 4-bar intro once (filtered e-piano chop opening up, drums drop in, scratch), then a 32-bar loop (about 85 s):
 *   0-3 groove | 4-7 groove + hook | 8-11 B-section (ghost snares, scratch) | 12-15 clap + hook (scratch) | 16-19 breakdown + riser |
 *   20-23 big (octave hook) | 24-27 B again (scratch) | 28-31 final hook, stop-time rewind into bar 0.
 * Parts: sine/sat 808 sub with slides, punchy kick with click, cracking snare + layered clap, dusty hats with ghosts, chopped
 * Rhodes-ish keys (periodic wave, chorus, 12-bit grit), bell hook, vowel-sample scratch, vinyl crackle, plate reverb, dotted delay.
 * Master: saturation, glue compressor, limiter (-3 dB, 20:1), soft ceiling at -1 dBFS.
 */
import { driveCurve, midiToHz, mulberry32 } from '@/audio/loadingTheme';

export const TITLE_BPM = 90;
export const STEP_SEC = 60 / TITLE_BPM / 4;
export const STEPS_PER_BAR = 16;
export const BAR_SEC = STEP_SEC * STEPS_PER_BAR;
export const INTRO_BARS = 4;
export const LOOP_BARS = 32;
export const INTRO_STEPS = INTRO_BARS * STEPS_PER_BAR;
export const LOOP_STEPS = LOOP_BARS * STEPS_PER_BAR;
export const INTRO_SEC = INTRO_STEPS * STEP_SEC;
/** Length of the repeating part (after the intro). */
export const LOOP_SEC = LOOP_STEPS * STEP_SEC;
/** Odd sixteenths are pushed late by this fraction of a step (about 61 % swing). */
export const SWING = 0.22;

/** Position for a free-running global 16th counter: the intro plays once, then the loop wraps. */
export function stepPosition(g: number): { intro: boolean; bar: number; step: number; loop: number } {
  if (g < INTRO_STEPS) return { intro: true, bar: g >> 4, step: g & 15, loop: -1 };
  const s = g - INTRO_STEPS;
  return { intro: false, bar: Math.floor(s / 16) % LOOP_BARS, step: s % 16, loop: Math.floor(s / LOOP_STEPS) };
}
export function stepTime(t0: number, g: number): number { return t0 + g * STEP_SEC; }

// ---------------------------------------------------------------- notes
export type ChordName = 'Gm9' | 'Ebmaj7' | 'Cm9' | 'D7b9';
/** root: bass MIDI; keys: rootless e-piano voicing. */
export const CHORDS: Record<ChordName, { root: number; keys: number[] }> = {
  Gm9: { root: 31, keys: [58, 62, 65, 69] },
  Ebmaj7: { root: 39, keys: [58, 62, 67, 70] },
  Cm9: { root: 36, keys: [58, 62, 63, 67] },
  D7b9: { root: 38, keys: [60, 63, 66, 69] },
};
/** G harmonic minor: G A Bb C D Eb F F#. */
export const KEY_PCS = [7, 9, 10, 0, 2, 3, 5, 6];
export const CYC_A: ChordName[] = ['Gm9', 'Ebmaj7', 'Cm9', 'D7b9'];
export const CYC_B: ChordName[] = ['Cm9', 'Cm9', 'Ebmaj7', 'D7b9'];
const SEC_CYC = [CYC_A, CYC_A, CYC_B, CYC_A, CYC_A, CYC_A, CYC_B, CYC_A];
export const BAR_CHORDS: ChordName[] = SEC_CYC.flat();

/** The hook, one array per bar of the 4-bar cycle: [step, midi, lenSteps]. Hum: D C Bb . G Bb / G Bb D C Bb . Bb ... */
export const HOOK: Array<Array<[number, number, number]>> = [
  [[0, 74, 3], [3, 72, 1], [4, 70, 4], [10, 67, 2], [12, 70, 3]],
  [[0, 67, 3], [3, 70, 1], [4, 74, 4], [10, 72, 2], [12, 70, 4]],
  [[0, 72, 3], [3, 70, 1], [4, 67, 4], [10, 63, 2], [12, 67, 3]],
  [[0, 69, 3], [4, 66, 2], [6, 69, 2], [8, 72, 3], [12, 70, 4]],
];
/** Bass: [step, semitones above chord root, lenSteps, slideFromPrevious]. Offsets 0, 7, 12 stay in key on every chord. */
export type BassNote = [number, number, number, 0 | 1];
export const BASS: BassNote[][] = [
  [],
  [[0, 0, 6, 0], [7, 0, 2, 0], [10, 7, 3, 1], [14, 0, 2, 1]],
  [[0, 0, 4, 0], [5, 0, 1, 0], [6, 12, 2, 1], [9, 7, 2, 1], [12, 12, 2, 1], [14, 0, 2, 1]],
  [[0, 0, 15, 0]],
];
/** Keys chops: [step, gateSteps, velocity]. */
export const CHOP: Array<Array<[number, number, number]>> = [
  [],
  [[0, 4, 1], [6, 1, 0.55], [8, 3, 0.9], [11, 1, 0.6], [14, 2, 0.75]],
  [[0, 6, 1], [8, 2, 0.7], [12, 1.5, 0.55]],
  [[0, 15, 0.8]],
];
export const KICKS: number[][] = [[0, 7, 10], [0, 3, 10], [0, 7, 10, 14], [0, 10], [0, 6, 10]];
const HAT = [0.55, 0.16, 0.34, 0.14, 0.48, 0.18, 0.34, 0.16, 0.55, 0.14, 0.34, 0.18, 0.48, 0.16, 0.36, 0.22];
/** Scratch gestures: [startStep, lenSteps, rateFrom, rateTo]. */
export const SCRATCH: Array<Array<[number, number, number, number]>> = [
  [[12, 1, 0.5, 2.4], [13, 1, 2.4, 0.5], [14, 0.5, 0.6, 2.8], [14.5, 0.5, 2.8, 0.6], [15, 1, 0.6, 3.2]],
  [[10, 2, 0.4, 2.5], [12, 1, 2.5, 0.4], [13, 1, 0.6, 2], [14, 0.75, 2, 0.3], [14.75, 1.25, 0.3, 3]],
  [[8, 1.5, 0.5, 2.2], [10, 1, 2.2, 0.7], [12, 0.5, 0.7, 2.6], [12.5, 0.5, 2.6, 0.7], [13, 0.5, 0.7, 2.6], [13.5, 0.5, 2.6, 0.7], [14, 2, 0.5, 3.4]],
  [[8, 4, 0.3, 1], [12, 1, 1.4, 0.4], [13, 1, 0.4, 2.2], [14, 2, 2.2, 0.3]],
  [[12, 1, 1.2, 0.3], [13, 1, 0.3, 2.5], [14, 2, 2.5, 0.2]],
];

export interface BarPlan {
  kick: number[]; snare: boolean; ghost: boolean; clap: boolean;
  /** 0 none, 1 eighths, 2 swung sixteenths. */
  hats: 0 | 1 | 2; open: number;
  bass: number; chop: number;
  /** 0 none, 1 hook, 2 hook + octave layer. */
  hook: 0 | 1 | 2;
  scratch: number; crash: boolean; riser: boolean; roll: boolean;
  /** Steps >= end are silent for the band (stop-time). */
  end: number;
}
const blank = (): BarPlan => ({ kick: KICKS[0], snare: true, ghost: false, clap: false, hats: 2, open: 0, bass: 1, chop: 1, hook: 0, scratch: -1, crash: false, riser: false, roll: false, end: 16 });

export const INTRO_PLANS: BarPlan[] = [
  { ...blank(), kick: [], snare: false, hats: 0, bass: 0, chop: 3 },
  { ...blank(), kick: [], snare: false, hats: 1, bass: 0 },
  { ...blank(), kick: [0, 10], snare: false, hats: 1, bass: 3 },
  { ...blank(), bass: 0, scratch: 0 },
];

export function planForBar(barIn: number): BarPlan {
  const bar = ((barIn % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;
  const sec = bar >> 2, j = bar & 3;
  const p = blank();
  const o: Array<Partial<BarPlan>> = [
    {}, { hook: 1 }, { kick: KICKS[1], ghost: true, open: 10, bass: 2, chop: 2 }, { clap: true, hook: 1 },
    { kick: KICKS[3], snare: false, hats: 1, bass: 3, chop: 3, hook: 1 }, { kick: KICKS[2], clap: true, open: 14, bass: 2, hook: 2 },
    { kick: KICKS[4], ghost: true, open: 10, chop: 2 }, { clap: true, bass: 2, hook: 1 },
  ];
  Object.assign(p, o[sec]);
  if (j === 3 && sec !== 4) { p.kick = KICKS[2]; if (p.bass === 1) p.bass = 2; }
  p.crash = j === 0 && (sec === 0 || sec === 3 || sec === 5 || sec === 7);
  p.scratch = ({ 11: 0, 15: 1, 27: 2, 19: 3, 31: 4 } as Record<number, number>)[bar] ?? -1;
  if (bar === 19) { p.riser = true; p.roll = true; }
  if (bar === 31) p.end = 12;
  return p;
}
export const BAR_PLANS: BarPlan[] = Array.from({ length: LOOP_BARS }, (_, i) => planForBar(i));

// ---------------------------------------------------------------- pure DSP helpers
/** Soft ceiling: unity for small signals, never above 0.89 (-1 dBFS). */
export function ceilingCurve(n = 2048): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = 0.89 * Math.tanh(((i * 2) / (n - 1) - 1) / 0.89);
  return c;
}
/** Gentle tape-ish saturation (tanh), normalised so full scale stays full scale. */
export function satCurve(k = 1.5, n = 1024): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i * 2) / (n - 1) - 1)) / Math.tanh(k);
  return c;
}
/** 12-bit-sampler style staircase (quantises to `levels` steps). */
export function gritCurve(levels = 48, n = 1024): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.round(((i * 2) / (n - 1) - 1) * levels) / levels;
  return c;
}
/** Vinyl dust: sparse pops of random size plus a faint hiss. Deterministic. */
export function makeCrackle(sr: number, secs = 6, seed = 77): Float32Array {
  const r = mulberry32(seed), n = Math.floor(sr * secs), d = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.2 * ((r() * 2 - 1) - lp);
    d[i] = lp * 0.02;
    if (r() < 14 / sr) { const a = Math.pow(r(), 2.5) * (r() < 0.5 ? -1 : 1); for (let k = 0; k < 6 && i + k < n; k++) d[i + k] += a * Math.exp(-k * 0.7); }
  }
  return d;
}
/** A synthetic sung "ahh" (harmonics under formant peaks) used as the scratch record. */
export function makeVowel(sr: number, secs = 0.5, f0 = 160): Float32Array {
  const n = Math.floor(sr * secs), d = new Float32Array(n);
  for (let k = 1; k * f0 < Math.min(7000, sr / 2.2); k++) {
    const f = k * f0, g = (c: number, w: number) => Math.exp(-(((f - c) / w) ** 2));
    const a = (g(700, 260) + 0.7 * g(1150, 300) + 0.25 * g(2600, 500) + 0.05) / Math.pow(k, 0.3), w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < n; i++) d[i] += a * Math.sin(w * i);
  }
  let pk = 1e-6;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  const fade = Math.min(n >> 2, 400);
  for (let i = 0; i < n; i++) d[i] = (d[i] / pk) * Math.min(1, i / fade, (n - 1 - i) / fade);
  return d;
}
export function rnd(g: number): number { let x = Math.imul(g + 1, 0x9e3779b1) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b) >>> 0; return (x >>> 8) / 16777216; }

// ---------------------------------------------------------------- engine
export type PartName = 'kick' | 'snare' | 'hats' | 'bass' | 'keys' | 'hook' | 'scratch' | 'crackle';
export const DEFAULT_MIX: Record<PartName, number> = { kick: 0.95, snare: 0.7, hats: 0.42, bass: 0.55, keys: 0.4, hook: 0.3, scratch: 0.32, crackle: 1 };

export interface TitleThemeOptions {
  /** Output level 0..1 (default 0.85). */
  volume?: number;
  /** Seconds scheduled ahead of ctx.currentTime (default 0.1). */
  lookAhead?: number;
  intervalMs?: number;
  /** No timer: the caller drives scheduleUntil() (offline rendering, tests). */
  manual?: boolean;
  mix?: Partial<Record<PartName, number>>;
}
export interface TitleTheme {
  start(): void;
  stop(fadeSec?: number): void;
  setVolume(v: number): void;
  readonly playing: boolean;
  scheduleUntil(horizon: number): void;
  /** Audio nodes currently alive. Zero after stop() has finished. */
  readonly activeNodes: number;
  readonly nodesCreated: number;
}
type Src = AudioScheduledSourceNode;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function createTitleTheme(ctx: BaseAudioContext, dest: AudioNode, opts: TitleThemeOptions = {}): TitleTheme {
  const lookAhead = opts.lookAhead ?? 0.1, intervalMs = opts.intervalMs ?? 25;
  const mix: Record<PartName, number> = { ...DEFAULT_MIX, ...(opts.mix ?? {}) };
  let volume = clamp01(opts.volume ?? 0.85);
  let running = false, t0 = 0, nextStep = 0, created = 0, prevBass = 49;
  let timer: ReturnType<typeof setInterval> | null = null, finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  const live = new Set<AudioNode>();
  const T = (t: number): number => Math.max(t, ctx.currentTime);
  let noiseBuf: AudioBuffer | null = null, vowelBuf: AudioBuffer | null = null, wave: PeriodicWave | null = null;
  interface Chain {
    out: GainNode; wow: GainNode; bassOsc: OscillatorNode; bassAmp: GainNode; duckBass: GainNode; duckKeys: GainNode; keysLP: BiquadFilterNode; keysIn: GainNode;
    kickBus: GainNode; clickBp: BiquadFilterNode; snareIn: BiquadFilterNode; crackBp: BiquadFilterNode; snareBus: GainNode; clapBp: BiquadFilterNode;
    hatHp: BiquadFilterNode; crashHp: BiquadFilterNode; riserBp: BiquadFilterNode; hookIn: GainNode; scrIn: GainNode; rev: GainNode; dly: GainNode;
  }
  let n: Chain | null = null;

  const track = <A extends AudioNode>(x: A): A => { live.add(x); created++; return x; };
  const gain = (v: number, to?: AudioNode): GainNode => { const g = track(ctx.createGain()); g.gain.value = v; if (to) g.connect(to); return g; };
  const filt = (type: BiquadFilterType, f: number, q: number, to?: AudioNode): BiquadFilterNode => {
    const b = track(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b;
  };
  const shaper = (curve: Float32Array, to?: AudioNode, os: OverSampleType = 'none'): WaveShaperNode => {
    const w = track(ctx.createWaveShaper()); w.curve = curve as Float32Array<ArrayBuffer>; w.oversample = os; if (to) w.connect(to); return w;
  };
  const drop = (xs: AudioNode[]): void => {
    for (const x of xs) {
      try { (x as unknown as { onended: unknown }).onended = null; } catch { /* ignore */ }
      try { x.disconnect(); } catch { /* already disconnected */ }
      live.delete(x);
    }
  };
  /** Free a one-shot voice when its last source ends. */
  const release = (srcs: Src[], nodes: AudioNode[]): void => {
    let left = srcs.length; const all = [...srcs, ...nodes];
    for (const s of srcs) s.onended = () => { if (--left <= 0) drop(all); };
  };
  const osc = (type: OscillatorType, hz: number, to: AudioNode): OscillatorNode => { const o = track(ctx.createOscillator()); o.type = type; o.frequency.value = hz; o.connect(to); return o; };
  const bufSrc = (buf: AudioBuffer | null, to: AudioNode): AudioBufferSourceNode => { const s = track(ctx.createBufferSource()); s.buffer = buf; s.connect(to); return s; };
  const noise = (tt: number, off: number, dur: number, to: AudioNode): AudioBufferSourceNode => {
    const s = bufSrc(noiseBuf, to); s.start(tt, ((off % 1.4) + 1.4) % 1.4); s.stop(tt + dur); return s;
  };
  const env = (g: GainNode, tt: number, peak: number, attack: number, tc: number): void => {
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(peak, tt + attack); g.gain.setTargetAtTime(0, tt + attack, tc);
  };

  function buildChain(): Chain {
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, Math.floor(sr * 2), sr);
    { const d = noiseBuf.getChannelData(0), r = mulberry32(4321); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
    vowelBuf = ctx.createBuffer(1, Math.floor(sr * 0.5), sr); vowelBuf.getChannelData(0).set(makeVowel(sr));
    const h = new Float32Array(10), im = new Float32Array(10);
    [0, 1, 0.2, 0.07, 0.025, 0.01, 0, 0, 0, 0].forEach((a, i) => { im[i] = a; });
    wave = typeof ctx.createPeriodicWave === 'function' ? ctx.createPeriodicWave(h, im) : null;

    // master: sum -> tape saturation -> glue compressor -> limiter -> soft ceiling -> out(volume/fade) -> dest
    const out = track(ctx.createGain()); out.gain.value = 0; out.connect(dest);
    const lim = track(ctx.createDynamicsCompressor());
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.12;
    lim.connect(shaper(ceilingCurve(), out));
    const glue = track(ctx.createDynamicsCompressor());
    glue.threshold.value = -17; glue.knee.value = 10; glue.ratio.value = 3; glue.attack.value = 0.012; glue.release.value = 0.16;
    glue.connect(lim);
    const sum = gain(1, filt('lowpass', 10500, 0.5, shaper(satCurve(), glue, '2x')));
    const part = (p: PartName, to: AudioNode = sum): GainNode => gain(mix[p], to);
    const pan = (p: number, from: AudioNode, to: AudioNode): void => {
      const c = ctx as unknown as { createStereoPanner?: () => StereoPannerNode };
      if (typeof c.createStereoPanner === 'function') { const sp = track(c.createStereoPanner()); sp.pan.value = p; from.connect(sp); sp.connect(to); } else from.connect(to);
    };

    // plate reverb (generated impulse) and dotted-eighth delay
    const rl = Math.floor(sr * 1.5), imp = ctx.createBuffer(2, rl, sr);
    for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c), r = mulberry32(600 + c); let lp = 0; for (let i = 0; i < rl; i++) { lp += 0.5 * ((r() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / rl, 2.8); } }
    const conv = track(ctx.createConvolver()); conv.buffer = imp;
    const rev = gain(1, conv); conv.connect(gain(0.3, sum));
    const dl = track(ctx.createDelay(1.5)); dl.delayTime.value = STEP_SEC * 3;
    const fb = gain(0.3), dlp = filt('lowpass', 1500, 0.5); const dly = gain(1, dl);
    dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(gain(0.5, sum));
    const send = (from: AudioNode, r: number, d: number): void => { if (r > 0) from.connect(gain(r, rev)); if (d > 0) from.connect(gain(d, dly)); };

    // 808: sine -> amp -> drive -> low-pass -> duck -> bus
    const duckBass = gain(1, part('bass')), duckKeys = gain(1);
    const bassLp = filt('lowpass', 800, 0.6, duckBass), bassSh = shaper(driveCurve(2.6), bassLp);
    const bassAmp = gain(0, gain(2.2, bassSh));
    const bassOsc = osc('sine', 49, bassAmp);
    // keys: periodic-wave voices -> low-pass -> chorus + 12-bit grit -> bus
    const keysBus = part('keys'); pan(-0.15, duckKeys, keysBus); send(duckKeys, 0.16, 0.14);
    const keysIn = gain(1), keysLP = filt('lowpass', 2300, 0.5, duckKeys);
    keysIn.connect(keysLP);
    keysLP.connect(shaper(gritCurve(), filt('lowpass', 2200, 0.5, gain(0.1, duckKeys))));
    const wow = gain(7), wowO = osc('sine', 0.55, wow); // tape wow, +-7 cents, shared by every key voice
    // hook: bell -> low-pass -> bus
    const hookBus = part('hook'), hookIn = gain(1), hookLp = filt('lowpass', 3000, 0.5, hookBus); hookIn.connect(hookLp); pan(0.2, hookLp, sum); hookLp.connect(hookBus); send(hookLp, 0.28, 0.34);
    // drums
    const kickBus = part('kick'), clickBp = filt('bandpass', 2600, 1, kickBus);
    const snareBus = part('snare'); const snareIn = filt('highpass', 1300, 0.7, snareBus), crackBp = filt('bandpass', 3800, 0.5, snareBus), clapBp = filt('bandpass', 1700, 0.5, snareBus);
    send(snareBus, 0.2, 0);
    const hatBus = part('hats'), hatHp = filt('highpass', 6500, 0.6), hatLp = filt('lowpass', 13000, 0.5); hatHp.connect(hatLp); pan(0.25, hatLp, hatBus);
    const crashHp = filt('highpass', 5000, 0.7, hatBus), riserBp = filt('bandpass', 400, 0.8, hatBus);
    // scratch: vowel record -> band -> grit -> bus
    const scrBus = part('scratch'), scrIn = gain(1), scrHp = filt('highpass', 260, 0.7), scrLp = filt('lowpass', 4800, 0.6);
    scrIn.connect(scrHp); scrHp.connect(shaper(driveCurve(1.6), scrLp)); pan(0.1, scrLp, scrBus); send(scrLp, 0.25, 0.1);
    // vinyl crackle, constant
    const cb = ctx.createBuffer(1, Math.floor(sr * 6), sr); cb.getChannelData(0).set(makeCrackle(sr));
    const cs = bufSrc(cb, filt('highpass', 500, 0.7, filt('lowpass', 9000, 0.7, part('crackle')))); cs.loop = true;

    for (const o of [bassOsc, wowO, cs]) o.start(ctx.currentTime);
    return { out, wow, bassOsc, bassAmp, duckBass, duckKeys, keysLP, keysIn, kickBus, clickBp, snareIn, crackBp, snareBus, clapBp, hatHp, crashHp, riserBp, hookIn, scrIn, rev, dly };
  }

  // ---------------------------------------------------------------- voices
  function duck(t: number, depth: number): void {
    const c = n!, tt = T(t);
    for (const [g, d] of [[c.duckBass, depth], [c.duckKeys, 0.6 + 0.4 * depth]] as Array<[GainNode, number]>) { g.gain.setValueAtTime(d, tt); g.gain.setTargetAtTime(1, tt + 0.01, 0.07); }
  }
  function kick(t: number, v: number): void {
    const c = n!, tt = T(t);
    const g = gain(0, c.kickBus), o = osc('sine', 150, g);
    o.frequency.setValueAtTime(150, tt); o.frequency.exponentialRampToValueAtTime(56, tt + 0.05);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.002); g.gain.setTargetAtTime(0, tt + 0.012, 0.075);
    o.start(tt); o.stop(tt + 0.45);
    const kg = gain(0, c.clickBp); kg.gain.setValueAtTime(v * 0.6, tt); kg.gain.setTargetAtTime(0, tt + 0.001, 0.003);
    const s = noise(tt, t * 3.7, 0.03, kg);
    release([o, s], [g, kg]);
  }
  function snare(t: number, g16: number, v: number, ghost: boolean): void {
    const c = n!, tt = T(t);
    const ng = gain(0, c.snareIn); ng.gain.setValueAtTime(v * 0.85, tt); ng.gain.setTargetAtTime(0, tt + 0.003, ghost ? 0.02 : 0.065);
    const cg = gain(0, c.crackBp); cg.gain.setValueAtTime(v * 0.9, tt); cg.gain.setTargetAtTime(0, tt + 0.002, ghost ? 0.01 : 0.022);
    const s1 = noise(tt, g16 * 0.173, 0.3, ng), s2 = noise(tt, g16 * 0.29 + 0.4, 0.15, cg);
    const body = gain(0, c.snareBus), to = osc('triangle', 205, body);
    to.frequency.setValueAtTime(205, tt); to.frequency.exponentialRampToValueAtTime(165, tt + 0.05);
    body.gain.setValueAtTime(v * 0.6, tt); body.gain.setTargetAtTime(0, tt + 0.003, ghost ? 0.02 : 0.04);
    to.start(tt); to.stop(tt + 0.25);
    release([s1, s2, to], [ng, cg, body]);
  }
  function clap(t: number, g16: number): void {
    const c = n!, tt = T(t), g = gain(0, c.clapBp);
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.8, tt + i * 0.011); g.gain.setTargetAtTime(0, tt + i * 0.011 + 0.003, 0.012); }
    g.gain.setValueAtTime(0.6, tt + 0.033); g.gain.setTargetAtTime(0, tt + 0.036, 0.045);
    release([noise(tt, g16 * 0.31 + 0.5, 0.3, g)], [g]);
  }
  function hat(t: number, g16: number, v: number, open: boolean): void {
    const c = n!, tt = T(t), g = gain(0, c.hatHp);
    g.gain.setValueAtTime(v, tt); g.gain.setTargetAtTime(0, tt + 0.002, open ? 0.08 : 0.011);
    release([noise(tt, g16 * 0.0917, open ? 0.4 : 0.07, g)], [g]);
  }
  function crash(t: number, g16: number): void {
    const c = n!, tt = T(t), g = gain(0, c.crashHp);
    g.gain.setValueAtTime(0.45, tt); g.gain.setTargetAtTime(0, tt + 0.01, 0.4);
    release([noise(tt, g16 * 0.05, 1.8, g)], [g]);
  }
  function riser(t: number, dur: number, g16: number): void {
    const c = n!, tt = T(t), g = gain(0, c.riserBp);
    g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.8, tt + dur); g.gain.linearRampToValueAtTime(0, tt + dur + 0.04);
    c.riserBp.frequency.setValueAtTime(400, tt); c.riserBp.frequency.exponentialRampToValueAtTime(8000, tt + dur);
    const s = bufSrc(noiseBuf, g); s.loop = true; s.start(tt, (g16 * 0.11) % 1); s.stop(tt + dur + 0.06);
    release([s], [g]);
  }
  function bassNote(t: number, midi: number, lenSteps: number, slide: boolean): void {
    const c = n!, f = midiToHz(midi), tt = T(t), end = tt + Math.max(0.08, lenSteps * STEP_SEC * 0.94);
    c.bassOsc.frequency.setValueAtTime(slide ? prevBass : f, tt);
    if (slide) c.bassOsc.frequency.exponentialRampToValueAtTime(f, tt + 0.08);
    prevBass = f;
    const a = c.bassAmp.gain;
    a.setValueAtTime(0, tt); a.linearRampToValueAtTime(1, tt + 0.005); a.setTargetAtTime(0.55, tt + 0.005, 0.28);
    a.setValueAtTime(0.4, end); a.linearRampToValueAtTime(0, end + 0.04);
  }
  function keysHit(t: number, chord: { keys: number[] }, gate: number, vel: number): void {
    const c = n!, tt = T(t), end = tt + Math.max(0.05, gate * STEP_SEC);
    const g = gain(0, c.keysIn); const a = g.gain;
    a.setValueAtTime(0, tt); a.linearRampToValueAtTime(vel * 0.3, tt + 0.004); a.setTargetAtTime(vel * 0.14, tt + 0.004, 0.3); a.setTargetAtTime(0, end, 0.014);
    const srcs: Src[] = [];
    for (const m of chord.keys) {
      const o = osc('sine', midiToHz(m), g); if (wave) o.setPeriodicWave(wave); c.wow.connect(o.detune);
      o.start(tt); o.stop(end + 0.2); srcs.push(o);
    }
    release(srcs, [g]);
  }
  function hookNote(t: number, midi: number, lenSteps: number, amp: number): void {
    const c = n!, tt = T(t), f = midiToHz(midi), dur = lenSteps * STEP_SEC;
    const g = gain(0, c.hookIn); const a = g.gain, tc = Math.min(0.45, dur * 0.75);
    a.setValueAtTime(0, tt); a.linearRampToValueAtTime(amp, tt + 0.006); a.setTargetAtTime(0, tt + 0.006, tc);
    const b = gain(0.3, g), d = gain(0.1, g);
    const o1 = osc('sine', f, g), o2 = osc('sine', f * 2, b), o3 = osc('sine', f * 3, d);
    b.gain.setValueAtTime(0.3, tt); b.gain.setTargetAtTime(0, tt, 0.12); d.gain.setValueAtTime(0.1, tt); d.gain.setTargetAtTime(0, tt, 0.04);
    for (const o of [o1, o2, o3]) { o.start(tt); o.stop(tt + dur + 0.6); }
    release([o1, o2, o3], [g, b, d]);
  }
  function scratch(t: number, flicks: Array<[number, number, number, number]>): void {
    const c = n!;
    flicks.forEach(([s, len, r0, r1], i) => {
      const tt = T(t + s * STEP_SEC), d = len * STEP_SEC, g = gain(0, c.scrIn);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.9, tt + 0.004); g.gain.setValueAtTime(0.9, tt + d * 0.8); g.gain.linearRampToValueAtTime(0, tt + d);
      const x = bufSrc(vowelBuf, g); x.playbackRate.setValueAtTime(r0, tt); x.playbackRate.linearRampToValueAtTime(r1, tt + d);
      x.start(tt, 0.02 + (i % 3) * 0.06); x.stop(tt + d + 0.02);
      release([x], [g]);
    });
  }

  // ---------------------------------------------------------------- scheduler
  function scheduleStep(gs: number, t: number): void {
    const pos = stepPosition(gs), { bar, step } = pos;
    const p = pos.intro ? INTRO_PLANS[bar] : BAR_PLANS[bar];
    const chord = CHORDS[pos.intro ? CYC_A[bar] : BAR_CHORDS[bar]];
    const sw = (step & 1) ? SWING * STEP_SEC : 0, ts = t + sw;
    const c = n!;
    if (step === 0 && !pos.intro) {
      if (bar === 16) c.keysLP.frequency.setTargetAtTime(900, T(t), 0.3);
      if (bar === 20) c.keysLP.frequency.setTargetAtTime(3200, T(t), 0.08);
    }
    if (step === 0 && p.crash) crash(t, gs);
    if (p.riser && step === 0) riser(t, BAR_SEC, gs);
    if (step < p.end) {
      if (p.kick.includes(step)) { kick(ts, step === 0 ? 1 : 0.85); duck(ts, 0.3); }
      if (p.snare && (step === 4 || step === 12)) snare(t + 0.006, gs, 1, false);
      if (p.clap && (step === 4 || step === 12)) clap(t + 0.006, gs);
      if (p.ghost && (step === 9 || step === 14) && rnd(gs) > 0.3) snare(ts, gs, 0.22, true);
      if (p.roll && step >= 8) snare(t, gs, 0.3 + (step - 8) * 0.08, false);
      if (p.hats > 0 && (p.hats === 2 || (step & 1) === 0) && !((step & 1) && rnd(gs + 7) > 0.84)) {
        hat(ts + (rnd(gs + 3) - 0.5) * 0.006, gs, HAT[step] * (p.hats === 1 ? 0.75 : 1) * (0.9 + 0.2 * rnd(gs + 5)), step === p.open);
      }
      for (const [s, off, len, sl] of BASS[p.bass]) if (s === step) bassNote(ts, chord.root + off, len, sl === 1);
      for (const [s, gate, vel] of CHOP[p.chop]) if (s === step) keysHit(ts, chord, gate, vel);
    }
    if (p.hook > 0) {
      const hb = pos.intro ? bar : bar & 3;
      for (const [s, m, len] of HOOK[hb]) if (s === step) { hookNote(ts, m, len, 1); if (p.hook === 2) hookNote(ts, m + 12, len, 0.45); }
    }
    if (p.scratch >= 0 && step === 0) scratch(t, SCRATCH[p.scratch]);
  }

  function scheduleUntil(horizon: number): void {
    if (!running || !n) return;
    const now = ctx.currentTime;
    while (stepTime(t0, nextStep) < horizon) {
      const t = stepTime(t0, nextStep);
      if (t >= now - 0.005) scheduleStep(nextStep, t);
      nextStep++;
    }
  }

  function finalize(): void {
    if (finalizeTimer) { clearTimeout(finalizeTimer); finalizeTimer = null; }
    for (const x of live) {
      try { (x as unknown as { stop?: () => void }).stop?.(); } catch { /* not started or already stopped */ }
      try { (x as unknown as { onended: unknown }).onended = null; } catch { /* ignore */ }
      try { x.disconnect(); } catch { /* already disconnected */ }
    }
    live.clear(); noiseBuf = null; vowelBuf = null; wave = null; n = null;
  }

  return {
    start() {
      if (running) return;
      if (finalizeTimer || n) finalize();
      if (typeof (ctx as AudioContext).resume === 'function' && (ctx as AudioContext).state === 'suspended') void Promise.resolve((ctx as AudioContext).resume()).catch(() => undefined);
      created = 0; prevBass = 49;
      n = buildChain();
      const now = ctx.currentTime;
      n.out.gain.setValueAtTime(0, now); n.out.gain.linearRampToValueAtTime(volume, now + 0.25);
      t0 = now + 0.06; nextStep = 0; running = true;
      n.keysLP.frequency.setValueAtTime(450, t0); n.keysLP.frequency.exponentialRampToValueAtTime(3200, t0 + INTRO_SEC);
      scheduleUntil(now + lookAhead);
      if (!opts.manual) timer = setInterval(() => scheduleUntil(ctx.currentTime + lookAhead), intervalMs);
    },
    stop(fadeSec = 0.8) {
      if (!running) return;
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
      const c = n;
      if (c) { const now = ctx.currentTime; c.out.gain.cancelScheduledValues(now); c.out.gain.setTargetAtTime(0, now, Math.max(0.005, fadeSec / 4)); }
      if (fadeSec <= 0) finalize(); else finalizeTimer = setTimeout(finalize, fadeSec * 1000 + 150);
    },
    setVolume(v: number) {
      volume = clamp01(v);
      if (running && n) { const now = ctx.currentTime; n.out.gain.cancelScheduledValues(now); n.out.gain.setTargetAtTime(volume, now, 0.04); }
    },
    get playing() { return running; },
    scheduleUntil,
    get activeNodes() { return live.size; },
    get nodesCreated() { return created; },
  };
}

export const TITLE_THEME_ENTRY = { id: 'title-theme', name: 'Title theme', artist: 'Stoop Season (original, synthesized)', bpm: TITLE_BPM, bars: LOOP_BARS, durationSec: LOOP_SEC } as const;
