/**
 * Adapter between the story systems and the VENUES registry (src/world/venues/venues.ts: names, doors, hours; VENUES owns
 * them). Venue ids are plain strings here so a rename in the registry (bar-sports -> bar-dance) cannot break the build:
 * every lookup falls back to something sensible for an id it does not know (tests pass made-up ids too).
 * Positions: `venuePoint` asks the registry for the active map ('real' after `useRealPlaces`, else 'grid').
 */
import type { Vec2 } from '@/core/Math2';
import { isRealPlaces } from '@/game/missions/content/places';
import { isOpen as registryOpen, isVenueId, venuePosition, venueById } from '@/world/venues/venues';

export type VenueId = string;
export type VenueKind = 'bar' | 'afterhours' | 'club' | 'dispensary' | 'gym';

/** Ids the story uses, in the writer's vocabulary (BIBLE.md section 5). `bar-sports` is the registry's old id for `bar-dance`. */
export const STORY_VENUES = ['bar-dive', 'bar-lounge', 'bar-dance', 'afterhours', 'club', 'dispensary', 'gym'] as const;
const ALIAS: Record<string, string> = { 'bar-dance': 'bar-sports', 'bar-sports': 'bar-dance' };

const KIND_OF: Record<string, VenueKind> = { 'bar-dive': 'bar', 'bar-lounge': 'bar', 'bar-dance': 'bar', 'bar-sports': 'bar', afterhours: 'afterhours', club: 'club', dispensary: 'dispensary', gym: 'gym' };
const CAPACITY: Record<VenueKind, number> = { bar: 60, afterhours: 45, club: 160, dispensary: 20, gym: 40 };
const CAPACITY_OVERRIDE: Record<string, number> = { 'bar-dive': 55, 'bar-lounge': 70, 'bar-dance': 80, 'bar-sports': 80 };

/** The registry row for an id (or its alias), or null. */
function row(id: VenueId) {
  for (const k of [id, ALIAS[id]]) if (k && isVenueId(k)) return venueById(k);
  return null;
}

export const knownVenue = (id: string): boolean => id in KIND_OF || row(id) !== null;
export const venueKind = (id: VenueId): VenueKind => row(id)?.kind ?? KIND_OF[id] ?? 'bar';
export const venueName = (id: VenueId): string => row(id)?.name ?? id;
export const capacityOf = (id: VenueId): number => CAPACITY_OVERRIDE[id] ?? CAPACITY[venueKind(id)];
/** Hour (0..24) the door opens, from the registry. */
export const openingHour = (id: VenueId): number => row(id)?.hours.open ?? 18;
export function venueOpen(id: VenueId, hour: number): boolean {
  const r = row(id);
  return r ? registryOpen(r.id, hour) : true;
}
/** The sidewalk spot in front of the door on the active map. */
export function venuePoint(id: VenueId): Vec2 {
  const r = row(id);
  if (!r) throw new Error(`unknown venue ${id}`);
  return venuePosition(isRealPlaces() ? 'real' : 'grid', r.id);
}

