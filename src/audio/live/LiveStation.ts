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
import type { CatalogEntry, LiveNowPlaying, LiveSource } from '../stations';

export const LIVE_STALL_MS = 12000;
export const LIVE_CONNECT_MS = 12000;
export const LIVE_BLOCKED_MS = 4000;
export const LIVE_MAX_RECONNECTS = 3;
/** How long a connection may take before the display says so (a slow stream is not a silent one). */
export const LIVE_SAY_MS = 3000;
/** After a failure, how long before a tune-in may try the station again. */
export const LIVE_RETRY_MS = 30000;
/** A pool station that has played one stream this long moves to another of its streams (RADIO3). */
export const LIVE_ROTATE_MS = 35 * 60 * 1000;
export const LIVE_TAP_PROMPT = 'Tap to start radio';
export const LIVE_NO_STREAM = 'No stream: this station could not be reached';
export const LIVE_CONNECTING = 'Connecting to the stream...';
export const LIVE_RETRYING = 'Stream interrupted. Trying again...';
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
  /** Picks the pool stream (0..1). */
  random: () => number;
  rotateMs: number;
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
    random: Math.random, rotateMs: LIVE_ROTATE_MS,
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
  private lastNotice = '';
  private connectAt = 0;
  private failedAt = -Infinity;
  private tick: ReturnType<typeof setInterval> | null = null;
  private blockTimer: ReturnType<typeof setTimeout> | null = null;
  private hookDoc: Document | null = null;
  private npTimer: ReturnType<typeof setInterval> | null = null;
  private track = '';
  /** The pool stream that is on (null for a station with one stream). */
  private source: LiveSource | null = null;
  private lastSourceId = '';
  private sourceAt = 0;
  private readonly deadSources = new Set<string>();
  /** Fired when the station moves to another stream of its pool on its own (rotation or a dead stream), with that stream's name. */
  onSource: ((name: string) => void) | null = null;
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
  private get streams(): readonly string[] { return this.source?.streams ?? this.def.streams ?? []; }
  get streamUrl(): string { const l = this.streams; return l[this.streamIdx % (l.length || 1)] ?? ''; }
  /** The pool stream that is on, or null. */
  get sourceName(): string { return this.source?.name ?? ''; }
  get sourceSite(): string { return this.source?.site ?? this.def.site; }
  private get np(): LiveNowPlaying | undefined { return this.source ? this.source.nowPlaying : this.def.nowPlaying; }
  /** HUD second half: the current song when the station publishes one, else its genre line. */
  get trackName(): string {
    if (this.source) return this.track ? `${this.source.name}: ${this.track}` : this.source.name;
    return this.track || this.def.genre;
  }
  get notice(): string {
    if (!this.active) return '';
    if (this.state === 'failed') return LIVE_NO_STREAM;
    if (this.needsTap) return LIVE_TAP_PROMPT;
    if (!this.paused && this.play_ !== 'playing' && (this.state === 'connecting' || this.state === 'idle') && this.audio) {
      if (this.reconnects > 0) return LIVE_RETRYING;
      if (this.env.now() - this.connectAt >= LIVE_SAY_MS) return LIVE_CONNECTING;
    }
    return '';
  }
  /** Retries at once from the director's watchdog (a station that has not started after a long wait). */
  restart(): void {
    if (!this.active || this.paused) return;
    if (this.state === 'failed') { this.failedAt = -Infinity; this.state = 'idle'; }
    this.unhook();
    this.connect();
  }
  /** Reconnects a single-URL stream gets before it is given up (retry once); stations with mirrors try each of them. */
  private get maxReconnects(): number { const n = this.streams.length || 1; return n > 1 ? Math.min(LIVE_MAX_RECONNECTS, n - 1) : 1; }
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
    this.deadSources.clear();
    this.chooseSource();
    this.connect();
    this.pollNowPlaying();
    if (!this.npTimer && (this.def.nowPlaying || this.def.pool?.some((x) => x.nowPlaying))) this.npTimer = setInterval(() => this.pollNowPlaying(), NOWPLAYING_MS);
  }

  /** Pool stations: a random stream, never the one that played last when there is another. */
  private chooseSource(avoid: string = this.lastSourceId): void {
    const pool = this.def.pool;
    if (!pool?.length) { this.source = null; return; }
    let cand = pool.filter((x) => !this.deadSources.has(x.id));
    if (!cand.length) { this.source = null; return; }
    const fresh = cand.filter((x) => x.id !== avoid);
    if (fresh.length) cand = fresh;
    const r = this.env.random();
    this.source = cand[Math.min(cand.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * cand.length)))];
    this.lastSourceId = this.source.id;
    this.sourceAt = this.env.now();
    this.streamIdx = 0;
    this.track = '';
  }
  /** Moves to another stream of the pool (rotation, or the stream is dead). False when there is none. */
  private changeSource(dead: boolean): boolean {
    const pool = this.def.pool;
    if (!pool || pool.length < 2 || !this.source) return false;
    if (dead) this.deadSources.add(this.source.id);
    const before = this.source;
    this.chooseSource(before.id);
    if (!this.source || this.source.id === before.id) { this.source = before; return false; }
    this.reconnects = 0;
    this.onSource?.(this.source.name);
    this.pollNowPlaying();
    return true;
  }

  /** (Re)opens the stream at its live edge and asks the element to play. */
  private connect(): void {
    if (!this.active || this.paused) return;
    if (!this.env.canLoad() || !this.streamUrl) { this.fail(); return; }
    this.state = 'connecting';
    this.play_ = 'starting';
    this.connects++;
    let a: AudioLike;
    try { a = this.audio ?? this.makeAudio(); } catch { this.fail(); return; } // no media element in this environment
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
    // Only a browser that refused leaves the element paused. A stream that is merely slow has accepted play() (paused is false): it is
    // connecting, and the stall watchdog below owns it. Calling it blocked hid it behind "Tap to start radio" for ever, with no timeout.
    this.blockTimer = setTimeout(() => { if (this.active && !this.paused && this.play_ !== 'playing' && this.audio?.paused) this.markBlocked(); }, this.env.blockedMs);
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
      if (!this.active || this.audio !== a) return; // a late event from a connection that was dropped
      this.state = 'playing';
      this.play_ = 'playing';
      this.lastProgAt = this.env.now();
      this.unhook();
      this.emit();
    };
    a.addEventListener('playing', onPlaying);
    a.addEventListener('timeupdate', () => {
      if (!this.active || this.audio !== a) return;
      if (a.currentTime !== this.lastTime) { this.lastTime = a.currentTime; this.lastProgAt = this.env.now(); if (this.play_ !== 'playing' && !a.paused) onPlaying(); }
    });
    // Clearing the source (dropConnection) makes browsers raise an error too, and so does a station that has already failed: neither is news.
    a.addEventListener('error', () => { if (this.active && !this.paused && this.state !== 'failed' && a.src) this.reconnect(); });
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
    if (idle >= limit) { this.reconnect(); return; }
    if (this.source && this.state === 'playing' && this.env.now() - this.sourceAt >= this.env.rotateMs && this.changeSource(false)) { this.state = 'connecting'; this.play_ = 'starting'; this.connect(); return; }
    const n = this.notice;
    if (n !== this.lastNotice) { this.lastNotice = n; this.emit(); }
  }

  private reconnect(): void {
    if (++this.reconnects > this.maxReconnects) {
      if (this.changeSource(true)) { this.state = 'connecting'; this.play_ = 'starting'; this.connect(); return; }
      this.fail(); return;
    }
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
    const np = this.np;
    if (!np || !this.active) return;
    const forId = this.source?.id ?? '';
    this.env.fetchJson(np.url).then((j) => {
      if ((this.source?.id ?? '') !== forId) return; // the stream changed while the answer was on its way
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
