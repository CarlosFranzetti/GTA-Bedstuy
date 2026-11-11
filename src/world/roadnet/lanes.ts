/**
 * WP2: vehicle lane graph of a RoadNet. Produces the SAME `LaneGraph` type `Grid.ts` builds, so TrafficAgent, Cop, CopSystem
 * and TrafficSystem need no change. Pure and deterministic, no THREE.
 *
 * Per edge and travel direction: lanes offset to the right of the centreline (two-way: `laneOffset`; one-way: `edge.lanes`
 * lanes spread `laneWidth` apart, centred), nodes every <= `maxSpacing` m and at every shape point of the polyline (curves are
 * followed), heading from the local tangent. Lane ids: `ln:{edge}:{f|r}:{lane}:{i}` (f = a -> b, lane 0 is the leftmost).
 *
 * Junctions work on clusters (clusters.ts): ribbonless edges carry no lanes, the connectors run straight across the cluster.
 * An entering lane's last node is the stop line (`stopLine: true`, `intersectionId` = cluster id `n{minNode}`) at `cut +
 * STOP_LINE` (contract.ts); an exiting lane starts at `cut + EXIT`. Connectors are cubic Beziers sampled every `turnStep`
 * m, ids `cx:{from}>{to}:{i}`. No U-turns except where the graph would otherwise strand a lane (dead ends, one-way
 * edges whose only way on is back). Right turns leave the rightmost lane, left turns the leftmost, straights map lane i to
 * lane i. Stubs: an entering lane runs to the stub node and ends (despawn point); an exiting lane starts there (spawn point).
 * `level != 0` edges get lanes but only connect to edges of the same level.
 */
import { angleDiff, headingFromVec } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { GraphEdge, LaneGraph, LaneNode } from '@/world/types';
import { STOP_LINE } from './contract';
import { clusterId, clusterIndexOfNode, isRibbonless, junctionClusters, outerLegs } from './clusters';
import type { Derived } from './derive';
import type { RoadNet } from './RoadNet';

export interface LaneOptions {
  /** lateral offset of each lane from the centreline on two-way edges (m) */
  laneOffset?: number;
  /** lane spacing on one-way edges (m) */
  laneWidth?: number;
  /** max spacing between lane nodes on an edge (m) */
  maxSpacing?: number;
  /** spacing of connector samples (m) */
  turnStep?: number;
}

export const DEFAULT_LANES: Required<LaneOptions> = { laneOffset: 2.0, laneWidth: 3.0, maxSpacing: 15, turnStep: 3 };

/** lane nodes are spaced a little under maxSpacing so the offset lane on the outside of a bend still stays within it */
const SPACING_MARGIN = 0.93;
/** distance from the cut to the first node of an exiting lane (m) */
const EXIT_DIST = 2.5;
/** distance back from the end of a dead-end edge where lanes turn around (m) */
const DEAD_END_BACK = 3;
/** turn angle (rad) beyond which a connection counts as a left / right turn rather than straight */
const TURN_MIN = 0.5;
/** sharper than this and the connection is a U-turn, only built when a lane would be stranded otherwise */
const U_TURN = 2.9;

export type EndKind = 'junction' | 'through' | 'dead' | 'stub';

export interface LaneChain {
  /** `{edge}:{f|r}:{lane}` */
  id: string;
  edge: number;
  dir: 'f' | 'r';
  lane: number;
  lanes: number;
  nodeIds: string[];
  /** leg the lane leaves its first node through / enters through at its last node */
  exitLeg: number;
  enterLeg: number;
  startKind: EndKind;
  endKind: EndKind;
}

export interface Connector {
  from: string;
  to: string;
  cluster: string;
  nodeIds: string[];
  /** true for a U-turn */
  uturn: boolean;
}

export interface LaneBuild {
  graph: LaneGraph;
  chains: LaneChain[];
  connectors: Connector[];
  /** lane ends with nowhere to go that are not stubs (should be empty) */
  strandedEnds: string[];
  /** lane starts nothing leads into that are not stubs (should be empty) */
  orphanStarts: string[];
  /** lane ends / starts of junctions where every lane only leaves (sources) or only enters (sinks): data quirks, treated like stubs */
  extraSinks: string[];
  extraSources: string[];
  clusters: number[][];
}

const dirOf = (heading: number): Vec2 => ({ x: Math.sin(heading), z: -Math.cos(heading) });

export function buildLaneGraph(net: RoadNet, d: Derived, opts: LaneOptions = {}): LaneGraph {
  return buildLaneGraphDetailed(net, d, opts).graph;
}

export function buildLaneGraphDetailed(net: RoadNet, d: Derived, opts: LaneOptions = {}): LaneBuild {
  const o: Required<LaneOptions> = { ...DEFAULT_LANES, ...opts };
  const graph: LaneGraph = { nodes: {}, edges: [], adjacency: {} };
  const clusters = junctionClusters(net, d);
  const ci = clusterIndexOfNode(net, clusters);
  const cid = clusters.map(clusterId);

  const addNode = (n: LaneNode): void => { graph.nodes[n.id] = n; graph.adjacency[n.id] = []; };
  const addEdge = (from: string, to: string, streetId: string): void => {
    const a = graph.nodes[from].pos;
    const b = graph.nodes[to].pos;
    const e: GraphEdge = { from, to, length: Math.hypot(a.x - b.x, a.z - b.z), streetId };
    graph.adjacency[from].push(graph.edges.length);
    graph.edges.push(e);
  };

  // ---- classify every leg's junction (cluster x level): 3+ legs junction, 2 through, 1 dead end or stub
  const kindOfLeg = new Map<number, EndKind>();
  const groupOfLeg = new Map<number, string>();
  const legsOfGroup = new Map<string, number[]>();
  clusters.forEach((c, k) => {
    for (const id of outerLegs(net, d, c)) {
      const key = `${k}:${net.edges[d.legs[id].edge].level}`;
      const l = legsOfGroup.get(key);
      if (l) l.push(id); else legsOfGroup.set(key, [id]);
    }
  });
  for (const [key, ids] of legsOfGroup) {
    const k = Number(key.split(':')[0]);
    const kind: EndKind = ids.length >= 3 ? 'junction' : ids.length === 2 ? 'through'
      : clusters[k].some((v) => net.nodes[v].control === 'deadend') ? 'dead' : 'stub';
    for (const id of ids) { kindOfLeg.set(id, kind); groupOfLeg.set(id, key); }
  }

  // ---- lane chains
  const chains: LaneChain[] = [];
  const chainById = new Map<string, LaneChain>();
  const byEnterLeg = new Map<number, LaneChain[]>();
  const byExitLeg = new Map<number, LaneChain[]>();
  const push = <K>(m: Map<K, LaneChain[]>, k: K, c: LaneChain): void => { const l = m.get(k); if (l) l.push(c); else m.set(k, [c]); };

  for (let e = 0; e < net.edges.length; e++) {
    const ed = net.edges[e];
    if (ed.cls === 'ped' || ed.a === ed.b || isRibbonless(net, d, e)) continue;
    const streetId = net.streetIdOf(e);
    const L = net.lengths[e];
    for (const dir of ['f', 'r'] as const) {
      if (dir === 'f' ? ed.oneway === -1 : ed.oneway === 1) continue;
      const exitLeg = e * 2 + (dir === 'f' ? 0 : 1);
      const enterLeg = e * 2 + (dir === 'f' ? 1 : 0);
      const startKind = kindOfLeg.get(exitLeg) ?? 'stub';
      const endKind = kindOfLeg.get(enterLeg) ?? 'stub';
      const count = ed.oneway === 0 ? 1 : Math.max(1, ed.lanes);
      // travel polyline
      const tp = dir === 'f' ? ed.pts : ed.pts.slice().reverse();
      const tc = new Float64Array(tp.length);
      for (let k = 1; k < tp.length; k++) tc[k] = tc[k - 1] + Math.hypot(tp[k].x - tp[k - 1].x, tp[k].z - tp[k - 1].z);
      const total = tc[tp.length - 1] || L;
      const cutStart = d.legs[exitLeg].cut;
      const cutEnd = d.legs[enterLeg].cut;
      const room = Math.max(0.5, total - cutStart - cutEnd);
      let t0: number;
      let t1: number;
      if (startKind === 'stub') t0 = 0;
      else if (startKind === 'dead') t0 = Math.min(DEAD_END_BACK, total * 0.3);
      else t0 = cutStart + Math.min(EXIT_DIST, room * 0.3);
      if (endKind === 'stub') t1 = total;
      else if (endKind === 'dead') t1 = total - Math.min(DEAD_END_BACK, total * 0.3);
      else t1 = total - cutEnd - Math.min(STOP_LINE, room * 0.6);
      if (t1 - t0 < 0.3) { t0 = Math.min(t0, Math.max(0, t1 - 0.3)); if (t1 - t0 < 0.3) t1 = Math.min(total, t0 + 0.3); }
      // sample parameters: ends, interior shape points, then split gaps wider than maxSpacing
      const marks = [t0];
      for (let k = 1; k < tp.length - 1; k++) if (tc[k] > t0 + 0.5 && tc[k] < t1 - 0.5) marks.push(tc[k]);
      marks.push(t1);
      const params: number[] = [];
      for (let k = 0; k < marks.length - 1; k++) {
        const gap = marks[k + 1] - marks[k];
        const n = Math.max(1, Math.ceil(gap / (o.maxSpacing * SPACING_MARGIN)));
        for (let q = 0; q < n; q++) params.push(marks[k] + (gap * q) / n);
      }
      params.push(t1);

      for (let lane = 0; lane < count; lane++) {
        const off = ed.oneway === 0 ? o.laneOffset : (lane - (count - 1) / 2) * o.laneWidth;
        const id = `${e}:${dir}:${lane}`;
        const nodeIds: string[] = [];
        params.forEach((tau, i) => {
          const { p, t } = sampleOffset(tp, tc, tau, off);
          const last = i === params.length - 1;
          const stop = last && endKind === 'junction';
          const node: LaneNode = {
            id: `ln:${id}:${i}`, pos: p, streetId, heading: headingFromVec(t), stopLine: stop,
            ...(stop ? { intersectionId: cid[ci[net.edges[e][dir === 'f' ? 'b' : 'a']]] } : {}),
          };
          addNode(node);
          if (i > 0) addEdge(nodeIds[i - 1], node.id, streetId);
          nodeIds.push(node.id);
        });
        const chain: LaneChain = { id, edge: e, dir, lane, lanes: count, nodeIds, exitLeg, enterLeg, startKind, endKind };
        chains.push(chain);
        chainById.set(id, chain);
        push(byEnterLeg, enterLeg, chain);
        push(byExitLeg, exitLeg, chain);
      }
    }
  }

  // ---- connectors
  const connectors: Connector[] = [];
  const hasIncoming = new Set<string>();
  const first = (c: LaneChain): LaneNode => graph.nodes[c.nodeIds[0]];
  const last = (c: LaneChain): LaneNode => graph.nodes[c.nodeIds[c.nodeIds.length - 1]];
  const linked = new Set<string>();

  const connect = (a: LaneChain, b: LaneChain, cluster: string, uturn: boolean): void => {
    const from = last(a);
    const to = first(b);
    const key = `${from.id}>${to.id}`;
    if (linked.has(key)) return;
    linked.add(key);
    const nodeIds = bezierConnector(from, to, o.turnStep, b.id, addNode);
    let prev = from.id;
    for (const nid of nodeIds) { addEdge(prev, nid, graph.nodes[to.id].streetId); prev = nid; }
    addEdge(prev, to.id, graph.nodes[to.id].streetId);
    hasIncoming.add(to.id);
    connectors.push({ from: from.id, to: to.id, cluster, nodeIds, uturn });
  };

  const turnOf = (a: LaneChain, b: LaneChain): number => angleDiff(last(a).heading, first(b).heading);

  clusters.forEach((c, k) => {
    const legs = outerLegs(net, d, c);
    const levels = new Set(legs.map((id) => net.edges[d.legs[id].edge].level));
    for (const level of levels) {
      const here = legs.filter((id) => net.edges[d.legs[id].edge].level === level);
      const kind = kindOfLeg.get(here[0]) ?? 'stub';
      if (kind === 'stub') continue;
      const ins = here.flatMap((id) => byEnterLeg.get(id) ?? []);
      const outs = here.flatMap((id) => byExitLeg.get(id) ?? []);
      const name = cid[k];
      const mine = new Map<string, number>(); // connectors per entering chain
      const mark = (a: LaneChain): void => { mine.set(a.id, (mine.get(a.id) ?? 0) + 1); };

      if (kind === 'dead') {
        // one leg: every entering lane turns around into the exit lane across from it
        for (const a of ins) {
          const mates = outs.filter((b) => b.edge === a.edge);
          if (!mates.length) continue;
          const b = mates[Math.min(mates.length - 1, Math.max(0, mates.length - 1 - a.lane))];
          connect(a, b, name, true);
          mark(a);
        }
        continue;
      }

      for (const a of ins) {
        for (const b of outs) {
          if (a.edge === b.edge) continue; // U-turn
          const th = turnOf(a, b);
          if (Math.abs(th) > U_TURN) continue;
          if (th > TURN_MIN) { if (a.lane !== a.lanes - 1) continue; } // right: rightmost lane only
          else if (th < -TURN_MIN) { if (a.lane !== 0) continue; } // left: leftmost lane only
          else {
            // straight: lane i -> lane i, widening or narrowing by proportion
            const wantFor = Math.min(b.lanes - 1, Math.floor((a.lane * b.lanes) / a.lanes));
            const entryFor = Math.min(a.lanes - 1, Math.floor((b.lane * a.lanes) / b.lanes));
            if (b.lane !== wantFor && a.lane !== entryFor) continue;
          }
          connect(a, b, name, false);
          mark(a);
        }
      }

      // a lane with no legal turn: share the exits of its nearest neighbour lane, else turn around, else it is stranded
      for (const a of ins) {
        if (mine.get(a.id)) continue;
        const mates = ins.filter((x) => x.enterLeg === a.enterLeg && x.id !== a.id && (mine.get(x.id) ?? 0) > 0)
          .sort((x, y) => Math.abs(x.lane - a.lane) - Math.abs(y.lane - a.lane));
        if (mates.length) {
          for (const cn of connectors.filter((q) => q.from === last(mates[0]).id && !q.uturn)) connect(a, chainById.get(cn.to.split(':').slice(1, 4).join(':'))!, name, false);
          mark(a);
          continue;
        }
        const back = outs.filter((b) => b.edge === a.edge)
          .sort((x, y) => Math.abs(x.lane - (a.lanes - 1 - a.lane)) - Math.abs(y.lane - (a.lanes - 1 - a.lane)));
        if (back.length) { connect(a, back[0], name, true); mark(a); }
      }
      // an exit lane nothing leads into: take the entering lane across the same edge, if any
      for (const b of outs) {
        if (hasIncoming.has(first(b).id)) continue;
        const across = ins.filter((a) => a.edge === b.edge);
        if (across.length) connect(across[Math.min(across.length - 1, Math.max(0, b.lanes - 1 - b.lane))], b, name, true);
      }
    }
  });

  // ---- audit
  const strandedEnds: string[] = [];
  const orphanStarts: string[] = [];
  const extraSinks: string[] = [];
  const extraSources: string[] = [];
  const groupsIn = new Set<string>();
  const groupsOut = new Set<string>();
  for (const c of chains) {
    const gi = groupOfLeg.get(c.enterLeg);
    const go = groupOfLeg.get(c.exitLeg);
    if (gi !== undefined) groupsIn.add(gi);
    if (go !== undefined) groupsOut.add(go);
  }
  for (const c of chains) {
    const l = last(c);
    if (c.endKind !== 'stub' && graph.adjacency[l.id].length === 0) {
      (groupsOut.has(groupOfLeg.get(c.enterLeg) ?? '') ? strandedEnds : extraSinks).push(l.id);
    }
    const f = first(c);
    if (c.startKind !== 'stub' && !hasIncoming.has(f.id)) {
      (groupsIn.has(groupOfLeg.get(c.exitLeg) ?? '') ? orphanStarts : extraSources).push(f.id);
    }
  }
  return { graph, chains, connectors, strandedEnds, orphanStarts, extraSinks, extraSources, clusters };
}

/** point `o` metres to the right of the travel polyline at arc length tau, with the travel tangent (mitred at shape points) */
function sampleOffset(tp: readonly Vec2[], tc: Float64Array, tau: number, o: number): { p: Vec2; t: Vec2 } {
  const n = tp.length;
  let k = 0;
  while (k < n - 2 && tc[k + 1] < tau - 1e-9) k++;
  const seg = (i: number): Vec2 => {
    const dx = tp[i + 1].x - tp[i].x;
    const dz = tp[i + 1].z - tp[i].z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  };
  const u = tc[k + 1] > tc[k] ? Math.min(1, Math.max(0, (tau - tc[k]) / (tc[k + 1] - tc[k]))) : 0;
  const base = { x: tp[k].x + (tp[k + 1].x - tp[k].x) * u, z: tp[k].z + (tp[k + 1].z - tp[k].z) * u };
  let t = seg(k);
  let scale = 1;
  const atStartVertex = u < 1e-6 && k > 0;
  const atEndVertex = u > 1 - 1e-6 && k < n - 2;
  if (atStartVertex || atEndVertex) {
    const other = seg(atStartVertex ? k - 1 : k + 1);
    const mx = t.x + other.x;
    const mz = t.z + other.z;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-6) {
      const m = { x: mx / ml, z: mz / ml };
      scale = 1 / Math.max(0.5, m.x * t.x + m.z * t.z);
      t = m;
    }
  }
  return { p: { x: base.x - t.z * o * scale, z: base.z + t.x * o * scale }, t };
}

/** Bezier from lane node `from` to lane node `to` along their headings; returns the ids of the interior nodes it adds */
function bezierConnector(from: LaneNode, to: LaneNode, step: number, tag: string, add: (n: LaneNode) => void): string[] {
  const p0 = from.pos;
  const p3 = to.pos;
  const chord = Math.hypot(p3.x - p0.x, p3.z - p0.z);
  const t0 = dirOf(from.heading);
  const t3 = dirOf(to.heading);
  const turn = Math.abs(angleDiff(from.heading, to.heading));
  const k = chord * (0.4 + 0.27 * (turn / Math.PI) ** 2);
  const p1 = { x: p0.x + t0.x * k, z: p0.z + t0.z * k };
  const p2 = { x: p3.x - t3.x * k, z: p3.z - t3.z * k };
  const at = (t: number): Vec2 => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x + e * p3.x, z: a * p0.z + b * p1.z + c * p2.z + e * p3.z };
  };
  const tangent = (t: number): Vec2 => {
    const u = 1 - t;
    return {
      x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      z: 3 * u * u * (p1.z - p0.z) + 6 * u * t * (p2.z - p1.z) + 3 * t * t * (p3.z - p2.z),
    };
  };
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 12; i++) { const q = at(i / 12); len += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; }
  const n = Math.max(1, Math.ceil(len / step));
  const ids: string[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const id = `cx:${from.id}>${tag}:${i}`;
    add({ id, pos: at(t), streetId: to.streetId, heading: headingFromVec(tangent(t)), stopLine: false });
    ids.push(id);
  }
  return ids;
}
