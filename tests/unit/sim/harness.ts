/**
 * Shared helpers for the Stage 2 QA simulation tests (not a test file itself).
 *
 * The step order mirrors src/main.ts: entities integrate (`update(dt)`), then World2D resolves overlaps and the
 * contacts are routed back to the entities' `onContact`. Materials are stubs, so no GPU/canvas is needed.
 */
import * as THREE from 'three';
import { EventBus } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { World2D } from '@/physics/World2D';
import { loadBedstuyData } from '@/world/Grid';
import { buildWorld } from '@/world/WorldBuilder';
import type { Body2D, Contact, Entity, IMaterialLibrary, VehicleInput, VehicleType } from '@/world/types';

export const DT = 1 / 60;

const mat = (): THREE.Material => new THREE.MeshBasicMaterial();
export const stubMaterials: IMaterialLibrary = {
  get: () => mat(), awning: () => mat(), sign: () => mat(), carPaint: () => mat(), setNight: () => {},
} as unknown as IMaterialLibrary;
/** A Proxy that answers every material request with one shared basic material (enough for buildWorld). */
export const proxyMaterials = (): IMaterialLibrary =>
  new Proxy({}, { get: () => () => new THREE.MeshBasicMaterial() }) as unknown as IMaterialLibrary;

export const input = (o: Partial<VehicleInput> = {}): VehicleInput =>
  ({ throttle: 0, steer: 0, brake: false, handbrake: false, horn: false, ...o });

let seq = 0;
export function makeVehicle(
  type: VehicleType = 'sedan', x = 0, z = 0, heading = 0, events = new EventBus(), id = `qa${seq++}`,
): Vehicle {
  return new Vehicle(id, { ...VEHICLE_SPECS[type] }, { x, z }, heading, stubMaterials, events);
}

/** Entities + World2D stepped like main.ts does. */
export class Sim {
  constructor(readonly world: World2D = new World2D(12)) {}
  /** Like main.ts: a Player registered here gets the world's static query for choosing a free exit spot. */
  readonly entities = new (class extends Map<string, Entity & { update(dt: number): void }> {
    constructor(private readonly w: () => World2D) { super(); }
    override set(k: string, v: Entity & { update(dt: number): void }): this {
      const pl = v as unknown as { blockedAt?: ((p: { x: number; z: number }, r: number) => boolean) | null };
      if (pl && 'blockedAt' in pl) pl.blockedAt = (p, r) => this.w().overlapsStatic(p, r);
      return super.set(k, v);
    }
  })(() => this.world);
  contactsLastStep: Contact[] = [];
  time = 0;

  add(e: Entity & { update(dt: number): void }): void {
    this.entities.set(e.body.id, e);
    this.world.addBody(e.body);
  }

  step(dt = DT): Contact[] {
    for (const e of this.entities.values()) e.update(dt);
    const contacts = this.world.step(dt);
    for (const c of contacts) {
      this.entities.get(c.a.id)?.onContact?.(c, c.b);
      this.entities.get(c.b.id)?.onContact?.(c, c.a);
    }
    this.time += dt;
    this.contactsLastStep = contacts;
    return contacts;
  }

  run(seconds: number, each?: (t: number) => void, dt = DT): void {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) { this.step(dt); each?.(this.time); }
  }
}

/** Slip angle in degrees between the velocity vector and the heading (0 = straight, 90 = sideways). */
export function slipAngleDeg(v: Vehicle): number {
  const lat = v.lateralSpeed;
  const lon = v.speed;
  if (Math.hypot(lat, lon) < 1e-6) return 0;
  return Math.abs((Math.atan2(lat, Math.abs(lon)) * 180) / Math.PI);
}

export const variance = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
};
export const peakToPeak = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

let cached: ReturnType<typeof buildWorld> | null = null;
/** The real Bed-Stuy world (2286+ static colliders) built once per test file with stub materials (~2 s). */
export function realWorld(): ReturnType<typeof buildWorld> {
  if (!cached) {
    const data = loadBedstuyData();
    cached = buildWorld(data, proxyMaterials(), new Rng(data.seed));
  }
  return cached;
}

/** A World2D loaded with the real static colliders. */
export function realPhysics(): { physics: World2D; world: ReturnType<typeof buildWorld> } {
  const world = realWorld();
  const physics = new World2D(12);
  for (const c of world.colliders) physics.addStatic(c.shape, c.pos, c.id);
  return { physics, world };
}

export type { Body2D };
