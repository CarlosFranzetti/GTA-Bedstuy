/**
 * A thrown bottle or brick: a ballistic arc (gravity, about 14 m/s, aimed along the camera's yaw, slightly up) that stops at the
 * first thing it meets: a pedestrian, a vehicle, a wall (any static) or the ground. The 2D world answers the horizontal part with
 * its own ray test (World2D.raycast, the same one the camera uses); the height decides whether the item clears a low body.
 */
import { forwardFromHeading, type Vec2 } from '@/core/Math2';
import type { Body2D, IVehicle, IWorld2D } from '@/world/types';

export const THROW = {
  speed: 14,
  /** upward speed at release, m/s ("slightly up") */
  up: 2.4,
  gravity: 9.8,
  /** release height above the ground, m (a hand at shoulder height) */
  releaseY: 1.5,
  /** how far in front of the body the item leaves the hand */
  reach: 0.55,
  /** below this the item is on the ground */
  groundY: 0.06,
  /** seconds before an item in flight is dropped anyway */
  maxAge: 4,
} as const;

export type ThrowKind = 'bottle' | 'brick';
export type HitTarget = 'ped' | 'vehicle' | 'wall' | 'ground';

export interface Projectile {
  kind: ThrowKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** tumble angle, for the mesh */
  spin: number;
  age: number;
  bounces: number;
  /** false once it came to rest or broke */
  alive: boolean;
}

export interface FlightHit {
  target: HitTarget;
  body?: Body2D;
  x: number; y: number; z: number;
}

/** A projectile leaving the hand of a body at `from`, thrown along `yaw` (camera heading). */
export function launch(kind: ThrowKind, from: Vec2, yaw: number): Projectile {
  const f = forwardFromHeading(yaw);
  return {
    kind,
    x: from.x + f.x * THROW.reach, y: THROW.releaseY, z: from.z + f.z * THROW.reach,
    vx: f.x * THROW.speed, vy: THROW.up, vz: f.z * THROW.speed,
    spin: 0, age: 0, bounces: 0, alive: true,
  };
}

/** How tall a body is for the purpose of a thrown item passing over it. */
export function bodyHeight(body: Body2D): number {
  if (body.kind === 'ped' || body.kind === 'player') return 2.0; // a head at 1.8 m, and a little forgiveness
  if (body.kind === 'vehicle' || body.kind === 'cop') {
    const spec = (body.userData as Partial<IVehicle> | undefined)?.spec;
    return spec?.height ?? 1.6;
  }
  return body.height ?? 4;
}

function targetOf(body: Body2D): HitTarget {
  if (body.kind === 'ped') return 'ped';
  if (body.kind === 'vehicle' || body.kind === 'cop') return 'vehicle';
  return 'wall';
}

/**
 * Advance one step. Returns what the item hit during the step (position of the hit), or null while still flying.
 * The item is left at its new position when nothing was hit; on a hit it is left at the hit point.
 */
export function stepProjectile(p: Projectile, dt: number, world: IWorld2D, ignoreId = 'player'): FlightHit | null {
  if (!p.alive) return null;
  p.age += dt;
  p.spin += dt * 14;
  const ox = p.x, oz = p.z, oy = p.y;
  p.vy -= THROW.gravity * dt;
  const nx = ox + p.vx * dt, nz = oz + p.vz * dt, ny = oy + p.vy * dt;
  const dx = nx - ox, dz = nz - oz;
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) {
    const hit = world.raycast({ x: ox, z: oz }, { x: dx / len, z: dz / len }, len, ignoreId);
    if (hit && hit.dist <= len + 1e-6) {
      const k = len > 0 ? hit.dist / len : 0;
      const yAt = oy + (ny - oy) * k;
      if (yAt < bodyHeight(hit.body)) {
        p.x = hit.point.x; p.z = hit.point.z; p.y = Math.max(THROW.groundY, yAt);
        return { target: targetOf(hit.body), body: hit.body, x: p.x, y: p.y, z: p.z };
      }
    }
  }
  p.x = nx; p.z = nz; p.y = ny;
  if (ny <= THROW.groundY) {
    // interpolate back to where it crossed the ground
    const k = (oy - THROW.groundY) / Math.max(1e-6, oy - ny);
    p.x = ox + dx * k; p.z = oz + dz * k; p.y = THROW.groundY;
    return { target: 'ground', x: p.x, y: p.y, z: p.z };
  }
  if (p.age > THROW.maxAge) { p.alive = false; }
  return null;
}

export interface ImpactOutcome {
  /** the item breaks (a bottle) */
  shatters: boolean;
  /** the item stays in the world as a pickup (a brick) */
  dropsAsPickup: boolean;
  /** the thing hit goes down (pedestrians only) */
  knockdown: boolean;
  sound: 'glass' | 'thud';
  particles: 'glass' | 'dust' | 'none';
  /** a thud on a car body */
  carThud: boolean;
}

/**
 * What an item does on the first thing it meets. A bottle always shatters. A brick knocks a pedestrian down, thuds on a car and
 * bounces off a wall or the ground; it can be picked up again.
 */
export function impactOutcome(kind: ThrowKind, target: HitTarget): ImpactOutcome {
  const knockdown = target === 'ped';
  if (kind === 'bottle') {
    return { shatters: true, dropsAsPickup: false, knockdown, sound: 'glass', particles: 'glass', carThud: target === 'vehicle' };
  }
  return { shatters: false, dropsAsPickup: true, knockdown, sound: 'thud', particles: target === 'ground' || target === 'wall' ? 'dust' : 'none', carThud: target === 'vehicle' };
}

/** After a non-shattering hit: velocity of the bounce (a damped reflection). Returns false when it has come to rest. */
export function bounce(p: Projectile, target: HitTarget): boolean {
  p.bounces++;
  if (target === 'ground') {
    p.vy = -p.vy * 0.35;
    p.vx *= 0.6; p.vz *= 0.6;
    if (Math.abs(p.vy) < 1.1 || p.bounces > 3) { p.vx = p.vy = p.vz = 0; return false; }
    p.y = THROW.groundY + 0.02;
    return true;
  }
  // wall, car or person: lose most of the speed and drop back toward the thrower
  p.vx = -p.vx * 0.2; p.vz = -p.vz * 0.2; p.vy = Math.min(0, p.vy) * 0.2;
  return p.bounces <= 3;
}
