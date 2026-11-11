/**
 * Boot loading screen: rotating comic-poster art panels (see loadingArt.ts), title logo, slim progress bar with the
 * current stage, gameplay tips and the fan-tribute disclaimer. Safe to use before the game exists.
 * Hooks (constructor options): onShow when it appears, onFirstGesture on the first click/tap/key while it is up (the
 * moment browsers allow audio, so the loading tune can start), onHide when it starts to fade.
 */
import './loading.css';
import { PANELS, drawPanel, panelSize } from './loadingArt';

export type StepState = 'pending' | 'active' | 'done' | 'skipped';

export interface LoadingStep { id: string; label: string; }

export const BOOT_STEPS: readonly LoadingStep[] = [
  { id: 'materials', label: 'Materials' },
  { id: 'textures', label: 'Textures' },
  { id: 'world', label: 'World' },
  { id: 'lights', label: 'Lights & shadows' },
  { id: 'entities', label: 'Entities' },
  { id: 'shaders', label: 'Compiling shaders' },
];

/** Fraction complete (0..1) given step states; the active step counts as half done. */
export function loadingProgress(states: readonly StepState[]): number {
  if (states.length === 0) return 1;
  let s = 0;
  for (const st of states) s += st === 'done' || st === 'skipped' ? 1 : st === 'active' ? 0.5 : 0;
  return s / states.length;
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
export const PANEL_MS = 5200;
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
  private readonly tipEl: HTMLElement;
  private readonly capTitle: HTMLElement;
  private readonly capSub: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly drawn = new Set<number>();
  private readonly labels = new Map<string, string>();
  private readonly states = new Map<string, StepState>();
  private panel = 0;
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
    PANELS.forEach((p, i) => {
      const cv = el('canvas', 'ld-panel', stage);
      cv.dataset.panel = p.id;
      cv.setAttribute('aria-hidden', 'true');
      this.canvases.push(cv);
      void i;
    });
    el('div', 'ld-shade', root);

    const logo = el('div', 'ld-logo', root);
    const gta = el('span', 'ld-logo-a', logo); gta.textContent = 'GTA';
    const bs = el('span', 'ld-logo-b', logo); bs.textContent = 'BED-STUY';
    const tag = el('span', 'ld-logo-c', logo); tag.textContent = 'a fan tribute';

    const cap = el('div', 'ld-caption', root);
    this.capTitle = el('b', 'ld-cap-title', cap);
    this.capSub = el('span', 'ld-cap-sub', cap);

    this.chip = el('button', 'ld-sound', root);
    this.chip.type = 'button';
    this.chip.textContent = 'Click for sound';

    const bottom = el('div', 'ld-bottom', root);
    this.tipEl = el('div', 'ld-tip', bottom);
    const row = el('div', 'ld-row', bottom);
    this.stageEl = el('span', 'ld-stage-label', row);
    this.note = el('span', 'ld-note', row);
    const track = el('div', 'ld-track', bottom);
    this.bar = el('div', 'ld-fill', track);
    const disc = el('p', 'ld-disclaimer', bottom);
    disc.textContent = 'GTA Bed-Stuy is a non-commercial fan tribute to the Brooklyn neighbourhood. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. All art, music and code are original.';

    for (const s of steps) { this.labels.set(s.id, s.label); this.states.set(s.id, 'pending'); }
    parent.appendChild(root);
    this.tipEl.textContent = LOADING_TIPS[0] ?? '';
    this.showPanel(0);
    this.refresh();

    // rotation: art panels and tips, lazily drawn one ahead
    this.timers.push(setInterval(() => this.showPanel(this.panel + 1), PANEL_MS));
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
  get progress(): number { return loadingProgress([...this.states.values()]); }
  stateOf(id: string): StepState | undefined { return this.states.get(id); }
  /** Index of the art panel on screen, how many panels have been drawn so far, and the stage label text. */
  get panelIndex(): number { return this.panel; }
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
    const pct = Math.round(this.progress * 100);
    this.bar.style.width = `${pct}%`;
    this.root.setAttribute('aria-valuenow', String(pct));
    const all = [...this.states.entries()];
    const active = all.find(([, st]) => st === 'active') ?? all.find(([, st]) => st === 'pending');
    const doneCount = all.filter(([, st]) => st === 'done' || st === 'skipped').length;
    const label = active ? this.labels.get(active[0]) ?? '' : 'Ready';
    this.stageEl.textContent = all.length === 0 ? '' : active ? `${label} (${Math.min(all.length, doneCount + 1)}/${all.length})` : 'Ready';
  }

  private showPanel(i: number): void {
    const n = this.canvases.length;
    if (n === 0 || this.hidden) return;
    const next = ((i % n) + n) % n;
    const prev = this.panel;
    this.ensureDrawn(next);
    for (const [k, cv] of this.canvases.entries()) {
      cv.classList.remove('out');
      if (k === prev && prev !== next) { cv.classList.remove('on'); cv.classList.add('out'); }
    }
    this.canvases[next]?.classList.add('on');
    this.panel = next;
    const info = PANELS[next];
    if (info) { this.capTitle.textContent = info.caption; this.capSub.textContent = info.sub; }
    // draw the following panel a moment later, off the critical path
    const ahead = (next + 1) % n;
    if (!this.drawn.has(ahead)) this.timers.push(setTimeout(() => this.ensureDrawn(ahead), 600));
  }

  private ensureDrawn(i: number): void {
    if (this.drawn.has(i)) return;
    this.drawn.add(i);
    const cv = this.canvases[i];
    if (!cv) return;
    const view = this.doc.defaultView;
    const size = panelSize(view?.innerWidth ?? 1280, view?.innerHeight ?? 720);
    cv.width = size.w;
    cv.height = size.h;
    if (!drawPanel(cv, i)) cv.classList.add('plain');
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
