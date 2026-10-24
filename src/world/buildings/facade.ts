/**
 * Shared building toolkit: a geometry batch that collects boxes/quads per material in a lot-local frame
 * (x along the front, y up, z toward the street; the facade is at z <= 0) with tiling UVs
 * (1 texture repeat per TILE metres), plus helpers for windows, cornices, parapets, fire escapes, tanks.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';

export const FLOOR_H = 3.3;
export const BASEMENT_H = 1.2;
/** metres per texture repeat */
export const TILE = 3;

export type V3 = [number, number, number];

export interface BuildingMats {
  lib: IMaterialLibrary;
  brownstone: THREE.Material;
  brickRed: THREE.Material;
  brickPainted: THREE.Material;
  limestone: THREE.Material;
  cornice: THREE.Material;
  stoop: THREE.Material;
  window: THREE.Material;
  glass: THREE.Material;
  rollGate: THREE.Material;
  roof: THREE.Material;
  tank: THREE.Material;
  metal: THREE.Material;
  scaffold: THREE.Material;
  chain: THREE.Material;
  plainAwnings: THREE.Material[];
}

export function loadMats(lib: IMaterialLibrary): BuildingMats {
  return {
    lib,
    brownstone: lib.get('brownstone', 0),
    brickRed: lib.get('brickRed', 0),
    brickPainted: lib.get('brickPainted', 0),
    limestone: lib.get('limestone', 0),
    cornice: lib.get('cornice', 0),
    stoop: lib.get('stoop', 0),
    window: lib.get('window', 0),
    glass: lib.get('storefrontGlass', 0),
    rollGate: lib.get('rollGate', 0),
    roof: lib.get('roof', 0),
    tank: lib.get('waterTank', 0),
    metal: lib.get('metalDark', 0),
    scaffold: lib.get('scaffold', 0),
    chain: lib.get('chainlink', 0),
    plainAwnings: [lib.awning('#2f6f4f', ''), lib.awning('#8a3b2e', '')],
  };
}

/** Axis-aligned rectangle in the lot-local frame (z0 < z1). */
export interface LocalRect { x0: number; x1: number; z0: number; z1: number; }

export interface LotOutput {
  /** footprint rectangles (each becomes one Polygon collider; keep them inside the lot) */
  body: LocalRect[];
  /** stoop / steps rectangles (one Polygon collider each) */
  stoops: LocalRect[];
  /** vacant lots: fence line in local space -> Segment collider */
  fence?: { x0: number; x1: number; z: number };
}

export interface LotCtx {
  b: LotBatch;
  m: BuildingMats;
  rng: Rng;
  W: number;
  D: number;
  lot: Lot;
  /** which side wall (local x=0 'left' / x=W 'right') meets the cross street, for corner lots */
  cornerSide: 'left' | 'right' | null;
}

interface Raw { p: number[]; n: number[]; uv: number[]; }

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export class LotBatch {
  private raw = new Map<THREE.Material, Raw>();
  private out = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private cur = new THREE.Matrix4();

  private buf(mat: THREE.Material): Raw {
    let r = this.raw.get(mat);
    if (!r) { r = { p: [], n: [], uv: [] }; this.raw.set(mat, r); }
    return r;
  }

  private tp(p: V3): V3 {
    _v.set(p[0], p[1], p[2]).applyMatrix4(this.cur);
    return [_v.x, _v.y, _v.z];
  }

  /** Run `fn` with all geometry transformed by `m` (e.g. to decorate a side wall). */
  with(m: THREE.Matrix4, fn: () => void): void {
    const prev = this.cur;
    this.cur = prev.clone().multiply(m);
    fn();
    this.cur = prev;
  }

  /**
   * Quad o, o+u, o+u+v, o+v. Front face is the side u x v points to (flipped to match `hint` if given).
   * UV repeats: ru across u, rv across v (default: edge length / TILE).
   */
  rect(mat: THREE.Material, o: V3, u: V3, v: V3, opt?: { ru?: number; rv?: number; hint?: V3 }): void {
    let [ox, oy, oz] = o;
    let [ux, uy, uz] = u;
    const [vx, vy, vz] = v;
    const ru = opt?.ru ?? Math.hypot(ux, uy, uz) / TILE;
    const rv = opt?.rv ?? Math.hypot(vx, vy, vz) / TILE;
    if (opt?.hint) {
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * opt.hint[0] + ny * opt.hint[1] + nz * opt.hint[2] < 0) {
        ox += ux; oy += uy; oz += uz; ux = -ux; uy = -uy; uz = -uz;
      }
    }
    const p0 = this.tp([ox, oy, oz]);
    const p1 = this.tp([ox + ux, oy + uy, oz + uz]);
    const p2 = this.tp([ox + ux + vx, oy + uy + vy, oz + uz + vz]);
    const p3 = this.tp([ox + vx, oy + vy, oz + vz]);
    _n.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).cross(_v.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2])).normalize();
    const r = this.buf(mat);
    const push = (p: V3, uu: number, vv: number) => { r.p.push(p[0], p[1], p[2]); r.n.push(_n.x, _n.y, _n.z); r.uv.push(uu, vv); };
    push(p0, 0, 0); push(p1, ru, 0); push(p2, ru, rv);
    push(p0, 0, 0); push(p2, ru, rv); push(p3, 0, rv);
  }

  /** Triangle (front face by winding a,b,c); UVs are planar world-size / TILE so textures tile consistently. */
  tri(mat: THREE.Material, a: V3, b: V3, c: V3): void {
    const pa = new THREE.Vector3(...this.tp(a)), pb = new THREE.Vector3(...this.tp(b)), pc = new THREE.Vector3(...this.tp(c));
    const e1 = pb.clone().sub(pa);
    const n = e1.clone().cross(pc.clone().sub(pa)).normalize();
    e1.normalize();
    const e2 = n.clone().cross(e1);
    const r = this.buf(mat);
    for (const p of [pa, pb, pc]) {
      const d = p.clone().sub(pa);
      r.p.push(p.x, p.y, p.z); r.n.push(n.x, n.y, n.z); r.uv.push(d.dot(e1) / TILE, d.dot(e2) / TILE);
    }
  }

  /**
   * Axis-aligned box. `faces` picks which faces to emit: r(+x) l(-x) u(+y) d(-y) f(+z, toward street) b(-z).
   * `unit` maps each face to the full 0..1 texture (signs, awnings); otherwise tiling UVs.
   */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, faces = 'rlufb', unit = false): void {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    if (dx <= 0 || dy <= 0 || dz <= 0) return;
    const o = unit ? { ru: 1, rv: 1 } : undefined;
    if (faces.includes('f')) this.rect(mat, [x0, y0, z1], [dx, 0, 0], [0, dy, 0], o);
    if (faces.includes('b')) this.rect(mat, [x1, y0, z0], [-dx, 0, 0], [0, dy, 0], o);
    if (faces.includes('r')) this.rect(mat, [x1, y0, z1], [0, 0, -dz], [0, dy, 0], o);
    if (faces.includes('l')) this.rect(mat, [x0, y0, z0], [0, 0, dz], [0, dy, 0], o);
    if (faces.includes('u')) this.rect(mat, [x0, y1, z1], [dx, 0, 0], [0, 0, -dz], o);
    if (faces.includes('d')) this.rect(mat, [x0, y0, z0], [dx, 0, 0], [0, 0, dz], o);
  }

  /** Square-section bar from a to b (thickness t); end caps omitted. */
  bar(mat: THREE.Material, a: V3, b: V3, t = 0.05): void {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = d.length();
    if (L < 1e-6) return;
    d.divideScalar(L);
    const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const p1 = d.clone().cross(ref).normalize();
    const p2 = d.clone().cross(p1).normalize();
    const h = t / 2;
    const A = new THREE.Vector3(...a);
    const at = (s1: number, s2: number) => A.clone().addScaledVector(p1, s1 * h).addScaledVector(p2, s2 * h);
    const U: V3 = [d.x * L, d.y * L, d.z * L];
    const sv = (v: THREE.Vector3, k: number): V3 => [v.x * k, v.y * k, v.z * k];
    const hv = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
    const o1 = at(1, -1), o2 = at(-1, -1), o3 = at(-1, 1), o4 = at(-1, -1);
    this.rect(mat, hv(o1), U, sv(p2, t), { hint: hv(p1) });
    this.rect(mat, hv(o2), U, sv(p2, t), { hint: sv(p1, -1) });
    this.rect(mat, hv(o3), U, sv(p1, t), { hint: hv(p2) });
    this.rect(mat, hv(o4), U, sv(p1, t), { hint: sv(p2, -1) });
  }

  /** Add an existing three geometry (transformed by the current matrix). */
  geom(mat: THREE.Material, g: THREE.BufferGeometry): void {
    const ng = g.index ? g.toNonIndexed() : g;
    const pos = ng.getAttribute('position'), nor = ng.getAttribute('normal'), uv = ng.getAttribute('uv');
    const r = this.buf(mat);
    const nm = new THREE.Matrix3().getNormalMatrix(this.cur);
    for (let i = 0; i < pos.count; i++) {
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(this.cur);
      r.p.push(_v.x, _v.y, _v.z);
      _n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(nm).normalize();
      r.n.push(_n.x, _n.y, _n.z);
      r.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (ng !== g) ng.dispose();
    g.dispose();
  }

  /** Close the current lot: bake the collected geometry into per-material BufferGeometries moved by `m`. */
  flush(m: THREE.Matrix4): void {
    for (const [mat, r] of this.raw) {
      if (!r.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(r.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(r.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv, 2));
      g.applyMatrix4(m);
      let list = this.out.get(mat);
      if (!list) { list = []; this.out.set(mat, list); }
      list.push(g);
      r.p = []; r.n = []; r.uv = [];
    }
  }

  /** One merged geometry per material. */
  merged(): { material: THREE.Material; geometry: THREE.BufferGeometry }[] {
    const res: { material: THREE.Material; geometry: THREE.BufferGeometry }[] = [];
    for (const [material, list] of this.out) {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geometry) continue;
      if (list.length > 1) for (const g of list) g.dispose();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      res.push({ material, geometry });
    }
    this.out.clear();
    return res;
  }
}

/** Matrix mapping a side wall's local frame (x along the wall, z out of the wall) into lot-local space. */
export function sideWallFrame(side: 'left' | 'right', W: number, D: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (side === 'right') {
    m.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    m.setPosition(W, 0, 0);
  } else {
    m.makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    m.setPosition(0, 0, -D);
  }
  return m;
}

/** Evenly spaced bay centres across a width. */
export function bayCentres(width: number, bays: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < bays; i++) xs.push(((i + 0.5) * width) / bays);
  return xs;
}

export interface WindowRow {
  xs: number[];
  /** window bottom y */
  y: number;
  w: number;
  h: number;
  /** facade plane z */
  z: number;
  sill?: boolean;
  lintel?: boolean;
  /** pointed-arch top (church) */
  arch?: boolean;
}

export function windows(b: LotBatch, m: BuildingMats, o: WindowRow): void {
  for (const x of o.xs) {
    b.rect(m.window, [x - o.w / 2, o.y, o.z + 0.02], [o.w, 0, 0], [0, o.h, 0], { ru: 1, rv: 1 });
    if (o.arch) {
      b.tri(m.window, [x - o.w / 2, o.y + o.h, o.z + 0.02], [x + o.w / 2, o.y + o.h, o.z + 0.02], [x, o.y + o.h + o.w * 0.6, o.z + 0.02]);
    }
    if (o.sill) b.box(m.limestone, x - o.w / 2 - 0.1, o.y - 0.12, o.z, x + o.w / 2 + 0.1, o.y, o.z + 0.16);
    if (o.lintel) b.box(m.limestone, x - o.w / 2 - 0.08, o.y + o.h, o.z, x + o.w / 2 + 0.08, o.y + o.h + 0.16, o.z + 0.1);
  }
}

/** Projecting cornice (darker material) with a thinner band under it. */
export function cornice(b: LotBatch, m: BuildingMats, x0: number, x1: number, y: number, z: number, proud = 0.6): void {
  b.box(m.cornice, x0 - 0.05, y - 0.35, z, x1 + 0.05, y + 0.15, z + proud);
  b.box(m.cornice, x0 - 0.02, y - 0.65, z, x1 + 0.02, y - 0.35, z + proud * 0.5);
}

export interface RoofSpec {
  x0: number; x1: number;
  /** back (more negative) and front z of the roof plate */
  zBack: number; zFront: number;
  y: number;
  /** parapet height (0 = none) */
  ph?: number;
  frontMat: THREE.Material;
  sideMat: THREE.Material;
}

/** Flat tar roof plus a brick parapet ring. */
export function roofWithParapet(b: LotBatch, m: BuildingMats, r: RoofSpec): void {
  const { x0, x1, zBack, zFront, y } = r;
  const ph = r.ph ?? 0.7, t = 0.25;
  b.rect(m.roof, [x0, y + 0.01, zFront], [x1 - x0, 0, 0], [0, 0, -(zFront - zBack)]);
  if (ph <= 0) return;
  b.box(r.frontMat, x0, y, zFront - t, x1, y + ph, zFront, 'rlufb');
  b.box(r.sideMat, x0, y, zBack, x1, y + ph, zBack + t, 'rlufb');
  b.box(r.sideMat, x0, y, zBack + t, x0 + t, y + ph, zFront - t, 'rufb');
  b.box(r.sideMat, x1 - t, y, zBack + t, x1, y + ph, zFront - t, 'lufb');
}

/** Rooftop water tank on legs (cylinder + cone lid). */
export function waterTank(b: LotBatch, m: BuildingMats, cx: number, y: number, cz: number): void {
  const r = 0.95, legH = 0.9, h = 1.7;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    b.bar(m.metal, [cx + sx * 0.7, y, cz + sz * 0.7], [cx + sx * 0.7, y + legH, cz + sz * 0.7], 0.1);
  }
  b.box(m.metal, cx - 0.9, y + legH - 0.08, cz - 0.9, cx + 0.9, y + legH, cz + 0.9);
  const cyl = new THREE.CylinderGeometry(r, r, h, 12, 1, true);
  cyl.translate(cx, y + legH + h / 2, cz);
  b.geom(m.tank, cyl);
  const lid = new THREE.ConeGeometry(r + 0.08, 0.55, 12);
  lid.translate(cx, y + legH + h + 0.27, cz);
  b.geom(m.tank, lid);
}

/** Iron fire escape: platforms with rails at each floor, diagonal stairs between, drop ladder. */
export function fireEscape(b: LotBatch, m: BuildingMats, xa: number, xb: number, z: number, platformYs: number[]): void {
  const depth = 1.0;
  platformYs.forEach((y, i) => {
    b.box(m.metal, xa, y - 0.06, z, xb, y, z + depth, 'ufrl');
    b.bar(m.metal, [xa, y + 1.0, z + depth], [xb, y + 1.0, z + depth], 0.045);
    b.bar(m.metal, [xa, y + 0.5, z + depth], [xb, y + 0.5, z + depth], 0.04);
    b.bar(m.metal, [xa, y + 1.0, z], [xa, y + 1.0, z + depth], 0.045);
    b.bar(m.metal, [xb, y + 1.0, z], [xb, y + 1.0, z + depth], 0.045);
    if (i > 0) {
      const lower = platformYs[i - 1];
      b.bar(m.metal, [xb - 0.45, lower, z + depth - 0.1], [xb - 0.45, y, z + 0.3], 0.05);
      b.bar(m.metal, [xb - 0.1, lower + 0.9, z + depth - 0.1], [xb - 0.1, y + 0.9, z + 0.3], 0.04);
    }
  });
  const first = platformYs[0];
  if (first !== undefined) b.bar(m.metal, [xa + 0.4, 2.4, z + depth + 0.15], [xa + 0.4, first, z + depth - 0.05], 0.05);
}

/** A handful of window air-conditioners stuck on random upper-floor windows. */
export function acUnits(b: LotBatch, m: BuildingMats, rng: Rng, spots: { x: number; y: number }[], z: number): void {
  if (!spots.length) return;
  const n = Math.min(spots.length, rng.int(2, 4));
  const pool = spots.slice();
  for (let i = 0; i < n; i++) {
    const s = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    b.box(m.limestone, s.x - 0.38, s.y + 0.05, z, s.x + 0.38, s.y + 0.55, z + 0.5);
    b.box(m.metal, s.x - 0.3, s.y + 0.12, z + 0.5, s.x + 0.3, s.y + 0.48, z + 0.52, 'f');
  }
}
