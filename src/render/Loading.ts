/**
 * Boot loading screen: full-bleed in-engine shots of our own world (src/ui/backdrops.ts) cycling slowly with a crossfade and a
 * gentle drift; the logo lockup; one tip; a load bar with a human stage label and a percentage that never moves back and never
 * reads 100 % until loading is done; the fan-tribute disclaimer. With no art files (the single-file build) it shows the graded
 * dark backdrop and looks the same otherwise. Safe to use before the game exists.
 * Hooks (constructor options): onShow when it appears, onFirstGesture on the first click/tap/key while it is up (the
 * moment browsers allow audio, so the loading tune can start), onHide when it starts to fade.
 */
import './loading.css';
import { BACKDROPS, backdropUrl, type Backdrop } from '@/ui/backdrops';

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

/** Milliseconds each shot stays up (the crossfade is inside this), and each tip. */
export const PANEL_MS = 8000;
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
  /** Two stacked pictures; the one in front fades out while the other fades in. */
  private readonly layers: [HTMLImageElement, HTMLImageElement];
  /** Indexes into BACKDROPS whose file loaded, in list order. */
  private readonly ready: number[] = [];
  private front: 0 | 1 = 0;
  private current = -1;
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
    stage.setAttribute('aria-hidden', 'true');
    const mk = (): HTMLImageElement => { const im = el('img', 'ld-shot', stage); im.alt = ''; im.decoding = 'async'; return im; };
    this.layers = [mk(), mk()];
    el('div', 'ld-shade', root);

    const logo = el('div', 'ld-logo', root);
    const gta = el('span', 'ld-logo-a', logo); gta.textContent = 'GTA';
    const bs = el('span', 'ld-logo-b', logo); bs.textContent = 'BED-STUY';
    el('span', 'ld-logo-rule', logo);
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
    this.refresh();
    this.probe();

    // rotation: the next loaded shot crossfades in every PANEL_MS
    this.timers.push(setInterval(() => this.swap(), PANEL_MS));
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
  /** Index (into BACKDROPS) of the shot on screen, or -1 while none has loaded (the dark backdrop shows). */
  get shotIndex(): number { return this.current; }
  /** How many shot files have loaded so far. */
  get loadedShots(): number { return this.ready.length; }
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

  /** Starts loading every shot; each one that arrives joins the rotation, and the first to arrive is shown at once. */
  private probe(): void {
    const Img = this.doc.defaultView?.Image;
    if (!Img) return;
    BACKDROPS.forEach((b, i) => {
      const url = backdropUrl(this.doc, b.file);
      if (!url) return;
      const im = new Img();
      im.onload = (): void => {
        if (this.hidden) return;
        this.ready.push(i);
        this.ready.sort((x, y) => x - y);
        if (this.current < 0) this.show(i);
      };
      im.onerror = (): void => { /* no art in this build: the dark backdrop stays */ };
      im.src = url;
    });
  }

  /** Brings shot `i` to the front over the other layer. */
  private show(i: number): void {
    const b: Backdrop | undefined = BACKDROPS[i];
    const url = b ? backdropUrl(this.doc, b.file) : null;
    if (!b || !url) return;
    const next = (this.current < 0 ? this.front : 1 - this.front) as 0 | 1;
    const img = this.layers[next];
    const old = this.layers[this.front];
    img.src = url;
    img.style.objectPosition = b.pos;
    // restart the drift animation on the incoming layer
    img.classList.remove('on'); void img.offsetWidth; img.classList.add('on');
    if (old !== img) old.classList.remove('on');
    this.front = next;
    this.current = i;
  }

  private swap(): void {
    if (this.hidden || this.ready.length < 2) return;
    const at = this.ready.indexOf(this.current);
    this.show(this.ready[(at + 1) % this.ready.length]!);
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
