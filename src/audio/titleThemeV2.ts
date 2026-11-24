/**
 * "Brownstone Hours": an original, fully synthesised title theme for the game (94 BPM, F minor, lightly swung sixteenths).
 * Plain Web Audio nodes only: no samples, no files, nothing fetched. Every note, rhythm and sound was written for this game;
 * nothing was taken or adapted from any existing piece (see docs/swarm/tasks/THEME.md for how the motif was made).
 *
 * 40 bars = about 102 s, one seamless loop (bar 39 hands back to bar 0: the pad is one set of persistent oscillators that
 * glides through the chords, so nothing is cut at the seam):
 *   0-3 pad opens, sub drone | 4-7 lone motif on a bell | 8-11 drums and rolling sub enter | 12-15 brass states the motif |
 *   16-19 brass, counter-line, ghost snares | 20-23 bell doubles an octave up, clap, stop-time | 24-27 cumbia breakdown (clave,
 *   congas, guiro, shaker) under the motif on the bell | 28-31 brass returns, four-on-the-floor kick, snare roll |
 *   32-39 full return, motif twice, then drums stop, the pad sinks and the loop turns.
 * Chords (bar by bar, repeating every four bars): Fm9 | Dbmaj7 | Bbm9 | C7b9.
 * Voices: persistent 8-oscillator pad, sine sub bass, brass (two detuned saws + filter envelope), FM bell, plucked counter-line,
 * kick, dry snare + clap, swung hats, clave, congas, guiro, shaker, one echo and one plate reverb. Master: saturation, limiter, ceiling.
 * Motif options (`?motif=a|b|c` in the page address, or opts.motif): a is the default, b and c are alternatives.
 */
import { ceilingCurve, driveCurve, midiToHz, mulberry32 } from '@/audio/loadingTheme';

export const TITLE_BPM = 94;
export const STEP_SEC = 60 / TITLE_BPM / 4;
export const STEPS_PER_BAR = 16;
export const BAR_SEC = STEP_SEC * STEPS_PER_BAR;
export const LOOP_BARS = 40;
export const LOOP_STEPS = LOOP_BARS * STEPS_PER_BAR;
export const LOOP_SEC = LOOP_STEPS * STEP_SEC;
/** Odd sixteenths of the kit and the lead are pushed late by this fraction of a step. */
export const SWING = 0.14;

export function stepPosition(g: number): { bar: number; step: number; loop: number } {
  return { bar: Math.floor(g / 16) % LOOP_BARS, step: g % 16, loop: Math.floor(g / LOOP_STEPS) };
}
export const stepTime = (t0: number, g: number): number => t0 + g * STEP_SEC;

// ---------------------------------------------------------------- notes
export type ChordName = 'Fm9' | 'Dbmaj7' | 'Bbm9' | 'C7b9';
/** root: bass MIDI; pad: four-note voicing (voice-led so each pad oscillator moves by a step or two). */
export const CHORDS: Record<ChordName, { root: number; pad: number[] }> = {
  Fm9: { root: 41, pad: [56, 60, 63, 67] },
  Dbmaj7: { root: 37, pad: [56, 60, 65, 68] },
  Bbm9: { root: 34, pad: [56, 61, 65, 70] },
  C7b9: { root: 36, pad: [58, 61, 64, 67] },
};
export const CYCLE: ChordName[] = ['Fm9', 'Dbmaj7', 'Bbm9', 'C7b9'];
export const BAR_CHORDS: ChordName[] = Array.from({ length: LOOP_BARS }, (_, i) => CYCLE[i & 3]);
/** F natural minor plus E natural (the leading tone over C7b9): F G Ab Bb C Db Eb E. */
export const KEY_PCS = [5, 7, 8, 10, 0, 1, 3, 4];

export type Note = [step: number, midi: number, lenSteps: number];
export type MotifId = 'a' | 'b' | 'c';
/**
 * The lead motif, four bars (one per chord). Written from a contour sketch (a long reaching note, a small turn, a fall, then an
 * answer that climbs and settles on C so the end leans back to the start), in F minor, degrees 1 = F. Option a, degrees:
 *   bar 1: 5(long) b7 b6 5 b3 | bar 2: 4 b6(long) 5 1' | bar 3: b3'(long) 1' b7 b6 4 | bar 4: b6 5 4 2 b3 5(long)
 */
export const MOTIFS: Record<MotifId, Note[][]> = {
  a: [
    [[0, 72, 6], [6, 75, 2], [8, 73, 3], [11, 72, 1], [12, 68, 4]],
    [[2, 70, 2], [4, 73, 6], [10, 72, 2], [12, 77, 4]],
    [[0, 80, 6], [6, 77, 2], [8, 75, 3], [11, 73, 1], [12, 70, 4]],
    [[0, 73, 2], [2, 72, 2], [4, 70, 4], [8, 67, 2], [10, 68, 2], [12, 72, 4]],
  ],
  /** Option b: climbs first, leaps up a fifth, answers with a falling run. Degrees 5 1' b7 b6 | b6 1' b3'(long) 1' b6 | 4 b6 1' b7 b6 | 5 4 2 5. */
  b: [
    [[0, 72, 2], [3, 77, 3], [6, 75, 2], [8, 73, 4], [14, 72, 2]],
    [[0, 73, 3], [4, 77, 2], [6, 80, 4], [12, 77, 2], [14, 73, 2]],
    [[0, 70, 2], [3, 73, 2], [6, 77, 3], [10, 75, 2], [12, 73, 4]],
    [[0, 72, 4], [6, 70, 2], [8, 67, 4], [14, 72, 2]],
  ],
  /** Option c: sparse and falling, long notes with air between. Degrees 1'(long) b7 b6 | b6(long) 5 3? no: b6(long) 5 b3(long) | 4 b6 5 4 | b3 2 b6? see THEME.md. */
  c: [
    [[0, 77, 8], [10, 75, 2], [12, 73, 4]],
    [[0, 73, 6], [8, 72, 2], [10, 68, 6]],
    [[0, 70, 4], [6, 73, 2], [8, 72, 4], [14, 70, 2]],
    [[0, 68, 4], [6, 67, 2], [8, 64, 3], [12, 65, 4]],
  ],
};
/** Counter-line: a lower, plucked voice that moves in the gaps and against the lead. */
export const COUNTER: Note[][] = [
  [[2, 60, 2], [5, 63, 2], [14, 65, 2]],
  [[0, 61, 2], [6, 65, 2], [8, 68, 3], [14, 65, 2]],
  [[2, 61, 2], [5, 65, 2], [8, 70, 2], [12, 68, 3]],
  [[0, 58, 2], [3, 61, 2], [6, 64, 2], [10, 67, 2], [14, 64, 2]],
];
/** Bass: [step, semitones above chord root (0, 7 or 12 stay in key on every chord), lenSteps, slideFromPrevious]. */
export type BassNote = [number, number, number, 0 | 1];
export const BASS: BassNote[][] = [
  [],
  [[0, 0, 3, 0], [3, 0, 1, 0], [6, 12, 1, 0], [8, 0, 3, 0], [11, 7, 1, 1], [14, 0, 2, 1]],
  [[0, 0, 2, 0], [3, 0, 1, 0], [4, 12, 1, 0], [6, 0, 2, 0], [8, 7, 2, 1], [10, 0, 3, 0], [14, 12, 1, 0], [15, 7, 1, 1]],
  [[0, 0, 15, 0]],
  [[0, 0, 5, 0], [6, 7, 2, 0], [10, 0, 2, 0], [13, 12, 2, 0]],
];
export const KICKS: number[][] = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 7, 10, 14], [0, 4, 8, 12], [0]];
/** Son clave 3-2 over two bars (even bar, odd bar). */
export const CLAVE: number[][] = [[0, 6, 12], [4, 8]];
export type Conga = 'lo' | 'hi' | 'slap';
export const CONGAS: Array<[number, Conga]> = [[2, 'lo'], [6, 'hi'], [8, 'slap'], [10, 'lo'], [14, 'hi'], [15, 'hi']];
export const CONGA_TURN: Array<[number, Conga]> = [[2, 'lo'], [6, 'hi'], [8, 'slap'], [10, 'lo'], [12, 'lo'], [13, 'hi'], [14, 'slap'], [15, 'hi']];

export interface BarPlan {
  /** Pad level 0..1 and low-pass cutoff in Hz. */
  pad: number; padCut: number;
  kick: number[]; snare: boolean; ghost: boolean; clap: boolean;
  /** 0 none, 1 swung sixteenths. */
  hats: 0 | 1; open: number;
  bass: number;
  /** 0 none, 1 shaker, 2 breakdown (clave, congas, guiro, shaker), 3 light (congas, shaker). */
  perc: 0 | 1 | 2 | 3;
  /** 0 none, 1 bell, 2 brass, 3 brass and bell an octave up. */
  lead: 0 | 1 | 2 | 3;
  counter: boolean; roll: boolean; riser: boolean;
  /** Kit steps >= end are silent (stop-time). */
  end: number;
}
const blank = (): BarPlan => ({ pad: 0.5, padCut: 1800, kick: [], snare: false, ghost: false, clap: false, hats: 0, open: 0, bass: 0, perc: 0, lead: 0, counter: false, roll: false, riser: false, end: 16 });

export function planForBar(barIn: number): BarPlan {
  const bar = ((barIn % LOOP_BARS) + LOOP_BARS) % LOOP_BARS, sec = bar >> 2, j = bar & 3;
  const p = blank();
  const drums = { kick: KICKS[1], snare: true, hats: 1 as const };
  const S: Array<Partial<BarPlan>> = [
    { pad: 0.55, padCut: 500 + j * 250, bass: j >= 2 ? 3 : 0 },
    { pad: 0.6, padCut: 1500, lead: 1, bass: 3, kick: j >= 2 ? KICKS[5] : [] },
    { ...drums, pad: 0.5, padCut: 1700, kick: KICKS[0], bass: 1, perc: 1 },
    { ...drums, pad: 0.5, padCut: 1800, bass: 1, lead: 2, perc: 1 },
    { ...drums, pad: 0.5, padCut: 2000, kick: KICKS[2], ghost: true, open: 14, bass: 2, lead: 2, counter: true, perc: 3 },
    { ...drums, pad: 0.5, padCut: 2400, kick: KICKS[3], clap: true, open: 14, bass: 2, lead: 3, counter: true, perc: 3 },
    { pad: 0.65, padCut: 2200, bass: 4, lead: 1, counter: j >= 2, perc: 2 },
    { ...drums, pad: 0.5, padCut: 2600, kick: KICKS[4], snare: j === 3, bass: 1, lead: 2, counter: true, perc: 3, hats: j >= 2 ? 1 : 0 },
    { ...drums, pad: 0.55, padCut: 2800, kick: KICKS[3], clap: true, open: 14, bass: 2, lead: 3, counter: true, perc: 3 },
    { ...drums, pad: 0.55, padCut: 2800, kick: KICKS[3], clap: true, open: 14, bass: 2, lead: 3, counter: true, perc: 3 },
  ];
  Object.assign(p, S[sec]);
  if (sec === 2 && j === 3) { p.kick = KICKS[3]; p.riser = true; }
  if (sec === 5 && j === 3) { p.end = 12; p.perc = 0; }
  if (bar === 31) { p.roll = true; p.riser = true; p.kick = KICKS[4]; p.snare = false; }
  if (bar === 39) { p.end = 10; p.pad = 0.3; p.padCut = 700; p.riser = true; p.counter = false; }
  return p;
}
export const BAR_PLANS: BarPlan[] = Array.from({ length: LOOP_BARS }, (_, i) => planForBar(i));

export const motifFromSearch = (search: string | undefined | null): MotifId => {
  const m = /[?&]motif=([abc])\b/i.exec(search ?? '');
  return (m ? m[1].toLowerCase() : 'a') as MotifId;
};
const pageSearch = (): string => { try { return (globalThis as { location?: { search?: string } }).location?.search ?? ''; } catch { return ''; } };

// ---------------------------------------------------------------- pure DSP helpers
const curve = (f: (x: number) => number): Float32Array => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = f((i * 2) / 1023 - 1); return c; };
/** Gentle tanh saturation, unity at full scale. */
export const satCurve = (): Float32Array => curve((x) => Math.tanh(1.3 * x) / Math.tanh(1.3));
/** Guiro scraper: noise under ridges (about 50 per second), so a swept band-pass reads as a scrape. */
export function makeGuiro(sr: number, secs = 0.5, seed = 31): Float32Array {
  const r = mulberry32(seed), n = Math.floor(sr * secs), d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.sqrt(Math.abs(Math.sin((Math.PI * 50 * i) / sr)));
  return d;
}

// ---------------------------------------------------------------- engine
export type PartName = 'kick' | 'snare' | 'hats' | 'bass' | 'pad' | 'brass' | 'bell' | 'counter' | 'perc';
export const DEFAULT_MIX: Record<PartName, number> = { kick: 0.4, snare: 0.55, hats: 0.3, bass: 0.2, pad: 0.1, brass: 0.2, bell: 0.2, counter: 0.17, perc: 0.3 };

export interface TitleThemeOptions {
  /** Output level 0..1 (default 0.76). */
  volume?: number;
  /** Seconds scheduled ahead of ctx.currentTime (default 0.1). */
  lookAhead?: number;
  intervalMs?: number;
  /** No timer: the caller drives scheduleUntil() (offline rendering, tests). */
  manual?: boolean;
  mix?: Partial<Record<PartName, number>>;
  /** Lead motif: a (default), b or c. When omitted, `?motif=` in the page address picks it. */
  motif?: MotifId;
  /** Start part-way in (audition and offline checks); default 0. */
  startBar?: number;
}
export interface TitleTheme {
  start(): void;
  stop(fadeSec?: number): void;
  setVolume(v: number): void;
  readonly playing: boolean;
  scheduleUntil(horizon: number): void;
  /** Hold the music (silent, nothing scheduled) and carry on from the same bar. */
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  readonly activeNodes: number;
  readonly nodesCreated: number;
}
type Src = AudioScheduledSourceNode;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function createTitleTheme(ctx: BaseAudioContext, dest: AudioNode, opts: TitleThemeOptions = {}): TitleTheme {
  const lookAhead = opts.lookAhead ?? 0.1, intervalMs = opts.intervalMs ?? 25;
  const mix: Record<PartName, number> = { ...DEFAULT_MIX, ...(opts.mix ?? {}) };
  const motif = MOTIFS[opts.motif ?? motifFromSearch(pageSearch())] ?? MOTIFS.a;
  let volume = clamp01(opts.volume ?? 0.76);
  let running = false, paused = false, pausedAt = 0, t0 = 0, nextStep = 0, created = 0, prevBass = 98;
  let timer: ReturnType<typeof setInterval> | null = null, finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  const live = new Set<AudioNode>();
  const T = (t: number): number => Math.max(t, ctx.currentTime);
  let noiseBuf: AudioBuffer | null = null, guiroBuf: AudioBuffer | null = null;
  let out: GainNode | null = null;
  let padOscs: OscillatorNode[] = [], padLP: BiquadFilterNode, padAmp: GainNode, bassOsc: OscillatorNode, bassAmp: GainNode, duckBass: GainNode, duckPad: GainNode;
  let kickBus: GainNode, snareIn: BiquadFilterNode, crackBp: BiquadFilterNode, clapBp: BiquadFilterNode, snareBus: GainNode, hatHp: BiquadFilterNode, percIn: GainNode, guiroBp: BiquadFilterNode, clickBp: BiquadFilterNode, clavBus: GainNode;
  let brassIn: GainNode, bellIn: GainNode, countIn: GainNode, lfoDepth: GainNode, riseBp: BiquadFilterNode, riseGain: GainNode;

  const track = <A extends AudioNode>(x: A): A => { live.add(x); created++; return x; };
  const gain = (v: number, to?: AudioNode): GainNode => { const g = track(ctx.createGain()); g.gain.value = v; if (to) g.connect(to); return g; };
  const filt = (type: BiquadFilterType, f: number, q: number, to?: AudioNode): BiquadFilterNode => {
    const b = track(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b;
  };
  const shaper = (c: Float32Array, to?: AudioNode, os: OverSampleType = 'none'): WaveShaperNode => {
    const w = track(ctx.createWaveShaper()); w.curve = c as Float32Array<ArrayBuffer>; w.oversample = os; if (to) w.connect(to); return w;
  };
  const drop = (xs: AudioNode[]): void => {
    for (const x of xs) {
      try { (x as unknown as { onended: unknown }).onended = null; } catch { /* ignore */ }
      try { x.disconnect(); } catch { /* already disconnected */ }
      live.delete(x);
    }
  };
  const release = (srcs: Src[], nodes: AudioNode[]): void => {
    let left = srcs.length; const all = [...srcs, ...nodes];
    for (const s of srcs) s.onended = () => { if (--left <= 0) drop(all); };
  };
  const osc = (type: OscillatorType, hz: number, to: AudioNode): OscillatorNode => { const o = track(ctx.createOscillator()); o.type = type; o.frequency.value = hz; o.connect(to); return o; };
  const bufSrc = (buf: AudioBuffer | null, to: AudioNode): AudioBufferSourceNode => { const s = track(ctx.createBufferSource()); s.buffer = buf; s.connect(to); return s; };
  const noise = (tt: number, off: number, dur: number, to: AudioNode): AudioBufferSourceNode => {
    const s = bufSrc(noiseBuf, to); s.start(tt, ((off % 1.4) + 1.4) % 1.4); s.stop(tt + dur); return s;
  };

  function buildChain(): void {
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, Math.floor(sr * 2), sr);
    { const d = noiseBuf.getChannelData(0), r = mulberry32(4321); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
    guiroBuf = ctx.createBuffer(1, Math.floor(sr * 0.5), sr); guiroBuf.getChannelData(0).set(makeGuiro(sr));

    // master: sum -> saturation -> limiter -> soft ceiling -> out (volume, fade) -> dest
    const o0 = out = track(ctx.createGain()); o0.gain.value = 0; o0.connect(dest);
    const lim = track(ctx.createDynamicsCompressor());
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.15;
    lim.connect(shaper(ceilingCurve(), o0));
    const sum = gain(1, filt('highpass', 38, 0.7, filt('highshelf', 3500, 0.7, filt('lowpass', 12000, 0.5, shaper(satCurve(), lim)))));
    
    const part = (p: PartName): GainNode => gain(mix[p], sum);

    // plate reverb and a dotted-eighth echo (shared sends)
    const rl = Math.floor(sr * 1.8), imp = ctx.createBuffer(1, rl, sr), d = imp.getChannelData(0), r = mulberry32(600);
    for (let i = 0, lp = 0; i < rl; i++) { lp += 0.4 * ((r() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / rl, 2.6); }
    const conv = track(ctx.createConvolver()); conv.buffer = imp;
    const rev = gain(1, conv); conv.connect(gain(0.32, sum));
    const dly = track(ctx.createDelay(1)); dly.delayTime.value = STEP_SEC * 3;
    const fb = gain(0.34, filt('lowpass', 2400, 0.5, dly)); dly.connect(fb);
    const echo = gain(1, dly); dly.connect(gain(0.5, sum)); dly.connect(rev);
    const send = (from: AudioNode, rv: number, ec = 0): void => { if (rv > 0) from.connect(gain(rv, rev)); if (ec > 0) from.connect(gain(ec, echo)); };

    // pad: four saws and four triangles, persistent, gliding between chords
    const padBus = part('pad'); duckPad = gain(1, padBus); padAmp = gain(0.5, duckPad);
    padLP = filt('lowpass', 500, 0.7, filt('highpass', 130, 0.5, padAmp)); send(padBus, 0.35);
    const triIn = gain(0.9, padLP), sawIn = gain(0.45, padLP);
    CHORDS.Fm9.pad.forEach((m) => {
      const a = osc('sawtooth', midiToHz(m), sawIn), b = osc('triangle', midiToHz(m), triIn); a.detune.value = 5; b.detune.value = -4; padOscs.push(a, b);
    });
    // lfo for vibrato (shared by every brass voice)
    const lfo = osc('sine', 5.1, lfoDepth = gain(5)); lfo.start(ctx.currentTime);
    // sub bass: sine -> drive -> low-pass -> duck -> bus
    duckBass = gain(1, part('bass'));
    bassAmp = gain(0, gain(1.8, shaper(driveCurve(2.4), filt('lowpass', 650, 0.6, duckBass))));
    bassOsc = osc('sine', 49, bassAmp);
    // lead voices
    brassIn = gain(1); { const lp = filt('lowpass', 5200, 0.5, part('brass')); brassIn.connect(lp); send(lp, 0.22, 0.2); }
    bellIn = gain(1); { const b = part('bell'); bellIn.connect(b); send(b, 0.4, 0.28); }
    countIn = gain(1); { const b = part('counter'); countIn.connect(b); send(b, 0.25, 0.1); }
    // drums
    kickBus = part('kick');
    snareBus = part('snare'); snareIn = filt('highpass', 1200, 0.7, snareBus); crackBp = filt('bandpass', 3300, 0.6, snareBus); clapBp = filt('bandpass', 1600, 0.5, snareBus); send(snareBus, 0.14);
    const hatBus = part('hats'), hatLp = filt('lowpass', 12000, 0.5, hatBus); hatHp = filt('highpass', 6500, 0.6, hatLp);
    // percussion
    const pb = part('perc'); percIn = gain(1, pb); send(pb, 0.12);
    guiroBp = filt('bandpass', 4300, 1.1, percIn); clickBp = filt('bandpass', 2600, 0.8, percIn); clavBus = gain(1, percIn);
    // riser
    riseBp = filt('bandpass', 400, 1.5, riseGain = gain(0, part('hats'))); riseGain.connect(rev);
    for (const o of [bassOsc, ...padOscs]) o.start(ctx.currentTime);
  }

  // ---------------------------------------------------------------- voices
  function duck(t: number, depth: number): void {
    const tt = T(t);
    for (const [g, dp] of [[duckBass, depth], [duckPad, 0.55 + 0.45 * depth]] as Array<[GainNode, number]>) { g.gain.setValueAtTime(dp, tt); g.gain.setTargetAtTime(1, tt + 0.012, 0.09); }
  }
  function hit(to: AudioNode, tt: number, off: number, dur: number, v: number, tc: number, nb = 1, gap = 0): void {
    const g = gain(0, to);
    for (let i = 0; i < nb; i++) { g.gain.setValueAtTime(v, tt + i * gap); g.gain.setTargetAtTime(0, tt + i * gap + 0.002, i === nb - 1 ? tc * (nb > 1 ? 3.7 : 1) : tc); }
    release([noise(tt, off, dur, g)], [g]);
  }
  function kick(t: number, v: number): void {
    const tt = T(t), g = gain(0, kickBus), o = osc('sine', 160, g);
    o.frequency.setValueAtTime(160, tt); o.frequency.exponentialRampToValueAtTime(46, tt + 0.07);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.003); g.gain.setTargetAtTime(0, tt + 0.02, 0.11);
    o.start(tt); o.stop(tt + 0.6); release([o], [g]);
  }
  function snare(t: number, g16: number, v: number, ghost: boolean): void {
    const tt = T(t), body = gain(0, snareBus), to = osc('triangle', 190, body), k = ghost ? 0.35 : 1;
    hit(snareIn, tt, g16 * 0.173, 0.25, v * 0.55, 0.05 * k);
    hit(crackBp, tt, g16 * 0.29 + 0.4, 0.12, v * 1.0, 0.018 * k);
    to.frequency.setValueAtTime(190, tt); to.frequency.exponentialRampToValueAtTime(150, tt + 0.05);
    body.gain.setValueAtTime(v * 0.7, tt); body.gain.setTargetAtTime(0, tt + 0.003, 0.035 * k);
    to.start(tt); to.stop(tt + 0.22); release([to], [body]);
  }
  const clap = (t: number, g16: number): void => hit(clapBp, T(t), g16 * 0.31 + 0.5, 0.3, 0.6, 0.012, 4, 0.011);
  const hat = (t: number, g16: number, v: number, open: boolean): void => hit(hatHp, T(t), g16 * 0.0917, open ? 0.35 : 0.06, v, open ? 0.07 : 0.01);
  function bassNote(t: number, midi: number, lenSteps: number, slide: boolean): void {
    const f = midiToHz(midi), tt = T(t), end = tt + Math.max(0.09, lenSteps * STEP_SEC * 0.95);
    bassOsc.frequency.setValueAtTime(slide ? prevBass : f, tt);
    if (slide) bassOsc.frequency.exponentialRampToValueAtTime(f, tt + 0.09);
    prevBass = f;
    const a = bassAmp.gain;
    a.setValueAtTime(0, tt); a.linearRampToValueAtTime(1, tt + 0.008); a.setTargetAtTime(0.6, tt + 0.008, 0.3);
    a.setValueAtTime(0.45, end); a.linearRampToValueAtTime(0, end + 0.05);
  }
  function brass(t: number, midi: number, lenSteps: number, amp: number): void {
    const tt = T(t), f = midiToHz(midi), end = tt + lenSteps * STEP_SEC * 0.96;
    const g = gain(0, brassIn), lp = filt('lowpass', 700, 0.9, g);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(amp, tt + 0.035); g.gain.setValueAtTime(amp * 0.85, end); g.gain.setTargetAtTime(0, end, 0.07);
    lp.frequency.setValueAtTime(900, tt); lp.frequency.exponentialRampToValueAtTime(4800, tt + 0.1); lp.frequency.setTargetAtTime(2600, tt + 0.12, 0.35);
    const o1 = osc('sawtooth', f, lp), o2 = osc('sawtooth', f, lp); o1.detune.value = 7; o2.detune.value = -7;
    lfoDepth.connect(o1.detune); lfoDepth.connect(o2.detune);
    for (const o of [o1, o2]) { o.start(tt); o.stop(end + 0.5); }
    release([o1, o2], [g, lp]);
  }
  function bell(t: number, midi: number, lenSteps: number, amp: number): void {
    const tt = T(t), f = midiToHz(midi), dur = lenSteps * STEP_SEC, tc = Math.min(1.1, dur * 0.8 + 0.25);
    const g = gain(0, bellIn), mg = gain(f * 2.4), c = osc('sine', f, g), m = osc('sine', f * 3.5, mg);
    mg.connect(c.frequency);
    mg.gain.setValueAtTime(f * 2.4, tt); mg.gain.setTargetAtTime(f * 0.15, tt, 0.18);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(amp, tt + 0.003); g.gain.setTargetAtTime(0, tt + 0.003, tc);
    for (const o of [c, m]) { o.start(tt); o.stop(tt + tc * 4 + 0.1); }
    release([c, m], [g, mg]);
  }
  function pluck(t: number, midi: number, lenSteps: number): void {
    const tt = T(t), f = midiToHz(midi), tc = Math.min(0.5, lenSteps * STEP_SEC * 0.7 + 0.1);
    const g = gain(0, countIn), lp = filt('lowpass', 1500, 0.6, g), h = gain(0.3, lp), a = osc('triangle', f, lp), b = osc('sine', f * 2, h);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1, tt + 0.004); g.gain.setTargetAtTime(0, tt + 0.004, tc);
    lp.frequency.setValueAtTime(2600, tt); lp.frequency.setTargetAtTime(700, tt, 0.12);
    for (const o of [a, b]) { o.start(tt); o.stop(tt + tc * 4 + 0.1); }
    release([a, b], [g, lp, h]);
  }
  function conga(t: number, kind: Conga, v: number): void {
    const tt = T(t), f = kind === 'lo' ? 215 : kind === 'hi' ? 310 : 380, g = gain(0, percIn), o = osc('sine', f * 1.35, g);
    o.frequency.setValueAtTime(f * 1.35, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.025);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.002); g.gain.setTargetAtTime(0, tt + 0.01, kind === 'slap' ? 0.03 : 0.07);
    o.start(tt); o.stop(tt + 0.4); release([o], [g]);
    hit(clickBp, tt, ((tt * 7) % 1.3), kind === 'slap' ? 0.1 : 0.04, v * (kind === 'slap' ? 1.1 : 0.35), kind === 'slap' ? 0.025 : 0.006);
  }
  function clave(t: number, v: number): void {
    const tt = T(t), g = gain(0, clavBus), o = osc('triangle', 2450, g), o2 = osc('sine', 1800, g);
    g.gain.setValueAtTime(v, tt); g.gain.setTargetAtTime(0, tt + 0.002, 0.012);
    for (const x of [o, o2]) { x.start(tt); x.stop(tt + 0.12); }
    release([o, o2], [g]);
  }
  function guiro(t: number, long: boolean, v: number): void {
    const tt = T(t), dur = long ? STEP_SEC * 2.6 : STEP_SEC * 0.8, g = gain(0, guiroBp);
    if (long) { g.gain.setValueAtTime(v * 0.3, tt); g.gain.linearRampToValueAtTime(v, tt + dur * 0.85); g.gain.linearRampToValueAtTime(0, tt + dur); } else { g.gain.setValueAtTime(v * 0.7, tt); g.gain.linearRampToValueAtTime(0, tt + dur); }
    const s = bufSrc(guiroBuf, g); s.playbackRate.value = long ? 0.9 : 1.5; s.start(tt, 0); s.stop(tt + dur + 0.01); release([s], [g]);
  }
  function shaker(t: number, g16: number, v: number): void { hit(hatHp, T(t), g16 * 0.0917 + 0.9, 0.05, v, 0.014); }
  function riser(t: number, dur: number): void {
    const tt = T(t);
    riseBp.frequency.cancelScheduledValues(tt); riseBp.frequency.setValueAtTime(300, tt); riseBp.frequency.exponentialRampToValueAtTime(7000, tt + dur);
    riseGain.gain.cancelScheduledValues(tt); riseGain.gain.setValueAtTime(0, tt); riseGain.gain.linearRampToValueAtTime(0.55, tt + dur * 0.96); riseGain.gain.linearRampToValueAtTime(0, tt + dur);
    release([noise(tt, 0.2, dur + 0.05, riseBp)], []);
  }

  // ---------------------------------------------------------------- scheduler
  function scheduleStep(gs: number, t: number): void {
    const { bar, step } = stepPosition(gs), p = BAR_PLANS[bar], chord = CHORDS[BAR_CHORDS[bar]];
    const sw = (step & 1) ? SWING * STEP_SEC : 0, ts = t + sw, j = bar & 3;
    if (step === 0) {
      const tt = T(t);
      padOscs.forEach((o, i) => o.frequency.setTargetAtTime(midiToHz(chord.pad[i >> 1]), tt, 0.14));
      padLP.frequency.setTargetAtTime(p.padCut, tt, bar === 0 ? 0.6 : 0.4);
      padAmp.gain.setTargetAtTime(p.pad, tt, 0.5);
      if (p.riser) riser(t, bar === 39 ? BAR_SEC * 0.75 : BAR_SEC);
    }
    if (step < p.end) {
      if (p.kick.includes(step)) { kick(ts, step === 0 ? 1 : 0.8); duck(ts, 0.35); }
      if (p.snare && (step === 4 || step === 12)) snare(t + 0.008, gs, 1, false);
      if (p.clap && (step === 4 || step === 12)) clap(t + 0.008, gs);
      if (p.ghost && (step === 9 || step === 15)) snare(ts, gs, 0.2, true);
      if (p.roll && step >= 8) snare(t, gs, 0.25 + (step - 8) * 0.08, false);
      if (p.hats === 1 && !((step & 1) && (mulberry32(gs + 7)() > 0.86))) {
        hat(ts, gs, (step % 4 === 0 ? 0.5 : step % 2 === 0 ? 0.34 : 0.16) * (0.9 + 0.2 * mulberry32(gs + 5)()), step === p.open);
      }
      for (const [s, off, len, sl] of BASS[p.bass]) if (s === step) bassNote(ts, chord.root + off, len, sl === 1);
    }
    if (p.perc === 1 && (step & 1) === 0) shaker(t, gs, step % 4 === 0 ? 0.4 : 0.22);
    if (p.perc === 3) {
      if ((step & 1) === 0) shaker(t, gs, step % 4 === 0 ? 0.32 : 0.18);
      for (const [s, k] of (j === 3 ? CONGA_TURN : CONGAS)) if (s === step && k !== 'slap') conga(t, k, 0.4);
    }
    if (p.perc === 2) {
      shaker(t, gs, step % 4 === 0 ? 0.55 : step % 2 === 0 ? 0.35 : 0.22);
      if (CLAVE[bar & 1].includes(step)) clave(t, 0.9);
      for (const [s, k] of (j === 3 ? CONGA_TURN : CONGAS)) if (s === step) conga(t, k, k === 'slap' ? 0.55 : 0.6);
      if (step % 4 === 0) guiro(t, true, 0.8);
      if (step % 4 === 3) guiro(t, false, 0.8);
    }
    if (p.lead > 0) {
      for (const [s, m, len] of motif[j]) if (s === step) {
        if (p.lead === 1) bell(ts, m, len, 1);
        else { brass(ts, m, len, 1); if (p.lead === 3) bell(ts, m + 12, len, 0.8); }
      }
    }
    if (p.counter) for (const [s, m, len] of COUNTER[j]) if (s === step) pluck(ts, m, len);
  }

  function scheduleUntil(horizon: number): void {
    if (!running || !out) return;
    const now = ctx.currentTime, audible = volume > 0 && !paused;
    if (paused) return;
    while (stepTime(t0, nextStep) < horizon) {
      const t = stepTime(t0, nextStep);
      if (audible && t >= now - 0.005) scheduleStep(nextStep, t);
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
    live.clear(); noiseBuf = null; guiroBuf = null; out = null; padOscs = [];
  }

  return {
    start() {
      if (running) return;
      if (finalizeTimer || out) finalize();
      if (typeof (ctx as AudioContext).resume === 'function' && (ctx as AudioContext).state === 'suspended') void Promise.resolve((ctx as AudioContext).resume()).catch(() => undefined);
      created = 0; prevBass = 98; paused = false;
      buildChain();
      const now = ctx.currentTime;
      out!.gain.setValueAtTime(0, now); out!.gain.linearRampToValueAtTime(volume, now + 0.4);
      t0 = now + 0.06; nextStep = Math.max(0, Math.floor(opts.startBar ?? 0)) * 16; t0 -= nextStep * STEP_SEC; running = true;
      scheduleUntil(now + lookAhead);
      if (!opts.manual) timer = setInterval(() => scheduleUntil(ctx.currentTime + lookAhead), intervalMs);
    },
    stop(fadeSec = 0.8) {
      if (!running) return;
      running = false; paused = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (out) { const now = ctx.currentTime; out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, Math.max(0.005, fadeSec / 4)); }
      if (fadeSec <= 0) finalize(); else finalizeTimer = setTimeout(finalize, fadeSec * 1000 + 150);
    },
    setVolume(v: number) {
      volume = clamp01(v);
      if (running && out && !paused) { const now = ctx.currentTime; out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(volume, now, 0.04); }
    },
    pause() {
      if (!running || paused) return;
      paused = true; pausedAt = ctx.currentTime;
      if (out) { const now = ctx.currentTime; out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, 0.05); }
    },
    resume() {
      if (!running || !paused) return;
      paused = false;
      const now = ctx.currentTime;
      t0 += Math.max(0, now - pausedAt); // carry on from the same step
      if (out) { out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(volume, now, 0.08); }
    },
    get paused() { return paused; },
    get playing() { return running; },
    scheduleUntil,
    get activeNodes() { return live.size; },
    get nodesCreated() { return created; },
  };
}

export const TITLE_THEME_ENTRY = { id: 'title-theme-v2', name: 'Title theme', artist: 'Brownstone Hours (original, synthesized)', bpm: TITLE_BPM, bars: LOOP_BARS, durationSec: LOOP_SEC } as const;
