/**
 * WP2: signal controller for the real street network. Same public surface as `game/TrafficLights` (phaseFor / walk state /
 * update / secondsUntilGreen / phaseTimeLeft / state), keyed by cluster id `n{minNode}` (what the lane graph puts in
 * `LaneNode.intersectionId`). Phases are groups of approach legs (signalPhases.ts) instead of "ns / ew".
 *
 * Plan per cluster: group 0 green, yellow (3 s), all red (1 s), group 1 green, ... one common structure, timing from
 * SIGNAL_TIMING (avenue x street 45 / 30, avenue x avenue 40 / 35, three-phase clusters 24 per avenue group, 20 per street
 * group). Green wave exactly as the grid does it: group 0 starts `((x - minX) + (z - minZ)) / waveSpeed` s into the cycle,
 * x, z the cluster centroid, minima over all signalised clusters.
 *
 * Pedestrians: a crosswalk across a leg of group g shows WALK during the green of group g + 1 (parallel traffic), for the green
 * minus the time to cross the roadway at `clearanceSpeed` (at least `minWalk`); the rest of that green is the flash.
 *
 * Lookup by street id (what TrafficAgent passes: the stop-line node's streetId) resolves to the group holding a leg of that
 * street; if a street has legs in two groups of one cluster the answer is the most restrictive phase. Use the `*Leg`
 * variants for exact answers.
 */
import type { Vec2 } from '@/core/Math2';
import { SIGNAL_TIMING, type Phase, type WalkState } from '@/game/TrafficLights';
import { clusterId, junctionClusters } from './clusters';
import type { Derived } from './derive';
import type { RoadNet } from './RoadNet';
import { clusterIsSignal, signalGroups, type ControlTruth } from './signalPhases';

export type { Phase, WalkState };

export interface RealGroupState {
  /** approach legs (ids into Derived.legs) */
  legs: readonly number[];
  phase: Phase;
  /** pedestrian signal for a crosswalk across a leg of this group */
  walk: WalkState;
}

export interface RealSignalState {
  intersectionId: string;
  center: Vec2;
  groups: RealGroupState[];
}

interface Plan {
  id: string;
  center: Vec2;
  groups: number[][];
  streetsOfGroup: Array<Set<string>>;
  green: number[];
  /** start of each group's green within the cycle */
  starts: number[];
  roadWidth: number[];
  cycle: number;
  start: number;
}

const isAve = (c: string): boolean => c === 'avenue' || c === 'arterial';

export class RealTrafficLights {
  private time = 0;
  private readonly plans = new Map<string, Plan>();
  private readonly legIndex = new Map<string, Map<number, number>>();
  private readonly states: RealSignalState[] = [];
  private readonly stateById = new Map<string, RealSignalState>();

  constructor(net: RoadNet, d: Derived, control: readonly ControlTruth[], startTime = 0) {
    this.time = startTime;
    const T = SIGNAL_TIMING;
    const cand: Array<{ cluster: number[]; groups: number[][]; center: Vec2 }> = [];
    for (const cluster of junctionClusters(net, d)) {
      if (!clusterIsSignal(net, d, cluster, control)) continue;
      const groups = signalGroups(net, d, cluster);
      const c = cluster.reduce((a, v) => ({ x: a.x + net.nodes[v].p.x / cluster.length, z: a.z + net.nodes[v].p.z / cluster.length }), { x: 0, z: 0 });
      cand.push({ cluster, groups, center: c });
    }
    let minX = Infinity;
    let minZ = Infinity;
    for (const c of cand) { minX = Math.min(minX, c.center.x); minZ = Math.min(minZ, c.center.z); }
    for (const { cluster, groups, center } of cand) {
      const ave = groups.map((g) => g.some((id) => isAve(net.edges[d.legs[id].edge].cls)));
      const green = groups.map((_, i) => {
        if (groups.length === 2) {
          if (ave[0] && ave[1]) return i === 0 ? T.nsAveGreen : T.ewAveGreen;
          if (ave[0] !== ave[1]) return ave[i] ? T.avenueGreen : T.streetGreen;
          return T.streetGreen;
        }
        // three phases: shorter greens keep the cycle near the grid's 83 s so no approach waits more than a minute on red
        return ave[i] ? 24 : 20;
      });
      const starts: number[] = [];
      let t = 0;
      for (const g of green) { starts.push(t); t += g + T.yellow + T.allRed; }
      const cycle = t;
      const wave = ((center.x - minX) + (center.z - minZ)) / T.waveSpeed;
      const id = clusterId(cluster);
      const plan: Plan = {
        id, center, groups, green, starts, cycle,
        streetsOfGroup: groups.map((g) => new Set(g.map((l) => net.streetIdOf(d.legs[l].edge)))),
        roadWidth: groups.map((g) => Math.max(...g.map((l) => net.edges[d.legs[l].edge].width))),
        start: ((wave % cycle) + cycle) % cycle,
      };
      this.plans.set(id, plan);
      const lm = new Map<number, number>();
      groups.forEach((g, gi) => { for (const l of g) lm.set(l, gi); });
      this.legIndex.set(id, lm);
      const st: RealSignalState = { intersectionId: id, center, groups: groups.map((g) => ({ legs: g, phase: 'red', walk: 'dont' })) };
      this.states.push(st);
      this.stateById.set(id, st);
    }
    this.refresh();
  }

  /** Advance the clock. Call exactly once per frame. */
  update(dt: number): void {
    if (!(dt > 0)) return;
    this.time += dt;
    this.refresh();
  }

  get clock(): number { return this.time; }

  hasSignal(id: string): boolean { return this.plans.has(id); }

  get intersectionIds(): string[] { return [...this.plans.keys()]; }

  cycleLength(id: string): number { return this.plans.get(id)?.cycle ?? 0; }

  /** seconds into the cycle at which group 0's green begins (the green-wave offset) */
  offsetOf(id: string): number { return this.plans.get(id)?.start ?? 0; }

  /** seconds into the cluster's own cycle (0 = group 0 green begins) */
  localTime(id: string): number {
    const p = this.plans.get(id);
    return p ? this.local(p) : 0;
  }

  /** number of phase groups of a signalised cluster (0 when unsignalised) */
  groupCount(id: string): number { return this.plans.get(id)?.groups.length ?? 0; }

  /** approach legs per phase of a signalised cluster */
  groupsOf(id: string): readonly (readonly number[])[] { return this.plans.get(id)?.groups ?? []; }

  /** which phase group a leg belongs to (-1 when unknown) */
  groupOfLeg(id: string, leg: number): number { return this.legIndex.get(id)?.get(leg) ?? -1; }

  // ---------------------------------------------------------------- by leg (exact)

  phaseForLeg(id: string, leg: number): Phase {
    const p = this.plans.get(id);
    const g = this.groupOfLeg(id, leg);
    if (!p || g < 0) return 'green';
    return this.phaseOf(p, g, this.local(p));
  }

  walkStateForLeg(id: string, leg: number): WalkState {
    const p = this.plans.get(id);
    const g = this.groupOfLeg(id, leg);
    if (!p || g < 0) return 'walk';
    return this.walkOf(p, g, this.local(p));
  }

  secondsUntilGreenLeg(id: string, leg: number): number {
    const p = this.plans.get(id);
    const g = this.groupOfLeg(id, leg);
    if (!p || g < 0) return 0;
    return this.untilGreen(p, g, this.local(p));
  }

  phaseTimeLeftLeg(id: string, leg: number): number {
    const p = this.plans.get(id);
    const g = this.groupOfLeg(id, leg);
    if (!p || g < 0) return Infinity;
    return this.timeLeft(p, g, this.local(p));
  }

  // ---------------------------------------------------------------- by street id (TrafficAgent's view)

  /** Signal seen by traffic approaching on `approachStreetId`. Unsignalised clusters are always green. */
  phaseFor(id: string, approachStreetId: string): Phase {
    const p = this.plans.get(id);
    if (!p) return 'green';
    const u = this.local(p);
    const gs = this.groupsOfStreet(p, approachStreetId);
    if (!gs.length) return 'green';
    let worst: Phase = 'green';
    for (const g of gs) {
      const ph = this.phaseOf(p, g, u);
      if (ph === 'red') return 'red';
      if (ph === 'yellow') worst = 'yellow';
    }
    return worst;
  }

  walkFor(id: string, crossingStreetId: string): boolean { return this.walkStateFor(id, crossingStreetId) === 'walk'; }

  walkStateFor(id: string, crossingStreetId: string): WalkState {
    const p = this.plans.get(id);
    if (!p) return 'walk';
    const gs = this.groupsOfStreet(p, crossingStreetId);
    if (!gs.length) return 'walk';
    const u = this.local(p);
    let out: WalkState = 'walk';
    for (const g of gs) {
      const w = this.walkOf(p, g, u);
      if (w === 'dont') return 'dont';
      if (w === 'flash') out = 'flash';
    }
    return out;
  }

  secondsUntilGreen(id: string, approachStreetId: string): number {
    const p = this.plans.get(id);
    if (!p) return 0;
    const gs = this.groupsOfStreet(p, approachStreetId);
    if (!gs.length) return 0;
    const u = this.local(p);
    return Math.max(...gs.map((g) => this.untilGreen(p, g, u)));
  }

  phaseTimeLeft(id: string, approachStreetId: string): number {
    const p = this.plans.get(id);
    if (!p) return Infinity;
    const gs = this.groupsOfStreet(p, approachStreetId);
    if (!gs.length) return Infinity;
    const u = this.local(p);
    return Math.min(...gs.map((g) => this.timeLeft(p, g, u)));
  }

  /** Live per-cluster state for rendering. The array and its entries are reused: do not keep references across frames. */
  state(): readonly RealSignalState[] { return this.states; }

  stateOf(id: string): RealSignalState | undefined { return this.stateById.get(id); }

  // ---------------------------------------------------------------- internals

  private groupsOfStreet(p: Plan, streetId: string): number[] {
    const out: number[] = [];
    p.streetsOfGroup.forEach((s, g) => { if (s.has(streetId)) out.push(g); });
    return out;
  }

  private local(p: Plan): number {
    const u = (this.time - p.start) % p.cycle;
    return u < 0 ? u + p.cycle : u;
  }

  private phaseOf(p: Plan, g: number, u: number): Phase {
    const s = p.starts[g];
    if (u >= s && u < s + p.green[g]) return 'green';
    if (u >= s + p.green[g] && u < s + p.green[g] + SIGNAL_TIMING.yellow) return 'yellow';
    return 'red';
  }

  private walkOf(p: Plan, g: number, u: number): WalkState {
    const T = SIGNAL_TIMING;
    const w = (g + 1) % p.groups.length; // parallel traffic is the next group
    const e = u - p.starts[w];
    if (e < 0 || e >= p.green[w]) return 'dont';
    const walkLen = Math.max(T.minWalk, p.green[w] - p.roadWidth[g] / T.clearanceSpeed);
    return e < walkLen ? 'walk' : 'flash';
  }

  private untilGreen(p: Plan, g: number, u: number): number {
    const s = p.starts[g];
    if (u >= s && u < s + p.green[g]) return 0;
    return u < s ? s - u : p.cycle - u + s;
  }

  private timeLeft(p: Plan, g: number, u: number): number {
    const T = SIGNAL_TIMING;
    const s = p.starts[g];
    if (u < s) return s - u;
    if (u < s + p.green[g]) return s + p.green[g] - u;
    if (u < s + p.green[g] + T.yellow) return s + p.green[g] + T.yellow - u;
    return p.cycle - u + s;
  }

  private refresh(): void {
    for (const st of this.states) {
      const p = this.plans.get(st.intersectionId)!;
      const u = this.local(p);
      st.groups.forEach((gs, g) => { gs.phase = this.phaseOf(p, g, u); gs.walk = this.walkOf(p, g, u); });
    }
  }
}
