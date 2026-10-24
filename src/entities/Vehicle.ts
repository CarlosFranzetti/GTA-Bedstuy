import * as THREE from 'three';
import { buildCarModel, type CarModel } from '@/entities/models/carModel';
import type { VehicleSources } from '@/entities/models/gltf/VehicleSource';
import {
  applyPose, clamp, dot, forwardFromHeading, perpRight, wrapAngle, type Vec2,
} from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type {
  Body2D, Contact, IMaterialLibrary, IVehicle, VehicleInput, VehicleSpec, VehicleType,
} from '@/world/types';

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  sedan: { type: 'sedan', length: 4.6, width: 1.8, height: 1.4, maxSpeed: 30, accel: 8, brakeDecel: 14, maxSteer: 0.6, color: '#8a8f98' },
  suv: { type: 'suv', length: 4.9, width: 2.0, height: 1.8, maxSpeed: 27, accel: 7, brakeDecel: 14, maxSteer: 0.6, color: '#2c3e50' },
  boxtruck: { type: 'boxtruck', length: 7, width: 2.4, height: 3.2, maxSpeed: 20, accel: 4, brakeDecel: 14, maxSteer: 0.6, color: '#e8e8e8' },
  cop: { type: 'cop', length: 4.6, width: 1.8, height: 1.4, maxSpeed: 33, accel: 9, brakeDecel: 14, maxSteer: 0.6, color: '#f2f2f2' },
};

/** Plan says 0.4, but with that value a sedan only reaches 0.78*maxSpeed in 6 s and a boxtruck can never reach 0.8*maxSpeed. */
const DRAG_K = 0.2;
const REVERSE_MAX = 8;
const GRIP = 0.92;
const GRIP_HANDBRAKE = 0.6;
const HANDBRAKE_DECEL_FRAC = 0.35;
const IMPACT_MIN = 0.5;
const SIREN_FLIPS_PER_SEC = 8; // lightbar swaps colours 8 times/s = a 4 Hz red/blue cycle
const RED = 0xff1010;
const BLUE = 0x1030ff;

const NEUTRAL: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };

const HEAD_ON = 4.0;
const TAIL_ON = 1.5;
const TAIL_BRAKE = 3.0;
const DAMAGE_VISUAL = 0.5;
const HOOD_LIFT = 0.12;

export class Vehicle implements IVehicle {
  /** Optional real car models (GLB) per type; see src/assets/models/README.md. Set once at boot. */
  static sources: VehicleSources = {};
  readonly spec: VehicleSpec;
  readonly body: Body2D;
  readonly object3D: THREE.Group;
  damage = 0;
  driver: 'player' | 'traffic' | 'cop' | null = null;
  siren = false;

  private _headlights = false;
  private braking = false;
  private paintDamaged = false;
  private model!: CarModel;
  private input: VehicleInput = { ...NEUTRAL };
  private prevHorn = false;
  private time = 0;
  private steerAngle = 0;
  private wheelRoll = 0;
  private wheelRadius = 0.34;
  private readonly ownMaterials: THREE.Material[] = [];

  constructor(
    readonly id: string,
    spec: VehicleSpec,
    pos: Vec2,
    heading: number,
    private materials: IMaterialLibrary,
    private events: EventBus,
  ) {
    this.spec = spec;
    this.body = {
      id,
      kind: spec.type === 'cop' ? 'cop' : 'vehicle',
      shape: { kind: 'obb', halfW: spec.width / 2, halfL: spec.length / 2 },
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      heading,
      mass: spec.type === 'boxtruck' ? 3500 : 1400,
      userData: this,
    };
    this.object3D = new THREE.Group();
    this.object3D.name = `vehicle:${id}`;
    this.buildMesh();
    applyPose(this.object3D, this.body.pos, this.body.heading);
  }

  /** Forward speed in m/s (negative when reversing), read live from the body so physics nudges are honoured. */
  get speed(): number {
    return dot(this.body.vel, forwardFromHeading(this.body.heading));
  }

  /** Night lights: head 4.0 / tail 1.5 emissive when on, 0 when off. Brake lights override the tail while braking. */
  get headlights(): boolean { return this._headlights; }
  set headlights(on: boolean) {
    this._headlights = on;
    this.applyLights();
  }

  setInput(input: VehicleInput): void {
    this.input = { ...input };
  }

  doorPos(): Vec2 {
    const left = perpRight(forwardFromHeading(this.body.heading));
    return { x: this.body.pos.x - left.x * 1.2, z: this.body.pos.z - left.z * 1.2 };
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    const b = this.body;
    const s = this.spec;
    this.time += dt;
    const driven = this.driver !== null;
    const input = driven ? this.input : NEUTRAL;

    let speed = this.speed;
    let braking = false;
    const decel = (amount: number) => {
      const d = Math.min(Math.abs(speed), amount * dt);
      speed -= Math.sign(speed) * d;
    };

    const throttle = clamp(input.throttle, -1, 1);
    if (!driven) {
      decel(s.brakeDecel);
    } else if (input.brake) {
      decel(s.brakeDecel);
      braking = true;
    } else if (throttle * speed < 0 && Math.abs(speed) > 0.5) {
      decel(s.brakeDecel); // pressing the opposite direction brakes first
      braking = true;
    } else if (throttle !== 0) {
      speed += throttle * s.accel * dt;
    }
    if (input.handbrake) { decel(s.brakeDecel * HANDBRAKE_DECEL_FRAC); braking = true; }
    if (braking !== this.braking) { this.braking = braking; this.applyLights(); }
    speed -= (DRAG_K * speed * Math.abs(speed)) / s.maxSpeed * dt;
    speed = clamp(speed, -REVERSE_MAX, s.maxSpeed);
    if (!driven && Math.abs(speed) < 0.05) speed = 0;

    // steering
    const steerEff = clamp(input.steer, -1, 1) * s.maxSteer * (1 - 0.7 * Math.min(1, Math.abs(speed) / s.maxSpeed));
    const wheelbase = 0.6 * s.length;
    const yawRate = (speed / wheelbase) * Math.tan(steerEff);
    this.steerAngle = steerEff;
    b.heading = wrapAngle(b.heading + yawRate * dt);

    // velocity blends toward the forward direction (grip < 1 leaves room to drift)
    const f = forwardFromHeading(b.heading);
    const grip = input.handbrake || !driven ? GRIP_HANDBRAKE : GRIP;
    const blend = 1 - Math.pow(1 - grip, dt * 60);
    b.vel.x += (f.x * speed - b.vel.x) * blend;
    b.vel.z += (f.z * speed - b.vel.z) * blend;
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;

    // horn on rising edge
    if (input.horn && !this.prevHorn) this.events.emit('horn', { pos: { x: b.pos.x, z: b.pos.z } });
    this.prevHorn = input.horn;

    this.animate(dt, speed);
    applyPose(this.object3D, b.pos, b.heading);
  }

  onContact(contact: Contact, other: Body2D): void {
    if (contact.impulse < IMPACT_MIN) return;
    this.damage = clamp(this.damage + contact.impulse / 40, 0, 1);
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
    // geometries are shared per type (see carModel cache) and must not be disposed here
  }

  // ------------------------------------------------------------------ mesh

  private buildMesh(): void {
    this.model = Vehicle.sources[this.spec.type]?.instantiate(this.spec) ?? buildCarModel(this.spec.type, this.spec, this.materials);
    this.wheelRadius = this.model.wheelRadius;
    this.ownMaterials.push(...this.model.ownMaterials);
    this.object3D.add(this.model.group);
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

  private updateDamageVisual(): void {
    const m = this.model;
    const wrecked = this.damage > DAMAGE_VISUAL;
    if (m.hood) {
      const t = wrecked ? HOOD_LIFT * Math.min(1, (this.damage - DAMAGE_VISUAL) * 3) : 0;
      m.hood.rotation.x = t;
    }
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
