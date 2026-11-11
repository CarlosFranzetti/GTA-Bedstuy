/**
 * Boot loading screen, GTA 5 idiom with our own art: two or three diagonal hero panels (see loadingArt.ts), each with a slow
 * ken-burns and swapping one at a time about every 7 s; a bold title; one tip; a load bar with a human stage label and a
 * percentage that never moves back and never reads 100 % until loading is done; the fan-tribute disclaimer. Safe to use before the game exists.
 * Hooks (constructor options): onShow when it appears, onFirstGesture on the first click/tap/key while it is up (the
 * moment browsers allow audio, so the loading tune can start), onHide when it starts to fade.
 */
import './loading.css';
import { PANELS, drawPanel, slotLayout } from './loadingArt';

export type StepState = 'pending' | 'active' | 'done' | 'skipped';

export interface LoadingStep { id: string; label: string; /** share of the bar; heavy stages weigh more */ weight?: number }

/** Boot stages in main.ts order, with human labels. */
export const BOOT_STEPS: readonly LoadingStep[] = [
  { id: 'materials', label: 'Streets', weight: 1 },
  { id: 'textures', label: 'Signs & paint', weight: 2 },
  { id: 'world', label: 'Buildings', weight: 4 },
  { id: 'lights', label: 'Lights', weight: 1 },
  { id: 'entities', label: 'People & cars', weight: 3 },
  { id: 'shaders', label: 'Radio & polish', weight: 2 },
];

/** Fraction complete (0..1) given step states and optional weights; the active step counts as half done. */
export function loadingProgress(states: readonly StepState[], weights?: readonly number[]): number {
  if (states.length === 0) return 1;
  let s = 0, t = 0;
  states.forEach((st, i) => { const w = weights?.[i] ?? 1; t += w; s += w * (st === 'done' || st === 'skipped' ? 1 : st === 'active' ? 0.5 : 0); });
  return t > 0 ? s / t : 1;
}

/** Resolves with `p`'s value, or `fallback` after `ms` (never rejects). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

/** Lets the browser paint (rAF then a macrotask), so the overlay updates between long synchronous build steps. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === 'function' && (typeof document === 'undefined' || !document.hidden)) requestAnimationFrame(done);
    else done();
  });
}

/** Milliseconds each art panel stays up, and each tip. */
export const PANEL_MS = 7000;
export const TIP_MS = 6500;

export const LOADING_TIPS: readonly string[] = [
  'Press F to get in or out of a car. Hold Space to brake, H for the horn.',
  'E tunes the radio. Six stations, from boom-bap to block-party funk.',
  'P opens your phone. M opens the map: drop a pin and the arrow follows it.',
  'Every block has a story. Walk up to a gold marker to hear it.',
  'Cabs, bikes and delivery vans all share Throop Ave: look both ways.',
  'The dusk light on the brownstones is best around 6 pm.',
  'Pull the right stick or drag the screen to look around on a controller or phone.',
  'Pick up cash on small jobs, then spend it at the record shop.',
];

export interface LoadingHooks {
  /** Fires once, when the screen is built and visible. */
  onShow?: () => void;
  /** Fires once, on the first pointer, touch or key press while the screen is up: audio may start now. */
  onFirstGesture?: () => void;
  /** Fires once, when the screen starts to fade out. */
  onHide?: () => void;
}


export class LoadingScreen {
  readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly note: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly pctEl: HTMLElement;
  private readonly tipEl: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly slots: Array<{ wrap: HTMLElement; cv: [HTMLCanvasElement, HTMLCanvasElement]; front: 0 | 1; panel: number }> = [];
  private readonly drawn = new Set<string>();
  private readonly labels = new Map<string, string>();
  private readonly weights = new Map<string, number>();
  private readonly states = new Map<string, StepState>();
  private shown = 0;
  private swaps = 0;
  private tip = 0;
  private timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = [];
  private gestured = false;
  private hidden = false;
  private readonly onGesture = (): void => this.gesture();
  private static readonly GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

  constructor(parent: HTMLElement, steps: readonly LoadingStep[] = BOOT_STEPS, private readonly doc: Document = document, private readonly hooks: LoadingHooks = {}) {
    const d = this.doc;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parentEl?: HTMLElement): HTMLElementTagNameMap[K] => {
      const n = d.createElement(tag);
      n.className = cls;
      parentEl?.appendChild(n);
      return n;
    };
    const root = el('div', '');
    this.root = root;
    root.id = 'loading';
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-label', 'Loading');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');

    const stage = el('div', 'ld-stage', root);
    const view = d.defaultView;
    const lay = slotLayout(view?.innerWidth ?? 1280, view?.innerHeight ?? 720);
    for (let i = 0; i < 3; i++) {
      const wrap = el('div', 'ld-slotwrap', stage);
      const slot = el('div', 'ld-slot', wrap);
      const mk = (): HTMLCanvasElement => { const cv = el('canvas', 'ld-panel', slot); cv.setAttribute('aria-hidden', 'true'); return cv; };
      this.slots.push({ wrap, cv: [mk(), mk()], front: 0, panel: i % PANELS.length });
      if (i >= lay.slots) wrap.hidden = true;
    }
    el('div', 'ld-shade', root);

    const logo = el('div', 'ld-logo', root);
    const gta = el('span', 'ld-logo-a', logo); gta.textContent = 'GTA';
    const bs = el('span', 'ld-logo-b', logo); bs.textContent = 'BED-STUY';
    const tag = el('span', 'ld-logo-c', logo); tag.textContent = 'a fan tribute';

    const bottom = el('div', 'ld-bottom', root);
    this.tipEl = el('div', 'ld-tip', bottom);
    const row = el('div', 'ld-row', bottom);
    this.stageEl = el('span', 'ld-stage-label', row);
    this.note = el('span', 'ld-note', row);
    this.pctEl = el('span', 'ld-pct', row);
    this.chip = el('button', 'ld-sound', row);
    this.chip.type = 'button';
    this.chip.textContent = 'Click for sound';
    const track = el('div', 'ld-track', bottom);
    this.bar = el('div', 'ld-fill', track);
    const disc = el('p', 'ld-disclaimer', bottom);
    disc.textContent = 'GTA Bed-Stuy is a non-commercial fan tribute to the Brooklyn neighbourhood. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. All art, music and code are original.';

    for (const s of steps) { this.labels.set(s.id, s.label); this.weights.set(s.id, s.weight ?? 1); this.states.set(s.id, 'pending'); }
    parent.appendChild(root);
    this.tipEl.textContent = LOADING_TIPS[0] ?? '';
    this.slots.slice(0, lay.slots).forEach((sl, i) => this.paint(i, sl.panel, true));
    this.refresh();

    // rotation: one slot swaps its panel at a time, so every slot changes about every PANEL_MS
    this.timers.push(setInterval(() => this.swap(), PANEL_MS / lay.slots));
    this.timers.push(setInterval(() => this.nextTip(), TIP_MS));
    for (const ev of LoadingScreen.GESTURES) d.addEventListener(ev, this.onGesture, true);
    this.chip.addEventListener('click', this.onGesture);
    this.hooks.onShow?.();
  }

  /** Mark a step as the one in progress. */
  begin(id: string): void { this.set(id, 'active'); }
  done(id: string): void { this.set(id, 'done'); }
  skip(id: string, why = ''): void { this.set(id, 'skipped'); if (why) this.warn(why); }
  /** Show a non-fatal warning line (e.g. texture timeout). */
  warn(text: string): void { this.note.textContent = text; }
  /** Raw fraction complete (0..1). */
  get progress(): number { const ids = [...this.states.keys()]; return loadingProgress(ids.map((i) => this.states.get(i)!), ids.map((i) => this.weights.get(i) ?? 1)); }
  /** Whole percent on the bar: monotonic, and 100 only once every stage is done or skipped. */
  get percent(): number { return this.shown; }
  stateOf(id: string): StepState | undefined { return this.states.get(id); }
  /** Panel shown in the first slot, how many panel canvases have been drawn so far, the stage label and the tip. */
  get panelIndex(): number { return this.slots[0]?.panel ?? 0; }
  /** The panels on screen now, one per visible slot. */
  get visiblePanels(): number[] { return this.slots.filter((s) => !s.wrap.hidden).map((s) => s.panel); }
  get drawnPanels(): number { return this.drawn.size; }
  get stageLabel(): string { return this.stageEl.textContent ?? ''; }
  get tipText(): string { return this.tipEl.textContent ?? ''; }
  /** True once a user gesture was seen (the "Click for sound" chip is gone). */
  get soundUnlocked(): boolean { return this.gestured; }

  private set(id: string, st: StepState): void {
    if (!this.states.has(id)) return;
    this.states.set(id, st);
    this.refresh();
  }

  private refresh(): void {
    const all = [...this.states.entries()];
    const complete = all.every(([, st]) => st === 'done' || st === 'skipped');
    const raw = Math.round(this.progress * 100);
    this.shown = Math.max(this.shown, complete ? 100 : Math.min(99, raw));
    this.bar.style.width = `${this.shown}%`;
    this.pctEl.textContent = `${this.shown}%`;
    this.root.setAttribute('aria-valuenow', String(this.shown));
    const active = all.find(([, st]) => st === 'active') ?? all.find(([, st]) => st === 'pending');
    this.stageEl.textContent = all.length === 0 ? '' : active ? this.labels.get(active[0]) ?? '' : 'Ready';
  }

  /** Draws panel `panel` into the slot's back canvas and brings it to the front. */
  private paint(i: number, panel: number, first = false): void {
    const sl = this.slots[i];
    if (!sl) return;
    const back = (first ? sl.front : 1 - sl.front) as 0 | 1;
    const cv = sl.cv[back];
    const view = this.doc.defaultView;
    const lay = slotLayout(view?.innerWidth ?? 1280, view?.innerHeight ?? 720);
    cv.width = lay.w; cv.height = lay.h;
    cv.classList.remove('plain');
    if (!drawPanel(cv, panel)) cv.classList.add('plain');
    this.drawn.add(`${i}:${panel}`);
    const old = sl.cv[sl.front];
    if (old !== cv) { old.classList.remove('on'); old.classList.add('out'); }
    cv.classList.remove('out'); cv.classList.add('on');
    sl.front = back; sl.panel = panel;
    if (old !== cv) this.timers.push(setTimeout(() => old.classList.remove('out'), 900));
  }

  private swap(): void {
    if (this.hidden) return;
    const vis = this.slots.filter((s) => !s.wrap.hidden);
    if (vis.length === 0) return;
    const i = this.swaps++ % vis.length;
    const shown = new Set(vis.map((s) => s.panel));
    let next = (Math.max(...shown) + 1) % PANELS.length;
    for (let k = 0; k < PANELS.length && shown.has(next); k++) next = (next + 1) % PANELS.length;
    this.paint(i, next);
  }

  private nextTip(): void {
    this.tip = (this.tip + 1) % LOADING_TIPS.length;
    this.tipEl.textContent = LOADING_TIPS[this.tip] ?? '';
  }

  private gesture(): void {
    if (this.gestured || this.hidden) return;
    this.gestured = true;
    this.chip.hidden = true;
    for (const ev of LoadingScreen.GESTURES) this.doc.removeEventListener(ev, this.onGesture, true);
    this.hooks.onFirstGesture?.();
  }

  private stop(): void {
    this.hidden = true;
    for (const t of this.timers) { clearTimeout(t as ReturnType<typeof setTimeout>); clearInterval(t as ReturnType<typeof setInterval>); }
    this.timers = [];
    for (const ev of LoadingScreen.GESTURES) this.doc.removeEventListener(ev, this.onGesture, true);
  }

  /** Fade out and remove. Resolves once removed. */
  hide(fadeMs = 500): Promise<void> {
    return new Promise((resolve) => {
      if (this.hidden) { resolve(); return; }
      this.stop();
      this.root.style.pointerEvents = 'none';
      this.root.classList.add('fading');
      this.hooks.onHide?.();
      setTimeout(() => { this.root.remove(); resolve(); }, fadeMs);
    });
  }
}
