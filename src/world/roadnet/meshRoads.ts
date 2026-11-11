/**
 * WP4: road, sidewalk, curb and marking meshes along the polylines of a RoadNet (docs/swarm/plans/realmap.md section 4,
 * "Road + sidewalk meshing"). Pure geometry plus THREE buffers, no WebGL needed. Everything is a function of
 * (net, Derived): see derive.ts for legs, cuts, node polygons, curb rings and building rings.
 *
 *   asphalt   edge ribbons from cutA to length - cutB (u = across, v = along s; both in 3 m texture repeats like RoadBuilder),
 *             node polygons (ribbonless-edge clusters are unioned into one polygon). Material asphalt:1 (ribbons), asphalt:0 (nodes).
 *   sidewalk  curb ring minus building ring per block (THREE.ShapeUtils, holes allowed), top at 0.15 m. concrete / bluestone by
 *             a hash of the block (the grid's odd brownstone rows do not exist on the real map).
 *   curb      the curb ring extruded 0.15 m, 0.2 m wide on the roadway side (granite curb UV rows of RoadBuilder).
 *   markings  centre lines (double yellow on avenues, dashes on streets, two-way only), stop bars at STOP_LINE, zebra bands at
 *             the CROSSWALK contract (contract.ts), all measured along the leg from `cut`.
 * Edges with `level != 0` are not meshed. Meshes are split into render cells and tagged with `userData.cell` and
 * `userData.chunk` (chunksReal.ts), so a ChunkCuller can hide them: roads were never hidden on the grid map.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
import type { Quality } from '@/render/Shadows';
import { splitMeshesIntoCells } from '@/render/Culling';
import type { RoadNet } from './RoadNet';
import type { Derived, Leg } from './derive';
import { CROSSWALK_START, CROSSWALK_WIDTH, STOP_LINE } from './contract';
import { chunkLayoutFromBounds, tagRoadChunks } from './chunksReal';
import { isRibbonless, junctionClusters } from './clusters';
import { pointInPolygon, segmentIntersection, signedArea } from './geom';

export type WorldMaterials = IMaterialLibrary;

export interface RoadMeshOptions {
  tier: Quality;
  /** centre lines, stop bars and zebra bands (default true) */
  markings?: boolean;
  /** render cell size in metres; default 128 m (roads are cheap in triangles, expensive in draws: see chunksReal.ts) */
  cellM?: number;
}

/** metres per texture repeat (RoadBuilder TILE_M) */
const TILE_M = 3;
const BLUESTONE_U = 2.7;
const BLUESTONE_V = 3;
const SIDEWALK_H = 0.15;
const CURB_W = 0.2;
const CURB_CHAMFER = 0.035;
const CURB_TILE_M = 1.2;
const CURB_V_TOP_BACK = 0.97;
const CURB_V_TOP_FRONT = 0.52;
const CURB_V_CHAMFER_END = 0.46;
const CURB_V_FOOT = 0.03;
const Y_LINE = 0.016;
const Y_TOP = 0.02;
const MITER_CLAMP = 2;

const DASH_LEN = 3;
const DASH_PERIOD = 9;
const DASH_W = 0.15;
const DOUBLE_OFFSET = 0.075;
const DOUBLE_W = 0.08;
const STOP_W = 0.4;
const EDGE_INSET = 0.35;
const EDGE_W = 0.12;
/** a ribbon shorter than this gets no markings (two crosswalk bands and two stop bars would collide) */
const MIN_MARKED_RIBBON = 9;
const MIN_RIBBON = 0.05;

type V3 = [number, number, number];

// ---------------------------------------------------------------- small vector helpers

const rightOf = (d: Vec2): Vec2 => ({ x: -d.z, z: d.x });
const unit = (a: Vec2, b: Vec2): Vec2 => {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  return l < 1e-12 ? { x: 1, z: 0 } : { x: dx / l, z: dz / l };
};

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- geometry accumulator

class Batch {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  vert(p: V3, u: number, v: number, n: V3): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  /** triangle whose winding is flipped when its geometric normal points against `n` */
  tri(a: number, b: number, c: number, n: V3): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  /** quad a-b-d-c where (a, b) and (c, d) are the two rails: triangles abc and bdc */
  quad(a: number, b: number, c: number, d: number, n: V3): void {
    this.tri(a, b, c, n);
    this.tri(b, d, c, n);
  }
  get triangles(): number { return this.idx.length / 3; }
  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx.length && this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const UP: V3 = [0, 1, 0];

// ---------------------------------------------------------------- ribbons

interface Station { s: number; minus: Vec2; plus: Vec2 }

/** true when edge e is meshed as a ribbon (at grade, with a stretch left between its two cuts) */
export function hasRibbon(net: RoadNet, d: Derived, e: number): boolean {
  return net.edges[e].level === 0 && !isRibbonless(net, d, e);
}

/**
 * Cross-sections of the ribbon of edge e: the leg cross-sections at both ends (so the ribbon meets the node polygon edge
 * exactly) and a miter-joined offset (clamped to 2x the half width) at every interior polyline vertex.
 */
export function ribbonStations(net: RoadNet, d: Derived, e: number): Station[] {
  const E = net.edges[e];
  const L = net.lengths[e];
  const s0 = d.cuts[e].cutA, s1 = L - d.cuts[e].cutB;
  const hw = E.width / 2;
  const la = d.legs[e * 2], lb = d.legs[e * 2 + 1];
  const out: Station[] = [{ s: s0, minus: la.minus, plus: la.plus }];
  const pts = E.pts, cum = net.cum[e];
  for (let k = 1; k < pts.length - 1; k++) {
    if (cum[k] <= s0 + MIN_RIBBON || cum[k] >= s1 - MIN_RIBBON) continue;
    const n1 = rightOf(unit(pts[k - 1], pts[k])), n2 = rightOf(unit(pts[k], pts[k + 1]));
    let mx = n1.x + n2.x, mz = n1.z + n2.z;
    const ml = Math.hypot(mx, mz);
    let scale = 1;
    if (ml < 1e-6) { mx = n1.x; mz = n1.z; } else { mx /= ml; mz /= ml; scale = Math.min(MITER_CLAMP, 1 / Math.max(mx * n1.x + mz * n1.z, 1e-3)); }
    const o = hw * scale;
    out.push({ s: cum[k], minus: { x: pts[k].x - mx * o, z: pts[k].z - mz * o }, plus: { x: pts[k].x + mx * o, z: pts[k].z + mz * o } });
  }
  // the b-end leg looks back along the edge: its plus side is the edge's minus side
  out.push({ s: s1, minus: lb.plus, plus: lb.minus });
  return out;
}

function addRibbon(b: Batch, st: Station[], hw: number): void {
  const uPlus = (2 * hw) / TILE_M;
  let prevM = -1, prevP = -1;
  for (const s of st) {
    const m = b.vert([s.minus.x, 0, s.minus.z], 0, s.s / TILE_M, UP);
    const p = b.vert([s.plus.x, 0, s.plus.z], uPlus, s.s / TILE_M, UP);
    if (prevM >= 0) b.quad(prevM, prevP, m, p, UP);
    prevM = m; prevP = p;
  }
}

// ---------------------------------------------------------------- polygons

/** triangulates a simple polygon (holes allowed) with THREE.ShapeUtils and writes it as a flat horizontal surface at y */
function addPolygon(b: Batch, ring: ReadonlyArray<Vec2>, holes: ReadonlyArray<ReadonlyArray<Vec2>>, y: number, uvOf: (p: Vec2) => [number, number]): void {
  const open = (r: ReadonlyArray<Vec2>): Vec2[] => (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].z === r[r.length - 1].z ? r.slice(0, -1) : r.slice());
  const outer = open(ring);
  if (outer.length < 3) return;
  const hs = holes.map(open).filter((h) => h.length >= 3);
  // triangulateShape indexes contour then holes, in order
  const all: Vec2[] = [...outer, ...hs.flat()];
  const tris = THREE.ShapeUtils.triangulateShape(outer.map((p) => new THREE.Vector2(p.x, p.z)), hs.map((h) => h.map((p) => new THREE.Vector2(p.x, p.z))));
  const ids = new Map<number, number>();
  const vertex = (i: number): number => {
    let v = ids.get(i);
    if (v === undefined) { const p = all[i]; const uv = uvOf(p); v = b.vert([p.x, y, p.z], uv[0], uv[1], UP); ids.set(i, v); }
    return v;
  };
  for (const t of tris) b.tri(vertex(t[0]), vertex(t[1]), vertex(t[2]), UP);
}

const qkey = (p: Vec2): string => `${Math.round(p.x * 1e5)},${Math.round(p.z * 1e5)}`;

/**
 * Union of two simple polygons of the same orientation, as one ring (a hole, if the union encloses one, is filled). Null when
 * the boundaries cannot be chained into a single outer loop (disjoint polygons, coincident edges): the caller then keeps both.
 */
export function unionPolygons(A: ReadonlyArray<Vec2>, B: ReadonlyArray<Vec2>): Vec2[] | null {
  const na = A.length, nb = B.length;
  const sa: Array<Array<{ t: number; q: Vec2 }>> = A.map(() => []);
  const sb: Array<Array<{ t: number; q: Vec2 }>> = B.map(() => []);
  for (let i = 0; i < na; i++) {
    const a0 = A[i], a1 = A[(i + 1) % na];
    for (let j = 0; j < nb; j++) {
      const b0 = B[j], b1 = B[(j + 1) % nb];
      const h = segmentIntersection(a0, a1, b0, b1);
      if (!h) continue;
      const q = { x: a0.x + (a1.x - a0.x) * h.s, z: a0.z + (a1.z - a0.z) * h.s };
      sa[i].push({ t: h.s, q }); sb[j].push({ t: h.u, q });
    }
  }
  const edges: Array<{ p: Vec2; q: Vec2 }> = [];
  const collect = (R: ReadonlyArray<Vec2>, splits: typeof sa, other: ReadonlyArray<Vec2>): void => {
    for (let i = 0; i < R.length; i++) {
      const chain: Vec2[] = [R[i], ...splits[i].sort((x, y) => x.t - y.t).map((s) => s.q), R[(i + 1) % R.length]];
      for (let k = 0; k + 1 < chain.length; k++) {
        const p = chain[k], q = chain[k + 1];
        if (qkey(p) === qkey(q)) continue;
        if (!pointInPolygon({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }, other)) edges.push({ p, q });
      }
    }
  };
  collect(A, sa, B);
  collect(B, sb, A);
  if (edges.length < 3) return null;
  const byStart = new Map<string, number[]>();
  edges.forEach((e, i) => { const k = qkey(e.p); const l = byStart.get(k); if (l) l.push(i); else byStart.set(k, [i]); });
  const used = new Uint8Array(edges.length);
  const loops: Vec2[][] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const loop: Vec2[] = [];
    let cur = s;
    for (let guard = 0; guard <= edges.length; guard++) {
      used[cur] = 1;
      loop.push(edges[cur].p);
      const next = (byStart.get(qkey(edges[cur].q)) ?? []).find((i) => !used[i] || i === s);
      if (next === undefined) return null;
      if (next === s) break;
      cur = next;
    }
    loops.push(loop);
  }
  const outer = loops.filter((l) => signedArea(l) > 0);
  return outer.length === 1 ? outer[0] : null;
}

/** the paved polygons of a node group: one unioned ring when the group has several overlapping node polygons */
export function groupPolygons(d: Derived, nodes: number[]): Vec2[][] {
  let polys = nodes.map((v) => d.nodePolys[v]).filter((p) => p.length >= 3);
  // merge greedily: any pair that unions into one ring is replaced by it
  for (let again = true; again && polys.length > 1;) {
    again = false;
    for (let i = 0; i < polys.length && !again; i++) {
      for (let j = i + 1; j < polys.length && !again; j++) {
        const u = unionPolygons(polys[i], polys[j]);
        if (!u) continue;
        polys = polys.filter((_, k) => k !== i && k !== j);
        polys.push(u);
        again = true;
      }
    }
  }
  return polys;
}

// ---------------------------------------------------------------- curbs

interface CurbProfile { off: number; y: number; v: number }

function addCurbRing(b: Batch, ring: ReadonlyArray<Vec2>, chamfer: boolean): void {
  const pts: Vec2[] = [];
  for (const p of ring) if (!pts.length || Math.hypot(p.x - pts[pts.length - 1].x, p.z - pts[pts.length - 1].z) > 1e-4) pts.push(p);
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) <= 1e-4) pts.pop();
  const n = pts.length;
  if (n < 3) return;
  const sgn = signedArea(pts) >= 0 ? 1 : -1;
  // outward (roadway side) unit normal of each segment i -> i + 1 and miter offset at each vertex
  const segN: Vec2[] = pts.map((p, i) => { const q = pts[(i + 1) % n]; const dd = unit(p, q); return { x: dd.z * sgn, z: -dd.x * sgn }; });
  const miter: Vec2[] = pts.map((_, i) => {
    const n1 = segN[(i + n - 1) % n], n2 = segN[i];
    let mx = n1.x + n2.x, mz = n1.z + n2.z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) return n1;
    mx /= ml; mz /= ml;
    const k = Math.min(MITER_CLAMP, 1 / Math.max(mx * n1.x + mz * n1.z, 1e-3));
    return { x: mx * k, z: mz * k };
  });
  const H = SIDEWALK_H;
  const prof: CurbProfile[] = chamfer
    ? [{ off: 0, y: H, v: CURB_V_TOP_BACK }, { off: CURB_W - CURB_CHAMFER, y: H, v: CURB_V_TOP_FRONT }, { off: CURB_W, y: H - CURB_CHAMFER, v: CURB_V_CHAMFER_END }, { off: CURB_W, y: 0, v: CURB_V_FOOT }]
    : [{ off: 0, y: H, v: CURB_V_TOP_BACK }, { off: CURB_W, y: H, v: CURB_V_TOP_FRONT }, { off: CURB_W, y: 0, v: CURB_V_FOOT }];
  let station = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p = pts[i], q = pts[j];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const u0 = station / CURB_TILE_M, u1 = (station + len) / CURB_TILE_M;
    station += len;
    const at = (v: Vec2, m: Vec2, c: CurbProfile): V3 => [v.x + m.x * c.off, c.y, v.z + m.z * c.off];
    for (let k = 0; k + 1 < prof.length; k++) {
      const c0 = prof[k], c1 = prof[k + 1];
      const dy = c0.y - c1.y, doff = c1.off - c0.off;
      // face normal: up for the top, outward for the front, a bevel in between
      const nl = Math.hypot(dy, doff) || 1;
      const nm: V3 = [segN[i].x * (dy / nl), doff / nl, segN[i].z * (dy / nl)];
      const a = b.vert(at(p, miter[i], c0), u0, c0.v, nm);
      const bb = b.vert(at(q, miter[j], c0), u1, c0.v, nm);
      const c = b.vert(at(p, miter[i], c1), u0, c1.v, nm);
      const dd = b.vert(at(q, miter[j], c1), u1, c1.v, nm);
      b.quad(a, bb, c, dd, nm);
    }
  }
}

// ---------------------------------------------------------------- markings

interface SubSeg { a: Vec2; b: Vec2; dir: Vec2; s0: number; s1: number }

/** the straight pieces of edge e between arc lengths s0 and s1 */
function subSegments(net: RoadNet, e: number, s0: number, s1: number): SubSeg[] {
  const out: SubSeg[] = [];
  if (s1 - s0 < 1e-4) return out;
  const pts = net.edges[e].pts, cum = net.cum[e];
  let pa = net.pointAt(e, s0).p, ps = s0;
  const push = (to: Vec2, ts: number): void => {
    if (ts - ps > 1e-6) out.push({ a: pa, b: to, dir: unit(pa, to), s0: ps, s1: ts });
    pa = to; ps = ts;
  };
  for (let k = 1; k < pts.length - 1; k++) {
    if (cum[k] <= s0 + 1e-6) continue;
    if (cum[k] >= s1 - 1e-6) break;
    push(pts[k], cum[k]);
  }
  push(net.pointAt(e, s1).p, s1);
  return out;
}

/** flat strip of width w, centred `off` to the right of the centreline, over arc lengths [s0, s1] */
function addStrip(b: Batch, net: RoadNet, e: number, s0: number, s1: number, off: number, w: number, y: number): void {
  for (const g of subSegments(net, e, s0, s1)) {
    const r = rightOf(g.dir);
    const lo = off - w / 2, hi = off + w / 2;
    const v0 = b.vert([g.a.x + r.x * lo, y, g.a.z + r.z * lo], 0, 0, UP);
    const v1 = b.vert([g.a.x + r.x * hi, y, g.a.z + r.z * hi], 1, 0, UP);
    const v2 = b.vert([g.b.x + r.x * lo, y, g.b.z + r.z * lo], 0, 1, UP);
    const v3 = b.vert([g.b.x + r.x * hi, y, g.b.z + r.z * hi], 1, 1, UP);
    b.quad(v0, v1, v2, v3, UP);
  }
}

/** flat rectangle in leg coordinates: `s` along the leg from the node (s0..s1), `l` across it (l0..l1, + = leg.nrm side) */
function addLegRect(b: Batch, net: RoadNet, leg: Leg, s0: number, s1: number, l0: number, l1: number, y: number, uv: (s: number, l: number) => [number, number]): void {
  const np = net.nodes[leg.node].p;
  const corner = (s: number, l: number): number => {
    const uvs = uv(s, l);
    return b.vert([np.x + leg.dir.x * s + leg.nrm.x * l, y, np.z + leg.dir.z * s + leg.nrm.z * l], uvs[0], uvs[1], UP);
  };
  const a = corner(s0, l0), bb = corner(s0, l1), c = corner(s1, l0), dd = corner(s1, l1);
  b.quad(a, bb, c, dd, UP);
}

// ---------------------------------------------------------------- main

type Part = 'asphalt' | 'sidewalk' | 'curb' | 'markings';
interface Slot { part: Part; key: MaterialKey; variant: number; name: string; batch: Batch }

export function buildRoadMeshes(net: RoadNet, d: Derived, mats: WorldMaterials, opts: RoadMeshOptions): THREE.Group {
  const tier = opts.tier;
  const markings = opts.markings !== false;
  const slots = new Map<string, Slot>();
  const slot = (part: Part, key: MaterialKey, variant: number, name: string): Batch => {
    const id = `${part}/${name}`;
    let s = slots.get(id);
    if (!s) { s = { part, key, variant, name, batch: new Batch() }; slots.set(id, s); }
    return s.batch;
  };

  // ---- asphalt: ribbons
  const roadway = (): Batch => slot('asphalt', 'asphalt', 1, 'roadway');
  net.edges.forEach((E, e) => {
    if (!hasRibbon(net, d, e)) return;
    addRibbon(roadway(), ribbonStations(net, d, e), E.width / 2);
  });
  // ---- asphalt: node polygons, ribbonless clusters unioned
  const atGrade = net.nodes.map((_, v) => net.incident[v].some((e) => net.edges[e].level === 0));
  const worldUV = (p: Vec2): [number, number] => [p.x / TILE_M, p.z / TILE_M];
  for (const nodes of junctionClusters(net, d)) {
    if (!nodes.some((v) => atGrade[v])) continue;
    for (const poly of groupPolygons(d, nodes.filter((v) => atGrade[v]))) addPolygon(slot('asphalt', 'asphalt', 0, 'intersections'), poly, [], 0, worldUV);
  }

  // ---- sidewalks and curbs per block
  const chamfer = tier === 'medium' || tier === 'high';
  net.blocks.forEach((blk, i) => {
    const curb = d.curbRings[i];
    if (!curb || curb.length < 3) return;
    const building = d.buildingRings[i];
    const blue = fnv(blk.ref ?? String(i)) % 2 === 1;
    const sw = blue ? slot('sidewalk', 'bluestone', 0, 'sidewalks-bluestone') : slot('sidewalk', 'concrete', 0, 'sidewalks');
    const uvOf = (p: Vec2): [number, number] => (blue ? [p.x / BLUESTONE_U, p.z / BLUESTONE_V] : [p.x / TILE_M, p.z / TILE_M]);
    addPolygon(sw, curb, building && building.length >= 3 ? [building] : [], SIDEWALK_H, uvOf);
    const warm = (fnv(blk.ref ?? String(i)) >>> 1) % 2;
    addCurbRing(slot('curb', 'graniteCurb', warm, warm === 0 ? 'curbs' : 'curbs-warm'), curb, chamfer);
  });

  // ---- markings
  if (markings) addMarkings(net, d, tier, slot);

  // ---- assemble, split into render cells, tag chunks
  const root = new THREE.Group();
  root.name = 'roads-real';
  const parts: Record<Part, THREE.Group> = { asphalt: new THREE.Group(), sidewalk: new THREE.Group(), curb: new THREE.Group(), markings: new THREE.Group() };
  for (const part of Object.keys(parts) as Part[]) { parts[part].name = part; root.add(parts[part]); }
  for (const s of slots.values()) {
    if (s.batch.triangles === 0) continue;
    const mesh = new THREE.Mesh(s.batch.toGeometry(), mats.get(s.key, s.variant));
    mesh.name = s.name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    parts[s.part].add(mesh);
  }
  const base = chunkLayoutFromBounds(net.bounds, false);
  const cell = opts.cellM ?? 128;
  const layout = { ...base, cellX: cell, cellZ: cell, chunkX: Math.max(base.chunkX, cell), chunkZ: Math.max(base.chunkZ, cell) };
  for (const part of Object.keys(parts) as Part[]) splitMeshesIntoCells(parts[part], layout.cellX, layout.cellZ, undefined, 0, layout.originX, layout.originZ);
  tagRoadChunks(root, layout);
  root.userData.chunkLayout = layout;
  return root;
}

function addMarkings(net: RoadNet, d: Derived, tier: Quality, slot: (part: Part, key: MaterialKey, variant: number, name: string) => Batch): void {
  const white = (): Batch => slot('markings', 'laneLine', 0, 'markings-white');
  const yellow = (): Batch => slot('markings', 'laneLine', 1, 'markings-yellow');
  const zebra = (): Batch => slot('markings', 'crosswalk', 0, 'crosswalks');
  const dashed = tier !== 'phone';

  net.edges.forEach((E, e) => {
    if (!hasRibbon(net, d, e)) return;
    const L = net.lengths[e];
    const r0 = d.cuts[e].cutA, r1 = L - d.cuts[e].cutB;
    if (r1 - r0 < MIN_MARKED_RIBBON) return;
    const hw = E.width / 2;

    // centre line, two-way roads only; starts past the stop bar of its leg
    if (E.oneway === 0 && E.cls !== 'ped' && E.cls !== 'highway' && E.cls !== 'ramp') {
      const c0 = r0 + STOP_LINE + STOP_W, c1 = r1 - STOP_LINE - STOP_W;
      if (c1 - c0 > 0.5) {
        if (E.cls === 'avenue' || E.cls === 'arterial') {
          if (tier === 'phone') addStrip(yellow(), net, e, c0, c1, 0, DOUBLE_W * 3, Y_LINE);
          else for (const sg of [-1, 1]) addStrip(yellow(), net, e, c0, c1, DOUBLE_OFFSET * sg, DOUBLE_W, Y_LINE);
        } else if (dashed) {
          const n = Math.max(1, Math.floor((c1 - c0) / DASH_PERIOD));
          const span = n * DASH_PERIOD;
          const start = c0 + (c1 - c0 - span) / 2 + (DASH_PERIOD - DASH_LEN) / 2;
          for (let k = 0; k < n; k++) addStrip(yellow(), net, e, start + k * DASH_PERIOD, start + k * DASH_PERIOD + DASH_LEN, 0, DASH_W, Y_LINE);
        } else addStrip(yellow(), net, e, c0, c1, 0, DASH_W, Y_LINE);
      }
    }

    // stop bar and zebra band at each end
    for (const end of ['a', 'b'] as const) {
      const leg = d.legs[e * 2 + (end === 'b' ? 1 : 0)];
      const node = net.nodes[leg.node];
      if (d.nodePolys[leg.node].length < 3 || node.control === 'stub' || node.control === 'deadend') continue;
      // zebra: bars run along the road, u across (one 1 m bar pitch per metre), v along the band
      const z0 = leg.cut + CROSSWALK_START, z1 = z0 + CROSSWALK_WIDTH;
      addLegRect(zebra(), net, leg, z0, z1, -hw, hw, Y_TOP, (s, l) => [(l + hw) / 4, (s - z0) / CROSSWALK_WIDTH]);
      // stop bar: vehicles arrive along -leg.dir; only where that direction is allowed and the node is controlled
      if (node.control !== 'signal' && node.control !== 'stop') continue;
      const arrives = E.oneway === 0 || (end === 'a' ? E.oneway === -1 : E.oneway === 1);
      if (!arrives) continue;
      const s = leg.cut + STOP_LINE;
      const edge = EDGE_INSET + EDGE_W;
      // leg.nrm points to the right of the outgoing direction, so the arriving lane (right of travel -dir) is on the -nrm side
      if (E.oneway !== 0) addLegRect(white(), net, leg, s - STOP_W / 2, s + STOP_W / 2, -hw + edge, hw - edge, Y_LINE, () => [0, 0]);
      else addLegRect(white(), net, leg, s - STOP_W / 2, s + STOP_W / 2, -(hw - edge), -0.1, Y_LINE, () => [0, 0]);
    }
  });
}
