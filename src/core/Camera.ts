import { CAMERA_NEAR, CAMERA_FAR } from '@/render/DepthRange';
import * as THREE from 'three';
import { angleDiff, clamp, wrapAngle, type Vec2 } from './Math2';
import { LOOK_BACK_KEY, type Input } from './Input';
import type { IWorld2D } from '@/world/types';
import { CameraViews } from './CameraViews';
import { FOOT_BOX, ROOF_MARGIN_CAR, ROOF_MARGIN_FOOT, CLEAR_IN, boxExit, lensGlare, raiseAmount, slackFollow, smoothstep, type BodyBox } from './CameraClearance';

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
  vehicle?: { readonly id?: string; readonly speed: number; shakeRequested?: number; readonly spec?: { readonly length: number; readonly height: number; readonly width?: number; readonly camDist?: number; readonly camHeight?: number } } | null;
  /** Speed in m/s when no vehicle object is at hand. */
  speed?: number;
}

const MOUSE_SENS = 0.0025;
/** Pitch limits per mode (radians above the horizon). */
const PITCH_FOOT = { min: -0.12, max: 0.85 };
const PITCH_VEH = { min: -0.05, max: 0.6 };
/** First person / bumper views look freely up and down. */
const PITCH_FIRST = { min: -1.15, max: 1.15 };
/** Distance (m) below which the rig counts as first person: the look target blends from the pivot to straight ahead. */
const FIRST_BLEND_DIST = 1.2;
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
const SEDAN = { length: 4.6, height: 1.45, width: 1.9 };
/** Extra pull-back (m) at top speed, so the road ahead opens up. */
const SPEED_DISTANCE = 0.9;
const SPEED_FULL = 30;
/** Look-back: spring rate of the 0..1 blend (snap ~0.35 s) and the key that drives it. */
const LOOKBACK_OMEGA = 11;
/** Reversing: the rig flips to the look-back side (camera ahead of the car, watching the way it is going) above this speed (m/s), and flips back below the exit speed. */
const REVERSE_ENTER = 1.5;
const REVERSE_EXIT = 0.5;
/** Metres kept between the lens and another car, or a pedestrian, when the rig is trimmed to clear it. */
const CAR_MARGIN = 0.6;
const PED_MARGIN = 0.45;
/** Half width (m) of the lens "sphere": the view line is cast three times, centre and this far to each side, so a corner cannot slip past. */
const LENS_RADIUS = 0.35;
/** A ray that reports a hit closer than this started inside the body (a car pressed into a wall, a player against one). */
const INSIDE_EPS = 0.02;
/** Hysteresis on the trimmed reach: it only recovers once the free distance exceeds it by this much (m). */
const REACH_DEAD = 0.05;
/** Slack band (m) of the pivot while the view is trimmed: physics jitter inside it does not move the lens. Scaled by the blocked amount. */
const SLACK_BAND = 0.1;
const BLOCK_RATE = 6;
/** On foot: a side swap needs the other side this much freer (m), is held this long (s), and is undone after the original side has been free this long (s). */
const SLIDE_GAIN = 0.8;
const SLIDE_HOLD = 1;
const SLIDE_RELEASE = 0.8;
const FAR = 1e3;
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
/** The lens may come in this close (horizontally) when it is raised over the body; tilt makes up for it. */
const MIN_REACH = 0.3;
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
  private backBlend = 0;   // 0 = behind, 1 = in front looking back
  private backVel = 0;
  private cineBlend = 0;
  private cineYaw = 0;
  private roll = 0;
  private headingRate = 0;
  private prevHeading = 0;
  private prevX = 0;
  private prevZ = 0;
  /** Trimmed horizontal reach of the lens (m), smoothed: fast in, slow out, with a dead band. */
  private reach = FAR;
  private initReach = false;
  private heldStatic = FAR;
  private blockAmt = 0;
  private slkX = 0;
  private slkZ = 0;
  /** On foot: the shoulder side was swapped because the preferred side is walled in. */
  private slide = false;
  private slideTimer = 0;
  private slideFree = 0;
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
  private forward = 0;
  private firstAmt = 0;
  /** Selectable views (V cycle, double-tap swap, B shoulder); main.ts feeds it key edges via `views.handleKeys`. */
  readonly views = new CameraViews();
  private cineDist = 0; private cineHeight = 0; private cineLook = 0; private cineFov = 0; private cineShotYaw = 0;
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
  /** 0..1: how far into first person the rig is. The host hides the player's head (on foot) once this passes ~0.85. */
  get firstPersonAmount(): number { return this.firstAmt; }
  /** Id of the active view for the current mode ('chase', 'first', 'hood', 'cinematic' ...). */
  get viewId(): string { return this.views.id(this.lastMode ?? 'foot'); }

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
    // The pivot follows the target through a slack band that only opens while the view is trimmed by something behind it:
    // a car jammed against a wall jitters by centimetres every physics step, and the lens must not shiver with it.
    {
      const ux = targetPos.x + this.offX, uz = targetPos.z + this.offZ;
      if (first) { this.slkX = ux; this.slkZ = uz; }
      else {
        const band = SLACK_BAND * this.blockAmt;
        this.slkX = slackFollow(this.slkX, ux, band);
        this.slkZ = slackFollow(this.slkZ, uz, band);
      }
      this.tgt.x = this.slkX; this.tgt.z = this.slkZ;
    }
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
    this.views.tick(dt, mode);
    const vrig = this.views.rig(mode);
    const snap = first || this.views.cutThisFrame;
    const lim = vrig.first ? PITCH_FIRST : vehicleMode ? PITCH_VEH : PITCH_FOOT;
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
    const k = snap ? 1 : 1 - Math.exp(-smooth * dt);
    const kSpeed = first ? 1 : 1 - Math.exp(-SPEED_SMOOTH * dt);
    const speed = vehicleMode ? Math.abs(veh ? veh.speed : ctx?.speed ?? 0) : 0;
    this.speedN += (clamp(speed / SPEED_FULL, 0, 1) - this.speedN) * kSpeed;

    // Bigger vehicles (box truck, van) scale the rig so the road ahead shows over their roof; a sedan (4.6 x 1.4) is unchanged.
    const extraLen = vehicleMode && veh?.spec ? Math.max(0, veh.spec.length - SEDAN.length) : 0;
    const extraH = vehicleMode && veh?.spec ? Math.max(0, veh.spec.height - SEDAN.height) : 0;
    const cine = vrig.cinematic && vehicleMode ? this.views.director.shot : null;
    const sedanRig = vehicleMode
      ? { distance: CAM_VEHICLE.distance + extraLen + (veh?.spec?.camDist ?? 0), height: CAM_VEHICLE.height + extraH + (veh?.spec?.camHeight ?? 0), look: CAM_VEHICLE.look + 0.9 * extraH }
      : CAM_FOOT;
    const vlen = veh?.spec?.length ?? SEDAN.length;
    const vh = veh?.spec?.height ?? SEDAN.height;
    const rig = vehicleMode
      ? vrig.first
        ? { distance: 0, height: vh * 0.55 + 0.25, look: vh * 0.55 + 0.25, forward: vrig.forwardShare * vlen }
        : cine
          ? { distance: cine.distance, height: cine.height, look: cine.look, forward: 0 }
          : { distance: sedanRig.distance * vrig.distScale, height: sedanRig.height * vrig.heightScale, look: sedanRig.look, forward: 0 }
      : { distance: vrig.distance, height: vrig.height, look: vrig.look, forward: 0 };
    const wantDistance = (rig.distance + (vehicleMode && !vrig.first && !cine ? SPEED_DISTANCE * this.speedN : 0)) * (1 + CINE_ZOOM * this.cineBlend);
    this.distance += (wantDistance - this.distance) * k;
    this.height += (rig.height - this.height) * k;
    this.lookY += (rig.look - this.lookY) * k;
    this.forward += (rig.forward - this.forward) * k;
    this.shoulder += ((vehicleMode ? 0 : vrig.shoulder * this.views.side * (this.slide ? -1 : 1)) - this.shoulder) * k;
    this.cineShotYaw = cine ? cine.yaw : 0;

    const fov = vehicleMode
      ? (cine ? cine.fov : CAM_VEHICLE.fov + (CAM_VEHICLE.fovTop - CAM_VEHICLE.fov) * this.speedN + vrig.fov) + this.fovOffset
      : vrig.fov + this.fovOffset;
    this.fovNow = snap ? fov : this.fovNow + (fov - this.fovNow) * k;
    if (Math.abs(this.fovNow - this.camera.fov) > 0.01) {
      this.camera.fov = this.fovNow;
      this.camera.updateProjectionMatrix();
    }
    this.firstAmt = clamp(1 - this.distance / FIRST_BLEND_DIST, 0, 1);

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
    const viewYaw = this.yaw + Math.PI * this.backBlend + this.cineYaw + this.cineShotYaw;
    const bx = Math.sin(viewYaw), bz = -Math.cos(viewYaw);
    const sx = -bz * this.shoulder, sz = bx * this.shoulder;
    const horiz = this.distance * Math.cos(this.pitch);
    this.look.set(targetPos.x + sx, this.lookY, targetPos.z + sz);
    this.pos.set(
      targetPos.x + sx + bx * (this.forward - horiz),
      Math.max(MIN_CAM_Y, this.height + this.distance * Math.sin(this.pitch)),
      targetPos.z + sz + bz * (this.forward - horiz),
    );
    if (this.firstAmt > 0) {
      // first person / bumper: look straight along the view (pitch up/down), blended in as the lens reaches the pivot
      const w = this.firstAmt * this.firstAmt * (3 - 2 * this.firstAmt);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      this.look.x += (this.pos.x + bx * cp * 10 - this.look.x) * w;
      this.look.y += (this.pos.y - sp * 10 - this.look.y) * w;
      this.look.z += (this.pos.z + bz * cp * 10 - this.look.z) * w;
    }
    this.initialised = true;

    const world = ctx?.world ?? this.world;
    let dynBlocked = 0;
    if (world && this.firstAmt < 0.5) {
      const dxp = this.pos.x - targetPos.x, dzp = this.pos.z - targetPos.z;
      const d = Math.hypot(dxp, dzp);
      if (d >= MIN_HORIZ) {
        const ux = dxp / d, uz = dzp / d;
        const box: BodyBox = vehicleMode
          ? { halfL: vlen / 2, halfW: (veh?.spec?.width ?? SEDAN.width) / 2, top: vh }
          : FOOT_BOX;
        // free distance along the view line: static walls (with the inside-collider hold) and other bodies
        const stat = this.staticLimit(world, targetPos, this.pos.x, this.pos.z, true);
        const dyn = this.dynamicLimit(world, targetPos, this.pos.x, this.pos.z, veh?.id);
        // on foot, walled in behind: swap to the shoulder side that is free (undone once the first side is free again)
        if (!vehicleMode && Math.abs(vrig.shoulder) > 0.1) this.updateSlide(world, targetPos, stat, d, dt);
        else { this.slide = false; this.slideTimer = 0; this.slideFree = 0; }
        const limitNow = Math.min(stat, dyn, d + 0.5);
        if (first || !this.initReach) this.reach = limitNow;
        else if (limitNow < this.reach) this.reach += (limitNow - this.reach) * (1 - Math.exp(-WALL_IN_RATE * dt));
        else if (limitNow - this.reach > REACH_DEAD) this.reach += (limitNow - this.reach) * (1 - Math.exp(-WALL_OUT_RATE * dt));
        this.initReach = true;
        const h = Math.max(MIN_REACH, Math.min(d, this.reach));
        if (h < d) {
          const sc = h / d;
          this.pos.x = targetPos.x + dxp * sc;
          this.pos.z = targetPos.z + dzp * sc;
        }
        this.blockAmt += ((d - h > 0.05 ? 1 : 0) - this.blockAmt) * (1 - Math.exp(-BLOCK_RATE * dt));
        dynBlocked = dyn < d - 0.05 ? 1 : 0;
        // Too little room behind: do not come closer than the body's own box. Rise over the roof and tilt down onto it instead
        // (the look target stays on the body), and never lower than the roof while the lens is within reach of the box.
        const rb = boxExit(ux, uz, targetHeading, box);
        const trimmed = smoothstep(0, 0.15, d - h);
        const near = 1 - smoothstep(rb + CLEAR_IN, rb + CLEAR_IN + 0.25, h);
        const f = Math.max(raiseAmount(h, rb) * trimmed, near);
        if (f > 0) {
          const roofY = box.top + (vehicleMode ? ROOF_MARGIN_CAR : ROOF_MARGIN_FOOT);
          if (this.pos.y < roofY) this.pos.y += (roofY - this.pos.y) * f;
        }
      }
    } else {
      this.blockAmt += (0 - this.blockAmt) * (1 - Math.exp(-BLOCK_RATE * dt));
      this.reach = FAR;
      this.initReach = false;
      this.slide = false;
    }
    this.flareSuppress += (dynBlocked - this.flareSuppress) * (1 - Math.exp(-8 * dt));
    lensGlare.x = this.pos.x; lensGlare.y = this.pos.y; lensGlare.z = this.pos.z; lensGlare.active = true;

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

  /**
   * Horizontal distance (m) from `target` toward the lens at (lx, lz) that stays clear of static walls, a wall margin short of the
   * first one. Three rays (centre and one lens radius to each side) so a corner cannot slip between them. A centre ray that starts
   * inside a collider (the car pressed into a wall, physics jitter across a face) reports nothing new: the last good value is held.
   */
  private staticLimit(world: CameraWorld, target: Vec2, lx: number, lz: number, remember: boolean): number {
    const dx = lx - target.x, dz = lz - target.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return FAR;
    const px = -dz / d, pz = dx / d;
    let best = FAR;
    let inside = false;
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * LENS_RADIUS;
      const ex = dx + px * a, ez = dz + pz * a;
      const len = Math.hypot(ex, ez);
      this.rayDir.x = ex / len; this.rayDir.z = ez / len;
      const hit = this.firstStaticHit(world, target, len + WALL_MARGIN);
      if (hit === null) continue;
      if (i === 1 && hit < INSIDE_EPS) inside = true;
      best = Math.min(best, hit * (d / len) - WALL_MARGIN);
    }
    best = Math.max(0, best);
    if (!remember) return best;
    if (inside) return this.heldStatic === FAR ? 0 : this.heldStatic;
    this.heldStatic = best;
    return best;
  }

  /** Horizontal distance (m) toward the lens that stays clear of other cars and pedestrians (the body being followed is skipped). */
  private dynamicLimit(world: CameraWorld, target: Vec2, lx: number, lz: number, selfId: string | undefined): number {
    const dx = lx - target.x, dz = lz - target.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return FAR;
    const px = -dz / d, pz = dx / d;
    let best = FAR;
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * LENS_RADIUS;
      const ex = dx + px * a, ez = dz + pz * a;
      const len = Math.hypot(ex, ez);
      this.rayDir.x = ex / len; this.rayDir.z = ez / len;
      const reachLen = len + CAR_MARGIN;
      let h = world.raycast(target, this.rayDir, reachLen, selfId) as { dist: number; body: { id: string; kind: string } } | null;
      // a ray that starts inside a body (our own car, the player's capsule) hits it at 0: look past it
      if (h && h.dist < INSIDE_EPS && h.body.kind !== 'static') h = world.raycast(target, this.rayDir, reachLen, h.body.id) as typeof h;
      if (!h) continue;
      const k = h.body.kind;
      if (k !== 'vehicle' && k !== 'cop' && k !== 'ped') continue;
      best = Math.min(best, h.dist * (d / len) - (k === 'ped' ? PED_MARGIN : CAR_MARGIN));
    }
    return Math.max(0, best);
  }

  /** On foot with a wall behind: swap the shoulder side when the other side is clearly freer; swap back once the first side is free again. */
  private updateSlide(world: CameraWorld, target: Vec2, curLimit: number, d: number, dt: number): void {
    this.slideTimer = Math.max(0, this.slideTimer - dt);
    const blocked = curLimit < d - 0.5;
    if (!blocked && !this.slide) { this.slideFree = 0; return; }
    // the same lens on the mirrored shoulder: pos - 2 * (shoulder offset), measured from the (unshifted) pivot
    const sx = this.look.x - target.x, sz = this.look.z - target.z;
    const alt = this.staticLimit(world, target, this.pos.x - 2 * sx, this.pos.z - 2 * sz, false);
    if (blocked && alt > curLimit + SLIDE_GAIN && this.slideTimer <= 0) {
      this.slide = !this.slide; this.slideTimer = SLIDE_HOLD; this.slideFree = 0;
    } else if (this.slide && !blocked && alt >= d - 0.05) {
      this.slideFree += dt;
      if (this.slideFree > SLIDE_RELEASE && this.slideTimer <= 0) { this.slide = false; this.slideFree = 0; }
    } else this.slideFree = 0;
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
