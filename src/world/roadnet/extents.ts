/**
 * Phase extents of the real map (docs/swarm/plans/realmap.md). Each phase is a ring of real street-centreline
 * intersections in grid metres (measured from NYC Centerline, 11 Nov 2026, REAL_FRAME), grown outward by EXTENT_MARGIN so
 * the boundary streets and their far sidewalks are inside and every street leaving the area keeps a short stub.
 */
import type { Vec2 } from '@/core/Math2';
import { pointInPolygon, signedArea } from './geom';

export const EXTENT_MARGIN = 45;

const P = (x: number, z: number): Vec2 => ({ x, z });

/** R1: Bed-Stuy core as the game has it today: Tompkins..Malcolm X, Flushing..Greene, cut by Broadway in the north-east. */
export const R1_RING: Vec2[] = [
  P(-241, -990), // Tompkins Ave x Flushing Ave
  P(212, -991), // Broadway x Flushing Ave
  P(1000, -200), // Broadway x Malcolm X Blvd
  P(990, 247), // Malcolm X Blvd x Greene Ave
  P(-242, 247), // Tompkins Ave x Greene Ave
];

/**
 * R2 (core, about 25 old-grid blocks of area): across Broadway into Bushwick between Myrtle Ave (with the M el) and the
 * Bushwick leg of Gates Ave, out to Knickerbocker Ave, plus the Bed-Stuy triangle east of Malcolm X up to Broadway.
 */
export const R2_RING: Vec2[] = [
  P(1000, -200), // Broadway x Malcolm X Blvd
  P(710, -495), // Broadway x Myrtle Ave
  P(2145, -484), // Knickerbocker Ave x Myrtle Ave
  P(2402, -223), // Knickerbocker Ave x Gates Ave (Bushwick leg; computed from the two centrelines)
  P(1681, 494), // Gates Ave x Broadway
  P(1424, 230), // Broadway x Greene Ave
  P(990, 247), // Malcolm X Blvd x Greene Ave
];

/**
 * R2+ (optional, in roadnet-core.json but not built unless approved): the industrial triangle north of Myrtle between
 * Broadway, Flushing and Knickerbocker, and the Myrtle-Wyckoff tail. Defined as "inside R1R2 but not in R1 or R2".
 */
export const R2PLUS_NOTE = 'R1R2 minus R1 minus R2';

/** R1 + R2 outline (what roadnet-core.json is clipped to). */
export const R1R2_RING: Vec2[] = [
  P(-241, -990), P(212, -991), P(645, -1059), P(1378, -1264), P(2145, -484), P(2766, -474), P(1823, 354), P(1681, 494),
  P(1424, 230), P(990, 247), P(-242, 247),
];

/** Grow a simple polygon outward by d metres (miter joins, clamped to 3 d at sharp corners). */
export function offsetRing(ring: ReadonlyArray<Vec2>, d: number): Vec2[] {
  const sgn = Math.sign(signedArea(ring)) || 1;
  const n = ring.length;
  const lines = ring.map((a, i) => {
    const b = ring[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // outward = left of the walk for a positive (clockwise in the top-down view) ring
    const nx = ((b.z - a.z) / l) * sgn;
    const nz = (-(b.x - a.x) / l) * sgn;
    return { a: P(a.x + nx * d, a.z + nz * d), b: P(b.x + nx * d, b.z + nz * d), nx, nz };
  });
  return ring.map((v, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const l1 = lines[i];
    const d1x = l0.b.x - l0.a.x, d1z = l0.b.z - l0.a.z, d2x = l1.b.x - l1.a.x, d2z = l1.b.z - l1.a.z;
    const den = d1x * d2z - d1z * d2x;
    let p = l1.a;
    if (Math.abs(den) > 1e-9) {
      const s = ((l1.a.x - l0.a.x) * d2z - (l1.a.z - l0.a.z) * d2x) / den;
      p = P(l0.a.x + d1x * s, l0.a.z + d1z * s);
    }
    const r = Math.hypot(p.x - v.x, p.z - v.z);
    if (r > 3 * d) p = P(v.x + ((p.x - v.x) / r) * 3 * d, v.z + ((p.z - v.z) / r) * 3 * d);
    return P(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10);
  });
}

export const R1_EXTENT = offsetRing(R1_RING, EXTENT_MARGIN);
export const R2_EXTENT = offsetRing(R2_RING, EXTENT_MARGIN);

/** phase of a point: the first ring (un-grown) containing it, else 'R2+' when inside the R1R2 extent, else null */
export function phaseOf(p: Vec2): 'R1' | 'R2' | 'R2+' | null {
  if (pointInPolygon(p, R1_RING)) return 'R1';
  if (pointInPolygon(p, R2_RING)) return 'R2';
  if (pointInPolygon(p, R1_EXTENT)) return 'R1';
  if (pointInPolygon(p, R2_EXTENT)) return 'R2';
  return pointInPolygon(p, R1R2_EXTENT) ? 'R2+' : null;
}
export const R1R2_EXTENT = offsetRing(R1R2_RING, EXTENT_MARGIN);
