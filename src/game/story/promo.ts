/**
 * PROMOTION: flyers for a club night handed to passers-by, posters at marked walls, a guest list. The count of all
 * three sets the night's turnout and the door money. Adults only: `Pedestrian.isMinor` people are never approached
 * (the call is refused and nothing is recorded). People react by temperament (`pedVitals.Temperament`).
 */
import { Rng } from '@/core/Rng';
import { capacityOf, knownVenue, type VenueId } from './venueTable';

export type PromoTemper = 'flee' | 'cower' | 'film' | 'fight';
export interface PromoPed { id: number | string; isMinor: boolean; temperament: PromoTemper }
export type FlyerResult =
  | { kind: 'refusedMinor' }            // not approachable: nothing happens
  | { kind: 'alreadyAsked' }
  | { kind: 'outOfFlyers' }
  | { kind: 'taken'; onList: boolean; line: string }
  | { kind: 'ignored'; line: string }   // waves it off, walks on
  | { kind: 'rude'; line: string };     // snaps at you; no heat, no damage

/** Chance to take a flyer, by temperament (seeded per person and night, so the same person answers the same way). */
const TAKE: Record<PromoTemper, number> = { film: 0.75, cower: 0.35, flee: 0.3, fight: 0.15 };
const LIST_CHANCE = 0.4;
const RUDE_SHARE: Record<PromoTemper, number> = { fight: 0.5, flee: 0.1, cower: 0.05, film: 0 };
const IGNORE_LINES = ['Keeps walking, eyes on the phone.', '"Not today."', 'A hand up, palm out: no.', 'Looks at the flyer, looks at you, keeps going.'];
const RUDE_LINES = ['"Get that out of my face."', '"What, you gonna sell me a whole night?"', 'Pushes it back at your chest.'];
const TAKE_LINES = ['"Free entry before midnight? I will see."', '"Huh. Who is playing?"', 'Folds it into a back pocket carefully.', '"Put me on the list."'];

export interface Night {
  id: string; venue: VenueId; seed: number;
  /** Game hours (0..24, may pass 24) the night opens. */
  startHour: number; flyersLeft: number; flyersGiven: number; list: number;
  posters: string[]; asked: Array<number | string>;
  /** Cover charge in dollars (the door takes `cover` for every head past the guest list). */
  cover: number;
}
export interface Turnout { headcount: number; capacity: number; /** 0..1, feeds GigBook.settle */ ratio: number; doorMoney: number; listShow: number }

export interface PromoSave { v: 1; nights: Night[] }
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export class Promotion {
  readonly nights = new Map<string, Night>();

  /** Create (or return) a club night. `flyers` is the stack you were given. */
  startNight(id: string, venue: VenueId, startHour: number, opts: { flyers?: number; cover?: number } = {}): Night {
    const have = this.nights.get(id);
    if (have) return have;
    const n: Night = { id, venue, seed: Rng.hash(id), startHour, flyersLeft: opts.flyers ?? 30, flyersGiven: 0, list: 0, posters: [], asked: [], cover: opts.cover ?? 10 };
    this.nights.set(id, n);
    return n;
  }

  handFlyer(nightId: string, ped: PromoPed): FlyerResult {
    const n = this.nights.get(nightId);
    if (ped.isMinor) return { kind: 'refusedMinor' };
    if (!n || n.flyersLeft <= 0) return { kind: 'outOfFlyers' };
    if (n.asked.includes(ped.id)) return { kind: 'alreadyAsked' };
    n.asked.push(ped.id);
    const r = new Rng(`${n.seed}:${ped.id}`);
    if (r.next() < TAKE[ped.temperament]) {
      n.flyersLeft--; n.flyersGiven++;
      const onList = r.chance(LIST_CHANCE);
      if (onList) n.list++;
      return { kind: 'taken', onList, line: r.pick(TAKE_LINES) };
    }
    if (r.next() < RUDE_SHARE[ped.temperament]) return { kind: 'rude', line: r.pick(RUDE_LINES) };
    return { kind: 'ignored', line: r.pick(IGNORE_LINES) };
  }

  /** Put a poster up at a marked wall (once per wall). Returns false when it is already up or the night is unknown. */
  hangPoster(nightId: string, wallId: string): boolean {
    const n = this.nights.get(nightId);
    if (!n || n.posters.includes(wallId)) return false;
    n.posters.push(wallId);
    return true;
  }

  /**
   * Who turns up. Sure things: the guest list (85 percent show). Flyers bring 12 percent each, a poster brings about
   * six walk-ins, and the room has a base draw. Capped by the room. Seeded: the same night gives the same answer.
   */
  turnout(nightId: string, baseDraw = 8): Turnout {
    const n = this.nights.get(nightId);
    if (!n) return { headcount: 0, capacity: 0, ratio: 0, doorMoney: 0, listShow: 0 };
    const cap = capacityOf(n.venue);
    const r = new Rng(`${n.seed}:turnout`);
    const listShow = Math.round(n.list * 0.85);
    const walkIns = n.flyersGiven * 0.12 + n.posters.length * 6 + baseDraw;
    const head = Math.min(cap, listShow + Math.round(walkIns * r.range(0.85, 1.15)));
    const paying = Math.max(0, head - listShow);
    return { headcount: head, capacity: cap, ratio: cap > 0 ? Math.min(1, head / cap) : 0, doorMoney: paying * n.cover, listShow };
  }

  serialize(): PromoSave { return { v: 1, nights: [...this.nights.values()].map((n) => ({ ...n, posters: [...n.posters], asked: [...n.asked] })) }; }
  restore(d: unknown): boolean {
    if (typeof d !== 'object' || d === null) return false;
    const o = d as Partial<PromoSave>;
    if (o.v !== 1 || !Array.isArray(o.nights)) return false;
    const good = o.nights.every((n) => n && typeof n.id === 'string' && typeof n.venue === 'string' && knownVenue(n.venue) && [n.seed, n.startHour, n.flyersLeft, n.flyersGiven, n.list, n.cover].every(finite) && Array.isArray(n.posters) && Array.isArray(n.asked));
    if (!good) return false;
    this.nights.clear();
    for (const n of o.nights) this.nights.set(n.id, { ...n, posters: [...n.posters], asked: [...n.asked] });
    return true;
  }
}
