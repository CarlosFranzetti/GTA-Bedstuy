import { describe, it, expect, vi } from 'vitest';
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import { engineFrequency, hornFrequencies } from '@/audio/synth';

/* ---------- fake Web Audio ---------- */

interface Call { method: string; args: unknown[] }

class FakeParam {
  value = 0;
  calls: Call[] = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ method: 'setValueAtTime', args: [v, t] }); }
  linearRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ method: 'linearRampToValueAtTime', args: [v, t] }); }
  exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ method: 'exponentialRampToValueAtTime', args: [v, t] }); }
  setTargetAtTime(v: number, t: number, tc: number) { this.value = v; this.calls.push({ method: 'setTargetAtTime', args: [v, t, tc] }); }
  cancelScheduledValues(t: number) { this.calls.push({ method: 'cancelScheduledValues', args: [t] }); }
  lastTarget(): number | undefined {
    const c = this.calls.filter((x) => x.method === 'setTargetAtTime').at(-1);
    return c ? (c.args[0] as number) : undefined;
  }
}

class FakeNode {
  connections: unknown[] = [];
  started: number[] = [];
  stopped: number[] = [];
  connect(dest: unknown) { this.connections.push(dest); return dest; }
  disconnect() {}
  start(t?: number) { this.started.push(t ?? 0); }
  stop(t?: number) { this.stopped.push(t ?? 0); }
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
}

class FakeBuffer {
  data: Float32Array;
  constructor(public length: number) { this.data = new Float32Array(length); }
  getChannelData() { return this.data; }
}

function makeFakeContext() {
  const created = {
    oscillators: [] as FakeOscillator[],
    gains: [] as FakeGain[],
    filters: [] as FakeFilter[],
    sources: [] as FakeBufferSource[],
    buffers: [] as FakeBuffer[],
  };
  const state = { value: 'suspended' as 'suspended' | 'running' };
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: new FakeNode(),
    get state() { return state.value; },
    resume: vi.fn(async () => { state.value = 'running'; }),
    createOscillator() { const n = new FakeOscillator(); created.oscillators.push(n); return n; },
    createGain() { const n = new FakeGain(); created.gains.push(n); return n; },
    createBiquadFilter() { const n = new FakeFilter(); created.filters.push(n); return n; },
    createBuffer(_ch: number, length: number, _rate: number) { const b = new FakeBuffer(length); created.buffers.push(b); return b; },
    createBufferSource() { const n = new FakeBufferSource(); created.sources.push(n); return n; },
  };
  return { ctx, created };
}

function setup() {
  const events = new EventBus();
  const fake = makeFakeContext();
  const factory = vi.fn(() => fake.ctx as unknown as AudioContext);
  const audio = new AudioSystem(events, factory, { feed: null, scEnv: { canLoad: () => false } });
  return { events, audio, factory, ...fake };
}

const total = (c: ReturnType<typeof makeFakeContext>['created']) =>
  c.oscillators.length + c.gains.length + c.filters.length + c.sources.length;

/* ---------- tests ---------- */

describe('AudioSystem before start()', () => {
  it('creates no audio nodes and every call is safe', () => {
    const { events, audio, factory, created } = setup();
    expect(() => {
      events.emit('horn', { pos: { x: 0, z: 0 } });
      events.emit('impact', { a: 'p', b: 'v', strength: 12, pos: { x: 0, z: 0 } });
      events.emit('enterVehicle', { vehicleId: 'v1' });
      events.emit('radioNext', {});
      audio.setEngine(20, 1, true);
      audio.setNight(true);
      audio.setMasterVolume(0.5);
      audio.nextStation();
      audio.update(1);
      audio.update(120);
    }).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
    expect(total(created)).toBe(0);
  });
});

describe('AudioSystem.start()', () => {
  it('creates the context once, even when called repeatedly', async () => {
    const { audio, factory } = setup();
    await audio.start();
    await audio.start();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended context', async () => {
    const { audio, ctx } = setup();
    await audio.start();
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.state).toBe('running');
  });

  it('starts the engine, hum and output graph on first start', async () => {
    const { audio, created } = setup();
    await audio.start();
    expect(created.oscillators.length).toBeGreaterThanOrEqual(2);
    expect(created.sources.length).toBeGreaterThanOrEqual(1);
  });

  it('is started by the userGesture event', async () => {
    const { events, factory } = setup();
    events.emit('userGesture', {});
    await new Promise((r) => setTimeout(r, 0));
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('AudioSystem engine', () => {
  it('drives the oscillators from synth.engineFrequency', async () => {
    const { audio, created } = setup();
    await audio.start();
    audio.setEngine(20, 0.5, true);
    const want = engineFrequency(20, 0.5);
    const freqs = created.oscillators.map((o) => o.frequency.lastTarget());
    expect(freqs).toContain(want);
    expect(freqs).toContain(want / 2);
  });

  it('is silent when not in a vehicle', async () => {
    const { audio, created } = setup();
    await audio.start();
    audio.setEngine(20, 1, false);
    const gains = created.gains.map((g) => g.gain.lastTarget());
    expect(gains).toContain(0);
    expect(gains.some((g) => g !== undefined && g > 0)).toBe(false);
  });

  it('becomes audible in a vehicle', async () => {
    const { audio, created } = setup();
    await audio.start();
    audio.setEngine(15, 0.8, true);
    const gains = created.gains.map((g) => g.gain.lastTarget());
    expect(gains.some((g) => g !== undefined && g > 0)).toBe(true);
  });
});

describe('AudioSystem horn', () => {
  it('plays two square tones at the synth horn frequencies', async () => {
    const { events, audio, created } = setup();
    await audio.start();
    const before = created.oscillators.length;
    events.emit('horn', { pos: { x: 0, z: 0 } });
    const horn = created.oscillators.slice(before);
    expect(horn).toHaveLength(2);
    expect(horn.every((o) => o.type === 'square')).toBe(true);
    const freqs = horn.map((o) => o.frequency.calls.find((c) => c.method === 'setValueAtTime')?.args[0]);
    expect(freqs).toEqual([...hornFrequencies()]);
    horn.forEach((o) => {
      const stop = o.stopped[0];
      const start = o.started[0];
      expect(stop - start).toBeGreaterThanOrEqual(0.4);
      expect(stop - start).toBeLessThan(0.5);
    });
  });
});

describe('AudioSystem impacts', () => {
  it('plays a noise burst for a hard impact', async () => {
    const { events, audio, created } = setup();
    await audio.start();
    const before = created.sources.length;
    events.emit('impact', { a: 'p', b: 'v', strength: 10, pos: { x: 0, z: 0 } });
    expect(created.sources.length).toBe(before + 1);
  });

  it('is silent for a zero-strength impact', async () => {
    const { events, audio, created } = setup();
    await audio.start();
    const before = created.sources.length;
    events.emit('impact', { a: 'p', b: 'v', strength: 0, pos: { x: 0, z: 0 } });
    expect(created.sources.length).toBe(before);
  });
});

describe('AudioSystem night siren', () => {
  it('does not play sirens during the day', async () => {
    const { audio, created } = setup();
    await audio.start();
    const before = created.oscillators.length;
    audio.update(300);
    expect(created.oscillators.length).toBe(before);
  });

  it('plays a distant siren within 60 s at night', async () => {
    const { audio, created } = setup();
    await audio.start();
    audio.setNight(true);
    const before = created.oscillators.length;
    for (let i = 0; i < 61; i++) audio.update(1);
    expect(created.oscillators.length).toBeGreaterThan(before);
  });
});

describe('AudioSystem radio', () => {
  it('starts with the first station', async () => {
    const { audio } = setup();
    await audio.start();
    expect(audio.stationName).toBe('BK House');
  });

  it('steps through the whole dial on nextStation() and wraps: 8 SoundCloud stations, WBSY Talk', async () => {
    const { audio } = setup();
    await audio.start();
    const names = [audio.stationName];
    for (let i = 0; i < 8; i++) { audio.nextStation(); names.push(audio.stationName); }
    expect(names).toEqual([
      'BK House', 'Dub Lab', 'Stoop Radio', 'Boogie Down', 'Weird Hours', 'Yard FM', 'Flashback 88', 'Radio SC',
      'WBSY Talk (voice unavailable on this device)',
    ]);
    audio.nextStation();
    expect(audio.stationName).toBe('BK House');
  });

  it('changes station on the radioNext event', async () => {
    const { events, audio } = setup();
    await audio.start();
    events.emit('radioNext', {});
    expect(audio.stationName).toBe('Dub Lab');
  });

  it('only sequences notes while in a vehicle', async () => {
    const { events, audio, created, ctx } = setup();
    await audio.start();
    const countSteps = () => created.sources.length + created.oscillators.length;

    ctx.currentTime = 0;
    audio.update(0.05);
    const onFoot = countSteps();
    ctx.currentTime = 1;
    audio.update(0.05);
    expect(countSteps()).toBe(onFoot);

    events.emit('enterVehicle', { vehicleId: 'v1' });
    ctx.currentTime = 2;
    audio.update(0.05);
    const driving = countSteps();
    expect(driving).toBeGreaterThan(onFoot);

    events.emit('exitVehicle', { vehicleId: 'v1' });
    ctx.currentTime = 3;
    audio.update(0.05);
    expect(countSteps()).toBe(driving);
  });

  it('schedules ahead of currentTime by about 0.1 s and no further', async () => {
    const { events, audio, created, ctx } = setup();
    await audio.start();
    const oscBefore = created.oscillators.length;
    const srcBefore = created.sources.length;
    events.emit('enterVehicle', { vehicleId: 'v1' });
    ctx.currentTime = 10;
    audio.update(0);
    const starts = [
      ...created.sources.slice(srcBefore).flatMap((s) => s.started),
      ...created.oscillators.slice(oscBefore).flatMap((o) => o.started),
    ];
    expect(starts.length).toBeGreaterThan(0);
    for (const t of starts) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThan(10 + 0.1);
    }
  });
});

describe('AudioSystem master volume', () => {
  it('clamps the master volume to 0..1', async () => {
    const { audio, created } = setup();
    await audio.start();
    audio.setMasterVolume(3);
    const masterGain = created.gains[0];
    expect(masterGain.gain.value).toBeLessThanOrEqual(1);
    audio.setMasterVolume(-2);
    expect(masterGain.gain.value).toBeGreaterThanOrEqual(0);
  });
});
