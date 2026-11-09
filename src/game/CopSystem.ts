import type * as THREE from 'three';
import type { EventBus, GameEvents } from '@/core/Events';
import { dist, type Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { Body2D, GridModel, IVehicle, IWorld2D, LaneNode, VehicleType } from '@/world/types';
import { CopAgent, type CopTarget } from '@/entities/Cop';
import type { TrafficLights } from './TrafficLights';
import type { WantedSystem } from './WantedSystem';

export type MakeCopVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string) => IVehicle;

const SPAWN_MIN = 100;
const SPAWN_MAX = 140;
const DESPAWN_OFF_DUTY = 150;
const DESPAWN_LOST = 240;
const HIT_COOLDOWN = 2;
const HIT_IMPULSE = 3;
const DESPAWN_PATROL = 190;
const PATROL_SPAWN_PERIOD = 2;
const QUARRY_REFRESH = 0.25;
// ---- petty crimes (BIBLE ladder: repeated ramming of parked cars = 1 star, pavement driving near people = 1 star)
/** Closing speed (m/s) above which a collision with a civilian car counts as ramming it. */
const RAM_MIN_STRENGTH = 6;
/** Rams within this window add up; the RAM_COUNT-th one is the 'hitParked' crime. */
const RAM_WINDOW = 15;
const RAM_COUNT = 2;
/** Seconds of driving on the pavement with pedestrians around before it is a crime, and how often it repeats. */
const SIDEWALK_SECONDS = 4;
const SIDEWALK_MIN_SPEED = 5;
const SIDEWALK_PED_RADIUS = 8;
/** The car must be this far inside the curb line: brushing the kerb edge is not pavement driving. */
const SIDEWALK_MARGIN = 1.5;

export interface CopSystemOptions {
  /** Signals obeyed by off-duty / patrolling cops (pursuing cops always ignore them). */
  lights?: TrafficLights;
  /** Cop cars that cruise the lanes like traffic while nobody is wanted (default 0). */
  patrolCount?: number;
}

interface CopEntry { vehicle: IVehicle; agent: CopAgent; hitCooldown: number; patrol: boolean; }

export class CopSystem {
  /** Every cop vehicle currently in the world (includes ones stolen by the player). */
  readonly cops: IVehicle[] = [];

  private readonly entries: CopEntry[] = [];
  private readonly laneNodes: LaneNode[];
  private readonly off: () => void;
  private readonly lights?: TrafficLights;
  private patrolCount: number;
  private patrolTimer = 0;
  private quarryTimer = 0;
  private quarryBody: Body2D | null = null;
  private readonly quarry: CopTarget = { heading: 0, vel: { x: 0, z: 0 }, stars: 0 };
  private ramCount = 0;
  private ramAge = 0;
  private sidewalkTime = 0;

  constructor(
    private readonly grid: GridModel,
    private readonly world: IWorld2D,
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly scene: THREE.Scene,
    private readonly makeVehicle: MakeCopVehicle,
    private readonly wanted: WantedSystem,
    opts: CopSystemOptions = {},
  ) {
    this.lights = opts.lights;
    this.patrolCount = opts.patrolCount ?? 0;
    this.laneNodes = Object.values(grid.lanes.nodes);
    this.off = events.on('impact', (e) => this.onImpact(e));
  }

  /** Patrol cars that cruise while nobody is wanted (quality tier); existing ones finish their route. */
  setPatrolCount(n: number): void { this.patrolCount = Math.max(0, Math.floor(n)); }

  /** `playerBody`: the body the cops chase (the player's car or the player on foot). Looked up when omitted. */
  update(dt: number, playerPos: Vec2, playerBody?: Body2D): void {
    const wanted = Math.min(3, Math.max(0, this.wanted.stars));
    const body = playerBody ?? this.findQuarry(dt);
    let quarry: CopTarget | undefined;
    if (body) {
      this.quarry.heading = body.heading;
      this.quarry.vel = body.vel;
      this.quarry.stars = wanted;
      quarry = this.quarry;
    }

    this.watchSidewalk(dt, body);
    if (this.ramCount > 0 && (this.ramAge += dt) > RAM_WINDOW) this.ramCount = 0;

    // patrol cars cruise while nobody is wanted
    if (wanted === 0 && this.patrolCount > 0) {
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrolTimer = PATROL_SPAWN_PERIOD;
        let active = 0;
        for (const e of this.entries) if (e.vehicle.driver === 'cop') active++;
        if (active < this.patrolCount) this.spawn(playerPos, true);
      }
    }

    // active (still driven by the AI) cops
    let onDuty = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.vehicle.driver !== 'cop') continue; // taken over by the player: leave it alone
      if (e.hitCooldown > 0) e.hitCooldown -= dt;
      if (e.agent.pursuing) onDuty++;
    }

    // too many on duty (stars dropped): send the farthest ones home
    while (onDuty > wanted) {
      let far: CopEntry | null = null;
      let farD = -1;
      for (const e of this.entries) {
        if (e.vehicle.driver !== 'cop' || !e.agent.pursuing) continue;
        const d = dist(e.vehicle.body.pos, playerPos);
        if (d > farD) { farD = d; far = e; }
      }
      if (!far) break;
      far.agent.setPursuing(false);
      onDuty--;
    }
    // too few: dispatch (re-hire an off-duty cop first, otherwise spawn)
    while (onDuty < wanted) {
      const off = this.entries.find((e) => e.vehicle.driver === 'cop' && !e.agent.pursuing);
      if (off) off.agent.setPursuing(true);
      else if (!this.spawn(playerPos)) break;
      onDuty++;
    }

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      const v = e.vehicle;
      if (v.driver !== 'cop') {
        // abandoned by the player far away: clean it up
        if (v.driver === null && dist(v.body.pos, playerPos) > DESPAWN_LOST) this.remove(i);
        continue;
      }
      const p = v.body.pos;
      const d = dist(p, playerPos);
      const offDutyLimit = e.patrol ? DESPAWN_PATROL : DESPAWN_OFF_DUTY;
      if (!Number.isFinite(d) || (!e.agent.pursuing && d > offDutyLimit) || d > DESPAWN_LOST) {
        this.remove(i);
        continue;
      }
      e.agent.update(dt, playerPos, quarry);
    }
  }

  dispose(): void {
    this.off();
  }

  // ------------------------------------------------------------------ internals

  private onImpact(e: GameEvents['impact']): void {
    if (e.strength <= HIT_IMPULSE) return;
    let playerCar = false;
    let cop: Body2D | null = null;
    let civilian: Body2D | null = null;
    for (const b of this.world.bodies()) {
      const ud = b.userData as { id?: string; driver?: string | null } | undefined;
      if (b.id !== e.a && b.id !== e.b && ud?.id !== e.a && ud?.id !== e.b) continue;
      if ((b.kind === 'vehicle' || b.kind === 'cop') && ud?.driver === 'player') playerCar = true;
      else if (b.kind === 'cop') cop = b;
      else if (b.kind === 'vehicle') civilian = b;
    }
    if (!playerCar) return;
    if (!cop) {
      if (civilian && e.strength >= RAM_MIN_STRENGTH) this.onRam(e);
      return;
    }
    const copBody: Body2D = cop;
    const entry = this.entries.find((x) => x.vehicle.body.id === copBody.id);
    if (entry) {
      if (entry.hitCooldown > 0) return;
      entry.hitCooldown = HIT_COOLDOWN;
    }
    this.events.emit('crime', { type: 'hitCop', pos: { x: e.pos.x, z: e.pos.z } });
  }

  /** The player's car hit a parked or civilian car hard: one bump is a 'hitVehicle'; repeating it is 'hitParked'. */
  private onRam(e: GameEvents['impact']): void {
    const pos = { x: e.pos.x, z: e.pos.z };
    this.ramCount++;
    this.ramAge = 0;
    if (this.ramCount >= RAM_COUNT) {
      this.ramCount = 0;
      this.events.emit('crime', { type: 'hitParked', pos });
    } else {
      this.events.emit('crime', { type: 'hitVehicle', pos });
    }
  }

  /** Driving on the pavement (inside a block's curb line) with pedestrians nearby, for SIDEWALK_SECONDS in a row. */
  private watchSidewalk(dt: number, body: Body2D | null): void {
    const ud = body?.userData as { driver?: string | null } | undefined;
    if (!body || (body.kind !== 'vehicle' && body.kind !== 'cop') || ud?.driver !== 'player' ||
        Math.hypot(body.vel.x, body.vel.z) < SIDEWALK_MIN_SPEED || !this.onSidewalk(body.pos)) {
      this.sidewalkTime = Math.max(0, this.sidewalkTime - dt * 2);
      return;
    }
    let peds = false;
    for (const o of this.world.queryCircle(body.pos, SIDEWALK_PED_RADIUS)) if (o.kind === 'ped') { peds = true; break; }
    if (!peds) { this.sidewalkTime = Math.max(0, this.sidewalkTime - dt); return; }
    this.sidewalkTime += dt;
    if (this.sidewalkTime >= SIDEWALK_SECONDS) {
      this.sidewalkTime = 0;
      this.events.emit('crime', { type: 'sidewalkDriving', pos: { x: body.pos.x, z: body.pos.z } });
    }
  }

  /** True inside a block's curb polygon (the pavement ring plus the lots behind it), i.e. not on a roadway. */
  private onSidewalk(p: Vec2): boolean {
    for (const blk of this.grid.blocks ?? []) {
      const c = blk.curb;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const q of c) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
      if (p.x >= minX + SIDEWALK_MARGIN && p.x <= maxX - SIDEWALK_MARGIN && p.z >= minZ + SIDEWALK_MARGIN && p.z <= maxZ - SIDEWALK_MARGIN) return true;
    }
    return false;
  }

  /** The body being chased: whichever vehicle the player drives, else the player's own body. Cached briefly. */
  private findQuarry(dt: number): Body2D | null {
    this.quarryTimer -= dt;
    if (this.quarryTimer > 0) return this.quarryBody;
    this.quarryTimer = QUARRY_REFRESH;
    let found: Body2D | null = null;
    for (const b of this.world.bodies()) {
      if (b.kind === 'player') { found = b; continue; }
      if (b.kind !== 'vehicle' && b.kind !== 'cop') continue;
      if ((b.userData as { driver?: string | null } | undefined)?.driver === 'player') { found = b; break; }
    }
    this.quarryBody = found;
    return found;
  }

  private spawn(playerPos: Vec2, patrol = false): boolean {
    const nodes = this.laneNodes;
    if (nodes.length === 0) return false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const n = nodes[Math.floor(this.rng.next() * nodes.length) % nodes.length];
      if (n.stopLine) continue;
      const d = dist(n.pos, playerPos);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      if (this.world.queryCircle(n.pos, 5).length > 0) continue;
      const v = this.makeVehicle('cop', { x: n.pos.x, z: n.pos.z }, n.heading, '#1b2a4a');
      v.driver = 'cop';
      v.siren = true;
      this.scene.add(v.object3D);
      this.world.addBody(v.body);
      const agent = new CopAgent(v, this.grid, this.world, this.lights);
      if (patrol) agent.setPursuing(false);
      this.cops.push(v);
      this.entries.push({ vehicle: v, agent, hitCooldown: 0, patrol });
      return true;
    }
    return false;
  }

  private remove(entryIndex: number): void {
    const e = this.entries[entryIndex];
    this.entries.splice(entryIndex, 1);
    const ci = this.cops.indexOf(e.vehicle);
    if (ci >= 0) this.cops.splice(ci, 1);
    this.scene.remove(e.vehicle.object3D);
    this.world.removeBody(e.vehicle.body.id);
    e.vehicle.dispose();
  }
}
