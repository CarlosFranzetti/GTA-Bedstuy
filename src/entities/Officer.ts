/**
 * POLICE2: a police officer on foot. Not a Pedestrian (no sidewalk graph, no social life): PoliceSystem owns it, steers it toward
 * a point, and tells it when to reach for the player. It uses the same person builder (variant 'cop': uniform and cap), the same
 * captured-motion controller and the hand-keyed `grab` pose. Nobody is hurt: a hit staggers it, it never goes down.
 */
import * as THREE from 'three';
import { hyp } from '@/core/Math2';
import { angleDiff, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { AnimController } from '@/entities/anim/controller';
import { makeGait, type Gait } from '@/entities/anim/gait';
import { animateWalk, type HumanModel } from '@/entities/models/humanModel';
import { PedVitals, DAMAGE, type Force } from '@/entities/pedVitals';
import { buildPerson } from '@/entities/models/pedMesh';
import { easeGround, groundAt } from '@/world/Ground';
import type { Body2D, Entity, IMaterialLibrary } from '@/world/types';

export const OFFICER_WALK = 2.0;
export const OFFICER_RUN = 4.4;
/** Reach (m) at which an officer can take hold of someone on foot. */
export const GRAB_REACH = 1.2;

export type OfficerMode = 'approach' | 'hold' | 'search' | 'leave';
/** COMBAT2: an officer can be put on the ground; he is back up in this many seconds (never knocked out for long). */
export const OFFICER_DOWN_SECONDS = 4;

export class Officer implements Entity {
  readonly object3D: THREE.Group;
  readonly body: Body2D;
  mode: OfficerMode = 'approach';
  /** COMBAT2: 'down' while on the ground after a hard hit (Combat reads it like a pedestrian's) */
  state: 'walking' | 'down' = 'walking';
  /** health: an officer is sturdy and always gets up */
  readonly vitals: PedVitals;
  private downT = 0;
  /** where to walk in 'search' (the player's last seen spot) or 'leave' */
  goal: Vec2 | null = null;
  /** run rather than walk (two stars and up, or the player is getting away) */
  run = false;
  /** seconds this officer may not grab again (after a break-free) */
  cooldown = 0;
  /** what the arm pose shows: 0 none .. 1 reaching */
  reach = 0;
  /** the last time (s on this officer's clock) something struck it */
  struck = 0;
  age = 0;
  /** the next point on the way (from the sidewalk router) and seconds until it is asked again */
  waypoint: Vec2 | null = null;
  routeT = 0;
  /** called when the player hits this officer (Combat.hurt calls `hitBy`): PoliceSystem breaks the hold and reports the crime */
  onStruck: (() => void) | null = null;

  private readonly model: HumanModel | null;
  private anim: AnimController | null = null;
  private gait: Gait | null = null;
  private groundY = NaN;
  private phase = 0;
  private animHeading = 0;
  private speedNow = 0;
  private stagger = 0;

  constructor(readonly id: string, pos: Vec2, heading: number, materials: IMaterialLibrary, rng: Rng) {
    this.body = { id, kind: 'ped', shape: { kind: 'circle', r: 0.3 }, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, heading, mass: 75, userData: this };
    this.vitals = new PedVitals(id, 'adult'); this.vitals.immune = true;
    this.model = buildPerson(materials, rng, { variant: 'cop' }) as unknown as HumanModel;
    this.object3D = this.model.group;
    this.object3D.rotation.order = 'YXZ';
    this.applyPose(0);
  }

  get speed(): number { return this.speedNow; }

  /**
   * The player hit this officer. Same signature as Pedestrian.hitBy so Combat can call it: it staggers (a step back), never goes down.
   * Returns 'staggered' so the combat code treats it as a light hit.
   */
  hitBy(from: Vec2, force: Force = 'light', damage?: number): 'staggered' | 'knockedDown' | 'struckDown' | 'ignored' {
    const dx = this.body.pos.x - from.x, dz = this.body.pos.z - from.z, d = hyp(dx, dz) || 1;
    const was = this.state === 'down';
    const out = this.vitals.strike(force, (damage ?? DAMAGE[force]) * 0.7, was);
    this.struck = this.age;
    this.onStruck?.();
    if (was) { this.downT = Math.max(this.downT, 2); return 'struckDown'; }
    this.body.pos.x += (dx / d) * 0.3; this.body.pos.z += (dz / d) * 0.3;
    if (out === 'stagger') { this.stagger = 0.5; return 'staggered'; }
    this.state = 'down'; this.downT = OFFICER_DOWN_SECONDS; this.body.vel.x = 0; this.body.vel.z = 0; this.speedNow = 0;
    return 'knockedDown';
  }

  /** A push back without it counting as a hit (breaking out of a hold): a step away and a beat of stagger. */
  shove(from: Vec2): void {
    const dx = this.body.pos.x - from.x, dz = this.body.pos.z - from.z, d = hyp(dx, dz) || 1;
    this.body.pos.x += (dx / d) * 0.6; this.body.pos.z += (dz / d) * 0.6;
    this.stagger = 0.6;
  }

  /** Walk toward `to` at walking or running pace; stops within `stop` metres. Returns the distance left. */
  steer(dt: number, to: Vec2, stop = 0.1): number {
    const b = this.body;
    const dx = to.x - b.pos.x, dz = to.z - b.pos.z, d = hyp(dx, dz);
    if (this.state === 'down' || this.stagger > 0 || d <= stop) { b.vel.x = 0; b.vel.z = 0; this.speedNow = 0; return d; }
    const v = Math.min(this.run ? OFFICER_RUN : OFFICER_WALK, (d - stop) / Math.max(dt, 1e-3));
    b.vel.x = (dx / d) * v; b.vel.z = (dz / d) * v;
    const want = Math.atan2(dx, -dz);
    b.heading += angleDiff(b.heading, want) * Math.min(1, dt * 9);
    this.speedNow = v;
    return d;
  }

  /** Face a point without moving (while holding someone). */
  face(dt: number, to: Vec2): void {
    const want = Math.atan2(to.x - this.body.pos.x, -(to.z - this.body.pos.z));
    this.body.heading += angleDiff(this.body.heading, want) * Math.min(1, dt * 9);
  }

  stop(): void { this.body.vel.x = 0; this.body.vel.z = 0; this.speedNow = 0; }

  update(dt: number): void {
    this.age += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.routeT > 0) this.routeT -= dt;
    if (this.stagger > 0) this.stagger -= dt;
    this.vitals.tick(dt);
    if (this.state === 'down') { this.cooldown = Math.max(this.cooldown, 1.5); this.downT -= dt; this.body.vel.x = 0; this.body.vel.z = 0; this.speedNow = 0; if (this.downT <= 0) { this.state = 'walking'; this.vitals.wake(); this.vitals.health = this.vitals.max; } }
    // like a Pedestrian the officer moves its own body (World2D only pushes overlapping bodies apart); then the figure follows
    this.body.pos.x += this.body.vel.x * dt; this.body.pos.z += this.body.vel.z * dt;
    if (this.speedNow > 0.1) this.phase += dt * 5 * (this.run ? 1.8 : 1);
    this.animate(dt);
    this.applyPose(dt);
  }

  private animate(dt: number): void {
    const m = this.model;
    if (!m) return;
    this.gait ??= makeGait(Rng.hash(`${this.id}:gait`), 'adult');
    this.anim ??= new AnimController(m, this.gait);
    const yawRate = dt > 0 ? -angleDiff(this.animHeading, this.body.heading) / dt : 0;
    this.animHeading = this.body.heading;
    const action = this.mode === 'hold' || this.reach > 0 ? { kind: 'grab' as const, k: Math.max(0.01, this.reach) } : null;
    if (!this.anim.update(dt, { speed: this.speedNow, yawRate, action, look: null })) animateWalk(m, this.phase, this.speedNow > 0.1 ? 0.9 : 0);
  }

  private applyPose(dt: number): void {
    const o = this.object3D;
    this.groundY = easeGround(this.groundY, groundAt(this.body.pos.x, this.body.pos.z), dt > 0 ? dt : 1 / 60);
    const down = this.state === 'down';
    o.position.set(this.body.pos.x, this.groundY + (down ? 0.22 : 0), this.body.pos.z);
    o.rotation.y = -this.body.heading;
    o.rotation.x = down ? Math.PI / 2 : 0;
  }

  dispose(): void { this.object3D.removeFromParent(); }
}
