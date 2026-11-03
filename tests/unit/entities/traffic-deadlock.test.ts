/**
 * TA2: an intersection is never a place a car stops indefinitely.
 * Seed 21 of the 5-minute sim: cars entered the box on green behind a stalled turner, then a left-turner and a
 * straight-through car blocked each other inside it. Reproduced here with a stub world on a one-corner lane graph.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import type { Body2D, IVehicle, IWorld2D, LaneGraph, LaneNode, VehicleInput } from '@/world/types';

class World implements IWorld2D {
  near: Body2D[] = [];
  /** bodies a ray can hit: only those lying in the ray's direction within reach */
  solid: Body2D[] = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody() {}
  removeBody() {}
  step() { return []; }
  queryCircle() { return this.near; }
  raycast(o: { x: number; z: number }, d: { x: number; z: number }, reach: number, ignore?: string) {
    let best: { body: Body2D; dist: number; point: { x: number; z: number } } | null = null;
    for (const b of this.solid) {
      if (b.id === ignore) continue;
      const rx = b.pos.x - o.x;
      const rz = b.pos.z - o.z;
      const along = rx * d.x + rz * d.z;
      if (along < 0 || along > reach) continue;
      if (Math.abs(rx * -d.z + rz * d.x) > 1.6) continue;
      if (!best || along < best.dist) best = { body: b, dist: along, point: { x: b.pos.x, z: b.pos.z } };
    }
    return best;
  }
  bodies() { return []; }
}

type Fake = IVehicle & { last: VehicleInput | null };
function fakeVehicle(id: string, x: number, z: number, heading: number): Fake {
  const body: Body2D = {
    id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
    pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
  };
  const v = {
    id, object3D: new THREE.Group(), body,
    spec: { type: 'sedan', length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
    speed: 0, damage: 0, driver: 'traffic' as IVehicle['driver'], siren: false, last: null as VehicleInput | null,
    setInput(i: VehicleInput) { v.last = { ...i }; }, doorPos() { return body.pos; }, update() {}, dispose() {},
  };
  body.userData = v;
  return v as unknown as Fake;
}

/** an eastbound approach: pre -> sl (stop line, signal-less so a stop sign) -> e1 -> e2 turning left (north) */
function corner(): LaneGraph {
  const nodes: Record<string, LaneNode> = {};
  const mk = (id: string, x: number, z: number, heading: number, stopLine: boolean): void => {
    nodes[id] = { id, pos: { x, z }, streetId: 's', heading, stopLine, intersectionId: stopLine ? 'i' : undefined } as LaneNode;
  };
  mk('pre', -30, 0, Math.PI / 2, false);
  mk('sl', 0, 0, Math.PI / 2, true);
  mk('e1', 10, -8, 0, false);
  mk('e2', 10, -40, 0, false);
  const edges: LaneGraph['edges'] = [
    { from: 'pre', to: 'sl', length: 30 }, { from: 'sl', to: 'e1', length: 13 }, { from: 'e1', to: 'e2', length: 32 },
  ];
  const adjacency: Record<string, number[]> = { pre: [0], sl: [1], e1: [2], e2: [] };
  return { nodes, edges, adjacency } as unknown as LaneGraph;
}

const DT = 1 / 30;
function hashOrder(): { low: string; high: string } {
  const ids = ['carA', 'carB'];
  return Rng.hash(ids[0]) < Rng.hash(ids[1]) ? { low: ids[0], high: ids[1] } : { low: ids[1], high: ids[0] };
}

/** a left-turner standing 5 m past its stop line, a car crossing its path (heading south) standing right in front of it */
function boxScene(myId: string, theirId: string, myHeading = 1.0) {
  const world = new World();
  const me = fakeVehicle(myId, 5, -3, myHeading);
  const other = fakeVehicle(theirId, 5 + Math.sin(myHeading) * 4.5, -3 - Math.cos(myHeading) * 4.5, Math.PI);
  const agent = new TrafficAgent(me, corner(), world, new Rng(1), { startNodeId: 'sl', cruiseSpeed: 8 });
  world.solid = [other.body];
  world.near = [other.body];
  return { world, me, other, agent };
}

function run(agent: TrafficAgent, v: Fake, seconds: number): { backedAt: number | null } {
  let backedAt: number | null = null;
  for (let i = 0; i < seconds / DT; i++) {
    agent.update(DT);
    if (backedAt === null && agent.state === 'backing') backedAt = i * DT;
  }
  void v;
  return { backedAt };
}

describe('TA2: the mutual block inside the intersection is broken', () => {
  it('a left-turner blocked by a standing crossing car backs out within about two seconds (it used to sit there until the 8 s stuck timer)', () => {
    const { me, agent } = boxScene('carA', 'carB');
    const { backedAt } = run(agent, me, 4);
    expect(backedAt).not.toBeNull();
    expect(backedAt!).toBeLessThan(2.5);
    // while backing it reverses, and afterwards it holds still instead of immediately re-entering
    expect(me.last!.brake || me.last!.throttle < 0).toBe(true);
  });

  it('exactly one of two mutually blocked straight-through cars yields: the one with the lower id hash, only after 3 s', () => {
    const { low, high } = hashOrder();
    const lowCase = boxScene(low, high, Math.PI / 2);
    lowCase.agent.update(DT);
    // not turning left: put it on a straight leg
    (lowCase.agent as unknown as { legTurn: number }).legTurn = 0;
    const r1 = run(lowCase.agent, lowCase.me, 5);
    expect(r1.backedAt).not.toBeNull();
    expect(r1.backedAt!).toBeGreaterThan(2.5);

    const highCase = boxScene(high, low, Math.PI / 2);
    highCase.agent.update(DT);
    (highCase.agent as unknown as { legTurn: number }).legTurn = 0;
    const r2 = run(highCase.agent, highCase.me, 6);
    expect(r2.backedAt).toBeNull();
  });

  it('a crossing car that is still moving is not a deadlock: the turner just waits', () => {
    const { me, other, agent } = boxScene('carA', 'carB');
    other.body.vel.z = 4;
    const { backedAt } = run(agent, me, 4);
    expect(backedAt).toBeNull();
  });
});

describe('TA2: do not block the box', () => {
  function jamScene(jam: boolean) {
    const world = new World();
    const me = fakeVehicle('me', -2, 0, Math.PI / 2);
    const agent = new TrafficAgent(me, corner(), world, new Rng(1), { startNodeId: 'pre', cruiseSpeed: 8 });
    // a car standing 5 m up the exit lane (queue spilling back toward the box)
    const queued = fakeVehicle('queued', 10, -13, 0);
    if (jam) world.near = [queued.body];
    return { world, me, agent, queued };
  }

  it('waits at the stop line while the exit lane is jammed, but only for about 8 s', () => {
    const { me, agent, world } = jamScene(true);
    let releasedAt: number | null = null;
    for (let i = 0; i < 14 / DT; i++) {
      agent.update(DT);
      if (releasedAt === null && agent.state === 'driving' && i * DT > 0.5) releasedAt = i * DT;
    }
    expect(world.near.length).toBe(1);
    expect(releasedAt).not.toBeNull();
    expect(releasedAt!).toBeGreaterThan(7);
    expect(releasedAt!).toBeLessThan(11);
    void me;
  });

  it('goes after the usual stop-sign pause when the exit is free', () => {
    const { agent } = jamScene(false);
    let releasedAt: number | null = null;
    for (let i = 0; i < 6 / DT; i++) {
      agent.update(DT);
      if (releasedAt === null && agent.state === 'driving' && i * DT > 0.2) releasedAt = i * DT;
    }
    expect(releasedAt).not.toBeNull();
    expect(releasedAt!).toBeLessThan(3);
  });

  it('a queued car on the exit that is merely a parked car does not hold the box', () => {
    const { agent, world, queued } = jamScene(true);
    queued.driver = null as unknown as IVehicle['driver'];
    (queued.body.userData as { driver: unknown }).driver = null;
    world.near = [queued.body];
    let releasedAt: number | null = null;
    for (let i = 0; i < 6 / DT; i++) {
      agent.update(DT);
      if (releasedAt === null && agent.state === 'driving' && i * DT > 0.2) releasedAt = i * DT;
    }
    expect(releasedAt).not.toBeNull();
    expect(releasedAt!).toBeLessThan(3);
  });
});
