/**
 * Clothing, shoes, hair and beards made FROM THE BODY SURFACE. The body triangles are copied, CLIPPED along iso-lines of a scalar
 * field (a bone-weight sum, a height, a head-relative coordinate) so hems, collars, cuffs, hairlines and scarf openings are straight
 * lines or smooth curves instead of triangle-edge zig-zags, pushed out along the smooth normals by the garment's thickness, hung
 * (coats, hoodies and tops drop straight from the chest, trousers straight from the thigh), smoothed with a few Laplacian steps
 * (borders stay put), and closed with a rim of the garment's thickness. The shell keeps the body's bone weights and baked AO, so it
 * skins with the body. Shoes are real meshes (sneaker, boot, dress shoe, flat) that replace the foot below the ankle.
 * Everything merges into the person's single SkinnedMesh.
 */
import * as THREE from 'three';
import { HI_RECTS, type HiTile } from '@/textures/painters/pedHi';
import type { PedSpec, PxRect } from '@/textures/painters/ped';
import type { MhLod, MhShape } from './pedMesh';

const ATLAS = 512;
const TILES = Object.entries(HI_RECTS) as Array<[HiTile, PxRect]>;
export function tileOf(u: number, v: number): HiTile | null {
  const px = u * ATLAS, py = (1 - v) * ATLAS;
  for (const [n, r] of TILES) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return n;
  return null;
}
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

/** summed bone weight of a vertex over a set of rig bones */
export const wsum = (v: V, set: readonly number[]): number => { let s = 0; for (let k = 0; k < 4; k++) if (set.includes(v.j[k])) s += v.w[k]; return s; };
const B = { hips: [1], torso: [2], head: [3], armL: [4, 5], armR: [6, 7], arms: [4, 5, 6, 7], legs: [8, 9, 10, 11], upperBody: [1, 2, 4, 5, 6, 7], lower: [1, 8, 9, 10, 11] } as const;

// ---------------------------------------------------------------- shell: offset, hang, smooth, rim

interface ShellOpts {
  thick: (v: V) => number;
  /** adjust an offset position (hang) given its welded vertex */
  hang?: (p: V3, v: V) => void;
  iterations?: number;
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
  // the decimated mesh has irregular normals: smooth them first so the offset does not shear the texture sideways
  for (let it = 0; it < 6; it++) {
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
  const rim = o.rim ?? 0.004;
  for (let t = 0; t < tris.length; t++) for (let k = 0; k < 3; k++) {
    const a = corner[t * 3 + k], b = corner[t * 3 + (k + 1) % 3];
    if (edge.get(ek(a, b)) !== 1) continue;
    const c = corner[t * 3 + (k + 2) % 3];
    const ia: V3 = [Q[a][0] - FN[a][0] * rim, Q[a][1] - FN[a][1] * rim, Q[a][2] - FN[a][2] * rim], ib: V3 = [Q[b][0] - FN[b][0] * rim, Q[b][1] - FN[b][1] * rim, Q[b][2] - FN[b][2] * rim];
    // the rim faces away from the interior of the triangle (the direction from the edge towards the third vertex)
    const mx = (Q[a][0] + Q[b][0]) / 2, my = (Q[a][1] + Q[b][1]) / 2, mz = (Q[a][2] + Q[b][2]) / 2;
    const dx = Q[c][0] - mx, dy = Q[c][1] - my, dz = Q[c][2] - mz;
    const e = [Q[b][0] - Q[a][0], Q[b][1] - Q[a][1], Q[b][2] - Q[a][2]], d2 = [ia[0] - Q[a][0], ia[1] - Q[a][1], ia[2] - Q[a][2]];
    const nx = e[1] * d2[2] - e[2] * d2[1], ny = e[2] * d2[0] - e[0] * d2[2], nz = e[0] * d2[1] - e[1] * d2[0];
    const flip = nx * dx + ny * dy + nz * dz > 0;
    const L = Math.hypot(nx, ny, nz) || 1, rn: V3 = flip ? [-nx / L, -ny / L, -nz / L] : [nx / L, ny / L, nz / L];
    const va = tris[t][k], vb = tris[t][(k + 1) % 3];
    const quad: Array<[V3, V]> = flip ? [[Q[a], va], [ia, va], [ib, vb], [Q[a], va], [ib, vb], [Q[b], vb]] : [[Q[a], va], [ib, vb], [ia, va], [Q[a], va], [Q[b], vb], [ib, vb]];
    for (const [p, v] of quad) push(p, rn, v, o.uv ? o.uv(p, v) : undefined);
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

// ---------------------------------------------------------------- garments

type Ring = [number, number, number, number, number?];
function ringAt(rings: Ring[], y: number): { cx: number; cz: number; rx: number; rz: number } {
  if (y <= rings[0][0]) return { cx: rings[0][4] ?? 0, cz: rings[0][2], rx: rings[0][1], rz: rings[0][3] };
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
    const a = rings[i - 1], b = rings[i], t = (y - a[0]) / Math.max(1e-6, b[0] - a[0]);
    const l = (p: number, q: number): number => p + (q - p) * t;
    return { cx: l(a[4] ?? 0, b[4] ?? 0), cz: l(a[2], b[2]), rx: l(a[1], b[1]), rz: l(a[3], b[3]) };
  }
  const e = rings[rings.length - 1];
  return { cx: e[4] ?? 0, cz: e[2], rx: e[1], rz: e[3] };
}

// thickness (m): outerwear hangs off the body, shirts a little
const THICK_TOP: Partial<Record<PedSpec['top']['kind'], number>> = { puffer: 0.034, hoodie: 0.022, jacket: 0.02, cardigan: 0.018, uniform: 0.016, tracksuit: 0.014, vest: 0.014, apron: 0.012, jersey: 0.01, scrubs: 0.012, tee: 0.008, blouse: 0.008, dress: 0.008 };
/** how much of the chest width the garment keeps below the chest (0 = follows the waist, 1 = straight drop) */
const HANG_TOP: Partial<Record<PedSpec['top']['kind'], number>> = { puffer: 0.9, hoodie: 0.8, jacket: 0.75, cardigan: 0.7, uniform: 0.6, tracksuit: 0.6, vest: 0.5, apron: 0.7, jersey: 0.45, scrubs: 0.55, tee: 0.4, blouse: 0.55, dress: 0.5 };
const THICK_BOTTOM: Partial<Record<PedSpec['bottom']['kind'], number>> = { jeans: 0.012, trousers: 0.014, cargo: 0.02, sweats: 0.018, shorts: 0.012, leggings: 0.004 };
/** radius of the lower leg as a fraction of the thigh at the knee (a straight leg) */
const STRAIGHT: Partial<Record<PedSpec['bottom']['kind'], number>> = { jeans: 0.78, trousers: 0.86, cargo: 0.98, sweats: 0.92, shorts: 0.9 };

export interface Garments { parts: THREE.BufferGeometry[]; hide: Set<number> }

/** continuous cylindrical unwrap into a tile: u = angle round the part's axis (front at 0.5, one seam at the back), v = height between y0 and y1 */
function cyl(rect: PxRect, y0: number, y1: number, axis: (p: V3) => { cx: number; cz: number }): (p: V3) => [number, number] {
  return (p) => {
    const a0 = axis(p);
    let a = Math.atan2(p[0] - a0.cx, p[2] - a0.cz); if (a < 0) a += Math.PI * 2;
    return tileUV(rect, a / (Math.PI * 2), (p[1] - y0) / Math.max(1e-4, y1 - y0));
  };
}

export function garmentParts(s: MhShape, L: MhLod, ao: Float32Array, spec: PedSpec): Garments {
  const out: THREE.BufferGeometry[] = [], hide = new Set<number>();
  const lm = s.landmarks, R = s.rig;
  const kneeY = R.kneeL[1], elbowY = R.elbowL[1], wristY = R.wristL[1], shoulderY = R.shoulderL[1], neckBase = shoulderY + 0.04;
  const legRings = [...s.legRings.shin, ...s.legRings.thigh].sort((a, b) => a[0] - b[0]) as Ring[];
  const armRings = [...s.armRings.fore, ...s.armRings.upper].sort((a, b) => a[0] - b[0]) as Ring[];
  const tr = s.torsoRings as Ring[], hipsR = s.hipRings as Ring[];
  const torsoAxis = (p: V3): { cx: number; cz: number } => { const r = ringAt(p[1] > lm.hemY - 0.02 ? tr : hipsR, p[1]); return { cx: 0, cz: r.cz }; };
  const limbAxis = (rings: Ring[]) => (p: V3): { cx: number; cz: number } => { const r = ringAt(rings, p[1]); return { cx: (p[0] < 0 ? -1 : 1) * Math.abs(r.cx), cz: r.cz }; };
  const top = spec.top, tk = THICK_TOP[top.kind] ?? 0;
  const all = soupOf(L, ao);
  const emit = (tris: Tri[], o: ShellOpts): void => {
    const g = finalize(tris, o);
    if (g) out.push(g);
    for (const t of tris) { const id = wholeId(t); if (id !== undefined) hide.add(id); }
  };

  // ---- top: body, sleeves (upper arm, forearm) as separate shells with their own continuous unwraps
  if (tk > 0) {
    const long = !!top.long;
    const hem = long ? kneeY + 0.05 : lm.hemY - (['puffer', 'hoodie', 'jacket', 'cardigan'].includes(top.kind) ? 0.09 : top.kind === 'tee' || top.kind === 'blouse' ? 0.0 : 0.04);
    const wArm = (v: V): number => wsum(v, B.arms), wHead = (v: V): number => wsum(v, B.head), wLow = (v: V): number => wsum(v, B.legs);
    let body = clip(all, (v) => wsum(v, B.torso) + wsum(v, B.hips) + (long ? wLow(v) : 0) - wArm(v) - wHead(v) - (long ? 0 : wLow(v)));
    body = clip(body, (v) => v.p[1] - hem);
    if (long) body = clip(body, (v) => (v.p[2] < torsoAxis(v.p).cz && v.p[1] < lm.hemY + 0.08 ? Math.abs(v.p[0]) - 0.011 : 1));   // split at the front
    const chest = tr.slice(0, Math.max(2, Math.floor(tr.length * 0.8))).reduce((b, r) => (r[1] * r[3] > b[1] * b[3] ? r : b));
    const chestY = chest[0], a = HANG_TOP[top.kind] ?? 0.5;
    const flare = long ? 0.03 : top.kind === 'puffer' ? 0.01 : 0;
    emit(body, {
      thick: (v) => tk + (long ? flare * (1 - smooth(hem, lm.hemY, v.p[1])) : 0) + (top.kind === 'hoodie' && v.p[1] > shoulderY ? 0.012 : 0),
      hang: (p) => {
        if (p[1] >= chestY || p[1] < lm.hemY - 0.02) return;
        const r = ringAt(tr, p[1]), w = smooth(chestY, chestY - 0.1, p[1]) * a;
        const sx = 1 + Math.max(0, (chest[1] * 0.98) / Math.max(0.05, r.rx) - 1) * w, sz = 1 + Math.max(0, (chest[3] * 0.98) / Math.max(0.05, r.rz) - 1) * w;
        p[0] = r.cx + (p[0] - r.cx) * sx; p[2] = r.cz + (p[2] - r.cz) * sz;
      },
      iterations: 3, rim: Math.max(0.005, tk * 0.5), uv: cyl(HI_RECTS.torso, hem, neckBase, torsoAxis), tile: HI_RECTS.torso,
    });
    if (top.kind !== 'vest' && top.kind !== 'apron' && top.sleeves !== 'none') {
      const sleeveCut = top.sleeves === 'short' ? elbowY + (shoulderY - elbowY) * 0.42 : -9;
      const arm = clip(all, (v) => wArm(v) - wsum(v, B.torso) - wsum(v, B.hips) - wHead(v));
      const upper = clip(clip(arm, (v) => v.p[1] - Math.max(elbowY, sleeveCut)), (v) => v.p[1] < shoulderY + 0.08 ? 1 : -1);
      emit(upper, { thick: () => tk * 0.85, iterations: 3, rim: Math.max(0.004, tk * 0.4), uv: cyl(HI_RECTS.upperArm, elbowY, neckBase, limbAxis(armRings)), tile: HI_RECTS.upperArm });
      if (top.sleeves === 'long') {
        const fore = clip(clip(arm, (v) => elbowY - v.p[1]), (v) => v.p[1] - (wristY + 0.012));
        emit(fore, { thick: (v) => tk * 0.8 + (v.p[1] < wristY + 0.04 ? 0.003 : 0), iterations: 3, rim: 0.005, uv: cyl(HI_RECTS.foreArm, wristY, elbowY, limbAxis(armRings)), tile: HI_RECTS.foreArm });
      }
    }
  }

  // ---- trousers / shorts: straight from the hip and thigh; waist, thigh and shin shells with their own unwraps
  const bk = spec.bottom.kind, tb = THICK_BOTTOM[bk] ?? 0;
  if (tb > 0) {
    const waist = lm.hemY + 0.02, shortsEnd = kneeY + 0.1, cuff = lm.ankleY + (bk === 'shorts' ? 0 : 0.05), hipTop = R.hipL[1] + 0.02;
    const wL = (v: V): number => wsum(v, B.legs), wH = (v: V): number => wsum(v, B.hips) + wsum(v, B.torso);
    const straight = STRAIGHT[bk];
    const thighTop = ringAt(legRings, kneeY + 0.12), mid = Math.max(thighTop.rx, thighTop.rz);
    const thickOf = (v: V): number => tb + (bk === 'cargo' || bk === 'sweats' ? 0.006 * smooth(0.45, 0.05, v.p[1]) : 0) + (bk === 'trousers' ? 0.004 : 0);
    const hang = (p: V3, v: V): void => {
      if (!straight || wL(v) < 0.5 || p[1] > kneeY + 0.22) return;
      const r = ringAt(legRings, p[1]), cx = (p[0] < 0 ? -1 : 1) * Math.abs(r.cx);
      const target = mid * straight, cur = Math.max(r.rx, r.rz) || 0.04, w = smooth(kneeY + 0.22, kneeY, p[1]);
      const sc = 1 + Math.max(0, target / cur - 1) * Math.min(1, w + 0.4 * (p[1] < kneeY ? 1 : 0));
      p[0] = cx + (p[0] - cx) * sc; p[2] = r.cz + (p[2] - r.cz) * sc;
    };
    const covered = top.long && tk > 0;   // a long coat hides the hips and thighs
    if (!covered) {
      const pelvis = clip(clip(all, (v) => wH(v) - wL(v) - wsum(v, B.arms) - wsum(v, B.head)), (v) => waist - v.p[1]);
      emit(clip(pelvis, (v) => v.p[1] - (R.hipL[1] - 0.2)), { thick: thickOf, iterations: 3, rim: 0.006, uv: cyl(HI_RECTS.pelvis, R.hipL[1] - 0.2, waist, torsoAxis), tile: HI_RECTS.pelvis });
      const legs = clip(all, (v) => wL(v) - wH(v));
      const thigh = clip(clip(legs, (v) => v.p[1] - (bk === 'shorts' ? shortsEnd : kneeY)), (v) => hipTop - v.p[1] + 0.4);
      emit(thigh, { thick: thickOf, hang, iterations: 3, rim: 0.006, uv: cyl(HI_RECTS.thigh, kneeY, hipTop, limbAxis(legRings)), tile: HI_RECTS.thigh });
    }
    if (bk !== 'shorts') {
      const legs = clip(all, (v) => wL(v) - wH(v));
      const shin = clip(clip(legs, (v) => kneeY - v.p[1]), (v) => v.p[1] - cuff);
      emit(shin, { thick: thickOf, hang, iterations: 3, rim: 0.006, uv: cyl(HI_RECTS.shin, lm.ankleY + 0.03, kneeY, limbAxis(legRings)), tile: HI_RECTS.shin });
    }
  }
  return { parts: out, hide };
}

// ---------------------------------------------------------------- head: hair volume, beard, head scarf

export function headShell(s: MhShape, L: MhLod, ao: Float32Array, spec: PedSpec): THREE.BufferGeometry[] {
  const lm = s.landmarks, hh = lm.crownY - lm.chinY;
  const ring = s.headRings[Math.min(s.headRings.length - 1, Math.round(0.7 * (s.headRings.length - 1)))] as Ring;
  const zc = ring[2], rz = ring[3], rx = ring[1];
  const tOf = (y: number): number => (y - lm.chinY) / hh;
  const out: THREE.BufferGeometry[] = [];
  const all = soupOf(L, ao);
  const head = clip(all, (v) => wsum(v, B.head) - 0.55);
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
  const hatR = HI_RECTS.hat, hairR = HI_RECTS.hair;

  if (spec.hat === 'hijab') {
    // wraps hair, ears and neck, with a clean oval opening round the face, and drapes over the shoulders and chest
    const oval = (v: V): number => {
      const x = v.p[0] / (rx * 0.74), y = (tOf(v.p[1]) - 0.4) / 0.36, z = (zc - v.p[2]) / (rz * 0.2);
      return z < 0 ? 1 : Math.hypot(x, y) - 1;
    };
    fixSeam(finalize(clip(head, oval), { thick: () => 0.017, iterations: 3, rim: 0.007, uv: mapTo(hatR) }));
    const neckDrape = clip(all, (v) => wsum(v, [1, 2, 3]) - wsum(v, B.arms) - 0.5 + (v.p[1] > lm.chinY - 0.2 ? 0 : -9));
    const drape = clip(clip(neckDrape, (v) => v.p[1] - (s.rig.shoulderL[1] - 0.2)), (v) => (v.p[2] < zc - rz * 0.5 && v.p[1] > lm.chinY - 0.01 ? -1 : 1));
    const hatUV = (p: V3): [number, number] => { let a = Math.atan2(p[0], p[2] - zc); if (a < 0) a += Math.PI * 2; return tileUV(hatR, a / (Math.PI * 2), 0.3); };
    fixSeam(finalize(drape, { thick: (v) => 0.016 + 0.014 * smooth(lm.chinY, s.rig.shoulderL[1] - 0.2, v.p[1]) , iterations: 4, rim: 0.007, uv: hatUV }));
    return out;
  }

  // beard: a volume on the jaw and chin, open over the mouth
  if (spec.face.beard) {
    let beard = clip(head, (v) => 0.4 - tOf(v.p[1]));
    beard = clip(beard, (v) => zc - 0.005 - v.p[2]);
    beard = clip(beard, (v) => rx * 0.97 - Math.abs(v.p[0]));
    beard = clip(beard, (v) => Math.max(Math.abs(v.p[0]) - rx * 0.36, Math.max(0.12 - tOf(v.p[1]), tOf(v.p[1]) - 0.3)));
    fixSeam(finalize(beard, { thick: (v) => 0.013 + 0.012 * smooth(0.3, 0.05, tOf(v.p[1])), iterations: 3, rim: 0.005, uv: mapTo(hairR) }));
  }
  if (spec.hat !== 'none' || spec.hair === 'bald') return out;

  // hair: a close volume on the skull whose thickness fades to nothing at an irregular hairline (higher at the temples)
  const style = spec.hair, old = spec.age === 'old';
  if (style === 'afro') return out;
  const base = style === 'fade' ? 0.006 : style === 'curly' ? 0.026 : old ? 0.007 : style === 'puff' ? 0.012 : 0.016;
  const topT = style === 'fade' ? 0.8 : old ? 0.78 : 0.7, sideT = style === 'fade' ? 0.52 : old ? 0.55 : 0.4;
  const bump = (v: V): number => 0.018 * Math.sin(v.p[0] * 210 + 1.3) + 0.012 * Math.sin(v.p[0] * 470);
  const region = (v: V): number => {
    const t = tOf(v.p[1]), ax = Math.min(1, Math.abs(v.p[0]) / rx);
    const hairline = topT + 0.07 - 0.15 * ax * ax + bump(v);                      // forehead high in the middle, receding at the temples
    const back = Math.min(t - sideT, (v.p[2] - (zc + rz * (style === 'fade' ? 0.15 : -0.12))) * 14);
    return Math.max(t - hairline, back);
  };
  const noise = (v: V): number => (style === 'curly' ? 0.009 * Math.sin(v.p[0] * 260 + v.p[1] * 190) * Math.cos(v.p[2] * 230) : 0);
  const quiff = (v: V): number => (style === 'short' ? 0.012 * smooth(zc - rz * 0.1, zc - rz * 0.9, v.p[2]) * smooth(0.7, 0.95, tOf(v.p[1])) : 0);
  fixSeam(finalize(clip(head, region), { thick: (v) => (base + noise(v) + quiff(v)) * (0.12 + 0.88 * smooth(0, 0.1, region(v))), iterations: 3, rim: 0.003, uv: mapTo(hairR) }));
  return out;
}

// ---------------------------------------------------------------- shoes

type ShoeKind = 'sneaker' | 'boot' | 'dress' | 'flat';
const LEATHER = ['#161616', '#101010', '#3a2a1c', '#5b3a24', '#8a5a2a', '#8a6a2a', '#3a2a22', '#1c1c1c', '#0e0e0e', '#1a1a1e'];
export function shoeKind(spec: PedSpec): ShoeKind {
  if (spec.shoes.high) return 'boot';
  const leather = LEATHER.includes(spec.shoes.color) && spec.shoes.sole.toLowerCase() !== '#f4f4f4';
  if (leather) return spec.sex === 'f' ? 'flat' : 'dress';
  return 'sneaker';
}

/** shoe meshes for the foot below the ankle (the foot triangles are dropped from the body by the caller via `footTriangles`) */
export function shoeParts(s: MhShape, L: MhLod, spec: PedSpec): THREE.BufferGeometry[] {
  const inf = info(L), kind = shoeKind(spec), out: THREE.BufferGeometry[] = [];
  const stats = [0, 1].map(() => ({ x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, n: 0 }));
  for (let t = 0; t < inf.tile.length; t++) if (inf.tile[t] === 'shoe') {
    const a = L.index[t * 3], b = L.index[t * 3 + 1], c = L.index[t * 3 + 2];
    const st = stats[inf.cx[t] < 0 ? 0 : 1];
    for (const v of [a, b, c]) { st.x0 = Math.min(st.x0, L.position[v * 3]); st.x1 = Math.max(st.x1, L.position[v * 3]); st.z0 = Math.min(st.z0, L.position[v * 3 + 2]); st.z1 = Math.max(st.z1, L.position[v * 3 + 2]); }
    st.n++;
  }
  const rect = HI_RECTS.shoe, ankle = s.landmarks.ankleY;
  const P = { sneaker: { w: 1.28, toeH: 0.05, ankleH: ankle + 0.05, toe: 0.03, round: 3.2, sole: 0.22 }, boot: { w: 1.3, toeH: 0.052, ankleH: ankle + 0.13, toe: 0.03, round: 3.0, sole: 0.2 }, dress: { w: 1.1, toeH: 0.036, ankleH: ankle + 0.055, toe: 0.05, round: 2.6, sole: 0.24 }, flat: { w: 1.1, toeH: 0.026, ankleH: ankle + 0.04, toe: 0.04, round: 2.4, sole: 0.2 } }[kind];
  for (let side = 0; side < 2; side++) {
    const st = stats[side];
    if (!st.n) continue;
    const bone = side === 0 ? 9 : 11;
    const cx = (st.x0 + st.x1) / 2, W = (st.x1 - st.x0) * P.w, zHeel = st.z1 + 0.012, zToe = st.z0 - P.toe, len = zHeel - zToe;
    const S = 18, M = 16, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const zc = (st.z0 + st.z1) / 2 + 0.03, topY = P.ankleH;
    for (let i = 0; i <= S; i++) {
      const u = i / S;                                                  // 0 heel .. 1 toe
      const end = Math.sqrt(Math.max(0, 1 - Math.pow(1 - 2 * Math.min(u, 1 - u) * 0 - (u < 0.5 ? 1 - 2 * u : 2 * u - 1) * 0, 1)));
      const ends = Math.sqrt(Math.min(1, Math.min(u, 1 - u) / 0.07));
      void end;
      const w = W * (u > 0.55 ? 1 - Math.pow((u - 0.55) / 0.45, 2) * (kind === 'dress' ? 0.5 : 0.3) : 1) * ends * (u < 0.15 ? 0.88 + 0.12 * (u / 0.15) : 1);
      const h = (P.toeH + (topY - P.toeH) * smooth(0.7, 0.2, u)) * ends;
      const z = zHeel - u * len, x0 = cx + (u > 0.5 ? (side === 0 ? 1 : -1) * 0.004 * (u - 0.5) * 8 : 0);
      for (let m = 0; m < M; m++) {
        const phi = (m / M) * Math.PI * 2, c = Math.cos(phi), sn = Math.sin(phi), e = 2 / P.round;
        const x = x0 + (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e), y = h * (0.5 + 0.5 * Math.sign(sn) * Math.pow(Math.abs(sn), e));
        pos.push(x, y, z);
        let a = Math.atan2(x - cx, z - zc); if (a < 0) a += Math.PI * 2;
        const [tu, tv] = tileUV(rect, a / (Math.PI * 2), y / Math.max(0.04, topY) * (1 - P.sole * 0.0));
        uv.push(tu, tv);
      }
    }
    const row = M;
    for (let i = 0; i < S; i++) for (let m = 0; m < M; m++) { const a = i * row + m, b = i * row + (m + 1) % M, c = (i + 1) * row + m, d = (i + 1) * row + (m + 1) % M; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // outward winding: the middle ring's side normal must point away from the shoe's axis
    const mid = Math.floor(S / 2) * row, nn = g.getAttribute('normal'), pp = g.getAttribute('position');
    if ((pp.getX(mid) - cx) * nn.getX(mid) + (pp.getY(mid) - topY / 2) * nn.getY(mid) < 0) { const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t = ix.getY(i); ix.setY(i, ix.getZ(i)); ix.setZ(i, t); } g.computeVertexNormals(); }
    const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { si[k * 4] = bone; sw[k * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    out.push(g);
    void len;
  }
  return out;
}

interface Info { tile: HiTile[]; cx: Float32Array; cy: Float32Array; cz: Float32Array }
const infoCache = new WeakMap<MhLod, Info>();
export function info(L: MhLod): Info {
  let c = infoCache.get(L);
  if (c) return c;
  const n = L.index.length / 3, tile: HiTile[] = [], cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    const a = L.index[t * 3], b = L.index[t * 3 + 1], d = L.index[t * 3 + 2];
    tile.push(tileOf(L.uv[a * 2], L.uv[a * 2 + 1]) ?? 'torso');
    cx[t] = (L.position[a * 3] + L.position[b * 3] + L.position[d * 3]) / 3;
    cy[t] = (L.position[a * 3 + 1] + L.position[b * 3 + 1] + L.position[d * 3 + 1]) / 3;
    cz[t] = (L.position[a * 3 + 2] + L.position[b * 3 + 2] + L.position[d * 3 + 2]) / 3;
  }
  c = { tile, cx, cy, cz };
  infoCache.set(L, c);
  return c;
}
/** indices of the body triangles that are NOT foot (the shoes replace the foot) */
export function nonFootTriangles(L: MhLod, hide?: Set<number>): Uint32Array {
  const inf = info(L), keep: number[] = [];
  for (let t = 0; t < inf.tile.length; t++) if (inf.tile[t] !== 'shoe' && !hide?.has(t)) keep.push(L.index[t * 3], L.index[t * 3 + 1], L.index[t * 3 + 2]);
  return Uint32Array.from(keep);
}
