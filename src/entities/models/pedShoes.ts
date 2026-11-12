/**
 * Shoes as proper low-poly forms: sneakers (low and high), work boots, dress shoes, flats and sandals. One lofted foot per shoe (toe to heel,
 * a half superellipse section with a flat sole and a slightly wider sole edge), plus a shaft of rings round the leg for high tops and boots.
 * The skin's own foot is cut away by pedMesh (noFoot); the shoe takes the shoe swatch: u round the section from the middle of the sole, v toe to heel.
 * Each shoe is rigid to its knee bone. About 110 to 150 triangles a shoe (sandals about 170).
 */
import { BONE, MeshBuilder, SWATCH, done, legAt, lerp, loftY, one, tube, type Ctx, type Piece, type V3 } from './pedPiecesKit';

export const SHOE_IDS = ['sneakerLow', 'sneakerHigh', 'workBoot', 'dressShoe', 'flat', 'sandal'] as const;
export type ShoeId = typeof SHOE_IDS[number];

interface Style { len: number; T: number[]; W: number[]; H: number[]; /** sole height and how far the sole edge sticks out */ sh: number; s: number; /** the arch lifted off the ground (dress shoes) and the toe spring */ arch: number; toeUp: number; shaft?: { top: number; pad: number; cuff?: number } }
const T5 = [0, 0.14, 0.42, 0.75, 1];
const STYLES: Record<Exclude<ShoeId, 'sandal'>, Style> = {
  sneakerLow: { len: 0.19, T: T5, W: [0.019, 0.039, 0.046, 0.04, 0.034], H: [0.036, 0.062, 0.078, 0.108, 0.132], sh: 0.012, s: 0.006, arch: 0, toeUp: 0.012 },
  sneakerHigh: { len: 0.19, T: T5, W: [0.019, 0.039, 0.046, 0.04, 0.034], H: [0.036, 0.062, 0.078, 0.108, 0.132], sh: 0.012, s: 0.006, arch: 0, toeUp: 0.012, shaft: { top: 0.205, pad: 0.009 } },
  workBoot: { len: 0.2, T: T5, W: [0.022, 0.042, 0.05, 0.045, 0.038], H: [0.05, 0.078, 0.095, 0.122, 0.145], sh: 0.016, s: 0.009, arch: 0.006, toeUp: 0.01, shaft: { top: 0.225, pad: 0.012, cuff: 0.014 } },
  dressShoe: { len: 0.225, T: T5, W: [0.01, 0.03, 0.04, 0.038, 0.033], H: [0.026, 0.045, 0.058, 0.095, 0.128], sh: 0.01, s: 0.002, arch: 0.012, toeUp: 0.014 },
  flat: { len: 0.2, T: T5, W: [0.016, 0.036, 0.043, 0.039, 0.033], H: [0.022, 0.04, 0.052, 0.09, 0.126], sh: 0.006, s: 0.002, arch: 0.004, toeUp: 0.01 },
};

/** which shoe a person wears, from the swatch spec and the outfit */
export function shoeIdFor(spec: Ctx['spec']): ShoeId {
  const c = spec.shoes.color.toLowerCase(), dark = /^#[0-3][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]$/.test(c), brown = /^#[5-9][0-9a-f][2-6][0-9a-f][0-3][0-9a-f]$/.test(c);
  const formal = ['jacket', 'uniform', 'cardigan', 'blouse', 'dress'].includes(spec.top.kind);
  const hash = (() => { let h = 2166136261; for (let i = 0; i < spec.id.length; i++) { h ^= spec.id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; })();
  if (spec.shoes.high) return brown || spec.top.kind === 'vest' || spec.top.kind === 'puffer' && brown ? 'workBoot' : 'sneakerHigh';
  if (spec.bottom.kind === 'shorts' && hash < 0.35 && spec.sex !== 'm') return 'sandal';
  if (spec.top.kind === 'dress' && hash < 0.4) return 'sandal';
  if (spec.sex === 'f' && formal && !/^#f/i.test(c)) return 'flat';
  if (dark && formal && spec.sex !== 'f') return 'dressShoe';
  if (spec.role === 'cop' || (dark && spec.top.kind === 'uniform')) return 'dressShoe';
  if (brown && !spec.shoes.high) return 'workBoot';
  return 'sneakerLow';
}

/** the cross-section of a shoe as a ring (flat sole, a sole edge that sticks out, a wall, a rounded shoulder, the top): points (x, y, u) */
function section(w: number, h: number, sh: number, s: number): Array<[number, number, number]> {
  const half: Array<[number, number, number]> = [[w + s, 0, 0.05], [w + s, sh, 0.1], [w * 0.97, sh + (h - sh) * 0.45, 0.2], [w * 0.62, h * 0.95, 0.33]];
  return [[0, 0, 0], ...half, [0, h, 0.5], ...half.slice().reverse().map(([x, y, u]) => [-x, y, 1 - u] as [number, number, number])];
}
function foot(ctx: Ctx, mb: MeshBuilder, side: 'L' | 'R', st: Style, o: { rect: typeof SWATCH.shoe }): void {
  const a = ctx.ankle[side], sc = Math.min(1.15, Math.max(0.85, (ctx.lm.crownY / 1.78) * (0.9 + 0.1 * ctx.bt.legs))), W = one(side === 'L' ? BONE.kneeL : BONE.kneeR);
  const zHeel = a.cz + a.rz + 0.016, zToe = a.cz - st.len * sc, P: V3[][] = [], U: number[][] = [];
  const stations = ctx.detail === 'hi' ? st.T : [0, 0.3, 0.75, 1];
  const prof = (arr: number[], t: number): number => { for (let i = 1; i < st.T.length; i++) if (t <= st.T[i]) return lerp(arr[i - 1], arr[i], (t - st.T[i - 1]) / (st.T[i] - st.T[i - 1] || 1)); return arr[arr.length - 1]; };
  for (const t of stations) {
    const z = zToe + t * (zHeel - zToe), w = Math.max(prof(st.W, t) * sc, t >= 0.99 ? a.rx + 0.006 : 0), h = prof(st.H, t) * sc;
    const lift = st.toeUp * sc * Math.pow(1 - Math.min(1, t / 0.25), 2) + st.arch * sc * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.2) / 0.55)));
    const sec = section(w, h, st.sh * sc, st.s * sc);
    P.push(sec.map(([x, y]) => [a.cx + x, lift + y, z] as V3)); U.push(sec.map((p) => p[2]));
  }
  const first = P[0], last = P[P.length - 1], cy = (r: V3[]): number => r.reduce((acc, p) => acc + p[1], 0) / r.length;
  P.unshift(first.map(() => [a.cx, cy(first) * 0.9, first[0][2] - 0.007] as V3)); U.unshift(U[0]);
  P.push(last.map(() => [a.cx, cy(last), last[0][2] + 0.009] as V3)); U.push(U[U.length - 1]);
  const n = P.length;
  mb.grid(P, { rect: o.rect, wrap: true, center: [a.cx, 0.04, (zToe + zHeel) / 2], W, uv: (i, j, R, C) => [U[i][j % U[i].length], 1 - Math.min(1, Math.max(0, (i - 1) / (n - 3)))], shade: (_i, j) => (j <= 1 || j >= 9 ? 0.8 : 1) });
}

function shaft(ctx: Ctx, mb: MeshBuilder, side: 'L' | 'R', st: Style): void {
  if (!st.shaft) return;
  const y0 = 0.1, y1 = st.shaft.top, rings = [0, 0.55, 1].map((t, i, arr) => {
    const y = lerp(y0, y1, t), l = legAt(ctx, side, Math.max(y, ctx.lm.ankleY + 0.03)), pad = st.shaft!.pad + (i === arr.length - 1 ? st.shaft!.cuff ?? 0.004 : 0);
    return { y, rx: l.rx + pad, rz: l.rz + pad, cx: l.cx, cz: l.cz, e: 2.2 };
  });
  loftY(mb, rings, ctx.detail === 'hi' ? 8 : 6, { rect: SWATCH.shoe, W: one(side === 'L' ? BONE.kneeL : BONE.kneeR), uv: (i, j, R, C) => [0.5 + 0.3 * Math.sin((j / (C - 1)) * Math.PI * 2) * 0, 0.9 - 0.05 * i], shade: (i) => (i === rings.length - 1 && st.shaft!.cuff ? 0.75 : 0.95) });
}

function sandal(ctx: Ctx, mb: MeshBuilder, side: 'L' | 'R'): void {
  const st: Style = { len: 0.2, T: T5, W: [0.016, 0.036, 0.042, 0.04, 0.034], H: [0.014, 0.03, 0.042, 0.066, 0.1], sh: 0.001, s: 0, arch: 0, toeUp: 0.004 };
  const hand = { x: 256, y: 256, w: 128, h: 64 };
  foot(ctx, mb, side, st, { rect: hand });
  // sole slab
  const a = ctx.ankle[side], W = one(side === 'L' ? BONE.kneeL : BONE.kneeR), sc = 1, zHeel = a.cz + a.rz + 0.02, zToe = a.cz - 0.205 * sc, widths = [0.018, 0.04, 0.046, 0.042, 0.036];
  const rings = [0, 0.2, 0.5, 0.8, 1].map((t, i) => ({ y: 0.0045 + (i === 0 ? 0.002 : 0), rx: widths[i] + 0.004, rz: (zHeel - zToe) / 10, cx: a.cx, cz: zToe + t * (zHeel - zToe), e: 2 }));
  void rings;
  const P: V3[][] = [0, 2, 4].map((i) => { const t = i / 4, z = zToe + t * (zHeel - zToe), w = widths[i] + 0.004; return [0, 1, 2, 3, 4, 5].map((j) => { const k = (j / 6) * Math.PI * 2; return [a.cx + w * Math.sin(k), (j === 0 || j === 1 || j === 5) ? 0.0 : 0.011, z] as V3; }); });
  mb.grid(P, { rect: SWATCH.shoe, wrap: true, center: [a.cx, 0.006, (zToe + zHeel) / 2], W, uv: (i, j, R, C) => [(j / (C - 1)) * 0.12, 1 - i / 2], shade: () => 0.8 });
  // two straps over the instep
  const strap = (t: number, k: number): void => {
    const z = zToe + t * (zHeel - zToe), w = widths[Math.round(t * 4)], h = 0.012 + k;
    tube(mb, [[a.cx - w - 0.002, 0.008, z], [a.cx - w * 0.7, h + 0.012, z], [a.cx, h + 0.02, z], [a.cx + w * 0.7, h + 0.012, z], [a.cx + w + 0.002, 0.008, z]], () => [0.0055, 0.0032], 3, { rect: SWATCH.shoe, W, uv: () => [0.5, 0.5], capStart: true, capEnd: true });
  };
  strap(0.3, 0.0); strap(0.6, 0.012);
}

export function buildShoes(id: ShoeId, ctx: Ctx): Piece[] {
  const out: Piece[] = [];
  for (const side of ['L', 'R'] as const) {
    const mb = new MeshBuilder(one(side === 'L' ? BONE.kneeL : BONE.kneeR));
    if (id === 'sandal') sandal(ctx, mb, side);
    else { const st = STYLES[id]; foot(ctx, mb, side, st, { rect: SWATCH.shoe }); shaft(ctx, mb, side, st); }
    out.push(done(`shoe:${id}:${side}`, 'shoe', mb));
  }
  return out;
}
