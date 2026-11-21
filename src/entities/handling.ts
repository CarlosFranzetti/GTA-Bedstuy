/**
 * CARS3: the player-driven handling model, and the table that tunes it.
 *
 * STYLE reference only (a heavy, rolling, plan-your-braking feel with a forgiving limit); no numbers or files are copied from any game.
 * It is a flat 2D dynamic bicycle model:
 *  - yaw inertia from mass and wheelbase, so a bus is slow to turn and slow to stop turning;
 *  - one slip-angle grip curve per axle (rises to a peak angle, falls to a floor, comes back progressively), so understeer and
 *    oversteer both exist and a slide is recoverable;
 *  - axle loads faked from the longitudinal and lateral acceleration: braking loads the front and unloads the rear, throttle
 *    squats the rear, a corner unloads the inside and costs both axles a little grip (more on a tall SUV or van);
 *  - a friction circle per axle: drive and brake force take grip away from cornering, so front-drive pushes wide under power,
 *    rear-drive steps out, hard braking in a bend can lock a rear without ABS;
 *  - drive layout (front, rear, all-wheel) from VehicleSpec.drivetrain / torqueBias; brake bias; ABS or lock-up;
 *  - a handbrake that locks the rear axle (rear grip factor `hbRear`, returning progressively when released);
 *  - steering that is quick at a standstill, calm at speed, self-centring, and rate-limited for keys but quick for a stick;
 *  - engine braking, a gearbox feel in the thrust curve (torque falls through each gear, a short cut at each shift);
 *  - recovery help: with the stick released the rear grip comes back, yaw is damped and capped, so a spin ends in a few metres.
 * Below ~3 m/s (and in reverse) the old kinematic low-speed behaviour is used, so there is no jitter at rest.
 *
 * TUNING IS DATA: every number below is in HANDLING_CLASSES (per class) and HANDLING_OVERRIDES (per vehicle type).
 * docs/swarm/tasks/CARS3.md explains each field.
 */
import { clamp } from '@/core/Math2';
import type { VehicleSpec, VehicleType } from '@/world/types';

export type HandlingClassName =
  | 'compact' | 'hotcompact' | 'sedan' | 'bigsedan' | 'limo' | 'muscle' | 'sports' | 'supercar'
  | 'suv' | 'bigsuv' | 'pickup' | 'van' | 'truck' | 'heavy' | 'bus';

export interface HandlingClass {
  // --- chassis
  /** wheelbase as a fraction of body length */
  wheelbaseFrac: number;
  /** share of the weight on the front axle (0..1): above 0.5 pushes (understeer) */
  weightFront: number;
  /** centre of mass height, m (load transfer lever) */
  hcg: number;
  /** yaw inertia multiplier: Iz = yawK * m * a * b */
  yawK: number;
  // --- tyres (grip itself is also scaled by VehicleSpec.grip, `Vehicle.grip` and `Vehicle.roadGrip`)
  /** peak friction coefficient, front and rear (1 = 9.81 m/s^2 of lateral acceleration) */
  muF: number; muR: number;
  /** slip angle (degrees) at which each axle grips best */
  peakF: number; peakR: number;
  /** grip while sliding, as a fraction of the peak (1 = no drop-off) */
  floorF: number; floorR: number;
  /** how much lateral load transfer costs grip (0 = none), and how much more of it the front axle pays (-0.5..0.5) */
  loadSens: number; rollBias: number;
  // --- brakes and drive
  /** share of the brake force on the front axle */
  brakeBias: number;
  /** ABS: brakes never lock. Without it a rear that is asked for more than it has locks and loses cornering grip */
  abs: boolean;
  /** engine braking, m/s^2 (0 for none) */
  engineBrake: number;
  /** gear count (0 = single speed, electric), how deep the torque saw-tooth is, shift cut in seconds */
  gears: number; gearFeel: number; shiftCut: number;
  /** drive traction limit as a multiple of the tyre grip (arcade: >1 lets a hard launch bite, <1 lets a muscle car spin its tyres) */
  tractionBoost: number;
  /** rear grip factor with the handbrake on */
  hbRear: number;
  // --- steering
  /** speed (m/s) at which the lock has halved from its low-speed value, and key-steering rate multiplier */
  steerRef: number; steerRate: number;
  /** multiplier on the calm yaw-rate cap of a held key (0.5 rad/s at crawl to 1 rad/s at 16 m/s): the main knob for how tight a class turns at 30 to 60 km/h */
  yawCap: number;
  /** yaw acceleration limit (rad/s^2) of the low-speed kinematic regime: how quickly the nose swings, and the yaw-rate cap (rad/s) */
  yawAccel: number; yawMax: number;
  // --- visuals (body roll rad per m/s^2 of lateral accel, pitch rad per m/s^2 of longitudinal accel, caps, spring stiffness and damping)
  rollGain: number; pitchGain: number; rollMax: number; pitchMax: number; springK: number; springC: number;
}

const BASE: HandlingClass = {
  wheelbaseFrac: 0.6, weightFront: 0.55, hcg: 0.55, yawK: 1.25,
  muF: 1.05, muR: 1.2, peakF: 9, peakR: 10, floorF: 0.86, floorR: 0.8, loadSens: 0.35, rollBias: 0.08,
  brakeBias: 0.7, abs: true, engineBrake: 1.6, gears: 5, gearFeel: 0.16, shiftCut: 0.12, tractionBoost: 1.7, hbRear: 0.16,
  steerRef: 15, steerRate: 1.0, yawCap: 1.0, yawAccel: 7, yawMax: 2.3,
  rollGain: 0.0085, pitchGain: 0.0055, rollMax: 0.11, pitchMax: 0.075, springK: 55, springC: 7.5,
};

const c = (o: Partial<HandlingClass>): HandlingClass => ({ ...BASE, ...o });

/** One row per class. Compact to bus, light and tidy to heavy and wallowy. */
export const HANDLING_CLASSES: Record<HandlingClassName, HandlingClass> = {
  compact: c({ yawCap: 1.1, weightFront: 0.6, hcg: 0.5, yawK: 1.1, muF: 1.08, muR: 1.2, peakF: 9.5, peakR: 10, rollGain: 0.0095, springK: 50, steerRef: 14.5, engineBrake: 1.4 }),
  hotcompact: c({ yawCap: 1.25, weightFront: 0.6, hcg: 0.5, yawK: 1.05, muF: 1.14, muR: 1.22, peakF: 9, peakR: 9.5, floorF: 0.9, floorR: 0.86, rollGain: 0.0075, springK: 80, springC: 10, steerRef: 13, steerRate: 1.2, tractionBoost: 1.6 }),
  sedan: c({}),
  bigsedan: c({ yawCap: 0.9, weightFront: 0.54, yawK: 1.5, muF: 0.95, muR: 1.08, peakF: 10, peakR: 11, floorF: 0.85, abs: false, engineBrake: 1.3, gears: 4, rollGain: 0.012, pitchGain: 0.0075, rollMax: 0.13, springK: 34, springC: 5, yawAccel: 5.5, steerRef: 14, tractionBoost: 1.4 }),
  limo: c({ yawCap: 0.7, wheelbaseFrac: 0.66, weightFront: 0.53, yawK: 1.9, muF: 0.92, muR: 1.05, peakF: 10, peakR: 11, abs: false, gears: 4, rollGain: 0.012, pitchGain: 0.0075, rollMax: 0.13, springK: 32, springC: 5, yawAccel: 3.4, yawMax: 1.6, steerRef: 12, tractionBoost: 1.3 }),
  muscle: c({ yawCap: 0.95, weightFront: 0.53, yawK: 1.4, muF: 0.95, muR: 1.12, peakF: 10, peakR: 11, floorF: 0.84, floorR: 0.72, brakeBias: 0.66, abs: false, engineBrake: 1.2, gears: 4, gearFeel: 0.22, rollGain: 0.009, springK: 60, steerRef: 11, tractionBoost: 1.8 }),
  sports: c({ yawCap: 1.3, weightFront: 0.5, hcg: 0.45, yawK: 1.05, muF: 1.18, muR: 1.3, peakF: 8, peakR: 8.5, floorF: 0.88, floorR: 0.84, engineBrake: 1.3, gears: 6, rollGain: 0.0045, pitchGain: 0.0035, springK: 100, springC: 12, yawAccel: 9.5, steerRef: 12, tractionBoost: 1.5 }),
  supercar: c({ yawCap: 1.45, weightFront: 0.44, hcg: 0.4, yawK: 0.95, muF: 1.35, muR: 1.5, peakF: 7.5, peakR: 8, floorF: 0.9, floorR: 0.88, engineBrake: 1.2, gears: 7, gearFeel: 0.12, rollGain: 0.0035, pitchGain: 0.003, springK: 120, springC: 14, yawAccel: 11, steerRef: 11, tractionBoost: 1.9 }),
  suv: c({ yawCap: 0.9, weightFront: 0.53, hcg: 0.85, yawK: 1.4, muF: 0.98, muR: 1.22, peakF: 10, peakR: 11, floorF: 0.85, floorR: 0.82, loadSens: 0.65, rollBias: 0.12, rollGain: 0.0125, pitchGain: 0.0075, rollMax: 0.14, springK: 42, springC: 6.5, yawAccel: 5.5, steerRef: 14, tractionBoost: 1.5 }),
  bigsuv: c({ yawCap: 0.85, weightFront: 0.52, hcg: 0.95, yawK: 1.55, muF: 0.94, muR: 1.18, peakF: 10.5, peakR: 11, floorF: 0.84, floorR: 0.8, loadSens: 0.7, rollBias: 0.14, rollGain: 0.0145, pitchGain: 0.0085, rollMax: 0.15, springK: 38, springC: 6, yawAccel: 4.8, steerRef: 13, tractionBoost: 1.4 }),
  pickup: c({ yawCap: 0.9, weightFront: 0.57, hcg: 0.8, yawK: 1.5, muF: 0.95, muR: 1.12, peakF: 10, peakR: 11, floorF: 0.85, floorR: 0.78, loadSens: 0.6, brakeBias: 0.72, rollGain: 0.011, pitchGain: 0.0075, rollMax: 0.14, springK: 40, springC: 6, yawAccel: 5, steerRef: 13, tractionBoost: 1.3 }),
  van: c({ yawCap: 0.85, weightFront: 0.5, hcg: 1.0, yawK: 1.6, muF: 0.92, muR: 1.15, peakF: 10, peakR: 11, loadSens: 0.75, rollBias: 0.12, engineBrake: 2.0, rollGain: 0.0145, pitchGain: 0.008, rollMax: 0.15, springK: 36, springC: 6, yawAccel: 4.5, steerRef: 13, tractionBoost: 1.35 }),
  truck: c({ yawCap: 0.75, wheelbaseFrac: 0.64, weightFront: 0.42, hcg: 1.25, yawK: 1.8, muF: 0.9, muR: 1.12, peakF: 11, peakR: 12, loadSens: 0.85, abs: false, brakeBias: 0.6, engineBrake: 2.4, gears: 6, gearFeel: 0.25, shiftCut: 0.2, rollGain: 0.016, pitchGain: 0.009, rollMax: 0.16, pitchMax: 0.08, springK: 32, springC: 5.5, yawAccel: 3.5, yawMax: 1.7, steerRef: 13, steerRate: 0.9, tractionBoost: 1.25 }),
  heavy: c({ yawCap: 0.7, wheelbaseFrac: 0.62, weightFront: 0.45, hcg: 1.35, yawK: 1.9, muF: 0.88, muR: 1.1, peakF: 11, peakR: 12, loadSens: 0.9, abs: false, brakeBias: 0.6, engineBrake: 3.0, gears: 6, gearFeel: 0.28, shiftCut: 0.25, rollGain: 0.017, pitchGain: 0.009, rollMax: 0.17, pitchMax: 0.08, springK: 30, springC: 5.5, yawAccel: 3.0, yawMax: 1.5, steerRef: 12, steerRate: 0.85, tractionBoost: 1.2 }),
  bus: c({ yawCap: 0.65, wheelbaseFrac: 0.58, weightFront: 0.4, hcg: 1.3, yawK: 2.0, muF: 0.88, muR: 1.05, peakF: 11, peakR: 12, loadSens: 0.85, abs: false, brakeBias: 0.58, engineBrake: 3.0, gears: 6, gearFeel: 0.25, shiftCut: 0.22, rollGain: 0.014, pitchGain: 0.009, rollMax: 0.15, pitchMax: 0.08, springK: 30, springC: 5.5, yawAccel: 2.4, yawMax: 1.3, steerRef: 12, steerRate: 0.8, tractionBoost: 1.2 }),
};

/** Which class each vehicle type belongs to. New types: add one line. */
export const HANDLING_OF: Record<VehicleType, HandlingClassName> = {
  sedan: 'sedan', beater: 'sedan', cab: 'sedan', cop: 'sedan', luxury: 'sedan', evsedan: 'sedan', wagon: 'sedan',
  hatch: 'compact', minitruck: 'compact', hothatch: 'hotcompact',
  pony: 'muscle', muscle: 'muscle', coupe911: 'sports', jdmcoupe: 'sports', convertible: 'sports', exotic: 'supercar',
  suv: 'suv', crossover: 'suv', copsuv: 'suv', bigsuv: 'bigsuv', pickup: 'pickup', wedgetruck: 'pickup',
  cargovan: 'van', panelvan: 'van', dollarvan: 'van', ambulance: 'van', minivan: 'van', taxivan: 'van',
  boxtruck: 'truck', stepvan: 'truck', icecream: 'truck', garbage: 'heavy', bus: 'bus',
  towncar: 'bigsedan', classic: 'bigsedan', donk: 'bigsedan', limo: 'limo',
};

/** Per-type tweaks on top of the class row. */
export const HANDLING_OVERRIDES: Partial<Record<VehicleType, Partial<HandlingClass>>> = {
  cop: { muF: 1.12, muR: 1.14, rollGain: 0.0075, springK: 70, springC: 9 },
  beater: { muF: 0.98, muR: 0.96, abs: false, rollGain: 0.0105, springK: 40, springC: 5 },
  evsedan: { gears: 0, engineBrake: 2.6, weightFront: 0.49, hcg: 0.48 },
  wedgetruck: { gears: 0, engineBrake: 2.4 },
  luxury: { rollGain: 0.0075, springK: 60, springC: 9 },
  wagon: { rollGain: 0.0095, weightFront: 0.52 },
  taxivan: { weightFront: 0.55 },
  minivan: { weightFront: 0.55 },
  convertible: { hcg: 0.48, rollGain: 0.0055 },
};

/** The class row for a type with its override applied. */
export function handlingFor(type: VehicleType): HandlingClass {
  return { ...HANDLING_CLASSES[HANDLING_OF[type] ?? 'sedan'], ...(HANDLING_OVERRIDES[type] ?? {}) };
}

/** Normalised lateral force against slip angle: rises to 1 at x = 1 (the peak angle), falls to `floor` by x = 3. */
export function tyreShape(x: number, floor: number): number {
  if (x <= 0) return 0;
  if (x < 1) return x * (2 - x);
  const t = Math.min(1, (x - 1) / 2);
  return 1 - (1 - floor) * (t * t * (3 - 2 * t));
}

const G = 9.81;
const DEG = Math.PI / 180;
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- fixed feel constants (not per class)
const REVERSE_MAX = 8;
const REVERSE_ACCEL_FRAC = 0.55;
const BRAKE_APPLY = 7.5;
const BRAKE_RELEASE = 14;
const OPPOSE_BRAKE = 0.8;
const HANDBRAKE_DECEL_FRAC = 0.2;
const STEER_RATE = 3.2;
const STEER_RETURN_MULT = 1.6;
const ANALOG_FOLLOW = 7;
const LOW_YAW_CAP = 0.5;
const HIGH_YAW_CAP = 1.0;
const LOW_YAW_SPEED = 4;
const HIGH_YAW_SPEED = 16;
const K_LAT = 12;
const KIN_BELOW = 3;
const DYN_ABOVE = 6;
const TYRE_RELAX = 0.35;       // m: slip angles follow the geometry over this much travel
const REAR_REGAIN = 5;         // 1/s: how quickly rear grip comes back after a handbrake or a slide
const REAR_LOSE = 26;          // 1/s: how quickly the handbrake takes it away
const BRAKE_BOOST = 1.3;       // brake traction as a multiple of tyre grip
const ELECTRIC_EXP = 3;
const SUBSTEP = 1 / 120;
/** the assist starts when the rear axle is this far into its slip-angle peak (1 = at the peak) and is gone after SPAN more */
const SLIDE_ASSIST_FROM = 0.95;
const SLIDE_ASSIST_SPAN = 0.9;
const SLIDE_ASSIST_MIN = 0.3;
/** share of the steered front tyre's drag that slows the car in a corner (1 = full physical scrub) */
const SCRUB = 0.5;
/** yaw acceleration (rad/s^2) a fully rear-driven car gets at full load and full lock (power oversteer's push) */
const POWER_ROTATE = 1.3;

const ENGINE_BRAKE_FADE = 2;

export interface HandlingInput { throttle: number; steer: number; brake: boolean; handbrake: boolean }
export interface HandlingState { u: number; v: number; r: number }
export interface HandlingEnv { grip: number; roadGrip: number }

/**
 * The stateful half: steering, pedals, filtered accelerations. `Vehicle` owns one per car (made lazily, player-driven cars only unless
 * `Vehicle.aiHandling` is on). `step` advances the body-frame state (u forward, v right, r yaw rate, + = nose right) by h seconds.
 */
export class HandlingModel {
  readonly cls: HandlingClass;
  readonly m: number; readonly L: number; readonly a: number; readonly b: number; readonly iz: number; readonly track: number;
  readonly maxSteer: number;
  steerNorm = 0; delta = 0;
  brakeP = 0;
  /** filtered body accelerations: + forward, + right (m/s^2) */
  aLong = 0; aLat = 0;
  alphaF = 0; alphaR = 0;
  rearCap = 1;
  slip = 0; wheelspin = 0; lockup = 0;
  /** 0..1, driver is pushing the engine this hard (for audio and the CARS14 `driveLoad`) */
  driveLoad = 0;
  /** share of the (low-speed) kinematic model in use, 1 = fully kinematic */
  kinShare = 1;
  private gearIdx = 0; private shiftT = 0;
  private analogT = 0; private analog = false;
  private rBlend = 0;
  private readonly dt: number | null;
  private readonly electric: boolean;
  private readonly tyre: number;
  private readonly maxSpeed: number; private readonly accel: number; private readonly brakeDecel: number;
  private readonly steerRateScale: number;

  constructor(readonly spec: VehicleSpec) {
    this.cls = handlingFor(spec.type);
    this.m = spec.mass ?? 1400;
    this.L = this.cls.wheelbaseFrac * spec.length;
    this.b = this.cls.weightFront * this.L;        // CG to rear axle
    this.a = this.L - this.b;                       // CG to front axle
    this.iz = this.cls.yawK * this.m * this.a * this.b;
    this.track = spec.width * 0.82;
    this.maxSteer = spec.maxSteer;
    this.dt = spec.drivetrain ? (spec.torqueBias ?? (spec.drivetrain === 'rwd' ? 1 : spec.drivetrain === 'fwd' ? 0 : 0.5)) : null;
    this.electric = !!spec.electric;
    this.tyre = spec.grip ?? 1;
    this.maxSpeed = spec.maxSpeed; this.accel = spec.accel; this.brakeDecel = spec.brakeDecel;
    this.steerRateScale = spec.steerRate ?? 1;
  }

  /** Share of drive torque on the rear axle. Front-engined cars without a `drivetrain` are treated as rear-driven or front-driven by class. */
  private get rearShare(): number {
    if (this.dt !== null) return this.dt;
    const n = HANDLING_OF[this.spec.type];
    return n === 'compact' || n === 'sedan' || n === 'suv' || n === 'van' || n === 'hotcompact' ? 0 : 1;
  }

  /** Advance by h seconds (any h; it sub-steps). Returns nothing: state is updated in place. */
  step(h: number, st: HandlingState, input: HandlingInput, env: HandlingEnv): void {
    let rem = h;
    while (rem > 1e-9) { const s = Math.min(rem, SUBSTEP); this.sub(s, st, input, env); rem -= s; }
  }

  private sub(h: number, st: HandlingState, input: HandlingInput, env: HandlingEnv): void {
    const cl = this.cls, m = this.m, L = this.L, a = this.a, b = this.b;
    let { u, v, r } = st;
    const uAbs = Math.abs(u);
    const thr = clamp(input.throttle, -1, 1);
    const gripK = env.grip * this.tyre * env.roadGrip;

    // ---- steering input: keys ramp, a stick (fractional values) follows quickly
    const s = clamp(input.steer, -1, 1);
    if (s !== 0 && Math.abs(s) !== 1) { this.analog = true; this.analogT = 0.4; } else if ((this.analogT -= h) <= 0) this.analog = false;
    if (this.analog) {
      this.steerNorm += (s - this.steerNorm) * Math.min(1, ANALOG_FOLLOW * h);
    } else {
      const returning = Math.abs(s) < Math.abs(this.steerNorm) && s * this.steerNorm >= 0;
      const rate = (STEER_RATE * cl.steerRate * this.steerRateScale / (1 + uAbs / 18)) * (returning ? STEER_RETURN_MULT * (1 + uAbs / 12) : 1);
      this.steerNorm += clamp(s - this.steerNorm, -rate * h, rate * h);
    }

    // ---- loads (filtered accelerations, so no algebraic loop)
    const dN = clamp(m * this.aLong * cl.hcg / L, -0.35 * m * G, 0.35 * m * G);
    const Nf = m * G * b / L - dN, Nr = m * G * a / L + dN;
    const lt = clamp(Math.abs(this.aLat) * cl.hcg / (G * this.track), 0, 0.6);
    const capLatF = Math.max(0.35, 1 - cl.loadSens * lt * (0.5 + cl.rollBias));
    const capLatR = Math.max(0.35, 1 - cl.loadSens * lt * (0.5 - cl.rollBias));

    // ---- pedals
    const oppose = !input.brake && thr * u < 0 && uAbs > 0.5;
    const pedal = input.brake ? 1 : oppose ? OPPOSE_BRAKE * (this.analog || Math.abs(thr) < 1 ? Math.abs(thr) : 1) : 0;
    this.brakeP += (pedal - this.brakeP) * Math.min(1, (pedal > this.brakeP ? BRAKE_APPLY : BRAKE_RELEASE) * h);
    if (this.brakeP < 0.01 && pedal === 0) this.brakeP = 0;
    const ease = 0.35 + 0.65 * Math.min(1, uAbs / 2.5);
    const sgn = u >= 0 ? 1 : -1;

    // ---- longitudinal demand per axle (N, + = forward)
    const drive = !input.brake && !oppose && thr !== 0;
    let aDrive = 0;
    if (drive) {
      const d = Math.sign(thr);
      const uu = Math.max(0, d * u);
      const vmD = d > 0 ? this.maxSpeed : REVERSE_MAX;
      const A = d > 0 ? this.accel : this.accel * REVERSE_ACCEL_FRAC;
      const ratio = Math.min(1.5, uu / vmD);
      const curve = this.electric ? ratio ** ELECTRIC_EXP : ratio * ratio;
      let demand = Math.abs(thr) - curve;
      // gearbox: torque is highest at the start of a gear and falls through it; a short cut at each upshift
      if (d > 0 && cl.gears > 0 && !this.electric) {
        const vf = clamp(uu / (this.maxSpeed * 0.96), 0, 0.9999);
        const g = Math.floor(vf * cl.gears), p = vf * cl.gears - g;
        if (g > this.gearIdx && thr > 0.5) this.shiftT = cl.shiftCut;
        this.gearIdx = g;
        let f = 1 + cl.gearFeel * (0.5 - p) * 2 * (g === 0 ? 0.4 : 1);
        if (this.shiftT > 0) { this.shiftT -= h; f *= 0.45; }
        demand *= f * (1 + cl.gears * cl.shiftCut * 0.09); // the shift cuts cost time: pay it back in torque so 0-100 stays what the spec says
      }
      aDrive = d * A * demand;
      this.driveLoad = d > 0 ? clamp(demand, 0, 1) : 0;
    } else {
      this.driveLoad = 0;
      this.gearIdx = Math.min(this.gearIdx, Math.floor(clamp(uAbs / (this.maxSpeed * 0.96), 0, 0.9999) * Math.max(1, cl.gears)));
    }
    const rs = this.rearShare;
    // drive force on each axle, clipped by traction (wheelspin)
    let Fdr = m * aDrive * rs, Fdf = m * aDrive * (1 - rs);
    const trF = gripK * cl.muF * cl.tractionBoost * Nf, trR = gripK * cl.muR * cl.tractionBoost * Nr;
    let spin = 0;
    if (Math.abs(Fdr) > trR) { spin = Math.max(spin, Math.min(1, Math.abs(Fdr) / trR - 1)); Fdr = Math.sign(Fdr) * trR; }
    if (Math.abs(Fdf) > trF) { spin = Math.max(spin, Math.min(1, Math.abs(Fdf) / trF - 1)); Fdf = Math.sign(Fdf) * trF; }
    // cosmetic tyre spin: a strong rear drive asked for more than the tyres have at a standing start spins them for show (physics unchanged)
    const demandRaw = Math.abs(m * aDrive * rs) / Math.max(1, gripK * cl.muR * Nr);
    const show = Math.max(spin, clamp(demandRaw - 1, 0, 1) * (1 - smooth(4, 12, uAbs)));
    this.wheelspin += (show - this.wheelspin) * Math.min(1, 12 * h);

    // brakes + engine braking (oppose the motion)
    const fade = Math.min(1, uAbs / ENGINE_BRAKE_FADE);
    const ebF = (!drive && !input.brake) ? cl.engineBrake * fade : 0;
    const dragA = (!drive ? this.accel * (u / this.maxSpeed) * Math.abs(u / this.maxSpeed) : 0);
    const brakeA = this.brakeDecel * this.brakeP * ease * Math.min(1, gripK) ** 1.4; // the pedal force itself is limited by the surface
    const hbA = input.handbrake ? this.brakeDecel * HANDBRAKE_DECEL_FRAC : 0;
    const atRest = uAbs < 0.05 && !drive; // brakes never push a stopped car backwards
    let FbF = atRest ? 0 : m * brakeA * cl.brakeBias, FbR = atRest ? 0 : m * (brakeA * (1 - cl.brakeBias) + hbA);
    const gripB = Math.pow(gripK, 1); // brakes lose a little less than cornering on a wet road
    const capBF = gripB * cl.muF * BRAKE_BOOST * Nf * 0.97, capBR = gripB * cl.muR * BRAKE_BOOST * Nr * 0.97;
    let lock = 0;
    if (FbF > capBF) { if (!cl.abs) lock = Math.max(lock, 0.5); FbF = capBF; }
    if (FbR > capBR) { if (!cl.abs) lock = Math.max(lock, 1); FbR = capBR; }
    this.lockup += (lock - this.lockup) * Math.min(1, 14 * h);
    const retard = atRest ? 0 : m * (ebF + Math.abs(dragA));
    const FxF = Fdf - sgn * FbF - sgn * retard * (1 - rs), FxR = Fdr - sgn * FbR - sgn * retard * rs;
    // never reverse the motion by braking alone
    const Fx = FxF + FxR;

    // ---- friction circle: drive / brake force take grip from cornering
    const useF = clamp(Math.abs(FxF) / Math.max(1, gripK * cl.muF * Nf * cl.tractionBoost), 0, 1);
    const useR = clamp(Math.abs(FxR) / Math.max(1, gripK * cl.muR * Nr * cl.tractionBoost), 0, 1);
    const capF = gripK * cl.muF * Nf * capLatF * Math.sqrt(1 - 0.85 * useF * useF);
    // rear: handbrake and lock-up take it away fast and give it back slowly (progressive)
    let rearTarget = input.handbrake ? cl.hbRear : 1;
    rearTarget *= 1 - 0.7 * this.lockup;
    this.rearCap += (rearTarget - this.rearCap) * Math.min(1, (rearTarget < this.rearCap ? REAR_LOSE : REAR_REGAIN) * h);
    const capR = gripK * cl.muR * Nr * capLatR * Math.sqrt(1 - 0.85 * useR * useR) * this.rearCap;

    // ---- steering lock: quick at a standstill, calm at speed, never more than the tyres can use + a margin
    const uF = Math.max(uAbs, 0.1);
    let lock0 = this.maxSteer / (1 + (uAbs / cl.steerRef) ** 2);
    const muEff = Math.max(0.5, cl.muF * gripK * capLatF);
    const dLim = (L * muEff * G * 1.1) / (uF * uF) + cl.peakF * DEG * (this.analog ? 2.0 : 1.15);
    lock0 = Math.min(lock0, dLim);
    // kinematic regime: the old calm cap on the yaw rate so a held key does not spin the car on the spot
    const t = clamp((uAbs - LOW_YAW_SPEED) / (HIGH_YAW_SPEED - LOW_YAW_SPEED), 0, 1);
    // the calm yaw-rate cap (rad/s), scaled by the class: how tight a turn a held key gives at a given speed (above ~16 m/s the tyres bind first)
    const cap = (LOW_YAW_CAP + (HIGH_YAW_CAP - LOW_YAW_CAP) * t * t * (3 - 2 * t)) * cl.yawCap;
    const hbFast = input.handbrake && uAbs > 3;
    if (!hbFast) lock0 = Math.min(lock0, Math.atan((cap * L) / uF));
    let delta = this.steerNorm * lock0;
    // slide assist: once the car is sliding, steering that would wind the slide up closes down (countersteer stays free), so a held key
    // does not turn a drift into a spin and nothing can tank-slap
    const xRear = Math.abs(this.alphaR) / (cl.peakR * DEG);
    if (u > KIN_BELOW && delta * this.alphaR < 0 && xRear > SLIDE_ASSIST_FROM) delta *= clamp(1 - (xRear - SLIDE_ASSIST_FROM) / SLIDE_ASSIST_SPAN, SLIDE_ASSIST_MIN, 1);
    this.delta = delta;

    // ---- dynamic bicycle (forward speeds)
    const uD = Math.max(uAbs, 1);
    const afRaw = Math.atan2(v + a * r, uD) - delta;
    const arRaw = Math.atan2(v - b * r, uD);
    const kRelax = Math.min(1, h * uD / TYRE_RELAX);
    this.alphaF += (afRaw - this.alphaF) * kRelax;
    this.alphaR += (arRaw - this.alphaR) * kRelax;
    const released = Math.abs(s) < 0.08 && !input.handbrake;
    const beta = Math.abs(Math.atan2(v, uD));
    const recovering = released && beta > 8 * DEG;
    const floorR = recovering ? Math.max(cl.floorR, 0.97) : cl.floorR;
    const floorF = recovering ? Math.max(cl.floorF, 0.95) : cl.floorF;
    const xF = Math.abs(this.alphaF) / (cl.peakF * DEG), xR = Math.abs(this.alphaR) / (cl.peakR * DEG);
    const Fyf = -Math.sign(this.alphaF) * capF * tyreShape(xF, floorF);
    const Fyr = -Math.sign(this.alphaR) * capR * tyreShape(xR, floorR);
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const vDot = (Fyf * cd + Fyr) / m - u * r;
    const rDot = (a * Fyf * cd - b * Fyr) / this.iz - (recovering ? 2.8 * r : 0)
      + POWER_ROTATE * rs * this.driveLoad * this.steerNorm * Math.min(1, uAbs / 12); // a rear-driven car under power tucks its nose in
    const uDot = Fx / m + v * r - (SCRUB * Fyf * sd) / m;
    const aLatForce = (Fyf * cd + Fyr) / m;
    const vDyn = v + vDot * h;
    const rDyn = r + rDot * h;

    // ---- kinematic (crawling and reverse): steer-angle yaw, lateral velocity bled away
    const kinR = (u / L) * Math.tan(delta) * (hbFast ? 1.5 : 1);
    const yawLimit = (this.cls.muF * gripK * G) / Math.max(uAbs, 2) * (input.handbrake ? 1.6 : 1);
    const rTgt = clamp(kinR, -yawLimit, yawLimit);
    this.rBlend = clamp(rTgt - this.rBlend, -cl.yawAccel * h, cl.yawAccel * h) + this.rBlend;
    let rKin = this.rBlend;
    if (uAbs < 0.3) rKin *= Math.max(0, 1 - 10 * h);
    const bleed = Math.min(Math.abs(v), Math.min(K_LAT * Math.abs(v), gripK * cl.muR * G * 1.1 * this.rearCap) * h);
    const vKin = v - Math.sign(v) * bleed;

    const w = u > 0 ? smooth(KIN_BELOW, DYN_ABOVE, u) : 0;
    this.kinShare = 1 - w;
    r = rKin * (1 - w) + rDyn * w;
    v = vKin * (1 - w) + vDyn * w;
    // keep the dynamic yaw state continuous with the kinematic one when it takes over
    if (w < 1) this.rBlend = r;
    // yaw-rate cap: a tank-slapper cannot build
    const rMax = cl.yawMax * (recovering ? 0.8 : 1);
    if (Math.abs(r) > rMax) r -= (r - Math.sign(r) * rMax) * Math.min(1, 12 * h);

    // ---- longitudinal integrate
    let uN = u + uDot * h;
    // braking and drag never push through zero
    if (uN * u < 0 && !drive) uN = 0;
    uN = clamp(uN, -REVERSE_MAX, this.maxSpeed);
    if (!drive && !input.handbrake && Math.abs(uN) < 0.06) uN = 0;
    u = uN;
    // at rest nothing creeps
    if (u === 0 && Math.abs(v) < 0.05 && !drive) { v = 0; r = 0; this.rBlend = 0; }

    // ---- filters for load transfer, body roll and slip read-outs
    const k = Math.min(1, 10 * h);
    this.aLong += (Fx / m - this.aLong) * k; // the real force, not the change of u (which also holds the body turning under the velocity)
    const aLatNow = w * aLatForce + (1 - w) * (u * r);
    this.aLat += (aLatNow - this.aLat) * k;
    const sat = Math.max((xF - 0.9) / 0.9, (xR - 0.9) / 0.9);
    const slipNow = Math.max(clamp(sat, 0, 1) * w, this.wheelspin * 0.8, this.lockup, clamp((Math.abs(v) - 0.7) / 3.5, 0, 1) * (1 - w));
    this.slip += (slipNow - this.slip) * Math.min(1, 10 * h);
    st.u = u; st.v = v; st.r = r;
  }
}
