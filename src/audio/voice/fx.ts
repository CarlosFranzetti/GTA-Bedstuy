/**
 * Voice post-processing and effects, all WebAudio. Characters are told apart mainly by the model voice and speed;
 * the chain only adds the medium: studio mic EQ + compression + a touch of room, telephone band-pass for callers,
 * a tinny speaker for machines, and a brighter squashed sound for commercials.
 */
import type { FxPreset } from './types';

export interface FxHost { ctx: AudioContext; dest: AudioNode }

function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 12345 + c * 777;
    for (let i = 0; i < n; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      d[i] = ((seed / 0xffffffff) * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return buf;
}

function biquad(ctx: AudioContext, type: BiquadFilterType, f: number, q = 0.7, gain = 0): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = gain;
  return b;
}

function compressor(ctx: AudioContext, threshold: number, ratio: number): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.knee.value = 10;
  c.ratio.value = ratio;
  c.attack.value = 0.006;
  c.release.value = 0.18;
  return c;
}

function chain(ctx: AudioContext, nodes: AudioNode[], out: AudioNode): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(out);
  return nodes[0];
}

/** Builds the input node of one preset's chain, ending in `dest`. */
export function buildFx(ctx: AudioContext, preset: FxPreset, dest: AudioNode, ir?: AudioBuffer): AudioNode {
  const gain = (v: number) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  switch (preset) {
    case 'studio': {
      const makeup = gain(1.3);
      const input = chain(ctx, [biquad(ctx, 'highpass', 75), biquad(ctx, 'peaking', 3200, 0.9, 3), biquad(ctx, 'highshelf', 9000, 0.7, 2), compressor(ctx, -24, 3.5), makeup], dest);
      // Slight room: a short convolver, mixed low.
      const verb = ctx.createConvolver();
      verb.buffer = ir ?? impulse(ctx, 0.35, 3);
      const wet = gain(0.06);
      makeup.connect(verb); verb.connect(wet); wet.connect(dest);
      return input;
    }
    case 'phone': {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 2.2) * 0.9; }
      shaper.curve = curve;
      return chain(ctx, [biquad(ctx, 'highpass', 320, 0.8), biquad(ctx, 'lowpass', 3300, 0.8), biquad(ctx, 'peaking', 1800, 1, 4), shaper, compressor(ctx, -26, 4), gain(1.15)], dest);
    }
    case 'tinny':
      return chain(ctx, [biquad(ctx, 'highpass', 550, 0.8), biquad(ctx, 'lowpass', 4200, 0.8), biquad(ctx, 'peaking', 1500, 1.2, 5), compressor(ctx, -20, 3), gain(1.0)], dest);
    case 'ad':
      return chain(ctx, [biquad(ctx, 'highpass', 90), biquad(ctx, 'highshelf', 5000, 0.7, 4), compressor(ctx, -28, 6), gain(1.35)], dest);
    case 'street': {
      // Pedestrians outdoors: no low end, a rolled-off top, light compression and a little room (distance filtering is per voice).
      const makeup = gain(1.15);
      const input = chain(ctx, [biquad(ctx, 'highpass', 140), biquad(ctx, 'lowpass', 4200, 0.7), compressor(ctx, -22, 3), makeup], dest);
      const verb = ctx.createConvolver();
      verb.buffer = ir ?? impulse(ctx, 0.5, 2.5);
      const wet = gain(0.1);
      makeup.connect(verb); verb.connect(wet); wet.connect(dest);
      return input;
    }
    case 'booth':
      return chain(ctx, [biquad(ctx, 'highpass', 120), biquad(ctx, 'lowpass', 7000), compressor(ctx, -24, 3), gain(1.2)], dest);
    default: {
      const g = gain(1);
      g.connect(dest);
      return g;
    }
  }
}

/** One chain per preset per audio context, built on first use. */
export class FxBank {
  private readonly inputs = new Map<FxPreset, AudioNode>();
  private ir: AudioBuffer | undefined;
  constructor(private readonly host: FxHost) {}
  input(preset: FxPreset): AudioNode {
    let n = this.inputs.get(preset);
    if (!n) {
      if ((preset === 'studio' || preset === 'street') && !this.ir) this.ir = impulse(this.host.ctx, 0.35, 3);
      n = buildFx(this.host.ctx, preset, this.host.dest, this.ir);
      this.inputs.set(preset, n);
    }
    return n;
  }
}

/** Procedural effects named in `[sfx name]` directions; each returns its length in seconds. */
export function playSfx(host: FxHost, name: string, at?: number): number {
  const { ctx, dest } = host;
  const t = at ?? ctx.currentTime;
  const tone = (type: OscillatorType, f: number, start: number, dur: number, peak: number) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + start);
    g.gain.exponentialRampToValueAtTime(peak, t + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
    o.connect(g); g.connect(dest); o.start(t + start); o.stop(t + start + dur + 0.02);
  };
  const noise = (start: number, dur: number, peak: number, hz: number, q = 0.8) => {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 99;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = ((s / 0xffffffff) * 2 - 1) * (1 - i / n); }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = biquad(ctx, 'bandpass', hz, q); const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(dest); src.start(t + start);
  };
  switch (name) {
    case 'airhorn': tone('sawtooth', 466, 0, 0.7, 0.16); tone('sawtooth', 622, 0, 0.7, 0.16); tone('square', 933, 0.02, 0.6, 0.05); return 0.75;
    case 'gavel': tone('sine', 110, 0, 0.18, 0.5); noise(0, 0.08, 0.5, 1800, 1.5); return 0.3;
    case 'buzz': tone('square', 120, 0, 0.4, 0.14); return 0.45;
    case 'phone': for (let i = 0; i < 2; i++) { tone('sine', 1400, i * 0.45, 0.14, 0.12); tone('sine', 1100, i * 0.45 + 0.15, 0.14, 0.12); } return 1.0;
    case 'cash': tone('triangle', 2093, 0, 0.12, 0.12); tone('triangle', 3136, 0.1, 0.35, 0.12); return 0.5;
    case 'static': noise(0, 0.5, 0.2, 2500, 0.5); return 0.5;
    default: [523, 659, 784, 1047].forEach((f, i) => tone('square', f, i * 0.12, i === 3 ? 0.4 : 0.14, 0.1)); return 0.9; // 'sting'
  }
}

/** A short crowd-laugh burst (noise bursts through a vocal-ish band), used for [laugh]. */
export function playLaugh(host: FxHost, at?: number): number {
  const { ctx, dest } = host;
  const t = at ?? ctx.currentTime;
  for (let i = 0; i < 6; i++) {
    const n = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 7 + i * 31;
    for (let k = 0; k < n; k++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[k] = ((s / 0xffffffff) * 2 - 1) * Math.sin((k / n) * Math.PI); }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = biquad(ctx, 'bandpass', 900 + (i % 3) * 300, 1.2); const g = ctx.createGain();
    g.gain.value = 0.22 * (1 - i * 0.1);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t + i * 0.13);
  }
  return 0.85;
}
