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

/**
 * R3 (MAP7, 18 Nov 2026): the owner's "grow the play area by 7 blocks in each direction". The R1+R2 outline pushed outward by
 * seven city blocks on every side, each side snapped to the street that is the seventh block line (measured on the CSCL net):
 *   south  Jefferson Ave (7 rows south of Greene Ave, about 577 m), west Skillman St (7 blocks west of Tompkins Ave: Marcy,
 *   Nostrand, Sandford, Walworth, Spencer, Bedford, Skillman; about 912 m), north Boerum St (about 588 m above Flushing Ave),
 *   north-east side St Nicholas Ave (about 603 m beyond Knickerbocker Ave), south-east side Weirfield St / Hancock St
 *   (about 555..597 m beyond Gates Ave / the Bushwick cross streets). Distances per side of R1R2_RING, in order:
 */
export const R3_OFFSETS = [588, 600, 610, 603, 590, 597, 555, 590, 586, 577, 912];

/** The R3 outline (grid metres, REAL_FRAME), computed once from R1R2_RING + R3_OFFSETS (sharp corners bevelled). Everything inside is the real map. */
export const R3_RING: Vec2[] = [
  P(-1152.5, -1576), P(87, -1578.7), P(432.5, -1633), P(1552.8, -1946.3), P(2414.7, -1069.7), P(2775.5, -1063.9),
  P(3159.9, -25.4), P(1683.1, 1271.3), P(1648, 1305.9), P(1178.9, 824), P(-1154.5, 824),
];

/** Grow a simple polygon outward by d metres (miter joins, clamped to 3 d at sharp corners). */
export function offsetRing(ring: ReadonlyArray<Vec2>, d: number | ReadonlyArray<number>, bevelAt = 0): Vec2[] {
  const sgn = Math.sign(signedArea(ring)) || 1;
  const n = ring.length;
  const dd = (i: number): number => (typeof d === 'number' ? d : d[i]);
  const dMax = typeof d === 'number' ? d : Math.max(...d);
  const lines = ring.map((a, i) => {
    const b = ring[(i + 1) % n];
    const d0 = dd(i);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // outward = left of the walk for a positive (clockwise in the top-down view) ring
    const nx = ((b.z - a.z) / l) * sgn;
    const nz = (-(b.x - a.x) / l) * sgn;
    return { a: P(a.x + nx * d0, a.z + nz * d0), b: P(b.x + nx * d0, b.z + nz * d0), nx, nz };
  });
  const out: Vec2[] = [];
  ring.forEach((v, i) => {
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
    const rd = (q: Vec2): Vec2 => P(Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10);
    if (bevelAt > 0 && r > bevelAt * dMax) { // sharp corner: cut it flat instead of a long spike
      out.push(rd(P(v.x + l0.nx * dd((i - 1 + n) % n), v.z + l0.nz * dd((i - 1 + n) % n))), rd(P(v.x + l1.nx * dd(i), v.z + l1.nz * dd(i))));
      return;
    }
    if (r > 3 * dMax) p = P(v.x + ((p.x - v.x) / r) * 3 * dMax, v.z + ((p.z - v.z) / r) * 3 * dMax);
    out.push(rd(p));
  });
  return out;
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

/** the whole real map: R3_RING grown by the margin (R3 contains R1R2 completely) */
export const R3_EXTENT = offsetRing(R3_RING, EXTENT_MARGIN, 1.5);
export const R123_AREA_NOTE = 'R1 + R2 + R2+ + R3 = everything inside R3_EXTENT';
/** in the R3 ring only: inside R3_EXTENT but outside R1R2_EXTENT */
export function inR3Ring(p: Vec2): boolean { return pointInPolygon(p, R3_EXTENT) && !pointInPolygon(p, R1R2_EXTENT); }
