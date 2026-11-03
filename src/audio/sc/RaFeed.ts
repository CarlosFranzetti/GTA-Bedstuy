/**
 * RaFeed: a pool of 45-minute-plus DJ sets for Radio SC, read from the player's own ra-nyc app
 * (https://ra-nyc.vercel.app/api). Flow: a random recent New York day -> /events?date= -> the distinct artists on
 * that day's lineups -> /artist?id&name one at a time (never parallel) -> SoundCloud sets.
 *
 * Pure and injectable (fetch, storage, random, clock) so it is unit-testable. Every failure (offline, CORS, 429,
 * bad JSON) is silent: the feed just reports 'unavailable' and the station keeps its existing behaviour.
 * Nothing is requested until `ensure()` is called (the station calls it on the first tune-in).
 */

export const RA_BASE_KEY = 'gta-bedstuy.radio.ra.base';
export const RA_CACHE_KEY = 'gta-bedstuy.radio.ra.v1';
export const RA_PUBLIC_BASE = 'https://ra-nyc.vercel.app/api';
export const RA_HOSTED_BASE = '/ra-api';
/** Client-side 45-minute rule (the server already applies it; enforced again here). */
export const RA_MIN_SECONDS = 45 * 60;
export const RA_TARGET_SETS = 12;
export const RA_MAX_LOOKUPS = 8;
export const RA_POOL_CAP = 80;
export const RA_CACHE_MAX_AGE_MS = 24 * 3600 * 1000;
export const RA_CACHE_MIN_UNPLAYED = 6;
export const RA_DAYS_BACK = 21;
const RA_FETCH_TIMEOUT_MS = 10000;
const RA_EVENT_DAY_TRIES = 3;

export interface RaSet {
  url: string;
  title: string;
  dj: string;
  /** Seconds. */
  duration: number;
  artistId: string;
  eventTitle?: string;
  venue?: string;
}

export type RaStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface RaStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

export interface RaEnv {
  fetch: ((url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<RaResponse>) | null;
  storage: RaStorage | null;
  random: () => number;
  now: () => number;
  base: string;
}
export interface RaResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

const isHosted = (): boolean => { try { return import.meta.env?.VITE_HOSTED === '1'; } catch { return false; } };

function defaultStorage(): RaStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** API base: localStorage override (testing), else the same-origin proxy when hosted, else the public origin. */
export function raApiBase(opts: { hosted?: boolean; storage?: RaStorage | null } = {}): string {
  const st = opts.storage === undefined ? defaultStorage() : opts.storage;
  try {
    const o = st?.getItem(RA_BASE_KEY)?.trim();
    if (o) return o.replace(/\/+$/, '');
  } catch { /* blocked */ }
  return (opts.hosted ?? isHosted()) ? RA_HOSTED_BASE : RA_PUBLIC_BASE;
}

/** YYYY-MM-DD for the New York calendar day of `ms`. */
export function nyDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function isScUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && (x.hostname === 'soundcloud.com' || x.hostname === 'www.soundcloud.com');
  } catch { return false; }
}

/** Keeps only SoundCloud sets of at least 45 minutes (a null or missing duration is skipped). */
export function filterSets(raw: unknown): Array<{ url: string; title: string; duration: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ url: string; title: string; duration: number }> = [];
  for (const s of raw as Array<Record<string, unknown>>) {
    if (!s || s.provider !== 'soundcloud') continue;
    const d = s.duration;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < RA_MIN_SECONDS) continue;
    if (!isScUrl(s.url)) continue;
    const title = typeof s.title === 'string' && s.title.trim() ? s.title.trim() : 'Untitled';
    out.push({ url: s.url, title, duration: d });
  }
  return out;
}

interface Cache { v: 1; fetchedAt: number; sets: RaSet[]; played: string[] }

export class RaFeed {
  private readonly env: RaEnv;
  private pool: RaSet[] = [];
  private played = new Set<string>();
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;
  private lookups = 0;
  private tried = false;
  private failed = false;
  private blocked = false;
  private retryAfterMs = 0;
  private readonly listeners = new Set<() => void>();
  /** Counters for tests and the HUD. */
  eventFetches = 0;

  constructor(env: Partial<RaEnv> = {}) {
    const storage = env.storage === undefined ? defaultStorage() : env.storage;
    this.env = {
      fetch: env.fetch === undefined ? (typeof fetch === 'function' ? (u, i) => fetch(u, i) as Promise<RaResponse> : null) : env.fetch,
      storage,
      random: env.random ?? Math.random,
      now: env.now ?? (() => Date.now()),
      base: (env.base ?? raApiBase({ storage })).replace(/\/+$/, ''),
    };
    this.restore();
  }

  /* ---------- reading ---------- */

  get status(): RaStatus {
    if (this.inflight && this.unplayedCount === 0) return 'loading';
    if (this.unplayedCount > 0) return 'ready';
    if (this.pool.length > 0) return 'ready'; // everything heard: nextSet() resets the round
    return this.tried ? 'unavailable' : 'idle';
  }
  get size(): number { return this.pool.length; }
  get unplayedCount(): number { return this.pool.reduce((n, s) => n + (this.played.has(s.url) ? 0 : 1), 0); }
  get playedCount(): number { return this.pool.length - this.unplayedCount; }
  get sets(): readonly RaSet[] { return this.pool; }
  get lookupsMade(): number { return this.lookups; }
  /** True after a 429 this session (no further requests are made). */
  get rateLimited(): boolean { return this.blocked; }
  get retryAfterSeconds(): number { return this.retryAfterMs / 1000; }
  get base(): string { return this.env.base; }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { this.listeners.forEach((fn) => fn()); }

  /* ---------- picking ---------- */

  /** A random unplayed set, marked played. When every set has been heard the round resets first. */
  nextSet(): RaSet | null {
    if (this.pool.length === 0) return null;
    let open = this.pool.filter((s) => !this.played.has(s.url));
    if (open.length === 0) { this.played.clear(); open = this.pool.slice(); }
    const s = open[Math.min(open.length - 1, Math.floor(this.env.random() * open.length))];
    this.played.add(s.url);
    this.persist();
    this.emit();
    return s;
  }

  /* ---------- building the pool ---------- */

  /** True when the cached pool is fresh and big enough to skip the network. */
  private cacheUsable(): boolean {
    return this.fetchedAt > 0 && this.env.now() - this.fetchedAt < RA_CACHE_MAX_AGE_MS && this.unplayedCount >= RA_CACHE_MIN_UNPLAYED;
  }

  /** Loads or tops up the pool (single flight). Never throws. */
  ensure(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.tried = true;
    if (this.cacheUsable() || this.blocked || !this.env.fetch) {
      if (!this.env.fetch && this.pool.length === 0) this.failed = true;
      this.emit();
      return Promise.resolve();
    }
    this.failed = false;
    this.inflight = this.build().catch(() => { this.failed = true; }).finally(() => {
      this.inflight = null;
      this.persist();
      this.emit();
    });
    this.emit();
    return this.inflight;
  }

  /** Resolves once the pool has an unplayed set or the current build has finished. */
  whenUsable(): Promise<void> {
    return new Promise((res) => {
      const done = () => { if (this.unplayedCount > 0 || !this.inflight) { off(); res(); } };
      const off = this.onChange(done);
      done();
    });
  }

  private async getJson(path: string): Promise<{ ok: true; data: unknown } | { ok: false }> {
    const f = this.env.fetch;
    if (!f) return { ok: false };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), RA_FETCH_TIMEOUT_MS) : null;
    try {
      const r = await f(`${this.env.base}${path}`, { headers: { Accept: 'application/json' }, signal: ctl?.signal });
      if (r.status === 429) {
        this.blocked = true;
        const ra = Number(r.headers?.get('Retry-After'));
        this.retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60000;
        return { ok: false };
      }
      if (!r.ok) { this.failed = true; return { ok: false }; }
      return { ok: true, data: await r.json() };
    } catch {
      this.failed = true;
      return { ok: false };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async build(): Promise<void> {
    type Cand = { id: string; name: string; eventTitle?: string; venue?: string };
    let artists: Cand[] = [];
    for (let attempt = 0; attempt < RA_EVENT_DAY_TRIES && artists.length === 0; attempt++) {
      if (this.blocked || this.failed) return;
      const back = Math.min(RA_DAYS_BACK - 1, Math.floor(this.env.random() * RA_DAYS_BACK));
      const date = nyDate(this.env.now() - back * 86400000);
      this.eventFetches++;
      const r = await this.getJson(`/events?date=${encodeURIComponent(date)}`);
      if (!r.ok) return;
      const events = (r.data as { events?: unknown })?.events;
      const seen = new Set<string>();
      if (Array.isArray(events)) {
        for (const e of events as Array<Record<string, unknown>>) {
          const list = Array.isArray(e?.artists) ? (e.artists as Array<Record<string, unknown>>) : [];
          for (const a of list) {
            const id = typeof a?.id === 'string' || typeof a?.id === 'number' ? String(a.id) : '';
            const name = typeof a?.name === 'string' ? a.name.trim() : '';
            if (!id || !name || seen.has(id)) continue;
            seen.add(id);
            artists.push({
              id, name,
              eventTitle: typeof e.title === 'string' ? e.title : undefined,
              venue: typeof (e.venue as { name?: unknown })?.name === 'string' ? (e.venue as { name: string }).name : undefined,
            });
          }
        }
      }
    }
    artists = this.shuffle(artists);
    this.fetchedAt = this.env.now();
    for (const a of artists) {
      if (this.unplayedCount >= RA_TARGET_SETS || this.lookups >= RA_MAX_LOOKUPS || this.blocked) break;
      this.lookups++;
      const r = await this.getJson(`/artist?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}`);
      if (!r.ok) break;
      const sets = filterSets((r.data as { sets?: unknown })?.sets);
      for (const s of sets) this.add({ url: s.url, title: s.title, dj: a.name, duration: s.duration, artistId: a.id, eventTitle: a.eventTitle, venue: a.venue });
      this.persist();
      this.emit();
    }
  }

  private add(s: RaSet): void {
    if (this.pool.some((p) => p.url === s.url)) return;
    this.pool.push(s);
    while (this.pool.length > RA_POOL_CAP) {
      const i = this.pool.findIndex((p) => this.played.has(p.url));
      const [gone] = this.pool.splice(i >= 0 ? i : 0, 1);
      this.played.delete(gone.url);
    }
  }

  private shuffle<T>(a: T[]): T[] {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(this.env.random() * (i + 1)));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }

  /* ---------- persistence ---------- */

  private restore(): void {
    try {
      const raw = this.env.storage?.getItem(RA_CACHE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw) as Partial<Cache>;
      if (!j || !Array.isArray(j.sets)) return;
      for (const s of j.sets as Array<Partial<RaSet>>) {
        if (s && isScUrl(s.url) && typeof s.duration === 'number' && s.duration >= RA_MIN_SECONDS && typeof s.title === 'string' && typeof s.dj === 'string'
          && !this.pool.some((p) => p.url === s.url) && this.pool.length < RA_POOL_CAP) {
          this.pool.push({ url: s.url, title: s.title, dj: s.dj, duration: s.duration, artistId: String(s.artistId ?? ''), eventTitle: s.eventTitle, venue: s.venue });
        }
      }
      if (Array.isArray(j.played)) for (const u of j.played) if (typeof u === 'string' && this.pool.some((p) => p.url === u)) this.played.add(u);
      this.fetchedAt = typeof j.fetchedAt === 'number' ? j.fetchedAt : 0;
    } catch { /* corrupt cache: start empty */ }
  }

  private persist(): void {
    try {
      const c: Cache = { v: 1, fetchedAt: this.fetchedAt, sets: this.pool, played: [...this.played] };
      this.env.storage?.setItem(RA_CACHE_KEY, JSON.stringify(c));
    } catch { /* blocked or full */ }
  }
}
