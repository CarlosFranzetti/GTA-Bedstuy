import * as THREE from 'three';
import { angleDiff, clamp, wrapAngle, type Vec2 } from './Math2';
import type { Input } from './Input';
import type { IWorld2D } from '@/world/types';

export type CameraMode = 'foot' | 'vehicle';

/** The part of World2D the camera needs. `raycastStatic` (World2D) is preferred; plain `raycast` is the fallback. */
export type CameraWorld = Pick<IWorld2D, 'raycast'> & {
  raycastStatic?(from: Vec2, dir: Vec2, maxDist: number): { dist: number } | null;
};

/** Optional per-frame context for `ThirdPersonCamera.update`. */
export interface CameraContext {
  /** Static geometry to keep the camera out of (defaults to `camera.world`). */
  world?: CameraWorld | null;
  /** The vehicle being driven: its `speed` widens the view and its `shakeRequested` is consumed (read, then zeroed). */
  vehicle?: { readonly speed: number; shakeRequested?: number } | null;
  /** Speed in m/s when no vehicle object is at hand. */
  speed?: number;
}

const MOUSE_SENS = 0.0025;
const PITCH_MIN = -0.1;
const PITCH_MAX = 0.9;
const DEFAULT_PITCH = 0.15;
const RECENTRE_DELAY = 1.5;
const RECENTRE_RATE = 2; // rad/s
const SMOOTH = 8;        // exponential smoothing rate, 1/s
const SPEED_SMOOTH = 2.5;
const LOOK_UP = 1.2;
const MIN_CAM_Y = 0.4;
const FOOT = { distance: 5, height: 2.2 };
const VEHICLE = { distance: 8, height: 3 };
/** Vehicle mode: distance grows 8 -> 10 m and the FOV widens 60 -> 68 deg between 0 and SPEED_FULL m/s. */
const VEHICLE_DISTANCE_EXTRA = 2;
const BASE_FOV = 60;
const FOV_EXTRA = 8;
const SPEED_FULL = 30;
const SHOULDER = 0.5;
const SHAKE_TIME = 0.4;
const SHAKE_MAX = 1;
const SHAKE_POS = 0.22; // metres at amplitude 1
const SHAKE_ROLL = 0.025; // radians at amplitude 1
/** Keep the lens this far off a wall, and never closer than this to the target (horizontally). */
const WALL_MARGIN = 0.35;
const MIN_HORIZ = 0.9;
const FALLBACK_RAY_STEPS = 4;

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Heading (radians, clockwise from north) the camera looks toward. Walk "forward" = this. */
  yaw = 0;
  pitch = DEFAULT_PITCH;
  /** Static world used for wall avoidance when `update` is not handed one. */
  world: CameraWorld | null = null;

  private idle = 0;
  private distance = FOOT.distance;
  private height = FOOT.height;
  private shoulder = SHOULDER;
  private speedN = 0;
  private shake = 0;
  private clock = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly wantPos = new THREE.Vector3();
  private readonly wantLook = new THREE.Vector3();
  private readonly rayDir: Vec2 = { x: 0, z: 0 };
  private readonly rayFrom: Vec2 = { x: 0, z: 0 };
  private initialised = false;

  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 900);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Current shake amplitude 0..1 (decays to 0 over 0.4 s). */
  get shakeAmount(): number { return this.shake; }

  /** Kick the camera: amplitude 0..1; stronger hits replace weaker ones in progress. */
  addShake(amount: number): void {
    this.shake = Math.min(SHAKE_MAX, Math.max(this.shake, amount));
  }

  update(dt: number, targetPos: Vec2, targetHeading: number, mode: CameraMode, input: Input, ctx?: CameraContext): void {
    // mouse orbit
    if (input.mouseDX !== 0 || input.mouseDY !== 0) {
      this.yaw += input.mouseDX * MOUSE_SENS;
      this.pitch = clamp(this.pitch + input.mouseDY * MOUSE_SENS, PITCH_MIN, PITCH_MAX);
      this.idle = 0;
    } else {
      this.idle += dt;
    }

    // auto-recentre behind the vehicle
    if (mode === 'vehicle' && this.idle > RECENTRE_DELAY) {
      const diff = angleDiff(this.yaw, targetHeading);
      const step = RECENTRE_RATE * dt;
      this.yaw += clamp(diff, -step, step);
    }
    this.yaw = wrapAngle(this.yaw);

    // impacts: consume the vehicle's request, decay linearly over SHAKE_TIME
    const veh = ctx?.vehicle ?? null;
    if (veh && veh.shakeRequested !== undefined && veh.shakeRequested > 0) {
      this.addShake(veh.shakeRequested);
      veh.shakeRequested = 0;
    }
    this.clock += dt;
    this.shake = Math.max(0, this.shake - (SHAKE_MAX / SHAKE_TIME) * dt);

    const k = this.initialised ? 1 - Math.exp(-SMOOTH * dt) : 1;
    const kSpeed = this.initialised ? 1 - Math.exp(-SPEED_SMOOTH * dt) : 1;
    const speed = mode === 'vehicle' ? Math.abs(veh ? veh.speed : ctx?.speed ?? 0) : 0;
    this.speedN += (clamp(speed / SPEED_FULL, 0, 1) - this.speedN) * kSpeed;

    const want = mode === 'vehicle' ? VEHICLE : FOOT;
    const wantDistance = want.distance + (mode === 'vehicle' ? VEHICLE_DISTANCE_EXTRA * this.speedN : 0);
    this.distance += (wantDistance - this.distance) * k;
    this.height += (want.height - this.height) * k;
    this.shoulder += ((mode === 'foot' ? SHOULDER : 0) - this.shoulder) * k;

    const fov = BASE_FOV + FOV_EXTRA * this.speedN;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // over-the-right-shoulder offset (on foot), perpendicular to the view direction
    const bx = Math.sin(this.yaw), bz = -Math.cos(this.yaw); // forwardFromHeading without the allocation
    const sx = -bz * this.shoulder, sz = bx * this.shoulder;
    const horiz = this.distance * Math.cos(this.pitch);
    this.wantPos.set(
      targetPos.x + sx - bx * horiz,
      Math.max(MIN_CAM_Y, this.height + this.distance * Math.sin(this.pitch)),
      targetPos.z + sz - bz * horiz,
    );
    this.wantLook.set(targetPos.x + sx, LOOK_UP, targetPos.z + sz);

    this.pos.lerp(this.wantPos, k);
    this.look.lerp(this.wantLook, k);
    this.initialised = true;

    const world = ctx?.world ?? this.world;
    if (world) this.avoidWalls(world, targetPos);

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);

    if (this.shake > 0) {
      const a = this.shake * this.shake * (3 - 2 * this.shake); // ease so the tail is gentle
      const t = this.clock;
      this.camera.translateX((Math.sin(t * 61) + 0.6 * Math.sin(t * 107)) * SHAKE_POS * a);
      this.camera.translateY((Math.sin(t * 73 + 1.3) + 0.6 * Math.sin(t * 131)) * SHAKE_POS * a);
      this.camera.rotateZ(Math.sin(t * 83 + 0.4) * SHAKE_ROLL * a);
    }
  }

  /** Pull `this.pos` in along the ground-plane ray target -> camera if a static polygon is in the way. */
  private avoidWalls(world: CameraWorld, target: Vec2): void {
    const dx = this.pos.x - target.x, dz = this.pos.z - target.z;
    const d = Math.hypot(dx, dz);
    if (d < MIN_HORIZ) return;
    this.rayDir.x = dx / d; this.rayDir.z = dz / d;
    const hitDist = this.firstStaticHit(world, target, d + WALL_MARGIN); // look a margin past the lens
    if (hitDist === null) return;
    const nd = Math.max(MIN_HORIZ, hitDist - WALL_MARGIN);
    if (nd >= d) return;
    const s = nd / d;
    this.pos.x = target.x + dx * s;
    this.pos.z = target.z + dz * s;
    // keep the viewing angle: bring the height in with the distance (never below the ground clamp)
    this.pos.y = Math.max(MIN_CAM_Y, this.look.y + (this.pos.y - this.look.y) * s);
  }

  /** Distance along `rayDir` to the first STATIC body within maxDist, or null. Vehicles and peds are ignored. */
  private firstStaticHit(world: CameraWorld, from: Vec2, maxDist: number): number | null {
    if (world.raycastStatic) {
      const h = world.raycastStatic(from, this.rayDir, maxDist);
      return h ? h.dist : null;
    }
    // generic worlds: step past dynamic hits and keep looking
    const f = this.rayFrom;
    f.x = from.x; f.z = from.z;
    let travelled = 0;
    for (let i = 0; i < FALLBACK_RAY_STEPS; i++) {
      const remaining = maxDist - travelled;
      if (remaining <= 0) return null;
      const h = world.raycast(f, this.rayDir, remaining);
      if (!h) return null;
      if (h.body.kind === 'static') return travelled + h.dist;
      // a ray that starts inside a body reports nothing, so hop over the body's whole extent
      const sh = h.body.shape;
      const extent = sh.kind === 'circle' ? sh.r * 2 : sh.kind === 'obb' ? Math.hypot(sh.halfW, sh.halfL) * 2 : 1;
      const adv = h.dist + extent;
      f.x += this.rayDir.x * adv; f.z += this.rayDir.z * adv;
      travelled += adv;
    }
    return null;
  }
}
