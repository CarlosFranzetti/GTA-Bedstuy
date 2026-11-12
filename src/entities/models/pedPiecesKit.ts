/**
 * Kit for the separate pieces of a person (hair, headwear, accessories, shoes; see pedPieces.ts). The style reference is the
 * low-poly people of the early 3D GTA games, nothing is copied from them: few polygons, strong silhouettes, smooth shading with a few
 * deliberate hard edges (a cap's brim, a sole, a hat band), one tiny painted swatch (the person's atlas) plus vertex colours.
 *
 * Every piece is fitted to the DRESSED skin of the person by casting rays at it, so a piece sits on every one of the twelve body types
 * and both head sizes without a gap or a poke-through. Pieces are built in the shape's rest space (the same space as pedMesh's other parts)
 * and are rigid to one bone, except long hair, which blends head -> torso.
 */
import * as THREE from 'three';
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec, PxRect } from '@/textures/painters/ped';
import type { BodyType } from './pedBodyTypes';

export type V3 = [number, number, number];
export type Detail = 'hi' | 'mid';
export const BONE = { rig: 0, hips: 1, torso: 2, head: 3, armL: 4, elbowL: 5, armR: 6, elbowR: 7, legL: 8, kneeL: 9, legR: 10, kneeR: 11 } as const;

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
/** a stable pseudo random number in [0,1) from a string and an index */
export function rnd(seed: string, i = 0): number { let h = 2166136261 ^ i; for (let k = 0; k < seed.length; k++) { h ^= seed.charCodeAt(k); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }

// ---------------------------------------------------------------- swatches (the person's atlas)

const ATLAS = 512;
export const SWATCH: Record<'hair' | 'hat' | 'gear' | 'torso' | 'pelvis' | 'shoe', PxRect> = {
  hair: { x: 256, y: 0, w: 128, h: 64 }, hat: { x: 384, y: 0, w: 128, h: 64 }, torso: { x: 256, y: 64, w: 64, h: 64 }, pelvis: { x: 320, y: 64, w: 64, h: 64 },
  gear: { x: 384, y: 64, w: 112, h: 64 }, shoe: { x: 384, y: 384, w: 128, h: 128 },
};
/** a small pure white patch the painter keeps for metal, frames and earbuds (tinted by vertex colours) */
export const NEUTRAL: PxRect = { x: 496, y: 72, w: 12, h: 48 };
/** atlas uv for fraction fu across and ft up inside a swatch (3 px inner margin, as the painter's swatches are drawn) */
export function uvIn(r: PxRect, fu: number, ft: number): [number, number] {
  const m = Math.min(3, r.w / 3, r.h / 3);
  const px = r.x + m + clamp(fu) * (r.w - 2 * m), py = r.y + m + (1 - clamp(ft)) * (r.h - 2 * m);
  return [px / ATLAS, 1 - py / ATLAS];
}

// ---------------------------------------------------------------- weights

/** [bone a, weight a, bone b, weight b] of a point */
export type Wfn = (p: V3) => [number, number, number, number];
export const one = (b: number): Wfn => () => [b, 1, 0, 0];
export const blend = (a: number, b: number, w: (p: V3) => number): Wfn => (p) => { const t = clamp(w(p)); return [a, 1 - t, b, t]; };

// ---------------------------------------------------------------- the mesh builder

export interface GridOpts {
  rect: PxRect;
  /** close the grid round its columns */
  wrap?: boolean;
  /** a point inside the piece: the winding is chosen so the faces look away from it */
  center?: V3;
  flip?: boolean;
  /** (fu, ft) inside the swatch from grid row i and column j; default: j across, i up */
  uv?: (i: number, j: number, R: number, C: number) => [number, number];
  shade?: (i: number, j: number, p: V3) => number | V3;
  W?: Wfn;
  /** a plain colour for the whole grid (vertex colour), multiplied by shade */
  tint?: V3;
}

/** vertex normals of a grid (area weighted, wrapped, poles averaged); the winding is chosen from the centre or the flip flag */
export function gridNormals(P: V3[][], wrap: boolean, center?: V3, flip?: boolean): { N: V3[][]; flip: boolean } {
  const R = P.length, C = P[0].length, cols = wrap ? C : C - 1, nxt = (j: number): number => (wrap ? (j + 1) % C : j + 1);
  const N: V3[][] = P.map((r) => r.map(() => [0, 0, 0] as V3));
  let orient = 0;
  const acc = (i: number, j: number, n: V3): void => { const t = N[i][j]; t[0] += n[0]; t[1] += n[1]; t[2] += n[2]; };
  for (let i = 0; i + 1 < R; i++) for (let j = 0; j < cols; j++) {
    const j2 = nxt(j), a = P[i][j], b = P[i][j2], c = P[i + 1][j], d = P[i + 1][j2];
    const n1 = cross(sub(b, a), sub(c, a)), n2 = cross(sub(d, b), sub(c, b));
    acc(i, j, n1); acc(i, j2, n1); acc(i + 1, j, n1); acc(i, j2, n2); acc(i + 1, j2, n2); acc(i + 1, j, n2);
    if (center) orient += dot(n1, sub(a, center)) + dot(n2, sub(b, center));
  }
  const f = flip ?? (center ? orient < 0 : false);
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const n = norm(N[i][j]); N[i][j] = f ? [-n[0], -n[1], -n[2]] : n; }
  // a pole (a row of coincident points) takes the mean normal of its neighbour row
  for (const i of [0, R - 1]) {
    const p0 = P[i][0];
    if (P[i].every((p) => Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) < 1e-6)) {
      const nb = N[i === 0 ? 1 : R - 2]; let s: V3 = [0, 0, 0]; for (const n of nb) s = add(s, n);
      const m = norm(s); for (let j = 0; j < C; j++) N[i][j] = m;
    }
  }
  return { N, flip: f };
}

export class MeshBuilder {
  pos: number[] = []; nrm: number[] = []; uvs: number[] = []; col: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = [];
  constructor(public W: Wfn = one(BONE.head)) {}
  get tris(): number { return this.idx.length / 3; }

  grid(P: V3[][], o: GridOpts): void {
    const R = P.length, C = P[0].length, wrap = !!o.wrap, cols = wrap ? C : C - 1, Cv = wrap ? C + 1 : C, W = o.W ?? this.W;
    const { N, flip } = gridNormals(P, wrap, o.center, o.flip);
    const base = this.pos.length / 3;
    for (let i = 0; i < R; i++) for (let j = 0; j < Cv; j++) {
      const jj = j % C, p = P[i][jj], n = N[i][jj];
      const [fu, ft] = o.uv ? o.uv(i, j, R, Cv) : [j / (Cv - 1), i / (R - 1)];
      const u = uvIn(o.rect, fu, ft), s = o.shade ? o.shade(i, jj, p) : 1, sc: V3 = typeof s === 'number' ? [s, s, s] : s, t = o.tint ?? [1, 1, 1];
      const w = W(p);
      this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uvs.push(u[0], u[1]);
      this.col.push(sc[0] * t[0], sc[1] * t[1], sc[2] * t[2]);
      this.si.push(w[0], w[2], 0, 0); this.sw.push(w[1], w[3], 0, 0);
    }
    for (let i = 0; i + 1 < R; i++) for (let j = 0; j < cols; j++) {
      const a = base + i * Cv + j, b = a + 1, c = a + Cv, d = c + 1, j2 = wrap ? (j + 1) % C : j + 1;
      const pa = P[i][j], pb = P[i][j2], pc = P[i + 1][j], pd = P[i + 1][j2];
      if (len(cross(sub(pb, pa), sub(pc, pa))) > 1e-10) this.idx.push(...(flip ? [a, c, b] : [a, b, c]));
      if (len(cross(sub(pd, pb), sub(pc, pb))) > 1e-10) this.idx.push(...(flip ? [b, c, d] : [b, d, c]));
    }
  }

  /** a rectangular flat or curved sheet: rows x cols points given row by row, one sided */
  sheet(P: V3[][], o: GridOpts): void { this.grid(P, o); }

  /** merge another builder's finished buffers */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si.map((x) => x), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    return g;
  }
}

// ---------------------------------------------------------------- shapes: rings, lofts, tubes

export interface RingY { y: number; rx: number; rz: number; cx?: number; cz?: number; /** superellipse exponent: 2 = ellipse, 4 = rounded box */ e?: number }
const spow = (x: number, p: number): number => Math.sign(x) * Math.abs(x) ** p;
/** points of a ring, starting at the front (-z) and running to +x */
export function ringPts(r: RingY, seg: number): V3[] {
  const out: V3[] = [], p = 2 / (r.e ?? 2);
  for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; out.push([(r.cx ?? 0) + r.rx * spow(Math.sin(a), p), r.y, (r.cz ?? 0) - r.rz * spow(Math.cos(a), p)]); }
  return out;
}
/** a closed or capped loft through rings (bottom to top). cap: a pole row at the centre of that end (lifted by `lift` for a dome) */
export function loftY(mb: MeshBuilder, rings: RingY[], seg: number, o: Omit<GridOpts, 'wrap'> & { capTop?: boolean; capBottom?: boolean; lift?: number; liftBottom?: number }): void {
  const P: V3[][] = rings.map((r) => ringPts(r, seg));
  if (o.capBottom) { const r = rings[0]; P.unshift(Array.from({ length: seg }, () => [r.cx ?? 0, r.y - (o.liftBottom ?? 0), r.cz ?? 0] as V3)); }
  if (o.capTop) { const r = rings[rings.length - 1]; P.push(Array.from({ length: seg }, () => [r.cx ?? 0, r.y + (o.lift ?? 0), r.cz ?? 0] as V3)); }
  const c = o.center ?? ((): V3 => { let s: V3 = [0, 0, 0], n = 0; for (const r of P) for (const p of r) { s = add(s, p); n++; } return mul(s, 1 / n); })();
  mb.grid(P, { ...o, wrap: true, center: c });
}

/** a tube along a path with an elliptical section (radius pairs per point); the ends can be closed to a point */
export function tube(mb: MeshBuilder, path: V3[], rad: (i: number, t: number) => [number, number], sides: number, o: Omit<GridOpts, 'wrap' | 'center'> & { capStart?: boolean; capEnd?: boolean; ref?: V3 }): void {
  const P: V3[][] = [], n = path.length;
  for (let i = 0; i < n; i++) {
    const T = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
    let ref: V3 = o.ref ?? [0, 1, 0]; if (Math.abs(dot(ref, T)) > 0.92) ref = [1, 0, 0];
    const u = norm(cross(ref, T)), v = cross(T, u), [r1, r2] = rad(i, i / Math.max(1, n - 1));
    const ring: V3[] = [];
    for (let j = 0; j < sides; j++) { const a = (j / sides) * Math.PI * 2; ring.push(add(path[i], add(mul(u, Math.cos(a) * r1), mul(v, Math.sin(a) * r2)))); }
    P.push(ring);
  }
  if (o.capStart) P.unshift(Array.from({ length: sides }, () => path[0]));
  if (o.capEnd) P.push(Array.from({ length: sides }, () => path[n - 1]));
  const centre = mul(path.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / n);
  mb.grid(P, { ...o, wrap: true, center: centre, uv: o.uv ?? ((i, j, R, C) => [j / (C - 1), i / (R - 1)]) });
}

// ---------------------------------------------------------------- rays against the dressed skin

/** triangles of a skin mesh inside a height band (and a vertex filter), for nearest-hit queries */
export class RayMesh {
  private t: Float64Array; readonly n: number;
  constructor(L: MhLod, y0: number, y1: number, keep?: (vertex: number) => boolean) {
    const p = L.position, out: number[] = [];
    for (let t = 0; t < L.index.length; t += 3) {
      const a = L.index[t], b = L.index[t + 1], c = L.index[t + 2];
      const ya = p[a * 3 + 1], yb = p[b * 3 + 1], yc = p[c * 3 + 1];
      if (Math.max(ya, yb, yc) < y0 || Math.min(ya, yb, yc) > y1) continue;
      if (keep && !(keep(a) && keep(b) && keep(c))) continue;
      out.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2], p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]);
    }
    this.t = Float64Array.from(out); this.n = out.length / 9;
  }
  /** nearest hit distance along a unit direction (Infinity when none) */
  hit(o: V3, d: V3, tmax = 2): number {
    const T = this.t; let best = tmax;
    for (let k = 0; k < this.n; k++) {
      const b = k * 9, e1x = T[b + 3], e1y = T[b + 4], e1z = T[b + 5], e2x = T[b + 6], e2y = T[b + 7], e2z = T[b + 8];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det, tx = o[0] - T[b], ty = o[1] - T[b + 1], tz = o[2] - T[b + 2];
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < best) best = t;
    }
    return best === tmax ? Infinity : best;
  }
  /** number of surface crossings along a ray (odd = the origin is inside a closed body) */
  crossings(o: V3, d: V3, tmax = 3): number {
    const T = this.t; let c = 0;
    for (let k = 0; k < this.n; k++) {
      const b = k * 9, e1x = T[b + 3], e1y = T[b + 4], e1z = T[b + 5], e2x = T[b + 6], e2y = T[b + 7], e2z = T[b + 8];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det, tx = o[0] - T[b], ty = o[1] - T[b + 1], tz = o[2] - T[b + 2];
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < tmax) c++;
    }
    return c;
  }
  /** distance from a point to the nearest triangle (brute force; for tests and tolerance checks) */
  distance(q: V3): number {
    const T = this.t; let best = Infinity;
    for (let k = 0; k < this.n; k++) {
      const b = k * 9, a: V3 = [T[b], T[b + 1], T[b + 2]], e1: V3 = [T[b + 3], T[b + 4], T[b + 5]], e2: V3 = [T[b + 6], T[b + 7], T[b + 8]];
      const ap = sub(q, a), d1 = dot(e1, ap), d2 = dot(e2, ap), e11 = dot(e1, e1), e22 = dot(e2, e2), e12 = dot(e1, e2), den = e11 * e22 - e12 * e12 || 1e-12;
      let u = (e22 * d1 - e12 * d2) / den, v = (e11 * d2 - e12 * d1) / den;
      if (u < 0 || v < 0 || u + v > 1) {
        // nearest on the three edges
        const seg = (p0: V3, dv: V3): number => { const t = clamp(dot(sub(q, p0), dv) / (dot(dv, dv) || 1e-12)); return len(sub(q, add(p0, mul(dv, t)))); };
        best = Math.min(best, seg(a, e1), seg(a, e2), seg(add(a, e1), sub(e2, e1)));
        continue;
      }
      u = clamp(u); v = clamp(v);
      best = Math.min(best, len(sub(q, add(a, add(mul(e1, u), mul(e2, v))))));
    }
    return best;
  }
}

// ---------------------------------------------------------------- the fitting context of one person

export interface Ctx {
  detail: Detail;
  spec: PedSpec;
  bt: BodyType;
  lm: MhShape['landmarks'];
  /** head height (chin to crown) */
  H: number;
  /** height of the head at fraction t (0 chin, 1 crown) */
  Y: (t: number) => number;
  /** centre of the skull */
  C: V3;
  rig: Record<string, number[]>;
  head: RayMesh;
  torso: RayMesh;
  skin: MhLod;
  /** ring of the dressed leg just above each ankle */
  ankle: Record<'L' | 'R', { cx: number; cz: number; rx: number; rz: number }>;
  seed: string;
  /** the number of columns round a head for caps (fewer at the mid LOD) */
  cols: number;
}
const W_TORSO = [2], W_HIPS = [1], W_ARMS = [4, 5, 6, 7], W_LEGS = [8, 9, 10, 11];
const wsumAt = (L: MhLod, i: number, set: readonly number[]): number => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };

/** `dressed` is the person's dressed hi skin in rest space (before the stoop lean); `rig` the joints of the body type */
export function makeCtx(shape: Pick<MhShape, 'landmarks' | 'headRings'>, spec: PedSpec, bt: BodyType, dressed: MhLod, rig: Record<string, number[]>, detail: Detail): Ctx {
  const lm = shape.landmarks, H = lm.crownY - lm.chinY, Y = (t: number): number => lm.chinY + t * H;
  const hr = shape.headRings, yc = Y(0.55);
  let cz = hr[0][2];
  for (let i = 1; i < hr.length; i++) if (hr[i][0] >= yc) { const a = hr[i - 1], b = hr[i], t = (yc - a[0]) / (b[0] - a[0] || 1); cz = a[2] + (b[2] - a[2]) * t; break; }
  const head = new RayMesh(dressed, lm.chinY - 0.12, lm.crownY + 0.02, (i) => wsumAt(dressed, i, [3]) > 0.5 || (dressed.position[i * 3 + 1] > lm.chinY - 0.05 && wsumAt(dressed, i, [3]) > 0.15));
  const torso = new RayMesh(dressed, lm.chinY - 0.5, lm.chinY + 0.02, (i) => wsumAt(dressed, i, W_ARMS) < 0.5);
  const ank = (side: 'L' | 'R'): { cx: number; cz: number; rx: number; rz: number } => {
    const a = rig['ankle' + side], anY = lm.ankleY;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < dressed.position.length / 3; i++) {
      const y = dressed.position[i * 3 + 1], x = dressed.position[i * 3];
      if (y > anY + 0.03 && y < anY + 0.075 && Math.abs(x - a[0]) < 0.07) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, dressed.position[i * 3 + 2]); z1 = Math.max(z1, dressed.position[i * 3 + 2]); }
    }
    return isFinite(x0) ? { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 } : { cx: a[0], cz: a[2], rx: 0.04, rz: 0.04 };
  };
  return { detail, spec, bt, lm, H, Y, C: [0, yc, cz], rig, head, torso, skin: dressed, ankle: { L: ank('L'), R: ank('R') }, seed: spec.id, cols: detail === 'hi' ? 18 : 10 };
}

/** unit direction from the head centre: theta from straight up, phi from the front (0) round towards +x */
export const dirOf = (theta: number, phi: number): V3 => [Math.sin(theta) * Math.sin(phi), Math.cos(theta), -Math.sin(theta) * Math.cos(phi)];
/** distance from the head centre to the skull surface along a direction */
export function skullR(ctx: Ctx, d: V3): number { const t = ctx.head.hit(ctx.C, d, 0.5); return isFinite(t) ? t : 0.09; }
/** half extents (x, z about the given centre) of the real head at height y by horizontal rays from the axis */
export function headRingAt(ctx: Ctx, y: number): { cx: number; cz: number; rx: number; rz: number } {
  const o: V3 = [0, y, ctx.C[2]], hx = (s: number): number => { const t = ctx.head.hit(o, [s, 0, 0], 0.4); return isFinite(t) ? t : 0.07; }, hz = (s: number): number => { const t = ctx.head.hit(o, [0, 0, s], 0.4); return isFinite(t) ? t : 0.09; };
  const xl = hx(-1), xr = hx(1), zf = hz(-1), zb = hz(1);
  return { cx: (xr - xl) / 2, cz: ctx.C[2] + (zb - zf) / 2, rx: (xl + xr) / 2, rz: (zf + zb) / 2 };
}
/** a ring that hugs the dressed torso (neck, shoulders, chest) at height y by horizontal rays, +off */
export function bodyRingAt(ctx: Ctx, y: number, off = 0, cz = ctx.C[2]): RingY {
  const o: V3 = [0, y, cz], h = (d: V3, fb: number): number => { const t = ctx.torso.hit(o, d, 0.6); return isFinite(t) ? t : fb; };
  const xl = h([-1, 0, 0], 0.1), xr = h([1, 0, 0], 0.1), zf = h([0, 0, -1], 0.08), zb = h([0, 0, 1], 0.08);
  return { y, rx: (xl + xr) / 2 + off, rz: (zf + zb) / 2 + off, cx: (xr - xl) / 2, cz: cz + (zb - zf) / 2 };
}
/** the point on the torso surface hit from a point outward along a direction, pushed out by off (falls back to the point) */
export function onTorso(ctx: Ctx, from: V3, dir: V3, off: number): V3 {
  const t = ctx.torso.hit(from, norm(dir), 0.8);
  return isFinite(t) ? add(from, mul(norm(dir), t + off)) : add(from, mul(norm(dir), 0.1 + off));
}

// ---------------------------------------------------------------- patches: a skin-hugging cap over the skull

export interface PatchOpts {
  /** axis of the patch (default straight up); azimuth 0 is the front for the up axis */
  axis?: V3;
  rows: number;
  cols?: number;
  /** polar angle (rad) of the rim at azimuth beta */
  rim: (beta: number) => number;
  /** polar angle of the inner boundary (default 0 = a pole); with an inner boundary the patch is an open band */
  inner?: (beta: number) => number;
  /** offset along the surface (m) at azimuth beta and u = 0 at the rim .. 1 at the pole */
  thick: (beta: number, u: number) => number;
  /** row spacing: u(i/(rows-1)) */
  ease?: (x: number) => number;
  smooth?: number;
  rect?: PxRect;
  shade?: (u: number, beta: number) => number;
  uvv?: [number, number];
  W?: Wfn;
  tint?: V3;
  /** skip rays: use this function for the surface distance instead (default: the skull) */
  radius?: (d: V3) => number;
  /** extra position tweak after the offset */
  post?: (p: V3, beta: number, u: number) => V3;
}
export function basisOf(axis: V3): { a: V3; u: V3; v: V3 } {
  const a = norm(axis);
  const front: V3 = Math.abs(a[2]) > 0.95 ? [0, 1, 0] : [0, 0, -1];
  const u = norm(sub(front, mul(a, dot(front, a)))), v = cross(a, u);
  return { a, u, v: mul(v, -1) };
}
/** a cap grid hugging the skull: rows from the rim (u 0) to the pole (u 1) round azimuth beta. Returns its triangle count */
export function patch(ctx: Ctx, mb: MeshBuilder, o: PatchOpts): void {
  const C = o.cols ?? ctx.cols, R = o.rows, B = basisOf(o.axis ?? [0, 1, 0]), ease = o.ease ?? ((x: number) => x);
  const dirAt = (al: number, be: number): V3 => add(mul(B.a, Math.cos(al)), mul(add(mul(B.u, Math.cos(be)), mul(B.v, Math.sin(be))), Math.sin(al)));
  const rad = o.radius ?? ((d: V3): number => skullR(ctx, d));
  const D: V3[][] = [], Rr: number[][] = [], Th: number[][] = [];
  const rimJ = Array.from({ length: C }, (_, j) => o.rim((j / C) * Math.PI * 2)), innerJ = Array.from({ length: C }, (_, j) => (o.inner ? o.inner((j / C) * Math.PI * 2) : 0));
  for (let i = 0; i < R; i++) {
    D.push([]); Rr.push([]); Th.push([]);
    for (let j = 0; j < C; j++) {
      const be = (j / C) * Math.PI * 2, u = ease(i / (R - 1)), al = rimJ[j] + (innerJ[j] - rimJ[j]) * u, d = dirAt(al, be);
      D[i].push(d); Rr[i].push(rad(d)); Th[i].push(o.thick(be, u));
    }
  }
  const raw = Rr.map((r) => [...r]);
  for (let it = 0; it < (o.smooth ?? 1); it++) {
    const nx = Rr.map((row, i) => row.map((r, j) => (i === R - 1 && !o.inner ? r : r * 0.5 + 0.25 * (row[(j + 1) % C] + row[(j + C - 1) % C]))));
    for (let i = 0; i < R; i++) Rr[i] = nx[i];
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) Rr[i][j] = Math.max(Rr[i][j], raw[i][j] * 0.998);
  const P: V3[][] = D.map((row, i) => row.map((d, j) => add(ctx.C, mul(d, Rr[i][j]))));
  // offset along the normal of the bare surface, so thickness reads as thickness on a slope too
  const { N } = gridNormals(P, true, ctx.C);
  const Q: V3[][] = P.map((row, i) => row.map((p, j) => {
    const be = (j / C) * Math.PI * 2, u = ease(i / (R - 1));
    let q = add(p, mul(N[i][j], Th[i][j]));
    if (o.post) q = o.post(q, be, u);
    return q;
  }));
  mb.grid(Q, { rect: o.rect ?? SWATCH.hair, wrap: true, center: ctx.C, W: o.W, tint: o.tint,
    uv: (i, j, RR, CC) => [j / (CC - 1), o.uvv ? lerp(o.uvv[0], o.uvv[1], i / (RR - 1)) : lerp(0.18, 0.85, i / (RR - 1))],
    shade: (i, j, _p) => (o.shade ? o.shade(ease(i / (R - 1)), (j / C) * Math.PI * 2) : 0.8 + 0.2 * sstep(0, 0.45, ease(i / (R - 1)))) });
}
/** polar angle of the rim at azimuth beta so that the rim lies at height y (found by a few ray casts) */
export function rimAtHeight(ctx: Ctx, y: number, beta: number): number {
  const cy = ctx.C[1];
  let th = Math.acos(clamp((y - cy) / 0.1, -0.99, 0.99));
  for (let k = 0; k < 3; k++) { const r = skullR(ctx, dirOf(th, beta)); th = Math.acos(clamp((y - cy) / r, -0.99, 0.99)); }
  return th;
}

/** how a finished piece reports itself */
export interface Piece { id: string; slot: 'hair' | 'hat' | 'accessory' | 'shoe' | 'bag'; geo: THREE.BufferGeometry; tris: number }
export function done(id: string, slot: Piece['slot'], mb: MeshBuilder): Piece { const geo = mb.build(); return { id, slot, geo, tris: mb.tris }; }

/** push a point out of the dressed torso (neck, shoulders, back) by a margin, along the horizontal line from the body axis */
export function clearBody(ctx: Ctx, p: V3, margin: number): V3 {
  if (p[1] > ctx.lm.chinY + 0.01) return p;
  const o: V3 = [0, p[1], ctx.C[2]], d: V3 = [p[0], 0, p[2] - o[2]], l = Math.hypot(d[0], d[2]);
  if (l < 1e-4) return p;
  const u: V3 = [d[0] / l, 0, d[2] / l], t = ctx.torso.hit(o, u, 0.8);
  if (!isFinite(t) || l >= t + margin) return p;
  return [o[0] + u[0] * (t + margin), p[1], o[2] + u[2] * (t + margin)];
}

/** like clearBody but for any height: pushes a point out of the head or the torso, radially from the vertical axis */
export function clearAny(ctx: Ctx, p: V3, margin: number): V3 {
  const o: V3 = [0, p[1], ctx.C[2]], dx = p[0], dz = p[2] - o[2], l = Math.hypot(dx, dz);
  if (l < 1e-4) return p;
  const u: V3 = [dx / l, 0, dz / l], t1 = ctx.head.hit(o, u, 0.8), t2 = ctx.torso.hit(o, u, 0.8), t = Math.max(isFinite(t1) ? t1 : 0, isFinite(t2) ? t2 : 0);
  if (t <= 0 || l >= t + margin) return p;
  return [o[0] + u[0] * (t + margin), p[1], o[2] + u[2] * (t + margin)];
}
