/** CAMFIX scenarios: every one starts with the rig settled and recording; time 0 is the first frame. */
import type { CamRig, RigOpts } from './camfix-harness';
import type { Vec2 } from '@/core/Math2';

export interface Scenario {
  name: string;
  opts: Partial<RigOpts>;
  /** seconds after which the hitch is tried (the action window) */
  window: number;
  run: (r: CamRig) => void;
  /** meant to be rough: cuts are declared by the script */
}

const SIDE_DOOR = { x: -2.0, z: 0.2 };       // driver (left) side of a car at the origin facing north (heading 0)
const PASSENGER = { x: 2.0, z: 0.2 };
const box = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

const driveOff = (r: CamRig, s = 3): void => { r.hold('KeyW'); r.wait(s); };

export const SCENARIOS: Scenario[] = [
  { name: 'enter-drive-off', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, startHeading: Math.PI / 2 }, window: 2.4,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.2); driveOff(r, 3); } },
  { name: 'enter-from-behind', opts: { car: { x: 0, z: 0 }, start: { x: 0, z: 4 }, startHeading: 0 }, window: 2.4,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.2); driveOff(r, 2); } },
  { name: 'enter-facing-car-front', opts: { car: { x: 0, z: 0, h: Math.PI }, start: { x: 0, z: -4 }, startHeading: Math.PI }, window: 2.4,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.2); driveOff(r, 2); } },
  { name: 'brake-and-exit-stopped', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.2); driveOff(r, 2.5); r.hold('Space'); r.wait(2.5); r.hold(); r.tap('KeyF', 3); } },
  { name: 'exit-moving-step', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 7,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(1.1); r.hold(); r.tap('KeyF', 3); } },
  { name: 'exit-moving-roll', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 7,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(3); r.tap('KeyF', 3.5); } },
  { name: 'passenger-side', opts: { car: { x: 0, z: 0 }, start: PASSENGER, startHeading: -Math.PI / 2 }, window: 3,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.5); driveOff(r, 1.5); r.hold(); r.tap('KeyF', 3); } },
  { name: 'against-wall', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, walls: [box(-5, 0.6 + 1.2, 5, 3)].concat([box(-5, -3, -2.6, 3)]) }, window: 3,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.5); r.wait(0.5); r.tap('KeyF', 3); } },
  { name: 'under-el-pillars', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, walls: [-8, -2, 4, 10].map((z) => box(-1.2, z, 1.2 - 2.4 + 2.4, z + 0.6)).filter((_, i) => i !== 1 && i !== 2) }, window: 3,
    run: (r) => { r.wait(0.2); r.tap('KeyF', 1.5); driveOff(r, 1.5); r.hold(); r.tap('KeyF', 3); } },
  { name: 'enter-mid-lookaround', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, startHeading: Math.PI / 2 }, window: 3,
    run: (r) => { r.look(500, 40, 8); r.wait(0.3); r.tap('KeyF', 2.5); } },
  { name: 'enter-mid-snapback', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, startHeading: Math.PI / 2 }, window: 4,
    run: (r) => { r.look(-600, 0, 8); r.wait(2.9); r.tap('KeyF', 2.5); } },
  { name: 'enter-idle-cinematic', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, startHeading: Math.PI / 2 }, window: 10,
    run: (r) => { r.wait(9.5); r.tap('KeyF', 2.5); } },
  { name: 'enter-first-person-foot', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR, startHeading: Math.PI / 2 }, window: 3,
    run: (r) => { r.tap('KeyV', 0.3); r.tap('KeyV', 0.3); r.tap('KeyV', 0.3); r.wait(0.8); r.tap('KeyF', 2.5); } },
  { name: 'cycle-views-slow-driving', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 9,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(2); for (let i = 0; i < 6; i++) r.tap('KeyV', 1.0); } },
  { name: 'cycle-views-fast', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 3,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(2); for (let i = 0; i < 4; i++) r.tap('KeyV', 0.09); r.wait(1); for (let i = 0; i < 3; i++) r.tap('KeyV', 0.09); r.wait(1.5); } },
  { name: 'cycle-views-hard-turn', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(2.5); r.hold('KeyW', 'KeyD'); for (let i = 0; i < 5; i++) r.tap('KeyV', 0.7); r.hold(); r.wait(1.5); } },
  { name: 'cycle-views-reversing', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyS'); r.wait(2.2); for (let i = 0; i < 5; i++) r.tap('KeyV', 0.7); r.hold(); r.wait(1.5); } },
  { name: 'cycle-views-lookback-held', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(2.2); r.hold('KeyW', 'KeyC'); r.wait(0.5); for (let i = 0; i < 5; i++) r.tap('KeyV', 0.7); r.hold('KeyW'); r.wait(1.5); } },
  { name: 'cycle-views-top-speed', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 12,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(9); for (let i = 0; i < 5; i++) r.tap('KeyV', 0.7); r.wait(1.5); } },
  { name: 'cinematic-and-back', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 10,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(2); r.cam.views.setView('vehicle', 'cinematic'); r.wait(8); r.cam.views.setView('vehicle', 'chase'); r.wait(2); } },
  { name: 'leave-in-hood-view', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.tap('KeyF', 1.2); r.cam.views.setView('vehicle', 'hood'); r.wait(1.2); r.hold(); r.tap('KeyF', 3); r.tap('KeyF', 3); } },
  { name: 'leave-in-cinematic-view', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 7,
    run: (r) => { r.tap('KeyF', 1.2); r.cam.views.setView('vehicle', 'cinematic'); r.wait(2.2); r.tap('KeyF', 3); r.tap('KeyF', 3); } },
  { name: 'car-to-car', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.addCar(-4, 0, 0); r.tap('KeyF', 1.2); r.wait(0.5); r.tap('KeyF', 0.6); r.player.body.pos.x = -2.2; r.tap('KeyF', 3); } },
  { name: 'hit-while-entering', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 3,
    run: (r) => { r.tap('KeyF', 0.15); r.car.body.vel.x = 7; r.car.body.vel.z = -3; r.cam.addShake(1); r.wait(2.5); } },
  { name: 'teleport-while-driving', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 6,
    run: (r) => { r.tap('KeyF', 1.2); r.hold('KeyW'); r.wait(2); r.declareCut(); r.car.body.pos.x += 200; r.car.body.pos.z += 90; r.wait(2); } },
  { name: 'pause-resume-mid-enter', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 4,
    run: (r) => { r.tap('KeyF', 0.3); r.frameDt(0.5); r.wait(1.5); } },
  { name: 'aspect-change-mid-enter', opts: { car: { x: 0, z: 0 }, start: SIDE_DOOR }, window: 4,
    run: (r) => { r.tap('KeyF', 0.3); r.cam.setAspect(9 / 19.5); r.wait(0.4); r.cam.setAspect(16 / 9); r.wait(1.5); } },
];
