import { ACTIONS, GAME_BINDINGS, LOCK_ONLY_KEYS, WHEEL_DOWN, WHEEL_UP, type ActionDef, type Bindings } from './Bindings';

/** Hold to look back (keyboard); the touch LOOK button and the pad's right-stick click drive the same code. This is an action id: the keys come from the binding table. */
export const LOOK_BACK_KEY = 'KeyC';

/** Physical code for a middle mouse click (the phone, as in GTA V PC). */
export const MIDDLE_MOUSE = 'MouseMiddle';

/** Left mouse button while the pointer is locked (the action button). The click that locks the pointer is not an action. */
export const ACTION_MOUSE = 'MouseLeft';
/** G, the keyboard action button alongside the left mouse button (a GTA III fan's Ctrl would close the tab: Ctrl+W). */
export const ACTION_KEY = 'KeyG';
/** The action id game code reads: left mouse, G, the pad's right trigger on foot and the touch ACT button all raise it. */
export const ACTION_VIRTUAL = 'ActionButton';
/** Cycle the held item: Tab, the wheel and the pad's LB step forward; wheel up and the d-pad left step back. Action ids, not keys. */
export const CYCLE_NEXT_KEY = 'ItemNext';
export const CYCLE_PREV_VIRTUAL = 'ItemPrev';

export type InputMode = 'keyboard' | 'touch' | 'gamepad';

/**
 * Keyboard + mouse state. Poll `isDown` for held actions, `pressed` / `consume` for edge-triggered ones.
 *
 * Game code asks about action ids (the old key codes: 'KeyF', 'Space', ...). A physical key reaches an action only through
 * the binding table (`Bindings`), so rebinding changes the game without touching the code that reads it. A code that is not
 * an action id (a key no action uses) is passed through as a plain physical code.
 */
export class Input {
  /** Physical keys and mouse buttons held. */
  private phys = new Set<string>();
  /** Physical edges this frame. */
  private physEdges = new Set<string>();
  /** Virtual (touch, pad) buttons held and their edges; they carry action ids directly. */
  private virtualDown = new Set<string>();
  private virtEdges = new Set<string>();
  /** Edges raised after the frame's simulation steps (gamepad poll in the render callback); they survive one `endFrame()`. */
  private carryOver = new Set<string>();
  /** Keys physically held right now, kept even while the gate is closed (MENU2): the gate reopens knowing which keys to ignore until they are let go. */
  private rawDown = new Set<string>();
  /** Keys held when the gate reopened: ignored until released, so the key that closed a panel never fires in the game (no jump on resume). */
  private suppressed = new Set<string>();
  private gateClosed = false;
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
  /** Invert vertical look (mouse, touch drag and gamepad right stick). Set from the pause menu. */
  invertLookY = false;
  /** Last device the player used. Drives HUD glyphs. Changes fire `onModeChange`. */
  mode: InputMode = Input.isTouchDevice() ? 'touch' : 'keyboard';
  onModeChange: ((mode: InputMode) => void) | null = null;
  /** The player is in a vehicle: vehicle actions are live, on-foot ones are not (Space is a jump on foot and the handbrake in a car). */
  vehicleContext = false;

  private lookup = new Map<string, ActionDef[]>();
  private lookupVersion = -1;

  constructor(private el: HTMLElement = document.body, readonly bindings: Bindings = GAME_BINDINGS) {
    window.addEventListener('keydown', (e) => {
      this.rawDown.add(e.code);
      // Keys typed inside a modal UI (pause menu) belong to that UI: no game state, no preventDefault.
      if (Input.inModal(e.target)) return;
      // A panel is open (MENU2): the keyboard belongs to it. A key still held from before the gate reopened stays ignored until released.
      if (this.gateClosed || this.suppressed.has(e.code)) return;
      // Ctrl is a game key only while the Keyboard Lock API holds it (fullscreen); otherwise Ctrl+W would close the tab.
      if (LOCK_ONLY_KEYS.has(e.code) && !this.bindings.ctrlSafe) return;
      this.setMode('keyboard');
      if (!this.phys.has(e.code)) { this.physEdges.add(e.code); this.bump(e.code); }
      this.phys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft'].includes(e.code)) e.preventDefault(); // Alt is the walk key: keep the browser menu bar out of it
      else if (e.code === 'Tab' && this.pointerLocked) e.preventDefault(); // Tab is the item key while playing
      else if (this.bindings.ctrlSafe && e.ctrlKey && e.code === 'KeyW') e.preventDefault();
      this.caps = e.getModifierState?.('CapsLock') ?? this.caps;
      this.gesture();
    });
    window.addEventListener('keyup', (e) => { this.rawDown.delete(e.code); this.suppressed.delete(e.code); this.phys.delete(e.code); this.caps = e.getModifierState?.('CapsLock') ?? this.caps; });
    window.addEventListener('blur', () => { this.phys.clear(); this.rawDown.clear(); this.suppressed.clear(); });
    window.addEventListener('mouseup', (e) => { const c = Input.mouseCode(e.button); if (c) this.phys.delete(c); });
    window.addEventListener('contextmenu', (e) => { if (this.pointerLocked || this.gateClosed) e.preventDefault(); });
    el.addEventListener('mousemove', (e) => { if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += this.invertLookY ? -e.movementY : e.movementY; this.setMode('keyboard'); } });
    el.addEventListener('mousedown', (e) => {
      if (this.gateClosed) { this.gesture(); return; } // a panel is open: a click is the panel's, never the game's and never a lock request
      const wasLocked = this.pointerLocked; // the click that takes the lock is not an action
      this.gesture(); this.requestLock();
      const code = Input.mouseCode(e.button);
      if (!code) return;
      if (e.button === 1) e.preventDefault(); // middle click opens the phone: keep the browser's autoscroll out of it
      if (e.button === 0 && !wasLocked) return;
      if (!this.phys.has(code)) { this.physEdges.add(code); this.bump(code); }
      this.phys.add(code);
    });
    el.addEventListener('wheel', (e) => {
      if (this.gateClosed) return;
      this.wheel += Math.sign(e.deltaY);
      if (this.pointerLocked && e.deltaY !== 0) { const w = e.deltaY < 0 ? WHEEL_UP : WHEEL_DOWN; this.physEdges.add(w); this.bump(w); }
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === el; });
    document.addEventListener('fullscreenchange', () => this.syncKeyboardLock());
  }

  private static mouseCode(button: number): string | null {
    return button === 0 ? 'MouseLeft' : button === 1 ? 'MouseMiddle' : button === 2 ? 'MouseRight' : button === 3 ? 'Mouse4' : button === 4 ? 'Mouse5' : null;
  }

  /** In fullscreen, ask for Ctrl (Keyboard Lock API, Chromium). Only a lock the browser accepted makes Ctrl safe as a game key. */
  private syncKeyboardLock(): void {
    const kb = (navigator as unknown as { keyboard?: { lock?: (codes?: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
    if (!kb?.lock) return;
    if (document.fullscreenElement) {
      kb.lock(['ControlLeft', 'ControlRight']).then(() => { if (document.fullscreenElement) { this.bindings.ctrlSafe = true; this.bindings.version++; } }).catch(() => { this.bindings.ctrlSafe = false; });
    } else {
      try { kb.unlock?.(); } catch { /* ignore */ }
      this.bindings.ctrlSafe = false;
      this.phys.delete('ControlLeft'); this.phys.delete('ControlRight');
    }
  }

  /** Actions that read `code`, live in the current context; undefined when `code` is not an action id. */
  private actionsFor(code: string): ActionDef[] | undefined {
    if (this.lookupVersion !== this.bindings.version) {
      this.lookup.clear();
      for (const a of ACTIONS) for (const c of a.canon) { const l = this.lookup.get(c); if (l) l.push(a); else this.lookup.set(c, [a]); }
      this.lookupVersion = this.bindings.version;
    }
    return this.lookup.get(code);
  }
  private live(a: ActionDef): boolean { return a.ctx === 'both' || (a.ctx === 'car') === this.vehicleContext; }
  private physFor(code: string): string[] {
    const acts = this.actionsFor(code);
    if (!acts) return [code];
    const out: string[] = [];
    for (const a of acts) if (this.live(a)) for (const k of this.bindings.get(a.id)) if (!LOCK_ONLY_KEYS.has(k) || this.bindings.ctrlSafe) out.push(k);
    return out;
  }

  private gesture() { if (!this.firstGesture) { this.firstGesture = true; this.onFirstGesture?.(); } }
  /** Must be called from inside a user-gesture handler. Failures (phones, some embedded views) are silent. */
  requestLock(): void {
    if (this.pointerLocked || this.lockBlocked || this.gateClosed) return;
    try { const r = (this.el.requestPointerLock as undefined | (() => unknown))?.call(this.el); (r as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* unsupported */ }
  }
  /** External trigger for the first gesture (e.g. a click on the splash overlay). */
  /** While true the pointer is not captured on a click (the title screen: its prompt and buttons must stay clickable). */
  lockBlocked = false;
  notifyGesture(): void { this.gesture(); this.requestLock(); }

  /**
   * MENU2 input gate. While a panel is open (pause menu, map, phone, shop, decks, radio list) the game gets nothing: no keys, no mouse
   * buttons, wheel or look, no touch or pad buttons, and no pointer-lock request. Closing the gate drops everything held. Opening it
   * again ignores the keys still held until they are released, so the key that closed a panel is not also a jump or a punch.
   */
  get blocked(): boolean { return this.gateClosed; }
  set blocked(v: boolean) {
    if (v === this.gateClosed) return;
    this.gateClosed = v;
    if (v) {
      this.phys.clear(); this.physEdges.clear(); this.virtualDown.clear(); this.virtEdges.clear(); this.carryOver.clear();
      this.touchAxis.x = 0; this.touchAxis.y = 0; this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    } else {
      this.suppressed = new Set(this.rawDown);
    }
  }
  /** `code` is an action id (or an unbound physical code): is it held now, from the keyboard, mouse or a virtual button? */
  isDown(code: string): boolean {
    if (this.virtualDown.has(code)) return true;
    for (const k of this.physFor(code)) if (this.phys.has(k)) return true;
    return false;
  }
  /** Press edges seen per raw code (a physical code or a virtual action id) since the page loaded. Never consumed or cleared. */
  private pressTotals = new Map<string, number>();
  private bump(code: string): void { this.pressTotals.set(code, (this.pressTotals.get(code) ?? 0) + 1); }
  /**
   * How many times `code` has been pressed so far, from any device, without taking the edge: a physical code counts itself; an action
   * id counts its virtual presses (touch, pad) plus the physical keys bound to it in the current context. The tutorial compares two
   * readings ("has the player pressed it since this step began").
   */
  pressCount(code: string): number {
    const n = this.pressTotals.get(code) ?? 0;
    if (!this.actionsFor(code)) return n;
    let t = n;
    for (const k of this.physFor(code)) t += this.pressTotals.get(k) ?? 0;
    return t;
  }
  /** Press/release an action from an on-screen control or pad. A press also counts as an edge for `pressed()`. */
  setVirtual(code: string, down: boolean): void {
    if (down) { if (this.gateClosed) return; if (!this.virtualDown.has(code)) { this.virtEdges.add(code); this.bump(code); } this.virtualDown.add(code); this.gesture(); }
    else this.virtualDown.delete(code);
  }
  /**
   * One-shot press edge raised from the render phase (the gamepad poll runs in the render callback, AFTER the
   * frame's steps and BEFORE `endFrame()`): the edge is kept through that frame's `endFrame()` so the next frame's
   * steps can still see it. A plain `setVirtual` edge raised there would be wiped before any step read it.
   */
  pulse(code: string): void { if (this.gateClosed) return; this.virtEdges.add(code); this.carryOver.add(code); this.bump(code); this.gesture(); }
  /** Camera look delta from a touch drag, in pixels. */
  addLook(dx: number, dy: number): void { if (this.gateClosed) return; this.mouseDX += dx; this.mouseDY += this.invertLookY ? -dy : dy; }
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
    return this.phys.size > 0 || this.virtualDown.size > 0 || this.physEdges.size > 0 || this.virtEdges.size > 0 || this.touchAxis.x !== 0 || this.touchAxis.y !== 0 || this.mouseDX !== 0 || this.mouseDY !== 0;
  }
  /** The action button is held (left mouse while locked, G, pad right trigger on foot, touch ACT). */
  actionHeld(): boolean { return this.isDown(ACTION_VIRTUAL); }
  /** Take the action button's press edge from any device (true once per press). */
  consumeAction(): boolean { return this.consume(ACTION_VIRTUAL); }
  /** Take a held-item cycle request: +1 (Tab, wheel down, LB), -1 (wheel up, d-pad left) or 0. */
  consumeCycle(): number {
    const n = this.consume(CYCLE_NEXT_KEY), p = this.consume(CYCLE_PREV_VIRTUAL);
    return n ? 1 : p ? -1 : 0;
  }
  /** True while the look-back key is held. */
  get lookBack(): boolean { return this.isDown(LOOK_BACK_KEY); }
  /** True only on the frame the key went down. */
  pressed(code: string): boolean {
    if (this.virtEdges.has(code)) return true;
    for (const k of this.physFor(code)) if (this.physEdges.has(k)) return true;
    return false;
  }
  /**
   * Take the press edge: true once per physical press, then false until the key goes down again.
   * Use this (not `pressed`) for toggles read inside the fixed-step simulation: a slow frame runs several
   * steps before `endFrame()` clears the edge, so `pressed()` is true on every one of them and a toggle
   * (exit then enter the same car) fires twice.
   */
  consume(code: string): boolean {
    this.carryOver.delete(code);
    let hit = this.virtEdges.delete(code);
    for (const k of this.physFor(code)) if (this.physEdges.delete(k)) hit = true;
    return hit;
  }
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
    this.physEdges.clear();
    this.virtEdges.clear();
    if (this.carryOver.size > 0) { for (const c of this.carryOver) this.virtEdges.add(c); this.carryOver.clear(); }
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  /** Raise or release a physical key as the player would (tests and the rebinding screen's capture use real events instead). */
  simulatePhysical(code: string, down: boolean): void {
    if (down) { if (!this.phys.has(code)) { this.physEdges.add(code); this.bump(code); } this.phys.add(code); } else this.phys.delete(code);
  }
}
