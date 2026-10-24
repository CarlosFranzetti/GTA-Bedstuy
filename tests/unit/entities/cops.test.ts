import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { CopAgent } from '@/entities/Cop';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import type {
  Body2D, Graph, GridModel, IVehicle, IWorld2D, LaneGraph, LaneNode, VehicleInput, VehicleType,
} from '@/world/types';

// ------------------------------------------------------------------ fakes

type FakeVehicle = IVehicle & { last: VehicleInput | null; setSpeed(v: number): void; disposed: boolean };

function fakeVehicle(id: string, x: number, z: number, heading: number, type: VehicleType = 'cop'): FakeVehicle {
  let speed = 0;
  const body: Body2D = {
    id, kind: type === 'cop' ? 'cop' : 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
    pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
  };
  const v = {
    id,
    object3D: new THREE.Group(),
    body,
    spec: { type, length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
    get speed() { return speed; },
    damage: 0,
    driver: null as IVehicle['driver'],
    siren: false,
    disposed: false,
    last: null as VehicleInput | null,
    setSpeed(s: number) { speed = s; },
    setInput(i: VehicleInput) { v.last = { ...i }; },
    doorPos() { return { x: body.pos.x, z: body.pos.z }; },
    update() {},
    dispose() { v.disposed = true; },
  };
  body.userData = v;
  return v as unknown as FakeVehicle;
}

class FakeWorld implements IWorld2D {
  list: Body2D[] = [];
  removed: string[] = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody(b: Body2D) { this.list.push(b); }
  removeBody(id: string) { this.removed.push(id); this.list = this.list.filter((b) => b.id !== id); }
  step() { return []; }
  queryCircle() { return []; }
  raycast() { return null; }
  bodies() { return this.list; }
}

function lnode(id: string, x: number, z: number, heading: number, extra: Partial<LaneNode> = {}): LaneNode {
  return { id, pos: { x, z }, streetId: 's', heading, stopLine: false, ...extra };
}

/** Eastbound/westbound lanes on z = +/-2 from x=-300 to 300 (nodes every 20 m), joined at the ends. */
function fakeGrid(): GridModel {
  const nodes: LaneNode[] = [];
  const g: LaneGraph = { nodes: {}, edges: [], adjacency: {} };
  const add = (n: LaneNode) => { g.nodes[n.id] = n; g.adjacency[n.id] = []; nodes.push(n); };
  const link = (a: string, b: string) => {
    g.adjacency[a].push(g.edges.length);
    g.edges.push({ from: a, to: b, length: Math.hypot(g.nodes[a].pos.x - g.nodes[b].pos.x, g.nodes[a].pos.z - g.nodes[b].pos.z) });
  };
  for (let i = 0; i <= 30; i++) {
    const x = -300 + i * 20;
    add(lnode(`e${i}`, x, 2, Math.PI / 2, i % 5 === 4 ? { stopLine: true, intersectionId: 'x' } : {}));
    add(lnode(`w${i}`, x, -2, -Math.PI / 2));
  }
  for (let i = 0; i < 30; i++) { link(`e${i}`, `e${i + 1}`); link(`w${i + 1}`, `w${i}`); }
  link('e30', 'w30'); link('w0', 'e0');
  return {
    lanes: g,
    sidewalks: { nodes: {}, edges: [], adjacency: {} } as Graph,
    nearestLaneNode: (p: { x: number; z: number }) =>
      nodes.reduce((b, n) => (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < Math.hypot(b.pos.x - p.x, b.pos.z - p.z) ? n : b)),
  } as unknown as GridModel;
}

function setup(seed = 3) {
  const events = new EventBus();
  const world = new FakeWorld();
  const scene = new THREE.Scene();
  const wanted = new WantedSystem(events);
  const made: FakeVehicle[] = [];
  const makeVehicle = (type: VehicleType, pos: { x: number; z: number }, heading: number) => {
    const v = fakeVehicle(`cop${made.length}`, pos.x, pos.z, heading, type);
    made.push(v);
    return v;
  };
  const sys = new CopSystem(fakeGrid(), world, events, new Rng(seed), scene, makeVehicle, wanted);
  const crimes: GameEvents['crime'][] = [];
  events.on('crime', (c) => crimes.push(c));
  const crime = () => events.emit('crime', { type: 'hitPed', pos: { x: 0, z: 0 } });
  return { events, world, scene, wanted, sys, made, crimes, crime };
}

const P = { x: 0, z: 0 };

// ------------------------------------------------------------------ CopSystem

describe('CopSystem', () => {
  it('spawns no cops without stars', () => {
    const { sys } = setup();
    sys.update(0.1, P);
    expect(sys.cops.length).toBe(0);
  });

  it('cop count follows stars: 1 -> 1, 2 -> 2, 3 -> 3', () => {
    const { sys, crime } = setup();
    crime(); sys.update(0.1, P);
    expect(sys.cops.length).toBe(1);
    crime(); sys.update(0.1, P);
    expect(sys.cops.length).toBe(2);
    crime(); sys.update(0.1, P);
    expect(sys.cops.length).toBe(3);
    sys.update(0.1, P);
    expect(sys.cops.length).toBe(3);
  });

  it('spawns cops 100-140 m away on lane nodes, with siren on, in the scene and the world', () => {
    const { sys, crime, scene, world } = setup();
    crime(); crime(); crime();
    sys.update(0.1, P);
    for (const c of sys.cops) {
      const d = Math.hypot(c.body.pos.x, c.body.pos.z);
      expect(d).toBeGreaterThanOrEqual(99);
      expect(d).toBeLessThanOrEqual(141);
      expect(c.siren).toBe(true);
      expect(c.driver).toBe('cop');
      expect(scene.children).toContain(c.object3D);
      expect(world.list).toContain(c.body);
    }
  });

  it('cops drive off when stars drop to 0 and despawn beyond 150 m', () => {
    const { sys, crime, wanted, scene, world } = setup();
    crime(); crime();
    sys.update(0.1, P);
    expect(sys.cops.length).toBe(2);
    const gone = [...sys.cops] as FakeVehicle[];
    for (let i = 0; i < 50; i++) wanted.update(1);
    expect(wanted.stars).toBe(0);
    sys.update(0.1, P);
    // still around (within 150 m of the player? they spawned at 100-140 m), siren off, no new ones
    expect(sys.cops.length).toBe(2);
    expect(gone.every((c) => !c.siren)).toBe(true);
    // one cop leaves beyond 150 m
    gone[0].body.pos.x = 400;
    sys.update(0.1, P);
    expect(sys.cops.length).toBe(1);
    expect(scene.children).not.toContain(gone[0].object3D);
    expect(world.removed).toContain(gone[0].body.id);
    expect(gone[0].disposed).toBe(true);
  });

  it('sends the farthest cop home when stars decay from 3 to 2', () => {
    const { sys, crime, wanted } = setup();
    crime(); crime(); crime();
    sys.update(0.1, P);
    for (let i = 0; i < 21; i++) wanted.update(1);
    expect(wanted.stars).toBe(2);
    sys.update(0.1, P);
    expect(sys.cops.filter((c) => c.siren).length).toBe(2);
    expect(sys.cops.length).toBe(3);
  });

  it('re-dispatches an off-duty cop instead of spawning a new one when stars rise again', () => {
    const { sys, crime, wanted } = setup();
    crime(); sys.update(0.1, P);
    for (let i = 0; i < 25; i++) wanted.update(1);
    sys.update(0.1, P);
    expect(sys.cops[0].siren).toBe(false);
    crime(); sys.update(0.1, P);
    expect(sys.cops.length).toBe(1);
    expect(sys.cops[0].siren).toBe(true);
  });

  it('leaves a cop car alone once the player has taken it over', () => {
    const { sys, crime } = setup();
    crime(); sys.update(0.1, P);
    const car = sys.cops[0] as FakeVehicle;
    car.driver = 'player';
    car.last = null;
    sys.update(0.1, P);
    expect(car.last).toBeNull();
    expect(sys.cops).toContain(car);
    expect(sys.cops.length).toBe(2); // the stolen car is still tracked, and a replacement was dispatched
  });

  describe('hitCop crime', () => {
    function withBodies() {
      const ctx = setup();
      ctx.crime(); ctx.sys.update(0.1, P);
      const cop = ctx.sys.cops[0];
      const player = fakeVehicle('pv', 0, 0, 0, 'sedan');
      player.driver = 'player';
      const traffic = fakeVehicle('tv', 3, 0, 0, 'sedan');
      traffic.driver = 'traffic';
      ctx.world.addBody(player.body);
      ctx.world.addBody(traffic.body);
      ctx.crimes.length = 0;
      return { ...ctx, cop, player, traffic };
    }

    it('player vehicle hitting a cop above impulse 3 emits crime hitCop', () => {
      const { events, crimes, cop } = withBodies();
      events.emit('impact', { a: 'pv', b: cop.body.id, strength: 5, pos: { x: 1, z: 2 } });
      expect(crimes).toEqual([{ type: 'hitCop', pos: { x: 1, z: 2 } }]);
    });

    it('works with the ids in either order', () => {
      const { events, crimes, cop } = withBodies();
      events.emit('impact', { a: cop.body.id, b: 'pv', strength: 8, pos: { x: 0, z: 0 } });
      expect(crimes.length).toBe(1);
    });

    it('ignores weak impacts (<= 3)', () => {
      const { events, crimes, cop } = withBodies();
      events.emit('impact', { a: 'pv', b: cop.body.id, strength: 3, pos: { x: 0, z: 0 } });
      expect(crimes.length).toBe(0);
    });

    it('ignores traffic hitting a cop and the player hitting traffic', () => {
      const { events, crimes, cop } = withBodies();
      events.emit('impact', { a: 'tv', b: cop.body.id, strength: 9, pos: { x: 0, z: 0 } });
      events.emit('impact', { a: 'pv', b: 'tv', strength: 9, pos: { x: 0, z: 0 } });
      expect(crimes.length).toBe(0);
    });

    it('does not spam while contact persists (2 s cooldown per cop)', () => {
      const { events, crimes, cop, sys } = withBodies();
      for (let i = 0; i < 5; i++) events.emit('impact', { a: 'pv', b: cop.body.id, strength: 9, pos: { x: 0, z: 0 } });
      expect(crimes.length).toBe(1);
      sys.update(2.1, P);
      events.emit('impact', { a: 'pv', b: cop.body.id, strength: 9, pos: { x: 0, z: 0 } });
      expect(crimes.length).toBe(2);
    });
  });
});

// ------------------------------------------------------------------ CopAgent

describe('CopAgent', () => {
  it('turns the siren on', () => {
    const v = fakeVehicle('c', 0, 0, Math.PI / 2);
    new CopAgent(v, fakeGrid(), new FakeWorld());
    expect(v.siren).toBe(true);
  });

  it('rams a nearby target: throttle 1 and steering toward it', () => {
    const v = fakeVehicle('c', 0, 0, 0); // facing north
    const agent = new CopAgent(v, fakeGrid(), new FakeWorld());
    v.setSpeed(10);
    agent.update(1 / 60, { x: 20, z: -10 }); // 22 m away, to the right
    expect(agent.isRamming).toBe(true);
    expect(v.last!.throttle).toBe(1);
    expect(v.last!.steer).toBeGreaterThan(0);
    expect(v.last!.brake).toBe(false);
    agent.update(1 / 60, { x: -20, z: -10 });
    expect(v.last!.steer).toBeLessThan(0);
  });

  it('follows lanes when more than 35 m away, steering toward the lane node, and uses a 20 m/s cruise', () => {
    const grid = fakeGrid();
    const v = fakeVehicle('c', 0, 0, Math.PI / 2);
    v.body.pos.z = 2; // on the eastbound lane
    const agent = new CopAgent(v, grid, new FakeWorld());
    v.setSpeed(2);
    agent.update(1 / 60, { x: 200, z: 0 });
    expect(agent.isRamming).toBe(false);
    expect(v.last!.throttle).toBeGreaterThan(0.9); // far below 20 m/s
    v.setSpeed(18);
    agent.update(1 / 60, { x: 200, z: 0 });
    expect(v.last!.throttle).toBeGreaterThan(0); // still below 20
    v.setSpeed(23);
    agent.update(1 / 60, { x: 200, z: 0 });
    expect(v.last!.brake).toBe(true);
  });

  it('ignores stop lines when following lanes', () => {
    const grid = fakeGrid();
    // e4 is a stop line at x = -220
    const v = fakeVehicle('c', -221, 2, Math.PI / 2);
    const agent = new CopAgent(v, grid, new FakeWorld());
    v.setSpeed(15);
    for (let i = 0; i < 10; i++) {
      agent.update(1 / 60, { x: 200, z: 0 });
      expect(agent.laneAgent.state).toBe('driving');
    }
    expect(v.last!.throttle).toBeGreaterThanOrEqual(0);
  });

  it('prefers the lane branch leading toward the target', () => {
    const grid = fakeGrid();
    // at the eastern end the eastbound lane links to the westbound one; target far east should keep heading east
    const v = fakeVehicle('c', -100, 2, Math.PI / 2);
    const agent = new CopAgent(v, grid, new FakeWorld());
    agent.update(1 / 60, { x: 250, z: 0 });
    expect(agent.laneAgent.targetNodeId!.startsWith('e')).toBe(true);
  });

  it('off duty (pursuing = false) drives like traffic with the siren off', () => {
    const v = fakeVehicle('c', 0, 2, Math.PI / 2);
    const agent = new CopAgent(v, fakeGrid(), new FakeWorld());
    agent.setPursuing(false);
    expect(v.siren).toBe(false);
    v.setSpeed(3);
    agent.update(1 / 60, { x: 5, z: 0 }); // target right on top of it: no ramming when off duty
    expect(agent.isRamming).toBe(false);
    expect(v.last!.throttle).toBeGreaterThan(0);
    agent.setPursuing(true);
    expect(v.siren).toBe(true);
  });
});
