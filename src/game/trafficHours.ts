import { Rng } from '@/core/Rng';

/**
 * How many of today's moving cars may drive at each hour (TRAFFIC2, owner 22 Nov: "cut overall at 25%, congested only
 * sometimes, early morning and afternoon, 9-5 kinda deal"). The share is 1 of `maxMoving` only before the first
 * `setHour`; after that it follows the curve below, a random day and a slow wobble. Pure apart from `VehicleHours`.
 */

/** Baseline share by hour (smoothstep between keys). Never above 0.70 here, so outside the rush peaks the cap is at most 0.75. */
const BASE_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.30], [5, 0.30], [6, 0.50], [11, 0.70], [15, 0.70], [20, 0.60], [23, 0.40], [24, 0.30],
];
export const AM_PEAK_CENTRE = 8.75;
export const PM_PEAK_CENTRE = 17.5;
/** each rush peak is a raised-cosine bump that is zero outside this many hours either side of its centre */
export const PEAK_HALF_WIDTH = 2;
/** a heavy day is one whose rush is drawn between 0.7 and 1.0; otherwise 0 to 0.35 */
export const HEAVY_DAY_SHARE = 0.4;
/** peak height at the centre of a rush: 0.80 at rush 0 (the free-flow peak), 1.25 at rush 1 (congested, above today's cap) */
export const PEAK_BASE = 0.8;
export const PEAK_RANGE = 0.45;
/** the wobble is plus or minus this share of the curve */
export const WOBBLE_SHARE = 0.1;

function wrap24(h: number): number { return ((h % 24) + 24) % 24; }
function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

function baseCurve(hour: number): number {
  const h = wrap24(hour);
  for (let i = 1; i < BASE_KEYS.length; i++) {
    const [h1, f1] = BASE_KEYS[i];
    if (h <= h1) {
      const [h0, f0] = BASE_KEYS[i - 1];
      const t = (h - h0) / (h1 - h0);
      return f0 + (f1 - f0) * (t * t * (3 - 2 * t));
    }
  }
  return BASE_KEYS[BASE_KEYS.length - 1][1];
}

/** 1 at the peak centre, 0 at or beyond PEAK_HALF_WIDTH, smooth at both ends (raised cosine). */
function peakWeight(hour: number, centre: number): number {
  let d = Math.abs(wrap24(hour - centre));
  if (d > 12) d = 24 - d;
  if (d >= PEAK_HALF_WIDTH) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * d) / PEAK_HALF_WIDTH));
}

/** Height of a rush peak at its centre for a rush value (0 to 1). */
export function peakHeight(rush: number): number { return PEAK_BASE + PEAK_RANGE * clamp01(rush); }

/**
 * Share of today's `maxMoving` allowed to drive at `hour` (0 to 24, wraps). `rush` is the morning rush (0 = light,
 * 1 = congested) and `pmRush` the afternoon one (defaults to `rush`). Continuous in the hour.
 */
export function vehicleHourFactor(hour: number, rush: number, pmRush: number = rush): number {
  if (!Number.isFinite(hour)) return 1;
  const h = wrap24(hour);
  const base = baseCurve(h);
  const am = peakWeight(h, AM_PEAK_CENTRE);
  const pm = peakWeight(h, PM_PEAK_CENTRE);
  return base
    + am * (peakHeight(rush) - baseCurve(AM_PEAK_CENTRE))
    + pm * (peakHeight(pmRush) - baseCurve(PM_PEAK_CENTRE));
}

export interface DayRush { heavy: boolean; am: number; pm: number }

/** One day's rush: heavy with probability HEAVY_DAY_SHARE; the afternoon gets its own draw of 0.7 to 1.1, clamped to 1. */
export function drawDayRush(rng: Rng): DayRush {
  const heavy = rng.chance(HEAVY_DAY_SHARE);
  const am = heavy ? rng.range(0.7, 1.0) : rng.range(0, 0.35);
  const pm = Math.min(1, am * rng.range(0.7, 1.1));
  return { heavy, am, pm };
}

/** True when moving forward from `prev` to `next` (hours, wrapping) passes 04:00. */
export function passesFourAM(prev: number, next: number): boolean {
  const fwd = wrap24(next - prev);
  const toMark = wrap24(4 - prev);
  const t0 = toMark === 0 ? 24 : toMark;
  return t0 > 0 && t0 <= fwd;
}

/**
 * The hour-of-day state of moving traffic. Idle (factor exactly 1, no random draws) until `set` is first called.
 * Uses its own stream, seeded from a label, so the traffic and pedestrian streams are never shifted by it.
 */
export class VehicleHours {
  private readonly rng: Rng;
  private started = false;
  private hour = 0;
  private day: DayRush = { heavy: false, am: 0, pm: 0 };
  private wobbleFrom = 0;
  private wobbleTo = 0;
  private wobbleT = 0;
  private wobbleLen = 90;

  constructor(label: string) { this.rng = new Rng(Rng.hash(label)); }

  /** true once `set` has been called */
  get known(): boolean { return this.started; }

  /** Set the clock (hours). Rolls a new day when the hour moves forward past 04:00. */
  set(hour: number): void {
    if (!Number.isFinite(hour)) return;
    const h = wrap24(hour);
    if (!this.started) {
      this.started = true;
      this.day = drawDayRush(this.rng);
      this.wobbleTo = this.rng.range(-WOBBLE_SHARE, WOBBLE_SHARE);
      this.wobbleLen = this.rng.range(60, 120);
    } else if (passesFourAM(this.hour, h)) {
      this.day = drawDayRush(this.rng);
    }
    this.hour = h;
  }

  /** Advance the wobble by game seconds. Does nothing before `set`. */
  advance(dt: number): void {
    if (!this.started || !(dt > 0)) return;
    this.wobbleT += dt;
    while (this.wobbleT >= this.wobbleLen) {
      this.wobbleT -= this.wobbleLen;
      this.wobbleFrom = this.wobbleTo;
      this.wobbleTo = this.rng.range(-WOBBLE_SHARE, WOBBLE_SHARE);
      this.wobbleLen = this.rng.range(60, 120);
    }
  }

  /** The wobble now, eased between targets, in [-WOBBLE_SHARE, WOBBLE_SHARE]. */
  get wobble(): number {
    const u = clamp01(this.wobbleT / this.wobbleLen);
    return this.wobbleFrom + (this.wobbleTo - this.wobbleFrom) * (u * u * (3 - 2 * u));
  }

  /** The share of `maxMoving` allowed now: exactly 1 before `set`. */
  get factor(): number {
    if (!this.started) return 1;
    return Math.max(0, vehicleHourFactor(this.hour, this.day.am, this.day.pm) * (1 + this.wobble));
  }
}
