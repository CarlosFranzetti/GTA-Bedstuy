/**
 * RoadNet runtime: loader, spatial queries and the GridModel -> RoadNet adapter.
 *
 * Migration contract (docs/swarm/plans/realmap.md): every consumer moves from GridModel to RoadNet exactly once. While it
 * migrates, the grid map keeps working through `roadNetFromGrid(grid)` (the axis-aligned grid is just one RoadNet), and
 * `?map=real` feeds the same consumer `RoadNet.fromJson(roadnet-core.json)`. No THREE; pure and deterministic.
 */
import type { Vec2 } from '@/core/Math2';
import type { GridModel } from '@/world/types';
import { closestOnSegment, distance, planarFaces, pointInPolygon, polylineLength, signedArea } from './geom';
import { decodeRoadNet, type RoadNetJson } from './codec';
import type { NodeControl, RoadClass, RoadNetData, RNBlockData, RNEdgeData, RNNodeData } from './types';

export type { RoadNetData, RNNodeData, RNEdgeData, RNBlockData, RoadClass, NodeControl } from './types';

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

export interface EdgeHit {
  edge: number;
  /** closest point on the centreline */
  point: Vec2;
  /** distance from p to the centreline */
  dist: number;
  /** arc length from node a to `point` */
  s: number;
  /** unit direction of the centreline at `point` (a -> b) */
  dir: Vec2;
}

const CELL = 64;

export class RoadNet {
  readonly nodes: ReadonlyArray<RNNodeData>;
  readonly edges: ReadonlyArray<RNEdgeData>;
  readonly blocks: ReadonlyArray<RNBlockData>;
  readonly bounds: Bounds;
  /** per edge: cumulative arc length at each vertex */
  readonly cum: ReadonlyArray<Float64Array>;
  /** per edge: total length */
  readonly lengths: Float64Array;
  /** per node: incident edge indices */
  readonly incident: ReadonlyArray<number[]>;
  private readonly hash = new Map<number, Array<[number, number]>>();
  private readonly byStreet = new Map<string, number[]>();
  private readonly blockRings: Vec2[][];

  constructor(readonly data: RoadNetData) {
    this.nodes = data.nodes;
    this.edges = data.edges;
    this.blocks = data.blocks;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const incident: number[][] = data.nodes.map(() => []);
    this.lengths = new Float64Array(data.edges.length);
    this.cum = data.edges.map((e, i) => {
      incident[e.a].push(i);
      if (e.b !== e.a) incident[e.b].push(i);
      const c = new Float64Array(e.pts.length);
      for (let k = 0; k < e.pts.length; k++) {
        const p = e.pts[k];
        if (k > 0) c[k] = c[k - 1] + distance(e.pts[k - 1], p);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        if (k > 0) this.index(i, k - 1, e.pts[k - 1], p, e.width / 2 + e.sidewalk);
      }
      this.lengths[i] = c[e.pts.length - 1];
      const sid = this.streetIdOf(i);
      const l = this.byStreet.get(sid);
      if (l) l.push(i); else this.byStreet.set(sid, [i]);
      return c;
    });
    this.incident = incident;
    this.bounds = data.edges.length ? { minX, maxX, minZ, maxZ } : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    this.blockRings = data.blocks.map((b) => this.ringOf(b.edges));
  }

  static fromJson(j: RoadNetJson): RoadNet { return new RoadNet(decodeRoadNet(j)); }

  // ---------------------------------------------------------------- spatial hash

  private key(cx: number, cz: number): number { return (cx + 32768) * 65536 + (cz + 32768); }

  private index(edge: number, seg: number, a: Vec2, b: Vec2, pad: number): void {
    const x0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = this.key(x, z);
      const l = this.hash.get(k);
      if (l) l.push([edge, seg]); else this.hash.set(k, [[edge, seg]]);
    }
  }

  // ---------------------------------------------------------------- queries

  /** stable street id of an edge (adapter street id, else the slug of the name) */
  streetIdOf(edge: number): string {
    const e = this.edges[edge];
    return e.streetId ?? (e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed');
  }

  /** all edges of a street, in no particular order */
  streetEdges(streetId: string): readonly number[] { return this.byStreet.get(streetId) ?? []; }

  streetIds(): string[] { return Array.from(this.byStreet.keys()); }

  /**
   * Nearest edge centreline to p, searching rings of hash cells out to `maxDist` (default 400 m).
   * Returns null when nothing is that close. Ties go to the lower edge index (deterministic).
   */
  nearestEdge(p: Vec2, maxDist = 400, filter?: (edge: number) => boolean): EdgeHit | null {
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    let best = null as { e: number; k: number; t: number; d2: number; q: Vec2 } | null;
    const maxR = Math.ceil(maxDist / CELL) + 1;
    for (let r = 0; r <= maxR; r++) {
      for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) !== r) continue;
        for (const [e, k] of this.hash.get(this.key(x, z)) ?? []) {
          if (filter && !filter(e)) continue;
          const pts = this.edges[e].pts;
          const c = closestOnSegment(p, pts[k], pts[k + 1]);
          if (!best || c.d2 < best.d2 - 1e-9 || (Math.abs(c.d2 - best.d2) <= 1e-9 && e < best.e)) best = { e, k, t: c.t, d2: c.d2, q: c.q };
        }
      }
      // a hit at distance d is final once the searched ring radius covers d
      if (best && Math.sqrt(best.d2) <= r * CELL) break;
    }
    if (!best || Math.sqrt(best.d2) > maxDist) return null;
    const pts = this.edges[best.e].pts;
    const a = pts[best.k];
    const b = pts[best.k + 1];
    const l = distance(a, b) || 1;
    return {
      edge: best.e, point: best.q, dist: Math.sqrt(best.d2), s: this.cum[best.e][best.k] + l * best.t,
      dir: { x: (b.x - a.x) / l, z: (b.z - a.z) / l },
    };
  }

  /** street name for the HUD / map label (nearest centreline), '' when nothing is within 400 m */
  streetNameAt(p: Vec2): string {
    const h = this.nearestEdge(p);
    return h ? this.edges[h.edge].name : '';
  }

  /** the edge whose roadway (curb to curb) contains p, or null (on a sidewalk, in a block, or off the map) */
  edgeAt(p: Vec2): number | null {
    const h = this.nearestEdge(p, 40, (e) => this.edges[e].level === 0);
    if (!h) return null;
    return h.dist <= this.edges[h.edge].width / 2 ? h.edge : null;
  }

  isOnRoad(p: Vec2): boolean {
    if (this.edgeAt(p) !== null) return true;
    // intersections: inside the paved box of a node with 3+ at-grade edges
    const h = this.nearestEdge(p, 40);
    if (!h) return false;
    const e = this.edges[h.edge];
    for (const v of [e.a, e.b]) {
      const r = Math.max(...this.incident[v].map((i) => this.edges[i].width / 2));
      if (this.incident[v].length >= 3 && distance(p, this.nodes[v].p) <= r) return true;
    }
    return false;
  }

  /** index of the block (centreline face) containing p, or -1 */
  blockAt(p: Vec2): number {
    for (let i = 0; i < this.blockRings.length; i++) if (pointInPolygon(p, this.blockRings[i])) return i;
    return -1;
  }

  /** centreline ring of block i (vertices in walk order, not closed) */
  blockRing(i: number): readonly Vec2[] { return this.blockRings[i]; }

  /**
   * Curb (inset = 0) or building line (inset = sidewalk) polygon of block i: each side is the centreline offset toward the
   * block by width/2 (+ that edge's sidewalk when `buildingLine`), consecutive sides joined at their line intersection
   * (miter). Good for convex and mildly concave blocks; curb returns (corner radii) are the meshing WP's job.
   */
  blockOutline(i: number, buildingLine = false): Vec2[] {
    const refs = this.blocks[i].edges;
    const sides: Array<{ a: Vec2; b: Vec2 }> = [];
    const sgn = Math.sign(signedArea(this.blockRings[i])) || 1;
    for (const r of refs) {
      const e = this.edges[Math.abs(r) - 1];
      const pts = r > 0 ? e.pts : e.pts.slice().reverse();
      const off = e.width / 2 + (buildingLine ? e.sidewalk : 0);
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const l = distance(a, b);
        if (l < 1e-6) continue;
        // (-dz, dx) points to the right of the walk in the top-down view, i.e. into a positive (clockwise) ring
        const nx = (-(b.z - a.z) / l) * sgn;
        const nz = ((b.x - a.x) / l) * sgn;
        sides.push({ a: { x: a.x + nx * off, z: a.z + nz * off }, b: { x: b.x + nx * off, z: b.z + nz * off } });
      }
    }
    const out: Vec2[] = [];
    for (let k = 0; k < sides.length; k++) {
      const s0 = sides[(k - 1 + sides.length) % sides.length];
      const s1 = sides[k];
      const hit = lineIntersection(s0.a, s0.b, s1.a, s1.b);
      out.push(hit ?? s1.a);
    }
    return out;
  }

  /** the other node of edge e seen from node v */
  otherEnd(e: number, v: number): number { const ed = this.edges[e]; return ed.a === v ? ed.b : ed.a; }

  /** point and unit direction at arc length s along edge e (a -> b) */
  pointAt(e: number, s: number): { p: Vec2; dir: Vec2 } {
    const pts = this.edges[e].pts;
    const c = this.cum[e];
    s = Math.max(0, Math.min(this.lengths[e], s));
    let k = 0;
    while (k < pts.length - 2 && c[k + 1] < s) k++;
    const a = pts[k];
    const b = pts[k + 1];
    const l = c[k + 1] - c[k] || 1;
    const t = (s - c[k]) / l;
    return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, dir: { x: (b.x - a.x) / l, z: (b.z - a.z) / l } };
  }

  private ringOf(refs: readonly number[]): Vec2[] {
    const ring: Vec2[] = [];
    for (const r of refs) {
      const e = this.edges[Math.abs(r) - 1];
      const pts = r > 0 ? e.pts : e.pts.slice().reverse();
      for (let k = 0; k < pts.length - 1; k++) ring.push(pts[k]);
    }
    return ring;
  }
}

function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z, d2x = p4.x - p3.x, d2z = p4.z - p3.z;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null; // collinear continuation: caller falls back to the segment start
  const s = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / den;
  return { x: p1.x + d1x * s, z: p1.z + d1z * s };
}

// ---------------------------------------------------------------- GridModel adapter

/**
 * The axis-aligned grid as a RoadNet: one node per intersection (ref = intersection id), one edge per road segment running
 * centre to centre (ref = segment id, streetId = street id), blocks from the same planar-face code the real map uses
 * (ref = grid block id). Signals follow src/world/props/signals.ts: any intersection touching an avenue is signalised.
 */
export function roadNetFromGrid(grid: GridModel): RoadNet {
  const nodeIx = new Map<string, number>();
  const nodes: RNNodeData[] = grid.intersections.map((it, i) => {
    nodeIx.set(it.id, i);
    const avenue = grid.streetById(it.nsStreetId).class === 'avenue' || grid.streetById(it.ewStreetId).class === 'avenue';
    return { p: { x: it.center.x, z: it.center.z }, control: avenue ? 'signal' : 'stop', ref: it.id };
  });
  const edges: RNEdgeData[] = grid.segments.map((s) => {
    const st = grid.streetById(s.streetId);
    const a = nodeIx.get(s.fromIntersection)!;
    const b = nodeIx.get(s.toIntersection)!;
    return {
      a, b, pts: [nodes[a].p, nodes[b].p], name: st.name, cls: st.class as RoadClass, width: s.width,
      sidewalk: st.sidewalkWidth, lanes: st.oneWay === 0 ? 2 : 1, oneway: st.oneWay, level: 0, ref: s.id, streetId: st.id,
    };
  });
  for (const [v, n] of nodes.entries()) {
    const deg = edges.filter((e) => e.a === v || e.b === v).length;
    if (deg <= 2 && n.control === 'stop') n.control = 'none';
  }
  const faces = planarFaces(nodes.length, edges);
  const blocks: RNBlockData[] = [];
  for (const f of faces) {
    if (f.area <= 0) continue;
    const c = f.ring.reduce((acc, p) => ({ x: acc.x + p.x / f.ring.length, z: acc.z + p.z / f.ring.length }), { x: 0, z: 0 });
    const gb = grid.blocks.find((b) => pointInPolygon(c, b.curb));
    blocks.push({ edges: f.refs, area: Math.round(f.area), island: false, ref: gb?.id });
  }
  const b = grid.bounds;
  return new RoadNet({
    version: 1,
    // nominal: the stylised grid's metres are not real metres (100 m rows), so lat/lon of grid points are approximate
    frame: { lat0: 40.691633, lon0: -73.942663, rotDeg: 8.6 },
    extent: [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }],
    nodes, edges, blocks,
  });
}

/** total centreline length of the network (m), at-grade edges only */
export function networkLength(net: RoadNet): number {
  let l = 0;
  net.edges.forEach((e) => { if (e.level === 0) l += polylineLength(e.pts); });
  return l;
}
