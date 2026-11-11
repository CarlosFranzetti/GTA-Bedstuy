// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveStation, parseNowPlaying, LIVE_MAX_RECONNECTS, LIVE_RETRY_MS, type AudioLike } from '@/audio/live/LiveStation';
import { RadioDirector, localLastStation } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';
import { CATALOG, catalogEntry, SOURCE_BADGE } from '@/audio/stations';

class FakeAudio implements AudioLike {
  src = ''; volume = 1; paused = true; currentTime = 0; preload = '';
  plays = 0; loads = 0; rejectPlay: string | null = null;
  private h = new Map<string, Array<(e?: unknown) => void>>();
  play() {
    this.plays++;
    if (this.rejectPlay) return Promise.reject(Object.assign(new Error('x'), { name: this.rejectPlay }));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute() { this.src = ''; }
  addEventListener(t: string, fn: (e?: unknown) => void) { this.h.set(t, [...(this.h.get(t) ?? []), fn]); }
  removeEventListener() { /* unused */ }
  emit(t: string) { (this.h.get(t) ?? []).forEach((f) => f()); }
}

const kexp = catalogEntry('kexp')!;
let clock = 0;
let audio: FakeAudio;
const env = () => ({ createAudio: () => (audio = new FakeAudio()), now: () => clock, canLoad: () => true, doc: () => null, fetchJson: async () => ({ results: [{ artist: 'Interpol', song: 'Evil' }] }), tickMs: 1000 });
const advance = (ms: number) => { for (let t = 0; t < ms; t += 1000) { clock += 1000; vi.advanceTimersByTime(1000); } };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => { clock = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('catalog', () => {
  it('has 15 stations: 9 SoundCloud/RA, 4 live music, 2 talk, one 80s, https only, unique ids', () => {
    expect(CATALOG).toHaveLength(15);
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(15);
    expect(CATALOG.filter((e) => e.talk).map((e) => e.id)).toEqual(['talk', 'wnyc']);
    expect(CATALOG.filter((e) => e.group === '80s')).toHaveLength(1);
    for (const e of CATALOG) {
      for (const u of [...(e.streams ?? []), ...(e.scUrls ?? [])]) expect(u.startsWith('https://')).toBe(true);
      expect(SOURCE_BADGE[e.kind]).toBeTruthy();
      if (e.kind !== 'scripted') expect(e.site).toMatch(/^https:\/\//);
      if (e.kind === 'live-stream') expect(e.streams!.length).toBeGreaterThan(0);
    }
  });
});

describe('LiveStation', () => {
  it('connects lazily, plays inside tune-in, reports playing, applies volume and duck', async () => {
    const s = new LiveStation(kexp, env());
    expect(s.status).toBe('idle');
    s.setVolume(0.8);
    s.setActive(true);
    await flush();
    expect(audio.src).toBe(kexp.streams![0]);
    expect(audio.plays).toBe(1);
    audio.emit('playing');
    expect(s.status).toBe('playing');
    expect(audio.volume).toBeCloseTo(0.8);
    s.setDuck(0.25);
    expect(audio.volume).toBeCloseTo(0.2);
    await flush();
    expect(s.trackName).toBe('Interpol - Evil');
  });

  it('drops the connection when tuned away and reconnects at the live edge when tuned back', () => {
    const s = new LiveStation(kexp, env());
    s.setActive(true);
    audio.emit('playing');
    s.setActive(false);
    expect(audio.src).toBe('');
    expect(audio.paused).toBe(true);
    s.setActive(true);
    expect(audio.src).toBe(kexp.streams![0]);
    expect(s.connects).toBe(2);
  });

  it('pauses with the game and reconnects on resume', () => {
    const s = new LiveStation(kexp, env());
    s.setActive(true);
    audio.emit('playing');
    s.setPaused(true);
    expect(audio.paused).toBe(true);
    const before = s.connects;
    s.setPaused(false);
    expect(s.connects).toBe(before + 1);
  });

  it('stall watchdog: no progress for 12 s while playing reconnects (and cycles to the alternate stream URL)', () => {
    const live = catalogEntry('u80s')!;
    const s = new LiveStation(live, env());
    s.setActive(true);
    audio.emit('playing');
    audio.currentTime = 5; audio.emit('timeupdate');
    advance(8000);
    expect(s.connects).toBe(1);
    advance(6000);
    expect(s.connects).toBe(2);
    expect(audio.src).toBe(live.streams![1]); // SomaFM mirror 2
    // progress resets the clock
    audio.emit('playing');
    audio.currentTime = 6; audio.emit('timeupdate');
    advance(8000);
    expect(s.connects).toBe(2);
  });

  it('gives up after repeated failures, reports onFail once, and retries only after the cool-down', () => {
    const s = new LiveStation(kexp, env());
    const fail = vi.fn();
    s.onFail = fail;
    s.setActive(true);
    for (let i = 0; i < LIVE_MAX_RECONNECTS + 1; i++) audio.emit('error');
    expect(s.status).toBe('failed');
    expect(fail).toHaveBeenCalledTimes(1);
    expect(s.notice).toMatch(/No stream/);
    s.setActive(false);
    s.setActive(true);
    expect(s.status).toBe('failed'); // too soon
    clock += LIVE_RETRY_MS + 1;
    s.setActive(false);
    s.setActive(true);
    expect(s.status).toBe('connecting');
  });

  it('autoplay blocked: needsTap, then userStart plays', async () => {
    const s = new LiveStation(kexp, env());
    s.setActive(true);
    audio.rejectPlay = null;
    const a = audio;
    a.rejectPlay = 'NotAllowedError';
    s.userStart();
    await flush();
    expect(s.playState).toBe('blocked');
    expect(s.needsTap).toBe(true);
    a.rejectPlay = null;
    s.userStart();
    await flush();
    a.emit('playing');
    expect(s.playState).toBe('playing');
    expect(s.needsTap).toBe(false);
  });

  it('parses now-playing JSON for KEXP and SomaFM and survives garbage', () => {
    expect(parseNowPlaying({ url: '', shape: 'kexp' }, { results: [{ artist: 'A', song: 'B' }] })).toBe('A - B');
    expect(parseNowPlaying({ url: '', shape: 'somafm', channel: 'u80s' }, { channels: [{ id: 'u80s', lastPlaying: 'X - Y' }] })).toBe('X - Y');
    expect(parseNowPlaying({ url: '', shape: 'kexp' }, null)).toBe('');
  });

  it('offline: fails without touching the network', () => {
    const s = new LiveStation(kexp, { ...env(), canLoad: () => false });
    s.setActive(true);
    expect(s.status).toBe('failed');
  });
});

describe('RadioDirector with live stations', () => {
  const mk = (extra: Record<string, unknown> = {}) => {
    const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    return new RadioDirector(new Library(), talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => true, loadApi: () => new Promise(() => undefined) }, liveEnv: env(), ...extra });
  };

  it('tunes a live station by id: only that stream connects, tune-out disconnects, volume and duck reach it', () => {
    const dir = mk();
    dir.setOn(true);
    dir.selectById('kexp');
    expect(dir.current.kind).toBe('live');
    expect(dir.current.badge).toBe('LIVE');
    expect(audio.src).toBe(kexp.streams![0]);
    expect(dir.stationName).toBe('KEXP 90.3');
    dir.setScVolume(0.5);
    expect(audio.volume).toBeCloseTo(0.5);
    const a = audio;
    dir.selectById('u80s');
    expect(a.src).toBe('');
    expect(dir.stationName).toBe('SomaFM Underground 80s');
  });

  it('pauses the live stream with the game', () => {
    const dir = mk();
    dir.setOn(true);
    dir.selectById('kexp');
    dir.setPaused(true);
    expect(audio.paused).toBe(true);
  });

  it('a live station that fails tunes to the next one with a toast, skipping failed ones, then stops when all failed', () => {
    const toasts: string[] = [];
    const dir = mk();
    dir.onToast = (m) => toasts.push(m);
    dir.setOn(true);
    dir.selectById('kexp');
    for (let i = 0; i < LIVE_MAX_RECONNECTS + 1; i++) audio.emit('error');
    expect(dir.current.id).toBe('u80s');
    expect(toasts[0]).toMatch(/KEXP 90.3 is off the air. Tuning to SomaFM Underground 80s/);
    expect(dir.trackName).toMatch(/off the air/);
    expect(dir.isFailed('kexp')).toBe(true);
    // every live station fails in turn; the dial walks on and ends on a station with a message, not a loop
    for (let k = 0; k < 20 && dir.current.kind === 'live'; k++) for (let i = 0; i < LIVE_MAX_RECONNECTS + 1; i++) audio.emit('error');
    expect(toasts.length).toBeLessThan(20);
  });

  it('an offline SoundCloud station that failed to load moves on with a toast', () => {
    const dir = mk({ feed: undefined, scEnv: { canLoad: () => false } });
    const toasts: string[] = [];
    dir.onToast = (m) => toasts.push(m);
    dir.setOn(true);
    dir.update(0.1);
    expect(toasts[0]).toMatch(/Boiler Room is off the air/);
    expect(dir.current.id).not.toBe('bkhouse');
  });

  it('remembers the last station across sessions', () => {
    const mem = new Map<string, string>();
    const store = { get: () => mem.get('k') ?? null, set: (id: string) => { mem.set('k', id); } };
    const a = mk({ lastStore: store });
    a.selectById('wfmu');
    const b = mk({ lastStore: store });
    expect(b.current.id).toBe('wfmu');
    // unknown saved ids fall back to the first station
    mem.set('k', 'gone');
    expect(mk({ lastStore: store }).current.id).toBe('bkhouse');
  });

  it('localLastStation survives a blocked localStorage', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    const st = localLastStation('x');
    expect(st.get()).toBeNull();
    expect(() => st.set('a')).not.toThrow();
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig); else delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('needsTap/userStart route to the tuned live station', async () => {
    const dir = mk();
    dir.setOn(true);
    dir.selectById('kexp');
    const a = audio;
    a.rejectPlay = 'NotAllowedError';
    dir.userStart();
    await flush();
    expect(dir.needsTap).toBe(true);
    a.rejectPlay = null;
    dir.userStart();
    await flush();
    a.emit('playing');
    expect(dir.needsTap).toBe(false);
  });
});

describe('SoundCloud source rule (account loaded in the widget, random set)', () => {
  it('skips a freshly loaded account to a random 45-minute-plus unheard set', async () => {
    const { ScStation } = await import('@/audio/sc/ScStation');
    const sounds = [{ duration: 20 * 60000 }, { duration: 60 * 60000 }, { duration: 90 * 60000 }, { duration: 50 * 60000 }];
    const skips: number[] = [];
    const ev: Record<string, () => void> = {};
    const widget = {
      bind: (e: string, fn: () => void) => { ev[e] = fn; if (e === 'ready') setTimeout(fn, 0); },
      load: () => undefined, play: () => undefined, pause: () => undefined, setVolume: () => undefined, seekTo: () => undefined, next: () => undefined, prev: () => undefined,
      getCurrentSound: (cb: (s: unknown) => void) => cb({ title: 'T', user: { username: 'U' } }),
      getDuration: (cb: (n: number) => void) => cb(3600000),
      getSounds: (cb: (s: unknown[]) => void) => cb(sounds),
      skip: (i: number) => { skips.push(i); },
    };
    vi.useRealTimers();
    const doc = document.implementation.createHTMLDocument('x');
    const st = new ScStation({
      doc: () => doc, canLoad: () => true, feed: null, storage: null, random: () => 0,
      loadApi: async () => ({ Widget: Object.assign(() => widget, { Events: { READY: 'ready', PLAY_PROGRESS: 'pp', PLAY: 'play', ERROR: 'error', FINISH: 'finish' } }) }) as never,
      config: { id: 'x', name: 'X', match: null, storageKey: 'k', sources: ['https://soundcloud.com/acct/tracks'], randomStart: true },
    });
    st.setActive(true);
    await vi.waitFor(() => expect(skips.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(skips).toEqual([1]); // first of the >= 45 min sounds (index 0 is 20 min)
    expect(st.mixes[0]).toMatchObject({ url: 'https://soundcloud.com/acct/tracks', builtin: true });
    st.removeMix(0);
    expect(st.mixes).toHaveLength(1); // catalog source cannot be removed
    st.dispose();
  });
});
