/**
 * The weather sounds on the ambience bus (`audio.ambienceHost`): rain in three intensities, a roof-drum layer for the car and
 * for rain under a deck, wind with gusts, and thunder. All synthesised (synth.ts); every level and corner frequency moves with
 * setTargetAtTime ramps, so changing weather, getting into a car or stepping into a room never steps the sound.
 *
 * Nodes are created when there is something to hear and torn down again after ten quiet seconds.
 */
import { newWeatherMix, thunderLevel, weatherMix, type WeatherAudioSink, type WeatherAudioState, type WeatherMix } from './mix';
import { sourceMutes } from '../ambient/mutes';
import { rainLayer, roofLayer, thunderClap, windLayer, type ThunderKind } from './synth';

/** Weather buffers are made at no more than 24 kHz (rain and thunder have nothing above 12 kHz) and resampled by the engine: halves their memory. */
export const MAX_BUFFER_RATE = 24000;
const bufferRate = (ctx: BaseAudioContext): number => Math.min(ctx.sampleRate, MAX_BUFFER_RATE);

export interface WeatherAudioHost { ctx: BaseAudioContext; dest: AudioNode }

/** Ramp time constants (s): levels move slowly, the filter corner quicker (a car door closing). */
export const RAMP = { level: 0.9, rainLayers: 0.7, wind: 1.1, corner: 0.18 } as const;
/** Seconds of silence before the nodes are released. */
export const IDLE_SECONDS = 10;
/** Seconds between parameter writes of the weather mix. */
export const WRITE_EVERY = 0.05;
/** A parameter is written only when its target moved by more than this fraction of its size (or 1e-4 absolute). */
const EPS = 0.004;

interface Nodes {
  sources: AudioBufferSourceNode[];
  oscs: OscillatorNode[];
  light: GainNode; steady: GainNode; heavy: GainNode; roof: GainNode;
  rainLp: BiquadFilterNode; rainGain: GainNode;
  windBp: BiquadFilterNode; windGust: GainNode; windGain: GainNode; gustDepth: GainNode;
  thunderLp: BiquadFilterNode; thunderBus: GainNode;
}

export class WeatherAudio implements WeatherAudioSink {
  private n: Nodes | null = null;
  private readonly mix: WeatherMix = newWeatherMix();
  private quiet = 0;
  private readonly bufs = new Map<string, AudioBuffer>();
  private clapN = 0;
  private since = 0;
  private fresh = true;
  private readonly last = new Map<AudioParam, number>();

  constructor(private readonly host: () => WeatherAudioHost | null) {}

  get active(): boolean { return this.n !== null; }

  update(dt: number, s: WeatherAudioState): void {
    const m = weatherMix(s, this.mix);
    if (sourceMutes.muted('weather')) { m.rainGain = 0; m.windGain = 0; m.thunderGain = 0; }
    const audible = m.rainGain > 0.004 || m.windGain > 0.004 || s.storm > 0.5;
    if (!this.n) {
      if (!audible) return;
      const h = this.host();
      if (!h) return;
      this.build(h);
    }
    if (!this.n) return;
    this.quiet = audible ? 0 : this.quiet + (Number.isFinite(dt) ? dt : 0);
    // AMBIENT: the mix used to be written to eleven parameters on every frame (660 events a second at 60 fps); the slowest ramp here
    // is 0.18 s, so 20 writes a second sound the same, and a parameter that has not moved is not written at all.
    this.since += Number.isFinite(dt) ? dt : 0;
    if (this.since >= WRITE_EVERY || this.fresh) { this.since = 0; this.fresh = false; this.apply(m); }
    if (this.quiet > IDLE_SECONDS) this.teardown();
  }

  /** A clap reaching the listener now (Weather has already waited out the speed of sound). */
  thunder(distanceM: number, strength: number): void {
    if (sourceMutes.muted('weather')) return;
    const h = this.host();
    if (!h) return;
    const ctx = h.ctx;
    if (!this.n) this.build(h);
    const n = this.n;
    if (!n) return;
    const kind: ThunderKind = distanceM < 1400 ? 'close' : 'far';
    const variant = this.clapN++ % 2;
    const buf = this.buffer(ctx, `thunder:${kind}:${variant}`, () => thunderClap(kind, bufferRate(ctx), 1 + variant));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(thunderLevel(distanceM, strength) * 0.9, t + 0.02);
    src.connect(g);
    g.connect(n.thunderLp);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* already gone */ } };
    src.start(t);
    this.quiet = 0;
  }

  dispose(): void { this.teardown(); this.bufs.clear(); }

  // ---------------------------------------------------------------- graph

  private buffer(ctx: BaseAudioContext, id: string, make: () => Float32Array): AudioBuffer {
    let b = this.bufs.get(id);
    if (!b) {
      const data = make();
      b = ctx.createBuffer(1, data.length, bufferRate(ctx));
      b.getChannelData(0).set(data);
      this.bufs.set(id, b);
    }
    return b;
  }

  private build(h: WeatherAudioHost): void {
    const { ctx, dest } = h;
    const sr = bufferRate(ctx);
    const sources: AudioBufferSourceNode[] = [];
    const oscs: OscillatorNode[] = [];
    const loop = (id: string, make: () => Float32Array, out: AudioNode): void => {
      const s = ctx.createBufferSource();
      s.buffer = this.buffer(ctx, id, make);
      s.loop = true;
      s.connect(out);
      sources.push(s);
    };
    const gain = (v: number): GainNode => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // rain: three layers -> sum -> low-pass (open air / car / room) -> bed gain -> bus; the roof layer joins after the filter
    const rainGain = gain(0);
    rainGain.connect(dest);
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = 'lowpass'; rainLp.frequency.value = 16000; rainLp.Q.value = 0.5;
    rainLp.connect(rainGain);
    const light = gain(0), steady = gain(0), heavy = gain(0), roof = gain(0);
    light.connect(rainLp); steady.connect(rainLp); heavy.connect(rainLp); roof.connect(rainGain);
    loop('rain:light', () => rainLayer('light', sr), light);
    loop('rain:steady', () => rainLayer('steady', sr), steady);
    loop('rain:heavy', () => rainLayer('heavy', sr), heavy);
    loop('roof', () => roofLayer(sr), roof);

    // wind: noise -> band-pass -> gust (two slow LFOs ride on it) -> level -> bus
    const windGain = gain(0);
    windGain.connect(dest);
    const windGust = gain(0.75);
    windGust.connect(windGain);
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass'; windBp.frequency.value = 300; windBp.Q.value = 0.6;
    windBp.connect(windGust);
    loop('wind', () => windLayer(sr), windBp);
    const gustDepth = gain(0);
    gustDepth.connect(windGust.gain);
    for (const f of [0.11, 0.29]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(gustDepth);
      oscs.push(o);
    }

    // thunder: one-shots -> low-pass (a car or a room muffles it) -> bus gain -> bus
    const thunderBus = gain(1);
    thunderBus.connect(dest);
    const thunderLp = ctx.createBiquadFilter();
    thunderLp.type = 'lowpass'; thunderLp.frequency.value = 16000;
    thunderLp.connect(thunderBus);

    const t0 = ctx.currentTime;
    let k = 0;
    for (const s of sources) s.start(t0, (k++ * 1.3) % 3);
    for (const o of oscs) o.start(t0);
    this.last.clear(); this.fresh = true;
    this.n = { sources, oscs, light, steady, heavy, roof, rainLp, rainGain, windBp, windGust, windGain, gustDepth, thunderLp, thunderBus };
    this.quiet = 0;
  }

  private teardown(): void {
    const n = this.n;
    if (!n) return;
    this.n = null;
    this.bufs.clear(); // give the buffers back (about 5 MB at 24 kHz): they are made again when the weather returns
    for (const s of n.sources) { try { s.stop(); s.disconnect(); } catch { /* not started */ } }
    for (const o of n.oscs) { try { o.stop(); o.disconnect(); } catch { /* not started */ } }
    for (const g of [n.light, n.steady, n.heavy, n.roof, n.rainLp, n.rainGain, n.windBp, n.windGust, n.windGain, n.gustDepth, n.thunderLp, n.thunderBus]) { try { g.disconnect(); } catch { /* ok */ } }
  }

  private apply(m: WeatherMix): void {
    const n = this.n;
    const h = this.host();
    if (!n || !h) return;
    const t = h.ctx.currentTime;
    const aim = (p: AudioParam, v: number, tc: number): void => {
      const old = this.last.get(p);
      if (old !== undefined && Math.abs(v - old) <= Math.max(1e-4, Math.abs(old) * EPS)) return;
      this.last.set(p, v);
      p.setTargetAtTime(v, t, tc);
    };
    aim(n.light.gain, m.light, RAMP.rainLayers);
    aim(n.steady.gain, m.steady, RAMP.rainLayers);
    aim(n.heavy.gain, m.heavy, RAMP.rainLayers);
    aim(n.roof.gain, m.roof, RAMP.rainLayers);
    aim(n.rainGain.gain, m.rainGain, RAMP.level);
    aim(n.rainLp.frequency, m.rainCutoff, RAMP.corner);
    aim(n.windGain.gain, m.windGain, RAMP.wind);
    aim(n.windBp.frequency, m.windHz, RAMP.wind);
    aim(n.gustDepth.gain, m.windGust * 0.3, RAMP.wind);
    aim(n.thunderLp.frequency, m.thunderCutoff, RAMP.corner);
    aim(n.thunderBus.gain, m.thunderGain, RAMP.corner);
  }
}
