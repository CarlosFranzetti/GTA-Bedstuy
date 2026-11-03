/**
 * Interior definitions: where each door is on the street, where the room lives (far off the map, so its
 * 2D colliders never meet the city's), and the club's opening hours.
 */
export type InteriorId = 'deli' | 'club' | 'home';

export interface DoorDef {
  /** Door centre on the building face (world x, z). */
  x: number; z: number;
  /** Unit vector pointing from the door out to the sidewalk. */
  outX: number; outZ: number;
  /** Legacy trigger radius (m) around the sidewalk point 1.4 m in front of the door; the band below is what counts. */
  radius: number;
  /** How far behind the door line (into the areaway / stoop) the prompt still works. Default DOOR_BAND_IN. */
  depthIn?: number;
}

/** The door prompt zone is a band along the frontage, not one spot: 3.2 m wide along the wall ... */
export const DOOR_BAND_HALF = 1.6;
/** ... reaching 2.6 m out onto the sidewalk (well over the 1.2 m minimum) ... */
export const DOOR_BAND_OUT = 2.6;
/** ... and 0.6 m behind the door line unless the door sets `depthIn`. */
export const DOOR_BAND_IN = 0.6;

export interface InteriorDef {
  id: InteriorId;
  name: string;
  /** Room centre in world space: far from the city (the map is ~500 m across). */
  origin: { x: number; z: number };
  /** Room size, metres: width (x), depth (z), ceiling height. */
  w: number; d: number; h: number;
  door: DoorDef;
  /** Door sign, empty for the unmarked club door. */
  sign: string;
}

/** The map spans about +-300 m; interiors sit 3 km out, 120 m apart. */
export const INTERIORS: Record<InteriorId, InteriorDef> = {
  deli: {
    id: 'deli', name: 'WAX DELI', origin: { x: 3000, z: 3000 }, w: 10, d: 8, h: 3.2, sign: 'WAX DELI · RECORDS & HEROES',
    // the deli door sits on a brownstone's building line: its areaway and stoop (2.8 m deep) count as the doorstep
    door: { x: 11.05, z: 34, outX: -1, outZ: 0, radius: 2.1, depthIn: 2.8 },
  },
  club: {
    id: 'club', name: 'AFTERSLOTH', origin: { x: 3000, z: 3120 }, w: 18, d: 14, h: 4.4, sign: '',
    door: { x: 70, z: -8.55, outX: 0, outZ: 1, radius: 2.0 },
  },
  home: {
    id: 'home', name: 'HOME', origin: { x: 3000, z: 3240 }, w: 8, d: 7, h: 2.8, sign: '',
    door: { x: -11.05, z: -36, outX: 1, outZ: 0, radius: 2.0 },
  },
};

export const INTERIOR_IDS: readonly InteriorId[] = ['deli', 'club', 'home'];

/** Story flag that MISS2's password mission sets to reveal the club door. */
export const CLUB_UNLOCK_FLAG = 'aftersloth.unlocked';
/** Story flag that lets the player use the club booth (earned slot). */
export const CLUB_SLOT_FLAG = 'aftersloth.slot';
export const CLUB_OPEN_HOUR = 23;
export const CLUB_CLOSE_HOUR = 4;

/** True between 23:00 and 04:00. `hour` is 0..24 (fractions allowed). */
export function isClubHours(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= CLUB_OPEN_HOUR || h < CLUB_CLOSE_HOUR;
}

/** The door opens only in club hours and only after the password mission flagged it. */
export function isClubOpen(hour: number, unlocked: boolean): boolean { return unlocked && isClubHours(hour); }

/** The sidewalk point the player stands on to use a door. */
export function doorTrigger(def: InteriorDef): { x: number; z: number } {
  return { x: def.door.x + def.door.outX * 1.4, z: def.door.z + def.door.outZ * 1.4 };
}

/** Door-local coordinates of a point: `along` the frontage (right-hand tangent of `out`) and `out` from the door line. */
export function doorLocal(def: InteriorDef, x: number, z: number): { along: number; out: number } {
  const dx = x - def.door.x, dz = z - def.door.z;
  return { along: dx * -def.door.outZ + dz * def.door.outX, out: dx * def.door.outX + dz * def.door.outZ };
}

/** True when (x, z) is inside the door's prompt band: |along| <= 1.6 m and -depthIn <= out <= 2.6 m. */
export function inDoorBand(def: InteriorDef, x: number, z: number): boolean {
  const { along, out } = doorLocal(def, x, z);
  return Math.abs(along) <= DOOR_BAND_HALF && out <= DOOR_BAND_OUT && out >= -(def.door.depthIn ?? DOOR_BAND_IN);
}

/** Player heading (radians, 0 = north/-z) when facing out of the door. */
export function outwardHeading(def: InteriorDef): number { return Math.atan2(def.door.outX, -def.door.outZ); }

/** Ids used on the EventBus and by missions (MISS2 agreement): 'wax-deli', 'aftersloth', 'home'. */
export const EVENT_ID: Record<InteriorId, string> = { deli: 'wax-deli', club: 'aftersloth', home: 'home' };
