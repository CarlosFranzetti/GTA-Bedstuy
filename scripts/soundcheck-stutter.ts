// SOUNDCHECK: offline reproductions of suspected stutter / crackle causes in the vehicle sound path and the master chain.
// Each experiment renders a short passage with the REAL classes and reports the largest sample-to-sample step and a click
// score (the loudest 1.5 ms block of the first difference over the median block of the reference stretch).
// Bundled by scripts/soundcheck-render.mjs (mode `stutter`).
import { EngineNodes, TrafficEngines, playHorn, CheapVoice } from '@/audio/vehicle/nodes';
import { ENGINE_VOICES, EngineSim } from '@/audio/vehicle/engineModel';
import { HORNS } from '@/audio/vehicle/hornModel';
import { VehicleAudio } from '@/audio/vehicle/VehicleAudio';

const SR = 44100;
const STEP = 768;
const DT = STEP / SR;
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function noiseBuf(ctx: BaseAudioContext) { const b = ctx.createBuffer(1, SR, SR), d = b.getChannelData(0), r = lcg(7); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; return b; }

/** Click metrics of x over [t0, t1] against a quiet reference stretch [r0, r1]. */
function metrics(x: Float32Array, t0: number, t1: number, r0: number, r1: number) {
  const a = Math.floor(t0 * SR), b = Math.min(x.length - 1, Math.floor(t1 * SR));
  let maxStep = 0, at = 0;
  for (let i = Math.max(1, a); i <= b; i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > maxStep) { maxStep = d; at = i; } }
  let refStep = 0;
  for (let i = Math.max(1, Math.floor(r0 * SR)); i <= Math.floor(r1 * SR); i++) refStep = Math.max(refStep, Math.abs(x[i] - x[i - 1]));
  const blk = 66; // 1.5 ms
  const blocks = (s: number, e: number) => { const o: number[] = []; for (let i = Math.floor(s * SR); i + blk < Math.floor(e * SR); i += blk) { let q = 0; for (let j = 1; j < blk; j++) { const d = x[i + j] - x[i + j - 1]; q += d * d; } o.push(Math.sqrt(q / blk)); } return o; };
  const ref = blocks(r0, r1).sort((p, q) => p - q), med = ref[Math.floor(ref.length / 2)] || 1e-9;
  const ev = blocks(t0, t1);
  const score = Math.max(...ev) / med;
  return { maxStep: +maxStep.toExponential(2), refMaxStep: +refStep.toExponential(2), stepRatio: +(maxStep / Math.max(refStep, 1e-12)).toFixed(1), clickScore: +score.toFixed(1), atSec: +(at / SR).toFixed(4) };
}

async function stepped(ctx: OfflineAudioContext, secs: number, tick: (k: number, t: number) => void): Promise<Float32Array> {
  const steps = Math.ceil(secs * SR / STEP);
  let k = 0;
  await new Promise<void>((resolve) => {
    const next = () => { if (k >= steps) { resolve(); return; } tick(k, k * DT); k++; if (k < steps) ctx.suspend(k * DT).then(() => { next(); ctx.resume(); }); else resolve(); };
    ctx.suspend(DT).then(() => { next(); ctx.resume(); }); tick(0, 0); k = 1;
  });
  return (await ctx.startRendering()).getChannelData(0);
}

/** 1. A traffic voice slot is stolen by a closer car (the old car leaves the 70 m range at the same moment). */
async function voiceSteal() {
  const ctx = new OfflineAudioContext(1, SR * 4, SR);
  const out = ctx.createGain(); out.gain.value = 8; out.connect(ctx.destination); // gain only to read the small signal; metrics are ratios
  const te = new TrafficEngines(ctx, out, 1, 70, lcg(1));
  const mk = (id: string, x: number, type: string) => ({ id, type, x, z: 3, vx: 10, vz: 0, speed: 10, throttle: 0.4 });
  const x = await stepped(ctx, 4, (_k, t) => {
    const cars = t < 2 ? [mk('A', 12, 'sedan')] : [mk('A', 90, 'sedan'), mk('B', 9, 'pickup')];
    te.update(DT, { x: 0, z: 0, rx: 1, rz: 0 }, cars, t);
  });
  return { name: 'traffic voice stolen', ...metrics(x, 1.95, 2.6, 1.0, 1.8) };
}

/** 2. Siren released while its on/off gate is in a gap (whoop, hi-lo): the release writes the full level at once. */
async function sirenRelease(mode: 'whoop' | 'hilo' | 'parody') {
  const res: Record<string, unknown> = {};
  let worst: ReturnType<typeof metrics> | null = null;
  for (const rel of [1.03, 1.09, 1.15, 1.21, 1.27, 1.33]) {
    const ctx = new OfflineAudioContext(1, SR * 3, SR);
    const h = playHorn(ctx, ctx.destination, HORNS.cop, 0.2, { mode });
    h.release(rel);
    const x = (await ctx.startRendering()).getChannelData(0);
    const m = metrics(x, rel - 0.02, rel + 0.15, 0.6, 0.9);
    if (!worst || m.maxStep > worst.maxStep) worst = m;
  }
  Object.assign(res, { name: `siren ${mode} released in a gap (worst of 6 times)`, ...worst });
  return res;
}

/** 3. The player gets out of one car and into another: the old engine plays out its shutdown, then is disposed. */
async function engineSwap() {
  const ctx = new OfflineAudioContext(1, SR * 8, SR);
  const va = new VehicleAudio(lcg(5));
  (va as any).attach(ctx, ctx.destination, noiseBuf(ctx), ctx.destination);
  let speed = 0, swapped = false;
  const x = await stepped(ctx, 8, (k, t) => {
    if (k === 0) va.setType('sedan');
    if (t >= 3 && !swapped) { swapped = true; va.setType('bus'); }
    speed = Math.min(14, speed + 0.1);
    va.setDrive(speed, 0.4, true);
    va.update(DT);
  });
  return { name: 'player swaps cars', ...metrics(x, 2.9, 6.5, 1.0, 2.5) };
}

/** 4. Gear change while pulling away: the old dip was 7 to 9.5 dB; reported here as the largest dip (dB) of the 50 ms level over the preceding 0.5 s. */
async function gearDip(type: string) {
  const ctx = new OfflineAudioContext(1, SR * 14, SR);
  const v = ENGINE_VOICES[type as keyof typeof ENGINE_VOICES];
  const eng = new EngineNodes(ctx, v, noiseBuf(ctx), ctx.destination, 0);
  const sim = new EngineSim(v, lcg(11)); sim.startNow();
  let speed = 0;
  const shifts: number[] = [];
  let lastGear = 1;
  const x = await stepped(ctx, 14, (_k, t) => {
    speed = Math.min(v.vmax * 0.9, speed + (v.vmax / 9) * DT * (1 - speed / (v.vmax * 1.05)));
    const f = sim.update(DT, speed, 1);
    if (f.gear !== lastGear) { shifts.push(t); lastGear = f.gear; }
    eng.apply(f, t, speed, false);
  });
  const hop = 441, L: number[] = [];
  for (let s = 0; s + 2205 <= x.length; s += hop) { let e = 0; for (let i = 0; i < 2205; i++) e += x[s + i] ** 2; L.push(10 * Math.log10(e / 2205 + 1e-12)); }
  let worst = 0;
  for (const ts of shifts) { const i = Math.floor(ts * SR / hop); let ref = -200; for (let j = Math.max(0, i - 5); j < i; j++) ref = Math.max(ref, L[j]); let lo = 200; for (let j = i; j < Math.min(L.length, i + 30); j++) lo = Math.min(lo, L[j]); worst = Math.max(worst, ref - lo); }
  return { name: `gear dip ${type}`, shifts: shifts.length, worstDipDb: +worst.toFixed(1) };
}

/** 5. A hard cut: a source stopped at a non-zero sample (speech cancelled mid-phrase, the old behaviour) against the same source faded for 25 ms. */
async function hardCut() {
  const run = async (fade: boolean) => {
    const ctx = new OfflineAudioContext(1, SR * 2, SR);
    const b = ctx.createBuffer(1, SR * 2, SR), d = b.getChannelData(0), r = lcg(9);
    let ph = 0; for (let i = 0; i < d.length; i++) { ph += 2 * Math.PI * (140 + 30 * Math.sin(i / SR * 3)) / SR; d[i] = 0.2 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph)) * (0.8 + 0.2 * Math.sin(i / SR * 9)) + 0.005 * (r() - 0.5); }
    const src = ctx.createBufferSource(); src.buffer = b;
    const gate = ctx.createGain(); src.connect(gate); gate.connect(ctx.destination); src.start(0);
    if (fade) { gate.gain.setValueAtTime(1, 1.0); gate.gain.linearRampToValueAtTime(0, 1.025); src.stop(1.03); } else src.stop(1.0 + 0.0037);
    return metrics((await ctx.startRendering()).getChannelData(0), 0.99, 1.1, 0.3, 0.9);
  };
  return [{ name: 'speech cancelled mid-phrase, hard stop (old)', ...(await run(false)) }, { name: 'speech cancelled mid-phrase, 25 ms fade (new)', ...(await run(true)) }];
}

/** 6. Master limiter: what DynamicsCompressor(-3 dB, knee 0, ratio 20, attack 3 ms, release 120 ms) does to a hot mix. */
async function limiter() {
  const out: Record<string, unknown>[] = [];
  for (const thr of [-3]) {
    const ctx = new OfflineAudioContext(1, SR * 4, SR);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = thr; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.003; comp.release.value = 0.12;
    comp.connect(ctx.destination);
    // a quiet bed (440 Hz at -20 dBFS peak) and, from 1.0 to 1.1 s, a horn burst plus a crash at full scale
    const bed = ctx.createOscillator(); bed.frequency.value = 440; const bg = ctx.createGain(); bg.gain.value = 0.1; bed.connect(bg); bg.connect(comp); bed.start(0);
    const burst = ctx.createOscillator(); burst.type = 'square'; burst.frequency.value = 415; const bgn = ctx.createGain(); bgn.gain.setValueAtTime(0, 0); bgn.gain.setValueAtTime(1.0, 1.0); bgn.gain.setValueAtTime(0, 1.1); burst.connect(bgn); bgn.connect(comp); burst.start(0);
    const x = (await ctx.startRendering()).getChannelData(0);
    const rms = (a: number, b: number) => { let s = 0, n = 0; for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) { s += x[i] * x[i]; n++; } return 10 * Math.log10(s / n + 1e-12); };
    let pk = 0; for (let i = Math.floor(1.0 * SR); i < Math.floor(1.12 * SR); i++) pk = Math.max(pk, Math.abs(x[i]));
    let pk2 = 0; for (let i = Math.floor(1.0 * SR); i < Math.floor(1.004 * SR); i++) pk2 = Math.max(pk2, Math.abs(x[i]));
    out.push({
      name: `limiter threshold ${thr} dB: bed at -23 dBFS rms before / during / 0.1 s after / 0.5 s after the burst`,
      bedBefore: +rms(0.5, 0.9).toFixed(1), bedDuring: +rms(1.03, 1.09).toFixed(1), bedAfter100ms: +rms(1.12, 1.2).toFixed(1), bedAfter500ms: +rms(1.6, 1.9).toFixed(1),
      peakDbDuring: +(20 * Math.log10(pk)).toFixed(1), peakDbFirst4ms: +(20 * Math.log10(pk2)).toFixed(1),
    });
  }
  // makeup gain at low level: a -30 dBFS tone through the compressor against bypass
  const ctx = new OfflineAudioContext(1, SR, SR);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -3; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.003; comp.release.value = 0.12;
  comp.connect(ctx.destination); const o = ctx.createOscillator(); o.frequency.value = 440; const g = ctx.createGain(); g.gain.value = 0.0316; o.connect(g); g.connect(comp); o.start(0);
  const y = (await ctx.startRendering()).getChannelData(0); let s = 0; for (let i = SR / 2; i < SR; i++) s += y[i] * y[i];
  out.push({ name: 'limiter makeup: -30 dBFS-peak tone out minus in (dB)', gainDb: +(20 * Math.log10(Math.sqrt(2 * s / (SR / 2)) / 0.0316)).toFixed(2) });
  return out;
}

(window as any).stutter = { voiceSteal, sirenRelease, engineSwap, gearDip, hardCut, limiter, CheapVoice };
