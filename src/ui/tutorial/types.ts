/**
 * Tutorial types (lane TUTORIAL, 22 Nov 2026). A step is data: an id, one line per device, an optional "available when" test and a
 * completion test. The engine (engine.ts) knows nothing about the game: it reads a `TutorialCtx` snapshot the host builds each frame.
 */
export type Device = 'keyboard' | 'gamepad' | 'touch';
export const DEVICES: readonly Device[] = ['keyboard', 'gamepad', 'touch'];

/** What the game looks like to the tutorial this frame. Built by `contextFrom` (context.ts) in the game and by hand in tests. */
export interface TutorialCtx {
  device: Device;
  /** A panel, the title, a room, a mission beat or a pause is up: the card hides, timers stand still, nothing is judged on movement. */
  blocked: boolean;
  inVehicle: boolean;
  /** Metres per second of the player, or of the car being driven. */
  speed: number;
  /** 0..1, how far into a sprint the player is. */
  sprint: number;
  /** Camera yaw, radians. */
  yaw: number;
  x: number; z: number;
  /** Metres above the ground while jumping. */
  jumpHeight: number;
  vaulting: boolean;
  /** Metres to the nearest car that is not the one being driven (Infinity when none is close). */
  nearCar: number;
  /** Metres to the nearest pickup on the ground (Infinity when none is close). */
  nearPickup: number;
  /** A string that changes whenever the hands pick something up, use ammunition or change item. */
  handsSig: string;
  braking: boolean;
  handbraking: boolean;
  /** Bumps whenever the camera view changes. */
  viewSerial: number;
  /** Top open panel id ('menu', 'map', 'phone', 'shop', 'decks', 'radio', 'credits') or null. */
  panel: string | null;
  waypoint: boolean;
  /** Metres to HOME's door. */
  homeDist: number;
  stars: number;
  heat: number;
  raining: boolean;
  /** The HUD prompt text ("F  Enter car", "F  Play the turntables"). */
  prompt: string;
  /** A mission is running (its own prompts and beats own the screen). */
  mission: boolean;
  /** How many times the action id (or physical code) has been pressed since the page loaded. Never consumed. */
  presses(code: string): number;
  /** Is the action id held now. */
  held(code: string): boolean;
}

/** Per-step working memory. The engine owns it, steps read and write it. */
export interface StepState {
  /** Seconds the step has been on the card (not counting time hidden). */
  t: number;
  /** Counters and flags a step keeps. */
  acc: Record<string, number>;
  /** Values captured when the step began (press counts, view serial, hands signature). */
  base: Record<string, number | string>;
  /** Panel ids opened since the step began. */
  seen: Set<string>;
}

export interface StepDef {
  id: string;
  /** One line per device. Tokens: `{action}` = the key or button now bound to the action, `{=Text}` = a literal key cap, `{move}` and `{look}` = the stick or the four keys. */
  text: Record<Device, string>;
  /** The same ask, said more plainly (shown after 20 s). Defaults to `text`. */
  plain?: Partial<Record<Device, string>>;
  /** One line of why. */
  why: string;
  /** Available now? Absent = always. A step that is not available waits and comes back. */
  when?: (c: TutorialCtx) => boolean;
  /** Capture baselines when the step reaches the card. */
  start?: (c: TutorialCtx, s: StepState) => void;
  /** The thing was done. Called every frame while the step is current (also while the card is hidden under a panel). `dt` is real seconds. */
  done?: (c: TutorialCtx, s: StepState, dt: number) => boolean;
  /** An information step: done after this many visible seconds. */
  auto?: number;
  /** May take the card from the step in front of it as soon as it becomes available (the vault, when a car is close). */
  opportunistic?: boolean;
  /** Comes after every other step that can be done now (the walk home). */
  last?: boolean;
  /** Not for this device (a touch screen has no previous-station button, but the step itself still runs). */
  devices?: readonly Device[];
}

export type Stage = 'hint' | 'plain' | 'offer';

/** What the card shows. */
export interface CardView {
  visible: boolean;
  kind: 'step' | 'bye';
  id: string;
  device: Device;
  stage: Stage;
  /** Template text for the instruction (the card resolves the tokens). */
  text: string;
  why: string;
  /** The step was just done: a tick, then the next step. */
  tick: boolean;
  /** One entry per step of this run, in order. */
  dots: Array<{ id: string; done: boolean; current: boolean }>;
  /** Index of the dot being worked on (0-based), -1 when none. */
  index: number;
}
