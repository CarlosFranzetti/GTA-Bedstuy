/**
 * Crisp garment edges (PEOPLE5): the hem of a jacket, hoodie or puffer and the cuff of a sleeve. Both are built from the DRESSED body itself: the outline of the body at a height is
 * measured per angle (a polar profile cut from its triangles), widened a little and smoothed, and the band is lofted along that outline. So the band always stands outside the body (no
 * chips, no diamonds where a bbox ellipse used to sink into a hip) and has the same language everywhere: a flat underside, a hard wall 5 to 11 mm proud of the body, a soft return.
 */
import type { MhLod } from './pedMesh';
import { StripMesh } from './pedLegs';

const TAU = Math.PI * 2;

/** the hit distance of the ray (cx, cz) + t (dx, dz) with the segment P to Q, or -1 */
function rayHit(cx: number, cz: number, dx: number, dz: number, px: number, pz: number, qx: number, qz: number): number {
  const ex = qx - px, ez = qz - pz, den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-12) return -1;
  const wx = px - cx, wz = pz - cz, t = (wx * ez - wz * ex) / den, u = (wx * dz - wz * dx) / den;
  return t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 ? t : -1;
}

/** one cut through the triangles of a LOD at height y: the segments (x0, z0, x1, z1) of the triangles whose three vertices pass `use` */
export function cutSegments(L: MhLod, pos: ArrayLike<number>, y: number, use: (v: number) => boolean): number[] {
  const out: number[] = [], I = L.index;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!use(a) || !use(b) || !use(c)) continue;
    const pts: number[] = [], v = [a, b, c];
    for (let e = 0; e < 3; e++) {
      const p = v[e], q = v[(e + 1) % 3], yp = pos[p * 3 + 1], yq = pos[q * 3 + 1];
      if ((yp - y) * (yq - y) > 0 || yp === yq) continue;
      const f = (y - yp) / (yq - yp);
      pts.push(pos[p * 3] + (pos[q * 3] - pos[p * 3]) * f, pos[p * 3 + 2] + (pos[q * 3 + 2] - pos[p * 3 + 2]) * f);
    }
    if (pts.length >= 4) out.push(pts[0], pts[1], pts[2], pts[3]);
  }
  return out;
}

/** centre (bounding box middle) of a set of segments */
export function centreOf(segs: number[]): { cx: number; cz: number } | null {
  if (!segs.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < segs.length; i += 2) { x0 = Math.min(x0, segs[i]); x1 = Math.max(x1, segs[i]); z0 = Math.min(z0, segs[i + 1]); z1 = Math.max(z1, segs[i + 1]); }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/** the outline of the cuts as radii per angle round (cx, cz); angle a has the direction (cos a, -sin a) in (x, z), so a quarter turn is the front (-z) */
export function polarRadii(segs: number[], cx: number, cz: number, seg: number): number[] {
  const r = new Array<number>(seg).fill(0);
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * TAU, dx = Math.cos(a), dz = -Math.sin(a);
    for (let i = 0; i < segs.length; i += 4) { const t = rayHit(cx, cz, dx, dz, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]); if (t > r[j]) r[j] = t; }
  }
  return r;
}

/** the largest outline over several heights, spread by one neighbour each way and blurred: the radius a band must have to stand outside the body between those heights */
export function outerRadii(L: MhLod, pos: ArrayLike<number>, ys: number[], c: { cx: number; cz: number }, seg: number, use: (v: number) => boolean): number[] {
  const r = new Array<number>(seg).fill(0);
  for (const y of ys) { const p = polarRadii(cutSegments(L, pos, y, use), c.cx, c.cz, seg); for (let j = 0; j < seg; j++) r[j] = Math.max(r[j], p[j]); }
  // a ray that missed (a thin sliver) takes its neighbours' value
  for (let j = 0; j < seg; j++) if (r[j] <= 0) r[j] = Math.max(r[(j + seg - 1) % seg], r[(j + 1) % seg]);
  const m = r.map((_, j) => Math.max(r[(j + seg - 1) % seg], r[j], r[(j + 1) % seg]));
  return m.map((v, j) => Math.max(v, 0.25 * m[(j + seg - 1) % seg] + 0.5 * v + 0.25 * m[(j + 1) % seg]));
}

export interface PolarRow { y: number; cx: number; cz: number; r: number[]; /** vertical part of the normal: 0 wall, -1 faces down, +1 faces up */ up: number }
interface PolarOpts { seg: number; uv: (u: number, row: number) => [number, number]; skin: { j: number[]; w: number[] } }

/** one strip of rows of arbitrary outline: normals are perpendicular to the outline of each row (not an ellipse's), the winding follows them */
export function addPolarStrip(m: StripMesh, rows: PolarRow[], o: PolarOpts): void {
  const base = m.count, seg = o.seg, S = seg + 1;
  rows.forEach((row, i) => {
    const pts: Array<[number, number]> = [];
    for (let j = 0; j < seg; j++) { const a = (j / seg) * TAU; pts.push([row.cx + row.r[j] * Math.cos(a), row.cz - row.r[j] * Math.sin(a)]); }
    for (let j = 0; j <= seg; j++) {
      const jj = j % seg, p = pts[jj], n0 = pts[(jj + seg - 1) % seg], n1 = pts[(jj + 1) % seg];
      let nx = n1[1] - n0[1], nz = -(n1[0] - n0[0]);
      if (nx * (p[0] - row.cx) + nz * (p[1] - row.cz) < 0) { nx = -nx; nz = -nz; }
      const l = Math.hypot(nx, nz) || 1, k = Math.sqrt(Math.max(0, 1 - row.up * row.up));
      m.vertex([p[0], row.y, p[1]], [(nx / l) * k, row.up, (nz / l) * k], o.uv(j / seg, i), o.skin.j, o.skin.w);
    }
  });
  let flip = false;
  if (rows.length > 1) {
    const a = base + Math.floor(seg / 8), b = a + 1, c = a + S, p = (v: number): number[] => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
    const A = p(a), B = p(b), C = p(c), e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const gn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    flip = gn[0] * m.nrm[a * 3] + gn[1] * m.nrm[a * 3 + 1] + gn[2] * m.nrm[a * 3 + 2] < 0;
  }
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * S + j, b = a + 1, c = a + S, d = c + 1;
    if (flip) m.idx.push(a, c, b, b, c, d); else m.idx.push(a, b, c, b, d, c);
  }
}

/** a body vertex that belongs to the torso, hips or legs (not an arm): what a hem must stand outside of */
export const notArm = (L: MhLod) => (i: number): boolean => { let w = 0; for (let k = 0; k < 4; k++) { const j = L.joints[i * 4 + k]; if (j >= 4 && j <= 7) w += L.weights[i * 4 + k]; } return w < 0.3; };
/** a body vertex of one arm (side -1 = the character's left = bones 4, 5) */
export const armOf = (L: MhLod, side: -1 | 1) => (i: number): boolean => { let w = 0; const a = side < 0 ? 4 : 6; for (let k = 0; k < 4; k++) { const j = L.joints[i * 4 + k]; if (j === a || j === a + 1) w += L.weights[i * 4 + k]; } return w >= 0.5; };

/**
 * The rows of the hem band of a top at `hemTop`: a flat underside, a wall `o` proud of the body, a soft return that settles back into the body above. Every row is the largest outline of the
 * body within 2 cm of its height (so it stands outside the body between the sample heights) plus a margin that falls from `o` to a few millimetres.
 */
export function hemRows(L: MhLod, pos: ArrayLike<number>, hemTop: number, o: number, seg: number, hi: boolean): { rows: PolarRow[][]; c: { cx: number; cz: number } } | null {
  const use = notArm(L), c = centreOf(cutSegments(L, pos, hemTop + 0.04, use));
  if (!c) return null;
  const at = (y: number, g: number, up: number, lo = 0.02, hiy = 0.02): PolarRow => {
    const ys = [y - lo, y - lo / 2, y, y + hiy / 2, y + hiy], r = outerRadii(L, pos, ys, c, seg, use);
    return { y, cx: c.cx, cz: c.cz, r: r.map((v) => v + g), up };
  };
  const wall = at(hemTop + 0.006, o, 0, 0.016, 0.03);              // the radius of the wall: the body between just under the hem and 3 cm above it
  const lo = { ...wall, y: hemTop }, top = { ...wall, y: hemTop + 0.012 }, inner = { ...lo, r: lo.r.map((v) => v - 0.014), up: -1 };
  const ret: PolarRow[] = [{ ...top, up: 0.1 }];
  const ys = hi ? [0.05, 0.13] : [0.07, 0.13];
  ys.forEach((d, i) => {
    const g = o + (0.004 - o) * (d - 0.012) / (0.13 - 0.012);
    const row = at(hemTop + d, g, 0, 0.03, 0.03);
    // never inside the row below it by more than the body narrows (the return follows the body, it does not dive)
    ret.push({ ...row, up: i === ys.length - 1 ? 0 : 0.02 });
  });
  return { rows: [[{ ...lo, up: -1 }, inner], [lo, top], ret], c };
}

/**
 * The cuff of a sleeve: the dressed arm is cut at heights above `yEnd` (the painted sleeve end); a lip `step` proud of the arm there, a flat underside facing the hand, a hard wall, a soft
 * return into the sleeve. Rows follow the arm's own outline and axis (per row), so the cuff stands on the arm however it is bent.
 */
export function cuffRows(L: MhLod, pos: ArrayLike<number>, side: -1 | 1, yEnd: number, height: number, step: number, seg: number): PolarRow[][] | null {
  const use = armOf(L, side);
  const at = (y: number, g: number, up: number): PolarRow | null => {
    const segs = cutSegments(L, pos, y, use), c = centreOf(segs);
    if (!c) return null;
    const rs = [y - 0.012, y, y + 0.012].map((q) => cutSegments(L, pos, q, use)), r = new Array<number>(seg).fill(0);
    for (const s of rs) { const p = polarRadii(s, c.cx, c.cz, seg); for (let j = 0; j < seg; j++) r[j] = Math.max(r[j], p[j]); }
    for (let j = 0; j < seg; j++) if (r[j] <= 0) r[j] = Math.max(r[(j + seg - 1) % seg], r[(j + 1) % seg]);
    const m = r.map((_, j) => Math.max(r[(j + seg - 1) % seg], r[j], r[(j + 1) % seg]));
    return { y, cx: c.cx, cz: c.cz, r: m.map((v) => v + g), up };
  };
  const bottom = at(yEnd + 0.012, step, -1), topRow = at(yEnd + height, step, 0), back = at(yEnd + height + 0.05, 0.003, 0);
  if (!bottom || !topRow || !back) return null;
  // the wall's own bottom edge sits at yEnd with the radius of the first row (a cone that follows the arm), the underside returns inside the skin
  const lo: PolarRow = { ...bottom, y: yEnd, up: 0 }, under: PolarRow = { ...bottom, y: yEnd, up: -1, r: bottom.r.map((v) => v - step - 0.003) }, underOuter: PolarRow = { ...lo, up: -1 };
  return [[underOuter, under], [lo, topRow], [{ ...topRow, up: 0.1 }, back]];
}

/**
 * A sleeve is a straight cut, not a sausage: the clothed part of each arm (from `yTop` down to `yBot`) is rescaled about its own axis so that its radius never grows going down. The radius of
 * each 2 cm band (mean distance of its vertices from the band's centre) is replaced by a running minimum from the top, softened, and every vertex follows its band's ratio.
 */
export function straightenArms(L: MhLod, pos: Float32Array, yTop: number, yBot: number, strength: number): void {
  if (!(yTop > yBot + 0.06)) return;
  const BIN = 0.02, nb = Math.ceil((yTop - yBot) / BIN) + 1, n = pos.length / 3;
  for (const side of [-1, 1] as const) {
    const use = armOf(L, side), sum = new Float64Array(nb), cxs = new Float64Array(nb), czs = new Float64Array(nb), cnt = new Float64Array(nb), r = new Float64Array(nb);
    const bin = (y: number): number => (yTop - y) / BIN;
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1];
      if (y > yTop || y < yBot || !use(i) || pos[i * 3] * side < 0) continue;
      const b = Math.min(nb - 1, Math.round(bin(y)));
      cxs[b] += pos[i * 3]; czs[b] += pos[i * 3 + 2]; cnt[b]++;
    }
    for (let b = 0; b < nb; b++) if (cnt[b]) { cxs[b] /= cnt[b]; czs[b] /= cnt[b]; }
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1];
      if (y > yTop || y < yBot || !use(i) || pos[i * 3] * side < 0) continue;
      const b = Math.min(nb - 1, Math.round(bin(y)));
      sum[b] += Math.hypot(pos[i * 3] - cxs[b], pos[i * 3 + 2] - czs[b]);
    }
    let have = 0;
    for (let b = 0; b < nb; b++) { r[b] = cnt[b] ? sum[b] / cnt[b] : 0; if (r[b] > 0) have++; }
    if (have < 3) continue;
    // empty bands take the value above them, then the running minimum from the top
    for (let b = 0; b < nb; b++) if (r[b] <= 0) r[b] = b ? r[b - 1] : r[(r.findIndex((v) => v > 0))];
    const e = new Float64Array(nb);
    e[0] = r[0];
    for (let b = 1; b < nb; b++) e[b] = Math.min(r[b], e[b - 1]);
    // the clothed arm tapers a little from the shoulder to the cuff (a straight cut): a line from the top band to 88 % of itself at the cuff, never above the running minimum
    for (let b = 0; b < nb; b++) e[b] = Math.min(e[b], r[0] * (1 - 0.12 * b / (nb - 1)));
    for (let b = 0; b < nb; b++) { const f = Math.min(1, Math.max(0.72, e[b] / Math.max(1e-6, r[b]))); e[b] = f; }
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1];
      if (y > yTop + 0.02 || y < yBot || !use(i) || pos[i * 3] * side < 0) continue;
      const bf = Math.max(0, Math.min(nb - 1, bin(y))), b0 = Math.floor(bf), b1 = Math.min(nb - 1, b0 + 1), t = bf - b0;
      const fin = y > yTop ? 1 - (y - yTop) / 0.02 : 1, f = 1 + ((e[b0] * (1 - t) + e[b1] * t) - 1) * strength * fin;
      const cx = cxs[b0] * (1 - t) + cxs[b1] * t, cz = czs[b0] * (1 - t) + czs[b1] * t;
      pos[i * 3] = cx + (pos[i * 3] - cx) * f; pos[i * 3 + 2] = cz + (pos[i * 3 + 2] - cz) * f;
    }
  }
}
