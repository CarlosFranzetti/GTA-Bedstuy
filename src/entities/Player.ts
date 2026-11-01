import * as THREE from 'three';
import {
  angleDiff, applyPose, clamp, dist, forwardFromHeading, headingFromVec, perpRight, wrapAngle, type Vec2,
} from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type { Input } from '@/core/Input';
import { animateWalk, buildHumanModel, type HumanModel } from '@/entities/models/humanModel';
import type { CharacterRig, CharacterSource } from '@/world/types';
import { Rng } from '@/core/Rng';
import type { Body2D, Entity, IMaterialLibrary, IVehicle, VehicleInput } from '@/world/types';

export const WALK_SPEED = 3;
export const RUN_SPEED = 6.5;
export const ENTER_RANGE = 3;
const FOOT_RADIUS = 0.4;
/** m/s^2 while speeding up / while stopping (a walk-speed start takes ~0.19 s, a stop ~0.11 s). */
const ACCEL = 16;
const DECEL = 28;
/** Reversing direction accelerates a bit harder than a plain start. */
const TURN_ACCEL_BOOST = 1.5;
/** Sprint blend ramps 0 -> 1 in this many seconds when Shift is held, and back down faster. */
const SPRINT_RAMP_UP = 0.45;
const SPRINT_RAMP_DOWN = 0.25;
/** Facing turns toward the move direction with this exponential rate (1/s). */
const TURN_SMOOTH = 16;
/** Walk to the car door before getting in. */
const ENTER_TIME = 0.4;
/** Standing clearance outside the body flank after exiting, beyond the foot radius. */
const EXIT_GAP = 0.15;
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
  /** State at the END of the previous step (captured at the start of update()), for render interpolation. */
  readonly prevPos: Vec2 = { x: 0, z: 0 };
  prevHeading = 0;

  private vehicleInput: VehicleInput = { ...NEUTRAL };
  private desiredVel: Vec2 = { x: 0, z: 0 };
  private moveDir: Vec2 | null = null;
  private wantRun = false;
  private sprintBlend = 0;
  private entering: { vehicle: IVehicle; t: number; from: Vec2; prevDriver: IVehicle['driver'] } | null = null;
  /** A second F press arrived during the walk to the door (long on slow machines): exit right after sitting down. */
  private exitQueued = false;
  private walkPhase = Math.PI / 2;
  private walkAmp = 0;
  private model: HumanModel | null = null;
  private rig: CharacterRig | null = null;
  /** Optional rigged character source (GLB) for the player; set once at boot before constructing the Player. */
  static characterSource: CharacterSource | null = null;

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
    this.prevPos.x = pos.x; this.prevPos.z = pos.z;
    this.buildMesh(materials);
    applyPose(this.object3D, this.body.pos, this.body.heading);
  }

  get inVehicle(): boolean { return this.vehicle !== null; }
  /** True during the short walk to the door that precedes getting into a car (see tryEnter). */
  get isEntering(): boolean { return this.entering !== null; }
  /** 0..1 sprint ramp (0 = walking, 1 = full run). */
  get sprint(): number { return this.sprintBlend; }
  /** The VehicleInput derived by the last control() call. */
  get lastVehicleInput(): VehicleInput { return this.vehicleInput; }

  /**
   * Consume input. F (enter/exit) is NOT handled here: the integrator calls
   * `input.consume('KeyF') ? (player.inVehicle ? player.exit() : player.tryEnter(vehicles)) : 0`
   * (consume, not pressed: a slow frame runs several fixed steps and the edge must fire once).
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
      if (input.consume('KeyE')) this.events.emit('radioNext', {});
      this.desiredVel = { x: 0, z: 0 };
      return;
    }

    this.vehicleInput = { ...NEUTRAL };
    if (this.entering) { this.moveDir = null; this.wantRun = false; return; }
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const right = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const f = forwardFromHeading(cameraYaw);
    const r = perpRight(f);
    let dx = f.x * fwd + r.x * right;
    let dz = f.z * fwd + r.z * right;
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) {
      this.moveDir = { x: dx / l, z: dz / l };
      this.wantRun = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    } else {
      this.moveDir = null;
      this.wantRun = false;
    }
  }

  /**
   * Start getting into the nearest vehicle whose door is within 3 m. Returns it (or null). The car is claimed
   * at once (`driver = 'player'`, input neutral) but the player first walks to the door for ~0.4 s; then
   * `enterVehicle` fires and `inVehicle` becomes true. Call `update(dt)` as usual.
   */
  tryEnter(vehicles: IVehicle[]): IVehicle | null {
    if (this.entering) { this.exitQueued = true; return null; } // F again while walking to the door: "never mind", leave as soon as seated
    if (this.vehicle) return null;
    let best: IVehicle | null = null;
    let bestD = ENTER_RANGE;
    for (const v of vehicles) {
      if (v.driver === 'player') continue;
      const d = dist(this.body.pos, v.doorPos());
      if (d <= bestD) { bestD = d; best = v; }
    }
    if (!best) return null;
    const prevDriver = best.driver;
    best.driver = 'player';
    best.setInput({ ...NEUTRAL, brake: true }); // a rolling car brakes while you climb in instead of coasting away from the door
    this.exitQueued = false;
    this.entering = { vehicle: best, t: 0, from: { x: this.body.pos.x, z: this.body.pos.z }, prevDriver };
    this.body.shape.r = SEATED_RADIUS; // glide through the car's own collision box
    this.moveDir = null;
    this.wantRun = false;
    this.desiredVel = { x: 0, z: 0 };
    return best;
  }

  /** Leave the vehicle, standing beside its driver's door and facing the car. */
  exit(): void {
    const v = this.vehicle;
    if (!v) return;
    const f = forwardFromHeading(v.body.heading);
    const left = { x: -perpRight(f).x, z: -perpRight(f).z };
    const off = v.spec.width / 2 + FOOT_RADIUS + EXIT_GAP;
    v.driver = null;
    v.setInput(NEUTRAL);
    this.vehicle = null;
    this.body.pos.x = v.body.pos.x + left.x * off;
    this.body.pos.z = v.body.pos.z + left.z * off;
    this.body.vel.x = 0;
    this.body.vel.z = 0;
    this.body.heading = headingFromVec({ x: -left.x, z: -left.z }); // looking back at the car
    this.body.shape.r = FOOT_RADIUS;
    this.desiredVel = { x: 0, z: 0 };
    this.moveDir = null;
    this.sprintBlend = 0;
    this.vehicleInput = { ...NEUTRAL };
    this.object3D.visible = true;
    this.prevPos.x = this.body.pos.x; this.prevPos.z = this.body.pos.z; this.prevHeading = this.body.heading;
    this.events.emit('exitVehicle', { vehicleId: v.id });
  }

  update(dt: number): void {
    const b = this.body;
    this.prevPos.x = b.pos.x; this.prevPos.z = b.pos.z; this.prevHeading = b.heading;
    if (this.vehicle) {
      this.syncToVehicle();
      return;
    }
    if (!(dt > 0)) return;
    if (this.entering) { this.updateEntering(dt); return; }

    // --- sprint ramp, then accelerate toward the desired velocity (no instant starts or stops)
    const ramp = this.wantRun && this.moveDir ? 1 / SPRINT_RAMP_UP : -1 / SPRINT_RAMP_DOWN;
    this.sprintBlend = clamp(this.sprintBlend + ramp * dt, 0, 1);
    if (this.moveDir) {
      const k = this.sprintBlend;
      const sp = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * (k * k * (3 - 2 * k));
      this.desiredVel = { x: this.moveDir.x * sp, z: this.moveDir.z * sp };
      const want = headingFromVec(this.moveDir);
      b.heading = wrapAngle(b.heading + angleDiff(b.heading, want) * (1 - Math.exp(-TURN_SMOOTH * dt)));
    } else {
      this.desiredVel = { x: 0, z: 0 };
    }
    const ex = this.desiredVel.x - b.vel.x, ez = this.desiredVel.z - b.vel.z;
    const el = Math.hypot(ex, ez);
    if (el > 1e-9) {
      const reversing = this.moveDir !== null && b.vel.x * this.desiredVel.x + b.vel.z * this.desiredVel.z < 0;
      const rate = this.moveDir ? ACCEL * (reversing ? TURN_ACCEL_BOOST : 1) : DECEL;
      const step = Math.min(el, rate * dt);
      b.vel.x += (ex / el) * step;
      b.vel.z += (ez / el) * step;
    }
    // Curbs (<= 0.15 m) are stepped over automatically: they are not colliders and World2D has no height,
    // so there is nothing to do here and the y offset stays 0.
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    this.animateFoot(dt);
  }

  /** Mesh pose between the previous and current simulation state (alpha 0..1); teleports snap. */
  applyInterpolated(alpha: number): void {
    const b = this.body;
    if (this.vehicle) { applyPose(this.object3D, b.pos, b.heading, 0); return; }
    const a = clamp(alpha, 0, 1);
    if (Math.hypot(b.pos.x - this.prevPos.x, b.pos.z - this.prevPos.z) > 8) { applyPose(this.object3D, b.pos, b.heading, 0); return; }
    const pos = { x: this.prevPos.x + (b.pos.x - this.prevPos.x) * a, z: this.prevPos.z + (b.pos.z - this.prevPos.z) * a };
    applyPose(this.object3D, pos, this.prevHeading + angleDiff(this.prevHeading, b.heading) * a, 0);
  }

  private updateEntering(dt: number): void {
    const e = this.entering!;
    const b = this.body;
    e.t = Math.min(1, e.t + dt / ENTER_TIME);
    const k = e.t * e.t * (3 - 2 * e.t);
    const door = e.vehicle.doorPos(); // tracks the car if it is still rolling
    const nx = e.from.x + (door.x - e.from.x) * k;
    const nz = e.from.z + (door.z - e.from.z) * k;
    b.vel.x = (nx - b.pos.x) / dt;
    b.vel.z = (nz - b.pos.z) / dt;
    b.pos.x = nx; b.pos.z = nz;
    const toCar = { x: e.vehicle.body.pos.x - nx, z: e.vehicle.body.pos.z - nz };
    if (Math.hypot(toCar.x, toCar.z) > 0.05) {
      b.heading = wrapAngle(b.heading + angleDiff(b.heading, headingFromVec(toCar)) * (1 - Math.exp(-TURN_SMOOTH * dt)));
    }
    this.animateFoot(dt);
    if (e.t >= 1) this.completeEnter();
  }

  private completeEnter(): void {
    const e = this.entering!;
    this.entering = null;
    const best = e.vehicle;
    this.vehicle = best;
    this.object3D.visible = false;
    this.body.shape.r = SEATED_RADIUS;
    this.syncToVehicle();
    this.prevPos.x = this.body.pos.x; this.prevPos.z = this.body.pos.z; this.prevHeading = this.body.heading;
    this.events.emit('enterVehicle', { vehicleId: best.id });
    if (e.prevDriver === 'traffic' || e.prevDriver === 'cop') {
      this.events.emit('crime', { type: 'carjack', pos: { x: best.body.pos.x, z: best.body.pos.z } });
    }
    if (this.exitQueued) { this.exitQueued = false; this.exit(); }
  }

  private animateFoot(dt: number): void {
    const b = this.body;
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp > 0.1) {
      this.walkPhase += dt * sp * 3.2;
      const target = clamp(sp / WALK_SPEED, 0.6, 1.6);
      this.walkAmp += (target - this.walkAmp) * Math.min(1, dt * 12);
    } else {
      this.walkAmp *= Math.pow(0.8, dt * 30);
      if (this.walkAmp < 0.002) this.walkAmp = 0;
    }
    if (this.rig) { this.rig.setSpeed(sp); this.rig.update(dt); }
    else if (this.model) animateWalk(this.model, this.walkPhase, this.walkAmp);
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
    if (Player.characterSource) { this.rig = Player.characterSource.instantiate(0); this.object3D.add(this.rig.group); return; }
    this.model = buildHumanModel(materials, new Rng('player'), {
      shirt: 0, skin: 0, pants: 1, outfit: 'hoodie', hat: 'cap', accessory: 'none', heightScale: 1,
    });
    this.object3D.add(this.model.group);
  }
}
