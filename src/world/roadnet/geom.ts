/**
 * RoadNet geometry kernel: projection, polyline clipping/simplification, node snapping and planar face extraction.
 * Pure functions, no THREE, no I/O, deterministic. Shared by scripts/import-streets.mjs (via Vite SSR) and the runtime.
 *
 * Frame (same as Grid.ts and docs/reference/EXPANSION.md): metres, +x = east along the Bed-Stuy east-west streets,
 * +z = south along the avenues, origin = Throop Ave x Kosciuszko St centreline intersection. The Bed-Stuy grid is
 * rotated 8.6 degrees counter-clockwise from true east, so grid +x has compass bearing 81.4 deg and grid -z 351.4 deg.
 */
import type { Vec2 } from '@/core/Math2';

// ---------------------------------------------------------------- projection

export interface LocalFrame {
  /** WGS84 origin (degrees) */
  lat0: number;
  lon0: number;
  /** counter-clockwise rotation (degrees) of grid +x from true east */
  rotDeg: number;
}

/**
 * Measured 11 Nov 2026 from NYC Centerline (CSCL, dataset inkn-q76z): the shared vertex of THROOP AVE and KOSCIUSZKO ST,
 * and the length-weighted median direction of Kosciuszko/Halsey/Gates/Myrtle (8.5..8.7 deg; avenues 98.6 deg).
 */
export const REAL_FRAME: LocalFrame = { lat0: 40.691633, lon0: -73.942663, rotDeg: 8.6 };

export const EARTH_RADIUS_M = 6371008.8;

/**
 * Local equirectangular projection followed by the grid rotation. Over the 5 km R1..R4 extent the scale error of the
 * equirectangular approximation is below 0.02 % (about 1 m at 5 km), well inside the 0.5 m simplification tolerance.
 */
export function makeFrameProjection(f: LocalFrame) {
  const kx = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((f.lat0 * Math.PI) / 180);
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  const t = (f.rotDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return {
    /** lon/lat (degrees) -> grid metres */
    toGrid(lon: number, lat: number): Vec2 {
      const e = (lon - f.lon0) * kx;
      const n = (lat - f.lat0) * ky;
      return { x: e * c + n * s, z: e * s - n * c };
    },
    /** grid metres -> [lon, lat] */
    toLonLat(p: Vec2): [number, number] {
      const e = p.x * c + p.z * s;
      const n = p.x * s - p.z * c;
      return [f.lon0 + e / kx, f.lat0 + n / ky];
    },
  };
}

// ---------------------------------------------------------------- small helpers

export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(dist2(a, b));

export function polylineLength(pts: ReadonlyArray<Vec2>): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += distance(pts[i - 1], pts[i]);
  return l;
}

/** Shoelace area in the x/z plane. Positive = counter-clockwise when drawn with +x right and +z DOWN (screen space). */
export function signedArea(ring: ReadonlyArray<Vec2>): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x * ring[i].z - ring[i].x * ring[j].z);
  return a / 2;
}

export function pointInPolygon(p: Vec2, ring: ReadonlyArray<Vec2>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Closest point on segment ab to p: parameter t in [0,1] and squared distance. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; d2: number; q: Vec2 } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + dx * t, z: a.z + dz * t };
  return { t, d2: dist2(p, q), q };
}

/** Proper or touching intersection of segments p1p2 and p3p4: params (s on first, u on second) or null when parallel/disjoint. */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { s: number; u: number } | null {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z, d2x = p4.x - p3.x, d2z = p4.z - p3.z;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const ex = p3.x - p1.x, ez = p3.z - p1.z;
  const s = (ex * d2z - ez * d2x) / den;
  const u = (ex * d1z - ez * d1x) / den;
  if (s < 0 || s > 1 || u < 0 || u > 1) return null;
  return { s, u };
}

// ---------------------------------------------------------------- simplification

/** Douglas-Peucker; keeps the endpoints. Tolerance in metres. */
export function simplifyPolyline(pts: ReadonlyArray<Vec2>, tol: number): Vec2[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let best = -1;
    let bestD = tol2;
    for (let i = i0 + 1; i < i1; i++) {
      const d = closestOnSegment(pts[i], pts[i0], pts[i1]).d2;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

// ---------------------------------------------------------------- clipping

/**
 * Clip a polyline to a (possibly concave) polygon. Returns the inside pieces in order; each piece flags whether its start
 * and end were cut by the polygon boundary (those ends become `stub` nodes: the street leaves the built world there).
 */
export function clipPolyline(pts: ReadonlyArray<Vec2>, poly: ReadonlyArray<Vec2>): Array<{ pts: Vec2[]; cutA: boolean; cutB: boolean }> {
  const out: Array<{ pts: Vec2[]; cutA: boolean; cutB: boolean }> = [];
  let cur: Vec2[] | null = null;
  let curCutA = false;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ts: number[] = [0, 1];
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      const hit = segmentIntersection(a, b, poly[j], poly[k]);
      if (hit && hit.s > 1e-9 && hit.s < 1 - 1e-9) ts.push(hit.s);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 < 1e-12) continue;
      const mid = { x: a.x + (b.x - a.x) * (t0 + t1) / 2, z: a.z + (b.z - a.z) * (t0 + t1) / 2 };
      const p0 = { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 };
      const p1 = { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 };
      if (pointInPolygon(mid, poly)) {
        if (!cur) { cur = [p0]; curCutA = t0 > 0 || (i > 0); if (i === 0 && t0 === 0) curCutA = false; }
        cur.push(p1);
      } else if (cur) {
        out.push({ pts: cur, cutA: curCutA, cutB: true });
        cur = null;
      }
    }
  }
  if (cur) out.push({ pts: cur, cutA: curCutA, cutB: false });
  return out.filter((p) => p.pts.length >= 2 && polylineLength(p.pts) > 0.01);
}

// ---------------------------------------------------------------- snapping

/**
 * Cluster points closer than `tol` (single linkage via a hash grid + union-find). Returns, per input point, the index of its
 * cluster and the cluster centres (mean of members). Deterministic: clusters are numbered by their first member.
 */
export function snapPoints(pts: ReadonlyArray<Vec2>, tol: number): { index: number[]; centres: Vec2[] } {
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const cell = (v: number): number => Math.floor(v / tol);
  const hash = new Map<string, number[]>();
  const tol2 = tol * tol;
  pts.forEach((p, i) => {
    const cx = cell(p.x);
    const cz = cell(p.z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of hash.get(`${cx + dx},${cz + dz}`) ?? []) {
        if (dist2(p, pts[j]) <= tol2) { const a = find(i); const b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
      }
    }
    const k = `${cx},${cz}`;
    const l = hash.get(k);
    if (l) l.push(i); else hash.set(k, [i]);
  });
  const ids = new Map<number, number>();
  const sums: Array<{ x: number; z: number; n: number }> = [];
  const index = pts.map((p, i) => {
    const r = find(i);
    let id = ids.get(r);
    if (id === undefined) { id = sums.length; ids.set(r, id); sums.push({ x: 0, z: 0, n: 0 }); }
    sums[id].x += p.x; sums[id].z += p.z; sums[id].n++;
    return id;
  });
  return { index, centres: sums.map((s) => ({ x: s.x / s.n, z: s.z / s.n })) };
}

// ---------------------------------------------------------------- planar faces

export interface PlanarEdge {
  a: number;
  b: number;
  /** full polyline a -> b including both endpoints */
  pts: ReadonlyArray<Vec2>;
}

export interface PlanarFace {
  /** signed edge refs: +(i+1) = edge i traversed a->b, -(i+1) = b->a */
  refs: number[];
  ring: Vec2[];
  /** signedArea(ring); bounded faces are > 0 */
  area: number;
}

/**
 * Faces of a planar straight-line graph (edges must only meet at their endpoints). Each face is traced with the face on the
 * LEFT of the walk in screen space (+x right, +z down), so bounded faces come out with positive signed area and the outer
 * face of each connected component negative. Dead-end edges are walked twice inside the face they poke into.
 */
export function planarFaces(nodeCount: number, edges: ReadonlyArray<PlanarEdge>): PlanarFace[] {
  // half-edge h = 2*e (a->b) or 2*e+1 (b->a)
  const out: number[][] = Array.from({ length: nodeCount }, () => []);
  const ang = new Float64Array(edges.length * 2);
  edges.forEach((e, i) => {
    const p = e.pts;
    const n = p.length;
    ang[2 * i] = Math.atan2(p[1].z - p[0].z, p[1].x - p[0].x);
    ang[2 * i + 1] = Math.atan2(p[n - 2].z - p[n - 1].z, p[n - 2].x - p[n - 1].x);
    out[e.a].push(2 * i);
    out[e.b].push(2 * i + 1);
  });
  const pos = new Int32Array(edges.length * 2);
  for (const list of out) {
    list.sort((h1, h2) => ang[h1] - ang[h2] || h1 - h2);
    list.forEach((h, k) => { pos[h] = k; });
  }
  const origin = (h: number): number => (h & 1 ? edges[h >> 1].b : edges[h >> 1].a);
  const next = (h: number): number => {
    const twin = h ^ 1;
    const v = origin(twin);
    const list = out[v];
    // angles increase clockwise on screen (+z down), so the previous entry in the list is the next edge counter-clockwise:
    // taking it keeps the face on the left of the walk
    return list[(pos[twin] - 1 + list.length) % list.length];
  };
  const seen = new Uint8Array(edges.length * 2);
  const faces: PlanarFace[] = [];
  for (let h0 = 0; h0 < edges.length * 2; h0++) {
    if (seen[h0]) continue;
    const refs: number[] = [];
    const ring: Vec2[] = [];
    let h = h0;
    let guard = 0;
    do {
      seen[h] = 1;
      const e = edges[h >> 1];
      const fwd = (h & 1) === 0;
      refs.push(fwd ? (h >> 1) + 1 : -((h >> 1) + 1));
      const p = fwd ? e.pts : e.pts.slice().reverse();
      for (let k = 0; k < p.length - 1; k++) ring.push(p[k]);
      h = next(h);
      if (++guard > edges.length * 2 + 2) break;
    } while (h !== h0);
    faces.push({ refs, ring, area: signedArea(ring) });
  }
  return faces;
}
