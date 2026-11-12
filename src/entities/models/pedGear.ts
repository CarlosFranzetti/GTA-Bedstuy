/**
 * Accessories as separate low-poly pieces: glasses and sunglasses, over-ear headphones, earbuds, a backpack, a tote, a messenger bag, a
 * shopping bag in hand, a handbag, a cane, a scarf and a chain (no pendant, no lettering). Bags hug the dressed body of the body type they are
 * on (their straps follow the shoulder ridge), the hand pieces take the wrist of the shifted rig.
 */
import { BONE, MeshBuilder, NEUTRAL, SWATCH, add, blend, clearAny, cross, done, relax, hexLin, lerp, loftY, mul, norm, one, outerX, ribbon, ringPoint, sstep, sub, surfPt, topY, tube, type Ctx, type Piece, type V3, type Wfn } from './pedPiecesKit';

export const ACCESSORY_IDS = ['glasses', 'sunglasses', 'headphones', 'earbuds', 'backpack', 'tote', 'messenger', 'shoppingBag', 'handbag', 'cane', 'scarf', 'chain'] as const;
export type AccessoryId = typeof ACCESSORY_IDS[number];
export const ACC_HEAD: readonly string[] = ['glasses', 'sunglasses', 'headphones', 'earbuds'];

const GEAR = SWATCH.gear;
const headW = one(BONE.head), torsoW = one(BONE.torso);
const front = (be: number): number => Math.max(0, Math.cos(be));

/** the width direction of a ribbon: perpendicular to the path and to the outward normal */
const widthsAlong = (pts: V3[], normals: V3[]): V3[] => pts.map((_p, i) => { const T = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)])); return norm(cross(T, normals[i])); });

function glasses(ctx: Ctx, mb: MeshBuilder, sun: boolean): void {
  const lm = ctx.lm, tint = hexLin(ctx.spec.face.glasses ?? '#1a1a1a', 1), y = lm.eyeY + 0.001, ex = Math.max(0.03, lm.eyeX);
  const w = sun ? 0.027 : 0.024, h = sun ? 0.021 : 0.018;
  const t0 = ctx.head.hit([0, y, ctx.C[2]], [0, 0, -1], 0.4), zf = ctx.C[2] - (isFinite(t0) ? t0 : 0.1) - 0.002;
  const n = 8;
  for (const sx of [-1, 1]) {
    const cx = sx * ex, outer: V3[] = [], inner: V3[] = [];
    for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; outer.push([cx + w * Math.sin(a) * 1.0, y + h * Math.cos(a), zf]); inner.push([cx + (w - 0.0045) * Math.sin(a), y + (h - 0.0045) * Math.cos(a), zf - 0.0004]); }
    mb.grid([outer, inner], { rect: NEUTRAL, wrap: true, flip: true, W: headW, tint, uv: () => [0.5, 0.5] });
    if (sun) { const ctr: V3[] = inner.map(() => [cx, y, zf - 0.0004]); mb.grid([inner, ctr], { rect: NEUTRAL, wrap: true, flip: true, W: headW, tint: [0.03, 0.03, 0.035], uv: () => [0.5, 0.5] }); }
    // the temple arm back to the ear
    const ear = ctx.head.hit([0, y, ctx.C[2] + 0.02], [sx, 0, 0], 0.3), xe = sx * ((isFinite(ear) ? ear : 0.085) + 0.004);
    tube(mb, [[cx + sx * w, y + 0.002, zf], [xe * 0.97, y + 0.002, zf + 0.035], [xe, y, ctx.C[2] + 0.025]], () => [0.0022, 0.0016], 3, { rect: NEUTRAL, W: headW, tint, uv: () => [0.5, 0.5], capEnd: true });
  }
  tube(mb, [[-ex + w, y + 0.006, zf], [0, y + 0.008, zf - 0.002], [ex - w, y + 0.006, zf]], () => [0.0024, 0.0018], 3, { rect: NEUTRAL, W: headW, tint, uv: () => [0.5, 0.5] });
}

function headphones(ctx: Ctx, mb: MeshBuilder): void {
  const ye = ctx.Y(0.45), yt = ctx.lm.crownY + 0.022, z = ctx.C[2], R = (() => { const t = ctx.head.hit([0, ye, z], [1, 0, 0], 0.3); return (isFinite(t) ? t : 0.085) + 0.012; })();
  const tint: V3 = [0.05, 0.05, 0.06], gt = hexLin(ctx.spec.gearColor, 0.35);
  const band: V3[] = [];
  for (let i = 0; i <= 6; i++) { const th = (i / 6) * Math.PI; band.push([-R * Math.cos(th), ye + (yt - ye) * Math.sin(th) * (1 - 0.0) + 0.0, z]); }
  tube(mb, band, (_i, t) => [0.0055, 0.011 + 0.002 * Math.sin(t * Math.PI)], 4, { rect: NEUTRAL, W: headW, tint, uv: () => [0.5, 0.5], capStart: true, capEnd: true, ref: [0, 0, 1] });
  for (const sx of [-1, 1]) {
    const x0 = sx * (R - 0.006), x1 = sx * (R + 0.032);
    tube(mb, [[x0, ye, z], [(x0 + x1) / 2, ye, z], [x1, ye, z]], (i) => (i === 1 ? [0.039, 0.046] : [0.03, 0.037]), 6, { rect: NEUTRAL, W: headW, tint: gt, uv: () => [0.5, 0.5], capStart: true, capEnd: true, ref: [0, 1, 0] });
  }
}

function earbuds(ctx: Ctx, mb: MeshBuilder): void {
  const ye = ctx.Y(0.46), z = ctx.C[2] + 0.004, W = blend(BONE.head, BONE.torso, (p) => sstep(ctx.lm.chinY, ctx.lm.chinY - 0.1, p[1])), white: V3 = [0.9, 0.9, 0.92];
  for (const sx of [-1, 1]) {
    const t = ctx.head.hit([0, ye, z], [sx, 0, 0], 0.3), xs = sx * ((isFinite(t) ? t : 0.085) + 0.006);
    tube(mb, [[xs, ye, z], [xs + sx * 0.011, ye, z]], () => [0.0075, 0.0075], 5, { rect: NEUTRAL, W: headW, tint: white, uv: () => [0.5, 0.5], capEnd: true });
    // the cable down the neck to the chest
    const path: V3[] = [[xs + sx * 0.011, ye, z], [xs + sx * 0.014, ye - 0.05, z + 0.004], ...[0, 1, 2].map((k): V3 => { const y = ctx.lm.chinY - 0.04 - k * 0.07; return ringPoint(ctx, y, sx * (1.0 - k * 0.25) + (sx < 0 ? Math.PI * 2 : 0), 0.007); })];
    tube(mb, path, () => [0.0022, 0.0022], 3, { rect: NEUTRAL, W, tint: white, uv: () => [0.5, 0.5], capEnd: true });
  }
}

function backpack(ctx: Ctx, mb: MeshBuilder): void {
  const kid = ctx.spec.build === 'kid' || ctx.spec.age === 'kid', sh = ctx.rig.shoulderL[1], K = kid ? 0.82 : 1;
  const yTop = sh - 0.02, yBot = yTop - 0.36 * K, depth = 0.13 * K, rings = [];
  const ys = [yBot, lerp(yBot, yTop, 0.3), lerp(yBot, yTop, 0.7), yTop];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i], zb = surfPt(ctx, 0, y, 'back', 0).slice(2)[0] as number;
    const o: V3 = [0, y, 0.5], tL = ctx.torso.hit(o, [-1, 0, 0], 0.6), half = Math.min(0.14 * K, (isFinite(tL) ? tL : 0.2) * 0.7), d = depth * (i === 0 ? 0.8 : 1) * (i === ys.length - 1 ? 0.85 : 1);
    rings.push({ y, rx: half, rz: d / 2, cx: 0, cz: zb + 0.012 + d / 2, e: 3 });
  }
  loftY(mb, rings, ctx.detail === 'hi' ? 8 : 6, { rect: GEAR, capTop: true, capBottom: true, lift: -0.004, liftBottom: 0.0, W: torsoW, uv: (i, j, R, C) => [j / (C - 1), 0.3 + 0.55 * (i / (R - 1))], shade: (i) => 0.82 + 0.18 * (i / (rings.length + 1)) });
  // the front pocket on the back of the pack
  const r1 = rings[1], r2 = rings[2];
  loftY(mb, [{ y: r1.y, rx: r1.rx * 0.78, rz: 0.03, cx: 0, cz: r1.cz + r1.rz * 0.9, e: 3 }, { y: lerp(r1.y, r2.y, 0.85), rx: r2.rx * 0.78, rz: 0.032, cx: 0, cz: r2.cz + r2.rz * 0.92, e: 3 }], 8, { rect: GEAR, capTop: true, capBottom: true, W: torsoW, lift: 0.0, liftBottom: 0.0, shade: () => 0.92, uv: () => [0.5, 0.45] });
  // straps over the shoulders
  for (const sx of [-1, 1]) {
    const x = sx * 0.075, pts: V3[] = [], nrm: V3[] = [];
    const ridge = topY(ctx, x, ctx.C[2] + 0.015, 0.01);
    pts.push(surfPt(ctx, x, yTop - 0.03, 'back', 0.01)); nrm.push([0, 0, 1]);
    pts.push(surfPt(ctx, x, lerp(yTop - 0.03, ridge, 0.7), 'back', 0.01)); nrm.push([0, 0.4, 0.9]);
    pts.push([x, ridge, ctx.C[2] + 0.012]); nrm.push([0, 1, 0]);
    pts.push(surfPt(ctx, x * 1.1, ridge - 0.05, 'front', 0.01)); nrm.push([0, 0.4, -0.9]);
    pts.push(surfPt(ctx, x * 1.4, ridge - 0.16, 'front', 0.01)); nrm.push([0, 0, -1]);
    ribbon(mb, pts, widthsAlong(pts, nrm), 0.0125, { rect: GEAR, centre: [0, ridge - 0.1, ctx.C[2]], W: torsoW, shade: 0.7, uvt: [0.5, 0.2] });
  }
}

/** the side bag: a rounded box hanging at the side of the body, at the outside of the arm */
function sideBag(ctx: Ctx, mb: MeshBuilder, o: { sx: -1 | 1; yTop: number; h: number; hw: number; d: number; strap: boolean; handles: boolean; z?: number; bone?: number }): void {
  const sh = ctx.rig.shoulderL[1], x0 = outerX(ctx, o.yTop - o.h, o.yTop, o.sx), cx = x0 + o.sx * (o.d / 2 + 0.014), cz = (o.z ?? ctx.C[2]) + 0.0;
  const rings = [0, 0.5, 1].map((t, i) => ({ y: o.yTop - o.h + t * o.h, rx: o.d / 2 * (i === 1 ? 1.08 : 1), rz: o.hw * (i === 0 ? 0.92 : 1), cx, cz, e: 3.2 }));
  const W = one(o.bone ?? BONE.torso);
  loftY(mb, rings, ctx.detail === 'hi' ? 8 : 6, { rect: GEAR, capTop: true, capBottom: true, lift: -0.002, W, uv: (i, j, R, C) => [j / (C - 1), 0.3 + 0.5 * (i / (R - 1))], shade: (i) => 0.84 + 0.16 * (i / 4) });
  if (o.handles || o.strap) {
    const ridge = topY(ctx, o.sx * 0.1, ctx.C[2], 0.012);
    for (const dz of o.handles ? [-1, 1] : [0]) {
      const a: V3 = [cx, o.yTop - 0.005, cz + dz * o.hw * 0.55], b: V3 = [x0 + o.sx * 0.012, lerp(o.yTop, ridge, 0.55), cz + dz * 0.02], c: V3 = [o.sx * 0.1, ridge, ctx.C[2] + dz * 0.012];
      tube(mb, [a, b, c], () => [o.strap ? 0.011 : 0.0055, 0.0045], 3, { rect: GEAR, W: torsoW, tint: [0.7, 0.7, 0.7], uv: () => [0.5, 0.2], capEnd: true, capStart: true });
    }
  }
  void sh;
}

function messenger(ctx: Ctx, mb: MeshBuilder): void {
  const hy = ctx.lm.hemY, sx = 1 as const, sh = ctx.rig.shoulderL[1];
  const x0 = outerX(ctx, hy - 0.1, hy + 0.2, sx), cx = x0 + 0.05, cz = ctx.C[2] + 0.03, W: Wfn = blend(BONE.hips, BONE.torso, (p) => sstep(hy - 0.1, hy + 0.2, p[1]));
  const rings = [[hy - 0.1, 0.045, 0.125], [hy + 0.04, 0.052, 0.135], [hy + 0.2, 0.046, 0.125]].map(([y, rx, rz]) => ({ y, rx, rz, cx, cz, e: 3.2 }));
  loftY(mb, rings, ctx.detail === 'hi' ? 8 : 6, { rect: GEAR, capTop: true, capBottom: true, lift: -0.003, W, uv: (i, j, R, C) => [j / (C - 1), 0.3 + 0.5 * (i / (R - 1))], shade: (i) => 0.84 + 0.16 * (i / 4) });
  // the cross-body strap: from the bag over the chest to the far shoulder and down the back
  const ridge = topY(ctx, -0.085, ctx.C[2] + 0.01, 0.012), a = hy + 0.2;
  const fp: V3[] = [[0.1, a, 0], [0.07, lerp(a, ridge, 0.3), 0], [0.02, lerp(a, ridge, 0.65), 0], [-0.07, ridge - 0.05, 0]].map(([x, y]) => surfPt(ctx, x, y, 'front', 0.012));
  const bp: V3[] = [[-0.09, ridge - 0.04, 0], [-0.05, lerp(ridge, a, 0.35), 0], [0.02, lerp(ridge, a, 0.7), 0], [0.1, a, 0]].map(([x, y]) => surfPt(ctx, x, y, 'back', 0.012));
  const top: V3 = [-0.085, ridge, ctx.C[2] + 0.01], pts = [...fp, top, ...bp], nrm: V3[] = [...fp.map((): V3 => [0, 0, -1]), [0, 1, 0], ...bp.map((): V3 => [0, 0, 1])];
  ribbon(mb, pts, widthsAlong(pts, nrm), 0.014, { rect: GEAR, centre: [0, hy + 0.3, ctx.C[2]], W: blend(BONE.torso, BONE.hips, (p) => sstep(sh - 0.2, hy, p[1])), shade: 0.72, uvt: [0.5, 0.2] });
}

function shoppingBag(ctx: Ctx, mb: MeshBuilder): void {
  const w = ctx.rig.wristL, W = one(BONE.elbowL), wy = w[1], wx = w[0], wz = w[2];
  const hip = Math.abs(outerX(ctx, wy - 0.4, wy - 0.05, -1, true)), cxb = -Math.max(Math.abs(wx), hip + 0.062), rings = [[wy - 0.36, 0.045, 0.1], [wy - 0.22, 0.056, 0.115], [wy - 0.09, 0.052, 0.11]].map(([y, rx, rz]) => ({ y, rx, rz, cx: cxb, cz: wz - 0.012, e: 4 }));
  loftY(mb, rings, ctx.detail === 'hi' ? 8 : 6, { rect: GEAR, capBottom: true, capTop: true, liftBottom: 0, lift: -0.004, W, uv: (i, j, R, C) => [j / (C - 1), 0.35 + 0.5 * (i / (R - 1))], shade: (i) => 0.86 + 0.14 * (i / 4) });
  const arch: V3[] = [0, 1, 2, 3, 4].map((k) => { const a = (k / 4) * Math.PI; return [cxb, wy - 0.09 + 0.1 * Math.sin(a) + 0.0, wz - 0.012 - 0.06 * Math.cos(a)]; });
  tube(mb, arch, () => [0.0055, 0.0055], 3, { rect: GEAR, W, tint: [0.8, 0.8, 0.8], uv: () => [0.5, 0.25], capStart: true, capEnd: true });
}

function cane(ctx: Ctx, mb: MeshBuilder): void {
  const w = ctx.rig.wristR, hand: V3 = [w[0] - 0.003, w[1] - 0.012, w[2] - 0.02], W: Wfn = blend(BONE.elbowR, BONE.rig, (p) => sstep(hand[1] - 0.05, 0.25, 1 - p[1] + 0.0) * 0 + sstep(hand[1] - 0.08, 0.4, hand[1] - p[1]));
  const wood: V3 = [0.2, 0.1, 0.04];
  tube(mb, [hand, [hand[0], 0.38, hand[2] - 0.05], [hand[0], 0.0, hand[2] - 0.1]].map((p) => clearAny(ctx, p as V3, 0.014)), (_i, t) => [0.0105 - 0.002 * t, 0.0105 - 0.002 * t], 5, { rect: NEUTRAL, W, tint: wood, uv: () => [0.5, 0.5], capEnd: true });
  // the crook: a short curved handle above the hand
  const hook: V3[] = [0, 1, 2, 3, 4].map((k) => { const a = (k / 4) * Math.PI * 0.9; return clearAny(ctx, [hand[0], hand[1] + 0.045 * Math.sin(a), hand[2] + 0.045 - 0.045 * Math.cos(a)], 0.014); });
  tube(mb, hook, (_i, t) => [0.0125 - 0.003 * t, 0.0125 - 0.003 * t], 5, { rect: NEUTRAL, W: one(BONE.elbowR), tint: wood, uv: () => [0.5, 0.5], capEnd: true });
}

function scarf(ctx: Ctx, mb: MeshBuilder): void {
  const y0 = ctx.lm.chinY - 0.115, y1 = ctx.lm.chinY - 0.012, cols = ctx.detail === 'hi' ? 12 : 8, P: V3[][] = [];
  for (const [t, off] of [[0, 0.016], [0.5, 0.032], [1, 0.02]] as const) {
    const row: V3[] = [];
    for (let j = 0; j < cols; j++) { const be = (j / cols) * Math.PI * 2; row.push(ringPoint(ctx, lerp(y0, y1, t), be, off + 0.008 * Math.sin(be * 2 + t * 3) + 0.01 * (1 - front(be)) * t)); }
    P.push(row);
  }
  mb.grid(P, { rect: GEAR, wrap: true, center: [0, lerp(y0, y1, 0.5), ctx.C[2]], W: torsoW, uv: (i, j, R, C) => [j / (C - 1), 0.3 + 0.4 * (i / (R - 1))], shade: (i, j) => 0.8 + 0.2 * (i / 2) + 0.05 * Math.sin(j * 1.7) });
  // a tail hanging down the chest
  const tx = 0.03, pts = [0, 1, 2, 3].map((k) => surfPt(ctx, tx + 0.006 * k, y0 + 0.01 - 0.075 * k, 'front', 0.03 - 0.005 * k)), nrm = pts.map((): V3 => [0, 0, -1]);
  ribbon(mb, pts, widthsAlong(pts, nrm), 0.026, { rect: GEAR, centre: [0, y0 - 0.1, ctx.C[2] + 0.2], W: torsoW, shade: 0.9, uvt: [0.5, 0.5] });
}

function chain(ctx: Ctx, mb: MeshBuilder): void {
  const path: V3[] = [], n = ctx.detail === 'hi' ? 10 : 7, y0 = ctx.lm.chinY - 0.05;
  for (let k = 0; k <= n; k++) { const be = Math.PI * 0.1 + (k / n) * (Math.PI * 2 - Math.PI * 0.2) + Math.PI; const b = be % (Math.PI * 2); path.push(ringPoint(ctx, y0 - 0.12 * Math.pow(front(b), 1.5), b, 0.009 + 0.0 * front(b))); }
  tube(mb, path, () => [0.0035, 0.0035], 3, { rect: NEUTRAL, W: torsoW, tint: [0.95, 0.6, 0.12], uv: () => [0.5, 0.5] });
}

const BUILD: Record<AccessoryId, (ctx: Ctx, mb: MeshBuilder) => void> = {
  glasses: (c, m) => glasses(c, m, false), sunglasses: (c, m) => glasses(c, m, true), headphones, earbuds, backpack, scarf, chain, cane,
  tote: (c, m) => sideBag(c, m, { sx: -1, yTop: c.lm.hemY + 0.12, h: 0.36, hw: 0.15, d: 0.06, strap: false, handles: true }),
  handbag: (c, m) => sideBag(c, m, { sx: 1, yTop: c.lm.hemY + 0.06, h: 0.2, hw: 0.1, d: 0.07, strap: true, handles: false, z: c.C[2] + 0.02 }),
  messenger, shoppingBag,
};
const BONE_OF: Record<AccessoryId, 'accessory' | 'bag'> = { glasses: 'accessory', sunglasses: 'accessory', headphones: 'accessory', earbuds: 'accessory', backpack: 'bag', tote: 'bag', messenger: 'bag', shoppingBag: 'bag', handbag: 'bag', cane: 'accessory', scarf: 'accessory', chain: 'accessory' };
export function buildAccessory(id: AccessoryId, ctx: Ctx): Piece {
  const mb = new MeshBuilder(torsoW);
  BUILD[id](ctx, mb);
  const lifted = relax(ctx, mb);
  return done('acc:' + id, BONE_OF[id], mb, lifted);
}
void clearAny;
