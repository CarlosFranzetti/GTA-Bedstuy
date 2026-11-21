/**
 * On-screen controls for phones and tablets, laid out like a console game on glass:
 *  - LEFT half of the screen: a floating stick. It appears where the thumb lands, follows the thumb if it drifts, and
 *    vanishes on release. A faint ghost ring marks the usual spot while nothing is touching.
 *  - RIGHT half: drag anywhere that is not a button to look (gentle smoothing, nothing is lost).
 *  - A right-thumb cluster with the most used button largest: ACT on foot, GAS in a car. Context buttons appear only
 *    when they mean something (CAR / EXIT when a car or door is in reach, BRAKE and GAS only while driving).
 * Every keyboard and gamepad binding is untouched: the buttons press the same virtual keys as before.
 * The pure parts (FloatingStick, LookSmoother, visibleButtons, TouchPrefs) are exported for tests.
 */
import { ACTION_VIRTUAL, LOOK_BACK_KEY, type Input } from '@/core/Input';
import './touch.css';

export const STICK_RADIUS = 56;   // px of travel for full deflection
export const DEAD_ZONE = 0.12;
/** Pixels of look drag are multiplied by this before they reach the camera (the same gain the old look area used). */
export const LOOK_GAIN = 2.2;
/** Share of the pending look turn that is delivered each frame (1 = no smoothing). Everything is delivered within a few frames. */
export const LOOK_SMOOTH = 0.55;

/**
 * Joystick vector from a drag offset: x right, y forward (screen up), clamped to the unit disc. Inside the dead zone it is
 * zero; outside, the response starts from zero at the dead-zone edge (no jump from 0 to 0.12 when the thumb crosses it).
 */
export function joystickVector(dx: number, dy: number, radius = STICK_RADIUS): { x: number; y: number } {
  const x = dx / radius, y = -dy / radius;
  const len = Math.hypot(x, y);
  if (len < DEAD_ZONE) return { x: 0, y: 0 };
  const shaped = Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE));
  return { x: (x / len) * shaped, y: (y / len) * shaped };
}

/**
 * The floating stick: `begin` plants the origin where the thumb landed, `move` returns the vector, and when the thumb is
 * dragged beyond the ring the origin follows it (so a drifting thumb never runs out of travel and the player can reverse
 * direction quickly). Pure maths: the DOM only draws it.
 */
export class FloatingStick {
  active = false;
  origin = { x: 0, y: 0 };
  vec = { x: 0, y: 0 };
  constructor(readonly radius = STICK_RADIUS, readonly follow = true) {}
  begin(x: number, y: number): void { this.active = true; this.origin = { x, y }; this.vec = { x: 0, y: 0 }; }
  move(x: number, y: number): { x: number; y: number } {
    if (!this.active) return this.vec;
    const dx = x - this.origin.x, dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (this.follow && d > this.radius) {
      const pull = (d - this.radius) / d;
      this.origin = { x: this.origin.x + dx * pull, y: this.origin.y + dy * pull };
    }
    this.vec = joystickVector(x - this.origin.x, y - this.origin.y, this.radius);
    return this.vec;
  }
  end(): void { this.active = false; this.vec = { x: 0, y: 0 }; }
}

/** Look drag with gentle smoothing that conserves the total: `push` queues a turn, `step` (once a frame) delivers a share of it. */
export class LookSmoother {
  private px = 0; private py = 0;
  constructor(readonly gain = LOOK_GAIN, readonly k = LOOK_SMOOTH) {}
  push(dx: number, dy: number): void { this.px += dx * this.gain; this.py += dy * this.gain; }
  /** Returns the turn to apply this frame. Below half a pixel the rest is delivered at once so the queue always empties. */
  step(): { x: number; y: number } {
    let ox = this.px * this.k, oy = this.py * this.k;
    if (Math.abs(this.px) < 0.5) ox = this.px;
    if (Math.abs(this.py) < 0.5) oy = this.py;
    this.px -= ox; this.py -= oy;
    return { x: ox, y: oy };
  }
  flush(): { x: number; y: number } { const o = { x: this.px, y: this.py }; this.px = 0; this.py = 0; return o; }
  get pending(): boolean { return this.px !== 0 || this.py !== 0; }
}

export type ButtonId = 'act' | 'jump' | 'run' | 'car' | 'view' | 'look' | 'gas' | 'brake' | 'hand' | 'horn' | 'radio';
interface ButtonDef { id: ButtonId; code: string[]; label: string; hold: boolean; /** shown on foot / while driving */ foot: boolean; car: boolean; }
const BUTTONS: ButtonDef[] = [
  // on foot: ACT is the big one (punch / throw / shoot by what is in hand)
  { id: 'act', code: [ACTION_VIRTUAL], label: 'ACT', hold: true, foot: true, car: false },
  { id: 'jump', code: ['Space'], label: 'JUMP', hold: false, foot: true, car: false },
  { id: 'run', code: ['ShiftLeft'], label: 'RUN', hold: false, foot: true, car: false },
  // context: only when a car or a door is in reach (on foot), always while driving (EXIT)
  { id: 'car', code: ['KeyF'], label: 'CAR', hold: false, foot: true, car: true },
  // in a car: GAS and BRAKE are the big ones; HAND is the handbrake for slides
  { id: 'gas', code: ['KeyW'], label: 'GAS', hold: true, foot: false, car: true },
  { id: 'brake', code: ['Space'], label: 'BRAKE', hold: true, foot: false, car: true },
  { id: 'hand', code: ['ShiftLeft'], label: 'HAND', hold: true, foot: false, car: true },
  { id: 'horn', code: ['KeyH'], label: 'HORN', hold: true, foot: false, car: true },
  { id: 'radio', code: ['KeyE'], label: 'RADIO', hold: false, foot: false, car: true },
  { id: 'view', code: ['KeyV'], label: 'VIEW', hold: false, foot: true, car: true },
  { id: 'look', code: [LOOK_BACK_KEY], label: 'BACK', hold: true, foot: true, car: true },
];

export interface TouchContext { driving: boolean; nearCar: boolean; }

/** Which buttons show now. The CAR button is a context button: on foot it shows only when a car or door is in reach. */
export function visibleButtons(ctx: TouchContext): ButtonId[] {
  return BUTTONS.filter((b) => {
    if (b.id === 'car') return ctx.driving || ctx.nearCar;
    return ctx.driving ? b.car : b.foot;
  }).map((b) => b.id);
}

/** True for the HUD's "CAR  Enter car" / "CAR  Exit car" / door prompts (the key glyph on a phone is CAR). */
export function promptNeedsCarButton(text: string | null | undefined): boolean { return !!text && /^\s*(CAR|F)\s{2}/.test(text); }

/** Small saved choices (tutorial seen, haptics). Storage can throw (private windows): everything falls back to defaults. */
export class TouchPrefs {
  static readonly TUTORIAL_KEY = 'gtabs.touchTutorialSeen';
  static readonly HAPTICS_KEY = 'gtabs.touchHaptics';
  constructor(private store: Pick<Storage, 'getItem' | 'setItem'> | null = TouchPrefs.defaultStore()) {}
  private static defaultStore(): Storage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
  private get(k: string): string | null { try { return this.store?.getItem(k) ?? null; } catch { return null; } }
  private set(k: string, v: string): void { try { this.store?.setItem(k, v); } catch { /* storage blocked */ } }
  get tutorialSeen(): boolean { return this.get(TouchPrefs.TUTORIAL_KEY) === '1'; }
  markTutorialSeen(): void { this.set(TouchPrefs.TUTORIAL_KEY, '1'); }
  /** Vibration on press (Android and some browsers; iPhone Safari has no navigator.vibrate). On unless switched off. */
  get haptics(): boolean { return this.get(TouchPrefs.HAPTICS_KEY) !== '0'; }
  set haptics(on: boolean) { this.set(TouchPrefs.HAPTICS_KEY, on ? '1' : '0'); }
}

/** A short tick on press where the browser can do it. Returns whether a vibration was requested. */
export function hapticTick(ms = 9): boolean {
  try {
    const v = (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate;
    return typeof v === 'function' ? v.call(navigator, ms) : false;
  } catch { return false; }
}

const TUTORIAL_LINES: Array<[string, string]> = [
  ['ACT', 'punch, throw or shoot'], ['JUMP', 'jump'], ['RUN', 'sprint while you move'],
  ['CAR', 'get in or out (shows near a car or door)'], ['GAS / BRAKE', 'drive; the stick steers'],
];

export class TouchControls {
  readonly root: HTMLElement;
  readonly prefs: TouchPrefs;
  private readonly stick = new FloatingStick();
  private readonly look = new LookSmoother();
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookRaf = 0;
  private readonly ring: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly buttons = new Map<ButtonId, HTMLButtonElement>();
  private ctx: TouchContext = { driving: false, nearCar: false };
  private runLatched = false;
  private promptTimer: ReturnType<typeof setInterval> | null = null;
  private tutorial: HTMLElement | null = null;

  constructor(private parent: HTMLElement, private input: Input, prefs: TouchPrefs = new TouchPrefs()) {
    this.prefs = prefs;
    this.root = document.createElement('div');
    this.root.className = 'tc-root';
    parent.classList.add('touch');
    parent.appendChild(this.root);

    // two big zones: the left half is the stick, the right half looks (buttons sit above both)
    const zoneL = document.createElement('div'); zoneL.className = 'tc-zone tc-zone-left';
    const zoneR = document.createElement('div'); zoneR.className = 'tc-zone tc-look';
    this.ghost = document.createElement('div'); this.ghost.className = 'tc-ghost';
    this.ring = document.createElement('div'); this.ring.className = 'tc-stick';
    this.knob = document.createElement('div'); this.knob.className = 'tc-knob';
    this.ring.appendChild(this.knob);
    this.root.append(zoneL, zoneR, this.ghost, this.ring);
    this.wireStick(zoneL);
    this.wireLook(zoneR);

    const bar = document.createElement('div');
    bar.className = 'tc-buttons';
    for (const def of BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `tc-btn tc-btn-${def.id}`; b.textContent = def.label;
      b.setAttribute('aria-label', def.label);
      this.wireButton(b, def);
      this.buttons.set(def.id, b);
      bar.appendChild(b);
    }
    this.root.appendChild(bar);
    this.applyContext();

    // the HUD already works out "a car or a door is in reach" for its prompt; the CAR button follows it (no main.ts wiring needed)
    this.promptTimer = setInterval(() => this.syncPrompt(), 150);
    this.setupTutorial();
    this.setupRotateHint();
  }

  // ---- stick
  private wireStick(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.input.setMode('touch');
      this.stick.begin(e.clientX, e.clientY);
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.showStick(true);
      this.dismissTutorial();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const v = this.stick.move(e.clientX, e.clientY);
      this.input.touchAxis.x = v.x; this.input.touchAxis.y = v.y;
      this.drawStick();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null; this.stick.end();
      this.input.touchAxis.x = 0; this.input.touchAxis.y = 0;
      this.showStick(false);
      if (this.runLatched) this.setRun(false);
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  private showStick(on: boolean): void {
    this.root.classList.toggle('tc-stick-on', on);
    if (on) this.drawStick();
  }
  private drawStick(): void {
    const o = this.stick.origin, r = this.stick.radius, v = this.stick.vec;
    this.ring.style.transform = `translate(${o.x - r - 8}px, ${o.y - r - 8}px)`;
    this.knob.style.transform = `translate(${v.x * r}px, ${-v.y * r}px)`;
  }

  // ---- look
  private wireLook(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      e.preventDefault();
      this.input.setMode('touch');
      this.lookId = e.pointerId; this.lookLast = { x: e.clientX, y: e.clientY };
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.dismissTutorial();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.look.push(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.pumpLook();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.lookId) return;
      this.lookId = null;
      const rest = this.look.flush(); this.input.addLook(rest.x, rest.y);
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  /** Delivers the queued look turn once per frame until it is empty. */
  private pumpLook(): void {
    if (this.lookRaf || typeof requestAnimationFrame !== 'function') { if (typeof requestAnimationFrame !== 'function') { const o = this.look.flush(); this.input.addLook(o.x, o.y); } return; }
    const tick = (): void => {
      this.lookRaf = 0;
      const o = this.look.step(); if (o.x || o.y) this.input.addLook(o.x, o.y);
      if (this.look.pending) this.lookRaf = requestAnimationFrame(tick);
    };
    this.lookRaf = requestAnimationFrame(tick);
  }

  // ---- buttons
  private wireButton(b: HTMLButtonElement, def: ButtonDef): void {
    const setCodes = (down: boolean): void => { for (const c of def.code) this.input.setVirtual(c, down); };
    let pid: number | null = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.input.setMode('touch');
      if (this.prefs.haptics) hapticTick();
      this.dismissTutorial();
      if (def.id === 'run') { this.setRun(!this.runLatched); return; }
      pid = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      b.classList.add('on'); setCodes(true);
      if (!def.hold) setTimeout(() => { setCodes(false); b.classList.remove('on'); }, 120);
    });
    const release = (e: PointerEvent): void => {
      if (def.hold && (pid === null || e.pointerId === pid)) { pid = null; setCodes(false); b.classList.remove('on'); }
    };
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  /** RUN is a latch: tap it and the player sprints while the stick is held; it lets go when the stick does. */
  private setRun(on: boolean): void {
    this.runLatched = on;
    this.input.setVirtual('ShiftLeft', on);
    this.buttons.get('run')?.classList.toggle('on', on);
  }

  // ---- context
  /** Driving or on foot. Called by main.ts when entering / leaving a vehicle. */
  setDriving(driving: boolean): void {
    this.ctx = { ...this.ctx, driving };
    if (driving && this.runLatched) this.setRun(false);
    this.root.classList.toggle('tc-driving', driving);
    this.applyContext();
  }
  /** A car or door is in reach (optional: the HUD prompt already drives this). */
  setNearCar(near: boolean): void {
    if (near === this.ctx.nearCar) return;
    this.ctx = { ...this.ctx, nearCar: near };
    this.applyContext();
  }
  private syncPrompt(): void {
    const el = this.parent.querySelector<HTMLElement>('.hud-prompt');
    const shown = !!el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    this.setNearCar(shown && promptNeedsCarButton(el!.textContent));
  }
  private applyContext(): void {
    const vis = new Set(visibleButtons(this.ctx));
    for (const [id, b] of this.buttons) b.hidden = !vis.has(id);
    const car = this.buttons.get('car');
    if (car) car.textContent = this.ctx.driving ? 'EXIT' : 'CAR';
    this.root.classList.toggle('tc-near-car', this.ctx.nearCar && !this.ctx.driving);
  }

  // ---- first-run help (one screen, dismissible, remembered) and the rotate hint
  private setupTutorial(): void {
    if (this.prefs.tutorialSeen) return;
    const waitForPlay = setInterval(() => {
      const splash = this.parent.querySelector<HTMLElement>('.hud-splash');
      const up = !!splash && splash.style.display !== 'none';
      if (up) return;
      clearInterval(waitForPlay);
      if (!this.prefs.tutorialSeen) this.showTutorial();
    }, 400);
  }
  showTutorial(): void {
    if (this.tutorial) return;
    const t = document.createElement('div');
    t.className = 'tc-tutorial';
    t.innerHTML = '<div class="tc-tut-left"><b>MOVE</b><span>Touch and drag anywhere on this side</span></div>'
      + '<div class="tc-tut-right"><b>LOOK</b><span>Drag anywhere on this side</span></div>'
      + `<ul class="tc-tut-list">${TUTORIAL_LINES.map(([k, v]) => `<li><b>${k}</b> ${v}</li>`).join('')}</ul>`;
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'tc-tut-ok'; ok.textContent = 'GOT IT';
    ok.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.dismissTutorial(true); });
    t.appendChild(ok);
    this.root.appendChild(t);
    this.tutorial = t;
    // it never blocks play: touching the controls dismisses it, and it fades by itself after a while
    setTimeout(() => this.dismissTutorial(true), 20000);
  }
  private dismissTutorial(force = false): void {
    if (!this.tutorial) return;
    this.tutorial.classList.add('out');
    const t = this.tutorial; this.tutorial = null;
    setTimeout(() => t.remove(), 300);
    if (force || true) this.prefs.markTutorialSeen();
  }
  private setupRotateHint(): void {
    let shown = false;
    try { shown = sessionStorage.getItem('gtabs.rotateHint') === '1'; } catch { /* ignore */ }
    if (shown || typeof matchMedia !== 'function' || !matchMedia('(orientation: portrait)').matches) return;
    const h = document.createElement('div');
    h.className = 'tc-rotate'; h.textContent = 'Turn your phone sideways for a wider view';
    this.root.appendChild(h);
    try { sessionStorage.setItem('gtabs.rotateHint', '1'); } catch { /* ignore */ }
    setTimeout(() => h.classList.add('out'), 7000);
    setTimeout(() => h.remove(), 7400);
  }

  dispose(): void { if (this.promptTimer !== null) clearInterval(this.promptTimer); this.promptTimer = null; this.root.remove(); }
}
