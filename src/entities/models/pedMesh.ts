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
import { PED_SPECS, PED_VARIANT_COUNT, pedVariantIndex, type PedSpec, type PxRect } from '@/textures/painters/ped';
import { FAR_DIST, MID_DIST, PedLod, buildPedModel as buildProcedural, pedPhone, type PedDetail } from './pedBodyHi';
import { headShell } from './pedGarments';
import { peopleMode } from '@/textures/painters/pedMode';
import { bodyTypeOf, type BodyType } from './pedBodyTypes';
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
  const hairR = SK_RECTS.hair, hatR = SK_RECTS.hat;
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
  const ball = (cx: number, y: number, cz: number, rr: number, rect: PxRect, squash = 1): void => {
    // a round volume (afro, puff, bun): a sphere profile, denser at the hi level so the silhouette is smooth, slightly lumpy
    const n = hiDetail ? 9 : 5, rings: R[] = [];
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI, k = Math.max(0.12, Math.cos(a)), lump = 1 + (hiDetail ? 0.035 * Math.sin(i * 2.3 + cx * 90) : 0);
      rings.push({ y: y + Math.sin(a) * rr * squash, rx: rr * k * lump, rz: rr * k * lump, cx, cz });
    }
    out.push(loft(rings, hiDetail ? 18 : 10, rect, 3, 'both'));
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
      const r = ringAt(s.headRings, Y(0.55)), rows = hiDetail ? 8 : 5, rings: R[] = [];
      for (let i = 0; i <= rows; i++) {
        const u = i / rows, y = Y(0.5) - u * H * 1.75, wave = Math.sin(u * 5.2) * 0.008;
        // from the skull down the back of the neck to the shoulder blades, wider at the temples, tapering to the tips
        const rx = r.rx * (1.1 - 0.18 * smooth(0.25, 1, u)), rz = r.rz * (0.8 - 0.55 * smooth(0, 0.45, u)) + 0.018;
        rings.push({ y, rx: rx + wave, rz, cz: r.cz + r.rz * (0.3 + 0.7 * smooth(0, 0.5, u)) + 0.006 * u });
      }
      out.push(loft(rings, hiDetail ? 18 : 12, hairR, 3, 'bottom'));
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
    case 'hijab': {
      // draped cloth, two styles: A a neat wrap with the cloth falling to a short point on the chest, B a loose shawl, fuller and longer, one end over the shoulder.
      // The wrap is an ellipse a little narrower front to back than the head and shifted back, so the face stands out in front of it (no cut-out edges);
      // the mantle widens from the throat to the shoulders and ends in a soft hem.
      let hh2 = 2166136261; for (let i = 0; i < spec.id.length; i++) { hh2 ^= spec.id.charCodeAt(i); hh2 = Math.imul(hh2, 16777619); }
      const loose = ((hh2 >>> 0) % 2) === 0, bt = bodyTypeOf(spec), shW = Math.abs(s.rig.shoulderL[0]) * (peopleMode() === 'skin' ? bt.shoulders : 1), shY = s.rig.shoulderL[1];
      const wrap: R[] = [], hrAt = (y: number) => ringAt(s.headRings, Math.min(y, Y(0.985)));
      for (const t of [-0.16, -0.04, 0.12, 0.3, 0.5, 0.7, 0.86, 0.97, 1.05]) {
        const r = hrAt(Y(Math.max(0.02, t))), g = (loose ? 0.042 : 0.03) + 0.007 * Math.sin(t * 11) + (t < 0 ? 0.01 : 0), top = smooth(0.9, 1.06, t);
        wrap.push({ y: Y(t), rx: (r.rx + g) * (1 - 0.5 * top), rz: (r.rz * 0.72 + g * 0.4) * (1 - 0.5 * top), cz: r.cz + r.rz * 0.3 + 0.012 });
      }
      out.push(loft(wrap, hiDetail ? 16 : 10, hatR, 3, 'top'));
      const reach = loose ? 0.34 : 0.2, rows = hiDetail ? 9 : 6, mant: R[] = [], nk = ringAt(s.headRings, lm.chinY), w0 = wrap[0];
      const rxN = nk.rx * 0.9 + 0.034, rzN = nk.rz * 0.75 + 0.03, topY = w0.y;
      for (let i = 0; i <= rows; i++) {
        const u = i / rows, y = topY - u * (topY - (shY - reach)), tr = ringAt(s.torsoRings, y);
        const pinch = smooth(0, 0.22, u), open = smooth(0.18, 0.75, u), taper = 1 - (loose ? 0.12 : 0.38) * smooth(0.6, 1, u);
        const wob = 0.007 * Math.sin(u * 7 + 1) + (loose ? 0.012 * Math.sin(u * 4.3) : 0);
        const rx = (w0.rx + (rxN - w0.rx) * pinch + (shW * 0.8 - rxN) * open) * taper + wob;
        const rz = w0.rz + (rzN - w0.rz) * pinch + (Math.max(rzN, tr.rz + 0.03) - rzN) * open + wob;
        mant.push({ y, rx, rz, cz: (w0.cz ?? 0) + ((tr.cz) - (w0.cz ?? 0)) * Math.max(pinch * 0.6, open), cx: loose ? 0.03 * open : 0 });
      }
      out.push(loft(mant, hiDetail ? 16 : 10, hatR, 3, 'bottom'));
      break;
    }
    case 'hardhat': { out.push(loft(dome(0.6, 1.15, 0.01, 0), seg, hatR, 3, 'top')); const r = ringAt(s.headRings, Y(0.6)); out.push(loft([{ y: Y(0.6), rx: 0.12, rz: 0.15, cz: r.cz - 0.03 }, { y: Y(0.6) + 0.012, rx: 0.12, rz: 0.15, cz: r.cz - 0.03 }], 14, hatR, 3, 'both')); break; }
  }
  // accessories picked by the person's id (not by group): headphones, a scarf
  let h = 2166136261; for (let i = 0; i < spec.id.length; i++) { h ^= spec.id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const roll = (h >>> 0) / 4294967296, grown = spec.age !== 'kid';
  if (grown && spec.hat === 'none' && spec.hair !== 'afro' && roll < 0.1) {
    const r = ringAt(s.headRings, Y(0.45)), gr = SK_RECTS.hair;
    // over-ear headphones: a band that rises from each ear cup over the crown (two lofts, each monotonic in height) and two padded cups
    const R = r.rx + 0.014, ye = Y(0.45), yt = Y(1.0) + 0.03;
    const nr = hiDetail ? 6 : 4, ks = hiDetail ? [0.5, 1, 0.5] : [0.6, 1, 0.6], kd = hiDetail ? [-0.036, 0, 0.036] : [-0.03, 0, 0.03];
    for (const sx of [-1, 1]) {
      const rings: R[] = [];
      for (let i = 0; i <= nr; i++) { const th = (i / nr) * (Math.PI / 2 - 0.05); rings.push({ y: ye + (yt - ye) * Math.sin(th), rx: 0.0055, rz: 0.011, cx: sx * R * Math.cos(th) * (1 + 0.04 * Math.sin(th)), cz: r.cz }); }
      out.push(loft(rings, hiDetail ? 5 : 4, hatR, 3, 'both'));
      out.push(loft(ks.map((kk, i) => ({ y: ye + kd[i], rx: 0.016 * kk + 0.002, rz: 0.034 * kk, cx: sx * (R + 0.006), cz: r.cz })), hiDetail ? 10 : 7, hatR, 3, 'both'));
    }
  } else if (grown && !covered && spec.hat !== 'hijab' && roll >= 0.1 && roll < 0.2) {
    const n = ringAt(s.headRings, lm.chinY);
    out.push(loft([{ y: lm.chinY - 0.07, rx: n.rx * 0.7 + 0.04, rz: n.rz * 0.7 + 0.04, cz: n.cz }, { y: lm.chinY - 0.02, rx: n.rx * 0.7 + 0.034, rz: n.rz * 0.7 + 0.034, cz: n.cz }, { y: lm.chinY + 0.015, rx: n.rx * 0.7 + 0.03, rz: n.rz * 0.7 + 0.03, cz: n.cz }], 14, hatR, 3, 'both'));
  }
  return out;
}

function bodyParts(s: MhShape, spec: PedSpec, hiDetail: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const seg = hiDetail ? 16 : 9;
  const hip = s.hipRings, tor = s.torsoRings;
  if (spec.bottom.kind === 'skirt') {
    const top = hip[hip.length - 1], hem = s.landmarks.crownY * (spec.bottom.long ? 0.12 : spec.top.kind === 'dress' ? 0.25 : 0.31), waist = tor[0];
    const hw = peopleMode() === 'skin' ? Math.max(0.95, bodyTypeOf(spec).hips) : 1;
    // the top ring sits inside the dressed waist so the skirt grows out of the body (no shelf); pleats and hem are the lower rows of the pelvis tile
    const skirtRect = SK_RECTS.pelvis;
    out.push(loft([
      { y: hem, rx: (top[1] + 0.1) * hw, rz: top[3] + 0.1, cz: top[2] }, { y: (hem + top[0]) / 2, rx: (top[1] + 0.05) * hw, rz: top[3] + 0.05, cz: top[2] },
      { y: top[0] - 0.01, rx: (top[1] + 0.022) * hw, rz: top[3] + 0.022, cz: top[2] }, { y: waist[0] + 0.05, rx: waist[1] * 0.985, rz: waist[3] * 0.985, cz: waist[2] },
    ], seg, skirtRect, 1));
  }
  if (spec.gear === 'backpack') {
    const mid = tor[Math.floor(tor.length / 2)], k = spec.build === 'kid' ? 1.1 : 1, back = mid[2] + mid[3];
    out.push(loft([{ y: tor[1][0], rx: mid[1] * 0.65 * k, rz: 0.075, cz: back + 0.06 }, { y: mid[0], rx: mid[1] * 0.72 * k, rz: 0.085, cz: back + 0.07 }, { y: tor[tor.length - 2][0], rx: mid[1] * 0.65 * k, rz: 0.075, cz: back + 0.06 }], 8, SK_RECTS.gear, 2, 'both'));
  }
  // carried bags: a hand bag at the left hand, a tote hanging at the side from the shoulder, a messenger bag on the hip with a cross-body strap
  const gr = SK_RECTS.gear, hemY = s.landmarks.hemY, btg = bodyTypeOf(spec), skinG = peopleMode() === 'skin';
  const Rg: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(s.rig)) Rg[k] = skinG ? jointFor(k, v, btg) : v;
  if (spec.gear === 'bag') {
    const wx = Rg.wristL[0], wy = Rg.wristL[1], wz = Rg.wristL[2];
    out.push(loft([{ y: wy - 0.4, rx: 0.045, rz: 0.1, cx: wx, cz: wz - 0.02 }, { y: wy - 0.22, rx: 0.05, rz: 0.11, cx: wx, cz: wz - 0.02 }, { y: wy - 0.06, rx: 0.042, rz: 0.1, cx: wx, cz: wz - 0.02 }], 12, gr, 5, 'both'));
    out.push(loft([{ y: wy - 0.06, rx: 0.011, rz: 0.03, cx: wx, cz: wz - 0.02 }, { y: wy + 0.02, rx: 0.011, rz: 0.012, cx: wx, cz: wz - 0.02 }], 6, gr, 5, 'both'));
  } else if (spec.gear === 'tote') {
    const sx = Rg.shoulderL[0], sy = Rg.shoulderL[1], cx = sx - 0.075, top = hemY + 0.12;
    out.push(loft([{ y: hemY - 0.3, rx: 0.03, rz: 0.15, cx, cz: 0.02 }, { y: hemY - 0.1, rx: 0.035, rz: 0.165, cx, cz: 0.02 }, { y: top, rx: 0.03, rz: 0.15, cx, cz: 0.02 }], 12, gr, 4, 'both'));
    out.push(loft([{ y: top, rx: 0.01, rz: 0.012, cx, cz: -0.1 }, { y: (top + sy) / 2, rx: 0.01, rz: 0.012, cx: (cx + sx) / 2, cz: -0.05 }, { y: sy + 0.025, rx: 0.012, rz: 0.012, cx: sx + 0.03, cz: 0 }], 5, gr, 4, 'both'));
  } else if (spec.gear === 'messenger') {
    const hx = Math.abs(Rg.shoulderL[0]) + 0.01, hy = hemY, sy = Rg.shoulderL[1];
    out.push(loft([{ y: hy - 0.12, rx: 0.055, rz: 0.12, cx: hx + 0.03, cz: 0.04 }, { y: hy + 0.04, rx: 0.06, rz: 0.13, cx: hx + 0.03, cz: 0.04 }, { y: hy + 0.2, rx: 0.055, rz: 0.12, cx: hx + 0.03, cz: 0.04 }], 12, gr, 2, 'both'));
    const rings: R[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, y = hy + 0.2 + (sy + 0.02 - hy - 0.2) * u, x = hx - (hx + Math.abs(Rg.shoulderL[0]) * 0.55) * u, rr = ringAt(tor as Ring[], y), k = Math.sqrt(Math.max(0, 1 - (x / (rr.rx || 0.2)) ** 2));
      rings.push({ y, rx: 0.016, rz: 0.007, cx: x, cz: rr.cz - rr.rz * k - 0.045 + (1 - k) * rr.rz * 1.2 });
    }
    out.push(loft(rings, 5, gr, 2, 'both'));
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
  if (/^(shoulder|elbow|wrist)/.test(name)) return leanPoint([p[0] * bt.shoulders, p[1], p[2]], bt, pivot);
  if (name === 'head') return leanPoint(p, bt, pivot);
  if (/^(hip[LR]|knee|ankle)/.test(name)) return [p[0] * legX(bt), p[1], p[2]];
  return p;
}
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
/** a clothed chest is one soft form: relax the front of the chest so the bust and nipples of the base mesh do not read as drawn-on anatomy under a shirt */
function smoothChest(L: MhLod, pos: Float32Array, yChest: number, cz0: number): void {
  const w = weldOf(L), sel: number[] = [];
  for (const [c] of w.members) if (pos[c * 3 + 1] > yChest - 0.14 && pos[c * 3 + 1] < yChest + 0.1 && pos[c * 3 + 2] < cz0 + 0.02 && wsumAt(L, c, W_TORSO) > 0.6) sel.push(c);
  for (let it = 0; it < 4; it++) {
    const next = sel.map((i) => { let z = 0, c = 0; for (const j of w.adj.get(i) ?? []) { z += pos[j * 3 + 2]; c++; } return c ? pos[i * 3 + 2] * 0.4 + (z / c) * 0.6 : pos[i * 3 + 2]; });
    sel.forEach((i, k) => { for (const m of w.members.get(i)!) pos[m * 3 + 2] = next[k]; });
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
  const tor = s.torsoRings, cz0 = tor[Math.floor(tor.length / 2)][2], K = lm.crownY / 1.78;
  const armX = Math.abs(R.shoulderL[0]), hipX = Math.abs(R.hipL[0]), legK = legX(bt), wristX = Math.abs(R.wristL[0]), hipY = R.hipL[1];
  const yBelly = hipY + 0.09 * K, yWaist = hipY + 0.14 * K, yChest = shY - 0.13 * K, neckY = lm.chinY - 0.03;
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
      const dx = x * fx - axX, dz = z - cz0;
      const kUp = bt.arms / Math.max(0.8, bt.shoulders), k = 1 + (lerp(kUp, 1 + (kUp - 1) * 0.5, sstep(elY + 0.02, elY - 0.1, y)) - 1) * wA;
      x = axX + dx * k; z = cz0 + dz * k;
    }
    // legs: out with the hips, thickness about the leg axis following the profile
    if (wL > 0.01) {
      const axX = sx * hipX * legK, kk = 1 + (legProfile(Math.min(1, Math.max(0, (y - anY) / (hipY - anY))) ) - 1) * wL, zc = R.kneeL[2];
      x = axX + (x * (1 + (legK - 1) * wL) - axX) * kk;
      z = zc + (z - zc) * kk;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  }
  smoothChest(L, pos, yChest, cz0);
  let normal = weldedNormals(pos, L.index);
  if (dress) {
    const top = spec.top, bot = spec.bottom;
    const tk = (THICK_SKIN[top.kind] ?? 0), tb = THICK_BOT_SKIN[bot.kind] ?? 0, hemTop = topHemY(s, spec);
    const sleeveCut = top.sleeves === 'short' ? elY + (shY - elY) * 0.42 : top.sleeves === 'long' ? wrY + 0.06 : (top.kind === 'jersey' ? shY - 0.05 : 9);
    const baggy = ['puffer', 'hoodie', 'jacket', 'cardigan', 'tracksuit'].includes(top.kind);
    const shortsEnd = knY + 0.1;
    const out = new Float32Array(pos);
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1], x = pos[i * 3];
      const wT = wsumAt(L, i, W_TORSO), wH = wsumAt(L, i, W_HIPS), wA = wsumAt(L, i, W_ARMS), wL = wsumAt(L, i, W_LEGS);
      const cover = sstep(hemTop - 0.025, hemTop + 0.06, y), neck = sstep(shY + 0.09, shY + 0.02, y);
      let t = 0;
      if (top.kind !== 'vest' || true) t += tk * Math.min(1, wT + wH * 0.8) * cover * neck;
      if (top.sleeves !== 'none' || top.kind === 'jersey') t += tk * 0.85 * wA * sstep(sleeveCut - 0.03, sleeveCut + 0.03, y) * sstep(wrY, wrY + 0.1, y);
      if (baggy || top.long) t += tk * 0.8 * gauss(y - (hemY + 0.02), 0.12) * Math.min(1, wT + wH) * cover;           // the hem hangs off the hips
      if (top.kind === 'puffer') t *= 0.8 + 0.28 * Math.sin(((shY + 0.1 - y) / 0.088) * Math.PI * 2);                  // baffles
      const botW = bot.kind === 'shorts' ? sstep(shortsEnd - 0.03, shortsEnd + 0.03, y) : 1;
      t += tb * Math.min(1, wL + wH * (1 - cover)) * sstep(anY + 0.02, anY + 0.14, y) * botW * (bot.kind === 'skirt' || bot.kind === 'leggings' && false ? 0 : 1);
      if ((bot.kind === 'cargo' || bot.kind === 'sweats') && wL > 0.3) t += 0.008 * sstep(knY, knY - 0.2, y) * sstep(anY + 0.04, anY + 0.12, y);   // the leg breaks over the shoe
      void x;
      if (t > 0) { out[i * 3] += normal[i * 3] * t; out[i * 3 + 1] += normal[i * 3 + 1] * t * 0.3; out[i * 3 + 2] += normal[i * 3 + 2] * t; }
    }
    normal = weldedNormals(out, L.index);
    return { ...L, position: out, normal };
  }
  return { ...L, position: pos, normal };
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
function clothExtras(s: MhShape, spec: PedSpec, L: MhLod, hi: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], seg = hi ? 18 : 10, k = spec.top.kind, hemTop = topHemY(s, spec), anY = s.landmarks.ankleY;
  if (['jacket', 'hoodie', 'puffer', 'cardigan', 'tracksuit', 'uniform'].includes(k) && !spec.top.long) {
    const r = bodyRing(L, hemTop - 0.02, hemTop + 0.03, (i) => wsumAt(L, i, W_ARMS) < 0.3);
    if (r) {
      const o = k === 'puffer' ? 0.036 : k === 'jacket' || k === 'hoodie' ? 0.026 : 0.018;
      out.push(loft([
        { y: hemTop, rx: r.rx + o, rz: r.rz + o, cx: r.cx, cz: r.cz },
        { y: hemTop + 0.05, rx: r.rx + o * 0.55, rz: r.rz + o * 0.55, cx: r.cx, cz: r.cz },
        { y: hemTop + 0.13, rx: r.rx + 0.002, rz: r.rz + 0.002, cx: r.cx, cz: r.cz },
      ], seg, SK_RECTS.torso, 2));
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
  if (['jeans', 'trousers', 'cargo', 'sweats'].includes(spec.bottom.kind)) {
    const R = peopleRig(s, spec);
    for (const side of ['L', 'R']) {
      const a = R['ankle' + side], bone = side === 'L' ? 9 : 11;
      const r = bodyRing(L, anY + 0.03, anY + 0.075, (i) => Math.abs(L.position[i * 3] - a[0]) < 0.07 && wsumAt(L, i, W_LEGS) > 0.5);
      if (!r) continue;
      const f = spec.bottom.kind === 'trousers' ? 0.016 : spec.bottom.kind === 'cargo' ? 0.024 : 0.012;
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
  if (spec.top.kind === 'hoodie') {
    const nk = ringAt(hr, lm.chinY - 0.02), y0 = lm.chinY - 0.075, w = 1 + (bt.shoulders - 1) * 0.5;
    out.push(loft([
      { y: y0 - 0.05, rx: (nk.rx + 0.034) * w, rz: nk.rz + 0.02, cz: nk.cz + 0.06 },
      { y: y0, rx: (nk.rx + 0.048) * w, rz: nk.rz + 0.04, cz: nk.cz + 0.044 },
      { y: y0 + 0.04, rx: nk.rx + 0.03, rz: nk.rz + 0.03, cz: nk.cz + 0.028 },
      { y: lm.chinY - 0.02, rx: nk.rx + 0.02, rz: nk.rz + 0.02, cz: nk.cz + 0.012 },
    ], seg, SK_RECTS.torso, 2, 'bottom'));
  }
  if (spec.top.long && spec.top.kind !== 'dress') {
    // a coat's lower half: narrower flare than before (the hands hang outside it), starts inside the dressed waist, textured with the bottom rows of the torso tile
    const hip = s.hipRings, top = hip[hip.length - 1], tor = s.torsoRings, waist = tor[0], kneeY = R.kneeL[1] + 0.05, w = Math.max(1, bt.hips);
    const coatRect = SK_RECTS.torso;
    out.push(loft([
      { y: kneeY, rx: (top[1] + 0.062) * w, rz: top[3] + 0.05, cz: top[2] },
      { y: (kneeY + top[0]) / 2 + 0.05, rx: (top[1] + 0.04) * w, rz: top[3] + 0.034, cz: top[2] },
      { y: top[0] - 0.01, rx: (top[1] + 0.024) * w, rz: top[3] + 0.024, cz: top[2] },
      { y: waist[0] + 0.05, rx: waist[1] * 0.985, rz: waist[3] * 0.985, cz: waist[2] },
    ], seg, coatRect, 1));
  }
  return out;
}

// ---------------------------------------------------------------- geometry per shape, variant and LOD

/** the foot: the skin's own foot is cut off at the ankle and replaced by a clean shoe volume (one smooth lofted shape per foot, painted from the shoe swatch) */
function shoeParts(s: MhShape, spec: PedSpec, L: MhLod, hi: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], R = peopleRig(s, spec), anY = s.landmarks.ankleY, rect = SK_RECTS.shoe, seg = hi ? 12 : 7;
  const bt = bodyTypeOf(spec), sc = Math.min(1.15, Math.max(0.85, (s.landmarks.crownY / 1.78) * (0.9 + 0.1 * bt.legs)));
  const T = [0, 0.035, 0.11, 0.27, 0.48, 0.68, 0.86, 1];
  const W = [0.012, 0.03, 0.043, 0.047, 0.042, 0.037, 0.035, 0.03], H = [0.026, 0.044, 0.058, 0.064, 0.08, 0.12, 0.142, 0.138];
  const high = !!spec.shoes.high, flat = spec.sex === 'f' && !high && !/#f|#e/i.test(spec.shoes.color);
  for (const side of ['L', 'R']) {
    const a = R['ankle' + side], bone = side === 'L' ? 9 : 11;
    // the leg's own radius at the ankle, from the dressed skin, so the shoe collar swallows it
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < L.position.length / 3; i++) {
      const y = L.position[i * 3 + 1], x = L.position[i * 3];
      if (y > anY + 0.03 && y < anY + 0.075 && Math.abs(x - a[0]) < 0.07) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, L.position[i * 3 + 2]); z1 = Math.max(z1, L.position[i * 3 + 2]); }
    }
    if (!isFinite(x0)) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lrx = (x1 - x0) / 2 + 0.004, lrz = (z1 - z0) / 2 + 0.004;
    const zToe = cz - 0.2 * sc, zHeel = cz + (lrz + 0.012);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const row = seg + 1;
    for (let i = 0; i < T.length; i++) {
      const z = zToe + T[i] * (zHeel - zToe), w = Math.max(W[i] * sc, i === T.length - 1 ? lrx : 0), h = (flat ? H[i] * 0.8 : H[i]) * sc;
      const collar = i >= T.length - 2 ? 1 : 0;
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        const rx = collar ? Math.max(w, lrx + 0.003) : w;
        pos.push(cx + rx * sn, Math.max(0, h * (1 - c) / 2) + (collar && c < 0 ? 0 : 0), z);
        uv.push(0, 0);
        const px = rect.x + 0.5 + (j / seg) * (rect.w - 1), py = rect.y + 0.5 + T[i] * (rect.h - 1);
        uv[uv.length - 2] = px / 512; uv[uv.length - 1] = 1 - py / 512;
      }
    }
    for (let i = 0; i + 1 < T.length; i++) for (let j = 0; j < seg; j++) { const p = i * row + j, q = p + 1, r = p + row, t = r + 1; idx.push(p, r, q, q, r, t); }
    // heel cap (closes the back of the shoe) and the toe point
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
function noFoot(s: MhShape, L: MhLod): Uint32Array {
  const cut = s.landmarks.ankleY + 0.035, keep: number[] = [];
  for (let t = 0; t < L.index.length; t += 3) {
    let foot = true;
    for (let k = 0; k < 3; k++) { const v = L.index[t + k]; if (!(L.position[v * 3 + 1] < cut && (wsumAt(L, v, [9]) + wsumAt(L, v, [11])) > 0.5)) foot = false; }
    if (!foot) keep.push(L.index[t], L.index[t + 1], L.index[t + 2]);
  }
  return Uint32Array.from(keep);
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
  base.setIndex(new THREE.BufferAttribute(detail === 'far' ? L.index : noFoot(s, L), 1));
  const ao = bodyAo(s, L0.position);
  const parts = detail === 'far' ? [] : [...headParts(s, spec, detail === 'hi'), ...bodyParts(s, spec, detail === 'hi'), ...skinExtras(s, spec, detail === 'hi'), ...clothExtras(s, spec, L0, detail === 'hi'), ...shoeParts(s, spec, L, detail === 'hi')];
  if (detail === 'hi') parts.push(...headShell(s, L0, ao, spec));
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

export function buildMhPedModel(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel | null {
  if (!peopleReady()) return null;
  let variant: number;
  if (opts.variant === undefined) variant = pickPedVariant(rng);
  else if (typeof opts.variant === 'string') variant = pedVariantIndex(opts.variant);
  else variant = ((Math.floor(opts.variant) % PED_VARIANT_COUNT) + PED_VARIANT_COUNT) % PED_VARIANT_COUNT;
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
    const hs = target / shape.height, wide = bw * (1 + tri() * 0.04);
    group.scale.set(wide * (0.98 + 0.02 * hs), hs, wide * (0.98 + 0.02 * hs));
    if (leanOf(bt) !== 0) torso.userData.stoopBaked = leanOf(bt);      // the lean is in the rest pose of the skin and the rig (not an extra pose)
    for (const k of [0, 1]) arms[k].scale.y = 1 + rng.range(-0.02, 0.02);
    head.scale.setScalar((skinMode ? bt.head * 1.05 : age === 'kid' ? 1.06 : 1) * rng.range(0.97, 1.03));
    torso.scale.set(1 + rng.range(-0.015, 0.015), 1, 1 + rng.range(-0.02, 0.02));
  }
  return { group, legs, arms, head, knees, elbows, torso, rig, hips, spec, variant, triangles };
}

/** Drop-in for pedBodyHi.buildPedModel: the MakeHuman people when loaded, else PEDHI's procedural ones. */
export function buildPerson(materials: IMaterialLibrary, rng: Rng, opts: PedOptions = {}): PedModel {
  return buildMhPedModel(materials, rng, opts) ?? buildProcedural(materials, rng, opts);
}
export type { PedDetail, HiTile };
