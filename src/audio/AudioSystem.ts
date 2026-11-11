/**
 * Procedural Web Audio: engine, horn, impacts, city hum, night sirens and parody radio.
 * Every sound is an oscillator, a noise buffer or a filter. No audio files, no fetches.
 *
 * Before start() no audio nodes exist. Calls before start() only record state, which is applied
 * when the graph is built. start() is called on the first userGesture event, or by the integrator.
 */
import type { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { engineFrequency, gearForSpeed, gearShiftFactor, hornFrequencies, impactGain, pinkNoise, squealLevel, scJingle, stationJingle, stingDuration, talkSting, TALK_BED_FREQS, type StingNote, type TalkStingKind } from './synth';
import { patternAt, stepSeconds, type Note } from './radio';
import { Library, localLibraryStorage, type LibraryStorage } from './library/Library';
import { LibraryController, type ControllerDeps } from './library/LibraryController';
import { RadioDirector } from './RadioDirector';
import { ScStation, type ScEnv } from './sc/ScStation';
import type { RaFeed } from './sc/RaFeed';
import type { BroadcastContext } from './announcer/Announcer';
import { HtmlAudioDeck } from './decks';
import { TalkPlayer, type SpeechLike, type UtteranceLike } from './talk/TalkPlayer';
import { VoiceHub, looksLikePhone, type HdState } from './voice/VoiceHub';
import { TalkStation, type TalkLike } from './voice/TalkStation';
import { DjScheduler } from './voice/Scheduler';
import type { TtsEngine } from './voice/types';
import type { PersistentStore } from './voice/ClipCache';
import { loadBundledScript, type TalkSegment } from './talk/script';

/** Seconds of audio queued ahead of currentTime by the radio sequencer. */
const LOOKAHEAD = 0.1;
const HUM_GAIN = 0.05;
const RADIO_GAIN = 0.25;
/** Level of the bus that carries the user's tracks, stings and the talk bed (files are full scale, so louder than the synth bus). */
const MUSIC_GAIN = 0.7;
/** Talk bed gain at level 1 (the player ducks it to about a quarter under the host). */
const TALK_BED_GAIN = 0.05;
const DAY_BED_GAIN = 0.035;
const NIGHT_BED_GAIN = 0.05;
const CRICKET_GAIN = 0.004;
const SQUEAL_GAIN = 0.07;
/** Seconds for the pitch dip after a gear change to recover. */
const SHIFT_RECOVERY = 0.35;
/** Time constant (s) of the day/night ambience crossfade. */
const AMBIENCE_TC = 2.5;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  saw: OscillatorNode;
  sq: OscillatorNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  radioBus: GainNode;
  musicBus: GainNode;
  dayGain: GainNode;
  nightGain: GainNode;
  squealGain: GainNode;
  squealFilter: BiquadFilterNode;
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

export interface AudioSystemOptions {
  /** Library of the player's own files. Default: persisted in localStorage. */
  library?: Library;
  /** Storage for the default library (ignored when `library` is given). Null disables persistence. */
  storage?: LibraryStorage | null;
  /** SpeechSynthesis, or null when the device has none. Default: the browser's. */
  speech?: SpeechLike | null;
  makeUtterance?: (text: string) => UtteranceLike;
  /** Talk show script. Default: src/audio/talk/script.json when present. */
  script?: TalkSegment[];
  /** Folder-handle store and importer overrides (tests). */
  controller?: ControllerDeps;
  /** Radio SC station override (tests). Default: the real widget-backed station. */
  sc?: ScStation;
  /** Shared ra-nyc pool override (tests). Null disables the pool. */
  feed?: RaFeed | null;
  /** Extra environment for every SoundCloud station (tests: canLoad, loadApi, doc, timeoutMs). */
  scEnv?: Partial<ScEnv>;
  /** VOX: HD voices. `hosted` defaults to the VITE_HOSTED build flag; `engine` and `store` are test seams. */
  voice?: { hosted?: boolean; phone?: boolean; artifact?: boolean; storage?: Pick<Storage, 'getItem' | 'setItem'> | null; engine?: () => TtsEngine; store?: PersistentStore | null };
}

function hostedBuild(): boolean {
  try { return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_HOSTED === '1'; } catch { return false; }
}
function detectPhone(): boolean {
  try {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return looksLikePhone(typeof navigator === 'undefined' ? undefined : navigator, coarse);
  } catch { return false; }
}
function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function browserSpeech(): SpeechLike | null {
  try {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return null;
    return speechSynthesis as unknown as SpeechLike;
  } catch { return null; }
}

export class AudioSystem {
  private g: Graph | null = null;
  private readonly hub: VoiceHub;
  /** Radio dial, music library decks and the talk show. */
  readonly radio: RadioDirector;
  /** Folder picker / file import / reset for the player's library (used by RadioUi). */
  readonly libraryController: LibraryController;
  private bed: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
  private bedLevel = 0;
  private lastSynthEpoch = -1;
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
  private radioVolume = 1;
  private slip = 0;
  private handbrake = false;
  /** 1 = steady; <1 right after an upshift, >1 after a downshift. Decays back to 1. */
  private shiftFactor = 1;
  private gear = -1;
  /** Reasons the context is suspended ('menu', 'hidden', ...). Empty = running. */
  private readonly pauseReasons = new Set<string>();
  private readonly onVisibility = () => {
    if (document.hidden) this.pause('hidden'); else this.resume('hidden');
  };
  private step = 0;
  private nextNoteTime = 0;

  constructor(events: EventBus, createContext?: () => AudioContext, opts: AudioSystemOptions = {}) {
    this.createContext = createContext ?? (() => new AudioContext());
    const library = opts.library ?? new Library(opts.storage === undefined ? localLibraryStorage() : opts.storage);
    const speech = opts.speech === undefined ? browserSpeech() : opts.speech;
    const makeUtt = opts.makeUtterance ?? ((text: string) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike);
    const vo = opts.voice ?? {};
    this.hub = new VoiceHub({
      ctx: () => this.g?.ctx ?? null,
      dest: () => this.g?.musicBus ?? null,
      speech,
      makeUtterance: makeUtt,
      volume: () => this.radioVolume,
      hosted: vo.hosted ?? hostedBuild(),
      phone: vo.phone ?? detectPhone(),
      artifact: vo.artifact,
      storage: vo.storage === undefined ? safeStorage() : vo.storage,
      persist: vo.store,
      engineFactory: vo.engine,
    });
    const talk: TalkLike = opts.script ? new TalkPlayer({
      speech,
      makeUtterance: opts.makeUtterance ?? ((text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike),
      audio: {
        sting: (kind) => this.playSting(talkSting(kind), kind),
        setBed: (level) => this.setBed(level),
        volume: () => this.radioVolume,
      },
    }, opts.script) : new TalkStation({
      hub: this.hub,
      context: () => this.radio.broadcastContext,
      setBed: (level) => this.setBed(level),
    });
    this.radio = new RadioDirector(library, talk, undefined, opts.sc, {
      feed: opts.feed,
      scEnv: opts.scEnv,
      voice: { speech, makeUtterance: makeUtt, volume: () => this.radioVolume, dj: new DjScheduler(), hub: this.hub },
    });
    this.libraryController = new LibraryController(library, opts.controller);
    void this.libraryController.init().catch(() => undefined);
    this.radio.onTune = (entry) => {
      const g = this.g;
      if (!g || !this.radioOn) return;
      // A blip of dial static, then the station's own jingle (WBSY Talk has its own stings).
      this.noiseBurst(g, { t: g.ctx.currentTime, dur: 0.18, type: 'bandpass', hz: 2500, peak: 0.12, dest: g.musicBus });
      if (entry.kind !== 'talk') this.playSting(entry.id === 'sc' ? scJingle() : stationJingle(entry.id));
    };
    this.radio.onSweeper = (entry) => { if (this.radioOn && this.g) this.playSting(entry.id === 'sc' ? scJingle() : stationJingle(entry.id)); };
    this.unsubs.push(
      events.on('userGesture', () => { void this.start(); void this.libraryController.autoReconnect().catch(() => undefined); }),
      events.on('horn', () => this.playHorn()),
      events.on('impact', (e) => this.playImpact(e.strength)),
      events.on('enterVehicle', () => this.setRadioOn(true)),
      events.on('exitVehicle', () => this.setRadioOn(false)),
      events.on('radioNext', () => this.nextStation()),
    );
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.unsubs.push(() => document.removeEventListener('visibilitychange', this.onVisibility));
    }
  }

  /** Creates the AudioContext once and resumes it. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (!this.g) {
      this.g = this.build(this.createContext());
      this.hub.onGesture();
      // Built while paused (menu open, tab hidden): keep it quiet until every reason is released.
      if (this.pauseReasons.size > 0 && typeof this.g.ctx.suspend === 'function') void Promise.resolve(this.g.ctx.suspend()).catch(() => undefined);
    }
    this.syncRadioOn();
    if (this.pauseReasons.size === 0 && this.g.ctx.state === 'suspended') {
      try {
        await this.g.ctx.resume();
      } catch {
        // Autoplay policy refused. The next user gesture retries.
      }
    }
  }

  /** Call once per frame. Drives the radio sequencer and the siren timer. */
  update(dt: number): void {
    if (this.pauseReasons.size > 0) return;
    this.radio.update(dt);
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (this.shiftFactor !== 1) {
      const k = Math.min(1, dt / SHIFT_RECOVERY);
      this.shiftFactor += (1 - this.shiftFactor) * k;
      if (Math.abs(this.shiftFactor - 1) < 0.003) this.shiftFactor = 1;
      this.applyEngine(g);
    }
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
    const gear = inVehicle ? gearForSpeed(speed) : -1;
    // Shift only when already driving in a known gear, and only under power for upshifts.
    if (this.gear > 0 && gear > 0 && gear !== this.gear && (gear < this.gear || clamp01(throttle) > 0.3)) {
      this.shiftFactor = gearShiftFactor(this.gear, gear);
    }
    this.gear = gear;
    if (this.g) {
      this.applyEngine(this.g);
      this.applySqueal(this.g);
    }
  }

  /** Lateral tyre slip 0..1 (drift / skid). Ask the vehicle for it; without one, use `setHandbrake`. */
  setSlip(slip: number): void {
    this.slip = clamp01(slip);
    if (this.g) this.applySqueal(this.g);
  }

  /** Fallback squeal trigger when the vehicle exposes no slip value. */
  setHandbrake(on: boolean): void {
    this.handbrake = on;
    if (this.g) this.applySqueal(this.g);
  }

  /** Crossfades the day and night ambience beds (about 2.5 s time constant). */
  setNight(night: boolean): void {
    if (night === this.night) return;
    this.night = night;
    if (night) this.sirenIn = 20 + this.rng.range(0, 40);
    if (this.g) this.applyAmbience(this.g);
  }

  /** Radio level, independent of the master volume. 0..1. */
  setRadioVolume(v: number): void {
    this.radioVolume = clamp01(v);
    this.syncScVolume();
    const g = this.g;
    if (g) this.applyRadioGain(g, 0.05);
  }

  /**
   * Suspends the AudioContext (pause menu, hidden tab). Reasons stack: the context resumes only once every
   * reason has been released. Safe before start() (the context then stays suspended once created).
   */
  pause(reason = 'manual'): void {
    this.pauseReasons.add(reason);
    this.radio.setPaused(true);
    const g = this.g;
    if (g && typeof g.ctx.suspend === 'function') void Promise.resolve(g.ctx.suspend()).catch(() => undefined);
  }

  resume(reason = 'manual'): void {
    this.pauseReasons.delete(reason);
    const g = this.g;
    if (this.pauseReasons.size === 0) this.radio.setPaused(false);
    if (this.pauseReasons.size > 0 || !g) return;
    if (g.ctx.state !== 'running' && typeof g.ctx.resume === 'function') void Promise.resolve(g.ctx.resume()).catch(() => undefined);
  }

  /** Convenience for integrators: `setPaused(true)` is `pause('menu')`, `setPaused(false)` is `resume('menu')`. */
  setPaused(paused: boolean): void {
    if (paused) this.pause('menu'); else this.resume('menu');
  }

  get paused(): boolean { return this.pauseReasons.size > 0; }

  /** The SoundCloud widget has its own output, so the game's master x radio level is mapped onto it. */
  private syncScVolume(): void {
    this.radio.setScVolume(this.masterVolume * this.radioVolume);
  }

  /** Radio SC station (mix list, next mix, test) for the Radio library panel. */
  get sc(): ScStation { return this.radio.sc; }

  /** All eight SoundCloud stations in dial order (for the Radio library panel). */
  get scStations(): readonly ScStation[] { return this.radio.scStations; }

  /** Hour (0..24), weather ('dry' | 'rain' | 'wet' | 'drying'), rain 0..1 and street name for the announcers' time and weather lines. */
  setBroadcast(ctx: Partial<BroadcastContext>): void { this.radio.setBroadcast(ctx); }

  /** HD voices (on-device neural TTS): toggle, state for the UI and the one-line size note. */
  get hdVoices(): boolean { return this.hub.hdEnabled; }
  get hdState(): HdState { return this.hub.state; }
  get hdLabel(): string { return this.hub.label; }
  setHdVoices(on: boolean): void { this.hub.setHd(on); }
  onHdChange(f: () => void): () => void { return this.hub.onChange(f); }

  /** Text the announcer is saying (subtitle; also the only output on devices with no speech voices). */
  get announcerLine(): string { return this.radio.announcerLine; }

  nextStation(): void {
    this.radio.next();
  }

  /** Name of the tuned station (keeps the station name; the track is `trackName`). */
  get stationName(): string {
    return this.radio.stationName;
  }

  /** Now playing: user file name without extension, or the talk-show speaker. Empty for synth music. */
  get trackName(): string {
    return this.radio.trackName;
  }

  /** Position 0..1 through the WBSY Talk loop while tuned in, otherwise 0. */
  get talkProgress(): number {
    return this.radio.talkProgress;
  }

  /** Audio context + master bus for the DJ decks and interior ambience (null until the first user gesture started audio). */
  get djHost(): { ctx: AudioContext; dest: AudioNode } | null { return this.g ? { ctx: this.g.ctx, dest: this.g.master } : null; }
  /** The player's radio library (for the Radio library panel). */
  get library(): Library {
    return this.radio.library;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    this.syncScVolume();
    const g = this.g;
    if (g) g.master.gain.setTargetAtTime(this.masterVolume, g.ctx.currentTime, 0.05);
  }

  /** Unsubscribes from events and closes the context. */
  dispose(): void {
    this.unsubs.splice(0).forEach((fn) => fn());
    this.radio.dispose();
    const g = this.g;
    if (g && typeof g.ctx.close === 'function') void g.ctx.close().catch(() => undefined);
    this.g = null;
    this.bed = null;
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

    // City hum: looping pink-ish noise through a lowpass (always on, the base of both ambience beds).
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

    // Day bed: brighter traffic hiss. Night bed: darker rumble plus faint crickets.
    const dayFilter = ctx.createBiquadFilter();
    dayFilter.type = 'bandpass';
    dayFilter.frequency.value = 1100;
    const dayGain = ctx.createGain();
    dayGain.gain.value = this.night ? 0 : DAY_BED_GAIN;
    hum.connect(dayFilter);
    dayFilter.connect(dayGain);
    dayGain.connect(master);

    const nightFilter = ctx.createBiquadFilter();
    nightFilter.type = 'lowpass';
    nightFilter.frequency.value = 220;
    const nightGain = ctx.createGain();
    nightGain.gain.value = this.night ? NIGHT_BED_GAIN : 0;
    hum.connect(nightFilter);
    nightFilter.connect(nightGain);
    nightGain.connect(master);
    const cricket = ctx.createOscillator();
    cricket.type = 'sine';
    cricket.frequency.value = 4300;
    const cricketAmp = ctx.createGain();
    cricketAmp.gain.value = CRICKET_GAIN;
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 11;
    const chirpDepth = ctx.createGain();
    chirpDepth.gain.value = CRICKET_GAIN;
    chirp.connect(chirpDepth);
    chirpDepth.connect(cricketAmp.gain);
    cricket.connect(cricketAmp);
    cricketAmp.connect(nightGain);
    cricket.start(now);
    chirp.start(now);

    // Tyre squeal: looping noise through a bandpass, silent until slip is reported.
    const squealSrc = ctx.createBufferSource();
    squealSrc.buffer = noise;
    squealSrc.loop = true;
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.Q.value = 6;
    squealFilter.frequency.value = 1800;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    squealSrc.connect(squealFilter);
    squealFilter.connect(squealGain);
    squealGain.connect(master);
    squealSrc.start(now);

    // Radio bus: sequencer output, faded in and out with the vehicle state.
    const radioBus = ctx.createGain();
    radioBus.gain.value = this.radioOn ? RADIO_GAIN * this.radioVolume : 0;
    radioBus.connect(master);
    // Music bus: the player's tracks, stings and the talk bed.
    const musicBus = ctx.createGain();
    musicBus.gain.value = this.radioOn ? MUSIC_GAIN * this.radioVolume : 0;
    musicBus.connect(master);

    const g: Graph = { ctx, master, saw, sq, engineFilter, engineGain, radioBus, musicBus, dayGain, nightGain, squealGain, squealFilter, noise };
    this.applyEngine(g);
    this.applySqueal(g);
    // The user's files play through two media elements. Unlocking them here is inside the first user gesture (iOS).
    if (typeof Audio !== 'undefined' && typeof ctx.createMediaElementSource === 'function') {
      try { this.radio.attachDecks([new HtmlAudioDeck(ctx, musicBus), new HtmlAudioDeck(ctx, musicBus)]); } catch { /* no decks: synth only */ }
    }
    return g;
  }

  private applyEngine(g: Graph): void {
    const now = g.ctx.currentTime;
    const throttle = clamp01(this.engineThrottle);
    const f = engineFrequency(this.engineSpeed, throttle) * this.shiftFactor;
    g.saw.frequency.setTargetAtTime(f, now, 0.05);
    g.sq.frequency.setTargetAtTime(f / 2, now, 0.05);
    g.engineFilter.frequency.setTargetAtTime(300 + 900 * throttle, now, 0.1);
    const target = this.engineOn ? 0.04 + 0.08 * throttle : 0;
    g.engineGain.gain.setTargetAtTime(target, now, 0.2);
  }

  private applySqueal(g: Graph): void {
    const now = g.ctx.currentTime;
    const slip = Math.max(this.slip, this.handbrake ? 0.7 : 0);
    const level = this.engineOn ? squealLevel(slip, this.engineSpeed) : 0;
    g.squealGain.gain.setTargetAtTime(level * SQUEAL_GAIN, now, 0.05);
    g.squealFilter.frequency.setTargetAtTime(1500 + Math.min(1, this.engineSpeed / 30) * 1200, now, 0.1);
  }

  private applyAmbience(g: Graph): void {
    const now = g.ctx.currentTime;
    g.dayGain.gain.setTargetAtTime(this.night ? 0 : DAY_BED_GAIN, now, AMBIENCE_TC);
    g.nightGain.gain.setTargetAtTime(this.night ? NIGHT_BED_GAIN : 0, now, AMBIENCE_TC);
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
    this.applyRadioGain(g, 0.1);
    if (on) this.nextNoteTime = g.ctx.currentTime + 0.02;
    this.syncRadioOn();
  }

  /** Tells the dial the radio is on only once audio has started (speech and files need the first gesture). */
  private syncRadioOn(): void {
    this.radio.setOn(this.radioOn && this.g !== null);
  }

  private applyRadioGain(g: Graph, tc: number): void {
    const now = g.ctx.currentTime;
    g.radioBus.gain.setTargetAtTime(this.radioOn ? RADIO_GAIN * this.radioVolume : 0, now, tc);
    g.musicBus.gain.setTargetAtTime(this.radioOn ? MUSIC_GAIN * this.radioVolume : 0, now, tc);
  }

  private scheduleRadio(g: Graph, now: number): void {
    const play = this.radio.synthPlayback;
    if (!play) { this.lastSynthEpoch = -1; return; }
    if (play.epoch !== this.lastSynthEpoch) {
      this.lastSynthEpoch = play.epoch;
      this.step = play.startStep;
      this.nextNoteTime = now;
    }
    // After a stall (e.g. a backgrounded tab) resume from now instead of bursting.
    if (this.nextNoteTime < now) this.nextNoteTime = now;
    const station = play.station;
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

  /** Plays a procedural sting on the music bus; returns its length in seconds (also when audio is not started). */
  private playSting(notes: StingNote[], _kind?: TalkStingKind): number {
    const g = this.g;
    if (g) {
      const t0 = g.ctx.currentTime + 0.02;
      for (const n of notes) this.tone(g, { type: n.type, freq: n.freq, t: t0 + n.t, dur: n.dur, peak: n.peak * 0.5, dest: g.musicBus });
    }
    return stingDuration(notes);
  }

  /** Quiet chord under the talk show; level 0 silences it. */
  private setBed(level: number): void {
    this.bedLevel = Math.max(0, level);
    const g = this.g;
    if (!g) return;
    if (!this.bed && this.bedLevel > 0) {
      const gain = g.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(g.musicBus);
      const oscs = TALK_BED_FREQS.map((f, i) => {
        const o = g.ctx.createOscillator();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = (i - 1.5) * 4;
        o.connect(gain);
        o.start(g.ctx.currentTime);
        return o;
      });
      this.bed = { gain, oscs };
    }
    this.bed?.gain.gain.setTargetAtTime(this.bedLevel * TALK_BED_GAIN, g.ctx.currentTime, 0.4);
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
      case 'sub':
        this.tone(g, { type: 'sine', freq: n.freq, sweepTo: n.freq * 0.8, sweepDur: Math.min(len, 0.6), t, dur: Math.min(len, 1.2), peak: 0.9 * n.gain, dest });
        break;
      case 'ride':
        this.noiseBurst(g, { t, dur: 0.22, type: 'bandpass', hz: 6500, peak: 0.2 * n.gain, dest });
        break;
      case 'pluck': {
        // Guitar-ish pluck with a dotted-eighth echo (three repeats) for the echo-dub sound.
        for (let k = 0; k < 4; k++) {
          this.tone(g, { type: 'triangle', freq: n.freq, t: t + k * stepSec * 3, dur: 0.3, peak: 0.45 * n.gain * 0.5 ** k, lowpass: 2200, dest });
        }
        break;
      }
      case 'wob':
        this.tone(g, { type: 'sine', freq: n.freq, t, dur: len, peak: 0.5 * n.gain, wobble: 0.018, dest });
        break;
    }
  }

  /* ---------- node helpers ---------- */

  private tone(
    g: Graph,
    o: {
      type: OscillatorType; freq: number; t: number; dur: number; peak: number; dest: AudioNode;
      sweepTo?: number; sweepDur?: number; lowpass?: number; wobble?: number;
    },
  ): void {
    const osc = g.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, o.t);
    if (o.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(o.sweepTo, o.t + (o.sweepDur ?? o.dur));
    } else if (o.wobble) {
      // Tape wobble: pitch drifts up and down a few cents over the note.
      osc.frequency.exponentialRampToValueAtTime(o.freq * (1 + o.wobble), o.t + o.dur * 0.3);
      osc.frequency.exponentialRampToValueAtTime(o.freq * (1 - o.wobble), o.t + o.dur * 0.65);
      osc.frequency.exponentialRampToValueAtTime(o.freq, o.t + o.dur);
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
