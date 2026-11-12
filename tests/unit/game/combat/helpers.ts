import * as THREE from 'three';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian } from '@/entities/Pedestrian';
import { World2D } from '@/physics/World2D';
import type { CombatInput, CombatPlayer } from '@/game/combat/Combat';
import type { CombatSounds } from '@/game/combat/sfx';
import type { Body2D, Graph, GraphNode, IMaterialLibrary } from '@/world/types';

const materials = { get: () => new THREE.MeshBasicMaterial() } as unknown as IMaterialLibrary;

function line(): Graph {
  const nodes: GraphNode[] = [{ id: 'a', pos: { x: -200, z: 0 } }, { id: 'b', pos: { x: 200, z: 0 } }];
  const g: Graph = { nodes: {}, edges: [], adjacency: { a: [], b: [] } };
  for (const n of nodes) g.nodes[n.id] = n;
  g.adjacency.a.push(0); g.adjacency.b.push(1);
  g.edges.push({ from: 'a', to: 'b', length: 400 }, { from: 'b', to: 'a', length: 400 });
  return g;
}

/** A pedestrian standing at (x, z), added to the world. */
export function makePed(world: World2D, events: EventBus, id: string, x: number, z: number): Pedestrian {
  const g = line();
  const ped = new Pedestrian(id, { id: 'a', pos: { x, z } }, g, world, materials, events, new Rng(id));
  ped.body.pos.x = x; ped.body.pos.z = z; ped.body.vel.x = 0; ped.body.vel.z = 0;
  world.addBody(ped.body);
  return ped;
}

export function makeCar(world: World2D, id: string, x: number, z: number, heading = 0, height = 1.5): Body2D {
  const b: Body2D = {
    id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
    userData: { driver: null, spec: { height } },
  };
  world.addBody(b);
  return b;
}

/** A wall across the x axis at z = `z`, from x0 to x1. */
export function makeWall(world: World2D, id: string, z: number, x0 = -50, x1 = 50): Body2D {
  return world.addStatic({ kind: 'segment', a: { x: x0, z }, b: { x: x1, z } }, { x: 0, z: 0 }, id);
}

export function fakePlayer(x = 0, z = 0, heading = 0): CombatPlayer & { body: { pos: { x: number; z: number }; vel: { x: number; z: number }; heading: number } } {
  return { body: { pos: { x, z }, vel: { x: 0, z: 0 }, heading }, inVehicle: false, isEntering: false, actionPose: null, aimYaw: null };
}

/** A scriptable action button. */
export function fakeInput(): CombatInput & { held: boolean; edge: boolean; cycle: number; press(): void; release(): void } {
  const s = {
    held: false, edge: false, cycle: 0,
    actionHeld() { return s.held; },
    consumeAction() { const e = s.edge; s.edge = false; return e; },
    consumeCycle() { const c = s.cycle; s.cycle = 0; return c; },
    press() { s.held = true; s.edge = true; },
    release() { s.held = false; },
  };
  return s;
}

export function soundRecorder(): CombatSounds & { log: string[] } {
  const log: string[] = [];
  const mk = (n: string) => () => { log.push(n); };
  return {
    log, whoosh: mk('whoosh'), punch: (h: boolean) => { log.push(h ? 'punchHeavy' : 'punch'); }, thud: mk('thud'), glass: mk('glass'), crack: mk('crack'),
    tick: mk('tick'), click: mk('click'), reload: mk('reload'), pickup: mk('pickup'), throwAway: mk('throwAway'),
  };
}

export function recordEvents(events: EventBus, types: Array<keyof GameEvents>): Array<{ type: string; payload: unknown }> {
  const log: Array<{ type: string; payload: unknown }> = [];
  for (const t of types) events.on(t, (p) => log.push({ type: t, payload: p }));
  return log;
}

export { World2D, EventBus };
