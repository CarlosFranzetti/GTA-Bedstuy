/**
 * 2D narrow-phase on the ground plane (x east, z south). Pure, allocation-light.
 *
 * Shapes: circle (pos = body.pos), obb (body.pos + body.heading), polygon (world-space points, convex,
 * either winding), segment (world-space a,b; a capsule against circles, a thin rectangle against polygons).
 * Every pairing is supported. All normals/MTVs are expressed "from a toward b".
 */
import { forwardFromHeading, type Vec2 } from '@/core/Math2';
import type { Body2D, OBB } from '@/world/types';

/** Half thickness of a segment collider: segments are 0.05 m thick. */
export const SEGMENT_HALF_THICKNESS = 0.025;

export interface Mtv { normal: Vec2; depth: number; point: Vec2; }

/** Mutable result record, shared between calls. Valid only until the next narrow-phase call. */
export interface Hit { nx: number; nz: number; depth: number; px: number; pz: number; }

const EPS = 1e-9;
const hit: Hit = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

function mk4(): Vec2[] { return [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }]; }
const SCRATCH_A = mk4();
const SCRATCH_B = mk4();
const SCRATCH_R = mk4();
/** vertex count of the polygon most recently produced by `loadPoly` */
let loadedCount = 0;

// ---------------------------------------------------------------- polygon sources

function writeObb(pos: Vec2, heading: number, halfW: number, halfL: number, out: Vec2[]): void {
  const f = forwardFromHeading(heading);
  // right-hand side of the heading
  const rx = -f.z, rz = f.x;
  const fx = f.x * halfL, fz = f.z * halfL;
  const sx = rx * halfW, sz = rz * halfW;
  // front-right, rear-right, rear-left, front-left (clockwise viewed from above)
  out[0].x = pos.x + fx + sx; out[0].z = pos.z + fz + sz;
  out[1].x = pos.x - fx + sx; out[1].z = pos.z - fz + sz;
  out[2].x = pos.x - fx - sx; out[2].z = pos.z - fz - sz;
  out[3].x = pos.x + fx - sx; out[3].z = pos.z + fz - sz;
}

function writeSegmentRect(a: Vec2, b: Vec2, out: Vec2[]): void {
  const T = SEGMENT_HALF_THICKNESS;
  let dx = b.x - a.x, dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  if (l < EPS) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  // extend by T at both ends so corners are square caps
  const ax = a.x - dx * T, az = a.z - dz * T, bx = b.x + dx * T, bz = b.z + dz * T;
  const px = -dz * T, pz = dx * T;
  out[0].x = ax + px; out[0].z = az + pz;
  out[1].x = bx + px; out[1].z = bz + pz;
  out[2].x = bx - px; out[2].z = bz - pz;
  out[3].x = ax - px; out[3].z = az - pz;
}

/** Vertices of a polygon-like body (obb / polygon / segment) in world space; count in `loadedCount`. */
function loadPoly(body: Body2D, scratch: Vec2[]): Vec2[] {
  const s = body.shape;
  if (s.kind === 'polygon') { loadedCount = s.points.length; return s.points; }
  if (s.kind === 'obb') { writeObb(body.pos, body.heading, s.halfW, s.halfL, scratch); loadedCount = 4; return scratch; }
  if (s.kind === 'segment') { writeSegmentRect(s.a, s.b, scratch); loadedCount = 4; return scratch; }
  loadedCount = 0;
  return scratch;
}

/** Corners of an oriented box, clockwise viewed from above: front-right, rear-right, rear-left, front-left. */
export function obbCorners(pos: Vec2, heading: number, obb: OBB): Vec2[] {
  const out = mk4();
  writeObb(pos, heading, obb.halfW, obb.halfL, out);
  return out;
}

/** Twice the signed area in (x,z); positive means clockwise viewed from above (the contract's winding). */
function area2(p: Vec2[], n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[i + 1 === n ? 0 : i + 1];
    s += a.x * b.z - b.x * a.z;
  }
  return s;
}

// ---------------------------------------------------------------- narrow phase primitives (write to `hit`)

function circleCircle(ax: number, az: number, ar: number, bx: number, bz: number, br: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const rr = ar + br;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  if (d < EPS) { hit.nx = 1; hit.nz = 0; hit.depth = rr; hit.px = ax; hit.pz = az; return true; }
  hit.nx = dx / d; hit.nz = dz / d;
  hit.depth = rr - d;
  hit.px = ax + hit.nx * ar; hit.pz = az + hit.nz * ar;
  return true;
}

/** Circle against a capsule (segment p-q, radius `t`). Normal points from the circle toward the capsule. */
function circleCapsule(cx: number, cz: number, r: number, p: Vec2, q: Vec2, t: number): boolean {
  const ex = q.x - p.x, ez = q.z - p.z;
  const e2 = ex * ex + ez * ez;
  let u = e2 > EPS ? ((cx - p.x) * ex + (cz - p.z) * ez) / e2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const qx = p.x + ex * u, qz = p.z + ez * u;
  const dx = qx - cx, dz = qz - cz;
  const R = r + t;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2);
  if (d < EPS) {
    // centre exactly on the segment: push along the segment's perpendicular
    const el = Math.sqrt(e2);
    if (el > EPS) { hit.nx = -ez / el; hit.nz = ex / el; } else { hit.nx = 1; hit.nz = 0; }
    hit.depth = R;
  } else {
    hit.nx = dx / d; hit.nz = dz / d;
    hit.depth = R - d;
  }
  hit.px = qx; hit.pz = qz;
  return true;
}

/** Circle against a convex polygon (any winding). Normal points from the circle toward the polygon. */
function circlePoly(cx: number, cz: number, r: number, pts: Vec2[], n: number): boolean {
  if (n < 3) return false;
  const sgn = area2(pts, n) >= 0 ? 1 : -1;
  let maxD = -Infinity, bnx = 0, bnz = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[i + 1 === n ? 0 : i + 1];
    const ex = p2.x - p1.x, ez = p2.z - p1.z;
    const el = Math.sqrt(ex * ex + ez * ez);
    if (el < EPS) continue;
    const nx = sgn * ez / el, nz = -sgn * ex / el; // outward
    const d = (cx - p1.x) * nx + (cz - p1.z) * nz;
    if (d > maxD) { maxD = d; bnx = nx; bnz = nz; }
  }
  if (maxD > r) return false;
  if (maxD <= 0) {
    // centre inside: escape through the nearest edge
    hit.nx = -bnx; hit.nz = -bnz;
    hit.depth = r - maxD;
    hit.px = cx - bnx * maxD; hit.pz = cz - bnz * maxD;
    return true;
  }
  // centre outside: closest point on the boundary
  let best = Infinity, qx = 0, qz = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[i + 1 === n ? 0 : i + 1];
    const ex = p2.x - p1.x, ez = p2.z - p1.z;
    const e2 = ex * ex + ez * ez;
    let u = e2 > EPS ? ((cx - p1.x) * ex + (cz - p1.z) * ez) / e2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const x = p1.x + ex * u, z = p1.z + ez * u;
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; qx = x; qz = z; }
  }
  if (best >= r * r) return false;
  const d = Math.sqrt(best);
  if (d < EPS) { hit.nx = -bnx; hit.nz = -bnz; } else { hit.nx = (qx - cx) / d; hit.nz = (qz - cz) / d; }
  hit.depth = r - d;
  hit.px = qx; hit.pz = qz;
  return true;
}

/** SAT between two convex polygons (any winding). Normal points from A toward B. */
function polyPoly(A: Vec2[], na: number, B: Vec2[], nb: number): boolean {
  if (na < 3 || nb < 3) return false;
  let bestDepth = Infinity, bnx = 0, bnz = 0;
  for (let pass = 0; pass < 2; pass++) {
    const P = pass === 0 ? A : B;
    const np = pass === 0 ? na : nb;
    for (let i = 0; i < np; i++) {
      const p1 = P[i], p2 = P[i + 1 === np ? 0 : i + 1];
      const ex = p2.x - p1.x, ez = p2.z - p1.z;
      const el = Math.sqrt(ex * ex + ez * ez);
      if (el < EPS) continue;
      const ax = ez / el, az = -ex / el;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (let j = 0; j < na; j++) { const d = A[j].x * ax + A[j].z * az; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (let j = 0; j < nb; j++) { const d = B[j].x * ax + B[j].z * az; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      const d1 = maxA - minB; // push B along +axis
      const d2 = maxB - minA; // push B along -axis
      if (d1 <= 0 || d2 <= 0) return false;
      if (d1 < bestDepth) { bestDepth = d1; bnx = ax; bnz = az; }
      if (d2 < bestDepth) { bestDepth = d2; bnx = -ax; bnz = -az; }
    }
  }
  if (!(bestDepth < Infinity)) return false;
  hit.nx = bnx; hit.nz = bnz; hit.depth = bestDepth;
  // contact point: B's deepest vertex into A, moved to mid-penetration
  let bestP = Infinity, vx = B[0].x, vz = B[0].z;
  for (let j = 0; j < nb; j++) { const d = B[j].x * bnx + B[j].z * bnz; if (d < bestP) { bestP = d; vx = B[j].x; vz = B[j].z; } }
  hit.px = vx + bnx * bestDepth * 0.5; hit.pz = vz + bnz * bestDepth * 0.5;
  return true;
}

// ---------------------------------------------------------------- dispatch

/** Circle `c` (a-side or b-side) against any non-circle body. Normal from the circle toward the other. */
function circleVsOther(c: Body2D, r: number, o: Body2D): boolean {
  const s = o.shape;
  if (s.kind === 'segment') return circleCapsule(c.pos.x, c.pos.z, r, s.a, s.b, SEGMENT_HALF_THICKNESS);
  const pts = loadPoly(o, SCRATCH_B);
  return circlePoly(c.pos.x, c.pos.z, r, pts, loadedCount);
}

/**
 * Narrow phase returning a shared mutable record (valid until the next call), or null when the shapes do not
 * overlap. Used by World2D to avoid per-test allocation.
 */
export function overlapRaw(a: Body2D, b: Body2D): Hit | null {
  const sa = a.shape, sb = b.shape;
  if (sa.kind === 'circle') {
    if (sb.kind === 'circle') return circleCircle(a.pos.x, a.pos.z, sa.r, b.pos.x, b.pos.z, sb.r) ? hit : null;
    return circleVsOther(a, sa.r, b) ? hit : null;
  }
  if (sb.kind === 'circle') {
    if (!circleVsOther(b, sb.r, a)) return null;
    hit.nx = -hit.nx; hit.nz = -hit.nz; // computed circle->a; we need a->circle
    return hit;
  }
  const pa = loadPoly(a, SCRATCH_A); const na = loadedCount;
  const pb = loadPoly(b, SCRATCH_B); const nb = loadedCount;
  return polyPoly(pa, na, pb, nb) ? hit : null;
}

/** Minimum translation vector between two bodies, normal pointing from a toward b. Any shape pairing. */
export function overlap(a: Body2D, b: Body2D): Mtv | null {
  const h = overlapRaw(a, b);
  if (!h) return null;
  return { normal: { x: h.nx, z: h.nz }, depth: h.depth, point: { x: h.px, z: h.pz } };
}

/** Even-odd point-in-polygon, either winding. */
export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- ray casting

/** Ray vs a body's shape. `dir` need not be unit length. Returns distance along the ray (0 if the origin is inside). */
export function rayShape(from: Vec2, dir: Vec2, maxDist: number, body: Body2D): { dist: number; point: Vec2 } | null {
  const dl = Math.hypot(dir.x, dir.z);
  if (dl < EPS) return null;
  const dx = dir.x / dl, dz = dir.z / dl;
  const s = body.shape;
  let t: number;
  if (s.kind === 'circle') {
    const ox = from.x - body.pos.x, oz = from.z - body.pos.z;
    const b = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - s.r * s.r;
    if (c > 0 && b > 0) return null;
    const disc = b * b - c;
    if (disc < 0) return null;
    t = -b - Math.sqrt(disc);
    if (t < 0) t = 0;
  } else {
    const pts = loadPoly(body, SCRATCH_R);
    const n = loadedCount;
    if (n < 3) return null;
    const sgn = area2(pts, n) >= 0 ? 1 : -1;
    let tmin = 0, tmax = maxDist;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i], p2 = pts[i + 1 === n ? 0 : i + 1];
      const ex = p2.x - p1.x, ez = p2.z - p1.z;
      const el = Math.sqrt(ex * ex + ez * ez);
      if (el < EPS) continue;
      const nx = sgn * ez / el, nz = -sgn * ex / el;
      const d0 = (from.x - p1.x) * nx + (from.z - p1.z) * nz;
      const den = dx * nx + dz * nz;
      if (Math.abs(den) < EPS) { if (d0 > 0) return null; continue; }
      const te = -d0 / den;
      if (den < 0) { if (te > tmin) tmin = te; } else if (te < tmax) tmax = te;
      if (tmin > tmax) return null;
    }
    t = tmin;
  }
  if (t > maxDist) return null;
  return { dist: t, point: { x: from.x + dx * t, z: from.z + dz * t } };
}
