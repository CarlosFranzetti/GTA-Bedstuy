// SOUNDCHECK: offline render of a 60 s street scene through the REAL AudioSystem (real buses, limiter, vehicle layer,
// traffic voices, city bed, footsteps). Seven tapped stems come out of one render so each bus can be measured:
//   0 master (after the limiter)  1 sound-effects bus  2 voices bus  3 ambience bus  4 radio + music buses
//   5 the player's engine         6 the traffic engines
// Bundled by scripts/soundcheck-render.mjs; the module root of src/audio/vehicle is aliased (@veh) only for base comparisons.
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import { Mixer } from '@/audio/Mixer';

const SR = 44100;
const STEP = 768;
const DT = STEP / SR;
const STEMS = ['master', 'sfx', 'voices', 'ambience', 'radio', 'engine_player', 'engine_traffic'] as const;

function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/* ---------- K-weighted loudness (BS.1770) ---------- */
function kFilter(x: Float32Array): Float32Array {
  const biq = (b: number[], a: number[], inp: Float32Array) => { const o = new Float32Array(inp.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < inp.length; i++) { const v = (b[0] * inp[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2) / a[0]; x2 = x1; x1 = inp[i]; y2 = y1; y1 = v; o[i] = v; } return o; };
  const G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319;
  const A = 10 ** (G / 40); let w0 = 2 * Math.PI * fc / SR, al = Math.sin(w0) / (2 * Q), c = Math.cos(w0); const sA = 2 * Math.sqrt(A) * al;
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
const unb64 = (s: string): Float32Array => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Float32Array(u.buffer); };

/** A synthesised stand-in for a streamed radio track (kick, snare, hats, bass, chords), scaled to `target` LUFS integrated. */
function musicStandIn(secs: number, target: number): Float32Array {
  const n = Math.round(secs * SR), x = new Float32Array(n), r = lcg(3);
  const bpm = 94, beat = 60 / bpm;
  const chords = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 392]];
  const bass = [65.4, 55, 43.65, 49];
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, b = t / beat, bi = Math.floor(b), ph = (b - bi) * beat, bar = Math.floor(bi / 4) % 4;
    let s = 0;
    s += 0.9 * Math.sin(2 * Math.PI * (45 + 105 * Math.exp(-ph * 40)) * ph) * Math.exp(-ph * 9) * (bi % 4 === 0 || bi % 4 === 2 ? 1 : 0);
    const sp = (b + 1) % 2 < 1 ? 0 : 1; // snare on 2 and 4
    if (sp && bi % 2 === 1) s += (r() * 2 - 1) * 0.5 * Math.exp(-ph * 18);
    const h = ((b * 2) % 1) * beat / 2; s += (r() * 2 - 1) * 0.12 * Math.exp(-h * 60);
    s += 0.5 * Math.tanh(2 * Math.sin(2 * Math.PI * bass[bar] * t)) * (0.6 + 0.4 * Math.exp(-ph * 4));
    for (const f of chords[bar]) s += 0.12 * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.01 * t)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.2 * t));
    lp += (s - lp) * 0.5; // a little darker than raw
    x[i] = lp;
  }
  const L = lufs(kFilter(x), 0, secs);
  const g = 10 ** ((target - L) / 20);
  for (let i = 0; i < n; i++) x[i] *= g;
  return x;
}

export interface Scene { secs?: number; speech?: { dj?: string; bark1?: string; bark2?: string }; standInRadio?: boolean; carType?: string; synthRadio?: boolean }

async function street(o: Scene) {
  const secs = o.secs ?? 60, carType = o.carType ?? 'sedan';
  const n = Math.ceil(secs * SR / STEP) * STEP;
  const ctx = new OfflineAudioContext(STEMS.length, n, SR);
  const merger = ctx.createChannelMerger(STEMS.length);
  merger.connect(ctx.destination);
  const dest = ctx.createGain(); dest.connect(merger, 0, 0);
  const proxy = new Proxy(ctx, { get(t, p) { if (p === 'destination') return dest; const v = (t as any)[p]; return typeof v === 'function' ? v.bind(t) : v; } }) as unknown as AudioContext;

  const events = new EventBus();
  const sys = new AudioSystem(events, () => proxy, { mixer: new Mixer(null), storage: null, speech: null, lastStore: null, feed: null, voice: { hosted: false, phone: false, storage: null, store: null } });
  await sys.start();
  const g = (sys as any).g;
  const tap = (node: AudioNode, ch: number) => node.connect(merger, 0, ch);
  tap(g.sfxBus, 1); tap(g.voiceBus, 2); tap(g.ambBus, 3); tap(g.radioBus, 4); tap(g.musicBus, 4);
  const va = sys.vehicle as any;
  sys.setDistrict('bedstuy');
  va.setHour(12);

  // stand-in radio track on the music bus (files are full scale: the bus applies MUSIC_GAIN 0.7)
  if (o.standInRadio !== false) {
    const m = musicStandIn(24, -14);
    const buf = ctx.createBuffer(1, m.length, SR); buf.copyToChannel(m as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g.musicBus); src.start(0);
  }
  const clip = (b64: string | undefined, rate: number) => { if (!b64) return null; const f = unb64(b64); const b = ctx.createBuffer(1, f.length, rate); b.copyToChannel(f as Float32Array<ArrayBuffer>, 0); return b; };
  const play = (b: AudioBuffer | null, at: number, dst: AudioNode, gain: number, lpHz = 0) => {
    if (!b) return; const s = ctx.createBufferSource(); s.buffer = b; const gn = ctx.createGain(); gn.gain.value = gain;
    s.connect(gn); if (lpHz) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpHz; gn.connect(f); f.connect(dst); } else gn.connect(dst); s.start(at);
  };
  const dj = clip(o.speech?.dj, 24000), b1 = clip(o.speech?.bark1, 24000), b2 = clip(o.speech?.bark2, 24000);
  const REF = 0.63; // PedVoicePlayer: ped speech sits 4 dB under the reference at 2 m
  const distG = (d: number) => REF * Math.min(1, 2 / Math.max(2, d));
  const distLp = (d: number) => Math.max(1500, 7000 - d * 220);
  // radio host on the hub bus (it keeps the level the music bus has) in the car, a ped bark in the car (8 m) and one on foot (3 m)
  play(dj, 15, g.hubBus, 1);
  play(b1, 25, g.voiceBus, distG(8), distLp(8));
  play(b2, 52, g.voiceBus, distG(3), distLp(3));

  // timeline of the scene
  const vmax = 30, cruise = 13;
  let speed = 0, inCar = false, k = 0;
  const cars = [
    { id: 'a', type: 'sedan', x: 190, z: 4.5, vx: -22, speed: 11, throttle: 0.35 },      // oncoming, passes at about 18 s
    { id: 'b', type: 'bus', x: -22 - 8 * 13, z: -4.5, vx: 5, speed: 8, throttle: 0.5 },  // slow bus overtaken, relative +5 m/s
    { id: 'c', type: 'coupe911', x: 190 + 22 * 6, z: 4.5, vx: -22, speed: 11, throttle: 0.5 }, // oncoming
  ];
  const passAt = [18, 28, 42];
  cars[0].x = 22 * passAt[0]; cars[1].x = -5 * (passAt[1] - 0) + 0; cars[1].vx = 5; cars[1].x = -5 * passAt[1]; cars[2].x = 22 * passAt[2];
  let prevIn = false;
  const tick = () => {
    const t = k * DT;
    let th = 0, brake = false, want = false;
    if (t < 6) want = false;
    else if (t < 48) want = true;
    if (want && !prevIn) { events.emit('enterVehicle', { vehicleId: 'v' }); sys.playDoor(false, carType); }
    if (!want && prevIn) { events.emit('exitVehicle', { vehicleId: 'v' }); sys.playDoor(true, carType); }
    prevIn = want; inCar = want;
    if (inCar) {
      if (t < 9) th = 0;
      else if (t < 14) th = 1;
      else if (t < 34) th = Math.max(0, Math.min(0.6, (cruise - speed) * 0.25 + 0.14));
      else if (t < 38) th = 1;
      else if (t < 45) th = Math.max(0, Math.min(0.6, (cruise - speed) * 0.25 + 0.14));
      else { th = 0; brake = speed > 0.5; }
      const acc = th * (vmax / 7) * (1 - speed / (vmax * 1.02)) - (brake ? 7 : 0) - 0.08 - speed * 0.012 * (th < 0.05 ? 1 : 0.2);
      speed = Math.max(0, speed + acc * DT);
    } else speed = 0;
    sys.setEngine(speed, th, inCar, 1, carType);
    sys.setBraking(brake);
    if (!inCar) va.setFoot(t < 3 ? 1.6 : t < 5 ? 5.5 : t < 52 ? 0 : t < 55 ? 1.6 : 5.5, t < 3 ? 0 : t < 5 ? 1 : t < 55 ? 0 : 1, true);
    const L = { x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 };
    for (const q of cars) q.x += q.vx * DT;
    sys.setTraffic(L, cars.map((q) => ({ ...q })), DT);
    // tap new traffic voices once they exist (slots are pooled; the first update creates them)
    const slots: any[] = (va.traffic as any)?.slots ?? [];
    for (const s of slots) if (!s.__tapped) { s.__tapped = true; s.g.connect(merger, 0, 6); }
    const eng = va.eng; if (eng && !eng.__tapped) { eng.__tapped = true; eng.out.connect(merger, 0, 5); eng.acc.connect(merger, 0, 5); }
    sys.update(DT);
    k++;
  };
  const steps = n / STEP;
  await new Promise<void>((resolve) => {
    const next = () => { if (k >= steps) { resolve(); return; } tick(); if (k < steps) ctx.suspend(k * DT).then(() => { next(); ctx.resume(); }); else resolve(); };
    ctx.suspend(DT).then(() => { next(); ctx.resume(); }); tick();
  });
  const buf = await ctx.startRendering();
  const stems: Record<string, Float32Array> = {};
  STEMS.forEach((s, i) => { stems[s] = buf.getChannelData(i); });
  // loudness per window (BS.1770 K-weighted, ungated mean power over the window)
  const K: Record<string, Float32Array> = {}; for (const s of STEMS) K[s] = kFilter(stems[s]);
  const win = (a: number, b: number) => Object.fromEntries(STEMS.map((s) => [s, +lufs(K[s], a, b).toFixed(1)]));
  const windows: Record<string, [number, number]> = { foot_before: [0.5, 5.5], idle: [6.5, 9], wot_pullaway: [10, 14], cruise: [20, 26], cruise_late: [29, 33], wot_burst: [34.5, 38], dj_speech: [15.3, 19.5], bark_in_car: [25.2, 27.5], bark_on_foot: [52.2, 54.6], foot_after: [55.5, 59.5], traffic_pass_a: [16.5, 19.5], traffic_pass_b: [26.5, 29.5], traffic_pass_c: [40.5, 43.5] };
  const report: Record<string, Record<string, number>> = {};
  for (const [w, [a, b]] of Object.entries(windows)) report[w] = win(a, b) as Record<string, number>;
  const peaks = Object.fromEntries(STEMS.map((s) => [s, +peakDb(stems[s]).toFixed(1)]));
  // short-term (3 s) series every 1 s, for the engine, radio, voices
  const series: Record<string, number[]> = {};
  for (const s of STEMS) { series[s] = []; for (let t = 0; t + 3 <= secs; t += 1) series[s].push(+lufs(K[s], t, t + 3).toFixed(1)); }
  const files: Record<string, string> = {};
  for (const s of STEMS) files[s] = b64wav(stems[s]);
  return { report, peaks, series, files, secs };
}

(window as any).soundcheck = { street };
