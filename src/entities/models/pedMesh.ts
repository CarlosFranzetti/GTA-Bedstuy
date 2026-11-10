/**
 * People from a real humanoid base mesh (MakeHuman base mesh, CC0 data; see scripts/people-pipeline.mjs and
 * src/assets/models/people/src/LICENSE.txt). The pipeline ships one meshopt glb per body shape with three LODs (hi ~4k, mid ~1.5k,
 * far ~400 triangles), skinned to the same 12-bone rig as pedBodyHi.ts, and with UVs already projected into the tiles of PEDHI's
 * 512 px atlas (HI_RECTS in textures/painters/pedHi.ts). So the clothing, skin and face of every variant are PEDHI's own painted
 * albedo / normal / roughness maps (pedHiMaterial), now landing on real anatomy; the face is painted on the real face geometry
 * (planar projection fitted to chin / mouth / nose / eye landmarks of each shape).
 *
 * Hair, hats, skirts and packs are caps lofted around the shape's measured head / torso / hip rings and merged into the body
 * geometry, so a person is ONE SkinnedMesh per LOD (one draw), with one shared material per variant.
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
import { HI_RECTS, type HiTile } from '@/textures/painters/pedHi';
import { PED_SPECS, PED_VARIANT_COUNT, pedVariantIndex, type PedSpec, type PxRect } from '@/textures/painters/ped';
import { FAR_DIST, MID_DIST, PedLod, buildPedModel as buildProcedural, pedHiMaterial, pedPhone, type PedDetail } from './pedBodyHi';
import { garmentParts, headShell, nonFootTriangles, shoeParts } from './pedGarments';
import { pickPedVariant, type PedModel, type PedOptions } from './pedBody';

type Ring = [number, number, number, number, number?]; // y, rx, cz, rz, cx (half extents round the centre)
export interface MhLod { position: Float32Array; normal: Float32Array; uv: Float32Array; joints: Uint16Array; weights: Float32Array; index: Uint32Array }
export interface MhShape {
  name: string;
  height: number;
  rig: Record<string, number[]>;
  landmarks: { chinY: number; crownY: number; eyeY: number; eyeX: number; hemY: number; ankleY: number; wristY: number };
  headRings: Ring[]; torsoRings: Ring[]; hipRings: Ring[];
  /** left limbs (x < 0), ascending in y */
  armRings: { upper: Ring[]; fore: Ring[] }; legRings: { thigh: Ring[]; shin: Ring[] };
  lods: Record<PedDetail, MhLod>;
}

const shapes = new Map<string, MhShape>();
export function peopleFlag(): boolean { return (import.meta.env?.VITE_PEOPLE ?? 'mh') !== 'hi'; }
export function peopleReady(): boolean { return peopleFlag() && shapes.size > 0; }
export function peopleShapes(): string[] { return [...shapes.keys()]; }
export function clearPeople(): void { shapes.clear(); geoCache.clear(); }

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
    lods[o.name as PedDetail] = { position, normal: weldedNormals(position, index), uv, joints, weights, index };
  });
  if (!lods.hi || !lods.mid || !lods.far) throw new Error('people glb needs meshes hi, mid and far');
  const p = meta as Omit<MhShape, 'name' | 'lods'> & { shape: string };
  return { name: p.shape, height: p.height, rig: p.rig, landmarks: p.landmarks, headRings: p.headRings, torsoRings: p.torsoRings, hipRings: p.hipRings, armRings: p.armRings, legRings: p.legRings, lods };
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

/** hair / hat parts of a shape and variant, ready to merge (bone 3 = head) */
function headParts(s: MhShape, spec: PedSpec, hiDetail: boolean): THREE.BufferGeometry[] {
  // at the hi level short hair and scarves are volumes made from the skull surface (pedGarments.headShell); the rest is lofted here
  const lm = s.landmarks, H = lm.crownY - lm.chinY, Y = (t: number): number => lm.chinY + t * H;
  const seg = hiDetail ? 18 : 10;
  const hairR = HI_RECTS.hair, hatR = HI_RECTS.hat;
  const out: THREE.BufferGeometry[] = [];
  /** dome around the head from height t0 up: inflate k (+ pad), front pulled back by `pull` * rz at the lowest ring */
  const dome = (t0: number, k: number, pad: number, pull: number, topT = 1.02): R[] => {
    const ts = [t0, t0 + (1 - t0) * 0.25, t0 + (1 - t0) * 0.5, t0 + (1 - t0) * 0.75, 0.985, topT];
    return ts.map((t, i) => {
      const y = Y(Math.min(t, 1)), r = ringAt(s.headRings, Math.min(y, Y(0.985)));
      const top = i === ts.length - 1, shrink = top ? 0.12 : i === ts.length - 2 ? 0.7 : 1;
      const p = i === 0 ? pull : i === 1 ? pull * 0.45 : i === 2 ? pull * 0.05 : 0;
      return { y: top ? Y(1) + pad * 1.4 : y, rx: (r.rx * k + pad) * shrink, rz: (r.rz * k + pad) * shrink, cz: r.cz + r.rz * p };
    });
  };
  const covered = spec.hat !== 'none';
  const hairCap = (): void => { if (!hiDetail) out.push(loft(dome(0.42, 1.045, 0.006, 0.34), seg, hairR, 3, 'top')); };
  const ball = (cx: number, y: number, cz: number, rr: number, rect: PxRect): void => {
    out.push(loft([{ y: y - rr, rx: rr * 0.3, rz: rr * 0.3, cx, cz }, { y: y - rr * 0.6, rx: rr * 0.85, rz: rr * 0.85, cx, cz }, { y, rx: rr, rz: rr, cx, cz }, { y: y + rr * 0.6, rx: rr * 0.85, rz: rr * 0.85, cx, cz }, { y: y + rr, rx: rr * 0.3, rz: rr * 0.3, cx, cz }], 10, rect, 3, 'both'));
  };
  const top = ringAt(s.headRings, Y(0.9)), backZ = top.cz + top.rz;
  switch (spec.hair) {
    case 'bald': break;
    case 'short': case 'fade': if (!covered) hairCap(); break;
    case 'afro': { const r = ringAt(s.headRings, Y(0.72)); ball(0, Y(0.93), r.cz + r.rz * 0.42, Math.max(r.rx, r.rz) * 1.28, hairR); break; }
    case 'puff': if (!covered) hairCap(); ball(0, Y(1.1), backZ - top.rz * 0.5, H * 0.17, hairR); break;
    case 'bun': if (!covered) hairCap(); ball(0, Y(1.0), backZ - 0.01, H * 0.14, hairR); break;
    case 'long': {
      if (!covered) hairCap();
      const r = ringAt(s.headRings, Y(0.55));
      out.push(loft([{ y: Y(-1.25), rx: r.rx * 0.75, rz: 0.04, cz: r.cz + r.rz * 0.95 }, { y: Y(-0.75), rx: r.rx * 0.9, rz: 0.045, cz: r.cz + r.rz * 0.98 }, { y: Y(-0.3), rx: r.rx * 1.0, rz: 0.05, cz: r.cz + r.rz * 1.0 }, { y: Y(0.1), rx: r.rx * 1.12, rz: r.rz * 0.55, cz: r.cz + r.rz * 0.72 }, { y: Y(0.5), rx: r.rx * 1.1, rz: r.rz * 0.8, cz: r.cz + r.rz * 0.3 }], 14, hairR, 3, 'bottom'));
      break;
    }
    case 'peyot': {
      // curled side locks: a tapered helix in front of each ear
      const r = ringAt(s.headRings, Y(0.5));
      for (const sx of [-1, 1]) {
        const rings: R[] = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14, th = u * Math.PI * 3.2, rad = 0.011 * (1 - u * 0.35);
          rings.push({ y: Y(0.52) - u * H * 0.42, rx: 0.0082 * (1 - u * 0.5), rz: 0.0082 * (1 - u * 0.5), cx: sx * (r.rx + 0.006 + rad * Math.cos(th)), cz: r.cz - r.rz * 0.35 + rad * Math.sin(th) });
        }
        out.push(loft(rings, 6, hairR, 3, 'bottom'));
      }
      break;
    }
    case 'braids': case 'locs': {
      if (!covered) hairCap();
      const n = spec.hair === 'braids' ? 6 : 9, len = spec.hair === 'braids' ? 0.26 : 0.34, r = ringAt(s.headRings, Y(0.5));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.62 + (i / (n - 1)) * Math.PI * 1.24, x = Math.sin(a) * r.rx * 1.06, z = r.cz + Math.cos(a) * r.rz * 1.06;
        out.push(loft([{ y: Y(0.5) - len, rx: 0.009, rz: 0.009, cx: x, cz: z }, { y: Y(0.5) - len / 2, rx: 0.013, rz: 0.013, cx: x, cz: z }, { y: Y(0.55), rx: 0.019, rz: 0.019, cx: x, cz: z }], 5, hairR, 3, 'bottom'));
      }
      break;
    }
  }
  const visor = (reach: number, w: number): void => { const r = ringAt(s.headRings, Y(0.6)); out.push(loft([{ y: Y(0.6), rx: w, rz: reach * 0.5, cz: r.cz - r.rz - reach * 0.35 }, { y: Y(0.6) + 0.008, rx: w, rz: reach * 0.5, cz: r.cz - r.rz - reach * 0.35 }], 10, hatR, 3, 'both')); };
  switch (spec.hat) {
    case 'none': break;
    case 'cap': out.push(loft(dome(0.6, 1.1, 0.008, 0), seg, hatR, 3, 'top')); visor(0.1, 0.075); break;
    case 'beanie': out.push(loft(dome(0.5, 1.12, 0.01, 0, 1.1), seg, hatR, 3, 'top')); break;
    case 'headwrap': out.push(loft(dome(0.58, 1.12, 0.01, 0, 1.08), seg, hatR, 3, 'top')); ball(0, Y(1.14), top.cz, H * 0.14, hatR); break;
    case 'church': { out.push(loft(dome(0.64, 1.1, 0.008, 0), seg, hatR, 3, 'top')); const r = ringAt(s.headRings, Y(0.64)); out.push(loft([{ y: Y(0.64), rx: 0.235, rz: 0.235, cz: r.cz }, { y: Y(0.64) + 0.012, rx: 0.235, rz: 0.235, cz: r.cz }], 18, hatR, 3, 'both')); break; }
    case 'flat': out.push(loft(dome(0.6, 1.14, 0.01, 0, 1.0), seg, hatR, 3, 'top')); visor(0.07, 0.075); break;
    case 'cop': out.push(loft(dome(0.62, 1.1, 0.008, 0, 1.06), seg, hatR, 3, 'top')); visor(0.08, 0.08); break;
    case 'durag': {
      out.push(loft(dome(0.5, 1.07, 0.007, 0.1), seg, hatR, 3, 'top'));
      for (const sx of [-1, 1]) out.push(loft([{ y: Y(-0.55), rx: 0.016, rz: 0.008, cx: sx * 0.02, cz: backZ + 0.02 }, { y: Y(0.1), rx: 0.018, rz: 0.009, cx: sx * 0.02, cz: backZ + 0.012 }, { y: Y(0.6), rx: 0.016, rz: 0.008, cx: sx * 0.02, cz: backZ }], 4, hatR, 3, 'bottom'));
      break;
    }
    case 'fedora': {
      // a proper wide-brim hat: the crown stands above the head, then the flat brim
      const r = ringAt(s.headRings, Y(0.62)), top = Y(1.0);
      out.push(loft([
        { y: Y(0.55), rx: r.rx * 1.1 + 0.008, rz: r.rz * 1.1 + 0.008, cz: r.cz }, { y: Y(0.78), rx: r.rx * 1.12 + 0.01, rz: r.rz * 1.12 + 0.01, cz: r.cz },
        { y: top, rx: r.rx * 1.1, rz: r.rz * 1.1, cz: r.cz }, { y: top + 0.045, rx: r.rx * 1.02, rz: r.rz * 1.04, cz: r.cz }, { y: top + 0.07, rx: r.rx * 0.9, rz: r.rz * 0.92, cz: r.cz },
      ], seg, hatR, 3, 'top'));
      out.push(loft([{ y: Y(0.55), rx: r.rx + 0.075, rz: r.rz + 0.075, cz: r.cz }, { y: Y(0.55) + 0.008, rx: r.rx + 0.075, rz: r.rz + 0.075, cz: r.cz }], 20, hatR, 3, 'both'));
      break;
    }
    case 'helmet': out.push(loft(dome(0.52, 1.13, 0.012, 0, 1.06), seg, hatR, 3, 'top')); break;
    case 'hijab': if (!hiDetail) out.push(loft(dome(0.25, 1.1, 0.012, 0.5, 1.0), seg, hatR, 3, 'top')); break;
    case 'hardhat': { out.push(loft(dome(0.6, 1.15, 0.01, 0), seg, hatR, 3, 'top')); const r = ringAt(s.headRings, Y(0.6)); out.push(loft([{ y: Y(0.6), rx: 0.12, rz: 0.15, cz: r.cz - 0.03 }, { y: Y(0.6) + 0.012, rx: 0.12, rz: 0.15, cz: r.cz - 0.03 }], 14, hatR, 3, 'both')); break; }
  }
  return out;
}

function bodyParts(s: MhShape, spec: PedSpec, hiDetail: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const seg = hiDetail ? 16 : 9;
  const hip = s.hipRings, tor = s.torsoRings;
  if (spec.bottom.kind === 'skirt') {
    const top = hip[hip.length - 1], hem = s.landmarks.crownY * (spec.bottom.long ? 0.12 : spec.top.kind === 'dress' ? 0.25 : 0.31);
    out.push(loft([{ y: hem, rx: top[1] + 0.1, rz: top[3] + 0.1, cz: top[2] }, { y: (hem + top[0]) / 2, rx: top[1] + 0.05, rz: top[3] + 0.05, cz: top[2] }, { y: top[0], rx: top[1] + 0.015, rz: top[3] + 0.015, cz: top[2] }], seg, HI_RECTS.pelvis, 1));
  }
  if (spec.gear === 'backpack') {
    const mid = tor[Math.floor(tor.length / 2)], k = spec.build === 'kid' ? 1.1 : 1, back = mid[2] + mid[3];
    out.push(loft([{ y: tor[1][0], rx: mid[1] * 0.65 * k, rz: 0.075, cz: back + 0.06 }, { y: mid[0], rx: mid[1] * 0.72 * k, rz: 0.085, cz: back + 0.07 }, { y: tor[tor.length - 2][0], rx: mid[1] * 0.65 * k, rz: 0.075, cz: back + 0.06 }], 8, HI_RECTS.gear, 2, 'both'));
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

// ---------------------------------------------------------------- geometry per shape, variant and LOD

const geoCache = new Map<string, { geo: THREE.BufferGeometry; triangles: number }>();
function geometryFor(s: MhShape, variant: number, detail: PedDetail): { geo: THREE.BufferGeometry; triangles: number } {
  const key = `${s.name}:${variant}:${detail}`;
  let c = geoCache.get(key);
  if (c) return c;
  const L = s.lods[detail], spec = PED_SPECS[variant];
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.BufferAttribute(L.position, 3));
  base.setAttribute('normal', new THREE.BufferAttribute(L.normal, 3));
  base.setAttribute('uv', new THREE.BufferAttribute(L.uv, 2));
  base.setAttribute('skinIndex', new THREE.BufferAttribute(L.joints, 4));
  base.setAttribute('skinWeight', new THREE.BufferAttribute(L.weights, 4));
  base.setIndex(new THREE.BufferAttribute(L.index, 1));
  const ao = bodyAo(s, L.position);
  const parts = detail === 'far' ? [] : [...headParts(s, spec, detail === 'hi'), ...bodyParts(s, spec, detail === 'hi')];
  if (detail === 'hi') {
    const gm = garmentParts(s, L, ao, spec);
    parts.push(...gm.parts, ...headShell(s, L, ao, spec), ...shoeParts(s, L, spec));
    base.setIndex(new THREE.BufferAttribute(nonFootTriangles(L, gm.hide), 1));
  }
  base.setAttribute('color', new THREE.BufferAttribute(ao, 3));
  for (const g of parts) if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
  const geo = parts.length ? mergeGeometries([base, ...parts], false) : base;
  if (!geo) throw new Error('pedMesh: merge failed');
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  c = { geo, triangles: geo.index!.count / 3 };
  geoCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- the model

export function buildMhPedModel(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel | null {
  if (!peopleReady()) return null;
  let variant: number;
  if (opts.variant === undefined) variant = pickPedVariant(rng);
  else if (typeof opts.variant === 'string') variant = pedVariantIndex(opts.variant);
  else variant = ((Math.floor(opts.variant) % PED_VARIANT_COUNT) + PED_VARIANT_COUNT) % PED_VARIANT_COUNT;
  const spec = PED_SPECS[variant];
  const shape = shapes.get(shapeFor(spec)) ?? shapes.values().next().value as MhShape;
  const phone = pedPhone();
  const jitter = rng.range(0.97, 1.03);
  const mat = pedHiMaterial(materials, variant, phone);

  const group = new THREE.Group();
  group.name = 'human';
  group.userData.pedVariant = spec.id;
  group.userData.pedShape = shape.name;
  const R = shape.rig;
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
  const [bw, bh] = BUILD_SCALE[spec.build];
  if (opts.heightScale !== undefined) group.scale.setScalar(opts.heightScale); else group.scale.set(bw * jitter, bh * jitter, bw * jitter);
  return { group, legs, arms, head, knees, elbows, torso, rig, hips, spec, variant, triangles };
}

/** Drop-in for pedBodyHi.buildPedModel: the MakeHuman people when loaded, else PEDHI's procedural ones. */
export function buildPerson(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel {
  return buildMhPedModel(materials, rng, opts) ?? buildProcedural(materials, rng, opts);
}
export type { PedDetail, HiTile };
