/**
 * World pickups for the hands: glass bottles by trash and outside the shops, bricks at the scaffold fences, a pistol with two
 * magazines on the pavement outside the brownstone nearest home and a few more around the map. Positions come from the lots the grid
 * already has (deterministic: no random numbers), and an optional `blocked` probe nudges each one off props and walls.
 * A collected pickup comes back after a few minutes. A thrown brick that lands becomes a dropped pickup for a while.
 */
import { dist, type Vec2 } from '@/core/Math2';
import type { Lot } from '@/world/types';

export type PickupKind = 'bottle' | 'brick' | 'pistol' | 'bat' | 'pipe' | 'fish' | 'revolver' | 'shotgun' | 'ammo';

export interface PickupDef { id: string; kind: PickupKind; x: number; z: number }

/** Walk over a pickup within this distance (m) to take it. */
export const PICKUP_RADIUS = 1.0;
/** Seconds until a collected pickup is back. */
export const RESPAWN_SECONDS: Record<PickupKind, number> = { bottle: 180, brick: 240, pistol: 300, bat: 300, pipe: 300, fish: 240, revolver: 420, shotgun: 480, ammo: 240 };
/** A thrown brick that came to rest stays this long. */
export const DROP_SECONDS = 120;

const FOOT = 0.35;
/** one bottle by the kerb at every Nth ordinary frontage ("trash areas") */
const TRASH_EVERY = 9;
const MAX_TRASH_BOTTLES = 36;

type Blocked = (p: Vec2, r: number) => boolean;

function mid(l: Lot): Vec2 { return { x: (l.frontA.x + l.frontB.x) / 2, z: (l.frontA.z + l.frontB.z) / 2 }; }
function along(l: Lot): Vec2 {
  const dx = l.frontB.x - l.frontA.x, dz = l.frontB.z - l.frontA.z, n = Math.hypot(dx, dz) || 1;
  return { x: dx / n, z: dz / n };
}

/** The first free spot of `base` pushed out along the lot's outward normal (`outs`, negative = into the lot) and sideways (`sides`). */
function findFree(l: Lot, base: Vec2, outs: number[], sides: number[], blocked?: Blocked): Vec2 | null {
  const u = along(l);
  for (const o of outs) for (const s of sides) {
    const p = { x: base.x + l.outward.x * o + u.x * s, z: base.z + l.outward.z * o + u.z * s };
    if (!blocked || !blocked(p, FOOT)) return p;
  }
  return null;
}

/** All the world pickups, from the lots. `home` is the player's spawn; `blocked(p, r)` says a foot-sized circle at p hits something solid. */
export function placePickups(lots: readonly Lot[], home: Vec2, blocked?: Blocked): PickupDef[] {
  const out: PickupDef[] = [];
  const add = (id: string, kind: PickupKind, p: Vec2 | null): void => { if (p) out.push({ id, kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); };

  // a bottle outside every shop, on the pavement
  for (const l of lots) {
    if (!l.poi) continue;
    add(`bottle:shop:${l.id}`, 'bottle', findFree(l, mid(l), [1.3, 1.8, 2.3], [l.width * 0.3, -l.width * 0.3, 0], blocked));
  }
  // bricks at the scaffold fences
  for (const l of lots) {
    if (l.type !== 'scaffold') continue;
    add(`brick:${l.id}`, 'brick', findFree(l, mid(l), [1.3, 1.8, 2.3], [0, l.width * 0.25, -l.width * 0.25], blocked));
  }
  // bottles by the kerb in front of ordinary frontages: the trash areas
  let n = 0, trash = 0;
  for (const l of lots) {
    if (l.poi || (l.type !== 'brownstone' && l.type !== 'rowhouse' && l.type !== 'mixeduse' && l.type !== 'apartment')) continue;
    if (n++ % TRASH_EVERY !== 4 || trash >= MAX_TRASH_BOTTLES) continue;
    const u = along(l);
    const base = { x: l.frontA.x + u.x * l.width * 0.12, z: l.frontA.z + u.z * l.width * 0.12 };
    const p = findFree(l, base, [1.2, 1.7, 2.2], [0, 0.6], blocked);
    if (p) { add(`bottle:trash:${l.id}`, 'bottle', p); trash++; }
  }

  // the pistol with two magazines near home: on the pavement in front of the nearest brownstone 5 to 40 m away. It used to sit in
  // that house's areaway, which is fenced: the playtest of 18 Nov could not walk to it (it stopped 3.4 m short at the railing)
  let bestHome: Lot | null = null, bestD = Infinity;
  for (const l of lots) {
    if (l.type !== 'brownstone' && l.type !== 'rowhouse') continue;
    const d = dist(mid(l), home);
    if (d >= 5 && d <= 40 && d < bestD) { bestD = d; bestHome = l; }
  }
  if (bestHome) add('pistol:home', 'pistol', findFree(bestHome, mid(bestHome), [1.7, 2.2, 2.7], [0, 1, -1, 2, -2], blocked));

  // a few more around the map: at the auto repair, the liquor store and the dollar store, a few metres along the frontage from the bottle
  for (const arch of ['autorepair', 'liquor', 'dollar'] as const) {
    const l = lots.find((x) => x.poi?.archetype === arch);
    if (l) add(`pistol:${arch}`, 'pistol', findFree(l, mid(l), [1.6, 2.1, 2.6], [-l.width * 0.3, l.width * 0.3, 0], blocked));
  }
  placeArsenal(lots, home, add, blocked);
  return out;
}

/**
 * COMBAT2: the rest of the arsenal. A bat outside the hardware store, a pipe at the scaffold fences, the silly one (a frozen fish) outside
 * the bodega (the nearest thing to a fish counter the shop types have), a revolver at the liquor store, a pump shotgun in the car repair
 * yard, an ammo box by the dollar store and one near home. Same rules as the rest: deterministic, nudged off solids by `blocked`.
 */
function placeArsenal(lots: readonly Lot[], home: Vec2, add: (id: string, kind: PickupKind, p: Vec2 | null) => void, blocked?: Blocked): void {
  const near = (arch: string, from: Vec2 | null, nth = 0): Lot | undefined => {
    const list = lots.filter((x) => x.poi?.archetype === arch);
    if (!from) return list[nth];
    return [...list].sort((a, b) => dist(mid(a), from) - dist(mid(b), from))[nth];
  };
  const put = (id: string, kind: PickupKind, l: Lot | undefined, side: number): void => { if (l) add(id, kind, findFree(l, mid(l), [1.9, 2.4, 2.9], [side * l.width * 0.3, -side * l.width * 0.3, 0], blocked)); };
  put('bat:hardware', 'bat', near('hardware', home), 1);
  put('bat:hardware2', 'bat', near('hardware', home, 3), -1);
  put('fish:bodega', 'fish', near('bodega', home, 1), 1);
  put('fish:bodega2', 'fish', near('bodega', home, 6), -1);
  put('revolver:liquor', 'revolver', near('liquor', home, 1), -1);
  put('shotgun:auto', 'shotgun', near('auto', home) ?? near('autorepair', home, 0), -1);
  put('ammo:dollar', 'ammo', near('dollar', home), 1);
  put('ammo:home', 'ammo', near('bodega', home), -1);
  let n = 0;
  for (const l of lots) if (l.type === 'scaffold' && n++ % 2 === 1) add(`pipe:${l.id}`, 'pipe', findFree(l, mid(l), [1.9, 2.4, 2.9], [0.8, -0.8], blocked));
}

/**
 * The real map (`?map=real`): plain data in, so nothing here imports the road network. `lots` are the real map's placed lots (the
 * same `Lot` shape as the grid's, shops attached), `shops` are the sidewalk points in front of the shop doors (the places table's
 * `poiSpot`, as the map's blips carry them: `mapPlaces` with kind 'shop') and `home` is the player's spawn.
 */
export interface RealPickupData {
  home: Vec2;
  shops: ReadonlyArray<{ id: string; x: number; z: number }>;
  lots?: readonly Lot[];
}

/** A shop door's own spot gets a bottle if no pickup is already within this many metres of it. */
const SHOP_SPACING = 6;
/** The home pistol goes at the shop spot nearest home that is at least this far (m) from the spawn and no further than HOME_MAX. */
const HOME_MIN = 5;
const HOME_MAX = 60;

/**
 * Pickups for the real map: everything the lots give (a bottle by each shop, bricks at scaffold fences, bottles by the kerb, the
 * pistols) plus a bottle at every shop door the lots did not cover, and a pistol near home when no lot gave one. Deterministic.
 */
export function placeRealPickups(data: RealPickupData, blocked?: Blocked): PickupDef[] {
  const out: PickupDef[] = data.lots ? placePickups(data.lots, data.home, blocked) : [];
  const near = (p: Vec2, kind: PickupKind | null, r: number): boolean => out.some((o) => (kind === null || o.kind === kind) && Math.hypot(o.x - p.x, o.z - p.z) < r);
  const free = (p: Vec2): Vec2 | null => {
    for (const [dx, dz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]] as const) {
      const q = { x: p.x + dx, z: p.z + dz };
      if (!blocked || !blocked(q, FOOT)) return q;
    }
    return null;
  };
  const add = (id: string, kind: PickupKind, p: Vec2 | null): void => { if (p) out.push({ id, kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); };
  for (const sh of data.shops) {
    if (near(sh, 'bottle', SHOP_SPACING)) continue;
    add(`bottle:real:${sh.id}`, 'bottle', free(sh));
  }
  // COMBAT2: the arsenal at shop doors, spread by the order of the shops: a bat, a fish, a revolver, a shotgun and ammo within reach of home
  const byHome = [...data.shops].sort((a, b) => Math.hypot(a.x - data.home.x, a.z - data.home.z) - Math.hypot(b.x - data.home.x, b.z - data.home.z));
  const arms: PickupKind[] = ['bat', 'fish', 'ammo', 'pipe', 'revolver', 'fish', 'shotgun', 'bat', 'ammo', 'pipe', 'revolver', 'ammo'];
  byHome.filter((sh) => Math.hypot(sh.x - data.home.x, sh.z - data.home.z) >= HOME_MIN).slice(0, arms.length * 3).forEach((sh, i) => {
    if (i % 3 !== 1 || out.some((o) => o.kind !== 'bottle' && Math.hypot(o.x - sh.x, o.z - sh.z) < 3)) return;
    add(`arms:real:${sh.id}`, arms[Math.floor(i / 3) % arms.length], free({ x: sh.x - 1.4, z: sh.z + 0.6 }) ?? free(sh));
  });
  if (!out.some((o) => o.kind === 'pistol' && Math.hypot(o.x - data.home.x, o.z - data.home.z) <= HOME_MAX)) {
    let best: { x: number; z: number } | null = null, bestD = Infinity;
    for (const sh of data.shops) {
      const d = Math.hypot(sh.x - data.home.x, sh.z - data.home.z);
      if (d >= HOME_MIN && d <= HOME_MAX && d < bestD) { bestD = d; best = sh; }
    }
    if (best) add('pistol:home', 'pistol', free({ x: best.x + 1.6, z: best.z }) ?? free(best));
  }
  return out;
}

export interface CollectedPickup { id: string; kind: PickupKind; x: number; z: number }

interface Dropped { id: string; kind: PickupKind; x: number; z: number; ttl: number; /** seconds before it can be picked up (the thrower is still next to it) */ arm: number }

/** Which pickups are on the ground right now: collection and respawn timers. */
export class PickupSet {
  /** seconds until a collected pickup returns, by id */
  private readonly away = new Map<string, number>();
  private readonly dropped: Dropped[] = [];
  private dropSeq = 0;

  constructor(readonly defs: readonly PickupDef[]) {}

  isActive(id: string): boolean { return !this.away.has(id); }

  /** Everything that can be seen and collected now: world pickups that are not away, plus dropped ones. */
  *active(): IterableIterator<PickupDef> {
    for (const d of this.defs) if (!this.away.has(d.id)) yield d;
    for (const d of this.dropped) yield d;
  }

  /** Put a brick (or anything) down where it landed. */
  drop(kind: PickupKind, x: number, z: number, ttl = DROP_SECONDS): string {
    const id = `drop:${this.dropSeq++}`;
    this.dropped.push({ id, kind, x, z, ttl, arm: 0.8 });
    return id;
  }

  get droppedCount(): number { return this.dropped.length; }

  /**
   * Advance timers; when `canCollect`, take everything within PICKUP_RADIUS of `pos`. Returns what was taken this call.
   */
  update(dt: number, pos: Vec2, canCollect: boolean, accept?: (k: PickupKind) => boolean): CollectedPickup[] {
    for (const [id, t] of this.away) {
      if (t - dt <= 0) this.away.delete(id); else this.away.set(id, t - dt);
    }
    for (let i = this.dropped.length - 1; i >= 0; i--) {
      this.dropped[i].ttl -= dt; this.dropped[i].arm -= dt;
      if (this.dropped[i].ttl <= 0) this.dropped.splice(i, 1);
    }
    const got: CollectedPickup[] = [];
    if (!canCollect) return got;
    for (const d of this.defs) {
      if (this.away.has(d.id) || (accept && !accept(d.kind))) continue;
      if (Math.hypot(d.x - pos.x, d.z - pos.z) <= PICKUP_RADIUS) { this.away.set(d.id, RESPAWN_SECONDS[d.kind]); got.push(d); }
    }
    for (let i = this.dropped.length - 1; i >= 0; i--) {
      const d = this.dropped[i];
      if (d.arm <= 0 && (!accept || accept(d.kind)) && Math.hypot(d.x - pos.x, d.z - pos.z) <= PICKUP_RADIUS) { this.dropped.splice(i, 1); got.push(d); }
    }
    return got;
  }
}
