/** Pure synthesis helpers. No Web Audio here, so these are unit-testable. */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/**
 * Engine fundamental in Hz. Idles at 55 Hz, climbs with speed (m/s, full band by ~35 m/s)
 * and gets a further lift from throttle (0..1). Capped at 220 Hz.
 */
export function engineFrequency(speed: number, throttle: number): number {
  const s = clamp(finite(speed), 0, 35) / 35;
  const t = clamp(finite(throttle), 0, 1);
  return 55 + s * 110 + t * 55;
}

/** Two detuned horn tones in Hz. */
export function hornFrequencies(): [number, number] {
  return [400, 500];
}

/** Impact loudness 0..1, saturating at 15 m/s of relative closing speed. */
export function impactGain(strength: number): number {
  return clamp(finite(strength) / 15, 0, 1);
}

/**
 * Pink-ish noise (Paul Kellet's economy filter over white noise), roughly zero-mean, in [-1, 1].
 * `random` must return values in [0, 1).
 */
export function pinkNoise(length: number, random: () => number): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    out[i] = clamp((b0 + b1 + b2 + white * 0.1848) * 0.11, -1, 1);
  }
  return out;
}

/** Speeds (m/s) at which the simulated gearbox goes up a gear: gear 1 below 8, gear 5 above 30. */
export const GEAR_SPEEDS = [8, 15, 23, 30] as const;

/** 1-based gear for a speed in m/s. */
export function gearForSpeed(speed: number): number {
  const s = Math.abs(finite(speed));
  let g = 1;
  for (const t of GEAR_SPEEDS) if (s >= t) g++;
  return g;
}

/** Multiplier applied to the engine pitch right after a shift: upshifts drop the revs, downshifts blip them. */
export function gearShiftFactor(from: number, to: number): number {
  if (to > from) return 0.82;
  if (to < from) return 1.12;
  return 1;
}

/** Tyre squeal level 0..1: needs slip and some speed so a stationary handbrake stays quiet. */
export function squealLevel(slip: number, speed: number): number {
  const sp = clamp((Math.abs(finite(speed)) - 2) / 4, 0, 1);
  return clamp(finite(slip), 0, 1) * sp;
}
