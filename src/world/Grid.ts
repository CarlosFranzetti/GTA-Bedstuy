/**
 * Grid: pure geometric model of the ten-block Bed-Stuy neighbourhood.
 * Input: bedstuy.json (streets + POIs). Output: GridModel (see types.ts) with intersections, segments,
 * crosswalks, blocks, a directed lane graph for vehicles and an undirected-style sidewalk graph for pedestrians.
 * No THREE dependency; deterministic and side-effect free.
 */
import type { Vec2 } from '@/core/Math2';
import { dist, headingFromVec } from '@/core/Math2';
import data from '@/world/data/bedstuy.json';
import type {
  BedstuyData, Block, BlockFace, Crosswalk, Graph, GraphEdge, GraphNode, GridBounds, GridModel,
  Intersection, LaneGraph, LaneNode, RoadSegment, Side, StreetDef,
} from '@/world/types';

// ---------------------------------------------------------------- tunables

/** lateral offset of each lane from the centreline on two-way streets (right-hand traffic) */
const LANE_OFFSET = 2.0;
/** max spacing between lane nodes on a segment */
const MAX_LANE_SPACING = 15;
/** distance from the intersection edge back to the stop-line node of an entering lane */
const STOP_DIST = 5;
/** distance from the intersection edge to the first node of an exiting lane */
const EXIT_DIST = 2.5;
const CROSSWALK_WIDTH = 3;
/** target spacing of mid-face sidewalk nodes */
const SIDEWALK_SPACING = 25;
/** tolerance when matching crosswalk endpoints to sidewalk corner nodes */
const NODE_MATCH_TOL = 0.1;

// ---------------------------------------------------------------- data

export function loadBedstuyData(): BedstuyData {
  return data as unknown as BedstuyData;
}

// ---------------------------------------------------------------- helpers

const z0 = (n: number): number => n + 0; // normalise -0 to +0
const pt = (x: number, z: number): Vec2 => ({ x: z0(x), z: z0(z) });

const DIRS: Record<Side, Vec2> = {
  N: { x: 0, z: -1 },
  S: { x: 0, z: 1 },
  E: { x: 1, z: 0 },
  W: { x: -1, z: 0 },
};

function emptyGraph<N extends GraphNode>(): { nodes: Record<string, N>; edges: GraphEdge[]; adjacency: Record<string, number[]> } {
  return { nodes: {}, edges: [], adjacency: {} };
}

function addNode<N extends GraphNode>(g: { nodes: Record<string, N>; adjacency: Record<string, number[]> }, n: N): N {
  g.nodes[n.id] = n;
  g.adjacency[n.id] = [];
  return n;
}

function addEdge(g: Graph, from: string, to: string, streetId?: string): void {
  const length = dist(g.nodes[from].pos, g.nodes[to].pos);
  const e: GraphEdge = streetId === undefined ? { from, to, length } : { from, to, length, streetId };
  g.adjacency[from].push(g.edges.length);
  g.edges.push(e);
}

function rect(minX: number, maxX: number, minZ: number, maxZ: number) {
  return { minX, maxX, minZ, maxZ };
}

// ---------------------------------------------------------------- lane building

interface Chain {
  segId: string;
  streetId: string;
  nodeIds: string[];
  /** intersection id where the chain starts / ends */
  startInter: string;
  endInter: string;
  /** side of the start intersection through which the chain leaves it */
  exitSide: Side;
  /** side of the end intersection through which the chain enters it */
  enterSide: Side;
}

// ---------------------------------------------------------------- main builder

export function buildGrid(input: BedstuyData): GridModel {
  const streets = input.streets;
  const nss = streets.filter((s) => s.axis === 'ns').sort((a, b) => a.offset - b.offset);
  const ews = streets.filter((s) => s.axis === 'ew').sort((a, b) => a.offset - b.offset);
  const streetMap = new Map<string, StreetDef>(streets.map((s) => [s.id, s]));

  // ---- intersections (row-major: ew outer, ns inner)
  const intersections: Intersection[] = [];
  const interById = new Map<string, Intersection>();
  for (const ew of ews) {
    for (const ns of nss) {
      const it: Intersection = {
        id: `${ns.id}|${ew.id}`,
        center: pt(ns.offset, ew.offset),
        nsStreetId: ns.id,
        ewStreetId: ew.id,
        halfX: ns.roadWidth / 2,
        halfZ: ew.roadWidth / 2,
      };
      intersections.push(it);
      interById.set(it.id, it);
    }
  }
  const interId = (ns: StreetDef, ew: StreetDef): string => `${ns.id}|${ew.id}`;

  // ---- segments (+ crosswalks, one per approach)
  const segments: RoadSegment[] = [];
  const crosswalks: Crosswalk[] = [];

  const makeCrosswalk = (inter: Intersection, side: Side): Crosswalk => {
    const ns = streetMap.get(inter.nsStreetId)!;
    const ew = streetMap.get(inter.ewStreetId)!;
    const { center, halfX, halfZ } = inter;
    if (side === 'E' || side === 'W') {
      // crosses the ew street's roadway; lined up with the ns street's sidewalk mid-line
      const sgn = side === 'E' ? 1 : -1;
      const x = center.x + sgn * (halfX + ns.sidewalkWidth / 2);
      return { intersectionId: inter.id, side, a: pt(x, center.z - halfZ), b: pt(x, center.z + halfZ), width: CROSSWALK_WIDTH };
    }
    const sgn = side === 'S' ? 1 : -1;
    const z = center.z + sgn * (halfZ + ew.sidewalkWidth / 2);
    return { intersectionId: inter.id, side, a: pt(center.x - halfX, z), b: pt(center.x + halfX, z), width: CROSSWALK_WIDTH };
  };

  for (const ns of nss) {
    for (let i = 0; i < ews.length - 1; i++) {
      const e0 = ews[i];
      const e1 = ews[i + 1];
      const from = interId(ns, e0);
      const to = interId(ns, e1);
      segments.push({
        id: `${ns.id}:${i}`,
        streetId: ns.id,
        fromIntersection: from,
        toIntersection: to,
        a: pt(ns.offset, e0.offset + e0.roadWidth / 2),
        b: pt(ns.offset, e1.offset - e1.roadWidth / 2),
        width: ns.roadWidth,
      });
      crosswalks.push(makeCrosswalk(interById.get(from)!, 'S'));
      crosswalks.push(makeCrosswalk(interById.get(to)!, 'N'));
    }
  }
  for (const ew of ews) {
    for (let i = 0; i < nss.length - 1; i++) {
      const n0 = nss[i];
      const n1 = nss[i + 1];
      const from = interId(n0, ew);
      const to = interId(n1, ew);
      segments.push({
        id: `${ew.id}:${i}`,
        streetId: ew.id,
        fromIntersection: from,
        toIntersection: to,
        a: pt(n0.offset + n0.roadWidth / 2, ew.offset),
        b: pt(n1.offset - n1.roadWidth / 2, ew.offset),
        width: ew.roadWidth,
      });
      crosswalks.push(makeCrosswalk(interById.get(from)!, 'E'));
      crosswalks.push(makeCrosswalk(interById.get(to)!, 'W'));
    }
  }

  // ---- blocks
  const blocks: Block[] = [];
  const blockMap = new Map<string, Block>();
  for (let row = 0; row < ews.length - 1; row++) {
    for (let col = 0; col < nss.length - 1; col++) {
      const north = ews[row];
      const south = ews[row + 1];
      const west = nss[col];
      const east = nss[col + 1];
      const minX = west.offset + west.roadWidth / 2;
      const maxX = east.offset - east.roadWidth / 2;
      const minZ = north.offset + north.roadWidth / 2;
      const maxZ = south.offset - south.roadWidth / 2;
      const curb: Vec2[] = [pt(minX, minZ), pt(maxX, minZ), pt(maxX, maxZ), pt(minX, maxZ)];
      const bl: Vec2[] = [
        pt(minX + west.sidewalkWidth, minZ + north.sidewalkWidth),
        pt(maxX - east.sidewalkWidth, minZ + north.sidewalkWidth),
        pt(maxX - east.sidewalkWidth, maxZ - south.sidewalkWidth),
        pt(minX + west.sidewalkWidth, maxZ - south.sidewalkWidth),
      ];
      const id = `r${row}c${col}`;
      const face = (side: Side, streetId: string, ia: number, ib: number): BlockFace => ({
        blockId: id,
        side,
        streetId,
        a: bl[ia],
        b: bl[ib],
        curbA: curb[ia],
        curbB: curb[ib],
        outward: { ...DIRS[side] },
      });
      // corner indices: 0 NW, 1 NE, 2 SE, 3 SW. a->b is left->right facing the block from the street.
      const faces: BlockFace[] = [
        face('N', north.id, 1, 0), // facing south: left = east
        face('S', south.id, 3, 2), // facing north: left = west
        face('E', east.id, 2, 1),  // facing west:  left = south
        face('W', west.id, 0, 3),  // facing east:  left = north
      ];
      const block: Block = { id, row, col, curb, buildingLine: bl, faces };
      blocks.push(block);
      blockMap.set(id, block);
    }
  }

  // ---- bounds (outer edges of the outermost roads)
  const bounds: GridBounds = {
    minX: nss[0].offset - nss[0].roadWidth / 2,
    maxX: nss[nss.length - 1].offset + nss[nss.length - 1].roadWidth / 2,
    minZ: ews[0].offset - ews[0].roadWidth / 2,
    maxZ: ews[ews.length - 1].offset + ews[ews.length - 1].roadWidth / 2,
  };

  // ---------------------------------------------------------------- lanes
  const lanes: LaneGraph = emptyGraph<LaneNode>();
  const laneList: LaneNode[] = [];
  const chains: Chain[] = [];

  for (const seg of segments) {
    const street = streetMap.get(seg.streetId)!;
    const isNs = street.axis === 'ns';
    const fwdDir = isNs ? DIRS.S : DIRS.E;
    const revDir = isNs ? DIRS.N : DIRS.W;
    const hasFwd = street.oneWay === 0 || street.oneWay === 1;
    const hasRev = street.oneWay === 0 || street.oneWay === -1;
    const offset = street.oneWay === 0 ? LANE_OFFSET : 0;
    const length = dist(seg.a, seg.b);

    const makeChain = (dir: Vec2, start: Vec2, tag: 'f' | 'r', startInter: string, endInter: string,
      exitSide: Side, enterSide: Side): void => {
      const heading = headingFromVec(dir);
      const lat = { x: -dir.z * offset, z: dir.x * offset }; // perpRight(dir) * offset
      const t0 = EXIT_DIST;
      const t1 = Math.max(t0 + 1, length - STOP_DIST);
      const n = Math.max(1, Math.ceil((t1 - t0) / MAX_LANE_SPACING));
      const nodeIds: string[] = [];
      for (let i = 0; i <= n; i++) {
        const t = t0 + ((t1 - t0) * i) / n;
        const last = i === n;
        const node: LaneNode = {
          id: `ln:${seg.id}:${tag}:${i}`,
          pos: pt(start.x + dir.x * t + lat.x, start.z + dir.z * t + lat.z),
          streetId: seg.streetId,
          heading,
          stopLine: last,
          ...(last ? { intersectionId: endInter } : {}),
        };
        addNode(lanes, node);
        laneList.push(node);
        nodeIds.push(node.id);
        if (i > 0) addEdge(lanes, nodeIds[i - 1], node.id, seg.streetId);
      }
      chains.push({ segId: seg.id, streetId: seg.streetId, nodeIds, startInter, endInter, exitSide, enterSide });
    };

    if (hasFwd) {
      // ns: travels south (leaves the north intersection via its S side, enters the south one via N)
      // ew: travels east  (leaves the west intersection via its E side, enters the east one via W)
      makeChain(fwdDir, seg.a, 'f', seg.fromIntersection, seg.toIntersection, isNs ? 'S' : 'E', isNs ? 'N' : 'W');
    }
    if (hasRev) {
      makeChain(revDir, seg.b, 'r', seg.toIntersection, seg.fromIntersection, isNs ? 'N' : 'W', isNs ? 'S' : 'E');
    }
  }

  // connect through intersections: each entering lane -> each exiting lane (straight, left, right; no U-turns)
  const hasIncoming = new Set<string>();
  const linkLanes = (from: string, to: string, streetId: string): void => {
    addEdge(lanes, from, to, streetId);
    hasIncoming.add(to);
  };
  for (const inter of intersections) {
    const entering = chains.filter((c) => c.endInter === inter.id);
    const exiting = chains.filter((c) => c.startInter === inter.id);
    for (const enter of entering) {
      const from = enter.nodeIds[enter.nodeIds.length - 1];
      for (const out of exiting) {
        if (out.exitSide === enter.enterSide) continue; // U-turn
        linkLanes(from, out.nodeIds[0], out.streetId);
      }
    }
  }
  // dead ends: a lane with no legal turn (e.g. northbound at the top of an avenue where the one-way cross street
  // only enters) or a lane that could never be entered is joined to its partner lane by a U-turn
  const uTurn = (enter: Chain, out: Chain): void => {
    linkLanes(enter.nodeIds[enter.nodeIds.length - 1], out.nodeIds[0], out.streetId);
  };
  for (const enter of chains) {
    const last = enter.nodeIds[enter.nodeIds.length - 1];
    if (lanes.adjacency[last].length > 0) continue;
    for (const out of chains) {
      if (out.startInter === enter.endInter && out.exitSide === enter.enterSide) uTurn(enter, out);
    }
  }
  for (const out of chains) {
    if (hasIncoming.has(out.nodeIds[0])) continue;
    for (const enter of chains) {
      if (enter.endInter === out.startInter && enter.enterSide === out.exitSide) uTurn(enter, out);
    }
  }

  // ---------------------------------------------------------------- sidewalks
  const sidewalks: Graph = emptyGraph<GraphNode>();
  const swList: GraphNode[] = [];
  const swByKey = new Map<string, GraphNode>();
  const keyOf = (p: Vec2): string => `${z0(Math.round(p.x * 10) / 10).toFixed(1)}:${z0(Math.round(p.z * 10) / 10).toFixed(1)}`;

  const swNode = (p: Vec2): GraphNode => {
    const key = keyOf(p);
    let n = swByKey.get(key);
    if (!n) {
      n = addNode(sidewalks, { id: `sw:${key}`, pos: pt(p.x, p.z) });
      swByKey.set(key, n);
      swList.push(n);
    }
    return n;
  };
  const swBoth = (a: GraphNode, b: GraphNode, streetId?: string): void => {
    if (a.id === b.id) return;
    addEdge(sidewalks, a.id, b.id, streetId);
    addEdge(sidewalks, b.id, a.id, streetId);
  };

  for (const block of blocks) {
    // mid-sidewalk corner positions: halfway between curb and building line corners
    const corners = block.curb.map((c, i) => pt((c.x + block.buildingLine[i].x) / 2, (c.z + block.buildingLine[i].z) / 2));
    const nodes = corners.map((c) => swNode(c));
    const ring: Array<[number, number, string]> = [
      [0, 1, block.faces[0].streetId], // N face: NW -> NE
      [1, 2, block.faces[2].streetId], // E face: NE -> SE
      [2, 3, block.faces[1].streetId], // S face: SE -> SW
      [3, 0, block.faces[3].streetId], // W face: SW -> NW
    ];
    for (const [i, j, streetId] of ring) {
      const a = corners[i];
      const b = corners[j];
      const n = Math.max(1, Math.round(dist(a, b) / SIDEWALK_SPACING));
      let prev = nodes[i];
      for (let k = 1; k <= n; k++) {
        const cur = k === n ? nodes[j] : swNode(pt(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n));
        swBoth(prev, cur, streetId);
        prev = cur;
      }
    }
  }

  // crosswalk edges: connect the sidewalk nodes lying on the far ends of each crosswalk (if both exist)
  const findSw = (p: Vec2): GraphNode | undefined => {
    let best: GraphNode | undefined;
    let bd = NODE_MATCH_TOL;
    for (const n of swList) {
      const d = dist(n.pos, p);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  };
  for (const cw of crosswalks) {
    const inter = interById.get(cw.intersectionId)!;
    const ns = streetMap.get(inter.nsStreetId)!;
    const ew = streetMap.get(inter.ewStreetId)!;
    let pa: Vec2;
    let pb: Vec2;
    let crossed: string;
    if (cw.side === 'E' || cw.side === 'W') {
      const ext = ew.sidewalkWidth / 2;
      pa = pt(cw.a.x, cw.a.z - ext);
      pb = pt(cw.b.x, cw.b.z + ext);
      crossed = ew.id;
    } else {
      const ext = ns.sidewalkWidth / 2;
      pa = pt(cw.a.x - ext, cw.a.z);
      pb = pt(cw.b.x + ext, cw.b.z);
      crossed = ns.id;
    }
    const na = findSw(pa);
    const nb = findSw(pb);
    if (na && nb) swBoth(na, nb, crossed);
  }

  // ---------------------------------------------------------------- queries
  // axis-aligned road rectangles (segments + intersection boxes)
  const roadRects = [
    ...segments.map((s) => rect(
      Math.min(s.a.x, s.b.x) - (s.a.x === s.b.x ? s.width / 2 : 0),
      Math.max(s.a.x, s.b.x) + (s.a.x === s.b.x ? s.width / 2 : 0),
      Math.min(s.a.z, s.b.z) - (s.a.z === s.b.z ? s.width / 2 : 0),
      Math.max(s.a.z, s.b.z) + (s.a.z === s.b.z ? s.width / 2 : 0),
    )),
    ...intersections.map((i) => rect(i.center.x - i.halfX, i.center.x + i.halfX, i.center.z - i.halfZ, i.center.z + i.halfZ)),
  ];

  // street extents (centreline from first to last crossing street) for nearestStreet
  const extents = streets.map((s) => {
    const crossing = (s.axis === 'ns' ? ews : nss).map((c) => c.offset);
    return { street: s, lo: Math.min(...crossing), hi: Math.max(...crossing) };
  });

  const nearestIn = <N extends GraphNode>(list: N[], p: Vec2): N => {
    let best = list[0];
    let bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const dx = n.pos.x - p.x;
      const dz = n.pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  };

  return {
    seed: input.seed,
    bounds,
    streets,
    intersections,
    segments,
    crosswalks,
    blocks,
    lanes,
    sidewalks,
    streetById(id: string): StreetDef {
      const s = streetMap.get(id);
      if (!s) throw new Error(`Unknown street id: ${id}`);
      return s;
    },
    blockById(id: string): Block {
      const b = blockMap.get(id);
      if (!b) throw new Error(`Unknown block id: ${id}`);
      return b;
    },
    nearestLaneNode(p: Vec2): LaneNode {
      return nearestIn(laneList, p);
    },
    nearestSidewalkNode(p: Vec2): GraphNode {
      return nearestIn(swList, p);
    },
    nearestStreet(p: Vec2): StreetDef {
      let best = extents[0].street;
      let bd = Infinity;
      for (const e of extents) {
        const along = e.street.axis === 'ns' ? p.z : p.x;
        const across = e.street.axis === 'ns' ? p.x : p.z;
        const clamped = Math.min(e.hi, Math.max(e.lo, along));
        const d = Math.hypot(across - e.street.offset, along - clamped) - e.street.roadWidth / 2;
        if (d < bd) { bd = d; best = e.street; }
      }
      return best;
    },
    isOnRoad(p: Vec2): boolean {
      for (let i = 0; i < roadRects.length; i++) {
        const r = roadRects[i];
        if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return true;
      }
      return false;
    },
  };
}
