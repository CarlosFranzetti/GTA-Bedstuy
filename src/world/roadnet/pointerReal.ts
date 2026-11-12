/**
 * REALGAME: the mission arrow and the map's route line on the real map. Real path only (reached from `gameReal.ts`).
 *
 * Same contract as `createPointerRouter(grid)` in game/missions/PointerRoute.ts: when the straight line to the goal crosses a
 * block of buildings, aim at the furthest sidewalk corner of the shortest sidewalk route that is in clear view. Differences:
 * the obstacles are the real building rings (inset a little, so grazing a wall line does not count) and the route runs on
 * June's sidewalk graph (`buildSidewalkGraph`), whose nodes are not in a grid.
 */
import type { Vec2 } from '@/core/Math2';
import type { Graph, GraphNode } from '@/world/types';
import type { PointerRouter } from '@/game/missions/PointerRoute';
import { pointInPolygon, segmentIntersection } from './geom';
import { insetRing } from './sidewalks';

const SHRINK = 0.4; // m, as the grid router
const REPLAN_MOVE = 3; // m the player may move before the route is recomputed
const BUCKET = 64; // m, nearest-node lookup grid

interface Ring { pts: Vec2[]; minX: number; maxX: number; minZ: number; maxZ: number }

/** Dijkstra over the sidewalk graph from node `s` to node `e`; [] when not connected. Exported for the tests. */
export function sidewalkRoute(g: Graph, s: string, e: string): GraphNode[] {
  const dist = new Map<string, number>([[s, 0]]);
  const prev = new Map<string, string>();
  const heap: Array<[number, string]> = [[0, s]];
  const up = (i: number): void => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const down = (): void => {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
    }
  };
  while (heap.length) {
    const [d, id] = heap[0];
    const last = heap.pop()!;
    if (heap.length) { heap[0] = last; down(); }
    if (id === e) break;
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const ei of g.adjacency[id] ?? []) {
      const edge = g.edges[ei];
      const nd = d + edge.length;
      if (nd < (dist.get(edge.to) ?? Infinity)) { dist.set(edge.to, nd); prev.set(edge.to, id); heap.push([nd, edge.to]); up(heap.length - 1); }
    }
  }
  if (!prev.has(e) && s !== e) return [];
  const out: GraphNode[] = [];
  for (let id: string | undefined = e; id !== undefined; id = prev.get(id)) out.push(g.nodes[id]);
  return out.reverse();
}

/** Nearest-node lookup over a coarse bucket grid (the graph has thousands of nodes; the arrow replans every few metres). */
export function nodeFinder(g: Graph): (p: Vec2) => GraphNode {
  const cells = new Map<string, GraphNode[]>();
  const key = (cx: number, cz: number): string => `${cx}:${cz}`;
  const all = Object.values(g.nodes);
  for (const n of all) {
    const k = key(Math.floor(n.pos.x / BUCKET), Math.floor(n.pos.z / BUCKET));
    const a = cells.get(k);
    if (a) a.push(n); else cells.set(k, [n]);
  }
  return (p) => {
    const cx = Math.floor(p.x / BUCKET), cz = Math.floor(p.z / BUCKET);
    let best: GraphNode | null = null, bd = Infinity;
    for (let r = 0; r < 40 && (!best || r * BUCKET < bd + BUCKET); r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const n of cells.get(key(cx + dx, cz + dz)) ?? []) {
          const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best ?? all[0];
  };
}

/** `rings`: the block building lines (Derived.buildingRings, [] entries allowed); `graph`: SidewalkNet.graph. */
export function createRealPointerRouter(rings: ReadonlyArray<ReadonlyArray<Vec2>>, graph: Graph): PointerRouter {
  const obstacles: Ring[] = [];
  for (const r of rings) {
    if (r.length < 3) continue;
    const pts = insetRing(r, SHRINK);
    if (pts.length < 3) continue;
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    obstacles.push({ pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  }
  const hits = (a: Vec2, b: Vec2, o: Ring): boolean => {
    if (Math.max(a.x, b.x) < o.minX || Math.min(a.x, b.x) > o.maxX || Math.max(a.z, b.z) < o.minZ || Math.min(a.z, b.z) > o.maxZ) return false;
    const n = o.pts.length;
    for (let i = 0; i < n; i++) if (segmentIntersection(a, b, o.pts[i], o.pts[(i + 1) % n])) return true;
    return pointInPolygon(a, o.pts);
  };
  const clear = (a: Vec2, b: Vec2): boolean => {
    for (const o of obstacles) if (hits(a, b, o)) return false;
    return true;
  };
  const nearest = nodeFinder(graph);

  const out: Vec2 = { x: 0, z: 0 };
  let cacheKey = '';
  let path: GraphNode[] = [];
  let planFrom: Vec2 = { x: Infinity, z: Infinity };

  return (from, to) => {
    if (clear(from, to)) { cacheKey = ''; out.x = to.x; out.z = to.z; return out; }
    const key = `${to.x.toFixed(1)}:${to.z.toFixed(1)}`;
    if (key !== cacheKey || Math.hypot(from.x - planFrom.x, from.z - planFrom.z) > REPLAN_MOVE) {
      cacheKey = key; planFrom = { x: from.x, z: from.z };
      path = sidewalkRoute(graph, nearest(from).id, nearest(to).id);
    }
    let pick: GraphNode | null = null;
    for (let i = path.length - 1; i >= 0; i--) {
      const p = path[i].pos;
      if (Math.hypot(p.x - from.x, p.z - from.z) < 2.5) continue;
      if (clear(from, p)) { pick = path[i]; break; }
    }
    if (!pick) { out.x = to.x; out.z = to.z; return out; }
    out.x = pick.pos.x; out.z = pick.pos.z;
    return out;
  };
}
