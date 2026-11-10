import { describe, expect, it } from 'vitest';
import { hyp } from '@/core/Math2';
import { World2D } from '@/physics/World2D';
import type { Body2D } from '@/world/types';

const box = (id: string, x: number, z: number, vx = 0): Body2D =>
  ({ id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.4 }, pos: { x, z }, vel: { x: vx, z: 0 }, heading: 0, mass: 1400 });

describe('World2D sleeping bodies', () => {
  it('a resting body keeps colliding with movers and wakes when pushed', () => {
    const w = new World2D(12);
    const parked = box('parked', 0, 0), mover = box('mover', 6, 0, -8);
    w.addBody(parked); w.addBody(mover);
    for (let i = 0; i < 20; i++) w.step(1 / 60); // parked falls asleep (calm for 3+ steps)
    let touched = false;
    for (let i = 0; i < 120; i++) { if (w.step(1 / 60).length) touched = true; mover.vel.x = Math.max(mover.vel.x, -8); mover.pos.x += mover.vel.x / 60; }
    expect(touched).toBe(true);
    expect(parked.pos.x).toBeLessThan(0); // shoved along -x by the mover
    // and it keeps being simulated afterwards: pushed out of a wall it was driven into
    expect(Math.abs(mover.pos.x - parked.pos.x)).toBeGreaterThan(1.7); // not interpenetrating (width 1.8 side by side along x? halfW 0.9 each)
  });

  it('a sleeping body is not hashed away: ray and circle queries still see it', () => {
    const w = new World2D(12);
    w.addBody(box('a', 30, 30));
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    expect(w.queryCircle({ x: 30, z: 30 }, 1).map((b) => b.id)).toContain('a');
    expect(w.raycast({ x: 30, z: 20 }, { x: 0, z: 1 }, 20)?.body.id).toBe('a');
    expect(w.overlapsSolid({ x: 30, z: 30 }, 0.4)).toBe(true);
  });

  it('a body moved by hand (teleport) wakes and is hashed at its new place', () => {
    const w = new World2D(12);
    const a = box('a', 0, 0);
    w.addBody(a);
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    a.pos.x = 100; a.pos.z = 100;
    w.step(1 / 60);
    expect(w.queryCircle({ x: 100, z: 100 }, 1).map((b) => b.id)).toContain('a');
    expect(w.queryCircle({ x: 0, z: 0 }, 1).map((b) => b.id)).not.toContain('a');
  });
});

describe('hyp', () => {
  it('matches Math.hypot at game scale', () => {
    for (const [x, z] of [[3, 4], [-1.5, 2.25], [0, 0], [1e4, -1e4]]) expect(hyp(x, z)).toBeCloseTo(Math.hypot(x, z), 9);
  });
});
