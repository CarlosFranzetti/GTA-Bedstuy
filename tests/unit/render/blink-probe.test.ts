import { describe, expect, it } from 'vitest';
import { BlinkProbe, BLINK_JUMP } from '@/render/BlinkProbe';

const steady = (p: BlinkProbe, n: number, luma = 120): void => { for (let i = 0; i < n; i++) p.push(luma + (i % 3) - 1); };

describe('BlinkProbe', () => {
  it('counts nothing on a steady picture with small noise', () => {
    const p = new BlinkProbe(); steady(p, 300);
    expect(p.blinks).toBe(0); expect(p.blackFrames).toBe(0); expect(p.frames).toBe(300);
    expect(Math.abs(p.usual - 120)).toBeLessThan(2);
  });

  it('counts a single black frame as one blink and one black frame', () => {
    const p = new BlinkProbe(); steady(p, 60); p.push(0); steady(p, 60);
    expect(p.blinks).toBe(1); expect(p.blackFrames).toBe(1);
    expect(p.lastBlinkLuma).toBe(0); expect(Math.abs(p.lastUsualLuma - 120)).toBeLessThan(2);
  });

  it('counts every other frame blinking as many blinks', () => {
    const p = new BlinkProbe(); steady(p, 30);
    for (let i = 0; i < 40; i++) p.push(i % 2 ? 120 : 120 - BLINK_JUMP - 20);
    expect(p.blinks).toBe(20);
  });

  it('a blink that lasts several frames is one blink', () => {
    const p = new BlinkProbe(); steady(p, 30); for (let i = 0; i < 5; i++) p.push(250); steady(p, 30);
    expect(p.blinks).toBe(1);
  });

  it('accepts a lasting change (day to night) as the new usual instead of blinking forever', () => {
    const p = new BlinkProbe(); steady(p, 60, 180); steady(p, 400, 20);
    expect(p.blinks).toBe(1); expect(Math.abs(p.usual - 20)).toBeLessThan(2);
    steady(p, 100, 20); expect(p.blinks).toBe(1);
  });

  it('a slow drift never counts', () => {
    const p = new BlinkProbe(); for (let i = 0; i < 600; i++) p.push(40 + i * 0.25);
    expect(p.blinks).toBe(0);
  });

  it('reads five points through the reader', () => {
    const p = new BlinkProbe(); let calls = 0;
    p.sample({ read(_x, _y, out) { calls++; out[0] = 100; out[1] = 100; out[2] = 100; out[3] = 255; } }, 1920, 1080);
    expect(calls).toBe(5); expect(p.frames).toBe(1);
  });

  it('reports the counters the host bumps', () => {
    const p = new BlinkProbe(); p.resizes = 3; p.tierSwitches = 1;
    const r = p.report(); expect(r['buffer resizes']).toBe(3); expect(r['quality switches']).toBe(1);
  });
});
