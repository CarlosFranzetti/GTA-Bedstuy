/**
 * People from a real humanoid base mesh (MakeHuman base mesh, CC0 data; see scripts/people-pipeline.mjs and
 * src/assets/models/people/src/LICENSE.txt). The pipeline ships one meshopt glb per body shape with three LODs (hi ~3.4k, mid ~1.1k,
 * far ~400 triangles), skinned to the same 12-bone rig as pedBodyHi.ts, unwrapped per body part (cylinder tiles).
 * One clean closed skin mesh per person, the way GTA III and IV did it: the clothes, face, shoes and soft shading are painted into
 * one 512 px colour map baked by position (textures/painters/pedSkinPaint.ts), so there are no garment shells, gaps or shards.
 * The body type (silhouette) and the thickness of puffers and coats are a smooth deformation of the skin (dressLod).
 *
 * Hair, hats, skirts, hoods and packs are the only extra volumes: caps lofted around the shape's measured head / torso / hip rings
 * and merged into the body geometry, so a person is ONE SkinnedMesh per LOD (one draw), with one material per variant.
 *
 * Feature flag: VITE_PEOPLE=mh (default) uses these bodies once `loadPeople()` has finished; VITE_PEOPLE=hi, or any failure to
 * load, keeps PEDHI's procedural people (buildPedModel of pedBodyHi.ts) as the fallback.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { createGltfLoader, warnOnce } from './gltf/loader';
import type { HiTile } from '@/textures/painters/pedHi';
import { SK_RECTS, bakeSkin } from '@/textures/painters/pedSkinPaint';
import { PED_SPECS, pedVariantIndex, shortsLen, skirtShape, type PedSpec, type PxRect } from '@/textures/painters/ped';
import { pickWardrobeVariant } from '@/textures/painters/pedWardrobe';
import { FAR_DIST, MID_DIST, PedLod, buildPedModel as buildProcedural, pedPhone, type PedDetail } from './pedBodyHi';
import { hijabShell } from './pedGarments';
import { peopleMode } from '@/textures/painters/pedMode';
import { legTubes, isCoveredLeg, StripMesh, addStrip, type Row, type LegTube, type LegDetail } from './pedLegs';
import { addPolarStrip, cuffRows, hemRows, straightenArms, swingSkirt } from './pedCuts';
import { bodyTypeOf, type BodyType } from './pedBodyTypes';
import { makeCtx, personPieces } from './pedPieces';
import { pickPedVariant, type PedModel, type PedOptions } from './pedBody';

type Ring = [number, number, number, number, number?]; // y, rx, cz, rz, cx (half extents round the centre)
/** `normal` = smooth normals of the low-poly mesh itself; `normal0` = the normals of the full-resolution MakeHuman surface it was reduced from; `dw` / `dm` = MakeHuman's weight and muscle shapes as position deltas (normalised by deltaScale, hi LOD only) */
export interface MhLod { position: Float32Array; normal: Float32Array; uv: Float32Array; joints: Uint16Array; weights: Float32Array; index: Uint32Array; normal0?: Float32Array; dw?: Float32Array; dm?: Float32Array; /** set when the trouser legs were cut and replaced by tubes (pedLegs.ts): where the shoes stand */ tube?: LegTube }
export interface MhShape {
  name: string;
  height: number;
  rig: Record<string, number[]>;
  landmarks: { chinY: number; crownY: number; eyeY: number; eyeX: number; hemY: number; ankleY: number; wristY: number };
  headRings: Ring[]; torsoRings: Ring[]; hipRings: Ring[];
  /** left limbs (x < 0), ascending in y */
  armRings: { upper: Ring[]; fore: Ring[] }; legRings: { thigh: Ring[]; shin: Ring[] };
  lods: Record<PedDetail, MhLod>;
  deltaScale?: { w: number; m: number };
}

const shapes = new Map<string, MhShape>();
export function peopleFlag(): boolean { return (import.meta.env?.VITE_PEOPLE ?? 'mh') !== 'hi'; }
export function peopleReady(): boolean { return peopleFlag() && shapes.size > 0; }
export function peopleShapes(): string[] { return [...shapes.keys()]; }
export function clearPeople(): void { shapes.clear(); geoCache.clear(); dressCache.clear(); }

/** smooth normals; vertices at the same position (tile borders of the UV projection) share one normal */
export function weldedNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
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

// ---------------------------------------------------------------- loading

/** Parse one shape glb (meshopt compressed) into plain arrays (dequantised, node transforms applied). */
export function parseShape(buf: ArrayBuffer): Promise<MhShape> {
  return new Promise((resolve, reject) => {
    createGltfLoader().parse(buf, '', (gltf: GLTF) => {
      try { resolve(shapeFromGltf(gltf)); } catch (e) { reject(e); }
    }, reject);
  });
}

function shapeFromGltf(gltf: GLTF): MhShape {
  const meta = gltf.scene.userData.people ?? (gltf.scenes[0]?.userData as { people?: Record<string, unknown> }).people;
  if (!meta) throw new Error('people glb without scene.extras.people');
  gltf.scene.updateMatrixWorld(true);
  const lods = {} as Record<PedDetail, MhLod>;
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(o.name === 'hi' || o.name === 'mid' || o.name === 'far')) return;
    const g = m.geometry, pa = g.getAttribute('position'), ua = g.getAttribute('uv'), ja = g.getAttribute('skinIndex'), wa = g.getAttribute('skinWeight');
    const n = pa.count, v = new THREE.Vector3(), mat = m.matrixWorld;
    const position = new Float32Array(n * 3), uv = new Float32Array(n * 2), joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(mat); position.set([v.x, v.y, v.z], i * 3);
      uv[i * 2] = ua.getX(i); uv[i * 2 + 1] = ua.getY(i);
      let s = 0;
      for (let k = 0; k < 4; k++) { joints[i * 4 + k] = ja.getComponent(i, k); weights[i * 4 + k] = wa.getComponent(i, k); s += weights[i * 4 + k]; }
      for (let k = 0; k < 4; k++) weights[i * 4 + k] /= s || 1;
    }
    const ix = g.index!, index = new Uint32Array(ix.count);
    for (let i = 0; i < ix.count; i++) index[i] = ix.getX(i);
    const na = g.getAttribute('normal'), wa2 = g.getAttribute('_wgt'), ma = g.getAttribute('_mus');
    let normal0: Float32Array | undefined, dw: Float32Array | undefined, dm: Float32Array | undefined;
    if (na) { normal0 = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const x = na.getX(i), y = na.getY(i), z = na.getZ(i), l = Math.hypot(x, y, z) || 1; normal0[i * 3] = x / l; normal0[i * 3 + 1] = y / l; normal0[i * 3 + 2] = z / l; } }
    if (wa2 && ma) { dw = new Float32Array(n * 3); dm = new Float32Array(n * 3); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { dw[i * 3 + k] = wa2.getComponent(i, k); dm[i * 3 + k] = ma.getComponent(i, k); } }
    lods[o.name as PedDetail] = { position, normal: weldedNormals(position, index), uv, joints, weights, index, normal0, dw, dm };
  });
  if (!lods.hi || !lods.mid || !lods.far) throw new Error('people glb needs meshes hi, mid and far');
  const p = meta as Omit<MhShape, 'name' | 'lods'> & { shape: string };
  return { deltaScale: (p as { deltaScale?: { w: number; m: number } }).deltaScale, name: p.shape, height: p.height, rig: p.rig, landmarks: p.landmarks, headRings: p.headRings, torsoRings: p.torsoRings, hipRings: p.hipRings, armRings: p.armRings, legRings: p.legRings, lods };
}

const FILES = peopleFlag() ? import.meta.glob('@/assets/models/people/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string> : {};

let loading: Promise<number> | null = null;
/** Load every shipped shape glb once. Resolves with the number of shapes; never rejects (a failure keeps the procedural people). */
export function loadPeople(): Promise<number> {
  if (!loading) {
    loading = (async () => {
      for (const url of Object.values(FILES)) {
        try {
          const buf = await (await fetch(url)).arrayBuffer();
          const s = await parseShape(buf);
          shapes.set(s.name, s);
        } catch (e) { warnOnce(`people:${url.slice(-24)}`, 'people glb failed, using procedural people', e); }
      }
      return shapes.size;
    })();
  }
  return loading;
}
export function registerShape(s: MhShape): void { shapes.set(s.name, s); }

// ---------------------------------------------------------------- shape per variant

/** body shape of a person: group, sex and age pick one of the shipped MakeHuman shapes (nearest when a combination is not shipped) */
export function shapeFor(spec: PedSpec): string {
  const g = spec.group === 'hj' || !spec.group ? 'wh' : spec.group, sex = spec.sex ?? 'm', age = spec.age ?? 'adult';
  if (age === 'kid' || age === 'teen') return g === 'ea' || sex === 'f' ? 'teen_b' : 'teen_a';
  if (sex === 'x') return 'mx_x';
  const dark = g === 'ba' || g === 'ca';
  if (age === 'old') return sex === 'f' ? (dark ? 'ba_f_old' : 'wh_f_old') : (dark || g === 'la' ? 'ba_m_old' : 'wh_m_old');
  return `${g}_${sex === 'f' ? 'f' : 'm'}`;
}
/** build -> [width, height] scale of the shape (a child is a scaled teen) */
const BUILD_SCALE: Record<PedSpec['build'], [number, number]> = { avg: [1, 1], slim: [0.94, 0.99], stocky: [1.1, 0.98], tall: [1, 1.04], kid: [0.78, 0.78] };

// ---------------------------------------------------------------- caps (hair, hats, skirt, pack) lofted round the measured rings

interface R { y: number; rx: number; rz: number; cx?: number; cz?: number }
const ATLAS = 512;

function loft(rings: R[], seg: number, rect: PxRect, bone: number, cap: 'top' | 'bottom' | 'both' | 'none' = 'none'): THREE.BufferGeometry {
  const rs = [...rings].sort((a, b) => a.y - b.y);
  const ymin = rs[0].y, dy = Math.max(1e-6, rs[rs.length - 1].y - ymin);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const uvAt = (fu: number, ft: number): void => { const px = rect.x + 3 + fu * (rect.w - 6), py = rect.y + 3 + (1 - ft) * (rect.h - 6); uv.push(px / ATLAS, 1 - py / ATLAS); };
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
  for (let k = 0; k < n; k++) { si[k * 4] = bone; sw[k * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  // outward winding check on the middle ring
  const nn = g.getAttribute('normal'), mid = Math.floor(rs.length / 2) * row, r0 = rs[Math.floor(rs.length / 2)];
  if ((pos[mid * 3] - (r0.cx ?? 0)) * nn.getX(mid) + (pos[mid * 3 + 2] - (r0.cz ?? 0)) * nn.getZ(mid) < 0) {
    const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t = ix.getY(i); ix.setY(i, ix.getZ(i)); ix.setZ(i, t); }
    g.computeVertexNormals();
  }
  return g;
}

function ringAt(rings: Ring[], y: number): { rx: number; cz: number; rz: number } {
  if (y <= rings[0][0]) return { rx: rings[0][1], cz: rings[0][2], rz: rings[0][3] };
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
    const a = rings[i - 1], b = rings[i], t = (y - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return { rx: a[1] + (b[1] - a[1]) * t, cz: a[2] + (b[2] - a[2]) * t, rz: a[3] + (b[3] - a[3]) * t };
  }
  const l = rings[rings.length - 1];
  return { rx: l[1], cz: l[2], rz: l[3] };
}

// hair, hats, headgear, glasses and bags are the separate pieces of pedPieces.ts (wired in geometryFor); the old lofted head parts are gone

function bodyParts(s: MhShape, spec: PedSpec, hiDetail: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const seg = hiDetail ? 16 : 9;
  const hip = s.hipRings, tor = s.torsoRings;
  if (spec.bottom.kind === 'skirt') {
    const sk = skirtShape(spec.bottom, spec.top.kind === 'dress'), top = hip[hip.length - 1], hem = s.landmarks.crownY * sk.hem, waist = tor[0];
    const hw = peopleMode() === 'skin' ? Math.max(0.95, bodyTypeOf(spec).hips) : 1;
    // the top ring sits inside the dressed waist so the skirt grows out of the body (no shelf); pleats and hem are the lower rows of the pelvis tile
    const skirtRect = SK_RECTS.pelvis;
    out.push(swingSkirt(loft([
      { y: hem, rx: (top[1] + sk.o1) * hw, rz: top[3] + sk.o1, cz: top[2] }, { y: (hem + top[0]) / 2, rx: (top[1] + sk.o2) * hw, rz: top[3] + sk.o2, cz: top[2] },
      { y: top[0] - 0.01, rx: (top[1] + 0.022) * hw, rz: top[3] + 0.022, cz: top[2] }, { y: waist[0] + 0.05, rx: waist[1] * 0.985, rz: waist[3] * 0.985, cz: waist[2] },
    ], seg, skirtRect, 1), waist[0] + 0.05, hem));      // PEOPLE5: the hem follows the thighs, so a leg never walks out of the front of a skirt
  }
  return out;
}

// ---------------------------------------------------------------- clothing shells, ambient occlusion

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** vertex colour = baked ambient occlusion (armpits, under the chin, crotch, eye sockets, soles), in this shape's own landmarks */
function bodyAo(s: MhShape, pos: Float32Array): Float32Array {
  const lm = s.landmarks, H = lm.crownY, g2 = (d: number, w: number): number => Math.exp(-(d / w) * (d / w));
  const sx = Math.abs(s.rig.shoulderL[0]), sy = s.rig.shoulderL[1];
  const eyeRing = s.headRings.reduce((b, r) => (Math.abs(r[0] - lm.eyeY) < Math.abs(b[0] - lm.eyeY) ? r : b));
  const frontZ = eyeRing[2] - eyeRing[3], k = H / 1.78;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2], ax = Math.abs(x);
    let f = 1;
    f *= 1 - 0.38 * g2(y - (sy - 0.11 * k), 0.065 * k) * g2(ax - (sx - 0.02), 0.045);
    f *= 1 - 0.42 * g2(y - lm.chinY, 0.04) * smooth(frontZ + 0.1, frontZ + 0.02, z) * (ax < 0.09 ? 1 : 0.4);
    f *= 1 - 0.45 * (1 - Math.min(1, ax / 0.075)) * g2(y - H * 0.47, 0.06 * k);
    if (z < frontZ + 0.03) for (const e of [-1, 1]) f *= 1 - 0.16 * g2(Math.hypot(x - e * lm.eyeX, y - lm.eyeY), 0.016);
    f *= 1 - 0.2 * smooth(0.05, 0, y);
    f = Math.max(0.35, f);
    out[i] = f; out[i + 1] = Math.pow(f, 1.25); out[i + 2] = Math.pow(f, 1.5);   // warm, subsurface-ish shadows
  }
  return out;
}

// ---------------------------------------------------------------- body types and the dressed body (skin mode)

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
const gauss = (d: number, w: number): number => Math.exp(-(d / w) * (d / w));
const wsumAt = (L: MhLod, i: number, set: readonly number[]): number => { let t = 0; for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) t += L.weights[i * 4 + k]; return t; };
const W_TORSO = [2], W_HIPS = [1], W_ARMS = [4, 5, 6, 7], W_LEGS = [8, 9, 10, 11];

/** where the joints go for a body type: shoulders and arms follow the shoulder width, legs the hip width */
export function jointFor(name: string, p: number[], bt: BodyType, pivot?: number[]): number[] {
  if (/^(shoulder|elbow|wrist)/.test(name)) return leanPoint([p[0] * bt.shoulders - Math.sign(p[0] || 1) * ARM_IN * (name.startsWith('elbow') ? 0.5 : name.startsWith('wrist') ? 1 : 0), p[1], p[2]], bt, pivot);
  if (name === 'head') return leanPoint(p, bt, pivot);
  if (/^(hip[LR]|knee|ankle)/.test(name)) return [p[0] * legX(bt), p[1], p[2]];
  return p;
}
/** the arm hangs a little inward from the deltoid to the hand (m, at the wrist): the shoulder keeps its width, the waist and hips read narrower */
const ARM_IN = 0.014;
const legX = (bt: BodyType): number => 1 + (bt.hips - 1) * 0.8;
/** forward lean of the upper body about the waist (rad): the stoop of an older person is part of the body, so it shows in any pose */
export const leanOf = (bt: BodyType): number => -bt.stoop * 0.85;
function leanPoint(p: number[], bt: BodyType, pivot?: number[]): number[] {
  const phi = leanOf(bt);
  if (!pivot || phi === 0) return p;
  const dy = p[1] - pivot[1], dz = p[2] - pivot[2], c = Math.cos(phi), sn = Math.sin(phi);
  return [p[0], pivot[1] + dy * c + dz * sn, pivot[2] + dz * c - dy * sn];
}
/** lean the vertices of upper-body bones (torso 2, head 3, arms 4 to 7) about the waist; hips and legs stay; the lean fades in over the waist */
function leanGeometry(pos: Float32Array, nrm: Float32Array | null, jx: ArrayLike<number>, wx: ArrayLike<number>, bt: BodyType, pivot: number[]): void {
  const phi = leanOf(bt);
  if (phi === 0) return;
  const py = pivot[1], pz = pivot[2], c = Math.cos(phi), sn = Math.sin(phi);
  for (let i = 0; i < pos.length / 3; i++) {
    let u = 0;
    for (let k = 0; k < 4; k++) { const j = jx[i * 4 + k]; if (j >= 2 && j <= 7) u += wx[i * 4 + k]; }
    u = Math.min(1, u) * sstep(py - 0.14, py + 0.1, pos[i * 3 + 1]);
    if (u <= 0) continue;
    const dy = pos[i * 3 + 1] - py, dz = pos[i * 3 + 2] - pz;
    pos[i * 3 + 1] = py + dy + (dy * c + dz * sn - dy) * u; pos[i * 3 + 2] = pz + dz + (dz * c - dy * sn - dz) * u;
    if (nrm) {
      const ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2], qy = ny * c + nz * sn, qz = nz * c - ny * sn;
      nrm[i * 3 + 1] = ny + (qy - ny) * u; nrm[i * 3 + 2] = nz + (qz - nz) * u;
      const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1; nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
    }
  }
}

/** weight and muscle deltas of a LOD: shipped for the hi LOD, taken from the nearest hi vertex for the coarser ones */
const deltaCache = new WeakMap<MhLod, { dw: Float32Array; dm: Float32Array } | null>();
function deltasFor(s: MhShape, L: MhLod): { dw: Float32Array; dm: Float32Array } | null {
  if (L.dw && L.dm) return { dw: L.dw, dm: L.dm };
  let c = deltaCache.get(L);
  if (c !== undefined) return c;
  const H = s.lods.hi;
  if (!H.dw || !H.dm) { deltaCache.set(L, null); return null; }
  const cell = 0.04, grid = new Map<string, number[]>(), key = (x: number, y: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < H.position.length / 3; i++) { const k = key(H.position[i * 3], H.position[i * 3 + 1], H.position[i * 3 + 2]); const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]); }
  const n = L.position.length / 3, dw = new Float32Array(n * 3), dm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = L.position[i * 3], y = L.position[i * 3 + 1], z = L.position[i * 3 + 2];
    let best = -1, bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${Math.floor(x / cell) + dx},${Math.floor(y / cell) + dy},${Math.floor(z / cell) + dz}`) ?? []) {
      const d = (H.position[j * 3] - x) ** 2 + (H.position[j * 3 + 1] - y) ** 2 + (H.position[j * 3 + 2] - z) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) for (let k = 0; k < 3; k++) { dw[i * 3 + k] = H.dw[best * 3 + k]; dm[i * 3 + k] = H.dm[best * 3 + k]; }
  }
  c = { dw, dm }; deltaCache.set(L, c);
  return c;
}
/** normals of a deformed low-poly mesh: the smooth normals of the full MakeHuman surface, turned by however much the deformation turned the low-poly surface */
function shadeNormals(L: MhLod, pos: Float32Array): Float32Array {
  const now = weldedNormals(pos, L.index);
  if (!L.normal0) return now;
  const out = new Float32Array(now.length);
  for (let i = 0; i < now.length; i += 3) {
    const x = L.normal0[i] + now[i] - L.normal[i], y = L.normal0[i + 1] + now[i + 1] - L.normal[i + 1], z = L.normal0[i + 2] + now[i + 2] - L.normal[i + 2], l = Math.hypot(x, y, z) || 1;
    out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
  }
  return out;
}
interface Weld { canon: Int32Array; members: Map<number, number[]>; adj: Map<number, number[]> }
const weldCache = new WeakMap<Uint32Array, Weld>();
/** vertices at the same place (the UV seams) welded, with their neighbours */
function weldOf(L: MhLod): Weld {
  let w = weldCache.get(L.index);
  if (w) return w;
  const n = L.position.length / 3, canon = new Int32Array(n), first = new Map<string, number>(), members = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(L.position[i * 3] * 1e4)},${Math.round(L.position[i * 3 + 1] * 1e4)},${Math.round(L.position[i * 3 + 2] * 1e4)}`;
    const f = first.get(k) ?? i; first.set(k, f); canon[i] = f;
    const m = members.get(f); if (m) m.push(i); else members.set(f, [i]);
  }
  const sets = new Map<number, Set<number>>();
  for (let t = 0; t < L.index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = canon[L.index[t + k]], b = canon[L.index[t + (k + 1) % 3]], c = canon[L.index[t + (k + 2) % 3]];
    let s = sets.get(a); if (!s) { s = new Set(); sets.set(a, s); } s.add(b); s.add(c);
  }
  const adj = new Map<number, number[]>(); for (const [k, v] of sets) adj.set(k, [...v]);
  w = { canon, members, adj }; weldCache.set(L.index, w);
  return w;
}
/**
 * A clothed torso is one smooth cloth volume: the pecs, nipples, abs and shoulder blades of the base mesh must not read through a top or a
 * coat. Relax the front and the back of the trunk (z only, so the side silhouette and the belly / bust mass stay) with a Laplacian pass over
 * the welded mesh, then pull what still stands proud of the mean cross-section of its height band back to it.
 */
function flattenTorso(L: MhLod, pos: Float32Array, yLo: number, yHi: number, cz0: number, strength: number): void {
  const w = weldOf(L), sel: number[] = [];
  for (const [c] of w.members) if (pos[c * 3 + 1] > yLo && pos[c * 3 + 1] < yHi && wsumAt(L, c, W_TORSO) > 0.6 && Math.abs(pos[c * 3]) < 0.2) sel.push(c);
  const selSet = new Set(sel);
  for (let it = 0; it < 18; it++) {
    const next = sel.map((i) => { let z = 0, c = 0; for (const j of w.adj.get(i) ?? []) { if (!selSet.has(j) && Math.abs(pos[j * 3 + 2] - pos[i * 3 + 2]) > 0.05) continue; z += pos[j * 3 + 2]; c++; } return c ? pos[i * 3 + 2] * 0.35 + (z / c) * 0.65 : pos[i * 3 + 2]; });
    sel.forEach((i, k) => { const z = pos[i * 3 + 2], z2 = z + (next[k] - z) * strength; for (const m of w.members.get(i)!) pos[m * 3 + 2] = z2; });
  }
  // the mean surface of each height band (front and back separately), as an ellipse in x: z(x) = zMean * sqrt(1 - (x / xMax)^2)... measured, not assumed
  const bands = new Map<string, { sum: number; n: number }>();
  const bk = (i: number): string => `${Math.round(pos[i * 3 + 1] / 0.035)}${pos[i * 3 + 2] < cz0 ? 'f' : 'b'}`;
  for (const i of sel) { if (Math.abs(pos[i * 3]) > 0.12) continue; const k = bk(i), e = bands.get(k) ?? { sum: 0, n: 0 }; e.sum += pos[i * 3 + 2]; e.n++; bands.set(k, e); }
  for (const i of sel) {
    const e = bands.get(bk(i)); if (!e || e.n < 2) continue;
    const zm = e.sum / e.n, z = pos[i * 3 + 2], front = z < cz0, fade = Math.max(0, 1 - (Math.abs(pos[i * 3]) / 0.15) ** 2);
    const over = front ? zm - z : z - zm;          // how far it stands proud of the band mean
    if (over > 0.002) { const z2 = z + (front ? 1 : -1) * over * 0.85 * strength * fade; for (const m of w.members.get(i)!) pos[m * 3 + 2] = z2; }
  }
}

/** thickness of the clothes on the body (m): the volume of a puffer, the drop of a hoodie, the trouser leg; skin and hands get none */
const THICK_SKIN: Partial<Record<PedSpec['top']['kind'], number>> = { puffer: 0.03, hoodie: 0.017, jacket: 0.014, cardigan: 0.013, uniform: 0.011, tracksuit: 0.01, vest: 0.01, apron: 0.008, jersey: 0.005, tee: 0.005, blouse: 0.005, scrubs: 0.006, dress: 0.005 };
const THICK_BOT_SKIN: Partial<Record<PedSpec['bottom']['kind'], number>> = { jeans: 0.008, trousers: 0.009, cargo: 0.016, sweats: 0.014, shorts: 0.008, leggings: 0.002 };
export function topHemY(s: MhShape, spec: PedSpec): number {
  const k = spec.top.kind, hemY = s.landmarks.hemY;
  if (spec.top.long) return s.rig.kneeL[1] + 0.05;
  return hemY - (['puffer', 'hoodie', 'jacket', 'cardigan'].includes(k) ? 0.09 : k === 'tee' || k === 'blouse' || k === 'jersey' ? 0 : 0.04);
}

/**
 * One continuous body: first the body type (shoulders, chest, belly, hips, limb thickness) then the clothes as a smooth offset along the
 * normals, weighted by the skin weights so the neck, hands and bare legs stay bare and nothing can gap. Returns new positions and normals.
 */
export function dressLod(s: MhShape, spec: PedSpec, L: MhLod, dress: boolean): MhLod {
  const bt = bodyTypeOf(spec), lm = s.landmarks, R = s.rig;
  const shY = R.shoulderL[1], elY = R.elbowL[1], wrY = R.wristL[1], knY = R.kneeL[1], anY = lm.ankleY, hemY = lm.hemY;
  const n = L.position.length / 3, pos = new Float32Array(L.position);
  // MakeHuman's own weight and muscle shapes, at the strength of the body type (no inflating)
  if ((bt.weight || bt.muscle) && s.deltaScale) {
    const D = deltasFor(s, L);
    if (D) for (let i = 0; i < n * 3; i++) pos[i] += bt.weight * D.dw[i] * s.deltaScale.w + bt.muscle * D.dm[i] * s.deltaScale.m;
  }
  const tor = s.torsoRings, cz0 = tor[Math.floor(tor.length / 2)][2], K = lm.crownY / 1.78;
  const armX = Math.abs(R.shoulderL[0]), hipX = Math.abs(R.hipL[0]), legK = legX(bt), wristX = Math.abs(R.wristL[0]), hipY = R.hipL[1];
  const yBelly = hipY + 0.09 * K, yWaist = hipY + 0.14 * K, yChest = shY - 0.13 * K, neckY = lm.chinY - 0.03;
  const waistK = bt.waist;
  const fWaist = 1 + Math.max(0, bt.belly) * 1.1 + Math.max(0, bt.hips - 1) * 0.3 + Math.min(0, bt.belly) * 2;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  // a leg's thickness along its length: thigh full, knee slimmer, calf a little fuller than the ankle, then the ankle (a heavy leg is a solid leg, not a sausage)
  const legProfile = (t: number): number => {
    const L2 = bt.legs, a = [1, 1 + (L2 - 1) * 0.5, 1 + (L2 - 1) * 0.25, L2, L2 * 0.97], at = [0, 0.28, 0.5, 0.75, 1];
    for (let i = 1; i < at.length; i++) if (t <= at[i]) return lerp(a[i - 1], a[i], sstep(at[i - 1], at[i], t));
    return a[a.length - 1];
  };
  for (let i = 0; i < n; i++) {
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const wT = wsumAt(L, i, W_TORSO), wH = wsumAt(L, i, W_HIPS), wA = wsumAt(L, i, W_ARMS), wL = wsumAt(L, i, W_LEGS);
    const sx = Math.sign(x) || 1, torsoLike = Math.min(1, wT + wH * 0.9);
    // torso: one continuous width profile (hips, waist, chest, shoulders) so nothing pinches; weight sits at the belly, the chest and the back
    const sum = (bt.hips - 1) * gauss(y - (hipY + 0.02), 0.16) + (fWaist - 1) * gauss(y - yWaist, 0.13) + (bt.chest - 1) * 0.8 * gauss(y - yChest, 0.12)
      + (bt.shoulders - 1) * sstep(yChest - 0.02, shY, y) * (1 - sstep(shY + 0.02, neckY, y));
    x *= 1 + sum * torsoLike;
    // the wedge: the waist comes in (men more than women); the shoulder line slopes from the neck down to the deltoid and the corner is rounded off
    // (the base mesh has a flat, wide trapezius that reads as a padded box once it is dressed)
    if (waistK < 1) x *= 1 - (1 - waistK) * gauss(y - (yWaist + 0.03 * K), 0.11 * K) * torsoLike;
    const shTop = sstep(shY - 0.07 * K, shY + 0.03 * K, y) * (1 - sstep(neckY - 0.01, neckY + 0.06, y)) * Math.min(1, wT + wA);
    if (shTop > 0) {
      const xo = armX * bt.shoulders, ax = Math.abs(x), reach = sstep(0.07, xo + 0.01, ax), corner = sstep(xo - 0.035, xo + 0.035, ax);
      y -= (0.024 * reach + 0.012 * corner) * K * shTop;
      x -= sx * 0.014 * corner * K * sstep(shY - 0.02, shY + 0.04, y + 0.03) * shTop;
    }
    const front = z < cz0;
    z = cz0 + (z - cz0) * (1 + (bt.chest - 1) * (front ? 0.9 : 0.5) * gauss(y - yChest, 0.13) * torsoLike);
    if (front) z -= bt.belly * gauss(y - yBelly, 0.12) * Math.min(1, wT + wH) * Math.max(0, 1 - (Math.abs(x) / 0.25) ** 2);
    else z += Math.max(0, bt.hips - 1) * 0.1 * gauss(y - (hipY - 0.03), 0.1) * Math.min(1, wH + wL) + Math.max(0, bt.belly) * 0.25 * gauss(y - (yChest - 0.05), 0.12) * torsoLike;   // back and seat
    // the hips and the top of the thigh follow the hips
    if (wL > 0.01) x *= 1 + (bt.hips - 1) * 0.6 * gauss(y - (hipY - 0.04), 0.1) * wL;
    // arms: the whole arm shifts out with the shoulder; the upper arm carries the thickness, the forearm tapers
    if (wA > 0.01) {
      const fx = 1 + (bt.shoulders - 1) * wA;
      const t = sstep(shY, wrY, y), axX = sx * (armX + (wristX - armX) * (1 - t)) * bt.shoulders;
      x -= sx * ARM_IN * sstep(shY - 0.03, wrY, y) * wA;
      const dx = x * fx - axX, dz = z - cz0;
      const kUp = bt.arms / Math.max(0.8, bt.shoulders), k = 1 + (lerp(kUp, 1 + (kUp - 1) * 0.5, sstep(elY + 0.02, elY - 0.1, y)) - 1) * wA;
      x = axX + dx * k; z = cz0 + dz * k;
      // PEOPLE5: a sleeve is a straight-cut slab, not a sausage: the upper arm is a little flatter front to back (and wider by a fraction), the forearm breaks slightly forward at the elbow
      const za = lerp(R.shoulderL[2], R.wristL[2], t), slab = sstep(shY - 0.015, shY - 0.1 * K, y) * (1 - sstep(elY + 0.05, elY - 0.05, y)) * wA;
      z = za + (z - za) * (1 - 0.16 * slab); x = axX + (x - axX) * (1 + 0.05 * slab);
      z -= 0.014 * K * sstep(elY + 0.03, elY - 0.08, y) * wA;
    }
    // legs: out with the hips, thickness about the leg axis following the profile
    if (wL > 0.01) {
      const axX = sx * hipX * legK, kk = 1 + (legProfile(Math.min(1, Math.max(0, (y - anY) / (hipY - anY))) ) - 1) * wL, zc = R.kneeL[2];
      x = axX + (x * (1 + (legK - 1) * wL) - axX) * kk;
      z = zc + (z - zc) * kk;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  }
  flattenTorso(L, pos, hipY + 0.02, shY + 0.01, cz0, 1);
  let normal = shadeNormals(L, pos);
  const covered = isCoveredLeg(spec.bottom.kind), detail: LegDetail = L === s.lods.hi ? 'hi' : L === s.lods.mid ? 'mid' : L === s.lods.far ? 'far' : L.index.length / 3 > 2200 ? 'hi' : L.index.length / 3 > 700 ? 'mid' : 'far';
  if (dress) {
    const top = spec.top, bot = spec.bottom;
    const tk = (THICK_SKIN[top.kind] ?? 0), tb = THICK_BOT_SKIN[bot.kind] ?? 0, hemTop = topHemY(s, spec);
    const sleeveCut = top.sleeves === 'short' ? elY + (shY - elY) * 0.42 : top.sleeves === 'long' ? wrY + 0.06 : (top.kind === 'jersey' ? shY - 0.05 : 9);
    const baggy = ['puffer', 'hoodie', 'jacket', 'cardigan', 'tracksuit'].includes(top.kind);
    const shortsEnd = knY + shortsLen(bot.cut) + 0.01;
    const out = new Float32Array(pos);
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1], x = pos[i * 3];
      const wT = wsumAt(L, i, W_TORSO), wH = wsumAt(L, i, W_HIPS), wA = wsumAt(L, i, W_ARMS), wL = wsumAt(L, i, W_LEGS);
      const cover = sstep(hemTop - 0.025, hemTop + 0.06, y), neck = sstep(shY + 0.09, shY + 0.02, y);
      let t = 0;
      if (top.kind !== 'vest' || true) t += tk * Math.min(1, wT + wH * 0.8) * cover * neck;
      if (top.sleeves !== 'none' || top.kind === 'jersey') t += tk * 0.85 * wA * sstep(sleeveCut - 0.03, sleeveCut + 0.03, y) * sstep(wrY, wrY + 0.1, y);
      if (baggy || top.long) t += tk * 0.8 * gauss(y - (hemY + 0.02), 0.12) * Math.min(1, wT + wH) * cover;           // the hem hangs off the hips
      if (top.kind === 'puffer') t *= 0.97 + 0.03 * Math.sin(((shY + 0.1 - y) / 0.088) * Math.PI * 2);                  // baffles are painted; the geometry keeps only a trace of them (ridges read as muscle)
      const botW = bot.kind === 'shorts' ? sstep(shortsEnd - 0.03, shortsEnd + 0.03, y) : 1;
      t += tb * Math.min(1, wL + wH * (1 - cover)) * sstep(anY + 0.02, anY + 0.14, y) * botW * (bot.kind === 'skirt' || bot.kind === 'leggings' && false ? 0 : 1);
      if ((bot.kind === 'cargo' || bot.kind === 'sweats') && wL > 0.3) t += 0.008 * sstep(knY, knY - 0.2, y) * sstep(anY + 0.04, anY + 0.12, y);   // the leg breaks over the shoe
      void x;
      if (t > 0) { out[i * 3] += normal[i * 3] * t; out[i * 3 + 1] += normal[i * 3 + 1] * t * 0.3; out[i * 3 + 2] += normal[i * 3 + 2] * t; }
    }
    // the clothed arm is a straight cut: its radius never grows from the shoulder down to the cuff (pedCuts.straightenArms)
    if (top.sleeves === 'long' || top.sleeves === 'short') straightenArms(L, out, shY - 0.08 * K, (top.sleeves === 'long' ? wrY + 0.03 : sleeveCut + 0.01), 1);
    normal = shadeNormals(L, out);
    return covered ? withTubes(s, spec, L, out, normal, bt, legK, detail) : { ...L, position: out, normal };
  }
  return covered ? withTubes(s, spec, L, pos, normal, bt, legK, detail) : { ...L, position: pos, normal };
}
function withTubes(s: MhShape, spec: PedSpec, L: MhLod, pos: Float32Array, normal: Float32Array, bt: BodyType, legK: number, detail: LegDetail): MhLod {
  const r = legTubes(s, spec, L, pos, normal, bt, legK, detail);
  return { ...r.lod, tube: r.tube };
}

/** extra geometry the silhouette needs in skin mode: a hood roll round the neck, the flare of a long coat */
/** x / z extents of the dressed body in a height band, from the vertices that pass `keep` */
function bodyRing(L: MhLod, y0: number, y1: number, keep: (i: number) => boolean): { cx: number; cz: number; rx: number; rz: number } | null {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < L.position.length / 3; i++) {
    const y = L.position[i * 3 + 1];
    if (y < y0 || y > y1 || !keep(i)) continue;
    x0 = Math.min(x0, L.position[i * 3]); x1 = Math.max(x1, L.position[i * 3]); z0 = Math.min(z0, L.position[i * 3 + 2]); z1 = Math.max(z1, L.position[i * 3 + 2]);
  }
  return isFinite(x0) ? { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 } : null;
}
/** the cloth shapes the skin cannot hold: the standing hem of a jacket or hoodie, a kangaroo pocket, the break of a trouser leg over the shoe */
function stripGeometry(m: StripMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.jnt, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.wgt, 4)); g.setIndex(m.idx);
  return g;
}
function clothExtras(s: MhShape, spec: PedSpec, L: MhLod, hi: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], seg = hi ? 18 : 10, k = spec.top.kind, hemTop = topHemY(s, spec), anY = s.landmarks.ankleY;
  if (['jacket', 'hoodie', 'puffer', 'cardigan', 'tracksuit', 'uniform'].includes(k) && !spec.top.long) {
    const notArm = (i: number): boolean => wsumAt(L, i, W_ARMS) < 0.3;
    const r = bodyRing(L, hemTop - 0.06, hemTop + 0.1, notArm), r2 = bodyRing(L, hemTop + 0.1, hemTop + 0.16, notArm);
    if (r && r2) {
      // the hem of a top is a layer of its own: a wall standing 10 mm proud of the trousers (hard-shaded lip, flat underside), then a soft return into the body
      const o = k === 'puffer' ? 0.012 : k === 'jacket' || k === 'hoodie' ? 0.011 : 0.009;
      const m = new StripMesh(), uvT = (u: number, v: number): [number, number] => { const q = SK_RECTS.torso; return [(q.x + 3 + u * (q.w - 6)) / ATLAS, 1 - (q.y + 3 + (1 - v) * (q.h - 6)) / ATLAS]; };
      // PEOPLE5: the band is lofted along the measured outline of the body (pedCuts.hemRows), so it always stands outside the body: a clean ring, no chips, no diamonds
      const hb = hemRows(L, L.position, hemTop, o, hi ? 20 : 12, hi);
      if (hb) for (const rows of hb.rows) addPolarStrip(m, rows, { seg: hi ? 20 : 12, skin: { j: [2, 0, 0, 0], w: [1, 0, 0, 0] }, uv: (u) => uvT(u, 0.5) });
      out.push(stripGeometry(m));
      if (k === 'hoodie') {
        const zf = r.cz - r.rz;      // the pocket: a soft pad on the front of the belly
        out.push(loft([
          { y: hemTop + 0.03, rx: r.rx * 0.62, rz: 0.012, cx: r.cx, cz: zf + 0.008 },
          { y: hemTop + 0.09, rx: r.rx * 0.7, rz: 0.03, cx: r.cx, cz: zf + 0.002 },
          { y: hemTop + 0.17, rx: r.rx * 0.5, rz: 0.012, cx: r.cx, cz: zf + 0.012 },
        ], hi ? 12 : 8, SK_RECTS.torso, 2, 'both'));
      }
    }
  }
  // PEOPLE5: the crisp end of a sleeve, the same edge language as the trouser hem: a lip 5 to 6.5 mm proud of the arm with a flat underside facing the hand (pedCuts.cuffRows)
  if (spec.top.sleeves === 'long' || spec.top.sleeves === 'short') {
    const Rr = s.rig, long = spec.top.sleeves === 'long', yEnd = long ? Rr.wristL[1] + 0.012 : Rr.elbowL[1] + (Rr.shoulderL[1] - Rr.elbowL[1]) * 0.42, sg = hi ? 8 : 6;
    for (const side of [-1, 1] as const) {
      const rows = cuffRows(L, L.position, side, yEnd, long ? 0.034 : 0.022, long ? 0.0065 : 0.005, sg);
      if (!rows) continue;
      const m = new StripMesh(), q = SK_RECTS.torso, bone = (yEnd > Rr.elbowL[1] ? 4 : 5) + (side < 0 ? 0 : 2);
      for (const rr of rows) addPolarStrip(m, rr, { seg: sg, skin: { j: [bone, 0, 0, 0], w: [1, 0, 0, 0] }, uv: (u) => [(q.x + 3 + u * (q.w - 6)) / ATLAS, 1 - (q.y + 3 + 0.5 * (q.h - 6)) / ATLAS] });
      out.push(stripGeometry(m));
    }
  }
  if (['jeans', 'trousers', 'cargo', 'sweats'].includes(spec.bottom.kind) && !L.tube) {
    const R = peopleRig(s, spec);
    for (const side of ['L', 'R']) {
      const a = R['ankle' + side], bone = side === 'L' ? 9 : 11;
      const r = bodyRing(L, anY + 0.03, anY + 0.075, (i) => Math.abs(L.position[i * 3] - a[0]) < 0.07 && wsumAt(L, i, W_LEGS) > 0.5);
      if (!r) continue;
      const f = spec.bottom.kind === 'trousers' ? 0.012 : spec.bottom.kind === 'cargo' ? 0.018 : 0.008;
      out.push(loft([
        { y: anY + 0.012, rx: r.rx + f + 0.006, rz: r.rz + f + 0.008, cx: r.cx, cz: r.cz - 0.008 },
        { y: anY + 0.05, rx: r.rx + f * 0.7 + 0.004, rz: r.rz + f * 0.7 + 0.004, cx: r.cx, cz: r.cz - 0.004 },
        { y: anY + 0.13, rx: r.rx + 0.002, rz: r.rz + 0.002, cx: r.cx, cz: r.cz },
      ], hi ? 12 : 8, SK_RECTS.pelvis, bone));
    }
  }
  return out;
}
function skinExtras(s: MhShape, spec: PedSpec, hi: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], lm = s.landmarks, R = s.rig, seg = hi ? 16 : 9;
  const hr = s.headRings, bt = bodyTypeOf(spec);
  // (no hood roll round the neck any more: it read as a black collar block; the neckline and the hood opening are painted into the skin)
  if (spec.top.long && spec.top.kind !== 'dress') {
    // a coat's lower half: narrower flare than before (the hands hang outside it), starts inside the dressed waist, textured with the bottom rows of the torso tile
    const hip = s.hipRings, top = hip[hip.length - 1], tor = s.torsoRings, waist = tor[0], kneeY = R.kneeL[1] + 0.05, w = Math.max(1, bt.hips);
    const coatRect = SK_RECTS.torso;
    out.push(swingSkirt(loft([
      { y: kneeY, rx: (top[1] + 0.062) * w, rz: top[3] + 0.05, cz: top[2] },
      { y: (kneeY + top[0]) / 2 + 0.05, rx: (top[1] + 0.04) * w, rz: top[3] + 0.034, cz: top[2] },
      { y: top[0] - 0.01, rx: (top[1] + 0.024) * w, rz: top[3] + 0.024, cz: top[2] },
      { y: waist[0] + 0.05, rx: waist[1] * 0.985, rz: waist[3] * 0.985, cz: waist[2] },
    ], seg, coatRect, 1), waist[0] + 0.05, kneeY));
  }
  return out;
}

// ---------------------------------------------------------------- geometry per shape, variant and LOD

/**
 * The foot: the skin's own foot is cut off at the ankle and replaced by a chunky shoe (one lofted form per foot, painted from the shoe swatch): a flat sole on
 * the ground, a square-ish section (a superellipse, not an egg), a toe cap, a heel block that stands out behind the trouser hem. Length about 1.1 head heights,
 * wider than the ankle, pointing straight forward. Under trousers it stands on the axis of the cut leg tube (L.tube) and its heel is 2.6 cm behind the hem.
 */
function shoeParts(s: MhShape, spec: PedSpec, L: MhLod, hi: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], R = peopleRig(s, spec), anY = s.landmarks.ankleY, rect = SK_RECTS.shoe, seg = hi ? 12 : 8;
  const bt = bodyTypeOf(spec), K = Math.min(1.15, Math.max(0.85, (s.landmarks.crownY / 1.78) * (0.9 + 0.1 * bt.legs)));
  const T = [0, 0.03, 0.1, 0.24, 0.42, 0.6, 0.78, 0.92, 1];
  const W = [0.017, 0.039, 0.052, 0.059, 0.057, 0.051, 0.045, 0.042, 0.04], H = [0.034, 0.06, 0.078, 0.088, 0.097, 0.115, 0.131, 0.138, 0.134];      // PEOPLE5: a taller, wider toe box; the vamp reaches 10 cm at the trouser hem
  const flat = spec.sex === 'f' && !spec.shoes.high && !/#f|#e/i.test(spec.shoes.color), len = 0.272 * Math.max(0.93, K);
  for (const side of ['L', 'R']) {
    const a = R['ankle' + side], bone = side === 'L' ? 9 : 11;
    let cx: number, zHeel: number;
    if (L.tube) { cx = side === 'L' ? L.tube.xL : L.tube.xR; zHeel = L.tube.cz + L.tube.rz + 0.026; }
    else {
      // bare legs: the leg's own radius at the ankle, from the dressed skin
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < L.position.length / 3; i++) {
        const y = L.position[i * 3 + 1], x = L.position[i * 3];
        if (y > anY + 0.03 && y < anY + 0.075 && Math.abs(x - a[0]) < 0.07) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, L.position[i * 3 + 2]); z1 = Math.max(z1, L.position[i * 3 + 2]); }
      }
      if (!isFinite(x0)) { const r0 = s.legRings.shin.find((q) => q) ?? [anY + 0.03, 0.04, 0, 0.04, a[0]]; x0 = a[0] - r0[1]; x1 = a[0] + r0[1]; z0 = r0[2] - r0[3]; z1 = r0[2] + r0[3]; }
      cx = (x0 + x1) / 2; zHeel = (z0 + z1) / 2 + (z1 - z0) / 2 + 0.02;
    }
    const zToe = zHeel - len;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], row = seg + 1;
    for (let i = 0; i < T.length; i++) {
      const z = zToe + T[i] * (zHeel - zToe), w = W[i] * K, h = (flat ? H[i] * 0.85 : H[i]) * K;
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        const bottom = Math.abs(((th + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.55;            // the sole: flat on the ground
        pos.push(cx + w * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5), bottom ? 0 : Math.max(0, h * (1 - Math.sign(c) * Math.pow(Math.abs(c), 0.5)) / 2), z);
        const px = rect.x + 0.5 + (j / seg) * (rect.w - 1), py = rect.y + 0.5 + T[i] * (rect.h - 1);
        uv.push(px / 512, 1 - py / 512);
      }
    }
    for (let i = 0; i + 1 < T.length; i++) for (let j = 0; j < seg; j++) { const p = i * row + j, q = p + 1, r = p + row, t = r + 1; idx.push(p, r, q, q, r, t); }
    // heel block (closes the back) and the toe cap
    for (const [ri, up] of [[T.length - 1, true], [0, false]] as const) {
      const base = pos.length / 3; let sy = 0;
      for (let j = 0; j < seg; j++) sy += pos[(ri * row + j) * 3 + 1]; sy /= seg;
      pos.push(cx, sy, pos[(ri * row) * 3 + 2]); uv.push(uv[(ri * row) * 2], uv[(ri * row) * 2 + 1]);
      for (let j = 0; j < seg; j++) { const p = ri * row + j; if (up) idx.push(base, p + 1, p); else idx.push(base, p, p + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { si[k * 4] = bone; sw[k * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    out.push(g);
  }
  return out;
}

const geoCache = new Map<string, { geo: THREE.BufferGeometry; triangles: number }>();
const dressCache = new Map<string, MhLod>();
/** the body of a variant at a LOD: body type and clothing thickness applied to the shape's skin (shared by the geometry and the texture bake) */
function dressedFor(s: MhShape, variant: number, detail: PedDetail): MhLod {
  const key = `${s.name}:${variant}:${detail}`;
  let dl = dressCache.get(key);
  if (!dl) { dl = dressLod(s, PED_SPECS[variant], s.lods[detail], true); dressCache.set(key, dl); }
  return dl;
}
/** the skin without its own feet (the shoes replace them) */
/** PEOPLE5: under a skirt, a dress or a long coat the legs are cut away above this height (just above the hem), so no thigh can walk out of the front of the garment; undefined = no cut */
export function legCutY(s: MhShape, spec: PedSpec): number | undefined {
  if (spec.bottom.kind === 'skirt') return s.landmarks.crownY * skirtShape(spec.bottom, spec.top.kind === 'dress').hem + 0.035;
  if (spec.top.long && spec.top.kind !== 'dress') return s.rig.kneeL[1] + 0.05 + 0.035;
  return undefined;
}
function noFoot(s: MhShape, L: MhLod, hide?: Set<number>, legCut?: number): Uint32Array {
  const cut = s.landmarks.ankleY + 0.035, keep: number[] = [];
  for (let t = 0; t < L.index.length; t += 3) {
    if (hide?.has(t / 3)) continue;
    if (legCut !== undefined && [0, 1, 2].every((k) => L.position[L.index[t + k] * 3 + 1] > legCut && wsumAt(L, L.index[t + k], W_LEGS) >= 0.5)) continue;
    let foot = true;
    for (let k = 0; k < 3; k++) { const v = L.index[t + k]; if (!(L.position[v * 3 + 1] < cut && (wsumAt(L, v, [9]) + wsumAt(L, v, [11])) > 0.5)) foot = false; }
    if (!foot) keep.push(L.index[t], L.index[t + 1], L.index[t + 2]);
  }
  return Uint32Array.from(keep);
}
/** hair, beard, hat, glasses and bags as separate pieces fitted to the dressed skin (pedPieces.ts); at the mid level only the big forms (no earbuds, chain, glasses). The hi level hijab is the drape of hijabShell. */
const MID_SKIP = new Set(['earbuds', 'chain', 'glasses', 'sunglasses']);
function separatePieces(s: MhShape, spec: PedSpec, bt: BodyType, L0: MhLod, detail: PedDetail, veil: boolean): THREE.BufferGeometry[] {
  const ps = personPieces(makeCtx(s, spec, bt, L0, peopleRig(s, spec), detail as 'hi' | 'mid')).pieces;
  return ps.filter((p) => !(veil && p.slot === 'hat') && !(detail !== 'hi' && p.slot === 'accessory' && MID_SKIP.has(p.id.split(':')[1] ?? p.id))).map((p) => p.geo);
}
function geometryFor(s: MhShape, variant: number, detail: PedDetail): { geo: THREE.BufferGeometry; triangles: number } {
  const key = `${s.name}:${variant}:${detail}`;
  let c = geoCache.get(key);
  if (c) return c;
  const spec = PED_SPECS[variant];
  const L0 = dressedFor(s, variant, detail), bt = bodyTypeOf(spec), pivot = s.rig.torso;
  const L = { ...L0, position: new Float32Array(L0.position), normal: new Float32Array(L0.normal) };
  leanGeometry(L.position, L.normal, L.joints, L.weights, bt, pivot);
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.BufferAttribute(L.position, 3));
  base.setAttribute('normal', new THREE.BufferAttribute(L.normal, 3));
  base.setAttribute('uv', new THREE.BufferAttribute(L.uv, 2));
  base.setAttribute('skinIndex', new THREE.BufferAttribute(L.joints, 4));
  base.setAttribute('skinWeight', new THREE.BufferAttribute(L.weights, 4));
  const ao = bodyAo(s, L0.position);
  const veil = detail === 'hi' && spec.hat === 'hijab' ? hijabShell(s, L0, ao, spec) : null;      // the hijab at the hi level is a drape made from the head and shoulders
  base.setIndex(new THREE.BufferAttribute(detail === 'far' ? L.index : noFoot(s, L, veil?.hide, legCutY(s, spec)), 1));
  const parts = detail === 'far' ? [] : [...separatePieces(s, spec, bt, L0, detail, !!veil), ...bodyParts(s, spec, detail === 'hi'), ...skinExtras(s, spec, detail === 'hi'), ...clothExtras(s, spec, L0, detail === 'hi')];
  if (detail === 'hi' && veil) parts.push(...veil.shell);
  for (const g of parts) leanGeometry(g.getAttribute('position').array as Float32Array, (g.getAttribute('normal')?.array as Float32Array) ?? null, g.getAttribute('skinIndex').array, g.getAttribute('skinWeight').array, bt, pivot);
  base.setAttribute('color', new THREE.BufferAttribute(ao, 3));
  for (const g of parts) if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
  const geo = parts.length ? mergeGeometries([base, ...parts], false) : base;
  if (!geo) throw new Error('pedMesh: merge failed');
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  c = { geo, triangles: geo.index!.count / 3 };
  geoCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- the painted material (clothes, face, shoes: one colour map per person)

const matCache = new WeakMap<object, Map<string, THREE.Material>>();
function skinMaterial(materials: IMaterialLibrary, s: MhShape, variant: number, phone: boolean): THREE.Material {
  let byV = matCache.get(materials);
  if (!byV) { byV = new Map(); matCache.set(materials, byV); }
  const key = `${variant}:${phone ? 'p' : 'n'}`;
  let m = byV.get(key);
  if (m) return m;
  const spec = PED_SPECS[variant];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, vertexColors: true, name: `ped:${spec.id}` });
  if (typeof document !== 'undefined') {
    try {
      const L = dressedFor(s, variant, 'hi');
      const canvas = bakeSkin({ position: L.position, normal: L.normal, uv: L.uv, index: L.index, joints: L.joints, weights: L.weights, landmarks: s.landmarks, rig: peopleRig(s, spec), headRings: s.headRings as number[][], topHem: topHemY(s, spec), spec }, phone ? 256 : 512);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.name = `ped:${spec.id}`;
      mat.map = tex;
    } catch (e) { warnOnce(`pedbake:${spec.id}`, 'ped texture bake failed, flat colour', e); }
  }
  if (!mat.map) mat.color.set(spec.top.color);
  byV.set(key, mat);
  return mat;
}
function peopleRig(s: MhShape, spec: PedSpec): Record<string, number[]> {
  const bt = bodyTypeOf(spec), R: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(s.rig)) R[k] = jointFor(k, v, bt);
  return R;
}

// ---------------------------------------------------------------- the model

/** stature in head heights (chin to crown) by age: 7.2 for an adult, the GTA IV figure; a bigger head on a body type (short, petite, teen, kid) takes a share of it */
export const HEADS_OF_STATURE: Record<'adult' | 'old' | 'teen' | 'kid', number> = { adult: 7.2, old: 7.3, teen: 6.9, kid: 6.2 };
export function headsOf(spec: PedSpec, bt: BodyType): number {
  const age = spec.age ?? 'adult';
  return HEADS_OF_STATURE[age === 'old' ? 'old' : age === 'teen' ? 'teen' : age === 'kid' ? 'kid' : 'adult'] / Math.sqrt(bt.head);
}
/** scale of the head bone that gives a person `headsOf` head heights of stature (the head grows about the neck joint, so the crown rises with it) */
export function headScaleFor(s: MhShape, spec: PedSpec, bt: BodyType): number {
  const lm = s.landmarks, head = lm.crownY - lm.chinY, c = lm.crownY - s.rig.head[1], T = headsOf(spec, bt);
  const k = (s.height - c) / (T * head - c);
  return Math.min(1.35, Math.max(0.95, k));
}

export function buildMhPedModel(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel | null {
  if (!peopleReady()) return null;
  let variant: number;
  if (opts.variant === undefined) variant = pickWardrobeVariant(rng, pickPedVariant(rng), pedPhone());      // PEOPLE6: the street mix picks who, the wardrobe dresses them from the pedestrian's own stream
  else if (typeof opts.variant === 'string') variant = pedVariantIndex(opts.variant);
  else variant = ((Math.floor(opts.variant) % PED_SPECS.length) + PED_SPECS.length) % PED_SPECS.length;
  const spec = PED_SPECS[variant];
  const shape = shapes.get(shapeFor(spec)) ?? shapes.values().next().value as MhShape;
  const phone = pedPhone();
  const mat = skinMaterial(materials, shape, variant, phone);

  const group = new THREE.Group();
  group.name = 'human';
  group.userData.pedVariant = spec.id;
  group.userData.pedShape = shape.name;
  // arms hang a little out from a wide body or a flared coat: set on the arm pivots by the pedestrian animation (Pedestrian.reactionPose)
  group.userData.splay = ((): number => { const b = bodyTypeOf(spec); return Math.min(0.2, Math.max(0.02, (spec.top.long ? 0.12 : 0) + (spec.top.kind === 'puffer' ? 0.07 : 0) + Math.max(0, (Math.max(b.hips, b.chest, 1) - 1)) * 0.3 + (spec.bottom.kind === 'skirt' ? 0.05 : 0) + 0.03)); })();
  const bt = bodyTypeOf(spec), R: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(shape.rig)) R[k] = jointFor(k, v, bt, shape.rig.torso);
  const rig = new THREE.Bone(); rig.name = 'rig'; group.add(rig);
  const bone = (name: string, parent: THREE.Object3D, world: number[], pw: number[]): THREE.Bone => { const b = new THREE.Bone(); b.name = name; b.position.set(world[0] - pw[0], world[1] - pw[1], world[2] - pw[2]); parent.add(b); return b; };
  const O = [0, 0, 0];
  const hips = bone('hips', rig, R.hips, O), torso = bone('torso', rig, R.torso, O), head = bone('head', rig, R.head, O);
  const arms: THREE.Object3D[] = [], elbows: THREE.Object3D[] = [], legs: THREE.Object3D[] = [], knees: THREE.Object3D[] = [];
  for (const side of ['L', 'R']) {
    const arm = bone(`arm${side}`, torso, R['shoulder' + side], R.torso);
    const elbow = bone('elbow', arm, R['elbow' + side], R['shoulder' + side]);
    const leg = bone(`leg${side}`, rig, R['hip' + side], O);
    const knee = bone('knee', leg, R['knee' + side], R['hip' + side]);
    arms.push(arm); elbows.push(elbow); legs.push(leg); knees.push(knee);
  }
  const bones = [rig, hips, torso, head, arms[0], elbows[0], arms[1], elbows[1], legs[0], knees[0], legs[1], knees[1]] as THREE.Bone[];
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const lod = new PedLod(); lod.name = 'pedLod'; lod.exempt = opts.heightScale !== undefined;
  const levels: Array<[PedDetail, number]> = phone ? [['mid', 0], ['far', FAR_DIST]] : [['hi', 0], ['mid', MID_DIST], ['far', FAR_DIST]];
  let triangles = 0;
  for (const [detail, dist] of levels) {
    const g = geometryFor(shape, variant, detail);
    const m = new THREE.SkinnedMesh(g.geo, mat);
    m.name = dist === 0 ? 'body' : `body-${detail}`;
    m.frustumCulled = false;
    lod.addLevel(m, dist);
    if (dist === 0) triangles = g.triangles;
  }
  group.add(lod);
  group.updateMatrixWorld(true);
  for (const lv of lod.levels) (lv.object as THREE.SkinnedMesh).bind(skeleton);
  if (opts.heightScale !== undefined) group.scale.setScalar(opts.heightScale);
  else {
    // a person of their own: the body type sets stature and build, a little personal variation on top (stature 1.5 to 1.95 m for adults)
    const age = spec.age ?? 'adult', grown = age === 'adult' || age === 'old';
    const tri = (): number => (rng.range(-1, 1) + rng.range(-1, 1)) * 0.5;
    const skinMode = peopleMode() === 'skin';
    const bh = skinMode ? bt.h : BUILD_SCALE[spec.build][1], bw = skinMode ? 1 : BUILD_SCALE[spec.build][0];
    let target = shape.height * (bh + tri() * (grown ? 0.04 : 0.03)) * (age === 'old' ? 0.985 : 1);
    if (grown) target = Math.min(1.95, Math.max(1.5, target));
    // the head is sized by HEADS OF STATURE (adults 7.2, GTA IV proportion), not by a factor on the MakeHuman head (which is a small head: 7.9 heads);
    // the taller head lifts the crown, so the stature is brought back to the target
    const headK = headScaleFor(shape, spec, bt), crownRise = 1 + ((headK - 1) * (shape.landmarks.crownY - shape.rig.head[1])) / shape.height;
    const hs = target / shape.height / crownRise, wide = bw * (1 + tri() * 0.04);
    group.scale.set(wide * (0.98 + 0.02 * hs), hs, wide * (0.98 + 0.02 * hs));
    if (leanOf(bt) !== 0) torso.userData.stoopBaked = leanOf(bt);      // the lean is in the rest pose of the skin and the rig (not an extra pose)
    for (const k of [0, 1]) arms[k].scale.y = 1 + rng.range(-0.02, 0.02);
    head.scale.setScalar((skinMode ? headK : age === 'kid' ? 1.06 : 1) * rng.range(0.985, 1.015));
    torso.scale.set(1 + rng.range(-0.015, 0.015), 1, 1 + rng.range(-0.02, 0.02));
  }
  return { group, legs, arms, head, knees, elbows, torso, rig, hips, spec, variant, triangles };
}

/** Drop-in for pedBodyHi.buildPedModel: the MakeHuman people when loaded, else PEDHI's procedural ones. */
export function buildPerson(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel {
  return buildMhPedModel(materials, rng, opts) ?? buildProcedural(materials, rng, opts);
}
export type { PedDetail, HiTile };
