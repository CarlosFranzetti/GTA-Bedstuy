import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { World2D } from '@/physics/World2D';
import { Combat } from '@/game/combat/Combat';
import type { Pedestrian } from '@/entities/Pedestrian';
import { fakeInput, fakePlayer, makePed } from '../game/combat/helpers';

const DT = 1 / 60;

/** A jab thrown at a pedestrian that keeps walking at `speed` along (dx, dz) from `gap` metres in front of the player (who faces -z). */
function jab(gap: number, dx: number, dz: number, speed = 1.3): { hit: boolean; ped: Pedestrian } {
  const events = new EventBus(); const world = new World2D();
  const player = fakePlayer(0, 0, 0);
  const input = fakeInput();
  const peds: Pedestrian[] = [];
  const combat = new Combat({ events, world, peds: () => peds, player });
  const ped = makePed(world, events, 'p', 0, -gap); peds.push(ped);
  let hit = false;
  events.on('pedHit', () => { hit = true; });
  input.press();
  for (let i = 0; i < 40; i++) {
    ped.body.vel.x = dx * speed; ped.body.vel.z = dz * speed;
    ped.body.pos.x += ped.body.vel.x * DT; ped.body.pos.z += ped.body.vel.z * DT;
    combat.update(DT, { viewYaw: 0, blocked: false, input });
    input.edge = false;
    if (hit) break;
  }
  return { hit, ped };
}

describe('a jab against a walking pedestrian', () => {
  it('connects when the target walks away from the player at 1.3 m/s from 1.1 m', () => { expect(jab(1.1, 0, -1).hit).toBe(true); });
  it('connects when the target walks towards the player', () => { expect(jab(1.3, 0, 1).hit).toBe(true); });
  it('connects when the target walks across in front of the player', () => {
    expect(jab(1.0, 1, 0).hit).toBe(true);
    expect(jab(1.0, -1, 0).hit).toBe(true);
  });
  it('still misses someone clearly out of reach (2 m, walking away)', () => { expect(jab(2.0, 0, -1).hit).toBe(false); });
});
