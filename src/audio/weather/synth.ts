/**
 * Weather sound buffers, synthesised in plain JS (no audio files). Pure functions of (sample rate, seed): the game builds them
 * once into AudioBuffers, tests and the offline render read the same arrays.
 */
import { Rng } from '@/core/Rng';

export type RainLayer = 'light' | 'steady' | 'heavy';

function normalise(x: Float32Array, rms: number): void {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const g = rms / Math.sqrt(s / x.length + 1e-12);
  for (let i = 0; i < x.length; i++) x[i] *= g;
}

/** Folds the tail of a rendered loop into its head with an equal-power fade, so the buffer repeats without a click. */
function makeLoop(x: Float32Array, fade: number): Float32Array {
  const n = x.length - fade;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i];
  for (let i = 0; i < fade; i++) {
    const t = (i + 0.5) / fade;
    out[i] = out[i] * Math.sin(t * Math.PI / 2) + x[n + i] * Math.cos(t * Math.PI / 2);
  }
  return out;
}

/** One rain drop: a short burst of high-passed noise with a fast decay, written at `at`. */
function drop(x: Float32Array, at: number, amp: number, tau: number, rng: Rng, bright: number): void {
  const len = Math.min(x.length - at, Math.floor(tau * 6));
  let prev = 0;
  for (let k = 0; k < len; k++) {
    const n = rng.next() * 2 - 1;
    // first-difference high-pass: more of it = brighter drop
    const v = n - prev * bright;
    prev = n;
    x[at + k] += v * amp * Math.exp(-k / tau);
  }
}

/** 4 s seamless rain bed at RMS 0.1: light = sparse bright pitter-patter, steady = dense patter, heavy = a broad roar with big drops. */
export function rainLayer(kind: RainLayer, sr: number, seed = 1): Float32Array {
  const secs = 4;
  const fade = Math.floor(sr * 0.4);
  const n = Math.floor(sr * secs) + fade;
  const rng = new Rng(`rain:${kind}:${seed}`);
  const x = new Float32Array(n);
  const density = kind === 'light' ? 70 : kind === 'steady' ? 650 : 2600;
  const tau = (kind === 'light' ? 0.0011 : kind === 'steady' ? 0.0007 : 0.0005) * sr;
  const bright = kind === 'light' ? 0.95 : kind === 'steady' ? 0.8 : 0.55;
  const drops = Math.floor(density * (n / sr));
  for (let i = 0; i < drops; i++) {
    const amp = 0.15 + rng.next() ** 3 * (kind === 'light' ? 1.6 : 0.9); // a few big drops over many small ones
    drop(x, Math.floor(rng.next() * n), amp, tau * (0.6 + 0.9 * rng.next()), rng, bright);
  }
  if (kind !== 'light') {
    // continuous hiss under the patter: white noise through a one-pole low-pass (corner about 5 kHz for the roar)
    const a = Math.exp(-2 * Math.PI * (kind === 'heavy' ? 4500 : 7000) / sr);
    let y = 0;
    const floor = kind === 'heavy' ? 0.5 : 0.18;
    for (let i = 0; i < n; i++) { y = a * y + (1 - a) * (rng.next() * 2 - 1); x[i] += y * floor * 4; }
  }
  const out = makeLoop(x, fade);
  normalise(out, 0.1);
  return out;
}

/** Rain on a roof: tin-drum patter, each drop a short resonant burst between 150 and 420 Hz. RMS 0.1, 4 s loop. */
export function roofLayer(sr: number, seed = 1): Float32Array {
  const fade = Math.floor(sr * 0.4);
  const n = Math.floor(sr * 4) + fade;
  const rng = new Rng(`roof:${seed}`);
  const x = new Float32Array(n);
  const drops = Math.floor(190 * (n / sr));
  for (let i = 0; i < drops; i++) {
    const at = Math.floor(rng.next() * n);
    const f = 150 + 270 * rng.next();
    const amp = 0.2 + rng.next() ** 2 * 1.1;
    const tau = (0.012 + 0.02 * rng.next()) * sr;
    const len = Math.min(n - at, Math.floor(tau * 5));
    const w = (2 * Math.PI * f) / sr;
    for (let k = 0; k < len; k++) x[at + k] += Math.sin(w * k) * amp * Math.exp(-k / tau) * (k < 40 ? k / 40 : 1);
  }
  // a faint hiss riding on it
  let y = 0;
  for (let i = 0; i < n; i++) { y = 0.8 * y + 0.2 * (rng.next() * 2 - 1); x[i] += y * 0.25; }
  const out = makeLoop(x, fade);
  normalise(out, 0.1);
  return out;
}

/** Wind bed: brown-ish noise (the low roar) with a little of the middle, 6 s seamless loop at RMS 0.1. */
export function windLayer(sr: number, seed = 1): Float32Array {
  const fade = Math.floor(sr * 0.6);
  const n = Math.floor(sr * 6) + fade;
  const rng = new Rng(`wind:${seed}`);
  const x = new Float32Array(n);
  let b = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    b = 0.985 * b + 0.015 * w; // brown
    m = 0.9 * m + 0.1 * w;
    x[i] = b * 6 + m * 0.7;
  }
  const out = makeLoop(x, fade);
  normalise(out, 0.1);
  return out;
}

export type ThunderKind = 'close' | 'far';

/**
 * One thunder clap, peak 0.9. Close: a sharp crack (white noise, 30 ms decay) leading a long low roll that grumbles on for
 * several seconds. Far: only the roll, slower in and lower. Mono, no loop.
 */
export function thunderClap(kind: ThunderKind, sr: number, seed = 1): Float32Array {
  const close = kind === 'close';
  const secs = close ? 6.5 : 7.5;
  const n = Math.floor(sr * secs);
  const rng = new Rng(`thunder:${kind}:${seed}`);
  const x = new Float32Array(n);
  // the roll: low-passed noise under a few overlapping swells
  const a1 = Math.exp(-2 * Math.PI * (close ? 260 : 130) / sr);
  const a2 = Math.exp(-2 * Math.PI * (close ? 90 : 55) / sr);
  let y1 = 0, y2 = 0;
  const bumps: { at: number; rise: number; fall: number; amp: number }[] = [];
  const nb = close ? 5 : 4;
  for (let i = 0; i < nb; i++) {
    bumps.push({ at: (close ? 0.05 : 0.5) + i * (0.5 + 0.7 * rng.next()) + rng.next() * 0.4, rise: close ? 0.08 + 0.2 * rng.next() : 0.5 + 0.5 * rng.next(), fall: 0.9 + 1.4 * rng.next(), amp: (i === 0 ? 1 : 0.8 - i * 0.12) * (0.7 + 0.3 * rng.next()) });
  }
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = rng.next() * 2 - 1;
    y1 = a1 * y1 + (1 - a1) * w;
    y2 = a2 * y2 + (1 - a2) * w;
    let env = 0;
    for (const b of bumps) {
      const dt = t - b.at;
      if (dt < 0) continue;
      env += b.amp * (dt < b.rise ? (dt / b.rise) ** 2 : Math.exp(-(dt - b.rise) / b.fall));
    }
    const tail = Math.exp(-t / (close ? 2.6 : 3.4));
    x[i] = (y1 * 5 + y2 * 12) * env * tail;
  }
  if (close) {
    // the crack: a fast burst of noise that rings off in 30 ms, with a second smaller snap
    for (let k = 0; k < Math.floor(sr * 0.25); k++) {
      const t = k / sr;
      x[k] += (rng.next() * 2 - 1) * (Math.exp(-t / 0.03) + 0.45 * (t > 0.09 ? Math.exp(-(t - 0.09) / 0.04) : 0)) * 2.4;
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  const g = 0.9 / (peak + 1e-9);
  // a gentle fade-in so even the roll starts without a click
  for (let i = 0; i < n; i++) x[i] *= g * (i < 64 ? i / 64 : 1);
  return x;
}
