/**
 * Web Audio side of the vehicle sound model. Works on a live or offline context: everything is AudioParam
 * automation at an explicit time, no node creation per frame. Horn one-shots build nodes per press (rare).
 */
import { EngineSim, engineMix, distanceGain, dopplerRatio, pickNearest, engineVoiceFor, type EngineFrame, type EngineVoice } from './engineModel';
import { hornTones, sirenHz, SIREN_SPAN, HORN_BEAT_CENTS, AIR_BEND, type HornSpec, type SirenMode } from './hornModel';

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

const shaperCurves = new WeakMap<BaseAudioContext, Map<number, Float32Array>>();
/** tanh waveshaper curve for exhaust grit; drive 0..1. Cached per context. */
export function gritCurve(ctx: BaseAudioContext, drive: number): Float32Array {
  let m = shaperCurves.get(ctx);
  if (!m) shaperCurves.set(ctx, (m = new Map()));
  const key = Math.round(drive * 20);
  let c = m.get(key);
  if (!c) {
    const k = 1 + 7 * (key / 20), n = 257;
    c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    m.set(key, c);
  }
  return c;
}

/** Absolute levels (linear, before the vehicle bus) of the accessory layers; they do not follow the body gain, so a starter or a whistle is heard on its own terms. */
export const ACC = { starter: 0.03, turbo: 0.012, clat: 0.028, whine: 0.0065, ev: 0.025, ped: 0.007, rat: 0.016, pop: 0.08, bov: 0.08, rev: 0.008 } as const;

/** Full-quality engine for the player's car. */
export class EngineNodes {
  /** engine body; `acc` carries the accessories (starter, whistle, clatter, whine, pops) at their own level */
  readonly out: GainNode;
  readonly acc: GainNode;
  private readonly A: OscillatorNode; private readonly B: OscillatorNode; private readonly S: OscillatorNode;
  private readonly mix: GainNode; private readonly gS: GainNode; private readonly lp: BiquadFilterNode; private readonly ex: BiquadFilterNode;
  private readonly lim: GainNode; private readonly lope: OscillatorNode; private readonly lopeD: GainNode;
  private readonly bp: BiquadFilterNode; private readonly gAir: GainNode;
  private readonly oscs: AudioScheduledSourceNode[] = [];
  private sh: { o: OscillatorNode; g: GainNode; order: number; level: number }[] = [];
  private tur?: { o: OscillatorNode; g: GainNode };
  private clat?: { sq: OscillatorNode; d: GainNode; g: GainNode };
  private whn?: { o: OscillatorNode; o2: OscillatorNode; g: GainNode };
  private ped?: { o: OscillatorNode; g: GainNode };
  private rat?: { o: OscillatorNode; g: GainNode };
  private pop?: GainNode;
  private bov?: GainNode;
  private st?: { o: OscillatorNode; g: GainNode };
  private rev?: { o: OscillatorNode; g: GainNode };
  private spool = 0;

  constructor(readonly ctx: BaseAudioContext, readonly voice: EngineVoice, noise: AudioBuffer, dest: AudioNode, t0 = ctx.currentTime) {
    const v = voice;
    this.out = gain(ctx, 0, dest);
    this.acc = gain(ctx, 1, dest);
    this.lim = gain(ctx, 1, this.out);
    this.ex = filt(ctx, 'peaking', v.ex[0], v.ex[1], this.lim);
    this.ex.gain.value = v.ex[2];
    this.lp = filt(ctx, 'lowpass', v.tone, 0.8, this.ex);
    this.mix = gain(ctx, 1);
    if (v.drv && typeof ctx.createWaveShaper === 'function') {
      const ws = ctx.createWaveShaper();
      ws.curve = gritCurve(ctx, v.drv) as Float32Array<ArrayBuffer>;
      this.mix.connect(ws); ws.connect(this.lp);
    } else this.mix.connect(this.lp);
    this.A = osc(ctx, 'sawtooth', v.h); this.B = osc(ctx, 'sawtooth', v.h); this.S = osc(ctx, 'sine');
    this.B.detune.value = v.det;
    const gA = gain(ctx, 0.55, this.mix), gB = gain(ctx, 0.4, this.mix);
    this.gS = gain(ctx, v.sub * 0.8, this.mix);
    this.A.connect(gA); this.B.connect(gB); this.S.connect(this.gS);
    for (const [order, level] of v.sh ?? []) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = gain(ctx, level * 0.5, this.mix);
      o.connect(g); this.sh.push({ o, g, order, level }); this.oscs.push(o);
    }
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
    if (v.turbo) { const o = ctx.createOscillator(); this.tur = { o, g: gain(ctx, 0, this.acc) }; o.connect(this.tur.g); this.oscs.push(o); }
    if (v.clat) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const g = gain(ctx, 0, this.acc), sq = ctx.createOscillator(); sq.type = 'square';
      const d = gain(ctx, 0, g.gain);
      n.connect(filt(ctx, 'highpass', 1500, 0.7, g)); sq.connect(d);
      this.clat = { sq, d, g }; this.oscs.push(n as unknown as AudioScheduledSourceNode, sq);
    }
    if (v.whine) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = gain(ctx, 0, this.acc);
      o.connect(g); o2.connect(g); this.whn = { o, o2, g }; this.oscs.push(o, o2);
    }
    if (v.ped) {
      const o = ctx.createOscillator(), g = gain(ctx, 0, this.acc), lfo = ctx.createOscillator(), depth = gain(ctx, 70);
      o.type = 'triangle'; o.frequency.value = 760; lfo.frequency.value = 1.7;
      lfo.connect(depth); depth.connect(o.frequency); o.connect(g);
      this.ped = { o, g }; this.oscs.push(o, lfo);
    }
    if (v.rat) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 83;
      const g = gain(ctx, 0, this.acc); o.connect(filt(ctx, 'bandpass', 2400, 2, g)); this.rat = { o, g }; this.oscs.push(o);
    }
    if (v.crack || v.turbo || v.lope > 0.15) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      this.pop = gain(ctx, 0.0001, this.acc); n.connect(filt(ctx, 'bandpass', 700, 0.9, this.pop)); this.oscs.push(n as unknown as AudioScheduledSourceNode);
    }
    if (v.turbo) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      this.bov = gain(ctx, 0.0001, this.acc); n.connect(filt(ctx, 'bandpass', 4200, 1.1, this.bov)); this.oscs.push(n as unknown as AudioScheduledSourceNode);
    }
    {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const g = gain(ctx, 0, this.acc); o.connect(filt(ctx, 'bandpass', 900, 1.5, g)); this.st = { o, g }; this.oscs.push(o);
    }
    {
      const o = ctx.createOscillator(); o.type = 'sine'; const g = gain(ctx, 0, this.acc); o.connect(g); this.rev = { o, g }; this.oscs.push(o);
    }
    for (const s of this.oscs) (s as OscillatorNode).start(t0);
  }

  /** Schedule one frame of engine state at time t. `speed` m/s, `reverse` adds the reverse gear whine. */
  apply(f: EngineFrame, t: number, speed = 0, reverse = false): void {
    const v = this.voice, tc = 0.03;
    const rn = clamp(f.rpm / v.red, 0, 1), L = f.load;
    const cents = f.wob;
    const el = f.elec;
    this.A.frequency.setTargetAtTime(Math.max(5, f.fire), t, tc);
    this.B.frequency.setTargetAtTime(Math.max(5, f.fire), t, tc);
    this.A.detune.setTargetAtTime(cents, t, tc);
    this.S.frequency.setTargetAtTime(Math.max(3, f.fire / 2), t, tc);
    this.lope.frequency.setTargetAtTime(Math.max(1, f.rev / 2), t, tc);
    for (const h of this.sh) {
      h.o.frequency.setTargetAtTime(Math.max(1, f.rev * h.order), t, tc);
      h.g.gain.setTargetAtTime(h.level * 0.5 * (0.6 + 0.4 * L), t, 0.08);
    }
    const mix = engineMix(v, f);
    this.lopeD.gain.setTargetAtTime(mix.lope, t, 0.08);
    this.lp.frequency.setTargetAtTime(mix.lpHz, t, 0.05);
    this.ex.gain.setTargetAtTime(mix.ex, t, 0.08);
    this.lim.gain.setTargetAtTime(mix.lim, t, f.miss ? 0.008 : 0.01);
    this.out.gain.setTargetAtTime(mix.out, t, 0.04);
    this.bp.frequency.setTargetAtTime(350 + 2300 * rn, t, 0.08);
    this.gAir.gain.setTargetAtTime(mix.air * el, t, 0.08);
    if (this.tur) {
      this.spool += (L * rn - this.spool) * 0.05;
      this.tur.o.frequency.setTargetAtTime(2200 + 7000 * this.spool, t, 0.06);
      this.tur.g.gain.setTargetAtTime((v.turbo ?? 0) * ACC.turbo * this.spool * f.level * el, t, 0.08);
    }
    if (this.clat) {
      const a = (v.clat ?? 0) * ACC.clat * (0.5 + 0.5 * L) * f.level * el;
      this.clat.sq.frequency.setTargetAtTime(Math.max(5, f.fire), t, tc);
      this.clat.d.gain.setTargetAtTime(a * 0.5, t, 0.05);
      this.clat.g.gain.setTargetAtTime(a * 0.5, t, 0.05);
    }
    if (this.whn) {
      const sf = Math.min(1, Math.abs(speed) / v.vmax);
      // electric: inverter whine 1 to 8 kHz with speed; hybrid: a light motor whine that carries the car while the engine is off
      const w = v.ev ? 1000 + 7000 * sf : 320 + speed * 42 + rn * 500;
      this.whn.o.frequency.setTargetAtTime(w, t, 0.05);
      this.whn.o2.frequency.setTargetAtTime(w * 2.01, t, 0.05);
      const lvl = v.ev ? ACC.ev * (v.whine ?? 1) * 0.5 * Math.min(1, sf * 6) * (0.5 + 0.5 * L) : ACC.whine * (v.whine ?? 0) * (0.3 + 0.7 * L) * (1 + 2.5 * (1 - el)) * Math.min(1, Math.abs(speed) / 2);
      this.whn.g.gain.setTargetAtTime(lvl * (v.ev ? 1 : f.level), t, 0.06);
    }
    if (this.ped) {
      const sp = Math.abs(speed);
      this.ped.g.gain.setTargetAtTime((v.ped ?? 0) * ACC.ped * clamp(1 - sp / 8.3, 0, 1) * clamp((sp - 0.15) / 0.5, 0, 1) * (f.running ? 1 : 0), t, 0.1);
    }
    if (this.rat) this.rat.g.gain.setTargetAtTime((v.rat ?? 0) * ACC.rat * bump(f.rpm, 1900, 450) * f.level * el, t, 0.04);
    if (this.pop) {
      for (let i = 0; i < f.pops; i++) {
        const at = t + 0.03 + i * (0.05 + (i * 37 % 7) * 0.025);
        this.pop.gain.setValueAtTime(0.0001, at);
        this.pop.gain.linearRampToValueAtTime(ACC.pop * (0.5 + ((i * 53) % 5) / 8) * (0.5 + 0.5 * rn), at + 0.004);
        this.pop.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      }
    }
    if (this.bov && f.blowoff) {
      // blow-off: a tssh with one or two flutters on the hard-boosting cars
      const k = v.turbo ?? 0.3, g = this.bov.gain, n = k > 0.8 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const at = t + 0.02 + i * 0.1;
        g.setValueAtTime(0.0001, at);
        g.linearRampToValueAtTime(ACC.bov * k * (1 - i * 0.28), at + 0.012);
        g.exponentialRampToValueAtTime(0.0001, at + (i === n - 1 ? 0.38 : 0.09));
      }
    }
    if (this.st) {
      this.st.o.frequency.setTargetAtTime(60 + f.rpm * 0.25, t, 0.03);
      this.st.g.gain.setTargetAtTime(f.starter * ACC.starter, t, 0.03);
    }
    if (this.rev) {
      this.rev.o.frequency.setTargetAtTime(380 + speed * 38, t, 0.05);
      this.rev.g.gain.setTargetAtTime(reverse && f.running && speed > 0.4 ? ACC.rev : 0, t, 0.08);
    }
  }

  /** Fades everything out over `tail` seconds (the engine of a car the player has left) and then silences the graph. */
  retire(t = this.ctx.currentTime, tail = 0.5): void {
    this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(0, t, tail / 4);
    this.acc.gain.cancelScheduledValues(t); this.acc.gain.setTargetAtTime(0, t, tail / 4);
  }

  dispose(): void {
    for (const s of this.oscs) { try { (s as OscillatorNode).stop(); } catch { /* not started */ } }
    try { this.out.disconnect(); this.acc.disconnect(); } catch { /* already gone */ }
  }
}

/** Cheap AI engine: one oscillator through a lowpass, distance gain, Doppler, optional pan. */
export class CheapVoice {
  private readonly o: OscillatorNode; private readonly lp: BiquadFilterNode; private readonly g: GainNode; private readonly pan: StereoPannerNode | null;
  id: string | null = null;
  sim: EngineSim | null = null;
  /** a slot handed to a new car stays muted until this time so the old note fades before the new one starts (no pitch jump at full level) */
  private holdUntil = 0;
  private fresh = false;
  constructor(ctx: BaseAudioContext, dest: AudioNode, t0 = ctx.currentTime) {
    this.g = gain(ctx, 0);
    this.pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (this.pan) { this.g.connect(this.pan); this.pan.connect(dest); } else this.g.connect(dest);
    this.lp = filt(ctx, 'lowpass', 900, 0.7, this.g);
    this.o = osc(ctx, 'sawtooth', [1.1, 1, 12]);
    this.o.connect(this.lp);
    this.o.start(t0);
  }
  assign(id: string, type: string, rand?: () => number, t = 0): void {
    this.id = id;
    this.fresh = true; this.holdUntil = t + 0.14;
    this.sim = new EngineSim(engineVoiceFor(type), rand);
    this.sim.startNow();
  }
  release(t: number): void {
    this.id = null; this.sim = null;
    this.g.gain.setTargetAtTime(0, t, 0.08);
  }
  apply(t: number, f: EngineFrame, v: EngineVoice, level: number, doppler: number, pan: number): void {
    if (this.fresh) { this.g.gain.cancelScheduledValues(t); this.g.gain.setTargetAtTime(0, t, 0.025); this.o.frequency.setValueAtTime(Math.max(5, f.fire * doppler), t + 0.1); this.fresh = false; }
    if (t < this.holdUntil) return;
    this.o.frequency.setTargetAtTime(Math.max(5, f.fire * doppler), t, 0.05);
    this.lp.frequency.setTargetAtTime((v.tone * (0.5 + f.rpm / v.red) + v.open * f.load * 0.4) * clamp(level * 3, 0.35, 1), t, 0.08);
    this.g.gain.setTargetAtTime(0.05 * v.g * level * (0.6 + 0.4 * f.load) * f.level * (0.15 + 0.85 * f.elec), t, 0.1);
    if (this.pan) this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.18);
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
      if (s) { s.assign(id, byId.get(id)!.c.type, this.rand, t); have.add(id); }
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
  const peak = 0.09 * g * h.gain * (h.kind === 'siren' ? 1.7 : h.kind === 'beep' ? 1 : 0.6);
  let doubleTap = h.kind === 'cab';
  if (h.kind === 'siren') {
    const o = osc(ctx, 'square', [1.3, 0.4, 10]);
    const mode = opts.mode ?? 'wail';
    for (let s = 0; s < SIREN_SPAN; s += mode === 'yelp' ? 0.065 : mode === 'whoop' ? 0.04 : mode === 'wail' ? 0.1 : 0.5) {
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
    // each tone is a twin disc: two oscillators a few cents apart beat slowly, which is what makes a car horn buzz
    for (const f of hornTones(h)) {
      for (const side of h.kind === 'beep' ? [0] : [-1, 1]) {
        const o = ctx.createOscillator(); o.type = h.wave;
        const f0 = h.kind === 'beep' ? f * 0.82 : h.kind === 'air' ? f * AIR_BEND : f;
        o.frequency.setValueAtTime(f0, t);
        if (h.kind === 'beep') o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        else if (h.kind === 'air') o.frequency.exponentialRampToValueAtTime(f, t + h.atk * 1.2);
        if (h.kind === 'weak') o.frequency.exponentialRampToValueAtTime(f * 0.93, t + 0.6);
        o.detune.value = side * HORN_BEAT_CENTS * (1 + srcs.length * 0.12);
        o.connect(lp); o.start(t); srcs.push(o);
      }
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
