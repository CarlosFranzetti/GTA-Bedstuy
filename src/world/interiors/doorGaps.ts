/**
 * Where an interior door sits on a lot's building line, in the lot's local frame (x along the front, z outward).
 * Brownstone areaway fences leave a gap there so the doorstep is reachable on foot.
 */
import type { Lot } from '../types';
import { INTERIORS, INTERIOR_IDS } from './defs';

/** Half width of the fence gap at a door (m): a 1.8 m opening, wide enough for the player body plus a margin. */
export const DOOR_FENCE_GAP_HALF = 0.9;

/** Same local frame as BuildingGen: +z is outward and x runs from `origin` along `dir`. */
function localFrame(lot: Lot): { ox: number; oz: number; dx: number; dz: number } {
  const ax = lot.frontB.x - lot.frontA.x, az = lot.frontB.z - lot.frontA.z;
  const l = Math.hypot(ax, az) || 1;
  let dx = ax / l, dz = az / l; let ox = lot.frontA.x, oz = lot.frontA.z;
  if (-dz * lot.outward.x + dx * lot.outward.z < 0) { dx = -dx; dz = -dz; ox = lot.frontB.x; oz = lot.frontB.z; }
  return { ox, oz, dx, dz };
}

/** Local x of every interior door standing on this lot's building line (within 0.6 m of it, inside the lot width). */
export function doorLocalXs(lot: Lot): number[] {
  const f = localFrame(lot); const out: number[] = [];
  for (const id of INTERIOR_IDS) {
    const d = INTERIORS[id].door;
    if (d.outX * lot.outward.x + d.outZ * lot.outward.z < 0.9) continue; // the door must face the same way as the lot
    const rx = d.x - f.ox, rz = d.z - f.oz;
    const x = rx * f.dx + rz * f.dz, z = rx * lot.outward.x + rz * lot.outward.z;
    if (Math.abs(z) <= 0.6 && x > 0 && x < lot.width) out.push(x);
  }
  return out;
}
