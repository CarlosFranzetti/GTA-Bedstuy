/**
 * Heads for the MakeHuman people (Ines Loft, HEADS lane): the face as real geometry.
 *
 * The shipped glbs carry a MakeHuman head (brow ridge, eye sockets, nose, lips, jaw, ears) simplified with most of its triangles on the
 * face (scripts/people-pipeline.mjs). The macro targets give each population group and sex a base structure; this module adds the rest of
 * what makes faces differ: a per-person set of FACE TRAITS (jaw, chin, nose, brow, cheeks, lips, eye spacing, ears, head proportions),
 * applied at load as smooth displacement fields on the head vertices. Zero bytes of new mesh data, deterministic per person id, and the
 * painted face (pedFace.ts) is attached by UV so every painted feature travels with the surface it belongs to.
 *
 * Traits are drawn from the same ranges for every population group: the group only sets the base structure through the blend of
 * MakeHuman's macro targets; nothing here pushes a group toward a type. Age and sex shift the ranges a little (older faces get a longer,
 * softer nose and jaw; stronger brow and jaw on average for men, fuller lips on average for women), and every person is an individual.
 */
import * as THREE from 'three';
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec, PxRect } from '@/textures/painters/ped';
import { HI_RECTS } from '@/textures/painters/pedHi';
import { peopleMode } from '@/textures/painters/pedMode';
import { bodyTypeOf } from './pedBodyTypes';
import { clip, smoothField, soupOf, wsum, type Tri, type V } from './pedGarments';

const HEAD_BONE = 3;
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
const gauss = (d: number, w: number): number => Math.exp(-(d / w) * (d / w));
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** deterministic number in [-1, 1] with a bell-ish shape (sum of two uniforms) for a person and a trait name */
function bell(id: string, trait: string): number {
  const a = (hash(`${id}:${trait}:a`) % 10007) / 10007, b = (hash(`${id}:${trait}:b`) % 10009) / 10009;
  return a + b - 1;
}

export interface FaceTraits {
  /** relative width of the jaw / lower face (1 = shipped shape) */ jawW: number;
  /** chin: forward and down in metres */ chinFwd: number; chinDrop: number;
  /** nose: tip forward, tip down (droop), alar width scale, bridge raised, length (tip to base) in metres / ratio */ noseFwd: number; noseDrop: number; noseW: number; bridge: number;
  /** brow ridge forward (m) */ brow: number;
  /** cheekbone / cheek fullness outward (m) */ cheek: number;
  /** lip fullness (m forward) */ lips: number;
  /** eye spacing scale (1 = shipped) */ eyeGap: number;
  /** ear scale */ ear: number;
  /** head width, depth and height scale */ headW: number; headL: number; headH: number;
  /** forehead height (m the hairline and brow move apart) and slope */ foreheadSlope: number;
}

/** The person's face traits, from their id, sex and age. Plain numbers so tests and the painter can read them. */
export function faceTraits(spec: PedSpec): FaceTraits {
  const id = spec.id, b = (t: string): number => bell(id, t);
  const male = spec.sex === 'm', female = spec.sex === 'f', old = spec.age === 'old', young = spec.age === 'kid' || spec.age === 'teen';
  const sx = male ? 1 : female ? -1 : 0;
  return {
    jawW: 1 + 0.085 * b('jaw') + 0.025 * sx - (old ? 0.02 : 0),
    chinFwd: 0.0085 * b('chinf') + 0.003 * sx,
    chinDrop: 0.0075 * b('chind') + 0.002 * sx,
    noseFwd: (0.0085 * b('nosef') + (old ? 0.004 : 0)) * (young ? 0.6 : 1),
    noseDrop: 0.004 * b('nosed') + (old ? 0.006 : 0),
    noseW: 1 + 0.12 * b('nosew'),
    bridge: 0.0055 * b('bridge'),
    brow: 0.0045 * b('brow') + 0.0025 * sx,
    cheek: 0.0065 * b('cheek') - (old ? 0.002 : 0),
    lips: 0.0045 * b('lips') - 0.0018 * sx + (old ? -0.002 : 0),
    eyeGap: 1 + 0.07 * b('eyegap'),
    ear: 1 + 0.16 * b('ear') + (old ? 0.1 : 0),
    headW: 1 + 0.035 * b('hw'),
    headL: 1 + 0.035 * b('hl'),
    headH: 1 + 0.03 * b('hh'),
    foreheadSlope: 0.006 * b('fs'),
  };
}

export interface HeadFrame {
  chinY: number; crownY: number; eyeY: number; eyeX: number;
  /** z of the face plane (front is -z) and of the middle of the head */
  frontZ: number; midZ: number;
  noseTipY: number; noseBaseY: number; mouthY: number; browY: number;
}

/** Positions of the face features on this shape, from its landmarks and rings (the same fractions the face painter and the pipeline use). */
export function headFrame(s: MhShape): HeadFrame {
  const lm = s.landmarks, D = lm.eyeY - lm.chinY;
  const eyeRing = s.headRings.reduce((b, r) => (Math.abs(r[0] - lm.eyeY) < Math.abs(b[0] - lm.eyeY) ? r : b));
  return {
    chinY: lm.chinY, crownY: lm.crownY, eyeY: lm.eyeY, eyeX: lm.eyeX,
    frontZ: eyeRing[2] - eyeRing[3], midZ: eyeRing[2],
    noseTipY: lm.chinY + 0.66 * D, noseBaseY: lm.chinY + 0.58 * D, mouthY: lm.chinY + 0.38 * D, browY: lm.eyeY + 0.2 * D,
  };
}

/** area weighted vertex normals, vertices at the same position share one (the UV tile borders duplicate them) */
function weld(pos: Float32Array, idx: Uint32Array): Float32Array {
  const acc = new Map<string, number[]>(), keys: string[] = [];
  const key = (i: number): string => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  for (let i = 0; i < pos.length / 3; i++) { const k = key(i); keys.push(k); if (!acc.has(k)) acc.set(k, [0, 0, 0]); }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const s = acc.get(keys[idx[t + k]])!; s[0] += nx; s[1] += ny; s[2] += nz; }
  }
  const out = new Float32Array(pos.length);
  keys.forEach((k, i) => { const s = acc.get(k)!, l = Math.hypot(s[0], s[1], s[2]) || 1; out[i * 3] = s[0] / l; out[i * 3 + 1] = s[1] / l; out[i * 3 + 2] = s[2] / l; });
  return out;
}

/** weight of the head bone on vertex i */
const headW = (L: MhLod, i: number): number => { let t = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] === HEAD_BONE) t += L.weights[i * 4 + k]; return t; };

/**
 * Displace the head vertices of a LOD by the person's face traits. The displacement is a function of position only (so vertices
 * duplicated for UV borders stay together), fades out over the neck by the head bone weight, and keeps the crown, ears and back of
 * the skull smooth. Returns the LOD unchanged for `far`.
 */
export function faceMorph(s: MhShape, spec: PedSpec, L: MhLod, tr: FaceTraits = faceTraits(spec)): MhLod {
  const f = headFrame(s), n = L.position.length / 3, pos = new Float32Array(L.position);
  const D = f.eyeY - f.chinY, H = f.crownY - f.chinY;
  const headMidY = f.chinY + H * 0.5;
  for (let i = 0; i < n; i++) {
    const hw = sstep(0.3, 0.85, headW(L, i));
    if (hw <= 0) continue;
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
    const front = sstep(f.midZ - 0.01, f.frontZ + 0.02, z);                 // 1 on the face plane, 0 behind the middle of the head
    const nv = (y - f.chinY) / D;                                            // 0 at the chin, 1 at the eyes, > 1 the brow and forehead
    let dx = 0, dy = 0, dz = 0;
    // jaw and lower face: the width fades in from the eyes down to the angle of the jaw
    dx += x * (tr.jawW - 1) * sstep(1.15, 0.15, nv);
    // chin: forward and down
    const chinG = gauss(y - (f.chinY + 0.012), 0.022) * gauss(ax, 0.034) * front;
    dz -= tr.chinFwd * chinG; dy -= tr.chinDrop * chinG;
    // nose: tip forward and drooping, wings wider, bridge raised
    const tipG = gauss(y - f.noseTipY, 0.02) * gauss(ax, 0.017) * front;
    dz -= tr.noseFwd * tipG; dy -= tr.noseDrop * tipG * 0.7;
    const wingG = gauss(y - f.noseBaseY, 0.017) * gauss(ax - 0.02, 0.014) * front;
    dx += sgn * (tr.noseW - 1) * 0.02 * wingG;
    dz -= tr.bridge * gauss(y - (f.eyeY - 0.012), 0.022) * gauss(ax, 0.011) * front;
    // brow ridge
    dz -= tr.brow * gauss(y - f.browY, 0.014) * sstep(0.075, 0.015, ax) * front;
    dy += tr.foreheadSlope * 0.5 * sstep(f.eyeY + 0.03, f.eyeY + 0.09, y) * front;
    dz += tr.foreheadSlope * sstep(f.eyeY + 0.03, f.eyeY + 0.09, y) * front;
    // cheeks: bone and fullness, out and a little forward
    const chG = gauss(y - (f.eyeY - 0.045), 0.03) * gauss(ax - 0.058, 0.026) * front;
    dx += sgn * tr.cheek * chG; dz -= tr.cheek * 0.5 * chG;
    // lips
    dz -= tr.lips * gauss(y - f.mouthY, 0.011) * gauss(ax, 0.026) * front;
    // eye spacing: scale x about the face centre round the eyes
    dx += x * (tr.eyeGap - 1) * gauss(y - f.eyeY, 0.032) * sstep(0.06, 0.02, ax) * front;
    // ears: the vertices beside the head, scaled about the ear root
    const earG = sstep(0.068, 0.082, ax) * gauss(y - (f.chinY + 0.55 * D), 0.034) * (1 - front);
    dx += sgn * (tr.ear - 1) * 0.012 * earG; dy += (tr.ear - 1) * (y - (f.chinY + 0.55 * D)) * 0.5 * earG;
    // overall head proportions, about the middle of the head
    dx += x * (tr.headW - 1) * sstep(f.chinY - 0.02, f.chinY + 0.1, y);
    dz += (z - f.midZ) * (tr.headL - 1);
    dy += (y - headMidY) * (tr.headH - 1) * sstep(f.chinY + 0.02, f.chinY + 0.12, y);
    pos[i * 3] = x + dx * hw; pos[i * 3 + 1] = y + dy * hw; pos[i * 3 + 2] = z + dz * hw;
  }
  return { ...L, position: pos, normal: weld(pos, L.index) };
}

/** how the head as a whole was scaled by faceMorph (hair and hats are fitted on top of it) */
export function headScale(tr: FaceTraits): { x: number; z: number; y: number } { return { x: tr.headW, z: tr.headL, y: tr.headH }; }

// ================================================================ hair, hats and beards on the real scalp


type P3 = [number, number, number];
const ATLAS = 512;
const tileUV = (r: PxRect, fu: number, ft: number): [number, number] => {
  const px = r.x + 0.5 + Math.min(1, Math.max(0, fu)) * (r.w - 1), py = r.y + 0.5 + (1 - Math.min(1, Math.max(0, ft))) * (r.h - 1);
  return [px / ATLAS, 1 - py / ATLAS];
};
const smooth = sstep;

interface ShellOpts {
  thick: (v: V) => number;
  uv: (p: P3, v: V) => [number, number];
  /** smoothing steps of the normals the shell is pushed along (more = rounder volume) */
  normalIters?: number;
  /** Laplacian steps on the final surface */
  iterations?: number;
  /** the border thins to this fraction of its thickness so the shell ends on the skin */
  taper?: number;
  tile?: PxRect;
}

/** A volume made from a patch of the body surface: pushed out along smoothed normals by a thickness field, smoothed, UVs from the final position. */
export function scalpShell(tris: Tri[], o: ShellOpts): THREE.BufferGeometry | null {
  if (!tris.length) return null;
  const key = (p: P3): string => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
  const idOf = new Map<string, number>(), P: P3[] = [], N: P3[] = [], T: number[] = [], rep: V[] = [], corner: number[] = [];
  for (const tri of tris) for (const v of tri) {
    const k = key(v.p);
    let i = idOf.get(k);
    if (i === undefined) { i = P.length; idOf.set(k, i); P.push([...v.p] as P3); N.push([0, 0, 0]); T.push(o.thick(v)); rep.push(v); }
    N[i][0] += v.n[0]; N[i][1] += v.n[1]; N[i][2] += v.n[2];
    corner.push(i);
  }
  for (const n of N) { const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l; }
  const edge = new Map<string, number>(), nb: Array<Set<number>> = P.map(() => new Set<number>());
  const ek = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < tris.length; t++) for (let k = 0; k < 3; k++) {
    const a = corner[t * 3 + k], b = corner[t * 3 + (k + 1) % 3];
    edge.set(ek(a, b), (edge.get(ek(a, b)) ?? 0) + 1);
    nb[a].add(b); nb[b].add(a);
  }
  const border = new Set<number>();
  for (const [k, c] of edge) if (c === 1) { const [a, b] = k.split('_').map(Number); border.add(a); border.add(b); }
  for (const i of border) T[i] = Math.max(0.0025, T[i] * (o.taper ?? 0.4));
  for (let it = 0; it < (o.normalIters ?? 6); it++) {
    const next = N.map((n, i) => {
      let x = n[0] * 2, y = n[1] * 2, z = n[2] * 2;
      for (const j of nb[i]) { x += N[j][0]; y += N[j][1]; z += N[j][2]; }
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l] as P3;
    });
    for (let i = 0; i < N.length; i++) N[i] = next[i];
  }
  let Q: P3[] = P.map((p, i) => [p[0] + N[i][0] * T[i], p[1] + N[i][1] * T[i], p[2] + N[i][2] * T[i]] as P3);
  for (let it = 0; it < (o.iterations ?? 2); it++) {
    Q = Q.map((q, i) => {
      if (border.has(i) || !nb[i].size) return q;
      let x = 0, y = 0, z = 0;
      for (const j of nb[i]) { x += Q[j][0]; y += Q[j][1]; z += Q[j][2]; }
      const c = nb[i].size;
      return [q[0] * 0.5 + (x / c) * 0.5, q[1] * 0.5 + (y / c) * 0.5, q[2] * 0.5 + (z / c) * 0.5] as P3;
    });
  }
  const FN: P3[] = Q.map(() => [0, 0, 0] as P3);
  for (let t = 0; t < tris.length; t++) {
    const a = Q[corner[t * 3]], b = Q[corner[t * 3 + 1]], c = Q[corner[t * 3 + 2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const f = FN[corner[t * 3 + k]]; f[0] += nx; f[1] += ny; f[2] += nz; }
  }
  for (const f of FN) { const l = Math.hypot(f[0], f[1], f[2]) || 1; f[0] /= l; f[1] /= l; f[2] /= l; }
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [], col: number[] = [];
  for (let t = 0; t < tris.length; t++) {
    const us: Array<[number, number]> = [0, 1, 2].map((k) => o.uv(Q[corner[t * 3 + k]], tris[t][k]));
    if (o.tile) {
      const fu = us.map((u) => (u[0] * ATLAS - o.tile!.x - 0.5) / (o.tile!.w - 1));
      if (Math.max(...fu) - Math.min(...fu) > 0.5) for (const u of us) u[0] = (o.tile.x + 0.5 + 0.01 * (o.tile.w - 1)) / ATLAS;   // crosses the back seam
    }
    for (let k = 0; k < 3; k++) {
      const i = corner[t * 3 + k], v = tris[t][k];
      pos.push(...Q[i]); nrm.push(...FN[i]); uv.push(us[k][0], us[k][1]); si.push(...v.j); sw.push(...v.w); col.push(...v.c);
    }
  }
  const n = pos.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Smooth round parts (a bun, a hat brim, a strand) lofted from elliptical rings; everything is skinned to the head bone. */
interface Ring { y: number; rx: number; rz: number; cx?: number; cz?: number }
function loft(rings: Ring[], seg: number, rect: PxRect, cap: 'top' | 'bottom' | 'both' | 'none' = 'none'): THREE.BufferGeometry {
  const rs = [...rings].sort((a, b) => a.y - b.y);
  const ymin = rs[0].y, dy = Math.max(1e-6, rs[rs.length - 1].y - ymin);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const uvAt = (fu: number, ft: number): void => { const px = rect.x + 0.5 + fu * (rect.w - 1), py = rect.y + 0.5 + (1 - ft) * (rect.h - 1); uv.push(px / ATLAS, 1 - py / ATLAS); };
  for (const r of rs) for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    pos.push((r.cx ?? 0) + r.rx * Math.sin(a), r.y, (r.cz ?? 0) + r.rz * Math.cos(a));
    uvAt(j / seg, (r.y - ymin) / dy);
  }
  const row = seg + 1;
  for (let i = 0; i + 1 < rs.length; i++) for (let j = 0; j < seg; j++) { const a = i * row + j, b = a + 1, c = a + row, d = c + 1; idx.push(a, b, c, b, d, c); }
  const addCap = (ri: number, up: boolean): void => {
    const base = pos.length / 3, r = rs[ri];
    pos.push(r.cx ?? 0, r.y, r.cz ?? 0); uvAt(0.5, (r.y - ymin) / dy);
    for (let j = 0; j < seg; j++) { const a = ri * row + j, b = a + 1; if (up) idx.push(base, a, b); else idx.push(base, b, a); }
  };
  if (cap === 'top' || cap === 'both') addCap(rs.length - 1, true);
  if (cap === 'bottom' || cap === 'both') addCap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) { si[k * 4] = HEAD_BONE; sw[k * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const nn = g.getAttribute('normal'), mid = Math.floor(rs.length / 2) * row, r0 = rs[Math.floor(rs.length / 2)];
  if ((pos[mid * 3] - (r0.cx ?? 0)) * nn.getX(mid) + (pos[mid * 3 + 2] - (r0.cz ?? 0)) * nn.getZ(mid) < 0) {
    const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t = ix.getY(i); ix.setY(i, ix.getZ(i)); ix.setZ(i, t); }
    g.computeVertexNormals();
  }
  return g;
}

/** the measured head after the face morph: the scalp patch of the body surface and its rings */
interface Scalp {
  head: Tri[]; chinY: number; crownY: number; H: number; zc: number; rx: number; rz: number; all: Tri[];
  tOf: (y: number) => number; ringAt: (t: number) => { rx: number; rz: number; cz: number };
}
function scalpOf(s: MhShape, L: MhLod, ao: Float32Array): Scalp {
  const all = soupOf(L, ao);
  const head = clip(all, smoothField(all, (v) => wsum(v, [HEAD_BONE]) - 0.55, 2));
  const chinY = s.landmarks.chinY;
  let top = -Infinity; for (const t of head) for (const v of t) top = Math.max(top, v.p[1]);
  const H = top - chinY;
  const tOf = (y: number): number => (y - chinY) / H;
  const sample = (t: number): { rx: number; rz: number; cz: number } => {
    let x1 = -Infinity, z0 = Infinity, z1 = -Infinity, c = 0;
    const y = chinY + t * H, band = 0.012;
    for (const tri of head) for (const v of tri) if (Math.abs(v.p[1] - y) < band) { x1 = Math.max(x1, Math.abs(v.p[0])); z0 = Math.min(z0, v.p[2]); z1 = Math.max(z1, v.p[2]); c++; }
    return c ? { rx: x1, rz: (z1 - z0) / 2, cz: (z0 + z1) / 2 } : { rx: 0.075, rz: 0.1, cz: -0.06 };
  };
  const samples: Array<{ rx: number; rz: number; cz: number }> = [];
  for (let i = 0; i <= 24; i++) samples.push(sample(0.05 + 0.95 * (i / 24) * 0.97));
  const ringAt = (t: number): { rx: number; rz: number; cz: number } => {
    const u = Math.min(23.999, Math.max(0, ((t - 0.05) / (0.95 * 0.97)) * 24)), i = Math.floor(u), f = u - i, a = samples[i], b = samples[i + 1];
    return { rx: a.rx + (b.rx - a.rx) * f, rz: a.rz + (b.rz - a.rz) * f, cz: a.cz + (b.cz - a.cz) * f };
  };
  const r7 = ringAt(0.7);
  return { head, all, chinY, crownY: top, H, zc: r7.cz, rx: r7.rx, rz: r7.rz, tOf, ringAt };
}

// ---------------------------------------------------------------- the gear

/**
 * Hair, hats, scarves, beard and headphones for one person at the hi or mid level, as parts to merge into the body geometry.
 * `L` is the (face-morphed, dressed) LOD the person is made from; hair and caps are shells cut from its scalp, so they sit on the head
 * whatever its shape; round or brimmed things (buns, brims, locs, the hijab drape) are lofted from rings measured on that same head.
 */
export function headGear(s: MhShape, L: MhLod, ao: Float32Array, spec: PedSpec, detail: 'hi' | 'mid'): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const sc = scalpOf(s, L, ao), { head, zc, rx, rz, tOf } = sc, hi = detail === 'hi';
  const hairR = HI_RECTS.hair, hatR = HI_RECTS.hat;
  const lm = s.landmarks, Hh = sc.crownY - lm.chinY, Y = (t: number): number => lm.chinY + t * Hh;
  const hr = (y: number): { rx: number; rz: number; cz: number } => sc.ringAt(Math.min(0.99, Math.max(0.05, tOf(y))));
  const seg = hi ? 18 : 10;
  const id = spec.id;
  const rand = (salt: string): number => (hash(id + salt) % 10000) / 10000;
  const covered = spec.hat !== 'none', hijab = spec.hat === 'hijab';
  const mapTo = (r: PxRect) => (p: P3): [number, number] => {
    let a = Math.atan2(p[0], p[2] - zc); if (a < 0) a += Math.PI * 2;
    return tileUV(r, a / (Math.PI * 2), tOf(p[1]) * 0.9 + 0.05);
  };
  const add = (g: THREE.BufferGeometry | null): void => { if (g) out.push(g); };
  const shell = (region: (v: V) => number, thick: (v: V) => number, rect: PxRect, o: Partial<ShellOpts> = {}): void => {
    add(scalpShell(clip(head, region), { thick, uv: mapTo(rect), tile: rect, ...o }));
  };
  const q = (v: V): number => (v.p[2] - zc) / rz;                     // -1 on the face, +1 at the back of the head
  const ax = (v: V): number => Math.min(1, Math.abs(v.p[0]) / rx);   // 0 on the midline, 1 at the temples
  const ball = (cx: number, y: number, cz: number, rr: number, rect: PxRect, squash = 1, lumpy = 0.035): void => {
    const n = hi ? 9 : 5, rings: Ring[] = [];
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI, k = Math.max(0.12, Math.cos(a)), lump = 1 + (hi ? lumpy * Math.sin(i * 2.3 + cx * 90) : 0);
      rings.push({ y: y + Math.sin(a) * rr * squash, rx: rr * k * lump, rz: rr * k * lump, cx, cz });
    }
    out.push(loft(rings, hi ? 18 : 10, rect, 'both'));
  };
  const top = hr(Y(0.9)), backZ = top.cz + top.rz;
  const sex = spec.sex ?? 'm', old = spec.age === 'old', style = spec.hair;
  const personal = rand(':hl');                                       // a little personal variation of the hairline

  // ---- hair
  if (!covered && style !== 'bald') {
    const shortLike = ['short', 'fade', 'curly', 'puff', 'bun', 'long', 'braids', 'locs', 'peyot', 'waves', 'crop', 'bob', 'ponytail', 'thinning', 'twists'].includes(style);
    if (style === 'afro') {
      const hairline = (v: V): number => 0.8 + 0.02 * personal - 0.24 * ax(v) * ax(v);
      const region = (v: V): number => Math.max(tOf(v.p[1]) - hairline(v), Math.min(tOf(v.p[1]) - 0.44, (v.p[2] - (zc - rz * 0.8)) * 14), Math.min(tOf(v.p[1]) - 0.3, (v.p[2] - (zc + rz * 0.1)) * 14));
      shell(region, (v) => (0.012 + 0.052 * smooth(0.42, 0.8, tOf(v.p[1]))) * (0.15 + 0.85 * smooth(0, 0.1, region(v))), hairR, { normalIters: 14, iterations: 3, taper: 0.5 });
    } else if (shortLike) {
      const fade = style === 'fade', crop = style === 'crop', thin = style === 'thinning';
      const base = fade ? 0.006 : crop ? 0.004 : style === 'curly' || style === 'twists' ? 0.026 : style === 'waves' ? 0.011 : thin ? 0.008 : old ? 0.007 : style === 'puff' ? 0.012 : 0.016;
      const topT = (fade ? 0.8 : crop ? 0.78 : old ? 0.78 : 0.7) + (thin ? 0.1 : 0), sideT = fade ? 0.52 : crop ? 0.5 : old ? 0.55 : 0.4;
      const bump = (v: V): number => 0.03 * Math.sin(v.p[0] * 160 + 1.3) + 0.018 * Math.sin(v.p[0] * 410 + 0.4) + (style === 'short' ? 0.05 * (v.p[0] / rx) : 0);
      const region = (v: V): number => {
        const t = tOf(v.p[1]), a = ax(v);
        const hairline = topT + 0.07 - (fade ? 0.15 : thin ? 0.3 : 0.22) * a * a + (thin ? 0.03 * (1 - a) : 0) + bump(v) * (crop ? 0.3 : 1);
        const backC = Math.min(t - sideT, (v.p[2] - (zc + rz * (fade || crop ? 0.15 : -0.55))) * 14);
        const nape = fade || crop || old ? -1 : Math.min(t - 0.27, (v.p[2] - (zc + rz * 0.3)) * 14);
        let r = Math.max(t - hairline, backC, nape);
        if (thin) r = Math.min(r, 0.012 + Math.hypot(v.p[0] / rx, (v.p[2] - (zc + rz * 0.25)) / rz) - 0.45 > 0 ? r : -1);   // bald crown
        return r;
      };
      const noise = (v: V): number => (style === 'curly' || style === 'twists' ? 0.009 * Math.sin(v.p[0] * 260 + v.p[1] * 190) * Math.cos(v.p[2] * 230) : 0);
      const quiff = (v: V): number => (style === 'short' ? 0.012 * smooth(zc - rz * 0.1, zc - rz * 0.9, v.p[2]) * smooth(0.7, 0.95, tOf(v.p[1])) : 0);
      const flatTop = (v: V): number => (fade ? 0.008 * smooth(0.82, 0.95, tOf(v.p[1])) : 0);
      shell(region, (v) => (base + noise(v) + quiff(v) + flatTop(v)) * (0.12 + 0.88 * smooth(0, 0.1, region(v))), hairR, { iterations: 3, taper: 0.45 });
      if (style === 'puff') ball(0, Y(1.1), backZ - top.rz * 0.5, Hh * 0.17, hairR);
      if (style === 'bun') ball(0, Y(1.0), backZ - 0.01, Hh * 0.14, hairR);
      if (style === 'ponytail') {
        const r = hr(Y(0.85)), rings: Ring[] = [];
        for (let i = 0; i <= (hi ? 8 : 5); i++) { const u = i / (hi ? 8 : 5); rings.push({ y: Y(0.86) - u * Hh * 0.95, rx: 0.026 * (1 - 0.55 * u) + 0.004, rz: 0.026 * (1 - 0.5 * u) + 0.004, cx: 0.012 * Math.sin(u * 3), cz: r.cz + r.rz + 0.018 + 0.05 * Math.sin(u * 1.6) }); }
        out.push(loft(rings, hi ? 10 : 6, hairR, 'bottom'));
      }
      if (style === 'long' || style === 'bob') {
        const r = hr(Y(0.55)), rows = hi ? 8 : 5, rings: Ring[] = [], len = style === 'bob' ? 0.55 : 1.75;
        for (let i = 0; i <= rows; i++) {
          const u = i / rows, y = Y(0.5) - u * Hh * len, wave = Math.sin(u * 5.2) * 0.008;
          const rxx = r.rx * (1.1 - 0.18 * smooth(0.25, 1, u)), rzz = r.rz * (0.8 - 0.55 * smooth(0, 0.45, u)) + 0.018;
          rings.push({ y, rx: rxx + wave, rz: rzz, cz: r.cz + r.rz * (0.3 + 0.7 * smooth(0, 0.5, u)) + 0.006 * u });
        }
        out.push(loft(rings, hi ? 18 : 12, hairR, 'bottom'));
      }
      if (style === 'peyot') {
        const r = hr(Y(0.5));
        for (const sx of [-1, 1]) {
          const rings: Ring[] = [];
          for (let i = 0; i <= 14; i++) {
            const u = i / 14, th = u * Math.PI * 3.2, rad = 0.011 * (1 - u * 0.35);
            rings.push({ y: Y(0.52) - u * Hh * 0.42, rx: 0.0082 * (1 - u * 0.5), rz: 0.0082 * (1 - u * 0.5), cx: sx * (r.rx + 0.006 + rad * Math.cos(th)), cz: r.cz - r.rz * 0.35 + rad * Math.sin(th) });
          }
          out.push(loft(rings, 6, hairR, 'bottom'));
        }
      }
      if (style === 'braids' || style === 'locs') {
        const n = style === 'braids' ? 6 : 9, len = style === 'braids' ? 0.26 : 0.34, r = hr(Y(0.5));
        for (let i = 0; i < n; i++) {
          const a = -Math.PI * 0.62 + (i / (n - 1)) * Math.PI * 1.24, x = Math.sin(a) * r.rx * 1.06, z = r.cz + Math.cos(a) * r.rz * 1.06;
          out.push(loft([{ y: Y(0.5) - len, rx: 0.009, rz: 0.009, cx: x, cz: z }, { y: Y(0.5) - len / 2, rx: 0.013, rz: 0.013, cx: x, cz: z }, { y: Y(0.55), rx: 0.019, rz: 0.019, cx: x, cz: z }], 5, hairR, 'bottom'));
        }
      }
    }
  } else if (covered && !hijab && style !== 'bald') {
    // under a hat: the hair that hangs out of it
    if (style === 'long' || style === 'bob' || style === 'ponytail') {
      const r = hr(Y(0.5)), rows = hi ? 6 : 4, rings: Ring[] = [];
      for (let i = 0; i <= rows; i++) { const u = i / rows; rings.push({ y: Y(0.5) - u * Hh * (style === 'bob' ? 0.5 : 1.4), rx: r.rx * (1.0 - 0.15 * u), rz: r.rz * (0.5 - 0.3 * u) + 0.016, cz: r.cz + r.rz * (0.5 + 0.5 * smooth(0, 0.5, u)) }); }
      out.push(loft(rings, hi ? 16 : 10, hairR, 'bottom'));
    }
  }

  // ---- hats and scarves
  const hat = spec.hat;
  const hatShell = (region: (v: V) => number, thick: (v: V) => number, o: Partial<ShellOpts> = {}): void => shell(region, thick, hatR, { taper: 0.6, normalIters: 8, ...o });
  /** a hat line that sits higher at the brow and lower at the nape */
  const band = (front: number, back: number) => (v: V): number => tOf(v.p[1]) - (front + (back - front) * smooth(-0.35, 1, q(v)));
  const visor = (reach: number, w: number, y: number): void => {
    const r = hr(y), z0 = r.cz - r.rz;
    out.push(loft([{ y: y - 0.006, rx: w * 0.8, rz: reach * 0.4, cz: z0 - reach * 0.05 }, { y: y - 0.01, rx: w, rz: reach * 0.5, cz: z0 - reach * 0.38 }, { y: y - 0.0185, rx: w * 0.9, rz: reach * 0.46, cz: z0 - reach * 0.5 }], 12, hatR, 'both'));
  };
  const dome = (t0: number, k: number, pad: number, pull: number, topT = 1.02): Ring[] => {
    const ts = [t0, t0 + (1 - t0) * 0.25, t0 + (1 - t0) * 0.5, t0 + (1 - t0) * 0.75, 0.985, topT];
    return ts.map((t, i) => {
      const y = Y(Math.min(t, 1)), r = hr(Math.min(y, Y(0.985)));
      const topI = i === ts.length - 1, shrink = topI ? 0.12 : i === ts.length - 2 ? 0.7 : 1;
      const pl = i === 0 ? pull : i === 1 ? pull * 0.45 : i === 2 ? pull * 0.05 : 0;
      return { y: topI ? Y(1) + pad * 1.4 : y, rx: (r.rx * k + pad) * shrink, rz: (r.rz * k + pad) * shrink, cz: r.cz + r.rz * pl };
    });
  };
  switch (hat) {
    case 'none': break;
    case 'cap': hatShell(band(0.64, 0.5), (v) => 0.011 + 0.004 * smooth(0.2, -0.8, q(v))); visor(0.1, 0.075, Y(0.64)); break;
    case 'flat': hatShell(band(0.62, 0.52), (v) => 0.013 + 0.006 * smooth(0.5, 1, tOf(v.p[1])) * smooth(0.5, -0.5, q(v)), { normalIters: 5 }); visor(0.07, 0.075, Y(0.62)); break;
    case 'cop': hatShell(band(0.64, 0.58), () => 0.012); visor(0.08, 0.08, Y(0.64)); break;
    case 'beanie': hatShell(band(0.52, 0.42), (v) => 0.014 + 0.01 * smooth(0.6, 0.52, tOf(v.p[1]) - 0.02 * q(v))); break;
    case 'headwrap': {
      hatShell(band(0.55, 0.5), (v) => 0.022 + 0.008 * Math.sin(v.p[0] * 90 + tOf(v.p[1]) * 40), { normalIters: 10 });
      ball(0, Y(1.12), top.cz + 0.01, Hh * 0.14, hatR);
      break;
    }
    case 'kufi': hatShell(band(0.66, 0.6), () => 0.008, { normalIters: 10 }); break;
    case 'kippah': hatShell((v) => Math.min(0.056 - Math.hypot(v.p[0], (v.p[2] - (zc + rz * 0.12)) * 0.9), tOf(v.p[1]) - 0.8), () => 0.0035, { taper: 0.7 }); break;
    case 'durag': {
      hatShell(band(0.52, 0.36), () => 0.007, { normalIters: 10 });
      for (const sx of [-1, 1]) out.push(loft([{ y: Y(-0.55), rx: 0.016, rz: 0.008, cx: sx * 0.02, cz: backZ + 0.02 }, { y: Y(0.1), rx: 0.018, rz: 0.009, cx: sx * 0.02, cz: backZ + 0.012 }, { y: Y(0.6), rx: 0.016, rz: 0.008, cx: sx * 0.02, cz: backZ }], 4, hatR, 'bottom'));
      break;
    }
    case 'helmet': hatShell(band(0.58, 0.46), () => 0.018, { normalIters: 10 }); break;
    case 'hardhat': {
      hatShell(band(0.64, 0.58), () => 0.015, { normalIters: 10 });
      const r = hr(Y(0.64));
      out.push(loft([{ y: Y(0.64), rx: 0.12, rz: 0.15, cz: r.cz - 0.03 }, { y: Y(0.64) + 0.012, rx: 0.12, rz: 0.15, cz: r.cz - 0.03 }], 14, hatR, 'both'));
      break;
    }
    case 'church': {
      out.push(loft(dome(0.64, 1.1, 0.008, 0), seg, hatR, 'top'));
      const r = hr(Y(0.64));
      out.push(loft([{ y: Y(0.64), rx: 0.235, rz: 0.235, cz: r.cz }, { y: Y(0.64) + 0.012, rx: 0.235, rz: 0.235, cz: r.cz }], 18, hatR, 'both'));
      break;
    }
    case 'fedora': {
      const r = hr(Y(0.62)), topY = Y(1.0);
      out.push(loft([
        { y: Y(0.55), rx: r.rx * 1.1 + 0.008, rz: r.rz * 1.1 + 0.008, cz: r.cz }, { y: Y(0.78), rx: r.rx * 1.12 + 0.01, rz: r.rz * 1.12 + 0.01, cz: r.cz },
        { y: topY, rx: r.rx * 1.1, rz: r.rz * 1.1, cz: r.cz }, { y: topY + 0.045, rx: r.rx * 1.02, rz: r.rz * 1.04, cz: r.cz }, { y: topY + 0.07, rx: r.rx * 0.9, rz: r.rz * 0.92, cz: r.cz },
      ], seg, hatR, 'top'));
      out.push(loft([{ y: Y(0.55), rx: r.rx + 0.075, rz: r.rz + 0.075, cz: r.cz }, { y: Y(0.55) + 0.008, rx: r.rx + 0.075, rz: r.rz + 0.075, cz: r.cz }], 20, hatR, 'both'));
      break;
    }
    case 'hijab': {
      // draped cloth, two styles: A a neat wrap with the cloth falling to a short point on the chest, B a loose shawl, fuller and longer, one end over the shoulder.
      // The wrap is an ellipse a little narrower front to back than the head and shifted back, so the face stands out in front of it (no cut-out edges);
      // the mantle widens from the throat to the shoulders and ends in a soft hem.
      const loose = (hash(id) % 2) === 0, bt = bodyTypeOf(spec), shW = Math.abs(s.rig.shoulderL[0]) * (peopleMode() === 'skin' ? bt.shoulders : 1), shY = s.rig.shoulderL[1];
      const wrap: Ring[] = [];
      for (const t of [-0.16, -0.04, 0.12, 0.3, 0.5, 0.7, 0.86, 0.97, 1.05]) {
        const r = hr(Y(Math.max(0.02, t))), g = (loose ? 0.042 : 0.03) + 0.007 * Math.sin(t * 11) + (t < 0 ? 0.01 : 0), topK = smooth(0.9, 1.06, t);
        wrap.push({ y: Y(t), rx: (r.rx + g) * (1 - 0.5 * topK), rz: (r.rz * 0.72 + g * 0.4) * (1 - 0.5 * topK), cz: r.cz + r.rz * 0.3 + 0.012 });
      }
      out.push(loft(wrap, hi ? 16 : 10, hatR, 'top'));
      const reach = loose ? 0.34 : 0.2, rows = hi ? 8 : 5, mant: Ring[] = [], nk = hr(lm.chinY + 0.01);
      const torso = s.torsoRings;
      const torAt = (y: number): { cz: number; rz: number } => {
        if (y <= torso[0][0]) return { cz: torso[0][2], rz: torso[0][3] };
        for (let i = 1; i < torso.length; i++) if (y <= torso[i][0]) { const a = torso[i - 1], b = torso[i], u = (y - a[0]) / Math.max(1e-6, b[0] - a[0]); return { cz: a[2] + (b[2] - a[2]) * u, rz: a[3] + (b[3] - a[3]) * u }; }
        const l = torso[torso.length - 1]; return { cz: l[2], rz: l[3] };
      };
      for (let i = 0; i <= rows; i++) {
        const u = i / rows, y = lm.chinY - 0.03 - u * (lm.chinY - 0.03 - (shY - reach));
        const tr = torAt(y), open = smooth(0, 0.55, u), taper = 1 - (loose ? 0.15 : 0.4) * smooth(0.55, 1, u);
        const wob = 0.008 * Math.sin(u * 7 + 1) + (loose ? 0.012 * Math.sin(u * 4.3) : 0);
        mant.push({ y, rx: (nk.rx * 0.9 + 0.03 + (shW * 0.92 - nk.rx * 0.9) * open) * taper + wob, rz: (nk.rz * 0.75 + 0.022 + Math.max(0, tr.rz - nk.rz * 0.75) * open) + 0.02 + wob, cz: nk.cz + (tr.cz - nk.cz) * open + (loose ? 0.012 * open : 0), cx: loose ? 0.03 * open : 0 });
      }
      out.push(loft(mant, hi ? 16 : 10, hatR, 'bottom'));
      break;
    }
  }

  // ---- accessories picked by the person's id (not by group): headphones, a scarf at the neck
  const roll = hash(id) / 4294967296, grown = spec.age !== 'kid';
  if (grown && hat === 'none' && style !== 'afro' && roll < 0.1) {
    // over-ear headphones: a band that rises from each ear cup over the crown and two padded cups
    const r = hr(Y(0.45)), R0 = r.rx + 0.014, ye = Y(0.45), yt = Y(1.0) + 0.03;
    const nr = hi ? 6 : 4, ks = hi ? [0.5, 1, 0.5] : [0.6, 1, 0.6], kd = hi ? [-0.036, 0, 0.036] : [-0.03, 0, 0.03];
    for (const sx of [-1, 1]) {
      const rings: Ring[] = [];
      for (let i = 0; i <= nr; i++) { const th = (i / nr) * (Math.PI / 2 - 0.05); rings.push({ y: ye + (yt - ye) * Math.sin(th), rx: 0.0055, rz: 0.011, cx: sx * R0 * Math.cos(th) * (1 + 0.04 * Math.sin(th)), cz: r.cz }); }
      out.push(loft(rings, hi ? 5 : 4, hatR, 'both'));
      out.push(loft(ks.map((kk, i) => ({ y: ye + kd[i], rx: 0.016 * kk + 0.002, rz: 0.034 * kk, cx: sx * (R0 + 0.006), cz: r.cz })), hi ? 10 : 7, hatR, 'both'));
    }
  } else if (grown && !covered && hat !== 'hijab' && roll >= 0.1 && roll < 0.2) {
    const n = hr(lm.chinY + 0.01);
    out.push(loft([{ y: lm.chinY - 0.07, rx: n.rx * 0.7 + 0.04, rz: n.rz * 0.7 + 0.04, cz: n.cz }, { y: lm.chinY - 0.02, rx: n.rx * 0.7 + 0.034, rz: n.rz * 0.7 + 0.034, cz: n.cz }, { y: lm.chinY + 0.015, rx: n.rx * 0.7 + 0.03, rz: n.rz * 0.7 + 0.03, cz: n.cz }], 14, hatR, 'both'));
  }

  // ---- beard: a volume on the jaw and chin, open over the mouth (hi only; the mid level paints it)
  if (spec.face.beard && hi) {
    const frontZ = zc - rz;
    const beardRegion = (v: V): number => {
      let r = 0.4 - tOf(v.p[1]);
      r = Math.min(r, zc - 0.005 - v.p[2]);
      r = Math.min(r, rx * 0.97 - Math.abs(v.p[0]));
      r = Math.min(r, Math.max(Math.abs(v.p[0]) - rx * 0.36, Math.max(0.12 - tOf(v.p[1]), tOf(v.p[1]) - 0.3)));
      return r;
    };
    const ys = [lm.chinY, lm.chinY + 0.41 * (lm.eyeY - lm.chinY), lm.chinY + 0.68 * (lm.eyeY - lm.chinY), lm.eyeY, lm.crownY], ts = [0, 0.255, 0.42, 0.565, 1];
    const headT = (y: number): number => { if (y <= ys[0]) return 0; for (let k = 1; k < ys.length; k++) if (y <= ys[k]) return ts[k - 1] + ((y - ys[k - 1]) / (ys[k] - ys[k - 1])) * (ts[k] - ts[k - 1]); return 1; };
    const faceUV = (p: P3): [number, number] => tileUV(HI_RECTS.head, p[2] > zc + 0.015 ? (p[0] >= 0 ? 0.992 : 0.008) : 0.5 + 0.189 * (p[0] / Math.max(1e-3, lm.eyeX)), headT(p[1]));
    void frontZ;
    add(scalpShell(clip(head, beardRegion), { thick: (v) => 0.004 + 0.006 * smooth(0.3, 0.05, tOf(v.p[1])) * smooth(rx * 0.97, rx * 0.5, Math.abs(v.p[0])), uv: faceUV, tile: HI_RECTS.head, iterations: 4, taper: 0.45 }));
  }
  return out;
}
