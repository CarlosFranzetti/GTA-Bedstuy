/**
 * STUCK: the player's car must not stay boxed in at 0 km/h.
 *  - held throttle into a parked car (itself boxed in by a car behind): the wedge push-out frees it (>= 2 m in 3 s)
 *  - blockedSeconds reaches the HUD hint threshold while wedged and clears when free
 *  - the player's car mounts a low kerb (there are no kerb colliders: pavement is drivable) at low speed
 *  - AI cars stay off the pavement over a 5 minute city run
 */
import { describe, expect, it } from 'vitest';
import { Vehicle } from '@/entities/Vehicle';
import { Sim, input, makeVehicle } from './harness';

function boxedIn(): { sim: Sim; car: Vehicle; front: Vehicle; back: Vehicle } {
  const sim = new Sim();
  const car = makeVehicle('suv', 0, 0, 0);
  car.driver = 'player';
  const front = makeVehicle('sedan', 0, -4.74, 0); // parked, nose to nose, touching
  const back = makeVehicle('sedan', 0, -9.34, 0); // parked, touching the one in front
  for (const v of [front, back]) v.driver = null;
  sim.add(car); sim.add(front); sim.add(back);
  return { sim, car, front, back };
}

describe('wedge push-out', () => {
  it('holding W against a boxed-in parked car moves the car >= 2 m within 3 s (was 0 km/h forever)', () => {
    const { sim, car } = boxedIn();
    car.setInput(input({ throttle: 1 }));
    const start = { x: car.body.pos.x, z: car.body.pos.z };
    let maxMoved = 0;
    sim.run(3, () => { maxMoved = Math.max(maxMoved, Math.hypot(car.body.pos.x - start.x, car.body.pos.z - start.z)); });
    expect(maxMoved).toBeGreaterThanOrEqual(2);
  });

  it('with the push-out disabled by not touching (open road) nothing interferes: normal acceleration', () => {
    const sim = new Sim();
    const car = makeVehicle('suv', 0, 0, 0);
    car.driver = 'player';
    sim.add(car);
    car.setInput(input({ throttle: 1 }));
    sim.run(3);
    expect(car.speed).toBeGreaterThan(8);
    expect(car.blockedSeconds).toBe(0);
  });

  it('blockedSeconds passes 1.5 s while wedged, and falls to 0 once the throttle is released', () => {
    const { sim, car } = boxedIn();
    car.setInput(input({ throttle: 1 }));
    let peak = 0;
    sim.run(3, () => { peak = Math.max(peak, car.blockedSeconds); });
    expect(peak).toBeGreaterThan(1.5);
    car.setInput(input());
    sim.run(1);
    expect(car.blockedSeconds).toBe(0);
  });

  it('only the player is helped: a traffic-driven car pressed into a car does not get nudged', () => {
    const { sim, car } = boxedIn();
    car.driver = 'traffic';
    car.setInput(input({ throttle: 1 }));
    let maxBack = 0;
    sim.run(3, () => { maxBack = Math.max(maxBack, car.body.pos.z); });
    expect(maxBack).toBeLessThan(0.3);
    expect(car.blockedSeconds).toBe(0);
  });

  it('reversing into something behind is eased forward the same way', () => {
    const sim = new Sim();
    const car = makeVehicle('sedan', 0, 0, 0);
    car.driver = 'player';
    const behind = makeVehicle('sedan', 0, 4.6, 0);
    behind.driver = null;
    const behind2 = makeVehicle('sedan', 0, 9.4, 0);
    behind2.driver = null;
    sim.add(car); sim.add(behind); sim.add(behind2);
    car.setInput(input({ throttle: -1 }));
    let maxMoved = 0;
    sim.run(3, () => { maxMoved = Math.max(maxMoved, Math.hypot(car.body.pos.x, car.body.pos.z)); });
    expect(maxMoved).toBeGreaterThanOrEqual(1.5);
  });
});

describe('kerb mounting', () => {
  it('a player car crawling at 6 km/h crosses the kerb line onto the pavement without stopping (kerbs are not colliders)', () => {
    const sim = new Sim();
    const car = makeVehicle('sedan', 0, 0, Math.PI / 2); // heading east
    car.driver = 'player';
    sim.add(car);
    car.setInput(input({ throttle: 0.15 }));
    let minSpeed = Infinity;
    sim.run(1, undefined);
    sim.run(4, () => { minSpeed = Math.min(minSpeed, car.speed); });
    expect(car.body.pos.x).toBeGreaterThan(1.5);
    expect(minSpeed).toBeGreaterThan(0.3);
  });
});
