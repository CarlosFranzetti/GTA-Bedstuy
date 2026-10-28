import { angleDiff, clamp, dist, perpRight, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { TrafficLights } from '@/game/TrafficLights';
import type { Body2D, IVehicle, IWorld2D, LaneGraph, LaneNode, VehicleInput } from '@/world/types';

export type AgentState = 'driving' | 'waiting' | 'backing';

export interface TrafficAgentOptions {
  /** Spawn node: the agent's first target is one of its successors. Otherwise the nearest compatible node is used. */
  startNodeId?: string;
  /** Cops: never wait at stopLine nodes (and never obey signals). */
  ignoreStopLines?: boolean;
  /** Cruise speed by street id (m/s). Default 8. Scaled by a per-driver factor (0.88..1.05). */
  speedForStreet?: (streetId: string) => number;
  /** Fixed cruise speed, overrides speedForStreet (no per-driver variance). */
  cruiseSpeed?: number;
  /** Signal controller. Without it (or at an unsignalised intersection) stop lines behave as stop signs. */
  lights?: TrafficLights;
  /** Pass a stopped car by moving into the adjacent lane when it is clear. Default true. */
  overtake?: boolean;
}

const STEER_GAIN = 2.5;
const ARRIVE_RADIUS = 3;
const STOP_WAIT = 0.8;
const MAX_EXTRA_WAIT = 4;
const INTERSECTION_RADIUS = 9;
const INTERSECTION_CENTER_AHEAD = 7;
const DEFAULT_CRUISE = 8;
/** relative weight of continuing straight over each turn at a fork */
const STRAIGHT_WEIGHT = 5;
const STRAIGHT_ANGLE = 0.35;
/** comfortable braking used to plan stops (fraction of the vehicle's brakeDecel) */
const COMFORT_BRAKE = 0.6;
const STOP_POINT = 2.5;
const SIGNAL_REACTION = 0.4;
const HORN_AFTER = 3;
const HORN_PERIOD = 4;
const HORN_PULSE = 0.3;
const STUCK_AFTER = 8;
const BACK_DISTANCE = 2;
const BACK_MAX_TIME = 1.8;
const OVERTAKE_SHIFT = 3.1;
const OVERTAKE_PARKED_AFTER = 0.8;
const OVERTAKE_STALLED_AFTER = 3;
const OVERTAKE_CLEAR_LEN = 30;
const LATERAL_RATE = 2.5;
const PED_SCAN_PERIOD = 0.1;
const PED_LATERAL = 2.4;

/**
 * Drives a vehicle along the directed lane graph by feeding it VehicleInput.
 * Never reverses an edge: the next target is always a successor of the current node.
 */
export class TrafficAgent {
  state: AgentState = 'driving';
  /** Optional world-space goal: at forks the agent prefers the branch that gets closer to it (cops). */
  goal: Vec2 | null = null;

  private targetId: string | null = null;
  private prevId: string | null = null;
  private waitTimer = 0;
  private extraWait = 0;
  private blockedTime = 0;
  private stuckTime = 0;
  private stuckRetries = 0;
  private ignoreRayTimer = 0;
  private hornClock = 0;
  /** stop line this agent has committed to run (yellow it could not stop for) */
  private goLatch: string | null = null;
  // overtaking
  private lat = 0;
  private latTarget = 0;
  private passBody: Body2D | null = null;
  // backing off
  private backStartX = 0;
  private backStartZ = 0;
  private backTime = 0;
  // pedestrians ahead (throttled query)
  private pedTimer = 0;
  private pedGap = Infinity;
  // next signalled stop line (cached per target)
  private stopAheadFor: string | null = null;
  private stopAhead: LaneNode | null = null;

  private readonly input: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };
  private readonly rayDir: Vec2 = { x: 0, z: -1 };
  private readonly rayFrom: Vec2 = { x: 0, z: 0 };
  private readonly ignoreStop: boolean;
  private readonly speedForStreet?: (streetId: string) => number;
  private readonly fixedCruise?: number;
  private readonly lights?: TrafficLights;
  private readonly canOvertake: boolean;
  /** per-driver cruise factor, derived from the vehicle id so it never touches the shared rng stream */
  private readonly driverMul: number;

  constructor(
    readonly vehicle: IVehicle,
    private readonly lanes: LaneGraph,
    private readonly world: IWorld2D,
    private readonly rng: Rng,
    opts: TrafficAgentOptions = {},
  ) {
    this.ignoreStop = opts.ignoreStopLines ?? false;
    this.speedForStreet = opts.speedForStreet;
    this.fixedCruise = opts.cruiseSpeed;
    this.lights = opts.lights;
    this.canOvertake = opts.overtake ?? true;
    this.driverMul = 0.88 + ((Rng.hash(vehicle.id) % 1000) / 1000) * 0.17;
    const start = opts.startNodeId ? lanes.nodes[opts.startNodeId] : undefined;
    if (start) {
      this.prevId = start.id;
      if (!this.pickNext(start)) this.targetId = start.id;
    } else {
      this.resync();
    }
  }

  get targetNodeId(): string | null { return this.targetId; }
  get previousNodeId(): string | null { return this.prevId; }
  get target(): LaneNode | null { return this.targetId ? this.lanes.nodes[this.targetId] ?? null : null; }
  get isOvertaking(): boolean { return this.passBody !== null; }
  /** current lateral shift to the left of the lane centre (m) */
  get lateralOffset(): number { return this.lat; }

  /** Retarget to the nearest node that lies ahead of the vehicle and roughly along its heading. */
  resync(): void {
    const b = this.vehicle.body;
    const fx = Math.sin(b.heading);
    const fz = -Math.cos(b.heading);
    let best: LaneNode | null = null;
    let bestScore = Infinity;
    for (const id in this.lanes.nodes) {
      const n = this.lanes.nodes[id];
      const dx = n.pos.x - b.pos.x;
      const dz = n.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 80) continue;
      if (Math.abs(angleDiff(b.heading, n.heading)) > 1.0) continue;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.5) continue;
      const score = d + Math.abs(angleDiff(b.heading, n.heading)) * 5;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (!best) {
      // fall back to the plain nearest node
      for (const id in this.lanes.nodes) {
        const n = this.lanes.nodes[id];
        const d = dist(n.pos, b.pos);
        if (d < bestScore) { bestScore = d; best = n; }
      }
    }
    this.targetId = best ? best.id : null;
    this.prevId = null;
    this.state = 'driving';
    this.waitTimer = 0;
    this.extraWait = 0;
    this.goLatch = null;
    this.stuckTime = 0;
    this.blockedTime = 0;
    this.passBody = null;
    this.latTarget = 0;
    this.stopAheadFor = null;
  }

  update(dt: number): void {
    const v = this.vehicle;
    const pos = v.body.pos;
    let node = this.target;
    if (!node) {
      this.resync();
      node = this.target;
      if (!node) { this.hold(); return; }
    }

    if (this.state === 'backing') { this.back(dt); return; }

    if (this.state === 'waiting') {
      this.waitTimer += dt;
      if (!this.releaseFromWait(node, dt)) { this.hold(); this.noteQueued(dt); return; }
      this.state = 'driving';
      this.stuckTime = 0;
      this.pickNext(node);
      node = this.target ?? node;
    }

    // ---- reaching nodes
    const arrive = ARRIVE_RADIUS + 0.15 * Math.max(0, v.speed);
    for (let guard = 0; guard < 3; guard++) {
      node = this.target ?? node;
      if (dist(pos, node.pos) >= arrive) break;
      if (node.stopLine && !this.ignoreStop) {
        if (this.signalGoverned(node)) {
          const ph = this.lights!.phaseFor(node.intersectionId!, node.streetId);
          const committed = this.goLatch === node.id || ph === 'green' || (ph === 'yellow' && v.speed > 2);
          if (!committed) {
            this.state = 'waiting';
            this.waitTimer = 0;
            this.extraWait = 0;
            this.hold();
            return;
          }
          this.goLatch = null;
        } else {
          this.state = 'waiting';
          this.waitTimer = 0;
          this.extraWait = 0;
          this.hold();
          return;
        }
      }
      if (!this.pickNext(node)) break;
    }
    node = this.target ?? node;

    const speed = v.speed;
    const fx = Math.sin(v.body.heading);
    const fz = -Math.cos(v.body.heading);

    // ---- overtaking: ease the lateral shift
    if (this.passBody) {
      const pb = this.passBody;
      const along = (pb.pos.x - pos.x) * fx + (pb.pos.z - pos.z) * fz;
      const half = pb.shape.kind === 'obb' ? pb.shape.halfL : 2.2;
      if (along < -(half + 3.2) || Math.hypot(pb.vel.x, pb.vel.z) > 1.5) { this.passBody = null; this.latTarget = 0; }
    }
    if (this.lat !== this.latTarget) {
      const step = LATERAL_RATE * dt;
      this.lat += clamp(this.latTarget - this.lat, -step, step);
      if (Math.abs(this.lat) < 1e-3 && this.latTarget === 0) this.lat = 0;
    }
    // left of travel: -perpRight(forward)
    const rx = -fz; // perpRight({x: fx, z: fz}) = (-fz, fx)
    const rz = fx;
    const aimX = node.pos.x - rx * this.lat;
    const aimZ = node.pos.z - rz * this.lat;

    // ---- steering
    const dx = aimX - pos.x;
    const dz = aimZ - pos.z;
    const desiredHeading = Math.atan2(dx, -dz);
    const err = angleDiff(v.body.heading, desiredHeading);
    const steer = clamp(STEER_GAIN * err, -1, 1);

    // ---- speed
    const dNode = Math.hypot(node.pos.x - pos.x, node.pos.z - pos.z);
    let desired = this.cruise(node) * clamp(1 - Math.abs(err) / 1.4, 0.35, 1);
    if (this.passBody) desired = Math.min(desired, 7);
    if (node.stopLine && !this.ignoreStop && this.mustStopAt(node, dNode, speed)) {
      const room = Math.max(0, dNode - STOP_POINT);
      desired = Math.min(desired, Math.sqrt(2 * v.spec.brakeDecel * COMFORT_BRAKE * room));
    }

    // ---- pedestrians in the crosswalk / lane ahead
    this.pedTimer -= dt;
    if (this.pedTimer <= 0) {
      this.pedTimer = PED_SCAN_PERIOD;
      this.pedGap = this.scanPeds(fx, fz, speed);
    }
    if (this.pedGap < Infinity) {
      const room = Math.max(0, this.pedGap - 3.2);
      desired = Math.min(desired, Math.sqrt(2 * v.spec.brakeDecel * COMFORT_BRAKE * room));
    }

    // ---- obstacle
    let blocked = false;
    let blocker: Body2D | null = null;
    if (this.ignoreRayTimer > 0) {
      this.ignoreRayTimer -= dt;
    } else {
      const f = Math.max(0, speed);
      this.rayDir.x = fx;
      this.rayDir.z = fz;
      this.rayFrom.x = pos.x - rx * this.lat;
      this.rayFrom.z = pos.z - rz * this.lat;
      const hit = this.world.raycast(this.rayFrom, this.rayDir, 6 + f, v.body.id);
      if (hit) { blocked = true; blocker = hit.body; }
    }
    if (blocked) {
      desired = 0;
      if (Math.abs(speed) < 0.3) {
        this.blockedTime += dt;
        this.tryOvertake(blocker!, fx, fz, rx, rz, node);
      }
      if (this.passBody && this.lat > 0.5 && blocker !== this.passBody) {
        // something else is in the passing lane: give up and tuck back in behind the blocker
        this.latTarget = 0;
        this.passBody = null;
      }
    } else {
      this.blockedTime = 0;
    }

    // ---- stuck detection / honking
    const wantsToMove = desired > 0.5 || blocked;
    const queuedForSignal = this.signalQueueAhead();
    if (Math.abs(speed) < 0.3 && wantsToMove && this.pedGap === Infinity && !queuedForSignal) this.stuckTime += dt;
    else if (Math.abs(speed) > 1) { this.stuckTime = 0; this.stuckRetries = 0; }
    else if (this.pedGap < Infinity || queuedForSignal) this.stuckTime = Math.max(0, this.stuckTime - dt);

    const inp = this.input;
    inp.horn = false;
    if (this.stuckTime > HORN_AFTER && blocked) {
      this.hornClock += dt;
      if (this.hornClock >= HORN_PERIOD) this.hornClock -= HORN_PERIOD;
      inp.horn = this.hornClock < HORN_PULSE;
      if (this.stuckTime - dt <= HORN_AFTER) { this.hornClock = 0; inp.horn = true; }
    } else {
      this.hornClock = 0;
    }
    if (this.stuckTime > STUCK_AFTER) {
      this.stuckTime = 0;
      this.stuckRetries++;
      if (this.stuckRetries >= 2) { this.ignoreRayTimer = 2; this.stuckRetries = 0; }
      this.beginBacking();
      this.back(dt);
      return;
    }

    inp.steer = steer;
    inp.handbrake = false;
    if (desired <= 0.01) {
      inp.throttle = 0;
      inp.brake = true;
    } else if (speed < desired) {
      inp.throttle = clamp((desired - speed) * 0.6, 0.15, 1);
      inp.brake = false;
    } else if (speed > desired + 1) {
      inp.throttle = 0;
      inp.brake = true;
    } else {
      inp.throttle = 0;
      inp.brake = false;
    }
    v.setInput(inp);
  }

  // ------------------------------------------------------------------ signals

  /** True when this stop line is governed by a working signal (otherwise it is a stop sign). */
  private signalGoverned(node: LaneNode): boolean {
    return !!this.lights && !!node.intersectionId && this.lights.hasSignal(node.intersectionId);
  }

  /**
   * Should the vehicle plan to stop at this stop line? Stop signs: always. Signals: on red, and on yellow when
   * it can still stop comfortably. A yellow it cannot stop for latches the node so the car carries through.
   */
  private mustStopAt(node: LaneNode, d: number, speed: number): boolean {
    if (!this.signalGoverned(node)) return true;
    if (this.goLatch === node.id) return false;
    const ph = this.lights!.phaseFor(node.intersectionId!, node.streetId);
    if (ph === 'green') return false;
    const room = Math.max(0, d - STOP_POINT);
    const s = Math.max(0, speed);
    const brakeDist = (s * s) / (2 * this.vehicle.spec.brakeDecel * COMFORT_BRAKE);
    if (ph === 'yellow') {
      if (room > brakeDist * 1.1 + 1) return true;
      this.goLatch = node.id;
      return false;
    }
    // red
    if (s > 1 && room < brakeDist * 0.5) { this.goLatch = node.id; return false; } // already in the box: clear it
    return true;
  }

  /** Waiting at a stop line: may we go? */
  private releaseFromWait(node: LaneNode, dt: number): boolean {
    if (this.signalGoverned(node)) {
      const ph = this.lights!.phaseFor(node.intersectionId!, node.streetId);
      if (ph !== 'green' || this.waitTimer < SIGNAL_REACTION) { this.extraWait = 0; return false; }
      if (this.intersectionClear(node, true)) return true;
      this.extraWait += dt;
      return this.extraWait >= MAX_EXTRA_WAIT;
    }
    if (this.waitTimer < STOP_WAIT) return false;
    if (this.intersectionClear(node, false)) return true;
    this.extraWait += dt;
    return this.extraWait >= MAX_EXTRA_WAIT;
  }

  /** The next stop line ahead (following single-successor chains) and whether it is currently not green. */
  private signalQueueAhead(): boolean {
    if (!this.lights || this.ignoreStop) return false;
    const t = this.target;
    if (!t) return false;
    if (this.stopAheadFor !== t.id) {
      this.stopAheadFor = t.id;
      this.stopAhead = null;
      let n: LaneNode | undefined = t;
      for (let i = 0; i < 6 && n; i++) {
        if (n.stopLine) { this.stopAhead = n; break; }
        const adj: number[] | undefined = this.lanes.adjacency[n.id];
        if (!adj || adj.length !== 1) break;
        n = this.lanes.nodes[this.lanes.edges[adj[0]].to];
      }
    }
    const s = this.stopAhead;
    if (!s || !this.signalGoverned(s)) return false;
    return this.lights.phaseFor(s.intersectionId!, s.streetId) !== 'green';
  }

  private noteQueued(dt: number): void {
    this.stuckTime = 0;
    this.blockedTime = 0;
    this.hornClock = 0;
    void dt;
  }

  // ------------------------------------------------------------------ pedestrians

  /** Distance to the nearest pedestrian in the lane ahead (crosswalk or jaywalker), or Infinity. */
  private scanPeds(fx: number, fz: number, speed: number): number {
    const pos = this.vehicle.body.pos;
    const reach = 7 + Math.max(0, speed) * 1.2;
    const c = { x: pos.x + fx * reach * 0.5, z: pos.z + fz * reach * 0.5 };
    const list = this.world.queryCircle(c, reach * 0.5 + PED_LATERAL);
    let best = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.kind !== 'ped' && b.kind !== 'player') continue;
      const rx = b.pos.x - pos.x;
      const rz = b.pos.z - pos.z;
      const along = rx * fx + rz * fz;
      if (along < 0.5 || along > reach) continue;
      const lateral = Math.abs(rx * -fz + rz * fx);
      if (lateral > PED_LATERAL) continue;
      if (along < best) best = along;
    }
    return best;
  }

  // ------------------------------------------------------------------ overtaking / backing

  private tryOvertake(blocker: Body2D, fx: number, fz: number, rx: number, rz: number, node: LaneNode): void {
    if (!this.canOvertake || this.passBody || this.state !== 'driving') return;
    if (this.lights && this.signalQueueAhead()) return;
    const sp = Math.hypot(blocker.vel.x, blocker.vel.z);
    if (sp > 0.5) return;
    const parked = (blocker.userData as { driver?: unknown } | undefined)?.driver === null;
    const wait = parked ? OVERTAKE_PARKED_AFTER : OVERTAKE_STALLED_AFTER;
    if (this.blockedTime < wait) return;
    // no passing right before a stop line (a queue) or while the target is one we must stop at
    const pos = this.vehicle.body.pos;
    if (node.stopLine && dist(pos, node.pos) < 24) return;
    // adjacent lane clear for a car length and a bit
    const from = { x: pos.x - rx * OVERTAKE_SHIFT, z: pos.z - rz * OVERTAKE_SHIFT };
    const dir = { x: fx, z: fz };
    if (this.world.raycast(from, dir, OVERTAKE_CLEAR_LEN, this.vehicle.body.id)) return;
    const ahead = { x: from.x + fx * 8, z: from.z + fz * 8 };
    const near = this.world.queryCircle(ahead, 3);
    for (let i = 0; i < near.length; i++) {
      const b = near[i];
      if (b.id === this.vehicle.body.id || b === blocker) continue;
      if (b.kind === 'vehicle' || b.kind === 'cop' || b.kind === 'player' || b.kind === 'ped') return;
    }
    this.passBody = blocker;
    this.latTarget = OVERTAKE_SHIFT;
    this.blockedTime = 0;
  }

  private beginBacking(): void {
    this.state = 'backing';
    this.backStartX = this.vehicle.body.pos.x;
    this.backStartZ = this.vehicle.body.pos.z;
    this.backTime = 0;
    this.passBody = null;
    this.latTarget = 0;
  }

  /** Reverse about BACK_DISTANCE metres, then resume. */
  private back(dt: number): void {
    const v = this.vehicle;
    this.backTime += dt;
    const moved = Math.hypot(v.body.pos.x - this.backStartX, v.body.pos.z - this.backStartZ);
    const bx = -Math.sin(v.body.heading);
    const bz = Math.cos(v.body.heading);
    const behind = this.world.raycast(v.body.pos, { x: bx, z: bz }, 2.8, v.body.id);
    if (moved >= BACK_DISTANCE || this.backTime >= BACK_MAX_TIME || behind) {
      this.state = 'driving';
      this.stuckTime = 0;
      this.blockedTime = 0;
      this.hold();
      return;
    }
    const inp = this.input;
    inp.throttle = -0.6;
    inp.steer = 0;
    inp.brake = false;
    inp.handbrake = false;
    inp.horn = false;
    v.setInput(inp);
  }

  // ------------------------------------------------------------------ misc

  private cruise(node: LaneNode): number {
    if (this.fixedCruise !== undefined) return this.fixedCruise;
    const base = this.speedForStreet ? this.speedForStreet(node.streetId) : DEFAULT_CRUISE;
    return base * this.driverMul;
  }

  private hold(): void {
    const inp = this.input;
    inp.throttle = 0;
    inp.steer = 0;
    inp.brake = true;
    inp.handbrake = false;
    inp.horn = false;
    this.vehicle.setInput(inp);
  }

  /**
   * True when nobody is crossing the intersection ahead of a stop line. Stop signs also wait for anybody parked in
   * the middle; signals only for moving cross traffic (a red-runner), so a stalled car cannot lock up the grid.
   */
  private intersectionClear(stop: LaneNode, movingOnly: boolean): boolean {
    const cx = stop.pos.x + Math.sin(stop.heading) * INTERSECTION_CENTER_AHEAD;
    const cz = stop.pos.z - Math.cos(stop.heading) * INTERSECTION_CENTER_AHEAD;
    const list = this.world.queryCircle({ x: cx, z: cz }, INTERSECTION_RADIUS);
    const selfId = this.vehicle.body.id;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.id === selfId) continue;
      if (b.kind !== 'vehicle' && b.kind !== 'cop' && b.kind !== 'player') continue;
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if (movingOnly) {
        if (sp > 2) {
          // moving across our path (not along it)
          const align = Math.abs(Math.sin(b.heading) * Math.sin(stop.heading) + Math.cos(b.heading) * Math.cos(stop.heading));
          if (align < 0.6) return false;
        }
        continue;
      }
      const near = Math.hypot(b.pos.x - cx, b.pos.z - cz) < 5;
      if (sp > 0.5 || near) return false;
    }
    return true;
  }

  /** Choose the next target among the successors of `from` (never anything else, so edges are never reversed). */
  private pickNext(from: LaneNode): boolean {
    const adj = this.lanes.adjacency[from.id];
    if (!adj || adj.length === 0) return false;
    let edgeIdx = adj[0];
    if (adj.length > 1) {
      if (this.goal) edgeIdx = this.bestEdgeToGoal(adj, this.goal);
      else edgeIdx = this.weightedEdge(from, adj);
    }
    const e = this.lanes.edges[edgeIdx];
    this.prevId = from.id;
    this.targetId = e.to;
    return true;
  }

  /** Random successor, weighted toward going straight. */
  private weightedEdge(from: LaneNode, adj: number[]): number {
    let total = 0;
    const w: number[] = [];
    for (let i = 0; i < adj.length; i++) {
      const n = this.lanes.nodes[this.lanes.edges[adj[i]].to];
      const wi = Math.abs(angleDiff(from.heading, n.heading)) < STRAIGHT_ANGLE ? STRAIGHT_WEIGHT : 1;
      w.push(wi);
      total += wi;
    }
    let r = this.rng.next() * total;
    for (let i = 0; i < adj.length; i++) {
      r -= w[i];
      if (r < 0) return adj[i];
    }
    return adj[adj.length - 1];
  }

  private bestEdgeToGoal(adj: number[], goal: Vec2): number {
    let best = adj[0];
    let bestD = Infinity;
    for (let i = 0; i < adj.length; i++) {
      let n = this.lanes.nodes[this.lanes.edges[adj[i]].to];
      // follow single-successor chains so that we judge the branch by where it leads
      for (let s = 0; s < 10; s++) {
        const a2 = this.lanes.adjacency[n.id];
        if (!a2 || a2.length !== 1) break;
        n = this.lanes.nodes[this.lanes.edges[a2[0]].to];
      }
      const d = dist(n.pos, goal);
      if (d < bestD) { bestD = d; best = adj[i]; }
    }
    return best;
  }
}

// keep perpRight in the import list for callers that want the same lateral convention
export const lateralLeft = (fwd: Vec2): Vec2 => { const r = perpRight(fwd); return { x: -r.x, z: -r.z }; };
