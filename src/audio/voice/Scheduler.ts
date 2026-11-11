/**
 * What goes on air and in which order. Pure logic, no audio:
 *  - `Rotation` hands out every item once before any repeats (shuffle bag), across station changes.
 *  - `djBlock` builds a DJ's lines for a station event (ident, set change, idle fill) from real now-playing data.
 *  - `TalkSchedule` runs WBSY Talk: shows and commercial breaks in rotation, resumable at the line where the listener left.
 */
import { castMember } from './cast';
import { ADS, DJ_COPY, HOODS, TALK_SHOWS } from './shows';
import { fillSlots, type Slots } from './script';
import type { ResolvedLine } from './SpeechPlayer';
import type { Show, ScriptLine, VoiceContext } from './types';
import { shortStreet, spokenTime, weatherPhrase, type WeatherKind } from '../announcer/scripts';
import type { ScStationId } from '../radio';

export type Random = () => number;

export class Rotation<T> {
  private bag: number[] = [];
  private lastIdx = -1;
  constructor(private readonly items: readonly T[], private readonly random: Random = Math.random) {}
  get size(): number { return this.items.length; }
  /** Remaining items before the pool refills. */
  get remaining(): number { return this.bag.length; }
  next(): T {
    if (this.items.length === 0) throw new Error('empty rotation');
    if (this.bag.length === 0) {
      this.bag = this.items.map((_, i) => i);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(this.random() * (i + 1)));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      // Never open a refilled bag with the item that just closed the previous one.
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.lastIdx) {
        [this.bag[this.bag.length - 1], this.bag[0]] = [this.bag[0], this.bag[this.bag.length - 1]];
      }
    }
    this.lastIdx = this.bag.pop()!;
    return this.items[this.lastIdx];
  }
}

/* ---------- live-state slots ---------- */

const STAR_WORDS = ['no stars', 'one star', 'two stars', 'three stars', 'four stars', 'five stars'];

function daypart(hour: number): string {
  if (hour < 0) return 'evening';
  const h = Math.floor(hour) % 24;
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

export function contextSlots(ctx: Partial<VoiceContext>, random: Random = Math.random): Slots {
  const hour = typeof ctx.hour === 'number' && ctx.hour >= 0 ? ctx.hour : new Date().getHours() + new Date().getMinutes() / 60;
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour - Math.floor(hour)) * 60);
  const night = hh >= 20 || hh < 5;
  const stars = Math.max(0, Math.min(5, Math.round(ctx.stars ?? 0)));
  const pool = ctx.bulletins ?? [];
  const mission = (ctx.lastMission ?? '').replace(/[-_]+/g, ' ').trim();
  return {
    time: spokenTime(hh, mm),
    street: shortStreet(ctx.street),
    weather: weatherPhrase((ctx.weather as WeatherKind) ?? 'dry', ctx.rain ?? 0, night),
    daypart: daypart(hour),
    stars,
    starsWord: stars === 1 ? 'star' : 'stars',
    mission,
    bulletin: pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : '',
    hood: HOODS[Math.min(HOODS.length - 1, Math.floor(random() * HOODS.length))],
  };
}

export function lineAllowed(l: ScriptLine, ctx: Partial<VoiceContext>): boolean {
  const hour = typeof ctx.hour === 'number' && ctx.hour >= 0 ? Math.floor(ctx.hour) % 24 : new Date().getHours();
  switch (l.when) {
    case undefined: return true;
    case 'wanted': return (ctx.stars ?? 0) >= 1;
    case 'calm': return (ctx.stars ?? 0) < 1;
    case 'mission': return !!ctx.lastMission;
    case 'bulletin': return (ctx.bulletins?.length ?? 0) > 0;
    case 'rain': return (ctx.rain ?? 0) > 0.05 || ctx.weather === 'rain';
    case 'night': return hour >= 22 || hour < 5;
  }
}

/** Resolves a show against live state: drops lines whose condition is not met, fills slots. */
export function resolveShow(show: Show, ctx: Partial<VoiceContext>, random: Random = Math.random): ResolvedLine[] {
  const slots = contextSlots(ctx, random);
  const out: ResolvedLine[] = [];
  for (const l of show.lines) {
    if (!lineAllowed(l, ctx)) continue;
    const text = fillSlots(l.text, slots);
    if (text) out.push({ who: l.who, text });
  }
  return out;
}

/* ---------- DJs ---------- */

export type DjEvent = 'id' | 'set' | 'idle';
export interface SetNames { dj?: string; title?: string }

export interface DjOut { lines: ResolvedLine[]; label: string }

/** One rotation per station and category, so a DJ never repeats a line before running through all of them. */
export class DjScheduler {
  private readonly rot = new Map<string, Rotation<string>>();
  private idleCount = new Map<string, number>();
  private readonly adRot: Rotation<Show>;
  constructor(private readonly random: Random = Math.random) { this.adRot = new Rotation(ADS, random); }

  private pick(station: ScStationId, cat: 'idents' | 'intros' | 'outros' | 'blind' | 'hours' | 'traffic' | 'shouts'): string {
    const k = `${station}:${cat}`;
    let r = this.rot.get(k);
    if (!r) { r = new Rotation(DJ_COPY[station][cat], this.random); this.rot.set(k, r); }
    return r.next();
  }

  /** Station tune-in ident. */
  ident(station: ScStationId, name: string, freq: string, ctx: Partial<VoiceContext>): DjOut {
    const who = DJ_COPY[station].who;
    const slots = { ...contextSlots(ctx, this.random), station: name, freq };
    return { label: 'ident', lines: [{ who, text: fillSlots(this.pick(station, 'idents'), slots) }] };
  }

  /** Back-announce the set that ended and introduce the next one with the real names from the feed. */
  betweenSets(station: ScStationId, name: string, freq: string, prev: SetNames | null, next: SetNames | null, ctx: Partial<VoiceContext>): DjOut {
    const who = DJ_COPY[station].who;
    const slots: Slots = { ...contextSlots(ctx, this.random), station: name, freq, prevDj: prev?.dj, prevTitle: prev?.title, dj: next?.dj, title: next?.title };
    const lines: ResolvedLine[] = [];
    if (prev && (prev.dj || prev.title)) {
      slots.prevDj ||= 'the last DJ';
      slots.prevTitle ||= 'that set';
      lines.push({ who, text: fillSlots(this.pick(station, 'outros'), slots) });
    }
    lines.push({ who, text: fillSlots(this.pick(station, next && next.dj && next.title ? 'intros' : 'blind'), slots) });
    return { label: 'set', lines };
  }

  /** Filler between sets: time and weather, traffic, shout-outs to the neighbourhood, idents, now and then a commercial. */
  idle(station: ScStationId, name: string, freq: string, ctx: Partial<VoiceContext>): DjOut {
    const who = DJ_COPY[station].who;
    const n = (this.idleCount.get(station) ?? 0) + 1;
    this.idleCount.set(station, n);
    const slots = { ...contextSlots(ctx, this.random), station: name, freq };
    if (n % 4 === 0) {
      const ad = this.adRot.next();
      const intro = { who, text: fillSlots('A word from our sponsors.', slots) };
      return { label: 'ad', lines: [intro, ...ad.lines.map((l) => ({ who: l.who, text: fillSlots(l.text, slots) }))] };
    }
    const cats = ['hours', 'traffic', 'shouts', 'idents'] as const;
    const cat = cats[(n - 1) % cats.length];
    return { label: cat, lines: [{ who, text: fillSlots(this.pick(station, cat), slots) }] };
  }
}

/* ---------- WBSY Talk ---------- */

export interface TalkBlock { show: Show; lines: ResolvedLine[]; at: number; ad: boolean }

export class TalkSchedule {
  private readonly shows: Rotation<Show>;
  private readonly ads: Rotation<Show>;
  private block: TalkBlock | null = null;
  private adsLeft = 0;
  private breakLen = 2;
  private upcoming: TalkBlock | null = null;
  /** Everything that went on air, newest last (tests and the transcript). */
  readonly aired: string[] = [];

  constructor(private readonly random: Random = Math.random, shows: readonly Show[] = TALK_SHOWS, ads: readonly Show[] = ADS) {
    this.shows = new Rotation(shows, random);
    this.ads = new Rotation(ads, random);
  }

  get current(): TalkBlock | null { return this.block; }

  /** The block on air (starting one if needed). `ctx` resolves slots when a block starts. */
  ensure(ctx: Partial<VoiceContext>): TalkBlock {
    if (!this.block) this.block = this.start(this.shows.next(), ctx, false);
    return this.block;
  }

  /** Moves to the next block: a show, then one or two commercials, then the next show. */
  advance(ctx: Partial<VoiceContext>): TalkBlock {
    if (this.upcoming) { this.block = this.upcoming; this.upcoming = null; return this.block; }
    return (this.block = this.build(ctx));
  }

  /** Decides (once) what follows the current block so it can be pre-rendered in the background. */
  peekNext(ctx: Partial<VoiceContext>): TalkBlock {
    return (this.upcoming ??= this.build(ctx));
  }

  private build(ctx: Partial<VoiceContext>): TalkBlock {
    const wasAd = this.block?.ad ?? true;
    if (!wasAd) { this.adsLeft = this.breakLen; this.breakLen = this.breakLen === 2 ? 1 : 2; }
    if (this.adsLeft > 0) { this.adsLeft--; return this.start(this.ads.next(), ctx, true); }
    return this.start(this.shows.next(), ctx, false);
  }

  /** The line now on air; a later `ensure()` resumes by replaying it. */
  setAt(i: number): void { if (this.block) this.block.at = Math.max(0, Math.min(this.block.lines.length, i)); }

  get fraction(): number { return this.block && this.block.lines.length ? this.block.at / this.block.lines.length : 0; }

  private start(show: Show, ctx: Partial<VoiceContext>, ad: boolean): TalkBlock {
    this.aired.push(show.id);
    return { show, lines: resolveShow(show, ctx, this.random), at: 0, ad };
  }
}

export function hostName(id: string): string { return castMember(id)?.name ?? id; }
