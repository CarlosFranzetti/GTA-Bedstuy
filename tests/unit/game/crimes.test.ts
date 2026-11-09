/**
 * Petty crimes (playtest H2: ramming parked cars and driving on the pavement raised no stars).
 * The chain under test is the real one: Vehicle.onContact -> 'impact' -> CopSystem -> 'crime' -> WantedSystem.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import type { GridModel } from '@/world/types';
import { Sim, input, makeVehicle } from '../sim/harness';

/** One 40 x 40 block centred on the origin, with roads around it. */
const grid = {
  lanes: { nodes: {}, edges: [], adjacency: {} },
  sidewalks: { nodes: {}, edges: [], adjacency: {} },
  blocks: [{ id: 'b', curb: [{ x: -20, z: -20 }, { x: 20, z: -20 }, { x: 20, z: 20 }, { x: -20, z: 20 }] }],
} as unknown as GridModel;

function setup() {
  const events = new EventBus();
  const sim = new Sim();
  const wanted = new WantedSystem(events);
  const cops = new CopSystem(grid, sim.world, events, new Rng(1), new THREE.Scene(), () => { throw new Error('no cop vehicles'); }, wanted);
  const crimes: GameEvents['crime'][] = [];
  events.on('crime', (c) => crimes.push(c));
  return { events, sim, wanted, cops, crimes };
}

describe('hitting parked cars', () => {
  function ram(count: number, gapSeconds = 2) {
    const { events, sim, wanted, cops, crimes } = setup();
    const player = makeVehicle('sedan', 60, 60, 0, events, 'player-car');
    player.driver = 'player';
    sim.add(player);
    const parked = makeVehicle('suv', 60, 40, 0, events, 'parked'); // 20 m ahead (heading 0 = -z)
    sim.add(parked);
    const stars: number[] = [];
    for (let i = 0; i < count; i++) {
      // back off, then run into it at ~8 m/s
      player.body.pos = { x: 60, z: 51 }; player.body.vel = { x: 0, z: -9 }; player.body.heading = 0;
      parked.body.pos = { x: 60, z: 40 }; parked.body.vel = { x: 0, z: 0 };
      player.setInput(input({ throttle: 0.4 }));
      for (let s = 0; s < gapSeconds * 60; s++) { sim.step(); cops.update(1 / 60, player.body.pos, player.body); wanted.update(1 / 60); }
      stars.push(wanted.stars);
    }
    return { crimes, stars, wanted };
  }

  it('one hard bump is a hitVehicle (no star); the second within 15 s is a hitParked: 1 star', () => {
    const r = ram(2);
    expect(r.crimes.map((c) => c.type)).toEqual(['hitVehicle', 'hitParked']);
    expect(r.stars).toEqual([0, 1]);
  });

  it('ramming again and again never goes above 1 star on its own', () => {
    expect(ram(6).stars.at(-1)).toBe(1);
  });

  it('a slow nudge (< 3 m/s) is not a crime', () => {
    const { events, sim, wanted, cops, crimes } = setup();
    const player = makeVehicle('sedan', 0, 0, 0, events, 'player-car');
    player.driver = 'player';
    player.body.pos = { x: 60, z: 46 }; player.body.vel = { x: 0, z: -1.5 };
    sim.add(player);
    sim.add(makeVehicle('suv', 60, 40, 0, events, 'parked'));
    player.setInput(input({ throttle: 0.05 }));
    for (let s = 0; s < 180; s++) { sim.step(); cops.update(1 / 60, player.body.pos, player.body); }
    expect(crimes.length).toBe(0);
    expect(wanted.stars).toBe(0);
  });

  it('stars decay again after the ramming stops', () => {
    const r = ram(2);
    for (let t = 0; t < 20.5; t += 0.5) r.wanted.update(0.5);
    expect(r.wanted.stars).toBe(0);
  });
});

describe('driving on the pavement', () => {
  function drive(inside: boolean, withPed: boolean, seconds: number) {
    const { events, sim, wanted, cops, crimes } = setup();
    const player = makeVehicle('sedan', inside ? -15 : 40, 10, Math.PI / 2, events, 'player-car');
    player.driver = 'player';
    player.body.vel = { x: 5, z: 0 };
    sim.add(player);
    if (withPed) sim.world.addBody({ id: 'ped1', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: -8, z: 13 }, vel: { x: 0, z: 0 }, heading: 0, mass: 80 });
    const log: { t: number; stars: number }[] = [];
    for (let s = 0; s < seconds * 60; s++) {
      player.setInput(input({ throttle: 0.45 }));
      if (!inside) { /* far outside every block */ }
      sim.step(); cops.update(1 / 60, player.body.pos, player.body); wanted.update(1 / 60);
      if (s % 60 === 59) log.push({ t: (s + 1) / 60, stars: wanted.stars });
      if (Math.abs(player.body.pos.x) < 0.5 && inside) player.body.pos.x = -15; // keep the car circling the pavement
    }
    return { crimes, wanted, log };
  }

  it('more than 4 s on the pavement near pedestrians: sidewalkDriving, 1 star', () => {
    const r = drive(true, true, 6);
    expect(r.crimes.some((c) => c.type === 'sidewalkDriving')).toBe(true);
    expect(r.wanted.stars).toBe(1);
    expect(r.log[2].stars).toBe(0); // not yet at 3 s
  });

  it('pavement with nobody around is not a crime', () => {
    const r = drive(true, false, 10);
    expect(r.crimes.length).toBe(0);
    expect(r.wanted.stars).toBe(0);
  });

  it('the road (outside every curb polygon) is not a crime even with pedestrians around', () => {
    const r = drive(false, true, 10);
    expect(r.crimes.length).toBe(0);
  });

  it('pavement driving decays like any other 1-star crime', () => {
    const r = drive(true, true, 6);
    for (let t = 0; t < 21; t += 0.5) r.wanted.update(0.5);
    expect(r.wanted.stars).toBe(0);
  });
});
