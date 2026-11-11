import { CAMERA_NEAR, CAMERA_FAR } from '@/render/DepthRange';
import * as THREE from 'three';
import { angleDiff, clamp, wrapAngle, type Vec2 } from './Math2';
import { LOOK_BACK_KEY, type Input } from './Input';
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
  vehicle?: { readonly speed: number; shakeRequested?: number; readonly spec?: { readonly length: number; readonly height: number; readonly camDist?: number; readonly camHeight?: number } } | null;
  /** Speed in m/s when no vehicle object is at hand. */
  speed?: number;
}

const MOUSE_SENS = 0.0025;
/** Pitch limits per mode (radians above the horizon). */
const PITCH_FOOT = { min: -0.12, max: 0.85 };
const PITCH_VEH = { min: -0.05, max: 0.6 };
const DEFAULT_PITCH = 0;
/** Seconds after the last mouse/stick input before the car view starts swinging back behind the car. */
const RECENTRE_DELAY = 0.3;
/** Natural frequency (rad/s) of the critically damped yaw spring: ~95 % of the way back in 3/omega. */
const YAW_OMEGA = 4.6;
const SMOOTH_VEH = 10;   // exponential smoothing rate of distance/height/shoulder, 1/s
const SMOOTH_FOOT = 5.5; // slower on foot
const SPEED_SMOOTH = 2.5;
const MIN_CAM_Y = 0.4;
/** Pivot offsets: the camera orbits a point `look` m above the ground at the car's roof centre / the player's head. */
export const CAM_FOOT = { distance: 3.2, height: 1.55, look: 1.4, fov: 64, shoulder: 0.35 };
export const CAM_VEHICLE = { distance: 4.6, height: 1.7, look: 1.3, fov: 70, fovTop: 82 };
const SEDAN = { length: 4.6, height: 1.45 };
/** Extra pull-back (m) at top speed, so the road ahead opens up. */
const SPEED_DISTANCE = 0.9;
const SPEED_FULL = 30;
/** Look-back: spring rate of the 0..1 blend (snap ~0.35 s) and the key that drives it. */
const LOOKBACK_OMEGA = 11;
/** Reversing: the rig flips to the look-back side (camera ahead of the car, watching the way it is going) above this speed (m/s), and flips back below the exit speed. */
const REVERSE_ENTER = 1.5;
const REVERSE_EXIT = 0.5;
/** Metres kept between the lens and another car when the rig is trimmed to clear it. */
const CAR_MARGIN = 0.6;
/** Idle cinematic: seconds of stillness, ramp-in/out rates, drift speed, zoom-out factor. */
export const IDLE_CINEMATIC_AFTER = 8;
const CINE_IN = 0.45;     // 1/s (~2.2 s ramp)
const CINE_OUT = 3.5;     // 1/s
const CINE_DRIFT = 0.1;   // rad/s of slow orbit
const CINE_ZOOM = 0.28;   // +28 % distance
const MOVE_EPS = 0.25;    // m/s of target movement that counts as "not stationary"
/** Roll with lateral acceleration (rad per m/s^2), capped. */
const ROLL_PER_G = 0.0035;
const ROLL_MAX = 0.05;
const ROLL_SMOOTH = 5;
const SHAKE_TIME = 0.4;
const SHAKE_MAX = 1;
const SHAKE_POS = 0.22; // metres at amplitude 1
const SHAKE_ROLL = 0.025; // radians at amplitude 1
/** Keep the lens this far off a wall, and never closer than this to the target (horizontally). */
const WALL_MARGIN = 0.35;
const MIN_HORIZ = 0.9;
const WALL_OUT_RATE = 3;
const FALLBACK_RAY_STEPS = 4;
/** Mission letterbox: bar height as a share of the viewport and the slide rate. */
const LETTERBOX_SHARE = 0.12;
const LETTERBOX_RATE = 5;
/** Rate (1/s) at which the pivot jump from getting in / out of a car (door -> car centre) is absorbed, and the largest jump absorbed (m). */
const PIVOT_SETTLE = 7;
const PIVOT_JUMP_MAX = 8;
/** Touch look: drag deltas arrive in bursts per pointer event; they are released through a dt-correct low-pass (rate 1/s) so the view glides. */
const TOUCH_LOOK_RATE = 26;
/** Rate (1/s) at which the lens is pulled in when a wall is behind it (it used to snap in a single frame). */
const WALL_IN_RATE = 22;

/** Exact step of a critically damped spring on `x` (distance from rest) with velocity `v`. */
export function dampStep(x: number, v: number, omega: number, dt: number): { x: number; v: number } {
  const e = Math.exp(-omega * dt);
  const t = (v + omega * x) * dt;
  return { v: (v - omega * t) * e, x: (x + t) * e };
}

/** Field of view (deg) for a car speed in m/s: 70 at rest widening to 82 at SPEED_FULL, either direction. */
export function vehicleFov(speed: number): number {
  return CAM_VEHICLE.fov + (CAM_VEHICLE.fovTop - CAM_VEHICLE.fov) * clamp(Math.abs(speed) / SPEED_FULL, 0, 1);
}

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Heading (radians, clockwise from north) the camera looks toward. Walk "forward" = this. Never includes look-back or cinematic offsets. */
  yaw = 0;
  pitch = DEFAULT_PITCH;
  /** Static world used for wall avoidance when `update` is not handed one. */
  world: CameraWorld | null = null;

  private idle = 0;        // seconds since mouse/stick look input
  private still = 0;       // seconds with no input and a stationary target
  private yawVel = 0;
  private distance = CAM_FOOT.distance;
  private height = CAM_FOOT.height;
  private lookY = CAM_FOOT.look;
  private shoulder = CAM_FOOT.shoulder;
  private speedN = 0;
  private shake = 0;
  private clock = 0;
  /** 0..1: the lens is pressed against / inside another car; the host dims the sun flare and bloom by this. */
  flareSuppress = 0;
  private reversing = false;
  private carScale = 1;
  private backBlend = 0;   // 0 = behind, 1 = in front looking back
  private backVel = 0;
  private cineBlend = 0;
  private cineYaw = 0;
  private roll = 0;
  private headingRate = 0;
  private prevHeading = 0;
  private prevX = 0;
  private prevZ = 0;
  private wallScale = 1;
  private lbTarget = false;
  private lbHold = 0;
  private lbAmount = 0;
  private lbEl: HTMLElement | null = null;
  private lbShown = -1;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly rayDir: Vec2 = { x: 0, z: 0 };
  private readonly rayFrom: Vec2 = { x: 0, z: 0 };
  private initialised = false;
  private lastMode: CameraMode | null = null;
  private pendDX = 0;
  private pendDY = 0;
  private offX = 0;
  private offZ = 0;
  private readonly tgt: Vec2 = { x: 0, z: 0 };
  private fovNow: number = CAM_FOOT.fov;
  /** Degrees added to the on-foot and vehicle field of view (Menu > Advanced graphics > Field of view). */
  fovOffset = 0;

  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(CAM_FOOT.fov, aspect, CAMERA_NEAR, CAMERA_FAR);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Current shake amplitude 0..1 (decays to 0 over 0.4 s). */
  get shakeAmount(): number { return this.shake; }
  /** 0 = normal view, 1 = fully swung round to look back. */
  get lookBackAmount(): number { return this.backBlend; }
  /** 0..1 strength of the idle cinematic drift (0 = off). */
  get cinematicAmount(): number { return this.cineBlend; }
  /** Seconds the player has been still and hands-off. */
  get idleSeconds(): number { return this.still; }
  /** Current roll in radians (lateral g). */
  get rollAngle(): number { return this.roll; }
  /** 0..1 how far the letterbox bars have slid in. */
  get letterboxAmount(): number { return this.lbAmount; }
  get letterboxOn(): boolean { return this.lbTarget; }

  /** Kick the camera: amplitude 0..1; stronger hits replace weaker ones in progress. */
  addShake(amount: number): void {
    this.shake = Math.min(SHAKE_MAX, Math.max(this.shake, amount));
  }

  /**
   * Cinematic bars. `holdSeconds` > 0 switches them off again by themselves after that long (main.ts: `cam.setLetterbox(true, 2.5)`
   * on mission:started). The bars are the camera's own two fixed divs, created on first use, pointer-transparent.
   */
  setLetterbox(on: boolean, holdSeconds = 0): void {
    this.lbTarget = on;
    this.lbHold = on && holdSeconds > 0 ? holdSeconds : 0;
    if (on) this.ensureBars();
  }

  /** Optional: host the bars inside a given overlay instead of document.body. */
  attachLetterbox(parent: HTMLElement): void {
    this.lbEl?.remove();
    this.lbEl = null;
    this.ensureBars(parent);
  }

  private ensureBars(parent?: HTMLElement): void {
    if (this.lbEl || typeof document === 'undefined') return;
    const host = parent ?? document.body;
    if (!host) return;
    const root = document.createElement('div');
    root.className = 'cam-letterbox';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden;';
    for (const top of [true, false]) {
      const bar = document.createElement('div');
      bar.style.cssText = `position:absolute;left:0;right:0;${top ? 'top' : 'bottom'}:0;height:${LETTERBOX_SHARE * 100}%;background:#000;transform:translateY(${top ? '-100%' : '100%'});will-change:transform;`;
      root.appendChild(bar);
    }
    host.appendChild(root);
    this.lbEl = root;
    this.lbShown = -1;
  }

  private paintBars(): void {
    if (!this.lbEl || Math.abs(this.lbAmount - this.lbShown) < 0.002) return;
    this.lbShown = this.lbAmount;
    const off = (1 - this.lbAmount) * 100;
    const [top, bottom] = [this.lbEl.children[0] as HTMLElement | undefined, this.lbEl.children[1] as HTMLElement | undefined];
    if (top) top.style.transform = `translateY(${-off}%)`;
    if (bottom) bottom.style.transform = `translateY(${off}%)`;
    this.lbEl.style.visibility = this.lbAmount > 0.001 ? 'visible' : 'hidden';
  }

  update(dt: number, targetPos: Vec2, targetHeading: number, mode: CameraMode, input: Input, ctx?: CameraContext): void {
    const veh = ctx?.vehicle ?? null;
    const vehicleMode = mode === 'vehicle';
    const first = !this.initialised;
    // The pivot differs between modes (the player's door spot vs the car's centre): carry the jump as an offset that decays,
    // so getting in or out glides the view instead of popping it by a metre or two.
    if (this.lastMode !== null && mode !== this.lastMode) {
      const jx = this.prevX - targetPos.x, jz = this.prevZ - targetPos.z;
      if (Math.hypot(jx, jz) < PIVOT_JUMP_MAX) { this.offX += jx; this.offZ += jz; } else { this.offX = 0; this.offZ = 0; }
    }
    this.lastMode = mode;
    if (this.offX !== 0 || this.offZ !== 0) {
      const decay = Math.exp(-PIVOT_SETTLE * dt);
      this.offX *= decay; this.offZ *= decay;
      if (Math.abs(this.offX) < 1e-3 && Math.abs(this.offZ) < 1e-3) { this.offX = 0; this.offZ = 0; }
    }
    const rawTarget = targetPos;
    this.tgt.x = targetPos.x + this.offX; this.tgt.z = targetPos.z + this.offZ;
    targetPos = this.tgt;
    if (first) { this.prevHeading = targetHeading; this.prevX = targetPos.x; this.prevZ = targetPos.z; }
    const safeDt = Math.max(dt, 1e-5);

    // ---- input activity -------------------------------------------------------------------------------------
    // touch drags are smoothed (total rotation unchanged); mouse and pad deltas stay 1:1
    let ldx = input.mouseDX, ldy = input.mouseDY;
    if ((input as { mode?: string }).mode === 'touch') {
      this.pendDX += ldx; this.pendDY += ldy;
      const take = Math.abs(this.pendDX) + Math.abs(this.pendDY) < 0.4 ? 1 : 1 - Math.exp(-TOUCH_LOOK_RATE * dt);
      ldx = this.pendDX * take; ldy = this.pendDY * take;
      this.pendDX -= ldx; this.pendDY -= ldy;
    }
    const lookInput = ldx !== 0 || ldy !== 0;
    const moveSpeed = Math.hypot(rawTarget.x - this.prevX, rawTarget.z - this.prevZ) / safeDt;
    const lookBackHeld = input.isDown(LOOK_BACK_KEY);
    const anyInput = lookInput || lookBackHeld || (typeof input.anyInput === 'function' && input.anyInput());
    if (lookInput) {
      this.yaw += ldx * MOUSE_SENS;
      this.pitch += ldy * MOUSE_SENS;
      this.idle = 0;
      this.yawVel = 0;
    } else {
      this.idle += dt;
    }
    const lim = vehicleMode ? PITCH_VEH : PITCH_FOOT;
    this.pitch = clamp(this.pitch, lim.min, lim.max);
    if (anyInput || moveSpeed > MOVE_EPS) this.still = 0; else this.still += dt;

    // ---- yaw: critically damped swing back behind the car --------------------------------------------------
    if (vehicleMode && this.idle > RECENTRE_DELAY) {
      const st = dampStep(angleDiff(targetHeading, this.yaw), this.yawVel, YAW_OMEGA, dt);
      // st.x is (yaw - heading); keep it on the short arc
      this.yaw = wrapAngle(targetHeading + st.x);
      this.yawVel = st.v;
      // pitch eases back to the default chase angle at the same pace
      this.pitch += (DEFAULT_PITCH - this.pitch) * (1 - Math.exp(-YAW_OMEGA * 0.6 * dt));
    } else {
      this.yawVel = 0;
    }
    this.yaw = wrapAngle(this.yaw);

    // ---- look-back (spring on a 0..1 blend, no overshoot past 1) -------------------------------------------
    {
      const vs = vehicleMode ? (veh ? veh.speed : ctx?.speed ?? 0) : 0;
      if (!vehicleMode) this.reversing = false;
      else if (!this.reversing && vs < -REVERSE_ENTER) this.reversing = true;
      else if (this.reversing && vs > -REVERSE_EXIT) this.reversing = false;
      const backWant = lookBackHeld || this.reversing ? 1 : 0;
      const st = dampStep(this.backBlend - backWant, this.backVel, LOOKBACK_OMEGA, dt);
      this.backBlend = clamp(backWant + st.x, 0, 1);
      this.backVel = st.v;
    }

    // ---- idle cinematic ------------------------------------------------------------------------------------
    if (this.still >= IDLE_CINEMATIC_AFTER) {
      this.cineBlend = Math.min(1, this.cineBlend + CINE_IN * dt);
      this.cineYaw = wrapAngle(this.cineYaw + CINE_DRIFT * this.cineBlend * dt);
    } else {
      this.cineBlend = Math.max(0, this.cineBlend - CINE_OUT * dt);
      this.cineYaw -= this.cineYaw * (1 - Math.exp(-CINE_OUT * dt)); // unwind the drift smoothly
      if (this.cineBlend === 0 && Math.abs(this.cineYaw) < 1e-4) this.cineYaw = 0;
    }

    // ---- impacts: consume the vehicle's request, decay linearly over SHAKE_TIME ----------------------------
    if (veh && veh.shakeRequested !== undefined && veh.shakeRequested > 0) {
      this.addShake(veh.shakeRequested);
      veh.shakeRequested = 0;
    }
    this.clock += dt;
    this.shake = Math.max(0, this.shake - (SHAKE_MAX / SHAKE_TIME) * dt);

    // ---- speed, rig distance/height/fov --------------------------------------------------------------------
    const smooth = vehicleMode ? SMOOTH_VEH : SMOOTH_FOOT;
    const k = first ? 1 : 1 - Math.exp(-smooth * dt);
    const kSpeed = first ? 1 : 1 - Math.exp(-SPEED_SMOOTH * dt);
    const speed = vehicleMode ? Math.abs(veh ? veh.speed : ctx?.speed ?? 0) : 0;
    this.speedN += (clamp(speed / SPEED_FULL, 0, 1) - this.speedN) * kSpeed;

    // Bigger vehicles (box truck, van) scale the rig so the road ahead shows over their roof; a sedan (4.6 x 1.4) is unchanged.
    const extraLen = vehicleMode && veh?.spec ? Math.max(0, veh.spec.length - SEDAN.length) : 0;
    const extraH = vehicleMode && veh?.spec ? Math.max(0, veh.spec.height - SEDAN.height) : 0;
    const rig = vehicleMode
      ? { distance: CAM_VEHICLE.distance + extraLen + (veh?.spec?.camDist ?? 0), height: CAM_VEHICLE.height + extraH + (veh?.spec?.camHeight ?? 0), look: CAM_VEHICLE.look + 0.9 * extraH }
      : CAM_FOOT;
    const wantDistance = (rig.distance + (vehicleMode ? SPEED_DISTANCE * this.speedN : 0)) * (1 + CINE_ZOOM * this.cineBlend);
    this.distance += (wantDistance - this.distance) * k;
    this.height += (rig.height - this.height) * k;
    this.lookY += (rig.look - this.lookY) * k;
    this.shoulder += ((vehicleMode ? 0 : CAM_FOOT.shoulder) - this.shoulder) * k;

    const fov = (vehicleMode ? CAM_VEHICLE.fov + (CAM_VEHICLE.fovTop - CAM_VEHICLE.fov) * this.speedN : CAM_FOOT.fov) + this.fovOffset;
    this.fovNow = first ? fov : this.fovNow + (fov - this.fovNow) * k;
    if (Math.abs(this.fovNow - this.camera.fov) > 0.01) {
      this.camera.fov = this.fovNow;
      this.camera.updateProjectionMatrix();
    }

    // ---- roll with lateral acceleration (speed x yaw rate), car only ---------------------------------------
    if (!first && dt > 0) {
      const rate = angleDiff(this.prevHeading, targetHeading) / dt;
      this.headingRate += (rate - this.headingRate) * (1 - Math.exp(-12 * dt));
    }
    const lat = vehicleMode ? (veh ? veh.speed : ctx?.speed ?? 0) * this.headingRate : 0;
    const wantRoll = clamp(lat * ROLL_PER_G, -ROLL_MAX, ROLL_MAX);
    this.roll += (wantRoll - this.roll) * (first ? 1 : 1 - Math.exp(-ROLL_SMOOTH * dt));
    this.prevHeading = targetHeading;
    this.prevX = rawTarget.x; this.prevZ = rawTarget.z;

    // ---- rig placement: the pivot rides rigidly on the target; only the rig parameters are smoothed --------
    const viewYaw = this.yaw + Math.PI * this.backBlend + this.cineYaw;
    const bx = Math.sin(viewYaw), bz = -Math.cos(viewYaw);
    const sx = -bz * this.shoulder, sz = bx * this.shoulder;
    const horiz = this.distance * Math.cos(this.pitch);
    this.look.set(targetPos.x + sx, this.lookY, targetPos.z + sz);
    this.pos.set(
      targetPos.x + sx - bx * horiz,
      Math.max(MIN_CAM_Y, this.height + this.distance * Math.sin(this.pitch)),
      targetPos.z + sz - bz * horiz,
    );
    this.initialised = true;

    const world = ctx?.world ?? this.world;
    let want = world ? this.wallFraction(world, targetPos) : 1;
    // Reversing / looking back: never put the lens inside (or behind) another car; trim the rig to stop short of it.
    let carBlocked = 0;
    if (world && vehicleMode && this.backBlend > 0.3) {
      const cs = this.carFraction(world, targetPos);
      carBlocked = cs < 1 ? 1 : 0;
      this.carScale = cs < this.carScale || first ? cs : this.carScale + (cs - this.carScale) * (1 - Math.exp(-WALL_OUT_RATE * dt));
    } else {
      this.carScale += (1 - this.carScale) * (1 - Math.exp(-WALL_OUT_RATE * dt));
    }
    want = Math.min(want, this.carScale);
    this.flareSuppress += (Math.max(carBlocked, this.carScale < 0.97 ? 1 : 0) - this.flareSuppress) * (1 - Math.exp(-8 * dt));
    this.wallScale = first ? want
      : want < this.wallScale ? this.wallScale + (want - this.wallScale) * (1 - Math.exp(-WALL_IN_RATE * dt))
      : this.wallScale + (want - this.wallScale) * (1 - Math.exp(-WALL_OUT_RATE * dt));
    if (this.wallScale < 1) {
      const s = this.wallScale;
      this.pos.x = targetPos.x + (this.pos.x - targetPos.x) * s;
      this.pos.z = targetPos.z + (this.pos.z - targetPos.z) * s;
      // keep the viewing angle: bring the height in with the distance (never below the ground clamp)
      this.pos.y = Math.max(MIN_CAM_Y, this.look.y + (this.pos.y - this.look.y) * s);
    }

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    if (this.roll !== 0) this.camera.rotateZ(-this.roll);

    if (this.shake > 0) {
      const a = this.shake * this.shake * (3 - 2 * this.shake); // ease so the tail is gentle
      const t = this.clock;
      this.camera.translateX((Math.sin(t * 61) + 0.6 * Math.sin(t * 107)) * SHAKE_POS * a);
      this.camera.translateY((Math.sin(t * 73 + 1.3) + 0.6 * Math.sin(t * 131)) * SHAKE_POS * a);
      this.camera.rotateZ(Math.sin(t * 83 + 0.4) * SHAKE_ROLL * a);
    }

    // ---- letterbox bars --------------------------------------------------------------------------------------
    if (this.lbHold > 0) { this.lbHold -= dt; if (this.lbHold <= 0) { this.lbHold = 0; this.lbTarget = false; } }
    const lbGoal = this.lbTarget ? 1 : 0;
    this.lbAmount += (lbGoal - this.lbAmount) * (1 - Math.exp(-LETTERBOX_RATE * dt));
    if (Math.abs(lbGoal - this.lbAmount) < 0.002) this.lbAmount = lbGoal;
    this.paintBars();
  }

  /** Fraction (0..1] of the target -> camera horizontal distance that stays clear of static walls. */
  private wallFraction(world: CameraWorld, target: Vec2): number {
    const dx = this.pos.x - target.x, dz = this.pos.z - target.z;
    const d = Math.hypot(dx, dz);
    if (d < MIN_HORIZ) return 1;
    this.rayDir.x = dx / d; this.rayDir.z = dz / d;
    const hitDist = this.firstStaticHit(world, target, d + WALL_MARGIN); // look a margin past the lens
    if (hitDist === null) return 1;
    const nd = Math.max(MIN_HORIZ, hitDist - WALL_MARGIN);
    return nd >= d ? 1 : nd / d;
  }

  /** Fraction (0..1] of the target -> camera distance that stays clear of other vehicles (only used while reversing / looking back). */
  private carFraction(world: CameraWorld, target: Vec2): number {
    const dx = this.pos.x - target.x, dz = this.pos.z - target.z;
    const d = Math.hypot(dx, dz);
    if (d < MIN_HORIZ) return 1;
    this.rayDir.x = dx / d; this.rayDir.z = dz / d;
    const h = world.raycast(target, this.rayDir, d + CAR_MARGIN) as { dist: number; body?: { kind?: string } } | null;
    if (!h || !h.body || (h.body.kind !== 'vehicle' && h.body.kind !== 'cop')) return 1;
    const nd = Math.max(MIN_HORIZ, h.dist - CAR_MARGIN);
    return nd >= d ? 1 : nd / d;
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
