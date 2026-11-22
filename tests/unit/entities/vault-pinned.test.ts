/**
 * MOVE2, part 1: the owner's complaint, "make sure you can jump over car hoods such that if you're pinned between two you can get away".
 * Each pinned scene (vault-scenes.ts) is first shown to hold the player (they cannot leave by walking), then Jump takes them over a
 * hood or a deck onto clear ground, at 30, 60 and 144 frames a second, with the car still and rolling. Refusals: too tall, no landing.
 */
import { describe, expect, it } from 'vitest';
import { PINNED_AFTER } from '@/entities/Player';
import { vaultSettings, VAULT_MAX_HEIGHT, topProfile } from '@/entities/vault';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { ALL_SCENES, SEALED_VANS, STOPPED_AGAINST, build, type SceneDef } from './vault-scenes';
import type { VaultScene } from './vault-harness';

const NEUTRAL = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };

/** The scene's own set-up step: the stopped-against case drives the car in and holds it there. */
function prepare(def: SceneDef, s: VaultScene): void {
  if (def !== STOPPED_AGAINST) return;
  const car = s.cars[0];
  car.driver = 'traffic';
  for (let i = 0; i < 900 && car.body.pos.x > 2.86; i++) { car.setInput({ ...NEUTRAL, throttle: 0.1 }); s.run(s.dt); }
  car.setInput({ ...NEUTRAL, brake: true, handbrake: true });
  s.run(0.6);
}

const FPS = [30, 60, 144];

describe('pinned: the player cannot walk out (the complaint, reproduced)', () => {
  for (const def of ALL_SCENES) {
    it(def.name, () => {
      const s = build(def);
      prepare(def, s);
      const p0 = { ...s.player.body.pos };
      s.run(PINNED_AFTER + 1.5, def.escapeKeys);
      expect(s.dist(p0), 'walked out').toBeLessThan(1.6);
      expect(s.freeRun, 'a clear run of 2 m').toBeLessThan(2.0);
      expect(s.player.vaultPrompt, 'prompt after 1.5 s boxed in').toBe(true);
    });
  }
});

describe('pinned: Jump gets the player out', () => {
  for (const fps of FPS) for (const def of ALL_SCENES.filter((d) => d.expect === 'vault')) {
    it(`${def.name} at ${fps} fps`, () => {
      const s = build(def, 1 / fps);
      prepare(def, s);
      const p0 = { ...s.player.body.pos };
      s.run(PINNED_AFTER + 0.3, def.escapeKeys);
      let vaulted = false;
      s.player.onVault = () => { vaulted = true; };
      s.run(2.5, {}, 0.0);
      expect(vaulted).toBe(true);
      expect(s.player.isVaulting).toBe(false);
      expect(s.inside, 'landed inside a collider').toBe(false);
      expect(s.freeRun, 'landed on clear ground').toBeGreaterThanOrEqual(2.0);
      expect(s.dist(p0)).toBeGreaterThan(1.6);
      expect(s.player.body.vehiclePass).toBe(false);
      expect(s.player.body.height ?? 0).toBe(0);
    });
  }
});

describe('pinned: sealed in by cars too tall to climb: squeeze out sideways', () => {
  it('never left inside a collider', () => {
    const s = build(SEALED_VANS);
    s.run(PINNED_AFTER + 0.3, SEALED_VANS.escapeKeys);
    s.run(0.05, {}, 0);
    s.run(3.0, {});
    expect(s.player.isVaulting).toBe(false);
    expect(s.inside).toBe(false);
    expect(s.freeRun).toBeGreaterThanOrEqual(1.5);
  });
});

describe('the profile comes from the spec at run time', () => {
  it('a sedan hood is vaultable, its cabin is not, a box truck and a bus never are', () => {
    const p = topProfile(VEHICLE_SPECS.sedan)!;
    expect(p.top(1.8)).not.toBeNull();
    expect(p.top(1.8)!).toBeLessThanOrEqual(VAULT_MAX_HEIGHT);
    expect(p.top(-1.9)).not.toBeNull();
    expect(p.top(0)).toBeNull();
    expect(topProfile(VEHICLE_SPECS.boxtruck)).toBeNull();
    expect(topProfile(VEHICLE_SPECS.bus)).toBeNull();
  });
  it('the setting exists and is on by default', () => { expect(vaultSettings.autoVault).toBe(true); });
});
