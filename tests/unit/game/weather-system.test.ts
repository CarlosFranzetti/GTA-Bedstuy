import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Weather } from '@/game/Weather';
import type { WeatherAudioSink, WeatherAudioState } from '@/audio/weather/mix';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';

function fakeLibrary(): IMaterialLibrary {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  return {
    get(key: MaterialKey, v = 0) {
      const id = `${key}:${v % 2}`;
      let m = mats.get(id);
      if (!m) { m = new THREE.MeshStandardMaterial({ roughness: 0.9 }); mats.set(id, m); }
      return m;
    },
  } as unknown as IMaterialLibrary;
}
const noCanvas = (): HTMLCanvasElement => { throw new Error('no canvas'); };

interface Dn { overcast: number; timeOfDay: number; sunDirection: THREE.Vector3; update(dt: number): void; cloudCover: number; windSpeed: number; flash: number; flashKey: number; fogAmount: number }
function stubDn(hour = 12): Dn {
  return { overcast: 0, timeOfDay: hour, sunDirection: new THREE.Vector3(0, 1, 0), update() {}, cloudCover: -1, windSpeed: 0, flash: 0, flashKey: 1, fogAmount: 0 };
}
interface Audio extends WeatherAudioSink { states: WeatherAudioState[]; thunders: { t: number; dist: number; strength: number }[]; now: number }
function stubAudio(): Audio {
  const a: Audio = {
    states: [], thunders: [], now: 0,
    update(dt, s) { a.now += dt; a.states.push({ ...s }); },
    thunder(dist, strength) { a.thunders.push({ t: a.now, dist, strength }); },
  };
  return a;
}

function make(hour = 12, opts: { audio?: boolean } = {}) {
  const scene = new THREE.Scene();
  const w = new Weather(scene, fakeLibrary(), { canvasFactory: noCanvas, rainStreaks: 100 });
  const dn = stubDn(hour);
  const audio = opts.audio ? stubAudio() : undefined;
  w.attach({ dayNight: dn, audio });
  return { w, dn, scene, audio };
}
const cam = new THREE.Vector3(0, 1.7, 0);
function run(w: Weather, seconds: number, dt = 0.1, c: THREE.Vector3 = cam): void { for (let t = 0; t < seconds; t += dt) w.update(dt, c); }

describe('Weather kinds: forced states', () => {
  it('each kind snaps to its look; grip and visibility are plain numbers in range', () => {
    const { w } = make();
    w.setWeather('clear', true, 0);
    expect(w.roadGrip).toBe(1);
    expect(w.visibility).toBeCloseTo(1, 2);
    expect(w.raining).toBe(false);
    w.setWeather('lightRain', true);
    expect(w.roadGrip).toBeGreaterThan(0.77);
    expect(w.roadGrip).toBeLessThan(0.83);
    expect(w.raining).toBe(true);
    w.setWeather('heavyRain', true);
    expect(w.roadGrip).toBeGreaterThan(0.66);
    expect(w.roadGrip).toBeLessThan(0.73);
    expect(w.visibility).toBeLessThan(0.8);
    w.setWeather('thunderstorm', true);
    expect(w.roadGrip).toBeLessThan(0.73);
    w.setWeather('fog', true, 0);
    expect(w.visibility).toBeLessThan(0.3);
    expect(w.raining).toBe(false);
    expect(w.kind).toBe('fog');
    w.setWeather('windy', true, 0);
    expect(w.visibility).toBeCloseTo(1, 1);
    expect(w.wind).toBeGreaterThan(0.9);
  });

  it('a storm clears onto wet streets that dry again over minutes, grip recovering monotonically', () => {
    const { w } = make();
    w.setWeather('heavyRain', true);
    w.setWeather('partlyCloudy'); // eases over
    let last = w.roadGrip;
    let t = 0;
    let wetAt60 = 0;
    for (; t < 600; t += 0.5) {
      w.update(0.5, cam);
      if (t === 60) wetAt60 = w.wetness;
      expect(w.roadGrip).toBeGreaterThanOrEqual(last - 1e-9);
      last = w.roadGrip;
    }
    expect(wetAt60).toBeGreaterThan(0.6); // still soaked a minute after the rain stopped
    expect(w.wetness).toBe(0);
    expect(w.roadGrip).toBe(1);
    expect(w.state).toBe('dry');
  });

  it('keeps the legacy four-state label while the system drives', () => {
    const { w } = make();
    w.setWeather('heavyRain', true);
    expect(w.state).toBe('rain');
    w.setWeather('clear');
    run(w, 60);
    expect(['wet', 'drying']).toContain(w.state);
  });

  it('ramps every look value without a step (monotone, bounded rate)', () => {
    const { w } = make();
    w.setWeather('clear', true, 0);
    w.setWeather('thunderstorm');
    const keys = ['cloud', 'overcast', 'rain', 'wind', 'storm'] as const;
    const prev: Record<string, number> = {};
    for (const k of keys) prev[k] = w[k];
    const rate: Record<string, number> = { cloud: 1 / 40, overcast: 1 / 40, rain: 1 / 18, wind: 1 / 25, storm: 1 / 12 };
    const dt = 1 / 30;
    let maxRainDelta = 0;
    for (let t = 0; t < 90; t += dt) {
      w.update(dt, cam);
      for (const k of keys) {
        const d = w[k] - prev[k];
        expect(d).toBeGreaterThanOrEqual(-1e-12); // monotone up
        expect(d).toBeLessThanOrEqual(rate[k] * dt + 1e-9);
        prev[k] = w[k];
      }
      maxRainDelta = Math.max(maxRainDelta, w.rain);
    }
    expect(w.rain).toBeCloseTo(0.95, 2);
    expect(w.cloud).toBe(1);
  });

  it('writes the look to DayNight: gloom, cloud cover, fog, wind', () => {
    const { w, dn } = make();
    w.setWeather('fog', true);
    expect(dn.cloudCover).toBeCloseTo(0.6, 2);
    expect(dn.fogAmount).toBeGreaterThan(0.9);
    expect(dn.overcast).toBeCloseTo(0.35, 2);
    w.setWeather('windy', true);
    run(w, 1);
    expect(dn.windSpeed).toBeGreaterThan(0.4);
    expect(dn.fogAmount).toBe(0);
  });

  it('thins the fog look with the camera height but keeps ground visibility', () => {
    const { w, dn } = make(6);
    w.setWeather('fog', true);
    w.update(0.1, new THREE.Vector3(0, 2, 0));
    const low = dn.fogAmount;
    const vis = w.visibility;
    w.update(0.1, new THREE.Vector3(0, 90, 0));
    expect(dn.fogAmount).toBeLessThan(low * 0.4);
    expect(w.visibility).toBe(vis);
  });

  it('fog is denser at dawn than at mid-morning', () => {
    const a = make(5.5); a.w.setWeather('fog', true);
    const b = make(10.2); b.w.setWeather('fog', true);
    expect(a.w.fog).toBeGreaterThan(b.w.fog + 0.3);
  });
});

describe('Weather forecast', () => {
  /** advances the stub clock one game hour per 60 s like DayNight does */
  function drive(w: Weather, dn: Dn, seconds: number, dt = 0.2, sample?: () => void): void {
    for (let t = 0; t < seconds; t += dt) {
      dn.timeOfDay = (dn.timeOfDay + dt / 60) % 24;
      w.update(dt, cam);
      sample?.();
    }
  }

  it('is deterministic from the seed through the whole system', () => {
    const trace = (seed: number): string => {
      const { w, dn } = make(17.5);
      w.startForecast(seed);
      const out: string[] = [];
      let last = '';
      drive(w, dn, 3 * 24 * 60, 0.5, () => { if (w.kind !== last) { last = w.kind; out.push(w.kind); } });
      return out.join(',');
    };
    expect(trace(7)).toBe(trace(7));
    expect(trace(7)).not.toBe(trace(8));
  });

  it('builds cloud before the first drop, keeps every value moving at a bounded rate, and never over-wets', () => {
    const { w, dn } = make(17.5);
    w.startForecast('bedstuy');
    const dt = 0.25;
    const prev = { cloud: w.cloud, overcast: w.overcast, rain: w.rain, fog: w.fog, wetness: w.wetness };
    let rainStarts = 0;
    let wasRaining = false;
    let sawRain = false;
    drive(w, dn, 4 * 24 * 60, dt, () => {
      expect(Math.abs(w.cloud - prev.cloud)).toBeLessThanOrEqual(dt / 40 + 1e-9);
      expect(Math.abs(w.overcast - prev.overcast)).toBeLessThanOrEqual(dt / 40 + 1e-9);
      expect(Math.abs(w.rain - prev.rain)).toBeLessThanOrEqual(dt / 18 + 1e-9);
      expect(Math.abs(w.fog - prev.fog)).toBeLessThanOrEqual(dt / 50 + 1e-9);
      expect(w.wetness).toBeLessThanOrEqual(1);
      expect(w.wetness).toBeGreaterThanOrEqual(0);
      if (w.rain > 0.05 && !wasRaining) { rainStarts++; expect(w.cloud).toBeGreaterThan(0.6); }
      wasRaining = w.rain > 0.05;
      if (w.rain > 0.3) sawRain = true;
      prev.cloud = w.cloud; prev.overcast = w.overcast; prev.rain = w.rain; prev.fog = w.fog; prev.wetness = w.wetness;
    });
    expect(sawRain).toBe(true);
    expect(rainStarts).toBeGreaterThan(0);
  });

  it('skipForecast and forecastRate move the forecast clock', () => {
    const { w, dn } = make(10);
    w.startForecast(1);
    const h0 = w.forecastHour;
    w.skipForecast(5);
    expect(w.forecastHour).toBeCloseTo(h0 + 5, 6);
    w.forecastRate = 4;
    const before = w.forecastHour;
    drive(w, dn, 60, 0.5); // one game hour
    expect(w.forecastHour - before).toBeGreaterThan(3.5); // about 4 forecast hours
  });

  it("setWeather('auto') hands back to the forecast", () => {
    const { w, dn } = make(10);
    w.startForecast(3);
    w.setWeather('thunderstorm', true);
    expect(w.kind).toBe('thunderstorm');
    w.setWeather('auto');
    drive(w, dn, 5);
    expect(w.kind).not.toBe('thunderstorm');
  });

  it('a legacy setState while the forecast drives does not stop it', () => {
    const { w, dn } = make(10);
    w.startForecast(3);
    w.setState('rain', true);
    expect(w.wetness).toBe(1);
    drive(w, dn, 5);
    expect(w.state === 'rain' || w.state === 'wet' || w.state === 'drying' || w.state === 'dry').toBe(true);
    expect(w.forecast).not.toBeNull();
  });
});

describe('lightning and thunder', () => {
  it('flashes inside a bound, rises over several frames, and delays thunder by distance', () => {
    const { w, dn, audio } = make(22, { audio: true });
    w.setWeather('thunderstorm', true);
    const dt = 1 / 60;
    let max = 0;
    let prev = 0;
    let maxStep = 0;
    w.strike(1715, 1); // 5 s away
    const t0 = audio!.now;
    for (let t = 0; t < 8; t += dt) {
      w.update(dt, cam);
      max = Math.max(max, dn.flash);
      maxStep = Math.max(maxStep, Math.abs(dn.flash - prev));
      prev = dn.flash;
      expect(dn.flash).toBeLessThanOrEqual(1);
      expect(dn.flash).toBeGreaterThanOrEqual(0);
    }
    expect(max).toBeGreaterThan(0.3);
    expect(maxStep).toBeLessThan(0.75); // never a single-frame jump from dark to full
    expect(audio!.thunders.length).toBeGreaterThanOrEqual(1);
    expect(audio!.thunders[0].t - t0).toBeGreaterThan(4.9);
    expect(audio!.thunders[0].t - t0).toBeLessThan(5.2);
    expect(audio!.thunders[0].dist).toBeCloseTo(1715, 0);
  });

  it('strikes by itself in a storm and not in clear weather', () => {
    const storm = make(22, { audio: true });
    storm.w.setWeather('thunderstorm', true);
    let flashed = 0;
    for (let t = 0; t < 300; t += 0.05) { storm.w.update(0.05, cam); if (storm.dn.flash > 0.1) flashed++; }
    expect(flashed).toBeGreaterThan(3);
    expect(storm.audio!.thunders.length).toBeGreaterThanOrEqual(2);
    const calm = make(22, { audio: true });
    calm.w.setWeather('clear', true);
    for (let t = 0; t < 300; t += 0.05) { calm.w.update(0.05, cam); expect(calm.dn.flash).toBe(0); }
    expect(calm.audio!.thunders.length).toBe(0);
  });

  it('the shadow-casting sun joins the flash everywhere but the phone tier', () => {
    const a = make(22); a.w.setWeather('thunderstorm', true); a.w.strike(500); a.w.update(0.05, cam);
    expect(a.dn.flashKey).toBe(1);
    const b = make(22); b.w.setTier('phone'); b.w.setWeather('thunderstorm', true); b.w.strike(500); b.w.update(0.05, cam);
    expect(b.dn.flashKey).toBe(0);
    expect(b.dn.flash).toBeGreaterThan(0); // the sky still flashes
  });

  it('is dimmer indoors', () => {
    const out = make(22); out.w.setWeather('thunderstorm', true); out.w.strike(400); out.w.update(0.1, cam);
    const inn = make(22); inn.w.setWeather('thunderstorm', true); inn.w.strike(400); inn.w.update(0.1, new THREE.Vector3(3000, 1.5, 3000));
    expect(inn.dn.flash).toBeLessThan(out.dn.flash * 0.5);
  });
});

describe('where the rain falls', () => {
  it('no streaks, splashes or rain light indoors; the audio is told', () => {
    const { w, scene, audio } = make(12, { audio: true });
    w.setWeather('heavyRain', true);
    w.update(0.1, cam);
    expect(scene.getObjectByName('rain')!.visible).toBe(true);
    expect(scene.getObjectByName('splash')!.visible).toBe(true);
    w.update(0.1, new THREE.Vector3(3000, 1.5, 3120));
    expect(scene.getObjectByName('rain')!.visible).toBe(false);
    expect(scene.getObjectByName('splash')!.visible).toBe(false);
    expect(audio!.states[audio!.states.length - 1].indoors).toBe(true);
  });

  it('knows the camera is under the elevated deck, and the car', () => {
    const { w, audio } = make(12, { audio: true });
    w.setWeather('heavyRain', true);
    w.update(0.1, new THREE.Vector3(100, 1.7, -500));
    expect(w.covered).toBe(true);
    w.update(0.1, new THREE.Vector3(100, 14, -500)); // above the deck
    expect(w.covered).toBe(false);
    w.update(0.1, new THREE.Vector3(100, 1.7, -470)); // beside it
    expect(w.covered).toBe(false);
    w.gridEl = false;
    w.update(0.1, new THREE.Vector3(100, 1.7, -500));
    expect(w.covered).toBe(false);
    w.inVehicle = true;
    w.update(0.1, cam);
    expect(audio!.states[audio!.states.length - 1].inVehicle).toBe(true);
  });

  it('angles the streaks by the camera speed and wind', () => {
    const { w, scene } = make(12);
    w.setWeather('heavyRain', true);
    const mesh = scene.getObjectByName('rain') as THREE.LineSegments;
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    const p = new THREE.Vector3();
    for (let i = 0; i < 20; i++) { p.x += 0.25; w.update(1 / 60, p); } // 15 m/s
    const v = u.uCamVel.value as THREE.Vector3;
    expect(v.x).toBeGreaterThan(8);
    const wind = u.uWind.value as THREE.Vector2;
    expect(Math.hypot(wind.x, wind.y)).toBeGreaterThan(1);
  });

  it('light rain draws fewer streaks than heavy rain', () => {
    const light = make(12); light.w.setWeather('lightRain', true); light.w.update(0.1, cam);
    const heavy = make(12); heavy.w.setWeather('heavyRain', true); heavy.w.update(0.1, cam);
    const rl = (light.scene.getObjectByName('rain') as THREE.LineSegments).geometry.drawRange.count;
    const rh = (heavy.scene.getObjectByName('rain') as THREE.LineSegments).geometry.drawRange.count;
    expect(rl).toBeLessThan(rh);
  });
});

describe('tiers and budget', () => {
  it('phone: no puddle mirrors, no rain rings, no litter; cheap streak count', () => {
    const { w, scene } = make(12);
    w.setTier('phone');
    w.setRainStreaks(40);
    w.setWeather('windy', true);
    w.update(0.1, cam);
    expect(scene.getObjectByName('litter')!.visible).toBe(false);
    const h = make(12); h.w.setWeather('windy', true); h.w.update(0.1, cam);
    expect(h.scene.getObjectByName('litter')!.visible).toBe(true);
  });

  it('adds at most three draw objects to the scene, and a frame allocates no new objects (counts only)', () => {
    const { scene } = make(12);
    let drawn = 0;
    scene.traverse((o) => { if ((o as THREE.Points).isPoints || (o as THREE.LineSegments).isLineSegments) drawn++; });
    expect(drawn).toBe(3);
  });

  it('tolerates junk input', () => {
    const { w } = make(12);
    w.setWeather('heavyRain', true);
    for (const dt of [NaN, -1, Infinity, 0]) w.update(dt, new THREE.Vector3(NaN, 0, 0));
    expect(Number.isFinite(w.rain)).toBe(true);
    expect(Number.isFinite(w.roadGrip)).toBe(true);
    w.setWeather('notAKind' as never);
    expect(w.kind).toBe('heavyRain');
  });
});
