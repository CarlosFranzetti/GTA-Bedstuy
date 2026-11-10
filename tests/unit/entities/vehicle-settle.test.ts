import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { makeVehicle } from '../sim/harness';

describe('parked vehicle settling', () => {
  it('stops costing work at rest but reacts at once when pushed, driven or hit', () => {
    const v = makeVehicle('sedan', 0, 0, 0, new EventBus());
    for (let i = 0; i < 120; i++) v.update(1 / 60);
    const x0 = v.body.pos.x;
    v.update(1 / 60);
    expect(v.body.pos.x).toBe(x0);
    // pushed (as World2D does): it must roll/slide and settle somewhere else
    v.body.vel.x = 3;
    for (let i = 0; i < 60; i++) v.update(1 / 60);
    expect(v.body.pos.x).toBeGreaterThan(x0 + 0.05);
    for (let i = 0; i < 300; i++) v.update(1 / 60);
    // driven: a driver wakes it
    v.driver = 'player';
    v.setInput({ throttle: 1, steer: 0, brake: false, handbrake: false, horn: false });
    for (let i = 0; i < 120; i++) v.update(1 / 60);
    expect(v.speed).toBeGreaterThan(2);
  });
});
