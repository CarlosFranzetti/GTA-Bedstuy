// Browser-side offline render of the REAL VehicleAudio graph driven through a scripted drive (SFX2). Bundled by scripts/sfx2-render.mjs.
// The module root is aliased so the same harness measures the committed code and the new code.
import { VehicleAudio } from '@veh/VehicleAudio';
import { ENGINE_VOICES, EngineSim } from '@veh/engineModel';
import { EngineNodes, playHorn } from '@veh/nodes';
import { HORNS } from '@veh/hornModel';

const SR = 44100;
const STEP = 768; // frames per control step (17.4 ms, about 57 Hz)
const DT = STEP / SR;
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function noiseBuf(ctx: BaseAudioContext) { const b = ctx.createBuffer(1, SR, SR), d = b.getChannelData(0), r = lcg(7); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; return b; }

/* ---------- K-weighted loudness (BS.1770) ---------- */
function kFilter(x: Float32Array): Float32Array {
  const biq = (b: number[], a: number[], inp: Float32Array) => { const o = new Float32Array(inp.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < inp.length; i++) { const v = (b[0] * inp[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2) / a[0]; x2 = x1; x1 = inp[i]; y2 = y1; y1 = v; o[i] = v; } return o; };
  const G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319;
  let A = 10 ** (G / 40), w0 = 2 * Math.PI * fc / SR, al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), sA = 2 * Math.sqrt(A) * al;
  const hs = biq([A * ((A + 1) + (A - 1) * c + sA), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sA)], [(A + 1) - (A - 1) * c + sA, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sA], x);
  w0 = 2 * Math.PI * 38.13547087613982 / SR; al = Math.sin(w0) / (2 * 0.5003270373238773); c = Math.cos(w0);
  return biq([(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al], hs);
}
const lufs = (k: Float32Array, t0: number, t1: number) => { let s = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.min(k.length, Math.floor(t1 * SR)); i++) { s += k[i] * k[i]; n++; } return -0.691 + 10 * Math.log10(s / Math.max(1, n) + 1e-12); };
const peakDb = (x: Float32Array) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return 20 * Math.log10(m + 1e-9); };
function b64wav(x: Float32Array, rate = SR): string {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ---------- scripted drive ---------- */
export interface Ctl { th: number; brake: boolean; slip: number; inCar: boolean; reverse: boolean; horn: boolean }
interface DriveOpts { type: string; secs: number; script: (t: number, st: { speed: number; vmax: number }) => Partial<Ctl> & { marker?: string; weather?: [number, number]; footSpeed?: number; footRun?: number; hour?: number; yaw?: number; traffic?: boolean; hornTap?: boolean; surface?: string }; seed?: number }

async function drive(o: DriveOpts) {
  const v = ENGINE_VOICES[o.type as keyof typeof ENGINE_VOICES];
  const n = Math.ceil(o.secs * SR / STEP) * STEP;
  const ctx = new OfflineAudioContext(1, n, SR);
  const bus = ctx.createGain(); bus.connect(ctx.destination);
  const amb = ctx.createGain(); amb.gain.value = 1; amb.connect(ctx.destination);
  const va = new VehicleAudio(lcg(o.seed ?? 5));
  (va as any).attach(ctx, bus, noiseBuf(ctx), amb);
  let speed = 0, inCar = false, typed = false, yaw = 0;
  const markers: [number, string][] = [];
  const cars = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, type: ['sedan', 'bus', 'cab', 'pickup', 'hatch', 'muscle', 'boxtruck', 'minivan', 'cop'][i], x: -120 - i * 33, z: (i % 2 ? 6 : -6), vx: 8 + (i % 4) * 3, vz: 0, speed: 8 + (i % 4) * 3, throttle: 0.4 }));
  const L = { x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 };
  const steps = n / STEP;
  const hold: Record<string, number> = {};
  let k = 0;
  const tick = () => {
    const t = k * DT;
    const c = o.script(t, { speed, vmax: v.vmax });
    if (c.marker) markers.push([t, c.marker]);
    const wantIn = c.inCar ?? inCar;
    if (wantIn && !typed) { va.setType(o.type); typed = true; }
    if (wantIn !== inCar) { inCar = wantIn; if (inCar) va.playDoor(false, o.type); else va.playDoor(true, null); }
    if (!wantIn && typed && !inCar) { /* left */ }
    const th = c.th ?? 0;
    const acc = inCar ? (th * (v.vmax / 7) * (1 - speed / (v.vmax * 1.02)) - (c.brake ? 7 : 0) - 0.08 - speed * 0.012 * (th < 0.05 ? 1 : 0.2)) : 0;
    speed = inCar ? Math.max(0, speed + acc * DT) : 0;
    (va as any).setDrive(speed, th, inCar);
    if (!inCar && typed && (c as any).release) { va.setType(null); typed = false; }
    (va as any).setReverse?.(!!c.reverse);
    (va as any).setSlip?.(c.slip ?? 0);
    (va as any).setBraking?.(!!c.brake && inCar);
    if (c.weather) (va as any).setWeather?.(c.weather[0], c.weather[1]);
    if (c.hour !== undefined) (va as any).setHour?.(c.hour);
    if (c.footSpeed !== undefined) (va as any).setFoot?.(c.footSpeed, c.footRun ?? 0, true);
    if (c.surface) (va as any).setSurface(c.surface);
    if (c.hornTap) va.hornEvent();
    (va as any).setHornHeld?.(!!c.horn);
    if (c.horn && !hold.horn) { va.hornEvent(); hold.horn = 1; } if (!c.horn) hold.horn = 0;
    if (c.yaw !== undefined) { yaw = c.yaw; L.rx = Math.cos(yaw); L.rz = -Math.sin(yaw); }
    if (c.traffic) { for (const q of cars) { q.x += q.vx * DT; if (q.x > 150) q.x -= 330 + ((k * 7) % 40); } va.setTraffic({ ...L }, cars.map((q) => ({ ...q })), DT); }
    va.update(DT);
    k++;
  };
  // control steps are driven by suspending the offline context between render quanta
  const run = new Promise<void>((resolve) => {
    const next = () => {
      if (k >= steps) { resolve(); return; }
      tick();
      const tNext = (k) * DT;
      if (k < steps) ctx.suspend(tNext).then(() => { next(); ctx.resume(); }); else resolve();
    };
    ctx.suspend(DT).then(() => { next(); ctx.resume(); });
    tick();
  });
  const rendered = ctx.startRendering();
  await run;
  const buf = await rendered;
  const x = buf.getChannelData(0);
  return { x, markers };
}

function analyse(x: Float32Array, markers: [number, string][], margin = 0.6) {
  const hop = Math.floor(0.025 * SR), win = Math.floor(0.05 * SR);
  const L: number[] = [];
  for (let s = 0; s + win <= x.length; s += hop) { let e = 0; for (let i = 0; i < win; i++) e += x[s + i] * x[s + i]; L.push(10 * Math.log10(e / win + 1e-12)); }
  let nan = 0; for (const v of x) if (!Number.isFinite(v)) nan++;
  const near = (t: number) => markers.some(([m]) => t >= m - 0.15 && t <= m + margin);
  const dips: { t: number; depth: number; ref: number }[] = [];
  for (let i = 20; i < L.length - 40; i++) {
    let ref = -200; for (let j = i - 20; j < i; j++) ref = Math.max(ref, L[j]);
    if (ref < -75) continue;
    if (L[i] < ref - 6) {
      let rec = -1; for (let j = i + 1; j < Math.min(L.length, i + 40); j++) if (L[j] >= ref - 3) { rec = j; break; }
      if (rec > 0 && !near(i * 0.025)) { let dm = 0; for (let j = i; j < rec; j++) dm = Math.max(dm, ref - L[j]); dips.push({ t: +(i * 0.025).toFixed(2), depth: +dm.toFixed(1), ref: +ref.toFixed(1) }); i = rec; }
    }
  }
  // slow falls: level 0.5 s later more than 12 dB under the level now, with no marker nearby (a fade that is not an event)
  const falls: { t: number; depth: number }[] = [];
  for (let i = 0; i < L.length - 24; i++) { const d = L[i] - L[i + 20]; if (d > 12 && L[i] > -70 && !near(i * 0.025) && !near(i * 0.025 + 0.5)) { falls.push({ t: +(i * 0.025).toFixed(2), depth: +d.toFixed(1) }); i += 20; } }
  return { frames: L, dips, falls, nan, peakDb: peakDb(x) };
}

/** Profile of the two-minute drive. */
function longScript(type: string) {
  return (t: number, st: { speed: number; vmax: number }) => {
    const c: any = { traffic: true, hour: 12 };
    const cruise = st.vmax * 0.55;
    const gov = (target: number) => Math.max(0, Math.min(0.6, (target - st.speed) * 0.25 + 0.12));
    if (t < 4) { c.inCar = false; c.footSpeed = t < 2 ? 1.6 : 5.5; c.footRun = t < 2 ? 0 : 1; c.th = 0; }
    else if (t < 9) { c.inCar = true; c.th = 0; if (t < 4.1) c.marker = 'enter'; }
    else if (t < 17) { c.inCar = true; c.th = 1; }
    else if (t < 27) { c.inCar = true; c.th = gov(cruise); }
    else if (t < 33) { c.inCar = true; c.th = 0; if (t < 27.1) c.marker = 'lift'; }
    else if (t < 38) { c.inCar = true; c.th = 0; c.brake = true; c.slip = t > 33.5 && t < 35.5 ? 0.7 : 0; }
    else if (t < 44) { c.inCar = true; c.th = 0; }
    else if (t < 60) { c.inCar = true; c.th = t < 52 ? 0.55 : gov(cruise * 1.1); }
    else if (t < 80) { c.inCar = true; const ph = (t - 60) % 10; c.th = ph < 4 ? 0.9 : ph < 6.5 ? 0 : 0; c.brake = ph >= 6.5 && st.speed > 0.5; c.yaw = t > 70 ? 1.57 : 0; }
    else if (t < 92) { c.inCar = true; c.th = gov(cruise); c.weather = [1, 1]; c.surface = 'asphalt'; }
    else if (t < 96) { c.inCar = true; c.th = gov(cruise); c.horn = t > 92 && t < 93.5; c.marker = t > 92 && t < 92.1 ? 'horn' : undefined; }
    else if (t < 106) { c.inCar = true; const ph = (t - 96); c.th = ph < 4 ? 1 : ph < 5.5 ? 0 : ph < 8.5 ? 1 : 0; if (ph > 8.4 && ph < 8.5) c.marker = 'lift2'; }
    else if (t < 111) { c.inCar = true; c.th = 0; c.brake = st.speed > 0.4; }
    else if (t < 111.2) { c.inCar = false; c.th = 0; c.release = true; c.marker = 'exit'; }
    else { c.inCar = false; c.footSpeed = t < 116 ? 1.6 : 5.5; c.footRun = t < 116 ? 0 : 1; c.hour = 12 + (t - 111) * 0.1; }
    if (t > 111 && t < 112.6) c.marker = 'shutdown';
    if (t < 5.4 && t >= 4) c.marker = 'start';
    return c;
  };
}

async function longDrive(type: string, secs = 120, wav = false) {
  const { x, markers } = await drive({ type, secs, script: longScript(type) as any });
  const a = analyse(x, markers);
  const k = kFilter(x);
  const phases: Record<string, number> = { idle: lufs(k, 6, 9), wot: lufs(k, 12, 16), cruise: lufs(k, 20, 26), coast: lufs(k, 28, 32), brake: lufs(k, 34, 37), rain: lufs(k, 82, 91), foot: lufs(k, 0.2, 2), run: lufs(k, 2.5, 3.8), end: lufs(k, 116.5, 119.5) };
  return { type, frames: a.frames.length, dips: a.dips, falls: a.falls, nan: a.nan, peakDb: a.peakDb, phases, markers, wav: wav ? b64wav(x) : undefined, levels: a.frames.filter((_, i) => i % 8 === 0).map((v) => +v.toFixed(1)) };
}

/** Steady-state loudness of one engine at cruise and full throttle: engine alone (EngineNodes), and the whole vehicle layer (engine, tyres, wind). */
async function steady(type: string) {
  const v = ENGINE_VOICES[type as keyof typeof ENGINE_VOICES];
  const out: Record<string, number> = {};
  for (const [name, speedF, th] of [['cruise', 0.55, 0.22], ['wot', 0.6, 1]] as const) {
    const ctx = new OfflineAudioContext(1, SR * 8, SR);
    const eng = new EngineNodes(ctx, v, noiseBuf(ctx), ctx.destination, 0);
    const sim = new EngineSim(v, lcg(11)); sim.startNow();
    for (let i = 0; i < 8 * 60; i++) { const f = sim.update(1 / 60, speedF * v.vmax, th); eng.apply(f, i / 60, speedF * v.vmax, false); }
    out['eng_' + name] = lufs(kFilter((await ctx.startRendering()).getChannelData(0)), 4, 8);
  }
  // whole layer at a held speed
  for (const [name, speedF, th] of [['cruise', 0.55, 0.22], ['wot', 0.6, 1]] as const) {
    const ctx = new OfflineAudioContext(1, SR * 8, SR);
    const bus = ctx.createGain(); bus.connect(ctx.destination);
    const va = new VehicleAudio(lcg(4));
    (va as any).attach(ctx, bus, noiseBuf(ctx), bus);
    va.setType(type);
    const frames = Math.floor(8 * SR / STEP);
    let k = 0;
    await new Promise<void>((resolve) => {
      const tick = () => { va.setDrive(speedF * v.vmax, th, true); va.update(DT); k++; };
      const next = () => { tick(); if (k < frames) ctx.suspend(k * DT).then(() => { next(); ctx.resume(); }); else resolve(); };
      ctx.suspend(DT).then(() => { next(); ctx.resume(); }); tick();
    }).catch(() => {});
    out['all_' + name] = lufs(kFilter((await ctx.startRendering()).getChannelData(0)), 4, 8);
  }
  return { type, ...out };
}

/** Short demo of one vehicle: key on, idle, pull away through the gears, lift off, brake, horn tap. */
async function demo(type: string, secs = 17) {
  const { x } = await drive({ type, secs, script: (t, st) => {
    const c: any = { inCar: t > 0.4, traffic: false };
    if (t < 4) c.th = 0;
    else if (t < 11) c.th = 1;
    else if (t < 13.5) c.th = 0;
    else { c.th = 0; c.brake = st.speed > 0.4; }
    if (t > 15.2 && t < 15.3) c.hornTap = true;
    return c;
  } });
  return { type, wav: b64wav(x), peak: peakDb(x) };
}

async function hornDemo(type: string, hold = 1.4, mode?: string) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * (hold + 1.4)), SR);
  const h = playHorn(ctx, ctx.destination, (HORNS as any)[type], 0.15, { mode: mode as any });
  h.release(0.15 + hold);
  const x = (await ctx.startRendering()).getChannelData(0);
  return { type, wav: b64wav(x), peak: peakDb(x), lufs: lufs(kFilter(x), 0.2, 0.15 + Math.min(hold, 1.2)) };
}

(window as any).sfx2 = { longDrive, steady, demo, hornDemo, types: Object.keys(ENGINE_VOICES) };
