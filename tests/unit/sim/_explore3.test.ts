import { it } from 'vitest';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { Rng } from '@/core/Rng';
import { Sim, realPhysics, makeVehicle, DT } from './harness';

it('wedge repro', () => {
  const { physics, world } = realPhysics();
  const grid = world.grid;
  const pole = [...physics.bodies()].find((b) => b.id === 'signal:garvey|hart:1:1');
  console.log('pole', JSON.stringify(pole?.pos), JSON.stringify(pole?.shape));
  const sim = new Sim(physics);
  const v = makeVehicle('cop', 258.8, -196.7, -2.35, undefined, 'wedge');
  v.driver = 'cop';
  sim.add(v);
  const agent = new TrafficAgent(v, grid.lanes, physics, new Rng(1), { cruiseSpeed: 11 });
  (agent as any).targetId = 'ln:garvey:0:r:6';
  console.log('target', JSON.stringify(grid.lanes.nodes['ln:garvey:0:r:6']?.pos));
  for (let i = 0; i < 60 * 60; i++) {
    agent.update(DT); sim.step(DT);
    if (i % 600 === 0) console.log(`t=${i / 60} pos=${v.body.pos.x.toFixed(1)},${v.body.pos.z.toFixed(1)} h=${v.body.heading.toFixed(2)} sp=${v.speed.toFixed(2)} state=${agent.state} target=${agent.targetNodeId}`);
  }
});
