import { describe, expect, it } from 'vitest';
import '@/textures/painters/ped';
import { StoryPeople, inHours, type PlacementHost, type Station, type StoryPed } from '@/game/story/cast/placement';
import type { CastId } from '@/game/story/cast/types';

class FakePed implements StoryPed {
  body = { pos: { x: 0, z: 0 }, heading: 0 };
  state = 'sitting'; special: unknown = null; vitals = { immune: false }; held = true; downFor = 0; updates = 0;
  get isHeld(): boolean { return this.held; }
  holdAt(x: number, z: number, h: number): void { this.body.pos = { x, z }; this.body.heading = h; this.state = 'sitting'; this.held = true; }
  update(dt: number): void { this.updates++; if (this.state === 'down') { this.downFor -= dt; if (this.downFor <= 0) { this.state = 'walking'; this.held = false; } } }
  knock(t: number): void { this.state = 'down'; this.held = false; this.downFor = t; }
}
function rig() {
  const log = { created: [] as string[], destroyed: 0 }, ctx = { player: { x: 0, z: 0 }, active: 'pedro' as CastId, clear: true };
  const host: PlacementHost = {
    create: (m, vid, _i, at) => { log.created.push(`${m.id}:${vid}`); const p = new FakePed(); p.body.pos = { x: at.x, z: at.z }; return p; },
    destroy: () => { log.destroyed++; },
    stationFor: (v, k) => (v === 'bar-2' ? { x: 40, z: 0, heading: 1 } : v === 'club' ? { x: 500, z: 0, heading: 0 } : null),
    isClear: () => ctx.clear, playerPos: () => ctx.player, activeCast: () => ctx.active,
  };
  return { sp: new StoryPeople(host), log, ctx };
}
describe('CAST: story people in the world', () => {
  it('places a named person at a spot, once: a second place() returns the same one', () => {
    const { sp, log } = rig();
    const a = sp.place('stavros', { at: { x: 5, z: 5, heading: 0 } });
    expect(a).toMatchObject({ ok: true, already: false });
    const b = sp.place('stavros', { at: { x: 6, z: 5, heading: 0 } });
    expect(b).toMatchObject({ ok: true, already: true });
    expect(log.created.length).toBe(1);
    expect(sp.count).toBe(1);
    expect(sp.hittables().length).toBe(1);
    expect(log.created[0].startsWith('stavros:cast-stavros-')).toBe(true);
  });
  it('refuses unknown people, the character the player is, a blocked spot, a person with no spot', () => {
    const { sp, ctx } = rig();
    expect(sp.place('nobody')).toEqual({ ok: false, reason: 'unknown' });
    expect(sp.place('pedro', { at: { x: 0, z: 0, heading: 0 } })).toEqual({ ok: false, reason: 'isPlayer' });
    expect(sp.place('akira')).toEqual({ ok: false, reason: 'noSpot' });
    ctx.clear = false; expect(sp.place('akira', { at: { x: 1, z: 1, heading: 0 } })).toEqual({ ok: false, reason: 'blocked' });
    ctx.active = 'lana'; ctx.clear = true;
    expect(sp.place('pedro', { at: { x: 0, z: 0, heading: 0 } }).ok).toBe(true);
    expect(sp.place('lana', { at: { x: 0, z: 0, heading: 0 } })).toEqual({ ok: false, reason: 'isPlayer' });
  });
  it('is immune by default so a story person is never knocked out; a mission can turn that off', () => {
    const { sp } = rig();
    const a = sp.place('dom', { at: { x: 1, z: 1, heading: 0 } }); const b = sp.place('augie', { at: { x: 3, z: 3, heading: 0 }, immune: false });
    expect(a.ok && a.ped.vitals.immune).toBe(true); expect(b.ok && b.ped.vitals.immune).toBe(false);
  });
  it('after a knock-down they stand where they got up, and the station follows them within 4 m', () => {
    const { sp } = rig();
    const r = sp.place('dom', { at: { x: 10, z: 0, heading: 0 } }); if (!r.ok) throw new Error('place');
    const ped = r.ped as FakePed;
    ped.knock(2); ped.body.pos = { x: 12, z: 1 };
    for (let i = 0; i < 30; i++) sp.update(0.1);
    expect(ped.state).toBe('sitting'); expect(ped.isHeld).toBe(true);
    expect(ped.body.pos).toEqual({ x: 12, z: 1 });
  });
  it('a person who ran far stays where they stopped until the player is 40 m away, then is back at the station', () => {
    const { sp, ctx } = rig();
    const r = sp.place('dom', { at: { x: 10, z: 0, heading: 0 } }); if (!r.ok) throw new Error('place');
    const ped = r.ped as FakePed;
    ped.knock(1); ped.body.pos = { x: 30, z: 0 };
    for (let i = 0; i < 20; i++) sp.update(0.1);
    expect(ped.body.pos.x).toBe(30);
    ctx.player = { x: 100, z: 0 };
    sp.update(0.1);
    expect(ped.body.pos).toEqual({ x: 10, z: 0 });
  });
  it('the hour places people at their usual venue near the player and removes them when the player leaves', () => {
    const { sp, ctx, log } = rig();
    sp.autoSchedule(true); sp.setClock(20, 3);
    ctx.player = { x: 30, z: 0 };
    sp.update(0.1);
    expect(sp.isPlaced('stavros')).toBe(true);         // bar-2 booth 15..24
    expect(sp.isPlaced('pedro')).toBe(false);           // the player
    expect(log.created.some((c) => c.startsWith('stavros:'))).toBe(true);
    sp.update(0.1); expect(log.created.filter((c) => c.startsWith('stavros:')).length).toBe(1);
    ctx.player = { x: 400, z: 0 }; sp.update(0.1);
    expect(sp.isPlaced('stavros')).toBe(false); expect(log.destroyed).toBe(1);
    sp.setClock(10, 3); ctx.player = { x: 30, z: 0 }; sp.update(0.1);
    expect(sp.isPlaced('stavros')).toBe(false);          // out of hours
  });
  it('a person placed by a mission is kept when the hours end', () => {
    const { sp, ctx } = rig();
    sp.autoSchedule(true); sp.setClock(20, 3); ctx.player = { x: 30, z: 0 };
    sp.place('stavros', { venue: 'bar-2', station: 'booth', keep: true });
    sp.setClock(10, 3); sp.update(0.1);
    expect(sp.isPlaced('stavros')).toBe(true);
  });
  it('the interaction prompt appears within 2.4 m of a standing person and hands off to the dialogue', () => {
    const { sp } = rig(); const talked: string[] = [];
    sp.onTalk((id) => talked.push(id));
    const r = sp.place('akira', { at: { x: 10, z: 0, heading: 0 } }); if (!r.ok) throw new Error('place');
    expect(sp.prompt({ x: 20, z: 0 })).toBeNull();
    expect(sp.prompt({ x: 12, z: 0 })).toMatchObject({ id: 'akira', text: 'Talk to Akira' });
    expect(sp.talk({ x: 12, z: 0 })).toBe('akira'); expect(talked).toEqual(['akira']);
    (r.ped as FakePed).knock(5); sp.update(0.01);
    expect(sp.prompt({ x: 12, z: 0 })).toBeNull();       // not while down
  });
  it('occupied() lets the car spawner skip a spot; remove() frees the person', () => {
    const { sp } = rig();
    sp.place('winston', { at: { x: 4, z: 4, heading: 0 } });
    expect(sp.occupied({ x: 5, z: 4 }, 2)).toBe(true); expect(sp.occupied({ x: 50, z: 4 }, 2)).toBe(false);
    expect(sp.remove('winston')).toBe(true); expect(sp.isPlaced('winston')).toBe(false); expect(sp.remove('winston')).toBe(false);
  });
  it('inHours handles windows that pass midnight', () => {
    expect(inHours(23, [22, 27])).toBe(true); expect(inHours(2, [22, 27])).toBe(true); expect(inHours(4, [22, 27])).toBe(false); expect(inHours(12, [8, 11])).toBe(false);
  });
});
void (null as unknown as Station);
