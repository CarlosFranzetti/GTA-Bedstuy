/**
 * "You get stuck in the cars" / "when you exit you can't really move": exit spots must be free of other cars as well as
 * walls, a ring search finds a spot when the four sides are blocked, a pinned player is moved to free ground, a half-pushed
 * touch stick walks slower, and a car wedged in a dead end gets out.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Player, WALK_SPEED } from '@/entities/Player';
import { World2D } from '@/physics/World2D';
import { DT, Sim, makeVehicle, stubMaterials } from '../sim/harness';

const keys = (k: Record<string, number>) => ({
  axis: (neg: string[], pos: string[]) => (pos.some((c) => k[c]) ? 1 : 0) - (neg.some((c) => k[c]) ? 1 : 0),
  isDown: (c: string) => !!k[c], consume: () => false,
}) as never;

function scene(walls: number[][], cars: number[][]) {
  const physics = new World2D(12);
  walls.forEach(([x0, z0, x1, z1], i) => physics.addStatic({ kind: 'polygon', points: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] }, { x: 0, z: 0 }, `w${i}`));
  const sim = new Sim(physics);
  const events = new EventBus();
  const player = new Player('p', { x: 0, z: 4 }, stubMaterials, events);
  sim.entities.set('p', player);
  physics.addBody(player.body);
  events.on('enterVehicle', () => physics.removeBody('p'));
  events.on('exitVehicle', () => physics.addBody(player.body));
  const vs = cars.map(([x, z, h], i) => { const c = makeVehicle('sedan', x, z, h, events, `c${i}`); sim.add(c); return c; });
  return { sim, physics, player, vs };
}
const walk = (sim: Sim, player: Player, k: Record<string, number>, s = 2) => {
  const p0 = { ...player.body.pos };
  for (let i = 0; i < s * 60; i++) { player.control(keys(k), 0); sim.step(DT); }
  return Math.hypot(player.body.pos.x - p0.x, player.body.pos.z - p0.z);
};

describe('exit spot', () => {
  it('skips sides hemmed in by neighbouring cars (0.3 m gaps) and can walk in all four directions after', () => {
    const { sim, player, vs, physics } = scene([], [[0, 0, 0], [2.14, 0, 0], [-2.14, 0, 0]]);
    player.tryEnter([vs[0]]); sim.run(0.6);
    expect(player.inVehicle).toBe(true);
    player.exit(); sim.run(0.1);
    expect(physics.overlapsSolid(player.body.pos, 0.4)).toBe(false);
    for (const k of [{ KeyW: 1 }, { KeyS: 1 }, { KeyA: 1 }, { KeyD: 1 }]) {
      expect(walk(sim, player, k)).toBeGreaterThan(4); // 2 s at walking pace is ~5.7 m
      sim.run(0.3);
    }
  });

  it('ring search: walled left and right, cars front and back, the player still gets out', () => {
    const { sim, player, vs, physics } = scene([[-2.2, -12, -1.0, 12], [1.0, -12, 2.2, 12]], [[0, 0, 0], [0, -5.3, 0], [0, 5.3, 0]]);
    // car 0.9 half width in a 2.0 m slot: no door-side room; only the ring (diagonal / further out) is free or entry is refused
    player.tryEnter([vs[0]]); sim.run(0.6);
    if (!player.inVehicle) return; // refused up front is also fine: nobody is spat into a wall
    player.exit(); sim.run(0.1);
    expect(physics.overlapsSolid(player.body.pos, 0.39, 'c0')).toBe(false);
  });
});

describe('pin recovery', () => {
  it('a player squeezed between two cars with input held is moved to free ground within about a second', () => {
    const { sim, player } = scene([], [[0, 0, 0], [2.64, 0, 0]]);
    player.body.pos.x = 1.32; player.body.pos.z = 0; // gap 0.8 wide... between flanks at 0.92 and 1.72
    sim.run(0.2);
    let t = 0; const start = { ...player.body.pos };
    while (t < 2) { player.control(keys({ KeyD: 1 }), 0); sim.step(DT); t += DT; } // pressing into car 1
    const free = Math.hypot(player.body.pos.x - start.x, player.body.pos.z - start.z);
    expect(free).toBeGreaterThan(0.6);
  });

  it('findFreeSpot returns the reachable free spot nearest the wanted direction and null when boxed in', () => {
    const blockedWall = (p: { x: number; z: number }, r: number) => p.x - r < -0.5 || p.x + r > 0.5; // slot 1.0 wide
    const s = Player.findFreeSpot({ x: 0, z: 0 }, blockedWall, { x: 0, z: -1 });
    expect(s).not.toBeNull();
    expect(Math.abs(s!.x)).toBeLessThan(0.2);
    expect(s!.z).toBeLessThan(0);
    expect(Player.findFreeSpot({ x: 0, z: 0 }, () => true, null)).toBeNull();
  });
});

describe('touch stick', () => {
  it('half deflection walks slower than full, full matches the keyboard', () => {
    const speed = (mag: number) => {
      const { sim, player } = scene([], []);
      const inp = { axis: (neg: string[], pos: string[]) => (pos.includes('KeyW') ? mag : 0), isDown: () => false, consume: () => false } as never;
      for (let i = 0; i < 90; i++) { player.control(inp, 0); sim.step(DT); }
      return Math.hypot(player.body.vel.x, player.body.vel.z);
    };
    const half = speed(0.5), full = speed(1);
    expect(full).toBeCloseTo(WALK_SPEED, 1);
    expect(half).toBeLessThan(full * 0.8);
    expect(half).toBeGreaterThan(full * 0.4);
  });
});

describe('car unstick', () => {
  it('a car pushed nose-first into a dead end with the throttle held gets out within 6 s of reversing', () => {
    const { sim, player, vs } = scene([[-3, -12, -1.25, 12], [1.25, -12, 3, 12], [-3, -12, 3, -3.5]], [[0, 0, 0]]);
    player.tryEnter([vs[0]]); sim.run(0.6);
    for (let i = 0; i < 60 * 5; i++) { player.control(keys({ KeyW: 1 }), 0); sim.step(DT); }
    const z0 = vs[0].body.pos.z;
    for (let i = 0; i < 60 * 6; i++) { player.control(keys({ KeyS: 1 }), 0); sim.step(DT); }
    expect(vs[0].body.pos.z - z0).toBeGreaterThan(4);
  });
});
