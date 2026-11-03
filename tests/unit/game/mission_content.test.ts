import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { MissionSystem } from '@/game/missions/MissionSystem';
import { buildMissions } from '@/game/missions/content';
import type { MissionDef, ObjectiveDef } from '@/game/missions/types';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
const defs = buildMissions(grid, data, lots);
const byId = (id: string): MissionDef => defs.find((d) => d.id === id)!;

const DT = 1 / 60;
const GAME_HOURS_PER_SECOND = 1 / 60; // DayNight default: one game hour per real minute

/** A scripted player: walks/drives in straight lines at a speed, with a wanted level that decays 1 star / 20 s. */
class Driver {
  x: number; z: number;
  inCar = false;
  stars = 0;
  speed = 0;
  t = 0;
  hour: number;
  private sinceCrime = 0;
  constructor(readonly m: MissionSystem, start: { x: number; z: number }, hour = 12) { this.x = start.x; this.z = start.z; this.hour = hour; }

  tick(): void {
    if (this.stars > 0) { this.sinceCrime += DT; if (this.sinceCrime >= 20) { this.sinceCrime = 0; this.stars--; } }
    this.t += DT;
    this.hour = (this.hour + GAME_HOURS_PER_SECOND * DT) % 24;
    this.m.update(DT, this, this.inCar, this.stars, this.speed, this.hour);
  }
  wait(seconds: number, speed = 0): void { this.speed = speed; for (let i = 0; i < seconds / DT; i++) this.tick(); }
  /** Move to `to` at `mps` (straight line). Returns when within 0.3 m. */
  go(to: { x: number; z: number }, mps: number): void {
    this.speed = mps;
    for (let guard = 0; guard < 60 * 600; guard++) {
      const dx = to.x - this.x, dz = to.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3 || this.m.isFailed) break;
      const s = Math.min(d, mps * DT);
      this.x += (dx / d) * s; this.z += (dz / d) * s;
      this.tick();
    }
    this.speed = 0;
  }
  raise(n: number): void { this.stars = Math.max(this.stars, n); this.sinceCrime = 0; }
}

const objPos = (o: ObjectiveDef): { x: number; z: number } | null =>
  'at' in o && o.at ? o.at : null;

/** Distance from point p to segment a-b. */
const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};

/** The approach point: 40 m out from the giver on a side whose straight approach crosses no other giver zone. */
const approach = (def: MissionDef): { x: number; z: number } => {
  for (const [ox, oz] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) {
    const a = { x: def.giver.x + ox, z: def.giver.z + oz };
    const clear = defs.every((o) => o === def || segDist(o.giver, a, def.giver) > o.triggerRadius + 1)
      && defs.every((o) => Math.hypot(o.giver.x - a.x, o.giver.z - a.z) > o.triggerRadius + 1 || o === def);
    if (clear) return a;
  }
  throw new Error('no clear approach');
};

const drivenBy = (m: MissionSystem, def: MissionDef, hour = 12) => new Driver(m, approach(def), hour);

const fresh = (extra: { hour?: number } = {}) => {
  const saved: unknown[] = [];
  let drv!: Driver;
  const m = new MissionSystem(defs, {
    raiseWanted: (n) => drv.raise(n),
    persist: (s) => saved.push(s),
  });
  return { m, saved, mk: (def: MissionDef) => { drv = drivenBy(m, def, extra.hour); return drv; } };
};

describe('mission content integrity', () => {
  it('ships sixteen uniquely-named missions with sane geometry', () => {
    expect(defs.map((d) => d.id)).toEqual([
      'bodega-run', 'laundromat-getaway', 'block-party', 'crate-digger', 'open-decks', 'the-password', 'aftersloth-residency',
      'alternate-side-shuffle', 'soundclash', 'senator-the-cat', 'dollar-van-last-run', 'moving-day', 'permit-pending',
      'lost-cat', 'dollar-van-fare', 'stoop-sale',
    ]);
    expect(new Set(defs.map((d) => d.title)).size).toBe(16);
    expect(new Set(defs.map((d) => d.id)).size).toBe(16);
    const b = grid.bounds, margin = 30;
    for (const d of defs) {
      if (d.giverPoi !== 'wax-deli') expect(data.pois.some((p) => p.id === d.giverPoi), d.id).toBe(true);
      expect(d.triggerRadius).toBeGreaterThan(1);
      expect(d.objectives.length).toBeGreaterThan(2);
      expect(d.reward.cash).toBeGreaterThan(0);
      // interiors sit 3 km out, so the club/deli door markers are checked against their own street spot instead
      const route = d.objectives.flatMap((o) => (o.kind === 'tail' ? o.route : o.kind === 'collect' ? o.points : []));
      for (const p of [d.giver, ...route, ...d.objectives.map(objPos).filter((q): q is { x: number; z: number } => q !== null)]) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
        expect(p.x).toBeGreaterThan(b.minX - margin); expect(p.x).toBeLessThan(b.maxX + margin);
        expect(p.z).toBeGreaterThan(b.minZ - margin); expect(p.z).toBeLessThan(b.maxZ + margin);
      }
    }
  });

  it('every mission has the BIBLE template: intro text, follow-up, a fail joke; story twists where promised', () => {
    const fresh = defs.filter((d) => !['bodega-run', 'laundromat-getaway', 'block-party'].includes(d.id));
    expect(fresh).toHaveLength(13);
    for (const d of fresh) {
      expect(d.phoneIntro?.text.length, `${d.id} intro`).toBeGreaterThan(20);
      expect(d.followUp?.text.length, `${d.id} follow-up`).toBeGreaterThan(10);
      expect(Object.keys(d.failJoke ?? {}).length, `${d.id} fail joke`).toBeGreaterThan(0);
      expect(d.objectives.length, `${d.id} beats`).toBeGreaterThanOrEqual(3);
      expect(d.objectives.length, `${d.id} beats`).toBeLessThanOrEqual(7);
      if (d.tag !== 'side') expect(d.twist, `${d.id} twist`).toBeDefined();
      if (d.twist) { expect(d.twist.at).toBeGreaterThanOrEqual(0); expect(d.twist.at).toBeLessThan(d.objectives.length); }
    }
  });

  it('the DJ chapters chain and the night mission lives between 23:00 and 04:00', () => {
    const by = (id: string) => defs.find((d) => d.id === id)!;
    expect(by('open-decks').requires).toEqual(['crate-digger']);
    expect(by('the-password').requires).toEqual(['open-decks']);
    expect(by('aftersloth-residency').requires).toEqual(['the-password']);
    expect(by('the-password').setFlags).toContain('aftersloth.unlocked');
    const pw = by('the-password');
    expect(pw.availableHours![0]).toBeGreaterThanOrEqual(22);
    expect(pw.deadlineHour).toBe(4);
    const res = by('aftersloth-residency');
    const sets = res.objectives.filter((o) => o.kind === 'djSet');
    expect(sets.reduce((n, o) => n + (o.kind === 'djSet' ? o.minutes : 0), 0)).toBe(4);
    expect(res.objectives.some((o) => o.kind === 'interact')).toBe(true); // the generator
    expect(res.objectives.find((o) => o.kind === 'waitUntilHour')).toMatchObject({ from: 23, to: 4 });
  });

  it('giver zones do not overlap each other', () => {
    for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) {
      const d = Math.hypot(defs[i].giver.x - defs[j].giver.x, defs[i].giver.z - defs[j].giver.z);
      expect(d).toBeGreaterThan(defs[i].triggerRadius + defs[j].triggerRadius);
    }
  });

  it('every delivered item is picked up first', () => {
    for (const d of defs) {
      const bag: string[] = [];
      for (const o of d.objectives) {
        if (o.kind === 'pickUp') bag.push(...o.items);
        if (o.grant) bag.push(...o.grant);
        if (o.kind === 'sell') for (let n = 0; n < o.count; n++) { const k = bag.indexOf(o.item); expect(k, `${d.id}: sells ${o.item}`).toBeGreaterThanOrEqual(0); bag.splice(k, 1); }
        if (o.kind === 'deliver') for (const it of o.items) {
          const k = bag.indexOf(it);
          expect(k, `${d.id}: ${it}`).toBeGreaterThanOrEqual(0);
          bag.splice(k, 1);
        }
      }
      expect(bag, `${d.id} leaves items undelivered`).toEqual([]);
    }
  });

  it('resolves the same without built lots (falls back to the POI t)', () => {
    const noLots = buildMissions(grid, data);
    expect(noLots.map((d) => d.id)).toEqual(defs.map((d) => d.id));
    for (let i = 0; i < defs.length; i++) expect(Math.hypot(noLots[i].giver.x - defs[i].giver.x, noLots[i].giver.z - defs[i].giver.z)).toBeLessThan(25);
  });

  it('is deterministic and non-violent (no wanted-raising except the laundromat bag)', () => {
    expect(JSON.stringify(buildMissions(grid, data, lots))).toBe(JSON.stringify(defs));
    for (const d of defs) for (const o of d.objectives) if (o.raiseWantedTo !== undefined) expect(d.id).toBe('laundromat-getaway');
    // the only way stars appear in the new jobs is as a failure rule (a noise complaint, a pulled-over van)
    const text = JSON.stringify(defs).toLowerCase();
    for (const bad of ['kill', 'shoot', 'stab', 'gun', 'punch', 'murder', 'blood']) expect(text.includes(`"${bad}`) || text.includes(` ${bad} `)).toBe(false);
  });
});

describe('Bodega Run', () => {
  const def = byId('bodega-run');

  it('completes on foot in time and pays out', () => {
    const { m, saved, mk } = fresh();
    const d = mk(def);
    d.go(approach(def), 5); // arms the trigger
    d.go(def.giver, 5);
    expect(m.activeId).toBe('bodega-run');
    d.wait(4); // deli bags the order
    expect(m.carrying).toEqual(['bodega bag', 'bodega bag', 'bodega bag']);
    for (const o of def.objectives.filter((x) => x.kind === 'deliver')) {
      expect(m.isActive).toBe(true);
      d.go(objPos(o)!, 5.5);
      d.wait(0.1);
    }
    expect(m.statusOf('bodega-run')).toBe('complete');
    expect(m.cash).toBe(150);
    expect(d.t).toBeLessThan(def.timeLimit!);
    expect(saved).toHaveLength(1);
  });

  it('works from a car too', () => {
    const { m, mk } = fresh();
    const d = mk(def);
    d.go(approach(def), 5);
    d.inCar = true;
    d.go(def.giver, 12);
    d.wait(4);
    for (const o of def.objectives.filter((x) => x.kind === 'deliver')) d.go(objPos(o)!, 12), d.wait(0.1);
    expect(m.statusOf('bodega-run')).toBe('complete');
  });

  it('fails on the clock, then a retry can be won', () => {
    const { m, mk } = fresh();
    const d = mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    d.wait(4);
    d.wait(def.timeLimit!); // lingering in front of the deli
    expect(m.failReason).toBe('timeUp');
    expect(m.hud.retryPrompt).not.toBe('');
    expect(m.retry()).toBe(true);
    d.wait(4);
    for (const o of def.objectives.filter((x) => x.kind === 'deliver')) d.go(objPos(o)!, 5.5), d.wait(0.1);
    expect(m.statusOf('bodega-run')).toBe('complete');
  });
});

describe('Laundromat Getaway', () => {
  const def = byId('laundromat-getaway');
  const door = objPos(def.objectives[0])!;
  const garage = objPos(def.objectives[3])!;

  /** Plays up to (and including) grabbing the bag, then hops into a car. */
  function toTheCar() {
    const ctx = fresh();
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    expect(ctx.m.activeId).toBe('laundromat-getaway');
    d.go(door, 5);
    d.wait(0.2);
    return { ...ctx, d };
  }

  it('grabbing the bag raises 2 stars and carries the bag', () => {
    const { m, d } = toTheCar();
    expect(d.stars).toBe(2);
    expect(m.carrying).toEqual(['laundry bag']);
    expect(m.objectiveIndex).toBe(1);
  });

  it('the bag can only be grabbed on foot', () => {
    const ctx = fresh();
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    d.inCar = true;
    d.go(door, 8);
    d.wait(1);
    expect(ctx.m.objectiveIndex).toBe(0);
    d.inCar = false;
    d.wait(0.2);
    expect(ctx.m.objectiveIndex).toBe(1);
  });

  it('full run: car, away from the laundromat, into the garage, lie low until the stars drop', () => {
    const { m, d, saved } = toTheCar();
    d.inCar = true;
    d.wait(0.2);
    expect(m.objectiveIndex).toBe(2);
    d.go({ x: door.x + 130, z: door.z }, 14);
    d.wait(0.1);
    expect(m.objectiveIndex).toBe(3);
    d.go(garage, 14);
    d.wait(0.1);
    expect(m.objectiveIndex).toBe(4);
    d.wait(5.2); // handbrake, engine off
    expect(m.objectiveIndex).toBe(5);
    expect(m.isActive).toBe(true); // 2 stars take ~40 s to decay
    d.wait(60);
    expect(d.stars).toBe(0);
    expect(m.statusOf('laundromat-getaway')).toBe('complete');
    expect(m.cash).toBe(400);
    expect(saved).toHaveLength(1);
  });

  it('abandoning the car fails the run, and the retry starts from the laundromat', () => {
    const { m, d } = toTheCar();
    d.inCar = true;
    d.wait(0.2);
    d.go({ x: door.x + 130, z: door.z }, 14);
    d.inCar = false; // bails out on foot
    d.wait(10);
    expect(m.failReason).toBe('leftVehicle');
    expect(m.retry()).toBe(true);
    expect(m.objectiveIndex).toBe(0);
    expect(m.carrying).toEqual([]);
  });

  it('driving through the garage without stopping is not enough', () => {
    const { m, d } = toTheCar();
    d.inCar = true;
    d.go({ x: door.x + 130, z: door.z }, 14);
    d.wait(0.1);
    d.go(garage, 14);
    d.wait(0.1);
    d.wait(3, 8); // still rolling at 29 km/h
    expect(m.objectiveIndex).toBe(4);
  });
});

describe('Block Party', () => {
  const def = byId('block-party');
  const stops = def.objectives.map((o) => objPos(o)!);

  it('is offered by day only', () => {
    const ctx = fresh({ hour: 19 });
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    d.wait(2);
    expect(ctx.m.isActive).toBe(false);
    expect(ctx.m.hud.toast).toContain('come back');
  });

  it('three stores, then Van Buren, by car from 5:30pm before 8pm', () => {
    const ctx = fresh({ hour: 17.5 });
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    expect(ctx.m.activeId).toBe('block-party');
    expect(ctx.m.hud.timeLeft).toBeLessThan(150); // 2.5 game hours at 1 hour per minute, minus the walk to Auntie
    expect(ctx.m.hud.timeLeft).toBeGreaterThan(120);
    d.inCar = true;
    for (const p of stops) { d.go(p, 16); d.wait(0.1); }
    expect(ctx.m.carrying).toEqual([]);
    expect(ctx.m.statusOf('block-party')).toBe('complete');
    expect(ctx.m.cash).toBe(250);
    expect(d.hour).toBeLessThan(20);
  });

  it('a stop-and-chat stroll misses the party', () => {
    const ctx = fresh({ hour: 17.5 });
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    d.go(stops[0], 3); // 3 m/s: wandering
    d.go(stops[1], 3);
    d.go(stops[2], 3);
    d.go(stops[3], 3);
    expect(ctx.m.failReason).toBe('clockUp');
    expect(ctx.m.retry(d.hour)).toBe(true);
    expect(ctx.m.hud.timeLeft).toBeGreaterThan(0);
  });

  it('the deliver needs all three items', () => {
    const ctx = fresh({ hour: 10 });
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    d.go(stops[0], 14); d.wait(0.1);
    d.go(stops[3], 14); d.wait(1); // skipped the table and the ice
    expect(ctx.m.objectiveIndex).toBe(1);
    expect(ctx.m.carrying).toEqual(['speaker']);
  });
});

describe('persistence across a reload', () => {
  it('a completed mission stays done and its marker is gone', () => {
    const ctx = fresh();
    const def = byId('bodega-run');
    const d = ctx.mk(def);
    d.go(approach(def), 5);
    d.go(def.giver, 5);
    d.wait(4);
    for (const o of def.objectives.filter((x) => x.kind === 'deliver')) d.go(objPos(o)!, 5.5), d.wait(0.1);
    const json = JSON.stringify(ctx.m.serialize());

    const m2 = new MissionSystem(buildMissions(grid, data, lots));
    expect(m2.restore(JSON.parse(json))).toBe(true);
    expect(m2.isCompleted('bodega-run')).toBe(true);
    expect(m2.markers.some((k) => k.label === 'Bodega Run')).toBe(false);
    expect(m2.markers.length).toBeLessThanOrEqual(4);
    expect(m2.cash).toBe(150);
  });
});
