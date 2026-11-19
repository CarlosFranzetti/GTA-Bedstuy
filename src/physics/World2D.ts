/**
 * 2D physics world on the ground plane: spatial hash (default 12 m cells), narrow phase from Collider2D,
 * positional correction split by inverse mass, restitution response and per-step contact reporting.
 *
 * World2D does NOT integrate positions. The owner of each dynamic body moves `pos` (and sets `vel`) for the
 * frame, then calls `step(dt)`; read `pos`/`vel` back afterwards. Anti-tunnelling reconstructs each body's
 * motion this frame as `pos - vel*dt -> pos` and probes along it (see `processDynamic`).
 */
import { hyp } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { Body2D, Circle, Contact, IWorld2D, Polygon, Segment } from '@/world/types';
import { overlapRaw, rayShape, SEGMENT_HALF_THICKNESS } from './Collider2D';

const RESTITUTION = 0.1;
/** Below this closing speed (m/s) collisions are perfectly inelastic, so resting/walking contacts do not jitter. */
const RESTITUTION_MIN_SPEED = 1;
/** Extra push beyond the penetration depth so the pair is strictly separated afterwards. */
const SLOP = 1e-4;
const MAX_SUBSTEPS = 4;
/** Calm steps (at rest, untouched) before a dynamic body stops running its own collision pass. */
const SLEEP_AFTER = 3;
/** Static bodies whose id starts with this never block vehicles (bins and bags get knocked over). */
export const SOFT_PREFIX = 'soft-';
/**
 * Static colliders low enough to jump over: hydrants, planters, bollards, low fences ('<lot>-fence'), anything named 'low-...'.
 * A body whose `height` is at least LOW_CLEAR_HEIGHT (an airborne player) passes over them; everything else still blocks.
 */
export const LOW_CLEAR_HEIGHT = 0.4;
export function isLowCollider(id: string): boolean {
  return /^(hydrant|planter|bollard|low)-/.test(id) || id.endsWith('-fence');
}
/**
 * Small street props a vehicle bowls through instead of stopping dead against (GTA III: hydrants and bollards go flying; poles,
 * trees and walls stop you). The car keeps its way, loses a little speed and reports one contact per prop it drives over.
 */
export const YIELD_PREFIX = /^(hydrant|bollard)-/;
/** Fraction of speed a car keeps after driving through a yielding prop, plus the flat loss (m/s). */
const YIELD_KEEP = 0.92;
const YIELD_LOSS = 0.6;
/** The impact strength reported (share of speed): sounds a thud and dents a little, nothing like hitting a wall. */
const YIELD_IMPACT = 0.4;
/**
 * Soft personal space between people: pairs closer than PERSONAL_SPACE (centres, m) drift apart at up to PERSONAL_PUSH m/s, and
 * head-on pairs each lean to their own right so they step round each other. The hard collision stays at the body radii.
 */
export const PERSONAL_SPACE = 0.75;
const PERSONAL_PUSH = 0.45;
/** Approaching pairs start leaning aside at this distance (m) and move sideways at this speed (m/s) each. */
const STEP_ASIDE_RANGE = 1.6;
const STEP_ASIDE_SPEED = 0.45;
/** Overlaps deeper than this between two dynamic bodies that are not moving into each other (spawns, teleports) are eased apart. */
const GENTLE_DEPTH = 0.3;
const GENTLE_STEP = 0.05;
/** A vehicle slower than this (m/s) is immovable for people leaning on it. */
const PARKED_SPEED2 = 0.6 * 0.6;
/** Dynamic hash is rebuilt once per step; bodies move after that, so queries between steps are padded. */
const DYN_QUERY_PAD = 2;
const RAY_LINEAR_FALLBACK_CELLS = 400;
/** Cell indices stay within +-16000 so the hash key below is a small integer (< 2^30): larger numbers are heap-allocated by V8 on every Map access. */
const CELL_LIMIT = 16000;

interface Entry {
  body: Body2D;
  /** small integer for pair keys */
  idx: number;
  isStatic: boolean;
  /** broadphase scratch: last query that visited this entry */
  stamp: number;
  /** bounding radius around body.pos (dynamics) */
  r: number;
  /** world AABB (statics, fixed at insertion) */
  minX: number; minZ: number; maxX: number; maxZ: number;
  /** hashed cell range (valid while `hashed`) */
  cx0: number; cz0: number; cx1: number; cz1: number;
  hashed: boolean;
  /** dynamics: already fully handled this step, so pairs with it are skipped by later bodies */
  processed: boolean;
  /** statics only: a prop (bin, bags) that cars and cops drive through; people and everything else still stop at it */
  soft: boolean;
  /** statics only: a low prop an airborne body (height >= LOW_CLEAR_HEIGHT) passes over */
  low: boolean;
  /** statics only: a prop vehicles drive through (see YIELD_PREFIX) */
  yields: boolean;
  /** dynamics: yielding props this body is currently overlapping (already reported), so each is hit once per pass */
  yielded: Entry[] | null;
  /** dynamics sleep: position at the end of the previous step, consecutive calm steps, and whether anything touched it this step */
  sx: number; sz: number; calm: number; touched: boolean;
}

class SpatialHash {
  readonly cells = new Map<number, Entry[]>();
  constructor(readonly cell: number) {}

  private cellOf(v: number): number {
    const c = Math.floor(v / this.cell);
    return c < -CELL_LIMIT ? -CELL_LIMIT : c > CELL_LIMIT ? CELL_LIMIT : c;
  }
  private static key(cx: number, cz: number): number { return (cx + 16384) * 32768 + (cz + 16384); }

  insert(e: Entry, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const cx0 = this.cellOf(minX), cx1 = this.cellOf(maxX), cz0 = this.cellOf(minZ), cz1 = this.cellOf(maxZ);
    e.cx0 = cx0; e.cx1 = cx1; e.cz0 = cz0; e.cz1 = cz1; e.hashed = true;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = SpatialHash.key(cx, cz);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push(e);
      }
    }
  }

  /** Re-file `e` only when its cell range changed (bodies mostly stay in the same cells between steps). */
  update(e: Entry, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const cx0 = this.cellOf(minX), cx1 = this.cellOf(maxX), cz0 = this.cellOf(minZ), cz1 = this.cellOf(maxZ);
    if (e.hashed && e.cx0 === cx0 && e.cx1 === cx1 && e.cz0 === cz0 && e.cz1 === cz1) return;
    this.remove(e);
    this.insert(e, minX, minZ, maxX, maxZ);
  }

  remove(e: Entry): void {
    if (!e.hashed) return;
    for (let cx = e.cx0; cx <= e.cx1; cx++) {
      for (let cz = e.cz0; cz <= e.cz1; cz++) {
        const arr = this.cells.get(SpatialHash.key(cx, cz));
        if (!arr) continue;
        const i = arr.indexOf(e);
        if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
      }
    }
    e.hashed = false;
  }

  /** Empty every bucket but keep the arrays for reuse (dynamic hash, once per step). */
  reset(): void {
    if (this.cells.size > 2048) { this.cells.clear(); return; }
    for (const arr of this.cells.values()) arr.length = 0;
  }

  cellCount(minX: number, minZ: number, maxX: number, maxZ: number): number {
    return (this.cellOf(maxX) - this.cellOf(minX) + 1) * (this.cellOf(maxZ) - this.cellOf(minZ) + 1);
  }

  /** Append every distinct entry in the touched cells to `out` (deduped with `stamp`). */
  query(minX: number, minZ: number, maxX: number, maxZ: number, stamp: number, out: Entry[]): void {
    const cx0 = this.cellOf(minX), cx1 = this.cellOf(maxX), cz0 = this.cellOf(minZ), cz1 = this.cellOf(maxZ);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.cells.get(SpatialHash.key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (e.stamp !== stamp) { e.stamp = stamp; out.push(e); }
        }
      }
    }
  }
}

function newEntry(body: Body2D, idx: number, isStatic: boolean): Entry {
  return {
    body, idx, isStatic, stamp: 0, r: 0,
    minX: 0, minZ: 0, maxX: 0, maxZ: 0,
    cx0: 0, cz0: 0, cx1: 0, cz1: 0, hashed: false, processed: false, soft: false, low: false, yields: false, yielded: null,
    sx: NaN, sz: NaN, calm: 0, touched: false,
  };
}

/** Radius of a circle around body.pos that contains the shape. */
function boundRadius(b: Body2D): number {
  const s = b.shape;
  switch (s.kind) {
    case 'circle': return s.r;
    case 'obb': return hyp(s.halfW, s.halfL);
    case 'polygon': {
      let m = 0;
      for (const p of s.points) m = Math.max(m, hyp(p.x - b.pos.x, p.z - b.pos.z));
      return m;
    }
    case 'segment': return Math.max(hyp(s.a.x - b.pos.x, s.a.z - b.pos.z), hyp(s.b.x - b.pos.x, s.b.z - b.pos.z)) + SEGMENT_HALF_THICKNESS;
  }
}

/** Half of the body's smallest full extent: the most it may travel per (sub)step before it risks skipping a thin obstacle. */
function halfSmallestExtent(b: Body2D): number {
  const s = b.shape;
  if (s.kind === 'circle') return Math.max(s.r, 0.05);
  if (s.kind === 'obb') return Math.max(Math.min(s.halfW, s.halfL), 0.05);
  return Infinity; // polygon / segment dynamics are not expected to move
}

function invMass(b: Body2D): number {
  const m = b.mass;
  return m > 0 && m < Infinity ? 1 / m : 0;
}

function pairKey(a: Entry, b: Entry): number {
  const lo = a.idx < b.idx ? a.idx : b.idx, hi = a.idx < b.idx ? b.idx : a.idx;
  // small ids give a small-integer key (< 2^30, no heap number per Map access); ids keep growing with spawns, so very large ones fall back to the wide key
  return hi < 32768 ? lo * 32768 + hi : lo * 1048576 + hi;
}

export class World2D implements IWorld2D {
  private readonly staticHash: SpatialHash;
  private readonly dynHash: SpatialHash;
  private readonly entries = new Map<string, Entry>();
  private readonly statics: Entry[] = [];
  private readonly dynamics: Entry[] = [];
  private nextIdx = 1;
  private nextAuto = 1;
  private stamp = 0;
  private readonly cand: Entry[] = [];
  private readonly seenYield: Entry[] = [];
  private readonly pairContacts = new Map<number, Contact>();
  private contacts: Contact[] = [];
  private readonly probe: Body2D = {
    id: '__query', kind: 'static', shape: { kind: 'circle', r: 1 }, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, heading: 0, mass: Infinity,
  };

  constructor(readonly cellSize = 12) {
    this.staticHash = new SpatialHash(cellSize);
    this.dynHash = new SpatialHash(cellSize);
  }

  // ------------------------------------------------------------ population

  addStatic(shape: Polygon | Segment | Circle, pos: Vec2 = { x: 0, z: 0 }, id?: string): Body2D {
    const body: Body2D = {
      id: id ?? `static#${this.nextAuto++}`,
      kind: 'static',
      shape,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      heading: 0,
      mass: Infinity,
    };
    this.insertStatic(body);
    return body;
  }

  addBody(body: Body2D): void {
    if (body.kind === 'static' || body.mass === Infinity) { this.insertStatic(body); return; }
    this.removeBody(body.id);
    const e = newEntry(body, this.nextIdx++, false);
    e.r = boundRadius(body);
    this.entries.set(body.id, e);
    this.dynamics.push(e);
    // hashed immediately so queries/raycasts before the first step see it; rebuilt at every step
    this.dynHash.insert(e, body.pos.x - e.r, body.pos.z - e.r, body.pos.x + e.r, body.pos.z + e.r);
  }

  removeBody(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    const list = e.isStatic ? this.statics : this.dynamics;
    const i = list.indexOf(e);
    if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    (e.isStatic ? this.staticHash : this.dynHash).remove(e);
  }

  bodies(): Iterable<Body2D> {
    const dynamics = this.dynamics, statics = this.statics;
    return (function* () {
      for (let i = 0; i < dynamics.length; i++) yield dynamics[i].body;
      for (let i = 0; i < statics.length; i++) yield statics[i].body;
    })();
  }

  private insertStatic(body: Body2D): void {
    this.removeBody(body.id);
    const e = newEntry(body, this.nextIdx++, true);
    e.soft = body.id.startsWith(SOFT_PREFIX);
    e.low = isLowCollider(body.id);
    e.yields = YIELD_PREFIX.test(body.id);
    const s = body.shape;
    let minX: number, minZ: number, maxX: number, maxZ: number;
    if (s.kind === 'circle') {
      minX = body.pos.x - s.r; maxX = body.pos.x + s.r; minZ = body.pos.z - s.r; maxZ = body.pos.z + s.r;
    } else if (s.kind === 'segment') {
      const t = SEGMENT_HALF_THICKNESS * 1.5;
      minX = Math.min(s.a.x, s.b.x) - t; maxX = Math.max(s.a.x, s.b.x) + t;
      minZ = Math.min(s.a.z, s.b.z) - t; maxZ = Math.max(s.a.z, s.b.z) + t;
    } else if (s.kind === 'polygon') {
      minX = Infinity; minZ = Infinity; maxX = -Infinity; maxZ = -Infinity;
      for (const p of s.points) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
    } else {
      const r = boundRadius(body);
      minX = body.pos.x - r; maxX = body.pos.x + r; minZ = body.pos.z - r; maxZ = body.pos.z + r;
    }
    if (!(minX <= maxX)) { minX = maxX = body.pos.x; minZ = maxZ = body.pos.z; }
    e.minX = minX; e.maxX = maxX; e.minZ = minZ; e.maxZ = maxZ;
    e.r = boundRadius(body);
    this.entries.set(body.id, e);
    this.statics.push(e);
    this.staticHash.insert(e, minX, minZ, maxX, maxZ);
  }

  // ------------------------------------------------------------ step

  private lastDt = 1 / 60;

  step(dt: number): Contact[] {
    this.lastDt = dt;
    this.contacts = [];
    this.pairContacts.clear();
    const dyn = this.dynamics;
    // re-hash dynamics by their current (post-integration) position
    for (let i = 0; i < dyn.length; i++) {
      const e = dyn[i];
      const b = e.body;
      e.processed = false;
      this.dynHash.update(e, b.pos.x - e.r, b.pos.z - e.r, b.pos.x + e.r, b.pos.z + e.r);
    }
    // A body that has not moved, has no velocity and was not touched for SLEEP_AFTER steps skips its own collision pass
    // (parked cars, standing people). It stays in the hash, so anything that moves into it still collides with it; the
    // contact marks it touched and it wakes on the next step.
    for (let i = 0; i < dyn.length; i++) {
      const e = dyn[i], b = e.body;
      const rest = b.vel.x === 0 && b.vel.z === 0 && b.pos.x === e.sx && b.pos.z === e.sz;
      if (rest && e.calm >= SLEEP_AFTER) continue;
      e.calm = rest ? e.calm + 1 : 0;
      this.processDynamic(e, dt);
    }
    for (let i = 0; i < dyn.length; i++) {
      const e = dyn[i];
      if (e.touched) { e.calm = 0; e.touched = false; }
      e.sx = e.body.pos.x; e.sz = e.body.pos.z;
    }
    return this.contacts;
  }

  private processDynamic(e: Entry, dt: number): void {
    const b = e.body;
    const endX = b.pos.x, endZ = b.pos.z;
    const dispX = b.vel.x * dt, dispZ = b.vel.z * dt;
    const travel = hyp(dispX, dispZ);
    const maxStep = halfSmallestExtent(b);
    let n = 1;
    if (travel > maxStep) n = Math.min(MAX_SUBSTEPS, Math.ceil(travel / maxStep));
    const prevX = endX - dispX, prevZ = endZ - dispZ;

    // candidates over the whole swept volume (+ margin for the positional push)
    const pad = e.r + 0.5;
    const cand = this.cand;
    cand.length = 0;
    const stamp = ++this.stamp;
    const minX = Math.min(endX, n > 1 ? prevX : endX) - pad, maxX = Math.max(endX, n > 1 ? prevX : endX) + pad;
    const minZ = Math.min(endZ, n > 1 ? prevZ : endZ) - pad, maxZ = Math.max(endZ, n > 1 ? prevZ : endZ) + pad;
    this.staticHash.query(minX, minZ, maxX, maxZ, stamp, cand);
    this.dynHash.query(minX, minZ, maxX, maxZ, stamp, cand);

    this.seenYield.length = 0;
    let touched = false;
    if (n > 1) {
      // probe positions along the motion; stop at the first one that touches something
      for (let k = 1; k < n; k++) {
        const f = k / n;
        b.pos.x = prevX + (endX - prevX) * f;
        b.pos.z = prevZ + (endZ - prevZ) * f;
        if (this.testCandidates(e, false)) { touched = true; break; }
      }
      if (!touched) { b.pos.x = endX; b.pos.z = endZ; }
    }
    if (!touched) touched = this.testCandidates(e, false);
    // a second look at statics only, to settle corners where fixing one wall pushed into another
    if (touched) this.testCandidates(e, true);
    if (e.yielded !== null) {
      for (let i = e.yielded.length - 1; i >= 0; i--) if (this.seenYield.indexOf(e.yielded[i]) < 0) e.yielded.splice(i, 1);
    }
    e.processed = true;
  }

  /** Test one body against `this.cand`. Returns true if any pair overlapped (and was resolved). */
  private testCandidates(e: Entry, staticsOnly: boolean): boolean {
    const a = e.body;
    const cand = this.cand;
    let any = false;
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i];
      if (c === e) continue;
      if (c.isStatic) {
        if (c.soft && (a.kind === 'vehicle' || a.kind === 'cop')) continue;
        if (c.low && a.height !== undefined && a.height >= LOW_CLEAR_HEIGHT) continue;
        const px = a.pos.x, pz = a.pos.z, r = e.r;
        if (c.minX > px + r || c.maxX < px - r || c.minZ > pz + r || c.maxZ < pz - r) continue;
        if (c.yields && (a.kind === 'vehicle' || a.kind === 'cop')) {
          const hy = overlapRaw(a, c.body);
          if (hy) this.yieldThrough(e, c, hy.nx, hy.nz, hy.px, hy.pz);
          continue;
        }
      } else {
        if (staticsOnly || c.processed) continue;
        const ab = a, cb = c.body;
        // a knocked-down person flying clear: cars do not plough the body along
        if ((ab.vehiclePass && (cb.kind === 'vehicle' || cb.kind === 'cop')) || (cb.vehiclePass && (ab.kind === 'vehicle' || ab.kind === 'cop'))) continue;
        const rr = e.r + c.r;
        const dx = c.body.pos.x - a.pos.x, dz = c.body.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr) {
          // people give each other room: a soft push inside PERSONAL_SPACE, before the bodies touch
          if ((a.kind === 'ped' || a.kind === 'player') && (cb.kind === 'ped' || cb.kind === 'player') && d2 < STEP_ASIDE_RANGE * STEP_ASIDE_RANGE) this.personalSpace(e, c, dx, dz, d2);
          continue;
        }
      }
      const h = overlapRaw(a, c.body);
      if (!h) continue;
      any = true;
      this.resolve(e, c, h.nx, h.nz, h.depth, h.px, h.pz);
    }
    return any;
  }

  private resolve(ea: Entry, eb: Entry, nx: number, nz: number, depth: number, px: number, pz: number): void {
    const a = ea.body, b = eb.body;
    let ia = invMass(a), ib = invMass(b);
    // a person cannot shove a parked or crawling car out of its place (the car's inverse mass is 0 for the push), so squeezing
    // through a gap narrower than the body stays blocked instead of wedging the cars apart a few millimetres a second
    if (a.kind === 'vehicle' || a.kind === 'cop') { if ((b.kind === 'ped' || b.kind === 'player') && a.vel.x * a.vel.x + a.vel.z * a.vel.z < PARKED_SPEED2) ia = 0; }
    else if (b.kind === 'vehicle' || b.kind === 'cop') { if ((a.kind === 'ped' || a.kind === 'player') && b.vel.x * b.vel.x + b.vel.z * b.vel.z < PARKED_SPEED2) ib = 0; }
    const total = ia + ib;
    const key = pairKey(ea, eb);
    let contact = this.pairContacts.get(key);

    // closing speed along the normal BEFORE any response
    const vn = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
    const closing = vn < 0 ? -vn : 0;

    if (!contact) {
      contact = {
        a, b,
        normal: { x: nx, z: nz }, depth, point: { x: px, z: pz },
        impulse: closing,
      };
      this.pairContacts.set(key, contact);
      this.contacts.push(contact);
    } else {
      contact.normal.x = nx; contact.normal.z = nz;
      if (depth > contact.depth) contact.depth = depth;
      contact.point.x = px; contact.point.z = pz;
      if (closing > contact.impulse) contact.impulse = closing;
    }
    ea.touched = true; eb.touched = true;
    if (total === 0) return;

    // positional correction split by inverse mass (statics have inverse mass 0 and never move). Two bodies that were put on top of each
    // other (a spawn, a teleport) and are not closing are eased apart over several steps instead of popping out in one.
    let push = depth + SLOP;
    if (depth > GENTLE_DEPTH && invMass(a) > 0 && invMass(b) > 0 && closing < 0.5) push = GENTLE_STEP;
    const fa = push * ia / total, fb = push * ib / total;
    a.pos.x -= nx * fa; a.pos.z -= nz * fa;
    b.pos.x += nx * fb; b.pos.z += nz * fb;

    // velocity response along the normal
    if (closing > 0) {
      const e = closing > RESTITUTION_MIN_SPEED ? RESTITUTION : 0;
      const j = (1 + e) * closing / total;
      a.vel.x -= nx * j * ia; a.vel.z -= nz * j * ia;
      b.vel.x += nx * j * ib; b.vel.z += nz * j * ib;
    }
  }

  /** A vehicle driving over a yielding prop (hydrant, bollard): one contact per pass, a little speed lost, no stopping. */
  private yieldThrough(e: Entry, prop: Entry, nx: number, nz: number, px: number, pz: number): void {
    const a = e.body;
    this.seenYield.push(prop);
    if (e.yielded === null) e.yielded = [];
    if (e.yielded.indexOf(prop) >= 0) return;
    e.yielded.push(prop);
    const sp = hyp(a.vel.x, a.vel.z);
    if (sp < 0.3) return;
    // the prop is on the far side of the car's motion: closing speed is what the car carries into it
    const impulse = sp * YIELD_IMPACT;
    const k = Math.max(0, sp - YIELD_LOSS) * YIELD_KEEP / sp;
    a.vel.x *= k; a.vel.z *= k;
    e.touched = true;
    this.contacts.push({ a, b: prop.body, normal: { x: nx, z: nz }, depth: 0.01, point: { x: px, z: pz }, impulse });
  }

  /**
   * Soft room between two people (see PERSONAL_SPACE). `dx,dz` runs from `ea` to `eb`. Anyone standing still is not nudged; a mover is.
   * Pairs walking at each other lean to their own right from STEP_ASIDE_RANGE out, so they pass instead of pressing chest to chest.
   */
  private personalSpace(ea: Entry, eb: Entry, dx: number, dz: number, d2: number): void {
    const a = ea.body, b = eb.body;
    if (d2 < 1e-8) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    const sa = hyp(a.vel.x, a.vel.z), sb = hyp(b.vel.x, b.vel.z);
    const moveA = sa > 0.05, moveB = sb > 0.05;
    if (!moveA && !moveB) return;
    const dt = this.lastDt;
    const fa = moveA ? (moveB ? 0.5 : 1) : 0, fb = moveB ? (moveA ? 0.5 : 1) : 0;
    let ax = 0, az = 0, bx = 0, bz = 0;
    if (d < PERSONAL_SPACE) {
      const room = Math.min(1, (PERSONAL_SPACE - d) / (PERSONAL_SPACE - (ea.r + eb.r) + 1e-6));
      const s = PERSONAL_PUSH * room;
      ax -= nx * s * fa; az -= nz * s * fa; bx += nx * s * fb; bz += nz * s * fb;
    }
    // head-on (closing faster than 0.5 m/s): each leans to its own right, (-vz, vx) in x east / z south
    const closingV = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
    if (closingV > 0.5 && d < STEP_ASIDE_RANGE) {
      if (sa > 0.3 && fa > 0) { ax += (-a.vel.z / sa) * STEP_ASIDE_SPEED; az += (a.vel.x / sa) * STEP_ASIDE_SPEED; }
      if (sb > 0.3 && fb > 0) { bx += (-b.vel.z / sb) * STEP_ASIDE_SPEED; bz += (b.vel.x / sb) * STEP_ASIDE_SPEED; }
    }
    a.pos.x += ax * dt; a.pos.z += az * dt;
    b.pos.x += bx * dt; b.pos.z += bz * dt;
  }

  // ------------------------------------------------------------ queries

  queryCircle(center: Vec2, r: number): Body2D[] {
    const out: Body2D[] = [];
    const cand = this.cand;
    cand.length = 0;
    const pad = r + DYN_QUERY_PAD;
    this.dynHash.query(center.x - pad, center.z - pad, center.x + pad, center.z + pad, ++this.stamp, cand);
    const probe = this.probe;
    probe.pos.x = center.x; probe.pos.z = center.z;
    (probe.shape as Circle).r = r;
    for (let i = 0; i < cand.length; i++) {
      if (overlapRaw(probe, cand[i].body)) out.push(cand[i].body);
    }
    cand.length = 0;
    return out;
  }

  /** True when a circle at `center` overlaps any STATIC body (wall, tree, pole). For spawn / exit spot checks. */
  overlapsStatic(center: Vec2, r: number): boolean {
    const cand = this.cand;
    cand.length = 0;
    this.staticHash.query(center.x - r, center.z - r, center.x + r, center.z + r, ++this.stamp, cand);
    const probe = this.probe;
    probe.pos.x = center.x; probe.pos.z = center.z;
    (probe.shape as Circle).r = r;
    let hit = false;
    for (let i = 0; i < cand.length && !hit; i++) {
      const c = cand[i];
      if (!c.isStatic || c.minX > center.x + r || c.maxX < center.x - r || c.minZ > center.z + r || c.maxZ < center.z - r) continue;
      hit = overlapRaw(probe, c.body) !== null;
    }
    cand.length = 0;
    return hit;
  }

  /**
   * True when a circle at `center` overlaps a static body OR a vehicle / cop car (other than `ignoreId`, e.g. the car
   * being left). Pedestrians and the player do not count. For choosing exit and unstick spots that are truly free.
   */
  overlapsSolid(center: Vec2, r: number, ignoreId?: string): boolean {
    if (this.overlapsStatic(center, r)) return true;
    const hits = this.queryCircle(center, r);
    for (let i = 0; i < hits.length; i++) {
      const b = hits[i];
      if ((b.kind === 'vehicle' || b.kind === 'cop') && b.id !== ignoreId) return true;
    }
    return false;
  }

  /**
   * Like `raycast` but only STATIC bodies (walls, trees, poles) can be hit: vehicles and pedestrians are
   * ignored. Used by the camera so a parked car or a passer-by never pulls it in.
   */
  raycastStatic(from: Vec2, dir: Vec2, maxDist: number): { body: Body2D; dist: number; point: Vec2 } | null {
    const dl = hyp(dir.x, dir.z);
    if (dl < 1e-9 || !(maxDist > 0)) return null;
    const ex = from.x + (dir.x / dl) * maxDist, ez = from.z + (dir.z / dl) * maxDist;
    const minX = Math.min(from.x, ex), maxX = Math.max(from.x, ex);
    const minZ = Math.min(from.z, ez), maxZ = Math.max(from.z, ez);
    let best: { body: Body2D; dist: number; point: Vec2 } | null = null;
    const consider = (body: Body2D): void => {
      const h = rayShape(from, dir, best ? best.dist : maxDist, body);
      if (h && (!best || h.dist < best.dist)) best = { body, dist: h.dist, point: h.point };
    };
    if (this.staticHash.cellCount(minX, minZ, maxX, maxZ) > RAY_LINEAR_FALLBACK_CELLS) {
      for (let i = 0; i < this.statics.length; i++) consider(this.statics[i].body);
      return best;
    }
    const cand = this.cand;
    cand.length = 0;
    this.staticHash.query(minX - 0.1, minZ - 0.1, maxX + 0.1, maxZ + 0.1, ++this.stamp, cand);
    for (let i = 0; i < cand.length; i++) consider(cand[i].body);
    cand.length = 0;
    return best;
  }

  raycast(from: Vec2, dir: Vec2, maxDist: number, ignoreId?: string): { body: Body2D; dist: number; point: Vec2 } | null {
    const dl = hyp(dir.x, dir.z);
    if (dl < 1e-9 || !(maxDist > 0)) return null;
    const ex = from.x + (dir.x / dl) * maxDist, ez = from.z + (dir.z / dl) * maxDist;
    const minX = Math.min(from.x, ex), maxX = Math.max(from.x, ex);
    const minZ = Math.min(from.z, ez), maxZ = Math.max(from.z, ez);
    const cand = this.cand;
    cand.length = 0;
    const stamp = ++this.stamp;
    this.rayBest = null;

    if (this.staticHash.cellCount(minX, minZ, maxX, maxZ) > RAY_LINEAR_FALLBACK_CELLS) {
      // very long ray: cheaper to test everything than to walk thousands of cells
      for (let i = 0; i < this.statics.length; i++) this.considerRay(from, dir, maxDist, this.statics[i].body, ignoreId);
      for (let i = 0; i < this.dynamics.length; i++) this.considerRay(from, dir, maxDist, this.dynamics[i].body, ignoreId);
      return this.rayBest;
    }
    this.staticHash.query(minX - 0.1, minZ - 0.1, maxX + 0.1, maxZ + 0.1, stamp, cand);
    this.dynHash.query(minX - DYN_QUERY_PAD, minZ - DYN_QUERY_PAD, maxX + DYN_QUERY_PAD, maxZ + DYN_QUERY_PAD, stamp, cand);
    for (let i = 0; i < cand.length; i++) this.considerRay(from, dir, maxDist, cand[i].body, ignoreId);
    cand.length = 0;
    return this.rayBest;
  }

  private rayBest: { body: Body2D; dist: number; point: Vec2 } | null = null;
  private considerRay(from: Vec2, dir: Vec2, maxDist: number, body: Body2D, ignoreId: string | undefined): void {
    if (ignoreId !== undefined && body.id === ignoreId) return;
    const best = this.rayBest;
    const h = rayShape(from, dir, best ? best.dist : maxDist, body);
    if (h && (!best || h.dist < best.dist)) this.rayBest = { body, dist: h.dist, point: h.point };
  }
}
