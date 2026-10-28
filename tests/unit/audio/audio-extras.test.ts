import { describe, it, expect, vi } from 'vitest';
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import { engineFrequency, gearForSpeed, gearShiftFactor, squealLevel, GEAR_SPEEDS } from '@/audio/synth';

class P {
  value = 0;
  targets: number[] = [];
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; }
  exponentialRampToValueAtTime(v: number) { this.value = v; }
  setTargetAtTime(v: number) { this.value = v; this.targets.push(v); }
  last() { return this.targets.at(-1); }
}
class N { out: unknown[] = []; connect(d: unknown) { this.out.push(d); return d; } disconnect() {} start() {} stop() {} }
class Osc extends N { type = 'sine'; frequency = new P(); }
class Gain extends N { gain = new P(); }
class Filt extends N { type = 'lowpass'; frequency = new P(); Q = new P(); }
class Src extends N { buffer: unknown = null; loop = false; }

function fakeCtx() {
  const made = { osc: [] as Osc[], gain: [] as Gain[], filt: [] as Filt[], src: [] as Src[] };
  const st = { v: 'suspended' as 'suspended' | 'running' | 'closed' };
  const ctx = {
    currentTime: 0, sampleRate: 8000, destination: new N(),
    get state() { return st.v; },
    resume: vi.fn(async () => { st.v = 'running'; }),
    suspend: vi.fn(async () => { st.v = 'suspended'; }),
    createOscillator() { const n = new Osc(); made.osc.push(n); return n; },
    createGain() { const n = new Gain(); made.gain.push(n); return n; },
    createBiquadFilter() { const n = new Filt(); made.filt.push(n); return n; },
    createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() { const n = new Src(); made.src.push(n); return n; },
  };
  return { ctx, made, st };
}

function setup() {
  const events = new EventBus();
  const f = fakeCtx();
  const audio = new AudioSystem(events, () => f.ctx as unknown as AudioContext);
  return { events, audio, ...f };
}

describe('synth gear helpers', () => {
  it('maps speed to gears at the thresholds', () => {
    expect(gearForSpeed(0)).toBe(1);
    expect(gearForSpeed(GEAR_SPEEDS[0] - 0.1)).toBe(1);
    expect(gearForSpeed(GEAR_SPEEDS[0])).toBe(2);
    expect(gearForSpeed(100)).toBe(GEAR_SPEEDS.length + 1);
    expect(gearForSpeed(-20)).toBe(gearForSpeed(20));
  });
  it('upshift drops pitch, downshift blips it', () => {
    expect(gearShiftFactor(1, 2)).toBeLessThan(1);
    expect(gearShiftFactor(3, 2)).toBeGreaterThan(1);
    expect(gearShiftFactor(2, 2)).toBe(1);
  });
  it('squeal needs both slip and speed', () => {
    expect(squealLevel(1, 0)).toBe(0);
    expect(squealLevel(0, 20)).toBe(0);
    expect(squealLevel(1, 20)).toBe(1);
    expect(squealLevel(Number.NaN, 20)).toBe(0);
  });
});

describe('AudioSystem gear shifts', () => {
  it('dips the engine pitch after an upshift under power and recovers', async () => {
    const { audio, made } = setup();
    await audio.start();
    audio.setEngine(7.5, 1, true);
    const steady = engineFrequency(7.5, 1);
    expect(made.osc[0].frequency.last()).toBeCloseTo(steady);
    audio.setEngine(8.5, 1, true);
    const dipped = made.osc[0].frequency.last()!;
    expect(dipped).toBeLessThan(engineFrequency(8.5, 1) * 0.9);
    for (let i = 0; i < 60; i++) audio.update(1 / 30);
    expect(made.osc[0].frequency.last()).toBeCloseTo(engineFrequency(8.5, 1), 1);
  });

  it('does not dip on the very first sample or when coasting up a gear', async () => {
    const { audio, made } = setup();
    await audio.start();
    audio.setEngine(20, 1, true);
    expect(made.osc[0].frequency.last()).toBeCloseTo(engineFrequency(20, 1));
    audio.setEngine(7.5, 0, true);
    audio.setEngine(8.5, 0.1, true);
    expect(made.osc[0].frequency.last()).toBeCloseTo(engineFrequency(8.5, 0.1));
  });
});

describe('AudioSystem tyre squeal', () => {
  /** The squeal path is the only bandpass filter with Q = 6; its output is the squeal gain. */
  const squeal = (made: ReturnType<typeof fakeCtx>['made']) => (made.filt.find((f) => f.Q.value === 6)!.out[0] as Gain).gain;

  it('is silent without slip and loud with slip at speed', async () => {
    const { audio, made } = setup();
    await audio.start();
    audio.setEngine(15, 0.5, true);
    expect(squeal(made).last()).toBe(0);
    audio.setSlip(0.9);
    expect(squeal(made).last()).toBeGreaterThan(0.03);
    audio.setSlip(0);
    expect(squeal(made).last()).toBe(0);
  });

  it('falls back to the handbrake, stays quiet when nearly stopped or on foot', async () => {
    const { audio, made } = setup();
    await audio.start();
    audio.setEngine(15, 0, true);
    audio.setHandbrake(true);
    expect(squeal(made).last()).toBeGreaterThan(0);
    audio.setEngine(0.5, 0, true);
    expect(squeal(made).last()).toBe(0);
    audio.setEngine(15, 0, false);
    expect(squeal(made).last()).toBe(0);
  });

  it('squeal source loops', async () => {
    const { audio, made } = setup();
    await audio.start();
    expect(made.src.filter((s) => s.loop).length).toBeGreaterThanOrEqual(2); // hum + squeal
  });
});

describe('AudioSystem ambience and radio volume', () => {
  /** Day bed = bandpass 1100 Hz output gain; night bed = lowpass 220 Hz output gain. */
  const bed = (made: ReturnType<typeof fakeCtx>['made'], type: string, hz: number) =>
    (made.filt.find((f) => f.type === type && f.frequency.value === hz)!.out[0] as Gain).gain;

  it('crossfades day and night beds on setNight', async () => {
    const { audio, made } = setup();
    await audio.start();
    const day = bed(made, 'bandpass', 1100), night = bed(made, 'lowpass', 220);
    expect(day.value).toBeGreaterThan(0);
    expect(night.value).toBe(0);
    audio.setNight(true);
    expect(day.last()).toBe(0);
    expect(night.last()).toBeGreaterThan(0);
    audio.setNight(false);
    expect(day.last()).toBeGreaterThan(0);
    expect(night.last()).toBe(0);
  });

  it('starts on the night bed when night was set before start()', async () => {
    const { audio, made } = setup();
    audio.setNight(true);
    await audio.start();
    expect(bed(made, 'bandpass', 1100).value).toBe(0);
    expect(bed(made, 'lowpass', 220).value).toBeGreaterThan(0);
  });

  it('radio volume scales the radio bus independently of master', async () => {
    const { audio, events, made } = setup();
    await audio.start();
    events.emit('enterVehicle', { vehicleId: 'v' });
    const bus = made.gain.find((g) => g.gain.targets.length && g.gain.last()! > 0 && Math.abs(g.gain.last()! - 0.25) < 1e-9)!.gain;
    expect(bus.last()).toBeCloseTo(0.25);
    audio.setRadioVolume(0.4);
    expect(bus.last()).toBeCloseTo(0.1);
    audio.setMasterVolume(0.5);
    expect(bus.last()).toBeCloseTo(0.1);
    audio.setRadioVolume(5);
    expect(bus.last()).toBeCloseTo(0.25);
  });
});

describe('AudioSystem pause/resume', () => {
  it('suspends and resumes the context', async () => {
    const { audio, ctx, st } = setup();
    await audio.start();
    expect(st.v).toBe('running');
    audio.pause();
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
    await Promise.resolve();
    expect(st.v).toBe('suspended');
    audio.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(2); // start() + resume()
    expect(audio.paused).toBe(false);
  });

  it('stacks reasons: resumes only when all are released', async () => {
    const { audio, ctx } = setup();
    await audio.start();
    audio.pause('menu'); audio.pause('hidden');
    ctx.resume.mockClear();
    audio.resume('menu');
    expect(ctx.resume).not.toHaveBeenCalled();
    audio.resume('hidden');
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('setPaused(bool) maps to the menu reason', async () => {
    const { audio, ctx } = setup();
    await audio.start();
    audio.setPaused(true);
    expect(ctx.suspend).toHaveBeenCalled();
    audio.setPaused(false);
    expect(audio.paused).toBe(false);
  });

  it('pause before start() keeps the new context suspended; resume then runs it', async () => {
    const { audio, ctx } = setup();
    audio.pause();
    await audio.start();
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(ctx.suspend).toHaveBeenCalled();
    audio.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('is safe with a context that has no suspend()', async () => {
    const events = new EventBus();
    const f = fakeCtx();
    delete (f.ctx as Partial<typeof f.ctx>).suspend;
    const audio = new AudioSystem(events, () => f.ctx as unknown as AudioContext);
    await audio.start();
    expect(() => { audio.pause(); audio.resume(); }).not.toThrow();
  });
});
