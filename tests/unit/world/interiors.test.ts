import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Interiors, FADE_SECONDS, type InteriorsDeps } from '@/world/interiors/Interiors';
import { CLUB_SLOT_FLAG, CLUB_UNLOCK_FLAG, INTERIORS, doorTrigger, isClubHours, isClubOpen } from '@/world/interiors/defs';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { World2D } from '@/physics/World2D';

const mat = new THREE.MeshBasicMaterial();
const materials = { get: () => mat, awning: () => mat, sign: () => mat, carPaint: () => mat, setNight: () => undefined } as never;

function make(hour = 12, overrides: Partial<InteriorsDeps> = {}) {
  const hourRef = { v: hour };
  const log: string[] = []; const msgs: string[] = []; const actions: unknown[] = []; const tele: Array<[number, number, number]> = [];
  const inventory = new Inventory(PROCEDURAL_RECORDS, null);
  const world = new World2D();
  const it = new Interiors({
    scene: new THREE.Group(), world, materials, inventory, getHour: () => hourRef.v,
    teleport: (x, z, h) => tele.push([x, z, h]),
    events: { emit: (t, p) => log.push(`${t}:${JSON.stringify(p)}`) },
    onMessage: (m) => msgs.push(m), onAction: (a) => actions.push(a),
    ...overrides,
  });
  const run = (sec: number) => { for (let t = 0; t < sec; t += 0.02) it.update(0.02); };
  return { it, hourRef, log, msgs, actions, tele, inventory, run, world };
}
const at = (id: keyof typeof INTERIORS) => doorTrigger(INTERIORS[id]);

describe('club hours gate', () => {
  it('opens 23:00 to 04:00 only', () => {
    for (const [h, open] of [[22.99, false], [23, true], [23.5, true], [0, true], [3.99, true], [4, false], [12, false], [-1, true], [25, true]] as const) expect(isClubHours(h)).toBe(open);
  });
  it('needs the password flag as well', () => {
    expect(isClubOpen(0, false)).toBe(false);
    expect(isClubOpen(0, true)).toBe(true);
    expect(isClubOpen(12, true)).toBe(false);
  });
  it('the unmarked door gives no prompt until flagged, then says closed by day and enter at night', () => {
    const t = make(0);
    expect(t.it.prompt(at('club'))).toBe('');
    expect(t.it.tryEnter(at('club'))).toBe(false);
    t.inventory.setFlag(CLUB_UNLOCK_FLAG);
    expect(t.it.prompt(at('club'))).toBe('F  Enter AFTERSLOTH');
    t.hourRef.v = 14;
    expect(t.it.prompt(at('club'))).toContain('Closed');
    expect(t.it.tryEnter(at('club'))).toBe(false);
    expect(t.msgs.at(-1)).toContain('locked');
    expect(t.it.state).toBe('outside');
    t.hourRef.v = 23.5;
    expect(t.it.tryEnter(at('club'))).toBe(true);
  });
});

describe('interior state machine', () => {
  it('walks outside -> fadingIn -> inside -> fadingOut -> outside with teleports at full black', () => {
    const t = make(12);
    expect(t.it.prompt(at('deli'))).toBe('F  Enter WAX DELI');
    expect(t.it.prompt({ x: 0, z: 0 })).toBe('');
    expect(t.it.tryEnter(at('deli'))).toBe(true);
    expect(t.it.state).toBe('fadingIn'); expect(t.it.locked).toBe(true);
    expect(t.it.tryEnter(at('deli'))).toBe(false); // busy
    t.run(FADE_SECONDS * 0.5);
    expect(t.tele.length).toBe(0);
    t.run(FADE_SECONDS * 0.8);
    expect(t.tele.length).toBe(1);
    const o = INTERIORS.deli.origin;
    expect(Math.abs(t.tele[0][0] - o.x)).toBeLessThan(INTERIORS.deli.w / 2);
    expect(Math.abs(t.tele[0][1] - o.z)).toBeLessThan(INTERIORS.deli.d / 2);
    expect(t.it.fade).toBeGreaterThan(0.5);
    t.run(FADE_SECONDS * 1.5);
    expect(t.it.state).toBe('inside'); expect(t.it.current).toBe('deli'); expect(t.it.fade).toBe(0);
    expect(t.log[0]).toBe('interior:entered:{"id":"deli"}');
    // exit
    expect(t.it.exit()).toBe(true);
    expect(t.it.exit()).toBe(false);
    t.run(FADE_SECONDS * 2.2);
    expect(t.it.state).toBe('outside'); expect(t.it.current).toBeNull();
    const d = INTERIORS.deli.door;
    expect(t.tele[1][0]).toBeCloseTo(d.x + d.outX * 1.9, 5);
    expect(t.log[1]).toBe('interior:exited:{"id":"deli"}');
  });
  it('rooms are far off the map and enclosed by wall colliders', () => {
    for (const id of ['deli', 'club', 'home'] as const) {
      const t = make(0);
      t.inventory.setFlag(CLUB_UNLOCK_FLAG);
      t.it.tryEnter(at(id)); t.run(1);
      expect(INTERIORS[id].origin.x).toBeGreaterThan(1000);
      const o = INTERIORS[id].origin; const { w, d } = INTERIORS[id];
      // a ray from the room centre in all four directions hits a wall before leaving the room
      for (const dir of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
        const hit = t.world.raycast({ x: o.x + 0.01, z: o.z + 0.01 }, dir, 40);
        expect(hit, `${id} ${dir.x},${dir.z}`).not.toBeNull();
        expect(hit!.dist).toBeLessThanOrEqual(Math.max(w, d) / 2 + 0.2);
      }
    }
  });
  it('interior spots: exit prompt, owner talk, shop action, home decks, bar spends cash', () => {
    const t = make(12);
    t.it.tryEnter(at('deli')); t.run(1);
    const o = INTERIORS.deli.origin;
    const spawn = { x: o.x, z: o.z + INTERIORS.deli.d / 2 - 1.5 };
    expect(t.it.prompt(spawn)).toBe('F  Leave');
    expect(t.it.interact({ x: o.x - 2.2, z: o.z - 0.4 })).toBe(true);
    expect(t.actions.at(-1)).toEqual({ kind: 'shop', interior: 'deli' });
    t.it.interact({ x: o.x + 2.6, z: o.z + 0.5 });
    expect(t.msgs.at(-1)).toContain('Owner');
    expect(t.it.interact(spawn)).toBe(true); // F on the exit spot leaves
    expect(t.it.state).toBe('fadingOut');
    t.run(1);

    const h = make(12);
    h.it.tryEnter(at('home')); h.run(1);
    const ho = INTERIORS.home.origin;
    const decks = h.it.prompt({ x: ho.x + 2.6, z: ho.z - INTERIORS.home.d / 2 + 1.65 });
    expect(decks).toContain('turntables');
    h.it.interact({ x: ho.x + 2.6, z: ho.z - INTERIORS.home.d / 2 + 1.65 });
    expect(h.actions.at(-1)).toEqual({ kind: 'dj', interior: 'home', venue: 'home' });
  });
  it('the club booth needs a slot, the bar costs $6', () => {
    const t = make(0);
    t.inventory.setFlag(CLUB_UNLOCK_FLAG);
    t.it.tryEnter(at('club')); t.run(1);
    const o = INTERIORS.club.origin; const { d, w } = INTERIORS.club;
    const booth = { x: o.x, z: o.z - d / 2 + 1.0 + 1.4 };
    t.it.interact(booth);
    expect(t.actions.length).toBe(0); expect(t.msgs.at(-1)).toContain('Slots');
    t.inventory.setFlag(CLUB_SLOT_FLAG);
    t.it.interact(booth);
    expect(t.actions.at(-1)).toEqual({ kind: 'dj', interior: 'club', venue: 'aftersloth' });
    const cash = t.inventory.cash;
    t.it.interact({ x: o.x + w / 2 - 2.0, z: o.z + 1.4 });
    expect(t.inventory.cash).toBe(cash - 6);
  });
  it('the club has 12 to 20 dancers and animates on the beat without errors', () => {
    const t = make(0);
    t.inventory.setFlag(CLUB_UNLOCK_FLAG);
    t.it.tryEnter(at('club')); t.run(1);
    let n = 0;
    (t.it as unknown as { rooms: Map<string, { dancers: number }> }).rooms.forEach((r) => { n = r.dancers; });
    expect(n).toBeGreaterThanOrEqual(12); expect(n).toBeLessThanOrEqual(20);
    for (let i = 0; i < 200; i++) t.it.update(0.016, { phase: (i % 30) / 30, bpm: 124, level: 0.8 });
  });
});
