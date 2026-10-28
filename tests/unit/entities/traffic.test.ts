import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { TrafficSystem } from '@/game/TrafficSystem';
import type {
  Body2D, Graph, GridModel, IMaterialLibrary, IVehicle, IWorld2D, LaneGraph, LaneNode, VehicleInput, VehicleType,
} from '@/world/types';

// ------------------------------------------------------------------ fakes

type FakeVehicle = IVehicle & { last: VehicleInput | null; setSpeed(v: number): void };

function fakeVehicle(id: string, x: number, z: number, heading: number, type: VehicleType = 'sedan'): FakeVehicle {
  let speed = 0;
  const body: Body2D = {
    id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
    pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
  };
  const v = {
    id,
    object3D: new THREE.Group(),
    body,
    spec: { type, length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
    get speed() { return speed; },
    damage: 0,
    driver: 'traffic' as IVehicle['driver'],
    siren: false,
    last: null as VehicleInput | null,
    setSpeed(s: number) { speed = s; },
    setInput(i: VehicleInput) { v.last = { ...i }; },
    doorPos() { return { x: body.pos.x, z: body.pos.z }; },
    update() {},
    dispose() {},
  };
  body.userData = v;
  return v as unknown as FakeVehicle;
}

class FakeWorld implements IWorld2D {
  added: Body2D[] = [];
  removed: string[] = [];
  ray: ((from: unknown, dir: unknown, max: number, ignore?: string) => { body: Body2D; dist: number; point: { x: number; z: number } } | null) | null = null;
  circle: ((c: { x: number; z: number }, r: number) => Body2D[]) | null = null;
  addStatic(): Body2D { throw new Error('unused'); }
  addBody(b: Body2D) { this.added.push(b); }
  removeBody(id: string) { this.removed.push(id); }
  step() { return []; }
  queryCircle(c: { x: number; z: number }, r: number) { return this.circle ? this.circle(c, r) : []; }
  raycast(from: { x: number; z: number }, dir: { x: number; z: number }, max: number, ignore?: string) {
    return this.ray ? this.ray(from, dir, max, ignore) : null;
  }
  bodies() { return this.added; }
}

function node(id: string, x: number, z: number, heading: number, extra: Partial<LaneNode> = {}): LaneNode {
  return { id, pos: { x, z }, streetId: 's', heading, stopLine: false, ...extra };
}
function buildGraph<N extends { id: string }>(nodes: N[], edges: Array<[string, string]>) {
  const g = { nodes: {} as Record<string, N>, edges: [] as Graph['edges'], adjacency: {} as Record<string, number[]> };
  for (const n of nodes) { g.nodes[n.id] = n; g.adjacency[n.id] = []; }
  for (const [a, b] of edges) {
    const na = g.nodes[a] as unknown as { pos: { x: number; z: number } };
    const nb = g.nodes[b] as unknown as { pos: { x: number; z: number } };
    g.adjacency[a].push(g.edges.length);
    g.edges.push({ from: a, to: b, length: Math.hypot(na.pos.x - nb.pos.x, na.pos.z - nb.pos.z) });
  }
  return g;
}

/** 4-node directed loop with a branch: a -> b, b -> c, b -> d, c -> a, d -> a. b is a stop line. */
function lane4(): LaneGraph {
  return buildGraph(
    [
      node('a', 0, 0, Math.PI / 2),
      node('b', 20, 0, Math.PI / 2, { stopLine: true, intersectionId: 'x' }),
      node('c', 40, 0, Math.PI / 2),
      node('d', 40, 20, Math.PI),
    ],
    [['a', 'b'], ['b', 'c'], ['b', 'd'], ['c', 'a'], ['d', 'a']],
  ) as LaneGraph;
}

const hit = (dist: number) => ({ body: { id: 'x' } as Body2D, dist, point: { x: 0, z: 0 } });

// ------------------------------------------------------------------ TrafficAgent

describe('TrafficAgent', () => {
  it('steers positive toward a node to the right', () => {
    const lanes = buildGraph([node('a', 0, 0, 0), node('b', 20, -5, 0)], [['a', 'b'], ['b', 'a']]) as LaneGraph;
    const v = fakeVehicle('v', 0, 0, 0); // facing north, target to the east-north-east
    const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(1), { startNodeId: 'a' });
    expect(agent.targetNodeId).toBe('b');
    v.setSpeed(5);
    agent.update(1 / 60);
    expect(v.last!.steer).toBeGreaterThan(0);
    expect(v.last!.steer).toBeLessThanOrEqual(1);
  });

  it('steers negative toward a node to the left', () => {
    const lanes = buildGraph([node('a', 0, 0, 0), node('b', -20, -5, 0)], [['a', 'b'], ['b', 'a']]) as LaneGraph;
    const v = fakeVehicle('v', 0, 0, 0);
    const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(1), { startNodeId: 'a' });
    agent.update(1 / 60);
    expect(v.last!.steer).toBeLessThan(0);
  });

  it('accelerates when the road is clear and brakes when the ray hits at 4 m', () => {
    const lanes = lane4();
    const world = new FakeWorld();
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, lanes, world, new Rng(1), { startNodeId: 'd' });
    v.setSpeed(5);
    agent.update(1 / 60);
    expect(v.last!.throttle).toBeGreaterThan(0);
    expect(v.last!.brake).toBe(false);

    let args: { max: number; ignore?: string } | null = null;
    world.ray = (_f, _d, max, ignore) => { args = { max, ignore }; return hit(4); };
    agent.update(1 / 60);
    expect(v.last!.brake).toBe(true);
    expect(v.last!.throttle).toBe(0);
    expect(args!.ignore).toBe('v');
    expect(args!.max).toBeCloseTo(6 + 5, 5);
  });

  it('advances to the next node once within 3 m', () => {
    const lanes = lane4();
    const v = fakeVehicle('v', 38, 0, Math.PI / 2);
    // start at b: first target is c or d
    const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(3), { startNodeId: 'b' });
    const first = agent.targetNodeId!;
    expect(['c', 'd']).toContain(first);
    v.body.pos.x = lanes.nodes[first].pos.x - 2;
    v.body.pos.z = lanes.nodes[first].pos.z;
    agent.update(1 / 60);
    expect(agent.targetNodeId).toBe('a');
    expect(agent.previousNodeId).toBe(first);
  });

  it('does not advance while farther than 3 m', () => {
    const lanes = lane4();
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(1), { startNodeId: 'a' });
    v.body.pos.x = 10; // 10 m from b (a stop line)
    agent.update(1 / 60);
    expect(agent.targetNodeId).toBe('b');
  });

  it('never reverses an edge: every chosen target is a successor of the previous one', () => {
    const lanes = lane4();
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(42), { startNodeId: 'a', ignoreStopLines: true });
    let prev = agent.targetNodeId!;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      v.body.pos.x = lanes.nodes[prev].pos.x;
      v.body.pos.z = lanes.nodes[prev].pos.z;
      agent.update(1 / 60);
      const cur = agent.targetNodeId!;
      expect(cur).not.toBe(prev);
      const ok = lanes.adjacency[prev].some((ei) => lanes.edges[ei].to === cur);
      expect(ok).toBe(true);
      seen.add(cur);
      prev = cur;
    }
    expect(seen.size).toBe(4); // took both branches
  });

  describe('stop lines', () => {
    function atStopLine() {
      const lanes = lane4();
      const world = new FakeWorld();
      const v = fakeVehicle('v', 19, 0, Math.PI / 2);
      const agent = new TrafficAgent(v, lanes, world, new Rng(1), { startNodeId: 'a' });
      expect(agent.targetNodeId).toBe('b');
      return { v, agent, world };
    }

    it('waits 0.8 s at a stop line and then proceeds when the intersection is clear', () => {
      const { v, agent } = atStopLine();
      const dt = 0.1;
      agent.update(dt); // arrives, starts waiting
      expect(agent.state).toBe('waiting');
      for (let t = 0.1; t < 0.7; t += dt) agent.update(dt);
      expect(agent.state).toBe('waiting');
      expect(agent.targetNodeId).toBe('b');
      expect(v.last!.brake).toBe(true);
      expect(v.last!.throttle).toBe(0);
      for (let i = 0; i < 3; i++) agent.update(dt);
      expect(agent.state).toBe('driving');
      expect(['c', 'd']).toContain(agent.targetNodeId);
    });

    it('keeps waiting while a moving vehicle is in the intersection, then goes after 4 more seconds', () => {
      const { agent, world } = atStopLine();
      const other: Body2D = {
        id: 'other', kind: 'vehicle', shape: { kind: 'obb', halfW: 1, halfL: 2 },
        pos: { x: 27, z: 0 }, vel: { x: 0, z: 8 }, heading: 0, mass: 1400,
      };
      world.circle = () => [other];
      const dt = 0.1;
      let t = 0;
      for (; t < 4.7; t += dt) agent.update(dt);
      expect(agent.state).toBe('waiting');
      for (; t < 5.2; t += dt) agent.update(dt);
      expect(agent.state).toBe('driving');
    });

    it('ignores its own body in the intersection query', () => {
      const { v, agent, world } = atStopLine();
      world.circle = () => [v.body];
      for (let i = 0; i < 12; i++) agent.update(0.1);
      expect(agent.state).toBe('driving');
    });

    it('cops (ignoreStopLines) do not wait', () => {
      const lanes = lane4();
      const v = fakeVehicle('v', 19, 0, Math.PI / 2);
      const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(1), { startNodeId: 'a', ignoreStopLines: true });
      agent.update(0.016);
      expect(agent.state).toBe('driving');
      expect(['c', 'd']).toContain(agent.targetNodeId);
    });
  });

  it('prefers the branch toward its goal', () => {
    const lanes = buildGraph(
      [
        node('a', 0, 0, Math.PI / 2), node('b', 20, 0, Math.PI / 2),
        node('c', 40, 0, Math.PI / 2), node('c2', 80, 0, Math.PI / 2),
        node('d', 20, 20, Math.PI), node('d2', 20, 60, Math.PI),
      ],
      [['a', 'b'], ['b', 'c'], ['b', 'd'], ['c', 'c2'], ['d', 'd2']],
    ) as LaneGraph;
    const v = fakeVehicle('v', 19, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(5), { startNodeId: 'a', ignoreStopLines: true });
    agent.goal = { x: 20, z: 70 };
    agent.update(0.016);
    expect(agent.targetNodeId).toBe('d');
    // and the other way
    const w = fakeVehicle('w', 19, 0, Math.PI / 2);
    const agent2 = new TrafficAgent(w, lanes, new FakeWorld(), new Rng(5), { startNodeId: 'a', ignoreStopLines: true });
    agent2.goal = { x: 90, z: 0 };
    agent2.update(0.016);
    expect(agent2.targetNodeId).toBe('c');
  });
});

// ------------------------------------------------------------------ TrafficSystem

const materials = new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;

function fakeGrid(): GridModel {
  const streets = {
    main: { id: 'main', name: 'Main', signName: 'Main', axis: 'ew', offset: 0, class: 'avenue', roadWidth: 14, sidewalkWidth: 3, oneWay: 0 },
    hart: { id: 'hart', name: 'Hart', signName: 'Hart', axis: 'ew', offset: 100, class: 'street', roadWidth: 10, sidewalkWidth: 3, oneWay: 1 },
  } as const;
  const segments = [
    { id: 's1', streetId: 'main', fromIntersection: 'i0', toIntersection: 'i1', a: { x: -200, z: 0 }, b: { x: 200, z: 0 }, width: 14 },
    { id: 's2', streetId: 'hart', fromIntersection: 'i2', toIntersection: 'i3', a: { x: -200, z: 100 }, b: { x: 200, z: 100 }, width: 10 },
  ];
  // lanes: eastbound at z=+2, westbound at z=-2 on main, nodes every 20 m, joined at the ends
  const ln: LaneNode[] = [];
  const edges: Array<[string, string]> = [];
  for (let i = 0; i <= 20; i++) {
    const x = -200 + i * 20;
    ln.push(node(`e${i}`, x, 2, Math.PI / 2, { streetId: 'main' }));
    ln.push(node(`w${i}`, x, -2, -Math.PI / 2, { streetId: 'main' }));
    if (i < 20) { edges.push([`e${i}`, `e${i + 1}`]); edges.push([`w${i + 1}`, `w${i}`]); }
  }
  edges.push(['e20', 'w20'], ['w0', 'e0']);
  const lanes = buildGraph(ln, edges) as LaneGraph;
  const sn = [
    { id: 'sw0', pos: { x: 0, z: 9 } }, { id: 'sw1', pos: { x: 20, z: 9 } },
    { id: 'sw2', pos: { x: 40, z: 9 } }, { id: 'cw3', pos: { x: 40, z: -9 } },
  ];
  const se: Array<[string, string]> = [['sw0', 'sw1'], ['sw1', 'sw0'], ['sw1', 'sw2'], ['sw2', 'sw1'], ['sw2', 'cw3'], ['cw3', 'sw2']];
  const sidewalks = buildGraph(sn, se);
  return {
    bounds: { minX: -200, maxX: 200, minZ: -50, maxZ: 150 },
    streets: Object.values(streets), segments, lanes, sidewalks, crosswalks: [],
    streetById: (id: string) => streets[id as keyof typeof streets],
    nearestLaneNode: (p: { x: number; z: number }) => ln.reduce((b, n) => (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < Math.hypot(b.pos.x - p.x, b.pos.z - p.z) ? n : b)),
  } as unknown as GridModel;
}

function makeSystem(seed = 7) {
  const world = new FakeWorld();
  const scene = new THREE.Scene();
  const events = new EventBus();
  let n = 0;
  const made: FakeVehicle[] = [];
  const makeVehicle = (type: VehicleType, pos: { x: number; z: number }, heading: number) => {
    const v = fakeVehicle(`car${n++}`, pos.x, pos.z, heading, type);
    v.driver = null;
    made.push(v);
    return v;
  };
  const sys = new TrafficSystem(fakeGrid(), world, events, new Rng(seed), scene, materials, makeVehicle);
  return { sys, world, scene, events, made };
}

describe('TrafficSystem', () => {
  it('parks cars along two-way streets only, at the curb on both sides, facing their lane direction', () => {
    const { sys, scene } = makeSystem();
    const parked = sys.vehicles.filter((v) => v.driver === null);
    // 2 sides * ~(400-24)/11 slots * 65%
    expect(parked.length).toBeGreaterThan(30);
    expect(parked.length).toBeLessThan(70);
    for (const v of parked) {
      const { x, z } = v.body.pos;
      expect(Math.abs(z)).toBeGreaterThan(4.3);
      expect(Math.abs(z)).toBeLessThan(4.9); // 2.0 lane offset + 2.6
      expect(Math.abs(x)).toBeLessThanOrEqual(190);
      // south curb: eastbound (pi/2); north curb: westbound (-pi/2)
      const expected = z > 0 ? Math.PI / 2 : -Math.PI / 2;
      expect(Math.cos(v.body.heading - expected)).toBeGreaterThan(0.999);
      expect(scene.children).toContain(v.object3D);
    }
    // nothing on the one-way street
    expect(parked.some((v) => Math.abs(v.body.pos.z - 100) < 20)).toBe(false);
  });

  it('keeps parked cars spaced at least ~10 m apart per side', () => {
    const { sys } = makeSystem();
    const south = sys.vehicles.filter((v) => v.body.pos.z > 0).map((v) => v.body.pos.x).sort((a, b) => a - b);
    for (let i = 1; i < south.length; i++) expect(south[i] - south[i - 1]).toBeGreaterThan(9.5);
  });

  it('spawns 40 pedestrians into the scene and the world', () => {
    const { sys, scene, world } = makeSystem();
    expect(sys.peds.length).toBe(40);
    for (const p of sys.peds) {
      expect(scene.children).toContain(p.object3D);
      expect(world.added).toContain(p.body);
    }
  });

  it('is deterministic for a seed', () => {
    const a = makeSystem(11).sys.vehicles.map((v) => `${v.body.pos.x.toFixed(2)},${v.body.pos.z.toFixed(2)}`);
    const b = makeSystem(11).sys.vehicles.map((v) => `${v.body.pos.x.toFixed(2)},${v.body.pos.z.toFixed(2)}`);
    expect(a).toEqual(b);
  });

  it('spawns moving traffic 90-150 m from the player, capped at 30', () => {
    const { sys } = makeSystem();
    const player = { x: 0, z: 0 };
    for (let i = 0; i < 60; i++) sys.update(0.25, player);
    const moving = sys.vehicles.filter((v) => v.driver === 'traffic');
    expect(moving.length).toBeGreaterThan(5);
    expect(moving.length).toBeLessThanOrEqual(30);
    expect(sys.agentCount).toBe(moving.length);
    for (const v of moving) {
      expect((v as FakeVehicle).last).not.toBeNull(); // driven by an agent
    }
  });

  it('despawns traffic farther than 190 m but keeps parked cars', () => {
    const { sys, scene, world } = makeSystem();
    for (let i = 0; i < 20; i++) sys.update(0.25, { x: 0, z: 0 });
    const parkedCount = sys.vehicles.filter((v) => v.driver === null).length;
    const movers = sys.vehicles.filter((v) => v.driver === 'traffic');
    expect(movers.length).toBeGreaterThan(0);
    sys.update(0.25, { x: 5000, z: 0 });
    expect(sys.vehicles.filter((v) => v.driver === 'traffic').length).toBe(0);
    expect(sys.vehicles.filter((v) => v.driver === null).length).toBe(parkedCount);
    for (const v of movers) {
      expect(scene.children).not.toContain(v.object3D);
      expect(world.removed).toContain(v.body.id);
    }
  });

  it('drops the agent when the player steals a traffic car, but keeps the vehicle', () => {
    const { sys } = makeSystem();
    for (let i = 0; i < 10; i++) sys.update(0.25, { x: 0, z: 0 });
    const before = sys.agentCount;
    const victim = sys.vehicles.find((v) => v.driver === 'traffic')!;
    victim.driver = 'player';
    sys.update(0.016, { x: 0, z: 0 });
    expect(sys.agentCount).toBe(before - 1);
    expect(sys.vehicles).toContain(victim);
    const last = (victim as FakeVehicle).last;
    sys.update(0.016, { x: 0, z: 0 });
    expect((victim as FakeVehicle).last).toBe(last); // no more AI input
  });

  it('scatters nearby pedestrians when one is knocked down', () => {
    const { sys, events } = makeSystem();
    const p = sys.peds[0];
    events.emit('pedKnockedDown', { id: 'someone-else', pos: { x: p.body.pos.x + 1, z: p.body.pos.z } });
    expect(p.state).toBe('fleeing');
  });
});

// ------------------------------------------------------------------ signals, lane discipline, pedestrians

import { TrafficLights } from '@/game/TrafficLights';
import { AVENUE_LIMIT, STREET_LIMIT } from '@/game/TrafficSystem';

/** Minimal kinematic integration of the inputs an agent produces (accel 6, brake 10, bicycle steering). */
function stepCar(v: FakeVehicle, agent: TrafficAgent, dt: number): void {
  agent.update(dt);
  const i = v.last!;
  let sp = v.speed;
  if (i.brake) sp = sp > 0 ? Math.max(0, sp - 10 * dt) : Math.min(0, sp + 10 * dt);
  else sp += i.throttle * 6 * dt;
  v.setSpeed(sp);
  const b = v.body;
  b.heading += (sp / 2.6) * Math.tan(i.steer * 0.5) * dt;
  b.vel.x = Math.sin(b.heading) * sp;
  b.vel.z = -Math.cos(b.heading) * sp;
  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;
}

/** One avenue ('s', ns) crossing a street ('cross'), 83 s cycle. */
function signalGrid() {
  const streets = {
    s: { id: 's', class: 'avenue', roadWidth: 14, sidewalkWidth: 4, oneWay: 0 },
    cross: { id: 'cross', class: 'street', roadWidth: 10, sidewalkWidth: 3.5, oneWay: 0 },
  } as const;
  return {
    intersections: [{ id: 'x', center: { x: 30, z: 0 }, nsStreetId: 's', ewStreetId: 'cross', halfX: 7, halfZ: 5 }],
    streetById: (id: string) => streets[id as keyof typeof streets],
  };
}
function lightsAt(local: number): TrafficLights {
  const l = new TrafficLights(signalGrid() as never);
  l.update(((local - l.localTime('x')) % 83 + 83) % 83);
  return l;
}

describe('TrafficAgent at signals', () => {
  /** eastbound lane a(0) -> b(20, stop line of intersection x on street "s") -> c(40) */
  function lane(): LaneGraph {
    return buildGraph(
      [
        node('a', 0, 0, Math.PI / 2),
        node('b', 20, 0, Math.PI / 2, { stopLine: true, intersectionId: 'x' }),
        node('c', 40, 0, Math.PI / 2),
        node('d', 80, 0, Math.PI / 2),
      ],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    ) as LaneGraph;
  }
  function setup(lights: TrafficLights, x = 0, speed = 11) {
    const v = fakeVehicle('v', x, 0, Math.PI / 2);
    v.setSpeed(speed);
    const agent = new TrafficAgent(v, lane(), new FakeWorld(), new Rng(1), { startNodeId: 'a', lights, cruiseSpeed: 11 });
    return { v, agent };
  }

  it('stops at a red light and holds there', () => {
    const lights = lightsAt(55); // ns (street "s") red, cross green
    expect(lights.phaseFor('x', 's')).toBe('red');
    const { v, agent } = setup(lights);
    for (let t = 0; t < 8; t += 1 / 30) { stepCar(v, agent, 1 / 30); lights.update(1 / 30); }
    expect(lights.phaseFor('x', 's')).toBe('red');
    expect(v.body.pos.x).toBeLessThan(20.01);
    expect(v.body.pos.x).toBeGreaterThan(14);
    expect(Math.abs(v.speed)).toBeLessThan(0.1);
    expect(agent.state).toBe('waiting');
    expect(agent.targetNodeId).toBe('b');
  });

  it('proceeds when the light turns green (after a short reaction), without the stop-sign pause', () => {
    const lights = lightsAt(77); // cross yellow/red: ns about to go green at 83
    const { v, agent } = setup(lights, 5, 6);
    let wentAt = -1;
    for (let t = 0; t < 14; t += 1 / 30) {
      stepCar(v, agent, 1 / 30);
      lights.update(1 / 30);
      if (wentAt < 0 && lights.phaseFor('x', 's') === 'green' && v.body.pos.x > 21) wentAt = t;
    }
    expect(v.body.pos.x).toBeGreaterThan(30);
    expect(agent.targetNodeId).not.toBe('b');
  });

  it('does not stop at all on green', () => {
    const lights = lightsAt(5);
    const { v, agent } = setup(lights);
    let minSpeed = 99;
    for (let t = 0; t < 4; t += 1 / 30) {
      stepCar(v, agent, 1 / 30);
      lights.update(1 / 30);
      if (v.body.pos.x > 5) minSpeed = Math.min(minSpeed, v.speed);
      expect(agent.state).toBe('driving');
    }
    expect(minSpeed).toBeGreaterThan(5);
    expect(v.body.pos.x).toBeGreaterThan(30);
  });

  it('stops for a yellow it can stop for but carries through one it cannot', () => {
    // yellow starts at local 45
    const far = lightsAt(45.5);
    const a = setup(far, 0, 10); // 20 m from the line at 10 m/s: can stop (needs ~14 m)
    for (let t = 0; t < 1.2; t += 1 / 30) { stepCar(a.v, a.agent, 1 / 30); far.update(1 / 30); }
    for (let t = 0; t < 6; t += 1 / 30) { stepCar(a.v, a.agent, 1 / 30); far.update(1 / 30); }
    expect(a.v.body.pos.x).toBeLessThan(20.01);

    const near = lightsAt(45.5);
    const b = setup(near, 14, 12); // 6 m from the line at 12 m/s: cannot stop
    for (let t = 0; t < 3; t += 1 / 30) { stepCar(b.v, b.agent, 1 / 30); near.update(1 / 30); }
    expect(b.v.body.pos.x).toBeGreaterThan(24);
  });

  it('a car already committed through the light is not stopped by the red that follows', () => {
    const lights = lightsAt(46.5); // yellow, 1.5 s left
    const { v, agent } = setup(lights, 12, 12);
    for (let t = 0; t < 3; t += 1 / 30) { stepCar(v, agent, 1 / 30); lights.update(1 / 30); }
    expect(lights.phaseFor('x', 's')).toBe('red');
    expect(v.body.pos.x).toBeGreaterThan(30);
  });

  it('cops that ignore stop lines also ignore signals', () => {
    const lights = lightsAt(55);
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    v.setSpeed(11);
    const agent = new TrafficAgent(v, lane(), new FakeWorld(), new Rng(1), { startNodeId: 'a', lights, ignoreStopLines: true, cruiseSpeed: 11 });
    for (let t = 0; t < 4; t += 1 / 30) stepCar(v, agent, 1 / 30);
    expect(v.body.pos.x).toBeGreaterThan(30);
  });

  it('an unsignalised stop line still behaves as a stop sign when lights are supplied', () => {
    const lights = new TrafficLights({ intersections: [], streetById: () => undefined } as never);
    const v = fakeVehicle('v', 19, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, lane(), new FakeWorld(), new Rng(1), { startNodeId: 'a', lights });
    agent.update(0.1);
    expect(agent.state).toBe('waiting');
  });
});

describe('TrafficAgent driving behaviour', () => {
  function straight(): LaneGraph {
    const ns: LaneNode[] = [];
    const edges: Array<[string, string]> = [];
    for (let i = 0; i <= 10; i++) { ns.push(node(`n${i}`, i * 20, 0, Math.PI / 2)); if (i > 0) edges.push([`n${i - 1}`, `n${i}`]); }
    return buildGraph(ns, edges) as LaneGraph;
  }
  /** a stationary blocker at (blockX, 0): rays that start within 1 m of z = 0 and point east hit it */
  function blockerWorld(blockX: number, driver: IVehicle['driver']) {
    const w = new FakeWorld();
    const body: Body2D = {
      id: 'blocker', kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
      pos: { x: blockX, z: 0 }, vel: { x: 0, z: 0 }, heading: Math.PI / 2, mass: 1400, userData: { driver },
    };
    w.ray = (from, dir, max) => {
      const f = from as { x: number; z: number };
      const d = dir as { x: number; z: number };
      if (d.x < 0.5) return null;
      if (Math.abs(f.z) > 1.0) return null;
      const dd = blockX - 2.2 - f.x;
      if (dd < 0 || dd > max) return null;
      return { body, dist: dd, point: { x: blockX, z: 0 } };
    };
    w.circle = () => [];
    return { w, body };
  }

  it('overtakes a parked car by moving into the adjacent lane when it is clear, then returns to its lane', () => {
    const { w } = blockerWorld(60, null);
    const v = fakeVehicle('v', 20, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9 });
    let maxLat = 0;
    let passed = false;
    for (let t = 0; t < 30; t += 1 / 30) {
      stepCar(v, agent, 1 / 30);
      maxLat = Math.max(maxLat, agent.lateralOffset);
      if (v.body.pos.x > 70) { passed = true; break; }
    }
    expect(maxLat).toBeGreaterThan(3);
    expect(passed).toBe(true);
    // beside the blocker the car really was in the other lane (left of eastbound travel = -z)
    for (let t = 0; t < 6; t += 1 / 30) stepCar(v, agent, 1 / 30);
    expect(agent.isOvertaking).toBe(false);
    expect(agent.lateralOffset).toBe(0);
  });

  it('steers left (negative) while moving out to pass', () => {
    const { w } = blockerWorld(40, null);
    const v = fakeVehicle('v', 30, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9 });
    let minSteer = 0;
    for (let t = 0; t < 4; t += 1 / 30) { stepCar(v, agent, 1 / 30); minSteer = Math.min(minSteer, v.last!.steer); }
    expect(minSteer).toBeLessThan(-0.05);
    expect(v.body.pos.z).toBeLessThan(-0.3);
  });

  it('does not overtake when the adjacent lane is not clear', () => {
    const { w } = blockerWorld(40, null);
    const base = w.ray!;
    // oncoming car in the passing lane: any ray from the shifted line hits it
    w.ray = (from, dir, max, ig) => {
      const f = from as { x: number; z: number };
      if (Math.abs(f.z + 3.1) < 1) return { body: { id: 'oncoming' } as Body2D, dist: 12, point: { x: 0, z: 0 } };
      return base(from, dir, max, ig);
    };
    const v = fakeVehicle('v', 33, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9 });
    for (let t = 0; t < 6; t += 1 / 30) stepCar(v, agent, 1 / 30);
    expect(agent.isOvertaking).toBe(false);
    expect(v.body.pos.x).toBeLessThan(40);
  });

  it('only passes a broken-down traffic car after waiting about 3 s (parked ones after under 1 s)', () => {
    const run = (driver: IVehicle['driver']) => {
      const { w } = blockerWorld(40, driver);
      const v = fakeVehicle('v', 33, 0, Math.PI / 2);
      const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9 });
      for (let t = 0; t < 12; t += 1 / 30) {
        stepCar(v, agent, 1 / 30);
        if (agent.isOvertaking) return t;
      }
      return Infinity;
    };
    const parked = run(null);
    const stalled = run('traffic');
    expect(parked).toBeLessThan(3);
    expect(stalled).toBeGreaterThan(2.5);
    expect(stalled).toBeLessThan(8);
  });

  it('honks after being blocked for 3 s, in pulses, and not before', () => {
    const w = new FakeWorld();
    w.ray = () => hit(4); // a wall that never moves (no adjacent lane clear either)
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9, overtake: false });
    const horns: number[] = [];
    for (let t = 0; t < 12; t += 0.05) {
      agent.update(0.05);
      if (v.last!.horn) horns.push(t);
    }
    expect(horns.length).toBeGreaterThan(0);
    expect(horns[0]).toBeGreaterThan(2.8);
    expect(horns[0]).toBeLessThan(3.5);
    expect(horns.some((t) => t > 6.5)).toBe(true); // honks again later
    expect(horns.length).toBeLessThan(12 / 0.05 / 4); // pulses, not a held horn
  });

  it('does not honk while queued at a red light', () => {
    const w = new FakeWorld();
    w.ray = () => hit(4);
    const lights = lightsAt(55);
    const lanes = buildGraph(
      [node('a', 0, 0, Math.PI / 2), node('b', 20, 0, Math.PI / 2, { stopLine: true, intersectionId: 'x' }), node('c', 40, 0, Math.PI / 2)],
      [['a', 'b'], ['b', 'c'], ['c', 'a']],
    ) as LaneGraph;
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, lanes, w, new Rng(1), { startNodeId: 'c', lights, cruiseSpeed: 9 });
    for (let t = 0; t < 8; t += 0.05) { agent.update(0.05); expect(v.last!.horn).toBe(false); }
  });

  it('backs off about 2 m after being stuck for 8 s, then retries', () => {
    const w = new FakeWorld();
    w.ray = (from, dir) => ((dir as { x: number }).x > 0 ? hit(3) : null); // blocked ahead only
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9, overtake: false });
    let backedAt = -1;
    for (let t = 0; t < 14; t += 1 / 30) {
      stepCar(v, agent, 1 / 30);
      if (backedAt < 0 && agent.state === 'backing') backedAt = t;
    }
    expect(backedAt).toBeGreaterThan(7.5);
    expect(backedAt).toBeLessThan(9);
    expect(v.body.pos.x).toBeLessThan(-1.2);
    expect(v.body.pos.x).toBeGreaterThan(-3.5);
  });

  it('slows to a stop for a pedestrian in the lane ahead and goes once they have crossed', () => {
    const w = new FakeWorld();
    const ped: Body2D = { id: 'p', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: 40, z: 0.5 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 };
    w.circle = () => [ped];
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    v.setSpeed(10);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 11 });
    for (let t = 0; t < 8; t += 1 / 30) stepCar(v, agent, 1 / 30);
    expect(v.body.pos.x).toBeLessThan(38);
    expect(v.body.pos.x).toBeGreaterThan(25);
    expect(Math.abs(v.speed)).toBeLessThan(0.2);
    ped.pos.z = 8; // reaches the sidewalk
    for (let t = 0; t < 5; t += 1 / 30) stepCar(v, agent, 1 / 30);
    expect(v.body.pos.x).toBeGreaterThan(45);
  });

  it('ignores pedestrians on the sidewalk beside the road', () => {
    const w = new FakeWorld();
    const ped: Body2D = { id: 'p', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: 40, z: 6 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 };
    w.circle = () => [ped];
    const v = fakeVehicle('v', 0, 0, Math.PI / 2);
    v.setSpeed(10);
    const agent = new TrafficAgent(v, straight(), w, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 11 });
    for (let t = 0; t < 6; t += 1 / 30) stepCar(v, agent, 1 / 30);
    expect(v.body.pos.x).toBeGreaterThan(60);
  });

  it('prefers going straight at forks (about 5:1 per turn)', () => {
    const lanes = buildGraph(
      [
        node('in', 0, 0, Math.PI / 2),
        node('s', 10, 0, Math.PI / 2), node('l', 10, -10, 0), node('r', 10, 10, Math.PI),
      ],
      [['in', 's'], ['in', 'l'], ['in', 'r'], ['s', 'in'], ['l', 'in'], ['r', 'in']],
    ) as LaneGraph;
    const counts: Record<string, number> = { s: 0, l: 0, r: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const v = fakeVehicle('v', 0, 0, Math.PI / 2);
      const agent = new TrafficAgent(v, lanes, new FakeWorld(), new Rng(seed), { startNodeId: 'in' });
      counts[agent.targetNodeId!]++;
    }
    expect(counts.s).toBeGreaterThan(300 * 0.55);
    expect(counts.l).toBeGreaterThan(10);
    expect(counts.r).toBeGreaterThan(10);
  });

  it('respects the street class speed limit with per-driver variance', () => {
    expect(AVENUE_LIMIT).toBe(13);
    expect(STREET_LIMIT).toBe(11);
    const cruise = (id: string, limit: number) => {
      const v = fakeVehicle(id, 0, 0, Math.PI / 2);
      const agent = new TrafficAgent(v, straight(), new FakeWorld(), new Rng(1), { startNodeId: 'n0', speedForStreet: () => limit });
      let lo = 0;
      let hi = 30;
      for (let i = 0; i < 20; i++) { // find the speed above which the agent brakes
        const m = (lo + hi) / 2;
        v.setSpeed(m);
        agent.update(1 / 60);
        if (v.last!.brake) hi = m; else lo = m;
      }
      return lo - 1;
    };
    const speeds = Array.from({ length: 12 }, (_, i) => cruise(`car${i}`, AVENUE_LIMIT));
    for (const s of speeds) { expect(s).toBeGreaterThan(AVENUE_LIMIT * 0.85); expect(s).toBeLessThan(AVENUE_LIMIT * 1.06); }
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.3);
  });
});

describe('TrafficSystem with signals', () => {
  it('owns the lights clock and exposes the controller', () => {
    const { sys } = makeSystem();
    const t0 = sys.lights.clock;
    sys.update(0.5, { x: 0, z: 0 });
    expect(sys.lights.clock).toBeCloseTo(t0 + 0.5, 5);
  });

  it('uses a supplied controller', () => {
    const lights = new TrafficLights({ intersections: [], streetById: () => undefined } as never);
    const world = new FakeWorld();
    const sys = new TrafficSystem(fakeGrid(), world, new EventBus(), new Rng(1), new THREE.Scene(), materials,
      (type, pos, heading) => fakeVehicle('c', pos.x, pos.z, heading, type), undefined, lights);
    expect(sys.lights).toBe(lights);
  });
});
