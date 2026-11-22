/**
 * COMBAT2: a street fight, headless, on the grid map's sidewalk graph and on the real-street map's. Real Combat, real Pedestrians
 * (with their own movement on the sidewalk graph), the real WantedSystem. One bystander is punched until he is out (a pool of blood
 * under him), a second is hit and fights back (the player loses health and the police are told it was self-defence), a third stands
 * and films it; then a gunshot scatters the street and brings a star.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian } from '@/entities/Pedestrian';
import { Combat } from '@/game/combat/Combat';
import { Blood } from '@/game/combat/blood';
import { PlayerVitals } from '@/game/combat/vitals';
import { WantedSystem } from '@/game/WantedSystem';
import { World2D } from '@/physics/World2D';
import type { Graph, GraphNode, IMaterialLibrary } from '@/world/types';
import { fakeInput, fakePlayer, recordEvents } from '../game/combat/helpers';
import { DT, proxyMaterials, realPhysics } from './harness';
import { net, derived, sidewalks } from './realtraffic-run';

const materials = proxyMaterials() as IMaterialLibrary;
void THREE;

function nodeNear(g: Graph, x: number, z: number): GraphNode {
  let best: GraphNode | null = null, bd = Infinity;
  for (const n of Object.values(g.nodes)) { const d = Math.hypot(n.pos.x - x, n.pos.z - z); if (d < bd && (g.adjacency[n.id]?.length ?? 0) > 0) { bd = d; best = n; } }
  return best!;
}

function fight(graph: Graph, physics: World2D, start: { x: number; z: number }) {
  const events = new EventBus();
  const wanted = new WantedSystem(events);
  const blood = new Blood('medium', () => true);
  const vitals = new PlayerVitals();
  const player = fakePlayer(start.x, start.z, 0);
  const input = fakeInput();
  const log = recordEvents(events, ['crime', 'pedHit', 'gunshot', 'pedKnockedDown']);
  const peds: Pedestrian[] = [];
  const make = (id: string, dx: number, dz: number): Pedestrian => {
    const p = new Pedestrian(id, nodeNear(graph, start.x + dx, start.z + dz), graph, physics, materials, events, new Rng(id));
    p.body.pos.x = start.x + dx; p.body.pos.z = start.z + dz; p.body.vel.x = 0; p.body.vel.z = 0;
    peds.push(p);
    return p;
  };
  let attacked = 0;
  const combat = new Combat({ events, world: physics, peds: () => peds, player, blood, vitals, noteAttacked: () => { attacked++; } });
  const step = (n: number, pin: Array<[Pedestrian, number, number]> = []): void => {
    for (let i = 0; i < n; i++) {
      for (const [p, dx, dz] of pin) if (p.state !== 'down' && !p.special) { p.body.pos.x = start.x + dx; p.body.pos.z = start.z + dz; p.body.vel.x = 0; p.body.vel.z = 0; }
      combat.update(DT, { viewYaw: 0, blocked: false, input });
      for (const p of peds) p.update(DT);
      wanted.update(DT);
      input.edge = false;
    }
  };
  return { events, wanted, blood, vitals, player, input, log, peds, make, combat, step, attacked: () => attacked };
}

function scenario(graph: Graph, physics: World2D, start: { x: number; z: number }): void {
  const f = fight(graph, physics, start);
  const a = f.make('victim-a', 0, -0.95);
  const b = f.make('brawler-b', 7, -1);
  const c = f.make('filmer-c', -6, 2);
  const d = f.make('runner-d', 5, 6);
  (b.vitals as unknown as { temper: string }).temper = 'fight';
  (c.vitals as unknown as { temper: string }).temper = 'film';
  (d.vitals as unknown as { temper: string }).temper = 'flee';
  (a.vitals as unknown as { temper: string }).temper = 'flee';

  // 1. punch the first bystander until he is out
  let presses = 0, sawFilm = false;
  while (!a.isKnockedOut && presses < 40) {
    f.input.press(); f.step(1, [[a, 0, -0.95]]); f.input.release();
    f.step(24, [[a, 0, -0.95]]);
    if (c.special?.mode === 'film') sawFilm = true;
    if (a.state === 'down' && !a.isKnockedOut) a.state = 'walking';
    presses++;
  }
  expect(a.isKnockedOut).toBe(true);
  expect(presses).toBeGreaterThanOrEqual(3);
  expect(presses).toBeLessThanOrEqual(14);
  expect(f.blood.poolCount).toBe(1);
  expect(sawFilm).toBe(true);
  const punches = f.log.filter((l) => l.type === 'pedHit').length;
  expect(punches).toBeGreaterThanOrEqual(3);
  const crimes = f.log.filter((l) => l.type === 'crime').map((l) => (l.payload as { type: string; pos: { x: number; z: number } }));
  expect(crimes.some((x) => x.type === 'assault' && Math.hypot(x.pos.x - start.x, x.pos.z - start.z) < 3)).toBe(true);

  // 2. the second bystander is hit and fights back: he closes in, winds up, and lands punches on the player
  b.body.pos.x = start.x + 0.4; b.body.pos.z = start.z - 1.0; // within reach
  f.input.press(); f.step(1); f.input.release();
  f.step(60 * 12);
  expect(b.vitals.hits).toBeGreaterThan(0);
  expect(f.vitals.health).toBeLessThan(100);
  expect(f.attacked()).toBeGreaterThan(0);

  // 3. a shot scatters the street and brings a star
  for (const [p, dx, dz] of [[c, -6, 2], [d, 5, 6]] as const) { p.special = null; p.state = 'walking'; p.body.pos.x = start.x + dx; p.body.pos.z = start.z + dz; }
  f.combat.hands.add('pistol'); f.combat.cycle(1);
  f.vitals.reset();
  f.input.press(); f.step(3); f.input.release();
  expect(f.wanted.stars).toBeGreaterThanOrEqual(1);
  expect(f.log.some((l) => l.type === 'crime' && (l.payload as { type: string }).type === 'gunshot')).toBe(true);
  expect(d.state).toBe('fleeing');
  expect(c.state).toBe('fleeing');
}

describe('combat scenario', () => {
  it('on the grid map', () => {
    const { physics, world } = realPhysics();
    scenario(world.grid.sidewalks, physics, { x: 9, z: 20 });
  }, 120000);
  it('on the real-street map', () => {
    void net; void derived;
    const s = nodeNear(sidewalks.graph, (net.bounds.minX + net.bounds.maxX) / 2, (net.bounds.minZ + net.bounds.maxZ) / 2);
    scenario(sidewalks.graph, new World2D(12), { x: s.pos.x, z: s.pos.z });
  }, 120000);
});
