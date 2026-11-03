/**
 * The player's wallet and stuff: cash, records (vinyl), items and story flags.
 *
 * Inventory OWNS the cash number. MissionSystem pays rewards with `inventory.add(n)` and reads `inventory.cash`.
 * Persisted under its own localStorage key; every storage access is wrapped in try/catch.
 */
import type { RecordDef } from './records';

export const INVENTORY_KEY = 'gta-bedstuy.inventory.v1';
export const START_CASH = 120;
/** Records the player starts with so the home turntables work on day one. */
export const STARTER_RECORD_IDS = ['wax-01', 'wax-02'] as const;

export interface InventoryStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

interface Persisted {
  v: 1;
  cash: number;
  /** Full definitions of owned records (library/drop records are not in any catalog). */
  records: RecordDef[];
  items: Record<string, number>;
  flags: string[];
}

function defaultStorage(): InventoryStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function validRecord(r: unknown): r is RecordDef {
  if (!r || typeof r !== 'object') return false;
  const o = r as Partial<RecordDef>;
  return typeof o.id === 'string' && typeof o.title === 'string' && typeof o.artist === 'string' && finite(o.price) && finite(o.bpm)
    && Array.isArray(o.colors) && o.colors.length === 2 && typeof o.kind === 'string';
}

export class Inventory {
  private _cash = START_CASH;
  private readonly _records = new Map<string, RecordDef>();
  private readonly _items = new Map<string, number>();
  private readonly _flags = new Set<string>();
  private readonly listeners = new Set<() => void>();

  /**
   * @param catalog starter records by id (looked up for `STARTER_RECORD_IDS` on a fresh game).
   * @param storage null disables persistence.
   */
  constructor(catalog: readonly RecordDef[] = [], private readonly storage: InventoryStorage | null = defaultStorage(), private readonly key = INVENTORY_KEY) {
    if (!this.load()) {
      for (const id of STARTER_RECORD_IDS) { const d = catalog.find((c) => c.id === id); if (d) this._records.set(id, d); }
      this.save();
    }
  }

  get cash(): number { return this._cash; }
  get records(): RecordDef[] { return [...this._records.values()]; }
  get flags(): string[] { return [...this._flags]; }
  items(): Record<string, number> { return Object.fromEntries(this._items); }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  /** Adds (or, if negative, removes down to 0) cash. Returns the new total. Used for mission rewards. */
  add(amount: number): number {
    if (!finite(amount)) return this._cash;
    this._cash = Math.max(0, Math.round(this._cash + amount));
    this.changed();
    return this._cash;
  }

  canAfford(amount: number): boolean { return finite(amount) && amount >= 0 && this._cash >= amount; }

  /** Spends cash; false (and no change) if the wallet is too thin. */
  spend(amount: number): boolean {
    if (!this.canAfford(amount)) return false;
    this._cash = Math.round(this._cash - amount);
    this.changed();
    return true;
  }

  hasRecord(id: string): boolean { return this._records.has(id); }
  getRecord(id: string): RecordDef | undefined { return this._records.get(id); }

  /** Adds a record for free (pressing, mission gifts). False if already owned. */
  addRecord(def: RecordDef): boolean {
    if (this._records.has(def.id)) return false;
    this._records.set(def.id, def);
    this.changed();
    return true;
  }

  /** Buys a record at its price. */
  buy(def: RecordDef): 'ok' | 'owned' | 'poor' {
    if (this._records.has(def.id)) return 'owned';
    if (!this.spend(def.price)) return 'poor';
    this._records.set(def.id, def);
    this.changed();
    return 'ok';
  }

  /** Sell price: half the shop price, rounded down (pressed files are worth 0). */
  sellPrice(def: RecordDef): number { return Math.floor(def.price / 2); }

  /** Sells an owned record back at half price. Returns the cash received, or -1 if not owned. */
  sell(id: string): number {
    const d = this._records.get(id);
    if (!d) return -1;
    const gain = this.sellPrice(d);
    this._records.delete(id);
    this._cash += gain;
    this.changed();
    return gain;
  }

  giveItem(id: string, n = 1): void { this._items.set(id, (this._items.get(id) ?? 0) + n); this.changed(); }
  takeItem(id: string, n = 1): boolean {
    const have = this._items.get(id) ?? 0;
    if (have < n) return false;
    if (have === n) this._items.delete(id); else this._items.set(id, have - n);
    this.changed();
    return true;
  }
  itemCount(id: string): number { return this._items.get(id) ?? 0; }

  /** Story flags, e.g. 'aftersloth.unlocked' (set by the password mission). */
  setFlag(flag: string, on = true): void {
    if (on === this._flags.has(flag)) return;
    if (on) this._flags.add(flag); else this._flags.delete(flag);
    this.changed();
  }
  hasFlag(flag: string): boolean { return this._flags.has(flag); }

  /** Wipes everything back to a new game. */
  reset(catalog: readonly RecordDef[] = []): void {
    this._cash = START_CASH; this._records.clear(); this._items.clear(); this._flags.clear();
    for (const id of STARTER_RECORD_IDS) { const d = catalog.find((c) => c.id === id); if (d) this._records.set(id, d); }
    this.changed();
  }

  private changed(): void {
    this.save();
    for (const fn of [...this.listeners]) fn();
  }

  private save(): void {
    const data: Persisted = { v: 1, cash: this._cash, records: [...this._records.values()], items: Object.fromEntries(this._items), flags: [...this._flags] };
    try { this.storage?.setItem(this.key, JSON.stringify(data)); } catch { /* quota / blocked */ }
  }

  private load(): boolean {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return false;
      const o = JSON.parse(raw) as Partial<Persisted>;
      if (!o || o.v !== 1 || !finite(o.cash)) return false;
      this._cash = Math.max(0, Math.round(o.cash));
      for (const r of Array.isArray(o.records) ? o.records : []) if (validRecord(r)) this._records.set(r.id, r);
      if (o.items && typeof o.items === 'object') for (const [k, v] of Object.entries(o.items)) if (finite(v) && v > 0) this._items.set(k, v);
      for (const f of Array.isArray(o.flags) ? o.flags : []) if (typeof f === 'string') this._flags.add(f);
      return true;
    } catch { return false; }
  }
}
