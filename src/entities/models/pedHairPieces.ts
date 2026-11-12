/**
 * Hair and beards as separate low-poly pieces. Every style is a cap fitted to the skull by ray casts (so the hairline meets the head cleanly
 * from every angle, on every head) plus, where the style asks for it, a back curtain, strands, a bun or a tail. Ids are the names in `HAIR_IDS`.
 * Budget: a cap is 60 to 120 triangles, the heaviest style (box braids) about 330 at the hi level.
 */
import { BONE, MeshBuilder, penetration, SWATCH, blend, clamp, clearAny, done, relax, headRingAt, lerp, loftY, one, patch, rimAtHeight, rnd, sstep, skullR, dirOf, add, mul, tube, type Ctx, type Piece, type V3, type Wfn } from './pedPiecesKit';

export const HAIR_IDS = ['lowFade', 'highTop', 'crop', 'short', 'curls', 'afro', 'afroLarge', 'puff', 'bun', 'ponytail', 'locsShort', 'locs', 'boxBraids', 'cornrows', 'twists', 'bob', 'long', 'wavy', 'receding', 'baldFringe', 'peyos'] as const;
export type HairId = typeof HAIR_IDS[number];
export const BEARD_IDS = ['beard', 'goatee', 'stache'] as const;
export type BeardId = typeof BEARD_IDS[number];

type Knots = Array<[number, number]>;
/** piecewise linear height fraction (0 chin, 1 crown) by |azimuth| from the front (0) to the back (pi) */
function knots(k: Knots): (be: number) => number {
  return (be) => {
    const b = be > Math.PI ? Math.PI * 2 - be : be;
    for (let i = 1; i < k.length; i++) if (b <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (b - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1));
    return k[k.length - 1][1];
  };
}
/** a slightly broken hairline: the rim height wanders a few millimetres round the head (not for the straight-cut styles) */
const rimFn = (ctx: Ctx, k: Knots, wander = 1) => { const f = knots(k), memo = new Map<number, number>(); return (be: number): number => { const key = Math.round(be * 1000); let v = memo.get(key); if (v === undefined) { v = rimAtHeight(ctx, ctx.Y(f(be) + wander * (0.022 * Math.sin(be * 3 + 1.3) + 0.014 * Math.sin(be * 6 + 0.7))), be); memo.set(key, v); } return v; }; };
const front = (be: number): number => Math.max(0, Math.cos(be));
const side = (be: number): number => Math.abs(Math.sin(be));
const rowsOf = (ctx: Ctx, hi: number, mid = Math.max(3, hi - 2)): number => (ctx.detail === 'hi' ? hi : mid);
const headW = one(BONE.head);

/** the skull cap of most styles */
function cap(ctx: Ctx, mb: MeshBuilder, line: Knots, thick: (be: number, u: number) => number, o: { rows?: number; ease?: (x: number) => number; cols?: number; inner?: (be: number, rim: number) => number; smooth?: number; shade?: (u: number, be: number) => number } = {}): void {
  if (ctx.underHat) return;
  const rim = rimFn(ctx, line);
  patch(ctx, mb, { rows: o.rows ?? rowsOf(ctx, 5, 3), cols: o.cols, rim, thick: (be, u) => thick(be, u) + 0.007 * Math.pow(sstep(0.35, 1, u), 1.5), ease: o.ease, inner: o.inner ? (be) => o.inner!(be, rim(be)) : undefined, smooth: o.smooth, shade: o.shade, rect: SWATCH.hair, W: headW });
}
const edge = (u: number, t0: number, t1: number, w = 0.2): number => lerp(t0, t1, sstep(0, w, u));

// ---- a round volume (bun, puff): a squashed sphere of three rings
function ball(ctx: Ctx, mb: MeshBuilder, c0: V3, r: number, squash = 1, lump = 0, W: Wfn = headW): void {
  if (ctx.underHat) return;
  const n = ctx.detail === 'hi' ? 5 : 3, rings: Array<{ y: number; rx: number; rz: number; cx: number; cz: number }> = [];
  let c: V3 = c0;
  // sit the volume on the head: push it away from the skull centre until nothing is more than a centimetre inside
  for (let k = 0; k < 8; k++) {
    let worst = 0;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + 0.28 + (i / n) * (Math.PI - 0.56), kk = Math.cos(a); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) worst = Math.max(worst, penetration(ctx, [c[0] + dx * r * kk, c[1] + Math.sin(a) * r * squash, c[2] + dz * r * kk])); }
    if (worst < 0.008) break;
    const d = [c[0] - ctx.C[0], c[1] - ctx.C[1], c[2] - ctx.C[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    c = [c[0] + (d[0] / l) * 0.005, c[1] + (d[1] / l) * 0.005, c[2] + (d[2] / l) * 0.005];
  }
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + 0.28 + (i / n) * (Math.PI - 0.56), k = Math.cos(a); rings.push({ y: c[1] + Math.sin(a) * r * squash, rx: r * k * (1 + lump * Math.sin(i * 2.1)), rz: r * k * (1 + lump * Math.cos(i * 1.7)), cx: c[0], cz: c[2] }); }
  loftY(mb, rings, ctx.detail === 'hi' ? 9 : 6, { rect: SWATCH.hair, capTop: true, capBottom: true, lift: r * 0.12, liftBottom: r * 0.12, center: c, W, uv: (i, j, R, C) => [j / (C - 1), 0.3 + 0.6 * (i / (R - 1))] });
}

// ---- strands: tapered prisms hanging or standing from the scalp
interface Strand { be: number; th: number; len: number; r0: number; r1: number; out: number; down: number }
function strands(ctx: Ctx, mb: MeshBuilder, list: Strand[], sides: number, pts: number, W: Wfn, wave = 0): void {
  for (const s of list) {
    const d = dirOf(s.th, s.be), r = skullR(ctx, d), root = add(ctx.C, mul(d, r - 0.004));
    const path: V3[] = [];
    for (let k = 0; k < pts; k++) {
      const t = k / (pts - 1);
      const p: V3 = add(add(root, mul(d, s.out * Math.sin(t * Math.PI * 0.5) + 0.011 * Math.min(1, t * 3))), [s.be > 6 ? 0 : wave * Math.sin(t * 6 + s.be * 3) * t, -s.len * t, 0]);
      path.push(clearAny(ctx, p, s.r0 + 0.003));
    }
    tube(mb, path, (_i, t) => { const r = lerp(s.r0, s.r1, t); return [r, r]; }, sides, { rect: SWATCH.hair, W, capEnd: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.2, 0.85, i / (R - 1))], shade: (i, _j, _p) => 0.82 + 0.18 * (i / pts) });
  }
}
const around = (n: number, a0: number, a1: number, jit: number, seed: string): number[] => Array.from({ length: n }, (_, i) => lerp(a0, a1, n === 1 ? 0.5 : i / (n - 1)) + (rnd(seed, i) - 0.5) * jit);

// ---- a curtain round the back of the head and over the shoulders (bob, long, wavy): rings of half ellipses pushed out of the body
function curtain(ctx: Ctx, mb: MeshBuilder, o: { yTop: number; yBot: number; rows: number; cols: number; A: number; half: (y: number) => number; vol: (y: number) => number; wave?: (y: number, a: number) => number; W: Wfn }): void {
  const P: V3[][] = [];
  for (let i = 0; i < o.rows; i++) {
    const y = lerp(o.yTop, o.yBot, i / (o.rows - 1)), vol = o.vol(y), row: V3[] = [];
    const og: V3 = [0, y, 0.5], tb = Math.min(ctx.head.hit(og, [0, 0, -1], 1), ctx.torso.hit(og, [0, 0, -1], 1));
    const zb = isFinite(tb) ? 0.5 - tb : ctx.C[2] + 0.09, rx = o.half(y) + vol, rz = Math.max(0.05, zb - ctx.C[2] + vol);
    for (let j = 0; j < o.cols; j++) {
      const a = Math.PI - o.A + (2 * o.A * j) / (o.cols - 1);
      row.push(clearAny(ctx, [rx * Math.sin(a) + (o.wave ? o.wave(y, a) : 0), y, ctx.C[2] - rz * Math.cos(a)], vol * 0.8));
    }
    P.push(row);
  }
  mb.grid(P, { rect: SWATCH.hair, center: [0, (o.yTop + o.yBot) / 2, ctx.C[2] - 0.02], W: o.W, uv: (i, j, R, C) => [j / (C - 1), lerp(0.85, 0.2, i / (R - 1))], shade: (i) => 0.84 + 0.16 * (1 - i / (o.rows - 1)) });
}
const headHalf = (ctx: Ctx, y: number): number => (y > ctx.lm.chinY ? headRingAt(ctx, Math.min(y, ctx.Y(0.9))).rx : headRingAt(ctx, ctx.lm.chinY + 0.01).rx * 0.9);
const toTorso = (ctx: Ctx): Wfn => blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY + 0.02, ctx.lm.chinY - 0.14, p[1]));

// ---------------------------------------------------------------- the styles

const T_SHORT: Knots = [[0, 0.84], [0.9, 0.75], [1.57, 0.66], [2.4, 0.5], [Math.PI, 0.33]];
const T_HIGH: Knots = [[0, 0.88], [0.9, 0.8], [1.57, 0.68], [2.4, 0.56], [Math.PI, 0.4]];
const T_LOWBACK: Knots = [[0, 0.84], [0.9, 0.76], [1.57, 0.6], [2.4, 0.46], [Math.PI, 0.36]];
const T_AFRO: Knots = [[0, 0.87], [0.9, 0.8], [1.57, 0.62], [2.4, 0.44], [Math.PI, 0.36]];

const STYLES: Record<HairId, (ctx: Ctx, mb: MeshBuilder) => void> = {
  lowFade: (ctx, mb) => cap(ctx, mb, T_LOWBACK, (be, u) => 0.005 + 0.0085 * sstep(0.5, 0.58, u) + 0.004 * front(be) * sstep(0.55, 0.9, u), { rows: rowsOf(ctx, 7, 5) }),
  highTop: (ctx, mb) => cap(ctx, mb, T_LOWBACK, (_be, u) => 0.005 + 0.038 * sstep(0.42, 0.5, u) + 0.004 * sstep(0.5, 1, u), { rows: rowsOf(ctx, 7, 5) }),
  crop: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => edge(u, 0.003, 0.009, 0.25) + 0.004 * front(be) * sstep(0.5, 1, u)),
  short: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => edge(u, 0.005, 0.014, 0.25) + 0.012 * front(be) * sstep(0.45, 0.95, u) + 0.004 * Math.sin(be * 2 + 1) * sstep(0.3, 1, u)),
  curls: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => edge(u, 0.006, 0.02, 0.2) + 0.006 * Math.sin(be * 8 + u * 11) * Math.cos(u * 13 + be * 3) * sstep(0.1, 0.4, u), { rows: rowsOf(ctx, 5, 4), cols: ctx.detail === 'hi' ? 22 : 12 }),
  afro: (ctx, mb) => cap(ctx, mb, T_AFRO, (be, u) => 0.008 + 0.06 * Math.sqrt(sstep(0, 0.5, u)) + 0.004 * Math.sin(be * 9 + u * 12), { rows: rowsOf(ctx, 6, 4) }),
  afroLarge: (ctx, mb) => cap(ctx, mb, T_AFRO, (be, u) => 0.01 + 0.098 * Math.sqrt(sstep(0, 0.5, u)) + 0.005 * Math.sin(be * 9 + u * 12), { rows: rowsOf(ctx, 6, 4) }),
  puff: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.003, 0.009, 0.25));
    const b = ctx.Y(0.97); ball(ctx, mb, [0, b + 0.012, ctx.C[2] + 0.075], ctx.H * 0.2, 0.9, 0.03);
  },
  bun: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.003, 0.009, 0.25));
    ball(ctx, mb, [0, ctx.Y(1.0) + 0.03, ctx.C[2] + 0.04], ctx.H * 0.16, 0.85);
  },
  ponytail: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.003, 0.01, 0.25));
    const root: V3 = [0, ctx.Y(0.9), ctx.C[2] + skullR(ctx, dirOf(Math.PI * 0.42, Math.PI)) * 0.92], W = toTorso(ctx);
    const path: V3[] = [0, 1, 2, 3, 4, 5].map((k) => { const t = k / 5; return clearAny(ctx, [0, root[1] - 0.26 * t * t - 0.02 * t, root[2] + 0.05 * Math.sin(t * Math.PI * 0.8) + 0.02], 0.02); });
    tube(mb, path, (_i, t) => { const r = 0.022 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)) + 0.006; return [r, r]; }, ctx.detail === 'hi' ? 6 : 5, { rect: SWATCH.hair, W, capEnd: true, capStart: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.2, 0.85, i / (R - 1))] });
  },
  locsShort: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.004, 0.016, 0.25));
    const n = ctx.detail === 'hi' ? 9 : 5, ths = [0.6, 0.95, 1.2];
    const list: Strand[] = [];
    for (let i = 0; i < n; i++) list.push({ be: (i / n) * Math.PI * 2 + rnd(ctx.seed, i) * 0.4, th: ths[i % 3] + (rnd(ctx.seed, i + 40) - 0.5) * 0.2, len: 0.06 + rnd(ctx.seed, i + 20) * 0.025, r0: 0.0085, r1: 0.0065, out: 0.03, down: 0.02 });
    strands(ctx, mb, list, 4, 3, headW);
  },
  twists: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.005, 0.012, 0.25));
    const n = ctx.detail === 'hi' ? 10 : 6, list: Strand[] = [];
    for (let i = 0; i < n; i++) list.push({ be: (i / n) * Math.PI * 2 + rnd(ctx.seed, i) * 0.3, th: 0.3 + (i % 3) * 0.3 + (rnd(ctx.seed, i + 40) - 0.5) * 0.15, len: -0.004, r0: 0.0115, r1: 0.0085, out: 0.036, down: 0 });
    strands(ctx, mb, list, 4, 3, headW);
  },
  locs: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.004, 0.016, 0.25));
    const n = ctx.detail === 'hi' ? 8 : 5, W = toTorso(ctx), bes = around(n, 0.7, Math.PI * 2 - 0.7, 0.18, ctx.seed), list: Strand[] = [];
    for (let i = 0; i < n; i++) { const sideEnd = Math.abs(Math.sin(bes[i])) > 0.85; list.push({ be: bes[i], th: 1.5 + (i % 2) * 0.13, len: sideEnd ? 0.14 : 0.25, r0: 0.0105, r1: 0.0075, out: 0.03, down: 0.0 }); }
    strands(ctx, mb, list, 4, 3, W);
  },
  boxBraids: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => edge(u, 0.004, 0.011, 0.25));
    const n = ctx.detail === 'hi' ? 8 : 5, W = toTorso(ctx), bes = around(n, 0.55, Math.PI * 2 - 0.55, 0.12, ctx.seed), list: Strand[] = [];
    for (let i = 0; i < n; i++) { const sideEnd = Math.abs(Math.sin(bes[i])) > 0.85; list.push({ be: bes[i], th: 1.45 + (i % 2) * 0.16, len: sideEnd ? 0.17 : 0.3, r0: 0.0095, r1: 0.0065, out: 0.025, down: 0.0 }); }
    strands(ctx, mb, list, 4, 3, W);
  },
  cornrows: (ctx, mb) => {
    const cols = ctx.detail === 'hi' ? 28 : 16;
    const ph = (be: number): number => 0.5 + 0.5 * Math.cos(be * (cols / 4));
    cap(ctx, mb, T_LOWBACK, (be, u) => 0.0045 + 0.007 * ph(be) * sstep(0.08, 0.3, u) + 0.002 * sstep(0.2, 1, u), { rows: rowsOf(ctx, 4, 3), cols, shade: (u, be) => 0.72 + 0.28 * ph(be) * sstep(0.05, 0.3, u) + 0.2 * (1 - sstep(0.05, 0.3, u)) });
  },
  bob: (ctx, mb) => {
    cap(ctx, mb, [[0, 0.84], [0.9, 0.75], [1.57, 0.64], [2.4, 0.6], [Math.PI, 0.6]], (be, u) => edge(u, 0.004, 0.014, 0.25) + 0.01 * front(be) * sstep(0.5, 1, u));
    const yTop = ctx.Y(0.66), yBot = ctx.lm.chinY - 0.012;
    curtain(ctx, mb, { yTop, yBot, rows: rowsOf(ctx, 5, 3), cols: ctx.detail === 'hi' ? 9 : 6, A: 1.85, half: (y) => headHalf(ctx, y) * (1 - 0.06 * sstep(ctx.Y(0.4), yBot, y)), vol: (y) => 0.004 + 0.012 * sstep(yTop, yTop - 0.05, y) + 0.012 * sstep(yTop, yBot, y), W: headW });
  },
  long: (ctx, mb) => {
    cap(ctx, mb, [[0, 0.84], [0.9, 0.75], [1.57, 0.64], [2.4, 0.6], [Math.PI, 0.6]], (be, u) => edge(u, 0.004, 0.014, 0.25) + 0.01 * front(be) * sstep(0.5, 1, u));
    const yTop = ctx.Y(0.66), yBot = ctx.rig.shoulderL[1] - 0.2;
    curtain(ctx, mb, { yTop, yBot, rows: rowsOf(ctx, 6, 4), cols: ctx.detail === 'hi' ? 9 : 6, A: 1.75, half: (y) => (y > ctx.lm.chinY ? headHalf(ctx, y) : lerp(0.075, 0.105, sstep(ctx.lm.chinY, yBot, y))) * (1 - 0.1 * sstep(yBot + 0.08, yBot, y)), vol: (y) => 0.004 + 0.012 * sstep(yTop, yTop - 0.05, y) + 0.01 * sstep(yTop, ctx.lm.chinY, y), W: toTorso(ctx) });
  },
  wavy: (ctx, mb) => {
    cap(ctx, mb, [[0, 0.85], [0.9, 0.76], [1.57, 0.64], [2.4, 0.6], [Math.PI, 0.6]], (be, u) => edge(u, 0.004, 0.017, 0.25) + 0.005 * Math.sin(be * 7 + u * 9) * sstep(0.1, 0.4, u) + 0.01 * front(be) * sstep(0.5, 1, u));
    const yTop = ctx.Y(0.66), yBot = ctx.rig.shoulderL[1] - 0.05;
    curtain(ctx, mb, { yTop, yBot, rows: rowsOf(ctx, 7, 4), cols: ctx.detail === 'hi' ? 9 : 6, A: 1.8, half: (y) => (y > ctx.lm.chinY ? headHalf(ctx, y) : lerp(0.08, 0.115, sstep(ctx.lm.chinY, yBot, y))), vol: (y) => 0.004 + 0.012 * sstep(yTop, yTop - 0.05, y) + 0.012 * sstep(yTop, yBot, y) + 0.006 * Math.sin(y * 80) * sstep(yTop, yTop - 0.08, y), wave: (y, a) => 0.011 * Math.sin(y * 62 + a * 2) * sstep(ctx.lm.chinY + 0.04, ctx.lm.chinY - 0.06, y), W: toTorso(ctx) });
  },
  receding: (ctx, mb) => {
    // a high, M-shaped front, a thin top, the sides and back kept short
    const line: Knots = [[0, 0.92], [0.55, 0.86], [0.95, 0.74], [1.57, 0.6], [2.4, 0.46], [Math.PI, 0.34]];
    cap(ctx, mb, line, (be, u) => edge(u, 0.003, 0.009, 0.3) * (1 - 0.3 * sstep(0.7, 1, u) * front(be)), { rows: rowsOf(ctx, 5, 4) });
  },
  baldFringe: (ctx, mb) => {
    // bald on top, a horseshoe of short hair round the sides and the back (the front of the band closes to nothing)
    cap(ctx, mb, [[0, 0.62], [0.8, 0.62], [1.57, 0.58], [2.4, 0.46], [Math.PI, 0.36]], (_be, u) => 0.005 + 0.006 * Math.sin(u * Math.PI), { rows: rowsOf(ctx, 3, 3), inner: (be, rim) => rim - lerp(0, 0.55, sstep(0.5, 1.8, Math.min(be, Math.PI * 2 - be))) });
  },
  peyos: (ctx, mb) => {
    // curled side locks in front of each ear (the head wears a kippah or a hat)
    for (const sx of [-1, 1]) {
      const d = dirOf(1.42, sx * 1.9 + (sx < 0 ? Math.PI * 2 : 0)), r = skullR(ctx, d), root = add(ctx.C, mul(d, r + 0.003)), path: V3[] = [];
      for (let k = 0; k < 8; k++) { const t = k / 7, th = t * Math.PI * 2.2 + 0.3, rad = 0.0085 * (1 - t * 0.2); path.push([root[0] + sx * (0.007 + rad * Math.cos(th) * 0.8), root[1] - t * ctx.H * 0.3, root[2] + rad * Math.sin(th)]); }
      tube(mb, path, (_i, t) => { const r = 0.0058 * (1 - t * 0.3); return [r, r]; }, 5, { rect: SWATCH.hair, W: headW, capEnd: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.25, 0.8, i / (R - 1))] });
    }
  },
};

export function buildHair(id: HairId, ctx: Ctx): Piece {
  const mb = new MeshBuilder(headW);
  STYLES[id](ctx, mb);
  const lifted = relax(ctx, mb);
  return done('hair:' + id, 'hair', mb, lifted);
}

// ---------------------------------------------------------------- beards (low forms on the jaw, for where the face texture is not enough)

export function buildBeard(id: BeardId, ctx: Ctx): Piece {
  const mb = new MeshBuilder(headW);
  const jawAxis = ((): V3 => { const d = Math.hypot(0.3, 0.95); return [0, -0.3 / d, -0.95 / d]; })();
  if (id === 'stache') {
    const ax: V3 = [0, -0.07, -0.997];
    patch(ctx, mb, { axis: ax, rows: 3, cols: ctx.detail === 'hi' ? 10 : 6, rim: (be) => 0.2 + 0.16 * Math.abs(Math.sin(be)) * Math.abs(Math.sin(be)) * 0 + 0.14 * Math.abs(Math.sin(be)) - 0.05 * Math.max(0, Math.cos(be)), thick: (_be, u) => 0.0025 + 0.006 * sstep(0, 0.5, u), rect: SWATCH.hair, W: headW });
  } else {
    const full = id === 'beard';
    patch(ctx, mb, { axis: jawAxis, rows: rowsOf(ctx, 3, 3), rim: (be) => (full ? 0.46 + 0.5 * Math.abs(Math.sin(be)) * (Math.cos(be) < 0.3 ? 1 : 0.85) - 0.18 * Math.max(0, Math.cos(be)) - 0.14 * Math.max(0, -Math.cos(be)) : 0.34 + 0.06 * Math.abs(Math.sin(be)) - 0.05 * Math.max(0, Math.cos(be))), thick: (_be, u) => edge(u, 0.0025, full ? 0.012 : 0.01, 0.4) + (full ? 0.006 : 0.004) * sstep(0.6, 1, u), rect: SWATCH.hair, W: headW });
  }
  const lifted = relax(ctx, mb);
  return done('beard:' + id, 'hair', mb, lifted);
}
void clamp; void BONE;
