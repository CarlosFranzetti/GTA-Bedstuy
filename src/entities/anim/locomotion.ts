/**
 * Speed-driven blending of the locomotion cycles. All cycles start at the same event (the left foot passing the right going
 * forward), so one shared phase can drive them and neighbours blend without the feet crossing over.
 */
import { NCH, RIG_CH, sampleClip, type Clip } from './clipPack';
import { ballRel, type LegDims } from './footlock';
import * as THREE from 'three';

export interface Blend {
  /** index of the lower and upper clip in the chain, and the weight of the upper one */
  lo: number;
  hi: number;
  t: number;
}

/** smoothstep */
export const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Weight of the standing idle against the walking chain. */
export function idleWeight(speed: number): number { return 1 - smooth(0.12, 0.65, speed); }

/** Which two cycles to mix for a ground speed. `chain` is ordered by natural speed. Below the first and above the last only one plays. */
export function chainBlend(speed: number, chain: ReadonlyArray<{ speed: number }>): Blend {
  const n = chain.length;
  if (n === 1 || speed <= chain[0].speed) return { lo: 0, hi: 0, t: 0 };
  if (speed >= chain[n - 1].speed) return { lo: n - 1, hi: n - 1, t: 0 };
  let i = 0;
  while (speed > chain[i + 1].speed) i++;
  const a = chain[i].speed, b = chain[i + 1].speed;
  return { lo: i, hi: i + 1, t: smooth(0, 1, (speed - a) / (b - a)) };
}

/** How fast to run a cycle relative to its capture so the feet keep up with the ground: speed over natural speed, held to a sane range. */
export function rateFor(speed: number, clip: { speed: number }): number {
  return Math.min(1.5, Math.max(0.55, speed / Math.max(0.2, clip.speed)));
}

/** Cycles per second of the blended chain (each clip at its own rate, weighted), times the person's cadence. */
export function cycleFrequency(speed: number, chain: ReadonlyArray<Clip>, b: Blend, cadence = 1): number {
  const f = (c: Clip): number => rateFor(speed, c) / c.duration;
  return ((1 - b.t) * f(chain[b.lo]) + b.t * f(chain[b.hi])) * cadence;
}

/**
 * Where in a jump clip to sample: the crouch is squeezed into the take-off, the clip's flight spread over the real airtime
 * (so the legs extend as the character comes down), and the landing absorb into the recovery. `marks` = [leave, land] as clip fractions.
 */
export function jumpTime(clip: { duration: number; marks: number[] }, phase: 'takeoff' | 'air' | 'land', t: number, takeoff: number, airtime: number, land: number): number {
  const leave = clip.marks[0] ?? 0.4, down = clip.marks[1] ?? 0.7;
  const u = phase === 'takeoff' ? Math.min(1, t / takeoff) * leave
    : phase === 'air' ? leave + Math.min(1, t / Math.max(0.05, airtime)) * (down - leave)
      : down + Math.min(1, t / land) * (1 - down);
  return u * clip.duration;
}


/**
 * GAIT: stride-matched playback. A captured cycle played at a steady rate lets its planted foot travel back at a speed that is not constant through the stance
 * (the run take's right foot goes back at 2.7 m/s while its left goes at 3.7), so at one rate the shoe skates by the difference. `strideTable` measures, for
 * a clip, how far the planted foot's ball travels back per unit of cycle at each phase (metres per cycle, in the clip's own proportions); the controller then
 * advances the shared phase at ground speed over that, so at every instant stride length times cadence is the ground speed.
 */
export const STRIDE_N = 96;
const REF_DIMS: LegDims = (() => {
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  return { hip: [V(0.09, 0.82, 0), V(-0.09, 0.82, 0)], knee: [V(0, -0.4, 0), V(0, -0.4, 0)], ankle: [V(0, -0.345, 0), V(0, -0.345, 0)], hasAnkle: true };
})();
const tables = new WeakMap<Clip, Float32Array>();
/** one lookup per clip per frame: the table and its mean */
const packs = new WeakMap<Clip, { t: Float32Array; mean: number }>();
function packOf(c: Clip): { t: Float32Array; mean: number } { let k = packs.get(c); if (!k) { const t = strideTable(c); let m = 0; for (const v of t) m += v; k = { t, mean: m / t.length }; packs.set(c, k); } return k; }

/** metres of back travel of the planted foot per cycle, at STRIDE_N phases of `clip`; flight stretches take the average, the result is smoothed and kept within 0.6 to 1.5 times the mean. */
export function strideTable(clip: Clip): Float32Array {
  const hit = tables.get(clip);
  if (hit) return hit;
  const N = STRIDE_N, pose = new Float32Array(NCH), b = [0, 0, 0];
  const z = [new Float32Array(N), new Float32Array(N)], y = [new Float32Array(N), new Float32Array(N)];
  for (let i = 0; i < N; i++) {
    sampleClip(clip, (i / N) * clip.duration, pose);
    for (let s = 0; s < 2; s++) { ballRel(pose, REF_DIMS, s as 0 | 1, b); z[s][i] = b[2] + pose[RIG_CH + 2]; y[s][i] = b[1] + pose[RIG_CH + 1]; }
  }
  const ymin = [Math.min(...y[0]), Math.min(...y[1])];
  const raw = new Float32Array(N), ok = new Uint8Array(N);
  let sum = 0, cnt = 0;
  for (let i = 0; i < N; i++) {
    let acc = 0, n = 0;
    for (let s = 0; s < 2; s++) {
      if (y[s][i] > ymin[s] + 0.04) continue;                        // this foot is in the air
      acc += (z[s][(i + 1) % N] - z[s][(i + N - 1) % N]) * (N / 2); n++; // metres per cycle, back is positive
    }
    if (n > 0) { raw[i] = acc / n; ok[i] = 1; sum += raw[i]; cnt++; }
  }
  const mean = cnt ? sum / cnt : Math.max(0.5, clip.speed * clip.duration);
  for (let i = 0; i < N; i++) if (!ok[i]) raw[i] = mean;
  const out = new Float32Array(N);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) out[i] = (raw[(i + N - 1) % N] + 2 * raw[i] + raw[(i + 1) % N]) * 0.25;
    raw.set(out);
  }
  for (let i = 0; i < N; i++) out[i] = Math.min(1.5 * mean, Math.max(0.6 * mean, raw[i]));
  tables.set(clip, out);
  return out;
}

/** table value at a phase 0..1 (linear, wrapping) */
export function tableAt(t: Float32Array, phase: number): number {
  const x = (((phase % 1) + 1) % 1) * t.length, i = Math.floor(x), u = x - i;
  return t[i % t.length] * (1 - u) + t[(i + 1) % t.length] * u;
}

/**
 * Cycles per second so the planted foot keeps pace with the ground, at this phase of the blended chain. `stride` is the multiplier the person's
 * leg swing carries (controller.applyGait). The result is held to within 0.7 and 1.45 of the plain average rate, so the cycle never stalls or rushes.
 */
export function matchedFrequency(speed: number, chain: ReadonlyArray<Clip>, b: Blend, phase: number, stride: number): number {
  const A = packOf(chain[b.lo]);
  let l = tableAt(A.t, phase), mean = A.mean;
  if (b.hi !== b.lo) { const B = packOf(chain[b.hi]); l = l * (1 - b.t) + tableAt(B.t, phase) * b.t; mean = mean * (1 - b.t) + B.mean * b.t; }
  const f = speed / Math.max(0.2, l * stride), fm = speed / Math.max(0.2, mean * stride);
  return Math.min(1.45 * fm, Math.max(0.7 * fm, f));
}
