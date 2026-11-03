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
  const crime = () => events.emit('crime', { type: 'carjack', pos: { x: 0, z: 0 } });
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

    it('ignores traffic hitting a cop; the player bumping traffic is only a star-less hitVehicle', () => {
      const { events, crimes, cop } = withBodies();
      events.emit('impact', { a: 'tv', b: cop.body.id, strength: 9, pos: { x: 0, z: 0 } });
      expect(crimes.length).toBe(0);
      events.emit('impact', { a: 'pv', b: 'tv', strength: 9, pos: { x: 0, z: 0 } });
      expect(crimes.map((c) => c.type)).toEqual(['hitVehicle']);
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

// ------------------------------------------------------------------ PIT, patrols, signals

import { pitAim, PIT_STARS } from '@/entities/Cop';
import { TrafficLights } from '@/game/TrafficLights';

describe('PIT manoeuvre', () => {
  const fwdNorth = { x: 0, z: -1 }; // target heading north; its right is +x

  it('trails from directly behind when not yet lined up (ahead of / beside the target)', () => {
    const a = pitAim({ x: 0, z: 10 }, { x: 0, z: 0 }, fwdNorth); // 10 m behind, centred -> lined up
    expect(a.phase).toBe('strike');
    const beside = pitAim({ x: 5, z: 0 }, { x: 0, z: 0 }, fwdNorth);
    expect(beside.phase).toBe('trail');
    expect(beside.aim.z).toBeCloseTo(9, 0); // behind the target (south of it)
    const ahead = pitAim({ x: 0, z: -12 }, { x: 0, z: 0 }, fwdNorth);
    expect(ahead.phase).toBe('trail');
  });

  it('strikes the rear quarter on the side it arrives from, not the centre of the car', () => {
    const left = pitAim({ x: -2, z: 8 }, { x: 0, z: 0 }, fwdNorth);
    expect(left.phase).toBe('strike');
    expect(left.aim.x).toBeLessThan(-0.5);     // left (west) rear quarter
    expect(left.aim.z).toBeGreaterThan(1);     // behind the centre
    const right = pitAim({ x: 2, z: 8 }, { x: 0, z: 0 }, fwdNorth);
    expect(right.aim.x).toBeGreaterThan(0.5);
  });

  function copAt(x: number, z: number, heading: number) {
    const v = fakeVehicle('c', x, z, heading);
    const agent = new CopAgent(v, fakeGrid(), new FakeWorld());
    v.setSpeed(15);
    return { v, agent };
  }
  const runner = (stars: number, speed = 14) => ({ heading: 0, vel: { x: 0, z: -speed }, stars });

  it('at 3 stars a cop in range trails the runner instead of charging at its centre', () => {
    const { v, agent } = copAt(8, 0, 0); // beside the target, 8 m east, both facing north
    agent.update(1 / 60, { x: 0, z: 0 }, runner(PIT_STARS));
    expect(agent.isRamming).toBe(true);
    expect(agent.pit).toBe('trail');
    expect(v.last!.steer).toBeLessThan(-0.3); // the lining-up point is behind the runner (south-west of the cop): swing left and back
  });

  it('once lined up behind the rear quarter it strikes with full throttle', () => {
    const { v, agent } = copAt(1.5, 9, 0); // 9 m behind, slightly east, facing north
    agent.update(1 / 60, { x: 0, z: 0 }, runner(PIT_STARS));
    expect(agent.pit).toBe('strike');
    expect(v.last!.throttle).toBe(1);
    // aims at the quarter west of the cop's line: it steers left (toward -x) a touch rather than straight
    expect(Math.abs(v.last!.steer)).toBeGreaterThan(0);
  });

  it('below 3 stars, or against a stationary target, it just charges', () => {
    const a = copAt(0, 20, 0);
    a.agent.update(1 / 60, { x: 0, z: 0 }, runner(2));
    expect(a.agent.pit).toBeNull();
    const b = copAt(0, 20, 0);
    b.agent.update(1 / 60, { x: 0, z: 0 }, { heading: 0, vel: { x: 0, z: 0 }, stars: 3 });
    expect(b.agent.pit).toBeNull();
  });
});

describe('CopSystem patrols and signals', () => {
  it('patrols with off-duty cars (siren off) while nobody is wanted, then dispatches them', () => {
    const events = new EventBus();
    const world = new FakeWorld();
    const wanted = new WantedSystem(events);
    const made: FakeVehicle[] = [];
    const sys = new CopSystem(fakeGrid(), world, events, new Rng(3), new THREE.Scene(), (type, pos, heading) => {
      const v = fakeVehicle(`cop${made.length}`, pos.x, pos.z, heading, type);
      made.push(v);
      return v;
    }, wanted, { patrolCount: 2 });
    for (let i = 0; i < 10; i++) sys.update(1, P);
    expect(sys.cops.length).toBe(2);
    expect(sys.cops.every((c) => !c.siren)).toBe(true);
    expect(made.every((m) => m.last !== null)).toBe(true); // driving
    events.emit('crime', { type: 'carjack', pos: P });
    sys.update(0.1, P);
    expect(sys.cops.filter((c) => c.siren).length).toBe(1);
    expect(sys.cops.length).toBe(2); // one of the patrol cars was dispatched, no extra spawned
  });

  it('does not patrol by default', () => {
    const { sys } = setup();
    for (let i = 0; i < 10; i++) sys.update(1, P);
    expect(sys.cops.length).toBe(0);
  });

  function redLightGrid() {
    const g = fakeGrid();
    const e = g.lanes.nodes;
    for (const id of Object.keys(e)) if (e[id].stopLine) e[id].intersectionId = 'x';
    for (const id of Object.keys(e)) e[id].streetId = 's';
    return g;
  }
  const streets = {
    s: { id: 's', class: 'avenue', roadWidth: 14, sidewalkWidth: 4, oneWay: 0 },
    cross: { id: 'cross', class: 'street', roadWidth: 10, sidewalkWidth: 3.5, oneWay: 0 },
  } as const;
  const lightsGridDef = {
    intersections: [{ id: 'x', center: { x: 0, z: 0 }, nsStreetId: 's', ewStreetId: 'cross', halfX: 7, halfZ: 5 }],
    streetById: (id: string) => streets[id as keyof typeof streets],
  };

  it('an off-duty cop waits at a red light, a pursuing cop runs it', () => {
    const lights = new TrafficLights(lightsGridDef as never);
    lights.update(((55 - lights.localTime('x')) % 83 + 83) % 83); // street "s" red
    expect(lights.phaseFor('x', 's')).toBe('red');
    const run = (pursuing: boolean) => {
      const grid = redLightGrid();
      // e4 (x = -220) is the first stop line
      const v = fakeVehicle('c', -250, 2, Math.PI / 2);
      const agent = new CopAgent(v, grid, new FakeWorld(), lights);
      agent.setPursuing(pursuing);
      v.setSpeed(8);
      let x = v.body.pos.x;
      for (let t = 0; t < 12; t += 1 / 30) {
        agent.update(1 / 30, { x: 280, z: 0 });
        const i = v.last!;
        let sp = v.speed;
        if (i.brake) sp = Math.max(0, sp - 10 * (1 / 30)); else sp += i.throttle * 6 * (1 / 30);
        v.setSpeed(sp);
        x += sp * (1 / 30);
        v.body.pos.x = x;
        v.body.vel.x = sp;
      }
      return x;
    };
    expect(run(false)).toBeLessThan(-218);   // stopped at the line (x = -220)
    expect(run(true)).toBeGreaterThan(-150); // blew through
  });
});
