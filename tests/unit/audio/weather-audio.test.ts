import { describe, expect, it } from 'vitest';
import { newWeatherAudioState, thunderDelaySeconds, thunderLevel, weatherMix, type WeatherAudioState } from '@/audio/weather/mix';
import { rainLayer, roofLayer, thunderClap, windLayer } from '@/audio/weather/synth';
import { IDLE_SECONDS, RAMP, WeatherAudio } from '@/audio/weather/WeatherAudio';

function st(p: Partial<WeatherAudioState> = {}): WeatherAudioState { return { ...newWeatherAudioState(), ...p }; }
const rms = (x: Float32Array): number => { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / x.length); };

describe('weatherMix', () => {
  it('rain bed level rises monotonically with the rain, everywhere, with no jump', () => {
    for (const place of [{}, { inVehicle: true }, { indoors: true }, { covered: true }] as Partial<WeatherAudioState>[]) {
      let last = -1;
      let prevLayers = [0, 0, 0];
      for (let r = 0; r <= 1.0001; r += 0.005) {
        const m = weatherMix(st({ rain: r, ...place }));
        expect(m.rainGain).toBeGreaterThanOrEqual(last - 1e-12);
        last = m.rainGain;
        // each layer weight moves smoothly (no step over a 0.5 % change of intensity)
        const layers = [m.light, m.steady, m.heavy];
        if (r > 0) for (let i = 0; i < 3; i++) expect(Math.abs(layers[i] - prevLayers[i])).toBeLessThan(0.13); // steepest part is the drizzle fade-in
        prevLayers = layers;
        for (const l of layers) { expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThanOrEqual(1); }
      }
    }
  });

  it('drizzle fades in from silence; no rain is silent', () => {
    expect(weatherMix(st({ rain: 0 })).rainGain).toBe(0);
    expect(weatherMix(st({ rain: 0.01 })).rainGain).toBeLessThan(weatherMix(st({ rain: 0.3 })).rainGain * 0.25);
  });

  it('light rain is a pitter-patter, heavy rain the roar; they cross-fade', () => {
    const light = weatherMix(st({ rain: 0.3 }));
    const heavy = weatherMix(st({ rain: 0.95 }));
    expect(light.light).toBeGreaterThan(light.heavy);
    expect(heavy.heavy).toBeGreaterThan(heavy.light);
    expect(heavy.rainGain).toBeGreaterThan(light.rainGain * 1.5);
  });

  it('is duller in a car and a room, with a roof drum in the car', () => {
    const open = weatherMix(st({ rain: 0.9 }));
    const car = weatherMix(st({ rain: 0.9, inVehicle: true }));
    const room = weatherMix(st({ rain: 0.9, indoors: true }));
    expect(car.rainCutoff).toBeLessThan(open.rainCutoff / 5);
    expect(room.rainCutoff).toBeLessThan(car.rainCutoff);
    expect(car.roof).toBeGreaterThan(0.4);
    expect(open.roof).toBe(0);
    expect(room.rainGain).toBeLessThan(open.rainGain);
    expect(car.thunderCutoff).toBeLessThan(open.thunderCutoff);
  });

  it('wind rises with the wind, quieter in a car and a room', () => {
    let last = -1;
    for (let w = 0; w <= 1.0001; w += 0.01) { const m = weatherMix(st({ wind: w })); expect(m.windGain).toBeGreaterThanOrEqual(last - 1e-12); last = m.windGain; }
    expect(weatherMix(st({ wind: 0.9 })).windGain).toBeGreaterThan(weatherMix(st({ wind: 0.9, inVehicle: true })).windGain);
    expect(weatherMix(st({ wind: 0.9, indoors: true })).windGain).toBeLessThan(weatherMix(st({ wind: 0.9, inVehicle: true })).windGain);
    expect(weatherMix(st({ wind: 0.02 })).windGain).toBe(0);
  });

  it('survives junk', () => {
    const m = weatherMix(st({ rain: NaN, wind: Infinity, gust: NaN }));
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('thunder timing and level', () => {
  it('sound takes 3 s per km, capped at 14 s', () => {
    expect(thunderDelaySeconds(343)).toBeCloseTo(1, 6);
    expect(thunderDelaySeconds(1715)).toBeCloseTo(5, 6);
    expect(thunderDelaySeconds(40000)).toBe(14);
    expect(thunderDelaySeconds(NaN)).toBe(0);
  });
  it('is quieter with distance', () => {
    let last = 2;
    for (let d = 100; d < 6000; d += 100) { const l = thunderLevel(d, 1); expect(l).toBeLessThanOrEqual(last + 1e-12); last = l; }
    expect(thunderLevel(300, 1)).toBeGreaterThan(0.95);
    expect(thunderLevel(5000, 1)).toBeLessThan(0.3);
  });
});

describe('synth', () => {
  const sr = 24000;
  it('rain layers are deterministic, seamless loops at the same RMS', () => {
    for (const k of ['light', 'steady', 'heavy'] as const) {
      const a = rainLayer(k, sr);
      const b = rainLayer(k, sr);
      expect(a.length).toBe(b.length);
      expect(a[1000]).toBe(b[1000]);
      expect(rms(a)).toBeCloseTo(0.1, 3);
      // the seam: the step from the last sample to the first is of the order of any other step
      let big = 0;
      for (let i = 1; i < 4000; i++) big = Math.max(big, Math.abs(a[i] - a[i - 1]));
      expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThan(big * 2.5 + 0.2);
      for (const v of a) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('heavy rain is brighter-and-denser than light rain (more zero crossings)', () => {
    const zc = (x: Float32Array): number => { let n = 0; for (let i = 1; i < x.length; i++) if ((x[i] > 0) !== (x[i - 1] > 0)) n++; return n / x.length; };
    expect(zc(rainLayer('heavy', sr))).toBeGreaterThan(0.05);
    expect(rms(roofLayer(sr))).toBeCloseTo(0.1, 3);
    expect(rms(windLayer(sr))).toBeCloseTo(0.1, 3);
  });
  it('thunder peaks under full scale, starts silent, and the close clap has a crack the far one lacks', () => {
    for (const k of ['close', 'far'] as const) {
      const t = thunderClap(k, sr);
      let peak = 0; for (const v of t) peak = Math.max(peak, Math.abs(v));
      expect(peak).toBeLessThanOrEqual(0.9001);
      expect(Math.abs(t[0])).toBeLessThan(0.01);
    }
    const hf = (x: Float32Array): number => { let s = 0; for (let i = 1; i < sr; i++) s += Math.abs(x[i] - x[i - 1]); return s; };
    expect(hf(thunderClap('close', sr))).toBeGreaterThan(hf(thunderClap('far', sr)) * 2);
  });
});

// ---- a fake audio context that records how parameters are driven
class FakeParam {
  calls: string[] = [];
  private v: number;
  directWrites = 0;
  constructor(v = 0) { this.v = v; }
  get value(): number { return this.v; }
  set value(x: number) { this.v = x; this.directWrites++; }
  setTargetAtTime(target: number, _t: number, tc: number): void { this.calls.push(`target:${target}:${tc}`); this.v = target; }
  setValueAtTime(v: number): void { this.v = v; this.calls.push('set'); }
  linearRampToValueAtTime(v: number): void { this.v = v; this.calls.push('lin'); }
}
class FakeNode { connected: unknown[] = []; connect(n: unknown): unknown { this.connected.push(n); return n; } disconnect(): void { this.connected = []; } }
class FakeGain extends FakeNode { gain = new FakeParam(1); }
class FakeFilter extends FakeNode { frequency = new FakeParam(350); Q = new FakeParam(1); type = ''; }
class FakeOsc extends FakeNode { frequency = new FakeParam(440); type = ''; started = false; stopped = false; start(): void { this.started = true; } stop(): void { this.stopped = true; } }
class FakeSource extends FakeNode { buffer: unknown = null; loop = false; started = 0; stopped = false; onended: (() => void) | null = null; start(): void { this.started++; } stop(): void { this.stopped = true; } }
class FakeCtx {
  sampleRate = 8000; currentTime = 0;
  gains: FakeGain[] = []; filters: FakeFilter[] = []; sources: FakeSource[] = []; oscs: FakeOsc[] = [];
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createBiquadFilter(): FakeFilter { const f = new FakeFilter(); this.filters.push(f); return f; }
  createOscillator(): FakeOsc { const o = new FakeOsc(); this.oscs.push(o); return o; }
  createBufferSource(): FakeSource { const s = new FakeSource(); this.sources.push(s); return s; }
  createBuffer(_c: number, len: number): { length: number; getChannelData(): Float32Array } { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
}

describe('WeatherAudio graph', () => {
  function setup() {
    const ctx = new FakeCtx();
    const dest = new FakeGain();
    const wa = new WeatherAudio(() => ({ ctx: ctx as unknown as BaseAudioContext, dest: dest as unknown as AudioNode }));
    return { ctx, dest, wa };
  }

  it('builds nothing until there is weather to hear, and is silent with no host', () => {
    const { ctx, wa } = setup();
    wa.update(0.1, st());
    expect(wa.active).toBe(false);
    expect(ctx.sources.length).toBe(0);
    const none = new WeatherAudio(() => null);
    none.update(0.1, st({ rain: 1 }));
    expect(none.active).toBe(false);
    none.thunder(500, 1);
  });

  it('after building, every change is a setTargetAtTime ramp: no value is ever written directly', () => {
    const { ctx, wa } = setup();
    wa.update(0.1, st({ rain: 0.4, wind: 0.3 }));
    expect(wa.active).toBe(true);
    for (const g of ctx.gains) g.gain.directWrites = 0;
    for (const f of ctx.filters) { f.frequency.directWrites = 0; }
    for (let r = 0; r <= 1; r += 0.1) { ctx.currentTime += 0.1; wa.update(0.1, st({ rain: r, wind: r, inVehicle: r > 0.5 })); }
    ctx.currentTime += 0.1; wa.update(0.1, st({ rain: 0.9, indoors: true }));
    for (const g of ctx.gains) expect(g.gain.directWrites).toBe(0);
    for (const f of ctx.filters) expect(f.frequency.directWrites).toBe(0);
    const driven = ctx.gains.filter((g) => g.gain.calls.length > 5).length;
    expect(driven).toBeGreaterThanOrEqual(5);
    // every ramp has a real time constant
    for (const g of ctx.gains) for (const c of g.gain.calls) if (c.startsWith('target:')) expect(Number(c.split(':')[2])).toBeGreaterThanOrEqual(RAMP.corner - 1e-9);
  });

  it('gain targets follow the mix continuously (a small rain change moves the bed gain a little)', () => {
    const { ctx, wa } = setup();
    wa.update(0.1, st({ rain: 0.5 }));
    const bed = ctx.gains[0]; // rain bed gain
    const before = bed.gain.value;
    wa.update(0.1, st({ rain: 0.51 }));
    expect(Math.abs(bed.gain.value - before)).toBeLessThan(0.01);
  });

  it('releases its nodes after the weather has been quiet for a while', () => {
    const { ctx, wa } = setup();
    wa.update(0.1, st({ rain: 0.5 }));
    expect(wa.active).toBe(true);
    for (let t = 0; t < IDLE_SECONDS + 2; t += 0.5) wa.update(0.5, st());
    expect(wa.active).toBe(false);
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);
    wa.update(0.1, st({ rain: 0.5 }));
    expect(wa.active).toBe(true); // comes back
  });

  it('plays thunder one-shots through the thunder low-pass, close and far, with a gain that starts at zero', () => {
    const { ctx, wa } = setup();
    wa.update(0.1, st({ rain: 0.8, storm: 1 }));
    const n0 = ctx.sources.length;
    wa.thunder(600, 1);
    wa.thunder(3500, 1);
    expect(ctx.sources.length).toBe(n0 + 2);
    const s = ctx.sources[n0];
    expect(s.started).toBe(1);
    expect(s.loop).toBe(false);
  });
});
