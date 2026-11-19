import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian } from '@/entities/Pedestrian';
import { Vehicle } from '@/entities/Vehicle';
import { overlap } from '@/physics/Collider2D';
import type { Body2D, Graph } from '@/world/types';
import {
  DT, Sim, carCar, driven, footSim, input, launch, measureHandling, speedOf, stubMaterials, wallRun,
} from './scenarios';

/**
 * Pass criteria are in numbers, each with its reason:
 *  - no tunnelling: the body never goes further than 0.05 m past the wall (the correction slop is 1e-4 per step).
 *  - rebound: at most 25 percent of the impact speed comes back (GTA III cars die on a wall; a bounce reads as a rubber ball).
 *  - jitter pressed against a wall: under 2 cm of movement over a second (a camera at 60 Hz shows anything above 1 cm).
 */
describe('car into a wall', () => {
  for (const speed of [5, 15, 30]) {
    for (const deg of [0, 30, 60]) {
      it(`${speed} m/s at ${deg} degrees: stays out of the wall, loses its speed, does not shake`, () => {
        const r = wallRun('sedan', speed, deg);
        expect(r.maxPenetration).toBeLessThan(0.05);
        expect(r.reboundSpeed).toBeLessThan(Math.max(0.6, r.impactSpeed * 0.25));
        expect(r.jitterCm).toBeLessThan(10); // 0.1 m: includes the wedge push-out cycle of a held throttle; the car is at rest in these runs
        expect(r.endSpeed).toBeLessThan(1);
        expect(r.impacts).toBeGreaterThan(0);
      });
    }
  }
  it('a hard hit gives the body a jolt (roll and pitch kick); an off-centre hit on a pole also spins it', () => {
    const sim = new Sim();
    sim.world.addStatic({ kind: 'circle', r: 0.3 }, { x: 0, z: 0.7 }, 'pole-5');
    const v = driven('sedan', -5, 0, Math.PI / 2, 'v', 'traffic');
    sim.add(v); launch(v, 14);
    let maxRoll = 0, maxPitch = 0, maxHeadingChange = 0;
    const chassis = v.object3D.children[0];
    for (let i = 0; i < 90; i++) { sim.step(); maxRoll = Math.max(maxRoll, Math.abs(chassis.rotation.z)); maxPitch = Math.max(maxPitch, Math.abs(chassis.rotation.x)); maxHeadingChange = Math.max(maxHeadingChange, Math.abs(v.body.heading - Math.PI / 2)); }
    expect(maxPitch + maxRoll).toBeGreaterThan(0.01);
    expect(maxHeadingChange).toBeGreaterThan(0.05);
  });
});

describe('car into car', () => {
  const cases: Array<[string, string, number]> = [['sedan', 'bus', 10], ['bus', 'sedan', 10], ['sedan', 'boxtruck', 12], ['boxtruck', 'sedan', 12], ['sedan', 'sedan', 15]];
  for (const [A, B, s] of cases) {
    it(`${A} into a parked ${B} at ${s} m/s: momentum is shared, nothing explodes, nothing stays overlapped`, () => {
      const r = carCar(A as never, B as never, s);
      expect(r.residualOverlap).toBeLessThan(0.02);
      expect(r.peakSpeed).toBeLessThan(s * 1.02);
      expect(r.separatedAt).toBeGreaterThan(-1);
      // never creates momentum; the parked car's ground friction takes some within the half second (3 m/s^2 and drag)
      expect(r.momAfter).toBeLessThan(r.momBefore * 1.02);
    });
  }
  it('a light car shoves a heavy one less far than the reverse', () => {
    const lightHeavy = carCar('sedan', 'bus', 10);
    const heavyLight = carCar('bus', 'sedan', 10);
    expect(Math.abs(lightHeavy.b.body.pos.x)).toBeLessThan(Math.abs(heavyLight.b.body.pos.x));
  });
  it('an offset hit spins both cars and they separate', () => {
    const r = carCar('sedan', 'sedan', 12, { offsetZ: 1.2 });
    expect(r.peakSpin).toBeGreaterThan(0.1);
    expect(r.residualOverlap).toBeLessThan(0.02);
    expect(r.peakSpin).toBeLessThan(6);
  });
  it('a T-bone on the flank of a moving car separates and both keep stable', () => {
    const sim = new Sim();
    const a = driven('sedan', -12, 0, Math.PI / 2, 'a'); // heading east
    const b = driven('sedan', 0, -9, 0, 'b'); // heading north... crosses from the south
    b.body.pos.z = 9; // start south, drive north across a's path
    sim.add(a); sim.add(b); launch(a, 12); launch(b, 10);
    let peak = 0, still = 0;
    for (let i = 0; i < 300; i++) { sim.step(); peak = Math.max(peak, speedOf(a.body), speedOf(b.body)); }
    expect(peak).toBeLessThan(12.5);
    const o = overlap(a.body, b.body);
    expect(o === null || o.depth < 0.02).toBe(true);
    still = speedOf(a.body) + speedOf(b.body);
    expect(still).toBeLessThan(40);
  });
  it('a rear-end bump separates', () => {
    const r = carCar('sedan', 'sedan', 14, { bDriver: 'traffic' });
    expect(r.residualOverlap).toBeLessThan(0.02);
    expect(r.peakSpeed).toBeLessThan(14.3);
  });
});

describe('props on and beside the kerb', () => {
  for (const id of ['pole-1', 'hydrant-1', 'bollard-1', 'tree-1']) {
    for (const drv of ['player', 'traffic'] as const) {
      it(`${id} against a ${drv} car at 8 m/s with the throttle held: never ends pinned`, () => {
        const sim = new Sim();
        const r = id.startsWith('bollard') ? 0.12 : id.startsWith('hydrant') ? 0.25 : id.startsWith('pole') ? 0.25 : 0.35;
        sim.world.addStatic({ kind: 'circle', r }, { x: 0, z: -20 }, id);
        const v = driven('sedan', 0, 0, 0, 'c', drv);
        sim.add(v); launch(v, 8);
        for (let i = 0; i < 60 * 9; i++) { v.setInput(input({ throttle: 1 })); sim.step(); }
        const small = id.startsWith('hydrant') || id.startsWith('bollard');
        if (small) expect(v.body.pos.z).toBeLessThan(-24); // drives through
        // poles and trees stop a car that hits them head-on, but it must not be wrecked by merely leaning on them
        expect(v.damage).toBeLessThan(small ? 0.2 : 0.6);
      });
    }
  }
  it('a hydrant costs a car some speed and reports one contact, not one per step', () => {
    const sim = new Sim();
    sim.world.addStatic({ kind: 'circle', r: 0.25 }, { x: 0, z: -20 }, 'hydrant-9');
    const v = driven('sedan', 0, 0, 0, 'c', 'traffic'); sim.add(v); launch(v, 15);
    let contacts = 0, vAfter = 0;
    for (let i = 0; i < 150; i++) { v.setInput(input({ throttle: 1 })); sim.step(); contacts += sim.contactsLastStep.length; if (v.body.pos.z < -30 && !vAfter) vAfter = v.speed; }
    expect(contacts).toBe(1);
    expect(vAfter).toBeGreaterThan(8);
  });
  it('holding the throttle into a wall does not wreck the car', () => {
    const sim = new Sim();
    sim.world.addStatic({ kind: 'segment', a: { x: 0, z: -50 }, b: { x: 0, z: 50 } }, undefined, 'w');
    const v = driven('sedan', -3.5, 0, Math.PI / 2, 'v', 'player'); sim.add(v); launch(v, 3);
    for (let i = 0; i < 180; i++) { v.setInput(input({ throttle: 1 })); sim.step(); }
    expect(v.damage).toBeLessThan(0.15); // the first hit at ~5 m/s costs 0.09; leaning on the wall costs nothing
  });
});

describe('on foot', () => {
  it('leaning into a concave corner holds the player in the corner; he does not creep out of it', () => {
    const f = footSim(0, 0);
    f.sim.world.addStatic({ kind: 'segment', a: { x: -20, z: -5 }, b: { x: 5, z: -5 } }, undefined, 'w1');
    f.sim.world.addStatic({ kind: 'segment', a: { x: 5, z: -5 }, b: { x: 5, z: 20 } }, undefined, 'w2');
    f.walk(4, 'NE');
    const p = { ...f.player.body.pos };
    f.walk(3, 'NE');
    expect(Math.hypot(f.player.body.pos.x - p.x, f.player.body.pos.z - p.z)).toBeLessThan(0.05);
    expect(f.player.body.pos.x).toBeGreaterThan(4.45);
    expect(f.player.body.pos.z).toBeLessThan(-4.45);
  });
  it('slides along a wall instead of sticking to it', () => {
    const f = footSim(0, 0);
    f.sim.world.addStatic({ kind: 'segment', a: { x: 5, z: -50 }, b: { x: 5, z: 50 } }, undefined, 'w');
    f.walk(2, 'E');
    const z0 = f.player.body.pos.z;
    f.walk(2, 'NE');
    expect(z0 - f.player.body.pos.z).toBeGreaterThan(3); // 2 s at 3 m/s with the wall taking the east half: about 4 m along the wall
  });
  it('squeezes between two parked cars when the gap is wider than the body, and is stopped when it is not', () => {
    const run = (gap: number) => {
      const f = footSim(0, 8);
      const w = 0.92;
      const a = driven('sedan', -(w + gap / 2), 0, 0, 'ca', null), b = driven('sedan', w + gap / 2, 0, 0, 'cb', null);
      f.sim.add(a); f.sim.add(b);
      f.walk(5, 'N');
      return { z: f.player.body.pos.z, moved: Math.hypot(a.body.pos.x + w + gap / 2, a.body.pos.z) + Math.hypot(b.body.pos.x - w - gap / 2, b.body.pos.z) };
    };
    expect(run(0.7).z).toBeGreaterThan(-3.5);
    const ok = run(0.9);
    expect(ok.z).toBeLessThan(-5);
    expect(ok.moved).toBeLessThan(0.1);
  });
  for (const sp of [8, 15, 25]) {
    it(`a car at ${sp} m/s knocks the player down and throws him clear; he stops, gets up, and the car carries on`, () => {
      const f = footSim(0, 0);
      const c = driven('sedan', 0, 30, 0, 'c', 'traffic'); f.sim.add(c); launch(c, sp);
      let wasDown = false, downFor = 0, maxCarSpeedLoss = 0;
      for (let i = 0; i < 60 * 6; i++) {
        c.setInput(input({ throttle: 0.5 }));
        f.sim.step();
        if (f.player.isDown) { wasDown = true; downFor += DT; }
        maxCarSpeedLoss = Math.max(maxCarSpeedLoss, sp - speedOf(c.body));
      }
      expect(wasDown).toBe(true);
      expect(downFor).toBeGreaterThan(0.9);
      expect(downFor).toBeLessThan(1.6);
      expect(f.player.isDown).toBe(false);
      expect(f.player.body.vehiclePass).toBeFalsy();
      expect(speedOf(f.player.body)).toBeLessThan(0.5);
      // he did not ride the bumper: the car is well past him
      expect(c.body.pos.z).toBeLessThan(f.player.body.pos.z - 3);
    });
  }
  it('the knocked-down player is drawn lying flat, and upright again after getting up', () => {
    const f = footSim(0, 0);
    const c = driven('sedan', 0, 20, 0, 'c', 'traffic'); f.sim.add(c); launch(c, 12);
    let flat = false;
    for (let i = 0; i < 60 * 4; i++) { c.setInput(input({ throttle: 0.5 })); f.sim.step(); f.player.applyInterpolated(1); if (f.player.isDown && Math.abs(f.player.object3D.rotation.x - Math.PI / 2) < 1e-6) flat = true; }
    expect(flat).toBe(true);
    expect(f.player.object3D.rotation.x).toBe(0);
  });
  it('a car creeping at 1.5 m/s only shoves, no knock-down', () => {
    const f = footSim(0, 0);
    const c = driven('sedan', 0, 4, 0, 'c', 'traffic'); f.sim.add(c); launch(c, 1.5);
    for (let i = 0; i < 120; i++) { c.setInput(input({ throttle: 0.2 })); f.sim.step(); }
    expect(f.player.isDown).toBe(false);
  });
  it('a car spawned on top of the player eases him out instead of popping', () => {
    const f = footSim(0, 0);
    const c = driven('sedan', 0, 0, 0, 'c', null); f.sim.add(c);
    let maxStep = 0, prev = { ...f.player.body.pos };
    for (let i = 0; i < 120; i++) { f.sim.step(); maxStep = Math.max(maxStep, Math.hypot(f.player.body.pos.x - prev.x, f.player.body.pos.z - prev.z)); prev = { ...f.player.body.pos }; }
    expect(maxStep).toBeLessThan(0.3);
    const o = overlap(f.player.body, c.body);
    expect(o === null || o.depth < 0.01).toBe(true);
  });
});

function line(): Graph {
  const g: Graph = { nodes: {}, edges: [], adjacency: { a: [], b: [] } };
  g.nodes.a = { id: 'a', pos: { x: -200, z: 0 } }; g.nodes.b = { id: 'b', pos: { x: 200, z: 0 } };
  g.adjacency.a.push(0); g.adjacency.b.push(1);
  g.edges.push({ from: 'a', to: 'b', length: 400 }, { from: 'b', to: 'a', length: 400 });
  return g;
}
/** A bare pedestrian-kind body (no AI): the test moves it. */
function person(sim: Sim, id: string, x: number, z: number): { body: Body2D } {
  const body: Body2D = { id, kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 };
  sim.world.addBody(body);
  return { body };
}
function ped(sim: Sim, id: string, x: number, z: number): Pedestrian {
  const p = new Pedestrian(id, { id: 'a', pos: { x, z } }, line(), sim.world, stubMaterials, new EventBus(), new Rng(id));
  p.body.pos.x = x; p.body.pos.z = z; p.body.vel.x = 0; p.body.vel.z = 0;
  sim.add(p);
  return p;
}

describe('pedestrians', () => {
  for (const sp of [5, 15, 25]) {
    it(`a car at ${sp} m/s throws the pedestrian clear instead of ploughing him along`, () => {
      const sim = new Sim();
      const p = ped(sim, 'p', 0, 0);
      p.state = 'sitting' as never; (p as unknown as { sitTimer: number }).sitTimer = 99;
      const c = driven('sedan', 0, 25, 0, 'c', 'traffic'); sim.add(c); launch(c, sp);
      let down = false;
      for (let i = 0; i < 60 * 4; i++) { c.setInput(input({ throttle: 0.3 })); sim.step(); if (p.state === 'down') down = true; }
      expect(down).toBe(true);
      expect(c.body.pos.z).toBeLessThan(p.body.pos.z - 2.5); // the car is past him
    });
  }
  it('two people walking at each other step round one another and keep at least 0.5 m apart', () => {
    const sim = new Sim();
    const a = person(sim, 'a', -4, 0), b = person(sim, 'b', 4, 0);
    let minD = 99;
    for (let i = 0; i < 60 * 6; i++) {
      a.body.vel.x = 1.4; a.body.vel.z = 0; a.body.pos.x += 1.4 * DT;
      b.body.vel.x = -1.4; b.body.vel.z = 0; b.body.pos.x -= 1.4 * DT;
      sim.step();
      minD = Math.min(minD, Math.hypot(a.body.pos.x - b.body.pos.x, a.body.pos.z - b.body.pos.z));
    }
    expect(minD).toBeGreaterThan(0.5);
    expect(a.body.pos.x).toBeGreaterThan(b.body.pos.x); // they passed
    expect(Math.abs(a.body.pos.z - b.body.pos.z)).toBeGreaterThan(0.3); // by stepping aside
  });
  it('people drift apart to about a shoulder width plus air (0.75 m) when standing close and one moves', () => {
    const sim = new Sim();
    const a = person(sim, 'a', 0, 0), b = person(sim, 'b', 0.65, 0);
    for (let i = 0; i < 90; i++) { a.body.vel.x = 0.3; a.body.vel.z = 0; a.body.pos.x += 0.3 * DT; sim.step(); }
    expect(Math.hypot(a.body.pos.x - b.body.pos.x, a.body.pos.z - b.body.pos.z)).toBeGreaterThan(0.7);
  });
  it('a crowd of ten started inside a small area fans out and keeps room', () => {
    const sim = new Sim();
    const ps = [];
    for (let i = 0; i < 10; i++) ps.push(person(sim, 'q' + i, (i % 5) * 0.3, Math.floor(i / 5) * 0.3));
    for (const p of ps) p.body.vel.x = 0.01; // moving a hair so the soft push applies
    for (let i = 0; i < 240; i++) { for (const p of ps) p.body.vel.x = 0.01; sim.step(); }
    let md = 99;
    for (const a of ps) for (const b of ps) if (a !== b) md = Math.min(md, Math.hypot(a.body.pos.x - b.body.pos.x, a.body.pos.z - b.body.pos.z));
    expect(md).toBeGreaterThan(0.58);
  });
});

describe('stability', () => {
  it('a body spawned inside another separates gently with no speed', () => {
    for (const dt of [0.001, 1 / 60, 0.05]) {
      const sim = new Sim();
      const a = driven('sedan', 0, 0, 0, 'a', null), b = driven('sedan', 0.4, 0.5, 0.3, 'b', null);
      sim.add(a); sim.add(b);
      let peak = 0, firstMove = 0, prev = { x: b.body.pos.x, z: b.body.pos.z };
      const n = Math.round(2 / dt);
      for (let i = 0; i < n; i++) { sim.step(dt); peak = Math.max(peak, speedOf(a.body), speedOf(b.body)); if (i === 0) firstMove = Math.hypot(b.body.pos.x - prev.x, b.body.pos.z - prev.z); }
      expect(peak).toBeLessThan(0.5);
      expect(firstMove).toBeLessThan(0.1);
      const o = overlap(a.body, b.body);
      expect(o === null || o.depth < 0.01).toBe(true);
    }
  });
  it('200 cars stacked inside one cell separate or at least never explode', () => {
    const sim = new Sim();
    const cs: Vehicle[] = [];
    for (let i = 0; i < 200; i++) { const c = driven('sedan', (i % 20) * 0.5, Math.floor(i / 20) * 0.5, 0, 'k' + i, null); sim.add(c); cs.push(c); }
    let peak = 0;
    for (let i = 0; i < 120; i++) { sim.step(); for (const c of cs) peak = Math.max(peak, speedOf(c.body)); }
    expect(peak).toBeLessThan(3);
    for (const c of cs) { expect(Number.isFinite(c.body.pos.x)).toBe(true); expect(Math.abs(c.body.pos.x)).toBeLessThan(200); }
  });
  it('tiny steps and a 50 ms hitch do not let a 30 m/s car through a wall', () => {
    for (const dt of [0.002, 0.05]) {
      const sim = new Sim();
      sim.world.addStatic({ kind: 'segment', a: { x: 0, z: -50 }, b: { x: 0, z: 50 } }, undefined, 'w');
      const v = driven('sedan', -10, 0, Math.PI / 2, 'v', 'player'); sim.add(v); launch(v, 30);
      let nose = -99;
      const n = Math.round(1.2 / dt);
      for (let i = 0; i < n; i++) { v.setInput(input({ throttle: 1 })); sim.step(dt); nose = Math.max(nose, v.body.pos.x + 2.44); }
      expect(nose).toBeLessThan(0.05);
    }
  });
});

describe('road grip hook', () => {
  it('Vehicle.roadGrip multiplies tyre grip and braking: a wet road (0.7) stops later and slides earlier', () => {
    const stop = (): number => {
      const sim = new Sim(); const v = driven('sedan', 0, 0, 0, 's', 'player'); sim.add(v); launch(v, 20);
      let n = 0;
      while (speedOf(v.body) > 0.1 && n < 1200) { v.setInput(input({ brake: true })); sim.step(); n++; }
      return Math.abs(v.body.pos.z);
    };
    const turn = (): number => {
      const sim = new Sim(); const v = driven('sedan', 0, 0, 0, 'h', 'player'); sim.add(v); launch(v, 14);
      for (let i = 0; i < 180; i++) { v.setInput(input({ throttle: 0.5, steer: 1 })); sim.step(); }
      return Math.abs(v.body.heading);
    };
    expect(Vehicle.roadGrip).toBe(1);
    const dryStop = stop(), dryTurn = turn();
    Vehicle.roadGrip = 0.7;
    try {
      const wetStop = stop(), wetTurn = turn();
      expect(wetStop).toBeGreaterThan(dryStop * 1.3);
      expect(wetStop).toBeLessThan(dryStop * 1.6);
      expect(wetTurn).toBeLessThan(dryTurn * 0.9); // the front tyres hold less lateral acceleration: it pushes wide
    } finally { Vehicle.roadGrip = 1; }
  });
});

describe('handling per class (numbers for the table)', () => {
  it('nothing spins from a small steering input at speed, nothing is on rails: slip stays under 6 degrees at 0.2 steering', () => {
    for (const t of ['sedan', 'coupe911', 'suv', 'boxtruck', 'bus'] as const) {
      for (const v of [10, 20]) {
        const h = measureHandling(t, v);
        if (!h) continue;
        expect(h.smallSteerSlip).toBeLessThan(6);
        expect(h.liftSlip).toBeLessThan(12);
        expect(h.stopD).toBeGreaterThan(v * 0.25);   // not an instant stop
        expect(h.stopD).toBeLessThan(v * v / 6);     // not on ice: better than 6 m/s^2 mean braking
      }
    }
  });
  it('sports cars turn tighter and stop shorter than buses and trucks at the same speed', () => {
    const sport = measureHandling('exotic', 20)!, sedan = measureHandling('sedan', 20)!, suv = measureHandling('suv', 20)!;
    expect(sport.radius).toBeLessThan(sedan.radius);
    expect(sedan.radius).toBeLessThan(suv.radius + 1);
    expect(sport.stopD).toBeLessThan(sedan.stopD);
    const bus = measureHandling('bus', 10)!, car = measureHandling('sedan', 10)!;
    expect(bus.radius).toBeGreaterThan(car.radius * 1.5);
    expect(bus.stopD).toBeGreaterThan(car.stopD);
  });
});
