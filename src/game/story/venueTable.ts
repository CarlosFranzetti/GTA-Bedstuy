/**
 * PLACEHOLDER venue table for the Pedro Martinez story (24 Nov). The VENUES seat owns the real positions and door ids
 * (src/world/venues/). Until then each venue stands in front of an existing POI so missions have a marker on both maps.
 * Swap: call `setVenueResolver(fn)` once with the VENUES seat's lookup; nothing else changes. Names are invented.
 */
import type { Vec2 } from '@/core/Math2';
import { poiSpot, type PlaceCtx } from '@/game/missions/content/places';

export type VenueId = 'bar-1' | 'bar-2' | 'bar-3' | 'afterhours' | 'club' | 'dispensary' | 'gym';
export type VenueKind = 'bar' | 'afterhours' | 'club' | 'dispensary' | 'gym';

export interface VenueInfo {
  id: VenueId; name: string; kind: VenueKind;
  /** Existing POI used as a stand-in until the real door exists. */
  poi: string;
  /** Hours (game clock) the door is open; wraps midnight. */
  open: readonly [number, number];
  /** How many people the room holds (the club night's turnout is capped by it). */
  capacity: number;
}

export const VENUES: Readonly<Record<VenueId, VenueInfo>> = {
  'bar-1': { id: 'bar-1', name: 'The Low Ceiling', kind: 'bar', poi: 'liquor', open: [16, 28], capacity: 60 },
  'bar-2': { id: 'bar-2', name: 'Rusty Metronome', kind: 'bar', poi: 'oxtail', open: [16, 28], capacity: 70 },
  'bar-3': { id: 'bar-3', name: 'Cardinal Row Tap', kind: 'bar', poi: 'komat', open: [15, 28], capacity: 50 },
  afterhours: { id: 'afterhours', name: 'Back Room Four', kind: 'afterhours', poi: 'auto', open: [26, 36], capacity: 45 },
  club: { id: 'club', name: 'Velvet Hydrant', kind: 'club', poi: 'church', open: [22, 30], capacity: 160 },
  dispensary: { id: 'dispensary', name: 'Green Awning Wellness', kind: 'dispensary', poi: 'dollar', open: [10, 22], capacity: 20 },
  gym: { id: 'gym', name: 'Iron Throop', kind: 'gym', poi: 'funeral', open: [6, 23], capacity: 40 },
};

export const VENUE_IDS = Object.keys(VENUES) as VenueId[];

/** True when `hour` (0..24) is inside the venue's opening window; windows past 24 wrap (28 = 4 am). */
export function venueOpen(id: VenueId, hour: number): boolean {
  const [a, b] = VENUES[id].open;
  const h = ((hour % 24) + 24) % 24;
  return (h >= a && h < b) || (h + 24 >= a && h + 24 < b);
}

export type VenueResolver = (ctx: PlaceCtx, id: VenueId) => Vec2;
let resolver: VenueResolver = (ctx, id) => poiSpot(ctx, VENUES[id].poi);
export const setVenueResolver = (fn: VenueResolver | null): void => { resolver = fn ?? ((ctx, id) => poiSpot(ctx, VENUES[id].poi)); };
export const venuePoint = (ctx: PlaceCtx, id: VenueId): Vec2 => resolver(ctx, id);
