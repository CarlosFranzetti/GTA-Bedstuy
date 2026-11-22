// @vitest-environment jsdom
// RADIO3: live genre stations with a pool of public streams, and the second scripted talk station.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveStation, LIVE_ROTATE_MS } from '@/audio/live/LiveStation';
import { CATALOG, catalogEntry } from '@/audio/stations';
import { TalkPlayer } from '@/audio/talk/TalkPlayer';
import { parseScript, type TalkSegment } from '@/audio/talk/script';
import { RadioDirector } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';

class FakeAudio {
  src = ''; volume = 1; paused = true; currentTime = 0; preload = ''; plays = 0;
  h = new Map<string, Array<() => void>>();
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { /* */ }
  removeAttribute() { this.src = ''; }
  addEventListener(t: string, fn: () => void) { this.h.set(t, [...(this.h.get(t) ?? []), fn]); }
  removeEventListener() { /* */ }
  emit(t: string) { (this.h.get(t) ?? []).forEach((f) => f()); }
}
let clock = 0;
let audio: FakeAudio;
const mkEnv = (random: () => number) => ({ createAudio: () => (audio = new FakeAudio()), now: () => clock, canLoad: () => true, doc: () => null, fetchJson: async () => ({}), tickMs: 1000, random });
const advance = (ms: number) => { for (let t = 0; t < ms; t += 1000) { clock += 1000; vi.advanceTimersByTime(1000); } };
beforeEach(() => { clock = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('live pools in the catalogue', () => {
  it('every pool stream is https, every pool has two to four streams, and the 181.FM hip hop stream is its own station', () => {
    for (const e of CATALOG.filter((x) => x.pool)) {
      expect(e.pool!.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.pool!.length, e.id).toBeLessThanOrEqual(4);
      expect(new Set(e.pool!.map((x) => x.id)).size).toBe(e.pool!.length);
      for (const p of e.pool!) { expect(p.site).toMatch(/^https:\/\//); for (const u of p.streams) expect(u).toMatch(/^https:\/\//); }
    }
    expect(catalogEntry('beat')!.streams![0]).toBe('https://listen.181fm.com/181-beat_128k.mp3');
  });
});

describe('LiveStation with a pool', () => {
  const rock = catalogEntry('kexp')!;
  it('picks a random stream on each tune-in, not the one that played last, and shows which one is on', () => {
    let r = 0;
    const s = new LiveStation(rock, mkEnv(() => r));
    s.setActive(true);
    const first = s.sourceName;
    expect(audio.src).toBe(rock.pool![0].streams[0]);
    expect(s.trackName).toBe(first);
    s.setActive(false);
    r = 0; // would pick the same one again: it must not
    s.setActive(true);
    expect(s.sourceName).not.toBe(first);
    const names = new Set<string>();
    for (let k = 0; k < 12; k++) { r = (k % 4) / 4 + 0.01; s.setActive(false); s.setActive(true); names.add(s.sourceName); }
    expect(names.size).toBe(4);
  });
  it('moves to the next stream of the pool when one is dead, and fails only when all are', () => {
    const s = new LiveStation(rock, mkEnv(() => 0));
    const fail = vi.fn();
    const moved: string[] = [];
    s.onFail = fail;
    s.onSource = (n) => moved.push(n);
    s.setActive(true);
    for (let i = 0; i < 20 && s.status !== 'failed'; i++) audio.emit('error');
    expect(moved).toHaveLength(3);
    expect(new Set(moved).size).toBe(3);
    expect(s.status).toBe('failed');
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('rotates to another stream now and then while playing', () => {
    const s = new LiveStation(rock, mkEnv(() => 0));
    const moved: string[] = [];
    s.onSource = (n) => moved.push(n);
    s.setActive(true);
    const first = s.sourceName;
    audio.emit('playing');
    for (let t = 0; t < LIVE_ROTATE_MS; t += 5000) { clock += 5000; vi.advanceTimersByTime(5000); audio.currentTime += 5; audio.emit('timeupdate'); }
    advance(1000);
    expect(moved.length).toBeGreaterThanOrEqual(1);
    expect(s.sourceName).not.toBe(first);
  });
});

describe('two scripted talk stations', () => {
  const seg = (id: string, text: string, seconds = 10): TalkSegment => ({ id, kind: 'host', speaker: 'Host', voice: 'host', text, seconds });
  const script = (n: number) => parseScript(Array.from({ length: n }, (_, i) => ({ id: `s${i}`, kind: 'host', speaker: 'Host', voice: 'host', text: `Line ${i}.`, seconds: 10 })));
  const audioEnv = () => ({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } });

  it('a second player has its own name and joins the show mid-way on first tune, then keeps its place', () => {
    const chat = new TalkPlayer(audioEnv(), script(20), { name: 'The Group Chat 99.9', random: () => 0.5 });
    expect(chat.stationName).toBe('The Group Chat 99.9 (voice unavailable on this device)');
    chat.setActive(true);
    expect(chat.progress.segment).toBe(10);
    chat.update(3);
    chat.setActive(false);
    chat.update(40);
    chat.setActive(true);
    expect(chat.progress.segment).toBeGreaterThanOrEqual(10); // never jumps back to the top
    const plain = new TalkPlayer(audioEnv(), script(20));
    plain.setActive(true);
    expect(plain.progress.segment).toBe(0);
  });
  it('the director runs both: each keeps its own place, only the tuned one is active', () => {
    const wbsy = new TalkPlayer(audioEnv(), script(8));
    const chat = new TalkPlayer(audioEnv(), script(8), { name: 'The Group Chat 99.9', random: () => 0.75 });
    const dir = new RadioDirector(new Library(), wbsy, undefined, undefined, { feed: null, talk2: chat, scEnv: { canLoad: () => false }, liveEnv: mkEnv(() => 0) });
    expect(dir.stations.map((s) => s.id)).toContain('groupchat');
    dir.setOn(true);
    dir.selectById('groupchat');
    expect(wbsy.isActive).toBe(false);
    expect(chat.isActive).toBe(true);
    expect(dir.stationName).toMatch(/Group Chat/);
    expect(dir.current.badge).toBe('TALK');
    const at = chat.progress.segment;
    dir.update(2);
    dir.selectById('talk');
    expect(wbsy.isActive).toBe(true);
    expect(chat.isActive).toBe(false);
    expect(dir.stationName).toMatch(/WBSY Talk/);
    dir.selectById('groupchat');
    expect(chat.progress.segment).toBeGreaterThanOrEqual(at);
  });
  it('without a second talk player the Group Chat is not on the dial', () => {
    const dir = new RadioDirector(new Library(), new TalkPlayer(audioEnv(), []), undefined, undefined, { feed: null, scEnv: { canLoad: () => false } });
    expect(dir.stations.map((s) => s.id)).not.toContain('groupchat');
  });
  it('the shipped Group Chat script parses in the talk schema', async () => {
    const raw = (await import('@/audio/talk/script-groupchat.json')).default;
    const segs = parseScript(raw);
    expect(segs.length).toBeGreaterThan(50);
    expect(seg('a', 'b').seconds).toBe(10);
  });
});
