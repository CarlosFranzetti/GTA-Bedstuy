import { hyp } from '@/core/Math2';
import * as THREE from 'three';
import { buildCarModel, type CarModel } from '@/entities/models/carModel';
import { plateText } from '@/textures/painters/vehicle';
import type { VehicleSources } from '@/entities/models/gltf/VehicleSource';
import {
  angleDiff, applyPose, clamp, dot, forwardFromHeading, headingFromVec, perpRight, wrapAngle, type Vec2,
} from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type {
  Body2D, Contact, IMaterialLibrary, IVehicle, VehicleInput, VehicleSpec, VehicleType,
} from '@/world/types';

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  // accel is the launch acceleration; the thrust curve a = accel * (throttle - (v/maxSpeed)^2) makes
  // 0 -> 0.93*maxSpeed take ~6 s for the sedan (= 0-100 km/h) and ~12 s for the box truck.
  sedan: { type: 'sedan', name: 'Sedan', length: 4.88, width: 1.84, height: 1.45, maxSpeed: 30, accel: 8, brakeDecel: 14, maxSteer: 0.6, color: '#8a8f98' },
  suv: { type: 'suv', name: 'SUV', length: 5.05, width: 2.0, height: 1.78, maxSpeed: 27, accel: 7, brakeDecel: 14, maxSteer: 0.6, color: '#2c3e50' },
  // ROSTER: sizes follow the real class, see the style comments in models/carBodies.ts (box truck: Isuzu NPR 16 ft box, bus: 40 ft transit bus)
  boxtruck: { type: 'boxtruck', name: 'Box truck', length: 7, width: 2.44, height: 3.3, maxSpeed: 20, accel: 2.7, brakeDecel: 12, maxSteer: 0.6, color: '#e8e8e8' },
  cargovan: { type: 'cargovan', name: 'Cargo van', length: 5.98, width: 2.06, height: 2.78, maxSpeed: 25, accel: 5, brakeDecel: 12, maxSteer: 0.6, color: '#ecf0f1' },
  hatch: { type: 'hatch', name: 'Hatchback', length: 4.06, width: 1.7, height: 1.52, maxSpeed: 29, accel: 7, brakeDecel: 14, maxSteer: 0.6, color: '#d6322a' },
  beater: { type: 'beater', name: 'Old sedan', length: 4.83, width: 1.77, height: 1.37, maxSpeed: 26, accel: 5, brakeDecel: 11, maxSteer: 0.6, color: '#8c7a5a' },
  bus: { type: 'bus', name: 'Bus', length: 12.5, width: 2.59, height: 3.2, maxSpeed: 17, accel: 1.6, brakeDecel: 9, maxSteer: 0.5, color: '#f0f0ec' },
  cop: { type: 'cop', name: 'Police car', length: 5.04, width: 1.91, height: 1.48, maxSpeed: 33, accel: 9, brakeDecel: 14, maxSteer: 0.6, color: '#f2f2f2' },
  cab: { type: 'cab', name: 'Taxi', length: 5.39, width: 1.99, height: 1.44, maxSpeed: 30, accel: 8, brakeDecel: 14, maxSteer: 0.6, color: '#e0b01e' },
};

// ---- longitudinal
const REVERSE_MAX = 8;
const REVERSE_ACCEL_FRAC = 0.55;
/** Engine braking when coasting (m/s^2), fading out below 2 m/s. */
const ENGINE_BRAKE = 1.6;
/** Brake pedal ramp (1/s): pressing takes ~0.13 s, releasing ~0.07 s. */
const BRAKE_APPLY = 7.5;
const BRAKE_RELEASE = 14;
/** Opposite-direction throttle brakes at this pedal fraction before reversing. */
const OPPOSE_BRAKE = 0.8;
const HANDBRAKE_DECEL_FRAC = 0.2;
// ---- steering
/** Full-lock sweeps per second at standstill; divided by (1 + speed/STEER_SPEED_REF) so high speed steers lazily. */
const STEER_RATE = 3.4;
const STEER_SPEED_REF = 18;
const STEER_RETURN_MULT = 1.6;
const STEER_SPEED_SHRINK = 0.7;
const YAW_ACCEL = 7; // rad/s^2
/**
 * Calm low-speed handling (playtest: a 2 s A/D hold at 15 km/h turned the SUV ~90 deg and 25 km/h ~130 deg).
 * The comfortable yaw rate (rad/s) a held steering key may produce: LOW_YAW_CAP up to LOW_YAW_SPEED, rising smoothly
 * to HIGH_YAW_CAP at HIGH_YAW_SPEED (above that the tyre-grip limit is tighter anyway). The steer angle is shrunk
 * to atan(cap * wheelbase / v), so full lock is only available below ~2 m/s (7 km/h) and falls off smoothly with speed.
 * The handbrake bypasses it: sliding is deliberate.
 */
const LOW_YAW_CAP = 0.5;
const HIGH_YAW_CAP = 1.0;
const LOW_YAW_SPEED = 4;
const HIGH_YAW_SPEED = 16;
// ---- tyres (m/s^2 of lateral acceleration the front / rear axle can hold)
const MU_FRONT = 10.5;
const MU_REAR = 11.5;
/** Lateral velocity is bled at K_LAT * vLat, capped by the rear grip. */
const K_LAT = 12;
const HANDBRAKE_REAR_FRAC = 0.22;
const HANDBRAKE_YAW_BOOST = 1.5;
const OVERSTEER_SPEED_FRAC = 0.7;
const OVERSTEER_REAR_FRAC = 0.62;
// ---- parked cars (driver null)
const PARKED_FRICTION = 3.0;
const PARKED_DRAG = 0.35;
/** A parked car slower than this snaps to rest (static friction), so a walking player cannot shove it. */
const PARKED_STICK = 0.35;
// ---- wedge detection (player-driven cars only)
/** Throttle held at least this hard, slower than WEDGE_SPEED, with a contact this recent counts as pushing into something. */
const WEDGE_THROTTLE = 0.3;
const WEDGE_SPEED = 0.5;
const WEDGE_CONTACT_AGE = 0.12;
/** After this long wedged the car is eased away from the contact. */
const WEDGE_AFTER = 0.8;
/** The push-out: a gentle velocity along the contact normal (m/s), reverse assist and a small turn away over UNSTICK_TIME. */
const UNSTICK_SPEED = 1.8;
const UNSTICK_TIME = 0.9;
const UNSTICK_THROTTLE = 0.7;
const UNSTICK_YAW = 0.22;
/** `blockedSeconds` keeps counting while throttle is held and slower than this, and drops to 0 after this long free of contact. */
const BLOCKED_MAX_SPEED = 3;
const BLOCKED_FREE_AFTER = 2.5;
// ---- small static props (poles, hydrants, trees, bollards): the car slides off them instead of stopping dead
/** Props this small (circle radius, m) deflect the car sideways. */
const PROP_MAX_R = 0.5;
/** Sideways speed (m/s) a contact with such a prop gives the car, and the nose turn (rad/s) away from it. */
const PROP_SLIDE_SPEED = 1.6;
const PROP_SLIDE_YAW = 0.9;
/** Above this speed (m/s) the normal wall response is left alone (a real crash). */
const PROP_SLIDE_MAX_SPEED = 7;
/** Wall friction is scaled by this against a prop, so a glancing hit keeps its speed. */
const PROP_FRICTION_SCALE = 0.25;
// ---- impacts
const IMPACT_MIN = 0.5;
const WALL_FRICTION = 0.35;
const WALL_ALIGN = 0.18;
const SHAKE_MIN_CLOSING = 2;
const SHAKE_FULL_CLOSING = 14;
const SCRAPE_WINDOW = 0.15;
const SCRAPE_DAMAGE = 0.05;
/** a repeat inside the scrape window only counts as a new hit above lastHitImpulse * SCRAPE_ESCALATE + SCRAPE_ESCALATE_ADD */
const SCRAPE_ESCALATE = 1.5;
const SCRAPE_ESCALATE_ADD = 1;
const SHAKE_DECAY = 5; // 1/s, only when nobody consumes it
// ---- chassis visuals
const ROLL_PER_ACCEL = 0.0055;
const PITCH_PER_ACCEL = 0.004;
const TILT_K = 70;
const TILT_C = 10;
const BOUNCE_K = 150;
const BOUNCE_C = 11;
const BOUNCE_MAX = 0.06;
const MAX_STEP = 1 / 30;
const SIREN_FLIPS_PER_SEC = 8; // lightbar swaps colours 8 times/s = a 4 Hz red/blue cycle
const RED = 0xff1010;
const BLUE = 0x1030ff;

const NEUTRAL: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };

const HEAD_ON = 4.0;
const TAIL_ON = 1.5;
const TAIL_BRAKE = 3.0;
const DAMAGE_VISUAL = 0.5;
const DENT_START = 0.3;
const DENT_MAX = 0.16;
const HOOD_LIFT = 0.12;

function hash01(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(y * 100), 19349663) ^ Math.imul(Math.round(z * 100), 83492791) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h | 0;
}

export class Vehicle implements IVehicle {
  /** Optional real car models (GLB) per type; see src/assets/models/README.md. Set once at boot. */
  static sources: VehicleSources = {};
  /** Speed-dependent steering cap for player-driven cars (see LOW_YAW_CAP). Off only for before/after measurements. */
  static calmSteering = true;
  /** Wedge push-out for the player's car (see updateWedge). Off only for tests that assert a car held against an obstacle rests. */
  static wedgeAssist = true;
  readonly spec: VehicleSpec;
  readonly body: Body2D;
  readonly object3D: THREE.Group;
  damage = 0;
  driver: 'player' | 'traffic' | 'cop' | null = null;
  siren = false;
  /** Tyre grip multiplier (1 = dry asphalt). Lower it for wet / ice: understeer and easier drifts. */
  grip = 1;
  /**
   * Impact strength 0..1 asked of the camera. ThirdPersonCamera consumes (reads and zeroes) it for the
   * player's vehicle; for every other vehicle it decays on its own so it never goes stale.
   */
  shakeRequested = 0;
  /** State at the END of the previous step (captured at the start of update()), for render interpolation. */
  readonly prevPos: Vec2;
  prevHeading: number;

  private _headlights = false;
  private braking = false;
  private paintDamaged = false;
  private model!: CarModel;
  /** wraps the model: carries body roll / pitch / suspension bounce so the model's own transforms stay untouched */
  private readonly chassis = new THREE.Group();
  private input: VehicleInput = { ...NEUTRAL };
  private prevHorn = false;
  private time = 0;
  /** Parked and fully at rest: update() returns early until something moves it, changes its driver or damages it. */
  private settled = false;
  private settleCount = 0;
  private setX = 0;
  private setZ = 0;
  private setH = 0;
  private setDamage = 0;
  private steerNorm = 0;
  private steerAngle = 0;
  private yawRate = 0;
  private brakePressure = 0;
  private rearGrip = MU_REAR;
  private wheelRoll = 0;
  private wheelRadius = 0.34;
  private slipAmt = 0;
  private lastHitTime = -10;
  private lastHitImpulse = 0;
  // wedge detection
  private lastContactTime = -10;
  private staticContact: Body2D | null = null;
  private staticContactTime = -10;
  /** unit vector pointing away from the thing last touched */
  private contactAway: Vec2 = { x: 0, z: 0 };
  /** lateral offset (m, + = right of the car) of the last contact point */
  private contactLat = 0;
  private wedgeTimer = 0;
  private wedgeGap = 0;
  private unstickLeft = 0;
  private unstickSign = 1;
  private unstickCount = 0;
  private lastUnstickTime = -10;
  private throttleIdle = 0;
  private _blockedSeconds = 0;
  private readonly ownMaterials: THREE.Material[] = [];
  // chassis springs (rad / m and their velocities)
  private roll = 0; private rollV = 0;
  private pitch = 0; private pitchV = 0;
  private bounce = 0; private bounceV = 0;
  private aLongF = 0; private aLatF = 0;
  // dents
  private readonly seed: number;
  private dentGeos: { mesh: THREE.Mesh; orig: THREE.BufferGeometry; base: Float32Array }[] = [];
  private dentDamage = 0;
  private hitLocal: Vec2 = { x: 0, z: -1 };

  constructor(
    readonly id: string,
    spec: VehicleSpec,
    pos: Vec2,
    heading: number,
    private materials: IMaterialLibrary,
    private events: EventBus,
  ) {
    this.spec = spec;
    this.seed = seedOf(id);
    this.body = {
      id,
      kind: spec.type === 'cop' ? 'cop' : 'vehicle',
      shape: { kind: 'obb', halfW: spec.width / 2, halfL: spec.length / 2 },
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      heading,
      mass: spec.type === 'bus' ? 12000 : spec.type === 'boxtruck' ? 3500 : spec.type === 'cargovan' ? 2400 : spec.type === 'hatch' ? 1150 : 1400,
      userData: this,
    };
    this.prevPos = { x: pos.x, z: pos.z };
    this.prevHeading = heading;
    this.object3D = new THREE.Group();
    this.object3D.name = `vehicle:${id}`;
    this.object3D.add(this.chassis);
    this.buildMesh();
    applyPose(this.object3D, this.body.pos, this.body.heading);
  }

  /** Display name for the HUD / tools: the spec name, refined by the body style the model was built with (Coupe, Taxi). */
  get name(): string {
    const style = (this.model?.group.userData as { carStyle?: string } | undefined)?.carStyle;
    if (style === 'coupe') return 'Coupe';
    if (style === 'cab') return 'Taxi';
    return this.spec.name ?? this.spec.type;
  }

  /** Licence plate text of this car (fixed by its id, so it never changes on exit / re-enter or a LOD swap). */
  get plate(): string {
    const v = (this.model?.group.userData as { carVariant?: number } | undefined)?.carVariant ?? (this.seed >>> 0) % 4;
    return plateText(v);
  }

  /** Forward speed in m/s (negative when reversing), read live from the body so physics nudges are honoured. */
  get speed(): number {
    return dot(this.body.vel, forwardFromHeading(this.body.heading));
  }

  /** Sideways speed in m/s (positive = sliding to the right of the heading). */
  get lateralSpeed(): number {
    return dot(this.body.vel, perpRight(forwardFromHeading(this.body.heading)));
  }

  /** Ground speed in km/h from the live body velocity (forward + sideways, so a slide or a shove still reads). For the HUD. */
  get speedKmh(): number {
    return hyp(this.body.vel.x, this.body.vel.z) * 3.6;
  }

  /**
   * Seconds the player has been pushing the throttle into something that will not give (held throttle, almost no speed,
   * touching a body), kept while the push-out nudges the car free. 0 when moving freely. The HUD shows a hint at 1.5 s.
   */
  get blockedSeconds(): number { return this._blockedSeconds; }

  /** 0..1 tyre slip (for squeal audio / skid effects): 0 = gripping, 1 = fully sliding. */
  get slip(): number { return this.slipAmt; }

  /** Current front-wheel steer angle in radians (positive = right). Rate limited, so it never jumps. */
  get steering(): number { return this.steerAngle; }

  /** Night lights: head 4.0 / tail 1.5 emissive when on, 0 when off. Brake lights override the tail while braking. */
  get headlights(): boolean { return this._headlights; }
  set headlights(on: boolean) {
    this._headlights = on;
    this.applyLights();
  }

  setInput(input: VehicleInput): void {
    this.input = { ...input };
  }

  /** Driver's door: on the left flank, 0.3 m outside the body. */
  doorPos(): Vec2 {
    const right = perpRight(forwardFromHeading(this.body.heading));
    const off = this.spec.width / 2 + 0.3;
    return { x: this.body.pos.x - right.x * off, z: this.body.pos.z - right.z * off };
  }

  /** Allocation-free doorPos() for per-frame prompts. */
  doorPosInto(out: Vec2): Vec2 {
    const h = this.body.heading, off = this.spec.width / 2 + 0.3;
    // right = perpRight(forward) = (cos h, sin h); the door is on the left
    out.x = this.body.pos.x - Math.cos(h) * off;
    out.z = this.body.pos.z - Math.sin(h) * off;
    return out;
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    const b = this.body;
    this.prevPos.x = b.pos.x; this.prevPos.z = b.pos.z; this.prevHeading = b.heading;
    this.time += dt;
    if (this.settled) {
      if (this.driver === null && b.vel.x === 0 && b.vel.z === 0 && b.pos.x === this.setX && b.pos.z === this.setZ && b.heading === this.setH && this.damage === this.setDamage) return;
      this.settled = false; this.settleCount = 0;
    }
    this.shakeRequested *= Math.exp(-SHAKE_DECAY * dt);
    if (this.shakeRequested < 0.005) this.shakeRequested = 0;

    let rem = dt;
    while (rem > 1e-9) {
      const h = Math.min(rem, MAX_STEP);
      this.integrate(h);
      rem -= h;
    }
    const input = this.driver !== null ? this.input : NEUTRAL;

    // horn on rising edge
    if (input.horn && !this.prevHorn) this.events.emit('horn', { pos: { x: b.pos.x, z: b.pos.z } });
    this.prevHorn = input.horn;

    this.springs(dt);
    this.animate(dt, this.speed);
    applyPose(this.object3D, b.pos, b.heading);
    this.checkSettled();
  }

  /** After five consecutive fully-at-rest parked steps the car stops costing CPU (no springs, wheels, pose writes). */
  private checkSettled(): void {
    const b = this.body, E = 1e-4;
    const rest = this.driver === null && b.vel.x === 0 && b.vel.z === 0 && !this.siren && this.shakeRequested === 0 &&
      Math.abs(this.roll) < E && Math.abs(this.pitch) < E && Math.abs(this.bounce) < E &&
      Math.abs(this.rollV) < E && Math.abs(this.pitchV) < E && Math.abs(this.bounceV) < E &&
      Math.abs(this.aLongF) < E && Math.abs(this.aLatF) < E && Math.abs(this.steerNorm) < E && this.yawRate === 0 && !this.braking;
    if (!rest) { this.settleCount = 0; return; }
    if (++this.settleCount < 5) return;
    this.settled = true; this.setX = b.pos.x; this.setZ = b.pos.z; this.setH = b.heading; this.setDamage = this.damage;
  }

  /** Pose the mesh between the previous and current simulation state (alpha 0..1); teleports snap. */
  applyInterpolated(alpha: number): void {
    const b = this.body;
    const a = clamp(alpha, 0, 1);
    const jump = hyp(b.pos.x - this.prevPos.x, b.pos.z - this.prevPos.z) > 8;
    if (jump) { applyPose(this.object3D, b.pos, b.heading); return; }
    const pos = { x: this.prevPos.x + (b.pos.x - this.prevPos.x) * a, z: this.prevPos.z + (b.pos.z - this.prevPos.z) * a };
    applyPose(this.object3D, pos, this.prevHeading + angleDiff(this.prevHeading, b.heading) * a);
  }

  /** The static body (pole, wall) touched within the last 0.25 s, else null. Lets the AI tell a thin pole from a car in its way. */
  recentStaticContact(): Body2D | null {
    return this.time - this.staticContactTime < 0.25 ? this.staticContact : null;
  }

  onContact(contact: Contact, other: Body2D): void {
    if (other.kind === 'static' || other.mass === Infinity) { this.staticContact = other; this.staticContactTime = this.time; }
    if (this.driver === 'player') {
      this.noteContact(contact);
      this.slideOffProp(contact, other);
    }
    if (contact.impulse < IMPACT_MIN) return;
    // A car sliding along a wall (or a pedestrian pressed against it) re-touches it every frame with a slowly
    // changing impulse: a repeat within SCRAPE_WINDOW is a scrape (5% of the damage, no new impact event) unless
    // it is genuinely harder than the hit that opened the window. lastHitTime is refreshed on every contact, so a
    // continuous press never leaves the window.
    const scrape = this.time - this.lastHitTime < SCRAPE_WINDOW &&
      contact.impulse <= this.lastHitImpulse * SCRAPE_ESCALATE + SCRAPE_ESCALATE_ADD;
    this.lastHitTime = this.time;
    this.lastHitImpulse = scrape ? this.lastHitImpulse : contact.impulse;
    this.damage = clamp(this.damage + (contact.impulse / 40) * (scrape ? SCRAPE_DAMAGE : 1), 0, 1);
    this.reactToImpact(contact, other);
    if (scrape) return;
    // Two Vehicles both get onContact for the same contact: only the `a` side reports it.
    if (other.userData instanceof Vehicle && contact.a !== this.body) return;
    this.events.emit('impact', {
      a: contact.a.id, b: contact.b.id, strength: contact.impulse, pos: { x: contact.point.x, z: contact.point.z },
    });
  }

  dispose(): void {
    this.object3D.removeFromParent();
    for (const m of this.ownMaterials) m.dispose();
    this.ownMaterials.length = 0;
    for (const d of this.dentGeos) d.mesh.geometry.dispose(); // clones only; originals are shared per type
    this.dentGeos.length = 0;
    // geometries are shared per type (see carModel cache) and must not be disposed here
  }

  // ------------------------------------------------------------------ dynamics

  private integrate(h: number): void {
    const b = this.body;
    const s = this.spec;
    const driven = this.driver !== null;

    if (!driven) { this.integrateParked(h); return; }
    const input = this.input;
    const unstick = this.driver === 'player' && Vehicle.wedgeAssist ? this.updateWedge(h) : null;

    const f0 = forwardFromHeading(b.heading);
    const r0 = perpRight(f0);
    let vLong = dot(b.vel, f0);
    const vLong0 = vLong;
    const A = s.accel, vm = s.maxSpeed;
    let thr = clamp(input.throttle, -1, 1);
    if (unstick !== null) thr = unstick; // reverse assist while the push-out runs

    // --- brake pedal (ramped: no instant stop)
    const oppose = !input.brake && thr * vLong < 0 && Math.abs(vLong) > 0.5;
    const pedalTarget = input.brake ? 1 : oppose ? OPPOSE_BRAKE : 0;
    const pr = pedalTarget > this.brakePressure ? BRAKE_APPLY : BRAKE_RELEASE;
    this.brakePressure += (pedalTarget - this.brakePressure) * Math.min(1, pr * h);
    if (this.brakePressure < 0.01 && pedalTarget === 0) this.brakePressure = 0;

    const shed = (amount: number) => {
      const d = Math.min(Math.abs(vLong), amount * h);
      vLong -= Math.sign(vLong) * d;
    };
    if (this.brakePressure > 0) {
      // ABS-like: pedal force is capped by tyre grip and eased off near standstill
      const ease = 0.35 + 0.65 * Math.min(1, Math.abs(vLong) / 2.5);
      shed(s.brakeDecel * Math.min(1, this.grip) * this.brakePressure * ease);
    }
    if (input.handbrake) shed(s.brakeDecel * HANDBRAKE_DECEL_FRAC);

    // --- thrust: a = A * (throttle - (v/vmax)^2), so torque falls with speed and drag is built in
    const drive = !input.brake && !oppose && thr !== 0;
    if (drive) {
      const d = Math.sign(thr);
      const u = Math.max(0, d * vLong);
      const vmD = d > 0 ? vm : REVERSE_MAX;
      const AD = d > 0 ? A : A * REVERSE_ACCEL_FRAC;
      const ratio = Math.min(1.5, u / vmD);
      vLong += d * AD * (Math.abs(thr) - ratio * ratio) * h;
    } else {
      // coasting: aerodynamic drag + engine braking
      const drag = A * (vLong / vm) * Math.abs(vLong / vm);
      const eb = input.brake ? 0 : ENGINE_BRAKE * Math.min(1, Math.abs(vLong) / 2);
      const total = Math.abs(drag) + eb;
      shed(total);
    }
    vLong = clamp(vLong, -REVERSE_MAX, vm);
    if (!drive && !input.handbrake && Math.abs(vLong) < 0.06) vLong = 0;
    const aLong = (vLong - vLong0) / h;
    const speedAbs = Math.abs(vLong);

    const braking = input.brake || oppose || input.handbrake; // lights follow the driver, not the ramping pedal
    if (braking !== this.braking) { this.braking = braking; this.applyLights(); }

    // --- steering: rate limited, speed sensitive, returns to centre
    const steerIn = clamp(input.steer, -1, 1);
    const returning = Math.abs(steerIn) < Math.abs(this.steerNorm) && steerIn * this.steerNorm >= 0;
    const sRate = (STEER_RATE / (1 + speedAbs / STEER_SPEED_REF)) * (returning ? STEER_RETURN_MULT : 1);
    const dSteer = steerIn - this.steerNorm;
    this.steerNorm += clamp(dSteer, -sRate * h, sRate * h);
    const hb = input.handbrake;
    const wheelbase = 0.6 * s.length;
    let lock = s.maxSteer * (1 - STEER_SPEED_SHRINK * Math.min(1, speedAbs / vm));
    // player-driven cars only: the traffic / cop AI is tuned against the raw lock
    if (Vehicle.calmSteering && this.driver === 'player' && !(hb && speedAbs > 3)) {
      const t = clamp((speedAbs - LOW_YAW_SPEED) / (HIGH_YAW_SPEED - LOW_YAW_SPEED), 0, 1);
      const cap = LOW_YAW_CAP + (HIGH_YAW_CAP - LOW_YAW_CAP) * t * t * (3 - 2 * t);
      lock = Math.min(lock, Math.atan((cap * wheelbase) / Math.max(speedAbs, 0.1)));
    }
    this.steerAngle = this.steerNorm * lock;

    // --- yaw: kinematic bicycle, clipped by front grip (understeer), boosted with the handbrake
    const kin = (vLong / wheelbase) * Math.tan(this.steerAngle) * (hb && speedAbs > 3 ? HANDBRAKE_YAW_BOOST : 1);
    const yawMax = ((MU_FRONT * this.grip) / Math.max(speedAbs, 2)) * (hb ? 1.6 : 1);
    const yawTarget = clamp(kin, -yawMax, yawMax);
    this.yawRate += clamp(yawTarget - this.yawRate, -YAW_ACCEL * h, YAW_ACCEL * h);
    // while crawling to a stop the car cannot keep rotating on the spot
    if (speedAbs < 0.3) this.yawRate *= Math.max(0, 1 - 10 * h);

    // world velocity (old basis) then re-expressed in the rotated basis
    const vLat0 = dot(b.vel, r0);
    const wx = f0.x * vLong + r0.x * vLat0;
    const wz = f0.z * vLong + r0.z * vLat0;
    b.heading = wrapAngle(b.heading + this.yawRate * h);
    const f1 = forwardFromHeading(b.heading);
    const r1 = perpRight(f1);
    const vLongN = wx * f1.x + wz * f1.z;
    let vLat = wx * r1.x + wz * r1.z;
    const vLatBefore = vLat;

    // --- rear tyres: lateral grip. Handbrake locks them, high-speed throttle + lock gives power oversteer.
    let rear = MU_REAR * this.grip;
    if (hb) rear *= HANDBRAKE_REAR_FRAC;
    else if (speedAbs > OVERSTEER_SPEED_FRAC * vm && thr > 0.6 && Math.abs(this.steerNorm) > 0.6) rear *= OVERSTEER_REAR_FRAC;
    this.rearGrip += (rear - this.rearGrip) * Math.min(1, 14 * h);
    const bleed = Math.min(Math.abs(vLat), Math.min(K_LAT * Math.abs(vLat), this.rearGrip) * h);
    vLat -= Math.sign(vLat) * bleed;

    b.vel.x = f1.x * vLongN + r1.x * vLat;
    b.vel.z = f1.z * vLongN + r1.z * vLat;
    b.pos.x += b.vel.x * h;
    b.pos.z += b.vel.z * h;

    // measured accelerations drive the chassis springs; slip drives squeal
    const aLat = (vLat - vLatBefore) / h;
    const k = Math.min(1, 14 * h);
    this.aLongF += (aLong - this.aLongF) * k;
    this.aLatF += (aLat - this.aLatF) * k;
    const slipNow = clamp((Math.abs(vLat) - 0.7) / 3.5, 0, 1);
    this.slipAmt += (slipNow - this.slipAmt) * Math.min(1, 10 * h);
  }

  /** True for a thin static prop (pole, hydrant, tree, bollard) that a car should slide off. */
  private static isSmallProp(other: Body2D): boolean {
    return (other.kind === 'static' || other.mass === Infinity) && other.shape.kind === 'circle' && other.shape.r <= PROP_MAX_R;
  }

  /**
   * A player-driven car touching a small static prop at low speed is deflected sideways (away from the side of the
   * car the prop is on) and its nose is turned off it, so it rolls round the prop instead of pinning against it.
   */
  private slideOffProp(contact: Contact, other: Body2D): void {
    if (!Vehicle.isSmallProp(other)) return;
    const b = this.body;
    if (hyp(b.vel.x, b.vel.z) > PROP_SLIDE_MAX_SPEED) return;
    const sgn = contact.a === b ? 1 : -1;
    const nx = contact.normal.x * sgn, nz = contact.normal.z * sgn; // toward the prop
    const f = forwardFromHeading(b.heading);
    const r = perpRight(f);
    const lat = (other.pos.x - b.pos.x) * r.x + (other.pos.z - b.pos.z) * r.z; // + = prop on the right
    const side = Math.abs(lat) > 0.05 ? (lat > 0 ? -1 : 1) : (this.unstickCount++ % 2 === 0 ? 1 : -1);
    // tangent to the contact, on the chosen side of the car
    let tx = -nz, tz = nx;
    if (tx * r.x + tz * r.z > 0 === side < 0) { tx = -tx; tz = -tz; }
    const have = b.vel.x * tx + b.vel.z * tz;
    if (have < PROP_SLIDE_SPEED) { b.vel.x += tx * (PROP_SLIDE_SPEED - have); b.vel.z += tz * (PROP_SLIDE_SPEED - have); }
    const into = nx * f.x + nz * f.z > 0; // prop is ahead: turn the nose away from it
    b.heading = wrapAngle(b.heading + side * (into ? 1 : -1) * PROP_SLIDE_YAW * (1 / 60));
  }

  /** Remember what the car touched and from which side (for the wedge push-out). */
  private noteContact(contact: Contact): void {
    const b = this.body;
    const sgn = contact.a === b ? 1 : -1;
    this.lastContactTime = this.time;
    this.contactAway.x = -contact.normal.x * sgn;
    this.contactAway.z = -contact.normal.z * sgn;
    const r = perpRight(forwardFromHeading(b.heading));
    this.contactLat = (contact.point.x - b.pos.x) * r.x + (contact.point.z - b.pos.z) * r.z;
  }

  /**
   * Wedge detection for the player's car. Holding the throttle (> WEDGE_AFTER s) into a body at under WEDGE_SPEED
   * eases the car away from the contact: a gentle velocity along the contact normal, a reverse-assist throttle and a
   * small turn so the next try clears the obstacle. Returns the throttle override while that runs, else null.
   */
  private updateWedge(h: number): number | null {
    const b = this.body;
    const input = this.input;
    const held = Math.abs(input.throttle) > WEDGE_THROTTLE && !input.brake;
    const vAbs = hyp(b.vel.x, b.vel.z);
    const touching = this.time - this.lastContactTime < WEDGE_CONTACT_AGE;
    // blockedSeconds (HUD hint): throttle held, crawling, and recently in contact
    if (!held) {
      this.throttleIdle += h;
      if (this.throttleIdle > 0.4) this._blockedSeconds = 0;
    } else {
      this.throttleIdle = 0;
      if ((vAbs > BLOCKED_MAX_SPEED && this.time - this.lastUnstickTime > 3) || this.time - this.lastContactTime > BLOCKED_FREE_AFTER) this._blockedSeconds = 0;
      else if ((touching && vAbs < BLOCKED_MAX_SPEED) || this._blockedSeconds > 0) this._blockedSeconds += h;
    }
    if (this.unstickLeft > 0) {
      this.unstickLeft = Math.max(0, this.unstickLeft - h);
      b.heading = wrapAngle(b.heading + this.unstickSign * (UNSTICK_YAW / UNSTICK_TIME) * h);
      const f = forwardFromHeading(b.heading);
      return dot(this.contactAway, f) >= 0 ? UNSTICK_THROTTLE : -UNSTICK_THROTTLE;
    }
    if (held && vAbs < WEDGE_SPEED && Math.abs(this.speed) < WEDGE_SPEED) {
      if (touching) { this.wedgeTimer += h; this.wedgeGap = 0; }
      else if ((this.wedgeGap += h) > 0.3) this.wedgeTimer = 0;
    } else { this.wedgeTimer = 0; this.wedgeGap = 0; }
    if (this.wedgeTimer < WEDGE_AFTER) return null;
    // wedged: push out. Turn the nose away from the side that is touching (alternate sides when it is dead centre).
    this.wedgeTimer = 0; this.wedgeGap = 0;
    this.unstickLeft = UNSTICK_TIME;
    this.unstickCount++;
    this.lastUnstickTime = this.time;
    const f = forwardFromHeading(b.heading);
    const into = dot(this.contactAway, f) < 0; // contact is ahead: back away, nose turns away from the touching side
    const lat = this.contactLat;
    this.unstickSign = Math.abs(lat) > 0.25 ? (lat > 0 ? -1 : 1) * (into ? 1 : -1) : (this.unstickCount % 2 === 0 ? 1 : -1);
    b.vel.x += this.contactAway.x * UNSTICK_SPEED;
    b.vel.z += this.contactAway.z * UNSTICK_SPEED;
    return dot(this.contactAway, f) >= 0 ? UNSTICK_THROTTLE : -UNSTICK_THROTTLE;
  }

  private integrateParked(h: number): void {
    const b = this.body;
    // relax controls and chassis; friction (not a hard zero) slows a nudged car
    this.steerNorm *= Math.max(0, 1 - 6 * h);
    this.steerAngle = this.steerNorm * this.spec.maxSteer;
    this.yawRate = 0;
    this.brakePressure = 0;
    this.slipAmt *= Math.max(0, 1 - 8 * h);
    this.aLongF *= Math.max(0, 1 - 8 * h);
    this.aLatF *= Math.max(0, 1 - 8 * h);
    if (this.braking) { this.braking = false; this.applyLights(); }
    const sp = hyp(b.vel.x, b.vel.z);
    if (sp > 0) {
      const ns = sp - (PARKED_FRICTION + PARKED_DRAG * sp) * h;
      if (ns < PARKED_STICK) { b.vel.x = 0; b.vel.z = 0; }
      else { const q = ns / sp; b.vel.x *= q; b.vel.z *= q; }
    }
    b.pos.x += b.vel.x * h;
    b.pos.z += b.vel.z * h;
  }

  /** Wall scrub, alignment with the wall, camera shake and suspension kick. */
  private reactToImpact(contact: Contact, other: Body2D): void {
    const b = this.body;
    const sgn = contact.a === b ? 1 : -1;
    const nx = contact.normal.x * sgn, nz = contact.normal.z * sgn; // points toward `other`
    const closing = contact.impulse;
    const isStatic = other.kind === 'static' || other.mass === Infinity;

    if (isStatic) {
      // World2D removed the normal component; scrub the tangential one by Coulomb wall friction
      const vn = b.vel.x * nx + b.vel.z * nz;
      let tx = b.vel.x - nx * vn, tz = b.vel.z - nz * vn;
      const st = hyp(tx, tz);
      if (st > 1e-4) {
        const keep = Math.max(0, st - WALL_FRICTION * (Vehicle.isSmallProp(other) ? PROP_FRICTION_SCALE : 1) * closing) / st;
        tx *= keep; tz *= keep;
        b.vel.x = tx + nx * Math.min(0, vn);
        b.vel.z = tz + nz * Math.min(0, vn);
        // a glancing hit swings the car round to run along the wall
        const stNew = st * keep;
        if (stNew > 2) {
          const f = forwardFromHeading(b.heading);
          const want = headingFromVec({ x: tx, z: tz }) + (tx * f.x + tz * f.z < 0 ? Math.PI : 0);
          b.heading = wrapAngle(b.heading + clamp(angleDiff(b.heading, want) * WALL_ALIGN, -0.15, 0.15));
        }
      }
    }

    // camera shake: only meaningful hits against something heavy
    if (closing > SHAKE_MIN_CLOSING && (isStatic || other.mass >= 300)) {
      const sh = clamp((closing - SHAKE_MIN_CLOSING) / (SHAKE_FULL_CLOSING - SHAKE_MIN_CLOSING), 0.1, 1);
      this.shakeRequested = Math.max(this.shakeRequested, sh);
    }

    // suspension kick: the body bounces down then rebounds; nose dips towards the hit
    const kick = clamp(closing * 0.12, 0, 1.6);
    this.bounceV -= kick;
    const f = forwardFromHeading(b.heading);
    this.pitchV += clamp(closing * 0.05, 0, 0.5) * (nx * f.x + nz * f.z > 0 ? -1 : 1);

    // remember where it hurt (car-local) for dent weighting
    const dx = contact.point.x - b.pos.x, dz = contact.point.z - b.pos.z;
    const r = perpRight(f);
    this.hitLocal = { x: dx * r.x + dz * r.z, z: -(dx * f.x + dz * f.z) }; // x right, z back (three local axes)
  }

  // ------------------------------------------------------------------ mesh

  private buildMesh(): void {
    this.model = Vehicle.sources[this.spec.type]?.instantiate(this.spec) ?? buildCarModel(this.spec.type, this.spec, this.materials, (this.seed >>> 0) % 4);
    this.wheelRadius = this.model.wheelRadius;
    this.ownMaterials.push(...this.model.ownMaterials);
    this.chassis.add(this.model.group);
    this.applyLights();
  }

  private applyLights(): void {
    const m = this.model;
    if (!m) return;
    const on = this._headlights;
    const head = on ? HEAD_ON : 0;
    const tail = this.braking ? TAIL_BRAKE : on ? TAIL_ON : 0;
    for (const l of m.headlights) (l.material as THREE.MeshStandardMaterial).emissiveIntensity = head;
    for (const l of m.taillights) (l.material as THREE.MeshStandardMaterial).emissiveIntensity = tail;
  }

  /** Spring-damped body roll / pitch / bounce driven by the measured accelerations. */
  private springs(dt: number): void {
    const sc = Math.min(1.6, this.spec.height / 1.4);
    const rollT = clamp(-this.aLatF * ROLL_PER_ACCEL * sc, -0.1, 0.1);
    const pitchT = clamp(this.aLongF * PITCH_PER_ACCEL * sc, -0.08, 0.08);
    let rem = dt;
    while (rem > 1e-9) {
      const h = Math.min(rem, 1 / 120);
      rem -= h;
      this.rollV += (-TILT_K * (this.roll - rollT) - TILT_C * this.rollV) * h;
      this.roll += this.rollV * h;
      this.pitchV += (-TILT_K * (this.pitch - pitchT) - TILT_C * this.pitchV) * h;
      this.pitch += this.pitchV * h;
      this.bounceV += (-BOUNCE_K * this.bounce - BOUNCE_C * this.bounceV) * h;
      this.bounce += this.bounceV * h;
    }
    this.bounce = clamp(this.bounce, -BOUNCE_MAX, BOUNCE_MAX);
    this.roll = clamp(this.roll, -0.15, 0.15);
    this.pitch = clamp(this.pitch, -0.12, 0.12);
    this.chassis.rotation.set(this.pitch, 0, this.roll);
    this.chassis.position.y = this.bounce;
  }

  private updateDents(): void {
    const dent = this.damage > DENT_START;
    if (!dent && this.dentGeos.length === 0) return;
    if (Math.abs(this.damage - this.dentDamage) < 0.04 && !(dent && this.dentGeos.length === 0)) return;
    this.dentDamage = this.damage;
    if (!dent) {
      for (const d of this.dentGeos) {
        const clone = d.mesh.geometry;
        d.mesh.geometry = d.orig;
        clone.dispose();
      }
      this.dentGeos.length = 0;
      return;
    }
    if (this.dentGeos.length === 0) {
      for (const mesh of this.model.paintMeshes) {
        const pos = mesh.geometry.getAttribute('position');
        if (!pos || !(pos.array instanceof Float32Array) || (pos as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
        const clone = mesh.geometry.clone();
        this.dentGeos.push({ mesh, orig: mesh.geometry, base: Float32Array.from(pos.array) });
        mesh.geometry = clone;
      }
    }
    const amp = Math.min(1, (this.damage - DENT_START) / (1 - DENT_START)) * DENT_MAX;
    const hx = this.hitLocal.x, hz = this.hitLocal.z;
    for (const d of this.dentGeos) {
      const attr = d.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array, base = d.base;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i], y = base[i + 1], z = base[i + 2];
        const dx = x - hx, dz = z - hz;
        const w = 0.35 + 0.65 * Math.exp(-(dx * dx + dz * dz) / (2 * 1.5 * 1.5));
        // low panels / wheels' arches dent less than the roof line; lower the weight near the ground
        const hgt = Math.min(1, Math.max(0.25, y / 0.9));
        const a = amp * w * hgt;
        const rx = hash01(x, y, z, this.seed) - 0.5, ry = hash01(x, y, z, this.seed + 1) - 0.5, rz = hash01(x, y, z, this.seed + 2) - 0.5;
        arr[i] = x + rx * 2 * a;
        arr[i + 1] = y + ry * 2 * a * 0.6;
        arr[i + 2] = z + rz * 2 * a;
      }
      attr.needsUpdate = true;
      d.mesh.geometry.computeVertexNormals();
      d.mesh.geometry.computeBoundingSphere();
    }
  }

  private updateDamageVisual(): void {
    const m = this.model;
    const wrecked = this.damage > DAMAGE_VISUAL;
    if (m.hood) {
      const t = wrecked ? HOOD_LIFT * Math.min(1, (this.damage - DAMAGE_VISUAL) * 3) : 0;
      m.hood.rotation.x = t;
    }
    this.updateDents();
    if (wrecked === this.paintDamaged) return;
    this.paintDamaged = wrecked;
    if (wrecked) {
      const clones = new Map<THREE.Material, THREE.Material>();
      for (const mesh of m.paintMeshes) {
        const src = mesh.material as THREE.Material;
        let c = clones.get(src);
        if (!c) {
          c = src.clone();
          const col = (c as THREE.MeshStandardMaterial).color;
          if (col) col.multiplyScalar(0.55);
          clones.set(src, c);
          this.ownMaterials.push(c);
        }
        mesh.userData.origMaterial = src;
        mesh.material = c;
      }
    } else {
      for (const mesh of m.paintMeshes) {
        const o = mesh.userData.origMaterial as THREE.Material | undefined;
        if (o) mesh.material = o;
      }
    }
  }

  private animate(dt: number, speed: number): void {
    this.wheelRoll -= (speed * dt) / this.wheelRadius;
    for (const p of this.model.wheels) p.rotation.x = this.wheelRoll;
    for (const p of this.model.steerPivots) p.rotation.y = -this.steerAngle;

    this.updateDamageVisual();

    const bar = this.model.lightbar;
    if (bar) {
      const a = bar.red.material as THREE.MeshStandardMaterial;
      const b = bar.blue.material as THREE.MeshStandardMaterial;
      if (this.siren) {
        const phase = Math.floor(this.time * SIREN_FLIPS_PER_SEC) % 2 === 0;
        a.emissive.setHex(phase ? RED : BLUE);
        b.emissive.setHex(phase ? BLUE : RED);
        a.emissiveIntensity = b.emissiveIntensity = 2;
      } else {
        a.emissive.setHex(0x000000);
        b.emissive.setHex(0x000000);
        a.emissiveIntensity = b.emissiveIntensity = 0;
      }
    }
  }
}
