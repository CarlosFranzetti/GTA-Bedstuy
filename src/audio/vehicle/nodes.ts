/**
 * Web Audio side of the vehicle sound model. Works on a live or offline context: everything is AudioParam
 * automation at an explicit time, no node creation per frame. Horn one-shots build nodes per press (rare).
 */
import { EngineSim, distanceGain, dopplerRatio, pickNearest, engineVoiceFor, type EngineFrame, type EngineVoice } from './engineModel';
import { hornTones, sirenHz, type HornSpec, type SirenMode } from './hornModel';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
/** Harmonic wavetable: amplitude k^-tilt, even harmonics scaled. Falls back to a sawtooth on contexts without PeriodicWave. */
export function harmonicWave(ctx: BaseAudioContext, h: [number, number, number]): PeriodicWave | null {
  if (typeof ctx.createPeriodicWave !== 'function') return null;
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  const key = h.join();
  let w = m.get(key);
  if (!w) {
    const re = new Float32Array(h[2] + 1), im = new Float32Array(h[2] + 1);
    for (let k = 1; k <= h[2]; k++) im[k] = k ** -h[0] * (k % 2 === 0 ? h[1] : 1) * (k === 1 ? 0.8 : 1);
    m.set(key, (w = ctx.createPeriodicWave(re, im)));
  }
  return w;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, h?: [number, number, number]): OscillatorNode {
  const o = ctx.createOscillator();
  const w = h ? harmonicWave(ctx, h) : null;
  if (w) o.setPeriodicWave(w); else o.type = h ? 'sawtooth' : type;
  return o;
}
function gain(ctx: BaseAudioContext, v: number, to?: AudioNode | AudioParam): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  if (to) (g as GainNode).connect(to as AudioNode);
  return g;
}
function filt(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q = 0.7, to?: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = hz; f.Q.value = q;
  if (to) f.connect(to);
  return f;
}

/** Full-quality engine for the player's car. */
export class EngineNodes {
  readonly out: GainNode;
  private readonly A: OscillatorNode; private readonly B: OscillatorNode; private readonly S: OscillatorNode;
  private readonly mix: GainNode; private readonly gS: GainNode; private readonly lp: BiquadFilterNode; private readonly ex: BiquadFilterNode;
  private readonly lim: GainNode; private readonly lope: OscillatorNode; private readonly lopeD: GainNode;
  private readonly bp: BiquadFilterNode; private readonly gAir: GainNode;
  private readonly oscs: AudioScheduledSourceNode[] = [];
  private tur?: { o: OscillatorNode; g: GainNode };
  private clat?: { sq: OscillatorNode; d: GainNode; g: GainNode };
  private whn?: { o: OscillatorNode; o2: OscillatorNode; g: GainNode };
  private rat?: { o: OscillatorNode; g: GainNode };
  private pop?: GainNode;
  private st?: { o: OscillatorNode; g: GainNode };
  private rev?: { o: OscillatorNode; g: GainNode };
  private spool = 0;

  constructor(readonly ctx: BaseAudioContext, readonly voice: EngineVoice, noise: AudioBuffer, dest: AudioNode, t0 = ctx.currentTime) {
    const v = voice;
    this.out = gain(ctx, 0, dest);
    this.lim = gain(ctx, 1, this.out);
    this.ex = filt(ctx, 'peaking', v.ex[0], v.ex[1], this.lim);
    this.ex.gain.value = v.ex[2];
    this.lp = filt(ctx, 'lowpass', v.tone, 0.8, this.ex);
    this.mix = gain(ctx, 1, this.lp);
    this.A = osc(ctx, 'sawtooth', v.h); this.B = osc(ctx, 'sawtooth', v.h); this.S = osc(ctx, 'sine');
    this.B.detune.value = v.det;
    const gA = gain(ctx, 0.55, this.mix), gB = gain(ctx, 0.4, this.mix);
    this.gS = gain(ctx, v.sub * 0.8, this.mix);
    this.A.connect(gA); this.B.connect(gB); this.S.connect(this.gS);
    this.lope = ctx.createOscillator(); this.lope.type = 'sine';
    this.lopeD = gain(ctx, v.lope * 0.5, this.mix.gain);
    this.lope.connect(this.lopeD);
    this.mix.gain.value = 1 - v.lope * 0.25;
    // intake roar bypasses the throttle lowpass
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    this.bp = filt(ctx, 'bandpass', 900, 0.8);
    this.gAir = gain(ctx, 0, this.out);
    src.connect(this.bp); this.bp.connect(this.gAir);
    this.oscs.push(this.A, this.B, this.S, this.lope, src as unknown as AudioScheduledSourceNode);
    if (v.turbo) { const o = ctx.createOscillator(); this.tur = { o, g: gain(ctx, 0, this.out) }; o.connect(this.tur.g); this.oscs.push(o); }
    if (v.clat) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const g = gain(ctx, 0, this.out), sq = ctx.createOscillator(); sq.type = 'square';
      const d = gain(ctx, 0, g.gain);
      n.connect(filt(ctx, 'highpass', 1500, 0.7, g)); sq.connect(d);
      this.clat = { sq, d, g }; this.oscs.push(n as unknown as AudioScheduledSourceNode, sq);
    }
    if (v.whine) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = gain(ctx, 0, this.out);
      o.connect(g); o2.connect(g); this.whn = { o, o2, g }; this.oscs.push(o, o2);
    }
    if (v.rat) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 83;
      const g = gain(ctx, 0, this.out); o.connect(filt(ctx, 'bandpass', 2400, 2, g)); this.rat = { o, g }; this.oscs.push(o);
    }
    if (v.crack || v.turbo) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      this.pop = gain(ctx, 0.0001, this.out); n.connect(filt(ctx, 'highpass', 900, 0.7, this.pop)); this.oscs.push(n as unknown as AudioScheduledSourceNode);
    }
    {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const g = gain(ctx, 0, this.out); o.connect(filt(ctx, 'bandpass', 900, 1.5, g)); this.st = { o, g }; this.oscs.push(o);
    }
    {
      const o = ctx.createOscillator(); o.type = 'sine'; const g = gain(ctx, 0, this.out); o.connect(g); this.rev = { o, g }; this.oscs.push(o);
    }
    for (const s of this.oscs) (s as OscillatorNode).start(t0);
  }

  /** Schedule one frame of engine state at time t. `speed` m/s, `reverse` adds the reverse gear whine. */
  apply(f: EngineFrame, t: number, speed = 0, reverse = false): void {
    const v = this.voice, tc = 0.03;
    const rn = clamp(f.rpm / v.red, 0, 1), L = f.load;
    const cents = f.wob;
    this.A.frequency.setTargetAtTime(Math.max(5, f.fire), t, tc);
    this.B.frequency.setTargetAtTime(Math.max(5, f.fire), t, tc);
    this.A.detune.setTargetAtTime(cents, t, tc);
    this.S.frequency.setTargetAtTime(Math.max(3, f.fire / 2), t, tc);
    this.lope.frequency.setTargetAtTime(Math.max(1, f.rev / 2), t, tc);
    this.lopeD.gain.setTargetAtTime(v.lope * (0.55 - 0.35 * L) * f.level, t, 0.08);
    this.lp.frequency.setTargetAtTime(v.tone * (0.5 + rn) + v.open * L * (0.3 + rn), t, 0.05);
    this.ex.gain.setTargetAtTime(v.ex[2] * (0.5 + 0.5 * L), t, 0.08);
    const dip = (v.ev ? 0.03 : 1) * (f.shifting ? 0.6 : 1) * (f.cut ? 0.12 : 1) * (f.miss ? 0.15 : 1);
    this.lim.gain.setTargetAtTime(dip, t, f.miss ? 0.008 : 0.01);
    this.out.gain.setTargetAtTime(0.4 * v.g * f.level * (0.5 + 0.5 * (L * 0.7 + rn * 0.5)), t, 0.04);
    this.bp.frequency.setTargetAtTime(350 + 2300 * rn, t, 0.08);
    this.gAir.gain.setTargetAtTime(v.air * 0.13 * (0.12 + 0.88 * L * (0.3 + rn)) * f.level, t, 0.08);
    if (this.tur) {
      this.spool += (L * rn - this.spool) * 0.05;
      this.tur.o.frequency.setTargetAtTime(2200 + 7000 * this.spool, t, 0.06);
      this.tur.g.gain.setTargetAtTime((v.turbo ?? 0) * 0.011 * this.spool * f.level, t, 0.08);
    }
    if (this.clat) {
      const a = (v.clat ?? 0) * 0.05 * (0.5 + 0.5 * L) * f.level * 0.5;
      this.clat.sq.frequency.setTargetAtTime(Math.max(5, f.fire), t, tc);
      this.clat.d.gain.setTargetAtTime(a, t, 0.05);
      this.clat.g.gain.setTargetAtTime(a, t, 0.05);
    }
    if (this.whn) {
      const w = v.ev ? 170 + f.rpm * 0.3 : 320 + speed * 42 + rn * 500;
      this.whn.o.frequency.setTargetAtTime(w, t, 0.05);
      this.whn.o2.frequency.setTargetAtTime(w * 2.01, t, 0.05);
      this.whn.g.gain.setTargetAtTime((v.whine ?? 0) * (v.ev ? 0.07 : 0.012) * (v.ev ? (0.15 + 0.85 * Math.min(1, rn * 4)) * (0.45 + 0.55 * L) : 0.3 + 0.7 * L) * f.level, t, 0.06);
    }
    if (this.rat) this.rat.g.gain.setTargetAtTime((v.rat ?? 0) * 0.05 * bump(f.rpm, 1900, 450) * f.level, t, 0.04);
    if (this.pop) {
      for (let i = 0; i < f.pops; i++) {
        const at = t + 0.03 + i * (0.05 + (i * 37 % 7) * 0.025);
        this.pop.gain.setValueAtTime(0.0001, at);
        this.pop.gain.linearRampToValueAtTime(0.09 * (0.5 + ((i * 53) % 5) / 8), at + 0.004);
        this.pop.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      }
      if (f.blowoff) {
        this.pop.gain.setValueAtTime(0.0001, t);
        this.pop.gain.linearRampToValueAtTime(0.03 * (v.turbo ?? 0), t + 0.03);
        this.pop.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      }
    }
    if (this.st) {
      this.st.o.frequency.setTargetAtTime(60 + f.rpm * 0.25, t, 0.03);
      this.st.g.gain.setTargetAtTime(f.starter * 0.03, t, 0.03);
    }
    if (this.rev) {
      this.rev.o.frequency.setTargetAtTime(380 + speed * 38, t, 0.05);
      this.rev.g.gain.setTargetAtTime(reverse && f.running && speed > 0.4 ? 0.01 : 0, t, 0.08);
    }
  }

  dispose(): void {
    for (const s of this.oscs) { try { (s as OscillatorNode).stop(); } catch { /* not started */ } }
    try { this.out.disconnect(); } catch { /* already gone */ }
  }
}

/** Cheap AI engine: one oscillator through a lowpass, distance gain, Doppler, optional pan. */
export class CheapVoice {
  private readonly o: OscillatorNode; private readonly lp: BiquadFilterNode; private readonly g: GainNode; private readonly pan: StereoPannerNode | null;
  id: string | null = null;
  sim: EngineSim | null = null;
  constructor(ctx: BaseAudioContext, dest: AudioNode, t0 = ctx.currentTime) {
    this.g = gain(ctx, 0);
    this.pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (this.pan) { this.g.connect(this.pan); this.pan.connect(dest); } else this.g.connect(dest);
    this.lp = filt(ctx, 'lowpass', 900, 0.7, this.g);
    this.o = osc(ctx, 'sawtooth', [1.1, 1, 12]);
    this.o.connect(this.lp);
    this.o.start(t0);
  }
  assign(id: string, type: string, rand?: () => number): void {
    this.id = id;
    this.sim = new EngineSim(engineVoiceFor(type), rand);
    this.sim.startNow();
  }
  release(t: number): void {
    this.id = null; this.sim = null;
    this.g.gain.setTargetAtTime(0, t, 0.08);
  }
  apply(t: number, f: EngineFrame, v: EngineVoice, level: number, doppler: number, pan: number): void {
    this.o.frequency.setTargetAtTime(Math.max(5, f.fire * doppler), t, 0.05);
    this.lp.frequency.setTargetAtTime((v.tone * (0.5 + f.rpm / v.red) + v.open * f.load * 0.4) * clamp(level * 3, 0.35, 1), t, 0.08);
    this.g.gain.setTargetAtTime(0.1 * v.g * level * (0.6 + 0.4 * f.load) * f.level, t, 0.1);
    if (this.pan) this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.1);
  }
  dispose(): void { try { this.o.stop(); } catch { /* not started */ } try { this.g.disconnect(); } catch { /* gone */ } }
}

export interface TrafficCar { id: string; type: string; x: number; z: number; vx: number; vz: number; speed: number; throttle: number }
export interface Listener { x: number; z: number; vx?: number; vz?: number; /** right-hand unit vector for panning */ rx?: number; rz?: number }

/** The nearest few AI cars get an engine voice; slots are pooled so nothing is created or destroyed per frame. */
export class TrafficEngines {
  private readonly slots: CheapVoice[] = [];
  constructor(private readonly ctx: BaseAudioContext, private readonly dest: AudioNode, readonly cap = 4, private readonly maxDist = 70, private readonly rand: () => number = Math.random) {}
  get active(): number { return this.slots.filter((s) => s.id !== null).length; }
  get created(): number { return this.slots.length; }
  ids(): string[] { return this.slots.flatMap((s) => (s.id ? [s.id] : [])); }

  update(dt: number, ls: Listener, cars: TrafficCar[], t = this.ctx.currentTime): void {
    const byId = new Map<string, { c: TrafficCar; d: number }>();
    for (const c of cars) byId.set(c.id, { c, d: Math.hypot(c.x - ls.x, c.z - ls.z) });
    const want = pickNearest(this.ids(), [...byId].map(([id, e]) => ({ id, d: e.d })), this.cap, this.maxDist);
    const wantSet = new Set(want);
    for (const s of this.slots) if (s.id && !wantSet.has(s.id)) s.release(t);
    const have = new Set(this.ids());
    for (const id of want) {
      if (have.has(id)) continue;
      let s = this.slots.find((x) => x.id === null);
      if (!s && this.slots.length < this.cap) { s = new CheapVoice(this.ctx, this.dest, t); this.slots.push(s); }
      if (s) { s.assign(id, byId.get(id)!.c.type, this.rand); have.add(id); }
    }
    for (const s of this.slots) {
      if (!s.id || !s.sim) continue;
      const e = byId.get(s.id)!;
      const fr = s.sim.update(dt, e.c.speed, e.c.throttle);
      const dx = e.c.x - ls.x, dz = e.c.z - ls.z, d = Math.max(0.1, e.d);
      const closing = -(((e.c.vx - (ls.vx ?? 0)) * dx + (e.c.vz - (ls.vz ?? 0)) * dz) / d);
      s.apply(t, fr, s.sim.v, distanceGain(e.d, this.maxDist), dopplerRatio(closing), ((dx * (ls.rx ?? 0) + dz * (ls.rz ?? 0)) / d) * 0.9);
    }
  }
  dispose(): void { for (const s of this.slots) s.dispose(); this.slots.length = 0; }
}

export interface HornHandle { release(t?: number): void; readonly done: boolean }

/** Plays a horn or siren. Held horns sustain until release(); the tail follows spec.rel. Novelty ooga on `novelty`. */
export function playHorn(ctx: BaseAudioContext, dest: AudioNode, h: HornSpec, t: number, opts: { mode?: SirenMode; gain?: number; novelty?: boolean; tapMax?: number } = {}): HornHandle {
  const g = opts.gain ?? 1;
  const amp = gain(ctx, 0.0001, dest);
  const lp = filt(ctx, 'lowpass', h.lp, 0.8, amp);
  const srcs: OscillatorNode[] = [];
  const peak = 0.09 * g * h.gain * (h.kind === 'siren' ? 1.7 : 1);
  let doubleTap = h.kind === 'cab';
  if (h.kind === 'siren') {
    const o = osc(ctx, 'square', [1.3, 0.4, 10]);
    const mode = opts.mode ?? 'wail';
    for (let s = 0; s < 14; s += mode === 'yelp' ? 0.065 : mode === 'whoop' ? 0.04 : mode === 'wail' ? 0.1 : 0.5) {
      const hz = sirenHz(mode, s) * h.root / 520;
      if (mode === 'wail' || mode === 'yelp') { if (s === 0) o.frequency.setValueAtTime(hz, t); else o.frequency.linearRampToValueAtTime(hz, t + s); }
      else o.frequency.setValueAtTime(hz > 0 ? hz : 380, t + s);
      if (mode === 'whoop' || mode === 'hilo' || mode === 'parody') amp.gain.setValueAtTime(hz > 0 ? peak : 0.0001, t + s);
    }
    o.connect(lp); o.start(t); srcs.push(o);
  } else if (opts.novelty) {
    // ah-OO-gah
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(260, t); o.frequency.setValueAtTime(260, t + 0.14);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.22); o.frequency.setValueAtTime(190, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.7);
    o.connect(lp); o.start(t); srcs.push(o);
  } else {
    for (const f of hornTones(h)) {
      const o = ctx.createOscillator(); o.type = h.wave;
      o.frequency.setValueAtTime(h.kind === 'beep' ? f * 0.82 : f, t);
      if (h.kind === 'beep') o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      if (h.kind === 'weak') o.frequency.exponentialRampToValueAtTime(f * 0.93, t + 0.6);
      o.detune.value = (srcs.length - 0.5) * 6;
      o.connect(lp); o.start(t); srcs.push(o);
    }
  }
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + h.atk);
  let done = false;
  let tapEnd = t + h.atk + 0.15;
  if (doubleTap) { tapEnd = t + 0.5; amp.gain.setValueAtTime(peak, t + 0.14); amp.gain.linearRampToValueAtTime(0.0001, t + 0.16); amp.gain.linearRampToValueAtTime(peak, t + 0.24); }
  const stop = (at: number) => {
    done = true;
    amp.gain.cancelScheduledValues(at);
    amp.gain.setValueAtTime(Math.max(0.0001, peak), at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + h.rel);
    for (const o of srcs) o.stop(at + h.rel + 0.03);
  };
  return {
    release(at = ctx.currentTime) { if (!done) stop(Math.max(at, doubleTap ? tapEnd : t + h.atk + 0.08)); },
    get done() { return done; },
  };
}
