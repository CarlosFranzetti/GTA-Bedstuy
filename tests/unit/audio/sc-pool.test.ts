// @vitest-environment jsdom
// RADIO3: curated mix pools (src/audio/sc/mixes.ts + mixes.json) played through the (mocked) official widget.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScStation, SC_REROLL_AWAY_S, type ScApi, type ScEnv } from '@/audio/sc/ScStation';
import { parseMixes, parseMix, mixesFor, type CuratedMix } from '@/audio/sc/mixes';
import { RadioDirector } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';

class FakeWidget {
  handlers = new Map<string, Array<(e?: unknown) => void>>();
  calls: Array<[string, ...unknown[]]> = [];
  durationMs = 3600000;
  sound: { title: string; user: { username: string } } = { title: 'Page Title', user: { username: 'Page DJ' } };
  constructor(public frame: HTMLIFrameElement) {}
  bind(e: string, fn: (x?: unknown) => void) { const a = this.handlers.get(e) ?? []; a.push(fn); this.handlers.set(e, a); }
  emit(e: string, p?: unknown) { this.handlers.get(e)?.forEach((f) => f(p)); }
  load(url: string, o?: { callback?: () => void }) { this.calls.push(['load', url]); o?.callback?.(); }
  play() { this.calls.push(['play']); }
  pause() { this.calls.push(['pause']); }
  setVolume() { /* */ }
  seekTo(ms: number) { this.calls.push(['seekTo', ms]); }
  next() { /* */ }
  prev() { /* */ }
  getCurrentSound(cb: (s: unknown) => void) { cb(this.sound); }
  getDuration(cb: (ms: number) => void) { cb(this.durationMs); }
  loads() { return this.calls.filter((c) => c[0] === 'load').map((c) => c[1] as string); }
}

const mix = (i: number, minutes = 60): CuratedMix => ({ url: `https://soundcloud.com/dj${i}/mix${i}`, title: `Mix ${i}`, dj: `DJ ${i}`, checked: 'page-opened', minutes });
const pool7 = Array.from({ length: 7 }, (_, i) => mix(i + 1));

function setup(mixes: readonly CuratedMix[], rnd: () => number = Math.random, sources: string[] = ['https://soundcloud.com/acct/tracks']) {
  const widgets: FakeWidget[] = [];
  const api = { Widget: Object.assign((f: HTMLIFrameElement) => { const w = new FakeWidget(f); widgets.push(w); queueMicrotask(() => w.emit('ready')); return w; }, { Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress' } }) } as unknown as ScApi;
  const sc = new ScStation({
    loadApi: async () => api, canLoad: () => true, hour: () => 12, feed: null, random: rnd, storage: null,
    config: { id: 'hiphop', name: 'Test', match: null, storageKey: 'k', sources, randomStart: true, mixes },
  } as Partial<ScEnv>);
  return { sc, widgets };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
beforeEach(() => { document.body.innerHTML = ''; });

describe('mixes.json loading', () => {
  it('keeps https soundcloud.com track and set links, drops the rest and duplicates, tolerates extra fields', () => {
    const out = parseMixes({
      a: [
        { url: 'https://soundcloud.com/x/y', title: 't', dj: 'd', checked: 'page-opened', minutes: 61, extra: 1 },
        { url: 'https://soundcloud.com/x/y?si=1', title: 'dup', dj: 'd', checked: 'page-opened' },
        { url: 'http://soundcloud.com/x/z', title: 'http', dj: 'd', checked: 'page-opened' },
        { url: 'https://evil.com/x/y', title: 'host', dj: 'd', checked: 'page-opened' },
        { url: 'https://soundcloud.com/onlyaccount', title: 'acct', dj: 'd', checked: 'page-opened' },
        { url: 'https://soundcloud.com.evil.io/a/b' }, null, 7, 'x',
      ],
      b: 'not a list', c: [],
      hiphop: [{ url: 'https://soundcloud.com/h/1', title: 'h', dj: 'h', checked: 'search-result-only' }],
      stoop: [{ url: 'https://soundcloud.com/h/2', title: 'old', dj: 'u', checked: 'page-opened' }, { url: 'https://soundcloud.com/h/1', title: 'dup', dj: 'u', checked: 'page-opened' }],
    });
    expect(out.a.map((m) => m.url)).toEqual(['https://soundcloud.com/x/y']);
    expect(out.a[0].minutes).toBe(61);
    expect(out.b ?? []).toEqual([]);
    expect(out.hiphop.map((m) => m.url)).toEqual(['https://soundcloud.com/h/1', 'https://soundcloud.com/h/2']); // the old stoop key is folded in
    expect(out.stoop).toBeUndefined();
    expect(parseMixes(null)).toEqual({});
    expect(parseMix({ url: 'https://soundcloud.com/a/b' })?.checked).toBe('search-result-only');
  });
  it('the shipped file gives every station at least two usable mixes and hip hop at least seven by different DJs', () => {
    for (const id of ['bkhouse', 'dublab', 'sc', 'flashback', 'boogie', 'yard', 'latin', 'weird']) expect(mixesFor(id).length, id).toBeGreaterThanOrEqual(2);
    expect(mixesFor('hiphop').length).toBeGreaterThanOrEqual(7);
    expect(new Set(mixesFor('hiphop').map((m) => m.dj)).size).toBeGreaterThanOrEqual(7);
    for (const id of ['bkhouse', 'weird', 'hiphop']) expect(new Set(mixesFor(id).map((m) => m.url)).size).toBe(mixesFor(id).length);
  });
});

describe('a station with a curated pool', () => {
  it('plays all seven mixes before any repeats, in a shuffled order, and never repeats across the round edge', async () => {
    const { sc, widgets } = setup(pool7, seeded());
    sc.setActive(true);
    await tick();
    const first = sc.mixUrl;
    const seen = [first];
    for (let i = 0; i < 6; i++) { sc.next(); seen.push(sc.mixUrl); }
    expect(new Set(seen).size).toBe(7);
    expect(seen).not.toEqual(pool7.map((m) => m.url)); // not list order
    sc.next();
    expect(sc.mixUrl).not.toBe(seen[6]);
    expect(widgets[0].loads().length).toBeGreaterThanOrEqual(7);
    expect(pool7.map((m) => m.url)).toContain(sc.mixUrl);
  });
  it('different seeds start on different mixes', async () => {
    const starts = new Set<string>();
    for (let s = 1; s <= 12; s++) { const { sc } = setup(pool7, seeded(s * 97)); sc.setActive(true); await tick(); starts.add(sc.mixUrl); }
    expect(starts.size).toBeGreaterThan(2);
  });
  it('shows the title and DJ the SoundCloud page gives, and the link to the page', async () => {
    const { sc, widgets } = setup(pool7, seeded());
    expect(sc.isCurated).toBe(true);
    sc.setActive(true);
    await tick();
    widgets[0].emit('play');
    expect(sc.trackName).toBe('Page Title - Page DJ');
    expect(sc.nowPlaying).toEqual({ title: 'Page Title', user: 'Page DJ' });
    expect(sc.mixUrl).toMatch(/^https:\/\/soundcloud\.com\/dj\d\/mix\d$/);
  });
  it('starts a long mix somewhere in the middle, never in its last ten minutes, and a short one at the top', async () => {
    for (let s = 1; s <= 8; s++) {
      const { sc, widgets } = setup(pool7, seeded(s * 31));
      sc.setActive(true);
      await tick();
      widgets[0].emit('play');
      const seek = widgets[0].calls.find((c) => c[0] === 'seekTo');
      expect(seek, `seed ${s}`).toBeTruthy();
      expect(seek![1] as number).toBeLessThanOrEqual((3600 - 600) * 1000);
    }
    const short = setup([{ ...mix(1), minutes: 10 }, { ...mix(2), minutes: 10 }], seeded());
    short.widgets.length = 0;
    short.sc.setActive(true);
    await tick();
    short.widgets[0].durationMs = 600000;
    short.widgets[0].emit('play');
    expect(short.widgets[0].calls.some((c) => c[0] === 'seekTo')).toBe(false);
  });
  it('re-rolls on a tune-in after a real break but resumes the same mix after a quick flip', async () => {
    const { sc } = setup(pool7, seeded(3));
    sc.setActive(true);
    await tick();
    const a = sc.mixUrl;
    sc.setActive(false);
    sc.update(5);
    sc.setActive(true);
    expect(sc.mixUrl).toBe(a);
    sc.setActive(false);
    sc.update(SC_REROLL_AWAY_S + 1);
    sc.setActive(true);
    expect(sc.mixUrl).not.toBe(a);
  });
  it('moves to another mix when one ends', async () => {
    const { sc, widgets } = setup(pool7, seeded(5));
    sc.setActive(true);
    await tick();
    const a = sc.mixUrl;
    widgets[0].emit('finish');
    expect(sc.mixUrl).not.toBe(a);
  });
  it('skips a mix the widget cannot load and remembers it for the session', async () => {
    const { sc, widgets } = setup(pool7, seeded(11));
    sc.setActive(true);
    await tick();
    const bad = sc.mixUrl;
    widgets[0].emit('error');
    expect(sc.mixUrl).not.toBe(bad);
    expect(sc.badMixes).toContain(bad);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) { sc.next(); seen.add(sc.mixUrl); }
    expect(seen.has(bad)).toBe(false);
    expect(seen.size).toBe(6);
  });
  it('falls back to the account when every mix is bad', async () => {
    const { sc, widgets } = setup([mix(1), mix(2)], seeded(2));
    sc.setActive(true);
    await tick();
    widgets[0].emit('error');
    widgets[0].emit('error');
    expect(sc.mixUrl).toBe('https://soundcloud.com/acct/tracks');
  });
  it('with fewer than two usable mixes it plays the account as before', async () => {
    const { sc, widgets } = setup([mix(1)], seeded());
    expect(sc.isCurated).toBe(false);
    sc.setActive(true);
    await tick();
    expect(sc.mixUrl).toBe('https://soundcloud.com/acct/tracks');
    expect(widgets[0].frame.src).toContain(encodeURIComponent('https://soundcloud.com/acct/tracks'));
  });
});

describe('director wiring', () => {
  const mk = (extra: Record<string, unknown> = {}) => {
    const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    return new RadioDirector(new Library(), talk, undefined, undefined, { scEnv: { canLoad: () => false }, ...extra });
  };
  it('gives every SoundCloud station its pool from mixes.json (hip hop has seven or more)', () => {
    const dir = mk();
    expect(dir.scStation('hiphop')!.curatedCount).toBeGreaterThanOrEqual(7);
    expect(dir.scStation('weird')!.isCurated).toBe(true);
  });
  it('shuffleStart opens the dial on a random music or live station, never talk, and the remembered one is ignored', () => {
    const ids = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const d = mk({ shuffleStart: true, random: () => k / 20, lastStore: { get: () => 'wnyc', set: () => undefined } });
      expect(d.current.kind === 'talk' || d.current.info?.talk).toBeFalsy();
      ids.add(d.current.id);
    }
    expect(ids.size).toBeGreaterThan(5);
    expect(mk().current.id).toBe('bkhouse');
  });
});
