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
