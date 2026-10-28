import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian } from '@/entities/Pedestrian';
import type { Body2D, Contact, Graph, GraphNode, IMaterialLibrary, IWorld2D } from '@/world/types';

const materialCalls: Array<[string, number | undefined]> = [];
const materials = {
  get: (key: string, variant?: number) => { materialCalls.push([key, variant]); return new THREE.MeshBasicMaterial(); },
} as unknown as IMaterialLibrary;

class FakeWorld implements IWorld2D {
  nearby: Body2D[] = [];
  queries: Array<{ c: { x: number; z: number }; r: number }> = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody() {}
  removeBody() {}
  step() { return []; }
  queryCircle(c: { x: number; z: number }, r: number) { this.queries.push({ c, r }); return this.nearby; }
  raycast() { return null; }
  bodies() { return []; }
}

function graph(nodes: GraphNode[], links: Array<[string, string]>): Graph {
  const g: Graph = { nodes: {}, edges: [], adjacency: {} };
  for (const n of nodes) { g.nodes[n.id] = n; g.adjacency[n.id] = []; }
  const add = (a: string, b: string) => {
    g.adjacency[a].push(g.edges.length);
    g.edges.push({ from: a, to: b, length: Math.hypot(g.nodes[a].pos.x - g.nodes[b].pos.x, g.nodes[a].pos.z - g.nodes[b].pos.z) });
  };
  for (const [a, b] of links) { add(a, b); add(b, a); }
  return g;
}
const gn = (id: string, x: number, z: number): GraphNode => ({ id, pos: { x, z } });

/** A small sidewalk: a line n0-n1-n2 with branches n1-n3 and n2-n4, so there is always a choice but the line is short. */
function sidewalk(): Graph {
  return graph(
    [gn('n0', 0, 0), gn('n1', 5, 0), gn('n2', 10, 0), gn('n3', 5, 5), gn('n4', 10, 5)],
    [['n0', 'n1'], ['n1', 'n2'], ['n1', 'n3'], ['n2', 'n4']],
  );
}

function vehicleBody(opts: { speed: number; driver: 'player' | 'traffic' | null; kind?: Body2D['kind'] }): Body2D {
  return {
    id: 'car', kind: opts.kind ?? 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
    pos: { x: 0, z: 0 }, vel: { x: opts.speed, z: 0 }, heading: Math.PI / 2, mass: 1400,
    userData: { driver: opts.driver },
  };
}

function setup(g: Graph = sidewalk(), startId = 'n1', seed = 1, cross?: Set<string>) {
  const events = new EventBus();
  const world = new FakeWorld();
  const log: Array<{ type: string; payload: unknown }> = [];
  for (const k of ['crime', 'pedKnockedDown'] as const) events.on(k, (p: GameEvents[typeof k]) => log.push({ type: k, payload: p }));
  const ped = new Pedestrian('p1', g.nodes[startId], g, world, materials, events, new Rng(seed), cross);
  return { ped, events, world, log, g };
}

const contact = (a: Body2D, b: Body2D): Contact => ({ a, b, normal: { x: 1, z: 0 }, depth: 0.1, point: { x: 0, z: 0 }, impulse: 5 });

describe('Pedestrian', () => {
  it('is a circle r 0.3, mass 70, kind ped, at its start node, with back-reference', () => {
    const { ped } = setup();
    expect(ped.body.kind).toBe('ped');
    expect(ped.body.shape).toEqual({ kind: 'circle', r: 0.3 });
    expect(ped.body.mass).toBe(70);
    expect(ped.body.pos).toEqual({ x: 5, z: 0 });
    expect(ped.body.userData).toBe(ped);
    expect(ped.state).toBe('walking');
  });

  it('builds a human model (head, two legs, two arms) and uses cloth/skin variants', () => {
    const { ped } = setup();
    expect(ped.object3D.getObjectByName('head')).toBeTruthy();
    expect(ped.object3D.getObjectByName('legL')).toBeTruthy();
    expect(ped.object3D.getObjectByName('legR')).toBeTruthy();
    expect(ped.object3D.getObjectByName('armL')).toBeTruthy();
    const keys = materialCalls.map((c) => c[0]);
    expect(keys).toContain('cloth');
    expect(keys).toContain('skin');
  });

  it('walks at about 1.2 m/s', () => {
    const { ped } = setup();
    const start = { ...ped.body.pos };
    for (let i = 0; i < 30; i++) ped.update(1 / 60);
    const d = Math.hypot(ped.body.pos.x - start.x, ped.body.pos.z - start.z);
    expect(d).toBeGreaterThan(0.5 * 1.1);
    expect(d).toBeLessThan(0.5 * 1.3);
  });

  it('swings legs while walking', () => {
    const { ped } = setup();
    let maxSwing = 0;
    for (let i = 0; i < 60; i++) {
      ped.update(1 / 60);
      maxSwing = Math.max(maxSwing, Math.abs(ped.object3D.getObjectByName('legL')!.rotation.x));
    }
    expect(maxSwing).toBeGreaterThan(0.2);
  });

  it('never goes back to the node it came from when another exists', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { ped } = setup(sidewalk(), 'n1', seed);
      const g = sidewalk();
      const seq: string[] = ['n1'];
      let last = ped.targetNodeId!;
      seq.push(last);
      for (let i = 0; i < 6000; i++) {
        ped.update(1 / 30);
        const t = ped.targetNodeId!;
        if (t !== last) { seq.push(t); last = t; }
      }
      expect(seq.length).toBeGreaterThan(8);
      for (let i = 2; i < seq.length; i++) {
        const [a, b, c] = [seq[i - 2], seq[i - 1], seq[i]];
        const onlyWayBack = g.adjacency[b].length === 1;
        if (!onlyWayBack) expect(c).not.toBe(a);
      }
    }
  });

  it('turns around at a dead end (only way back)', () => {
    const g = graph([gn('a', 0, 0), gn('b', 3, 0)], [['a', 'b']]);
    const { ped } = setup(g, 'a');
    expect(ped.targetNodeId).toBe('b');
    for (let i = 0; i < 400; i++) ped.update(1 / 30);
    expect(['a', 'b']).toContain(ped.targetNodeId);
    expect(Number.isFinite(ped.body.pos.x)).toBe(true);
  });

  describe('being hit', () => {
    it('is knocked down for 6 s by a vehicle moving > 2 m/s and emits pedKnockedDown', () => {
      const { ped, log } = setup();
      const car = vehicleBody({ speed: 8, driver: 'traffic' });
      ped.onContact(contact(car, ped.body), car);
      expect(ped.state).toBe('down');
      expect(log.filter((l) => l.type === 'pedKnockedDown').length).toBe(1);
      expect((log[0].payload as GameEvents['pedKnockedDown']).id).toBe('p1');
      expect(log.some((l) => l.type === 'crime')).toBe(false); // AI driver: not a crime
      for (let i = 0; i < 5.9 * 60; i++) ped.update(1 / 60);
      expect(ped.state).toBe('down');
      for (let i = 0; i < 0.3 * 60; i++) ped.update(1 / 60);
      expect(ped.state).not.toBe('down');
    });

    it('emits crime hitPed once per knock-down when the player is driving', () => {
      const { ped, log } = setup();
      const car = vehicleBody({ speed: 10, driver: 'player' });
      ped.onContact(contact(car, ped.body), car);
      ped.onContact(contact(car, ped.body), car);
      ped.onContact(contact(car, ped.body), car);
      const crimes = log.filter((l) => l.type === 'crime');
      expect(crimes.length).toBe(1);
      expect((crimes[0].payload as GameEvents['crime']).type).toBe('hitPed');
      expect(log.filter((l) => l.type === 'pedKnockedDown').length).toBe(1);
      // after getting up, a second hit counts again
      for (let i = 0; i < 6.5 * 60; i++) ped.update(1 / 60);
      ped.onContact(contact(car, ped.body), car);
      expect(log.filter((l) => l.type === 'crime').length).toBe(2);
    });

    it('is not knocked down by slow vehicles or by non-vehicles', () => {
      const { ped, log } = setup();
      const slow = vehicleBody({ speed: 1.5, driver: 'player' });
      ped.onContact(contact(slow, ped.body), slow);
      const other = vehicleBody({ speed: 9, driver: null, kind: 'ped' });
      ped.onContact(contact(other, ped.body), other);
      const player = vehicleBody({ speed: 9, driver: null, kind: 'player' });
      ped.onContact(contact(player, ped.body), player);
      expect(ped.state).toBe('walking');
      expect(log.length).toBe(0);
    });

    it('is knocked down by a cop car too', () => {
      const { ped, log } = setup();
      const cop = vehicleBody({ speed: 12, driver: null, kind: 'cop' });
      ped.onContact(contact(cop, ped.body), cop);
      expect(ped.state).toBe('down');
      expect(log.filter((l) => l.type === 'crime').length).toBe(0);
    });

    it('lies flat while down and stands up afterwards', () => {
      const { ped } = setup();
      const car = vehicleBody({ speed: 8, driver: 'traffic' });
      ped.onContact(contact(car, ped.body), car);
      ped.update(1 / 60);
      expect(Math.abs(ped.object3D.rotation.x)).toBeGreaterThan(1.3);
      expect(ped.object3D.position.y).toBeGreaterThan(0.1);
      for (let i = 0; i < 6.2 * 60; i++) ped.update(1 / 60);
      expect(ped.object3D.rotation.x).toBe(0);
    });

    it('slides a little and stops while down', () => {
      const { ped } = setup();
      const car = vehicleBody({ speed: 8, driver: 'traffic' });
      const x0 = ped.body.pos.x;
      ped.onContact(contact(car, ped.body), car);
      for (let i = 0; i < 120; i++) ped.update(1 / 60);
      const moved = ped.body.pos.x - x0;
      expect(moved).toBeGreaterThan(0.2);
      expect(moved).toBeLessThan(3);
      expect(Math.hypot(ped.body.vel.x, ped.body.vel.z)).toBeLessThan(0.05);
    });
  });

  describe('crosswalks', () => {
    function crossGraph() {
      return graph([gn('a', 0, 0), gn('cw1', 3, 0), gn('cw2', 15, 0), gn('b', 18, 0)], [['a', 'cw1'], ['cw1', 'cw2'], ['cw2', 'b']]);
    }
    it('waits at a crosswalk node while a vehicle moving > 2 m/s is within 12 m, then goes', () => {
      const { ped, world } = setup(crossGraph(), 'a', 1, new Set(['cw1', 'cw2']));
      world.nearby = [vehicleBody({ speed: 9, driver: 'traffic' })];
      for (let i = 0; i < 6 * 30; i++) {
        ped.update(1 / 30);
        if (ped.state === 'waiting') break;
      }
      expect(ped.state).toBe('waiting');
      expect(world.queries.at(-1)!.r).toBe(12);
      const p = { ...ped.body.pos };
      for (let i = 0; i < 60; i++) ped.update(1 / 30);
      expect(ped.body.pos).toEqual(p);
      world.nearby = [];
      for (let i = 0; i < 30; i++) ped.update(1 / 30);
      expect(ped.state).toBe('walking');
    });

    it('does not wait for slow or stopped vehicles', () => {
      const { ped, world } = setup(crossGraph(), 'a', 1, new Set(['cw1', 'cw2']));
      world.nearby = [vehicleBody({ speed: 1, driver: 'traffic' })];
      for (let i = 0; i < 8 * 30; i++) {
        ped.update(1 / 30);
        expect(ped.state).not.toBe('waiting');
      }
    });

    it('gives up waiting after 8 s', () => {
      const { ped, world } = setup(crossGraph(), 'a', 1, new Set(['cw1', 'cw2']));
      world.nearby = [vehicleBody({ speed: 9, driver: 'traffic' })];
      let waited = 0;
      for (let i = 0; i < 30 * 30; i++) {
        ped.update(1 / 30);
        if (ped.state === 'waiting') waited += 1 / 30;
        if (waited > 0 && ped.state === 'walking') break;
      }
      expect(waited).toBeGreaterThan(7);
      expect(waited).toBeLessThan(9.5);
    });
  });

  it('flees at 4 m/s away from a threat, then calms down', () => {
    const { ped } = setup();
    ped.flee({ x: -5, z: 0 }, 2);
    expect(ped.state).toBe('fleeing');
    const threat = { x: -5, z: 0 };
    const d0 = Math.hypot(ped.body.pos.x - threat.x, ped.body.pos.z - threat.z);
    for (let i = 0; i < 30; i++) ped.update(1 / 60);
    // 0.5 s at ~4 m/s, moving along the graph and away from the threat
    expect(Math.hypot(ped.body.vel.x, ped.body.vel.z)).toBeCloseTo(4, 1);
    expect(Math.hypot(ped.body.pos.x - threat.x, ped.body.pos.z - threat.z)).toBeGreaterThan(d0 + 0.1);
    for (let i = 0; i < 2 * 60; i++) ped.update(1 / 60);
    expect(ped.state).toBe('walking');
  });

  it('dispose detaches the mesh from its parent', () => {
    const { ped } = setup();
    const scene = new THREE.Scene();
    scene.add(ped.object3D);
    ped.dispose();
    expect(scene.children.length).toBe(0);
  });
});

// ------------------------------------------------------------------ signals, groups, stoops, threats

import { TrafficLights } from '@/game/TrafficLights';
import type { PedCrossing, PedEnvironment } from '@/entities/Pedestrian';

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
/** controller whose intersection-local clock reads `local` seconds (0 = ns green begins; ew green 49..79) */
function lightsAt(local: number): TrafficLights {
  const l = new TrafficLights(signalGrid() as never);
  l.update(((local - l.localTime('x')) % 83 + 83) % 83);
  return l;
}

describe('Pedestrian with signals', () => {
  /** a - cw1 ==(crossing the street "cross")== cw2 - b along z = 0 */
  function crossGraph() {
    return graph([gn('a', 0, 0), gn('cw1', 3, 0), gn('cw2', 15, 0), gn('b', 18, 0)], [['a', 'cw1'], ['cw1', 'cw2'], ['cw2', 'b']]);
  }
  const crossing: PedCrossing = { intersectionId: 'x', crossedStreetId: 'cross' };
  const crossings = new Map([['cw1>cw2', crossing], ['cw2>cw1', crossing]]);
  function setupSignal(lights: TrafficLights, extra: Partial<PedEnvironment> = {}) {
    const env: PedEnvironment = { lights, crossings, ...extra };
    const ctx = setup(crossGraph(), 'a', 1, new Set(['cw1', 'cw2']));
    ctx.ped.setEnvironment(env);
    return { ...ctx, env };
  }

  it('waits at the curb node until WALK, then crosses', () => {
    // crossing the "cross" street needs the ns avenue "s" green: that is local 0..45 (WALK for the first ~34 s)
    const lights = lightsAt(50); // DON'T WALK; the next WALK starts in 33 s
    expect(lights.walkFor('x', 'cross')).toBe(false);
    const { ped } = setupSignal(lights);
    for (let t = 0; t < 25; t += 1 / 30) { ped.update(1 / 30); lights.update(1 / 30); }
    expect(ped.state).toBe('waiting');
    expect(ped.waitingForWalk).toBe(true);
    expect(ped.body.pos.x).toBeLessThan(3.6);
    expect(ped.body.pos.x).toBeGreaterThan(2.4);
    expect(lights.walkFor('x', 'cross')).toBe(false);
    // WALK comes up
    for (let t = 0; t < 15; t += 1 / 30) { ped.update(1 / 30); lights.update(1 / 30); }
    expect(lights.walkFor('x', 'cross')).toBe(true);
    expect(ped.state).toBe('walking');
    expect(ped.body.pos.x).toBeGreaterThan(3.5);
  });

  it('does not step off on the flashing DON\'T WALK', () => {
    const lights = lightsAt(40); // flash begins at ns green 45 - 10/1.2 -> walkLen = max(7, 45-8.3) = 36.7
    expect(lights.walkStateFor('x', 'cross')).toBe('flash');
    const { ped } = setupSignal(lights);
    for (let t = 0; t < 4; t += 1 / 30) { ped.update(1 / 30); lights.update(1 / 30); }
    expect(ped.state).toBe('waiting');
  });

  it('finishes crossing when the signal changes to DON\'T WALK mid-way', () => {
    const lights = lightsAt(30); // WALK, ~6.7 s of it left
    expect(lights.walkFor('x', 'cross')).toBe(true);
    const { ped } = setupSignal(lights);
    let crossedAt = -1;
    for (let t = 0; t < 30; t += 1 / 30) {
      ped.update(1 / 30);
      lights.update(1 / 30);
      if (crossedAt < 0 && ped.body.pos.x > 5) crossedAt = t;
    }
    expect(crossedAt).toBeGreaterThanOrEqual(0);
    expect(lights.walkFor('x', 'cross')).toBe(false); // long over by now
    expect(ped.body.pos.x).toBeGreaterThan(14);       // and it made it to the far side regardless
  });

  it('crossings at an unsignalised intersection fall back to waiting for traffic', () => {
    const lights = new TrafficLights({ intersections: [], streetById: () => undefined } as never);
    const { ped, world } = setupSignal(lights);
    const car = vehicleBody({ speed: 9, driver: 'traffic' });
    car.pos = { x: 5, z: 8 }; // on the street, not aimed at the curb
    world.nearby = [car];
    let waiting = false;
    for (let i = 0; i < 6 * 30; i++) { ped.update(1 / 30); if (ped.state === 'waiting') { waiting = true; break; } }
    expect(waiting).toBe(true);
    expect(ped.waitingForWalk).toBe(false);
  });

  it('exposes a phone-looking idle pose for some pedestrians waiting at a curb', () => {
    const poses = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const lights = lightsAt(50);
      const events = new EventBus();
      const ped = new Pedestrian('p', crossGraph().nodes.a, crossGraph(), new FakeWorld(), materials, events, new Rng(seed), new Set(['cw1', 'cw2']), { lights, crossings });
      for (let t = 0; t < 6; t += 1 / 30) ped.update(1 / 30);
      poses.add(ped.pose);
    }
    expect(poses.has('phone')).toBe(true);
    expect(poses.has('stand')).toBe(true);
  });

  it('flees from a car heading straight at it, but not from one passing by', () => {
    const { ped, world } = setupSignal(lightsAt(5));
    const toward = vehicleBody({ speed: 8, driver: 'player' });
    toward.pos = { x: ped.body.pos.x - 4, z: ped.body.pos.z };
    world.nearby = [toward];
    for (let t = 0; t < 1; t += 1 / 30) ped.update(1 / 30);
    expect(ped.state).toBe('fleeing');

    const calm = setupSignal(lightsAt(5));
    const passing = vehicleBody({ speed: 8, driver: 'player' });
    passing.pos = { x: calm.ped.body.pos.x - 4, z: calm.ped.body.pos.z + 5 }; // 5 m to the side, same direction
    calm.world.nearby = [passing];
    for (let t = 0; t < 1; t += 1 / 30) calm.ped.update(1 / 30);
    expect(calm.ped.state).not.toBe('fleeing');
  });
});

describe('Pedestrian stoops and groups', () => {
  function line() {
    return graph([gn('n0', 0, 0), gn('n1', 20, 0)], [['n0', 'n1']]);
  }

  it('sits on a stoop for 10-30 s next to its path, then gets up and walks on', () => {
    const g = line();
    const rng = new Rng(3);
    const ped = new Pedestrian('p', g.nodes.n0, g, new FakeWorld(), materials, new EventBus(), rng);
    rng.chance = () => true;
    ped.setEnvironment({ stoops: [{ pos: { x: 10, z: 2 }, outward: { x: 0, z: -1 } }] });
    let sitStart = -1;
    let sitEnd = -1;
    const dt = 1 / 20;
    for (let t = 0; t < 120; t += dt) {
      ped.update(dt);
      if (sitStart < 0 && ped.state === 'sitting') {
        sitStart = t;
        expect(ped.pose).toBe('sit');
        expect(Math.hypot(ped.body.pos.x - 10, ped.body.pos.z - 2)).toBeLessThan(0.3);
      }
      if (sitStart >= 0 && sitEnd < 0 && ped.state !== 'sitting') { sitEnd = t; break; }
    }
    expect(sitStart).toBeGreaterThan(0);
    expect(sitEnd - sitStart).toBeGreaterThanOrEqual(10);
    expect(sitEnd - sitStart).toBeLessThanOrEqual(30.2);
    // back on the sidewalk line
    for (let t = 0; t < 8; t += dt) ped.update(dt);
    expect(Math.abs(ped.body.pos.z)).toBeLessThan(0.8);
    expect(ped.state).toBe('walking');
  });

  it('without lots it idles at a sidewalk node instead', () => {
    const g = line();
    const rng = new Rng(3);
    const ped = new Pedestrian('p', g.nodes.n0, g, new FakeWorld(), materials, new EventBus(), rng);
    rng.chance = () => true;
    ped.setEnvironment({});
    let idled = false;
    for (let t = 0; t < 60 && !idled; t += 0.05) { ped.update(0.05); idled = ped.state === 'sitting'; }
    expect(idled).toBe(true);
    expect(['stand', 'phone']).toContain(ped.pose);
  });

  it('a stoop sitter flees when a car comes for it', () => {
    const g = line();
    const world = new FakeWorld();
    const rng = new Rng(3);
    const ped = new Pedestrian('p', g.nodes.n0, g, world, materials, new EventBus(), rng);
    rng.chance = () => true;
    ped.setEnvironment({});
    for (let t = 0; t < 60 && ped.state !== 'sitting'; t += 0.05) ped.update(0.05);
    expect(ped.state).toBe('sitting');
    const car = vehicleBody({ speed: 9, driver: 'player' });
    car.pos = { x: ped.body.pos.x - 5, z: ped.body.pos.z };
    world.nearby = [car];
    for (let t = 0; t < 1; t += 0.05) ped.update(0.05);
    expect(ped.state).toBe('fleeing');
  });

  it('group members stay beside their leader and wait with it', () => {
    const lights = lightsAt(50);
    const crossing: PedCrossing = { intersectionId: 'x', crossedStreetId: 'cross' };
    const crossings = new Map([['cw1>cw2', crossing], ['cw2>cw1', crossing]]);
    const g = graph([gn('a', 0, 0), gn('cw1', 3, 0), gn('cw2', 15, 0), gn('b', 18, 0)], [['a', 'cw1'], ['cw1', 'cw2'], ['cw2', 'b']]);
    const events = new EventBus();
    const world = new FakeWorld();
    const leader = new Pedestrian('L', g.nodes.a, g, world, materials, events, new Rng(1), new Set(['cw1', 'cw2']));
    const f1 = new Pedestrian('F1', g.nodes.a, g, world, materials, events, new Rng(2), new Set(['cw1', 'cw2']));
    const f2 = new Pedestrian('F2', g.nodes.a, g, world, materials, events, new Rng(3), new Set(['cw1', 'cw2']));
    for (const p of [leader, f1, f2]) p.setEnvironment({ lights, crossings });
    f1.body.pos.x = -0.85; f1.body.pos.z = 0.35; f1.follow(leader, -1);
    f2.body.pos.x = 0.85; f2.body.pos.z = 0.35; f2.follow(leader, 1);
    expect(f1.groupLeader).toBe(leader);
    let maxGap = 0;
    for (let t = 0; t < 20; t += 1 / 30) {
      for (const p of [leader, f1, f2]) p.update(1 / 30);
      lights.update(1 / 30);
      for (const f of [f1, f2]) maxGap = Math.max(maxGap, Math.hypot(f.body.pos.x - leader.body.pos.x, f.body.pos.z - leader.body.pos.z));
    }
    expect(leader.state).toBe('waiting');
    expect(maxGap).toBeLessThan(2.2);
    // WALK: the group crosses together
    const maxX = { L: 0, F1: 0, F2: 0 };
    for (let t = 0; t < 40; t += 1 / 30) {
      for (const p of [leader, f1, f2]) p.update(1 / 30);
      lights.update(1 / 30);
      maxX.L = Math.max(maxX.L, leader.body.pos.x);
      maxX.F1 = Math.max(maxX.F1, f1.body.pos.x);
      maxX.F2 = Math.max(maxX.F2, f2.body.pos.x);
      for (const f of [f1, f2]) maxGap = Math.max(maxGap, Math.hypot(f.body.pos.x - leader.body.pos.x, f.body.pos.z - leader.body.pos.z));
    }
    expect(maxX.L).toBeGreaterThan(14);
    expect(maxX.F1).toBeGreaterThan(13);
    expect(maxX.F2).toBeGreaterThan(13);
    expect(maxGap).toBeLessThan(2.5);
  });

  it('a follower breaks away when its leader is knocked down', () => {
    const g = line();
    const world = new FakeWorld();
    const leader = new Pedestrian('L', g.nodes.n0, g, world, materials, new EventBus(), new Rng(1));
    const f = new Pedestrian('F', g.nodes.n0, g, world, materials, new EventBus(), new Rng(2));
    f.follow(leader, 1);
    leader.onContact(contact(vehicleBody({ speed: 8, driver: 'traffic' }), leader.body), vehicleBody({ speed: 8, driver: 'traffic' }));
    expect(leader.state).toBe('down');
    for (let t = 0; t < 3; t += 1 / 30) { leader.update(1 / 30); f.update(1 / 30); }
    expect(f.groupLeader).toBeNull();
    expect(f.state).toBe('walking');
  });
});
