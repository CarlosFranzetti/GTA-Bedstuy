import { describe, it, expect } from 'vitest';
import { RaFeed, raApiBase, filterSets, nyDate, RA_BASE_KEY, RA_CACHE_KEY, RA_PUBLIC_BASE, RA_HOSTED_BASE, RA_POOL_CAP, type RaStorage, type RaResponse } from '@/audio/sc/RaFeed';

const mem = (init: Record<string, string> = {}): RaStorage & { map: Map<string, string> } => {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
};
const res = (body: unknown, status = 200, headers: Record<string, string> = {}): RaResponse => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null }, json: async () => body,
});
const sc = (id: string, dur: number | null, provider = 'soundcloud') => ({ provider, id, title: `Set ${id}`, url: `https://soundcloud.com/dj/${id}`, embedUrl: '', duration: dur, plays: null, createdAt: null, artwork: null });
const NOW = Date.UTC(2026, 10, 3, 17, 0, 0);

/** A fake ra-nyc: `artists` events entries, each artist returns `perArtist` long sets. */
function fake(opts: { artists?: number; perArtist?: number; status?: Record<string, number>; delay?: boolean } = {}) {
  const n = opts.artists ?? 30;
  const per = opts.perArtist ?? 2;
  const log: string[] = [];
  let active = 0;
  let maxActive = 0;
  const fetch = async (url: string): Promise<RaResponse> => {
    log.push(url);
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 0));
    active--;
    if (url.includes('/events')) {
      if (opts.status?.events) return res({}, opts.status.events);
      const events = [{ id: 'e1', title: 'Night', venue: { name: 'Elsewhere' }, artists: Array.from({ length: n }, (_, i) => ({ id: String(100 + i), name: `DJ ${i}` })) },
        { id: 'e2', title: 'Dup', venue: { name: 'Nowadays' }, artists: [{ id: '100', name: 'DJ 0' }] }];
      return res({ date: 'x', events, count: 2 });
    }
    if (opts.status?.artist) return res({}, opts.status.artist, { 'Retry-After': '42' });
    const id = new URL(url, 'http://x').searchParams.get('id')!;
    const sets = Array.from({ length: per }, (_, k) => sc(`${id}-${k}`, 3600));
    return res({ name: 'x', sets: [...sets, sc(`${id}-short`, 600), sc(`${id}-null`, null), sc(`${id}-mc`, 7200, 'mixcloud')] });
  };
  return { fetch, log, get maxActive() { return maxActive; } };
}
const mk = (f: ReturnType<typeof fake>, storage = mem(), now = NOW, random = Math.random) => new RaFeed({ fetch: f.fetch, storage, now: () => now, random, base: 'http://api' });

describe('raApiBase', () => {
  it('uses the proxy when hosted, the public origin otherwise, and a localStorage override', () => {
    expect(raApiBase({ hosted: true, storage: mem() })).toBe(RA_HOSTED_BASE);
    expect(raApiBase({ hosted: false, storage: mem() })).toBe(RA_PUBLIC_BASE);
    expect(raApiBase({ hosted: true, storage: mem({ [RA_BASE_KEY]: 'http://localhost:9/api/' }) })).toBe('http://localhost:9/api');
  });
  it('formats New York days', () => { expect(nyDate(Date.UTC(2026, 0, 1, 3, 0, 0))).toBe('2025-12-31'); });
});

describe('filterSets', () => {
  it('keeps only soundcloud sets of 45 minutes or more', () => {
    const out = filterSets([sc('a', 2700), sc('b', 2699), sc('c', null), sc('d', 9000, 'mixcloud'), sc('e', 5000, 'archive'), { ...sc('f', 4000), url: 'https://evil.com/x' }, null]);
    expect(out.map((s) => s.url)).toEqual(['https://soundcloud.com/dj/a']);
    expect(filterSets('nope')).toEqual([]);
  });
});

describe('building the pool', () => {
  it('looks artists up sequentially and stops at 12 unplayed sets', async () => {
    const f = fake({ perArtist: 4 });
    const feed = mk(f);
    expect(f.log).toHaveLength(0);
    await feed.ensure();
    expect(f.maxActive).toBe(1);
    expect(feed.unplayedCount).toBeGreaterThanOrEqual(12);
    expect(feed.lookupsMade).toBe(3); // 4 sets per artist -> 12 after 3 lookups
    expect(f.log.filter((u) => u.includes('/events'))).toHaveLength(1);
    expect(f.log.every((u) => u.startsWith('http://api/'))).toBe(true);
    expect(feed.sets.every((s) => s.duration >= 2700 && s.dj.startsWith('DJ '))).toBe(true);
    expect(feed.status).toBe('ready');
  });
  it('stops at 8 artist lookups when sets are scarce', async () => {
    const f = fake({ perArtist: 1 });
    const feed = mk(f);
    await feed.ensure();
    expect(feed.lookupsMade).toBe(8);
    expect(feed.size).toBe(8);
  });
  it('picks a day inside the last 21 days and dedupes artists and sets by url', async () => {
    const f = fake({ perArtist: 1 });
    const feed = mk(f, mem(), NOW, () => 0.999);
    await feed.ensure();
    const date = new URL(f.log[0]).searchParams.get('date')!;
    expect(date).toBe(nyDate(NOW - 20 * 86400000));
    expect(new Set(feed.sets.map((s) => s.url)).size).toBe(feed.size);
    expect(new Set(feed.sets.map((s) => s.artistId)).size).toBe(feed.size);
  });
  it('is unavailable when the network fails, and a 429 stops lookups and records Retry-After', async () => {
    const down = new RaFeed({ fetch: async () => { throw new Error('cors'); }, storage: mem(), base: 'http://api' });
    await down.ensure();
    expect(down.status).toBe('unavailable');
    const f = fake({ status: { artist: 429 } });
    const feed = mk(f);
    await feed.ensure();
    expect(feed.rateLimited).toBe(true);
    expect(feed.retryAfterSeconds).toBe(42);
    expect(feed.lookupsMade).toBe(1);
    expect(feed.status).toBe('unavailable');
    const calls = f.log.length;
    await feed.ensure();
    expect(f.log.length).toBe(calls);
    const ev429 = fake({ status: { events: 429 } });
    const e = mk(ev429);
    await e.ensure();
    expect(e.status).toBe('unavailable');
    expect(ev429.log).toHaveLength(1);
  });
  it('caps the pool at 80 sets', async () => {
    const feed = mk(fake({ perArtist: 1 }));
    const priv = feed as unknown as { add(s: unknown): void };
    for (let i = 0; i < 100; i++) priv.add({ url: `https://soundcloud.com/x/${i}`, title: 't', dj: 'd', duration: 3600, artistId: String(i) });
    expect(feed.size).toBe(RA_POOL_CAP);
  });
});

describe('cache', () => {
  it('reuses a fresh cache with at least 6 unplayed sets and tops up otherwise', async () => {
    const st = mem();
    const a = mk(fake({ perArtist: 4 }), st);
    await a.ensure();
    expect(st.map.has(RA_CACHE_KEY)).toBe(true);
    const f2 = fake();
    const b = mk(f2, st, NOW + 3600_000);
    expect(b.size).toBe(a.size);
    await b.ensure();
    expect(f2.log).toHaveLength(0);
    // expired (> 24 h) -> network again
    const f3 = fake({ perArtist: 4 });
    const c = mk(f3, st, NOW + 25 * 3600_000);
    await c.ensure();
    expect(f3.log.length).toBeGreaterThan(0);
    // fresh but nearly all heard -> tops up
    const st2 = mem();
    const d = mk(fake({ perArtist: 4 }), st2);
    await d.ensure();
    for (let i = 0; i < d.size - 3; i++) d.nextSet();
    const f4 = fake({ perArtist: 4 });
    const e = mk(f4, st2, NOW + 1000);
    await e.ensure();
    expect(f4.log.length).toBeGreaterThan(0);
  });
  it('ignores a corrupt cache', () => {
    const feed = mk(fake(), mem({ [RA_CACHE_KEY]: '{nope' }));
    expect(feed.size).toBe(0);
  });
});

describe('nextSet', () => {
  it('never repeats until every set was heard, then resets, and persists played', async () => {
    const st = mem();
    const feed = mk(fake({ perArtist: 1 }), st);
    await feed.ensure();
    const n = feed.size;
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) seen.add(feed.nextSet()!.url);
    expect(seen.size).toBe(n);
    expect(feed.unplayedCount).toBe(0);
    expect(new RaFeed({ fetch: null, storage: st, base: 'x' }).playedCount).toBe(n);
    const again = feed.nextSet()!;
    expect(seen.has(again.url)).toBe(true);
    expect(feed.playedCount).toBe(1);
    expect(new RaFeed({ fetch: null, storage: mem(), base: 'x' }).nextSet()).toBeNull();
  });

  it('does not repeat the just-finished set as the first pick of a new round', async () => {
    for (let k = 0; k < 20; k++) {
      const feed = mk(fake({ perArtist: 1 }), mem(), NOW, () => 0);
      await feed.ensure();
      let last = '';
      for (let i = 0; i < feed.size; i++) last = feed.nextSet()!.url;
      expect(feed.nextSet()!.url).not.toBe(last);
    }
  });
});

describe('resilience', () => {
  it('resumes after Retry-After has passed', async () => {
    let t = NOW;
    let limited = true;
    const base = fake({ perArtist: 1 });
    const fetch = async (u: string) => (limited && u.includes('/artist') ? res({}, 429, { 'Retry-After': '30' }) : base.fetch(u));
    const feed = new RaFeed({ fetch, storage: mem(), now: () => t, base: 'http://api' });
    await feed.ensure();
    expect(feed.rateLimited).toBe(true);
    const n = base.log.length;
    t += 10_000;
    await feed.ensure();
    expect(base.log.length).toBe(n);
    limited = false;
    t += 25_000;
    expect(feed.rateLimited).toBe(false);
    await feed.ensure();
    expect(base.log.length).toBeGreaterThan(n);
    expect(feed.size).toBeGreaterThan(0);
  });
  it('defaults to 60 s without a Retry-After header', async () => {
    const feed = new RaFeed({ fetch: async (u) => (u.includes('/events') ? fake().fetch(u) : res({}, 429)), storage: mem(), now: () => NOW, base: 'http://api' });
    await feed.ensure();
    expect(feed.retryAfterSeconds).toBe(60);
  });
  it('skips an artist whose lookup 404s or returns bad JSON and continues', async () => {
    const base = fake({ perArtist: 2 });
    let n = 0;
    const fetch = async (u: string) => {
      if (!u.includes('/artist')) return base.fetch(u);
      n++;
      if (n === 1) return res({}, 404);
      if (n === 2) return { ok: true, status: 200, json: async () => { throw new Error('bad json'); } } as RaResponse;
      return base.fetch(u);
    };
    const feed = new RaFeed({ fetch, storage: mem(), now: () => NOW, base: 'http://api' });
    await feed.ensure();
    expect(feed.size).toBeGreaterThan(0);
    expect(feed.lookupsMade).toBe(8);
  });
  it('still stops on a network failure mid-build', async () => {
    const base = fake({ perArtist: 2 });
    let n = 0;
    const fetch = async (u: string) => { if (u.includes('/artist') && ++n === 2) throw new Error('net'); return base.fetch(u); };
    const feed = new RaFeed({ fetch, storage: mem(), now: () => NOW, base: 'http://api' });
    await feed.ensure();
    expect(feed.lookupsMade).toBe(2);
  });
});
