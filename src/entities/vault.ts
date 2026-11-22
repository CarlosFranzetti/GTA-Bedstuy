/**
 * Vaulting over the low part of a car (MOVE2). Pure planning, no physics and no Three.js objects: `planVault` looks at the cars near the
 * player and returns a path over one of them (start, landing, duration, the height the figure is lifted to along the way) or the reason
 * it refused. Player.ts runs the plan.
 *
 * Heights are read at run time from the vehicle's spec and the body profile its model is lofted from (`STYLES` in carBodies.ts: the
 * roof / deck height per station, the windshield base and the rear glass), so a change of car sizes moves the vaultable zones with it.
 * Only the hood (forward of the windshield base) and the trunk deck (behind the rear glass) can be crossed, and only where the surface
 * is at most VAULT_MAX_HEIGHT above the ground: a cabin roof never is, and a van, bus or truck front is too tall.
 */
import { angleDiff, clamp, forwardFromHeading, perpRight, type Vec2 } from '@/core/Math2';
import { STYLES, styleKeyOf } from '@/entities/models/carBodies';
import type { VehicleSpec, VehicleType } from '@/world/types';

/** Highest surface (m above the ground) a body is lifted over. */
export const VAULT_MAX_HEIGHT = 1.15;
/** Fastest a car may be rolling and still be crossed (m/s). Faster: the knock-down rules apply. */
export const VAULT_MAX_CAR_SPEED = 4;
/** Distance from the body centre to the car's outline within which a vault can start (m), and the wider reach when pinned. */
export const VAULT_REACH = 0.9;
export const VAULT_REACH_PINNED = 1.15;
/** The player must face within this angle of the car (rad). */
export const VAULT_FACING = (50 * Math.PI) / 180;
/** Sprint speed (m/s) from which running into a hood vaults it without a key press. */
export const AUTO_VAULT_SPEED = 4.8;
/** Foot radius the landing must clear (m) and the extra margin to the car. */
const FOOT_R = 0.4;
const LAND_GAP = 0.2;
/** Walls and cars along the path are tested with a thinner body than the landing (the body is lifted over the car, the path may graze). */
const PATH_R = 0.26;
const SAMPLES = 28;
const NO_PROFILE: ReadonlySet<string> = new Set(['boxtruck', 'bus', 'schoolbus', 'garbage', 'towtruck', 'flatbed', 'foodtruck', 'sweeper', 'bucket']);

/** Master switch for running into a hood at a sprint (MENU2 may bind it to a setting). */
export const vaultSettings = { autoVault: true };

export interface VaultCar {
  id: string;
  spec: VehicleSpec;
  pos: Vec2;
  vel: Vec2;
  heading: number;
  /** half width and half length of the collision outline (m); absent = from the spec */
  halfW?: number;
  halfL?: number;
}

export type VaultRefusal = 'none' | 'tall' | 'fast' | 'far' | 'facing' | 'blocked';

export interface VaultPlan {
  carId: string;
  start: Vec2;
  land: Vec2;
  /** unit direction of travel */
  dir: Vec2;
  /** seconds */
  T: number;
  /** height of the figure above the walking surface at progress 0..1 along the path (SAMPLES + 1 values) */
  profile: number[];
  peak: number;
  /** which way the legs swing: +1 over the right side of the body, -1 over the left */
  side: number;
  /** the car's centre line was crossed more along its length than across it */
  lengthwise: boolean;
}

/** The car's surface profile: height of the hood / deck at distance `u` along the car (front positive), or null where it is the cabin. Null function: never vaultable. */
export interface TopProfile { top(u: number): number | null; }

export function topProfile(spec: VehicleSpec): TopProfile | null {
  if (NO_PROFILE.has(spec.type)) return null;
  const st = STYLES[styleKeyOf(spec.type as VehicleType)];
  if (!st) return null;
  const L = st.dims ? st.dims.L : spec.length, H = st.dims ? st.dims.H : spec.height;
  const kx = L / st.Lref, ky = H / st.Href;
  const tipF = L / 2 - 0.04, tipR = -(L / 2 - 0.04);
  const us: number[] = [], ys: number[] = [];
  st.secs.forEach(([u, yT], i, a) => { us.push(i === 0 ? tipR : i === a.length - 1 ? tipF : u * kx); ys.push(yT * ky); });
  const at = (u: number): number => {
    if (u <= us[0]) return ys[0];
    for (let i = 1; i < us.length; i++) if (u <= us[i]) { const t = (u - us[i - 1]) / Math.max(1e-6, us[i] - us[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * t; }
    return ys[ys.length - 1];
  };
  const frontZone = st.windshield[0] * kx;               // forward of the windshield base: the hood
  const rearZone = st.rearGlass ? st.rearGlass[1] * kx : -Infinity; // behind the rear glass base: the deck
  return {
    top(u: number): number | null {
      if (u >= frontZone) return at(u);
      if (u <= rearZone) return at(u);
      return null;
    },
  };
}

interface Frame { cx: number; cz: number; fx: number; fz: number; rx: number; rz: number }
function frameOf(car: VaultCar, t: number): Frame {
  const f = forwardFromHeading(car.heading), r = perpRight(f);
  return { cx: car.pos.x + car.vel.x * t, cz: car.pos.z + car.vel.z * t, fx: f.x, fz: f.z, rx: r.x, rz: r.z };
}
const toLocal = (fr: Frame, p: Vec2): { u: number; w: number } => ({ u: (p.x - fr.cx) * fr.fx + (p.z - fr.cz) * fr.fz, w: (p.x - fr.cx) * fr.rx + (p.z - fr.cz) * fr.rz });
const toWorld = (fr: Frame, u: number, w: number): Vec2 => ({ x: fr.cx + fr.fx * u + fr.rx * w, z: fr.cz + fr.fz * u + fr.rz * w });

/** Distance from a point to the car's outline (0 inside), plus the nearest point on it. */
export function outlineDistance(car: VaultCar, p: Vec2): { d: number; near: Vec2 } {
  const fr = frameOf(car, 0), hw = car.halfW ?? car.spec.width / 2, hl = car.halfL ?? car.spec.length / 2;
  const q = toLocal(fr, p);
  const nu = clamp(q.u, -hl, hl), nw = clamp(q.w, -hw, hw);
  return { d: Math.hypot(q.u - nu, q.w - nw), near: toWorld(fr, nu, nw) };
}

export interface PlanArgs {
  pos: Vec2;
  /** body facing (rad) */
  facing: number;
  /** held move direction, or null */
  intent: Vec2 | null;
  speed: number;
  cars: VaultCar[];
  /** true when a foot circle at p overlaps a wall, prop or any car except `ignoreId` */
  blocked: (p: Vec2, r: number, ignoreId?: string) => boolean;
  /** pinned rescue: any direction, any neighbour within the longer reach */
  pinned: boolean;
}

export interface PlanResult { plan: VaultPlan | null; refusal: VaultRefusal; carId: string | null }

export function planVault(a: PlanArgs): PlanResult {
  let best: VaultPlan | null = null, bestCost = Infinity;
  let refusal: VaultRefusal = 'none', refusalId: string | null = null, refusalRank = -1;
  const note = (r: VaultRefusal, id: string, rank: number): void => { if (rank > refusalRank) { refusal = r; refusalId = id; refusalRank = rank; } };
  const dirIntent: Vec2 = a.intent ?? forwardFromHeading(a.facing);
  const intentHeading = Math.atan2(dirIntent.x, -dirIntent.z);
  const reach = a.pinned ? VAULT_REACH_PINNED : VAULT_REACH;

  for (const car of a.cars) {
    const od = outlineDistance(car, a.pos);
    if (od.d > reach + 1e-6) continue;
    const carSpeed = Math.hypot(car.vel.x, car.vel.z);
    const prof = topProfile(car.spec);
    if (!prof) { note('tall', car.id, 1); continue; }
    if (carSpeed > VAULT_MAX_CAR_SPEED) { note('fast', car.id, 2); continue; }
    if (!a.pinned) {
      const toCar = Math.atan2(od.near.x - a.pos.x, -(od.near.z - a.pos.z));
      if (od.d > 1e-3 && Math.abs(angleDiff(intentHeading, toCar)) > VAULT_FACING) { note('facing', car.id, 0); continue; }
    }
    const hw = car.halfW ?? car.spec.width / 2, hl = car.halfL ?? car.spec.length / 2;
    // landing candidates: round the outline, in the car's own frame (so a rolling car carries its landing spots with it)
    const cands: Array<[number, number]> = [];
    const off = FOOT_R + LAND_GAP;
    for (let u = -hl + 0.3; u <= hl - 0.3 + 1e-6; u += 0.45) { cands.push([u, hw + off]); cands.push([u, -hw - off]); }
    for (let w = -hw + 0.3; w <= hw - 0.3 + 1e-6; w += 0.45) { cands.push([hl + off, w]); cands.push([-hl - off, w]); }
    const fr0 = frameOf(car, 0);
    const startLocal = toLocal(fr0, a.pos);
    let reasonRank = 3;
    let anyValid = false;
    for (const [lu, lw] of cands) {
      // the duration depends on the length of the path; the landing is placed where the car will be by then
      const rough = Math.hypot(lu - startLocal.u, lw - startLocal.w);
      const T = clamp(rough / 4.4, 0.62, 0.95);
      const frT = frameOf(car, T);
      const land = toWorld(frT, lu, lw);
      const dx = land.x - a.pos.x, dz = land.z - a.pos.z, len = Math.hypot(dx, dz);
      if (len < 1.3) continue;
      const dir = { x: dx / len, z: dz / len };
      const dirHeading = Math.atan2(dir.x, -dir.z);
      const dAng = Math.abs(angleDiff(intentHeading, dirHeading));
      if (!a.pinned && dAng > 1.3) continue;
      if (a.blocked(land, FOOT_R, car.id)) { reasonRank = Math.max(reasonRank, 3); continue; }
      const raw: number[] = new Array(SAMPLES + 1).fill(0);
      let ok = true, inside = 0, entry = -1, exit = -1;
      for (let i = 0; i <= SAMPLES && ok; i++) {
        const f = i / SAMPLES;
        const p = { x: a.pos.x + dx * f, z: a.pos.z + dz * f };
        const q = toLocal(frameOf(car, f * T), p);
        if (Math.abs(q.u) <= hl + 0.04 && Math.abs(q.w) <= hw + 0.04) {
          const h = prof.top(q.u);
          if (h === null || h > VAULT_MAX_HEIGHT) { ok = false; note('tall', car.id, 1); break; }
          raw[i] = h; inside++; if (entry < 0) entry = f; exit = f;
        } else if (f * len > 0.35 && i < SAMPLES && a.blocked(p, PATH_R, car.id)) { ok = false; }
      }
      if (!ok || inside < 2) continue;
      anyValid = true;
      const peak = Math.max(...raw);
      const cost = len + (a.pinned ? 0 : 1.6 * dAng) + 2 * peak;
      if (cost < bestCost) {
        bestCost = cost;
        best = { carId: car.id, start: { x: a.pos.x, z: a.pos.z }, land, dir, T, profile: heightProfile(raw, entry, exit), peak, side: sideOf(a.facing, dir, lw), lengthwise: Math.abs(dx * fr0.fx + dz * fr0.fz) > Math.abs(dx * fr0.rx + dz * fr0.rz) };
      }
    }
    if (!anyValid) note('blocked', car.id, reasonRank);
  }
  if (best) return { plan: best, refusal: 'none', carId: best.carId };
  return { plan: null, refusal, carId: refusalId };
}

function sideOf(facing: number, dir: Vec2, lw: number): number {
  const c = Math.sign(angleDiff(facing, Math.atan2(dir.x, -dir.z)));
  return c !== 0 ? c : lw >= 0 ? 1 : -1;
}

const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Turn the raw surface heights under the path into the height of the figure: lifted a little before the car and held above it, then eased back to the ground. */
function heightProfile(raw: number[], entry: number, exit: number): number[] {
  const n = raw.length - 1;
  const out: number[] = new Array(n + 1).fill(0);
  const reach = 0.1; // share of the path over which the lift leads and trails the surface
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    let h = 0;
    for (let j = 0; j <= n; j++) {
      if (raw[j] <= 0) continue;
      const w = 1 - Math.abs(i - j) / (n * reach);
      if (w > 0) h = Math.max(h, raw[j] * (w * w * (3 - 2 * w)));
    }
    if (h > 0) h += 0.1; // the feet pass above the paint
    h = Math.max(h, 0.1 * Math.sin(Math.PI * f)); // a hop even over nothing much
    out[i] = h * sstep(0, Math.max(0.06, entry - 0.02), f) * (1 - sstep(Math.min(0.94, exit + 0.02), 1, f));
  }
  out[0] = 0; out[n] = 0;
  return out;
}

/** Progress 0..1 and its rate (per second) through a plan of duration T at time t, leaving at `m0` and arriving at `m1` times the straight-line rate. */
export function vaultProgress(t: number, T: number, m0: number, m1: number): { s: number; ds: number } {
  const u = clamp(t / T, 0, 1), u2 = u * u, u3 = u2 * u;
  const s = (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) + (u3 - u2) * m1;
  const dsdu = (3 * u2 - 4 * u + 1) * m0 + (-6 * u2 + 6 * u) + (3 * u2 - 2 * u) * m1;
  return { s: clamp(s, 0, 1), ds: dsdu / T };
}

/** Height of the figure at progress `s`. */
export function vaultHeight(plan: VaultPlan, s: number): number {
  const x = clamp(s, 0, 1) * (plan.profile.length - 1), i = Math.min(plan.profile.length - 2, Math.floor(x)), u = x - i;
  return plan.profile[i] + (plan.profile[i + 1] - plan.profile[i]) * u;
}
