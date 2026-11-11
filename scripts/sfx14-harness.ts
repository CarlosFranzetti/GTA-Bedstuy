// Browser-side offline render + analysis for the vehicle sound model (bundled by scripts/sfx14-render.mjs).
import { ENGINE_VOICES, EngineSim, firingHz, type EngineVoice } from '../src/audio/vehicle/engineModel';
import { HORNS, type SirenMode } from '../src/audio/vehicle/hornModel';
import { EngineNodes, playHorn } from '../src/audio/vehicle/nodes';
import * as FX from '../src/audio/vehicle/fx';

const SR = 44100;
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function noiseBuf(ctx: BaseAudioContext) {
  const b = ctx.createBuffer(1, SR, SR), d = b.getChannelData(0), r = lcg(7);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const u = i + k, v = i + k + len / 2, xr = re[v] * cr - im[v] * ci, xi = re[v] * ci + im[v] * cr;
      re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const N = 8192;
const BANDS: number[] = []; for (let f = 50; f < 12000; f *= 2 ** (1 / 3)) BANDS.push(f);
/** Mean power spectrum over a window, then centroid, peak bin under maxHz, and 1/3-octave dB bands. */
function spectrum(x: Float32Array, t0: number, t1: number) {
  const p = new Float64Array(N / 2);
  let frames = 0;
  const hop = N / 2;
  for (let s = Math.floor(t0 * SR); s + N <= Math.floor(t1 * SR); s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    for (let i = 0; i < N / 2; i++) p[i] += re[i] * re[i] + im[i] * im[i];
    frames++;
  }
  const bin = SR / N;
  let num = 0, den = 0, pk = 0, pkv = 0;
  for (let i = 2; i < N / 2; i++) { const f = i * bin; num += f * p[i]; den += p[i]; if (f < 400 && p[i] > pkv) { pkv = p[i]; pk = f; } }
  const bands = BANDS.map((fc) => { let s = 0; const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6); for (let i = 0; i < N / 2; i++) { const f = i * bin; if (f >= lo && f < hi) s += p[i]; } return 10 * Math.log10(s / Math.max(1, frames) + 1e-12); });
  const m = bands.reduce((a, b) => a + b, 0) / bands.length;
  return { centroid: den ? num / den : 0, peakHz: pk, bands: bands.map((b) => b - m), frames };
}
const peakDb = (x: Float32Array) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return 20 * Math.log10(m + 1e-9); };
const rmsDb = (x: Float32Array, t0: number, t1: number) => { let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += x[i] * x[i]; n++; } return 10 * Math.log10(s / n + 1e-12); };
function b64(x: Float32Array): string {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

async function renderEngine(type: string, secs = 6, startStop = false) {
  const v: EngineVoice = (ENGINE_VOICES as Record<string, EngineVoice>)[type];
  const ctx = new OfflineAudioContext(1, SR * secs, SR);
  const eng = new EngineNodes(ctx, v, noiseBuf(ctx), ctx.destination, 0);
  const sim = new EngineSim(v, lcg(11));
  if (startStop) sim.start(); else sim.startNow();
  let speed = 0, rpmIdle = 0, rpmMax = 0, gears = new Set<number>(), shifts = 0, lastG = 1;
  for (let i = 0; i < secs * 60; i++) {
    const t = i / 60;
    let th = 0, a = 0;
    if (startStop) { th = t > 1.6 && t < 3 ? 0.6 : 0; if (t > 4.6) sim.stop(); }
    else if (t >= 1.5 && t < 4.2) { th = 1; a = (0.8 * v.vmax) / 2.7; } else if (t >= 4.2) { th = 0; a = -5; }
    speed = Math.max(0, Math.min(v.vmax, speed + a / 60));
    const f = sim.update(1 / 60, speed, th);
    eng.apply(f, t, speed, false);
    if (t > 1.0 && t < 1.4) rpmIdle = f.rpm;
    rpmMax = Math.max(rpmMax, f.rpm); gears.add(f.gear); if (f.gear !== lastG) { shifts++; lastG = f.gear; }
  }
  const buf = await ctx.startRendering();
  const x = buf.getChannelData(0);
  const idle = spectrum(x, 0.5, 1.4), full = spectrum(x, 2.4, 4.0);
  return {
    type, idleHz: firingHz(rpmIdle, v.cyl), redHz: firingHz(rpmMax, v.cyl), idlePeak: idle.peakHz, centroid: full.centroid, rmsDb: rmsDb(x, 2.4, 4.0), peakDb: peakDb(x),
    idleBands: idle.bands, fullBands: full.bands, shifts, gears: gears.size, wav: b64(x),
  };
}

async function renderHorn(name: string, type: keyof typeof HORNS, mode?: SirenMode, hold = 1.2, novelty = false) {
  const secs = hold + 1.2;
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * secs), SR);
  const h = playHorn(ctx, ctx.destination, HORNS[type], 0.1, { mode, novelty });
  h.release(0.1 + hold);
  const x = (await ctx.startRendering()).getChannelData(0);
  const s = spectrum(x, 0.2, Math.min(0.1 + hold, 1.3));
  return { name, centroid: s.centroid, peakHz: s.peakHz, bands: s.bands, peakDb: peakDb(x), rmsDb: rmsDb(x, 0.2, 0.2 + Math.min(hold, 1) - 0.1), wav: b64(x) };
}

async function renderFx() {
  const out: Record<string, number> = {};
  const L: Record<string, FX.Layer[]> = {
    door_close_sedan: FX.doorLayers('sedan', false), door_open_bus: FX.doorLayers('bus', true), door_close_van: FX.doorLayers('cargovan', false), kerb: FX.kerbLayers(1), airbrake: FX.airBrakeLayers(),
    squeal: FX.brakeSquealLayers(), indicator: FX.indicatorLayers(true), beep: FX.beepLayers(), crash: FX.crashLayers(1), step_metal: FX.footstepLayers('metal', true), step_gravel: FX.footstepLayers('gravel'),
    jump: FX.jumpLayers(), land: FX.landLayers(1), ui_ok: FX.uiLayers('ok'),
  };
  for (const [k, layers] of Object.entries(L)) {
    const ctx = new OfflineAudioContext(1, SR, SR);
    FX.playLayers(ctx, noiseBuf(ctx), ctx.destination, layers, 0.05, 0.6, 1, lcg(3));
    out[k] = peakDb((await ctx.startRendering()).getChannelData(0));
  }
  return out;
}

(window as unknown as Record<string, unknown>).sfx14 = { renderEngine, renderHorn, renderFx, types: Object.keys(ENGINE_VOICES), hornTypes: Object.keys(HORNS), bands: BANDS };
