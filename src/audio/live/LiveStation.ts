/**
 * A live internet-radio station: one public stream URL played in an HTMLAudioElement. No CORS is needed for playback
 * (crossOrigin stays unset) and there is no analyser, so the element's own volume is the radio level. Same contract as
 * ScStation where the director cares: setActive / setPaused / setVolume / setDuck / userStart, a tap-to-start path when
 * the browser blocks sound, and a stall watchdog (no progress for LIVE_STALL_MS => reconnect; after LIVE_MAX_RECONNECTS
 * failed reconnects the station reports failure and the director tunes to the next one).
 *
 * Lazy: no element and no network until the first tune-in. Tuning away drops the connection (a live stream must not buffer
 * in the background); tuning back reconnects at the live edge.
 */
import type { CatalogEntry, LiveNowPlaying } from '../stations';

export const LIVE_STALL_MS = 12000;
export const LIVE_CONNECT_MS = 20000;
export const LIVE_BLOCKED_MS = 4000;
export const LIVE_MAX_RECONNECTS = 3;
/** After a failure, how long before a tune-in may try the station again. */
export const LIVE_RETRY_MS = 30000;
export const LIVE_TAP_PROMPT = 'Tap to start radio';
export const LIVE_NO_STREAM = 'No stream: this station could not be reached';
const NOWPLAYING_MS = 30000;

/** The slice of HTMLAudioElement the station uses (tests pass a fake). */
export interface AudioLike {
  src: string;
  volume: number;
  paused: boolean;
  currentTime: number;
  preload: string;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  removeAttribute?(name: string): void;
  addEventListener(type: string, fn: (e?: unknown) => void): void;
  removeEventListener(type: string, fn: (e?: unknown) => void): void;
}

export interface LiveEnv {
  createAudio: () => AudioLike;
  now: () => number;
  canLoad: () => boolean;
  doc: () => Document | null;
  fetchJson: (url: string) => Promise<unknown>;
  /** Watchdog tick, ms. */
  tickMs: number;
  stallMs: number;
  connectMs: number;
  blockedMs: number;
}

export type LiveState = 'idle' | 'connecting' | 'playing' | 'failed';
export type LivePlay = 'idle' | 'starting' | 'playing' | 'blocked';

function defaultEnv(): LiveEnv {
  const hosted = (() => { try { return import.meta.env?.VITE_HOSTED === '1'; } catch { return false; } })();
  return {
    createAudio: () => { const a = new Audio(); a.preload = 'none'; return a as unknown as AudioLike; },
    now: () => Date.now(),
    canLoad: () => hosted || (typeof navigator === 'undefined' ? false : navigator.onLine !== false),
    doc: () => (typeof document !== 'undefined' ? document : null),
    fetchJson: async (url) => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    tickMs: 2000, stallMs: LIVE_STALL_MS, connectMs: LIVE_CONNECT_MS, blockedMs: LIVE_BLOCKED_MS,
  };
}

const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/** Parses the station's public now-playing JSON into "Artist - Title" (empty when the shape is not recognised). */
export function parseNowPlaying(np: LiveNowPlaying, json: unknown): string {
  try {
    if (np.shape === 'kexp') {
      const r = (json as { results?: Array<{ artist?: string; song?: string }> }).results?.[0];
      return r?.song ? `${r.artist ?? ''}${r.artist ? ' - ' : ''}${r.song}` : '';
    }
    const ch = (json as { channels?: Array<{ id?: string; lastPlaying?: string }> }).channels?.find((c) => c.id === np.channel);
    return (ch?.lastPlaying ?? '').trim();
  } catch { return ''; }
}

export class LiveStation {
  readonly id: string;
  private readonly env: LiveEnv;
  private audio: AudioLike | null = null;
  private state: LiveState = 'idle';
  private play_: LivePlay = 'idle';
  private active = false;
  private paused = false;
  private volume = 1;
  private duck = 1;
  private streamIdx = 0;
  private reconnects = 0;
  private lastProgAt = 0;
  private lastTime = -1;
  private connectAt = 0;
  private failedAt = -Infinity;
  private tick: ReturnType<typeof setInterval> | null = null;
  private blockTimer: ReturnType<typeof setTimeout> | null = null;
  private hookDoc: Document | null = null;
  private npTimer: ReturnType<typeof setInterval> | null = null;
  private track = '';
  private readonly listeners = new Set<() => void>();
  /** Fired when the station gave up (director tunes away with a toast). */
  onFail: (() => void) | null = null;
  /** Counters for tests and the playtest script. */
  connects = 0;

  constructor(readonly def: CatalogEntry, env: Partial<LiveEnv> = {}) {
    this.id = def.id;
    this.env = { ...defaultEnv(), ...env };
  }

  /* ---------- reading ---------- */

  get name(): string { return this.def.name; }
  get status(): LiveState { return this.state; }
  get playState(): LivePlay { return this.play_; }
  get isActive(): boolean { return this.active; }
  get needsTap(): boolean { return this.active && !this.paused && this.play_ === 'blocked'; }
  get streamUrl(): string { return this.def.streams?.[this.streamIdx % (this.def.streams?.length || 1)] ?? ''; }
  /** HUD second half: the current song when the station publishes one, else its genre line. */
  get trackName(): string { return this.track || this.def.genre; }
  get notice(): string {
    if (!this.active) return '';
    if (this.state === 'failed') return LIVE_NO_STREAM;
    return this.needsTap ? LIVE_TAP_PROMPT : '';
  }
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { this.listeners.forEach((fn) => fn()); }

  /* ---------- control ---------- */

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) this.tuneIn();
    else this.release();
    this.emit();
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (!this.active) return;
    if (p) { this.audio?.pause(); this.stopTimers(); }
    else this.connect(); // back at the live edge
  }

  setVolume(v: number): void { this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); this.pushVolume(); }
  setDuck(level: number): void { this.duck = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); this.pushVolume(); }
  private pushVolume(): void { if (this.audio) this.audio.volume = this.volume * this.duck; }

  /** Call from a user gesture: starts playback inside it. */
  userStart(): void {
    if (!this.active) return;
    this.unhook();
    if (this.state === 'failed') { this.failedAt = -Infinity; this.reconnects = 0; }
    if (!this.audio || this.state === 'failed' || this.state === 'idle') { this.state = 'idle'; this.tuneIn(); return; }
    this.startPlay();
  }

  private tuneIn(): void {
    if (this.state === 'failed') {
      if (this.env.now() - this.failedAt < LIVE_RETRY_MS) { this.emit(); return; }
      this.state = 'idle';
    }
    this.reconnects = 0;
    this.connect();
    this.pollNowPlaying();
    if (!this.npTimer && this.def.nowPlaying) this.npTimer = setInterval(() => this.pollNowPlaying(), NOWPLAYING_MS);
  }

  /** (Re)opens the stream at its live edge and asks the element to play. */
  private connect(): void {
    if (!this.active || this.paused) return;
    if (!this.env.canLoad() || !this.streamUrl) { this.fail(); return; }
    this.state = 'connecting';
    this.play_ = 'starting';
    this.connects++;
    const a = this.audio ?? this.makeAudio();
    this.audio = a;
    this.connectAt = this.env.now();
    this.lastProgAt = this.connectAt;
    this.lastTime = -1;
    a.src = this.streamUrl;
    this.pushVolume();
    a.load?.();
    this.startPlay();
    this.armTimers();
    this.emit();
  }

  private startPlay(): void {
    const a = this.audio;
    if (!a) return;
    this.play_ = this.play_ === 'playing' ? 'playing' : 'starting';
    let r: Promise<void> | void;
    try { r = a.play(); } catch { r = undefined; this.markBlocked(); return; }
    if (r && typeof (r as Promise<void>).catch === 'function') {
      (r as Promise<void>).catch((e: unknown) => {
        const n = (e as { name?: string } | null)?.name;
        if (n === 'NotAllowedError') this.markBlocked(); // else the error event / watchdog handles it
      });
    }
    if (this.blockTimer) clearTimeout(this.blockTimer);
    this.blockTimer = setTimeout(() => { if (this.active && !this.paused && this.play_ !== 'playing') this.markBlocked(); }, this.env.blockedMs);
  }

  private markBlocked(): void {
    if (!this.active || this.play_ === 'playing') return;
    this.play_ = 'blocked';
    this.hook();
    this.emit();
  }

  private makeAudio(): AudioLike {
    const a = this.env.createAudio();
    a.preload = 'none';
    const onPlaying = () => {
      this.state = 'playing';
      this.play_ = 'playing';
      this.lastProgAt = this.env.now();
      this.unhook();
      this.emit();
    };
    a.addEventListener('playing', onPlaying);
    a.addEventListener('timeupdate', () => {
      if (a.currentTime !== this.lastTime) { this.lastTime = a.currentTime; this.lastProgAt = this.env.now(); if (this.play_ !== 'playing' && !a.paused) onPlaying(); }
    });
    a.addEventListener('error', () => { if (this.active && !this.paused) this.reconnect(); });
    a.addEventListener('stalled', () => { /* the watchdog decides */ });
    return a;
  }

  private armTimers(): void {
    if (this.tick) return;
    this.tick = setInterval(() => this.watch(), this.env.tickMs);
  }
  private stopTimers(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    if (this.blockTimer) clearTimeout(this.blockTimer);
    this.blockTimer = null;
  }

  /** Stall watchdog: no progress for stallMs while playing (or connectMs while connecting) => reconnect. */
  private watch(): void {
    if (!this.active || this.paused || !this.audio) return;
    if (this.play_ === 'blocked') return; // waiting for a tap, not stalled
    const idle = this.env.now() - this.lastProgAt;
    const limit = this.state === 'playing' ? this.env.stallMs : this.env.connectMs;
    if (idle >= limit) this.reconnect();
  }

  private reconnect(): void {
    if (++this.reconnects > LIVE_MAX_RECONNECTS) { this.fail(); return; }
    this.streamIdx++; // alternate stream URL when the station publishes more than one
    this.state = 'connecting';
    this.play_ = 'starting';
    this.connect();
  }

  private fail(): void {
    this.state = 'failed';
    this.play_ = 'idle';
    this.failedAt = this.env.now();
    this.stopTimers();
    this.dropConnection();
    this.emit();
    this.onFail?.();
  }

  private dropConnection(): void {
    const a = this.audio;
    if (!a) return;
    try { a.pause(); a.removeAttribute?.('src'); a.src = ''; a.load?.(); } catch { /* ignore */ }
  }

  private release(): void {
    this.stopTimers();
    this.unhook();
    if (this.npTimer) clearInterval(this.npTimer);
    this.npTimer = null;
    this.dropConnection();
    if (this.state !== 'failed') this.state = 'idle';
    this.play_ = 'idle';
  }

  private pollNowPlaying(): void {
    const np = this.def.nowPlaying;
    if (!np || !this.active) return;
    this.env.fetchJson(np.url).then((j) => {
      const t = parseNowPlaying(np, j);
      if (t && t !== this.track) { this.track = t; this.emit(); }
    }).catch(() => { /* optional: genre line stays */ });
  }

  /* ---------- gesture hook (same one-shot pattern as the SoundCloud stations) ---------- */

  private hook(): void {
    const d = this.env.doc();
    if (!d || this.hookDoc) return;
    this.hookDoc = d;
    for (const t of GESTURES) d.addEventListener(t, this.onGesture, true);
  }
  private unhook(): void {
    const d = this.hookDoc;
    if (!d) return;
    for (const t of GESTURES) d.removeEventListener(t, this.onGesture, true);
    this.hookDoc = null;
  }
  private readonly onGesture = (): void => { this.userStart(); };

  dispose(): void {
    this.active = false;
    this.release();
    this.listeners.clear();
  }
}
