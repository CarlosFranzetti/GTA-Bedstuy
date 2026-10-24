import { angleDiff, clamp, dist, type Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { IVehicle, IWorld2D, LaneGraph, LaneNode, VehicleInput } from '@/world/types';

export type AgentState = 'driving' | 'waiting';

export interface TrafficAgentOptions {
  /** Spawn node: the agent's first target is one of its successors. Otherwise the nearest compatible node is used. */
  startNodeId?: string;
  /** Cops: never wait at stopLine nodes. */
  ignoreStopLines?: boolean;
  /** Cruise speed by street id (m/s). Default 8. */
  speedForStreet?: (streetId: string) => number;
  /** Fixed cruise speed, overrides speedForStreet. */
  cruiseSpeed?: number;
}

const STEER_GAIN = 2.5;
const ARRIVE_RADIUS = 3;
const STOP_WAIT = 0.8;
const MAX_EXTRA_WAIT = 4;
const INTERSECTION_RADIUS = 9;
const INTERSECTION_CENTER_AHEAD = 7;
const DEFAULT_CRUISE = 8;

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
  private ignoreRayTimer = 0;
  private readonly input: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };
  private readonly rayDir: Vec2 = { x: 0, z: -1 };
  private readonly ignoreStop: boolean;
  private readonly speedForStreet?: (streetId: string) => number;
  private readonly fixedCruise?: number;

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

    if (this.state === 'waiting') {
      this.waitTimer += dt;
      let go = false;
      if (this.waitTimer >= STOP_WAIT) {
        if (this.intersectionClear(node)) go = true;
        else {
          this.extraWait += dt;
          if (this.extraWait >= MAX_EXTRA_WAIT) go = true;
        }
      }
      if (!go) { this.hold(); return; }
      this.state = 'driving';
      this.pickNext(node);
      node = this.target ?? node;
    }

    const arrive = ARRIVE_RADIUS + 0.15 * Math.max(0, v.speed);
    for (let guard = 0; guard < 3; guard++) {
      node = this.target ?? node;
      if (dist(pos, node.pos) >= arrive) break;
      if (node.stopLine && !this.ignoreStop) {
        this.state = 'waiting';
        this.waitTimer = 0;
        this.extraWait = 0;
        this.hold();
        return;
      }
      if (!this.pickNext(node)) break;
    }
    node = this.target ?? node;

    // ---- steering
    const dx = node.pos.x - pos.x;
    const dz = node.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, -dz);
    const err = angleDiff(v.body.heading, desiredHeading);
    const steer = clamp(STEER_GAIN * err, -1, 1);

    // ---- speed
    const speed = v.speed;
    let desired = this.cruise(node) * clamp(1 - Math.abs(err) / 1.4, 0.35, 1);
    if (node.stopLine && !this.ignoreStop) {
      const room = Math.max(0, d - 2.5);
      desired = Math.min(desired, Math.sqrt(2 * v.spec.brakeDecel * 0.6 * room));
    }

    // ---- obstacle
    let blocked = false;
    if (this.ignoreRayTimer > 0) {
      this.ignoreRayTimer -= dt;
    } else {
      const f = Math.max(0, speed);
      this.rayDir.x = Math.sin(v.body.heading);
      this.rayDir.z = -Math.cos(v.body.heading);
      const hit = this.world.raycast(pos, this.rayDir, 6 + f, v.body.id);
      if (hit) blocked = true;
    }
    if (blocked) {
      desired = 0;
      if (Math.abs(speed) < 0.3) {
        this.blockedTime += dt;
        if (this.blockedTime > 8) { this.ignoreRayTimer = 2; this.blockedTime = 0; }
      }
    } else {
      this.blockedTime = 0;
    }

    const inp = this.input;
    inp.steer = steer;
    inp.handbrake = false;
    inp.horn = false;
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

  private cruise(node: LaneNode): number {
    if (this.fixedCruise !== undefined) return this.fixedCruise;
    return this.speedForStreet ? this.speedForStreet(node.streetId) : DEFAULT_CRUISE;
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

  /** True when no other moving vehicle (or anybody sitting in the middle) is in the intersection ahead of a stop line. */
  private intersectionClear(stop: LaneNode): boolean {
    const cx = stop.pos.x + Math.sin(stop.heading) * INTERSECTION_CENTER_AHEAD;
    const cz = stop.pos.z - Math.cos(stop.heading) * INTERSECTION_CENTER_AHEAD;
    const list = this.world.queryCircle({ x: cx, z: cz }, INTERSECTION_RADIUS);
    const selfId = this.vehicle.body.id;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.id === selfId) continue;
      if (b.kind !== 'vehicle' && b.kind !== 'cop' && b.kind !== 'player') continue;
      const sp = Math.hypot(b.vel.x, b.vel.z);
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
      else edgeIdx = adj[Math.floor(this.rng.next() * adj.length) % adj.length];
    }
    const e = this.lanes.edges[edgeIdx];
    this.prevId = from.id;
    this.targetId = e.to;
    return true;
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
