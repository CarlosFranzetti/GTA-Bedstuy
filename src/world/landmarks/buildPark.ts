/**
 * LANDMARKS builders for open ground: park, playground, pool, community garden. Each is a generator that yields between
 * pieces so the layer can spend a few milliseconds per frame (see layer.ts). Local frame: kit.ts.
 */
import type { Rng } from '@/core/Rng';
import type { LandmarkRow } from './types';
import { Kit, type V3 } from './kit';
import { band, bench, fence, lampPost, signBoard, tree, windowBand, flatRoof, rectCornice } from './parts';

export interface BuildCtx {
  k: Kit;
  row: LandmarkRow;
  rng: Rng;
  /** 0 phone, 1 low, 2 medium and high */
  detail: number;
}

type Pt = [number, number];

const GRASS_Y = 0.02, PATH_Y = 0.06, PAD_Y = 0.09, PAINT_Y = 0.11;

/** the block ring in site-local coordinates */
export function localRing(row: LandmarkRow): Pt[] {
  const s = row.site;
  const poly = s.poly;
  if (!poly) return [[0, 0], [s.w, 0], [s.w, s.d], [0, s.d]];
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 2) {
    const X = poly[i] - s.ax, Z = poly[i + 1] - s.az;
    out.push([X * s.fx + Z * s.fz, X * s.nx + Z * s.nz]);
  }
  return out;
}

function pointInRing(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > p[1]) !== (ring[j][1] > p[1]) && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
  }
  return c;
}

/** a strip of constant width along a straight line (a path) */
function strip(k: Kit, mat: ReturnType<Kit['m']>, a: Pt, b: Pt, width: number, y: number, color?: number): void {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz) || 1;
  const px = (-dz / L) * width / 2, pz = (dx / L) * width / 2;
  k.quad(mat, [a[0] - px, y, a[1] - pz], [b[0] - px, y, b[1] - pz], [b[0] + px, y, b[1] + pz], [a[0] + px, y, a[1] + pz], { hint: [0, 1, 0], color, ru: L / 3, rv: width / 3 });
}

/** a flat rectangle of paint or surface */
function pad(k: Kit, mat: ReturnType<Kit['m']>, x0: number, z0: number, x1: number, z1: number, y: number, color?: number): void {
  k.floor(mat, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, { color });
}

function line(k: Kit, x0: number, z0: number, x1: number, z1: number, y = PAINT_Y, t = 0.1, color = 0xf2f0e8): void {
  strip(k, k.flatM, [x0, z0], [x1, z1], t, y, color);
}

/** an octagonal / n-gon disc */
function disc(k: Kit, mat: ReturnType<Kit['m']>, cx: number, cz: number, r: number, y: number, n = 16, color?: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  k.floor(mat, pts, y, { color });
}

// ----------------------------------------------------------------------------------------------- pieces

/** A basketball court with painted lines, two hoops and a chain-link fence with a gate. Returns the footprint. */
export function court(k: Kit, cx: number, cz: number, len: number, wid: number, alongX: boolean, surface = 0x3c7160, detail = 1): void {
  const a = alongX ? len : wid, b = alongX ? wid : len;
  const x0 = cx - a / 2, x1 = cx + a / 2, z0 = cz - b / 2, z1 = cz + b / 2;
  pad(k, k.flatM, x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5, PAD_Y, 0x6d6a66);
  pad(k, k.flatM, x0, z0, x1, z1, PAD_Y + 0.01, surface);
  // lines
  const L = (ax: number, az: number, bx: number, bz: number): void => line(k, ax, az, bx, bz);
  L(x0, z0, x1, z0); L(x1, z0, x1, z1); L(x1, z1, x0, z1); L(x0, z1, x0, z0);
  if (alongX) {
    L(cx, z0, cx, z1);
    for (const s of [-1, 1]) {
      const ex = s < 0 ? x0 : x1;
      L(ex, cz - 2.4, ex - s * -5.8 * -1, cz - 2.4); L(ex, cz + 2.4, ex - s * -5.8 * -1, cz + 2.4); L(ex - s * -5.8 * -1, cz - 2.4, ex - s * -5.8 * -1, cz + 2.4);
    }
  } else {
    L(x0, cz, x1, cz);
    for (const s of [-1, 1]) {
      const ez = s < 0 ? z0 : z1;
      L(cx - 2.4, ez, cx - 2.4, ez - s * -5.8 * -1); L(cx + 2.4, ez, cx + 2.4, ez - s * -5.8 * -1); L(cx - 2.4, ez - s * -5.8 * -1, cx + 2.4, ez - s * -5.8 * -1);
    }
  }
  // hoops: post, backboard, rim
  const iron = k.m('metalDark');
  for (const s of [-1, 1]) {
    const hx = alongX ? (s < 0 ? x0 - 0.4 : x1 + 0.4) : cx, hz = alongX ? cz : (s < 0 ? z0 - 0.4 : z1 + 0.4);
    k.cyl(iron, hx, hz, 0.07, 0, 3.4, 5);
    const bxw = alongX ? 0 : 0.9, bzw = alongX ? 0.9 : 0;
    const inward: V3 = alongX ? [-s, 0, 0] : [0, 0, -s];
    k.quad(k.flatM, [hx - bxw, 2.7, hz - bzw], [hx + bxw, 2.7, hz + bzw], [hx + bxw, 3.5, hz + bzw], [hx - bxw, 3.5, hz - bzw], { hint: inward, color: 0xe9e6dc });
    k.quad(k.flatM, [hx + bxw, 2.7, hz + bzw], [hx - bxw, 2.7, hz - bzw], [hx - bxw, 3.5, hz - bzw], [hx + bxw, 3.5, hz + bzw], { hint: [-inward[0], 0, -inward[2]], color: 0xe9e6dc });
    const rx = hx + (alongX ? -s * 0.5 : 0), rz = hz + (alongX ? 0 : -s * 0.5);
    disc(k, k.flatM, rx, rz, 0.23, 3.05, 8, 0xd8541e);
  }
  // fence with a gate on the long side
  const h = 3.2;
  const ch = k.m('chainlinkFence');
  const fx0 = x0 - 1.5, fx1 = x1 + 1.5, fz0 = z0 - 1.5, fz1 = z1 + 1.5;
  const sides: Array<[number, number, number, number, Array<[number, number]>?]> = [
    [fx0, fz0, fx1, fz0, alongX ? [[(fx1 - fx0) / 2 - 1.2, (fx1 - fx0) / 2 + 1.2]] : undefined], [fx1, fz0, fx1, fz1], [fx1, fz1, fx0, fz1], [fx0, fz1, fx0, fz0],
  ];
  if (detail > 0) for (const [ax, az, bx, bz, gaps] of sides) fence(k, ax, az, bx, bz, { h, mat: ch, gaps, postEvery: 6 });
  else for (const [ax, az, bx, bz] of sides) k.solidSeg(ax, az, bx, bz);
}

/** Playground: rubber surface, a swing frame, a slide tower, a climbing dome of bars. */
export function playground(k: Kit, x: number, z: number, w: number, d: number, rng: Rng): void {
  pad(k, k.flatM, x, z, x + w, z + d, PAD_Y, 0x3a5f86);
  pad(k, k.flatM, x + 1, z + 1, x + w - 1, z + d - 1, PAD_Y + 0.01, rng.chance(0.5) ? 0x9c4a3a : 0x3f7a58);
  const red = 0xc8452f, yel = 0xe0b43a, blu = 0x2f6aa8;
  // swing frame
  const sx = x + 3, sz = z + d - 3;
  const fy = 2.6;
  for (const e of [0, 5]) {
    k.bar(k.flatM, [sx + e, 0, sz - 1.2], [sx + e, fy, sz], 0.12, { color: blu });
    k.bar(k.flatM, [sx + e, 0, sz + 1.2], [sx + e, fy, sz], 0.12, { color: blu });
  }
  k.bar(k.flatM, [sx, fy, sz], [sx + 5, fy, sz], 0.14, { color: blu });
  for (const e of [1.3, 3.7]) { k.bar(k.m('metalDark'), [sx + e, fy, sz], [sx + e, 0.5, sz], 0.03); k.quad(k.flatM, [sx + e - 0.2, 0.5, sz - 0.15], [sx + e + 0.2, 0.5, sz - 0.15], [sx + e + 0.2, 0.5, sz + 0.15], [sx + e - 0.2, 0.5, sz + 0.15], { hint: [0, 1, 0], color: 0x1d1d1d }); }
  k.solidRect(sx - 0.3, sz - 1.4, sx + 5.3, sz + 1.4);
  // slide tower + slide
  const tx = x + w - 6, tz = z + 3;
  k.box(k.flatM, tx, 0, tz, tx + 2, 1.7, tz + 2, { color: yel });
  k.quad(k.flatM, [tx + 2, 1.7, tz + 0.4], [tx + 4.4, 0.35, tz + 0.4], [tx + 4.4, 0.35, tz + 1.6], [tx + 2, 1.7, tz + 1.6], { hint: [0, 1, 0], color: red });
  k.solidRect(tx, tz, tx + 4.4, tz + 2);
  // climbing dome: three hoops
  const cx = x + w / 2, cz = z + d / 2 - 1;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
    k.bar(k.flatM, [cx + Math.cos(a0) * 1.6, 0, cz + Math.sin(a0) * 1.6], [cx, 2, cz], 0.07, { color: red });
    k.bar(k.flatM, [cx + Math.cos(a0) * 1.0, 1.1, cz + Math.sin(a0) * 1.0], [cx + Math.cos(a1) * 1.0, 1.1, cz + Math.sin(a1) * 1.0], 0.07, { color: yel });
  }
  k.solidCircle(cx, cz, 1.5);
}

/** a fountain plaza: paved disc, a basin with water and a jet */
function fountainPlaza(k: Kit, cx: number, cz: number, r: number): void {
  disc(k, k.m('bluestone'), cx, cz, r, PAD_Y, 20);
  disc(k, k.m('granite'), cx, cz, r * 0.38, PAD_Y + 0.02, 16);
  k.cyl(k.m('granite'), cx, cz, r * 0.32, 0, 0.55, 16, { top: null, noTop: true });
  disc(k, k.flatM, cx, cz, r * 0.3, 0.45, 16, 0x4a8fb5);
  k.cyl(k.m('granite'), cx, cz, 0.35, 0, 1.6, 8);
  k.cone(k.m('granite'), cx, cz, 0.55, 1.6, 2.1, 8);
  k.solidCircle(cx, cz, r * 0.34);
  // ring of benches facing the water
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    bench(k, cx + Math.cos(a) * (r - 1.2), cz + Math.sin(a) * (r - 1.2), [-Math.cos(a), -Math.sin(a)], 1.8);
  }
}

/** a bandshell: half-round stage with a shell wall and a roof, open toward `facing` (a local unit vector) */
function bandshell(k: Kit, cx: number, cz: number, r: number, facing: Pt): void {
  const conc = k.m('concrete');
  const fa = Math.atan2(facing[1], facing[0]);
  const n = 8;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = fa + Math.PI * (0.5 + i / n); pts.push([cx - Math.cos(fa) * 0 + Math.cos(a) * r * 0.5 - facing[0] * r * 0.2, cz + Math.sin(a) * r * 0.5 - facing[1] * r * 0.2]); }
  // stage platform
  const stage: Pt[] = pts.slice();
  k.floor(k.m('bluestone'), stage, 0.9, {});
  const sh = 5.2;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1];
    // inner wall faces the audience (towards the stage centre)
    k.wall(conc, a[0], a[1], b[0], b[1], 0.9, sh, [cx - (a[0] + b[0]) / 2, cz - (a[1] + b[1]) / 2], { color: undefined });
    // stage side
    k.wall(k.m('granite'), a[0], a[1], b[0], b[1], 0, 0.9, [(a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz]);
  }
  // roof lip over the arc and the opening
  const front: Pt[] = [pts[0], pts[n]];
  k.floor(conc, [...pts, ...[front[1], front[0]].slice(0, 0)], sh);
  k.wall(conc, pts[n][0], pts[n][1], pts[0][0], pts[0][1], 0.9, sh, [facing[0], facing[1]]);
  k.solidPoly(pts as Pt[]);
}

function pathNetwork(c: BuildCtx, ring: Pt[], inner: { x0: number; z0: number; x1: number; z1: number }, plazaR: number): { gates: Pt[]; segs: Array<[Pt, Pt]> } {
  const { k, row } = c;
  const look = row.look;
  const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
  const conc = k.m('concrete');
  const segs: Array<[Pt, Pt]> = [];
  const W = row.site.w, D = row.site.d;
  const gates: Pt[] = [[W / 2, 0.2], [W / 2, D - 0.2], [0.2, D / 2], [W - 0.2, D / 2]];
  const inRing = (p: Pt): Pt => (pointInRing(p, ring) ? p : [p[0] * 0.9 + cx * 0.1, p[1] * 0.9 + cz * 0.1]);
  const add = (a: Pt, b: Pt, w = 3.2): void => { strip(k, conc, a, b, w, PATH_Y); segs.push([a, b]); };
  // the cross between the gates, always
  add(inRing([W / 2, 0.5]), inRing([W / 2, D - 0.5]));
  add(inRing([0.5, D / 2]), inRing([W - 0.5, D / 2]));
  if (look.paths === 'diagonal') {
    add(inRing([inner.x0, inner.z0]), inRing([inner.x1, inner.z1]), 2.8);
    add(inRing([inner.x1, inner.z0]), inRing([inner.x0, inner.z1]), 2.8);
  } else {
    // a loop path around the middle
    const m = 14;
    const lo: Pt[] = [[inner.x0 + m, inner.z0 + m], [inner.x1 - m, inner.z0 + m], [inner.x1 - m, inner.z1 - m], [inner.x0 + m, inner.z1 - m]];
    for (let i = 0; i < 4; i++) add(lo[i], lo[(i + 1) % 4], 2.8);
  }
  void plazaR;
  return { gates, segs };
}

// ----------------------------------------------------------------------------------------------- park

export function* buildPark(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const s = row.site;
  const look = row.look;
  const ring = localRing(row);
  const W = s.w, D = s.d;
  k.floor(k.grassM, ring, GRASS_Y, { uvScale: 1 / 4 });
  yield;
  // usable rectangle inside the ring: the bounding box pulled in until every corner is inside
  let inset = 8;
  const inner = { x0: 0, z0: 0, x1: W, z1: D };
  for (let t = 0; t < 8; t++) {
    inner.x0 = inset; inner.z0 = inset; inner.x1 = W - inset; inner.z1 = D - inset;
    const ok = ([[inner.x0, inner.z0], [inner.x1, inner.z0], [inner.x1, inner.z1], [inner.x0, inner.z1]] as Pt[]).every((p) => pointInRing(p, ring));
    if (ok) break;
    inset += 4;
  }
  const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
  const plazaR = Math.min(13, (inner.x1 - inner.x0) * 0.12);
  const { gates, segs } = pathNetwork(c, ring, inner, plazaR);
  yield;

  const solids: Array<{ x: number; z: number; r: number }> = [{ x: cx, z: cz, r: plazaR + 2 }];
  for (const [a, b] of segs) solids.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: 0 }); // paths are handled by the distance test below
  const distToPaths = (p: Pt): number => {
    let m = 1e9;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
      m = Math.min(m, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)));
    }
    return m;
  };
  const taken: Array<{ x: number; z: number; r: number }> = [{ x: cx, z: cz, r: plazaR + 3 }];
  const free = (p: Pt, r: number): boolean => pointInRing(p, ring) && taken.every((t) => Math.hypot(t.x - p[0], t.z - p[1]) > t.r + r) && distToPaths(p) > 2.4 + r;

  // plaza
  if (look.plaza === 'bandshell') {
    disc(k, k.m('bluestone'), cx, cz, plazaR, PAD_Y, 20);
    bandshell(k, cx, cz - plazaR * 0.1, plazaR * 0.85, [0, 1]);
    for (let i = 0; i < 4; i++) bench(k, cx - 6 + i * 4, cz + plazaR * 0.7, [0, -1], 1.8);
  } else {
    fountainPlaza(k, cx, cz, plazaR);
  }
  yield;

  // courts
  const nCourts = Number(look.courts ?? 0);
  const spots: Pt[] = [[inner.x0 + 26, inner.z1 - 22], [inner.x1 - 26, inner.z0 + 22], [inner.x0 + 26, inner.z0 + 22]];
  for (let i = 0; i < nCourts; i++) {
    const p = spots[i];
    if (!p) break;
    if (!pointInRing(p, ring)) continue;
    court(k, p[0], p[1], 28, 15, true, i ? 0x9a4a3a : 0x3c7160, detail);
    taken.push({ x: p[0], z: p[1], r: 20 });
  }
  yield;

  // playground
  if (look.playground) {
    const p: Pt = [inner.x1 - 40, inner.z1 - 28];
    if (pointInRing(p, ring)) {
      playground(k, p[0], p[1], 22, 16, rng);
      taken.push({ x: p[0] + 11, z: p[1] + 8, r: 15 });
    }
  }
  // recreation centre: low brick building toward one side
  if (look.recCentre) {
    const bw = 34, bd = 13;
    const bx = inner.x0 + 8, bz = inner.z0 + 4;
    if (pointInRing([bx, bz], ring) && pointInRing([bx + bw, bz + bd], ring)) {
      recBuilding(k, bx, bz, bw, bd, row.name.toUpperCase(), detail);
      taken.push({ x: bx + bw / 2, z: bz + bd / 2, r: 24 });
    }
  }
  // ball field: a diamond of dirt and a backstop
  if (look.ballfield) {
    const p: Pt = [inner.x0 + 36, inner.z1 - 34];
    if (pointInRing(p, ring)) {
      pad(k, k.flatM, p[0] - 16, p[1] - 16, p[0] + 16, p[1] + 16, PAD_Y, 0xb9a374);
      k.floor(k.grassM, [[p[0] - 16, p[1] - 16], [p[0] + 16, p[1] - 16], [p[0] + 16, p[1] + 16], [p[0] - 16, p[1] + 16]], PAD_Y + 0.01);
      const dirt: Pt[] = [[p[0], p[1] + 12], [p[0] + 12, p[1]], [p[0], p[1] - 12], [p[0] - 12, p[1]]];
      k.floor(k.flatM, dirt, PAD_Y + 0.02, { color: 0xb08a58 });
      fence(k, p[0] - 14, p[1] + 17, p[0] + 14, p[1] + 17, { h: 4.5, mat: k.m('chainlinkFence'), postEvery: 7, collide: true });
      taken.push({ x: p[0], z: p[1], r: 24 });
    }
  }
  yield;

  // gates, perimeter fence with signs
  const gateW = 3.6;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    const gaps: Array<[number, number]> = [];
    for (const g of gates) {
      const t = (g[0] - a[0]) * ux + (g[1] - a[1]) * uz;
      const off = Math.abs((g[0] - a[0]) * -uz + (g[1] - a[1]) * ux);
      if (off < 2.5 && t > -2 && t < L + 2) gaps.push([t - gateW / 2, t + gateW / 2]);
    }
    // push the fence a little inside the ring so it stands on the park side of the kerb
    const inx = -uz * 0, inz = ux * 0;
    fence(k, a[0] + inx, a[1] + inz, b[0] + inx, b[1] + inz, { h: 1.1, gaps, postEvery: detail > 1 ? 4 : 8 });
  }
  for (const g of gates) {
    const inward: [number, number] = [g[0] < 1 ? 1 : g[0] > W - 1 ? -1 : 0, g[1] < 1 ? 1 : g[1] > D - 1 ? -1 : 0];
    const sx = g[0] + inward[0] * 0 - inward[1] * 4.2, sz = g[1] + inward[1] * 0 + inward[0] * 4.2;
    // a stone pier on each side of the gate with a name board on the near one
    for (const sd of [-1, 1]) {
      const px = g[0] + (inward[1] !== 0 ? sd * (gateW / 2 + 0.4) : 0), pz = g[1] + (inward[0] !== 0 ? sd * (gateW / 2 + 0.4) : 0);
      k.box(k.m('limestone'), px - 0.4, 0, pz - 0.4, px + 0.4, 2.1, pz + 0.4);
      k.solidCircle(px, pz, 0.5);
    }
    void sx; void sz;
    signBoard(k, row.name.toUpperCase(), g[0] + inward[0] * 0.8 + (inward[1] !== 0 ? 0 : 0), 2.3, g[1] + inward[1] * 0.8, [inward[0], inward[1]], 3.4, '#1f4a36', '#f1ecd8', 0);
  }
  yield;

  // lamps and benches along the paths
  for (const [a, b] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    for (let t = 14; t < L - 6; t += 34) {
      const px = a[0] + ux * t, pz = a[1] + uz * t;
      if (Math.hypot(px - cx, pz - cz) < plazaR + 3) continue;
      if (detail > 0) lampPost(k, px - uz * 2.2, pz + ux * 2.2);
      bench(k, px + uz * 2.4, pz - ux * 2.4, [-uz, ux]);
      k.solidCircle(px + uz * 2.4, pz - ux * 2.4, 0.6);
    }
  }
  yield;

  // trees: along the perimeter first, then scattered
  const want = Math.round(Number(look.trees ?? 60) * (detail === 0 ? 0.5 : 1));
  let placed = 0, tries = 0;
  while (placed < want && tries < want * 25) {
    tries++;
    const edge = rng.chance(0.4);
    let p: Pt;
    if (edge) {
      const i = rng.int(0, ring.length - 1);
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const t = rng.next();
      const ux = b[0] - a[0], uz = b[1] - a[1], L = Math.hypot(ux, uz) || 1;
      p = [a[0] + ux * t + (-uz / L) * 0 + (uz / L) * 3.2, a[1] + uz * t + (ux / L) * 3.2 * 0 - (ux / L) * 3.2];
      // pointInRing decides which of the two sides is the park
      const q: Pt = [a[0] + ux * t - (uz / L) * 3.2, a[1] + uz * t + (ux / L) * 3.2];
      if (!pointInRing(p, ring)) p = q;
    } else p = [rng.range(inner.x0, inner.x1), rng.range(inner.z0, inner.z1)];
    if (!free(p, 1.2)) continue;
    // keep the gates open
    if (gates.some((g) => Math.hypot(g[0] - p[0], g[1] - p[1]) < 7)) continue;
    tree(k, p[0], p[1], rng, 0.9 + rng.next() * 0.45);
    taken.push({ x: p[0], z: p[1], r: 2.2 });
    placed++;
    if (placed % 12 === 0) yield;
  }
  void solids;
}

/** a low brick recreation building with a flat roof, a window band and a name board */
export function recBuilding(k: Kit, x: number, z: number, w: number, d: number, name: string, detail = 1): void {
  const brick = k.m('brickRed', 1), roof = k.m('tarRoof', 1), stone = k.m('limestone');
  const h = 6.4;
  k.box(brick, x, 0, z, x + w, h, z + d, { top: roof });
  flatRoof(k, roof, brick, x, z, x + w, z + d, h, 0.5);
  rectCornice(k, stone, x, z, x + w, z + d, h - 0.3, 0.3, 0.25);
  band(k, stone, x, z, x + w, z, 0.9, 0.2, 0.08, [0, -1]);
  for (const side of [0, 1]) {
    windowBand(k, {
      x0: x + 1.5, z0: side ? z + d : z, dx: 1, dz: 0, len: w - 3, out: side ? [0, 1] : [0, -1], y0: 2.2, floors: 1, floorH: 3, w: 1.8, h: 2.6, pitch: 3.2,
      trim: stone, detail,
    });
  }
  // doors
  k.quad(k.m('metalDark'), [x + w / 2 - 1.2, 0, z - 0.06], [x + w / 2 + 1.2, 0, z - 0.06], [x + w / 2 + 1.2, 2.5, z - 0.06], [x + w / 2 - 1.2, 2.5, z - 0.06], { hint: [0, 0, -1] });
  signBoard(k, name, x + w / 2, h - 2.8, z - 0.1, [0, -1], 6.4, '#1f3b5c', '#f1ecd8', 0.12);
  k.solidRect(x, z, x + w, z + d);
}

// ----------------------------------------------------------------------------------------------- playground (courts site)

export function* buildPlayground(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  k.floor(k.flatM, [[0, 0], [W, 0], [W, D], [0, D]], GRASS_Y, { color: 0x77706a });
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], PATH_Y - 0.01);
  yield;
  const nC = Number(row.look.courts ?? 2);
  // basketball courts side by side along the front, handball wall behind
  const cw = 15, cl = 28;
  const gap = (W - nC * cw) / (nC + 1);
  for (let i = 0; i < Math.min(nC, 2); i++) {
    const cx = gap + cw / 2 + i * (cw + gap) + 4;
    court(k, cx, 22, cl, cw, false, i ? 0x9a4a3a : 0x3c7160, detail);
  }
  yield;
  // handball: three one-wall courts
  if (row.look.handball) {
    const wx = W - 52, wz = D - 6;
    const brick = k.m('brickPainted');
    k.box(brick, wx, 0, wz, wx + 30, 4.2, wz + 0.8, { color: undefined });
    for (let i = 0; i < 3; i++) {
      pad(k, k.flatM, wx + i * 10 + 0.5, wz - 12, wx + i * 10 + 9.5, wz, PAD_Y, 0x5d6f7c);
      line(k, wx + i * 10 + 0.5, wz - 7, wx + i * 10 + 9.5, wz - 7);
      line(k, wx + i * 10 + 0.5, wz - 12, wx + i * 10 + 9.5, wz - 12);
      line(k, wx + i * 10 + 0.5, wz - 12, wx + i * 10 + 0.5, wz);
      line(k, wx + i * 10 + 9.5, wz - 12, wx + i * 10 + 9.5, wz);
    }
    k.solidRect(wx, wz, wx + 30, wz + 0.8);
  }
  if (row.look.playground) playground(k, W - 28, 6, 22, 16, rng);
  yield;
  // fence on three sides, gate in the street side
  const h = 2.4;
  fence(k, 0, 0, W, 0, { h, mat: k.m('chainlinkFence'), postEvery: 6, gaps: [[W / 2 - 2, W / 2 + 2]] });
  fence(k, W, 0, W, D, { h, mat: k.m('chainlinkFence'), postEvery: 6 });
  fence(k, W, D, 0, D, { h, mat: k.m('chainlinkFence'), postEvery: 6 });
  fence(k, 0, D, 0, 0, { h, mat: k.m('chainlinkFence'), postEvery: 6 });
  signBoard(k, row.name.toUpperCase(), W / 2, 2.6, 0.2, [0, -1], 4.2, '#1f4a36', '#f1ecd8', 0);
  for (let i = 0; i < 14; i++) {
    const x = 4 + rng.next() * (W - 8), z = 4 + rng.next() * (D - 8);
    if (z > 5 && z < 40 && x > 3 && x < W - 30) continue;
    tree(k, x, z, rng, 0.8 + rng.next() * 0.3);
  }
}

// ----------------------------------------------------------------------------------------------- pool

export function* buildPool(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const conc = k.m('concrete');
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], GRASS_Y, { uvScale: 1 / 4 });
  k.floor(conc, [[2, 2], [W - 2, 2], [W - 2, D - 2], [2, D - 2]], PATH_Y);
  yield;
  // bathhouse: brick, flat roof, central portal, along the street edge
  const brick = k.m('brickRed', 0), stone = k.m('limestone'), roof = k.m('tarRoof', 1);
  const bw = W - 12, bd = 11, bx = 6, bz = 3, h = 7.4;
  k.box(brick, bx, 0, bz, bx + bw, h, bz + bd, { top: roof });
  flatRoof(k, roof, brick, bx, bz, bx + bw, bz + bd, h, 0.6);
  rectCornice(k, stone, bx, bz, bx + bw, bz + bd, h - 0.35, 0.35, 0.3);
  k.box(stone, W / 2 - 4.5, 0, bz - 0.5, W / 2 + 4.5, h + 1.6, bz + 1.2); // entrance pavilion
  k.quad(k.m('metalDark'), [W / 2 - 1.3, 0, bz - 0.55], [W / 2 + 1.3, 0, bz - 0.55], [W / 2 + 1.3, 3.2, bz - 0.55], [W / 2 - 1.3, 3.2, bz - 0.55], { hint: [0, 0, -1] });
  signBoard(k, row.name.toUpperCase(), W / 2, h - 1.2, bz - 0.6, [0, -1], 7.5, '#173a52', '#f1ecd8', 0.02);
  for (const [x0, len] of [[bx + 2, W / 2 - 4.5 - bx - 3], [W / 2 + 6.5, W / 2 - 4.5 - bx - 3]] as Array<[number, number]>) {
    windowBand(k, { x0, z0: bz, dx: 1, dz: 0, len, out: [0, -1], y0: 2.4, floors: 1, floorH: 3, w: 1.4, h: 2.8, pitch: 3.2, trim: stone, detail });
  }
  k.solidRect(bx, bz, bx + bw, bz + bd);
  yield;
  // the basin: raised coping, water, lane lines
  const px0 = W / 2 - 28, px1 = W / 2 + 28, pz0 = bz + bd + 5, pz1 = D - 4;
  k.box(stone, px0 - 0.5, 0, pz0 - 0.5, px1 + 0.5, 0.28, pz0, { top: stone });
  k.box(stone, px0 - 0.5, 0, pz1, px1 + 0.5, 0.28, pz1 + 0.5, { top: stone });
  k.box(stone, px0 - 0.5, 0, pz0, px0, 0.28, pz1, { top: stone });
  k.box(stone, px1, 0, pz0, px1 + 0.5, 0.28, pz1, { top: stone });
  k.floor(k.m('bluestone'), [[px0, pz0], [px1, pz0], [px1, pz1], [px0, pz1]], 0.05);
  k.floor(k.flatM, [[px0, pz0], [px1, pz0], [px1, pz1], [px0, pz1]], 0.22, { color: 0x3f9bc2 });
  const lanes = 8;
  for (let i = 1; i < lanes; i++) {
    const z = pz0 + ((pz1 - pz0) * i) / lanes;
    line(k, px0 + 1.5, z, px1 - 1.5, z, 0.24, 0.12, i % 2 ? 0xf0f4f8 : 0xd8541e);
  }
  for (const x of [px0 + 2, px1 - 2]) line(k, x, pz0 + 1, x, pz1 - 1, 0.24, 0.3, 0x1c4a6e);
  // ladders
  for (let i = 0; i < 4; i++) { const x = px0 + 8 + i * 13; k.bar(k.m('metalDark'), [x, 0.8, pz0 - 0.3], [x, 0.3, pz0 + 0.4], 0.05); }
  k.solidRect(px0 - 0.5, pz0 - 0.5, px1 + 0.5, pz1 + 0.5);
  yield;
  // deck chairs, fence, trees
  for (let i = 0; i < 8; i++) bench(k, 6 + i * 4, D - 5, [0, -1], 1.6);
  fence(k, 0, 0, W, 0, { h: 2.2, mat: k.m('chainlinkFence'), gaps: [[W / 2 - 4.5, W / 2 + 4.5]], postEvery: 6 });
  fence(k, W, 0, W, D, { h: 2.2, mat: k.m('chainlinkFence'), postEvery: 6 });
  fence(k, W, D, 0, D, { h: 2.2, mat: k.m('chainlinkFence'), postEvery: 6 });
  fence(k, 0, D, 0, 0, { h: 2.2, mat: k.m('chainlinkFence'), postEvery: 6 });
  for (let i = 0; i < 12; i++) {
    const x = 3 + rng.next() * (W - 6), z = bz + bd + 2 + rng.next() * (D - bz - bd - 4);
    if (x > px0 - 3 && x < px1 + 3 && z < pz1 + 3) continue;
    tree(k, x, z, rng, 0.8 + rng.next() * 0.3);
  }
}

// ----------------------------------------------------------------------------------------------- community garden

export function* buildGarden(c: BuildCtx): Generator<void> {
  const { k, row, rng } = c;
  const W = row.site.w, D = row.site.d;
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], GRASS_Y, { uvScale: 1 / 3 });
  const wood = k.m('stoop');
  const green = [0x4d8a3a, 0x6fa043, 0x3d7a4f, 0xb4452d, 0xd9a83a];
  // raised beds in two rows
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * (W - 8) / 6, z = 3.4 + r * 4.2;
      k.box(wood, x, 0, z, x + 4.2, 0.5, z + 1.4, { top: null, noTop: true });
      k.floor(k.flatM, [[x + 0.1, z + 0.1], [x + 4.1, z + 0.1], [x + 4.1, z + 1.3], [x + 0.1, z + 1.3]], 0.42, { color: 0x4a3326 });
      for (let p = 0; p < 4; p++) k.cone(k.flatM, x + 0.7 + p * 1.0, z + 0.7, 0.35, 0.42, 0.95 + rng.next() * 0.3, 5, { color: green[rng.int(0, 4)] });
    }
  }
  // a shed
  const sx = W - 6, sz = D - 5;
  k.box(k.m('corrugatedSteel'), sx, 0, sz, sx + 3.6, 2.4, sz + 3, { top: k.m('tarRoof', 2) });
  k.gable(k.m('corrugatedSteel'), k.m('corrugatedSteel'), sx, sz, sx + 3.6, sz + 3, 2.4, 3.0, 'x', 0.2);
  k.solidRect(sx, sz, sx + 3.6, sz + 3);
  // the mural wall at the back
  const mw = k.m('brickPainted');
  k.box(mw, 0, 0, D - 0.4, W, 3.8, D, { noTop: false });
  const cols = [0xd9a83a, 0xc8452f, 0x2f6aa8, 0x3f7a58, 0xe9e6dc];
  for (let i = 0; i < 8; i++) {
    const x0 = 2 + i * ((W - 4) / 8);
    k.quad(k.flatM, [x0 + 4.4, 0.8, D - 0.45], [x0, 0.8, D - 0.45], [x0, 0.8 + 1.4 + (i % 3) * 0.5, D - 0.45], [x0 + 4.4, 0.8 + 1.4 + (i % 3) * 0.5, D - 0.45], { hint: [0, 0, -1], color: cols[i % 5] });
  }
  k.solidRect(0, D - 0.4, W, D);
  fence(k, 0, 0, W, 0, { h: 2, mat: k.m('chainlinkFence'), gaps: [[W / 2 - 1.5, W / 2 + 1.5]], postEvery: 5 });
  fence(k, W, 0, W, D, { h: 2, mat: k.m('chainlinkFence'), postEvery: 5 });
  fence(k, 0, D, 0, 0, { h: 2, mat: k.m('chainlinkFence'), postEvery: 5 });
  signBoard(k, row.name.toUpperCase(), W / 2, 2.2, 0.2, [0, -1], 3.4, '#355e3b', '#f4efd8', 0);
  for (let i = 0; i < 3; i++) tree(k, 5 + rng.next() * (W - 10), D - 3.5, rng, 0.7);
  yield;
}
