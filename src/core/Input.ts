/** Hold to look back (keyboard); the touch LOOK button and the pad's right-stick click drive the same code. */
export const LOOK_BACK_KEY = 'KeyC';

/** Edge-only pseudo key raised by a middle mouse click. */
export const MIDDLE_MOUSE = 'MouseMiddle';

/** Left mouse button while the pointer is locked (the action button). The click that locks the pointer is not an action. */
export const ACTION_MOUSE = 'MouseLeft';
/** G, the keyboard action button. Not Left Ctrl as in GTA III: in a browser Ctrl+W closes the tab while you run forward. */
export const ACTION_KEY = 'KeyG';
/** Virtual action button: the gamepad's right trigger on foot and the touch ACT button hold this. */
export const ACTION_VIRTUAL = 'ActionButton';
/** Cycle the held item: Q and the pad's d-pad right step forward; the d-pad left (virtual) steps back. */
export const CYCLE_NEXT_KEY = 'KeyQ';
export const CYCLE_PREV_VIRTUAL = 'ItemPrev';

export type InputMode = 'keyboard' | 'touch' | 'gamepad';

/** Keyboard + mouse state. Poll `isDown` for held keys, `pressed` for edge-triggered actions (consumed per frame). */
export class Input {
  private down = new Set<string>();
  private justPressed = new Set<string>();
  /** Edges raised after the frame's simulation steps (gamepad poll in the render callback); they survive one `endFrame()`. */
  private carryOver = new Set<string>();
  /** Mouse movement since last `endFrame()`, pixels. */
  mouseDX = 0; mouseDY = 0;
  wheel = 0;
  pointerLocked = false;
  private firstGesture = false;
  /** Caps Lock is on (a walk toggle on the keyboard). */
  caps = false;
  onFirstGesture: (() => void) | null = null;
  /** Virtual (touch) input merged into the keyboard state. x: -1 left..1 right, y: -1 back..1 forward. */
  readonly touchAxis = { x: 0, y: 0 };
  private virtualDown = new Set<string>();
  /** Invert vertical look (mouse, touch drag and gamepad right stick). Set from the pause menu. */
  invertLookY = false;
  /** Last device the player used. Drives HUD glyphs. Changes fire `onModeChange`. */
  mode: InputMode = Input.isTouchDevice() ? 'touch' : 'keyboard';
  onModeChange: ((mode: InputMode) => void) | null = null;

  constructor(private el: HTMLElement = document.body) {
    window.addEventListener('keydown', (e) => {
      // Keys typed inside a modal UI (pause menu) belong to that UI: no game state, no preventDefault.
      if (Input.inModal(e.target)) return;
      this.setMode('keyboard');
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft'].includes(e.code)) e.preventDefault(); // Alt is the walk key: keep the browser menu bar out of it
      this.caps = e.getModifierState?.('CapsLock') ?? this.caps;
      this.gesture();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); this.caps = e.getModifierState?.('CapsLock') ?? this.caps; });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.down.delete(ACTION_MOUSE); });
    el.addEventListener('mousemove', (e) => { if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += this.invertLookY ? -e.movementY : e.movementY; this.setMode('keyboard'); } });
    el.addEventListener('mousedown', (e) => {
      const wasLocked = this.pointerLocked; // the click that takes the lock is not an action
      this.gesture(); this.requestLock();
      if (e.button === 0 && wasLocked) { if (!this.down.has(ACTION_MOUSE)) this.justPressed.add(ACTION_MOUSE); this.down.add(ACTION_MOUSE); }
      if (e.button === 1) { e.preventDefault(); this.justPressed.add(MIDDLE_MOUSE); } // middle click: swap camera shoulder
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === el; });
  }
  private gesture() { if (!this.firstGesture) { this.firstGesture = true; this.onFirstGesture?.(); } }
  /** Must be called from inside a user-gesture handler. Failures (phones, some embedded views) are silent. */
  requestLock(): void {
    if (this.pointerLocked) return;
    try { const r = (this.el.requestPointerLock as undefined | (() => unknown))?.call(this.el); (r as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* unsupported */ }
  }
  /** External trigger for the first gesture (e.g. a click on the splash overlay). */
  notifyGesture(): void { this.gesture(); this.requestLock(); }
  isDown(code: string): boolean { return this.down.has(code) || this.virtualDown.has(code); }
  /** Press/release a key from an on-screen control. A press also counts as an edge for `pressed()`. */
  setVirtual(code: string, down: boolean): void {
    if (down) { if (!this.virtualDown.has(code)) this.justPressed.add(code); this.virtualDown.add(code); this.gesture(); }
    else this.virtualDown.delete(code);
  }
  /**
   * One-shot press edge raised from the render phase (the gamepad poll runs in the render callback, AFTER the
   * frame's steps and BEFORE `endFrame()`): the edge is kept through that frame's `endFrame()` so the next frame's
   * steps can still see it. A plain `setVirtual` edge raised there would be wiped before any step read it.
   */
  pulse(code: string): void { this.justPressed.add(code); this.carryOver.add(code); this.gesture(); }
  /** Camera look delta from a touch drag, in pixels. */
  addLook(dx: number, dy: number): void { this.mouseDX += dx; this.mouseDY += this.invertLookY ? -dy : dy; }
  /** Record which device the player is using; fires `onModeChange` only on a real change. */
  setMode(mode: InputMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.onModeChange?.(mode);
  }
  private static inModal(t: EventTarget | null): boolean {
    return !!t && typeof (t as Element).closest === 'function' && (t as Element).closest('[data-ui-modal]') !== null;
  }
  /** True on phones/tablets (coarse pointer or touch points). */
  static isTouchDevice(): boolean {
    try { return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints ?? 0) > 0; } catch { return false; }
  }
  /** True while any key, virtual button, touch stick or look delta is active (the camera's idle detector). */
  anyInput(): boolean {
    return this.down.size > 0 || this.virtualDown.size > 0 || this.justPressed.size > 0 || this.touchAxis.x !== 0 || this.touchAxis.y !== 0 || this.mouseDX !== 0 || this.mouseDY !== 0;
  }
  /** The action button is held (left mouse while locked, G, pad right trigger on foot, touch ACT). */
  actionHeld(): boolean { return this.isDown(ACTION_MOUSE) || this.isDown(ACTION_KEY) || this.isDown(ACTION_VIRTUAL); }
  /** Take the action button's press edge from any device (true once per press). */
  consumeAction(): boolean {
    const a = this.consume(ACTION_MOUSE), b = this.consume(ACTION_KEY), c = this.consume(ACTION_VIRTUAL);
    return a || b || c;
  }
  /** Take a held-item cycle request: +1 (Q, d-pad right), -1 (d-pad left) or 0. */
  consumeCycle(): number {
    const n = this.consume(CYCLE_NEXT_KEY), p = this.consume(CYCLE_PREV_VIRTUAL);
    return n ? 1 : p ? -1 : 0;
  }
  /** True while the look-back key is held. */
  get lookBack(): boolean { return this.isDown(LOOK_BACK_KEY); }
  /** True only on the frame the key went down. */
  pressed(code: string): boolean { return this.justPressed.has(code); }
  /**
   * Take the press edge: true once per physical press, then false until the key goes down again.
   * Use this (not `pressed`) for toggles read inside the fixed-step simulation: a slow frame runs several
   * steps before `endFrame()` clears the edge, so `pressed()` is true on every one of them and a toggle
   * (exit then enter the same car) fires twice.
   */
  consume(code: string): boolean { this.carryOver.delete(code); return this.justPressed.delete(code); }
  /** Returns -1..1 from two keys. */
  axis(neg: string[], pos: string[]): number {
    const n = neg.some((c) => this.isDown(c)) ? 1 : 0;
    const p = pos.some((c) => this.isDown(c)) ? 1 : 0;
    let v = p - n;
    // analog touch stick: W/S family is the forward axis, A/D family the sideways axis
    if (pos.includes('KeyW') || pos.includes('ArrowUp')) v += this.touchAxis.y;
    else if (pos.includes('KeyD') || pos.includes('ArrowRight')) v += this.touchAxis.x;
    return Math.max(-1, Math.min(1, v));
  }
  endFrame(): void {
    this.justPressed.clear();
    if (this.carryOver.size > 0) { for (const c of this.carryOver) this.justPressed.add(c); this.carryOver.clear(); }
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
