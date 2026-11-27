/**
 * THRIFT AND FLIP: a rack of seeded second-hand garments (ids from the game's own wardrobe data), a bag that carries a
 * few pieces, resale prices that depend on where and to whom you sell, and a small haggle. Pure; the host moves cash.
 * `THRIFT_CATALOG` lists wardrobe keys by slot; a test checks every key exists in `pedWardrobe` so this never goes stale.
 */
import { Rng } from '@/core/Rng';

export type Slot = 'top' | 'layer' | 'bottom' | 'shoes';
/** basic: plain thrift fare; vintage: older cut or fabric that some buyers pay for; label: a good brand (no lettering shown anywhere). */
export type Tier = 'basic' | 'vintage' | 'label';

/** Wardrobe keys (pedWardrobe BASE_TOPS, LAYERS, BOTTOMS, SHOES). */
export const THRIFT_CATALOG: Readonly<Record<Slot, readonly string[]>> = {
  top: ['tee', 'pocketTee', 'longTee', 'polo', 'shirt', 'sweater'],
  layer: ['shirtOpen', 'cardigan', 'cardiganOpen'],
  bottom: ['jeansStraight', 'jeansSlim', 'jeansBaggy', 'chinos'],
  shoes: ['sneakerLow', 'sneakerDark', 'sneakerHigh'],
};
const SLOTS: readonly Slot[] = ['top', 'layer', 'bottom', 'shoes'];
const SLOT_WORTH: Record<Slot, number> = { top: 26, layer: 48, bottom: 40, shoes: 52 };

export interface Garment {
  id: string; slot: Slot; item: string; /** colourway index for the wardrobe */ way: number; tier: Tier;
  /** 0.35..1: how worn it is. */ condition: number; /** what the rack charges. */ buy: number; label: string;
}

export interface Market {
  id: string; label: string;
  /** Price multiplier by tier (what this buyer thinks of it). */
  tier: Record<Tier, number>;
  /** Multiplier by slot. */
  slot: Partial<Record<Slot, number>>;
  /** Highest ask, as a share over the first offer, the buyer will go to (haggle ceiling) and how many pushes they put up with. */
  ceiling: number; patience: number;
  /** Will not buy worn pieces below this condition. */
  minCondition: number;
}

/** Where and to whom. The same coat is worth three prices. */
export const MARKETS: Readonly<Record<string, Market>> = {
  stall: { id: 'stall', label: 'Vintage stall', tier: { basic: 0.8, vintage: 2.0, label: 2.2 }, slot: { layer: 1.2 }, ceiling: 1.3, patience: 3, minCondition: 0.5 },
  consignment: { id: 'consignment', label: 'Consignment shop', tier: { basic: 0.9, vintage: 1.3, label: 1.8 }, slot: { shoes: 1.15 }, ceiling: 1.15, patience: 2, minCondition: 0.6 },
  friend: { id: 'friend', label: 'A friend who dresses well', tier: { basic: 1.1, vintage: 1.5, label: 1.5 }, slot: { top: 1.1, bottom: 1.1 }, ceiling: 1.25, patience: 4, minCondition: 0.4 },
  pawn: { id: 'pawn', label: 'Pawn counter', tier: { basic: 0.4, vintage: 0.6, label: 0.9 }, slot: {}, ceiling: 1.1, patience: 1, minCondition: 0.3 },
  club: { id: 'club', label: 'Someone in the club line', tier: { basic: 0.7, vintage: 1.6, label: 2.4 }, slot: { top: 1.2, shoes: 1.2 }, ceiling: 1.35, patience: 2, minCondition: 0.5 },
};

export function priceOf(g: Garment, m: Market): number {
  if (g.condition < m.minCondition) return 0;
  const base = SLOT_WORTH[g.slot] * m.tier[g.tier] * (m.slot[g.slot] ?? 1) * (0.5 + 0.5 * g.condition);
  return Math.max(0, Math.round(base));
}

export function labelOf(slot: Slot, item: string, tier: Tier): string {
  const names: Record<string, string> = {
    tee: 'tee', pocketTee: 'pocket tee', longTee: 'long-sleeve tee', polo: 'polo', shirt: 'button shirt', sweater: 'knit sweater', shirtOpen: 'work overshirt', cardigan: 'cardigan',
    cardiganOpen: 'open cardigan', jeansStraight: 'straight jeans', jeansSlim: 'slim jeans', jeansBaggy: 'baggy jeans', chinos: 'chinos', sneakerLow: 'low sneakers', sneakerDark: 'dark sneakers', sneakerHigh: 'high-tops',
  };
  void slot;
  return `${tier === 'vintage' ? 'old ' : tier === 'label' ? 'good ' : ''}${names[item] ?? item}`;
}

export const RACK_PRICE: Record<Tier, [number, number]> = { basic: [3, 8], vintage: [6, 13], label: [8, 16] };

export interface RackSave { v: 1; id: string; day: number; sold: string[] }

export class ThriftRack {
  stock: Garment[] = [];
  private sold = new Set<string>();
  constructor(readonly id: string, private readonly size = 10, private day = 0) { this.stock = ThriftRack.generate(id, day, size); }

  static generate(rackId: string, day: number, size: number): Garment[] {
    const r = new Rng(`${rackId}:${day}`);
    const out: Garment[] = [];
    for (let i = 0; i < size; i++) {
      const slot = SLOTS[i % 4 === 3 && r.chance(0.4) ? 3 : r.int(0, 3)];
      const item = r.pick(THRIFT_CATALOG[slot]);
      const roll = r.next(), tier: Tier = roll < 0.08 ? 'label' : roll < 0.3 ? 'vintage' : 'basic';
      const [lo, hi] = RACK_PRICE[tier];
      out.push({ id: `${rackId}:${day}:${i}`, slot, item, way: r.int(0, 2), tier, condition: Math.round(r.range(0.35, 1) * 100) / 100, buy: r.int(lo, hi), label: labelOf(slot, item, tier) });
    }
    return out;
  }

  /** New stock for a new day; pieces already bought are gone for that day only. */
  restock(day: number): void { if (day !== this.day) { this.day = day; this.sold.clear(); this.stock = ThriftRack.generate(this.id, day, this.size); } }
  get available(): Garment[] { return this.stock.filter((g) => !this.sold.has(g.id)); }
  /** Removes a piece from the rack (the caller charges the buy price). */
  take(id: string): Garment | null { const g = this.available.find((x) => x.id === id); if (!g) return null; this.sold.add(id); return g; }

  serialize(): RackSave { return { v: 1, id: this.id, day: this.day, sold: [...this.sold] }; }
  restore(d: unknown): boolean {
    const o = d as Partial<RackSave> | null;
    if (!o || o.v !== 1 || o.id !== this.id || !Number.isFinite(o.day) || !Array.isArray(o.sold)) return false;
    this.day = o.day as number; this.stock = ThriftRack.generate(this.id, this.day, this.size); this.sold = new Set(o.sold.filter((s) => typeof s === 'string'));
    return true;
  }
}

export const BAG_MAX = 4;
export class ThriftBag {
  items: Garment[] = [];
  profit = 0;
  /** Buy off the rack into the bag. */
  buy(rack: ThriftRack, id: string, spend: (n: number) => boolean): 'ok' | 'full' | 'poor' | 'gone' {
    if (this.items.length >= BAG_MAX) return 'full';
    const g = rack.available.find((x) => x.id === id);
    if (!g) return 'gone';
    if (!spend(g.buy)) return 'poor';
    rack.take(id); this.items.push(g);
    return 'ok';
  }
  remove(id: string): Garment | null { const i = this.items.findIndex((g) => g.id === id); return i < 0 ? null : this.items.splice(i, 1)[0]; }
}

export type HaggleState = { phase: 'open'; offer: number; ask: number; patience: number } | { phase: 'sold'; price: number } | { phase: 'walked' };

/**
 * A small haggle. `start` gives the buyer's first offer; `push(ask)` names a higher price. At or under the ceiling the buyer
 * agrees at the ask (if the ask is inside the ceiling) or counters halfway; above it, patience drops and the buyer repeats the
 * last offer; patience 0 and the buyer walks. `accept()` takes the standing offer.
 */
export class Haggle {
  state: HaggleState;
  private readonly cap: number;
  constructor(readonly garment: Garment, readonly market: Market, seed: number | string = garment.id) {
    const r = new Rng(`${seed}:haggle`);
    const first = Math.round(priceOf(garment, market) * r.range(0.8, 0.95));
    this.cap = Math.round(priceOf(garment, market) * market.ceiling * r.range(0.95, 1.05));
    this.state = first <= 0 ? { phase: 'walked' } : { phase: 'open', offer: first, ask: first, patience: market.patience };
  }
  get closed(): boolean { return this.state.phase !== 'open'; }
  push(ask: number): HaggleState {
    const s = this.state;
    if (s.phase !== 'open') return s;
    if (!(ask > s.offer)) return this.accept();
    if (ask <= this.cap) {
      // inside the ceiling: take it, or meet near it on a tough day (the last push)
      this.state = { phase: 'sold', price: ask };
      return this.state;
    }
    const patience = s.patience - 1;
    if (patience <= 0) { this.state = { phase: 'walked' }; return this.state; }
    this.state = { phase: 'open', offer: Math.min(this.cap, Math.round((s.offer + this.cap) / 2)), ask, patience };
    return this.state;
  }
  accept(): HaggleState {
    const s = this.state;
    if (s.phase === 'open') this.state = { phase: 'sold', price: s.offer };
    return this.state;
  }
}

/** Sell the piece for the final price of a closed haggle. Returns the cash gained (0 when it did not sell). */
export function settleSale(bag: ThriftBag, h: Haggle, pay: (n: number) => void): number {
  if (h.state.phase !== 'sold') return 0;
  const g = bag.remove(h.garment.id);
  if (!g) return 0;
  pay(h.state.price);
  bag.profit += h.state.price - g.buy;
  return h.state.price;
}
