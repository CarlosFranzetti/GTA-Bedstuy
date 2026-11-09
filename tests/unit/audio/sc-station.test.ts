// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScStation, normalizeScUrl, widgetSrc, localScStorage, inPreferredHours, SC_FAILED_NAME, SC_EMPTY_HINT, SC_STORAGE_KEY, type ScApi, type ScEnv, type ScMix } from '@/audio/sc/ScStation';
import { RaFeed, RA_CACHE_KEY, type RaResponse } from '@/audio/sc/RaFeed';
import { RadioDirector } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';

class FakeWidget {
  handlers = new Map<string, Array<(e?: unknown) => void>>();
  calls: Array<[string, ...unknown[]]> = [];
  durationMs = 600000;
  sound = { title: 'Late Mix', user: { username: 'DJ Fake' } };
  constructor(public frame: HTMLIFrameElement) {}
  bind(e: string, fn: (x?: unknown) => void) { const a = this.handlers.get(e) ?? []; a.push(fn); this.handlers.set(e, a); }
  emit(e: string, p?: unknown) { this.handlers.get(e)?.forEach((f) => f(p)); }
  load(url: string, o?: { callback?: () => void }) { this.calls.push(['load', url]); o?.callback?.(); }
  play() { this.calls.push(['play']); }
  pause() { this.calls.push(['pause']); }
  setVolume(v: number) { this.calls.push(['setVolume', v]); }
  seekTo(ms: number) { this.calls.push(['seekTo', ms]); }
  next() { this.calls.push(['next']); }
  prev() { this.calls.push(['prev']); }
  getCurrentSound(cb: (s: unknown) => void) { cb(this.sound); }
  getDuration(cb: (ms: number) => void) { cb(this.durationMs); }
  last(name: string) { return [...this.calls].reverse().find((c) => c[0] === name); }
}

function setup(over: Partial<ScEnv> = {}, mixes: ScMix[] = [{ url: 'https://soundcloud.com/a/one' }, { url: 'https://soundcloud.com/b/two', afterhours: true }]) {
  const widgets: FakeWidget[] = [];
  const api = { Widget: Object.assign((f: HTMLIFrameElement) => { const w = new FakeWidget(f); widgets.push(w); queueMicrotask(() => w.emit('ready')); return w; }, { Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress' } }) } as unknown as ScApi;
  const loadApi = vi.fn(async () => api);
  const saved: { data: ScMix[] | null } = { data: mixes };
  const sc = new ScStation({ loadApi, canLoad: () => true, hour: () => 12, feed: null, storage: { load: () => saved.data, save: (m) => { saved.data = m; } }, ...over });
  return { sc, widgets, loadApi, saved };
}
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

describe('URL validation', () => {
  it('accepts only soundcloud.com track and set links', () => {
    expect(normalizeScUrl('https://soundcloud.com/artist/mix?si=abc#t=1')).toBe('https://soundcloud.com/artist/mix');
    expect(normalizeScUrl('soundcloud.com/artist/sets/night')).toBe('https://soundcloud.com/artist/sets/night');
    expect(normalizeScUrl('https://m.soundcloud.com/a/b')).toBe('https://soundcloud.com/a/b');
    for (const bad of ['', 'https://soundcloud.com/artist', 'https://evilsoundcloud.com/a/b', 'https://soundcloud.com.evil.io/a/b', 'https://youtube.com/watch?v=1', 'javascript:alert(1)', 'ftp://soundcloud.com/a/b', 'https://u:p@soundcloud.com/a/b', 'https://api.soundcloud.com/tracks/1/stream', 'not a url']) {
      expect(normalizeScUrl(bad), bad).toBeNull();
    }
  });
  it('addMix rejects bad and duplicate links', () => {
    const { sc } = setup({}, []);
    expect(sc.addMix('https://example.com/a/b').ok).toBe(false);
    expect(sc.addMix('https://soundcloud.com/a/b').ok).toBe(true);
    expect(sc.addMix('soundcloud.com/a/b?x=1').ok).toBe(false);
    expect(sc.mixes).toHaveLength(1);
  });
  it('widget src uses the documented player url without autoplay', () => {
    expect(widgetSrc('https://soundcloud.com/a/b')).toBe('https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb&auto_play=false&visual=false');
  });
});

describe('lazy load', () => {
  it('touches nothing until the first tune-in, then loads the API once and hides the iframe off-screen', async () => {
    const { sc, loadApi, widgets } = setup();
    expect(loadApi).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
    sc.setActive(true);
    await tick();
    sc.setActive(false);
    sc.setActive(true);
    await tick();
    expect(loadApi).toHaveBeenCalledTimes(1);
    expect(widgets).toHaveLength(1);
    const f = document.querySelector('iframe')!;
    expect(f.src).toContain('https://w.soundcloud.com/player/?url=');
    expect(f.style.width).toBe('1px');
    expect(f.style.left).toBe('-9999px');
    expect(f.style.display).not.toBe('none');
    expect(sc.status).toBe('ready');
  });
  it('does not load anything with an empty list', async () => {
    const { sc, loadApi } = setup({}, []);
    sc.setActive(true);
    await tick();
    expect(loadApi).not.toHaveBeenCalled();
    expect(sc.usingBed).toBe(true);
    expect(sc.trackName).toBe(SC_EMPTY_HINT);
  });
});

describe('fallback', () => {
  it('falls back to the bed with the HUD text when the player never becomes ready within 8 s', async () => {
    vi.useFakeTimers();
    const api = { Widget: Object.assign((f: HTMLIFrameElement) => new FakeWidget(f), {}) } as unknown as ScApi; // never emits ready
    const { sc } = setup({ loadApi: async () => api });
    sc.setActive(true);
    await vi.advanceTimersByTimeAsync(7900);
    expect(sc.status).toBe('loading');
    await vi.advanceTimersByTimeAsync(200);
    expect(sc.status).toBe('failed');
    expect(sc.stationName).toBe(SC_FAILED_NAME);
    expect(sc.stationName).toBe('Radio SC (needs the hosted build / internet)');
    expect(sc.usingBed).toBe(true);
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('falls back when the script is blocked, and when offline outside the hosted build', async () => {
    const a = setup({ loadApi: async () => { throw new Error('blocked'); } });
    a.sc.setActive(true);
    await tick();
    expect(a.sc.status).toBe('failed');
    const b = setup({ canLoad: () => false });
    b.sc.setActive(true);
    await tick();
    expect(b.sc.status).toBe('failed');
    expect(b.loadApi).not.toHaveBeenCalled();
  });
  it('the director plays the procedural bed while failed', async () => {
    const { sc } = setup({ canLoad: () => false });
    const dir = new RadioDirector(new Library(null), new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []), undefined, sc);
    dir.setOn(true);
    dir.select(dir.stations.findIndex((s) => s.id === 'sc'));
    await tick();
    expect(dir.synthPlayback).not.toBeNull();
    expect(dir.stationName).toBe(SC_FAILED_NAME);
  });
});

describe('volume, pause, now playing, next', () => {
  it('maps radio volume to setVolume 0..100 and pause/resume to pause/play', async () => {
    const { sc, widgets } = setup();
    sc.setVolume(0.5);
    sc.setActive(true);
    await tick();
    const w = widgets[0];
    expect(w.last('setVolume')).toEqual(['setVolume', 50]);
    sc.setVolume(0);
    expect(w.last('setVolume')).toEqual(['setVolume', 0]);
    sc.setVolume(2);
    expect(w.last('setVolume')).toEqual(['setVolume', 100]);
    w.calls.length = 0;
    sc.setPaused(true);
    expect(w.calls).toEqual([['pause']]);
    sc.setPaused(false);
    expect(w.last('play')).toBeTruthy();
    sc.setActive(false); // leaving the car pauses the widget
    expect(w.last('pause')).toBeTruthy();
  });
  it('exposes title and user from getCurrentSound and next() loads the next mix', async () => {
    const { sc, widgets } = setup();
    sc.setActive(true);
    await tick();
    expect(sc.nowPlaying).toEqual({ title: 'Late Mix', user: 'DJ Fake' });
    expect(sc.trackName).toBe('Late Mix - DJ Fake');
    const between = vi.fn();
    sc.onBetweenMixes = between;
    sc.next();
    expect(widgets[0].last('load')).toEqual(['load', 'https://soundcloud.com/b/two']);
    expect(between).toHaveBeenCalledTimes(1);
  });
  it('advances to the next mix when the widget reports FINISH', async () => {
    const { sc, widgets } = setup({}, [{ url: 'https://soundcloud.com/a/one' }, { url: 'https://soundcloud.com/b/two' }]);
    sc.setActive(true);
    await tick();
    widgets[0].emit('finish');
    expect(widgets[0].last('load')).toEqual(['load', 'https://soundcloud.com/b/two']);
  });
});

describe('virtual time', () => {
  it('seeks to the virtual position on tune-in after listening elsewhere', async () => {
    const { sc, widgets } = setup({}, [{ url: 'https://soundcloud.com/a/one' }]);
    sc.setActive(true);
    await tick();
    const w = widgets[0];
    sc.setActive(false);
    sc.update(90);
    w.calls.length = 0;
    sc.setActive(true);
    expect(w.last('seekTo')).toEqual(['seekTo', 90000]);
    expect(w.calls.at(-1)).toEqual(['play']);
  });
  it('does not advance while paused and wraps past the mix length', async () => {
    const { sc, widgets } = setup({}, [{ url: 'https://soundcloud.com/a/one' }]);
    sc.setActive(true);
    await tick();
    sc.setActive(false);
    sc.setPaused(true);
    sc.update(500);
    expect(sc.position).toBe(0);
    sc.setPaused(false);
    sc.update(650); // mix is 600 s and only one mix: wraps to 50 s
    widgets[0].calls.length = 0;
    sc.setActive(true);
    expect(widgets[0].last('seekTo')).toEqual(['seekTo', 50000]);
  });
});

describe('persistence and dayparting', () => {
  it('round-trips the list through localStorage and drops invalid entries', () => {
    const st = localScStorage();
    const a = new ScStation({ storage: st, canLoad: () => false });
    a.addMix('https://soundcloud.com/a/one');
    a.addMix('https://soundcloud.com/b/two', true);
    a.moveMix(1, -1);
    const b = new ScStation({ storage: localScStorage(), canLoad: () => false });
    expect(b.mixes).toEqual([{ url: 'https://soundcloud.com/b/two', afterhours: true }, { url: 'https://soundcloud.com/a/one' }]);
    localStorage.setItem(SC_STORAGE_KEY, JSON.stringify({ v: 1, mixes: [{ url: 'https://evil.com/a/b' }, { url: 'https://soundcloud.com/c/d' }] }));
    expect(new ScStation({ storage: localScStorage() }).mixes).toEqual([{ url: 'https://soundcloud.com/c/d' }]);
    localStorage.setItem(SC_STORAGE_KEY, '{broken');
    expect(new ScStation({ storage: localScStorage() }).mixes).toEqual([]);
  });
  it('removing and reordering keeps the current mix pointer', () => {
    const { sc } = setup({}, [{ url: 'https://soundcloud.com/a/1' }, { url: 'https://soundcloud.com/a/2' }, { url: 'https://soundcloud.com/a/3' }]);
    sc.next();
    expect(sc.currentIndex).toBe(1);
    sc.moveMix(1, 1);
    expect(sc.currentIndex).toBe(2);
    sc.removeMix(0);
    expect(sc.currentIndex).toBe(1);
  });
  it('picks the afterhours mix first only between 23:00 and 06:00', async () => {
    expect([23, 0, 5].every(inPreferredHours)).toBe(true);
    expect([6, 12, 22].some(inPreferredHours)).toBe(false);
    const night = setup({ hour: () => 1 });
    night.sc.setActive(true);
    await tick();
    expect(night.widgets[0].frame.src).toContain(encodeURIComponent('https://soundcloud.com/b/two'));
    const day = setup({ hour: () => 14 });
    day.sc.setActive(true);
    await tick();
    expect(day.widgets[0].frame.src).toContain(encodeURIComponent('https://soundcloud.com/a/one'));
  });
});

describe('test link', () => {
  it('reports the title with a throwaway player and removes its iframe', async () => {
    const { sc } = setup();
    const r = await sc.test('https://soundcloud.com/x/y');
    expect(r).toEqual({ ok: true, title: 'Late Mix' });
    expect(document.querySelector('iframe')).toBeNull();
    expect((await sc.test('https://example.com/x/y')).ok).toBe(false);
  });
});

describe('dial order', () => {
  it('puts Radio SC as the eighth SoundCloud station, right before WBSY Talk', () => {
    const dir = new RadioDirector(new Library(null), new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []), undefined, setup().sc);
    const names = dir.stations.map((s) => s.name);
    expect(names.slice(-2)).toEqual(['Radio SC', 'WBSY Talk']);
    expect(dir.stations.at(-1)!.kind).toBe('talk');
  });
});

describe('RA pool', () => {
  const NOW = Date.UTC(2026, 10, 3, 17);
  const poolSets = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://soundcloud.com/dj/set${i}`, title: `Long Set ${i}`, dj: `DJ ${i}`, duration: 3600, artistId: String(i) }));
  const cached = (n: number) => {
    const map = new Map<string, string>([[RA_CACHE_KEY, JSON.stringify({ v: 1, fetchedAt: NOW, sets: poolSets(n), played: [] })]]);
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
  };
  const mkFeed = (n: number, fetchFn?: (u: string) => Promise<RaResponse>) => new RaFeed({ fetch: fetchFn ?? (async () => { throw new Error('should not fetch'); }), storage: cached(n), now: () => NOW, base: 'http://api' });
  const lastLoadedUrl = (w: FakeWidget) => decodeURIComponent((w.frame.src.split('url=')[1] ?? '').split('&')[0]);

  it('never calls the RA API before the first tune-in', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('offline'); });
    const feed = new RaFeed({ fetch: fetchFn as never, storage: { getItem: () => null, setItem: () => undefined }, base: 'http://api' });
    const { sc } = setup({ feed }, []);
    await tick();
    expect(fetchFn).not.toHaveBeenCalled();
    sc.setActive(true);
    await tick();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('plays a pool set when the user list is empty and shows "title \u2014 DJ"', async () => {
    const { sc, widgets } = setup({ feed: mkFeed(6) }, []);
    expect(sc.usingBed).toBe(false);
    sc.setActive(true);
    await tick();
    expect(sc.status).toBe('ready');
    expect(lastLoadedUrl(widgets[0])).toMatch(/^https:\/\/soundcloud\.com\/dj\/set\d$/);
    const n = sc.nowPlaying!;
    expect(sc.trackName).toBe(`${n.title} \u2014 ${n.user}`);
    expect(sc.trackName).toMatch(/^Long Set \d \u2014 DJ \d$/);
    expect(sc.usingBed).toBe(false);
  });

  it('falls back to the widget user when RA has no DJ name', async () => {
    const feed = mkFeed(1);
    (feed.sets as unknown as Array<{ dj: string }>)[0].dj = '';
    const { sc } = setup({ feed }, []);
    sc.setActive(true);
    await tick();
    expect(sc.trackName).toBe('Long Set 0 \u2014 DJ Fake');
  });

  it('FINISH advances to a different pool set without repeats', async () => {
    const { sc, widgets } = setup({ feed: mkFeed(4) }, []);
    sc.setActive(true);
    await tick();
    const seen = new Set<string>([lastLoadedUrl(widgets[0])]);
    for (let i = 0; i < 3; i++) {
      widgets[0].emit('finish');
      seen.add((widgets[0].last('load') as [string, string])[1]);
    }
    expect(seen.size).toBe(4);
  });

  it('plays the pool first, then pasted links, then any pool set it has not heard (never repeating)', async () => {
    const { sc, widgets } = setup({ feed: mkFeed(2), random: () => 0.9 }, [{ url: 'https://soundcloud.com/a/one' }]);
    sc.setActive(true);
    await tick();
    const seq: string[] = [lastLoadedUrl(widgets[0])];
    for (let i = 0; i < 2; i++) {
      widgets[0].emit('finish');
      seq.push((widgets[0].last('load') as [string, string])[1]);
    }
    expect(seq.map((u) => (u.includes('/dj/') ? 'pool' : 'user'))).toEqual(['pool', 'pool', 'user']);
    expect(new Set(seq).size).toBe(3);
  });

  it('shows the empty hint only when both the pool and the list are empty', async () => {
    const offline = new RaFeed({ fetch: async () => { throw new Error('cors'); }, storage: { getItem: () => null, setItem: () => undefined }, base: 'http://api' });
    const a = setup({ feed: offline }, []);
    a.sc.setActive(true);
    await tick();
    await tick();
    expect(offline.status).toBe('unavailable');
    expect(a.sc.trackName).toBe(SC_EMPTY_HINT);
    expect(a.sc.usingBed).toBe(true);
    const b = setup({ feed: new RaFeed({ fetch: async () => { throw new Error('cors'); }, storage: { getItem: () => null, setItem: () => undefined }, base: 'http://api' }) });
    b.sc.setActive(true);
    await tick();
    await tick();
    expect(b.sc.trackName).not.toBe(SC_EMPTY_HINT);
    expect(b.sc.usingBed).toBe(false);
  });

  it('the Random RA sets switch keeps only pasted links and is persisted', async () => {
    const st = localScStorage();
    const feed = mkFeed(6);
    const sc = new ScStation({ storage: st, feed, canLoad: () => false });
    expect(sc.randomSets).toBe(true);
    sc.addMix('https://soundcloud.com/a/one');
    sc.setRandomSets(false);
    expect(new ScStation({ storage: localScStorage(), feed, canLoad: () => false }).randomSets).toBe(false);
    expect(new ScStation({ storage: localScStorage(), feed, canLoad: () => false }).mixes).toHaveLength(1);
  });

  it('prefetches when about five minutes remain and the pool is low', async () => {
    const calls: string[] = [];
    const feed = mkFeed(2, async (u) => { calls.push(u); throw new Error('offline'); });
    const { sc, widgets } = setup({ feed }, []);
    sc.setActive(true);
    await tick();
    const base = calls.length; // the tune-in top-up itself (cache had fewer than 6 unplayed)
    widgets[0].emit('playProgress', { currentPosition: 100 * 1000 });
    await tick();
    expect(calls).toHaveLength(base);
    widgets[0].emit('playProgress', { currentPosition: (600 - 200) * 1000 });
    await tick();
    expect(calls.length).toBeGreaterThan(base);
  });
});
