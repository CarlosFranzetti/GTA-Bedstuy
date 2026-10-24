import { describe, it, expect } from 'vitest';
import { World2D } from '@/physics/World2D';
import { overlap } from '@/physics/Collider2D';
import type { Body2D, BodyKind, Shape2D } from '@/world/types';

let n = 0;
function dyn(kind: BodyKind, shape: Shape2D, x: number, z: number, mass = 100, vx = 0, vz = 0, heading = 0): Body2D {
  return { id: `d${n++}`, kind, shape, pos: { x, z }, vel: { x: vx, z: vz }, heading, mass };
}
const SQUARE = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
const DT = 1 / 60;

describe('World2D statics', () => {
  it('addStatic returns a static Body2D with infinite mass', () => {
    const w = new World2D();
    const s = w.addStatic({ kind: 'polygon', points: SQUARE }, undefined, 'bld1');
    expect(s.id).toBe('bld1');
    expect(s.kind).toBe('static');
    expect(s.mass).toBe(Infinity);
    const c = w.addStatic({ kind: 'circle', r: 0.2 }, { x: 5, z: 5 });
    expect(c.pos).toEqual({ x: 5, z: 5 });
    expect(c.id).toBeTruthy();
  });

  it('static vs static is never tested (no contacts)', () => {
    const w = new World2D();
    w.addStatic({ kind: 'polygon', points: SQUARE });
    w.addStatic({ kind: 'circle', r: 3 }, { x: 2, z: 2 });
    expect(w.step(DT)).toHaveLength(0);
  });

  it('bodies() lists everything and removeBody removes by id', () => {
    const w = new World2D();
    w.addStatic({ kind: 'circle', r: 1 }, { x: 0, z: 0 }, 's');
    const p = dyn('ped', { kind: 'circle', r: 0.3 }, 20, 20, 70);
    w.addBody(p);
    expect([...w.bodies()].map((b) => b.id).sort()).toEqual(['s', p.id].sort());
    w.removeBody(p.id);
    w.removeBody('s');
    expect([...w.bodies()]).toHaveLength(0);
  });
});

describe('World2D.step resolution', () => {
  it('pushes a circle out of a static polygon fully (depth 0 afterwards)', () => {
    const w = new World2D();
    const wall = w.addStatic({ kind: 'polygon', points: SQUARE });
    const p = dyn('player', { kind: 'circle', r: 0.4 }, 4.1, 2, 80);
    w.addBody(p);
    const contacts = w.step(DT);
    expect(contacts).toHaveLength(1);
    const c = contacts[0];
    expect(c.a).toBe(p);
    expect(c.b).toBe(wall);
    expect(c.b.kind).toBe('static');
    expect(c.depth).toBeCloseTo(0.3, 4);
    expect(c.normal.x).toBeCloseTo(-1, 5);
    expect(p.pos.x).toBeGreaterThanOrEqual(4.4);
    expect(overlap(p, wall)).toBeNull();
    // a second step is clean
    expect(w.step(DT)).toHaveLength(0);
  });

  it('immovable statics: only the dynamic body moves', () => {
    const w = new World2D();
    const s = w.addStatic({ kind: 'circle', r: 1 }, { x: 0, z: 0 });
    const p = dyn('ped', { kind: 'circle', r: 0.5 }, 1.2, 0, 70);
    w.addBody(p);
    w.step(DT);
    expect(s.pos).toEqual({ x: 0, z: 0 });
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeGreaterThanOrEqual(1.5);
  });

  it('splits positional correction by inverse mass', () => {
    const w = new World2D();
    const heavy = dyn('vehicle', { kind: 'circle', r: 1 }, 0, 0, 3000);
    const light = dyn('ped', { kind: 'circle', r: 1 }, 1.5, 0, 1000);
    w.addBody(heavy); w.addBody(light);
    w.step(DT);
    const dh = Math.abs(heavy.pos.x - 0);
    const dl = Math.abs(light.pos.x - 1.5);
    expect(dh + dl).toBeGreaterThanOrEqual(0.5);
    expect(dl / dh).toBeCloseTo(3, 1); // light moves 3x as far
    expect(heavy.pos.x).toBeLessThan(0);
    expect(light.pos.x).toBeGreaterThan(1.5);
  });

  it('each unordered dynamic pair yields exactly one contact', () => {
    const w = new World2D();
    const a = dyn('vehicle', { kind: 'circle', r: 1 }, 0, 0);
    const b = dyn('vehicle', { kind: 'circle', r: 1 }, 1.5, 0);
    w.addBody(a); w.addBody(b);
    const cs = w.step(DT);
    expect(cs).toHaveLength(1);
    expect(Math.abs(cs[0].normal.x)).toBeCloseTo(1);
  });

  it('vehicle-vs-ped contact carries impulse ~ 8 when closing at 8 m/s', () => {
    const w = new World2D();
    // car heading east (+x), 8 m/s, nose just into the ped
    const car = dyn('vehicle', { kind: 'obb', halfW: 0.9, halfL: 2.3 }, 0, 0, 1400, 8, 0, Math.PI / 2);
    const ped = dyn('ped', { kind: 'circle', r: 0.3 }, 2.5, 0, 70);
    w.addBody(car); w.addBody(ped);
    const cs = w.step(DT);
    expect(cs).toHaveLength(1);
    const c = cs[0];
    expect(c.impulse).toBeCloseTo(8, 3);
    const other = c.a === car ? ped : car;
    expect(other).toBe(c.a === car ? c.b : c.a);
    // ped is knocked ahead of the car
    expect(ped.vel.x).toBeGreaterThan(8);
    expect(car.vel.x).toBeLessThan(8);
  });

  it('impulse is 0 for separating bodies and never negative', () => {
    const w = new World2D();
    const a = dyn('ped', { kind: 'circle', r: 1 }, 0, 0, 100, -2, 0);
    const b = dyn('ped', { kind: 'circle', r: 1 }, 1.5, 0, 100, 2, 0);
    w.addBody(a); w.addBody(b);
    const cs = w.step(DT);
    expect(cs[0].impulse).toBe(0);
    expect(a.vel.x).toBeCloseTo(-2); // untouched
  });

  it('restitution 0.1 for hard hits against statics; walking into a wall stays put', () => {
    const w = new World2D();
    w.addStatic({ kind: 'polygon', points: SQUARE });
    const fast = dyn('vehicle', { kind: 'circle', r: 0.5 }, 4.45, 2, 1000, -10, 0);
    w.addBody(fast);
    const [c] = w.step(DT);
    expect(c.impulse).toBeCloseTo(10, 4);
    expect(fast.vel.x).toBeCloseTo(1, 4); // bounced out at 0.1 * 10

    w.removeBody(fast.id);
    const walker = dyn('player', { kind: 'circle', r: 0.4 }, 4.5, 3, 80, -3, 0);
    w.addBody(walker);
    for (let i = 0; i < 30; i++) {
      walker.pos.x += walker.vel.x * DT;
      walker.vel.x = -3; // input re-applies every frame
      w.step(DT);
      expect(walker.pos.x).toBeGreaterThanOrEqual(4.4 - 1e-6);
    }
    expect(walker.pos.x).toBeLessThan(4.6);
  });

  it('does not tunnel: 50 m/s circle vs a 0.05 m segment wall in one 1/60 step', () => {
    const w = new World2D();
    w.addStatic({ kind: 'segment', a: { x: 0, z: -10 }, b: { x: 0, z: 10 } });
    const b = dyn('vehicle', { kind: 'circle', r: 0.4 }, -0.6, 0, 500, 50, 0);
    w.addBody(b);
    // integrator moves the body first (to x = +0.233, past the wall centre line), then calls step
    b.pos.x += b.vel.x * DT;
    const cs = w.step(DT);
    expect(b.pos.x).toBeLessThan(0);
    expect(b.vel.x).toBeLessThanOrEqual(0.0001);
    expect(cs.length).toBeGreaterThanOrEqual(1);
    expect(cs[0].impulse).toBeGreaterThan(40);
  });

  it('does not tunnel through a 0.3 m thick polygon wall either', () => {
    const w = new World2D();
    w.addStatic({ kind: 'polygon', points: [{ x: -0.15, z: -10 }, { x: 0.15, z: -10 }, { x: 0.15, z: 10 }, { x: -0.15, z: 10 }] });
    const b = dyn('vehicle', { kind: 'circle', r: 0.4 }, -0.8, 1, 500, 50, 0);
    w.addBody(b);
    b.pos.x += b.vel.x * DT; // -> +0.033, centre inside the wall
    w.step(DT);
    expect(b.pos.x).toBeLessThanOrEqual(-0.55 + 1e-3);
  });

  it('keeps a 50 m/s body from tunnelling over many frames', () => {
    const w = new World2D();
    w.addStatic({ kind: 'segment', a: { x: 20, z: -10 }, b: { x: 20, z: 10 } });
    const b = dyn('vehicle', { kind: 'circle', r: 0.4 }, 0, 0, 500, 50, 0);
    w.addBody(b);
    for (let i = 0; i < 120; i++) {
      b.pos.x += b.vel.x * DT; b.pos.z += b.vel.z * DT;
      w.step(DT);
      expect(b.pos.x).toBeLessThan(20);
    }
  });

  it('a body at a corner between two walls ends outside both', () => {
    const w = new World2D();
    const s1 = w.addStatic({ kind: 'polygon', points: [{ x: -10, z: -10 }, { x: 0, z: -10 }, { x: 0, z: 10 }, { x: -10, z: 10 }] });
    const s2 = w.addStatic({ kind: 'polygon', points: [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 0 }, { x: -10, z: 0 }] });
    const b = dyn('player', { kind: 'circle', r: 0.4 }, 0.2, 0.2, 80);
    w.addBody(b);
    w.step(DT);
    expect(overlap(b, s1)).toBeNull();
    expect(overlap(b, s2)).toBeNull();
  });

  it('works with the default 12 m cell across cell borders and for large statics', () => {
    const w = new World2D();
    // long wall spanning many cells
    const wall = w.addStatic({ kind: 'polygon', points: [{ x: 100, z: -300 }, { x: 101, z: -300 }, { x: 101, z: 300 }, { x: 100, z: 300 }] });
    const b = dyn('player', { kind: 'circle', r: 0.4 }, 99.8, 255, 80);
    w.addBody(b);
    w.step(DT);
    expect(overlap(b, wall)).toBeNull();
    expect(b.pos.x).toBeLessThanOrEqual(99.6 + 1e-3);
  });
});

describe('World2D queries', () => {
  it('queryCircle returns dynamic bodies overlapping the circle only', () => {
    const w = new World2D();
    w.addStatic({ kind: 'circle', r: 2 }, { x: 0, z: 0 });
    const near = dyn('vehicle', { kind: 'obb', halfW: 1, halfL: 2 }, 5, 0);
    const far = dyn('ped', { kind: 'circle', r: 0.3 }, 40, 40);
    const edge = dyn('ped', { kind: 'circle', r: 0.3 }, 0, 9.5);
    w.addBody(near); w.addBody(far); w.addBody(edge);
    w.step(DT);
    const ids = w.queryCircle({ x: 0, z: 0 }, 4.5).map((b) => b.id);
    expect(ids).toEqual([near.id]);
    const ids2 = w.queryCircle({ x: 0, z: 9 }, 1).map((b) => b.id);
    expect(ids2).toEqual([edge.id]);
  });

  it('queryCircle sees bodies that moved since the last step', () => {
    const w = new World2D();
    const p = dyn('vehicle', { kind: 'circle', r: 1 }, 0, 0);
    w.addBody(p);
    w.step(DT);
    p.pos.x = 13; // crossed a cell boundary, not re-hashed yet
    expect(w.queryCircle({ x: 13, z: 0 }, 2)).toHaveLength(1);
  });

  it('raycast hits a polygon at the right distance and misses when ignored', () => {
    const w = new World2D();
    const wall = w.addStatic({ kind: 'polygon', points: SQUARE }, undefined, 'wall');
    const hit = w.raycast({ x: -10, z: 2 }, { x: 1, z: 0 }, 50)!;
    expect(hit.body).toBe(wall);
    expect(hit.dist).toBeCloseTo(10);
    expect(hit.point.x).toBeCloseTo(0);
    expect(w.raycast({ x: -10, z: 2 }, { x: 1, z: 0 }, 50, 'wall')).toBeNull();
    expect(w.raycast({ x: -10, z: 2 }, { x: 1, z: 0 }, 5)).toBeNull();
  });

  it('raycast returns the nearest of static and dynamic, honours ignoreId', () => {
    const w = new World2D();
    w.addStatic({ kind: 'polygon', points: SQUARE });
    const car = dyn('vehicle', { kind: 'obb', halfW: 1, halfL: 2 }, -6, 2, 1400, 0, 0, Math.PI / 2); // x -8..-4
    const me = dyn('vehicle', { kind: 'obb', halfW: 1, halfL: 2 }, -14, 2, 1400, 0, 0, Math.PI / 2); // x -16..-12
    w.addBody(car); w.addBody(me); w.step(DT);
    const h = w.raycast({ x: -11, z: 2 }, { x: 1, z: 0 }, 50, me.id)!;
    expect(h.body).toBe(car);
    expect(h.dist).toBeCloseTo(3);
    const h2 = w.raycast({ x: -11, z: 2 }, { x: 1, z: 0 }, 50, car.id)!;
    expect(h2.body.kind).toBe('static');
    expect(h2.dist).toBeCloseTo(11);
  });

  it('raycast with a long diagonal ray stays correct', () => {
    const w = new World2D();
    const c = w.addStatic({ kind: 'circle', r: 1 }, { x: 300, z: 300 });
    const h = w.raycast({ x: 0, z: 0 }, { x: 1, z: 1 }, 1000)!;
    expect(h.body).toBe(c);
    expect(h.dist).toBeCloseTo(Math.hypot(300, 300) - 1, 3);
  });
});

describe('World2D performance smoke', () => {
  it('70 dynamics vs 600 statics steps fast', () => {
    const w = new World2D();
    for (let i = 0; i < 600; i++) {
      const x = (i % 30) * 20 - 300;
      const z = Math.floor(i / 30) * 20 - 200;
      w.addStatic({ kind: 'polygon', points: [{ x, z }, { x: x + 12, z }, { x: x + 12, z: z + 12 }, { x, z: z + 12 }] });
    }
    for (let i = 0; i < 70; i++) {
      w.addBody(dyn(i % 2 ? 'vehicle' : 'ped',
        i % 2 ? { kind: 'obb', halfW: 0.9, halfL: 2.3 } : { kind: 'circle', r: 0.3 },
        (i * 37) % 500 - 250, (i * 53) % 300 - 150, 100, 5, 3, (i * 0.7)));
    }
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) {
      for (const b of w.bodies()) {
        if (b.kind === 'static') continue;
        b.pos.x += b.vel.x * DT; b.pos.z += b.vel.z * DT;
      }
      w.step(DT);
    }
    const ms = (performance.now() - t0) / 120;
    expect(ms).toBeLessThan(5); // loose CI bound; real cost is far lower
    for (const b of w.bodies()) { expect(Number.isFinite(b.pos.x)).toBe(true); expect(Number.isFinite(b.pos.z)).toBe(true); }
  });
});
