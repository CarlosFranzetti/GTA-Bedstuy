import { describe, it, expect } from 'vitest';
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';
import type { TrafficCar } from '@/audio/vehicle/nodes';
import { RecCtx } from './fakeWebAudio';

/**
 * AUDIOFIX: pause and resume of the whole audio system (pause menu, hidden tab, the record shop's listening post).
 * Two real-browser behaviours matter: suspend() and resume() settle later (the state does not change in the same task), and a
 * suspended context's clock stands still, so every parameter write made meanwhile is scheduled at the same instant.
 */
function setup() {
  const events = new EventBus();
  const ctx = new RecCtx();
  const audio = new AudioSystem(events, () => ctx as unknown as AudioContext, { feed: null, shuffleStart: false, scEnv: { canLoad: () => false } });
  return { events, ctx, audio };
}
const cars = (x0: number): TrafficCar[] => Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, type: i % 2 ? 'bus' : 'hatch', x: x0 + i * 3, z: 4, vx: 6, vz: 0, speed: 6, throttle: 0.5 }));

describe('AudioSystem pause', () => {
  it('a pause and resume in the same task leaves the context running (resume must not trust a state that has not settled)', async () => {
    const { ctx, audio } = setup();
    await audio.start();
    ctx.settle();
    audio.pause('menu');
    audio.resume('menu'); // Esc twice
    ctx.settle();
    expect(ctx.state).toBe('running');
  });

  it('hidden then shown quickly ends running, and a stacked reason keeps it suspended until it is released', async () => {
    const { ctx, audio } = setup();
    await audio.start(); ctx.settle();
    audio.pause('listening-post'); ctx.settle();
    audio.pause('hidden'); audio.resume('hidden'); ctx.settle();
    expect(ctx.state).toBe('suspended');
    audio.resume('listening-post'); ctx.settle();
    expect(ctx.state).toBe('running');
  });

  it('while suspended with the game still calling in (listening post open), nothing piles up on the automation timeline', async () => {
    const { ctx, audio } = setup();
    await audio.start(); ctx.settle();
    audio.setEngine(0, 0, false, 1, null);
    for (let i = 0; i < 60; i++) { ctx.advance(1 / 60); audio.setTraffic({ x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 }, cars(5 + i * 0.1), 1 / 60); audio.update(1 / 60); }
    audio.pause('listening-post'); ctx.settle();
    expect(ctx.state).toBe('suspended');
    const writes = ctx.writes, nodes = ctx.nodes.length;
    for (let i = 0; i < 60 * 60; i++) {
      ctx.advance(1 / 60); // frozen
      audio.setEngine(0, 0, false, 1, null);
      audio.setTraffic({ x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 }, cars(5 + i * 0.05), 1 / 60);
      audio.setBraking(false); audio.setFoot(1.4, 0, true);
      audio.update(1 / 60);
    }
    expect(ctx.maxPeak, 'events held by one parameter after a minute suspended').toBeLessThan(40);
    expect(ctx.writes - writes, 'parameter writes while the clock is stopped').toBeLessThan(200);
    expect(ctx.nodes.length - nodes, 'nodes created while the clock is stopped').toBeLessThan(5);
    audio.resume('listening-post'); ctx.settle();
    for (let i = 0; i < 60; i++) { ctx.advance(1 / 60); audio.update(1 / 60); }
    expect(ctx.bad).toEqual([]);
  });

  it('honks and one-shots that arrive while suspended are dropped, not played in a burst on resume', async () => {
    const { ctx, audio } = setup();
    await audio.start(); ctx.settle();
    audio.setEngine(0, 0, false, 1, 'sedan');
    audio.setTraffic({ x: 0, z: 0, vx: 0, vz: 0, rx: 1, rz: 0 }, cars(5), 1 / 60);
    audio.pause('listening-post'); ctx.settle();
    const made = ctx.nodes.length;
    for (let i = 0; i < 30; i++) { audio.honkAt(`h${i}`, 'bus', 10); audio.playUi('tick'); audio.playLand(0.5); audio.playDoor(true); audio.playKerb(0.5); audio.playJump(); }
    expect(ctx.nodes.length - made, 'nodes built at the frozen clock').toBe(0);
  });

  it('pause reasons are balanced: the radio stays paused until the last reason is released, and a repeated reason counts once', async () => {
    const { ctx, audio } = setup();
    await audio.start(); ctx.settle();
    const radioPaused = () => (audio as unknown as { radio: { paused: boolean } }).radio.paused;
    audio.pause('menu'); audio.pause('menu'); audio.pause('listening-post');
    expect(radioPaused()).toBe(true);
    audio.resume('menu'); // Escape closes the menu while the listening post is still open
    expect(audio.paused).toBe(true);
    expect(radioPaused()).toBe(true);
    audio.resume('listening-post'); // the shop closes (Escape or Close): stopPost -> onListen(false)
    expect(audio.paused).toBe(false);
    expect(radioPaused()).toBe(false);
    ctx.settle();
    expect(ctx.state).toBe('running');
    audio.resume('listening-post'); // an extra resume is harmless
    expect(audio.paused).toBe(false);
  });
});
