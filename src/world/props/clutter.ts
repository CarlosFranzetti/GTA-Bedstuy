/**
 * Street density ("the street is dressed"): sidewalk clutter, road and sidewalk decals, posters, stickers, overhead
 * string lights. Everything is deterministic (forked Rng per block face) and merged per bucket:
 *
 *   props:clutter-sw-r<rank>        vertex-coloured solid props (newspaper boxes, bike racks + bikes, planters, bollards,
 *                                   sandwich boards, milk crates, barricades, mailboxes)
 *   props:clutter-bag-r1-d<0..2>    kerbside trash-bag piles; group d is out only on its pickup nights (see clutterTier.ts)
 *   props:clutter-flat-r<rank>      alpha-blended vertex-coloured decals: asphalt patches, tar snakes, manhole rings,
 *                                   oil stains, gum, NO PARKING stencils, posters, stickers
 *   props:clutter-lights-r2         party string-light bulbs
 *   props:wiresClutter              string-light wire + a pair of sneakers on it (name prefix `props:wires`: phone-hidden)
 *
 * `rank` is the lowest quality tier that draws the mesh: 1 = low and up, 2 = medium and up. Phone draws none of it.
 * Decals are flat quads a hair above the road / sidewalk; solid props stay on the sidewalk strip, never in a lane.
 */
import * as THREE from 'three';
import type { Block, BlockFace, GridModel, IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { PropsBuilder, box, cyl, faceFrame, frameMatrix, furnitureBlocked, near, xform, type FaceFrame } from './common';

/** Radius (m) around a lot's centre line where its door and stoop are; nothing solid is put there. */
export const DOOR_ZONE = 1.4;
const SW_Y = 0.012;
const ROAD_Y = -0.15 + 0.012;

export type ClutterKind =
  | 'newsbox' | 'mailbox' | 'bikeRack' | 'planter' | 'bollard' | 'sandwichBoard' | 'crates' | 'barricade' | 'bags'
  | 'patch' | 'tarSnake' | 'manhole' | 'oil' | 'gum' | 'noParking' | 'poster' | 'sticker' | 'stringLights';

export interface ClutterPlacement { kind: ClutterKind; x: number; z: number; rank: 1 | 2; /** solid prop (must stay off the road / doors) */ solid: boolean; faceKey: string; }

export interface ClutterStats { placements: ClutterPlacement[]; tris: { 1: number; 2: number }; }

// ---------------------------------------------------------------- vertex-coloured geometry

const _c = new THREE.Color();
function paint<G extends THREE.BufferGeometry>(geo: G, hex: string, alpha?: number): G {
  const n = geo.getAttribute('position').count;
  const size = alpha === undefined ? 3 : 4;
  const arr = new Float32Array(n * size);
  _c.set(hex);
  for (let i = 0; i < n; i++) {
    arr[i * size] = _c.r; arr[i * size + 1] = _c.g; arr[i * size + 2] = _c.b;
    if (size === 4) arr[i * size + 3] = alpha!;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, size));
  return geo;
}

const triCount = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

const NEWS = ['#b8281f', '#1f4e9c', '#d9a21b', '#2e7d4f', '#7a3d8f'];
const BIKE = ['#c0392b', '#2c3e50', '#16a085', '#f39c12', '#222428', '#8e44ad'];
const BAG = ['#0e0f12', '#0e0f12', '#1a2a1c', '#2b2d31', '#d9d9d4', '#0e0f12'];
const CRATE = ['#2a64b5', '#e8e8e0', '#c03a2b', '#222428'];
const POSTER = ['#e8d44d', '#e0533a', '#3a7bd5', '#f2f2ee', '#59b36b', '#d96aa7', '#f08a24', '#8a6bd1'];
const STICKER = ['#e8d44d', '#e0533a', '#3a7bd5', '#f2f2ee', '#59b36b', '#111111'];

type Geos = THREE.BufferGeometry[];

function newsbox(rng: Rng): Geos {
  const col = rng.pick(NEWS);
  return [
    paint(cyl(0.05, 0.05, 0.45, 5).translate(0, 0.225, 0), '#2a2c30'),
    paint(box(0.46, 0.55, 0.4).translate(0, 0.72, 0), col),
    paint(box(0.34, 0.24, 0.02).translate(0, 0.78, 0.205), '#14181c'),
    paint(box(0.4, 0.04, 0.34).translate(0, 1.01, 0), '#2a2c30'),
  ];
}
function mailbox(): Geos {
  return [
    paint(box(0.06, 0.45, 0.06).translate(-0.18, 0.225, 0), '#2a2c30'),
    paint(box(0.06, 0.45, 0.06).translate(0.18, 0.225, 0), '#2a2c30'),
    paint(box(0.5, 0.5, 0.45).translate(0, 0.7, 0), '#1f4f9a'),
    paint(cyl(0.225, 0.225, 0.5, 9).rotateX(Math.PI / 2).translate(0, 0.95, 0), '#1f4f9a'),
    paint(box(0.3, 0.05, 0.02).translate(0, 0.78, 0.226), '#0b0e12'),
  ];
}
function bikeRack(rng: Rng, bikes: number): Geos {
  const g: Geos = [];
  for (const x of [-0.55, 0.55]) {
    g.push(paint(cyl(0.022, 0.022, 0.6, 5).translate(x - 0.25, 0.3, 0), '#2a2c30'));
    g.push(paint(cyl(0.022, 0.022, 0.6, 5).translate(x + 0.25, 0.3, 0), '#2a2c30'));
    g.push(paint(new THREE.TorusGeometry(0.25, 0.022, 4, 8, Math.PI).translate(x, 0.6, 0), '#2a2c30'));
  }
  for (let i = 0; i < bikes; i++) g.push(...bike(rng, i === 0 ? -0.55 : 0.55));
  return g;
}
function bike(rng: Rng, x: number): Geos {
  const col = rng.pick(BIKE), z = x < 0 ? 0.12 : -0.12;
  const wheel = (dx: number): THREE.BufferGeometry => paint(new THREE.TorusGeometry(0.3, 0.022, 4, 10).translate(x + dx, 0.32, z), '#16181b');
  const bar = (a: [number, number], b: [number, number], t = 0.02): THREE.BufferGeometry => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return paint(cyl(t, t, len, 4).rotateZ(Math.atan2(-(b[0] - a[0]), b[1] - a[1])).translate(x + (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), col);
  };
  return [
    wheel(-0.4), wheel(0.4),
    bar([-0.4, 0.32], [-0.05, 0.62]), bar([-0.05, 0.62], [0.32, 0.62]), bar([0.32, 0.62], [0.4, 0.32]), bar([-0.05, 0.62], [0.05, 0.32]),
    bar([0.32, 0.62], [0.28, 0.82]), paint(box(0.22, 0.02, 0.05).translate(x + 0.28, 0.83, z), '#14181c'),
    paint(box(0.18, 0.04, 0.08).translate(x - 0.07, 0.68, z), '#14181c'),
  ];
}
function planter(rng: Rng): Geos {
  const w = rng.range(0.8, 1.2);
  const g: Geos = [
    paint(box(w, 0.5, 0.5).translate(0, 0.25, 0), rng.pick(['#6b4a3a', '#4a4d52', '#7d6a55'])),
    paint(box(w - 0.08, 0.04, 0.42).translate(0, 0.5, 0), '#2b2018'),
  ];
  const n = Math.max(1, Math.round(w / 0.45));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.42, r = rng.range(0.22, 0.34);
    g.push(paint(new THREE.SphereGeometry(r, 6, 4).scale(1, 1.1, 1).translate(x, 0.55 + r * 0.7, 0), rng.pick(['#2f6b35', '#3c7a3e', '#5a8a2f'])));
    if (rng.chance(0.4)) g.push(paint(new THREE.SphereGeometry(0.07, 4, 3).translate(x + 0.1, 0.55 + r * 1.35, 0.05), rng.pick(['#d9482b', '#e8d44d', '#f2f2ee'])));
  }
  return g;
}
function bollard(rng: Rng): Geos {
  return [paint(cyl(0.065, 0.075, 0.9, 7).translate(0, 0.45, 0), rng.chance(0.3) ? '#d4b21a' : '#2a2c30'), paint(cyl(0.075, 0.075, 0.04, 7).translate(0, 0.9, 0), '#8d9096')];
}
function sandwichBoard(rng: Rng): Geos {
  const g: Geos = [];
  for (const s of [-1, 1]) {
    const part = (geo: THREE.BufferGeometry): THREE.BufferGeometry => geo.rotateX(s * 0.22).translate(0, 0, s * 0.13);
    g.push(part(paint(box(0.62, 0.9, 0.03).translate(0, 0.45, 0), '#8a5a2b')));
    if (s === 1) {
      g.push(part(paint(box(0.52, 0.78, 0.01).translate(0, 0.46, 0.02), '#1e2b25')));
      for (let i = 0; i < 3; i++) g.push(part(paint(box(rng.range(0.25, 0.42), 0.025, 0.005).translate(0, 0.66 - i * 0.13, 0.03), '#e6e6dc')));
    }
  }
  return g;
}
function crates(rng: Rng): Geos {
  const g: Geos = [];
  const n = rng.int(2, 5);
  for (let i = 0; i < n; i++) {
    const col = rng.pick(CRATE), tier = i >= 3 ? 1 : 0, k = tier ? i - 3 : i;
    const geo = paint(box(0.34, 0.28, 0.34).translate(0, 0.14, 0), col);
    geo.rotateY(rng.range(-0.25, 0.25)).translate(k * 0.36 + (tier ? 0.18 : 0), tier * 0.28, rng.range(-0.03, 0.03));
    g.push(geo);
  }
  return g;
}
function barricade(): Geos {
  const g: Geos = [];
  for (const x of [-0.8, 0.8]) g.push(paint(box(0.05, 0.9, 0.5).translate(x, 0.45, 0), '#4a4d52'));
  for (const y of [0.75, 0.45]) {
    for (let i = 0; i < 6; i++) g.push(paint(box(0.3, 0.2, 0.04).translate(-0.75 + 0.3 * i, y, 0.03), i % 2 ? '#f2f2ee' : '#e8631a'));
  }
  return g;
}
function bagPile(rng: Rng): Geos {
  const g: Geos = [];
  const n = rng.int(3, 7);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.24, 0.36), a = rng.range(0, 6.28), d = i === 0 ? 0 : rng.range(0.2, 0.5);
    const top = i >= 4;
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.7, y = top ? r * 1.5 + 0.12 : r * 0.8;
    g.push(paint(new THREE.SphereGeometry(r, 5, 4).scale(1, 0.85, 1).rotateY(rng.range(0, 3)).translate(x, y, z), rng.pick(BAG)));
    g.push(paint(new THREE.ConeGeometry(0.05, 0.11, 3).translate(x, y + r * 0.8, z), '#16171a'));
  }
  if (rng.chance(0.35)) g.push(paint(box(0.5, 0.35, 0.4).rotateY(rng.range(0, 3)).translate(rng.range(-0.5, 0.5), 0.18, rng.range(0.3, 0.6)), '#8a7a5a')); // cardboard
  return g;
}
function sneakers(): Geos {
  return [-0.08, 0.1].flatMap((x) => [
    paint(box(0.1, 0.09, 0.27).translate(x, -0.38, 0), '#f2f2ee'),
    paint(box(0.1, 0.03, 0.28).translate(x, -0.44, 0), '#d94b2b'),
    paint(cyl(0.006, 0.006, 0.34, 3).translate(x, -0.2, 0), '#111111'),
  ]);
}

// ---------------------------------------------------------------- flat decals

const flatQuad = (w: number, d: number, yaw: number, x: number, y: number, z: number): THREE.BufferGeometry =>
  new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, y, z);
const flatBlob = (r: number, sx: number, sz: number, yaw: number, x: number, y: number, z: number, seg = 9): THREE.BufferGeometry =>
  new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).scale(sx, 1, sz).rotateY(yaw).translate(x, y, z);

function ribbon(pts: Vec2[], w: number, y: number, hex: string, alpha: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], nor: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    const hw = (w / 2) * (i === 0 || i === pts.length - 1 ? 0.5 : 1);
    pos.push(pts[i].x + nx * hw, y, pts[i].z + nz * hw, pts[i].x - nx * hw, y, pts[i].z - nz * hw);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, i / pts.length, 1, i / pts.length);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return paint(g, hex, alpha);
}

/** Parody poster on a wall: paper, a picture blob and text bars (no words, no brands). Centre at `p`, facing `n`. */
function poster(rng: Rng, p: Vec2, y: number, n: Vec2, w: number, h: number, off = 0.02): Geos {
  const col = rng.pick(POSTER), ink = rng.chance(0.5) ? '#16181b' : '#f2f2ee';
  const tilt = rng.range(-0.06, 0.06);
  const m = frameMatrix({ x: p.x + n.x * off, z: p.z + n.z * off }, y, n);
  const layer = (geo: THREE.BufferGeometry, z: number): THREE.BufferGeometry => geo.rotateZ(tilt).translate(0, 0, z).applyMatrix4(m);
  const g: Geos = [layer(paint(new THREE.PlaneGeometry(w, h), col, 1), 0)];
  g.push(layer(paint(new THREE.CircleGeometry(w * 0.28, 8).translate(0, h * 0.14, 0), ink, 0.85), 0.004));
  for (let i = 0; i < 3; i++) g.push(layer(paint(new THREE.PlaneGeometry(w * rng.range(0.4, 0.8), h * 0.05).translate(0, -h * 0.22 - i * h * 0.1, 0), ink, 0.9), 0.004));
  return g;
}

// ---------------------------------------------------------------- tier budget

/** Lowest quality rank that draws a bucket: phone 0 (none), low 1, medium and high 2. */
export const CLUTTER_RANK: Record<string, 0 | 1 | 2> = { phone: 0, low: 1, medium: 2, high: 2 };
/** Triangle budget of the clutter layer per tier (measured on the real map: see docs/swarm/transcript.md CLUTTER FINAL REPORT). */
/** Least items per 100 m of frontage a face carries at the low tier (the median face has ~7). */
export const MIN_LOW_PER_100M = 3.5;
export const CLUTTER_TRI_BUDGET: Record<string, number> = { phone: 0, low: 45_000, medium: 150_000, high: 150_000 };

// ---------------------------------------------------------------- builder

const bucketOf = (rank: 1 | 2): string => `clutter-sw-r${rank}`;

export function buildClutter(pb: PropsBuilder, grid: GridModel, lots: Lot[], materials: IMaterialLibrary, rng: Rng): ClutterStats {
  // One material instance per bucket: applyClutterState (clutterTier.ts) hides a tier / pickup group by flipping
  // `material.visible`, which survives the per-cell mesh split in WorldBuilder.
  const solidMat = (key: string): THREE.Material => pb.material(key, () => new THREE.MeshStandardMaterial({ name: key, vertexColors: true, roughness: 0.7, metalness: 0.12 }));
  const flat = (key: string): THREE.Material => pb.material(key, () => new THREE.MeshStandardMaterial({
    name: key, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  const lightMat = pb.material('clutter-lights-r2', () => new THREE.MeshBasicMaterial({ name: 'clutter-lights-r2', vertexColors: true, toneMapped: false }));
  const wireMat = pb.material('clutter-wire', () => new THREE.MeshStandardMaterial({ name: 'clutter-wire', color: '#15171a', roughness: 0.8 }));
  const stats: ClutterStats = { placements: [], tris: { 1: 0, 2: 0 } };

  const emit = (key: string, geos: Geos, rank: 1 | 2, kind: ClutterKind, x: number, y: number, z: number, yaw: number, solid: boolean, faceKey: string, world = false): void => {
    for (const g of geos) {
      if (!world) xform(g, x, y, z, yaw);
      // bag piles come in three pickup groups of which only one is out at a time: count a third
      stats.tris[rank] += key.startsWith('clutter-bag') ? triCount(g) / 3 : triCount(g);
      pb.put(key, key.startsWith('clutter-flat') ? flat(key) : key.startsWith('clutter-lights') ? lightMat : solidMat(key), g);
    }
    stats.placements.push({ kind, x, z, rank, solid, faceKey });
    pb.count(kind);
  };

  for (const block of grid.blocks as Block[]) {
    for (const face of block.faces as BlockFace[]) {
      const fr = faceFrame(face);
      const fk = `${block.id}${face.side}`;
      const frng = rng.fork(`c:${fk}`);
      const street = grid.streetById(face.streetId);
      const faceLots = lots.filter((l) => l.blockId === block.id && l.side === face.side);
      const used: Vec2[] = [];
      const faceStart = stats.placements.length;
      const stripW = fr.stripWidth;
      const lotSpan = (l: Lot): [number, number] => { const a = fr.along(l.frontA), b = fr.along(l.frontB); return [Math.min(a, b), Math.max(a, b)]; };
      const free = (s: number, inset: number, sep: number): Vec2 | null => {
        if (s < 4 || s > fr.L - 4) return null;
        const p = fr.at(s, inset);
        if (furnitureBlocked(s, fr.L, sep * 0.7) || near(p, pb.occupied, sep) || near(p, used, sep)) return null;
        return p;
      };
      const take = (p: Vec2): void => { used.push(p); };

      // ---- per lot
      for (const lot of faceLots) {
        const [lo, hi] = lotSpan(lot), mid = (lo + hi) / 2;
        const nearDoorEdge = (s: number): boolean => Math.abs(s - mid) < DOOR_ZONE;
        if (lot.type === 'brownstone' || lot.type === 'rowhouse') {
          // trash bags at the foot of the stoop, off to one side of the door; three pickup groups
          if (frng.chance(0.62)) {
            const side = frng.chance(0.5) ? 1 : -1;
            const s = mid + side * Math.min(DOOR_ZONE + 0.5, Math.max(DOOR_ZONE + 0.1, (hi - lo) / 2 - 0.7));
            const p = free(s, Math.max(0.6, stripW - 0.75), 1.3);
            if (p && !nearDoorEdge(s) && s > lo + 0.3 && s < hi - 0.3) {
              const day = Math.floor(frng.range(0, 3));
              emit(`clutter-bag-r1-d${day}`, bagPile(frng), 1, 'bags', p.x, SW_Y, p.z, frng.range(0, 6), false, fk);
              take(p);
            }
          }
          // a planter on the stoop side of some rows
          if (lot.type === 'brownstone' && frng.chance(0.18)) {
            const s = lo + 0.9;
            const p = free(s, stripW - 0.6, 1.0);
            if (p && !nearDoorEdge(s)) { emit(bucketOf(2), planter(frng), 2, 'planter', p.x, SW_Y, p.z, fr.yaw, true, fk); pb.circle(p, 0.4); take(p); }
          }
        } else if (lot.type === 'mixeduse') {
          const bodega = lot.poi?.archetype === 'bodega';
          if (frng.chance(bodega ? 0.9 : 0.35)) { // sandwich board near the door, on the curb side of the strip's inner half
            const s = frng.chance(0.5) ? lo + 0.8 : hi - 0.8;
            const p = free(s, Math.min(stripW - 0.5, 1.6), 1.1);
            if (p && !nearDoorEdge(s)) { emit(bucketOf(1), sandwichBoard(frng), 1, 'sandwichBoard', p.x, SW_Y, p.z, fr.yaw + frng.range(-0.3, 0.3), true, fk); pb.circle(p, 0.35); take(p); }
          }
          if (bodega || frng.chance(0.2)) { // milk crates by the corner store
            const s = lo + 0.7;
            const p = free(s, Math.min(stripW - 0.5, 1.4), 0.9);
            if (p) { emit(bucketOf(1), crates(frng), 1, 'crates', p.x, SW_Y, p.z, fr.yaw, false, fk); take(p); }
          }
          if (frng.chance(0.3)) {
            const s = hi - 0.5;
            const p = free(s, 0.5, 0.9);
            if (p) { emit(bucketOf(1), newsbox(frng), 1, 'newsbox', p.x, SW_Y, p.z, fr.yaw + Math.PI, true, fk); pb.circle(p, 0.28); take(p); }
          }
          if (frng.chance(0.28)) {
            const s = mid + frng.range(-1, 1);
            const p = free(s, 0.8, 1.6);
            if (p) { emit(bucketOf(2), bikeRack(frng, frng.chance(0.7) ? (frng.chance(0.5) ? 1 : 2) : 0), 2, 'bikeRack', p.x, SW_Y, p.z, fr.yaw, true, fk); pb.circle(p, 0.45); take(p); }
          }
          if (frng.chance(0.25)) {
            for (const dx of [-0.9, 0.9]) {
              const p = free(mid + dx + frng.range(-0.3, 0.3), 0.45, 0.8);
              if (p) { emit(bucketOf(2), bollard(frng), 2, 'bollard', p.x, SW_Y, p.z, 0, true, fk); pb.circle(p, 0.12); take(p); }
            }
          }
          if (frng.chance(0.3)) {
            const s = lo + 1.4 + frng.range(0, 1);
            const p = free(s, stripW - 0.45, 1.0);
            if (p && !nearDoorEdge(s)) { emit(bucketOf(2), planter(frng), 2, 'planter', p.x, SW_Y, p.z, fr.yaw, true, fk); pb.circle(p, 0.4); take(p); }
          }
          // gum speckle in front of the shop
          if (frng.chance(0.7)) {
            const g: Geos = [];
            const cp = fr.at(mid + frng.range(-1.5, 1.5), frng.range(1, Math.max(1.2, stripW - 0.4)));
            const n = frng.int(10, 20);
            for (let i = 0; i < n; i++) g.push(paint(flatBlob(frng.range(0.025, 0.05), 1, 1, 0, cp.x + frng.range(-0.7, 0.7), SW_Y, cp.z + frng.range(-0.7, 0.7), 5), frng.chance(0.6) ? '#cfcac0' : '#4b4d51', 0.85));
            emit('clutter-flat-r2', g, 2, 'gum', cp.x, SW_Y, cp.z, 0, false, fk, true);
          }
        } else if (lot.type === 'scaffold') {
          // construction barricades at the kerb in front of the shed, wheat-pasted ads and a tag on the plywood
          for (const s of [lo + 0.9, hi - 0.9]) {
            const p = free(s, 0.7, 1.2);
            if (p) { emit(bucketOf(1), barricade(), 1, 'barricade', p.x, SW_Y, p.z, fr.yaw, true, fk); pb.rectCollider(p, fr.u, 0.9, 0.25); take(p); }
          }
          const n2 = { x: lot.outward.x, z: lot.outward.z };
          const along = { x: (lot.frontB.x - lot.frontA.x) / (lot.width || 1), z: (lot.frontB.z - lot.frontA.z) / (lot.width || 1) };
          const wallAt = (t: number): Vec2 => ({ x: lot.frontA.x + along.x * t - n2.x * 0.19, z: lot.frontA.z + along.z * t - n2.z * 0.19 });
          const count = Math.min(5, Math.max(2, Math.floor(lot.width / 1.1)));
          const g: Geos = [];
          for (let i = 0; i < count; i++) {
            const t = ((i + 0.5) / count) * lot.width;
            const w = frng.range(0.6, 0.85);
            g.push(...poster(frng, wallAt(t), frng.range(0.6, 1.9), n2, w, w * frng.range(1.2, 1.5), 0));
          }
          emit('clutter-flat-r1', g, 1, 'poster', lot.frontA.x, 0, lot.frontA.z, 0, false, fk, true);
          if (frng.chance(0.6)) {
            const variant = frng.int(0, 4), wd = frng.range(1.6, 2.4);
            const gg = new THREE.PlaneGeometry(wd, wd / 2).translate(0, frng.range(0.5, 1.4) + wd / 4, 0).applyMatrix4(frameMatrix(wallAt(frng.range(wd / 2, Math.max(wd / 2 + 0.1, lot.width - wd / 2))), 0, { x: n2.x, z: n2.z }));
            gg.applyMatrix4(new THREE.Matrix4().makeTranslation(n2.x * 0.02, 0, n2.z * 0.02));
            pb.put(`graffiti:${variant}`, materials.get('graffiti', variant), gg);
            pb.count('graffiti');
          }
        } else if (lot.type === 'vacant') {
          // wheat-paste posters near the street end of the exposed party wall (graffiti starts 3 m in)
          for (const end of ['A', 'B'] as const) {
            if (!frng.chance(0.55)) continue;
            const e = end === 'A' ? lot.frontA : lot.frontB, o = end === 'A' ? lot.frontB : lot.frontA;
            const l = Math.hypot(o.x - e.x, o.z - e.z) || 1;
            const n = { x: (o.x - e.x) / l, z: (o.z - e.z) / l };
            const g: Geos = [];
            const cnt = frng.int(2, 4);
            for (let i = 0; i < cnt; i++) {
              const zc = 0.45 + i * 0.4 + frng.range(-0.05, 0.05);
              const p = { x: e.x + n.x * 0.03 - lot.outward.x * zc, z: e.z + n.z * 0.03 - lot.outward.z * zc };
              g.push(...poster(frng, p, frng.range(1.6, 3.6), n, 0.38, frng.range(0.5, 0.7), 0));
            }
            emit('clutter-flat-r2', g, 2, 'poster', e.x, 0, e.z, 0, false, fk, true);
          }
        }
      }

      // ---- per face: kerb furniture
      if (frng.chance(0.22)) {
        const p = free(fr.L * frng.range(0.35, 0.65), 0.45, 1.5);
        if (p) { emit(bucketOf(2), mailbox(), 2, 'mailbox', p.x, SW_Y, p.z, fr.yaw, true, fk); pb.circle(p, 0.28); take(p); }
      }
      // lamp-post stickers (the mid-face lamp is at 0.6 m in; pole radius ~ 0.085 at sticker height)
      if (frng.chance(0.6)) {
        const lp = fr.at(fr.L / 2, 0.6);
        const g: Geos = [];
        const n = frng.int(3, 7);
        for (let i = 0; i < n; i++) {
          const a = frng.range(0, Math.PI * 2), r = 0.092;
          const nx = Math.cos(a), nz = Math.sin(a);
          const sz = frng.range(0.07, 0.12);
          const q = new THREE.PlaneGeometry(sz, sz * frng.range(0.7, 1.2)).applyMatrix4(frameMatrix({ x: lp.x + nx * r, z: lp.z + nz * r }, frng.range(1.2, 2.0), { x: nx, z: nz }));
          g.push(paint(q, frng.pick(STICKER), 1));
        }
        emit('clutter-flat-r2', g, 2, 'sticker', lp.x, 0, lp.z, 0, false, fk, true);
      }

      // ---- road and sidewalk decals
      const rw = street.roadWidth;
      const roadPt = (s: number, d: number): Vec2 => fr.at(s, -d); // d metres out from the kerb into the roadway
      const maxD = Math.max(1.5, rw / 2 - 1.5);
      const nPatch = frng.int(0, 2);
      for (let i = 0; i < nPatch; i++) {
        const c = roadPt(frng.range(5, fr.L - 5), frng.range(1, maxD));
        const g: Geos = [];
        const yaw = frng.range(0, 3.1), w = frng.range(1, 2.4), d = frng.range(0.7, 1.6);
        g.push(paint(flatQuad(w, d, yaw, c.x, ROAD_Y, c.z), '#17191c', 0.62));
        g.push(paint(flatQuad(w * 0.8, d * 0.7, yaw + 0.3, c.x + frng.range(-0.2, 0.2), ROAD_Y + 0.002, c.z + frng.range(-0.2, 0.2)), '#202327', 0.5));
        emit('clutter-flat-r1', g, 1, 'patch', c.x, ROAD_Y, c.z, 0, false, fk, true);
      }
      if (frng.chance(0.55)) { // tar snake: a thin wavering crack across the lane
        const c = roadPt(frng.range(6, fr.L - 6), frng.range(1.2, maxD));
        const dir = frng.range(0, Math.PI), len = frng.range(2.5, 6), pts: Vec2[] = [];
        const ph = frng.range(0, 6), amp = frng.range(0.1, 0.25);
        for (let i = 0; i <= 9; i++) {
          const t = i / 9 - 0.5, off = Math.sin(t * 9 + ph) * amp;
          pts.push({ x: c.x + Math.cos(dir) * t * len - Math.sin(dir) * off, z: c.z + Math.sin(dir) * t * len + Math.cos(dir) * off });
        }
        emit('clutter-flat-r1', [ribbon(pts, frng.range(0.04, 0.08), ROAD_Y + 0.001, '#0b0c0e', 0.75)], 1, 'tarSnake', c.x, ROAD_Y, c.z, 0, false, fk, true);
      }
      if (frng.chance(0.5)) {
        const c = roadPt(frng.range(8, fr.L - 8), Math.min(maxD, rw / 4 + frng.range(-0.5, 0.5)));
        emit('clutter-flat-r2', [paint(flatBlob(0.34, 1, 1, 0, c.x, ROAD_Y + 0.001, c.z, 14), '#1e2023', 0.9), paint(new THREE.RingGeometry(0.34, 0.43, 14).rotateX(-Math.PI / 2).translate(c.x, ROAD_Y + 0.001, c.z), '#0e0f11', 0.7)], 2, 'manhole', c.x, ROAD_Y, c.z, 0, false, fk, true);
      }
      { // oil drips where cars park (kerb lane ~ 1.2-2.6 m out)
        const n = frng.int(1, 3);
        for (let i = 0; i < n; i++) {
          const c = roadPt(frng.range(5, fr.L - 5), frng.range(1.4, Math.min(2.4, maxD)));
          const g: Geos = [paint(flatBlob(frng.range(0.22, 0.45), 1, frng.range(0.6, 1), frng.range(0, 3), c.x, ROAD_Y + 0.001, c.z, 9), '#0d0b08', 0.42)];
          if (frng.chance(0.5)) g.push(paint(flatBlob(0.12, 1, 1, 0, c.x + frng.range(-0.3, 0.3), ROAD_Y + 0.002, c.z + frng.range(-0.3, 0.3), 6), '#0d0b08', 0.5));
          emit('clutter-flat-r2', g, 2, 'oil', c.x, ROAD_Y, c.z, 0, false, fk, true);
        }
      }
      if (frng.chance(0.3)) { // painted NO PARKING stencil beside the hydrant: outlined box, two text bars, a slash
        const c = roadPt(3.5, 0.7), W = 1.3, H = 0.5, t = 0.05, col = '#e6e6de', a = 0.72;
        const yaw = fr.yaw;
        const part = (w: number, d: number, dx: number, dz: number, rot = 0): THREE.BufferGeometry =>
          paint(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(rot).translate(dx, 0, dz).rotateY(yaw).translate(c.x, ROAD_Y + 0.002, c.z), col, a);
        const g: Geos = [part(W, t, 0, H / 2), part(W, t, 0, -H / 2), part(t, H, W / 2, 0), part(t, H, -W / 2, 0), part(W * 0.7, 0.06, 0, 0.12), part(W * 0.5, 0.06, 0, -0.1), part(W * 1.05, 0.05, 0, 0, 0.42)];
        emit('clutter-flat-r2', g, 2, 'noParking', c.x, ROAD_Y, c.z, 0, false, fk, true);
      }

      // ---- floor: every face of a real length carries at least MIN_LOW_PER_100M items at the low tier, so a run of apartments or
      // quiet lots does not leave a whole face bare (measured per face by scripts/crowd-audit.mjs --clutter). Own Rng stream, so the
      // rest of the layout is unchanged. Bag piles go at the kerb beside a door, like the stoop ones.
      if (fr.L >= 25) {
        const need = Math.floor((fr.L * MIN_LOW_PER_100M) / 100);
        let have = 0;
        for (let i = faceStart; i < stats.placements.length; i++) if (stats.placements[i].rank === 1) have++;
        if (have < need && faceLots.length) {
          const trng = rng.fork(`c-floor:${fk}`);
          for (let tries = 0; tries < 48 && have < need; tries++) {
            const lot = trng.pick(faceLots);
            if (lot.type === 'scaffold' || lot.type === 'vacant' || lot.type === 'church') continue;
            const [lo, hi] = lotSpan(lot), mid = (lo + hi) / 2;
            const side = trng.chance(0.5) ? 1 : -1;
            const s = mid + side * Math.min(DOOR_ZONE + 0.5, Math.max(DOOR_ZONE + 0.1, (hi - lo) / 2 - 0.7));
            const p = free(s, Math.max(0.6, stripW - 0.75), 1.3);
            if (!p || Math.abs(s - mid) < DOOR_ZONE || s < lo + 0.3 || s > hi - 0.3) continue;
            emit(`clutter-bag-r1-d${Math.floor(trng.range(0, 3))}`, bagPile(trng), 1, 'bags', p.x, SW_Y, p.z, trng.range(0, 6), false, fk);
            take(p);
            have++;
          }
        }
      }
    }
  }

  // ---- string lights across a street for the party, one hung span per ~5 streets, with a pair of sneakers on a few
  const faces: { f: BlockFace; fr: FaceFrame; lamp: Vec2; key: string }[] = [];
  for (const block of grid.blocks as Block[]) for (const f of block.faces) { const fr = faceFrame(f); faces.push({ f, fr, lamp: fr.at(fr.L / 2, 0.6), key: `${block.id}${f.side}` }); }
  let spans = 0;
  for (let i = 0; i < faces.length && spans < 6; i++) {
    const A = faces[i];
    if (Math.abs(hashStr(A.key) % 100) >= 24) continue;
    const rw = grid.streetById(A.f.streetId).roadWidth;
    const B = faces.find((q, j) => j > i && q.f.streetId === A.f.streetId && q.f.outward.x * A.f.outward.x + q.f.outward.z * A.f.outward.z < -0.9
      && Math.abs((q.lamp.x - A.lamp.x) * A.f.outward.x + (q.lamp.z - A.lamp.z) * A.f.outward.z) > rw * 0.8
      && Math.abs((q.lamp.x - A.lamp.x) * A.f.outward.x + (q.lamp.z - A.lamp.z) * A.f.outward.z) < rw + 12
      && Math.abs((q.lamp.x - A.lamp.x) * A.fr.u.x + (q.lamp.z - A.lamp.z) * A.fr.u.z) < 10);
    if (!B) continue;
    spans++;
    const srng = rng.fork(`lights:${A.key}`);
    const y = 6.3;
    const pa = new THREE.Vector3(A.lamp.x, y, A.lamp.z), pbv = new THREE.Vector3(B.lamp.x, y, B.lamp.z);
    const len = pa.distanceTo(pbv), sag = Math.min(1.4, len * 0.05);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; const p = pa.clone().lerp(pbv, t); p.y -= 4 * sag * t * (1 - t); pts.push(p); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 3, false);
    stats.tris[2] += triCount(tube);
    pb.put('wiresClutter', wireMat, tube);
    const bulbs: Geos = [];
    const curve = new THREE.CatmullRomCurve3(pts);
    const nb = Math.max(4, Math.floor(len / 1.3));
    for (let k = 1; k < nb; k++) {
      const p = curve.getPoint(k / nb);
      bulbs.push(paint(new THREE.IcosahedronGeometry(0.07, 0).translate(p.x, p.y - 0.08, p.z), srng.pick(['#ffd27a', '#ff6a5a', '#7ad0ff', '#fff3d0', '#9cff8a'])));
    }
    emit('clutter-lights-r2', bulbs, 2, 'stringLights', A.lamp.x, y, A.lamp.z, 0, false, A.key, true);
    if (srng.chance(0.5)) { // sneakers hung over the wire
      const p = curve.getPoint(srng.range(0.3, 0.7));
      const g = sneakers();
      for (const q of g) { xform(q, p.x, p.y, p.z, srng.range(0, 3)); stats.tris[1] += triCount(q); pb.put('clutter-sw-r1', solidMat('clutter-sw-r1'), q); }
    }
  }
  return stats;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
