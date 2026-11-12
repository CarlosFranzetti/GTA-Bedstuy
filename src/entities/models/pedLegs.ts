/**
 * Trouser legs as a cut garment (PEOPLE4). The decimated MakeHuman legs are a handful of irregular rings (thigh swell, knee, calf, ankle), which under
 * a cloth offset read as two balloons fused into one bag. For every person in trousers the legs of the skin are cut away from just below the crotch
 * and replaced by one clean tube per leg: an elliptical section, one straight taper from the seat to the hem (no swell, no pinch, no calf), two
 * columns with daylight between them, and a hem with a real edge (a cuff lip standing proud of the leg, a flat step, a hard-shaded wall).
 * The tube takes its UVs in the thigh and shin tiles of the skin atlas with ONE mapping for every LOD, so the one baked map fits all three.
 * Bare legs (shorts, skirts, dresses) keep the base mesh.
 */
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec } from '@/textures/painters/ped';
import type { BodyType } from './pedBodyTypes';
import { SK_TILES } from '@/textures/painters/pedSkinPaint';

export type LegDetail = 'hi' | 'mid' | 'far';
export const COVERED_LEGS: ReadonlyArray<PedSpec['bottom']['kind']> = ['jeans', 'trousers', 'cargo', 'sweats', 'leggings'];
export const isCoveredLeg = (k: PedSpec['bottom']['kind']): boolean => COVERED_LEGS.includes(k);

/** what the shoes need to know about the trouser legs they stand under (per shape, spec and LOD) */
export interface LegTube {
  /** axis x of the left leg (negative) and right leg (positive); z of the axis at the hem; hem half extents; height of the hem's lower edge */
  xL: number; xR: number; cz: number; rx: number; rz: number; yHem: number; /** the seat fold (crotch) and the knee: the stations the leg's taper is measured between */ ySeat: number; yKnee: number;
}

const TAU = Math.PI * 2, U_SCALE = 0.9;
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** per garment: total taper seat to hem (one straight line), and the leg's size against the measured thigh */
const CUT: Record<string, { taper: number; size: number }> = {
  jeans: { taper: 0.15, size: 1.04 }, trousers: { taper: 0.15, size: 1.06 }, cargo: { taper: 0.08, size: 1.14 }, sweats: { taper: 0.08, size: 1.12 }, leggings: { taper: 0.12, size: 0.92 },
};
/** the hem's lower edge above the ground (the brief: 2 to 4 cm), the cuff lip's height and how far it stands proud of the leg */
export const HEM_Y = 0.03, CUFF_H = 0.03, CUFF_OUT = 0.008;
/** the thigh never exceeds this share of the hip width (the extra mass of a heavy build goes to the seat and the belly) */
export const THIGH_OF_HIP = 0.55;

/** a growing mesh with explicit normals: separate strips give the hard edges, rows inside one strip are smooth */
export class StripMesh {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; jnt: number[] = []; wgt: number[] = []; idx: number[] = [];
  vertex(p: [number, number, number], n: [number, number, number], uv: [number, number], j: number[], w: number[]): number {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0] / l, n[1] / l, n[2] / l); this.uv.push(uv[0], uv[1]);
    for (let k = 0; k < 4; k++) { this.jnt.push(j[k] ?? 0); this.wgt.push(w[k] ?? 0); }
    return this.pos.length / 3 - 1;
  }
  get count(): number { return this.pos.length / 3; }
}
export interface Row {
  y: number; rx: number; rz: number; cx: number; cz: number;
  /** vertical part of the normal (0 = a wall, +1 = faces up, -1 = faces down) */
  up: number;
}
interface StripOpts { seg: number; mir: number; uv: (u: number, row: number) => [number, number]; skin: (y: number) => { j: number[]; w: number[] } }
/** one strip of elliptical rows. Angle u runs 0..1 from the seam on the inner side of the leg through the front (u = 0.25), the outside, the back, back to the inside. */
export function addStrip(m: StripMesh, rows: Row[], o: StripOpts): void {
  const base = m.count, S = o.seg + 1;
  rows.forEach((r, i) => {
    const sk = o.skin(r.y);
    for (let j = 0; j <= o.seg; j++) {
      const u = j / o.seg, a = u * TAU, c = Math.cos(a), s = Math.sin(a);
      const nx = o.mir * c / Math.max(1e-4, r.rx), nz = -s / Math.max(1e-4, r.rz), nl = Math.hypot(nx, nz) || 1;
      const k = Math.sqrt(Math.max(0, 1 - r.up * r.up));
      m.vertex([r.cx + o.mir * r.rx * c, r.y, r.cz - r.rz * s], [(nx / nl) * k, r.up, (nz / nl) * k], o.uv(u, i), sk.j, sk.w);
    }
  });
  // winding: faces point along the analytic normals (checked on the first quad)
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => { if (flip) m.idx.push(a, c, b, b, c, d); else m.idx.push(a, b, c, b, d, c); };
  let flip = false;
  if (rows.length > 1) {
    const p = (v: number): number[] => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]], j = Math.floor(o.seg / 8) + 0, a = base + j, b = a + 1, c = base + S + j;
    const A = p(a), B = p(b), C = p(c), e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const gn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    // front-face normal of (a, b, c) is e1 x e2; compare with the stored vertex normal at a
    flip = gn[0] * m.nrm[a * 3] + gn[1] * m.nrm[a * 3 + 1] + gn[2] * m.nrm[a * 3 + 2] < 0;
  }
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j < o.seg; j++) { const a = base + i * S + j; quad(a, a + 1, a + S, a + S + 1, flip); }
}

/** the vertex arrays of a LOD after the legs were replaced: nothing but what is still referenced */
function compact(pos: Float32Array, nrm: Float32Array, uv: Float32Array, jnt: Uint16Array, wgt: Float32Array, idx: Uint32Array): MhLod {
  const n = pos.length / 3, map = new Int32Array(n).fill(-1);
  let m = 0;
  for (let i = 0; i < idx.length; i++) if (map[idx[i]] < 0) map[idx[i]] = m++;
  const P = new Float32Array(m * 3), N = new Float32Array(m * 3), U = new Float32Array(m * 2), J = new Uint16Array(m * 4), W = new Float32Array(m * 4), I = new Uint32Array(idx.length);
  for (let i = 0; i < n; i++) {
    const o = map[i]; if (o < 0) continue;
    P.set(pos.subarray(i * 3, i * 3 + 3), o * 3); N.set(nrm.subarray(i * 3, i * 3 + 3), o * 3); U.set(uv.subarray(i * 2, i * 2 + 2), o * 2); J.set(jnt.subarray(i * 4, i * 4 + 4), o * 4); W.set(wgt.subarray(i * 4, i * 4 + 4), o * 4);
  }
  for (let i = 0; i < idx.length; i++) I[i] = map[idx[i]];
  return { position: P, normal: N, uv: U, joints: J, weights: W, index: I };
}

const legWeight = (L: MhLod, i: number): number => { let t = 0; for (let k = 0; k < 4; k++) if (L.joints[i * 4 + k] >= 8) t += L.weights[i * 4 + k]; return t; };

/** the u / v of a chart: thigh above the knee, shin below; the same mapping on every LOD (u is the angle, v the height inside a FIXED range) */
function tileUv(rect: { x: number; y: number; w: number; h: number }, u: number, ft: number): [number, number] {
  // u runs 0..1 round the leg; the tile keeps its last tenth free for the triangles of the thigh stub that straddle the seam
  const px = rect.x + 0.5 + Math.min(1, Math.max(0, u * U_SCALE)) * (rect.w - 1), py = rect.y + 0.5 + (1 - Math.min(1, Math.max(0, ft))) * (rect.h - 1);
  return [px / 512, 1 - py / 512];
}

/**
 * Replace the legs of a dressed LOD by cut trousers. `pos` / `nrm` are the dressed (body type applied) positions and normals of `L`; the result has its own arrays.
 * The seat is the crotch: nothing below it is wider than the tube there.
 */
export function legTubes(s: MhShape, spec: PedSpec, L: MhLod, pos: Float32Array, nrm: Float32Array, bt: BodyType, legK: number, detail: LegDetail): { lod: MhLod; tube: LegTube } {
  const R = s.rig, lm = s.landmarks, K = lm.crownY / 1.78, kind = spec.bottom.kind, cut = CUT[kind] ?? CUT.jeans;
  const hipX = Math.abs(R.hipL[0]) * legK, kneeY = R.kneeL[1], anY = lm.ankleY, hipY = R.hipL[1], n = pos.length / 3;
  // the seat fold: the lowest point between the legs of the base mesh (where the thighs part)
  let crotchY = Infinity;
  for (let i = 0; i < n; i++) { const y = L.position[i * 3 + 1]; if (y > kneeY + 0.12 * K && y < hipY && Math.abs(L.position[i * 3]) < 0.016 && legWeight(L, i) > 0.4) crotchY = Math.min(crotchY, y); }
  if (!isFinite(crotchY)) crotchY = hipY - 0.17 * K;
  const ySeat = crotchY, yh = HEM_Y;
  // measured thigh of the base shape near the seat (its own rings), the hip width of the dressed body
  const rs = [...s.legRings.thigh, ...s.legRings.shin].filter((r) => r).sort((p, q) => p[0] - q[0]);
  const ringAt = (y: number): number[] => { let i = 1; while (i < rs.length - 1 && rs[i][0] < y) i++; const A = rs[i - 1], B = rs[i], t = Math.min(1, Math.max(0, (y - A[0]) / Math.max(1e-6, B[0] - A[0]))); return [0, 1, 2, 3, 4].map((k) => (A[k] ?? 0) * (1 - t) + (B[k] ?? 0) * t); };
  const th = ringAt(ySeat - 0.08 * K), an = ringAt(anY + 0.06);
  // the hip half width of the shape (its own pelvis rings) with the body type's hips: the heavier builds carry that mass in the seat, not in the thigh
  const hipHalf = Math.max(...s.hipRings.map((r) => r[1])) * Math.max(1, bt.hips) * 1.12;
  // one straight taper from the seat to the hem, gentler on a short leg so the knee stays within 8 % of the seat
  const taper = Math.min(cut.taper, 0.066 / ((ySeat - kneeY) / (ySeat - yh)));
  const cx = hipX, gapMin = 0.0175;
  let rxS = ((th[1] + th[3] * 0.9) / 2) * cut.size * (1 + (bt.legs - 1) * 0.7);
  // the legs part at the crotch and are 3.5 cm apart by the knee (the straight taper does the rest down to the hem)
  rxS = Math.min(rxS, (cx - gapMin) / (1 - taper * 0.34), THIGH_OF_HIP * hipHalf);
  const rzS = Math.max(rxS * 1.06, Math.min(th[3] * 0.95 * cut.size, rxS * 1.22));
  const czS = th[2], czA = an[2];
  const radius = (y: number): number => 1 - taper * Math.min(1, Math.max(0, (ySeat - y) / (ySeat - yh)));
  const czAt = (y: number): number => lerp(czS, czA, Math.min(1, Math.max(0, (ySeat - y) / (ySeat - anY))));
  // cut: every triangle with a leg vertex below the seat goes (a foot triangle stays: the shoes' own cut removes it, the far LOD keeps it)
  const footCut = anY + 0.035, yDrop = ySeat + 0.045, drop = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < yDrop && legWeight(L, i) >= 0.5) drop[i] = 1;
  const keep: number[] = []; let yBoundary = ySeat;
  const removed: number[] = [];
  for (let t = 0; t < L.index.length; t += 3) {
    const a = L.index[t], b = L.index[t + 1], c = L.index[t + 2];
    const any = drop[a] || drop[b] || drop[c], foot = pos[a * 3 + 1] < footCut && pos[b * 3 + 1] < footCut && pos[c * 3 + 1] < footCut;
    if (any && !foot) removed.push(a, b, c); else keep.push(a, b, c);
  }
  for (const v of removed) if (!drop[v]) yBoundary = Math.max(yBoundary, pos[v * 3 + 1]);
  const yTop = yBoundary + 0.006, chartTop = hipY + 0.08;
  // the pelvis above the cut is wider than the leg: from the seat up the tube flares OUTWARD (the inner edge stays put, so the gap between the legs is kept) to meet the
  // old surface at the cut, so the leg grows out of the hip instead of the hip hanging over the leg like a skirt
  const P = new Float32Array(pos), N = new Float32Array(nrm);
  let flareX = 0, flareZ = 0;
  for (let i = 0; i < n; i++) {
    if (drop[i] || legWeight(L, i) < 0.5) continue;
    const y = P[i * 3 + 1];
    if (y < yBoundary - 0.07 || y > yBoundary + 0.04) continue;
    const sd = P[i * 3] < 0 ? -1 : 1;
    flareX = Math.max(flareX, sd * (P[i * 3] - sd * cx) - rxS); flareZ = Math.max(flareZ, Math.abs(P[i * 3 + 2] - czS) - rzS);
  }
  flareX = Math.min(0.05, Math.max(0, flareX)); flareZ = Math.min(0.03, Math.max(0, flareZ));
  // rows of the tubes
  const seg = detail === 'hi' ? 12 : detail === 'mid' ? 8 : 5, cuffTop = yh + CUFF_H;
  const ySt = ySeat - 0.02, thighY = detail === 'hi' ? [yTop, lerp(yTop, ySt, 0.5), ySt, lerp(ySt, kneeY, 0.5), kneeY + 0.055, kneeY] : detail === 'mid' ? [yTop, ySt, kneeY + 0.05, kneeY] : [yTop, ySt, kneeY];
  const shinY = detail === 'hi' ? [kneeY, kneeY - 0.055, lerp(kneeY, cuffTop, 0.55), cuffTop] : detail === 'mid' ? [kneeY, kneeY - 0.05, cuffTop] : [kneeY, yh];
  const out = new StripMesh();
  const hemR = radius(yh);
  for (const side of [-1, 1] as const) {
    const ax = side * cx, mir = side < 0 ? 1 : -1, b0 = side < 0 ? 8 : 10, b1 = b0 + 1;
    const skin = (y: number): { j: number[]; w: number[] } => {
      const w1 = sstep(kneeY + 0.05, kneeY - 0.05, y), wh = 0.4 * sstep(ySeat - 0.02, ySeat + 0.12, y), top = 1 - wh;
      return { j: [b0, b1, 1, 0], w: [top * (1 - w1), top * w1, wh, 0] };
    };
    const row = (y: number, grow = 0, up = 0): Row => {
      const k = radius(y), fl = sstep(ySt, yTop, y), dx = flareX * fl;
      return { y, rx: rxS * k + grow + dx, rz: rzS * k + grow + flareZ * fl, cx: ax + side * dx, cz: czAt(y), up };
    };
    // slope of the wall: a tapering leg leans its normal down a little
    const slope = taper * rxS / (ySeat - yh);
    const wall = (ys: number[], grow = 0): Row[] => ys.map((y) => ({ ...row(y, grow), up: slope }));
    addStrip(out, wall(thighY), { seg, mir, skin, uv: (u, i) => tileUv(SK_TILES.thigh, u, (thighY[i] - kneeY) / (chartTop - kneeY)) });
    const shinFt = (y: number): number => (y - yh) / (kneeY - yh);
    addStrip(out, wall(shinY), { seg, mir, skin, uv: (u, i) => tileUv(SK_TILES.shin, u, shinFt(shinY[i])) });
    // the hem: a flat step out to the cuff lip, the lip's wall, and its underside, each its own strip so the edges are hard
    if (detail === 'far') continue;
    const flat = (g0: number, g1: number, up: number): Row[] => [{ ...row(cuffTop, g0), up }, { ...row(cuffTop, g1), up }];
    addStrip(out, flat(0, CUFF_OUT, 1), { seg, mir, skin, uv: (u) => tileUv(SK_TILES.shin, u, shinFt(cuffTop)) });
    addStrip(out, [{ ...row(cuffTop, CUFF_OUT), up: 0 }, { ...row(yh, CUFF_OUT), up: 0 }], { seg, mir, skin, uv: (u, i) => tileUv(SK_TILES.shin, u, i ? 0 : shinFt(cuffTop)) });
    addStrip(out, [{ ...row(yh, CUFF_OUT), up: -1 }, { ...row(yh, -0.004), up: -1 }], { seg, mir, skin, uv: (u) => tileUv(SK_TILES.shin, u, 0) });
  }
  // the thigh triangles that stay above the cut (the top of the old leg, in the old chart of the thigh tile) are re-charted with the tube's own mapping, so the two never overlap
  const reloc: number[] = [], rest: number[] = [];
  for (let t = 0; t < keep.length; t += 3) {
    const w = new Float32Array(12);
    for (let k = 0; k < 3; k++) for (let q = 0; q < 4; q++) w[L.joints[keep[t + k] * 4 + q]] += L.weights[keep[t + k] * 4 + q] / 3;
    let b = 0; for (let j = 1; j < 12; j++) if (w[j] > w[b]) b = j;
    if (b >= 8 && !(pos[keep[t] * 3 + 1] < footCut && pos[keep[t + 1] * 3 + 1] < footCut && pos[keep[t + 2] * 3 + 1] < footCut)) reloc.push(t); else rest.push(keep[t], keep[t + 1], keep[t + 2]);
  }
  const stub = new StripMesh();
  for (const t of reloc) {
    const cxs = (P[keep[t] * 3] + P[keep[t + 1] * 3] + P[keep[t + 2] * 3]) / 3, sd = cxs < 0 ? -1 : 1, mir = sd < 0 ? 1 : -1, us: number[] = [], vs: number[] = [];
    for (let k = 0; k < 3; k++) {
      const v = keep[t + k], y = P[v * 3 + 1], q = radius(Math.min(y, ySeat)), dx = (P[v * 3] - sd * cx) / (rxS * q), dz = (P[v * 3 + 2] - czAt(Math.min(y, ySeat))) / (rzS * q);
      us.push((((Math.atan2(mir * dx, dz) - Math.PI / 2) % TAU) + TAU) % TAU / TAU); vs.push((y - kneeY) / (chartTop - kneeY));
    }
    if (Math.max(...us) - Math.min(...us) > 0.5) for (let k = 0; k < 3; k++) if (us[k] < 0.5) us[k] += 1;
    if (Math.max(...us) - Math.min(...us) > 0.6) { const m = us.reduce((a, b) => a + b, 0) / 3; for (let k = 0; k < 3; k++) us[k] = m; }
    for (let k = 0; k < 3; k++) {
      const v = keep[t + k], uvk = tileUv(SK_TILES.thigh, us[k], vs[k]);
      stub.idx.push(stub.vertex([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], uvk, [L.joints[v * 4], L.joints[v * 4 + 1], L.joints[v * 4 + 2], L.joints[v * 4 + 3]], [L.weights[v * 4], L.weights[v * 4 + 1], L.weights[v * 4 + 2], L.weights[v * 4 + 3]]));
    }
  }
  out.pos.push(...stub.pos); out.nrm.push(...stub.nrm); out.uv.push(...stub.uv); out.jnt.push(...stub.jnt); out.wgt.push(...stub.wgt);
  const tubeIdx = out.idx.length, stubBase = out.count - stub.count;
  for (const i of stub.idx) out.idx.push(i + stubBase);
  void tubeIdx;
  // assemble: kept old vertices (with the join adjustment) + the tubes
  const m = out.count, total = n + m;
  const pos2 = new Float32Array(total * 3), nrm2 = new Float32Array(total * 3), uv2 = new Float32Array(total * 2), j2 = new Uint16Array(total * 4), w2 = new Float32Array(total * 4);
  pos2.set(P); nrm2.set(N); uv2.set(L.uv); j2.set(L.joints); w2.set(L.weights);
  pos2.set(out.pos, n * 3); nrm2.set(out.nrm, n * 3); uv2.set(out.uv, n * 2); j2.set(out.jnt, n * 4); w2.set(out.wgt, n * 4);
  const idx = new Uint32Array(rest.length + out.idx.length);
  idx.set(rest); for (let i = 0; i < out.idx.length; i++) idx[rest.length + i] = out.idx[i] + n;
  const lod = compact(pos2, nrm2, uv2, j2, w2, idx);
  return { lod, tube: { xL: -cx, xR: cx, cz: czAt(yh + 0.05), rx: rxS * hemR, rz: rzS * hemR, yHem: yh, ySeat, yKnee: kneeY } };
}
