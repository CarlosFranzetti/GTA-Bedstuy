/**
 * Clothing, shoes and hair made FROM THE BODY SURFACE: the triangles of a body region are copied, pushed out along the smooth normals
 * by the garment's thickness (more towards a hem for coats), cut at a hem height and given the same bone weights and baked AO as the
 * body underneath, so a jacket, sleeve, trouser leg or sneaker follows the real torso, arm and leg (and skins with them) instead of
 * being a ring-lofted tube. Same UVs as the body tile (the painters draw the garment there); hair and head scarves are re-mapped to
 * the hair / hat tile. Everything merges into the person's single SkinnedMesh.
 */
import * as THREE from 'three';
import { HI_RECTS, type HiTile } from '@/textures/painters/pedHi';
import type { PedSpec, PxRect } from '@/textures/painters/ped';
import type { MhLod, MhShape } from './pedMesh';

const ATLAS = 512;
const TILES = Object.entries(HI_RECTS) as Array<[HiTile, PxRect]>;
function tileOf(u: number, v: number): HiTile | null {
  const px = u * ATLAS, py = (1 - v) * ATLAS;
  for (const [n, r] of TILES) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return n;
  return null;
}
/** atlas uv of a point (fu 0..1 round the part, front at 0.5; ft 0..1 up) inside a tile */
const tileUV = (r: PxRect, fu: number, ft: number): [number, number] => {
  const px = r.x + 0.5 + Math.min(1, Math.max(0, fu)) * (r.w - 1), py = r.y + 0.5 + (1 - Math.min(1, Math.max(0, ft))) * (r.h - 1);
  return [px / ATLAS, 1 - py / ATLAS];
};

interface Info { tile: HiTile[]; cx: Float32Array; cy: Float32Array; cz: Float32Array }
const infoCache = new WeakMap<MhLod, Info>();
function info(L: MhLod): Info {
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

interface ShellOpts {
  /** thickness at a vertex (metres) given its height */
  thick: (y: number) => number;
  /** vertices below this height are flattened onto it (a clean hem) and rolled out a little */
  hemY?: number;
  /** replace the uv: (triangle, corner, vertex) -> [u, v] */
  uv?: (t: number, k: number, v: number) => [number, number];
}

function shell(L: MhLod, ao: Float32Array, tris: number[], o: ShellOpts): THREE.BufferGeometry {
  const n = tris.length * 3;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), idx = new Uint32Array(n);
  let o3 = 0;
  tris.forEach((t, ti) => {
    for (let k = 0; k < 3; k++) {
      const v = L.index[t * 3 + k], i = ti * 3 + k;
      let y = L.position[v * 3 + 1], off = o.thick(y);
      if (o.hemY !== undefined && y < o.hemY) { y = o.hemY; off *= 1.35; }
      pos[i * 3] = L.position[v * 3] + L.normal[v * 3] * off;
      pos[i * 3 + 1] = y + L.normal[v * 3 + 1] * off;
      pos[i * 3 + 2] = L.position[v * 3 + 2] + L.normal[v * 3 + 2] * off;
      nrm.set(L.normal.subarray(v * 3, v * 3 + 3), i * 3);
      const u = o.uv ? o.uv(t, k, v) : [L.uv[v * 2], L.uv[v * 2 + 1]];
      uv[i * 2] = u[0]; uv[i * 2 + 1] = u[1];
      si.set(L.joints.subarray(v * 4, v * 4 + 4), i * 4); sw.set(L.weights.subarray(v * 4, v * 4 + 4), i * 4);
      col.set(ao.subarray(v * 3, v * 3 + 3), i * 3);
      idx[o3++] = i;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const THICK_TOP: Partial<Record<PedSpec['top']['kind'], number>> = { puffer: 0.022, hoodie: 0.015, jacket: 0.013, cardigan: 0.012, uniform: 0.012, tracksuit: 0.011, vest: 0.01, apron: 0.008, jersey: 0.006, scrubs: 0.005 };
const THICK_BOTTOM: Partial<Record<PedSpec['bottom']['kind'], number>> = { jeans: 0.007, trousers: 0.006, cargo: 0.011, sweats: 0.01, shorts: 0.006 };
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Jacket / hoodie / vest / coat, sleeves, collar, trousers and sneakers for the hi LOD of a shape (merge-ready parts). */
export function garmentParts(s: MhShape, L: MhLod, ao: Float32Array, spec: PedSpec): THREE.BufferGeometry[] {
  const inf = info(L), n = inf.tile.length, out: THREE.BufferGeometry[] = [];
  const lm = s.landmarks, H = lm.crownY;
  const pick = (f: (t: number, tile: HiTile) => boolean): number[] => { const r: number[] = []; for (let t = 0; t < n; t++) if (f(t, inf.tile[t])) r.push(t); return r; };
  const kneeY = s.rig.kneeL[1];
  const top = spec.top, tk = THICK_TOP[top.kind] ?? 0;

  // ---- top: body, collar, sleeves
  if (tk > 0) {
    const long = !!top.long, hem = long ? kneeY + 0.04 : lm.hemY - (top.kind === 'puffer' || top.kind === 'hoodie' || top.kind === 'jacket' ? 0.07 : 0.03);
    const neckBase = Math.min(...pick((_, tile) => tile === 'neck').map((t) => inf.cy[t]), lm.chinY - 0.05) ;
    const body = pick((t, tile) => tile === 'torso' || ((tile === 'pelvis' || (long && tile === 'thigh')) && inf.cy[t] >= hem));
    const flare = long ? 0.035 : top.kind === 'puffer' ? 0.008 : 0;
    out.push(shell(L, ao, body, { thick: (y) => tk + flare * (1 - smooth(hem, lm.hemY, y)), hemY: hem }));
    const collar = pick((t, tile) => tile === 'neck' && inf.cy[t] < neckBase + 0.035);
    const torsoR = HI_RECTS.torso, neckR = HI_RECTS.neck, bigCollar = top.kind === 'hoodie' ? 0.02 : 0.006;
    out.push(shell(L, ao, collar, { thick: () => tk + bigCollar, uv: (t, k, v) => { const fu = (L.uv[v * 2] * ATLAS - neckR.x - 0.5) / (neckR.w - 1); return tileUV(torsoR, fu, 0.97); } }));
    if (top.kind !== 'vest' && top.kind !== 'apron' && top.sleeves !== 'none') {
      const upperTop = s.rig.shoulderL[1], upperBot = s.rig.elbowL[1];
      const sleeveEnd = top.sleeves === 'short' ? upperBot + (upperTop - upperBot) * 0.42 : -1;
      const arms = pick((t, tile) => (tile === 'upperArm' && inf.cy[t] >= sleeveEnd) || (tile === 'foreArm' && top.sleeves === 'long'));
      out.push(shell(L, ao, arms, { thick: (y) => tk * 0.85 + (top.sleeves === 'long' && y < s.rig.wristL[1] + 0.03 ? 0.004 : 0) }));
    }
  }

  // ---- trousers / shorts
  const bk = spec.bottom.kind, tb = THICK_BOTTOM[bk] ?? 0;
  if (tb > 0) {
    const shortsEnd = kneeY + 0.1;
    const legs = pick((t, tile) => (tile === 'pelvis' && !(top.long && tk > 0)) || ((tile === 'thigh' || tile === 'shin') && (bk !== 'shorts' || inf.cy[t] >= shortsEnd) && !(top.long && tk > 0 && inf.cy[t] >= kneeY + 0.04)));
    out.push(shell(L, ao, legs, { thick: (y) => tb + (bk === 'cargo' || bk === 'sweats' ? 0.004 * smooth(0.5, 0.05, y) : 0), hemY: bk === 'shorts' ? shortsEnd : undefined }));
  }

  // ---- sneakers: the foot pushed out, a toe cap, a rolled sole flush with the ground
  const shoe = pick((_, tile) => tile === 'shoe');
  if (shoe.length) {
    const side = (x: number): number => (x < 0 ? 0 : 1);
    const mean = [[0, 0, 0], [0, 0, 0]];
    for (const t of shoe) { const m = mean[side(inf.cx[t])]; m[0] += inf.cx[t]; m[1] += inf.cz[t]; m[2]++; }
    const cz = mean.map((m) => (m[2] ? m[1] / m[2] : 0)), cx = mean.map((m) => (m[2] ? m[0] / m[2] : 0));
    const g = shell(L, ao, shoe, { thick: (y) => 0.011 + 0.006 * smooth(0.03, 0, y) });
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const sd = side(p.getX(i)), dz = p.getZ(i) - cz[sd], dx = p.getX(i) - cx[sd];
      const front = Math.max(0, -dz) * 0.14;               // longer toe box (front is -z)
      p.setZ(i, p.getZ(i) + (dz < 0 ? -front : dz * 0.04));
      p.setX(i, p.getX(i) + dx * 0.06);
      if (p.getY(i) < 0.018) p.setY(i, Math.max(0, p.getY(i) * 0.4 - 0.001));
    }
    out.push(g);
  }
  void H;
  return out;
}

/** Hair as a volume that follows the skull (or a head scarf), mapped to the hair / hat tile. Returns [] when the style is made of lofted parts. */
export function headShell(s: MhShape, L: MhLod, ao: Float32Array, spec: PedSpec): THREE.BufferGeometry[] {
  const inf = info(L), n = inf.tile.length, lm = s.landmarks, hh = lm.crownY - lm.chinY;
  const Y = (t: number): number => lm.chinY + t * hh;
  const ring = s.headRings[Math.min(s.headRings.length - 1, Math.round(0.7 * (s.headRings.length - 1)))];
  const zc = ring[2], zFront = ring[2] - ring[3];
  const tOf = (y: number): number => (y - lm.chinY) / hh;
  const out: THREE.BufferGeometry[] = [];
  const mapTo = (r: PxRect): ShellOpts['uv'] => (t, k, v) => {
    const x = L.position[v * 3], z = L.position[v * 3 + 2] - zc;
    let a = Math.atan2(x, z); if (a < 0) a += Math.PI * 2;
    return tileUV(r, a / (Math.PI * 2), tOf(L.position[v * 3 + 1]) * 0.9 + 0.05);
  };
  const fixSeam = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 3) { const us = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)]; if (Math.max(...us) - Math.min(...us) > 0.12) for (let k = 0; k < 3; k++) uv.setX(i + k, Math.min(...us)); }
    return g;
  };
  const head = (f: (t: number) => boolean): number[] => { const r: number[] = []; for (let t = 0; t < n; t++) if (inf.tile[t] === 'head' && f(t)) r.push(t); return r; };
  const covered = spec.hat !== 'none' && spec.hat !== 'fedora' ? true : false;
  if (spec.hat === 'hijab') {
    const oval = (t: number): boolean => inf.cz[t] < zc - ring[3] * 0.25 && Math.abs(inf.cx[t]) < ring[1] * 0.78 && tOf(inf.cy[t]) > 0.02 && tOf(inf.cy[t]) < 0.74;
    const around = head((t) => !oval(t));
    out.push(shell(L, ao, around, { thick: () => 0.011, uv: mapTo(HI_RECTS.hat) }));
    const drape: number[] = [];
    for (let t = 0; t < n; t++) if (inf.tile[t] === 'neck' || (inf.tile[t] === 'torso' && inf.cy[t] > s.rig.shoulderL[1] - 0.06)) drape.push(t);
    const hatR = HI_RECTS.hat;
    out.push(shell(L, ao, drape, { thick: (y) => 0.013 + 0.006 * smooth(s.rig.shoulderL[1], s.rig.shoulderL[1] - 0.08, y), uv: (t, k, v) => { const a = Math.atan2(L.position[v * 3], L.position[v * 3 + 2]); return tileUV(hatR, ((a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2)), 0.3); } }));
    return out.map(fixSeam);
  }
  if (covered || spec.hair === 'bald') return out;
  const style = spec.hair;
  const thick = style === 'fade' ? 0.006 : style === 'afro' ? 0 : 0.014;
  if (thick <= 0) return out;
  const fronthair = (t: number): boolean => tOf(inf.cy[t]) >= (style === 'fade' ? 0.8 : 0.7);
  const sides = (t: number): boolean => tOf(inf.cy[t]) >= (style === 'fade' ? 0.5 : 0.4) && inf.cz[t] > zc + ring[3] * (style === 'fade' ? 0.15 : -0.05);
  const tris = head((t) => fronthair(t) || sides(t));
  out.push(shell(L, ao, tris, { thick: (y) => thick * (0.6 + 0.6 * smooth(Y(0.6), Y(0.95), y)), uv: mapTo(HI_RECTS.hair) }));
  void zFront;
  return out.map(fixSeam);
}
