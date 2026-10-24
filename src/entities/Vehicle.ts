import * as THREE from 'three';
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

// Shared, never-disposed resources.
const boxCache = new Map<string, THREE.BoxGeometry>();
function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(k, g); }
  return g;
}
const cylCache = new Map<string, THREE.CylinderGeometry>();
function wheelGeo(r: number, w: number): THREE.CylinderGeometry {
  const k = `${r}|${w}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2); cylCache.set(k, g); }
  return g;
}
let headMat: THREE.MeshBasicMaterial | null = null;
let tailMat: THREE.MeshBasicMaterial | null = null;
const headlightMaterial = () => (headMat ??= new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
const taillightMaterial = () => (tailMat ??= new THREE.MeshBasicMaterial({ color: 0xc01010 }));

export class Vehicle implements IVehicle {
  readonly spec: VehicleSpec;
  readonly body: Body2D;
  readonly object3D: THREE.Group;
  damage = 0;
  driver: 'player' | 'traffic' | 'cop' | null = null;
  siren = false;

  private input: VehicleInput = { ...NEUTRAL };
  private prevHorn = false;
  private time = 0;
  private steerAngle = 0;
  private wheelRoll = 0;
  private readonly wheelRadius: number;
  private readonly steerPivots: THREE.Object3D[] = [];
  private readonly rollPivots: THREE.Object3D[] = [];
  private readonly lightbar: THREE.Mesh[] = [];
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
    this.wheelRadius = spec.type === 'boxtruck' ? 0.5 : 0.34;
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
    const decel = (amount: number) => {
      const d = Math.min(Math.abs(speed), amount * dt);
      speed -= Math.sign(speed) * d;
    };

    const throttle = clamp(input.throttle, -1, 1);
    if (!driven) {
      decel(s.brakeDecel);
    } else if (input.brake) {
      decel(s.brakeDecel);
    } else if (throttle * speed < 0 && Math.abs(speed) > 0.5) {
      decel(s.brakeDecel); // pressing the opposite direction brakes first
    } else if (throttle !== 0) {
      speed += throttle * s.accel * dt;
    }
    if (input.handbrake) decel(s.brakeDecel * HANDBRAKE_DECEL_FRAC);
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
  }

  // ------------------------------------------------------------------ mesh

  private buildMesh(): void {
    const { length: L, width: W, height: H, type } = this.spec;
    const R = this.wheelRadius;
    const g = this.object3D;
    const isCop = type === 'cop';
    const isTruck = type === 'boxtruck';
    const paint = isCop ? this.materials.get('copLivery') : this.materials.carPaint(this.spec.color);
    const glass = this.materials.get('carGlass');
    const tire = this.materials.get('tire');

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name?: string): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (name) m.name = name;
      g.add(m);
      return m;
    };

    if (isTruck) {
      const chassisH = 0.5;
      add(box(W * 0.95, chassisH, L), paint, 0, R + chassisH / 2 - 0.05, 0, 'body');
      const cabL = 2.0, cabH = H * 0.62;
      add(box(W, cabH, cabL), paint, 0, R + chassisH - 0.05 + cabH / 2, -L / 2 + cabL / 2, 'cab');
      add(box(W * 0.9, cabH * 0.45, 0.06), glass, 0, R + chassisH - 0.05 + cabH * 0.65, -L / 2 + 0.03, 'windshield');
      const cargoL = L - cabL - 0.15, cargoH = H - R - chassisH + 0.05;
      add(box(W, cargoH, cargoL), this.materials.carPaint('#f4f4f4'), 0, R + chassisH - 0.05 + cargoH / 2, L / 2 - cargoL / 2, 'cargo');
    } else {
      const bodyH = H * 0.42;
      const bodyY = R + bodyH / 2 - 0.05;
      add(box(W, bodyH, L), paint, 0, bodyY, 0, 'body');
      const cabH = H * 0.4, cabL = L * (type === 'suv' ? 0.62 : 0.5);
      add(box(W * 0.9, cabH, cabL), glass, 0, bodyY + bodyH / 2 + cabH / 2, L * 0.04, 'cabin');
      add(box(W * 0.86, 0.06, cabL * 0.9), paint, 0, bodyY + bodyH / 2 + cabH + 0.03, L * 0.04, 'roof');
    }

    // wheels: steer pivot (front only) -> roll pivot -> tyre mesh
    const wheelBaseZ = L * 0.34;
    const wg = wheelGeo(R, 0.26);
    const wx = W / 2 - 0.05;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const steer = new THREE.Group();
        steer.position.set(sx * wx, R, sz * wheelBaseZ);
        const roll = new THREE.Group();
        roll.add(new THREE.Mesh(wg, tire));
        steer.add(roll);
        g.add(steer);
        this.rollPivots.push(roll);
        if (sz < 0) this.steerPivots.push(steer);
      }
    }

    // lights
    const lampY = R + (isTruck ? 0.45 : H * 0.2);
    const lampGeo = box(0.3, 0.14, 0.05);
    for (const sx of [-1, 1]) {
      add(lampGeo, headlightMaterial(), sx * (W / 2 - 0.3), lampY, -L / 2 - 0.01, 'headlight');
      add(lampGeo, taillightMaterial(), sx * (W / 2 - 0.3), lampY, L / 2 + 0.01, 'taillight');
    }

    if (isCop) {
      const barY = R + H * 0.42 + H * 0.4 + 0.2;
      for (const [i, sx] of [-1, 1].entries()) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0x000000, emissiveIntensity: 0 });
        this.ownMaterials.push(mat);
        const m = add(box(0.55, 0.14, 0.28), mat, sx * 0.32, barY, L * 0.04, i === 0 ? 'lightbarA' : 'lightbarB');
        this.lightbar.push(m);
      }
    }
  }

  private animate(dt: number, speed: number): void {
    this.wheelRoll -= (speed * dt) / this.wheelRadius;
    for (const p of this.rollPivots) p.rotation.x = this.wheelRoll;
    for (const p of this.steerPivots) p.rotation.y = -this.steerAngle;

    if (this.lightbar.length === 2) {
      const [a, b] = this.lightbar.map((m) => m.material as THREE.MeshStandardMaterial);
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
