/**
 * RoadNet build pipeline: NYC Centerline (CSCL) features -> RoadNetData. Pure and deterministic; the I/O lives in
 * scripts/import-streets.mjs. Steps (see docs/swarm/plans/realmap.md "Data pipeline"):
 *   filter -> project -> clip to the extent polygon -> split at same-level crossings -> snap endpoints into nodes ->
 *   drop duplicates and slivers -> merge degree-2 chains with identical attributes -> simplify -> control -> blocks.
 */
import type { Vec2 } from '@/core/Math2';
import {
  type LocalFrame, clipPolyline, closestOnSegment, distance, makeFrameProjection, planarFaces, polylineLength,
  segmentIntersection, simplifyPolyline, snapPoints,
} from './geom';
import type { NodeControl, RoadClass, RoadNetData, RNBlockData, RNEdgeData, RNNodeData } from './types';

/** The CSCL fields the pipeline reads (strings exactly as Socrata returns them). */
export interface CenterlineFeature {
  physicalid?: string;
  full_street_name?: string;
  post_type?: string;
  pre_type?: string;
  rw_type?: string;
  status?: string;
  trafdir?: string;
  streetwidth?: string;
  number_travel_lanes?: string;
  number_park_lanes?: string;
  from_level_code?: string;
  to_level_code?: string;
  truck_route_type?: string;
  carto_display_level?: string;
  posted_speed?: string;
  bike_lane?: string;
  boroughcode?: string;
  the_geom: { type: string; coordinates: number[][][] | number[][] };
}

export interface BuildOptions {
  frame: LocalFrame;
  /** extent polygon in grid metres; streets are clipped to it and their cut ends become `stub` nodes */
  extent: Vec2[];
  /** endpoints closer than this merge into one node (m) */
  snapTol?: number;
  /** Douglas-Peucker tolerance for edge polylines (m) */
  simplifyTol?: number;
  /** dead-end edges shorter than this are removed (m) */
  minDeadEnd?: number;
  /** faces smaller than this (m^2, centreline ring) are traffic islands, not blocks */
  minBlockArea?: number;
}

export interface BuildReport {
  featuresIn: number;
  featuresKept: number;
  splitsAtCrossings: number;
  gradeSeparated: number;
  mergedChains: number;
  droppedSlivers: number;
  islands: number;
}

/** CSCL rw_type: 1 street, 2 highway, 3 bridge, 4 tunnel, 5 boardwalk, 6 path/trail, 7 step street, 8 driveway, 9 ramp,
 * 10 alley, 11 unknown, 12 non-physical, 13 U-turn, 14 ferry. Kept: drivable streets, highways, ramps, vehicular bridges. */
const KEEP_RW = new Set(['1', '2', '3', '4', '9']);
const FT_TO_M = 0.3048;
/** CSCL level code of at-grade segments */
const GRADE = '13';

export const DEFAULT_SIDEWALK: Record<RoadClass, number> = {
  highway: 0, ramp: 0, arterial: 5, avenue: 4.6, street: 4.0, ped: 0,
};
const DEFAULT_WIDTH: Record<RoadClass, number> = {
  highway: 20, ramp: 8, arterial: 18, avenue: 12, street: 9.1, ped: 6,
};

const SUFFIX: Record<string, string> = {
  AVE: 'Ave', ST: 'St', BLVD: 'Blvd', PL: 'Pl', RD: 'Rd', DR: 'Dr', CT: 'Ct', LN: 'Ln', PKWY: 'Pkwy', EXPY: 'Expy',
  PLZ: 'Plz', SQ: 'Sq', TER: 'Ter', WALK: 'Walk', HWY: 'Hwy', BR: 'Br', BRG: 'Bridge', 'BRDG': 'Bridge', 'EP': 'Ep',
};

/** "MALCOLM X BLVD" -> "Malcolm X Blvd", "S  1 ST" -> "S 1 St", "BROADWAY" -> "Broadway" */
export function displayName(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().split(/\s+/).map((w) => {
    if (SUFFIX[w]) return SUFFIX[w];
    if (/^\d+$/.test(w)) return w;
    if (w.length === 1) return w;
    return w[0] + w.slice(1).toLowerCase();
  }).join(' ');
}

/** stable street id: lowercase slug of the display name ("Malcolm X Blvd" -> "malcolm-x-blvd") */
export const streetSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';

export function classify(f: CenterlineFeature): RoadClass {
  if (f.rw_type === '2') return 'highway';
  if (f.rw_type === '9') return 'ramp';
  if (f.trafdir === 'NV') return 'ped';
  const w = Number(f.streetwidth ?? 0);
  const lanes = Number(f.number_travel_lanes ?? 0);
  if (f.carto_display_level || lanes >= 3 || (f.truck_route_type && w >= 50)) return 'arterial';
  const type = (f.post_type ?? f.pre_type ?? '').toUpperCase();
  if (w >= 40 || (w >= 34 && (type === 'AVE' || type === 'BLVD' || type === 'PKWY'))) return 'avenue';
  return 'street';
}

const classRank: Record<RoadClass, number> = { ped: 0, street: 1, avenue: 2, arterial: 3, ramp: 2, highway: 4 };

interface WorkEdge {
  pts: Vec2[];
  name: string;
  cls: RoadClass;
  width: number;
  lanes: number;
  oneway: -1 | 0 | 1;
  level: number;
  truck: boolean;
  speed: number;
  cutA: boolean;
  cutB: boolean;
  src: string;
}

function linesOf(g: CenterlineFeature['the_geom']): number[][][] {
  if (g.type === 'LineString') return [g.coordinates as number[][]];
  return g.coordinates as number[][][];
}

export function buildRoadNet(features: ReadonlyArray<CenterlineFeature>, opts: BuildOptions): { data: RoadNetData; report: BuildReport } {
  const snapTol = opts.snapTol ?? 1.5;
  const simplifyTol = opts.simplifyTol ?? 0.3;
  const minDeadEnd = opts.minDeadEnd ?? 3;
  const minBlockArea = opts.minBlockArea ?? 400;
  const proj = makeFrameProjection(opts.frame);
  const report: BuildReport = { featuresIn: features.length, featuresKept: 0, splitsAtCrossings: 0, gradeSeparated: 0, mergedChains: 0, droppedSlivers: 0, islands: 0 };

  // ---- filter, project, clip
  let work: WorkEdge[] = [];
  const sorted = features.slice().sort((a, b) => (a.physicalid ?? '').localeCompare(b.physicalid ?? '', 'en', { numeric: true }));
  for (const f of sorted) {
    if (f.status && f.status !== '2') continue;
    if (!KEEP_RW.has(f.rw_type ?? '1')) continue;
    if (f.rw_type === '3' && f.trafdir === 'NV') continue; // footbridges
    const cls = classify(f);
    const lvlA = f.from_level_code ?? GRADE;
    const lvlB = f.to_level_code ?? GRADE;
    const level = lvlA === GRADE && lvlB === GRADE ? 0 : Number(lvlA) < 13 || Number(lvlB) < 13 ? -1 : 1;
    const widthFt = Number(f.streetwidth ?? 0);
    const base = {
      name: displayName(f.full_street_name),
      cls,
      width: widthFt > 0 ? Math.round(widthFt * FT_TO_M * 10) / 10 : DEFAULT_WIDTH[cls],
      lanes: Number(f.number_travel_lanes ?? (cls === 'ped' ? 0 : 1)) || (cls === 'ped' ? 0 : 1),
      oneway: (f.trafdir === 'FT' ? 1 : f.trafdir === 'TF' ? -1 : 0) as -1 | 0 | 1,
      level,
      truck: !!f.truck_route_type,
      speed: Number(f.posted_speed ?? 25) || 25,
      src: f.physicalid ?? '',
    };
    let kept = false;
    for (const line of linesOf(f.the_geom)) {
      const pts = line.map(([lon, lat]) => proj.toGrid(lon, lat));
      for (const piece of clipPolyline(pts, opts.extent)) {
        work.push({ ...base, pts: piece.pts, cutA: piece.cutA, cutB: piece.cutB });
        kept = true;
      }
    }
    if (kept) report.featuresKept++;
  }

  // ---- split at same-level crossings and T-junctions (CSCL is noded already; this catches the exceptions)
  work = splitAtCrossings(work, snapTol, report);

  // ---- snap endpoints to nodes
  const ends: Vec2[] = [];
  for (const e of work) ends.push(e.pts[0], e.pts[e.pts.length - 1]);
  const snap = snapPoints(ends, snapTol);
  const nodePos = snap.centres;
  const stub = new Uint8Array(nodePos.length);
  interface GEdge extends WorkEdge { a: number; b: number }
  let gedges: GEdge[] = work.map((e, i) => {
    const a = snap.index[2 * i];
    const b = snap.index[2 * i + 1];
    if (e.cutA) stub[a] = 1;
    if (e.cutB) stub[b] = 1;
    const pts = e.pts.slice();
    pts[0] = nodePos[a];
    pts[pts.length - 1] = nodePos[b];
    return { ...e, pts, a, b };
  });

  // ---- drop zero-length / duplicate edges
  const seenPair = new Map<string, GEdge>();
  gedges = gedges.filter((e) => {
    if (e.a === e.b && polylineLength(e.pts) < 4 * snapTol) { report.droppedSlivers++; return false; }
    const key = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
    const prev = seenPair.get(key);
    if (prev && Math.abs(polylineLength(prev.pts) - polylineLength(e.pts)) < 2 * snapTol) { report.droppedSlivers++; return false; }
    seenPair.set(key, e);
    return true;
  });

  // ---- prune short dead ends (digitising stubs), repeat until stable
  for (let pass = 0; pass < 4; pass++) {
    const deg = new Int32Array(nodePos.length);
    for (const e of gedges) { deg[e.a]++; deg[e.b]++; }
    const before = gedges.length;
    gedges = gedges.filter((e) => {
      const dead = (deg[e.a] === 1 && !stub[e.a]) || (deg[e.b] === 1 && !stub[e.b]);
      if (dead && polylineLength(e.pts) < minDeadEnd) { report.droppedSlivers++; return false; }
      return true;
    });
    if (gedges.length === before) break;
  }

  // ---- merge degree-2 chains with identical attributes
  const attrKey = (e: GEdge): string => `${e.name}|${e.cls}|${e.width}|${e.lanes}|${e.level}|${e.truck}|${e.speed}|${e.oneway === 0 ? 0 : 1}`;
  {
    let changed = true;
    while (changed) {
      changed = false;
      const inc: number[][] = Array.from({ length: nodePos.length }, () => []);
      gedges.forEach((e, i) => { inc[e.a].push(i); if (e.b !== e.a) inc[e.b].push(i); });
      const dead = new Uint8Array(gedges.length);
      for (let v = 0; v < nodePos.length; v++) {
        if (stub[v] || inc[v].length !== 2) continue;
        const [i, j] = inc[v];
        if (i === j || dead[i] || dead[j]) continue;
        const e1 = gedges[i];
        const e2 = gedges[j];
        if (e1.a === e1.b || e2.a === e2.b) continue;
        if (attrKey(e1) !== attrKey(e2)) continue;
        // orient e1 to end at v and e2 to start at v
        const o1 = e1.b === v ? e1 : flip(e1);
        const o2 = e2.a === v ? e2 : flip(e2);
        if (o1.oneway !== o2.oneway) continue;
        if (o1.a === o2.b) continue; // would close a loop; keep the node
        const merged: GEdge = { ...o1, pts: o1.pts.concat(o2.pts.slice(1)), b: o2.b, cutB: o2.cutB, src: `${o1.src}+${o2.src}` };
        gedges[i] = merged;
        dead[j] = 1;
        report.mergedChains++;
        changed = true;
      }
      if (changed) gedges = gedges.filter((_, k) => !dead[k]);
    }
  }

  // ---- compact node ids (drop unused), simplify
  const used = new Int32Array(nodePos.length).fill(-1);
  const nodes: RNNodeData[] = [];
  const nodeOf = (v: number): number => {
    if (used[v] < 0) { used[v] = nodes.length; nodes.push({ p: round2(nodePos[v]), control: stub[v] ? 'stub' : 'none' }); }
    return used[v];
  };
  // deterministic order: sort edges by their midpoint (row-major, 1 m) so ids are stable across re-imports
  gedges.sort((e1, e2) => {
    const m1 = e1.pts[Math.floor(e1.pts.length / 2)];
    const m2 = e2.pts[Math.floor(e2.pts.length / 2)];
    return Math.round(m1.z) - Math.round(m2.z) || Math.round(m1.x) - Math.round(m2.x) || e1.name.localeCompare(e2.name);
  });
  const edges: RNEdgeData[] = gedges.map((e) => {
    const pts = simplifyPolyline(e.pts, simplifyTol).map(round2);
    return {
      a: nodeOf(e.a), b: nodeOf(e.b), pts, name: e.name, cls: e.cls, width: e.width,
      sidewalk: DEFAULT_SIDEWALK[e.cls], lanes: e.lanes, oneway: e.oneway, level: e.level, truck: e.truck, speed: e.speed,
    };
  });
  for (const e of edges) { e.pts[0] = nodes[e.a].p; e.pts[e.pts.length - 1] = nodes[e.b].p; }

  // ---- intersection control (CSCL has no signal data; see realmap.md: LPI dataset mqt5-ctec refines this later)
  const incid: number[][] = nodes.map(() => []);
  edges.forEach((e, i) => { incid[e.a].push(i); incid[e.b].push(i); });
  nodes.forEach((n, v) => {
    if (n.control === 'stub') return;
    const list = incid[v].map((i) => edges[i]).filter((e) => e.level === 0 && e.cls !== 'ped');
    if (list.length < 3) return;
    const names = new Set(list.map((e) => e.name));
    if (names.size < 2) return;
    const top = list.map((e) => classRank[e.cls]).sort((x, y) => y - x);
    n.control = (top[0] >= 2 || (top[0] >= 1 && list.length >= 4)) ? 'signal' : 'stop';
  });
  nodes.forEach((n, v) => { if (n.control === 'none' && incid[v].length === 1) n.control = 'deadend' as NodeControl; });

  // ---- blocks = bounded faces of the at-grade network
  const grade = edges.map((e, i) => ({ e, i })).filter(({ e }) => e.level === 0);
  const faces = planarFaces(nodes.length, grade.map(({ e }) => ({ a: e.a, b: e.b, pts: e.pts })));
  const blocks: RNBlockData[] = [];
  for (const f of faces) {
    if (f.area <= 0) continue; // outer faces
    const refs = f.refs.map((r) => { const g = grade[Math.abs(r) - 1].i; return r > 0 ? g + 1 : -(g + 1); });
    const island = f.area < minBlockArea;
    if (island) report.islands++;
    blocks.push({ edges: refs, area: Math.round(f.area), island });
  }

  return {
    data: { version: 1, frame: opts.frame, extent: opts.extent.map(round2), nodes, edges, blocks },
    report,
  };
}

function flip<T extends { pts: Vec2[]; a: number; b: number; oneway: -1 | 0 | 1; cutA: boolean; cutB: boolean }>(e: T): T {
  return { ...e, pts: e.pts.slice().reverse(), a: e.b, b: e.a, oneway: (-e.oneway) as -1 | 0 | 1, cutA: e.cutB, cutB: e.cutA };
}

const round2 = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });

function splitAtCrossings(work: WorkEdge[], tol: number, report: BuildReport): WorkEdge[] {
  const CELL = 50;
  interface Seg { e: number; k: number }
  const hash = new Map<string, Seg[]>();
  work.forEach((e, ei) => {
    for (let k = 0; k < e.pts.length - 1; k++) {
      const a = e.pts[k];
      const b = e.pts[k + 1];
      const x0 = Math.floor((Math.min(a.x, b.x) - tol) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + tol) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z) - tol) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + tol) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`;
        const l = hash.get(key);
        if (l) l.push({ e: ei, k }); else hash.set(key, [{ e: ei, k }]);
      }
    }
  });
  // cut parameters per edge, as (segment index + t)
  const cuts: number[][] = work.map(() => []);
  const tried = new Set<string>();
  const addCut = (ei: number, k: number, t: number): void => {
    const e = work[ei];
    const p = { x: e.pts[k].x + (e.pts[k + 1].x - e.pts[k].x) * t, z: e.pts[k].z + (e.pts[k + 1].z - e.pts[k].z) * t };
    if (distance(p, e.pts[0]) < tol || distance(p, e.pts[e.pts.length - 1]) < tol) return; // already an endpoint
    cuts[ei].push(k + t);
  };
  for (const list of hash.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const s1 = list[i], s2 = list[j];
      if (s1.e === s2.e) continue;
      const key = s1.e < s2.e ? `${s1.e}:${s1.k}/${s2.e}:${s2.k}` : `${s2.e}:${s2.k}/${s1.e}:${s1.k}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const e1 = work[s1.e], e2 = work[s2.e];
      const a1 = e1.pts[s1.k], b1 = e1.pts[s1.k + 1], a2 = e2.pts[s2.k], b2 = e2.pts[s2.k + 1];
      const hit = segmentIntersection(a1, b1, a2, b2);
      const sameLevel = e1.level === e2.level;
      if (hit) {
        const p1 = { x: a1.x + (b1.x - a1.x) * hit.s, z: a1.z + (b1.z - a1.z) * hit.s };
        const end1 = distance(p1, e1.pts[0]) < tol || distance(p1, e1.pts[e1.pts.length - 1]) < tol;
        const end2 = distance(p1, e2.pts[0]) < tol || distance(p1, e2.pts[e2.pts.length - 1]) < tol;
        if (end1 && end2) continue; // they already share a node
        if (!sameLevel) { report.gradeSeparated++; continue; }
        addCut(s1.e, s1.k, hit.s);
        addCut(s2.e, s2.k, hit.u);
        continue;
      }
      if (!sameLevel) continue;
      // T-junctions: an endpoint of one edge lying on the interior of the other
      for (const [ea, eb, sb] of [[e1, e2, s2], [e2, e1, s1]] as const) {
        for (const end of [ea.pts[0], ea.pts[ea.pts.length - 1]]) {
          const c = closestOnSegment(end, eb.pts[sb.k], eb.pts[sb.k + 1]);
          if (c.d2 < tol * tol) addCut(sb.e, sb.k, c.t);
        }
      }
    }
  }
  const out: WorkEdge[] = [];
  work.forEach((e, ei) => {
    const cs = Array.from(new Set(cuts[ei].map((c) => Math.round(c * 1e6) / 1e6))).sort((x, y) => x - y);
    if (!cs.length) { out.push(e); return; }
    report.splitsAtCrossings += cs.length;
    let piece: Vec2[] = [e.pts[0]];
    let ci = 0;
    let first = true;
    for (let k = 0; k < e.pts.length - 1; k++) {
      while (ci < cs.length && Math.floor(cs[ci]) === k) {
        const t = cs[ci] - k;
        const p = { x: e.pts[k].x + (e.pts[k + 1].x - e.pts[k].x) * t, z: e.pts[k].z + (e.pts[k + 1].z - e.pts[k].z) * t };
        piece.push(p);
        out.push({ ...e, pts: piece, cutA: first ? e.cutA : false, cutB: false });
        first = false;
        piece = [p];
        ci++;
      }
      piece.push(e.pts[k + 1]);
    }
    out.push({ ...e, pts: piece, cutA: first ? e.cutA : false });
  });
  return out.filter((e) => polylineLength(e.pts) > 1e-6);
}
