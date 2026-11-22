/**
 * MOVE2: the vault outside the pinned scenes: a key press at a hood, refusals, a rolling car, auto-vault at a sprint, walls, a held player.
 * Cars face +x (heading pi / 2). Frame rates 30, 60 and 144.
 */
import { describe, expect, it } from 'vitest';
import { vaultSettings } from '@/entities/vault';
import { HALF_PI, VaultScene } from './vault-harness';

const FPS = [30, 60, 144];
const NEUTRAL = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };

describe('a key press at a hood', () => {
  for (const fps of FPS) it(`walks into the nose of a parked sedan and presses Jump at ${fps} fps: over the hood and out the other side`, () => {
    const s = new VaultScene([], [{ x: 0, z: 0, heading: HALF_PI }], { x: 5, z: 0 }, 1 / fps, -HALF_PI);
    s.run(2.2, { KeyA: 1 });
    expect(s.player.body.pos.x).toBeGreaterThan(2.7); // stopped by the nose
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    const track: number[] = [];
    s.run(2.0, { KeyA: 1 }, 0, 0, () => track.push((s.player as unknown as { vaultY: number }).vaultY));
    expect(vaulted).toBe(true);
    expect(Math.max(...track)).toBeGreaterThan(0.8);
    expect(Math.max(...track)).toBeLessThanOrEqual(1.35);
    expect(s.inside).toBe(false);
    expect(s.player.body.pos.x).toBeLessThan(2.3); // beside the car, past the nose
    expect(Math.abs(s.player.body.pos.z)).toBeGreaterThan(1.2);
  });

  it('a press while looking away from the car is a plain jump', () => {
    const s = new VaultScene([], [{ x: 0, z: 0, heading: HALF_PI }], { x: 3.4, z: 0 }, 1 / 60, HALF_PI);
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    s.run(1, { KeyD: 1 }, 0.1);
    expect(vaulted).toBe(false);
  });
});

describe('refusals', () => {
  it('a box truck front is too tall: a stumble, no vault, never inside the truck', () => {
    const s = new VaultScene([], [{ type: 'boxtruck', x: 0, z: 0, heading: HALF_PI }], { x: 6, z: 0 }, 1 / 60, -HALF_PI);
    s.run(2.5, { KeyA: 1 });
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    s.run(1.5, { KeyA: 1 }, 0);
    expect(vaulted).toBe(false);
    expect(s.inside).toBe(false);
    expect(s.player.body.pos.x).toBeGreaterThan(3.8);
  });

  it('a bus and a cargo van are refused the same way', () => {
    for (const type of ['bus', 'cargovan'] as const) {
      const s = new VaultScene([], [{ type, x: 0, z: 0, heading: HALF_PI }], { x: 8, z: 0 }, 1 / 60, -HALF_PI);
      s.run(3, { KeyA: 1 });
      let vaulted = false; s.player.onVault = () => { vaulted = true; };
      s.run(1, { KeyA: 1 }, 0);
      expect(vaulted, type).toBe(false);
    }
  });

  it('no landing spot (a wall close behind the car on both sides): refused, nobody ends in a collider or beyond the wall', () => {
    const s = new VaultScene(
      [{ x0: -9, z0: -1.5, x1: 9, z1: -3 }, { x0: -9, z0: 1.5, x1: 9, z1: 3 }],
      [{ x: 0, z: 0, heading: HALF_PI }], { x: 5, z: 0 }, 1 / 60, -HALF_PI);
    s.run(2.2, { KeyA: 1 });
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    let minX = 9;
    s.run(1.5, { KeyA: 1 }, 0, 0, () => { minX = Math.min(minX, s.player.body.pos.x); });
    expect(vaulted).toBe(false);
    expect(minX).toBeGreaterThan(2.7);
    expect(s.inside).toBe(false);
  });

  it('a car rolling faster than 4 m/s is not crossed', () => {
    const s = new VaultScene([], [{ x: 0, z: 0, heading: HALF_PI }], { x: 1.7, z: -2.2 }, 1 / 60, Math.PI);
    s.cars[0].driver = 'traffic'; s.cars[0].body.vel.x = 7;
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    s.run(0.3, { KeyS: 1 }, 0);
    expect(vaulted).toBe(false);
  });

  it('a held player cannot vault', () => {
    const s = new VaultScene([], [{ x: 0, z: 0, heading: HALF_PI }], { x: 5, z: 0 }, 1 / 60, -HALF_PI);
    s.run(2.2, { KeyA: 1 });
    s.player.held = true;
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    s.run(1, { KeyA: 1 }, 0);
    expect(vaulted).toBe(false);
    expect(s.player.vaultPrompt).toBe(false);
  });
});

describe('a rolling car', () => {
  for (const fps of FPS) it(`a sedan creeping at 3 m/s is crossed at the hood, ${fps} fps, landing clear`, () => {
    const s = new VaultScene([], [{ x: 0, z: 0, heading: HALF_PI }], { x: 2.0, z: -1.5 }, 1 / fps, Math.PI);
    const car = s.cars[0];
    car.driver = 'traffic'; car.body.vel.x = 3; car.setInput({ ...NEUTRAL, throttle: 0.15 });
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    s.run(0.1, { KeyS: 1 }, null);
    s.run(0.2, { KeyS: 1 }, 0);
    s.run(1.6, { KeyS: 1 });
    expect(vaulted).toBe(true);
    expect(s.player.isVaulting).toBe(false);
    expect(s.inside).toBe(false);
    expect(s.player.body.vehiclePass).toBe(false);
  });
});

describe('auto-vault: running into a hood at a sprint', () => {
  const sprint = (autoVault: boolean, fps = 60) => {
    vaultSettings.autoVault = autoVault;
    const s = new VaultScene([], [{ x: 0, z: 0, heading: HALF_PI }], { x: 14, z: 0.3 }, 1 / fps, -HALF_PI);
    let vaulted = false; s.player.onVault = () => { vaulted = true; };
    let minX = 99;
    s.run(4, { KeyA: 1, ShiftLeft: 1 }, null, 0, () => { minX = Math.min(minX, s.player.body.pos.x); });
    vaultSettings.autoVault = true;
    return { s, vaulted, minX };
  };
  for (const fps of FPS) it(`vaults by itself at ${fps} fps`, () => {
    const { s, vaulted } = sprint(true, fps);
    expect(vaulted).toBe(true);
    expect(s.inside).toBe(false);
    expect(s.player.body.pos.x).toBeLessThan(1.5); // carried on past the hood
  });
  it('with the setting off it is a wall: no vault, stopped at the nose', () => {
    const { vaulted, minX } = sprint(false);
    expect(vaulted).toBe(false);
    expect(minX).toBeGreaterThan(2.7);
  });
});

describe('walls: the body never tunnels', () => {
  it('the path is walled in beside the car: nobody is ever beyond the wall', () => {
    const s = new VaultScene([{ x0: -9, z0: -1.55, x1: 9, z1: -1.35 }], [{ x: 0, z: 0, heading: HALF_PI }], { x: 1.6, z: 2.1 }, 1 / 60, 0);
    s.run(0.6, { KeyW: 1 });
    let minZ = 9;
    s.run(2, { KeyW: 1 }, 0, 0, () => { minZ = Math.min(minZ, s.player.body.pos.z); });
    expect(minZ).toBeGreaterThan(-1.35);
    expect(s.inside).toBe(false);
  });
});
