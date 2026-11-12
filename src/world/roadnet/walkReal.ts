/**
 * REALGAME: ground rules for hand-placed points on the real map. On the grid a block interior is open yard, so a mission can say
 * "22 m east of the station" or run a kid "through the alley"; on the real map that is a building. `createWalker` gives the two
 * hooks `places.ts` calls (`useRealPlaces(places, walker)`):
 *   snap(p)   a point inside a building (more than a 0.4 m graze) moves to the nearest point of the sidewalk graph; any other
 *             point stays where it is
 *   path(pts) a route a person can run: the points snapped, with the sidewalk corners between them, so it never cuts a block
 */
import type { Vec2 } from '@/core/Math2';
import type { Graph } from '@/world/types';
import type { RealWalk } from '@/game/missions/content/places';
import { closestOnSegment, pointInPolygon } from './geom';
import { nodeFinder, sidewalkRoute } from './pointerReal';
import { insetRing } from './sidewalks';

const GRAZE = 0.4; // m, as the pointer router

export function createWalker(rings: ReadonlyArray<ReadonlyArray<Vec2>>, graph: Graph): RealWalk {
  const inner = rings.filter((r) => r.length > 2).map((r) => insetRing(r, GRAZE)).filter((r) => r.length > 2);
  const inside = (p: Vec2): boolean => inner.some((r) => pointInPolygon(p, r));
  const nearest = nodeFinder(graph);
  const snap = (p: Vec2): Vec2 => {
    if (!inside(p)) return { x: p.x, z: p.z };
    let best: Vec2 | null = null, bd = Infinity;
    for (const e of graph.edges) {
      const a = graph.nodes[e.from], b = graph.nodes[e.to];
      if (!a || !b) continue;
      const c = closestOnSegment(p, a.pos, b.pos);
      if (c.d2 < bd) { bd = c.d2; best = c.q; }
    }
    return best ?? { x: p.x, z: p.z };
  };
  const path = (pts: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    const add = (p: Vec2): void => { const l = out[out.length - 1]; if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1) out.push({ x: p.x, z: p.z }); };
    const s = pts.map(snap);
    s.forEach((p, i) => {
      if (i > 0) for (const n of sidewalkRoute(graph, nearest(s[i - 1]).id, nearest(p).id)) add(n.pos);
      add(p);
    });
    return out;
  };
  return { snap, path };
}
