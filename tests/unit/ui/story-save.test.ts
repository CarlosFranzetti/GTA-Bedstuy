// @vitest-environment jsdom
/**
 * Story state through the game save: the v3 `story` field round-trips branch flags, fork choices and heard news; v2 saves
 * (no story block) still load; junk story blocks are dropped without killing the save.
 */
import { describe, it, expect } from 'vitest';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';
import { StoryState } from '@/game/story/StoryState';
import { F } from '@/game/story/flags';
import { SAVE_VERSION, SaveManager, SaveStore, applySave, captureSave, migrateSave, type SaveParts } from '@/ui/GameSave';

const defs: MissionDef[] = [{
  id: 'm1', title: 'M1', blurb: 'b', giverPoi: 'x', giver: { x: 0, z: 0 }, triggerRadius: 3,
  objectives: [{ kind: 'timer', seconds: 1, text: 't' }], reward: { cash: 10, message: 'ok' }, setFlags: ['story.act1'],
}];

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};

function parts(missions: MissionSystem): SaveParts {
  const live = { x: 1, z: 2 };
  return {
    getPose: () => ({ x: live.x, z: live.z, heading: 0, inCar: false }), setPose: (p) => { live.x = p.x; live.z = p.z; },
    getHour: () => 8, setHour: () => undefined, getDay: () => 0, setDay: () => undefined,
    inventory: new Inventory(PROCEDURAL_RECORDS, null),
    missions, phone: { serialize: () => ({ v: 1 }), restore: () => true },
    getWanted: () => 0, setWanted: () => undefined, getWeather: () => 'dry', setWeather: () => undefined,
    getStation: () => 's', setStation: () => undefined, getLook: () => null, setLook: () => undefined, getStreet: () => 'Throop Ave',
  };
}

describe('StoryState', () => {
  it('sets flags, remembers fork choices, tests rules, and counts the way you lean', () => {
    const s = new StoryState();
    expect(s.isEmpty).toBe(true);
    s.choose('back-rent', F.ODETTE_FIXER);
    s.choose('repo-fork', F.TAY_RETURNED);
    s.set(F.ACT1);
    expect(s.has(F.ODETTE_FIXER)).toBe(true);
    expect(s.choiceOf('back-rent')).toBe(F.ODETTE_FIXER);
    expect(s.choiceOf('nope')).toBeNull();
    expect(s.test({ flag: F.ODETTE_FIXER, not: F.ODETTE_PAID })).toBe(true);
    expect(s.test({ flag: F.ODETTE_PAID })).toBe(false);
    expect(s.test({ not: F.ACT1 })).toBe(false);
    expect(s.test(undefined)).toBe(true);
    expect(s.alignment).toEqual({ hustle: 1, loyalty: 1, sellout: 0 });
    expect(s.set(F.ACT1)).toBe(false);
  });

  it('serializes and restores exactly, and rejects malformed blocks without touching state', () => {
    const a = new StoryState();
    a.choose('ending', F.END_TRUST); a.markNews('n-fire');
    const copy = JSON.parse(JSON.stringify(a.serialize()));
    const b = new StoryState();
    b.set('keep.me');
    expect(b.restore({ v: 2 })).toBe(false);
    expect(b.restore({ v: 1, flags: [1], choices: {}, seenNews: [] })).toBe(false);
    expect(b.restore({ v: 1, flags: [], choices: { a: 5 }, seenNews: [] })).toBe(false);
    expect(b.has('keep.me')).toBe(true);
    expect(b.restore(copy)).toBe(true);
    expect(b.has('keep.me')).toBe(false);
    expect(b.has(F.END_TRUST)).toBe(true);
    expect(b.choiceOf('ending')).toBe(F.END_TRUST);
    expect(b.newsSeen('n-fire')).toBe(true);
  });
});

describe('GameSave v3: story field', () => {
  it('captures the story block and applies it to a fresh game', () => {
    expect(SAVE_VERSION).toBe(3);
    const m1 = new MissionSystem(defs);
    m1.story.choose('back-rent', F.ODETTE_PAID);
    m1.story.set(F.ACT2);
    const snap = JSON.parse(JSON.stringify(captureSave(parts(m1), 99)));
    expect(snap.v).toBe(3);
    expect(snap.story).toMatchObject({ v: 1, flags: expect.arrayContaining([F.ODETTE_PAID, F.ACT2]), choices: { 'back-rent': F.ODETTE_PAID } });
    const m2 = new MissionSystem(defs);
    applySave(parts(m2), migrateSave(snap)!);
    expect(m2.story.has(F.ODETTE_PAID)).toBe(true);
    expect(m2.story.has(F.ACT2)).toBe(true);
    expect(m2.story.choiceOf('back-rent')).toBe(F.ODETTE_PAID);
  });

  it('round trips through a SaveManager slot and an exported file', () => {
    const m1 = new MissionSystem(defs);
    m1.story.choose('ending', F.END_LANDLORD);
    const mgr = new SaveManager(new SaveStore(memStore()));
    mgr.bind(parts(m1));
    expect(mgr.save('slot1', 5)).toBe(true);
    const text = mgr.exportSlot('slot1')!;
    expect(JSON.parse(text).v).toBe(3);
    const m2 = new MissionSystem(defs);
    const mgr2 = new SaveManager(new SaveStore(memStore()));
    mgr2.bind(parts(m2));
    expect(mgr2.importInto('slot2', text)).toBe(true);
    expect(mgr2.load('slot2')).toBe(true);
    expect(m2.story.has(F.END_LANDLORD)).toBe(true);
  });

  it('a v2 save (no story block) migrates and loads; mission progress still restores', () => {
    const v2 = { v: 2, savedAt: 7, pose: { x: 5, z: 6, heading: 0, inCar: false }, hour: 9, cash: 50, missions: { v: 1, completed: ['m1'], cash: 10 } };
    const s = migrateSave(v2)!;
    expect(s.v).toBe(3);
    expect(s.story).toBeUndefined();
    const m = new MissionSystem(defs);
    applySave(parts(m), s);
    expect(m.isCompleted('m1')).toBe(true);
    expect(m.story.has('story.act1')).toBe(true); // setFlags of completed missions are re-derived
  });

  it('a malformed story block is dropped and the rest of the save loads', () => {
    const bad = migrateSave({ v: 3, savedAt: 1, pose: { x: 1, z: 2, heading: 0 }, hour: 3, story: { v: 7, flags: 'no' } })!;
    expect(bad.story).toBeUndefined();
    const noisy = migrateSave({ v: 3, savedAt: 1, pose: { x: 1, z: 2, heading: 0 }, hour: 3, story: { v: 1, flags: ['ok', 5, ''], choices: { a: 'b', c: 3 }, seenNews: ['n'] } })!;
    expect(noisy.story).toEqual({ v: 1, flags: ['ok'], choices: { a: 'b' }, seenNews: ['n'] });
  });

  it('the mission save embeds the story so the standalone mission key restores it too', () => {
    const m1 = new MissionSystem(defs);
    m1.story.choose('alvin-fork', F.ALVIN_EXPOSED);
    const raw = JSON.parse(JSON.stringify(m1.serialize()));
    expect(raw.story.flags).toContain(F.ALVIN_EXPOSED);
    const m2 = new MissionSystem(defs);
    expect(m2.restore(raw)).toBe(true);
    expect(m2.story.has(F.ALVIN_EXPOSED)).toBe(true);
    expect(new MissionSystem(defs).serialize()).toEqual({ v: 1, completed: [], cash: 0 }); // fresh game: nothing extra on disk
  });
});
