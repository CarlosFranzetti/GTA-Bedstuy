/**
 * Full game saves: 3 manual slots + an autosave, versioned (v2), migrating the old position-only v1 key.
 * Pure (no DOM, no three.js). Every storage access is try/catch; when localStorage is blocked or full the saves live in
 * memory for the session and `storageOk` is false so the UI can offer Export / Import (JSON file) instead.
 *
 * main.ts supplies a `SaveParts` object (get/set for each piece of live state) and a `SaveHost` (new game); this module
 * never touches game objects directly, so it is unit-testable with fakes.
 */
import type { Inventory } from '@/game/Inventory';
import type { RecordDef } from '@/game/records';

export const SAVE_VERSION = 2;
export const SAVE_PREFIX = 'gta-bedstuy.save.v2.';
export const LEGACY_SAVE_KEY = 'gta-bedstuy.save.v1';
export const EXPORT_FORMAT = 'gta-bedstuy-save';
export const AUTOSAVE_INTERVAL_MS = 60_000;
export const SLOT_IDS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export const SLOT_LABEL: Record<SlotId, string> = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };
export const MANUAL_SLOTS: readonly SlotId[] = ['slot1', 'slot2', 'slot3'];

/** The player's appearance. PEOPLE10 owns the meaning of the fields; the save only carries them. `seed` drives the roll. */
export interface PlayerLook { seed: number; ethnicity?: string; [k: string]: unknown }

export interface SavePose { x: number; z: number; heading: number; inCar: boolean; vehicleType?: string }

export interface SaveInventory { records: RecordDef[]; items: Record<string, number>; flags: string[] }

export interface SaveData {
  v: typeof SAVE_VERSION;
  /** epoch ms */
  savedAt: number;
  pose: SavePose;
  /** time of day 0..24 */
  hour: number;
  /** game day counter, 0 = Monday */
  day?: number;
  cash?: number;
  inventory?: SaveInventory;
  /** MissionSystem.serialize() */
  missions?: unknown;
  /** Phone.serialize() */
  phone?: unknown;
  wanted?: number;
  weather?: string;
  radioStation?: string;
  playerLook?: PlayerLook | null;
  /** street name at save time, for the slot list */
  street?: string;
}

export interface SlotInfo {
  id: SlotId;
  label: string;
  empty: boolean;
  corrupt: boolean;
  savedAt: number;
  day: number;
  hour: number;
  cash: number;
  street: string;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);

/** "3:05pm" from a 0..24 hour. */
export function formatClock(hour: number): string {
  const total = Math.round((((hour % 24) + 24) % 24) * 60) % 1440;
  const h = Math.floor(total / 60), m = total % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const formatDay = (day: number): string => `Day ${day + 1} ${WEEKDAYS[((Math.floor(day) % 7) + 7) % 7]}`;
export function formatStamp(ms: number): string {
  if (!finite(ms) || ms <= 0) return '';
  try { return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

function cleanLook(o: unknown): PlayerLook | null {
  if (!isObj(o) || !finite(o.seed)) return null;
  return { ...(o as PlayerLook), seed: o.seed };
}

function cleanInventory(o: unknown): SaveInventory | undefined {
  if (!isObj(o)) return undefined;
  const records = Array.isArray(o.records) ? (o.records.filter((r) => isObj(r) && typeof r.id === 'string') as unknown as RecordDef[]) : [];
  const items: Record<string, number> = {};
  if (isObj(o.items)) for (const [k, v] of Object.entries(o.items)) if (finite(v) && v > 0) items[k] = v;
  const flags = Array.isArray(o.flags) ? o.flags.filter((f): f is string => typeof f === 'string') : [];
  return { records, items, flags };
}

/**
 * Validates anything that might be a save (any version) and returns a clean v2 `SaveData`, or null when it is unusable.
 * v1 (the old position-only `{x, z, heading, hour}`) migrates with every other field left undefined, so applying it moves
 * the player and sets the clock and leaves the rest of the live game alone.
 */
export function migrateSave(raw: unknown, now: number = Date.now()): SaveData | null {
  if (!isObj(raw)) return null;
  if (raw.v === SAVE_VERSION) {
    const p = raw.pose;
    if (!isObj(p) || !finite(p.x) || !finite(p.z) || !finite(p.heading) || !finite(raw.hour)) return null;
    const out: SaveData = {
      v: SAVE_VERSION,
      savedAt: finite(raw.savedAt) ? raw.savedAt : now,
      pose: { x: p.x, z: p.z, heading: p.heading, inCar: p.inCar === true },
      hour: ((raw.hour % 24) + 24) % 24,
    };
    if (typeof p.vehicleType === 'string') out.pose.vehicleType = p.vehicleType;
    if (finite(raw.day) && raw.day >= 0) out.day = Math.floor(raw.day);
    if (finite(raw.cash) && raw.cash >= 0) out.cash = Math.round(raw.cash);
    const inv = cleanInventory(raw.inventory);
    if (inv) out.inventory = inv;
    if (raw.missions !== undefined) out.missions = raw.missions;
    if (raw.phone !== undefined) out.phone = raw.phone;
    if (finite(raw.wanted)) out.wanted = Math.max(0, Math.min(6, Math.round(raw.wanted)));
    if (typeof raw.weather === 'string') out.weather = raw.weather;
    if (typeof raw.radioStation === 'string') out.radioStation = raw.radioStation;
    if (raw.playerLook !== undefined) out.playerLook = cleanLook(raw.playerLook);
    if (typeof raw.street === 'string') out.street = raw.street.slice(0, 80);
    return out;
  }
  // v1: no version field, bare position
  if (raw.v === undefined && finite(raw.x) && finite(raw.z) && finite(raw.heading) && finite(raw.hour)) {
    return { v: SAVE_VERSION, savedAt: now, pose: { x: raw.x, z: raw.z, heading: raw.heading, inCar: false }, hour: ((raw.hour % 24) + 24) % 24 };
  }
  return null;
}

/** The live state, as get/set pairs. main.ts builds this once; everything is optional-safe on the way in. */
export interface SaveParts {
  getPose(): SavePose;
  /** Teleport: on foot at x/z/heading, or into a car of `vehicleType` when inCar. Leave any interior first. */
  setPose(p: SavePose): void;
  getHour(): number; setHour(h: number): void;
  getDay(): number; setDay(d: number): void;
  inventory: Pick<Inventory, 'cash' | 'records' | 'flags' | 'items' | 'reset' | 'add' | 'addRecord' | 'giveItem' | 'setFlag'>;
  missions: { serialize(): unknown; restore(d: unknown): boolean };
  phone: { serialize(): unknown; restore(d: unknown): boolean };
  getWanted(): number; setWanted(n: number): void;
  getWeather(): string; setWeather(w: string): void;
  getStation(): string; setStation(name: string): void;
  getLook(): PlayerLook | null; setLook(l: PlayerLook | null): void;
  getStreet(): string;
}

/** Snapshot the live game. */
export function captureSave(p: SaveParts, now: number = Date.now()): SaveData {
  const inv = p.inventory;
  return {
    v: SAVE_VERSION, savedAt: now, pose: p.getPose(), hour: p.getHour(), day: p.getDay(), cash: inv.cash,
    inventory: { records: inv.records, items: inv.items(), flags: inv.flags },
    missions: p.missions.serialize(), phone: p.phone.serialize(), wanted: p.getWanted(), weather: p.getWeather(),
    radioStation: p.getStation(), playerLook: p.getLook(), street: p.getStreet(),
  };
}

/** Restore a save into the live game. Fields the save does not have (migrated v1) are left alone. */
export function applySave(p: SaveParts, s: SaveData): void {
  if (s.playerLook !== undefined) p.setLook(s.playerLook);
  if (s.inventory) {
    const inv = p.inventory;
    inv.reset([]);
    for (const r of s.inventory.records) inv.addRecord(r);
    for (const [id, n] of Object.entries(s.inventory.items)) inv.giveItem(id, n);
    for (const f of s.inventory.flags) inv.setFlag(f, true);
  }
  if (s.cash !== undefined) { const d = s.cash - p.inventory.cash; if (d !== 0) p.inventory.add(d); }
  if (s.missions !== undefined) p.missions.restore(s.missions);
  if (s.phone !== undefined) p.phone.restore(s.phone);
  if (s.day !== undefined) p.setDay(s.day);
  p.setHour(s.hour);
  if (s.weather !== undefined) p.setWeather(s.weather);
  if (s.wanted !== undefined) p.setWanted(s.wanted);
  if (s.radioStation) p.setStation(s.radioStation);
  p.setPose(s.pose);
}

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): SaveStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Slot store: localStorage with an in-memory mirror, so a blocked store degrades to session-only saves. */
export class SaveStore {
  private readonly mem = new Map<string, string>();
  /** false once any read/write failed or no storage exists: saves then live only in memory and the UI says so. */
  storageOk: boolean;

  constructor(private readonly storage: SaveStorage | null = defaultStorage()) {
    this.storageOk = storage !== null;
    if (storage) {
      try { storage.getItem(LEGACY_SAVE_KEY); } catch { this.storageOk = false; }
    }
  }

  private read(key: string): string | null {
    if (this.storage) {
      try { const v = this.storage.getItem(key); if (v !== null) return v; } catch { this.storageOk = false; }
    }
    return this.mem.get(key) ?? null;
  }

  private write(key: string, text: string): void {
    this.mem.set(key, text);
    if (!this.storage) return;
    try { this.storage.setItem(key, text); } catch { this.storageOk = false; }
  }

  /** Raw slot content, then validation: 'corrupt' for text that is not a usable save. */
  get(id: SlotId): SaveData | 'corrupt' | null {
    const raw = this.read(SAVE_PREFIX + id);
    if (raw === null || raw === '') return null;
    try { return migrateSave(JSON.parse(raw)) ?? 'corrupt'; } catch { return 'corrupt'; }
  }

  put(id: SlotId, data: SaveData): boolean {
    let text: string;
    try { text = JSON.stringify(data); } catch { return false; }
    this.write(SAVE_PREFIX + id, text);
    return true;
  }

  remove(id: SlotId): void {
    this.mem.delete(SAVE_PREFIX + id);
    if (this.storage) { try { this.storage.removeItem(SAVE_PREFIX + id); } catch { this.storageOk = false; } }
  }

  /** The v1 position-only save, migrated, or null. */
  legacy(): SaveData | null {
    const raw = this.read(LEGACY_SAVE_KEY);
    if (!raw) return null;
    try { return migrateSave(JSON.parse(raw)); } catch { return null; }
  }
}

function infoOf(id: SlotId, v: SaveData | 'corrupt' | null): SlotInfo {
  const base = { id, label: SLOT_LABEL[id], empty: true, corrupt: false, savedAt: 0, day: 0, hour: 0, cash: 0, street: '' };
  if (v === null) return base;
  if (v === 'corrupt') return { ...base, empty: false, corrupt: true };
  return { ...base, empty: false, savedAt: v.savedAt, day: v.day ?? 0, hour: v.hour, cash: v.cash ?? 0, street: v.street ?? '' };
}

export interface SaveHost {
  /** Start over: reset inventory, missions, phone, clock, weather, wanted, roll a new player look, spawn at the start. */
  newGame(): void;
  /** Called after any successful load / new game (close menus, snap camera, toast). */
  afterApply?(kind: 'load' | 'new', slot?: SlotId): void;
}

/**
 * What the UI talks to. `parts` is optional at construction (`bind` later) because the manager is built before the world
 * exists in some boots; save / load do nothing and return false until it is bound.
 */
export class SaveManager {
  private parts: SaveParts | null = null;
  private lastAuto = -Infinity;
  /** The look loaded from the last save (or null): PEOPLE10 reads this at boot, before the player exists. */
  playerLook: PlayerLook | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(readonly store: SaveStore = new SaveStore(), readonly host: SaveHost = { newGame: () => undefined }) {}

  bind(parts: SaveParts, host?: SaveHost): void { this.parts = parts; if (host) (this as { host: SaveHost }).host = host; }
  get bound(): boolean { return this.parts !== null; }
  get storageOk(): boolean { return this.store.storageOk; }
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(): void { for (const fn of [...this.listeners]) { try { fn(); } catch { /* listener bug must not break saving */ } } }

  /** Metadata for the slot list: autosave first, then the manual slots. */
  slots(): SlotInfo[] { return SLOT_IDS.map((id) => infoOf(id, this.store.get(id))); }
  slot(id: SlotId): SlotInfo { return infoOf(id, this.store.get(id)); }

  /** Manual save. Returns false when not bound or the snapshot fails. */
  save(id: SlotId, now: number = Date.now()): boolean {
    if (!this.parts) return false;
    try {
      const ok = this.store.put(id, captureSave(this.parts, now));
      if (ok) this.changed();
      return ok;
    } catch { return false; }
  }

  /** Throttled autosave (60 s). `canSave` false (inside a room, mid-fade, menu open) skips it. */
  autosave(now: number = Date.now(), canSave = true, force = false): boolean {
    if (!this.parts || !canSave) return false;
    if (!force && now - this.lastAuto < AUTOSAVE_INTERVAL_MS) return false;
    this.lastAuto = now;
    return this.save('auto', now);
  }

  /** Restores a slot into the live game. */
  load(id: SlotId): boolean {
    const s = this.store.get(id);
    return this.loadData(s === 'corrupt' ? null : s, id);
  }

  loadData(s: SaveData | null, slot?: SlotId): boolean {
    if (!s || !this.parts) return false;
    try {
      applySave(this.parts, s);
      if (s.playerLook !== undefined) this.playerLook = s.playerLook;
      this.host.afterApply?.('load', slot);
      this.changed();
      return true;
    } catch { return false; }
  }

  newGame(): void {
    try { this.host.newGame(); } catch { /* host failure leaves the old game running */ return; }
    this.lastAuto = -Infinity;
    this.host.afterApply?.('new');
    this.changed();
  }

  delete(id: SlotId): void { this.store.remove(id); this.changed(); }

  /**
   * Boot save: the newest of autosave and the manual slots; the v1 key only when there is nothing else. Null on a fresh
   * install. Sets `playerLook` so PEOPLE10 can read it before the player is built.
   */
  bootSave(): SaveData | null {
    let best: SaveData | null = null;
    for (const id of SLOT_IDS) {
      const s = this.store.get(id);
      if (s && s !== 'corrupt' && (!best || s.savedAt > best.savedAt)) best = s;
    }
    best ??= this.store.legacy();
    if (best?.playerLook !== undefined) this.playerLook = best.playerLook;
    return best;
  }

  /** JSON text for a download. Null for an empty or corrupt slot. */
  exportSlot(id: SlotId): string | null {
    const s = this.store.get(id);
    if (!s || s === 'corrupt') return null;
    return JSON.stringify({ format: EXPORT_FORMAT, v: SAVE_VERSION, exportedAt: Date.now(), slot: id, data: s }, null, 1);
  }

  /** Parses an exported file (or a bare save) without storing it. Null when it is not a usable save. */
  parseImport(text: string): SaveData | null {
    try {
      const o = JSON.parse(text) as unknown;
      if (isObj(o) && o.format === EXPORT_FORMAT) return migrateSave(o.data);
      return migrateSave(o);
    } catch { return null; }
  }

  /** Stores an imported save into a manual slot. */
  importInto(id: SlotId, text: string): boolean {
    const s = this.parseImport(text);
    if (!s || !this.store.put(id, s)) return false;
    this.changed();
    return true;
  }
}

/** Download file name for an export: gta-bedstuy-slot1-day3.json */
export function exportFileName(info: SlotInfo): string {
  return `gta-bedstuy-${info.id}-day${info.day + 1}.json`;
}
