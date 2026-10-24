/**
 * 2D physics world on the ground plane: spatial hash (default 12 m cells), narrow phase from Collider2D,
 * positional correction split by inverse mass, restitution response and per-step contact reporting.
 *
 * World2D does NOT integrate positions. The owner of each dynamic body moves `pos` (and sets `vel`) for the
 * frame, then calls `step(dt)`; read `pos`/`vel` back afterwards. Anti-tunnelling reconstructs each body's
 * motion this frame as `pos - vel*dt -> pos` and probes along it (see `processDynamic`).
 */
import type { Vec2 } from '@/core/Math2';
import type { Body2D, Circle, Contact, IWorld2D, Polygon, Segment } from '@/world/types';
import { overlapRaw, rayShape, SEGMENT_HALF_THICKNESS } from './Collider2D';

const RESTITUTION = 0.1;
/** Below this closing speed (m/s) collisions are perfectly inelastic, so resting/walking contacts do not jitter. */
const RESTITUTION_MIN_SPEED = 1;
/** Extra push beyond the penetration depth so the pair is strictly separated afterwards. */
const SLOP = 1e-4;
const MAX_SUBSTEPS = 4;
/** Dynamic hash is rebuilt once per step; bodies move after that, so queries between steps are padded. */
const DYN_QUERY_PAD = 2;
const RAY_LINEAR_FALLBACK_CELLS = 400;
const CELL_LIMIT = 32000;

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
}

class SpatialHash {
  readonly cells = new Map<number, Entry[]>();
  constructor(readonly cell: number) {}

  private cellOf(v: number): number {
    const c = Math.floor(v / this.cell);
    return c < -CELL_LIMIT ? -CELL_LIMIT : c > CELL_LIMIT ? CELL_LIMIT : c;
  }
  private static key(cx: number, cz: number): number { return (cx + 32768) * 65536 + (cz + 32768); }

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
    cx0: 0, cz0: 0, cx1: 0, cz1: 0, hashed: false, processed: false,
  };
}

/** Radius of a circle around body.pos that contains the shape. */
function boundRadius(b: Body2D): number {
  const s = b.shape;
  switch (s.kind) {
    case 'circle': return s.r;
    case 'obb': return Math.hypot(s.halfW, s.halfL);
    case 'polygon': {
      let m = 0;
      for (const p of s.points) m = Math.max(m, Math.hypot(p.x - b.pos.x, p.z - b.pos.z));
      return m;
    }
    case 'segment': return Math.max(Math.hypot(s.a.x - b.pos.x, s.a.z - b.pos.z), Math.hypot(s.b.x - b.pos.x, s.b.z - b.pos.z)) + SEGMENT_HALF_THICKNESS;
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
  return a.idx < b.idx ? a.idx * 1048576 + b.idx : b.idx * 1048576 + a.idx;
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

  step(dt: number): Contact[] {
    this.contacts = [];
    this.pairContacts.clear();
    const dyn = this.dynamics;
    // re-hash dynamics by their current (post-integration) position
    this.dynHash.reset();
    for (let i = 0; i < dyn.length; i++) {
      const e = dyn[i];
      const b = e.body;
      e.processed = false;
      e.hashed = false;
      this.dynHash.insert(e, b.pos.x - e.r, b.pos.z - e.r, b.pos.x + e.r, b.pos.z + e.r);
    }
    for (let i = 0; i < dyn.length; i++) this.processDynamic(dyn[i], dt);
    return this.contacts;
  }

  private processDynamic(e: Entry, dt: number): void {
    const b = e.body;
    const endX = b.pos.x, endZ = b.pos.z;
    const dispX = b.vel.x * dt, dispZ = b.vel.z * dt;
    const travel = Math.hypot(dispX, dispZ);
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
        const px = a.pos.x, pz = a.pos.z, r = e.r;
        if (c.minX > px + r || c.maxX < px - r || c.minZ > pz + r || c.maxZ < pz - r) continue;
      } else {
        if (staticsOnly || c.processed) continue;
        const rr = e.r + c.r;
        const dx = c.body.pos.x - a.pos.x, dz = c.body.pos.z - a.pos.z;
        if (dx * dx + dz * dz > rr * rr) continue;
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
    const ia = invMass(a), ib = invMass(b);
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
    if (total === 0) return;

    // positional correction split by inverse mass (statics have inverse mass 0 and never move)
    const push = depth + SLOP;
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

  raycast(from: Vec2, dir: Vec2, maxDist: number, ignoreId?: string): { body: Body2D; dist: number; point: Vec2 } | null {
    const dl = Math.hypot(dir.x, dir.z);
    if (dl < 1e-9 || !(maxDist > 0)) return null;
    const ex = from.x + (dir.x / dl) * maxDist, ez = from.z + (dir.z / dl) * maxDist;
    const minX = Math.min(from.x, ex), maxX = Math.max(from.x, ex);
    const minZ = Math.min(from.z, ez), maxZ = Math.max(from.z, ez);
    const cand = this.cand;
    cand.length = 0;
    const stamp = ++this.stamp;
    let best: { body: Body2D; dist: number; point: Vec2 } | null = null;

    const consider = (body: Body2D): void => {
      if (ignoreId !== undefined && body.id === ignoreId) return;
      const h = rayShape(from, dir, best ? best.dist : maxDist, body);
      if (h && (!best || h.dist < best.dist)) best = { body, dist: h.dist, point: h.point };
    };

    if (this.staticHash.cellCount(minX, minZ, maxX, maxZ) > RAY_LINEAR_FALLBACK_CELLS) {
      // very long ray: cheaper to test everything than to walk thousands of cells
      for (let i = 0; i < this.statics.length; i++) consider(this.statics[i].body);
      for (let i = 0; i < this.dynamics.length; i++) consider(this.dynamics[i].body);
      return best;
    }
    this.staticHash.query(minX - 0.1, minZ - 0.1, maxX + 0.1, maxZ + 0.1, stamp, cand);
    this.dynHash.query(minX - DYN_QUERY_PAD, minZ - DYN_QUERY_PAD, maxX + DYN_QUERY_PAD, maxZ + DYN_QUERY_PAD, stamp, cand);
    for (let i = 0; i < cand.length; i++) consider(cand[i].body);
    cand.length = 0;
    return best;
  }
}
