import * as THREE from 'three';
import type { EventBus } from '@/core/Events';
import { dist, headingFromVec, perpRight, type Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type {
  GraphNode, GridModel, IMaterialLibrary, IVehicle, IWorld2D, LaneNode, VehicleType,
} from '@/world/types';
import { Pedestrian } from '@/entities/Pedestrian';
import { TrafficAgent } from '@/entities/TrafficAgent';

export type MakeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string) => IVehicle;
export type MakePed = (id: string, node: GraphNode) => Pedestrian;

export const CAR_COLORS = [
  '#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#1f6f8b', '#e0b01e',
  '#27ae60', '#8e44ad', '#111111', '#d35400', '#5d4037', '#95a5a6',
] as const;

const PED_COUNT = 40;
const MAX_TRAFFIC = 30;
const NEAR_RADIUS = 160;
const SPAWN_MIN = 90;
const SPAWN_MAX = 150;
const DESPAWN = 190;
const SPAWN_TICK = 0.25;
const PARK_SPACING = 11;
const PARK_END_MARGIN = 12;
const PARK_OCCUPANCY = 0.65;
const PARK_EXTRA_OFFSET = 2.6;
const LANE_OFFSET = 2.0;
const FLEE_RADIUS = 15;
const HORN_FLEE_RADIUS = 12;

interface Active { agent: TrafficAgent; vehicle: IVehicle; }

/**
 * Owns parked cars, moving traffic and pedestrians. It adds/removes their objects to the scene and bodies to the
 * world. The integrator must call `update` on every entity in `vehicles` and `peds` (this class only drives the
 * AI inputs of moving traffic) and route contacts to `onContact`.
 */
export class TrafficSystem {
  readonly vehicles: IVehicle[] = [];
  readonly peds: Pedestrian[] = [];

  private readonly active: Active[] = [];
  private readonly laneNodes: LaneNode[];
  private readonly speedCache = new Map<string, number>();
  private readonly offs: Array<() => void> = [];
  private spawnTimer = SPAWN_TICK;
  private warm = true;

  constructor(
    private readonly grid: GridModel,
    private readonly world: IWorld2D,
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly scene: THREE.Scene,
    private readonly materials: IMaterialLibrary,
    private readonly makeVehicle: MakeVehicle,
    private readonly makePed?: MakePed,
  ) {
    this.laneNodes = Object.values(grid.lanes.nodes);
    this.spawnParked();
    this.spawnPeds();
    this.offs.push(
      events.on('pedKnockedDown', (e) => this.scare(e.pos, FLEE_RADIUS, e.id)),
      events.on('horn', (e) => this.scare(e.pos, HORN_FLEE_RADIUS, null)),
    );
  }

  /** Number of vehicles currently driven by a traffic AI. */
  get agentCount(): number { return this.active.length; }

  update(dt: number, playerPos: Vec2): void {
    // drive
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (a.vehicle.driver !== 'traffic') { this.swapRemove(this.active, i); continue; } // stolen
      const p = a.vehicle.body.pos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || dist(p, playerPos) > DESPAWN) {
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
      while (budget-- > 0 && near < MAX_TRAFFIC) {
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

  private spawnParked(): void {
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
        for (let s = PARK_END_MARGIN; s <= length - PARK_END_MARGIN; s += PARK_SPACING) {
          if (!this.rng.chance(PARK_OCCUPANCY)) continue;
          const along = s + this.rng.range(-0.6, 0.6);
          const pos = {
            x: seg.a.x + dir.x * along + right.x * curbOffset * side,
            z: seg.a.z + dir.z * along + right.z * curbOffset * side,
          };
          const v = this.makeVehicle(this.pickType(), pos, h, this.rng.pick(CAR_COLORS));
          v.driver = null;
          this.register(v);
        }
      }
    }
  }

  // ------------------------------------------------------------------ pedestrians

  private spawnPeds(): void {
    const cross = this.crosswalkNodeIds();
    const ids = Object.keys(this.grid.sidewalks.nodes);
    if (ids.length === 0) return;
    for (let i = 0; i < PED_COUNT; i++) {
      const node = this.grid.sidewalks.nodes[this.rng.pick(ids)];
      const id = `ped${i}`;
      const ped = this.makePed
        ? this.makePed(id, node)
        : new Pedestrian(id, node, this.grid.sidewalks, this.world, this.materials, this.events, this.rng.fork(id), cross);
      this.peds.push(ped);
      this.scene.add(ped.object3D);
      this.world.addBody(ped.body);
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
      if (this.world.queryCircle(n.pos, 5).length > 0) continue;
      const v = this.makeVehicle(this.pickType(), { x: n.pos.x, z: n.pos.z }, n.heading, this.rng.pick(CAR_COLORS));
      v.driver = 'traffic';
      this.register(v);
      const agent = new TrafficAgent(v, this.grid.lanes, this.world, this.rng.fork(v.id), {
        startNodeId: n.id,
        speedForStreet: (sid) => this.cruiseFor(sid),
      });
      this.active.push({ agent, vehicle: v });
      return true;
    }
    return false;
  }

  private cruiseFor(streetId: string): number {
    let s = this.speedCache.get(streetId);
    if (s === undefined) {
      s = this.grid.streetById(streetId).class === 'avenue' ? 12 : 8;
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
