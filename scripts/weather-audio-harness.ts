// WEATHER: offline render of the weather sounds through the REAL AudioSystem ambience bus (so the level can be compared with the
// city bed and read through the master). Bundled and driven by scripts/weather-audio-render.mjs.
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import { Mixer } from '@/audio/Mixer';
import { WeatherAudio } from '@/audio/weather/WeatherAudio';
import { newWeatherAudioState, thunderDelaySeconds, type WeatherAudioState } from '@/audio/weather/mix';

const SR = 44100;
const STEP = 2205; // 50 ms
const DT = STEP / SR;

function b64wav(x: Float32Array): string {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

type St = Partial<WeatherAudioState>;
interface Scenario { secs: number; at: (t: number) => St | null; thunder?: { t: number; dist: number; strength: number }[] }
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

const SCENARIOS: Record<string, Scenario> = {
  bed: { secs: 20, at: () => null },
  light: { secs: 20, at: () => ({ rain: 0.35, wind: 0.35 }) },
  heavy: { secs: 20, at: () => ({ rain: 0.85, wind: 0.6 }) },
  heavycar: { secs: 20, at: () => ({ rain: 0.85, wind: 0.6, inVehicle: true }) },
  heavyindoor: { secs: 20, at: () => ({ rain: 0.85, wind: 0.6, indoors: true }) },
  windy: { secs: 20, at: (t) => ({ wind: 0.95, gust: 0.5 + 0.4 * Math.sin(t * 0.7) }) },
  // a shower building to a downpour and easing off, then getting into a car at 12 s
  ramp: { secs: 30, at: (t) => ({ rain: t < 10 ? lerp(0, 0.9, t / 10) : t < 22 ? 0.9 : lerp(0.9, 0.1, (t - 22) / 8), wind: 0.5, inVehicle: t > 14 && t < 22 }) },
  storm: { secs: 40, at: () => ({ rain: 0.95, wind: 0.85, storm: 1 }), thunder: [
    { t: 6, dist: 500, strength: 1 }, { t: 18, dist: 1700, strength: 0.9 }, { t: 30, dist: 4200, strength: 0.8 } ] },
};

async function render(name: string) {
  const sc = SCENARIOS[name];
  const n = Math.ceil(sc.secs * SR / STEP) * STEP;
  const ctx = new OfflineAudioContext(1, n, SR);
  const sys = new AudioSystem(new EventBus(), () => ctx as unknown as AudioContext, { mixer: new Mixer(null), storage: null, speech: null, lastStore: null, feed: null, voice: { hosted: false, phone: false, storage: null, store: null } } as never);
  await sys.start();
  (sys as any).vehicle.setHour?.(12);
  const wa = new WeatherAudio(() => sys.ambienceHost as never);
  const s = newWeatherAudioState();
  let k = 0;
  const pending = [...(sc.thunder ?? [])];
  const tick = () => {
    const t = k * DT;
    const st = sc.at(t);
    if (st) { Object.assign(s, newWeatherAudioState(), st); wa.update(DT, s); }
    // thunder is heard after the speed-of-sound delay (Weather does this in the game)
    for (const th of pending) if (!(th as any).done && t >= th.t + thunderDelaySeconds(th.dist)) { (th as any).done = true; wa.thunder(th.dist, th.strength); }
    sys.update(DT);
    k++;
  };
  const steps = n / STEP;
  const first = ctx.suspend(DT);
  const rendering = ctx.startRendering();
  await new Promise<void>((resolve) => {
    const next = () => { if (k >= steps) { resolve(); return; } tick(); if (k < steps) ctx.suspend(k * DT).then(() => { next(); ctx.resume(); }); else resolve(); };
    first.then(() => { next(); ctx.resume(); }); tick();
  });
  const buf = await rendering;
  const x = buf.getChannelData(0);
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  return { wav: b64wav(x), peak: +(20 * Math.log10(peak + 1e-9)).toFixed(1) };
}
(window as any).weatherAudio = { render, names: Object.keys(SCENARIOS) };
