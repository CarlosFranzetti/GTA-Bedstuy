import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian } from '@/entities/Pedestrian';
import { TrafficAgent } from '@/entities/TrafficAgent';
import type { Body2D, Graph, GraphNode, IMaterialLibrary, IVehicle, IWorld2D, LaneGraph, LaneNode, VehicleInput } from '@/world/types';

const materials = { get: () => new THREE.MeshBasicMaterial() } as unknown as IMaterialLibrary;

class World implements IWorld2D {
  bodiesNear: Body2D[] = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody() {}
  removeBody() {}
  step() { return []; }
  queryCircle() { return this.bodiesNear; }
  raycast() { return null; }
  bodies() { return []; }
}

const car = (x: number, z: number, speed = 0): Body2D => ({
  id: 'stopped', kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
  pos: { x, z }, vel: { x: 0, z: speed }, heading: 0, mass: 1400, userData: { driver: 'traffic' },
});

describe('F12: pedestrians walk around a stopped car instead of leaning on it', () => {
  function line(): Graph {
    const g: Graph = { nodes: {}, edges: [], adjacency: {} };
    const ns: GraphNode[] = [{ id: 'a', pos: { x: 0, z: 0 } }, { id: 'b', pos: { x: 20, z: 0 } }];
    for (const n of ns) { g.nodes[n.id] = n; g.adjacency[n.id] = []; }
    g.adjacency.a.push(0); g.edges.push({ from: 'a', to: 'b', length: 20 });
    g.adjacency.b.push(1); g.edges.push({ from: 'b', to: 'a', length: 20 });
    return g;
  }

  it('a stopped car across the path deflects the walker sideways along the car, and a moving car does not', () => {
    for (const moving of [false, true]) {
      const g = line();
      const world = new World();
      const ped = new Pedestrian('p', g.nodes.a, g, world, materials, new EventBus(), new Rng(3));
      // car heading north (+z is south here: heading 0 faces -z), long axis along z, sitting on the path at x = 6
      world.bodiesNear = [car(6, 0, moving ? 8 : 0)];
      let maxZ = 0;
      for (let i = 0; i < 60 * 12; i++) {
        ped.update(1 / 60);
        maxZ = Math.max(maxZ, Math.abs(ped.body.pos.z));
      }
      if (moving) expect(maxZ).toBeLessThan(0.05);
      else expect(maxZ).toBeGreaterThan(1.5); // went round the 4.4 m long car, not straight through it
    }
  });
});

describe('F12: a car does not pull away with a pedestrian pressed against its body', () => {
  function fakeVehicle(): IVehicle & { last: VehicleInput | null } {
    const body: Body2D = {
      id: 'v', kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, heading: Math.PI / 2, mass: 1400,
    };
    const v = {
      id: 'v', object3D: new THREE.Group(), body,
      spec: { type: 'sedan', length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
      speed: 0, damage: 0, driver: 'traffic' as IVehicle['driver'], siren: false, last: null as VehicleInput | null,
      setInput(i: VehicleInput) { v.last = { ...i }; }, doorPos() { return body.pos; }, update() {}, dispose() {},
    };
    body.userData = v;
    return v as unknown as IVehicle & { last: VehicleInput | null };
  }
  function straight(): LaneGraph {
    const nodes: Record<string, LaneNode> = {};
    const edges: LaneGraph['edges'] = [];
    const adjacency: Record<string, number[]> = {};
    for (let i = 0; i <= 5; i++) {
      nodes[`n${i}`] = { id: `n${i}`, pos: { x: i * 20, z: 0 }, streetId: 's', heading: Math.PI / 2, stopLine: false };
      adjacency[`n${i}`] = [];
    }
    for (let i = 1; i <= 5; i++) { adjacency[`n${i - 1}`].push(edges.length); edges.push({ from: `n${i - 1}`, to: `n${i}`, length: 20 }); }
    return { nodes, edges, adjacency } as unknown as LaneGraph;
  }

  it('holds (brakes, no throttle) while a pedestrian stands against its flank, drives on once the pedestrian is gone', () => {
    const world = new World();
    const v = fakeVehicle();
    const agent = new TrafficAgent(v, straight(), world, new Rng(1), { startNodeId: 'n0', cruiseSpeed: 9 });
    // beside the car, 1.2 m off its centre line, level with the cabin: outside the forward cone (along < 0.5 m)
    const ped: Body2D = { id: 'p', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: 0.2, z: 1.2 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 };
    world.bodiesNear = [ped];
    for (let i = 0; i < 30; i++) agent.update(1 / 30);
    expect(v.last!.throttle).toBe(0);
    expect(v.last!.brake).toBe(true);
    world.bodiesNear = [];
    for (let i = 0; i < 30; i++) agent.update(1 / 30);
    expect(v.last!.throttle).toBeGreaterThan(0);
  });
});
