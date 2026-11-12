/**
 * Hair volume made FROM THE SKULL SURFACE (the only layered piece left; clothes, shoes and beards are painted into the skin's colour map,
 * see textures/painters/pedSkinPaint.ts). The head triangles are copied, CLIPPED along an irregular hairline, pushed out along the smooth
 * normals by the hair's thickness (fading to nothing at the hairline, so there is no edge), smoothed and merged into the person's mesh.
 */
import * as THREE from 'three';
import { SK_RECTS } from '@/textures/painters/pedSkinPaint';
import type { PedSpec, PxRect } from '@/textures/painters/ped';
import type { MhLod, MhShape } from './pedMesh';

const ATLAS = 512;
const tileUV = (r: PxRect, fu: number, ft: number): [number, number] => {
  const px = r.x + 0.5 + Math.min(1, Math.max(0, fu)) * (r.w - 1), py = r.y + 0.5 + (1 - Math.min(1, Math.max(0, ft))) * (r.h - 1);
  return [px / ATLAS, 1 - py / ATLAS];
};
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- triangle soup + clipping

type V3 = [number, number, number];
export interface V { p: V3; n: V3; uv: [number, number]; j: number[]; w: number[]; c: V3 }
export type Tri = [V, V, V];
/** triangles still whole (never cut) and their index in the body, to hide the body triangles a garment fully covers */
const WHOLE = new WeakMap<object, number>();

/** the body triangles (optionally only some) as a soup of shared vertices */
export function soupOf(L: MhLod, ao: Float32Array, only?: number[]): Tri[] {
  const cache = new Map<number, V>();
  const mk = (i: number): V => {
    let v = cache.get(i);
    if (!v) { v = { p: [L.position[i * 3], L.position[i * 3 + 1], L.position[i * 3 + 2]], n: [L.normal[i * 3], L.normal[i * 3 + 1], L.normal[i * 3 + 2]], uv: [L.uv[i * 2], L.uv[i * 2 + 1]], j: [L.joints[i * 4], L.joints[i * 4 + 1], L.joints[i * 4 + 2], L.joints[i * 4 + 3]], w: [L.weights[i * 4], L.weights[i * 4 + 1], L.weights[i * 4 + 2], L.weights[i * 4 + 3]], c: [ao[i * 3], ao[i * 3 + 1], ao[i * 3 + 2]] }; cache.set(i, v); }
    return v;
  };
  const out: Tri[] = [];
  const n = L.index.length / 3;
  const ids = only ?? Array.from({ length: n }, (_, t) => t);
  for (const t of ids) { const tri: Tri = [mk(L.index[t * 3]), mk(L.index[t * 3 + 1]), mk(L.index[t * 3 + 2])]; WHOLE.set(tri, t); out.push(tri); }
  return out;
}

function lerpV(a: V, b: V, t: number): V {
  const l = (x: number, y: number): number => x + (y - x) * t;
  const nn: V3 = [l(a.n[0], b.n[0]), l(a.n[1], b.n[1]), l(a.n[2], b.n[2])];
  const len = Math.hypot(nn[0], nn[1], nn[2]) || 1;
  const near = t < 0.5 ? a : b;
  return { p: [l(a.p[0], b.p[0]), l(a.p[1], b.p[1]), l(a.p[2], b.p[2])], n: [nn[0] / len, nn[1] / len, nn[2] / len], uv: [l(a.uv[0], b.uv[0]), l(a.uv[1], b.uv[1])], j: near.j, w: near.w, c: [l(a.c[0], b.c[0]), l(a.c[1], b.c[1]), l(a.c[2], b.c[2])] };
}

/** keep the part of the soup where f >= 0; triangles crossing the iso-line f = 0 are split exactly on it */
export const wholeId = (t: Tri): number | undefined => WHOLE.get(t);
export function clip(tris: Tri[], f: (v: V) => number): Tri[] {
  const out: Tri[] = [];
  const fc = new Map<V, number>();
  const F = (v: V): number => { let x = fc.get(v); if (x === undefined) { x = f(v); fc.set(v, x); } return x; };
  for (const tri of tris) {
    const fs = [F(tri[0]), F(tri[1]), F(tri[2])];
    const inside = (fs[0] >= 0 ? 1 : 0) + (fs[1] >= 0 ? 1 : 0) + (fs[2] >= 0 ? 1 : 0);
    if (inside === 3) { out.push(tri); continue; }
    if (inside === 0) continue;
    const poly: V[] = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], fa = fs[i], fb = fs[(i + 1) % 3];
      if (fa >= 0) poly.push(a);
      if ((fa >= 0) !== (fb >= 0)) poly.push(lerpV(a, b, fa / (fa - fb)));
    }
    for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0], poly[i], poly[i + 1]]);
  }
  return out;
}

/**
 * Laplacian smoothing of a scalar field over the soup's vertex graph: the decimated body has irregular bone weights, so an iso-line of
 * the raw field (collar, armhole, waist) zig-zags from triangle to triangle; smoothed, it is a clean curve. Vertices made later by
 * clipping fall back to the raw field.
 */
export function smoothField(tris: Tri[], f: (v: V) => number, iters = 4): (v: V) => number {
  const nb = new Map<V, Set<V>>(), val = new Map<V, number>();
  for (const t of tris) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set()); nb.get(a)!.add(b); nb.get(b)!.add(a); }
  for (const v of nb.keys()) val.set(v, f(v));
  for (let it = 0; it < iters; it++) {
    const next = new Map<V, number>();
    for (const [v, ns] of nb) { let s = 0; for (const n of ns) s += val.get(n)!; next.set(v, val.get(v)! * 0.5 + (s / Math.max(1, ns.size)) * 0.5); }
    for (const [v, x] of next) val.set(v, x);
  }
  return (v) => val.get(v) ?? f(v);
}

/** summed bone weight of a vertex over a set of rig bones */
export const wsum = (v: V, set: readonly number[]): number => { let s = 0; for (let k = 0; k < 4; k++) if (set.includes(v.j[k])) s += v.w[k]; return s; };
const B = { hips: [1], torso: [2], head: [3], armL: [4, 5], armR: [6, 7], arms: [4, 5, 6, 7], legs: [8, 9, 10, 11], upperBody: [1, 2, 4, 5, 6, 7], lower: [1, 8, 9, 10, 11] } as const;

// ---------------------------------------------------------------- shell: offset, hang, smooth, rim

interface ShellOpts {
  thick: (v: V) => number;
  /** adjust an offset position (hang) given its welded vertex */
  hang?: (p: V3, v: V) => void;
  iterations?: number;
  /** normal smoothing steps (bust and shoulders need many) */
  normalIters?: number;
  rim?: number;
  /** uv from the FINAL position of a corner (continuous unwrap); the tile rect lets the back seam be fixed per triangle */
  uv?: (p: V3, v: V) => [number, number];
  tile?: PxRect;
}

function finalize(tris: Tri[], o: ShellOpts): THREE.BufferGeometry | null {
  if (!tris.length) return null;
  const key = (p: V3): string => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
  const idOf = new Map<string, number>(), P: V3[] = [], N: V3[] = [], T: number[] = [], rep: V[] = [];
  const corner: number[] = [];
  for (const tri of tris) for (const v of tri) {
    const k = key(v.p);
    let i = idOf.get(k);
    if (i === undefined) { i = P.length; idOf.set(k, i); P.push([...v.p] as V3); N.push([0, 0, 0]); T.push(o.thick(v)); rep.push(v); }
    N[i][0] += v.n[0]; N[i][1] += v.n[1]; N[i][2] += v.n[2];
    corner.push(i);
  }
  for (const n of N) { const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l; }
  // borders: edges used by one triangle; neighbours
  const edge = new Map<string, number>(), nb: Array<Set<number>> = P.map(() => new Set<number>());
  const ek = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < tris.length; t++) for (let k = 0; k < 3; k++) {
    const a = corner[t * 3 + k], b = corner[t * 3 + (k + 1) % 3];
    edge.set(ek(a, b), (edge.get(ek(a, b)) ?? 0) + 1);
    nb[a].add(b); nb[b].add(a);
  }
  // no rim quads (they cost ~25 % of a garment's triangles): the shell tapers towards its border instead and ends on the skin
  const borderV = new Set<number>();
  for (const [k, c] of edge) if (c === 1) { const [a, b] = k.split('_').map(Number); borderV.add(a); borderV.add(b); }
  for (const i of borderV) T[i] = Math.max(0.0035, T[i] * 0.45);
  // the decimated mesh has irregular normals: smooth them first so the offset does not shear the texture sideways
  for (let it = 0; it < (o.normalIters ?? 6); it++) {
    const next = N.map((n, i) => {
      let x = n[0] * 2, y = n[1] * 2, z = n[2] * 2;
      for (const j of nb[i]) { x += N[j][0]; y += N[j][1]; z += N[j][2]; }
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l] as V3;
    });
    for (let i = 0; i < N.length; i++) N[i] = next[i];
  }
  const Q: V3[] = P.map((p, i) => [p[0] + N[i][0] * T[i], p[1] + N[i][1] * T[i], p[2] + N[i][2] * T[i]] as V3);
  if (o.hang) Q.forEach((q, i) => o.hang!(q, rep[i]));
  const border = new Set<number>();
  for (const [k, c] of edge) if (c === 1) { const [a, b] = k.split('_').map(Number); border.add(a); border.add(b); }
  for (let it = 0; it < Math.min(2, o.iterations ?? 2); it++) {
    const next = Q.map((q, i) => {
      if (border.has(i) || !nb[i].size) return q;
      let x = 0, y = 0, z = 0;
      for (const j of nb[i]) { x += Q[j][0]; y += Q[j][1]; z += Q[j][2]; }
      const c = nb[i].size;
      return [q[0] * 0.5 + (x / c) * 0.5, q[1] * 0.5 + (y / c) * 0.5, q[2] * 0.5 + (z / c) * 0.5] as V3;
    });
    for (let i = 0; i < Q.length; i++) Q[i] = next[i];
  }
  // smooth normals of the final surface
  const FN: V3[] = Q.map(() => [0, 0, 0] as V3);
  for (let t = 0; t < tris.length; t++) {
    const a = Q[corner[t * 3]], b = Q[corner[t * 3 + 1]], c = Q[corner[t * 3 + 2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const f = FN[corner[t * 3 + k]]; f[0] += nx; f[1] += ny; f[2] += nz; }
  }
  for (const f of FN) { const l = Math.hypot(f[0], f[1], f[2]) || 1; f[0] /= l; f[1] /= l; f[2] /= l; }
  // output (non indexed) + rim strips on the borders
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [], col: number[] = [];
  const push = (p: V3, n: V3, v: V, u?: [number, number]): void => {
    pos.push(...p); nrm.push(...n);
    const w = u ?? (o.uv ? o.uv(p, v) : v.uv); uv.push(w[0], w[1]);
    si.push(...v.j); sw.push(...v.w); col.push(...v.c);
  };
  for (let t = 0; t < tris.length; t++) {
    const us: Array<[number, number]> = [0, 1, 2].map((k) => (o.uv ? o.uv(Q[corner[t * 3 + k]], tris[t][k]) : tris[t][k].uv));
    if (o.uv && o.tile) {
      const fu = us.map((u) => (u[0] * ATLAS - o.tile!.x - 0.5) / (o.tile!.w - 1));
      if (Math.max(...fu) - Math.min(...fu) > 0.5) for (const u of us) u[0] = (o.tile.x + 0.5 + 0.01 * (o.tile.w - 1)) / ATLAS;   // crosses the back seam
    }
    for (let k = 0; k < 3; k++) { const i = corner[t * 3 + k]; push(Q[i], FN[i], tris[t][k], us[k]); }
  }
  const n = pos.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ---------------------------------------------------------------- head: hair volume, beard, head scarf

export function headShell(s: MhShape, L: MhLod, ao: Float32Array, spec: PedSpec): THREE.BufferGeometry[] {
  const lm = s.landmarks, hh = lm.crownY - lm.chinY;
  const ring = s.headRings[Math.min(s.headRings.length - 1, Math.round(0.7 * (s.headRings.length - 1)))] as number[];
  const zc = ring[2], rz = ring[3], rx = ring[1];
  const tOf = (y: number): number => (y - lm.chinY) / hh;
  const out: THREE.BufferGeometry[] = [];
  const all = soupOf(L, ao);
  const head = clip(all, smoothField(all, (v) => wsum(v, B.head) - 0.55, 2));
  const mapTo = (r: PxRect) => (p: V3): [number, number] => {
    let a = Math.atan2(p[0], p[2] - zc); if (a < 0) a += Math.PI * 2;
    return tileUV(r, a / (Math.PI * 2), tOf(p[1]) * 0.9 + 0.05);
  };
  const fixSeam = (g: THREE.BufferGeometry | null): void => {
    if (!g) return;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i + 2 < uv.count; i += 3) { const us = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)]; if (Math.max(...us) - Math.min(...us) > 0.12) for (let k = 0; k < 3; k++) uv.setX(i + k, Math.min(...us)); }
    out.push(g);
  };
  const hatR = SK_RECTS.hat, hairR = SK_RECTS.hair;

  if (spec.hat !== 'none' || spec.hair === 'bald') return out;

  // hair: a close volume on the skull whose thickness fades to nothing at an irregular hairline (higher at the temples)
  const style = spec.hair, old = spec.age === 'old';
  if (style === 'afro') return out;
  const base = style === 'fade' ? 0.006 : style === 'curly' ? 0.026 : old ? 0.007 : style === 'puff' ? 0.012 : 0.016;
  const topT = style === 'fade' ? 0.8 : old ? 0.78 : 0.7, sideT = style === 'fade' ? 0.52 : old ? 0.55 : 0.4;
  const bump = (v: V): number => 0.03 * Math.sin(v.p[0] * 160 + 1.3) + 0.018 * Math.sin(v.p[0] * 410 + 0.4) + (style === 'short' ? 0.05 * (v.p[0] / rx) : 0);   // irregular, a side part slants it
  const region = (v: V): number => {
    const t = tOf(v.p[1]), ax = Math.min(1, Math.abs(v.p[0]) / rx);
    const hairline = topT + 0.07 - (style === 'fade' ? 0.15 : 0.22) * ax * ax + bump(v);                      // forehead high in the middle, receding at the temples
    const back = Math.min(t - sideT, (v.p[2] - (zc + rz * (style === 'fade' ? 0.15 : -0.55))) * 14);          // sides reach the temples
    const nape = style === 'fade' || old ? -1 : Math.min(t - 0.27, (v.p[2] - (zc + rz * 0.3)) * 14);                  // and the nape
    return Math.max(t - hairline, back, nape);
  };
  const noise = (v: V): number => (style === 'curly' ? 0.009 * Math.sin(v.p[0] * 260 + v.p[1] * 190) * Math.cos(v.p[2] * 230) : 0);
  const quiff = (v: V): number => (style === 'short' ? 0.012 * smooth(zc - rz * 0.1, zc - rz * 0.9, v.p[2]) * smooth(0.7, 0.95, tOf(v.p[1])) : 0);
  fixSeam(finalize(clip(head, region), { thick: (v) => (base + noise(v) + quiff(v)) * (0.12 + 0.88 * smooth(0, 0.1, region(v))), iterations: 3, rim: 0.003, uv: mapTo(hairR) }));
  return out;
}

