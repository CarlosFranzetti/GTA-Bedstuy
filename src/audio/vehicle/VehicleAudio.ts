/**
 * Vehicle, road, body and world sound layer used by AudioSystem. Inert until attach() (first user gesture)
 * and until a vehicle type is set; then it owns the player's engine, horns, tyre roll, rain, one-shot fx,
 * AI engine voices and the district beds.
 */
import { EngineSim, engineVoiceFor, distanceGain } from './engineModel';
import { HonkLimiter, hornFor, sirenModeFor, type HornSpec } from './hornModel';
import { EngineNodes, TrafficEngines, playHorn, type HornHandle, type Listener, type TrafficCar } from './nodes';
import {
  airBrakeLayers, beepLayers, birdLayers, brakeSquealLayers, crashLayers, crosswalkLayers, districtBed, doorLayers, footstepLayers, indicatorLayers, jumpLayers,
  kerbLayers, landLayers, playLayers, tyreRoll, uiLayers, type DistrictBed, type Layer, type Surface,
} from './fx';
import { tyreSqueal, windBed, wetRoadHiss } from './road';
import { FootStepper, SIGNAL_PERIOD, hourBed, signalGain, type SignalState } from './world';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** Rare novelty horn chance per press for ordinary cars. */
const NOVELTY = 0.04;

export class VehicleAudio {
  private ctx: BaseAudioContext | null = null;
  private master: AudioNode | null = null;
  /** destination of the ambience beds (city wash, birds, kids, leaking music); the sound effects bus when none is given */
  private amb: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private type: string | null = null;
  private sim: EngineSim | null = null;
  private eng: EngineNodes | null = null;
  private traffic: TrafficEngines | null = null;
  /** engines of cars the player left or swapped: they play out their shutdown, then go */
  private ghosts: { sim: EngineSim; eng: EngineNodes; until: number }[] = [];
  private lastType: string | null = null;
  private roll: { bp: BiquadFilterNode; g: GainNode; src: AudioBufferSourceNode } | null = null;
  private rainN: { g: GainNode; src: AudioBufferSourceNode } | null = null;
  private wind: { lp: BiquadFilterNode; g: GainNode; src: AudioBufferSourceNode } | null = null;
  private wetN: { bp: BiquadFilterNode; g: GainNode; src: AudioBufferSourceNode } | null = null;
  private sq: { bp: BiquadFilterNode; ob: BiquadFilterNode; g: GainNode; o: OscillatorNode; og: GainNode; scrub: GainNode; src: AudioBufferSourceNode } | null = null;
  private wash: { g: GainNode; lp: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private slip = 0; private wet = 0;
  private hour = 12; private hourKnown = false;
  private readonly foot = new FootStepper();
  private footSpeed = 0; private footRun = 0; private footGrounded = true; private airT = 0;
  private cross: { d: number; state: SignalState } | null = null; private crossIn = 0; private crossBeat = 0;
  private birdIn = 5; private birdKind = 0;
  private speed = 0; private throttle = 0; private inVehicle = false; private reverse = false;
  private surface: Surface | 'wet' = 'asphalt';
  private rain = 0;
  private lastBrake = false;
  private horn: HornHandle | null = null;
  private hornPress = 0;
  private hornAuto = 0;
  private heldDriven = false;
  private readonly limiter = new HonkLimiter();
  private listener: Listener | null = null;
  private cars: TrafficCar[] = [];
  private clock = 0;
  private bed: DistrictBed | null = null;
  private kidsIn = 6; private musicIn = 20; private beepIn = 0; private tickIn = 0; private tickOn = false;
  private blinker = false;
  private reverseBeeper = false;

  constructor(private readonly rnd: () => number = Math.random) {}

  /** Called once the AudioContext exists. */
  attach(ctx: BaseAudioContext, master: AudioNode, noise: AudioBuffer, amb: AudioNode = master): void {
    this.ctx = ctx; this.master = master; this.noise = noise; this.amb = amb;
    this.ensureWash();
    this.ensureEngine();
  }
  get typed(): boolean { return this.type !== null; }
  get vehicleType(): string | null { return this.type; }
  get trafficVoices(): TrafficEngines | null { return this.traffic; }
  get engineNodes(): EngineNodes | null { return this.eng; }

  setType(type: string | null): void {
    if (type === this.type) return;
    this.type = type;
    if (type) this.lastType = type;
    this.reverseBeeper = !!(type && hornFor(type).beeper);
    this.retireEngine();
    this.sim = type ? new EngineSim(engineVoiceFor(type), this.rnd) : null;
    if (this.sim && this.inVehicle) this.sim.start();
    this.ensureEngine();
  }

  /** The engine of the car just left (or swapped) keeps running its own shutdown for a moment instead of being cut off. */
  private retireEngine(): void {
    const { eng, sim, ctx } = this;
    this.eng = null;
    if (!eng) return;
    if (!sim || !ctx || sim.phase === 'off') { eng.dispose(); return; }
    sim.stop();
    this.ghosts.push({ sim, eng, until: ctx.currentTime + 1.4 });
  }

  private ensureEngine(): void {
    if (!this.ctx || !this.master || !this.noise || !this.type || this.eng) return;
    this.eng = new EngineNodes(this.ctx, engineVoiceFor(this.type), this.noise, this.master);
  }

  /** Per-frame vehicle state (speed in m/s, throttle 0..1). Entering starts the engine, leaving shuts it down. */
  setDrive(speed: number, throttle: number, inVehicle: boolean): void {
    if (inVehicle !== this.inVehicle) {
      this.inVehicle = inVehicle;
      if (this.sim) { if (inVehicle) this.sim.start(); else { this.sim.stop(); this.horn?.release(); } }
      this.foot.reset();
    }
    this.speed = Number.isFinite(speed) ? speed : 0;
    this.throttle = clamp01(throttle);
  }
  setReverse(on: boolean): void { this.reverse = on; }
  setSurface(s: Surface | 'wet'): void { this.surface = s; }
  setRain(v: number): void { this.rain = clamp01(v); }
  /** Weather: rain 0..1 and how soaked the street is 0..1 (a wet road hisses under the tyres for a while after the rain stops). */
  setWeather(rain: number, wetness: number): void { this.rain = clamp01(rain); this.wet = clamp01(wetness); }
  /** Lateral tyre slip 0..1: the squeal follows it. */
  setSlip(v: number): void { this.slip = clamp01(v); }
  /** Hour of the day (0..24): the city bed's traffic wash, birds and quiet change with it. */
  setHour(h: number): void { if (Number.isFinite(h)) { this.hour = h; this.hourKnown = true; } }
  /** On foot: ground speed (m/s), sprint ramp 0..1 and whether the feet are on the ground; footsteps follow the stride. */
  setFoot(speed: number, run = 0, grounded = true): void { this.footSpeed = Number.isFinite(speed) ? speed : 0; this.footRun = clamp01(run); this.footGrounded = grounded; }
  /** Nearest pedestrian signal: distance in metres and its state (null = none near). It ticks for the person walking by. */
  setCrosswalk(dist: number | null, state: SignalState = 'dont'): void { this.cross = dist === null || !Number.isFinite(dist) ? null : { d: dist, state }; }
  /** Turn indicator ticking on or off. */
  setIndicator(on: boolean): void { this.blinker = on; if (on) this.tickIn = 0; }
  setDistrict(id: string | null): void { this.bed = id === null ? null : districtBed(id); }
  get district(): DistrictBed | null { return this.bed; }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.clock += dt;
    const t = ctx.currentTime;
    if (this.sim && this.eng) {
      const f = this.sim.update(dt, this.speed, this.inVehicle ? this.throttle : 0);
      this.eng.apply(f, t, this.speed, this.reverse);
      if (!this.inVehicle && this.sim.phase === 'off') this.eng.retire(t, 0.2);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.eng.apply(g.sim.update(dt, 0, 0), t, 0, false);
      if (t >= g.until || g.sim.phase === 'off') { g.eng.dispose(); this.ghosts.splice(i, 1); }
    }
    this.updateRoad(t);
    this.updateFoot(dt);
    this.updateCross(dt);
    if (this.hornAuto > 0 && !this.heldDriven) { this.hornAuto -= dt; if (this.hornAuto <= 0) this.horn?.release(t); }
    if (this.horn?.done) this.horn = null;
    if (this.blinker && this.inVehicle && (this.tickIn -= dt) <= 0) { this.fx(indicatorLayers(this.tickOn), 0.5); this.tickOn = !this.tickOn; this.tickIn = 0.4; }
    if (this.reverseBeeper && this.reverse && this.inVehicle && (this.beepIn -= dt) <= 0) { this.fx(beepLayers(), 0.5); this.beepIn = 0.9; }
    this.updateBed(dt);
  }

  private noiseSrc(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource(); src.buffer = this.noise!; src.loop = true;
    return src;
  }

  private ensureRoad(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    if (!this.roll) {
      const src = this.noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.master!);
      src.start(t0);
      this.roll = { bp, g, src };
      // cabin wind: broad low-passed air
      const ws = this.noiseSrc(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 500;
      const wg = ctx.createGain(); wg.gain.value = 0;
      ws.connect(lp); lp.connect(wg); wg.connect(this.master!); ws.start(t0);
      this.wind = { lp, g: wg, src: ws };
      // tyres on a wet road: a high hiss
      const hs = this.noiseSrc(), hb = ctx.createBiquadFilter(); hb.type = 'bandpass'; hb.Q.value = 0.6; hb.frequency.value = 3200;
      const hg = ctx.createGain(); hg.gain.value = 0;
      hs.connect(hb); hb.connect(hg); hg.connect(this.master!); hs.start(t0);
      this.wetN = { bp: hb, g: hg, src: hs };
      // squeal: a narrow scream (noise and a sawtooth, both band-passed) plus a dirt scrub; silent until the car slips
      const qs = this.noiseSrc(), qb = ctx.createBiquadFilter(); qb.type = 'bandpass'; qb.Q.value = 9; qb.frequency.value = 1800;
      const qg = ctx.createGain(); qg.gain.value = 0;
      const qo = ctx.createOscillator(); qo.type = 'sawtooth'; qo.frequency.value = 1800;
      const qob = ctx.createBiquadFilter(); qob.type = 'bandpass'; qob.Q.value = 14; qob.frequency.value = 1800;
      const qog = ctx.createGain(); qog.gain.value = 0.6;
      qs.connect(qb); qb.connect(qg); qo.connect(qob); qob.connect(qog); qog.connect(qg); qg.connect(this.master!);
      const ss = this.noiseSrc(), sh = ctx.createBiquadFilter(); sh.type = 'highpass'; sh.frequency.value = 1400;
      const sg = ctx.createGain(); sg.gain.value = 0;
      ss.connect(sh); sh.connect(sg); sg.connect(this.master!);
      qs.start(t0); qo.start(t0); ss.start(t0);
      this.sq = { bp: qb, ob: qob, g: qg, o: qo, og: qog, scrub: sg, src: qs };
    }
    if (!this.rainN && this.rain > 0) {
      const src = this.noiseSrc();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(g); g.connect(this.master!);
      src.start(t0);
      this.rainN = { g, src };
    }
  }

  private updateRoad(t: number): void {
    if (!this.type) return;
    this.ensureRoad();
    const v = engineVoiceFor(this.type);
    const r = tyreRoll(this.speed, this.surface);
    const inside = this.inVehicle ? 1 : 0;
    const quiet = v.road ?? 1;
    const wob = r.bump ? 0.75 + 0.25 * Math.sin(this.clock * (6 + Math.abs(this.speed) * 1.7)) : 1;
    this.roll!.bp.frequency.setTargetAtTime(r.hz, t, 0.1);
    this.roll!.g.gain.setTargetAtTime(r.level * 0.08 * quiet * wob * inside, t, 0.08);
    const w = windBed(this.speed, quiet);
    this.wind!.lp.frequency.setTargetAtTime(w.hz, t, 0.15);
    this.wind!.g.gain.setTargetAtTime(w.level * 0.09 * inside, t, 0.12);
    const h = wetRoadHiss(this.surface === 'wet' || this.surface === 'puddle' ? 1 : this.wet, this.rain, this.speed);
    this.wetN!.bp.frequency.setTargetAtTime(h.hz, t, 0.15);
    this.wetN!.g.gain.setTargetAtTime(h.level * 0.07 * (0.5 + 0.5 * quiet) * inside, t, 0.15);
    const q = tyreSqueal(this.slip, this.speed, this.surface === 'asphalt' && this.wet > 0.5 ? 'wet' : this.surface, this.clock);
    const sq = this.sq!;
    sq.bp.frequency.setTargetAtTime(q.hz, t, 0.05);
    sq.ob.frequency.setTargetAtTime(q.hz * 1.01, t, 0.05);
    sq.o.frequency.setTargetAtTime(q.hz, t, 0.05);
    sq.g.gain.setTargetAtTime(q.level * 0.16 * inside, t, 0.05);
    sq.scrub.gain.setTargetAtTime(q.scrub * 0.07 * inside, t, 0.06);
    if (this.rainN) this.rainN.g.gain.setTargetAtTime(this.rain * 0.03 * inside * (0.8 + 0.2 * Math.sin(this.clock * 37)), t, 0.2);
  }

  /** Footsteps from the stride of the walk and run gait; on foot only. */
  private updateFoot(dt: number): void {
    if (!this.ctx) return;
    const sp = this.inVehicle ? 0 : this.footSpeed;
    const step = this.foot.update(dt, sp, this.footRun, this.footGrounded && this.airT <= 0);
    if (this.airT > 0) this.airT -= dt;
    if (!step) return;
    const wet = this.wet > 0.5 || this.surface === 'wet';
    const surf: Surface = this.surface === 'wet' ? 'puddle' : this.surface;
    this.fx(footstepLayers(surf, step.run, step.side, wet && surf !== 'puddle'), 0.25 * step.level, 0.94 + this.rnd() * 0.12);
  }

  /** Pedestrian-signal ticks for the person near a crossing. */
  private updateCross(dt: number): void {
    const c = this.cross;
    if (!c || this.inVehicle) return;
    const g = signalGain(c.d);
    if (g < 0.02) return;
    if ((this.crossIn -= dt) <= 0) {
      this.crossIn = SIGNAL_PERIOD[c.state];
      this.fx(crosswalkLayers(c.state, this.crossBeat++), 0.3 * g);
    }
  }

  /** Brake state edge: air-brake hiss for buses and trucks, squeal for worn cars. */
  setBraking(on: boolean): void {
    if (on && !this.lastBrake && this.ctx && this.type && this.speed > 4) {
      const v = engineVoiceFor(this.type);
      if (v.red < 3500) this.fx(airBrakeLayers(), 0.5);
      else if (v.rat) this.fx(brakeSquealLayers(2600 + this.rnd() * 500), 0.7);
    }
    this.lastBrake = on;
  }

  /** One-shot layers on the master bus. */
  private fx(layers: Layer[], gain = 1, rate = 1): void {
    if (!this.ctx || !this.noise || !this.master) return;
    playLayers(this.ctx, this.noise, this.master, layers, this.ctx.currentTime, gain, rate, this.rnd);
  }
  /** Door of the car just entered or left; on leaving, the type is the one the player was driving. */
  playDoor(open: boolean, type: string | null = null): void { this.fx(doorLayers(type ?? this.type ?? this.lastType ?? 'sedan', open), 0.6); }
  playKerb(strength: number): void { this.fx(kerbLayers(clamp01(strength)), 0.6); }
  playFootstep(surface: Surface = 'asphalt', run = false): void { this.fx(footstepLayers(surface, run), 0.25, 0.92 + this.rnd() * 0.16); }
  playJump(): void { this.airT = 0.5; this.fx(jumpLayers(), 0.5); }
  playLand(strength = 0.5): void { this.fx(landLayers(clamp01(strength)), 0.6); }
  playUi(kind: 'tick' | 'ok' | 'back' = 'tick'): void { this.fx(uiLayers(kind), 0.35); }
  /** Impact scaled by the hit speed (m/s over about 15 is the hardest); glass above about 7 m/s. */
  playCrash(strength: number): void { this.fx(crashLayers(clamp01(strength / 15)), 0.3); }

  /* ---------- horns ---------- */

  setListener(l: Listener | null): void { this.listener = l; }
  /** Horn pressed (event). The player's horn starts at once; honks that are not at the listener are AI cars'. */
  hornEvent(pos?: { x: number; z: number }): void {
    if (!this.ctx || !this.master) return;
    const l = this.listener;
    const d = pos && l ? Math.hypot(pos.x - l.x, pos.z - l.z) : 0;
    if (d > 3) {
      let type = 'sedan', best = 5, id = `${Math.round(pos!.x)},${Math.round(pos!.z)}`;
      for (const c of this.cars) { const e = Math.hypot(c.x - pos!.x, c.z - pos!.z); if (e < best) { best = e; type = c.type; id = c.id; } }
      this.honkAt(id, type, d);
      return;
    }
    if (this.horn && !this.horn.done) return;
    this.startHorn(hornFor(this.type), 1);
  }
  private startHorn(h: HornSpec, gain: number): void {
    const novelty = h.kind !== 'siren' && h.kind !== 'air' && this.rnd() < NOVELTY;
    this.horn = playHorn(this.ctx!, this.master!, h, this.ctx!.currentTime, { gain, novelty, mode: h.kind === 'siren' ? sirenModeFor(h, this.hornPress++) : undefined });
    this.hornAuto = h.kind === 'siren' ? 2.4 : 0.38;
  }
  /** Held state of the horn button, for sustained horns and sirens. Once called, the horn stops on release instead of after a tap. */
  setHornHeld(on: boolean): void {
    this.heldDriven = true;
    if (!on) this.horn?.release();
  }
  /** An AI car honks with its own horn; rate-limited, attenuated by distance. */
  honkAt(id: string, type: string, dist: number): boolean {
    if (!this.ctx || !this.master) return false;
    const g = distanceGain(dist, 90);
    if (g < 0.02 || !this.limiter.allow(id, this.clock)) return false;
    const h = hornFor(type);
    const hh: HornSpec = h.kind === 'siren' ? { ...h, kind: 'car', root: 400, ratios: [1, 1.26] } : h;
    const handle = playHorn(this.ctx, this.master, hh, this.ctx.currentTime, { gain: g * 1.4, novelty: this.rnd() < NOVELTY / 2 });
    handle.release(this.ctx.currentTime + 0.3 + this.rnd() * 0.25);
    return true;
  }

  /* ---------- AI engines ---------- */

  setTraffic(l: Listener, cars: TrafficCar[], dt = 1 / 60): void {
    this.listener = l; this.cars = cars;
    if (!this.ctx || !this.master) return;
    this.traffic ??= new TrafficEngines(this.ctx, this.master, 4, 70, this.rnd);
    this.traffic.update(dt, l, cars);
  }

  /* ---------- district bed ---------- */

  /** One-shots of the city bed go to the ambience bus, not the effects bus. */
  private bedFx(layers: Layer[], gain: number): void {
    if (!this.ctx || !this.noise || !this.amb) return;
    playLayers(this.ctx, this.noise, this.amb, layers, this.ctx.currentTime, gain, 1, this.rnd);
  }

  /** The wash: low traffic rumble that follows the hour and the district; softer and darker behind glass. */
  private ensureWash(): void {
    const ctx = this.ctx;
    if (this.wash || !ctx || !this.amb || !this.noise) return;
    const src = this.noiseSrc(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.amb); src.start(ctx.currentTime);
    this.wash = { g, lp, src };
  }

  private updateBed(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.amb || !this.noise) return;
    const hb = hourBed(this.hour);
    const b = this.bed ?? districtBed(null);
    this.ensureWash();
    if (!this.wash) return;
    const t = ctx.currentTime;
    this.wash.g.gain.setTargetAtTime(0.045 * hb.traffic * (0.5 + b.traffic) * (this.inVehicle ? 0.6 : 1), t, 1.5);
    this.wash.lp.frequency.setTargetAtTime(this.inVehicle ? 380 : 620 + 300 * hb.traffic, t, 1.5);
    if (this.bed && (this.kidsIn -= dt) <= 0) {
      this.kidsIn = (8 + this.rnd() * 25) / (0.2 + b.kids * (hb.traffic > 0.3 ? 1 : 0.2));
      const base = 650 + this.rnd() * 500;
      this.bedFx([
        { k: 'o', t: 0, d: 0.16, p: 0.05, w: 'triangle', hz: base, to: base * 1.7, lp: 2200 },
        { k: 'o', t: 0.2, d: 0.2, p: 0.04, w: 'triangle', hz: base * 1.3, to: base * 0.9, lp: 2200 },
        { k: 'n', t: 0, d: 0.35, p: 0.01, f: 'bandpass', hz: 2400, q: 2 },
      ], b.kids);
    }
    if (this.bed && (this.musicIn -= dt) <= 0) {
      this.musicIn = (30 + this.rnd() * 60) / (0.2 + b.music);
      const L: Layer[] = [];
      for (let i = 0; i < 12; i++) {
        L.push({ k: 'o', t: i * 0.625, d: 0.2, p: 0.5, w: 'sine', hz: 90, to: 45 });
        if (i % 2) L.push({ k: 'n', t: i * 0.625, d: 0.12, p: 0.1, f: 'bandpass', hz: 1400 });
      }
      this.bedFx(L, 0.03 * b.music);
    }
    if (this.hourKnown && hb.birds > 0.05 && (this.birdIn -= dt) <= 0) {
      this.birdIn = (2 + this.rnd() * 7) / hb.birds;
      this.birdKind = Math.floor(this.rnd() * 9);
      this.bedFx(birdLayers(this.birdKind), 0.03 * (this.inVehicle ? 0.3 : 1));
    }
  }

  dispose(): void {
    this.eng?.dispose(); this.traffic?.dispose();
    for (const n of [this.roll, this.rainN, this.wind, this.wetN, this.sq, this.wash]) { try { n?.src.stop(); } catch { /* not started */ } }
    try { this.sq?.o.stop(); } catch { /* not started */ }
    for (const g of this.ghosts) g.eng.dispose();
    this.ghosts.length = 0;
    this.eng = null; this.traffic = null; this.roll = null; this.rainN = null; this.wind = null; this.wetN = null; this.sq = null; this.wash = null; this.ctx = null; this.master = null;
  }
}
