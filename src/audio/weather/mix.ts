/**
 * Weather sound mix: pure numbers, no Web Audio. WeatherAudio.ts turns these targets into gain / filter ramps.
 * Everything here is continuous in its inputs (no thresholds that jump), so a ramp on the inputs is a ramp on the sound.
 */

/** What the audio needs to know each frame (Weather fills one preallocated object). */
export interface WeatherAudioState {
  /** rain intensity 0..1 */
  rain: number;
  /** wind strength 0..1 (slow) and the gust multiplier 0..1 (fast) */
  wind: number;
  gust: number;
  /** storm 0..1 */
  storm: number;
  inVehicle: boolean;
  indoors: boolean;
  /** under the elevated deck or an awning: rain drums on a roof above the listener */
  covered: boolean;
}

/** Duck-typed so Weather can be tested with a stub. */
export interface WeatherAudioSink {
  update(dt: number, s: WeatherAudioState): void;
  /** a thunder clap from a strike `distanceM` away reaches the listener now (Weather has already waited out the speed of sound) */
  thunder(distanceM: number, strength: number): void;
}

export function newWeatherAudioState(): WeatherAudioState {
  return { rain: 0, wind: 0, gust: 0.5, storm: 0, inVehicle: false, indoors: false, covered: false };
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * Master level of the whole weather bed on the ambience bus, as a gain. Tuned offline (scripts/weather-audio-render.mjs):
 * heavy rain in the open lands within a dB or two of the city bed (-42 LUFS on the ambience bus), light rain about 7 dB under it.
 */
export const RAIN_MASTER = 0.052;
export const WIND_MASTER = 0.24;
/** Thunder bus scale: a close clap punches about 13 dB above the heavy-rain bed, not 40. */
export const THUNDER_MASTER = 0.22;

export interface WeatherMix {
  /** gain of the three rain patter layers (light, steady, heavy roar) */
  light: number;
  steady: number;
  heavy: number;
  /** car roof drumming and the lower body of the rain on a roof overhead */
  roof: number;
  /** low-pass corner (Hz) the whole rain bed passes through: open air, inside a car, inside a room */
  rainCutoff: number;
  /** overall rain bed gain */
  rainGain: number;
  /** wind bed gain, its band-pass centre (Hz) and gust depth (0..1) */
  windGain: number;
  windHz: number;
  windGust: number;
  /** thunder bus gain (the one-shots themselves are scaled by strength) and its low-pass corner */
  thunderGain: number;
  thunderCutoff: number;
}

export function newWeatherMix(): WeatherMix {
  return { light: 0, steady: 0, heavy: 0, roof: 0, rainCutoff: 16000, rainGain: 0, windGain: 0, windHz: 300, windGust: 0, thunderGain: 1, thunderCutoff: 16000 };
}

/** Targets for the current weather. Continuous in every input. */
export function weatherMix(s: WeatherAudioState, out: WeatherMix = newWeatherMix()): WeatherMix {
  const rain = clamp01(s.rain);
  const wind = clamp01(s.wind);
  const present = smooth(0.0, 0.06, rain); // a drizzle fades in instead of switching on
  // three layers cross-fade with intensity: light pitter-patter, steady rain, heavy roar
  out.light = present * (1 - smooth(0.22, 0.6, rain));
  out.steady = present * smooth(0.1, 0.4, rain) * (1 - smooth(0.7, 1.0, rain) * 0.55);
  out.heavy = smooth(0.5, 0.95, rain);
  // loudness grows with the rain, a little under the city bed for a shower and level with it in a downpour
  const loud = 0.15 + 0.85 * Math.pow(rain, 1.3);
  const place = s.indoors ? 0.5 : s.inVehicle ? 0.8 : s.covered ? 1.05 : 1;
  out.rainGain = RAIN_MASTER * loud * present * place;
  out.rainCutoff = s.indoors ? 650 : s.inVehicle ? 1500 : s.covered ? 12000 : 16000;
  // a roof overhead: tin-drum patter. Strong in a car, present under the el deck, a murmur indoors
  out.roof = (s.inVehicle ? 0.95 : s.covered ? 0.55 : s.indoors ? 0.25 : 0) * present * (0.35 + 0.65 * rain);
  const windCar = s.inVehicle ? 0.5 : 1;
  const windRoom = s.indoors ? 0.2 : 1;
  out.windGain = WIND_MASTER * smooth(0.04, 0.5, wind) * (0.45 + 0.55 * wind) * windCar * windRoom;
  out.windHz = 220 + 520 * wind + 160 * clamp01(s.gust);
  out.windGust = 0.25 + 0.5 * wind;
  out.thunderGain = THUNDER_MASTER * (s.indoors ? 0.45 : s.inVehicle ? 0.7 : 1);
  out.thunderCutoff = s.indoors ? 500 : s.inVehicle ? 1800 : 16000;
  return out;
}

/** Thunder reaches the listener after the flash: 343 m/s, but never later than 14 s (the game's storms are close). */
export function thunderDelaySeconds(distanceM: number): number {
  const d = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  return Math.min(14, d / 343);
}

/** Thunder one-shot level 0..1 from its distance and the strike strength: loud and sharp when close, a low murmur far off. */
export function thunderLevel(distanceM: number, strength: number): number {
  const d = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  return clamp01(strength) * (0.25 + 0.75 * (1 - smooth(300, 4500, d)));
}
