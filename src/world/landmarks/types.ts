/** LANDMARKS: row and site types (plain data; no imports). */

export type LandmarkKind =
  | 'park' | 'pool' | 'playground' | 'housing' | 'church' | 'armory' | 'school' | 'hospital'
  | 'library' | 'stationhouse' | 'firehouse' | 'depot' | 'garden' | 'subway' | 'plaza';

/** A frame in world metres (x east, z south). Local x runs from (ax, az) along (fx, fz); local z runs INTO the site along (nx, nz). */
export interface Site {
  ax: number; az: number;
  fx: number; fz: number;
  nx: number; nz: number;
  /** frontage length and depth (m) */
  w: number; d: number;
  /** index of the real-map block the site sits on (for tests and notes) */
  block: number;
  /** block sites: the block's building ring as x, z, x, z ... in world metres */
  poly?: number[];
}

export interface SourceNote { what: string; url: string; licence: string }

/** one subway stair, in world metres: (x, z) is the middle of the stairwell, (fx, fz) runs along the street, (nx, nz) points away from the kerb */
export interface Entrance { x: number; z: number; fx: number; fz: number; nx: number; nz: number; station: string; colour: string }

export interface LandmarkRow {
  id: string;
  /** the INVENTED name shown on signs, the map and the HUD */
  name: string;
  kind: LandmarkKind;
  /** one short line for the HUD when the player arrives */
  district: string;
  /** one sentence for the map screen */
  blurb: string;
  /** tax lots (BBL) whose generic building is replaced */
  lots: string[];
  site: Site;
  /** the look recipe: numbers and words the builder of that kind reads (massing from footprint, height, materials) */
  look: Record<string, number | string | boolean>;
  sources: SourceNote[];
  /** kind 'subway': the stairs, built one by one (the row's own site is the first of them) */
  entrances?: Entrance[];
}
