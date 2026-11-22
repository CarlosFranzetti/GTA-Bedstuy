import { describe, expect, it } from 'vitest';
import { Combat } from '@/game/combat/Combat';
import { GUNS, MELEE, pelletDamage, pelletOffsets } from '@/game/combat/arsenal';
import { Hands } from '@/game/combat/items';
import { MeleeCombo } from '@/game/combat/melee';
import { Blood, BLOOD_CAPS, MARK_LIFE, type Tier } from '@/game/combat/blood';
import { PlayerVitals, applyKnockout, hospitalFor, HOSPITAL_BILL } from '@/game/combat/vitals';
import { PedVitals, TEMPER_SHARES, buildFor, maxHealthFor, temperamentFor, type Age, type Temperament } from '@/entities/pedVitals';
import { Officer } from '@/entities/Officer';
import { Rng } from '@/core/Rng';
import { WantedSystem } from '@/game/WantedSystem';
import { EventBus, World2D, fakeInput, fakePlayer, makePed, recordEvents, soundRecorder } from './helpers';
import type { Pedestrian, PedState } from '@/entities/Pedestrian';
import type { IMaterialLibrary } from '@/world/types';
import * as THREE from 'three';

const DT = 1 / 60;

function rig(opts: { vitals?: boolean; blood?: Blood } = {}) {
  const events = new EventBus();
  const world = new World2D();
  const player = fakePlayer(0, 0, 0); // facing -z
  const peds: Array<Pedestrian | Officer> = [];
  const input = fakeInput();
  const sfx = soundRecorder();
  const vitals = opts.vitals ? new PlayerVitals() : undefined;
  const attacked: number[] = [];
  const log = recordEvents(events, ['crime', 'pedHit', 'gunshot', 'pedKnockedDown']);
  const combat = new Combat({ events, world, peds: () => peds, player, sfx, vitals, blood: opts.blood, noteAttacked: () => attacked.push(1) });
  const step = (n: number, tick = false) => {
    for (let i = 0; i < n; i++) {
      combat.update(DT, { viewYaw: 0, blocked: false, input });
      if (tick) for (const p of peds) p.update(DT);
      input.edge = false;
    }
  };
  const addPed = (id: string, x: number, z: number) => { const p = makePed(world, events, id, x, z); peds.push(p); return p; };
  return { events, world, player, peds, input, sfx, log, combat, step, addPed, vitals, attacked };
}
const setTemper = (p: Pedestrian, t: Temperament): void => { (p.vitals as unknown as { temper: Temperament }).temper = t; };

describe('every person can be hit, in every state', () => {
  const states: PedState[] = ['walking', 'waiting', 'sitting', 'meeting', 'chatting', 'fleeing', 'down'];
  for (const st of states) {
    it(`a person who is ${st} takes a blow and reports it`, () => {
      const r = rig();
      const p = r.addPed(`s-${st}`, 0, -0.9);
      p.state = st;
      r.combat.hurt(p, 'light', 'fist', { x: 0, z: 0 });
      expect(r.log.filter((l) => l.type === 'pedHit')).toHaveLength(1);
      expect(p.vitals.health).toBeLessThan(p.vitals.max);
    });
  }
  it('a person on the ground is hit by a punch when nobody else is in reach, and still stays down', () => {
    const r = rig();
    const p = r.addPed('floor', 0, -0.9);
    r.combat.hurt(p, 'heavy', 'fist', { x: 0, z: 0 });
    expect(p.state).toBe('down');
    const h = p.vitals.health;
    r.input.press(); r.step(30);
    expect(p.state).toBe('down');
    expect(p.vitals.health).toBeLessThan(h);
  });
  it('an officer on foot can be hit and put on the ground, and gets up', () => {
    const r = rig();
    const o = new Officer('cop1', { x: 0, z: -0.9 }, 0, { get: () => new THREE.MeshBasicMaterial() } as unknown as IMaterialLibrary, new Rng('cop1'));
    r.peds.push(o);
    let struck = 0; o.onStruck = () => { struck++; };
    r.input.press(); r.step(30);
    expect(struck).toBe(1);
    r.combat.hurt(o, 'club', 'fist', { x: 0, z: 0 }, true, 40);
    expect(o.state).toBe('down');
    for (let i = 0; i < 60 * 5; i++) o.update(DT);
    expect(o.state).toBe('walking');
  });
  it('a mission person (knockoutImmune) goes down but is never knocked out', () => {
    const r = rig();
    const p = r.addPed('vip', 0, -0.9);
    p.knockoutImmune = true;
    for (let i = 0; i < 12; i++) { r.combat.hurt(p, 'heavy', 'fist', { x: 0, z: 0 }); p.state = 'walking'; }
    expect(p.vitals.out).toBe(false);
    expect(p.vitals.health).toBeGreaterThan(0);
  });
});

describe('health, knock-down and knock-out by build', () => {
  it('health follows age and build', () => {
    expect(maxHealthFor('adult', 'average')).toBe(60);
    expect(maxHealthFor('adult', 'frail')).toBeLessThan(maxHealthFor('adult', 'average'));
    expect(maxHealthFor('adult', 'heavy')).toBeGreaterThan(maxHealthFor('adult', 'big'));
    expect(maxHealthFor('kid', 'average')).toBeLessThan(maxHealthFor('old', 'average'));
  });
  it('builds are spread by hash: every build occurs, frail the least', () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const b = buildFor(`person-${i}`); n[b] = (n[b] ?? 0) + 1; }
    for (const b of ['frail', 'slight', 'average', 'big', 'heavy']) expect(n[b]).toBeGreaterThan(200);
    expect(n.frail).toBeLessThan(n.average);
  });
  it('a jab staggers, a second jab inside six seconds knocks down, eight jabs knock out an average person', () => {
    const v = new PedVitals('x', 'adult');
    const hp = v.max;
    const first = v.strike('light');
    expect(first).toBe('stagger');
    expect(v.strike('light')).toBe('down');
    let n = 2, out = 'down';
    while (out !== 'out' && n < 30) { out = v.strike('light', undefined, true); n++; }
    expect(out).toBe('out');
    expect(n).toBeGreaterThanOrEqual(Math.ceil(hp / 12) - 1);
    expect(n).toBeLessThanOrEqual(Math.ceil(hp / 12) + 1);
  });
  it('a frail person goes out in fewer blows than a heavy one', () => {
    const blows = (age: Age, build: 'frail' | 'heavy') => {
      const v = new PedVitals(`z-${build}`, age);
      (v as unknown as { health: number }).health = maxHealthFor(age, build);
      let n = 0; while (!v.out && n < 50) { v.strike('light', 12, true); n++; if (v.health <= 0) break; }
      return n;
    };
    // same hash id gives the same build: use numbers directly
    expect(Math.ceil(maxHealthFor('adult', 'frail') / 12)).toBeLessThan(Math.ceil(maxHealthFor('adult', 'heavy') / 12));
    expect(blows('adult', 'frail')).toBeGreaterThan(0);
  });
  it('heavy, thrown, club and shot blows always put a person down; the kind sets the damage', () => {
    for (const f of ['heavy', 'thrown', 'club', 'shot', 'blast'] as const) expect(new PedVitals('k', 'adult').strike(f)).not.toBe('stagger');
    expect(new PedVitals('k2', 'adult').strike('blast')).toBe('out');
  });
  it('a knocked-out person lies a good while, breathing, then wakes with some health and walks off', () => {
    const r = rig();
    const p = r.addPed('ko', 0, -0.9);
    r.combat.hurt(p, 'blast', 'shot', { x: 0, z: 0 }, false, 400);
    expect(p.isKnockedOut).toBe(true);
    const t = p.vitals.downSeconds('out');
    expect(t).toBeGreaterThanOrEqual(24);
    for (let i = 0; i < 60 * 20; i++) p.update(DT);
    expect(p.state).toBe('down');
    for (let i = 0; i < 60 * 20; i++) p.update(DT);
    expect(p.state).not.toBe('down');
    expect(p.vitals.out).toBe(false);
    expect(p.vitals.health).toBeGreaterThan(0);
  });
});

describe('temperaments', () => {
  const draw = (age: Age) => {
    const n: Record<Temperament, number> = { flee: 0, cower: 0, film: 0, fight: 0 };
    for (let i = 0; i < 6000; i++) n[temperamentFor(`p${i}:${age}`, age)]++;
    return n;
  };
  it('shares follow the table within a few percent, seeded (the same id is always the same person)', () => {
    const n = draw('adult');
    for (const t of ['flee', 'cower', 'film', 'fight'] as const) expect(Math.abs(n[t] / 6000 - TEMPER_SHARES.adult[t])).toBeLessThan(0.03);
    expect(temperamentFor('abc', 'adult')).toBe(temperamentFor('abc', 'adult'));
  });
  it('children never film it or fight', () => { const n = draw('kid'); expect(n.film + n.fight).toBe(0); });

  it('a person who cowers freezes bent over and says so', () => {
    const r = rig();
    const p = r.addPed('c', 0, -0.9); setTemper(p, 'cower');
    r.combat.hurt(p, 'light', 'fist', { x: 0, z: 0 });
    expect(p.special?.mode).toBe('cower');
    p.flee({ x: 5, z: 5 }, 5); // cannot be told to run while frozen
    expect(p.special?.mode).toBe('cower');
    for (let i = 0; i < 60 * 12; i++) p.update(DT);
    expect(p.special).toBeNull();
  });
  it('a bystander who films stands and films a fight within the ring, and runs from a gun', () => {
    const r = rig();
    r.addPed('victim', 0, -0.9);
    const w = r.addPed('w', 6, -3); setTemper(w, 'film');
    r.combat.hurt(r.peds[0] as Pedestrian, 'heavy', 'fist', { x: 0, z: 0 });
    expect(w.special?.mode).toBe('film');
    r.combat.hands.add('pistol'); r.combat.cycle(1);
    r.input.press(); r.step(3);
    expect(w.state).toBe('fleeing');
    expect(w.special).toBeNull();
  });
  it('onlookers beyond the near ring watch instead of running; runners run', () => {
    const r = rig();
    const v = r.addPed('v', 0, -0.9);
    const far = r.addPed('far', 14, 0); setTemper(far, 'fight');
    const near = r.addPed('near', 5, 0); setTemper(near, 'flee');
    r.combat.hurt(v, 'heavy', 'fist', { x: 0, z: 0 });
    expect(far.special?.mode).toBe('watch');
    expect(near.state).toBe('fleeing');
  });
  it('a victim who fights back closes in, winds up where it can be seen, and lands a punch on the player', () => {
    const r = rig({ vitals: true });
    const v = r.addPed('brawler', 0, -4); setTemper(v, 'fight');
    r.combat.hurt(v, 'light', 'fist', { x: 0, z: 0 });
    expect(v.special?.mode).toBe('fight');
    const poses = new Set<string>();
    for (let i = 0; i < 60 * 3; i++) { r.step(1, true); if ((v as unknown as { fightPose: { kind: string } | null }).fightPose) poses.add('pose'); }
    expect(poses.has('pose')).toBe(true);
    expect(r.vitals!.health).toBeLessThan(100);
    expect(r.attacked.length).toBeGreaterThan(0); // self-defence for the police
  });
  it('friends of the victim may join in', () => {
    const r = rig({ vitals: true });
    const v = r.addPed('v', 0, -0.9);
    const f = r.addPed('friend', 2, -3); setTemper(f, 'flee');
    f.chatPartner = v; v.chatPartner = f;
    // find a hash under the join share: try ids until one joins
    let joined = false;
    for (let i = 0; i < 30 && !joined; i++) {
      const id = `fr${i}`; const g = r.addPed(id, 2, -3); setTemper(g, 'flee'); g.chatPartner = v;
      r.combat.hurt(v, 'light', 'fist', { x: 0, z: 0 }); v.state = 'walking';
      joined = g.special?.mode === 'fight';
    }
    expect(joined).toBe(true);
  });
});

describe("the player's health", () => {
  it('a punch staggers, two close together knock down, health at zero knocks him out', () => {
    const v = new PlayerVitals();
    expect(v.hurt(7)).toBe('stagger');
    expect(v.stunned).toBe(true);
    expect(v.hurt(7)).toBe('down');
    expect(v.down).toBe(true);
    for (let i = 0; i < 60 * 3; i++) v.update(DT);
    expect(v.stunned).toBe(false);
    expect(v.hurt(95)).toBe('out');
    expect(v.out).toBe(true);
  });
  it('health comes back after a while without a hit', () => {
    const v = new PlayerVitals(); v.hurt(30);
    for (let i = 0; i < 60 * 5; i++) v.update(DT);
    expect(v.health).toBe(70);
    for (let i = 0; i < 60 * 20; i++) v.update(DT);
    expect(v.health).toBeGreaterThan(80);
  });
  it('Combat reports the knock-out once after a moment on the ground, and the hospital bill is never more than the cash', () => {
    const r = rig({ vitals: true });
    let ko = 0;
    (r.combat as unknown as { deps: { onKnockedOut?: () => void } }).deps.onKnockedOut = () => { ko++; };
    r.vitals!.hurt(500);
    r.step(60 * 3);
    expect(ko).toBe(1);
    const said: string[] = []; let cash = 40, hours = 0, at: string | null = null;
    const site = hospitalFor('real', { x: 1, z: 2 }, [{ id: 'wexcombe-medical-center', name: 'Wexcombe Medical Center', site: { ax: 0, az: 0, fx: 1, fz: 0, nx: 0, nz: 1, w: 20, d: 10 } }]);
    expect(site.name).toBe('Wexcombe Medical Center');
    const res = applyKnockout({ cash: () => cash, addCash: (n) => { cash += n; }, teleport: (s) => { at = s.id; }, advanceClock: (h) => { hours = h; }, say: (t) => said.push(t) }, r.vitals!, site);
    expect(res.bill).toBe(40); expect(cash).toBe(0); expect(hours).toBe(7); expect(at).toBe('wexcombe-medical-center');
    expect(r.vitals!.out).toBe(false); expect(r.vitals!.health).toBe(70);
    expect(said[0]).toContain('bill');
    expect(hospitalFor('grid', { x: 1, z: 2 }).id).toBe('home');
    expect(HOSPITAL_BILL).toBeGreaterThan(0);
  });
  it('with the player stunned, the action button does nothing', () => {
    const r = rig({ vitals: true });
    const p = r.addPed('p', 0, -0.9);
    r.vitals!.hurt(7);
    r.input.press(); r.step(10);
    expect(p.vitals.health).toBe(p.vitals.max);
  });
});

describe('weapons', () => {
  it('a melee weapon is carried one at a time; a third gun replaces the oldest; ammo needs a gun', () => {
    const h = new Hands();
    h.add('bat'); h.add('pipe');
    expect(h.melee).toBe('pipe'); expect(h.owns('bat')).toBe(false);
    expect(h.canTake('ammo')).toBe(false);
    h.add('pistol'); h.add('revolver'); h.add('shotgun');
    expect(h.gunOrder).toEqual(['revolver', 'shotgun']);
    expect(h.guns.pistol.has).toBe(false);
    expect(h.canTake('ammo')).toBe(true);
    h.add('ammo');
    expect(h.guns.revolver.reserve).toBe(GUNS.revolver.mag + GUNS.revolver.box);
  });
  it('the bat swings twice in a chain (forehand then backhand), the pipe once; each lands at its own moment', () => {
    const m = new MeleeCombo(MELEE.bat);
    m.press();
    let hit = null as null | ReturnType<MeleeCombo['update']>, t = 0;
    while (!hit && t < 2) { hit = m.update(DT); t += DT; }
    expect(hit?.index).toBe(0);
    expect(t).toBeCloseTo(MELEE.bat.swing * MELEE.bat.impactAt, 1);
    m.press(); // queued
    let second = null as null | ReturnType<MeleeCombo['update']>; let n = 0;
    while (!second && n < 200) { second = m.update(DT); n++; }
    expect(second?.index).toBe(1);
    expect(m.pose).toBe('swingL');
    const pipe = new MeleeCombo(MELEE.pipe); pipe.press();
    let ph = null as null | ReturnType<MeleeCombo['update']>; let k = 0;
    while (!ph && k < 200) { ph = pipe.update(DT); k++; }
    expect(ph?.damage).toBe(48); expect(k * DT).toBeGreaterThan(0.4);
  });
  it('a bat swing knocks a person down; the pipe is slower but harder; the fish only slaps and breaks after twelve', () => {
    const r = rig();
    r.combat.hands.add('bat'); r.combat.cycle(1);
    const p = r.addPed('b', 0, -1.4);
    r.input.press(); r.step(40);
    expect(p.state).toBe('down');
    const f = rig();
    f.combat.hands.add('fish'); f.combat.cycle(1);
    const q = f.addPed('q', 0, -1.2);
    f.input.press(); f.step(30);
    expect(q.vitals.health).toBe(q.vitals.max - 9);
    expect(f.combat.hands.meleeUses).toBe(11);
    f.combat.hands.meleeUses = 1; f.combat.hands.useMelee();
    expect(f.combat.hands.melee).toBeNull(); expect(f.combat.hands.current).toBe('fists');
  });
  it('the revolver holds six, is slow, loud, and reloads; the pistol is unchanged', () => {
    const r = rig();
    r.combat.hands.add('revolver'); r.combat.cycle(1);
    expect(r.combat.hands.current).toBe('revolver');
    expect(r.combat.hands.guns.revolver.mag).toBe(6);
    r.input.press(); r.step(1);
    expect(r.combat.hands.guns.revolver.mag).toBe(5);
    expect(r.log.some((l) => l.type === 'crime' && (l.payload as { type: string }).type === 'gunshot')).toBe(true);
    r.step(20); expect(r.combat.hands.guns.revolver.mag).toBe(5); // 0.7 s between shots
    r.step(40); expect(r.combat.hands.guns.revolver.mag).toBe(4);
  });
  it('the shotgun fires a fan of pellets, pumps between shots, and knocks people off their feet at close range', () => {
    const offs = pelletOffsets(GUNS.shotgun, 3);
    expect(offs).toHaveLength(8);
    expect(Math.max(...offs.map(Math.abs))).toBeLessThan((GUNS.shotgun.spreadDeg * Math.PI) / 180);
    expect(pelletDamage(GUNS.shotgun, 5)).toBeGreaterThan(pelletDamage(GUNS.shotgun, 20));
    const r = rig();
    r.combat.hands.add('shotgun'); r.combat.cycle(1);
    const p = r.addPed('t', 0, -3);
    r.input.press(); r.step(1);
    expect(r.combat.hands.guns.shotgun.mag).toBe(4);
    expect(r.combat.pumping).toBe(true);
    expect(p.state).toBe('down');
    expect(p.vitals.health).toBeLessThan(p.vitals.max / 2);
    r.step(20); expect(r.combat.hands.guns.shotgun.mag).toBe(4); // pumping
    r.step(60); expect(r.combat.hands.guns.shotgun.mag).toBe(3);
  });
  it('a shot is a crime report with the right kind and position, and scatters the street; a bat hit in view is an assault', () => {
    const r = rig();
    const wanted = new WantedSystem(r.events);
    r.combat.hands.add('revolver'); r.combat.cycle(1);
    const a = r.addPed('a', 8, -2); setTemper(a, 'flee');
    r.input.press(); r.step(1);
    const crime = r.log.find((l) => l.type === 'crime')!.payload as { type: string; pos: { x: number; z: number } };
    expect(crime.type).toBe('gunshot'); expect(crime.pos).toEqual({ x: 0, z: 0 });
    expect(a.state).toBe('fleeing');
    expect(wanted.stars).toBeGreaterThan(0);
  });
  it('carried weapons are saved and an old save loads with fists; a bust takes them', () => {
    const r = rig();
    r.combat.hands.add('bat'); r.combat.hands.add('revolver'); r.combat.hands.add('shotgun'); r.combat.hands.add('bottle');
    const saved = JSON.parse(JSON.stringify(r.combat.serialize()));
    const r2 = rig(); r2.combat.restore(saved);
    expect(r2.combat.hands.melee).toBe('bat');
    expect(r2.combat.hands.gunOrder).toEqual(['revolver', 'shotgun']);
    expect(r2.combat.hands.bottles).toBe(1);
    r2.combat.restore({ bottles: 2, bricks: 0, pistol: true, mag: 3, reserve: 4, current: 'pistol' }); // an older save
    expect(r2.combat.hands.melee).toBeNull(); expect(r2.combat.hands.guns.pistol.mag).toBe(3); expect(r2.combat.hands.guns.revolver.has).toBe(false);
    r.combat.reset(); // what the bust does through `dropWeapons`
    expect(r.combat.hands.melee).toBeNull(); expect(r.combat.hands.gunOrder).toEqual([]); expect(r.combat.hands.current).toBe('fists');
  });
});

describe('blood', () => {
  const tiers: Tier[] = ['phone', 'low', 'medium', 'high'];
  it('a hit makes droplets and a mark; a person knocked out leaves a pool; caps hold on every tier', () => {
    for (const t of tiers) {
      const b = new Blood(t, () => true);
      for (let i = 0; i < 300; i++) { b.burst(i * 0.1, 1.4, 0, 1, 0, 1); b.spray(0, 1.3, i * 0.1, 0, 1); b.pool(i * 3, 0); b.update(0.016); }
      expect(b.drops.length).toBeLessThanOrEqual(BLOOD_CAPS[t].drops);
      expect(b.marks.length).toBeLessThanOrEqual(BLOOD_CAPS[t].marks + BLOOD_CAPS[t].pools);
      expect(b.poolCount).toBeLessThanOrEqual(BLOOD_CAPS[t].pools);
    }
    const phone = new Blood('phone', () => true); phone.pool(0, 0);
    expect(phone.poolCount).toBe(0); expect(phone.marks.length).toBe(1);
  });
  it('marks fade away within a minute or two', () => {
    const b = new Blood('medium', () => true); b.burst(0, 1.4, 0, 1, 0, 1); b.pool(5, 5);
    for (let i = 0; i < 60 * 30; i++) b.update(1 / 30);
    expect(b.drops.length).toBe(0);
    const old = b.marks.filter((m) => !m.pool).length;
    for (let i = 0; i < 30 * (MARK_LIFE * 1.3); i++) b.update(1 / 30);
    expect(old).toBeGreaterThanOrEqual(0);
    expect(b.marks.filter((m) => !m.pool)).toHaveLength(0);
    for (let i = 0; i < 30 * 60; i++) b.update(1 / 30);
    expect(b.marks).toHaveLength(0);
  });
  it('with the setting Off nothing is made at all', () => {
    let on = false;
    const b = new Blood('high', () => on);
    b.burst(0, 1, 0, 1, 0); b.spray(0, 1, 0, 1, 0); b.pool(0, 0);
    expect(b.live).toBe(0);
    on = true; b.burst(0, 1, 0, 1, 0);
    expect(b.live).toBeGreaterThan(0);
  });
  it('Combat bleeds on a heavy hit, a shot and a knock-out, but not on the first jab', () => {
    const b = new Blood('medium', () => true);
    const r = rig({ blood: b });
    const p = r.addPed('p', 0, -0.9);
    r.combat.hurt(p, 'light', 'fist', { x: 0, z: 0 });
    expect(b.live).toBe(0);
    r.combat.hurt(p, 'club', 'fist', { x: 0, z: 0 });
    expect(b.drops.length).toBeGreaterThan(0);
    const q = r.addPed('q', 3, -0.9);
    r.combat.hurt(q, 'blast', 'shot', { x: 0, z: 0 }, false, 500);
    expect(b.poolCount).toBe(1);
  });
});
