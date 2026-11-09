/**
 * GTA3-era procedural people: chunky low-poly bodies (about 700 to 900 triangles each) with PS2 proportions (big head, big hands,
 * blocky shoes, simple hair and hat shells), flat-shaded, textured from one hand-painted 256 px atlas per variant
 * (textures/painters/ped.ts). These are the DEFAULT pedestrians, player and interior people; the Quaternius glTF people are opt-in
 * with VITE_GLTF_PEDS=1 (see gltf/CharacterSource.ts).
 *
 * The rig is the same as humanModel.ts, so `animateWalk` and the idle poses work unchanged:
 *   group > rig > hips, torso (> arm pivots > elbow pivots), head, leg pivots (> knee pivots)
 * Every pivot carries ONE merged mesh that shares the variant's single material: about 11 draw calls per person (the old smooth
 * model needed 18 to 22), and the geometry of a variant is built once and shared by every person wearing it.
 *
 * Local forward = -z, +x is the person's right, 1.75 m for an average adult.
 */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { createCanvas } from '@/textures/canvas';
import type { HumanModel } from './humanModel';
import {
  CIVILIAN_COUNT, PED_ATLAS, PED_SPECS, PED_VARIANT_COUNT, pedAtlasPainter, pedChurchBoost, pedTileRect, pedVariantIndex,
  type PedSpec, type PedTile, type PxRect,
} from '@/textures/painters/ped';

export { CIVILIAN_COUNT, PED_SPECS, PED_VARIANT_COUNT, pedVariantIndex };
export type { PedSpec };

export interface PedModel extends HumanModel {
  spec: PedSpec;
  variant: number;
  /** triangles of the whole figure (all meshes) */
  triangles: number;
}

export interface PedOptions {
  /** variant index or id ('odette', 'dj', 'cop', 'player', ...); default: a weighted civilian pick */
  variant?: number | string;
  /** uniform scale of the figure (default: the build's height times 0.97..1.03) */
  heightScale?: number;
}

// ---------------------------------------------------------------- proportions (metres)

const HIP_Y = 0.9;
const THIGH = 0.44;
const KNEE_Y = HIP_Y - THIGH;
const TORSO_Y = HIP_Y + 0.02;
const SHOULDER_Y = 0.47;
const UPPER_ARM = 0.3;
const FOREARM = 0.25;
const HEAD_Y = 1.62;
const LEG_X = 0.1;

// ---------------------------------------------------------------- geometry accumulator

interface Ring { y: number; a: number; b: number; xc?: number; zc?: number }
interface Faces { front: PxRect; back: PxRect; side: PxRect }
interface Acc { pos: number[]; nor: number[]; uv: number[] }

const newAcc = (): Acc => ({ pos: [], nor: [], uv: [] });
const INSET = 0.75;

function uvOf(r: PxRect, fu: number, ft: number): [number, number] {
  const u = Math.min(1, Math.max(0, fu));
  const t = Math.min(1, Math.max(0, ft));
  const px = r.x + INSET + u * (r.w - 2 * INSET);
  const py = r.y + INSET + (1 - t) * (r.h - 2 * INSET);
  return [px / PED_ATLAS, 1 - py / PED_ATLAS];
}

const tile = (t: PedTile): Faces => { const r = pedTileRect(t); return { front: r, back: r, side: r }; };
const quad = (t: PedTile, q: 0 | 1 | 2 | 3): PxRect => pedTileRect(t, q);

function corners(r: Ring, cham: number): Array<[number, number]> {
  const xc = r.xc ?? 0, zc = r.zc ?? 0;
  const c = Math.min(cham, Math.min(r.a, r.b) * 0.9);
  if (c <= 1e-4) return [[xc - r.a, zc - r.b], [xc + r.a, zc - r.b], [xc + r.a, zc + r.b], [xc - r.a, zc + r.b]];
  return [
    [xc - (r.a - c), zc - r.b], [xc + (r.a - c), zc - r.b], [xc + r.a, zc - (r.b - c)], [xc + r.a, zc + (r.b - c)],
    [xc + (r.a - c), zc + r.b], [xc - (r.a - c), zc + r.b], [xc - r.a, zc + (r.b - c)], [xc - r.a, zc - (r.b - c)],
  ];
}

/** Which face of the atlas an edge samples: 0 front, 1 back, 2 right (+x), 3 left (-x). Chamfers continue the front/back tile. */
function edgeKind(n: number, e: number): 0 | 1 | 2 | 3 {
  if (n === 4) return ([0, 2, 1, 3] as const)[e];
  return ([0, 0, 2, 1, 1, 1, 3, 0] as const)[e];
}

/**
 * A stack of rings (each an octagon, or a rectangle when `cham` is 0) joined by flat-shaded quads. Planar atlas mapping per
 * face: front (seen from -z, +x on the viewer's left) and back (seen from +z) sample by x, the sides by z, v by height. `cap` UV rectangles give the end caps a flat colour.
 */
function prism(acc: Acc, rings: Ring[], cham: number, faces: Faces, topCap?: PxRect | null, botCap?: PxRect | null, offset: [number, number, number] = [0, 0, 0]): void {
  rings = [...rings].sort((p, q) => p.y - q.y);
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  const ymin = Math.min(...rings.map((r) => r.y)), ymax = Math.max(...rings.map((r) => r.y));
  const rc = rings.map((r) => corners(r, cham));
  for (const cs of rc) for (const [x, z] of cs) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  const sx = Math.max(1e-6, xmax - xmin), sz = Math.max(1e-6, zmax - zmin), sy = Math.max(1e-6, ymax - ymin);
  const [ox, oy, oz] = offset;

  const pushTri = (p: ReadonlyArray<[number, number, number]>, uvs: ReadonlyArray<[number, number]>, outward: [number, number, number]): void => {
    let [a, b, c] = [p[0], p[1], p[2]];
    let [ua, ub, uc] = [uvs[0], uvs[1], uvs[2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; n = [-n[0], -n[1], -n[2]]; }
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-12) return; // degenerate (a ring that collapses to a point)
    n = [n[0] / len, n[1] / len, n[2] / len];
    for (const [v, uv] of [[a, ua], [b, ub], [c, uc]] as const) {
      acc.pos.push(v[0] + ox, v[1] + oy, v[2] + oz);
      acc.nor.push(n[0], n[1], n[2]);
      acc.uv.push(uv[0], uv[1]);
    }
  };

  for (let i = 0; i + 1 < rings.length; i++) {
    const lo = rc[i], hi = rc[i + 1];
    const n = lo.length;
    for (let e = 0; e < n; e++) {
      const e1 = (e + 1) % n;
      const kind = edgeKind(n, e);
      const rect = kind === 0 ? faces.front : kind === 1 ? faces.back : faces.side;
      const vert = (c: [number, number], y: number): { p: [number, number, number]; uv: [number, number] } => {
        const t = (y - ymin) / sy;
        const fu = kind === 0 ? (xmax - c[0]) / sx : kind === 1 ? (c[0] - xmin) / sx : kind === 2 ? (zmax - c[1]) / sz : (c[1] - zmin) / sz;
        return { p: [c[0], y, c[1]], uv: uvOf(rect, fu, t) };
      };
      const p0 = vert(lo[e], rings[i].y), p1 = vert(lo[e1], rings[i].y), p2 = vert(hi[e1], rings[i + 1].y), p3 = vert(hi[e], rings[i + 1].y);
      const mx = (lo[e][0] + lo[e1][0]) / 2 - (rings[i].xc ?? 0), mz = (lo[e][1] + lo[e1][1]) / 2 - (rings[i].zc ?? 0);
      const out: [number, number, number] = [mx, 0, mz];
      pushTri([p0.p, p1.p, p2.p], [p0.uv, p1.uv, p2.uv], out);
      pushTri([p0.p, p2.p, p3.p], [p0.uv, p2.uv, p3.uv], out);
    }
  }
  const cap = (ri: number, up: boolean, rect: PxRect): void => {
    const cs = rc[ri], y = rings[ri].y;
    const cx = cs.reduce((s, c) => s + c[0], 0) / cs.length, cz = cs.reduce((s, c) => s + c[1], 0) / cs.length;
    const uv = uvOf(rect, 0.5, 0.5);
    for (let e = 0; e < cs.length - 2; e++) pushTri([[cs[0][0], y, cs[0][1]], [cs[e + 1][0], y, cs[e + 1][1]], [cs[e + 2][0], y, cs[e + 2][1]]], [uv, uv, uv], [0, up ? 1 : -1, 0]);
    void cx; void cz;
  };
  if (topCap) cap(rings.length - 1, true, topCap);
  if (botCap) cap(0, false, botCap);
}

function toGeometry(acc: Acc): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- per-variant geometry

interface BuildScale { w: number; d: number }
const BUILD: Record<PedSpec['build'], { sx: BuildScale; height: number; head: number }> = {
  avg: { sx: { w: 1, d: 1 }, height: 1, head: 1 },
  slim: { sx: { w: 0.93, d: 0.93 }, height: 0.99, head: 1 },
  stocky: { sx: { w: 1.12, d: 1.1 }, height: 0.98, head: 1 },
  tall: { sx: { w: 1, d: 1 }, height: 1.02, head: 1 },
  kid: { sx: { w: 0.92, d: 0.92 }, height: 0.72, head: 1.3 },
};

const BULK: Partial<Record<PedSpec['top']['kind'], number>> = { puffer: 1.14, hoodie: 1.07, jacket: 1.04, cardigan: 1.05, tracksuit: 1.03, apron: 1.04 };

export interface VariantGeo {
  hips: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  upperArm: [THREE.BufferGeometry, THREE.BufferGeometry];
  foreHand: [THREE.BufferGeometry, THREE.BufferGeometry];
  thigh: THREE.BufferGeometry;
  shinShoe: THREE.BufferGeometry;
  shoulderX: number;
  triangles: number;
}

const geoCache = new Map<number, VariantGeo>();

const scaleRings = (rs: Ring[], w: number, d: number): Ring[] => rs.map((r) => ({ ...r, a: r.a * w, b: r.b * d, xc: r.xc !== undefined ? r.xc * w : r.xc, zc: r.zc !== undefined ? r.zc * d : r.zc }));

function hairGeo(acc: Acc, s: PedSpec): void {
  const f = (q: 0 | 1 | 2 | 3 = 0): Faces => { const r = quad('gear', q); return { front: r, back: r, side: r }; };
  const hair = f(0);
  const capped = s.hat !== 'none';
  const shell = (): void => prism(acc, [
    { y: 0.055, a: 0.104, b: 0.11 }, { y: 0.095, a: 0.106, b: 0.113 }, { y: 0.128, a: 0.094, b: 0.099 }, { y: 0.152, a: 0.06, b: 0.062 },
  ], 0.03, hair, quad('gear', 0));
  switch (s.hair) {
    case 'bald': break;
    case 'short': case 'fade': if (!capped) shell(); break;
    case 'afro':
      prism(acc, [{ y: 0.06, a: 0.13, b: 0.13 }, { y: 0.1, a: 0.152, b: 0.152 }, { y: 0.16, a: 0.16, b: 0.16 }, { y: 0.22, a: 0.125, b: 0.125 }, { y: 0.25, a: 0.06, b: 0.06 }], 0.05, hair, quad('gear', 0));
      break;
    case 'puff':
      if (!capped) shell();
      prism(acc, [{ y: 0.1, a: 0.09, b: 0.085, zc: 0.03 }, { y: 0.17, a: 0.105, b: 0.1, zc: 0.03 }, { y: 0.23, a: 0.07, b: 0.065, zc: 0.03 }], 0.03, hair, quad('gear', 0));
      break;
    case 'bun':
      if (!capped) shell();
      prism(acc, [{ y: 0.12, a: 0.05, b: 0.05, zc: 0.075 }, { y: 0.19, a: 0.055, b: 0.055, zc: 0.075 }], 0.02, hair, quad('gear', 0), quad('gear', 0));
      break;
    case 'long':
      if (!capped) shell();
      prism(acc, [{ y: -0.2, a: 0.1, b: 0.03, zc: 0.1 }, { y: 0.06, a: 0.11, b: 0.03, zc: 0.1 }], 0.02, hair, quad('gear', 0));
      for (const sx of [-1, 1]) prism(acc, [{ y: -0.1, a: 0.018, b: 0.05, xc: sx * 0.104, zc: 0.02 }, { y: 0.06, a: 0.018, b: 0.05, xc: sx * 0.104, zc: 0.02 }], 0, hair, quad('gear', 0));
      break;
    case 'braids': case 'locs': {
      if (!capped) shell();
      const n = s.hair === 'braids' ? 5 : 6, len = s.hair === 'braids' ? 0.24 : 0.3;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const ang = -Math.PI * 0.62 + t * Math.PI * 1.24; // spread around the back and sides
        const x = Math.sin(ang) * 0.1, z = Math.cos(ang) * 0.1 + 0.01;
        prism(acc, [{ y: 0.07 - len, a: 0.017, b: 0.017, xc: x, zc: z }, { y: 0.07, a: 0.019, b: 0.019, xc: x, zc: z }], 0, hair, quad('gear', 0));
      }
      break;
    }
  }
}

function hatGeo(acc: Acc, s: PedSpec): void {
  const main = quad('gear', 3), front = quad('gear', 1);
  const dome = { front, back: main, side: main };
  const flat = { front: main, back: main, side: main };
  switch (s.hat) {
    case 'none': break;
    case 'cap':
      prism(acc, [{ y: 0.04, a: 0.108, b: 0.113 }, { y: 0.09, a: 0.111, b: 0.116 }, { y: 0.14, a: 0.096, b: 0.099 }, { y: 0.17, a: 0.05, b: 0.052 }], 0.03, dome, main);
      prism(acc, [{ y: 0.04, a: 0.085, b: 0.06, zc: -0.165 }, { y: 0.052, a: 0.085, b: 0.06, zc: -0.165 }], 0.02, flat, main);
      break;
    case 'beanie':
      prism(acc, [{ y: 0.04, a: 0.115, b: 0.12 }, { y: 0.075, a: 0.116, b: 0.121 }, { y: 0.1, a: 0.112, b: 0.117 }, { y: 0.15, a: 0.092, b: 0.095 }, { y: 0.185, a: 0.045, b: 0.047 }], 0.03, flat, main);
      break;
    case 'headwrap':
      prism(acc, [{ y: 0.04, a: 0.112, b: 0.116 }, { y: 0.1, a: 0.116, b: 0.12 }, { y: 0.17, a: 0.1, b: 0.104 }, { y: 0.21, a: 0.06, b: 0.06 }], 0.035, flat, main);
      prism(acc, [{ y: 0.17, a: 0.06, b: 0.04, zc: -0.05 }, { y: 0.26, a: 0.05, b: 0.035, zc: -0.05 }], 0.015, flat, main);
      break;
    case 'church':
      prism(acc, [{ y: 0.065, a: 0.1, b: 0.105 }, { y: 0.12, a: 0.102, b: 0.107 }, { y: 0.17, a: 0.092, b: 0.096 }, { y: 0.195, a: 0.07, b: 0.07 }], 0.03, flat, main);
      prism(acc, [{ y: 0.062, a: 0.25, b: 0.25 }, { y: 0.075, a: 0.25, b: 0.25 }], 0.09, flat, main, main);
      break;
    case 'flat':
      prism(acc, [{ y: 0.05, a: 0.108, b: 0.113 }, { y: 0.1, a: 0.117, b: 0.123, zc: -0.005 }, { y: 0.135, a: 0.112, b: 0.12, zc: -0.012 }], 0.03, flat, main);
      prism(acc, [{ y: 0.05, a: 0.08, b: 0.035, zc: -0.14 }, { y: 0.06, a: 0.08, b: 0.035, zc: -0.14 }], 0.01, flat, main);
      break;
    case 'cop':
      prism(acc, [{ y: 0.04, a: 0.108, b: 0.113 }, { y: 0.13, a: 0.1, b: 0.104 }, { y: 0.165, a: 0.115, b: 0.12 }, { y: 0.2, a: 0.108, b: 0.113 }], 0.03, dome, main);
      prism(acc, [{ y: 0.04, a: 0.085, b: 0.045, zc: -0.15 }, { y: 0.05, a: 0.085, b: 0.045, zc: -0.15 }], 0.015, flat, quad('gear', 1));
      break;
    case 'durag':
      prism(acc, [{ y: 0.04, a: 0.106, b: 0.11 }, { y: 0.1, a: 0.109, b: 0.113 }, { y: 0.15, a: 0.088, b: 0.092 }, { y: 0.172, a: 0.045, b: 0.045 }], 0.03, flat, main);
      for (const sx of [-1, 1]) prism(acc, [{ y: -0.13, a: 0.016, b: 0.008, xc: sx * 0.02, zc: 0.128 }, { y: 0.07, a: 0.016, b: 0.008, xc: sx * 0.02, zc: 0.118 }], 0, flat, main);
      break;
    case 'hardhat':
      prism(acc, [{ y: 0.05, a: 0.116, b: 0.12 }, { y: 0.12, a: 0.116, b: 0.121 }, { y: 0.18, a: 0.092, b: 0.096 }, { y: 0.205, a: 0.05, b: 0.052 }], 0.035, flat, main);
      prism(acc, [{ y: 0.05, a: 0.125, b: 0.15, zc: -0.03 }, { y: 0.06, a: 0.125, b: 0.15, zc: -0.03 }], 0.04, flat, main);
      prism(acc, [{ y: 0.19, a: 0.014, b: 0.1 }, { y: 0.222, a: 0.014, b: 0.1 }], 0, flat, main, main);
      break;
  }
}

function buildVariantGeo(variant: number): VariantGeo {
  const s = PED_SPECS[variant];
  const B = BUILD[s.build];
  const bulk = BULK[s.top.kind] ?? 1;
  const w = B.sx.w, d = B.sx.d;
  const skin = quad('headCaps', 1);

  // ---- hips (+ skirt)
  const hipsA = newAcc();
  prism(hipsA, scaleRings([{ y: -0.13, a: 0.17, b: 0.105 }, { y: -0.02, a: 0.187, b: 0.116 }, { y: 0.085, a: 0.178, b: 0.11 }], w, d), 0.04, tile('hips'), quad('torsoCaps', 1), quad('torsoCaps', 1));
  if (s.bottom.kind === 'skirt') {
    const hem = s.top.kind === 'dress' ? -0.52 : -0.4;
    prism(hipsA, scaleRings([{ y: hem, a: 0.27, b: 0.2 }, { y: hem * 0.45, a: 0.225, b: 0.16 }, { y: 0.06, a: 0.185, b: 0.118 }], w, d), 0.07, tile('hips'));
  }

  // ---- torso (+ pack)
  const torsoA = newAcc();
  const T = (r: Ring[]): Ring[] => scaleRings(r, w * bulk, d * bulk);
  prism(torsoA, T([
    { y: -0.07, a: 0.19, b: 0.115 }, { y: 0.12, a: 0.2, b: 0.12 }, { y: 0.34, a: 0.235, b: 0.13 }, { y: 0.455, a: 0.255, b: 0.118 }, { y: 0.515, a: 0.15, b: 0.085 },
  ]), 0.045, { front: pedTileRect('torsoFront'), back: pedTileRect('torsoBack'), side: pedTileRect('torsoSide') }, quad('torsoCaps', 2), null);
  if (s.gear === 'backpack') {
    const gc = quad('gear', 2);
    const g = { front: gc, back: gc, side: gc };
    const k = s.build === 'kid' ? 1.15 : 1;
    prism(torsoA, [{ y: 0.04, a: 0.15 * k, b: 0.085 * k, zc: 0.205 }, { y: 0.46, a: 0.15 * k, b: 0.085 * k, zc: 0.205 }], 0.035, g, gc, gc);
    prism(torsoA, [{ y: 0.04, a: 0.1, b: 0.04, zc: 0.31 }, { y: 0.22, a: 0.1, b: 0.04, zc: 0.31 }], 0, g, gc, gc);
  }

  // ---- head
  const headA = newAcc();
  const headTop = s.hair === 'bald' ? quad('headCaps', 0) : quad('gear', 0);
  prism(headA, [
    { y: -0.12, a: 0.056, b: 0.07, zc: -0.01 }, { y: -0.075, a: 0.088, b: 0.098 }, { y: 0.0, a: 0.1, b: 0.104 }, { y: 0.05, a: 0.1, b: 0.105 }, { y: 0.12, a: 0.088, b: 0.09 },
  ], 0.03, { front: pedTileRect('headFront'), back: pedTileRect('headBack'), side: pedTileRect('headSide') }, headTop, quad('headCaps', 1));
  prism(headA, [{ y: -0.2, a: 0.046, b: 0.046 }, { y: -0.09, a: 0.046, b: 0.046 }], 0, { front: skin, back: skin, side: skin }, null, null);
  prism(headA, [{ y: -0.035, a: 0.018, b: 0.022, zc: -0.118 }, { y: 0.0, a: 0.016, b: 0.014, zc: -0.128 }], 0, { front: skin, back: skin, side: skin }, skin);
  for (const sx of [-1, 1]) prism(headA, [{ y: -0.03, a: 0.012, b: 0.025, xc: sx * 0.105 }, { y: 0.04, a: 0.012, b: 0.025, xc: sx * 0.105 }], 0, { front: skin, back: skin, side: skin }, skin);
  hairGeo(headA, s);
  hatGeo(headA, s);

  // ---- arms
  const longSleeve = s.top.sleeves === 'long';
  void longSleeve;
  const upperArm: THREE.BufferGeometry[] = [];
  const foreHand: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const ua = newAcc();
    prism(ua, [{ y: 0.04, a: 0.07 * bulk, b: 0.065 * bulk }, { y: -0.12, a: 0.067 * bulk, b: 0.062 * bulk }, { y: -0.3, a: 0.06 * bulk, b: 0.056 * bulk }], 0.02, tile('upperArm'), quad('upperArm', 0), null);
    upperArm.push(toGeometry(ua));
    const fh = newAcc();
    prism(fh, [{ y: 0.02, a: 0.058 * bulk, b: 0.054 * bulk }, { y: -0.12, a: 0.055 * bulk, b: 0.052 * bulk }, { y: -0.25, a: 0.05 * bulk, b: 0.047 * bulk }], 0.02, tile('foreArm'));
    prism(fh, [{ y: -0.245, a: 0.05, b: 0.052 }, { y: -0.3, a: 0.064, b: 0.046 }, { y: -0.415, a: 0.06, b: 0.04 }], 0.018, tile('hand'), null, quad('hand', 0));
    prism(fh, [{ y: -0.29, a: 0.014, b: 0.026, xc: -sx * 0.066, zc: -0.012 }, { y: -0.36, a: 0.012, b: 0.022, xc: -sx * 0.066, zc: -0.022 }], 0, tile('hand'), quad('hand', 0));
    if (s.gear === 'bag' && sx === -1) {
      const gc = quad('gear', 2);
      const g = { front: gc, back: gc, side: gc };
      prism(fh, [{ y: -0.52, a: 0.12, b: 0.05, xc: -0.01, zc: -0.02 }, { y: -0.27, a: 0.12, b: 0.05, xc: -0.01, zc: -0.02 }], 0.015, g, gc, gc);
      prism(fh, [{ y: -0.27, a: 0.04, b: 0.006, xc: -0.01, zc: -0.02 }, { y: -0.17, a: 0.04, b: 0.006, xc: -0.01, zc: -0.02 }], 0, g);
    }
    foreHand.push(toGeometry(fh));
  }

  // ---- legs
  const thighA = newAcc();
  prism(thighA, [{ y: -0.45, a: 0.075, b: 0.072 }, { y: -0.22, a: 0.088, b: 0.083 }, { y: 0.02, a: 0.095, b: 0.09 }], 0.025, tile('thigh'), null, null);
  const shinA = newAcc();
  prism(shinA, [{ y: -0.34, a: 0.06, b: 0.057 }, { y: -0.18, a: 0.066, b: 0.063 }, { y: 0.0, a: 0.074, b: 0.07 }], 0.025, tile('shin'));
  const shoe = tile('shoe');
  prism(shinA, [
    { y: -0.46, a: 0.056, b: 0.125, zc: -0.055 }, { y: -0.4, a: 0.058, b: 0.128, zc: -0.055 }, { y: -0.35, a: 0.054, b: 0.105, zc: -0.04 }, { y: -0.285, a: 0.066, b: 0.07, zc: 0.0 },
  ], 0.03, shoe, quad('shoe', 0), null);

  const geo: VariantGeo = {
    hips: toGeometry(hipsA), torso: toGeometry(torsoA), head: toGeometry(headA),
    upperArm: [upperArm[0], upperArm[1]], foreHand: [foreHand[0], foreHand[1]],
    thigh: toGeometry(thighA), shinShoe: toGeometry(shinA),
    shoulderX: 0.255 * w * bulk + 0.03,
    triangles: 0,
  };
  const tris = (g: THREE.BufferGeometry): number => g.attributes.position.count / 3;
  geo.triangles = tris(geo.hips) + tris(geo.torso) + tris(geo.head)
    + tris(geo.upperArm[0]) + tris(geo.upperArm[1]) + tris(geo.foreHand[0]) + tris(geo.foreHand[1]) + 2 * tris(geo.thigh) + 2 * tris(geo.shinShoe);
  return geo;
}

export function variantGeo(variant: number): VariantGeo {
  let g = geoCache.get(variant);
  if (!g) { g = buildVariantGeo(variant); geoCache.set(variant, g); }
  return g;
}

// ---------------------------------------------------------------- materials (one atlas per variant)

const matCache = new WeakMap<IMaterialLibrary, Map<number, THREE.Material>>();

/** Paint the 256 px atlas of a variant on a canvas (needs a DOM or an injected maker). Deterministic. */
let canvasBroken = false;
export function paintPedCanvas(variant: number, make: (w: number, h: number) => HTMLCanvasElement = createCanvas): HTMLCanvasElement | null {
  if (canvasBroken) return null;
  const c = make(PED_ATLAS, PED_ATLAS);
  const ctx = c.getContext('2d');
  if (!ctx) { canvasBroken = true; return null; } // no 2D canvas (jsdom): flat-colour people
  pedAtlasPainter(ctx, PED_ATLAS, PED_ATLAS, new Rng(`ped:${variant}`), variant);
  return c;
}

/** The shared material of a variant: the painted atlas (flat colour when there is no DOM, as in unit tests). Cached per library. */
export function pedMaterial(materials: IMaterialLibrary, variant: number): THREE.Material {
  let byV = matCache.get(materials);
  if (!byV) { byV = new Map(); matCache.set(materials, byV); }
  let m = byV.get(variant);
  if (m) return m;
  const spec = PED_SPECS[variant];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, name: `ped:${spec.id}` });
  if (typeof document !== 'undefined') {
    try {
      const c = paintPedCanvas(variant);
      if (c) {
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.name = `pedAtlas:${spec.id}`;
        mat.map = tex;
      }
    } catch { /* fall through to the flat colour */ }
  }
  if (!mat.map) mat.color.set(spec.top.color);
  m = mat;
  byV.set(variant, m);
  return m;
}

// ---------------------------------------------------------------- day context and picking

let ctxHour = 12;
let ctxSunday = true;
/** The hour (0..24) and whether the game day is a Sunday: church clothes are likelier in the late morning of a Sunday. */
export function setPedDayContext(hour: number, sunday = true): void { ctxHour = hour; ctxSunday = sunday; }

/** Weighted civilian pick; Sunday-service variants get a boost 9:00 to 13:30. Always consumes exactly one rng draw. */
export function pickPedVariant(rng: Rng, hour = ctxHour, sunday = ctxSunday): number {
  let total = 0;
  const w: number[] = [];
  for (let i = 0; i < CIVILIAN_COUNT; i++) {
    const s = PED_SPECS[i];
    const v = s.weight * (s.sunday ? pedChurchBoost(hour, sunday) : 1);
    w.push(v); total += v;
  }
  let r = rng.next() * total;
  for (let i = 0; i < CIVILIAN_COUNT; i++) { r -= w[i]; if (r < 0) return i; }
  return CIVILIAN_COUNT - 1;
}

// ---------------------------------------------------------------- builder

export function buildPedModel(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel {
  let variant: number;
  if (opts.variant === undefined) variant = pickPedVariant(rng);
  else if (typeof opts.variant === 'string') variant = pedVariantIndex(opts.variant);
  else variant = ((Math.floor(opts.variant) % PED_VARIANT_COUNT) + PED_VARIANT_COUNT) % PED_VARIANT_COUNT;
  const spec = PED_SPECS[variant];
  const B = BUILD[spec.build];
  const G = variantGeo(variant);
  const mat = pedMaterial(materials, variant);
  const jitter = rng.range(0.97, 1.03);

  const group = new THREE.Group();
  group.name = 'human';
  group.userData.pedVariant = spec.id;
  group.scale.setScalar(opts.heightScale ?? B.height * jitter);
  const rig = new THREE.Group();
  rig.name = 'rig';
  group.add(rig);

  const mesh = (geo: THREE.BufferGeometry, parent: THREE.Object3D, name: string): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    return m;
  };

  const hips = mesh(G.hips, rig, 'hips');
  hips.position.y = HIP_Y;

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = TORSO_Y;
  rig.add(torso);
  mesh(G.torso, torso, 'chest');

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = HEAD_Y;
  if (B.head !== 1) head.scale.setScalar(B.head);
  rig.add(head);
  mesh(G.head, head, 'skull');

  const legs: THREE.Object3D[] = [];
  const knees: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  const elbows: THREE.Object3D[] = [];
  for (const [i, sx] of [-1, 1].entries()) {
    const side = sx < 0 ? 'L' : 'R';
    const arm = new THREE.Group();
    arm.name = `arm${side}`;
    arm.position.set(sx * G.shoulderX, SHOULDER_Y, 0);
    torso.add(arm);
    mesh(G.upperArm[i], arm, 'upperArm');
    const elbow = new THREE.Group();
    elbow.name = 'elbow';
    elbow.position.y = -UPPER_ARM;
    arm.add(elbow);
    mesh(G.foreHand[i], elbow, `hand${side}`);
    arms.push(arm);
    elbows.push(elbow);

    const leg = new THREE.Group();
    leg.name = `leg${side}`;
    leg.position.set(sx * LEG_X, HIP_Y, 0);
    rig.add(leg);
    mesh(G.thigh, leg, 'thigh');
    const knee = new THREE.Group();
    knee.name = 'knee';
    knee.position.y = -THIGH;
    leg.add(knee);
    mesh(G.shinShoe, knee, 'shin');
    legs.push(leg);
    knees.push(knee);
  }
  void FOREARM; void KNEE_Y;

  return { group, legs, arms, head, knees, elbows, torso, rig, hips, spec, variant, triangles: G.triangles };
}
