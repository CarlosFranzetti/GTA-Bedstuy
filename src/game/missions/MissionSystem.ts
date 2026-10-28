/**
 * MissionSystem: a small data-driven mission state machine.
 *
 *   available --(enter trigger zone)--> active --(last objective)--> complete
 *                                          |                            (kept in the save)
 *                                          +--(clock / rule broken)--> failed --retry()--> active
 *                                                                          \--abandon()--> available
 *
 * Pure logic: no three.js, no DOM. The host calls `update(dt, pos, inVehicle, wantedStars, speedMps, hour)` once per
 * fixed step, draws `markers` (rebuild when `markersVersion` changes), feeds `hud` to MissionHud, and persists
 * `serialize()` via the `persist` option. Events are emitted on the local emitter (`on`) and mirrored to an optional
 * `bus` (the game EventBus, once the mission:* keys exist in GameEvents). `update` allocates nothing in steady state.
 */
import type { Vec2 } from '@/core/Math2';
import type {
  FailReason, MissionDef, MissionEventName, MissionEvents, MissionHudState, MissionMarker, MissionSave, ObjectiveDef,
} from './types';

export type MissionListener<K extends MissionEventName> = (payload: MissionEvents[K]) => void;

export interface MissionSystemOptions {
  /** Mirror every mission:* event here (pass `events` from main once GameEvents declares them). */
  bus?: { emit: (type: never, payload: never) => void };
  /** Asked to raise the wanted level to `stars` (a laundromat bag is a crime). `pos` is where it happened. */
  raiseWanted?: (stars: number, pos: Vec2) => void;
  /** Called with the new save whenever progress changes (completion, restore). */
  persist?: (save: MissionSave) => void;
  /** Game hours per real second; converts the deadline-hour clock to real seconds for the HUD. Default 1/60. */
  gameHoursPerSecond?: number;
  /** Labels used in the retry prompt. */
  retryKey?: string;
  abandonKey?: string;
}

const COLOR_GIVER = '#f5c542';
const COLOR_GOAL = '#4ade80';
const DEFAULT_GAME_HOURS_PER_SECOND = 1 / 60;
const MAX_STARS = 3;

const wrap24 = (h: number): number => ((h % 24) + 24) % 24;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

type Statuses = 'available' | 'active' | 'complete' | 'failed';

export class MissionSystem {
  /** Cash earned from missions (persisted). */
  cash = 0;
  /** Bumps whenever `markers` was rebuilt. */
  markersVersion = 0;
  readonly markers: MissionMarker[] = [];
  /** HUD feed, mutated in place. */
  readonly hud: MissionHudState = {
    status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '',
    cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '',
  };

  private readonly defs: readonly MissionDef[];
  private readonly status: Statuses[];
  private readonly armed: boolean[];
  private readonly listeners = new Map<MissionEventName, Set<(p: never) => void>>();
  private readonly opts: MissionSystemOptions;
  private readonly hoursPerSec: number;

  // active run
  private cur = -1;
  private obj = 0;
  private elapsed = 0;
  private objElapsed = 0;
  private acc = 0;
  private outOfCar = 0;
  private hourLeft = -1;
  private readonly items: string[] = [];
  private lastFail: FailReason | null = null;
  private hintedZone = -1;

  constructor(defs: readonly MissionDef[], opts: MissionSystemOptions = {}) {
    this.defs = defs;
    this.opts = opts;
    this.hoursPerSec = opts.gameHoursPerSecond ?? DEFAULT_GAME_HOURS_PER_SECOND;
    this.status = defs.map(() => 'available');
    this.armed = defs.map(() => false);
    this.rebuildMarkers();
    this.hud.cash = this.cash;
  }

  // ------------------------------------------------------------------ queries

  get missions(): readonly MissionDef[] { return this.defs; }
  get activeId(): string | null { return this.cur >= 0 ? this.defs[this.cur].id : null; }
  get isActive(): boolean { return this.cur >= 0 && this.status[this.cur] === 'active'; }
  get isFailed(): boolean { return this.cur >= 0 && this.status[this.cur] === 'failed'; }
  get failReason(): FailReason | null { return this.isFailed ? this.lastFail : null; }
  get objectiveIndex(): number { return this.cur >= 0 ? this.obj : -1; }
  get carrying(): readonly string[] { return this.items; }
  statusOf(id: string): Statuses | null {
    const i = this.indexOf(id);
    return i < 0 ? null : this.status[i];
  }
  isCompleted(id: string): boolean { return this.statusOf(id) === 'complete'; }

  on<K extends MissionEventName>(type: K, fn: MissionListener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) { set = new Set(); this.listeners.set(type, set); }
    set.add(fn as (p: never) => void);
    return () => { set!.delete(fn as (p: never) => void); };
  }

  // ------------------------------------------------------------------ control

  /** Start a mission directly (debug, or a host-side trigger). Ignores the trigger zone and the hour window. */
  start(id: string): boolean {
    const i = this.indexOf(id);
    if (i < 0 || this.cur >= 0 || this.status[i] === 'complete') return false;
    this.begin(i, -1);
    return true;
  }

  /** After a failure: restart the same mission from objective 0 with every clock and carried item reset. */
  retry(hour = -1): boolean {
    if (!this.isFailed) return false;
    this.begin(this.cur, hour);
    return true;
  }

  /** Drop a failed (or running) mission without penalty. It becomes available again once the player leaves the zone. */
  abandon(): boolean {
    if (this.cur < 0) return false;
    const i = this.cur;
    this.status[i] = 'available';
    this.armed[i] = false;
    this.cur = -1;
    this.clearRun();
    this.hud.status = 'idle';
    this.hud.retryPrompt = '';
    this.rebuildMarkers();
    this.syncStatic();
    return true;
  }

  // ------------------------------------------------------------------ persistence

  serialize(): MissionSave {
    const completed: string[] = [];
    for (let i = 0; i < this.defs.length; i++) if (this.status[i] === 'complete') completed.push(this.defs[i].id);
    return { v: 1, completed, cash: this.cash };
  }

  /** Loads a save. Returns false (state untouched) when `data` is not a valid save. Unknown mission ids are ignored. */
  restore(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const o = data as Partial<MissionSave>;
    if (o.v !== 1 || !Array.isArray(o.completed) || !finite(o.cash) || o.cash < 0) return false;
    if (!o.completed.every((c) => typeof c === 'string')) return false;
    if (this.cur >= 0) this.abandon();
    const done = new Set(o.completed);
    for (let i = 0; i < this.defs.length; i++) this.status[i] = done.has(this.defs[i].id) ? 'complete' : 'available';
    this.cash = o.cash;
    this.hud.cash = this.cash;
    this.rebuildMarkers();
    return true;
  }

  // ------------------------------------------------------------------ frame

  /**
   * @param dt fixed step, seconds
   * @param pos player (or driven vehicle) position
   * @param speedMps current speed in m/s (only holdSpeedBelow needs it)
   * @param hour game hour 0..24, or -1 when unknown (disables hour windows and deadlines)
   */
  update(dt: number, pos: Vec2, inVehicle: boolean, wantedStars: number, speedMps = 0, hour = -1): void {
    if (this.cur < 0) { this.checkTriggers(pos, hour); return; }
    if (this.status[this.cur] !== 'active') return;

    const def = this.defs[this.cur];
    this.elapsed += dt;
    this.objElapsed += dt;

    // clocks
    if (def.timeLimit !== undefined && this.elapsed >= def.timeLimit) return this.fail('timeUp');
    const ob = def.objectives[this.obj];
    if (ob.timeLimit !== undefined && this.objElapsed >= ob.timeLimit) return this.fail('timeUp');
    if (def.deadlineHour !== undefined && hour >= 0) {
      const left = wrap24(def.deadlineHour - hour);
      // the remaining time only ever shrinks; a jump up means the clock passed the deadline
      if (this.hourLeft >= 0 && left > this.hourLeft + 1e-6) return this.fail('clockUp');
      this.hourLeft = left;
    }
    // getaway rule
    if (ob.stayInVehicle !== undefined) {
      if (inVehicle) this.outOfCar = 0;
      else {
        this.outOfCar += dt;
        if (this.outOfCar > ob.stayInVehicle) return this.fail('leftVehicle');
      }
    }

    if (this.evaluate(ob, pos, inVehicle, wantedStars, speedMps, dt)) this.advance(ob, pos);
    else this.syncDynamic();
  }

  // ------------------------------------------------------------------ internals

  private indexOf(id: string): number {
    for (let i = 0; i < this.defs.length; i++) if (this.defs[i].id === id) return i;
    return -1;
  }

  private checkTriggers(pos: Vec2, hour: number): void {
    let inAny = -1;
    for (let i = 0; i < this.defs.length; i++) {
      if (this.status[i] === 'complete') continue;
      const d = this.defs[i];
      const dx = pos.x - d.giver.x, dz = pos.z - d.giver.z;
      if (dx * dx + dz * dz > d.triggerRadius * d.triggerRadius) { this.armed[i] = true; continue; }
      inAny = i;
      if (!this.armed[i]) continue;
      if (d.availableHours && hour >= 0 && !(hour >= d.availableHours[0] && hour < d.availableHours[1])) {
        if (this.hintedZone !== i) {
          this.hintedZone = i;
          this.toast(`${d.title}: come back between ${fmtHour(d.availableHours[0])} and ${fmtHour(d.availableHours[1])}.`, 'info');
        }
        continue;
      }
      this.begin(i, hour);
      return;
    }
    if (inAny < 0) this.hintedZone = -1;
  }

  private begin(i: number, hour: number): void {
    const d = this.defs[i];
    this.cur = i;
    this.status[i] = 'active';
    this.clearRun();
    this.hourLeft = d.deadlineHour !== undefined && hour >= 0 ? wrap24(d.deadlineHour - hour) : -1;
    this.lastFail = null;
    this.hud.status = 'active';
    this.hud.title = d.title;
    this.hud.steps = d.objectives.length;
    this.hud.retryPrompt = '';
    this.setObjectiveHud();
    this.rebuildMarkers();
    this.toast(d.blurb, 'info');
    this.emit('mission:started', { id: d.id, title: d.title, blurb: d.blurb });
    this.emit('mission:objective', { id: d.id, index: 0, total: d.objectives.length, text: d.objectives[0].text });
    this.syncStatic();
    this.syncDynamic();
  }

  private clearRun(): void {
    this.obj = 0; this.elapsed = 0; this.objElapsed = 0; this.acc = 0; this.outOfCar = 0; this.items.length = 0;
    this.hourLeft = -1;
    this.hud.carrying = '';
    this.hud.timeLeft = -1;
    this.hud.progress = -1;
  }

  private evaluate(ob: ObjectiveDef, pos: Vec2, inVehicle: boolean, stars: number, speedMps: number, dt: number): boolean {
    switch (ob.kind) {
      case 'goTo': return inCircle(pos, ob.at, ob.radius) && presenceOk(ob.presence, inVehicle);
      case 'pickUp': return inCircle(pos, ob.at, ob.radius) && presenceOk(ob.presence, inVehicle);
      case 'deliver':
        return inCircle(pos, ob.at, ob.radius) && presenceOk(ob.presence, inVehicle) && this.hasAll(ob.items);
      case 'enterVehicle': return inVehicle;
      case 'loseWanted': return stars <= 0;
      case 'surviveWanted':
        if (stars >= (ob.minStars ?? 1)) this.acc += dt;
        this.hud.progress = Math.min(1, this.acc / ob.seconds);
        return this.acc >= ob.seconds;
      case 'timer':
        this.acc += dt;
        this.hud.progress = Math.min(1, this.acc / ob.seconds);
        return this.acc >= ob.seconds;
      case 'holdSpeedBelow': {
        const inside = ob.at === undefined || inCircle(pos, ob.at, ob.radius ?? 5);
        if (inside && speedMps * 3.6 < ob.kmh) this.acc += dt; else this.acc = 0;
        this.hud.progress = Math.min(1, this.acc / ob.seconds);
        return this.acc >= ob.seconds;
      }
      case 'escapeRadius': {
        const dx = pos.x - ob.from.x, dz = pos.z - ob.from.z;
        return dx * dx + dz * dz > ob.radius * ob.radius;
      }
    }
  }

  private hasAll(want: readonly string[]): boolean {
    for (const w of want) if (!this.items.includes(w)) return false;
    return true;
  }

  private advance(done: ObjectiveDef, pos: Vec2): void {
    const def = this.defs[this.cur];
    if (done.kind === 'pickUp') {
      for (const it of done.items) this.items.push(it);
      this.hud.carrying = this.items.join(', ');
    } else if (done.kind === 'deliver') {
      for (const it of done.items) { const k = this.items.indexOf(it); if (k >= 0) this.items.splice(k, 1); }
      this.hud.carrying = this.items.join(', ');
    }
    if (done.raiseWantedTo !== undefined) this.opts.raiseWanted?.(Math.min(MAX_STARS, done.raiseWantedTo), pos);
    if (done.doneMessage) this.toast(done.doneMessage, 'info');

    this.obj++;
    this.objElapsed = 0; this.acc = 0; this.outOfCar = 0;
    this.hud.progress = -1;
    if (this.obj >= def.objectives.length) { this.complete(); return; }
    this.setObjectiveHud();
    this.rebuildMarkers();
    this.emit('mission:objective', { id: def.id, index: this.obj, total: def.objectives.length, text: def.objectives[this.obj].text });
    this.syncStatic();
    this.syncDynamic();
  }

  private complete(): void {
    const i = this.cur;
    const d = this.defs[i];
    this.status[i] = 'complete';
    this.cash += d.reward.cash;
    this.cur = -1;
    this.clearRun();
    this.hud.status = 'idle';
    this.hud.cash = this.cash;
    this.toast(`${d.title} done. ${d.reward.message}${d.reward.cash > 0 ? `  +$${d.reward.cash}` : ''}`, 'good');
    this.rebuildMarkers();
    this.syncStatic();
    this.emit('mission:completed', { id: d.id, title: d.title, cash: d.reward.cash, message: d.reward.message, totalCash: this.cash });
    this.opts.persist?.(this.serialize());
  }

  private fail(reason: FailReason): void {
    const i = this.cur;
    const d = this.defs[i];
    this.status[i] = 'failed';
    this.lastFail = reason;
    const msg = FAIL_TEXT[reason];
    this.hud.status = 'failed';
    this.hud.timeLeft = -1;
    this.hud.progress = -1;
    this.hud.retryPrompt = `${this.opts.retryKey ?? 'R'}  Retry   ${this.opts.abandonKey ?? 'X'}  Give up${d.retryHint ? `  ·  ${d.retryHint}` : ''}`;
    this.toast(`${d.title} failed. ${msg}`, 'bad');
    this.markers.length = 0;
    this.markersVersion++;
    this.emit('mission:failed', { id: d.id, title: d.title, reason, message: msg });
  }

  private setObjectiveHud(): void {
    const d = this.defs[this.cur];
    this.hud.objective = d.objectives[this.obj].text;
    this.hud.step = this.obj + 1;
  }

  private syncStatic(): void {
    this.hud.cash = this.cash;
  }

  private syncDynamic(): void {
    const d = this.defs[this.cur];
    let left = Infinity;
    if (d.timeLimit !== undefined) left = Math.min(left, d.timeLimit - this.elapsed);
    const ob = d.objectives[this.obj];
    if (ob.timeLimit !== undefined) left = Math.min(left, ob.timeLimit - this.objElapsed);
    if (this.hourLeft >= 0) left = Math.min(left, this.hourLeft / this.hoursPerSec);
    this.hud.timeLeft = left === Infinity ? -1 : Math.max(0, left);
  }

  private toast(text: string, kind: 'info' | 'good' | 'bad'): void {
    this.hud.toast = text;
    this.hud.toastKind = kind;
    this.hud.toastSeq++;
  }

  private rebuildMarkers(): void {
    this.markers.length = 0;
    if (this.cur < 0) {
      for (let i = 0; i < this.defs.length; i++) {
        if (this.status[i] === 'complete') continue;
        const d = this.defs[i];
        this.markers.push({ id: `${d.id}:giver`, kind: 'giver', x: d.giver.x, z: d.giver.z, radius: d.triggerRadius, color: COLOR_GIVER, label: d.title });
      }
    } else {
      const d = this.defs[this.cur];
      const ob = d.objectives[this.obj];
      const at = ob ? objectivePoint(ob) : null;
      if (at) this.markers.push({ id: `${d.id}:obj${this.obj}`, kind: 'objective', x: at.x, z: at.z, radius: at.r, color: COLOR_GOAL, label: ob.text });
    }
    this.markersVersion++;
  }

  private emit<K extends MissionEventName>(type: K, payload: MissionEvents[K]): void {
    const set = this.listeners.get(type);
    if (set) for (const fn of set) (fn as (p: MissionEvents[K]) => void)(payload);
    this.opts.bus?.emit(type as never, payload as never);
  }
}

const FAIL_TEXT: Record<FailReason, string> = {
  timeUp: 'Too slow.',
  clockUp: 'The party started without you.',
  leftVehicle: 'You ditched the car.',
};

function fmtHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const suffix = hh >= 12 ? 'pm' : 'am';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${suffix}`;
}

function inCircle(p: Vec2, c: Vec2, r: number): boolean {
  const dx = p.x - c.x, dz = p.z - c.z;
  return dx * dx + dz * dz <= r * r;
}

function presenceOk(req: 'onFoot' | 'inVehicle' | 'any', inVehicle: boolean): boolean {
  return req === 'any' || (req === 'inVehicle') === inVehicle;
}

function objectivePoint(ob: ObjectiveDef): { x: number; z: number; r: number } | null {
  switch (ob.kind) {
    case 'goTo': case 'pickUp': case 'deliver': return { x: ob.at.x, z: ob.at.z, r: ob.radius };
    case 'holdSpeedBelow': return ob.at ? { x: ob.at.x, z: ob.at.z, r: ob.radius ?? 5 } : null;
    default: return null;
  }
}
