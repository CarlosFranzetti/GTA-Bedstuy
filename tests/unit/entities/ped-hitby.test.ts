import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian } from '@/entities/Pedestrian';
import type { Graph, GraphNode, IMaterialLibrary, IWorld2D } from '@/world/types';

const materials = { get: () => new THREE.MeshBasicMaterial() } as unknown as IMaterialLibrary;
const world = { addStatic() { throw new Error('unused'); }, addBody() {}, removeBody() {}, step: () => [], queryCircle: () => [], raycast: () => null, bodies: () => [] } as unknown as IWorld2D;

function make(): { ped: Pedestrian; log: Array<{ type: string; payload: unknown }> } {
  const events = new EventBus();
  const log: Array<{ type: string; payload: unknown }> = [];
  for (const k of ['crime', 'pedKnockedDown'] as const) events.on(k, (p: GameEvents[typeof k]) => log.push({ type: k, payload: p }));
  const n = (id: string, x: number): GraphNode => ({ id, pos: { x, z: 0 } });
  const g: Graph = { nodes: { a: n('a', 0), b: n('b', 40) }, edges: [{ from: 'a', to: 'b', length: 40 }, { from: 'b', to: 'a', length: 40 }], adjacency: { a: [0], b: [1] } };
  return { ped: new Pedestrian('p1', g.nodes.a, g, world, materials, events, new Rng(3)), log };
}

const FROM = { x: -1, z: 0 };

describe('Pedestrian.hitBy', () => {
  it('a first light hit staggers: a startle, a step away from the blow, then running', () => {
    const { ped, log } = make();
    const x0 = ped.body.pos.x;
    expect(ped.hitBy(FROM, 'light')).toBe('staggered');
    expect(ped.currentReaction).toBe('startle');
    expect(ped.body.pos.x).toBeGreaterThan(x0);
    expect(ped.state).toBe('fleeing');
    expect(log.some((l) => l.type === 'pedKnockedDown')).toBe(false);
  });

  it('a second blow soon after knocks them down, once, with the knocked-down event and no crime of its own', () => {
    const { ped, log } = make();
    ped.hitBy(FROM, 'light');
    for (let i = 0; i < 60; i++) ped.update(1 / 60);
    expect(ped.hitBy(FROM, 'light')).toBe('knockedDown');
    expect(ped.state).toBe('down');
    expect(log.filter((l) => l.type === 'pedKnockedDown')).toHaveLength(1);
    expect(log.some((l) => l.type === 'crime')).toBe(false);
    expect(ped.hitBy(FROM, 'light')).toBe('struckDown'); // COMBAT2: already on the ground: still hit (damage, blood), no second knock-down
  });

  it('a heavy, thrown or shot hit knocks down straight away, and they are pushed away', () => {
    for (const force of ['heavy', 'thrown', 'shot'] as const) {
      const { ped } = make();
      expect(['knockedDown', 'knockedOut']).toContain(ped.hitBy(FROM, force)); // COMBAT2: a hard enough blow on a slight person knocks them out
      expect(ped.body.vel.x).toBeGreaterThan(1);
    }
  });

  it('a long gap forgets the first blow', () => {
    const { ped } = make();
    ped.hitBy(FROM, 'light');
    for (let i = 0; i < 60 * 8; i++) ped.update(1 / 60);
    expect(ped.hitBy(FROM, 'light')).toBe('staggered');
  });

  it('gets up on its own after the usual time', () => {
    const { ped } = make();
    ped.hitBy(FROM, 'heavy');
    for (let i = 0; i < 60 * 7; i++) ped.update(1 / 60);
    expect(ped.state).not.toBe('down');
  });
});

describe('looking before running', () => {
  it('a staggered person stands and turns to face the attacker for a beat, then runs away', () => {
    const { ped } = make();
    ped.body.heading = Math.PI; // facing south, away from an attacker standing at x -1 (west of the ped at x 0)
    ped.hitBy(FROM, 'light');
    const x0 = ped.body.pos.x;
    for (let i = 0; i < 12; i++) ped.update(1 / 60); // 0.2 s
    expect(ped.body.pos.x).toBeCloseTo(x0, 3);          // not moving yet
    const want = Math.atan2(FROM.x - ped.body.pos.x, -(FROM.z - ped.body.pos.z));
    expect(Math.abs(Math.atan2(Math.sin(ped.body.heading - want), Math.cos(ped.body.heading - want)))).toBeLessThan(0.5); // now looking at them
    for (let i = 0; i < 60; i++) ped.update(1 / 60);    // another second
    expect(Math.hypot(ped.body.vel.x, ped.body.vel.z)).toBeGreaterThan(1);
    expect(ped.state).toBe('fleeing');
  });
  it('a knockdown skips the look: they go straight down', () => {
    const { ped } = make();
    ped.flee(FROM, 5, 0.5);
    expect(ped.hitBy(FROM, 'heavy')).toBe('knockedDown');
    expect(ped.state).toBe('down');
  });
  it('a crowd standing together splits up in more than one direction when something goes off between them', () => {
    const events = new EventBus();
    const n = (id: string, x: number): GraphNode => ({ id, pos: { x, z: 0 } });
    const g: Graph = { nodes: { a: n('a', -40), b: n('b', 40) }, edges: [{ from: 'a', to: 'b', length: 80 }, { from: 'b', to: 'a', length: 80 }], adjacency: { a: [0], b: [1] } };
    const dirs = new Set<number>();
    for (let i = 0; i < 24; i++) {
      const p = new Pedestrian(`c${i}`, g.nodes.a, g, world, materials, events, new Rng(100 + i));
      p.body.pos.x = (i % 6) - 2.5; p.body.pos.z = 0; // everyone within a few metres of the bang at x 0
      p.flee({ x: 0, z: 0 }, 6, 0.25);
      for (let k = 0; k < 90; k++) p.update(1 / 60);
      dirs.add(Math.sign(p.body.pos.x - ((i % 6) - 2.5)));
    }
    expect(dirs.has(1)).toBe(true);
    expect(dirs.has(-1)).toBe(true);
  });
});
