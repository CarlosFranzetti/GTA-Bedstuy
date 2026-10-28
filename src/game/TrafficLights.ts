/**
 * Signal controller for every signalised intersection (any intersection where at least one street is an avenue).
 *
 * Two-phase NYC-style plan, one common cycle length so that the offsets stay coherent across the whole grid:
 *
 *   main green -> main yellow (3 s) -> all red (1 s) -> cross green -> cross yellow (3 s) -> all red (1 s)
 *
 *   avenue x street : avenue green 45 s, street green 30 s            (cycle 83 s)
 *   avenue x avenue : north-south avenue 40 s, east-west avenue 35 s  (cycle 83 s)
 *
 * Green wave: the north-south (ns) green of an intersection starts `((x - minX) + (z - minZ)) / 12` seconds into
 * the cycle. Southbound platoons at 12 m/s therefore meet each next ns green as it begins, and because the
 * east-west green follows the ns green by a fixed amount, eastbound platoons on the ew avenues do too.
 *
 * Pedestrians: WALK is shown on the roadway being crossed while the parallel street has green, for the green
 * minus a clearance interval (roadway width at 1.2 m/s); the remainder of that green is the flashing DON'T WALK.
 * Whoever has stepped off on WALK finishes on the flash: the clearance is at least as long as the crossing.
 */
import type { Vec2 } from '@/core/Math2';
import type { GridModel } from '@/world/types';

export type Phase = 'green' | 'yellow' | 'red';
export type WalkState = 'walk' | 'flash' | 'dont';

export const SIGNAL_TIMING = {
  avenueGreen: 45,
  streetGreen: 30,
  /** ave x ave: ns avenue / ew avenue greens (keeps the common 83 s cycle) */
  nsAveGreen: 40,
  ewAveGreen: 35,
  yellow: 3,
  allRed: 1,
  /** green-wave design speed, m/s */
  waveSpeed: 12,
  /** assumed walking speed used to size the flashing DON'T WALK, m/s */
  clearanceSpeed: 1.2,
  minWalk: 7,
} as const;

export interface SignalState {
  intersectionId: string;
  center: Vec2;
  nsStreetId: string;
  ewStreetId: string;
  /** phase seen by traffic travelling on the ns street / the ew street */
  ns: Phase;
  ew: Phase;
  /** pedestrian signal for a crosswalk that crosses the ns roadway / the ew roadway */
  walkAcrossNs: WalkState;
  walkAcrossEw: WalkState;
}

interface Plan {
  id: string;
  center: Vec2;
  nsStreetId: string;
  ewStreetId: string;
  nsRoadWidth: number;
  ewRoadWidth: number;
  gNS: number;
  gEW: number;
  cycle: number;
  /** time (s, global clock) at which the ns green begins, within [0, cycle) */
  start: number;
}

export type LightsGrid = Pick<GridModel, 'intersections' | 'streetById'>;

export class TrafficLights {
  private time = 0;
  private readonly plans = new Map<string, Plan>();
  private readonly states: SignalState[] = [];
  private readonly stateById = new Map<string, SignalState>();

  constructor(grid: LightsGrid, startTime = 0) {
    this.time = startTime;
    const intersections = grid.intersections ?? [];
    let minX = Infinity;
    let minZ = Infinity;
    for (const it of intersections) {
      minX = Math.min(minX, it.center.x);
      minZ = Math.min(minZ, it.center.z);
    }
    const T = SIGNAL_TIMING;
    for (const it of intersections) {
      const ns = grid.streetById(it.nsStreetId);
      const ew = grid.streetById(it.ewStreetId);
      const nsAve = ns.class === 'avenue';
      const ewAve = ew.class === 'avenue';
      if (!nsAve && !ewAve) continue; // no signal: stop-sign behaviour
      let gNS: number;
      let gEW: number;
      if (nsAve && ewAve) { gNS = T.nsAveGreen; gEW = T.ewAveGreen; }
      else if (nsAve) { gNS = T.avenueGreen; gEW = T.streetGreen; }
      else { gNS = T.streetGreen; gEW = T.avenueGreen; }
      const cycle = gNS + gEW + 2 * (T.yellow + T.allRed);
      const wave = ((it.center.x - minX) + (it.center.z - minZ)) / T.waveSpeed;
      const plan: Plan = {
        id: it.id,
        center: it.center,
        nsStreetId: it.nsStreetId,
        ewStreetId: it.ewStreetId,
        nsRoadWidth: ns.roadWidth,
        ewRoadWidth: ew.roadWidth,
        gNS,
        gEW,
        cycle,
        start: ((wave % cycle) + cycle) % cycle,
      };
      this.plans.set(it.id, plan);
      const st: SignalState = {
        intersectionId: it.id,
        center: it.center,
        nsStreetId: it.nsStreetId,
        ewStreetId: it.ewStreetId,
        ns: 'red',
        ew: 'red',
        walkAcrossNs: 'dont',
        walkAcrossEw: 'dont',
      };
      this.states.push(st);
      this.stateById.set(it.id, st);
    }
    this.refresh();
  }

  /** Advance the clock. Call exactly once per frame (TrafficSystem.update does it). */
  update(dt: number): void {
    if (!(dt > 0)) return;
    this.time += dt;
    this.refresh();
  }

  get clock(): number { return this.time; }

  hasSignal(intersectionId: string): boolean { return this.plans.has(intersectionId); }

  /** Ids of every signalised intersection. */
  get intersectionIds(): string[] { return [...this.plans.keys()]; }

  cycleLength(intersectionId: string): number { return this.plans.get(intersectionId)?.cycle ?? 0; }

  /** Seconds into the cycle at which the ns green begins (the green-wave offset). */
  offsetOf(intersectionId: string): number { return this.plans.get(intersectionId)?.start ?? 0; }

  /** Seconds into the intersection's own cycle (0 = ns green begins). */
  localTime(intersectionId: string): number {
    const p = this.plans.get(intersectionId);
    return p ? this.local(p) : 0;
  }

  /** Signal seen by traffic approaching on `approachStreetId`. Unsignalised intersections are always green. */
  phaseFor(intersectionId: string, approachStreetId: string): Phase {
    const p = this.plans.get(intersectionId);
    if (!p) return 'green';
    const u = this.local(p);
    if (approachStreetId === p.nsStreetId) return this.nsPhase(p, u);
    if (approachStreetId === p.ewStreetId) return this.ewPhase(p, u);
    return 'green';
  }

  /**
   * True while pedestrians may START crossing the roadway of `crossingStreetId` at this intersection (WALK).
   * Unsignalised intersections return true: the caller falls back to its own gap-seeking.
   */
  walkFor(intersectionId: string, crossingStreetId: string): boolean {
    return this.walkStateFor(intersectionId, crossingStreetId) === 'walk';
  }

  walkStateFor(intersectionId: string, crossingStreetId: string): WalkState {
    const p = this.plans.get(intersectionId);
    if (!p) return 'walk';
    return this.walkState(p, this.local(p), crossingStreetId);
  }

  /** Seconds until traffic on `approachStreetId` next gets a green (0 when green now). */
  secondsUntilGreen(intersectionId: string, approachStreetId: string): number {
    const p = this.plans.get(intersectionId);
    if (!p) return 0;
    const u = this.local(p);
    const T = SIGNAL_TIMING;
    const isNs = approachStreetId === p.nsStreetId;
    const greenStart = isNs ? 0 : p.gNS + T.yellow + T.allRed;
    const greenLen = isNs ? p.gNS : p.gEW;
    if (u >= greenStart && u < greenStart + greenLen) return 0;
    return u < greenStart ? greenStart - u : p.cycle - u + greenStart;
  }

  /** Live per-intersection state for rendering. The array and its entries are reused: do not keep references across frames. */
  state(): readonly SignalState[] { return this.states; }

  stateOf(intersectionId: string): SignalState | undefined { return this.stateById.get(intersectionId); }

  // ------------------------------------------------------------------ internals

  private local(p: Plan): number {
    const u = (this.time - p.start) % p.cycle;
    return u < 0 ? u + p.cycle : u;
  }

  private nsPhase(p: Plan, u: number): Phase {
    if (u < p.gNS) return 'green';
    if (u < p.gNS + SIGNAL_TIMING.yellow) return 'yellow';
    return 'red';
  }

  private ewPhase(p: Plan, u: number): Phase {
    const T = SIGNAL_TIMING;
    const s = p.gNS + T.yellow + T.allRed;
    if (u < s) return 'red';
    if (u < s + p.gEW) return 'green';
    if (u < s + p.gEW + T.yellow) return 'yellow';
    return 'red';
  }

  private walkState(p: Plan, u: number, crossingStreetId: string): WalkState {
    const T = SIGNAL_TIMING;
    // crossing the ns roadway is parallel to the ew street: it needs the ew green
    const acrossNs = crossingStreetId === p.nsStreetId;
    if (!acrossNs && crossingStreetId !== p.ewStreetId) return 'walk';
    const road = acrossNs ? p.nsRoadWidth : p.ewRoadWidth;
    const greenStart = acrossNs ? p.gNS + T.yellow + T.allRed : 0;
    const greenLen = acrossNs ? p.gEW : p.gNS;
    const e = u - greenStart;
    if (e < 0 || e >= greenLen) return 'dont';
    const walkLen = Math.max(T.minWalk, greenLen - road / T.clearanceSpeed);
    return e < walkLen ? 'walk' : 'flash';
  }

  private refresh(): void {
    for (let i = 0; i < this.states.length; i++) {
      const st = this.states[i];
      const p = this.plans.get(st.intersectionId)!;
      const u = this.local(p);
      st.ns = this.nsPhase(p, u);
      st.ew = this.ewPhase(p, u);
      st.walkAcrossNs = this.walkState(p, u, p.nsStreetId);
      st.walkAcrossEw = this.walkState(p, u, p.ewStreetId);
    }
  }
}
