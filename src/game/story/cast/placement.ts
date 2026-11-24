/**
 * STORY PEOPLE IN THE WORLD. A named character stands at a spot (behind a counter, at a bar, on a corner) when a mission or the hour
 * calls for it. They are real pedestrians (the same model, hit reactions, blood and combat as everybody) but owned here, not by the
 * crowd: the crowd's scheduler never sees them (so it cannot recycle, remove or pair them), their spec has weight 0 (the random crowd
 * cannot draw them), and `place` refuses a second copy of the same person or of whoever the player is.
 *
 * Decisions (the lead may overrule):
 *  - Alive: a placed person is `immune` by default (health floors at 1, never "knocked out", only knocked down for the usual few
 *    seconds). `place(id, { immune: false })` lets a mission fight them to a knock-out; they wake after the usual time.
 *  - After a knock-down or a flee they stand again WHERE THEY ARE if within 4 m of their station (the station follows them), else
 *    they stay held where they stopped until the player is 40 m away, then return to the station unseen.
 *  - Scheduling: with `autoSchedule(true)` a person from `CAST_MEMBERS[].places` is placed when the player is within 90 m of that venue
 *    station during their hours, and removed (unless `keep`) when the player is 140 m away or the hours end. Off by default: a mission
 *    places and removes people itself.
 *  - Traffic: `occupied(pos, r)` lets the vehicle spawner skip a spot; `isClear` (host) keeps spots off the roadway.
 *  - Talk: `prompt(playerPos)` is the interaction prompt ("Talk to Stavros"); `talk()` calls the MISSIONS seat's handler.
 */
import type { Vec2 } from '@/core/Math2';
import { CAST_MEMBERS, castMember, isCastId } from './cast';
import { castSpecId, castVariant, outfitOf } from './specs';
import type { CastId, CastMember, CastVenue, OutfitKey, StationKind } from './types';

/** the part of Pedestrian the system uses (so tests can use a fake) */
export interface StoryPed {
  readonly body: { pos: Vec2; heading: number };
  readonly state: string;
  readonly special?: unknown;
  readonly vitals: { immune: boolean };
  readonly isHeld: boolean;
  holdAt(x: number, z: number, heading: number): void;
  update(dt: number): void;
}
export interface Station { x: number; z: number; heading: number }

export interface PlacementHost {
  /** build the person (a Pedestrian of the registered variant `variant`, id `ped.id`), already in the scene and the physics world */
  create(member: CastMember, variantId: string, variantIndex: number, at: Station): StoryPed | null;
  /** take it out of the scene and the physics world */
  destroy(ped: StoryPed): void;
  /** the spot for a venue station, or null (the VENUES registry decides) */
  stationFor(venue: CastVenue, kind: StationKind, member: CastMember): Station | null;
  /** off the roadway and not inside a parked car */
  isClear(at: Vec2, r: number): boolean;
  playerPos(): Vec2;
  /** the character the player is right now (never placed as a second copy) */
  activeCast(): CastId;
}

export interface PlaceOptions { at?: Station; venue?: CastVenue; station?: StationKind; outfit?: OutfitKey; immune?: boolean; keep?: boolean }
export type PlaceResult = { ok: true; ped: StoryPed; already: boolean } | { ok: false; reason: 'unknown' | 'isPlayer' | 'noSpot' | 'blocked' | 'noPed' };

interface Placed { id: CastId; ped: StoryPed; station: Station; keep: boolean; scheduled: boolean; away: boolean }

export const ACTIVATE_M = 90, DEACTIVATE_M = 140, RETURN_UNSEEN_M = 40, RE_ANCHOR_M = 4, TALK_M = 2.4;
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
/** is `hour` inside [from, to) where `to` may be above 24 (wrap past midnight) */
export function inHours(hour: number, [from, to]: readonly [number, number]): boolean {
  const h = ((hour % 24) + 24) % 24;
  return to <= 24 ? h >= from && h < to : h >= from || h < to - 24;
}

export class StoryPeople {
  private readonly placed = new Map<CastId, Placed>();
  private auto = false;
  private hour = 12; private weekday = 0;
  private talkHandler: ((id: CastId) => void) | null = null;
  constructor(private readonly host: PlacementHost) {}

  isPlaced(id: string): boolean { return this.placed.has(id as CastId); }
  get(id: string): StoryPed | null { return this.placed.get(id as CastId)?.ped ?? null; }
  get count(): number { return this.placed.size; }
  list(): CastId[] { return [...this.placed.keys()]; }
  autoSchedule(on: boolean): void { this.auto = on; }
  setClock(hour: number, weekday: number): void { this.hour = hour; this.weekday = weekday; }
  onTalk(cb: ((id: CastId) => void) | null): void { this.talkHandler = cb; }

  place(id: string, o: PlaceOptions = {}): PlaceResult {
    if (!isCastId(id)) return { ok: false, reason: 'unknown' };
    const m = castMember(id)!;
    if (id === this.host.activeCast()) return { ok: false, reason: 'isPlayer' };
    const have = this.placed.get(id);
    if (have) { if (o.at) { have.station = o.at; have.ped.holdAt(o.at.x, o.at.z, o.at.heading); } return { ok: true, ped: have.ped, already: true }; }
    const st = o.at ?? this.stationOf(m, o.venue, o.station);
    if (!st) return { ok: false, reason: 'noSpot' };
    if (!this.host.isClear(st, 0.6)) return { ok: false, reason: 'blocked' };
    const key = o.outfit ?? (this.hour >= 19 || this.hour < 5 ? 'night' : 'day');
    const { key: worn } = outfitOf(m, key);
    const ped = this.host.create(m, castSpecId(id, worn), castVariant(id, worn), st);
    if (!ped) return { ok: false, reason: 'noPed' };
    ped.vitals.immune = o.immune !== false;
    ped.holdAt(st.x, st.z, st.heading);
    this.placed.set(id, { id, ped, station: { ...st }, keep: !!o.keep, scheduled: false, away: false });
    return { ok: true, ped, already: false };
  }

  remove(id: string): boolean {
    const p = this.placed.get(id as CastId); if (!p) return false;
    this.host.destroy(p.ped); this.placed.delete(id as CastId); return true;
  }
  clear(): void { for (const id of [...this.placed.keys()]) this.remove(id); }

  /** every placed person, for the combat target list (they can be hit like anybody) */
  hittables(): StoryPed[] { return [...this.placed.values()].map((p) => p.ped); }
  /** a spot a spawning car must not take */
  occupied(at: Vec2, r: number): boolean { for (const p of this.placed.values()) if (dist(p.ped.body.pos, at) < r + 0.5) return true; return false; }

  /** the interaction prompt: the nearest placed person within talking distance who is standing (not down or running) */
  prompt(playerPos: Vec2): { id: CastId; name: string; text: string; dist: number } | null {
    let best: { id: CastId; name: string; text: string; dist: number } | null = null;
    for (const p of this.placed.values()) {
      if (!p.ped.isHeld) continue;
      const d = dist(p.ped.body.pos, playerPos);
      if (d <= TALK_M && (!best || d < best.dist)) { const m = castMember(p.id)!; best = { id: p.id, name: m.name, text: `Talk to ${m.name}`, dist: d }; }
    }
    return best;
  }
  /** the player pressed the interaction key: hands off to the dialogue (MISSIONS) */
  talk(playerPos: Vec2): CastId | null {
    const pr = this.prompt(playerPos); if (!pr) return null;
    this.talkHandler?.(pr.id); return pr.id;
  }

  update(dt: number): void {
    const pp = this.host.playerPos();
    if (this.auto) this.schedule(pp);
    for (const p of this.placed.values()) {
      const ped = p.ped, st = ped.state, free = ped.special === null || ped.special === undefined;
      ped.update(dt);
      const s2 = ped.state;
      // stood up or stopped fleeing: back to standing
      if (s2 === 'walking' && free && !ped.isHeld) {
        const here = ped.body.pos;
        if (dist(here, p.station) <= RE_ANCHOR_M) { p.station = { x: here.x, z: here.z, heading: ped.body.heading }; ped.holdAt(here.x, here.z, ped.body.heading); }
        else { p.away = true; ped.holdAt(here.x, here.z, ped.body.heading); }
      }
      if (p.away && dist(ped.body.pos, pp) > RETURN_UNSEEN_M && s2 !== 'down') { ped.holdAt(p.station.x, p.station.z, p.station.heading); p.away = false; }
      void st;
    }
  }

  private stationOf(m: CastMember, venue?: CastVenue, kind?: StationKind): Station | null {
    const place = venue ? m.places.find((q) => q.venue === venue) : m.places[0];
    const v = venue ?? place?.venue, k = kind ?? place?.station;
    return v && k ? this.host.stationFor(v, k, m) : null;
  }

  /** hour-based placement from each person's usual places */
  private schedule(pp: Vec2): void {
    for (const m of CAST_MEMBERS) {
      const have = this.placed.get(m.id);
      const now = m.places.find((q) => inHours(this.hour, q.hours) && (!q.days || q.days.length === 0 || q.days.includes(this.weekday)));
      if (have) {
        if (have.scheduled && !have.keep && (!now || dist(have.ped.body.pos, pp) > DEACTIVATE_M)) this.remove(m.id);
        continue;
      }
      if (!now || m.id === this.host.activeCast()) continue;
      const st = this.host.stationFor(now.venue, now.station, m);
      if (!st || dist(st, pp) > ACTIVATE_M) continue;
      const r = this.place(m.id, { venue: now.venue, station: now.station });
      if (r.ok && !r.already) this.placed.get(m.id)!.scheduled = true;
    }
  }
}
