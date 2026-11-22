/**
 * The mini tutorial (lane TUTORIAL, 22 Nov 2026), as the game sees it. main.ts builds one `Tutorial` and calls `update(dt)` once a frame;
 * `replay()` and `cancel()` are for the pause menu and for a loaded save; the police grace period is the tutorial's to manage.
 *
 *  - Starts once, on a new game with no save, the moment the title is gone. Never when a save was loaded. Never again on this device
 *    unless the player asks ("Replay tutorial", Settings, Game).
 *  - A chain of small prompts on a card that never takes the pointer. Each step is done by doing the thing. `Backspace` (pad: d-pad
 *    down, phone: the button) skips all of it; `Enter` moves past one step once the card offers it.
 *  - Afterwards: one-time hints (hints.ts) for things that come up later, remembered with the settings, off with "Hints: Off".
 */
import type { EventBus } from '@/core/Events';
import { TouchPrefs } from '../TouchControls';
import { TutorialCard } from './card';
import { fillContext, newContext, type TutorialHost } from './context';
import { TutorialEngine, type Outcome } from './engine';
import { HINTS, type HintDef } from './hints';
import { STEPS } from './steps';
import { TutorialStore } from './store';
import type { CardView, StepDef, TutorialCtx } from './types';

/** Seconds of police grace: while the tutorial runs it is topped up to this; after it ends a short while is left. */
export const GRACE_RUNNING = 40;
export const GRACE_AFTER_DONE = 60;
export const GRACE_AFTER_SKIP = 20;
/** The grace a new game has always had when there is no tutorial to run (main.ts used to set it). */
export const GRACE_NEW_GAME = 120;
export const HINT_SECONDS = 7;
/** Steps that need a car: the ones a player who skipped the cars at first gets when they first get into one. */
export const CAR_CHAIN: readonly string[] = ['vault', 'car', 'drive', 'brake', 'camera', 'radio', 'out'];

export interface TutorialOptions {
  host: TutorialHost;
  /** Where the card goes (main.ts's overlay). */
  root: HTMLElement;
  police: { setGrace(seconds: number): void };
  events: EventBus;
  /** A save was loaded at boot: no tutorial, no hints. */
  loadedSave: boolean;
  /** The title screen is up. */
  splashUp(): boolean;
  store?: TutorialStore;
  steps?: readonly StepDef[];
  hints?: readonly HintDef[];
  /** Hints on a loaded save too (default false: "none of it shown when a save is loaded"). */
  hintsWithSave?: boolean;
  /** True on the frame the pad's d-pad down goes down. Default: reads `navigator.getGamepads()`. */
  padSkipEdge?: () => boolean;
  /** A key listener target (tests pass a fake window). */
  keyTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export class Tutorial {
  readonly engine: TutorialEngine;
  readonly store: TutorialStore;
  readonly card: TutorialCard;
  readonly ctx: TutorialCtx = newContext();
  /** Every outcome, for tests and the debug hook. */
  readonly log: string[] = [];

  private readonly o: TutorialOptions;
  private readonly hints: readonly HintDef[];
  private pendingStart: boolean;
  private graceT = 0;
  private unboundT = 0;
  private padDown = false;
  private disposed = false;
  private queue: HintDef[] = [];
  private shown: { def: HintDef; t: number } | null = null;
  private readonly offs: Array<() => void> = [];
  private lastView: CardView | null = null;

  constructor(opts: TutorialOptions) {
    this.o = opts;
    this.store = opts.store ?? new TutorialStore();
    this.engine = new TutorialEngine(opts.steps ?? STEPS);
    this.hints = opts.hints ?? HINTS;
    this.ctx.presses = (code) => opts.host.input.pressCount(code);
    this.ctx.held = (code) => opts.host.input.isDown(code);
    this.card = new TutorialCard(opts.root, { onSkip: () => this.skip(), onNext: () => this.next() });

    this.pendingStart = !opts.loadedSave && !this.store.started;
    if (!opts.loadedSave) opts.police.setGrace(GRACE_NEW_GAME); // the first two minutes of a new game, as before; the tutorial tops it up
    if (this.pendingStart) this.markTouchCardSeen(); // the old first-run card on a phone is folded into this one

    this.engine.onStepDone = (id) => this.log.push(`done:${id}`);
    this.engine.onFinish = (outcome, deferred) => this.onFinish(outcome, deferred);

    const kt = opts.keyTarget ?? (typeof window !== 'undefined' ? window : null);
    if (kt) {
      const onKey = (e: Event): void => this.onKey(e as KeyboardEvent);
      kt.addEventListener('keydown', onKey, true);
      this.offs.push(() => kt.removeEventListener('keydown', onKey, true));
    }
    const ev = opts.events;
    for (const type of ['wantedChanged', 'interior:entered', 'shop:bought'] as const) {
      this.offs.push(ev.on(type, (p) => this.onEvent(type, p)));
    }
    this.offs.push(ev.on('enterVehicle', () => this.maybeResumeChapter()));
  }

  /** The tutorial card is on screen now (the card shows an instruction, a tick or the goodbye). */
  get active(): boolean { return this.engine.running; }
  get hintsOn(): boolean { return this.store.hintsOn; }
  setHints(on: boolean): void { this.store.setHints(on); if (!on) { this.queue = []; if (this.shown) { this.shown = null; this.card.hide(); } } }
  /** What the card shows right now (tests, screenshots). */
  get view(): CardView | null { return this.lastView; }

  // ---- control -------------------------------------------------------------------------------------------------------

  /** "Replay tutorial": forget that it ran and start now (or when the title goes). */
  replay(): void {
    this.store.resetTutorial();
    this.engine.cancel();
    this.queue = []; this.shown = null;
    this.pendingStart = true;
    this.log.push('replay');
  }

  /** "Skip tutorial". */
  skip(): void { if (this.engine.running) { this.log.push('skip'); this.engine.skipAll(); } }
  /** Move past the step on the card. */
  next(): void { if (this.engine.running) { this.log.push('next'); this.engine.skipStep(); } }

  /** A save was loaded or a new game began under the tutorial: whatever is on the card goes. */
  cancel(): void {
    this.pendingStart = false;
    this.engine.cancel();
    this.queue = []; this.shown = null;
    this.card.hide();
  }

  /** New game from the pause menu: the old grace period, no tutorial (it runs once; "Replay tutorial" runs it again). */
  newGame(): void { this.o.police.setGrace(GRACE_NEW_GAME); }

  // ---- the frame -----------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed) return;
    const o = this.o;
    const running = this.engine.running;
    fillContext(this.ctx, o.host, running || this.pendingStart || this.store.deferred.length > 0);
    const c = this.ctx;
    if (o.splashUp()) c.blocked = true;

    if (this.pendingStart && !o.splashUp()) {
      this.pendingStart = false;
      this.store.markStarted();
      this.markTouchCardSeen();
      this.engine.start();
      o.police.setGrace(GRACE_RUNNING);
      this.log.push('start');
    }

    if (this.engine.running) {
      this.graceT += dt;
      if (this.graceT >= 5) { this.graceT = 0; o.police.setGrace(GRACE_RUNNING); }
      if (!c.blocked && c.device === 'gamepad' && this.padEdge()) this.skip();
      if (this.engine.running) this.engine.update(dt, c);
    }
    if (this.engine.running) {
      const v = this.engine.view(c);
      this.lastView = v;
      const r = this.card.render(v, { device: c.device, inVehicle: c.inVehicle, bindings: o.host.input.bindings }, { bindingsVersion: o.host.input.bindings.version });
      // a step whose key has no binding can never be done: move on after a moment
      if (r.unbound && v.visible && v.kind === 'step' && !v.tick) { this.unboundT += dt; if (this.unboundT >= 2.5) { this.unboundT = 0; this.engine.skipStep(); } } else this.unboundT = 0;
      return;
    }
    this.hintFrame(dt, c);
  }

  // ---- hints ---------------------------------------------------------------------------------------------------------

  private hintsAllowed(): boolean {
    return this.store.hintsOn && (!this.o.loadedSave || !!this.o.hintsWithSave) && !this.engine.running && !this.pendingStart;
  }

  private enqueue(h: HintDef): void {
    if (this.store.hintSeen(h.id) || this.queue.includes(h) || this.shown?.def === h) return;
    this.queue.push(h);
  }

  private onEvent(type: NonNullable<HintDef['event']>, payload: unknown): void {
    if (this.disposed || !this.hintsAllowed()) return;
    for (const h of this.hints) if (h.event === type && (!h.match || h.match(payload))) this.enqueue(h);
  }

  private hintFrame(dt: number, c: TutorialCtx): void {
    if (!this.hintsAllowed()) { if (this.shown) { this.shown = null; this.card.hide(); } this.lastView = null; return; }
    for (const h of this.hints) if (h.when && !this.store.hintSeen(h.id) && h.when(c)) this.enqueue(h);
    if (!this.shown && this.queue.length && !c.blocked && !c.mission) {
      const def = this.queue.shift()!;
      if (!this.store.hintSeen(def.id)) { this.shown = { def, t: 0 }; this.store.markHint(def.id); this.log.push(`hint:${def.id}`); }
    }
    const s = this.shown;
    if (!s) { this.lastView = null; return; }
    if (!c.blocked) s.t += dt;
    if (s.t >= HINT_SECONDS) { this.shown = null; this.card.hide(); this.lastView = null; return; }
    const v: CardView = { visible: !c.blocked && !c.mission, kind: 'step', id: `hint:${s.def.id}`, device: c.device, stage: 'hint', text: s.def.text[c.device], why: '', tick: false, dots: [], index: -1 };
    this.lastView = v;
    this.card.render(v, { device: c.device, inVehicle: c.inVehicle, bindings: this.o.host.input.bindings }, { hint: true, bindingsVersion: this.o.host.input.bindings.version });
  }

  // ---- ending --------------------------------------------------------------------------------------------------------

  private onFinish(outcome: Outcome, deferred: string[]): void {
    if (outcome === 'done' || outcome === 'skipped') this.store.finish(outcome, outcome === 'done' ? deferred.filter((id) => CAR_CHAIN.includes(id)) : []);
    this.o.police.setGrace(outcome === 'skipped' ? GRACE_AFTER_SKIP : GRACE_AFTER_DONE);
    this.card.hide();
    this.lastView = null;
    this.log.push(`finish:${outcome}${deferred.length ? `:${deferred.join(',')}` : ''}`);
  }

  /** The player was never near a car during the tutorial: the first car they get into brings the car steps back, once. */
  private maybeResumeChapter(): void {
    if (this.disposed || this.engine.running || this.pendingStart || this.o.loadedSave) return;
    if (this.store.outcome !== 'done') return;
    const ids = this.store.deferred.filter((id) => CAR_CHAIN.includes(id) && id !== 'vault' && id !== 'car');
    if (ids.length === 0) return;
    this.store.setDeferred([]);
    this.queue = []; this.shown = null;
    this.engine.start(ids, false);
    this.o.police.setGrace(GRACE_RUNNING);
    this.log.push('chapter:cars');
  }

  // ---- input ---------------------------------------------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (this.disposed || !this.engine.running || e.repeat || this.ctx.blocked || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Backspace') { e.preventDefault(); this.skip(); }
    else if (e.code === 'Enter' && this.engine.stage === 'offer') { e.preventDefault(); this.next(); }
  }

  private padEdge(): boolean {
    if (this.o.padSkipEdge) return this.o.padSkipEdge();
    let down = false;
    try { for (const p of navigator.getGamepads?.() ?? []) if (p?.buttons?.[13]?.pressed) down = true; } catch { /* no pads */ }
    const edge = down && !this.padDown;
    this.padDown = down;
    return edge;
  }

  private markTouchCardSeen(): void {
    try { localStorage.setItem(TouchPrefs.TUTORIAL_KEY, '1'); } catch { /* storage blocked */ }
  }

  dispose(): void {
    this.disposed = true;
    for (const f of this.offs) f();
    this.card.dispose();
  }
}
