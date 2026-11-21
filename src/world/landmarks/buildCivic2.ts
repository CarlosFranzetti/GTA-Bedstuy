/**
 * LANDMARKS2 builders for buildings read off open-licence photographs (Wikimedia Commons, US National Archives): a twin-tower
 * church (baroque terracotta or gothic brownstone), a movie palace with a round corner tower, a round-arch brewery, a low market
 * hall, a brick hospital. Same kit and rules as buildCivic.ts: merged geometry through the shared material library, the wall
 * colour from the row's `look.wall` / `look.trim` (tone.ts), signs in Anton and Barlow Condensed, nothing built beyond range.
 * Local frame: x along the frontage, z into the site, y up; the street front faces [0, -1].
 */
import type { BuildCtx } from './buildPark';
import { localRing } from './buildPark';
import type { Kit, V3 } from './kit';
import { archPane, archSurround, band, bench, disc, fence, flatRoof, lampPost, lancetPane, lancetSurround, rectCornice, signBoard, steps, tree } from './parts';

type Mat = ReturnType<Kit['m']>;
type Out = [number, number];

/** arch-headed (or lancet) windows along a wall: `alongX` walls run along local x at depth `at`, others along z at x = `at` */
export interface ArchRun {
  alongX: boolean; at: number; from: number; to: number; out: Out;
  y0: number; floors: number; floorH: number; pitch: number; w: number; h: number;
  hood?: Mat | null; pane?: (i: number, f: number) => Mat; skip?: (i: number, f: number) => boolean; lancet?: boolean; detail: number;
  /** a closed (bricked-up) opening is drawn in this material instead of glass */
  closed?: (i: number, f: number) => boolean; closedMat?: Mat;
}
export function archRun(k: Kit, o: ArchRun): number {
  if (k.far) return 0;
  const len = o.to - o.from;
  const n = Math.max(0, Math.floor((len - o.pitch + o.w) / o.pitch));
  if (!n) return 0;
  const start = o.from + (len - ((n - 1) * o.pitch + o.w)) / 2 + o.w / 2;
  let count = 0;
  for (let f = 0; f < o.floors; f++) for (let i = 0; i < n; i++) {
    if (o.skip?.(i, f)) continue;
    const cx = start + i * o.pitch, y = o.y0 + f * o.floorH;
    const closed = o.closed?.(i, f) ?? false;
    const mat = closed && o.closedMat ? o.closedMat : (o.pane ? o.pane(i, f) : k.m('window', (i * 7 + f * 3) & 1));
    if (o.lancet) lancetPane(k, mat, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.05); else archPane(k, mat, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.05);
    if (o.hood && o.detail > 0) {
      if (o.lancet) lancetSurround(k, o.hood, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.22, 0.08);
      else archSurround(k, o.hood, cx, o.at, y, o.w, o.h, o.out, o.alongX, 0.22, 0.08);
    }
    count++;
  }
  return count;
}

/** a thin cross made of two bars (flat colour) */
function cross(k: Kit, x: number, y: number, z: number, h: number, color: number): void {
  k.bar(k.flatM, [x, y, z], [x, y + h, z], 0.16, { color });
  k.bar(k.flatM, [x - h * 0.28, y + h * 0.68, z], [x + h * 0.28, y + h * 0.68, z], 0.16, { color });
}

// ----------------------------------------------------------------------------------------------- twin-tower church

/**
 * A church with a pedimented front between two bell towers. `look.style` 'baroque': terracotta white trim over buff brick, towers
 * in three stages with balconies and domed caps (the Bushwick parish of 1910). 'gothic': brownstone, pointed openings, two tall
 * towers with spires, a gabled nave (the Williamsburg parish of 1885).
 */
export function* buildTwinChurch(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const gothic = look.style === 'gothic';
  const wallM = gothic ? k.m('brownstone') : k.m('brickRed', 1);
  const trim = gothic ? k.m('brownstone') : k.m('limestone');
  const slate = k.m('tarRoof', 0), roofM = k.m('tarRoof', 2), dark = k.m('metalDark'), glass = k.m('window', 1);
  const F = Math.min(W - 1, Number(look.facade ?? 26));
  const x0 = (W - F) / 2, x1 = x0 + F, cx = W / 2;
  const zf = Math.min(3.4, D * 0.13);
  const Tw = Number(look.towerW ?? 6.4);
  const H = Number(look.bodyH ?? 17);
  const zEnd = D - 1;
  const GREEN = 0x6f917f, COPPER = 0x5e7e6c;
  k.floor(k.grassM, [[0, 0], [W, 0], [W, D], [0, D]], 0.02, { uvScale: 1 / 4 });
  yield;

  // body: the nave and aisles in brick, a flat roof over everything and a gable over the nave
  k.box(wallM, x0, 0, zf, x1, H, zEnd, { top: roofM });
  const nx0 = x0 + Tw, nx1 = x1 - Tw;
  k.gable(slate, wallM, nx0, zf, nx1, zEnd, H, H + (gothic ? 8 : 4.8), 'z', 0.3);
  k.solidRect(x0, zf, x1, zEnd);
  // side windows
  for (const [at, out] of [[x0, [-1, 0]], [x1, [1, 0]]] as Array<[number, Out]>) {
    archRun(k, { alongX: false, at, from: zf + Tw + 1, to: zEnd - 1, out, y0: 4.2, floors: 1, floorH: 5, pitch: 3.8, w: 1.5, h: 5.4, hood: trim, lancet: gothic, detail });
  }
  yield;

  // front: the portal
  const pw = gothic ? 14 : 14;
  const pz = zf - (gothic ? 0.1 : 0.5);
  if (!gothic) k.box(trim, cx - pw / 2, 0, pz, cx + pw / 2, H + 2.4, zf, { noTop: false });
  // doors
  const doorH = gothic ? 6.6 : 5.4;
  const pane = (n: number): Mat => k.m('window', n);
  void pane;
  if (gothic) {
    for (const [dx, w, h] of [[0, 3.2, 7.4], [-4.6, 2.4, 5.8], [4.6, 2.4, 5.8]] as Array<[number, number, number]>) {
      lancetPane(k, dark, cx + dx, pz, 0.9, w, h, [0, -1], true, 0.05);
      lancetSurround(k, trim, cx + dx, pz, 0.9, w, h, [0, -1], true, 0.5, 0.08);
    }
    // big pointed window over the portal and a rose in the gable
    lancetPane(k, glass, cx, pz, 9.4, 4.4, 11, [0, -1], true, 0.05);
    lancetSurround(k, trim, cx, pz, 9.4, 4.4, 11, [0, -1], true, 0.6, 0.08);
    disc(k, glass, cx, H + 4.2, pz, 1.9, [0, -1], 12, 0.06);
    disc(k, trim, cx, H + 4.2, pz, 2.5, [0, -1], 12, 0.03);
    // the front gable
    k.tri(wallM, [x0 + Tw, H, pz], [x1 - Tw, H, pz], [cx, H + 8, pz], { hint: [0, 0, -1] });
  } else {
    archPane(k, dark, cx, pz, 0.9, 3.0, doorH, [0, -1], true, 0.05);
    archSurround(k, trim, cx, pz, 0.9, 3.0, doorH, [0, -1], true, 0.45, 0.08);
    for (const dx of [-4.9, 4.9]) { archPane(k, dark, cx + dx, pz, 0.9, 2.1, 4.2, [0, -1], true, 0.05); archSurround(k, trim, cx + dx, pz, 0.9, 2.1, 4.2, [0, -1], true, 0.35, 0.08); }
    // four tall columns across the doors
    for (const dx of [-6, -3.1, 3.1, 6]) { k.cyl(trim, cx + dx, pz - 0.35, 0.42, 0.9, 8.6, 8); }
    band(k, trim, cx - pw / 2 - 0.3, pz, cx + pw / 2 + 0.3, pz, 8.6, 1.0, 0.85, [0, -1]);
    // upper storey: an octagonal window between niches, a second entablature, a scrolled attic with an arched window
    disc(k, trim, cx, 12.1, pz, 2.3, [0, -1], 8, 0.04);
    disc(k, glass, cx, 12.1, pz, 1.65, [0, -1], 8, 0.08);
    for (const dx of [-4.6, 4.6]) { archPane(k, k.m('window', 0), cx + dx, pz, 10.4, 1.3, 3.2, [0, -1], true, 0.05); archSurround(k, trim, cx + dx, pz, 10.4, 1.3, 3.2, [0, -1], true, 0.2, 0.08); }
    band(k, trim, cx - pw / 2 - 0.3, pz, cx + pw / 2 + 0.3, pz, 14.6, 0.9, 0.6, [0, -1]);
    archPane(k, k.m('window', 0), cx, pz, 15.8, 2.2, 3.6, [0, -1], true, 0.05);
    archSurround(k, trim, cx, pz, 15.8, 2.2, 3.6, [0, -1], true, 0.4, 0.08);
    disc(k, trim, cx, H + 2.4, pz, 4.6, [0, -1], 14, 0.03);
    cross(k, cx, H + 6.6, pz - 0.1, 2.6, COPPER);
    // white quoin courses stepping down the buff wings
    if (detail > 0) for (const [a, b] of [[x0 + Tw, cx - pw / 2], [cx + pw / 2, x1 - Tw]] as Array<[number, number]>) for (let y = 2.4; y < H - 1; y += 3.2) band(k, trim, a, zf, b, zf, y, 0.5, 0.18, [0, -1]);
  }
  // wings: tall narrow windows
  if (detail > 0) for (const [a, b] of [[x0 + Tw, cx - pw / 2], [cx + pw / 2, x1 - Tw]] as Array<[number, number]>) {
    if (b - a > 1.8) archRun(k, { alongX: true, at: zf, from: a, to: b, out: [0, -1], y0: 5.2, floors: 1, floorH: 5, pitch: 2.6, w: 1.1, h: 3.4, hood: trim, lancet: gothic, detail });
  }
  steps(k, k.m('concrete'), cx, zf - 0.1, pw + 1, 5, 0.17, 0.55, [0, -1]);
  yield;

  // towers
  for (const side of [0, 1]) {
    const tx0 = side ? x1 - Tw : x0, tx1 = tx0 + Tw;
    const tz0 = zf - (gothic ? 0.4 : 0.2), tz1 = tz0 + Tw;
    const tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2;
    if (gothic) {
      const shaft = Number(look.towerShaft ?? 38);
      k.box(trim, tx0, 0, tz0, tx1, shaft, tz1, { noTop: true });
      // corner buttresses and stage courses
      for (const bx of [tx0 - 0.5, tx1 - 0.2]) for (const bz of [tz0 - 0.5, tz1 - 0.2]) k.box(trim, bx, 0, bz, bx + 0.7, shaft - 6, bz + 0.7);
      for (const y of [8, 17, 26, shaft - 7]) band(k, trim, tx0, tz0, tx1, tz0, y, 0.5, 0.3, [0, -1]);
      lancetPane(k, dark, tcx, tz0, 1.2, 2.2, 5.2, [0, -1], true, 0.05);
      lancetPane(k, glass, tcx, tz0, 11, 1.4, 4.6, [0, -1], true, 0.05);
      lancetPane(k, glass, tcx, tz0, 21, 1.4, 4.6, [0, -1], true, 0.05);
      for (const out of [[0, -1], [-1, 0], [1, 0]] as Out[]) {
        const alongX = out[1] !== 0;
        const at = alongX ? tz0 : out[0] < 0 ? tx0 : tx1;
        const mid = alongX ? tcx : tcz;
        lancetPane(k, dark, mid, at, shaft - 6.4, 1.8, 5.2, out, alongX, 0.05);
        lancetSurround(k, trim, mid, at, shaft - 6.4, 1.8, 5.2, out, alongX, 0.3, 0.08);
      }
      // the spire: an eight-sided cone with small corner pinnacles
      const top = Number(look.spireTop ?? 62);
      k.cone(slate, tcx, tcz, Tw * 0.62, shaft, top, 8, { rot: Math.PI / 8 });
      for (const [px, pz2] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]] as Array<[number, number]>) k.cone(trim, px + (px < tcx ? 0.35 : -0.35), pz2 + (pz2 < tcz ? 0.35 : -0.35), 0.5, shaft - 1, shaft + 3.4, 4);
      cross(k, tcx, top, tcz, 2.4, COPPER);
    } else {
      const lower = 21;
      k.box(trim, tx0, 0, tz0, tx1, lower, tz1, { top: trim });
      for (const y of [6, 12, 17]) band(k, trim, tx0, tz0, tx1, tz0, y, 0.45, 0.3, [0, -1]);
      archPane(k, glass, tcx, tz0, 8.5, 1.3, 3.4, [0, -1], true, 0.05);
      disc(k, trim, tcx, 15, tz0, 1.0, [0, -1], 10, 0.05);
      disc(k, glass, tcx, 15, tz0, 0.6, [0, -1], 10, 0.09);
      // balcony on a scrolled bracket, then the belfry stage
      k.box(trim, tx0 - 0.4, lower, tz0 - 0.4, tx1 + 0.4, lower + 0.5, tz1 + 0.4, { top: trim });
      const bx0 = tx0 + 0.6, bx1 = tx1 - 0.6, bz0 = tz0 + 0.6, bz1 = tz1 - 0.6;
      k.box(trim, bx0, lower + 0.5, bz0, bx1, lower + 9, bz1, { top: trim });
      for (const out of [[0, -1], [-1, 0], [1, 0]] as Out[]) {
        const alongX = out[1] !== 0;
        const at = alongX ? bz0 : out[0] < 0 ? bx0 : bx1;
        const mid = alongX ? (bx0 + bx1) / 2 : (bz0 + bz1) / 2;
        archPane(k, dark, mid, at, lower + 2.4, 2.0, 4.8, out, alongX, 0.05);
        archSurround(k, trim, mid, at, lower + 2.4, 2.0, 4.8, out, alongX, 0.3, 0.08);
      }
      band(k, trim, bx0, bz0, bx1, bz0, lower + 8.2, 0.9, 0.45, [0, -1]);
      band(k, trim, bx0, bz0, bx0, bz1, lower + 8.2, 0.9, 0.45, [-1, 0]);
      band(k, trim, bx1, bz0, bx1, bz1, lower + 8.2, 0.9, 0.45, [1, 0]);
      // the dome: a drum with a flat green cap, a lantern and a cross
      k.cone(k.flatM, tcx, tcz, (bx1 - bx0) * 0.62, lower + 9.4, lower + 13.2, 10, { color: GREEN, rot: 0.3, r1: 0.7 });
      k.cyl(trim, tcx, tcz, 0.7, lower + 13.2, lower + 15, 8);
      k.cone(k.flatM, tcx, tcz, 0.85, lower + 15, lower + 16.6, 8, { color: GREEN });
      cross(k, tcx, lower + 16.4, tcz, 2.6, COPPER);
    }
    k.solidRect(tx0, tz0, tx1, tz1);
    yield;
  }
  // notice board, fence with a gate at the steps, a few trees
  signBoard(k, row.name.toUpperCase(), W - 3.5, 1.2, 0.6, [0, -1], 3.6, '#1c2b46', '#efe6c8', 0);
  k.bar(k.m('metalDark'), [W - 5.3, 0, 0.6], [W - 5.3, 1.4, 0.6], 0.08); k.bar(k.m('metalDark'), [W - 1.7, 0, 0.6], [W - 1.7, 1.4, 0.6], 0.08);
  fence(k, 0, 0.15, W, 0.15, { h: 1.1, gaps: [[cx - 7.5, cx + 7.5]], postEvery: 4 });
  for (let i = 0; i < 3; i++) tree(k, 2 + rng.next() * (W - 4), D - 1.2 - rng.next() * 1.5, rng, 0.6, false);
  if (detail > 0) { lampPost(k, cx - 8.5, 1.2, 3.4); lampPost(k, cx + 8.5, 1.2, 3.4); }
}

// ----------------------------------------------------------------------------------------------- polygon helpers (corner sites)

type P2 = [number, number];

/** Ramer-Douglas-Peucker on a closed ring (keeps the corners of a block ring that has rounded corners) */
function simplifyRing(ring: P2[], tol: number): P2[] {
  const n = ring.length;
  if (n <= 4) return ring.slice();
  // anchor on the two points farthest apart
  let ia = 0, ib = 0, best = -1;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]); if (d > best) { best = d; ia = i; ib = j; } }
  const side = (from: number, to: number): P2[] => {
    const pts: P2[] = [];
    for (let i = from; i !== to; i = (i + 1) % n) pts.push(ring[i]);
    pts.push(ring[to]);
    return pts;
  };
  const rdp = (pts: P2[]): P2[] => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let md = 0, mi = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * (b[1] - a[1]) - (pts[i][1] - a[1]) * (b[0] - a[0])) / L; if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [a, b];
    return [...rdp(pts.slice(0, mi + 1)).slice(0, -1), ...rdp(pts.slice(mi))];
  };
  const s1 = rdp(side(ia, ib)), s2 = rdp(side(ib, ia));
  return [...s1.slice(0, -1), ...s2.slice(0, -1)];
}

const area2 = (r: P2[]): number => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };

/** inset a convex ring by d (miter), returned counter-clockwise in (x, z) */
function insetRing(ring: P2[], d: number): P2[] {
  const r = area2(ring) < 0 ? ring.slice().reverse() : ring.slice();
  const n = r.length;
  return r.map((p, i) => {
    const a = r[(i + n - 1) % n], b = r[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    // for a counter-clockwise ring in (x, z) with z down, the inward normal of an edge (dx, dz) is (-dz, dx)
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k] as P2;
  });
}

/** keep the part of a ring where dot(p - o, dir) >= t (Sutherland-Hodgman, one plane) */
function clipRing(ring: P2[], o: P2, dir: P2, t: number): P2[] {
  const f = (p: P2): number => (p[0] - o[0]) * dir[0] + (p[1] - o[1]) * dir[1] - t;
  const out: P2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const u = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
  }
  return out;
}

/** vertical pane run along a slanted edge a -> b with outward normal `out` (local xz) */
function edgePanes(k: Kit, a: P2, b: P2, out: P2, o: { y0: number; floors: number; floorH: number; w: number; h: number; pitch: number; margin: number; mat: (i: number, f: number) => Mat; trim?: Mat | null; skip?: (i: number, f: number) => boolean }): void {
  if (k.far) return;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  const n = Math.max(0, Math.floor((L - 2 * o.margin - o.w) / o.pitch) + 1);
  if (!n) return;
  const start = (L - ((n - 1) * o.pitch + o.w)) / 2;
  const hint: V3 = [out[0], 0, out[1]];
  for (let f = 0; f < o.floors; f++) for (let i = 0; i < n; i++) {
    if (o.skip?.(i, f)) continue;
    const s0 = start + i * o.pitch, s1 = s0 + o.w, y = o.y0 + f * o.floorH;
    const P = (s: number, yy: number, off: number): V3 => [a[0] + ux * s + out[0] * off, yy, a[1] + uz * s + out[1] * off];
    k.quad(o.mat(i, f), P(s0, y, 0.05), P(s1, y, 0.05), P(s1, y + o.h, 0.05), P(s0, y + o.h, 0.05), { hint, ru: 1, rv: 1 });
    if (o.trim) {
      const t = 0.22;
      k.quad(o.trim, P(s0 - t, y + o.h, 0.09), P(s1 + t, y + o.h, 0.09), P(s1 + t, y + o.h + 0.34, 0.09), P(s0 - t, y + o.h + 0.34, 0.09), { hint, ru: 0.5, rv: 0.1 });
      k.quad(o.trim, P(s0 - t, y - 0.2, 0.09), P(s1 + t, y - 0.2, 0.09), P(s1 + t, y, 0.09), P(s0 - t, y, 0.09), { hint, ru: 0.5, rv: 0.1 });
    }
  }
}

/** a projecting band along a slanted edge */
function edgeBand(k: Kit, mat: Mat, a: P2, b: P2, out: P2, y: number, h: number, proud: number): void {
  if (k.far) return;
  const hint: V3 = [out[0], 0, out[1]];
  const A: V3 = [a[0] + out[0] * proud, y, a[1] + out[1] * proud], B: V3 = [b[0] + out[0] * proud, y, b[1] + out[1] * proud];
  k.quad(mat, A, B, [B[0], y + h, B[2]], [A[0], y + h, A[2]], { hint, ru: Math.hypot(b[0] - a[0], b[1] - a[1]) / 3, rv: h / 3 });
  k.quad(mat, [a[0], y + h, a[1]], [b[0], y + h, b[1]], [B[0], y + h, B[2]], [A[0], y + h, A[2]], { hint: [0, 1, 0], ru: 3, rv: 0.2 });
}

// ----------------------------------------------------------------------------------------------- movie palace

/**
 * A corner movie palace of 1911 in white glazed terracotta on a wedge-shaped block: a round tower fills the sharp corner (porthole,
 * heavy ring cornice), a deep fluted marquee under it carries the name, tall windows with stone heads and a bracketed cornice run
 * down both long walls over a red base. The sharp corner is the vertex of the site ring nearest the frame origin.
 */
export function* buildTheatre(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const look = row.look;
  const white = k.m('brickPainted', 0), trim = k.m('limestone'), roof = k.m('tarRoof', 1), dark = k.m('metalDark'), glass = k.m('window', 1);
  const H = Number(look.height ?? 21);
  const R = Number(look.towerR ?? 4.5);
  const RED = 0x7a2f26, BULB = 0xf4dca0, CREAM = 0xe6dccb;
  const raw = localRing(row);
  let main = simplifyRing(raw, 1.8);
  main = insetRing(main, 1.0);
  // the sharp corner: the vertex nearest the frame origin; the tower stands on the bisector
  let ai = 0, bd = 1e9;
  main.forEach((p, i) => { const d = Math.hypot(p[0], p[1]); if (d < bd) { bd = d; ai = i; } });
  const A = main[ai], pa = main[(ai + main.length - 1) % main.length], pb = main[(ai + 1) % main.length];
  const u1 = [pa[0] - A[0], pa[1] - A[1]], u2 = [pb[0] - A[0], pb[1] - A[1]];
  const l1 = Math.hypot(u1[0], u1[1]), l2 = Math.hypot(u2[0], u2[1]);
  let bis: P2 = [u1[0] / l1 + u2[0] / l2, u1[1] / l1 + u2[1] / l2];
  const bl = Math.hypot(bis[0], bis[1]) || 1; bis = [bis[0] / bl, bis[1] / bl];
  const half = Math.acos(Math.max(-1, Math.min(1, (u1[0] * u2[0] + u1[1] * u2[1]) / (l1 * l2)))) / 2;
  const dT = Math.min(R / Math.max(0.2, Math.sin(half)), 16);
  const Rt = Math.min(R, dT * Math.sin(half));
  const ctr: P2 = [A[0] + bis[0] * dT, A[1] + bis[1] * dT];
  const body = clipRing(main, A, bis, dT);
  k.floor(k.m('concrete'), raw, 0.04);
  yield;
  // walls: one prism over the clipped ring (the walls are tall plain terracotta, windows and bands go on the long edges)
  k.prism(white, body, 0, H, { top: roof });
  k.solidPoly(body);
  const centroid: P2 = [body.reduce((s, p) => s + p[0], 0) / body.length, body.reduce((s, p) => s + p[1], 0) / body.length];
  const ccw = area2(body) > 0;
  for (let i = 0; i < body.length; i++) {
    const a = body[i], b = body[(i + 1) % body.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 8) continue;
    // outward normal: for a counter-clockwise ring in (x, z) the outward normal of (dx, dz) is (dz, -dx)
    const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    const out: P2 = ccw ? [dz, -dx] : [-dz, dx];
    void centroid;
    edgePanes(k, a, b, out, { y0: 7.6, floors: 1, floorH: 5, w: 1.9, h: 6.2, pitch: 4.6, margin: 3, mat: () => glass, trim: detail > 0 ? trim : null });
    edgePanes(k, a, b, out, { y0: 0.9, floors: 1, floorH: 5, w: 1.6, h: 3.3, pitch: 5.4, margin: 3, mat: () => dark });
    edgeBand(k, trim, a, b, out, H - 1.7, 1.7, 0.7);
    edgeBand(k, trim, a, b, out, 6.9, 0.5, 0.3);
    edgeBand(k, k.flatM, a, b, out, 0, 1.3, 0.05);
  }
  yield;
  // the round tower: a drum with a porthole, a ring cornice and a flat cap
  k.cyl(white, ctr[0], ctr[1], Rt, 0, H + 3.2, 20, { top: roof });
  k.cyl(trim, ctr[0], ctr[1], Rt + 0.5, H + 1.2, H + 3.2, 20, { top: trim });
  k.cyl(trim, ctr[0], ctr[1], Rt + 0.3, H - 2.8, H - 1.8, 20, { noTop: true });
  const outT: P2 = [-bis[0], -bis[1]];
  const pc: P2 = [ctr[0] - bis[0] * Rt, ctr[1] - bis[1] * Rt];
  disc(k, trim, pc[0], H - 6.8, pc[1], 1.7, outT, 12, 0.03);
  disc(k, glass, pc[0], H - 6.8, pc[1], 1.2, outT, 12, 0.08);
  k.solidCircle(ctr[0], ctr[1], Rt);
  // the marquee: a deep fluted box wrapping the front of the tower, the name on it in capitals
  const mw = Math.min(14, Rt * 3.2), md = 2.6;
  const tx = -outT[1], tz = outT[0]; // along the marquee
  const mc: P2 = [pc[0] + outT[0] * (md / 2 - 0.4), pc[1] + outT[1] * (md / 2 - 0.4)];
  const pt = (s: number, t: number): P2 => [mc[0] + tx * s + outT[0] * t, mc[1] + tz * s + outT[1] * t];
  k.prism(k.flatM, [pt(-mw / 2, -md / 2), pt(mw / 2, -md / 2), pt(mw / 2, md / 2), pt(-mw / 2, md / 2)], 5.1, 6.4, { color: CREAM });
  k.prism(k.flatM, [pt(-mw / 2 - 0.1, -md / 2), pt(mw / 2 + 0.1, -md / 2), pt(mw / 2 + 0.1, md / 2 + 0.1), pt(-mw / 2 - 0.1, md / 2 + 0.1)], 6.4, 6.75, { color: RED });
  if (detail > 0) for (let s = -mw / 2 + 0.5; s < mw / 2 - 0.3; s += 0.7) { const q = pt(s, md / 2 + 0.05), q2 = pt(s + 0.14, md / 2 + 0.05); k.quad(k.flatM, [q[0], 5.3, q[1]], [q2[0], 5.3, q2[1]], [q2[0], 6.3, q2[1]], [q[0], 6.3, q[1]], { hint: [outT[0], 0, outT[1]], color: BULB }); }
  const sb = pt(0, md / 2 + 0.06);
  signBoard(k, row.name.toUpperCase(), sb[0], 6.85, sb[1], outT, Math.min(13, mw), '#7a2f26', '#f4e6c0', 0);
  // doors under the marquee and a ticket booth
  for (const s of [-3.2, 0, 3.2]) { const d0 = pt(s - 1.0, -md / 2 + 0.02), d1 = pt(s + 1.0, -md / 2 + 0.02); k.quad(dark, [d0[0], 0, d0[1]], [d1[0], 0, d1[1]], [d1[0], 3.6, d1[1]], [d0[0], 3.6, d0[1]], { hint: [-outT[0], 0, -outT[1]] }); }
  // the roof: a fly tower box and a vertical blade sign on the tower
  const fly = pt(0, -md / 2 - 9);
  k.prism(k.m('brickRed', 0), [[fly[0] - 7, fly[1] - 6], [fly[0] + 7, fly[1] - 6], [fly[0] + 7, fly[1] + 6], [fly[0] - 7, fly[1] + 6]], H, H + 5, { top: roof });
  yield;
}

// ----------------------------------------------------------------------------------------------- brewery

/**
 * A round-arch brewery of the 1870s to 1890s in red brick: a four-storey brew house with arched windows under brick hoods, pilasters,
 * a corbelled cornice and roof bulkheads, an office wing with a mansard, a low engine house and a tall round chimney.
 */
export function* buildBrewery(c: BuildCtx): Generator<void> {
  const { k, row, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const brick = k.m('brickRed', 0), hood = k.m('brownstone'), roof = k.m('tarRoof', 1), dark = k.m('metalDark'), stone = k.m('limestone');
  const floors = Number(look.floors ?? 4), fh = Number(look.floorH ?? 3.7);
  const H = floors * fh + 0.6;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, D], [0, D]], 0.04);
  yield;
  // main block: front along x, left side along z
  const mx1 = Math.min(W - 2, Number(look.mainW ?? 46)), mz1 = Math.min(D - 1, Number(look.mainD ?? 26));
  k.box(brick, 0.5, 0, 0.8, mx1, H, mz1, { top: roof });
  flatRoof(k, roof, brick, 0.5, 0.8, mx1, mz1, H, 0.6);
  const brickClosed = k.m('brickPainted', 1);
  for (const [alongX, at, from, to, out] of [[true, 0.8, 0.5, mx1, [0, -1]], [false, 0.5, 0.8, mz1, [-1, 0]], [false, mx1, 0.8, mz1, [1, 0]]] as Array<[boolean, number, number, number, Out]>) {
    // ground floor: bricked-up arches; upper floors: open arched windows with brick hoods
    archRun(k, { alongX, at, from, to, out, y0: 0.7, floors: 1, floorH: fh, pitch: 3.6, w: 1.5, h: fh - 0.9, hood, detail, closed: () => true, closedMat: brickClosed });
    archRun(k, { alongX, at, from, to, out, y0: fh + 0.7, floors: floors - 1, floorH: fh, pitch: 3.6, w: 1.5, h: fh - 0.8, hood, detail });
    // pilasters between the bays
    if (detail > 0) {
      const len = to - from;
      const n = Math.max(1, Math.floor(len / 3.6));
      for (let i = 0; i <= n; i++) {
        const s = from + (len * i) / n;
        if (alongX) k.box(brick, s - 0.18, 0, at - 0.14, s + 0.18, H - 0.5, at);
        else k.box(brick, at - (out[0] > 0 ? 0 : 0.14), 0, s - 0.18, at + (out[0] > 0 ? 0.14 : 0), H - 0.5, s + 0.18);
      }
    }
  }
  // corbelled cornice: a deep band with a row of small arches under it
  band(k, hood, 0.5, 0.8, mx1, 0.8, H - 1.0, 1.0, 0.5, [0, -1]);
  band(k, hood, 0.5, 0.8, 0.5, mz1, H - 1.0, 1.0, 0.5, [-1, 0]);
  band(k, hood, mx1, 0.8, mx1, mz1, H - 1.0, 1.0, 0.5, [1, 0]);
  for (let s = 0.5; s < mx1 - 0.6 && detail > 0; s += 1.3) archPane(k, dark, s + 0.5, 0.8, H - 2.2, 0.8, 1.1, [0, -1], true, 0.04);
  // roof bulkheads
  k.box(brick, 6, H, 6, 12, H + 3.6, 12, { top: roof });
  k.box(brick, mx1 - 14, H, mz1 - 12, mx1 - 6, H + 2.6, mz1 - 5, { top: roof });
  k.solidRect(0.5, 0.8, mx1, mz1);
  yield;
  // office wing (three storeys with a mansard roof) beside the main block, and a low engine house behind it
  const ox0 = mx1 + 1.0, ox1 = Math.min(W - 0.5, ox0 + 12);
  if (ox1 - ox0 > 6) {
    const oh = 3 * 3.5;
    k.box(brick, ox0, 0, 2, ox1, oh, 14, { top: roof });
    archRun(k, { alongX: true, at: 2, from: ox0, to: ox1, out: [0, -1], y0: 1.0, floors: 3, floorH: 3.5, pitch: 3.0, w: 1.3, h: 2.4, hood, detail });
    k.gable(roof, brick, ox0, 2, ox1, 14, oh, oh + 3.4, 'x', 0.4);
    k.solidRect(ox0, 2, ox1, 14);
  }
  // the chimney: a tall round brick stack with a flared cap
  const chx = Number(look.chimneyX ?? mx1 - 5), chz = Number(look.chimneyZ ?? mz1 + 0.6);
  if (chz < D - 1) {
    k.cyl(brick, chx, chz, 1.3, 0, Number(look.chimney ?? 34), 12, { noTop: true });
    k.cyl(hood, chx, chz, 1.6, Number(look.chimney ?? 34) - 1.4, Number(look.chimney ?? 34), 12, { top: hood });
    k.solidCircle(chx, chz, 1.3);
  }
  // a fire escape on the long side (a few bars: red-painted metal), name board over the corner door
  if (detail > 0) {
    for (let f = 1; f < floors; f++) k.box(k.m('metalDark'), 8, f * fh, 0.2, 14, f * fh + 0.1, 0.8, { top: k.m('metalDark') });
    k.bar(k.m('metalDark'), [8, 0.5, 0.5], [8, floors * fh, 0.5], 0.08);
  }
  signBoard(k, row.name.toUpperCase(), 7, 2.6, 0.78, [0, -1], 5.6, '#3a2a22', '#e6d8b4', 0.0);
  yield;
}

// ----------------------------------------------------------------------------------------------- market hall

/**
 * A city market hall of 1941: a low red-brown brick box with a flat roof and a parapet, the name in big capitals along the
 * parapet, a band of tall shutters over a canopy, double doors, flagpoles with banners down the long side.
 */
export function* buildMarket(c: BuildCtx): Generator<void> {
  const { k, row, rng, detail } = c;
  const W = row.site.w, D = row.site.d;
  const look = row.look;
  const brick = k.m('brickRed', 1), roof = k.m('tarRoof', 1), dark = k.m('metalDark');
  const H = Number(look.height ?? 8.2);
  const TEAL = Number(look.teal ?? 0x2e9a8c), AWN = 0x2c8a7c;
  const bx0 = 1.5, bx1 = W - 1.5, bz0 = 3.2, bz1 = D - 1;
  k.floor(k.m('concrete'), [[0, 0], [W, 0], [W, bz0], [0, bz0]], 0.05);
  k.box(brick, bx0, 0, bz0, bx1, H, bz1, { top: roof });
  flatRoof(k, roof, brick, bx0, bz0, bx1, bz1, H, 0.8);
  k.solidRect(bx0, bz0, bx1, bz1);
  yield;
  // name in big capitals along the front parapet
  signBoard(k, row.name.toUpperCase(), (bx0 + bx1) / 2, H - 2.9, bz0, [0, -1], Math.min(22, bx1 - bx0 - 2), '#6b2f26', '#efe6d6', 0.03);
  // the band of shutters over the canopy: big teal panels with a few coloured picture panes
  const bw = (bx1 - bx0) * 0.78, sx0 = (bx0 + bx1) / 2 - bw / 2;
  const n = Math.max(4, Math.round(bw / 2.2));
  const cols = [TEAL, TEAL, 0xe3b43a, 0x3b6a9a, 0xc4442f, 0xd8d2c0, TEAL, TEAL];
  for (let i = 0; i < n; i++) {
    const x = sx0 + (bw * i) / n;
    k.quad(k.flatM, [x + 0.08, 3.9, bz0 - 0.02], [x + bw / n - 0.08, 3.9, bz0 - 0.02], [x + bw / n - 0.08, 6.4, bz0 - 0.02], [x + 0.08, 6.4, bz0 - 0.02], { hint: [0, 0, -1], color: cols[(i + (rng.int(0, 2))) % cols.length] });
  }
  // the canopy over the doors and the doors (double leaves in the same teal)
  k.box(k.flatM, bx0 + 2, 3.3, bz0 - 1.0, bx1 - 2, 3.6, bz0, { color: AWN });
  for (let i = 0; i < 3; i++) {
    const dx = bx0 + 4 + i * ((bx1 - bx0 - 8) / 2.5);
    k.quad(k.flatM, [dx, 0, bz0 - 0.03], [dx + 2.6, 0, bz0 - 0.03], [dx + 2.6, 3.2, bz0 - 0.03], [dx, 3.2, bz0 - 0.03], { hint: [0, 0, -1], color: TEAL });
    k.quad(dark, [dx + 0.3, 0.8, bz0 - 0.05], [dx + 1.2, 0.8, bz0 - 0.05], [dx + 1.2, 2.6, bz0 - 0.05], [dx + 0.3, 2.6, bz0 - 0.05], { hint: [0, 0, -1] });
    k.quad(dark, [dx + 1.4, 0.8, bz0 - 0.05], [dx + 2.3, 0.8, bz0 - 0.05], [dx + 2.3, 2.6, bz0 - 0.05], [dx + 1.4, 2.6, bz0 - 0.05], { hint: [0, 0, -1] });
  }
  // flagpoles with banners down the front and the long side
  if (detail > 0) {
    const flags = [0x2e9a8c, 0xe3b43a, 0xc4442f, 0x2c3a5c, 0xd8d2c0, 0x2e9a8c];
    for (let i = 0; i < 6; i++) {
      const fx = bx0 + 3 + i * ((bx1 - bx0 - 6) / 5);
      k.bar(dark, [fx, H, bz0 + 0.2], [fx + 0.2, H + 3.4, bz0 - 1.4], 0.07);
      k.quad(k.flatM, [fx + 0.1, H + 3.3, bz0 - 1.3], [fx + 1.7, H + 3.3, bz0 - 1.3], [fx + 1.7, H + 1.9, bz0 - 1.3], [fx + 0.1, H + 1.9, bz0 - 1.3], { hint: [0, 0, -1], color: flags[i % flags.length] });
    }
  }
  // brick pavement and benches
  for (let i = 0; i < 3; i++) bench(k, 4 + i * 5, 1.4, [0, 1]);
  tree(k, 2.2, 1.3, rng, 0.6, false);
  rectCornice(k, k.m('cornice'), bx0, bz0, bx1, bz1, H - 0.2, 0.3, 0.2);
  yield;
}
