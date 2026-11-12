/**
 * WBURG: synthesized train sound (WebAudio, no files): wheel rumble and rail clack that follow the speed, brake squeal while
 * slowing, a two-tone door chime when the doors open and again before they close. Loudness falls with the listener's distance.
 * `trainSoundParams` is pure (tested); `TrainAudio` wires it to nodes once an AudioContext exists.
 */
import { DOOR_TIME, V_CRUISE, type TrainState } from './ElLine';
import { underElMix } from '../audio/vehicle/world';

/** Beyond this distance (m) a train is silent; the falloff is smooth so it fades in from the fog. */
export const HEAR_RANGE = 380;
/** Chime and squeal are quieter at range than the low rumble (air absorbs highs). */
export function distanceGain(d: number, range = HEAR_RANGE): number {
  if (!(d >= 0)) return 0;
  const k = Math.max(0, 1 - d / range);
  return k * k * (24 / (24 + d * 0.25));
}

export interface SoundParams {
  /** overall gain of the rumble bed */
  rumble: number;
  /** low-pass cutoff of the rumble (Hz): lower when far away */
  rumbleHz: number;
  /** clack rate (Hz): axle pulses over the rail joints */
  clackHz: number;
  clack: number;
  squeal: number;
  /** squeal pitch (Hz) falling as the train slows */
  squealHz: number;
  /** 1 on the frame the doors start to open / close */
  chime: boolean;
}

export function trainSoundParams(st: TrainState, distance: number, prev?: TrainState): SoundParams {
  const g = st.active ? distanceGain(distance) : 0;
  const v = Math.min(1, st.speed / V_CRUISE);
  const braking = st.phase === 'brake' && st.speed > 0.5 ? Math.min(1, (st.speed / V_CRUISE) * 1.6) : 0;
  const far = Math.min(1, distance / HEAR_RANGE);
  const opening = prev ? prev.doors <= 0.001 && st.doors > 0.001 : false;
  const closing = prev ? prev.doors >= 0.999 && st.doors < 0.999 && st.phase === 'dwell' : false;
  return {
    rumble: g * (0.05 + 0.55 * v),
    rumbleHz: 120 + 520 * v * (1 - far * 0.7),
    clackHz: 0.35 * st.speed + 0.2,
    clack: g * 0.35 * v,
    squeal: g * 0.28 * braking * (1 - far * 0.6),
    squealHz: 1300 + 1500 * Math.min(1, st.speed / V_CRUISE),
    chime: (opening || closing) && g > 0.001,
  };
}

/** Door chime notes: two tones, a falling third. */
export const CHIME_NOTES = [{ hz: 988, at: 0, len: 0.32 }, { hz: 784, at: 0.34, len: 0.5 }] as const;
export const CHIME_LENGTH = 0.9 + DOOR_TIME * 0;

/** SFX2: impulse response of the space under the elevated structure (steel deck overhead, hard street below): a dense, bright, fast-decaying tail. */
export function underElImpulse(sr: number, seconds = 2.2): Float32Array {
  const n = Math.floor(sr * seconds), out = new Float32Array(n);
  let seed = 12345, lp = 0;
  for (let i = 0; i < n; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const r = seed / 2147483648 - 1, t = i / sr;
    lp += (r - lp) * Math.max(0.12, 0.85 - t * 0.5); // darker as it decays
    out[i] = lp * Math.exp(-t / 0.55) * (i < 40 ? i / 40 : 1);
  }
  // the girders ring: a few early reflections from the deck, 9 to 31 ms
  for (const [ms, g] of [[9, 0.6], [17, 0.45], [31, 0.35]] as const) { const k = Math.floor((ms / 1000) * sr); if (k < n) out[k] += g; }
  return out;
}

interface Voice { rumbleGain: GainNode; rumbleFilter: BiquadFilterNode; clackGain: GainNode; clackLfo: OscillatorNode; squealGain: GainNode; squealOsc: OscillatorNode; chimeGain: GainNode; prev?: TrainState; }

export class TrainAudio {
  private voices = new Map<string, Voice>();
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** under-the-el reverb: the dry path and a convolver send; the mix follows the nearest train's distance */
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private readonly dists = new Map<string, number>();
  constructor(private readonly ctx: AudioContext, private readonly dest: AudioNode) {}

  private ensure(): void {
    if (this.master) return;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    if (typeof ctx.createConvolver === 'function') {
      const conv = ctx.createConvolver();
      const ir = underElImpulse(ctx.sampleRate);
      const buf = ctx.createBuffer(1, ir.length, ctx.sampleRate);
      buf.getChannelData(0).set(ir);
      conv.buffer = buf;
      this.dry = ctx.createGain(); this.wet = ctx.createGain();
      this.wet.gain.value = 0.15;
      this.master.connect(this.dry); this.dry.connect(this.dest);
      this.master.connect(conv); conv.connect(this.wet); this.wet.connect(this.dest);
    } else this.master.connect(this.dest);
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    let a = 0, b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.sin(i * 12.9898) * 43758.5453; const r = (w - Math.floor(w)) * 2 - 1; a = a * 0.9 + r * 0.1; b = b * 0.6 + r * 0.4; d[i] = a * 3 + b * 0.5; }
    this.noise = n;
  }

  private voice(id: string): Voice {
    let v = this.voices.get(id);
    if (v) return v;
    this.ensure();
    const ctx = this.ctx;
    const src = (): AudioBufferSourceNode => { const s = ctx.createBufferSource(); s.buffer = this.noise!; s.loop = true; s.start(); return s; };
    // rumble: brown-ish noise through a low-pass + a sub tone
    const rumbleFilter = ctx.createBiquadFilter(); rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 200;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
    src().connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(this.master!);
    // clack: noise through a band-pass, gated by a low-frequency square
    const clackBand = ctx.createBiquadFilter(); clackBand.type = 'bandpass'; clackBand.frequency.value = 900; clackBand.Q.value = 1.2;
    const clackGain = ctx.createGain(); clackGain.gain.value = 0;
    const clackLfo = ctx.createOscillator(); clackLfo.type = 'square'; clackLfo.frequency.value = 2;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.5;
    clackLfo.connect(lfoDepth); lfoDepth.connect(clackGain.gain); clackLfo.start();
    src().connect(clackBand); clackBand.connect(clackGain); clackGain.connect(this.master!);
    // squeal: sawtooth through a band-pass
    const squealOsc = ctx.createOscillator(); squealOsc.type = 'sawtooth'; squealOsc.frequency.value = 2000;
    const squealBand = ctx.createBiquadFilter(); squealBand.type = 'bandpass'; squealBand.frequency.value = 2400; squealBand.Q.value = 6;
    const squealGain = ctx.createGain(); squealGain.gain.value = 0;
    squealOsc.connect(squealBand); squealBand.connect(squealGain); squealGain.connect(this.master!); squealOsc.start();
    const chimeGain = ctx.createGain(); chimeGain.gain.value = 0; chimeGain.connect(this.master!);
    v = { rumbleGain, rumbleFilter, clackGain, clackLfo, squealGain, squealOsc, chimeGain };
    this.voices.set(id, v);
    return v;
  }

  /** Call every frame per train with its state and the distance to the listener. */
  update(id: string, st: TrainState, distance: number): void {
    const v = this.voice(id);
    const p = trainSoundParams(st, distance, v.prev);
    const t = this.ctx.currentTime;
    if (this.wet && this.dry) {
      this.dists.set(id, st.active ? distance : 1e9);
      let near = 1e9; for (const d of this.dists.values()) near = Math.min(near, d);
      const m = underElMix(near);
      this.wet.gain.setTargetAtTime(m.wet * 0.5, t, 0.3);
      this.dry.gain.setTargetAtTime(m.dry, t, 0.3);
    }
    v.rumbleGain.gain.setTargetAtTime(p.rumble, t, 0.15);
    v.rumbleFilter.frequency.setTargetAtTime(p.rumbleHz, t, 0.2);
    v.clackLfo.frequency.setTargetAtTime(Math.max(0.2, p.clackHz), t, 0.2);
    v.clackGain.gain.setTargetAtTime(p.clack * 0.5, t, 0.15);
    v.squealGain.gain.setTargetAtTime(p.squeal, t, 0.1);
    v.squealOsc.frequency.setTargetAtTime(p.squealHz, t, 0.2);
    if (p.chime) this.chime(v, distanceGain(distance) * 0.5);
    v.prev = st;
  }

  private chime(v: Voice, level: number): void {
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (const n of CHIME_NOTES) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = n.hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t0 + n.at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
      o.connect(g); g.connect(v.chimeGain); v.chimeGain.gain.value = 1;
      o.start(t0 + n.at); o.stop(t0 + n.at + n.len + 0.05);
    }
  }

  dispose(): void {
    for (const v of this.voices.values()) { try { v.clackLfo.stop(); v.squealOsc.stop(); } catch { /* already stopped */ } }
    this.voices.clear(); this.dists.clear();
    this.master?.disconnect(); this.dry?.disconnect(); this.wet?.disconnect(); this.dry = null; this.wet = null;
    this.master = null;
  }
}
