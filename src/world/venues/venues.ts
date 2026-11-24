/**
 * VENUES: the seven nightlife and street places of the story (three bars, an after-hours, a club, a dispensary, a gym).
 * ONE table. To rename a place change `name` (and `sign`); to move one change its `grid` / `real` door. Pure data and pure
 * functions: no three.js, no DOM, no imports from the real-map code, so it is safe in the single-file build.
 *
 *   venueById(id)             the row
 *   venueDoor(map, id)        the door on that map: x, z on the building line, out = unit vector toward the street
 *   venuePosition(map, id)    the sidewalk spot in front of the door (where to send the player, a marker, an NPC)
 *   isOpen(id, hour, flag?)   opening hours in game time (hour 0..24, wraps past midnight)
 *   venueRoomOrigin(id)       where the room parks (3 km off the map, as the other interiors)
 *
 * Positions were chosen against the grid's seeded lots and the real map's lot data (see tests/unit/world/venues/). The real
 * doors are the centre of the lot's building footprint on the lot front, `bbl` is the tax lot. Never rebuild the road network
 * for these: they stand on existing lots (the 581 kept block numbers are untouched).
 */

export type VenueId = 'bar-dive' | 'bar-lounge' | 'bar-sports' | 'afterhours' | 'club' | 'dispensary' | 'gym';
export type VenueKind = 'bar' | 'afterhours' | 'club' | 'dispensary' | 'gym';
export type MapName = 'grid' | 'real';

export interface VenueDoor { x: number; z: number; outX: number; outZ: number }
export interface RealDoor extends VenueDoor { bbl: string; street: string }
export interface GridDoor extends VenueDoor { lot: string; street: string }

export interface VenueHours {
  /** hour of day 0..24 the door opens */
  open: number;
  /** hour the door shuts; smaller than `open` means after midnight */
  close: number;
}

export interface VenueRow {
  id: VenueId;
  /** the INVENTED name shown on the sign, the map and the prompt (rename here; nowhere else) */
  name: string;
  /** the sign board text (short, in the game's fonts); the long form can carry a tagline after a middle dot */
  sign: string;
  kind: VenueKind;
  /** one line for the map screen and the prompt */
  blurb: string;
  hours: VenueHours;
  /** if set, the door only opens for a player holding this story flag (null: anyone, in hours) */
  requiresFlag: string | null;
  /** sign board colours */
  look: { bg: string; fg: string; accent: string };
  grid: GridDoor;
  real: RealDoor;
}

/** the table. Hours are game time. */
export const VENUES: readonly VenueRow[] = [
  {
    id: 'bar-dive', name: 'Lucky Nickel', sign: 'LUCKY NICKEL', kind: 'bar',
    blurb: 'A dive bar with a jukebox that only knows one decade.',
    hours: { open: 12, close: 4 }, requiresFlag: null, look: { bg: '#2a1a12', fg: '#ffd87a', accent: '#c8481f' },
    grid: { lot: 'r3c0-W-2', street: 'Tompkins Ave', x: -238.95, z: 128.9, outX: -1, outZ: 0 },
    real: { bbl: '3017770064', street: 'Dekalb Ave', x: 56.35, z: -93.12, outX: 0, outZ: 1 },
  },
  {
    id: 'bar-lounge', name: 'The Velvet Pigeon', sign: 'THE VELVET PIGEON', kind: 'bar',
    blurb: 'Cocktails, candle wax and people pretending not to look at each other.',
    hours: { open: 17, close: 2 }, requiresFlag: null, look: { bg: '#2b1030', fg: '#ffb4d6', accent: '#ff4fa0' },
    grid: { lot: 'r3c1-N-28', street: 'Lafayette Ave', x: 31.3, z: 110.55, outX: 0, outZ: -1 },
    real: { bbl: '3017870036', street: 'Kosciuszko St', x: 218, z: 8.9, outX: 0, outZ: -1 },
  },
  {
    id: 'bar-sports', name: 'Dugout 49', sign: 'DUGOUT 49', kind: 'bar',
    blurb: 'Three screens, four games, and one argument a night.',
    hours: { open: 11, close: 2 }, requiresFlag: null, look: { bg: '#10243d', fg: '#f4f1e6', accent: '#e63946' },
    grid: { lot: 'r4c1-E-5', street: 'Marcus Garvey Blvd', x: 238.95, z: 252.1, outX: 1, outZ: 0 },
    real: { bbl: '3017770042', street: 'Dekalb Ave', x: 196.51, z: -93.18, outX: 0, outZ: 1 },
  },
  {
    id: 'afterhours', name: 'Sunrise Annex', sign: 'SUNRISE ANNEX', kind: 'afterhours',
    blurb: 'A steel gate by day. When the clubs shut, this is where the night goes on.',
    hours: { open: 4, close: 11 }, requiresFlag: null, look: { bg: '#1c1c1f', fg: '#ffcf5a', accent: '#ff8a00' },
    grid: { lot: 'r4c0-N-0', street: 'Van Buren St', x: -28.6, z: 208.55, outX: 0, outZ: -1 },
    real: { bbl: '3017920146', street: 'Van Buren St', x: 224.95, z: 155.89, outX: 0, outZ: 1 },
  },
  {
    id: 'club', name: 'Neon Paloma', sign: 'NEON PALOMA', kind: 'club',
    blurb: 'Velvet rope, a real booth and a floor that fills after eleven.',
    hours: { open: 22, close: 5 }, requiresFlag: null, look: { bg: '#10051c', fg: '#6ff3ff', accent: '#ff2d95' },
    grid: { lot: 'r2c2-W-2', street: 'Marcus Garvey Blvd', x: 261.05, z: 33.6, outX: -1, outZ: 0 },
    real: { bbl: '3017770033', street: 'Marcus Garvey Blvd', x: 231.24, z: -132.54, outX: 1, outZ: 0 },
  },
  {
    id: 'dispensary', name: 'Fernwell', sign: 'FERNWELL', kind: 'dispensary',
    blurb: 'A clean white shopfront and a menu on a screen. Licensed, supposedly.',
    hours: { open: 10, close: 21 }, requiresFlag: null, look: { bg: '#e9efe6', fg: '#2f5d3a', accent: '#5fbf6a' },
    grid: { lot: 'r3c1-N-0', street: 'Lafayette Ave', x: 220.5, z: 110.55, outX: 0, outZ: -1 },
    real: { bbl: '3017750044', street: 'Tompkins Ave', x: -232.7, z: -98.9, outX: -1, outZ: 0 },
  },
  {
    id: 'gym', name: 'Iron Stoop Gym', sign: 'IRON STOOP GYM', kind: 'gym',
    blurb: 'Rubber floors, loud plates, one working fan.',
    hours: { open: 5, close: 23 }, requiresFlag: null, look: { bg: '#161616', fg: '#f2f2f2', accent: '#ffd400' },
    grid: { lot: 'r-1c1-N-2', street: 'Myrtle Ave', x: 199.3, z: -289.45, outX: 0, outZ: -1 },
    real: { bbl: '3017680037', street: 'Willoughby Ave', x: -34.29, z: -320.86, outX: 0, outZ: -1 },
  },
];

export const VENUE_IDS: readonly VenueId[] = VENUES.map((v) => v.id);
const BY_ID = new Map<string, VenueRow>(VENUES.map((v) => [v.id, v]));

export const isVenueId = (id: string): id is VenueId => BY_ID.has(id);

export function venueById(id: VenueId): VenueRow {
  const v = BY_ID.get(id);
  if (!v) throw new Error(`unknown venue ${id}`);
  return v;
}

export const venuesOfKind = (kind: VenueKind): VenueRow[] => VENUES.filter((v) => v.kind === kind);

/** the door on a map (the object is shared: the interior system moves its own copy, this table stays as written) */
export function venueDoor(map: MapName, id: VenueId): VenueDoor {
  const v = venueById(id)[map];
  return { x: v.x, z: v.z, outX: v.outX, outZ: v.outZ };
}

/** how far in front of the door the "arrive here" spot is: the middle of a 4 m sidewalk plus a little */
export const SPOT_OUT_M = 2.2;

/** the sidewalk spot in front of the door */
export function venuePosition(map: MapName, id: VenueId): { x: number; z: number } {
  const d = venueDoor(map, id);
  return { x: d.x + d.outX * SPOT_OUT_M, z: d.z + d.outZ * SPOT_OUT_M };
}

/** true when `hour` (0..24, fractions allowed, any real number) falls in the venue's opening hours */
export function isOpen(id: VenueId, hour: number, hasFlag?: (flag: string) => boolean): boolean {
  const v = venueById(id);
  if (v.requiresFlag && !(hasFlag?.(v.requiresFlag) ?? false)) return false;
  const h = ((hour % 24) + 24) % 24;
  const { open, close } = v.hours;
  return open <= close ? h >= open && h < close : h >= open || h < close;
}

/** "5 PM to 2 AM" for the closed prompt */
export function hoursText(id: VenueId): string {
  const f = (h: number): string => { const x = h % 24; return `${x % 12 === 0 ? 12 : x % 12} ${x < 12 ? 'AM' : 'PM'}`; };
  const { open, close } = venueById(id).hours;
  return `${f(open)} to ${f(close)}`;
}

/** Room metrics and where each room parks (3 km out, clear of the deli, club and home at z 3000..3240). */
export const VENUE_ROOM: Record<VenueId, { w: number; d: number; h: number; origin: { x: number; z: number } }> = {
  'bar-dive': { w: 10, d: 8, h: 3.0, origin: { x: 3200, z: 3000 } },
  'bar-lounge': { w: 11, d: 8, h: 3.2, origin: { x: 3200, z: 3120 } },
  'bar-sports': { w: 13, d: 9, h: 3.4, origin: { x: 3200, z: 3240 } },
  afterhours: { w: 12, d: 9, h: 3.4, origin: { x: 3200, z: 3360 } },
  club: { w: 22, d: 16, h: 4.8, origin: { x: 3400, z: 3000 } },
  dispensary: { w: 9, d: 7, h: 3.0, origin: { x: 3400, z: 3120 } },
  gym: { w: 16, d: 11, h: 3.6, origin: { x: 3400, z: 3240 } },
};

/** world-space markers for the map screen: the ones the player has discovered (`seen(id)`) on this map. Same shape as ui/MapScreen's MapPlace. */
export function venuePlaces(map: MapName, seen: (id: VenueId) => boolean): Array<{ id: string; kind: 'venue'; label: string; x: number; z: number; color: string }> {
  return VENUES.filter((v) => seen(v.id)).map((v) => {
    const p = venuePosition(map, v.id);
    return { id: `venue:${v.id}`, kind: 'venue' as const, label: v.name, x: p.x, z: p.z, color: v.look.accent };
  });
}

/** the story flag set when the player first comes within DISCOVER_M of a venue's door */
export const seenFlag = (id: VenueId): string => `venue.${id}.seen`;
export const DISCOVER_M = 45;

/** which venue (if any) the player has just come close to; the caller sets the flag and shows the toast */
export function venueNear(map: MapName, x: number, z: number, seen: (id: VenueId) => boolean): VenueId | null {
  for (const v of VENUES) {
    if (seen(v.id)) continue;
    const p = venuePosition(map, v.id);
    if (Math.hypot(p.x - x, p.z - z) <= DISCOVER_M) return v.id;
  }
  return null;
}
