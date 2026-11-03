/**
 * Records: the vinyl the player can buy, press, and play on the decks.
 *
 * Nothing copyrighted is bundled. A record is one of:
 *  - 'procedural': one of 12 original loops synthesised here (exact BPM, parody titles);
 *  - 'library':    "pressed" for free from a file in the player's own Radio library;
 *  - 'drop':       a file the player put in `src/assets/records/` (their own licensed audio; see docs/RECORDS.md).
 *
 * `synthRecord` is pure (no Web Audio), so it runs in tests. `RecordSource` turns a record into an AudioBuffer.
 */
import { Rng } from '@/core/Rng';

export type RecordKind = 'procedural' | 'library' | 'drop';
export type RecordGenre = 'hiphop' | 'house' | 'disco' | 'dub' | 'trap' | 'jazz' | 'techno' | 'breaks' | 'electro';

export interface RecordDef {
  id: string;
  title: string;
  artist: string;
  genre: RecordGenre | string;
  /** Shop price in dollars (0 for pressed library files). */
  price: number;
  /** Tempo in beats per minute: exact for procedural records, estimated or defaulted for files. */
  bpm: number;
  /** Cover colours (CSS), sleeve background and label. */
  colors: [string, string];
  kind: RecordKind;
  /** library: the Radio library track id. drop: the file key. */
  ref?: string;
}

/** Default tempo per genre, used for files whose tempo has not been measured. */
export const GENRE_BPM: Record<string, number> = {
  hiphop: 90, house: 124, disco: 112, dub: 72, trap: 140, jazz: 96, techno: 130, breaks: 134, electro: 128,
};

export function defaultBpm(genre: string): number { return GENRE_BPM[genre] ?? 120; }

interface Spec { id: string; title: string; artist: string; genre: RecordGenre; bpm: number; price: number; colors: [string, string]; root: number; minor: boolean }

const SPECS: Spec[] = [
  { id: 'wax-01', title: 'Stoop Season', artist: 'Lenox Jr.', genre: 'hiphop', bpm: 88, price: 12, colors: ['#d9822b', '#2b1b0e'], root: 45, minor: true },
  { id: 'wax-02', title: 'Bodega Cat Boogie', artist: 'The Corner Stores', genre: 'house', bpm: 122, price: 14, colors: ['#e63946', '#1d1d2c'], root: 48, minor: true },
  { id: 'wax-03', title: 'Throop Night Bus', artist: 'Nightbus Collective', genre: 'house', bpm: 118, price: 14, colors: ['#3a86ff', '#0b132b'], root: 43, minor: true },
  { id: 'wax-04', title: 'Spin Cycle Love', artist: 'Kosciuszkomat', genre: 'disco', bpm: 112, price: 16, colors: ['#ff70a6', '#3d1c3a'], root: 46, minor: false },
  { id: 'wax-05', title: 'Quarter Water Dub', artist: 'Dub Mayor', genre: 'dub', bpm: 72, price: 18, colors: ['#2a9d8f', '#102a28'], root: 41, minor: true },
  { id: 'wax-06', title: 'Alternate Side Panic', artist: 'Street Cleaning', genre: 'trap', bpm: 140, price: 15, colors: ['#9b5de5', '#16082b'], root: 40, minor: true },
  { id: 'wax-07', title: 'Brownstone Blues', artist: 'Mr. Fixture', genre: 'jazz', bpm: 96, price: 20, colors: ['#8d5a2b', '#f2e3c6'], root: 50, minor: true },
  { id: 'wax-08', title: 'Dollar Van Dispatch', artist: 'Zone Three', genre: 'techno', bpm: 130, price: 17, colors: ['#ffd60a', '#111111'], root: 38, minor: true },
  { id: 'wax-09', title: 'Fire Escape Sunrise', artist: 'Roofline', genre: 'house', bpm: 120, price: 13, colors: ['#ff9f1c', '#2ec4b6'], root: 47, minor: false },
  { id: 'wax-10', title: 'Rent Is Due (Dub Mix)', artist: 'Landlord Dub', genre: 'dub', bpm: 126, price: 19, colors: ['#5f0f40', '#fb8b24'], root: 39, minor: true },
  { id: 'wax-11', title: 'Kickback On Kosciuszko', artist: 'Afterhours Pigeons', genre: 'breaks', bpm: 134, price: 16, colors: ['#06d6a0', '#073b4c'], root: 42, minor: true },
  { id: 'wax-12', title: 'Sloth Anthem', artist: 'The Afterhours Sloth', genre: 'electro', bpm: 128, price: 25, colors: ['#f72585', '#240046'], root: 44, minor: true },
];

/** The 12 procedural originals sold at WAX DELI. */
export const PROCEDURAL_RECORDS: readonly RecordDef[] = SPECS.map((s) => ({
  id: s.id, title: s.title, artist: s.artist, genre: s.genre, price: s.price, bpm: s.bpm, colors: s.colors, kind: 'procedural' as const,
}));

const specById = new Map(SPECS.map((s) => [s.id, s]));

/** Bars in a procedural loop (4 beats each). */
export const LOOP_BARS = 16;

/** Exact number of samples in the loop: whole bars at the record's tempo. */
export function loopSamples(bpm: number, sampleRate: number, bars = LOOP_BARS): number {
  return Math.round((60 / bpm) * 4 * bars * sampleRate);
}

export interface RenderedRecord { left: Float32Array; right: Float32Array; sampleRate: number; bpm: number; bars: number }

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Style {
  kick: number[]; snare: number[]; hat: number[]; openHat: number[]; bass: number[]; stab: number[];
  swing: number; bassWave: 'saw' | 'sine' | 'square'; kickLen: number; stabLevel: number; halfTime?: boolean;
}

/** 16-step patterns per genre. 1 = hit. */
function styleFor(genre: string): Style {
  const p = (s: string) => [...s.replace(/\s/g, '')].map((c) => (c === 'x' ? 1 : c === 'o' ? 0.55 : 0));
  switch (genre) {
    case 'hiphop': return { kick: p('x.....x..o..x...'), snare: p('....x.......x...'), hat: p('x.x.x.x.x.x.x.xo'), openHat: p('................'), bass: p('x.....x...x.....'), stab: p('..x.......x.....'), swing: 0.18, bassWave: 'sine', kickLen: 0.28, stabLevel: 0.5 };
    case 'house': return { kick: p('x...x...x...x...'), snare: p('....x.......x...'), hat: p('..x...x...x...x.'), openHat: p('..x...x...x...x.'), bass: p('.x..x..x.x..x.x.'), stab: p('x..x..x...x.....'), swing: 0, bassWave: 'saw', kickLen: 0.22, stabLevel: 0.7 };
    case 'disco': return { kick: p('x...x...x...x...'), snare: p('....x.......x...'), hat: p('x.x.x.x.x.x.x.x.'), openHat: p('.o.o.o.o.o.o.o.o'), bass: p('x.xxx.xxx.xxx.xx'), stab: p('..x...x...x...x.'), swing: 0, bassWave: 'saw', kickLen: 0.2, stabLevel: 0.75 };
    case 'dub': return { kick: p('x.......x.......'), snare: p('........x.......'), hat: p('..x...x...x...x.'), openHat: p('................'), bass: p('x..x.....x.x....'), stab: p('....x.......x...'), swing: 0, bassWave: 'sine', kickLen: 0.4, stabLevel: 0.6, halfTime: true };
    case 'trap': return { kick: p('x.....x...x.....'), snare: p('........x.......'), hat: p('xxxxxxxxxxxxxxxx'), openHat: p('......o.......o.'), bass: p('x.....x...x.....'), stab: p('..x.....x.......'), swing: 0, bassWave: 'sine', kickLen: 0.45, stabLevel: 0.45 };
    case 'jazz': return { kick: p('x.....x.....x...'), snare: p('....o.......x..o'), hat: p('x.xxx.xxx.xxx.xx'), openHat: p('................'), bass: p('x..x..x..x..x..x'), stab: p('..x.....x.....x.'), swing: 0.3, bassWave: 'sine', kickLen: 0.2, stabLevel: 0.65 };
    case 'techno': return { kick: p('x...x...x...x...'), snare: p('................'), hat: p('.x.x.x.x.x.x.x.x'), openHat: p('.o.o.o.o.o.o.o.o'), bass: p('.xx..xx..xx..xx.'), stab: p('x.......x.......'), swing: 0, bassWave: 'square', kickLen: 0.26, stabLevel: 0.4 };
    case 'breaks': return { kick: p('x.....x...x....x'), snare: p('....x.......x...'), hat: p('x.xxx.xxx.xxx.xx'), openHat: p('................'), bass: p('x..x...x..x.....'), stab: p('....x.....x.....'), swing: 0.08, bassWave: 'saw', kickLen: 0.22, stabLevel: 0.55 };
    default: return { kick: p('x...x...x...x...'), snare: p('....x.......x...'), hat: p('x.x.x.x.x.x.x.x.'), openHat: p('..x...x...x...x.'), bass: p('x.x.xx.xx.x.xx.x'), stab: p('x...x.....x.....'), swing: 0, bassWave: 'saw', kickLen: 0.2, stabLevel: 0.6 };
  }
}

/**
 * Renders a loopable record: whole bars at the exact BPM. Bars 1-4 groove, 5-8 add the stab, 9-12 break
 * (kick drops out for 2 bars to make mixing in/out musical), 13-16 full again.
 */
export function synthRecord(def: RecordDef, sampleRate = 44100, bars = LOOP_BARS): RenderedRecord {
  const spec = specById.get(def.id);
  const genre = spec?.genre ?? def.genre;
  const st = styleFor(genre);
  const bpm = def.bpm;
  const beat = 60 / bpm;
  const step = beat / 4;
  const total = loopSamples(bpm, sampleRate, bars);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const rng = new Rng(def.id);
  const root = spec?.root ?? 45;
  const minor = spec?.minor ?? true;
  const scale = minor ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12];
  const progression = [0, 0, minor ? 8 : 5, minor ? 5 : 7];

  const add = (start: number, buf: Float32Array, gain: number, pan = 0) => {
    const s0 = Math.max(0, Math.floor(start * sampleRate));
    const gl = gain * (1 - Math.max(0, pan));
    const gr = gain * (1 + Math.min(0, pan));
    for (let i = 0; i < buf.length; i++) {
      const j = (s0 + i) % total; // wrap: tails fold into the loop start, so it loops cleanly
      L[j] += buf[i] * gl; R[j] += buf[i] * gr;
    }
  };

  // one-shot voices, built once
  const kickBuf = (() => {
    const n = Math.floor(st.kickLen * sampleRate); const b = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / sampleRate; const f = 48 + 110 * Math.exp(-t * 28); ph += (2 * Math.PI * f) / sampleRate; b[i] = Math.sin(ph) * Math.exp(-t * (6 / st.kickLen) * 0.9) * 0.95; }
    return b;
  })();
  const snareBuf = (() => {
    const n = Math.floor(0.18 * sampleRate); const b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sampleRate; b[i] = ((rng.next() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t * 22) * 0.7; }
    return b;
  })();
  const hatBuf = (open: boolean) => {
    const n = Math.floor((open ? 0.16 : 0.045) * sampleRate); const b = new Float32Array(n); let prev = 0;
    for (let i = 0; i < n; i++) { const t = i / sampleRate; const w = rng.next() * 2 - 1; const hp = w - prev; prev = w; b[i] = hp * Math.exp(-t * (open ? 22 : 90)) * 0.28; }
    return b;
  };
  const hatClosed = hatBuf(false);
  const hatOpen = hatBuf(true);
  const tone = (freq: number, dur: number, wave: 'saw' | 'sine' | 'square', level: number) => {
    const n = Math.floor(dur * sampleRate); const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate; const ph = (t * freq) % 1;
      const w = wave === 'sine' ? Math.sin(2 * Math.PI * ph) : wave === 'saw' ? (2 * ph - 1) * 0.6 : (ph < 0.5 ? 0.5 : -0.5);
      const env = Math.min(1, t / 0.005) * Math.exp(-t * (3 / dur));
      b[i] = w * env * level;
    }
    return b;
  };

  for (let bar = 0; bar < bars; bar++) {
    const section = Math.floor(bar / 4);
    const chordShift = progression[bar % 4];
    for (let s = 0; s < 16; s++) {
      const swing = s % 2 === 1 ? st.swing * step * 0.5 : 0;
      const t = (bar * 16 + s) * step + swing;
      const inBreak = section === 2 && bar % 4 >= 1 && bar % 4 <= 2;
      if (!inBreak && st.kick[s]) add(t, kickBuf, 0.9 * st.kick[s]);
      if (st.snare[s] && section !== 0) add(t, snareBuf, 0.6 * st.snare[s], 0.1);
      else if (st.snare[s] && bar % 2 === 1) add(t, snareBuf, 0.5 * st.snare[s], 0.1);
      if (st.hat[s] && !(section === 2 && bar % 4 === 2)) add(t, hatClosed, st.hat[s], rng.range(-0.3, 0.3));
      if (st.openHat[s] && section !== 0) add(t, hatOpen, st.openHat[s] * 0.8, 0.2);
      if (st.bass[s] && !inBreak) {
        const deg = scale[(s + bar) % 3 === 0 ? 0 : (s % 4 === 3 ? 3 : 0)];
        const note = root + chordShift + deg;
        add(t, tone(mtof(note), step * 3.2, st.bassWave, 0.5), 0.8);
      }
      if (st.stab[s] && section >= 1) {
        const d = [0, scale[2], scale[3]];
        for (const o of d) add(t, tone(mtof(root + 24 + chordShift + o), step * 2.2, 'saw', 0.12), st.stabLevel, o === 0 ? -0.3 : 0.3);
      }
    }
  }
  // soft limiter, so stacked hits do not clip
  for (let i = 0; i < total; i++) { L[i] = Math.tanh(L[i] * 0.9); R[i] = Math.tanh(R[i] * 0.9); }
  return { left: L, right: R, sampleRate, bpm, bars };
}

// ---------------------------------------------------------------- tempo estimate for files

/**
 * Quick onset-based tempo estimate. Builds an energy-difference envelope (10 ms hop), autocorrelates it over
 * 70..180 BPM and folds the winner into 80..160. Good enough for beatgrids on four-on-the-floor and hiphop
 * material; the DJ can always nudge. Returns `fallback` when the signal has no clear pulse.
 */
export function estimateBpm(samples: Float32Array, sampleRate: number, fallback = 120): number {
  const hop = Math.max(1, Math.floor(sampleRate * 0.01));
  const frames = Math.floor(samples.length / hop);
  if (frames < 300) return fallback;
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let e = 0; const a = f * hop; for (let i = 0; i < hop; i++) { const v = samples[a + i]; e += v * v; } env[f] = Math.sqrt(e / hop); }
  const onset = new Float32Array(frames);
  let mean = 0;
  for (let f = 1; f < frames; f++) { onset[f] = Math.max(0, env[f] - env[f - 1]); mean += onset[f]; }
  mean /= frames;
  if (mean < 1e-6) return fallback;
  for (let f = 0; f < frames; f++) onset[f] -= mean;
  const fps = sampleRate / hop;
  let bestLag = 0; let best = -Infinity; let sum0 = 0;
  for (let f = 0; f < frames; f++) sum0 += onset[f] * onset[f];
  const loLag = Math.floor((fps * 60) / 180); const hiLag = Math.ceil((fps * 60) / 70);
  for (let lag = loLag; lag <= hiLag; lag++) {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += onset[f] * onset[f + lag];
    // a beat's multiples also correlate: reward them slightly so half-tempo is not chosen by noise
    let s2 = 0; const l2 = lag * 2;
    for (let f = 0; f + l2 < frames; f++) s2 += onset[f] * onset[f + l2];
    const score = s + 0.5 * s2;
    if (score > best) { best = score; bestLag = lag; }
  }
  if (bestLag === 0 || best < sum0 * 0.02) return fallback;
  // parabolic refinement of the lag
  let bpm = (fps * 60) / bestLag;
  while (bpm < 80) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

// ---------------------------------------------------------------- pressing and drop folder

const hash = (s: string) => Rng.hash(s);
export function coverFor(seed: string): [string, string] {
  const h = hash(seed);
  const a = h % 360; const b = (a + 40 + ((h >>> 9) % 160)) % 360;
  return [`hsl(${a} 70% 52%)`, `hsl(${b} 55% 16%)`];
}

/** A free record for a file in the player's Radio library. Tempo defaults to the genre (or measured later). */
export function pressLibraryTrack(track: { id: string; name: string; path?: string }, genre = 'house', bpm?: number): RecordDef {
  return {
    id: `lib:${track.id}`, title: track.name, artist: 'Your collection', genre, price: 0,
    bpm: bpm ?? defaultBpm(genre), colors: coverFor(track.id), kind: 'library', ref: track.id,
  };
}

/** Guesses a genre from a file path with simple keywords, falling back to house. */
export function guessGenre(path: string): string {
  const p = path.toLowerCase();
  for (const g of Object.keys(GENRE_BPM)) if (p.includes(g)) return g;
  if (/hip.?hop|rap|boom/.test(p)) return 'hiphop';
  if (/dub|reggae/.test(p)) return 'dub';
  if (/tech|minimal/.test(p)) return 'techno';
  return 'house';
}

/** Turns drop-folder file URLs (key = file path) into free records. Pure, so tests can feed fake globs. */
export function dropRecords(files: Record<string, string>): { defs: RecordDef[]; urls: Map<string, string> } {
  const defs: RecordDef[] = []; const urls = new Map<string, string>();
  for (const key of Object.keys(files).sort()) {
    if (!/\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(key)) continue;
    const file = key.split('/').pop() ?? key;
    const title = file.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
    const genre = guessGenre(key);
    defs.push({ id: `drop:${file.toLowerCase()}`, title, artist: 'Your drop folder', genre, price: 0, bpm: defaultBpm(genre), colors: coverFor(file), kind: 'drop', ref: file.toLowerCase() });
    urls.set(`drop:${file.toLowerCase()}`, files[key]);
  }
  return { defs, urls };
}

let dropCache: ReturnType<typeof dropRecords> | null = null;
/** Records found in `src/assets/records/` at build time (empty by default). */
export function bundledDropRecords(): ReturnType<typeof dropRecords> {
  if (dropCache) return dropCache;
  let files: Record<string, string> = {};
  try {
    files = (import.meta as unknown as { glob: (p: string, o: object) => Record<string, string> })
      .glob('@/assets/records/*.{mp3,wav,ogg,m4a,flac,aac,opus}', { eager: true, query: '?url', import: 'default' });
  } catch { files = {}; }
  dropCache = dropRecords(files);
  return dropCache;
}

// ---------------------------------------------------------------- audio buffers

/** Minimal slice of AudioContext that RecordSource needs (fakeable in tests). */
export interface BufferContext {
  sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

/** Resolves blob URLs for library records (Radio library tracks live only for the session). */
export type UrlResolver = (def: RecordDef) => string | undefined;

export class RecordSource {
  private readonly cache = new Map<string, Promise<AudioBuffer | null>>();
  constructor(private readonly ctx: BufferContext, private readonly resolve: UrlResolver = () => undefined,
    private readonly fetcher: (url: string) => Promise<ArrayBuffer> = async (u) => (await fetch(u)).arrayBuffer()) {}

  /** True when the record can be played right now (procedural, or its file is loaded this session). */
  available(def: RecordDef): boolean { return def.kind === 'procedural' || !!this.resolve(def); }

  /** The decoded audio, or null if the file is gone. Cached per record id. */
  load(def: RecordDef): Promise<AudioBuffer | null> {
    let p = this.cache.get(def.id);
    if (!p) { p = this.build(def); this.cache.set(def.id, p); }
    return p;
  }

  private async build(def: RecordDef): Promise<AudioBuffer | null> {
    try {
      if (def.kind === 'procedural') {
        const r = synthRecord(def, this.ctx.sampleRate || 44100);
        const buf = this.ctx.createBuffer(2, r.left.length, r.sampleRate);
        buf.getChannelData(0).set(r.left); buf.getChannelData(1).set(r.right);
        return buf;
      }
      const url = this.resolve(def);
      if (!url) return null;
      return await this.ctx.decodeAudioData(await this.fetcher(url));
    } catch { return null; }
  }

  /** Measures a file record's tempo once decoded. */
  async measure(def: RecordDef): Promise<number> {
    const buf = await this.load(def);
    if (!buf || def.kind === 'procedural') return def.bpm;
    return estimateBpm(buf.getChannelData(0), buf.sampleRate, def.bpm);
  }
}
