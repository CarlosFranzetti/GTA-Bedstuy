/**
 * VoiceHub: owns the HD engine lifecycle, the clip cache and the shared SpeechPlayer.
 *
 * HD voices are opt-in: default ON only for the desktop hosted build (after the first user gesture), OFF on phones and
 * in the single-file artifact, where SpeechSynthesis stays the voice. The choice is remembered in localStorage.
 * Loading is lazy: nothing is downloaded until HD is on and a gesture has happened.
 */
import { ClipCache, idbStore, type PersistentStore } from './ClipCache';
import { NeuralTts } from './NeuralTts';
import { SpeechPlayer } from './SpeechPlayer';
import { HD_VOICES, type TtsEngine } from './types';
import type { SpeechLike, UtteranceLike } from '../talk/TalkPlayer';

export const HD_STORAGE_KEY = 'wbsy.hdVoices';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Default for a first visit: hosted desktop build only. */
export function defaultHdEnabled(env: { hosted: boolean; phone: boolean; artifact?: boolean }): boolean {
  return env.hosted && !env.phone && !env.artifact;
}

export function looksLikePhone(nav: { maxTouchPoints?: number; userAgent?: string } | undefined, coarse: boolean): boolean {
  if (!nav) return false;
  return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '');
}

export type HdState = 'off' | 'waiting' | 'loading' | 'ready' | 'slow' | 'failed';

export interface HubOptions {
  ctx: () => AudioContext | null;
  dest: () => AudioNode | null;
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  volume: () => number;
  hosted?: boolean;
  phone?: boolean;
  artifact?: boolean;
  storage?: StorageLike | null;
  persist?: PersistentStore | null;
  engineFactory?: () => TtsEngine;
  warn?: (msg: string) => void;
}

export class VoiceHub {
  readonly cache: ClipCache;
  readonly player: SpeechPlayer;
  private _engine: TtsEngine | null = null;
  private enabled: boolean;
  private gesture = false;
  private _state: HdState = 'off';
  private readonly listeners = new Set<() => void>();

  constructor(private readonly opts: HubOptions) {
    this.cache = new ClipCache(opts.persist === undefined ? safeIdb() : opts.persist);
    this.enabled = this.readSetting();
    this.player = new SpeechPlayer({
      ctx: opts.ctx, dest: opts.dest, speech: opts.speech, makeUtterance: opts.makeUtterance, volume: opts.volume, warn: opts.warn,
      engine: () => (this.enabled ? this._engine : null),
      cache: this.cache,
      onEngineTrouble: () => this.refresh(),
    });
  }

  get hdEnabled(): boolean { return this.enabled; }
  get state(): HdState { return this._state; }
  get engine(): TtsEngine | null { return this._engine; }
  /** Text for the toggle: what it is and what it costs to download. */
  get label(): string { return `${HD_VOICES.label}, one-time download about ${HD_VOICES.downloadMb} MB`; }
  get canSpeak(): boolean { return this.player.mode !== 'silent'; }

  onChange(f: () => void): () => void { this.listeners.add(f); return () => this.listeners.delete(f); }

  setHd(on: boolean): void {
    this.enabled = on;
    try { this.opts.storage?.setItem(HD_STORAGE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
    if (!on) { this.player.cancel(); } else this.maybeLoad();
    this.refresh();
  }

  /** Call on the first user gesture (audio start). Begins the model download if HD is on. */
  onGesture(): void {
    this.gesture = true;
    this.maybeLoad();
    this.refresh();
  }

  dispose(): void {
    this.player.cancel();
    this._engine?.dispose();
    this._engine = null;
    this.listeners.clear();
  }

  private readSetting(): boolean {
    try {
      const v = this.opts.storage?.getItem(HD_STORAGE_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch { /* ignore */ }
    return defaultHdEnabled({ hosted: !!this.opts.hosted, phone: !!this.opts.phone, artifact: this.opts.artifact });
  }

  private maybeLoad(): void {
    if (!this.enabled || !this.gesture || this._engine) return;
    const eng = this.opts.engineFactory ? this.opts.engineFactory() : new NeuralTts({ warn: this.opts.warn });
    this._engine = eng;
    this._state = 'loading';
    eng.load().then(() => this.refresh(), () => this.refresh());
  }

  private refresh(): void {
    const e = this._engine;
    const prev = this._state;
    if (!this.enabled) this._state = 'off';
    else if (!this.gesture || !e) this._state = 'waiting';
    else if ((e as { failed?: boolean }).failed) this._state = 'failed';
    else if (e.ready && !e.usable) this._state = 'slow';
    else this._state = e.usable ? 'ready' : 'loading';
    if (prev !== this._state) for (const f of this.listeners) f();
  }
}

function safeIdb(): PersistentStore | null {
  try { return idbStore(); } catch { return null; }
}
