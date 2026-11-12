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
    expect(ped.hitBy(FROM, 'light')).toBe('ignored'); // already on the ground
  });

  it('a heavy, thrown or shot hit knocks down straight away, and they are pushed away', () => {
    for (const force of ['heavy', 'thrown', 'shot'] as const) {
      const { ped } = make();
      expect(ped.hitBy(FROM, force)).toBe('knockedDown');
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
