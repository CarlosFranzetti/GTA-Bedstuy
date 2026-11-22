/**
 * The tutorial reads the game through a `TutorialHost`: a handful of getters main.ts hands over once. `makeContext` fills one reused
 * `TutorialCtx` from it each frame (no allocation). The step tests in steps.ts only ever see the ctx.
 */
import type { Bindings } from '@/core/Bindings';
import type { Vec2 } from '@/core/Math2';
import type { Device, TutorialCtx } from './types';

export interface HostVehicle { id: string; body: { pos: Vec2 } }

export interface TutorialHost {
  input: {
    mode: Device;
    readonly bindings: Bindings;
    pressCount(code: string): number;
    isDown(code: string): boolean;
  };
  player: {
    readonly inVehicle: boolean;
    readonly vehicle: { speed: number; id: string; body: { pos: Vec2 } } | null;
    readonly body: { pos: Vec2; vel: Vec2 };
    readonly sprint: number;
    readonly jumpHeight: number;
    readonly isVaulting: boolean;
    readonly lastVehicleInput: { brake: boolean; handbrake: boolean; throttle: number };
  };
  camera: { readonly yaw: number; readonly views: { readonly serial: number } };
  vehicles(): readonly HostVehicle[];
  /** Positions of the pickups lying on the ground now. */
  pickups(): Iterable<Vec2>;
  /** Changes when the hands pick up, fire or change item. */
  handsSig(): string;
  panelTop(): string | null;
  /** The title, a room, a fade, a mission beat or a pause: the card waits. Panels are covered by `panelTop`. */
  blocked(): boolean;
  waypoint(): boolean;
  homeDist(): number;
  stars(): number;
  heat(): number;
  raining(): boolean;
  prompt(): string;
  mission(): boolean;
}

const FAR = 60;

export function newContext(): TutorialCtx {
  return {
    device: 'keyboard', blocked: false, inVehicle: false, speed: 0, sprint: 0, yaw: 0, x: 0, z: 0, jumpHeight: 0, vaulting: false,
    nearCar: Infinity, nearPickup: Infinity, handsSig: '', braking: false, handbraking: false, viewSerial: 0, panel: null, waypoint: false,
    homeDist: Infinity, stars: 0, heat: 0, raining: false, prompt: '', mission: false,
    presses: () => 0, held: () => false,
  };
}

/** Fill `c` from the host (`presses` and `held` are bound once by the Tutorial). `heavy` = also scan the cars and pickups (only while the tutorial runs). */
export function fillContext(c: TutorialCtx, h: TutorialHost, heavy: boolean): TutorialCtx {
  const p = h.player;
  c.device = h.input.mode;
  c.panel = h.panelTop();
  c.blocked = c.panel !== null || h.blocked();
  c.inVehicle = p.inVehicle;
  c.speed = p.vehicle ? Math.abs(p.vehicle.speed) : Math.hypot(p.body.vel.x, p.body.vel.z);
  c.sprint = p.sprint;
  c.yaw = h.camera.yaw;
  c.x = p.body.pos.x; c.z = p.body.pos.z;
  c.jumpHeight = p.jumpHeight;
  c.vaulting = p.isVaulting;
  c.braking = p.lastVehicleInput.brake || p.lastVehicleInput.throttle < -0.3;
  c.handbraking = p.lastVehicleInput.handbrake;
  c.viewSerial = h.camera.views.serial;
  c.waypoint = h.waypoint();
  c.homeDist = h.homeDist();
  c.stars = h.stars();
  c.heat = h.heat();
  c.raining = h.raining();
  c.prompt = h.prompt();
  c.mission = h.mission();
  if (heavy) {
    c.handsSig = h.handsSig();
    let best = FAR * FAR;
    const drivenId = p.vehicle?.id;
    for (const v of h.vehicles()) {
      if (v.id === drivenId) continue;
      const dx = v.body.pos.x - c.x, dz = v.body.pos.z - c.z, d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    c.nearCar = best < FAR * FAR ? Math.sqrt(best) : Infinity;
    let bp = FAR * FAR;
    for (const q of h.pickups()) { const dx = q.x - c.x, dz = q.z - c.z, d = dx * dx + dz * dz; if (d < bp) bp = d; }
    c.nearPickup = bp < FAR * FAR ? Math.sqrt(bp) : Infinity;
  }
  return c;
}
