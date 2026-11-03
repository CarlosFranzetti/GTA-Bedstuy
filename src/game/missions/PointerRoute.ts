/**
 * Where the mission arrow should point so a phone player is not led into a wall: when the straight line to the goal
 * crosses a block of buildings, aim at the furthest sidewalk corner on the shortest sidewalk route that is in clear
 * view, and re-aim as the player moves. Pure; uses only the grid's sidewalk graph and block building lines.
 */
import type { Vec2 } from '@/core/Math2';
import type { GraphNode, GridModel } from '@/world/types';

interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

const SHRINK = 0.4; // m: grazing a wall line does not count as crossing it
const REPLAN_MOVE = 3; // m the player may move before the route is recomputed

/** Liang-Barsky: does the segment a-b pass through the box? */
function segHitsBox(a: Vec2, b: Vec2, bx: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, a.x - bx.minX) && clip(dx, bx.maxX - a.x) && clip(-dz, a.z - bx.minZ) && clip(dz, bx.maxZ - a.z) && t0 <= t1;
}

export type PointerRouter = (from: Vec2, to: Vec2) => Vec2;

export function createPointerRouter(grid: GridModel): PointerRouter {
  const boxes: Box[] = grid.blocks.map((b) => {
    const xs = b.buildingLine.map((p) => p.x), zs = b.buildingLine.map((p) => p.z);
    return { minX: Math.min(...xs) + SHRINK, maxX: Math.max(...xs) - SHRINK, minZ: Math.min(...zs) + SHRINK, maxZ: Math.max(...zs) - SHRINK };
  });
  const clear = (a: Vec2, b: Vec2): boolean => {
    for (const bx of boxes) if (segHitsBox(a, b, bx)) return false;
    return true;
  };

  const out: Vec2 = { x: 0, z: 0 };
  let cacheKey = '';
  let path: GraphNode[] = [];
  let planFrom: Vec2 = { x: Infinity, z: Infinity };

  /** Shortest sidewalk route (Dijkstra, binary heap) between two nodes. */
  const route = (s: GraphNode, e: GraphNode): GraphNode[] => {
    const g = grid.sidewalks;
    const dist = new Map<string, number>([[s.id, 0]]);
    const prev = new Map<string, string>();
    const heap: Array<[number, string]> = [[0, s.id]];
    const push = (it: [number, string]): void => {
      heap.push(it);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = (): [number, string] => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, id] = pop();
      if (id === e.id) break;
      if (d > (dist.get(id) ?? Infinity)) continue;
      for (const ei of g.adjacency[id] ?? []) {
        const edge = g.edges[ei];
        const nd = d + edge.length;
        if (nd < (dist.get(edge.to) ?? Infinity)) { dist.set(edge.to, nd); prev.set(edge.to, id); push([nd, edge.to]); }
      }
    }
    if (!prev.has(e.id) && s.id !== e.id) return [];
    const nodes: GraphNode[] = [];
    for (let id: string | undefined = e.id; id !== undefined; id = prev.get(id)) nodes.push(g.nodes[id]);
    return nodes.reverse();
  };

  return (from, to) => {
    if (clear(from, to)) { cacheKey = ''; out.x = to.x; out.z = to.z; return out; }
    const key = `${to.x.toFixed(1)}:${to.z.toFixed(1)}`;
    const moved = Math.hypot(from.x - planFrom.x, from.z - planFrom.z);
    if (key !== cacheKey || moved > REPLAN_MOVE) {
      cacheKey = key; planFrom = { x: from.x, z: from.z };
      path = route(grid.nearestSidewalkNode(from), grid.nearestSidewalkNode(to));
    }
    // furthest corner on the route that is in clear view (corners already passed fall behind the player: skip them)
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
