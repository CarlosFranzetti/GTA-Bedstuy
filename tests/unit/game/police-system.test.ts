import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Officer } from '@/entities/Officer';
import { World2D } from '@/physics/World2D';
import type { CopSystem } from '@/game/CopSystem';
import { WantedSystem } from '@/game/WantedSystem';
import { applyBust, fineFor, hoursInCustody, type BustHost } from '@/game/police/bust';
import { ARREST_HOLD, PoliceSystem, type PolicePlayer } from '@/game/police/PoliceSystem';
import { GRID_PRECINCT, precinctFor, realPrecinct } from '@/game/police/precincts';
import { LANDMARKS } from '@/world/landmarks/landmarks';
import { migrateSave, captureSave, applySave, type SaveParts } from '@/ui/GameSave';
import type { Body2D, IVehicle } from '@/world/types';
import { proxyMaterials } from '../sim/harness';

const mkBody = (id: string, x: number, z: number, kind: Body2D['kind'] = 'ped'): Body2D =>
  ({ id, kind, shape: { kind: 'circle', r: 0.3 }, pos: { x, z }, vel: { x: 0, z: 0 }, heading: 0, mass: 70 });

interface Rig { events: EventBus; wanted: WantedSystem; police: PoliceSystem; player: PolicePlayer & { body: Body2D }; peds: { body: Body2D; state: string }[]; world: World2D; barks: string[]; lines: string[]; flee: { on: boolean }; blocked: { on: boolean }; night: { on: boolean }; ejected: { n: number }; busted: unknown[]; cars: { vehicle: IVehicle; pursuing: boolean }[] }

function rig(): Rig {
  const events = new EventBus();
  const wanted = new WantedSystem(events);
  const world = new World2D(12);
  const player = { body: mkBody('player', 0, 0, 'player'), vehicle: null as IVehicle | null, inVehicle: false, isDown: false, actionPose: null as { kind: string; k: number } | null };
  world.addBody(player.body);
  const peds: { body: Body2D; state: string }[] = [];
  const cars: { vehicle: IVehicle; pursuing: boolean }[] = [];
  const cops = { patrolCars: () => cars, chirp: vi.fn(), gentleAtOneStar: false } as unknown as CopSystem;
  const barks: string[] = [], lines: string[] = [], busted: unknown[] = [];
  events.on('pedBark', (b) => barks.push(b.text));
  const flee = { on: false }, blocked = { on: false }, night = { on: false }, ejected = { n: 0 };
  const police = new PoliceSystem({
    events, world, wanted, cops, player: player as PolicePlayer, scene: { add() {}, remove() {} } as never, rng: new Rng(3),
    peds: () => peds, makeOfficer: (id, pos, h) => new Officer(id, pos, h, proxyMaterials(), new Rng(5)),
    isNight: () => night.on, blocked: () => blocked.on, tryingToFlee: () => flee.on, ejectPlayer: () => { ejected.n++; },
    precinct: () => GRID_PRECINCT, say: (t) => lines.push(t), onBusted: (i) => busted.push(i),
  });
  return { events, wanted, police, player: player as never, peds, world, barks, lines, flee, blocked, night, ejected, busted, cars };
}
const tick = (r: Rig, s: number): void => { for (let t = 0; t < s - 1e-9; t += 1 / 30) { r.police.update(1 / 30); r.wanted.update(1 / 30); r.world.step(1 / 30); } };
const punch = (r: Rig): void => r.events.emit('pedHit', { id: 'x', pos: { x: 2, z: 0 }, by: 'fist', down: false });
const withWitness = (r: Rig): void => { r.peds.push({ body: mkBody('w', 10, 0), state: 'walking' }); };
const adoptOfficer = (r: Rig, x: number, z: number): Officer => {
  const o = new Officer(`o${r.police.officers.length}`, { x, z }, 0, proxyMaterials(), new Rng(5));
  r.world.addBody(o.body); r.police.officers.push(o); o.onStruck = () => (r.police as unknown as { onOfficerStruck(o: Officer): void }).onOfficerStruck(o);
  return o;
};

describe('witnesses and sight', () => {
  it('a crime nobody can see adds heat but no star', () => {
    const r = rig();
    for (let i = 0; i < 8; i++) { punch(r); tick(r, 1); }
    expect(r.wanted.stars).toBe(0);
    expect(r.police.heat.heat).toBeGreaterThan(0);
  });
  it('a pedestrian with a clear line sees it; a wall in between hides it; night shortens the range', () => {
    const r = rig();
    r.peds.push({ body: mkBody('w', 20, 0), state: 'walking' });
    expect(r.police.witnessed({ x: 0, z: 0 })).toBe(true);
    r.night.on = true;
    expect(r.police.witnessed({ x: 0, z: 0 })).toBe(false); // 20 m is past the 16 m night range
    r.night.on = false;
    r.world.addStatic({ kind: 'polygon', points: [{ x: 9, z: -5 }, { x: 11, z: -5 }, { x: 11, z: 5 }, { x: 9, z: 5 }] } as never);
    expect(r.police.witnessed({ x: 0, z: 0 })).toBe(false);
    expect(r.police.witnessed({ x: 0, z: 0 }, 'gunshot')).toBe(true); // heard through the wall
  });
  it('a pedestrian who is down does not count', () => {
    const r = rig();
    r.peds.push({ body: mkBody('w', 5, 0), state: 'down' });
    expect(r.police.witnessed({ x: 0, z: 0 })).toBe(false);
  });
});

describe('the ladder', () => {
  it('two punches in view: a warning, no star; the third is star 1; nothing happens without a chase before that', () => {
    const r = rig();
    withWitness(r);
    r.cars.push({ vehicle: { body: mkBody('car', 30, 0, 'cop'), speed: 0 } as unknown as IVehicle, pursuing: false });
    punch(r); tick(r, 1);
    expect(r.wanted.stars).toBe(0);
    expect(r.police.state).toBe('calm');
    punch(r); tick(r, 1);
    expect(r.wanted.stars).toBe(0);
    expect(r.police.state).toBe('watching');
    expect(r.police.stateLine).toBe('Police are watching');
    expect(r.barks.length).toBe(1); // an officer (the patrol car) turned and warned
    punch(r); tick(r, 0.5);
    expect(r.wanted.stars).toBe(1);
  });
  it('a gunshot that was heard is a star at once; a hit-and-run is one star, not two', () => {
    const r = rig();
    withWitness(r);
    r.events.emit('crime', { type: 'gunshot', pos: { x: 0, z: 0 } });
    expect(r.wanted.stars).toBe(1);
    const q = rig(); withWitness(q);
    q.events.emit('crime', { type: 'hitPed', pos: { x: 0, z: 0 } });
    expect(q.wanted.stars).toBe(1);
  });
  it('heat fades: three punches spread over two minutes never make a star', () => {
    const r = rig(); withWitness(r);
    for (let i = 0; i < 3; i++) { punch(r); tick(r, 40); }
    expect(r.wanted.stars).toBe(0);
  });
  it('self defence after being hit first is heat only', () => {
    const r = rig(); withWitness(r);
    r.police.noteAttacked();
    for (let i = 0; i < 6; i++) { punch(r); tick(r, 0.5); }
    expect(r.wanted.stars).toBe(0);
  });
  it('grace: minor acts are free for the first two minutes', () => {
    const r = rig(); withWitness(r);
    r.police.setGrace(120);
    for (let i = 0; i < 6; i++) { punch(r); tick(r, 0.5); }
    expect(r.wanted.stars).toBe(0);
    expect(r.police.heat.heat).toBe(0);
  });
  it('stars are held while an officer can see you and cool once unseen', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    r.blocked.on = true; // (so the officer, who walks up, cannot arrest: this test is about sight)
    const o = adoptOfficer(r, 30, 0); o.mode = 'approach';
    tick(r, 25);
    expect(r.wanted.stars).toBe(1); // watched: no cooling
    r.police.officers.length = 0; r.world.removeBody(o.body.id);
    tick(r, 5 + 21);
    expect(r.wanted.stars).toBe(0);
  });
});

describe('arrest', () => {
  it('an officer within reach of a player who stands still holds for 1.5 s, then BUSTED', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    adoptOfficer(r, 1.0, 0);
    tick(r, 0.3);
    expect(r.police.isBeingArrested()).toBe(true);
    expect(r.police.state).toBe('arrest');
    expect(r.player.actionPose?.kind).toBe('held');
    expect(r.busted.length).toBe(0);
    tick(r, ARREST_HOLD);
    expect(r.busted.length).toBe(1);
    expect(r.player.body.vel).toEqual({ x: 0, z: 0 });
  });
  it('a sprinting player is not grabbed', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    adoptOfficer(r, 1.0, 0);
    r.player.body.vel.x = 5.5;
    tick(r, 0.5);
    expect(r.police.isBeingArrested()).toBe(false);
  });
  it('running breaks free once per chase and adds a star; the second time the hold completes', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    const o = adoptOfficer(r, 1.0, 0);
    tick(r, 0.2);
    expect(r.police.isBeingArrested()).toBe(true);
    r.flee.on = true;
    tick(r, 0.4);
    expect(r.police.isBeingArrested()).toBe(false);
    expect(r.wanted.stars).toBe(2);
    expect(r.lines).toContain('Resisting arrest');
    expect(r.police.breakFreeUsed).toBe(true);
    expect(o.cooldown).toBeGreaterThan(0);
    // grabbed again after the cooldown: no second break-free
    o.body.pos.x = 1.0; o.body.pos.z = 0;
    tick(r, 3.5);
    expect(r.police.isBeingArrested()).toBe(true);
    tick(r, ARREST_HOLD + 0.3);
    expect(r.busted.length).toBe(1);
  });
  it('a hit on the officer breaks free once, and it is a hit on a cop', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    const o = adoptOfficer(r, 1.0, 0);
    tick(r, 0.3);
    expect(r.police.isBeingArrested()).toBe(true);
    o.hitBy({ x: 0, z: 0 }, 'light');
    expect(r.police.isBeingArrested()).toBe(false);
    expect(r.wanted.stars).toBeGreaterThanOrEqual(2);
  });
  it('no arrest through a wall, inside a room or during a cut', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    adoptOfficer(r, 1.0, 0);
    r.world.addStatic({ kind: 'polygon', points: [{ x: 0.4, z: -3 }, { x: 0.6, z: -3 }, { x: 0.6, z: 3 }, { x: 0.4, z: 3 }] } as never);
    tick(r, 1);
    expect(r.police.isBeingArrested()).toBe(false);
    const q = rig(); withWitness(q); q.wanted.raiseTo(1); adoptOfficer(q, 1.0, 0); q.blocked.on = true;
    tick(q, 2);
    expect(q.police.isBeingArrested()).toBe(false);
  });
  it('a car stopped for two seconds can be pulled over at one star: the player is put out of it', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    const car = { body: mkBody('pcar', 0, 0, 'vehicle'), speed: 0 } as unknown as IVehicle;
    (r.player as { vehicle: unknown }).vehicle = car; (r.player as { inVehicle: boolean }).inVehicle = true;
    adoptOfficer(r, 2.5, 0);
    tick(r, 1.5);
    expect(r.police.isBeingArrested()).toBe(false);
    tick(r, 1);
    expect(r.police.isBeingArrested()).toBe(true);
    expect(r.ejected.n).toBe(1);
  });
  it('officers go off duty when the stars are gone', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(1);
    const o = adoptOfficer(r, 15, 0);
    r.wanted.clear();
    tick(r, 1);
    expect(o.mode).toBe('leave');
  });
});

describe('bust consequences', () => {
  const host = (cash: number, calls: string[] = []): BustHost & { cash0: number; at: unknown; hours: number; busts: number } => {
    const h = { cash0: cash, at: null as unknown, hours: 0, busts: 0,
      cash: () => h.cash0, addCash: (n: number) => { h.cash0 = Math.max(0, h.cash0 + n); calls.push('cash'); },
      dropWeapons: () => calls.push('weapons'), teleport: (s: unknown) => { h.at = s; calls.push('teleport'); },
      advanceClock: (x: number) => { h.hours = x; calls.push('clock'); }, clearWanted: () => calls.push('wanted'), addBust: () => { h.busts++; } };
    return h;
  };
  it('the fine grows with the stars, adds a surcharge for resisting and never goes below zero cash', () => {
    expect(fineFor(1, false, 500)).toBeLessThan(fineFor(2, false, 500));
    expect(fineFor(2, false, 500)).toBeLessThan(fineFor(3, false, 500));
    expect(fineFor(1, true, 500)).toBeGreaterThan(fineFor(1, false, 500));
    expect(fineFor(3, false, 40)).toBe(40);
    expect(fineFor(3, false, 0)).toBe(0);
    expect(hoursInCustody(3)).toBeGreaterThan(hoursInCustody(1));
  });
  it('takes the cash and the weapons, moves the clock, clears the stars, counts the bust and puts the player at the door', () => {
    const calls: string[] = [];
    const h = host(100, calls);
    const res = applyBust(h, { stars: 2, resisted: false }, GRID_PRECINCT);
    expect(res.fine).toBe(fineFor(2, false, 100));
    expect(h.cash0).toBe(100 - res.fine);
    expect(calls).toEqual(expect.arrayContaining(['cash', 'weapons', 'wanted', 'clock', 'teleport']));
    expect(h.at).toBe(GRID_PRECINCT);
    expect(h.busts).toBe(1);
    const broke = host(0);
    expect(applyBust(broke, { stars: 3, resisted: true }, GRID_PRECINCT).fine).toBe(0);
    expect(broke.cash0).toBe(0);
  });
  it('the full path through the system: held, busted, completeBust, stars clear, one bust counted, officers gone', () => {
    const r = rig(); withWitness(r);
    r.wanted.raiseTo(2);
    adoptOfficer(r, 1.0, 0);
    tick(r, 2.5);
    expect(r.busted.length).toBe(1);
    const h = host(300);
    const res = r.police.completeBust(h);
    expect(res.precinct).toBe(GRID_PRECINCT.name);
    expect(r.wanted.stars).toBe(0);
    expect(r.police.busts).toBe(1);
    expect(r.police.officers.length).toBe(0);
    expect(r.police.isBeingArrested()).toBe(false);
    expect(r.police.heat.heat).toBe(0);
  });
});

describe('where the jail is', () => {
  it('the real map uses the station house landmark under its invented name', () => {
    const p = realPrecinct(LANDMARKS);
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Ironside Station House');
    expect(Number.isFinite(p!.spot.x) && Number.isFinite(p!.spot.z) && Number.isFinite(p!.heading)).toBe(true);
    expect(precinctFor('real', LANDMARKS).id).toBe('ironside-station-house');
  });
  it('the grid map has its own marked door, not a real precinct name', () => {
    expect(precinctFor('grid', LANDMARKS)).toBe(GRID_PRECINCT);
    expect(GRID_PRECINCT.name).not.toMatch(/\d+(st|nd|rd|th)\s+precinct/i);
  });
  it('without the landmark rows the real map falls back to the grid door (never crashes)', () => {
    expect(precinctFor('real', [])).toBe(GRID_PRECINCT);
  });
});

describe('the save', () => {
  const parts = (state: { busts: number }): SaveParts => ({
    getPose: () => ({ x: 1, z: 2, heading: 0, inCar: false }), setPose: () => {}, getHour: () => 9, setHour: () => {}, getDay: () => 0, setDay: () => {},
    inventory: { cash: 10, records: [], flags: [], items: () => ({}), reset() {}, add() { return 0; }, addRecord() {}, giveItem() {}, setFlag() {} } as never,
    missions: { serialize: () => ({}), restore: () => true }, phone: { serialize: () => ({}), restore: () => true },
    getWanted: () => 0, setWanted: () => {}, getBusts: () => state.busts, setBusts: (n) => { state.busts = n; },
    getWeather: () => 'dry', setWeather: () => {}, getStation: () => '', setStation: () => {}, getLook: () => null, setLook: () => {}, getStreet: () => '',
  });
  it('round trips the bust count; an old save loads with zero', () => {
    const live = { busts: 3 };
    const saved = migrateSave(JSON.parse(JSON.stringify(captureSave(parts(live)))));
    expect(saved?.busts).toBe(3);
    const fresh = { busts: 9 };
    applySave(parts(fresh), saved!);
    expect(fresh.busts).toBe(3);
    const old = migrateSave({ v: 3, savedAt: 1, pose: { x: 0, z: 0, heading: 0, inCar: false }, hour: 8 });
    expect(old?.busts).toBeUndefined();
    applySave(parts(fresh), old!);
    expect(fresh.busts).toBe(0);
  });
});
