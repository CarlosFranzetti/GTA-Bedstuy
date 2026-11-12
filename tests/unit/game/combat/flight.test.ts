import { describe, expect, it } from 'vitest';
import { THROW, bounce, impactOutcome, launch, stepProjectile, type FlightHit } from '@/game/combat/projectile';
import { World2D, makeCar, makePed, makeWall, EventBus } from './helpers';

function fly(world: World2D, kind: 'bottle' | 'brick', yaw: number, from = { x: 0, z: 0 }): { hit: FlightHit | null; t: number; pr: ReturnType<typeof launch> } {
  const pr = launch(kind, from, yaw);
  for (let i = 0; i < 600; i++) {
    const hit = stepProjectile(pr, 1 / 60, world, 'player');
    if (hit) return { hit, t: i / 60, pr };
    if (!pr.alive) break;
  }
  return { hit: null, t: 10, pr };
}

describe('a thrown item in flight', () => {
  it('leaves the hand at 14 m/s along the camera yaw, slightly up', () => {
    // heading 0 is -z; heading PI/2 is +x
    const p = launch('bottle', { x: 0, z: 0 }, Math.PI / 2);
    expect(p.vx).toBeCloseTo(THROW.speed, 5);
    expect(p.vz).toBeCloseTo(0, 5);
    expect(p.vy).toBeGreaterThan(0);
    expect(p.vy).toBeLessThan(THROW.speed * 0.4);
    expect(p.x).toBeGreaterThan(0);
  });

  it('follows a gravity arc and lands on the ground 8 to 14 m away', () => {
    const world = new World2D();
    const { hit, pr, t } = fly(world, 'brick', 0);
    expect(hit?.target).toBe('ground');
    const range = Math.hypot(pr.x, pr.z);
    expect(range).toBeGreaterThan(8);
    expect(range).toBeLessThan(14);
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(1.2);
    expect(pr.z).toBeLessThan(0); // went forward (-z)
  });

  it('hits a pedestrian in its path first', () => {
    const world = new World2D();
    const ped = makePed(world, new EventBus(), 'p1', 0, -6);
    const { hit } = fly(world, 'bottle', 0);
    expect(hit?.target).toBe('ped');
    expect(hit?.body?.id).toBe(ped.id);
  });

  it('hits a vehicle', () => {
    const world = new World2D();
    makeCar(world, 'c1', 0, -7);
    const { hit } = fly(world, 'bottle', 0);
    expect(hit?.target).toBe('vehicle');
  });

  it('hits a wall and stops there', () => {
    const world = new World2D();
    makeWall(world, 'w1', -5);
    const { hit, pr } = fly(world, 'brick', 0);
    expect(hit?.target).toBe('wall');
    expect(pr.z).toBeGreaterThan(-5.3);
  });

  it('passes over a body that is lower than the arc, and hits the wall behind it', () => {
    const world = new World2D();
    makeCar(world, 'low', 0, -2.5, 0, 0.3); // a 0.3 m tall thing: the item is at head height there
    makeWall(world, 'w1', -7);
    const { hit } = fly(world, 'brick', 0);
    expect(hit?.target).toBe('wall');
  });

  it('the nearest thing wins', () => {
    const world = new World2D();
    makeWall(world, 'w1', -9);
    makeCar(world, 'c1', 0, -6);
    makePed(world, new EventBus(), 'p1', 0, -4);
    expect(fly(world, 'bottle', 0).hit?.target).toBe('ped');
  });
});

describe('what an item does on each kind of hit', () => {
  it('a bottle shatters on everything, and thuds too on a car', () => {
    for (const t of ['ped', 'vehicle', 'wall', 'ground'] as const) {
      const o = impactOutcome('bottle', t);
      expect(o.shatters).toBe(true);
      expect(o.dropsAsPickup).toBe(false);
      expect(o.sound).toBe('glass');
      expect(o.particles).toBe('glass');
    }
    expect(impactOutcome('bottle', 'vehicle').carThud).toBe(true);
    expect(impactOutcome('bottle', 'wall').carThud).toBe(false);
  });
  it('a brick knocks a pedestrian down and can be picked up again', () => {
    const o = impactOutcome('brick', 'ped');
    expect(o).toMatchObject({ knockdown: true, shatters: false, dropsAsPickup: true, sound: 'thud' });
    expect(impactOutcome('brick', 'vehicle')).toMatchObject({ knockdown: false, carThud: true });
    expect(impactOutcome('brick', 'wall').particles).toBe('dust');
    expect(impactOutcome('brick', 'ground').particles).toBe('dust');
  });
  it('only pedestrians go down', () => {
    expect(impactOutcome('bottle', 'ped').knockdown).toBe(true);
    for (const t of ['vehicle', 'wall', 'ground'] as const) expect(impactOutcome('bottle', t).knockdown).toBe(false);
  });
  it('a brick bounces off the ground a few times and comes to rest', () => {
    const world = new World2D();
    const pr = launch('brick', { x: 0, z: 0 }, 0);
    let rested = false, bounces = 0;
    for (let i = 0; i < 1200 && !rested; i++) {
      const hit = stepProjectile(pr, 1 / 60, world, 'player');
      if (hit) { bounces++; if (!bounce(pr, hit.target)) rested = true; }
    }
    expect(rested).toBe(true);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(bounces).toBeLessThanOrEqual(5);
  });
});
