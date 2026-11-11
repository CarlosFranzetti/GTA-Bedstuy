/**
 * WP3: pedestrian sidewalk graph and crosswalks for a RoadNet (docs/swarm/plans/realmap.md section 4). Pure, no THREE.
 *
 *   buildSidewalkGraph(net, derived) -> { graph, crosswalks, blockOf }
 *   buildPedCrossingsReal(sw, net)   -> Map<`${from}>${to}`, PedCrossing>   (same shape TrafficSystem.buildPedCrossings returns)
 *
 * Walking line of block b = midway between Derived.curbRings[b] and Derived.buildingRings[b]; for blocks flagged in
 * `fallbackBuilding`, or with an empty building ring, the kerb ring inset by FALLBACK_INSET. Island blocks and blocks without
 * a kerb ring get no ring. Graph nodes sit at every corner of that line and at most `spacing` apart.
 *
 * Crosswalks: one per leg of every signal or stop junction cluster (a cluster is the set of nodes joined by ribbonless edges,
 * see _realmap-rules.md section 6), at the contract band (contract.ts: centre at cut + 2.0 along the leg), skipping the legs of
 * ribbonless edges, stubs and dead ends. Each end is snapped onto the walking line of the block beside the leg, splitting the
 * ring edge there, so the crossing is connected to the ring at both sides. Mid-block crossings: none.
 *
 * Node ids: `sw:b{block}:{k}` (ring), `cw:n{node}:e{edge}:{a|b}` (crosswalk ends, which carry blockOf -1).
 */
import type { Vec2 } from '@/core/Math2';
import type { Crosswalk, Graph, GraphEdge, GraphNode, Side } from '@/world/types';
import type { PedCrossing } from '@/entities/Pedestrian';
import { CROSSWALK_START, CROSSWALK_WIDTH } from './contract';
import type { Derived } from './derive';
import { closestOnSegment, distance, pointInPolygon } from './geom';
import type { RoadNet } from './RoadNet';

export interface RealCrosswalk extends Crosswalk { edge: number; node: number }
export interface SidewalkNet {
  graph: Graph;
  crosswalks: RealCrosswalk[];
  /** node id -> block index, or -1 for crosswalk ends */
  blockOf: Record<string, number>;
  /** ids of the crosswalk end nodes (what Pedestrian wants as `crosswalkNodes`) */
  crosswalkNodes: Set<string>;
  /** legs that qualified for a crosswalk but could not be snapped to a walking line on both sides */
  skipped: number;
}

export const FALLBACK_INSET = 1.5;
const SNAP_TOL = 3;
const MIN_NODE_GAP = 0.25;
const MIN_END_GAP = 0.3;

function insetRing(ring: ReadonlyArray<Vec2>, d: number): Vec2[] {
  const n = ring.length;
  if (n < 3) return [];
  // inward side: probe a point just inside the first edge
  const a0 = ring[0], b0 = ring[1];
  const l0 = distance(a0, b0) || 1;
  const probe = (s: number): Vec2 => ({ x: (a0.x + b0.x) / 2 + (-(b0.z - a0.z) / l0) * s, z: (a0.z + b0.z) / 2 + ((b0.x - a0.x) / l0) * s });
  const sign = pointInPolygon(probe(0.05), ring) ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n], c = ring[i], q = ring[(i + 1) % n];
    const l1 = distance(p, c) || 1, l2 = distance(c, q) || 1;
    const n1 = { x: (-(c.z - p.z) / l1) * sign, z: ((c.x - p.x) / l1) * sign };
    const n2 = { x: (-(q.z - c.z) / l2) * sign, z: ((q.x - c.x) / l2) * sign };
    let bx = n1.x + n2.x, bz = n1.z + n2.z;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) { out.push({ x: c.x + n1.x * d, z: c.z + n1.z * d }); continue; }
    bx /= bl; bz /= bl;
    const k = Math.min(3, 1 / Math.max(0.2, bx * n1.x + bz * n1.z));
    out.push({ x: c.x + bx * d * k, z: c.z + bz * d * k });
  }
  return out;
}

function nearestOnRing(p: Vec2, ring: ReadonlyArray<Vec2>): Vec2 {
  let best = ring[0], bd = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const c = closestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
    if (c.d2 < bd) { bd = c.d2; best = c.q; }
  }
  return best;
}

/** the walking ring of one block, or [] */
export function walkingRing(d: Derived, b: number, island: boolean): Vec2[] {
  const curb = d.curbRings[b];
  if (island || !curb || curb.length < 3) return [];
  const bld = d.buildingRings[b];
  let ring: Vec2[];
  if (d.fallbackBuilding.includes(b) || !bld || bld.length < 3) ring = insetRing(curb, FALLBACK_INSET);
  else {
    ring = curb.map((v) => { const q = nearestOnRing(v, bld); return { x: (v.x + q.x) / 2, z: (v.z + q.z) / 2 }; });
  }
  const out: Vec2[] = [];
  for (const p of ring) if (!out.length || distance(out[out.length - 1], p) >= MIN_NODE_GAP) out.push(p);
  while (out.length > 1 && distance(out[0], out[out.length - 1]) < MIN_NODE_GAP) out.pop();
  return out.length >= 3 ? out : [];
}

/** union-find over ribbonless edges: node -> cluster id (smallest node id of the cluster) */
function clusterOf(net: RoadNet, d: Derived): number[] {
  const par = net.nodes.map((_, i) => i);
  const find = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  net.edges.forEach((e, i) => {
    if (d.cuts[i].cutA + d.cuts[i].cutB >= net.lengths[i]) par[find(e.a)] = find(e.b);
  });
  return net.nodes.map((_, i) => find(i));
}

function sideOf(dir: Vec2): Side {
  return Math.abs(dir.x) >= Math.abs(dir.z) ? (dir.x >= 0 ? 'E' : 'W') : (dir.z >= 0 ? 'S' : 'N');
}

interface Pending { id: string; p: Vec2; ring: number; seg: number; t: number }

export function buildSidewalkGraph(net: RoadNet, d: Derived, opts: { spacing?: number; onSkip?: (node: number, edge: number, missA: boolean, missB: boolean) => void } = {}): SidewalkNet {
  const spacing = opts.spacing ?? 25;
  const rings: Vec2[][] = net.blocks.map((blk, b) => walkingRing(d, b, blk.island));
  const graph: Graph = { nodes: {}, edges: [], adjacency: {} };
  const blockOf: Record<string, number> = {};
  const crosswalkNodes = new Set<string>();
  const addNode = (id: string, pos: Vec2, blk: number): void => {
    graph.nodes[id] = { id, pos: { x: pos.x, z: pos.z } } as GraphNode;
    graph.adjacency[id] = [];
    blockOf[id] = blk;
  };
  const addEdge = (from: string, to: string, streetId?: string): void => {
    if (from === to) return;
    const length = distance(graph.nodes[from].pos, graph.nodes[to].pos);
    const e: GraphEdge = streetId === undefined ? { from, to, length } : { from, to, length, streetId };
    graph.adjacency[from].push(graph.edges.length);
    graph.edges.push(e);
  };
  const both = (a: string, b: string, streetId?: string): void => { addEdge(a, b, streetId); addEdge(b, a, streetId); };

  // ---- which legs get a crosswalk, and where their ends land
  const cl = clusterOf(net, d);
  const live = new Set<number>();
  net.nodes.forEach((n, i) => { if (n.control === 'signal' || n.control === 'stop') live.add(cl[i]); });
  const crosswalks: RealCrosswalk[] = [];
  const pendings: Pending[] = [];
  const ringSegs: Array<{ ring: number; seg: number }> = [];
  rings.forEach((r, ri) => r.forEach((_, si) => ringSegs.push({ ring: ri, seg: si })));
  const snap = (p: Vec2): { ring: number; seg: number; t: number; q: Vec2; d: number } | null => {
    let best: { ring: number; seg: number; t: number; q: Vec2; d: number } | null = null;
    for (const { ring, seg } of ringSegs) {
      const r = rings[ring];
      const a = r[seg], b = r[(seg + 1) % r.length];
      if (Math.min(a.x, b.x) - SNAP_TOL > p.x || Math.max(a.x, b.x) + SNAP_TOL < p.x) continue;
      if (Math.min(a.z, b.z) - SNAP_TOL > p.z || Math.max(a.z, b.z) + SNAP_TOL < p.z) continue;
      const c = closestOnSegment(p, a, b);
      const dd = Math.sqrt(c.d2);
      if (dd <= SNAP_TOL && (!best || dd < best.d)) best = { ring, seg, t: c.t, q: c.q, d: dd };
    }
    return best;
  };
  const crossingInfo: Array<{ cw: RealCrosswalk; ida: string; idb: string; pda: Pending; pdb: Pending }> = [];
  let skipped = 0;
  for (const leg of d.legs) {
    const e = net.edges[leg.edge];
    const node = net.nodes[leg.node];
    if (!live.has(cl[leg.node]) || e.level !== 0) continue;
    if (node.control === 'stub' || node.control === 'deadend' || net.incident[leg.node].length < 2) continue;
    const L = net.lengths[leg.edge];
    const cut = d.cuts[leg.edge];
    const mine = leg.end === 'a' ? cut.cutA : cut.cutB;
    const other = leg.end === 'a' ? cut.cutB : cut.cutA;
    if (cut.cutA + cut.cutB >= L) continue; // ribbonless
    const band = mine + CROSSWALK_START + CROSSWALK_WIDTH;
    if (band > L - other) continue;
    const sC = mine + CROSSWALK_START + CROSSWALK_WIDTH / 2;
    const { p, dir } = net.pointAt(leg.edge, leg.end === 'a' ? sC : L - sC);
    const nrm = { x: -dir.z, z: dir.x };
    const off = e.width / 2 + e.sidewalk / 2;
    const pa = { x: p.x - nrm.x * off, z: p.z - nrm.z * off };
    const pb = { x: p.x + nrm.x * off, z: p.z + nrm.z * off };
    const sa = snap(pa), sb = snap(pb);
    if (!sa || !sb) { skipped++; if (opts.onSkip) opts.onSkip(leg.node, leg.edge, !sa, !sb); continue; }
    const tag = `n${leg.node}:e${leg.edge}`;
    const ida = `cw:${tag}:a`, idb = `cw:${tag}:b`;
    const pda: Pending = { id: ida, p: sa.q, ring: sa.ring, seg: sa.seg, t: sa.t };
    const pdb: Pending = { id: idb, p: sb.q, ring: sb.ring, seg: sb.seg, t: sb.t };
    pendings.push(pda, pdb);
    const cw: RealCrosswalk = {
      intersectionId: `n${leg.node}`, side: sideOf(leg.dir), a: sa.q, b: sb.q, width: CROSSWALK_WIDTH, edge: leg.edge, node: leg.node,
    };
    crosswalks.push(cw);
    crossingInfo.push({ cw, ida, idb, pda, pdb });
  }

  // ---- ring nodes and edges, crosswalk ends spliced in (kept >= MIN_END_GAP from vertices and from each other)
  const bySeg = new Map<string, Pending[]>();
  for (const pd of pendings) {
    const k = `${pd.ring}:${pd.seg}`;
    (bySeg.get(k) ?? bySeg.set(k, []).get(k)!).push(pd);
  }
  for (const [k, list] of bySeg) {
    const [ri, si] = k.split(':').map(Number);
    const r = rings[ri];
    const a = r[si], c = r[(si + 1) % r.length];
    const len = distance(a, c);
    list.sort((u, v) => u.t - v.t);
    if (len < (list.length + 1) * MIN_END_GAP) {
      // too short to keep the gap: spread the ends evenly so no edge has zero length
      list.forEach((pd, i) => { pd.t = (i + 1) / (list.length + 1); pd.p = { x: a.x + (c.x - a.x) * pd.t, z: a.z + (c.z - a.z) * pd.t }; });
      continue;
    }
    const gap = MIN_END_GAP / len;
    let lo = gap;
    for (const pd of list) {
      pd.t = Math.max(pd.t, lo);
      lo = pd.t + gap;
    }
    for (let i = list.length - 1, hi = 1 - gap; i >= 0; i--) {
      list[i].t = Math.min(list[i].t, hi);
      hi = list[i].t - gap;
    }
    for (const pd of list) pd.p = { x: a.x + (c.x - a.x) * pd.t, z: a.z + (c.z - a.z) * pd.t };
  }
  rings.forEach((ring, b) => {
    if (!ring.length) return;
    const n = ring.length;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) { ids.push(`sw:b${b}:${i}`); addNode(ids[i], ring[i], b); }
    for (let i = 0; i < n; i++) {
      const a = ring[i], c = ring[(i + 1) % n];
      const ins = (bySeg.get(`${b}:${i}`) ?? []).sort((u, v) => u.t - v.t);
      const chain: Array<{ id: string; p: Vec2 }> = [{ id: ids[i], p: a }];
      for (const pd of ins) { addNode(pd.id, pd.p, -1); crosswalkNodes.add(pd.id); chain.push({ id: pd.id, p: pd.p }); }
      chain.push({ id: ids[(i + 1) % n], p: c });
      // subdivide long runs so no edge exceeds `spacing`
      for (let k = 0; k + 1 < chain.length; k++) {
        const u = chain[k], v = chain[k + 1];
        const m = Math.max(1, Math.ceil(distance(u.p, v.p) / spacing));
        let prev = u.id;
        for (let q = 1; q <= m; q++) {
          let cur = v.id;
          if (q < m) {
            cur = `sw:b${b}:${i}.${k}.${q}`;
            addNode(cur, { x: u.p.x + ((v.p.x - u.p.x) * q) / m, z: u.p.z + ((v.p.z - u.p.z) * q) / m }, b);
          }
          both(prev, cur);
          prev = cur;
        }
      }
    }
  });

  // ---- crosswalk edges, tagged with the crossed street
  for (const { cw, ida, idb, pda, pdb } of crossingInfo) {
    cw.a = pda.p;
    cw.b = pdb.p;
    both(ida, idb, net.streetIdOf(cw.edge));
  }
  return { graph, crosswalks, blockOf, crosswalkNodes, skipped };
}

export function buildPedCrossingsReal(sw: SidewalkNet, net: RoadNet): Map<string, PedCrossing> {
  const out = new Map<string, PedCrossing>();
  for (const cw of sw.crosswalks) {
    const tag = `n${cw.node}:e${cw.edge}`;
    const ida = `cw:${tag}:a`, idb = `cw:${tag}:b`;
    if (!sw.graph.nodes[ida] || !sw.graph.nodes[idb]) continue;
    const info: PedCrossing = { intersectionId: cw.intersectionId, crossedStreetId: net.streetIdOf(cw.edge) };
    out.set(`${ida}>${idb}`, info);
    out.set(`${idb}>${ida}`, info);
  }
  return out;
}
