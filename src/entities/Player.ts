import * as THREE from 'three';
import {
  angleDiff, applyPose, clamp, dist, forwardFromHeading, headingFromVec, perpRight, wrapAngle, type Vec2,
} from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type { Input } from '@/core/Input';
import { animateWalk, type HumanModel } from '@/entities/models/humanModel';
import { animateJump } from '@/entities/models/jumpPose';
import { AnimController } from '@/entities/anim/controller';
import { PLAYER_GAIT } from '@/entities/anim/gait';
import { JumpState } from '@/entities/Jump';
import { buildPerson as buildPedModel } from '@/entities/models/pedMesh';
import type { CharacterRig, CharacterSource } from '@/world/types';
import { Rng } from '@/core/Rng';
import type { Body2D, Entity, IMaterialLibrary, IVehicle, VehicleInput } from '@/world/types';

export const WALK_SPEED = 3;
export const RUN_SPEED = 6.5;
export const ENTER_RANGE = 3;

/**
 * How far `p` is from getting into `v`: the smaller of the distance to the driver's door and the distance to the car's
 * body box (0 inside it). A long van or box truck has its door at one flank, so a player standing at the rear or on
 * the far side still counts as "at the car" within ENTER_RANGE of its body; the walk then glides round to the door.
 */
/** True when `p` is further than ENTER_RANGE from the driver's door (it got in by the body box rule). */
function doorFar(v: IVehicle, p: Vec2): boolean { return dist(p, v.doorPos()) > ENTER_RANGE; }

export function doorDistance(v: IVehicle, p: Vec2): number {
  const door = dist(p, v.doorPos());
  const s = v.body.shape;
  if (s.kind !== 'obb') return door;
  const h = v.body.heading, dx = p.x - v.body.pos.x, dz = p.z - v.body.pos.z;
  const r = dx * Math.cos(h) + dz * Math.sin(h);
  const f = dx * Math.sin(h) - dz * Math.cos(h);
  const body = Math.hypot(Math.max(0, Math.abs(r) - s.halfW), Math.max(0, Math.abs(f) - s.halfL));
  return Math.min(door, body);
}
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
/** Extra metres tried beyond the usual exit spot when a wall or prop blocks every side of the car. */
const EXIT_SEARCH_EXTRA = [0, 0.6, 1.2, 1.8, 2.4, 3];
/** Collision radius while seated in a vehicle (effectively no collision footprint). */
const SEATED_RADIUS = 0.01;
/** Share of full speed at the smallest stick deflection (just past the dead zone), rising linearly to 1 at full deflection. */
const STICK_MIN_SPEED = 0.35;
/** Walking pace (m/s): hold Alt, switch Caps Lock on, or push a stick only part way (below STICK_WALK_MAG). The default on foot is the jog, WALK_SPEED. */
export const STROLL_SPEED = 1.6;
const STICK_WALK_MAG = 0.62;
/** Exit ring search: rings added beyond the body, their spacing (m) and samples per ring. */
const RING_COUNT = 6;
const RING_STEP = 0.5;
const RING_SAMPLES = 16;
/** Pin recovery: seconds of held input without progress, search radius (m) and glide speed (m/s). */
const PIN_AFTER = 0.6;
const PIN_SEARCH = 2.5;
const PIN_SPEED = 5;

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
  private wantStroll = false;
  /** 0..1 stick deflection of the current move input (1 for keys). */
  private moveMag = 1;
  private sprintBlend = 0;
  /** True when the player got in from beyond the driver's door (tail or passenger flank): the door side is likely walled in. */
  private enteredFar = false;
  private enteredFrom: Vec2 = { x: 0, z: 0 };
  /**
   * Optional: true when a foot-sized circle at `p` overlaps a static collider. When the host sets it (main.ts passes a
   * physics static query), exit() tries the driver side, then the passenger side, the rear and the front, and takes the
   * first free spot. Without it, exit() falls back to the side the player got in from.
   */
  blockedAt: ((p: Vec2, r: number, ignoreId?: string) => boolean) | null = null;
  private entering: { vehicle: IVehicle; t: number; from: Vec2; prevDriver: IVehicle['driver'] } | null = null;
  /**
   * Called when the walk to a car door begins. The integrator must take `body` out of the physics world here:
   * the door is often on the far side of the car, so the glide crosses the car's own box and, left in World2D,
   * the player body shoves the (parked) car out of its spot and into traffic.
   */
  onEnterStart: (() => void) | null = null;
  /** A second F press arrived during the walk to the door (long on slow machines): exit right after sitting down. */
  private exitQueued = false;
  private pinT = 0;
  private readonly pinLast: Vec2 = { x: 0, z: 0 };
  private pinTarget: Vec2 | null = null;
  /** Jump state (visual arc only). The host sets `jumpLocked` while a menu is open or the player is inside an interior. */
  readonly jump = new JumpState();
  jumpLocked = false;
  /** Fires on take-off and on landing (strength 0..1): hook audio here, e.g. `audio.playJump?.()`, `audio.playLand?.(s)`. */
  onJump: (() => void) | null = null;
  onLand: ((strength: number) => void) | null = null;
  private prevY = 0;
  private landCheck = false;
  private firstPerson = false;
  /** Height above the ground (m); also on `body.height` so World2D lets the player over low props. */
  get jumpHeight(): number { return this.jump.y; }
  /** Scale for the blob shadow under the player (1 on the ground, smaller in the air). */
  get shadowScale(): number { return this.jump.shadowScale; }
  private walkPhase = Math.PI / 2;
  private walkAmp = 0;
  private anim: AnimController | null = null;
  private animHeading = 0;
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
    // Space on foot is jump (in a vehicle it is the brake, handled above); a press while locked is swallowed
    if (input.consume('Space') && !this.jumpLocked) this.jump.tryJump(true, Math.hypot(this.body.vel.x, this.body.vel.z));
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const right = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const f = forwardFromHeading(cameraYaw);
    const r = perpRight(f);
    let dx = f.x * fwd + r.x * right;
    let dz = f.z * fwd + r.z * right;
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) {
      this.moveDir = { x: dx / l, z: dz / l };
      this.moveMag = Math.min(1, l); // a half-pushed touch stick walks slower; keys and a full stick are 1
      this.wantRun = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      this.wantStroll = input.isDown('AltLeft') || input.isDown('AltRight') || input.caps;
    } else {
      this.moveDir = null;
      this.wantRun = false;
      this.wantStroll = false;
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
      const d = doorDistance(v, this.body.pos);
      if (d <= bestD) { bestD = d; best = v; }
    }
    if (!best) return null;
    // Getting in from beyond the door only makes sense if there is somewhere to get out again: a car jammed against
    // walls and props on every side is refused (the player would be spat out inside the wall).
    if (this.blockedAt && doorFar(best, this.body.pos) && (this.blockedAt(this.body.pos, FOOT_RADIUS, best.id) || !this.anyExitFree(best))) return null;
    const prevDriver = best.driver;
    best.driver = 'player';
    best.setInput({ ...NEUTRAL, brake: true }); // a rolling car brakes while you climb in instead of coasting away from the door
    this.exitQueued = false;
    this.enteredFar = doorFar(best, this.body.pos);
    this.enteredFrom = { x: this.body.pos.x, z: this.body.pos.z };
    this.entering = { vehicle: best, t: 0, from: { x: this.body.pos.x, z: this.body.pos.z }, prevDriver };
    this.pinT = 0; this.pinTarget = null;
    this.jump.reset(); this.body.height = 0; this.prevY = 0;
    this.body.shape.r = SEATED_RADIUS; // glide through the car's own collision box
    this.onEnterStart?.();
    this.moveDir = null;
    this.wantRun = false;
    this.desiredVel = { x: 0, z: 0 };
    return best;
  }

  /** True when at least one of the four sides of `v` has a free foot-sized spot. */
  private anyExitFree(v: IVehicle): boolean {
    if (!this.blockedAt) return true;
    const f = forwardFromHeading(v.body.heading);
    const r = perpRight(f);
    const off = v.spec.width / 2 + FOOT_RADIUS + EXIT_GAP, offEnd = v.spec.length / 2 + FOOT_RADIUS + EXIT_GAP;
    const spots: Array<[number, number, number]> = [[-r.x, -r.z, off], [r.x, r.z, off], [-f.x, -f.z, offEnd], [f.x, f.z, offEnd]];
    for (const [sx, sz, d] of spots) if (!this.blockedAt({ x: v.body.pos.x + sx * d, z: v.body.pos.z + sz * d }, FOOT_RADIUS, v.id)) return true;
    return this.ringExitSpot(v) !== null;
  }

  /**
   * First free foot spot on rings around the car, nearest ring first, starting at the driver's door side and going
   * round both ways (16 samples per ring). Returns the unit direction from the car centre and the distance, or null.
   */
  private ringExitSpot(v: IVehicle): { side: Vec2; d: number } | null {
    if (!this.blockedAt) return null;
    const half = Math.hypot(v.spec.width / 2, v.spec.length / 2);
    const f = forwardFromHeading(v.body.heading);
    const start = Math.atan2(perpRight(f).z * -1, perpRight(f).x * -1); // driver (left) side
    for (let k = 0; k < RING_COUNT; k++) {
      const d = half + FOOT_RADIUS + EXIT_GAP + k * RING_STEP;
      for (let i = 0; i < RING_SAMPLES; i++) {
        const a = start + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (2 * Math.PI / RING_SAMPLES);
        const side = { x: Math.cos(a), z: Math.sin(a) };
        if (!this.blockedAt({ x: v.body.pos.x + side.x * d, z: v.body.pos.z + side.z * d }, FOOT_RADIUS, v.id)) return { side, d };
      }
    }
    return null;
  }

  /**
   * Nearest free foot spot to `from` within PIN_SEARCH metres that can be reached in a straight line without crossing
   * a solid, preferring the direction the player is trying to go. Null when none (or no world query).
   */
  static findFreeSpot(from: Vec2, blocked: (p: Vec2, r: number) => boolean, prefer: Vec2 | null, maxR = PIN_SEARCH, straight = true): Vec2 | null {
    let best: Vec2 | null = null, bestScore = Infinity;
    for (let d = 0.4; d <= maxR + 1e-6 && !best; d += 0.3) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const dir = { x: Math.cos(a), z: Math.sin(a) };
        const p = { x: from.x + dir.x * d, z: from.z + dir.z * d };
        if (blocked(p, FOOT_RADIUS)) continue;
        let clear = true;
        for (let t = 0.25; straight && t < d && clear; t += 0.25) if (blocked({ x: from.x + dir.x * t, z: from.z + dir.z * t }, FOOT_RADIUS * 0.8)) clear = false;
        if (!clear) continue;
        const score = prefer ? -(dir.x * prefer.x + dir.z * prefer.z) : 0;
        if (score < bestScore) { bestScore = score; best = p; }
      }
    }
    return best;
  }

  /**
   * Pin recovery: input held, almost no progress for PIN_AFTER seconds (squeezed between cars and walls) -> glide to the
   * nearest reachable free spot so the player is never trapped. 
   */
  private updatePin(dt: number, moved: number): void {
    const b = this.body;
    if (this.pinTarget) {
      const dx = this.pinTarget.x - b.pos.x, dz = this.pinTarget.z - b.pos.z, l = Math.hypot(dx, dz);
      const step = PIN_SPEED * dt;
      if (l <= step) { b.pos.x = this.pinTarget.x; b.pos.z = this.pinTarget.z; this.pinTarget = null; }
      else { b.pos.x += (dx / l) * step; b.pos.z += (dz / l) * step; }
      this.pinT = 0;
      return;
    }
    if (this.moveDir && moved < WALK_SPEED * dt * 0.15) this.pinT += dt; else this.pinT = Math.max(0, this.pinT - dt * 2);
    if (this.pinT < PIN_AFTER || !this.blockedAt) return;
    this.pinT = 0;
    const blocked = this.blockedAt;
    this.pinTarget = Player.findFreeSpot(b.pos, (p, r) => blocked(p, r), this.moveDir);
  }

  /** Leave the vehicle, standing beside its driver's door and facing the car. */
  exit(): void {
    const v = this.vehicle;
    if (!v) return;
    const f = forwardFromHeading(v.body.heading);
    const left = { x: -perpRight(f).x, z: -perpRight(f).z };
    const off = v.spec.width / 2 + FOOT_RADIUS + EXIT_GAP;
    const offEnd = v.spec.length / 2 + FOOT_RADIUS + EXIT_GAP;
    // candidate spots: driver side, passenger side, rear, front (the rest only when a wall blocks the first ones)
    const cands: Array<{ side: Vec2; d: number }> = [
      { side: left, d: off }, { side: { x: -left.x, z: -left.z }, d: off }, { side: { x: -f.x, z: -f.z }, d: offEnd }, { side: f, d: offEnd },
    ];
    let pick = this.enteredFar ? cands[1] : cands[0]; // fallback (no world query, or every spot blocked): the side we came in from
    if (this.enteredFar && !this.blockedAt) cands.unshift(cands.splice(1, 1)[0]);
    let found = !this.blockedAt;
    const drv = cands[0];
    const nearEntry = Math.hypot(this.enteredFrom.x - v.body.pos.x, this.enteredFrom.z - v.body.pos.z) < 8;
    const driverBlocked = !!this.blockedAt && this.blockedAt({ x: v.body.pos.x + drv.side.x * drv.d, z: v.body.pos.z + drv.side.z * drv.d }, FOOT_RADIUS, v.id);
    const backOut = this.enteredFar && driverBlocked && nearEntry && !this.blockedAt!(this.enteredFrom, FOOT_RADIUS, v.id);
    if (this.blockedAt && !backOut) {
      // driver side first, then passenger side, rear, front; if all four are blocked, try again a little further out
      search: for (const extra of EXIT_SEARCH_EXTRA) {
        for (const c of cands) {
          const d = c.d + extra;
          if (!this.blockedAt({ x: v.body.pos.x + c.side.x * d, z: v.body.pos.z + c.side.z * d }, FOOT_RADIUS, v.id)) { pick = { side: c.side, d }; found = true; break search; }
        }
      }
      if (!found) {
        // all four sides blocked even further out: sample a ring around the car (diagonals included)
        const ring = this.ringExitSpot(v);
        if (ring) { pick = ring; found = true; }
      }
    }
    let spotX = v.body.pos.x + pick.side.x * pick.d, spotZ = v.body.pos.z + pick.side.z * pick.d;
    if ((backOut || !found) && nearEntry) {
      // walled in on every side: step back out where we got in, which was free
      spotX = this.enteredFrom.x; spotZ = this.enteredFrom.z;
      const len = Math.hypot(spotX - v.body.pos.x, spotZ - v.body.pos.z) || 1;
      pick = { side: { x: (spotX - v.body.pos.x) / len, z: (spotZ - v.body.pos.z) / len }, d: len };
    }
    const away = pick.side;
    v.driver = null;
    v.setInput(NEUTRAL);
    this.vehicle = null;
    this.body.pos.x = spotX;
    this.body.pos.z = spotZ;
    this.body.vel.x = 0;
    this.body.vel.z = 0;
    this.body.heading = headingFromVec({ x: -away.x, z: -away.z }); // looking back at the car
    this.body.shape.r = FOOT_RADIUS;
    this.desiredVel = { x: 0, z: 0 };
    this.moveDir = null;
    this.sprintBlend = 0;
    this.pinT = 0; this.pinTarget = null; this.pinLast.x = spotX; this.pinLast.z = spotZ;
    this.vehicleInput = { ...NEUTRAL };
    this.object3D.visible = true;
    this.anim?.playOnce('standUp', { from: 0.4, rate: 1.8, fadeIn: 0.05, fadeOut: 0.25 }); // rise out of the seat (captured stand-up)
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

    // jump: advance the arc first so the physics pass of this step sees the new height
    this.prevY = this.jump.y;
    this.jump.update(dt);
    b.height = this.jump.y;
    if (this.jump.takeLaunched()) this.onJump?.();
    const impact = this.jump.takeLanded();
    if (impact >= 0) { this.landCheck = true; this.onLand?.(impact); }
    if (this.landCheck && !this.jump.airborne) {
      this.landCheck = false;
      // landed inside something solid (a prop it was vaulting, a fence line): glide to the nearest free spot
      if (this.blockedAt && this.blockedAt(b.pos, FOOT_RADIUS)) this.pinTarget = Player.findFreeSpot(b.pos, (p, r) => this.blockedAt!(p, r), this.moveDir, PIN_SEARCH, false);
    }

    // pin recovery: progress is measured between steps, i.e. AFTER the physics pass pushed the body back out of things
    const moved = Math.hypot(b.pos.x - this.pinLast.x, b.pos.z - this.pinLast.z);
    this.pinLast.x = b.pos.x; this.pinLast.z = b.pos.z;
    this.updatePin(dt, moved);
    if (this.pinTarget) { b.vel.x = 0; b.vel.z = 0; this.animateFoot(dt); return; }

    // --- sprint ramp, then accelerate toward the desired velocity (no instant starts or stops)
    const ramp = this.wantRun && this.moveDir ? 1 / SPRINT_RAMP_UP : -1 / SPRINT_RAMP_DOWN;
    this.sprintBlend = clamp(this.sprintBlend + ramp * dt, 0, 1);
    if (this.moveDir) {
      const k = this.sprintBlend;
      // base pace: a jog (WALK_SPEED); Alt / Caps Lock or a half-pushed stick: a walk; Shift: sprint. A full key press is moveMag 1.
      const walkish = !this.wantRun && (this.wantStroll || this.moveMag < STICK_WALK_MAG);
      const base = walkish ? STROLL_SPEED : this.moveMag < 1 ? STROLL_SPEED + (WALK_SPEED - STROLL_SPEED) * ((this.moveMag - STICK_WALK_MAG) / (1 - STICK_WALK_MAG)) : WALK_SPEED;
      const sp = (base + (RUN_SPEED - base) * (k * k * (3 - 2 * k))) * this.jump.speedScale;
      this.desiredVel = { x: this.moveDir.x * sp, z: this.moveDir.z * sp };
      const want = headingFromVec(this.moveDir);
      b.heading = wrapAngle(b.heading + angleDiff(b.heading, want) * (1 - Math.exp(-TURN_SMOOTH * this.jump.accelScale * dt)));
    } else {
      this.desiredVel = { x: 0, z: 0 };
    }
    const ex = this.desiredVel.x - b.vel.x, ez = this.desiredVel.z - b.vel.z;
    const el = Math.hypot(ex, ez);
    if (el > 1e-9) {
      const reversing = this.moveDir !== null && b.vel.x * this.desiredVel.x + b.vel.z * this.desiredVel.z < 0;
      const rate = (this.moveDir ? ACCEL * (reversing ? TURN_ACCEL_BOOST : 1) : DECEL) * this.jump.accelScale;
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
    const y = this.prevY + (this.jump.y - this.prevY) * a;
    if (Math.hypot(b.pos.x - this.prevPos.x, b.pos.z - this.prevPos.z) > 8) { applyPose(this.object3D, b.pos, b.heading, y); return; }
    const pos = { x: this.prevPos.x + (b.pos.x - this.prevPos.x) * a, z: this.prevPos.z + (b.pos.z - this.prevPos.z) * a };
    applyPose(this.object3D, pos, this.prevHeading + angleDiff(this.prevHeading, b.heading) * a, y);
  }

  /** First-person view: hide the head (and hat/hair with it) so the lens inside it sees nothing; the body keeps casting its shadow. */
  setFirstPerson(on: boolean): void {
    if (on === this.firstPerson) return;
    this.firstPerson = on;
    if (this.model) this.model.head.visible = !on;
    else if (this.rig) this.rig.group.traverse((o) => { if (/head|hair|hat|cap/i.test(o.name)) o.visible = !on; });
  }
  get isFirstPerson(): boolean { return this.firstPerson; }

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
    // sink into the seat as the body reaches the door (captured sit-down; needs the street pack, otherwise just the walk)
    if (e.t > 0.45 && this.anim && !this.anim.busy) this.anim.playOnce('sitDown', { from: 0.2, to: 0.7, rate: 2.6, fadeIn: 0.12, fadeOut: 0.05 });
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
    else if (this.model) {
      // captured-motion clips (src/entities/anim); the hand-keyed poses stay as the fallback when no clip pack decoded
      this.anim ??= new AnimController(this.model, PLAYER_GAIT);
      const yawRate = dt > 0 ? -angleDiff(this.animHeading, b.heading) / dt : 0;
      this.animHeading = b.heading;
      if (!this.anim.update(dt, { speed: sp, yawRate, jump: { phase: this.jump.phase, t: this.jump.t, vy: this.jump.vy } })) {
        if (this.jump.busy) animateJump(this.model, this.jump.phase, this.jump.t, this.jump.vy);
        else animateWalk(this.model, this.walkPhase, this.walkAmp);
      }
    }
    applyPose(this.object3D, b.pos, b.heading, this.jump.y);
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
    this.model = buildPedModel(materials, new Rng('player'), { variant: 'player', heightScale: 1 });
    this.object3D.add(this.model.group);
  }
}
