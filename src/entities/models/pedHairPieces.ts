/**
 * Hair and beards as separate low-poly pieces. Every style is ONE smooth shell fitted to the skull (see `shell`): rings of vertices
 * running from the crown down to the hairline, an even offset from the scalp that swells gently over the crown and falls to nothing at the
 * hairline (so the edge lies on the skin), welded vertex normals, no pole peak. Styles that hang (bob, long, wavy, locs, box braids) carry
 * the same shell on down the back and over the shoulders to a curved hem, so they are one continuous surface from crown to hem. Ponytail
 * and bun add one tapered tube / one round volume. Ids are the names in `HAIR_IDS`.
 */
import { BONE, MeshBuilder, penetration, SWATCH, blend, clamp, clearAny, done, relax, headRingAt, lerp, loftY, one, patch, rimAtHeight, rnd, sstep, skullR, dirOf, add, mul, tube, ringDist, type Ctx, type Piece, type V3, type Wfn } from './pedPiecesKit';

export const HAIR_IDS = ['lowFade', 'highTop', 'crop', 'short', 'curls', 'afro', 'afroLarge', 'puff', 'bun', 'ponytail', 'locsShort', 'locs', 'boxBraids', 'cornrows', 'twists', 'bob', 'long', 'wavy', 'receding', 'baldFringe', 'peyos'] as const;
export type HairId = typeof HAIR_IDS[number];
export const BEARD_IDS = ['beard', 'goatee', 'stache'] as const;
export type BeardId = typeof BEARD_IDS[number];

const TAU = Math.PI * 2;
type Knots = Array<[number, number]>;
/** piecewise linear height fraction (0 chin, 1 crown) by |azimuth| from the front (0) to the back (pi) */
function knots(k: Knots): (be: number) => number {
  return (be) => {
    const b = be > Math.PI ? TAU - be : be;
    for (let i = 1; i < k.length; i++) if (b <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (b - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1));
    return k[k.length - 1][1];
  };
}
/** a slightly broken hairline: the rim height wanders a few millimetres round the head (not for the straight-cut styles) */
const rimFn = (ctx: Ctx, k: Knots, wander = 1) => { const f = knots(k), memo = new Map<number, number>(); return (be: number): number => { const key = Math.round(be * 1000); let v = memo.get(key); if (v === undefined) { v = rimAtHeight(ctx, ctx.Y(f(be) + wander * (0.016 * Math.sin(be * 3 + 1.3) + 0.01 * Math.sin(be * 6 + 0.7))), be); memo.set(key, v); } return v; }; };
const front = (be: number): number => Math.max(0, Math.cos(be));
const azOf = (be: number): number => (be > Math.PI ? TAU - be : be);
const rowsOf = (ctx: Ctx, hi: number, mid = Math.max(3, hi - 2)): number => (ctx.detail === 'hi' ? hi : mid);
const colsOf = (ctx: Ctx, hi: number, mid = Math.round(hi * 0.65)): number => (ctx.detail === 'hi' ? hi : mid);
const unif = (n: number): number[] => Array.from({ length: n }, (_, j) => (j / n) * TAU);
const headW = one(BONE.head);
const edge = (u: number, t0: number, t1: number, w = 0.2): number => lerp(t0, t1, sstep(0, w, u));

// ---------------------------------------------------------------- the smooth skull field

const AL_MAX = 2.6, NA = 27, NB = 48, DA = AL_MAX / (NA - 1);
interface Field { raw: Float64Array; env: Float64Array }
const FIELDS = new WeakMap<Ctx, Field>();
/** the skull radius from the head centre on a polar grid (rays), its low-passed copy, and an envelope (dilated then low-passed, never under the raw value) */
function fieldOf(ctx: Ctx): Field {
  const cached = FIELDS.get(ctx); if (cached) return cached;
  const raw0 = new Float64Array(NA * NB), at = (i: number, j: number): number => raw0[clamp(i, 0, NA - 1) * NB + ((j % NB) + NB) % NB];
  const top = skullR(ctx, [0, 1, 0]);
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) raw0[i * NB + j] = i === 0 ? top : skullR(ctx, dirOf(i * DA, (j / NB) * TAU));
  const blur = (src: Float64Array): Float64Array => {
    const o = new Float64Array(NA * NB), w = [1, 2, 1], g = (i: number, j: number): number => src[clamp(i, 0, NA - 1) * NB + ((j % NB) + NB) % NB];
    for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += w[a + 1] * w[b + 1] * g(i + a, j + b); o[i * NB + j] = s / 16; }
    return o;
  };
  const dil = new Float64Array(NA * NB);
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { let m = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) m = Math.max(m, at(i + a, j + b)); dil[i * NB + j] = m; }
  const raw = blur(raw0), env = blur(blur(dil));
  for (let k = 0; k < env.length; k++) { env[k] = Math.max(env[k], raw0[k]); raw[k] = Math.max(raw[k], raw0[k] - 0.002); }
  const f = { raw, env };
  FIELDS.set(ctx, f);
  return f;
}
function sampleF(arr: Float64Array, al: number, be: number): number {
  const a = clamp(al / DA, 0, NA - 1 - 1e-6), i = Math.floor(a), fa = a - i, bb = (((be % TAU) + TAU) % TAU / TAU) * NB, j = Math.floor(bb) % NB, fb = bb - Math.floor(bb), j2 = (j + 1) % NB;
  return lerp(lerp(arr[i * NB + j], arr[i * NB + j2], fb), lerp(arr[(i + 1) * NB + j], arr[(i + 1) * NB + j2], fb), fa);
}

/** how far the head or body reaches from the axis at height y, azimuth be, seen from a little above and to each side (hair falls over the bulge of the skull and over the ears, it does not tuck in at the nape) */
function hangR(ctx: Ctx, y: number, be: number): number {
  let m = 0; const hi = y > ctx.lm.chinY - 0.03;
  for (const dy of hi ? [-0.03, 0, 0.03, 0.06] : [0]) for (const db of hi ? [-0.24, 0, 0.24] : [-0.1, 0, 0.1]) m = Math.max(m, ringDist(ctx, y + dy, be + db));
  return m;
}

// ---------------------------------------------------------------- the shell

interface ShellOpts {
  /** the azimuth of each column (0 front, round towards +x), ascending, covering the whole turn */
  be: number[];
  /** polar angle (from straight up) of the hairline at azimuth be */
  rim: (be: number) => number;
  /** with an inner boundary the shell is an open band (rim .. inner) instead of a cap to the crown */
  inner?: (be: number) => number;
  /** rings from the crown (or the inner boundary) to the rim */
  rows: number;
  /** offset from the scalp (m) at azimuth be and u = 0 at the rim .. 1 at the crown */
  thick: (be: number, u: number) => number;
  /** extra lift (m) straight up */
  up?: (be: number, u: number) => number;
  /** the hanging part: rings from the rim down to a hem height (null = no hang at that azimuth); thick is the offset from the body there (s 0 .. 1 to the hem) */
  hang?: { rows: number; hem: (be: number) => number | null; thick: (be: number, s: number) => number };
  shade?: (be: number, u: number, s: number) => number;
  W?: Wfn;
}
/** one welded surface: crown -> hairline, and on down to a hem where the style hangs. Vertex normals are averaged over the whole surface. */
function shell(ctx: Ctx, mb: MeshBuilder, o: ShellOpts): void {
  const hang = o.hang;
  if (ctx.underHat && !hang) return;
  const F = fieldOf(ctx), Ns = ctx.underHat ? 1 : o.rows, Nh = hang ? hang.rows : 0, Rn = Ns + Nh, n = o.be.length;
  const free: boolean[] = [], P: V3[][] = Array.from({ length: Rn }, () => []), S: number[][] = Array.from({ length: Rn }, () => []);
  const poleTh = o.inner ? 0 : (() => { let t = 0; for (let k = 0; k < 8; k++) t += o.thick((k / 8) * TAU, 1); return t / 8; })();
  const poleUp = o.inner || !o.up ? 0 : (() => { let t = 0; for (let k = 0; k < 8; k++) t += o.up!((k / 8) * TAU, 1); return t / 8; })();
  for (let j = 0; j < n; j++) {
    const be = o.be[j], rimA = o.rim(be), inA = o.inner ? o.inner(be) : 0, hemJ = hang ? hang.hem(be) : null;
    let last: V3 = ctx.C;
    for (let k = 0; k < Ns; k++) {
      const t = Ns === 1 ? 1 : o.inner ? k / (Ns - 1) : Math.pow(k / (Ns - 1), 1.25), u = 1 - t, al = lerp(inA, rimA, t), d = dirOf(al, be);
      // where the style hangs, the hairline is no edge: the hair goes on down, so it keeps its full thickness (and clears the ear) at the rim
      const hw = hemJ === null ? 0 : clamp((ctx.C[1] + Math.cos(rimA) * 0.095 - hemJ) / 0.05);
      const w = Math.max(hw, sstep(0, 0.4, o.inner ? Math.min(u, 1 - u) : u)), R = lerp(sampleF(F.raw, al, be), sampleF(F.env, al, be), w);
      const th = !o.inner && k === 0 ? poleTh : Math.max(o.thick(be, u), hang && hw > 0 ? hang.thick(be, 0) * hw * (1 - sstep(0, 0.35, u)) : 0), up = !o.inner && k === 0 ? poleUp : o.up ? o.up(be, u) : 0;
      last = [ctx.C[0] + d[0] * (R + th), ctx.C[1] + d[1] * (R + th) + up, ctx.C[2] + d[2] * (R + th)];
      P[k].push(last); S[k].push(o.shade ? o.shade(be, u, 0) : 0.8 + 0.2 * sstep(0, 0.45, u));
    }
    if (hang) {
      const hem = hang.hem(be); free[j] = hem === null; const yRim = last[1], yEnd = hem === null ? yRim : Math.min(yRim, hem), r0 = Math.hypot(last[0], last[2] - ctx.C[2]), hx = Math.sin(be), hz = -Math.cos(be);
      for (let m = 1; m <= Nh; m++) {
        const s = m / Nh, y = lerp(yRim, yEnd, s), rr = lerp(r0, hangR(ctx, y, be) + hang.thick(be, s), hem === null ? 0 : sstep(0, 0.45, s));
        P[Ns - 1 + m].push([hx * rr, y, ctx.C[2] + hz * rr]); S[Ns - 1 + m].push(o.shade ? o.shade(be, 0, s) : 0.9 - 0.12 * s);
      }
    }
  }
  if (hang) {
    // relax the bend where the skull turns into the drop, then keep every hanging vertex out of the body
    for (let it = 0; it < 2; it++) for (let j = 0; j < n; j++) { const prev: V3[] = []; for (let i = 0; i < Rn; i++) prev.push(P[i][j]); for (let i = Math.max(1, Ns - 1); i < Rn - 1; i++) P[i][j] = [0, 1, 2].map((c) => prev[i - 1][c] * 0.25 + prev[i][c] * 0.5 + prev[i + 1][c] * 0.25) as V3; }
    for (let i = Ns; i < Rn; i++) for (let j = 0; j < n; j++) if (!free[j]) P[i][j] = clearAny(ctx, P[i][j], i === Rn - 1 ? 0.002 : 0.004);
  }
  mb.grid(P, { rect: SWATCH.hair, wrap: true, center: ctx.C, W: o.W, uv: (i, j, R, C) => [j / (C - 1), lerp(0.85, 0.2, i / (R - 1))], shade: (i, j) => S[i][j] });
}

/** the skull cap of most styles */
function cap(ctx: Ctx, mb: MeshBuilder, line: Knots, thick: (be: number, u: number) => number, o: { rows?: number; cols?: number; wander?: number; up?: (be: number, u: number) => number; shade?: (be: number, u: number, s: number) => number; inner?: (be: number, rim: number) => number } = {}): void {
  if (ctx.underHat) return;
  const rim = rimFn(ctx, line, o.wander ?? 0.6);
  shell(ctx, mb, { be: unif(o.cols ?? colsOf(ctx, 16, 10)), rim, rows: o.rows ?? rowsOf(ctx, 5, 4), thick, up: o.up, shade: o.shade, inner: o.inner ? (be) => o.inner!(be, rim(be)) : undefined, W: headW });
}
/** a lift from nothing at the hairline: no step at the edge */
const rise = (u: number, w = 0.3): number => sstep(0, w, u);
/** a quarter ellipse: the hair stands out of the hairline round and steep, like the side of a ball */
const ball1 = (u: number, w = 0.5): number => { const x = clamp(u / w); return Math.pow(Math.sqrt(1 - (1 - x) * (1 - x)), 1.3); };

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


// ---------------------------------------------------------------- the styles

/** hairlines: height fraction (0 chin, 1 crown) by azimuth from the front: forehead, temple, sideburn, above the ear, behind it, nape */
const T_SHORT: Knots = [[0, 0.84], [0.7, 0.8], [1.15, 0.7], [1.45, 0.62], [1.8, 0.66], [2.3, 0.52], [2.8, 0.4], [Math.PI, 0.36]];
const T_LOWBACK: Knots = [[0, 0.84], [0.7, 0.8], [1.15, 0.68], [1.45, 0.58], [1.8, 0.6], [2.3, 0.48], [2.8, 0.4], [Math.PI, 0.38]];
const T_AFRO: Knots = [[0, 0.87], [0.7, 0.83], [1.15, 0.72], [1.45, 0.62], [1.8, 0.62], [2.3, 0.5], [2.8, 0.42], [Math.PI, 0.4]];
const T_FULL: Knots = [[0, 0.84], [0.7, 0.8], [1.1, 0.7], [1.4, 0.56], [1.8, 0.55], [2.4, 0.55], [Math.PI, 0.55]];
/** a rounded lump pattern (curls, twists, locs in a cap): amplitude 0..1 */
const lumps = (be: number, u: number, k: number, ph = 0): number => 0.5 + 0.5 * Math.sin(be * k + ph + u * 4.5) * Math.cos(u * 7.3 + be * 1.7);
/** ridges that run from the crown to the hem: 1 on the crest, 0 in the groove. n ridges round the head, the crest at azimuth ph */
const ridge = (be: number, n: number, ph = 0): number => 0.5 + 0.5 * Math.cos((be - ph) * n);

/** the drop of a hanging style: hem height by azimuth (a curve, longest at the back) from `from` (where it starts, rad from the front) with a diagonal edge in front of the ear */
const hangOf = (ctx: Ctx, from: number, to: number, hemAt: (az: number) => number, rows: number, thick: (be: number, s: number) => number): NonNullable<ShellOpts['hang']> => ({
  rows,
  hem: (be) => { const az = azOf(be); if (az <= from) return null; const y = hemAt(az); return lerp(ctx.Y(0.6), y, sstep(from, to, az)); },
  thick,
});
const bulge = (s: number, top: number, mid: number, tip: number): number => lerp(top, mid, sstep(0, 0.35, s)) * (1 - sstep(0.7, 1, s)) + tip * sstep(0.7, 1, s);


interface LockOpts { n: number; per: number; amp: number; capAmp: number; drop: number; extra: number; stagger: number; tip: number; rows: number; hrows: number }
function locks(ctx: Ctx, mb: MeshBuilder, o: LockOpts): void {
  const nR = Math.round(o.n / o.per), sh = ctx.rig.shoulderL[1], f = (be: number): number => ridge(be, nR, 0), back = (be: number): number => sstep(1.0, 1.9, azOf(be));
  const hemAt = (az: number, be: number): number => sh - o.drop - o.extra * sstep(1.5, 2.5, az) - o.stagger * rnd(ctx.seed, Math.round(be / (TAU / nR))) - o.tip * (1 - f(be));
  shell(ctx, mb, {
    be: unif(o.n), rim: rimFn(ctx, T_FULL, 0.4), rows: o.rows, W: blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY + 0.02, ctx.lm.chinY - 0.14, p[1])),
    thick: (be, u) => rise(u, 0.3) * (0.008 + 0.008 * sstep(0.3, 1, u)) + o.capAmp * f(be) * back(be) * rise(u, 0.25) * (1 - sstep(0.55, 1, u)),
    hang: { rows: o.hrows, hem: (be) => { const az = azOf(be); return az <= 1.2 ? null : lerp(ctx.Y(0.58), hemAt(az, be), sstep(1.2, 1.7, az)); }, thick: (be, s) => 0.004 + (0.007 + o.amp * f(be) * back(be)) * (1 - 0.8 * sstep(0.6, 1, s)) },
    shade: (be, u, s) => (s > 0 ? 0.56 + 0.44 * f(be) - 0.06 * s : 0.74 + 0.26 * sstep(0, 0.45, u) - 0.12 * (1 - f(be)) * back(be) * rise(u, 0.3)),
  });
}

const STYLES: Record<HairId, (ctx: Ctx, mb: MeshBuilder) => void> = {
  lowFade: (ctx, mb) => cap(ctx, mb, T_LOWBACK, (be, u) => rise(u, 0.28) * (0.0045 + 0.0085 * sstep(0.35, 0.85, u) + 0.004 * front(be) * sstep(0.55, 1, u)), { cols: colsOf(ctx, 20, 12), rows: rowsOf(ctx, 5, 4) }),
  highTop: (ctx, mb) => cap(ctx, mb, T_LOWBACK, (_be, u) => rise(u, 0.28) * 0.006 + 0.03 * sstep(0.3, 0.7, u), { cols: colsOf(ctx, 20, 12), rows: rowsOf(ctx, 6, 4), up: (_be, u) => 0.012 * sstep(0.4, 1, u) }),
  crop: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => rise(u, 0.25) * (0.0035 + 0.003 * sstep(0.4, 1, u)) + 0.003 * front(be) * sstep(0.5, 1, u), { cols: colsOf(ctx, 16, 10) }),
  short: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => rise(u, 0.28) * (0.006 + 0.008 * sstep(0.3, 0.9, u)) + 0.008 * front(be) * sstep(0.5, 1, u), { cols: colsOf(ctx, 16, 10) }),
  curls: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => rise(u, 0.3) * (0.012 + 0.012 * lumps(be, u, 9)), { cols: colsOf(ctx, 22, 12), rows: rowsOf(ctx, 5, 4) }),
  afro: (ctx, mb) => cap(ctx, mb, T_AFRO, (be, u) => 0.058 * (1 - 0.2 * sstep(1.9, 3.14, azOf(be))) * ball1(u, 0.8) + 0.004 * lumps(be, u, 8) * rise(u, 0.3), { cols: colsOf(ctx, 20, 12), rows: rowsOf(ctx, 6, 4) }),
  afroLarge: (ctx, mb) => cap(ctx, mb, T_AFRO, (be, u) => 0.095 * (1 - 0.2 * sstep(1.9, 3.14, azOf(be))) * ball1(u, 0.8) + 0.005 * lumps(be, u, 8) * rise(u, 0.3), { cols: colsOf(ctx, 20, 12), rows: rowsOf(ctx, 6, 4) }),
  puff: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => rise(u, 0.25) * (0.0045 + 0.004 * sstep(0.4, 1, u)), { cols: colsOf(ctx, 16, 10), rows: rowsOf(ctx, 4, 3) });
    const b = ctx.Y(0.97); ball(ctx, mb, [0, b + 0.012, ctx.C[2] + 0.075], ctx.H * 0.2, 0.9, 0.03);
  },
  bun: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => rise(u, 0.25) * (0.0045 + 0.004 * sstep(0.4, 1, u)), { cols: colsOf(ctx, 16, 10), rows: rowsOf(ctx, 4, 3) });
    ball(ctx, mb, [0, ctx.Y(1.0) + 0.03, ctx.C[2] + 0.04], ctx.H * 0.16, 0.85);
  },
  ponytail: (ctx, mb) => {
    cap(ctx, mb, T_SHORT, (_be, u) => rise(u, 0.25) * (0.0045 + 0.005 * sstep(0.4, 1, u)), { cols: colsOf(ctx, 16, 10), rows: rowsOf(ctx, 5, 4) });
    // a tail gathered at the back of the crown: leaves backwards, then falls in a curve, tapering to a tip
    const d0 = dirOf(Math.PI * 0.34, Math.PI), root: V3 = add(ctx.C, mul(d0, skullR(ctx, d0) + 0.013)), W = blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY + 0.02, ctx.lm.chinY - 0.14, p[1]));
    const N = ctx.detail === 'hi' ? 7 : 5, path: V3[] = [root], L = 0.3;
    // leaves the tie going back and a little down, then bends over into a fall (the direction turns evenly, no corner)
    for (let k = 1; k < N; k++) { const t = (k - 0.5) / (N - 1), phi = lerp(0.55, 1.5, t), prev = path[k - 1], st = L / (N - 1); path.push(clearAny(ctx, [0.008 * Math.sin((k / (N - 1)) * Math.PI), prev[1] - st * Math.sin(phi), prev[2] + st * Math.cos(phi) * 0.9], 0.02 * (1 - k / (N - 1)) + 0.006)); }
    tube(mb, path, (_i, t) => { const r = 0.004 + 0.021 * (1 - 0.78 * Math.pow(t, 1.4)) * (0.82 + 0.18 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5)); return [r, r]; }, ctx.detail === 'hi' ? 7 : 5, { rect: SWATCH.hair, W, capEnd: true, capStart: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.2, 0.85, i / (R - 1))], shade: (i) => 0.82 + 0.18 * Math.sin((i / (N + 1)) * Math.PI * 0.9) });
  },
  // short locs and twists: a rounded cap with a bumpy silhouette (rolled ends all over), never rods standing up
  locsShort: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => rise(u, 0.3) * (0.014 + 0.016 * lumps(be, u, 11, 0.6)), { cols: colsOf(ctx, 26, 14), rows: rowsOf(ctx, 6, 4), shade: (be, u) => 0.74 + 0.26 * lumps(be, u, 11, 0.6) * sstep(0, 0.3, u) + 0.1 * sstep(0.3, 1, u) }),
  twists: (ctx, mb) => cap(ctx, mb, T_SHORT, (be, u) => rise(u, 0.3) * (0.014 + 0.014 * (0.5 + 0.5 * Math.sin(be * 7 + u * 2.2)) * (0.6 + 0.4 * Math.cos(u * 10 + be * 2))), { cols: colsOf(ctx, 28, 14), rows: rowsOf(ctx, 6, 4), shade: (be, u) => 0.74 + 0.26 * (0.5 + 0.5 * Math.sin(be * 7 + u * 2.2)) * sstep(0, 0.3, u) + 0.08 * sstep(0.3, 1, u) }),
  // long locs and box braids: a cap and a hanging mass of thick, tapered, touching locks down the back and over the shoulders (one welded surface,
  // the locks are the ridges of it, each ending in its own rounded tip at its own length)
  locs: (ctx, mb) => locks(ctx, mb, { n: colsOf(ctx, 24, 16), per: 4, amp: 0.03, capAmp: 0.018, drop: 0.06, extra: 0.17, stagger: 0.05, tip: 0.09, rows: rowsOf(ctx, 5, 4), hrows: rowsOf(ctx, 3, 3) }),
  boxBraids: (ctx, mb) => locks(ctx, mb, { n: colsOf(ctx, 30, 18), per: 3, amp: 0.02, capAmp: 0.011, drop: 0.1, extra: 0.2, stagger: 0.05, tip: 0.06, rows: rowsOf(ctx, 4, 3), hrows: rowsOf(ctx, 3, 3) }),
  cornrows: (ctx, mb) => {
    const n = colsOf(ctx, 24, 12), f = (be: number): number => ridge(be, n / 3, 0);
    cap(ctx, mb, T_LOWBACK, (be, u) => 0.0045 * rise(u, 0.3) + 0.007 * f(be) * sstep(0.08, 0.35, u) * (1 - 0.7 * sstep(0.85, 1, u)) + 0.002 * sstep(0.2, 1, u), { cols: n, rows: rowsOf(ctx, 4, 3), shade: (be, u) => 0.7 + 0.3 * f(be) * sstep(0.05, 0.3, u) + 0.2 * (1 - sstep(0.05, 0.3, u)) });
  },
  bob: (ctx, mb) => {
    const yb = ctx.lm.chinY - 0.012;
    shell(ctx, mb, {
      be: unif(colsOf(ctx, 20, 12)), rim: rimFn(ctx, T_FULL, 0.3), rows: rowsOf(ctx, 5, 4), W: headW,
      thick: (be, u) => rise(u, 0.28) * (0.007 + 0.008 * sstep(0.3, 1, u)) + 0.006 * front(be) * sstep(0.5, 1, u),
      hang: hangOf(ctx, 1.0, 1.55, (az) => yb + 0.03 * sstep(1.6, 3.1, az) - 0.012 * (1 - sstep(1.6, 3.1, az)), rowsOf(ctx, 2, 2), (_be, s) => bulge(s, 0.008, 0.02, 0.0045)),
    });
  },
  long: (ctx, mb) => {
    const yb = ctx.rig.shoulderL[1] - 0.2, ys = ctx.rig.shoulderL[1] - 0.05;
    shell(ctx, mb, {
      be: unif(colsOf(ctx, 20, 12)), rim: rimFn(ctx, T_FULL, 0.3), rows: rowsOf(ctx, 5, 4), W: blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY + 0.02, ctx.lm.chinY - 0.14, p[1])),
      thick: (be, u) => rise(u, 0.28) * (0.007 + 0.008 * sstep(0.3, 1, u)) + 0.006 * front(be) * sstep(0.5, 1, u),
      hang: hangOf(ctx, 1.0, 1.55, (az) => lerp(ys, yb, sstep(1.7, 2.9, az)), rowsOf(ctx, 4, 3), (_be, s) => bulge(s, 0.008, 0.017, 0.004)),
    });
  },
  wavy: (ctx, mb) => {
    const yb = ctx.rig.shoulderL[1] - 0.1, ys = ctx.rig.shoulderL[1] - 0.01;
    shell(ctx, mb, {
      be: unif(colsOf(ctx, 20, 12)), rim: rimFn(ctx, T_FULL, 0.3), rows: rowsOf(ctx, 5, 4), W: blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY + 0.02, ctx.lm.chinY - 0.14, p[1])),
      thick: (be, u) => rise(u, 0.28) * (0.008 + 0.008 * sstep(0.3, 1, u)) + 0.005 * Math.sin(be * 5 + u * 7) * sstep(0.1, 0.5, u) + 0.006 * front(be) * sstep(0.5, 1, u),
      hang: hangOf(ctx, 1.0, 1.55, (az) => lerp(ys, yb, sstep(1.7, 2.9, az)), rowsOf(ctx, 5, 4), (be, s) => bulge(s, 0.008, 0.017, 0.005) + 0.007 * Math.sin(s * 11 + be * 3) * sstep(0.05, 0.3, s) * (1 - sstep(0.8, 1, s))),
    });
  },
  receding: (ctx, mb) => {
    // a high, M-shaped front, a thin top, the sides and back kept short
    const line: Knots = [[0, 0.92], [0.55, 0.86], [0.95, 0.74], [1.3, 0.62], [1.8, 0.62], [2.4, 0.46], [Math.PI, 0.38]];
    cap(ctx, mb, line, (be, u) => rise(u, 0.3) * (0.0035 + 0.003 * sstep(0.4, 1, u)) * (1 - 0.3 * sstep(0.7, 1, u) * front(be)), { cols: colsOf(ctx, 16, 10) });
  },
  baldFringe: (ctx, mb) => {
    // bald on top, a horseshoe of short hair round the sides and the back (the front of the band closes to nothing)
    cap(ctx, mb, [[0, 0.62], [0.8, 0.62], [1.57, 0.58], [2.4, 0.46], [Math.PI, 0.38]], (_be, u) => 0.007 * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI), { rows: rowsOf(ctx, 3, 3), cols: colsOf(ctx, 18, 12), inner: (be, rim) => rim - lerp(0, 0.55, sstep(0.5, 1.8, azOf(be))) });
  },
  peyos: (ctx, mb) => {
    // curled side locks in front of each ear (the head wears a kippah or a hat)
    for (const sx of [-1, 1]) {
      const d = dirOf(1.42, sx * 1.9 + (sx < 0 ? TAU : 0)), r = skullR(ctx, d), root = add(ctx.C, mul(d, r + 0.003)), path: V3[] = [];
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
