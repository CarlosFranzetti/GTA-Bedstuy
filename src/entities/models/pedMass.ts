/**
 * BODY seat (second shift): where a person carries their weight, fitted to survey girths.
 *
 * Measured on the built bare bodies (hull of the mesh at survey landmark heights, tests/unit/entities/body-slice-probe.test.ts): the trunk was a slab,
 * wide enough but 20 to 30 percent too shallow front to back (chest depth 0.100 of stature against the survey's 0.145, waist 0.108 against 0.134), the legs were
 * straight cones (an ankle as thick as a calf) and the arms and neck thin. This module takes a body type's design BMI, reads the girths of that BMI band
 * from docs/reference/gta5-characters.md (section 3a: ANSUR II medians by BMI, men and women), and closes the gap with smooth deformers: slice the hi mesh, compare,
 * move (x scale about the spine, front and back shifts, radial scale about each limb's axis), measure again, four passes. The passes are kept and replayed on
 * the mid and far levels, so the three levels and their silhouettes agree. All numbers are shares of stature (the shape's crown height).
 */
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec } from '@/textures/painters/ped';

const BMI = [17.5, 20.25, 23.5, 26.25, 28.75, 32.5, 37];
interface Band { waistG: number[]; waistD: number[]; hipW: number[]; thigh: number[]; biceps: number[]; neck: number[]; chestD: number; hipD: number; chestG: number[] }
const BANDS: Record<'m' | 'f', Band> = {
  m: { waistG: [.401, .437, .476, .516, .553, .596, .661], waistD: [.099, .108, .117, .128, .139, .154, .174], hipW: [.173, .180, .187, .194, .200, .207, .221], thigh: [.273, .300, .327, .349, .365, .385, .419], biceps: [.157, .173, .187, .200, .209, .219, .238], neck: [.191, .206, .215, .223, .230, .239, .251], chestD: .145, hipD: .140, chestG: [.506, .522, .558, .588, .616, .650, .703] },
  f: { waistG: [.416, .459, .498, .539, .577, .620, .689], waistD: [.103, .110, .120, .134, .144, .160, .180], hipW: [.193, .201, .211, .221, .228, .238, .257], thigh: [.310, .337, .363, .387, .403, .426, .472], biceps: [.154, .165, .179, .190, .201, .220, .233], neck: [.185, .191, .197, .203, .210, .217, .223], chestD: .151, hipD: .142, chestG: [.492, .526, .558, .589, .621, .657, .693] },
};
const at = (tab: number[], bmi: number): number => {
  if (bmi <= BMI[0]) return tab[0] + (tab[1] - tab[0]) * (bmi - BMI[0]) / (BMI[1] - BMI[0]);
  for (let i = 1; i < BMI.length; i++) if (bmi <= BMI[i]) return tab[i - 1] + (tab[i] - tab[i - 1]) * (bmi - BMI[i - 1]) / (BMI[i] - BMI[i - 1]);
  const n = BMI.length - 1; return tab[n] + (tab[n] - tab[n - 1]) * (bmi - BMI[n]) / (BMI[n] - BMI[n - 1]);
};
/** design BMI of a body type: [trunk (waist, seat), limbs (thigh, arm, neck)]. The street is heavy (median civilian adult about 28): `avg` is a civilian average, not a soldier. */
export const TYPE_BMI: Record<string, [number, number]> = {
  avg: [26.5, 26.5], slim: [21.5, 21.5], athletic: [23, 27], heavy: [32.5, 32], 'tall-thin': [19.5, 19.5], 'short-stocky': [29.5, 30.5], broad: [27, 29.5], pear: [27.5, 29], petite: [21, 21],
  elder: [27.5, 25], lanky: [19.5, 19.5], swimmer: [21.5, 25.5], 'stoop-slim': [22.5, 21.5], 'elder-heavy': [34, 30], 'big-tall': [33.5, 33.5], pregnant: [26, 26], stout: [33.5, 33], slight: [19.5, 19.5], teen: [20.5, 20.5], 'lean-teen': [18.5, 18.5], kid: [0, 0],
};
/** the share of a trunk's added depth that goes to the front (the rest is the back): belly and chest forward, seat and shoulder blades back */
const FRONT = { chest: 0.58, waist: 0.78, seat: 0.36 };
const CTRL_T = [0.43, 0.50, 0.602, 0.735, 0.86];

interface Targets { waistW: number; waistD: number; hipW: number; hipD: number; chestD: number; thigh: number; calf: number; ankle: number; biceps: number; forearm: number; neck: number; bust: number; chestKx: number }
export function massTargets(sex: 'm' | 'f', id: string): Targets | null {
  const bmi = TYPE_BMI[id]; if (!bmi || bmi[0] === 0) return null;
  const B = BANDS[sex], [bt, bl] = bmi;
  let waistD = at(B.waistD, bt), waistG = at(B.waistG, bt), hipBoost = id === 'pear' ? 0.012 : 0;
  if (id === 'pregnant') { waistD = 0.166; waistG = 0.62; }
  const ref = sex === 'm' ? 0.134 : 0.128;
  const thigh = (at(B.thigh, bl) + hipBoost * 1.6) * 0.965, bic = at(B.biceps, bl) * 0.93;
  const th0 = sex === 'm' ? 0.356 : 0.377, k = thigh / (th0 * 0.965);
  return {
    waistD, waistW: waistG / 1.668 - waistD, hipW: (at(B.hipW, bt) + hipBoost) * 1.07,
    hipD: B.hipD * Math.pow(waistD / ref, 0.5) * 0.97 + (id === 'pregnant' ? 0.008 : 0),
    chestD: B.chestD * Math.pow(waistD / ref, 0.6) * (id === 'athletic' || id === 'swimmer' || id === 'broad' ? 1.04 : 1) + (id === 'pregnant' ? 0.008 : 0),
    thigh, calf: (sex === 'm' ? 0.223 : 0.228) * Math.pow(k, 0.55) * 0.97, ankle: (sex === 'm' ? 0.130 : 0.132) * Math.pow(k, 0.2) * 1.05,
    biceps: bic, forearm: (sex === 'm' ? 0.177 : 0.162) * 0.88 * Math.pow(bic / (sex === 'm' ? 0.186 : 0.173), 0.7), neck: at(B.neck, bl) * 0.97,
    bust: sex === 'f' ? 0.012 + 0.004 * Math.max(0, bt - 24) / 4 : 0, chestKx: 0.5,
  };
}

// ---------------------------------------------------------------- measuring
const ell = (w: number, d: number): number => { const a = w / 2, b = d / 2, h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); };
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
interface Hull { x0: number; x1: number; z0: number; z1: number; ok: boolean }
function wset(L: MhLod, set: number[]): Float32Array { const n = L.position.length / 3, w = new Float32Array(n); for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) w[i] += L.weights[i * 4 + k]; return w; }
function hull(L: MhLod, pos: Float32Array, y: number, pred: (i: number) => boolean): Hull {
  const h: Hull = { x0: 9, x1: -9, z0: 9, z1: -9, ok: false };
  for (let t = 0; t < L.index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = L.index[t + k], b = L.index[t + (k + 1) % 3]; if (!pred(a) || !pred(b)) continue;
    const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1]; if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
    const u = (y - ya) / (yb - ya), x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * u, z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * u;
    h.ok = true; h.x0 = Math.min(h.x0, x); h.x1 = Math.max(h.x1, x); h.z0 = Math.min(h.z0, z); h.z1 = Math.max(h.z1, z);
  }
  return h;
}
const interp = (xs: number[], vs: number[], y: number): number => {
  if (y <= xs[0]) return vs[0]; if (y >= xs[xs.length - 1]) return vs[vs.length - 1];
  for (let i = 1; i < xs.length; i++) if (y <= xs[i]) return vs[i - 1] + (vs[i] - vs[i - 1]) * (y - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return vs[vs.length - 1];
};

/** one fitting pass: what to do to every vertex (the same recipe is replayed on the other levels) */
interface Pass {
  ty: number[]; kx: number[]; sf: number[]; sb: number[]; cz: number[]; xr: number[]; bust: number;
  limb: Array<{ ys: number[]; k: number[]; ax: number[]; az: number[]; arm: boolean }>; neck?: { y0: number; y1: number; k: number; ax: number; az: number };
}
export interface MassFit { passes: Pass[]; sex: 'm' | 'f'; id: string }
const LIMB_Y = { leg: [0.045, 0.075, 0.19, 0.44, 0.5], arm: [0.40, 0.48, 0.565, 0.72, 0.78] };

function applyPass(L: MhLod, pos: Float32Array, P: Pass, H: number, W: { arm: Float32Array; leg: Float32Array; head: Float32Array }, K: number): void {
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    let x = pos[i * 3], y = pos[i * 3 + 1] / H, z = pos[i * 3 + 2];
    const wArm = Math.min(1, W.arm[i]), wLeg = Math.min(1, W.leg[i]);
    // trunk (and the pelvis end of the legs): x scale about the spine, front and back shifts
    if (y > P.ty[0] && y < P.ty[P.ty.length - 1]) {
      const wt = Math.max(0, 1 - wArm) * (1 - W.head[i]);
      const kx = interp(P.ty, P.kx, y), cz = interp(P.ty, P.cz, y), xr = interp(P.ty, P.xr, y), sf = interp(P.ty, P.sf, y), sb = interp(P.ty, P.sb, y);
      const f = Math.pow(Math.max(0, 1 - (x / (xr * H * 1.12)) ** 2), 0.6), wb = sstep(-0.03 * K, 0.03 * K, z - cz * H), wf = 1 - wb;
      x *= 1 + (kx - 1) * wt;
      z += (-sf * wf + sb * wb) * H * f * wt;
      if (P.bust) z -= P.bust * H * wf * wt * Math.exp(-(((y - 0.718) / 0.05) ** 2)) * Math.exp(-(((Math.abs(x) / H - 0.043) / 0.03) ** 2));
    }
    for (const lb of P.limb) {
      const w = lb.arm ? wArm : wLeg; if (w < 0.01 || y < lb.ys[0] || y > lb.ys[lb.ys.length - 1]) continue;
      if (lb.arm && y > 0.78) continue;
      const k = 1 + (interp(lb.ys, lb.k, y) - 1) * w, sx = x < 0 ? -1 : 1, ax = interp(lb.ys, lb.ax, y) * H * sx, az = interp(lb.ys, lb.az, y) * H;
      x = ax + (x - ax) * k; z = az + (z - az) * k;
    }
    if (P.neck && pos[i * 3 + 1] > P.neck.y0 && pos[i * 3 + 1] < P.neck.y1) {
      const nk = P.neck, r = Math.hypot(x - nk.ax, z - nk.az) / (0.075 * K), fade = sstep(nk.y0, nk.y0 + 0.04 * K, pos[i * 3 + 1]) * (1 - sstep(nk.y1 - 0.03 * K, nk.y1, pos[i * 3 + 1])) * Math.exp(-(r ** 4)), k = 1 + (nk.k - 1) * fade;
      x = nk.ax + (x - nk.ax) * k; z = nk.az + (z - nk.az) * k;
    }
    pos[i * 3] = x; pos[i * 3 + 2] = z;
  }
}

function measure(L: MhLod, pos: Float32Array, H: number, W: { arm: Float32Array; leg: Float32Array; head: Float32Array }, chinY: number) {
  const tr = (i: number): boolean => W.arm[i] < 0.35 && W.leg[i] < 0.5 && Math.abs(pos[i * 3]) < 0.3 * H / 1.78;
  const nonArm = (i: number): boolean => W.arm[i] < 0.35;
  const T = CTRL_T.map((r, k) => hull(L, pos, r * H, k === 1 ? nonArm : tr));
  const limb = (ys: number[], arm: boolean) => ys.map((r) => hull(L, pos, r * H, (i) => pos[i * 3] < 0 && (arm ? W.arm[i] > 0.5 : W.leg[i] > 0.5)));
  const neckH = hull(L, pos, chinY - 0.012 * H / 1.78, (i) => Math.abs(pos[i * 3]) < 0.075 * H / 1.78 && W.head[i] < 0.5 && pos[i * 3 + 1] < chinY);
  return { T, leg: limb([0.075, 0.19, 0.44], false), arm: limb([0.565, 0.72], true), neck: neckH };
}

/** calibrate on the hi mesh (in place), return the recipe */
export function fitMass(s: MhShape, L: MhLod, pos: Float32Array, sex: 'm' | 'f', id: string): MassFit | null {
  const T = massTargets(sex, id); if (!T) return null;
  const H = s.landmarks.crownY, K = H / 1.78, W = { arm: wset(L, [4, 5, 6, 7]), leg: wset(L, [8, 9, 10, 11]), head: wset(L, [3]) }, passes: Pass[] = [];
  const clampK = (k: number): number => Math.min(1.9, Math.max(0.6, k));
  for (let it = 0; it < 4; it++) {
    const M = measure(L, pos, H, W, s.landmarks.chinY), t = M.T;
    const wd = (h: Hull): number => h.ok ? (h.x1 - h.x0) / H : 0, dp = (h: Hull): number => h.ok ? (h.z1 - h.z0) / H : 0;
    const seat = 1, waist = 2, chest = 3;
    const kxWaist = clampK(T.waistW / (wd(t[waist]) || T.waistW)), kxSeat = clampK(T.hipW / (wd(t[seat]) || T.hipW));
    const dD = { chest: T.chestD - dp(t[chest]), waist: T.waistD - dp(t[waist]), seat: T.hipD - dp(t[seat]) };
    const P: Pass = {
      ty: CTRL_T, kx: [1, kxSeat, kxWaist, 1 + (kxWaist - 1) * T.chestKx, 1], sf: [0, dD.seat * FRONT.seat, dD.waist * FRONT.waist, dD.chest * FRONT.chest, 0], sb: [0, dD.seat * (1 - FRONT.seat), dD.waist * (1 - FRONT.waist), dD.chest * (1 - FRONT.chest), 0],
      cz: t.map((h) => h.ok ? (h.z0 + h.z1) / 2 / H : 0), xr: t.map((h) => h.ok ? (h.x1 - h.x0) / 2 / H : 0.1), bust: it === 0 ? T.bust : 0, limb: [],
    };
    const girth = (h: Hull): number => h.ok ? ell((h.x1 - h.x0) / H, (h.z1 - h.z0) / H) : 0, ctr = (h: Hull): [number, number] => h.ok ? [Math.abs(h.x0 + h.x1) / 2 / H, (h.z0 + h.z1) / 2 / H] : [0, 0];
    // legs: ankle, calf, thigh, then it hands over to the trunk fit
    const lg = M.leg, lk = [T.ankle, T.calf, T.thigh].map((tg, j) => clampK(tg / (girth(lg[j]) || tg))), lc = lg.map(ctr);
    P.limb.push({ ys: [0.045, 0.075, 0.19, 0.44, 0.5], k: [1, lk[0], lk[1], lk[2], 1], ax: [lc[0][0], lc[0][0], lc[1][0], lc[2][0], lc[2][0]], az: [lc[0][1], lc[0][1], lc[1][1], lc[2][1], lc[2][1]], arm: false });
    const ar = M.arm, ak = [T.forearm, T.biceps].map((tg, j) => clampK(tg / (girth(ar[j]) || tg))), ac = ar.map(ctr);
    P.limb.push({ ys: [0.48, 0.565, 0.72, 0.78], k: [1, ak[0], ak[1], 1], ax: [ac[0][0], ac[0][0], ac[1][0], ac[1][0]], az: [ac[0][1], ac[0][1], ac[1][1], ac[1][1]], arm: true });
    const nh = M.neck; if (nh.ok) P.neck = { y0: s.landmarks.chinY - 0.1 * K, y1: s.landmarks.chinY - 0.002, k: clampK(T.neck / (girth(nh) || T.neck)), ax: (nh.x0 + nh.x1) / 2, az: (nh.z0 + nh.z1) / 2 };
    applyPass(L, pos, P, H, W, K); passes.push(P);
  }
  return { passes, sex, id };
}
export function replayMass(s: MhShape, L: MhLod, pos: Float32Array, fit: MassFit): void {
  const H = s.landmarks.crownY, K = H / 1.78, W = { arm: wset(L, [4, 5, 6, 7]), leg: wset(L, [8, 9, 10, 11]), head: wset(L, [3]) };
  for (const P of fit.passes) applyPass(L, pos, P, H, W, K);
}
export const sexOf = (spec: Pick<PedSpec, 'sex'>): 'm' | 'f' => (spec.sex === 'f' ? 'f' : 'm');
