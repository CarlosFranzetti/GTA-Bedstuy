import * as THREE from 'three';
import {
  angleDiff, applyPose, clamp, dist, forwardFromHeading, headingFromVec, perpRight, wrapAngle, type Vec2,
} from '@/core/Math2';
import { easeGround, groundAt } from '@/world/Ground';
import type { EventBus } from '@/core/Events';
import type { Input } from '@/core/Input';
import { animateWalk, type HumanModel } from '@/entities/models/humanModel';
import { animateJump } from '@/entities/models/jumpPose';
import { AnimController, type ActionPose } from '@/entities/anim/controller';
import { PLAYER_GAIT } from '@/entities/anim/gait';
import { JumpState } from '@/entities/Jump';
import {
  AUTO_VAULT_SPEED, VAULT_REACH, outlineDistance, planVault, topProfile, vaultHeight, vaultProgress, vaultSettings, type VaultCar, type VaultPlan,
} from '@/entities/vault';
import { buildPerson as buildPedModel } from '@/entities/models/pedMesh';
import type { CharacterRig, CharacterSource } from '@/world/types';
import { Rng } from '@/core/Rng';
import type { Body2D, Contact, Entity, IMaterialLibrary, IVehicle, VehicleInput } from '@/world/types';

export const WALK_SPEED = 3;
export const RUN_SPEED = 6.5;
export const ENTER_RANGE = 3;
/** A walk to a far door round the car: points in the car's own frame (a along its heading, c to its right), the last one the driver's door, and the length (m). */
interface EnterRoute { pts: Array<{ a: number; c: number }>; len: number }

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
/**
 * m/s^2 while speeding up and while stopping. Both depend on how fast the body is already going: light on its feet from a standstill
 * (a jog is reached in ~0.4 s), heavier the faster it goes (sprint builds over ~1 s and stops in ~0.4 s over a metre or so).
 */
const ACCEL_LOW = 9;
const ACCEL_HIGH = 4.6;
const DECEL_LOW = 12;
const DECEL_HIGH = 17;
/** Reversing direction accelerates a bit harder than a plain start. */
const TURN_ACCEL_BOOST = 1.5;
/** Sprint blend ramps 0 -> 1 in this many seconds when Shift is held, and back down faster. */
const SPRINT_RAMP_UP = 0.8;
const SPRINT_RAMP_DOWN = 0.3;
/** Facing turns toward the move direction with this exponential rate (1/s), never faster than `maxTurnRate(speed)`. */
const TURN_SMOOTH = 16;
/** Fastest the body can swing round (rad/s): quick on the spot, about 300 deg/s at a jog and 180 deg/s flat out. */
export function maxTurnRate(speed: number): number { return 2.4 + 8.5 * Math.exp(-speed / 2.6); }
/**
 * Share of the wanted speed the body gives while it is not yet facing the way it was told to go: 1 when aligned, about 0.3 at a right
 * angle, 0.15 when the stick is pulled the opposite way. The body plants, swings round, then drives off: a reversal is no instant flip.
 */
export function alignScale(cosErr: number): number {
  const t = Math.min(1, Math.max(0, (cosErr + 0.3) / 1.2));
  return 0.15 + 0.85 * t * t * (3 - 2 * t);
}
/** Hitting something hard at speed: the share of speed that must be lost in one step to count as a bump, how long the brace lasts (s). */
const BUMP_DROP = 3;
const BRACE_TIME = 0.5;
/** Sprinting at a wall: speed is taken off over the last metres so the contact is at about this speed (m/s), braking at BRAKE_ACCEL. */
const WALL_CONTACT_SPEED = 2.4;
const BRAKE_ACCEL = 8;
/** Walk to the car door before getting in: the time scales with the distance, between these (s). */
/** Ranking penalty (m) for a car reached by its body box only (its door is beyond ENTER_RANGE). */
const FAR_DOOR_PENALTY = 1.5;
/** CARENTRY: the whole move from the press to driving takes about half a second at a door (owner, 27 Nov: "instant like GTA", a short animation). */
const ENTER_TIME = 0.5;
const ENTER_TIME_MAX = 0.7;
const ENTER_WALK_SPEED = 5;
/** The camera cuts to the car's view on the press when the door is within this many metres; from further it stays on foot until the walk is within CAM_CUT_REACH of the door. */
const CAM_CUT_DOOR = 1.5;
const CAM_CUT_REACH = 0.6;
/** A door on the far side is reached by walking AROUND the car, not through it: clearance (m) kept from the car's box, walking speed (m/s) and the sit-down time (s) of such a walk. */
const ROUTE_MARGIN = 0.5;
const ROUTE_SPEED = 5.5;
const ROUTE_SEAT = 0.3;
const ROUTE_TIME_MAX = 1.5;
/** Leaving a moving car: above LEAVE_STEP m/s the player steps out carrying part of its speed, above LEAVE_ROLL they roll out and get up. */
const LEAVE_STEP = 2.5;
const LEAVE_ROLL = 9;
const LEAVE_CARRY = 0.5;
const LEAVE_CARRY_MAX = 6;
const ROLL_TIME = 0.9;
/** Share of the entering time spent sinking into the seat (the rest is the walk to the door), and the exit slide (s). */
const SEAT_SHARE = 0.5;
/** The seated figure stays visible this long after the car is claimed, finishing the sit-down (s). */
const SEAT_TAIL = 0.3;
const EXIT_SLIDE = 0.5;
/** Pelvis height of the captured sit-down at its end (stool), for matching the seat of each vehicle. */
const SIT_PELVIS = 0.67;
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
/** Seconds boxed in with no free direction before the climb-over prompt shows and the vault is always possible. */
export const PINNED_AFTER = 1.5;
/** Probe distance and radius for "is any direction free" (m). */
const BOX_PROBE = 0.4;
const BOX_PROBE_R = 0.34;
const BOX_RUN = 2.0;
/** The farthest the last-resort squeeze looks for open ground (m). */
/** Speed (m/s) the body leaves a vault with: most of a run's speed is kept, a standing start comes off at a quick walk. */
const vaultLandSpeed = (entry: number): number => clamp(0.78 * entry, 2.4, 5.2);
const SQUEEZE_MAX = 9;
/** The camera keeps ignoring the vaulted car this long after the landing (s). */
const VAULT_CAM_TAIL = 0.7;
/** ... and holds while the player is within this distance (m) of the car, for at most this long (s): the lens sits one rig length behind the body. */
const VAULT_CAM_NEAR = 4;
const VAULT_CAM_HOLD = 4;

/** A car moving faster than this (m/s) that runs into the player knocks them down. */
const KNOCK_SPEED = 3;
/** Closing speed along the contact normal (m/s) below which the car is shoving a person it already touches, not hitting him. */
const KNOCK_CLOSING = 1.5;
/** Seconds the player lies and slides before getting up, the share of the car's speed they are thrown at, the cap (m/s) and the ground drag (1/s). */
const KNOCK_TIME = 1.3;
const KNOCK_THROW = 0.8;
const KNOCK_MAX = 11;
const KNOCK_DRAG = 3.2;

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
  /** drawn height of the surface under the feet (NaN until first placed) */
  private groundY = NaN;
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
  private entering: { vehicle: IVehicle; t: number; from: Vec2; prevDriver: IVehicle['driver']; time: number; v0: Vec2; camCut: boolean; route: EnterRoute | null; walkFrac: number; side: number } | null = null;
  /**
   * Called when the walk to a car door begins. The integrator must take `body` out of the physics world here:
   * the door is often on the far side of the car, so the glide crosses the car's own box and, left in World2D,
   * the player body shoves the (parked) car out of its spot and into traffic.
   */
  onEnterStart: (() => void) | null = null;
  /** Fires when the player runs into something hard at speed (a wall, a person): strength 0..1. Hook a small camera kick and a grunt here. */
  onBump: ((strength: number) => void) | null = null;
  /**
   * The vehicle the camera should show: the one being driven, or the one being entered once the camera has cut to it (at the press when the
   * door is close, else when the walk has reached the door). Null on foot. main.ts passes it as the camera's vehicle, its mode and its target.
   */
  get camVehicle(): IVehicle | null {
    if (this.vehicle) return this.vehicle;
    return this.entering && this.entering.camCut ? this.entering.vehicle : null;
  }
  /** Id of the vehicle being walked to (null otherwise). */
  get enteringId(): string | null {
    if (this.entering) return this.entering.vehicle.id;
    return this.cameraIgnoreId;
  }
  /**
   * The car the lens must not shy from: only the one being vaulted. (The car being entered is NOT ignored any more: on a long walk to a far
   * door the on-foot lens stays outside it; with the door close the camera has already cut to the car's own view.)
   */
  get cameraIgnoreId(): string | null {
    // MOVE2: while vaulting a car (and for a moment after) the lens does not shy from it either: the camera follows the ground position and
    // the body is over the car, so the car would otherwise pull the lens in and lift it over the roof in a frame or two.
    if (this.vault) return this.vault.plan.carId;
    return this.vaultTail > 0 ? this.vaultCarId : null;
  }
  private braceT = 0;
  /**
   * Something nearby the head should turn to (a person walking past, a shop window): world position, or null. The host sets it (main.ts: the
   * nearest pedestrian within about 5 m in front). The head also leads every turn: it looks where the body is about to go.
   */
  glanceAt: Vec2 | null = null;
  private lookYaw = 0;
  private lookLead = 0;
  private wallBraced = false;
  private postSpeed = 0;
  /** The facing (rad/s) the body turned at in the last step, for the animation. */
  turnRate = 0;
  /** A second F press arrived during the walk to the door (long on slow machines): exit right after sitting down. */
  private exitQueued = false;
  private pinT = 0;
  /** seconds left lying after being run down (0 = on their feet). Input is ignored and cars pass over the body meanwhile. */
  private downT = 0;
  /** the last drawn pose was lying down (so the flat pose is undone on the first frame back on foot) */
  private wasDown = false;
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
  /**
   * MOVE2: vaulting over the low part of a car. The host sets `vehiclesNear` (main.ts: the vehicles from `physics.queryCircle`, each body's
   * userData); without it there is no vault. `held` is for the police arrest: a held player cannot vault.
   */
  vehiclesNear: ((p: Vec2, r: number) => IVehicle[]) | null = null;
  held = false;
  /** True when the pinned prompt should show ("Jump: climb over"): boxed in with no free direction for a while. */
  get vaultPrompt(): boolean { return this.boxedT >= PINNED_AFTER && !this.vault && !this.held; }
  /** Fires when a vault starts (strength 0..1 for a sound) and when one lands. */
  onVault: (() => void) | null = null;
  /**
   * The vault is scripted (the path was checked clear), so the host takes the body out of the physics world for its length, like the walk to a
   * car door (`onEnterStart`): main.ts `physics.removeBody(player.body.id)` / `physics.addBody(player.body)`. Besides saving the work, the camera's
   * ray from the player to the lens would otherwise start inside the player's own body and could not skip the vaulted car as well.
   */
  onVaultStart: (() => void) | null = null;
  onVaultEnd: (() => void) | null = null;
  private vault: { plan: VaultPlan; t: number; m0: number; m1: number; speed: number; ds: number; progress: number } | null = null;
  private vaultY = 0;
  private vaultPrevY = 0;
  /** seconds since the vault ended (the pose fades out over about 0.3 s); the vault pose input for the animation */
  private vaultTail = 0;
  private vaultCarId: string | null = null;
  private vaultHold = 0;
  private vaultAnimK = 0;
  private vaultSide = 1;
  private boxedT = 0;
  private boxedAcc = 0;
  private boxedNow = false;
  private autoCheckT = 0;
  private autoOk = false;
  private pinnedKick = false;
  /** True during a vault. */
  get isVaulting(): boolean { return this.vault !== null; }
  /** On-foot action pose (punch, throw, aim) the combat system sets each step; layered over the upper body by the anim controller. */
  actionPose: ActionPose | null = null;
  /** While set, the body turns to face this heading (rad) instead of its move direction: aiming a pistol, the throw. */
  aimYaw: number | null = null;
  private firstPerson = false;
  /** Height above the ground (m); also on `body.height` so World2D lets the player over low props. */
  get jumpHeight(): number { return this.jump.y; }
  /** Scale for the blob shadow under the player (1 on the ground, smaller in the air). */
  get shadowScale(): number { return this.jump.shadowScale; }
  private walkPhase = Math.PI / 2;
  private walkAmp = 0;
  private anim: AnimController | null = null;
  /** Visual only (gameplay stays where it was): how far the figure has slid into the driver's seat, 0 on foot .. 1 seated, and the seat it is going to or from. */
  private seatK = 0;
  private seatTail = 0;
  private exitVis: { t: number; seat: Vec2; heading: number; dy: number } | null = null;
  private enterSeat: { seat: Vec2; heading: number; dy: number } | null = null;
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
  /** True while knocked down by a car (about KNOCK_TIME seconds). */
  get isDown(): boolean { return this.downT > 0; }

  /**
   * A car at speed runs the player down: thrown along its path (a little to the side, away from its centreline), controls dead
   * for KNOCK_TIME seconds, vehicles pass over the body while it slides, then the player gets up. A slow bump just shoves.
   */
  onContact(contact: Contact, other: Body2D): void {
    if (this.vehicle || this.entering || this.downT > 0 || this.vault) return;
    if (other.kind === 'ped') { this.shoulderCheck(contact, other); return; }
    if (other.kind !== 'vehicle' && other.kind !== 'cop') return;
    const sp = Math.hypot(other.vel.x, other.vel.z);
    if (sp < KNOCK_SPEED) return;
    // A car that keeps pushing a person it has already caught (its speed creeping up while he is shoved along) is not a hit: the
    // knock needs a real closing speed at the contact itself. Heavier foot braking (MECHANICS) let a slow car reach KNOCK_SPEED while pushing.
    if (contact.impulse < KNOCK_CLOSING) return;
    const b = this.body;
    let ax = b.pos.x - other.pos.x, az = b.pos.z - other.pos.z;
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    let dx = other.vel.x / sp + ax * 0.45, dz = other.vel.z / sp + az * 0.45;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const v = Math.min(KNOCK_MAX, sp * KNOCK_THROW) + 1;
    b.vel.x = dx * v; b.vel.z = dz * v;
    b.vehiclePass = true;
    this.downT = KNOCK_TIME;
    this.jump.reset(); b.height = 0; this.prevY = 0;
    this.moveDir = null; this.wantRun = false; this.sprintBlend = 0; this.actionPose = null;
  }
  /**
   * Running into a person: a shoulder check and a half-step, not a wall. The physics has already pushed the bodies apart; here the runner turns the
   * shoulder (a small stumble layered on the stride), loses a fifth of the speed and the camera gives the smallest kick. Once every 0.7 s.
   */
  private shoulderCheck(contact: Contact, other: Body2D): void {
    const b = this.body;
    if (this.shoulderCool > 0 || this.jump.busy || this.vault) return;
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp < 2 || contact.impulse < 1.2) return;
    const toward = (other.pos.x - b.pos.x) * b.vel.x + (other.pos.z - b.pos.z) * b.vel.z;
    if (toward <= 0) return; // brushed past, not run into
    const k = clamp(contact.impulse / 5, 0.25, 1);
    this.shoulderCool = 0.7;
    b.vel.x *= 1 - 0.2 * k; b.vel.z *= 1 - 0.2 * k;
    this.anim?.playOnce('stumble', { amp: 0.12 + 0.14 * k, from: 0.25, to: 0.5, rate: 2.2, fadeIn: 0.04, fadeOut: 0.2 });
    this.onBump?.(0.12 * k);
  }
  private shoulderCool = 0;
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
    if (this.entering || this.downT > 0) { this.moveDir = null; this.wantRun = false; return; }
    // Space on foot is jump (in a vehicle it is the brake, handled above); a press while locked is swallowed
    const jumpPress = input.consume('Space') && !this.jumpLocked;
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
    if (jumpPress && !this.vault && !this.held) this.jumpPressed();
  }

  /**
   * Space on foot: first try to climb over the low part of a car in front (or, boxed in, over the lowest neighbour); else a plain jump.
   * A press toward a car that cannot be crossed (too tall, no clear landing) is a small stumble, not a jump into its door.
   */
  private jumpPressed(): void {
    const sp = Math.hypot(this.body.vel.x, this.body.vel.z);
    if (this.jump.busy) { this.jump.tryJump(true, sp); return; }
    if (this.vehiclesNear) {
      const pinned = this.boxedT >= PINNED_AFTER;
      const res = this.planFromHere(pinned);
      if (res.plan) { this.startVault(res.plan); return; }
      if (pinned && this.squeezeOut()) return;
      if (res.refusal === 'tall' || res.refusal === 'blocked' || res.refusal === 'fast') {
        // facing a car it cannot cross: a small stumble against it
        this.anim?.playOnce('stumble', { amp: 0.25, from: 0.2, to: 0.5, rate: 1.8, fadeIn: 0.05, fadeOut: 0.2 });
        this.onBump?.(0.15);
        return;
      }
    }
    this.jump.tryJump(true, sp);
  }

  private carsNear(r: number): VaultCar[] {
    const out: VaultCar[] = [];
    for (const v of this.vehiclesNear?.(this.body.pos, r) ?? []) {
      if (v.driver === 'player' || v === this.vehicle) continue;
      const sh = v.body.shape;
      out.push({ id: v.id, spec: v.spec, pos: v.body.pos, vel: v.body.vel, heading: v.body.heading, halfW: sh.kind === 'obb' ? sh.halfW : undefined, halfL: sh.kind === 'obb' ? sh.halfL : undefined });
    }
    return out;
  }

  private planFromHere(pinned: boolean, at: Vec2 = this.body.pos) {
    const b = this.body;
    return planVault({
      pos: at, facing: b.heading, intent: this.moveDir, speed: Math.hypot(b.vel.x, b.vel.z), pinned,
      cars: this.carsNear(5), blocked: (p, r, ig) => (this.blockedAt ? this.blockedAt(p, r, ig) : false),
    });
  }

  private startVault(plan: VaultPlan): void {
    const b = this.body;
    const len = Math.hypot(plan.land.x - plan.start.x, plan.land.z - plan.start.z);
    const sp = Math.hypot(b.vel.x, b.vel.z);
    const along = Math.max(0, b.vel.x * plan.dir.x + b.vel.z * plan.dir.z);
    const vland = vaultLandSpeed(sp);
    this.vault = { plan, t: 0, m0: clamp((along * plan.T) / len, 0, 2.2), m1: clamp((vland * plan.T) / len, 0.3, 2.2), speed: sp, ds: 0, progress: 0 };
    this.vaultSide = plan.side;
    this.vaultY = 0; this.vaultPrevY = 0; this.vaultAnimK = 0;
    b.vehiclePass = true;
    this.jump.reset(); b.height = 0;
    this.sprintBlend = Math.min(this.sprintBlend, 0.6);
    this.boxedT = 0; this.pinTarget = null; this.pinT = 0;
    this.onVaultStart?.();
    this.onVault?.();
  }

  private endVault(): void {
    const v = this.vault!, b = this.body, pl = v.plan;
    b.pos.x = pl.land.x; b.pos.z = pl.land.z;
    const vland = vaultLandSpeed(v.speed);
    b.vel.x = pl.dir.x * vland; b.vel.z = pl.dir.z * vland;
    b.vehiclePass = false; b.height = 0;
    this.vault = null; this.vaultY = 0;
    this.onVaultEnd?.();
    this.postSpeed = vland;
    // landed where something stands (a car that rolled in, a prop): glide to free ground
    if (this.blockedAt && this.blockedAt(b.pos, FOOT_RADIUS * 0.9)) this.pinTarget = Player.findFreeSpot(b.pos, (p, r) => this.blockedAt!(p, r), this.moveDir, PIN_SEARCH, false);
    this.onLand?.(0.35);
  }

  private updateVault(dt: number): void {
    const v = this.vault!, b = this.body, pl = v.plan;
    this.prevY = this.vaultY;
    v.t += dt;
    const len = Math.hypot(pl.land.x - pl.start.x, pl.land.z - pl.start.z);
    const { s, ds } = vaultProgress(v.t, pl.T, v.m0, v.m1);
    b.pos.x = pl.start.x + (pl.land.x - pl.start.x) * s; b.pos.z = pl.start.z + (pl.land.z - pl.start.z) * s;
    b.vel.x = pl.dir.x * ds * len; b.vel.z = pl.dir.z * ds * len;
    b.heading = wrapAngle(b.heading + angleDiff(b.heading, headingFromVec(pl.dir)) * (1 - Math.exp(-20 * dt)));
    this.vaultY = vaultHeight(pl, s); b.height = this.vaultY;
    this.vaultAnimK = clamp(v.t / pl.T, 0, 1);
    this.turnRate = 0;
    this.animateFoot(dt);
    if (v.t >= pl.T) { this.endVault(); this.vaultTail = VAULT_CAM_TAIL; this.vaultCarId = pl.carId; this.vaultHold = 0; }
  }

  /**
   * Boxed in: no way out. Every 0.2 s sixteen runs of BOX_RUN metres are tried with a foot-sized probe; when none is clear the body is in a pocket
   * (between cars and walls) and a timer counts up. A free run, however short the street, ends it. PINNED_AFTER seconds of it shows the climb prompt.
   */
  private updateBoxed(dt: number): void {
    const b = this.body;
    if (!this.blockedAt || this.held || this.jump.busy) { this.boxedT = Math.max(0, this.boxedT - dt * 3); this.boxedAcc = 0; return; }
    this.boxedAcc += dt;
    if (this.boxedAcc >= 0.2) {
      this.boxedAcc = 0;
      let free = false;
      for (let i = 0; i < 16 && !free; i++) {
        const a = (i / 16) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
        let clear = true;
        for (let d = BOX_PROBE; d <= BOX_RUN + 1e-6 && clear; d += 0.4) if (this.blockedAt({ x: b.pos.x + cx * d, z: b.pos.z + cz * d }, BOX_PROBE_R)) clear = false;
        free = clear;
      }
      this.boxedNow = !free;
    }
    this.boxedT = this.boxedNow ? this.boxedT + dt : Math.max(0, this.boxedT - dt * 3);
  }

  /**
   * Every neighbour too tall (or no landing): squeeze out sideways to the nearest ground that leads somewhere (a foot spot with a clear 2 m run
   * from it, so the pocket's own floor does not count), gliding through the gap between the bodies. A last resort: it can pass through a wall.
   */
  private squeezeOut(): boolean {
    const b = this.body;
    if (!this.blockedAt) return false;
    const blocked = this.blockedAt;
    const opens = (p: Vec2): boolean => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        let clear = true;
        for (let d = 0.5; d <= 2.0 && clear; d += 0.5) if (blocked({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }, BOX_PROBE_R)) clear = false;
        if (clear) return true;
      }
      return false;
    };
    // the glide may pass through a car (the body is squeezed past it) but never through a wall or a prop: only static blockers count on the way
    const ids = this.carsNear(SQUEEZE_MAX + 3).map((c) => c.id);
    const wallAt = (p: Vec2, r: number): boolean => {
      if (!blocked(p, r)) return false;
      for (const id of ids) if (!blocked(p, r, id)) return false;
      return true;
    };
    const reach = (p: Vec2): boolean => {
      const dx = p.x - b.pos.x, dz = p.z - b.pos.z, l = Math.hypot(dx, dz);
      for (let t = 0.3; t < l; t += 0.3) if (wallAt({ x: b.pos.x + (dx / l) * t, z: b.pos.z + (dz / l) * t }, 0.28)) return false;
      return true;
    };
    for (let d = 0.8; d <= SQUEEZE_MAX; d += 0.4) {
      let best: Vec2 | null = null, bestScore = Infinity;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, dir = { x: Math.cos(a), z: Math.sin(a) };
        const p = { x: b.pos.x + dir.x * d, z: b.pos.z + dir.z * d };
        if (blocked(p, FOOT_RADIUS) || !opens(p) || !reach(p)) continue;
        // prefer ground with room round it (not a spot pressed against a wall), then the way the player is pushing
        let room = 0;
        for (let k = 0; k < 8; k++) if (!blocked({ x: p.x + Math.cos(k * Math.PI / 4) * 0.8, z: p.z + Math.sin(k * Math.PI / 4) * 0.8 }, BOX_PROBE_R)) room++;
        const score = -room * 10 - (this.moveDir ? dir.x * this.moveDir.x + dir.z * this.moveDir.z : 0);
        if (score < bestScore) { bestScore = score; best = p; }
      }
      if (best) { this.pinTarget = best; this.boxedT = 0; b.vehiclePass = true; return true; }
    }
    return false;
  }

  /**
   * Running flat out into a low part of a car: the vault starts by itself. Returns true while a feasible vault is ahead, so the sprint
   * is not braked for the wall (the body of the car is the wall).
   */
  private autoVault(speedNow: number, dt: number): boolean {
    const b = this.body;
    if (!vaultSettings.autoVault || !this.vehiclesNear || this.held || this.aimYaw !== null || !this.moveDir) return false;
    if (this.sprintBlend < 0.85 || speedNow < AUTO_VAULT_SPEED || this.jump.busy) { this.autoOk = false; return false; }
    if (Math.cos(angleDiff(b.heading, headingFromVec(this.moveDir))) < 0.9) { this.autoOk = false; return false; }
    const f = forwardFromHeading(b.heading);
    const cars = this.carsNear(3.4);
    let lowD = Infinity;
    for (const c of cars) {
      const od = outlineDistance(c, b.pos);
      const ang = Math.abs(angleDiff(b.heading, Math.atan2(od.near.x - b.pos.x, -(od.near.z - b.pos.z))));
      if (od.d > 3.2 || ang > 0.6) continue;
      const prof = topProfile(c.spec);
      if (!prof) continue;
      const fr = { fx: Math.sin(c.heading), fz: -Math.cos(c.heading) };
      const u = (od.near.x - c.pos.x) * fr.fx + (od.near.z - c.pos.z) * fr.fz;
      const h = prof.top(u);
      if (h !== null && h <= 1.15) lowD = Math.min(lowD, od.d);
    }
    if (lowD === Infinity) { this.autoOk = false; return false; }
    if (lowD <= VAULT_REACH) {
      const res = this.planFromHere(false);
      if (res.plan) { this.startVault(res.plan); return true; }
      this.autoOk = false; return false;
    }
    this.autoCheckT -= dt;
    if (this.autoCheckT <= 0) {
      this.autoCheckT = 0.15;
      const probe = { x: b.pos.x + f.x * (lowD - VAULT_REACH + 0.1), z: b.pos.z + f.z * (lowD - VAULT_REACH + 0.1) };
      this.autoOk = !!this.planFromHere(false, probe).plan;
    }
    return this.autoOk;
  }

  /**
   * Start getting into the nearest vehicle whose door is within 3 m. Returns it (or null). The car is claimed
   * at once (`driver = 'player'`, input neutral) but the player first walks to the door for ~0.4 s; then
   * `enterVehicle` fires and `inVehicle` becomes true. Call `update(dt)` as usual.
   */
  tryEnter(vehicles: IVehicle[]): IVehicle | null {
    if (this.entering) { this.exitQueued = true; return null; } // F again while walking to the door: "never mind", leave as soon as seated
    if (this.vehicle || this.downT > 0 || this.vault) return null;
    // Candidates by how near the player is to the door (a car reached only by its body box ranks behind one whose door is in
    // range, so a van beside the cab is not picked over the cab). A candidate that cannot be entered (jammed on every side, a
    // far door) is skipped for the next one: one refused car never leaves the player standing frozen beside another he could take.
    const cands: Array<{ v: IVehicle; k: number }> = [];
    for (const v of vehicles) {
      if (v.driver === 'player') continue;
      const d = doorDistance(v, this.body.pos);
      if (d <= ENTER_RANGE) cands.push({ v, k: doorFar(v, this.body.pos) ? d + FAR_DOOR_PENALTY : d });
    }
    cands.sort((p, q) => p.k - q.k);
    let best: IVehicle | null = null;
    for (const c of cands) {
      // Getting in from beyond the door only makes sense if there is somewhere to get out again: a car jammed against
      // walls and props on every side is refused (the player would be spat out inside the wall).
      if (this.blockedAt && doorFar(c.v, this.body.pos) && (this.blockedAt(this.body.pos, FOOT_RADIUS, c.v.id) || !this.anyExitFree(c.v))) continue;
      best = c.v; break;
    }
    if (!best) return null;
    const prevDriver = best.driver;
    best.driver = 'player';
    best.setInput({ ...NEUTRAL, brake: true }); // a rolling car brakes while you climb in instead of coasting away from the door
    this.exitQueued = false;
    this.enteredFar = doorFar(best, this.body.pos) || this.entrySide(best) > 0;
    this.enteredFrom = { x: this.body.pos.x, z: this.body.pos.z };
    // CARENTRY: the door is the one on the player's own side (the passenger door from the kerb side, then across the seat), as in GTA: no walk through or round the car
    const side = this.entrySide(best);
    const dp = Player.doorOf(best, side);
    const walkTo = Math.hypot(dp.x - this.body.pos.x, dp.z - this.body.pos.z);
    const route = this.routeToDoor(best, side);
    this.entering = {
      vehicle: best, t: 0, from: { x: this.body.pos.x, z: this.body.pos.z }, prevDriver,
      time: route ? Math.min(ROUTE_TIME_MAX, route.len / ROUTE_SPEED + ROUTE_SEAT) : clamp(walkTo / ENTER_WALK_SPEED, ENTER_TIME, ENTER_TIME_MAX),
      v0: this.entryVelocity(best, side),
      camCut: walkTo <= CAM_CUT_DOOR || route !== null, side, // a walk round the car is filmed from the car's own view: an on-foot lens beside a bus would run along its flank
      route, walkFrac: route ? Math.max(0.5, 1 - ROUTE_SEAT / Math.min(ROUTE_TIME_MAX, route.len / ROUTE_SPEED + ROUTE_SEAT)) : 1 - SEAT_SHARE,
    };
    this.braceT = 0;
    this.pinT = 0; this.pinTarget = null;
    this.jump.reset(); this.body.height = 0; this.prevY = 0;
    this.body.shape.r = SEATED_RADIUS; // glide through the car's own collision box
    this.onEnterStart?.();
    this.moveDir = null;
    this.wantRun = false;
    this.desiredVel = { x: 0, z: 0 };
    return best;
  }

  /**
   * The walk to the driver's door when the straight line would cross the car's body (the door is on the far side): along the flank to the
   * nearer end, across the end and back to the door, kept ROUTE_MARGIN clear of the box. Null when the straight line is clear, or when both
   * ends are blocked by something solid (then the old glide is used).
   */
  private routeToDoor(v: IVehicle, side: number): EnterRoute | null {
    const f = forwardFromHeading(v.body.heading), r = perpRight(f);
    const p = this.body.pos, cx = v.body.pos.x, cz = v.body.pos.z;
    const sa = (p.x - cx) * f.x + (p.z - cz) * f.z, sc = (p.x - cx) * r.x + (p.z - cz) * r.z;
    const hl = v.spec.length / 2 + ROUTE_MARGIN, hw = v.spec.width / 2 + ROUTE_MARGIN, dc = side * (v.spec.width / 2 + 0.3);
    if (Math.abs(sa) < v.spec.length / 2 && Math.abs(sc) < v.spec.width / 2) return null; // already inside the car's footprint (a test, a carjack through a window): the glide
    let crosses = false;
    for (let i = 1; i < 16 && !crosses; i++) { const u = i / 16, a = sa * (1 - u), c = sc + (dc - sc) * u; if (Math.abs(a) < v.spec.length / 2 + 0.05 && Math.abs(c) < v.spec.width / 2 + 0.05) crosses = true; } // the straight line must clear the car's own box (the door stands 0.3 m outside it)
    if (!crosses) return null;
    let best: EnterRoute | null = null;
    for (const e of [1, -1]) {
      if (Math.abs(sa) >= hl && Math.sign(sa) !== e) continue; // already at the other end
      const pts: Array<{ a: number; c: number }> = [{ a: sa, c: sc }];
      const out = Math.abs(sc) < 0.05 ? side * hw : (sc < 0 ? -hw : hw); // the flank to walk along: the player's own, or the door's when dead centre
      if (Math.abs(sc) < hw) pts.push({ a: sa, c: out }); // too close to the car's box: step out of it first
      if (Math.abs(sa) < hl) pts.push({ a: e * hl, c: Math.abs(sc) < hw ? out : sc });
      pts.push({ a: e * hl, c: dc }, { a: 0, c: dc });
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].a - pts[i - 1].a, pts[i].c - pts[i - 1].c);
      if (this.blockedAt && pts.slice(1, -1).some((q) => this.blockedAt!({ x: cx + f.x * q.a + r.x * q.c, z: cz + f.z * q.a + r.z * q.c }, FOOT_RADIUS * 0.7, v.id))) continue;
      if (!best || len < best.len) best = { pts, len };
    }
    return best;
  }

  /** Which door the player gets in by: +1 the right (passenger) door when they stand on the car's right, else -1, the driver's door. */
  private entrySide(v: IVehicle): number {
    const r = perpRight(forwardFromHeading(v.body.heading));
    return (this.body.pos.x - v.body.pos.x) * r.x + (this.body.pos.z - v.body.pos.z) * r.z > 0.3 ? 1 : -1;
  }
  /** World position of a door of `v`, 0.3 m outside the body: side -1 the driver's (left), +1 the passenger's (right). */
  static doorOf(v: IVehicle, side: number): Vec2 {
    const r = perpRight(forwardFromHeading(v.body.heading)), off = v.spec.width / 2 + 0.3;
    return { x: v.body.pos.x + r.x * off * side, z: v.body.pos.z + r.z * off * side };
  }

  /** The part of the player's own velocity that points toward the door, capped: the walk to the door carries on from it. */
  private entryVelocity(v: IVehicle, side: number): Vec2 {
    const b = this.body, door = Player.doorOf(v, side);
    const dx = door.x - b.pos.x, dz = door.z - b.pos.z, l = Math.hypot(dx, dz);
    if (l < 1e-3) return { x: 0, z: 0 };
    const along = Math.min(4, Math.max(0, (b.vel.x * dx + b.vel.z * dz) / l));
    return { x: (dx / l) * along, z: (dz / l) * along };
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
      if (l <= step) { b.pos.x = this.pinTarget.x; b.pos.z = this.pinTarget.z; this.pinTarget = null; b.vehiclePass = false; }
      else { b.pos.x += (dx / l) * step; b.pos.z += (dz / l) * step; }
      this.pinT = 0;
      return;
    }
    if (this.moveDir && moved < WALK_SPEED * dt * 0.15) this.pinT += dt; else this.pinT = Math.max(0, this.pinT - dt * 2);
    if (this.pinT < PIN_AFTER || !this.blockedAt) return;
    this.pinT = 0;
    const blocked = this.blockedAt;
    // Leaning on a wall or into a corner is not being trapped: the body is separated from it and can walk back out. Only glide when the
    // foot circle really overlaps something (a prop landed in, a car parked onto the player) or is boxed in on nearly every side.
    if (!blocked(b.pos, FOOT_RADIUS * 0.85)) {
      let shut = 0;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (blocked({ x: b.pos.x + Math.cos(a) * 0.45, z: b.pos.z + Math.sin(a) * 0.45 }, FOOT_RADIUS * 0.7)) shut++; }
      if (shut < 6) return;
    }
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
    const exitSeat = this.seatOf(v);
    const carVx = v.body.vel.x, carVz = v.body.vel.z, carSp = Math.hypot(carVx, carVz);
    v.driver = null;
    v.setInput(NEUTRAL);
    this.vehicle = null;
    this.seatTail = 0;
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
    this.anim?.playOnce('standUp', { from: 0.4, rate: 2.3, fadeIn: 0.05, fadeOut: 0.25 }); // rise out of the seat (captured stand-up)
    this.exitVis = { t: 1, ...exitSeat }; this.seatK = 0; this.enterSeat = null;                 // and slide out of the seat to the spot beside the door
    this.braceT = 0; this.wallBraced = false; this.postSpeed = 0;
    if (carSp > LEAVE_STEP) {
      // the car is moving: the body keeps part of its speed. A step out at a trot, or above LEAVE_ROLL a roll along the ground and a get-up.
      const carry = Math.min(LEAVE_CARRY_MAX, carSp * LEAVE_CARRY);
      this.body.vel.x = (carVx / carSp) * carry; this.body.vel.z = (carVz / carSp) * carry;
      if (carSp > LEAVE_ROLL) { this.downT = ROLL_TIME; this.exitVis = null; this.jump.reset(); this.body.height = 0; this.prevY = 0; }
      else this.anim?.playOnce('stumble', { amp: 0.4, from: 0.2, to: 0.55, rate: 1.8, fadeIn: 0.05, fadeOut: 0.3 });
    }
    this.prevPos.x = this.body.pos.x; this.prevPos.z = this.body.pos.z; this.prevHeading = this.body.heading;
    this.events.emit('exitVehicle', { vehicleId: v.id });
  }

  update(dt: number): void {
    const b = this.body;
    this.prevPos.x = b.pos.x; this.prevPos.z = b.pos.z; this.prevHeading = b.heading;
    if (this.vaultTail > 0) {
      // the lens was left on the far side of the car: it keeps ignoring that car while the player is within a lens length of it (the line from lens to body
      // crosses the car until then, and a pull-in over the roof would be a pop), at most VAULT_CAM_HOLD seconds
      this.vaultHold += dt;
      const car = this.vaultCarId && this.vehiclesNear ? this.carsNear(6).find((c) => c.id === this.vaultCarId) : undefined;
      if (car && this.vaultHold < VAULT_CAM_HOLD && outlineDistance(car, b.pos).d < VAULT_CAM_NEAR) this.vaultTail = VAULT_CAM_TAIL;
      else this.vaultTail = Math.max(0, this.vaultTail - dt);
    }
    if (this.vehicle) {
      this.syncToVehicle();
      if (this.seatTail > 0) { // finish the sit-down before the figure disappears into the car
        this.seatTail -= dt;
        this.seatK = 1; this.enterSeat = this.seatOf(this.vehicle);
        if (this.anim && !this.anim.busy) this.anim.playOnce('sitDown', { from: 0.75, fadeIn: 0.05, fadeOut: 0.1 });
        this.animateFoot(dt);
        if (this.seatTail <= 0) { this.object3D.visible = false; this.seatK = 0; this.enterSeat = null; }
      }
      return;
    }
    if (!(dt > 0)) return;
    if (this.entering) { this.updateEntering(dt); return; }
    if (this.downT > 0) { // run down: slide along the ground, then get up
      this.downT -= dt;
      const damp = Math.exp(-KNOCK_DRAG * dt);
      b.vel.x *= damp; b.vel.z *= damp;
      b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
      this.desiredVel = { x: 0, z: 0 };
      if (this.downT <= 0) { this.downT = 0; b.vehiclePass = false; b.vel.x = 0; b.vel.z = 0; }
      this.animateFoot(dt);
      return;
    }
    if (this.exitVis) { this.exitVis.t -= dt / EXIT_SLIDE; if (this.exitVis.t <= 0) this.exitVis = null; }
    if (this.vault) { this.updateVault(dt); return; }

    // jump: advance the arc first so the physics pass of this step sees the new height
    this.prevY = this.jump.y + this.vaultY;
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
    this.updateBoxed(dt);

    // --- a hard hit: the physics pass has just taken most of the speed off (a wall, a person). Brace and stagger, do not stand dead.
    const speedNow = Math.hypot(b.vel.x, b.vel.z);
    if (this.moveDir && this.postSpeed - speedNow > BUMP_DROP && !this.jump.busy) {
      const strength = clamp((this.postSpeed - speedNow) / RUN_SPEED, 0, 1);
      this.braceT = BRACE_TIME;
      this.sprintBlend = Math.min(this.sprintBlend, 0.2);
      this.anim?.playOnce('stumble', { amp: 0.35 + 0.4 * strength, from: 0.2, to: 0.6, rate: 1.8, fadeIn: 0.05, fadeOut: 0.25 });
      this.onBump?.(strength);
    }
    this.braceT = Math.max(0, this.braceT - dt);
    this.shoulderCool = Math.max(0, this.shoulderCool - dt);
    if (speedNow < 2.5) this.wallBraced = false;
    const brace = 1 - 0.65 * (this.braceT / BRACE_TIME); // the legs come back under the body: less push for a moment after a hit
    // flat out into a low car: the vault starts by itself (and the sprint is not braked for the car)
    const autoAhead = this.autoVault(speedNow, dt);
    if (this.vault) { this.updateVault(dt); return; }

    // --- sprint ramp, then accelerate toward the desired velocity (no instant starts or stops)
    const ramp = this.wantRun && this.moveDir ? 1 / SPRINT_RAMP_UP : -1 / SPRINT_RAMP_DOWN;
    this.sprintBlend = clamp(this.sprintBlend + ramp * dt, 0, 1);
    const speedFrac = clamp(speedNow / RUN_SPEED, 0, 1);
    const prevHeading = b.heading;
    // facing turns toward the way the body is told to go (or the aim), but only as fast as its speed allows
    const turnTo = (face: number): void => {
      const want = angleDiff(b.heading, face) * (1 - Math.exp(-TURN_SMOOTH * this.jump.accelScale * dt));
      const lim = maxTurnRate(speedNow) * dt;
      b.heading = wrapAngle(b.heading + clamp(want, -lim, lim));
    };
    if (this.moveDir) {
      const k = this.sprintBlend;
      // base pace: a jog (WALK_SPEED); Alt / Caps Lock or a half-pushed stick: a walk; Shift: sprint. A full key press is moveMag 1.
      const walkish = !this.wantRun && (this.wantStroll || this.moveMag < STICK_WALK_MAG);
      const base = walkish ? STROLL_SPEED : this.moveMag < 1 ? STROLL_SPEED + (WALK_SPEED - STROLL_SPEED) * ((this.moveMag - STICK_WALK_MAG) / (1 - STICK_WALK_MAG)) : WALK_SPEED;
      let sp = (base + (RUN_SPEED - base) * (k * k * (3 - 2 * k))) * this.jump.speedScale;
      const want = headingFromVec(this.moveDir);
      const face = this.aimYaw ?? want;
      turnTo(face);
      // not yet facing the way it was told to go: give less speed until the body has swung round (not while aiming: that strafes)
      if (this.aimYaw === null) sp *= alignScale(Math.cos(angleDiff(b.heading, want)));
      // sprinting at a wall: take speed off over the last metres, so the contact is a brace and not a dead stop
      if (speedNow > WALL_CONTACT_SPEED + 0.2 && this.blockedAt && !this.jump.busy && !autoAhead) {
        const ux = b.vel.x / speedNow, uz = b.vel.z / speedNow;
        for (const d of [0.5, 0.8, 1.1, 1.4, 1.8, 2.2, 2.8]) {
          if (this.blockedAt({ x: b.pos.x + ux * (d + FOOT_RADIUS), z: b.pos.z + uz * (d + FOOT_RADIUS) }, FOOT_RADIUS * 0.8)) {
            // STUCK: a wall met at a glancing angle is slid along, not braked for (one flank probe blocked, the other free): sprinting along
            // a wall at 45 degrees kept 79 percent of its speed, at 70 degrees only 52. Head-on walls (both blocked) and posts (both free) still brake.
            const kf = (d + FOOT_RADIUS) / 0.765, c7 = 0.765, s7 = 0.644;
            const lb = this.blockedAt({ x: b.pos.x + (ux * c7 - uz * s7) * kf, z: b.pos.z + (ux * s7 + uz * c7) * kf }, FOOT_RADIUS * 0.8);
            const rb = this.blockedAt({ x: b.pos.x + (ux * c7 + uz * s7) * kf, z: b.pos.z + (-ux * s7 + uz * c7) * kf }, FOOT_RADIUS * 0.8);
            if (lb !== rb) break;
            const cap = Math.sqrt(WALL_CONTACT_SPEED * WALL_CONTACT_SPEED + 2 * BRAKE_ACCEL * Math.max(0, d - 0.55));
            if (cap < sp) {
              sp = cap;
              if (!this.wallBraced && speedNow > 5) { // the first moment of braking for a wall: throw the weight back, a small stagger
                this.wallBraced = true;
                this.anim?.playOnce('stumble', { amp: 0.3, from: 0.2, to: 0.55, rate: 1.8, fadeIn: 0.08, fadeOut: 0.3 });
                this.onBump?.(0.3);
              }
            }
            break;
          }
        }
      }
      this.desiredVel = { x: this.moveDir.x * sp, z: this.moveDir.z * sp };
    } else {
      this.desiredVel = { x: 0, z: 0 };
      if (this.aimYaw !== null) turnTo(this.aimYaw);
    }
    this.turnRate = dt > 0 ? angleDiff(prevHeading, b.heading) / dt : 0;
    const ex = this.desiredVel.x - b.vel.x, ez = this.desiredVel.z - b.vel.z;
    const el = Math.hypot(ex, ez);
    if (el > 1e-9) {
      const reversing = this.moveDir !== null && b.vel.x * this.desiredVel.x + b.vel.z * this.desiredVel.z < 0;
      const accel = ACCEL_LOW + (ACCEL_HIGH - ACCEL_LOW) * speedFrac;
      const decel = DECEL_LOW + (DECEL_HIGH - DECEL_LOW) * speedFrac;
      // pushing against the velocity or letting go: the heavier brake; speeding up along it: the lighter motor
      const slowing = !this.moveDir || b.vel.x * ex + b.vel.z * ez < 0 || Math.hypot(this.desiredVel.x, this.desiredVel.z) < speedNow;
      const rate = (slowing ? Math.max(decel, this.moveDir && reversing ? accel * TURN_ACCEL_BOOST : 0) : accel * (reversing ? TURN_ACCEL_BOOST : 1)) * this.jump.accelScale * (slowing ? 1 : brace);
      const step = Math.min(el, rate * dt);
      b.vel.x += (ex / el) * step;
      b.vel.z += (ez / el) * step;
    }
    // Curbs (<= 0.15 m) are stepped over automatically: they are not colliders and World2D has no height,
    // so there is nothing to do here and the y offset stays 0.
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    this.postSpeed = Math.hypot(b.vel.x, b.vel.z);
    this.animateFoot(dt);
  }

  /** Mesh pose between the previous and current simulation state (alpha 0..1); teleports snap. */
  applyInterpolated(alpha: number): void {
    const b = this.body;
    if (this.vehicle) { this.pose3D(b.pos, b.heading, 0); return; }
    const a = clamp(alpha, 0, 1);
    const y = this.prevY + (this.jump.y + this.vaultY - this.prevY) * a;
    if (Math.hypot(b.pos.x - this.prevPos.x, b.pos.z - this.prevPos.z) > 8) { this.pose3D(b.pos, b.heading, y); return; }
    const pos = { x: this.prevPos.x + (b.pos.x - this.prevPos.x) * a, z: this.prevPos.z + (b.pos.z - this.prevPos.z) * a };
    this.pose3D(pos, this.prevHeading + angleDiff(this.prevHeading, b.heading) * a, y);
  }

  /** The right forearm bone of the procedural figure (the hand is at its far end): held items attach here. Null for a glTF character. */
  handAnchor(): THREE.Object3D | null { return this.model ? this.model.elbows[1] : null; }

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
    e.t = Math.min(1, e.t + dt / e.time);
    const door = Player.doorOf(e.vehicle, e.side); // tracks the car if it is still rolling
    if (!e.camCut && Math.hypot(door.x - b.pos.x, door.z - b.pos.z) <= CAM_CUT_REACH) e.camCut = true; // a long walk: the camera cuts when the door is reached
    let nx: number, nz: number;
    let face: Vec2 | null = null; // where the body turns to (null: toward the car)
    if (e.route) {
      // round the car: along the polyline (in the car's own frame, so a car still rolling to a stop carries it along), quick off the mark, arriving at rest
      const v = e.vehicle, f = forwardFromHeading(v.body.heading), r = perpRight(f), pts = e.route.pts;
      const w = (q: { a: number; c: number }): Vec2 => ({ x: v.body.pos.x + f.x * q.a + r.x * q.c, z: v.body.pos.z + f.z * q.a + r.z * q.c });
      const u = Math.min(1, e.t / e.walkFrac), want = (1 - (1 - u) * (1 - u)) * e.route.len;
      let acc = 0, i = 1;
      for (; i < pts.length - 1; i++) { const l = Math.hypot(pts[i].a - pts[i - 1].a, pts[i].c - pts[i - 1].c); if (acc + l >= want) break; acc += l; }
      const a0 = w(pts[i - 1]), a1 = w(pts[i]), l = Math.hypot(pts[i].a - pts[i - 1].a, pts[i].c - pts[i - 1].c) || 1, k = clamp((want - acc) / l, 0, 1);
      nx = a0.x + (a1.x - a0.x) * k; nz = a0.z + (a1.z - a0.z) * k;
      if (u < 0.97) face = { x: a1.x - a0.x, z: a1.z - a0.z };
    } else {
      // a Hermite path from where the player was, leaving at the speed they had (no stop dead at the first frame), arriving at rest at the door
      const u = e.t, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2;
      nx = h00 * e.from.x + h10 * e.time * e.v0.x + h01 * door.x;
      nz = h00 * e.from.z + h10 * e.time * e.v0.z + h01 * door.z;
    }
    b.vel.x = (nx - b.pos.x) / dt;
    b.vel.z = (nz - b.pos.z) / dt;
    b.pos.x = nx; b.pos.z = nz;
    const toFace = face ?? { x: e.vehicle.body.pos.x - nx, z: e.vehicle.body.pos.z - nz };
    if (Math.hypot(toFace.x, toFace.z) > 0.05) {
      b.heading = wrapAngle(b.heading + angleDiff(b.heading, headingFromVec(toFace)) * (1 - Math.exp(-TURN_SMOOTH * dt)));
    }
    // the last part of the walk is the sit-down: the figure slides into this vehicle's driver seat (captured sit-down; needs the street pack)
    const sitFrom = e.walkFrac;
    const seating = e.t > sitFrom;
    this.enterSeat = seating ? this.seatOf(e.vehicle) : null;
    this.seatK = seating ? (e.t - sitFrom) / (1 - sitFrom) : 0;
    this.animateFoot(dt);
    if (seating && this.anim && !this.anim.busy) this.anim.playOnce('sitDown', { from: 0.35, to: 0.75, rate: 2.2, fadeIn: 0.1, fadeOut: 0.0 });
    if (e.t >= 1) this.completeEnter();
  }

  private completeEnter(): void {
    const e = this.entering!;
    this.entering = null;
    const best = e.vehicle;
    this.vehicle = best;
    this.seatTail = this.anim?.hasClip('sitDown') ? SEAT_TAIL : 0;
    this.object3D.visible = this.seatTail > 0;
    // keep the figure in the seat on the frame it is claimed (it used to pop to the car's centre for one frame)
    if (this.seatTail > 0) { this.seatK = 1; this.enterSeat = this.seatOf(best); } else { this.seatK = 0; this.enterSeat = null; }
    this.body.shape.r = SEATED_RADIUS;
    this.syncToVehicle();
    this.prevPos.x = this.body.pos.x; this.prevPos.z = this.body.pos.z; this.prevHeading = this.body.heading;
    this.events.emit('enterVehicle', { vehicleId: best.id });
    if (e.prevDriver === 'traffic' || e.prevDriver === 'cop') {
      this.events.emit('crime', { type: 'carjack', pos: { x: best.body.pos.x, z: best.body.pos.z } });
    }
    if (this.exitQueued) { this.exitQueued = false; this.exit(); }
  }


  /** The driver's seat of `v`: world position, the car's heading, and how far the figure sits above or below its standing pose (seat height by vehicle type). */
  private seatOf(v: IVehicle): { seat: Vec2; heading: number; dy: number } {
    const f = forwardFromHeading(v.body.heading), r = perpRight(f);
    const side = -v.spec.width * 0.24, fore = v.spec.length * 0.04;
    const pelvis = clamp(0.28 + v.spec.height * 0.14, 0.42, 0.85); // pelvis height of the seated driver: low coupe ~0.46, sedan ~0.5, van and truck higher
    return { seat: { x: v.body.pos.x + r.x * side + f.x * fore, z: v.body.pos.z + r.z * side + f.z * fore }, heading: v.body.heading, dy: pelvis - SIT_PELVIS };
  }

  /** applyPose plus the visual slide into or out of the seat (the physics body stays at the door). */
  private pose3D(pos: Vec2, heading: number, y: number): void {
    const o = this.object3D;
    const ex = this.exitVis;
    const k = ex ? ex.t : this.seatK;
    const tgt = ex ?? this.enterSeat;
    // on a sidewalk the slab is 0.15 m above the roadway: draw the figure on it (the seat of a car is measured from the road)
    this.groundY = easeGround(this.groundY, groundAt(pos.x, pos.z), 1 / 60);
    if (this.downT > 0 || this.wasDown) { // run down: lie flat on the ground like a knocked-down pedestrian, then stand again
      applyPose(o, pos, heading, this.groundY + (this.downT > 0 ? 0.22 : 0));
      const down = this.downT > 0;
      if (this.rig) this.rig.setDown(down); else { o.rotation.order = 'YXZ'; o.rotation.x = down ? Math.PI / 2 : 0; }
      this.wasDown = down;
      return;
    }
    if (k <= 0.001 || !tgt) { applyPose(o, pos, heading, y + this.groundY); return; }
    const e = k * k * (3 - 2 * k);
    const h = heading + angleDiff(heading, tgt.heading) * e;
    applyPose(o, { x: pos.x + (tgt.seat.x - pos.x) * e, z: pos.z + (tgt.seat.z - pos.z) * e }, h, y + tgt.dy * e + this.groundY * (1 - e));
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
      if (!this.anim.update(dt, { speed: sp, yawRate, jump: { phase: this.jump.phase, t: this.jump.t, vy: this.jump.vy }, action: this.actionPose, look: this.lookInput(dt), vault: this.vault ? { k: this.vaultAnimK, side: this.vaultSide } : null })) {
        if (this.vault) animateJump(this.model, 'air', 0.2, 1);
        else if (this.jump.busy) animateJump(this.model, this.jump.phase, this.jump.t, this.jump.vy);
        else animateWalk(this.model, this.walkPhase, this.walkAmp);
      }
    }
    this.pose3D(b.pos, b.heading, this.jump.y + this.vaultY);
  }

  /**
   * Where the head looks, relative to the body (the anim controller eases it further): toward the way the body is about to go (so the head
   * leads a turn, about 0.6 of the angle still to turn) and, when standing or walking easy, at `glanceAt` when it is in front.
   */
  private lookInput(dt: number): { yaw: number; pitch: number } | null {
    const b = this.body;
    let leadWant = 0;
    if (this.moveDir && this.aimYaw === null) leadWant = clamp(angleDiff(b.heading, headingFromVec(this.moveDir)) * 0.6, -0.8, 0.8);
    this.lookLead += (leadWant - this.lookLead) * (1 - Math.exp(-10 * dt));
    let glance = 0;
    const g = this.glanceAt;
    if (g && !this.inVehicle && this.downT <= 0 && Math.hypot(this.body.vel.x, this.body.vel.z) < 4.5) {
      const rel = angleDiff(b.heading, headingFromVec({ x: g.x - b.pos.x, z: g.z - b.pos.z }));
      if (Math.abs(rel) < 1.9) glance = clamp(rel, -1.0, 1.0);
    }
    this.lookYaw += (glance - this.lookYaw) * (1 - Math.exp(-5 * dt));
    const yawRight = this.lookLead + this.lookYaw; // clockwise = to the right
    if (Math.abs(yawRight) < 0.005) return null;
    return { yaw: -yawRight, pitch: 0 }; // the controller's yaw is positive to the LEFT
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
