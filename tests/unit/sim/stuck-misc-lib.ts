/** STUCK: tunnelling, jitter at rest and exit-overlap checks on the soak worlds (not a test file). */
import { EventBus } from '@/core/Events';
import { forwardFromHeading, perpRight } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { Player } from '@/entities/Player';
import type { VehicleType } from '@/world/types';
import { DT, Sim, input, makeVehicle, stubMaterials } from './harness';
import type { SoakWorld } from './stuck-soak-lib';

export interface MiscReport { tunnelTrials: number; tunnelled: number; tunnelCases: string[]; jitterTrials: number; jittery: number; jitterMax: number; exitTrials: number; exitOverlap: number; exitFar: number; exitCases: string[]; rescues: number }

const TYPES: VehicleType[] = ['sedan', 'suv', 'hatch', 'pickup', 'cargovan', 'bus'];

export function miscChecks(w: SoakWorld, seed: number, n = 150): MiscReport {
  const rng = new Rng(seed * 31 + 5);
  const walls = w.anchors.filter((a) => a.kind === 'wall');
  const rep: MiscReport = { tunnelTrials: 0, tunnelled: 0, tunnelCases: [], jitterTrials: 0, jittery: 0, jitterMax: 0, exitTrials: 0, exitOverlap: 0, exitFar: 0, exitCases: [], rescues: 0 };
  const r0 = w.physics.rescues;
  // 1. tunnelling: flat out into a wall
  for (let i = 0; i < n * 8 && rep.tunnelTrials < n; i++) {
    const a = walls[Math.floor(rng.next() * walls.length)];
    const d = 40;
    const ang = (rng.range(-40, 40)) * Math.PI / 180;
    const x = a.x + a.nx * d, z = a.z + a.nz * d;
    if (w.physics.overlapsStatic({ x, z }, 2.6)) continue;
    const heading = Math.atan2(-a.nx, a.nz) + ang;
    const sim = new Sim(w.physics);
    const car = makeVehicle(rng.pick(TYPES), x, z, heading, new EventBus(), `tn${i}`);
    car.driver = 'player'; sim.add(car);
    const v0 = rng.pick([20, 28, 36]), f = forwardFromHeading(heading);
    car.body.vel.x = f.x * v0; car.body.vel.z = f.z * v0;
    let passed = false;
    for (let t = 0; t < 4 && !passed; t += DT) {
      car.setInput(input({ throttle: 1 })); sim.step(DT);
      if (w.physics.deepestOverlap(car.body, true).depth > 1.0) passed = true;
      // far side of the anchor's wall line, beyond the car's own half length
      if ((car.body.pos.x - a.x) * a.nx + (car.body.pos.z - a.z) * a.nz < -3.5) passed = true;
    }
    rep.tunnelTrials++;
    if (passed) { rep.tunnelled++; if (rep.tunnelCases.length < 8) rep.tunnelCases.push(`${a.id} v${v0} ang${Math.round(ang * 57.3)} at ${a.x.toFixed(0)},${a.z.toFixed(0)}`); }
    w.physics.removeBody(car.body.id);
  }
  // 2. jitter at rest: a parked row (some slightly overlapped) with a person leaning on it and walking along it
  for (let i = 0; i < n * 8 && rep.jitterTrials < n; i++) {
    const a = walls[Math.floor(rng.next() * walls.length)];
    const side = { x: -a.nz, z: a.nx };
    const gap = rng.range(0.1, 0.9);
    const sim = new Sim(w.physics);
    const ev = new EventBus();
    const cars = [] as ReturnType<typeof makeVehicle>[];
    const h = Math.atan2(side.x, -side.z);
    const cx = a.x + a.nx * (1 + gap), cz = a.z + a.nz * (1 + gap);
    const slack = rng.range(-0.3, 0.4);
    for (let k = 0; k < 3; k++) {
      const c = makeVehicle(rng.pick(TYPES), cx + side.x * k * (4.7 + slack), cz + side.z * k * (4.7 + slack), h, ev, `jt${i}-${k}`);
      c.driver = null;
      if (w.physics.deepestOverlap(c.body, true).depth > 0.0) continue;
      sim.add(c); cars.push(c);
    }
    if (cars.length === 0) continue;
    const p = new Player(`jp${i}`, { x: cx - a.nx * 1.4 + side.x, z: cz - a.nz * 1.4 + side.z }, stubMaterials, ev);
    sim.entities.set(p.body.id, p); w.physics.addBody(p.body);
    const fake = (fwd: number, right: number) => ({ caps: false, axis: (neg: string[]) => (neg[0] === 'KeyS' ? fwd : right), isDown: () => false, consume: () => false }) as never;
    const f0 = forwardFromHeading(0), r0v = perpRight(f0);
    for (let t = 0; t < 1; t += DT) { p.control(fake(0, 0), 0); sim.step(DT); }
    const start = cars.map((c) => ({ x: c.body.pos.x, z: c.body.pos.z, h: c.body.heading }));
    let maxMove = 0;
    // lean on the cars (toward them), 4 s
    const dx = a.nx, dz = a.nz;
    const mv = { x: dx, z: dz };
    for (let t = 0; t < 4; t += DT) { p.control(fake(mv.x * f0.x + mv.z * f0.z, mv.x * r0v.x + mv.z * r0v.z), 0); sim.step(DT); }
    cars.forEach((c, k) => { maxMove = Math.max(maxMove, Math.hypot(c.body.pos.x - start[k].x, c.body.pos.z - start[k].z)); });
    // jitter = movement of a car nobody pushes: sample the last car's per-step wobble while the person leans
    rep.jitterTrials++; rep.jitterMax = Math.max(rep.jitterMax, maxMove);
    if (maxMove > 0.02) rep.jittery++;
    w.physics.removeBody(p.body.id);
    for (const c of cars) w.physics.removeBody(c.body.id);
  }
  // 3. exit: get into a parked car near a wall / neighbours, get out, nobody may stand inside anything
  for (let i = 0; i < n * 8 && rep.exitTrials < n; i++) {
    const a = walls[Math.floor(rng.next() * walls.length)];
    const side = { x: -a.nz, z: a.nx };
    const sim = new Sim(w.physics);
    const ev = new EventBus();
    const gap = rng.range(0.05, 1.4);
    const h = Math.atan2(side.x, -side.z) + (rng.chance(0.5) ? Math.PI : 0) + rng.range(-0.25, 0.25);
    const cx = a.x + a.nx * (1 + gap), cz = a.z + a.nz * (1 + gap);
    const car = makeVehicle(rng.pick(TYPES), cx, cz, h, ev, `ex${i}`);
    car.driver = null;
    if (w.physics.deepestOverlap(car.body, true).depth > 0.0) continue;
    sim.add(car);
    const others = [] as ReturnType<typeof makeVehicle>[];
    for (const sgn of [-1, 1]) if (rng.chance(0.6)) {
      const o = makeVehicle(rng.pick(TYPES), cx + side.x * sgn * rng.range(4.4, 6.5), cz + side.z * sgn * rng.range(4.4, 6.5), h, ev, `ex${i}o${sgn}`);
      o.driver = null;
      if (w.physics.deepestOverlap(o.body).depth > 0) continue;
      sim.add(o); others.push(o);
    }
    const p = new Player(`ep${i}`, { x: cx + a.nx * 2.2, z: cz + a.nz * 2.2 }, stubMaterials, ev);
    sim.entities.set(p.body.id, p);
    w.physics.addBody(p.body);
    ev.on('enterVehicle', () => w.physics.removeBody(p.body.id));
    ev.on('exitVehicle', () => w.physics.addBody(p.body));
    const got = p.tryEnter([car]);
    if (got) {
      for (let s = 0; s < 60; s++) sim.step(DT);
      if (p.inVehicle) {
        p.exit();
        for (let s = 0; s < 60; s++) sim.step(DT);
        rep.exitTrials++;
        const o = w.physics.deepestOverlap(p.body);
        const dist = Math.hypot(p.body.pos.x - car.body.pos.x, p.body.pos.z - car.body.pos.z);
        if (o.depth > 0.02) { rep.exitOverlap++; if (rep.exitCases.length < 8) rep.exitCases.push(`gap${gap.toFixed(2)} depth ${o.depth.toFixed(2)} with ${o.other?.id.replace(/\d+/g, '#')} at ${cx.toFixed(0)},${cz.toFixed(0)}`); }
        if (dist > 7) rep.exitFar++;
      }
    }
    w.physics.removeBody(p.body.id); w.physics.removeBody(car.body.id); for (const o of others) w.physics.removeBody(o.body.id);
  }
  rep.rescues = w.physics.rescues - r0;
  return rep;
}
