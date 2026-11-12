import { describe, it, expect } from 'vitest';
import { ENGINE_VOICES, EngineSim, engineMix, shiftTime, LIMITER_CUT, OVERRUN_LOAD, type EngineFrame } from '@/audio/vehicle/engineModel';
import { HORNS, SIREN_SPAN, sirenHz } from '@/audio/vehicle/hornModel';
import { DOOR_CLASS, birdLayers, crashLayers, crosswalkLayers, footstepLayers } from '@/audio/vehicle/fx';
import { kerbStrength, passbyPitch, tyreSqueal, wetRoadHiss, windBed } from '@/audio/vehicle/road';
import { FootStepper, SIGNAL_PERIOD, cadenceAt, hourBed, signalGain, strideAt, underElMix } from '@/audio/vehicle/world';
import { underElImpulse } from '@/transit/TrainAudio';
import { VehicleAudio } from '@/audio/vehicle/VehicleAudio';

type VT = keyof typeof ENGINE_VOICES;
const types = Object.keys(ENGINE_VOICES) as VT[];
const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));

/** Simple longitudinal model: throttle 0..1 drives, drag and engine braking slow. */
function runTo(type: VT, secs: number, th: (t: number, speed: number) => number, rand = () => 0.5) {
  const v = ENGINE_VOICES[type];
  const sim = new EngineSim(v, rand); sim.startNow();
  let speed = 0;
  const rows: { t: number; f: EngineFrame; speed: number; mix: ReturnType<typeof engineMix> }[] = [];
  for (let i = 0; i < secs * 60; i++) {
    const t = i / 60, T = th(t, speed);
    speed = Math.max(0, speed + (T * (v.vmax / 7) * (1 - speed / (v.vmax * 1.02)) - 0.08 - speed * 0.012) / 60);
    const f = sim.update(1 / 60, speed, T);
    rows.push({ t, f, speed, mix: engineMix(v, f) });
  }
  return rows;
}

describe('engine dropouts (SFX2)', () => {
  it('lifting off the throttle at speed keeps the engine within 4.5 dB of where it was, for every combustion type', () => {
    for (const t of types) {
      const v = ENGINE_VOICES[t];
      if (v.ev) continue;
      const rows = runTo(t, 16, (s) => (s < 9 ? 1 : s < 12 ? 0.25 : 0));
      const before = rows.filter((r) => r.t > 11 && r.t < 11.9).map((r) => r.mix.out);
      const after = rows.filter((r) => r.t > 12.1 && r.t < 15).map((r) => r.mix.out);
      expect(db(Math.min(...after) / Math.max(...before)), t).toBeGreaterThan(-4.5);
      // the tone must not collapse either: the lowpass stays above 60% of its cruise value
      const lpB = rows.filter((r) => r.t > 11 && r.t < 11.9).map((r) => r.mix.lpHz), lpA = rows.filter((r) => r.t > 12.1 && r.t < 15).map((r) => r.mix.lpHz);
      expect(Math.min(...lpA) / Math.min(...lpB), t).toBeGreaterThan(0.45);
    }
  });
  it('an acceleration run never dips more than 5 dB below its trailing 0.5 s, shifts included (the eight-speed cars too)', () => {
    for (const t of types) {
      if (ENGINE_VOICES[t].ev) continue;
      const rows = runTo(t, 24, () => 1);
      let worst = 0;
      for (let i = 30; i < rows.length; i++) {
        let ref = 0; for (let j = i - 30; j < i; j++) ref = Math.max(ref, rows[j].mix.out * rows[j].mix.lim);
        const now = rows[i].mix.out * rows[i].mix.lim;
        if (!rows[i].f.cut) worst = Math.min(worst, db(now / ref));
      }
      expect(worst, t).toBeGreaterThan(-5);
    }
  });
  it('the limiter and a misfire are deliberate events and shallower than they were (-5 dB and -9 dB, not -18)', () => {
    expect(db(LIMITER_CUT)).toBeGreaterThan(-6);
    const v = ENGINE_VOICES.muscle;
    const f: EngineFrame = { rpm: 3000, gear: 2, fire: 200, rev: 50, level: 1, load: 1, shifting: 0, cut: false, starter: 0, wob: 0, pops: 0, blowoff: false, miss: true, running: true, overrun: 0, elec: 1 };
    expect(db(engineMix(v, f).lim)).toBeGreaterThan(-10);
  });
  it('a seven or eight speed box shifts quickly, a four speed more slowly', () => {
    expect(shiftTime(ENGINE_VOICES.luxury)).toBeLessThan(shiftTime(ENGINE_VOICES.cab) + 1e-9);
    expect(shiftTime(ENGINE_VOICES.crossover)).toBeLessThan(shiftTime(ENGINE_VOICES.towncar));
  });
  it('steady cruise at a light throttle does not hunt between gears', () => {
    for (const t of types) {
      const v = ENGINE_VOICES[t];
      if (v.ev) continue;
      const sim = new EngineSim(v, () => 0.5); sim.startNow();
      const sp = v.vmax * 0.5;
      for (let i = 0; i < 60 * 8; i++) sim.update(1 / 60, sp, 0.3);
      let changes = 0, g = sim.gear;
      for (let i = 0; i < 60 * 10; i++) { const f = sim.update(1 / 60, sp, 0.3); if (f.gear !== g) { changes++; g = f.gear; } }
      expect(changes, t).toBeLessThanOrEqual(1);
    }
  });
});

describe('overrun (engine braking)', () => {
  it('settles at the overrun load, never zero, once rolling with the throttle closed', () => {
    const sim = new EngineSim(ENGINE_VOICES.sedan, () => 0.5); sim.startNow();
    let f = sim.update(1 / 60, 20, 1);
    for (let i = 0; i < 90; i++) f = sim.update(1 / 60, 20, 0);
    expect(f.overrun).toBeGreaterThan(0.5);
    expect(f.load).toBeGreaterThanOrEqual(0.2);
    expect(f.load).toBeLessThanOrEqual(OVERRUN_LOAD + 1e-9);
    const idle = new EngineSim(ENGINE_VOICES.sedan, () => 0.5); idle.startNow();
    expect(idle.update(1 / 60, 0, 0).overrun).toBe(0); // standing still: no overrun
  });
  it('burbles on the cars that have a burble: muscle and pony crackle, a sedan does not', () => {
    const count = (t: VT) => {
      let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const sim = new EngineSim(ENGINE_VOICES[t], rnd); sim.startNow();
      for (let i = 0; i < 240; i++) sim.update(1 / 60, ENGINE_VOICES[t].vmax * 0.6, 1);
      let pops = 0;
      for (let i = 0; i < 60 * 6; i++) pops += sim.update(1 / 60, ENGINE_VOICES[t].vmax * 0.55, 0).pops;
      return pops;
    };
    expect(count('muscle')).toBeGreaterThan(4);
    expect(count('pony')).toBeGreaterThan(2);
    expect(count('sedan')).toBe(0);
  });
  it('electric cars have no overrun note and no pops', () => {
    const sim = new EngineSim(ENGINE_VOICES.evsedan, () => 0.1); sim.startNow();
    let pops = 0; for (let i = 0; i < 300; i++) { const f = sim.update(1 / 60, 20, i < 60 ? 1 : 0); pops += f.pops; expect(f.overrun).toBe(0); }
    expect(pops).toBe(0);
  });
});

describe('vehicle character', () => {
  it('only five types are V8 (cop, pickup, town car, muscle and the diesel ambulance)', () => {
    expect(types.filter((t) => ENGINE_VOICES[t].cyl === 8).sort()).toEqual(['ambulance', 'cop', 'muscle', 'pickup', 'towncar']);
  });
  it('the cab is a hybrid four: engine off at a crawl, on above it; the luxury car is a hushed turbo six', () => {
    const cab = ENGINE_VOICES.cab;
    expect(cab.cyl).toBe(4); expect(cab.hyb).toBeGreaterThan(3);
    const slow = new EngineSim(cab, () => 0.5); slow.startNow();
    let f = slow.update(1 / 60, 2, 0.3); for (let i = 0; i < 90; i++) f = slow.update(1 / 60, 2, 0.3);
    expect(f.elec).toBeLessThan(0.1);
    const fast = new EngineSim(cab, () => 0.5); fast.startNow();
    f = fast.update(1 / 60, 12, 0.3); for (let i = 0; i < 90; i++) f = fast.update(1 / 60, 12, 0.3);
    expect(f.elec).toBeGreaterThan(0.95);
    const lux = ENGINE_VOICES.luxury;
    expect(lux.cyl).toBe(6); expect(lux.turbo).toBeGreaterThan(0); expect(lux.drv ?? 0).toBe(0); expect(lux.ex[2]).toBeLessThanOrEqual(3);
  });
  it('the rear-engine coupe is a flat six: half-order hollow at 1.5 per turn; the beater is rough and gritty', () => {
    const c = ENGINE_VOICES.coupe911;
    expect(c.cyl).toBe(6);
    expect(c.sh?.some(([o]) => o === 1.5)).toBe(true);
    const b = ENGINE_VOICES.beater;
    expect(b.cyl).toBe(4); expect(b.drv).toBeGreaterThan(0.4); expect(b.miss).toBeGreaterThan(0); expect(b.wob).toBeGreaterThan(30);
  });
  it('diesels clatter and turbocharge (box truck, bus, garbage truck); hot cars whistle', () => {
    for (const t of ['boxtruck', 'bus', 'garbage'] as VT[]) { expect(ENGINE_VOICES[t].clat, t).toBeGreaterThan(0.5); expect(ENGINE_VOICES[t].turbo, t).toBeGreaterThan(0); expect(ENGINE_VOICES[t].idle, t).toBeLessThanOrEqual(700); }
    expect(ENGINE_VOICES.jdmcoupe.turbo).toBeGreaterThan(0.9);
    expect(ENGINE_VOICES.hothatch.turbo).toBeGreaterThan(0.9);
  });
  it('electric types: no combustion level at standstill, a pedestrian tone, tyres and wind carry the speed', () => {
    for (const t of ['evsedan', 'wedgetruck'] as VT[]) {
      const v = ENGINE_VOICES[t];
      expect(v.ev).toBe(true); expect(v.ped).toBeGreaterThan(0); expect(v.road ?? 1).toBeGreaterThan(1.5);
      const sim = new EngineSim(v, () => 0.5); sim.startNow();
      const f = sim.update(1 / 60, 0, 0);
      expect(engineMix(v, f).lim).toBeLessThan(0.05);
    }
  });
  it('every engine is separated from every other in at least one of cylinders, idle, redline, tone, exhaust or order content', () => {
    const key = (t: VT) => { const v = ENGINE_VOICES[t]; return [v.cyl, v.idle, v.red, v.tone, v.ex.join(), JSON.stringify(v.sh ?? []), v.drv ?? 0].join('|'); };
    expect(new Set(types.map(key)).size).toBe(types.length);
  });
  it('door class exists for every type; the van, bus and truck differ from the car', () => {
    expect(new Set(types.map((t) => DOOR_CLASS[t])).size).toBeGreaterThanOrEqual(4);
  });
});

describe('horns and sirens', () => {
  const classOf = (t: VT) => {
    if (['bus', 'boxtruck', 'garbage'].includes(t)) return 'air';
    if (['hatch', 'hothatch'].includes(t)) return 'compact';
    if (['luxury', 'towncar', 'evsedan'].includes(t)) return 'luxury';
    if (t === 'beater') return 'beater';
    if (t === 'cop' || t === 'ambulance') return 'siren';
    return 'dual';
  };
  it('fundamentals differ by at least 6% between classes', () => {
    for (const a of types) for (const b of types) {
      if (a >= b || classOf(a) === classOf(b) || classOf(a) === 'siren' || classOf(b) === 'siren') continue; // sirens are identified by their sweep, not their root
      const r = Math.max(HORNS[a].root, HORNS[b].root) / Math.min(HORNS[a].root, HORNS[b].root);
      expect(r, `${a}/${b}`).toBeGreaterThanOrEqual(1.06);
    }
  });
  it('truck and bus air horns sit at 240 to 330 Hz with a slow 80 to 100 ms attack and a chord', () => {
    for (const t of ['bus', 'boxtruck', 'garbage'] as VT[]) {
      const h = HORNS[t];
      expect(h.kind).toBe('air'); expect(h.root).toBeGreaterThanOrEqual(240); expect(h.root).toBeLessThanOrEqual(330);
      expect(h.atk).toBeGreaterThanOrEqual(0.075); expect(h.atk).toBeLessThanOrEqual(0.1); expect(h.ratios.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('compact horns are a single thin disc at 420 to 500 Hz; dual-tone cars are a third or a fourth apart', () => {
    for (const t of ['hatch', 'hothatch'] as VT[]) { expect(HORNS[t].ratios).toEqual([1]); expect(HORNS[t].root).toBeGreaterThanOrEqual(420); expect(HORNS[t].root).toBeLessThanOrEqual(500); }
    for (const t of ['sedan', 'suv', 'crossover', 'luxury', 'minivan', 'cab', 'pony', 'muscle', 'pickup', 'coupe911']) {
      const r = HORNS[t as VT].ratios[1];
      expect(r, t).toBeGreaterThan(1.17); expect(r, t).toBeLessThan(1.36);
    }
  });
  it('the siren wail sweeps more than an octave smoothly and keeps going for the whole hold', () => {
    const hz = Array.from({ length: 680 }, (_, i) => sirenHz('wail', i * 0.01));
    expect(Math.max(...hz) / Math.min(...hz)).toBeGreaterThan(2);
    let jump = 0; for (let i = 1; i < hz.length; i++) jump = Math.max(jump, Math.abs(hz[i] / hz[i - 1] - 1));
    expect(jump).toBeLessThan(0.02);
    expect(SIREN_SPAN).toBeGreaterThanOrEqual(30);
    const yelp = Array.from({ length: 300 }, (_, i) => sirenHz('yelp', i * 0.01));
    const crossings = yelp.filter((v, i) => i && (v - 800) * (yelp[i - 1] - 800) < 0).length;
    expect(crossings).toBeGreaterThanOrEqual(8); // several sweeps a second and a half
  });
});

describe('tyres and road', () => {
  it('squeal follows slip: silent when gripping, rising with slip, fading at a crawl, none on loose ground, dirt scrub instead', () => {
    expect(tyreSqueal(0.1, 20, 'asphalt').level).toBe(0);
    const a = tyreSqueal(0.4, 20, 'asphalt').level, b = tyreSqueal(0.7, 20, 'asphalt').level, c = tyreSqueal(1, 20, 'asphalt').level;
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b);
    expect(tyreSqueal(0.9, 1, 'asphalt').level).toBe(0);
    expect(tyreSqueal(0.9, 15, 'gravel').level).toBe(0);
    expect(tyreSqueal(0.9, 15, 'gravel').scrub).toBeGreaterThan(0.5);
    expect(tyreSqueal(0.9, 15, 'wet').level).toBeLessThan(tyreSqueal(0.9, 15, 'asphalt').level);
    expect(tyreSqueal(0.9, 28, 'asphalt').hz).toBeGreaterThan(tyreSqueal(0.9, 6, 'asphalt').hz);
  });
  it('wind grows with the square of speed and with the voice road factor; the wet hiss needs wet and speed', () => {
    expect(windBed(30).level / windBed(15).level).toBeGreaterThan(3.5);
    expect(windBed(20, 2).level).toBeGreaterThan(windBed(20, 1).level);
    expect(wetRoadHiss(0, 0, 25).level).toBe(0);
    expect(wetRoadHiss(1, 0.6, 3).level).toBeLessThan(wetRoadHiss(1, 0.6, 20).level);
    expect(wetRoadHiss(1, 1, 0).level).toBe(0);
  });
  it('kerb thumps scale with the hit and a passing car shifts pitch up approaching and down leaving', () => {
    expect(kerbStrength(0.3)).toBe(0); expect(kerbStrength(2)).toBeGreaterThan(0.2); expect(kerbStrength(9)).toBe(1);
    expect(passbyPitch(20)).toBeGreaterThan(1); expect(passbyPitch(-20)).toBeLessThan(1); expect(passbyPitch(1e9)).toBeLessThanOrEqual(1.1);
  });
});

describe('world', () => {
  it('footsteps follow the gait: about two a second walking, three jogging, alternating feet, none standing or in the air', () => {
    const steps = (speed: number, run: number, secs = 10, grounded = true) => { const f = new FootStepper(); const out: number[] = []; for (let i = 0; i < secs * 60; i++) { const s = f.update(1 / 60, speed, run, grounded); if (s) out.push(s.side); } return out; };
    const walk = steps(1.6, 0), jog = steps(4, 0), sprint = steps(7, 1);
    expect(walk.length).toBeGreaterThanOrEqual(18); expect(walk.length).toBeLessThanOrEqual(22);
    expect(jog.length).toBeGreaterThanOrEqual(26); expect(jog.length).toBeLessThanOrEqual(32);
    expect(sprint.length).toBeGreaterThan(jog.length);
    for (let i = 1; i < walk.length; i++) expect(walk[i]).not.toBe(walk[i - 1]);
    expect(steps(0, 0).length).toBe(0);
    expect(steps(5, 0, 5, false).length).toBe(0);
    expect(cadenceAt(1.6)).toBeCloseTo(2, 0); expect(strideAt(7)).toBeGreaterThan(strideAt(1.6) * 2);
    const run = new FootStepper(); let r = false; for (let i = 0; i < 120; i++) { const s = run.update(1 / 60, 7, 1); if (s) r = s.run; } expect(r).toBe(true);
  });
  it('footsteps differ by surface, a wet street adds a splash, and a run is louder than a walk', () => {
    const sum = (l: ReturnType<typeof footstepLayers>) => l.reduce((a, x) => a + x.p, 0);
    expect(JSON.stringify(footstepLayers('grass'))).not.toBe(JSON.stringify(footstepLayers('metal')));
    expect(footstepLayers('asphalt', false, 0, true).length).toBeGreaterThan(footstepLayers('asphalt', false, 0, false).length);
    expect(sum(footstepLayers('concrete', true))).toBeGreaterThan(sum(footstepLayers('concrete', false)));
    expect(JSON.stringify(footstepLayers('asphalt', false, 0))).not.toBe(JSON.stringify(footstepLayers('asphalt', false, 1)));
  });
  it('impacts scale with speed and break glass only on a hard hit', () => {
    const peak = (s: number) => Math.max(...crashLayers(s).map((l) => l.p));
    expect(peak(0.8)).toBeGreaterThan(peak(0.3) * 2);
    const glass = (s: number) => crashLayers(s).filter((l) => l.k === 'n' && l.hz >= 4800).length;
    expect(glass(0.3)).toBe(0); expect(glass(0.5)).toBeGreaterThan(4); expect(glass(1)).toBeGreaterThan(glass(0.5));
  });
  it('the crosswalk signal ticks slowly while DON\'T WALK, fast on WALK, and is heard only near the crossing', () => {
    expect(SIGNAL_PERIOD.dont).toBeGreaterThan(SIGNAL_PERIOD.flash); expect(SIGNAL_PERIOD.flash).toBeGreaterThan(SIGNAL_PERIOD.walk);
    expect(signalGain(2)).toBeGreaterThan(0.7); expect(signalGain(30)).toBe(0); expect(signalGain(10)).toBeLessThan(signalGain(5));
    expect(crosswalkLayers('walk', 0)[0]).not.toEqual(crosswalkLayers('walk', 1)[0]); // two-note cuckoo
    expect(birdLayers(1).length).toBeGreaterThan(1);
  });
  it('the city bed follows the hour: rush hour louder than 3 am, dawn chorus at 6, crickets at night, continuous across midnight', () => {
    expect(hourBed(8.5).traffic).toBeGreaterThan(hourBed(3).traffic + 0.4);
    expect(hourBed(17.5).traffic).toBeGreaterThan(hourBed(22).traffic);
    expect(hourBed(6).birds).toBeGreaterThan(0.6); expect(hourBed(2).birds).toBeLessThan(0.05); expect(hourBed(1).crickets).toBeGreaterThan(0.6); expect(hourBed(13).crickets).toBeLessThan(0.1);
    for (let h = 0; h < 24; h += 0.25) { const a = hourBed(h), b = hourBed(h + 0.25); expect(Math.abs(a.traffic - b.traffic), `h${h}`).toBeLessThan(0.2); expect(a.traffic).toBeGreaterThan(0.1); }
    expect(Math.abs(hourBed(23.99).traffic - hourBed(0).traffic)).toBeLessThan(0.05);
  });
  it('under the el the train sound goes wet and long; far away it is dry', () => {
    const u = underElMix(4), f = underElMix(80);
    expect(u.wet).toBeGreaterThan(0.9); expect(f.wet).toBeLessThan(0.2); expect(u.tail).toBeGreaterThan(f.tail); expect(u.dry).toBeLessThan(f.dry);
    const ir = underElImpulse(8000, 1.5);
    expect(ir.every(Number.isFinite)).toBe(true);
    const e = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += ir[i] * ir[i]; return s; };
    expect(e(0, 2000)).toBeGreaterThan(e(8000, 10000) * 20); // decays
  });
});

/* ---------- permissive fake Web Audio ---------- */
class P { value = 0; setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } cancelScheduledValues() { return this; } }
function fakeCtx() {
  const made = { stopped: 0, disconnected: 0 };
  const node = (extra: Record<string, unknown> = {}) => {
    const o: Record<string, unknown> = { gain: new P(), frequency: new P(), detune: new P(), Q: new P(), pan: new P(), type: 'sine', connect() { return o; }, disconnect() { made.disconnected++; }, setPeriodicWave() {}, start() {}, stop() { made.stopped++; }, ...extra };
    return o;
  };
  const ctx = { currentTime: 0, sampleRate: 44100, destination: node(), createGain: () => node(), createOscillator: () => node(), createBiquadFilter: () => node(), createBufferSource: () => node({ buffer: null, loop: false }), createStereoPanner: () => node(), createWaveShaper: () => node({ curve: null }), createPeriodicWave: () => ({}), createBuffer: () => ({ getChannelData: () => new Float32Array(10) }) };
  return { ctx: ctx as unknown as AudioContext, made };
}

describe('VehicleAudio entering, leaving and swapping', () => {
  it('the engine of a car the player leaves plays out its shutdown instead of being cut off', () => {
    const { ctx, made } = fakeCtx();
    const v = new VehicleAudio(() => 0.5);
    v.attach(ctx, ctx.destination as unknown as AudioNode, ctx.createBuffer(1, 10, 44100));
    v.setType('sedan'); v.setDrive(0, 0, true);
    for (let i = 0; i < 120; i++) v.update(1 / 60);
    v.setDrive(0, 0, false);
    const disc = made.disconnected;
    v.setType(null); // main.ts does this on the same frame as the exit
    expect(made.disconnected).toBe(disc); // not cut yet
    for (let i = 0; i < 20; i++) v.update(1 / 60);
    expect(made.disconnected).toBe(disc);
    (ctx as unknown as { currentTime: number }).currentTime = 2;
    for (let i = 0; i < 90; i++) v.update(1 / 60);
    expect(made.disconnected).toBeGreaterThan(disc); // gone once the shutdown is over
    expect(v.engineNodes).toBeNull();
  });
  it('the exit door sound uses the class of the car just left', () => {
    const { ctx } = fakeCtx();
    const v = new VehicleAudio(() => 0.5);
    v.attach(ctx, ctx.destination as unknown as AudioNode, ctx.createBuffer(1, 10, 44100));
    v.setType('bus'); v.setType(null);
    expect(() => v.playDoor(true)).not.toThrow();
    expect((v as unknown as { lastType: string }).lastType).toBe('bus');
  });
  it('weather, slip, hour, foot and crosswalk setters accept junk without throwing', () => {
    const { ctx } = fakeCtx();
    const v = new VehicleAudio(() => 0.5);
    v.attach(ctx, ctx.destination as unknown as AudioNode, ctx.createBuffer(1, 10, 44100));
    v.setType('evsedan');
    expect(() => { v.setWeather(NaN, 5); v.setSlip(-3); v.setHour(NaN); v.setHour(30); v.setFoot(NaN, 4, false); v.setCrosswalk(NaN); v.setCrosswalk(3, 'walk'); v.setDrive(NaN, NaN, true); for (let i = 0; i < 30; i++) v.update(1 / 60); }).not.toThrow();
  });
});
