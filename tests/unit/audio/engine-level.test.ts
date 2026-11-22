import { describe, it, expect } from 'vitest';
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import { ENGINE_BUS_DEFAULT, Mixer, engineBusGain, taper } from '@/audio/Mixer';
import type { TrafficCar } from '@/audio/vehicle/nodes';
import { RecCtx } from './fakeWebAudio';

/** AUDIOFIX: the engine bus (level 0.55 of the old level by default, i.e. 45 percent lower) and the Engine sound setting (Off creates no voice at all). */
async function setup(pos?: number) {
  const events = new EventBus();
  const ctx = new RecCtx();
  const mixer = new Mixer(null);
  if (pos !== undefined) mixer.set('engine', pos);
  const audio = new AudioSystem(events, () => ctx as unknown as AudioContext, { feed: null, scEnv: { canLoad: () => false }, mixer });
  await audio.start();
  return { ctx, audio, mixer };
}
const lastTarget = (p: { events: { v: number; kind: string }[]; value: number }) => p.events.filter((e) => e.kind === 'target' || e.kind === 'set').at(-1)?.v ?? p.value;
const engineBus = (ctx: RecCtx) => {
  // the engine bus is the gain node the player's engine body feeds: find it through the vehicle layer's first engine graph
  const gains = ctx.nodes.filter((n) => n.kind === 'gain');
  return gains;
};
const run = (ctx: RecCtx, audio: AudioSystem, seconds: number, cars: TrafficCar[] = []) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    ctx.advance(1 / 60);
    audio.setEngine(14, 0.7, true, 1, 'sedan');
    audio.setTraffic({ x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 }, cars, 1 / 60);
    audio.update(1 / 60);
  }
};
const mover = (i: number): TrafficCar => ({ id: `m${i}`, type: 'sedan', x: 8 + i * 5, z: 3, vx: 8, vz: 0, speed: 8, throttle: 0.5 });

describe('engine level', () => {
  it('the engine bus default is 0.55 of the old level (45 percent lower, -5.2 dB)', () => {
    expect(ENGINE_BUS_DEFAULT).toBe(0.55);
    expect(engineBusGain(1)).toBeCloseTo(0.55);
    expect(20 * Math.log10(engineBusGain(1))).toBeCloseTo(-5.19, 1);
    expect(engineBusGain(0)).toBe(0);
    expect(engineBusGain(0.5)).toBeCloseTo(0.55 * taper(0.5));
  });
  it('a fresh game builds the engine bus at 0.55 and sends the player and AI engines through it', async () => {
    const { ctx, audio } = await setup();
    run(ctx, audio, 1, [mover(0), mover(1)]);
    const bus = engineBus(ctx).find((g) => g.gain.value === 0.55);
    expect(bus, 'a gain node at 0.55 (the engine bus)').toBeTruthy();
    // every engine output (body and accessories of the player's engine, and each AI voice) ends in it, not in the effects bus
    const into = (n: unknown) => ctx.nodes.filter((x) => x.connections.includes(n));
    expect(into(bus).length).toBeGreaterThanOrEqual(3);
  });
});

describe('Engine sound setting', () => {
  it('Off: no engine voice is created, for the player or for traffic', async () => {
    const { ctx, audio } = await setup(0);
    const before = ctx.nodes.length;
    run(ctx, audio, 3, [mover(0), mover(1), mover(2)]);
    expect(audio.vehicle.voiceCount).toEqual({ player: 0, ghosts: 0, traffic: 0 });
    // what grows is only the road and the wash beds (one-time), never an engine graph (about 25 sources) or a traffic voice
    const oscs = ctx.nodes.slice(before).filter((n) => n.kind === 'osc').length;
    expect(oscs).toBeLessThanOrEqual(1);
  });
  it('turned off live, every voice goes at once; turned back on, the engine returns', async () => {
    const { ctx, audio, mixer } = await setup();
    run(ctx, audio, 2, [mover(0), mover(1)]);
    expect(audio.vehicle.voiceCount.player).toBe(1);
    expect(audio.vehicle.voiceCount.traffic).toBe(2);
    mixer.set('engine', 0);
    run(ctx, audio, 0.2, [mover(0), mover(1)]);
    expect(audio.vehicle.voiceCount).toEqual({ player: 0, ghosts: 0, traffic: 0 });
    mixer.set('engine', 0.5);
    run(ctx, audio, 0.5, [mover(0), mover(1)]);
    expect(audio.vehicle.voiceCount.player).toBe(1);
    expect(audio.vehicle.voiceCount.traffic).toBe(2);
  });
  it('the slider scales the bus live and tyres, horns and doors are not touched by Off', async () => {
    const { ctx, audio, mixer } = await setup();
    run(ctx, audio, 0.5);
    mixer.set('engine', 0.5);
    const bus = engineBus(ctx).find((g) => Math.abs(lastTarget(g.gain) - 0.55 * 0.25) < 1e-9);
    expect(bus).toBeTruthy();
    mixer.set('engine', 0);
    const n = ctx.nodes.length;
    audio.playDoor(true, 'sedan'); audio.honkAt('x', 'bus', 6); audio.playKerb(0.6);
    expect(ctx.nodes.length).toBeGreaterThan(n);
  });
  it('persists with the other mixer settings', () => {
    const store: Record<string, string> = {};
    const st = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    const a = new Mixer(st); a.set('engine', 0);
    expect(new Mixer(st).get('engine')).toBe(0);
    const b = new Mixer(st); b.set('engine', 0.35);
    expect(new Mixer(st).get('engine')).toBeCloseTo(0.35);
  });
});
