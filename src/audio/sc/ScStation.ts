/**
 * Radio SC: streams SoundCloud DJ mixes the player pastes in, through SoundCloud's official HTML5 Widget API only
 * (a hidden iframe to w.soundcloud.com/player plus api.js giving SC.Widget). Nothing is downloaded and no
 * undocumented endpoint is used; playback follows SoundCloud's terms with the artist's own player.
 *
 * Lazy: nothing touches the network until the first tune-in. If the widget script or the player does not come up
 * within 8 s (offline, artifact sandbox blocking third-party iframes) the station shows FAILED_NAME and an on-screen
 * "no stream" notice; it never plays synthesized music in place of a mix. Browsers block autoplay: the first
 * play() runs seconds after the tune-in (script, RA pool and widget READY are all async), outside the gesture, and
 * on iOS an iframe's media only starts from a tap. So the station watches for PLAY; if none arrives it reports
 * `needsTap`, arms a one-shot gesture hook (any tap/key calls play() in that same tick), and RadioUi shows a
 * "Tap to start radio" button that calls `userStart()`. Like the other stations it keeps a virtual clock (`update(dt)` in game time) so tuning
 * in resumes mid-mix via seekTo.
 *
 * Sources: a pool of random 45-minute-plus DJ sets from the player's ra-nyc app (see ./RaFeed.ts), interleaved with
 * the links the player pasted. The pool is fetched only after the first tune-in; if it is unreachable the station
 * behaves exactly as it did with pasted links only (or the synth bed when there are none).
 */

import { RaFeed, type RaMatch, type RaSet, type RaStatus } from './RaFeed';

export const SC_STORAGE_KEY = 'gta-bedstuy.radio.sc.v1';
export const SC_STATION_NAME = 'Radio SC';
export const SC_FAILED_NAME = 'Radio SC (needs the hosted build / internet)';
export const SC_EMPTY_HINT = 'No sets yet: check your connection or add SoundCloud links in the Radio library';
export const SC_HEARD_CAP = 200;
export const SC_API_URL = 'https://w.soundcloud.com/player/api.js';
/** How long the SoundCloud player may take to load before the station gives up. It pulls ~10 scripts, so slow phones and
 * cellular links need far more than a few seconds: at 8 s the station failed with the title showing and no sound. */
export const SC_LOAD_TIMEOUT_MS = 45000;
/** After a failed load, how long before the next tune-in or tap may retry. */
export const SC_RETRY_MS = 5000;
/** Silence after play() before the station decides the browser blocked it. */
export const SC_BLOCKED_MS = 5000;
/** After a tap, how long before the real widget is shown so the user can tap its own play button (iOS). */
export const SC_TAP_GRACE_MS = 3000;
/** After a tap, how long before an unplayable mix is skipped. */
export const SC_SKIP_MS = 30000; // long enough to tap the real player's own play button (iOS) and to buffer on cellular
/** A mix that reports playing but whose position has not moved for this long is nudged, then skipped. */
export const SC_STALL_MS = 12000;
/** Position frozen this long after PLAY: send play() again. */
export const SC_STALL_NUDGE_MS = 5000;
export const SC_TAP_PROMPT = 'Tap to start radio';
export const SC_NO_STREAM = 'No stream: SoundCloud could not load (needs the hosted build / internet)';
export const SC_MAX_MIXES = 40;
/** Dayparting stub: mixes flagged afterhours are preferred for the first mix between these hours. */
export const SC_PREFERRED_HOURS = { from: 23, to: 6 } as const;

/* ---------- URL validation ---------- */

const SC_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);

/**
 * Accepts only SoundCloud track or playlist/set URLs (https, soundcloud.com, at least user/track). Returns the
 * cleaned URL (https, no query or hash) or null.
 */
export function normalizeScUrl(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw || raw.length > 300) return null;
  let u: URL;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!SC_HOSTS.has(host)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (!parts.every((p) => /^[A-Za-z0-9._~%-]+$/.test(p))) return null;
  return `https://soundcloud.com/${parts.join('/')}`;
}

export function widgetSrc(url: string): string {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&visual=false`;
}

/** True when `hour` (0..23) lies in the preferred afterhours window (wraps midnight). */
export function inPreferredHours(hour: number): boolean {
  const { from, to } = SC_PREFERRED_HOURS;
  return hour >= from || hour < to;
}

/* ---------- mix list ---------- */

export interface ScMix { url: string; afterhours?: boolean }

export interface ScStorage {
  load(): ScMix[] | null;
  save(m: ScMix[], opts?: { ra?: boolean }): void;
  /** The "Random RA sets" checkbox (default on). */
  loadRa?(): boolean | null;
}

export function localScStorage(key = SC_STORAGE_KEY): ScStorage {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        if (!raw) return null;
        const j = JSON.parse(raw) as { v?: number; mixes?: unknown };
        if (!j || !Array.isArray(j.mixes)) return null;
        const out: ScMix[] = [];
        for (const m of j.mixes as Array<Partial<ScMix>>) {
          const url = typeof m?.url === 'string' ? normalizeScUrl(m.url) : null;
          if (url && out.length < SC_MAX_MIXES) out.push(m.afterhours ? { url, afterhours: true } : { url });
        }
        return out;
      } catch { return null; }
    },
    save(mixes, opts) {
      try { globalThis.localStorage?.setItem(key, JSON.stringify({ v: 1, mixes, ra: opts?.ra !== false })); } catch { /* blocked or full */ }
    },
    loadRa() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        if (!raw) return null;
        const j = JSON.parse(raw) as { ra?: unknown };
        return typeof j?.ra === 'boolean' ? j.ra : null;
      } catch { return null; }
    },
  };
}

/* ---------- widget typings (the documented subset) ---------- */

export interface ScSound { title?: string; user?: { username?: string }; duration?: number }
export interface ScWidget {
  bind(event: string, fn: (e?: { currentPosition?: number }) => void): void;
  load(url: string, opts?: { auto_play?: boolean; callback?: () => void }): void;
  play(): void;
  pause(): void;
  setVolume(v: number): void;
  seekTo(ms: number): void;
  next(): void;
  prev(): void;
  getCurrentSound(cb: (s: ScSound | null) => void): void;
  getDuration(cb: (ms: number) => void): void;
  getSounds?(cb: (s: unknown[]) => void): void;
  getCurrentSoundIndex?(cb: (i: number) => void): void;
}
export interface ScApi { Widget: ((el: HTMLIFrameElement) => ScWidget) & { Events?: Record<string, string> } }

/** Which of the dial's SoundCloud stations this instance is. Omitted = the classic Radio SC (every set, own list). */
export interface ScStationConfig {
  id: string;
  name: string;
  /** Pool filter (title + DJ name). Null = any set. */
  match: RaMatch | null;
  /** Looser hint for ranking event days when asking RA for more (defaults to `match`). */
  hint?: RaMatch | null;
  /** localStorage key of this station's pasted links. */
  storageKey: string;
}

export interface ScEnv {
  config: ScStationConfig;
  doc: () => Document | null;
  /** Loads the widget API script and resolves with the SC global. */
  loadApi: () => Promise<ScApi>;
  /** Hosted build flag or navigator.onLine. */
  canLoad: () => boolean;
  now: () => number;
  hour: () => number;
  storage: ScStorage | null;
  timeoutMs: number;
  /** Timings for the autoplay watchdog (tests shrink them). */
  blockedMs: number;
  tapGraceMs: number;
  skipMs: number;
  /** Random DJ sets from ra-nyc; null disables the pool. */
  feed: RaFeed | null;
  random: () => number;
}

function defaultLoadApi(): Promise<ScApi> {
  return new Promise((resolve, reject) => {
    const g = globalThis as unknown as { SC?: ScApi; document?: Document };
    if (g.SC?.Widget) { resolve(g.SC); return; }
    const d = g.document;
    if (!d) { reject(new Error('no document')); return; }
    const s = d.createElement('script');
    s.src = SC_API_URL;
    s.async = true;
    s.onload = () => { if (g.SC?.Widget) resolve(g.SC); else reject(new Error('SC missing')); };
    s.onerror = () => reject(new Error('script blocked'));
    d.head.appendChild(s);
  });
}

export const DEFAULT_SC_CONFIG: ScStationConfig = { id: 'sc', name: SC_STATION_NAME, match: null, storageKey: SC_STORAGE_KEY };

function defaultEnv(config: ScStationConfig = DEFAULT_SC_CONFIG): ScEnv {
  const hosted = (() => { try { return import.meta.env?.VITE_HOSTED === '1'; } catch { return false; } })();
  return {
    config,
    doc: () => (typeof document !== 'undefined' ? document : null),
    loadApi: defaultLoadApi,
    canLoad: () => hosted || (typeof navigator === 'undefined' ? false : navigator.onLine !== false),
    now: () => Date.now(),
    hour: () => new Date().getHours(),
    storage: localScStorage(config.storageKey),
    timeoutMs: SC_LOAD_TIMEOUT_MS,
    blockedMs: SC_BLOCKED_MS,
    tapGraceMs: SC_TAP_GRACE_MS,
    skipMs: SC_SKIP_MS,
    feed: new RaFeed(),
    random: Math.random,
  };
}

type State = 'idle' | 'loading' | 'ready' | 'failed';
/** What the browser is doing with the widget: 'blocked' = play() was sent and no PLAY came back. */
export type PlayState = 'idle' | 'starting' | 'playing' | 'blocked';

export interface NowPlaying { title: string; user: string }

const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;
// Invisible but laid out at a real size: at 2x2 px the SoundCloud player threw on its own zero-size waveform canvas.
const HIDDEN_CSS = 'position:fixed;left:0;bottom:0;width:320px;height:120px;border:0;opacity:0.01;pointer-events:none;z-index:-1;';
const ev = (api: ScApi, name: string, fallback: string): string => api.Widget.Events?.[name] ?? fallback;
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

export class ScStation {
  private readonly env: ScEnv;
  private list: ScMix[];
  private state: State = 'idle';
  private api: ScApi | null = null;
  private widget: ScWidget | null = null;
  private frame: HTMLIFrameElement | null = null;
  private loadedUrl = '';
  private index = 0;
  /** The current RA pool set, or null while a pasted link (list[index]) is current. */
  private curSet: RaSet | null = null;
  private picked = false;
  private lastWasPool: boolean | null = null;
  private raOn = true;
  private errStreak = 0;
  private prefetched = false;
  private noSourceAt = 0;
  /** Virtual position inside the current mix, seconds. */
  private pos = 0;
  private duration = 0;
  private isSet = false;
  private active = false;
  private paused = false;
  private volume = 1;
  private failedAt = 0;
  /** stall watchdog: last time PLAY_PROGRESS reported a new position */
  private lastProgAt = 0;
  private lastProgPos = -1;
  private stallId: ReturnType<typeof setInterval> | null = null;
  private stallKicks = 0;
  private sessionStarted = false;
  private readonly bad = new Set<string>();
  private now: NowPlaying | null = null;
  private readonly listeners = new Set<() => void>();
  /** Called when the station moves to the next mix (the director plays the station jingle). */
  onBetweenMixes: ((prev: NowPlaying | null) => void) | null = null;
  apiLoads = 0;
  private play_: PlayState = 'idle';
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private hookDoc: Document | null = null;
  private exposed = false;

  /** Pool sets this station has played (per-station no-repeat). */
  private readonly heard = new Set<string>();
  private lastSetUrl = '';
  private lastLink = '';
  private duck = 1;
  /** Called when the game hour is fed in (the director shares it with the announcers). */
  onGameHour: ((h: number | null) => void) | null = null;

  constructor(env: Partial<ScEnv> = {}) {
    const config = env.config ?? DEFAULT_SC_CONFIG;
    this.env = { ...defaultEnv(config), ...env, config };
    this.list = this.env.storage?.load() ?? [];
    this.raOn = this.env.storage?.loadRa?.() ?? true;
    this.env.feed?.onChange(() => {
      this.listeners.forEach((fn) => fn());
      // The pool arrived after the first tune-in gave up waiting: start playing it now.
      if (this.active && this.state === 'idle' && this.picked === false && (this.env.feed?.unplayedCount ?? 0) > 0) this.tuneIn();
    });
  }

  /* ---------- identity ---------- */

  get id(): string { return this.env.config.id; }
  get config(): ScStationConfig { return this.env.config; }
  /** Pool sets this station could play (match the keywords), and how many of those it has not heard yet. */
  get poolCounts(): { matching: number; unheard: number; pool: number } {
    const f = this.env.feed;
    const m = this.env.config.match;
    if (!f) return { matching: 0, unheard: 0, pool: 0 };
    return { matching: f.countMatching(m), unheard: f.countMatching(m, this.heard), pool: f.size };
  }

  /* ---------- RA pool ---------- */

  get feed(): RaFeed | null { return this.env.feed; }
  /** The "Random RA sets" setting. */
  get randomSets(): boolean { return this.raOn && !!this.env.feed; }
  setRandomSets(on: boolean): void {
    if (on === this.raOn) return;
    this.raOn = on;
    if (!on && this.curSet) { this.pickNext(); this.pos = 0; this.sync(); }
    this.changed();
  }
  get raStatus(): RaStatus { return this.env.feed?.status ?? 'unavailable'; }
  /** Pool sets loaded and how many of them were heard this round. */
  get raCounts(): { loaded: number; heard: number } { return { loaded: this.env.feed?.size ?? 0, heard: this.env.feed?.playedCount ?? 0 }; }
  private get poolAvailable(): boolean { return this.randomSets && this.env.feed!.status !== 'unavailable'; }
  /** True when anything could play: pasted links or a reachable pool. */
  get hasSources(): boolean { return this.list.length > 0 || this.poolAvailable; }
  private currentUrl(): string | undefined { return this.curSet?.url ?? this.list[this.index]?.url; }

  /* ---------- mix list ---------- */

  get mixes(): readonly ScMix[] { return this.list; }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  addMix(input: string, afterhours = false): { ok: true; url: string } | { ok: false; error: string } {
    const url = normalizeScUrl(input);
    if (!url) return { ok: false, error: 'Only soundcloud.com track or playlist links work (https://soundcloud.com/artist/mix).' };
    if (this.list.some((m) => m.url === url)) return { ok: false, error: 'That mix is already in the list.' };
    if (this.list.length >= SC_MAX_MIXES) return { ok: false, error: `The list is full (${SC_MAX_MIXES} mixes).` };
    this.list.push(afterhours ? { url, afterhours: true } : { url });
    this.changed();
    return { ok: true, url };
  }

  removeMix(i: number): void {
    if (i < 0 || i >= this.list.length) return;
    this.list.splice(i, 1);
    if (i < this.index) this.index--;
    else if (i === this.index && !this.curSet) this.pos = 0;
    if (this.index >= this.list.length) this.index = 0;
    this.changed();
    this.sync();
  }

  moveMix(i: number, delta: number): void {
    const j = i + delta;
    if (i < 0 || j < 0 || i >= this.list.length || j >= this.list.length || !delta) return;
    const cur = this.list[this.index];
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this.index = Math.max(0, this.list.indexOf(cur));
    this.changed();
  }

  setAfterhours(i: number, on: boolean): void {
    const m = this.list[i];
    if (!m) return;
    if (on) m.afterhours = true; else delete m.afterhours;
    this.changed();
  }

  private changed(): void {
    this.env.storage?.save(this.list.map((m) => ({ ...m })), { ra: this.raOn });
    this.listeners.forEach((fn) => fn());
  }

  private gameHour: number | null = null;
  /** Optional: feed the in-game hour (0..23) so dayparting follows game time instead of the device clock. */
  setGameHour(h: number): void {
    this.gameHour = Number.isFinite(h) ? ((Math.floor(h) % 24) + 24) % 24 : null;
    this.onGameHour?.(Number.isFinite(h) ? h : null);
  }

  /** Dayparting stub: between 23:00 and 06:00 the first mix of the session is an afterhours-flagged one. */
  pickFirstIndex(hour: number = this.gameHour ?? this.env.hour()): number {
    if (!inPreferredHours(hour)) return 0;
    const i = this.list.findIndex((m) => m.afterhours);
    return i >= 0 ? i : 0;
  }

  /* ---------- reading ---------- */

  get status(): State { return this.state; }
  get currentIndex(): number { return this.index; }
  get isActive(): boolean { return this.active; }
  /** True when no stream can play (SoundCloud unreachable or nothing to play). Nothing is synthesized then. */
  get offline(): boolean {
    if (!this.hasSources || this.state === 'failed') return true;
    return !this.poolAvailable && this.list.every((m) => this.bad.has(m.url));
  }
  get stationName(): string {
    const n = this.env.config.name;
    return this.state === 'failed' ? `${n} (needs the hosted build / internet)` : n;
  }
  get playState(): PlayState { return this.play_; }
  /** The browser blocked sound: a tap must start it (RadioUi shows the button). */
  get needsTap(): boolean { return this.active && this.state === 'ready' && !this.paused && this.play_ === 'blocked'; }
  /** On-screen status line when nothing is audible: no stream, or a tap is needed. Empty while fine. */
  get notice(): string {
    if (!this.active) return '';
    if (this.state === 'failed' || (this.state !== 'loading' && this.hasSources && this.offline)) return SC_NO_STREAM;
    if (!this.hasSources && this.state !== 'loading') return SC_EMPTY_HINT;
    return this.needsTap ? SC_TAP_PROMPT : '';
  }
  get nowPlaying(): NowPlaying | null {
    if (this.curSet) return { title: this.curSet.title, user: this.curSet.dj || this.now?.user || '' };
    return this.now;
  }
  /** HUD line: "Set title — DJ" for pool sets, "Title - user" for pasted links, a hint when empty, '' while loading. */
  get trackName(): string {
    if (!this.hasSources) return SC_EMPTY_HINT;
    if (this.curSet) {
      const dj = this.curSet.dj || this.now?.user || '';
      return dj ? `${this.curSet.title} \u2014 ${dj}` : this.curSet.title;
    }
    if (this.now) return this.now.user ? `${this.now.title} - ${this.now.user}` : this.now.title;
    return '';
  }
  /** Virtual position (seconds) in the current mix. */
  get position(): number { return this.pos; }

  /* ---------- control ---------- */

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) this.tuneIn();
    else { this.widget?.pause(); this.clearTimers(); this.unhook(); this.play_ = 'idle'; this.hideWidget(); }
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Call from a real user gesture (click/tap/key handler): sends play() to the widget in the same tick, which is what
   * browsers need to allow sound. If the widget is not up yet, starts it. If still silent after a grace period the
   * real (tiny) SoundCloud player is shown so the user can tap its own play button (iOS), and an unplayable mix is
   * skipped after `skipMs`.
   */
  userStart(): void {
    if (!this.active) return;
    this.unhook();
    if (this.state === 'failed') this.failedAt = -Infinity;
    if (this.state !== 'ready' || !this.widget) { this.tuneIn(); return; }
    this.pushVolume();
    this.widget.play();
    this.play_ = 'starting';
    this.clearTimers();
    this.later(this.env.tapGraceMs, () => { if (this.play_ !== 'playing') { this.exposeWidget(); } });
    this.later(this.env.skipMs, () => {
      if (this.play_ === 'playing' || !this.active || this.state !== 'ready') return;
      this.skipBad();
    });
    this.listeners.forEach((fn) => fn());
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (!this.widget || this.state !== 'ready') return;
    if (p) { this.widget.pause(); this.clearTimers(); } else if (this.active) { this.widget.play(); this.watch(); }
  }

  /** Radio volume (times master) 0..1 mapped to the widget's 0..100. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    this.pushVolume();
  }

  /** Announcer ducking: 1 = full level, lower = quieter under the voice. */
  setDuck(level: number): void {
    this.duck = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1));
    this.pushVolume();
  }
  get duckLevel(): number { return this.duck; }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }
  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  /** Marks the current mix unplayable and moves on (or gives up after five in a row). */
  private skipBad(): void {
    const u = this.currentUrl();
    if (u) this.bad.add(u);
    if (++this.errStreak >= 5) { this.teardown(); this.fail(); return; }
    this.hideWidget();
    if (this.hasSources && !this.offline) { const prev = this.nowPlaying ? { ...this.nowPlaying } : null; this.step(true); this.onBetweenMixes?.(prev); }
    else { this.play_ = 'idle'; this.listeners.forEach((fn) => fn()); }
  }

  /** Arms the silence watchdog after a play() request. */
  private watch(): void {
    this.clearTimers();
    if (this.play_ !== 'playing') this.play_ = 'starting';
    this.later(this.env.blockedMs, () => {
      if (!this.active || this.paused || this.state !== 'ready' || this.play_ === 'playing') return;
      this.play_ = 'blocked';
      this.hook();
      this.listeners.forEach((fn) => fn());
    });
  }

  /** One-shot gesture hook: while blocked, the next tap or key press anywhere calls play() inside that gesture. */
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

  /** Shows the real SoundCloud player in a corner so its own play button can be tapped. */
  private exposeWidget(): void {
    if (!this.frame || this.exposed) return;
    this.exposed = true;
    this.frame.style.cssText = 'position:fixed;left:8px;bottom:8px;width:min(300px,calc(100vw - 16px));height:120px;border:0;opacity:1;z-index:2147483000;pointer-events:auto;border-radius:6px;';
    this.frame.setAttribute('aria-hidden', 'false');
    this.frame.tabIndex = 0;
  }
  private hideWidget(): void {
    if (!this.frame || !this.exposed) return;
    this.exposed = false;
    this.frame.style.cssText = HIDDEN_CSS;
    this.frame.setAttribute('aria-hidden', 'true');
    this.frame.tabIndex = -1;
  }

  private pushVolume(): void {
    if (this.widget && this.state === 'ready') this.widget.setVolume(Math.round(this.volume * this.duck * 100));
  }

  /** Advances the virtual clock (game time). */
  update(dt: number): void {
    if (this.paused || !(dt > 0) || (this.list.length === 0 && !this.curSet)) return;
    this.pos += dt;
    if (!this.active && this.duration > 0 && !this.isSet && this.pos >= this.duration) {
      // The mix "ended" while the player listened to something else: move on without touching the widget.
      this.pos -= this.duration;
      this.step(false);
    }
  }

  /** Skips to the next mix (a random pool set and/or the next pasted link). */
  next(): void {
    if (!this.hasSources) return;
    const prev = this.nowPlaying ? { ...this.nowPlaying } : null;
    this.step(true);
    this.onBetweenMixes?.(prev);
  }

  private step(play: boolean): void {
    this.pickNext();
    if (play) this.pos = 0;
    this.now = null;
    if (play) this.sync();
  }

  /**
   * Chooses the next item, in this order: an unheard pool set matching the station's keywords; then the station's
   * own pasted links (list order); then any unheard pool set. Each station remembers what it played (no repeats until
   * its pool is used up) and asks the feed for more matching sets when its queue runs low. At the start of a session
   * between 23:00 and 06:00 an after-hours pasted link goes first.
   */
  private pickNext(first = false): void {
    const feed = this.env.feed;
    const match = this.env.config.match;
    const usePool = this.randomSets && !!feed && feed.size > 0;
    const listOk = this.list.some((m) => !this.bad.has(m.url));
    this.duration = 0;
    this.isSet = false;
    this.prefetched = false;
    const nightLink = first && listOk && inPreferredHours(this.gameHour ?? this.env.hour()) && this.list.some((m) => m.afterhours);

    const fromPool = (m: RaMatch | null): boolean => {
      if (!feed) return false;
      for (let tries = 0; tries < 5; tries++) {
        const s = feed.pickFor(m, this.heardOrBad());
        if (!s) return false;
        this.heard.add(s.url);
        this.lastSetUrl = s.url;
        if (this.heard.size > SC_HEARD_CAP) this.heard.delete(this.heard.values().next().value as string);
        this.curSet = s;
        this.picked = true;
        this.duration = s.duration;
        this.lastWasPool = true;
        return true;
      }
      return false;
    };
    const fromList = (): boolean => {
      this.curSet = null;
      if (!listOk) return false;
      const n = this.list.length;
      const start = first && this.lastWasPool === null ? this.pickFirstIndex() : (this.index + 1) % n;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        const u = this.list[i].url;
        if (this.bad.has(u) || this.heard.has(u)) continue;
        this.index = i;
        this.heard.add(u);
        this.lastLink = u;
        this.lastWasPool = false;
        this.picked = true;
        return true;
      }
      return false;
    };
    const attempt = (): boolean => {
      if (nightLink && fromList()) return true;
      if (usePool && fromPool(match)) return true;
      if (fromList()) return true;
      return usePool && fromPool(null);
    };

    let done = attempt();
    // Everything this station can play has been heard: start a new round (never with what just played).
    if (!done && this.heard.size > 0) {
      this.heard.clear();
      if (this.lastSetUrl) this.heard.add(this.lastSetUrl);
      if (this.lastLink) this.heard.add(this.lastLink);
      done = attempt();
      if (!done) { this.heard.clear(); done = attempt(); }
    }
    if (!done) this.curSet = null;
    this.askForMore();
  }

  private heardOrBad(): ReadonlySet<string> {
    if (this.bad.size === 0) return this.heard;
    const all = new Set(this.heard);
    this.bad.forEach((u) => all.add(u));
    return all;
  }

  /** Keyword-aware top-up: when fewer than a few unheard matching sets are left, the feed looks up more artists. */
  private askForMore(): void {
    const feed = this.env.feed;
    if (!feed || !this.randomSets) return;
    const cfg = this.env.config;
    void feed.topUp(cfg.match, this.heardOrBad(), cfg.hint ?? cfg.match);
  }

  private tuneIn(): void {
    if (!this.hasSources) {
      // Pool unreachable and no pasted links: retry the pool on a later tune-in (rate-limited like a failed widget).
      if (!(this.randomSets && this.state !== 'loading' && this.env.now() - this.noSourceAt >= 30000)) return;
    }
    if (!this.sessionStarted) { this.sessionStarted = true; this.pos = 0; }
    if (this.state === 'failed') {
      if (this.env.now() - this.failedAt < SC_RETRY_MS) return;
      this.state = 'idle';
    }
    if (this.state === 'idle') { void this.boot(); return; }
    if (this.state === 'ready') this.sync();
  }

  /** Loads the API and the player lazily; fails to the bed after the timeout. */
  private async boot(): Promise<void> {
    const doc = this.env.doc();
    if (!doc || !this.env.canLoad()) { this.fail(); return; }
    this.state = 'loading';
    try {
      this.apiLoads++;
      const feed = this.randomSets ? this.env.feed : null;
      // The pool starts loading now (never before the first tune-in). With no pasted links, wait for the first set.
      if (feed) void feed.ensure();
      const poolReady = feed && this.list.length === 0 && feed.size === 0 ? withTimeout(feed.whenUsable(), this.env.timeoutMs).catch(() => undefined) : Promise.resolve();
      const [api] = await Promise.all([withTimeout(this.env.loadApi(), this.env.timeoutMs), poolReady]);
      this.api = api;
      if (!this.picked) this.pickNext(true);
      const url = this.currentUrl();
      if (!url || !this.hasSources) { this.state = 'idle'; this.noSourceAt = this.env.now(); this.listeners.forEach((fn) => fn()); return; }
      const frame = this.makeFrame(doc, widgetSrc(url));
      this.frame = frame;
      this.loadedUrl = url;
      const widget = api.Widget(frame);
      this.widget = widget;
      await withTimeout(new Promise<void>((res) => widget.bind(ev(api, 'READY', 'ready'), () => res())), this.env.timeoutMs);
      this.bindEvents(api, widget);
      this.state = 'ready';
      this.pushVolume();
      this.learn(widget);
      this.applyPlayback(true);
    } catch {
      this.teardown();
      this.fail();
    }
  }

  private fail(): void {
    this.state = 'failed';
    this.failedAt = this.env.now();
    this.listeners.forEach((fn) => fn());
  }

  private teardown(): void {
    this.frame?.remove();
    this.frame = null;
    this.widget = null;
    this.exposed = false;
    this.clearTimers();
    this.stopStallWatch();
    this.unhook();
    this.play_ = 'idle';
  }

  private makeFrame(doc: Document, src: string): HTMLIFrameElement {
    const f = doc.createElement('iframe');
    f.src = src;
    f.title = 'SoundCloud player (hidden)';
    f.setAttribute('allow', 'autoplay; encrypted-media');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    // Tiny but laid out inside the viewport (never display:none, never far off-screen: some browsers refuse to play).
    f.style.cssText = HIDDEN_CSS;
    doc.body.appendChild(f);
    return f;
  }

  private bindEvents(api: ScApi, w: ScWidget): void {
    w.bind(ev(api, 'PLAY_PROGRESS', 'playProgress'), (e) => {
      if (e && typeof e.currentPosition === 'number') {
        this.pos = e.currentPosition / 1000;
        if (e.currentPosition !== this.lastProgPos) { this.lastProgPos = e.currentPosition; this.lastProgAt = this.env.now(); this.stallKicks = 0; }
      }
      if (this.play_ !== 'playing') this.markPlaying();
      // About five minutes left: top the pool up in the background so the next pick never waits.
      const feed = this.env.feed;
      if (!this.prefetched && feed && this.randomSets && this.duration > 0 && this.duration - this.pos <= 300 && feed.unplayedCount < 4) {
        this.prefetched = true;
        void feed.ensure();
        this.askForMore();
      }
    });
    w.bind(ev(api, 'PLAY', 'play'), () => { this.errStreak = 0; this.markPlaying(); this.learn(w); });
    w.bind(ev(api, 'ERROR', 'error'), () => {
      const u = this.currentUrl();
      if (u) this.bad.add(u);
      this.listeners.forEach((fn) => fn());
      if (++this.errStreak >= 5) { this.teardown(); this.fail(); return; }
      if (this.hasSources && !this.offline) this.step(true);
    });
    w.bind(ev(api, 'FINISH', 'finish'), () => {
      const advance = () => { const prev = this.nowPlaying ? { ...this.nowPlaying } : null; this.step(true); this.onBetweenMixes?.(prev); };
      if (w.getSounds && w.getCurrentSoundIndex) {
        w.getCurrentSoundIndex((i) => w.getSounds!((s) => { if (s.length <= 1 || i >= s.length - 1) advance(); }));
      } else advance();
    });
  }

  /**
   * Stall watchdog. Some mixes (older MP3 streams) report PLAY and then never advance: the station showed the title
   * and DJ in silence. If the position stands still for SC_STALL_MS the player is nudged once, then the mix is skipped.
   */
  private watchStall(): void {
    this.lastProgAt = this.env.now();
    if (this.stallId) return;
    this.stallId = setInterval(() => {
      const now = this.env.now();
      if (!this.widget || this.state !== 'ready' || !this.active || this.paused || this.play_ !== 'playing') { this.lastProgAt = now; return; }
      // the first nudge comes quickly (a start that hangs is common and one more play() cures it); the skip waits longer
      if (now - this.lastProgAt < (this.stallKicks === 0 ? SC_STALL_NUDGE_MS : SC_STALL_MS)) return;
      this.lastProgAt = now;
      if (this.stallKicks++ < 1) { this.widget.play(); return; }
      this.stallKicks = 0;
      this.skipBad();
    }, 2000);
  }
  private stopStallWatch(): void {
    if (this.stallId) clearInterval(this.stallId);
    this.stallId = null;
  }

  private markPlaying(): void {
    this.play_ = 'playing';
    this.watchStall();
    this.errStreak = 0;
    this.clearTimers();
    this.unhook();
    this.hideWidget();
    this.listeners.forEach((fn) => fn());
  }

  private learn(w: ScWidget): void {
    w.getCurrentSound((s) => {
      if (s) this.now = { title: s.title ?? 'Untitled', user: s.user?.username ?? '' };
      this.listeners.forEach((fn) => fn());
    });
    w.getDuration((ms) => { if (ms > 0) this.duration = ms / 1000; });
    w.getSounds?.((s) => { this.isSet = s.length > 1; });
  }

  /** Makes the widget match the list position (load another mix if needed). */
  private sync(): void {
    if (this.state !== 'ready' || !this.widget || !this.active) return;
    const url = this.currentUrl();
    if (!url) { this.widget.pause(); return; }
    if (url !== this.loadedUrl) {
      this.loadedUrl = url;
      this.lastProgPos = -1;
      this.now = null;
      if (this.play_ === 'playing') this.play_ = 'starting';
      this.widget.load(url, { auto_play: !this.paused, callback: () => { this.learn(this.widget!); this.applyPlayback(false); } });
      return;
    }
    this.applyPlayback(true);
  }

  /** Seek to the virtual position and play (resume mid-track). */
  private applyPlayback(seek: boolean): void {
    const w = this.widget;
    if (!w || !this.active) return;
    // Seek only when the player is somewhere else: seeking to (about) its current position right after it started
    // made MP3 streams hang at ~1.5 s until the stall watchdog nudged them.
    if (seek && this.pos > 1 && !this.isSet && Math.abs(this.pos - this.lastProgPos / 1000) > 3) {
      w.getDuration((ms) => {
        if (ms > 0) { this.duration = ms / 1000; this.pos = this.pos % this.duration; }
        w.seekTo(Math.round(this.pos * 1000));
      });
    }
    if (!this.paused) { w.play(); this.watch(); }
  }

  /**
   * Checks a pasted link with a throwaway hidden player (does not touch the station): resolves with the mix
   * title when the widget can load it, or an error message.
   */
  async test(input: string): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
    const url = normalizeScUrl(input);
    if (!url) return { ok: false, error: 'Not a soundcloud.com link.' };
    const doc = this.env.doc();
    if (!doc || !this.env.canLoad()) return { ok: false, error: SC_FAILED_NAME };
    let frame: HTMLIFrameElement | null = null;
    try {
      this.apiLoads++;
      const api = this.api ?? await withTimeout(this.env.loadApi(), this.env.timeoutMs);
      this.api = api;
      frame = this.makeFrame(doc, widgetSrc(url));
      const w = api.Widget(frame);
      const title = await withTimeout(new Promise<string>((res, rej) => {
        w.bind(ev(api, 'ERROR', 'error'), () => rej(new Error('error')));
        w.bind(ev(api, 'READY', 'ready'), () => w.getCurrentSound((s) => (s ? res(s.title ?? 'Untitled') : rej(new Error('empty')))));
      }), this.env.timeoutMs);
      return { ok: true, title };
    } catch {
      return { ok: false, error: 'SoundCloud did not load that link (private, removed, or offline).' };
    } finally {
      frame?.remove();
    }
  }

  dispose(): void {
    this.teardown();
    this.listeners.clear();
    this.active = false;
  }
}
