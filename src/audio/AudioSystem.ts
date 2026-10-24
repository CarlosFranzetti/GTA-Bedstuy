/**
 * Procedural Web Audio: engine, horn, impacts, city hum, night sirens and parody radio.
 * Every sound is an oscillator, a noise buffer or a filter. No audio files, no fetches.
 *
 * Before start() no audio nodes exist. Calls before start() only record state, which is applied
 * when the graph is built. start() is called on the first userGesture event, or by the integrator.
 */
import type { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { engineFrequency, hornFrequencies, impactGain, pinkNoise } from './synth';
import { STATIONS, patternAt, stepSeconds, type Note } from './radio';

/** Seconds of audio queued ahead of currentTime by the radio sequencer. */
const LOOKAHEAD = 0.1;
const HUM_GAIN = 0.05;
const RADIO_GAIN = 0.25;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  saw: OscillatorNode;
  sq: OscillatorNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  radioBus: GainNode;
  /** 1 s of white noise, shared by all noise voices. */
  noise: AudioBuffer;
}

/** Attack-and-decay envelope on an AudioParam. */
function shape(p: AudioParam, t: number, peak: number, dur: number): void {
  const top = Math.max(peak, 0.0001);
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(top, t + Math.min(0.01, dur / 4));
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}

export class AudioSystem {
  private g: Graph | null = null;
  private readonly createContext: () => AudioContext;
  private readonly rng = new Rng('audio');
  private readonly unsubs: Array<() => void> = [];

  // State. Recorded even before start(), applied once the graph exists.
  private masterVolume = 1;
  private engineSpeed = 0;
  private engineThrottle = 0;
  private engineOn = false;
  private night = false;
  private sirenIn = 0;
  private radioOn = false;
  private stationIndex = 0;
  private step = 0;
  private nextNoteTime = 0;

  constructor(events: EventBus, createContext?: () => AudioContext) {
    this.createContext = createContext ?? (() => new AudioContext());
    this.unsubs.push(
      events.on('userGesture', () => { void this.start(); }),
      events.on('horn', () => this.playHorn()),
      events.on('impact', (e) => this.playImpact(e.strength)),
      events.on('enterVehicle', () => this.setRadioOn(true)),
      events.on('exitVehicle', () => this.setRadioOn(false)),
      events.on('radioNext', () => this.nextStation()),
    );
  }

  /** Creates the AudioContext once and resumes it. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (!this.g) {
      this.g = this.build(this.createContext());
    }
    if (this.g.ctx.state === 'suspended') {
      try {
        await this.g.ctx.resume();
      } catch {
        // Autoplay policy refused. The next user gesture retries.
      }
    }
  }

  /** Call once per frame. Drives the radio sequencer and the siren timer. */
  update(dt: number): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (this.night) {
      this.sirenIn -= dt;
      if (this.sirenIn <= 0) {
        this.playSiren(g, now);
        this.sirenIn = 20 + this.rng.range(0, 40);
      }
    }
    if (this.radioOn) this.scheduleRadio(g, now);
  }

  /** Call once per frame with the vehicle state. Speed in m/s, throttle 0..1. */
  setEngine(speed: number, throttle: number, inVehicle: boolean): void {
    this.engineSpeed = speed;
    this.engineThrottle = throttle;
    this.engineOn = inVehicle;
    if (this.g) this.applyEngine(this.g);
  }

  setNight(night: boolean): void {
    if (night === this.night) return;
    this.night = night;
    if (night) this.sirenIn = 20 + this.rng.range(0, 40);
  }

  nextStation(): void {
    this.stationIndex = (this.stationIndex + 1) % STATIONS.length;
    this.step = 0;
    if (this.g) this.nextNoteTime = this.g.ctx.currentTime;
  }

  get stationName(): string {
    return STATIONS[this.stationIndex].name;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    const g = this.g;
    if (g) g.master.gain.setTargetAtTime(this.masterVolume, g.ctx.currentTime, 0.05);
  }

  /** Unsubscribes from events and closes the context. */
  dispose(): void {
    this.unsubs.splice(0).forEach((fn) => fn());
    const g = this.g;
    if (g && typeof g.ctx.close === 'function') void g.ctx.close().catch(() => undefined);
    this.g = null;
  }

  /* ---------- graph ---------- */

  private build(ctx: AudioContext): Graph {
    const now = ctx.currentTime;
    const sr = ctx.sampleRate || 44100;

    const master = ctx.createGain();
    master.gain.value = this.masterVolume;
    master.connect(ctx.destination);

    // White noise for drums, impacts and radio mumble.
    const noise = ctx.createBuffer(1, sr, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = this.rng.range(-1, 1);

    // Engine: sawtooth plus an octave-lower square, through a lowpass.
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.Q.value = 1;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    const f0 = engineFrequency(0, 0);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f0;
    const sq = ctx.createOscillator();
    sq.type = 'square';
    sq.frequency.value = f0 / 2;
    saw.connect(engineFilter);
    sq.connect(engineFilter);
    saw.start(now);
    sq.start(now);

    // City hum: looping pink-ish noise through a lowpass.
    const humBuf = ctx.createBuffer(1, sr * 2, sr);
    humBuf.getChannelData(0).set(pinkNoise(sr * 2, () => this.rng.next()));
    const hum = ctx.createBufferSource();
    hum.buffer = humBuf;
    hum.loop = true;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 500;
    const humGain = ctx.createGain();
    humGain.gain.value = HUM_GAIN;
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(master);
    hum.start(now);

    // Radio bus: sequencer output, faded in and out with the vehicle state.
    const radioBus = ctx.createGain();
    radioBus.gain.value = this.radioOn ? RADIO_GAIN : 0;
    radioBus.connect(master);

    const g: Graph = { ctx, master, saw, sq, engineFilter, engineGain, radioBus, noise };
    this.applyEngine(g);
    return g;
  }

  private applyEngine(g: Graph): void {
    const now = g.ctx.currentTime;
    const throttle = clamp01(this.engineThrottle);
    const f = engineFrequency(this.engineSpeed, throttle);
    g.saw.frequency.setTargetAtTime(f, now, 0.05);
    g.sq.frequency.setTargetAtTime(f / 2, now, 0.05);
    g.engineFilter.frequency.setTargetAtTime(300 + 900 * throttle, now, 0.1);
    const target = this.engineOn ? 0.04 + 0.08 * throttle : 0;
    g.engineGain.gain.setTargetAtTime(target, now, 0.2);
  }

  /* ---------- one-shots ---------- */

  private playHorn(): void {
    const g = this.g;
    if (!g) return;
    const t = g.ctx.currentTime;
    for (const f of hornFrequencies()) {
      this.tone(g, { type: 'square', freq: f, t, dur: 0.4, peak: 0.06, dest: g.master });
    }
  }

  private playImpact(strength: number): void {
    const g = this.g;
    if (!g) return;
    const peak = impactGain(strength) * 0.6;
    if (peak < 0.01) return;
    const t = g.ctx.currentTime;
    this.noiseBurst(g, { t, dur: 0.25, type: 'lowpass', hz: 2400, sweepTo: 200, peak, dest: g.master });
  }

  private playSiren(g: Graph, t: number): void {
    const osc = g.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 1.25);
    osc.frequency.linearRampToValueAtTime(600, t + 2.5);
    // Low-passed to sound distant.
    const muffle = g.ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 1200;
    const amp = g.ctx.createGain();
    shape(amp.gain, t, 0.02, 2.7);
    osc.connect(muffle);
    muffle.connect(amp);
    amp.connect(g.master);
    osc.start(t);
    osc.stop(t + 2.7);
  }

  /* ---------- radio ---------- */

  private setRadioOn(on: boolean): void {
    this.radioOn = on;
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    g.radioBus.gain.setTargetAtTime(on ? RADIO_GAIN : 0, now, 0.1);
    if (on) this.nextNoteTime = now + 0.02;
  }

  private scheduleRadio(g: Graph, now: number): void {
    // After a stall (e.g. a backgrounded tab) resume from now instead of bursting.
    if (this.nextNoteTime < now) this.nextNoteTime = now;
    const station = STATIONS[this.stationIndex];
    const stepSec = stepSeconds(station.bpm);
    if (!(stepSec > 0)) return;
    while (this.nextNoteTime < now + LOOKAHEAD) {
      for (const n of patternAt(station, this.step)) {
        this.playNote(g, n, this.nextNoteTime, stepSec);
      }
      this.nextNoteTime += stepSec;
      this.step++;
    }
  }

  private playNote(g: Graph, n: Note, t: number, stepSec: number): void {
    const dest = g.radioBus;
    const len = n.len * stepSec;
    switch (n.voice) {
      case 'kick':
        this.tone(g, { type: 'sine', freq: 150, sweepTo: 45, sweepDur: 0.12, t, dur: 0.25, peak: 0.9 * n.gain, dest });
        break;
      case 'snare':
        this.noiseBurst(g, { t, dur: 0.15, type: 'highpass', hz: 1200, peak: 0.4 * n.gain, dest });
        break;
      case 'hat':
        this.noiseBurst(g, { t, dur: 0.05, type: 'highpass', hz: 7000, peak: 0.15 * n.gain, dest });
        break;
      case 'shaker':
        this.noiseBurst(g, { t, dur: 0.03, type: 'bandpass', hz: 5000, peak: 0.12 * n.gain, dest });
        break;
      case 'bass':
        this.tone(g, { type: 'sawtooth', freq: n.freq, t, dur: len, peak: 0.25 * n.gain, lowpass: 500, dest });
        break;
      case 'arp':
        this.tone(g, { type: 'square', freq: n.freq, t, dur: len * 0.9, peak: 0.5 * n.gain, dest });
        break;
      case 'mumble':
        this.noiseBurst(g, { t, dur: len, type: 'lowpass', hz: 900, peak: 0.5 * n.gain, dest });
        break;
    }
  }

  /* ---------- node helpers ---------- */

  private tone(
    g: Graph,
    o: {
      type: OscillatorType; freq: number; t: number; dur: number; peak: number; dest: AudioNode;
      sweepTo?: number; sweepDur?: number; lowpass?: number;
    },
  ): void {
    const osc = g.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, o.t);
    if (o.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(o.sweepTo, o.t + (o.sweepDur ?? o.dur));
    }
    const amp = g.ctx.createGain();
    shape(amp.gain, o.t, o.peak, o.dur);
    if (o.lowpass !== undefined) {
      const f = g.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      f.connect(amp);
    } else {
      osc.connect(amp);
    }
    amp.connect(o.dest);
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.02);
  }

  private noiseBurst(
    g: Graph,
    o: {
      t: number; dur: number; type: BiquadFilterType; hz: number; peak: number; dest: AudioNode;
      sweepTo?: number;
    },
  ): void {
    const src = g.ctx.createBufferSource();
    src.buffer = g.noise;
    const f = g.ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.hz, o.t);
    if (o.sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(o.sweepTo, o.t + o.dur);
    const amp = g.ctx.createGain();
    shape(amp.gain, o.t, o.peak, o.dur);
    src.connect(f);
    f.connect(amp);
    amp.connect(o.dest);
    // Random offset into the 1 s noise buffer so repeats do not sound identical.
    src.start(o.t, this.rng.range(0, 0.8), o.dur + 0.02);
    src.stop(o.t + o.dur + 0.02);
  }
}
