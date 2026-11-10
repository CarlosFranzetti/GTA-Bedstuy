// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import {
  SaveManager, SaveStore, SAVE_PREFIX, LEGACY_SAVE_KEY, AUTOSAVE_INTERVAL_MS, captureSave, applySave, migrateSave,
  formatClock, formatDay, type SaveParts, type SavePose, type PlayerLook,
} from '@/ui/GameSave';
import { SavePanel } from '@/ui/SavePanel';
import { Menu } from '@/ui/Menu';
import { PhoneHud } from '@/ui/PhoneHud';
import { Phone } from '@/game/Phone';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
};

function world() {
  const live = {
    pose: { x: 10, z: 20, heading: 1.5, inCar: false } as SavePose,
    hour: 9.5, day: 2, wanted: 0, weather: 'dry', station: 'Static FM', look: { seed: 77, ethnicity: 'x' } as PlayerLook | null,
    mission: { v: 1, completed: ['a'], cash: 5 } as unknown, phoneData: { v: 1 } as unknown, street: 'Throop Ave',
  };
  const inventory = new Inventory(PROCEDURAL_RECORDS, null);
  const parts: SaveParts = {
    getPose: () => ({ ...live.pose }), setPose: (p) => { live.pose = { ...p }; },
    getHour: () => live.hour, setHour: (h) => { live.hour = h; },
    getDay: () => live.day, setDay: (d) => { live.day = d; },
    inventory,
    missions: { serialize: () => live.mission, restore: (d) => { live.mission = d; return true; } },
    phone: { serialize: () => live.phoneData, restore: (d) => { live.phoneData = d; return true; } },
    getWanted: () => live.wanted, setWanted: (n) => { live.wanted = n; },
    getWeather: () => live.weather, setWeather: (w) => { live.weather = w; },
    getStation: () => live.station, setStation: (s) => { live.station = s; },
    getLook: () => live.look, setLook: (l) => { live.look = l; },
    getStreet: () => live.street,
  };
  return { live, inventory, parts };
}

describe('GameSave round trip', () => {
  it('captures and restores every field', () => {
    const w = world();
    w.inventory.add(300); w.inventory.giveItem('keycard', 2); w.inventory.setFlag('aftersloth.unlocked');
    w.live.pose = { x: -42.5, z: 99, heading: 3, inCar: true, vehicleType: 'taxi' };
    w.live.wanted = 3; w.live.weather = 'rain'; w.live.station = 'Wax FM'; w.live.hour = 22.25; w.live.day = 4;
    const snap = JSON.parse(JSON.stringify(captureSave(w.parts, 1000)));
    expect(snap.v).toBe(2);
    expect(snap.cash).toBe(420);

    const w2 = world();
    const s = migrateSave(snap)!;
    applySave(w2.parts, s);
    expect(w2.live.pose).toEqual({ x: -42.5, z: 99, heading: 3, inCar: true, vehicleType: 'taxi' });
    expect([w2.live.wanted, w2.live.weather, w2.live.station, w2.live.hour, w2.live.day]).toEqual([3, 'rain', 'Wax FM', 22.25, 4]);
    expect(w2.inventory.cash).toBe(420);
    expect(w2.inventory.itemCount('keycard')).toBe(2);
    expect(w2.inventory.hasFlag('aftersloth.unlocked')).toBe(true);
    expect(w2.inventory.records.map((r) => r.id).sort()).toEqual(w.inventory.records.map((r) => r.id).sort());
    expect(w2.live.mission).toEqual(w.live.mission);
    expect(w2.live.look).toEqual({ seed: 77, ethnicity: 'x' });
  });

  it('a sold starter record stays sold after load', () => {
    const w = world();
    w.inventory.sell('wax-01');
    const snap = captureSave(w.parts);
    const w2 = world();
    applySave(w2.parts, snap);
    expect(w2.inventory.hasRecord('wax-01')).toBe(false);
  });

  it('SaveManager.playerLook is exposed after load and boot', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(memStore()));
    mgr.bind(w.parts);
    mgr.save('slot1');
    const mgr2 = new SaveManager(mgr.store);
    expect(mgr2.bootSave()?.playerLook).toEqual({ seed: 77, ethnicity: 'x' });
    expect(mgr2.playerLook).toEqual({ seed: 77, ethnicity: 'x' });
    w.parts.setLook({ seed: 5 });
    mgr.load('slot1');
    expect(w.live.look).toEqual({ seed: 77, ethnicity: 'x' });
    expect(mgr.playerLook?.seed).toBe(77);
  });
});

describe('migration', () => {
  it('v1 position-only save becomes v2 with the rest left undefined', () => {
    const s = migrateSave({ x: 1, z: 2, heading: 0.5, hour: 30 }, 5)!;
    expect(s).toMatchObject({ v: 2, savedAt: 5, pose: { x: 1, z: 2, heading: 0.5, inCar: false }, hour: 6 });
    expect(s.cash).toBeUndefined();
    const w = world();
    w.inventory.add(10);
    applySave(w.parts, s);
    expect(w.live.pose.x).toBe(1);
    expect(w.inventory.cash).toBe(130); // untouched
    expect(w.live.look).toEqual({ seed: 77, ethnicity: 'x' }); // untouched
  });

  it('bootSave falls back to the legacy key and prefers a newer v2 slot', () => {
    const ms = memStore();
    ms.setItem(LEGACY_SAVE_KEY, JSON.stringify({ x: 3, z: 4, heading: 0, hour: 8 }));
    const mgr = new SaveManager(new SaveStore(ms));
    expect(mgr.bootSave()?.pose.x).toBe(3);
    const w = world(); mgr.bind(w.parts); mgr.save('auto', 5000);
    expect(mgr.bootSave()?.pose.x).toBe(10);
  });

  it('rejects junk', () => {
    for (const j of [null, 5, 'x', [], {}, { v: 2 }, { v: 2, pose: { x: 1, z: NaN, heading: 0 }, hour: 1 }, { v: 9, x: 1 }]) expect(migrateSave(j)).toBeNull();
  });
});

describe('storage failures', () => {
  it('corrupt slot text reports corrupt and does not load', () => {
    const ms = memStore();
    ms.setItem(`${SAVE_PREFIX}slot2`, '{not json');
    ms.setItem(`${SAVE_PREFIX}slot3`, JSON.stringify({ v: 2, pose: 'x' }));
    const w = world();
    const mgr = new SaveManager(new SaveStore(ms)); mgr.bind(w.parts);
    expect(mgr.slot('slot2')).toMatchObject({ corrupt: true, empty: false });
    expect(mgr.slot('slot3').corrupt).toBe(true);
    expect(mgr.load('slot2')).toBe(false);
    expect(w.live.pose.x).toBe(10);
  });

  it('a throwing store keeps saves in memory and flags storageOk false', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
    const w = world();
    const mgr = new SaveManager(new SaveStore(bad)); mgr.bind(w.parts);
    expect(mgr.storageOk).toBe(false);
    expect(mgr.save('slot1')).toBe(true);
    expect(mgr.slot('slot1').empty).toBe(false);
    expect(mgr.load('slot1')).toBe(true);
    expect(() => mgr.delete('slot1')).not.toThrow();
    expect(mgr.slot('slot1').empty).toBe(true);
  });

  it('no storage at all (null) still works in memory', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(null)); mgr.bind(w.parts);
    expect(mgr.storageOk).toBe(false);
    expect(mgr.save('slot2')).toBe(true);
    expect(mgr.bootSave()).not.toBeNull();
  });

  it('save and load do nothing before bind', () => {
    const mgr = new SaveManager(new SaveStore(memStore()));
    expect(mgr.save('slot1')).toBe(false);
    expect(mgr.load('slot1')).toBe(false);
  });
});

describe('slot metadata and autosave', () => {
  it('lists autosave + 3 slots with day, time, cash, street and timestamp', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(memStore())); mgr.bind(w.parts);
    expect(mgr.slots().map((s) => s.id)).toEqual(['auto', 'slot1', 'slot2', 'slot3']);
    expect(mgr.slots().every((s) => s.empty)).toBe(true);
    w.inventory.add(80);
    mgr.save('slot2', 1_700_000_000_000);
    const s = mgr.slot('slot2');
    expect(s).toMatchObject({ empty: false, corrupt: false, day: 2, hour: 9.5, cash: 200, street: 'Throop Ave', savedAt: 1_700_000_000_000 });
    expect(formatClock(9.5)).toBe('9:30am');
    expect(formatClock(0)).toBe('12:00am');
    expect(formatClock(23.99)).toBe('11:59pm');
    expect(formatDay(2)).toBe('Day 3 Wed');
  });

  it('autosave is throttled to 60 s, skipped when canSave is false, and forced on demand', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(memStore())); mgr.bind(w.parts);
    expect(mgr.autosave(1000)).toBe(true);
    expect(mgr.autosave(1000 + AUTOSAVE_INTERVAL_MS - 1)).toBe(false);
    expect(mgr.autosave(1000 + AUTOSAVE_INTERVAL_MS)).toBe(true);
    expect(mgr.autosave(1e9, false)).toBe(false);
    expect(mgr.autosave(1000 + AUTOSAVE_INTERVAL_MS + 1, true, true)).toBe(true);
    expect(mgr.slot('auto').empty).toBe(false);
  });
});

describe('export / import', () => {
  it('exports a slot as JSON and imports it into another store', () => {
    const w = world();
    const a = new SaveManager(new SaveStore(memStore())); a.bind(w.parts);
    a.save('slot1', 42);
    const text = a.exportSlot('slot1')!;
    expect(JSON.parse(text).format).toBe('gta-bedstuy-save');
    expect(a.exportSlot('slot2')).toBeNull();
    const b = new SaveManager(new SaveStore(null));
    expect(b.importInto('slot3', text)).toBe(true);
    expect(b.slot('slot3')).toMatchObject({ empty: false, savedAt: 42, cash: 120 });
    expect(b.importInto('slot3', 'garbage')).toBe(false);
    expect(b.parseImport(JSON.stringify(captureSave(w.parts)))).not.toBeNull(); // a bare save also imports
  });
});

describe('Save panel, menu and phone', () => {
  let root: HTMLElement;
  beforeEach(() => { document.body.innerHTML = ''; document.body.className = ''; root = document.createElement('div'); document.body.appendChild(root); });

  it('asks before overwriting, saves, loads and starts a new game', () => {
    const w = world();
    let newGames = 0, done: string[] = [];
    const mgr = new SaveManager(new SaveStore(memStore()), { newGame: () => { newGames++; } }); mgr.bind(w.parts);
    const panel = new SavePanel(root, mgr, { newGame: true, onDone: (k) => done.push(k) });
    const slot = (id: string) => root.querySelector<HTMLElement>(`.sv-slot[data-slot="${id}"]`)!;
    expect(root.querySelectorAll('.sv-slot').length).toBe(4);
    expect(slot('auto').querySelector('.sv-save')).toBeNull(); // autosave cannot be written by hand
    slot('slot1').querySelector<HTMLButtonElement>('.sv-save')!.click(); // empty: saves at once
    expect(slot('slot1').textContent).toContain('Day 3 Wed');
    expect(slot('slot1').textContent).toContain('$120');
    expect(slot('slot1').textContent).toContain('Throop Ave');
    w.inventory.add(50);
    slot('slot1').querySelector<HTMLButtonElement>('.sv-save')!.click(); // occupied: confirm first
    expect((root.querySelector('.sv-confirm') as HTMLElement).hidden).toBe(false);
    expect(mgr.slot('slot1').cash).toBe(120);
    root.querySelector<HTMLButtonElement>('.sv-no')!.click();
    expect(mgr.slot('slot1').cash).toBe(120);
    slot('slot1').querySelector<HTMLButtonElement>('.sv-save')!.click();
    root.querySelector<HTMLButtonElement>('.sv-yes')!.click();
    expect(mgr.slot('slot1').cash).toBe(170);
    w.inventory.add(1000);
    slot('slot1').querySelector<HTMLButtonElement>('.sv-load')!.click();
    expect(w.inventory.cash).toBe(170);
    expect(done).toEqual(['load']);
    root.querySelector<HTMLButtonElement>('.sv-new')!.click();
    expect(newGames).toBe(0);
    root.querySelector<HTMLButtonElement>('.sv-yes')!.click();
    expect(newGames).toBe(1);
    expect(done).toEqual(['load', 'new']);
    panel.dispose();
  });

  it('shows the blocked-storage warning and refuses to save when canSave is false', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(null)); mgr.bind(w.parts);
    let ok = false;
    new SavePanel(root, mgr, { canSave: () => ok });
    expect((root.querySelector('.sv-warn') as HTMLElement).hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('.sv-slot[data-slot="slot1"] .sv-save')!.click();
    expect(mgr.slot('slot1').empty).toBe(true);
    ok = true;
    root.querySelector<HTMLButtonElement>('.sv-slot[data-slot="slot1"] .sv-save')!.click();
    expect(mgr.slot('slot1').empty).toBe(false);
  });

  it('pasted import validates and confirms before replacing', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(memStore())); mgr.bind(w.parts);
    mgr.save('slot1', 1);
    const text = mgr.exportSlot('slot1')!;
    const panel = new SavePanel(root, mgr);
    panel.importText('nope');
    expect(root.querySelector('.sv-msg')!.textContent).toContain('not a valid');
    panel.importText(text); // slot1 is occupied
    expect((root.querySelector('.sv-confirm') as HTMLElement).hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('.sv-yes')!.click();
    expect(root.querySelector('.sv-msg')!.textContent).toContain('Imported');
  });

  it('the pause menu opens the save screen and Escape steps back before closing', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(memStore())); mgr.bind(w.parts);
    const menu = new Menu(root, {}, { saves: mgr, storage: null, openOnPointerUnlock: false });
    menu.open();
    root.querySelector<HTMLButtonElement>('.menu-save-btn')!.click();
    expect(menu.savingView).toBe(true);
    expect(root.querySelector('.sv-slot')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menu.savingView).toBe(false);
    expect(menu.isOpen).toBe(true);
    menu.showSave(true);
    root.querySelector<HTMLButtonElement>('.sv-slot[data-slot="slot2"] .sv-save')!.click();
    expect(mgr.slot('slot2').empty).toBe(false);
    root.querySelector<HTMLButtonElement>('.sv-slot[data-slot="slot2"] .sv-load')!.click();
    expect(menu.isOpen).toBe(false); // loading closes the menu so the game resumes
  });

  it('a menu without saves has no Save button visible', () => {
    new Menu(root, {}, { storage: null, openOnPointerUnlock: false });
    expect(root.querySelector<HTMLElement>('.menu-save-btn')!.hidden).toBe(true);
  });

  it('the phone has a Save tab', () => {
    const w = world();
    const mgr = new SaveManager(new SaveStore(memStore())); mgr.bind(w.parts);
    const phone = new Phone();
    const hud = new PhoneHud(root, phone, { saves: mgr });
    hud.toggle();
    const tab = [...root.querySelectorAll<HTMLButtonElement>('.ph-tab')].find((b) => b.textContent === 'Save')!;
    tab.click();
    expect(root.querySelectorAll('.ph-body .sv-slot').length).toBe(4);
    root.querySelector<HTMLButtonElement>('.ph-body .sv-slot[data-slot="slot3"] .sv-save')!.click();
    expect(mgr.slot('slot3').empty).toBe(false);
    // a phone without saves keeps its three tabs
    const root2 = document.createElement('div'); document.body.appendChild(root2);
    new PhoneHud(root2, new Phone());
    expect(root2.querySelectorAll('.ph-tab').length).toBe(3);
  });
});
