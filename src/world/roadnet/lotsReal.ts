/**
 * WP5: lots on the real frontages (docs/swarm/plans/briefs/WP5.md). Pure, no THREE.
 *
 *   placeLots(net, derived, faces, lotsJson) -> Lot[]            (Lot.id = bbl; items are RealLot)
 *   placeLotsDetailed(...) -> { lots, report }
 *
 * Input is `raw/lots-real-r1r2a.json` (PLUTO centroid + frontage/depth, nearest edge `e`, arc length `s`, block `blk`).
 * Each lot is attached to a face of its block (same edge, nearest to the centroid; blk -1 lots go to the nearest face within
 * 25 m), the lots of a face are ordered along it, their frontages scaled so they fill the usable face exactly (clamped to
 * 0.6..1.6, the remainder becomes equal gaps; a face needing more than 1.6 keeps real widths and positions; a face outside 0.85..1.15 is reported), depth = PLUTO lot depth clipped to the
 * block (half of the way to the opposite building line on a through-lot). Corner lots (within 8 m of a face end) at a corner
 * of 70..180 degrees are cut by the bisector of the corner so the two lots that meet there do not overlap. At a wedge corner
 * (interior angle < 70 degrees, Broadway/Bushwick triangles) both faces stop short of the corner by depth/tan(angle) and the
 * leftover is a `vacant` lot (fence + paving), never a skewed building. Lots that would overlap a lot already placed, or leave
 * the building line, get a shorter depth (down to 5 m) and are dropped otherwise.
 * Blocks in `derived.fallbackBuilding`, with no building line, or narrower than 6 m get no lots.
 *
 * `RealLot.poly` is the true (convex) outline; frontA/frontB/width/depth describe the unclipped rectangle in the lot frame
 * (x along frontA -> frontB, z = outward), which BuildingGen consumes unchanged.
 */
import type { Vec2 } from '@/core/Math2';
import type { Lot, LotType } from '@/world/types';
import type { Derived } from './derive';
import type { RealFace } from './faces';
import { closestOnSegment, distance, pointInPolygon } from './geom';
import type { RoadNet } from './RoadNet';

export interface RealLot extends Lot {
  bbl: string;
  /** convex outline in world metres (rectangle, or rectangle cut by a corner bisector, or a wedge triangle/quad) */
  poly: Vec2[];
  /** index into the block's faces (blockFaces()[block]) */
  block: number;
  face: number;
  wedge?: boolean;
  /** frontage scale applied on this face */
  scale: number;
  /** which end(s) of the face this corner lot touches: 'a' (frontA side), 'b' (frontB side) or 'ab' */
  cornerEnd?: 'a' | 'b' | 'ab';
  /** the street the lot fronts is an avenue, arterial or other non-street class */
  avenue?: boolean;
  /** PLUTO facts the building generator needs (all from the lots file) */
  pluto?: { cls: string; lu: string; fl: number | null; yr: number | null; bd: number | null; bf: number | null; rf: number | null; lf: number };
}

export interface LotReport {
  input: Record<string, number>;
  placed: Record<string, number>;
  dropped: Record<string, Record<string, number>>;
  vacantFromWedge: number;
  wedgeCorners: number;
  vacantTotal: number;
  facesWithLots: number;
  facesScaledOutside: number;
  /** [min, max] of the frontage scale over faces with lots */
  scaleRange: [number, number];
  narrowOrFallbackBlocks: number;
  reassigned: number;
}

export const MIN_BLOCK_WIDTH = 6;
export const WEDGE_DEG = 70;
export const CORNER_REACH = 8;
const MIN_DEPTH = 5;
const SCALE_LO = 0.6, SCALE_HI = 1.6;
const NEAR_FACE = 25;

interface PlutoLot {
  bbl: string; ph?: string; x: number; z: number; lf: number | null; ld: number | null; fl: number | null; yr: number | null;
  cls?: string; lu?: string; bd?: number | null; bf?: number | null; rf?: number | null; e: number; s: number | null; sd: number; blk: number; bins?: string[]; ad?: string; fa?: number;
}

// ---------------------------------------------------------------- polygon helpers

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
const dotp = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;

export function polyArea(p: ReadonlyArray<Vec2>): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a += u.x * v.z - v.x * u.z; }
  return Math.abs(a) / 2;
}

/** Sutherland-Hodgman against the half-plane (p - c) . n >= 0 */
function clipHalf(poly: Vec2[], c: Vec2, n: Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = dotp(sub(p, c), n), dq = dotp(sub(q, c), n);
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }); }
  }
  return out;
}

/** smallest penetration depth of two convex polygons (<= 0 when they only touch or are apart) */
export function penetration(a: ReadonlyArray<Vec2>, b: ReadonlyArray<Vec2>): number {
  let best = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const l = distance(p, q) || 1;
      const n = { x: -(q.z - p.z) / l, z: (q.x - p.x) / l };
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of a) { const d = dotp(v, n); if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of b) { const d = dotp(v, n); if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o < best) best = o;
      if (best <= 0) return best;
    }
  }
  return best;
}

function distToRing(p: Vec2, ring: ReadonlyArray<Vec2>): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, Math.sqrt(closestOnSegment(p, ring[i], ring[(i + 1) % ring.length]).d2));
  return best;
}

function minWidth(ring: ReadonlyArray<Vec2>): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const l = distance(p, q);
    if (l < 1) continue;
    const n = { x: -(q.z - p.z) / l, z: (q.x - p.x) / l };
    let lo = Infinity, hi = -Infinity;
    for (const v of ring) { const d = dotp(v, n); if (d < lo) lo = d; if (d > hi) hi = d; }
    best = Math.min(best, hi - lo);
  }
  return best;
}

// ---------------------------------------------------------------- type mapping (import-pluto.mjs classification)

export function lotTypeOfPluto(l: Pick<PlutoLot, 'cls' | 'lu' | 'fl' | 'yr' | 'lf' | 'bins'>): LotType {
  const cls = (l.cls ?? '').toUpperCase();
  const c0 = cls[0] ?? 'V';
  const lu = Number.parseInt(l.lu ?? '', 10);
  const noBuilding = !(l.bins && l.bins.length) && !(l.fl && l.fl > 0);
  if (c0 === 'V' || cls === 'Q9' || lu === 11 || (lu === 9 && noBuilding) || (cls === '' && noBuilding)) return 'vacant';
  if (c0 === 'M') return 'church';
  if (c0 === 'W') return 'apartment';
  if (c0 === 'G' || lu === 10 || 'EFLUTY'.includes(c0)) return 'rowhouse';
  if (c0 === 'K' || c0 === 'S' || cls === 'C7' || cls === 'D7' || 'OHJP'.includes(c0) || lu === 5 || lu === 4) return 'mixeduse';
  const fl = l.fl ?? 0;
  const yr = l.yr ?? 0;
  const stoop = 'ABCS'.includes(c0) && (!yr || yr < 1940) && (l.lf ?? 99) <= 12 && fl >= 2;
  if (!stoop && (fl >= 4 || (yr >= 1990) || c0 === 'D' || c0 === 'R')) return 'apartment';
  return yr && yr < 1905 ? 'brownstone' : 'rowhouse';
}

// ---------------------------------------------------------------- placement

const newReport = (): LotReport => ({
  input: {}, placed: {}, dropped: {}, vacantFromWedge: 0, wedgeCorners: 0, vacantTotal: 0, facesWithLots: 0, facesScaledOutside: 0,
  scaleRange: [Infinity, -Infinity], narrowOrFallbackBlocks: 0, reassigned: 0,
});
const bump = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };
const drop = (r: LotReport, ph: string, why: string): void => { (r.dropped[ph] ??= {}); bump(r.dropped[ph], why); };

export function placeLots(net: RoadNet, d: Derived, faces: RealFace[][], lotsJson: unknown): Lot[] {
  return placeLotsDetailed(net, d, faces, lotsJson).lots;
}

export function placeLotsDetailed(net: RoadNet, d: Derived, faces: RealFace[][], lotsJson: unknown): { lots: RealLot[]; report: LotReport } {
  const input = ((lotsJson as { lots?: PlutoLot[] }).lots ?? []) as PlutoLot[];
  const report = newReport();
  const out: RealLot[] = [];
  const fallback = new Set(d.fallbackBuilding);
  const usable: boolean[] = faces.map((fs, bi) => {
    const ring = d.buildingRings[bi];
    return fs.length > 0 && !!ring && ring.length >= 3 && !fallback.has(bi) && minWidth(ring) >= MIN_BLOCK_WIDTH;
  });
  report.narrowOrFallbackBlocks = faces.filter((_, bi) => !usable[bi]).length;

  // ---- 1. attach every lot to a face
  const byFace = new Map<string, { lot: PlutoLot; t: number }[]>();
  const seenUnit = new Set<string>();
  const key = (bi: number, fi: number): string => `${bi}:${fi}`;
  const near = (bi: number, p: Vec2, edge: number): { fi: number; dist: number } | null => {
    let best: { fi: number; dist: number } | null = null;
    faces[bi].forEach((f, fi) => {
      if (edge >= 0 && f.edge !== edge) return;
      const dd = Math.sqrt(closestOnSegment(p, f.a, f.b).d2);
      if (!best || dd < best.dist) best = { fi, dist: dd };
    });
    return best;
  };
  for (const lot of input) {
    const ph = lot.ph ?? 'R?';
    bump(report.input, ph);
    if (lot.e < 0) { drop(report, ph, 'noEdge'); continue; }
    if (!lot.lf || lot.lf <= 0) { drop(report, ph, 'zeroFrontage'); continue; }
    const uk = `${lot.ad}|${lot.x}|${lot.z}|${lot.lf}`;
    if (seenUnit.has(uk)) { drop(report, ph, 'duplicateUnit'); continue; }
    seenUnit.add(uk);
    const c = { x: lot.x, z: lot.z };
    let bi = lot.blk;
    let hit = bi >= 0 && bi < faces.length ? (near(bi, c, lot.e) ?? near(bi, c, -1)) : null;
    if (hit && hit.dist > 60) hit = null;
    if (!hit) {
      // centroid outside every block ring (or its edge is not a face of the block): nearest face of any block within 25 m
      let best: { bi: number; fi: number; dist: number } | null = null;
      const px = c.x, pz = c.z;
      for (let b = 0; b < faces.length; b++) {
        if (!usable[b]) continue;
        const ring = d.buildingRings[b];
        let near2 = false;
        for (const v of ring) if (Math.abs(v.x - px) < 300 && Math.abs(v.z - pz) < 300) { near2 = true; break; }
        if (!near2) continue;
        const h = near(b, c, -1);
        if (h && h.dist <= NEAR_FACE && (!best || h.dist < best.dist)) best = { bi: b, fi: h.fi, dist: h.dist };
      }
      if (!best) { drop(report, ph, bi >= 0 ? 'noFace' : 'noBlock'); continue; }
      bi = best.bi; hit = { fi: best.fi, dist: best.dist };
      report.reassigned++;
    }
    if (!usable[bi]) { drop(report, ph, 'narrowBlock'); continue; }
    const f = faces[bi][hit.fi];
    const dir = { x: f.b.x - f.a.x, z: f.b.z - f.a.z };
    const l = Math.hypot(dir.x, dir.z) || 1;
    const t = ((c.x - f.a.x) * dir.x + (c.z - f.a.z) * dir.z) / l;
    const k = key(bi, hit.fi);
    const arr = byFace.get(k);
    if (arr) arr.push({ lot, t }); else byFace.set(k, [{ lot, t }]);
  }

  // ---- 2. per block
  const scales: number[] = [];
  for (let bi = 0; bi < faces.length; bi++) {
    if (!usable[bi]) continue;
    const fs = faces[bi];
    const ring = d.buildingRings[bi];
    const placed: Vec2[][] = [];
    // wedge corners first: they reserve their triangle
    const inset = fs.map(() => [0, 0]); // [a end, b end]
    for (let j = 0; j < fs.length; j++) {
      const F = fs[j];
      const G = fs[(j + 1) % fs.length];
      if (fs.length < 2 || F.angleA >= WEDGE_DEG || F.angleA <= 1 || G.angleB >= WEDGE_DEG) continue;
      const th = (F.angleA * Math.PI) / 180;
      const lenF = distance(F.a, F.b), lenG = distance(G.a, G.b);
      const x0 = Math.min(12 / Math.tan(th), 0.4 * Math.min(lenF, lenG));
      inset[j][0] = x0;
      inset[(j + 1) % fs.length][1] = x0;
      const eF = { x: (F.b.x - F.a.x) / lenF, z: (F.b.z - F.a.z) / lenF };
      const eG = { x: (G.a.x - G.b.x) / lenG, z: (G.a.z - G.b.z) / lenG };
      const C = F.a;
      const pF = { x: C.x + eF.x * x0, z: C.z + eF.z * x0 };
      const pG = { x: G.b.x + eG.x * x0, z: G.b.z + eG.z * x0 };
      const poly = [C, pF, { x: pF.x + pG.x - C.x, z: pF.z + pG.z - C.z }, pG];
      if (polyArea(poly) < 1) continue;
      placed.push(poly);
      report.wedgeCorners++;
      report.vacantFromWedge++;
      out.push({
        id: `${F.blockId}:w${j}`, bbl: '', blockId: F.blockId, side: F.side, frontA: C, frontB: pF, width: x0, depth: x0 * Math.tan(th),
        outward: F.outward, type: 'vacant', corner: true, poly, block: bi, face: j, wedge: true, scale: 1,
      });
    }
    for (let fi = 0; fi < fs.length; fi++) {
      const F = fs[fi];
      const list = byFace.get(key(bi, fi));
      if (!list || !list.length) continue;
      list.sort((p, q) => p.t - q.t || (p.lot.s ?? 0) - (q.lot.s ?? 0));
      const len = distance(F.a, F.b);
      const e = { x: (F.b.x - F.a.x) / len, z: (F.b.z - F.a.z) / len };
      const inward = { x: -F.outward.x, z: -F.outward.z };
      const xs = inset[fi][0], xe = len - inset[fi][1];
      const L = xe - xs;
      const raw = list.map((it) => Math.max(2.4, it.lot.lf!));
      let take = list.length;
      const sum = (n: number): number => raw.slice(0, n).reduce((a, b) => a + b, 0);
      // too many lots for the face even at the smallest scale: the tail does not fit
      while (take > 0 && L / sum(take) < SCALE_LO) take--;
      for (let k = take; k < list.length; k++) drop(report, list[k].lot.ph ?? 'R?', 'overflow');
      if (take === 0 || L <= 0) continue;
      const exact = L / sum(take);
      // a sparse face (parks, yards, lots that belong elsewhere): keep the real widths and the real positions
      const sparse = exact > SCALE_HI;
      const sc = sparse ? 1 : Math.min(SCALE_HI, Math.max(SCALE_LO, exact));
      scales.push(exact);
      report.facesWithLots++;
      if (exact < 0.85 || exact > 1.15) report.facesScaledOutside++;
      report.scaleRange[0] = Math.min(report.scaleRange[0], exact);
      report.scaleRange[1] = Math.max(report.scaleRange[1], exact);
      const gap = sparse ? 0 : Math.max(0, L - sum(take) * sc) / take;
      let cursor = sparse ? xs : xs + gap / 2;
      for (let k = 0; k < take; k++) {
        const lot = list[k].lot;
        const ph = lot.ph ?? 'R?';
        const w = raw[k] * sc;
        let x0 = cursor;
        if (sparse) x0 = Math.min(Math.max(list[k].t - w / 2, cursor, xs), xe - w);
        if (sparse && x0 < cursor - 1e-9) { drop(report, ph, 'overflow'); continue; }
        const x1 = x0 + w;
        cursor = x1 + (sparse ? 0 : gap);
        const fA = { x: F.a.x + e.x * x0, z: F.a.z + e.z * x0 };
        const fB = { x: F.a.x + e.x * x1, z: F.a.z + e.z * x1 };
        // depth: PLUTO depth clipped to the block (half way on a through-lot)
        const mid = { x: (fA.x + fB.x) / 2 + inward.x * 0.2, z: (fA.z + fB.z) / 2 + inward.z * 0.2 };
        let R = Infinity, opposite = false;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i], q = ring[(i + 1) % ring.length];
          const sx = q.x - p.x, sz = q.z - p.z;
          const den = inward.x * sz - inward.z * sx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((p.x - mid.x) * sz - (p.z - mid.z) * sx) / den;
          const u = ((p.x - mid.x) * inward.z - (p.z - mid.z) * inward.x) / den;
          if (t > 0 && u >= 0 && u <= 1 && t < R) {
            R = t;
            const sl = Math.hypot(sx, sz) || 1;
            opposite = (sx * e.x + sz * e.z) / sl < -0.9;
          }
        }
        const room = Number.isFinite(R) ? R + 0.2 : 60;
        const want = lot.ld && lot.ld > 0 ? Math.min(lot.ld, 60) : 20;
        let depth = Math.min(want, opposite ? room / 2 : room - 0.3);
        const cornerA = F.angleA < 179.5 && x0 - 0 < CORNER_REACH + inset[fi][0] && k === 0;
        const cornerB = F.angleB < 179.5 && len - x1 < CORNER_REACH + inset[fi][1] && k === take - 1;
        const cutAt = (dep: number): Vec2[] => {
          let poly: Vec2[] = [fA, fB, { x: fB.x + inward.x * dep, z: fB.z + inward.z * dep }, { x: fA.x + inward.x * dep, z: fA.z + inward.z * dep }];
          if (cornerA && F.angleA >= WEDGE_DEG && F.angleA < 179.5) poly = bisect(poly, F.a, e, inward, F.angleA, 1);
          if (cornerB && F.angleB >= WEDGE_DEG && F.angleB < 179.5) poly = bisect(poly, F.b, { x: -e.x, z: -e.z }, inward, F.angleB, 1);
          return poly;
        };
        const ok = (poly: Vec2[]): boolean => {
          if (poly.length < 3) return false;
          for (const o of placed) if (penetration(poly, o) > 0.05) return false;
          for (const v of poly) {
            const off = dotp(sub(v, fA), inward);
            if (off > 1 && !pointInPolygon(v, ring) && distToRing(v, ring) > 0.3) return false;
          }
          return true;
        };
        let poly = cutAt(depth);
        while (!ok(poly) && depth > MIN_DEPTH) { depth = Math.max(MIN_DEPTH, depth * 0.9); poly = cutAt(depth); if (depth === MIN_DEPTH) break; }
        if (depth < MIN_DEPTH - 1e-9 || !ok(poly)) { drop(report, ph, 'overlap'); continue; }
        if (polyArea(poly) < 12) { drop(report, ph, 'sliver'); continue; }
        placed.push(poly);
        const type = lotTypeOfPluto(lot);
        if (type === 'vacant') report.vacantTotal++;
        bump(report.placed, ph);
        out.push({
          id: lot.bbl, bbl: lot.bbl, blockId: F.blockId, side: F.side, frontA: fA, frontB: fB, width: w, depth,
          outward: F.outward, type, corner: cornerA || cornerB, poly, block: bi, face: fi, scale: exact,
          cornerEnd: cornerA && cornerB ? 'ab' : cornerA ? 'a' : cornerB ? 'b' : undefined,
          avenue: net.edges[F.edge].cls !== 'street',
          pluto: { cls: lot.cls ?? '', lu: lot.lu ?? '', fl: lot.fl ?? null, yr: lot.yr ?? null, bd: lot.bd ?? null, bf: lot.bf ?? null, rf: lot.rf ?? null, lf: lot.lf! },
        });
      }
    }
  }
  report.vacantTotal += report.vacantFromWedge;
  if (!scales.length) report.scaleRange = [0, 0];
  return { lots: out, report };
}

/**
 * Cut a lot rectangle by the bisector of the corner it touches. `c` is the corner point, `along` the unit direction from the
 * corner along this lot's face, `inward` the unit normal into the block, `deg` the interior angle at the corner.
 */
function bisect(poly: Vec2[], c: Vec2, along: Vec2, inward: Vec2, deg: number, _keep: number): Vec2[] {
  const th = (deg * Math.PI) / 180;
  const e2 = { x: Math.cos(th) * along.x + Math.sin(th) * inward.x, z: Math.cos(th) * along.z + Math.sin(th) * inward.z };
  return clipHalf(poly, c, { x: along.x - e2.x, z: along.z - e2.z });
}
