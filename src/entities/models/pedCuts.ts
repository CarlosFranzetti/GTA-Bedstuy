/**
 * Crisp garment edges (PEOPLE5): the hem of a jacket, hoodie or puffer and the cuff of a sleeve. Both are built from the DRESSED body itself: the outline of the body at a height is
 * measured per angle (a polar profile cut from its triangles), widened a little and smoothed, and the band is lofted along that outline. So the band always stands outside the body (no
 * chips, no diamonds where a bbox ellipse used to sink into a hip) and has the same language everywhere: a flat underside, a hard wall 5 to 11 mm proud of the body, a soft return.
 */
import { BufferAttribute, type BufferGeometry } from 'three';
import type { MhLod } from './pedMesh';
import { StripMesh } from './pedLegs';

const TAU = Math.PI * 2;

/** the hit distance of the ray (cx, cz) + t (dx, dz) with the segment P to Q, or -1 */
export function rayHit(cx: number, cz: number, dx: number, dz: number, px: number, pz: number, qx: number, qz: number): number {
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

/**
 * The radius a ring of `seg` rays must have to stand outside the body between the heights `ys`. PEOPLE8: the old version dilated by a neighbour each way and blurred, which on a wide, shallow
 * hip (2:1) turned the outline into a circle 6 to 8 cm off the body front and back (the "hem box"). Now the outline is sampled on 4 x seg fine rays (cut triangles plus every vertex in the
 * band), the ring takes the fine value on its own rays, and each chord of the ring is raised only as far as needed to clear the fine samples between its two ends (a circumscribed polygon).
 */
export function outerRadii(L: MhLod, pos: ArrayLike<number>, ys: number[], c: { cx: number; cz: number }, seg: number, use: (v: number) => boolean): number[] {
  const N = seg * 4, fine = new Array<number>(N).fill(0);
  for (const y of ys) { const p = polarRadii(cutSegments(L, pos, y, use), c.cx, c.cz, N); for (let j = 0; j < N; j++) fine[j] = Math.max(fine[j], p[j]); }
  const yLo = Math.min(...ys), yHi = Math.max(...ys), verts: Array<[number, number]> = [];      // [angle in turns, radius]
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1];
    if (y < yLo || y > yHi || !use(i)) continue;
    const dx = pos[i * 3] - c.cx, dz = pos[i * 3 + 2] - c.cz, rv = Math.hypot(dx, dz);
    if (rv < 1e-4) continue;
    verts.push([(((Math.atan2(-dz, dx) / TAU) % 1) + 1) % 1, rv]);
  }
  for (let j = 0; j < N; j++) if (fine[j] <= 0) fine[j] = Math.max(fine[(j + N - 1) % N], fine[(j + 1) % N]);
  // the samples a chord must clear: fine rays and vertices, by turns
  const samples: Array<[number, number]> = fine.map((r, j) => [j / N, r] as [number, number]).concat(verts);
  const r = new Array<number>(seg);
  for (let j = 0; j < seg; j++) r[j] = Math.max(fine[(j * 4) % N], fine[(j * 4 + N - 1) % N] * 0.98, fine[(j * 4 + 1) % N] * 0.98);
  const byEdge: Array<Array<[number, number]>> = Array.from({ length: seg }, () => []);
  for (const [t, rad] of samples) { const e = Math.min(seg - 1, Math.floor(t * seg)); byEdge[e].push([t * seg - e, rad]); }
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let e = 0; e < seg; e++) {
      const e1 = (e + 1) % seg;
      const a0 = (e / seg) * TAU, a1 = ((e + 1) / seg) * TAU;
      const px = r[e] * Math.cos(a0), pz = -r[e] * Math.sin(a0), qx = r[e1] * Math.cos(a1), qz = -r[e1] * Math.sin(a1);
      for (const [f, rad] of byEdge[e]) {
        const phi = a0 + f * (a1 - a0), t = rayHit(0, 0, Math.cos(phi), -Math.sin(phi), px, pz, qx, qz);
        if (t > 0 && t < rad - 1e-4) { const k = Math.min(1.12, rad / t); r[e] *= k; r[e1] *= k; moved = true; break; }
      }
    }
    if (!moved) break;
  }
  return r;
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

/** how a top ends: a thin rolled edge (shirt, jacket, cardigan), a ribbed band that pulls in (hoodie, track jacket, bomber), a soft rounded baffle (puffer) */
export type HemStyle = 'roll' | 'rib' | 'baffle';

/**
 * The rows of the hem of a top at `hemTop` (PEOPLE8). Every row is the outline of the body at its own height plus a margin `g`, so the hem follows the torso surface and never flares: a flat
 * underside tucked inside the body, then a profile per style, all of it between 4 and 12 mm off the body and gone into it within 6 to 9 cm. `o` is the wall margin of the style.
 */
export function hemRows(L: MhLod, pos: ArrayLike<number>, hemTop: number, o: number, seg: number, hi: boolean, style: HemStyle = 'roll'): { rows: PolarRow[][]; c: { cx: number; cz: number } } | null {
  const use = notArm(L), c = centreOf(cutSegments(L, pos, hemTop + 0.04, use));
  if (!c) return null;
  const at = (d: number, g: number, up: number, w = 0.012): PolarRow => {
    const y = hemTop + d, ys = [y - w, y - w / 2, y, y + w / 2, y + w], r = outerRadii(L, pos, ys, c, seg, use);
    return { y, cx: c.cx, cz: c.cz, r: r.map((v) => Math.max(0.02, v + g)), up };
  };
  // [height above the hem, margin off the body, vertical part of the normal]
  const prof: Array<[number, number, number]> = style === 'baffle'
    ? (hi ? [[0, -0.002, -0.6], [0.011, o * 0.8, -0.3], [0.03, o, 0], [0.049, o * 0.85, 0.35], [0.066, 0.005, 0.15], [0.09, 0.003, 0]] : [[0, -0.002, -0.6], [0.015, o * 0.9, -0.2], [0.04, o * 0.9, 0.3], [0.08, 0.004, 0]])
    : style === 'rib'
      ? (hi ? [[0, 0.004, 0], [0.02, o * 0.8, 0], [0.044, o * 0.8, 0], [0.052, o * 1.25, 0.4], [0.08, 0.003, 0]] : [[0, 0.004, 0], [0.045, o * 0.8, 0], [0.054, o * 1.25, 0.4], [0.085, 0.003, 0]])
      : (hi ? [[0, o * 0.7, 0], [0.01, o, 0], [0.032, o * 0.5, 0.05], [0.06, 0.003, 0]] : [[0, o * 0.7, 0], [0.012, o, 0], [0.05, 0.003, 0]]);
  const rows = prof.map(([d, g, up]) => at(d, g, up));
  // the flat underside: from the lowest ring in to 1.4 cm inside the body, so nothing shows between the hem and the trousers
  const first = rows[0], under: PolarRow = { ...first, up: -1, r: first.r.map((v) => Math.max(0.02, v - 0.014)) };
  return { rows: [[{ ...first, up: -1 }, under], rows], c };
}

/** a sleeve ends in a ribbed ring (hoodie, track jacket, sweater, bomber, puffer), a flat band (shirt, blazer, jacket) or, short, a plain hem */
export type CuffStyle = 'rib' | 'flat' | 'hem';

/**
 * The cuff of a sleeve (PEOPLE8): a ring as wide as the sleeve (a ribbed cuff 3 mm proud, a flat shirt cuff 2 mm), 3 to 4 cm tall and round in section (more rays, a rounded bead), with a short
 * underside tucked into the arm so the hand comes out of the inside. Rows follow the arm's own outline and axis per row, so the cuff stands on the arm however it is bent. `yEnd` is the painted
 * sleeve end; `height` is the cuff's height; `step` is the margin of the wall off the arm.
 */
export function cuffRows(L: MhLod, pos: ArrayLike<number>, side: -1 | 1, yEnd: number, height: number, step: number, seg: number, style: CuffStyle = 'rib'): PolarRow[][] | null {
  const use = armOf(L, side);
  const at = (y: number, g: number, up: number): PolarRow | null => {
    const c = centreOf(cutSegments(L, pos, y, use));
    if (!c) return null;
    const r = outerRadii(L, pos, [y - 0.01, y, y + 0.01], c, seg, use);
    return { y, cx: c.cx, cz: c.cz, r: r.map((v) => Math.max(0.012, v + g)), up };
  };
  // [height above the cuff's lower edge, margin, vertical part of the normal]
  const prof: Array<[number, number, number]> = style === 'rib'
    ? [[0, step * 0.4, -0.5], [0.006, step, -0.2], [height * 0.5, step * 1.05, 0], [height - 0.006, step, 0.2], [height + 0.004, step * 0.5, 0.5], [height + 0.03, 0.001, 0]]
    : style === 'flat'
      ? [[0, step * 0.8, 0], [height, step * 0.8, 0], [height + 0.004, step * 1.5, 0.6], [height + 0.03, 0.001, 0]]
      : [[0, step * 0.6, 0], [height, step * 0.6, 0.05], [height + 0.03, 0.001, 0]];
  const rows: PolarRow[] = [];
  for (const [d, g, up] of prof) { const row = at(yEnd + d, g, up); if (!row) return null; rows.push(row); }
  const first = rows[0], under: PolarRow = { ...first, up: -1, r: first.r.map((v) => Math.max(0.01, v - 0.012)) };
  return [[{ ...first, up: -1 }, under], rows];
}

/**
 * A sleeve is a straight cut, not a sausage: the clothed part of each arm (from `yTop` down to `yBot`) is rescaled about its own axis so that its radius never grows going down. The radius of
 * each 2 cm band (mean distance of its vertices from the band's centre) is replaced by a running minimum from the top, softened, and every vertex follows its band's ratio.
 */
export function straightenArms(L: MhLod, pos: Float32Array, yTop: number, yBot: number, strength: number): void {
  if (!(yTop > yBot + 0.06)) return;
  const BIN = 0.02, nb = Math.ceil((yTop - yBot) / BIN) + 1, n = pos.length / 3;
  for (const side of [-1, 1] as const) {
    const use = armOf(L, side), cxs = new Float64Array(nb), czs = new Float64Array(nb), r = new Float64Array(nb);
    const bin = (y: number): number => (yTop - y) / BIN;
    let have = 0;
    for (let b = 0; b < nb; b++) {
      // the section of the arm at this height: centre = middle of its bounding box, radius = mean of the half extents
      const sg = cutSegments(L, pos, yTop - b * BIN, use);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < sg.length; i += 2) { x0 = Math.min(x0, sg[i]); x1 = Math.max(x1, sg[i]); z0 = Math.min(z0, sg[i + 1]); z1 = Math.max(z1, sg[i + 1]); }
      if (x1 > x0) { cxs[b] = (x0 + x1) / 2; czs[b] = (z0 + z1) / 2; r[b] = (x1 - x0 + z1 - z0) / 4; have++; }
    }
    if (have < 3) continue;
    // empty bands take the value above them, then the running minimum from the top
    const first = r.findIndex((v) => v > 0);
    for (let b = 0; b < nb; b++) if (r[b] <= 0) { const q = b ? b - 1 : first; r[b] = r[q]; cxs[b] = cxs[q]; czs[b] = czs[q]; }
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

/**
 * A skirt or a coat's lower half is one loft that used to follow the hips only, so the thigh that swings forward in the stride walked out of its front. Its vertices now share their weights
 * between the hips and the two thigh bones (8 and 10) in proportion to their depth below the waist, split by the side they hang on, so the hem swings with the leading thigh.
 */
export function swingSkirt(g: BufferGeometry, yTop: number, yHem: number): BufferGeometry {
  const P = g.getAttribute('position'), n = P.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t0 = Math.min(1, Math.max(0, (yTop - P.getY(i)) / Math.max(1e-6, yTop - yHem))), t = t0 * t0 * (3 - 2 * t0), share = 0.95 * t;
    const u0 = Math.min(1, Math.max(0, (0.04 - P.getX(i)) / 0.08)), u = u0 * u0 * (3 - 2 * u0);
    si[i * 4] = 1; sw[i * 4] = 1 - share; si[i * 4 + 1] = 8; sw[i * 4 + 1] = share * u; si[i * 4 + 2] = 10; sw[i * 4 + 2] = share * (1 - u);
  }
  g.setAttribute('skinIndex', new BufferAttribute(si, 4)); g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  return g;
}
