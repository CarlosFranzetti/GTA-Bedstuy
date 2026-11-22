/**
 * POLICE2: the whole story, headless, with the real WantedSystem, CopSystem, Player, Officer and PoliceSystem on a map.
 * Punch twice (a warning, no star, no chase); keep going (star 1); stand still (an officer walks up, holds, BUSTED, released
 * at the precinct, stars clear). A second run: the player runs, breaks free of the first grab, gets away and the stars cool.
 * Peds are fake witnesses placed near the player; the punches are the `pedHit` events Combat sends (Combat itself is not run).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/Events';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { Officer } from '@/entities/Officer';
import { Player } from '@/entities/Player';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { createPointerRouter } from '@/game/missions/PointerRoute';
import { PoliceSystem } from '@/game/police/PoliceSystem';
import { GRID_PRECINCT, type PrecinctSite } from '@/game/police/precincts';
import { World2D } from '@/physics/World2D';
import type { BustHost } from '@/game/police/bust';
import type { GridModel, IVehicle, VehicleType } from '@/world/types';
import { LANDMARKS } from '@/world/landmarks/landmarks';
import { realPrecinct } from '@/game/police/precincts';
import { createRealPointerRouter } from '@/world/roadnet/pointerReal';
import { makeRealTraffic } from '@/world/roadnet/trafficReal';
import { DT, Sim, proxyMaterials, realPhysics, stubMaterials } from './harness';
import { controls, derived, net, playerSpot, sidewalks } from './realtraffic-run';

interface Out { warnedNoStar: boolean; starAt: number; arrestAt: number; bustedAt: number; releasedAt: Vec2 | null; starsAfter: number; maxStars: number; officers: number; breakFreeStars: number; zeroAt: number; busted: boolean; cashAfter: number; sawGentleCar: boolean; trail: string[] }

function scenario(opts: { grid: GridModel; physics: World2D; lights?: { update(dt: number): void }; router?: ReturnType<typeof createPointerRouter>; seed: number; start: Vec2; site: PrecinctSite; mode: 'stand' | 'run'; teleportAway?: Vec2 }): Out {
  const { grid, physics } = opts;
  const events = new EventBus();
  const sim = new Sim(physics);
  const wanted = new WantedSystem(events);
  let seq = 0;
  const makeCop = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle => {
    const v = new Vehicle(`cop${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
    sim.add(v);
    return v;
  };
  const cops = new CopSystem(grid, physics, events, new Rng(opts.seed), new THREE.Scene(), makeCop, wanted, {});
  const player = new Player('player', opts.start, stubMaterials, events);
  sim.add(player);
  const peds = [{ body: { id: 'w1', kind: 'ped' as const, shape: { kind: 'circle' as const, r: 0.3 }, pos: { x: opts.start.x, z: opts.start.z + 5 }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 }, state: 'walking' }];
  let flee = false;
  const police = new PoliceSystem({
    events, world: physics, wanted, cops, player, scene: new THREE.Scene(), rng: new Rng(opts.seed + 1), peds: () => peds,
    makeOfficer: (id, pos, h) => new Officer(id, pos, h, proxyMaterials(), new Rng(7)),
    isNight: () => false, blocked: () => false, tryingToFlee: () => flee, ejectPlayer: () => player.exit(), precinct: () => opts.site, router: opts.router ?? createPointerRouter(grid),
  });
  const o: Out = { warnedNoStar: false, starAt: -1, arrestAt: -1, bustedAt: -1, releasedAt: null, starsAfter: -1, maxStars: 0, officers: 0, breakFreeStars: 0, zeroAt: -1, busted: false, cashAfter: -1, sawGentleCar: false, trail: [] };
  let cash = 200;
  const host: BustHost = {
    cash: () => cash, addCash: (n) => { cash = Math.max(0, cash + n); }, dropWeapons: () => {}, advanceClock: () => {}, clearWanted: () => {}, addBust: () => {},
    teleport: (s) => { player.body.pos.x = s.spot.x; player.body.pos.z = s.spot.z; player.body.vel.x = 0; player.body.vel.z = 0; o.releasedAt = { x: s.spot.x, z: s.spot.z }; },
  };
  const punch = (): void => events.emit('pedHit', { id: 'w1', pos: { x: player.body.pos.x, z: player.body.pos.z + 1 }, by: 'fist', down: false });
  let t = 0;
  const total = Math.round(240 / DT);
  let punches = 0;
  for (let step = 0; step < total; step++) {
    t = step * DT;
    if (opts.mode === 'stand' || t < 40) {
      // punches at 1 s, 3 s (a warning, no star), then 5 s (the warning ignored: star 1)
      if (punches < 3 && t >= 1 + punches * 2) {
        punch(); punches++;
        if (punches === 2) { police.update(0); o.warnedNoStar = wanted.stars === 0 && police.state === 'watching'; }
        if (punches === 3) o.starAt = t;
      }
    }
    if (opts.mode === 'run' && o.arrestAt > 0 && t > o.arrestAt + 0.4) { flee = true; player.body.pos.x += 5.8 * DT; player.body.vel.x = 5.8; player.body.vel.z = 0; }
    if (opts.mode === 'run' && opts.teleportAway && o.breakFreeStars > 0 && t > o.starAt + 30 && player.body.pos.x < opts.teleportAway.x - 50) { player.body.pos.x = opts.teleportAway.x; player.body.pos.z = opts.teleportAway.z; player.body.vel.x = 0; player.body.vel.z = 0; flee = false; }
    opts.lights?.update(DT);
    cops.update(DT, player.body.pos, player.body);
    police.update(DT);
    wanted.update(DT);
    sim.step(DT);
    if (step % 300 === 0) { const cs = cops.patrolCars(); o.trail.push(`${t.toFixed(0)}s stars=${wanted.stars} state=${police.state} cars=${cs.map((c) => `@${c.vehicle.body.pos.x.toFixed(0)},${c.vehicle.body.pos.z.toFixed(0)}/${Math.round(Math.hypot(c.vehicle.body.pos.x - player.body.pos.x, c.vehicle.body.pos.z - player.body.pos.z))}m/${c.pursuing ? 'P' : 'o'}/${c.vehicle.speed.toFixed(0)}`).join(',')} officers=${police.officers.map((f) => `@${f.body.pos.x.toFixed(1)},${f.body.pos.z.toFixed(1)}wp${f.waypoint ? f.waypoint.x.toFixed(0) + ',' + f.waypoint.z.toFixed(0) : '-'}/${Math.round(Math.hypot(f.body.pos.x - player.body.pos.x, f.body.pos.z - player.body.pos.z))}m/${f.mode}`).join(',')} unseen=${police.unseenFor.toFixed(0)}`); }
    o.maxStars = Math.max(o.maxStars, wanted.stars);
    o.officers = Math.max(o.officers, police.officers.length);
    if (police.breakFreeUsed && o.breakFreeStars === 0) o.breakFreeStars = wanted.stars;
    if (police.isBeingArrested() && o.arrestAt < 0) o.arrestAt = t;
    if (cops.cops.some((c) => c.siren) && wanted.stars === 1 && police.officers.length === 0) o.sawGentleCar = true;
    if (police.state === 'busted' && !o.busted) { o.busted = true; o.bustedAt = t; police.completeBust(host); o.starsAfter = wanted.stars; o.cashAfter = cash; if (opts.mode === 'stand') break; }
    if (opts.mode === 'run' && o.starAt > 0 && wanted.stars === 0 && o.zeroAt < 0) { o.zeroAt = t; break; }
  }
  if (process.env.POLICE_TRACE) console.log('TRAIL\n' + o.trail.join('\n'));
  return o;
}

describe('police scenario on the grid map', () => {
  it('punch twice (a warning, no star), keep going (star 1), stand still: arrested, released at the precinct door, stars clear', () => {
    const { physics, world } = realPhysics();
    const r = scenario({ grid: world.grid, physics, seed: 4, start: { x: 9, z: 20 }, site: GRID_PRECINCT, mode: 'stand' });
    expect(r.warnedNoStar).toBe(true);
    expect(r.maxStars).toBe(1);
    expect(r.busted).toBe(true);
    expect(r.arrestAt).toBeGreaterThan(r.starAt + 5);      // the patrol car has to arrive first
    expect(r.bustedAt - r.arrestAt).toBeGreaterThanOrEqual(1.4);
    expect(r.bustedAt - r.arrestAt).toBeLessThanOrEqual(2.0);
    expect(r.bustedAt).toBeLessThan(120);
    expect(r.releasedAt).toEqual(GRID_PRECINCT.spot);
    expect(r.starsAfter).toBe(0);
    expect(r.cashAfter).toBe(150);
  }, 900000);

  it('the player runs when grabbed: breaks free once (a star more), gets away and the stars cool to zero', () => {
    const { physics, world } = realPhysics();
    const r = scenario({ grid: world.grid, physics, seed: 4, start: { x: 9, z: 20 }, site: GRID_PRECINCT, mode: 'run', teleportAway: { x: 700, z: 150 } });
    expect(r.starAt).toBeGreaterThan(0);
    expect(r.arrestAt).toBeGreaterThan(0);          // an officer did get hold of the player first
    expect(r.breakFreeStars).toBe(2);               // running broke the hold once and cost a star (resisting)
    expect(r.busted).toBe(false);
    expect(r.zeroAt).toBeGreaterThan(r.starAt);
  }, 900000);
});

describe('police scenario on the real-street map', () => {
  const site = realPrecinct(LANDMARKS)!;
  const run = (mode: 'stand' | 'run') => {
    const rt = makeRealTraffic(net, derived, sidewalks, controls);
    const far = rt.grid.nearestLaneNode({ x: net.bounds.minX + 200, z: net.bounds.maxZ - 200 });
    return scenario({ grid: rt.grid, physics: new World2D(12), lights: rt.lights, router: createRealPointerRouter(derived.buildingRings, sidewalks.graph), seed: 6, start: playerSpot(), site, mode, teleportAway: { x: far.pos.x, z: far.pos.z } });
  };
  it('punch twice, then once more: one star, officers walk up, the player is held and BUSTED, released at the station house door', () => {
    const r = run('stand');
    expect(r.warnedNoStar).toBe(true);
    expect(r.maxStars).toBe(1);
    expect(r.busted).toBe(true);
    expect(r.bustedAt - r.arrestAt).toBeGreaterThanOrEqual(1.4);
    expect(r.bustedAt - r.arrestAt).toBeLessThanOrEqual(2.0);
    expect(r.releasedAt).toEqual(site.spot);
    expect(r.starsAfter).toBe(0);
  }, 900000);
  it('the player runs when grabbed, breaks free once and loses them: no bust, stars cool to zero', () => {
    const r = run('run');
    expect(r.arrestAt).toBeGreaterThan(0);
    expect(r.breakFreeStars).toBe(2);
    expect(r.busted).toBe(false);
    expect(r.zeroAt).toBeGreaterThan(r.starAt);
  }, 900000);
});
