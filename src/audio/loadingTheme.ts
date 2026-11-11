/**
 * "Bed-Stuy Boogie": an original, fully synthesized mid-tempo funk/disco loading-screen theme (108 BPM, A dorian).
 * Everything is generated with plain Web Audio nodes (no files, no samples, no ScriptProcessor). The melodies, bass lines
 * and chord voicings below were written for this game; they are not a transcription of any existing tune.
 *
 * Arrangement (32 bars, about 71 s, loops seamlessly):
 *   0-3 intro | 4-11 groove | 12-19 groove + lead guitar | 20-23 breakdown + riser | 24-29 final groove | 30-31 turnaround.
 *
 * Parts: disco bass (mono, persistent voice, resonant low-pass, glide, kick sidechain), muted "chicka" rhythm guitar
 * (Karplus-Strong strings pre-rendered into reused buffers, strummed, wah + overdrive + cab), cheesy lead guitar (saw/square
 * through overdrive with bends and vibrato, call-and-response), drums (sine kick, snare, clap, swung hats, toms, cowbell, riser),
 * e-piano comping, string stabs / pad, brass stabs. Master: compressor + soft ceiling (peak stays below -3 dBFS).
 */

// ---------------------------------------------------------------- timing

export const LOADING_BPM = 108;
export const BEAT_SEC = 60 / LOADING_BPM;
export const STEP_SEC = BEAT_SEC / 4;
export const BAR_SEC = BEAT_SEC * 4;
export const STEPS_PER_BAR = 16;
export const LOOP_BARS = 32;
export const LOOP_STEPS = LOOP_BARS * STEPS_PER_BAR;
export const LOOP_SEC = LOOP_STEPS * STEP_SEC;
/** Odd 16ths are pushed late by this fraction of a step (hats, guitar, keys, cowbell). */
export const SWING = 0.12;

/** Position inside the looping arrangement for a free-running global 16th-note counter. */
export function stepPosition(globalStep: number): { bar: number; step: number; loop: number } {
  const s = ((globalStep % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  return { bar: Math.floor(s / STEPS_PER_BAR), step: s % STEPS_PER_BAR, loop: Math.floor(globalStep / LOOP_STEPS) };
}
export function stepTime(t0: number, globalStep: number): number { return t0 + globalStep * STEP_SEC; }

// ---------------------------------------------------------------- note data

export type ChordName = 'Am7' | 'D9' | 'Cmaj7' | 'Em7';
export interface ChordDef {
  name: ChordName;
  /** Pitch classes of the chord tones. */
  pcs: number[];
  /** Bass root (MIDI) and the chord's seventh above it, in semitones. */
  bassRoot: number;
  seventh: number;
  gtr: number[];
  keys: number[];
  brass: number[];
}
export const KEY_PCS = [9, 11, 0, 2, 4, 6, 7]; // A dorian: A B C D E F# G

export const CHORDS: Record<ChordName, ChordDef> = {
  Am7: { name: 'Am7', pcs: [9, 0, 4, 7], bassRoot: 45, seventh: 10, gtr: [57, 60, 64, 67], keys: [64, 67, 72, 76], brass: [69, 72, 76] },
  D9: { name: 'D9', pcs: [2, 6, 9, 0, 4], bassRoot: 50, seventh: 10, gtr: [60, 64, 66, 69], keys: [66, 69, 72, 76], brass: [69, 72, 78] },
  Cmaj7: { name: 'Cmaj7', pcs: [0, 4, 7, 11], bassRoot: 48, seventh: 11, gtr: [59, 64, 67, 72], keys: [67, 71, 76, 79], brass: [67, 72, 76] },
  Em7: { name: 'Em7', pcs: [4, 7, 11, 2], bassRoot: 40, seventh: 10, gtr: [59, 62, 64, 67], keys: [67, 71, 74, 79], brass: [67, 71, 74] },
};

const PROG8: ChordName[] = ['Am7', 'Am7', 'D9', 'D9', 'Cmaj7', 'Em7', 'D9', 'Am7'];
export const BAR_CHORDS: ChordName[] = [
  'Am7', 'Am7', 'D9', 'D9', // intro
  ...PROG8, ...PROG8, // groove, groove + lead
  'Cmaj7', 'Em7', 'D9', 'D9', // breakdown
  ...PROG8.slice(0, 6), // final
  'Cmaj7', 'D9', // turnaround
];

export type BassKind = 'r' | 'o' | 'f' | 's';
export type BassStep = [step: number, kind: BassKind, len: number];
export const BASS_FUNK: BassStep[] = [[0, 'r', 2], [3, 'o', 1], [4, 'r', 1], [6, 'o', 1], [8, 'r', 2], [10, 'o', 1], [11, 'f', 1], [12, 'r', 1], [14, 's', 1], [15, 'o', 1]];
export const BASS_FUNK2: BassStep[] = [[0, 'r', 1], [2, 'o', 1], [3, 'r', 1], [4, 'o', 1], [6, 'r', 1], [8, 'r', 1], [10, 'o', 1], [12, 'f', 1], [13, 's', 1], [14, 'o', 1]];
export const BASS_SIMPLE: BassStep[] = [[0, 'r', 3], [4, 'r', 1], [8, 'r', 3], [12, 'f', 1], [14, 's', 1]];
export const BASS_SUSTAIN: BassStep[] = [[0, 'r', 14]];
export function bassMidi(chord: ChordDef, kind: BassKind): number {
  return chord.bassRoot + (kind === 'r' ? 0 : kind === 'o' ? 12 : kind === 'f' ? 7 : chord.seventh);
}

export interface LeadNote { step: number; midi: number; len: number; bend?: number; vib?: boolean; }
/** Eight-bar lead hook, one array per bar of the Am7 Am7 D9 D9 Cmaj7 Em7 D9 Am7 cycle. Call in the first bar of each pair, response in the second. */
export const LEAD_CYCLE: LeadNote[][] = [
  [{ step: 0, midi: 76, len: 3, bend: 2 }, { step: 4, midi: 74, len: 2 }, { step: 6, midi: 72, len: 2 }, { step: 8, midi: 69, len: 5, vib: true }, { step: 14, midi: 71, len: 2 }],
  [{ step: 0, midi: 72, len: 2 }, { step: 2, midi: 74, len: 1 }, { step: 3, midi: 76, len: 1 }, { step: 4, midi: 79, len: 4, bend: 3, vib: true }, { step: 8, midi: 76, len: 2 }, { step: 10, midi: 74, len: 1 }, { step: 11, midi: 72, len: 1 }, { step: 12, midi: 69, len: 4, vib: true }],
  [{ step: 0, midi: 78, len: 3, bend: 2 }, { step: 4, midi: 76, len: 2 }, { step: 6, midi: 74, len: 2 }, { step: 8, midi: 72, len: 3 }, { step: 12, midi: 69, len: 4, vib: true }],
  [{ step: 0, midi: 74, len: 2 }, { step: 2, midi: 76, len: 1 }, { step: 3, midi: 78, len: 1 }, { step: 4, midi: 81, len: 6, bend: 2, vib: true }, { step: 10, midi: 79, len: 1 }, { step: 11, midi: 78, len: 1 }, { step: 12, midi: 76, len: 4, vib: true }],
  [{ step: 0, midi: 76, len: 2 }, { step: 2, midi: 79, len: 2 }, { step: 4, midi: 74, len: 2 }, { step: 6, midi: 72, len: 2 }, { step: 8, midi: 76, len: 4, bend: 2, vib: true }, { step: 12, midi: 79, len: 4, vib: true }],
  [{ step: 0, midi: 71, len: 2 }, { step: 2, midi: 74, len: 2 }, { step: 4, midi: 76, len: 3, bend: 2 }, { step: 8, midi: 79, len: 2 }, { step: 10, midi: 78, len: 2 }, { step: 12, midi: 76, len: 4, vib: true }],
  [{ step: 0, midi: 74, len: 2 }, { step: 2, midi: 78, len: 2 }, { step: 4, midi: 81, len: 6, bend: 2, vib: true }, { step: 12, midi: 78, len: 1 }, { step: 13, midi: 76, len: 1 }, { step: 14, midi: 74, len: 2 }],
  [{ step: 0, midi: 69, len: 6, vib: true }, { step: 8, midi: 72, len: 1 }, { step: 9, midi: 74, len: 1 }, { step: 10, midi: 76, len: 2 }, { step: 12, midi: 81, len: 4, bend: 2, vib: true }],
];
export const LEAD_TURN: LeadNote[] = [{ step: 0, midi: 79, len: 14, bend: 2, vib: true }];

export function leadNotesForBar(bar: number): LeadNote[] {
  if (bar >= 10 && bar <= 11) return LEAD_CYCLE[bar - 4] ?? [];
  if (bar >= 12 && bar <= 19) return LEAD_CYCLE[bar - 12] ?? [];
  if (bar >= 24 && bar <= 29) return LEAD_CYCLE[bar - 24] ?? [];
  if (bar === 30) return LEAD_TURN;
  return [];
}

/** Rhythm guitar bars: X palm-muted stab, O ringing stab, x muted scratch, . rest. */
export const GTR_PAT_A = 'OxxXxxXxxXxxxxXx';
export const GTR_PAT_B = 'OxXxxxXxxXxXxxXx';
export const EP_STEPS = [3, 10];
export const STRING_STEPS = [0, 10];

export interface BarPlan {
  section: 'intro' | 'groove' | 'lead' | 'breakdown' | 'final' | 'turn';
  kick: 'none' | 'four' | 'late' | 'half';
  snare: boolean;
  clap: boolean;
  hats: 'none' | 'eighth' | 'full' | 'half';
  bass: 'none' | 'sustain' | 'simple' | 'funk' | 'funk2';
  gtr: boolean;
  keys: boolean;
  strings: 'none' | 'stab' | 'pad';
  brass: number[];
  cowbell: boolean;
  fill: 'none' | 'tom' | 'roll';
  riser: 'none' | 'long' | 'short';
  crash: boolean;
}

export function planForBar(barIn: number): BarPlan {
  const bar = ((barIn % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;
  const p: BarPlan = { section: 'groove', kick: 'four', snare: true, clap: false, hats: 'full', bass: 'funk', gtr: true, keys: true, strings: 'none', brass: [], cowbell: false, fill: 'none', riser: 'none', crash: false };
  if (bar < 4) {
    p.section = 'intro';
    p.keys = bar === 0 || bar === 3; p.gtr = true; p.snare = bar >= 2;
    p.kick = bar >= 1 ? 'four' : 'late';
    p.hats = bar < 2 ? 'eighth' : 'full';
    p.bass = bar >= 2 ? 'simple' : bar === 0 ? 'sustain' : 'none';
    p.fill = bar === 3 ? 'tom' : 'none';
    p.crash = bar === 0;
  } else if (bar < 12) {
    p.section = 'groove';
    p.bass = bar % 4 === 3 ? 'funk2' : 'funk';
    p.crash = bar === 4;
    p.cowbell = bar === 7 || bar === 11;
    p.fill = bar === 11 ? 'tom' : 'none';
  } else if (bar < 20) {
    p.section = 'lead';
    p.bass = bar % 2 === 1 ? 'funk2' : 'funk';
    p.clap = true; p.strings = 'stab';
    p.crash = bar === 12;
    p.cowbell = bar % 2 === 1;
    p.brass = bar === 12 || bar === 16 ? [0] : bar === 15 || bar === 19 ? [14] : [];
    p.fill = bar === 19 ? 'tom' : 'none';
  } else if (bar < 24) {
    p.section = 'breakdown';
    p.kick = bar === 22 ? 'late' : bar === 23 ? 'four' : 'none';
    p.snare = bar === 23; p.hats = bar === 23 ? 'full' : 'eighth';
    p.bass = bar >= 22 ? 'simple' : 'sustain';
    p.keys = false; p.strings = 'pad';
    p.riser = bar === 22 ? 'long' : 'none';
    p.fill = bar === 23 ? 'tom' : 'none';
  } else if (bar < 30) {
    p.section = 'final';
    p.bass = bar % 2 === 1 ? 'funk2' : 'funk';
    p.clap = true; p.strings = 'stab';
    p.crash = bar === 24;
    p.cowbell = bar % 2 === 0;
    p.brass = bar === 24 ? [0, 14] : bar === 27 ? [14] : bar === 29 ? [10] : [];
    p.fill = bar === 29 ? 'roll' : 'none';
  } else {
    p.section = 'turn';
    p.clap = bar === 30; p.strings = 'stab';
    p.brass = bar === 30 ? [0] : [14];
    if (bar === 31) {
      p.kick = 'half'; p.hats = 'half'; p.bass = 'simple'; p.keys = false; p.fill = 'roll'; p.riser = 'short'; p.snare = false;
    }
  }
  return p;
}
export const BAR_PLANS: BarPlan[] = Array.from({ length: LOOP_BARS }, (_, i) => planForBar(i));

const KICK_STEPS: Record<BarPlan['kick'], number[]> = { none: [], four: [0, 4, 8, 12], late: [8, 12], half: [0, 4] };
const TOM_STEPS: Array<[number, number]> = [[8, 210], [10, 175], [12, 150], [13, 130], [14, 112], [15, 96]];

export function midiToHz(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

// ---------------------------------------------------------------- pure DSP helpers

/** Deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short plucked-string noise burst (a gently low-passed pick transient). */
export function makeExcitation(len = 2048, seed = 7): Float32Array {
  const r = mulberry32(seed);
  const out = new Float32Array(len);
  let lp = 0;
  for (let i = 0; i < len; i++) { lp += 0.55 * ((r() * 2 - 1) - lp); out[i] = lp; }
  let pk = 1e-6;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
  for (let i = 0; i < len; i++) out[i] /= pk;
  return out;
}

/**
 * Karplus-Strong string: a noise burst circulating through a damped delay line. The loop is N + 0.5 samples long (two-point
 * average), so `rate` is the playbackRate that tunes the buffer exactly to `freq`.
 */
export function renderKarplus(sr: number, freq: number, seconds: number, decay: number, excite: Float32Array): { data: Float32Array; rate: number } {
  const N = Math.max(2, Math.floor(sr / freq - 0.5));
  const len = Math.max(N + 2, Math.floor(sr * seconds));
  const y = new Float32Array(len);
  for (let n = 0; n <= N && n < len; n++) y[n] = excite[n % excite.length];
  for (let n = N + 1; n < len; n++) y[n] = decay * 0.5 * (y[n - N] + y[n - N - 1]);
  let pk = 1e-6;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(y[i]));
  const fade = Math.min(len, 96);
  for (let i = 0; i < len; i++) y[i] = (y[i] / pk) * (i >= len - fade ? (len - 1 - i) / fade : 1);
  return { data: y, rate: (freq * (N + 0.5)) / sr };
}

export function driveCurve(k: number, n = 1024): Float32Array {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i * 2) / (n - 1) - 1)) / norm;
  return c;
}
/** Final soft ceiling: unity gain for small signals, never exceeds 0.62 (-4.2 dBFS). */
export function ceilingCurve(n = 2048): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = 0.7 * Math.tanh(((i * 2) / (n - 1) - 1) / 0.7);
  return c;
}

// ---------------------------------------------------------------- engine

export type PartName = 'kick' | 'snare' | 'hats' | 'perc' | 'bass' | 'gtr' | 'lead' | 'keys' | 'strings' | 'brass';
export const DEFAULT_MIX: Record<PartName, number> = { kick: 0.9, snare: 0.55, hats: 0.55, perc: 0.36, bass: 0.44, gtr: 0.62, lead: 0.3, keys: 0.25, strings: 0.17, brass: 0.2 };

export interface LoadingThemeOptions {
  /** Output level 0..1 (default 0.85). */
  volume?: number;
  /** Seconds scheduled ahead of ctx.currentTime (default 0.1). */
  lookAhead?: number;
  /** Scheduler timer period in ms (default 25). */
  intervalMs?: number;
  /** No timer: the caller drives scheduleUntil() (offline rendering, tests). */
  manual?: boolean;
  mix?: Partial<Record<PartName, number>>;
}
export interface LoadingTheme {
  start(): void;
  stop(fadeSec?: number): void;
  setVolume(v: number): void;
  readonly playing: boolean;
  /** Schedule every step whose time is before `horizon` (ctx time). Called by the timer; exposed for offline rendering. */
  scheduleUntil(horizon: number): void;
  /** Audio nodes currently alive (persistent chain + sounding voices). Zero after stop() has finished. */
  readonly activeNodes: number;
  /** Total nodes created since start(). */
  readonly nodesCreated: number;
}

type SrcNode = AudioScheduledSourceNode;

export function createLoadingTheme(ctx: BaseAudioContext, dest: AudioNode, opts: LoadingThemeOptions = {}): LoadingTheme {
  const lookAhead = opts.lookAhead ?? 0.1;
  const intervalMs = opts.intervalMs ?? 25;
  const mix: Record<PartName, number> = { ...DEFAULT_MIX, ...(opts.mix ?? {}) };
  let volume = clamp01(opts.volume ?? 0.85);
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  let t0 = 0;
  let nextStep = 0;
  let created = 0;
  const live = new Set<AudioNode>();
  const T = (t: number) => Math.max(t, ctx.currentTime);

  // buffers, rebuilt on every start() and kept until finalize
  let noiseBuf: AudioBuffer | null = null;
  const ksBufs = new Map<number, { buf: AudioBuffer; rate: number }>();
  let n: Chain | null = null;

  interface Chain {
    out: GainNode; sum: GainNode;
    revSend: GainNode; dlySend: GainNode;
    duckBass: GainNode; duckKeys: GainNode; duckStr: GainNode;
    bassO1: OscillatorNode; bassO2: OscillatorNode; bassF: BiquadFilterNode; bassA: GainNode;
    gtrWah: BiquadFilterNode; gtrIn: GainNode;
    leadO1: OscillatorNode; leadO2: OscillatorNode; leadF: BiquadFilterNode; leadA: GainNode; vibG: GainNode;
    keysF: BiquadFilterNode; strIn: GainNode; brassF: BiquadFilterNode; brassIn: GainNode;
    kickBus: GainNode; snareHp: BiquadFilterNode; clapBp: BiquadFilterNode; hatHp: BiquadFilterNode; cowBp: BiquadFilterNode; crashHp: BiquadFilterNode; riserBp: BiquadFilterNode; percBus: GainNode; epIn: GainNode;
  }

  function track<T extends AudioNode>(node: T): T { live.add(node); created++; return node; }
  function gain(v: number, to?: AudioNode): GainNode { const g = track(ctx.createGain()); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type: BiquadFilterType, f: number, q: number, to?: AudioNode): BiquadFilterNode {
    const b = track(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b;
  }
  function drop(nodes: AudioNode[]): void {
    for (const x of nodes) {
      try { (x as unknown as { onended: unknown }).onended = null; } catch { /* ignore */ }
      try { x.disconnect(); } catch { /* already disconnected */ }
      live.delete(x);
    }
  }
  /** Free a one-shot voice when its last source ends. */
  function release(srcs: SrcNode[], nodes: AudioNode[]): void {
    let left = srcs.length;
    const all = [...srcs, ...nodes];
    for (const s of srcs) s.onended = () => { if (--left <= 0) drop(all); };
  }
  function osc(type: OscillatorType, hz: number, to: AudioNode): OscillatorNode {
    const o = track(ctx.createOscillator()); o.type = type; o.frequency.value = hz; o.connect(to); return o;
  }
  function noise(t: number, offset: number, dur: number, to: AudioNode): BufferSource {
    const s = track(ctx.createBufferSource()); s.buffer = noiseBuf; s.connect(to);
    const tt = T(t);
    s.start(tt, ((offset % 1.4) + 1.4) % 1.4); s.stop(tt + dur);
    return s;
  }
  type BufferSource = AudioBufferSourceNode;

  function buildChain(): Chain {
    const sr = ctx.sampleRate;
    // noise: 2 s white, deterministic
    noiseBuf = ctx.createBuffer(1, Math.floor(sr * 2), sr);
    { const d = noiseBuf.getChannelData(0); const r = mulberry32(1234); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }

    // master: sum -> compressor -> soft ceiling -> out(volume/fade) -> dest
    const out = track(ctx.createGain()); out.gain.value = 0;
    const ceil = track(ctx.createWaveShaper()); ceil.curve = ceilingCurve() as Float32Array<ArrayBuffer>; 
    const comp = track(ctx.createDynamicsCompressor());
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.14;
    const sum = gain(1, comp);
    comp.connect(ceil); ceil.connect(out); out.connect(dest);

    // reverb send (generated impulse) and tempo-synced dotted-eighth delay send
    const revLen = Math.floor(sr * 1.3);
    const imp = ctx.createBuffer(2, revLen, sr);
    for (let c = 0; c < 2; c++) {
      const d = imp.getChannelData(c); const r = mulberry32(900 + c); let lp = 0;
      for (let i = 0; i < revLen; i++) { lp += 0.45 * ((r() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / revLen, 2.6); }
    }
    const conv = track(ctx.createConvolver()); conv.buffer = imp;
    const revSend = gain(1, conv);
    conv.connect(gain(0.32, sum));
    const dly = track(ctx.createDelay(1.5)); dly.delayTime.value = STEP_SEC * 3;
    const dlyFb = gain(0.32); const dlyLp = filt('lowpass', 2600, 0.7);
    const dlySend = gain(1, dly);
    dly.connect(dlyLp); dlyLp.connect(dlyFb); dlyFb.connect(dly); dlyLp.connect(gain(0.5, sum));

    const part = (p: PartName, to: AudioNode = sum): GainNode => gain(mix[p], to);
    const pan = (p: number, from: AudioNode, to: AudioNode): void => {
      const c = ctx as unknown as { createStereoPanner?: () => StereoPannerNode };
      if (typeof c.createStereoPanner === 'function') { const sp = track(c.createStereoPanner()); sp.pan.value = p; from.connect(sp); sp.connect(to); } else from.connect(to);
    };
    const send = (from: AudioNode, rev: number, dl: number): void => { if (rev > 0) from.connect(gain(rev, revSend)); if (dl > 0) from.connect(gain(dl, dlySend)); };

    // ducking stages (kick sidechain imitation)
    const duckBass = gain(1); const duckKeys = gain(1); const duckStr = gain(1);

    // bass: persistent mono voice, saw + square -> resonant low-pass -> amp -> duck -> bus
    const bassBus = part('bass'); duckBass.connect(bassBus);
    const bassA = gain(0, duckBass); const bassF = filt('lowpass', 300, 6.5, bassA);
    const bassO1 = osc('sawtooth', 55, bassF); const bassO2 = osc('square', 55, gain(0.55, bassF));
    // rhythm guitar: strings -> wah -> drive -> shaper -> cab
    const gtrBus = part('gtr'); const gtrIn = gain(1);
    const gtrWah = filt('bandpass', 700, 3.2);
    const wahLfoG = gain(260); wahLfoG.connect(gtrWah.frequency); const wahLfo = osc('sine', 0.45, wahLfoG);
    const gtrDrive = gain(2.4); const gtrSh = track(ctx.createWaveShaper()); gtrSh.curve = driveCurve(2.2) as Float32Array<ArrayBuffer>;
    const gtrHp = filt('highpass', 150, 0.7); const gtrLp = filt('lowpass', 5800, 0.8); const gtrPk = filt('peaking', 1500, 1.1);
    gtrPk.gain.value = 3.5;
    gtrIn.connect(gtrWah); gtrWah.connect(gtrDrive); gtrDrive.connect(gtrSh); gtrSh.connect(gtrHp); gtrHp.connect(gtrPk); gtrPk.connect(gtrLp);
    pan(-0.3, gtrLp, gtrBus); send(gtrLp, 0.1, 0.06);
    // lead guitar: saw + detuned square -> low-pass -> amp -> overdrive -> cab
    const leadBus = part('lead');
    const leadSh = track(ctx.createWaveShaper()); leadSh.curve = driveCurve(3.4) as Float32Array<ArrayBuffer>;
    const leadCabLp = filt('lowpass', 5200, 0.7); const leadCabPk = filt('peaking', 1800, 1.0); leadCabPk.gain.value = 3;
    const leadDrive = gain(2.2, leadSh);
    leadSh.connect(leadCabPk); leadCabPk.connect(leadCabLp);
    const leadA = gain(0, leadDrive); const leadF = filt('lowpass', 2400, 1.6, leadA);
    const leadO1 = osc('sawtooth', 440, leadF); const leadO2 = osc('square', 440, gain(0.4, leadF)); leadO2.detune.value = 7;
    const vibG = gain(0); vibG.connect(leadO1.detune); vibG.connect(leadO2.detune); const vibLfo = osc('sine', 5.6, vibG);
    pan(0.12, leadCabLp, leadBus); send(leadCabLp, 0.18, 0.3);
    // keys: e-piano comping, low-pass bus
    const keysBus = part('keys'); pan(0.25, duckKeys, keysBus);
    const keysF = filt('lowpass', 2600, 0.7, duckKeys); const epIn = gain(1, keysF);
    send(duckKeys, 0.15, 0.12);
    // strings: saw stabs / pad
    const strBus = part('strings'); duckStr.connect(strBus);
    const strIn = gain(1); const strLp = filt('lowpass', 2100, 0.6, duckStr); strIn.connect(strLp);
    send(duckStr, 0.3, 0);
    // brass
    const brassBus = part('brass'); const brassF = filt('lowpass', 900, 1.2, brassBus); const brassIn = gain(1, brassF);
    send(brassBus, 0.2, 0.08);
    // drums
    const kickBus = part('kick');
    const snareBus = part('snare'); const snareHp = filt('highpass', 1100, 0.7, snareBus); send(snareBus, 0.12, 0);
    const clapBp = filt('bandpass', 1500, 0.9, snareBus);
    const hatBus = part('hats'); const hatHp = filt('highpass', 7200, 0.7); pan(0.2, hatHp, hatBus);
    const percBus = part('perc'); send(percBus, 0.14, 0);
    const cowBp = filt('bandpass', 800, 1.3, percBus);
    const crashHp = filt('highpass', 4800, 0.7, percBus);
    const riserBp = filt('bandpass', 400, 1.4, percBus);

    for (const o of [bassO1, bassO2, wahLfo, leadO1, leadO2, vibLfo]) o.start(ctx.currentTime);
    return {
      out, sum, revSend, dlySend, duckBass, duckKeys, duckStr, bassO1, bassO2, bassF, bassA, gtrWah, gtrIn, leadO1, leadO2, leadF, leadA, vibG,
      keysF, strIn, brassF, brassIn, kickBus, snareHp, clapBp, hatHp, cowBp, crashHp, riserBp, percBus, epIn,
    };
  }

  function guitarBuffer(midi: number): { buf: AudioBuffer; rate: number } {
    let e = ksBufs.get(midi);
    if (!e) {
      const sr = ctx.sampleRate;
      const r = renderKarplus(sr, midiToHz(midi), 0.42, 0.9965, makeExcitation(2048, 11 + midi));
      const buf = ctx.createBuffer(1, r.data.length, sr);
      buf.getChannelData(0).set(r.data);
      e = { buf, rate: r.rate };
      ksBufs.set(midi, e);
    }
    return e;
  }

  // ---------------------------------------------------------------- voices
  let prevBassHz = 55;
  function bassNote(t: number, midi: number, lenSteps: number): void {
    const c = n!; const f = midiToHz(midi); const tt = T(t); const end = tt + Math.max(0.06, lenSteps * STEP_SEC * 0.92);
    for (const o of [c.bassO1, c.bassO2]) { o.frequency.setValueAtTime(prevBassHz, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.03); }
    prevBassHz = f;
    c.bassA.gain.setValueAtTime(0, tt); c.bassA.gain.linearRampToValueAtTime(1, tt + 0.006); c.bassA.gain.setValueAtTime(1, end); c.bassA.gain.linearRampToValueAtTime(0, end + 0.035);
    c.bassF.frequency.setValueAtTime(160, tt); c.bassF.frequency.linearRampToValueAtTime(1500, tt + 0.012); c.bassF.frequency.setTargetAtTime(330, tt + 0.012, 0.11);
  }
  function duck(t: number, depth: number): void {
    const c = n!; const tt = T(t);
    for (const [g, d] of [[c.duckBass, depth], [c.duckKeys, 0.55 + 0.45 * depth], [c.duckStr, 0.5 + 0.5 * depth]] as Array<[GainNode, number]>) {
      g.gain.setValueAtTime(d, tt); g.gain.setTargetAtTime(1, tt + 0.012, 0.075);
    }
  }
  function kick(t: number): void {
    const c = n!; const tt = T(t);
    const o = track(ctx.createOscillator()); o.type = 'sine'; const g = track(ctx.createGain()); o.connect(g); g.connect(c.kickBus);
    o.frequency.setValueAtTime(158, tt); o.frequency.exponentialRampToValueAtTime(46, tt + 0.11);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1, tt + 0.002); g.gain.setTargetAtTime(0, tt + 0.012, 0.085);
    o.start(tt); o.stop(tt + 0.5); release([o], [g]);
  }
  function snare(t: number, g16: number, vel: number): void {
    const c = n!; const tt = T(t);
    const ng = track(ctx.createGain()); ng.connect(c.snareHp);
    ng.gain.setValueAtTime(vel * 0.9, tt); ng.gain.setTargetAtTime(0, tt + 0.004, 0.05);
    const s = noise(tt, g16 * 0.173, 0.3, ng);
    const to = track(ctx.createOscillator()); to.type = 'triangle'; const tg = track(ctx.createGain()); to.connect(tg); tg.connect(c.snareHp);
    to.frequency.setValueAtTime(240, tt); to.frequency.exponentialRampToValueAtTime(175, tt + 0.06);
    tg.gain.setValueAtTime(vel * 0.7, tt); tg.gain.setTargetAtTime(0, tt + 0.003, 0.04);
    to.start(tt); to.stop(tt + 0.3);
    release([s, to], [ng, tg]);
  }
  function clap(t: number, g16: number): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.clapBp);
    g.gain.setValueAtTime(0.0001, tt);
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.9, tt + i * 0.011); g.gain.setTargetAtTime(0, tt + i * 0.011 + 0.003, 0.012); }
    g.gain.setValueAtTime(0.7, tt + 0.033); g.gain.setTargetAtTime(0, tt + 0.036, 0.05);
    const s = noise(tt, g16 * 0.31 + 0.5, 0.3, g);
    release([s], [g]);
  }
  function hat(t: number, g16: number, vel: number, open: boolean): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.hatHp);
    g.gain.setValueAtTime(vel, tt); g.gain.setTargetAtTime(0, tt + 0.002, open ? 0.075 : 0.011);
    const s = noise(tt, g16 * 0.0917, open ? 0.4 : 0.07, g);
    release([s], [g]);
  }
  function crash(t: number, g16: number): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.crashHp);
    g.gain.setValueAtTime(0.5, tt); g.gain.setTargetAtTime(0, tt + 0.01, 0.45);
    const s = noise(tt, g16 * 0.05, 2.0, g);
    release([s], [g]);
  }
  function tom(t: number, hz: number, vel: number): void {
    const c = n!; const tt = T(t);
    const o = track(ctx.createOscillator()); o.type = 'sine'; const g = track(ctx.createGain()); o.connect(g); g.connect(c.percBus);
    o.frequency.setValueAtTime(hz * 1.25, tt); o.frequency.exponentialRampToValueAtTime(hz * 0.75, tt + 0.16);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(vel, tt + 0.003); g.gain.setTargetAtTime(0, tt + 0.01, 0.07);
    o.start(tt); o.stop(tt + 0.6); release([o], [g]);
  }
  function cowbell(t: number, vel: number): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.cowBp);
    g.gain.setValueAtTime(vel, tt); g.gain.setTargetAtTime(0, tt + 0.004, 0.055);
    const a = osc('square', 587, g); const b = osc('square', 845, g);
    a.start(tt); b.start(tt); a.stop(tt + 0.3); b.stop(tt + 0.3); release([a, b], [g]);
  }
  function riser(t: number, dur: number, g16: number): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.riserBp);
    g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.9, tt + dur); g.gain.linearRampToValueAtTime(0, tt + dur + 0.04);
    c.riserBp.frequency.setValueAtTime(350, tt); c.riserBp.frequency.exponentialRampToValueAtTime(7500, tt + dur);
    const s = track(ctx.createBufferSource()); s.buffer = noiseBuf; s.loop = true; s.connect(g); s.start(tt, (g16 * 0.11) % 1); s.stop(tt + dur + 0.06);
    release([s], [g]);
  }
  function chordStab(t: number, g16: number, chord: ChordDef, ring: boolean, up: boolean): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.gtrIn);
    g.gain.setValueAtTime(ring ? 0.95 : 0.8, tt); g.gain.setTargetAtTime(0, tt + (ring ? 0.07 : 0.035), ring ? 0.1 : 0.03);
    c.gtrWah.frequency.setValueAtTime(2200, tt); c.gtrWah.frequency.setTargetAtTime(650, tt + 0.005, 0.09);
    const srcs: SrcNode[] = [];
    const notes = chord.gtr;
    for (let i = 0; i < notes.length; i++) {
      const k = up ? notes.length - 1 - i : i;
      const e = guitarBuffer(notes[k]);
      const s = track(ctx.createBufferSource()); s.buffer = e.buf; s.playbackRate.value = e.rate; s.connect(g);
      const st = tt + i * 0.0065; s.start(st); s.stop(st + (ring ? 0.42 : 0.28)); srcs.push(s);
    }
    void g16;
    release(srcs, [g]);
  }
  function scratch(t: number, g16: number): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.gtrWah);
    g.gain.setValueAtTime(0.5, tt); g.gain.setTargetAtTime(0, tt + 0.004, 0.012);
    const s = noise(tt, g16 * 0.241, 0.06, g);
    release([s], [g]);
  }
  function epHit(t: number, chord: ChordDef): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.epIn);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.5, tt + 0.004); g.gain.setTargetAtTime(0, tt + 0.02, 0.18);
    const srcs: SrcNode[] = [];
    for (const m of chord.keys.slice(1)) {
      const f = midiToHz(m);
      const a = osc('sine', f, g); const b = osc('triangle', f * 2.0, gain(0.18, g));
      a.start(tt); b.start(tt); a.stop(tt + 0.9); b.stop(tt + 0.9); srcs.push(a, b);
    }
    release(srcs, [g]);
  }
  function stringsHit(t: number, chord: ChordDef, attack: number, dur: number): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.strIn);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.5, tt + attack); g.gain.setValueAtTime(0.5, tt + dur); g.gain.linearRampToValueAtTime(0, tt + dur + 0.12);
    const srcs: SrcNode[] = [];
    for (const m of chord.keys) {
      const f = midiToHz(m);
      for (const d of [-9, 9]) { const o = osc('sawtooth', f, g); o.detune.value = d; o.start(tt); o.stop(tt + dur + 0.15); srcs.push(o); }
    }
    release(srcs, [g]);
  }
  function brassHit(t: number, chord: ChordDef): void {
    const c = n!; const tt = T(t);
    const g = track(ctx.createGain()); g.connect(c.brassIn);
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.7, tt + 0.014); g.gain.setTargetAtTime(0, tt + 0.1, 0.035);
    c.brassF.frequency.setValueAtTime(700, tt); c.brassF.frequency.linearRampToValueAtTime(3600, tt + 0.07); c.brassF.frequency.setTargetAtTime(900, tt + 0.12, 0.08);
    const srcs: SrcNode[] = [];
    for (const m of chord.brass) {
      const f = midiToHz(m);
      for (const d of [-7, 7]) { const o = osc('sawtooth', f, g); o.detune.value = d; o.start(tt); o.stop(tt + 0.35); srcs.push(o); }
    }
    release(srcs, [g]);
  }
  function leadNote(t: number, nt: LeadNote): void {
    const c = n!; const tt = T(t); const f = midiToHz(nt.midi); const end = tt + nt.len * STEP_SEC * 0.94;
    for (const o of [c.leadO1, c.leadO2]) {
      if (nt.bend) { o.frequency.setValueAtTime(midiToHz(nt.midi - nt.bend), tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.085); } else o.frequency.setValueAtTime(f, tt);
    }
    c.leadA.gain.setValueAtTime(0, tt); c.leadA.gain.linearRampToValueAtTime(1, tt + 0.008); c.leadA.gain.setTargetAtTime(0.72, tt + 0.01, 0.35);
    c.leadA.gain.setValueAtTime(0.72, end); c.leadA.gain.setTargetAtTime(0, end, 0.035);
    c.leadF.frequency.setValueAtTime(5200, tt); c.leadF.frequency.setTargetAtTime(2300, tt + 0.004, 0.05);
    c.vibG.gain.setValueAtTime(0, tt);
    if (nt.vib) { c.vibG.gain.setValueAtTime(0, tt + 0.1); c.vibG.gain.linearRampToValueAtTime(26, tt + 0.38); c.vibG.gain.setValueAtTime(26, end); c.vibG.gain.setValueAtTime(0, end + 0.05); }
  }

  // ---------------------------------------------------------------- scheduler
  function scheduleStep(g: number, t: number): void {
    const { bar, step } = stepPosition(g);
    const p = BAR_PLANS[bar]; const chord = CHORDS[BAR_CHORDS[bar]];
    const ts = t + ((step & 1) ? SWING * STEP_SEC : 0);

    if (p.crash && step === 0) crash(t, g);
    if (KICK_STEPS[p.kick].includes(step)) { kick(t); duck(t, 0.32); }
    if (p.snare && (step === 4 || step === 12)) snare(t, g, 1);
    if (p.clap && (step === 4 || step === 12)) clap(t, g);
    // hats: eighths (quiet) or full 16ths with open hats on the "and" of each beat
    const hatOn = p.hats === 'full' || (p.hats === 'eighth' && step % 2 === 0) || (p.hats === 'half' && step < 8);
    if (hatOn) {
      const open = step % 4 === 2 && p.hats !== 'eighth';
      const vel = open ? 0.55 : step % 4 === 0 ? 0.42 : step % 2 === 0 ? 0.3 : 0.2;
      hat(ts, g, vel, open);
    }
    if (p.cowbell && (step === 6 || step === 14)) cowbell(ts, step === 6 ? 0.5 : 0.35);
    if (p.fill === 'tom') for (const [s, hz] of TOM_STEPS) if (s === step) tom(t, hz, 0.8);
    if (p.fill === 'roll' && step >= 8) { if (step % 2 === 0 || step >= 12) snare(t, g, 0.35 + (step - 8) * 0.07); if (bar === 31 && step % 4 === 0) tom(t, 130 - (step - 8) * 4, 0.6); }
    if (p.riser !== 'none' && step === 0) riser(t, p.riser === 'long' ? 2 * BAR_SEC : BAR_SEC, g);

    // bass
    const bp = p.bass === 'funk' ? BASS_FUNK : p.bass === 'funk2' ? BASS_FUNK2 : p.bass === 'simple' ? BASS_SIMPLE : p.bass === 'sustain' ? BASS_SUSTAIN : null;
    if (bp) for (const [s, k, len] of bp) if (s === step && !(bar === 31 && step >= 8 && step !== 8)) bassNote(t, bassMidi(chord, k), len);
    // rhythm guitar
    if (p.gtr) {
      const pat = bar % 2 === 0 ? GTR_PAT_A : GTR_PAT_B;
      const ch = pat[step];
      if (ch === 'X' || ch === 'O') chordStab(ts, g, chord, ch === 'O', (step & 1) === 1 || step === 6 || step === 14);
      else if (ch === 'x') scratch(ts, g);
    }
    if (p.keys && EP_STEPS.includes(step)) epHit(ts, chord);
    if (p.strings === 'stab' && STRING_STEPS.includes(step)) stringsHit(t, chord, 0.025, step === 0 ? 0.36 : 0.22);
    if (p.strings === 'pad' && step === 0) stringsHit(t, chord, 0.4, BAR_SEC - 0.2);
    if (p.brass.includes(step)) brassHit(t, chord);
    for (const nt of leadNotesForBar(bar)) if (nt.step === step) leadNote(t, nt);
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
    live.clear(); ksBufs.clear(); noiseBuf = null; n = null;
  }

  return {
    start() {
      if (running) return;
      if (finalizeTimer || n) finalize();
      if (typeof (ctx as AudioContext).resume === 'function' && (ctx as AudioContext).state === 'suspended') void Promise.resolve((ctx as AudioContext).resume()).catch(() => undefined);
      created = 0; prevBassHz = 55;
      n = buildChain();
      const now = ctx.currentTime;
      n.out.gain.setValueAtTime(0, now); n.out.gain.linearRampToValueAtTime(volume, now + 0.3);
      for (const c of CHORDS.Am7.gtr.concat(CHORDS.D9.gtr, CHORDS.Cmaj7.gtr, CHORDS.Em7.gtr)) guitarBuffer(c);
      t0 = now + 0.06; nextStep = 0; running = true;
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

function clamp01(v: number): number { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

// ---------------------------------------------------------------- Radio library / debug entry

export const LOADING_THEME_ENTRY = {
  id: 'loading-theme',
  name: 'Loading theme',
  artist: 'Bed-Stuy Boogie (original, synthesized)',
  bpm: LOADING_BPM,
  bars: LOOP_BARS,
  durationSec: LOOP_SEC,
} as const;

let auditionInstance: { theme: LoadingTheme; ctx: BaseAudioContext } | null = null;
/**
 * Audition the loading theme from a debug call or the Radio library list. `host` is AudioSystem.djHost (null until audio was
 * started by a user gesture). Pass on = true/false to force, omit to toggle. Returns whether it is playing afterwards.
 */
export function auditionLoadingTheme(host: { ctx: BaseAudioContext; dest: AudioNode } | null, on?: boolean): boolean {
  if (!host) return false;
  const want = on ?? !(auditionInstance?.theme.playing ?? false);
  if (!want) { auditionInstance?.theme.stop(0.6); return false; }
  if (auditionInstance?.theme.playing) return true;
  if (!auditionInstance || auditionInstance.ctx !== host.ctx) auditionInstance = { theme: createLoadingTheme(host.ctx, host.dest), ctx: host.ctx };
  auditionInstance.theme.start();
  return true;
}
