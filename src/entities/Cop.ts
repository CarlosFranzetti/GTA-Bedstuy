import { angleDiff, clamp, dist, type Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { GridModel, IVehicle, IWorld2D, VehicleInput } from '@/world/types';
import { TrafficAgent } from './TrafficAgent';

const CHASE_SPEED = 20;
const OFF_DUTY_SPEED = 11;
const RAM_ENTER = 35;
const RAM_EXIT = 45;
const GOAL_REFRESH = 0.5;

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

  constructor(readonly vehicle: IVehicle, private readonly grid: GridModel, world: IWorld2D) {
    const rng = new Rng(vehicle.id);
    this.lane = new TrafficAgent(vehicle, grid.lanes, world, rng, { ignoreStopLines: true, cruiseSpeed: CHASE_SPEED });
    this.offDuty = new TrafficAgent(vehicle, grid.lanes, world, rng, { cruiseSpeed: OFF_DUTY_SPEED });
    vehicle.siren = true;
  }

  get isRamming(): boolean { return this.ramming; }
  /** The lane follower currently in charge (exposed for tests/debug). */
  get laneAgent(): TrafficAgent { return this.lane; }

  setPursuing(on: boolean): void {
    if (on === this.pursuing) return;
    this.pursuing = on;
    this.vehicle.siren = on;
    this.ramming = false;
    this.goalTimer = 0;
    (on ? this.lane : this.offDuty).resync();
  }

  update(dt: number, target: Vec2): void {
    const v = this.vehicle;
    if (!this.pursuing) {
      v.siren = false;
      this.offDuty.update(dt);
      return;
    }
    v.siren = true;
    const d = dist(v.body.pos, target);
    if (!this.ramming && d < RAM_ENTER) this.ramming = true;
    else if (this.ramming && d > RAM_EXIT) { this.ramming = false; this.lane.resync(); this.goalTimer = 0; }

    if (this.ramming) {
      const err = angleDiff(v.body.heading, Math.atan2(target.x - v.body.pos.x, -(target.z - v.body.pos.z)));
      const inp = this.input;
      inp.steer = clamp(2.5 * err, -1, 1);
      inp.throttle = Math.abs(err) > 1.4 ? 0.5 : 1;
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
