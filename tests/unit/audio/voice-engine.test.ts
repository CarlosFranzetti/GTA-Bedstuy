import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NeuralTts, WARMUP_TEXT, type WorkerLike } from '@/audio/voice/NeuralTts';
import { ClipCache, type PersistentStore } from '@/audio/voice/ClipCache';
import { SpeechPlayer, type SpeechPlayerEnv } from '@/audio/voice/SpeechPlayer';
import { VoiceHub, defaultHdEnabled, looksLikePhone, HD_STORAGE_KEY } from '@/audio/voice/VoiceHub';
import { clipKey } from '@/audio/voice/script';
import type { Clip, TtsEngine, TtsRequest } from '@/audio/voice/types';
import type { SpeechLike, UtteranceLike } from '@/audio/talk/TalkPlayer';

/* ---------- fakes ---------- */

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  sent: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  terminated = false;
  /** ms of compute reported per second of audio; clips are 1 s of 24 kHz silence per 10 characters. */
  rtf = 0.5;
  auto = true;
  postMessage(m: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    this.sent.push(m);
    if (!this.auto) return;
    if (m.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready', device: 'wasm' } }));
    if (m.type === 'gen') queueMicrotask(() => this.reply(m));
  }
  reply(m: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    const secs = Math.max(0.5, m.text.length / 10);
    this.onmessage?.({ data: { type: 'clip', id: m.id, sr: 24000, samples: new Float32Array(Math.floor(24000 * secs)).fill(0.1), ms: secs * this.rtf * 1000 } });
  }
  terminate(): void { this.terminated = true; }
}

function fakeCtx() {
  const node = (): any => new Proxy(function () { /* noop */ }, { // eslint-disable-line @typescript-eslint/no-explicit-any
    get: (t: any, k: string) => (k in t ? t[k] : (t[k] = typeof k === 'string' && ['value'].includes(k) ? 0 : node())), // eslint-disable-line @typescript-eslint/no-explicit-any
    set: (t: any, k: string, v: unknown) => { t[k] = v; return true; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    apply: () => undefined,
  });
  const sources: Array<{ at: number; dur: number; stopped: boolean }> = [];
  const ctx = {
    currentTime: 0, sampleRate: 24000,
    createBuffer: (_c: number, len: number, sr: number) => ({ duration: len / sr, copyToChannel: () => undefined, getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => {
      const rec = { at: -1, dur: 0, stopped: false };
      sources.push(rec);
      return { set buffer(b: { duration: number }) { rec.dur = b.duration; }, connect: () => undefined, disconnect: () => undefined, start: (t: number) => { rec.at = t; }, stop: () => { rec.stopped = true; } };
    },
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node, createConvolver: node, createWaveShaper: node, createOscillator: node,
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, sources };
}

class FakeEngine implements TtsEngine {
  kind = 'fake' as const;
  ready = true; usable = true; rtf = 0.4;
  calls: TtsRequest[] = [];
  cancelled = 0;
  failOn: ((r: TtsRequest) => boolean) | null = null;
  hang = false;
  demoted = 0;
  demote(): void { this.demoted++; this.usable = false; }
  async load(): Promise<void> { /* ready */ }
  synth(req: TtsRequest): Promise<Clip> {
    this.calls.push(req);
    if (this.hang) return new Promise(() => undefined);
    if (this.failOn?.(req)) return Promise.reject(new Error('boom'));
    return Promise.resolve({ samples: new Float32Array(24000).fill(0.2), sampleRate: 24000 });
  }
  cancelAll(): void { this.cancelled++; }
  dispose(): void { /* none */ }
}

class FakeSpeech implements SpeechLike {
  spoken: UtteranceLike[] = [];
  canceled = 0; paused = false;
  speak(u: UtteranceLike): void { this.spoken.push(u); queueMicrotask(() => u.onend?.()); }
  cancel(): void { this.canceled++; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  getVoices() { return [{ name: 'A', lang: 'en-US' }, { name: 'B', lang: 'en-GB' }]; }
}
const utter = (text: string): UtteranceLike => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: '', onend: null, onerror: null });

const flush = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

/* ---------- NeuralTts ---------- */

describe('NeuralTts', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('loads through a worker, warms up, measures the real-time factor and serves clips', async () => {
    const w = new FakeWorker();
    const tts = new NeuralTts({ createWorker: () => w, warn: () => undefined });
    await tts.load();
    expect(tts.ready && tts.usable).toBe(true);
    expect(w.sent[0]).toMatchObject({ type: 'init', dtype: 'q8', device: 'wasm', model: 'onnx-community/Kokoro-82M-v1.0-ONNX' });
    expect(w.sent[0].lib).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/kokoro-js@1\.2\.1\//);
    expect(w.sent[1]).toMatchObject({ type: 'gen', text: WARMUP_TEXT });
    expect(tts.rtf).toBeCloseTo(0.5, 1);
    const c = await tts.synth({ text: 'Hello Brooklyn', voice: 'af_heart', speed: 1 });
    expect(c.sampleRate).toBe(24000);
    expect(c.samples.length).toBeGreaterThan(1000);
  });

  it('flags a device slower than real time and stays unusable for live speech, warning once', async () => {
    const warn = vi.fn();
    const w = new FakeWorker(); w.rtf = 6;
    const tts = new NeuralTts({ createWorker: () => w, warn });
    await tts.load();
    expect(tts.ready).toBe(true);
    expect(tts.slow).toBe(true);
    expect(tts.usable).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('serves live requests before background pre-renders and cancels queued work', async () => {
    const w = new FakeWorker();
    const tts = new NeuralTts({ createWorker: () => w, warn: () => undefined });
    await tts.load();
    w.auto = false;
    const sentBefore = w.sent.length;
    const first = tts.synth({ text: 'in flight now', voice: 'af_heart', speed: 1 }, 1);
    const bg = tts.synth({ text: 'background', voice: 'af_heart', speed: 1 }, 1);
    const live = tts.synth({ text: 'live', voice: 'af_heart', speed: 1 }, 0);
    first.catch(() => undefined);
    const bgErr = bg.catch((e) => e.message);
    tts.cancelAll();
    expect(await bgErr).toBe('cancelled');
    await expect(live).rejects.toThrow('cancelled');
    expect(w.sent.length - sentBefore).toBe(1);
    w.reply(w.sent[w.sent.length - 1]);
    await expect(first).resolves.toBeTruthy();
  });

  it('orders the queue by priority', async () => {
    const w = new FakeWorker();
    const tts = new NeuralTts({ createWorker: () => w, warn: () => undefined });
    await tts.load();
    w.auto = false;
    const a = tts.synth({ text: 'a', voice: 'af_heart', speed: 1 }, 1);
    const b = tts.synth({ text: 'b', voice: 'af_heart', speed: 1 }, 1);
    const c = tts.synth({ text: 'c', voice: 'af_heart', speed: 1 }, 0);
    const order: string[] = [];
    for (let i = 0; i < 3; i++) { const m = w.sent[w.sent.length - 1]; order.push(m.text); w.reply(m); await flush(); }
    await Promise.all([a, b, c]);
    expect(order).toEqual(['a', 'c', 'b']);
  });

  it('falls back with one console warning when a render times out, then refuses new work', async () => {
    const warn = vi.fn();
    const w = new FakeWorker();
    const tts = new NeuralTts({ createWorker: () => w, warn, genTimeoutMs: 1000 });
    await tts.load();
    w.auto = false;
    const p = tts.synth({ text: 'stuck', voice: 'af_heart', speed: 1 });
    const err = p.then(() => new Error("no error"), (e) => e as Error);
    vi.advanceTimersByTime(1500);
    expect((await err).message).toMatch(/timed out/);
    expect(tts.failed).toBe(true);
    expect(tts.usable).toBe(false);
    await expect(tts.synth({ text: 'again', voice: 'af_heart', speed: 1 })).rejects.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(w.terminated).toBe(true);
  });

  it('rejects load and warns once when the library or model cannot be loaded', async () => {
    const warn = vi.fn();
    const w = new FakeWorker(); w.auto = false;
    const tts = new NeuralTts({ createWorker: () => w, warn });
    const p = tts.load();
    const err = p.then(() => new Error("no error"), (e) => e as Error);
    w.onmessage?.({ data: { type: 'error', message: 'Failed to fetch dynamically imported module' } });
    expect((await err).message).toMatch(/Failed to fetch/);
    expect(tts.failed).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('times out a model download that never finishes', async () => {
    const warn = vi.fn();
    const w = new FakeWorker(); w.auto = false;
    const tts = new NeuralTts({ createWorker: () => w, warn, loadTimeoutMs: 5000 });
    const err = tts.load().then(() => new Error("no error"), (e) => e as Error);
    vi.advanceTimersByTime(6000);
    expect((await err).message).toMatch(/timed out/);
  });
});

/* ---------- cache ---------- */

describe('ClipCache', () => {
  const clip = (n: number): Clip => ({ samples: new Float32Array(n).fill(0.5), sampleRate: 24000 });
  it('round-trips clips, keeps recently used ones under the byte cap and persists writes', async () => {
    const rows = new Map<string, { pcm: Int16Array; sampleRate: number }>();
    const store: PersistentStore = { get: async (k) => rows.get(k), put: async (k, v) => { rows.set(k, v); }, trim: async () => undefined };
    const cache = new ClipCache(store, 2000);
    cache.put('a', clip(400));
    cache.put('b', clip(400));
    expect((await cache.get('a'))!.samples[0]).toBeCloseTo(0.5, 2);
    cache.put('c', clip(400)); // 2400 bytes > cap: evicts b (a was just used)
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    await flush();
    expect(rows.has('b')).toBe(true);
    const fresh = new ClipCache(store);
    expect(await fresh.get('b')).not.toBeNull(); // served from the persistent store after a "reload"
    expect(await fresh.get('zzz')).toBeNull();
  });
});

/* ---------- player ---------- */

function makePlayer(over: Partial<SpeechPlayerEnv> = {}) {
  const { ctx, raw, sources } = fakeCtx();
  const engine = new FakeEngine();
  const speech = new FakeSpeech();
  const cache = new ClipCache(null);
  const env: SpeechPlayerEnv = {
    ctx: () => ctx, dest: () => ({} as AudioNode), speech, makeUtterance: utter, engine: () => engine, cache, volume: () => 1, warn: () => undefined,
    fxBank: () => ({ input: () => ({} as AudioNode) }) as never,
    ...over,
  };
  return { player: new SpeechPlayer(env), raw, sources, engine, speech, cache, ctx };
}

describe('SpeechPlayer', () => {
  const lines = [
    { who: 'buck', text: 'Good morning, Brooklyn. [pause 0.5] Buck Mercer here.' },
    { who: 'boards', text: '[over] Buck, the phones are open.' },
  ];

  it('neural: renders each sentence in the character voice, schedules them in order with the pause and an interruption overlap', async () => {
    const t = makePlayer();
    const seen: string[] = [];
    let ended = false;
    t.player.play(lines, { onLine: (c) => seen.push(c.id), onEnd: () => { ended = true; } });
    await flush(40);
    expect(t.engine.calls.map((c) => [c.voice, c.speed])).toEqual([['am_onyx', 1.05], ['am_onyx', 1.05], ['am_liam', 1.08]]);
    expect(t.engine.calls[0].text).toBe('Good morning, Brooklyn.');
    expect(t.sources).toHaveLength(3);
    const [a, b, c] = t.sources;
    expect(b.at).toBeGreaterThanOrEqual(a.at + a.dur + 0.5 - 0.001); // [pause 0.5] honoured
    expect(c.at).toBeLessThan(b.at + b.dur); // [over]: starts before the previous sentence has finished
    expect(c.at).toBeGreaterThan(b.at);
    expect(ended).toBe(false);
    t.raw.currentTime = 100;
    for (let i = 0; i < 60 && (!ended || seen.length < 2); i++) await new Promise((r) => setTimeout(r, 50));
    expect(ended).toBe(true);
    expect(seen).toEqual(['buck', 'boards']);
  });

  it('caches rendered sentences: a second play makes no engine calls', async () => {
    const t = makePlayer();
    t.player.play(lines);
    await flush(40);
    const n = t.engine.calls.length;
    t.player.play(lines);
    await flush(40);
    expect(t.engine.calls.length).toBe(n);
    expect(t.cache.has(clipKey('Good morning, Brooklyn.', 'am_onyx', 1.05))).toBe(true);
  });

  it('cancel stops scheduled audio, drops queued renders and never fires onEnd', async () => {
    const t = makePlayer();
    let ended = false;
    const h = t.player.play(lines, { onEnd: () => { ended = true; } });
    await flush(40);
    h.cancel();
    expect(t.sources.every((s) => s.stopped)).toBe(true);
    expect(t.engine.cancelled).toBeGreaterThan(0);
    t.raw.currentTime = 100;
    await new Promise((r) => setTimeout(r, 700));
    expect(ended).toBe(false);
  });

  it('falls back to system voices, mapped per character, when a render fails, with one warning and an engine-trouble report', async () => {
    const warn = vi.fn(); const trouble = vi.fn();
    const t = makePlayer({ warn, onEngineTrouble: trouble });
    t.engine.failOn = (r) => r.text.startsWith('Buck');
    let ended = false;
    t.player.play(lines, { onEnd: () => { ended = true; } });
    await new Promise((r) => setTimeout(r, 1500));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(trouble).toHaveBeenCalledTimes(1);
    // 'Good morning' went neural; the failed sentence and everything after is spoken by the system voices.
    expect(t.sources).toHaveLength(1);
    const texts = t.speech.spoken.map((u) => u.text);
    expect(texts).toEqual(['Buck Mercer here.', 'Buck, the phones are open.']);
    expect(t.speech.spoken[0].pitch).toBeCloseTo(0.78);
    expect(t.speech.spoken[1].pitch).toBeCloseTo(1.18);
    expect(t.speech.spoken[0].rate).not.toBe(t.speech.spoken[1].rate);
    expect(ended).toBe(true);
  });

  it('falls back when a render stalls past the timeout', async () => {
    const warn = vi.fn();
    const t = makePlayer({ warn, stallSeconds: 0.05 });
    t.engine.hang = true;
    let ended = false;
    t.player.play([lines[0]], { onEnd: () => { ended = true; } });
    await new Promise((r) => setTimeout(r, 1500));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(t.speech.spoken.length).toBeGreaterThan(0);
    expect(ended).toBe(true);
  });

  it('uses system voices when HD is off (no engine), and goes silent-with-timer when nothing can speak', async () => {
    const sys = makePlayer({ engine: () => null });
    expect(sys.player.mode).toBe('system');
    sys.player.play([lines[1]]);
    await new Promise((r) => setTimeout(r, 50));
    expect(sys.speech.spoken[0].text).toBe('Buck, the phones are open.');

    const none = makePlayer({ engine: () => null, speech: null, ctx: () => null });
    expect(none.player.mode).toBe('silent');
    const heard: string[] = []; let ended = false;
    none.player.play(lines, { onLine: (c) => heard.push(c.id), onEnd: () => { ended = true; } });
    expect(heard).toEqual(['buck']);
    for (let i = 0; i < 40 && !ended; i++) none.player.tick(0.5);
    expect(heard).toEqual(['buck', 'boards']);
    expect(ended).toBe(true);
  });

  it('prefetch renders the next segment in the background without playing it', async () => {
    const t = makePlayer();
    t.player.prefetch(lines);
    await flush(40);
    expect(t.engine.calls.length).toBe(3);
    expect(t.sources).toHaveLength(0);
  });

  it('ignores unknown speakers instead of throwing', async () => {
    const t = makePlayer();
    let ended = false;
    t.player.play([{ who: 'nobody', text: 'Hi.' }], { onEnd: () => { ended = true; } });
    await flush();
    expect(ended).toBe(true);
  });
});

/* ---------- hub ---------- */

describe('VoiceHub', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  const base = (extra: object = {}) => ({ ctx: () => null, dest: () => null, speech: null, makeUtterance: utter, volume: () => 1, persist: null, ...extra });

  it('defaults: on for the desktop hosted build only', () => {
    expect(defaultHdEnabled({ hosted: true, phone: false })).toBe(true);
    expect(defaultHdEnabled({ hosted: true, phone: true })).toBe(false);
    expect(defaultHdEnabled({ hosted: false, phone: false })).toBe(false);
    expect(defaultHdEnabled({ hosted: true, phone: false, artifact: true })).toBe(false);
    expect(looksLikePhone({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }, false)).toBe(true);
    expect(looksLikePhone({ userAgent: 'Mozilla/5.0 (Macintosh)' }, false)).toBe(false);
  });

  it('downloads nothing before the first gesture, loads lazily after it, and remembers the choice', async () => {
    const made: FakeEngine[] = [];
    const storage = mem();
    const hub = new VoiceHub(base({ hosted: true, storage, engineFactory: () => { const e = new FakeEngine(); made.push(e); return e; } }));
    expect(hub.hdEnabled).toBe(true);
    expect(made).toHaveLength(0);
    expect(hub.state).toBe('off'.replace('off', hub.state));
    hub.onGesture();
    expect(made).toHaveLength(1);
    await flush();
    expect(hub.state).toBe('ready');
    hub.setHd(false);
    expect(storage.getItem(HD_STORAGE_KEY)).toBe('0');
    expect(hub.state).toBe('off');
    expect(new VoiceHub(base({ hosted: true, storage })).hdEnabled).toBe(false);
  });

  it('is off on phones and in the artifact build, and the toggle turns it on', async () => {
    const made: FakeEngine[] = [];
    const f = () => { const e = new FakeEngine(); made.push(e); return e; };
    const phone = new VoiceHub(base({ hosted: true, phone: true, engineFactory: f }));
    phone.onGesture();
    expect(phone.hdEnabled).toBe(false);
    expect(made).toHaveLength(0);
    phone.setHd(true);
    expect(made).toHaveLength(1);
    const art = new VoiceHub(base({ hosted: false, engineFactory: f }));
    expect(art.hdEnabled).toBe(false);
  });

  it('a render stall demotes the engine so the next segment goes straight to system voices', async () => {
    const e = new FakeEngine();
    const speech = new FakeSpeech();
    const { ctx } = fakeCtx();
    const hub = new VoiceHub(base({ hosted: true, speech, ctx: () => ctx, dest: () => ({}) as AudioNode, engineFactory: () => e }));
    hub.onGesture();
    await flush();
    expect(hub.player.mode).toBe('neural');
    e.hang = true;
    (hub.player as unknown as { env: { stallSeconds: number } }).env.stallSeconds = 0.05;
    const done = new Promise<void>((res) => hub.player.play([{ who: 'buck', text: 'Hello there.' }], { onEnd: () => res() }));
    await done;
    expect(e.demoted).toBe(1);
    expect(hub.state).toBe('slow');
    expect(hub.player.mode).toBe('system');
  });

  it('reports failed when the engine cannot load, and the player keeps using system voices', async () => {
    const e = new FakeEngine(); e.ready = false; e.usable = false;
    (e as unknown as { failed: boolean }).failed = true;
    e.load = () => Promise.reject(new Error('no net'));
    const speech = new FakeSpeech();
    const hub = new VoiceHub(base({ hosted: true, speech, engineFactory: () => e }));
    hub.onGesture();
    await flush();
    expect(hub.state).toBe('failed');
    expect(hub.player.mode).toBe('system');
  });
});
