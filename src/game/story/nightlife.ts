/**
 * Nightlife: the one object the host holds for the Pedro Martinez story's small systems (gigs, promotion, thrift,
 * selling, dates, fights). Nothing runs until a mission starts it, so the seeded simulations are unaffected.
 * It persists inside StoryState's `ext.nightlife` (see StoryState.setExt), so it rides the existing mission save.
 */
import { GigBook } from './gigs';
import { Promotion } from './promo';
import { ThriftBag, ThriftRack } from './thrift';
import { PackSystem, type PackHost } from './pack';
import { DateBook } from './dates';
import { FightEncounter, FIGHT_SCRIPTS } from './fights';
import type { StoryState } from './StoryState';

export const THRIFT_RACK_IDS = ['rack-a', 'rack-b'] as const;

export interface NightlifeSave { v: 1; gigs: unknown; promo: unknown; thrift: { racks: unknown[]; bag: unknown; profit: number }; pack: unknown; dates: unknown }

export class Nightlife {
  readonly gigs = new GigBook();
  readonly promo = new Promotion();
  readonly racks = new Map<string, ThriftRack>(THRIFT_RACK_IDS.map((id) => [id, new ThriftRack(id)]));
  readonly bag = new ThriftBag();
  readonly pack: PackSystem;
  readonly dates = new DateBook();
  private fights = new Map<string, FightEncounter>();
  constructor(host: PackHost = {}) { this.pack = new PackSystem(host); }

  /** A fresh encounter (replaces an earlier one with the same id). */
  fight(id: string): FightEncounter { const s = FIGHT_SCRIPTS[id]; if (!s) throw new Error(`no fight ${id}`); const f = new FightEncounter(s); this.fights.set(id, f); return f; }
  currentFight(id: string): FightEncounter | null { return this.fights.get(id) ?? null; }

  /** Once per frame: the game hour (0..24) keeps bookings honest and restocks the racks at midnight. */
  advance(hour: number): void { this.gigs.advance(hour); const day = Math.floor(this.gigs.now / 24); for (const r of this.racks.values()) r.restock(day); }

  serialize(): NightlifeSave {
    return { v: 1, gigs: this.gigs.serialize(), promo: this.promo.serialize(), thrift: { racks: [...this.racks.values()].map((r) => r.serialize()), bag: { items: this.bag.items }, profit: this.bag.profit }, pack: this.pack.serialize(), dates: this.dates.serialize() };
  }

  /** Each part is restored on its own: a damaged part is left at its new-game state and the rest still loads. Returns false only when `d` is not a nightlife save. */
  restore(d: unknown): boolean {
    const o = d as Partial<NightlifeSave> | null;
    if (!o || typeof o !== 'object' || o.v !== 1) return false;
    this.gigs.restore(o.gigs); this.promo.restore(o.promo); this.pack.restore(o.pack); this.dates.restore(o.dates);
    const t = o.thrift;
    if (t && Array.isArray(t.racks)) for (const s of t.racks) for (const r of this.racks.values()) r.restore(s);
    const items = (t?.bag as { items?: unknown } | undefined)?.items;
    this.bag.items = Array.isArray(items) ? (items as ThriftBag['items']).filter((g) => g && typeof g.id === 'string' && typeof g.buy === 'number').slice(0, 4) : [];
    this.bag.profit = typeof t?.profit === 'number' && Number.isFinite(t.profit) ? t.profit : 0;
    return true;
  }

  /** Write into / read from the story state's extension slot (called by the host around the mission save). */
  saveTo(story: StoryState): void { story.setExt('nightlife', this.serialize()); }
  loadFrom(story: StoryState): boolean { const d = story.getExt('nightlife'); return d === undefined ? false : this.restore(d); }
}
