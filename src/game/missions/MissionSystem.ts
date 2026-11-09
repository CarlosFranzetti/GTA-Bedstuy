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
  DjRequest, FailReason, MissionDef, MissionEventName, MissionEvents, MissionHudState, MissionMarker, MissionSave,
  MissionSignal, ObjectiveDef,
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
  /** Cash reward / stake handed to the player's wallet (CLUB's Inventory.add). Mission `cash` is a running tally either way. */
  pay?: (cash: number) => void;
  /** Progress flag raised on completion (Inventory.setFlag), e.g. 'aftersloth.unlocked'. */
  setFlag?: (id: string) => void;
  /** Labels used in the retry prompt. */
  retryKey?: string;
  abandonKey?: string;
}

const COLOR_GIVER = '#f5c542';
const COLOR_GOAL = '#4ade80';
const COLOR_TARGET = '#fb923c';
const DEFAULT_GAME_HOURS_PER_SECOND = 1 / 60;
const MAX_STARS = 3;
const TALK_RANGE_EXTRA = 1.5;
const CUSTOMER_RANGE = 3;
const CUSTOMER_STAY = 14;
const MAX_GIVER_MARKERS = 4;
const GIVER_REFRESH_S = 4;
const MOVING_MARKER_PERIOD = 0.25;
const TOO_FAST_GRACE = 0.5;
const TOO_FAST_LEAD_IN = 1.5;
const DEFAULT_BANTER_EVERY = 11;
const DEFAULT_TAIL_GRACE = 6;
const CUSTOMER_OFFSETS: readonly (readonly [number, number])[] = [[4, 2], [-4, 3], [3, -4], [-3, -3]];

const wrap24 = (h: number): number => ((h % 24) + 24) % 24;
/** Hour inside [from, to), wrapping midnight when from > to. */
export const inHourWindow = (h: number, from: number, to: number): boolean => {
  const x = wrap24(h), a = wrap24(from), b = to >= 24 ? wrap24(to) : to;
  return a <= b ? x >= a && x < b : x >= a || x < b;
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

type Statuses = 'available' | 'active' | 'complete' | 'failed';

export class MissionSystem {
  /** Tests only: behave as if F were pressed the moment the start prompt appears (the unit suites predate the F rule). */
  static autoPressF = false;
  /** Cash earned from missions (persisted). */
  cash = 0;
  /** Bumps whenever `markers` was rebuilt. */
  markersVersion = 0;
  readonly markers: MissionMarker[] = [];
  /** HUD feed, mutated in place. */
  readonly hud: MissionHudState = {
    status: 'idle', title: '', objective: '', step: 0, steps: 0, timeLeft: -1, progress: -1, carrying: '',
    cash: 0, toastSeq: 0, toast: '', toastKind: 'info', retryPrompt: '', prompt: '', inside: false,
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
  private readonly staked = new Set<string>();

  // per-objective scratch (reset on every objective change)
  private readonly sigs: MissionSignal[] = [];
  private inside: string | null = null;
  private lastHour = -1;
  private lastPos: Vec2 = { x: 0, z: 0 };
  private hasPos = false;
  private talkIdx = 0;
  private presses = 0;
  private done = false;
  private fastFor = 0;
  private banterIdx = 0;
  private banterT = 0;
  private collected: boolean[] = [];
  private bought = new Set<string>();
  private sold = 0;
  private custT = 0;
  private custStay = 0;
  private custAt: Vec2 | null = null;
  private custN = 0;
  private tail = { x: 0, z: 0, leg: 0, engaged: false, atEnd: false, lost: 0, dist: 0, total: 1, moved: 0 };
  private movingT = 0;
  private giverT = 1e9;
  private ringDwell = 0;
  /** Giver whose ring the player stands in and may start with F (-1: none). */
  private pendingStart = -1;
  private stopHintedZone = -1;
  private giverKey = '';

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
  /** Interior the host last reported entering (or null). */
  get insideInterior(): string | null { return this.inside; }

  /** Active DJ set the host should run (venue, length, pass mark), or null. */
  get djRequest(): DjRequest | null {
    if (!this.isActive) return null;
    const ob = this.defs[this.cur].objectives[this.obj];
    if (ob.kind !== 'djSet') return null;
    return { venue: ob.venue, minutes: ob.minutes, minScore: ob.minScore, at: ob.at ?? null, radius: ob.radius ?? 6 };
  }

  /** A mission can be offered right now (prerequisites done, hour window open). */
  isOffered(id: string, hour = this.lastHour): boolean {
    const i = this.indexOf(id);
    return i >= 0 && this.offered(i, hour);
  }

  /** The mission the phone should point at: first story mission on offer, else the first side job. */
  nextOffer(hour = this.lastHour): MissionDef | null {
    let side: MissionDef | null = null;
    for (let i = 0; i < this.defs.length; i++) {
      if (this.status[i] === 'complete' || !this.requiresMet(i)) continue;
      const d = this.defs[i];
      if (d.availableHours && hour >= 0 && !inHourWindow(hour, d.availableHours[0], d.availableHours[1])) continue;
      if ((d.tag ?? 'story') === 'story') return d;
      side ??= d;
    }
    return side;
  }

  /** The host forwards cross-system events here (interiors, shop, DJ game, peds). Safe to call any time. */
  notify(sig: MissionSignal): void {
    if (sig.type === 'interior:entered') { this.inside = sig.id; this.hud.inside = true; }
    else if (sig.type === 'interior:exited' && this.inside === sig.id) { this.inside = null; this.hud.inside = false; }
    if (this.isActive) this.sigs.push(sig);
  }

  /**
   * The host calls this when F is pressed. Returns true when a mission interaction took the press (talk, knock,
   * crank, sell) so the host must not also treat it as enter/exit car.
   */
  interact(pos: Vec2): boolean {
    if (!this.isActive) {
      // F inside a live giver ring (on foot, or the car stopped there) starts the mission whose prompt is showing
      if (this.pendingStart < 0) return false;
      const i = this.pendingStart;
      this.pendingStart = -1;
      this.begin(i, this.lastHour);
      return true;
    }
    const ob = this.defs[this.cur].objectives[this.obj];
    if (ob.kind === 'talkTo') {
      if (!this.reach(pos, ob.at, ob.radius + TALK_RANGE_EXTRA, ob.presence ?? 'onFoot')) return false;
      const line = ob.lines[this.talkIdx];
      this.toast(`${ob.npc}: "${line}"`, 'info');
      this.talkIdx++;
      if (this.talkIdx >= ob.lines.length) this.done = true;
      return true;
    }
    if (ob.kind === 'interact') {
      if (!this.reach(pos, ob.at, ob.radius, ob.presence ?? 'onFoot')) return false;
      this.presses++;
      const need = ob.presses ?? 1;
      this.hud.progress = Math.min(1, this.presses / need);
      if (this.presses >= need) this.done = true;
      return true;
    }
    if (ob.kind === 'pickUp' && ob.prompt !== undefined) {
      if (!this.reach(pos, ob.at, ob.radius, ob.presence)) return false;
      this.done = true;
      return true;
    }
    if (ob.kind === 'sell' && this.custAt && Math.hypot(pos.x - this.custAt.x, pos.z - this.custAt.z) <= CUSTOMER_RANGE) {
      this.sellOne(ob.item);
      return true;
    }
    return false;
  }


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
    if (i < 0 || this.status[i] === 'complete') return false;
    if (this.cur >= 0) {
      // One mission at a time: say so instead of silently ignoring the request or swapping the running one.
      if (this.cur !== i) this.toast(`Finish or give up ${this.defs[this.cur].title} first.`, 'info');
      return false;
    }
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
    const abandonedId = this.defs[i].id;
    this.status[i] = 'available';
    this.armed.fill(false);
    this.cur = -1;
    this.clearRun();
    this.hud.status = 'idle';
    this.hud.retryPrompt = '';
    this.rebuildMarkers();
    this.syncStatic();
    this.emit('mission:abandoned', { id: abandonedId });
    return true;
  }

  // ------------------------------------------------------------------ persistence

  serialize(): MissionSave {
    const completed: string[] = [];
    for (let i = 0; i < this.defs.length; i++) if (this.status[i] === 'complete') completed.push(this.defs[i].id);
    return this.staked.size > 0 ? { v: 1, completed, cash: this.cash, staked: [...this.staked] } : { v: 1, completed, cash: this.cash };
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
    this.staked.clear();
    if (Array.isArray(o.staked)) for (const id of o.staked) if (typeof id === 'string') this.staked.add(id);
    for (let i = 0; i < this.defs.length; i++) if (this.status[i] === 'complete') for (const f of this.defs[i].setFlags ?? []) this.opts.setFlag?.(f);
    this.giverKey = '';
    this.rebuildMarkers();
    return true;
  }

  // ------------------------------------------------------------------ frame

  /**
   * @param dt fixed step, seconds
   * @param pos player (or driven vehicle) position
   * @param speedMps current speed in m/s (holdSpeedBelow and maxKmh need it)
   * @param hour game hour 0..24, or -1 when unknown (disables hour windows and deadlines)
   */
  update(dt: number, pos: Vec2, inVehicle: boolean, wantedStars: number, speedMps = 0, hour = -1): void {
    this.hostInVehicle = inVehicle;
    this.lastHour = hour;
    this.lastPos.x = pos.x; this.lastPos.z = pos.z; this.hasPos = true;
    if (this.cur < 0) { this.checkTriggers(pos, hour, dt, inVehicle, speedMps); return; }
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
    // heat and speed rules
    if (ob.failIfStars !== undefined && wantedStars >= ob.failIfStars) return this.fail('copsCalled');
    if (ob.maxKmh !== undefined && this.objElapsed > TOO_FAST_LEAD_IN) {
      if (speedMps * 3.6 > ob.maxKmh) { this.fastFor += dt; if (this.fastFor > TOO_FAST_GRACE) return this.fail('tooFast'); } else this.fastFor = 0;
    }
    // banter
    if (ob.banter && this.banterIdx < ob.banter.length) {
      this.banterT -= dt;
      if (this.banterT <= 0) {
        this.toast(ob.banter[this.banterIdx++], 'info');
        this.banterT = ob.banterEvery ?? DEFAULT_BANTER_EVERY;
      }
    }

    const tailFail = this.evaluateFailing(ob, pos, dt);
    if (tailFail) return this.fail(tailFail);
    const complete = this.evaluate(ob, pos, inVehicle, wantedStars, speedMps, dt);
    this.sigs.length = 0;
    if (this.cur < 0 || this.status[this.cur] !== 'active') return; // an evaluate-time failure
    this.hud.prompt = this.promptFor(ob, pos);
    if (complete) this.advance(ob, pos);
    else { this.syncDynamic(); this.refreshMoving(dt); }
  }

  // ------------------------------------------------------------------ internals

  private reach(pos: Vec2, at: Vec2, r: number, presence: 'onFoot' | 'inVehicle' | 'any'): boolean {
    return inCircle(pos, at, r) && presenceOk(presence, this.hostInVehicle);
  }
  private hostInVehicle = false;

  private requiresMet(i: number): boolean {
    const req = this.defs[i].requires;
    if (!req) return true;
    for (const id of req) if (this.statusOf(id) !== 'complete') return false;
    return true;
  }

  private offered(i: number, hour: number): boolean {
    if (this.status[i] === 'complete' || !this.requiresMet(i)) return false;
    const w = this.defs[i].availableHours;
    return !(w && hour >= 0 && !inHourWindow(hour, w[0], w[1]));
  }

  private indexOf(id: string): number {
    for (let i = 0; i < this.defs.length; i++) if (this.defs[i].id === id) return i;
    return -1;
  }

  private checkTriggers(pos: Vec2, hour: number, dt: number, inVehicle = false, speedMps = 0): void {
    this.hud.prompt = '';
    this.pendingStart = -1;
    this.giverT += dt;
    const key = this.openKey(hour);
    if (key !== this.giverKey || this.giverT >= GIVER_REFRESH_S) { this.giverKey = key; this.giverT = 0; this.rebuildMarkers(); }
    let inAny = -1;
    for (let i = 0; i < this.defs.length; i++) {
      if (this.status[i] === 'complete' || !this.requiresMet(i)) continue;
      const d = this.defs[i];
      const dx = pos.x - d.giver.x, dz = pos.z - d.giver.z;
      if (dx * dx + dz * dz > d.triggerRadius * d.triggerRadius) {
        if (!this.armed[i]) { this.armed[i] = true; this.giverKey = ''; } // the ring is live again: put its marker back
        continue;
      }
      inAny = i;
      if (!this.armed[i]) continue;
      if (d.availableHours && hour >= 0 && !inHourWindow(hour, d.availableHours[0], d.availableHours[1])) {
        if (this.hintedZone !== i) {
          this.hintedZone = i;
          this.toast(`${d.title}: come back between ${fmtHour(d.availableHours[0])} and ${fmtHour(d.availableHours[1])}.`, 'info');
        }
        continue;
      }
      // Driving or walking through a ring never starts it: on foot the prompt shows at once, in a vehicle the car must be stopped in the ring for a second first; then F starts it.
      if (inVehicle) {
        if (speedMps * 3.6 >= RING_STOP_KMH) {
          this.ringDwell = 0;
          if (this.stopHintedZone !== i) { this.stopHintedZone = i; this.toast(`Stop here to start ${d.title}`, 'info'); }
          continue;
        }
        this.ringDwell += dt;
        if (this.ringDwell < RING_DWELL_S) continue;
      }
      // Standing in the ring (or stopped in it) offers the start; F takes it. Walking or driving through does nothing.
      this.pendingStart = i;
      this.hud.prompt = `F  Start ${d.title}`;
      if (MissionSystem.autoPressF) { this.pendingStart = -1; this.begin(i, hour); }
      return;
    }
    if (inAny < 0) { this.hintedZone = -1; this.stopHintedZone = -1; this.ringDwell = 0; }
  }

  /** Which givers are on offer right now, as a cache key for the marker refresh. */
  private openKey(hour: number): string {
    let k = '';
    for (let i = 0; i < this.defs.length; i++) k += this.offered(i, hour) ? '1' : '0';
    return k;
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
    this.hud.prompt = '';
    let advance = 0;
    if (d.stake && !this.staked.has(d.id)) { this.staked.add(d.id); this.opts.pay?.(d.stake); advance = d.stake; }
    this.enterObjective();
    this.setObjectiveHud();
    this.rebuildMarkers();
    this.toast(advance > 0 ? `Mission started: ${d.title}  +$${advance} advance` : `Mission started: ${d.title}`, 'good');
    this.emit('mission:started', { id: d.id, title: d.title, blurb: d.blurb });
    this.emit('mission:objective', { id: d.id, index: 0, total: d.objectives.length, text: d.objectives[0].text });
    this.checkTwist();
    this.syncStatic();
    this.syncDynamic();
  }

  private clearRun(): void {
    this.obj = 0; this.elapsed = 0; this.objElapsed = 0; this.acc = 0; this.outOfCar = 0; this.items.length = 0;
    this.hourLeft = -1;
    this.sigs.length = 0;
    this.resetObjective();
    this.hud.carrying = '';
    this.hud.timeLeft = -1;
    this.hud.progress = -1;
    this.hud.prompt = '';
  }

  /** Reset the per-objective scratch state. */
  private resetObjective(): void {
    this.talkIdx = 0; this.presses = 0; this.done = false; this.fastFor = 0; this.banterIdx = 0; this.banterT = 0;
    this.collected = []; this.bought = new Set(); this.sold = 0; this.custT = 0; this.custStay = 0; this.custAt = null; this.custN = 0;
    this.movingT = 0;
    this.tail = { x: 0, z: 0, leg: 0, engaged: false, atEnd: false, lost: 0, dist: 0, total: 1, moved: 0 };
  }

  /** Called when an objective becomes the active one (also for objective 0). */
  private enterObjective(): void {
    this.resetObjective();
    const ob = this.defs[this.cur].objectives[this.obj];
    if (ob.kind === 'collect') this.collected = ob.points.map(() => false);
    if (ob.kind === 'tail') {
      const r = ob.route;
      this.tail.x = r[0].x; this.tail.z = r[0].z; this.tail.leg = 0;
      let len = 0;
      for (let i = 1; i < r.length; i++) len += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
      this.tail.total = Math.max(1, len);
    }
  }

  private checkTwist(): void {
    const d = this.defs[this.cur];
    if (d.twist && d.twist.at === this.obj) {
      this.toast(d.twist.text, 'info');
      this.emit('mission:twist', { id: d.id, text: d.twist.text });
    }
  }

  private promptFor(ob: ObjectiveDef, pos: Vec2): string {
    if (ob.kind === 'talkTo') return this.reach(pos, ob.at, ob.radius + TALK_RANGE_EXTRA, ob.presence ?? 'onFoot') ? `F  Talk to ${ob.npc}` : '';
    if (ob.kind === 'interact') return this.reach(pos, ob.at, ob.radius, ob.presence ?? 'onFoot') ? `F  ${ob.prompt}` : '';
    if (ob.kind === 'pickUp' && ob.prompt !== undefined) return this.reach(pos, ob.at, ob.radius, ob.presence) ? `F  ${ob.prompt}` : '';
    if (ob.kind === 'sell' && this.custAt && Math.hypot(pos.x - this.custAt.x, pos.z - this.custAt.z) <= CUSTOMER_RANGE) return `F  Sell ${ob.item}`;
    return '';
  }

  /** Failure rules that live inside objective kinds (losing a tail target). Returns the reason or null. */
  private evaluateFailing(ob: ObjectiveDef, pos: Vec2, dt: number): FailReason | null {
    if (ob.kind !== 'tail') return null;
    const t = this.tail;
    t.dist = Math.hypot(pos.x - t.x, pos.z - t.z);
    if (!t.engaged) { if (t.dist <= ob.maxDistance) t.engaged = true; return null; }
    if (t.atEnd) return null;
    if (t.dist > ob.maxDistance) { t.lost += dt; if (t.lost > (ob.grace ?? DEFAULT_TAIL_GRACE)) return 'lostTarget'; } else t.lost = 0;
    return null;
  }

  private evaluate(ob: ObjectiveDef, pos: Vec2, inVehicle: boolean, stars: number, speedMps: number, dt: number): boolean {
    switch (ob.kind) {
      case 'goTo': return inCircle(pos, ob.at, ob.radius) && presenceOk(ob.presence, inVehicle);
      case 'pickUp':
        if (ob.prompt !== undefined) return this.done;
        return inCircle(pos, ob.at, ob.radius) && presenceOk(ob.presence, inVehicle);
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
      case 'talkTo': case 'interact': return this.done;
      case 'collect': return this.evalCollect(ob, pos, inVehicle);
      case 'tail': return this.evalTail(ob, dt);
      case 'waitUntilHour': {
        if (this.lastHour < 0) return false;
        if (ob.at && !inCircle(pos, ob.at, ob.radius ?? 8)) return false;
        return inHourWindow(this.lastHour, ob.from, ob.to);
      }
      case 'enterInterior': return this.inside === ob.id;
      case 'exitInterior': return this.inside !== ob.id;
      case 'djSet': return this.evalDj(ob);
      case 'buy': return this.evalBuy(ob);
      case 'sell': return this.evalSell(ob, pos, dt);
    }
  }

  private evalCollect(ob: Extract<ObjectiveDef, { kind: 'collect' }>, pos: Vec2, inVehicle: boolean): boolean {
    if (!presenceOk(ob.presence, inVehicle)) return false;
    let left = 0, changed = false;
    for (let i = 0; i < ob.points.length; i++) {
      if (this.collected[i]) continue;
      if (ob.ordered && this.collected.indexOf(false) !== i) { left++; continue; }
      if (inCircle(pos, ob.points[i], ob.radius)) {
        this.collected[i] = true; changed = true;
        this.items.push(ob.item);
      } else left++;
    }
    if (changed) {
      this.hud.carrying = this.items.join(', ');
      this.toast(`${ob.item} ${ob.points.length - left}/${ob.points.length}`, 'good');
      this.rebuildMarkers();
    }
    this.hud.progress = (ob.points.length - left) / ob.points.length;
    return left === 0;
  }

  private evalTail(ob: Extract<ObjectiveDef, { kind: 'tail' }>, dt: number): boolean {
    const t = this.tail, r = ob.route;
    if (t.engaged && !t.atEnd) {
      let step = ob.speed * dt;
      while (step > 0 && t.leg < r.length - 1) {
        const a = r[t.leg + 1];
        const dx = a.x - t.x, dz = a.z - t.z, d = Math.hypot(dx, dz);
        if (d <= step) { t.x = a.x; t.z = a.z; t.leg++; step -= d; t.moved += d; }
        else { t.x += (dx / d) * step; t.z += (dz / d) * step; t.moved += step; step = 0; }
      }
      if (t.leg >= r.length - 1) t.atEnd = true;
    }
    this.hud.progress = Math.min(1, t.moved / t.total);
    const m = this.markers[0];
    if (m && m.id.endsWith('tail')) { m.x = t.x; m.z = t.z; }
    return t.atEnd && t.dist <= ob.maxDistance;
  }

  private evalDj(ob: Extract<ObjectiveDef, { kind: 'djSet' }>): boolean {
    for (const s of this.sigs) {
      if (s.type !== 'dj:setFinished' || s.venue !== ob.venue) continue;
      if (s.minutes !== undefined && s.minutes + 1e-6 < ob.minutes) { this.toast('That set was too short. Run the full time.', 'bad'); continue; }
      if (s.score >= ob.minScore) return true;
      this.fail('lowScore');
      return false;
    }
    return false;
  }

  private evalBuy(ob: Extract<ObjectiveDef, { kind: 'buy' }>): boolean {
    for (const s of this.sigs) {
      if (s.type !== 'shop:bought' || (s.shop !== undefined && s.shop !== ob.shop)) continue;
      if (ob.items.includes(s.recordId) && !this.bought.has(s.recordId)) {
        this.bought.add(s.recordId);
        this.toast(`Bought ${this.bought.size}/${ob.items.length}`, 'good');
      }
    }
    this.hud.progress = this.bought.size / ob.items.length;
    return this.bought.size >= ob.items.length;
  }

  private evalSell(ob: Extract<ObjectiveDef, { kind: 'sell' }>, pos: Vec2, dt: number): boolean {
    for (const s of this.sigs) if (s.type === 'sold' && s.item === ob.item) this.sellOne(ob.item);
    const near = inCircle(pos, ob.at, ob.radius);
    if (this.custAt) {
      this.custStay += dt;
      if (this.custStay > CUSTOMER_STAY || !near) this.dropCustomer();
    } else if (near && this.sold < ob.count) {
      this.custT += dt;
      if (this.custT >= (ob.every ?? 5)) {
        const o = CUSTOMER_OFFSETS[this.custN++ % CUSTOMER_OFFSETS.length];
        this.custAt = { x: ob.at.x + o[0], z: ob.at.z + o[1] };
        this.custStay = 0;
        this.rebuildMarkers();
      }
    }
    this.hud.progress = this.sold / ob.count;
    return this.sold >= ob.count;
  }

  private sellOne(item: string): void {
    const k = this.items.indexOf(item);
    if (k >= 0) this.items.splice(k, 1);
    this.sold++;
    this.hud.carrying = this.items.join(', ');
    this.toast(`Sold ${item}  (${this.sold})`, 'good');
    this.dropCustomer();
  }

  private dropCustomer(): void {
    if (!this.custAt) return;
    this.custAt = null; this.custT = 0; this.custStay = 0;
    this.rebuildMarkers();
  }

  /** Re-publish the markers a few times a second while a target is moving (the 3D view only redraws on a version bump). */
  private refreshMoving(dt: number): void {
    if (this.defs[this.cur].objectives[this.obj].kind !== 'tail') return;
    this.movingT += dt;
    if (this.movingT >= MOVING_MARKER_PERIOD) { this.movingT = 0; this.markersVersion++; }
  }

  private hasAll(want: readonly string[]): boolean {
    for (const w of want) if (!this.items.includes(w)) return false;
    return true;
  }

  private advance(done: ObjectiveDef, pos: Vec2): void {
    const def = this.defs[this.cur];
    if (done.kind === 'pickUp') {
      for (const it of done.items) this.items.push(it);
    } else if (done.kind === 'deliver') {
      for (const it of done.items) { const k = this.items.indexOf(it); if (k >= 0) this.items.splice(k, 1); }
    }
    if (done.grant) for (const it of done.grant) this.items.push(it);
    this.hud.carrying = this.items.join(', ');
    if (done.raiseWantedTo !== undefined) this.opts.raiseWanted?.(Math.min(MAX_STARS, done.raiseWantedTo), pos);
    if (done.doneMessage) this.toast(done.doneMessage, 'info');

    this.obj++;
    this.objElapsed = 0; this.acc = 0; this.outOfCar = 0;
    this.hud.progress = -1;
    this.hud.prompt = '';
    if (this.obj >= def.objectives.length) { this.complete(); return; }
    this.enterObjective();
    this.setObjectiveHud();
    this.rebuildMarkers();
    this.emit('mission:objective', { id: def.id, index: this.obj, total: def.objectives.length, text: def.objectives[this.obj].text });
    this.checkTwist();
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
    this.armed.fill(false); // finishing on top of another giver must not start that job; leave the zone first
    this.hud.status = 'idle';
    this.hud.cash = this.cash;
    this.toast(`${d.title} done. ${d.reward.message}${d.reward.cash > 0 ? `  +$${d.reward.cash}` : ''}`, 'good');
    this.giverKey = '';
    this.rebuildMarkers();
    this.syncStatic();
    if (d.reward.cash > 0) this.opts.pay?.(d.reward.cash);
    if (d.setFlags) for (const f of d.setFlags) this.opts.setFlag?.(f);
    this.emit('mission:completed', { id: d.id, title: d.title, cash: d.reward.cash, message: d.reward.message, totalCash: this.cash });
    this.opts.persist?.(this.serialize());
  }

  private fail(reason: FailReason): void {
    const i = this.cur;
    const d = this.defs[i];
    this.status[i] = 'failed';
    this.lastFail = reason;
    const msg = d.failJoke?.[reason] ?? FAIL_TEXT[reason];
    this.hud.status = 'failed';
    this.hud.timeLeft = -1;
    this.hud.progress = -1;
    this.hud.prompt = '';
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
      const open: number[] = [];
      for (let i = 0; i < this.defs.length; i++) if (this.offered(i, this.lastHour) && !this.deadZone(i)) open.push(i);
      if (open.length > MAX_GIVER_MARKERS) {
        const p = this.lastPos;
        const dist = (i: number): number => Math.hypot(this.defs[i].giver.x - p.x, this.defs[i].giver.z - p.z);
        open.sort((a, b) => dist(a) - dist(b));
        open.length = MAX_GIVER_MARKERS;
        open.sort((a, b) => a - b);
      }
      for (const i of open) {
        const d = this.defs[i];
        this.markers.push({ id: `${d.id}:giver`, kind: 'giver', x: d.giver.x, z: d.giver.z, radius: d.triggerRadius, color: COLOR_GIVER, label: d.title });
      }
    } else if (this.status[this.cur] === 'active') {
      const d = this.defs[this.cur];
      const ob = d.objectives[this.obj];
      this.pushObjectiveMarkers(d.id, ob);
    }
    this.markersVersion++;
  }

  /** The player stands in this giver's ring but it cannot start until they leave and come back (after an abandon or a finish). */
  private deadZone(i: number): boolean {
    if (this.armed[i] || !this.hasPos) return false;
    const d = this.defs[i];
    return inCircle(this.lastPos, d.giver, d.triggerRadius);
  }

  private pushObjectiveMarkers(missionId: string, ob: ObjectiveDef): void {
    const id = `${missionId}:obj${this.obj}`;
    const add = (x: number, z: number, radius: number, suffix = '', color = COLOR_GOAL): void => {
      this.markers.push({ id: id + suffix, kind: 'objective', x, z, radius, color, label: ob.text });
    };
    switch (ob.kind) {
      case 'collect':
        for (let i = 0; i < ob.points.length; i++) {
          if (this.collected[i]) continue;
          if (ob.ordered && this.collected.indexOf(false) !== i) continue;
          add(ob.points[i].x, ob.points[i].z, ob.radius, `:${i}`);
        }
        return;
      case 'tail': add(this.tail.x, this.tail.z, 4, 'tail', COLOR_TARGET); return;
      case 'sell':
        add(ob.at.x, ob.at.z, ob.radius);
        if (this.custAt) add(this.custAt.x, this.custAt.z, 1.5, ':cust', COLOR_TARGET);
        return;
      case 'enterInterior': case 'exitInterior': case 'buy': case 'djSet':
        if (ob.at) add(ob.at.x, ob.at.z, ob.radius ?? 5);
        return;
      case 'waitUntilHour': if (ob.at) add(ob.at.x, ob.at.z, ob.radius ?? 8); return;
      default: {
        const at = objectivePoint(ob);
        if (at) add(at.x, at.z, at.r);
      }
    }
  }

  private emit<K extends MissionEventName>(type: K, payload: MissionEvents[K]): void {
    const set = this.listeners.get(type);
    if (set) for (const fn of set) (fn as (p: MissionEvents[K]) => void)(payload);
    this.opts.bus?.emit(type as never, payload as never);
  }
}

/** A vehicle starts a mission ring only when slower than this (km/h) for RING_DWELL_S seconds. */
const RING_STOP_KMH = 3;
const RING_DWELL_S = 1;

const FAIL_TEXT: Record<FailReason, string> = {
  timeUp: 'Too slow.',
  clockUp: 'The party started without you.',
  leftVehicle: 'You ditched the car.',
  lostTarget: 'You lost them.',
  lowScore: 'The crowd was not feeling it.',
  copsCalled: 'The heat showed up.',
  tooFast: 'Too fast. Easy does it.',
};

function fmtHour(h: number): string {
  const hh = Math.floor(wrap24(h));
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
    case 'goTo': case 'pickUp': case 'deliver': case 'talkTo': case 'interact': return { x: ob.at.x, z: ob.at.z, r: ob.radius };
    case 'holdSpeedBelow': return ob.at ? { x: ob.at.x, z: ob.at.z, r: ob.radius ?? 5 } : null;
    default: return null;
  }
}
