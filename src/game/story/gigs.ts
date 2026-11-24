/**
 * GIGS: getting a booking, playing the set with the DJ game, a crowd meter that sets the fee and whether the venue
 * books you again. Pure (no three.js, no DOM). Time is the game clock: `advance(hour)` once per step.
 *
 * Flow: request() (a call or a visit) -> a Booking with a window in game hours -> the host runs the set (DjGame, venue id
 * = booking.venue) -> settle(result) pays by crowd and score, updates the venue's liking and says whether it books again.
 */
import { VENUES, venueOpen, type VenueId } from './venueTable';

export type GigTier = 'flop' | 'ok' | 'good' | 'great';
export type GigState = 'booked' | 'played' | 'flopped' | 'missed';
export type RequestRefusal = 'unknownVenue' | 'banned' | 'alreadyBooked' | 'closed';

export interface GigTerms { baseFee: number; /** set length, minutes */ minutes: number; /** pass mark, 0..100 */ minScore: number }
/** Placeholder terms per venue (the writer's missions may override fee and length per mission). */
export const GIG_TERMS: Readonly<Record<VenueId, GigTerms>> = {
  'bar-1': { baseFee: 60, minutes: 2, minScore: 35 }, 'bar-2': { baseFee: 80, minutes: 2, minScore: 40 },
  'bar-3': { baseFee: 70, minutes: 2, minScore: 38 }, afterhours: { baseFee: 120, minutes: 3, minScore: 50 },
  club: { baseFee: 220, minutes: 4, minScore: 55 }, dispensary: { baseFee: 0, minutes: 1, minScore: 0 }, gym: { baseFee: 0, minutes: 1, minScore: 0 },
};

export interface Booking {
  id: number; venue: VenueId; via: 'call' | 'visit';
  /** Absolute game hours (day * 24 + hour) the window opens and closes. */
  from: number; to: number; minutes: number; minScore: number; baseFee: number;
  state: GigState; fee: number;
}

export interface GigOutcome {
  booking: Booking; tier: GigTier; fee: number; crowd: number; score: number;
  /** The venue would book you again (liking above the line and the set cleared the pass mark). */
  rebook: boolean; liking: number; message: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const BAN_LIKING = -2;
const MAX_LIKING = 4;

/**
 * Crowd meter: a smoothed 0..1 value the HUD can show while a set runs. Feed it the DJ game's live quality (0..1) every
 * step; `value` rises slowly and falls a little faster (like DjGame's own crowd). `average` is what settles the fee when
 * the host has no DjGame crowd number.
 */
export class CrowdMeter {
  value = 0.3;
  private sum = 0;
  private time = 0;
  reset(start = 0.3): void { this.value = clamp(start, 0, 1); this.sum = 0; this.time = 0; }
  feed(dt: number, quality: number): void {
    if (!(dt > 0)) return;
    const target = clamp(quality, 0, 1), rate = target > this.value ? 0.15 : 0.25;
    this.value = clamp(this.value + clamp(target - this.value, -rate * dt, rate * dt), 0, 1);
    this.sum += this.value * dt; this.time += dt;
  }
  get average(): number { return this.time > 0 ? this.sum / this.time : this.value; }
}

export interface GigSave { v: 1; day: number; hour: number; next: number; bookings: Booking[]; liking: Partial<Record<VenueId, number>>; played: number; earned: number }

export class GigBook {
  bookings: Booking[] = [];
  liking: Partial<Record<VenueId, number>> = {};
  played = 0;
  earned = 0;
  readonly crowd = new CrowdMeter();
  private day = 0;
  private hour = -1;
  private next = 1;

  /** Absolute game hours now. */
  get now(): number { return this.day * 24 + Math.max(0, this.hour); }

  advance(hour: number): void {
    if (!finite(hour) || hour < 0) return;
    if (this.hour >= 0 && hour < this.hour - 6) this.day++; // wrapped past midnight
    this.hour = hour;
    for (const b of this.bookings) if (b.state === 'booked' && this.now > b.to) b.state = 'missed';
  }

  likingOf(v: VenueId): number { return this.liking[v] ?? 0; }
  isBanned(v: VenueId): boolean { return this.likingOf(v) <= BAN_LIKING; }

  /**
   * Ask for a slot. The slot is tonight at the venue's opening time, or the next half hour if it is already open;
   * `startHour` overrides (missions that fix the night). A visit in person is a little better than a call (+10 percent fee).
   */
  request(venue: VenueId, via: 'call' | 'visit', opts: { startHour?: number; baseFee?: number; minutes?: number } = {}): { ok: true; booking: Booking } | { ok: false; reason: RequestRefusal } {
    const info = VENUES[venue];
    if (!info) return { ok: false, reason: 'unknownVenue' };
    if (this.isBanned(venue)) return { ok: false, reason: 'banned' };
    if (this.bookings.some((b) => b.venue === venue && b.state === 'booked')) return { ok: false, reason: 'alreadyBooked' };
    const t = GIG_TERMS[venue];
    const h = Math.max(0, this.hour);
    let startAbs: number;
    if (opts.startHour !== undefined) {
      startAbs = this.day * 24 + opts.startHour;
      if (startAbs + 0.5 < this.now) startAbs += 24;
    } else if (venueOpen(venue, h)) startAbs = this.now + 0.5;
    else {
      const open = info.open[0];
      startAbs = this.day * 24 + open;
      if (startAbs < this.now) startAbs += 24;
      if (open >= 24) startAbs = this.day * 24 + (open % 24); // a late opener is tonight, past midnight handled by wrap
    }
    const minutes = opts.minutes ?? t.minutes;
    const liking = this.likingOf(venue);
    const fee = Math.round((opts.baseFee ?? t.baseFee) * (via === 'visit' ? 1.1 : 1) * (1 + 0.1 * clamp(liking, 0, 3)));
    const booking: Booking = { id: this.next++, venue, via, from: startAbs, to: startAbs + 3, minutes, minScore: t.minScore, baseFee: fee, state: 'booked', fee: 0 };
    this.bookings.push(booking);
    return { ok: true, booking };
  }

  /** The booking whose window is open right now, if any. */
  active(): Booking | null { return this.bookings.find((b) => b.state === 'booked' && this.now >= b.from - 0.25 && this.now <= b.to) ?? null; }
  open(venue: VenueId): Booking | null { return this.bookings.find((b) => b.venue === venue && b.state === 'booked') ?? null; }

  /**
   * The set is over. `crowd` 0..1 (DjGame's SetResult.crowd, or the meter's average), `score` 0..100, `turnout` 0..1 is the
   * promotion's turnout (0.5 when nobody promoted: neutral). Pays nothing itself: the host adds `outcome.fee` to the wallet.
   */
  settle(venue: VenueId, r: { score: number; crowd: number }, turnout = 0.5): GigOutcome | null {
    const b = this.open(venue);
    if (!b) return null;
    const score = clamp(r.score, 0, 100), crowd = clamp(r.crowd, 0, 1);
    const passed = score >= b.minScore;
    const tier: GigTier = !passed ? 'flop' : score < 60 ? 'ok' : score < 80 ? 'good' : 'great';
    // The room fills with the turnout; a full house pays up to a quarter more, an empty one a quarter less.
    const room = 0.75 + 0.5 * clamp(turnout, 0, 1);
    const fee = !passed ? 0 : Math.round(b.baseFee * (0.45 + 0.75 * crowd) * room * (tier === 'great' ? 1.15 : 1));
    b.fee = fee; b.state = passed ? 'played' : 'flopped';
    const delta = tier === 'great' ? 2 : tier === 'good' ? 1 : tier === 'ok' ? 0 : -1;
    const liking = clamp(this.likingOf(venue) + delta, -4, MAX_LIKING);
    this.liking[venue] = liking;
    if (passed) this.played++;
    this.earned += fee;
    const rebook = passed && liking >= 0;
    const message = tier === 'flop' ? 'The floor emptied. The owner stops returning your texts.'
      : tier === 'ok' ? 'Fine. Nobody complained. Nobody told a friend either.'
      : tier === 'good' ? 'The room stayed. The owner says to call about next month.' : 'People asked who the DJ was. The owner is already writing dates down.';
    return { booking: b, tier, fee, crowd, score, rebook, liking, message };
  }

  serialize(): GigSave { return { v: 1, day: this.day, hour: this.hour, next: this.next, bookings: this.bookings.map((b) => ({ ...b })), liking: { ...this.liking }, played: this.played, earned: this.earned }; }
  restore(d: unknown): boolean {
    if (typeof d !== 'object' || d === null) return false;
    const o = d as Partial<GigSave>;
    if (o.v !== 1 || !finite(o.day) || !finite(o.hour) || !finite(o.next) || !Array.isArray(o.bookings)) return false;
    const ok = o.bookings.every((b) => b && finite(b.id) && typeof b.venue === 'string' && b.venue in VENUES && finite(b.from) && finite(b.to) && finite(b.fee) && ['booked', 'played', 'flopped', 'missed'].includes(b.state));
    if (!ok) return false;
    this.day = o.day; this.hour = o.hour; this.next = o.next; this.bookings = o.bookings.map((b) => ({ ...b }));
    this.liking = {};
    for (const [k, v] of Object.entries(o.liking ?? {})) if (k in VENUES && finite(v)) this.liking[k as VenueId] = clamp(v, -4, MAX_LIKING);
    this.played = finite(o.played) ? o.played : 0; this.earned = finite(o.earned) ? o.earned : 0;
    return true;
  }
}
