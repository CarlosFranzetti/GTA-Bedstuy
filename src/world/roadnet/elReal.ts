/**
 * WP10: the elevated lines on the real map, pure data and kinematics (no THREE). Real-path only: reached from tests and from
 * the `?map=real` dynamic import, never imported by default-path code.
 *
 *   JZ  Broadway, chained by name from the R1 stub at Flushing Av to the R2 stub at Gates Av.
 *   M   Broadway from Flushing to Myrtle Av, then a 60 m radius curve (the real M curve) east along Myrtle Ave to the end of the
 *       Myrtle chain in the net (Knickerbocker is the R2 station; the net also holds R2+ out to Wyckoff, which then gets a stop).
 *
 * Paths are smoothed polylines (tangent-continuous fillets of radius ELBOW_R at every bend), so trains are arc-length `s` on the
 * path. The timetable is the ElLine one (same constants, same phase logic) with `s` instead of `x`, and a per-path period
 * because the real lines are longer than the 240 s the straightened line needed.
 *
 * Coordinates as everywhere: metres, +x east, +z south. `dir` +1 runs with increasing s (towards Gates / Knickerbocker).
 */
import type { Vec2 } from '@/core/Math2';
import {
  ACCEL, CAR_COUNT, CAR_GAP, CAR_LENGTH, DECEL, DOOR_TIME, DWELL, PERIOD, TRAIN_LENGTH, V_CRUISE,
} from '@/transit/ElLine';
import type { Derived } from './derive';
import { distance, pointInPolygon } from './geom';
import type { RoadNet } from './RoadNet';

export interface ElPath { id: 'JZ' | 'M'; pts: Vec2[]; cum: Float64Array; length: number }
export interface ElStationReal { id: string; name: string; line: 'JZ' | 'M' | 'JMZ'; s: number; path: 'JZ' | 'M'; length: number }

/** radius of every bend of the el (m); the real M curve at Broadway x Myrtle is about this tight */
export const ELBOW_R = 60;
/** platform length (m), as ElLine's stations */
export const PLATFORM_LEN = 94;
/** column spacing along the line (m) and offset of a column centre outside the curb line (m) */
export const COLUMN_STEP = 18;
export const COLUMN_OUT = 0.5;
/** half footprint of a column plus a little clearance, used against crosswalk bands (m) */
const COLUMN_PAD = 0.6;
/** the Myrtle Av platform sits this far back along the line from the intersection, so most of it stays on the straight (m) */
const MYRTLE_BIAS = 15;
const SHARED_CROSSWALK = { start: 0.5, width: 3 };

// ------------------------------------------------------------------------------------------------ path building

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
const unit = (a: Vec2): Vec2 => { const l = Math.hypot(a.x, a.z) || 1; return { x: a.x / l, z: a.z / l }; };

/** Walks the edges called `name` from node `start`, preferring (at the first step) the edge that best matches `prefer`. */
function chainEdges(net: RoadNet, name: string, start: number, prefer?: (dir: Vec2) => number, stop = -1): { pts: Vec2[]; nodes: number[] } {
  const pts: Vec2[] = [];
  const nodes = [start];
  const used = new Set<number>();
  let v = start;
  while (v !== stop) {
    let best = -1, bestScore = -Infinity;
    for (const e of net.incident[v]) {
      const ed = net.edges[e];
      if (ed.name !== name || ed.level !== 0 || used.has(e)) continue;
      const fwd = ed.a === v;
      const p0 = fwd ? ed.pts[0] : ed.pts[ed.pts.length - 1];
      const p1 = fwd ? ed.pts[1] : ed.pts[ed.pts.length - 2];
      const d = unit(sub(p1, p0));
      const score = prefer && used.size === 0 ? prefer(d) : -used.size;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (best < 0) break;
    used.add(best);
    const ed = net.edges[best];
    const fwd = ed.a === v;
    const seq = fwd ? ed.pts : ed.pts.slice().reverse();
    for (let k = pts.length ? 1 : 0; k < seq.length; k++) pts.push(seq[k]);
    v = fwd ? ed.b : ed.a;
    nodes.push(v);
  }
  return { pts, nodes };
}

/** The end node of a street's chain that is farthest toward -z (north) among nodes touched by exactly one of its edges. */
function northEnd(net: RoadNet, name: string): number {
  let best = -1;
  net.nodes.forEach((n, i) => {
    const k = net.incident[i].filter((e) => net.edges[e].name === name && net.edges[e].level === 0).length;
    if (k !== 1) return;
    if (best < 0 || n.p.z < net.nodes[best].p.z) best = i;
  });
  return best;
}

/** Replaces every bend by a tangent-continuous arc of radius `r`; vertices too close together for that are merged first. */
export function smoothPolyline(raw: Vec2[], r: number, stepDeg = 3): Vec2[] {
  let pts: Vec2[] = [];
  for (const p of raw) if (!pts.length || distance(pts[pts.length - 1], p) > 1e-6) pts.push(p);
  const turn = (i: number): number => {
    const a = unit(sub(pts[i], pts[i - 1])), b = unit(sub(pts[i + 1], pts[i]));
    return Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z));
  };
  for (let guard = 0; guard < 5000; guard++) {
    let drop = -1;
    const tl = (i: number): number => r * Math.tan(turn(i) / 2);
    for (let i = 1; i < pts.length - 1 && drop < 0; i++) {
      if (turn(i) < 0.002) { drop = i; break; } // straight enough: not a vertex at all
    }
    for (let i = 1; i < pts.length - 1 && drop < 0; i++) {
      const seg = distance(pts[i], pts[i + 1]);
      const prev = distance(pts[i - 1], pts[i]);
      if (i === 1 && tl(i) > prev) { drop = i; break; }
      if (i === pts.length - 2 && tl(i) > seg) { drop = i; break; }
      if (i < pts.length - 2 && tl(i) + tl(i + 1) > seg) drop = turn(i) <= turn(i + 1) ? i : i + 1;
    }
    if (drop < 0) break;
    pts = pts.filter((_, k) => k !== drop);
  }
  const out: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = unit(sub(pts[i], pts[i - 1])), b = unit(sub(pts[i + 1], pts[i]));
    const cross = a.x * b.z - a.z * b.x;
    const th = Math.abs(Math.atan2(cross, a.x * b.x + a.z * b.z));
    const T = r * Math.tan(th / 2);
    const t0 = { x: pts[i].x - a.x * T, z: pts[i].z - a.z * T };
    // centre on the inside of the bend: left normal of a is (a.z, -a.x) for a right turn (cross > 0 in x-z)
    const sg = cross > 0 ? 1 : -1;
    const ctr = { x: t0.x + -a.z * sg * r, z: t0.z + a.x * sg * r };
    const a0 = Math.atan2(t0.z - ctr.z, t0.x - ctr.x);
    const n = Math.max(1, Math.ceil(th / ((stepDeg * Math.PI) / 180)));
    out.push(t0);
    for (let q = 1; q < n; q++) {
      const ang = a0 + sg * (th * q) / n;
      out.push({ x: ctr.x + Math.cos(ang) * r, z: ctr.z + Math.sin(ang) * r });
    }
    out.push({ x: pts[i].x + b.x * T, z: pts[i].z + b.z * T });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function makePath(id: 'JZ' | 'M', pts: Vec2[]): ElPath {
  const cum = new Float64Array(pts.length);
  for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + distance(pts[k - 1], pts[k]);
  return { id, pts, cum, length: cum[pts.length - 1] };
}

/** nearest arc length of path `p` to the point `q` */
export function projectOnPath(p: ElPath, q: Vec2): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity };
  for (let k = 0; k < p.pts.length - 1; k++) {
    const a = p.pts[k], b = p.pts[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l2));
    const d = Math.hypot(q.x - (a.x + dx * t), q.z - (a.z + dz * t));
    if (d < best.dist) best = { s: p.cum[k] + t * Math.sqrt(l2), dist: d };
  }
  return best;
}

interface StationDef { id: string; name: string; line: 'JZ' | 'M' | 'JMZ'; along: string; cross: string; paths: Array<'JZ' | 'M'>; bias?: number; optional?: boolean }
const STATION_DEFS: readonly StationDef[] = [
  { id: 'flushing', name: 'Flushing Av', line: 'JMZ', along: 'Broadway', cross: 'Flushing Ave', paths: ['JZ', 'M'] },
  { id: 'myrtle', name: 'Myrtle Av', line: 'JMZ', along: 'Broadway', cross: 'Myrtle Ave', paths: ['JZ', 'M'], bias: -MYRTLE_BIAS },
  { id: 'kosciuszko', name: 'Kosciuszko St', line: 'JZ', along: 'Broadway', cross: 'Kosciuszko St', paths: ['JZ'] },
  { id: 'gates', name: 'Gates Av', line: 'JZ', along: 'Broadway', cross: 'Gates Ave', paths: ['JZ'] },
  { id: 'central', name: 'Central Av', line: 'M', along: 'Myrtle Ave', cross: 'Central Ave', paths: ['M'] },
  { id: 'knickerbocker', name: 'Knickerbocker Av', line: 'M', along: 'Myrtle Ave', cross: 'Knickerbocker Ave', paths: ['M'] },
  // R2+ only: the net reaches Wyckoff, so the M gets its terminal stop there when the data does
  { id: 'myrtle-wyckoff', name: 'Myrtle-Wyckoff Avs', line: 'M', along: 'Myrtle Ave', cross: 'Wyckoff Ave', paths: ['M'], optional: true },
];

/** mean position of the nodes of a path that meet both the street the line runs on and the named cross street */
function crossingOf(net: RoadNet, nodes: number[], along: string, cross: string): Vec2 | null {
  const hit = nodes.filter((v) => {
    const names = net.incident[v].map((e) => net.edges[e].name);
    return names.includes(along) && names.includes(cross);
  });
  if (!hit.length) return null;
  return { x: hit.reduce((a, v) => a + net.nodes[v].p.x, 0) / hit.length, z: hit.reduce((a, v) => a + net.nodes[v].p.z, 0) / hit.length };
}

/** Builds the J/Z and M paths and their stations. A net without a Broadway (the stylised grid) has no real el: empty result. */
export function buildElPaths(net: RoadNet): { paths: ElPath[]; stations: ElStationReal[] } {
  const start = northEnd(net, 'Broadway');
  if (start < 0) return { paths: [], stations: [] };
  const bw = chainEdges(net, 'Broadway', start);
  if (bw.pts.length < 2) return { paths: [], stations: [] };
  const paths: ElPath[] = [makePath('JZ', smoothPolyline(bw.pts, ELBOW_R))];
  const nodeLists = new Map<'JZ' | 'M', number[]>([['JZ', bw.nodes]]);

  // M: Broadway up to the node that meets Myrtle Ave, then Myrtle Ave eastward
  const myrtleNode = bw.nodes.find((v) => net.incident[v].some((e) => net.edges[e].name === 'Myrtle Ave'));
  if (myrtleNode !== undefined) {
    const upTo = bw.nodes.indexOf(myrtleNode);
    const cutPts = chainEdges(net, 'Broadway', start, undefined, myrtleNode).pts;
    const my = chainEdges(net, 'Myrtle Ave', myrtleNode, (d) => d.x);
    if (my.pts.length >= 2 && cutPts.length >= 2) {
      paths.push(makePath('M', smoothPolyline([...cutPts, ...my.pts.slice(1)], ELBOW_R)));
      nodeLists.set('M', [...bw.nodes.slice(0, upTo + 1), ...my.nodes.slice(1)]);
    }
  }

  const stations: ElStationReal[] = [];
  for (const path of paths) {
    const nodes = nodeLists.get(path.id)!;
    for (const def of STATION_DEFS) {
      if (!def.paths.includes(path.id)) continue;
      // Broadway-bound stations of the M path must lie on its Broadway part; Myrtle ones on its Myrtle part
      const c = crossingOf(net, nodes, def.along, def.cross);
      if (!c) continue;
      const pr = projectOnPath(path, c);
      if (pr.dist > 12) continue;
      const s = Math.max(PLATFORM_LEN / 2, Math.min(path.length - PLATFORM_LEN / 2, pr.s + (def.bias ?? 0)));
      stations.push({ id: def.id, name: def.name, line: def.line, s, path: path.id, length: PLATFORM_LEN });
    }
  }
  stations.sort((p, q) => (p.path === q.path ? p.s - q.s : p.path < q.path ? -1 : 1));
  return { paths, stations };
}

/** Where path P and path Q (same start) stop sharing their geometry: the arc length of the last common vertex. */
export function sharedPrefix(a: ElPath, b: ElPath): number {
  let k = 0;
  while (k < a.pts.length && k < b.pts.length && distance(a.pts[k], b.pts[k]) < 1e-6) k++;
  if (k === 0) return 0;
  // b's next vertex may lie on a's next segment (a fillet starting mid-segment): the paths still coincide up to it
  if (k < a.pts.length && k < b.pts.length) {
    const p0 = a.pts[k - 1], p1 = a.pts[k], q = b.pts[k];
    const dx = p1.x - p0.x, dz = p1.z - p0.z, l2 = dx * dx + dz * dz || 1;
    const t = ((q.x - p0.x) * dx + (q.z - p0.z) * dz) / l2;
    if (t > 0 && t < 1 && Math.hypot(q.x - (p0.x + dx * t), q.z - (p0.z + dz * t)) < 1e-3) return a.cum[k - 1] + t * Math.sqrt(l2);
  }
  return a.cum[k - 1];
}

/** point and unit direction (travel direction of increasing s) at arc length s; s is clamped to the path */
export function pointOnPath(p: ElPath, s: number): { p: Vec2; dir: Vec2 } {
  s = Math.max(0, Math.min(p.length, s));
  let lo = 0, hi = p.pts.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (p.cum[mid] <= s) lo = mid; else hi = mid - 1; }
  const a = p.pts[lo], b = p.pts[lo + 1];
  const l = p.cum[lo + 1] - p.cum[lo] || 1;
  const t = (s - p.cum[lo]) / l;
  return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, dir: { x: (b.x - a.x) / l, z: (b.z - a.z) / l } };
}

// ------------------------------------------------------------------------------------------------ columns

/** half road width of the Broadway / Myrtle edge nearest to q */
function halfWidthAt(net: RoadNet, q: Vec2): number {
  const h = net.nearestEdge(q, 40, (e) => net.edges[e].name === 'Broadway' || net.edges[e].name === 'Myrtle Ave');
  return h ? net.edges[h.edge].width / 2 : 6.5;
}

/** true when a column footprint at q would stand in a paved node polygon or a crosswalk band */
function blockedAt(q: Vec2, d: Derived, net: RoadNet): boolean {
  for (const poly of d.nodePolys) if (poly.length && pointInPolygon(q, poly)) return true;
  const a0 = SHARED_CROSSWALK.start - COLUMN_PAD, a1 = SHARED_CROSSWALK.start + SHARED_CROSSWALK.width + COLUMN_PAD;
  for (const leg of d.legs) {
    const n = net.nodes[leg.node].p;
    const rx = q.x - n.x, rz = q.z - n.z;
    if (rx * rx + rz * rz > 80 * 80) continue;
    const along = rx * leg.dir.x + rz * leg.dir.z;
    const lat = rx * leg.nrm.x + rz * leg.nrm.z;
    if (along >= leg.cut + a0 && along <= leg.cut + a1 && Math.abs(lat) <= leg.hw + leg.sidewalk) return true;
  }
  return false;
}

/** a column centre on curb line `side` (+1 left of travel, -1 right) at arc length s */
function curbSpot(p: ElPath, net: RoadNet, s: number, side: 1 | -1): { p: Vec2; dir: Vec2 } {
  const c = pointOnPath(p, s);
  const off = halfWidthAt(net, c.p) + COLUMN_OUT;
  return { p: { x: c.p.x - c.dir.z * off * side, z: c.p.z + c.dir.x * off * side }, dir: c.dir };
}

/**
 * Column positions on both curb lines, every COLUMN_STEP metres along the path (spacing never above it). A column that would
 * stand inside a paved node polygon or a crosswalk band is not placed: the previous column is pulled up to the edge of the
 * blocked stretch (spacing not below MIN_SPACING) and the next one starts right after it, so the girders span the junction.
 * Each curb line is placed on its own (a diagonal Broadway meets a cross street at different s on its two kerbs). Returned in
 * order of s, left kerb then right kerb at equal s; `dir` is the travel direction of the path there.
 */
export function columnSpots(p: ElPath, d: Derived, net: RoadNet): Array<{ p: Vec2; dir: Vec2 }> {
  const per: Array<Array<{ s: number; spot: { p: Vec2; dir: Vec2 } }>> = [[], []];
  const FINE = 0.5, MIN_SPACING = 6;
  ([1, -1] as const).forEach((side, k) => {
    const legal = (s: number): boolean => !blockedAt(curbSpot(p, net, s, side).p, d, net);
    let last = -Infinity;
    const put = (s: number): void => { per[k].push({ s, spot: curbSpot(p, net, s, side) }); last = s; };
    const end = p.length - 3;
    let target = COLUMN_STEP / 2;
    while (target <= end) {
      if (legal(target)) { put(target); target = last + COLUMN_STEP; continue; }
      // blocked: pull the previous column's successor back to the edge of the blocked stretch, then jump past it
      let back = target - FINE;
      while (back > last + MIN_SPACING && !legal(back)) back -= FINE;
      if (back > last + MIN_SPACING && back > last) put(back);
      let fwd = target + FINE;
      while (fwd <= end && !legal(fwd)) fwd += FINE;
      if (fwd > end) break;
      put(fwd);
      target = last + COLUMN_STEP;
    }
  });
  return [...per[0], ...per[1]].sort((x, y) => (x.s - y.s) || 0).map((e) => e.spot);
}

// ------------------------------------------------------------------------------------------------ timetable on s

interface Phase { t0: number; t1: number; s0: number; v0: number; a: number; kind: 'run' | 'brake' | 'dwell' | 'accel'; station: number }

const entryS = (p: ElPath, dir: 1 | -1): number => (dir === 1 ? -TRAIN_LENGTH / 2 : p.length + TRAIN_LENGTH / 2);
const exitS = (p: ElPath, dir: 1 | -1): number => (dir === 1 ? p.length + TRAIN_LENGTH / 2 : -TRAIN_LENGTH / 2);

const cache = new WeakMap<ElPath, Map<string, { phases: Phase[]; stops: number[] }>>();

/** ElLine.schedule() on an arc-length path: phase table of one direction over the stations (of this path) in `stations`. */
export function schedulePath(path: ElPath, stations: readonly ElStationReal[], dir: 1 | -1): { phases: Phase[]; stops: number[] } {
  const key = `${dir}:${stations.map((s) => s.s.toFixed(2)).join(',')}`;
  let m = cache.get(path);
  if (!m) { m = new Map(); cache.set(path, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const order = stations.map((st, i) => ({ st, i })).sort((p, q) => dir * (p.st.s - q.st.s));
  const total = Math.abs(exitS(path, dir) - entryS(path, dir));
  const phases: Phase[] = [];
  const stops: number[] = [];
  let t = 0, s = 0;
  const brakeD = (V_CRUISE * V_CRUISE) / (2 * DECEL);
  const accelD = (V_CRUISE * V_CRUISE) / (2 * ACCEL);
  for (const { st, i } of order) {
    const stopS = Math.abs(st.s - entryS(path, dir));
    stops.push(stopS);
    const runD = stopS - brakeD - s;
    if (runD > 0) { phases.push({ t0: t, t1: t + runD / V_CRUISE, s0: s, v0: V_CRUISE, a: 0, kind: 'run', station: -1 }); t += runD / V_CRUISE; s += runD; }
    const tb = V_CRUISE / DECEL;
    phases.push({ t0: t, t1: t + tb, s0: s, v0: V_CRUISE, a: -DECEL, kind: 'brake', station: i }); t += tb; s = stopS;
    phases.push({ t0: t, t1: t + DWELL, s0: s, v0: 0, a: 0, kind: 'dwell', station: i }); t += DWELL;
    const ta = V_CRUISE / ACCEL;
    phases.push({ t0: t, t1: t + ta, s0: s, v0: 0, a: ACCEL, kind: 'accel', station: i }); t += ta; s += accelD;
  }
  phases.push({ t0: t, t1: t + (total - s) / V_CRUISE, s0: s, v0: V_CRUISE, a: 0, kind: 'run', station: -1 });
  const out = { phases, stops };
  m.set(key, out);
  return out;
}

/** Loop period of the trains of a path (s): at least ElLine's PERIOD, rounded up to 30 s with a 20 s gap after the longer direction. */
export function periodOf(path: ElPath, stations: readonly ElStationReal[]): number {
  const need = Math.max(...([1, -1] as const).map((d) => { const ph = schedulePath(path, stations, d).phases; return ph[ph.length - 1].t1; }));
  return Math.max(PERIOD, Math.ceil((need + 20) / 30) * 30);
}

export interface ElTrainStateReal {
  active: boolean;
  /** arc length of the train centre */
  s: number;
  dir: 1 | -1;
  speed: number;
  accel: number;
  phase: 'run' | 'brake' | 'dwell' | 'accel' | 'away';
  /** index into the `stations` array passed in, -1 on the run */
  station: number;
  doors: number;
  phaseT: number;
}

/** Closed-form train state on a path. `offsetFrac` shifts the train by that fraction of the path's period (ElLine: wb 0, eb 0.5). */
export function trainStateReal(path: ElPath, stations: readonly ElStationReal[], dir: 1 | -1, offsetFrac: number, time: number): ElTrainStateReal {
  const sch = schedulePath(path, stations, dir);
  const period = periodOf(path, stations);
  const last = sch.phases[sch.phases.length - 1];
  const t = (((time - offsetFrac * period) % period) + period) % period;
  if (t >= last.t1) return { active: false, s: exitS(path, dir), dir, speed: 0, accel: 0, phase: 'away', station: -1, doors: 0, phaseT: t - last.t1 };
  let ph = sch.phases[0];
  for (const p of sch.phases) if (t >= p.t0 && t < p.t1) { ph = p; break; }
  const dt = t - ph.t0;
  const ds = ph.s0 + ph.v0 * dt + 0.5 * ph.a * dt * dt;
  const v = Math.max(0, ph.v0 + ph.a * dt);
  let doors = 0;
  if (ph.kind === 'dwell') {
    const dur = ph.t1 - ph.t0;
    doors = Math.min(1, Math.max(0, Math.min((dt - 0.6) / DOOR_TIME, (dur - 1.0 - dt) / DOOR_TIME)));
  }
  return {
    active: true, s: entryS(path, dir) + dir * ds, dir, speed: v, accel: ph.kind === 'dwell' ? 0 : ph.a, phase: ph.kind,
    station: ph.kind === 'run' ? -1 : ph.station, doors, phaseT: dt,
  };
}

/** arc length of each car centre for a train centred at `s` (car 0 leads in the direction of travel) */
export function carArcLengths(s: number, dir: 1 | -1): number[] {
  const out: number[] = [];
  for (let i = 0; i < CAR_COUNT; i++) out.push(s + dir * ((CAR_COUNT - 1) / 2 - i) * (CAR_LENGTH + CAR_GAP));
  return out;
}
