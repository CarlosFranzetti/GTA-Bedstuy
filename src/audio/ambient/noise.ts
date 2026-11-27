/**
 * Seamless noise loops for the environment beds (AMBIENT, 27 Nov 2026).
 *
 * A looped noise buffer whose last sample does not meet its first one clicks once per loop. The old city hum (2 s of pink
 * noise) and the shared white-noise buffer (1 s) did exactly that: a soft tick every second or two under everything quiet.
 * These builders render `fade` extra samples and fold the tail into the head with an equal-power fade (the two stretches are
 * independent noise, so equal power keeps the level flat), so the loop point is as smooth as any other point of the noise.
 * Loops are several seconds long so the repeat is not heard as a pattern.
 */
import { pinkNoise } from '../synth';

/** Seconds of the shared white-noise buffer (it was 1). Every looped noise source in the vehicle layer reads it. */
export const NOISE_LOOP_SECONDS = 6;
/** Seconds of the city hum loop (it was 2). */
export const HUM_LOOP_SECONDS = 8;
/** Crossfade length at the loop point, seconds. */
export const LOOP_FADE_SECONDS = 0.35;

/** Folds the last `fade` samples of `x` into its first `fade`; the result is `fade` samples shorter and loops without a step. */
export function foldLoop(x: Float32Array, fade: number): Float32Array {
  const n = x.length - fade;
  if (!(fade > 0) || n <= fade) return x;
  const out = x.slice(0, n);
  for (let i = 0; i < fade; i++) {
    const t = (i + 0.5) / fade;
    out[i] = x[i] * Math.sin(t * Math.PI / 2) + x[n + i] * Math.cos(t * Math.PI / 2);
  }
  return out;
}

/** White noise in [-1, 1] that loops without a click: `seconds` long at `sr`. `random` returns [0, 1). */
export function seamlessWhite(seconds: number, sr: number, random: () => number): Float32Array {
  const fade = Math.floor(sr * LOOP_FADE_SECONDS);
  const total = Math.floor(sr * seconds) + fade;
  const x = new Float32Array(total);
  for (let i = 0; i < total; i++) x[i] = random() * 2 - 1;
  return foldLoop(x, fade);
}

/** Pink-ish noise that loops without a click: `seconds` long at `sr`. */
export function seamlessPink(seconds: number, sr: number, random: () => number): Float32Array {
  const fade = Math.floor(sr * LOOP_FADE_SECONDS);
  const total = Math.floor(sr * seconds) + fade;
  return foldLoop(pinkNoise(total, random), fade);
}

/** The 2 s pink loop and 1 s white loop as they were before this change (no crossfade). Kept for the before/after measurements only. */
export function legacyPink(seconds: number, sr: number, random: () => number): Float32Array { return pinkNoise(Math.floor(sr * seconds), random); }
export function legacyWhite(seconds: number, sr: number, random: () => number): Float32Array {
  const x = new Float32Array(Math.floor(sr * seconds));
  for (let i = 0; i < x.length; i++) x[i] = random() * 2 - 1;
  return x;
}

/**
 * Seam quality of a looping buffer: the step across the loop point (last sample to first) against the loudest ordinary step
 * inside the buffer. A ratio near 1 or below is invisible; a white-noise loop with no crossfade scores about 1 too (white noise
 * is all steps), so also look at `seamZ`, the step in units of the typical step (rms of the first difference).
 */
export function seamStats(x: ArrayLike<number>): { seamStep: number; rmsStep: number; maxStep: number; seamZ: number } {
  const n = x.length;
  let q = 0, mx = 0;
  for (let i = 1; i < n; i++) { const d = Math.abs(x[i] - x[i - 1]); q += d * d; if (d > mx) mx = d; }
  const rms = Math.sqrt(q / Math.max(1, n - 1));
  const seam = Math.abs(x[0] - x[n - 1]);
  return { seamStep: seam, rmsStep: rms, maxStep: mx, seamZ: seam / Math.max(rms, 1e-12) };
}

/** A start offset (seconds) into a loop of `duration`, from a [0, 1) draw, so layers sharing a buffer are not phase locked. */
export function loopOffset(duration: number, draw: number): number { return Math.max(0, Math.min(duration * 0.999, duration * draw)); }
