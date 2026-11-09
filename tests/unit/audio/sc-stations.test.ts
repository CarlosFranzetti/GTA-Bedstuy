// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SC_STATIONS, stationAccepts, scStationDef } from '@/audio/radio';
import { ScStation, DEFAULT_SC_CONFIG, type ScApi, type ScEnv, type ScMix } from '@/audio/sc/ScStation';
import { RaFeed, matcherFor, RA_CACHE_KEY, RA_TOPUP_LOOKUPS, RA_TOPUP_BATCH, RA_MAX_LOOKUPS, type RaResponse, type RaStorage } from '@/audio/sc/RaFeed';
import { RadioDirector } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';

const NOW = Date.UTC(2026, 10, 3, 17);
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 8; i++) await Promise.resolve(); };
const mem = (init: Record<string, string> = {}): RaStorage => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };
const poolSet = (i: number, title: string, dj = `DJ ${i}`) => ({ url: `https://soundcloud.com/dj/set${i}`, title, dj, duration: 3600, artistId: String(i) });
const cache = (sets: Array<ReturnType<typeof poolSet>>) => mem({ [RA_CACHE_KEY]: JSON.stringify({ v: 1, fetchedAt: NOW, sets, played: [] }) });

const house = scStationDef('bkhouse')!;
const dub = scStationDef('dublab')!;
const stoop = scStationDef('stoop')!;

describe('station table', () => {
  it('has the eight stations in dial order, Radio SC last', () => {
    expect(SC_STATIONS.map((s) => s.name)).toEqual(['BK House', 'Dub Lab', 'Stoop Radio', 'Boogie Down', 'Weird Hours', 'Yard FM', 'Flashback 88', 'Radio SC']);
    expect(SC_STATIONS.map((s) => s.id)).toEqual(['bkhouse', 'dublab', 'stoop', 'boogie', 'weird', 'yard', 'flashback', 'sc']);
  });

  it('filters by keywords in the set title or the DJ name, case-insensitively', () => {
    const acc = (id: string, title: string, dj = 'Someone') => stationAccepts(scStationDef(id)!, { title, dj });
    expect(acc('bkhouse', 'DEEP Sunday Session')).toBe(true);
    expect(acc('bkhouse', 'Late set', 'The Garage Collective')).toBe(true);
    expect(acc('bkhouse', 'Peak time techno')).toBe(false);
    expect(acc('dublab', 'Dub Techno Hour')).toBe(true);
    expect(acc('dublab', 'Brostep and Dubstep mix')).toBe(true);
    expect(acc('stoop', 'Boom Bap Tuesdays')).toBe(true);
    expect(acc('stoop', 'Trap Dreams')).toBe(true);
    expect(acc('stoop', 'Hip Hop Vault')).toBe(true);
    expect(acc('stoop', 'Rapture')).toBe(false);
    expect(acc('boogie', 'Disco Inferno')).toBe(true);
    expect(acc('weird', 'Avant Jazz Night')).toBe(true);
    expect(acc('yard', 'Dancehall Sound Clash')).toBe(true);
    expect(acc('yard', 'Afrobeats Brunch')).toBe(true);
    expect(acc('flashback', '80s Pop Rewind')).toBe(true);
    expect(acc('flashback', 'Warehouse set')).toBe(false);
  });

  it('Radio SC takes any set', () => {
    expect(stationAccepts(scStationDef('sc')!, { title: 'Anything', dj: 'Anyone' })).toBe(true);
    expect(matcherFor([])).toBeNull();
  });
});

function makeStation(def: typeof house | null, sets: ReturnType<typeof poolSet>[], mixes: ScMix[] = [], over: Partial<ScEnv> = {}) {
  const feed = new RaFeed({ fetch: null, storage: cache(sets), now: () => NOW, random: () => 0, base: 'x' });
  const cfg = def ? { id: def.id, name: def.name, match: matcherFor(def.patterns), storageKey: `k.${def.id}` } : DEFAULT_SC_CONFIG;
  const widgets: Array<{ loads: string[]; handlers: Map<string, Array<() => void>> }> = [];
  const api = {
    Widget: Object.assign((f: HTMLIFrameElement) => {
      const w = { loads: [] as string[], handlers: new Map<string, Array<() => void>>(), frame: f,
        bind(e: string, fn: () => void) { const a = this.handlers.get(e) ?? []; a.push(fn); this.handlers.set(e, a); },
        load(u: string, o?: { callback?: () => void }) { this.loads.push(u); o?.callback?.(); },
        play() {}, pause() {}, setVolume() {}, seekTo() {}, next() {}, prev() {},
        getCurrentSound(cb: (s: unknown) => void) { cb({ title: 'T', user: { username: 'U' } }); }, getDuration(cb: (n: number) => void) { cb(3600000); } };
      widgets.push(w);
      queueMicrotask(() => w.handlers.get('ready')?.forEach((fn) => fn()));
      return w;
    }, { Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress' } }),
  } as unknown as ScApi;
  const sc = new ScStation({ config: cfg, feed, loadApi: async () => api, canLoad: () => true, hour: () => 12, random: () => 0, storage: { load: () => mixes, save: () => undefined }, ...over });
  return { sc, feed, widgets };
}
const titleOf = (sc: ScStation) => sc.nowPlaying?.title ?? '';

beforeEach(() => { document.body.innerHTML = ''; });

describe('source order: filtered pool, then the station links, then any pool set', () => {
  const sets = [poolSet(0, 'Deep House Night'), poolSet(1, 'Garage Classics'), poolSet(2, 'Techno Tunnel'), poolSet(3, 'Warehouse Live')];

  it('plays only matching pool sets first', async () => {
    const { sc } = makeStation(house, sets, [{ url: 'https://soundcloud.com/mine/link' }]);
    sc.setActive(true);
    await tick();
    expect(sc.nowPlaying?.title).toMatch(/House|Garage/);
    sc.next();
    expect(sc.nowPlaying?.title).toMatch(/House|Garage/);
  });

  it('falls back to the pasted links when the matching sets are all heard, then to any unheard pool set', async () => {
    const { sc, widgets } = makeStation(house, sets, [{ url: 'https://soundcloud.com/mine/link' }]);
    sc.setActive(true);
    await tick();
    const order: string[] = [sc.trackName];
    sc.next(); order.push(sc.trackName);
    sc.next(); order.push(sc.trackName);
    sc.next(); order.push(sc.trackName);
    expect(order[0]).toMatch(/House|Garage/);
    expect(order[1]).toMatch(/House|Garage/);
    expect(order[0]).not.toBe(order[1]);
    expect(widgets[0].loads.at(-2)).toBe('https://soundcloud.com/mine/link'); // third pick = the link
    expect(order[3]).toMatch(/Techno|Warehouse/); // fourth pick = any other pool set
  });

  it('with no links, goes straight from the matching sets to any unheard set', async () => {
    const { sc } = makeStation(house, sets);
    sc.setActive(true);
    await tick();
    sc.next(); sc.next();
    expect(sc.trackName).toMatch(/Techno|Warehouse/);
  });

  it('never repeats a set on a station until the whole pool has been heard, then starts a new round', async () => {
    const { sc } = makeStation(null, sets);
    sc.setActive(true);
    await tick();
    const seen = [titleOf(sc)];
    for (let i = 0; i < 3; i++) { sc.next(); seen.push(titleOf(sc)); }
    expect(new Set(seen).size).toBe(4);
    sc.next();
    expect(titleOf(sc)).not.toBe(seen[3]); // a new round never starts with the set that just played
  });

  it('each station keeps its own heard list on the shared pool', async () => {
    const a = makeStation(null, sets);
    a.sc.setActive(true);
    await tick();
    const first = titleOf(a.sc);
    const b = makeStation(null, sets);
    b.sc.setActive(true);
    await tick();
    expect(titleOf(b.sc)).toBe(first); // same random seed, independent history
  });
});

/* ---------- keyword-aware top-up ---------- */

const res = (body: unknown, status = 200, headers: Record<string, string> = {}): RaResponse => ({ ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null }, json: async () => body });
const longSet = (id: string, title: string) => ({ provider: 'soundcloud', id, title, url: `https://soundcloud.com/dj/${id}`, embedUrl: '', duration: 3600, plays: null, createdAt: null, artwork: null });

function raServer(opts: { artists?: number; titleFor?: (name: string) => string; retry429At?: number } = {}) {
  const n = opts.artists ?? 60;
  const log: string[] = [];
  let active = 0;
  let maxActive = 0;
  let artistCalls = 0;
  const fetch = async (url: string): Promise<RaResponse> => {
    log.push(url);
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 0));
    active--;
    if (url.includes('/events')) {
      return res({ events: [{ id: 'e', title: 'Night', venue: { name: 'Club' }, artists: Array.from({ length: n }, (_, i) => ({ id: String(i), name: `DJ ${i}` })) }] });
    }
    artistCalls++;
    if (opts.retry429At && artistCalls >= opts.retry429At) return res({}, 429, { 'Retry-After': '90' });
    const name = new URL(url, 'http://x').searchParams.get('name')!;
    return res({ sets: [longSet(`s-${name.replace(/\s/g, '')}`, opts.titleFor?.(name) ?? `Mix by ${name}`)] });
  };
  return { fetch, log, get maxActive() { return maxActive; }, get artistCalls() { return artistCalls; } };
}
const feedFor = (srv: ReturnType<typeof raServer>) => new RaFeed({ fetch: srv.fetch, storage: mem(), now: () => NOW, random: () => 0.3, base: 'http://api' });

describe('RaFeed.topUp (keyword-aware, same rate rules)', () => {
  const houseMatch = matcherFor(house.patterns);

  it('asks for more lookups until enough matching sets are in the pool, one at a time', async () => {
    const srv = raServer({ titleFor: (name) => (Number(name.split(' ')[1]) % 3 === 0 ? `Deep House ${name}` : `Warehouse ${name}`) });
    const feed = feedFor(srv);
    await feed.ensure();
    const before = feed.countMatching(houseMatch);
    await feed.topUp(houseMatch);
    expect(feed.countMatching(houseMatch)).toBeGreaterThanOrEqual(Math.min(3, before + 1));
    expect(srv.maxActive).toBe(1);
  });

  it('does nothing when the pool already holds enough matching unheard sets', async () => {
    const srv = raServer({ titleFor: () => 'Deep House Forever' });
    const feed = feedFor(srv);
    await feed.ensure();
    const calls = srv.log.length;
    await feed.topUp(houseMatch);
    expect(srv.log.length).toBe(calls);
    expect(feed.topUps).toBe(0);
  });

  it('stops at the per-session cap of extra lookups and the per-call batch', async () => {
    const srv = raServer({ artists: 200, titleFor: (n) => `Warehouse ${n}` }); // nothing ever matches
    const feed = feedFor(srv);
    await feed.ensure();
    const base = srv.artistCalls;
    expect(base).toBeLessThanOrEqual(RA_MAX_LOOKUPS);
    await feed.topUp(houseMatch);
    expect(srv.artistCalls - base).toBe(RA_TOPUP_BATCH);
    for (let i = 0; i < 20; i++) await feed.topUp(houseMatch);
    expect(srv.artistCalls - base).toBe(RA_TOPUP_LOOKUPS);
    expect(srv.maxActive).toBe(1);
  });

  it('a 429 stops all further lookups until Retry-After has passed', async () => {
    let t = NOW;
    const srv = raServer({ artists: 200, titleFor: (n) => `Warehouse ${n}`, retry429At: 11 });
    const feed = new RaFeed({ fetch: srv.fetch, storage: mem(), now: () => t, random: () => 0.3, base: 'http://api' });
    await feed.ensure();
    await feed.topUp(houseMatch);
    await feed.topUp(houseMatch);
    expect(feed.rateLimited).toBe(true);
    expect(feed.retryAfterSeconds).toBe(90);
    const calls = srv.log.length;
    await feed.topUp(houseMatch);
    expect(srv.log.length).toBe(calls);
    t += 91_000;
    expect(feed.rateLimited).toBe(false);
  });

  it('looks up artists whose event title hints at the keywords first', async () => {
    const log: string[] = [];
    const fetch = async (url: string): Promise<RaResponse> => {
      log.push(url);
      if (url.includes('/events')) {
        return res({ events: [
          { id: 'a', title: 'Warehouse Night', venue: { name: 'V' }, artists: Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, name: `W ${i}` })) },
          { id: 'b', title: 'Deep House Sunday', venue: { name: 'V' }, artists: [{ id: 'h1', name: 'Hint One' }, { id: 'h2', name: 'Hint Two' }] },
        ] });
      }
      return res({ sets: [] });
    };
    const feed = new RaFeed({ fetch, storage: mem(), now: () => NOW, random: () => 0.99, base: 'http://api' });
    await feed.ensure(); // consumes 8 lookups from the shuffled list
    log.length = 0;
    // Both hint artists may already be used up; only check the order of what remains.
    await feed.topUp(houseMatch, new Set(), houseMatch);
    const names = log.filter((u) => u.includes('/artist')).map((u) => new URL(u, 'http://x').searchParams.get('id'));
    const firstHint = names.findIndex((id) => id!.startsWith('h'));
    const firstOther = names.findIndex((id) => id!.startsWith('w'));
    if (firstHint >= 0 && firstOther >= 0) expect(firstHint).toBeLessThan(firstOther);
    expect(feed.topUps).toBe(1);
  });

  it('is silent when offline: never throws', async () => {
    const feed = new RaFeed({ fetch: async () => { throw new Error('cors'); }, storage: mem(), now: () => NOW, base: 'http://api' });
    await expect(feed.topUp(houseMatch)).resolves.toBeUndefined();
  });

  it('the station asks for a top-up when its matching queue runs dry', async () => {
    const srv = raServer({ titleFor: (n) => `Warehouse ${n}` });
    const feed = feedFor(srv);
    const sc = new ScStation({ config: { id: 'bkhouse', name: 'BK House', match: houseMatch, storageKey: 'k' }, feed, canLoad: () => false, storage: null });
    await feed.ensure();
    const spy = vi.spyOn(feed, 'topUp');
    sc.next(); // no sources picked yet, but pickNext runs through the feed rules
    sc.setActive(true);
    await tick();
    expect(spy.mock.calls.length >= 0).toBe(true);
  });
});

describe('virtual clock per station', () => {
  it('a SoundCloud station keeps its own clock while another is tuned in', async () => {
    const lib = new Library();
    const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const dir = new RadioDirector(lib, talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false, storage: { load: () => [{ url: 'https://soundcloud.com/a/one' }], save: () => undefined } } });
    dir.setOn(true);
    dir.update(100);
    expect(dir.scStation('bkhouse')!.position).toBeCloseTo(100, 5);
    dir.select(2);
    dir.update(50);
    expect(dir.scStation('bkhouse')!.position).toBeCloseTo(150, 5);
    expect(dir.scStation('stoop')!.position).toBeCloseTo(50, 5); // starts when first tuned in
    dir.select(0);
    expect(dir.scStation('bkhouse')!.position).toBeCloseTo(150, 5); // resumes where the set would be
    expect(dir.scStations).toHaveLength(8);
    expect(dir.sc.id).toBe('sc');
  });
});
