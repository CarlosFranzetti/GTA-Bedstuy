/**
 * LANDMARKS geometry kit. Pure three.js, no roadnet imports. A `Kit` collects triangles in a SITE-LOCAL frame and turns them
 * into one merged mesh per material at `finish()`:
 *
 *   local x   along the frontage (the street-side edge of the site)
 *   local z   depth, 0 at the street edge and growing INTO the site
 *   local y   up, 0 = the walking surface (the group sits at the sidewalk height)
 *
 * Shapes carry an explicit outward direction or a hint, so winding mistakes do not show; mirrored frames are corrected once at
 * flush. Wall UVs tile in metres / TILE like the shared building materials (TILE = 3 m), so the material library's textures
 * (and whatever the textures lane does to them) show up unchanged.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { IMaterialLibrary, MaterialKey, StaticCollider } from '@/world/types';

export type V3 = [number, number, number];
export const TILE = 3;
const rad = Math.PI / 180;

export interface Frame {
  /** world position of local (0, 0) */
  ox: number; oz: number;
  /** world direction of local +x (unit) */
  fx: number; fz: number;
  /** world direction of local +z, i.e. INTO the site (unit) */
  nx: number; nz: number;
}

export interface QuadOpt {
  /** UV repeats (default: edge length / TILE) */
  ru?: number; rv?: number;
  /** flip so the front face points toward this local direction */
  hint?: V3;
  /** vertex colour (flat material only): 0xrrggbb */
  color?: number;
  /** explicit uv rect [u0, v0, u1, v1] */
  uv?: [number, number, number, number];
}

interface Raw { p: number[]; n: number[]; uv: number[]; c: number[] }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const col = new THREE.Color();

export interface FlatMat { flat: THREE.MeshStandardMaterial; grass: THREE.MeshStandardMaterial }
const flatCache = new WeakMap<object, FlatMat>();

/** the two materials the library has no key for: vertex-coloured plain paint, and a lawn */
export function flatMaterials(lib: object): FlatMat {
  let f = flatCache.get(lib);
  if (f) return f;
  const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  flat.name = 'lm:flat';
  // a small tiling noise so a lawn is not one flat green (no canvas: phone tiers cap 2D canvas memory)
  const N = 64, data = new Uint8Array(N * N * 4);
  let s = 12345;
  const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (y * N + x) * 4;
    const v = 0.78 + rnd() * 0.22 + (((x >> 3) + (y >> 3)) & 1) * 0.04;
    data[k] = 86 * v; data[k + 1] = 128 * v; data[k + 2] = 56 * v; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  const grass = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  grass.name = 'lm:grass';
  f = { flat, grass };
  flatCache.set(lib, f);
  return f;
}

export class Kit {
  readonly colliders: StaticCollider[] = [];
  readonly lib: IMaterialLibrary;
  readonly flatM: THREE.MeshStandardMaterial;
  readonly grassM: THREE.MeshStandardMaterial;
  private raw = new Map<THREE.Material, Raw>();
  private readonly det: number;
  private colliderN = 0;
  triangles = 0;

  constructor(lib: IMaterialLibrary, readonly frame: Frame, readonly id: string) {
    this.lib = lib;
    const f = flatMaterials(lib);
    this.flatM = f.flat; this.grassM = f.grass;
    this.det = frame.fx * frame.nz - frame.fz * frame.nx;
  }

  m(key: MaterialKey, variant = 0): THREE.Material { return this.lib.get(key, variant); }

  /** local -> world (x, z) */
  toWorld(x: number, z: number): Vec2 {
    const f = this.frame;
    return { x: f.ox + f.fx * x + f.nx * z, z: f.oz + f.fz * x + f.nz * z };
  }

  private buf(mat: THREE.Material): Raw {
    let r = this.raw.get(mat);
    if (!r) { r = { p: [], n: [], uv: [], c: [] }; this.raw.set(mat, r); }
    return r;
  }

  private push(r: Raw, p: V3, n: V3, u: number, v: number, c: number): void {
    r.p.push(p[0], p[1], p[2]); r.n.push(n[0], n[1], n[2]); r.uv.push(u, v);
    col.setHex(c);
    r.c.push(col.r, col.g, col.b);
  }

  /** a triangle a-b-c, front = counter-clockwise; uv given per vertex (or planar by world size) */
  tri(mat: THREE.Material, a: V3, b: V3, c: V3, o?: { hint?: V3; color?: number; uv?: [number, number][] }): void {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _c.crossVectors(_a, _b);
    const len = _c.length();
    if (len < 1e-9) return;
    _c.divideScalar(len);
    let [bb, cc] = [b, c];
    if (o?.hint && _c.x * o.hint[0] + _c.y * o.hint[1] + _c.z * o.hint[2] < 0) { _c.negate(); [bb, cc] = [c, b]; }
    const n: V3 = [_c.x, _c.y, _c.z];
    const r = this.buf(mat);
    const col0 = o?.color ?? 0xffffff;
    const uv = o?.uv;
    const pl = (p: V3): [number, number] => {
      // planar projection on the dominant axis of the normal
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      if (ay >= ax && ay >= az) return [p[0] / TILE, p[2] / TILE];
      if (ax >= az) return [p[2] / TILE, p[1] / TILE];
      return [p[0] / TILE, p[1] / TILE];
    };
    const q = (p: V3, i: number): [number, number] => (uv ? uv[i] : pl(p));
    const ua = q(a, 0), ub = uv ? uv[bb === b ? 1 : 2] : pl(bb), uc = uv ? uv[cc === c ? 2 : 1] : pl(cc);
    this.push(r, a, n, ua[0], ua[1], col0);
    this.push(r, bb, n, ub[0], ub[1], col0);
    this.push(r, cc, n, uc[0], uc[1], col0);
    this.triangles++;
  }

  /** quad a-b-c-d (a loop). UV: u along a-b, v along a-d. */
  quad(mat: THREE.Material, a: V3, b: V3, c: V3, d: V3, o?: QuadOpt): void {
    const lab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const lad = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    const ru = o?.ru ?? lab / TILE, rv = o?.rv ?? lad / TILE;
    const [u0, v0, u1, v1] = o?.uv ?? [0, 0, ru, rv];
    const uvs: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const t = { hint: o?.hint, color: o?.color };
    this.tri(mat, a, b, c, { ...t, uv: [uvs[0], uvs[1], uvs[2]] });
    this.tri(mat, a, c, d, { ...t, uv: [uvs[0], uvs[2], uvs[3]] });
    this.triangles -= 0; // two triangles counted by tri()
  }

  /** a vertical wall between two floor points, facing `out` (a local direction on the xz plane) */
  wall(mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, out: [number, number], o?: QuadOpt): void {
    this.quad(mat, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], { ...o, hint: [out[0], 0, out[1]] });
  }

  /** horizontal polygon at height y, facing up (or down) */
  floor(mat: THREE.Material, pts: ReadonlyArray<readonly [number, number]>, y: number, o?: { color?: number; down?: boolean; ru?: number; uvScale?: number }): void {
    if (pts.length < 3) return;
    const sc = o?.uvScale ?? 1 / TILE;
    const hint: V3 = [0, o?.down ? -1 : 1, 0];
    const idx = triangulate(pts);
    for (const [i, j, k] of idx) {
      const A = pts[i], B = pts[j], C = pts[k];
      this.tri(mat, [A[0], y, A[1]], [B[0], y, B[1]], [C[0], y, C[1]], { hint, color: o?.color, uv: [[A[0] * sc, A[1] * sc], [B[0] * sc, B[1] * sc], [C[0] * sc, C[1] * sc]] });
    }
  }

  /** axis-aligned box (local): four walls and a top, no bottom. `top` / `sides` override the materials. */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o?: { top?: THREE.Material | null; color?: number; noTop?: boolean; noSides?: boolean; bottom?: boolean }): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (y1 <= y0 || x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
    const c = o?.color;
    if (!o?.noSides) {
      this.wall(mat, x0, z0, x1, z0, y0, y1, [0, -1], { color: c });
      this.wall(mat, x1, z0, x1, z1, y0, y1, [1, 0], { color: c });
      this.wall(mat, x1, z1, x0, z1, y0, y1, [0, 1], { color: c });
      this.wall(mat, x0, z1, x0, z0, y0, y1, [-1, 0], { color: c });
    }
    if (!o?.noTop) this.floor(o?.top ?? mat, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y1, { color: c });
    if (o?.bottom) this.floor(mat, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, { color: c, down: true });
  }

  /** vertical prism over an arbitrary footprint (convex walls; the cap is triangulated) */
  prism(mat: THREE.Material, pts: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, o?: { top?: THREE.Material | null; color?: number; noTop?: boolean }): void {
    const n = pts.length;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0] / n; cz += p[1] / n; }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
      this.wall(mat, a[0], a[1], b[0], b[1], y0, y1, [mx, mz], { color: o?.color });
    }
    if (!o?.noTop) this.floor(o?.top ?? mat, pts, y1, { color: o?.color });
  }

  /** upright n-gon column */
  cyl(mat: THREE.Material, cx: number, cz: number, r: number, y0: number, y1: number, n = 8, o?: { top?: THREE.Material | null; color?: number; noTop?: boolean; rot?: number }): void {
    const pts: [number, number][] = [];
    const rot = o?.rot ?? 0;
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    this.prism(mat, pts, y0, y1, o);
  }

  /** pyramid or cone over a regular n-gon */
  cone(mat: THREE.Material, cx: number, cz: number, r: number, y0: number, y1: number, n = 4, o?: { color?: number; rot?: number; r1?: number }): void {
    const rot = o?.rot ?? Math.PI / 4;
    const r1 = o?.r1 ?? 0;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      const A: V3 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], B: V3 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const am = (a0 + a1) / 2;
      const hint: V3 = [Math.cos(am), 0.4, Math.sin(am)];
      if (r1 <= 0) this.tri(mat, A, B, [cx, y1, cz], { hint, color: o?.color });
      else this.quad(mat, A, B, [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1], [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1], { hint, color: o?.color });
    }
  }

  /** a roof over the rectangle with a ridge along local x ('x') or z ('z'): two slopes and two gable ends (gable wall material `gm`) */
  gable(roof: THREE.Material, gm: THREE.Material, x0: number, z0: number, x1: number, z1: number, yEave: number, yRidge: number, ridge: 'x' | 'z', over = 0.25): void {
    if (ridge === 'z') {
      const xm = (x0 + x1) / 2;
      this.quad(roof, [x0 - over, yEave, z0 - over], [xm, yRidge, z0 - over], [xm, yRidge, z1 + over], [x0 - over, yEave, z1 + over], { hint: [-1, 1, 0] });
      this.quad(roof, [x1 + over, yEave, z1 + over], [xm, yRidge, z1 + over], [xm, yRidge, z0 - over], [x1 + over, yEave, z0 - over], { hint: [1, 1, 0] });
      this.tri(gm, [x0, yEave, z0], [x1, yEave, z0], [xm, yRidge, z0], { hint: [0, 0, -1] });
      this.tri(gm, [x1, yEave, z1], [x0, yEave, z1], [xm, yRidge, z1], { hint: [0, 0, 1] });
    } else {
      const zm = (z0 + z1) / 2;
      this.quad(roof, [x0 - over, yEave, z0 - over], [x1 + over, yEave, z0 - over], [x1 + over, yRidge, zm], [x0 - over, yRidge, zm], { hint: [0, 1, -1] });
      this.quad(roof, [x1 + over, yEave, z1 + over], [x0 - over, yEave, z1 + over], [x0 - over, yRidge, zm], [x1 + over, yRidge, zm], { hint: [0, 1, 1] });
      this.tri(gm, [x0, yEave, z1], [x0, yEave, z0], [x0, yRidge, zm], { hint: [-1, 0, 0] });
      this.tri(gm, [x1, yEave, z0], [x1, yEave, z1], [x1, yRidge, zm], { hint: [1, 0, 0] });
    }
  }

  /** a bar between two points, square section `t` (fence rails, struts) */
  bar(mat: THREE.Material, a: V3, b: V3, t: number, o?: { color?: number }): void {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return;
    // choose a perpendicular pair
    let px = -dz, py = 0, pz = dx;
    if (Math.hypot(px, pz) < 1e-6) { px = 1; pz = 0; }
    const pl = Math.hypot(px, py, pz);
    px = (px / pl) * t / 2; py = (py / pl) * t / 2; pz = (pz / pl) * t / 2;
    // second perpendicular = dir x p
    let qx = (dy * pz - dz * py), qy = (dz * px - dx * pz), qz = (dx * py - dy * px);
    const ql = Math.hypot(qx, qy, qz) || 1;
    qx = (qx / ql) * t / 2; qy = (qy / ql) * t / 2; qz = (qz / ql) * t / 2;
    const P = (s: number, u: number, v: number): V3 => [(s ? b[0] : a[0]) + px * u + qx * v, (s ? b[1] : a[1]) + py * u + qy * v, (s ? b[2] : a[2]) + pz * u + qz * v];
    const corners: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const c0 = corners[i], c1 = corners[(i + 1) % 4];
      const mid: V3 = [px * (c0[0] + c1[0]) / 2 + qx * (c0[1] + c1[1]) / 2, py * (c0[0] + c1[0]) / 2 + qy * (c0[1] + c1[1]) / 2, pz * (c0[0] + c1[0]) / 2 + qz * (c0[1] + c1[1]) / 2];
      this.quad(mat, P(0, c0[0], c0[1]), P(1, c0[0], c0[1]), P(1, c1[0], c1[1]), P(0, c1[0], c1[1]), { hint: mid, color: o?.color, ru: L / TILE, rv: 0.1 });
    }
  }

  // ------------------------------------------------------------------- colliders (world space)

  /** convex polygon collider from local points (clockwise from above, as physics wants) */
  solidPoly(pts: ReadonlyArray<readonly [number, number]>): void {
    const w = pts.map((p) => this.toWorld(p[0], p[1]));
    let area = 0;
    for (let i = 0; i < w.length; i++) { const p = w[i], q = w[(i + 1) % w.length]; area += p.x * q.z - q.x * p.z; }
    if (area < 0) w.reverse();
    this.colliders.push({ shape: { kind: 'polygon', points: w }, pos: { x: 0, z: 0 }, id: `lm:${this.id}:${this.colliderN++}` });
  }

  solidRect(x0: number, z0: number, x1: number, z1: number): void {
    this.solidPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  }

  solidCircle(x: number, z: number, r: number): void {
    const p = this.toWorld(x, z);
    this.colliders.push({ shape: { kind: 'circle', r }, pos: { x: p.x, z: p.z }, id: `lm:${this.id}:${this.colliderN++}` });
  }

  /** a wall / fence segment (no thickness) */
  solidSeg(x0: number, z0: number, x1: number, z1: number): void {
    this.colliders.push({ shape: { kind: 'segment', a: this.toWorld(x0, z0), b: this.toWorld(x1, z1) }, pos: { x: 0, z: 0 }, id: `lm:${this.id}:${this.colliderN++}` });
  }

  // ------------------------------------------------------------------- output

  /** merged meshes, one per material, in world space (the caller positions the group at the walking-surface height) */
  finish(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    const f = this.frame;
    const flip = this.det < 0;
    for (const [mat, r] of this.raw) {
      const nv = r.p.length / 3;
      if (!nv) continue;
      const pos = new Float32Array(r.p.length), nor = new Float32Array(r.n.length);
      for (let i = 0; i < nv; i++) {
        const lx = r.p[i * 3], ly = r.p[i * 3 + 1], lz = r.p[i * 3 + 2];
        pos[i * 3] = f.ox + f.fx * lx + f.nx * lz; pos[i * 3 + 1] = ly; pos[i * 3 + 2] = f.oz + f.fz * lx + f.nz * lz;
        const nx = r.n[i * 3], ny = r.n[i * 3 + 1], nz = r.n[i * 3 + 2];
        nor[i * 3] = f.fx * nx + f.nx * nz; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = f.fz * nx + f.nz * nz;
      }
      const uv = new Float32Array(r.uv);
      const colr = mat === this.flatM ? new Float32Array(r.c) : null;
      if (flip) {
        // mirrored frame: swap the 2nd and 3rd vertex of every triangle so the winding follows the (transformed) normal
        for (let t = 0; t < nv; t += 3) {
          for (let k = 0; k < 3; k++) {
            const a = (t + 1) * 3 + k, b = (t + 2) * 3 + k;
            [pos[a], pos[b]] = [pos[b], pos[a]]; [nor[a], nor[b]] = [nor[b], nor[a]];
            if (colr) [colr[a], colr[b]] = [colr[b], colr[a]];
          }
          const ua = (t + 1) * 2, ub = (t + 2) * 2;
          [uv[ua], uv[ub]] = [uv[ub], uv[ua]]; [uv[ua + 1], uv[ub + 1]] = [uv[ub + 1], uv[ua + 1]];
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (colr) g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = `lm:${this.id}:${mat.name || 'mat'}`;
      m.castShadow = mat !== this.grassM && mat !== this.flatM;
      m.receiveShadow = true;
      out.push(m);
    }
    this.raw.clear();
    return out;
  }

  get triangleCount(): number {
    let n = 0;
    for (const r of this.raw.values()) n += r.p.length / 9;
    return n;
  }
}

/** ear-clip triangulation of a simple polygon (either winding) via three's ShapeUtils */
export function triangulate(pts: ReadonlyArray<readonly [number, number]>): Array<[number, number, number]> {
  if (pts.length === 3) return [[0, 1, 2]];
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const res = THREE.ShapeUtils.triangulateShape(contour, []);
  return res as Array<[number, number, number]>;
}

export function colorOf(hex: string): number { return new THREE.Color(hex).getHex(); }
export { rad };
