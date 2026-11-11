/**
 * Where the map screen gets the BUILT streets from. The screen only knows this interface, so the grid (today) and the RoadNet
 * (`?map=real`) feed it the same way and MapScreen does not change when the real map arrives.
 *
 * Frame: grid metres (+x east along the Bed-Stuy streets, +z south, origin Throop x Kosciuszko, axes turned `frame.rotDeg`
 * from true north). The RoadNet and the Brooklyn overview layer are in this same frame by construction (realmap.md section 1,
 * same origin and grid angle), so no transform is needed between them; `frame` is carried so the screen can assert that and
 * so a source in another frame can be rejected rather than drawn misaligned.
 */
import type { Vec2 } from '@/core/Math2';
import type { GridModel } from '@/world/types';
import type { RoadNet } from '@/world/roadnet/RoadNet';
import { REAL_FRAME } from '@/world/roadnet/geom';

export type MapRoadClass = 'street' | 'avenue' | 'arterial' | 'highway';

export interface MapStreet {
  /** display name ("Fulton St") */
  name: string;
  cls: MapRoadClass;
  /** curb-to-curb width in metres */
  width: number;
  /** centreline polyline, 2 or more points */
  pts: readonly Vec2[];
}

export interface MapFrame { lat0: number; lon0: number; rotDeg: number }

export interface MapStreetSource {
  readonly frame: MapFrame;
  /** the built (playable) area, grid metres */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** centrelines to draw bright; one entry per street piece (the grid merges each street into one line) */
  streets(): readonly MapStreet[];
  /** city-block outlines, drawn a step lighter than the land (may be empty) */
  blocks(): readonly (readonly Vec2[])[];
  /** the nearest street to p, or null when none is within `maxDist` metres */
  nearest(p: Vec2, maxDist?: number): { name: string; dist: number } | null;
}

const distToSeg = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};

/** Generic nearest-street search over a street list (used by the grid source and by tests' fakes). */
export function nearestInStreets(streets: readonly MapStreet[], p: Vec2, maxDist: number): { name: string; dist: number } | null {
  let best: { name: string; dist: number } | null = null;
  for (const s of streets) {
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const d = distToSeg(p, s.pts[i], s.pts[i + 1]);
      if (d <= maxDist && (!best || d < best.dist)) best = { name: s.name, dist: d };
    }
  }
  return best;
}

/** The axis-aligned grid: one merged centreline per street (so a name fits on it at any zoom). */
export function gridStreetSource(grid: GridModel): MapStreetSource {
  const ext = new Map<string, { min: number; max: number }>();
  for (const seg of grid.segments) {
    const s = grid.streetById(seg.streetId);
    const lo = s.axis === 'ew' ? Math.min(seg.a.x, seg.b.x) : Math.min(seg.a.z, seg.b.z);
    const hi = s.axis === 'ew' ? Math.max(seg.a.x, seg.b.x) : Math.max(seg.a.z, seg.b.z);
    const e = ext.get(s.id);
    if (e) { e.min = Math.min(e.min, lo); e.max = Math.max(e.max, hi); } else ext.set(s.id, { min: lo, max: hi });
  }
  const streets: MapStreet[] = [];
  for (const st of grid.streets) {
    const e = ext.get(st.id);
    if (!e) continue;
    const pts = st.axis === 'ew' ? [{ x: e.min, z: st.offset }, { x: e.max, z: st.offset }] : [{ x: st.offset, z: e.min }, { x: st.offset, z: e.max }];
    streets.push({ name: st.name, cls: st.class === 'avenue' ? 'avenue' : 'street', width: st.roadWidth, pts });
  }
  const blocks = grid.blocks.map((b) => b.curb);
  return {
    frame: REAL_FRAME,
    bounds: grid.bounds,
    streets: () => streets,
    blocks: () => blocks,
    nearest: (p, maxDist = 30) => {
      const n = grid.nearestStreet(p);
      const st = streets.find((s) => s.name === n.name);
      if (!st) return null;
      const d = distToSeg(p, st.pts[0], st.pts[1]);
      return d <= maxDist ? { name: n.signName, dist: d } : null;
    },
  };
}

const CLS_MAP: Record<string, MapRoadClass | undefined> = { street: 'street', avenue: 'avenue', arterial: 'arterial', highway: 'highway', ramp: 'highway' };

/** A RoadNet (the real map). Footpaths ('ped') and below-grade edges are skipped; the el and tunnels are not "streets". */
export function roadNetStreetSource(net: RoadNet): MapStreetSource {
  let streets: MapStreet[] | null = null;
  let blocks: Vec2[][] | null = null;
  const b = net.bounds;
  const list = (): MapStreet[] => {
    if (!streets) {
      streets = [];
      for (const e of net.edges) {
        const cls = CLS_MAP[e.cls];
        if (!cls || e.level !== 0) continue;
        streets.push({ name: e.name, cls, width: e.width, pts: e.pts });
      }
    }
    return streets;
  };
  return {
    frame: net.data.frame,
    bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
    streets: list,
    blocks: () => {
      if (!blocks) {
        blocks = [];
        net.blocks.forEach((bl, i) => { if (!bl.island) { try { blocks!.push(net.blockOutline(i)); } catch { /* degenerate face */ } } });
      }
      return blocks;
    },
    nearest: (p, maxDist = 30) => {
      const h = net.nearestEdge(p, maxDist);
      return h ? { name: net.edges[h.edge].name, dist: h.dist } : null;
    },
  };
}
