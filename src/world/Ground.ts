import type { Vec2 } from '@/core/Math2';

/**
 * Height of the walking surface (m above the roadway) at a point. The physics is flat 2D; this is only where a figure is DRAWN.
 * Sidewalk slabs are 0.15 m tall, so a character drawn at road height on a sidewalk has its shoes and ankles inside the slab
 * (that is what made legs end in stumps). One function is registered per map at boot; before that everything is at road height.
 */
export type GroundFn = (x: number, z: number) => number;

let ground: GroundFn = () => 0;
export function setGround(fn: GroundFn | null): void { ground = fn ?? (() => 0); }
export function groundAt(x: number, z: number): number { return ground(x, z); }

/** Grid map: each block's slab is the bounding box of its curb outline (as RoadBuilder lays it), top at `h`. */
export function slabGround(curbs: ReadonlyArray<ReadonlyArray<Vec2>>, h: number): GroundFn {
  const rects = new Float64Array(curbs.length * 4);
  curbs.forEach((c, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of c) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    rects.set([x0, x1, z0, z1], i * 4);
  });
  return (x, z) => {
    for (let i = 0; i < rects.length; i += 4) if (x >= rects[i] && x <= rects[i + 1] && z >= rects[i + 2] && z <= rects[i + 3]) return h;
    return 0;
  };
}

/** Real map: inside a block's curb ring and not on a roadway (a thin wedge's ring can cover the centreline, hence the road test). */
export function ringGround(rings: ReadonlyArray<ReadonlyArray<Vec2>>, isOnRoad: (p: Vec2) => boolean, h: number): GroundFn {
  const items = rings.filter((r) => r.length >= 3).map((ring) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of ring) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    return { ring, x0, x1, z0, z1 };
  });
  const p = { x: 0, z: 0 };
  return (x, z) => {
    for (const it of items) {
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      const r = it.ring;
      let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if ((r[i].z > z) !== (r[j].z > z) && x < ((r[j].x - r[i].x) * (z - r[i].z)) / (r[j].z - r[i].z) + r[i].x) inside = !inside;
      }
      if (inside) { p.x = x; p.z = z; return isOnRoad(p) ? 0 : h; }
    }
    return 0;
  };
}

/**
 * A figure's drawn height follows the surface with a short ease, so stepping on or off a kerb is a step and not a pop.
 * `prev` is the height drawn last frame, or NaN for a first placement (which snaps).
 */
export function easeGround(prev: number, target: number, dt: number): number {
  if (!(prev === prev)) return target;
  const k = Math.min(1, dt * 14);
  const y = prev + (target - prev) * k;
  return Math.abs(target - y) < 0.002 ? target : y;
}
