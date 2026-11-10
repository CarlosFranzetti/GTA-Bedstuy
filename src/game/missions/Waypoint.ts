/**
 * The player's own map waypoint (set by tapping the full map). One shared point, like NavTargets: MissionHud's pointer aims
 * at it (through the same sidewalk router as missions), the minimap and the map screen draw it, and it clears itself when
 * the player arrives. Pure: no DOM.
 */
import type { Vec2 } from '@/core/Math2';

export interface Waypoint extends Vec2 { label: string }
/** Metres from the waypoint at which it counts as reached. */
export const WAYPOINT_REACHED_M = 8;

let current: Waypoint | null = null;
const listeners = new Set<() => void>();

export const getWaypoint = (): Waypoint | null => current;

export function setWaypoint(p: Vec2 | null, label = 'Waypoint'): void {
  const next = p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z, label } : null;
  if (!next && !current) return;
  current = next;
  for (const fn of [...listeners]) fn();
}

export function onWaypointChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
