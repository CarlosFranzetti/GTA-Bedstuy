/**
 * Headwear as separate low-poly pieces, fitted to the skull by ray casts: caps, beanie, bucket hat, flat cap, kufi, kippah, the black
 * hat of Hasidic men, headscarf, hijab (with a soft fold at the neck), durag, hood up and hood down, hard hat, bike helmet, police cap,
 * church hat. No letters, no logos. A hat is a dome (a patch of the skull plus a thickness), a brim (two thin sheets, so its upper face and
 * its underside shade differently) and, where it has one, a trim row that takes the person's trim colour from the swatch.
 */
import { BONE, MeshBuilder, SWATCH, add, basisOf, bodyRingAt, clamp, done, dirOf, lerp, loftY, mul, norm, one, patch, ringPoint, rimAtHeight, sstep, skullR, tube, type Ctx, type Piece, type V3, type Wfn } from './pedPiecesKit';

export const HAT_IDS = ['fitted', 'snapback', 'beanie', 'bucket', 'flatCap', 'kufi', 'kippah', 'fedora', 'headscarf', 'hijab', 'durag', 'hoodUp', 'hoodDown', 'hardHat', 'bikeHelmet', 'policeCap', 'churchHat'] as const;
export type HatId = typeof HAT_IDS[number];

type Knots = Array<[number, number]>;
function knots(k: Knots): (be: number) => number {
  return (be) => {
    const b = be > Math.PI ? Math.PI * 2 - be : be;
    for (let i = 1; i < k.length; i++) if (b <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (b - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1));
    return k[k.length - 1][1];
  };
}
const headW = one(BONE.head);
const front = (be: number): number => Math.max(0, Math.cos(be));
const back = (be: number): number => Math.max(0, -Math.cos(be));
const rowsOf = (ctx: Ctx, hi: number, mid = Math.max(3, hi - 2)): number => (ctx.detail === 'hi' ? hi : mid);
const rimFn = (ctx: Ctx, line: Knots): ((be: number) => number) => { const f = knots(line), memo = new Map<number, number>(); return (be) => { const key = Math.round(be * 1000); let v = memo.get(key); if (v === undefined) { v = rimAtHeight(ctx, ctx.Y(f(be)), be); memo.set(key, v); } return v; }; };
const HAT = SWATCH.hat;
const trimFt = 0.09;

interface DomeOpts { line: Knots; thick: (be: number, u: number) => number; rows?: number; cols?: number; inner?: (be: number, rim: number) => number; shade?: (u: number, be: number) => number; post?: (p: V3, be: number, u: number) => V3; ease?: (x: number) => number; uvv?: [number, number]; W?: Wfn; rect?: typeof HAT; axis?: V3 }
function dome(ctx: Ctx, mb: MeshBuilder, o: DomeOpts): (be: number) => number {
  const rim = rimFn(ctx, o.line);
  patch(ctx, mb, { rows: o.rows ?? rowsOf(ctx, 4, 3), cols: o.cols, rim, thick: o.thick, inner: o.inner ? (be) => o.inner!(be, rim(be)) : undefined, shade: o.shade, post: o.post, ease: o.ease, uvv: o.uvv ?? [0.45, 0.92], rect: o.rect ?? HAT, W: o.W ?? headW, axis: o.axis });
  return rim;
}
/** the point on the rim of a dome at azimuth beta (on the skull, pushed out by the thickness) */
const rimPoint = (ctx: Ctx, rim: (be: number) => number, be: number, t: number): V3 => { const d = dirOf(rim(be), be); return add(ctx.C, mul(d, skullR(ctx, d) + t)); };

/** a brim: two thin sheets (top and underside) from a rim running out and down; open arc for a visor */
function brim(ctx: Ctx, mb: MeshBuilder, rim: (be: number) => number, o: { t: number; width: (be: number) => number; droop: (be: number) => number; rise?: (be: number) => number; arc?: number; cols?: number; rows?: number; tilt?: (be: number) => number }): void {
  const cols = o.cols ?? (ctx.detail === 'hi' ? 14 : 8), rows = o.rows ?? 3, open = o.arc !== undefined, A = o.arc ?? Math.PI;
  const mk = (dy: number): V3[][] => {
    const P: V3[][] = [];
    for (let i = 0; i < rows; i++) {
      const s = i / (rows - 1), row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const be = open ? -A + (2 * A * j) / (cols - 1) : (j / cols) * Math.PI * 2, b = rimPoint(ctx, rim, be, o.t), out: V3 = [Math.sin(be), 0, -Math.cos(be)];
        const p = add(b, add(mul(out, o.width(be) * s), [0, -o.droop(be) * s * s + (o.rise ? o.rise(be) * s * s * s : 0) + dy + (o.tilt ? o.tilt(be) * s : 0), 0]));
        row.push(p);
      }
      P.push(row);
    }
    return P;
  };
  const centre: V3 = [0, ctx.C[1] + 0.02, ctx.C[2]];
  mb.grid(mk(0.002), { rect: HAT, wrap: !open, center: open ? undefined : [0, ctx.C[1] - 0.2, ctx.C[2]], flip: open ? false : undefined, uv: (i, j, R, C) => [j / (C - 1), 0.5 + 0.25 * (i / (R - 1))], shade: (i) => 1 - 0.05 * i });
  mb.grid(mk(-0.0035), { rect: HAT, wrap: !open, center: open ? undefined : [0, ctx.C[1] + 0.5, ctx.C[2]], flip: open ? true : undefined, uv: (i, j, R, C) => [j / (C - 1), 0.3], shade: () => 0.58 });
  void centre;
}

// ---------------------------------------------------------------- caps

const CAP_LINE: Knots = [[0, 0.64], [0.9, 0.63], [1.57, 0.61], [2.4, 0.56], [Math.PI, 0.55]];
const seams = (n: number) => (u: number, be: number): number => 0.82 + 0.18 * (1 - Math.pow(Math.abs(Math.cos(be * n * 0.5)), 10) * sstep(0.1, 0.8, u)) * (0.9 + 0.1 * sstep(0, 0.4, u));

function cap(ctx: Ctx, mb: MeshBuilder, snap: boolean): void {
  const rim = dome(ctx, mb, { line: CAP_LINE, thick: (_be, u) => (snap ? 0.011 + 0.02 * sstep(0.35, 0.75, u) : 0.0085 + 0.007 * sstep(0, 0.5, u)) + 0.004 * sstep(0.88, 1, u), rows: rowsOf(ctx, 5, 3), shade: seams(6) });
  brim(ctx, mb, rim, { t: 0.0085, arc: 0.95, cols: ctx.detail === 'hi' ? 7 : 5, rows: 3, width: (be) => 0.1 * Math.cos(be * 0.95) + 0.012, droop: () => (snap ? 0.012 : 0.026) });
}

// ---------------------------------------------------------------- drapes: hijab, hood, over the neck and shoulders

interface DrapeOpts { yBot: number; top: (be: number) => number; rows: number; cols: number; off0: number; off1: number; bulge?: (be: number, s: number) => number; fold?: number; W?: Wfn; shade?: (s: number) => number }
/** a skirt of cloth round the neck, from a top edge (per azimuth) down over the shoulders; radius by horizontal rays against the dressed body */
function drape(ctx: Ctx, mb: MeshBuilder, o: DrapeOpts): void {
  const P: V3[][] = [];
  for (let i = 0; i < o.rows; i++) {
    const s = i / (o.rows - 1), row: V3[] = [];
    for (let j = 0; j < o.cols; j++) {
      const be = (j / o.cols) * Math.PI * 2, y = lerp(o.top(be), o.yBot, s);
      const off = lerp(o.off0, o.off1, sstep(0, 1, s)) + (o.bulge ? o.bulge(be, s) : 0) + (o.fold ?? 0) * Math.sin(Math.min(1, s * 2.4) * Math.PI) * (0.5 + 0.5 * Math.cos(be * 3));
      row.push(ringPoint(ctx, y, be, off));
    }
    P.push(row);
  }
  mb.grid(P, { rect: HAT, wrap: true, center: [0, lerp(o.yBot, ctx.lm.chinY, 0.5), ctx.C[2]], W: o.W ?? headW, uv: (i, j, R, C) => [j / (C - 1), lerp(0.85, 0.35, i / (R - 1))], shade: (i) => (o.shade ? o.shade(i / (o.rows - 1)) : 1 - 0.18 * (i / (o.rows - 1))) });
}
const toTorso = (ctx: Ctx): Wfn => (p) => { const t = sstep(ctx.lm.chinY - 0.02, ctx.lm.chinY - 0.12, p[1]); return [BONE.head, 1 - t, BONE.torso, t]; };

function hijab(ctx: Ctx, mb: MeshBuilder, hood: boolean): void {
  const line: Knots = hood ? [[0, 0.8], [0.45, 0.74], [0.8, 0.44], [1.1, 0.2], [1.57, 0.14], [Math.PI, 0.1]] : [[0, 0.74], [0.5, 0.66], [0.78, 0.4], [1.05, 0.21], [1.57, 0.17], [Math.PI, 0.12]];
  const tf = knots(line);
  const th = hood ? 0.024 : 0.012;
  dome(ctx, mb, { line, thick: (be, u) => th + (hood ? 0.014 * sstep(0, 0.5, u) + 0.022 * back(be) * sstep(0.3, 1, u) : 0.006 * sstep(0, 0.5, u) + 0.014 * back(be) * sstep(0.2, 1, u)), rows: rowsOf(ctx, 5, 3), shade: (u) => 0.85 + 0.15 * sstep(0, 0.6, u), W: hood ? headW : headW, uvv: [0.4, 0.9] });
  const sh = ctx.rig.shoulderL[1];
  drape(ctx, mb, {
    yBot: sh - (hood ? 0.07 : 0.17), rows: rowsOf(ctx, 6, 4), cols: ctx.detail === 'hi' ? 14 : 8,
    top: (be) => { const b = be > Math.PI ? Math.PI * 2 - be : be, side = sstep(0.55, 1.05, b); return lerp(ctx.lm.chinY - 0.02, ctx.Y(tf(be)) + 0.002, side); },
    off0: hood ? 0.026 : 0.016, off1: hood ? 0.03 : 0.024, bulge: (be, s) => (hood ? 0.03 : 0.016) * back(be) * Math.sin(Math.min(1, s * 1.4) * Math.PI * 0.6) + (hood ? 0.01 : 0.008) * Math.abs(Math.sin(be)) * sstep(0.3, 1, s), fold: hood ? 0.012 : 0.01, W: toTorso(ctx),
  });
}

// ---------------------------------------------------------------- the pieces

const BUILD: Record<HatId, (ctx: Ctx, mb: MeshBuilder) => void> = {
  fitted: (ctx, mb) => cap(ctx, mb, false),
  snapback: (ctx, mb) => cap(ctx, mb, true),
  beanie: (ctx, mb) => {
    const line: Knots = [[0, 0.64], [0.9, 0.55], [1.57, 0.42], [2.4, 0.36], [Math.PI, 0.34]];
    dome(ctx, mb, { line, thick: (be, u) => 0.0155 + 0.012 * sstep(0.2, 0.9, u) + 0.016 * back(be) * sstep(0.5, 1, u), rows: rowsOf(ctx, 5, 3), shade: (u) => 0.85 + 0.15 * sstep(0, 0.5, u) });
    // the folded cuff: a thicker band with its own hard edge
    dome(ctx, mb, { line, thick: () => 0.0265, rows: 2, inner: (_be, rim) => rim - 0.2, shade: (u) => 0.9 + 0.1 * u, uvv: [0.5, 0.6] });
  },
  bucket: (ctx, mb) => {
    const line: Knots = [[0, 0.62], [1.57, 0.62], [Math.PI, 0.62]];
    const rim = dome(ctx, mb, { line, thick: (_be, u) => 0.014 + 0.012 * sstep(0.55, 0.9, u), rows: rowsOf(ctx, 5, 3), shade: (u) => 0.9 + 0.1 * u });
    brim(ctx, mb, rim, { t: 0.014, width: (be) => 0.046 + 0.01 * Math.abs(Math.cos(be)), droop: (be) => 0.022 + 0.012 * Math.abs(Math.cos(be)), cols: ctx.detail === 'hi' ? 14 : 8, rows: 3 });
  },
  flatCap: (ctx, mb) => {
    const rim = dome(ctx, mb, { line: [[0, 0.62], [0.9, 0.61], [1.57, 0.6], [2.4, 0.55], [Math.PI, 0.52]], thick: (be, u) => 0.0105 + (0.012 + 0.014 * front(be)) * sstep(0.15, 0.7, u) + 0.004 * sstep(0.75, 1, u), rows: rowsOf(ctx, 5, 3), shade: (u, be) => 0.85 + 0.15 * sstep(0, 0.6, u) + 0.05 * Math.sin(be * 9) });
    brim(ctx, mb, rim, { t: 0.0105, arc: 0.8, cols: ctx.detail === 'hi' ? 6 : 4, rows: 3, width: (be) => 0.055 * Math.cos(be * 1.0) + 0.008, droop: () => 0.01 });
  },
  kufi: (ctx, mb) => dome(ctx, mb, { line: [[0, 0.76], [1.57, 0.74], [Math.PI, 0.7]], thick: (_be, u) => 0.0075 + 0.003 * u, rows: rowsOf(ctx, 3, 3), shade: (u) => 0.92 + 0.08 * u, uvv: [0.4, 0.85] }),
  kippah: (ctx, mb) => {
    const ax = norm([0, 0.93, 0.34]);
    patch(ctx, mb, { axis: ax, rows: 3, cols: ctx.detail === 'hi' ? 14 : 8, rim: () => 0.5, thick: (_be, u) => 0.004 + 0.003 * sstep(0, 0.5, u), rect: HAT, W: headW, uvv: [0.4, 0.8], shade: (u) => 0.9 + 0.1 * u });
  },
  fedora: (ctx, mb) => {
    const f = (t: number): number => ctx.Y(t), rr = (t: number): { cx: number; cz: number; rx: number; rz: number } => { const r = ctx.lm.crownY; void r; return headRingAtSafe(ctx, f(Math.min(t, 0.9))); };
    const e = 0.016, yb = f(0.6), ytop = ctx.lm.crownY + 0.06, rings = [0.6, 0.72, 0.84, 0.92].map((t, i) => { const r = rr(t); return { y: f(t), rx: r.rx + e + 0.002 * i, rz: r.rz + e + 0.002 * i, cx: r.cx, cz: r.cz, e: 2.3 }; });
    const rt = rr(0.9);
    rings.push({ y: ytop - 0.02, rx: rt.rx + 0.022, rz: rt.rz + 0.026, cx: rt.cx, cz: rt.cz, e: 2.6 }, { y: ytop, rx: rt.rx + 0.014, rz: rt.rz + 0.016, cx: rt.cx, cz: rt.cz, e: 2.6 });
    loftY(mb, rings, ctx.detail === 'hi' ? 16 : 10, { rect: HAT, capTop: true, lift: 0.002, uv: (i, j, R, C) => [j / (C - 1), i === 1 ? trimFt : 0.55], shade: (i) => (i <= 2 ? 0.9 : 1) });
    const r0 = rings[0];
    // the brim: flat, a little up at the sides
    const cols = ctx.detail === 'hi' ? 16 : 10, P: V3[][] = [0, 1].map((i) => Array.from({ length: cols }, (_, j) => { const a = (j / cols) * Math.PI * 2, w = i === 0 ? 0 : 0.046 + 0.012 * Math.abs(Math.cos(a)), sx = Math.sin(a), cz = -Math.cos(a); return [r0.cx + (r0.rx + w) * sx * 1.0, yb - 0.004 + i * (0.006 * Math.abs(sx) * 0.8 - 0.002), r0.cz + (r0.rz + w) * cz] as V3; }));
    mb.grid(P, { rect: HAT, wrap: true, center: [0, yb - 0.3, r0.cz], uv: (i, j, R, C) => [j / (C - 1), 0.5], shade: () => 1 });
    mb.grid(P.map((r) => r.map((p) => [p[0], p[1] - 0.003, p[2]] as V3)), { rect: HAT, wrap: true, center: [0, yb + 0.3, r0.cz], uv: (i, j, R, C) => [j / (C - 1), 0.3], shade: () => 0.6 });
  },
  headscarf: (ctx, mb) => {
    dome(ctx, mb, { line: [[0, 0.72], [0.9, 0.62], [1.57, 0.45], [2.4, 0.32], [Math.PI, 0.28]], thick: (be, u) => 0.013 + 0.01 * sstep(0.15, 0.8, u) + 0.008 * back(be) * sstep(0.3, 1, u) + 0.004 * Math.sin(be * 5 + u * 7), rows: rowsOf(ctx, 5, 3), shade: (u, be) => 0.82 + 0.18 * sstep(0, 0.7, u) + 0.06 * Math.sin(be * 7), uvv: [0.4, 0.9] });
    // the knot at the nape and its two tails
    const kz = ctx.C[2] + skullR(ctx, dirOf(Math.PI * 0.62, Math.PI)) + 0.012, ky = ctx.Y(0.34);
    const n = ctx.detail === 'hi' ? 4 : 3, rings = [];
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + 0.3 + (i / n) * (Math.PI - 0.6), k = Math.cos(a); rings.push({ y: ky + Math.sin(a) * 0.034, rx: 0.032 * k, rz: 0.026 * k, cx: 0, cz: kz }); }
    loftY(mb, rings, ctx.detail === 'hi' ? 8 : 6, { rect: HAT, capTop: true, capBottom: true, lift: 0.004, liftBottom: 0.004, uv: (i, j, R, C) => [j / (C - 1), 0.6] });
    for (const sx of [-1, 1]) tube(mb, [0, 1, 2].map((k) => [sx * (0.012 + 0.014 * k), ky - 0.01 - 0.045 * k, kz + 0.012 + 0.006 * k] as V3), (_i, t) => [0.014 * (1 - t * 0.4), 0.005], 4, { rect: HAT, W: toTorso(ctx), capEnd: true, uv: (i, j, R, C) => [j / (C - 1), 0.6] });
  },
  hijab: (ctx, mb) => hijab(ctx, mb, false),
  hoodUp: (ctx, mb) => hijab(ctx, mb, true),
  hoodDown: (ctx, mb) => {
    drape(ctx, mb, { yBot: ctx.rig.shoulderL[1] - 0.045, top: () => ctx.lm.chinY - 0.012, rows: rowsOf(ctx, 4, 3), cols: ctx.detail === 'hi' ? 14 : 8, off0: 0.012, off1: 0.018, bulge: (be, s) => 0.034 * back(be) * Math.sin(Math.min(1, s * 1.5) * Math.PI * 0.7) + 0.012 * Math.abs(Math.sin(be)) * sstep(0.2, 1, s), fold: 0.01, W: toTorso(ctx) });
  },
  durag: (ctx, mb) => {
    dome(ctx, mb, { line: [[0, 0.7], [0.9, 0.6], [1.57, 0.5], [2.4, 0.4], [Math.PI, 0.38]], thick: (_be, u) => 0.0055 + 0.003 * sstep(0, 0.5, u), rows: rowsOf(ctx, 4, 3), shade: (u) => 0.9 + 0.1 * u });
    const rz = ctx.C[2] + skullR(ctx, dirOf(Math.PI * 0.68, Math.PI)) + 0.004, ry = ctx.Y(0.4);
    for (const sx of [-1, 1]) tube(mb, [0, 1, 2, 3].map((k) => [sx * (0.008 + 0.012 * k), ry - 0.075 * k, rz + 0.012 + 0.012 * Math.sin(k * 0.9)] as V3), (_i, t) => [0.011 * (1 - t * 0.35), 0.0035], 4, { rect: HAT, W: toTorso(ctx), capEnd: true, uv: (i, j, R, C) => [j / (C - 1), 0.55] });
  },
  hardHat: (ctx, mb) => {
    const rim = dome(ctx, mb, { line: [[0, 0.62], [1.57, 0.6], [Math.PI, 0.56]], thick: (_be, u) => 0.016 + 0.014 * sstep(0.1, 0.6, u) + 0.008 * Math.exp(-((u - 1) * (u - 1)) / 0.03) * 0, rows: rowsOf(ctx, 5, 3), shade: (u, be) => 0.9 + 0.1 * u - 0.1 * Math.exp(-(Math.sin(be * 2) ** 2) * 6) * sstep(0.7, 1, u) });
    brim(ctx, mb, rim, { t: 0.016, width: (be) => 0.022 + 0.034 * front(be), droop: () => 0.008, cols: ctx.detail === 'hi' ? 14 : 8, rows: 2 });
  },
  bikeHelmet: (ctx, mb) => {
    const rim = dome(ctx, mb, { line: [[0, 0.66], [0.9, 0.6], [1.57, 0.5], [2.4, 0.4], [Math.PI, 0.36]], thick: (_be, u) => 0.02 + 0.016 * sstep(0.1, 0.6, u), rows: rowsOf(ctx, 5, 3), shade: (u, be) => 0.78 + 0.22 * (0.5 + 0.5 * Math.cos(be * 6)) * sstep(0.12, 0.6, u) + 0.05 });
    brim(ctx, mb, rim, { t: 0.02, arc: 0.7, cols: ctx.detail === 'hi' ? 5 : 3, rows: 2, width: (be) => 0.03 * Math.cos(be) + 0.008, droop: () => 0.004 });
    // chin straps: thin strips from the rim at each ear to the chin
    for (const sx of [-1, 1]) {
      const p0 = rimPoint(ctx, rim, sx * 1.75 + (sx < 0 ? Math.PI * 2 : 0), 0.012);
      tube(mb, [p0, [p0[0] * 0.95, lerp(p0[1], ctx.lm.chinY, 0.55), p0[2] - 0.035], [p0[0] * 0.42, ctx.lm.chinY - 0.012, ctx.C[2] - 0.075]], () => [0.0045, 0.0018], 3, { rect: HAT, W: headW, capEnd: true, uv: () => [0.5, 0.3], tint: [0.6, 0.6, 0.6] });
    }
  },
  policeCap: (ctx, mb) => {
    const rim = dome(ctx, mb, { line: CAP_LINE, thick: (be, u) => 0.0095 + 0.026 * sstep(0.35, 0.62, u) + 0.006 * front(be) * sstep(0.4, 0.9, u), rows: rowsOf(ctx, 6, 4), shade: (u) => 0.9 + 0.1 * sstep(0.5, 1, u) });
    brim(ctx, mb, rim, { t: 0.0095, arc: 0.9, cols: ctx.detail === 'hi' ? 7 : 5, rows: 3, width: (be) => 0.085 * Math.cos(be * 1.0) + 0.012, droop: () => 0.016 });
  },
  churchHat: (ctx, mb) => {
    const rim = dome(ctx, mb, { line: [[0, 0.64], [1.57, 0.62], [Math.PI, 0.58]], thick: (_be, u) => 0.013 + 0.015 * sstep(0.2, 0.8, u), rows: rowsOf(ctx, 5, 3), shade: (u) => 0.9 + 0.1 * u });
    brim(ctx, mb, rim, { t: 0.013, width: (be) => 0.075 + 0.015 * front(be) - 0.02 * back(be), droop: (be) => 0.012 + 0.018 * front(be), rise: (be) => 0.03 * Math.abs(Math.sin(be)), cols: ctx.detail === 'hi' ? 16 : 10, rows: 3 });
  },
};
function headRingAtSafe(ctx: Ctx, y: number): { cx: number; cz: number; rx: number; rz: number } {
  const o: V3 = [0, y, ctx.C[2]], hx = (s: number): number => { const t = ctx.head.hit(o, [s, 0, 0], 0.4); return isFinite(t) ? t : 0.07; }, hz = (s: number): number => { const t = ctx.head.hit(o, [0, 0, s], 0.4); return isFinite(t) ? t : 0.09; };
  const xl = hx(-1), xr = hx(1), zf = hz(-1), zb = hz(1);
  return { cx: (xr - xl) / 2, cz: ctx.C[2] + (zb - zf) / 2, rx: (xl + xr) / 2, rz: (zf + zb) / 2 };
}

export function buildHat(id: HatId, ctx: Ctx): Piece {
  const mb = new MeshBuilder(headW);
  BUILD[id](ctx, mb);
  return done('hat:' + id, 'hat', mb);
}
void clamp; void basisOf; void bodyRingAt;
