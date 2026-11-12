/**
 * Vehicle engine sound model, pure data and maths (no Web Audio): per-type voice specs, gearbox and rpm
 * simulation with shift dips / limiter / start-stop, and the nearest-N picker for AI engine voices.
 * Firing frequency of a four-stroke is rpm/60 * cylinders/2.
 */
import type { VehicleType } from '@/world/types';

export interface EngineVoice {
  /** cylinders (firing character) and top speed in m/s (matches VehicleSpec.maxSpeed) */
  cyl: number; vmax: number;
  idle: number; red: number;
  /** gear count, ratio step between gears, fraction of redline reached at vmax in top gear, upshift point (fraction of redline) */
  gears: number; step: number; top: number; shift: number;
  /** rpm inertia multiplier: a bus is slow to rev, a hatch is quick */
  inr: number;
  /** firing wave: [harmonic tilt, even-harmonic gain, harmonic count]; lowpass base and throttle-open Hz */
  h: [number, number, number]; tone: number; open: number;
  /** exhaust body resonance: Hz, Q, dB */
  ex: [number, number, number];
  /** half-order level, per-cycle lope depth, second-oscillator detune (cents), idle wobble (cents), intake noise, loudness trim */
  sub: number; lope: number; det: number; wob: number; air: number; g: number;
  /** electric motor: no combustion, whine follows motor rpm, silent at standstill (a faint pedestrian hum) */
  ev?: boolean;
  turbo?: number; clat?: number; whine?: number; miss?: number; rat?: number; crack?: number;
  /** firing-order character: extra sine orders [order per crankshaft turn, level] (1.5 = flat-six hollow, 0.5 = cross-plane V8 lope, 1 = four imbalance) */
  sh?: [number, number][];
  /** exhaust grit / drive of the waveshaper 0..1 (beater rasp, leaking muffler); none = clean (luxury hush) */
  drv?: number;
  /** hybrid: below this speed (m/s) and a light throttle the combustion engine is off and only the electric whine is heard */
  hyb?: number;
  /** electric pedestrian warning tone (fades out by 30 km/h) */
  ped?: number;
  /** tyre and wind noise multiplier: a hushed or electric car lets the road carry the speed */
  road?: number;
}

/**
 * One entry per VehicleType (Record: a type without a voice does not compile, and the unit test fails).
 * Characters: V6 smooth, V8 lopes (cab/cop/pickup/pony/towncar/luxury), diesel clatter + turbo (trucks, bus, vans),
 * small fours (hatch, beater with misfire + heat-shield rattle), hybrid whine (minivan).
 */
export const ENGINE_VOICES: Record<VehicleType, EngineVoice> = {
  sedan:     { cyl: 6, vmax: 30, idle: 750, red: 6200, gears: 6, step: 1.32, top: 0.72, shift: 0.8,  inr: 1,   h: [1.2, 1, 18],  tone: 700,  open: 1800, ex: [180, 2, 6],  sub: 0.15, lope: 0.05, det: 7,  wob: 6,  air: 0.25, g: 1, sh: [[1.5, 0.1]] },
  suv:       { cyl: 6, vmax: 27, idle: 690, red: 5600, gears: 6, step: 1.36, top: 0.7,  shift: 0.78, inr: 1.4, h: [1.0, 1.2, 20], tone: 560,  open: 1500, ex: [140, 3, 8],  sub: 0.3,  lope: 0.08, det: 5,  wob: 8,  air: 0.35, g: 1, sh: [[1.5, 0.12]], road: 1.2 },
  cab:       { cyl: 4, vmax: 30, idle: 700, red: 5800, gears: 6, step: 1.36, top: 0.7,  shift: 0.76, inr: 1.1, h: [1.5, 1.0, 14], tone: 620,  open: 1500, ex: [200, 2, 5],  sub: 0.04, lope: 0.0,  det: 8,  wob: 7,  air: 0.2,  g: 1, whine: 0.7, hyb: 4.2, sh: [[1, 0.14]] },
  cop:       { cyl: 8, vmax: 33, idle: 720, red: 6200, gears: 6, step: 1.3,  top: 0.74, shift: 0.86, inr: 0.9, h: [0.9, 1.3, 22], tone: 820,  open: 2600, ex: [135, 3, 9],  sub: 0.35, lope: 0.18, det: 4,  wob: 5,  air: 0.4,  g: 1, sh: [[0.5, 0.2], [2.5, 0.08]], drv: 0.15 },
  boxtruck:  { cyl: 6, vmax: 20, idle: 680, red: 3200, gears: 6, step: 1.5,  top: 0.8,  shift: 0.82, inr: 2.2, h: [0.8, 0.8, 24], tone: 420,  open: 900,  ex: [92, 3, 8],   sub: 0.1,  lope: 0.04, det: 12, wob: 10, air: 0.45, g: 1, clat: 0.7, turbo: 0.3, sh: [[1.5, 0.16]], drv: 0.2 },
  cargovan:  { cyl: 4, vmax: 25, idle: 760, red: 4400, gears: 6, step: 1.4,  top: 0.74, shift: 0.8,  inr: 1.5, h: [0.9, 0.9, 22], tone: 560,  open: 1100, ex: [150, 3, 6],  sub: 0.12, lope: 0.03, det: 15, wob: 8,  air: 0.35, g: 1, clat: 0.45, turbo: 0.5, sh: [[1, 0.12]] },
  hatch:     { cyl: 4, vmax: 29, idle: 840, red: 6900, gears: 5, step: 1.34, top: 0.82, shift: 0.88, inr: 0.6, h: [0.7, 1.0, 14], tone: 1250, open: 2800, ex: [260, 2, 5],  sub: 0.05, lope: 0.0,  det: 11, wob: 5,  air: 0.45, g: 0.95, sh: [[1, 0.2]] },
  beater:    { cyl: 4, vmax: 26, idle: 690, red: 5400, gears: 4, step: 1.45, top: 0.82, shift: 0.78, inr: 1.3, h: [1.0, 0.6, 12], tone: 640,  open: 1100, ex: [120, 4, 10], sub: 0.35, lope: 0.14, det: 22, wob: 38, air: 0.3,  g: 1, miss: 0.5, rat: 0.8, sh: [[1, 0.28]], drv: 0.6 },
  bus:       { cyl: 6, vmax: 17, idle: 600, red: 2500, gears: 5, step: 1.55, top: 0.85, shift: 0.78, inr: 3,   h: [0.7, 0.7, 26], tone: 450, open: 1100, ex: [96, 3, 7],   sub: 0.1,  lope: 0.05, det: 14, wob: 12, air: 0.55, g: 1, clat: 0.95, turbo: 0.15, sh: [[1.5, 0.14]] },
  pickup:    { cyl: 8, vmax: 29, idle: 620, red: 5000, gears: 6, step: 1.36, top: 0.7,  shift: 0.76, inr: 1.6, h: [1.1, 1.6, 18], tone: 520,  open: 1500, ex: [98, 3, 9],   sub: 0.4,  lope: 0.34, det: 10, wob: 12, air: 0.3,  g: 1, sh: [[0.5, 0.3], [2.5, 0.1]], drv: 0.2 },
  crossover: { cyl: 4, vmax: 29, idle: 800, red: 6400, gears: 8, step: 1.25, top: 0.7,  shift: 0.76, inr: 0.9, h: [1.5, 0.8, 16], tone: 900,  open: 2000, ex: [230, 2, 4],  sub: 0.04, lope: 0.0,  det: 6,  wob: 4,  air: 0.3,  g: 1, turbo: 0.55, sh: [[1, 0.1]] },
  minivan:   { cyl: 4, vmax: 27, idle: 700, red: 5600, gears: 6, step: 1.3,  top: 0.66, shift: 0.72, inr: 1.3, h: [1.9, 0.6, 12], tone: 480,  open: 900,  ex: [210, 1, 3],  sub: 0.0,  lope: 0.0,  det: 3,  wob: 3,  air: 0.15, g: 1.1, whine: 0.75, sh: [[1, 0.08]], road: 1.3 },
  luxury:    { cyl: 6, vmax: 36, idle: 600, red: 6400, gears: 8, step: 1.27, top: 0.66, shift: 0.7,  inr: 0.9, h: [2.4, 0.4, 12], tone: 400,  open: 1300, ex: [130, 1, 2],  sub: 0.03, lope: 0.0,  det: 2,  wob: 1,  air: 0.1,  g: 1.1, turbo: 0.25, road: 1.5 },
  towncar:   { cyl: 8, vmax: 29, idle: 600, red: 4800, gears: 4, step: 1.42, top: 0.7,  shift: 0.72, inr: 1.4, h: [1.7, 1.3, 14], tone: 360,  open: 1000, ex: [90, 2, 8],   sub: 0.32, lope: 0.22, det: 6,  wob: 10, air: 0.16, g: 1.1, sh: [[0.5, 0.22]], road: 1.3 },
  pony:      { cyl: 6, vmax: 38, idle: 900, red: 7000, gears: 6, step: 1.3,  top: 0.8,  shift: 0.93, inr: 0.5, h: [0.75, 1.7, 26], tone: 1300, open: 3400, ex: [150, 4, 10], sub: 0.2,  lope: 0.16, det: 8,  wob: 18, air: 0.45, g: 0.9, crack: 0.9, drv: 0.3, sh: [[1.5, 0.16]] },
  garbage:   { cyl: 6, vmax: 15, idle: 560, red: 2300, gears: 5, step: 1.5,  top: 0.8,  shift: 0.8,  inr: 3.2, h: [0.6, 0.9, 28], tone: 260, open: 600, ex: [60, 5, 12], sub: 0.3, lope: 0.07, det: 16, wob: 16, air: 0.5,  g: 1.05, clat: 1, turbo: 0.2, sh: [[1.5, 0.2]], drv: 0.25 },
  ambulance: { cyl: 8, vmax: 31, idle: 700, red: 4600, gears: 6, step: 1.38, top: 0.74, shift: 0.78, inr: 1.7, h: [1.0, 1.0, 20], tone: 600,  open: 1300, ex: [128, 3, 7],  sub: 0.2,  lope: 0.1,  det: 13, wob: 9,  air: 0.38, g: 1, clat: 0.3, turbo: 0.4, sh: [[0.5, 0.18]], drv: 0.2 },
  dollarvan: { cyl: 6, vmax: 25, idle: 670, red: 4800, gears: 4, step: 1.5,  top: 0.8,  shift: 0.82, inr: 1.6, h: [0.8, 1.1, 14], tone: 520,  open: 1000, ex: [170, 5, 9],  sub: 0.2,  lope: 0.12, det: 26, wob: 30, air: 0.3,  g: 1, miss: 0.3, rat: 0.4, drv: 0.35, sh: [[1.5, 0.14]] },
  coupe911:  { cyl: 6, vmax: 40.5, idle: 900, red: 7800, gears: 7, step: 1.27, top: 0.8, shift: 0.9, inr: 0.5, h: [0.85, 1.1, 24], tone: 1100, open: 3200, ex: [210, 3, 8], sub: 0.02, lope: 0.06, det: 9, wob: 4, air: 0.5, g: 1.2, crack: 0.5, sh: [[1.5, 0.26], [4.5, 0.06]] },
  exotic:    { cyl: 10, vmax: 45, idle: 1000, red: 8800, gears: 7, step: 1.24, top: 0.86, shift: 0.96, inr: 0.35, h: [0.6, 1, 30], tone: 2200, open: 5000, ex: [300, 3, 9], sub: 0, lope: 0, det: 4, wob: 3, air: 0.55, g: 1.35, crack: 1, sh: [[0.5, 0.05], [5, 0.08]] },
  jdmcoupe:  { cyl: 6, vmax: 37.5, idle: 850, red: 7200, gears: 6, step: 1.3, top: 0.84, shift: 0.92, inr: 0.6, h: [0.95, 0.9, 22], tone: 1250, open: 3000, ex: [190, 4, 9], sub: 0.05, lope: 0.02, det: 10, wob: 8, air: 0.5, g: 1.15, turbo: 0.95, crack: 0.6, sh: [[1, 0.1]], drv: 0.2 },
  hothatch:  { cyl: 4, vmax: 38, idle: 980, red: 7600, gears: 6, step: 1.3, top: 0.8, shift: 0.9, inr: 0.55, h: [0.5, 1.2, 22], tone: 1700, open: 3600, ex: [330, 4, 8], sub: 0.05, lope: 0, det: 12, wob: 5, air: 0.5, g: 1.2, turbo: 1, crack: 0.4, sh: [[1, 0.16]], drv: 0.25 },
  muscle:    { cyl: 8, vmax: 41, idle: 740, red: 6400, gears: 4, step: 1.4, top: 0.78, shift: 0.88, inr: 0.9, h: [0.8, 1.7, 26], tone: 880, open: 2800, ex: [86, 5, 11], sub: 0.55, lope: 0.55, det: 14, wob: 26, air: 0.4, g: 0.9, crack: 1, sh: [[0.5, 0.36], [2.5, 0.12]], drv: 0.35 },
  wedgetruck: { cyl: 4, vmax: 25, idle: 0, red: 9000, gears: 1, step: 1, top: 0.8, shift: 9, inr: 2, h: [2.5, 0.2, 6], tone: 900, open: 1400, ex: [260, 1, 2], sub: 0, lope: 0, det: 3, wob: 0, air: 0.12, g: 1, whine: 1.7, ev: true, ped: 1, road: 1.8 },
  evsedan:   { cyl: 4, vmax: 36, idle: 0, red: 12000, gears: 1, step: 1, top: 0.8, shift: 9, inr: 0.8, h: [2.5, 0.2, 6], tone: 1000, open: 1800, ex: [300, 1, 2], sub: 0, lope: 0, det: 3, wob: 0, air: 0.1, g: 1, whine: 1.3, ev: true, ped: 1, road: 2.1 },
};

/** Voice for a type; a type the table does not know yet falls back to the sedan so a new car is never silent. */
export function engineVoiceFor(type: string | null | undefined): EngineVoice {
  return (ENGINE_VOICES as Record<string, EngineVoice | undefined>)[type ?? ''] ?? ENGINE_VOICES.sedan;
}

const fin = (v: number) => (Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Firing frequency (Hz) of a four-stroke engine. */
export const firingHz = (rpm: number, cyl: number): number => (rpm / 60) * (cyl / 2);

/** rpm per m/s for each gear (index 0 = first gear), geometric spacing, top gear lands at `top * red` at vmax. */
export function gearRatios(v: EngineVoice): number[] {
  const rt = (v.top * v.red) / v.vmax;
  return Array.from({ length: v.gears }, (_, i) => rt * v.step ** (v.gears - 1 - i));
}

/** rpm in a given gear (1-based) at a speed in m/s, never below idle. */
export const rpmAt = (v: EngineVoice, gear: number, speed: number): number =>
  Math.max(v.idle, Math.abs(fin(speed)) * gearRatios(v)[clamp(gear, 1, v.gears) - 1]);

/** Gear (1-based) a driver would be in at steady speed: highest gear whose rpm stays above the downshift point. */
export function gearForSpeedOf(v: EngineVoice, speed: number): number {
  const r = gearRatios(v);
  const s = Math.abs(fin(speed));
  let g = 1;
  while (g < v.gears && s * r[g - 1] > v.red * v.shift) g++;
  return g;
}

export interface EngineFrame {
  rpm: number; gear: number; fire: number; rev: number;
  /** 0..1 audible level of the combustion (0 off, low while cranking) */
  level: number;
  load: number;
  /** a gear change is in progress (+1 up, -1 down, 0 none) */
  shifting: number;
  /** rev limiter is cutting this instant */
  cut: boolean;
  /** starter motor level 0..1 */
  starter: number;
  /** idle wobble, cents */
  wob: number;
  /** exhaust pops requested this frame (count) and hiss flag after lifting off a turbo */
  pops: number; blowoff: boolean;
  /** engine braking 0..1 (off the throttle while rolling): a held, darker note with a burble, never silence */
  overrun: number;
  /** 0..1 how much of the combustion engine is audible (a hybrid at a crawl is 0: the electric motor moves the car) */
  elec: number;
  /** a misfire happens now */
  miss: boolean;
  running: boolean;
}

const SHIFT_TIME = 0.26;
/** Share of the throttle load the engine keeps while a gear change is in progress (a shift is a dip, not a cut-out). */
export const SHIFT_LOAD = 0.8;
/** Limiter-gain multiplier during a gear change. */
export const SHIFT_LIM = 0.9;
/** Gain while the rev limiter cuts fuel (-5 dB: a flutter you can hear, not a hole) and on a misfire (-9 dB, 60 ms). */
export const LIMITER_CUT = 0.56;
export const MISFIRE_CUT = 0.35;
/** Load the engine keeps while engine braking: the lift-off settles here, not at zero. */
export const OVERRUN_LOAD = 0.42;
/** Shift duration (s): a 7 or 8 speed box changes quickly, so the many shifts of a pull-away stay short and soft. */
export const shiftTime = (v: EngineVoice): number => SHIFT_TIME * Math.min(1, 5 / Math.max(1, v.gears) + 0.25);

/** Overall engine body level (linear); 8 dB under the old level (owner, 12 Nov: engines too loud); idle is a quiet presence, full throttle rises. */
export const ENGINE_TRIM = 0.16;

/** Per-frame engine mix targets (gain / cutoff values) that EngineNodes.apply schedules; pure so the shift dip can be tested. */
export function engineMix(v: EngineVoice, f: EngineFrame): { lope: number; lpHz: number; ex: number; lim: number; out: number; air: number } {
  const rn = clamp(f.rpm / v.red, 0, 1), L = f.load;
  return {
    lope: v.lope * (0.55 - 0.35 * L) * f.level,
    // loudness rises only gently with revs and load, so a pull-away through the gears is a rising note, not a saw-tooth of level
    lpHz: v.tone * (0.75 + 0.5 * rn) + v.open * L * (0.45 + 0.45 * rn),
    ex: v.ex[2] * (0.5 + 0.5 * L),
    lim: (v.ev ? 0.03 : 1) * (f.shifting ? SHIFT_LIM : 1) * (f.cut ? LIMITER_CUT : 1) * (f.miss ? MISFIRE_CUT : 1) * (0.04 + 0.96 * f.elec),
    out: ENGINE_TRIM * v.g * f.level * (0.45 + 0.55 * (L * 0.8 + rn * 0.2)),
    air: v.air * 0.13 * (0.3 + 0.7 * L * (0.5 + 0.5 * rn)) * f.level,
  };
}
const CRANK_TIME = 0.85;
const STOP_TIME = 0.7;

/** Stateful rpm, gear and event model of one engine; step it with update(dt, speed, throttle). */
export class EngineSim {
  rpm = 0;
  gear = 1;
  phase: 'off' | 'crank' | 'run' | 'stop' = 'off';
  private t = 0;
  private pt = 0;
  private shiftT = 0;
  private shiftDir = 0;
  private prevThrottle = 0;
  private cutPhase = 0;
  private spool = 0;
  private elec = 1;
  private readonly ratios: number[];
  constructor(readonly v: EngineVoice, private readonly rand: () => number = Math.random) {
    this.ratios = gearRatios(v);
  }

  /** Begin cranking (starter whirr, then the engine catches). Already-running engines are left alone. */
  start(): void { if (this.phase === 'off' || this.phase === 'stop') { this.phase = this.v.ev ? 'run' : 'crank'; this.pt = 0; } }
  /** Shut down: revs fall away. */
  stop(): void { if (this.phase !== 'off') { this.phase = 'stop'; this.pt = 0; } }
  /** Skip cranking (AI cars, tests). */
  startNow(): void { this.phase = 'run'; this.rpm = Math.max(this.rpm, this.v.idle); }

  update(dt: number, speed: number, throttle: number): EngineFrame {
    const v = this.v;
    dt = clamp(fin(dt), 0, 0.25);
    const th = clamp(fin(throttle), 0, 1);
    const sp = Math.abs(fin(speed));
    this.t += dt;
    this.pt += dt;
    let starter = 0, level = 0, pops = 0, blowoff = false, miss = false, cut = false, overrun = 0;
    const idleW = () => clamp(1 - (this.rpm - v.idle) / (v.red * 0.4), 0, 1);

    if (this.phase === 'off') {
      this.rpm = 0;
    } else if (this.phase === 'crank') {
      const k = this.pt / CRANK_TIME;
      this.rpm += ((230 + 90 * Math.sin(this.pt * 31)) - this.rpm) * Math.min(1, dt * 9);
      starter = 1;
      level = 0.18 + 0.2 * Math.max(0, Math.sin(this.pt * 47)) * k;
      if (this.pt >= CRANK_TIME) { this.phase = 'run'; this.rpm = v.idle * 1.7; starter = 0; }
    } else if (this.phase === 'stop') {
      this.rpm *= Math.exp(-dt / (STOP_TIME * (v.ev ? 0.1 : 0.35)));
      level = clamp(this.rpm / Math.max(1, v.idle || 600), 0, 1) * (0.6 + 0.4 * Math.sin(this.pt * 40) ** 2);
      if (this.pt >= STOP_TIME || (this.rpm < 30 && !v.ev) || (v.ev && this.pt > 0.15)) { this.phase = 'off'; this.rpm = 0; level = 0; }
    } else {
      // gearbox
      const rIn = sp * this.ratios[this.gear - 1];
      if (this.shiftT <= 0) {
        if (this.gear < v.gears && rIn > v.red * v.shift * (0.62 + 0.38 * clamp(th * 1.6, 0, 1)) && th > 0.2) { this.gear++; this.shiftT = shiftTime(v); this.shiftDir = 1; }
        else if (this.gear > 1 && rIn < v.red * v.shift * 0.45) { this.gear--; this.shiftT = shiftTime(v) * 0.7; this.shiftDir = -1; }
      } else {
        this.shiftT -= dt;
        if (this.shiftT <= 0) this.shiftDir = 0;
      }
      const geared = Math.max(v.idle, sp * this.ratios[this.gear - 1]);
      const freeRev = v.ev ? 0 : v.idle + th * (v.red * 0.82 - v.idle);
      let target = lerp(freeRev, geared, clamp(sp / 3, 0, 1));
      if (this.shiftDir > 0) target = Math.min(target, geared) * 0.97;
      if (this.shiftDir < 0) target *= 1.08;
      target = Math.min(target, v.red);
      const up = target > this.rpm;
      const tau = (up ? 0.09 : 0.2) * v.inr * (this.shiftT > 0 ? 0.55 : 1);
      this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / tau));
      // limiter: hit the redline under power and bounce
      if (this.rpm > v.red * 0.985 && th > 0.5) {
        this.cutPhase += dt * 13;
        cut = this.cutPhase % 1 < 0.45;
        if (cut) this.rpm = v.red * 0.955;
        else this.rpm = Math.min(v.red, this.rpm + v.red * 0.02);
      } else this.cutPhase = 0;
      level = 1;
      // engine braking: rolling with the throttle closed keeps a held note (and a burble on the cars that have one)
      if (!v.ev && th < 0.2 && sp > 2) {
        overrun = clamp((sp - 2) / 4, 0, 1) * (1 - th / 0.2) * clamp(0.55 + this.rpm / v.red, 0, 1);
        const rate = overrun * (v.crack ?? (v.lope > 0.15 ? v.lope * 0.35 : 0)) * 5 * clamp((this.rpm / v.red - 0.25) * 3, 0, 1);
        if (rate > 0 && this.rand() < dt * rate) pops += 1 + (this.rand() < 0.3 ? 1 : 0);
      }
      // overrun crackle and turbo blow-off on lifting off
      if (this.prevThrottle > 0.5 && th < 0.15 && this.rpm > v.red * 0.4) {
        if (v.crack) pops += Math.round(v.crack * (3 + this.rand() * 4));
        if (v.turbo && this.spool > 0.5) blowoff = true;
      }
      if (v.miss && this.rand() < dt * v.miss * 2.2 * (1 - th * 0.6)) miss = true;
    }
    // hybrid: the combustion engine cuts out below a crawl speed on a light throttle and fades back in over about 0.4 s
    const wantElec = v.hyb && this.phase === 'run' && sp < v.hyb && th < 0.65 ? 0 : 1;
    this.elec += (wantElec - this.elec) * (1 - Math.exp(-dt / (wantElec ? 0.18 : 0.35)));
    this.spool += (th * clamp(this.rpm / v.red, 0, 1) - this.spool) * Math.min(1, dt * (th > this.spool ? 1.6 : 3));
    this.prevThrottle = th;
    const wob = this.phase === 'run' ? v.wob * (Math.sin(this.t * 10.7) * 0.6 + Math.sin(this.t * 19.3 + 1) * 0.4) * idleW() : 0;
    return {
      rpm: this.rpm, gear: this.gear, fire: firingHz(this.rpm, v.cyl), rev: this.rpm / 60,
      level, load: Math.max(this.shiftT > 0 ? th * SHIFT_LOAD : th, overrun * OVERRUN_LOAD), overrun, elec: this.phase === 'run' ? this.elec : 1, shifting: this.shiftDir, cut, starter, wob, pops, blowoff, miss,
      running: this.phase === 'run',
    };
  }
}

function lerp(a: number, b: number, k: number): number { return a + (b - a) * k; }

/** Spool state exposed for the turbo whistle (0..1). */
export const turboSpool = (sim: EngineSim, throttle: number): number => clamp(throttle * sim.rpm / sim.v.red, 0, 1);

export interface Candidate { id: string; d: number }

/**
 * Picks up to `cap` cars for AI engine voices: nearest first, within maxDist, with hysteresis so a current
 * voice holder is only displaced by a car clearly (hyst times) closer. Returns ids in distance order.
 */
export function pickNearest(prev: Iterable<string>, cands: Candidate[], cap: number, maxDist = 70, hyst = 1.3): string[] {
  const had = new Set(prev);
  return cands
    .filter((c) => c.d <= maxDist && Number.isFinite(c.d))
    .map((c) => ({ id: c.id, d: c.d, score: had.has(c.id) ? c.d / hyst : c.d }))
    .sort((a, b) => a.score - b.score || a.d - b.d)
    .slice(0, Math.max(0, cap))
    .sort((a, b) => a.d - b.d)
    .map((c) => c.id);
}

/** Distance gain: 1 up close, inverse-square-ish beyond 8 m, zero at maxDist. */
export const distanceGain = (d: number, maxDist = 70): number => {
  const x = Math.max(0, fin(d));
  return x >= maxDist ? 0 : (1 / (1 + (x / 8) ** 2)) * (1 - x / maxDist);
};

/** Doppler pitch ratio for a closing speed in m/s (positive = approaching), clamped to a musical range. */
export const dopplerRatio = (closing: number): number => clamp(343 / (343 - clamp(fin(closing), -60, 60)), 0.88, 1.12);
