import { angleDiff, clamp, dist, forwardFromHeading, perpRight, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { GridModel, IVehicle, IWorld2D, VehicleInput } from '@/world/types';
import type { SignalLights } from '@/game/TrafficLights';
import { TrafficAgent } from './TrafficAgent';

const CHASE_SPEED = 20;
const OFF_DUTY_SPEED = 11;
const RAM_ENTER = 35;
const RAM_EXIT = 45;
const GOAL_REFRESH = 0.5;
/** PIT: only at this many stars, and only against a target that is actually moving */
export const PIT_STARS = 3;
const PIT_MIN_TARGET_SPEED = 4;
/** distance behind the target at which the cop lines up before striking */
const PIT_TRAIL_GAP = 9;
const PIT_STRIKE_NEAR = 2;
const PIT_STRIKE_FAR = 15;
const PIT_STRIKE_LATERAL = 4;
/** the rear quarter: behind the target's centre and offset to the side the cop arrives on */
const PIT_QUARTER_BACK = 1.9;
const PIT_QUARTER_SIDE = 1.0;

/** What the cop knows about its quarry (all optional: without it the cop simply charges). */
export interface CopTarget {
  heading: number;
  vel: Vec2;
  /** wanted level */
  stars: number;
}

export interface PitAim { aim: Vec2; phase: 'trail' | 'strike'; }

/**
 * PIT manoeuvre geometry: trail the target from directly behind, and once lined up behind its rear quarter,
 * aim at the quarter (not the centre) so the cop's nose pushes the rear sideways and spins the car.
 */
export function pitAim(cop: Vec2, target: Vec2, targetForward: Vec2): PitAim {
  const right = perpRight(targetForward);
  const rx = cop.x - target.x;
  const rz = cop.z - target.z;
  const along = rx * targetForward.x + rz * targetForward.z; // negative: behind
  const lateral = rx * right.x + rz * right.z;
  const lined = along <= -PIT_STRIKE_NEAR && along >= -PIT_STRIKE_FAR && Math.abs(lateral) <= PIT_STRIKE_LATERAL;
  if (lined) {
    const side = lateral >= 0 ? 1 : -1;
    return {
      phase: 'strike',
      aim: {
        x: target.x - targetForward.x * PIT_QUARTER_BACK + right.x * side * PIT_QUARTER_SIDE,
        z: target.z - targetForward.z * PIT_QUARTER_BACK + right.z * side * PIT_QUARTER_SIDE,
      },
    };
  }
  return {
    phase: 'trail',
    aim: {
      x: target.x - targetForward.x * PIT_TRAIL_GAP + right.x * clamp(lateral, -1.5, 1.5) * 0.5,
      z: target.z - targetForward.z * PIT_TRAIL_GAP + right.z * clamp(lateral, -1.5, 1.5) * 0.5,
    },
  };
}

/**
 * Cop driver. Far from the target it follows the lane graph (ignoring stop lines) toward the lane node nearest
 * the target; within 35 m it steers straight at the target at full throttle. With `pursuing = false` it drives
 * like ordinary traffic (random turns, siren off).
 */
export class CopAgent {
  pursuing = true;
  private ramming = false;
  private goalTimer = 0;
  private readonly lane: TrafficAgent;
  private readonly offDuty: TrafficAgent;
  private readonly input: VehicleInput = { throttle: 0, steer: 0, brake: false, handbrake: false, horn: false };

  private pitPhase: PitAim['phase'] | null = null;

  /**
   * `lights`: off-duty cops obey signals like any driver; a pursuing cop never does (siren on).
   */
  constructor(readonly vehicle: IVehicle, private readonly grid: GridModel, world: IWorld2D, lights?: SignalLights) {
    const rng = new Rng(vehicle.id);
    this.lane = new TrafficAgent(vehicle, grid.lanes, world, rng, { ignoreStopLines: true, cruiseSpeed: CHASE_SPEED });
    this.offDuty = new TrafficAgent(vehicle, grid.lanes, world, rng, { cruiseSpeed: OFF_DUTY_SPEED, lights });
    vehicle.siren = true;
  }

  get isRamming(): boolean { return this.ramming; }
  /** 'trail' while lining up behind a 3-star target, 'strike' while aiming at its rear quarter, else null. */
  get pit(): PitAim['phase'] | null { return this.pitPhase; }
  /** The lane follower currently in charge (exposed for tests/debug). */
  get laneAgent(): TrafficAgent { return this.lane; }

  setPursuing(on: boolean): void {
    if (on === this.pursuing) return;
    this.pursuing = on;
    this.vehicle.siren = on;
    this.ramming = false;
    this.pitPhase = null;
    this.goalTimer = 0;
    (on ? this.lane : this.offDuty).resync();
  }

  update(dt: number, target: Vec2, quarry?: CopTarget): void {
    const v = this.vehicle;
    if (!this.pursuing) {
      v.siren = false;
      this.offDuty.update(dt);
      return;
    }
    v.siren = true;
    const d = dist(v.body.pos, target);
    if (!this.ramming && d < RAM_ENTER) this.ramming = true;
    else if (this.ramming && d > RAM_EXIT) { this.ramming = false; this.pitPhase = null; this.lane.resync(); this.goalTimer = 0; }

    if (this.ramming) {
      const tSpeed = quarry ? Math.hypot(quarry.vel.x, quarry.vel.z) : 0;
      let aim = target;
      this.pitPhase = null;
      if (quarry && quarry.stars >= PIT_STARS && tSpeed >= PIT_MIN_TARGET_SPEED) {
        const fwd = tSpeed > 2 ? { x: quarry.vel.x / tSpeed, z: quarry.vel.z / tSpeed } : forwardFromHeading(quarry.heading);
        const p = pitAim(v.body.pos, target, fwd);
        aim = p.aim;
        this.pitPhase = p.phase;
      }
      const err = angleDiff(v.body.heading, Math.atan2(aim.x - v.body.pos.x, -(aim.z - v.body.pos.z)));
      const inp = this.input;
      inp.steer = clamp(2.5 * err, -1, 1);
      inp.throttle = Math.abs(err) > 1.4 ? 0.5 : 1;
      if (this.pitPhase === 'trail') {
        // match the target's pace while lining up (a little faster to close the gap)
        const want = tSpeed + 3;
        inp.throttle = Math.abs(err) > 1.4 ? 0.5 : v.speed < want ? 1 : 0.2;
      }
      inp.brake = false;
      inp.handbrake = false;
      inp.horn = false;
      v.setInput(inp);
      return;
    }

    this.goalTimer -= dt;
    if (this.goalTimer <= 0) {
      this.goalTimer = GOAL_REFRESH;
      this.lane.goal = this.grid.nearestLaneNode(target).pos;
    }
    this.lane.update(dt);
  }
}
