/**
 * LANDMARKS parts shared by the builders: window bands, cornices, fences, trees, benches, lamps, signs, crenellations.
 * All coordinates are site-local (see kit.ts). Nothing here imports roadnet.
 */
import * as THREE from 'three';
import { buildCloudGeometry } from '@/world/props/treeCloud';
import type { Rng } from '@/core/Rng';
import { Kit, TILE, type V3 } from './kit';
import { signMaterial } from './signs';

export type Dir2 = readonly [number, number];

/** unit direction to the right as seen from outside a wall facing `out` (see kit.ts: handedness is kept positive) */
export const rightOf = (out: Dir2): [number, number] => [out[1], -out[0]];

export interface WinOpt {
  /** wall start (local), unit direction along the wall, length, outward normal */
  x0: number; z0: number; dx: number; dz: number; len: number; out: Dir2;
  /** first floor's sill height, number of floors, floor height */
  y0: number; floors: number; floorH: number;
  /** pane size and bay pitch */
  w: number; h: number; pitch: number;
  margin?: number;
  /** stone heads and sills (null = none) */
  trim?: THREE.Material | null;
  /** window material variant picker */
  variant?: (i: number, floor: number) => number;
  skip?: (i: number, floor: number) => boolean;
  /** detail level 0 = panes only */
  detail?: number;
  /** panes sit this far proud of the wall */
  proud?: number;
}

/** A band of window panes (with optional stone heads and sills) on a wall. Returns the number of windows. */
export function windowBand(k: Kit, o: WinOpt): number {
  if (k.far) return 0;
  const margin = o.margin ?? o.pitch * 0.5;
  const n = Math.max(0, Math.floor((o.len - 2 * margin + (o.pitch - o.w)) / o.pitch));
  if (n <= 0) return 0;
  const used = (n - 1) * o.pitch + o.w;
  const start = (o.len - used) / 2;
  const [ox, oz] = o.out;
  const pr = o.proud ?? 0.05;
  const hint: V3 = [ox, 0, oz];
  let count = 0;
  const [rx, rz] = rightOf(o.out);
  // 'along' runs in the direction (dx, dz); a pane is a, b (along), up
  const sgn = o.dx * rx + o.dz * rz >= 0 ? 1 : -1;
  void sgn;
  for (let f = 0; f < o.floors; f++) {
    const y = o.y0 + f * o.floorH;
    for (let i = 0; i < n; i++) {
      if (o.skip?.(i, f)) continue;
      const s0 = start + i * o.pitch, s1 = s0 + o.w;
      const ax = o.x0 + o.dx * s0 + ox * pr, az = o.z0 + o.dz * s0 + oz * pr;
      const bx = o.x0 + o.dx * s1 + ox * pr, bz = o.z0 + o.dz * s1 + oz * pr;
      const mat = k.m('window', o.variant ? o.variant(i, f) : (i * 7 + f * 3) % 4);
      k.quad(mat, [ax, y, az], [bx, y, bz], [bx, y + o.h, bz], [ax, y + o.h, az], { hint, ru: 1, rv: 1 });
      count++;
      if (o.trim && (o.detail ?? 1) > 0) {
        const tp = pr + 0.03;
        const ex = o.dx * 0.12, ez = o.dz * 0.12;
        // head
        k.quad(o.trim, [ax - ex + ox * (tp - pr), y + o.h, az - ez + oz * (tp - pr)], [bx + ex + ox * (tp - pr), y + o.h, bz + ez + oz * (tp - pr)],
          [bx + ex + ox * (tp - pr), y + o.h + 0.28, bz + ez + oz * (tp - pr)], [ax - ex + ox * (tp - pr), y + o.h + 0.28, az - ez + oz * (tp - pr)], { hint, ru: 0.6, rv: 0.1 });
        // sill
        k.quad(o.trim, [ax - ex + ox * (tp - pr), y - 0.16, az - ez + oz * (tp - pr)], [bx + ex + ox * (tp - pr), y - 0.16, bz + ez + oz * (tp - pr)],
          [bx + ex + ox * (tp - pr), y, bz + ez + oz * (tp - pr)], [ax - ex + ox * (tp - pr), y, az - ez + oz * (tp - pr)], { hint, ru: 0.6, rv: 0.1 });
      }
    }
  }
  return count;
}

/** A horizontal projecting band (cornice, string course) along a straight edge. */
export function band(k: Kit, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, h: number, proud: number, out: Dir2): void {
  if (k.far) return;
  const dx = x1 - x0, dz = z1 - z0;
  const L = Math.hypot(dx, dz) || 1;
  const ox = out[0] * proud, oz = out[1] * proud;
  const hint: V3 = [out[0], 0, out[1]];
  k.quad(mat, [x0 + ox, y, z0 + oz], [x1 + ox, y, z1 + oz], [x1 + ox, y + h, z1 + oz], [x0 + ox, y + h, z0 + oz], { hint, ru: L / TILE, rv: h / TILE });
  // top and underside
  k.quad(mat, [x0, y + h, z0], [x1, y + h, z1], [x1 + ox, y + h, z1 + oz], [x0 + ox, y + h, z0 + oz], { hint: [0, 1, 0], ru: L / TILE, rv: proud / TILE });
  k.quad(mat, [x0, y, z0], [x1, y, z1], [x1 + ox, y, z1 + oz], [x0 + ox, y, z0 + oz], { hint: [0, -1, 0], ru: L / TILE, rv: proud / TILE });
}

/** Cornice (and optionally a parapet) around a rectangle. */
export function rectCornice(k: Kit, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, h = 0.5, proud = 0.45): void {
  band(k, mat, x0, z0, x1, z0, y, h, proud, [0, -1]);
  band(k, mat, x1, z0, x1, z1, y, h, proud, [1, 0]);
  band(k, mat, x1, z1, x0, z1, y, h, proud, [0, 1]);
  band(k, mat, x0, z1, x0, z0, y, h, proud, [-1, 0]);
}

/** Crenellated parapet along a straight run: merlons `mw` wide with gaps `gw`, height `mh` above y. */
export function crenellate(k: Kit, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, out: Dir2, mw = 1.1, gw = 0.9, mh = 1.0, t = 0.5): void {
  if (k.far) return;
  const dx = x1 - x0, dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const ux = dx / L, uz = dz / L;
  // a continuous low parapet wall behind the merlons
  const ox = out[0] * t, oz = out[1] * t;
  k.wall(mat, x0, z0, x1, z1, y, y + 0.55, [out[0], out[1]]);
  k.wall(mat, x1 - ox, z1 - oz, x0 - ox, z0 - oz, y, y + 0.55, [-out[0], -out[1]]);
  let s = 0;
  while (s + mw <= L + 1e-6) {
    const a0x = x0 + ux * s, a0z = z0 + uz * s, a1x = x0 + ux * (s + mw), a1z = z0 + uz * (s + mw);
    k.wall(mat, a0x, a0z, a1x, a1z, y + 0.55, y + 0.55 + mh, [out[0], out[1]]);
    k.wall(mat, a1x - ox, a1z - oz, a0x - ox, a0z - oz, y + 0.55, y + 0.55 + mh, [-out[0], -out[1]]);
    k.quad(mat, [a0x, y + 0.55 + mh, a0z], [a1x, y + 0.55 + mh, a1z], [a1x - ox, y + 0.55 + mh, a1z - oz], [a0x - ox, y + 0.55 + mh, a0z - oz], { hint: [0, 1, 0] });
    k.wall(mat, a0x - ox, a0z - oz, a0x, a0z, y + 0.55, y + 0.55 + mh, [-ux, -uz]);
    k.wall(mat, a1x, a1z, a1x - ox, a1z - oz, y + 0.55, y + 0.55 + mh, [ux, uz]);
    s += mw + gw;
  }
}

/** Flat roof slab with a low parapet: roof material on top, wall material for the parapet. */
export function flatRoof(k: Kit, roof: THREE.Material, wallMat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, parapet = 0.7): void {
  k.floor(roof, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y + 0.05);
  k.wall(wallMat, x0, z0, x1, z0, y, y + parapet, [0, -1]);
  k.wall(wallMat, x1, z0, x1, z1, y, y + parapet, [1, 0]);
  k.wall(wallMat, x1, z1, x0, z1, y, y + parapet, [0, 1]);
  k.wall(wallMat, x0, z1, x0, z0, y, y + parapet, [-1, 0]);
  // inner faces of the parapet
  k.wall(wallMat, x1 - 0.2, z0 + 0.2, x0 + 0.2, z0 + 0.2, y, y + parapet, [0, 1]);
  k.wall(wallMat, x1 - 0.2, z1 - 0.2, x1 - 0.2, z0 + 0.2, y, y + parapet, [-1, 0]);
  k.wall(wallMat, x0 + 0.2, z1 - 0.2, x1 - 0.2, z1 - 0.2, y, y + parapet, [0, -1]);
  k.wall(wallMat, x0 + 0.2, z0 + 0.2, x0 + 0.2, z1 - 0.2, y, y + parapet, [1, 0]);
  k.floor(wallMat, [[x0, z0], [x1, z0], [x1, z0 + 0.2], [x0, z0 + 0.2]], y + parapet);
  k.floor(wallMat, [[x0, z1 - 0.2], [x1, z1 - 0.2], [x1, z1], [x0, z1]], y + parapet);
  k.floor(wallMat, [[x0, z0 + 0.2], [x0 + 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x0, z1 - 0.2]], y + parapet);
  k.floor(wallMat, [[x1 - 0.2, z0 + 0.2], [x1, z0 + 0.2], [x1, z1 - 0.2], [x1 - 0.2, z1 - 0.2]], y + parapet);
}

// ----------------------------------------------------------------------------------------------- trees and furniture

let cloudGeo: THREE.BufferGeometry | null = null;

/** append a geometry (positions, normals, uv) to a material bucket under a transform given as scale, yaw and translation */
export function addGeo(k: Kit, mat: THREE.Material, g: THREE.BufferGeometry, sx: number, sy: number, sz: number, yaw: number, tx: number, ty: number, tz: number): void {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < p.count; i += 3) {
    const pts: V3[] = [], nrm: V3[] = [];
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j) * sx, y = p.getY(i + j) * sy, z = p.getZ(i + j) * sz;
      pts.push([x * c + z * s + tx, y + ty, -x * s + z * c + tz]);
      const nx = n.getX(i + j), ny = n.getY(i + j), nz = n.getZ(i + j);
      nrm.push([nx * c + nz * s, ny, -nx * s + nz * c]);
    }
    // the cloud cards are one-sided with a radial normal: keep the card's own winding, shade by the radial normal
    k.tri(mat, pts[0], pts[1], pts[2], { uv: [[uv.getX(i), uv.getY(i)], [uv.getX(i + 1), uv.getY(i + 1)], [uv.getX(i + 2), uv.getY(i + 2)]] });
    void nrm;
  }
}

/** A park tree: octagonal trunk and two or three leaf clouds. `h` scales the whole tree (1 = a 7 m street tree). */
export function tree(k: Kit, x: number, z: number, rng: Rng, h = 1, solid = true): void {
  if (k.far) return;
  cloudGeo ??= buildCloudGeometry();
  const tr = k.m('treeTrunk');
  const lv = k.m('treeLeaves', rng.int(0, 3));
  const th = (2.6 + rng.next() * 0.8) * h;
  k.cyl(tr, x, z, 0.2 * h, 0, th, 6, { noTop: true });
  const R = (2.0 + rng.next() * 0.9) * h;
  k.floor(tr, [[x - 0.1, z - 0.1], [x + 0.1, z - 0.1], [x + 0.1, z + 0.1], [x - 0.1, z + 0.1]], th); // keeps the trunk top closed under the leaves
  const clouds = rng.chance(0.5) ? 3 : 2;
  for (let c = 0; c < clouds; c++) {
    const a = rng.next() * Math.PI * 2, r = c === 0 ? 0 : R * 0.45;
    addGeo(k, lv, cloudGeo, R * (1 - c * 0.12), R * (0.85 - c * 0.1), R * (1 - c * 0.12), rng.next() * 6.28, x + Math.cos(a) * r, th + R * (0.55 + c * 0.35), z + Math.sin(a) * r);
  }
  if (solid) k.solidCircle(x, z, 0.35);
}

/** A bench: seat and back slats, two end frames (about 28 triangles). */
export function bench(k: Kit, x: number, z: number, yaw: [number, number], len = 1.8): void {
  if (k.far) return;
  // yaw is the direction the bench FACES (local unit vector)
  const [fx, fz] = yaw;
  const rx = fz, rz = -fx;
  const wood = k.m('stoop');
  const iron = k.flatM; // plain colour: a bench is not worth a draw call of its own
  const IRON = 0x2c2c2e;
  const hl = len / 2;
  const P = (a: number, b: number, y: number): V3 => [x + rx * a + fx * b, y, z + rz * a + fz * b];
  // seat
  k.quad(wood, P(-hl, -0.25, 0.46), P(hl, -0.25, 0.46), P(hl, 0.25, 0.46), P(-hl, 0.25, 0.46), { hint: [0, 1, 0], ru: 0.6, rv: 0.2 });
  k.quad(wood, P(-hl, -0.25, 0.42), P(hl, -0.25, 0.42), P(hl, -0.25, 0.46), P(-hl, -0.25, 0.46), { hint: [-fx, 0, -fz], ru: 0.6, rv: 0.05 });
  k.quad(wood, P(-hl, 0.25, 0.46), P(hl, 0.25, 0.46), P(hl, 0.25, 0.42), P(-hl, 0.25, 0.42), { hint: [fx, 0, fz], ru: 0.6, rv: 0.05 });
  // back
  k.quad(wood, P(-hl, -0.25, 0.5), P(hl, -0.25, 0.5), P(hl, -0.25, 0.95), P(-hl, -0.25, 0.95), { hint: [fx, 0, fz], ru: 0.6, rv: 0.15 });
  k.quad(wood, P(hl, -0.25, 0.5), P(-hl, -0.25, 0.5), P(-hl, -0.25, 0.95), P(hl, -0.25, 0.95), { hint: [-fx, 0, -fz], ru: 0.6, rv: 0.15 });
  for (const s of [-1, 1]) {
    const a = s * (hl - 0.1);
    k.quad(iron, P(a, -0.25, 0), P(a, 0.25, 0), P(a, 0.25, 0.42), P(a, -0.25, 0.42), { hint: [rx * s, 0, rz * s], ru: 0.1, rv: 0.1, color: IRON });
    k.quad(iron, P(a, 0.25, 0), P(a, -0.25, 0), P(a, -0.25, 0.42), P(a, 0.25, 0.42), { hint: [-rx * s, 0, -rz * s], ru: 0.1, rv: 0.1, color: IRON });
  }
}

/** A post lamp: thin pole and a lantern head (flat material, the lamps lane lights none of these). */
export function lampPost(k: Kit, x: number, z: number, h = 4.2): void {
  if (k.far) return;
  k.cyl(k.flatM, x, z, 0.06, 0, h, 5, { noTop: false, color: 0x2c2c2e });
  k.cyl(k.flatM, x, z, 0.22, h, h + 0.35, 6, { color: 0xf0e4c0 });
}

export interface FenceOpt { h?: number; gaps?: Array<[number, number]>; mat?: THREE.Material; collide?: boolean; postEvery?: number }

/** An iron fence run from (x0, z0) to (x1, z1); gaps are [from, to] distances along the run. Colliders on the solid parts. */
export function fence(k: Kit, x0: number, z0: number, x1: number, z1: number, o: FenceOpt = {}): void {
  if (k.far) return;
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.2) return;
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  const h = o.h ?? 1.2;
  const mat = o.mat ?? k.m('castIronFence', 0);
  const gaps = (o.gaps ?? []).slice().sort((a, b) => a[0] - b[0]);
  const segs: Array<[number, number]> = [];
  let s = 0;
  for (const g of gaps) { if (g[0] > s) segs.push([s, Math.min(g[0], L)]); s = Math.max(s, g[1]); }
  if (s < L) segs.push([s, L]);
  const pr = o.postEvery ?? 3;
  for (const [a, b] of segs) {
    const ax = x0 + ux * a, az = z0 + uz * a, bx = x0 + ux * b, bz = z0 + uz * b;
    if (b - a < 0.05) continue;
    k.quad(mat, [ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], { ru: (b - a) / 0.91, rv: h / 0.91, hint: [-uz, 0, ux] });
    const n = Math.max(1, Math.round((b - a) / pr));
    for (let i = 0; i <= n; i++) {
      const px = ax + ((bx - ax) * i) / n, pz = az + ((bz - az) * i) / n;
      k.cyl(k.flatM, px, pz, 0.05, 0, h + 0.1, 4, { noTop: false, color: 0x2c2c2e });
    }
    if (o.collide !== false) k.solidSeg(ax, az, bx, bz);
  }
}

// ----------------------------------------------------------------------------------------------- signs

/** A sign board on a wall (or free standing) facing `out`, centred at (cx, y, cz); 4:1 board of width w. */
export function signBoard(k: Kit, text: string, cx: number, y: number, cz: number, out: Dir2, w: number, bg: string, fg: string, proud = 0.08): void {
  if (k.far) return;
  const mat = signMaterial(k.lib, text, bg, fg);
  const [rx, rz] = rightOf(out);
  const h = w / 4;
  const px = cx + out[0] * proud, pz = cz + out[1] * proud;
  k.quad(mat, [px - rx * w / 2, y, pz - rz * w / 2], [px + rx * w / 2, y, pz + rz * w / 2], [px + rx * w / 2, y + h, pz + rz * w / 2], [px - rx * w / 2, y + h, pz - rz * w / 2], { hint: [out[0], 0, out[1]], ru: 1, rv: 1, uv: [0, 0, 1, 1] });
}

/** a hip roof over a rectangle: four sloping faces meeting at a ridge (or a point when the ridge length is 0) */
export function hip(k: Kit, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, yEave: number, yRidge: number, over = 0.4): void {
  const W = x1 - x0, D = z1 - z0;
  const rl = Math.max(0, Math.abs(W - D));
  const horiz = W >= D;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rx0 = horiz ? cx - rl / 2 : cx, rx1 = horiz ? cx + rl / 2 : cx, rz0 = horiz ? cz : cz - rl / 2, rz1 = horiz ? cz : cz + rl / 2;
  const a: V3 = [x0 - over, yEave, z0 - over], b: V3 = [x1 + over, yEave, z0 - over], c: V3 = [x1 + over, yEave, z1 + over], d: V3 = [x0 - over, yEave, z1 + over];
  const r0: V3 = [rx0, yRidge, rz0], r1: V3 = [rx1, yRidge, rz1];
  if (horiz) {
    k.quad(mat, a, b, r1, r0, { hint: [0, 1, -1] });
    k.quad(mat, c, d, r0, r1, { hint: [0, 1, 1] });
    k.tri(mat, d, a, r0, { hint: [-1, 1, 0] });
    k.tri(mat, b, c, r1, { hint: [1, 1, 0] });
  } else {
    k.quad(mat, d, a, r0, r1, { hint: [-1, 1, 0] });
    k.quad(mat, b, c, r1, r0, { hint: [1, 1, 0] });
    k.tri(mat, a, b, r0, { hint: [0, 1, -1] });
    k.tri(mat, c, d, r1, { hint: [0, 1, 1] });
  }
}

/** a round-headed window or door opening on a wall: a rectangle with a half-disc head. `mat` fills it. */
export function archPane(k: Kit, mat: THREE.Material, cx: number, z: number, y0: number, w: number, h: number, out: Dir2, alongX = true, proud = 0.06): void {
  if (k.far) return;
  const hint: V3 = [out[0], 0, out[1]];
  const r = w / 2;
  const yS = y0 + h - r;
  const P = (s: number, y: number): V3 => (alongX ? [cx + s, y, z + out[1] * proud] : [z + out[0] * proud, y, cx + s]);
  k.quad(mat, P(-r, y0), P(r, y0), P(r, yS), P(-r, yS), { hint, ru: 1, rv: 1 });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n), a1 = Math.PI * ((i + 1) / n);
    k.tri(mat, P(-Math.cos(a0) * r, yS + Math.sin(a0) * r), P(-Math.cos(a1) * r, yS + Math.sin(a1) * r), P(0, yS), { hint, uv: [[0.5 - Math.cos(a0) * 0.5, 0.8], [0.5 - Math.cos(a1) * 0.5, 0.8], [0.5, 0.7]] });
  }
}

/** a stone surround for an arched opening: two jambs and a head course (cheap: three quads) */
export function archSurround(k: Kit, mat: THREE.Material, cx: number, z: number, y0: number, w: number, h: number, out: Dir2, alongX = true, t = 0.35, proud = 0.1): void {
  if (k.far) return;
  const hint: V3 = [out[0], 0, out[1]];
  const P = (s: number, y: number): V3 => (alongX ? [cx + s, y, z + out[1] * proud] : [z + out[0] * proud, y, cx + s]);
  const r = w / 2;
  k.quad(mat, P(-r - t, y0), P(-r, y0), P(-r, y0 + h - r), P(-r - t, y0 + h - r), { hint, ru: 0.15, rv: 1 });
  k.quad(mat, P(r, y0), P(r + t, y0), P(r + t, y0 + h - r), P(r, y0 + h - r), { hint, ru: 0.15, rv: 1 });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n), a1 = Math.PI * ((i + 1) / n);
    const o0 = r + t, i0 = r;
    k.quad(mat, P(-Math.cos(a0) * i0, y0 + h - r + Math.sin(a0) * i0), P(-Math.cos(a1) * i0, y0 + h - r + Math.sin(a1) * i0), P(-Math.cos(a1) * o0, y0 + h - r + Math.sin(a1) * o0), P(-Math.cos(a0) * o0, y0 + h - r + Math.sin(a0) * o0), { hint, ru: 0.2, rv: 0.2 });
  }
}

/** steps down toward a direction: n treads of depth `tread` and rise `rise`, width w, from (x, z) going `out` */
export function steps(k: Kit, mat: THREE.Material, cx: number, z: number, w: number, n: number, rise: number, tread: number, out: Dir2): void {
  // box steps, built from the top (against the wall) outward
  for (let i = 0; i < n; i++) {
    const hgt = rise * (n - i);
    const d0 = i * tread, d1 = (i + 1) * tread;
    const x0 = cx - w / 2, x1 = cx + w / 2;
    if (out[1] !== 0) {
      const za = z + out[1] * d0, zb = z + out[1] * d1;
      k.box(mat, x0, 0, Math.min(za, zb), x1, hgt, Math.max(za, zb));
    } else {
      const xa = z + out[0] * d0, xb = z + out[0] * d1;
      k.box(mat, Math.min(xa, xb), 0, x0, Math.max(xa, xb), hgt, x1);
    }
  }
}

// ----------------------------------------------------------------------------------------------- LANDMARKS2 parts

/** a pointed-head (lancet) opening: a rectangle with a two-sided gable head. Same arguments as archPane. */
export function lancetPane(k: Kit, mat: THREE.Material, cx: number, z: number, y0: number, w: number, h: number, out: Dir2, alongX = true, proud = 0.06): void {
  if (k.far) return;
  const hint: V3 = [out[0], 0, out[1]];
  const r = w / 2;
  const yS = y0 + h - r * 1.4;
  const P = (s: number, y: number): V3 => (alongX ? [cx + s, y, z + out[1] * proud] : [z + out[0] * proud, y, cx + s]);
  k.quad(mat, P(-r, y0), P(r, y0), P(r, yS), P(-r, yS), { hint, ru: 1, rv: 1 });
  k.tri(mat, P(-r, yS), P(r, yS), P(0, y0 + h), { hint, uv: [[0, 0.7], [1, 0.7], [0.5, 1]] });
}

/** a pointed surround for lancetPane (two jambs and two head rakes) */
export function lancetSurround(k: Kit, mat: THREE.Material, cx: number, z: number, y0: number, w: number, h: number, out: Dir2, alongX = true, t = 0.3, proud = 0.1): void {
  if (k.far) return;
  const hint: V3 = [out[0], 0, out[1]];
  const r = w / 2;
  const yS = y0 + h - r * 1.4;
  const P = (s: number, y: number): V3 => (alongX ? [cx + s, y, z + out[1] * proud] : [z + out[0] * proud, y, cx + s]);
  k.quad(mat, P(-r - t, y0), P(-r, y0), P(-r, yS), P(-r - t, yS), { hint, ru: 0.12, rv: 1 });
  k.quad(mat, P(r, y0), P(r + t, y0), P(r + t, yS), P(r, yS), { hint, ru: 0.12, rv: 1 });
  k.quad(mat, P(-r - t, yS), P(-r, yS), P(0, y0 + h), P(0, y0 + h + t * 1.2), { hint, ru: 0.3, rv: 0.12 });
  k.quad(mat, P(r, yS), P(r + t, yS), P(0, y0 + h + t * 1.2), P(0, y0 + h), { hint, ru: 0.3, rv: 0.12 });
}

/** a regular n-gon disc (porthole, rose, sun) standing on a wall: centre (cx, y, cz), facing `out`, radius r, `proud` off the wall */
export function disc(k: Kit, mat: THREE.Material, cx: number, y: number, cz: number, r: number, out: Dir2, n = 12, proud = 0.05, o?: { color?: number }): void {
  if (k.far) return;
  const [rx, rz] = rightOf(out);
  const hint: V3 = [out[0], 0, out[1]];
  const P = (a: number, rr: number): V3 => [cx + out[0] * proud + rx * Math.cos(a) * rr, y + Math.sin(a) * rr, cz + out[1] * proud + rz * Math.cos(a) * rr];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    k.tri(mat, [cx + out[0] * proud, y, cz + out[1] * proud], P(a0, r), P(a1, r), { hint, color: o?.color, uv: [[0.5, 0.5], [0.5 + Math.cos(a0) * 0.45, 0.5 + Math.sin(a0) * 0.45], [0.5 + Math.cos(a1) * 0.45, 0.5 + Math.sin(a1) * 0.45]] });
  }
}

/** a flat-coloured quad on a wall plane: u along the wall from (x0, z0) toward (x1, z1), v up. Used by mural art and lettering bars. */
export interface WallPlane { x0: number; z0: number; ux: number; uz: number; out: Dir2 }
export function planePoint(p: WallPlane, u: number, v: number, off: number): V3 {
  return [p.x0 + p.ux * u + p.out[0] * off, v, p.z0 + p.uz * u + p.out[1] * off];
}
