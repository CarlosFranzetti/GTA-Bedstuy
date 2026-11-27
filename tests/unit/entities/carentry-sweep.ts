/**
 * CARENTRY sweep (not a test file): get into and out of a car from the driver's side, the passenger side and from behind, with and
 * without a wall close to the player, in Classic and Modern, at any frame rate, and record what the lens does on every frame between
 * the key press and the settled view. Built on the CAMFIX rig (the real camera, player, vehicle and physics, driven as main.ts does).
 *
 * "Inside" tests: the lens against the car's box, the character's capsule and the static walls, all in plain metres.
 */
import { CamRig, carBoxContains, type CamFrame } from './camfix-harness';
import type { Vec2 } from '@/core/Math2';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import type { VehicleType } from '@/world/types';

export type Approach = 'driver' | 'passenger' | 'behind' | 'driver-wall';
export const APPROACHES: Approach[] = ['driver', 'passenger', 'behind', 'driver-wall'];
export const TYPES: VehicleType[] = ['sedan', 'suv', 'boxtruck', 'bus'];

const box = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

export interface CaseOpts { type: VehicleType; approach: Approach; style: 'classic' | 'modern'; fps: number; /** metres from the door the player starts */ gap?: number }

export interface CaseResult {
  opts: CaseOpts;
  frames: CamFrame[];
  walls: Array<[number, number, number, number]>;
  /** frame indices */
  iEnter: number; iDrive: number; iExit: number; iOut: number;
  m: Metrics;
  /** per frame flags, same length as frames */
  inCar: boolean[]; inBody: boolean[]; inWall: boolean[]; wallDist: number[]; speed: number[];
}
export interface Metrics {
  enterPressToDrive: number; enterSettled: number; exitSettled: number;
  framesInCar: number; framesInBody: number; framesInWall: number;
  firstInCar: number; firstInBody: number; firstInWall: number;
  minWallDist: number; maxLensSpeed: number; maxRelStep: number; cutFrames: number;
  /** closest the lens gets to the car's box surface and to the character's capsule axis (m), from the press on */
  minCarDist: number; minBodyDist: number;
  /** frames from the press on where the lens is nearer than the near plane plus 5 cm to the car box or the standing character: they are cut open on screen */
  framesNearClip: number; firstNearClip: number;
  /** frames from the press on where the line from lens to look point passes through the car box while the lens is outside it (the car is between the lens and what it films) */
  framesThroughCar: number;
}
const NEAR = 0.2;

/** Player capsule (radius, height). */
const BODY_R = 0.32, BODY_H = 1.85;

function pointInBox(x: number, z: number, w: [number, number, number, number], pad = 0): boolean { return x > w[0] - pad && x < w[2] + pad && z > w[1] - pad && z < w[3] + pad; }
function boxDist(x: number, z: number, w: [number, number, number, number]): number {
  const dx = Math.max(w[0] - x, 0, x - w[2]), dz = Math.max(w[1] - z, 0, z - w[3]);
  return Math.hypot(dx, dz);
}

/** Distance from a point to the outside of the car's oriented box (0 inside). */
function carDist(f: CamFrame, x: number, y: number, z: number): number {
  const fx = Math.sin(f.ch), fz = -Math.cos(f.ch), rx = -fz, rz = fx;
  const dx = x - f.cx, dz = z - f.cz;
  const along = dx * fx + dz * fz, across = dx * rx + dz * rz;
  const ex = Math.max(Math.abs(along) - f.cl / 2, 0), ez = Math.max(Math.abs(across) - f.cw / 2, 0), ey = Math.max(0.05 - y, y - f.chh, 0);
  return Math.hypot(ex, ez, ey);
}
function segThroughCar(f: CamFrame, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  for (let i = 1; i < 24; i++) { const u = i / 24; if (carBoxContains(f, ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u, 0.05)) return true; }
  return false;
}

export function runCase(o: CaseOpts): CaseResult {
  const spec = VEHICLE_SPECS[o.type];
  const gap = o.gap ?? 0.8;
  const doorX = spec.width / 2 + 0.3;
  let start: Vec2, heading: number;
  const walls: Array<[number, number, number, number]> = [];
  if (o.approach === 'passenger') { start = { x: doorX + gap, z: 0.2 }; heading = -Math.PI / 2; }
  else if (o.approach === 'behind') { start = { x: 0, z: spec.length / 2 + 1.2 }; heading = 0; }
  else { start = { x: -(doorX + gap), z: 0.2 }; heading = Math.PI / 2; }
  if (o.approach === 'driver-wall') walls.push([start.x - 2.5, -8, start.x - 0.45, 8]); // a wall 0.45 m behind the player's shoulder
  const rig = new CamRig({ fps: o.fps, car: { x: 0, z: 0, h: 0, type: o.type }, start, startHeading: heading, walls: walls.map((w) => box(w[0], w[1], w[2], w[3])), style: o.style });
  const r0 = rig.frames.length;
  rig.wait(0.3);
  const iEnter = rig.frames.length - r0;
  rig.tap('KeyF', 1.6);
  rig.wait(1.0);
  const iExit = rig.frames.length - r0;
  rig.tap('KeyF', 2.0);
  const fr = rig.frames.slice(r0);
  const iDrive = fr.findIndex((f) => f.inVehicle);
  let iOut = -1; for (let i = Math.max(iDrive, 0); i < fr.length; i++) if (!fr[i].inVehicle) { iOut = i; break; }

  const inCar: boolean[] = [], inBody: boolean[] = [], inWall: boolean[] = [], wallDist: number[] = [], speed: number[] = [];
  let maxRel = 0, cuts = 0;
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    inCar.push(f.hasCar && carBoxContains(f, f.px, f.py, f.pz));
    // the character is on screen on foot, while entering and for a moment after sitting down: its capsule stands at the player's body
    const px = f.mode === 'vehicle' ? f.cx : f.bx, pz = f.mode === 'vehicle' ? f.cz : f.bz;
    inBody.push(f.mode === 'foot' && Math.hypot(f.px - px, f.pz - pz) < BODY_R && f.py > 0 && f.py < BODY_H);
    inWall.push(walls.some((w) => pointInBox(f.px, f.pz, w)));
    wallDist.push(walls.length ? Math.min(...walls.map((w) => boxDist(f.px, f.pz, w))) : Infinity);
    if (i === 0) speed.push(0);
    else { const a = fr[i - 1]; speed.push(Math.hypot(f.px - a.px, f.py - a.py, f.pz - a.pz) / Math.max(f.dt, 1e-4)); }
    if (f.camCut) cuts++;
  }
  // settled: the lens moves at less than 0.3 m/s relative to the followed body for 0.25 s
  const settledFrom = (i0: number): number => {
    const need = Math.ceil(0.25 * o.fps);
    let run = 0;
    for (let i = Math.max(i0, 1); i < fr.length; i++) {
      const a = fr[i - 1], f = fr[i];
      const sx = f.mode === 'vehicle' ? f.cx : f.bx, sz = f.mode === 'vehicle' ? f.cz : f.bz, ax = a.mode === 'vehicle' ? a.cx : a.bx, az = a.mode === 'vehicle' ? a.cz : a.bz;
      const rel = Math.hypot((f.px - a.px) - (sx - ax), f.py - a.py, (f.pz - a.pz) - (sz - az)) / Math.max(f.dt, 1e-4);
      run = rel < 0.3 ? run + 1 : 0;
      if (run >= need) return fr[i - need + 1].t - fr[i0].t;
    }
    return Infinity;
  };
  for (let i = iEnter + 1; i < fr.length; i++) {
    const a = fr[i - 1], f = fr[i];
    if (f.camCut) continue;
    const sx = f.mode === 'vehicle' ? f.cx : f.bx, sz = f.mode === 'vehicle' ? f.cz : f.bz, ax = a.mode === 'vehicle' ? a.cx : a.bx, az = a.mode === 'vehicle' ? a.cz : a.bz;
    maxRel = Math.max(maxRel, Math.hypot((f.px - a.px) - (sx - ax), f.py - a.py, (f.pz - a.pz) - (sz - az)));
  }
  let minCar = Infinity, minBody = Infinity, nearN = 0, firstNear = -1, thruN = 0;
  for (let i = iEnter; i < fr.length; i++) {
    const f = fr[i];
    const dc = f.hasCar ? carDist(f, f.px, f.py, f.pz) : Infinity;
    // the character stands at the player's body while on foot or entering; seated it is inside the car
    const dbody = f.mode === 'foot' ? Math.hypot(f.px - f.bx, f.pz - f.bz) - BODY_R : Infinity;
    const dbv = dbody < Infinity && f.py > 0 && f.py < BODY_H ? dbody : Infinity;
    minCar = Math.min(minCar, dc); minBody = Math.min(minBody, dbv);
    if (dc < NEAR + 0.05 || dbv < NEAR + 0.05) { nearN++; if (firstNear < 0) firstNear = i; }
    if (f.hasCar && f.mode === 'foot' && dc > 0 && segThroughCar(f, f.px, f.py, f.pz, f.lx, f.ly, f.lz)) thruN++;
  }
  const first = (arr: boolean[]): number => arr.indexOf(true);
  const count = (arr: boolean[]): number => arr.filter(Boolean).length;
  const m: Metrics = {
    enterPressToDrive: iDrive >= 0 ? fr[iDrive].t - fr[iEnter].t : Infinity,
    enterSettled: settledFrom(iEnter), exitSettled: settledFrom(iExit),
    framesInCar: count(inCar), framesInBody: count(inBody), framesInWall: count(inWall),
    firstInCar: first(inCar), firstInBody: first(inBody), firstInWall: first(inWall),
    minWallDist: walls.length ? Math.min(...wallDist) : Infinity,
    maxLensSpeed: Math.max(...speed.slice(iEnter)), maxRelStep: maxRel, cutFrames: cuts,
    minCarDist: minCar, minBodyDist: minBody, framesNearClip: nearN, firstNearClip: firstNear, framesThroughCar: thruN,
  };
  return { opts: o, frames: fr, walls, iEnter, iDrive, iExit, iOut, m, inCar, inBody, inWall, wallDist, speed };
}
