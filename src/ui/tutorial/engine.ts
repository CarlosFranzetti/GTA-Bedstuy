/**
 * The tutorial's step engine: pure logic, no DOM, no game imports. It is given a list of steps (data) and, every frame, a
 * `TutorialCtx` snapshot, and decides which step is on the card, when it counts as done, when to repeat it more plainly (20 s)
 * and when to offer to move on (45 s). Time stands still while the card is hidden (a panel is open, a room, the title).
 *
 * Order: the first pending step that is available now. A step that is not available (no car within reach) waits and comes back; a
 * step marked `last` is taken only when nothing else can be done now; a step marked `opportunistic` (the vault) takes the card as
 * soon as it becomes available, when the step in front has not got far. Steps that never became available are handed back as
 * `deferred` when the run ends.
 */
import type { CardView, Stage, StepDef, StepState, TutorialCtx } from './types';

export interface EngineOptions {
  /** Seconds before a step repeats itself more plainly. */
  plainAfter?: number;
  /** Seconds before the card offers to move on. */
  offerAfter?: number;
  /** How long the tick shows before the next step. */
  tickSeconds?: number;
  /** How long the goodbye shows. */
  byeSeconds?: number;
  /** An opportunistic step must stay available this long before it takes the card (no flicker while walking past a car). */
  dwellSeconds?: number;
  /** A current step that stays unavailable this long goes back to the pool. */
  lapseSeconds?: number;
  /** A run with no `last` step ends when nothing has been available for this long. */
  idleEndSeconds?: number;
}

export type Outcome = '' | 'done' | 'skipped';
type Phase = 'step' | 'tick' | 'bye';

const fresh = (): StepState => ({ t: 0, acc: {}, base: {}, seen: new Set() });

export class TutorialEngine {
  state: 'idle' | 'running' | 'finished' = 'idle';
  outcome: Outcome = '';
  /** Steps never done because they never became available (set when the run ends). */
  deferred: string[] = [];
  onStepDone: ((id: string) => void) | null = null;
  onFinish: ((outcome: Outcome, deferred: string[]) => void) | null = null;
  /** Fired when a step takes the card (the host may light a marker, say). */
  onStepStart: ((id: string) => void) | null = null;

  private readonly o: Required<EngineOptions>;
  private run: StepDef[] = [];
  private doneIds = new Set<string>();
  private droppedIds = new Set<string>();
  private cur: StepDef | null = null;
  private st: StepState = fresh();
  private phase: Phase = 'step';
  private phaseT = 0;
  private lapseT = 0;
  private idleT = 0;
  private dwell = new Map<string, number>();
  private withBye = true;
  /** Panels opened since the run began: a step that asks "open the phone" is done at once if the player already did. */
  private runSeen = new Set<string>();

  constructor(readonly all: readonly StepDef[], opts: EngineOptions = {}) {
    this.o = { plainAfter: 20, offerAfter: 45, tickSeconds: 0.9, byeSeconds: 4.5, dwellSeconds: 0.6, lapseSeconds: 4, idleEndSeconds: 25, ...opts };
  }

  get running(): boolean { return this.state === 'running'; }
  get current(): StepDef | null { return this.cur; }
  get stepState(): StepState { return this.st; }
  get completed(): readonly string[] { return [...this.doneIds]; }
  /** Seconds the current step has been on the card. */
  get stepTime(): number { return this.st.t; }
  get stage(): Stage { return this.st.t >= this.o.offerAfter ? 'offer' : this.st.t >= this.o.plainAfter ? 'plain' : 'hint'; }

  /** Begin a run. `ids` picks and orders steps from `all` (default: all of them, in order). `bye` = say goodbye when the run ends. */
  start(ids?: readonly string[], bye = true): void {
    this.run = ids ? ids.map((id) => this.all.find((s) => s.id === id)).filter((s): s is StepDef => !!s) : [...this.all];
    this.doneIds.clear(); this.droppedIds.clear(); this.dwell.clear(); this.runSeen.clear();
    this.cur = null; this.st = fresh(); this.phase = 'step'; this.phaseT = 0; this.lapseT = 0; this.idleT = 0;
    this.deferred = []; this.outcome = ''; this.state = 'running'; this.withBye = bye;
  }

  /** Stop at once (a save was loaded, the player left the game). No callbacks. */
  cancel(): void { this.state = 'idle'; this.cur = null; this.outcome = ''; }

  /** "Skip tutorial": the whole thing ends now. */
  skipAll(): void { if (this.running) this.finish('skipped', []); }

  /** "Move on": drop the step on the card (it is not offered again). */
  skipStep(): void {
    if (!this.running || !this.cur || this.phase !== 'step') return;
    this.droppedIds.add(this.cur.id);
    this.setPhase('tick');
  }

  private pending(): StepDef[] { return this.run.filter((s) => !this.doneIds.has(s.id) && !this.droppedIds.has(s.id)); }
  private avail(s: StepDef, c: TutorialCtx): boolean { return !s.when || s.when(c); }

  private pick(c: TutorialCtx): StepDef | null {
    const av = this.pending().filter((s) => this.avail(s, c));
    return av.find((s) => !s.last) ?? av.find((s) => s.last) ?? null;
  }

  private setPhase(p: Phase): void { this.phase = p; this.phaseT = 0; }

  private take(s: StepDef, c: TutorialCtx): void {
    this.cur = s; this.st = fresh(); this.st.seen = new Set(this.runSeen); this.st.acc.veh = c.inVehicle ? 1 : 0; this.lapseT = 0; this.phase = 'step'; this.phaseT = 0;
    s.start?.(c, this.st);
    this.onStepStart?.(s.id);
  }

  private finish(outcome: Outcome, deferred: string[]): void {
    this.state = 'finished'; this.outcome = outcome; this.deferred = deferred; this.cur = null;
    this.onFinish?.(outcome, deferred);
  }

  update(dt: number, c: TutorialCtx): void {
    if (!this.running) return;
    const hidden = c.blocked;
    const live = hidden ? 0 : dt;

    if (this.phase === 'bye') {
      this.phaseT += live;
      if (this.phaseT >= this.o.byeSeconds) this.finish('done', this.pending().map((s) => s.id));
      return;
    }
    if (this.phase === 'tick') {
      this.phaseT += live;
      if (this.phaseT >= this.o.tickSeconds) { this.cur = null; this.st = fresh(); this.phase = 'step'; this.phaseT = 0; }
      else return;
    }

    if (c.panel) { this.st.seen.add(c.panel); this.runSeen.add(c.panel); }
    for (const p of this.pending()) if (p !== this.cur && p.already?.(c)) this.doneIds.add(p.id);   // got into a car early, jumped early: not asked again

    if (!this.cur) {
      const next = this.pick(c);
      if (!next) {
        const left = this.pending();
        // everything that can be done is done: the `last` step has had its turn (or there is none and nothing is left)
        if (left.length === 0 || this.run.some((s) => s.last && !this.pending().includes(s))) { this.endRun(); return; }
        this.idleT += live;
        if (this.idleT >= this.o.idleEndSeconds && !this.run.some((s) => s.last)) this.finish('done', left.map((s) => s.id));
        return;
      }
      this.idleT = 0;
      this.take(next, c);
      if (c.panel) this.st.seen.add(c.panel);
    }
    const s = this.cur!;
    this.st.t += live;
    if (s.auto !== undefined && this.st.t >= s.auto) return this.complete(s);
    if (s.done?.(c, this.st, live)) return this.complete(s);

    if (s.when && !s.when(c)) {
      this.lapseT += live;
      // a step meant for the street (or the car) goes at once when the player changes over; one that merely drifted out of reach waits a few seconds
      const flipped = (c.inVehicle ? 1 : 0) !== this.st.acc.veh;
      if (this.lapseT >= (flipped ? 0.4 : this.o.lapseSeconds)) { this.cur = null; this.lapseT = 0; return; }
    } else this.lapseT = 0;

    // an opportunistic step (the vault) takes the card when its moment comes
    for (const o of this.pending()) {
      if (!o.opportunistic || o === s) continue;
      if (this.avail(o, c)) {
        const d = (this.dwell.get(o.id) ?? 0) + live;
        this.dwell.set(o.id, d);
        if (d >= this.o.dwellSeconds && !s.opportunistic && !hidden) { this.dwell.delete(o.id); this.take(o, c); return; }
      } else this.dwell.delete(o.id);
    }
  }

  private complete(s: StepDef): void {
    this.doneIds.add(s.id);
    this.onStepDone?.(s.id);
    this.setPhase('tick');
  }

  private endRun(): void {
    if (this.withBye) { this.cur = null; this.setPhase('bye'); } else this.finish('done', []);
  }

  /** What the card should show now. `c` decides visibility (blocked = hidden). */
  view(c: TutorialCtx): CardView {
    const dots = this.run.map((s) => ({ id: s.id, done: this.doneIds.has(s.id) || this.droppedIds.has(s.id), current: s === this.cur }));
    const index = this.run.findIndex((s) => s === this.cur);
    const base = { device: c.device, dots, index, stage: this.stage };
    if (!this.running) return { ...base, visible: false, kind: 'step', id: '', text: '', why: '', tick: false };
    if (this.phase === 'bye') return { ...base, visible: !c.blocked, kind: 'bye', id: 'bye', text: BYE[c.device], why: '', tick: true, stage: 'hint' };
    const s = this.cur;
    if (!s) return { ...base, visible: false, kind: 'step', id: '', text: '', why: '', tick: false };
    const plain = this.stage !== 'hint' ? s.plain?.[c.device] : undefined;
    return { ...base, visible: !c.blocked, kind: 'step', id: s.id, text: plain ?? s.text[c.device], why: s.why, tick: this.phase === 'tick' };
  }
}

/** The goodbye, one line, same on every device. */
export const BYE: Record<'keyboard' | 'gamepad' | 'touch', string> = {
  keyboard: 'That is the lot. The block is yours.',
  gamepad: 'That is the lot. The block is yours.',
  touch: 'That is the lot. The block is yours.',
};
