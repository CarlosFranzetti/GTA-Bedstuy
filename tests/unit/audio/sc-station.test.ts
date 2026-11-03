// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScStation, normalizeScUrl, widgetSrc, localScStorage, inPreferredHours, SC_FAILED_NAME, SC_EMPTY_HINT, SC_STORAGE_KEY, type ScApi, type ScEnv, type ScMix } from '@/audio/sc/ScStation';
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
  const sc = new ScStation({ loadApi, canLoad: () => true, hour: () => 12, storage: { load: () => saved.data, save: (m) => { saved.data = m; } }, ...over });
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
    dir.select(dir.stations.findIndex((s) => s.kind === 'sc'));
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
  it('puts Radio SC right after WBSY Talk, at the end of the dial', () => {
    const dir = new RadioDirector(new Library(null), new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []), undefined, setup().sc);
    const names = dir.stations.map((s) => s.name);
    expect(names.slice(-2)).toEqual(['WBSY Talk', 'Radio SC']);
    expect(dir.stations.at(-1)!.kind).toBe('sc');
  });
});
