/**
 * CAMFIX harness (no browser): the real ThirdPersonCamera, Player, Vehicle and World2D, driven the way src/main.ts drives them:
 * the game's own FixedStepper (60 Hz steps, frames clamped to MAX_FRAME) and PoseSnapshots (render interpolation), keys edged in
 * the fixed step (views.handleKeys, F), camera updated once per rendered frame with the frame's dt and the interpolated pose.
 * Frame rate and a single long frame (hitch) are parameters. Records per frame what a viewer sees.
 */
import * as THREE from 'three';
import { EventBus } from '@/core/Events';
import { ThirdPersonCamera } from '@/core/Camera';
import { FixedStepper, PoseSnapshots, FIXED_STEP, MAX_FRAME, type BlendedPose } from '@/core/Game';
import { angleDiff, type Vec2 } from '@/core/Math2';
import { Player } from '@/entities/Player';
import type { Vehicle } from '@/entities/Vehicle';
import { groundAt } from '@/world/Ground';
import type { VehicleType } from '@/world/types';
import { Sim, makeVehicle, stubMaterials } from '../sim/harness';
import { FakeInput } from './mechanics-measure';

export class KeyInput extends FakeInput {
  /** A key press edge: stays until a fixed step consumes it (or the frame's end clears it, like Input.endFrame). */
  press(code: string): void { this.pressedSet.add(code); }
}

export interface CamFrame {
  /** wall clock seconds since recording began */
  t: number; dt: number; steps: number;
  mode: 'foot' | 'vehicle'; view: string; entering: boolean; inVehicle: boolean;
  px: number; py: number; pz: number;       // camera position
  lx: number; ly: number; lz: number;       // look target
  dx: number; dy: number; dz: number;       // view direction
  ux: number; uy: number; uz: number;       // camera up
  fov: number; yaw: number; first: number; distance: number;
  /** the body the camera follows (player on foot, car in a car) and its drawn (interpolated) position */
  bx: number; bz: number; bh: number;
  /** the car in use or being entered, if any: centre, heading, size */
  cx: number; cz: number; ch: number; cl: number; cw: number; chh: number; hasCar: boolean;
  /** the host marked this frame as a deliberate cut (view change to or from hood, first person, cinematic; a teleport) */
  cut: boolean;
  /** true when the camera object itself reports a one-frame snap */
  camCut: boolean;
  /** the player moved the look controls this frame */
  mouse: boolean;
  /** the look-back (or reversing) swing is in progress: a deliberate fast orbit round the car */
  lookBack: boolean;
  /** the lens is shaking (an impact: deliberate movement) */
  shake: number;
}

export interface RigOpts {
  fps: number;
  /** wall-clock second (since recording began) at which one frame lasts `hitchMs` */
  hitchAt?: number; hitchMs?: number;
  car?: { x: number; z: number; h?: number; type?: VehicleType };
  start?: Vec2; startHeading?: number;
  walls?: Array<Array<Vec2>>;
  /** camera style (CAMERA seat); the camera class defaults to 'modern' */
  style?: 'classic' | 'modern';
}

export class CamRig {
  readonly events = new EventBus();
  readonly sim = new Sim();
  readonly input = new KeyInput();
  /** the remembered views live in localStorage: every rig starts from the defaults */
  readonly cam = (() => { try { localStorage.clear(); } catch { /* none */ } return new ThirdPersonCamera(); })();
  readonly player: Player;
  readonly vehicles: Vehicle[] = [];
  readonly frames: CamFrame[] = [];
  readonly stepper = new FixedStepper(FIXED_STEP);
  readonly poses = new PoseSnapshots();
  private blended: BlendedPose = { x: 0, z: 0, h: 0 };
  private camTarget: Vec2 = { x: 0, z: 0 };
  private camHeading = 0;
  private ctx: { world: unknown; vehicle: Vehicle | null; ignoreId?: string | null };
  private wall = 0;
  private rec = false;
  private hitched = false;
  private tmp = new THREE.Vector3();
  private nextCut = false;
  private mouseNow = false;
  alpha = 1;
  /** how many deliberate cuts the script has declared for the next frame */
  constructor(readonly opts: RigOpts) {
    const start = opts.start ?? { x: 0, z: 3 };
    this.player = new Player('player', start, stubMaterials, this.events);
    this.player.body.heading = opts.startHeading ?? 0;
    this.sim.add(this.player);
    this.player.onVaultStart = () => this.sim.world.removeBody(this.player.body.id); // as main.ts wires it
    this.player.onVaultEnd = () => this.sim.world.addBody(this.player.body);
    this.player.vehiclesNear = (q, r) => this.sim.world.queryCircle(q, r).map((b) => b.userData as { spec?: unknown; body: { kind: string } }).filter((u) => !!u && !!u.spec && u.body.kind !== 'player') as never;
    this.events.on('enterVehicle', () => this.sim.world.removeBody(this.player.body.id));
    this.events.on('exitVehicle', () => this.sim.world.addBody(this.player.body));
    for (const w of opts.walls ?? []) this.sim.world.addStatic({ kind: 'polygon', points: w }, { x: 0, z: 0 }, 'wall');
    if (opts.car) this.addCar(opts.car.x, opts.car.z, opts.car.h ?? 0, opts.car.type ?? 'sedan');
    this.ctx = { world: this.sim.world, vehicle: null, ignoreId: null };
    this.cam.world = this.sim.world;
    if (opts.style) this.cam.setStyle(opts.style);
    // settle behind the standing player at 60 Hz, unrecorded
    this.rec = false;
    for (let i = 0; i < 120; i++) this.frameDt(1 / 60);
    this.wall = 0;
    this.rec = true;
  }

  addCar(x: number, z: number, h: number, type: VehicleType = 'sedan'): Vehicle {
    const v = makeVehicle(type, x, z, h, this.events, `car${this.vehicles.length}`);
    this.sim.add(v);
    this.vehicles.push(v);
    return v;
  }

  get car(): Vehicle { return this.vehicles[0]; }
  /** Mark the next frame a deliberate cut (the script is about to do something that is meant to cut). */
  declareCut(): void { this.nextCut = true; }

  private fixedStep(): void {
    const p = this.player;
    this.poses.beginCapture();
    for (const v of this.vehicles) this.poses.capture(v.body);
    this.poses.capture(p.body);
    this.poses.endCapture();
    this.cam.views.handleKeys(this.input, p.inVehicle ? 'vehicle' : 'foot');
    p.control(this.input as never, this.cam.yaw);
    if (this.input.consume('KeyF')) {
      if (p.inVehicle) p.exit();
      else p.tryEnter(this.vehicles);
      this.poses.capture(p.body); // CARENTRY (main.ts does the same): the render pose starts at the new spot, not half way from the car's centre
    }
    this.sim.step(FIXED_STEP);
  }

  /** One rendered frame of `raw` seconds of wall clock. */
  frameDt(raw: number): void {
    const dt = Math.min(MAX_FRAME, Math.max(0, raw));
    const n = this.stepper.advance(dt);
    for (let i = 0; i < n; i++) this.fixedStep();
    this.alpha = this.stepper.alpha;
    const p = this.player, v = p.vehicle;
    if (v) { this.poses.blend(v.body, this.alpha, this.blended); p.object3D.position.x = this.blended.x; p.object3D.position.z = this.blended.z; }
    else p.applyInterpolated(this.alpha), this.poses.blend(p.body, this.alpha, this.blended);
    // CARENTRY: the camera shows the car from the press (door close) while the player still walks the last step
    const cv = p.camVehicle as Vehicle | null;
    if (cv && cv !== v) this.poses.blend(cv.body, this.alpha, this.blended);
    this.camTarget.x = this.blended.x; this.camTarget.z = this.blended.z; this.camHeading = this.blended.h;
    this.mouseNow = this.input.mouseDX !== 0 || this.input.mouseDY !== 0;
    this.ctx.vehicle = cv; this.ctx.ignoreId = p.cameraIgnoreId;
    this.cam.update(dt, this.camTarget, this.camHeading, cv ? 'vehicle' : 'foot', this.input as never, this.ctx as never);
    this.input.mouseDX = 0; this.input.mouseDY = 0;
    if (n > 0) this.input.pressedSet.clear();
    this.wall += dt;
    if (this.rec) this.record(dt, n);
    this.nextCut = false;
  }

  private record(dt: number, steps: number): void {
    const p = this.player, c = this.cam.camera;
    c.updateMatrixWorld(true);
    c.getWorldDirection(this.tmp);
    const dir = this.tmp.clone();
    const e = c.matrixWorld.elements;
    const look = (this.cam as unknown as { look: THREE.Vector3 }).look;
    let veh: { body: Vehicle['body']; spec: Vehicle['spec'] } | null = p.vehicle as Vehicle | null;
    if (!veh && p.isEntering) veh = this.vehicles.find((x) => x.id === p.enteringId) ?? null;
    if (!veh) veh = this.lastCarRef ?? this.vehicles[0] ?? null;
    this.frames.push({
      t: this.wall, dt, steps, mode: p.camVehicle ? 'vehicle' : 'foot', view: this.cam.viewId, entering: p.isEntering, inVehicle: p.inVehicle,
      px: c.position.x, py: c.position.y, pz: c.position.z, lx: look.x, ly: look.y, lz: look.z, dx: dir.x, dy: dir.y, dz: dir.z,
      ux: e[4], uy: e[5], uz: e[6], fov: c.fov, yaw: this.cam.yaw, first: this.cam.firstPersonAmount,
      distance: (this.cam as unknown as { distance: number }).distance,
      bx: this.camTarget.x, bz: this.camTarget.z, bh: this.camHeading,
      cx: veh ? veh.body.pos.x : 0, cz: veh ? veh.body.pos.z : 0, ch: veh ? veh.body.heading : 0,
      cl: veh ? veh.spec.length : 0, cw: veh ? veh.spec.width : 0, chh: veh ? veh.spec.height : 0, hasCar: !!veh,
      cut: this.nextCut, camCut: (this.cam as unknown as { snappedThisFrame?: boolean }).snappedThisFrame === true, mouse: this.mouseNow, lookBack: this.cam.lookBackAmount > 0.002 && this.cam.lookBackAmount < 0.998, shake: this.cam.shakeAmount,
    });
  }
  private lastCarRef: Vehicle | null = null;

  /** Run `seconds` of wall clock at the rig's frame rate (a hitch frame replaces one frame when its time comes). */
  wait(seconds: number): void {
    const end = this.wall + seconds - 1e-9;
    while (this.wall < end) {
      const h = this.opts.hitchAt;
      if (h !== undefined && !this.hitched && this.wall >= h) { this.hitched = true; this.frameDt((this.opts.hitchMs ?? 250) / 1000); }
      else this.frameDt(1 / this.opts.fps);
    }
    if (this.player.vehicle) this.lastCarRef = this.player.vehicle as Vehicle;
    else if (this.player.isEntering) this.lastCarRef = this.vehicles.find((x) => x.id === this.player.enteringId) ?? this.lastCarRef;
  }
  hold(...k: string[]): void { this.input.hold(...k); }
  press(code: string): void { this.input.press(code); }
  /** Press and let the fixed step see it on the next frame, then run `seconds`. */
  tap(code: string, seconds = 0): void { this.press(code); this.wait(Math.max(seconds, 1 / this.opts.fps)); }
  /** A mouse look: `dx` pixels over `frames` frames. */
  look(dx: number, dy = 0, frames = 6): void { for (let i = 0; i < frames; i++) { this.input.mouseDX = dx / frames; this.input.mouseDY = dy / frames; this.wait(1 / this.opts.fps); } }
  get now(): number { return this.wall; }
}

// ------------------------------------------------------------------------------------------ analysis

const deg = (r: number): number => (r * 180) / Math.PI;
export interface Stats {
  /** biggest camera position change in one frame, expressed relative to the followed body (m), outside declared cuts */
  relStep: number; relStepAt: number;
  /** biggest view direction change per second (deg/s) outside declared cuts */
  turnRate: number; turnRateAt: number;
  /** biggest one-frame field of view change per second (deg/s) */
  fovRate: number;
  nan: number;
  minAboveGround: number; minAboveGroundAt: number;
  /** frames where the camera is inside the car's body box (not counting the hood and first person views at rest) */
  insideCar: number; insideCarAt: number;
  /** biggest distance from the look target to the followed body (xz, m) */
  lookOff: number;
  /** biggest 1-frame jump of the up vector (dot product deficit as degrees) */
  upStep: number;
  /** biggest yaw (walk-forward heading) change per frame (deg) */
  yawStep: number;
}

export function carBoxContains(f: CamFrame, x: number, y: number, z: number, pad = 0): boolean {
  if (!f.hasCar) return false;
  const fx = Math.sin(f.ch), fz = -Math.cos(f.ch), rx = -fz, rz = fx;
  const dx = x - f.cx, dz = z - f.cz;
  const along = dx * fx + dz * fz, across = dx * rx + dz * rz;
  return Math.abs(along) < f.cl / 2 - pad && Math.abs(across) < f.cw / 2 - pad && y < f.chh - pad && y > 0.1;
}

/** What the camera follows: the car while driving, the player otherwise. */
export function subject(f: CamFrame): { x: number; z: number } {
  if (f.mode === 'vehicle' && f.hasCar) return { x: f.cx, z: f.cz };
  return { x: f.bx, z: f.bz };
}

/** A frame is a cut frame when the host declared it or the camera reported a snap. */
export function analyse(fr: CamFrame[], opts: { from?: number } = {}): Stats {
  const s: Stats = { relStep: 0, relStepAt: 0, turnRate: 0, turnRateAt: 0, fovRate: 0, nan: 0, minAboveGround: Infinity, minAboveGroundAt: 0, insideCar: 0, insideCarAt: -1, lookOff: 0, upStep: 0, yawStep: 0 };
  const from = opts.from ?? 0;
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    for (const k of ['px', 'py', 'pz', 'lx', 'ly', 'lz', 'dx', 'dy', 'dz', 'fov', 'yaw', 'ux', 'uy', 'uz'] as const) if (!Number.isFinite(f[k])) s.nan++;
    const ag = f.py - groundAt(f.px, f.pz);
    if (ag < s.minAboveGround) { s.minAboveGround = ag; s.minAboveGroundAt = f.t; }
    if (f.view !== 'hood' && f.view !== 'bumper' && f.view !== 'first' && f.first < 0.01) s.lookOff = Math.max(s.lookOff, Math.hypot(f.lx - f.bx, f.lz - f.bz));
    if (f.hasCar && f.inVehicle && f.first < 0.5 && f.view !== 'hood' && carBoxContains(f, f.px, f.py, f.pz)) { s.insideCar++; if (s.insideCarAt < 0) s.insideCarAt = f.t; }
    if (i === 0 || i < from) continue;
    const a = fr[i - 1];
    if (f.cut || f.camCut || f.shake > 0 || f.mouse || f.lookBack || a.lookBack) continue;
    // the subject is the car while one is in use or beside the player, else the player (the body jumps from the door to the car centre on getting in)
    // The reference is whichever of the player's body and the car moved less this frame: the followed body jumps from the door to the
    // car centre when the mode flips and the render pose settles a frame after an exit, and neither is a jump of the lens.
    const bdx = f.bx - a.bx, bdz = f.bz - a.bz, cdx = f.cx - a.cx, cdz = f.cz - a.cz;
    let rdx: number, rdz: number;
    if (a.mode !== f.mode && i >= 2) { rdx = a.bx - fr[i - 2].bx; rdz = a.bz - fr[i - 2].bz; } // the followed body jumps on the flip: carry on at the speed it had
    else { const useCar = f.hasCar && Math.hypot(cdx, cdz) < Math.hypot(bdx, bdz); rdx = useCar ? cdx : bdx; rdz = useCar ? cdz : bdz; }
    const rel = Math.hypot((f.px - a.px) - rdx, f.py - a.py, (f.pz - a.pz) - rdz);
    if (rel > s.relStep) { s.relStep = rel; s.relStepAt = f.t; }
    if (f.mouse) continue;
    const ang = deg(Math.acos(Math.max(-1, Math.min(1, a.dx * f.dx + a.dy * f.dy + a.dz * f.dz))));
    const dt = Math.max(f.dt, 1e-4);
    if (ang / dt > s.turnRate) { s.turnRate = ang / dt; s.turnRateAt = f.t; }
    s.fovRate = Math.max(s.fovRate, Math.abs(f.fov - a.fov) / dt);
    s.upStep = Math.max(s.upStep, deg(Math.acos(Math.max(-1, Math.min(1, a.ux * f.ux + a.uy * f.uy + a.uz * f.uz)))));
    s.yawStep = Math.max(s.yawStep, Math.abs(deg(angleDiff(a.yaw, f.yaw))));
  }
  return s;
}

/** The camera pose at the end of a recording, for comparing frame rates. */
export function endPose(fr: CamFrame[]): { x: number; y: number; z: number; fov: number } {
  const f = fr[fr.length - 1];
  return { x: f.px, y: f.py, z: f.pz, fov: f.fov };
}
