/**
 * STUCK: the headless soak behind docs/swarm/tasks/STUCK.md (not a test file).
 *
 * Real World2D, real Vehicle (player handling), real Player, real map colliders (the grid and the real-street map with its
 * streamed buildings). A scripted agent is thrown at walls, corners, props and parked cars at shallow and steep angles, forwards
 * and in reverse; a walker is sent along walls, through car gaps and into the path of a moving car.
 *
 * STUCK (the owner's word) is defined precisely:
 *   pinned    input applied for PIN_WINDOW s and the body moved less than PIN_MOVE m
 *   hard      pinned AND none of the escape inputs (reverse, reverse-left, reverse-right, forward-left, forward-right for a car;
 *             eight compass directions for a walker) moves it PIN_FREE m within ESCAPE_S s each
 *   overlap   the body is overlapped (> OVERLAP_DEPTH m) with something solid for OVERLAP_HOLD s in a row, after the step's own resolution
 *   tunnel    its centre ends inside a static polygon
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { EventBus } from '@/core/Events';
import { forwardFromHeading, perpRight, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { Player } from '@/entities/Player';
import { Vehicle } from '@/entities/Vehicle';
import { World2D } from '@/physics/World2D';
import { buildRealWorld } from '@/world/roadnet/realWorld';
import type { StaticCollider, VehicleType } from '@/world/types';
import { fileLotSource } from '../world/helpers/lotSource';
import { DT, Sim, input, makeVehicle, proxyMaterials, realPhysics, stubMaterials } from './harness';

export const PIN_WINDOW = 2;
export const PIN_MOVE = 0.3;
export const PIN_FREE = 1.0;
export const ESCAPE_S = 2;
export const OVERLAP_DEPTH = 0.04;
export const OVERLAP_HOLD = 0.5;

export type MapName = 'grid' | 'real';

export interface Anchor { x: number; z: number; nx: number; nz: number; id: string; kind: 'wall' | 'corner' | 'prop'; }
export interface SoakWorld { name: MapName; physics: World2D; colliders: StaticCollider[]; anchors: Anchor[]; concave: number; polygons: number; }

export interface TrialResult {
  map: MapName; actor: 'car' | 'walker'; kind: string; type: string; seed: number;
  x: number; z: number; anchor: string;
  pinned: boolean; hard: boolean; freedBy: string; overlap: boolean; tunnel: boolean;
  maxDepth: number; bodies: string[]; pinX: number; pinZ: number; note: string;
  /** reproduce this trial alone with `replayTrial(world, actor, tseed, index)` */
  tseed: number; index: number; rescues: number; reliefs: number; ovRun: number;
  /** for hard and overlap cases: the body and the statics within 5 m, for offline drawing */
  snap?: { body: { x: number; z: number; h: number; hw: number; hl: number; r: number }; near: Array<{ id: string; kind: string; pts?: number[][]; r?: number; x?: number; z?: number }>; vel: number[]; spec?: Record<string, unknown> };
}

const ids = new Set<string>();
function cleanId(id: string): string { return id.replace(/\d+/g, '#'); }

const polyArea = (pts: Vec2[]): number => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.z - q.x * p.z; } return a / 2; };
export function isConvex(pts: Vec2[]): boolean {
  const n = pts.length; if (n < 4) return true;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const cr = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

function anchorsFrom(colliders: StaticCollider[], near: ((x: number, z: number) => boolean) | null, rng: Rng): { anchors: Anchor[]; concave: number; polygons: number } {
  const out: Anchor[] = [];
  let concave = 0, polygons = 0;
  for (const c of colliders) {
    const id = c.id ?? 'static';
    if (c.shape.kind === 'polygon') {
      const pts = c.shape.points;
      polygons++;
      if (!isConvex(pts)) concave++;
      let cx = 0, cz = 0;
      for (const p of pts) { cx += p.x; cz += p.z; }
      cx /= pts.length; cz /= pts.length;
      if (near && !near(cx, cz)) continue;
      if (Math.abs(polyArea(pts)) < 12) continue;
      const orient = polyArea(pts) > 0 ? 1 : -1;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 3) continue;
        let nx = (b.z - a.z) / len * orient, nz = -(b.x - a.x) / len * orient;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const t = rng.range(0.15, 0.85);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx, nz, id, kind: 'wall' });
        if (rng.chance(0.35)) { // corner: aim at the vertex along the outward bisector of its two edges
          const q = pts[(k + pts.length - 1) % pts.length];
          const l2 = Math.hypot(a.x - q.x, a.z - q.z) || 1;
          let bx = (b.z - a.z) / len * orient + (a.z - q.z) / l2 * orient, bz = -(b.x - a.x) / len * orient - (a.x - q.x) / l2 * orient;
          const bl = Math.hypot(bx, bz);
          if (bl > 0.2) { bx /= bl; bz /= bl; if ((a.x - cx) * bx + (a.z - cz) * bz < 0) { bx = -bx; bz = -bz; } out.push({ x: a.x, z: a.z, nx: bx, nz: bz, id, kind: 'corner' }); }
        }
      }
    } else if (c.shape.kind === 'circle' && (near === null || near(c.pos.x, c.pos.z)) && rng.chance(0.15)) {
      out.push({ x: c.pos.x, z: c.pos.z, nx: Math.cos(rng.range(0, 6.283)), nz: 0, id, kind: 'prop' });
      const l = out[out.length - 1]; const ang = rng.range(0, 6.283); l.nx = Math.cos(ang); l.nz = Math.sin(ang);
    }
  }
  return { anchors: out, concave, polygons };
}

export function gridWorld(seed = 1): SoakWorld {
  const { physics, world } = realPhysics();
  const a = anchorsFrom(world.colliders, null, new Rng(seed));
  return { name: 'grid', physics, colliders: world.colliders, ...a };
}

/** The real-street map: its colliders plus the buildings the streamer hands out around `sites` spread over the net. */
export async function realStreetWorld(seed = 1, sites = 36, log: (s: string) => void = () => undefined): Promise<SoakWorld> {
  const added = new Map<string, StaticCollider>();
  const host = { add: (cs: StaticCollider[]) => { for (const c of cs) added.set(c.id ?? `a${added.size}`, c); }, remove: (_ids: string[]) => undefined };
  const rw = await buildRealWorld({ materials: proxyMaterials(), rng: new Rng(7), tier: 'low', lotSource: fileLotSource(), colliders: host, warmMs: 800 });
  const rng = new Rng(seed);
  const nodes = (rw.net as unknown as { nodes: Array<{ x: number; z: number; p?: { x: number; z: number } }> }).nodes;
  const picks: Vec2[] = [];
  for (let i = 0; i < sites && nodes.length; i++) { const n = nodes[Math.floor(rng.next() * nodes.length)]; picks.push(n.p ?? { x: n.x, z: n.z }); }
  for (const s of picks) {
    for (let i = 0; i < 12; i++) { rw.update(1 / 30, s.x, s.z, { x: s.x, y: 20, z: s.z }, false); await new Promise((r) => setTimeout(r, 25)); }
  }
  log(`real world: ${rw.colliders.length} static + ${added.size} streamed building colliders, ${picks.length} sites`);
  const colliders = [...rw.colliders, ...added.values()];
  const physics = new World2D(12);
  for (const c of colliders) physics.addStatic(c.shape, c.pos, c.id);
  const near = (x: number, z: number): boolean => picks.some((p) => Math.hypot(p.x - x, p.z - z) < 90);
  const a = anchorsFrom(colliders, near, new Rng(seed + 1));
  return { name: 'real', physics, colliders, ...a };
}

// ---------------------------------------------------------------- trial machinery

const CAR_TYPES: VehicleType[] = ['sedan', 'sedan', 'suv', 'hatch', 'pickup', 'cargovan', 'bus', 'limo', 'coupe911', 'minivan'];

function fakeInput(fwd: number, right: number, run = false): never {
  const f: unknown = {
    caps: false,
    axis: (neg: string[], pos: string[]) => (neg[0] === 'KeyS' ? fwd : right) * (pos.length > 0 ? 1 : 0),
    isDown: (code: string) => run && (code === 'ShiftLeft' || code === 'ShiftRight'),
    consume: () => false,
  };
  return f as never;
}

export interface TrialOpts { rng: Rng; seed: number; world: SoakWorld; }

function carFree(w: SoakWorld, x: number, z: number, r = 2.6): boolean { return !w.physics.overlapsStatic({ x, z }, r); }

function bodiesNear(w: SoakWorld, v: Vec2, r: number): string[] {
  return w.physics.queryCircle(v, r).map((b) => cleanId(b.id));
}

function snapOf(w: SoakWorld, body: import('@/world/types').Body2D): NonNullable<TrialResult['snap']> {
  const sh = body.shape;
  const near: NonNullable<TrialResult['snap']>['near'] = [];
  for (const c of w.colliders) {
    if (c.shape.kind === 'polygon') {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const p of c.shape.points) { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mnz = Math.min(mnz, p.z); mxz = Math.max(mxz, p.z); }
      if (mxx < body.pos.x - 9 || mnx > body.pos.x + 9 || mxz < body.pos.z - 9 || mnz > body.pos.z + 9) continue;
      near.push({ id: cleanId(c.id ?? ''), kind: 'poly', pts: c.shape.points.map((p) => [p.x, p.z]) });
    } else if (c.shape.kind === 'circle') { if (Math.hypot(c.pos.x - body.pos.x, c.pos.z - body.pos.z) < 9) near.push({ id: cleanId(c.id ?? ''), kind: 'circle', r: c.shape.r, x: c.pos.x, z: c.pos.z }); }
    else if (Math.hypot(c.shape.a.x - body.pos.x, c.shape.a.z - body.pos.z) < 20) near.push({ id: cleanId(c.id ?? ''), kind: 'seg', pts: [[c.shape.a.x, c.shape.a.z], [c.shape.b.x, c.shape.b.z]] });
  }
  return { body: { x: body.pos.x, z: body.pos.z, h: body.heading, hw: sh.kind === 'obb' ? sh.halfW : 0, hl: sh.kind === 'obb' ? sh.halfL : 0, r: sh.kind === 'circle' ? sh.r : 0 }, near, vel: [body.vel.x, body.vel.z] };
}

class OverlapWatch {
  run = 0; max = 0; hit = false; maxRun = 0; who = new Set<string>();
  constructor(private w: SoakWorld) {}
  check(body: import('@/world/types').Body2D, dt: number): void {
    const o = this.w.physics.deepestOverlap(body);
    if (o.depth > this.max) this.max = o.depth;
    if (o.depth > OVERLAP_DEPTH) { this.run += dt; if (this.run > this.maxRun) this.maxRun = this.run; if (this.run >= OVERLAP_HOLD && o.other) { this.hit = true; this.who.add(cleanId(o.other.id)); } } else this.run = 0;
  }
}

/** a car thrown at an anchor */
export function carTrial(w: SoakWorld, rng: Rng, seed: number, a: Anchor, forceMode?: string, trace?: (s: string) => void): TrialResult | null {
  const d = rng.range(5, 16);
  const type = rng.pick(CAR_TYPES);
  const mode = forceMode ?? rng.pick(['fwd', 'fwd', 'rev', 'weave', 'lock']);
  const ang = rng.pick([0, 5, 15, 30, 45, 60, 80]) * (rng.chance(0.5) ? 1 : -1) * Math.PI / 180;
  // heading that points from the start toward the anchor (rotated by ang); when reversing, the nose points away
  const toX = -a.nx, toZ = -a.nz;
  const base = Math.atan2(toX, -toZ) + ang;
  const heading = mode === 'rev' ? base + Math.PI : base;
  const x = a.x + a.nx * d, z = a.z + a.nz * d;
  if (!carFree(w, x, z)) return null;
  const sim = new Sim(w.physics);
  const events = new EventBus();
  const car = makeVehicle(type, x, z, heading, events, `soak-car-${seed}`);
  car.driver = 'player';
  sim.add(car);
  const added: Vehicle[] = [car];
  // parked cars near the path
  const nPark = rng.pick([0, 0, 1, 2, 3]);
  const fw = forwardFromHeading(base), rt = perpRight(fw);
  for (let i = 0; i < nPark; i++) {
    const along = rng.range(2, Math.max(3, d - 1)), side = rng.range(-3.2, 3.2);
    const px = x + fw.x * along + rt.x * side, pz = z + fw.z * along + rt.z * side;
    if (!carFree(w, px, pz, 2.4)) continue;
    const ph = base + (rng.chance(0.6) ? 0 : rng.range(-1.6, 1.6)) + (rng.chance(0.5) ? Math.PI : 0);
    const pc = makeVehicle(rng.pick(CAR_TYPES), px, pz, ph, events, `soak-park-${seed}-${i}`);
    pc.driver = null;
    if (w.physics.deepestOverlap(pc.body).depth > 0 || Math.hypot(px - x, pz - z) < 4) continue;
    sim.add(pc); added.push(pc);
  }
  if (w.physics.deepestOverlap(car.body).depth > 0.02) { for (const v of added) w.physics.removeBody(v.body.id); return null; }
  const v0 = rng.pick([0, 4, 8, 12, 16]);
  const vdir = forwardFromHeading(heading);
  car.body.vel.x = vdir.x * v0 * (mode === 'rev' ? 0.3 : 1); car.body.vel.z = vdir.z * v0 * (mode === 'rev' ? 0.3 : 1);

  const res: TrialResult = { map: w.name, actor: 'car', kind: `${a.kind}/${mode}`, type, seed, x, z, anchor: cleanId(a.id), pinned: false, hard: false, freedBy: '', overlap: false, tunnel: false, maxDepth: 0, bodies: [], pinX: 0, pinZ: 0, tseed: 0, index: seed, rescues: 0, reliefs: 0, ovRun: 0, note: `d${d.toFixed(1)} ang${Math.round(ang * 57.3)} v${v0} park${added.length - 1}` };
  const watch = new OverlapWatch(w);
  const rescues0 = w.physics.rescues, reliefs0 = w.physics.reliefs;
  const hist: Array<{ x: number; z: number; thr: number }> = [];
  let weaveSteer = 1, weaveT = 0;
  const drive = (t: number): { thr: number; steer: number } => {
    if (mode === 'rev') return { thr: -1, steer: 0 };
    if (mode === 'lock') return { thr: 1, steer: ang > 0 ? 1 : -1 };
    if (mode === 'weave') { weaveT -= DT; if (weaveT <= 0) { weaveSteer = rng.pick([-1, 0, 1]); weaveT = rng.range(0.4, 1.4); } return { thr: 1, steer: weaveSteer }; }
    void t; return { thr: 1, steer: 0 };
  };
  let escape: { idx: number; t: number; x0: number; z0: number } | null = null;
  const ESC: Array<[string, number, number]> = [['rev', -1, 0], ['revL', -1, -1], ['revR', -1, 1], ['fwdL', 1, -1], ['fwdR', 1, 1]];
  const total = 9;
  let t = 0;
  while (t < total + (res.pinned ? 11 : 0)) {
    let thr: number, steer: number;
    if (escape) {
      const e = ESC[escape.idx]; thr = e[1]; steer = e[2];
    } else { const o = drive(t); thr = o.thr; steer = o.steer; }
    car.setInput(input({ throttle: thr, steer }));
    sim.step(DT);
    t += DT;
    watch.check(car.body, DT);
    if (trace && Math.round(t / DT) % 15 === 0) trace(`t${t.toFixed(2)} pos ${car.body.pos.x.toFixed(2)},${car.body.pos.z.toFixed(2)} h ${car.body.heading.toFixed(2)} v ${car.body.vel.x.toFixed(2)},${car.body.vel.z.toFixed(2)} thr ${thr} st ${steer} esc ${escape ? ESC[escape.idx][0] : '-'} cs ${sim.contactsLastStep.filter((c) => c.a === car.body || c.b === car.body).map((c) => cleanId((c.a === car.body ? c.b : c.a).id) + ':' + c.depth.toFixed(2)).join('|')}`);
    for (const c of sim.contactsLastStep) { if (c.a === car.body || c.b === car.body) { res.maxDepth = Math.max(res.maxDepth, c.depth); const o = c.a === car.body ? c.b : c.a; if (res.bodies.length < 6 && !res.bodies.includes(cleanId(o.id))) res.bodies.push(cleanId(o.id)); } }
    if (!escape) {
      hist.push({ x: car.body.pos.x, z: car.body.pos.z, thr });
      const n = Math.round(PIN_WINDOW / DT);
      if (hist.length > n) {
        const old = hist[hist.length - 1 - n];
        let all = true;
        for (let i = hist.length - n; i < hist.length; i++) if (Math.abs(hist[i].thr) < 0.5 || Math.sign(hist[i].thr) !== Math.sign(thr)) { all = false; break; }
        if (all && Math.hypot(car.body.pos.x - old.x, car.body.pos.z - old.z) < PIN_MOVE) {
          res.pinned = true; res.pinX = car.body.pos.x; res.pinZ = car.body.pos.z;
          res.bodies = [...new Set([...res.bodies, ...bodiesNear(w, car.body.pos, 4)])].filter((b) => !b.startsWith('soak-car')).slice(0, 6);
          escape = { idx: 0, t: 0, x0: car.body.pos.x, z0: car.body.pos.z };
        }
      }
    } else {
      escape.t += DT;
      const moved = Math.hypot(car.body.pos.x - escape.x0, car.body.pos.z - escape.z0);
      if (moved >= PIN_FREE) { res.freedBy = ESC[escape.idx][0]; break; }
      if (escape.t >= ESCAPE_S) { escape.idx++; escape.t = 0; if (escape.idx >= ESC.length) { res.hard = true; break; } }
    }
    if (!Number.isFinite(car.body.pos.x)) { res.note += ' NaN'; break; }
  }
  res.rescues = w.physics.rescues - rescues0; res.reliefs = w.physics.reliefs - reliefs0; res.ovRun = watch.maxRun;
  res.overlap = watch.hit; if (watch.hit) for (const b of watch.who) if (!res.bodies.includes(b)) res.bodies.push(b);
  res.maxDepth = Math.max(res.maxDepth, watch.max);
  if (res.hard || res.overlap) { res.snap = snapOf(w, car.body); res.snap.spec = { x, z, heading, type, v0, mode, ang, d, parks: added.slice(1).map((v) => ({ x: v.body.pos.x, z: v.body.pos.z, h: v.body.heading, type: v.spec.type })) }; }
  res.tunnel = w.physics.overlapsStatic(car.body.pos, 0.05) && w.physics.deepestOverlap(car.body, true).depth > 1.0;
  for (const v of added) w.physics.removeBody(v.body.id);
  return res;
}

/** a walker thrown at an anchor, sometimes with parked cars forming a gap or a car running at it */
export function walkerTrial(w: SoakWorld, rng: Rng, seed: number, a: Anchor, forceMode?: string, trace?: (s: string) => void): TrialResult | null {
  const mode = forceMode ?? rng.pick(['wall', 'wall', 'gap', 'carwall', 'run', 'pushed']);
  const d = rng.range(2, 7);
  const ang = rng.pick([0, 10, 25, 45, 70]) * (rng.chance(0.5) ? 1 : -1) * Math.PI / 180;
  const x = a.x + a.nx * d, z = a.z + a.nz * d;
  if (!carFree(w, x, z, 0.6)) return null;
  const sim = new Sim(w.physics);
  const events = new EventBus();
  const player = new Player(`soak-p-${seed}`, { x, z }, stubMaterials, events);
  sim.entities.set(player.body.id, player);
  w.physics.addBody(player.body);
  const added: string[] = [player.body.id];
  const cars: Vehicle[] = [];
  const toward = { x: -a.nx, z: -a.nz };
  const cs = Math.cos(ang), sn = Math.sin(ang);
  let dir = { x: toward.x * cs - toward.z * sn, z: toward.x * sn + toward.z * cs };
  const side = { x: -toward.z, z: toward.x };
  let note = `d${d.toFixed(1)} ang${Math.round(ang * 57.3)}`;
  const park = (px: number, pz: number, h: number, type: VehicleType = 'sedan'): boolean => {
    const c = makeVehicle(type, px, pz, h, events, `soak-wpark-${seed}-${cars.length}`);
    c.driver = null;
    if (w.physics.deepestOverlap(c.body).depth > 0) return false;
    sim.add(c); cars.push(c); added.push(c.body.id); return true;
  };
  if (mode === 'gap') {
    // two cars nose to tail along the wall, the walker aims at the gap between them
    const g = rng.range(0.45, 1.2);
    const h = Math.atan2(side.x, -side.z); // along the wall
    const type = rng.pick<VehicleType>(['sedan', 'suv', 'hatch', 'pickup']);
    const half = 2.4;
    const cx = x + toward.x * (d * 0.5), cz = z + toward.z * (d * 0.5);
    park(cx + side.x * (g / 2 + half), cz + side.z * (g / 2 + half), h, type);
    park(cx - side.x * (g / 2 + half), cz - side.z * (g / 2 + half), h, type);
    note += ` gap${g.toFixed(2)}`;
    dir = { x: toward.x, z: toward.z };
  } else if (mode === 'carwall') {
    // one car parked along the wall with a hand's gap; the walker walks along the wall in that gap
    const g = rng.range(0.15, 1.1);
    const h = Math.atan2(side.x, -side.z);
    const cx = a.x + a.nx * (0.95 + g), cz = a.z + a.nz * (0.95 + g);
    park(cx, cz, h, 'sedan');
    dir = { x: side.x * (rng.chance(0.5) ? 1 : -1), z: side.z };
    if (dir.x === 0 && dir.z === 0) dir = side;
    player.body.pos.x = a.x + a.nx * 0.45 + side.x * 4; player.body.pos.z = a.z + a.nz * 0.45 + side.z * 4;
    note += ` gap${g.toFixed(2)}`;
  } else if (mode === 'pushed') {
    // a traffic car runs at a walker who stands at the wall
    const dist = 12;
    const px = x + a.nx * dist, pz = z + a.nz * dist;
    const hh = Math.atan2(-a.nx, a.nz);
    const c = makeVehicle(rng.pick<VehicleType>(['sedan', 'suv', 'bus']), px, pz, hh, events, `soak-push-${seed}`);
    c.driver = 'traffic';
    if (w.physics.deepestOverlap(c.body).depth === 0) { sim.add(c); cars.push(c); added.push(c.body.id); }
    dir = { x: 0, z: 0 };
  }
  if (w.physics.deepestOverlap(player.body).depth > 0.02) { for (const id of added) w.physics.removeBody(id); return null; }
  const res: TrialResult = { map: w.name, actor: 'walker', kind: `${a.kind}/${mode}`, type: 'player', seed, x, z, anchor: cleanId(a.id), pinned: false, hard: false, freedBy: '', overlap: false, tunnel: false, maxDepth: 0, bodies: [], pinX: 0, pinZ: 0, tseed: 0, index: seed, rescues: 0, reliefs: 0, ovRun: 0, note };
  const watch = new OverlapWatch(w);
  const rescues0 = w.physics.rescues, reliefs0 = w.physics.reliefs;
  const run = mode === 'run' || rng.chance(0.3);
  const hist: Array<{ x: number; z: number }> = [];
  let escape: { idx: number; t: number; x0: number; z0: number } | null = null;
  const ESC = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ name: `dir${i}`, x: Math.cos(i * Math.PI / 4), z: Math.sin(i * Math.PI / 4) }));
  const walkSeconds = mode === 'pushed' ? 8 : 6;
  let t = 0;
  const fw0 = forwardFromHeading(0), rt0 = perpRight(fw0);
  while (t < walkSeconds + (res.pinned ? 13 : 0)) {
    let want = dir;
    if (mode === 'pushed' && cars.length > 0) { const cc = cars[cars.length - 1]; if (cc.driver === 'traffic') cc.setInput(input({ throttle: 0.7 })); }
    if (escape) want = ESC[escape.idx];
    const len = Math.hypot(want.x, want.z);
    if (len > 0) player.control(fakeInput(want.x * fw0.x + want.z * fw0.z, want.x * rt0.x + want.z * rt0.z, run && !escape), 0);
    else player.control(fakeInput(0, 0), 0);
    sim.step(DT);
    t += DT;
    watch.check(player.body, DT);
    if (trace && Math.round(t / DT) % 15 === 0) trace(`t${t.toFixed(2)} pos ${player.body.pos.x.toFixed(2)},${player.body.pos.z.toFixed(2)} v ${player.body.vel.x.toFixed(2)},${player.body.vel.z.toFixed(2)} esc ${escape ? ESC[escape.idx].name : '-'} cs ${sim.contactsLastStep.filter((c) => c.a === player.body || c.b === player.body).map((c) => cleanId((c.a === player.body ? c.b : c.a).id) + ':' + c.depth.toFixed(2)).join('|')}`);
    for (const c of sim.contactsLastStep) { if (c.a === player.body || c.b === player.body) { res.maxDepth = Math.max(res.maxDepth, c.depth); const o = c.a === player.body ? c.b : c.a; if (res.bodies.length < 6 && !res.bodies.includes(cleanId(o.id))) res.bodies.push(cleanId(o.id)); } }
    if (!escape) {
      hist.push({ x: player.body.pos.x, z: player.body.pos.z });
      const n = Math.round(PIN_WINDOW / DT);
      if (len > 0 && hist.length > n) {
        const old = hist[hist.length - 1 - n];
        if (Math.hypot(player.body.pos.x - old.x, player.body.pos.z - old.z) < PIN_MOVE) {
          res.pinned = true; res.pinX = player.body.pos.x; res.pinZ = player.body.pos.z;
          res.bodies = [...new Set([...res.bodies, ...bodiesNear(w, player.body.pos, 2.5)])].filter((b) => !b.startsWith('soak-p')).slice(0, 6);
          escape = { idx: 0, t: 0, x0: player.body.pos.x, z0: player.body.pos.z };
        }
      }
    } else {
      escape.t += DT;
      const moved = Math.hypot(player.body.pos.x - escape.x0, player.body.pos.z - escape.z0);
      if (moved >= PIN_FREE) { res.freedBy = ESC[escape.idx].name; break; }
      if (escape.t >= 1.5) { escape.idx++; escape.t = 0; if (escape.idx >= ESC.length) { res.hard = true; break; } }
    }
    if (!Number.isFinite(player.body.pos.x)) { res.note += ' NaN'; break; }
  }
  res.rescues = w.physics.rescues - rescues0; res.reliefs = w.physics.reliefs - reliefs0; res.ovRun = watch.maxRun;
  res.overlap = watch.hit; if (watch.hit) for (const b of watch.who) if (!res.bodies.includes(b)) res.bodies.push(b);
  res.maxDepth = Math.max(res.maxDepth, watch.max);
  if (res.hard || res.overlap) res.snap = snapOf(w, player.body);
  for (const id of added) w.physics.removeBody(id);
  return res;
}

export interface Summary { map: MapName; actor: string; episodes: number; trials: number; pinned: number; hard: number; overlap: number; tunnel: number; byKind: Record<string, { n: number; pinned: number; hard: number; overlap: number }>; hardCases: TrialResult[]; overlapCases: TrialResult[]; }

export function summarize(rs: TrialResult[], map: MapName, actor: string): Summary {
  const s: Summary = { map, actor, episodes: 0, trials: 0, pinned: 0, hard: 0, overlap: 0, tunnel: 0, byKind: {}, hardCases: [], overlapCases: [] };
  for (const r of rs) {
    if (r.map !== map || r.actor !== actor) continue;
    s.trials++;
    const k = (s.byKind[r.kind] ??= { n: 0, pinned: 0, hard: 0, overlap: 0 });
    k.n++;
    if (r.pinned) { s.pinned++; k.pinned++; }
    if (r.hard) { s.hard++; k.hard++; s.hardCases.push(r); }
    if (r.ovRun >= OVERLAP_HOLD + 0.25) { s.overlap++; k.overlap++; s.overlapCases.push(r); }
    if (r.overlap) s.episodes++;
    if (r.tunnel) s.tunnel++;
  }
  return s;
}

export function trialRng(seed: number, index: number): { tseed: number; rng: Rng } {
  const tseed = (Math.imul(seed, 1000003) + Math.imul(index, 7919)) >>> 0;
  return { tseed, rng: new Rng(tseed) };
}

/** One trial alone (same random numbers as inside `runSoak`), with a trace line every quarter second. */
export function replayTrial(w: SoakWorld, actor: 'car' | 'walker', seed: number, index: number, trace: (s: string) => void): TrialResult | null {
  const { tseed, rng } = trialRng(seed + (actor === 'walker' ? 77 : 0), index);
  const a = w.anchors[Math.floor(rng.next() * w.anchors.length)];
  const r = actor === 'car' ? carTrial(w, rng, index, a, undefined, trace) : walkerTrial(w, rng, index, a, undefined, trace);
  if (r) r.tseed = tseed;
  return r;
}

export function runSoak(w: SoakWorld, nCar: number, nWalk: number, seed: number, log: (s: string) => void = () => undefined): TrialResult[] {
  const out: TrialResult[] = [];
  let tries = 0, car = 0, walk = 0;
  while ((car < nCar || walk < nWalk) && tries < (nCar + nWalk) * 6) {
    tries++;
    if (car < nCar) { const r = replayTrial(w, 'car', seed, tries, () => undefined); if (r) { out.push(r); car++; } }
    if (walk < nWalk) { const r = replayTrial(w, 'walker', seed, tries, () => undefined); if (r) { out.push(r); walk++; } }
    if (tries % 200 === 0) log(`${w.name}: ${car}/${nCar} cars, ${walk}/${nWalk} walkers`);
  }
  return out;
}

export function writeJson(path: string, v: unknown): void { writeFileSync(path, JSON.stringify(v, null, 1)); }
export function logTo(path: string): (s: string) => void { return (s) => appendFileSync(path, s + '\n'); }
void ids;
