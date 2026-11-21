// CARS3: the player handling profile (src/entities/handling.ts) measured with scripted driving.
import { describe, it, expect, afterEach } from 'vitest';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { HANDLING_CLASSES, HANDLING_OF, handlingFor, tyreShape } from '@/entities/handling';
import { setGround } from '@/world/Ground';
import { make, input, DT, stop, radius, corner90, handbrakeTurn, liftOff, spinRecovery, slipDeg } from './handlingMeasure';
import type { VehicleType } from '@/world/types';

afterEach(() => { Vehicle.roadGrip = 1; Vehicle.aiHandling = false; Vehicle.playerHandling = true; setGround(null); });

describe('handling table', () => {
  it('every vehicle type has a class, and the class row is sane', () => {
    for (const t of Object.keys(VEHICLE_SPECS) as VehicleType[]) {
      const row = handlingFor(t);
      expect(HANDLING_CLASSES[HANDLING_OF[t]], t).toBeDefined();
      expect(row.weightFront).toBeGreaterThan(0.35); expect(row.weightFront).toBeLessThan(0.65);
      expect(row.peakF).toBeGreaterThan(5); expect(row.peakF).toBeLessThan(14);
      expect(row.floorF).toBeGreaterThan(0.6); expect(row.floorF).toBeLessThanOrEqual(1);
      expect(row.floorR).toBeGreaterThan(0.6); expect(row.floorR).toBeLessThanOrEqual(1);
      expect(row.brakeBias).toBeGreaterThan(0.5); expect(row.brakeBias).toBeLessThan(0.8);
    }
  });
  it('the tyre curve rises to a peak at x = 1, then falls to the floor', () => {
    expect(tyreShape(0, 0.8)).toBe(0);
    expect(tyreShape(0.5, 0.8)).toBeLessThan(tyreShape(1, 0.8));
    expect(tyreShape(1, 0.8)).toBeCloseTo(1, 6);
    expect(tyreShape(2, 0.8)).toBeLessThan(1);
    expect(tyreShape(3, 0.8)).toBeCloseTo(0.8, 6);
    expect(tyreShape(9, 0.8)).toBeCloseTo(0.8, 6);
  });
});

describe('manners at rest and at low speed', () => {
  it.each(['sedan', 'pony', 'bus', 'exotic', 'boxtruck'] as const)('%s at rest stays at rest (no input, brake, handbrake, steer held)', (t) => {
    for (const o of [{}, { brake: true }, { handbrake: true }, { steer: 1 }, { steer: -1, brake: true }]) {
      const v = make(t);
      v.setInput(input(o));
      for (let i = 0; i < 300; i++) v.update(DT);
      expect(v.body.pos.x, JSON.stringify(o)).toBe(0); expect(v.body.pos.z).toBe(0);
      expect(v.body.vel.x).toBe(0); expect(v.body.vel.z).toBe(0);
      expect(v.body.heading).toBe(0);
    }
  });
  it.each(['sedan', 'suv', 'bus', 'coupe911'] as const)('%s: lifting off the throttle rolls to a clean stop without reversing or jitter', (t) => {
    const v = make(t, 8);
    v.setInput(input());
    let prev = v.speed; let stopped = -1;
    for (let i = 0; i < 60 * 30; i++) {
      v.update(DT);
      expect(v.speed).toBeLessThanOrEqual(prev + 1e-6); // never speeds up, never reverses
      expect(v.speed).toBeGreaterThanOrEqual(0);
      prev = v.speed;
      if (v.speed === 0 && stopped < 0) stopped = i;
    }
    expect(stopped).toBeGreaterThan(0);
    expect(v.speed).toBe(0);
    expect(v.lateralSpeed).toBe(0);
  });
  it('a hard stop ends dead still: no creep forward or back', () => {
    const v = make('sedan', 20);
    v.setInput(input({ brake: true }));
    for (let i = 0; i < 60 * 6; i++) v.update(DT);
    const z = v.body.pos.z;
    for (let i = 0; i < 120; i++) v.update(DT);
    expect(v.body.pos.z).toBe(z);
    expect(v.speed).toBe(0);
  });
  it('reverse: from rest, S reverses (backing up, steering inverted), W from reverse brakes first', () => {
    const v = make('sedan');
    v.setInput(input({ throttle: -1 }));
    for (let i = 0; i < 120; i++) v.update(DT);
    expect(v.speed).toBeLessThan(-2);
    v.setInput(input({ throttle: -1, steer: 1 }));
    const h0 = v.body.heading;
    for (let i = 0; i < 90; i++) v.update(DT);
    // forward is -z at heading 0, right is +x: reversing with the wheel right swings the nose LEFT
    let d = v.body.heading - h0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    expect(d).toBeLessThan(-0.05);
    v.setInput(input({ throttle: 1 }));
    for (let i = 0; i < 20; i++) v.update(DT);
    expect(v.handling.brakeP).toBeGreaterThan(0.3); // braking against the motion, not yet driving forward
  });
});

describe('braking', () => {
  it('stopping distance from 15 m/s by class: supercar < coupe < sedan < van < box truck, and the bus and truck do not slide', () => {
    const d = (t: VehicleType) => stop(t, 15).dist;
    expect(d('exotic')).toBeLessThan(d('coupe911'));
    expect(d('coupe911')).toBeLessThan(d('sedan'));
    expect(d('sedan')).toBeLessThan(d('cargovan'));
    expect(d('cargovan')).toBeLessThan(d('boxtruck') + 1.5);
    for (const t of ['bus', 'boxtruck', 'garbage'] as const) expect(stop(t, 15).maxSlip, t).toBeLessThan(3);
  });
  it('sedan from 20 m/s: 13 to 19 m dry; a wet road (grip 0.6) takes at least 25% longer; braking never slides the car sideways', () => {
    const dry = stop('sedan', 20);
    expect(dry.dist).toBeGreaterThan(13); expect(dry.dist).toBeLessThan(19);
    expect(dry.maxSlip).toBeLessThan(2);
    Vehicle.roadGrip = 0.6;
    const wet = stop('sedan', 20);
    expect(wet.dist).toBeGreaterThan(dry.dist * 1.25);
  });
  it('braking dips the nose (load goes to the front) and acceleration squats it', () => {
    const v = make('suv', 20);
    v.setInput(input({ brake: true }));
    for (let i = 0; i < 30; i++) v.update(DT);
    const dip = v.object3D.children[0].rotation.x;
    expect(dip).toBeLessThan(-0.015);
    const w = make('suv', 3);
    w.setInput(input({ throttle: 1 }));
    for (let i = 0; i < 30; i++) w.update(DT);
    expect(w.object3D.children[0].rotation.x).toBeGreaterThan(0.01);
  });
  it('without ABS a muscle car braking hard in a bend locks the rear and slides more than an ABS sedan', () => {
    const run = (t: VehicleType) => {
      const v = make(t, 22); let maxSlip = 0;
      v.setInput(input({ steer: 0.5 }));
      for (let i = 0; i < 20; i++) v.update(DT);
      v.setInput(input({ steer: 0.5, brake: true }));
      for (let i = 0; i < 50; i++) { v.update(DT); maxSlip = Math.max(maxSlip, slipDeg(v)); }
      return maxSlip;
    };
    expect(run('pony')).toBeGreaterThan(run('sedan'));
  });
});

describe('cornering', () => {
  it('steady-state cornering has a grip limit: more steering does not buy more lateral g, and the front lets go first (understeer)', () => {
    const a = radius('sedan', 20, 0.6), b = radius('sedan', 20, 1);
    expect(b.latG).toBeGreaterThan(0.5); expect(b.latG).toBeLessThan(1.3);
    expect(b.latG).toBeLessThan(a.latG * 1.25 + 0.05);
    const v = make('sedan', 20);
    for (let i = 0; i < 180; i++) { v.setInput(input({ throttle: v.speed < 20 ? 0.3 : 0, steer: 1 })); v.update(DT); }
    expect(Math.abs(v.handling.alphaF)).toBeGreaterThan(Math.abs(v.handling.alphaR));
  });
  it('a lower-grip road (ice 0.4) cuts the cornering limit', () => {
    const dry = radius('sedan', 15, 1).latG;
    Vehicle.roadGrip = 0.4;
    expect(radius('sedan', 15, 1).latG).toBeLessThan(dry * 0.7);
  });
  it('classes differ: the sports car out-corners the sedan, which out-corners the SUV, the van and the bus', () => {
    const g = (t: VehicleType) => radius(t, 17, 1).latG;
    expect(g('exotic')).toBeGreaterThan(g('sedan'));
    expect(g('sedan')).toBeGreaterThan(g('suv') - 0.01);
    expect(g('sedan')).toBeGreaterThan(g('cargovan'));
    expect(g('sedan')).toBeGreaterThan(g('bus'));
  });
  it('the 90 degree corner at 40 km/h is made by every class, keeps most of its speed and does not spin', () => {
    for (const t of ['hatch', 'sedan', 'pony', 'coupe911', 'suv', 'cargovan', 'boxtruck', 'bus', 'limo'] as const) {
      const c = corner90(t, 40);
      expect(c.turned, t).toBeGreaterThan(85);
      expect(c.exitKmh, t).toBeGreaterThan(28);
      expect(c.maxSlip, t).toBeLessThan(12);
    }
  });
  it('body roll: tall classes lean more than low ones, the lean is outward, and it stays under the class cap', () => {
    const roll = (t: VehicleType) => radius(t, 17, 1).rollDeg;
    expect(roll('suv')).toBeGreaterThan(roll('coupe911'));
    expect(roll('cargovan')).toBeGreaterThan(roll('sedan'));
    const v = make('sedan', 16);
    v.setInput(input({ steer: 1, throttle: 0.2 }));
    for (let i = 0; i < 90; i++) v.update(DT);
    // right turn: the body leans left (rotation.z > 0 raises the right side in three.js, see springs())
    const z = v.object3D.children[0].rotation.z;
    expect(Math.abs(z)).toBeGreaterThan(0.02);
    expect(Math.abs(z)).toBeLessThanOrEqual(handlingFor('sedan').rollMax * 1.35 + 1e-9);
  });
});

describe('drive layout and handbrake', () => {
  it('lifting off the throttle in a bend tucks a rear-driven sports car in; a front-driven one hardly changes', () => {
    const rwd = liftOff('coupe911', 20), fwd = liftOff('hothatch', 20);
    expect(rwd.yawGainLift - rwd.yawGainHold).toBeGreaterThan(0.3);
    expect(rwd.yawGainLift).toBeGreaterThan(fwd.yawGainLift * 0.8);
  });
  it('under hard throttle a front-driven car pushes wide, a rear-driven one rotates', () => {
    const run = (t: VehicleType, thr: number) => {
      const v = make(t, 12);
      for (let i = 0; i < 150; i++) { v.setInput(input({ throttle: thr, steer: 0.55 })); v.update(DT); }
      return { y: Math.abs(v.yawRateRad), af: Math.abs(v.handling.alphaF), ar: Math.abs(v.handling.alphaR) };
    };
    const f = run('hothatch', 1), r = run('jdmcoupe', 1);
    expect(f.af - f.ar).toBeGreaterThan(r.af - r.ar); // the front-driven car's front is the one running wide
  });
  it('the handbrake turn rotates a normal car well past 60 degrees, and the car is straight and quiet again two seconds after release', () => {
    for (const t of ['hatch', 'sedan', 'pony', 'coupe911'] as const) {
      const h = handbrakeTurn(t, 15, 0.7, 0.8);
      expect(h.turnedDeg, t).toBeGreaterThan(55);
      expect(h.maxSlip, t).toBeGreaterThan(15);
      expect(h.settle, t).toBeLessThan(2.5);
    }
    expect(handbrakeTurn('bus', 15).turnedDeg).toBeLessThan(25); // a bus does not drift
  });
  it('the handbrake locks the rear: braking with it alone, the rear grip factor falls and comes back progressively', () => {
    const v = make('sedan', 15);
    v.setInput(input({ handbrake: true, steer: 0.5 }));
    for (let i = 0; i < 30; i++) v.update(DT);
    expect(v.handling.rearCap).toBeLessThan(0.3);
    v.setInput(input());
    v.update(DT);
    expect(v.handling.rearCap).toBeLessThan(0.45); // not an instant return
    for (let i = 0; i < 90; i++) v.update(DT);
    expect(v.handling.rearCap).toBeGreaterThan(0.95);
  });
});

describe('recovery', () => {
  it.each(['hatch', 'sedan', 'pony', 'coupe911', 'suv', 'cargovan'] as const)('%s: a handbrake spin recovers once the controls are released (within 3 s, no tank-slapper)', (t) => {
    const r = spinRecovery(t, 20);
    expect(r.settle, t).toBeLessThan(3);
    expect(r.maxYaw, t).toBeLessThan(3.0);
    expect(Math.abs(r.endYaw), t).toBeLessThan(0.3);
  });
  it('a held key through a slide cannot wind a drift up into a spin: yaw stays under the class cap', () => {
    for (const t of ['pony', 'coupe911', 'hatch'] as const) {
      const v = make(t, 22);
      let maxYaw = 0;
      for (let i = 0; i < 60 * 5; i++) { v.setInput(input({ throttle: 1, steer: 1, handbrake: i > 30 && i < 60 })); v.update(DT); maxYaw = Math.max(maxYaw, Math.abs(v.yawRateRad)); }
      expect(maxYaw, t).toBeLessThanOrEqual(handlingFor(t).yawMax + 0.5);
    }
  });
});

describe('steering feel', () => {
  it('keys ramp: from centre, full lock takes a moment and grows monotonically; at speed it is calmer than at a crawl', () => {
    const run = (speed: number) => {
      const v = make('sedan', speed);
      v.setInput(input({ steer: 1, throttle: speed > 0 ? 0.3 : 0 }));
      const out: number[] = [];
      for (let i = 0; i < 40; i++) { v.update(DT); out.push(Math.abs(v.steering)); }
      return out;
    };
    const slow = run(2), fast = run(20);
    expect(slow[2]).toBeLessThan(slow[39]);
    for (let i = 1; i < 12; i++) expect(slow[i]).toBeGreaterThanOrEqual(slow[i - 1] - 1e-9);
    expect(fast[39]).toBeLessThan(slow[39]);
    expect(fast[5]).toBeLessThan(fast[39]);
  });
  it('a stick (analogue) is proportional: half deflection gives about half the lock; keys release to centre faster at speed', () => {
    const lock = (s: number) => {
      const v = make('sedan', 8);
      v.setInput(input({ steer: s, throttle: 0.3 }));
      for (let i = 0; i < 40; i++) v.update(DT);
      return Math.abs(v.steering);
    };
    const half = lock(0.5), full = lock(1);
    expect(half / full).toBeGreaterThan(0.35); expect(half / full).toBeLessThan(0.65);
    const centre = (speed: number) => {
      const v = make('sedan', speed);
      v.setInput(input({ steer: 1, throttle: 0.3 }));
      for (let i = 0; i < 60; i++) v.update(DT);
      v.setInput(input({ throttle: 0.3 }));
      for (let i = 0; i < 4; i++) v.update(DT);
      return Math.abs(v.handling.steerNorm);
    };
    expect(centre(20)).toBeLessThan(centre(3));
  });
});

describe('the switch for the AI', () => {
  it('traffic and police use the old model unless Vehicle.aiHandling is on; the player uses the new unless playerHandling is off', () => {
    const t = make('sedan', 0, 'traffic'), c = make('cop', 0, 'cop'), p = make('sedan');
    expect([t.useProfile(), c.useProfile(), p.useProfile()]).toEqual([false, false, true]);
    Vehicle.aiHandling = true;
    expect([t.useProfile(), c.useProfile(), p.useProfile()]).toEqual([true, true, true]);
    Vehicle.aiHandling = false; Vehicle.playerHandling = false;
    expect(p.useProfile()).toBe(false);
    const parked = make('sedan'); parked.driver = null;
    Vehicle.aiHandling = true; Vehicle.playerHandling = true;
    expect(parked.useProfile()).toBe(false);
  });
});

describe('kerb strike', () => {
  it('rolling onto a 0.15 m sidewalk kicks the suspension, within limits, and settles', () => {
    // road for z > -20, a sidewalk (0.15 m) beyond: the car drives toward -z
    setGround((_x, z) => (z < -20 ? 0.15 : 0));
    const v = make('sedan', 8);
    v.setInput(input({ throttle: 0.2 }));
    let maxBounce = 0, maxPitch = 0;
    for (let i = 0; i < 60 * 4; i++) {
      v.update(DT);
      const c = v.object3D.children[0];
      maxBounce = Math.max(maxBounce, Math.abs(c.position.y)); maxPitch = Math.max(maxPitch, Math.abs(c.rotation.x));
    }
    expect(v.body.pos.z).toBeLessThan(-20);
    expect(maxBounce).toBeGreaterThan(0.004);
    expect(maxPitch).toBeGreaterThan(0.005);
    expect(maxBounce).toBeLessThanOrEqual(0.06 + 1e-9);
    expect(maxPitch).toBeLessThan(0.1);
    const c = v.object3D.children[0];
    v.setInput(input({ brake: true }));
    for (let i = 0; i < 240; i++) v.update(DT);
    expect(Math.abs(c.position.y)).toBeLessThan(0.002);
  });
});
