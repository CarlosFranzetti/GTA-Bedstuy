/**
 * POLICE2: where the jail is. One precinct door per map, under an invented name (MEMORY.md rule 4).
 * Real-street map: the landmark "Ironside Station House" (the old station house among the first twenty landmarks).
 * Grid map: it has no police building, so a marked door on a block face: "Cardinal Row Precinct" (a map pin and a blue lamp, no building).
 */
import type { Vec2 } from '@/core/Math2';

export interface PrecinctSite {
  id: string;
  name: string;
  /** the door, on the building line */
  door: Vec2;
  /** where a released player stands on the pavement outside the door */
  spot: Vec2;
  /** heading (rad, 0 = north, clockwise) the released player faces: away from the door, toward the street */
  heading: number;
}

export type PrecinctMap = 'grid' | 'real';

/** The grid map's precinct: south face of block r1c1 (curb z = -5, building line about 3 m in). */
export const GRID_PRECINCT: PrecinctSite = {
  id: 'cardinal-row-precinct', name: 'Cardinal Row Precinct', door: { x: 60, z: -8.4 }, spot: { x: 60, z: -6.2 }, heading: Math.PI, // facing south (+z), toward the street
};

export const REAL_PRECINCT_LANDMARK_ID = 'ironside-station-house';

/** The landmark row fields this needs (a LandmarkRow satisfies it). */
export interface PrecinctRow { id: string; name: string; site: { ax: number; az: number; fx: number; fz: number; nx: number; nz: number; w: number; d: number } }

/**
 * The real map's precinct from the landmark rows: the door is the middle of the frontage line; the spot is 2 m out toward the street
 * (against the lot normal), snapped to the walking surface by `snap` when given (the sidewalk graph's nearest node).
 */
export function realPrecinct(rows: readonly PrecinctRow[], snap?: (p: Vec2) => Vec2): PrecinctSite | null {
  const r = rows.find((x) => x.id === REAL_PRECINCT_LANDMARK_ID);
  if (!r) return null;
  const s = r.site;
  const door = { x: s.ax + s.fx * s.w / 2, z: s.az + s.fz * s.w / 2 };
  const out = { x: door.x - s.nx * 2.2, z: door.z - s.nz * 2.2 };
  const spot = snap ? snap(out) : out;
  return { id: r.id, name: r.name, door, spot, heading: Math.atan2(-s.nx, s.nz) };
}

export function precinctFor(map: PrecinctMap, rows: readonly PrecinctRow[] = [], snap?: (p: Vec2) => Vec2): PrecinctSite {
  return (map === 'real' ? realPrecinct(rows, snap) : null) ?? GRID_PRECINCT;
}

/** The map blip for a precinct that is not already a landmark (the grid's; the real map's blip comes with the landmarks). */
export function precinctPlace(p: PrecinctSite): { id: string; kind: 'venue'; label: string; x: number; z: number; color: string } {
  return { id: `precinct:${p.id}`, kind: 'venue', label: p.name, x: p.door.x, z: p.door.z, color: '#6fa8ff' };
}
