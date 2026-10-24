/**
 * RoadBuilder: ground, roadway, sidewalks, curbs and street markings, merged per material.
 * Geometry is flat on the ground plane (y up). Returns the four map-edge walls as the only colliders.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { norm, sub, perpRight, len } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type {
  Crosswalk, GridModel, IMaterialLibrary, MaterialKey, Segment, Side, StaticCollider,
} from '@/world/types';

const GROUND_MARGIN = 60;
const WALL_MARGIN = 30;
const SIDEWALK_H = 0.15;
const CURB_W = 0.2;
const CURB_H = 0.16;
const Y_GROUND = -0.01;
const Y_LINE = 0.012;
const Y_STOP = 0.013;
const Y_ZEBRA = 0.014;

const DASH_LEN = 3;
const DASH_PERIOD = 9;
const DASH_W = 0.15;
const EDGE_W = 0.12;
const EDGE_INSET = 0.35;
const STRIPE_W = 0.5;
const STRIPE_PITCH = 1.0;
const STOP_W = 0.4;
const STOP_GAP = 0.5;

type Batch = { material: THREE.Material; geoms: THREE.BufferGeometry[]; name: string };

/** Flat quad: `lenAlong` along `dir`, `lenAcross` perpendicular, centred at (cx, y, cz). */
function flatQuad(cx: number, cz: number, dir: Vec2, lenAlong: number, lenAcross: number, y: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(lenAlong, lenAcross);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.atan2(-dir.z, dir.x));
  g.translate(cx, y, cz);
  return g;
}

function box(cx: number, cy: number, cz: number, w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  return g;
}

function approachDir(side: Side): Vec2 {
  // unit vector pointing from the intersection outward toward `side`
  switch (side) {
    case 'N': return { x: 0, z: -1 };
    case 'S': return { x: 0, z: 1 };
    case 'E': return { x: 1, z: 0 };
    default: return { x: -1, z: 0 };
  }
}

export function buildRoads(grid: GridModel, materials: IMaterialLibrary): { group: THREE.Group; colliders: StaticCollider[] } {
  const batches = new Map<string, Batch>();
  const batch = (key: MaterialKey, variant: number, name: string): THREE.BufferGeometry[] => {
    const id = `${key}:${variant}`;
    let b = batches.get(id);
    if (!b) {
      b = { material: materials.get(key, variant), geoms: [], name };
      batches.set(id, b);
    }
    return b.geoms;
  };

  const { bounds } = grid;

  // Ground
  {
    const w = bounds.maxX - bounds.minX + GROUND_MARGIN * 2;
    const d = bounds.maxZ - bounds.minZ + GROUND_MARGIN * 2;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    batch('concrete', 1, 'ground').push(flatQuad(cx, cz, { x: 1, z: 0 }, w, d, Y_GROUND));
  }

  // Roadway: worn asphalt on streets, fresh asphalt in intersections
  for (const s of grid.segments) {
    const d = sub(s.b, s.a);
    const L = len(d);
    if (L < 1e-6) continue;
    batch('asphalt', 1, 'roadway').push(
      flatQuad((s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, norm(d), L, s.width, 0),
    );
  }
  for (const i of grid.intersections) {
    batch('asphalt', 0, 'intersections').push(
      flatQuad(i.center.x, i.center.z, { x: 1, z: 0 }, i.halfX * 2, i.halfZ * 2, 0),
    );
  }

  // Sidewalks (one slab per block, top at 0.15) and curb lips along the block outline
  for (const bl of grid.blocks) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of bl.curb) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    batch('concrete', 0, 'sidewalks').push(box(cx, SIDEWALK_H / 2, cz, w, SIDEWALK_H, d));
    const curbs = batch('curb', 0, 'curbs');
    curbs.push(box(cx, CURB_H / 2, minZ, w + CURB_W, CURB_H, CURB_W));
    curbs.push(box(cx, CURB_H / 2, maxZ, w + CURB_W, CURB_H, CURB_W));
    curbs.push(box(minX, CURB_H / 2, cz, CURB_W, CURB_H, d - CURB_W));
    curbs.push(box(maxX, CURB_H / 2, cz, CURB_W, CURB_H, d - CURB_W));
  }

  // Lane markings along segments
  for (const s of grid.segments) {
    const street = grid.streetById(s.streetId);
    const d = sub(s.b, s.a);
    const L = len(d);
    if (L < 1e-6) continue;
    const dir = norm(d);
    const right = perpRight(dir);

    // solid white edge lines
    const edgeOff = s.width / 2 - EDGE_INSET;
    const mid = { x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 };
    const white = batch('laneLine', 0, 'markings-white');
    for (const sgn of [-1, 1]) {
      white.push(flatQuad(mid.x + right.x * edgeOff * sgn, mid.z + right.z * edgeOff * sgn, dir, L, EDGE_W, Y_LINE));
    }

    // dashed yellow centre line, two-way only
    if (street.oneWay === 0) {
      const n = Math.max(1, Math.floor(L / DASH_PERIOD));
      const span = n * DASH_PERIOD;
      const start = (L - span) / 2 + (DASH_PERIOD - DASH_LEN) / 2 + DASH_LEN / 2;
      const yellow = batch('laneLine', 1, 'markings-yellow');
      for (let k = 0; k < n; k++) {
        const t = start + k * DASH_PERIOD;
        yellow.push(flatQuad(s.a.x + dir.x * t, s.a.z + dir.z * t, dir, DASH_LEN, DASH_W, Y_LINE));
      }
    }
  }

  // Crosswalks (zebra) and stop lines
  for (const cw of grid.crosswalks) {
    addZebra(cw, batch('crosswalk', 0, 'crosswalks'));
    addStopLine(cw, grid, batch('laneLine', 0, 'markings-white'));
  }

  // Merge per material
  const group = new THREE.Group();
  group.name = 'roads';
  for (const [, b] of batches) {
    if (b.geoms.length === 0) continue;
    if ((b.name.startsWith('markings') || b.name === 'crosswalks')) {
      b.material.polygonOffset = true;
      b.material.polygonOffsetFactor = -1;
      b.material.polygonOffsetUnits = -1;
    }
    const merged = mergeGeometries(b.geoms, false);
    for (const g of b.geoms) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = b.name;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }

  // Map-edge walls
  const x0 = bounds.minX - WALL_MARGIN, x1 = bounds.maxX + WALL_MARGIN;
  const z0 = bounds.minZ - WALL_MARGIN, z1 = bounds.maxZ + WALL_MARGIN;
  const wall = (id: string, a: Vec2, b: Vec2): StaticCollider => {
    const shape: Segment = { kind: 'segment', a, b };
    return { shape, pos: { x: 0, z: 0 }, id };
  };
  const colliders: StaticCollider[] = [
    wall('edge-n', { x: x0, z: z0 }, { x: x1, z: z0 }),
    wall('edge-e', { x: x1, z: z0 }, { x: x1, z: z1 }),
    wall('edge-s', { x: x1, z: z1 }, { x: x0, z: z1 }),
    wall('edge-w', { x: x0, z: z1 }, { x: x0, z: z0 }),
  ];

  return { group, colliders };
}

function addZebra(cw: Crosswalk, out: THREE.BufferGeometry[]): void {
  const span = sub(cw.b, cw.a);
  const L = len(span);
  if (L < 1e-6) return;
  const u = norm(span);
  // stripes run along the road direction (perpendicular to the crossing direction)
  const roadDir = perpRight(u);
  const n = Math.max(1, Math.floor((L - STRIPE_W) / STRIPE_PITCH) + 1);
  const used = (n - 1) * STRIPE_PITCH + STRIPE_W;
  const first = (L - used) / 2 + STRIPE_W / 2;
  for (let k = 0; k < n; k++) {
    const t = first + k * STRIPE_PITCH;
    out.push(flatQuad(cw.a.x + u.x * t, cw.a.z + u.z * t, roadDir, cw.width, STRIPE_W, Y_ZEBRA));
  }
}

function addStopLine(cw: Crosswalk, grid: GridModel, out: THREE.BufferGeometry[]): void {
  const inter = grid.intersections.find((i) => i.id === cw.intersectionId);
  if (!inter) return;
  const out2 = approachDir(cw.side);
  const streetId = cw.side === 'N' || cw.side === 'S' ? inter.nsStreetId : inter.ewStreetId;
  const street = grid.streetById(streetId);
  // travel direction of vehicles arriving from this side points toward the intersection
  const travel = { x: -out2.x, z: -out2.z };
  // oneWay: +1 = +axis (east for ew, south for ns), -1 = opposite
  if (street.oneWay !== 0) {
    const axisDir = street.axis === 'ns' ? { x: 0, z: 1 } : { x: 1, z: 0 };
    const allowed = travel.x * axisDir.x + travel.z * axisDir.z > 0 ? 1 : -1;
    if (allowed !== street.oneWay) return;
  }
  const span = sub(cw.b, cw.a);
  const L = len(span);
  if (L < 1e-6) return;
  const u = norm(span);
  const c = { x: (cw.a.x + cw.b.x) / 2, z: (cw.a.z + cw.b.z) / 2 };
  const off = cw.width / 2 + STOP_GAP + STOP_W / 2;
  const p = { x: c.x + out2.x * off, z: c.z + out2.z * off };
  const edge = EDGE_INSET + EDGE_W;
  if (street.oneWay !== 0) {
    out.push(flatQuad(p.x, p.z, u, L - edge * 2, STOP_W, Y_STOP));
  } else {
    // right-hand traffic: the approaching lane lies on the right of the travel direction
    const right = perpRight(travel);
    const sgn = (right.x * u.x + right.z * u.z) >= 0 ? 1 : -1;
    const halfLen = L / 2 - edge;
    const w = halfLen - 0.1;
    if (w <= 0) return;
    out.push(flatQuad(p.x + u.x * sgn * (0.1 + w / 2), p.z + u.z * sgn * (0.1 + w / 2), u, w, STOP_W, Y_STOP));
  }
}
