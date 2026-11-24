/**
 * SELLING: abstract and consequence-first. A carried "pack" is an inventory item with no real-world detail (no
 * substance names, doses, prices per gram or methods anywhere). The player makes hand-offs at marked meetings; a
 * witness adds police heat through the existing heat model (the host maps `onHeat` to `police.reportCrime`); a bust
 * loses the pack. Nobody under 18 can be approached: `approach()` refuses anyone for whom `isMinor` is true.
 */
import type { Vec2 } from '@/core/Math2';

export const PACK_ITEM = 'pack';

export interface Meeting {
  id: string; at: Vec2; radius: number;
  /** Game hours the buyer is there (wraps midnight). */
  from: number; to: number; /** units handed over */ units: number; /** cash for the hand-off */ pay: number;
  /** The buyer is nervous: a witness in view makes them walk (the sale fails, heat still counts). */
  nervous?: boolean; done?: boolean;
}

export type HandoffResult =
  | { kind: 'done'; pay: number; units: number }
  | { kind: 'noPack' } | { kind: 'wrongTime' } | { kind: 'tooFar' } | { kind: 'refusedMinor' } | { kind: 'alreadyDone' }
  | { kind: 'seen'; walked: boolean; pay: number };

export interface Witness { /** someone who could see the hand-off */ sees: boolean; /** a person under 18 within sight: the hand-off is refused outright */ minorNear: boolean }

export interface PackHost {
  /** Raise heat for a witnessed hand-off (host: `police.reportCrime(<minor type>, pos, seen)`). */
  onHeat?: (pos: Vec2, seen: boolean) => void;
  /** Wallet. */
  pay?: (cash: number) => void;
}

const inWindow = (h: number, a: number, b: number): boolean => { const x = ((h % 24) + 24) % 24; return a <= b ? x >= a && x < b : x >= a || x < b; };

export interface PackSave { v: 1; units: number; done: string[]; lost: number; sold: number; seen: number }

export class PackSystem {
  /** Units carried (the Inventory item PACK_ITEM mirrors this; see `syncInventory`). */
  units = 0;
  lost = 0; sold = 0; seen = 0;
  private readonly done = new Set<string>();
  constructor(private readonly host: PackHost = {}) {}

  get hasPack(): boolean { return this.units > 0; }
  receive(units: number): void { if (Number.isFinite(units) && units > 0) this.units += Math.floor(units); }

  /** A person the player is about to approach. Under 18 (or unknown age): never. */
  approach(ped: { isMinor: boolean }): 'ok' | 'refusedMinor' { return ped.isMinor ? 'refusedMinor' : 'ok'; }

  handoff(m: Meeting, pos: Vec2, hour: number, w: Witness): HandoffResult {
    if (this.done.has(m.id) || m.done) return { kind: 'alreadyDone' };
    if (w.minorNear) return { kind: 'refusedMinor' };
    if (this.units < m.units) return { kind: 'noPack' };
    if (!inWindow(hour, m.from, m.to)) return { kind: 'wrongTime' };
    if (Math.hypot(pos.x - m.at.x, pos.z - m.at.z) > m.radius) return { kind: 'tooFar' };
    if (w.sees) {
      this.seen++;
      this.host.onHeat?.(m.at, true);
      if (m.nervous) return { kind: 'seen', walked: true, pay: 0 };
      this.complete(m);
      return { kind: 'seen', walked: false, pay: m.pay };
    }
    this.host.onHeat?.(m.at, false); // unseen: a trace only (the heat model counts a quarter)
    this.complete(m);
    return { kind: 'done', pay: m.pay, units: m.units };
  }

  private complete(m: Meeting): void {
    this.units -= m.units; this.sold += m.units; this.done.add(m.id);
    this.host.pay?.(m.pay);
  }

  /** The police bust the player: the pack is gone, no payment. Returns the units lost. */
  onBust(): number { const n = this.units; this.units = 0; this.lost += n; return n; }

  /** Keep the Inventory item in step with `units` (pass `Inventory`). */
  syncInventory(inv: { itemCount(id: string): number; giveItem(id: string, n?: number): void; takeItem(id: string, n?: number): boolean }): void {
    const have = inv.itemCount(PACK_ITEM);
    if (have < this.units) inv.giveItem(PACK_ITEM, this.units - have);
    else if (have > this.units) inv.takeItem(PACK_ITEM, have - this.units);
  }

  serialize(): PackSave { return { v: 1, units: this.units, done: [...this.done], lost: this.lost, sold: this.sold, seen: this.seen }; }
  restore(d: unknown): boolean {
    const o = d as Partial<PackSave> | null;
    if (!o || o.v !== 1 || ![o.units, o.lost, o.sold, o.seen].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) || !Array.isArray(o.done)) return false;
    this.units = o.units as number; this.lost = o.lost as number; this.sold = o.sold as number; this.seen = o.seen as number;
    this.done.clear(); for (const s of o.done) if (typeof s === 'string') this.done.add(s);
    return true;
  }
}
