/**
 * Radio SC: streams SoundCloud DJ mixes the player pastes in, through SoundCloud's official HTML5 Widget API only
 * (a hidden iframe to w.soundcloud.com/player plus api.js giving SC.Widget). Nothing is downloaded and no
 * undocumented endpoint is used; playback follows SoundCloud's terms with the artist's own player.
 *
 * Lazy: nothing touches the network until the first tune-in. If the widget script or the player does not come up
 * within 8 s (offline, artifact sandbox blocking third-party iframes) the station falls back to a procedural bed
 * and shows FAILED_NAME. Like the other stations it keeps a virtual clock (`update(dt)` in game time) so tuning
 * in resumes mid-mix via seekTo.
 */

export const SC_STORAGE_KEY = 'gta-bedstuy.radio.sc.v1';
export const SC_STATION_NAME = 'Radio SC';
export const SC_FAILED_NAME = 'Radio SC (needs the hosted build / internet)';
export const SC_EMPTY_HINT = 'Add SoundCloud links in the Radio library';
export const SC_API_URL = 'https://w.soundcloud.com/player/api.js';
export const SC_LOAD_TIMEOUT_MS = 8000;
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

export interface ScStorage { load(): ScMix[] | null; save(m: ScMix[]): void }

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
    save(mixes) {
      try { globalThis.localStorage?.setItem(key, JSON.stringify({ v: 1, mixes })); } catch { /* blocked or full */ }
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

export interface ScEnv {
  doc: () => Document | null;
  /** Loads the widget API script and resolves with the SC global. */
  loadApi: () => Promise<ScApi>;
  /** Hosted build flag or navigator.onLine. */
  canLoad: () => boolean;
  now: () => number;
  hour: () => number;
  storage: ScStorage | null;
  timeoutMs: number;
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

function defaultEnv(): ScEnv {
  const hosted = (() => { try { return import.meta.env?.VITE_HOSTED === '1'; } catch { return false; } })();
  return {
    doc: () => (typeof document !== 'undefined' ? document : null),
    loadApi: defaultLoadApi,
    canLoad: () => hosted || (typeof navigator === 'undefined' ? false : navigator.onLine !== false),
    now: () => Date.now(),
    hour: () => new Date().getHours(),
    storage: localScStorage(),
    timeoutMs: SC_LOAD_TIMEOUT_MS,
  };
}

type State = 'idle' | 'loading' | 'ready' | 'failed';

export interface NowPlaying { title: string; user: string }

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
  /** Virtual position inside the current mix, seconds. */
  private pos = 0;
  private duration = 0;
  private isSet = false;
  private active = false;
  private paused = false;
  private volume = 1;
  private failedAt = 0;
  private sessionStarted = false;
  private readonly bad = new Set<string>();
  private now: NowPlaying | null = null;
  private readonly listeners = new Set<() => void>();
  /** Called when the station moves to the next mix (the director plays the station jingle). */
  onBetweenMixes: (() => void) | null = null;
  apiLoads = 0;

  constructor(env: Partial<ScEnv> = {}) {
    this.env = { ...defaultEnv(), ...env };
    this.list = this.env.storage?.load() ?? [];
  }

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
    else if (i === this.index) this.pos = 0;
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
    this.env.storage?.save(this.list.map((m) => ({ ...m })));
    this.listeners.forEach((fn) => fn());
  }

  /** Dayparting stub: between 23:00 and 06:00 the first mix of the session is an afterhours-flagged one. */
  pickFirstIndex(hour: number = this.env.hour()): number {
    if (!inPreferredHours(hour)) return 0;
    const i = this.list.findIndex((m) => m.afterhours);
    return i >= 0 ? i : 0;
  }

  /* ---------- reading ---------- */

  get status(): State { return this.state; }
  get currentIndex(): number { return this.index; }
  get isActive(): boolean { return this.active; }
  /** True when the dial should play the procedural bed instead of a mix. */
  get usingBed(): boolean {
    return this.list.length === 0 || this.state === 'failed' || this.bad.size >= this.list.length;
  }
  get stationName(): string { return this.state === 'failed' ? SC_FAILED_NAME : SC_STATION_NAME; }
  get nowPlaying(): NowPlaying | null { return this.now; }
  /** HUD line: "Title - user", a hint when empty, or '' while loading. */
  get trackName(): string {
    if (this.list.length === 0) return SC_EMPTY_HINT;
    if (this.now) return this.now.user ? `${this.now.title} - ${this.now.user}` : this.now.title;
    return '';
  }
  /** Virtual position (seconds) in the current mix. */
  get position(): number { return this.pos; }

  /* ---------- control ---------- */

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) this.tuneIn(); else this.widget?.pause();
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (!this.widget || this.state !== 'ready') return;
    if (p) this.widget.pause(); else if (this.active) this.widget.play();
  }

  /** Radio volume (times master) 0..1 mapped to the widget's 0..100. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    if (this.widget && this.state === 'ready') this.widget.setVolume(Math.round(this.volume * 100));
  }

  /** Advances the virtual clock (game time). */
  update(dt: number): void {
    if (this.paused || !(dt > 0) || this.list.length === 0) return;
    this.pos += dt;
    if (!this.active && this.duration > 0 && !this.isSet && this.pos >= this.duration) {
      // The mix "ended" while the player listened to something else: move on without touching the widget.
      this.pos -= this.duration;
      this.step(false);
    }
  }

  /** Skips to the next mix in the list. */
  next(): void {
    if (this.list.length === 0) return;
    this.step(true);
    this.onBetweenMixes?.();
  }

  private step(play: boolean): void {
    this.index = (this.index + 1) % this.list.length;
    if (play) this.pos = 0;
    this.duration = 0;
    this.isSet = false;
    this.now = null;
    if (play) this.sync();
  }

  private tuneIn(): void {
    if (this.list.length === 0) return;
    if (!this.sessionStarted) { this.sessionStarted = true; this.index = this.pickFirstIndex(); this.pos = 0; }
    if (this.state === 'failed') {
      if (this.env.now() - this.failedAt < 30000) return;
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
      const api = await withTimeout(this.env.loadApi(), this.env.timeoutMs);
      this.api = api;
      const url = this.list[this.index]?.url;
      if (!url) { this.state = 'idle'; return; }
      const frame = this.makeFrame(doc, widgetSrc(url));
      this.frame = frame;
      this.loadedUrl = url;
      const widget = api.Widget(frame);
      this.widget = widget;
      await withTimeout(new Promise<void>((res) => widget.bind(ev(api, 'READY', 'ready'), () => res())), this.env.timeoutMs);
      this.bindEvents(api, widget);
      this.state = 'ready';
      widget.setVolume(Math.round(this.volume * 100));
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
  }

  private makeFrame(doc: Document, src: string): HTMLIFrameElement {
    const f = doc.createElement('iframe');
    f.src = src;
    f.title = 'SoundCloud player (hidden)';
    f.setAttribute('allow', 'autoplay');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    // 1x1 and off-screen, but never display:none (some players stop when hidden that way).
    f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0.01;pointer-events:none;';
    doc.body.appendChild(f);
    return f;
  }

  private bindEvents(api: ScApi, w: ScWidget): void {
    w.bind(ev(api, 'PLAY_PROGRESS', 'playProgress'), (e) => {
      if (e && typeof e.currentPosition === 'number') this.pos = e.currentPosition / 1000;
    });
    w.bind(ev(api, 'PLAY', 'play'), () => this.learn(w));
    w.bind(ev(api, 'ERROR', 'error'), () => {
      const u = this.list[this.index]?.url;
      if (u) this.bad.add(u);
      this.listeners.forEach((fn) => fn());
      if (this.bad.size < this.list.length) this.step(true);
    });
    w.bind(ev(api, 'FINISH', 'finish'), () => {
      const advance = () => { this.step(true); this.onBetweenMixes?.(); };
      if (w.getSounds && w.getCurrentSoundIndex) {
        w.getCurrentSoundIndex((i) => w.getSounds!((s) => { if (s.length <= 1 || i >= s.length - 1) advance(); }));
      } else advance();
    });
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
    const url = this.list[this.index]?.url;
    if (!url) { this.widget.pause(); return; }
    if (url !== this.loadedUrl) {
      this.loadedUrl = url;
      this.now = null;
      this.widget.load(url, { auto_play: !this.paused, callback: () => { this.learn(this.widget!); this.applyPlayback(false); } });
      return;
    }
    this.applyPlayback(true);
  }

  /** Seek to the virtual position and play (resume mid-track). */
  private applyPlayback(seek: boolean): void {
    const w = this.widget;
    if (!w || !this.active) return;
    if (seek && this.pos > 1 && !this.isSet) {
      w.getDuration((ms) => {
        if (ms > 0) { this.duration = ms / 1000; this.pos = this.pos % this.duration; }
        w.seekTo(Math.round(this.pos * 1000));
      });
    }
    if (!this.paused) w.play();
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
