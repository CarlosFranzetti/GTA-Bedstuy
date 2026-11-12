/**
 * Gamepad API polling, standard mapping, merged into `Input` through its virtual layer.
 *
 *   left stick  -> input.touchAxis (move / steer)           RT -> throttle (adds to touchAxis.y in a car)
 *   right stick -> input.addLook (scaled by dt)             LT -> brake (Space)
 *   A -> KeyF (enter/exit)   X -> ShiftLeft (run / handbrake)   LB -> KeyH (horn)   Y -> KeyE (radio)
 *   RT on foot -> the action button (punch / throw / shoot, see src/game/combat); d-pad right / left on foot -> next / previous held item
 *   R3 (right-stick click) -> KeyC held (look back)
 *   Select/Back -> KeyV (camera view)   RB -> KeyB (shoulder swap)   B on foot -> Space (jump)
 *   Start -> onStart (pause menu)   D-pad / A / B -> onNav (menu navigation)
 *
 * Call `update(dt)` once per rendered frame (also while paused, so Start can resume).
 * Touch coexistence: the stick only writes `touchAxis` while it is deflected (and once to zero on release).
 */
import { ACTION_VIRTUAL, CYCLE_NEXT_KEY, CYCLE_PREV_VIRTUAL, LOOK_BACK_KEY, type Input } from './Input';

/** Radial dead zone. */
export const DEAD_ZONE = 0.15;
const TRIGGER_ON = 0.3;
const TRIGGER_DEAD = 0.05;
/** Right-stick look speed at full deflection, in mouse-pixel equivalents per second. */
export const LOOK_PX_PER_S = 900;

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
function trigger(b: GamepadButton | undefined): number {
  if (!b) return 0;
  const v = typeof b.value === 'number' && b.value > 0 ? b.value : b.pressed ? 1 : 0;
  return v < TRIGGER_DEAD ? 0 : Math.min(1, v);
}

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export interface GamepadOptions {
  /** Override for tests. Defaults to `navigator.getGamepads()`. */
  getPads?: () => ArrayLike<globalThis.Gamepad | null>;
  onToast?: (message: string) => void;
  onStart?: () => void;
  onNav?: (dir: NavDir) => void;
  /** LB (-1) / RB (+1) in menus. Return true when handled (the pause menu switches tabs); otherwise the bumper falls back to left / right. */
  onBumper?: (dir: -1 | 1) => boolean;
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
      if (this.connected) { this.connected = false; this.releaseAll(); this.prev = []; }
      return;
    }
    if (!this.connected) { this.connected = true; this.onToast?.('Controller connected'); }

    const down = (i: number): boolean => !!pad.buttons[i]?.pressed;
    const edge = (i: number): boolean => down(i) && !this.prev[i];
    const lx = pad.axes[0] ?? 0, ly = pad.axes[1] ?? 0, rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
    // Gamepad Y axes are +down; the game's forward axis is +up.
    const l = applyDeadZone(lx, ly), r = applyDeadZone(rx, ry);
    const left = { x: l.x, y: -l.y || 0 }, right = { x: r.x, y: r.y };
    const lt = trigger(pad.buttons[BTN.LT]), rt = trigger(pad.buttons[BTN.RT]);

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
      if (edge(BTN.A)) this.onNav('confirm');
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

    const mag = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.5);
    if ((right.x !== 0 || right.y !== 0) && dt > 0) {
      this.input.addLook(mag(right.x) * LOOK_PX_PER_S * dt, mag(right.y) * LOOK_PX_PER_S * dt);
    }

    // Edge actions: press-and-release in the same poll so `pressed()` sees one edge.
    if (edge(BTN.A)) this.pulse('KeyF');
    if (edge(BTN.Y)) this.pulse('KeyE');
    if (edge(BTN.BACK)) this.pulse('KeyV');                       // Select / Back / Share: cycle the camera view (double-tap swaps the last two)
    if (edge(BTN.RB)) this.pulse('KeyB');                         // RB: swap the over-the-shoulder side
    if (edge(BTN.B) && !this.inVehicle) this.pulse('Space');      // B / Circle on foot: jump (X is run, A is enter/exit, Space is the brake in a car)
    // Held actions.
    this.hold('ShiftLeft', down(BTN.X));
    this.hold('KeyH', down(BTN.LB));
    this.hold(LOOK_BACK_KEY, down(BTN.RS)); // right-stick click: look back
    this.hold('Space', this.inVehicle && lt > TRIGGER_ON);
    // on foot the right trigger is the action button (in a car it is the throttle); the d-pad steps through the held items
    this.hold(ACTION_VIRTUAL, !this.inVehicle && rt > TRIGGER_ON);
    if (!this.inVehicle) {
      if (edge(BTN.RIGHT)) this.pulse(CYCLE_NEXT_KEY);
      if (edge(BTN.LEFT)) this.pulse(CYCLE_PREV_VIRTUAL);
    }
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
