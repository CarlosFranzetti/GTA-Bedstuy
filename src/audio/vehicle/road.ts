/**
 * Tyre and road sound as pure maths (SFX2): squeal that follows slip, speed-dependent wind, the hiss of tyres on a wet road,
 * kerb thumps scaled by the hit. vehicle/VehicleAudio.ts turns these into node automation; nothing here touches Web Audio.
 */
import type { Surface } from './fx';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: number) => (Number.isFinite(v) ? v : 0);

/** Surfaces on which a tyre screams; gravel and grass throw dirt instead of singing. */
const SINGS: Partial<Record<Surface | 'wet', number>> = { asphalt: 1, concrete: 0.9, wet: 0.6, puddle: 0.4, cobble: 0.5, metal: 0.8, wood: 0.5 };

export interface Squeal {
  /** 0..1 level of the tonal scream */
  level: number;
  /** centre frequency (Hz) of the scream; it rises with speed and wavers with the slip */
  hz: number;
  /** 0..1 level of the dirt / scrub noise under it (always some when sliding on loose ground) */
  scrub: number;
}

/**
 * Squeal for a slip 0..1 and a speed in m/s. Nothing below a slip of 0.18 or a crawl; the level climbs steeply with slip (a
 * gentle corner is silent, a drift screams) and fades again below 3 m/s as the car stops sliding. Wet road softens it.
 */
export function tyreSqueal(slip: number, speed: number, surface: Surface | 'wet', t = 0): Squeal {
  const s = clamp((fin(slip) - 0.18) / 0.82, 0, 1);
  const v = clamp((Math.abs(fin(speed)) - 1.5) / 4.5, 0, 1);
  const sing = SINGS[surface] ?? 0;
  const loose = surface === 'gravel' || surface === 'grass';
  return {
    level: s ** 1.4 * v * sing,
    hz: 1450 + 1200 * clamp(Math.abs(fin(speed)) / 30, 0, 1) + 260 * s + 60 * Math.sin(t * 23) * s,
    scrub: loose ? s * v * 0.9 : s * v * 0.25,
  };
}

/** Cabin wind: level 0..1 and the lowpass edge (Hz); it grows with the square of speed, so highway speed is mostly air. `quiet` is the voice's road factor. */
export function windBed(speed: number, quiet = 1): { level: number; hz: number } {
  const x = clamp(Math.abs(fin(speed)) / 40, 0, 1.2);
  return { level: x * x * clamp(quiet, 0.5, 2.5), hz: 380 + 1500 * x };
}

/** Wet-road hiss (tyres lifting a film of water): 0..1 level and band centre, from ground wetness 0..1, rain 0..1 and speed. */
export function wetRoadHiss(wetness: number, rain: number, speed: number): { level: number; hz: number } {
  const w = clamp(Math.max(fin(wetness), fin(rain)), 0, 1);
  const s = clamp(Math.abs(fin(speed)) / 22, 0, 1);
  return { level: w * (0.15 + 0.85 * s) * clamp(s * 4, 0, 1), hz: 2600 + 3200 * s };
}

/** Level of the kerb / pothole thump (0..1) from the vertical hit speed of the body in m/s; below 0.6 m/s nothing is heard. */
export const kerbStrength = (hit: number): number => clamp((Math.abs(fin(hit)) - 0.6) / 4, 0, 1);

/** Doppler ratio for pass-bys, from the closing speed in m/s (positive = approaching), clamped to a believable range. */
export const passbyPitch = (closing: number): number => clamp(343 / (343 - clamp(fin(closing), -45, 45)), 0.9, 1.1);
