/**
 * Camera views: the on-foot and in-vehicle rigs a player can cycle through, the remembered choice per mode, the
 * double-tap quick swap, the over-shoulder side, and the GTA-style cinematic director (hard cuts every few seconds).
 * Pure data and state: no three.js, no DOM except an injectable Storage. `ThirdPersonCamera` reads `rig()` every frame.
 */
export type ViewMode = 'foot' | 'vehicle';
/** Camera style: 'classic' is the fixed far chase of an early-2000s open-world game (docs/swarm/tasks/CAMERA.md); 'modern' is the over-the-shoulder rig. */
export type CameraStyle = 'classic' | 'modern';

export interface ViewRig {
  id: string;
  label: string;
  /** Metres behind the pivot (0 = first person). */
  distance: number;
  /** Camera height above the ground at the pivot. */
  height: number;
  /** Height of the look-at pivot. */
  look: number;
  /** Lateral offset (m) toward the shoulder side; foot views only. */
  shoulder: number;
  /** Degrees; on foot absolute, in a vehicle added to the speed-widened field of view. */
  fov: number;
  /** First person / bumper view: camera sits at `height`, looks along the heading and the body is hidden (foot). */
  first: boolean;
  /** Vehicle only: cut between angles automatically. */
  cinematic: boolean;
  /** Vehicle only: metres the camera sits ahead of the car centre (first views) as a share of the car length. */
  forwardShare: number;
  /** Vehicle only: scale of the sedan rig's distance and height. */
  distScale: number;
  heightScale: number;
  /** Classic on-foot rig: the pitch (rad above the horizon) the view rests at. Other rigs rest at 0. */
  pitch?: number;
}

const base = (o: Partial<ViewRig> & Pick<ViewRig, 'id' | 'label'>): ViewRig => ({
  distance: 3.2, height: 1.55, look: 1.4, shoulder: 0.35, fov: 64, first: false, cinematic: false, forwardShare: 0, distScale: 1, heightScale: 1, ...o,
});

/** On foot: close over-shoulder, standard chase (the old rig), far, first person. */
export const FOOT_VIEWS: readonly ViewRig[] = [
  base({ id: 'shoulder', label: 'Over the shoulder', distance: 2.0, height: 1.7, look: 1.55, shoulder: 0.62, fov: 58 }),
  base({ id: 'chase', label: 'Chase', distance: 3.2, height: 1.55, look: 1.4, shoulder: 0.35, fov: 64 }),
  base({ id: 'far', label: 'Far', distance: 6.5, height: 3.4, look: 1.2, shoulder: 0.15, fov: 66 }),
  base({ id: 'first', label: 'First person', distance: 0, height: 1.66, look: 1.66, shoulder: 0, fov: 76, first: true }),
];

/** In a vehicle: bumper/hood, close chase, standard chase (the old rig), far chase, cinematic. */
export const VEHICLE_VIEWS: readonly ViewRig[] = [
  base({ id: 'hood', label: 'Hood', distance: 0, height: 1.05, look: 1.05, shoulder: 0, fov: 8, first: true, forwardShare: 0.28 }),
  base({ id: 'close', label: 'Close chase', fov: 0, distScale: 0.62, heightScale: 0.8 }),
  base({ id: 'chase', label: 'Chase', fov: 0 }),
  base({ id: 'far', label: 'Far chase', fov: 4, distScale: 1.6, heightScale: 1.5 }),
  base({ id: 'cinematic', label: 'Cinematic', fov: 0, cinematic: true }),
];

/**
 * CLASSIC (CAMERA seat, 24 Nov): on foot one far, fairly high chase rig (no shoulder) and, while a key is held, a first-person look;
 * in a vehicle near, middle and far chase, a bumper view and the cinematic view. Every number is in docs/swarm/tasks/CAMERA.md.
 * `distScale` and `heightScale` scale the classic car rig (CAM_CLASSIC_VEHICLE in Camera.ts).
 */
export const CLASSIC_FOOT_VIEWS: readonly ViewRig[] = [
  base({ id: 'chase', label: 'Chase', distance: 5.4, height: 1.9, look: 1.2, shoulder: 0, fov: 60, pitch: 0.28 }),
];
/** Held first-person look on foot (not part of the cycle). */
export const CLASSIC_FIRST: ViewRig = base({ id: 'first', label: 'First person', distance: 0, height: 1.66, look: 1.66, shoulder: 0, fov: 74, first: true });
export const CLASSIC_VEHICLE_VIEWS: readonly ViewRig[] = [
  base({ id: 'near', label: 'Near chase', shoulder: 0, fov: 0, distScale: 0.8, heightScale: 0.85 }),
  base({ id: 'middle', label: 'Middle chase', shoulder: 0, fov: 0 }),
  base({ id: 'far', label: 'Far chase', shoulder: 0, fov: 2, distScale: 1.45, heightScale: 1.4 }),
  base({ id: 'bumper', label: 'Bumper', distance: 0, height: 0.8, look: 0.8, shoulder: 0, fov: 6, first: true, forwardShare: 0.5 }),
  base({ id: 'cinematic', label: 'Cinematic', shoulder: 0, fov: 0, cinematic: true }),
];
export const CLASSIC_DEFAULT_VIEW: Record<ViewMode, string> = { foot: 'chase', vehicle: 'middle' };

export const DEFAULT_VIEW: Record<ViewMode, string> = { foot: 'chase', vehicle: 'chase' };
export const VIEWS: Record<ViewMode, readonly ViewRig[]> = { foot: FOOT_VIEWS, vehicle: VEHICLE_VIEWS };
export const CLASSIC_VIEWS: Record<ViewMode, readonly ViewRig[]> = { foot: CLASSIC_FOOT_VIEWS, vehicle: CLASSIC_VEHICLE_VIEWS };

/** Key and window that drive the views (main.ts feeds key edges to `handleKeys`). */
export const VIEW_KEY = 'KeyV';
export const SHOULDER_KEY = 'KeyB';
export const SHOULDER_MOUSE = 'MouseMiddle';
/** A second press of the view key within this many seconds swaps back to the previous view instead of cycling on. */
export const DOUBLE_TAP = 0.3;
export const STORAGE_KEY = 'gta-bedstuy.camera-views.v1';
export const STORAGE_KEY_CLASSIC = 'gta-bedstuy.camera-views.classic.v1';
/** The chosen camera style (Settings, "Classic camera"). Classic is the default. */
export const STYLE_KEY = 'gta-bedstuy.camera-style.v1';

/** Reads the chosen style (classic when nothing is stored or storage is blocked). */
export function loadCameraStyle(): CameraStyle {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(STYLE_KEY) === 'modern') ? 'modern' : 'classic'; } catch { return 'classic'; }
}
const styleListeners = new Set<(s: CameraStyle) => void>();
/** Settings calls this: stores the choice and tells listeners (main.ts hands it to the camera). */
export function setCameraStyle(s: CameraStyle): void {
  try { localStorage.setItem(STYLE_KEY, s); } catch { /* private window */ }
  for (const f of styleListeners) f(s);
}
export function onCameraStyleChange(f: (s: CameraStyle) => void): () => void { styleListeners.add(f); return () => { styleListeners.delete(f); }; }

/** A cinematic shot: where the camera sits relative to the car. `yaw` is added to the chase heading (0 = behind, PI = in front). */
export interface CineShot { name: string; yaw: number; distance: number; height: number; look: number; fov: number }
export const CINE_SHOTS: readonly CineShot[] = [
  { name: 'side-low-left', yaw: -Math.PI / 2, distance: 6.5, height: 0.75, look: 0.7, fov: 52 },
  { name: 'side-low-right', yaw: Math.PI / 2, distance: 6.5, height: 0.75, look: 0.7, fov: 52 },
  { name: 'front-low', yaw: Math.PI, distance: 7.5, height: 0.6, look: 0.7, fov: 48 },
  { name: 'rear-high', yaw: 0.5, distance: 9, height: 3.6, look: 1.0, fov: 58 },
  { name: 'front-quarter', yaw: Math.PI - 0.55, distance: 5.8, height: 0.9, look: 0.9, fov: 50 },
  { name: 'wide-high', yaw: -0.35, distance: 13, height: 7.5, look: 0.8, fov: 55 },
];
/** Seconds a cinematic shot is held before the next cut: between these. */
export const CINE_HOLD_MIN = 3.2;
export const CINE_HOLD_MAX = 5.8;

/** Deterministic cut sequencer. `update(dt)` returns true on the frame a cut happened. */
export class CinematicDirector {
  shot: CineShot = CINE_SHOTS[0];
  private index = 0;
  private timer = 0;
  private hold = CINE_HOLD_MIN;
  private seed: number;
  constructor(seed = 1) { this.seed = seed >>> 0 || 1; this.hold = this.nextHold(); }
  private rnd(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  private nextHold(): number { return CINE_HOLD_MIN + (CINE_HOLD_MAX - CINE_HOLD_MIN) * this.rnd(); }
  /** Start a fresh sequence on a new shot. */
  reset(): void { this.timer = 0; this.hold = this.nextHold(); this.cut(); }
  private cut(): void {
    // never the same shot twice in a row, and never the mirror-image side shot straight after its twin
    let next = this.index;
    for (let guard = 0; guard < 8 && next === this.index; guard++) next = Math.floor(this.rnd() * CINE_SHOTS.length);
    if (next === this.index) next = (this.index + 1) % CINE_SHOTS.length;
    this.index = next;
    this.shot = CINE_SHOTS[next];
  }
  get holdSeconds(): number { return this.hold; }
  update(dt: number): boolean {
    this.timer += dt;
    if (this.timer < this.hold) return false;
    this.timer = 0; this.hold = this.nextHold(); this.cut();
    return true;
  }
}

type Persisted = { foot?: string; vehicle?: string; side?: number };

function defaultStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class CameraViews {
  private cur: Record<ViewMode, number>;
  private prev: Record<ViewMode, number>;
  private styleNow: CameraStyle = 'modern';
  /** +1 = camera over the right shoulder, -1 = left. */
  side = 1;
  private clock = 0;
  private lastPress = -1e9;
  readonly director = new CinematicDirector();
  /** Set when the cinematic director cut this frame (the camera snaps its smoothing once). */
  cutThisFrame = false;
  /** Counts view changes (a key press, a swap, `setView`). The camera compares it with the last one it saw to start a blend or a cut. */
  serial = 0;
  /** Fires after a change the player should be told about (the host shows a toast). */
  onChange: ((label: string, mode: ViewMode) => void) | null = null;

  constructor(private storage: Storage | null = defaultStorage()) {
    this.cur = { foot: this.indexOf('foot', DEFAULT_VIEW.foot), vehicle: this.indexOf('vehicle', DEFAULT_VIEW.vehicle) };
    this.prev = { foot: this.cur.foot, vehicle: this.cur.vehicle };
    this.load();
  }

  private get tables(): Record<ViewMode, readonly ViewRig[]> { return this.styleNow === 'classic' ? CLASSIC_VIEWS : VIEWS; }
  get style(): CameraStyle { return this.styleNow; }

  /** Switch the view tables (and the remembered choice) to a style. Counts as a view change so the camera cuts. */
  setStyle(style: CameraStyle): void {
    if (style === this.styleNow) return;
    this.styleNow = style;
    const dv = style === 'classic' ? CLASSIC_DEFAULT_VIEW : DEFAULT_VIEW;
    this.cur = { foot: this.indexOf('foot', dv.foot), vehicle: this.indexOf('vehicle', dv.vehicle) };
    this.prev = { foot: this.cur.foot, vehicle: this.cur.vehicle };
    this.load();
    this.serial++;
  }

  private indexOf(mode: ViewMode, id: string): number {
    const i = this.tables[mode].findIndex((v) => v.id === id);
    return i < 0 ? 0 : i;
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(this.styleNow === 'classic' ? STORAGE_KEY_CLASSIC : STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Persisted;
      const T = this.tables;
      if (typeof p.foot === 'string') { const i = T.foot.findIndex((v) => v.id === p.foot); if (i >= 0) this.cur.foot = this.prev.foot = i; }
      if (typeof p.vehicle === 'string') { const i = T.vehicle.findIndex((v) => v.id === p.vehicle); if (i >= 0) this.cur.vehicle = this.prev.vehicle = i; }
      if (p.side === 1 || p.side === -1) this.side = p.side;
    } catch { /* corrupt or blocked storage: defaults */ }
  }

  private save(): void {
    try {
      const T = this.tables;
      this.storage?.setItem(this.styleNow === 'classic' ? STORAGE_KEY_CLASSIC : STORAGE_KEY, JSON.stringify({ foot: T.foot[this.cur.foot].id, vehicle: T.vehicle[this.cur.vehicle].id, side: this.side } satisfies Persisted));
    } catch { /* private window / quota */ }
  }

  /** The active rig for a mode. */
  rig(mode: ViewMode): ViewRig { return this.tables[mode][this.cur[mode]]; }
  id(mode: ViewMode): string { return this.rig(mode).id; }
  /** The rig the quick swap would switch to. */
  previous(mode: ViewMode): ViewRig { return this.tables[mode][this.prev[mode]]; }

  /** Advance the clock and the cinematic director (only while a cinematic view is showing). */
  tick(dt: number, mode: ViewMode): void {
    this.clock += dt;
    this.cutThisFrame = false;
    if (this.rig(mode).cinematic) this.cutThisFrame = this.director.update(dt);
  }

  setView(mode: ViewMode, id: string): boolean {
    const i = this.tables[mode].findIndex((v) => v.id === id);
    if (i < 0 || i === this.cur[mode]) return false;
    this.change(mode, i);
    return true;
  }

  private change(mode: ViewMode, next: number): void {
    this.serial++;
    this.prev[mode] = this.cur[mode];
    this.cur[mode] = next;
    if (this.tables[mode][next].cinematic) { this.director.reset(); this.cutThisFrame = true; }
    this.save();
    this.onChange?.(this.tables[mode][next].label, mode);
  }

  /** The V key (or Select / VIEW button): cycle to the next view; a second press within DOUBLE_TAP swaps back and forth between the last two. */
  pressView(mode: ViewMode): void {
    const n = this.tables[mode].length;
    if (n < 2) return; // classic on foot has one rig
    const dbl = this.clock - this.lastPress <= DOUBLE_TAP;
    this.lastPress = this.clock;
    if (dbl && this.prev[mode] !== this.cur[mode]) { this.change(mode, this.prev[mode]); return; }
    this.change(mode, (this.cur[mode] + 1) % n);
  }

  /** B / middle mouse: swap the over-shoulder side. */
  swapShoulder(): void {
    if (this.styleNow === 'classic') return; // no shoulder offset in the classic camera
    this.side = this.side === 1 ? -1 : 1;
    this.save();
    this.onChange?.(this.side === 1 ? 'Right shoulder' : 'Left shoulder', 'foot');
  }

  /** Read the keys from an Input (anything with `consume`). Call from the fixed step, never while a menu is open. */
  handleKeys(input: { consume?: (code: string) => boolean }, mode: ViewMode): void {
    if (typeof input.consume !== 'function') return;
    if (input.consume(VIEW_KEY)) this.pressView(mode);
    const sw = input.consume(SHOULDER_KEY);
    const mid = input.consume(SHOULDER_MOUSE);
    if ((sw || mid) && mode === 'foot') this.swapShoulder();
  }
}
