import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '@/audio/AudioSystem';
import { HtmlAudioDeck, silentWavDataUri } from '@/audio/decks';
import { EventBus } from '@/core/Events';
import { Library } from '@/audio/library/Library';
import type { TalkSegment } from '@/audio/talk/script';

/* ---------- fakes ---------- */

class FakeParam {
  value = 0;
  calls: Array<{ m: string; a: number[] }> = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ m: 'set', a: [v, t] }); }
  linearRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ m: 'lin', a: [v, t] }); }
  exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ m: 'exp', a: [v, t] }); }
  setTargetAtTime(v: number, t: number, tc: number) { this.value = v; this.calls.push({ m: 'target', a: [v, t, tc] }); }
  cancelScheduledValues() { this.calls.push({ m: 'cancel', a: [] }); }
}
class FakeNode {
  connections: unknown[] = [];
  connect(d: unknown) { this.connections.push(d); return d; }
  disconnect() {}
  start() {}
  stop() {}
}
class FakeOsc extends FakeNode { type = 'sine'; frequency = new FakeParam(); detune = new FakeParam(); }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = 'lowpass'; frequency = new FakeParam(); Q = new FakeParam(); }
class FakeSrc extends FakeNode { buffer: unknown = null; loop = false; }

function makeCtx() {
  const created = { osc: [] as FakeOsc[], gain: [] as FakeGain[], sources: [] as FakeSrc[], media: [] as unknown[] };
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'suspended', destination: new FakeNode(),
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    suspend: vi.fn(async () => { ctx.state = 'suspended'; }),
    createOscillator() { const n = new FakeOsc(); created.osc.push(n); return n; },
    createGain() { const n = new FakeGain(); created.gain.push(n); return n; },
    createBiquadFilter() { return new FakeFilter(); },
    createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() { const n = new FakeSrc(); created.sources.push(n); return n; },
    createMediaElementSource(el: unknown) { created.media.push(el); return new FakeNode(); },
  };
  return { ctx, created };
}

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  preload = '';
  readyState = 0;
  currentTime = 0;
  duration = 200;
  paused = true;
  plays = 0;
  attrs = new Map<string, string>();
  constructor() { super(); FakeAudio.instances.push(this); }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); if (k === 'src') this.src = v; }
  getAttribute(k: string) { return k === 'src' ? (this.src || null) : this.attrs.get(k) ?? null; }
  removeAttribute(k: string) { if (k === 'src') this.src = ''; this.attrs.delete(k); }
  load() { this.readyState = 0; queueMicrotask(() => { if (this.src && !this.src.startsWith('data:')) { this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')); } }); }
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
}
// `el.src = x` should count as the src attribute
Object.defineProperty(FakeAudio.prototype, 'src', {
  get() { return this._src ?? ''; },
  set(v: string) { this._src = v; },
  configurable: true,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { FakeAudio.instances = []; vi.stubGlobal('Audio', FakeAudio); });
afterEach(() => { vi.unstubAllGlobals(); });

const trackItem = (path: string, duration = 200) => ({ path, size: path.length * 10, lastModified: 3, duration, url: `blob:${path}` });

function rig(script: TalkSegment[] = []) {
  const events = new EventBus();
  const { ctx, created } = makeCtx();
  const library = new Library();
  const audio = new AudioSystem(events, () => ctx as unknown as AudioContext, { library, speech: null, script, feed: null, scEnv: { canLoad: () => false }, controller: { handles: { get: async () => null, put: async () => undefined, clear: async () => undefined } } });
  return { events, audio, ctx, created, library };
}

describe('HtmlAudioDeck', () => {
  it('routes an audio element into the destination through a fade gain and plays from an offset', async () => {
    const { ctx, created } = makeCtx();
    const dest = new FakeNode();
    const deck = new HtmlAudioDeck(ctx as unknown as AudioContext, dest as unknown as AudioNode, () => new FakeAudio() as unknown as HTMLAudioElement);
    expect(created.media).toHaveLength(1);
    const el = FakeAudio.instances[0];
    deck.load('blob:x', 42);
    await flush();
    expect(el.src).toBe('blob:x');
    expect(el.currentTime).toBe(42);
    expect(el.plays).toBe(1);
    expect(created.gain.at(-1)!.connections).toContain(dest);
  });

  it('reports end and error, fades with a linear ramp, and pauses/resumes', async () => {
    const { ctx, created } = makeCtx();
    const deck = new HtmlAudioDeck(ctx as unknown as AudioContext, new FakeNode() as unknown as AudioNode, () => new FakeAudio() as unknown as HTMLAudioElement);
    const el = FakeAudio.instances[0];
    const ended = vi.fn(); const failed = vi.fn(); const dur = vi.fn();
    deck.onEnded = ended; deck.onError = failed; deck.onDuration = dur;
    deck.load('blob:x', 0);
    await flush();
    expect(dur).toHaveBeenCalledWith(200);
    deck.fadeTo(1, 0.5);
    const g = created.gain.at(-1)!.gain;
    expect(g.calls.at(-1)).toEqual({ m: 'lin', a: [1, 0.5] });
    deck.pause();
    expect(el.paused).toBe(true);
    deck.resume();
    expect(el.paused).toBe(false);
    el.dispatchEvent(new Event('ended'));
    expect(ended).toHaveBeenCalled();
    deck.load('blob:y', 0);
    el.dispatchEvent(new Event('error'));
    expect(failed).toHaveBeenCalled();
  });

  it('unlock() plays a silent clip once so iOS allows later programmatic play', async () => {
    const { ctx } = makeCtx();
    const deck = new HtmlAudioDeck(ctx as unknown as AudioContext, new FakeNode() as unknown as AudioNode, () => new FakeAudio() as unknown as HTMLAudioElement);
    const el = FakeAudio.instances[0];
    deck.unlock();
    await flush();
    expect(el.plays).toBe(1);
    expect(el.paused).toBe(true);
    expect(silentWavDataUri().startsWith('data:audio/wav;base64,UklGR')).toBe(true);
  });
});

describe('AudioSystem with the music library', () => {
  it('creates no media elements before the first gesture', () => {
    const { audio } = rig();
    audio.update(1);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('builds two decks inside start() (the gesture) and unlocks them', async () => {
    const { audio, created } = rig();
    await audio.start();
    expect(FakeAudio.instances).toHaveLength(2);
    expect(created.media).toHaveLength(2);
    await flush();
    expect(FakeAudio.instances.every((a) => a.plays >= 1)).toBe(true);
  });

  it('plays the user file on My Library once in a car, and exposes the track name for the HUD', async () => {
    const { audio, events, library } = rig();
    library.addTracks([trackItem('Music/Pop/My Song.mp3')]);
    await audio.start();
    events.emit('enterVehicle', { vehicleId: 'v' });
    audio.radio.select(audio.radio.stations.length - 1); // -> My Library, the last station
    audio.update(0.1);
    await flush();
    expect(audio.stationName).toBe('My Library');
    expect(audio.trackName).toBe('My Song');
    const el = FakeAudio.instances.find((a) => a.src === 'blob:Music/Pop/My Song.mp3')!;
    expect(el).toBeDefined();
    expect(el.paused).toBe(false);
    audio.pause('menu');
    expect(el.paused).toBe(true);
    audio.resume('menu');
    expect(el.paused).toBe(false);
  });

  it('synthesizes nothing on a SoundCloud station that cannot load (no nodes, no media element plays)', async () => {
    const { audio, events, created } = rig();
    await audio.start();
    await flush();
    const plays = FakeAudio.instances.map((a) => a.plays);
    events.emit('enterVehicle', { vehicleId: 'v' });
    const before = created.osc.length + created.sources.length;
    audio.update(0.5);
    expect(created.osc.length + created.sources.length).toBe(before);
    expect(FakeAudio.instances.map((a) => a.plays)).toEqual(plays);
    expect(audio.trackName).toContain('No sets yet'); // the empty-station hint
  });

  it('does not run the synth sequencer while a real file is playing', async () => {
    const { audio, events, library, created } = rig();
    library.addTracks([trackItem('Pop/a.mp3', 600)]);
    await audio.start();
    events.emit('enterVehicle', { vehicleId: 'v' });
    audio.radio.select(audio.radio.stations.length - 1);
    audio.update(0.1);
    const before = created.osc.length + created.sources.length;
    audio.update(0.5);
    expect(created.osc.length + created.sources.length).toBe(before);
  });

  it('WBSY Talk without SpeechSynthesis: notice name, bed oscillators, no throw', async () => {
    const { audio, events, created } = rig([{ id: 'a', kind: 'host', speaker: 'Host', voice: 'host', text: 'Hello there.', seconds: 5 }]);
    await audio.start();
    events.emit('enterVehicle', { vehicleId: 'v' });
    const before = created.osc.length;
    audio.selectRadioStation('talk');
    expect(audio.stationName).toBe('WBSY Talk (voice unavailable on this device)');
    for (let i = 0; i < 20; i++) audio.update(0.5);
    expect(created.osc.length).toBeGreaterThan(before); // bed + stings
    expect(audio.talkProgress).toBeGreaterThanOrEqual(0);
  });

  it('plays the station jingle when tuning a music station in a car', async () => {
    const { audio, events, created } = rig();
    await audio.start();
    events.emit('enterVehicle', { vehicleId: 'v' });
    const before = created.osc.length;
    audio.nextStation();
    expect(created.osc.length).toBeGreaterThan(before);
  });

  it('exposes the eight SoundCloud stations and takes the announcers\' hour and weather', async () => {
    const { audio } = rig();
    expect(audio.scStations.map((s) => s.id)).toEqual(['bkhouse', 'dublab', 'stoop', 'boogie', 'weird', 'yard', 'flashback', 'sc']);
    expect(audio.sc).toBe(audio.scStations[7]);
    expect(() => audio.setBroadcast({ weather: 'rain', rain: 0.5, hour: 1.25, street: 'Throop Ave' })).not.toThrow();
    expect(audio.announcerLine).toBe('');
  });

  it('is safe to dispose', async () => {
    const { audio } = rig();
    await audio.start();
    expect(() => audio.dispose()).not.toThrow();
  });
});
