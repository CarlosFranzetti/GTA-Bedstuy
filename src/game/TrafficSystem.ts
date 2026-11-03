import * as THREE from 'three';
import type { EventBus } from '@/core/Events';
import { dist, headingFromVec, perpRight, type Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type {
  GraphNode, GridModel, IMaterialLibrary, IVehicle, IWorld2D, LaneNode, Lot, VehicleType,
} from '@/world/types';
import { Pedestrian, type PedCrossing, type PedEnvironment, type StoopSpot } from '@/entities/Pedestrian';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
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

export const CAR_COLORS = [
  '#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#1f6f8b', '#e0b01e',
  '#27ae60', '#8e44ad', '#111111', '#d35400', '#5d4037', '#95a5a6',
] as const;

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
  private warm = true;
  private density: TrafficDensity;
  /** parked-car occupancy the kerbs were filled with (can only be thinned at runtime, not refilled) */
  private parkedShare: number;
  private pedSeq = 0;

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
    this.density = { ...FULL_DENSITY, ...density };
    this.parkedShare = this.density.parkOccupancy;
    this.lights = lights ?? new TrafficLights(grid);
    this.laneNodes = Object.values(grid.lanes.nodes);
    this.pedEnv = {
      lights: this.lights,
      crossings: buildPedCrossings(grid),
      stoops: lots ? buildStoopSpots(lots) : undefined,
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
    while (this.peds.length > this.density.peds) {
      const p = this.peds.pop()!;
      this.world.removeBody(p.body.id);
      p.dispose();
    }
    if (this.peds.length < this.density.peds) {
      const ids = Object.keys(this.grid.sidewalks.nodes);
      if (ids.length > 0) {
        const cross = this.crosswalkNodeIds();
        while (this.peds.length < this.density.peds) this.addPed(this.grid.sidewalks.nodes[this.rng.pick(ids)], cross);
      }
    }
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

  /** Number of vehicles currently driven by a traffic AI. */
  get agentCount(): number { return this.active.length; }

  update(dt: number, playerPos: Vec2): void {
    this.lights.update(dt);
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
    // spawn
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_TICK) {
      this.spawnTimer = 0;
      let budget = this.warm ? 20 : 3;
      this.warm = false;
      let near = 0;
      for (let i = 0; i < this.active.length; i++) {
        if (dist(this.active[i].vehicle.body.pos, playerPos) < NEAR_RADIUS) near++;
      }
      while (budget-- > 0 && near < this.density.maxMoving) {
        if (!this.spawnTraffic(playerPos)) break;
        near++;
      }
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
      const length = Math.hypot(dx, dz);
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
            color: this.rng.pick(CAR_COLORS),
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
    for (let i = 0; i < this.density.peds; i++) this.addPed(this.grid.sidewalks.nodes[this.rng.pick(ids)], cross);
    this.formGroups();
  }

  private addPed(node: GraphNode, cross: Set<string>): void {
    const id = `ped${this.pedSeq++}`;
    const ped = this.makePed
      ? this.makePed(id, node)
      : new Pedestrian(id, node, this.grid.sidewalks, this.world, this.materials, this.events, this.rng.fork(id), cross);
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

  private crosswalkNodeIds(): Set<string> {
    const set = new Set<string>();
    for (const id in this.grid.sidewalks.nodes) {
      const n = this.grid.sidewalks.nodes[id];
      for (const cw of this.grid.crosswalks) {
        if (dist(n.pos, cw.a) < 1.5 || dist(n.pos, cw.b) < 1.5) { set.add(id); break; }
      }
    }
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
    for (let attempt = 0; attempt < 14; attempt++) {
      const n = list[Math.floor(this.rng.next() * list.length) % list.length];
      if (n.stopLine) continue;
      const d = dist(n.pos, player);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      if (!this.spawnClear(n)) continue;
      const v = this.makeVehicle(this.pickType(), { x: n.pos.x, z: n.pos.z }, n.heading, this.rng.pick(CAR_COLORS));
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
      const d = Math.hypot(rx, rz);
      if (d < SPAWN_CLEAR) return false;
      if (b.kind !== 'vehicle' && b.kind !== 'cop' && b.kind !== 'player') continue;
      if (rx * fx + rz * fz < 0 && Math.hypot(b.vel.x, b.vel.z) > 1.5) return false;
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

  private pickType(): VehicleType {
    const r = this.rng.next();
    return r < 0.7 ? 'sedan' : r < 0.9 ? 'suv' : 'boxtruck';
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
