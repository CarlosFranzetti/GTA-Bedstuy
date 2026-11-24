/**
 * VENUES in the interior system: each venue is an `InteriorDef` under the id `venue:<id>` (the plain venue ids already mean
 * other things to the deli, club and home tables: 'club' is the hidden AFTERSLOTH room). Pure data; `defs.ts` spreads these in.
 */
import type { InteriorDef } from '../interiors/defs';
import { VENUES, VENUE_ROOM, isVenueId, venueDoor, type MapName, type VenueId } from './venues';

export type VenueInteriorId = `venue:${VenueId}`;

export const interiorIdOf = (id: VenueId): VenueInteriorId => `venue:${id}`;
/** the venue behind an interior id, or null for the deli, club and home */
export function venueOfInterior(id: string): VenueId | null {
  if (!id.startsWith('venue:')) return null;
  const v = id.slice(6);
  return isVenueId(v) ? v : null;
}

/** the venues' interior rows; doors start on the GRID map (the default) and `applyVenueDoors('real')` moves them */
export function venueInteriorDefs(): Record<VenueInteriorId, InteriorDef> {
  const out = {} as Record<VenueInteriorId, InteriorDef>;
  for (const v of VENUES) {
    const r = VENUE_ROOM[v.id];
    const d = venueDoor('grid', v.id);
    out[interiorIdOf(v.id)] = {
      id: interiorIdOf(v.id), name: v.name, origin: { ...r.origin }, w: r.w, d: r.d, h: r.h, sign: v.sign,
      door: { x: d.x, z: d.z, outX: d.outX, outZ: d.outZ, radius: 2.0 },
    };
  }
  return out;
}

export const venueEventIds = (): Record<VenueInteriorId, string> => {
  const out = {} as Record<VenueInteriorId, string>;
  for (const v of VENUES) out[interiorIdOf(v.id)] = v.id;
  return out;
};

/** Moves every venue door (in the shared INTERIORS table) to its place on `map`. Call before the interiors are built. */
export function applyVenueDoors(table: Record<string, { door: { x: number; z: number; outX: number; outZ: number } }>, map: MapName): void {
  for (const v of VENUES) {
    const e = table[interiorIdOf(v.id)];
    if (e) Object.assign(e.door, venueDoor(map, v.id));
  }
}
