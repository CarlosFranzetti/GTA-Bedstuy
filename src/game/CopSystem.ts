import type * as THREE from 'three';
import type { EventBus, GameEvents } from '@/core/Events';
import { dist, type Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { Body2D, GridModel, IVehicle, IWorld2D, LaneNode, VehicleType } from '@/world/types';
import { CopAgent } from '@/entities/Cop';
import type { WantedSystem } from './WantedSystem';

export type MakeCopVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string) => IVehicle;

const SPAWN_MIN = 100;
const SPAWN_MAX = 140;
const DESPAWN_OFF_DUTY = 150;
const DESPAWN_LOST = 240;
const HIT_COOLDOWN = 2;
const HIT_IMPULSE = 3;

interface CopEntry { vehicle: IVehicle; agent: CopAgent; hitCooldown: number; }

export class CopSystem {
  /** Every cop vehicle currently in the world (includes ones stolen by the player). */
  readonly cops: IVehicle[] = [];

  private readonly entries: CopEntry[] = [];
  private readonly laneNodes: LaneNode[];
  private readonly off: () => void;

  constructor(
    private readonly grid: GridModel,
    private readonly world: IWorld2D,
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly scene: THREE.Scene,
    private readonly makeVehicle: MakeCopVehicle,
    private readonly wanted: WantedSystem,
  ) {
    this.laneNodes = Object.values(grid.lanes.nodes);
    this.off = events.on('impact', (e) => this.onImpact(e));
  }

  update(dt: number, playerPos: Vec2): void {
    const wanted = Math.min(3, Math.max(0, this.wanted.stars));

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
      if (!Number.isFinite(d) || (!e.agent.pursuing && d > DESPAWN_OFF_DUTY) || d > DESPAWN_LOST) {
        this.remove(i);
        continue;
      }
      e.agent.update(dt, playerPos);
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
    for (const b of this.world.bodies()) {
      const ud = b.userData as { id?: string; driver?: string | null } | undefined;
      if (b.id !== e.a && b.id !== e.b && ud?.id !== e.a && ud?.id !== e.b) continue;
      if ((b.kind === 'vehicle' || b.kind === 'cop') && ud?.driver === 'player') playerCar = true;
      else if (b.kind === 'cop') cop = b;
    }
    if (!playerCar || !cop) return;
    const copBody: Body2D = cop;
    const entry = this.entries.find((x) => x.vehicle.body.id === copBody.id);
    if (entry) {
      if (entry.hitCooldown > 0) return;
      entry.hitCooldown = HIT_COOLDOWN;
    }
    this.events.emit('crime', { type: 'hitCop', pos: { x: e.pos.x, z: e.pos.z } });
  }

  private spawn(playerPos: Vec2): boolean {
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
      const agent = new CopAgent(v, this.grid, this.world);
      this.cops.push(v);
      this.entries.push({ vehicle: v, agent, hitCooldown: 0 });
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
