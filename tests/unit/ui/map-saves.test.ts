// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import {
  SaveManager, SaveStore, SAVE_PREFIX, REAL_SAVE_PREFIX, LEGACY_SAVE_KEY, CARRY_OVER_HOUR, savePrefix, poseOnMap,
  type SaveParts, type SavePose, type PlayerLook,
} from '@/ui/GameSave';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
};

function world(map: 'grid' | 'real') {
  const live = {
    pose: { x: 10, z: 20, heading: 1.5, inCar: false, map } as SavePose,
    hour: 9.5, day: 2, wanted: 0, weather: 'dry', station: 'Static FM', look: { seed: 77 } as PlayerLook | null,
    mission: { v: 1, completed: ['a'] } as unknown, phoneData: { v: 1 } as unknown, story: { v: 1, flags: [], choices: {}, seenNews: [] } as unknown,
  };
  const inventory = new Inventory(PROCEDURAL_RECORDS, null);
  const parts: SaveParts = {
    getPose: () => ({ ...live.pose }), setPose: (p) => { live.pose = { ...poseOnMap(p, map, { x: 100, z: -50, heading: 0.3 }, { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }) }; },
    getHour: () => live.hour, setHour: (h) => { live.hour = h; },
    getDay: () => live.day, setDay: (d) => { live.day = d; },
    inventory,
    missions: { serialize: () => live.mission, restore: (d) => { live.mission = d; return true; }, story: { serialize: () => live.story, restore: (d) => { live.story = d; return true; } } },
    phone: { serialize: () => live.phoneData, restore: (d) => { live.phoneData = d; return true; } },
    getWanted: () => live.wanted, setWanted: (n) => { live.wanted = n; },
    getWeather: () => live.weather, setWeather: (w) => { live.weather = w; },
    getStation: () => live.station, setStation: (s) => { live.station = s; },
    getLook: () => live.look, setLook: (l) => { live.look = l; },
    getStreet: () => 'Throop Ave',
  };
  return { live, inventory, parts };
}

describe('per-map save slots', () => {
  it('the grid keeps the original key prefix and the real map has its own', () => {
    expect(savePrefix('grid')).toBe(SAVE_PREFIX);
    expect(SAVE_PREFIX).toBe('gta-bedstuy.save.v2.');
    expect(savePrefix('real')).toBe(REAL_SAVE_PREFIX);
    expect(REAL_SAVE_PREFIX.startsWith(SAVE_PREFIX)).toBe(true);
    expect(REAL_SAVE_PREFIX).not.toBe(SAVE_PREFIX);
  });

  it('a save on one map is invisible on the other, in both directions', () => {
    const ms = memStore();
    const g = world('grid'); const gm = new SaveManager(new SaveStore(ms, 'grid')); gm.bind(g.parts);
    expect(gm.save('slot1')).toBe(true);
    expect([...ms.m.keys()]).toEqual([`${SAVE_PREFIX}slot1`]);
    const rm = new SaveManager(new SaveStore(ms, 'real'));
    expect(rm.slots().every((s) => s.empty)).toBe(true);
    const r = world('real'); rm.bind(r.parts); r.live.hour = 3;
    rm.save('slot2');
    expect(ms.m.has(`${REAL_SAVE_PREFIX}slot2`)).toBe(true);
    expect(gm.slot('slot2').empty).toBe(true);
    expect(gm.slot('slot1').empty).toBe(false);
    expect(rm.slot('slot1').empty).toBe(true);
  });

  it('old grid saves (written before the real map had slots) still load on the grid map', () => {
    const ms = memStore();
    ms.setItem(`${SAVE_PREFIX}auto`, JSON.stringify({ v: 2, savedAt: 5, pose: { x: 4, z: 6, heading: 0.5, inCar: false }, hour: 8, cash: 321 }));
    ms.setItem(LEGACY_SAVE_KEY, JSON.stringify({ x: 1, z: 2, heading: 0, hour: 5 }));
    const gm = new SaveManager(new SaveStore(ms, 'grid')); const w = world('grid'); gm.bind(w.parts);
    expect(gm.bootSave()?.cash).toBe(321);
    expect(gm.hasCarryOver).toBe(false);
    expect(gm.load('auto')).toBe(true);
    expect(w.inventory.cash).toBe(321);
    // the default constructor argument is the grid, as before
    expect(new SaveStore(ms).get('auto')).not.toBeNull();
  });

  it('the legacy position-only key is a grid thing: the real map never boots from it', () => {
    const ms = memStore();
    ms.setItem(LEGACY_SAVE_KEY, JSON.stringify({ x: 1, z: 2, heading: 0, hour: 5 }));
    const rm = new SaveManager(new SaveStore(ms, 'real'));
    const b = rm.bootSave();
    // there is a grid save (the legacy one), so it is carried over: fresh pose, grid-tagged, hour reset
    expect(b?.pose.map).toBe('grid');
    expect(b?.hour).toBe(CARRY_OVER_HOUR);
  });

  it('a grid-only player arriving on the real map starts fresh with cash, records and look carried over', () => {
    const ms = memStore();
    const g = world('grid'); const gm = new SaveManager(new SaveStore(ms, 'grid')); gm.bind(g.parts);
    g.inventory.add(900);
    g.inventory.setFlag('some.mission.flag', true);
    g.live.pose = { x: 250, z: -300, heading: 2, inCar: true, vehicleType: 'sedan', map: 'grid' };
    g.live.hour = 2; g.live.day = 9; g.live.mission = { v: 1, completed: ['x', 'y', 'z'] }; g.live.wanted = 3;
    gm.save('slot1');
    const gridBefore = [...ms.m.entries()].sort().join('|');

    const rm = new SaveManager(new SaveStore(ms, 'real'));
    const boot = rm.bootSave();
    expect(boot).not.toBeNull();
    expect(rm.hasCarryOver).toBe(true);
    // the boot pose is a grid pose, so the real map puts the player at home, on foot, whatever the grid metres were
    const home = { x: 100, z: -50, heading: 0.3 };
    const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
    const p = poseOnMap(boot!.pose, 'real', home, bounds);
    expect(p).toMatchObject({ x: 100, z: -50, inCar: false, map: 'real' });
    expect(boot!.hour).toBe(CARRY_OVER_HOUR);

    const r = world('real'); rm.bind(r.parts);
    const startCash = r.inventory.cash;
    expect(rm.applyCarryOver(1000)).toBe(true);
    expect(rm.hasCarryOver).toBe(false);
    expect(r.inventory.cash).toBe(g.inventory.cash);
    expect(r.inventory.cash).toBeGreaterThan(startCash);
    expect(r.inventory.flags).not.toContain('some.mission.flag'); // mission flags do not cross
    expect(r.live.mission).toEqual({ v: 1, completed: ['a'] }); // untouched: the real map's own state
    expect(r.live.wanted).toBe(0);
    expect(r.live.day).toBe(2);
    // the first real autosave exists, in the real slots only
    expect(ms.m.has(`${REAL_SAVE_PREFIX}auto`)).toBe(true);
    // grid slots are byte-for-byte unchanged
    expect([...ms.m.entries()].filter(([k]) => !k.startsWith(REAL_SAVE_PREFIX)).sort().join('|')).toBe(gridBefore);
    // and the next boot on the real map uses its own save, with no second carry-over
    const rm2 = new SaveManager(new SaveStore(ms, 'real'));
    const b2 = rm2.bootSave();
    expect(rm2.hasCarryOver).toBe(false);
    expect(b2?.pose).toMatchObject({ map: 'real', x: 100, z: -50, inCar: false });
  });

  it('a fresh install on the real map has nothing to carry over', () => {
    const rm = new SaveManager(new SaveStore(memStore(), 'real'));
    expect(rm.bootSave()).toBeNull();
    expect(rm.hasCarryOver).toBe(false);
    expect(rm.applyCarryOver()).toBe(false);
  });

  it('a corrupt grid slot is not carried over; a real save beats any carry-over', () => {
    const ms = memStore();
    ms.setItem(`${SAVE_PREFIX}slot1`, '{not json');
    expect(new SaveManager(new SaveStore(ms, 'real')).bootSave()).toBeNull();
    ms.setItem(`${SAVE_PREFIX}slot2`, JSON.stringify({ v: 3, savedAt: 9, pose: { x: 1, z: 1, heading: 0, inCar: false }, hour: 4, cash: 50 }));
    ms.setItem(`${REAL_SAVE_PREFIX}slot1`, JSON.stringify({ v: 3, savedAt: 3, pose: { x: 7, z: 8, heading: 0, inCar: false, map: 'real' }, hour: 12, cash: 5 }));
    const rm = new SaveManager(new SaveStore(ms, 'real'));
    const b = rm.bootSave();
    expect(b?.cash).toBe(5);
    expect(rm.hasCarryOver).toBe(false);
  });

  it('deleting a slot only touches this map', () => {
    const ms = memStore();
    ms.setItem(`${SAVE_PREFIX}slot1`, JSON.stringify({ v: 3, savedAt: 1, pose: { x: 1, z: 1, heading: 0, inCar: false }, hour: 1 }));
    ms.setItem(`${REAL_SAVE_PREFIX}slot1`, JSON.stringify({ v: 3, savedAt: 1, pose: { x: 1, z: 1, heading: 0, inCar: false, map: 'real' }, hour: 1 }));
    const rm = new SaveManager(new SaveStore(ms, 'real'));
    rm.delete('slot1');
    expect(ms.m.has(`${REAL_SAVE_PREFIX}slot1`)).toBe(false);
    expect(ms.m.has(`${SAVE_PREFIX}slot1`)).toBe(true);
  });
});
