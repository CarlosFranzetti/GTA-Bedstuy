import * as THREE from 'three';
import {
  applyPose, clamp, dist, forwardFromHeading, headingFromVec, perpRight, type Vec2,
} from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type { Input } from '@/core/Input';
import { animateWalk, buildHumanModel, type HumanModel } from '@/entities/models/humanModel';
import { Rng } from '@/core/Rng';
import type { Body2D, Entity, IMaterialLibrary, IVehicle, VehicleInput } from '@/world/types';

export const WALK_SPEED = 3;
export const RUN_SPEED = 6.5;
export const ENTER_RANGE = 3;
const FOOT_RADIUS = 0.4;
/** Collision radius while seated in a vehicle (effectively no collision footprint). */
const SEATED_RADIUS = 0.01;

const NEUTRAL: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };

/**
 * Player on foot / driving.
 *
 * In-vehicle body approach: `body` always exists with kind 'player'. While `inVehicle` is true
 * `body.shape.r` is shrunk to 0.01, vel/pos/heading are copied from the vehicle every update, and
 * `update()` does not integrate. The integrator SHOULD additionally skip adding/stepping the player
 * body in World2D while `inVehicle` (removeBody on 'enterVehicle', addBody on 'exitVehicle').
 */
export class Player implements Entity {
  readonly body: Body2D & { shape: { kind: 'circle'; r: number } };
  readonly object3D = new THREE.Group();
  vehicle: IVehicle | null = null;

  private vehicleInput: VehicleInput = { ...NEUTRAL };
  private desiredVel: Vec2 = { x: 0, z: 0 };
  private walkPhase = Math.PI / 2;
  private walkAmp = 0;
  private model!: HumanModel;

  constructor(readonly id: string, pos: Vec2, materials: IMaterialLibrary, private events: EventBus) {
    this.body = {
      id,
      kind: 'player',
      shape: { kind: 'circle', r: FOOT_RADIUS },
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      heading: 0,
      mass: 80,
      userData: this,
    };
    this.buildMesh(materials);
    applyPose(this.object3D, this.body.pos, this.body.heading);
  }

  get inVehicle(): boolean { return this.vehicle !== null; }
  /** The VehicleInput derived by the last control() call. */
  get lastVehicleInput(): VehicleInput { return this.vehicleInput; }

  /**
   * Consume input. F (enter/exit) is NOT handled here: the integrator calls
   * `input.pressed('KeyF') ? (player.inVehicle ? player.exit() : player.tryEnter(vehicles)) : 0`.
   */
  control(input: Input, cameraYaw: number): void {
    if (this.vehicle) {
      const vi: VehicleInput = {
        throttle: input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
        steer: input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
        brake: input.isDown('Space'),
        handbrake: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
        horn: input.isDown('KeyH'),
      };
      this.vehicleInput = vi;
      this.vehicle.setInput(vi);
      if (input.pressed('KeyE')) this.events.emit('radioNext', {});
      this.desiredVel = { x: 0, z: 0 };
      return;
    }

    this.vehicleInput = { ...NEUTRAL };
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const right = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const f = forwardFromHeading(cameraYaw);
    const r = perpRight(f);
    let dx = f.x * fwd + r.x * right;
    let dz = f.z * fwd + r.z * right;
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) {
      dx /= l; dz /= l;
      const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const sp = run ? RUN_SPEED : WALK_SPEED;
      this.desiredVel = { x: dx * sp, z: dz * sp };
      this.body.heading = headingFromVec({ x: dx, z: dz });
    } else {
      this.desiredVel = { x: 0, z: 0 };
    }
    this.body.vel.x = this.desiredVel.x;
    this.body.vel.z = this.desiredVel.z;
  }

  /** Enter the nearest vehicle whose door is within 3 m. Returns it, or null. */
  tryEnter(vehicles: IVehicle[]): IVehicle | null {
    if (this.vehicle) return null;
    let best: IVehicle | null = null;
    let bestD = ENTER_RANGE;
    for (const v of vehicles) {
      if (v.driver === 'player') continue;
      const d = dist(this.body.pos, v.doorPos());
      if (d <= bestD) { bestD = d; best = v; }
    }
    if (!best) return null;
    const prev = best.driver;
    best.driver = 'player';
    best.setInput(NEUTRAL);
    this.vehicle = best;
    this.object3D.visible = false;
    this.body.shape.r = SEATED_RADIUS;
    this.syncToVehicle();
    this.events.emit('enterVehicle', { vehicleId: best.id });
    if (prev === 'traffic' || prev === 'cop') {
      this.events.emit('crime', { type: 'carjack', pos: { x: best.body.pos.x, z: best.body.pos.z } });
    }
    return best;
  }

  /** Leave the vehicle, standing at its driver's door. */
  exit(): void {
    const v = this.vehicle;
    if (!v) return;
    const door = v.doorPos();
    v.driver = null;
    v.setInput(NEUTRAL);
    this.vehicle = null;
    this.body.pos.x = door.x;
    this.body.pos.z = door.z;
    this.body.vel.x = 0;
    this.body.vel.z = 0;
    this.body.heading = v.body.heading;
    this.body.shape.r = FOOT_RADIUS;
    this.desiredVel = { x: 0, z: 0 };
    this.vehicleInput = { ...NEUTRAL };
    this.object3D.visible = true;
    this.events.emit('exitVehicle', { vehicleId: v.id });
  }

  update(dt: number): void {
    if (this.vehicle) {
      this.syncToVehicle();
      return;
    }
    const b = this.body;
    b.vel.x = this.desiredVel.x;
    b.vel.z = this.desiredVel.z;
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;

    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp > 0.1) {
      this.walkPhase += dt * sp * 3.2;
      const target = clamp(sp / WALK_SPEED, 0.6, 1.6);
      this.walkAmp += (target - this.walkAmp) * Math.min(1, dt * 12);
    } else {
      this.walkAmp *= Math.pow(0.8, dt * 30);
      if (this.walkAmp < 0.002) this.walkAmp = 0;
    }
    animateWalk(this.model, this.walkPhase, this.walkAmp);
    applyPose(this.object3D, b.pos, b.heading, 0);
  }

  dispose(): void {
    // human geometries are shared module-wide; nothing per-player to free
    this.object3D.removeFromParent();
  }

  private syncToVehicle(): void {
    const v = this.vehicle!;
    this.body.pos.x = v.body.pos.x;
    this.body.pos.z = v.body.pos.z;
    this.body.vel.x = v.body.vel.x;
    this.body.vel.z = v.body.vel.z;
    this.body.heading = v.body.heading;
    applyPose(this.object3D, this.body.pos, this.body.heading, 0);
  }

  private buildMesh(materials: IMaterialLibrary): void {
    // fixed-seed rng: the player always looks the same. Variant 0 cloth = the red top.
    this.model = buildHumanModel(materials, new Rng('player'), {
      shirt: 0, skin: 0, pants: 1, outfit: 'hoodie', hat: 'cap', accessory: 'none', heightScale: 1,
    });
    this.object3D.add(this.model.group);
  }
}
