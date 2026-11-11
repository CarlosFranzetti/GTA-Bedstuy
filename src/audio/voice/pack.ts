/**
 * Voice pack runtime: pre-rendered speech (scripts/voice/bake-pack.mjs) shipped with the hosted and native builds only.
 *
 *   <base>manifest.json        { version, engine, sampleRate, entries: { [clipKey]: { file, off, len, dur, lufs, peak, who, text } } }
 *   <base>banks/<bank>.mp3     clips of one bank concatenated; each entry is a standalone MP3 at [off, off + len)
 *
 * `clipKey` is the same key ClipCache uses (script.ts), so the runtime asks the pack with the key it would give the
 * cache. The manifest is fetched once (lazily, after the first user gesture); a bank file is fetched the first time one
 * of its clips is needed and kept (compressed) in memory; clips are decoded on demand. A missing manifest, a failed
 * fetch or a missing clip is not an error: the caller falls back to ClipCache, live neural voices, SpeechSynthesis.
 *
 * Only the `kokoro-baked` source is active. `elevenlabs-baked` reads the very same manifest (generated offline by a
 * script the owner has not approved; see docs/reference/VOICES.md) and stays off: nothing here calls a paid API.
 */
import type { Clip } from './types';

export interface PackEntry { file: string; off: number; len: number; dur: number; lufs: number; peak: number; who: string; text: string }
export interface PackManifest { version: number; engine: string; sampleRate: number; entries: Record<string, PackEntry> }

export type PackSourceId = 'kokoro-baked' | 'elevenlabs-baked';
export type PackState = 'idle' | 'loading' | 'ready' | 'missing';

/** What the speech players need from a pack. */
export interface PackLookup {
  readonly state: PackState;
  has(key: string): boolean;
  get(key: string): Promise<Clip | null>;
  /** Duration of a baked clip in seconds (0 when unknown), for scheduling before the audio is fetched. */
  duration(key: string): number;
  /** Starts fetching the banks that hold these keys (fire and forget). */
  warm(keys: Iterable<string>): void;
}

export interface VoicePackSource extends PackLookup {
  readonly id: PackSourceId;
  /** Text for the debug panel, from the manifest's `engine` field. */
  readonly label: string;
  readonly manifest: PackManifest | null;
  load(): Promise<boolean>;
  stats(): { state: PackState; clips: number; engine: string; banksFetched: number; bytesFetched: number; hits: number; misses: number };
}

export interface PackEnv {
  /** Base URL of the pack folder, ending in "/" (e.g. "./voice/"). */
  base: string;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;
  /** Decodes one MP3 clip to mono float samples (the hub supplies the AudioContext). */
  decode: (bytes: ArrayBuffer) => Promise<Clip>;
  warn?: (msg: string) => void;
}

export function packLabel(engine: string | undefined): string {
  if (!engine) return 'voice pack';
  if (engine.startsWith('elevenlabs')) return `ElevenLabs ${engine.split(':')[1] ?? ''} (baked)`.replace(/\s+\(/, ' (');
  if (engine.startsWith('kokoro')) return 'Kokoro-82M (baked)';
  return `${engine} (baked)`;
}

export function validManifest(m: unknown): m is PackManifest {
  const x = m as PackManifest | null;
  return !!x && typeof x === 'object' && typeof x.version === 'number' && typeof x.engine === 'string' && !!x.entries && typeof x.entries === 'object';
}

/** The one implementation: reads a manifest and banks over HTTP. */
export class BakedPackSource implements VoicePackSource {
  readonly id: PackSourceId = 'kokoro-baked';
  manifest: PackManifest | null = null;
  private _state: PackState = 'idle';
  private loading: Promise<boolean> | null = null;
  private readonly banks = new Map<string, Promise<ArrayBuffer | null>>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private warned = false;

  constructor(protected readonly env: PackEnv) {}

  get state(): PackState { return this._state; }
  get label(): string { return packLabel(this.manifest?.engine); }

  load(): Promise<boolean> {
    if (this.loading) return this.loading;
    this._state = 'loading';
    const f = this.env.fetchImpl ?? ((u: string) => fetch(u));
    this.loading = f(`${this.env.base}manifest.json`).then(async (r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      const m = await r.json();
      if (!validManifest(m)) throw new Error('manifest is malformed');
      if (!this.accepts(m)) throw new Error(`manifest engine ${m.engine} is not enabled`);
      this.manifest = m;
      this._state = 'ready';
      return true;
    }).catch((e: unknown) => {
      this._state = 'missing';
      // 404 is the normal state of the artifact build and of a checkout without the pack: say it once, quietly.
      if (!this.warned) { this.warned = true; (this.env.warn ?? (() => undefined))(`voice pack unavailable (${e instanceof Error ? e.message : String(e)}); using live and system voices`); }
      return false;
    });
    return this.loading;
  }

  /** Whether this source may use a manifest produced by `engine`. */
  protected accepts(m: PackManifest): boolean { return !m.engine.startsWith('elevenlabs'); }

  has(key: string): boolean { return this._state === 'ready' && !!this.manifest && Object.prototype.hasOwnProperty.call(this.manifest.entries, key); }

  duration(key: string): number { return this.manifest?.entries[key]?.dur ?? 0; }

  private bank(file: string): Promise<ArrayBuffer | null> {
    let p = this.banks.get(file);
    if (!p) {
      const f = this.env.fetchImpl ?? ((u: string) => fetch(u));
      p = f(`${this.env.base}${file}`).then(async (r) => {
        if (!r.ok) throw new Error(`bank ${file} ${r.status}`);
        const b = await r.arrayBuffer();
        this.bytes += b.byteLength;
        return b;
      }).catch((e: unknown) => { this.banks.delete(file); (this.env.warn ?? (() => undefined))(`voice pack bank failed (${e instanceof Error ? e.message : String(e)})`); return null; });
      this.banks.set(file, p);
    }
    return p;
  }

  warm(keys: Iterable<string>): void {
    if (!this.manifest) return;
    const files = new Set<string>();
    for (const k of keys) { const e = this.manifest.entries[k]; if (e) files.add(e.file); }
    for (const f of files) void this.bank(f);
  }

  async get(key: string): Promise<Clip | null> {
    const e = this.has(key) ? this.manifest!.entries[key] : undefined;
    if (!e) { this.misses++; return null; }
    const bank = await this.bank(e.file);
    if (!bank) { this.misses++; return null; }
    try {
      const clip = await this.env.decode(bank.slice(e.off, e.off + e.len));
      this.hits++;
      return clip;
    } catch {
      this.misses++;
      return null;
    }
  }

  stats() {
    return { state: this._state, clips: this.manifest ? Object.keys(this.manifest.entries).length : 0, engine: this.manifest?.engine ?? '', banksFetched: this.banks.size, bytesFetched: this.bytes, hits: this.hits, misses: this.misses };
  }
}

/**
 * Stub for a pack generated with ElevenLabs. It reads the same manifest and banks but only accepts a manifest whose
 * `engine` starts with "elevenlabs:", and it is never constructed by default: `createPackSource('elevenlabs-baked', ...)`
 * must be asked for explicitly. The generator is not built and no credits are spent (see VOICES.md).
 */
export class ElevenLabsBakedSource extends BakedPackSource {
  override readonly id: PackSourceId = 'elevenlabs-baked';
  protected override accepts(m: PackManifest): boolean { return m.engine.startsWith('elevenlabs'); }
}

export function createPackSource(id: PackSourceId, env: PackEnv): VoicePackSource {
  return id === 'elevenlabs-baked' ? new ElevenLabsBakedSource(env) : new BakedPackSource(env);
}

/** Default source: Kokoro. ElevenLabs is OFF until the owner decides; this is the one place that would change. */
export const DEFAULT_PACK_SOURCE: PackSourceId = 'kokoro-baked';

/** Decodes an MP3 slice with a WebAudio context into mono float samples at the context's rate. */
export function webAudioDecoder(ctx: () => AudioContext | null): (bytes: ArrayBuffer) => Promise<Clip> {
  return async (bytes) => {
    const c = ctx();
    if (!c) throw new Error('no audio context');
    const buf = await c.decodeAudioData(bytes);
    const ch = buf.getChannelData(0);
    return { samples: Float32Array.from(ch), sampleRate: buf.sampleRate };
  };
}
