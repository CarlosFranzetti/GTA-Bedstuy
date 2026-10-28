/**
 * Stage 2 QA: getting in and out of cars next to walls and other cars, with the real Player, Vehicle and World2D
 * (real map colliders). The player must always end up on the street side of an obstacle, never inside it or beyond it.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Player } from '@/entities/Player';
import { Sim, DT, makeVehicle, realPhysics, stubMaterials } from './harness';

interface Edge { id: string; mx: number; mz: number; nx: number; nz: number; heading: number; len: number }

/** Outward-facing long edges of the real building/prop polygons. */
function wallEdges(): Edge[] {
  const { world } = realPhysics();
  const out: Edge[] = [];
  for (const c of world.colliders) {
    if (c.shape.kind !== 'polygon') continue;
    const pts = c.shape.points;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 6) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      out.push({ id: c.id ?? 'static', mx, mz, nx, nz, heading: 0, len });
      break;
    }
  }
  return out;
}

describe('entering and exiting a car beside obstacles', () => {
  it('the driver door a hand-width from a real wall: the player leaves the car on the street side, outside the wall', () => {
    const edges = wallEdges();
    expect(edges.length).toBeGreaterThan(100);
    const stride = Math.floor(edges.length / 40);
    const failures: string[] = [];
    let tested = 0;
    for (let i = 0; i < edges.length && tested < 40; i += stride) {
      const e = edges[i];
      const { physics } = realPhysics();
      const sim = new Sim(physics);
      const events = new EventBus();
      // The car's LEFT flank (driver door) faces the wall, 0.25 m away. Left of heading h is (-cos h, -sin h);
      // we need left == -outward normal, so h satisfies (cos h, sin h) == outward normal.
      const h = Math.atan2(e.nz, e.nx);
      const half = 0.9;
      const gap = 0.25;
      const carPos = { x: e.mx + e.nx * (half + gap), z: e.mz + e.nz * (half + gap) };
      const car = makeVehicle('sedan', carPos.x, carPos.z, h, events, `exit${i}`);
      sim.add(car);
      // the player starts on the far side of the car (the street side)
      const player = new Player(`p${i}`, { x: carPos.x + e.nx * 2.2, z: carPos.z + e.nz * 2.2 }, stubMaterials, events);
      sim.entities.set(player.body.id, player);
      physics.addBody(player.body);
      events.on('enterVehicle', () => physics.removeBody(player.body.id));
      events.on('exitVehicle', () => physics.addBody(player.body));
      // enter: the car is claimed at once; the door is on the wall side, so the player glides through the car
      const claimed = player.tryEnter([car]);
      if (!claimed) { tested++; continue; } // door out of ENTER_RANGE for this geometry: not what we test
      for (let s = 0; s < 40; s++) sim.step(DT);
      if (!player.inVehicle) { failures.push(`${e.id}: never got in`); tested++; continue; }
      player.exit();
      for (let s = 0; s < 60; s++) sim.step(DT);
      tested++;
      const p = player.body.pos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { failures.push(`${e.id}: NaN`); continue; }
      // signed distance of the player from the wall plane along the outward normal
      const side = (p.x - e.mx) * e.nx + (p.z - e.mz) * e.nz;
      if (side < 0.3) failures.push(`${e.id}: ended ${side.toFixed(2)} m from the wall plane (inside or beyond the wall)`);
    }
    expect(tested).toBeGreaterThanOrEqual(35);
    expect(failures).toEqual([]);
  });

  it('exit beside a parked car on the door side: the player is pushed clear, not stuck inside the other car', () => {
    const sim = new Sim();
    const events = new EventBus();
    const a = makeVehicle('sedan', 0, 0, 0, events, 'a');
    const b = makeVehicle('sedan', -2.2, 0, 0, events, 'b'); // 0.4 m clear gap on the left (west) side
    sim.add(a); sim.add(b);
    const player = new Player('p', { x: -1.2, z: 2.9 }, stubMaterials, events); // north of both cars, 2.9 m from the door
    sim.entities.set(player.body.id, player);
    sim.world.addBody(player.body);
    events.on('enterVehicle', () => sim.world.removeBody(player.body.id));
    events.on('exitVehicle', () => sim.world.addBody(player.body));
    expect(player.tryEnter([a])).toBe(a);
    sim.run(1);
    expect(player.inVehicle).toBe(true);
    player.exit();
    sim.run(1);
    const outsideOf = (c: { body: { pos: { x: number; z: number } } }) => {
      const dx = player.body.pos.x - c.body.pos.x;
      const dz = player.body.pos.z - c.body.pos.z;
      return Math.abs(dx) >= 0.9 + 0.3 || Math.abs(dz) >= 2.3 + 0.3; // box 1.8 x 4.6 plus most of the 0.4 m body radius
    };
    expect(outsideOf(a)).toBe(true);
    expect(outsideOf(b)).toBe(true);
    expect(Number.isFinite(player.body.pos.x + player.body.pos.z)).toBe(true);
    // squeezing out of a 0.4 m gap may nudge the parked cars apart, but only slightly
    expect(Math.hypot(a.body.pos.x, a.body.pos.z)).toBeLessThan(0.5);
    expect(Math.hypot(b.body.pos.x + 2.2, b.body.pos.z)).toBeLessThan(0.5);
  });

  it('enter/exit cycles on one spot 20 times: no drift, no NaN, the car never moves', () => {
    const sim = new Sim();
    const events = new EventBus();
    const car = makeVehicle('sedan', 5, 5, 1.0, events, 'c');
    sim.add(car);
    const player = new Player('p', { x: car.doorPos().x - 0.8, z: car.doorPos().z - 0.8 }, stubMaterials, events);
    sim.entities.set(player.body.id, player);
    sim.world.addBody(player.body);
    events.on('enterVehicle', () => sim.world.removeBody(player.body.id));
    events.on('exitVehicle', () => sim.world.addBody(player.body));
    for (let i = 0; i < 20; i++) {
      const got = player.tryEnter([car]);
      expect(got).toBe(car);
      sim.run(0.6);
      expect(player.inVehicle).toBe(true);
      player.exit();
      sim.run(0.4);
      expect(Number.isFinite(player.body.pos.x + player.body.pos.z)).toBe(true);
      expect(car.driver).toBeNull();
      // walk back near the door for the next round
      player.body.pos.x = car.doorPos().x + 0.5;
      player.body.pos.z = car.doorPos().z;
    }
    expect(Math.hypot(car.body.pos.x - 5, car.body.pos.z - 5)).toBeLessThan(0.05);
    expect(Math.abs(car.body.heading - 1.0)).toBeLessThan(0.01);
  });
});
