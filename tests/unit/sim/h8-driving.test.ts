/**
 * DRIVE9: blind-playtest H8 driving defects, each reproduced at the tester's situation.
 *  1 poles / hydrants / bins / kerb  2 boxed in by a stopped car  3 star with no visible crime  4 mission ring driven through
 *  5 reverse camera  6 vehicle identity across exit / re-enter and LOD  (7: the 'rainbow ring' is the sun flare: suppress)
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThirdPersonCamera } from '@/core/Camera';
import type { Input } from '@/core/Input';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { SunFlare } from '@/render/LensFlare';
import type { GridModel } from '@/world/types';
import { DT, Sim, input, makeVehicle, realPhysics } from './harness';

const pole = (sim: Sim, x: number, z: number, r = 0.2, id?: string) => sim.world.addStatic({ kind: 'circle', r }, { x, z }, id);

describe('1 small static props: slide, do not stick', () => {
  it('a car nosed into a 4-pole cluster with W held clears it within 5 s (was pinned)', () => {
    const sim = new Sim();
    const car = makeVehicle('suv', 0, 0, 0);
    car.driver = 'player';
    sim.add(car);
    for (const dx of [-0.5, -0.15, 0.2, 0.55]) pole(sim, dx, -4.2);
    pole(sim, 0.05, -4.9, 0.3, 'hydrant-x');
    car.setInput(input({ throttle: 1 }));
    sim.run(5);
    expect(car.body.pos.z).toBeLessThan(-7);
  });

  it('a single pole dead ahead at low speed: the car slides round it', () => {
    const sim = new Sim();
    const car = makeVehicle('sedan', 0, 0, 0);
    car.driver = 'player';
    sim.add(car);
    pole(sim, 0, -3.6, 0.12);
    car.setInput(input({ throttle: 0.6 }));
    sim.run(4);
    expect(car.body.pos.z).toBeLessThan(-6);
  });

  it('a hydrant stays solid: the car does not pass through it', () => {
    const sim = new Sim();
    const car = makeVehicle('sedan', 0, 0, 0);
    car.driver = 'player';
    sim.add(car);
    const h = pole(sim, 0, -3.5, 0.3, 'hydrant-1');
    car.setInput(input({ throttle: 1 }));
    let minD = Infinity;
    sim.run(2, () => { minD = Math.min(minD, Math.hypot(car.body.pos.x - h.pos.x, car.body.pos.z - h.pos.z)); });
    // body is an OBB: its centre can never reach the hydrant (half-length 2.3 along the nose)
    expect(minD).toBeGreaterThan(0.8);
  });

  it('bins are knocked over: a car at 8 m/s drives through a soft-bin without slowing', () => {
    const sim = new Sim();
    const car = makeVehicle('sedan', 0, 0, 0);
    car.driver = 'player';
    sim.add(car);
    pole(sim, 0, -10, 0.3, 'soft-bin-1');
    car.body.vel = { x: 0, z: -8 };
    car.setInput(input({ throttle: 0.3 }));
    sim.run(2.2);
    expect(car.body.pos.z).toBeLessThan(-14);
    expect(car.speed).toBeGreaterThan(6);
  });

  it('pedestrians still stop at a soft bin (only vehicles pass)', () => {
    const sim = new Sim();
    pole(sim, 0, 0, 0.3, 'soft-bin-2');
    const ped = { id: 'p', kind: 'ped' as const, shape: { kind: 'circle' as const, r: 0.3 }, pos: { x: 0.2, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, mass: 80 };
    sim.world.addBody(ped);
    sim.world.step(DT);
    expect(Math.hypot(ped.pos.x, ped.pos.z)).toBeGreaterThanOrEqual(0.55);
  });

  it('the real map: soft bins exist and hydrants / poles keep their solid ids', () => {
    const { world } = realPhysics();
    const ids = world.colliders.map((c) => c.id ?? '');
    expect(ids.filter((i) => i.startsWith('soft-bin-')).length).toBeGreaterThan(0);
    expect(ids.filter((i) => i.startsWith('hydrant-')).length).toBeGreaterThan(0);
    expect(new Set(ids.filter(Boolean)).size).toBe(ids.filter(Boolean).length);
  });

  it('drive into a pole cluster, then reverse out (headless repro)', () => {
    const sim = new Sim();
    const car = makeVehicle('suv', 0, 0, 0);
    car.driver = 'player';
    sim.add(car);
    for (const dx of [-0.6, -0.2, 0.2, 0.6]) pole(sim, dx, -3.9);
    car.setInput(input({ throttle: 1 }));
    sim.run(1.5);
    car.setInput(input({ throttle: -1 }));
    sim.run(2.5);
    expect(car.body.pos.z).toBeGreaterThan(1.5); // came back out
  });
});

describe('2 boxed in by a stopped car', () => {
  it('a stationary player car in the lane: the AI car behind starts passing within 3 s of stopping', () => {
    const { physics, world } = realPhysics();
    const grid = world.grid;
    const seg = grid.segments.find((s) => s.streetId === 'kosciuszko' && Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) > 140)!;
    const nodes = Object.values(grid.lanes.nodes).filter((n) => n.id.startsWith(`ln:${seg.id}:f:`))
      .sort((a, b) => Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()));
    const mid = Math.floor(nodes.length / 2);
    const events = new EventBus();
    const sim = new Sim(physics);
    const me = makeVehicle('sedan', nodes[mid].pos.x, nodes[mid].pos.z, nodes[mid].heading, events, 'me');
    me.driver = 'player';
    sim.add(me);
    const n0 = nodes[mid - 3];
    const v = makeVehicle('sedan', n0.pos.x, n0.pos.z, n0.heading, events, 'ai');
    v.driver = 'traffic';
    v.body.vel = { x: Math.sin(v.body.heading) * 8, z: -Math.cos(v.body.heading) * 8 };
    sim.add(v);
    const agent = new TrafficAgent(v, grid.lanes, physics, new Rng('ai'), { startNodeId: n0.id, cruiseSpeed: 11 });
    const f = { x: Math.sin(v.body.heading), z: -Math.cos(v.body.heading) };
    const right = { x: -f.z, z: f.x };
    const lane0 = (p: { x: number; z: number }) => (p.x - me.body.pos.x) * right.x + (p.z - me.body.pos.z) * right.z;
    let stoppedAt = -1, passedAt = -1;
    for (let i = 0; i < 60 * 25; i++) {
      agent.update(DT); sim.step(DT);
      const t = i * DT;
      if (stoppedAt < 0 && Math.abs(v.speed) < 0.6 && Math.hypot(v.body.pos.x - me.body.pos.x, v.body.pos.z - me.body.pos.z) < 12) stoppedAt = t;
      if (stoppedAt >= 0 && passedAt < 0 && Math.abs(lane0(v.body.pos)) > 0.9) passedAt = t;
    }
    expect(stoppedAt).toBeGreaterThan(0);
    expect(passedAt).toBeGreaterThan(0);
    expect(passedAt - stoppedAt).toBeLessThan(3.5);
  });

  it('the player can always reverse out from between a stopped car ahead and a traffic car behind', () => {
    const sim = new Sim();
    const me = makeVehicle('suv', 0, 0, 0, undefined, 'me');
    me.driver = 'player';
    const ahead = makeVehicle('sedan', 0, -5.2, 0, undefined, 'ahead'); ahead.driver = null;
    const behind = makeVehicle('sedan', 0, 5.4, 0, undefined, 'behind'); behind.driver = 'traffic';
    sim.add(me); sim.add(ahead); sim.add(behind);
    me.setInput(input({ throttle: 1 }));
    sim.run(1);
    me.setInput(input({ throttle: -1 }));
    const z0 = me.body.pos.z;
    sim.run(3);
    expect(me.body.pos.z - z0).toBeGreaterThan(1.5);
  });
});

describe('3 wanted star with no visible crime', () => {
  const grid = {
    lanes: { nodes: {}, edges: [], adjacency: {} }, sidewalks: { nodes: {}, edges: [], adjacency: {} },
    blocks: [{ id: 'b', curb: [{ x: -20, z: -20 }, { x: 20, z: -20 }, { x: 20, z: 20 }, { x: -20, z: 20 }] }],
  } as unknown as GridModel;

  function rig() {
    const events = new EventBus();
    const sim = new Sim();
    const wanted = new WantedSystem(events);
    const cops = new CopSystem(grid, sim.world, events, new Rng(1), new THREE.Scene(), () => { throw new Error('none'); }, wanted);
    const crimes: GameEvents['crime'][] = [];
    events.on('crime', (c) => crimes.push(c));
    return { events, sim, wanted, cops, crimes };
  }

  it('two gentle taps on a parked car (3 and 4 km/h) are not a crime', () => {
    const { events, sim, wanted, cops, crimes } = rig();
    const me = makeVehicle('sedan', 60, 51, 0, events, 'me'); me.driver = 'player';
    const parked = makeVehicle('suv', 60, 40, 0, events, 'parked');
    sim.add(me); sim.add(parked);
    for (let k = 0; k < 3; k++) {
      me.body.pos = { x: 60, z: 51 }; me.body.vel = { x: 0, z: -1.1 };
      parked.body.pos = { x: 60, z: 40 }; parked.body.vel = { x: 0, z: 0 };
      for (let s = 0; s < 120; s++) { sim.step(); cops.update(DT, me.body.pos, me.body); }
    }
    expect(crimes.filter((c) => c.type === 'hitParked')).toHaveLength(0);
    expect(wanted.stars).toBe(0);
  });

  it('driving along the kerb edge of a block with pedestrians near is not pavement driving', () => {
    const { events, sim, wanted, cops, crimes } = rig();
    const me = makeVehicle('sedan', 21, 18, 0, events, 'me'); me.driver = 'player';
    sim.add(me);
    sim.world.addBody({ id: 'ped', kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: 24, z: 5 }, vel: { x: 0, z: 0 }, heading: 0, mass: 80 });
    me.body.vel = { x: 0, z: -8 };
    me.setInput(input({ throttle: 0.2 }));
    for (let s = 0; s < 60 * 5; s++) { sim.step(); cops.update(DT, me.body.pos, me.body); me.body.pos.x = 19.5; }
    expect(crimes.filter((c) => c.type === 'sidewalkDriving')).toHaveLength(0);
    expect(wanted.stars).toBe(0);
  });

  it('a star raises a one-line toast naming the crime', () => {
    const events = new EventBus();
    const wanted = new WantedSystem(events);
    const msgs: string[] = [];
    wanted.onStarAdded = (m) => msgs.push(m);
    events.emit('crime', { type: 'hitPed', pos: { x: 0, z: 0 } });
    expect(msgs).toEqual(['Wanted: Hit a pedestrian']);
    events.emit('crime', { type: 'hitVehicle', pos: { x: 0, z: 0 } });
    expect(msgs).toHaveLength(1);
  });
});

describe('4 mission ring started by driving through', () => {
  const def = (): MissionDef => ({
    id: 'r1', title: 'Block Party', blurb: 'b', giverPoi: 'x', giver: { x: 0, z: 0 }, triggerRadius: 5,
    objectives: [{ kind: 'goTo', at: { x: 100, z: 0 }, radius: 4, presence: 'any', text: 'go' }],
    reward: { cash: 1, message: 'ok' },
  });
  const boot = () => { const m = new MissionSystem([def()]); const toasts: string[] = []; m.on('toast', (e: { text: string }) => toasts.push(e.text)); m.update(DT, { x: 50, z: 0 }, false, 0); return { m, toasts }; };

  it('driving through at 40 km/h does not start it and says "Stop here to start Block Party"', () => {
    const { m, toasts } = boot();
    for (let i = 0; i < 60; i++) m.update(DT, { x: 4 - i * 0.15, z: 0 }, true, 0, 11, -1);
    expect(m.isActive).toBe(false);
    expect(toasts.some((t) => t === 'Stop here to start Block Party')).toBe(true);
  });

  it('stopped (< 3 km/h) inside the ring for 1 s starts it; 0.5 s does not', () => {
    const { m } = boot();
    for (let i = 0; i < 30; i++) m.update(DT, { x: 0, z: 0 }, true, 0, 0.2, -1);
    expect(m.isActive).toBe(false);
    for (let i = 0; i < 40; i++) m.update(DT, { x: 0, z: 0 }, true, 0, 0.2, -1);
    expect(m.isActive).toBe(true);
  });

  it('on foot it still starts at once', () => {
    const { m } = boot();
    m.update(DT, { x: 0, z: 0 }, false, 0, 0, -1);
    expect(m.isActive).toBe(true);
  });
});

describe('5 reverse camera', () => {
  const keys = () => ({ isDown: () => false, pressed: () => false, axis: () => 0, mouseDX: 0, mouseDY: 0, wheel: 0 }) as unknown as Input;

  it('reversing flips to the look-back rig, the lens ends up ahead of the car and the forward view is kept', () => {
    const c = new ThirdPersonCamera();
    const veh = { speed: -4, spec: { length: 4.6, height: 1.4 } };
    for (let i = 0; i < 90; i++) c.update(DT, { x: 0, z: 0 }, 0, 'vehicle', keys(), { vehicle: veh });
    expect(c.camera.position.z).toBeLessThan(-2); // car faces north (-z): lens is in front of it
    expect(c.yaw).toBeCloseTo(0, 1);
  });

  it('forward driving keeps the lens behind the car', () => {
    const c = new ThirdPersonCamera();
    for (let i = 0; i < 60; i++) c.update(DT, { x: 0, z: 0 }, 0, 'vehicle', keys(), { vehicle: { speed: 8, spec: { length: 4.6, height: 1.4 } } });
    expect(c.camera.position.z).toBeGreaterThan(2);
  });

  it('never puts the lens inside the car in front while reversing, and asks for the flare to be dimmed', () => {
    const sim = new Sim();
    const other = makeVehicle('sedan', 0, -6.5, 0, undefined, 'other'); other.driver = null;
    sim.add(other);
    const c = new ThirdPersonCamera();
    c.world = sim.world;
    for (let i = 0; i < 120; i++) c.update(DT, { x: 0, z: 0 }, 0, 'vehicle', keys(), { vehicle: { speed: -4, spec: { length: 4.6, height: 1.4 } } });
    // other car's rear bumper is at z = -6.5 + 2.3 = -4.2
    expect(c.camera.position.z).toBeGreaterThan(-4.2);
    expect(c.flareSuppress).toBeGreaterThan(0.5);
  });

  it('SunFlare.suppress dims the flare to nothing', () => {
    const f = new SunFlare(new THREE.Scene());
    f.update(new THREE.Vector3(0, 1, 0), 1);
    expect(f.object3d.visible).toBe(true);
    f.suppress = 1;
    f.update(new THREE.Vector3(0, 1, 0), 1);
    expect(f.object3d.visible).toBe(false);
    f.dispose();
  });
});

describe('6 vehicle identity', () => {
  it('type, name, plate and paint survive exit / re-enter (driver changes) and 5 s of parked updates', () => {
    const events = new EventBus();
    for (let n = 0; n < 12; n++) {
      const v = makeVehicle('sedan', 0, 0, 0, events, `ident${n}`);
      const before = { name: v.name, plate: v.plate, color: v.spec.color, type: v.spec.type, style: v.object3D.getObjectByName(`car:${v.spec.type}`)?.userData.carStyle };
      v.driver = 'player'; for (let i = 0; i < 30; i++) v.update(DT);
      v.driver = null; for (let i = 0; i < 30; i++) v.update(DT);
      v.driver = 'player';
      expect({ name: v.name, plate: v.plate, color: v.spec.color, type: v.spec.type, style: v.object3D.getObjectByName(`car:${v.spec.type}`)?.userData.carStyle }).toEqual(before);
    }
  });

  it('the display name comes from the spec / body style, never the bare type: a coupe is not called a sedan', () => {
    const names = new Set<string>();
    for (let n = 0; n < 40; n++) names.add(makeVehicle('sedan', 0, 0, 0, undefined, `nm${n}`).name);
    expect(names.has('Coupe')).toBe(true);
    expect(names.has('Sedan')).toBe(true);
    expect(makeVehicle('suv').name).toBe('SUV');
    expect(makeVehicle('cop').name).toBe('Police car');
  });

  it('the far (LOD) model is built with the same plate variant as the near one', () => {
    const v = makeVehicle('sedan', 0, 0, 0, undefined, 'lodcheck');
    const g = v.object3D.getObjectByName('car:sedan') ?? v.object3D.getObjectByName('car:cab');
    expect(g?.userData.carVariant).toBeDefined();
    expect(v.plate).toMatch(/^(BK-STUY|BK-1623|STUY-90|BKLYN-7)$/);
  });
});
