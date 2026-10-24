/**
 * RoadBuilder: ground, roadway, sidewalks, curbs, gutters, street markings and surface detail,
 * merged per material. Geometry is flat on the ground plane (y up) apart from curbs and raised
 * ironwork. Returns the four map-edge walls as the only colliders.
 *
 * Decal stack (y): roadway 0 < surface details 0.012 < paint 0.016 < top layer 0.02.
 * Sidewalk fixtures sit at SIDEWALK_H + 0.012. Decal materials are cloned with polygonOffset so
 * the shared library materials are not mutated.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { norm, sub, perpRight, len, lerp2 } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type {
  Crosswalk, GridModel, IMaterialLibrary, MaterialKey, Segment, Side, StaticCollider,
} from '@/world/types';

const GROUND_MARGIN = 60;
const WALL_MARGIN = 30;
const SIDEWALK_H = 0.15;
const CURB_W = 0.2;
const CURB_H = 0.15;
const CURB_CHAMFER = 0.035;
/** a crosswalk end dips the curb to CURB_LOW, rising back to full height over CURB_RAMP_HALF metres (2 m span) */
const CURB_LOW = 0.02;
const CURB_RAMP_HALF = 1;

const Y_GROUND = -0.01;
const Y_DECAL = 0.012;
const Y_LINE = 0.016;
const Y_TOP = 0.02;
const Y_WALK = SIDEWALK_H + Y_DECAL;

const SEG_MARGIN = 6;

const DASH_LEN = 3;
const DASH_PERIOD = 9;
const DASH_W = 0.15;
const EDGE_W = 0.12;
const EDGE_INSET = 0.35;
const GUTTER_W = 0.28;
const DOUBLE_OFFSET = 0.075;
const DOUBLE_W = 0.08;
const DOUBLE_TRIM = 3.5;
const T_PITCH = 11;
const STRIPE_W = 0.5;
const STRIPE_PITCH = 1.0;
const STOP_W = 0.4;
const STOP_GAP = 0.5;
const MANHOLE_R = 0.45;
const MANHOLE_H = 0.02;
const GRATE_W = 0.9;
const GRATE_D = 0.5;
const TREE_START = 6;
const TREE_PITCH = 12;
const TREE_PIT = 1.2;
const PLATE_L = 1.5;
const PLATE_W = 1.0;
const SKID_OPACITY = 0.35;

type Batch = { material: THREE.Material; geoms: THREE.BufferGeometry[]; name: string };
type V3 = [number, number, number];

/** A straight stretch of block curb. 'x' runs along a fixed z line, 'z' along a fixed x line. */
interface CurbRun {
  axis: 'x' | 'z';
  line: number;
  from: number;
  to: number;
  /** +1 / -1: direction from the block edge out to the roadway */
  outward: 1 | -1;
}

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

function decalMaterial(m: THREE.Material): THREE.Material {
  const c = m.clone();
  c.polygonOffset = true;
  c.polygonOffsetFactor = -1;
  c.polygonOffsetUnits = -1;
  return c;
}

/** Height of the curb at station s given the crosswalk ends (cut centres) on this run. */
function curbHeight(s: number, cuts: number[]): number {
  let h = CURB_H;
  for (const e of cuts) {
    const k = Math.min(1, Math.abs(s - e) / CURB_RAMP_HALF);
    h = Math.min(h, CURB_LOW + (CURB_H - CURB_LOW) * k);
  }
  return h;
}

/** Along-run coordinates of crosswalk ends that sit on this curb line. */
function curbCuts(run: CurbRun, ends: Vec2[]): number[] {
  const out: number[] = [];
  for (const p of ends) {
    const across = run.axis === 'x' ? p.z : p.x;
    const along = run.axis === 'x' ? p.x : p.z;
    if (Math.abs(across - run.line) < 0.1 && along >= run.from && along <= run.to) out.push(along);
  }
  return out;
}

/**
 * Sweeps a 6-point curb profile (chamfered top, CURB_W wide on the roadway side of the block edge)
 * along a run, following the piecewise-linear height from curbHeight. Flat-shaded, non-indexed.
 */
function buildCurbRun(run: CurbRun, ends: Vec2[], out: THREE.BufferGeometry[]): void {
  const cuts = curbCuts(run, ends);
  const bps = new Set<number>([run.from, run.to]);
  for (const e of cuts) {
    for (const d of [-CURB_RAMP_HALF, 0, CURB_RAMP_HALF]) {
      const s = e + d;
      if (s > run.from && s < run.to) bps.add(s);
    }
  }
  const stations = Array.from(bps).sort((a, b) => a - b).map((s) => ({ s, h: curbHeight(s, cuts) }));
  if (stations.length < 2) return;

  const pos: number[] = [];
  const tri = (a: V3, b: V3, c: V3, hint: V3): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * hint[0] + ny * hint[1] + nz * hint[2] < 0;
    const [p, q] = flip ? [c, b] : [b, c];
    pos.push(a[0], a[1], a[2], p[0], p[1], p[2], q[0], q[1], q[2]);
  };
  const ring = (s: number, h: number): V3[] => {
    const c = Math.min(CURB_CHAMFER, h * 0.4);
    const prof: [number, number][] = [[0, 0], [CURB_W, 0], [CURB_W, h - c], [CURB_W - c, h], [c, h], [0, h - c]];
    return prof.map(([u, y]): V3 => (run.axis === 'x'
      ? [s, y, run.line + run.outward * u]
      : [run.line + run.outward * u, y, s]));
  };
  const centroid = (r: V3[]): V3 => {
    let x = 0, y = 0, z = 0;
    for (const p of r) { x += p[0]; y += p[1]; z += p[2]; }
    const n = r.length;
    return [x / n, y / n, z / n];
  };
  const sdir: V3 = run.axis === 'x' ? [1, 0, 0] : [0, 0, 1];

  let prev = ring(stations[0]!.s, stations[0]!.h);
  for (let i = 1; i < prev.length - 1; i++) tri(prev[0]!, prev[i]!, prev[i + 1]!, [-sdir[0], -sdir[1], -sdir[2]]);
  for (let k = 1; k < stations.length; k++) {
    const cur = ring(stations[k]!.s, stations[k]!.h);
    const c0 = centroid(prev), c1 = centroid(cur);
    const mid: V3 = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const A = prev[i]!, B = prev[j]!, C = cur[j]!, D = cur[i]!;
      const hint: V3 = [
        (A[0] + B[0] + C[0] + D[0]) / 4 - mid[0],
        (A[1] + B[1] + C[1] + D[1]) / 4 - mid[1],
        (A[2] + B[2] + C[2] + D[2]) / 4 - mid[2],
      ];
      tri(A, B, C, hint);
      tri(A, C, D, hint);
    }
    prev = cur;
  }
  for (let i = 1; i < prev.length - 1; i++) tri(prev[0]!, prev[i]!, prev[i + 1]!, sdir);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  out.push(g);
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
    out.push(flatQuad(cw.a.x + u.x * t, cw.a.z + u.z * t, roadDir, cw.width, STRIPE_W, Y_TOP));
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
    out.push(flatQuad(p.x, p.z, u, L - edge * 2, STOP_W, Y_LINE));
  } else {
    // right-hand traffic: the approaching lane lies on the right of the travel direction
    const right = perpRight(travel);
    const sgn = (right.x * u.x + right.z * u.z) >= 0 ? 1 : -1;
    const halfLen = L / 2 - edge;
    const w = halfLen - 0.1;
    if (w <= 0) return;
    out.push(flatQuad(p.x + u.x * sgn * (0.1 + w / 2), p.z + u.z * sgn * (0.1 + w / 2), u, w, STOP_W, Y_LINE));
  }
}

export function buildRoads(grid: GridModel, materials: IMaterialLibrary): { group: THREE.Group; colliders: StaticCollider[] } {
  const rng = new Rng(grid.seed ^ 0x5a5a);
  const batches = new Map<string, Batch>();
  const bucket = (id: string, name: string, make: () => THREE.Material): THREE.BufferGeometry[] => {
    let b = batches.get(id);
    if (!b) {
      b = { material: make(), geoms: [], name };
      batches.set(id, b);
    }
    return b.geoms;
  };
  const std = (key: MaterialKey, variant: number, name: string): THREE.BufferGeometry[] =>
    bucket(`${key}:${variant}`, name, () => materials.get(key, variant));
  const decal = (key: MaterialKey, variant: number, name: string): THREE.BufferGeometry[] =>
    bucket(`decal:${key}:${variant}`, name, () => decalMaterial(materials.get(key, variant)));

  // One translucent dark material per city, reused for skid marks and cracks.
  const skidMaterial = materials.get('tire', 0).clone();
  skidMaterial.transparent = true;
  skidMaterial.opacity = SKID_OPACITY;
  skidMaterial.depthWrite = false;
  skidMaterial.polygonOffset = true;
  skidMaterial.polygonOffsetFactor = -1;
  skidMaterial.polygonOffsetUnits = -1;

  const { bounds } = grid;

  // Ground
  {
    const w = bounds.maxX - bounds.minX + GROUND_MARGIN * 2;
    const d = bounds.maxZ - bounds.minZ + GROUND_MARGIN * 2;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    std('concrete', 1, 'ground').push(flatQuad(cx, cz, { x: 1, z: 0 }, w, d, Y_GROUND));
  }

  // Roadway: worn asphalt on streets, fresh asphalt in intersections
  for (const s of grid.segments) {
    const d = sub(s.b, s.a);
    const L = len(d);
    if (L < 1e-6) continue;
    std('asphalt', 1, 'roadway').push(
      flatQuad((s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, norm(d), L, s.width, 0),
    );
  }
  for (const i of grid.intersections) {
    std('asphalt', 0, 'intersections').push(
      flatQuad(i.center.x, i.center.z, { x: 1, z: 0 }, i.halfX * 2, i.halfZ * 2, 0),
    );
  }

  // Sidewalk slabs (top at SIDEWALK_H) and curbs along each block outline
  const ends: Vec2[] = [];
  for (const cw of grid.crosswalks) ends.push(cw.a, cw.b);
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
    std('concrete', 0, 'sidewalks').push(box(cx, SIDEWALK_H / 2, cz, w, SIDEWALK_H, d));

    // Curbs sit on the roadway side of each block edge; the north and south runs extend by one
    // curb width so the corner squares are closed.
    const curbs = std('curb', 0, 'curbs');
    const runs: CurbRun[] = [
      { axis: 'x', line: minZ, from: minX - CURB_W, to: maxX + CURB_W, outward: -1 },
      { axis: 'x', line: maxZ, from: minX - CURB_W, to: maxX + CURB_W, outward: 1 },
      { axis: 'z', line: minX, from: minZ, to: maxZ, outward: -1 },
      { axis: 'z', line: maxX, from: minZ, to: maxZ, outward: 1 },
    ];
    for (const run of runs) buildCurbRun(run, ends, curbs);

    // Sidewalk fixtures along each block face: tree pits every ~12 m, avenue cellar plates
    const treePits = decal('treeTrunk', 0, 'tree-pits');
    const plates = decal('metalDark', 0, 'metal-details');
    for (const f of bl.faces) {
      const faceLen = len(sub(f.b, f.a));
      if (faceLen < 1e-6) continue;
      const faceDir = norm(sub(f.b, f.a));
      const street = grid.streetById(f.streetId);
      for (let t = TREE_START; t <= faceLen - TREE_START; t += TREE_PITCH) {
        const u = t / faceLen;
        const bp = lerp2(f.a, f.b, u);
        const cp = lerp2(f.curbA, f.curbB, u);
        const c = lerp2(bp, cp, 0.55);
        treePits.push(flatQuad(c.x, c.z, faceDir, TREE_PIT, TREE_PIT, Y_WALK));
      }
      if (street.class !== 'avenue') continue;
      for (let t = 4; t <= faceLen - 4; t += 9) {
        if (!rng.chance(0.5)) continue;
        const u = t / faceLen;
        const bp = lerp2(f.a, f.b, u);
        const cp = lerp2(f.curbA, f.curbB, u);
        const toCurb = sub(cp, bp);
        const w2 = len(toCurb);
        if (w2 < 1e-6) continue;
        const c = { x: bp.x + (toCurb.x / w2) * 0.7, z: bp.z + (toCurb.z / w2) * 0.7 };
        plates.push(flatQuad(c.x, c.z, faceDir, PLATE_L, PLATE_W, Y_WALK));
      }
    }
  }

  // Lane markings, gutters and surface detail along segments
  for (const s of grid.segments) {
    const street = grid.streetById(s.streetId);
    const d = sub(s.b, s.a);
    const L = len(d);
    if (L < 1e-6) continue;
    const dir = norm(d);
    const right = perpRight(dir);
    const mid = { x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 };

    // gutter: darker worn asphalt strip along each curb
    const gutters = decal('asphaltWorn', 1, 'gutters');
    for (const sgn of [-1, 1]) {
      const off = s.width / 2 - GUTTER_W / 2;
      gutters.push(flatQuad(mid.x + right.x * off * sgn, mid.z + right.z * off * sgn, dir, L, GUTTER_W, Y_DECAL));
    }

    // solid white edge lines
    const edgeOff = s.width / 2 - EDGE_INSET;
    const white = std('laneLine', 0, 'markings-white');
    for (const sgn of [-1, 1]) {
      white.push(flatQuad(mid.x + right.x * edgeOff * sgn, mid.z + right.z * edgeOff * sgn, dir, L, EDGE_W, Y_LINE));
    }

    // centre line, two-way only: double solid yellow on avenues, worn dashes on streets
    if (street.oneWay === 0) {
      const yellow = std('laneLine', 1, 'markings-yellow');
      if (street.class === 'avenue') {
        const trimmed = L - 2 * DOUBLE_TRIM;
        if (trimmed > 0) {
          for (const sgn of [-1, 1]) {
            const off = DOUBLE_OFFSET * sgn;
            yellow.push(flatQuad(mid.x + right.x * off, mid.z + right.z * off, dir, trimmed, DOUBLE_W, Y_LINE));
          }
        }
      } else {
        const n = Math.max(1, Math.floor(L / DASH_PERIOD));
        const span = n * DASH_PERIOD;
        const start = (L - span) / 2 + (DASH_PERIOD - DASH_LEN) / 2 + DASH_LEN / 2;
        for (let k = 0; k < n; k++) {
          const dl = DASH_LEN * rng.range(0.85, 1.15);
          const skip = rng.chance(0.1);
          if (skip) continue;
          const t = start + k * DASH_PERIOD;
          yellow.push(flatQuad(s.a.x + dir.x * t, s.a.z + dir.z * t, dir, dl, DASH_W, Y_LINE));
        }
      }

      // parking-lane T marks every ~11 m, both sides
      const usable = L - 2 * SEG_MARGIN;
      if (usable > 0) {
        for (let t = SEG_MARGIN; t <= L - SEG_MARGIN; t += T_PITCH * rng.range(0.9, 1.1)) {
          const p = { x: s.a.x + dir.x * t, z: s.a.z + dir.z * t };
          for (const sgn of [-1, 1]) {
            const q = { x: p.x + right.x * sgn * (s.width / 2 - 0.45), z: p.z + right.z * sgn * (s.width / 2 - 0.45) };
            white.push(flatQuad(q.x, q.z, right, 0.9, 0.12, Y_LINE));
            white.push(flatQuad(q.x + dir.x * 0.45, q.z + dir.z * 0.45, dir, 0.9, 0.12, Y_LINE));
          }
        }
      }
    }

    const usable = L - 2 * SEG_MARGIN;
    if (usable <= 0) continue;
    const latMax = Math.max(0, s.width / 2 - 1.2);

    // road patches: darker repaired asphalt
    if (rng.chance(0.3)) {
      const t = rng.range(SEG_MARGIN, L - SEG_MARGIN);
      const lat = rng.range(-latMax, latMax);
      const c = { x: s.a.x + dir.x * t + right.x * lat, z: s.a.z + dir.z * t + right.z * lat };
      decal('asphalt', 0, 'road-patches').push(
        flatQuad(c.x, c.z, dir, rng.range(1.2, 2.4), rng.range(1.0, 2.0), Y_DECAL),
      );
    }

    // crack lines, slightly off the road direction
    if (rng.chance(0.5)) {
      const cracks = rng.int(1, 2);
      for (let k = 0; k < cracks; k++) {
        const t = rng.range(SEG_MARGIN, L - SEG_MARGIN);
        const lat = rng.range(-latMax, latMax);
        const c = { x: s.a.x + dir.x * t + right.x * lat, z: s.a.z + dir.z * t + right.z * lat };
        const th = rng.range(-0.6, 0.6);
        const cd = { x: dir.x * Math.cos(th) - dir.z * Math.sin(th), z: dir.x * Math.sin(th) + dir.z * Math.cos(th) };
        bucket('skid-cracks', 'skid-marks', () => skidMaterial).push(
          flatQuad(c.x, c.z, cd, rng.range(0.8, 2.0), 0.05, Y_DECAL),
        );
      }
    }

    // manhole covers along the centre lane
    const metal = decal('metalDark', 0, 'metal-details');
    const holes = rng.int(2, 3);
    for (let k = 0; k < holes; k++) {
      const t = rng.range(SEG_MARGIN, L - SEG_MARGIN);
      const g = new THREE.CylinderGeometry(MANHOLE_R, MANHOLE_R, MANHOLE_H, 16);
      g.translate(s.a.x + dir.x * t, MANHOLE_H / 2, s.a.z + dir.z * t);
      metal.push(g);
    }
  }

  // Intersection details: storm drains at each corner, skid marks on the approaches
  const metalIx = decal('metalDark', 0, 'metal-details');
  const skids = bucket('skid-cracks', 'skid-marks', () => skidMaterial);
  const approaches: Vec2[] = [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];
  for (const i of grid.intersections) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      metalIx.push(box(
        i.center.x + sx * (i.halfX + 3.6), MANHOLE_H / 2, i.center.z + sz * (i.halfZ - GRATE_D / 2),
        GRATE_W, MANHOLE_H, GRATE_D,
      ));
    }
    for (const ap of approaches) {
      if (!rng.chance(0.35)) continue;
      const alongZ = ap.z !== 0;
      const reach = (alongZ ? i.halfZ : i.halfX) + SEG_MARGIN + rng.range(0, 6);
      const lat = alongZ ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const laneOff = (alongZ ? i.halfX : i.halfZ) / 2 * (rng.chance(0.5) ? 1 : -1);
      const bx = i.center.x + ap.x * reach + lat.x * laneOff;
      const bz = i.center.z + ap.z * reach + lat.z * laneOff;
      for (const tyre of [-0.8, 0.8]) {
        skids.push(flatQuad(
          bx + lat.x * tyre, bz + lat.z * tyre, ap, rng.range(3, 6), 0.22, Y_DECAL,
        ));
      }
    }
  }

  // Crosswalks (zebra) and stop lines
  for (const cw of grid.crosswalks) {
    addZebra(cw, std('crosswalk', 0, 'crosswalks'));
    addStopLine(cw, grid, std('laneLine', 0, 'markings-white'));
  }

  // Merge per material
  const group = new THREE.Group();
  group.name = 'roads';
  for (const [, b] of batches) {
    if (b.geoms.length === 0) continue;
    if (b.name.startsWith('markings') || b.name === 'crosswalks') {
      b.material.polygonOffset = true;
      b.material.polygonOffsetFactor = -1;
      b.material.polygonOffsetUnits = -1;
    }
    const prepared = b.geoms.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(prepared, false);
    for (const g of prepared) g.dispose();
    for (const g of b.geoms) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = b.name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
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
