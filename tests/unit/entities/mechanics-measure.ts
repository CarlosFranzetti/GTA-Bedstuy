/**
 * MECHANICS harness (no browser): drives the real Player, Vehicle, World2D and ThirdPersonCamera through scripted input at 60 Hz,
 * wired like src/main.ts (control -> step -> interpolated pose -> camera target = player body on foot, car body in a car), and
 * records per frame the position, velocity, facing, the drawn figure's position, the camera's position and yaw.
 * The animation state is not recorded: the clip pack is not decoded headless, so the controller falls back to hand poses here.
 */
import * as THREE from 'three';
import { EventBus } from '@/core/Events';
import { ThirdPersonCamera } from '@/core/Camera';
import { angleDiff } from '@/core/Math2';
import { Player, WALK_SPEED, RUN_SPEED } from '@/entities/Player';
import type { Vehicle } from '@/entities/Vehicle';
import { Sim, DT, makeVehicle, stubMaterials } from '../sim/harness';

export class FakeInput {
  down = new Set<string>();
  pressedSet = new Set<string>();
  mouseDX = 0; mouseDY = 0; wheel = 0; caps = false;
  /** analog push (0..1) of the movement keys, for a pad stick */
  push = 1;
  isDown = (c: string): boolean => this.down.has(c);
  pressed = (c: string): boolean => this.pressedSet.has(c);
  consume = (c: string): boolean => this.pressedSet.delete(c);
  axis = (neg: string[], pos: string[]): number => ((pos.some((c) => this.down.has(c)) ? 1 : 0) - (neg.some((c) => this.down.has(c)) ? 1 : 0)) * this.push;
  anyInput = (): boolean => this.down.size > 0;
  hold(...k: string[]): void { this.down = new Set(k); }
}

export interface Frame {
  t: number; px: number; pz: number; vx: number; vz: number; speed: number; heading: number;
  /** the drawn figure's position (what the player sees) */
  fx: number; fz: number; fh: number; fy: number; fv: boolean;
  cx: number; cy: number; cz: number; camYaw: number; viewYaw: number; fov: number;
  mode: 'foot' | 'vehicle'; entering: boolean; inVehicle: boolean; sprint: number;
}

export class Rig {
  readonly events = new EventBus();
  readonly sim = new Sim();
  readonly input = new FakeInput();
  readonly cam = new ThirdPersonCamera();
  readonly player: Player;
  car: Vehicle | null = null;
  frames: Frame[] = [];
  readonly camTarget = { x: 0, z: 0 };
  private camHeading = 0;
  private ctx: { world: unknown; vehicle: Vehicle | null; ignoreId?: string | null };
  private tmp = new THREE.Vector3();

  constructor(start = { x: 0, z: 0 }, opts: { carAt?: { x: number; z: number; h?: number }; type?: Parameters<typeof makeVehicle>[0] } = {}) {
    this.player = new Player('player', start, stubMaterials, this.events);
    this.sim.add(this.player);
    this.events.on('enterVehicle', () => this.sim.world.removeBody(this.player.body.id));
    this.events.on('exitVehicle', () => this.sim.world.addBody(this.player.body));
    if (opts.carAt) { this.car = makeVehicle(opts.type ?? 'sedan', opts.carAt.x, opts.carAt.z, opts.carAt.h ?? 0, this.events, 'car'); this.sim.add(this.car); }
    this.ctx = { world: this.sim.world, vehicle: null };
    this.cam.world = this.sim.world;
    // settle the camera behind the standing player
    this.pose(1);
    for (let i = 0; i < 90; i++) this.tick(false);
    this.frames = [];
  }

  private pose(alpha: number): void {
    const p = this.player, v = p.vehicle;
    p.applyInterpolated(alpha);
    const b = (v ?? p).body;
    this.camTarget.x = b.pos.x; this.camTarget.z = b.pos.z; this.camHeading = b.heading;
  }

  tick(record = true): void {
    const p = this.player;
    p.control(this.input as never, this.cam.yaw);
    this.sim.step(DT);
    this.pose(1);
    this.ctx.vehicle = p.vehicle as Vehicle | null; this.ctx.ignoreId = p.cameraIgnoreId;
    this.cam.update(DT, this.camTarget, this.camHeading, p.inVehicle ? 'vehicle' : 'foot', this.input as never, this.ctx as never);
    this.input.mouseDX = 0; this.input.mouseDY = 0;
    if (!record) return;
    const c = this.cam.camera;
    c.getWorldDirection(this.tmp);
    const b = p.body;
    this.frames.push({
      t: this.sim.time, px: b.pos.x, pz: b.pos.z, vx: b.vel.x, vz: b.vel.z, speed: Math.hypot(b.vel.x, b.vel.z), heading: b.heading,
      fx: p.object3D.position.x, fz: p.object3D.position.z, fh: -p.object3D.rotation.y, fy: p.object3D.position.y, fv: p.object3D.visible,
      cx: c.position.x, cy: c.position.y, cz: c.position.z, camYaw: this.cam.yaw, viewYaw: Math.atan2(this.tmp.x, -this.tmp.z), fov: c.fov,
      mode: p.inVehicle ? 'vehicle' : 'foot', entering: p.isEntering, inVehicle: p.inVehicle, sprint: p.sprint,
    });
  }

  run(seconds: number, ...keys: string[]): void {
    this.input.hold(...keys);
    for (let i = 0; i < Math.round(seconds * 60); i++) this.tick();
  }
  mark(): number { return this.frames.length; }
}

// ----------------------------------------------------------------- metrics

const deg = (r: number): number => (r * 180) / Math.PI;
const slice = (r: Rig, from: number, to = r.frames.length): Frame[] => r.frames.slice(from, to);

/** Largest change in one frame of the camera position (m), the view yaw (deg), and the largest change of that step (jerk). */
export function cameraJerk(fr: Frame[]): { posStep: number; yawStep: number; posJerk: number; yawJerk: number; fovStep: number } {
  let posStep = 0, yawStep = 0, posJerk = 0, yawJerk = 0, fovStep = 0, pdp = 0, pdy = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i];
    const dp = Math.hypot(b.cx - a.cx, b.cy - a.cy, b.cz - a.cz), dy = deg(angleDiff(a.viewYaw, b.viewYaw));
    posStep = Math.max(posStep, dp); yawStep = Math.max(yawStep, Math.abs(dy)); fovStep = Math.max(fovStep, Math.abs(b.fov - a.fov));
    if (i > 1) { posJerk = Math.max(posJerk, Math.abs(dp - pdp)); yawJerk = Math.max(yawJerk, Math.abs(dy - pdy)); }
    pdp = dp; pdy = dy;
  }
  return { posStep, yawStep, posJerk, yawJerk, fovStep };
}

/** Camera movement relative to the player's own movement: the largest one-frame change of the camera-to-player offset (m). */
export function offsetStep(fr: Frame[]): number {
  let m = 0;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i];
    m = Math.max(m, Math.hypot((b.cx - b.fx) - (a.cx - a.fx), (b.cz - b.fz) - (a.cz - a.fz)));
  }
  return m;
}
export function figureStep(fr: Frame[]): number {
  let m = 0;
  for (let i = 1; i < fr.length; i++) if (fr[i].fv && fr[i - 1].fv) m = Math.max(m, Math.hypot(fr[i].fx - fr[i - 1].fx, fr[i].fz - fr[i - 1].fz));
  return m;
}
export function headingStep(fr: Frame[]): number {
  let m = 0;
  for (let i = 1; i < fr.length; i++) m = Math.max(m, Math.abs(deg(angleDiff(fr[i - 1].heading, fr[i].heading))));
  return m;
}
/** Largest one-frame change of the DRAWN figure's facing (deg). */
export function figureTurnStep(fr: Frame[]): number {
  let m = 0;
  for (let i = 1; i < fr.length; i++) m = Math.max(m, Math.abs(deg(angleDiff(fr[i - 1].fh, fr[i].fh))));
  return m;
}
export const traces: Record<string, Frame[]> = {};

export interface Report { [k: string]: number | string }
const r2 = (x: number): number => Math.round(x * 100) / 100;

export function measureAll(): Report {
  const out: Report = {};
  const R = (k: string, v: number | string): void => { out[k] = typeof v === 'number' ? r2(v) : v; };
  const timeTo = (fr: Frame[], pred: (f: Frame) => boolean): number => { const f = fr.find(pred); return f ? f.t - fr[0].t : NaN; };

  // 1. start to jog, then sprint, then stop
  {
    const r = new Rig();
    let m = r.mark(); r.run(1.5, 'KeyW');
    R('jog: time to 95% of full jog (s)', timeTo(slice(r, m), (f) => f.speed >= WALK_SPEED * 0.95));
    R('jog: time to first 0.5 m/s (s)', timeTo(slice(r, m), (f) => f.speed >= 0.5));
    const jogFr = slice(r, m);
    R('jog: camera pos step / yaw step (m, deg)', `${r2(cameraJerk(jogFr).posStep)} / ${r2(cameraJerk(jogFr).yawStep)}`);
    m = r.mark(); r.run(2.5, 'KeyW', 'ShiftLeft');
    R('sprint: time from jog to 95% of sprint (s)', timeTo(slice(r, m), (f) => f.speed >= RUN_SPEED * 0.95));
    const spFr = slice(r, m);
    R('sprint: camera pos step / yaw step / fov step', `${r2(cameraJerk(spFr).posStep)} m / ${r2(cameraJerk(spFr).yawStep)} deg / ${r2(cameraJerk(spFr).fovStep)}`);
    { const f0 = jogFr[jogFr.length - 1], f1 = spFr[spFr.length - 1]; R('camera distance from the player: jog / sprint (m horizontal)', `${r2(Math.hypot(f0.cx - f0.px, f0.cz - f0.pz))} / ${r2(Math.hypot(f1.cx - f1.px, f1.cz - f1.pz))}`); }
    m = r.mark(); r.run(1.2);
    const st = slice(r, m);
    const x0 = st[0].px, z0 = st[0].pz, h = st[0].heading;
    const fx = Math.sin(h), fz = -Math.cos(h);
    R('stop from sprint: time to <0.05 m/s (s)', timeTo(st, (f) => f.speed < 0.05));
    R('stop from sprint: distance (m)', Math.hypot(st[st.length - 1].px - x0, st[st.length - 1].pz - z0));
    R('stop from sprint: backward velocity overshoot (m/s)', Math.max(0, ...st.map((f) => -(f.vx * fx + f.vz * fz))));
    R('stop from sprint: largest speed drop in one frame (m/s)', Math.max(...st.slice(1).map((f, i) => st[i].speed - f.speed)));
    const sp0 = st[0].speed;
    R('stop from sprint: speed at start of release (m/s)', sp0);
  }
  {
    const r = new Rig();
    r.run(1.5, 'KeyW');
    const m = r.mark(); r.run(1);
    const st = slice(r, m);
    R('stop from jog: time to <0.05 m/s (s)', timeTo(st, (f) => f.speed < 0.05));
    R('stop from jog: distance (m)', Math.hypot(st[st.length - 1].px - st[0].px, st[st.length - 1].pz - st[0].pz));
    R('stop from jog: largest speed drop in one frame (m/s)', Math.max(...st.slice(1).map((f, i) => st[i].speed - f.speed)));
  }
  // 2. walk by stick tilt
  for (const push of [0.4, 0.7, 1]) {
    const r = new Rig(); r.input.push = push; r.run(2, 'KeyW');
    R(`stick tilt ${push}: speed after 2 s (m/s)`, r.frames[r.frames.length - 1].speed);
  }
  // 3. turning: 90 degrees at each speed
  for (const [name, keys, secs] of [['walk', ['AltLeft'], 1.2], ['jog', [], 1.5], ['sprint', ['ShiftLeft'], 2.2]] as const) {
    const r = new Rig();
    r.run(secs, 'KeyW', ...keys);
    const m = r.mark();
    // turn right (the camera follows as it likes): the heading goes round to face the new direction
    r.run(1.2, 'KeyW', 'KeyD', ...keys);
    const fr = slice(r, m);
    const h0 = fr[0].heading;
    let peak = 0;
    for (let i = 1; i < fr.length; i++) peak = Math.max(peak, Math.abs(deg(angleDiff(fr[i - 1].heading, fr[i].heading))) * 60);
    const total = Math.abs(deg(angleDiff(h0, fr[fr.length - 1].heading)));
    R(`turn ${name}: heading change in 1.2 s (deg)`, total);
    R(`turn ${name}: peak turn rate (deg/s) / largest one-frame change (deg)`, `${r2(peak)} / ${r2(headingStep(fr))}`);
    R(`turn ${name}: speed lost at the lowest point (m/s of ${r2(fr[0].speed)})`, fr[0].speed - Math.min(...fr.map((f) => f.speed)));
    const cj = cameraJerk(fr);
    R(`turn ${name}: camera pos step / yaw step / yaw jerk`, `${r2(cj.posStep)} m / ${r2(cj.yawStep)} deg / ${r2(cj.yawJerk)} deg`);
  }
  // 4. reversal at jog and sprint: W then S
  for (const [name, keys, secs] of [['jog', [], 1.5], ['sprint', ['ShiftLeft'], 2.2]] as const) {
    const r = new Rig(); r.run(secs, 'KeyW', ...keys);
    const m = r.mark(); r.run(1.2, 'KeyS', ...keys);
    const fr = slice(r, m);
    const fx = Math.sin(fr[0].heading), fz = -Math.cos(fr[0].heading);
    R(`reverse ${name}: time until moving backwards at 0.5 m/s (s)`, timeTo(fr, (f) => f.vx * fx + f.vz * fz < -0.5));
    R(`reverse ${name}: lowest speed in between (m/s)`, Math.min(...fr.map((f) => f.speed)));
    R(`reverse ${name}: largest one-frame heading change (deg)`, headingStep(fr));
    const cj = cameraJerk(fr);
    R(`reverse ${name}: camera pos step / yaw step`, `${r2(cj.posStep)} m / ${r2(cj.yawStep)} deg`);
  }
  // 5. into a wall at sprint
  {
    const r = new Rig({ x: 0, z: 0 });
    r.sim.world.addStatic({ kind: 'polygon', points: [{ x: -3, z: -9 }, { x: 3, z: -9 }, { x: 3, z: -8 }, { x: -3, z: -8 }] }, { x: 0, z: 0 }, 'wall');
    r.run(3, 'KeyW', 'ShiftLeft');
    const fr = r.frames;
    let hit = 1, worst = 0;
    for (let i = 1; i < fr.length; i++) if (fr[i - 1].speed - fr[i].speed > worst) { worst = fr[i - 1].speed - fr[i].speed; hit = i; }
    const pre = fr[hit - 1].speed;
    R('wall at sprint: speed before contact (m/s)', pre);
    R('wall at sprint: frames from the biggest drop to under 0.3 m/s', fr.slice(hit).findIndex((f) => f.speed < 0.3));
    R('wall at sprint: speed over the 0.5 s before the biggest drop (m/s, min..max)', `${r2(Math.min(...fr.slice(Math.max(0, hit - 30), hit).map((f) => f.speed)))}..${r2(pre)}`);
    R('wall at sprint: largest speed drop in one frame (m/s)', Math.max(...fr.slice(1).map((f, i) => fr[i].speed - f.speed)));
    const cj = cameraJerk(fr.slice(Math.max(1, hit - 30)));
    R('wall at sprint: camera pos step / yaw step', `${r2(cj.posStep)} m / ${r2(cj.yawStep)} deg`);
  }
  // 6. enter and leave a car
  {
    const r = new Rig({ x: 0, z: 3 }, { carAt: { x: 0, z: 0, h: 0 } });
    const car = r.car!;
    r.run(0.5);
    const m0 = r.mark();
    r.player.tryEnter([car]);
    let tIn = NaN, tDrive = NaN;
    const tPress = r.sim.time;
    for (let i = 0; i < 180; i++) {
      r.tick();
      if (Number.isNaN(tIn) && r.player.inVehicle) { tIn = r.sim.time - tPress; r.input.hold('KeyW'); }
      if (!Number.isNaN(tIn) && Number.isNaN(tDrive) && car.speed > 0.5) tDrive = r.sim.time - tPress;
    }
    // drive: throttle after getting in
    const m1 = r.mark();
    R('enter: press F to seated (inVehicle) (s)', tIn);
    R('enter: press F to car moving under control (s)', tDrive);
    const enterFr = slice(r, m0, m1);
    const cj = cameraJerk(enterFr);
    R('enter: camera pos step / yaw step / fov step', `${r2(cj.posStep)} m / ${r2(cj.yawStep)} deg / ${r2(cj.fovStep)} deg`);
    R('enter: camera-to-figure offset, largest one-frame change (m)', offsetStep(enterFr));
    R('enter: figure largest one-frame move while visible (m) (walk is ~0.05)', figureStep(enterFr));
    R('enter: figure facing largest one-frame change (deg)', figureTurnStep(enterFr));
    traces.enter = enterFr;
    // sprint up to speed then leave
    r.run(4, 'KeyW');
    R('exit: car speed when F is pressed (m/s)', car.speed);
    const m2 = r.mark();
    const px = r.player.body.pos.x, pz = r.player.body.pos.z;
    r.input.hold();
    const carBefore = { x: car.body.pos.x, z: car.body.pos.z };
    r.player.exit();
    r.tick();
    const b = r.player.body;
    R('exit: figure jump on the exit frame (m from the seat)', Math.hypot(b.pos.x - px, b.pos.z - pz));
    R('exit: figure speed on leaving a car at speed (m/s)', Math.hypot(b.vel.x, b.vel.z));
    r.run(1.5);
    const exitFr = slice(r, m2);
    const cj2 = cameraJerk(exitFr);
    R('exit: camera pos step / yaw step', `${r2(cj2.posStep)} m / ${r2(cj2.yawStep)} deg`);
    R('exit: camera-to-figure offset, largest one-frame change (m)', offsetStep(exitFr));
    R('exit: figure largest one-frame move (m)', figureStep(exitFr));
    R('exit: figure facing largest one-frame change (deg)', figureTurnStep(exitFr));
    traces.exit = exitFr;
    void carBefore;
  }
  // 7. driving round a corner
  {
    const r = new Rig({ x: 0, z: 2.2 }, { carAt: { x: 0, z: 0, h: 0 } });
    r.player.tryEnter([r.car!]);
    r.run(1.2);
    r.run(4, 'KeyW');
    const m = r.mark();
    r.run(2.2, 'KeyW', 'KeyD');
    r.run(2, 'KeyW');
    const fr = slice(r, m);
    const cj = cameraJerk(fr);
    R('drive corner: car speed at turn-in (m/s)', fr[0].speed);
    R('drive corner: camera pos step / yaw step / yaw jerk / pos jerk', `${r2(cj.posStep)} m / ${r2(cj.yawStep)} deg / ${r2(cj.yawJerk)} deg / ${r2(cj.posJerk)} m`);
    let maxLag = 0;
    for (const f of fr) maxLag = Math.max(maxLag, Math.abs(deg(angleDiff(f.viewYaw, f.heading))));
    R('drive corner: largest view yaw minus car heading (deg)', maxLag);
    R('drive corner: fov range (deg)', `${r2(Math.min(...fr.map((f) => f.fov)))} to ${r2(Math.max(...fr.map((f) => f.fov)))}`);
    const dist = fr.map((f) => Math.hypot(f.cx - f.px, f.cz - f.pz));
    R('drive corner: camera distance from car, min to max (m)', `${r2(Math.min(...dist))} to ${r2(Math.max(...dist))}`);
  }
  // 8. walking camera: straight, then looping turns
  {
    const r = new Rig();
    r.run(2, 'KeyW');
    const m = r.mark();
    r.run(1, 'KeyW', 'KeyD'); r.run(1, 'KeyW', 'KeyA'); r.run(1, 'KeyA'); r.run(1, 'KeyS');
    const fr = slice(r, m);
    const cj = cameraJerk(fr);
    R('walk zig-zag: camera pos step / yaw step / yaw jerk', `${r2(cj.posStep)} m / ${r2(cj.yawStep)} deg / ${r2(cj.yawJerk)} deg`);
    R('walk zig-zag: camera-to-figure offset change per frame (m)', offsetStep(fr));
  }
  return out;
}
