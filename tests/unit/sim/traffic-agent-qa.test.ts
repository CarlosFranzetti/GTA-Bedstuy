/**
 * Stage 2 QA: small deterministic repros for the defects the 5-minute traffic sim turned up.
 * Each defect test is `it.fails`: it passes while the defect exists and goes red when it is fixed
 * (then change `it.fails` to `it`). Ids are tracked in docs/swarm/qa-stage2.md.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { Sim, DT, makeVehicle, realPhysics, input } from './harness';
import { Vehicle } from '@/entities/Vehicle';
import type { Contact } from '@/world/types';

describe('Vehicle impact events (Q10-D2)', () => {
  const pedBody = { id: 'ped1', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: 2, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 } as never;

  it('a hard first hit is reported exactly once', () => {
    const events = new EventBus();
    let n = 0;
    events.on('impact', () => n++);
    const v = makeVehicle('sedan', 0, 0, 0, events);
    const c: Contact = { a: v.body, b: pedBody, normal: { x: 1, z: 0 }, depth: 0.05, point: { x: 1, z: 0 }, impulse: 4 };
    v.onContact(c, pedBody);
    expect(n).toBe(1);
  });

  // A pedestrian (or a scraping car) that stays pressed against a car produces one contact per frame with a
  // slowly changing closing speed. The scrape filter only drops repeats that are NOT stronger than the first hit,
  // so a ramp of 3.00 -> 3.20 m/s fires an `impact` (crash sound, camera shake, crime check) on every frame.
  it('Q10-D2 (fixed by F12): a contact pressed for 1 s with a slowly rising impulse (3.0 -> 3.2) emits at most 2 impact events', () => {
    const events = new EventBus();
    let n = 0;
    events.on('impact', () => n++);
    const v = makeVehicle('sedan', 0, 0, 0, events);
    for (let i = 0; i < 60; i++) {
      v.update(DT);
      v.onContact({ a: v.body, b: pedBody, normal: { x: 1, z: 0 }, depth: 0.01, point: { x: 1, z: 0 }, impulse: 3 + i * 0.0034 }, pedBody);
    }
    expect(n).toBeLessThanOrEqual(2);
  });

  it('a constant-impulse press (no ramp) is already filtered: one event', () => {
    const events = new EventBus();
    let n = 0;
    events.on('impact', () => n++);
    const v = makeVehicle('sedan', 0, 0, 0, events);
    for (let i = 0; i < 60; i++) {
      v.update(DT);
      v.onContact({ a: v.body, b: pedBody, normal: { x: 1, z: 0 }, depth: 0.01, point: { x: 1, z: 0 }, impulse: 3 }, pedBody);
    }
    expect(n).toBe(1);
  });
});

describe('TrafficAgent on the real map', () => {
  /** Straight forward-lane node chain of the first long segment on `street` (lane `f`). */
  function lane(street: string, grid: ReturnType<typeof realPhysics>['world']['grid']) {
    const seg = grid.segments.find((s) => s.streetId === street && Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) > 140)!;
    const nodes = Object.values(grid.lanes.nodes)
      .filter((n) => n.id.startsWith(`ln:${seg.id}:f:`))
      .sort((a, b) => Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()));
    return nodes;
  }

  // Q10-D1: a stalled car in the lane; two followers queue behind it, then start to pass. The obstacle ray is cast
  // from the lane-offset line (pos - right * lat) before the body has moved there, so the passer cannot see the
  // car it is about to clip (and the follower behind cannot see the leader when a pass is cancelled).
  it('Q10-D1 (fixed by F12): overtaking a stalled car in the lane does not touch it (no impact >= 1.5 m/s in 40 s)', () => {
    const { physics, world } = realPhysics();
    const nodes = lane('kosciuszko', world.grid);
    const events = new EventBus();
    const sim = new Sim(physics);
    const mid = Math.floor(nodes.length / 2);
    const at = (i: number) => nodes[i];
    const c = makeVehicle('sedan', at(mid).pos.x, at(mid).pos.z, at(mid).heading, events, 'C');
    c.driver = null; // stalled, in the lane
    sim.add(c);
    const make = (id: string, node: typeof nodes[number]) => {
      const v = makeVehicle('sedan', node.pos.x, node.pos.z, node.heading, events, id);
      v.driver = 'traffic';
      v.body.vel = { x: Math.sin(v.body.heading) * 8, z: -Math.cos(v.body.heading) * 8 };
      sim.add(v);
      return { v, agent: new TrafficAgent(v, world.grid.lanes, physics, new Rng(id), { startNodeId: node.id, cruiseSpeed: 11 }) };
    };
    const L = make('L', at(mid - 3));
    const F = make('F', at(mid - 5));
    let worst = 0;
    events.on('impact', (e) => { worst = Math.max(worst, e.strength); });
    for (let i = 0; i < 60 * 40; i++) { L.agent.update(DT); F.agent.update(DT); sim.step(DT); }
    expect(worst).toBeLessThan(1.5);
  });

  // Q10-D4: a car that has been pushed off its lane drives straight at its target node; if a thin static (signal
  // pole, r = 0.12 m) is on that line it wedges against it, 'backing' 2 m and returning to the same line forever.
  it.fails('Q10-D4: an off-lane car aimed through a signal pole gets past it within 60 s', () => {
    const { physics, world } = realPhysics();
    const sim = new Sim(physics);
    const v = makeVehicle('sedan', 258.8, -196.7, -2.35, new EventBus(), 'wedge'); // 2.5 m from signal:garvey|hart:1:1
    v.driver = 'traffic';
    sim.add(v);
    const agent = new TrafficAgent(v, world.grid.lanes, physics, new Rng(1), { cruiseSpeed: 11 });
    (agent as unknown as { targetId: string }).targetId = 'ln:garvey:0:r:6'; // 9.5 m ahead, behind the pole
    const start = { x: v.body.pos.x, z: v.body.pos.z };
    for (let i = 0; i < 60 * 60; i++) { agent.update(DT); sim.step(DT); }
    expect(Math.hypot(v.body.pos.x - start.x, v.body.pos.z - start.z)).toBeGreaterThan(15);
  });
});

void Vehicle; void input;
