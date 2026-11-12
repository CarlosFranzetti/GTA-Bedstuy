/**
 * Long vehicles (bus 12.5 m, refuse truck 9.2 m, box truck, ambulance) are in the moving traffic mix. A 90 degree left turn
 * on the real map (Kosciuszko eastbound onto Throop northbound, a 14 m roadway) must end in the lane they aim for, not
 * 4 m wide of it beside the kerb: from there a kerb-parked car stands in front of them and they wedge (traffic-5min seeds
 * 7 and 21, refuse truck and bus). Alone on an empty street, no parked cars: any wide swing is the turn, not an obstacle.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { TrafficLights } from '@/game/TrafficLights';
import type { VehicleType } from '@/world/types';
import { Sim, DT, makeVehicle, realPhysics } from './harness';

const START = 'ln:kosciuszko:0:f:12';
const LANE_X = 2; // northbound lane centre on Throop (lane node ln:throop:1:r:*)

function leftTurn(type: VehicleType): { maxErr: number; entered: boolean } {
  const { physics, world } = realPhysics();
  const start = world.grid.lanes.nodes[START];
  const events = new EventBus();
  const sim = new Sim(physics);
  const v = makeVehicle(type, start.pos.x, start.pos.z, start.heading, events, 'T');
  v.driver = 'traffic';
  sim.add(v);
  const lights = new TrafficLights(world.grid);
  const agent = new TrafficAgent(v, world.grid.lanes, physics, new Rng(5), { startNodeId: START, cruiseSpeed: 8, lights });
  agent.goal = { x: LANE_X, z: -200 };
  let maxErr = 0;
  let entered = false;
  for (let i = 0; i < 100 / DT; i++) {
    lights.update(DT);
    agent.update(DT);
    sim.step(DT);
    const p = v.body.pos;
    if (p.z < -28 && p.z > -48 && Math.abs(p.x) < 12) entered = true;
    if (p.z < -28 && p.z > -48 && Math.abs(p.x) < 12) maxErr = Math.max(maxErr, Math.abs(p.x - LANE_X));
  }
  return { maxErr, entered };
}

describe('left turn onto Throop from Kosciuszko, alone on the street', () => {
  for (const type of ['sedan', 'cab', 'bus', 'garbage', 'ambulance', 'cargovan'] as VehicleType[]) {
    it(`${type}: either turns and settles in the lane (within 1.2 m of the lane line), or, if its turning circle is too wide for the box, keeps straight on`, () => {
      const r = leftTurn(type);
      if (r.entered) expect(r.maxErr).toBeLessThan(1.2);
      if (['sedan', 'cab', 'cargovan'].includes(type)) expect(r.entered).toBe(true); // ordinary cars still take the turn
    }, 120_000);
  }
});
