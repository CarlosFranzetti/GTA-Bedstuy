import { describe, it, expect } from 'vitest';
import { FIXED_STEP, FixedStepper, PoseSnapshots, SNAP_DISTANCE, interpAlpha, lerp, lerpAngle, type BlendedPose } from '@/core/Game';
import type { Body2D } from '@/world/types';

const body = (id: string, x: number, z: number, heading = 0): Body2D => ({
  id, kind: 'vehicle', shape: { kind: 'circle', r: 1 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1,
});

describe('interpAlpha', () => {
  it('is acc / step clamped to [0, 1]', () => {
    expect(interpAlpha(0, FIXED_STEP)).toBe(0);
    expect(interpAlpha(FIXED_STEP / 2, FIXED_STEP)).toBeCloseTo(0.5, 10);
    expect(interpAlpha(FIXED_STEP * 3, FIXED_STEP)).toBe(1);
    expect(interpAlpha(-1, FIXED_STEP)).toBe(0);
  });
  it('degenerate step gives 1', () => { expect(interpAlpha(0.5, 0)).toBe(1); });
});

describe('lerp / lerpAngle', () => {
  it('lerp', () => { expect(lerp(2, 6, 0.25)).toBe(3); });
  it('takes the short way across the +-pi seam', () => {
    const a = Math.PI - 0.1, b = -Math.PI + 0.1; // 0.2 rad apart across the seam
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.cos(mid) - Math.cos(Math.PI))).toBeLessThan(1e-9);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 10);
    expect(lerpAngle(a, b, 1)).toBeCloseTo(a + 0.2, 10);
  });
});

describe('FixedStepper', () => {
  it('runs whole steps and keeps the remainder as alpha', () => {
    const s = new FixedStepper(1 / 60);
    expect(s.advance(1 / 144)).toBe(0);
    expect(s.alpha).toBeCloseTo((1 / 144) / (1 / 60), 6);
    // 144 Hz: 60 steps over 144 frames
    let steps = 0;
    for (let i = 0; i < 143; i++) steps += s.advance(1 / 144);
    expect(steps).toBe(59); // 144 frames total => 60 steps (first frame ran none, accumulator holds the rest)
    expect(s.alpha).toBeGreaterThanOrEqual(0);
    expect(s.alpha).toBeLessThanOrEqual(1);
  });
  it('caps steps per frame and drops the backlog so alpha stays <= 1', () => {
    const s = new FixedStepper(1 / 60, 5, 0.1);
    expect(s.advance(5)).toBe(5); // clamped to 0.1 s = 6 steps, capped at 5
    expect(s.acc).toBeLessThan(1 / 60);
    expect(s.alpha).toBeLessThanOrEqual(1);
    expect(s.advance(0)).toBe(0);
  });
  it('ignores negative frame times', () => {
    const s = new FixedStepper();
    expect(s.advance(-1)).toBe(0);
    expect(s.acc).toBe(0);
  });
});

describe('PoseSnapshots', () => {
  const out: BlendedPose = { x: 0, z: 0, h: 0 };
  it('blends the pose captured at step start with the current one', () => {
    const p = new PoseSnapshots();
    const b = body('a', 0, 0, 0);
    p.beginCapture(); p.capture(b); p.endCapture();
    b.pos.x = 1; b.pos.z = 2; b.heading = 0.5; // the step moves the body
    p.blend(b, 0.5, out);
    expect(out.x).toBeCloseTo(0.5, 10); expect(out.z).toBeCloseTo(1, 10); expect(out.h).toBeCloseTo(0.25, 10);
    p.blend(b, 0, out); expect(out.x).toBe(0);
    p.blend(b, 1, out); expect(out.x).toBe(1);
  });
  it('does not modify the body', () => {
    const p = new PoseSnapshots();
    const b = body('a', 3, 4, 1);
    p.beginCapture(); p.capture(b); p.endCapture();
    b.pos.x = 4;
    p.blend(b, 0.3, out);
    expect(b.pos.x).toBe(4); expect(b.pos.z).toBe(4); expect(b.heading).toBe(1);
  });
  it('returns the current pose without a snapshot and after a teleport', () => {
    const p = new PoseSnapshots();
    const b = body('new', 5, 5, 2);
    p.blend(b, 0.5, out);
    expect(out.x).toBe(5); expect(out.h).toBe(2);
    p.beginCapture(); p.capture(b); p.endCapture();
    b.pos.x += SNAP_DISTANCE + 1;
    p.blend(b, 0.5, out);
    expect(out.x).toBe(b.pos.x);
  });
  it('prunes bodies that are no longer captured', () => {
    const p = new PoseSnapshots();
    const a = body('a', 0, 0), c = body('c', 0, 0);
    p.beginCapture(); p.capture(a); p.capture(c); p.endCapture();
    expect(p.size).toBe(2);
    p.beginCapture(); p.capture(a); p.endCapture();
    expect(p.size).toBe(1);
  });
  it('interpolates headings across the seam', () => {
    const p = new PoseSnapshots();
    const b = body('a', 0, 0, Math.PI - 0.1);
    p.beginCapture(); p.capture(b); p.endCapture();
    b.heading = -Math.PI + 0.1;
    p.blend(b, 0.5, out);
    expect(Math.cos(out.h)).toBeCloseTo(-1, 6);
  });
});

describe('Game frame cap', () => {
  it('maxFps skips display frames that come sooner than the cap interval', async () => {
    const { Game } = await import('@/core/Game');
    const cbs: Array<(t: number) => void> = [];
    const g = globalThis as unknown as { requestAnimationFrame: (f: (t: number) => void) => number; cancelAnimationFrame: () => void };
    const oldRaf = g.requestAnimationFrame, oldCaf = g.cancelAnimationFrame;
    g.requestAnimationFrame = (f) => { cbs.push(f); return cbs.length; };
    g.cancelAnimationFrame = () => {};
    try {
      let drawn = 0;
      const game = new Game(() => { drawn++; });
      game.maxFps = 30;
      game.start();
      for (let i = 1; i <= 12; i++) cbs.shift()!(performance.now() + i * (1000 / 120)); // 120 Hz display, 100 ms
      expect(drawn).toBeGreaterThanOrEqual(2);
      expect(drawn).toBeLessThanOrEqual(5);
      const before = drawn;
      game.maxFps = 0;
      for (let i = 13; i <= 20; i++) cbs.shift()!(performance.now() + i * (1000 / 120));
      expect(drawn - before).toBe(8);
    } finally { g.requestAnimationFrame = oldRaf; g.cancelAnimationFrame = oldCaf; }
  });
});
