/**
 * Hair and beards as separate low-poly pieces. Every style is ONE smooth shell fitted to the skull (see `shell`): rings of vertices
 * running from the crown down to the hairline, an even offset from the scalp that swells gently over the crown and falls to nothing at the
 * hairline (so the edge lies on the skin), welded vertex normals, no pole peak. Styles that hang (bob, long, wavy, locs, box braids) carry
 * the same shell on down the back and over the shoulders to a curved hem, so they are one continuous surface from crown to hem. Ponytail
 * and bun add one tapered tube / one round volume. Ids are the names in `HAIR_IDS`.
 */
import { cross, dot, norm, sub, topY, BONE, MeshBuilder, penetration, SWATCH, blend, clamp, clearAny, done, relax, headRingAt, lerp, loftY, one, patch, rimAtHeight, rnd, sstep, skullR, dirOf, add, mul, tube, ringDist, type Ctx, type Piece, type V3, type Wfn } from './pedPiecesKit';

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
/** blur a function of the azimuth (0..2pi, wrapped) so a piecewise hairline has no corners */
const smoothAz = (f: (be: number) => number, w = 0.34) => (be: number): number => { const wt = [1, 3, 6, 8, 6, 3, 1]; let s = 0, t = 0; for (let i = 0; i < 7; i++) { s += wt[i] * f((((be + (i - 3) * w / 3) % TAU) + TAU) % TAU); t += wt[i]; } return s / t; };
interface LineOpts { wander?: number; /** a widow's peak: the centre of the forehead reaches down by this fraction */ peak?: number; /** baby hairs: a fine irregular fringe along the front line (fraction of a head) */ baby?: number; /** points that hang below the line at n places round the head (fraction), crests at the columns */ scallop?: [number, number] }
/** a hairline: a smooth curve through the knots (no corners), a slightly broken edge (not for the straight-cut styles), an optional widow's peak, baby hairs and scallops; the rim height is turned into a polar angle on the real skull */
const rimFn = (ctx: Ctx, k: Knots, o: LineOpts | number = {}) => {
  const op: LineOpts = typeof o === 'number' ? { wander: o } : o, wd = op.wander ?? 1, f = smoothAz(knots(k)), raw = new Map<number, number>(), memo = new Map<number, number>();
  // the polar angle of the hairline at one azimuth (a few ray casts on the skull)
  const rawAt = (be0: number): number => {
    const be = ((be0 % TAU) + TAU) % TAU, key = Math.round(be * 1000); let v = raw.get(key);
    if (v === undefined) {
      const az = azOf(be), fr = 1 - sstep(0.7, 1.3, az);
      let h = f(be) + wd * (0.014 * Math.sin(be * 3 + 1.3) + 0.008 * Math.sin(be * 6 + 0.7));
      if (op.peak) h -= op.peak * Math.exp(-Math.pow(az / 0.22, 2));
      if (op.baby) h -= op.baby * fr * (0.5 + 0.5 * Math.sin(be * 9 + 0.4)) * sstep(0.05, 0.3, az);
      if (op.scallop) h -= op.scallop[1] * ridge(be, op.scallop[0], 0);
      v = rimAtHeight(ctx, ctx.Y(h), be); raw.set(key, v);
    }
    return v;
  };
  // PEOPLE7: the ray casts jitter from one column to the next over the brow ridge and the temples, and the hairline came out as a row of black teeth: the angle is blurred over its neighbours (the scallops of the
  // curl styles, which are asked for on purpose, keep their shape: they are far wider than the blur)
  return (be: number): number => {
    const key = Math.round(be * 1000); let v = memo.get(key);
    if (v === undefined) { v = (rawAt(be - 0.4) + 2 * rawAt(be - 0.2) + 3 * rawAt(be) + 2 * rawAt(be + 0.2) + rawAt(be + 0.4)) / 9; memo.set(key, v); }      // PEOPLE8: five taps (was three): the brow and temple ray casts still left shallow teeth
    return v;
  };
};
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
  /** the whole outer radius from the head centre (m) at azimuth be, u, given the skull radius there: overrides rim + thick (the afros are round masses) */
  radius?: (be: number, u: number, skull: number, al: number, rimA: number) => number;
  /** extra lift (m) straight up */
  up?: (be: number, u: number) => number;
  /** the hanging part: rings from the rim down to a hem height (null = no hang at that azimuth); thick is the offset from the body there (s 0 .. 1 to the hem) */
  hang?: { rows: number; hem: (be: number) => number | null; thick: (be: number, s: number) => number; /** the azimuth of a hanging ring at s (0 at the hairline .. 1 at the hem): lets the mass narrow or sway as it falls */ az?: (be: number, s: number) => number; /** 0 = the hair keeps the bulge of the head all the way down, 1 = it lies on the neck */ tuck?: number };
  /** a soft ceiling (m above the head centre) on the height of the cap at azimuth be: flat tops */
  flat?: (be: number) => number | undefined;
  /** strands converge on this direction (a tie, a bun): the texture runs away from it */
  uvAxis?: V3;
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
      const w = Math.max(hw, sstep(0, 0.4, o.inner ? Math.min(u, 1 - u) : u)), R =
       lerp(sampleF(F.raw, al, be), sampleF(F.env, al, be), w);
      const th = !o.inner && k === 0 ? poleTh : Math.max(o.thick(be, u), hang && hw > 0 ? hang.thick(be, 0) * hw * (1 - sstep(0, 0.35, u)) : 0), up = !o.inner && k === 0 ? poleUp : o.up ? o.up(be, u) : 0;
      // FACES3: the edge stood exactly ON the skull's surface, so between two rim columns the shell's straight chord dipped under the faceted, morphed forehead and the hairline came out as teeth.
      // A 3.2 mm lift at the rim (fading out by u = 0.6) keeps the edge clear of the skin; the painted scalp band beneath is hair-coloured, so the wall is not seen.
      const lift = o.inner || hemJ !== null ? 0 : 0.0032 * (1 - sstep(0.15, 0.6, u));
      const rad = o.radius ? o.radius(be, u, R, al, rimA) : R + th + lift;
      last = [ctx.C[0] + d[0] * rad, ctx.C[1] + d[1] * rad + up, ctx.C[2] + d[2] * rad];
      const yt = o.flat ? o.flat(be) : undefined;
      if (yt !== undefined) { const dy = last[1] - ctx.C[1], kk = 0.012; if (dy > yt - kk) last = [last[0], ctx.C[1] + (yt - kk) + kk * Math.tanh((dy - (yt - kk)) / kk), last[2]]; }
      P[k].push(last); S[k].push(o.shade ? o.shade(be, u, 0) : 0.8 + 0.2 * sstep(0, 0.45, u));
    }
    if (hang) {
      const hem = hang.hem(be); free[j] = hem === null; const yRim = last[1], yEnd = hem === null ? yRim : Math.min(yRim, hem), r0 = Math.hypot(last[0], last[2] - ctx.C[2]), hx = Math.sin(be), hz = -Math.cos(be);
      for (let m = 1; m <= Nh; m++) {
        const s = m / Nh, y = lerp(yRim, yEnd, s), bes = hang.az && hem !== null ? hang.az(be, s) : be, hxs = Math.sin(bes), hzs = -Math.cos(bes), hrad = hang.tuck ? lerp(hangR(ctx, y, bes), ringDist(ctx, y, bes), hang.tuck) : hangR(ctx, y, bes), rr = lerp(r0, hrad + hang.thick(be, s), hem === null ? 0 : sstep(0, 0.45, s));
        P[Ns - 1 + m].push(hem === null ? [hx * rr, y, ctx.C[2] + hz * rr] : [hxs * rr, y, ctx.C[2] + hzs * rr]); S[Ns - 1 + m].push(o.shade ? o.shade(be, 0, s) : 0.9 - 0.12 * s);
      }
    }
  }
  if (hang) {
    // relax the bend where the skull turns into the drop, then keep every hanging vertex out of the body
    for (let it = 0; it < 2; it++) for (let j = 0; j < n; j++) { const prev: V3[] = []; for (let i = 0; i < Rn; i++) prev.push(P[i][j]); for (let i = Math.max(1, Ns - 1); i < Rn - 1; i++) P[i][j] = [0, 1, 2].map((c) => prev[i - 1][c] * 0.25 + prev[i][c] * 0.5 + prev[i + 1][c] * 0.25) as V3; }
    for (let i = Ns; i < Rn; i++) for (let j = 0; j < n; j++) if (!free[j]) P[i][j] = clearAny(ctx, P[i][j], i === Rn - 1 ? 0.002 : 0.004);
  }
  const ax = o.uvAxis ? norm(o.uvAxis) : undefined, bu = ax ? norm(cross(ax, [1, 0, 0])) : ([0, 0, 0] as V3), bv = ax ? cross(ax, bu) : ([0, 0, 0] as V3);
  mb.grid(P, { rect: SWATCH.hair, wrap: true, center: ctx.C, W: o.W, uv: (i, j, R, C) => {
    if (!ax) return [j / (C - 1), lerp(0.85, 0.2, i / (R - 1))];
    const d = norm(sub(P[i][j % n], ctx.C)), psi = Math.acos(clamp(dot(d, ax), -1, 1)), chi = Math.atan2(dot(d, bv), dot(d, bu));
    return [Math.abs(chi) / Math.PI, lerp(0.85, 0.2, clamp(psi / 2.2))];
  }, shade: (i, j) => S[i][j] });
}

/** the skull cap of most styles; `line` is a hairline (knots, or a ready rim function) */
interface CapOpts extends LineOpts { radius?: (be: number, u: number, skull: number, al: number, rimA: number) => number; rows?: number; cols?: number; up?: (be: number, u: number) => number; shade?: (be: number, u: number, s: number) => number; inner?: (be: number, rim: number) => number; flat?: () => number; uvAxis?: V3 }
function cap(ctx: Ctx, mb: MeshBuilder, line: Knots | ((be: number) => number), thick: (be: number, u: number) => number, o: CapOpts = {}): void {
  if (ctx.underHat) return;
  const rim = typeof line === 'function' ? line : rimFn(ctx, line, o);
  shell(ctx, mb, { be: unif(o.cols ?? colsOf(ctx, 19, 11)), rim, rows: o.rows ?? rowsOf(ctx, 5, 4), thick, radius: o.radius, up: o.up, shade: o.shade, inner: o.inner ? (be) => o.inner!(be, rim(be)) : undefined, flat: o.flat ? () => o.flat!() : undefined, uvAxis: o.uvAxis, W: headW });
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

/** hairlines: height fraction (0 chin, 1 crown) by azimuth from the front: forehead, temple, sideburn, above the ear, behind it, nape (blurred smooth by rimFn) */
const L_FADE: Knots = [[0, 0.8], [0.6, 0.79], [0.98, 0.76], [1.28, 0.71], [1.52, 0.67], [1.85, 0.65], [2.3, 0.57], [2.8, 0.5], [Math.PI, 0.48]];
const L_SHORT: Knots = [[0, 0.79], [0.6, 0.78], [1.0, 0.74], [1.3, 0.66], [1.55, 0.62], [1.85, 0.62], [2.3, 0.52], [2.8, 0.42], [Math.PI, 0.4]];
const L_AFRO: Knots = [[0, 0.85], [0.7, 0.82], [1.1, 0.74], [1.4, 0.64], [1.8, 0.62], [2.3, 0.5], [2.8, 0.43], [Math.PI, 0.42]];
const L_LONG: Knots = [[0, 0.82], [0.6, 0.8], [1.0, 0.73], [1.35, 0.63], [1.7, 0.57], [2.4, 0.52], [Math.PI, 0.5]];
/** ridges that run from the crown to the hem: 1 on the crest, 0 in the groove. n ridges round the head, the crest at azimuth ph */
const ridge = (be: number, n: number, ph = 0): number => 0.5 + 0.5 * Math.cos((be - ph) * n);
/** a rounded lump pattern (curls, twists, locs in a cap): amplitude 0..1 */
const lumps = (be: number, u: number, k: number, ph = 0): number => 0.5 + 0.5 * Math.sin(be * k + ph + u * 4.5) * Math.cos(u * 7.3 + be * 1.7);
/** a parting: a groove down one column (the column at azimuth be0): 1 on it, 0 a column away */
const groove = (be: number, be0: number): number => { const d = Math.abs((((be - be0 + Math.PI) % TAU) + TAU) % TAU - Math.PI); return Math.exp(-Math.pow(d / 0.1, 2)); };
const columnAz = (n: number, j: number): number => (j / n) * TAU;
/** the soft ceiling of a flat top: above the head centre, by the height of the real crown */
const crownUp = (ctx: Ctx, extra: number): number => ctx.lm.crownY - ctx.C[1] + extra;

/** the drop of a hanging style: hem height by azimuth. The hem starts behind the ear (`from`) and drops quickly (an almost vertical front edge, eased), the hem is soft and irregular. */
const hangOf = (ctx: Ctx, from: number, to: number, hemAt: (az: number) => number, rows: number, thick: (be: number, s: number) => number, o: { az?: (be: number, s: number) => number; tuck?: number; irr?: number } = {}): NonNullable<ShellOpts['hang']> => ({
  rows,
  hem: (be) => {
    const az = azOf(be); if (az <= from) return null;
    const irr = (o.irr ?? 0.02) * (rnd(ctx.seed, Math.round(be * 40)) - 0.5) * 2 * sstep(to, to + 0.4, az);
    return lerp(ctx.Y(0.58), hemAt(az) + irr, Math.pow(sstep(from, to, az), 0.55));
  },
  thick, az: o.az, tuck: o.tuck,
});
const bulge = (s: number, top: number, mid: number, tip: number): number => lerp(top, mid, sstep(0, 0.35, s)) * (1 - sstep(0.7, 1, s)) + tip * sstep(0.7, 1, s);
/** the mass narrows towards the back as it falls (the hair gathers behind the shoulders) */
const gatherBack = (k: number) => (be: number, s: number): number => Math.PI + (be - Math.PI) * (1 - k * s);
const WNECK = (ctx: Ctx): Wfn => blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY + 0.02, ctx.lm.chinY - 0.14, p[1]));

/**
 * long locs and box braids: a rounded cap with a parting, and a set of thick tapered tubes that touch each other: a group down the back
 * and a few in front of each shoulder, each ending in a blunt tip at its own length.
 */
interface LockOpts { back: number; front: number; rad: number; drop: number; stagger: number; capCols: number; sides: number; segs: number; sway: number }
function locks(ctx: Ctx, mb: MeshBuilder, o: LockOpts): void {
  const sh = ctx.rig.shoulderL[1], n = o.capCols;
  cap(ctx, mb, L_SHORT, (be, u) => rise(u, 0.3) * (0.011 + 0.006 * sstep(0.3, 1, u)) - 0.004 * groove(be, 0) * sstep(0.15, 0.6, u), {
    cols: n, rows: rowsOf(ctx, 4, 3), wander: 0.3,
    shade: (be, u) => (0.72 + 0.28 * sstep(0, 0.45, u)) * (1 - 0.45 * groove(be, 0) * sstep(0.1, 0.5, u)),
  });
  const W = WNECK(ctx), segs = rowsOf(ctx, o.segs, Math.max(2, o.segs - 1)), specs: Array<{ be0: number; be1: number; y1: number; rad: number }> = [];
  const dB = (2 * o.rad * 0.78) / 0.1;
  for (let k = 0; k < o.back; k++) {
    const be0 = Math.PI + (k - (o.back - 1) / 2) * dB, r = rnd(ctx.seed, 100 + k);
    specs.push({ be0, be1: Math.PI + (be0 - Math.PI) * 0.78, y1: sh - o.drop - o.stagger * r - 0.05 * (1 - Math.abs(be0 - Math.PI) / (dB * o.back * 0.5)), rad: o.rad * (0.94 + 0.12 * r) });
  }
  for (const sx of [-1, 1]) for (let k = 0; k < o.front; k++) {
    const r = rnd(ctx.seed, 200 + k + (sx > 0 ? 7 : 0)), a0 = 1.62 + k * dB * 1.05;
    specs.push({ be0: sx > 0 ? a0 : TAU - a0, be1: sx > 0 ? a0 - 0.55 - 0.1 * k : TAU - (a0 - 0.55 - 0.1 * k), y1: sh - 0.1 - o.stagger * 0.7 * r - 0.03 * k, rad: o.rad * (0.94 + 0.12 * r) });
  }
  specs.forEach((sp, idx) => {
    const y0 = ctx.Y(Math.abs(sp.be0 - Math.PI) < 1.2 ? 0.66 : 0.6), path: V3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = lerp(y0, sp.y1, t), bes = lerp(sp.be0, sp.be1, t * t) + o.sway * Math.sin(t * 5 + idx * 1.7) * t, rd = sp.rad * (0.35 + 0.65 * sstep(0, 0.3, t)) * (1 - 0.42 * Math.pow(t, 1.6)) * (i === segs ? 0.8 : 1);
      const rr = lerp(hangR(ctx, y, bes), ringDist(ctx, y, bes), 0.55 * sstep(0.1, 0.5, t)) + rd * 0.85 + 0.004;
      let q: V3 = clearAny(ctx, [Math.sin(bes) * rr, y, ctx.C[2] - Math.cos(bes) * rr], rd * 1.5 + 0.004);
      { const ty = topY(ctx, q[0], q[2], rd * 1.3 + 0.002); if (i > 0 && ty > q[1] && q[1] < ctx.lm.chinY + 0.03) q = [q[0], Math.min(ty, q[1] + 0.12), q[2]]; }
      // lying over a shoulder: if the point is still under the shoulder's upper surface, slide it outwards until it clears
      const worst = (c: V3): number => Math.max(...([[0, 0, 0], [rd, 0, 0], [-rd, 0, 0], [0, 0, rd], [0, 0, -rd], [0, -rd, 0]] as V3[]).map((o) => penetration(ctx, [c[0] + o[0], c[1] + o[1], c[2] + o[2]])));
      for (let k = 0; k < 16 && worst(q) > 0.003; k++) { const dx = q[0], dz = q[2] - ctx.C[2], l = Math.hypot(dx, dz) || 1; q = [q[0] + (dx / l) * 0.008, q[1], q[2] + (dz / l) * 0.008]; }
      path.push(q);
    }
    tube(mb, path, (_i, t) => { const r = sp.rad * (0.35 + 0.65 * sstep(0, 0.3, t)) * (1 - 0.42 * Math.pow(t, 1.6)) * (t > 0.99 ? 0.8 : 1); return [r, r]; }, o.sides, {
      rect: SWATCH.hair, W, capEnd: true, capStart: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.2, 0.85, i / (R - 1))], shade: (i) => 0.7 + 0.3 * Math.min(1, i / 2) - 0.05 * (idx % 2),
    });
  });
}

/** an afro: a near-spherical mass centred on the skull (a little high), rolling in to the hairline over a long smooth slope (no step at the lower edge) */
function afroBall(ctx: Ctx, mb: MeshBuilder, extra: number, wide: number): void {
  const hw = headRingAt(ctx, ctx.Y(0.62)).rx, Ra = (hw + 0.012 + extra) * wide;
  cap(ctx, mb, L_AFRO, (be, u) => rise(u, 0.3) * 0.004 * lumps(be, u, 8), {
    cols: colsOf(ctx, 22, 12), rows: rowsOf(ctx, 6, 5), wander: 0.5,
    radius: (be, u, R, al, rimA) => lerp(Ra * (1 - 0.08 * sstep(1.9, 3.14, azOf(be))) + 0.0025 * lumps(be, u, 8), R + 0.003, sstep(rimA - 1.25, rimA, al)),
    up: (_be, u) => 0.012 * sstep(0.2, 1, u),
  });
}

/** cornrows: close braids that run from the front hairline to the nape in lines of constant angle about the front-back axis, each a shallow ridge */
function cornrows(ctx: Ctx, mb: MeshBuilder): void {
  if (ctx.underHat) return;
  const NC = colsOf(ctx, 17, 13), NR = rowsOf(ctx, 6, 5), rim = rimFn(ctx, L_FADE, 0), c = ctx.C, P: V3[][] = Array.from({ length: NR }, () => []), Th: number[][] = Array.from({ length: NR }, () => []), nRidge = Math.round((NC - 1) / 2);
  const inside = (p: V3): boolean => { const d = norm(sub(p, c)); return Math.acos(clamp(d[1], -1, 1)) <= rim(Math.atan2(d[0], -d[2] + 0) + (d[0] < 0 ? TAU : 0)); };
  // PEOPLE8: the first and last z of every ridge came out ragged from column to column (the front edge of the braids was a row of skin-coloured teeth): they are collected first, filled where a ray
  // missed, and smoothed across the columns, so the front edge is one soft curve
  const dirs: V3[] = [], zs0: number[] = [], zs1: number[] = [];
  for (let j = 0; j < NC; j++) {
    const tau = lerp(-1.34, 1.34, j / (NC - 1)), dir: V3 = [Math.sin(tau), Math.cos(tau), 0], at = (z: number): V3 | null => { const o: V3 = [0, c[1], z], t = ctx.head.hit(o, dir, 0.5); return isFinite(t) ? add(o, mul(dir, t)) : null; };
    let z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k <= 44; k++) { const z = c[2] - 0.14 + (0.27 * k) / 44; const q = at(z); if (q && inside(q)) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
    dirs.push(dir); zs0.push(z0); zs1.push(z1);
  }
  const fill = (a: number[]): void => { const ok = a.filter((v) => isFinite(v)); const m = ok.length ? ok.reduce((x, y) => x + y, 0) / ok.length : c[2]; for (let j = 0; j < a.length; j++) if (!isFinite(a[j])) a[j] = m; };
  fill(zs0); fill(zs1);
  for (let it = 0; it < 4; it++) for (const a of [zs0, zs1]) { const prev = a.slice(); for (let j = 0; j < a.length; j++) a[j] = 0.25 * prev[Math.max(0, j - 1)] + 0.5 * prev[j] + 0.25 * prev[Math.min(a.length - 1, j + 1)]; }
  for (let j = 0; j < NC; j++) {
    const dir = dirs[j], at = (z: number): V3 | null => { const o: V3 = [0, c[1], z], t = ctx.head.hit(o, dir, 0.5); return isFinite(t) ? add(o, mul(dir, t)) : null; };
    const z0 = zs0[j], z1 = zs1[j];
    const crest = (j % 2 === 1) ? 1 : 0, edge = sstep(0, 2, Math.min(j, NC - 1 - j));
    for (let i = 0; i < NR; i++) {
      const f = i / (NR - 1), z = lerp(z0, z1, f), p = at(z) ?? at(c[2]) ?? ([0, c[1] + 0.09, z] as V3), th = (0.0055 + 0.0085 * crest * sstep(0.04, 0.2, Math.min(f, 1 - f) * 2)) * (0.1 + 0.9 * edge) * (0.4 + 0.6 * sstep(0, 0.1, Math.min(f, 1 - f) + 0.02)) + 0.0025;      // PEOPLE8: the ends keep 40 % of the thickness and a 2.5 mm floor (they tapered to nothing and the skin of the forehead came through as teeth)
      P[i].push(add(p, mul(dir, th))); Th[i].push(crest);
    }
  }
  mb.grid(P, { rect: SWATCH.hair, center: c, W: headW, uv: (i, j, R, C) => [(j / (C - 1)) * (nRidge / 23), lerp(0.85, 0.2, i / (R - 1))], shade: (i, j) => 0.38 + 0.62 * Th[i][j] + 0.1 * (1 - sstep(0, 0.2, i / (NR - 1))) });
}

/** a horseshoe of short hair round the sides and the back: ends in a point at each temple, the top is bare */
function fringe(ctx: Ctx, mb: MeshBuilder): void {
  const rim = rimFn(ctx, [[0, 0.76], [0.9, 0.75], [1.3, 0.62], [1.8, 0.56], [2.4, 0.46], [Math.PI, 0.4]], { wander: 0.5 });
  const wid = (be: number): number => lerp(0, 0.62, sstep(0.95, 1.7, azOf(be))) * (1 - 0.25 * sstep(2.5, 3.14, azOf(be)));
  cap(ctx, mb, rim, (be, u) => (0.0075 * Math.pow(Math.sin(clamp(u) * Math.PI), 0.7) + 0.002) * sstep(0.02, 0.22, wid(be)), {
    rows: rowsOf(ctx, 3, 3), cols: colsOf(ctx, 18, 14),
    inner: (be, rm) => rm - wid(be),
  });
}

const STYLES: Record<HairId, (ctx: Ctx, mb: MeshBuilder) => void> = {
  // a tight cut: thin on the sides, a crisp rounded line-up, a flat-ish top
  lowFade: (ctx, mb) => cap(ctx, mb, L_FADE, (be, u) => 0.0028 + 0.0016 * sstep(0, 0.3, u) + (0.0025 + 0.0085 * sstep(0.42, 0.85, u)) * (1 - 0.5 * sstep(0.9, 1.5, azOf(be)) * (1 - sstep(0.4, 0.8, u))) + 0.003 * front(be) * sstep(0.6, 1, u), { cols: colsOf(ctx, 24, 12), rows: rowsOf(ctx, 5, 4), wander: 0, flat: () => crownUp(ctx, 0.009) }),
  // a tall flat-top block
  highTop: (ctx, mb) => cap(ctx, mb, L_FADE, (_be, u) => 0.004 + 0.003 * sstep(0, 0.3, u) + 0.028 * sstep(0.25, 0.6, u), { cols: colsOf(ctx, 24, 12), rows: rowsOf(ctx, 6, 4), wander: 0, up: (_be, u) => 0.04 * sstep(0.3, 0.75, u), flat: () => crownUp(ctx, 0.052) }),
  // a flat top with a straight cut fringe, hugging the skull
  crop: (ctx, mb) => cap(ctx, mb, L_SHORT, (be, u) => 0.003 + 0.0015 * sstep(0, 0.3, u) + 0.0045 * sstep(0.35, 0.8, u) + 0.004 * front(be) * sstep(0.45, 1, u), { cols: colsOf(ctx, 22, 12), wander: 0.2, flat: () => crownUp(ctx, 0.0075) }),
  // a soft rounded cut with a side parting and a lifted front
  short: (ctx, mb) => {
    const n = colsOf(ctx, 22, 12), part = columnAz(n, 1);
    cap(ctx, mb, L_SHORT, (be, u) => rise(u, 0.28) * (0.006 + 0.01 * sstep(0.3, 0.9, u)) + 0.008 * front(be) * sstep(0.45, 1, u) * (0.6 + 0.4 * Math.cos(be - part)) - 0.004 * groove(be, part) * sstep(0.2, 0.7, u), { cols: n, rows: rowsOf(ctx, 5, 4), peak: 0.01, up: (be, u) => 0.004 * front(be) * sstep(0.5, 1, u), shade: (be, u) => (0.8 + 0.2 * sstep(0, 0.45, u)) * (1 - 0.4 * groove(be, part) * sstep(0.1, 0.5, u)) });
  },
  // a bumpy round outline: curls piled all over
  curls: (ctx, mb) => cap(ctx, mb, L_SHORT, (be, u) => rise(u, 0.3) * (0.01 + 0.011 * (0.5 + 0.5 * Math.sin(be * 12 + u * 5)) * (0.6 + 0.4 * Math.cos(u * 9 + be * 2))), { cols: colsOf(ctx, 26, 14), rows: rowsOf(ctx, 5, 4), wander: 0.3, shade: (be, u) => 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(be * 12 + u * 5)) * sstep(0, 0.35, u) + 0.06 * sstep(0.3, 1, u) }),
  afro: (ctx, mb) => afroBall(ctx, mb, 0.05, 1),
  afroLarge: (ctx, mb) => afroBall(ctx, mb, 0.09, 1.08),
  puff: (ctx, mb) => {
    cap(ctx, mb, L_SHORT, (_be, u) => rise(u, 0.25) * (0.0045 + 0.004 * sstep(0.4, 1, u)), { cols: colsOf(ctx, 20, 11), rows: rowsOf(ctx, 4, 3), uvAxis: [0, 0.3, 1] });
    const b = ctx.Y(0.97); ball(ctx, mb, [0, b + 0.012, ctx.C[2] + 0.075], ctx.H * 0.2, 0.9, 0.03);
  },
  bun: (ctx, mb) => {
    cap(ctx, mb, L_SHORT, (be, u) => rise(u, 0.25) * (0.0045 + 0.004 * sstep(0.4, 1, u)) + 0.004 * Math.exp(-Math.pow((1 - u) * 1.4, 2)) * (1 - 0.5 * front(be)), { cols: colsOf(ctx, 20, 11), rows: rowsOf(ctx, 4, 3), uvAxis: [0, 1, 0.1] });
    ball(ctx, mb, [0, ctx.Y(1.0) + 0.03, ctx.C[2] + 0.04], ctx.H * 0.16, 0.85);
  },
  ponytail: (ctx, mb) => {
    // the hair is swept back to a tie high on the back of the skull (strands converge on it); the tail leaves from the tie
    const al = 0.72, tie = dirOf(al, Math.PI), tieAxis: V3 = tie;
    cap(ctx, mb, L_FADE, (be, u) => 0.0035 + 0.0035 * sstep(0, 0.3, u) + 0.004 * sstep(0.4, 1, u) * front(be) + 0.016 * Math.exp(-(Math.pow(angDist(be, Math.PI) / 0.5, 2) + Math.pow((1 - u) * 1.5 - 0.62, 2) * 0.9)), { cols: colsOf(ctx, 22, 12), rows: rowsOf(ctx, 5, 4), wander: 0.3, uvAxis: tieAxis });
    const root: V3 = add(ctx.C, mul(tie, skullR(ctx, tie) + 0.012)), W = WNECK(ctx);
    const N = ctx.detail === 'hi' ? 7 : 5, path: V3[] = [root], L = 0.3;
    // leaves the tie going back and a little up, arches over and falls: the direction turns evenly, no corner
    let ph = 0.12;
    for (let k = 1; k < N; k++) { const t = k / (N - 1); ph = lerp(0.12, -1.5, sstep(0, 0.55, t)); const prev = path[k - 1], st = L / (N - 1); path.push(clearAny(ctx, [0.006 * Math.sin(t * Math.PI), prev[1] + st * Math.sin(ph), prev[2] + st * Math.cos(ph)], 0.016 * (1 - t) + 0.005)); }
    tube(mb, path, (_i, t) => { const r = 0.004 + 0.02 * (1 - 0.8 * Math.pow(t, 1.5)) * (0.7 + 0.3 * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5)); return [r, r]; }, ctx.detail === 'hi' ? 7 : 5, { rect: SWATCH.hair, W, capEnd: true, capStart: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.2, 0.85, i / (R - 1))], shade: (i) => 0.82 + 0.18 * Math.sin((i / (N + 1)) * Math.PI * 0.9) });
  },
  // short locs and twists: rolled knots all over a close cap, the ends hanging as a scalloped line; twists: short rods radiating from the crown
  locsShort: (ctx, mb) => cap(ctx, mb, L_SHORT, (be, u) => rise(u, 0.3) * (0.014 + 0.016 * lumps(be, u, 11, 0.6)), { cols: colsOf(ctx, 24, 14), rows: rowsOf(ctx, 6, 4), scallop: [12, 0.035], wander: 0.6, shade: (be, u) => 0.74 + 0.26 * lumps(be, u, 11, 0.6) * sstep(0, 0.3, u) + 0.1 * sstep(0.3, 1, u) }),
  twists: (ctx, mb) => {
    const n = colsOf(ctx, 26, 14), nr = n / 2, f = (be: number): number => ridge(be, nr, 0);
    cap(ctx, mb, L_SHORT, (be, u) => 0.006 * sstep(0, 0.25, u) + 0.016 * f(be) * (0.3 + 0.7 * sstep(0, 0.35, u)) + 0.006 * sstep(0.5, 1, u), { cols: n, rows: rowsOf(ctx, 6, 4), wander: 0.4, shade: (be, u) => 0.62 + 0.38 * f(be) * sstep(0, 0.2, u) + 0.06 * sstep(0.3, 1, u) });
  },
  locs: (ctx, mb) => locks(ctx, mb, { back: 5, front: 2, rad: 0.026, drop: 0.07, stagger: 0.12, capCols: colsOf(ctx, 10, 8), sides: 4, segs: 3, sway: 0.05 }),
  boxBraids: (ctx, mb) => locks(ctx, mb, { back: 6, front: 2, rad: 0.0155, drop: 0.12, stagger: 0.14, capCols: colsOf(ctx, 10, 8), sides: 4, segs: 3, sway: 0.035 }),
  cornrows,
  // chin length, tucked behind the ear, side parted with a soft front
  bob: (ctx, mb) => {
    const yb = ctx.lm.chinY - 0.012, n = colsOf(ctx, 22, 12), part = columnAz(n, 1);
    shell(ctx, mb, {
      be: unif(n), rim: rimFn(ctx, L_LONG, { wander: 0.3, peak: 0.01, baby: 0.008 }), rows: rowsOf(ctx, 5, 4), W: headW,
      thick: (be, u) => rise(u, 0.28) * (0.007 + 0.008 * sstep(0.3, 1, u)) + 0.006 * front(be) * sstep(0.5, 1, u) - 0.004 * groove(be, part) * sstep(0.2, 0.7, u),
      shade: (be, u, s) => (s > 0 ? 0.9 - 0.12 * s : (0.8 + 0.2 * sstep(0, 0.45, u)) * (1 - 0.4 * groove(be, part) * sstep(0.1, 0.5, u))),
      hang: hangOf(ctx, 1.3, 1.75, (az) => yb + 0.03 * sstep(1.9, 3.14, az) - 0.01 * (1 - sstep(1.9, 3.14, az)) + 0.02 * (1 - sstep(1.0, 2.6, az)), rowsOf(ctx, 3, 2), (_be, s) => bulge(s, 0.008, 0.021, -0.004), { tuck: 0.2, irr: 0.008 }),
    });
  },
  long: (ctx, mb) => {
    const sh = ctx.rig.shoulderL[1], n = colsOf(ctx, 22, 12), part = columnAz(n, 0);
    shell(ctx, mb, {
      be: unif(n), rim: rimFn(ctx, L_LONG, { wander: 0.3, baby: 0.012 }), rows: rowsOf(ctx, 5, 4), W: WNECK(ctx),
      thick: (be, u) => rise(u, 0.28) * (0.007 + 0.008 * sstep(0.3, 1, u)) + 0.005 * front(be) * sstep(0.5, 1, u) - 0.004 * groove(be, part) * sstep(0.15, 0.6, u),
      shade: (be, u, s) => (s > 0 ? 0.92 - 0.14 * s : (0.8 + 0.2 * sstep(0, 0.45, u)) * (1 - 0.45 * groove(be, part) * sstep(0.1, 0.5, u))),
      hang: hangOf(ctx, 1.4, 1.85, (az) => lerp(sh - 0.04, sh - 0.22, sstep(1.5, 3.14, az)), rowsOf(ctx, 4, 3), (be, s) => bulge(s, 0.008, 0.02, -0.002) + 0.011 * ridge(be, 11) * sstep(0.05, 0.3, s), { az: gatherBack(0.22), tuck: 0.5, irr: 0.03 }),
    });
  },
  wavy: (ctx, mb) => {
    const sh = ctx.rig.shoulderL[1], n = colsOf(ctx, 22, 12), part = columnAz(n, 1);
    shell(ctx, mb, {
      be: unif(n), rim: rimFn(ctx, L_LONG, { wander: 0.3, baby: 0.012 }), rows: rowsOf(ctx, 5, 4), W: WNECK(ctx),
      thick: (be, u) => rise(u, 0.28) * (0.008 + 0.008 * sstep(0.3, 1, u)) + 0.005 * Math.sin(be * 5 + u * 7) * sstep(0.1, 0.5, u) + 0.006 * front(be) * sstep(0.5, 1, u) - 0.004 * groove(be, part) * sstep(0.15, 0.6, u),
      shade: (be, u, s) => (s > 0 ? 0.92 - 0.14 * s + 0.08 * Math.sin(s * 11 + be * 3) : (0.8 + 0.2 * sstep(0, 0.45, u)) * (1 - 0.45 * groove(be, part) * sstep(0.1, 0.5, u))),
      // an S-curve down the length: the mass sways one way then the other, and swells at each bend
      hang: hangOf(ctx, 1.4, 1.85, (az) => lerp(sh - 0.02, sh - 0.14, sstep(1.5, 3.14, az)), rowsOf(ctx, 5, 4), (be, s) => bulge(s, 0.008, 0.019, -0.002) + 0.011 * Math.sin(s * 9 + be * 2) * sstep(0.05, 0.3, s) * (1 - sstep(0.85, 1, s)), { az: (be, s) => gatherBack(0.15)(be, s) + 0.3 * Math.sin(s * 6.3 + 0.3) * sstep(0.05, 0.4, s), tuck: 0.4, irr: 0.03 }),
    });
  },
  receding: (ctx, mb) => {
    // a high, M-shaped front, a thin top, the sides and back kept short
    const line: Knots = [[0, 0.9], [0.5, 0.86], [0.95, 0.76], [1.3, 0.64], [1.8, 0.62], [2.4, 0.46], [Math.PI, 0.38]];
    cap(ctx, mb, line, (be, u) => rise(u, 0.3) * (0.004 + 0.0035 * sstep(0.4, 1, u)) * (1 - 0.35 * sstep(0.7, 1, u) * front(be)), { cols: colsOf(ctx, 22, 11), wander: 0.5 });
  },
  baldFringe: fringe,
  peyos: (ctx, mb) => {
    // curled side locks in front of each ear (the head wears a kippah or a hat)
    for (const sx of [-1, 1]) {
      const d = dirOf(1.42, sx * 1.9 + (sx < 0 ? TAU : 0)), r = skullR(ctx, d), root = add(ctx.C, mul(d, r + 0.003)), path: V3[] = [];
      for (let k = 0; k < 8; k++) { const t = k / 7, th = t * Math.PI * 2.2 + 0.3, rad = 0.0085 * (1 - t * 0.2); path.push([root[0] + sx * (0.007 + rad * Math.cos(th) * 0.8), root[1] - t * ctx.H * 0.3, root[2] + rad * Math.sin(th)]); }
      tube(mb, path, (_i, t) => { const r = 0.0058 * (1 - t * 0.3); return [r, r]; }, 5, { rect: SWATCH.hair, W: headW, capEnd: true, uv: (i, j, R, C) => [j / (C - 1), lerp(0.25, 0.8, i / (R - 1))] });
    }
  },
};
const angDist = (a: number, b: number): number => Math.abs((((a - b + Math.PI) % TAU) + TAU) % TAU - Math.PI);


export function buildHair(id: HairId, ctx: Ctx): Piece {
  const mb = new MeshBuilder(headW);
  STYLES[id](ctx, mb);
  const lifted = relax(ctx, mb);
  return done('hair:' + id, 'hair', mb, lifted);
}

// ---------------------------------------------------------------- beards (low forms on the jaw, for where the face texture is not enough)

export function buildBeard(id: BeardId, ctx: Ctx): Piece {
  const mb = new MeshBuilder(headW);
  // PEOPLE7: the cap is built from a centre on the head's axis at the height of the chin (beard) or the lip (moustache), looking straight forward, so its rays are level like the fit check's.
  // It used to be built from the centre of the skull, 17 degrees below level, which is the nose: the cap covered the eyes and the lips.
  const at = (t: number): Ctx => ({ ...ctx, C: [0, ctx.Y(t), headRingAt(ctx, ctx.Y(t)).cz] as V3 });
  const front: V3 = [0, 0, -1];
  if (id === 'stache') {
    patch(at(0.29), mb, { axis: front, rows: 3, cols: ctx.detail === 'hi' ? 10 : 6, rim: (be) => 0.075 + 0.17 * Math.pow(Math.abs(Math.sin(be)), 1.2), thick: (_be, u) => 0.002 + 0.004 * sstep(0, 0.5, u), rect: SWATCH.hair, W: headW });
  } else {
    const full = id === 'beard';
    patch(at(0.1), mb, { axis: front, rows: rowsOf(ctx, 3, 3), rim: (be) => (full ? (Math.cos(be) >= 0 ? 0.5 + 0.4 * Math.abs(Math.sin(be)) - 0.1 * Math.cos(be) : 0.13 + 0.78 * Math.pow(Math.abs(Math.sin(be)), 6)) : 0.34 + 0.06 * Math.abs(Math.sin(be)) - 0.05 * Math.max(0, Math.cos(be))), thick: (_be, u) => edge(u, 0.0025, full ? 0.012 : 0.01, 0.4) + (full ? 0.006 : 0.004) * sstep(0.6, 1, u), rect: SWATCH.hair, W: headW });
  }
  let lifted = relax(ctx, mb);
  for (let k = 0; k < 3; k++) if (relax(ctx, mb) === 0) break;
  return done('beard:' + id, 'hair', mb, lifted);
}
void clamp; void BONE;
