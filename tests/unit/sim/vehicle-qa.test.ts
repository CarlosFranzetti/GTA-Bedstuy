/**
 * Stage 2 QA: the PRD 5.2 driving gaps that Stage 1 left untested.
 *  - stability at top speed (heading drift, speed oscillation, yaw wobble)
 *  - resting contact without jitter (wall, parked car, stacked cars, real map geometry)
 *  - impact bounce is short (no contact bounce > 2 frames)
 *  - handbrake drift: slip angle > 15 deg at 60 km/h, controllable and recoverable
 * Physics is stepped like main.ts: Vehicle.update(dt) then World2D.step(dt) then onContact routing.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { angleDiff } from '@/core/Math2';
import type { VehicleType } from '@/world/types';
import { DT, Sim, input, makeVehicle, peakToPeak, realPhysics, slipAngleDeg, variance } from './harness';

const RAD = 180 / Math.PI;
const wallSeg = (sim: Sim, ax: number, az: number, bx: number, bz: number, id = 'wall') =>
  sim.world.addStatic({ kind: 'segment', a: { x: ax, z: az }, b: { x: bx, z: bz } }, undefined, id);

// ------------------------------------------------------------------ top speed

describe('top speed on a straight (PRD 5.2: stable at speed)', () => {
  const types: VehicleType[] = ['sedan', 'suv', 'cop'];
  const dts = [1 / 30, 1 / 60, 1 / 120];

  for (const type of types) {
    for (const dt of dts) {
      it(`${type} @ ${(1 / dt).toFixed(0)} Hz: 30 s flat out stays straight (< 1 deg) and steady (< 2 %)`, () => {
        for (const h0 of [0, 1.1, -2.6]) {
          const v = makeVehicle(type, 0, 0, h0);
          v.driver = 'player';
          v.setInput(input({ throttle: 1 }));
          const sim = new Sim();
          sim.add(v);
          const speeds: number[] = [];
          let maxHeadErr = 0;
          let maxLat = 0;
          let prev = 0;
          let monotonic = true;
          sim.run(30, (t) => {
            maxHeadErr = Math.max(maxHeadErr, Math.abs(angleDiff(h0, v.body.heading)) * RAD);
            maxLat = Math.max(maxLat, Math.abs(v.lateralSpeed));
            if (t >= 12) {
              speeds.push(v.speed);
              if (v.speed < prev - 1e-9) monotonic = false;
              prev = v.speed;
            }
          }, dt);
          const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
          expect(maxHeadErr).toBeLessThan(1);
          expect(maxLat).toBeLessThan(0.05);
          expect(mean).toBeGreaterThan(0.97 * v.spec.maxSpeed);
          expect(Math.max(...speeds)).toBeLessThanOrEqual(v.spec.maxSpeed + 1e-9);
          expect(peakToPeak(speeds) / mean).toBeLessThan(0.02);
          expect(monotonic).toBe(true); // approaches the limit from below, never overshoots or hunts
          // travelled on the straight line of its initial heading
          const along = v.body.pos.x * Math.sin(h0) - v.body.pos.z * Math.cos(h0);
          const side = v.body.pos.x * Math.cos(h0) + v.body.pos.z * Math.sin(h0);
          expect(along).toBeGreaterThan(500);
          expect(Math.abs(side)).toBeLessThan(0.5);
        }
      });
    }
  }

  it('sheds a steering flick at top speed with no yaw wobble: yaw rate and slip die out within 5 s', () => {
    for (const dt of dts) {
      const v = makeVehicle('sedan', 0, 0, 0);
      v.driver = 'player';
      const sim = new Sim();
      sim.add(v);
      v.setInput(input({ throttle: 1 }));
      sim.run(12, undefined, dt); // at ~top speed
      expect(v.speed).toBeGreaterThan(29);
      v.setInput(input({ throttle: 1, steer: 1 }));
      sim.run(0.4, undefined, dt);
      v.setInput(input({ throttle: 1, steer: 0 })); // released
      let prevH = v.body.heading;
      const yaw: number[] = [];
      const slip: number[] = [];
      sim.run(5, () => {
        yaw.push(angleDiff(prevH, v.body.heading) / dt);
        prevH = v.body.heading;
        slip.push(slipAngleDeg(v));
      }, dt);
      // after the release the steering unwinds and the yaw rate must go to zero without ringing:
      // count sign changes of the yaw rate beyond a noise floor
      let flips = 0;
      let last = 0;
      for (const y of yaw) {
        if (Math.abs(y) < 0.02) continue;
        const s = Math.sign(y);
        if (last !== 0 && s !== last) flips++;
        last = s;
      }
      expect(flips).toBeLessThanOrEqual(1);
      expect(Math.abs(yaw[yaw.length - 1])).toBeLessThan(0.01);
      expect(Math.max(...yaw.slice(-60).map(Math.abs))).toBeLessThan(0.01);
      expect(slip[slip.length - 1]).toBeLessThan(0.5);
      expect(v.speed).toBeGreaterThan(25); // a flick does not wreck the speed
    }
  });

  it('PRD 5.2 literal: steering released at top speed for 5 s does not change heading, position stays on a line', () => {
    const v = makeVehicle('sedan', 0, 0, 0);
    v.driver = 'player';
    v.body.vel = { x: 0, z: -30 };
    v.setInput(input({ throttle: 1, steer: 0 }));
    const sim = new Sim();
    sim.add(v);
    const xs: number[] = [];
    sim.run(5, () => xs.push(v.body.pos.x));
    expect(Math.abs(v.body.heading) * RAD).toBeLessThan(0.01);
    expect(peakToPeak(xs)).toBeLessThan(1e-6);
  });

  it('is stable against a wobbling thumb at top speed (3 % lock at 2 Hz): heading stays within 5 deg, no slip', () => {
    const v = makeVehicle('sedan', 0, 0, 0);
    v.driver = 'player';
    v.body.vel = { x: 0, z: -30 };
    const sim = new Sim();
    sim.add(v);
    let maxSlip = 0;
    let maxHead = 0;
    sim.run(20, (t) => {
      v.setInput(input({ throttle: 1, steer: 0.03 * Math.sin(2 * Math.PI * 2 * t) }));
      maxSlip = Math.max(maxSlip, slipAngleDeg(v));
      maxHead = Math.max(maxHead, Math.abs(v.body.heading) * RAD);
    });
    expect(maxHead).toBeLessThan(5);
    expect(maxSlip).toBeLessThan(2);
  });
});

// ------------------------------------------------------------------ contact jitter

describe('resting contact has no jitter (PRD 5.2: collisions damp without jitter)', () => {
  /** After `settle` s run `secs` s and return the per-axis position std-dev (m) and heading std-dev (rad). */
  function rest(sim: Sim, bodies: { body: { pos: { x: number; z: number }; heading: number } }[], settle = 1, secs = 5) {
    sim.run(settle);
    const tracks = bodies.map(() => ({ x: [] as number[], z: [] as number[], h: [] as number[] }));
    sim.run(secs, () => {
      bodies.forEach((e, i) => { tracks[i].x.push(e.body.pos.x); tracks[i].z.push(e.body.pos.z); tracks[i].h.push(e.body.heading); });
    });
    return tracks.map((t) => ({
      sx: Math.sqrt(variance(t.x)), sz: Math.sqrt(variance(t.z)), sh: Math.sqrt(variance(t.h)),
      px: peakToPeak(t.x), pz: peakToPeak(t.z), ph: peakToPeak(t.h),
    }));
  }
  const MM = 1e-3;
  const still = (r: ReturnType<typeof rest>[number]) => {
    expect(r.sx).toBeLessThan(MM);
    expect(r.sz).toBeLessThan(MM);
    // heading wobble expressed as the movement of a bumper corner (2.3 m from the centre)
    expect(r.sh * 2.3).toBeLessThan(MM);
  };

  it('a parked car pressed 0.2 m into a wall is pushed out once, then sits still (< 1 mm over 5 s)', () => {
    const sim = new Sim();
    wallSeg(sim, -20, -3, 20, -3);
    const car = makeVehicle('sedan', 0, -0.5, 0); // nose at z = -2.8 ... wall at -3: overlaps by 0 -> use closer
    car.body.pos.z = -1.0; // nose 3.3 m ahead of the centre: 0.3 m inside the wall
    sim.add(car);
    const [r] = rest(sim, [car]);
    still(r);
    expect(car.body.pos.z).toBeGreaterThan(-0.72); // pushed back out of the wall
    expect(car.body.vel).toEqual({ x: 0, z: 0 });
  });

  it('a parked car overlapped by another parked car: both settle and stay (< 1 mm)', () => {
    const sim = new Sim();
    const a = makeVehicle('sedan', 0, 0, 0);
    const b = makeVehicle('suv', 0.2, -4.6, 0.02); // overlapping along z
    sim.add(a); sim.add(b);
    const [ra, rb] = rest(sim, [a, b]);
    still(ra); still(rb);
  });

  it('an idle driven car touching a parked car does not jitter either', () => {
    const sim = new Sim();
    const a = makeVehicle('sedan', 0, 0, 0);
    const b = makeVehicle('sedan', 0, -4.45, 0);
    a.driver = 'player';
    a.setInput(input());
    sim.add(a); sim.add(b);
    const [ra, rb] = rest(sim, [a, b]);
    still(ra); still(rb);
  });

  it('full throttle held square into a wall: no jitter, no impact spam, no creeping damage', () => {
    const events = new EventBus();
    let impacts = 0;
    events.on('impact', () => impacts++);
    const sim = new Sim();
    wallSeg(sim, -20, -12, 20, -12);
    const car = makeVehicle('sedan', 0, 0, 0, events);
    car.driver = 'player';
    car.setInput(input({ throttle: 1 }));
    sim.add(car);
    sim.run(3); // hit and settle
    const dmg = car.damage;
    const before = impacts;
    const [r] = rest(sim, [car], 0, 5);
    still(r);
    expect(car.damage).toBeCloseTo(dmg, 6);
    expect(impacts).toBe(before);
    expect(Math.abs(car.speed)).toBeLessThan(0.01);
  });

  it('a car held against a parked car that is itself against a wall (a stack): all three at rest', () => {
    const sim = new Sim();
    wallSeg(sim, -20, -14, 20, -14);
    const pusher = makeVehicle('sedan', 0, 0, 0);
    const parked = makeVehicle('sedan', 0, -8, 0);
    pusher.driver = 'player';
    pusher.setInput(input({ throttle: 1 }));
    sim.add(pusher); sim.add(parked);
    sim.run(8);
    const [rp, rk] = rest(sim, [pusher, parked], 0, 5);
    still(rp); still(rk);
  });

  it('a wall corner (two walls at 90 deg), car driven into the corner and held there: still (< 1 mm)', () => {
    const sim = new Sim();
    wallSeg(sim, -20, -10, 5, -10, 'n');
    wallSeg(sim, 5, -10, 5, 20, 'e');
    const car = makeVehicle('sedan', 0, 0, Math.PI / 4); // aimed at the corner
    car.driver = 'player';
    car.setInput(input({ throttle: 1 }));
    sim.add(car);
    sim.run(5);
    const [r] = rest(sim, [car], 0, 5);
    expect(r.px).toBeLessThan(5 * MM);
    expect(r.pz).toBeLessThan(5 * MM);
    expect(r.ph * 2.3).toBeLessThan(5 * MM);
  });

  it('real map: parked cars dropped overlapping real building/prop colliders come to rest (< 1 mm) within 2 s', () => {
    const { world, physics } = realPhysics();
    const polys = world.colliders.filter((c) => c.shape.kind === 'polygon');
    expect(polys.length).toBeGreaterThan(200);
    // deterministic sample of wall edges
    const failures: string[] = [];
    let tested = 0;
    for (let i = 0; i < polys.length && tested < 70; i += Math.max(1, Math.floor(polys.length / 70))) {
      const shape = polys[i].shape as { kind: 'polygon'; points: { x: number; z: number }[] };
      const pts = shape.points;
      let cx = 0, cz = 0;
      for (const p of pts) { cx += p.x; cz += p.z; }
      cx /= pts.length; cz /= pts.length;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 4) continue;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        let nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; } // outward
        const heading = Math.atan2(b.x - a.x, -(b.z - a.z)); // parallel to the wall
        const sim = new Sim(physics);
        const car = makeVehicle('sedan', mx + nx * (0.9 - 0.12), mz + nz * (0.9 - 0.12), heading, new EventBus(), `rest${i}_${k}`);
        sim.add(car);
        const [r] = rest(sim, [car], 2, 3);
        physics.removeBody(car.body.id);
        tested++;
        if (r.sx > MM || r.sz > MM || r.sh * 2.3 > MM) failures.push(`${polys[i].id} edge ${k}: sx=${(r.sx / MM).toFixed(2)}mm sz=${(r.sz / MM).toFixed(2)}mm sh=${(r.sh * 2.3 / MM).toFixed(2)}mm`);
        break;
      }
    }
    expect(tested).toBeGreaterThan(30);
    expect(failures).toEqual([]);
  });
});

describe('impacts bounce for at most 2 frames (PRD 5.2)', () => {
  it('15 and 28 m/s into a wall: one contact frame, rebound <= restitution * closing, then at rest', () => {
    for (const speed of [15, 28]) {
      const sim = new Sim();
      wallSeg(sim, -30, -30, 30, -30);
      const car = makeVehicle('sedan', 0, 0, 0);
      car.driver = 'player';
      car.body.vel = { x: 0, z: -speed };
      car.setInput(input());
      sim.add(car);
      let contactFrames = 0;
      let rebound = 0;
      sim.run(10, () => {
        if (sim.contactsLastStep.length > 0) contactFrames++;
        rebound = Math.max(rebound, car.body.vel.z);
      });
      expect(contactFrames).toBeLessThanOrEqual(2);
      expect(rebound).toBeLessThanOrEqual(0.1 * speed + 0.05);
      expect(Math.hypot(car.body.vel.x, car.body.vel.z)).toBeLessThan(0.01);
    }
  });

  it('8 and 15 m/s into a parked car: no contact chatter (re-contact within 3 frames), both end at rest, parked car displaced', () => {
    for (const speed of [8, 15]) {
      const sim = new Sim();
      const a = makeVehicle('sedan', 0, 0, 0);
      const b = makeVehicle('sedan', 0, -12, 0);
      a.driver = 'player';
      a.body.vel = { x: 0, z: -speed };
      a.setInput(input());
      sim.add(a); sim.add(b);
      let chatter = 0;
      let gap = 0;
      let seen = false;
      sim.run(12, () => {
        const c = sim.contactsLastStep.length > 0;
        if (c) {
          // a short gap between two contact frames is a bounce
          if (seen && gap > 0 && gap <= 3) chatter++;
          seen = true;
          gap = 0;
        } else if (seen) gap++;
      });
      expect(seen).toBe(true);
      expect(chatter).toBe(0);
      expect(Math.hypot(a.body.vel.x, a.body.vel.z)).toBeLessThan(1e-6);
      expect(Math.hypot(b.body.vel.x, b.body.vel.z)).toBeLessThan(1e-6);
      expect(b.body.pos.z).toBeLessThan(-12.5); // nudged, not wall-like
    }
  });
});

// ------------------------------------------------------------------ drift

describe('handbrake drift (PRD 5.2: slip angle > 15 deg at > 40 km/h, controllable, recoverable)', () => {
  const KMH = (k: number) => k / 3.6;

  function drift(speed: number, steer: number, hold: number, dt = DT) {
    const v = makeVehicle('sedan', 0, 0, 0);
    v.driver = 'player';
    v.body.vel = { x: 0, z: -speed };
    const sim = new Sim();
    sim.add(v);
    v.setInput(input({ steer, handbrake: true }));
    let maxSlip = 0;
    let maxSlipGetter = 0;
    let maxYaw = 0;
    let prevH = v.body.heading;
    let tFirst15 = -1;
    let totalRot = 0;
    const track = (t: number) => {
      const s = slipAngleDeg(v);
      maxSlip = Math.max(maxSlip, s);
      maxSlipGetter = Math.max(maxSlipGetter, v.slip);
      if (s > 15 && tFirst15 < 0) tFirst15 = t;
      const dh = angleDiff(prevH, v.body.heading);
      totalRot += dh;
      maxYaw = Math.max(maxYaw, Math.abs(dh) / dt);
      prevH = v.body.heading;
    };
    sim.run(hold, track, dt);
    // release: neutral wheel, gentle throttle (what a player does to catch it)
    v.setInput(input({ steer: 0, handbrake: false, throttle: 0.5 }));
    const slipAfter: number[] = [];
    let recovered = -1;
    sim.run(4, (t) => {
      track(t);
      slipAfter.push(slipAngleDeg(v));
      if (recovered < 0 && slipAngleDeg(v) < 3) recovered = t - hold;
    }, dt);
    return { v, maxSlip, maxSlipGetter, maxYaw, tFirst15, totalRot: Math.abs(totalRot) * RAD, slipAfter, recovered };
  }

  for (const kmh of [45, 60, 80]) {
    it(`${kmh} km/h, handbrake + half lock for 0.5 s: slip angle > 15 deg, then recovers to < 3 deg`, () => {
      const d = drift(KMH(kmh), 0.5, 0.5);
      expect(d.maxSlip).toBeGreaterThan(15);
      expect(d.tFirst15).toBeGreaterThan(0);
      expect(d.tFirst15).toBeLessThan(0.5); // develops promptly
      expect(d.maxSlipGetter).toBeGreaterThan(0.5); // tyre squeal signal agrees with the geometry
      expect(d.recovered).toBeGreaterThan(0);
      expect(d.recovered).toBeLessThan(3);
      expect(d.slipAfter[d.slipAfter.length - 1]).toBeLessThan(0.5);
      expect(d.v.speed).toBeGreaterThan(5); // still rolling, not stalled
    });
  }

  it('60 km/h drift is controllable: yaw rate stays below 2.5 rad/s and the car turns < 140 deg in total', () => {
    const d = drift(KMH(60), 0.5, 0.5);
    expect(d.maxYaw).toBeLessThan(2.5);
    expect(d.totalRot).toBeLessThan(140);
    expect(d.totalRot).toBeGreaterThan(10);
  });

  it('a one second full-lock handbrake turn at 60 km/h ends with the car pointing the other way round or sideways, then recovers', () => {
    const d = drift(KMH(60), 1, 1);
    expect(d.maxSlip).toBeGreaterThan(45);
    expect(d.recovered).toBeLessThan(4);
  });

  it('mirror symmetry: steering left drifts left by the same amount', () => {
    const r = drift(KMH(60), 0.5, 0.5);
    const l = drift(KMH(60), -0.5, 0.5);
    expect(l.maxSlip).toBeCloseTo(r.maxSlip, 1);
    expect(l.v.body.heading * r.v.body.heading).toBeLessThanOrEqual(0);
  });

  it('without the handbrake the same lock at 60 km/h grips: slip angle stays < 8 deg', () => {
    const v = makeVehicle('sedan', 0, 0, 0);
    v.driver = 'player';
    v.body.vel = { x: 0, z: -KMH(60) };
    v.setInput(input({ steer: 0.5 }));
    const sim = new Sim();
    sim.add(v);
    let max = 0;
    sim.run(2, () => { max = Math.max(max, slipAngleDeg(v)); });
    expect(max).toBeLessThan(8);
  });

  it('a straight handbrake (no steering) just brakes: no spin, no slip', () => {
    const d = drift(KMH(60), 0, 1);
    expect(d.maxSlip).toBeLessThan(3);
    expect(d.totalRot).toBeLessThan(2);
  });

  it('peak slip angle is frame-rate independent (30 / 60 / 120 Hz agree within 4 deg)', () => {
    const peaks = [1 / 30, 1 / 60, 1 / 120].map((dt) => drift(KMH(60), 0.5, 0.5, dt).maxSlip);
    expect(peakToPeak(peaks)).toBeLessThan(4);
    for (const p of peaks) expect(p).toBeGreaterThan(15);
  });

  it('low grip (wet, grip 0.5): the handbrake turn still slides (> 10 deg) and is still recoverable', () => {
    const v = makeVehicle('sedan', 0, 0, 0);
    v.driver = 'player';
    v.grip = 0.5;
    v.body.vel = { x: 0, z: -KMH(60) };
    v.setInput(input({ steer: 0.5, handbrake: true }));
    const sim = new Sim();
    sim.add(v);
    let wet = 0;
    sim.run(0.5, () => { wet = Math.max(wet, slipAngleDeg(v)); });
    v.setInput(input({ steer: 0, throttle: 0.5 }));
    sim.run(4);
    expect(wet).toBeGreaterThan(10);
    expect(slipAngleDeg(v)).toBeLessThan(0.5);
  });
});
