/**
 * Camera clearance helpers: pure maths (no three.js) for keeping the lens out of the body it follows, and the lens-glare
 * fade for lamps that sit right against the lens. `ThirdPersonCamera` uses the box and raise functions; `Vehicle` reads
 * `lensGlare` / `lensGlareFactor` so head, tail, light-bar and roof lamps dim when the lens is within a metre of the car.
 */

export interface BodyBox {
  /** Half extent along the heading and across it (m). */
  halfL: number;
  halfW: number;
  /** Roof / head height above the ground (m). */
  top: number;
}

/** On foot the "box" is a small upright capsule: a 0.4 m half extent and a head at 1.85 m. */
export const FOOT_BOX: BodyBox = { halfL: 0.4, halfW: 0.4, top: 1.85 };

/** Distance from a box centre to its edge along the unit direction (dx, dz), for a box whose heading is `heading` (forward = (sin h, -cos h)). */
export function boxExit(dx: number, dz: number, heading: number, box: BodyBox): number {
  const s = Math.sin(heading), c = Math.cos(heading);
  const along = Math.abs(dx * s - dz * c);
  const across = Math.abs(dx * c + dz * s);
  const tl = along > 1e-6 ? box.halfL / along : Infinity;
  const tw = across > 1e-6 ? box.halfW / across : Infinity;
  return Math.min(tl, tw);
}

/** Horizontal distance from a point to a box (0 when inside), box centred at (cx, cz). */
export function distToBox(px: number, pz: number, cx: number, cz: number, heading: number, box: BodyBox): number {
  const s = Math.sin(heading), c = Math.cos(heading);
  const rx = px - cx, rz = pz - cz;
  const along = Math.abs(rx * s - rz * c) - box.halfL;
  const across = Math.abs(rx * c + rz * s) - box.halfW;
  return Math.hypot(Math.max(along, 0), Math.max(across, 0));
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The lens stays at least this far (horizontally) outside the body's box before it must be above the roof; fully above the roof at CLEAR_IN. */
export const CLEAR_IN = 0.35;
export const CLEAR_OUT = 0.95;
/** Metres the lens keeps above the roof (car) or the head (on foot) once it is over the body. */
export const ROOF_MARGIN_CAR = 0.65;
export const ROOF_MARGIN_FOOT = 0.6;

/**
 * 0..1: how far the lens must be raised above the roof. `h` is the lens's horizontal distance from the body centre along the
 * view line, `rb` the distance from the centre to the box edge along that line. 0 once the lens is CLEAR_OUT outside the box,
 * 1 once it is within CLEAR_IN of it (or over it).
 */
export function raiseAmount(h: number, rb: number): number {
  return 1 - smoothstep(rb + CLEAR_IN, rb + CLEAR_OUT, h);
}

/**
 * Slack follower: moves `cur` toward `target` only as far as needed to stay within `band` of it. Jitter smaller than the
 * band leaves the output still; a steady drift is followed with a constant lag of `band`. Returns the new value.
 */
export function slackFollow(cur: number, target: number, band: number): number {
  const e = target - cur;
  if (band <= 0) return target;
  if (e > band) return target - band;
  if (e < -band) return target + band;
  return cur;
}

// ---------------------------------------------------------------- lens glare

/** The lens, in world space, as the camera last placed it. `Vehicle` reads this each frame. */
export const lensGlare = { x: 0, y: 0, z: 0, active: false };

/** Beyond this horizontal distance from a car's centre the lens is nowhere near its lamps (cheap early-out). */
const GLARE_FAR = 12;
/** Lamps are gone within GLARE_GONE metres of the car's box and fully on from GLARE_FULL. */
export const GLARE_GONE = 0.3;
export const GLARE_FULL = 1.0;

/** 0..1 multiplier for one car's lamp glare given the lens position (1 = unaffected). Allocation free. */
export function lensGlareFactor(cx: number, cz: number, heading: number, length: number, width: number, height: number): number {
  if (!lensGlare.active) return 1;
  const dx = lensGlare.x - cx, dz = lensGlare.z - cz;
  if (dx > GLARE_FAR || dx < -GLARE_FAR || dz > GLARE_FAR || dz < -GLARE_FAR) return 1;
  const s = Math.sin(heading), c = Math.cos(heading);
  const along = Math.max(Math.abs(dx * s - dz * c) - length / 2, 0);
  const across = Math.max(Math.abs(dx * c + dz * s) - width / 2, 0);
  const up = Math.max(lensGlare.y - height, 0);
  const d = Math.sqrt(along * along + across * across + up * up);
  return smoothstep(GLARE_GONE, GLARE_FULL, d);
}
