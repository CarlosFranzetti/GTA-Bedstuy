/**
 * Vehicle, road, body and world sound layer used by AudioSystem. Inert until attach() (first user gesture)
 * and until a vehicle type is set; then it owns the player's engine, horns, tyre roll, rain, one-shot fx,
 * AI engine voices and the district beds.
 */
import { EngineSim, engineVoiceFor, distanceGain } from './engineModel';
import { HonkLimiter, hornFor, sirenModeFor, type HornSpec } from './hornModel';
import { EngineNodes, TrafficEngines, playHorn, type HornHandle, type Listener, type TrafficCar } from './nodes';
import {
  airBrakeLayers, beepLayers, brakeSquealLayers, crashLayers, districtBed, doorLayers, footstepLayers, indicatorLayers, jumpLayers,
  kerbLayers, landLayers, playLayers, tyreRoll, uiLayers, type DistrictBed, type Layer, type Surface,
} from './fx';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** Rare novelty horn chance per press for ordinary cars. */
const NOVELTY = 0.04;

export class VehicleAudio {
  private ctx: BaseAudioContext | null = null;
  private master: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private type: string | null = null;
  private sim: EngineSim | null = null;
  private eng: EngineNodes | null = null;
  private traffic: TrafficEngines | null = null;
  private roll: { bp: BiquadFilterNode; g: GainNode; src: AudioBufferSourceNode } | null = null;
  private rainN: { g: GainNode; src: AudioBufferSourceNode } | null = null;
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
  attach(ctx: BaseAudioContext, master: AudioNode, noise: AudioBuffer): void {
    this.ctx = ctx; this.master = master; this.noise = noise;
    this.ensureEngine();
  }
  get typed(): boolean { return this.type !== null; }
  get vehicleType(): string | null { return this.type; }
  get trafficVoices(): TrafficEngines | null { return this.traffic; }
  get engineNodes(): EngineNodes | null { return this.eng; }

  setType(type: string | null): void {
    if (type === this.type) return;
    this.type = type;
    this.reverseBeeper = !!(type && hornFor(type).beeper);
    this.eng?.dispose(); this.eng = null;
    this.sim = type ? new EngineSim(engineVoiceFor(type), this.rnd) : null;
    if (this.sim && this.inVehicle) this.sim.start();
    this.ensureEngine();
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
    }
    this.speed = Number.isFinite(speed) ? speed : 0;
    this.throttle = clamp01(throttle);
  }
  setReverse(on: boolean): void { this.reverse = on; }
  setSurface(s: Surface | 'wet'): void { this.surface = s; }
  setRain(v: number): void { this.rain = clamp01(v); }
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
      if (!this.inVehicle && this.sim.phase === 'off') this.eng.out.gain.setTargetAtTime(0, t, 0.05);
    }
    this.updateRoad(t);
    if (this.hornAuto > 0 && !this.heldDriven) { this.hornAuto -= dt; if (this.hornAuto <= 0) this.horn?.release(t); }
    if (this.horn?.done) this.horn = null;
    if (this.blinker && this.inVehicle && (this.tickIn -= dt) <= 0) { this.fx(indicatorLayers(this.tickOn), 0.5); this.tickOn = !this.tickOn; this.tickIn = 0.4; }
    if (this.reverseBeeper && this.reverse && this.inVehicle && (this.beepIn -= dt) <= 0) { this.fx(beepLayers(), 0.5); this.beepIn = 0.9; }
    this.updateBed(dt);
  }

  private ensureRoad(): void {
    const ctx = this.ctx!, noise = this.noise!;
    if (!this.roll) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.master!);
      src.start(ctx.currentTime);
      this.roll = { bp, g, src };
    }
    if (!this.rainN && this.rain > 0) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(g); g.connect(this.master!);
      src.start(ctx.currentTime);
      this.rainN = { g, src };
    }
  }

  private updateRoad(t: number): void {
    if (!this.type) return;
    this.ensureRoad();
    const r = tyreRoll(this.speed, this.surface);
    const inside = this.inVehicle ? 1 : 0;
    const wob = r.bump ? 0.75 + 0.25 * Math.sin(this.clock * (6 + Math.abs(this.speed) * 1.7)) : 1;
    this.roll!.bp.frequency.setTargetAtTime(r.hz, t, 0.1);
    this.roll!.g.gain.setTargetAtTime(r.level * 0.08 * wob * inside, t, 0.08);
    if (this.rainN) this.rainN.g.gain.setTargetAtTime(this.rain * 0.03 * inside * (0.8 + 0.2 * Math.sin(this.clock * 37)), t, 0.2);
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
  playDoor(open: boolean, type: string | null = this.type): void { this.fx(doorLayers(type ?? 'sedan', open), 0.6); }
  playKerb(strength: number): void { this.fx(kerbLayers(clamp01(strength)), 0.6); }
  playFootstep(surface: Surface = 'asphalt', run = false): void { this.fx(footstepLayers(surface, run), 0.25, 0.92 + this.rnd() * 0.16); }
  playJump(): void { this.fx(jumpLayers(), 0.5); }
  playLand(strength = 0.5): void { this.fx(landLayers(clamp01(strength)), 0.6); }
  playUi(kind: 'tick' | 'ok' | 'back' = 'tick'): void { this.fx(uiLayers(kind), 0.35); }
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

  private updateBed(dt: number): void {
    const b = this.bed;
    if (!b || !this.ctx) return;
    if ((this.kidsIn -= dt) <= 0) {
      this.kidsIn = (8 + this.rnd() * 25) / (0.2 + b.kids);
      const base = 650 + this.rnd() * 500;
      this.fx([
        { k: 'o', t: 0, d: 0.16, p: 0.05, w: 'triangle', hz: base, to: base * 1.7, lp: 2200 },
        { k: 'o', t: 0.2, d: 0.2, p: 0.04, w: 'triangle', hz: base * 1.3, to: base * 0.9, lp: 2200 },
        { k: 'n', t: 0, d: 0.35, p: 0.01, f: 'bandpass', hz: 2400, q: 2 },
      ], b.kids);
    }
    if ((this.musicIn -= dt) <= 0) {
      this.musicIn = (30 + this.rnd() * 60) / (0.2 + b.music);
      const L: Layer[] = [];
      for (let i = 0; i < 12; i++) {
        L.push({ k: 'o', t: i * 0.625, d: 0.2, p: 0.5, w: 'sine', hz: 90, to: 45 });
        if (i % 2) L.push({ k: 'n', t: i * 0.625, d: 0.12, p: 0.1, f: 'bandpass', hz: 1400 });
      }
      this.fx(L, 0.03 * b.music);
    }
  }

  dispose(): void {
    this.eng?.dispose(); this.traffic?.dispose();
    for (const n of [this.roll, this.rainN]) { try { n?.src.stop(); } catch { /* not started */ } }
    this.eng = null; this.traffic = null; this.roll = null; this.rainN = null; this.ctx = null; this.master = null;
  }
}
