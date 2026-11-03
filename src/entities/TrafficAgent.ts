import { angleDiff, clamp, dist, type Vec2 } from '@/core/Math2';
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
/** braking planned for a pedestrian ahead is gentler than for a stop line: people step out and flee toward the car */
const PED_BRAKE = 0.4;
const STOP_POINT = 2.5;
/** the hardest braking a driver commits to when deciding whether a yellow can still be stopped for */
const YELLOW_BRAKE = 0.85;
const SIGNAL_REACTION = 0.4;
const BLOCK_GRACE = 0.5;
const HORN_AFTER = 3;
const HORN_PERIOD = 4;
const HORN_PULSE = 0.3;
const STUCK_AFTER = 8;
/** wedged against a thin static (a signal pole) there is nothing to wait for: back out with a lock after this long */
const STUCK_AFTER_POLE = 2.5;
const POLE_MAX_RADIUS = 0.5;
const BACK_DISTANCE = 2;
const BACK_MAX_TIME = 1.8;
/** steering lock (|input|) used when backing out of a repeated wedge */
const BACK_LOCK_MIN = 0.6;
const BACK_LOCK_MAX = 1;
const OVERTAKE_SHIFT = 3.1;
const OVERTAKE_PARKED_AFTER = 0.8;
const OVERTAKE_STALLED_AFTER = 3;
const OVERTAKE_CLEAR_LEN = 60;
const LATERAL_RATE = 2.5;
const PED_SCAN_PERIOD = 0.1;
const PED_LATERAL = 2.4;
/** a car shifting into the passing lane creeps (m/s) until its body is this far (plus both half widths) off the blocker */
const PASS_CREEP = 1.2;
const PASS_CLEARANCE = 0.4;
/** the swing-out aim point: beside the blocker, this far back from its nose and this far beyond the clearance */
const PASS_AIM_BACK = 0.5;
const PASS_AIM_EXTRA = 0.3;
/** the lane offset still to travel above which the obstacle ray is also cast along the line the car is moving onto */
const OFFSET_RAY_MIN = 0.3;
/** a blocker moving faster than this is not "stalled": nobody starts a pass around it */
const PASS_BLOCKER_MAX_SPEED = 0.3;
const PASS_REAR_CLEAR = 10;
/** oncoming traffic is fast and a pass is slow: look this far down the passing lane, on three lines across the car */
const PASS_ATTEMPT_PERIOD = 0.25;
const PASS_LANE_LINES = [2.4, 3.1, 3.9] as const;
/** turning: speed through the box, and how sharp a turn counts */
const TURN_SPEED = 6;
const TURN_SPEED_FAST = 13;
const TURN_MIN = 0.6;
/** left turns yield to oncoming traffic that reaches the middle of the box within this many seconds */
const LEFT_YIELD_TTC = 3.5;
const LEFT_YIELD_WIDTH = 7;
/** a car waiting at the same green launches at about this acceleration; only the head of the queue (within this range of the box) counts */
const LAUNCH_ACCEL = 3;
const QUEUE_HEAD_RANGE = 22;
const LAUNCH_SPEED = 8;
/** the gap a left turn needs shrinks the longer it has waited (never below LEFT_YIELD_MIN_TTC); a hopeless wait ends after TURN_MAX_WAIT */
const LEFT_YIELD_MIN_TTC = 2.2;
const LEFT_YIELD_RELAX = 0.2;
const TURN_MAX_WAIT = 25;
const TURN_PED_MAX_WAIT = 20;
const TURN_CHECK_PERIOD = 0.1;
/** the cone toward the target node is scanned for pedestrians once the car is turning toward it */
const TURN_SCAN_ERR = 0.3;
const TURN_SCAN_DIST = 24;
/** the obstacle ray leans toward the target by this fraction of the heading error (max RAY_LEAD_MAX rad) */
/** the flank rays run this fraction of the half width off the centre line */
const FLANK_RAY = 0.75;
/** a car (slower than FLANK_PED_SPEED) waits while a pedestrian is within FLANK_PED_MARGIN of its body */
const FLANK_PED_SPEED = 2.5;
const FLANK_PED_MARGIN = 1;
const FLANK_HOLD_MAX = 6;
const FLANK_IGNORE_FOR = 5;
/** do not block the box: a stop line is not entered while the exit lane is jammed this far past the box edge; a hopeless wait ends after BOX_JAM_MAX */
const BOX_EXIT_LOOKAHEAD = 9;
/** a parked car that the path to the aim point clears by this much (on top of both half widths) is not a blocker, even when a ray grazes it */
const PARKED_PATH_MARGIN = 0.3;
const BOX_EXIT_LATERAL = 2.6;
const BOX_JAM_SPEED = 1;
const BOX_JAM_MAX = 8;
const BOX_JAM_CHECK_PERIOD = 0.2;
/** an intersection is never a place to stand: blocked this long inside the box, the loser of a mutual block backs out */
const BOX_RADIUS = 16;
const BOX_YIELD_AFTER = 1.2;
const BOX_YIELD_AFTER_STRAIGHT = 3;
const BOX_YIELD_HOLD = 2.5;
const BOX_CROSS_ANGLE = 0.6;
const RAY_LEAD = 0.7;
const RAY_LEAD_MIN = 0.1;
const RAY_LEAD_MAX = 0.5;

/** Bodies whose agent is currently passing a stalled car: two queue cars must never pass side by side. */
const PASSING = new WeakSet<Body2D>();

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
  private blockGrace = 0;
  private lastBlocker: Body2D | null = null;
  private stuckTime = 0;
  private stuckRetries = 0;
  private backSteer = 0;
  private resyncAfterBack = false;
  private ignoreRayTimer = 0;
  private hornClock = 0;
  /** stop line this agent has committed to run (yellow it could not stop for) */
  private goLatch: string | null = null;
  /** stop line this agent has decided to stop at (so a yellow decision does not flip as it closes in) */
  private stopLatch: string | null = null;
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
  private pedFlank = false;
  private flankHold = 0;
  private flankIgnore = 0;
  // turn preview at the stop line this agent is approaching (chosen early so left turns can yield)
  private preFrom: string | null = null;
  private preEdge = 0;
  private preTurn = 0;
  /** signed heading change of the leg being driven (negative = left) */
  private legTurn = 0;
  private turnTimer = 0;
  private turnBlocked = false;
  private turnPed = false;
  private turnWait = 0;
  private passTimer = 0;
  // do-not-block-the-box: exit lane jammed beyond the stop line being approached
  private jamTimer = 0;
  private jamBlocked = false;
  private jamWait = 0;
  /** after yielding inside the box: stand still until this runs out so the other car can clear */
  private yieldHold = 0;
  // next signalled stop line (cached per target)
  private stopAheadFor: string | null = null;
  private stopAhead: LaneNode | null = null;

  private readonly input: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };
  private readonly rayDir: Vec2 = { x: 0, z: -1 };
  private readonly rayFrom: Vec2 = { x: 0, z: 0 };
  private readonly scratch: Vec2 = { x: 0, z: 0 };
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

  /** Called when the owner stops driving this agent (despawn, stolen): clears the shared passing flag. */
  release(): void { this.endPass(); }

  private startPass(blocker: Body2D): void {
    this.passBody = blocker;
    this.latTarget = OVERTAKE_SHIFT;
    PASSING.add(this.vehicle.body);
  }

  private endPass(): void {
    this.passBody = null;
    this.latTarget = 0;
    PASSING.delete(this.vehicle.body);
  }

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
    this.stopLatch = null;
    this.stuckTime = 0;
    this.blockedTime = 0;
    this.blockGrace = 0;
    this.lastBlocker = null;
    this.endPass();
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

    this.turnTimer -= dt;
    this.jamTimer -= dt;
    if (this.state === 'backing') { this.back(dt); return; }

    if (this.state === 'waiting') {
      this.waitTimer += dt;
      if (!this.releaseFromWait(node, dt)) { this.hold(); this.noteQueued(); return; }
      this.state = 'driving';
      this.stuckTime = 0;
      this.pickNext(node);
      node = this.target ?? node;
    }

    if (node.stopLine) this.previewTurn(node);

    // ---- reaching nodes
    const arrive = ARRIVE_RADIUS + 0.15 * Math.max(0, v.speed);
    for (let guard = 0; guard < 3; guard++) {
      node = this.target ?? node;
      if (dist(pos, node.pos) >= arrive) break;
      if (node.stopLine && !this.ignoreStop) {
        let stop = true;
        if (this.signalGoverned(node)) {
          const ph = this.lights!.phaseFor(node.intersectionId!, node.streetId);
          const committed = this.goLatch === node.id || ph === 'green' ||
            (ph === 'yellow' && this.stopLatch !== node.id && v.speed > 2);
          if (committed) { this.goLatch = null; stop = false; }
        }
        // green or not, a left turn waits for oncoming traffic and any turn waits for a pedestrian on the exit crosswalk
        if (!stop && (this.turnConflict(node, true) || this.exitJammed(node, true))) stop = true;
        if (stop) {
          this.state = 'waiting';
          this.waitTimer = 0;
          this.extraWait = 0;
          this.turnWait = 0;
          this.jamWait = 0;
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
      if (along < -(half + 3.2) || Math.hypot(pb.vel.x, pb.vel.z) > 1.5) this.endPass();
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
    let aimXs = aimX;
    let aimZs = aimZ;
    if (this.passBody) {
      // swinging round the car being passed: aim at the road beside it, not at a lane node 20 m away
      const pb = this.passBody;
      const sx = pb.pos.x - pos.x;
      const sz = pb.pos.z - pos.z;
      const hL = pb.shape.kind === 'obb' ? pb.shape.halfL : 2.2;
      const hW = pb.shape.kind === 'obb' ? pb.shape.halfW : 1;
      const mL = v.body.shape.kind === 'obb' ? v.body.shape.halfL : 2.2;
      const mW = v.body.shape.kind === 'obb' ? v.body.shape.halfW : 1;
      const clearSide = hW + mW + PASS_CLEARANCE;
      if (sx * fx + sz * fz > -(hL + mL) && Math.abs(sx * rx + sz * rz) < clearSide) {
        aimXs = pb.pos.x + fx * (hL - PASS_AIM_BACK) - rx * (clearSide + PASS_AIM_EXTRA);
        aimZs = pb.pos.z + fz * (hL - PASS_AIM_BACK) - rz * (clearSide + PASS_AIM_EXTRA);
      }
    }
    const dx = aimXs - pos.x;
    const dz = aimZs - pos.z;
    const desiredHeading = Math.atan2(dx, -dz);
    const err = angleDiff(v.body.heading, desiredHeading);
    const steer = clamp(STEER_GAIN * err, -1, 1);

    // ---- speed
    const dNode = Math.hypot(node.pos.x - pos.x, node.pos.z - pos.z);
    let desired = this.cruise(node) * clamp(1 - Math.abs(err) / 1.4, 0.35, 1);
    if (this.passBody) {
      desired = Math.min(desired, 7);
      // creep until the body (not the lane-offset target) has really cleared the car being passed
      const pb = this.passBody;
      const rel = this.scratch;
      rel.x = pb.pos.x - pos.x;
      rel.z = pb.pos.z - pos.z;
      const along = rel.x * fx + rel.z * fz;
      const side = Math.abs(rel.x * rx + rel.z * rz);
      const halfL = pb.shape.kind === 'obb' ? pb.shape.halfL : 2.2;
      const halfW = pb.shape.kind === 'obb' ? pb.shape.halfW : 1;
      const myHalfW = v.body.shape.kind === 'obb' ? v.body.shape.halfW : 1;
      const myHalfL = v.body.shape.kind === 'obb' ? v.body.shape.halfL : 2.2;
      if (along > -(halfL + myHalfL) && side < halfW + myHalfW + PASS_CLEARANCE) desired = Math.min(desired, PASS_CREEP);
    }
    // cops and runaways ignore the lines but still have to get round the corner: a faster limit than civilians use
    const turnSpeed = this.ignoreStop ? TURN_SPEED_FAST : TURN_SPEED;
    if (node.stopLine) {
      const room = Math.max(0, dNode - STOP_POINT);
      if (!this.ignoreStop && (this.mustStopAt(node, dNode, speed) || (dNode < 45 && (this.turnConflict(node, false) || this.exitJammed(node, false))))) {
        desired = Math.min(desired, Math.sqrt(2 * v.spec.brakeDecel * COMFORT_BRAKE * room));
      }
      // slow for the turn before entering the box
      if (this.preFrom === node.id && Math.abs(this.preTurn) > TURN_MIN) {
        desired = Math.min(desired, Math.sqrt(turnSpeed * turnSpeed + 2 * v.spec.brakeDecel * COMFORT_BRAKE * room));
      }
    }
    if (Math.abs(this.legTurn) > TURN_MIN) desired = Math.min(desired, turnSpeed);

    // ---- pedestrians in the crosswalk / lane ahead
    this.pedTimer -= dt;
    if (this.pedTimer <= 0) {
      this.pedTimer = PED_SCAN_PERIOD;
      this.pedGap = this.scanPeds(fx, fz, speed);
      this.pedFlank = speed < FLANK_PED_SPEED && this.pedBesideBody(fx, fz);
      if ((Math.abs(err) > TURN_SCAN_ERR || Math.abs(this.legTurn) > TURN_MIN) && dNode < TURN_SCAN_DIST) {
        // mid-turn: the crosswalk the car is about to cross lies toward the target node, not along the heading
        const inv = 1 / Math.max(dNode, 0.1);
        const toward = this.scanPeds(dx * inv, dz * inv, speed, dNode + 2);
        if (toward < this.pedGap) this.pedGap = toward;
      }
    }
    // a pedestrian pressed against the car's front half is not ahead of it by the cone's measure; hold, but a ped whose
    // path runs through the body must not gridlock the street: after FLANK_HOLD_MAX the car creeps on regardless
    if (this.flankIgnore > 0) {
      this.flankIgnore -= dt;
      this.flankHold = 0;
    } else if (this.pedFlank) {
      this.pedGap = Math.min(this.pedGap, 0.1);
      if (Math.abs(speed) < 0.3) this.flankHold += dt;
      if (this.flankHold > FLANK_HOLD_MAX) { this.flankIgnore = FLANK_IGNORE_FOR; this.flankHold = 0; }
    } else {
      this.flankHold = Math.max(0, this.flankHold - dt);
    }
    if (this.pedGap < Infinity) {
      const room = Math.max(0, this.pedGap - 3.2);
      desired = Math.min(desired, Math.sqrt(2 * v.spec.brakeDecel * PED_BRAKE * room));
    }

    // ---- obstacle
    let blocked = false;
    let blocker: Body2D | null = null;
    let creeping = false;
    if (this.ignoreRayTimer > 0) {
      this.ignoreRayTimer -= dt;
    } else {
      const f = Math.max(0, speed);
      const reach = 6 + f;
      // the ray follows where the car is going, not where it points: mid-turn the nose still points past the target
      // lane (toward the parked cars at the kerb) although the steering is already bringing it round
      const lead = Math.abs(err) > RAY_LEAD_MIN ? clamp(err * RAY_LEAD, -RAY_LEAD_MAX, RAY_LEAD_MAX) : 0;
      const aim = v.body.heading + lead;
      this.rayDir.x = Math.sin(aim);
      this.rayDir.z = -Math.cos(aim);
      const halfW = v.body.shape.kind === 'obb' ? v.body.shape.halfW : 1;
      let hit: { body: Body2D; dist: number } | null = null;
      const take = (h: { body: Body2D; dist: number } | null): void => {
        if (!h) return;
        // the car being passed is no obstacle: the car rolls out around it at PASS_CREEP (below the 1.5 m/s impact
        // threshold) until its body has really cleared it
        if (this.passBody && h.body === this.passBody) { creeping = true; return; }
        if (this.clearsPath(h.body, dx, dz)) return;
        if (!hit || h.dist < hit.dist) hit = h;
      };
      // always from the real body (the lane-offset line is only where the body is heading, not where it is) ...
      take(this.world.raycast(pos, this.rayDir, reach, v.body.id));
      // ... a car is wider than its centre line: a car easing back into the lane beside us is hit by neither centre ray,
      // so two more rays run along the flanks of the body
      for (let side = -1; side <= 1; side += 2) {
        this.rayFrom.x = pos.x + rx * halfW * FLANK_RAY * side;
        this.rayFrom.z = pos.z + rz * halfW * FLANK_RAY * side;
        take(this.world.raycast(this.rayFrom, this.rayDir, reach, v.body.id));
      }
      // ... and, while the lateral shift is still being eased in or out, also along the line it is moving onto
      const off = this.latTarget - this.lat;
      if (Math.abs(off) > OFFSET_RAY_MIN) {
        this.rayFrom.x = pos.x - rx * off;
        this.rayFrom.z = pos.z - rz * off;
        take(this.world.raycast(this.rayFrom, this.rayDir, reach, v.body.id));
      }
      if (creeping) desired = Math.min(desired, PASS_CREEP);
      const h = hit as { body: Body2D; dist: number } | null;
      if (h) { blocked = true; blocker = h.body }
    }
    if (blocked) {
      desired = 0;
      this.blockGrace = BLOCK_GRACE;
    } else if (this.blockGrace > 0) {
      this.blockGrace -= dt; // a car creeping up to a stationary one flickers in and out of ray range
    }
    if ((blocked || this.blockGrace > 0) && Math.abs(speed) < 0.6) {
      this.blockedTime += dt;
      if (blocker) this.lastBlocker = blocker;
      this.passTimer -= dt;
      if (this.lastBlocker && this.passTimer <= 0) {
        this.passTimer = PASS_ATTEMPT_PERIOD;
        this.tryOvertake(this.lastBlocker, fx, fz, rx, rz, node);
      }
    } else if (!blocked && this.blockGrace <= 0) {
      this.blockedTime = 0;
      this.lastBlocker = null;
    }
    if (blocked && this.passBody && blocker !== this.passBody) {
      // something else is in the passing lane: give up and tuck back in behind the blocker
      this.endPass();
    }

    // ---- inside the box: never stand there. The loser of a mutual block backs out, then waits for the other to clear
    if (this.yieldHold > 0) {
      this.yieldHold -= dt;
      desired = 0;
    } else if (blocked && blocker && Math.abs(speed) < 0.3 && this.blockedTime > BOX_YIELD_AFTER && this.boxYield(blocker, node)) {
      this.yieldHold = BOX_YIELD_HOLD;
      this.stuckTime = 0;
      this.blockedTime = 0;
      this.beginBacking();
      this.backSteer = 0;
      this.back(dt);
      return;
    }

    // ---- stuck detection / honking
    const wantsToMove = desired > 0.5 || blocked;
    const queuedForSignal = this.signalQueueAhead();
    if (Math.abs(speed) < 0.3 && wantsToMove && this.pedGap === Infinity && !queuedForSignal) this.stuckTime += dt;
    else if (Math.abs(speed) > 1) { this.stuckTime = 0; if (speed > 2) this.stuckRetries = 0; }
    else if (this.pedGap < Infinity || queuedForSignal) this.stuckTime = Math.max(0, this.stuckTime - dt);

    const inp = this.input;
    inp.horn = false;
    if (this.stuckTime > HORN_AFTER && (blocked || this.blockGrace > 0)) {
      this.hornClock += dt;
      if (this.hornClock >= HORN_PERIOD) this.hornClock -= HORN_PERIOD;
      inp.horn = this.hornClock < HORN_PULSE;
      if (this.stuckTime - dt <= HORN_AFTER) { this.hornClock = 0; inp.horn = true; }
    } else {
      this.hornClock = 0;
    }
    const pole = this.lastBlocker !== null && this.lastBlocker.kind === 'static' && this.lastBlocker.shape.kind === 'circle' && this.lastBlocker.shape.r <= POLE_MAX_RADIUS;
    if (this.stuckTime > (pole ? STUCK_AFTER_POLE : STUCK_AFTER)) {
      this.stuckTime = 0;
      this.stuckRetries++;
      if (this.stuckRetries >= 2 || pole) {
        // two plain back-offs returned to the same line (a thin pole, a wedge): back out with a steering lock so the
        // next approach starts from a different heading, then re-pick the nearest forward lane node
        this.ignoreRayTimer = 2;
        this.stuckRetries = 0;
        this.beginBacking();
        this.backSteer = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(BACK_LOCK_MIN, BACK_LOCK_MAX);
        this.resyncAfterBack = true;
      } else {
        this.beginBacking();
      }
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
    const ph = this.lights!.phaseFor(node.intersectionId!, node.streetId);
    if (this.stopLatch === node.id) return ph !== 'green';
    if (this.goLatch === node.id) return false;
    if (ph === 'green') return false;
    const room = Math.max(0, d - STOP_POINT);
    const s = Math.max(0, speed);
    const brakeDist = (s * s) / (2 * this.vehicle.spec.brakeDecel * COMFORT_BRAKE);
    if (ph === 'yellow') {
      // drive on if the line is reached before the yellow ends (or a stop is no longer possible), else stop
      const left = this.lights!.phaseTimeLeft(node.intersectionId!, node.streetId);
      const reach = s > 0.5 ? Math.max(0, d - STOP_POINT) / s : Infinity;
      const canStop = room >= (s * s) / (2 * this.vehicle.spec.brakeDecel * YELLOW_BRAKE);
      if (reach > left && canStop) { this.stopLatch = node.id; return true; }
      this.goLatch = node.id;
      return false;
    }
    // red
    if (s > 1 && room < brakeDist * 0.5) { this.goLatch = node.id; return false; } // already in the box: clear it
    this.stopLatch = node.id;
    return true;
  }

  /** Waiting at a stop line: may we go? */
  private releaseFromWait(node: LaneNode, dt: number): boolean {
    let clear: boolean;
    if (this.signalGoverned(node)) {
      const ph = this.lights!.phaseFor(node.intersectionId!, node.streetId);
      if (ph !== 'green' || this.waitTimer < SIGNAL_REACTION) { this.extraWait = 0; return false; }
      clear = this.intersectionClear(node, true);
    } else {
      if (this.waitTimer < STOP_WAIT) return false;
      clear = this.intersectionClear(node, false);
    }
    if (!clear) {
      this.extraWait += dt;
      if (this.extraWait < MAX_EXTRA_WAIT) return false;
    }
    // the exit lane is full of standing cars: do not park across the box, but do not wait forever either
    if (this.exitJammed(node, false)) {
      this.jamWait += dt;
      if (this.jamWait < BOX_JAM_MAX) return false;
    }
    // oncoming traffic (left turns) and pedestrians on the exit crosswalk: wait, but not forever
    if (this.turnConflict(node, false)) {
      this.turnWait += dt;
      return this.turnWait >= (this.turnPed ? TURN_PED_MAX_WAIT : TURN_MAX_WAIT);
    }
    return true;
  }

  /**
   * True while the turn this agent will make from stop line `node` is not safe: a left turn with oncoming traffic
   * about to reach the box, or any turn with a pedestrian on the stretch toward the exit node. Cached for
   * TURN_CHECK_PERIOD (`fresh` forces a new query).
   */
  private turnConflict(node: LaneNode, fresh: boolean): boolean {
    if (this.preFrom !== node.id) return false;
    if (Math.abs(this.preTurn) < 0.25) return false;
    if (!fresh) {
      if (this.turnTimer > 0) return this.turnBlocked;
    }
    this.turnTimer = TURN_CHECK_PERIOD;
    this.turnPed = this.exitPedConflict(node);
    this.turnBlocked = this.turnPed || this.oncomingConflict(node);
    return this.turnBlocked;
  }

  private oncomingConflict(stop: LaneNode): boolean {
    if (this.preTurn > -TURN_MIN) return false; // only left turns cross the oncoming lane
    const dirx = Math.sin(stop.heading);
    const dirz = -Math.cos(stop.heading);
    const cx = stop.pos.x + dirx * INTERSECTION_CENTER_AHEAD;
    const cz = stop.pos.z + dirz * INTERSECTION_CENTER_AHEAD;
    this.scratch.x = cx + dirx * 18;
    this.scratch.z = cz + dirz * 18;
    const list = this.world.queryCircle(this.scratch, 28);
    const need = Math.max(LEFT_YIELD_MIN_TTC, LEFT_YIELD_TTC - LEFT_YIELD_RELAX * this.turnWait);
    const signalled = this.signalGoverned(stop) && this.lights!.phaseFor(stop.intersectionId!, stop.streetId) === 'green';
    const selfId = this.vehicle.body.id;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.id === selfId) continue;
      if (b.kind !== 'vehicle' && b.kind !== 'cop' && b.kind !== 'player') continue;
      const sp = Math.hypot(b.vel.x, b.vel.z);
      const rx = b.pos.x - cx;
      const rz = b.pos.z - cz;
      const along = rx * dirx + rz * dirz;
      if (along < -4) continue; // already through
      if (Math.abs(rx * -dirz + rz * dirx) > LEFT_YIELD_WIDTH) continue;
      if (sp < 1) {
        // the head of the oncoming queue stands at the same signal (same street, so the same phase): on green it is
        // about to pull away and reaches the box from a standstill
        if (!signalled || along > QUEUE_HEAD_RANGE) continue;
        const d = (b.userData as { driver?: unknown } | undefined)?.driver;
        if (d === null || d === undefined) continue; // parked
      } else if ((b.vel.x * dirx + b.vel.z * dirz) / sp > -0.6) continue; // not coming toward us
      // a car still pulling away keeps accelerating: time to the middle of the box with LAUNCH_ACCEL below LAUNCH_SPEED
      const d0 = Math.max(0, along);
      const ttc = sp < LAUNCH_SPEED
        ? (-sp + Math.sqrt(sp * sp + 2 * LAUNCH_ACCEL * d0)) / LAUNCH_ACCEL
        : d0 / sp;
      if (ttc < need) return true;
    }
    return false;
  }

  /** A pedestrian between the stop line and the exit node of the turn about to be made. */
  private exitPedConflict(stop: LaneNode): boolean {
    const exit = this.lanes.nodes[this.lanes.edges[this.preEdge].to];
    if (!exit) return false;
    const dx = exit.pos.x - stop.pos.x;
    const dz = exit.pos.z - stop.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) return false;
    return this.coneGap(stop.pos, dx / d, dz / d, d + 2, 0) < Infinity;
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

  /**
   * A parked car that sits beside, not on, the line from the car to its aim point: a swinging nose (a wide truck
   * coming out of a turn) makes a ray graze it although the car steers away from it, and then it never gets going.
   */
  private clearsPath(o: Body2D, dx: number, dz: number): boolean {
    if ((o.userData as { driver?: unknown } | undefined)?.driver !== null) return false;
    const len = Math.hypot(dx, dz);
    if (len < 1) return false;
    const b = this.vehicle.body;
    const ux = dx / len;
    const uz = dz / len;
    const rx = o.pos.x - b.pos.x;
    const rz = o.pos.z - b.pos.z;
    if (rx * ux + rz * uz < 0) return false;
    const myHalfW = b.shape.kind === 'obb' ? b.shape.halfW : 1;
    // the parked car's extent across the path: its long side if it lies along the path, else its short side
    let ext = 1;
    if (o.shape.kind === 'obb') {
      const c = Math.abs(Math.cos(o.heading - Math.atan2(ux, -uz)));
      ext = o.shape.halfW * c + o.shape.halfL * Math.sqrt(1 - c * c);
    } else if (o.shape.kind === 'circle') ext = o.shape.r;
    return Math.abs(rx * -uz + rz * ux) > myHalfW + ext + PARKED_PATH_MARGIN;
  }

  /** Past a stop line and still within the box of that intersection. */
  private inBox(): boolean {
    const prev = this.prevId ? this.lanes.nodes[this.prevId] : undefined;
    if (!prev || !prev.stopLine) return false;
    return dist(this.vehicle.body.pos, prev.pos) < BOX_RADIUS;
  }

  /**
   * Blocked by a standing car while inside the box: should this car be the one to back out? A left turn gives way to
   * a car crossing its path; otherwise (and for equal rank) the lower vehicle-id hash gives way, so exactly one of two
   * mutually blocked cars yields. Straight-through cars only yield after a longer wait.
   */
  private boxYield(blocker: Body2D, node: LaneNode): boolean {
    if (this.ignoreStop || !this.inBox()) return false;
    if (blocker.kind !== 'vehicle' && blocker.kind !== 'cop' && blocker.kind !== 'player') return false;
    if (Math.hypot(blocker.vel.x, blocker.vel.z) > 0.5) return false;
    // something is right behind: backing would only trade one wedge for another
    const b = this.vehicle.body;
    const behind = this.world.raycast(b.pos, { x: -Math.sin(b.heading), z: Math.cos(b.heading) }, 3, b.id);
    if (behind) return false;
    const crossing = Math.abs(angleDiff(b.heading, blocker.heading)) > BOX_CROSS_ANGLE;
    const leftTurn = this.legTurn < -TURN_MIN;
    const myHash = Rng.hash(this.vehicle.id);
    const theirHash = Rng.hash(blocker.id);
    if (crossing && leftTurn) return true;
    if (this.blockedTime < BOX_YIELD_AFTER_STRAIGHT) return false;
    void node;
    return myHash < theirHash;
  }

  /**
   * Is the exit lane of the turn about to be made from stop line `node` jammed by standing traffic close behind the
   * box? Entering would park the car across the intersection. Cached for BOX_JAM_CHECK_PERIOD.
   */
  private exitJammed(node: LaneNode, fresh: boolean): boolean {
    if (this.ignoreStop || this.preFrom !== node.id) return false;
    if (!fresh && this.jamTimer > 0) return this.jamBlocked;
    this.jamTimer = BOX_JAM_CHECK_PERIOD;
    this.jamBlocked = false;
    const exit = this.lanes.nodes[this.lanes.edges[this.preEdge].to];
    if (!exit) return false;
    const dirx = Math.sin(exit.heading);
    const dirz = -Math.cos(exit.heading);
    const c = this.scratch;
    c.x = exit.pos.x + dirx * BOX_EXIT_LOOKAHEAD * 0.5;
    c.z = exit.pos.z + dirz * BOX_EXIT_LOOKAHEAD * 0.5;
    const list = this.world.queryCircle(c, BOX_EXIT_LOOKAHEAD * 0.5 + BOX_EXIT_LATERAL);
    const selfId = this.vehicle.body.id;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.id === selfId || (o.kind !== 'vehicle' && o.kind !== 'cop' && o.kind !== 'player')) continue;
      if (Math.hypot(o.vel.x, o.vel.z) > BOX_JAM_SPEED) continue;
      const d = (o.userData as { driver?: unknown } | undefined)?.driver;
      if (d === null || d === undefined) continue; // parked: passed, not queued
      const rx = o.pos.x - exit.pos.x;
      const rz = o.pos.z - exit.pos.z;
      const along = rx * dirx + rz * dirz;
      if (along < -1 || along > BOX_EXIT_LOOKAHEAD) continue;
      if (Math.abs(rx * -dirz + rz * dirx) > BOX_EXIT_LATERAL) continue;
      this.jamBlocked = true;
      break;
    }
    return this.jamBlocked;
  }

  private noteQueued(): void {
    this.stuckTime = 0;
    this.blockedTime = 0;
    this.hornClock = 0;
  }

  // ------------------------------------------------------------------ pedestrians

  /** Distance to the nearest pedestrian in the lane ahead (crosswalk or jaywalker), or Infinity. */
  /** A pedestrian touching or hugging the body: a car starting off would sweep it over. */
  private pedBesideBody(fx: number, fz: number): boolean {
    const b = this.vehicle.body;
    const halfL = b.shape.kind === 'obb' ? b.shape.halfL : 2.2;
    const halfW = b.shape.kind === 'obb' ? b.shape.halfW : 1;
    const list = this.world.queryCircle(b.pos, halfL + FLANK_PED_MARGIN + halfW);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind !== 'ped' && o.kind !== 'player') continue;
      const rx = o.pos.x - b.pos.x;
      const rz = o.pos.z - b.pos.z;
      const along = rx * fx + rz * fz;
      if (along < -(halfL + FLANK_PED_MARGIN) || along > halfL + FLANK_PED_MARGIN) continue;
      if (Math.abs(rx * -fz + rz * fx) <= halfW + FLANK_PED_MARGIN) return true;
    }
    return false;
  }

  private scanPeds(fx: number, fz: number, speed: number, minReach = 0): number {
    const reach = Math.max(minReach, 7 + Math.max(0, speed) * 1.2);
    return this.coneGap(this.vehicle.body.pos, fx, fz, reach, 0.5);
  }

  /** Distance along (fx, fz) from `origin` to the nearest pedestrian within PED_LATERAL of that line, or Infinity. */
  private coneGap(origin: Vec2, fx: number, fz: number, reach: number, minAlong: number): number {
    const c = this.scratch;
    c.x = origin.x + fx * reach * 0.5;
    c.z = origin.z + fz * reach * 0.5;
    const list = this.world.queryCircle(c, reach * 0.5 + PED_LATERAL);
    let best = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.kind !== 'ped' && b.kind !== 'player') continue;
      const rx = b.pos.x - origin.x;
      const rz = b.pos.z - origin.z;
      const along = rx * fx + rz * fz;
      if (along < minAlong || along > reach) continue;
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
    if (sp > PASS_BLOCKER_MAX_SPEED || PASSING.has(blocker)) return;
    const parked = (blocker.userData as { driver?: unknown } | undefined)?.driver === null;
    const wait = parked ? OVERTAKE_PARKED_AFTER : OVERTAKE_STALLED_AFTER;
    if (this.blockedTime < wait) return;
    // no passing right before a stop line (a queue) or while the target is one we must stop at
    const pos = this.vehicle.body.pos;
    if (node.stopLine && dist(pos, node.pos) < 24) return;
    // adjacent lane clear for a car length and a bit
    const from = { x: pos.x - rx * OVERTAKE_SHIFT, z: pos.z - rz * OVERTAKE_SHIFT };
    const dir = { x: fx, z: fz };
    for (let i = 0; i < PASS_LANE_LINES.length; i++) {
      const o = { x: pos.x - rx * PASS_LANE_LINES[i], z: pos.z - rz * PASS_LANE_LINES[i] };
      if (this.world.raycast(o, dir, OVERTAKE_CLEAR_LEN, this.vehicle.body.id)) return;
    }
    // nobody close behind in the passing lane (the car queued behind us may be starting its own pass)
    const back = { x: -fx, z: -fz };
    if (this.world.raycast(from, back, PASS_REAR_CLEAR, this.vehicle.body.id)) return;
    const ahead = { x: from.x + fx * 8, z: from.z + fz * 8 };
    const near = this.world.queryCircle(ahead, 3);
    for (let i = 0; i < near.length; i++) {
      const b = near[i];
      if (b.id === this.vehicle.body.id || b === blocker) continue;
      if (b.kind === 'vehicle' || b.kind === 'cop' || b.kind === 'player' || b.kind === 'ped') return;
    }
    this.startPass(blocker);
    this.blockedTime = 0;
  }

  private beginBacking(): void {
    this.state = 'backing';
    this.backStartX = this.vehicle.body.pos.x;
    this.backStartZ = this.vehicle.body.pos.z;
    this.backTime = 0;
    this.endPass();
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
      if (this.resyncAfterBack) { this.resyncAfterBack = false; this.resync(); }
      this.backSteer = 0;
      return;
    }
    const inp = this.input;
    inp.throttle = -0.6;
    inp.steer = this.backSteer;
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
    this.scratch.x = cx;
    this.scratch.z = cz;
    const list = this.world.queryCircle(this.scratch, INTERSECTION_RADIUS);
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

  /** Decide the turn to make at stop line `from` before reaching it, so a left turn can yield and every turn can slow. */
  private previewTurn(from: LaneNode): void {
    if (this.preFrom === from.id) return;
    const adj = this.lanes.adjacency[from.id];
    if (!adj || adj.length === 0) { this.preFrom = null; return; }
    this.preEdge = this.chooseEdge(from, adj);
    this.preFrom = from.id;
    const to = this.lanes.nodes[this.lanes.edges[this.preEdge].to];
    this.preTurn = to ? angleDiff(from.heading, to.heading) : 0;
    this.turnTimer = 0;
    this.turnBlocked = false;
  }

  private chooseEdge(from: LaneNode, adj: number[]): number {
    if (adj.length === 1) return adj[0];
    if (this.goal) return this.bestEdgeToGoal(adj, this.goal);
    return this.weightedEdge(from, adj);
  }

  /** Choose the next target among the successors of `from` (never anything else, so edges are never reversed). */
  private pickNext(from: LaneNode): boolean {
    const adj = this.lanes.adjacency[from.id];
    if (!adj || adj.length === 0) return false;
    const edgeIdx = this.preFrom === from.id ? this.preEdge : this.chooseEdge(from, adj);
    this.preFrom = null;
    const e = this.lanes.edges[edgeIdx];
    const to = this.lanes.nodes[e.to];
    this.legTurn = to ? angleDiff(from.heading, to.heading) : 0;
    this.prevId = from.id;
    this.targetId = e.to;
    this.stopLatch = null;
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
