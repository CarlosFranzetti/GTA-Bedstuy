// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveStation, type AudioLike } from '@/audio/live/LiveStation';
import { ScStation, type ScApi } from '@/audio/sc/ScStation';
import { RadioDirector } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';
import { catalogEntry } from '@/audio/stations';

/**
 * AUDIOFIX: every way a radio station can sit silent. Mocked media elements and widgets; no network (real streams cannot be reached from the
 * test box). Each test names the case the owner could hit: "sometimes it wont play".
 */

class FakeAudio implements AudioLike {
  src = ''; volume = 1; paused = true; currentTime = 0; preload = '';
  plays = 0; mode: 'ok' | 'hang' | 'refuse' = 'ok';
  private h = new Map<string, Array<(e?: unknown) => void>>();
  play() {
    this.plays++;
    if (this.mode === 'refuse') return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    this.paused = false; // the element is trying: a stream that never answers sits here, not paused, never 'playing'
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  load() { /* nothing */ }
  removeAttribute() { this.src = ''; }
  addEventListener(t: string, fn: (e?: unknown) => void) { this.h.set(t, [...(this.h.get(t) ?? []), fn]); }
  removeEventListener() { /* unused */ }
  emit(t: string) { (this.h.get(t) ?? []).forEach((f) => f()); }
}

let clock = 0;
let audios: FakeAudio[] = [];
const last = () => audios[audios.length - 1];
const liveEnv = () => ({ createAudio: () => { const a = new FakeAudio(); audios.push(a); return a; }, now: () => clock, canLoad: () => true, doc: () => null, fetchJson: async () => ({}), tickMs: 1000 });
const advance = (ms: number) => { for (let t = 0; t < ms; t += 1000) { clock += 1000; vi.advanceTimersByTime(1000); } };
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
beforeEach(() => { clock = 0; audios = []; vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

describe('live stream that never answers', () => {
  it('is not mistaken for an autoplay block: no "Tap to start radio" while the element is trying, and it gives up for the next station', async () => {
    const s = new LiveStation(catalogEntry('kexp')!, liveEnv());
    const fail = vi.fn();
    s.onFail = fail;
    s.setActive(true);
    await flush();
    advance(6000); // past the 4 s silence check
    expect(s.playState, 'the element accepted play(): this is a slow stream, not a blocked one').not.toBe('blocked');
    expect(s.needsTap).toBe(false);
    advance(60000);
    expect(s.status).toBe('failed');
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('a real autoplay refusal still asks for a tap', async () => {
    const s = new LiveStation(catalogEntry('kexp')!, liveEnv());
    s.setActive(true);
    last().mode = 'refuse';
    s.userStart();
    await flush();
    expect(s.needsTap).toBe(true);
  });
  it('says what it is doing instead of sitting silent: connecting, then retrying', async () => {
    const s = new LiveStation(catalogEntry('kexp')!, liveEnv());
    s.setActive(true);
    await flush();
    expect(s.notice).toBe('');
    advance(4000);
    expect(s.notice).toMatch(/connecting/i);
    advance(12000);
    expect(s.notice).toMatch(/trying again/i);
  });
  it('a single-URL stream retries once, then fails (no minute-long silence)', async () => {
    const s = new LiveStation(catalogEntry('kexp')!, liveEnv());
    s.setActive(true);
    await flush();
    advance(40000);
    expect(s.status).toBe('failed');
    expect(s.connects).toBeLessThanOrEqual(2);
  });
});

describe('failure is reported once', () => {
  it('the error event that clearing the source raises is ignored (it used to re-run fail and fire onFail again)', () => {
    const s = new LiveStation(catalogEntry('kexp')!, liveEnv());
    const fail = vi.fn();
    s.onFail = fail;
    s.setActive(true);
    const a = last();
    a.emit('error'); a.emit('error'); // connection errors: retry, then give up
    expect(s.status).toBe('failed');
    a.src = ''; // dropConnection emptied the source; browsers raise an error for that
    for (let i = 0; i < 5; i++) a.emit('error');
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('late events from a station that is no longer tuned do nothing', () => {
    const s = new LiveStation(catalogEntry('kexp')!, liveEnv());
    s.setActive(true);
    const a = last();
    s.setActive(false);
    a.emit('playing');
    expect(s.status).toBe('idle');
    expect(s.playState).toBe('idle');
  });
});

/* ---------- SoundCloud ---------- */

class DeferredWidget {
  handlers = new Map<string, Array<(e?: unknown) => void>>();
  calls: string[] = [];
  pendingLoads: Array<{ cb?: () => void; autoPlay: boolean }> = [];
  bind(e: string, fn: (x?: unknown) => void) { const a = this.handlers.get(e) ?? []; a.push(fn); this.handlers.set(e, a); }
  emit(e: string, p?: unknown) { this.handlers.get(e)?.forEach((f) => f(p)); }
  load(_url: string, o?: { callback?: () => void; auto_play?: boolean }) { this.calls.push('load'); this.pendingLoads.push({ cb: o?.callback, autoPlay: !!o?.auto_play }); }
  /** the player finishes loading: it starts by itself when asked to, then calls back */
  finishLoad() { const l = this.pendingLoads.shift()!; if (l.autoPlay) this.calls.push('autoplay'); l.cb?.(); }
  play() { this.calls.push('play'); } pause() { this.calls.push('pause'); } setVolume() { /* */ } seekTo() { /* */ } next() { /* */ } prev() { /* */ }
  getCurrentSound(cb: (s: unknown) => void) { cb({ title: 'T', user: { username: 'U' } }); }
  getDuration(cb: (ms: number) => void) { cb(600000); }
}
const scApi = (w: DeferredWidget) => ({ Widget: Object.assign(() => { queueMicrotask(() => w.emit('ready')); return w; }, { Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress' } }) }) as unknown as ScApi;

describe('SoundCloud late callbacks', () => {
  it('a load that completes after the station was tuned away does not start playing under the new station', async () => {
    const w = new DeferredWidget();
    const sc = new ScStation({ loadApi: async () => scApi(w), canLoad: () => true, hour: () => 12, feed: null, storage: { load: () => [{ url: 'https://soundcloud.com/a/one' }, { url: 'https://soundcloud.com/b/two' }], save: () => undefined } });
    sc.setActive(true);
    await flush();
    sc.next(); // asks the widget to load the second mix and play it
    expect(w.pendingLoads.length).toBe(1);
    sc.setActive(false); // the listener tunes away (or leaves the car) before it has finished
    w.calls.length = 0;
    w.finishLoad();
    const lastCall = w.calls.filter((c) => c === 'play' || c === 'autoplay' || c === 'pause').at(-1);
    expect(lastCall, 'the widget must end up paused').toBe('pause');
  });
  it('restart() brings a station that never got going up again, and the first attempt cannot take over later', async () => {
    const widgets: DeferredWidget[] = [];
    let resolveFirst: ((api: ScApi) => void) | null = null;
    let calls = 0;
    const loadApi = () => { calls++; if (calls === 1) return new Promise<ScApi>((r) => { resolveFirst = r; }); const w = new DeferredWidget(); widgets.push(w); return Promise.resolve(scApi(w)); };
    const sc = new ScStation({ loadApi, canLoad: () => true, hour: () => 12, feed: null, storage: { load: () => [{ url: 'https://soundcloud.com/a/one' }], save: () => undefined } });
    sc.setActive(true);
    expect(sc.status).toBe('loading');
    sc.restart();
    await flush();
    expect(widgets.length).toBe(1);
    expect(sc.status).toBe('ready');
    const w1 = new DeferredWidget(); widgets.push(w1);
    resolveFirst!(scApi(w1)); // the first attempt finally answers
    await flush();
    expect(document.querySelectorAll('iframe').length, 'one player, not two').toBe(1);
  });
});

/* ---------- the director ---------- */

function mk(over: Record<string, unknown> = {}) {
  const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
  return new RadioDirector(new Library(), talk, undefined, undefined, { feed: undefined, scEnv: { canLoad: () => true, loadApi: () => new Promise(() => undefined), timeoutMs: 600000 }, liveEnv: liveEnv(), ...over });
}

describe('director start watchdog', () => {
  it('a SoundCloud station whose player never comes up is retried once, said so, then the dial moves on', () => {
    const dir = mk();
    const toasts: string[] = [];
    dir.onToast = (m) => toasts.push(m);
    dir.setOn(true);
    expect(dir.current.kind).toBe('sc');
    const first = dir.current.id;
    for (let i = 0; i < 25 * 4; i++) dir.update(0.25);
    expect(toasts.some((m) => /slow|again/i.test(m)), `toasts: ${toasts.join(' | ')}`).toBe(true);
    expect(dir.current.id).toBe(first);
    for (let i = 0; i < 30 * 4; i++) dir.update(0.25);
    expect(dir.current.id, 'tuned on after it never answered').not.toBe(first);
    expect(toasts.at(-1)).toMatch(/Tuning to/);
  });
  it('time spent paused does not count against a station', () => {
    const dir = mk();
    dir.setOn(true);
    const first = dir.current.id;
    dir.setPaused(true);
    for (let i = 0; i < 120 * 4; i++) dir.update(0.25);
    expect(dir.current.id).toBe(first);
  });
  it('a station waiting for a tap is left alone (the tap fixes it)', async () => {
    const dir = mk({ feed: null });
    dir.setOn(true);
    dir.selectById('kexp');
    last().mode = 'refuse';
    dir.userStart();
    await flush();
    expect(dir.needsTap).toBe(true);
    for (let i = 0; i < 120 * 4; i++) dir.update(0.25);
    expect(dir.current.id).toBe('kexp');
  });
  it('a quick switch: the old station failing late does not stop the new one', () => {
    const dir = mk({ feed: null });
    dir.setOn(true);
    dir.selectById('kexp');
    const kexpAudio = last();
    dir.selectById('wfmu');
    const wfmuAudio = last();
    kexpAudio.emit('error'); kexpAudio.emit('error'); kexpAudio.emit('error'); // late errors from the connection dropped by the switch
    expect(dir.current.id).toBe('wfmu');
    expect(wfmuAudio.src).not.toBe('');
  });
});
