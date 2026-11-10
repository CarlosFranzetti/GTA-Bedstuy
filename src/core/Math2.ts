/**
 * World coordinate convention (used everywhere):
 *  - units are metres
 *  - +x = east, +z = south, +y = up  (north is -z)
 *  - origin = centre of the Throop Ave / Kosciuszko St intersection
 *  - heading is radians, 0 = facing north (-z), increasing clockwise (east = +PI/2)
 *  - a THREE.Object3D facing `heading` has rotation.y = -heading
 */
import type { Object3D } from 'three';

export interface Vec2 { x: number; z: number; }

export const v2 = (x: number, z: number): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
/** sqrt(x^2 + z^2): same as Math.hypot(x, z) for game-scale numbers, but allocation-free (Math.hypot boxes its result in hot loops). */
export const hyp = (x: number, z: number): number => Math.sqrt(x * x + z * z);
export const len = (a: Vec2): number => hyp(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => hyp(a.x - b.x, a.z - b.z);
export const norm = (a: Vec2): Vec2 => { const l = len(a) || 1; return { x: a.x / l, z: a.z / l }; };
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
/** Perpendicular rotated 90deg clockwise when viewed from above (right-hand side of a heading). */
export const perpRight = (a: Vec2): Vec2 => ({ x: -a.z, z: a.x });

export const forwardFromHeading = (h: number): Vec2 => ({ x: Math.sin(h), z: -Math.cos(h) });
export const headingFromVec = (v: Vec2): number => Math.atan2(v.x, -v.z);
/** Smallest signed difference b - a wrapped into (-PI, PI]. */
export const angleDiff = (a: number, b: number): number => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d <= -Math.PI) d += Math.PI * 2; return d; };
export const wrapAngle = (a: number): number => angleDiff(0, a);

export function applyPose(obj: Object3D, pos: Vec2, heading: number, y = 0): void {
  obj.position.set(pos.x, y, pos.z);
  obj.rotation.set(0, -heading, 0);
}
