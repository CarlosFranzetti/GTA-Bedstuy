// AMBIENT: offline renders of ONE environment source at a time, through the real classes, with the main thread simulated at 60, 30 and
// 15 updates a second and with stalls, and detectors for clicks, gaps, repeats and one-shot timing. Bundled by scripts/ambient-render.mjs
// (esbuild, `@` aliased to a source tree: src/ for after, a `git archive` of the commit before the AMBIENT lane for before).
// Taps read private fields of the real classes (the same trick scripts/soundcheck-harness.ts uses), so the same file works on both trees.
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import { Mixer } from '@/audio/Mixer';
import { WeatherAudio } from '@/audio/weather/WeatherAudio';
import { newWeatherAudioState } from '@/audio/weather/mix';

const SR = 44100;
const lcg = (seed: number) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

/* ---------- instrumentation: parameter writes and node creations ---------- */
const counters = { writes: 0, nodes: 0 };
for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'setValueCurveAtTime', 'cancelScheduledValues']) {
  const proto = (AudioParam.prototype as any), orig = proto[m];
  proto[m] = function (...a: unknown[]) { counters.writes++; return orig.apply(this, a); };
}
for (const m of Object.getOwnPropertyNames(BaseAudioContext.prototype).filter((k) => k.startsWith('create') && k !== 'createBuffer' && k !== 'createPeriodicWave')) {
  const proto = (BaseAudioContext.prototype as any), orig = proto[m];
  proto[m] = function (...a: unknown[]) { counters.nodes++; return orig.apply(this, a); };
}
/** start() times of every source node, for one-shot timing */
let starts: number[] = [];
for (const C of [AudioBufferSourceNode, OscillatorNode]) {
  const orig = (C.prototype as any).start;
  (C.prototype as any).start = function (when?: number, ...r: unknown[]) { starts.push(when ?? 0); return orig.call(this, when, ...r); };
}

export interface TickPlan { hz: number; stalls: [number, number][] }
export const STALLS: [number, number][] = [[7, 0.15], [17, 0.15], [27, 0.15], [40, 0.5], [52, 0.5]];

function tickTimes(secs: number, plan: TickPlan): number[] {
  const out: number[] = [];
  for (let k = 1; k / plan.hz < secs; k++) { const t = k / plan.hz; if (plan.stalls.some(([a, l]) => t >= a && t < a + l)) continue; out.push(t); }
  return out;
}

async function render(secs: number, channels: number, setup: (ctx: OfflineAudioContext, taps: AudioNode[]) => ((dt: number, t: number) => void) | void, plan: TickPlan) {
  const ctx = new OfflineAudioContext(channels, Math.ceil(secs * SR / 128) * 128, SR);
  const merger = ctx.createChannelMerger(channels); merger.connect(ctx.destination);
  const taps: AudioNode[] = [];
  for (let i = 0; i < channels; i++) { const g = ctx.createGain(); g.connect(merger, 0, i); taps.push(g); }
  counters.writes = 0; counters.nodes = 0; starts = [];
  const tick = await setup(ctx, taps);
  const times = tickTimes(secs, plan);
  const q = (t: number) => Math.ceil(t * SR / 128) * 128 / SR;
  const rendering = ctx.startRendering();
  let prev = 0, last = -1;
  const w0 = { w: 0, n: 0 };
  await new Promise<void>((resolve) => {
    const next = (i: number) => {
      while (i < times.length && q(times[i]) <= last) i++;
      if (i >= times.length) { resolve(); return; }
      const t = q(times[i]);
      ctx.suspend(t).then(() => { last = t; if (tick) tick(Math.min(0.1, t - prev), t); prev = t; next(i + 1); ctx.resume(); }).catch(() => resolve());
    };
    next(0);
  });
  const buf = await rendering;
  const wr = counters.writes, nn = counters.nodes;
  void w0;
  return { out: Array.from({ length: channels }, (_, c) => buf.getChannelData(c)), writesPerSec: wr / secs, nodesPerSec: nn / secs, starts: starts.slice() };
}

/* ---------- detectors ---------- */
function db(x: number) { return 20 * Math.log10(Math.max(x, 1e-9)); }
export function analyse(x: Float32Array, o: { loops: number[]; continuous: boolean; skip?: number }) {
  const skip = Math.floor((o.skip ?? 8) * SR);
  const n = x.length;
  let rmsAll = 0; for (let i = skip; i < n; i++) rmsAll += x[i] * x[i]; rmsAll = Math.sqrt(rmsAll / (n - skip));
  // clicks: a sample step of more than 6 times the rms step of its own 100 ms block (so a slow level change is not a click)
  const BL = Math.floor(0.1 * SR), clicks: number[] = [];
  for (let b0 = skip + 1; b0 + BL < n; b0 += BL) {
    let q = 0; for (let i = b0; i < b0 + BL; i++) { const d = x[i] - x[i - 1]; q += d * d; }
    const lim = 6 * Math.sqrt(q / BL);
    for (let i = b0; i < b0 + BL; i++) if (Math.abs(x[i] - x[i - 1]) > lim && lim > 1e-9) { if (!clicks.length || i / SR - clicks[clicks.length - 1] > 0.01) clicks.push(i / SR); }
  }
  const gaps: number[] = [];
  if (o.continuous) {
    // 10 ms rms blocks against the median of the surrounding second: a drop of more than 12 dB lasting 20 to 300 ms is a gap
    const B = Math.floor(0.01 * SR), nb = Math.floor(n / B), lev: number[] = [];
    for (let b = 0; b < nb; b++) { let s = 0; for (let j = 0; j < B; j++) { const v = x[b * B + j]; s += v * v; } lev.push(Math.sqrt(s / B)); }
    let run = 0;
    for (let b = Math.floor(o.skip ?? 8) * 100 + 50; b < nb - 50; b++) {
      const w = lev.slice(b - 50, b + 50).sort((p, r) => p - r), med = w[50];
      if (db(lev[b]) < db(med) - 12) run++; else { if (run >= 2 && run <= 30) gaps.push((b - run) * 0.01); run = 0; }
    }
  }
  // repeats: normalised autocorrelation at each loop length (best of +-3 samples), over the steady part
  const reps: Record<string, number> = {};
  const a = skip, e = n;
  let e0 = 0; for (let i = a; i < e; i++) e0 += x[i] * x[i];
  for (const L of o.loops) {
    const lag0 = Math.round(L * SR); let best = 0;
    for (let lag = lag0 - 3; lag <= lag0 + 3; lag++) { if (a + lag >= e) continue; let s = 0, en = 0; for (let i = a; i + lag < e; i++) { s += x[i] * x[i + lag]; en += x[i + lag] * x[i + lag]; } best = Math.max(best, s / Math.sqrt(e0 * en + 1e-30)); }
    reps[String(L)] = +best.toFixed(2);
  }
  const spacing = clicks.length > 2 ? +((clicks[clicks.length - 1] - clicks[0]) / (clicks.length - 1)).toFixed(2) : 0;
  return { levelDb: +db(rmsAll).toFixed(1), clickAt: clicks.slice(0, 6).map((c) => +c.toFixed(3)), clicks: clicks.length, clickEvery: spacing, gaps: gaps.length, repeats: reps };
}

/** Inter-onset intervals of one-shot starts (merging starts closer than 25 ms), against the ideal interval. */
export function onsets(starts: number[], ideal: number, from = 3) {
  const s = [...new Set(starts.filter((t) => t > from).map((t) => +t.toFixed(3)))].sort((a, b) => a - b);
  const on: number[] = [];
  for (const t of s) if (!on.length || t - on[on.length - 1] > 0.025) on.push(t);
  const ioi = on.slice(1).map((t, i) => t - on[i]);
  const mean = ioi.reduce((a, b) => a + b, 0) / Math.max(1, ioi.length);
  return { onsets: on.length, meanIoi: +mean.toFixed(3), maxIoi: +Math.max(0, ...ioi).toFixed(3), idealIoi: ideal, maxDevMs: Math.round(Math.max(0, ...ioi.map((v) => Math.abs(v - ideal))) * 1000) };
}

/* ---------- scenarios ---------- */
function newSystem(ctx: OfflineAudioContext) {
  const events = new EventBus();
  // the system's own output goes to a dead end, so only the tapped node reaches the recording (the real destination is the merger's)
  const sink = ctx.createGain();
  const proxy = new Proxy(ctx, { get(t, p) { if (p === 'destination') return sink; const v = (t as any)[p]; return typeof v === 'function' ? v.bind(t) : v; } }) as unknown as AudioContext;
  const sys = new AudioSystem(events, () => proxy, { mixer: new Mixer(null), storage: null, speech: null, lastStore: null, feed: null, voice: { hosted: false, phone: false, storage: null, store: null } } as any);
  return { sys, events };
}

type Scenario = { channels: number; run: (ctx: OfflineAudioContext, taps: AudioNode[]) => Promise<((dt: number, t: number) => void) | void>; loops: number[]; continuous: boolean; ideal?: number; static?: boolean };
export const SCENARIOS: Record<string, Scenario> = {
  // the day and night paths of the hum bed (both come from the one looped pink-noise buffer); night adds the crickets
  hum_day: { channels: 1, loops: [1, 2, 4, 6, 8], continuous: true, static: true, run: async (ctx, taps) => {
    const { sys } = newSystem(ctx); await sys.start(); const g = (sys as any).g; (g.city?.dayGain ?? g.dayGain).connect(taps[0]);
  } },
  hum_night: { channels: 1, loops: [1, 2, 4, 6, 8], continuous: true, static: true, run: async (ctx, taps) => {
    const { sys } = newSystem(ctx); sys.setNight(true); await sys.start(); const g = (sys as any).g; (g.city?.nightGain ?? g.nightGain).connect(taps[0]);
  } },
  // the traffic wash of the vehicle layer, on foot at 14:00
  wash: { channels: 1, loops: [1, 2, 6, 8], continuous: true, run: async (ctx, taps) => {
    const { sys } = newSystem(ctx); await sys.start(); const va = sys.vehicle as any; va.setHour(14); va.update(0.016); va.wash.g.connect(taps[0]);
    return (dt) => va.update(dt);
  } },
  // in a sedan at 14 m/s with some slip and rain: tyre roll, cabin wind, wet hiss, squeal, rain hiss (engine off)
  road: { channels: 5, loops: [1, 2, 6, 8], continuous: true, run: async (ctx, taps) => {
    const { sys } = newSystem(ctx); await sys.start(); const va = sys.vehicle as any;
    va.setEngineEnabled(false); va.setHour(14); va.setType('sedan'); va.setDrive(14, 0.3, true); va.setSlip(0.5); va.setWeather(0.6, 0.8);
    va.update(0.016);
    [va.roll.g, va.wind.g, va.wetN.g, va.sq.g, va.rainN.g].forEach((n: AudioNode, i: number) => n.connect(taps[i]));
    return (dt) => va.update(dt);
  } },
  // rain, wind and gusts: the real WeatherAudio, heavy rain with wind, in the open
  weather: { channels: 1, loops: [4, 6], continuous: true, run: async (ctx, taps) => {
    const w = new WeatherAudio(() => ({ ctx, dest: taps[0] }));
    const st = newWeatherAudioState(); st.rain = 0.8; st.wind = 0.6; st.storm = 0.2;
    w.update(0.016, st);
    let t = 0;
    return (dt) => { t += dt; st.gust = 0.5 + 0.4 * Math.sin(t * 0.7); w.update(dt, st); };
  } },
  // footsteps on foot at a walk (stride 0.8 m at 1.6 m/s: a step every 0.5 s)
  steps: { channels: 1, loops: [], continuous: false, ideal: 0.5, run: async (ctx, taps) => {
    const { sys } = newSystem(ctx); await sys.start(); const va = sys.vehicle as any; va.setEngineEnabled(false); va.setHour(14); va.setFoot(1.6, 0, true);
    (sys as any).g.sfxBus.connect(taps[0]);
    return (dt) => va.update(dt);
  } },
  // the accessible pedestrian signal, WALK phase: a chirp every 0.125 s
  signals: { channels: 1, loops: [], continuous: false, ideal: 0.125, run: async (ctx, taps) => {
    const { sys } = newSystem(ctx); await sys.start(); const va = sys.vehicle as any; va.setEngineEnabled(false); va.setHour(14); va.setCrosswalk(3, 'walk');
    (sys as any).g.sfxBus.connect(taps[0]);
    return (dt) => va.update(dt);
  } },
};

// everything at once, engine off: the whole environment, for the audio-thread cost
SCENARIOS.env_all = { channels: 1, loops: [], continuous: true, run: async (ctx, taps) => {
  const { sys } = newSystem(ctx); sys.setNight(false); await sys.start(); const va = sys.vehicle as any; const g = (sys as any).g;
  va.setEngineEnabled(false); va.setHour(14); va.setType('sedan'); va.setDrive(14, 0.3, true); va.setSlip(0.5); va.setWeather(0.6, 0.8); va.setDistrict('bedstuy');
  g.ambBus.connect(taps[0]); g.sfxBus.connect(taps[0]);
  const w = new WeatherAudio(() => ({ ctx: g.ctx, dest: g.ambBus })); const st = newWeatherAudioState(); st.rain = 0.8; st.wind = 0.6; st.storm = 0.2;
  return (dt) => { va.update(dt); w.update(dt, st); };
} };

/** Wall time to render `secs` of a scenario, as a multiple of real time (a proxy for the load on the audio thread; software Chromium on this box). */
async function cost(name: string, secs: number) {
  const sc = SCENARIOS[name];
  let best = 1e9;
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    await render(secs, sc.channels, (ctx, taps) => sc.run(ctx, taps), { hz: 2, stalls: [] });
    best = Math.min(best, performance.now() - t0);
  }
  return { name, secs, bestMs: Math.round(best), timesRealtime: +(secs * 1000 / best).toFixed(1) };
}

async function runOne(name: string, hz: number, stalls: boolean, secs: number) {
  const sc = SCENARIOS[name];
  const plan: TickPlan = { hz, stalls: stalls ? STALLS : [] };
  const r = await render(secs, sc.channels, (ctx, taps) => sc.run(ctx, taps), plan);
  const per = r.out.map((x) => analyse(x, { loops: sc.loops, continuous: sc.continuous }));
  const o = sc.ideal ? onsets(r.starts, sc.ideal) : undefined;
  return { name, hz, stalls, writesPerSec: Math.round(r.writesPerSec), nodesPerSec: Math.round(r.nodesPerSec), channels: per, onsets: o };
}

/** Seam statistics of a buffer, for the loop-point table. */
async function lags(name: string, secs: number) {
  const sc = SCENARIOS[name];
  const r = await render(secs, sc.channels, (ctx, taps) => sc.run(ctx, taps), { hz: 60, stalls: [] });
  const x = r.out[0], a = Math.floor(8 * SR), e = x.length, o: Record<string, number> = {};
  let e0 = 0; for (let i = a; i < e; i++) e0 += x[i] * x[i];
  for (let L = 0.5; L <= 14; L += 0.5) { const lag = Math.round(L * SR); let s = 0, en = 0; for (let i = a; i + lag < e; i++) { s += x[i] * x[i + lag]; en += x[i + lag] ** 2; } o[L] = +(s / Math.sqrt(e0 * en)).toFixed(2); }
  return o;
}
async function probe() {
  const ctx = new OfflineAudioContext(1, 44100, 44100);
  const { sys } = newSystem(ctx); await sys.start(); const va = sys.vehicle as any; const g = (sys as any).g;
  return { noise: va.noise?.duration, wash: va.wash?.src.buffer?.duration, gnoise: g.noise?.duration };
}
(window as any).ambient = { runOne, cost, probe, lags, names: Object.keys(SCENARIOS) };
void lcg;
