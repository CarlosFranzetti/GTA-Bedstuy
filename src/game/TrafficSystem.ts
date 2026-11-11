import { hyp } from '@/core/Math2';
import { setPedDayContext } from '@/entities/models/pedBody';
import * as THREE from 'three';
import type { EventBus } from '@/core/Events';
import { dist, headingFromVec, perpRight, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type {
  GraphNode, GridModel, IMaterialLibrary, IVehicle, IWorld2D, LaneNode, Lot, VehicleType,
} from '@/world/types';
import { PedSpawnScheduler, LOCAL_RADIUS, NEAR_SHARE, RECYCLE_DIST, RECYCLE_DIST_DEFICIT, REMOVE_CLEAR, SPAWN_RING_MIN, spawnAllowed } from '@/entities/PedestrianSpawn';
import { Pedestrian, type PedCrossing, type PedEnvironment, type StoopSpot } from '@/entities/Pedestrian';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { pickPaint } from '@/entities/models/carLook';
import { TrafficLights } from './TrafficLights';

export type MakeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string) => IVehicle;
export type MakePed = (id: string, node: GraphNode) => Pedestrian;

/** Crosswalk edges of the sidewalk graph keyed `${from}>${to}` (both directions), for signal-aware pedestrians. */
export function buildPedCrossings(grid: GridModel): Map<string, PedCrossing> {
  const out = new Map<string, PedCrossing>();
  const crosswalks = grid.crosswalks ?? [];
  if (crosswalks.length === 0) return out;
  const nodes = Object.values(grid.sidewalks.nodes);
  const find = (p: Vec2): GraphNode | undefined => {
    let best: GraphNode | undefined;
    let bd = CROSSWALK_MATCH;
    for (const n of nodes) { const d = dist(n.pos, p); if (d <= bd) { bd = d; best = n; } }
    return best;
  };
  for (const cw of crosswalks) {
    const inter = grid.intersections.find((i) => i.id === cw.intersectionId);
    if (!inter) continue;
    const ns = grid.streetById(inter.nsStreetId);
    const ew = grid.streetById(inter.ewStreetId);
    let pa: Vec2;
    let pb: Vec2;
    let crossed: string;
    if (cw.side === 'E' || cw.side === 'W') {
      pa = { x: cw.a.x, z: cw.a.z - ew.sidewalkWidth / 2 };
      pb = { x: cw.b.x, z: cw.b.z + ew.sidewalkWidth / 2 };
      crossed = ew.id;
    } else {
      pa = { x: cw.a.x - ns.sidewalkWidth / 2, z: cw.a.z };
      pb = { x: cw.b.x + ns.sidewalkWidth / 2, z: cw.b.z };
      crossed = ns.id;
    }
    const na = find(pa);
    const nb = find(pb);
    if (!na || !nb || na.id === nb.id) continue;
    const info: PedCrossing = { intersectionId: inter.id, crossedStreetId: crossed };
    out.set(`${na.id}>${nb.id}`, info);
    out.set(`${nb.id}>${na.id}`, info);
  }
  return out;
}

/** Sitting places on the stoops of brownstone and rowhouse lots. */
export function buildStoopSpots(lots: readonly Lot[]): StoopSpot[] {
  const out: StoopSpot[] = [];
  for (const l of lots) {
    if (l.type !== 'brownstone') continue;
    const mx = (l.frontA.x + l.frontB.x) / 2;
    const mz = (l.frontA.z + l.frontB.z) / 2;
    out.push({
      pos: { x: mx + l.outward.x * STOOP_OUT, z: mz + l.outward.z * STOOP_OUT },
      outward: { x: l.outward.x, z: l.outward.z },
    });
  }
  return out;
}

/** Standing places beside the front of every mixed-use (shop) lot, for pedestrians who stop outside a door. */
export function buildDoorSpots(lots: readonly Lot[]): StoopSpot[] {
  const out: StoopSpot[] = [];
  for (const l of lots) {
    if (l.type !== 'mixeduse') continue;
    const mx = (l.frontA.x + l.frontB.x) / 2;
    const mz = (l.frontA.z + l.frontB.z) / 2;
    // beside the door, a little off the lot's centre so two shops do not pile people on the same square
    const ax = l.frontB.x - l.frontA.x, az = l.frontB.z - l.frontA.z;
    const al = hyp(ax, az) || 1;
    const off = Math.min(1.6, l.width * 0.25);
    out.push({
      pos: { x: mx + (ax / al) * off + l.outward.x * DOOR_OUT, z: mz + (az / al) * off + l.outward.z * DOOR_OUT },
      outward: { x: l.outward.x, z: l.outward.z },
      kind: 'door',
    });
  }
  return out;
}

/**
 * Pedestrians out on the street as a fraction of the tier's budget, by hour of day (BIBLE section 7, the 'Peds' column
 * normalised so the 18-21 h peak is 1.0). Noon and 17-20 h are busy, 03-05 h is almost empty. Linear between keys.
 */
const PED_HOUR_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.17], [3, 0.06], [5, 0.1], [6, 0.55], [8, 0.89], [9, 0.67], [11.5, 0.75], [12.5, 0.85], [14, 0.9], [16, 0.85],
  [17, 0.95], [18, 1], [20, 1], [21, 0.5], [24, 0.17],
];
export function pedHourFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < PED_HOUR_KEYS.length; i++) {
    const [h1, f1] = PED_HOUR_KEYS[i];
    if (h <= h1) { const [h0, f0] = PED_HOUR_KEYS[i - 1]; return f0 + ((f1 - f0) * (h - h0)) / (h1 - h0); }
  }
  return PED_HOUR_KEYS[PED_HOUR_KEYS.length - 1][1];
}

/** Stoop sitting / door loitering rate multiplier by hour: lunchtime and evening stoops (BIBLE 7: 10-15% sitting), nights quiet. */
export function idleBoostForHour(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 11 && h < 15) return 7;
  if (h >= 16.5 && h < 21) return 4;
  if (h >= 15 && h < 16.5) return 4;
  if (h >= 8 && h < 11) return 2.5;
  if (h >= 21 || h < 5) return 0.5;
  return 1.5;
}

export const CAR_COLORS = [
  '#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#1f6f8b', '#3a7ca5',
  '#27ae60', '#8e44ad', '#111111', '#d35400', '#5d4037', '#95a5a6',
] as const;

/** Cumulative traffic mix (CARS12): [type, upper edge of its slice of 0..1]. Sedans and crossovers lead, the oddities are rare. */
const TRAFFIC_MIX: ReadonlyArray<readonly [VehicleType, number]> = [
  ['sedan', 0.21], ['cab', 0.28], ['crossover', 0.38], ['suv', 0.46], ['hatch', 0.53], ['beater', 0.6], ['pickup', 0.66], ['minivan', 0.71],
  ['luxury', 0.75], ['towncar', 0.79], ['pony', 0.81], ['cargovan', 0.86], ['dollarvan', 0.89], ['boxtruck', 0.93], ['bus', 0.97], ['garbage', 0.982], ['ambulance', 0.99],
];
const PED_COUNT = 40;
const MAX_TRAFFIC = 30;
const DEFAULT_PARK_OCCUPANCY_SHARE = 0.65;
const NEAR_RADIUS = 160;
const SPAWN_MIN = 90;
const SPAWN_MAX = 150;
const DESPAWN = 190;
const SPAWN_TICK = 0.25;
/** spawn clearance: nobody within SPAWN_CLEAR m, no moving car within SPAWN_BEHIND m behind */
const SPAWN_CLEAR = 6;
const SPAWN_BEHIND = 32;
/** distance between parking slots along a face (m, centre to centre before jitter) */
const PARK_SPACING = 13;
/** Parked cars on a street face are never closer than this bumper to bumper (a stopped car must be able to pivot out). */
export const PARK_MIN_GAP = 6.5;
/** corners (and the hydrants next to them) stay clear: the first slot is this far from the intersection edge */
const PARK_END_MARGIN = 12;
/** no parked bumper closer than this to an intersection edge */
const CORNER_CLEAR = 8;
/** Where the player starts on foot; the parked car nearest to it is the "spawn car" and gets this much clear space. */
export const PLAYER_SPAWN: Vec2 = { x: 9, z: 20 };
export const SPAWN_CAR_CLEAR = 7;
const PARK_EXTRA_OFFSET = 2.6;
const LANE_OFFSET = 2.0;
const FLEE_RADIUS = 15;
const HORN_FLEE_RADIUS = 12;
/** speed limits: 30 mph on avenues, 25 mph on streets (m/s) */
export const AVENUE_LIMIT = 13;
export const STREET_LIMIT = 11;
const GROUP_CHANCE = 0.35;
const STOOP_OUT = 1.1;
const DOOR_OUT = 1.3;
/** a pedestrian is added / removed no closer to the player than this (m), so the crowd changes out of sight */
const PED_SWAP_CLEAR = 35;
const PED_TICK = 0.25;
/** most new pedestrians appear within this range of the player (m) */
const PED_NEAR = 110;
const PED_NEAR_SHARE = 0.75;
const CROSSWALK_MATCH = 0.6;

interface Active { agent: TrafficAgent; vehicle: IVehicle; }

/** How busy the streets are (quality tier: the phone tier runs ~10 cars / 14 peds). Defaults are the full-density numbers. */
export interface TrafficDensity {
  /** moving cars near the player */
  maxMoving: number;
  /** pedestrians */
  peds: number;
  /** share of kerb slots holding a parked car */
  parkOccupancy: number;
}
export const FULL_DENSITY: TrafficDensity = { maxMoving: MAX_TRAFFIC, peds: PED_COUNT, parkOccupancy: DEFAULT_PARK_OCCUPANCY_SHARE };

/**
 * Owns parked cars, moving traffic and pedestrians. It adds/removes their objects to the scene and bodies to the
 * world. The integrator must call `update` on every entity in `vehicles` and `peds` (this class only drives the
 * AI inputs of moving traffic) and route contacts to `onContact`.
 */
export class TrafficSystem {
  readonly vehicles: IVehicle[] = [];
  readonly peds: Pedestrian[] = [];
  /** The signal controller. This system is its only clock: it calls `lights.update(dt)` once per `update`. */
  readonly lights: TrafficLights;

  private readonly active: Active[] = [];
  private readonly laneNodes: LaneNode[];
  private readonly speedCache = new Map<string, number>();
  private readonly offs: Array<() => void> = [];
  private readonly pedEnv: PedEnvironment;
  private spawnTimer = SPAWN_TICK;
  /** cars still to spawn from the budget granted at the last SPAWN_TICK (one per step) */
  private spawnOwed = 0;
  private warm = true;
  private density: TrafficDensity;
  /** parked-car occupancy the kerbs were filled with (can only be thinned at runtime, not refilled) */
  private parkedShare: number;
  private pedSeq = 0;
  /** hour-of-day scaling of the pedestrian budget (1 until `setHour` is called) and the ticker that eases toward it */
  private hourFactor = 1;
  private pedTimer = 0;
  private readonly pedSched = new PedSpawnScheduler();
  /** the scheduler's own stream (seeded from a label, not forked from `rng`): ped relocation never shifts the cars' random sequence */
  private readonly pedRng = new Rng(Rng.hash('pedsched'));
  private playerAt: Vec2;

  constructor(
    private readonly grid: GridModel,
    private readonly world: IWorld2D,
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly scene: THREE.Scene,
    private readonly materials: IMaterialLibrary,
    private readonly makeVehicle: MakeVehicle,
    private readonly makePed?: MakePed,
    lights?: TrafficLights,
    lots?: readonly Lot[],
    density: Partial<TrafficDensity> = {},
    private readonly spawnPoint: Vec2 = PLAYER_SPAWN,
  ) {
    this.playerAt = { x: spawnPoint.x, z: spawnPoint.z };
    this.density = { ...FULL_DENSITY, ...density };
    this.parkedShare = this.density.parkOccupancy;
    this.lights = lights ?? new TrafficLights(grid);
    this.laneNodes = Object.values(grid.lanes.nodes);
    this.pedEnv = {
      lights: this.lights,
      crossings: buildPedCrossings(grid),
      stoops: lots ? buildStoopSpots(lots) : undefined,
      doors: lots ? buildDoorSpots(lots) : undefined,
    };
    this.spawnParked();
    this.spawnPeds();
    this.offs.push(
      events.on('pedKnockedDown', (e) => this.scare(e.pos, FLEE_RADIUS, e.id)),
      events.on('horn', (e) => this.scare(e.pos, HORN_FLEE_RADIUS, null)),
    );
  }

  /**
   * Quality-tier switch at runtime. Moving traffic follows `maxMoving` as cars spawn / despawn; pedestrians and parked cars
   * are removed down to the new numbers at once (cars the player drives are never touched). Raising the numbers adds
   * pedestrians but cannot refill parked kerbs (they were generated at start).
   */
  setDensity(d: Partial<TrafficDensity>): void {
    this.density = { ...this.density, ...d };
    this.fitPeds(true);
    if (this.density.parkOccupancy < this.parkedShare) {
      const keep = this.density.parkOccupancy / Math.max(1e-6, this.parkedShare);
      for (let i = this.vehicles.length - 1; i >= 0; i--) {
        const v = this.vehicles[i];
        if (v.driver !== null || this.rng.chance(keep)) continue;
        this.removeVehicle(v);
      }
      this.parkedShare = this.density.parkOccupancy;
    }
  }

  /** Pedestrians out right now: the tier budget scaled by the hour of day. */
  /** Same, as a real number (the scheduler rounds it with hysteresis). */
  get pedTargetF(): number { return Math.max(this.density.peds > 0 ? 1 : 0, this.density.peds * this.hourFactor); }
  get pedTarget(): number { return Math.max(this.density.peds > 0 ? 1 : 0, Math.round(this.density.peds * this.hourFactor)); }

  /**
   * Time of day (hours, 0-24). The street fills and empties with the BIBLE section 7 curve inside the tier budget, and stoop
   * sitting / door loitering follow it. The crowd eases toward the target one pedestrian per tick out of the player's sight;
   * `snap` jumps straight there (scripted captures, tests).
   */
  setHour(hour: number, snap = false): void {
    this.hourFactor = pedHourFactor(hour);
    setPedDayContext(hour); // GTA3 people: church clothes are likelier in the late morning
    (this.pedEnv as { idleBoost?: number }).idleBoost = idleBoostForHour(hour);
    if (snap) this.fitPeds(true);
  }

  /**
   * A sidewalk node for a new pedestrian: most of the crowd is placed within PED_NEAR of the player (so the pavement near
   * the player is lived-in rather than the whole map evenly), never closer than `minD`.
   */
  private pickPedNode(ids: string[], minD: number, biased = true): GraphNode {
    const nodes = this.grid.sidewalks.nodes;
    const wantNear = biased && this.rng.chance(PED_NEAR_SHARE);
    let node = nodes[this.rng.pick(ids)];
    for (let k = 0; k < 24; k++) {
      const d = dist(node.pos, this.playerAt);
      if (d >= minD && (!wantNear || d <= PED_NEAR)) break;
      node = nodes[this.rng.pick(ids)];
    }
    return node;
  }

  /** Unit vector the player is moving along (the chase camera looks that way); null until they have moved. */
  private facing: Vec2 | null = null;

  /** A pedestrian must not appear on a crosswalk or beside a moving / stopped car (it would stop traffic or be hit). */
  private pedSpawnUnsafe(node: GraphNode): boolean {
    if (this.crosswalkNodeIds().has(node.id)) return true;
    for (const v of this.vehicles) if (dist(v.body.pos, node.pos) < 14) return true;
    return false;
  }

  /** Does a static body (a building) sit between the player and `to`? */
  private lineBlocked(to: Vec2): boolean {
    const dx = to.x - this.playerAt.x, dz = to.z - this.playerAt.z, d = hyp(dx, dz);
    if (d < 1) return false;
    const hit = this.world.raycast(this.playerAt, { x: dx / d, z: dz / d }, d - 1);
    return !!hit && hit.body.kind === 'static';
  }

  /** A sidewalk node in the spawn ring around the player (out of the near view, within walking-in reach); falls back to any node far enough. */
  private pickRingNode(ids: string[]): GraphNode {
    const nodes = this.grid.sidewalks.nodes;
    let node = nodes[this.pedRng.pick(ids)];
    for (let k = 0; k < 64; k++) {
      if (spawnAllowed(this.playerAt, this.facing, node.pos, () => this.lineBlocked(node.pos)) && !this.pedSpawnUnsafe(node)) return node;
      node = nodes[this.pedRng.pick(ids)];
    }
    return this.pickPedNode(ids, PED_SWAP_CLEAR, false);
  }

  /** The farthest free (not grouped, not down) pedestrian and its distance from the player, or null. */
  private farthestLoner(walkingOnly = false): { i: number; d: number } | null {
    let best = -1, bd = -1;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (!p.isFree || (walkingOnly && p.state !== 'walking')) continue;
      const d = dist(p.body.pos, this.playerAt);
      if (d > bd) { bd = d; best = i; }
    }
    return best < 0 ? null : { i: best, d: bd };
  }

  private removePedAt(i: number): void {
    const [p] = this.peds.splice(i, 1);
    this.world.removeBody(p.body.id);
    p.dispose();
  }

  /**
   * One scheduler tick (PedestrianSpawn.ts): adds one pedestrian in the spawn ring, removes the farthest loner (out of sight only),
   * or relocates a loner who wandered beyond RECYCLE_DIST into the ring, so the crowd near the player holds steady.
   */
  private stepPeds(dt: number): void {
    const ids = Object.keys(this.grid.sidewalks.nodes);
    if (ids.length === 0) return;
    const far = this.farthestLoner(), farWalker = this.farthestLoner(true); // sitters and door loiterers are never relocated
    let near = 0;
    for (const p of this.peds) if (dist(p.body.pos, this.playerAt) <= LOCAL_RADIUS) near++;
    const target = this.pedTargetF, deficit = target >= 4 && near < Math.round(target * NEAR_SHARE);
    const act = this.pedSched.tick({ dt, count: this.peds.length, target, deficit, hasFar: !!farWalker && farWalker.d > (deficit ? RECYCLE_DIST_DEFICIT : RECYCLE_DIST), rand: this.pedRng.next() });
    if (act === 'add') this.addPed(this.pickRingNode(ids), this.crosswalkNodeIds(), this.pedRng);
    else if (act === 'remove') { if (far && far.d >= REMOVE_CLEAR) this.removePedAt(far.i); }
    else if (act === 'recycle' && farWalker) { this.removePedAt(farWalker.i); this.addPed(this.pickRingNode(ids), this.crosswalkNodeIds(), this.pedRng); }
  }

  /** Adds / removes pedestrians toward `pedTarget`: all at once, or one per call (far from the player first). */
  private fitPeds(all: boolean): void {
    const target = this.pedTarget;
    const cross = this.peds.length < target ? this.crosswalkNodeIds() : null;
    const ids = Object.keys(this.grid.sidewalks.nodes);
    for (let guard = 0; this.peds.length !== target && guard < 512; guard++) {
      if (this.peds.length > target) {
        // remove the farthest loner (a group leader or follower would orphan its group)
        let best = -1, bd = -1;
        for (let i = 0; i < this.peds.length; i++) {
          const p = this.peds[i];
          if (!p.isFree) continue;
          const d = dist(p.body.pos, this.playerAt);
          if (d > bd) { bd = d; best = i; }
        }
        if (best < 0) best = this.peds.length - 1;
        else if (!all && bd < PED_SWAP_CLEAR) break;
        const [p] = this.peds.splice(best, 1);
        this.world.removeBody(p.body.id);
        p.dispose();
      } else {
        if (ids.length === 0 || !cross) break;
        this.addPed(this.pickPedNode(ids, all ? 12 : PED_SWAP_CLEAR), cross);
      }
      if (!all) break;
    }
  }

  /** Number of vehicles currently driven by a traffic AI. */
  get agentCount(): number { return this.active.length; }

  update(dt: number, playerPos: Vec2): void {
    this.lights.update(dt);
    { const mx = playerPos.x - this.playerAt.x, mz = playerPos.z - this.playerAt.z, m = hyp(mx, mz); if (m > 0.02 && m < 20) this.facing = { x: mx / m, z: mz / m }; }
    this.playerAt = playerPos;
    this.pedTimer += dt;
    if (this.pedTimer >= PED_TICK) { const e = this.pedTimer; this.pedTimer = 0; this.stepPeds(e); }
    // drive
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (a.vehicle.driver !== 'traffic') { a.agent.release(); this.swapRemove(this.active, i); continue; } // stolen
      const p = a.vehicle.body.pos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || dist(p, playerPos) > DESPAWN) {
        a.agent.release();
        this.swapRemove(this.active, i);
        this.removeVehicle(a.vehicle);
        continue;
      }
      a.agent.update(dt);
    }
    // spawn: the budget is owed at each tick and paid out one car per step, so building meshes and agents never piles
    // 20 cars into a single step (the first tick after loading used to)
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_TICK) {
      this.spawnTimer = 0;
      this.spawnOwed = Math.min(this.spawnOwed + (this.warm ? 20 : 3), 24);
      this.warm = false;
    }
    if (this.spawnOwed > 0) {
      let near = 0;
      for (let i = 0; i < this.active.length; i++) {
        if (dist(this.active[i].vehicle.body.pos, playerPos) < NEAR_RADIUS) near++;
      }
      if (near < this.density.maxMoving && this.spawnTraffic(playerPos)) this.spawnOwed--;
      else this.spawnOwed = 0;
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  // ------------------------------------------------------------------ parked cars

  /**
   * Parked cars on both kerbs of every two-way segment. Along a face the cars are at least PARK_MIN_GAP apart bumper to
   * bumper (alternate-side-parking spacing, so a car that is boxed in can always back and turn out), and the first slot is
   * PARK_END_MARGIN from the intersection edge (corners and hydrants stay clear). The car nearest the player's spawn
   * point (the one a new player walks up to) is kept and every other parked car within SPAWN_CAR_CLEAR of it is dropped.
   */
  private spawnParked(): void {
    interface Slot { type: VehicleType; pos: Vec2; h: number; color: string; }
    const slots: Slot[] = [];
    for (const seg of this.grid.segments) {
      const street = this.grid.streetById(seg.streetId);
      if (street.oneWay !== 0) continue;
      const dx = seg.b.x - seg.a.x;
      const dz = seg.b.z - seg.a.z;
      const length = hyp(dx, dz);
      if (length < PARK_END_MARGIN * 2 + 1) continue;
      const dir = { x: dx / length, z: dz / length };
      const right = perpRight(dir);
      const curbOffset = Math.min(LANE_OFFSET + PARK_EXTRA_OFFSET, seg.width / 2 - 1);
      const heading = headingFromVec(dir);
      for (const side of [1, -1]) {
        // side 1: right-hand curb of the a->b direction; side -1: right-hand curb of b->a
        const h = side === 1 ? heading : heading + Math.PI;
        let prevEnd = -Infinity; // far bumper of the previous car along the face
        for (let s = PARK_END_MARGIN; s <= length - PARK_END_MARGIN; s += PARK_SPACING) {
          if (!this.rng.chance(this.density.parkOccupancy)) continue;
          const along = s + this.rng.range(-0.6, 0.6);
          const type = this.pickType();
          const half = VEHICLE_SPECS[type].length / 2;
          if (along - half < CORNER_CLEAR || along + half > length - CORNER_CLEAR || along - prevEnd - half < PARK_MIN_GAP) continue;
          prevEnd = along + half;
          slots.push({
            type,
            pos: {
              x: seg.a.x + dir.x * along + right.x * curbOffset * side,
              z: seg.a.z + dir.z * along + right.z * curbOffset * side,
            },
            h,
            color: this.paintFor(type),
          });
        }
      }
    }
    let spawnCar: Slot | null = null;
    for (const sl of slots) if (!spawnCar || dist(sl.pos, this.spawnPoint) < dist(spawnCar.pos, this.spawnPoint)) spawnCar = sl;
    for (const sl of slots) {
      if (spawnCar && sl !== spawnCar && dist(sl.pos, spawnCar.pos) < SPAWN_CAR_CLEAR) continue;
      const v = this.makeVehicle(sl.type, sl.pos, sl.h, sl.color);
      v.driver = null;
      this.register(v);
    }
  }

  // ------------------------------------------------------------------ pedestrians

  private spawnPeds(): void {
    const cross = this.crosswalkNodeIds();
    const ids = Object.keys(this.grid.sidewalks.nodes);
    if (ids.length === 0) return;
    for (let i = 0; i < this.pedTarget; i++) this.addPed(this.pickPedNode(ids, 0, false), cross); // the opening crowd is spread evenly; hour changes bias new arrivals toward the player
    this.formGroups();
  }

  private addPed(node: GraphNode, cross: Set<string>, rng: Rng = this.rng): void {
    const id = `ped${this.pedSeq++}`;
    const ped = this.makePed
      ? this.makePed(id, node)
      : new Pedestrian(id, node, this.grid.sidewalks, this.world, this.materials, this.events, rng.fork(id), cross);
    ped.setEnvironment(this.pedEnv);
    this.peds.push(ped);
    this.scene.add(ped.object3D);
    this.world.addBody(ped.body);
  }

  /** Some pedestrians walk in pairs / threes: followers start beside their leader and keep to its side. */
  private formGroups(): void {
    let i = 0;
    while (i < this.peds.length - 1) {
      if (!this.rng.chance(GROUP_CHANCE)) { i++; continue; }
      const size = Math.min(this.peds.length - i, this.rng.chance(0.6) ? 2 : 3);
      const leader = this.peds[i];
      for (let k = 1; k < size; k++) {
        const f = this.peds[i + k];
        const slot = size === 2 ? 1 : k === 1 ? -1 : 1;
        f.body.pos.x = leader.body.pos.x + slot * 0.85;
        f.body.pos.z = leader.body.pos.z + 0.35;
        f.follow(leader, slot);
      }
      i += size;
    }
  }

  private crosswalkIdCache: Set<string> | null = null;
  private crosswalkNodeIds(): Set<string> {
    if (this.crosswalkIdCache) return this.crosswalkIdCache;
    const set = new Set<string>();
    for (const id in this.grid.sidewalks.nodes) {
      const n = this.grid.sidewalks.nodes[id];
      for (const cw of this.grid.crosswalks) {
        if (dist(n.pos, cw.a) < 1.5 || dist(n.pos, cw.b) < 1.5) { set.add(id); break; }
      }
    }
    this.crosswalkIdCache = set;
    return set;
  }

  private scare(from: Vec2, radius: number, exceptId: string | null): void {
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (p.id === exceptId) continue;
      if (dist(p.body.pos, from) < radius) p.flee(from, 4);
    }
  }

  // ------------------------------------------------------------------ moving traffic

  private spawnTraffic(player: Vec2): boolean {
    const list = this.laneNodes;
    if (list.length === 0) return false;
    // the ring is a small share of the lane nodes on the big map, so random picks alone miss it (and a miss zeroed the
    // owed budget: the street stayed empty). Scan from a random start for nodes inside the ring instead.
    const start = Math.floor(this.rng.next() * list.length) % list.length;
    let tried = 0;
    for (let k = 0; k < list.length; k++) {
      const n = list[(start + k) % list.length];
      if (n.stopLine) continue;
      const d = dist(n.pos, player);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      if (++tried > 14) break;
      if (!this.spawnClear(n)) continue;
      const type = this.pickType(true);
      const v = this.makeVehicle(type, { x: n.pos.x, z: n.pos.z }, n.heading, this.paintFor(type));
      v.driver = 'traffic';
      this.register(v);
      const agent = new TrafficAgent(v, this.grid.lanes, this.world, this.rng.fork(v.id), {
        startNodeId: n.id,
        speedForStreet: (sid) => this.cruiseFor(sid),
        lights: this.lights,
      });
      this.active.push({ agent, vehicle: v });
      return true;
    }
    return false;
  }

  /**
   * A new car appears standing still: nobody may be within a few metres, and nobody may be driving up behind it
   * (a fast car cannot stop for a car that materialises 7 m ahead of it).
   */
  private spawnClear(n: LaneNode): boolean {
    const list = this.world.queryCircle(n.pos, SPAWN_BEHIND);
    const fx = Math.sin(n.heading);
    const fz = -Math.cos(n.heading);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const rx = b.pos.x - n.pos.x;
      const rz = b.pos.z - n.pos.z;
      const d = hyp(rx, rz);
      if (d < SPAWN_CLEAR) return false;
      if (b.kind !== 'vehicle' && b.kind !== 'cop' && b.kind !== 'player') continue;
      if (rx * fx + rz * fz < 0 && hyp(b.vel.x, b.vel.z) > 1.5) return false;
    }
    return true;
  }

  private cruiseFor(streetId: string): number {
    let s = this.speedCache.get(streetId);
    if (s === undefined) {
      s = this.grid.streetById(streetId).class === 'avenue' ? AVENUE_LIMIT : STREET_LIMIT;
      this.speedCache.set(streetId, s);
    }
    return s;
  }

  /** Traffic mix (a cab is its own type, always taxi yellow); the bus only drives, it is never parked at a kerb. */
  private pickType(moving = false): VehicleType {
    const r = this.rng.next();
    for (const [t, edge] of TRAFFIC_MIX) {
      if (r >= edge) continue;
      // buses, refuse trucks and ambulances only drive, they are never parked at a kerb
      return !moving && (t === 'bus' || t === 'garbage' || t === 'ambulance') ? 'hatch' : t;
    }
    return 'sedan';
  }

  /** Paint of a new car: its type's era palette (taxis, buses and the fleet vehicles keep their fixed colour). */
  private paintFor(type: VehicleType): string {
    if (type === 'cab') return '#e0b01e';
    if (type === 'bus') return '#f0f0ec';
    if (type === 'garbage') return '#eef1ec';
    if (type === 'ambulance') return '#f4f4f4';
    return pickPaint(type, this.rng).color;
  }

  private register(v: IVehicle): void {
    this.vehicles.push(v);
    this.scene.add(v.object3D);
    this.world.addBody(v.body);
  }

  private removeVehicle(v: IVehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.swapRemove(this.vehicles, i);
    this.scene.remove(v.object3D);
    this.world.removeBody(v.body.id);
    v.dispose();
  }

  private swapRemove<T>(arr: T[], i: number): void {
    const last = arr.pop() as T;
    if (i < arr.length) arr[i] = last;
  }
}
