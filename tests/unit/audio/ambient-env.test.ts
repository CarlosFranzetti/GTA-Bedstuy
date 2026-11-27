// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HUM_LOOP_SECONDS, NOISE_LOOP_SECONDS, foldLoop, legacyPink, legacyWhite, loopOffset, seamStats, seamlessPink, seamlessWhite } from '@/audio/ambient/noise';
import { SourceMutes, AMBIENT_SOURCES, sourceMutes } from '@/audio/ambient/mutes';
import { CityBed } from '@/audio/ambient/CityBed';
import { AudioDebug, audioDebugWanted } from '@/audio/ambient/AudioDebug';
import { WeatherAudio } from '@/audio/weather/WeatherAudio';
import { newWeatherAudioState } from '@/audio/weather/mix';
import { VehicleAudio } from '@/audio/vehicle/VehicleAudio';
import { TrainAudio } from '@/transit/TrainAudio';
import { RecCtx } from './fakeWebAudio';

const lcg = (seed: number) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const SR = 8000;
function autocorr(x: Float32Array, lagSec: number): number {
  const lag = Math.round(lagSec * SR); let s = 0, a = 0, b = 0;
  for (let i = 0; i + lag < x.length; i++) { s += x[i] * x[i + lag]; a += x[i] * x[i]; b += x[i + lag] * x[i + lag]; }
  return s / Math.sqrt(a * b + 1e-30);
}
const rms = (x: Float32Array, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

describe('seamless noise loops', () => {
  it('foldLoop shortens by the fade and keeps short inputs whole', () => {
    expect(foldLoop(new Float32Array(1000), 100).length).toBe(900);
    expect(foldLoop(new Float32Array(100), 100).length).toBe(100);
    expect(foldLoop(new Float32Array(100), 0).length).toBe(100);
  });
  it('pink loop: no step at the seam (the old 2 s cut loop had one), no repeat at 1 s or 2 s, an exact repeat at its own length', () => {
    const old = legacyPink(2, SR, lcg(3)), now = seamlessPink(HUM_LOOP_SECONDS, SR, lcg(3));
    expect(now.length).toBe(HUM_LOOP_SECONDS * SR);
    const seams = [seamStats(old).seamZ];
    for (let s = 4; s < 9; s++) seams.push(seamStats(seamlessPink(HUM_LOOP_SECONDS, SR, lcg(s))).seamZ);
    // the old cut seam is an ordinary random pair of samples, many times a pink step; the folded seam is as smooth as the rest
    expect(Math.max(...seams.slice(1))).toBeLessThan(4);
    expect(Math.abs(now[0] - now[now.length - 1])).toBeLessThan(seamStats(now).maxStep);
    expect(autocorr(now, 1)).toBeLessThan(0.1);
    expect(autocorr(now, 2)).toBeLessThan(0.1);
    const twice = new Float32Array(now.length * 2); twice.set(now); twice.set(now, now.length);
    expect(autocorr(twice, HUM_LOOP_SECONDS)).toBeGreaterThan(0.99);
  });
  it('white loop keeps its level across the crossfade (equal power) and is as long as asked', () => {
    const w = seamlessWhite(NOISE_LOOP_SECONDS, SR, lcg(5));
    expect(w.length).toBe(NOISE_LOOP_SECONDS * SR);
    const fade = Math.floor(SR * 0.35);
    const all = rms(w, fade * 2, w.length - fade * 2), head = rms(w, 0, fade);
    expect(Math.abs(20 * Math.log10(head / all))).toBeLessThan(1.5);
    for (const v of w) expect(Math.abs(v)).toBeLessThanOrEqual(1.42); // two independent noises at equal power can add to root two
    expect(legacyWhite(1, SR, lcg(1)).length).toBe(SR);
  });
  it('the entry offset stays inside the loop', () => {
    expect(loopOffset(6, 0)).toBe(0);
    expect(loopOffset(6, 0.5)).toBeCloseTo(3, 9);
    expect(loopOffset(6, 1)).toBeLessThan(6);
    expect(loopOffset(6, -2)).toBe(0);
  });
});

describe('source mutes', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('reads a comma list from the address, ignores unknown names, and `all` and `none` work', () => {
    const a = new SourceMutes('?mute=hum,weather,nonsense');
    expect(a.list().sort()).toEqual(['hum', 'weather']);
    expect(a.gain('hum')).toBe(0); expect(a.gain('wash')).toBe(1);
    expect(new SourceMutes('?mute=all').list().length).toBe(AMBIENT_SOURCES.length);
    expect(new SourceMutes('?mute=none').any).toBe(false);
    expect(new SourceMutes('').any).toBe(false);
  });
  it('remembers the choice, lets the address replace it, and tells listeners', () => {
    const st = mem();
    const a = new SourceMutes('', st); const seen: string[] = [];
    a.onChange((id, on) => seen.push(`${id}:${on}`));
    a.toggle('birds'); a.set('birds', true); a.set('kids', true);
    expect(seen).toEqual(['birds:true', 'kids:true']);
    expect(new SourceMutes('', st).list().sort()).toEqual(['birds', 'kids']);
    expect(new SourceMutes('?mute=road', st).list()).toEqual(['road']);
    expect(new SourceMutes('', st).list()).toEqual(['road']);
    expect(new SourceMutes('?mute=none', st).any).toBe(false);
  });
  it('survives a storage that throws', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const a = new SourceMutes('', bad as unknown as Storage);
    expect(() => a.set('hum', true)).not.toThrow();
    expect(a.muted('hum')).toBe(true);
  });
});

describe('CityBed', () => {
  it('builds the hum graph, enters the loop at an offset, mutes the hum and the crickets separately, crossfades day and night with ramps', () => {
    const ctx = new RecCtx(); const m = new SourceMutes('');
    const bed = new CityBed(ctx as unknown as BaseAudioContext, new RecNodeLike(ctx) as unknown as AudioNode, { night: false, random: lcg(9), mutes: m });
    const srcs = ctx.nodes.filter((n) => n.kind === 'src');
    expect(srcs.length).toBe(1);
    expect(srcs[0].loop).toBe(true);
    expect(bed.dayGain.gain.value).toBeGreaterThan(0); expect(bed.nightGain.gain.value).toBe(0);
    const gates = () => ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.value === 1 || n.kind === 'gain' && n.gain.value === 0).length;
    expect(gates()).toBeGreaterThan(0);
    const before = ctx.writes;
    bed.setNight(true);
    expect(ctx.writes - before).toBe(2);
    expect(ctx.bad).toEqual([]);
    m.set('hum', true);
    expect((bed as unknown as { humGate: { gain: { value: number } } }).humGate.gain.value).toBe(0);
    m.set('crickets', true);
    expect((bed as unknown as { cricketGate: { gain: { value: number } } }).cricketGate.gain.value).toBe(0);
    bed.dispose();
    expect(ctx.nodes.filter((n) => n.kind === 'src' || n.kind === 'osc').every((n) => n.stopped)).toBe(true);
  });
});
class RecNodeLike { constructor(public ctx: RecCtx) {} connect(d: unknown) { return d; } disconnect() { /* noop */ } }

describe('weather parameter writes', () => {
  it('writes the mix at most 20 times a second, and not at all while nothing moves (it was every parameter on every frame)', () => {
    const ctx = new RecCtx();
    const w = new WeatherAudio(() => ({ ctx: ctx as unknown as BaseAudioContext, dest: new RecNodeLike(ctx) as unknown as AudioNode }));
    const s = newWeatherAudioState(); s.rain = 0.8; s.wind = 0.6;
    for (let i = 0; i < 60 * 12; i++) { ctx.currentTime += 1 / 60; w.update(1 / 60, s); }
    const startup = ctx.writes;
    for (let i = 0; i < 60 * 10; i++) { ctx.currentTime += 1 / 60; s.gust = 0.5 + 0.4 * Math.sin(i / 40); w.update(1 / 60, s); }
    const perSec = (ctx.writes - startup) / 10;
    expect(perSec).toBeLessThan(60);
    // a still sky: zero writes
    const still = ctx.writes;
    s.gust = 0.5;
    for (let i = 0; i < 60 * 5; i++) { ctx.currentTime += 1 / 60; w.update(1 / 60, s); }
    expect(ctx.writes - still).toBeLessThan(30);
    expect(ctx.bad).toEqual([]);
  });
  it('a muted weather bed aims every level at zero and plays no thunder', () => {
    const ctx = new RecCtx();
    const w = new WeatherAudio(() => ({ ctx: ctx as unknown as BaseAudioContext, dest: new RecNodeLike(ctx) as unknown as AudioNode }));
    const s = newWeatherAudioState(); s.rain = 0.9; s.wind = 0.8; s.storm = 1;
    sourceMutes.set('weather', true);
    try {
      w.update(0.1, s); ctx.currentTime += 0.1; w.update(0.1, s);
      expect(w.active).toBe(false); // nothing audible: nothing built
      const n = ctx.nodes.length; w.thunder(500, 1);
      expect(ctx.nodes.length).toBe(n);
    } finally { sourceMutes.set('weather', false); }
  });
});

describe('vehicle layer sources', () => {
  function vehicle() { const ctx = new RecCtx(); const v = new VehicleAudio(lcg(4)); v.attach(ctx as unknown as BaseAudioContext, new RecNodeLike(ctx) as unknown as AudioNode, ctx.createBuffer(1, SR * NOISE_LOOP_SECONDS) as unknown as AudioBuffer); v.setEngineEnabled(false); return { ctx, v }; }
  const run = (v: VehicleAudio, ctx: RecCtx, secs: number, hz: number) => { for (let i = 0; i < secs * hz; i++) { ctx.currentTime += 1 / hz; v.update(1 / hz); } };
  afterEach(() => { for (const s of AMBIENT_SOURCES) sourceMutes.set(s.id, false); });

  it('muting footsteps and crosswalk signals stops their one-shots', () => {
    const { ctx, v } = vehicle(); v.setHour(14); v.setFoot(1.6, 0, true);
    const n0 = ctx.nodes.length; run(v, ctx, 4, 60); const walked = ctx.nodes.length - n0;
    expect(walked).toBeGreaterThan(10);
    sourceMutes.set('steps', true);
    const n1 = ctx.nodes.length; run(v, ctx, 4, 60);
    expect(ctx.nodes.length - n1).toBeLessThan(walked / 4); // only birds may still sing
    v.setFoot(0); sourceMutes.set('birds', true); v.setCrosswalk(3, 'walk');
    const n2 = ctx.nodes.length; run(v, ctx, 2, 60); const ticked = ctx.nodes.length - n2;
    expect(ticked).toBeGreaterThan(5);
    sourceMutes.set('signals', true);
    const n3 = ctx.nodes.length; run(v, ctx, 2, 60);
    expect(ctx.nodes.length - n3).toBe(0);
  });
  it('the crosswalk tick keeps its rate at any frame rate (it ran 5 to 8 percent slow before)', () => {
    const counts = [60, 30, 15].map((hz) => { const { ctx, v } = vehicle(); v.setHour(0); v.setCrosswalk(3, 'walk'); run(v, ctx, 1, hz); const n0 = ctx.nodes.length; run(v, ctx, 20, hz); return ctx.nodes.length - n0; });
    const ideal = 20 / 0.125;
    for (const c of counts) expect(c / (counts[0] / ideal)).toBeGreaterThan(ideal * 0.97);
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(1.04);
  });
  it('every looped bed of the vehicle layer enters the shared noise at its own offset', () => {
    const { ctx, v } = vehicle(); v.setType('sedan'); v.setDrive(14, 0.3, true); v.update(0.016);
    const starts: unknown[] = [];
    for (const n of ctx.nodes) if (n.kind === 'src' && n.loop) starts.push(n);
    expect(starts.length).toBeGreaterThanOrEqual(5);
  });
  it('the road beds go quiet when muted', () => {
    const { ctx, v } = vehicle(); v.setType('sedan'); v.setDrive(14, 0.3, true); v.setHour(14);
    run(v, ctx, 2, 60);
    const roll = (v as unknown as { roll: { g: { gain: { events: { v: number; t: number }[]; value: number } } } }).roll.g.gain;
    const lastNonZero = roll.value;
    expect(lastNonZero).toBeGreaterThan(0);
    sourceMutes.set('road', true); run(v, ctx, 2, 60);
    expect(roll.value).toBe(0);
  });
});

describe('TrainAudio', () => {
  const st = { active: true, x: 0, dir: 1 as const, speed: 10, accel: 0, phase: 'run' as const, station: -1, doors: 0 };
  it('loops a 5 s seamless noise, and a still train costs no parameter writes', () => {
    const ctx = new RecCtx();
    const a = new TrainAudio(ctx as unknown as AudioContext, new RecNodeLike(ctx) as unknown as AudioNode);
    a.update('t1', st as never, 100);
    const buf = (a as unknown as { noise: { length: number; getChannelData(c: number): Float32Array } }).noise;
    expect(buf.length).toBe(5 * ctx.sampleRate);
    expect(Math.abs(buf.getChannelData(0)[0] - buf.getChannelData(0)[buf.length - 1])).toBeLessThan(seamStats(buf.getChannelData(0)).maxStep);
    const w0 = ctx.writes;
    for (let i = 0; i < 120; i++) { ctx.currentTime += 1 / 60; a.update('t1', st as never, 100); }
    expect(ctx.writes - w0).toBeLessThan(10);
    expect(ctx.bad).toEqual([]);
  });
});

describe('AudioDebug', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
  it('is wanted only with debug=audio', () => {
    expect(audioDebugWanted('?debug=audio')).toBe(true);
    expect(audioDebugWanted('?debug=mem,audio')).toBe(true);
    expect(audioDebugWanted('?debug=mem')).toBe(false);
    expect(audioDebugWanted('')).toBe(false);
  });
  it('logs a callback that ran more than 100 ms late and not one that ran 40 ms late', () => {
    const d = new AudioDebug(new SourceMutes(''), null);
    d.beat(50, 90, 1); d.beat(50, 160, 2); d.beat(50, 700, 3);
    expect(d.late.map((l) => l.ms)).toEqual([110, 650]);
  });
  it('draws a panel with the context facts and a button per source that toggles its mute', () => {
    vi.useFakeTimers();
    let wall = 0; const m = new SourceMutes('');
    const d = new AudioDebug(m, document, () => wall);
    const ctx = Object.assign(new RecCtx(), { baseLatency: 0.01, outputLatency: 0.04 });
    d.attach(ctx as unknown as BaseAudioContext);
    wall = 1000; vi.advanceTimersByTime(300);
    const el = document.querySelector('[data-audio-debug]') as HTMLElement;
    expect(el.textContent).toContain('running');
    expect(el.textContent).toContain('base 10.0 ms');
    expect(el.textContent).toContain('output 40.0 ms');
    const btns = el.querySelectorAll('button');
    expect(btns.length).toBe(AMBIENT_SOURCES.length);
    (btns[0] as HTMLButtonElement).click();
    expect(m.muted(AMBIENT_SOURCES[0].id)).toBe(true);
    expect(el.querySelectorAll('button')[0].textContent).toContain('[x]');
    d.dispose();
    expect(document.querySelector('[data-audio-debug]')).toBeNull();
  });
});
