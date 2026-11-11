/**
 * WP1: derived junction geometry of a RoadNet (docs/swarm/plans/realmap.md sections 3, 7). Pure and deterministic, no THREE.
 *
 *   deriveGeometry(net, opts) -> Derived { legs, nodePolys, returns, curbRings, buildingRings, ... }
 *
 * Model. Every edge END is a `Leg` of exactly one node (so every edge end belongs to exactly one intersection). Legs of a
 * node are sorted by outgoing direction (increasing atan2(dz, dx) = clockwise on screen, +z down). Seen from the node, a leg
 * has a PLUS side (angle-increasing = to the right of the outgoing direction) and a MINUS side. Between two angular
 * neighbours i -> j there is a GAP, bounded by i's plus curb line and j's minus curb line:
 *   - gap angle phi < 180 deg: the curb lines meet at an apex C (distance tI / tJ along the two legs). The corner is rounded
 *     with a fillet of radius r (4.5 m streets, 6 m avenues/arterials; tangent length T = r / tan(phi/2), arc centre inside
 *     the block). Acute corners (Broadway, phi 25..45 deg) simply have longer T; r shrinks to `rMin` only when an edge is too
 *     short for both of its ends, and the corner stays sharp (apex only) when r would be < 0.3 m.
 *   - gap angle >= 177 deg (straight kerb of a T, outside of a bend, dead end, stub): no corner, the two cut points are joined
 *     by a straight chord (bevel).
 *   - a gap whose apex lies > `maxCorner` (50 m) away (near-parallel legs that merge) is also joined by a bevel.
 * A leg's CUT is the distance from the node at which its ribbon (the plain road mesh) must start: the largest tangent
 * position of its two adjacent corners (0 when both are bevels). The node polygon is the paved area at the node: for each leg
 * its cross-section at the cut, then the gap points. Where two legs sit on one short edge the cuts may overlap (cutA + cutB
 * > length); the mesher then draws no ribbon for that edge and the two node polygons overlap, which is what the street
 * does there (e.g. the 10 m Myrtle Ave link at Willoughby Ave).
 *
 * Rings. `curbRings[i]` is block i's kerb polygon (curb returns included) and `buildingRings[i]` its building line (kerb
 * offset inward by each edge's sidewalk width; corner arcs concentric: radius r - sidewalk, sharp when that is < 0.3 m).
 * Both have positive signed area in the geom.ts convention (clockwise on screen). `buildingRings[i]` is [] when the block is
 * too thin to hold a building line (collapsed or self-crossing).
 *
 * Stubs, dead ends and pass-through nodes get no node polygon ([]); their ribbon simply ends at the node (cut 0).
 */
import type { Vec2 } from '@/core/Math2';
import { distance, segmentIntersection, signedArea } from './geom';
import type { RoadNet } from './RoadNet';
import type { RoadClass } from './types';

export interface DeriveOptions {
  /** curb return radius (m) on streets */
  rStreet?: number;
  /** curb return radius (m) on avenues, arterials, highways, ramps */
  rAvenue?: number;
  /** smallest radius used when an edge is too short for the nominal one */
  rMin?: number;
  /** arc sampling step (degrees) */
  arcStepDeg?: number;
  /** distance along an edge used to measure its direction at a node (m) */
  lookahead?: number;
  /** keep at least this much ribbon on an edge before shrinking radii (m) */
  minRibbon?: number;
  /** gaps whose curb lines meet farther than this from the node are joined by a chord instead (m) */
  maxCorner?: number;
}

export const DEFAULT_DERIVE: Required<DeriveOptions> = {
  rStreet: 4.5, rAvenue: 6, rMin: 1.5, arcStepDeg: 15, lookahead: 8, minRibbon: 1, maxCorner: 50,
};

export interface Leg {
  /** index in Derived.legs: edge * 2 + (end === 'b' ? 1 : 0) */
  id: number;
  node: number;
  edge: number;
  end: 'a' | 'b';
  /** outgoing direction angle atan2(dz, dx) */
  angle: number;
  /** unit outgoing direction (away from the node) */
  dir: Vec2;
  /** unit normal of the PLUS side: (-dz, dx) */
  nrm: Vec2;
  /** half road width (m) */
  hw: number;
  sidewalk: number;
  /** distance along the leg where its ribbon starts (m) */
  cut: number;
  /** cross-section corner points at `cut` */
  minus: Vec2;
  plus: Vec2;
  /** next leg at the node in increasing angle (itself for a single-leg node) */
  next: number;
}

export type ReturnKind = 'fillet' | 'sharp' | 'bevel';

export interface CurbReturn {
  node: number;
  /** leg on the minus-angle side of the gap (I) and its angular successor (J) */
  legA: number;
  legB: number;
  kind: ReturnKind;
  /** gap angle in degrees (angle between the two curb lines at the corner) */
  angleDeg: number;
  /** fillet radius (0 for sharp and bevel) */
  radius: number;
  /** nominal radius wanted for this corner (radius < wanted means it was shrunk for a short edge) */
  wanted: number;
  /** apex where the unrounded curb lines meet (undefined for bevel) */
  apex?: Vec2;
  center?: Vec2;
  /** polyline of the corner from leg A's tangent point to leg B's tangent point (fillet: tangent, arc..., tangent; sharp: apex) */
  pts: Vec2[];
  /** distance from the node along A / B where the corner ends (the ribbon may not start before it) */
  tposA: number;
  tposB: number;
}

export interface Derived {
  opts: Required<DeriveOptions>;
  legs: Leg[];
  /** per node: leg ids sorted by angle */
  legsAt: number[][];
  /** per node: paved polygon (clockwise on screen, positive area) or [] for stubs, dead ends and straight pass-through nodes */
  nodePolys: Vec2[][];
  /** every corner of every node */
  returns: CurbReturn[];
  /** per edge: ribbon start/end arc length, `cutA` from node a and `cutB` from node b; ribbon exists when cutA + cutB < length */
  cuts: Array<{ cutA: number; cutB: number }>;
  /** per block: kerb ring with curb returns */
  curbRings: Vec2[][];
  /** per block: building line, [] when the block is too thin */
  buildingRings: Vec2[][];
}

const TWO_PI = Math.PI * 2;
const NO_CORNER = Math.PI - 0.05;
const MIN_PHI = 0.07;
const SHARP_R = 0.3;

const radiusClass = (c: RoadClass): 'avenue' | 'street' => (c === 'street' || c === 'ped' ? 'street' : 'avenue');
const rightNormal = (d: Vec2): Vec2 => ({ x: -d.z, z: d.x });
const along = (o: Vec2, d: Vec2, t: number, n: Vec2, off: number): Vec2 => ({ x: o.x + d.x * t + n.x * off, z: o.z + d.z * t + n.z * off });

interface Calc {
  kind: ReturnKind;
  phi: number;
  tI: number;
  tJ: number;
  T: number;
  r: number;
}

/** corner between leg i (plus side, offset offI) and its angular successor j (minus side, offset offJ) */
function calcCorner(angI: number, angJ: number, single: boolean, offI: number, offJ: number, rWant: number, maxCorner: number): Calc {
  let phi = single ? TWO_PI : ((angJ - angI) % TWO_PI + TWO_PI) % TWO_PI;
  if (!single && phi < 1e-9) phi = TWO_PI; // identical angles: treat as the wrap-around gap
  const bevel: Calc = { kind: 'bevel', phi, tI: 0, tJ: 0, T: 0, r: 0 };
  if (phi >= NO_CORNER || phi < MIN_PHI) return bevel;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const tI = (offJ + offI * c) / s;
  const tJ = (offI + offJ * c) / s;
  if (tI < 0 || tJ < 0 || tI > maxCorner || tJ > maxCorner) return bevel;
  if (rWant < SHARP_R) return { kind: 'sharp', phi, tI, tJ, T: 0, r: 0 };
  return { kind: 'fillet', phi, tI, tJ, T: rWant / Math.tan(phi / 2), r: rWant };
}

function cornerPoints(node: Vec2, I: Leg, J: Leg, offI: number, offJ: number, k: Calc, stepDeg: number): { pts: Vec2[]; apex?: Vec2; center?: Vec2 } {
  if (k.kind === 'bevel') return { pts: [] };
  const apex = along(node, I.dir, k.tI, I.nrm, offI);
  if (k.kind === 'sharp') return { pts: [apex], apex };
  const ti = { x: apex.x + I.dir.x * k.T, z: apex.z + I.dir.z * k.T };
  const tj = { x: apex.x + J.dir.x * k.T, z: apex.z + J.dir.z * k.T };
  const bx = I.dir.x + J.dir.x;
  const bz = I.dir.z + J.dir.z;
  const bl = Math.hypot(bx, bz) || 1;
  const dc = k.r / Math.sin(k.phi / 2);
  const center = { x: apex.x + (bx / bl) * dc, z: apex.z + (bz / bl) * dc };
  const a0 = Math.atan2(ti.z - center.z, ti.x - center.x);
  let sweep = Math.atan2(tj.z - center.z, tj.x - center.x) - a0;
  while (sweep > Math.PI) sweep -= TWO_PI;
  while (sweep < -Math.PI) sweep += TWO_PI;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / ((stepDeg * Math.PI) / 180)));
  const pts: Vec2[] = [ti];
  for (let q = 1; q < n; q++) {
    const a = a0 + (sweep * q) / n;
    pts.push({ x: center.x + Math.cos(a) * k.r, z: center.z + Math.sin(a) * k.r });
  }
  pts.push(tj);
  return { pts, apex, center };
}

/** strict self-crossing test (touching at shared vertices does not count) */
export function isSimpleRing(ring: ReadonlyArray<Vec2>, eps = 1e-7): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      const h = segmentIntersection(a, b, c, d);
      if (h && h.s > eps && h.s < 1 - eps && h.u > eps && h.u < 1 - eps) return false;
    }
  }
  return true;
}

function dedupe(ring: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) if (!out.length || distance(out[out.length - 1], p) > 1e-6) out.push(p);
  while (out.length > 1 && distance(out[0], out[out.length - 1]) <= 1e-6) out.pop();
  return out;
}

function offsetVertex(prev: Vec2, cur: Vec2, next: Vec2, off: number): Vec2 {
  const d1 = { x: cur.x - prev.x, z: cur.z - prev.z };
  const d2 = { x: next.x - cur.x, z: next.z - cur.z };
  const l1 = Math.hypot(d1.x, d1.z) || 1;
  const l2 = Math.hypot(d2.x, d2.z) || 1;
  const n1 = rightNormal({ x: d1.x / l1, z: d1.z / l1 });
  const n2 = rightNormal({ x: d2.x / l2, z: d2.z / l2 });
  let ax = n1.x + n2.x;
  let az = n1.z + n2.z;
  const al = Math.hypot(ax, az);
  if (al < 1e-6) return { x: cur.x + n1.x * off, z: cur.z + n1.z * off };
  ax /= al; az /= al;
  const m = off / Math.max(ax * n1.x + az * n1.z, 0.5);
  return { x: cur.x + ax * m, z: cur.z + az * m };
}

export function deriveGeometry(net: RoadNet, options: DeriveOptions = {}): Derived {
  const o: Required<DeriveOptions> = { ...DEFAULT_DERIVE, ...options };
  const E = net.edges;

  // ---- legs
  const legs: Leg[] = [];
  for (let e = 0; e < E.length; e++) {
    for (const end of ['a', 'b'] as const) {
      const node = end === 'a' ? E[e].a : E[e].b;
      const L = net.lengths[e];
      const look = Math.min(o.lookahead, L / 2);
      const q = net.pointAt(e, end === 'a' ? look : L - look).p;
      const np = net.nodes[node].p;
      let dx = q.x - np.x;
      let dz = q.z - np.z;
      const l = Math.hypot(dx, dz);
      if (l < 1e-9) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
      const dir = { x: dx, z: dz };
      legs.push({
        id: e * 2 + (end === 'b' ? 1 : 0), node, edge: e, end, angle: Math.atan2(dz, dx), dir, nrm: rightNormal(dir),
        hw: E[e].width / 2, sidewalk: E[e].sidewalk, cut: 0, minus: np, plus: np, next: -1,
      });
    }
  }
  const legsAt: number[][] = net.nodes.map(() => []);
  for (const l of legs) legsAt[l.node].push(l.id);
  for (const list of legsAt) {
    list.sort((p, q) => legs[p].angle - legs[q].angle || p - q);
    list.forEach((id, k) => { legs[id].next = list[(k + 1) % list.length]; });
  }
  const rOf = (a: Leg, b: Leg): number => (radiusClass(E[a.edge].cls) === 'avenue' || radiusClass(E[b.edge].cls) === 'avenue' ? o.rAvenue : o.rStreet);

  // ---- corners (pass 1 nominal radii, pass 2 shrinks the corners of edges that are too short)
  const small = new Uint8Array(legs.length);
  const calcs: Calc[] = new Array(legs.length);
  const computeAll = (): void => {
    for (const I of legs) {
      const J = legs[I.next];
      const want = rOf(I, J);
      const lvl = Math.max(small[I.id], small[J.id]);
      calcs[I.id] = calcCorner(I.angle, J.angle, I.next === I.id, I.hw, J.hw, lvl === 2 ? 0 : lvl === 1 ? Math.min(want, o.rMin) : want, o.maxCorner);
    }
  };
  const computeCuts = (): void => {
    for (const l of legs) l.cut = 0;
    for (const I of legs) {
      const k = calcs[I.id];
      const J = legs[I.next];
      const tp = k.kind === 'fillet' ? [k.tI + k.T, k.tJ + k.T] : k.kind === 'sharp' ? [k.tI, k.tJ] : [0, 0];
      I.cut = Math.max(I.cut, tp[0]);
      J.cut = Math.max(J.cut, tp[1]);
    }
  };
  computeAll();
  computeCuts();
  for (let e = 0; e < E.length; e++) {
    if (legs[e * 2].cut + legs[e * 2 + 1].cut > net.lengths[e] - o.minRibbon) { small[e * 2] = 1; small[e * 2 + 1] = 1; }
  }
  computeAll();
  computeCuts();
  // still overlapping with the smallest radius: sharp corners (apex only)
  for (let e = 0; e < E.length; e++) {
    if (legs[e * 2].cut + legs[e * 2 + 1].cut > net.lengths[e] - o.minRibbon) { small[e * 2] = 2; small[e * 2 + 1] = 2; }
  }
  computeAll();
  computeCuts();
  for (const l of legs) {
    const np = net.nodes[l.node].p;
    l.minus = along(np, l.dir, l.cut, l.nrm, -l.hw);
    l.plus = along(np, l.dir, l.cut, l.nrm, l.hw);
  }

  // ---- returns and node polygons
  const returns: CurbReturn[] = [];
  const retOf: CurbReturn[] = new Array(legs.length);
  for (const I of legs) {
    const J = legs[I.next];
    const k = calcs[I.id];
    const np = net.nodes[I.node].p;
    const { pts, apex, center } = cornerPoints(np, I, J, I.hw, J.hw, k, o.arcStepDeg);
    const tp = k.kind === 'fillet' ? [k.tI + k.T, k.tJ + k.T] : k.kind === 'sharp' ? [k.tI, k.tJ] : [I.cut, J.cut];
    const want = rOf(I, J);
    const r: CurbReturn = {
      node: I.node, legA: I.id, legB: J.id, kind: k.kind, angleDeg: (k.phi * 180) / Math.PI, radius: k.r, wanted: want,
      apex, center, pts, tposA: tp[0], tposB: tp[1],
    };
    retOf[I.id] = r;
    returns.push(r);
  }
  const nodePolys: Vec2[][] = net.nodes.map((_, v) => {
    const ids = legsAt[v];
    if (ids.length < 2) return [];
    const ring: Vec2[] = [];
    for (const id of ids) {
      const l = legs[id];
      ring.push(l.minus, l.plus, ...retOf[id].pts);
    }
    const poly = dedupe(ring);
    const a = signedArea(poly);
    if (Math.abs(a) < 0.05) return [];
    return a < 0 ? poly.reverse() : poly;
  });
  const cuts = E.map((_, e) => ({ cutA: legs[e * 2].cut, cutB: legs[e * 2 + 1].cut }));

  // ---- block rings
  const cornerAt = (a: Leg, b: Leg, building: boolean): { pts: Vec2[]; tposA: number; tposB: number } => {
    const np = net.nodes[a.node].p;
    const single = a.id === b.id;
    const base = a.next === b.id ? retOf[a.id] : null;
    if (!building) {
      if (base) return { pts: base.kind === 'bevel' ? [b.minus, a.plus] : base.pts.slice().reverse(), tposA: base.tposA, tposB: base.tposB };
      const k = calcCorner(a.angle, b.angle, single, a.hw, b.hw, rOf(a, b), o.maxCorner);
      const c = cornerPoints(np, a, b, a.hw, b.hw, k, o.arcStepDeg);
      return { pts: k.kind === 'bevel' ? [b.minus, a.plus] : c.pts.slice().reverse(), tposA: k.kind === 'fillet' ? k.tI + k.T : k.kind === 'sharp' ? k.tI : a.cut, tposB: k.kind === 'fillet' ? k.tJ + k.T : k.kind === 'sharp' ? k.tJ : b.cut };
    }
    const offA = a.hw + a.sidewalk;
    const offB = b.hw + b.sidewalk;
    const rc = base ? base.radius : Math.min(rOf(a, b), o.rMin);
    const kCurb = base ? base.kind : 'fillet';
    if (kCurb === 'bevel') {
      // straight kerb, dead end or merging legs: building line parallel to the kerb at the leg cuts; a dead end is closed by
      // a line one sidewalk beyond the road end
      const pa = along(np, a.dir, a.cut, a.nrm, offA);
      const pb = along(np, b.dir, b.cut, b.nrm, -offB);
      if (single) {
        const ext = a.sidewalk;
        return { pts: [{ x: pb.x - b.dir.x * ext, z: pb.z - b.dir.z * ext }, { x: pa.x - a.dir.x * ext, z: pa.z - a.dir.z * ext }], tposA: a.cut, tposB: b.cut };
      }
      return { pts: [pb, pa], tposA: a.cut, tposB: b.cut };
    }
    const rb = Math.max(0, rc - (a.sidewalk + b.sidewalk) / 2);
    const k = calcCorner(a.angle, b.angle, false, offA, offB, rb, 1e9);
    if (k.kind === 'bevel') {
      return { pts: [along(np, b.dir, b.cut, b.nrm, -offB), along(np, a.dir, a.cut, a.nrm, offA)], tposA: a.cut, tposB: b.cut };
    }
    const c = cornerPoints(np, a, b, offA, offB, k, o.arcStepDeg);
    return { pts: c.pts.slice().reverse(), tposA: k.kind === 'fillet' ? k.tI + k.T : k.tI, tposB: k.kind === 'fillet' ? k.tJ + k.T : k.tJ };
  };
  // cornerAt returns corner points in walk order (arrive along b, leave along a)
  const ringOf = (bi: number, building: boolean): Vec2[] => {
    const refs = net.blocks[bi].edges;
    const ring: Vec2[] = [];
    const n = refs.length;
    const walk = refs.map((r) => {
      const e = Math.abs(r) - 1;
      const fwd = r > 0;
      return { e, fwd, start: legs[e * 2 + (fwd ? 0 : 1)], end: legs[e * 2 + (fwd ? 1 : 0)] };
    });
    // an edge whose two ends overlap (cutA + cutB > length) has no kerb of its own: its two apexes merge into one vertex
    const merged = walk.map((w) => w.start.cut + w.end.cut > net.lengths[w.e] + 1e-6);
    const corners = walk.map((w, k) => cornerAt(w.start, walk[(k - 1 + n) % n].end, building));
    const skip = new Array<boolean>(n).fill(false);
    for (let k = 0; k < n; k++) {
      const cur = walk[k];
      const nk = (k + 1) % n;
      if (!skip[k]) {
        if (merged[k] && n > 2 && corners[k].pts.length === 1 && corners[nk].pts.length === 1) {
          ring.push({ x: (corners[k].pts[0].x + corners[nk].pts[0].x) / 2, z: (corners[k].pts[0].z + corners[nk].pts[0].z) / 2 });
          skip[nk] = true;
        } else ring.push(...corners[k].pts);
      }
      if (merged[k]) continue;
      // interior vertices of the edge between the two corner tangent positions
      const edge = E[cur.e];
      const L = net.lengths[cur.e];
      const startT = corners[k].tposA;
      const endT = corners[nk].tposB;
      const wpts = cur.fwd ? edge.pts : edge.pts.slice().reverse();
      const off = edge.width / 2 + (building ? edge.sidewalk : 0);
      let acc = 0;
      for (let q = 0; q < wpts.length; q++) {
        if (q > 0) acc += distance(wpts[q - 1], wpts[q]);
        if (q === 0 || q === wpts.length - 1) continue;
        if (acc > startT + 1e-6 && acc < L - endT - 1e-6) ring.push(offsetVertex(wpts[q - 1], wpts[q], wpts[q + 1], off));
      }
    }
    const out = dedupe(ring);
    return out;
  };
  const curbRings: Vec2[][] = [];
  const buildingRings: Vec2[][] = [];
  for (let i = 0; i < net.blocks.length; i++) {
    const cr = ringOf(i, false);
    curbRings.push(signedArea(cr) < 0 ? cr.reverse() : cr);
    const br = ringOf(i, true);
    const ok = br.length >= 3 && signedArea(br) > 0.5 && isSimpleRing(br);
    buildingRings.push(ok ? br : []);
  }
  return { opts: o, legs, legsAt, nodePolys, returns, cuts, curbRings, buildingRings };
}
