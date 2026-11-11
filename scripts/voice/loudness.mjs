// ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks, 75 % overlap, -70 LUFS absolute and -10 LU relative
// gates) for mono Float32 samples at any sample rate. Clips shorter than one block are measured as a single block.
// Pure JS so the bake can measure thousands of short clips without spawning a process per clip.

function biquad(b, a) {
  let z1 = 0, z2 = 0;
  return (x) => { const y = b[0] * x + z1; z1 = b[1] * x - a[1] * y + z2; z2 = b[2] * x - a[2] * y; return y; };
}

export function kWeightFilters(fs) {
  // Stage 1: high shelf (+4 dB above ~1.7 kHz), stage 2: high-pass at 38 Hz (pyloudnorm formulation of BS.1770).
  const G = 3.999843853973347, f0 = 1681.974450955533, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const s1b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0];
  const s1a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  const f1 = 38.13547087602444, Q2 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q2 + K * K;
  const s2b = [1, -2, 1];
  const s2a = [1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0];
  return [biquad(s1b, s1a), biquad(s2b, s2a)];
}

export function integratedLufs(samples, fs) {
  const [h, p] = kWeightFilters(fs);
  const w = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) w[i] = p(h(samples[i]));
  const block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const energies = [];
  if (w.length < block) {
    if (w.length === 0) return -Infinity;
    let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * w[i];
    energies.push(s / w.length);
  } else {
    for (let st = 0; st + block <= w.length; st += hop) { let s = 0; for (let i = st; i < st + block; i++) s += w[i] * w[i]; energies.push(s / block); }
  }
  const lk = (z) => -0.691 + 10 * Math.log10(z);
  const abs = energies.filter((z) => z > 0 && lk(z) > -70);
  if (!abs.length) return -Infinity;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = lk(mean(abs)) - 10;
  const kept = abs.filter((z) => lk(z) > rel);
  return kept.length ? lk(mean(kept)) : -Infinity;
}

export function peakDb(samples) {
  let m = 0; for (let i = 0; i < samples.length; i++) { const v = Math.abs(samples[i]); if (v > m) m = v; }
  return m > 0 ? 20 * Math.log10(m) : -Infinity;
}

/** Trims leading and trailing silence (below `thresh`) down to `padSec` of margin. */
export function trimSilence(x, fs, padSec = 0.03, thresh = 0.004) {
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thresh) a++;
  while (b > a && Math.abs(x[b]) < thresh) b--;
  if (a >= b) return x.slice(0, Math.min(x.length, Math.round(0.05 * fs)));
  const pad = Math.round(padSec * fs);
  const out = new Float32Array(Math.min(x.length, b + 1 + pad) - Math.max(0, a - pad));
  const start = Math.max(0, a - pad);
  for (let i = 0; i < out.length; i++) out[i] = x[start + i];
  // leading margin shorter than padSec: left-pad with silence so every clip starts with exactly padSec
  const lead = a - start;
  if (lead < pad) { const o2 = new Float32Array(out.length + (pad - lead)); o2.set(out, pad - lead); return o2; }
  return out;
}

/** Soft limiter: linear below `knee`, saturating smoothly at `ceil`. */
export function softLimit(x, knee = 0.72, ceil = 0.79) {
  const range = ceil - knee;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > knee) x[i] = Math.sign(x[i]) * (knee + range * Math.tanh((v - knee) / range));
  }
  return x;
}

/** Scales to `target` LUFS with the limiter in the loop (a few passes), returns { samples, lufs, peak }. */
export function normalise(x, fs, target = -16, ceilDb = -2.0) {
  const ceil = 10 ** (ceilDb / 20);
  const base = Float32Array.from(x);
  const L0 = integratedLufs(base, fs);
  if (!Number.isFinite(L0)) return { samples: base, lufs: L0, peak: peakDb(base) };
  let gain = 10 ** ((target - L0) / 20);
  let out = base;
  for (let pass = 0; pass < 4; pass++) {
    out = Float32Array.from(base, (v) => v * gain);
    softLimit(out, ceil * 0.9, ceil);
    const L = integratedLufs(out, fs);
    const err = target - L;
    if (Math.abs(err) < 0.15) break;
    gain *= 10 ** (err / 20);
  }
  // 3 ms fades remove edge clicks
  const f = Math.max(1, Math.round(0.003 * fs));
  for (let i = 0; i < f && i < out.length; i++) { const g = i / f; out[i] *= g; out[out.length - 1 - i] *= g; }
  return { samples: out, lufs: integratedLufs(out, fs), peak: peakDb(out) };
}
