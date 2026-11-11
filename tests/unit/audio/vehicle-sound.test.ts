import { describe, it, expect } from 'vitest';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { ENGINE_VOICES, EngineSim, engineVoiceFor, firingHz, gearRatios, gearForSpeedOf, pickNearest, rpmAt, distanceGain, dopplerRatio } from '@/audio/vehicle/engineModel';
import { HORNS, HonkLimiter, sirenHz, sirenModeFor } from '@/audio/vehicle/hornModel';
import { DOOR_CLASS, SURFACES, footstepLayers, tyreRoll, crashLayers } from '@/audio/vehicle/fx';
import { TrafficEngines, EngineNodes, playHorn, type TrafficCar } from '@/audio/vehicle/nodes';
import { VehicleAudio } from '@/audio/vehicle/VehicleAudio';

/* ---------- permissive fake Web Audio ---------- */
class P { value = 0; calls = 0; setValueAtTime() { this.calls++; } linearRampToValueAtTime() { this.calls++; } exponentialRampToValueAtTime() { this.calls++; } setTargetAtTime() { this.calls++; } cancelScheduledValues() {} }
function makeCtx() {
  const made = { nodes: 0, started: 0, stopped: 0, oscillators: 0 };
  const node = (extra: Record<string, unknown> = {}) => {
    made.nodes++;
    const o: Record<string, unknown> = { gain: new P(), frequency: new P(), detune: new P(), Q: new P(), pan: new P(), type: 'sine', connect() { return o; }, disconnect() {}, setPeriodicWave() {}, start() { made.started++; }, stop() { made.stopped++; }, ...extra };
    return o;
  };
  const ctx = {
    currentTime: 0, sampleRate: 44100, destination: node(),
    createGain: () => node(), createOscillator: () => { made.oscillators++; return node(); }, createBiquadFilter: () => node(), createBufferSource: () => node({ buffer: null, loop: false }),
    createStereoPanner: () => node(), createPeriodicWave: () => ({}), createBuffer: () => ({ getChannelData: () => new Float32Array(10) }),
  };
  return { ctx: ctx as unknown as AudioContext, made };
}

describe('vehicle sound specs', () => {
  const types = Object.keys(VEHICLE_SPECS);
  it('has an engine voice, a horn and a door class for every VehicleType', () => {
    for (const t of types) {
      expect(ENGINE_VOICES, `engine voice for ${t}`).toHaveProperty(t);
      expect(HORNS, `horn for ${t}`).toHaveProperty(t);
      expect(DOOR_CLASS, `door class for ${t}`).toHaveProperty(t);
    }
    expect(Object.keys(ENGINE_VOICES).sort()).toEqual([...types].sort());
  });
  it('engine top speed stays within 12% of the vehicle spec (CARS14 retunes; re-sync vmax when this fails)', () => {
    for (const t of types) expect(ENGINE_VOICES[t as keyof typeof ENGINE_VOICES].vmax / VEHICLE_SPECS[t as keyof typeof VEHICLE_SPECS].maxSpeed, t).toBeCloseTo(1, 0);
    for (const t of types) expect(Math.abs(ENGINE_VOICES[t as keyof typeof ENGINE_VOICES].vmax / VEHICLE_SPECS[t as keyof typeof VEHICLE_SPECS].maxSpeed - 1), t).toBeLessThan(0.12);
  });
  it('no two engine voices share the same core character', () => {
    const key = (t: string) => { const v = ENGINE_VOICES[t as keyof typeof ENGINE_VOICES]; return [v.cyl, v.idle, v.red, v.tone, v.ex[0]].join('|'); };
    expect(new Set(types.map(key)).size).toBe(types.length);
  });
  it('unknown types fall back instead of going silent', () => { expect(engineVoiceFor('hoverbike')).toBe(ENGINE_VOICES.sedan); });
  it('horns differ pairwise in root, interval or timbre', () => {
    const k = (t: string) => { const h = HORNS[t as keyof typeof HORNS]; return [h.kind, h.root, h.ratios.join(), h.wave, h.lp].join('|'); };
    expect(new Set(types.map(k)).size).toBe(types.length);
  });
  it('has footsteps for every surface', () => { for (const s of SURFACES) expect(footstepLayers(s).length).toBeGreaterThan(1); });
});

describe('rpm and gear model', () => {
  const all = Object.entries(ENGINE_VOICES);
  it('gear ratios fall with gear and top gear stays under the redline at top speed', () => {
    for (const [t, v] of all) {
      const r = gearRatios(v);
      for (let i = 1; i < r.length; i++) expect(r[i], t).toBeLessThan(r[i - 1]);
      expect(r.at(-1)! * v.vmax, t).toBeLessThan(v.red);
      expect(r.at(-1)! * v.vmax, t).toBeGreaterThan(v.red * 0.5);
    }
  });
  it('steady-speed rpm and gear are monotone in speed', () => {
    for (const [t, v] of all) {
      let g = 0, last = 0;
      for (let s = 0; s <= v.vmax; s += 0.5) {
        const gear = gearForSpeedOf(v, s);
        expect(gear, t).toBeGreaterThanOrEqual(g);
        if (gear === g) expect(rpmAt(v, gear, s), t).toBeGreaterThanOrEqual(last);
        g = gear; last = rpmAt(v, gear, s);
        expect(last, t).toBeLessThanOrEqual(v.red * 1.2);
      }
    }
  });
  it('full-throttle run: rpm stays at or under redline, gears climb, upshifts dip the revs', () => {
    for (const [t, v] of all) {
      const sim = new EngineSim(v, () => 0.5); sim.startNow();
      let speed = 0, gear = 1, shifts = 0, dipped = false, prev = 0;
      for (let i = 0; i < 60 * 14; i++) {
        speed = Math.min(v.vmax, speed + (v.vmax / 9) / 60);
        const f = sim.update(1 / 60, speed, 1);
        expect(f.rpm, t).toBeLessThanOrEqual(v.red * 1.001);
        expect(f.gear, t).toBeGreaterThanOrEqual(gear);
        if (f.gear > gear) { shifts++; gear = f.gear; prev = f.rpm; }
        else if (prev && f.rpm < prev * 0.93) dipped = true;
      }
      expect(shifts, t).toBeGreaterThanOrEqual(Math.min(2, v.gears - 1));
      if (v.gears > 1) expect(dipped, `${t} dips after an upshift`).toBe(true);
    }
  });
  it('idles at idle rpm and the firing frequency follows rpm/60*cyl/2', () => {
    const v = ENGINE_VOICES.pony, sim = new EngineSim(v); sim.startNow();
    let f = sim.update(1 / 60, 0, 0);
    for (let i = 0; i < 120; i++) f = sim.update(1 / 60, 0, 0);
    expect(f.rpm).toBeCloseTo(v.idle, -1);
    expect(f.fire).toBeCloseTo(firingHz(v.idle, 8));
    expect(firingHz(1200, 8)).toBe(80);
  });
  it('neutral revving hits the limiter and cuts', () => {
    const v = ENGINE_VOICES.hatch, sim = new EngineSim(v, () => 0.5); sim.startNow();
    let cuts = 0;
    for (let i = 0; i < 300; i++) { const f = sim.update(1 / 60, 0, 1); if (f.cut) cuts++; }
    expect(cuts).toBe(0); // free-rev tops at 82% of the redline, never the limiter
    const sim2 = new EngineSim(v, () => 0.5); sim2.startNow();
    let sp = 0;
    for (let i = 0; i < 1200; i++) { sp = Math.min(v.vmax, sp + 0.2); if (sim2.update(1 / 60, sp * 1.4, 1).cut) cuts++; }
    expect(cuts).toBeGreaterThan(0);
  });
  it('crank, catch, run, stop, off', () => {
    const v = ENGINE_VOICES.sedan, sim = new EngineSim(v);
    expect(sim.update(0.1, 0, 0).level).toBe(0);
    sim.start();
    const f = sim.update(0.1, 0, 0);
    expect(f.starter).toBe(1);
    expect(f.running).toBe(false);
    for (let i = 0; i < 90; i++) sim.update(1 / 60, 0, 0);
    expect(sim.phase).toBe('run');
    sim.stop();
    for (let i = 0; i < 90; i++) sim.update(1 / 60, 0, 0);
    expect(sim.phase).toBe('off');
    expect(sim.update(0.1, 0, 0).level).toBe(0);
  });
  it('sporty types crackle on lift-off, turbo types blow off, misfiring types misfire', () => {
    const run = (type: keyof typeof ENGINE_VOICES, check: (f: ReturnType<EngineSim['update']>) => boolean) => {
      const v = ENGINE_VOICES[type], sim = new EngineSim(v, () => 0.1); sim.startNow();
      let hit = false, sp = 0;
      for (let i = 0; i < 400; i++) { sp = Math.min(v.vmax, sp + 0.3); hit ||= check(sim.update(1 / 60, sp, 1)); }
      for (let i = 0; i < 20; i++) hit ||= check(sim.update(1 / 60, sp, 0));
      return hit;
    };
    expect(run('pony', (f) => f.pops > 0)).toBe(true);
    expect(run('sedan', (f) => f.pops > 0)).toBe(false);
    expect(run('crossover', (f) => f.blowoff)).toBe(true);
    const v = ENGINE_VOICES.beater, sim = new EngineSim(v, () => 0); sim.startNow();
    let m = 0; for (let i = 0; i < 600; i++) if (sim.update(1 / 60, 0, 0).miss) m++;
    expect(m).toBeGreaterThan(0);
  });
});

describe('picking, falloff, honks', () => {
  it('picks the nearest within the cap and range', () => {
    const c = [{ id: 'a', d: 10 }, { id: 'b', d: 5 }, { id: 'c', d: 30 }, { id: 'd', d: 90 }, { id: 'e', d: 20 }];
    expect(pickNearest([], c, 3)).toEqual(['b', 'a', 'e']);
    expect(pickNearest([], c, 10)).not.toContain('d');
  });
  it('hysteresis keeps the incumbent against a barely closer challenger', () => {
    expect(pickNearest(['a'], [{ id: 'a', d: 10 }, { id: 'b', d: 9 }], 1)).toEqual(['a']);
    expect(pickNearest(['a'], [{ id: 'a', d: 10 }, { id: 'b', d: 5 }], 1)).toEqual(['b']);
  });
  it('distance gain falls off and doppler shifts up when approaching', () => {
    expect(distanceGain(1)).toBeGreaterThan(distanceGain(20));
    expect(distanceGain(70)).toBe(0);
    expect(dopplerRatio(20)).toBeGreaterThan(1);
    expect(dopplerRatio(-20)).toBeLessThan(1);
    expect(dopplerRatio(1e9)).toBeLessThanOrEqual(1.12);
  });
  it('rate-limits AI honks per car and in total', () => {
    const l = new HonkLimiter(2.5, 2, 2);
    expect(l.allow('a', 0)).toBe(true);
    expect(l.allow('a', 1)).toBe(false);
    expect(l.allow('b', 1)).toBe(true);
    expect(l.allow('c', 1.5)).toBe(false);
    expect(l.allow('c', 3.2)).toBe(true);
  });
  it('siren modes cycle and sweep', () => {
    expect(sirenModeFor(HORNS.cop, 0)).toBe('wail');
    expect(sirenModeFor(HORNS.cop, 1)).toBe('whoop');
    expect(sirenModeFor(HORNS.ambulance, 6)).toBe('hilo');
    expect(sirenHz('wail', 1.7)).toBeGreaterThan(sirenHz('wail', 0.1) * 1.8);
    expect(sirenHz('hilo', 0.1)).not.toBe(sirenHz('hilo', 0.6));
  });
  it('tyre roll gets louder with speed; cobbles are bumpier and wet is hissier', () => {
    expect(tyreRoll(25, 'asphalt').level).toBeGreaterThan(tyreRoll(5, 'asphalt').level);
    expect(tyreRoll(15, 'cobble').bump).toBe(1);
    expect(tyreRoll(15, 'wet').hz).toBeGreaterThan(tyreRoll(15, 'asphalt').hz);
    expect(crashLayers(1).length).toBeGreaterThan(crashLayers(0.2).length);
  });
});

const car = (i: number, x: number): TrafficCar => ({ id: `c${i}`, type: i % 2 ? 'bus' : 'hatch', x, z: 0, vx: 5, vz: 0, speed: 5, throttle: 0.5 });

describe('AI engine voices', () => {
  it('caps voices, reuses slots and cleans up', () => {
    const { ctx, made } = makeCtx();
    const te = new TrafficEngines(ctx, ctx.destination as unknown as AudioNode, 4);
    const cars = Array.from({ length: 12 }, (_, i) => car(i, 5 + i * 4));
    te.update(1 / 60, { x: 0, z: 0 }, cars);
    expect(te.active).toBe(4);
    const nodes = made.nodes;
    for (let k = 0; k < 120; k++) te.update(1 / 60, { x: k * 0.5, z: 0 }, cars.map((c) => ({ ...c, x: c.x + k * 0.1 })));
    expect(te.active).toBeLessThanOrEqual(4);
    expect(te.created).toBeLessThanOrEqual(4);
    expect(made.nodes).toBeLessThanOrEqual(nodes + 4 * 6); // slot reuse: no growth with frames
    te.update(1 / 60, { x: 0, z: 0 }, []);
    expect(te.active).toBe(0);
    te.dispose();
    expect(made.stopped).toBeGreaterThanOrEqual(4);
  });
  it('does not create nodes per frame for the player engine', () => {
    const { ctx, made } = makeCtx();
    const noise = ctx.createBuffer(1, 10, 44100);
    const e = new EngineNodes(ctx, ENGINE_VOICES.pony, noise, ctx.destination as unknown as AudioNode, 0);
    const sim = new EngineSim(ENGINE_VOICES.pony, () => 0.3); sim.startNow();
    const n = made.nodes;
    for (let i = 0; i < 300; i++) e.apply(sim.update(1 / 60, Math.min(38, i * 0.2), i < 200 ? 1 : 0), i / 60, i * 0.2);
    expect(made.nodes).toBe(n);
    e.dispose();
    expect(made.stopped).toBeGreaterThan(5);
  });
  it('builds every type without error', () => {
    for (const t of Object.keys(ENGINE_VOICES)) {
      const { ctx } = makeCtx();
      expect(() => new EngineNodes(ctx, ENGINE_VOICES[t as keyof typeof ENGINE_VOICES], ctx.createBuffer(1, 10, 44100), ctx.destination as unknown as AudioNode, 0)).not.toThrow();
      expect(() => playHorn(ctx, ctx.destination as unknown as AudioNode, HORNS[t as keyof typeof HORNS], 0).release(1)).not.toThrow();
    }
  });
});

describe('VehicleAudio', () => {
  it('is inert before attach and before a type is set', () => {
    const v = new VehicleAudio();
    expect(() => { v.setDrive(10, 1, true); v.update(0.1); v.hornEvent({ x: 0, z: 0 }); v.playJump(); v.playLand(1); v.playFootstep('gravel'); }).not.toThrow();
    expect(v.typed).toBe(false);
  });
  it('player horn plays, AI honks are rate limited and resolved to the nearby car type', () => {
    const { ctx, made } = makeCtx();
    const v = new VehicleAudio(() => 0.5);
    v.attach(ctx, ctx.destination as unknown as AudioNode, ctx.createBuffer(1, 10, 44100));
    v.setType('bus');
    v.setTraffic({ x: 0, z: 0 }, [car(1, 20)]);
    const o = made.oscillators;
    v.hornEvent({ x: 0, z: 0 });
    expect(made.oscillators - o).toBe(3); // bus air horn chord
    const o2 = made.oscillators;
    v.hornEvent({ x: 20, z: 0 });
    v.hornEvent({ x: 20, z: 0 });
    expect(made.oscillators - o2).toBe(3); // one honk only, from the bus at that position
  });
  it('one-shots and update create a bounded number of nodes', () => {
    const { ctx, made } = makeCtx();
    const v = new VehicleAudio(() => 0.5);
    v.attach(ctx, ctx.destination as unknown as AudioNode, ctx.createBuffer(1, 10, 44100));
    v.setType('garbage'); v.setDrive(0, 0, true);
    for (let i = 0; i < 5; i++) v.update(1 / 60);
    const n = made.nodes;
    for (let i = 0; i < 600; i++) { v.setDrive(i * 0.02, 1, true); v.update(1 / 60); }
    expect(made.nodes).toBe(n);
    v.playDoor(true); v.playJump(); v.playLand(0.8);
    expect(made.nodes).toBeGreaterThan(n);
    v.setDrive(0, 0, false);
    for (let i = 0; i < 90; i++) v.update(1 / 60);
    v.dispose();
  });
});
