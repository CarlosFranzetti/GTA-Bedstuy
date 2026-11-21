/**
 * Gamepad API polling, standard mapping, merged into `Input` through its virtual layer. Layout: GTA V (docs/swarm/tasks/CONTROLS.md).
 *
 *   left stick  -> input.touchAxis (move / steer)           RT -> throttle in a car; the action button on foot
 *   right stick -> input.addLook (scaled by dt)             LT -> brake in a car; aim on foot (reserved)
 *   A sprint (hold)   X jump   Y enter / exit   B reload (reserved)   LB next item on foot   RB handbrake in a car, swap shoulder on foot
 *   L3 horn in a car (hold), walk toggle on foot        R3 look back (hold)        Back / View: camera view
 *   d-pad up: phone     d-pad left / right: previous / next item on foot, previous / next radio station in a car
 *   Start -> onStart (pause menu)   D-pad / A / B -> onNav (menu navigation)   Rumble through the Gamepad API where offered.
 *
 * Call `update(dt)` once per rendered frame (also while paused, so Start can resume).
 * Touch coexistence: the stick only writes `touchAxis` while it is deflected (and once to zero on release).
 */
import { ACTION_VIRTUAL, CYCLE_NEXT_KEY, CYCLE_PREV_VIRTUAL, LOOK_BACK_KEY, type Input } from './Input';
import { GAME_BINDINGS, detectPadKind, type PadKind } from './Bindings';

/** Radial dead zone. */
export const DEAD_ZONE = 0.15;
const TRIGGER_ON = 0.3;
const TRIGGER_DEAD = 0.05;
/** Right-stick look speed at full deflection, in mouse-pixel equivalents per second. */
export const LOOK_PX_PER_S = 900;

/** Pad feel, saved on this device (not in the game save). */
export interface PadTuning {
  /** Left stick radial dead zone, 0..0.4. */
  moveDeadZone: number;
  /** Right stick radial dead zone, 0..0.4. */
  lookDeadZone: number;
  /** Look speed multiplier. */
  lookSpeed: number;
  /** Look response curve exponent: 1 linear, 1.5 default (fine aim near the centre), 2.2 slow start. */
  lookCurve: number;
  /** Trigger dead zone 0..0.3. */
  triggerDead: number;
  /** Rumble on or off. */
  vibration: boolean;
}
export const DEFAULT_TUNING: PadTuning = { moveDeadZone: DEAD_ZONE, lookDeadZone: DEAD_ZONE, lookSpeed: 1, lookCurve: 1.5, triggerDead: TRIGGER_DEAD, vibration: true };
export const PAD_TUNING_KEY = 'gta-bedstuy.pad.v1';

const clampNum = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
export function sanitizeTuning(raw: unknown): PadTuning {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    moveDeadZone: clampNum(r.moveDeadZone, 0, 0.4, DEFAULT_TUNING.moveDeadZone),
    lookDeadZone: clampNum(r.lookDeadZone, 0, 0.4, DEFAULT_TUNING.lookDeadZone),
    lookSpeed: clampNum(r.lookSpeed, 0.4, 2.5, DEFAULT_TUNING.lookSpeed),
    lookCurve: clampNum(r.lookCurve, 1, 3, DEFAULT_TUNING.lookCurve),
    triggerDead: clampNum(r.triggerDead, 0, 0.3, DEFAULT_TUNING.triggerDead),
    vibration: typeof r.vibration === 'boolean' ? r.vibration : DEFAULT_TUNING.vibration,
  };
}
export function loadPadTuning(): PadTuning {
  try { return sanitizeTuning(JSON.parse(localStorage.getItem(PAD_TUNING_KEY) ?? 'null')); } catch { return { ...DEFAULT_TUNING }; }
}
/** The tuning shared by the pad poller and the pause menu: the menu edits it in place and the pad reads it every frame. */
export const PAD_TUNING: PadTuning = loadPadTuning();
export function savePadTuning(t: PadTuning): void {
  try { localStorage.setItem(PAD_TUNING_KEY, JSON.stringify(t)); } catch { /* blocked */ }
}

/** Virtual edge raised by A / Cross on any screen (the title screen starts on it; A is also sprint in the game). */
export const PAD_CONFIRM = 'PadConfirm';

export type NavDir = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

/** Radial dead zone with rescale so output is continuous from 0 at the edge of the zone to 1 at full tilt. */
export function applyDeadZone(x: number, y: number, dz = DEAD_ZONE): { x: number; y: number } {
  const fx = Number.isFinite(x) ? x : 0, fy = Number.isFinite(y) ? y : 0;
  const len = Math.hypot(fx, fy);
  if (len < dz) return { x: 0, y: 0 };
  const k = Math.min(1, (len - dz) / (1 - dz)) / len;
  return { x: fx * k, y: fy * k };
}

/** Trigger value 0..1 with a tiny dead zone. Handles pads that report triggers as buttons without `value`. */
export function trigger(b: GamepadButton | undefined, dead = TRIGGER_DEAD): number {
  if (!b) return 0;
  const v = typeof b.value === 'number' && b.value > 0 ? b.value : b.pressed ? 1 : 0;
  return v < dead ? 0 : Math.min(1, (v - dead) / (1 - dead));
}

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export interface GamepadOptions {
  /** Override for tests. Defaults to `navigator.getGamepads()`. */
  getPads?: () => ArrayLike<globalThis.Gamepad | null>;
  onToast?: (message: string) => void;
  onStart?: () => void;
  onNav?: (dir: NavDir) => void;
  /** LB (-1) / RB (+1) in menus. Return true when handled (the pause menu switches tabs); otherwise the bumper falls back to left / right. */
  onBumper?: (dir: -1 | 1) => boolean;
  /** Starting tuning (tests); defaults to what was saved on this device. */
  tuning?: PadTuning;
}

export class GamepadInput {
  /** True while a pad is connected. */
  connected = false;
  /** Set by the integrator when the player is driving: RT/LT then act as throttle/brake. */
  inVehicle = false;
  /** While true (pause menu open) nothing reaches the game; only Start and menu navigation are produced. */
  paused = false;
  onToast: ((message: string) => void) | null;
  onStart: (() => void) | null;
  onNav: ((dir: NavDir) => void) | null;
  onBumper: ((dir: -1 | 1) => boolean) | null;
  /** Dead zones, look curve and rumble; the pause menu edits this and saves it. */
  tuning: PadTuning;
  /** Xbox, PlayStation or other: decides the button names prompts show. */
  padKind: PadKind = 'xbox';
  private walkToggled = false;

  private readonly getPads: () => ArrayLike<globalThis.Gamepad | null>;
  private prev: boolean[] = [];
  private heldCodes = new Set<string>();
  private wroteAxis = false;

  constructor(private readonly input: Input, opts: GamepadOptions = {}) {
    this.getPads = opts.getPads ?? (() => {
      try { return (navigator.getGamepads?.() ?? []) as ArrayLike<globalThis.Gamepad | null>; } catch { return []; }
    });
    this.onToast = opts.onToast ?? null;
    this.onStart = opts.onStart ?? null;
    this.onNav = opts.onNav ?? null;
    this.onBumper = opts.onBumper ?? null;
    this.tuning = opts.tuning ?? PAD_TUNING;
  }

  /** Short rumble where the Gamepad API offers it (Chromium: dual-rumble on Xbox and PlayStation pads). Silent otherwise. */
  rumble(strong: number, weak: number, ms: number): void {
    if (!this.tuning.vibration || this.paused) return;
    const pad = this.pad() as (globalThis.Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: unknown) => Promise<unknown> } }) | null;
    try { pad?.vibrationActuator?.playEffect?.('dual-rumble', { startDelay: 0, duration: Math.max(1, Math.min(ms, 2000)), strongMagnitude: Math.min(1, Math.max(0, strong)), weakMagnitude: Math.min(1, Math.max(0, weak)) })?.catch?.(() => {}); } catch { /* unsupported */ }
  }

  private pad(): globalThis.Gamepad | null {
    const pads = this.getPads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected !== false) return p;
    }
    return null;
  }

  update(dt: number): void {
    const pad = this.pad();
    if (!pad) {
      this.input.vehicleContext = this.inVehicle;
      if (this.connected) { this.connected = false; this.releaseAll(); this.prev = []; }
      return;
    }
    this.input.vehicleContext = this.inVehicle;
    if (!this.connected) { this.connected = true; this.onToast?.('Controller connected'); }
    this.padKind = detectPadKind(pad.id); GAME_BINDINGS.setPadKind(this.padKind);

    const down = (i: number): boolean => !!pad.buttons[i]?.pressed;
    const edge = (i: number): boolean => down(i) && !this.prev[i];
    const lx = pad.axes[0] ?? 0, ly = pad.axes[1] ?? 0, rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
    // Gamepad Y axes are +down; the game's forward axis is +up.
    const l = applyDeadZone(lx, ly, this.tuning.moveDeadZone), r = applyDeadZone(rx, ry, this.tuning.lookDeadZone);
    const left = { x: l.x, y: -l.y || 0 }, right = { x: r.x, y: r.y };
    const lt = trigger(pad.buttons[BTN.LT], this.tuning.triggerDead), rt = trigger(pad.buttons[BTN.RT], this.tuning.triggerDead);

    // Any deliberate input switches HUD glyphs to the pad.
    let active = left.x !== 0 || left.y !== 0 || right.x !== 0 || right.y !== 0 || lt > 0 || rt > 0;
    for (let i = 0; i < pad.buttons.length && !active; i++) if (down(i)) active = true;
    if (active) this.input.setMode('gamepad');

    // Menu / pause plumbing runs regardless of pause state.
    if (edge(BTN.START)) this.onStart?.();
    if (this.onNav) {
      if (edge(BTN.UP)) this.onNav('up');
      if (edge(BTN.DOWN)) this.onNav('down');
      if (edge(BTN.LEFT)) this.onNav('left');
      if (edge(BTN.RIGHT)) this.onNav('right');
      if (edge(BTN.LB) && !this.onBumper?.(-1)) this.onNav('left'); // bumpers switch tabs in the pause menu, phone and shop
      if (edge(BTN.RB) && !this.onBumper?.(1)) this.onNav('right');
      if (edge(BTN.A)) { this.onNav('confirm'); this.input.pulse(PAD_CONFIRM); }
      if (edge(BTN.B)) this.onNav('back');
    }

    if (this.paused) {
      this.releaseAll();
    } else {
      this.drive(edge, down, left, right, lt, rt, dt);
    }
    this.prev = Array.from({ length: Math.max(pad.buttons.length, 16) }, (_, i) => down(i));
  }

  private drive(
    edge: (i: number) => boolean,
    down: (i: number) => boolean,
    left: { x: number; y: number },
    right: { x: number; y: number },
    lt: number,
    rt: number,
    dt: number,
  ): void {
    const axis = this.input.touchAxis;
    let ax = left.x, ay = left.y;
    if (this.inVehicle) ay = Math.max(-1, Math.min(1, ay + rt));
    if (ax !== 0 || ay !== 0) { axis.x = ax; axis.y = ay; this.wroteAxis = true; }
    else if (this.wroteAxis) { axis.x = 0; axis.y = 0; this.wroteAxis = false; }

    const curve = this.tuning.lookCurve, speed = LOOK_PX_PER_S * this.tuning.lookSpeed;
    const mag = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), curve);
    if ((right.x !== 0 || right.y !== 0) && dt > 0) {
      this.input.addLook(mag(right.x) * speed * dt, mag(right.y) * speed * dt);
    }

    const car = this.inVehicle;
    // Edge actions: press-and-release in the same poll so `pressed()` sees one edge.
    if (edge(BTN.Y)) this.pulse('KeyF');                            // Y / Triangle: enter or exit
    if (edge(BTN.BACK)) this.pulse('KeyV');                         // View / Select: cycle the camera view (double-tap swaps the last two)
    if (edge(BTN.UP)) this.pulse('KeyP');                           // d-pad up: phone
    if (!car) {
      if (edge(BTN.X)) this.pulse('Space');                         // X / Square: jump
      if (edge(BTN.RB)) this.pulse('KeyB');                         // RB on foot: swap shoulder (cover's slot in GTA, until cover exists)
      if (edge(BTN.LB)) this.pulse(CYCLE_NEXT_KEY);                 // LB: next item in hand
      if (edge(BTN.RIGHT)) this.pulse(CYCLE_NEXT_KEY);
      if (edge(BTN.LEFT)) this.pulse(CYCLE_PREV_VIRTUAL);
      if (edge(BTN.LS)) { this.walkToggled = !this.walkToggled; }   // L3: walk (stealth in GTA V)
    } else {
      if (edge(BTN.RIGHT)) this.pulse('KeyE');                      // d-pad right: next radio station
      if (edge(BTN.LEFT)) this.pulse('RadioPrev');                  // d-pad left: previous
      this.walkToggled = false;
    }
    // Held actions.
    this.hold('ShiftLeft', car ? down(BTN.RB) : down(BTN.A));       // A sprints on foot; RB is the handbrake in a car
    this.hold('AltLeft', !car && this.walkToggled);
    this.hold('KeyH', car && down(BTN.LS));                         // L3 held: horn
    this.hold(LOOK_BACK_KEY, down(BTN.RS));                         // right-stick click: look back
    this.hold('Space', car && lt > TRIGGER_ON);                     // LT in a car: brake
    this.hold('AimButton', !car && lt > TRIGGER_ON);                // LT on foot: aim (reserved)
    // on foot the right trigger is the action button (in a car it is the throttle)
    this.hold(ACTION_VIRTUAL, !car && rt > TRIGGER_ON);
  }

  private pulse(code: string): void { this.input.pulse(code); }

  private hold(code: string, on: boolean): void {
    const has = this.heldCodes.has(code);
    if (on && !has) { this.heldCodes.add(code); this.input.setVirtual(code, true); }
    else if (!on && has) { this.heldCodes.delete(code); this.input.setVirtual(code, false); }
  }

  private releaseAll(): void {
    for (const c of this.heldCodes) this.input.setVirtual(c, false);
    this.heldCodes.clear();
    if (this.wroteAxis) { this.input.touchAxis.x = 0; this.input.touchAxis.y = 0; this.wroteAxis = false; }
  }
}
