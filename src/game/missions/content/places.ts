/**
 * Where things are. Mission content resolves its coordinates from the world data (POIs, streets, lots) instead of
 * hard-coding metres, so a map tweak moves the markers with it.
 */
import type { Vec2 } from '@/core/Math2';
import type { BedstuyData, GridModel, Lot, Side } from '@/world/types';

export interface PlaceCtx {
  grid: GridModel;
  data: BedstuyData;
  /** Built lots (world.lots). When present, a POI resolves to the lot that actually holds it. */
  lots?: readonly Lot[];
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

/** Point on the sidewalk in front of a block face; `t` runs 0..1 left->right along the face (as in bedstuy.json). */
export function facePoint(grid: GridModel, blockId: string, side: Side, t: number, extra = 0): Vec2 {
  const face = grid.blockById(blockId).faces.find((f) => f.side === side);
  if (!face) throw new Error(`no face ${blockId}/${side}`);
  const k = Math.min(1, Math.max(0, t));
  const p = lerp(face.a, face.b, k);
  const off = grid.streetById(face.streetId).sidewalkWidth / 2 + extra;
  return { x: p.x + face.outward.x * off, z: p.z + face.outward.z * off };
}

/** Sidewalk point in front of a POI's door. `along` shifts it along the face in metres (+ toward the face's `b` end). */
export function poiSpot(ctx: PlaceCtx, poiId: string, along = 0): Vec2 {
  const poi = ctx.data.pois.find((p) => p.id === poiId);
  if (!poi) throw new Error(`no poi ${poiId}`);
  const face = ctx.grid.blockById(poi.block).faces.find((f) => f.side === poi.face);
  if (!face) throw new Error(`no face for poi ${poiId}`);
  const lot = ctx.lots?.find((l) => l.poi?.id === poiId);
  const centre: Vec2 = lot ? lerp(lot.frontA, lot.frontB, 0.5) : lerp(face.a, face.b, poi.t);
  const len = Math.hypot(face.b.x - face.a.x, face.b.z - face.a.z) || 1;
  const ux = (face.b.x - face.a.x) / len, uz = (face.b.z - face.a.z) / len;
  const off = ctx.grid.streetById(face.streetId).sidewalkWidth / 2;
  return { x: centre.x + ux * along + face.outward.x * off, z: centre.z + uz * along + face.outward.z * off };
}

/** Middle of a street between two crossing streets, on its centreline. */
export function streetMid(grid: GridModel, streetId: string, fromCrossId: string, toCrossId: string): Vec2 {
  const s = grid.streetById(streetId);
  const mid = (grid.streetById(fromCrossId).offset + grid.streetById(toCrossId).offset) / 2;
  return s.axis === 'ns' ? { x: s.offset, z: mid } : { x: mid, z: s.offset };
}

/** Centreline crossing of a north-south and an east-west street. */
export function corner(grid: GridModel, nsId: string, ewId: string): Vec2 {
  return { x: grid.streetById(nsId).offset, z: grid.streetById(ewId).offset };
}

/** Walkable point `d` metres from `p` along the direction (ux, uz), for yards and alleys. */
export function offset(p: Vec2, dx: number, dz: number): Vec2 {
  return { x: p.x + dx, z: p.z + dz };
}
