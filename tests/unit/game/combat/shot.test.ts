import { describe, expect, it } from 'vitest';
import { PISTOL } from '@/game/combat/items';
import { assistYaw, resolveShot } from '@/game/combat/shot';
import { World2D, makeCar, makePed, makeWall, EventBus } from './helpers';

const O = { x: 0, z: 0 };

describe('a shot picks the nearest thing along the ray', () => {
  it('a pedestrian in front of a car in front of a wall', () => {
    const world = new World2D();
    makeWall(world, 'w', -30);
    makeCar(world, 'c', 0, -20);
    const ped = makePed(world, new EventBus(), 'p', 0, -10);
    const s = resolveShot(world, O, 0);
    expect(s.target).toBe('ped');
    expect(s.body?.id).toBe(ped.id);
    expect(s.dist).toBeCloseTo(9.7, 0);
  });
  it('a car before a wall', () => {
    const world = new World2D();
    makeWall(world, 'w', -30);
    makeCar(world, 'c', 0, -12);
    expect(resolveShot(world, O, 0).target).toBe('vehicle');
  });
  it('a wall when nothing is in front of it', () => {
    const world = new World2D();
    makeWall(world, 'w', -30);
    const s = resolveShot(world, O, 0);
    expect(s.target).toBe('wall');
    expect(s.dist).toBeCloseTo(30, 1);
  });
  it('a miss past 60 m reports none', () => {
    const world = new World2D();
    makeWall(world, 'w', -80);
    const s = resolveShot(world, O, 0);
    expect(s.target).toBe('none');
    expect(s.dist).toBe(PISTOL.range);
  });
  it('fires along the camera yaw: east at PI/2', () => {
    const world = new World2D();
    makePed(world, new EventBus(), 'p', 15, 0);
    expect(resolveShot(world, O, Math.PI / 2).target).toBe('ped');
    expect(resolveShot(world, O, 0).target).toBe('none');
  });
  it('the shooter never hits their own body', () => {
    const world = new World2D();
    world.addBody({ id: 'player', kind: 'player', shape: { kind: 'circle', r: 0.4 }, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, mass: 80 });
    expect(resolveShot(world, O, 0).target).toBe('none');
  });
});

describe('aim assist', () => {
  it('pulls the shot onto a pedestrian a little off the crosshair line', () => {
    const world = new World2D();
    const ped = makePed(world, new EventBus(), 'p', 0.6, -12);
    expect(resolveShot(world, O, 0).target).toBe('none'); // the raw ray passes beside them
    const yaw = assistYaw(world, O, 0, [ped.body]);
    expect(resolveShot(world, O, yaw).target).toBe('ped');
  });
  it('ignores someone well off the line, or behind a wall', () => {
    const world = new World2D();
    const off = makePed(world, new EventBus(), 'p', 6, -12);
    expect(assistYaw(world, O, 0, [off.body])).toBe(0);
    const w2 = new World2D();
    makeWall(w2, 'w', -6);
    const hidden = makePed(w2, new EventBus(), 'q', 0.3, -12);
    expect(assistYaw(w2, O, 0, [hidden.body])).toBe(0);
  });
});
