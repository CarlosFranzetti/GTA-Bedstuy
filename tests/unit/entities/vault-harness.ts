/**
 * MOVE2 harness: the real Player, World2D and Vehicles stepped like main.ts (entities update, then physics, then contacts), with the
 * vault wired the way main.ts wires it (`vehiclesNear` from `physics.queryCircle`). Not a test file.
 */
import { EventBus } from '@/core/Events';
import type { Vec2 } from '@/core/Math2';
import { Player } from '@/entities/Player';
import type { Vehicle } from '@/entities/Vehicle';
import { World2D } from '@/physics/World2D';
import type { IVehicle, VehicleType } from '@/world/types';
import { Sim, makeVehicle, stubMaterials } from '../sim/harness';

export type Keys = Partial<Record<string, number>>;
export interface Wall { x0: number; z0: number; x1: number; z1: number }
export interface CarDef { type?: VehicleType; x: number; z: number; heading: number; id?: string }

export const HALF_PI = Math.PI / 2;

export function fakeInput(k: Keys, jump = false): never {
  let space = jump;
  return {
    axis: (neg: string[], pos: string[]) => (pos.some((c) => k[c]) ? 1 : 0) - (neg.some((c) => k[c]) ? 1 : 0),
    isDown: (c: string) => !!k[c],
    consume: (c: string) => { if (c === 'Space' && space) { space = false; return true; } return false; },
    caps: false,
  } as never;
}

export class VaultScene {
  readonly physics = new World2D(12);
  readonly sim: Sim;
  readonly events = new EventBus();
  readonly player: Player;
  readonly cars: Vehicle[] = [];
  /** time since the start, in seconds */
  get time(): number { return this.sim.time; }

  constructor(walls: Wall[], cars: CarDef[], start: Vec2, readonly dt = 1 / 60, heading = 0) {
    walls.forEach((w, i) => this.physics.addStatic({ kind: 'polygon', points: [{ x: w.x0, z: w.z0 }, { x: w.x1, z: w.z0 }, { x: w.x1, z: w.z1 }, { x: w.x0, z: w.z1 }] }, { x: 0, z: 0 }, `wall${i}`));
    this.sim = new Sim(this.physics);
    this.player = new Player('p', { x: start.x, z: start.z }, stubMaterials, this.events);
    this.player.body.heading = heading;
    this.sim.entities.set('p', this.player);
    this.physics.addBody(this.player.body);
    this.player.vehiclesNear = (p, r) => this.physics.queryCircle(p, r).map((b) => b.userData as IVehicle).filter((u) => !!u && !!(u as IVehicle).spec && (u as IVehicle).body.kind !== 'player');
    cars.forEach((c, i) => { const v = makeVehicle(c.type ?? 'sedan', c.x, c.z, c.heading, this.events, c.id ?? `car${i}`); this.sim.add(v); this.cars.push(v); });
    this.sim.run(0.3, undefined, dt);
  }

  /** Run `seconds` with `keys` held; `jumpAt` presses Jump once at that time (s from the call). Returns the trace of positions. */
  run(seconds: number, keys: Keys = {}, jumpAt: number | null = null, cameraYaw = 0, each?: (t: number) => void): Vec2[] {
    const trace: Vec2[] = [];
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) {
      const t = i * this.dt;
      const press = jumpAt !== null && t >= jumpAt && t < jumpAt + this.dt;
      this.player.control(fakeInput(keys, press), cameraYaw);
      this.sim.step(this.dt);
      trace.push({ x: this.player.body.pos.x, z: this.player.body.pos.z });
      each?.(t);
    }
    return trace;
  }

  /** True when a foot circle at the player's position overlaps a wall or any car. */
  get inside(): boolean { return this.physics.overlapsSolid(this.player.body.pos, 0.38); }
  /** Longest straight clear run (m, up to 3) from the player's position in any of 16 directions. */
  get freeRun(): number {
    const b = this.player.body.pos; let best = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2; let d = 0.4;
      while (d <= 3 && !this.physics.overlapsSolid({ x: b.x + Math.cos(a) * d, z: b.z + Math.sin(a) * d }, 0.34)) d += 0.2;
      best = Math.max(best, d - 0.2);
    }
    return best;
  }
  dist(from: Vec2): number { return Math.hypot(this.player.body.pos.x - from.x, this.player.body.pos.z - from.z); }
}
