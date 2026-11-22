/**
 * The tutorial, as data. Add, remove or reorder steps here and nothing else changes. Every step has a line per device
 * (keyboard and mouse, pad, touch); the keys in the lines are tokens, so they follow the binding table and a rebind.
 *
 * Voice: dry, friendly, a little Brooklyn. Short. No exclamation marks. No other game is named.
 * Tokens: {jump} = the key, pad button or touch caption bound to the action now; {=EXIT} = a literal cap; {move} and {look} = the
 * four movement keys, or the stick; {confirm} = click or the pad's A; {pause} = Esc or the pad's menu button.
 */
import type { StepDef, StepState, TutorialCtx } from './types';

const TAU = Math.PI * 2;
const angDiff = (a: number, b: number): number => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const add = (s: StepState, k: string, v: number): number => (s.acc[k] = (s.acc[k] ?? 0) + v);
const press = (c: TutorialCtx, s: StepState, code: string): number => c.presses(code) - (Number(s.base[`p:${code}`]) || 0);
const mark = (c: TutorialCtx, s: StepState, ...codes: string[]): void => { for (const code of codes) s.base[`p:${code}`] = c.presses(code); };

/** How close counts as "near a parked car" for the vault and for getting in. */
export const VAULT_NEAR_M = 7;
export const CAR_NEAR_M = 30;
export const PICKUP_NEAR_M = 45;
export const HOME_NEAR_M = 15;

export const STEPS: readonly StepDef[] = [
  {
    id: 'look',
    text: { keyboard: 'Move the mouse to look around.', gamepad: 'Push the {look} to look around.', touch: 'Drag on the right side of the screen to look around.' },
    plain: { keyboard: 'Slide the mouse side to side. If the view will not turn, click the game once.', gamepad: 'Push the {look} left or right.', touch: 'Put a thumb on the right half of the screen and drag.' },
    why: 'Worth knowing who is behind you.',
    start: (c, s) => { s.acc.prev = c.yaw; },
    done: (c, s) => { add(s, 'turn', Math.abs(angDiff(c.yaw, s.acc.prev ?? c.yaw))); s.acc.prev = c.yaw; return (s.acc.turn ?? 0) >= 1.1; },
  },
  {
    id: 'walk',
    text: { keyboard: 'Hold {move} to walk.', gamepad: 'Push the {move} to walk.', touch: 'Hold a thumb on the left side of the screen and drag to walk.' },
    plain: { keyboard: 'Hold {moveForward} to go forward. {moveLeft} and {moveRight} go left and right.', gamepad: 'Push the left stick forward.', touch: 'Press and hold on the left half, then drag the way you want to go.' },
    why: 'The stoops, the avenue and the corner store are all a walk away.',
    when: (c) => !c.inVehicle,
    start: (c, s) => { s.acc.x = c.x; s.acc.z = c.z; },
    done: (c, s) => { const d = Math.hypot(c.x - (s.acc.x ?? c.x), c.z - (s.acc.z ?? c.z)); s.acc.x = c.x; s.acc.z = c.z; if (d < 3) add(s, 'dist', d); return (s.acc.dist ?? 0) >= 8; },
  },
  {
    id: 'run',
    text: { keyboard: 'Hold {sprint} while you walk to run.', gamepad: 'Hold {sprint} while you walk to run.', touch: 'Tap {sprint} to run, tap it again to stop.' },
    why: 'Walking is a jog already. This is the fast one.',
    when: (c) => !c.inVehicle,
    done: (c, s, dt) => { if (c.sprint > 0.6 && c.speed > 4) add(s, 'fast', dt); return (s.acc.fast ?? 0) >= 1; },
  },
  {
    id: 'jump',
    text: { keyboard: 'Press {jump} to jump.', gamepad: 'Press {jump} to jump.', touch: 'Tap {jump} to jump.' },
    why: 'Handy for low fences.',
    when: (c) => !c.inVehicle,
    done: (c) => c.jumpHeight > 0.08,
  },
  {
    id: 'vault',
    text: { keyboard: 'Run at the hood of a parked car and press {jump} to go over it.', gamepad: 'Run at the hood of a parked car and press {jump} to go over it.', touch: 'Run at the hood of a parked car and tap {jump} to go over it.' },
    plain: { keyboard: 'Face the front of the car from a step away, run at it and press {jump}.', gamepad: 'Face the front of the car from a step away, run at it and press {jump}.', touch: 'Face the front of the car from a step away, run at it and tap {jump}.' },
    why: 'Boxed in between two cars? Same move gets you out.',
    opportunistic: true,
    when: (c) => !c.inVehicle && c.nearCar <= VAULT_NEAR_M,
    done: (c) => c.vaulting,
  },
  {
    id: 'car',
    text: { keyboard: 'Walk up to a car and press {enter} to get in.', gamepad: 'Walk up to a car and press {enter} to get in.', touch: 'Walk up to a car and tap {enter} to get in.' },
    plain: { keyboard: 'Stand beside a door of any parked car and press {enter}.', gamepad: 'Stand beside a door of any parked car and press {enter}.', touch: 'Stand beside a door of any parked car. The {=CAR} button lights up. Tap it.' },
    why: 'Walking is fine. Driving is faster.',
    when: (c) => !c.inVehicle && c.nearCar <= CAR_NEAR_M,
    done: (c) => c.inVehicle,
  },
  {
    id: 'drive',
    text: { keyboard: 'Hold {moveForward} to drive. {moveLeft} and {moveRight} steer.', gamepad: 'Pull {moveForward} to drive. Steer with the {moveLeft}.', touch: 'Hold {=GAS} to drive. Steer with your left thumb.' },
    why: 'Take the road. Mind the pedestrians.',
    when: (c) => c.inVehicle,
    done: (c, s, dt) => { if (c.inVehicle && c.speed > 4) add(s, 'moving', dt); return (s.acc.moving ?? 0) >= 1.5; },
  },
  {
    id: 'brake',
    text: { keyboard: 'Hold {moveBack} to brake. Tap {handbrake} for the handbrake.', gamepad: 'Hold {moveBack} to brake. Press {handbrake} for the handbrake.', touch: 'Tap {=BRAKE} to brake and {=HAND} for the handbrake.' },
    plain: { keyboard: 'While moving, hold {moveBack}. Then tap {handbrake} for a short slide.', gamepad: 'While moving, hold {moveBack}. Then press {handbrake} for a short slide.', touch: 'While moving, hold {=BRAKE}. Then tap {=HAND} for a short slide.' },
    why: 'The handbrake locks the back wheels. Good for corners, hard on tyres.',
    when: (c) => c.inVehicle,
    done: (c, s) => { if (c.inVehicle && c.speed > 2) { if (c.braking) s.acc.brake = 1; if (c.handbraking) s.acc.hand = 1; } return !!s.acc.brake && !!s.acc.hand; },
  },
  {
    id: 'camera',
    text: { keyboard: 'Hold {lookBack} to look behind. Press {camera} to change the view.', gamepad: 'Hold {lookBack} to look behind. Press {camera} to change the view.', touch: 'Hold {=BACK} to look behind. Tap {=VIEW} to change the view.' },
    why: 'Useful when someone is following you.',
    when: (c) => c.inVehicle,
    start: (c, s) => { s.base.view = c.viewSerial; },
    done: (c, s, dt) => { if (c.held('KeyC')) add(s, 'back', dt); return (s.acc.back ?? 0) >= 0.3 && c.viewSerial !== s.base.view; },
  },
  {
    id: 'radio',
    text: { keyboard: 'Press {radioNext} for the next station and {radioPrev} for the previous one.', gamepad: 'Press {radioNext} for the next station and {radioPrev} for the previous one.', touch: 'Tap {=RADIO} for the next station.' },
    plain: { keyboard: 'Tap {radioNext} for the next one, then tap {radioPrev} to go back. The mouse wheel works too.', gamepad: 'Tap {radioNext}, then {radioPrev}.', touch: 'Tap {=RADIO}.' },
    why: 'The stations are real mixes and live streams.',
    when: (c) => c.inVehicle,
    start: (c, s) => mark(c, s, 'KeyE', 'RadioPrev'),
    done: (c, s) => press(c, s, 'KeyE') > 0 && (c.device === 'touch' || press(c, s, 'RadioPrev') > 0),
  },
  {
    id: 'out',
    text: { keyboard: 'Press {enter} to get out.', gamepad: 'Press {enter} to get out.', touch: 'Tap {=EXIT} to get out.' },
    why: 'The car stays where you leave it.',
    when: (c) => c.inVehicle,
    done: (c) => !c.inVehicle,
  },
  {
    id: 'pickup',
    text: { keyboard: 'Walk over the glow on the ground to pick it up.', gamepad: 'Walk over the glow on the ground to pick it up.', touch: 'Walk over the glow on the ground to pick it up.' },
    why: 'Whatever is lying there is yours.',
    when: (c) => !c.inVehicle && c.nearPickup <= PICKUP_NEAR_M,
    start: (c, s) => { s.base.hands = c.handsSig; },
    done: (c, s) => c.handsSig !== s.base.hands,
  },
  {
    id: 'action',
    text: { keyboard: '{attack} uses what is in your hands. {itemNext} changes what you carry.', gamepad: '{attack} uses what is in your hands. {itemNext} changes what you carry.', touch: 'Tap {=ACT} to use what is in your hands. Tap the item icon to change it.' },
    plain: { keyboard: 'Use {attack} now, then {itemNext}.', gamepad: 'Use {attack} now, then {itemNext}.', touch: 'Tap {=ACT} now.' },
    why: 'Fists to start. Pick things up and the same button does more.',
    when: (c) => !c.inVehicle,
    start: (c, s) => mark(c, s, 'ActionButton', 'ItemNext', 'ItemPrev'),
    done: (c, s) => press(c, s, 'ActionButton') > 0 && (c.device === 'touch' || press(c, s, 'ItemNext') + press(c, s, 'ItemPrev') > 0),
  },
  {
    id: 'police',
    text: { keyboard: 'Minor trouble builds heat. Get seen too often and you are wanted. Stand still for an officer and you are busted.', gamepad: 'Minor trouble builds heat. Get seen too often and you are wanted. Stand still for an officer and you are busted.', touch: 'Minor trouble builds heat. Get seen too often and you are wanted. Stand still for an officer and you are busted.' },
    why: 'Nothing counts against you for now. That ends.',
    auto: 8,
  },
  {
    id: 'phone',
    text: { keyboard: 'Press {phone} to open the phone.', gamepad: 'Press {phone} to open the phone.', touch: 'Tap {phone} to open the phone.' },
    why: 'Messages, jobs and the map apps come through it.',
    done: (c, s) => s.seen.has('phone'),
  },
  {
    id: 'map',
    text: { keyboard: 'Press {map} for the map, then click a spot to drop a waypoint.', gamepad: 'Open Map from the phone, then press {confirm} on a spot to drop a waypoint.', touch: 'Open Map from the phone, then tap a spot to drop a waypoint.' },
    plain: { keyboard: 'Press {map}. Click anywhere on the map. A pin appears and the arrow follows it.', gamepad: 'Open the phone, pick Map, move to a spot and press {confirm}.', touch: 'Open the phone, pick Map and tap anywhere.' },
    why: 'The pin shows on the map, and the arrow at the top follows it.',
    done: (c, s) => (s.seen.has('map') || s.seen.has('phone')) && c.waypoint,
  },
  {
    id: 'pause',
    text: { keyboard: 'Press {pause} to pause. Settings, Controls and Save are in there.', gamepad: 'Press {pause} to pause. Settings, Controls and Save are in there.', touch: 'Tap the pause button, top right. Settings, Controls and Save are in there.' },
    why: 'You can replay this tutorial from Settings, under Game.',
    done: (c, s) => s.seen.has('menu'),
  },
  {
    id: 'home',
    last: true,
    text: { keyboard: 'The arrow at the top points to the nearest job. {pointAt} points it at home, the green awning.', gamepad: 'The arrow at the top points to the nearest job. Home is the green awning.', touch: 'The arrow at the top points to the nearest job. Tap it to point at home, the green awning.' },
    why: 'Jobs start at the markers on the map. Go and find one.',
    auto: 14,
    start: (c, s) => { s.base.pointed = c.presses('PointKey'); },
    done: (c, s) => (s.t >= 4 && c.homeDist < HOME_NEAR_M) || c.presses('PointKey') > Number(s.base.pointed),
  },
];

export const STEP_IDS: readonly string[] = STEPS.map((s) => s.id);
export const stepById = (id: string): StepDef | undefined => STEPS.find((s) => s.id === id);
