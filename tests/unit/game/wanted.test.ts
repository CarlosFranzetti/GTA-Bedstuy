import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { WantedSystem } from '@/game/WantedSystem';

const P = { x: 0, z: 0 };

function setup() {
  const events = new EventBus();
  const wanted = new WantedSystem(events);
  const changes: number[] = [];
  events.on('wantedChanged', (e) => changes.push(e.stars));
  return { events, wanted, changes };
}

describe('WantedSystem', () => {
  it('starts at zero stars', () => {
    expect(setup().wanted.stars).toBe(0);
  });

  it('adds one star per hitPed, hitCop and carjack, and emits wantedChanged', () => {
    const { events, wanted, changes } = setup();
    events.emit('crime', { type: 'hitPed', pos: P });
    expect(wanted.stars).toBe(1);
    events.emit('crime', { type: 'hitCop', pos: P });
    expect(wanted.stars).toBe(2);
    events.emit('crime', { type: 'carjack', pos: P });
    expect(wanted.stars).toBe(3);
    expect(changes).toEqual([1, 2, 3]);
  });

  it('caps at 3 stars without re-emitting', () => {
    const { events, wanted, changes } = setup();
    for (let i = 0; i < 6; i++) events.emit('crime', { type: 'hitPed', pos: P });
    expect(wanted.stars).toBe(3);
    expect(changes).toEqual([1, 2, 3]);
  });

  it('hitVehicle adds nothing', () => {
    const { events, wanted, changes } = setup();
    events.emit('crime', { type: 'hitVehicle', pos: P });
    expect(wanted.stars).toBe(0);
    expect(changes).toEqual([]);
  });

  it('loses a star after 20 s without a new crime, repeatedly', () => {
    const { events, wanted, changes } = setup();
    events.emit('crime', { type: 'hitPed', pos: P });
    events.emit('crime', { type: 'hitPed', pos: P });
    events.emit('crime', { type: 'hitPed', pos: P });
    for (let t = 0; t < 19.5; t += 0.5) wanted.update(0.5);
    expect(wanted.stars).toBe(3);
    wanted.update(0.5 + 0.01);
    expect(wanted.stars).toBe(2);
    for (let t = 0; t < 20.1; t += 0.5) wanted.update(0.5);
    expect(wanted.stars).toBe(1);
    for (let t = 0; t < 20.1; t += 0.5) wanted.update(0.5);
    expect(wanted.stars).toBe(0);
    expect(changes).toEqual([1, 2, 3, 2, 1, 0]);
  });

  it('a new crime restarts the decay timer', () => {
    const { events, wanted } = setup();
    events.emit('crime', { type: 'hitPed', pos: P });
    for (let t = 0; t < 15; t += 0.5) wanted.update(0.5);
    events.emit('crime', { type: 'hitPed', pos: P });
    for (let t = 0; t < 15; t += 0.5) wanted.update(0.5);
    expect(wanted.stars).toBe(2);
    for (let t = 0; t < 6; t += 0.5) wanted.update(0.5);
    expect(wanted.stars).toBe(1);
  });

  it('does not decay below zero or emit while at zero', () => {
    const { wanted, changes } = setup();
    for (let i = 0; i < 100; i++) wanted.update(1);
    expect(wanted.stars).toBe(0);
    expect(changes).toEqual([]);
  });
});
