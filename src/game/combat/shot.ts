/**
 * A pistol shot: a hitscan along the camera's yaw from the player's chest. The nearest of a pedestrian, a vehicle or a wall wins
 * (World2D.raycast returns the first body along the ray). A small aim assist nudges the ray to a pedestrian standing close to the
 * line of the crosshair, since the camera sits a shoulder's width off the body.
 */
import { angleDiff, forwardFromHeading, headingFromVec, type Vec2 } from '@/core/Math2';
import type { Body2D, IWorld2D } from '@/world/types';
import { PISTOL } from './items';

export type ShotTarget = 'ped' | 'vehicle' | 'wall' | 'none';

export interface ShotResult {
  target: ShotTarget;
  body: Body2D | null;
  /** distance along the ray to the hit (the range on a miss) */
  dist: number;
  point: Vec2;
  /** the direction actually fired along (unit) */
  dir: Vec2;
}

/** Cone, in degrees, inside which a pedestrian pulls the shot onto itself (half angle at 10 m; wider close in, never less than the body). */
export const AIM_ASSIST_DEG = 3.5;

export function resolveShot(world: IWorld2D, origin: Vec2, yaw: number, range: number = PISTOL.range, ignoreId = 'player'): ShotResult {
  const dir = forwardFromHeading(yaw);
  const hit = world.raycast(origin, dir, range, ignoreId);
  if (!hit) return { target: 'none', body: null, dist: range, point: { x: origin.x + dir.x * range, z: origin.z + dir.z * range }, dir };
  const b = hit.body;
  const target: ShotTarget = b.kind === 'ped' ? 'ped' : b.kind === 'vehicle' || b.kind === 'cop' ? 'vehicle' : 'wall';
  return { target, body: b, dist: hit.dist, point: hit.point, dir };
}

/**
 * The yaw to fire along: `yaw`, or the direction to the nearest pedestrian inside the assist cone that has a clear line to the
 * shooter (the first body along the line to it is that pedestrian). `peds` are body positions with ids.
 */
export function assistYaw(world: IWorld2D, origin: Vec2, yaw: number, peds: Iterable<Body2D>, range: number = PISTOL.range, ignoreId = 'player'): number {
  let best: { d: number; yaw: number } | null = null;
  for (const p of peds) {
    const dx = p.pos.x - origin.x, dz = p.pos.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8 || d > range) continue;
    const toYaw = headingFromVec({ x: dx, z: dz });
    const off = Math.abs(angleDiff(yaw, toYaw));
    const cone = Math.max((AIM_ASSIST_DEG * Math.PI) / 180, Math.atan2(0.45, d));
    if (off > cone || (best && d >= best.d)) continue;
    const clear = world.raycast(origin, { x: dx / d, z: dz / d }, d + 0.6, ignoreId);
    if (!clear || clear.body.id !== p.id) continue;
    best = { d, yaw: toYaw };
  }
  return best ? best.yaw : yaw;
}
