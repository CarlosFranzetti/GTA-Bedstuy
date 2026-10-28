import { Color } from 'three';

/** Tunable lighting/reflection numbers in one place (owned by the lighting agent; main.ts only reads). */
export const LIGHTING = {
  /** scene.environmentIntensity by day / night (SkyDome now drives it per hour from the time cycle; these are the fallbacks) */
  envIntensityDay: 0.2,
  envIntensityNight: 0.5,
  /** base exposure handed to the pipeline (the per-hour time-cycle exposure multiplies it) */
  exposure: 1.0,
  /** streetlight pool size by quality */
  lampPool: { low: 6, medium: 12, high: 12 },
  /** DayNight start hour */
  startHour: 17.5,
  /** Peak sun elevation sine (sin 60 deg). The sun path is elevation = asin(SUN_PEAK * sin(theta)). */
  sunPeak: 0.866,
  /** Fixed moon colour (about 7500 K). */
  moonColor: 0xe6ebff,
};

/**
 * One keyframe of the day. Every field is interpolated linearly between keys by game hour (wrapping at 24).
 * Values follow docs/reference/lighting-targets.md section 1 and were tuned against scripts/light-audit.mjs.
 */
export interface TimeCycleKey {
  hour: number;
  /** DirectionalLight intensity of the sun (0 whenever the sun is on or below the horizon). */
  sunI: number;
  sunColor: number;
  /** DirectionalLight intensity of the moon (0 by day); the same light is re-aimed at the moon at night. */
  moonI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  /** scene.environmentIntensity (only affects materials that have no own envMap). */
  env: number;
  /** Multiplier on the renderer exposure (RenderPipeline.setExposure base). */
  exposure: number;
  fogNear: number;
  fogFar: number;
  bloomThreshold: number;
  bloomStrength: number;
}

export const TIME_CYCLE: readonly TimeCycleKey[] = [
  { hour: 0, sunI: 0, sunColor: 0xff9b3d, moonI: 2.7, hemiSky: 0x5a72b4, hemiGround: 0x5a3c22, hemiI: 4.4, env: 1.9, exposure: 1.12, fogNear: 90, fogFar: 900, bloomThreshold: 0.9, bloomStrength: 0.5 },
  { hour: 3, sunI: 0, sunColor: 0xff9b3d, moonI: 2.7, hemiSky: 0x566eb0, hemiGround: 0x5a3c22, hemiI: 4.4, env: 1.9, exposure: 1.12, fogNear: 90, fogFar: 900, bloomThreshold: 0.9, bloomStrength: 0.5 },
  { hour: 5.5, sunI: 0, sunColor: 0xff9b3d, moonI: 2.7, hemiSky: 0x5a72b4, hemiGround: 0x5a3c22, hemiI: 4.4, env: 1.9, exposure: 1.14, fogNear: 80, fogFar: 900, bloomThreshold: 1.0, bloomStrength: 0.4 },
  { hour: 6, sunI: 0, sunColor: 0xff9b3d, moonI: 0, hemiSky: 0x9aa4c8, hemiGround: 0x5a4636, hemiI: 1.7, env: 0.55, exposure: 1.15, fogNear: 60, fogFar: 900, bloomThreshold: 1.4, bloomStrength: 0.2 },
  { hour: 7, sunI: 1.3, sunColor: 0xffbb81, moonI: 0, hemiSky: 0x9fc9e8, hemiGround: 0x6b5a4a, hemiI: 1.1, env: 0.4, exposure: 1.1, fogNear: 110, fogFar: 1300, bloomThreshold: 1.8, bloomStrength: 0.12 },
  { hour: 9, sunI: 2.4, sunColor: 0xffe0c7, moonI: 0, hemiSky: 0xa8d4f2, hemiGround: 0x7b7268, hemiI: 0.9, env: 0.25, exposure: 1.05, fogNear: 150, fogFar: 1600, bloomThreshold: 2.0, bloomStrength: 0.1 },
  { hour: 12, sunI: 3.0, sunColor: 0xffedde, moonI: 0, hemiSky: 0xb8dcf5, hemiGround: 0x7b7268, hemiI: 0.8, env: 0.22, exposure: 1.05, fogNear: 150, fogFar: 1800, bloomThreshold: 2.0, bloomStrength: 0.1 },
  { hour: 15, sunI: 2.8, sunColor: 0xffe4ce, moonI: 0, hemiSky: 0xb0d8f2, hemiGround: 0x7b7268, hemiI: 0.8, env: 0.22, exposure: 1.05, fogNear: 150, fogFar: 1700, bloomThreshold: 2.0, bloomStrength: 0.1 },
  { hour: 17, sunI: 2.4, sunColor: 0xffcea6, moonI: 0, hemiSky: 0xa9c0dc, hemiGround: 0x7b6a5a, hemiI: 1.0, env: 0.3, exposure: 1.05, fogNear: 110, fogFar: 1300, bloomThreshold: 1.8, bloomStrength: 0.12 },
  { hour: 18, sunI: 2.0, sunColor: 0xffae67, moonI: 0, hemiSky: 0x8fa4d0, hemiGround: 0x64533a, hemiI: 1.7, env: 0.45, exposure: 1.1, fogNear: 80, fogFar: 1000, bloomThreshold: 1.4, bloomStrength: 0.2 },
  { hour: 19, sunI: 0.9, sunColor: 0xff9b3d, moonI: 0, hemiSky: 0x6a7ab8, hemiGround: 0x5e4a38, hemiI: 2.5, env: 0.8, exposure: 1.15, fogNear: 70, fogFar: 900, bloomThreshold: 1.2, bloomStrength: 0.3 },
  { hour: 19.5, sunI: 0, sunColor: 0xff9b3d, moonI: 0, hemiSky: 0x5a6cb0, hemiGround: 0x5a4636, hemiI: 3.0, env: 1.1, exposure: 1.15, fogNear: 80, fogFar: 900, bloomThreshold: 1.0, bloomStrength: 0.4 },
  { hour: 20, sunI: 0, sunColor: 0xff9b3d, moonI: 2.7, hemiSky: 0x5a72b4, hemiGround: 0x5a3c22, hemiI: 4.4, env: 1.9, exposure: 1.14, fogNear: 90, fogFar: 900, bloomThreshold: 0.9, bloomStrength: 0.5 },
  { hour: 22, sunI: 0, sunColor: 0xff9b3d, moonI: 2.7, hemiSky: 0x566eb0, hemiGround: 0x5a3c22, hemiI: 4.4, env: 1.9, exposure: 1.12, fogNear: 100, fogFar: 900, bloomThreshold: 0.9, bloomStrength: 0.5 },
  { hour: 24, sunI: 0, sunColor: 0xff9b3d, moonI: 2.7, hemiSky: 0x5a72b4, hemiGround: 0x5a3c22, hemiI: 4.4, env: 1.9, exposure: 1.12, fogNear: 90, fogFar: 900, bloomThreshold: 0.9, bloomStrength: 0.5 },
];

export interface TimeCycle {
  sunI: number;
  sunColor: Color;
  moonI: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiI: number;
  env: number;
  exposure: number;
  fogNear: number;
  fogFar: number;
  bloomThreshold: number;
  bloomStrength: number;
}

const COLOR_KEYS = {
  sunColor: TIME_CYCLE.map((k) => new Color(k.sunColor)),
  hemiSky: TIME_CYCLE.map((k) => new Color(k.hemiSky)),
  hemiGround: TIME_CYCLE.map((k) => new Color(k.hemiGround)),
};

function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  const m = hour % 24;
  return m < 0 ? m + 24 : m;
}

export function newTimeCycle(): TimeCycle {
  return {
    sunI: 0, sunColor: new Color(), moonI: 0, hemiSky: new Color(), hemiGround: new Color(), hemiI: 0,
    env: 0, exposure: 1, fogNear: 100, fogFar: 900, bloomThreshold: 2, bloomStrength: 0.1,
  };
}

/** Interpolated time-cycle values for a game hour (wraps at 24). Pass `out` to avoid allocating. */
export function timeCycleAt(hour: number, out: TimeCycle = newTimeCycle()): TimeCycle {
  const h = wrapHour(hour);
  let i = 0;
  while (i < TIME_CYCLE.length - 2 && h >= TIME_CYCLE[i + 1].hour) i++;
  const a = TIME_CYCLE[i];
  const b = TIME_CYCLE[i + 1];
  const t = (h - a.hour) / (b.hour - a.hour);
  const l = (x: number, y: number): number => x + (y - x) * t;
  out.sunI = l(a.sunI, b.sunI);
  out.moonI = l(a.moonI, b.moonI);
  out.hemiI = l(a.hemiI, b.hemiI);
  out.env = l(a.env, b.env);
  out.exposure = l(a.exposure, b.exposure);
  out.fogNear = l(a.fogNear, b.fogNear);
  out.fogFar = l(a.fogFar, b.fogFar);
  out.bloomThreshold = l(a.bloomThreshold, b.bloomThreshold);
  out.bloomStrength = l(a.bloomStrength, b.bloomStrength);
  out.sunColor.copy(COLOR_KEYS.sunColor[i]).lerp(COLOR_KEYS.sunColor[i + 1], t);
  out.hemiSky.copy(COLOR_KEYS.hemiSky[i]).lerp(COLOR_KEYS.hemiSky[i + 1], t);
  out.hemiGround.copy(COLOR_KEYS.hemiGround[i]).lerp(COLOR_KEYS.hemiGround[i + 1], t);
  return out;
}
