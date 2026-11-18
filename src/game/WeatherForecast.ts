import { Rng } from '@/core/Rng';

/**
 * The weather forecast: a seeded chain of weather kinds with durations in game hours. Pure data, no THREE, so tests can
 * walk it. The chain is a plausible day: cloud builds before rain, a storm clears to light rain or broken cloud, fog only
 * forms before dawn and is gone by mid-morning. It is a function of (seed, absolute game hour) only, so the same seed gives
 * the same sky on every run.
 */
export type WeatherKind = 'clear' | 'partlyCloudy' | 'overcast' | 'lightRain' | 'heavyRain' | 'thunderstorm' | 'fog' | 'windy';

export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'partlyCloudy', 'overcast', 'lightRain', 'heavyRain', 'thunderstorm', 'fog', 'windy'];

export function isWeatherKind(s: unknown): s is WeatherKind {
  return typeof s === 'string' && (WEATHER_KINDS as readonly string[]).includes(s);
}

/** What a kind asks of the world. Every value is 0..1 and is reached by a rate-limited ramp, never a step. */
export interface KindParams {
  /** cloud cover of the sky dome */
  cloud: number;
  /** gloom: dims the sun, greys the grade (DayNight.overcast) */
  gloom: number;
  /** rain intensity */
  rain: number;
  /** wind strength */
  wind: number;
  /** distance fog */
  fog: number;
  /** storm: lightning and thunder run while this is above one half */
  storm: number;
  /** how damp the ground gets from this kind alone (mist wets the street a little without any rain) */
  damp: number;
}

export const KIND_PARAMS: Readonly<Record<WeatherKind, Readonly<KindParams>>> = {
  clear: { cloud: 0.1, gloom: 0, rain: 0, wind: 0.12, fog: 0, storm: 0, damp: 0 },
  partlyCloudy: { cloud: 0.45, gloom: 0.06, rain: 0, wind: 0.25, fog: 0, storm: 0, damp: 0 },
  overcast: { cloud: 0.92, gloom: 0.55, rain: 0, wind: 0.3, fog: 0.04, storm: 0, damp: 0 },
  lightRain: { cloud: 0.96, gloom: 0.7, rain: 0.35, wind: 0.35, fog: 0.1, storm: 0, damp: 0 },
  heavyRain: { cloud: 1, gloom: 0.9, rain: 0.85, wind: 0.6, fog: 0.16, storm: 0, damp: 0 },
  thunderstorm: { cloud: 1, gloom: 1, rain: 0.95, wind: 0.85, fog: 0.18, storm: 1, damp: 0 },
  fog: { cloud: 0.6, gloom: 0.35, rain: 0, wind: 0.04, fog: 1, storm: 0, damp: 0.22 },
  windy: { cloud: 0.38, gloom: 0.02, rain: 0, wind: 0.95, fog: 0, storm: 0, damp: 0 },
};

/** The longest a kind may last (game hours). The forecast never holds a state longer than this. */
export const MAX_HOLD_HOURS: Readonly<Record<WeatherKind, number>> = {
  clear: 9, partlyCloudy: 7, overcast: 6, lightRain: 5, heavyRain: 3.5, thunderstorm: 2, fog: 5, windy: 6,
};
const MIN_HOLD_HOURS: Readonly<Record<WeatherKind, number>> = {
  clear: 3, partlyCloudy: 2, overcast: 1.5, lightRain: 1.5, heavyRain: 1, thunderstorm: 0.8, fog: 2.5, windy: 2,
};

/** Which kind follows which (relative weights). Cloud always builds before rain; a storm clears to light rain or broken cloud. */
const NEXT: Readonly<Record<WeatherKind, ReadonlyArray<readonly [WeatherKind, number]>>> = {
  clear: [['partlyCloudy', 0.6], ['windy', 0.28], ['overcast', 0.12]],
  partlyCloudy: [['clear', 0.3], ['windy', 0.15], ['overcast', 0.55]],
  overcast: [['lightRain', 0.5], ['partlyCloudy', 0.38], ['windy', 0.07], ['clear', 0.05]],
  lightRain: [['heavyRain', 0.3], ['overcast', 0.3], ['partlyCloudy', 0.34], ['clear', 0.06]],
  heavyRain: [['thunderstorm', 0.3], ['lightRain', 0.7]],
  thunderstorm: [['lightRain', 0.55], ['partlyCloudy', 0.45]],
  fog: [['partlyCloudy', 0.6], ['clear', 0.4]],
  windy: [['clear', 0.35], ['partlyCloudy', 0.4], ['overcast', 0.25]],
};

/** Fog forms only in the small hours and has burned off by here (hour of day). */
export const FOG_START_WINDOW: readonly [number, number] = [3.5, 6.5];
export const FOG_GONE_BY = 10.5;

export interface Segment {
  kind: WeatherKind;
  /** absolute game hours since day 0, 00:00 */
  start: number;
  end: number;
}

const hourOfDay = (abs: number): number => ((abs % 24) + 24) % 24;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Forecast {
  readonly seed: number | string;
  private readonly rng: Rng;
  private readonly segs: Segment[] = [];

  constructor(seed: number | string = 0) {
    this.seed = seed;
    this.rng = new Rng(`weather:${seed}`);
    // the game opens at a quiet hour: clear or partly cloudy, decided by the seed
    const first: WeatherKind = this.rng.chance(0.55) ? 'clear' : 'partlyCloudy';
    this.push(first, 0);
  }

  /** Segment covering an absolute game hour, plus the one after it. Extends the chain as needed (deterministic). */
  at(abs: number): { cur: Segment; next: Segment } {
    const t = Number.isFinite(abs) ? Math.max(0, abs) : 0;
    while (this.segs[this.segs.length - 1].end <= t || this.segs.length < 2) this.extend();
    // forward scan from a cached cursor: the clock mostly moves forward
    let i = Math.min(this.cursor, this.segs.length - 2);
    if (this.segs[i].start > t) i = 0;
    while (this.segs[i].end <= t) i++;
    this.cursor = i;
    while (i + 1 >= this.segs.length) this.extend();
    return { cur: this.segs[i], next: this.segs[i + 1] };
  }
  private cursor = 0;

  kindAt(abs: number): WeatherKind { return this.at(abs).cur.kind; }

  /** Segments up to an absolute hour, for tests and the debug overlay. */
  list(untilAbs: number): readonly Segment[] {
    this.at(untilAbs);
    return this.segs.filter((s) => s.start <= untilAbs);
  }

  private push(kind: WeatherKind, start: number): void {
    const lo = MIN_HOLD_HOURS[kind];
    const hi = Math.min(MAX_HOLD_HOURS[kind], lo + (MAX_HOLD_HOURS[kind] - lo) * 0.75);
    let dur = this.rng.range(lo, hi);
    if (kind === 'fog') {
      // gone by mid-morning whatever time it formed
      const end = Math.min(start + dur, start + (FOG_GONE_BY - hourOfDay(start)));
      dur = Math.max(1.5, end - start);
    }
    this.segs.push({ kind, start, end: start + dur });
  }

  private extend(): void {
    const last = this.segs[this.segs.length - 1];
    const t = last.end;
    const h = hourOfDay(t);
    const calmBefore = last.kind === 'clear' || last.kind === 'partlyCloudy' || last.kind === 'lightRain' || last.kind === 'windy';
    // mist: a calm night can end in fog that forms before dawn
    if (calmBefore && h >= FOG_START_WINDOW[0] && h <= FOG_START_WINDOW[1] && this.rng.chance(0.4)) { this.push('fog', t); return; }
    // a chain segment that would end in the fog window gets a chance to continue into it; otherwise the usual table
    const table = NEXT[last.kind];
    const eve = smooth(11, 15, h) * (1 - smooth(21, 23.5, h)); // storms favour the afternoon and evening
    let total = 0;
    const w = table.map(([k, p]) => { const q = k === 'thunderstorm' ? p * (0.25 + 1.5 * eve) : p; total += q; return q; });
    let r = this.rng.next() * total;
    let pick = table[table.length - 1][0];
    for (let i = 0; i < table.length; i++) { r -= w[i]; if (r <= 0) { pick = table[i][0]; break; } }
    this.push(pick, t);
  }
}

// ---------------------------------------------------------------- blended targets

/** How long before a boundary each quantity starts moving toward the next kind (game hours): cloud builds before rain falls. */
export const LEAD_HOURS: Readonly<Record<keyof KindParams, number>> = {
  cloud: 1.0, gloom: 0.8, rain: 0.12, wind: 0.5, fog: 0.6, storm: 0.05, damp: 0.5,
};

const KEYS: ReadonlyArray<keyof KindParams> = ['cloud', 'gloom', 'rain', 'wind', 'fog', 'storm', 'damp'];

export function newKindParams(): KindParams {
  return { cloud: 0, gloom: 0, rain: 0, wind: 0, fog: 0, storm: 0, damp: 0 };
}

/**
 * Where the weather wants to be at an absolute game hour: the current kind, eased toward the next one as the boundary
 * nears (each quantity with its own lead time). Writes into `out`.
 */
export function targetsAt(f: Forecast, abs: number, out: KindParams = newKindParams()): KindParams {
  const { cur, next } = f.at(abs);
  const a = KIND_PARAMS[cur.kind];
  const b = KIND_PARAMS[next.kind];
  for (const k of KEYS) {
    const lead = LEAD_HOURS[k];
    const t = smooth(cur.end - lead, cur.end, abs);
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

/** Fog is densest before dawn and thins as the morning warms (hour of day): 1 until 7:00, 0.3 by 10:30. */
export function fogHourFactor(hour: number): number {
  const h = hourOfDay(hour);
  if (h >= 12) return 1; // evening mist keeps its full strength
  return 1 - 0.7 * smooth(7, 10.5, h);
}
