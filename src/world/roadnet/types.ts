/**
 * RoadNet data model (plain JSON-able). A RoadNet is a planar graph of street centrelines:
 *   nodes  = intersections, dead ends and `stub` ends where a street leaves the built extent;
 *   edges  = centreline polylines between two nodes with name, class, curb-to-curb width, sidewalk width, lanes, one-way;
 *   blocks = bounded faces of the at-grade edges, as signed edge loops (the curb and building-line polygons are derived
 *            at runtime by offsetting each edge by width/2 and width/2 + sidewalk; see RoadNet.blockRing()).
 * Frame: grid metres (+x east along the Bed-Stuy streets, +z south, origin Throop x Kosciuszko), see geom.ts REAL_FRAME.
 */
import type { Vec2 } from '@/core/Math2';
import type { LocalFrame } from './geom';

export type RoadClass = 'highway' | 'ramp' | 'arterial' | 'avenue' | 'street' | 'ped';
export type NodeControl = 'signal' | 'stop' | 'none' | 'stub' | 'deadend';

export interface RNNodeData {
  p: Vec2;
  control: NodeControl;
  /** id of the source object when built by an adapter (GridModel intersection id) */
  ref?: string;
}

export interface RNEdgeData {
  a: number;
  b: number;
  /** centreline polyline a -> b, endpoints equal to the node positions */
  pts: Vec2[];
  name: string;
  cls: RoadClass;
  /** curb-to-curb width (m) */
  width: number;
  /** sidewalk width each side (m) */
  sidewalk: number;
  /** travel lanes, both directions together */
  lanes: number;
  /** 1 = one-way a->b, -1 = one-way b->a, 0 = two-way */
  oneway: -1 | 0 | 1;
  /** 0 at grade, -1 below (trench/tunnel), 1 above (bridge/viaduct) */
  level: number;
  truck?: boolean;
  /** posted speed (mph) */
  speed?: number;
  /** id of the source object when built by an adapter (GridModel segment id) */
  ref?: string;
  /** stable street id when built by an adapter (GridModel street id); otherwise derived from the name */
  streetId?: string;
}

export interface RNBlockData {
  /** signed edge refs (+(i+1) a->b, -(i+1) b->a), walked with the block on the right... see RoadNet.blockRing */
  edges: number[];
  /** centreline-ring area (m^2) */
  area: number;
  /** too small to hold lots (traffic island, plaza triangle) */
  island: boolean;
  /** id of the source object when built by an adapter (GridModel block id) */
  ref?: string;
}

export interface RoadNetData {
  version: 1;
  frame: LocalFrame;
  /** the polygon the network was clipped to (grid metres) */
  extent: Vec2[];
  nodes: RNNodeData[];
  edges: RNEdgeData[];
  blocks: RNBlockData[];
}
